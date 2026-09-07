import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import { inspectGlbOnServer } from "../../model-import/src/server";
import { DomainError, canWrite } from "./index";
import type { Context } from "./projects";
export class ModelAssetService {
  constructor(private pool: Pool) {}
  async upload(ctx: Context, id: string, bytes: Buffer) {
    if (!canWrite(ctx.role)) throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    if (bytes.length < 28 || bytes.length > 10485760) throw new DomainError("INVALID_MODEL", "Kies een volledig GLB-bestand van maximaal 10 MiB.", 422);
    const hash = createHash("sha256").update(bytes).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ctx.organizationId + ":model-upload"]);
      const old = (await c.query("SELECT id,source_hash,width,depth,height,triangles FROM model_assets WHERE id=$1", [id])).rows[0];
      if (old) {
        if (old.source_hash !== hash) throw new DomainError("IDEMPOTENCY_MISMATCH", "Deze model-ID is al voor een ander bestand gebruikt.", 409);
        return { id, width: old.width, depth: old.depth, height: old.height, triangles: old.triangles };
      }
      const quota = (await c.query("SELECT count(*)::int AS count, coalesce(sum(source_bytes + octet_length(positions)),0)::bigint AS bytes FROM model_assets")).rows[0];
      if (quota.count >= 100 || Number(quota.bytes) + bytes.length + 3600000 > 200 * 1024 * 1024) throw new DomainError("MODEL_QUOTA", "De modelopslag is vol (100 modellen of 200 MiB per werkruimte).", 409);
      // Input stays private in bounded memory until a separate worker accepts it.
      const model = await inspectGlbOnServer(bytes);
      const geometry = Buffer.alloc(model.positions.length * 4);
      model.positions.forEach((value, i) => geometry.writeFloatLE(value, i * 4));
      await c.query("INSERT INTO model_assets(organization_id,id,source_hash,source_bytes,positions,width,depth,height,triangles,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [ctx.organizationId,id,hash,bytes.length,geometry,model.width,model.depth,model.height,model.triangles,ctx.userId]);
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [ctx.organizationId,randomUUID(),ctx.userId,"model.accepted",id]);
      return { id, width: model.width, depth: model.depth, height: model.height, triangles: model.triangles };
    });
  }
  get(ctx: Context, id: string) {
    return inTenant(this.pool, ctx.organizationId, async c => {
      const row = (await c.query("SELECT positions,width,depth,height,triangles FROM model_assets WHERE id=$1", [id])).rows[0];
      if (!row) throw new DomainError("NOT_FOUND", "Model niet gevonden.", 404);
      return row as { positions: Buffer; width: number; depth: number; height: number; triangles: number };
    });
  }
}
