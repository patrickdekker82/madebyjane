import type { Item } from "../../contracts/src/index";

/**
 * Groepen.
 *
 * Objecten met dezelfde `groupId` horen bij elkaar. Er is geen aparte
 * groepenlijst: de groep is niet meer dan een gedeelde verwijzing op de
 * objecten zelf. Dat scheelt een tweede administratie die uit de pas kan
 * lopen met de objecten, en een groep verdwijnt vanzelf zodra het laatste lid
 * weg is.
 *
 * Een groep van één object heeft geen betekenis. `withoutSingletons` maakt die
 * los, zodat er nooit een groepsverwijzing achterblijft die niets groepeert.
 */
export type Groupable = Pick<Item, "id" | "groupId">;

/** Breidt een selectie uit tot hele groepen. Aanwijzen van één lid pakt de groep. */
export function expandSelection(
  items: Groupable[],
  ids: string[],
): string[] {
  const chosen = new Set(ids);
  const groups = new Set(
    items.filter((i) => chosen.has(i.id) && i.groupId).map((i) => i.groupId!),
  );
  if (!groups.size) return items.filter((i) => chosen.has(i.id)).map((i) => i.id);
  return items
    .filter((i) => chosen.has(i.id) || (i.groupId && groups.has(i.groupId)))
    .map((i) => i.id);
}

/** De groepen die in een selectie voorkomen. */
export function groupsIn(items: Groupable[], ids: string[]): string[] {
  const chosen = new Set(ids);
  return [
    ...new Set(
      items.filter((i) => chosen.has(i.id) && i.groupId).map((i) => i.groupId!),
    ),
  ];
}

/**
 * Groepsverwijzingen die nog maar één object hebben, horen weg. Levert de ID's
 * op die losgemaakt moeten worden.
 */
export function singletonGroupMembers(items: Groupable[]): string[] {
  const counts = new Map<string, string[]>();
  for (const item of items)
    if (item.groupId)
      counts.set(item.groupId, [...(counts.get(item.groupId) ?? []), item.id]);
  return [...counts.values()].filter((ids) => ids.length < 2).flat();
}
