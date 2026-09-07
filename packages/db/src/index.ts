import { Pool, type PoolClient } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
export { Pool };
// Read-only startup gate: deployments must migrate explicitly before starting the API.
export async function assertSchemaCompatible(pool: Pool) {
  const names = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = await pool.query<{ name: string; hash: string }>(
    "SELECT name, hash FROM public.schema_migrations ORDER BY name",
  );
  if (applied.rows.length !== names.length)
    throw new Error(
      "Databaseversie past niet bij deze app. Voer de bijbehorende migrations uit vóór het starten.",
    );
  for (const [index, name] of names.entries()) {
    const sql = await readFile(
      new URL("../migrations/" + name, import.meta.url),
      "utf8",
    );
    const hash = createHash("sha256").update(sql).digest("hex");
    if (
      applied.rows[index]?.name !== name ||
      applied.rows[index]?.hash !== hash
    )
      throw new Error(
        "Database-migrationhistorie past niet bij deze app: " + name,
      );
  }
}
export async function migrate(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("SELECT pg_advisory_lock(7310042)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (
      await readdir(new URL("../migrations/", import.meta.url))
    )
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(
        new URL("../migrations/" + name, import.meta.url),
        "utf8",
      );
      const hash = createHash("sha256").update(sql).digest("hex");
      const old = await c.query(
        "SELECT hash FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (old.rowCount) {
        if (old.rows[0].hash !== hash)
          throw new Error(`Gewijzigde historische migration: ${name}`);
        continue;
      }
      await c.query("BEGIN");
      try {
        await c.query(sql);
        await c.query(
          "INSERT INTO schema_migrations(name,hash) VALUES($1,$2)",
          [name, hash],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(7310042)");
    c.release();
  }
}
export async function inTenant<T>(
  pool: Pool,
  organizationId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function assertRuntimeRole(pool: Pool) {
  const r = await pool.query(
    "SELECT rolsuper,rolbypassrls,rolname FROM pg_roles WHERE rolname=current_user",
  );
  if (
    r.rows[0]?.rolsuper ||
    r.rows[0]?.rolbypassrls ||
    r.rows[0]?.rolname !== "studio_runtime"
  )
    throw new Error("Onveilige database-runtime-role.");
}
