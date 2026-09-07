import { test, expect } from "vitest";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { LocalStorage } from "../packages/storage/src/index";
const key = () => ({
  organizationId: crypto.randomUUID(),
  assetId: crypto.randomUUID(),
});
test("private opslag atomisch put/get/head/stream/delete met hash en limiet", async () => {
  const root = await mkdtemp("work/storage-"),
    s = new LocalStorage(root, 100),
    k = key();
  const data = new TextEncoder().encode("interieur");
  expect((await s.put(k, data)).sha256).toHaveLength(64);
  expect(await s.get(k)).toEqual(Buffer.from(data));
  expect(await s.head(k)).toEqual({ size: 9 });
  const chunks = [];
  for await (const chunk of await s.stream(k)) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe("interieur");
  await expect(s.put(k, new Uint8Array(101))).rejects.toThrow(/groot/);
  expect(Buffer.from(await s.get(k)).toString()).toBe("interieur");
  await s.delete(k);
  await expect(s.get(k)).rejects.toThrow();
});
test("path traversal en symlinkontsnapping geweigerd", async () => {
  const root = resolve(await mkdtemp("work/storage-")),
    s = new LocalStorage(root),
    k = key();
  await expect(s.get({ ...k, assetId: "../../etc/passwd" })).rejects.toThrow(
    /ID/,
  );
  const secret = join(root, "private.txt");
  await writeFile(secret, "niet uitlezen");
  await symlink(
    secret,
    join(root, k.organizationId + "_" + k.assetId + ".bin"),
  );
  await expect(s.get(k)).rejects.toThrow();
  await expect(s.head(k)).rejects.toThrow();
  const link = root + "-link";
  await symlink(root, link);
  await expect(new LocalStorage(link).get(k)).rejects.toThrow(/symlink/);
});
