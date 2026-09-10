import { readFile } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Playwright force-terminates its web-server process tree on Windows. Stop
// PostgreSQL first, while its parent is alive, to avoid orphaned IO workers.
export default async function teardown() {
  if (process.platform !== "win32") return;
  const { directory } = JSON.parse(
    await readFile("work/e2e-database.json", "utf8"),
  );
  if (typeof directory !== "string")
    throw new Error("Invalid E2E database path");
  const target = resolve(directory);
  const path = relative(resolve("work"), target);
  if (
    isAbsolute(path) ||
    !new RegExp(`^e2e-db-[A-Za-z0-9]+\\${sep}data$`).test(path)
  )
    throw new Error(
      "E2E database must be inside this workspace's test directory",
    );
  const binary = await import(
    new URL("./binary.js", import.meta.resolve("embedded-postgres")).href
  );
  const { postgres } = await binary.default();
  await promisify(execFile)(
    resolve(dirname(postgres), "pg_ctl.exe"),
    ["-D", target, "-m", "fast", "-w", "-t", "20", "stop"],
    { windowsHide: true, timeout: 25000 },
  );
}
