import type { Point, Scene } from "../../contracts/src/index";

/**
 * Muurcontouren met versneden hoeken.
 *
 * Een muur als dikke lijn met stompe uiteinden laat aan de buitenzijde van elke
 * hoek een hap open. Daarom tekenen we per muur een gesloten contour waarvan de
 * uiteinden versneden zijn tegen de aansluitende muur.
 *
 * Versnijden gebeurt alleen wanneer op een punt precies één andere muur
 * uitkomt. Op een T-aansluiting of een kruising is er geen enkele juiste
 * versnijding; daar eindigt de muur stomp op het punt zelf. Dat valt niet op,
 * omdat de doorgaande muur het uiteinde bedekt.
 *
 * Bij zeer scherpe hoeken loopt een versnijding ver van het punt weg. Voorbij
 * MITER_LIMIT keer de muurdikte eindigt de muur daarom alsnog stomp, in plaats
 * van een lange punt te laten uitsteken.
 */
export type WallOutline = { wallId: string; points: Point[] };

const MITER_LIMIT = 6;

type Direction = { x: number; y: number };

const unit = (from: Point, to: Point): Direction | null => {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  return length === 0 ? null : { x: dx / length, y: dy / length };
};
const leftNormal = (d: Direction) => ({ x: -d.y, y: d.x });

/** Snijpunt van twee lijnen, elk gegeven door een punt en een richting. */
function intersect(p1: Point, d1: Direction, p2: Point, d2: Direction) {
  const denominator = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denominator;
  const point = { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

/**
 * De twee hoekpunten van een muuruiteinde op `node`.
 *
 * `ours` wijst van het punt af, de muur in. `plus` ligt aan de kant van de
 * linkernormaal van `ours`, `minus` aan de andere kant.
 */
function endCorners(
  node: Point,
  ours: Direction,
  thickness: number,
  neighbour: { direction: Direction; thickness: number } | null,
) {
  const n = leftNormal(ours),
    half = thickness / 2;
  const butt = {
    plus: { x: node.x + n.x * half, y: node.y + n.y * half },
    minus: { x: node.x - n.x * half, y: node.y - n.y * half },
  };
  if (!neighbour) return butt;
  const m = leftNormal(neighbour.direction),
    otherHalf = neighbour.thickness / 2;
  // Van een gedeeld punt wijzen beide muren weg; onze plus-zijde ligt daarom
  // tegenover de min-zijde van de buur.
  const plus = intersect(
    { x: node.x + n.x * half, y: node.y + n.y * half },
    ours,
    { x: node.x - m.x * otherHalf, y: node.y - m.y * otherHalf },
    neighbour.direction,
  );
  const minus = intersect(
    { x: node.x - n.x * half, y: node.y - n.y * half },
    ours,
    { x: node.x + m.x * otherHalf, y: node.y + m.y * otherHalf },
    neighbour.direction,
  );
  const limit = MITER_LIMIT * Math.max(thickness, neighbour.thickness);
  const usable = (point: Point | null) =>
    point && Math.hypot(point.x - node.x, point.y - node.y) <= limit;
  return usable(plus) && usable(minus)
    ? { plus: plus!, minus: minus! }
    : butt;
}

export function wallOutlines(
  scene: Pick<Scene, "nodes" | "walls">,
): WallOutline[] {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  /** Per punt de muren die erop uitkomen, met hun richting vanaf dat punt. */
  const attached = new Map<
    string,
    { wallId: string; direction: Direction; thickness: number }[]
  >();
  for (const wall of scene.walls) {
    const a = nodes.get(wall.startId),
      b = nodes.get(wall.endId);
    if (!a || !b) continue;
    const forward = unit(a, b);
    if (!forward) continue;
    for (const [node, direction] of [
      [wall.startId, forward],
      [wall.endId, { x: -forward.x, y: -forward.y }],
    ] as const)
      attached.set(node, [
        ...(attached.get(node) ?? []),
        { wallId: wall.id, direction, thickness: wall.thickness },
      ]);
  }
  const outlines: WallOutline[] = [];
  for (const wall of scene.walls) {
    const a = nodes.get(wall.startId),
      b = nodes.get(wall.endId);
    if (!a || !b) continue;
    const forward = unit(a, b);
    if (!forward) continue;
    const backward = { x: -forward.x, y: -forward.y };
    const neighbourAt = (nodeId: string) => {
      const others = (attached.get(nodeId) ?? []).filter(
        (x) => x.wallId !== wall.id,
      );
      return others.length === 1 ? others[0]! : null;
    };
    const startCorners = endCorners(a, forward, wall.thickness, neighbourAt(wall.startId));
    const endOfWall = endCorners(b, backward, wall.thickness, neighbourAt(wall.endId));
    // Op punt b wijst onze richting terug, dus daar is plus de rechterzijde.
    outlines.push({
      wallId: wall.id,
      points: [
        startCorners.plus,
        endOfWall.minus,
        endOfWall.plus,
        startCorners.minus,
      ],
    });
  }
  return outlines;
}
