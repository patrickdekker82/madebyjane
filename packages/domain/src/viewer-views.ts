import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { inTenant } from "../../db/src/index";
import { viewerViewSchema } from "../../contracts/src/viewer";
import { DomainError, canWrite } from "./index";
import type { Context } from "./projects";

export class ViewerViewService {
  constructor(private pool: Pool) {}
  list(ctx: Context, variant: string) {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const exists = await c.query(
        "SELECT 1 FROM design_documents WHERE variant_id=$1",
        [variant],
      );
      if (!exists.rowCount)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      return {
        items: (
          await c.query(
            "SELECT id,name,revision,camera,settings,user_id,created_at FROM viewer_views WHERE variant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50",
            [variant],
          )
        ).rows,
      };
    });
  }
  save(ctx: Context, variant: string, input: unknown) {
    if (!canWrite(ctx.role))
      throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    const value = viewerViewSchema.parse(input);
    const hash = createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.organizationId + ":viewer:" + variant,
      ]);
      const old = (
        await c.query("SELECT * FROM viewer_views WHERE id=$1", [value.id])
      ).rows[0];
      if (old) {
        if (old.input_hash !== hash || old.user_id !== ctx.userId)
          throw new DomainError(
            "IDEMPOTENCY_MISMATCH",
            "Camera-ID is al anders gebruikt.",
            409,
          );
        return old;
      }
      const design = (
        await c.query(
          "SELECT revision FROM design_documents WHERE variant_id=$1",
          [variant],
        )
      ).rows[0];
      if (!design)
        throw new DomainError("NOT_FOUND", "Ontwerp niet gevonden.", 404);
      if (design.revision !== value.baseRevision)
        throw new DomainError(
          "REVISION_CONFLICT",
          "Het ontwerp is gewijzigd. Open 3D opnieuw en leg de camera opnieuw vast.",
          409,
        );
      if (
        (
          await c.query(
            "SELECT count(*)::int n FROM viewer_views WHERE variant_id=$1",
            [variant],
          )
        ).rows[0].n >= 50
      )
        throw new DomainError(
          "LIMIT",
          "Maximaal 50 opgeslagen camera's per ontwerp.",
          409,
        );
      return (
        await c.query(
          "INSERT INTO viewer_views(organization_id,variant_id,id,name,revision,camera,settings,input_hash,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,revision,camera,settings,user_id,created_at",
          [
            ctx.organizationId,
            variant,
            value.id,
            value.name,
            value.baseRevision,
            value.camera,
            value.settings,
            hash,
            ctx.userId,
          ],
        )
      ).rows[0];
    });
  }
  remove(ctx: Context, variant: string, id: string) {
    if (!canWrite(ctx.role))
      throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const result = await c.query(
        "DELETE FROM viewer_views WHERE variant_id=$1 AND id=$2 RETURNING id",
        [variant, id],
      );
      if (!result.rowCount)
        throw new DomainError("NOT_FOUND", "Camera niet gevonden.", 404);
      return { id };
    });
  }
}
