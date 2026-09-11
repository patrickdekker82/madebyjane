import type { Point, Scene, Wall } from "../../contracts/src/index";
import { wallOutlines, type WallOutline } from "./walls";
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const toThree = (
  x: number,
  y: number,
  height = 0,
): [number, number, number] => [x / 1000, height / 1000, y / 1000];
export const toThreeRotation = (degrees: number) => (-degrees * Math.PI) / 180;
export function endpoints(scene: Scene, wall: Wall) {
  const a = scene.nodes.find((n) => n.id === wall.startId),
    b = scene.nodes.find((n) => n.id === wall.endId);
  if (!a || !b) throw new Error("Muur verwijst naar een ontbrekend eindpunt.");
  return {
    a,
    b,
    length: distance(a, b),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}
export function wallSegments(scene: Scene, wall: Wall) {
  const { length } = endpoints(scene, wall);
  let cursor = 0;
  const result: {
    offset: number;
    width: number;
    bottom: number;
    height: number;
  }[] = [];
  for (const o of scene.openings
    .filter((o) => o.wallId === wall.id)
    .sort((a, b) => a.offset - b.offset)) {
    if (o.offset > cursor)
      result.push({
        offset: cursor,
        width: o.offset - cursor,
        bottom: 0,
        height: wall.height,
      });
    if (o.sillHeight > 0)
      result.push({
        offset: o.offset,
        width: o.width,
        bottom: 0,
        height: o.sillHeight,
      });
    const top = o.sillHeight + o.height;
    if (top < wall.height)
      result.push({
        offset: o.offset,
        width: o.width,
        bottom: top,
        height: wall.height - top,
      });
    cursor = o.offset + o.width;
  }
  if (cursor < length)
    result.push({
      offset: cursor,
      width: length - cursor,
      bottom: 0,
      height: wall.height,
    });
  return result;
}

/** Driehoeken voor een muurdeel met dezelfde versneden plattegrondcontour als 2D. */
export function wallSegmentPrism(
  scene: Scene,
  wall: Wall,
  segment: ReturnType<typeof wallSegments>[number],
  suppliedOutline?: WallOutline,
) {
  const outline =
      suppliedOutline ?? wallOutlines(scene).find((o) => o.wallId === wall.id),
    { length } = endpoints(scene, wall);
  if (!outline || outline.points.length !== 4 || length <= 0)
    throw new Error("Muurcontour ontbreekt.");
  const [startLeft, endLeft, endRight, startRight] = outline.points as [
      Point,
      Point,
      Point,
      Point,
    ],
    at = (a: Point, b: Point, offset: number): Point => ({
      x: a.x + ((b.x - a.x) * offset) / length,
      y: a.y + ((b.y - a.y) * offset) / length,
    }),
    from = segment.offset,
    to = segment.offset + segment.width,
    a = at(startLeft, endLeft, from),
    b = at(startLeft, endLeft, to),
    c = at(startRight, endRight, to),
    d = at(startRight, endRight, from),
    bottom = segment.bottom,
    top = segment.bottom + segment.height,
    ab = [
      toThree(a.x, a.y, bottom),
      toThree(b.x, b.y, bottom),
      toThree(c.x, c.y, bottom),
      toThree(d.x, d.y, bottom),
    ] as const,
    atTop = [
      toThree(a.x, a.y, top),
      toThree(b.x, b.y, top),
      toThree(c.x, c.y, top),
      toThree(d.x, d.y, top),
    ] as const,
    triangles = [
      [atTop[0], atTop[1], atTop[2]],
      [atTop[0], atTop[2], atTop[3]],
      [ab[0], ab[2], ab[1]],
      [ab[0], ab[3], ab[2]],
      [ab[0], ab[1], atTop[1]],
      [ab[0], atTop[1], atTop[0]],
      [ab[1], ab[2], atTop[2]],
      [ab[1], atTop[2], atTop[1]],
      [ab[2], ab[3], atTop[3]],
      [ab[2], atTop[3], atTop[2]],
      [ab[3], ab[0], atTop[0]],
      [ab[3], atTop[0], atTop[3]],
    ];
  return new Float32Array(triangles.flat(2));
}
export function polygonArea(points: Point[]) {
  if (points.length < 3)
    throw new Error("Een contour heeft minimaal drie punten nodig.");
  return (
    Math.abs(
      points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length]!;
        return sum + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2
  );
}
export function snap(value: number, grid = 100) {
  return Math.round(value / grid) * grid;
}
export function parseDutchNumber(value: string) {
  if (!/^-?\d+(?:[,.]\d+)?$/.test(value.trim()))
    throw new Error("Vul een geldig getal in, bijvoorbeeld 2400 of 2,4.");
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("Ongeldig getal.");
  return n;
}
export function validateGeometry(scene: Scene) {
  const all = [
    ...scene.nodes,
    ...scene.walls,
    ...scene.openings,
    ...scene.items,
    ...scene.annotations,
  ].map((x) => x.id);
  if (new Set(all).size !== all.length) throw new Error("Dubbele object-ID.");
  for (const wall of scene.walls) {
    const { length } = endpoints(scene, wall);
    if (length < 50) throw new Error("Een muur moet minimaal 50 mm lang zijn.");
    let end = -1;
    for (const o of scene.openings
      .filter((o) => o.wallId === wall.id)
      .sort((a, b) => a.offset - b.offset)) {
      if (
        o.offset < end ||
        o.offset + o.width > length + 0.001 ||
        o.sillHeight + o.height > wall.height
      )
        throw new Error("Opening overlapt of past niet binnen de muur.");
      if (o.kind === "door" && o.sillHeight !== 0)
        throw new Error("Een deur begint op vloerniveau.");
      end = o.offset + o.width;
    }
  }
  for (const o of scene.openings)
    if (!scene.walls.some((w) => w.id === o.wallId))
      throw new Error("Opening heeft geen muur.");
}
export { detectRooms, type Room, type RoomDetection } from "./rooms";
export { wallOutlines, type WallOutline } from "./walls";
export {
  expandSelection,
  groupsIn,
  singletonGroupMembers,
  type Groupable,
} from "./grouping";
export {
  underlayScale,
  underlayPlacement,
  underlayToWorld,
  worldToUnderlay,
  underlayCorners,
  underlayCenter,
  rotateUnderlay,
  ASSUMED_MM_PER_PIXEL,
  type UnderlayLike,
  type Calibration,
} from "./underlay";
export {
  dimensionGeometry,
  formatMm,
  type DimensionGeometry,
} from "./dimension";
export {
  alignItems,
  distributeItems,
  itemsInRect,
  bounds,
  halfExtent,
  type Placed,
  type Placement,
  type Alignment,
} from "./arrange";
export {
  snapPoint,
  type SnapResult,
  type SnapTarget,
  type SnapOptions,
  type SnapKind,
} from "./snapping";
export {
  roomQuantities,
  type RoomQuantities,
  type QuantityDetection,
} from "./quantities";
