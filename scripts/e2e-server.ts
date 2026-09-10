import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { localDatabase } from "./local-db";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";
await mkdir("work", { recursive: true });
const databaseDirectory = await mkdtemp("work/e2e-db-");
const db = await localDatabase(databaseDirectory, 55434);
await writeFile(
  "work/e2e-database.json",
  JSON.stringify({ directory: resolve(databaseDirectory, "data") }),
);
const baseURL = "http://127.0.0.1:4320",
  setup = createAuth(db.admin, baseURL, db.secret, true);
const password = randomBytes(24).toString("hex"),
  email = "ontwerper@example.test",
  org = randomUUID();
const r = await setup.api.signUpEmail({
  body: { name: "Testontwerper", email, password },
});
await db.admin.query("INSERT INTO identity.organization VALUES($1,$2)", [
  org,
  "Atelier · fictieve studio",
]);
await db.admin.query("INSERT INTO identity.membership VALUES($1,$2,'owner')", [
  org,
  r.user.id,
]);
await writeFile(
  "work/e2e-credentials.json",
  JSON.stringify({ email, password, org }),
  { mode: 0o600 },
);
const { app } = createServer({
  runtime: db.runtime,
  identity: db.identity,
  baseURL,
  secret: db.secret,
});
await app.listen({ port: 4321, host: "127.0.0.1" });
const web = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--config",
    resolve("apps/web/vite.config.ts"),
    "--host",
    "127.0.0.1",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WEB_PORT: "4320",
      API_PROXY: "http://127.0.0.1:4321",
    },
  },
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
