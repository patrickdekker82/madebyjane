import { test, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { localDatabase } from "../scripts/local-db";
import { bootstrapOwner } from "../packages/auth/src/setup";
import { createAuth } from "../packages/auth/src/index";
import { InvitationService } from "../packages/auth/src/invitations";
let db: Awaited<ReturnType<typeof localDatabase>>,
  service: InvitationService,
  owner: { userId: string; organizationId: string };
const origin = "http://127.0.0.1:4310",
  password = randomBytes(24).toString("hex");
beforeAll(async () => {
  db = await localDatabase(await mkdtemp("work/invitations-"), 55436);
  owner = await bootstrapOwner(db.admin, origin, db.secret, {
    name: "Beheerder",
    email: "owner@example.test",
    password,
    organizationName: "Studio A",
  });
  service = new InvitationService(db.identity, origin, db.secret);
});
afterAll(async () => {
  if (db) {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
});
test("nieuwe gebruiker via eenmalige gehashte uitnodiging; retry kan geen tweede account maken", async () => {
  const invite = await service.create(owner.userId, owner.organizationId, {
    email: "Designer@example.test",
    role: "designer",
  });
  const token = invite.url.split("#")[1]!;
  expect(token).toHaveLength(64);
  const stored = (
    await db.admin.query(
      "SELECT token_hash FROM identity.invitation WHERE id=$1",
      [invite.id],
    )
  ).rows[0].token_hash;
  expect(stored).not.toBe(token);
  expect(
    JSON.stringify(await service.list(owner.userId, owner.organizationId)),
  ).not.toContain(token);
  await service.accept({ token, name: "Ontwerper", password });
  await expect(
    service.accept({ token, name: "Ontwerper", password }),
  ).rejects.toThrow(/gebruikt/);
  const r = await db.admin.query(
    'SELECT m.role,u.email FROM identity.membership m JOIN identity."user" u ON u.id=m.user_id WHERE u.email=$1',
    ["designer@example.test"],
  );
  expect(r.rows[0]).toEqual({
    role: "designer",
    email: "designer@example.test",
  });
});
test("ontwerper kan niet uitnodigen en andere organisatie is afgeschermd", async () => {
  const designer = (
    await db.admin.query('SELECT id FROM identity."user" WHERE email=$1', [
      "designer@example.test",
    ])
  ).rows[0].id;
  await expect(
    service.create(designer, owner.organizationId, {
      email: "no@example.test",
      role: "admin",
    }),
  ).rejects.toThrow(/beheerder/);
  await expect(service.list(owner.userId, randomUUID())).rejects.toThrow(
    /beheerder/,
  );
});
test("ingetrokken/verlopen tokens en gemengde IDs worden geweigerd", async () => {
  const invite = await service.create(owner.userId, owner.organizationId, {
    email: "revoked@example.test",
    role: "viewer",
  });
  await expect(
    service.revoke(owner.userId, randomUUID(), invite.id),
  ).rejects.toThrow();
  await service.revoke(owner.userId, owner.organizationId, invite.id);
  await expect(
    service.accept({ token: invite.url.split("#")[1], name: "No", password }),
  ).rejects.toThrow(/ingetrokken/);
  const expired = await service.create(owner.userId, owner.organizationId, {
    email: "expired@example.test",
    role: "viewer",
  });
  await db.admin.query(
    "UPDATE identity.invitation SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [expired.id],
  );
  await expect(
    service.accept({ token: expired.url.split("#")[1], name: "No", password }),
  ).rejects.toThrow(/verlopen/);
});
test("bestaand account vereist de juiste ingelogde identiteit", async () => {
  const auth = createAuth(db.admin, origin, db.secret, true);
  const existing = await auth.api.signUpEmail({
    body: { name: "Bestaand", email: "existing@example.test", password },
  });
  const invite = await service.create(owner.userId, owner.organizationId, {
    email: "existing@example.test",
    role: "viewer",
  });
  const input = { token: invite.url.split("#")[1] };
  await expect(service.accept(input, owner.userId)).rejects.toThrow(
    /Log eerst in/,
  );
  await service.accept(input, existing.user.id);
  expect(
    (
      await db.admin.query(
        "SELECT role FROM identity.membership WHERE user_id=$1",
        [existing.user.id],
      )
    ).rows[0].role,
  ).toBe("viewer");
});
