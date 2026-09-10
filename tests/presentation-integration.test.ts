import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";
import { makePng } from "./helpers/image";
let db: Awaited<ReturnType<typeof localDatabase>>,
  server: ReturnType<typeof createServer>;
const org = randomUUID(),
  other = randomUUID(),
  origin = "http://127.0.0.1:4312",
  cookies: Record<string, string> = {};
let project = "",
  variantId = "";
const call = (
  method: "GET" | "POST" | "PUT",
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
    ...(payload ? { payload: payload as never } : {}),
  });

beforeAll(async () => {
  await mkdir("work", { recursive: true });
  db = await localDatabase(await mkdtemp("work/presentations-"), 55437);
  const auth = createAuth(db.admin, origin, db.secret, true),
    password = randomBytes(24).toString("hex");
  await db.admin.query(
    "INSERT INTO identity.organization VALUES($1,'Presentatiestudio'),($2,'Andere studio')",
    [org, other],
  );
  server = createServer({
    runtime: db.runtime,
    identity: db.identity,
    baseURL: origin,
    secret: db.secret,
  });
  await server.app.ready();
  for (const role of ["owner", "viewer", "other"]) {
    const email = `${role}@example.test`,
      r = await auth.api.signUpEmail({ body: { email, password, name: role } });
    await db.admin.query("INSERT INTO identity.membership VALUES($1,$2,$3)", [
      role === "other" ? other : org,
      r.user.id,
      role === "other" ? "owner" : role,
    ]);
    const signed = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    cookies[role] = signed.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  const created = await call("POST", "/api/v1/projects", {
    name: "Presentatietest",
    customer: "Fictief",
    description: "",
    demo: true,
  });
  expect(created.statusCode, created.body).toBe(201);
  project = created.json().id;
  variantId = created.json().variantId;
});
afterAll(async () => {
  if (server) await server.app.close();
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});

const make = (template = "extended") => ({
  id: randomUUID(),
  template,
  title: "Interieurvoorstel",
  customer: "Familie Voorbeeld",
  date: "2026-09-10",
  variantId,
  companyName: "Studio Voorbeeld",
});

test("een presentatie maken, bewerken en publiceren", async () => {
  const input = make();
  const created = await call(
    "POST",
    `/api/v1/projects/${project}/presentations`,
    input,
  );
  expect(created.statusCode, created.body).toBe(200);
  expect(created.json().definition.blocks.length).toBeGreaterThan(4);
  expect(created.json().published_version).toBeNull();

  // Het concept bewerken raakt gepubliceerde versies niet.
  const definition = created.json().definition;
  definition.blocks = definition.blocks.map((b: { type: string }) =>
    b.type === "text" ? { ...b, body: "Een rustige basis." } : b,
  );
  const saved = await call(
    "PUT",
    `/api/v1/presentations/${input.id}`,
    definition,
  );
  expect(saved.statusCode, saved.body).toBe(200);
  expect(JSON.stringify(saved.json().definition)).toContain("rustige basis");

  const published = await call(
    "POST",
    `/api/v1/presentations/${input.id}/versions`,
    { requestId: randomUUID() },
  );
  expect(published.statusCode, published.body).toBe(200);
  expect(published.json()).toEqual({ version: 1, replayed: false });

  const versions = await call(
    "GET",
    `/api/v1/presentations/${input.id}/versions`,
  );
  expect(versions.json().items).toHaveLength(1);
  expect(versions.json().items[0].template_version).toBe("presentation-1");
  expect(versions.json().items[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
});

test("hetzelfde publicatieverzoek levert geen tweede publicatie op", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  const requestId = randomUUID();
  const first = await call(
    "POST",
    `/api/v1/presentations/${input.id}/versions`,
    { requestId },
  );
  const again = await call(
    "POST",
    `/api/v1/presentations/${input.id}/versions`,
    { requestId },
  );
  expect(first.json()).toEqual({ version: 1, replayed: false });
  expect(again.json()).toEqual({ version: 1, replayed: true });
  const versions = await call(
    "GET",
    `/api/v1/presentations/${input.id}/versions`,
  );
  expect(versions.json().items).toHaveLength(1);
});

test("een gepubliceerde versie verandert niet meer als het ontwerp verandert", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  await call("POST", `/api/v1/presentations/${input.id}/versions`, {
    requestId: randomUUID(),
  });
  const before = await call(
    "GET",
    `/api/v1/presentations/${input.id}/outdated`,
  );
  expect(before.json().changed).toEqual([]);

  // Het ontwerp wijzigen: de publicatie blijft, maar het concept meldt het.
  const lease = randomUUID();
  await call("POST", `/api/v1/variants/${variantId}/lease`, { leaseId: lease });
  const document = (
    await call("GET", `/api/v1/variants/${variantId}/document`)
  ).json();
  const moved = await call("POST", `/api/v1/variants/${variantId}/commands`, {
    commandId: randomUUID(),
    baseRevision: document.revision,
    leaseId: lease,
    operations: [
      { type: "SetItemDisplay", ids: [document.items[0].id], hidden: true },
    ],
  });
  expect(moved.statusCode, moved.body).toBe(200);

  const after = await call("GET", `/api/v1/presentations/${input.id}/outdated`);
  expect(after.json().changed).toHaveLength(1);
  expect(after.json().changed[0].was).toBe(document.revision);
  expect(after.json().changed[0].now).toBe(document.revision + 1);
  expect(after.json().published).toBe(1);
});

test("PDF, deellink en intrekken", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  await call("POST", `/api/v1/presentations/${input.id}/versions`, {
    requestId: randomUUID(),
  });
  const path = `/api/v1/presentations/${input.id}/versions/1`;
  const pdf = await call("GET", `${path}/pdf`);
  expect(pdf.statusCode, pdf.body.slice(0, 120)).toBe(200);
  expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  // Nog eens ophalen levert exact hetzelfde bestand.
  const again = await call("GET", `${path}/pdf`);
  expect(again.headers["x-content-sha256"]).toBe(
    pdf.headers["x-content-sha256"],
  );

  const shareId = randomUUID();
  const share = await call("POST", `${path}/shares`, { id: shareId, days: 14 });
  expect(share.statusCode, share.body).toBe(200);
  const token = share.json().token as string;
  const open = await server.app.inject({
    method: "GET",
    url: `/api/v1/presentation-shares/${org}/${token}`,
  });
  expect(open.statusCode).toBe(200);
  expect(open.rawPayload.subarray(0, 4).toString()).toBe("%PDF");

  await call("POST", `/api/v1/presentation-shares/${shareId}/revoke`);
  const closed = await server.app.inject({
    method: "GET",
    url: `/api/v1/presentation-shares/${org}/${token}`,
  });
  expect(closed.statusCode).toBe(404);
  // Nog eens intrekken blijft goed gaan.
  expect(
    (await call("POST", `/api/v1/presentation-shares/${shareId}/revoke`))
      .statusCode,
  ).toBe(200);
});

