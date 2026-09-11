import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { inTenant } from "../packages/db/src/index";
import { LocalStorage } from "../packages/storage/src/index";
import {
  documentBytes,
  storeDocument,
  discardDocument,
} from "../packages/domain/src/document-storage";
import { moveDocumentsToStorage } from "../scripts/move-assets-to-storage";

/**
 * De grootste bestanden die de app maakt — offerte-PDF's, presentatie-PDF's en
 * PowerPoint-exports — horen in de opslagprovider.
 *
 * Het schrijfpad loopt in de app door de renderer, en die kan in deze container
 * niet draaien. Deze proef toetst daarom de laag eronder rechtstreeks: de
 * gedeelde helper, en het verhuizen van bestaande rijen door het script. Wat
 * hier slaagt zegt niets over het renderen zelf; dat heeft zijn eigen tests.
 */
let db: Awaited<ReturnType<typeof localDatabase>>, storage: LocalStorage;
const org = randomUUID();
let project = "",
  quoteId = "",
  presentationId = "",
  userId = "";

const tabellen = [
  { tabel: "quote_exports", kolom: "pdf" },
  { tabel: "presentation_exports", kolom: "pdf" },
  { tabel: "presentation_decks", kolom: "pptx" },
] as const;

/** Een rij zoals migration 0019 die aantreft: bytes nog in de kolom. */
async function legacyRij(tabel: string, kolom: string, bytes: Buffer) {
  const assetId = randomUUID();
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (tabel === "quote_exports")
    await db.admin.query(
      `INSERT INTO quote_exports(organization_id,quote_id,quote_version,template_version,content_hash,${kolom},${kolom}_hash,asset_id,stored,byte_size) VALUES($1,$2,1,'t','c',$3,$4,$5,false,$6)`,
      [org, quoteId, bytes, hash, assetId, bytes.length],
    );
  else
    await db.admin.query(
      `INSERT INTO ${tabel}(organization_id,presentation_id,version,content_hash,${kolom},${kolom}_hash,asset_id,stored,byte_size) VALUES($1,$2,1,'c',$3,$4,$5,false,$6)`,
      [org, presentationId, bytes, hash, assetId, bytes.length],
    );
  return assetId;
}

beforeAll(async () => {
  await mkdir("work", { recursive: true });
  db = await localDatabase(await mkdtemp("work/documents-"), 55441);
  storage = new LocalStorage(await mkdtemp("work/docassets-"));
  await db.admin.query(
    "INSERT INTO identity.organization VALUES($1,'Studio')",
    [org],
  );
  userId = "gebruiker-" + randomUUID();
  await db.admin.query(
    'INSERT INTO identity."user"(id,name,email) VALUES($1,$2,$3)',
    [userId, "Eigenaar", `${userId}@example.test`],
  );
  await db.admin.query(
    "INSERT INTO identity.membership VALUES($1,$2,'owner')",
    [org, userId],
  );
  project = randomUUID();
  await db.admin.query(
    "INSERT INTO projects(organization_id,id,name,customer,description) VALUES($1,$2,'Project','Klant','')",
    [org, project],
  );
  // Een definitieve offerteversie en een gepubliceerde presentatieversie, zodat
  // de exportrijen een geldige verwijzing hebben.
  quoteId = randomUUID();
  await db.admin.query(
    "INSERT INTO quote_versions(organization_id,project_id,id,version,request_id,input_hash,number,definition,totals,user_id) VALUES($1,$2,$3,1,$4,'h','2026-00001','{}','{}',$5)",
    [org, project, quoteId, randomUUID(), userId],
  );
  presentationId = randomUUID();
  await db.admin.query(
    "INSERT INTO presentations(organization_id,id,project_id,definition,user_id) VALUES($1,$2,$3,'{}',$4)",
    [org, presentationId, project, userId],
  );
  await db.admin.query(
    "INSERT INTO presentation_versions(organization_id,presentation_id,version,request_id,input_hash,definition,content,content_hash,template_version,user_id) VALUES($1,$2,1,$3,'h','{}','{}','c','t',$4)",
    [org, presentationId, randomUUID(), userId],
  );
}, 90000);

afterAll(async () => {
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});

test("de helper leest bytes uit de kolom én uit de opslag", async () => {
  const oud = Buffer.from("een oude rij met bytes in de kolom");
  expect(
    (
      await documentBytes(storage, org, { stored: false, asset_id: "x" }, oud)
    ).toString(),
  ).toBe(oud.toString());

  const nieuw = Buffer.from("een nieuwe rij met bytes in de opslag");
  const bewaard = await storeDocument(storage, org, nieuw);
  expect(bewaard.size).toBe(nieuw.length);
  expect(
    (
      await documentBytes(
        storage,
        org,
        { stored: true, asset_id: bewaard.assetId },
        null,
      )
    ).toString(),
  ).toBe(nieuw.toString());
});

test("een rij die naar de opslag wijst zonder object is een fout, geen leeg bestand", async () => {
  await expect(
    documentBytes(storage, org, { stored: true, asset_id: randomUUID() }, null),
  ).rejects.toThrow();
  // En een rij zonder allebei ook.
  await expect(
    documentBytes(
      storage,
      org,
      { stored: false, asset_id: randomUUID() },
      null,
    ),
  ).rejects.toThrow(/ontbreekt/);
});

