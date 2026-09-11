/**
 * De rechtenmatrix uit de opdracht, als enige bron van waarheid. Routes en
 * services vragen een recht op, niet een rolnaam: een rol erbij of een recht
 * dat verschuift is dan één regel hier in plaats van een zoektocht door de
 * codebase. De matrix wordt in permissions.test.ts volledig vastgepind.
 *
 * Dit bestand importeert bewust niets uit index.ts, zodat de matrix geen
 * kringverwijzing maakt met de rest van het domein.
 */
export type Role = "owner" | "admin" | "designer" | "finance" | "viewer";
export const roles: readonly Role[] = [
  "owner",
  "admin",
  "designer",
  "finance",
  "viewer",
];
export const permissions = [
  "project.read",
  "project.write",
  "library.manage",
  "quote.read",
  "quote.write",
  "quote.finalize",
  "costs.read",
  "members.manage",
  "share.publish",
  "share.revoke",
] as const;
export type Permission = (typeof permissions)[number];

const all: readonly Permission[] = permissions;
const matrix: Record<Role, readonly Permission[]> = {
  owner: all,
  admin: all,
  designer: ["project.read", "project.write", "library.manage"],
  // Finance beheert offertes en ziet inkoop en marge, maar tekent niet mee.
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

export function can(role: Role, permission: Permission) {
  return matrix[role].includes(permission);
}

/** Toont per rol welke rechten gelden, zodat de interface dit kan uitleggen. */
export function permissionsFor(role: Role): readonly Permission[] {
  return matrix[role];
}

/** Eén begrijpelijke Nederlandse melding per geweigerd recht. */
export const permissionMessages: Record<Permission, string> = {
  "project.read": "Je hebt geen toegang tot dit project.",
  "project.write": "Je hebt alleen leestoegang.",
  "library.manage": "Je hebt alleen leestoegang.",
  "quote.read": "Je hebt geen toegang tot offertes.",
  "quote.write": "Je hebt geen toegang tot offertes.",
  "quote.finalize": "Je hebt geen toegang tot offertes.",
  "costs.read": "Je hebt geen toegang tot inkoopgegevens.",
  "members.manage": "Je mag geen leden beheren.",
  "share.publish": "Je hebt geen toegang tot offertes.",
  "share.revoke": "Je hebt geen toegang tot offertes.",
};
