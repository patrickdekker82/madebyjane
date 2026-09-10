import { makeGlb } from "./helpers/glb";
import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { createAuth } from "../packages/auth/src/index";
import { createServer } from "../apps/api/src/server";
import {
  inTenant,
  assertRuntimeRole,
  assertSchemaCompatible,
  migrate,
} from "../packages/db/src/index";
let db: Awaited<ReturnType<typeof localDatabase>>,
  server: ReturnType<typeof createServer>;
const orgA = randomUUID(),
  orgB = randomUUID(),
  password = randomBytes(24).toString("hex"),
  origin = "http://127.0.0.1:4310";
let cookieA = "",
  cookieB = "",
  cookieViewer = "",
  variant = "",
  scene: any;
async function request(
  method: "GET" | "POST",
  url: string,
  body?: unknown,
  cookie = cookieA,
  org = orgA,
) {
  return server.app.inject({
    method,
    url,
    headers: { origin, cookie, "x-organization-id": org, ...(Buffer.isBuffer(body) ? { "content-type": "application/octet-stream" } : {}) },
    ...(body ? { payload: body as any } : {}),
  });
}
beforeAll(async () => {
  const path = await mkdtemp("work/integration-");
  db = await localDatabase(path, 55433);
  const setup = createAuth(db.admin, origin, db.secret, true);
  for (const [email, org, role] of [
    ["one@example.test", orgA, "owner"],
    ["two@example.test", orgB, "owner"],
    ["viewer@example.test", orgA, "viewer"],
  ] as const) {
    const r = await setup.api.signUpEmail({
      body: { email, password, name: "Test gebruiker" },
    });
    await db.admin.query(
      "INSERT INTO identity.organization VALUES($1,$2) ON CONFLICT DO NOTHING",
      [org, "Test studio"],
    );
    await db.admin.query("INSERT INTO identity.membership VALUES($1,$2,$3)", [
      org,
      r.user.id,
      role,
    ]);
  }
  server = createServer({
    runtime: db.runtime,
    identity: db.identity,
    baseURL: origin,
    secret: db.secret,
  });
  await server.app.ready();
  const cookies = [];
  for (const email of [
    "one@example.test",
    "two@example.test",
    "viewer@example.test",
  ]) {
    const r = await server.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin },
      payload: { email, password },
    });
    expect(r.statusCode, r.body).toBe(200);
    cookies.push(r.cookies.map((c) => c.name + "=" + c.value).join("; "));
  }
  cookieA = cookies[0]!;
  cookieB = cookies[1]!;
  cookieViewer = cookies[2]!;
}, 60000);
afterAll(async () => {
  if (server) await server.app.close();
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});
test("migrations idempotent; runtime geen bypass/eigenaar; zonder context fail-closed", async () => {
  await migrate(db.admin);
  await assertRuntimeRole(db.runtime);
  expect((await db.runtime.query("SELECT * FROM projects")).rows).toEqual([]);
});
test("auth signup gesloten, login cookie HttpOnly en sessie verplicht", async () => {
  const r = await request("POST", "/api/auth/sign-up/email", {
    name: "No",
    email: "no@example.test",
    password,
  });
  expect(r.statusCode).toBe(400);
  expect((await request("GET", "/api/v1/me", undefined, "")).statusCode).toBe(
    401,
  );
  expect(cookieA).toContain("better-auth.session_token");
});
test("project persistent en tweede tenant onzichtbaar, inclusief vervalste org", async () => {
  const r = await request("POST", "/api/v1/projects", {
    name: "Woonkamer test",
    customer: "Fictieve klant",
    description: "Test",
    demo: true,
  });
  expect(r.statusCode, r.body).toBe(201);
  variant = r.json().variantId;
  scene = r.json().scene;
  expect((await request("GET", "/api/v1/projects")).json().items).toHaveLength(
    1,
  );
  expect(
    (await request("GET", "/api/v1/projects", undefined, cookieB, orgB)).json()
      .items,
  ).toHaveLength(0);
  expect(
    (await request("GET", "/api/v1/projects", undefined, cookieB, orgA))
      .statusCode,
  ).toBe(404);
  for (const suffix of ["/document", "/plan.svg"])
    expect(
      (
        await request(
          "GET",
          "/api/v1/variants/" + variant + suffix,
          undefined,
          cookieB,
          orgB,
        )
      ).statusCode,
    ).toBe(404);
});
test("viewer kan lezen maar niet muteren; onbekende origin faalt", async () => {
  expect(
    (
      await request(
        "GET",
        "/api/v1/variants/" + variant + "/document",
        undefined,
        cookieViewer,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await request(
        "POST",
        "/api/v1/projects",
        { name: "Verboden", customer: "", description: "", demo: false },
        cookieViewer,
      )
    ).statusCode,
  ).toBe(403);
  const r = await server.app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: {
      origin: "https://evil.example",
      cookie: cookieA,
      "x-organization-id": orgA,
    },
    payload: { name: "No", customer: "", description: "", demo: false },
  });
  expect(r.statusCode).toBe(403);
});
test("commands atomisch, idempotent, conflictveilig; lease werkt en verloopt", async () => {
  const leaseId = randomUUID(),
    route = "/api/v1/variants/" + variant;
  expect(
    (await request("POST", route + "/lease", { leaseId })).statusCode,
  ).toBe(200);
  expect(
    (await request("POST", route + "/lease", { leaseId: randomUUID() }))
      .statusCode,
  ).toBe(423);
  const item = scene.items[0],
    command = {
      commandId: randomUUID(),
      baseRevision: 0,
      leaseId,
      operations: [
        {
          type: "TransformItem",
          id: item.id,
          x: 2000,
          y: 2500,
          width: 2400,
          depth: 950,
          rotation: 90,
          custom: false,
        },
      ],
    };
  const r = await request("POST", route + "/commands", command);
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().scene.revision).toBe(1);
  expect(
    (await request("POST", route + "/commands", command)).json().replayed,
  ).toBe(true);
  expect(
    (
      await request("POST", route + "/commands", {
        ...command,
        commandId: randomUUID(),
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request("POST", route + "/commands", {
        ...command,
        baseRevision: 1,
      })
    ).statusCode,
  ).toBe(409);
  const bad = {
    ...command,
    commandId: randomUUID(),
    baseRevision: 1,
    operations: [
      ...command.operations,
      {
        type: "AddOpening",
        opening: { ...scene.openings[0], id: randomUUID() },
      },
    ],
  };
  expect((await request("POST", route + "/commands", bad)).statusCode).toBe(
    400,
  );
  expect((await request("GET", route + "/document")).json().revision).toBe(1);
  await inTenant(db.runtime, orgA, (c) =>
    c.query("UPDATE editing_leases SET expires_at=now()-interval '1 second'"),
  );
  expect(
    (
      await request("POST", route + "/commands", {
        ...command,
        commandId: randomUUID(),
        baseRevision: 1,
      })
    ).statusCode,
  ).toBe(423);
  expect(
    (await request("POST", route + "/lease", { leaseId: randomUUID() }))
      .statusCode,
  ).toBe(200);
});
test("pool context wordt gereset en samengestelde FK voorkomt gemengde IDs", async () => {
  for (let i = 0; i < 8; i++) {
    expect(
      (
        await inTenant(db.runtime, orgA, (c) =>
          c.query("SELECT * FROM projects"),
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await inTenant(db.runtime, orgB, (c) =>
          c.query("SELECT * FROM projects"),
        )
      ).rows,
    ).toHaveLength(0);
  }
  expect((await db.runtime.query("SELECT * FROM projects")).rows).toHaveLength(
    0,
  );
  await expect(
    inTenant(db.runtime, orgB, (c) =>
      c.query("INSERT INTO design_variants VALUES($1,$2,$3,$4)", [
        orgB,
        randomUUID(),
        scene.projectId,
        "mixed",
      ]),
    ),
  ).rejects.toThrow();
});
test("revisie immutable voor runtime en private planexport", async () => {
  const r = await request(
    "POST",
    "/api/v1/variants/" + variant + "/revisions",
    { name: "Presentatiebasis" },
  );
  expect(r.statusCode).toBe(200);
  await expect(
    inTenant(db.runtime, orgA, (c) =>
      c.query("UPDATE design_revisions SET name=$1", ["gewijzigd"]),
    ),
  ).rejects.toThrow(/permission denied/);
  const svg = await request("GET", "/api/v1/variants/" + variant + "/plan.svg");
  expect(svg.statusCode).toBe(200);
  expect(svg.body).toContain("297mm");
});
test("revisieherstel bewaart voorganger, is idempotent en tenantgebonden", async () => {
  const route = "/api/v1/variants/" + variant;
  const before = (await request("GET", route + "/document")).json();
  const saved = (
    await request("POST", route + "/revisions", { name: "Herstelbasis" })
  ).json();
  await db.admin.query(
    "UPDATE editing_leases SET expires_at=now()-interval '1 second'",
  );
  const leaseId = randomUUID();
  expect(
    (await request("POST", route + "/lease", { leaseId })).statusCode,
  ).toBe(200);
  const change = {
    commandId: randomUUID(),
    baseRevision: before.revision,
    leaseId,
    operations: [
      {
        type: "ResizeWall",
        id: before.walls[0].id,
        thickness: 321,
        height: 3000,
      },
    ],
  };
  expect((await request("POST", route + "/commands", change)).statusCode).toBe(
    200,
  );
  const restore = {
    commandId: randomUUID(),
    baseRevision: before.revision + 1,
    leaseId,
    operations: [{ type: "RestoreRevision", revisionId: saved.id }],
  };
  expect(
    (await request("POST", route + "/commands", restore, cookieViewer))
      .statusCode,
  ).toBe(403);
  expect(
    (await request("GET", route + "/revisions", undefined, cookieB, orgB))
      .statusCode,
  ).toBe(404);
  const missing = await request("POST", route + "/commands", {
    ...restore,
    commandId: randomUUID(),
    operations: [{ type: "RestoreRevision", revisionId: randomUUID() }],
  });
  expect(missing.statusCode).toBe(404);
  const result = await request("POST", route + "/commands", restore);
  expect(result.statusCode, result.body).toBe(200);
  expect(result.json().scene.walls).toEqual(before.walls);
  expect(result.json().scene.revision).toBe(before.revision + 2);
  const rows = (await request("GET", route + "/revisions")).json();
  expect(
    rows.filter(
      (row: any) =>
        row.name === "Voor herstel · revisie " + (before.revision + 1),
    ),
  ).toHaveLength(1);
  expect(
    (await request("POST", route + "/commands", restore)).json().replayed,
  ).toBe(true);
  expect((await request("GET", route + "/revisions")).json()).toHaveLength(
    rows.length,
  );
  expect(
    (
      await request("POST", route + "/commands", {
        ...restore,
        commandId: randomUUID(),
      })
    ).statusCode,
  ).toBe(409);
});
test("variantkopie is onafhankelijk, herhaalveilig en blijft één project", async () => {
  const route = "/api/v1/variants/" + variant;
  const original = (await request("GET", route + "/document")).json();
  const input = {
    variantId: randomUUID(),
    name: "Alternatief",
    baseRevision: original.revision,
  };
  const results = await Promise.all([
    request("POST", route + "/copies", input),
    request("POST", route + "/copies", input),
  ]);
  expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(results.map((r) => r.json().replayed).sort()).toEqual([false, true]);
  const copied = (
    await request("GET", "/api/v1/variants/" + input.variantId + "/document")
  ).json();
  expect(copied.projectId).toBe(original.projectId);
  expect(copied.revision).toBe(0);
  expect(copied.nodes[0].id).not.toBe(original.nodes[0].id);
  expect(copied.walls[0].startId).toBe(copied.nodes[0].id);
  expect(copied.items.map((i: any) => i.width)).toEqual(
    original.items.map((i: any) => i.width),
  );
  expect((await request("GET", route + "/alternatives")).json()).toHaveLength(
    2,
  );
  const projects = (await request("GET", "/api/v1/projects")).json().items;
  expect(projects).toHaveLength(1);
  expect(projects[0].variant_id).toBe(variant);
  expect(
    (
      await request("POST", route + "/copies", {
        ...input,
        name: "Andere naam",
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request("POST", route + "/copies", {
        ...input,
        variantId: randomUUID(),
        baseRevision: 999,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await request("POST", route + "/copies", input, cookieViewer)).statusCode,
  ).toBe(403);
  expect(
    (await request("GET", route + "/alternatives", undefined, cookieB, orgB))
      .statusCode,
  ).toBe(404);
  const leaseId = randomUUID(),
    copyRoute = "/api/v1/variants/" + input.variantId;
  await request("POST", copyRoute + "/lease", { leaseId });
  expect(
    (
      await request("POST", copyRoute + "/commands", {
        commandId: randomUUID(),
        baseRevision: 0,
        leaseId,
        operations: [
          {
            type: "ResizeWall",
            id: copied.walls[0].id,
            thickness: 444,
            height: 3000,
          },
        ],
      })
    ).statusCode,
  ).toBe(200);
  expect((await request("GET", route + "/document")).json()).toEqual(original);
});
test("bibliotheekversies zijn immutable, geïsoleerd en wijzigen plaatsingen niet", async () => {
  const definition = {
    name: "Eigen bank",
    kind: "sofa",
    width: 2400,
    depth: 950,
    height: 780,
    color: "#c4b39d",
    catalog: { category: "Zitmeubels", description: "Linnen bank", keywords: ["zand"], supplier: "Atelier", sku: "BANK-01" },
  };
  const v1 = {
    entryId: randomUUID(),
    versionId: randomUUID(),
    baseVersion: 0,
    definition,
  };
  const published = await Promise.all([
    request("POST", "/api/v1/library", v1),
    request("POST", "/api/v1/library", v1),
  ]);
  expect(published.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(published.map((r) => r.json().replayed).sort()).toEqual([false, true]);
  expect(
    (await request("GET", "/api/v1/library", undefined, cookieB, orgB)).json()
      .items,
  ).toEqual([]);
  expect(
    (await request("POST", "/api/v1/library", v1, cookieViewer)).statusCode,
  ).toBe(403);
  const route = "/api/v1/variants/" + variant,
    scene = (await request("GET", route + "/document")).json(),
    leaseId = randomUUID();
  await db.admin.query(
    "UPDATE editing_leases SET expires_at=now()-interval '1 second'",
  );
  await request("POST", route + "/lease", { leaseId });
  const itemId = randomUUID();
  const place = {
    commandId: randomUUID(),
    baseRevision: scene.revision,
    leaseId,
    operations: [
      {
        type: "PlaceLibraryItem",
        id: itemId,
        versionId: v1.versionId,
        x: 1200,
        y: 2000,
        rotation: 0,
      },
    ],
  };
  const placed = await request("POST", route + "/commands", place);
  expect(placed.statusCode, placed.body).toBe(200);
  expect(
    placed.json().scene.items.find((i: any) => i.id === itemId).libraryRef
      .version,
  ).toBe(1);
  const v2 = {
    ...v1,
    versionId: randomUUID(),
    baseVersion: 1,
    definition: { ...definition, width: 3000, catalog: { ...definition.catalog, sku: "BANK-02" } },
  };
  expect((await request("POST", "/api/v1/library", v2)).statusCode).toBe(200);
  expect(
    (await request("GET", "/api/v1/library")).json().items[0].definition.width,
  ).toBe(3000);
  expect(
    (await request("GET", route + "/document"))
      .json()
      .items.find((i: any) => i.id === itemId).width,
  ).toBe(2400);
  expect(
    (
      await request("POST", "/api/v1/library", {
        ...v2,
        versionId: randomUUID(),
      })
    ).statusCode,
  ).toBe(409);
  const storedItem = (await request("GET", route + "/document")).json().items.find((i: any) => i.id === itemId);
  expect(storedItem.catalog.sku).toBe("BANK-01");
  expect((await request("GET", "/api/v1/library?q=BANK-01")).json().items).toEqual([]);
  expect((await request("GET", "/api/v1/library?q=bank-02&category=zitmeubels")).json().items).toHaveLength(1);
  const foreign = { ...v1, entryId: randomUUID(), versionId: randomUUID() };
  await request("POST", "/api/v1/library", foreign, cookieB, orgB);
  const rejected = await request("POST", route + "/commands", {
    ...place,
    commandId: randomUUID(),
    baseRevision: scene.revision + 1,
    operations: [
      {
        ...place.operations[0],
        id: randomUUID(),
        versionId: foreign.versionId,
      },
    ],
  });
  expect(rejected.statusCode).toBe(404);
  await expect(
    inTenant(db.runtime, orgA, (c) =>
      c.query("UPDATE library_versions SET version=99"),
    ),
  ).rejects.toThrow(/permission denied/);
});
test("bibliotheek zoekt binnen tenant en nieuwste versies vóór paginering", async () => {
  for (let i = 0; i < 51; i++) {
    const response = await request("POST", "/api/v1/library", {
      entryId: randomUUID(), versionId: randomUUID(), baseVersion: 0,
      definition: { name: `Zoekproef ${String(i).padStart(2, "0")}`, kind: "table",
        width: 1000, depth: 600, height: 750, color: "#abcdef",
        catalog: { category: "Paginering", description: "Tafel", supplier: "Werkplaats",
          sku: String(i), keywords: i === 50 ? ["100%_uniek"] : [] } },
    });
    expect(response.statusCode).toBe(200);
  }
  const first = (await request("GET", "/api/v1/library?category=Paginering")).json();
  expect(first.items).toHaveLength(50);
  expect(first.nextOffset).toBe(50);
  const second = (await request("GET", "/api/v1/library?category=Paginering&offset=50")).json();
  expect(second.items).toHaveLength(1);
  expect(second.nextOffset).toBeNull();
  const match = (await request("GET", "/api/v1/library?q=" + encodeURIComponent("100%_uniek"))).json();
  expect(match.items.map((item: any) => item.definition.name)).toEqual(["Zoekproef 50"]);
  expect((await request("GET", "/api/v1/library?q=werkplaats", undefined, cookieB, orgB)).json().items).toEqual([]);
  expect((await request("GET", "/api/v1/library?q=" + "x".repeat(121))).statusCode).toBe(400);
});
test("modeluploads worden hergecontroleerd, begrensd en tenant-geïsoleerd opgeslagen", async () => {
  const assetId = randomUUID(), bytes = Buffer.from(makeGlb()), path = "/api/v1/model-assets/" + assetId;
  const uploaded = await request("POST", path, bytes);
  expect(uploaded.statusCode, uploaded.body).toBe(200);
  const asset = uploaded.json();
  expect(asset).toEqual({ id: assetId, width: 2000, depth: 500, height: 1000, triangles: 4 });
  expect((await request("POST", path, bytes)).json()).toEqual(asset);
  expect((await request("POST", path, Buffer.from(makeGlb(j => { j.nodes[0].scale = [2,1,1]; })))).statusCode).toBe(409);
  expect((await request("POST", "/api/v1/model-assets/" + randomUUID(), bytes, cookieViewer)).statusCode).toBe(403);
  expect((await request("GET", path, undefined, cookieB, orgB)).statusCode).toBe(404);
  const downloaded = await request("GET", path, undefined, cookieViewer);
  expect(downloaded.statusCode).toBe(200);
  expect(downloaded.rawPayload.length).toBe(144);
  expect(downloaded.headers["cache-control"]).toBe("no-store");
  const rejected = await request("POST", "/api/v1/model-assets/" + randomUUID(), Buffer.from(makeGlb(j => { j.buffers[0].uri = "https://example.invalid/private"; })));
  expect(rejected.statusCode, rejected.body).toBe(422);
  expect((await db.admin.query("SELECT count(*)::int AS count FROM model_assets WHERE organization_id=$1", [orgA])).rows[0].count).toBe(1);
  const definition = { name: "Modelmeubel", kind: "table", width: 2000, depth: 500, height: 1000, color: "#abcdef", model: { assetId, width: 2000, depth: 500, height: 1000 } };
  const version = { entryId: randomUUID(), versionId: randomUUID(), baseVersion: 0, definition };
  expect((await request("POST", "/api/v1/library", version)).statusCode).toBe(200);
  expect((await request("POST", "/api/v1/library", { ...version, entryId: randomUUID(), versionId: randomUUID() }, cookieB, orgB)).statusCode).toBe(400);
  expect((await request("POST", "/api/v1/library", { ...version, entryId: randomUUID(), versionId: randomUUID(), definition: { ...definition, model: { ...definition.model, width: 900 } } })).statusCode).toBe(400);
  await expect(inTenant(db.runtime, orgA, c => c.query("UPDATE model_assets SET width=5"))).rejects.toThrow(/permission denied/);
  await db.admin.query("INSERT INTO model_assets(organization_id,id,source_hash,source_bytes,positions,width,depth,height,triangles,user_id) SELECT organization_id,gen_random_uuid(),source_hash,source_bytes,positions,width,depth,height,triangles,user_id FROM model_assets CROSS JOIN generate_series(1,99) WHERE organization_id=$1 AND id=$2", [orgA, assetId]);
  expect((await request("POST", "/api/v1/model-assets/" + randomUUID(), bytes)).statusCode).toBe(409);
  expect((await request("POST", path, bytes)).statusCode).toBe(200);
});
test("materiaalkeuzes bewaren projectisolatie, versies, auteur, retry en versieconflicten", async () => {
  const project = (await request("POST", "/api/v1/projects", { name: "Materiaalproject", customer: "", description: "", demo: false })).json();
  const other = (await request("POST", "/api/v1/projects", { name: "Ander materiaalproject", customer: "", description: "", demo: false })).json();
  const path = `/api/v1/projects/${project.id}/materials`;
  const definition = { name: "Eiken vloer", category: "Vloer", room: "Woonkamer", supplier: "Vloermaker", collection: "Naturel", sku: "V-01", colorCode: "N10", unit: "m²", quantity: null, quantityReason: "", status: "undecided", confirmationDate: null, confirmationNote: "", notes: "" };
  const v1 = { entryId: randomUUID(), versionId: randomUUID(), baseVersion: 0, definition };
  const saved = await Promise.all([request("POST", path, v1), request("POST", path, v1)]);
  expect(saved.map(r => r.statusCode)).toEqual([200,200]);
  expect(saved.map(r => r.json().replayed).sort()).toEqual([false,true]);
  expect((await request("GET", path, undefined, cookieViewer)).json().items[0].definition.quantity).toBeNull();
  expect((await request("POST", path, v1, cookieViewer)).statusCode).toBe(403);
  expect((await request("GET", path, undefined, cookieB, orgB)).statusCode).toBe(404);
  expect((await request("GET", `/api/v1/projects/${other.id}/materials`)).json().items).toEqual([]);
  const v2 = { ...v1, versionId: randomUUID(), baseVersion: 1, definition: { ...definition, quantity: "31.500", quantityReason: "Leverancier gemeten, inclusief snijverlies", status: "chosen" } };
  expect((await request("POST", path, v2)).statusCode).toBe(200);
  expect((await request("POST", path, { ...v2, versionId: randomUUID() })).statusCode).toBe(409);
  expect((await request("POST", path, { ...v2, definition: { ...v2.definition, name: "Andere inhoud" } })).statusCode).toBe(409);
  const list = (await request("GET", path)).json().items;
  expect(list).toHaveLength(1); expect(list[0].version).toBe(2); expect(list[0].user_id).toBeTruthy(); expect(list[0].created_at).toBeTruthy();
  expect(list[0].definition.confirmationDate).toBeNull();
  expect((await db.admin.query("SELECT definition FROM material_versions WHERE id=$1", [v1.versionId])).rows[0].definition.quantity).toBeNull();
  const confirmed = { ...v2, versionId: randomUUID(), baseVersion: 2, definition: { ...v2.definition, status: "client_confirmed" } };
  expect((await request("POST", path, confirmed)).statusCode).toBe(400);
  expect((await request("POST", path, { ...confirmed, definition: { ...confirmed.definition, confirmationDate: "2026-09-07", confirmationNote: "Klant akkoord per e-mail" } })).statusCode).toBe(200);
  await expect(inTenant(db.runtime, project.scene.organizationId, c => c.query("UPDATE material_versions SET version=99"))).rejects.toThrow(/permission denied/);
});
test("berekende hoeveelheden komen van de server, verouderen bij ontwerpwijzigingen en blijven binnen project en werkruimte", async () => {
  const project = (await request("POST", "/api/v1/projects", { name: "Berekenproject", customer: "", description: "", demo: true })).json();
  const other = (await request("POST", "/api/v1/projects", { name: "Los project", customer: "", description: "", demo: false })).json();
  const path = `/api/v1/projects/${project.id}/materials`;
  const quantityPath = (id: string, v: string) => `/api/v1/projects/${id}/quantities?variantId=${v}`;
  const measured = (await request("GET", quantityPath(project.id, project.variantId))).json();
  expect(measured.revision).toBe(0);
  expect(measured.rooms).toHaveLength(1);
  const room = measured.rooms[0];
  expect(room.netFloorAreaMm2).toBe(27154275);
  expect(room.issues).toEqual([]);
  // Een variant van een ander project of een andere werkruimte levert geen bronmaten.
  expect((await request("GET", quantityPath(other.id, project.variantId))).statusCode).toBe(404);
  expect((await request("GET", quantityPath(project.id, project.variantId), undefined, cookieB, orgB)).statusCode).toBe(404);
  expect((await request("GET", quantityPath(project.id, project.variantId), undefined, cookieViewer)).statusCode).toBe(200);

  const definition = { name: "Eiken vloer", category: "Vloer", room: "Woonkamer", supplier: "Vloermaker", collection: "Naturel", sku: "V-01", colorCode: "N10", unit: "stuk", quantity: null, quantityReason: "", status: "undecided", confirmationDate: null, confirmationNote: "", notes: "" };
  const calculation = { variantId: project.variantId, roomId: room.id, basis: "floor_area", wastePercent: "10", orderStep: "0.5" };
  const v1 = { entryId: randomUUID(), versionId: randomUUID(), baseVersion: 0, definition, calculation };
  expect((await request("POST", path, v1)).statusCode).toBe(200);
  const stored = (await request("GET", path)).json().items[0];
  // 27,154275 m2 netto, 10% snijverlies, bestelstap 0,5 m2.
  expect(stored.definition.calculation.netQuantity).toBe("27.154");
  expect(stored.definition.calculation.wasteQuantity).toBe("2.715");
  expect(stored.definition.calculation.grossQuantity).toBe("29.869");
  expect(stored.definition.calculation.orderQuantity).toBe("30");
  expect(stored.definition.calculation.sourceRevision).toBe(0);
  expect(stored.definition.calculation.inputs.netFloorAreaMm2).toBe(27154275);
  expect(stored.definition.quantity).toBe("30");
  // De server negeert de eenheid van de client en gebruikt die van de bronmaat.
  expect(stored.definition.unit).toBe("m²");

  expect((await request("POST", path, { ...v1, entryId: randomUUID(), versionId: randomUUID(), calculation: { ...calculation, roomId: "onbekend" } })).statusCode).toBe(409);
  expect((await request("POST", path, { ...v1, entryId: randomUUID(), versionId: randomUUID(), calculation: { ...calculation, variantId: other.variantId } })).statusCode).toBe(404);
  expect((await request("POST", `/api/v1/projects/${other.id}/materials`, { ...v1, entryId: randomUUID(), versionId: randomUUID() })).statusCode).toBe(404);
  expect((await request("POST", path, { ...v1, entryId: randomUUID(), versionId: randomUUID() }, cookieViewer)).statusCode).toBe(403);
  expect((await request("POST", path, { ...v1, entryId: randomUUID(), versionId: randomUUID(), definition: { ...definition, quantity: "40" } })).statusCode).toBe(400);

  // Een afwijkende hoeveelheid blijft staan naast de berekening, mits onderbouwd.
  const override = { ...v1, versionId: randomUUID(), baseVersion: 1, definition: { ...definition, quantity: "34", quantityReason: "Levering per hele pakken van 2 m²." } };
  expect((await request("POST", path, override)).statusCode).toBe(200);
  const overridden = (await request("GET", path)).json().items[0];
  expect(overridden.definition.quantity).toBe("34");
  expect(overridden.definition.calculation.orderQuantity).toBe("30");

  // Ontwerpwijziging: dikkere muren geven minder netto vloeroppervlak.
  const leaseId = randomUUID(), route = "/api/v1/variants/" + project.variantId;
  expect((await request("POST", route + "/lease", { leaseId })).statusCode).toBe(200);
  const wall = project.scene.walls[0];
  expect((await request("POST", route + "/commands", {
    commandId: randomUUID(), baseRevision: 0, leaseId,
    operations: [{ type: "ResizeWall", id: wall.id, thickness: 400, height: wall.height }],
  })).statusCode).toBe(200);
  const after = (await request("GET", quantityPath(project.id, project.variantId))).json();
  expect(after.revision).toBe(1);
  expect(after.rooms[0].id).toBe(room.id);
  expect(after.rooms[0].netFloorAreaMm2).toBeLessThan(room.netFloorAreaMm2);
  expect((await request("GET", path)).json().items[0].definition.calculation.sourceRevision).toBe(0);

  const recalculated = { ...v1, versionId: randomUUID(), baseVersion: 2, definition: { ...definition, quantity: null, quantityReason: "" } };
  expect((await request("POST", path, recalculated)).statusCode).toBe(200);
  const fresh = (await request("GET", path)).json().items[0];
  expect(fresh.definition.calculation.sourceRevision).toBe(1);
  expect(fresh.definition.calculation.inputs.netFloorAreaMm2).toBe(after.rooms[0].netFloorAreaMm2);
  expect(Number(fresh.definition.quantity)).toBeLessThan(30);
});
test("alternatieven, prijsbron en monsterstatus; de server controleert de herkomst van een gekozen alternatief", async () => {
  const project = (await request("POST", "/api/v1/projects", { name: "Alternatievenproject", customer: "", description: "", demo: false })).json();
  const path = `/api/v1/projects/${project.id}/materials`;
  const alternative = {
    id: randomUUID(), name: "Es geborsteld", supplier: "Andere vloermaker", collection: "Licht",
    sku: "V-02", colorCode: "L20", priceSource: "Offerte 2026-114", priceDate: "2026-09-01",
    unitPrice: "68.50", notes: "Langere levertijd.",
  };
  const definition = {
    name: "Eiken vloer", category: "Vloer", room: "Woonkamer", supplier: "Vloermaker", collection: "Naturel",
    sku: "V-01", colorCode: "N10", priceSource: "Prijslijst 2026", priceDate: "2026-08-20", unitPrice: "74.95",
    sampleStatus: "received", sampleDate: "2026-08-28", alternatives: [alternative], chosenFrom: null,
    unit: "m²", quantity: "31.500", quantityReason: "Leverancier gemeten", status: "chosen",
    confirmationDate: null, confirmationNote: "", notes: "",
  };
  const entryId = randomUUID();
  // Een eerste versie kan nog geen alternatief hebben gekozen: er is geen vorige versie om naar te wijzen.
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 0, definition: { ...definition, chosenFrom: { id: alternative.id, name: alternative.name } } })).statusCode).toBe(409);
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 0, definition })).statusCode).toBe(200);
  const stored = (await request("GET", path)).json().items[0];
  expect(stored.definition.alternatives).toHaveLength(1);
  expect(stored.definition.alternatives[0].unitPrice).toBe("68.50");
  expect(stored.definition.sampleStatus).toBe("received");

  const { id: _id, name, notes: _notes, ...product } = alternative;
  const promoted = {
    ...definition, name, ...product,
    alternatives: [{ id: randomUUID(), name: definition.name, supplier: definition.supplier, collection: definition.collection, sku: definition.sku, colorCode: definition.colorCode, priceSource: definition.priceSource, priceDate: definition.priceDate, unitPrice: definition.unitPrice, notes: "" }],
    chosenFrom: { id: alternative.id, name: alternative.name },
  };
  // Een verzonnen herkomst of tegelijk aanpassen wordt geweigerd.
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 1, definition: { ...promoted, chosenFrom: { id: randomUUID(), name: alternative.name } } })).statusCode).toBe(409);
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 1, definition: { ...promoted, unitPrice: "60.00" } })).statusCode).toBe(409);
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 1, definition: { ...promoted, chosenFrom: { id: alternative.id, name: "Andere naam" } } })).statusCode).toBe(409);
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 1, definition: promoted })).statusCode).toBe(200);
  const after = (await request("GET", path)).json().items[0];
  expect(after.version).toBe(2);
  expect([after.definition.name, after.definition.sku, after.definition.unitPrice]).toEqual(["Es geborsteld", "V-02", "68.50"]);
  expect(after.definition.chosenFrom.name).toBe("Es geborsteld");
  expect(after.definition.alternatives[0].sku).toBe("V-01");
  // De eerdere versie blijft ongewijzigd bewaard.
  expect((await db.admin.query("SELECT definition FROM material_versions WHERE project_id=$1 AND entry_id=$2 AND version=1", [project.id, entryId])).rows[0].definition.sku).toBe("V-01");
  // Ongeldige combinaties komen niet langs het contract.
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 2, definition: { ...definition, priceSource: "", unitPrice: "74.95" } })).statusCode).toBe(400);
  expect((await request("POST", path, { entryId, versionId: randomUUID(), baseVersion: 2, definition: { ...definition, sampleStatus: "approved", sampleDate: null } })).statusCode).toBe(400);
});
test("onderleggerafbeeldingen: type, maten, herhaling, quota en werkruimtegrens", async () => {
  const { makePng, makeJpeg } = await import("./helpers/image");
  const assetId = randomUUID(), bytes = makePng(1200, 900);
  const upload = (id: string, body: Buffer, cookie = cookieA, org = orgA) =>
    request("POST", "/api/v1/underlay-assets/" + id, body, cookie, org);

  const accepted = await upload(assetId, bytes);
  expect(accepted.statusCode, accepted.body).toBe(200);
  expect(accepted.json()).toEqual({ id: assetId, mime: "image/png", widthPx: 1200, heightPx: 900 });
  // Hetzelfde bestand onder dezelfde ID is een herhaling, geen tweede rij.
  expect((await upload(assetId, bytes)).json().widthPx).toBe(1200);
  expect((await db.admin.query("SELECT count(*)::int AS count FROM underlay_assets WHERE organization_id=$1", [orgA])).rows[0].count).toBe(1);
  // Een ander bestand onder dezelfde ID wordt geweigerd.
  expect((await upload(assetId, makePng(10, 10))).statusCode).toBe(409);

  // Actieve inhoud en onbekende typen komen er niet in.
  for (const bad of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"),
    Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(64)]),
  ]) {
    const rejected = await upload(randomUUID(), bad);
    expect(rejected.statusCode, rejected.body).toBe(422);
  }
  expect((await upload(randomUUID(), bytes.subarray(0, 20))).statusCode).toBe(422);
  expect((await db.admin.query("SELECT count(*)::int AS count FROM underlay_assets WHERE organization_id=$1", [orgA])).rows[0].count).toBe(1);

  // JPEG mag ook.
  expect((await upload(randomUUID(), makeJpeg(640, 480))).json().mime).toBe("image/jpeg");

  // Uitleveren gebeurt met een vast content-type en zonder sniffing.
  const served = await request("GET", "/api/v1/underlay-assets/" + assetId);
  expect(served.statusCode).toBe(200);
  expect(served.headers["content-type"]).toBe("image/png");
  expect(served.headers["x-content-type-options"]).toBe("nosniff");
  expect(served.rawPayload.equals(bytes)).toBe(true);

  // Een andere werkruimte ziet de afbeelding niet, ook niet met de juiste ID.
  expect((await request("GET", "/api/v1/underlay-assets/" + assetId, undefined, cookieB, orgB)).statusCode).toBe(404);
  // Alleen lezen mag niet uploaden, wel bekijken.
  expect((await upload(randomUUID(), bytes, cookieViewer)).statusCode).toBe(403);
  expect((await request("GET", "/api/v1/underlay-assets/" + assetId, undefined, cookieViewer)).statusCode).toBe(200);
  await expect(inTenant(db.runtime, orgA, c => c.query("UPDATE underlay_assets SET width_px=1"))).rejects.toThrow(/permission denied/);

  // Quota per werkruimte.
  await db.admin.query("INSERT INTO underlay_assets(organization_id,id,source_hash,mime,bytes,width_px,height_px,user_id) SELECT organization_id,gen_random_uuid(),source_hash,mime,bytes,width_px,height_px,user_id FROM underlay_assets CROSS JOIN generate_series(1,60) WHERE organization_id=$1 AND id=$2", [orgA, assetId]);
  expect((await upload(randomUUID(), makePng(50, 50))).statusCode).toBe(409);
});
test("de API overleeft het wegvallen van inactieve databaseverbindingen", async () => {
  // Zonder error-listener op de pool beeindigt Node het proces bij deze gebeurtenis.
  const terminated = await db.admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename IN ('studio_runtime','studio_auth') AND pid<>pg_backend_pid()",
  );
  expect(terminated.rowCount).toBeGreaterThan(0);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect((await request("GET", "/api/v1/projects")).statusCode).toBe(200);
  expect((await request("GET", "/api/v1/me")).statusCode).toBe(200);
});
test("signout trekt sessie in", async () => {
  expect((await request("POST", "/api/auth/sign-out", {})).statusCode).toBe(
    200,
  );
  expect((await request("GET", "/api/v1/me")).statusCode).toBe(401);
});

