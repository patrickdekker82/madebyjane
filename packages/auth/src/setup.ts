import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAuth } from "./index";
const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    password: z.string().min(12).max(128),
    organizationName: z.string().trim().min(1).max(120),
  })
  .strict();
/** Offline installation entry point, never mounted on HTTP. One transaction and lock for identity, organization and membership. */
export async function bootstrapOwner(
  pool: Pool,
  baseURL: string,
  secret: string,
  input: unknown,
) {
  const value = inputSchema.parse(input),
    c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7310043)");
    const count = await c.query('SELECT count(*) FROM identity."user"');
    if (Number(count.rows[0].count) > 0)
      throw new Error("Eerste eigenaar bestaat al; setup is gesloten.");
    const auth = createAuth(c, baseURL, secret, true);
    const result = await auth.api.signUpEmail({
      body: { name: value.name, email: value.email, password: value.password },
    });
    const organizationId = randomUUID();
    await c.query("INSERT INTO identity.organization VALUES($1,$2)", [
      organizationId,
      value.organizationName,
    ]);
    await c.query("INSERT INTO identity.membership VALUES($1,$2,'owner')", [
      organizationId,
      result.user.id,
    ]);
    await c.query("COMMIT");
    return { userId: result.user.id, organizationId };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
