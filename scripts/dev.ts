import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { localDatabase } from "./local-db";
import { createServer } from "../apps/api/src/server";
import {
  assertRuntimeRole,
  assertSchemaCompatible,
} from "../packages/db/src/index";
const db = await localDatabase();
await assertRuntimeRole(db.runtime);
await assertSchemaCompatible(db.runtime);
const { app } = createServer({
  runtime: db.runtime,
  identity: db.identity,
  baseURL: "http://127.0.0.1:4310",
  secret: db.secret,
});
await app.listen({ port: 4311, host: "127.0.0.1" });
const web = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--config",
    resolve("apps/web/vite.config.ts"),
    "--host",
    "127.0.0.1",
  ],
  { stdio: "inherit" },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  web.kill("SIGTERM");
  await app.close();
  await Promise.all([db.runtime.end(), db.identity.end()]);
  await db.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", stop);
console.log("Lokale PostgreSQL en API actief. Eerste eigenaar: pnpm setup.");
