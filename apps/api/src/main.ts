import {
  Pool,
  guardPool,
  assertRuntimeRole,
  assertSchemaCompatible,
} from "../../../packages/db/src/index";
import { createServer } from "./server";
import { loadRuntimeConfig } from "./config";
const config = loadRuntimeConfig(process.env);
const runtime = guardPool(
    new Pool({ connectionString: config.DATABASE_URL, max: 10 }),
    "runtime",
  ),
  identity = guardPool(
    new Pool({ connectionString: config.AUTH_DATABASE_URL, max: 5 }),
    "identity",
  );
await assertRuntimeRole(runtime);
await assertSchemaCompatible(runtime);
const { app } = createServer({
  runtime,
  identity,
  baseURL: config.PUBLIC_BASE_URL,
  secret: config.AUTH_SECRET,
});
await app.listen({
  port: config.API_PORT,
  host: config.API_HOST,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    await Promise.all([runtime.end(), identity.end()]);
    process.exit(0);
  });
console.log("Interieurstudio API gereed.");
