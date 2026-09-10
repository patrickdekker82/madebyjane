import { test, expect } from "vitest";
import fc from "fast-check";
import { snapPoint } from "../packages/geometry/src/snapping";
import { emptyScene } from "../packages/test-fixtures/src/index";
import type { Scene } from "../packages/contracts/src/index";

function scene(): Scene {
  return emptyScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
}
function withWall(from: [number, number], to: [number, number]) {
  const s = scene();
  s.nodes = [from, to].map(([x, y]) => ({ id: crypto.randomUUID(), x, y }));
  s.walls = [
    {
      id: crypto.randomUUID(),
      startId: s.nodes[0]!.id,
      endId: s.nodes[1]!.id,
      thickness: 180,
      height: 2700,
    },
  ];
  return s;
}
const item = (x: number, y: number, width = 2400, depth = 950) => ({
  id: crypto.randomUUID(),
  name: "Bank",
  kind: "sofa" as const,
  x,
  y,
  width,
  depth,
  height: 780,
  rotation: 0,
  color: "#c4b39d",
  custom: false,
});

test("een muurpunt wint van muur, object en raster en legt beide assen vast", () => {
  const s = withWall([0, 0], [5000, 0]);
  s.items = [item(4990, 30)];
  const result = snapPoint(s, { x: 4980, y: 20 }, { toleranceMm: 100, grid: true });
  expect([result.x, result.y]).toEqual([5000, 0]);
  expect(result.targets).toEqual([{ kind: "node", id: s.nodes[1]!.id }]);
});

test("het dichtstbijzijnde muurpunt wint", () => {
  const s = withWall([0, 0], [400, 0]);
  const result = snapPoint(s, { x: 260, y: 0 }, { toleranceMm: 300, grid: false });
  expect(result.x).toBe(400);
  expect(snapPoint(s, { x: 140, y: 0 }, { toleranceMm: 300, grid: false }).x).toBe(0);
});

test("buiten bereik wordt niet gevangen; zonder raster blijft het punt staan", () => {
  const s = withWall([0, 0], [5000, 0]);
  const result = snapPoint(s, { x: 2500, y: 900 }, { toleranceMm: 100, grid: false });
  expect([result.x, result.y]).toEqual([2500, 900]);
  expect(result.targets).toEqual([]);
});

test("een punt naast de muur valt loodrecht op de hartlijn, ook bij een schuine muur", () => {
  const straight = snapPoint(withWall([0, 0], [5000, 0]), { x: 2517, y: 60 }, { toleranceMm: 100, grid: false });
  expect([straight.x, straight.y]).toEqual([2517, 0]);
  expect(straight.targets[0]!.kind).toBe("wall");
  // Schuine muur van (0,0) naar (1000,1000): (600,400) projecteert op (500,500).
  const slanted = snapPoint(withWall([0, 0], [1000, 1000]), { x: 600, y: 400 }, { toleranceMm: 200, grid: false });
  expect([slanted.x, slanted.y]).toEqual([500, 500]);
});

test("voorbij het muursegment vangt de muur niet", () => {
  const s = withWall([0, 0], [5000, 0]);
  const result = snapPoint(s, { x: 5400, y: 20 }, { toleranceMm: 100, grid: false });
  expect(result.targets).toEqual([]);
});

test("meubels lijnen per as uit op hart of rand, en assen combineren", () => {
  const s = scene();
  const reference = item(3000, 2000);
  s.items = [reference, item(9000, 9000, 1000, 1000)];
  const dragged = s.items[1]!.id;
  // Hart op x, rand op y: 2000 + 950/2 = 2475.
  const result = snapPoint(s, { x: 3040, y: 2450 }, { toleranceMm: 60, grid: false, exclude: [dragged] });
  expect([result.x, result.y]).toEqual([3000, 2475]);
  expect(result.targets.map(t => t.kind)).toEqual(["object", "object"]);
  expect(result.targets.every(t => t.id === reference.id)).toBe(true);
  expect(result.targets[0]!.guide).toBeTruthy();
});

test("het gesleepte meubel vangt niet aan zichzelf", () => {
  const s = scene();
  s.items = [item(3000, 2000)];
  const self = s.items[0]!.id;
  const result = snapPoint(s, { x: 3010, y: 2010 }, { toleranceMm: 60, grid: false, exclude: [self] });
  expect([result.x, result.y]).toEqual([3010, 2010]);
  expect(result.targets).toEqual([]);
});

test("het raster vult alleen de assen die nog vrij zijn", () => {
  const s = scene();
  s.items = [item(3000, 2000)];
  const dragged = crypto.randomUUID();
  const both = snapPoint(s, { x: 7460, y: 4530 }, { toleranceMm: 40, grid: true, exclude: [dragged] });
  expect([both.x, both.y]).toEqual([7500, 4500]);
  expect(both.targets.map(t => t.kind)).toEqual(["grid"]);
  // x vangt op het meubelhart, y valt terug op het raster.
  const mixed = snapPoint(s, { x: 3020, y: 4530 }, { toleranceMm: 40, grid: true, exclude: [dragged] });
  expect([mixed.x, mixed.y]).toEqual([3000, 4500]);
  expect(mixed.targets.map(t => t.kind)).toEqual(["object", "grid"]);
});

test("losse vangsoorten zijn uit te zetten", () => {
  const s = withWall([0, 0], [5000, 0]);
  const result = snapPoint(s, { x: 4980, y: 20 }, { toleranceMm: 100, grid: false, kinds: { node: false } });
  expect(result.targets[0]!.kind).toBe("wall");
  expect(snapPoint(s, { x: 4980, y: 20 }, { toleranceMm: 100, grid: false, kinds: { node: false, wall: false } }).targets).toEqual([]);
});

test("de tolerantie is een wereldmaat: bij verder uitzoomen vangt hetzelfde punt wel", () => {
  const s = withWall([0, 0], [5000, 0]);
  // Net voorbij het muureinde, dus de muur zelf vangt hier niet.
  const point = { x: 5100, y: 0 };
  const pixels = 12;
  // Ingezoomd (0,3 px/mm) is 12 px maar 40 mm; uitgezoomd (0,025) is het 480 mm.
  expect(snapPoint(s, point, { toleranceMm: pixels / 0.3, grid: false }).targets).toEqual([]);
  expect(snapPoint(s, point, { toleranceMm: pixels / 0.025, grid: false }).x).toBe(5000);
});

test("de uitkomst is altijd een geheel aantal millimeters", () => {
  fc.assert(
    fc.property(
      fc.double({ min: -20000, max: 20000, noNaN: true }),
      fc.double({ min: -20000, max: 20000, noNaN: true }),
      fc.boolean(),
      (x, y, grid) => {
        const s = withWall([0, 0], [3333, 7777]);
        s.items = [item(1234, 5678, 999, 777)];
        const result = snapPoint(s, { x, y }, { toleranceMm: 150, grid });
        expect(Number.isInteger(result.x)).toBe(true);
        expect(Number.isInteger(result.y)).toBe(true);
      },
    ),
    { numRuns: 300 },
  );
});
