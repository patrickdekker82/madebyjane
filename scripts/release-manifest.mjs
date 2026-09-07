import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const migrations = [];
for (const name of (await readdir("packages/db/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  migrations.push({
    name,
    sha256: createHash("sha256")
      .update(await readFile("packages/db/migrations/" + name))
      .digest("hex"),
  });
}
const licenses = [];
for (const name of Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}).sort()) {
  const installed = JSON.parse(
    await readFile("node_modules/" + name + "/package.json", "utf8"),
  );
  licenses.push({
    name,
    version: installed.version,
    license: installed.license ?? "UNDECLARED",
    scope: pkg.dependencies[name] ? "application" : "development",
    repository: installed.repository ?? null,
  });
}
const dockerfile = await readFile("infra/docker/Dockerfile.probe", "utf8");
const manifest = {
  name: pkg.name,
  version: pkg.version,
  status: "development-foundation-not-production",
  sceneSchemaVersion: 1,
  node: pkg.engines.node,
  packageManager: pkg.packageManager,
  lockfileSha256: createHash("sha256")
    .update(await readFile("pnpm-lock.yaml"))
    .digest("hex"),
  dependencies: pkg.dependencies,
  devDependencies: pkg.devDependencies,
  migrations,
  containers: { chromiumProbe: dockerfile.split("\n")[0].replace("FROM ", "") },
  limitations: [
    "Production API/worker/PostgreSQL/Caddy images are not yet delivered.",
    "Linux probe tested on arm64 via Colima; Debian 13 on Hyper-V not tested.",
    "License inventory covers direct installed packages, not bundled native binaries or all transitive notices.",
  ],
};
await writeFile(
  "release-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "docs/DEPENDENCY_LICENSES.json",
  JSON.stringify(licenses, null, 2) + "\n",
);
console.log(
  `Manifest: ${migrations.length} migrations, ${licenses.length} direct package licenses.`,
);
