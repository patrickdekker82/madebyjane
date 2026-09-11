import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { inTenant } from "../../db/src/index";
import {
  id,
  projectMemberInput as memberInput,
  projectAccessInput as accessInput,
  type ProjectAccess,
} from "../../contracts/src/index";
import { DomainError, requirePermission, type Role } from "./index";
import type { Context } from "./projects";

/**
 * Een project is óf open voor de hele werkruimte, óf beperkt tot expliciete
 * leden. Bestaande projecten blijven open: de migration zet 'organization' als
 * default, zodat niemand werk kwijtraakt door deze wijziging. De toegestane
 * waarden staan in contracts, zodat de interface ze kan gebruiken zonder
 * servercode te importeren.
 */
export type { ProjectAccess } from "../../contracts/src/index";

/**
 * Bepaalt met welke rol deze gebruiker dít project ziet, of weigert toegang.
 *
 * - Owner en admin beheren de hele werkruimte en houden hun eigen rol.
 * - Is de gebruiker expliciet projectlid, dan telt de projectrol. Die kan lager
 *   of hoger zijn dan de werkruimterol; alleen owner/admin kennen hem toe.
 * - Anders telt de werkruimterol, maar alleen bij een open project.
 *
 * Een beperkt project zonder lidmaatschap geeft 404 en geen 403: het bestaan
 * van het project is zelf al informatie.
 */
export async function resolveProjectRole(
  c: PoolClient,
  ctx: Context,
  project: string,
): Promise<{ role: Role; access: ProjectAccess }> {
  const row = (
    await c.query("SELECT access FROM projects WHERE id=$1", [project])
  ).rows[0];
  if (!row) throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
  const access = row.access as ProjectAccess;
  if (ctx.role === "owner" || ctx.role === "admin")
    return { role: ctx.role, access };
  const member = (
    await c.query(
      "SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2",
      [project, ctx.userId],
    )
  ).rows[0];
  if (member) return { role: member.role as Role, access };
  if (access === "restricted")
    throw new DomainError("NOT_FOUND", "Project niet gevonden.", 404);
  return { role: ctx.role, access };
}

export class ProjectAccessService {
  constructor(private pool: Pool) {}

  /** Context waarmee de rest van de API dit project behandelt. */
  forProject(ctx: Context, project: string): Promise<Context> {
    return inTenant(this.pool, ctx.organizationId, async (c) => ({
      ...ctx,
      role: (await resolveProjectRole(c, ctx, project)).role,
    }));
  }

  /** Idem, maar vanaf een ontwerpvariant; daar gebeurt het tekenwerk. */
  forVariant(ctx: Context, variant: string): Promise<Context> {
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const row = (
        await c.query("SELECT project_id FROM design_variants WHERE id=$1", [
          variant,
        ])
      ).rows[0];
      if (!row)
        throw new DomainError(
          "NOT_FOUND",
          "Ontwerpvariant niet gevonden.",
          404,
        );
      return {
        ...ctx,
        role: (await resolveProjectRole(c, ctx, row.project_id)).role,
      };
    });
  }

  list(ctx: Context, project: string) {
    // Eerst het recht, dan het project: alle ledenroutes antwoorden zo gelijk,
    // en een bestaand project is niet te onderscheiden van een verzonnen ID.
    requirePermission(ctx.role, "members.manage");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      const { access } = await resolveProjectRole(c, ctx, project);
      return {
        access,
        items: (
          await c.query(
            "SELECT user_id,role,created_at FROM project_memberships WHERE project_id=$1 ORDER BY created_at,user_id",
            [project],
          )
        ).rows,
      };
    });
  }

  setAccess(ctx: Context, project: string, input: unknown) {
    requirePermission(ctx.role, "members.manage");
    const { access } = accessInput.parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await resolveProjectRole(c, ctx, project);
      await c.query("UPDATE projects SET access=$1 WHERE id=$2", [
        access,
        project,
      ]);
      await c.query(
        "INSERT INTO audit_events(organization_id,id,user_id,action,subject_id,detail) VALUES($1,gen_random_uuid(),$2,'project.access_changed',$3,$4)",
        [ctx.organizationId, ctx.userId, project, { access }],
      );
      return { access };
    });
  }

  addMember(ctx: Context, project: string, input: unknown) {
    requirePermission(ctx.role, "members.manage");
    const value = memberInput.parse(input);
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await resolveProjectRole(c, ctx, project);
      if (
        (
          await c.query(
            "SELECT count(*)::int n FROM project_memberships WHERE project_id=$1",
            [project],
          )
        ).rows[0].n >= 100
      )
        throw new DomainError("LIMIT", "Maximaal 100 projectleden.", 409);
      await c.query(
        "INSERT INTO project_memberships(organization_id,project_id,user_id,role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET role=EXCLUDED.role",
        [ctx.organizationId, project, value.userId, value.role, ctx.userId],
      );
      await c.query(
        "INSERT INTO audit_events(organization_id,id,user_id,action,subject_id,detail) VALUES($1,gen_random_uuid(),$2,'project.member_set',$3,$4)",
        [ctx.organizationId, ctx.userId, project, value],
      );
      return { userId: value.userId, role: value.role };
    });
  }

  removeMember(ctx: Context, project: string, user: string) {
    requirePermission(ctx.role, "members.manage");
    return inTenant(this.pool, ctx.organizationId, async (c) => {
      await resolveProjectRole(c, ctx, project);
      const r = await c.query(
        "DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2 RETURNING user_id",
        [project, user],
      );
      if (!r.rowCount)
        throw new DomainError("NOT_FOUND", "Projectlid niet gevonden.", 404);
      await c.query(
        "INSERT INTO audit_events(organization_id,id,user_id,action,subject_id,detail) VALUES($1,gen_random_uuid(),$2,'project.member_removed',$3,$4)",
        [ctx.organizationId, ctx.userId, project, { userId: user }],
      );
      return { userId: user, removed: true };
    });
  }
}

export const projectParam = z.object({ id });
