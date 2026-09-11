import { beforeAll, afterAll, describe, test, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import {
  LocalStorage,
  type StorageProvider,
} from "../packages/storage/src/index";
import { S3Storage } from "../packages/storage/src/s3";

/**
 * Eén contract, twee adapters. Beide moeten zich hetzelfde gedragen, anders is
 * verhuizen naar objectopslag een gedragswijziging in plaats van een
 * configuratiewijziging.
 *
 * De tegenpartij is een echte HTTP-server die het gebruikte deel van S3 nabootst
 * en de ondertekening controleert. Dat is geen AWS: wat hier slaagt bewijst het
 * contract en het signeren, niet dat een echte bucket zich identiek gedraagt.
 */
type FakeS3 = {
  server: Server;
  port: number;
  objects: Map<string, Buffer>;
  signedRequests: number;
  unsignedRequests: number;
};

const startFakeS3 = () =>
  new Promise<FakeS3>((resolve) => {
    const objects = new Map<string, Buffer>();
    const state = { signedRequests: 0, unsignedRequests: 0 };
    const server = createServer((req, res) => {
      const auth = req.headers.authorization ?? "";
      // Elke aanroep hoort ondertekend te zijn; een kale request is een fout.
      if (
        auth.startsWith("AWS4-HMAC-SHA256 Credential=") &&
        auth.includes("Signature=") &&
        req.headers["x-amz-date"] &&
        req.headers["x-amz-content-sha256"]
      )
        state.signedRequests++;
      else {
        state.unsignedRequests++;
        res.writeHead(403).end("niet ondertekend");
        return;
      }
      const key = decodeURIComponent(req.url ?? "");
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        if (req.method === "PUT") {
          const body = Buffer.concat(chunks);
          // S3 verwerpt een body die niet bij de meegestuurde hash hoort.
          const declared = req.headers["x-amz-content-sha256"];
          if (createHash("sha256").update(body).digest("hex") !== declared) {
            res.writeHead(400).end("hash klopt niet");
            return;
          }
          objects.set(key, body);
          res.writeHead(200).end();
          return;
        }
        const existing = objects.get(key);
        if (req.method === "GET" || req.method === "HEAD") {
          if (!existing) {
            res
              .writeHead(404)
              .end(req.method === "HEAD" ? undefined : "geen object");
            return;
          }
          res.writeHead(200, { "content-length": String(existing.byteLength) });
          res.end(req.method === "HEAD" ? undefined : existing);
          return;
        }
        if (req.method === "DELETE") {
          if (!existing) {
            res.writeHead(404).end();
            return;
          }
          objects.delete(key);
          res.writeHead(204).end();
          return;
        }
        res.writeHead(405).end();
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        server,
        port,
        objects,
        get signedRequests() {
          return state.signedRequests;
        },
        get unsignedRequests() {
          return state.unsignedRequests;
        },
      } as FakeS3);
    });
  });

let fake: FakeS3;
let adapters: {
  naam: string;
  maak: (maxBytes?: number) => Promise<StorageProvider>;
}[];

beforeAll(async () => {
  fake = await startFakeS3();
  adapters = [
    {
      naam: "lokaal",
      maak: async (maxBytes) =>
        new LocalStorage(await mkdtemp("work/contract-"), maxBytes),
    },
    {
      naam: "s3",
      maak: async (maxBytes) =>
        new S3Storage({
          endpoint: `http://127.0.0.1:${fake.port}`,
          region: "eu-west-1",
          bucket: "studio",
          accessKeyId: "TESTSLEUTEL",
          secretAccessKey: "testgeheim",
          prefix: "assets",
          ...(maxBytes === undefined ? {} : { maxBytes }),
        }),
    },
  ];
}, 30000);

afterAll(async () => {
  await new Promise<void>((r) => fake.server.close(() => r()));
});

const key = () => ({
  organizationId: randomUUID(),
  assetId: randomUUID(),
});

