import type { Point, Scene } from "../../contracts/src/index";
import { detectRooms, type Room } from "./rooms";

/**
 * Afgeleide hoeveelheden per ruimte.
 *
 * Rekenregels, bewust expliciet omdat ze in offertes terechtkomen:
 * - `grossFloorAreaMm2` volgt de muurhartlijnen en is dus geen bestelhoeveelheid.
 * - `netFloorAreaMm2` gebruikt een contour die per muur een halve muurdikte naar
 *   binnen ligt. Ingesloten ruimtes worden juist een halve muurdikte vergroot en
 *   afgetrokken.
 * - `netPerimeterMm` telt de netto buitencontour plus de omtrek van ingesloten
 *   ruimtes; skirting loopt immers ook om een binnenkast heen.
 * - `plinthLengthMm` is de netto omtrek min de breedte van de deuren in de
 *   bijbehorende muren. Ramen onderbreken de plint niet.
 * - `wallAreaMm2` telt per muur netto lengte x muurhoogte en trekt elke opening
 *   volledig af, ook wanneer die opening twee ruimtes scheidt.
 *
 * Alle uitkomsten zijn afgerond op hele millimeters respectievelijk hele
 * vierkante millimeters. De offsetberekening werkt in drijvende komma; de
 * afrondingstolerantie is daarmee maximaal 1 mm per contourpunt.
 */
export type RoomQuantities = {
  id: string;
  grossFloorAreaMm2: number;
  netFloorAreaMm2: number;
  netPerimeterMm: number;
  plinthLengthMm: number;
  wallAreaMm2: number;
  doorWidthMm: number;
  openingAreaMm2: number;
  issues: string[];
};
export type QuantityDetection = { rooms: RoomQuantities[]; issues: string[] };

type Edge = {
  a: Point;
  b: Point;
  wallId: string;
  thickness: number;
  height: number;
};

const cross = (ax: number, ay: number, bx: number, by: number) =>
  ax * by - ay * bx;
const signedArea = (points: Point[]) =>
  points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;
const perimeter = (points: Point[]) =>
  points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return sum + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const t = (p: Point, q: Point, r: Point) =>
    cross(q.x - p.x, q.y - p.y, r.x - p.x, r.y - p.y);
  const t1 = t(a, b, c),
    t2 = t(a, b, d),
    t3 = t(c, d, a),
    t4 = t(c, d, b);
  return t1 * t2 < 0 && t3 * t4 < 0;
}

/** Verplaats iedere rand over `offsets[i]` langs de linkernormaal en snijd de randen opnieuw. */
function offsetContour(
  points: Point[],
  offsets: number[],
): { points: Point[]; lengths: number[] } | null {
  const n = points.length;
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n]!,
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) return null;
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length,
      shift = offsets[i]!;
    // Linkernormaal van (dx,dy); voor een contour met positief oppervlak wijst die naar binnen.
    return { x: a.x - dy * shift, y: a.y + dx * shift, dx, dy };
  });
  if (lines.some((line) => !line)) return null;
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const previous = lines[(i - 1 + n) % n]!,
      current = lines[i]!;
    const denominator = cross(previous.dx, previous.dy, current.dx, current.dy);
    if (Math.abs(denominator) < 1e-9) {
      // Doorlopende of exact tegengestelde randen: een tegengestelde richting is een terugslag.
      if (previous.dx * current.dx + previous.dy * current.dy < 0) return null;
      result.push({ x: current.x, y: current.y });
      continue;
    }
    const t =
      cross(
        current.x - previous.x,
        current.y - previous.y,
        current.dx,
        current.dy,
      ) / denominator;
    const x = previous.x + previous.dx * t,
      y = previous.y + previous.dy * t;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    result.push({ x, y });
  }
  // Een rand die na het verschuiven omklapt, betekent dat de muren dikker zijn
  // dan de ruimte breed is. Het oppervlak blijft dan positief, dus dit is de
  // enige betrouwbare controle.
  for (let i = 0; i < n; i++) {
    const a = result[i]!,
      b = result[(i + 1) % n]!,
      line = lines[i]!;
    if ((b.x - a.x) * line.dx + (b.y - a.y) * line.dy <= 0) return null;
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (
        segmentsCross(
          result[i]!,
          result[(i + 1) % n]!,
          result[j]!,
          result[(j + 1) % n]!,
        )
      )
        return null;
    }
  const lengths = result.map((a, i) =>
    Math.hypot(result[(i + 1) % n]!.x - a.x, result[(i + 1) % n]!.y - a.y),
  );
  return { points: result, lengths };
}

