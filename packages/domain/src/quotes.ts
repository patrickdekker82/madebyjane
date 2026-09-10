import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { inTenant } from "../../db/src/index";
import {
  quoteSaveSchema,
  quoteFinalizeSchema,
  type QuoteRecord,
  type QuoteDefinition,
} from "../../contracts/src/quotes";
import { DomainError, type Role } from "./index";
import type { Context } from "./projects";
import { calculateQuote } from "./quote-calculation";
export const canFinance = (role: Role) =>
  ["owner", "admin", "finance"].includes(role);
export class QuoteService {
  constructor(private pool: Pool) {}
  private authorize(ctx: Context) {
    if (!canFinance(ctx.role))
      throw new DomainError(
        "FORBIDDEN",
        "Je hebt geen toegang tot offertes.",
        403,
      );
  }
  private async project(c: PoolClient, project: string) {
    if (
      !(await c.query("SELECT 1 FROM projects WHERE id=$1", [project])).rowCount
    )
      throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
  }
  list(ctx: Context, project: string) {
    this.authorize(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      return {
        items: (
          await c.query(
            "SELECT DISTINCT ON(id) id,version,number,definition,totals,created_at FROM quote_versions WHERE project_id=$1 ORDER BY id,version DESC",
            [project],
          )
        ).rows,
      };
    });
  }
  private async sources(
    c: PoolClient,
    project: string,
    definition: QuoteDefinition,
  ) {
    const changes: {
      lineId: string;
      name: string;
      latestVersionId: string;
      previous: unknown;
      current: unknown;
    }[] = [];
    for (const line of definition.lines)
      if (line.source) {
        const old = (
          await c.query(
            "SELECT definition FROM material_versions WHERE project_id=$1 AND entry_id=$2 AND id=$3",
            [project, line.source.entryId, line.source.versionId],
          )
        ).rows[0];
        if (!old)
          throw new DomainError(
            "INVALID_SOURCE",
            "Materiaalbron niet gevonden in dit project.",
          );
        const latest = (
          await c.query(
            "SELECT id,definition FROM material_versions WHERE project_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 1",
            [project, line.source.entryId],
          )
        ).rows[0];
        if (latest.id !== line.source.versionId)
          changes.push({
            lineId: line.id,
            name: line.description,
            latestVersionId: latest.id,
            previous: old.definition,
            current: latest.definition,
          });
      }
    return changes;
  }
  differences(ctx: Context, project: string, id: string) {
    this.authorize(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      const row = (
        await c.query(
          "SELECT definition FROM quote_versions WHERE project_id=$1 AND id=$2 ORDER BY version DESC LIMIT 1",
          [project, id],
        )
      ).rows[0];
      if (!row)
        throw new DomainError("NOT_FOUND", "Offerte niet gevonden.", 404);
      return { changes: await this.sources(c, project, row.definition) };
    });
  }
  save(ctx: Context, project: string, input: unknown) {
    this.authorize(ctx);
    const v = quoteSaveSchema.parse(input);
    return this.write(
      ctx,
      project,
      v.id,
      v.requestId,
      v.baseVersion,
      v.definition,
    );
  }
  finalize(ctx: Context, project: string, id: string, input: unknown) {
    this.authorize(ctx);
    const v = quoteFinalizeSchema.parse(input);
    return this.write(ctx, project, id, v.requestId, v.baseVersion, null);
  }
  private write(
    ctx: Context,
    project: string,
    id: string,
    requestId: string,
    base: number,
    definition: QuoteDefinition | null,
  ) {
    const hash = createHash("sha256")
      .update(JSON.stringify({ project, id, base, definition }))
      .digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      const replay = (
        await c.query("SELECT * FROM quote_versions WHERE request_id=$1", [
          requestId,
        ])
      ).rows[0];
      if (replay) {
        if (replay.input_hash !== hash || replay.user_id !== ctx.userId)
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Verzoek-ID is al anders gebruikt.",
            409,
          );
        return replay as QuoteRecord;
      }
      const old = (
        await c.query(
          "SELECT * FROM quote_versions WHERE id=$1 ORDER BY version DESC LIMIT 1",
          [id],
        )
      ).rows[0];
      if (old && old.project_id !== project)
        throw new DomainError("NOT_FOUND", "Offerte niet gevonden.", 404);
      if ((old?.version ?? 0) !== base)
        throw new DomainError(
          "VERSION_CONFLICT",
          "Offerte gewijzigd. Open de nieuwste versie.",
          409,
        );
      if (old?.number)
        throw new DomainError(
          "QUOTE_FROZEN",
          "Deze offerte is definitief. Maak een nieuw concept.",
          409,
        );
      if (
        !old &&
        (
          await c.query(
            "SELECT count(DISTINCT id)::int AS n FROM quote_versions WHERE project_id=$1",
            [project],
          )
        ).rows[0].n >= 100
      )
        throw new DomainError(
          "QUOTE_LIMIT",
          "Maximaal 100 offertes per project.",
          409,
        );
      const value = definition ?? old?.definition;
      if (!value)
        throw new DomainError("NOT_FOUND", "Offerte niet gevonden.", 404);
      // Share the material publication lock so changes cannot slip through finalization.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":materials:" + project,
      ]);
      const differences = await this.sources(c, project, value);
      let number: string | null = null;
      if (!definition) {
        if (!value.lines.length)
          throw new DomainError(
            "EMPTY_QUOTE",
            "Voeg eerst een offerteregel toe.",
          );
        if (differences.length)
          throw new DomainError(
            "STALE_SOURCE",
            "Materiaalkeuzes zijn gewijzigd. Controleer de verschillen en werk het concept bij.",
            409,
          );
        const year = Number(value.date.slice(0, 4));
        const sequence = (
          await c.query(
            "INSERT INTO quote_sequences VALUES($1,$2,1) ON CONFLICT(organization_id,year) DO UPDATE SET value=quote_sequences.value+1 RETURNING value",
            [ctx.organizationId, year],
          )
        ).rows[0].value;
        number = `${year}-${String(sequence).padStart(5, "0")}`;
      }
      const totals = calculateQuote(value);
      const row = (
        await c.query(
          "INSERT INTO quote_versions(organization_id,project_id,id,version,request_id,input_hash,number,definition,totals,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,version,number,definition,totals,created_at",
          [
            ctx.organizationId,
            project,
            id,
            base + 1,
            requestId,
            hash,
            number,
            value,
            totals,
            ctx.userId,
          ],
        )
      ).rows[0];
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [
        ctx.organizationId,
        randomUUID(),
        ctx.userId,
        number ? "quote.finalized" : "quote.saved",
        id,
      ]);
      return row as QuoteRecord;
    });
  }
}
