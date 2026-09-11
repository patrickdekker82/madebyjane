import { test, expect } from "vitest";
import {
  can,
  permissions,
  permissionsFor,
  roles,
  type Permission,
} from "../packages/domain/src/permissions";
import { canWrite } from "../packages/domain/src/index";

/**
 * De volledige matrix staat hier uitgeschreven. Een rol die een recht wint of
 * verliest laat deze proef vallen; dat moet een bewuste wijziging zijn en geen
 * bijvangst van een refactor.
 */
const expected: Record<string, Permission[]> = {
  owner: [...permissions],
  admin: [...permissions],
  designer: ["project.read", "project.write", "library.manage"],
  finance: [
    "project.read",
    "quote.read",
    "quote.write",
    "quote.finalize",
    "costs.read",
    "share.publish",
    "share.revoke",
  ],
  viewer: ["project.read"],
};

test("de rechtenmatrix is volledig en per rol vastgepind", () => {
  expect([...roles].sort()).toEqual(Object.keys(expected).sort());
  for (const role of roles)
    expect([...permissionsFor(role)].sort()).toEqual(
      [...expected[role]!].sort(),
    );
  // Elk recht is minstens door één rol te gebruiken en nergens onbereikbaar.
  for (const permission of permissions)
    expect(roles.some((role) => can(role, permission))).toBe(true);
});

test("de matrix splitst lezen, schrijven, afronden, kosten, leden en delen", () => {
  // Designer tekent wel, maar ziet geen offertes, kosten of ledenbeheer.
  expect(can("designer", "project.write")).toBe(true);
  expect(can("designer", "library.manage")).toBe(true);
  for (const denied of [
    "quote.read",
    "quote.write",
    "quote.finalize",
    "costs.read",
    "members.manage",
    "share.publish",
    "share.revoke",
  ] as Permission[])
    expect(can("designer", denied)).toBe(false);
  // Finance beheert offertes en kosten, maar tekent niet en beheert geen leden.
  expect(can("finance", "quote.finalize")).toBe(true);
  expect(can("finance", "costs.read")).toBe(true);
  expect(can("finance", "project.write")).toBe(false);
  expect(can("finance", "library.manage")).toBe(false);
  expect(can("finance", "members.manage")).toBe(false);
  // Viewer leest alleen.
  expect(permissionsFor("viewer")).toEqual(["project.read"]);
  // Alleen owner en admin beheren leden.
  expect(roles.filter((r) => can(r, "members.manage"))).toEqual([
    "owner",
    "admin",
  ]);
});

test("canWrite blijft de korte vorm van project.write", () => {
  for (const role of roles)
    expect(canWrite(role)).toBe(can(role, "project.write"));
});
