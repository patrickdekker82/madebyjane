import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import { libraryPublishSchema, libraryQuerySchema } from "../../contracts/src/index";
import { DomainError, canWrite } from "./index";
import type { Context } from "./projects";
export class LibraryService {
  constructor(private pool: Pool) {}
  list(ctx: Context, input: unknown = {}) {
    const { offset, q, category } = libraryQuerySchema.parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const rows = (
        await c.query(
          `SELECT * FROM (
             SELECT DISTINCT ON(entry_id) id,entry_id,version,definition
             FROM library_versions ORDER BY entry_id,version DESC
           ) latest
           WHERE ($2 = '' OR strpos(lower(concat_ws(' ', definition->>'name',
             definition#>>'{catalog,category}', definition#>>'{catalog,description}',
             definition#>>'{catalog,supplier}', definition#>>'{catalog,sku}',
             definition#>>'{catalog,keywords}')), lower($2)) > 0)
             AND ($3 = '' OR lower(definition#>>'{catalog,category}') = lower($3))
           ORDER BY definition->>'name',entry_id LIMIT 51 OFFSET $1`,
          [offset, q, category],
        )
      ).rows;
      return {
        items: rows.slice(0, 50),
        nextOffset: rows.length > 50 ? offset + 50 : null,
      };
    });
  }
  publish(ctx: Context, input: unknown) {
    if (!canWrite(ctx.role))
      throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
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
        const asset = (await c.query("SELECT width,depth,height FROM model_assets WHERE id=$1", [ref.assetId])).rows[0];
        if (!asset || asset.width !== ref.width || asset.depth !== ref.depth || asset.height !== ref.height)
          throw new DomainError("INVALID_MODEL_REFERENCE", "Modelverwijzing is ongeldig voor deze werkruimte.", 400);
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
}
