import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";

let db: Awaited<ReturnType<typeof localDatabase>>,
  server: ReturnType<typeof createServer>;
const org = randomUUID(),
  other = randomUUID(),
  origin = "http://127.0.0.1:4310",
  cookies: Record<string, string> = {},
  users: Record<string, string> = {};
/** Projecten: `open` blijft werkruimtebreed, `closed` wordt beperkt. */
let open = { id: "", variantId: "" },
  closed = { id: "", variantId: "" };

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

const newProject = async (name: string) => {
  const r = await call("POST", "/api/v1/projects", {
    name,
    customer: "Fictieve klant",
    description: "",
    demo: true,
  });
  expect(r.statusCode, r.body).toBe(201);
  return { id: r.json().id, variantId: r.json().variantId };
};

beforeAll(async () => {
  await mkdir("work", { recursive: true });
  db = await localDatabase(await mkdtemp("work/access-"), 55437);
  const auth = createAuth(db.admin, origin, db.secret, true),
    password = randomBytes(24).toString("hex");
  await db.admin.query(
    "INSERT INTO identity.organization VALUES($1,'Toegangsstudio'),($2,'Andere studio')",
    [org, other],
  );
  server = createServer({
    runtime: db.runtime,
    identity: db.identity,
    baseURL: origin,
    secret: db.secret,
  });
  await server.app.ready();
  for (const role of [
    "owner",
    "admin",
    "designer",
    "finance",
    "viewer",
    "outsider",
  ]) {
    const email = `${role}@example.test`,
      r = await auth.api.signUpEmail({ body: { email, password, name: role } });
    users[role] = r.user.id;
    await db.admin.query("INSERT INTO identity.membership VALUES($1,$2,$3)", [
      role === "outsider" ? other : org,
      r.user.id,
      role === "outsider" ? "owner" : role,
    ]);
    const signed = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    cookies[role] = (signed.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  open = await newProject("Open project");
  closed = await newProject("Te beperken project");
}, 90000);

afterAll(async () => {
  if (server) await server.app.close();
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});

test("zonder beperking blijft een project werkruimtebreed zichtbaar", async () => {
  for (const role of ["designer", "finance", "viewer"]) {
    const list = await call("GET", "/api/v1/projects", undefined, role);
    expect(list.statusCode, list.body).toBe(200);
    expect(
      list
        .json()
        .items.map((p: { id: string }) => p.id)
        .sort(),
    ).toEqual([open.id, closed.id].sort());
  }
  // Migration 0014 zet bestaande projecten op 'organization'; niemand raakt werk kwijt.
  const members = await call("GET", `/api/v1/projects/${closed.id}/members`);
  expect(members.statusCode, members.body).toBe(200);
  expect(members.json()).toMatchObject({ access: "organization", items: [] });
});

test("beperken sluit niet-leden uit op project-, variant- en offerteroutes", async () => {
  expect(
    (
      await call("POST", `/api/v1/projects/${closed.id}/access`, {
        access: "restricted",
      })
    ).json(),
  ).toEqual({ access: "restricted" });
  for (const role of ["designer", "finance", "viewer"]) {
    // Het project verdwijnt uit de lijst, niet alleen uit het scherm.
    expect(
      (await call("GET", "/api/v1/projects", undefined, role))
        .json()
        .items.map((p: { id: string }) => p.id),
    ).toEqual([open.id]);
    // 404 en geen 403: het bestaan van het project is zelf al informatie.
    for (const url of [
      `/api/v1/projects/${closed.id}/materials`,
      `/api/v1/projects/${closed.id}/quotes`,
      `/api/v1/variants/${closed.variantId}/document`,
      `/api/v1/variants/${closed.variantId}/revisions`,
      `/api/v1/variants/${closed.variantId}/plan.svg`,
    ])
      expect(
        (await call("GET", url, undefined, role)).statusCode,
        `${role} ${url}`,
      ).toBe(404);
    expect(
      (
        await call(
          "POST",
          `/api/v1/variants/${closed.variantId}/lease`,
          { leaseId: randomUUID() },
          role,
        )
      ).statusCode,
    ).toBe(404);
  }
  // Het open project blijft gewoon bereikbaar.
  expect(
    (
      await call(
        "GET",
        `/api/v1/variants/${open.variantId}/document`,
        undefined,
        "designer",
      )
    ).statusCode,
  ).toBe(200);
  // Owner en admin beheren de werkruimte en houden toegang.
  for (const role of ["owner", "admin"])
    expect(
      (
        await call(
          "GET",
          `/api/v1/variants/${closed.variantId}/document`,
          undefined,
          role,
        )
      ).statusCode,
    ).toBe(200);
});

test("een expliciet projectlid krijgt toegang met de toegekende projectrol", async () => {
  expect(
    (
      await call("POST", `/api/v1/projects/${closed.id}/members`, {
        userId: users.viewer,
        role: "designer",
      })
    ).json(),
  ).toEqual({ userId: users.viewer, role: "designer" });
  // De projectrol telt, niet de werkruimterol: deze viewer mag hier tekenen.
  const doc = await call(
    "GET",
    `/api/v1/variants/${closed.variantId}/document`,
    undefined,
    "viewer",
  );
  expect(doc.statusCode, doc.body).toBe(200);
  const leaseId = randomUUID();
  expect(
    (
      await call(
        "POST",
        `/api/v1/variants/${closed.variantId}/lease`,
        { leaseId },
        "viewer",
      )
    ).statusCode,
  ).toBe(200);
  const scene = doc.json();
  const moved = await call(
    "POST",
    `/api/v1/variants/${closed.variantId}/commands`,
    {
      commandId: randomUUID(),
      baseRevision: scene.revision,
      leaseId,
      operations: [
        {
          type: "TransformItem",
          id: scene.items[0].id,
          x: 1500,
          y: 1500,
          width: 2400,
          depth: 950,
          rotation: 0,
          custom: false,
        },
      ],
    },
    "viewer",
  );
  expect(moved.statusCode, moved.body).toBe(200);
  // In het open project blijft dezelfde gebruiker gewoon viewer.
  expect(
    (
      await call(
        "POST",
        `/api/v1/variants/${open.variantId}/lease`,
        { leaseId: randomUUID() },
        "viewer",
      )
    ).statusCode,
  ).toBe(403);
});

test("een projectrol kan ook minder rechten geven dan de werkruimterol", async () => {
  expect(
    (
      await call("POST", `/api/v1/projects/${closed.id}/members`, {
        userId: users.designer,
        role: "viewer",
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call(
        "POST",
        `/api/v1/variants/${closed.variantId}/lease`,
        { leaseId: randomUUID() },
        "designer",
      )
    ).statusCode,
  ).toBe(403);
  // Buiten dit project verandert er niets aan zijn rechten.
  expect(
    (
      await call(
        "POST",
        `/api/v1/variants/${open.variantId}/lease`,
        { leaseId: randomUUID() },
        "designer",
      )
    ).statusCode,
  ).toBe(200);
});

test("owner en admin beheren leden; andere rollen niet, ook niet als projectlid", async () => {
  for (const role of ["designer", "finance", "viewer"]) {
    expect(
      (
        await call(
          "GET",
          `/api/v1/projects/${closed.id}/members`,
          undefined,
          role,
        )
      ).statusCode,
      role,
    ).toBe(403);
    expect(
      (
        await call(
          "POST",
          `/api/v1/projects/${closed.id}/members`,
          { userId: users.finance, role: "designer" },
          role,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          "POST",
          `/api/v1/projects/${closed.id}/access`,
          { access: "organization" },
          role,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await call("GET", "/api/v1/organization/members", undefined, role))
        .statusCode,
    ).toBe(403);
  }
  const list = await call(
    "GET",
    "/api/v1/organization/members",
    undefined,
    "admin",
  );
  expect(list.statusCode, list.body).toBe(200);
  expect(
    list
      .json()
      .items.map((u: { role: string }) => u.role)
      .sort(),
  ).toEqual(["admin", "designer", "finance", "owner", "viewer"]);
  // Een projectrol kent geen owner of admin toe; anders was dit een omweg
  // naar werkruimtebreed ledenbeheer.
  expect(
    (
      await call("POST", `/api/v1/projects/${closed.id}/members`, {
        userId: users.finance,
        role: "admin",
      })
    ).statusCode,
  ).toBe(400);
});

test("lidmaatschap intrekken sluit de toegang weer af en wordt geregistreerd", async () => {
  expect(
    (
      await call(
        "POST",
        `/api/v1/projects/${closed.id}/members/${users.viewer}/remove`,
        {},
      )
    ).json(),
  ).toEqual({ userId: users.viewer, removed: true });
  expect(
    (
      await call(
        "GET",
        `/api/v1/variants/${closed.variantId}/document`,
        undefined,
        "viewer",
      )
    ).statusCode,
  ).toBe(404);
  // Tweemaal intrekken blijft 404 en maakt geen tweede registratie.
  expect(
    (
      await call(
        "POST",
        `/api/v1/projects/${closed.id}/members/${users.viewer}/remove`,
        {},
      )
    ).statusCode,
  ).toBe(404);
  const events = await db.admin.query(
    "SELECT action,detail FROM audit_events WHERE organization_id=$1 AND action IN ('project.access_changed','project.member_set','project.member_removed') ORDER BY created_at",
    [org],
  );
  expect(events.rows.map((r) => r.action)).toEqual([
    "project.access_changed",
    "project.member_set",
    "project.member_set",
    "project.member_removed",
  ]);
  expect(events.rows[0]!.detail).toEqual({ access: "restricted" });
  expect(events.rows[3]!.detail).toEqual({ userId: users.viewer });
});

test("een andere organisatie bereikt project noch ledenbeheer", async () => {
  for (const url of [
    `/api/v1/projects/${closed.id}/members`,
    `/api/v1/projects/${open.id}/members`,
    `/api/v1/projects/${open.id}/materials`,
    `/api/v1/variants/${open.variantId}/document`,
  ])
    expect(
      (await call("GET", url, undefined, "outsider", other)).statusCode,
      url,
    ).toBe(404);
  // Met een vervalste organisatiekop hoort de sessie er niet bij.
  expect(
    (await call("GET", "/api/v1/projects", undefined, "outsider", org))
      .statusCode,
  ).toBe(404);
});
