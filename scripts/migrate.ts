import { Pool, migrate } from "../packages/db/src/index";
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error("MIGRATION_DATABASE_URL ontbreekt.");
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
try {
  await migrate(pool);
} finally {
  await pool.end();
}