test("opruimen na een mislukte vastlegging laat niets achter", async () => {
  const bewaard = await storeDocument(storage, org, Buffer.from("weesbestand"));
  await discardDocument(storage, org, bewaard.assetId);
  await expect(
    storage.get({ organizationId: org, assetId: bewaard.assetId }),
  ).rejects.toThrow();
  // Nogmaals opruimen is geen fout; het object was er al niet meer.
  await expect(
    discardDocument(storage, org, bewaard.assetId),
  ).resolves.toBeUndefined();
});

test("de database weigert een documentrij zonder bytes én zonder opslag", async () => {
  for (const { tabel, kolom } of tabellen) {
    const query =
      tabel === "quote_exports"
        ? `INSERT INTO quote_exports(organization_id,quote_id,quote_version,template_version,content_hash,${kolom},${kolom}_hash,stored) VALUES($1,$2,9,'t','c',NULL,'h',false)`
        : `INSERT INTO ${tabel}(organization_id,presentation_id,version,content_hash,${kolom},${kolom}_hash,stored) VALUES($1,$2,9,'c',NULL,'h',false)`;
    await expect(
      db.admin.query(query, [
        org,
        tabel === "quote_exports" ? quoteId : presentationId,
      ]),
      tabel,
    ).rejects.toThrow(new RegExp(`${tabel}_bytes_somewhere`));
  }
});

test("het verhuisscript haalt alle drie de documentsoorten uit de database", async () => {
  const inhoud = new Map<string, Buffer>();
  for (const { tabel, kolom } of tabellen) {
    const bytes = Buffer.from(`inhoud van ${tabel} `.repeat(20));
    inhoud.set(tabel, bytes);
    await legacyRij(tabel, kolom, bytes);
  }

  // Tonen verandert niets.
  const tonen = await moveDocumentsToStorage(db.admin, storage);
  expect(tonen.bekeken).toBe(3);
  expect(tonen.verplaatst).toBe(0);

  const uitvoeren = await moveDocumentsToStorage(db.admin, storage, {
    uitvoeren: true,
  });
  expect(uitvoeren.mislukt).toEqual([]);
  expect(uitvoeren.verplaatst).toBe(3);

  for (const { tabel, kolom } of tabellen) {
    const rij = (
      await db.admin.query(
        `SELECT ${kolom} AS bytes,stored,byte_size,asset_id FROM ${tabel} WHERE organization_id=$1`,
        [org],
      )
    ).rows[0];
    expect(rij.bytes, tabel).toBeNull();
    expect(rij.stored, tabel).toBe(true);
    expect(rij.byte_size, tabel).toBe(inhoud.get(tabel)!.length);
    // Byte voor byte teruggelezen uit de opslag.
    const uitOpslag = Buffer.from(
      await storage.get({ organizationId: org, assetId: rij.asset_id }),
    );
    expect(uitOpslag.equals(inhoud.get(tabel)!), tabel).toBe(true);
  }

  // Nogmaals draaien vindt niets meer te doen.
  const opnieuw = await moveDocumentsToStorage(db.admin, storage, {
    uitvoeren: true,
  });
  expect(opnieuw.bekeken).toBe(0);
  expect(opnieuw.verplaatst).toBe(0);
});

test("elke documentrij krijgt een eigen opaque sleutel", async () => {
  const sleutels = (
    await db.admin.query(
      "SELECT asset_id FROM quote_exports UNION ALL SELECT asset_id FROM presentation_exports UNION ALL SELECT asset_id FROM presentation_decks",
    )
  ).rows.map((r) => r.asset_id as string);
  expect(sleutels.length).toBeGreaterThan(0);
  // Geen enkele sleutel komt twee keer voor, ook niet tussen tabellen.
  expect(new Set(sleutels).size).toBe(sleutels.length);
  // En het is geen tabelnaam of volgnummer, maar een UUID.
  for (const s of sleutels)
    expect(s).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
});

test("de app mag een vastgelegd bestand niet wijzigen of wissen", async () => {
  // Dit is de kern van een onveranderlijke export: de runtime-rol schrijft hem
  // één keer en leest hem daarna alleen. Het verhuisscript draait daarom op een
  // beheerverbinding en niet op deze rol.
  for (const { tabel, kolom } of tabellen) {
    await expect(
      inTenant(db.runtime, org, (c) =>
        c.query(`UPDATE ${tabel} SET ${kolom}='x'`),
      ),
      `${tabel}.${kolom}`,
    ).rejects.toThrow(/permission denied/i);
    await expect(
      inTenant(db.runtime, org, (c) =>
        c.query(`UPDATE ${tabel} SET stored=false`),
      ),
      `${tabel}.stored`,
    ).rejects.toThrow(/permission denied/i);
    await expect(
      inTenant(db.runtime, org, (c) => c.query(`DELETE FROM ${tabel}`)),
      `${tabel} delete`,
    ).rejects.toThrow(/permission denied/i);
  }
});
