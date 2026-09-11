import { createHash, createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { AssetKey, StorageProvider } from "./index";

/**
 * S3-adapter naast de lokale adapter. Beide voldoen aan hetzelfde contract en
 * worden in storage-contract.test.ts door dezelfde proeven gehaald, zodat een
 * verhuizing naar objectopslag geen gedragsverschil oplevert.
 *
 * Signing gebeurt met SigV4 uit node:crypto; er komt geen SDK aan te pas, want
 * we gebruiken vier verzoeken en de sleutel mag nergens anders heen.
 */
export type S3Options = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Voorvoegsel binnen de bucket; scheidt deze app van andere inhoud. */
  prefix?: string;
  maxBytes?: number;
  fetch?: typeof globalThis.fetch;
};

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha256 = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

export class S3Storage implements StorageProvider {
  private maxBytes: number;
  private prefix: string;
  private http: typeof globalThis.fetch;
  constructor(private options: S3Options) {
    this.maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    this.prefix = options.prefix?.replace(/^\/+|\/+$/g, "") ?? "";
    this.http = options.fetch ?? globalThis.fetch;
    if (!/^https?:\/\//.test(options.endpoint))
      throw new Error("S3-endpoint moet met http of https beginnen.");
  }

  /**
   * Opaque sleutel, gescheiden per werkruimte. Dezelfde ID-controle als de
   * lokale adapter: een verzonnen pad komt nooit in een sleutel terecht.
   */
  private objectKey(key: AssetKey) {
    if (!uuid.test(key.organizationId) || !uuid.test(key.assetId))
      throw new Error("Ongeldige opslag-ID.");
    const path = `${key.organizationId}/${key.assetId}.bin`;
    return this.prefix ? `${this.prefix}/${path}` : path;
  }

  private signed(
    method: string,
    objectKey: string,
    payloadHash: string,
    extra: Record<string, string> = {},
  ) {
    const url = new URL(
      `${this.options.endpoint.replace(/\/+$/, "")}/${this.options.bucket}/${objectKey
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const date = stamp.slice(0, 8);
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": stamp,
      ...extra,
    };
    const names = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders = names
      .map((h) => `${h}:${String(headers[h] ?? "").trim()}\n`)
      .join("");
    const signedHeaders = names.join(";");
    const canonical = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${date}/${this.options.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join(
      "\n",
    );
    const signingKey = hmac(
      hmac(
        hmac(
          hmac(`AWS4${this.options.secretAccessKey}`, date),
          this.options.region,
        ),
        "s3",
      ),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey)
      .update(toSign)
      .digest("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { url, headers };
  }

  /** Eén plek die S3-fouten vertaalt, zodat de oproeper geen statuscodes kent. */
  private async fail(response: Response, action: string): Promise<never> {
    const body = await response.text().catch(() => "");
    if (response.status === 404) throw new Error("Opslagobject niet gevonden.");
    if (response.status === 403)
      throw new Error("Geen toegang tot de opslag. Controleer de sleutels.");
    throw new Error(
      `Opslag gaf ${response.status} bij ${action}. ${body.slice(0, 200)}`.trim(),
    );
  }

  async put(key: AssetKey, data: Uint8Array) {
    if (data.byteLength > this.maxBytes) throw new Error("Bestand te groot.");
    const hash = sha256(data);
    const objectKey = this.objectKey(key);
    const { url, headers } = this.signed("PUT", objectKey, hash, {
      "content-length": String(data.byteLength),
    });
    const response = await this.http(url, {
      method: "PUT",
      headers,
      body: data as unknown as BodyInit,
    });
    if (!response.ok) await this.fail(response, "opslaan");
    return { sha256: hash, size: data.byteLength };
  }

  async get(key: AssetKey) {
    const objectKey = this.objectKey(key);
    const { url, headers } = this.signed("GET", objectKey, sha256(""));
    const response = await this.http(url, { method: "GET", headers });
    if (!response.ok) await this.fail(response, "ophalen");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.maxBytes)
      throw new Error("Ongeldig opslagbestand.");
    return bytes;
  }

  async head(key: AssetKey) {
    const objectKey = this.objectKey(key);
    const { url, headers } = this.signed("HEAD", objectKey, sha256(""));
    const response = await this.http(url, { method: "HEAD", headers });
    if (!response.ok) await this.fail(response, "opvragen");
    const size = Number(response.headers.get("content-length"));
    if (!Number.isInteger(size) || size < 0)
      throw new Error("Ongeldig opslagbestand.");
    return { size };
  }

  async delete(key: AssetKey) {
    const objectKey = this.objectKey(key);
    const { url, headers } = this.signed("DELETE", objectKey, sha256(""));
    const response = await this.http(url, { method: "DELETE", headers });
    // S3 antwoordt 204 op verwijderen; 404 betekent dat het er al niet was.
    if (!response.ok && response.status !== 404)
      await this.fail(response, "verwijderen");
    if (response.status === 404) throw new Error("Opslagobject niet gevonden.");
  }

  async stream(key: AssetKey) {
    const objectKey = this.objectKey(key);
    const { url, headers } = this.signed("GET", objectKey, sha256(""));
    const response = await this.http(url, { method: "GET", headers });
    if (!response.ok) await this.fail(response, "streamen");
    if (!response.body) return Readable.from([await this.get(key)]);
    return Readable.fromWeb(response.body as never);
  }
}