test("startup weigert ontbrekende, nieuwere en gewijzigde migrationhistorie", async () => {
  await assertSchemaCompatible(db.runtime);
  const {
    rows: [last],
  } = await db.admin.query(
    "SELECT name,hash FROM schema_migrations ORDER BY name DESC LIMIT 1",
  );
  try {
    await db.admin.query("DELETE FROM schema_migrations WHERE name=$1", [
      last.name,
    ]);
    await expect(assertSchemaCompatible(db.runtime)).rejects.toThrow(
      "Databaseversie",
    );
  } finally {
    await db.admin.query(
      "INSERT INTO schema_migrations(name,hash) VALUES($1,$2)",
      [last.name, last.hash],
    );
  }
  try {
    await db.admin.query(
      "UPDATE schema_migrations SET hash='changed' WHERE name=$1",
      [last.name],
    );
    await expect(assertSchemaCompatible(db.runtime)).rejects.toThrow(
      "migrationhistorie",
    );
  } finally {
    await db.admin.query("UPDATE schema_migrations SET hash=$2 WHERE name=$1", [
      last.name,
      last.hash,
    ]);
  }
  try {
    await db.admin.query(
      "INSERT INTO schema_migrations(name,hash) VALUES('9999_future.sql','future')",
    );
    await expect(assertSchemaCompatible(db.runtime)).rejects.toThrow(
      "Databaseversie",
    );
  } finally {
    await db.admin.query(
      "DELETE FROM schema_migrations WHERE name='9999_future.sql'",
    );
  }
  await assertSchemaCompatible(db.runtime);
});
