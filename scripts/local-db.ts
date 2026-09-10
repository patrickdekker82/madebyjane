import EmbeddedPostgres from "embedded-postgres";
import {
  mkdir,
  readFile,
  writeFile,
  access,
  mkdtemp,
  rmdir,
  chmod,
  chown,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { Pool, guardPool, migrate } from "../packages/db/src/index";
const run = promisify(execFile);
// PostgreSQL weigert als root te draaien; embedded-postgres start de server
// daarom onder de bestaande postgres-systeemgebruiker. Alleen in die situatie
// hebben de tijdelijke data- en socketdirectory extra toegang nodig. Op een
// niet-root ontwikkelmachine verandert deze functie niets.
async function allowPostgresSystemUser(directory: string, socketDir: string) {
  if (process.getuid?.() !== 0) return;
  const id = async (flag: string) =>
    Number.parseInt((await run("id", [flag, "postgres"])).stdout.trim(), 10);
  const [uid, gid] = await Promise.all([id("-u"), id("-g")]);
  if (!Number.isInteger(uid) || !Number.isInteger(gid))
    throw new Error("postgres-systeemgebruiker niet gevonden.");
  // Alleen doorloopbaar maken: credentials.json blijft 0600 en dus onleesbaar.
  await chmod(directory, 0o711);
  const data = resolve(directory, "data");
  await mkdir(data, { recursive: true });
  await chown(data, uid, gid);
  await chmod(data, 0o700);
  await chown(socketDir, uid, gid);
  await chmod(socketDir, 0o700);
}
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
  const socketDir = await mkdtemp(resolve(tmpdir(), "studio-pg-"));
  await allowPostgresSystemUser(directory, socketDir);
  let startupLog = "";
  const pg = new EmbeddedPostgres({
    databaseDir: resolve(directory, "data"),
    user: "postgres",
    password: secrets.admin,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: [
      "-h",
      "127.0.0.1",
      ...(process.platform === "win32" ? [] : ["-k", socketDir]),
    ],
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
  if (process.platform === "win32") {
    // The pinned package uses taskkill on Windows, which can leave IO workers
    // holding the listening socket. pg_ctl performs PostgreSQL's own shutdown.
    const binary = await import(
      new URL("./binary.js", import.meta.resolve("embedded-postgres")).href
    );
    const { postgres } = await binary.default();
    let stopping: Promise<void> | undefined;
    pg.stop = () =>
      (stopping ??= (async () => {
        await promisify(execFile)(
          resolve(dirname(postgres), "pg_ctl.exe"),
          [
            "-D",
            resolve(directory, "data"),
            "-m",
            "fast",
            "-w",
            "-t",
            "20",
            "stop",
          ],
          { windowsHide: true, timeout: 25000 },
        );
      })());
  }
  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`;
  const admin = guardPool(
    new Pool({ connectionString: url("postgres", secrets.admin) }),
    "admin",
  );
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
    runtime: guardPool(
      new Pool({
        connectionString: url("studio_runtime", secrets.runtime),
        max: 5,
      }),
      "runtime",
    ),
    identity: guardPool(
      new Pool({
        connectionString: url("studio_auth", secrets.auth),
        max: 3,
      }),
      "identity",
    ),
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
