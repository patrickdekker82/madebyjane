import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import {
  libraryPublishSchema,
  libraryQuerySchema,
} from "../../contracts/src/index";
import { DomainError, requirePermission } from "./index";
import type { Context } from "./projects";
export class LibraryService {
  constructor(private pool: Pool) {}
  list(ctx: Context, input: unknown = {}) {
    const { offset, q, category, archived } = libraryQuerySchema.parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      // Gearchiveerde items worden niet meer aangeboden, maar moeten wel te
      // vinden zijn om terug te halen; vandaar dat dit een filter is en geen
      // verwijdering. Geplaatste meubels blijven hoe dan ook ongemoeid: die
      // verwijzen naar een versie, en die versie verandert hier niet.
      const rows = (
        await c.query(
          `SELECT * FROM (
             SELECT DISTINCT ON(entry_id) id,entry_id,version,definition
             FROM library_versions ORDER BY entry_id,version DESC
           ) latest
           WHERE (EXISTS (SELECT 1 FROM library_archived a WHERE a.entry_id = latest.entry_id)) = $4
             AND ($2 = '' OR strpos(lower(concat_ws(' ', definition->>'name',
             definition#>>'{catalog,category}', definition#>>'{catalog,description}',
             definition#>>'{catalog,supplier}', definition#>>'{catalog,sku}',
             definition#>>'{catalog,keywords}')), lower($2)) > 0)
             AND ($3 = '' OR lower(definition#>>'{catalog,category}') = lower($3))
           ORDER BY definition->>'name',entry_id LIMIT 51 OFFSET $1`,
          [offset, q, category, archived],
        )
      ).rows;
      return {
        items: rows.slice(0, 50),
        nextOffset: rows.length > 50 ? offset + 50 : null,
      };
    });
  }
  publish(ctx: Context, input: unknown) {
    requirePermission(ctx.role, "library.manage");
    const value = libraryPublishSchema.parse(input),
      hash = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":library:" + value.entryId,
      ]);
      const old = await c.query("SELECT * FROM library_versions WHERE id=$1", [
        value.versionId,
      ]);
      if (old.rowCount) {
        if (
          old.rows[0].input_hash !== hash ||
          old.rows[0].user_id !== ctx.userId
        )
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Deze versie-ID is al anders gebruikt.",
            409,
          );
        return {
          id: value.versionId,
          version: old.rows[0].version,
          replayed: true,
        };
      }
      // Een nieuwe versie op een gearchiveerd item zou het stilzwijgend weer
      // laten opduiken. Dat hoort een bewuste handeling te zijn.
      if (
        (
          await c.query("SELECT 1 FROM library_archived WHERE entry_id=$1", [
            value.entryId,
          ])
        ).rowCount
      )
        throw new DomainError(
          "LIBRARY_ARCHIVED",
          "Dit bibliotheekitem is gearchiveerd. Haal het eerst terug voordat je een nieuwe versie publiceert.",
          409,
        );
      const latest = await c.query(
        "SELECT coalesce(max(version),0) AS version FROM library_versions WHERE entry_id=$1",
        [value.entryId],
      );
      if (latest.rows[0].version !== value.baseVersion)
        throw new DomainError(
          "VERSION_CONFLICT",
          "Er is een nieuwere bibliotheekversie. Open het item opnieuw.",
          409,
        );
      if (value.definition.model) {
        const ref = value.definition.model;
        const asset = (
          await c.query(
            "SELECT width,depth,height FROM model_assets WHERE id=$1",
            [ref.assetId],
          )
        ).rows[0];
        if (
          !asset ||
          asset.width !== ref.width ||
          asset.depth !== ref.depth ||
          asset.height !== ref.height
        )
          throw new DomainError(
            "INVALID_MODEL_REFERENCE",
            "Modelverwijzing is ongeldig voor deze werkruimte.",
            400,
          );
      }
      const version = value.baseVersion + 1;
      await c.query(
        "INSERT INTO library_versions(organization_id,entry_id,id,version,definition,user_id,input_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          ctx.organizationId,
          value.entryId,
          value.versionId,
          version,
          value.definition,
          ctx.userId,
          hash,
        ],
      );
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [
        ctx.organizationId,
        randomUUID(),
        ctx.userId,
        "library.published",
        value.versionId,
      ]);
      return { id: value.versionId, version, replayed: false };
    });
  }

  /**
   * Een item uit de bibliotheek halen, of terugzetten.
   *
   * Dit raakt de versies niet aan. Die zijn onveranderlijk, en dat is precies
   * de belofte waar elke geplaatste revisie op steunt: een bank die vorig jaar
   * in een ontwerp is gezet, blijft die bank — ook als het item vandaag niet
   * meer gevoerd wordt. Archiveren zegt alleen: niet meer aanbieden.
   */
  private setArchived(ctx: Context, entryId: string, archiveren: boolean) {
    requirePermission(ctx.role, "library.manage");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const bestaat = await c.query(
        "SELECT 1 FROM library_versions WHERE entry_id=$1 LIMIT 1",
        [entryId],
      );
      if (!bestaat.rowCount)
        throw new DomainError(
          "NOT_FOUND",
          "Bibliotheekitem niet gevonden.",
          404,
        );
      // Twee keer archiveren is geen fout: de uitkomst is wat de aanroeper wilde.
      if (archiveren)
        await c.query(
          "INSERT INTO library_archived(organization_id,entry_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [ctx.organizationId, entryId, ctx.userId],
        );
      else
        await c.query("DELETE FROM library_archived WHERE entry_id=$1", [
          entryId,
        ]);
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [
        ctx.organizationId,
        randomUUID(),
        ctx.userId,
        archiveren ? "library.archived" : "library.restored",
        entryId,
      ]);
      return { entryId, archived: archiveren };
    });
  }

  archive(ctx: Context, entryId: string) {
    return this.setArchived(ctx, entryId, true);
  }
  restore(ctx: Context, entryId: string) {
    return this.setArchived(ctx, entryId, false);
  }
}
