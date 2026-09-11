import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { inTenant } from "../packages/db/src/index";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";
import { LocalStorage } from "../packages/storage/src/index";
import { makePng } from "./helpers/image";
import { moveUnderlaysToStorage } from "../scripts/move-assets-to-storage";

/**
 * Onderleggers horen in de opslagprovider, niet in de database. Deze proef
 * controleert dat nieuwe uploads de kolom leeg laten, dat het uitleveren nog
 * steeds werkt, en dat rijen van vóór migration 0018 gewoon leesbaar blijven.
 */
let db: Awaited<ReturnType<typeof localDatabase>>,
  server: ReturnType<typeof createServer>,
  storage: LocalStorage;
const org = randomUUID(),
  origin = "http://127.0.0.1:4310";
let cookie = "",
  userId = "";

const call = (method: "GET" | "POST", url: string, body?: Buffer) =>
  server.app.inject({
    method,
    url,
    headers: {
      origin,
      cookie,
      "x-organization-id": org,
      ...(body ? { "content-type": "application/octet-stream" } : {}),
    },
    ...(body ? { payload: body } : {}),
  });

beforeAll(async () => {
  await mkdir("work", { recursive: true });
  db = await localDatabase(await mkdtemp("work/underlay-"), 55439);
  const auth = createAuth(db.admin, origin, db.secret, true),
    password = randomBytes(24).toString("hex");
  await db.admin.query(
    "INSERT INTO identity.organization VALUES($1,'Studio')",
    [org],
  );
  const user = await auth.api.signUpEmail({
    body: { email: "owner@example.test", password, name: "owner" },
  });
  userId = user.user.id;
  await db.admin.query(
    "INSERT INTO identity.membership VALUES($1,$2,'owner')",
    [org, userId],
  );
  storage = new LocalStorage(await mkdtemp("work/assets-"));
  server = createServer({
    runtime: db.runtime,
    identity: db.identity,
    baseURL: origin,
    secret: db.secret,
    storage,
  });
  await server.app.ready();
  const signed = await auth.api.signInEmail({
    body: { email: "owner@example.test", password },
    asResponse: true,
  });
  cookie = (signed.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}, 90000);

afterAll(async () => {
  if (server) await server.app.close();
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});

test("een nieuwe onderlegger gaat naar de opslag en niet in de database", async () => {
  const id = randomUUID(),
    png = makePng(120, 90);
  const upload = await call("POST", "/api/v1/underlay-assets/" + id, png);
  expect(upload.statusCode, upload.body).toBe(200);

  const row = (
    await db.admin.query(
      "SELECT bytes,stored,byte_size FROM underlay_assets WHERE id=$1",
      [id],
    )
  ).rows[0];
  // De kolom blijft leeg: de bytes staan in de opslag.
  expect(row.bytes).toBeNull();
  expect(row.stored).toBe(true);
  expect(row.byte_size).toBe(png.length);

  // En het object staat er ook werkelijk, byte voor byte.
  const opgeslagen = await storage.get({ organizationId: org, assetId: id });
  expect(createHash("sha256").update(opgeslagen).digest("hex")).toBe(
    createHash("sha256").update(png).digest("hex"),
  );

  const served = await call("GET", "/api/v1/underlay-assets/" + id);
  expect(served.statusCode).toBe(200);
  expect(served.headers["content-type"]).toBe("image/png");
  expect(served.rawPayload.equals(png)).toBe(true);
});

test("een rij van vóór de verhuizing blijft gewoon leesbaar", async () => {
  const id = randomUUID(),
    png = makePng(60, 40);
  // Zoals migration 0018 een bestaande rij aantreft: bytes in de kolom.
  await db.admin.query(
    "INSERT INTO underlay_assets(organization_id,id,source_hash,mime,bytes,stored,byte_size,width_px,height_px,user_id) VALUES($1,$2,$3,'image/png',$4,false,$5,60,40,$6)",
    [
      org,
      id,
      createHash("sha256").update(png).digest("hex"),
      png,
      png.length,
      userId,
    ],
  );
  const served = await call("GET", "/api/v1/underlay-assets/" + id);
  expect(served.statusCode, served.body).toBe(200);
  expect(served.rawPayload.equals(png)).toBe(true);
  // Er is voor deze rij niets in de opslag gezet; dat hoeft ook niet.
  await expect(
    storage.get({ organizationId: org, assetId: id }),
  ).rejects.toThrow();
});

test("de quotatelling werkt ook nu de bytes de database uit zijn", async () => {
  const totaal = (
    await db.admin.query(
      "SELECT coalesce(sum(coalesce(byte_size,octet_length(bytes))),0)::bigint AS bytes FROM underlay_assets WHERE organization_id=$1",
      [org],
    )
  ).rows[0];
  // Beide soorten rijen tellen mee, anders zou de limiet te ruim worden.
  expect(Number(totaal.bytes)).toBeGreaterThan(0);
  const rijen = (
    await db.admin.query(
      "SELECT count(*)::int AS n FROM underlay_assets WHERE organization_id=$1 AND byte_size IS NULL",
      [org],
    )
  ).rows[0];
  expect(rijen.n).toBe(0);
});

test("mislukt vastleggen laat geen weesobject in de opslag achter", async () => {
  const id = randomUUID(),
    png = makePng(80, 80);
  expect(
    (await call("POST", "/api/v1/underlay-assets/" + id, png)).statusCode,
  ).toBe(200);
  // Dezelfde ID met ander beeld: de server weigert, de opslag houdt het eerste.
  const ander = makePng(81, 81);
  const tweede = await call("POST", "/api/v1/underlay-assets/" + id, ander);
  expect(tweede.statusCode).toBe(409);
  const bewaard = await storage.get({ organizationId: org, assetId: id });
  expect(Buffer.from(bewaard).equals(png)).toBe(true);
});

test("de database weigert nog steeds een rij zonder bytes én zonder opslag", async () => {
  await expect(
    db.admin.query(
      "INSERT INTO underlay_assets(organization_id,id,source_hash,mime,bytes,stored,width_px,height_px,user_id) VALUES($1,$2,$3,'image/png',NULL,false,10,10,$4)",
      [org, randomUUID(), "a".repeat(64), userId],
    ),
  ).rejects.toThrow(/underlay_bytes_somewhere/);
});

test("het verhuisscript toont eerst, verplaatst daarna en is herhaalbaar", async () => {
  const id = randomUUID(),
    png = makePng(70, 50);
  await db.admin.query(
    "INSERT INTO underlay_assets(organization_id,id,source_hash,mime,bytes,stored,byte_size,width_px,height_px,user_id) VALUES($1,$2,$3,'image/png',$4,false,$5,70,50,$6)",
    [
      org,
      id,
      createHash("sha256").update(png).digest("hex"),
      png,
      png.length,
      userId,
    ],
  );

  // Tonen verandert niets: de bytes staan daarna nog gewoon in de kolom.
  const tonen = await moveUnderlaysToStorage(db.admin, storage);
  expect(tonen.bekeken).toBeGreaterThan(0);
  expect(tonen.verplaatst).toBe(0);
  expect(
    (
      await db.admin.query(
        "SELECT bytes IS NOT NULL AS heeft FROM underlay_assets WHERE id=$1",
        [id],
      )
    ).rows[0].heeft,
  ).toBe(true);

  const uitvoeren = await moveUnderlaysToStorage(db.admin, storage, {
    uitvoeren: true,
  });
  expect(uitvoeren.mislukt).toEqual([]);
  expect(uitvoeren.verplaatst).toBeGreaterThan(0);

  const na = (
    await db.admin.query(
      "SELECT bytes,stored,byte_size FROM underlay_assets WHERE id=$1",
      [id],
    )
  ).rows[0];
  expect(na.bytes).toBeNull();
  expect(na.stored).toBe(true);
  expect(na.byte_size).toBe(png.length);
  // Het beeld is niet zoekgeraakt: het staat byte voor byte in de opslag.
  expect(
    Buffer.from(await storage.get({ organizationId: org, assetId: id })).equals(
      png,
    ),
  ).toBe(true);
  const served = await call("GET", "/api/v1/underlay-assets/" + id);
  expect(served.statusCode).toBe(200);
  expect(served.rawPayload.equals(png)).toBe(true);

  // Nogmaals draaien vindt niets meer te doen.
  const opnieuw = await moveUnderlaysToStorage(db.admin, storage, {
    uitvoeren: true,
  });
  expect(opnieuw.bekeken).toBe(0);
  expect(opnieuw.verplaatst).toBe(0);
});

test("de app mag een opgeslagen onderlegger niet wijzigen", async () => {
  // Een geplaatste onderlegger is vastgelegd: de app schrijft hem één keer.
  // Verplaatsen naar de opslag is een beheerhandeling, geen apphandeling.
  await expect(
    inTenant(db.runtime, org, (c) =>
      c.query("UPDATE underlay_assets SET bytes=NULL,stored=true"),
    ),
  ).rejects.toThrow(/permission denied/i);
  await expect(
    inTenant(db.runtime, org, (c) =>
      c.query("UPDATE underlay_assets SET byte_size=1"),
    ),
  ).rejects.toThrow(/permission denied/i);
});
