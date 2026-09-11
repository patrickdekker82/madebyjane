import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAuth } from "./index";
import { DomainError } from "../../domain/src/index";

export const recoveryAcceptance = z
  .object({
    token: z.string().min(16).max(200),
    password: z.string().min(12).max(128),
  })
  .strict();

/**
 * Accountherstel wanneer iemand niet meer kan inloggen.
 *
 * Er is geen e-mailkoppeling, dus er wordt ook niet gedaan alsof: een beheerder
 * maakt een eenmalige link en geeft die persoonlijk door, net als bij een
 * uitnodiging. Token, vervaltijd, eenmalig gebruik, wachtwoordsterkte en het
 * intrekken van sessies komen van Better Auth; deze laag doet alleen wie-mag-wat,
 * registratie en het ongeldig maken van oudere links.
 */
export class RecoveryService {
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
        "Alleen de beheerder kan accountherstel starten.",
        403,
      );
    return r.rows[0].role as string;
  }

  /** Het doelwit moet in dezelfde werkruimte zitten en zichtbaar zijn. */
  private async target(c: PoolClient, organizationId: string, userId: string) {
    const r = await c.query(
      'SELECT u.id,u.email,m.role FROM identity.membership m JOIN identity."user" u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2',
      [organizationId, userId],
    );
    if (!r.rowCount)
      throw new DomainError("NOT_FOUND", "Gebruiker niet gevonden.", 404);
    return r.rows[0] as { id: string; email: string; role: string };
  }

  /** Maakt outstanding herstellinks ongeldig; Better Auth bewaart ze hier. */
  private clearOutstanding(c: PoolClient, userId: string) {
    return c.query(
      "DELETE FROM identity.verification WHERE identifier LIKE 'reset-password:%' AND value=$1",
      [userId],
    );
  }

  private event(
    c: PoolClient,
    organizationId: string,
    actorId: string,
    action: string,
    detail: Record<string, unknown>,
  ) {
    return c.query(
      "INSERT INTO identity.access_event(id,organization_id,actor_id,action,subject_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), organizationId, actorId, action, randomUUID(), detail],
    );
  }

  async create(actorId: string, organizationId: string, targetUserId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const actorRole = await this.manager(c, actorId, organizationId);
      const user = await this.target(c, organizationId, targetUserId);
      // Een admin mag geen eigenaar herstellen: dat zou een route zijn om het
      // eigenaarsaccount over te nemen. Alleen een eigenaar mag dat.
      if (user.role === "owner" && actorRole !== "owner")
        throw new DomainError(
          "FORBIDDEN",
          "Alleen een eigenaar kan het herstel van een eigenaar starten.",
          403,
        );
      await this.clearOutstanding(c, user.id);
      let token = "";
      const auth = createAuth(c, this.baseURL, this.secret, true, (t) => {
        token = t;
      });
      await auth.api.requestPasswordReset({ body: { email: user.email } });
      if (!token)
        throw new DomainError(
          "RECOVERY_FAILED",
          "Er kon geen herstellink worden gemaakt.",
          500,
        );
      const expires = (
        await c.query(
          'SELECT "expiresAt" FROM identity.verification WHERE identifier=$1',
          ["reset-password:" + token],
        )
      ).rows[0];
      await this.event(c, organizationId, actorId, "recovery.created", {
        userId: user.id,
        email: user.email,
      });
      await c.query("COMMIT");
      return {
        email: user.email,
        expiresAt: expires?.expiresAt ?? null,
        url: this.baseURL + "/herstel#" + token,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  async revoke(actorId: string, organizationId: string, targetUserId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const actorRole = await this.manager(c, actorId, organizationId);
      const user = await this.target(c, organizationId, targetUserId);
      if (user.role === "owner" && actorRole !== "owner")
        throw new DomainError(
          "FORBIDDEN",
          "Alleen een eigenaar kan het herstel van een eigenaar intrekken.",
          403,
        );
      const r = await this.clearOutstanding(c, user.id);
      if (r.rowCount)
        await this.event(c, organizationId, actorId, "recovery.revoked", {
          userId: user.id,
          email: user.email,
        });
      await c.query("COMMIT");
      return { revoked: (r.rowCount ?? 0) > 0 };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  /**
   * Better Auth controleert de token, hasht het nieuwe wachtwoord en verwijdert
   * alle sessies van deze gebruiker. Lukt dat, dan leggen we het vast.
   */
  async accept(input: unknown) {
    const value = recoveryAcceptance.parse(input),
      c = await this.pool.connect();
    try {
      const row = (
        await c.query(
          'SELECT value AS user_id FROM identity.verification WHERE identifier=$1 AND "expiresAt">now()',
          ["reset-password:" + value.token],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          "INVALID_RECOVERY",
          "Deze herstellink is verlopen, ingetrokken of al gebruikt.",
          404,
        );
      const auth = createAuth(c, this.baseURL, this.secret, true);
      await auth.api.resetPassword({
        body: { token: value.token, newPassword: value.password },
      });
      const membership = (
        await c.query(
          "SELECT organization_id FROM identity.membership WHERE user_id=$1 ORDER BY organization_id LIMIT 1",
          [row.user_id],
        )
      ).rows[0];
      if (membership)
        await this.event(
          c,
          membership.organization_id,
          row.user_id,
          "recovery.used",
          { userId: row.user_id },
        );
      return { recovered: true };
    } finally {
      c.release();
    }
  }
}
