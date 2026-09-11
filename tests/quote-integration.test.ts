import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";
import { inTenant } from "../packages/db/src/index";
import type { QuoteDefinition } from "../packages/contracts/src/quotes";
let db: Awaited<ReturnType<typeof localDatabase>>,
  server: ReturnType<typeof createServer>;
const org = randomUUID(),
  other = randomUUID(),
  origin = "http://127.0.0.1:4310",
  cookies: Record<string, string> = {};
let project = "",
  otherProject = "";
const call = (
  method: "GET" | "POST",
  url: string,
  payload?: unknown,
  role = "owner",
  organization = org,
) =>
  server.app.inject({
    method,
    url,
    headers: {
      origin,
      cookie: cookies[role],
      "x-organization-id": organization,
    },
    ...(payload ? { payload: payload as any } : {}),
  });
const definition = (): QuoteDefinition => ({
  seller: "Fictieve studio, Voorbeeldweg 2",
  customer: "Fictieve klant, Voorbeeldstraat 1",
  title: "Interieur",
  date: "2026-09-08",
  validUntil: "2026-10-08",
  currency: "EUR",
  terms: "Betaling na levering",
  lines: [
    {
      id: randomUUID(),
      description: "Stoel",
      quantity: "2",
      unit: "stuk",
      unitPrice: "100.005",
      discount: "0",
      taxCategory: "Hoog",
      taxRate: "21",
      source: null,
      priceNote: "Handmatig 8 september",
    },
  ],
});
const draft = () => ({
  id: randomUUID(),
  requestId: randomUUID(),
  baseVersion: 0,
  definition: definition(),
});
beforeAll(async () => {
  await mkdir("work", { recursive: true });
  db = await localDatabase(await mkdtemp("work/quotes-"), 55435);
  const auth = createAuth(db.admin, origin, db.secret, true),
    password = randomBytes(24).toString("hex");
  await db.admin.query(
    "INSERT INTO identity.organization VALUES($1,'Offertestudio'),($2,'Andere studio')",
    [org, other],
  );
  server = createServer({
    runtime: db.runtime,
    identity: db.identity,
    baseURL: origin,
    secret: db.secret,
  });
  await server.app.ready();
  for (const role of ["owner", "finance", "designer", "viewer", "other"]) {
    const email = `${role}@example.test`,
      r = await auth.api.signUpEmail({ body: { email, password, name: role } });
    await db.admin.query("INSERT INTO identity.membership VALUES($1,$2,$3)", [
      role === "other" ? other : org,
      r.user.id,
      role === "other" ? "owner" : role,
    ]);
    // Obtain independent sessions directly, avoiding the UI's login rate limit in setup.
    const signed = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    cookies[role] = signed.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  for (const role of ["owner", "other"]) {
    const r = await call(
      "POST",
      "/api/v1/projects",
      {
        name: "Offertetest",
        customer: "Fictief",
        description: "",
        demo: false,
      },
      role,
      role === "other" ? other : org,
    );
    expect(r.statusCode, r.body).toBe(201);
    if (role === "owner") project = r.json().id;
    else otherProject = r.json().id;
  }
});
afterAll(async () => {
  if (server) await server.app.close();
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});
test("finance mag offertes beheren; designer/viewer en andere organisaties niet", async () => {
  const path = `/api/v1/projects/${project}/quotes`,
    d = draft();
  d.definition.lines[0] = {
    ...d.definition.lines[0]!,
    purchaseUnitPrice: "60.00",
    purchaseNote: "Fictieve leverancier 10 september",
  };
  const saved = await call("POST", path, d, "finance");
  expect(saved.statusCode).toBe(200);
  expect(saved.json().totals.commercial).toMatchObject({
    knownCost: "120.00",
    margin: "80.01",
    marginPercent: "40.00",
    missingLineIds: [],
  });
  for (const role of ["designer", "viewer"]) {
    expect((await call("GET", path, undefined, role)).statusCode).toBe(403);
    expect((await call("POST", path, draft(), role)).statusCode).toBe(403);
    expect(
      (
        await call(
          "POST",
          `${path}/${d.id}/finalize`,
          { requestId: randomUUID(), baseVersion: 1 },
          role,
        )
      ).statusCode,
    ).toBe(403);
  }
  expect((await call("GET", path, undefined, "other", other)).statusCode).toBe(
    404,
  );
  expect(
    (await call("POST", `/api/v1/projects/${otherProject}/quotes`, draft()))
      .statusCode,
  ).toBe(404);
  expect((await call("GET", path, undefined, "other", org)).statusCode).toBe(
    404,
  );
});
test("auditoverzicht toont opslaan en definitief maken met versie, actor en rechten", async () => {
  const path = `/api/v1/projects/${project}/quotes`,
    d = draft();
  expect((await call("POST", path, d, "finance")).statusCode).toBe(200);
  expect(
    (
      await call(
        "POST",
        path,
        { ...d, requestId: randomUUID(), baseVersion: 1 },
        "finance",
      )
    ).statusCode,
  ).toBe(200);
  const final = await call(
    "POST",
    `${path}/${d.id}/finalize`,
    { requestId: randomUUID(), baseVersion: 2 },
    "owner",
  );
  expect(final.statusCode, final.body).toBe(200);
  const audit = await call("GET", `${path}/${d.id}/audit`);
  expect(audit.statusCode, audit.body).toBe(200);
  const items = audit.json().items as {
    action: string;
    version: number | null;
    number: string | null;
    user_name: string;
    user_email: string;
    created_at: string;
  }[];
  // Nieuwste eerst, met de versie waarop de handeling sloeg.
  expect(
    items.map((a) => [a.action, a.version, a.number, a.user_name]),
  ).toEqual([
    ["quote.finalized", 3, final.json().number, "owner"],
    ["quote.saved", 2, null, "finance"],
    ["quote.saved", 1, null, "finance"],
  ]);
  expect(items[0]!.user_email).toBe("owner@example.test");
  expect(Number.isFinite(Date.parse(items[0]!.created_at))).toBe(true);
  // Deellinks: het delen en intrekken landen bij de juiste versie. De PDF is
  // hier vooraf opgeslagen, zodat deze proef de registratie toetst en niet de
  // renderer; het renderpad heeft zijn eigen tests.
  await db.admin.query(
    "INSERT INTO quote_exports(organization_id,quote_id,quote_version,template_version,content_hash,pdf,pdf_hash) VALUES($1,$2,3,'test','x',$3,'y')",
    [org, d.id, Buffer.from("%PDF-1.4 fixture")],
  );
  const share = await call("POST", `${path}/${d.id}/versions/3/shares`, {
    id: randomUUID(),
    days: 7,
  });
  expect(share.statusCode, share.body).toBe(200);
  expect(
    (await call("POST", `/api/v1/quote-shares/${share.json().id}/revoke`, {}))
      .statusCode,
  ).toBe(200);
  const afterShare = (await call("GET", `${path}/${d.id}/audit`)).json()
    .items as { action: string; version: number | null }[];
  expect(afterShare.slice(0, 2).map((a) => [a.action, a.version])).toEqual([
    ["quote.share_revoked", 3],
    ["quote.share_created", 3],
  ]);
  // Een andere offerte in hetzelfde project deelt de registratie niet.
  const e = draft();
  expect((await call("POST", path, e)).statusCode).toBe(200);
  expect(
    (await call("GET", `${path}/${e.id}/audit`)).json().items,
  ).toHaveLength(1);
  // Alleen finance-rollen; onbekende offertes en andere organisaties niets.
  for (const role of ["designer", "viewer"])
    expect(
      (await call("GET", `${path}/${d.id}/audit`, undefined, role)).statusCode,
    ).toBe(403);
  expect((await call("GET", `${path}/${randomUUID()}/audit`)).statusCode).toBe(
    404,
  );
  expect(
    (
      await call(
        "GET",
        `/api/v1/projects/${otherProject}/quotes/${d.id}/audit`,
        undefined,
        "other",
        other,
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (await call("GET", `${path}/${d.id}/audit`, undefined, "other", org))
      .statusCode,
  ).toBe(404);
});
test("retries, conflictcontrole, unieke gelijktijdige nummering en prijsfreeze", async () => {
  const path = `/api/v1/projects/${project}/quotes`,
    a = draft(),
    b = draft();
  const results = await Promise.all([
    call("POST", path, a),
    call("POST", path, a),
  ]);
  results.forEach((r) => expect(r.statusCode, r.body).toBe(200));
  expect(results[0]!.json().version).toBe(1);
  expect(results[1]!.json().version).toBe(1);
  expect(
    (
      await call("POST", path, {
        ...a,
        definition: { ...a.definition, title: "Anders" },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await call("POST", path, { ...a, requestId: randomUUID() })).statusCode,
  ).toBe(409);
  await call("POST", path, b);
  const fa = { requestId: randomUUID(), baseVersion: 1 };
  const finalized = await Promise.all([
    call("POST", `${path}/${a.id}/finalize`, fa),
    call("POST", `${path}/${b.id}/finalize`, {
      requestId: randomUUID(),
      baseVersion: 1,
    }),
  ]);
  finalized.forEach((r) => expect(r.statusCode, r.body).toBe(200));
  expect(new Set(finalized.map((r) => r.json().number)).size).toBe(2);
  expect(finalized[0]!.json()).toMatchObject({
    version: 2,
    totals: { net: "200.01", tax: "42.00", total: "242.01" },
  });
  expect(
    (await call("POST", `${path}/${a.id}/finalize`, fa)).json().number,
  ).toBe(finalized[0]!.json().number);
  expect(
    (
      await call("POST", path, {
        ...a,
        requestId: randomUUID(),
        baseVersion: 2,
        definition: { ...a.definition, customer: "Gewijzigd" },
      })
    ).statusCode,
  ).toBe(409);
  await expect(
    inTenant(db.runtime, org, (c) =>
      c.query("UPDATE quote_versions SET definition='{}' WHERE id=$1", [a.id]),
    ),
  ).rejects.toThrow(/permission denied/i);
  expect((await db.runtime.query("SELECT * FROM quote_versions")).rows).toEqual(
    [],
  );
});
test("materiaalbron is projectgebonden; wijzigingen vereisen expliciet nieuw bronversienummer", async () => {
  const material = {
    entryId: randomUUID(),
    versionId: randomUUID(),
    baseVersion: 0,
    definition: {
      name: "Eiken vloer",
      category: "Vloer",
      room: "Woonkamer",
      supplier: "",
      collection: "",
      sku: "",
      colorCode: "",
      unit: "m²",
      quantity: "20",
      quantityReason: "Ingemeten",
      status: "chosen",
      confirmationDate: null,
      confirmationNote: "",
      notes: "",
    },
  };
  const mp = `/api/v1/projects/${project}/materials`,
    path = `/api/v1/projects/${project}/quotes`;
  expect((await call("POST", mp, material)).statusCode).toBe(200);
  const d = {
    ...draft(),
    definition: {
      ...definition(),
      lines: [
        {
          ...definition().lines[0]!,
          source: { entryId: material.entryId, versionId: material.versionId },
        },
      ],
    },
  };
  expect((await call("POST", path, d)).statusCode).toBe(200);
  const newer = {
    ...material,
    versionId: randomUUID(),
    baseVersion: 1,
    definition: { ...material.definition, quantity: "25" },
  };
  expect((await call("POST", mp, newer)).statusCode).toBe(200);
  const diff = await call("GET", `${path}/${d.id}/differences`);
  expect(diff.json().changes[0]).toMatchObject({
    previous: { quantity: "20" },
    current: { quantity: "25" },
  });
  expect(
    (
      await call("POST", `${path}/${d.id}/finalize`, {
        requestId: randomUUID(),
        baseVersion: 1,
      })
    ).json().code,
  ).toBe("STALE_SOURCE");
  d.definition.lines[0]!.source.versionId = newer.versionId;
  expect(
    (
      await call("POST", path, {
        ...d,
        baseVersion: 1,
        requestId: randomUUID(),
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call("POST", `${path}/${d.id}/finalize`, {
        requestId: randomUUID(),
        baseVersion: 2,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call("POST", mp, {
        ...newer,
        baseVersion: 2,
        versionId: randomUUID(),
        definition: { ...newer.definition, quantity: "30" },
      })
    ).statusCode,
  ).toBe(200);
  const frozen = (await call("GET", `${path}/${d.id}/versions/3`)).json();
  expect(frozen.definition.lines[0].source.versionId).toBe(newer.versionId);
  expect(frozen.totals.total).toBe("242.01");
  const bad = { ...draft(), definition: d.definition };
  bad.definition.lines[0]!.source.versionId = randomUUID();
  expect((await call("POST", path, bad)).statusCode).toBe(400);
  expect(
    (
      await call(
        "POST",
        path,
        { ...draft(), definition: d.definition },
        "other",
        other,
      )
    ).statusCode,
  ).toBe(404);
});
test("lege offerte blijft concept en krijgt geen nummer", async () => {
  const path = `/api/v1/projects/${project}/quotes`,
    d = { ...draft(), definition: { ...definition(), lines: [] } };
  expect((await call("POST", path, d)).json().number).toBeNull();
  expect(
    (
      await call("POST", `${path}/${d.id}/finalize`, {
        requestId: randomUUID(),
        baseVersion: 1,
      })
    ).json().code,
  ).toBe("EMPTY_QUOTE");
});

test("catalogusprijsfreeze, vaste bijlagen, PDF-herhaling en intrekbare exacte versielink", async () => {
  const root = `/api/v1/projects/${project}`,
    path = root + "/quotes";
  const material = {
    entryId: randomUUID(),
    versionId: randomUUID(),
    baseVersion: 0,
    definition: {
      name: "Vloer voor offerte",
      category: "Vloer",
      room: "Woonkamer",
      supplier: "Fictieve leverancier",
      collection: "Eiken",
      sku: "V01",
      colorCode: "Natuurlijk",
      unit: "m²",
      quantity: "20",
      quantityReason: "Handmatig gemeten",
      status: "chosen",
      confirmationDate: null,
      confirmationNote: "",
      notes: "",
    },
  };
  expect((await call("POST", root + "/materials", material)).statusCode).toBe(
    200,
  );
  const price = {
    id: randomUUID(),
    entryId: randomUUID(),
    baseVersion: 0,
    sourceType: "material",
    sourceId: material.entryId,
    unitPrice: "25.00",
    unit: "m²",
    taxCategory: "Hoog",
    taxRate: "21",
    date: "2026-09-08",
    note: "Prijslijst leverancier",
  };
  expect(
    (await call("POST", root + "/quote-prices", price, "finance")).statusCode,
  ).toBe(200);
  expect(
    (await call("POST", root + "/quote-prices", price, "designer")).statusCode,
  ).toBe(403);
  expect(
    (await call("POST", root + "/quote-prices", { ...price, id: randomUUID() }))
      .statusCode,
  ).toBe(409);
  const attachment = {
    id: randomUUID(),
    kind: "text",
    title: "Ontwerpvoorstel",
    text: "Vaste presentatiebijlage <script>alert('x')</script>",
  };
  const a = await call("POST", root + "/quote-attachments", attachment);
  expect(a.statusCode, a.body).toBe(200);
  expect(a.json().html).toContain("&lt;script&gt;");
  expect(a.json().html).not.toContain("<script>");
  const sheet = {
    id: randomUUID(),
    kind: "materials",
    title: "Materiaalkeuzes",
    versionIds: [material.versionId],
  };
  expect(
    (await call("POST", root + "/quote-attachments", sheet)).statusCode,
  ).toBe(200);
  const d: any = draft();
  d.definition.lines = [
    {
      ...d.definition.lines[0],
      quantity: "20",
      unitPrice: price.unitPrice,
      unit: price.unit,
      priceRef: { id: price.id },
      source: { entryId: material.entryId, versionId: material.versionId },
    },
  ];
  d.definition.attachments = [attachment.id, sheet.id];
  expect(
    (
      await call("POST", path, {
        ...d,
        definition: {
          ...d.definition,
          lines: [{ ...d.definition.lines[0], unitPrice: "1" }],
        },
      })
    ).json().code,
  ).toBe("PRICE_MISMATCH");
  expect((await call("POST", path, d)).statusCode).toBe(200);
  const finalized = await call("POST", `${path}/${d.id}/finalize`, {
    requestId: randomUUID(),
    baseVersion: 1,
  });
  expect(finalized.statusCode, finalized.body).toBe(200);
  expect(finalized.json().totals.total).toBe("605.00");
  expect(finalized.json().frozen.attachments).toHaveLength(2);
  const pdfPath = `${path}/${d.id}/versions/2/pdf`;
  const pdf = await call("GET", pdfPath);
  expect(pdf.statusCode, pdf.body.slice(0, 100)).toBe(200);
  expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  await mkdir("outputs/qa", { recursive: true });
  await writeFile("outputs/qa/offerte-api.pdf", pdf.rawPayload);
  expect((await call("GET", pdfPath)).rawPayload.equals(pdf.rawPayload)).toBe(
    true,
  );
  expect((await call("GET", pdfPath, undefined, "viewer")).statusCode).toBe(
    403,
  );
  const shareBody = { id: randomUUID(), days: 7 },
    share = await call("POST", `${path}/${d.id}/versions/2/shares`, shareBody);
  expect(share.statusCode, share.body).toBe(200);
  expect(
    (await call("POST", `${path}/${d.id}/versions/2/shares`, shareBody)).json()
      .path,
  ).toBe(share.json().path);
  const publicPath = share.json().path;
  const publicPdf = await server.app.inject({ method: "GET", url: publicPath });
  expect(publicPdf.rawPayload.equals(pdf.rawPayload)).toBe(true);
  expect(
    (
      await server.app.inject({
        method: "GET",
        url: publicPath.replace(org, other),
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await call("GET", `${path}/${d.id}/history`)).json().items[0].status,
  ).toBe("final");
  const newPrice = {
    ...price,
    id: randomUUID(),
    baseVersion: 1,
    unitPrice: "30.00",
  };
  expect(
    (await call("POST", root + "/quote-prices", newPrice)).statusCode,
  ).toBe(200);
  expect((await call("GET", pdfPath)).rawPayload.equals(pdf.rawPayload)).toBe(
    true,
  );
  const reviseBody = { requestId: randomUUID(), baseVersion: 2 };
  const revised = await call("POST", `${path}/${d.id}/revise`, reviseBody);
  expect(revised.statusCode, revised.body).toBe(200);
  expect(
    (await call("POST", `${path}/${d.id}/revise`, reviseBody)).json().version,
  ).toBe(3);
  expect(
    (
      await call("POST", `${path}/${d.id}/finalize`, {
        requestId: randomUUID(),
        baseVersion: 3,
      })
    ).json().code,
  ).toBe("STALE_PRICE");
  const diffs = (await call("GET", `${path}/${d.id}/differences`)).json()
    .changes;
  expect(diffs[0]).toMatchObject({
    kind: "price",
    previous: { unitPrice: "25.00" },
    current: { unitPrice: "30.00" },
  });
  const updated = revised.json().definition;
  updated.lines[0].priceRef.id = newPrice.id;
  updated.lines[0].unitPrice = newPrice.unitPrice;
  expect(
    (
      await call("POST", path, {
        id: d.id,
        requestId: randomUUID(),
        baseVersion: 3,
        definition: updated,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call("POST", `${path}/${d.id}/finalize`, {
        requestId: randomUUID(),
        baseVersion: 4,
      })
    ).statusCode,
  ).toBe(200);
  const hist = (await call("GET", `${path}/${d.id}/history`)).json().items;
  expect(hist.find((q: any) => q.version === 2)).toMatchObject({
    status: "replaced",
    totals: { total: "605.00" },
  });
  expect(hist[0].totals.total).toBe("726.00");
  expect(
    (
      await server.app.inject({ method: "GET", url: publicPath })
    ).rawPayload.equals(pdf.rawPayload),
  ).toBe(true);
  expect(
    (
      await call(
        "POST",
        `/api/v1/quote-shares/${shareBody.id}/revoke`,
        {},
        "viewer",
      )
    ).statusCode,
  ).toBe(403);
  const revokePath = `/api/v1/quote-shares/${shareBody.id}/revoke`;
  expect((await call("POST", revokePath, {}, "other", other)).statusCode).toBe(
    404,
  );
  const revoked = await Promise.all([
    call("POST", revokePath, {}),
    call("POST", revokePath, {}),
  ]);
  expect(revoked.map((r) => r.statusCode)).toEqual([200, 200]);
  expect((await call("POST", revokePath, {})).statusCode).toBe(200);
  const revocations = await db.admin.query(
    `SELECT a.organization_id, u.name FROM audit_events a
     JOIN identity."user" u ON u.id=a.user_id
     WHERE a.action='quote.share_revoked' AND a.subject_id=$1`,
    [shareBody.id],
  );
  expect(revocations.rows).toEqual([{ organization_id: org, name: "owner" }]);
  expect(
    (await server.app.inject({ method: "GET", url: publicPath })).statusCode,
  ).toBe(404);
  const exp = await call("POST", `${path}/${d.id}/versions/2/shares`, {
    id: randomUUID(),
    days: 1,
  });
  await db.admin.query(
    "UPDATE quote_shares SET expires_at=now()-interval '1 second' WHERE token_hash IS NOT NULL AND id=$1",
    [exp.json().id],
  );
  expect(
    (await server.app.inject({ method: "GET", url: exp.json().path }))
      .statusCode,
  ).toBe(404);
  await expect(
    inTenant(db.runtime, org, (c) =>
      c.query("UPDATE quote_exports SET pdf='x' WHERE quote_id=$1", [d.id]),
    ),
  ).rejects.toThrow(/permission denied/i);
}, 90000);

test("expliciete statusovergangen, bewijs, herhaalveiligheid en finance-rechten", async () => {
  const path = `/api/v1/projects/${project}/quotes`,
    d = draft();
  expect((await call("POST", path, d)).statusCode).toBe(200);
  await call("POST", `${path}/${d.id}/finalize`, {
    requestId: randomUUID(),
    baseVersion: 1,
  });
  const endpoint = `${path}/${d.id}/versions/2/events`,
    event = {
      requestId: randomUUID(),
      baseEventVersion: 0,
      status: "sent",
      occurredOn: "2026-09-08",
      actor: "Fictieve studio",
      evidence: "Handmatig verstuurd per e-mail, onderwerp Offerte",
    };
  // Migration 0011 leaves pre-existing commercial snapshots intact, without a hash.
  await db.admin.query(
    "UPDATE quote_versions SET content_hash=NULL WHERE id=$1 AND version=2",
    [d.id],
  );
  const pdf = await call("GET", `${path}/${d.id}/versions/2/pdf`);
  expect(pdf.statusCode, pdf.body.slice(0, 100)).toBe(200);
  const exportedHash = (
    await db.admin.query(
      "SELECT content_hash FROM quote_exports WHERE quote_id=$1 AND quote_version=2",
      [d.id],
    )
  ).rows[0].content_hash;
  expect(
    (await call("POST", endpoint, { ...event, status: "accepted" })).json()
      .code,
  ).toBe("INVALID_TRANSITION");
  expect(
    (await call("POST", endpoint, { ...event, evidence: "" })).statusCode,
  ).toBe(400);
  expect((await call("POST", endpoint, event, "designer")).statusCode).toBe(
    403,
  );
  const r = await call("POST", endpoint, event, "finance");
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().content_hash).toBe(exportedHash);
  expect(
    (await call("POST", endpoint, event, "finance")).json().event_version,
  ).toBe(1);
  expect(
    (
      await call(
        "POST",
        endpoint,
        { ...event, evidence: "Gewijzigde retry" },
        "finance",
      )
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await call("POST", endpoint, {
        ...event,
        requestId: randomUUID(),
        status: "accepted",
        baseEventVersion: 0,
      })
    ).statusCode,
  ).toBe(409);
  const accepted = await call("POST", endpoint, {
    ...event,
    requestId: randomUUID(),
    status: "accepted",
    baseEventVersion: 1,
    actor: "Familie Voorbeeld",
    evidence: "E-mail akkoord klant",
  });
  expect(accepted.statusCode, accepted.body).toBe(200);
  expect(accepted.json().content_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (
      await call("POST", endpoint, {
        ...event,
        requestId: randomUUID(),
        status: "rejected",
        baseEventVersion: 2,
      })
    ).statusCode,
  ).toBe(409);
  expect((await call("GET", endpoint)).json().items).toHaveLength(2);
  expect(
    (await call("GET", endpoint, undefined, "other", other)).statusCode,
  ).toBe(404);
  await expect(
    inTenant(db.runtime, org, (c) =>
      c.query("DELETE FROM quote_events WHERE quote_id=$1", [d.id]),
    ),
  ).rejects.toThrow(/permission denied/i);
  const expired = draft();
  expired.definition.date = "2026-09-01";
  expired.definition.validUntil = "2026-09-02";
  await call("POST", path, expired);
  await call("POST", `${path}/${expired.id}/finalize`, {
    requestId: randomUUID(),
    baseVersion: 1,
  });
  expect(
    (
      await call("POST", `${path}/${expired.id}/versions/2/events`, {
        ...event,
        requestId: randomUUID(),
        status: "expired",
        occurredOn: "2026-09-01",
      })
    ).json().code,
  ).toBe("NOT_EXPIRED");
  expect(
    (
      await call("POST", `${path}/${expired.id}/versions/2/events`, {
        ...event,
        requestId: randomUUID(),
        status: "expired",
      })
    ).statusCode,
  ).toBe(200);
});

test("berekende materialen, planrevisies en dubbele productroutes worden gecontroleerd", async () => {
  const p = (
    await call("POST", "/api/v1/projects", {
      name: "Broncontrole",
      customer: "Fictief",
      description: "",
      demo: true,
    })
  ).json();
  const root = `/api/v1/projects/${p.id}`;
  // Seed an explicit supplier article in this isolated test project's scene.
  p.scene.items[0].catalog = {
    supplier: "Testleverancier",
    sku: "STOEL-1",
    category: "Stoel",
    description: "Teststoel",
    keywords: [],
  };
  await db.admin.query(
    "UPDATE design_documents SET document=$1 WHERE variant_id=$2",
    [p.scene, p.variantId],
  );
  const revision = (
    await call("POST", `/api/v1/variants/${p.variantId}/revisions`, {
      name: "Eerste plan",
    })
  ).json();
  const measured = (
    await call("GET", root + `/quantities?variantId=${p.variantId}`)
  ).json();
  const material = {
    entryId: randomUUID(),
    versionId: randomUUID(),
    baseVersion: 0,
    definition: {
      name: "Testmateriaal",
      category: "Vloer",
      room: "Woonkamer",
      supplier: "Testleverancier",
      sku: "STOEL-1",
      collection: "",
      colorCode: "",
      unit: "m²",
      quantity: null,
      quantityReason: "",
      status: "chosen",
      confirmationDate: null,
      confirmationNote: "",
      notes: "",
    },
    calculation: {
      variantId: p.variantId,
      roomId: measured.rooms[0].id,
      basis: "floor_area",
      wastePercent: "0",
      orderStep: null,
    },
  };
  const saved = await call("POST", root + "/materials", material);
  expect(saved.statusCode, saved.body).toBe(200);
  const d: any = draft();
  d.definition.lines = [
    {
      ...definition().lines[0],
      quantity: "1",
      designSource: {
        variantId: p.variantId,
        revisionId: revision.id,
        itemId: p.scene.items[0].id,
      },
    },
    {
      ...definition().lines[0],
      source: { entryId: material.entryId, versionId: material.versionId },
    },
  ];
  expect((await call("POST", root + "/quotes", d)).json().code).toBe(
    "POSSIBLE_DOUBLE_COUNT",
  );
  d.definition.lines[1].overlapReason =
    "Afzonderlijke levering voor de tweede kamer";
  const allowed = await call("POST", root + "/quotes", d);
  expect(allowed.statusCode, allowed.body).toBe(200);
  p.scene.revision = 1;
  await db.admin.query(
    "UPDATE design_documents SET document=$1,revision=1 WHERE variant_id=$2",
    [p.scene, p.variantId],
  );
  const newer = (
    await call("POST", `/api/v1/variants/${p.variantId}/revisions`, {
      name: "Nieuw plan",
    })
  ).json();
  const plan = {
    id: randomUUID(),
    kind: "plan",
    title: "Nieuw plan",
    revisionId: newer.id,
    scale: 50,
  };
  expect(
    (await call("POST", root + "/quote-attachments", plan)).statusCode,
  ).toBe(200);
  const mismatch = {
    ...draft(),
    definition: {
      ...d.definition,
      lines: [d.definition.lines[1]],
      attachments: [plan.id],
    },
  };
  expect((await call("POST", root + "/quotes", mismatch)).json().code).toBe(
    "INCONSISTENT_REVISIONS",
  );
  const firstSheet = {
    id: randomUUID(),
    kind: "materials",
    title: "Oude materialen",
    versionIds: [material.versionId],
  };
  expect(
    (await call("POST", root + "/quote-attachments", firstSheet)).statusCode,
  ).toBe(200);
  const v2 = { ...material, baseVersion: 1, versionId: randomUUID() };
  expect((await call("POST", root + "/materials", v2)).statusCode).toBe(200);
  const secondSheet = {
    ...firstSheet,
    id: randomUUID(),
    versionIds: [v2.versionId],
  };
  expect(
    (await call("POST", root + "/quote-attachments", secondSheet)).statusCode,
  ).toBe(200);
  const conflictingSheets = {
    ...draft(),
    definition: {
      ...definition(),
      attachments: [firstSheet.id, secondSheet.id],
    },
  };
  expect(
    (await call("POST", root + "/quotes", conflictingSheets)).json().code,
  ).toBe("INCONSISTENT_REVISIONS");
});

test("ontwerpbron en planbijlage behouden dezelfde revisie en weigeren dubbele objecten", async () => {
  const designProject = (
    await call("POST", "/api/v1/projects", {
      name: "Ontwerpbronnen",
      customer: "Fictief",
      description: "",
      demo: true,
    })
  ).json();
  const root = `/api/v1/projects/${designProject.id}`,
    path = root + "/quotes";
  const variant = designProject.variantId;
  const a = (
    await call("POST", `/api/v1/variants/${variant}/revisions`, {
      name: "Offerteplan 1",
    })
  ).json();
  const b = (
    await call("POST", `/api/v1/variants/${variant}/revisions`, {
      name: "Offerteplan 2",
    })
  ).json();
  const plan = {
    id: randomUUID(),
    kind: "plan",
    title: "Plan 1:50",
    revisionId: a.id,
    scale: 50,
  };
  expect(
    (await call("POST", root + "/quote-attachments", plan)).statusCode,
  ).toBe(200);
  expect(
    (await call("POST", root + "/quote-attachments", plan)).json().revisionId,
  ).toBe(a.id);
  expect(
    (
      await call("POST", root + "/quote-attachments", {
        ...plan,
        title: "Andere retry",
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await call(
        "POST",
        `/api/v1/projects/${otherProject}/quote-attachments`,
        plan,
        "other",
        other,
      )
    ).statusCode,
  ).toBe(400);
  const second = { ...plan, id: randomUUID(), revisionId: b.id };
  await call("POST", root + "/quote-attachments", second);
  const d: any = draft();
  d.definition.attachments = [plan.id, second.id];
  expect((await call("POST", path, d)).json().code).toBe(
    "INCONSISTENT_REVISIONS",
  );
  d.definition.attachments = [plan.id];
  const item = designProject.scene.items[0];
  d.definition.lines = [
    {
      ...d.definition.lines[0],
      quantity: "1",
      designSource: { variantId: variant, revisionId: a.id, itemId: item.id },
    },
  ];
  expect(
    (
      await call("POST", path, {
        ...d,
        definition: {
          ...d.definition,
          lines: [
            ...d.definition.lines,
            { ...d.definition.lines[0], id: randomUUID() },
          ],
        },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await call("POST", path, {
        ...d,
        definition: {
          ...d.definition,
          lines: [{ ...d.definition.lines[0], quantity: "2" }],
        },
      })
    ).json().code,
  ).toBe("INVALID_QUANTITY");
  expect((await call("POST", path, d)).statusCode).toBe(200);
  expect(
    (
      await call("POST", `${path}/${d.id}/finalize`, {
        requestId: randomUUID(),
        baseVersion: 1,
      })
    ).statusCode,
  ).toBe(200);
  const history = (await call("GET", `${path}/${d.id}/versions/2`)).json();
  expect(history.frozen.sources[0].item.id).toBe(item.id);
  expect(history.frozen.attachments[0].revisionId).toBe(a.id);
  expect(
    (await call("GET", root + `/quote-design/${a.id}`)).json().variantId,
  ).toBe(variant);
  expect(
    (await call("GET", root + `/quote-design/${a.id}`, undefined, "viewer"))
      .statusCode,
  ).toBe(403);
});
