/**
 * Laagvolgorde binnen een verdieping.
 *
 * De volgorde van `scene.items` bepaalt wat bovenop ligt: later in de lijst
 * tekent over eerder heen. Deze functie werkt op ID's zodat zij zonder scene
 * te testen is.
 *
 * Bij een meervoudige selectie blijft de onderlinge volgorde van de
 * geselecteerde objecten intact. Een stap vooruit of achteruit verschuift de
 * selectie als geheel over precies een niet-geselecteerd object; ligt de
 * selectie al tegen de rand, dan verandert er niets. Bij een onderbroken
 * selectie telt de bovenste respectievelijk onderste van de selectie, en komt
 * de hele selectie bij elkaar te liggen. Dat is voorspelbaarder dan elk object
 * apart verschuiven en met een stap terug ongedaan te maken.
 */
export type OrderDirection = "front" | "back" | "forward" | "backward";

export function reorder(
  all: string[],
  ids: string[],
  direction: OrderDirection,
): string[] {
  const selected = all.filter((id) => ids.includes(id));
  if (!selected.length || selected.length === all.length) return all;
  const rest = all.filter((id) => !ids.includes(id));
  if (direction === "front") return [...rest, ...selected];
  if (direction === "back") return [...selected, ...rest];
  const indexes = selected.map((id) => all.indexOf(id));
  if (direction === "forward") {
    // Het eerste niet-geselecteerde object boven de selectie zakt eronder.
    const above = all.findIndex(
      (id, index) => index > Math.max(...indexes) - 1 && !ids.includes(id),
    );
    if (above < 0) return all;
    const result = [...rest];
    result.splice(rest.indexOf(all[above]!) + 1, 0, ...selected);
    return result;
  }
  const below = [...all.keys()]
    .reverse()
    .find((index) => index < Math.min(...indexes) && !ids.includes(all[index]!));
  if (below === undefined) return all;
  const result = [...rest];
  result.splice(rest.indexOf(all[below]!), 0, ...selected);
  return result;
}
