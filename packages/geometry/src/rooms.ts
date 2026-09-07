import type { Point, Scene } from "../../contracts/src/index";
export type Room = {
  id: string;
  contour: Point[];
  holes: Point[][];
  areaMm2: number;
};
export type RoomDetection = { rooms: Room[]; issues: string[] };
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const on = (a: Point, b: Point, p: Point) =>
  cross(a, b, p) === 0 &&
  p.x >= Math.min(a.x, b.x) &&
  p.x <= Math.max(a.x, b.x) &&
  p.y >= Math.min(a.y, b.y) &&
  p.y <= Math.max(a.y, b.y);
const area = (p: Point[]) =>
  p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;
function inside(point: Point, polygon: Point[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (on(a, b, point)) return false;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      yes = !yes;
  }
  return yes;
}
/** Bounded planar faces along wall centerlines. Never claims usable/net floor area. */
export function detectRooms(
  scene: Pick<Scene, "nodes" | "walls">,
): RoomDetection {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const edges = scene.walls.map((w) => ({
    a: nodes.get(w.startId)!,
    b: nodes.get(w.endId)!,
    id: w.id,
  }));
  if (edges.some((e) => !e.a || !e.b))
    return { rooms: [], issues: ["Een muur mist een eindpunt."] };
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i]!,
        f = edges[j]!,
        c1 = cross(e.a, e.b, f.a),
        c2 = cross(e.a, e.b, f.b),
        c3 = cross(f.a, f.b, e.a),
        c4 = cross(f.a, f.b, e.b);
      const contacts = [
        [e.a, f.a, f.b],
        [e.b, f.a, f.b],
        [f.a, e.a, e.b],
        [f.b, e.a, e.b],
      ] as const;
      const badContact = contacts.some(
        ([p, a, b]) => on(a, b, p) && p.id !== a.id && p.id !== b.id,
      );
      const duplicate =
        (e.a.id === f.a.id && e.b.id === f.b.id) ||
        (e.a.id === f.b.id && e.b.id === f.a.id);
      if (badContact || duplicate || (c1 * c2 < 0 && c3 * c4 < 0))
        return {
          rooms: [],
          issues: [
            "Muren kruisen, overlappen of raken zonder gedeeld eindpunt. Verbind de muurpunten om ruimtes te berekenen.",
          ],
        };
    }
  const graph = new Map<string, string[]>();
  for (const { a, b } of edges) {
    graph.set(a.id, [...(graph.get(a.id) ?? []), b.id]);
    graph.set(b.id, [...(graph.get(b.id) ?? []), a.id]);
  }
  // Open wall branches do not enclose a face. Peel them before walking boundaries.
  const queue = [...graph].filter(([, ns]) => ns.length < 2).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const n of graph.get(id) ?? []) {
      const ns = graph.get(n)!.filter((x) => x !== id);
      graph.set(n, ns);
      if (ns.length === 1) queue.push(n);
    }
    graph.delete(id);
  }
  for (const [id, ns] of graph) {
    const a = nodes.get(id)!;
    ns.sort((x, y) => {
      const b = nodes.get(x)!,
        c = nodes.get(y)!;
      return (
        Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(c.y - a.y, c.x - a.x)
      );
    });
  }
  const visited = new Set<string>(),
    faces: { ids: string[]; contour: Point[]; area: number }[] = [];
  for (const [start, neighbors] of graph)
    for (const neighbor of neighbors) {
      if (visited.has(start + ":" + neighbor)) continue;
      let a = start,
        b = neighbor;
      const ids: string[] = [];
      let closed = false;
      for (let guard = 0; guard <= edges.length * 2; guard++) {
        const key = a + ":" + b;
        if (visited.has(key)) {
          closed = a === start && b === neighbor;
          break;
        }
        visited.add(key);
        ids.push(a);
        const adjacent = graph.get(b)!;
        const next =
          adjacent[
            (adjacent.indexOf(a) - 1 + adjacent.length) % adjacent.length
          ]!;
        a = b;
        b = next;
      }
      const contour = ids.map((id) => ({
        x: nodes.get(id)!.x,
        y: nodes.get(id)!.y,
      }));
      const signed = area(contour);
      if (closed && signed > 0 && new Set(ids).size === ids.length)
        faces.push({ ids, contour, area: signed });
    }
  const parents = faces.map((face, i) => {
    let parent = -1;
    for (let j = 0; j < faces.length; j++) {
      const other = faces[j]!;
      if (
        i !== j &&
        other.area > face.area &&
        face.contour.every((p) => inside(p, other.contour)) &&
        (parent < 0 || other.area < faces[parent]!.area)
      )
        parent = j;
    }
    return parent;
  });
  const rooms = faces
    .map((face, i) => {
      const children = faces.filter((_, j) => parents[j] === i);
      return {
        id: [...face.ids].sort().join(":"),
        contour: face.contour,
        holes: children.map((c) => c.contour),
        areaMm2: face.area - children.reduce((n, c) => n + c.area, 0),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    rooms,
    issues: rooms.length
      ? []
      : [
          "Nog geen gesloten ruimte. Verbind de muurpunten tot een gesloten contour.",
        ],
  };
}
