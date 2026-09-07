import { test, expect } from "vitest";
import fc from "fast-check";
import { detectRooms, polygonArea } from "../packages/geometry/src/index";
import type { Scene } from "../packages/contracts/src/index";
import { demoScene } from "../packages/test-fixtures/src/index";
function graph(
  points: [number, number][],
  edges: [number, number][],
): Pick<Scene, "nodes" | "walls"> {
  const nodes = points.map(([x, y]) => ({ id: crypto.randomUUID(), x, y }));
  return {
    nodes,
    walls: edges.map(([a, b]) => ({
      id: crypto.randomUUID(),
      startId: nodes[a]!.id,
      endId: nodes[b]!.id,
      thickness: 180,
      height: 2700,
    })),
  };
}
const square = () =>
  graph(
    [
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  );
test("rechthoek, schuine kamer en richtingsonafhankelijke oppervlakte", () => {
  expect(detectRooms(square()).rooms[0]!.areaMm2).toBe(12000000);
  const scene = demoScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
  const rooms = detectRooms(scene);
  expect(rooms.issues).toEqual([]);
  expect(rooms.rooms).toHaveLength(1);
  expect(rooms.rooms[0]!.areaMm2).toBe(polygonArea(scene.nodes));
  scene.walls.reverse();
  for (const wall of scene.walls)
    [wall.startId, wall.endId] = [wall.endId, wall.startId];
  expect(detectRooms(scene)).toEqual(rooms);
});
test("twee aangrenzende kamers en open muurvertakking", () => {
  const scene = graph(
    [
      [0, 0],
      [2000, 0],
      [4000, 0],
      [4000, 3000],
      [2000, 3000],
      [0, 3000],
      [1000, 1000],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [1, 4],
      [0, 6],
    ],
  );
  const rooms = detectRooms(scene).rooms;
  expect(rooms).toHaveLength(2);
  expect(rooms.map((r) => r.areaMm2)).toEqual([6000000, 6000000]);
});
test("kruisingen, overlap en los rakende eindpunten geven geen schijnoppervlakte", () => {
  for (const scene of [
    graph(
      [
        [0, 0],
        [3000, 3000],
        [0, 3000],
        [3000, 0],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
    ),
    graph(
      [
        [0, 0],
        [4000, 0],
        [2000, 0],
        [5000, 0],
      ],
      [
        [0, 1],
        [2, 3],
      ],
    ),
    graph(
      [
        [0, 0],
        [4000, 0],
        [2000, 0],
        [2000, 3000],
      ],
      [
        [0, 1],
        [2, 3],
      ],
    ),
  ]) {
    const result = detectRooms(scene);
    expect(result.rooms).toEqual([]);
    expect(result.issues).toHaveLength(1);
  }
  const open = square();
  open.walls.pop();
  expect(detectRooms(open).rooms).toEqual([]);
});
test("geneste contouren tellen hun binnenruimte niet dubbel", () => {
  const outer = square(),
    inner = graph(
      [
        [1000, 1000],
        [2000, 1000],
        [2000, 2000],
        [1000, 2000],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
    );
  const rooms = detectRooms({
    nodes: [...outer.nodes, ...inner.nodes],
    walls: [...outer.walls, ...inner.walls],
  }).rooms;
  expect(rooms).toHaveLength(2);
  expect(rooms.reduce((sum, r) => sum + r.areaMm2, 0)).toBe(12000000);
  expect(rooms.find((r) => r.holes.length)!.areaMm2).toBe(11000000);
});
test("500 rechthoeken behouden exacte mm² bij translatie", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 50, max: 20000 }),
      fc.integer({ min: 50, max: 20000 }),
      fc.integer({ min: -30000, max: 30000 }),
      fc.integer({ min: -30000, max: 30000 }),
      (w, h, x, y) => {
        const scene = graph(
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
          [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 0],
          ],
        );
        expect(detectRooms(scene).rooms[0]!.areaMm2).toBe(w * h);
      },
    ),
    { numRuns: 500 },
  );
});
