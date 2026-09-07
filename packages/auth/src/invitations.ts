import type { Pool, PoolClient } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { createAuth } from "./index";
import { DomainError } from "../../domain/src/index";
const inviteInput = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    role: z.enum(["admin", "designer", "finance", "viewer"]),
  })
  .strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const invitationAcceptance = z
  .object({
    token: tokenSchema,
    name: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(12).max(128).optional(),
  })
  .strict();
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class InvitationService {
  constructor(
    private pool: Pool,
    private baseURL: string,
    private secret: string,
  ) {}
  private async manager(c: PoolClient, userId: string, organizationId: string) {
    const r = await c.query(
      "SELECT role FROM identity.membership WHERE user_id=$1 AND organization_id=$2",
      [userId, organizationId],
    );
    if (!r.rows[0] || !["owner", "admin"].includes(r.rows[0].role))
      throw new DomainError(
        "FORBIDDEN",
        "Alleen de beheerder kan toegang beheren.",
        403,
      );
  }
  async list(userId: string, organizationId: string) {
    const c = await this.pool.connect();
    try {
      await this.manager(c, userId, organizationId);
      return (
        await c.query(
          "SELECT id,email,role,expires_at,accepted_at,revoked_at FROM identity.invitation WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50",
          [organizationId],
        )
      ).rows;
    } finally {
      c.release();
    }
  }
  async create(userId: string, organizationId: string, input: unknown) {
    const value = inviteInput.parse(input),
      c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await this.manager(c, userId, organizationId);
      const existing = await c.query(
        'SELECT 1 FROM identity.membership m JOIN identity."user" u ON u.id=m.user_id WHERE m.organization_id=$1 AND lower(u.email)=$2',
        [organizationId, value.email],
      );
      if (existing.rowCount)
        throw new DomainError(
          "ALREADY_MEMBER",
          "Deze gebruiker heeft al toegang.",
          409,
        );
      const token = randomBytes(32).toString("hex"),
        id = randomUUID();
      const r = await c.query(
        "INSERT INTO identity.invitation(id,organization_id,email,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '48 hours') RETURNING expires_at",
        [id, organizationId, value.email, value.role, digest(token), userId],
      );
      await c.query(
        "INSERT INTO identity.access_event VALUES($1,$2,$3,'invitation.created',$4,now())",
        [randomUUID(), organizationId, userId, id],
      );
      await c.query("COMMIT");
      return {
        id,
        expiresAt: r.rows[0].expires_at,
        url: this.baseURL + "/uitnodiging#" + token,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async revoke(userId: string, organizationId: string, invitationId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await this.manager(c, userId, organizationId);
      const r = await c.query(
        "UPDATE identity.invitation SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL RETURNING id",
        [invitationId, organizationId],
      );
      if (!r.rowCount)
        throw new DomainError(
          "NOT_FOUND",
          "Uitnodiging niet gevonden of al gebruikt.",
          404,
        );
      await c.query(
        "INSERT INTO identity.access_event VALUES($1,$2,$3,'invitation.revoked',$4,now())",
        [randomUUID(), organizationId, userId, invitationId],
      );
      await c.query("COMMIT");
      return { revoked: true };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async accept(input: unknown, authenticatedUserId?: string) {
    const value = invitationAcceptance.parse(input),
      c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(
        "SELECT * FROM identity.invitation WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE",
        [digest(value.token)],
      );
      const invitation = r.rows[0];
      if (!invitation)
        throw new DomainError(
          "INVALID_INVITATION",
          "Deze uitnodiging is verlopen, ingetrokken of al gebruikt.",
          404,
        );
      await this.manager(c, invitation.created_by, invitation.organization_id);
      let userId: string;
      const existing = await c.query(
        'SELECT id FROM identity."user" WHERE lower(email)=$1',
        [invitation.email],
      );
      if (existing.rowCount) {
        if (existing.rows[0].id !== authenticatedUserId)
          throw new DomainError(
            "SIGN_IN_REQUIRED",
            "Log eerst in met het uitgenodigde e-mailadres en open deze link opnieuw.",
            403,
          );
        userId = existing.rows[0].id;
      } else {
        if (!value.name || !value.password)
          throw new DomainError(
            "ACCOUNT_DETAILS_REQUIRED",
            "Vul je naam en een wachtwoord van minimaal 12 tekens in.",
          );
        const auth = createAuth(c, this.baseURL, this.secret, true);
        const created = await auth.api.signUpEmail({
          body: {
            email: invitation.email,
            name: value.name,
            password: value.password,
          },
        });
        userId = created.user.id;
      }
      await c.query(
        "INSERT INTO identity.membership VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [invitation.organization_id, userId, invitation.role],
      );
      await c.query(
        "UPDATE identity.invitation SET accepted_at=now() WHERE id=$1",
        [invitation.id],
      );
      await c.query(
        "INSERT INTO identity.access_event VALUES($1,$2,$3,'invitation.accepted',$4,now())",
        [randomUUID(), invitation.organization_id, userId, invitation.id],
      );
      await c.query("COMMIT");
      return { accepted: true, email: invitation.email };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