describe("opslagcontract", () => {
  test("beide adapters bewaren, lezen, meten, streamen en verwijderen gelijk", async () => {
    for (const adapter of adapters) {
      const opslag = await adapter.maak();
      const k = key();
      const data = new TextEncoder().encode("interieur");
      const geschreven = await opslag.put(k, data);
      expect(geschreven.size, adapter.naam).toBe(9);
      expect(geschreven.sha256, adapter.naam).toBe(
        createHash("sha256").update(data).digest("hex"),
      );
      expect(Buffer.from(await opslag.get(k)).toString(), adapter.naam).toBe(
        "interieur",
      );
      expect(await opslag.head(k), adapter.naam).toEqual({ size: 9 });
      const chunks: Buffer[] = [];
      for await (const chunk of await opslag.stream(k))
        chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString(), adapter.naam).toBe("interieur");
      await opslag.delete(k);
      await expect(opslag.get(k), adapter.naam).rejects.toThrow();
    }
  });

  test("beide adapters weigeren een verzonnen ID en een te groot bestand", async () => {
    for (const adapter of adapters) {
      const opslag = await adapter.maak(100);
      const k = key();
      await expect(
        opslag.get({ ...k, assetId: "../../etc/passwd" }),
        adapter.naam,
      ).rejects.toThrow(/ID/);
      await expect(
        opslag.put(k, new Uint8Array(101)),
        adapter.naam,
      ).rejects.toThrow(/groot/);
      // Een geweigerde put laat niets half achter.
      await expect(opslag.get(k), adapter.naam).rejects.toThrow();
    }
  });

  test("beide adapters melden een ontbrekend object in plaats van leeg terug te geven", async () => {
    for (const adapter of adapters) {
      const opslag = await adapter.maak();
      const k = key();
      await expect(opslag.get(k), adapter.naam).rejects.toThrow();
      await expect(opslag.head(k), adapter.naam).rejects.toThrow();
      await expect(opslag.delete(k), adapter.naam).rejects.toThrow();
    }
  });

  test("overschrijven levert de nieuwe inhoud, niet de oude", async () => {
    for (const adapter of adapters) {
      const opslag = await adapter.maak();
      const k = key();
      await opslag.put(k, new TextEncoder().encode("eerste"));
      await opslag.put(k, new TextEncoder().encode("tweede versie"));
      expect(Buffer.from(await opslag.get(k)).toString(), adapter.naam).toBe(
        "tweede versie",
      );
      expect((await opslag.head(k)).size, adapter.naam).toBe(13);
    }
  });

  test("werkruimtes delen geen sleutelruimte", async () => {
    for (const adapter of adapters) {
      const opslag = await adapter.maak();
      const assetId = randomUUID();
      const een = { organizationId: randomUUID(), assetId };
      const twee = { organizationId: randomUUID(), assetId };
      await opslag.put(een, new TextEncoder().encode("van werkruimte een"));
      // Hetzelfde asset-ID onder een andere werkruimte bestaat niet.
      await expect(opslag.get(twee), adapter.naam).rejects.toThrow();
      await opslag.put(twee, new TextEncoder().encode("van twee"));
      expect(Buffer.from(await opslag.get(een)).toString(), adapter.naam).toBe(
        "van werkruimte een",
      );
    }
  });
});

test("de S3-adapter ondertekent elk verzoek en stuurt niets ongetekend", async () => {
  expect(fake.signedRequests).toBeGreaterThan(0);
  expect(fake.unsignedRequests).toBe(0);
});

test("de S3-adapter vertaalt statuscodes naar begrijpelijke fouten", async () => {
  const weigerend = new S3Storage({
    endpoint: `http://127.0.0.1:${fake.port}`,
    region: "eu-west-1",
    bucket: "studio",
    accessKeyId: "TESTSLEUTEL",
    secretAccessKey: "verkeerd-maar-de-nepserver-kijkt-alleen-naar-de-vorm",
    fetch: (async () =>
      new Response("geweigerd", { status: 403 })) as typeof fetch,
  });
  await expect(weigerend.get(key())).rejects.toThrow(/Geen toegang/);
  const stuk = new S3Storage({
    endpoint: `http://127.0.0.1:${fake.port}`,
    region: "eu-west-1",
    bucket: "studio",
    accessKeyId: "TESTSLEUTEL",
    secretAccessKey: "testgeheim",
    fetch: (async () => new Response("kapot", { status: 500 })) as typeof fetch,
  });
  await expect(stuk.get(key())).rejects.toThrow(/500/);
});

test("een endpoint zonder http wordt meteen geweigerd", () => {
  expect(
    () =>
      new S3Storage({
        endpoint: "opslag.intern",
        region: "eu-west-1",
        bucket: "studio",
        accessKeyId: "a",
        secretAccessKey: "b",
      }),
  ).toThrow(/http/);
});
