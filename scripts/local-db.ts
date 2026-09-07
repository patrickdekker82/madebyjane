import EmbeddedPostgres from "embedded-postgres";
import {
  mkdir,
  readFile,
  writeFile,
  access,
  mkdtemp,
  rmdir,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { Pool, migrate } from "../packages/db/src/index";
export async function localDatabase(directory = "work/local-db", port = 55432) {
  await mkdir(directory, { recursive: true });
  const secretFile = resolve(directory, "credentials.json");
  let secrets: {
    admin: string;
    runtime: string;
    auth: string;
    session: string;
  };
  try {
    secrets = JSON.parse(await readFile(secretFile, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    secrets = {
      admin: randomBytes(32).toString("hex"),
      runtime: randomBytes(32).toString("hex"),
      auth: randomBytes(32).toString("hex"),
      session: randomBytes(48).toString("hex"),
    };
    await writeFile(secretFile, JSON.stringify(secrets), {
      mode: 0o600,
      flag: "wx",
    });
  }
  secrets = z
    .object({
      admin: z.string().regex(/^[a-f0-9]{64}$/),
      runtime: z.string().regex(/^[a-f0-9]{64}$/),
      auth: z.string().regex(/^[a-f0-9]{64}$/),
      session: z.string().regex(/^[a-f0-9]{96}$/),
    })
    .strict()
    .parse(secrets);
  const socketDir = await mkdtemp(
    (process.platform === "darwin" ? "/private/tmp" : "/tmp") + "/studio-pg-",
  );
  let startupLog = "";
  const pg = new EmbeddedPostgres({
    databaseDir: resolve(directory, "data"),
    user: "postgres",
    password: secrets.admin,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1", "-k", socketDir],
    onLog: (message) => {
      startupLog = (startupLog + message).slice(-8000);
    },
    onError: (message) => console.error(message),
  });
  try {
    await access(resolve(directory, "data/PG_VERSION"));
  } catch {
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch {
    await rmdir(socketDir).catch(() => {});
    throw new Error(startupLog || "PostgreSQL kon niet starten.");
  }
  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`;
  const admin = new Pool({ connectionString: url("postgres", secrets.admin) });
  try {
    await migrate(admin);
    await admin.query(
      `ALTER ROLE studio_runtime LOGIN PASSWORD '${secrets.runtime}'`,
    );
    await admin.query(
      `ALTER ROLE studio_auth LOGIN PASSWORD '${secrets.auth}'`,
    );
  } catch (e) {
    await admin.end();
    await pg.stop();
    throw e;
  }
  return {
    pg,
    admin,
    runtime: new Pool({
      connectionString: url("studio_runtime", secrets.runtime),
      max: 5,
    }),
    identity: new Pool({
      connectionString: url("studio_auth", secrets.auth),
      max: 3,
    }),
    secret: secrets.session,
    env: {
      DATABASE_URL: url("studio_runtime", secrets.runtime),
      AUTH_DATABASE_URL: url("studio_auth", secrets.auth),
      AUTH_SECRET: secrets.session,
    },
    async stop() {
      await admin.end();
      await pg.stop();
      await rmdir(socketDir).catch(() => {});
    },
  };
}
