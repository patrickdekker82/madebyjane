import type { Point, Scene, Wall } from "../../contracts/src/index";
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
export { ledLengthMm, ledSegments, ledCornerCount, ledBounds } from "./led";
export { beamFootprint, beamBounds, type BeamFootprint } from "./beam";
export { fixtureSymbols, defaultSymbolSizeMm } from "./fixture-symbols";
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
