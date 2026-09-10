import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";
import { inTenant } from "../packages/db/src/index";
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
const definition = () => ({
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
  expect((await call("POST", path, d, "finance")).statusCode).toBe(200);
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
  const frozen = (await call("GET", path))
    .json()
    .items.find((q: any) => q.id === d.id);
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
