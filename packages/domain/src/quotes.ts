import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { inTenant } from "../../db/src/index";
import {
  quoteSaveSchema,
  quoteFinalizeSchema,
  statusInput,
  type QuoteRecord,
  type QuoteDefinition,
} from "../../contracts/src/quotes";
import { DomainError, type Role } from "./index";
import type { Context } from "./projects";
import { calculateQuote } from "./quote-calculation";
import { resourceCheck, digest, quoteContentHash } from "./quote-resources";
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
            "SELECT DISTINCT ON(q.id) q.id,q.version,q.number,jsonb_build_object('title',q.definition->>'title') AS definition,q.totals,q.created_at,coalesce(e.status,CASE WHEN q.number IS NULL THEN 'draft' ELSE 'final' END) AS status,coalesce(e.event_version,0) AS event_version FROM quote_versions q LEFT JOIN LATERAL (SELECT status,event_version FROM quote_events WHERE quote_id=q.id AND quote_version=q.version ORDER BY event_version DESC LIMIT 1) e ON true WHERE q.project_id=$1 ORDER BY q.id,q.version DESC",
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
      return {
        changes: [
          ...(await this.sources(c, project, row.definition)).map((x) => ({
            ...x,
            kind: "material",
          })),
          ...(await resourceCheck(c, project, row.definition, false)).changes,
        ],
      };
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
      if (base >= 500)
        throw new DomainError(
          "LIMIT",
          "Maximaal 500 versies per offerte.",
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
      const { frozen } = await resourceCheck(c, project, value, !definition);
      if (Buffer.byteLength(JSON.stringify(frozen)) > 11000000)
        throw new DomainError(
          "ATTACHMENT_LIMIT",
          "De bijlagen samen zijn te groot. Kies minder bijlagen.",
        );
      let number: string | null = null;
      if (!definition) {
        if (!value.seller?.trim())
          throw new DomainError(
            "SELLER_REQUIRED",
            "Vul de bedrijfsgegevens van de afzender in.",
          );
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
      const contentHash = digest({ number, definition: value, totals, frozen });
      const row = (
        await c.query(
          "INSERT INTO quote_versions(organization_id,project_id,id,version,request_id,input_hash,number,definition,totals,user_id,frozen,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
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
            frozen,
            contentHash,
          ],
        )
      ).rows[0];
      if (number) {
        const prior = (
          await c.query(
            "SELECT * FROM quote_versions WHERE id=$1 AND number IS NOT NULL AND version<$2 ORDER BY version DESC LIMIT 1",
            [id, base + 1],
          )
        ).rows[0];
        if (prior) {
          const seq = (
            await c.query(
              "SELECT coalesce(max(event_version),0)::int+1 n FROM quote_events WHERE quote_id=$1 AND quote_version=$2",
              [id, prior.version],
            )
          ).rows[0].n;
          await c.query(
            "INSERT INTO quote_events(organization_id,quote_id,quote_version,event_version,request_id,input_hash,status,occurred_on,actor,evidence,content_hash,user_id) VALUES($1,$2,$3,$4,$5,$6,'replaced',CURRENT_DATE,$7,$8,$9,$10)",
            [
              ctx.organizationId,
              id,
              prior.version,
              seq,
              randomUUID(),
              digest({ replacement: row.version }),
              ctx.userId,
              `Vervangen door offerte ${number}, versie ${row.version}`,
              quoteContentHash(prior),
              ctx.userId,
            ],
          );
        }
      }
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
  history(ctx: Context, project: string, id: string) {
    this.authorize(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      return {
        items: (
          await c.query(
            "SELECT q.id,q.version,q.number,jsonb_build_object('title',q.definition->>'title') AS definition,q.totals,q.created_at,coalesce(e.status,CASE WHEN q.number IS NULL THEN 'draft' ELSE 'final' END) AS status,coalesce(e.event_version,0) AS event_version FROM quote_versions q LEFT JOIN LATERAL (SELECT status,event_version FROM quote_events WHERE quote_id=q.id AND quote_version=q.version ORDER BY event_version DESC LIMIT 1) e ON true WHERE q.project_id=$1 AND q.id=$2 ORDER BY q.version DESC LIMIT 500",
            [project, id],
          )
        ).rows,
      };
    });
  }
  get(ctx: Context, project: string, id: string, version: number) {
    this.authorize(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      const r = (
        await c.query(
          "SELECT q.*,coalesce(e.status,CASE WHEN q.number IS NULL THEN 'draft' ELSE 'final' END) AS status,coalesce(e.event_version,0) AS event_version FROM quote_versions q LEFT JOIN LATERAL (SELECT status,event_version FROM quote_events WHERE quote_id=q.id AND quote_version=q.version ORDER BY event_version DESC LIMIT 1) e ON true WHERE q.project_id=$1 AND q.id=$2 AND q.version=$3",
          [project, id, version],
        )
      ).rows[0];
      if (!r)
        throw new DomainError("NOT_FOUND", "Offerteversie niet gevonden.", 404);
      return r as QuoteRecord;
    });
  }
  revise(ctx: Context, project: string, id: string, input: unknown) {
    this.authorize(ctx);
    const v = quoteFinalizeSchema.parse(input),
      hash = digest({ action: "revise", project, id, ...v });
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      const replay = (
        await c.query("SELECT * FROM quote_versions WHERE request_id=$1", [
          v.requestId,
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
          "SELECT * FROM quote_versions WHERE project_id=$1 AND id=$2 ORDER BY version DESC LIMIT 1",
          [project, id],
        )
      ).rows[0];
      if (!old || old.version !== v.baseVersion)
        throw new DomainError(
          "VERSION_CONFLICT",
          "Open de nieuwste offerteversie.",
          409,
        );
      if (!old.number)
        throw new DomainError(
          "DRAFT_EXISTS",
          "Er bestaat al een bewerkbaar concept.",
          409,
        );
      if (old.version >= 500)
        throw new DomainError(
          "LIMIT",
          "Maximaal 500 versies per offerte.",
          409,
        );
      const next = (
        await c.query(
          "INSERT INTO quote_versions(organization_id,project_id,id,version,request_id,input_hash,definition,totals,user_id,frozen,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
          [
            ctx.organizationId,
            project,
            id,
            old.version + 1,
            v.requestId,
            hash,
            old.definition,
            old.totals,
            ctx.userId,
            old.frozen,
            digest({
              number: null,
              definition: old.definition,
              totals: old.totals,
              frozen: old.frozen,
            }),
          ],
        )
      ).rows[0];
      return next as QuoteRecord;
    });
  }
  events(ctx: Context, project: string, id: string, version: number) {
    this.authorize(ctx);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const r = (
        await c.query(
          "SELECT 1 FROM quote_versions WHERE project_id=$1 AND id=$2 AND version=$3",
          [project, id, version],
        )
      ).rowCount;
      if (!r)
        throw new DomainError("NOT_FOUND", "Offerteversie niet gevonden.", 404);
      return {
        items: (
          await c.query(
            "SELECT event_version,status,occurred_on,actor,evidence,content_hash,user_id,created_at FROM quote_events WHERE quote_id=$1 AND quote_version=$2 ORDER BY event_version",
            [id, version],
          )
        ).rows,
      };
    });
  }
  transition(
    ctx: Context,
    project: string,
    id: string,
    version: number,
    input: unknown,
  ) {
    this.authorize(ctx);
    const v = statusInput.parse(input),
      hash = digest({ project, id, version, ...v });
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await this.project(c, project);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":quotes",
      ]);
      const replay = (
        await c.query("SELECT * FROM quote_events WHERE request_id=$1", [
          v.requestId,
        ])
      ).rows[0];
      if (replay) {
        if (replay.input_hash !== hash || replay.user_id !== ctx.userId)
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Verzoek-ID is al anders gebruikt.",
            409,
          );
        return replay;
      }
      const q = (
        await c.query(
          "SELECT * FROM quote_versions WHERE project_id=$1 AND id=$2 AND version=$3",
          [project, id, version],
        )
      ).rows[0];
      if (!q?.number)
        throw new DomainError(
          "NOT_FINAL",
          "Kies een definitieve offerteversie.",
          409,
        );
      const latest = (
        await c.query(
          "SELECT *,occurred_on::text AS day FROM quote_events WHERE quote_id=$1 AND quote_version=$2 ORDER BY event_version DESC LIMIT 1",
          [id, version],
        )
      ).rows[0];
      if ((latest?.event_version ?? 0) !== v.baseEventVersion)
        throw new DomainError(
          "VERSION_CONFLICT",
          "De offertestatus is gewijzigd. Open de versie opnieuw.",
          409,
        );
      const allowed: Record<string, string[]> = {
        final: ["sent", "rejected", "expired"],
        sent: ["accepted", "rejected", "expired"],
      };
      if (!allowed[latest?.status ?? "final"]?.includes(v.status))
        throw new DomainError(
          "INVALID_TRANSITION",
          "Deze statusovergang is niet toegestaan.",
          409,
        );
      const today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Europe/Amsterdam",
      });
      if (
        v.occurredOn > today ||
        v.occurredOn < q.definition.date ||
        (latest && v.occurredOn < latest.day)
      )
        throw new DomainError(
          "INVALID_DATE",
          "Gebruik een datum vanaf de offertedatum en vorige registratie, niet in de toekomst.",
        );
      if (v.status === "expired" && v.occurredOn <= q.definition.validUntil)
        throw new DomainError(
          "NOT_EXPIRED",
          "De geldigheidsdatum is nog niet verstreken.",
        );
      if (v.status === "accepted" && v.occurredOn > q.definition.validUntil)
        throw new DomainError(
          "QUOTE_EXPIRED",
          "Maak een nieuwe offerte voor acceptatie na de geldigheidsdatum.",
        );
      return (
        await c.query(
          "INSERT INTO quote_events(organization_id,quote_id,quote_version,event_version,request_id,input_hash,status,occurred_on,actor,evidence,content_hash,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
          [
            ctx.organizationId,
            id,
            version,
            v.baseEventVersion + 1,
            v.requestId,
            hash,
            v.status,
            v.occurredOn,
            v.actor,
            v.evidence,
            quoteContentHash(q),
            ctx.userId,
          ],
        )
      ).rows[0];
    });
  }
}