test("viewers lezen wel en schrijven niet; een andere organisatie ziet niets", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  const list = await call(
    "GET",
    `/api/v1/projects/${project}/presentations`,
    undefined,
    "viewer",
  );
  expect(list.statusCode).toBe(200);
  const blocked = await call(
    "POST",
    `/api/v1/projects/${project}/presentations`,
    make(),
    "viewer",
  );
  expect(blocked.statusCode).toBe(403);
  const stranger = await call(
    "GET",
    `/api/v1/presentations/${input.id}`,
    undefined,
    "other",
    other,
  );
  expect(stranger.statusCode).toBe(404);
});

test("een presentatie in een onbekend project bestaat niet", async () => {
  const missing = await call(
    "POST",
    `/api/v1/projects/${randomUUID()}/presentations`,
    make(),
  );
  expect(missing.statusCode).toBe(404);
  const version = await call(
    "GET",
    `/api/v1/presentations/${randomUUID()}/versions`,
  );
  expect(version.statusCode).toBe(404);
});

test("exporttaken zijn idempotent, herstartbaar en leveren echte bestanden", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  await call("POST", `/api/v1/presentations/${input.id}/versions`, {
    requestId: randomUUID(),
  });
  const path = `/api/v1/presentations/${input.id}/versions/1`;

  // Dezelfde export twee keer vragen levert dezelfde taak op.
  const first = await call("POST", `${path}/exports`, {
    id: randomUUID(),
    format: "pptx",
  });
  expect(first.statusCode, first.body).toBe(200);
  const again = await call("POST", `${path}/exports`, {
    id: randomUUID(),
    format: "pptx",
  });
  expect(again.json().id).toBe(first.json().id);
  expect(again.json().input_revision).toMatch(/^[0-9a-f]{64}$/);

  // De werker draait in hetzelfde proces; even wachten tot hij klaar is.
  let job = first.json();
  for (let i = 0; i < 60 && job.status !== "done"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    job = (await call("GET", `/api/v1/export-jobs/${first.json().id}`)).json();
  }
  expect(job.status, job.error ?? "").toBe("done");
  expect(job.result_hash).toMatch(/^[0-9a-f]{64}$/);

  const pptx = await call("GET", `${path}/pptx`);
  expect(pptx.statusCode, pptx.body.slice(0, 120)).toBe(200);
  // Een pptx is een zip; die begint met PK.
  expect(pptx.rawPayload.subarray(0, 2).toString()).toBe("PK");
  expect(pptx.headers["x-content-sha256"]).toBe(job.result_hash);

  // Nog eens exporteren maakt geen tweede bestand.
  const third = await call("POST", `${path}/exports`, {
    id: randomUUID(),
    format: "pptx",
  });
  expect(third.json().status).toBe("done");
  expect(third.json().result_hash).toBe(job.result_hash);
  const list = await call("GET", `/api/v1/presentations/${input.id}/exports`);
  expect(
    list.json().items.filter((j: { format: string }) => j.format === "pptx"),
  ).toHaveLength(1);
});

