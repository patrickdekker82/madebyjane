import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { inTenant } from "../../db/src/index";
import { materialPublishSchema } from "../../contracts/src/materials";
import { DomainError, canWrite } from "./index";
import type { Context } from "./projects";
export class MaterialService {
  constructor(private pool: Pool) {}
  private async project(c: PoolClient, projectId: string) {
    if (!(await c.query("SELECT 1 FROM projects WHERE id=$1", [projectId])).rowCount)
      throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
  }
  list(ctx: Context, projectId: string) {
    return inTenant(this.pool, ctx.organizationId, async c => {
      await this.project(c, projectId);
      return { items: (await c.query(`SELECT * FROM (
        SELECT DISTINCT ON(entry_id) id,entry_id,version,definition,user_id,created_at
        FROM material_versions WHERE project_id=$1 ORDER BY entry_id,version DESC
      ) latest ORDER BY definition->>'category',definition->>'name',entry_id`, [projectId])).rows };
    });
  }
  publish(ctx: Context, projectId: string, input: unknown) {
    if (!canWrite(ctx.role)) throw new DomainError("FORBIDDEN", "Je hebt alleen leestoegang.", 403);
    const value = materialPublishSchema.parse(input), hash = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    return inTenant(this.pool, ctx.organizationId, async c => {
      await this.project(c, projectId);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ctx.organizationId + ":materials:" + projectId]);
      const old = (await c.query("SELECT * FROM material_versions WHERE id=$1", [value.versionId])).rows[0];
      if (old) {
        if (old.project_id !== projectId || old.input_hash !== hash || old.user_id !== ctx.userId)
          throw new DomainError("IDEMPOTENCY_MISMATCH", "Deze versie-ID is al anders gebruikt.", 409);
        return { id: old.id, version: old.version, replayed: true };
      }
      const latest = (await c.query("SELECT coalesce(max(version),0)::int AS version FROM material_versions WHERE project_id=$1 AND entry_id=$2", [projectId,value.entryId])).rows[0].version;
      if (latest !== value.baseVersion) throw new DomainError("VERSION_CONFLICT", "Dit materiaal is intussen gewijzigd. Ga terug naar de lijst en open de nieuwste versie.", 409);
      if (latest === 0) {
        const count = (await c.query("SELECT count(DISTINCT entry_id)::int AS count FROM material_versions WHERE project_id=$1", [projectId])).rows[0].count;
        if (count >= 200) throw new DomainError("MATERIAL_LIMIT", "Een project kan maximaal 200 materiaalkeuzes bevatten.", 409);
      }
      const version = latest + 1;
      await c.query("INSERT INTO material_versions(organization_id,project_id,entry_id,id,version,definition,user_id,input_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [ctx.organizationId,projectId,value.entryId,value.versionId,version,value.definition,ctx.userId,hash]);
      await c.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5,now())", [ctx.organizationId,randomUUID(),ctx.userId,"material.version_saved",value.versionId]);
      return { id: value.versionId, version, replayed: false };
    });
  }
}
