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
  password = randomBytes(24).toString("hex"),
  cookies: Record<string, string> = {},
  users: Record<string, string> = {},
  emails: Record<string, string> = {};

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

/** Alleen de token uit de link; de rest is voor de gebruiker. */
const tokenOf = (url: string) => url.split("#")[1]!;

const signIn = async (role: string, pass: string) =>
  server.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { origin, "x-studio-client-ip": `198.51.100.${role.length}` },
    payload: { email: emails[role], password: pass },
  });

beforeAll(async () => {
  await mkdir("work", { recursive: true });
  db = await localDatabase(await mkdtemp("work/recovery-"), 55438);
  const auth = createAuth(db.admin, origin, db.secret, true);
  await db.admin.query(
    "INSERT INTO identity.organization VALUES($1,'Herstelstudio'),($2,'Andere studio')",
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
    "viewer",
    "finance",
    "tweede_eigenaar",
    "outsider",
  ]) {
    const email = `${role}@example.test`;
    emails[role] = email;
    const r = await auth.api.signUpEmail({
      body: { email, password, name: role },
    });
    users[role] = r.user.id;
    await db.admin.query("INSERT INTO identity.membership VALUES($1,$2,$3)", [
      role === "outsider" ? other : org,
      r.user.id,
      role === "outsider"
        ? "owner"
        : role === "tweede_eigenaar"
          ? "owner"
          : role,
    ]);
    const signed = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    cookies[role] = (signed.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
  }
}, 90000);

afterAll(async () => {
  if (server) await server.app.close();
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});

test("beheerder maakt een eenmalige herstellink; die zet een nieuw wachtwoord", async () => {
  const made = await call(
    "POST",
    `/api/v1/members/${users.designer}/recovery`,
    {},
  );
  expect(made.statusCode, made.body).toBe(200);
  expect(made.json().email).toBe(emails.designer);
  expect(made.json().url).toContain("/herstel#");
  // Er wordt geen e-mail verstuurd: de link komt terug in het antwoord.
  const token = tokenOf(made.json().url);
  expect(new Date(made.json().expiresAt).getTime()).toBeGreaterThan(Date.now());

  const nieuw = "nieuwwachtwoord-" + randomBytes(8).toString("hex");
  const used = await server.app.inject({
    method: "POST",
    url: "/api/v1/recovery/accept",
    headers: { origin },
    payload: { token, password: nieuw },
  });
  expect(used.statusCode, used.body).toBe(200);
  expect(used.json()).toEqual({ recovered: true });

  // Het nieuwe wachtwoord werkt en het oude niet meer.
  expect((await signIn("designer", nieuw)).statusCode).toBe(200);
  expect((await signIn("designer", password)).statusCode).not.toBe(200);

  // Eenmalig: dezelfde token een tweede keer is geen herstel meer.
  const again = await server.app.inject({
    method: "POST",
    url: "/api/v1/recovery/accept",
    headers: { origin },
    payload: { token, password: nieuw + "x" },
  });
  expect(again.statusCode).toBe(404);
});

test("herstel trekt bestaande sessies in", async () => {
  // De viewer heeft een geldige sessie voordat het herstel begint.
  expect(
    (await call("GET", "/api/v1/projects", undefined, "viewer")).statusCode,
  ).toBe(200);
  const made = await call(
    "POST",
    `/api/v1/members/${users.viewer}/recovery`,
    {},
  );
  const nieuw = "nieuwwachtwoord-" + randomBytes(8).toString("hex");
  expect(
    (
      await server.app.inject({
        method: "POST",
        url: "/api/v1/recovery/accept",
        headers: { origin },
        payload: { token: tokenOf(made.json().url), password: nieuw },
      })
    ).statusCode,
  ).toBe(200);
  // Wie de toegang kwijt was, wil dat een indringer er ook uit ligt.
  expect(
    (await call("GET", "/api/v1/projects", undefined, "viewer")).statusCode,
  ).toBe(401);
});

