import { test, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import { localDatabase } from "../scripts/local-db";
import { bootstrapOwner } from "../packages/auth/src/setup";
import { createServer } from "../apps/api/src/server";
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[19]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
test("MFA-enrollment, ontbrekende/tampered factor, versleuteld geheim, eenmalige recovery en HTTPS-gate", async () => {
  const db = await localDatabase(await mkdtemp("work/mfa-"), 55437),
    origin = "https://studio.example.test",
    password = randomBytes(24).toString("hex"),
    email = "mfa@example.test";
  const owner = await bootstrapOwner(db.admin, origin, db.secret, {
    name: "MFA gebruiker",
    email,
    password,
    organizationName: "MFA Studio",
  });
  const { app } = createServer({
    runtime: db.runtime,
    identity: db.identity,
    baseURL: origin,
    secret: db.secret,
  });
  const jar = new Map<string, string>();
  const request = async (
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
  ) => {
    const r = await app.inject({
      method,
      url,
      headers: {
        origin,
        cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
        "x-organization-id": owner.organizationId,
      },
      ...(payload ? { payload: payload as any } : {}),
    });
    for (const c of r.cookies) {
      if (c.value) jar.set(c.name, c.value);
      else jar.delete(c.name);
    }
    return r;
  };
  try {
    expect(
      (await request("POST", "/api/auth/sign-in/email", { email, password }))
        .statusCode,
    ).toBe(200);
    expect((await request("GET", "/api/v1/projects")).json().code).toBe(
      "MFA_REQUIRED",
    );
    const enrollment = await request("POST", "/api/auth/two-factor/enable", {
      password,
      method: "totp",
    });
    expect(enrollment.statusCode, enrollment.body).toBe(200);
    const { totpURI, backupCodes } = enrollment.json();
    const secret = new URL(totpURI).searchParams.get("secret")!;
    expect(backupCodes.length).toBeGreaterThan(0);
    const stored = (
      await db.admin.query(
        'SELECT secret,"backupCodes" FROM identity."twoFactor"',
      )
    ).rows[0];
    expect(stored.secret).not.toBe(secret);
    expect(stored.backupCodes).not.toContain(backupCodes[0]);
    expect(
      (
        await request("POST", "/api/auth/two-factor/verify-totp", {
          code: totp(secret),
        })
      ).statusCode,
    ).toBe(200);
    expect((await request("GET", "/api/v1/projects")).statusCode).toBe(200);
    expect((await request("GET", "/api/v1/me")).body).not.toContain(secret);
    await request("POST", "/api/auth/sign-out", {});
    jar.clear();
    const challenge = await request("POST", "/api/auth/sign-in/email", {
      email,
      password,
    });
    expect(challenge.json().twoFactorRedirect).toBe(true);
    expect((await request("GET", "/api/v1/me")).statusCode).toBe(401);
    expect(
      (
        await request("POST", "/api/auth/two-factor/verify-totp", {
          code: "abcdef",
        })
      ).statusCode,
    ).not.toBe(200);
    expect((await request("GET", "/api/v1/me")).statusCode).toBe(401);
    expect(
      (
        await request("POST", "/api/auth/two-factor/verify-backup-code", {
          code: backupCodes[0],
        })
      ).statusCode,
    ).toBe(200);
    expect((await request("GET", "/api/v1/me")).statusCode).toBe(200);
    await request("POST", "/api/auth/sign-out", {});
    jar.clear();
    await request("POST", "/api/auth/sign-in/email", { email, password });
    expect(
      (
        await request("POST", "/api/auth/two-factor/verify-backup-code", {
          code: backupCodes[0],
        })
      ).statusCode,
    ).not.toBe(200);
    expect((await request("GET", "/api/v1/me")).statusCode).toBe(401);
  } finally {
    await app.close();
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
}, 60000);
