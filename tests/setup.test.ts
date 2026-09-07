import { test, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { localDatabase } from "../scripts/local-db";
import { bootstrapOwner } from "../packages/auth/src/setup";
import { createAuth } from "../packages/auth/src/index";
import { ProjectService } from "../packages/domain/src/projects";
test("setup is atomisch, eenmalig en conflictveilig; restart behoudt projecten", async () => {
  const directory = await mkdtemp("work/setup-");
  let db = await localDatabase(directory, 55435);
  const baseURL = "http://127.0.0.1:4310";
  const input = {
    name: "Eigenaar",
    email: "owner@example.test",
    password: randomBytes(24).toString("hex"),
    organizationName: "Fictieve teststudio",
  };
  try {
    await db.admin.query(
      "CREATE FUNCTION reject_org() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced rollback'; END $$; CREATE TRIGGER reject_org BEFORE INSERT ON identity.organization FOR EACH ROW EXECUTE FUNCTION reject_org()",
    );
    await expect(
      bootstrapOwner(db.admin, baseURL, db.secret, input),
    ).rejects.toThrow(/rollback/);
    expect(
      Number(
        (await db.admin.query('SELECT count(*) FROM identity."user"')).rows[0]
          .count,
      ),
    ).toBe(0);
    await db.admin.query(
      "DROP TRIGGER reject_org ON identity.organization; DROP FUNCTION reject_org()",
    );
    const runs = await Promise.allSettled([
      bootstrapOwner(db.admin, baseURL, db.secret, input),
      bootstrapOwner(db.admin, baseURL, db.secret, {
        ...input,
        email: "other@example.test",
      }),
    ]);
    expect(runs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const result = runs.find((r) => r.status === "fulfilled")!;
    if (result.status !== "fulfilled") throw Error("setup");
    const ctx = {
      userId: result.value.userId,
      organizationId: result.value.organizationId,
      role: "owner" as const,
    };
    const project = await new ProjectService(db.runtime).create(ctx, {
      name: "Blijvend project",
      customer: "Fictief",
      description: "",
      demo: true,
    });
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
    db = await localDatabase(directory, 55435);
    expect(
      (await new ProjectService(db.runtime).document(ctx, project.variantId))
        .items[0]?.width,
    ).toBe(2400);
    expect((await new ProjectService(db.runtime).list(ctx))[0]?.name).toBe(
      "Blijvend project",
    );
    await expect(
      bootstrapOwner(db.admin, baseURL, db.secret, input),
    ).rejects.toThrow(/gesloten/);
  } finally {
    await Promise.all([db.runtime.end(), db.identity.end()]);
    await db.stop();
  }
}, 60000);