test("een PowerPoint die nog niet gemaakt is, is niet te downloaden", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  await call("POST", `/api/v1/presentations/${input.id}/versions`, {
    requestId: randomUUID(),
  });
  const pptx = await call(
    "GET",
    `/api/v1/presentations/${input.id}/versions/1/pptx`,
  );
  expect(pptx.statusCode).toBe(409);
  expect(pptx.json().message).toContain("nog niet gemaakt");
});

test("exporteren kan alleen van een gepubliceerde versie", async () => {
  const input = make("compact");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  const missing = await call(
    "POST",
    `/api/v1/presentations/${input.id}/versions/1/exports`,
    { id: randomUUID(), format: "pdf" },
  );
  expect(missing.statusCode).toBe(404);
  expect(missing.json().message).toContain("Publiceer eerst");
});

test("de beeldbank vult een moodboard en dat beeld staat in de presentatie", async () => {
  const input = make("extended");
  const created = await call(
    "POST",
    `/api/v1/projects/${project}/presentations`,
    input,
  );
  expect(created.statusCode, created.body).toBe(200);

  // Een echte afbeelding uploaden; die komt in dezelfde opslag als de
  // onderleggers en verschijnt dus in de beeldbank.
  const assetId = randomUUID();
  const uploaded = await server.app.inject({
    method: "POST",
    url: `/api/v1/underlay-assets/${assetId}`,
    headers: {
      origin,
      cookie: cookies.owner,
      "x-organization-id": org,
      "content-type": "application/octet-stream",
    },
    payload: makePng(40, 30),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(200);
  const bank = await call("GET", "/api/v1/images");
  expect(bank.statusCode, bank.body).toBe(200);
  expect(bank.json().items.some((i: { id: string }) => i.id === assetId)).toBe(
    true,
  );
  // De bytes zelf staan er niet in; die worden per afbeelding opgehaald.
  expect(bank.body).not.toContain("bytes");

  const definition = created.json().definition;
  definition.blocks = definition.blocks.map((b: { type: string }) =>
    b.type === "moodboard"
      ? { ...b, images: [{ assetId, caption: "Rustige tinten" }] }
      : b,
  );
  expect(
    definition.blocks.filter((b: { type: string }) => b.type === "moodboard"),
  ).toHaveLength(1);
  expect(
    (await call("PUT", `/api/v1/presentations/${input.id}`, definition))
      .statusCode,
  ).toBe(200);
  await call("POST", `/api/v1/presentations/${input.id}/versions`, {
    requestId: randomUUID(),
  });
  const view = await call(
    "GET",
    `/api/v1/presentations/${input.id}/versions/1/view`,
  );
  expect(view.statusCode, view.body.slice(0, 200)).toBe(200);
  expect(view.headers["content-type"]).toContain("text/html");
  expect(view.body).toContain("Rustige tinten");
  // Het beeld zit in de pagina zelf, dus de klant hoeft nergens in te loggen.
  expect(view.body).toContain('<img src="data:image/png;base64,');
});

test("een deellink opent de presentatie in de browser", async () => {
  const input = make("extended");
  await call("POST", `/api/v1/projects/${project}/presentations`, input);
  await call("POST", `/api/v1/presentations/${input.id}/versions`, {
    requestId: randomUUID(),
  });
  const shareId = randomUUID();
  const share = await call(
    "POST",
    `/api/v1/presentations/${input.id}/versions/1/shares`,
    { id: shareId, days: 7 },
  );
  expect(share.statusCode, share.body).toBe(200);
  const token = share.json().token as string;
  const open = await server.app.inject({
    method: "GET",
    url: `/api/v1/presentation-shares/${org}/${token}/view`,
  });
  expect(open.statusCode, open.body.slice(0, 200)).toBe(200);
  expect(open.body).toContain("<!doctype html>");
  expect(open.body).toContain(input.title);
  expect(open.body).toContain("Versie 1");
  // De maatvaste PDF staat als knop in de pagina.
  expect(open.body).toContain(
    `href="/api/v1/presentation-shares/${org}/${token}"`,
  );
  expect(open.body).toContain("Alleen de PDF is maatvast");
  // De pagina mag niets van buiten laden en niet als iets anders gelezen worden.
  expect(open.headers["content-security-policy"]).toContain(
    "default-src 'none'",
  );
  expect(open.headers["x-content-type-options"]).toBe("nosniff");

  // Een ingetrokken link toont niets meer, ook niet in de browser.
  await call("POST", `/api/v1/presentation-shares/${shareId}/revoke`);
  expect(
    (
      await server.app.inject({
        method: "GET",
        url: `/api/v1/presentation-shares/${org}/${token}/view`,
      })
    ).statusCode,
  ).toBe(404);
  // En de link van de ene werkruimte werkt niet in de andere.
  expect(
    (
      await server.app.inject({
        method: "GET",
        url: `/api/v1/presentation-shares/${other}/${token}/view`,
      })
    ).statusCode,
  ).toBe(404);
});
