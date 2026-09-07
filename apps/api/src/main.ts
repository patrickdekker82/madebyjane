import {
  Pool,
  assertRuntimeRole,
  assertSchemaCompatible,
} from "../../../packages/db/src/index";
import { createServer } from "./server";
const { DATABASE_URL, AUTH_DATABASE_URL, AUTH_SECRET, PUBLIC_BASE_URL } =
  process.env;
if (!DATABASE_URL || !AUTH_DATABASE_URL || !AUTH_SECRET || !PUBLIC_BASE_URL)
  throw new Error(
    "Database- en authconfiguratie ontbreekt. Gebruik pnpm dev of configureer de omgeving.",
  );
const runtime = new Pool({ connectionString: DATABASE_URL, max: 10 }),
  identity = new Pool({ connectionString: AUTH_DATABASE_URL, max: 5 });
await assertRuntimeRole(runtime);
await assertSchemaCompatible(runtime);
const { app } = createServer({
  runtime,
  identity,
  baseURL: PUBLIC_BASE_URL,
  secret: AUTH_SECRET,
});
await app.listen({
  port: Number(process.env.API_PORT ?? 4311),
  host: process.env.API_HOST ?? "127.0.0.1",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    await Promise.all([runtime.end(), identity.end()]);
    process.exit(0);
  });
console.log("Interieurstudio API gereed.");
