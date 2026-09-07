import { mkdir, realpath, open, rename, unlink, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
export type AssetKey = { organizationId: string; assetId: string };
export interface StorageProvider {
  put(
    key: AssetKey,
    data: Uint8Array,
  ): Promise<{ sha256: string; size: number }>;
  get(key: AssetKey): Promise<Uint8Array>;
  head(key: AssetKey): Promise<{ size: number }>;
  delete(key: AssetKey): Promise<void>;
  stream(key: AssetKey): Promise<Readable>;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Private adapter. The root is owned by the service, mode 0700, never exposed as a static directory. Authorization belongs to the domain service. */
export class LocalStorage implements StorageProvider {
  constructor(
    private root: string,
    private maxBytes = 25 * 1024 * 1024,
  ) {
    this.root = resolve(root);
  }
  private async path(key: AssetKey) {
    if (!uuid.test(key.organizationId) || !uuid.test(key.assetId))
      throw new Error("Ongeldige opslag-ID.");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await realpath(this.root)) !== this.root)
      throw new Error("Opslagdirectory mag geen symlink zijn.");
    return join(this.root, key.organizationId + "_" + key.assetId + ".bin");
  }
  async put(key: AssetKey, data: Uint8Array) {
    if (data.byteLength > this.maxBytes) throw new Error("Bestand te groot.");
    const target = await this.path(key),
      temp = target + "." + randomUUID() + ".tmp";
    const f = await open(
      temp,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await f.writeFile(data);
      await f.sync();
    } catch (e) {
      await f.close();
      await unlink(temp).catch(() => {});
      throw e;
    }
    await f.close();
    try {
      await rename(temp, target);
    } catch (e) {
      await unlink(temp).catch(() => {});
      throw e;
    }
    return {
      sha256: createHash("sha256").update(data).digest("hex"),
      size: data.byteLength,
    };
  }
  async get(key: AssetKey) {
    const f = await open(
      await this.path(key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const s = await f.stat();
      if (!s.isFile() || s.size > this.maxBytes)
        throw new Error("Ongeldig opslagbestand.");
      return await f.readFile();
    } finally {
      await f.close();
    }
  }
  async head(key: AssetKey) {
    const s = await lstat(await this.path(key));
    if (!s.isFile() || s.isSymbolicLink())
      throw new Error("Ongeldig opslagbestand.");
    return { size: s.size };
  }
  async delete(key: AssetKey) {
    const path = await this.path(key);
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink())
      throw new Error("Ongeldig opslagbestand.");
    await unlink(path);
  }
  async stream(key: AssetKey) {
    return Readable.from([await this.get(key)]);
  }
}
