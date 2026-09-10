import type { Point, Scene } from "../../contracts/src/index";
import { snap } from "./index";

/**
 * Vangen op raster, muurpunten, muren en objecten.
 *
 * De tolerantie komt binnen in wereld-millimeters. De aanroeper rekent die uit
 * als schermpixels gedeeld door de zoomfactor, zodat het vangen bij elke
 * zoomstand even ver aanvoelt zonder dat een fysieke maat ooit met de
 * schermzoom vermenigvuldigd wordt. De uitkomst is altijd hele millimeters.
 *
 * Volgorde van voorkeur, van specifiek naar algemeen:
 * 1. muurpunt   - het meest bepaalde doel; legt beide assen tegelijk vast.
 * 2. muur       - loodrechte projectie op de hartlijn, alleen binnen het segment.
 * 3. object     - uitlijnen per as op het hart of de rand van een ander meubel.
 * 4. raster     - de terugval, per as, alleen als het raster aanstaat.
 *
 * Objecten en raster werken per as: de x kan van een meubel komen en de y van
 * het raster. Muurpunt en muur leggen beide assen vast en sluiten de rest uit.
 */
export type SnapKind = "node" | "wall" | "object" | "grid";
export type SnapTarget = {
  kind: SnapKind;
  /** Het object waaraan gevangen is; leeg voor het raster. */
  id: string;
  /** Hulplijn die de gebruiker mag zien, in wereldcoordinaten. */
  guide?: { from: Point; to: Point };
};
export type SnapResult = { x: number; y: number; targets: SnapTarget[] };
export type SnapOptions = {
  toleranceMm: number;
  grid: boolean;
  /** Objecten die zichzelf niet mogen vangen, bijvoorbeeld het gesleepte meubel. */
  exclude?: string[];
  /** Zet losse vangsoorten uit; standaard staan ze allemaal aan. */
  kinds?: Partial<Record<SnapKind, boolean>>;
};

const round = (value: number) => Math.round(value);

function nearestNode(scene: Scene, point: Point, tolerance: number) {
  let best: { node: Scene["nodes"][number]; distance: number } | null = null;
  for (const node of scene.nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    if (distance <= tolerance && (!best || distance < best.distance))
      best = { node, distance };
  }
  return best;
}

function nearestWall(
  scene: Scene,
  point: Point,
  tolerance: number,
  exclude: string[],
) {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { wallId: string; x: number; y: number; distance: number } | null =
    null;
  for (const wall of scene.walls) {
    if (exclude.includes(wall.id)) continue;
    const a = nodes.get(wall.startId),
      b = nodes.get(wall.endId);
    if (!a || !b) continue;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    // Buiten het segment hoort bij het muurpunt, niet bij de muur.
    if (t < 0 || t > 1) continue;
    const x = a.x + dx * t,
      y = a.y + dy * t,
      distance = Math.hypot(x - point.x, y - point.y);
    if (distance <= tolerance && (!best || distance < best.distance))
      best = { wallId: wall.id, x, y, distance };
  }
  return best;
}

/** Kandidaten om per as op uit te lijnen: hart en beide randen van elk meubel. */
function itemGuides(scene: Scene, exclude: string[]) {
  const x: { value: number; id: string; item: Scene["items"][number] }[] = [];
  const y: typeof x = [];
  for (const item of scene.items) {
    if (exclude.includes(item.id)) continue;
    const halfWidth = item.width / 2,
      halfDepth = item.depth / 2;
    for (const value of [item.x - halfWidth, item.x, item.x + halfWidth])
      x.push({ value, id: item.id, item });
    for (const value of [item.y - halfDepth, item.y, item.y + halfDepth])
      y.push({ value, id: item.id, item });
  }
  return { x, y };
}

export function snapPoint(
  scene: Scene,
  point: Point,
  options: SnapOptions,
): SnapResult {
  const tolerance = Math.max(0, options.toleranceMm),
    exclude = options.exclude ?? [],
    on = (kind: SnapKind) => options.kinds?.[kind] !== false;

  if (on("node")) {
    const node = nearestNode(scene, point, tolerance);
    if (node)
      return {
        x: round(node.node.x),
        y: round(node.node.y),
        targets: [{ kind: "node", id: node.node.id }],
      };
  }
  if (on("wall")) {
    const wall = nearestWall(scene, point, tolerance, exclude);
    if (wall)
      return {
        x: round(wall.x),
        y: round(wall.y),
        targets: [{ kind: "wall", id: wall.wallId }],
      };
  }

  let x = point.x,
    y = point.y,
    snappedX = false,
    snappedY = false;
  const targets: SnapTarget[] = [];
  if (on("object")) {
    const guides = itemGuides(scene, exclude);
    const pick = (
      candidates: { value: number; id: string; item: Scene["items"][number] }[],
      value: number,
    ) => {
      let best: (typeof candidates)[number] | null = null,
        bestDistance = tolerance;
      for (const candidate of candidates) {
        const distance = Math.abs(candidate.value - value);
        if (distance <= bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      return best;
    };
    const alignedX = pick(guides.x, x);
    if (alignedX) {
      x = alignedX.value;
      snappedX = true;
      targets.push({
        kind: "object",
        id: alignedX.id,
        guide: {
          from: { x: alignedX.value, y: alignedX.item.y },
          to: { x: alignedX.value, y: point.y },
        },
      });
    }
    const alignedY = pick(guides.y, y);
    if (alignedY) {
      y = alignedY.value;
      snappedY = true;
      targets.push({
        kind: "object",
        id: alignedY.id,
        guide: {
          from: { x: alignedY.item.x, y: alignedY.value },
          to: { x: point.x, y: alignedY.value },
        },
      });
    }
  }
  // Het raster vult alleen de assen die nog vrij zijn.
  if (options.grid && on("grid") && (!snappedX || !snappedY)) {
    if (!snappedX) x = snap(x);
    if (!snappedY) y = snap(y);
    targets.push({ kind: "grid", id: "" });
  }
  return { x: round(x), y: round(y), targets };
}