function edgesOf(scene: Scene, nodeIds: string[]): Edge[] | null {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const edges: Edge[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    const from = nodeIds[i]!,
      to = nodeIds[(i + 1) % nodeIds.length]!;
    const a = nodes.get(from),
      b = nodes.get(to);
    const wall = scene.walls.find(
      (w) =>
        (w.startId === from && w.endId === to) ||
        (w.startId === to && w.endId === from),
    );
    if (!a || !b || !wall) return null;
    edges.push({
      a,
      b,
      wallId: wall.id,
      thickness: wall.thickness,
      height: wall.height,
    });
  }
  return edges;
}

function ringQuantities(scene: Scene, edges: Edge[], grow: boolean) {
  const points = edges.map((edge) => edge.a);
  const offset = offsetContour(
    points,
    edges.map((edge) => (grow ? -edge.thickness / 2 : edge.thickness / 2)),
  );
  if (!offset) return null;
  const area = signedArea(offset.points);
  if (grow ? area <= signedArea(points) : area <= 0) return null;
  let wallArea = 0,
    doorWidth = 0,
    openingArea = 0;
  edges.forEach((edge, index) => {
    wallArea += offset.lengths[index]! * edge.height;
    for (const opening of scene.openings.filter(
      (o) => o.wallId === edge.wallId,
    )) {
      openingArea += opening.width * opening.height;
      if (opening.kind === "door") doorWidth += opening.width;
    }
  });
  return {
    area,
    perimeter: perimeter(offset.points),
    wallArea,
    doorWidth,
    openingArea,
  };
}

function quantitiesOf(scene: Scene, room: Room): RoomQuantities {
  const empty: RoomQuantities = {
    id: room.id,
    grossFloorAreaMm2: Math.round(room.areaMm2),
    netFloorAreaMm2: 0,
    netPerimeterMm: 0,
    plinthLengthMm: 0,
    wallAreaMm2: 0,
    doorWidthMm: 0,
    openingAreaMm2: 0,
    issues: [
      "De muurdiktes passen niet binnen deze contour. Controleer dikte, lengte en aansluitingen van de muren.",
    ],
  };
  const outerEdges = edgesOf(scene, room.nodeIds);
  if (!outerEdges) return empty;
  const outer = ringQuantities(scene, outerEdges, false);
  if (!outer) return empty;
  let area = outer.area,
    net = outer.perimeter,
    wallArea = outer.wallArea,
    doorWidth = outer.doorWidth,
    openingArea = outer.openingArea;
  for (const holeIds of room.holeNodeIds) {
    const holeEdges = edgesOf(scene, holeIds);
    if (!holeEdges) return empty;
    const hole = ringQuantities(scene, holeEdges, true);
    if (!hole) return empty;
    area -= hole.area;
    net += hole.perimeter;
    wallArea += hole.wallArea;
    doorWidth += hole.doorWidth;
    openingArea += hole.openingArea;
  }
  if (area <= 0) return empty;
  return {
    id: room.id,
    grossFloorAreaMm2: Math.round(room.areaMm2),
    netFloorAreaMm2: Math.round(area),
    netPerimeterMm: Math.round(net),
    plinthLengthMm: Math.round(Math.max(0, net - doorWidth)),
    wallAreaMm2: Math.round(Math.max(0, wallArea - openingArea)),
    doorWidthMm: Math.round(doorWidth),
    openingAreaMm2: Math.round(openingArea),
    issues: [],
  };
}

/** Berekent per herkende ruimte de netto hoeveelheden. Geen ruimtes = geen hoeveelheden. */
export function roomQuantities(scene: Scene): QuantityDetection {
  const detection = detectRooms(scene);
  return {
    rooms: detection.rooms.map((room) => quantitiesOf(scene, room)),
    issues: detection.issues,
  };
}
