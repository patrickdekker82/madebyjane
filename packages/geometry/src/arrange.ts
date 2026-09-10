/**
 * Uitlijnen en gelijk verdelen van meubels.
 *
 * Alles rekent met de asgerichte omhullende van een gedraaid meubel, niet met
 * de ruwe breedte en diepte. Een bank die 30 graden gedraaid staat lijnt dus
 * uit op wat je op het plan ziet.
 *
 * Verdelen maakt de tussenruimte tussen de omhullenden gelijk; het eerste en
 * het laatste meubel blijven staan. Passen de meubels niet binnen die
 * afstand, dan worden de tussenruimten negatief en gaan ze elkaar overlappen.
 * Dat is zichtbaar en omkeerbaar met een enkele stap terug.
 *
 * Uitkomsten zijn hele millimeters; de aanroeper stuurt ze als een batch naar
 * de server zodat de hele uitlijning een enkele stap terug is.
 */
export type Placed = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
};
export type Alignment =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY";
export type Placement = { id: string; x: number; y: number };

/** Halve maten van de asgerichte omhullende van een gedraaid meubel. */
export function halfExtent(item: Placed) {
  const angle = (item.rotation * Math.PI) / 180,
    cos = Math.abs(Math.cos(angle)),
    sin = Math.abs(Math.sin(angle));
  return {
    x: (item.width * cos + item.depth * sin) / 2,
    y: (item.width * sin + item.depth * cos) / 2,
  };
}
export function bounds(item: Placed) {
  const half = halfExtent(item);
  return {
    minX: item.x - half.x,
    maxX: item.x + half.x,
    minY: item.y - half.y,
    maxY: item.y + half.y,
  };
}

export function alignItems(items: Placed[], mode: Alignment): Placement[] {
  if (items.length < 2) return [];
  const all = items.map(bounds);
  const minX = Math.min(...all.map((b) => b.minX)),
    maxX = Math.max(...all.map((b) => b.maxX)),
    minY = Math.min(...all.map((b) => b.minY)),
    maxY = Math.max(...all.map((b) => b.maxY));
  return items.map((item) => {
    const half = halfExtent(item);
    const x =
      mode === "left"
        ? minX + half.x
        : mode === "right"
          ? maxX - half.x
          : mode === "centerX"
            ? (minX + maxX) / 2
            : item.x;
    const y =
      mode === "top"
        ? minY + half.y
        : mode === "bottom"
          ? maxY - half.y
          : mode === "centerY"
            ? (minY + maxY) / 2
            : item.y;
    return { id: item.id, x: Math.round(x), y: Math.round(y) };
  });
}

export function distributeItems(items: Placed[], axis: "x" | "y"): Placement[] {
  if (items.length < 3) return [];
  const min = axis === "x" ? "minX" : "minY",
    max = axis === "x" ? "maxX" : "maxY";
  const sorted = [...items].sort(
    (a, b) => bounds(a)[min] - bounds(b)[min] || a.id.localeCompare(b.id),
  );
  const first = bounds(sorted[0]!),
    last = bounds(sorted[sorted.length - 1]!);
  const span = last[max] - first[min];
  const occupied = sorted.reduce((total, item) => {
    const b = bounds(item);
    return total + (b[max] - b[min]);
  }, 0);
  const gap = (span - occupied) / (sorted.length - 1);
  let cursor = first[min];
  return sorted.map((item) => {
    const half = halfExtent(item)[axis],
      center = cursor + half;
    cursor += half * 2 + gap;
    return {
      id: item.id,
      x: axis === "x" ? Math.round(center) : item.x,
      y: axis === "y" ? Math.round(center) : item.y,
    };
  });
}

/**
 * Objecten binnen een sleepkader. Het kader mag in elke richting getrokken zijn
 * en werkt op de asgerichte omhullende, dus een gedraaid meubel wordt geraakt
 * op wat je op het plan ziet. Aanraken is genoeg; een object hoeft niet
 * helemaal binnen het kader te liggen.
 */
export function itemsInRect(
  items: Placed[],
  rect: { x1: number; y1: number; x2: number; y2: number },
): string[] {
  const minX = Math.min(rect.x1, rect.x2),
    maxX = Math.max(rect.x1, rect.x2),
    minY = Math.min(rect.y1, rect.y2),
    maxY = Math.max(rect.y1, rect.y2);
  return items
    .filter((item) => {
      const b = bounds(item);
      return (
        b.minX <= maxX && b.maxX >= minX && b.minY <= maxY && b.maxY >= minY
      );
    })
    .map((item) => item.id);
}