test("een nieuwe link maakt de vorige ongeldig, en intrekken werkt", async () => {
  const eerste = await call(
    "POST",
    `/api/v1/members/${users.admin}/recovery`,
    {},
  );
  const tweede = await call(
    "POST",
    `/api/v1/members/${users.admin}/recovery`,
    {},
  );
  expect(tweede.statusCode, tweede.body).toBe(200);
  const oud = tokenOf(eerste.json().url),
    nieuw = tokenOf(tweede.json().url);
  expect(oud).not.toBe(nieuw);
  const metOude = await server.app.inject({
    method: "POST",
    url: "/api/v1/recovery/accept",
    headers: { origin },
    payload: { token: oud, password: "ditmagnietwerken1234" },
  });
  expect(metOude.statusCode, metOude.body).toBe(404);

  // Intrekken maakt ook de nieuwste link ongeldig.
  expect(
    (
      await call("POST", `/api/v1/members/${users.admin}/recovery/revoke`, {})
    ).json(),
  ).toEqual({ revoked: true });
  expect(
    (
      await server.app.inject({
        method: "POST",
        url: "/api/v1/recovery/accept",
        headers: { origin },
        payload: { token: nieuw, password: "ditmagookniet12345" },
      })
    ).statusCode,
  ).toBe(404);
  // Nogmaals intrekken is geen fout, maar meldt ook niets ingetrokken.
  expect(
    (
      await call("POST", `/api/v1/members/${users.admin}/recovery/revoke`, {})
    ).json(),
  ).toEqual({ revoked: false });
});

test("alleen beheerders; en een admin kan geen eigenaar overnemen", async () => {
  // Finance heeft nog een geldige sessie: designer en viewer zijn hierboven
  // hersteld en dus juist uitgelogd.
  expect(
    (
      await call(
        "POST",
        `/api/v1/members/${users.viewer}/recovery`,
        {},
        "finance",
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await call(
        "POST",
        `/api/v1/members/${users.finance}/recovery/revoke`,
        {},
        "finance",
      )
    ).statusCode,
  ).toBe(403);
  // Een admin die een eigenaar mag herstellen, kan het eigenaarsaccount
  // overnemen. Dat mag alleen een eigenaar.
  expect(
    (
      await call(
        "POST",
        `/api/v1/members/${users.tweede_eigenaar}/recovery`,
        {},
        "admin",
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await call(
        "POST",
        `/api/v1/members/${users.tweede_eigenaar}/recovery`,
        {},
        "owner",
      )
    ).statusCode,
  ).toBe(200);
});

test("een andere werkruimte en onbekende gebruikers blijven buiten", async () => {
  expect(
    (
      await call(
        "POST",
        `/api/v1/members/${users.designer}/recovery`,
        {},
        "outsider",
        other,
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (await call("POST", `/api/v1/members/${users.outsider}/recovery`, {}))
      .statusCode,
  ).toBe(404);
  expect(
    (await call("POST", "/api/v1/members/bestaat-niet/recovery", {}))
      .statusCode,
  ).toBe(404);
});

test("een verzonnen of te kort wachtwoord wordt geweigerd", async () => {
  expect(
    (
      await server.app.inject({
        method: "POST",
        url: "/api/v1/recovery/accept",
        headers: { origin },
        payload: { token: "a".repeat(32), password: "ruimvoldoendelang" },
      })
    ).statusCode,
  ).toBe(404);
  const made = await call(
    "POST",
    `/api/v1/members/${users.designer}/recovery`,
    {},
  );
  expect(
    (
      await server.app.inject({
        method: "POST",
        url: "/api/v1/recovery/accept",
        headers: { origin },
        payload: { token: tokenOf(made.json().url), password: "kort" },
      })
    ).statusCode,
  ).toBe(400);
});

test("elk herstel staat met actor en gebruiker in de registratie", async () => {
  const rows = await db.admin.query(
    "SELECT action,actor_id,detail FROM identity.access_event WHERE action LIKE 'recovery.%' ORDER BY created_at",
    [],
  );
  const acties = rows.rows.map((r) => r.action);
  expect(acties).toContain("recovery.created");
  expect(acties).toContain("recovery.used");
  expect(acties).toContain("recovery.revoked");
  const eerste = rows.rows.find((r) => r.action === "recovery.created")!;
  expect(eerste.actor_id).toBe(users.owner);
  expect(eerste.detail).toEqual({
    userId: users.designer,
    email: emails.designer,
  });
});
