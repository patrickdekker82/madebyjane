import { test, expect } from "vitest";
import fc from "fast-check";
import { wallOutlines } from "../packages/geometry/src/walls";
import { polygonArea } from "../packages/geometry/src/index";
import type { Scene } from "../packages/contracts/src/index";

function graph(points: [number, number][], edges: [number, number][], thickness = 200) {
  const nodes = points.map(([x, y]) => ({ id: crypto.randomUUID(), x, y }));
  return {
    nodes,
    walls: edges.map(([a, b]) => ({
      id: crypto.randomUUID(),
      startId: nodes[a]!.id,
      endId: nodes[b]!.id,
      thickness,
      height: 2700,
    })),
  } satisfies Pick<Scene, "nodes" | "walls">;
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const hasPoint = (points: { x: number; y: number }[], x: number, y: number) =>
  points.some((p) => near(p.x, x) && near(p.y, y));

test("een losse muur eindigt stomp op zijn eindpunten", () => {
  const scene = graph([[0, 0], [4000, 0]], [[0, 1]]);
  const [outline] = wallOutlines(scene);
  expect(outline!.points).toHaveLength(4);
  for (const [x, y] of [[0, 100], [0, -100], [4000, 100], [4000, -100]])
    expect(hasPoint(outline!.points, x!, y!)).toBe(true);
  // Breedte maal lengte, zonder versnijding.
  expect(polygonArea(outline!.points)).toBeCloseTo(4000 * 200, 6);
});

test("een rechte hoek wordt versneden op de binnen- en buitenhoek", () => {
  // Muur 1 loopt naar rechts, muur 2 omlaag; ze delen (0,0).
  const scene = graph([[0, 0], [4000, 0], [0, 3000]], [[0, 1], [0, 2]]);
  const [first, second] = wallOutlines(scene);
  // Halve dikte is 100: de hoekpunten liggen op (100,100) en (-100,-100).
  expect(hasPoint(first!.points, 100, 100)).toBe(true);
  expect(hasPoint(first!.points, -100, -100)).toBe(true);
  expect(hasPoint(second!.points, 100, 100)).toBe(true);
  expect(hasPoint(second!.points, -100, -100)).toBe(true);
  // Het stompe uiteinde aan de andere kant blijft ongemoeid.
  expect(hasPoint(first!.points, 4000, 100)).toBe(true);
});

const inside = (polygon: { x: number; y: number }[], p: { x: number; y: number }) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
};

test("de versnijding dekt de buitenhoek die stompe uiteinden open laten", () => {
  const scene = graph([[0, 0], [4000, 0], [0, 3000]], [[0, 1], [0, 2]]);
  const outlines = wallOutlines(scene);
  // (-40,-50) ligt buiten beide muren zolang ze stomp op (0,0) eindigen: de ene
  // begint pas bij x=0, de andere pas bij y=0. Versneden hoort het punt erbij.
  expect(outlines.some((o) => inside(o.points, { x: -40, y: -50 }))).toBe(true);
  expect(outlines.some((o) => inside(o.points, { x: -50, y: -40 }))).toBe(true);
  // Verder van de hoek blijft buiten.
  expect(outlines.some((o) => inside(o.points, { x: -300, y: -300 }))).toBe(false);
  // De versnijding verplaatst materiaal en voegt netto niets toe bij een rechte
  // hoek: wat de buitenhoek erbij krijgt, verliest de binnenhoek.
  const total = outlines.reduce((sum, o) => sum + polygonArea(o.points), 0);
  expect(total).toBeCloseTo(4000 * 200 + 3000 * 200, 6);
});

test("muren van verschillende dikte sluiten netjes op elkaar aan", () => {
  const nodes = [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 4000, y: 0 },
    { id: "n2", x: 0, y: 3000 },
  ];
  const scene = {
    nodes,
    walls: [
      { id: "w1", startId: "n0", endId: "n1", thickness: 200, height: 2700 },
      { id: "w2", startId: "n0", endId: "n2", thickness: 400, height: 2700 },
    ],
  } satisfies Pick<Scene, "nodes" | "walls">;
  const [first, second] = wallOutlines(scene);
  // De dunne muur volgt de dikke: binnenhoek op x=200, buitenhoek op x=-200.
  expect(hasPoint(first!.points, 200, 100)).toBe(true);
  expect(hasPoint(first!.points, -200, -100)).toBe(true);
  // De dikke muur volgt de dunne: y=100 respectievelijk y=-100.
  expect(hasPoint(second!.points, 200, 100)).toBe(true);
  expect(hasPoint(second!.points, -200, -100)).toBe(true);
});

test("op een T-aansluiting eindigen alle muren stomp", () => {
  // Doorgaande muur gesplitst op (2000,0), met een stub omlaag.
  const scene = graph(
    [[0, 0], [2000, 0], [4000, 0], [2000, 3000]],
    [[0, 1], [1, 2], [1, 3]],
  );
  const outlines = wallOutlines(scene);
  expect(outlines).toHaveLength(3);
  // Geen enkel hoekpunt wijkt af van de stompe posities rond het knooppunt.
  for (const outline of outlines)
    for (const p of outline.points)
      expect(near(Math.abs(p.x), 0) || near(Math.abs(p.x - 2000), 0) || near(Math.abs(p.x - 4000), 0) || near(Math.abs(p.x - 1900), 0) || near(Math.abs(p.x - 2100), 0)).toBe(true);
});

test("een zeer scherpe hoek krijgt geen uitstekende punt", () => {
  // Twee bijna tegengestelde muren: de versnijding zou heel ver weglopen.
  const scene = graph([[0, 0], [4000, 0], [4000, 60]], [[0, 1], [1, 2]]);
  const outlines = wallOutlines(scene);
  for (const outline of outlines)
    for (const p of outline.points)
      expect(Math.hypot(p.x, p.y)).toBeLessThan(4000 + 6 * 200 + 1);
});

test("collineaire muren lopen door zonder versprong", () => {
  const scene = graph([[0, 0], [2000, 0], [4000, 0]], [[0, 1], [1, 2]]);
  const [first, second] = wallOutlines(scene);
  expect(hasPoint(first!.points, 2000, 100)).toBe(true);
  expect(hasPoint(second!.points, 2000, 100)).toBe(true);
  expect(hasPoint(first!.points, 2000, -100)).toBe(true);
});

test("iedere contour heeft vier eindige punten, ook bij willekeurige geometrie", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          x: fc.integer({ min: -20000, max: 20000 }),
          y: fc.integer({ min: -20000, max: 20000 }),
        }),
        { minLength: 2, maxLength: 6 },
      ),
      fc.integer({ min: 50, max: 1000 }),
      (points, thickness) => {
        const scene = graph(
          points.map((p) => [p.x, p.y] as [number, number]),
          points.slice(1).map((_, i) => [i, i + 1] as [number, number]),
          thickness,
        );
        for (const outline of wallOutlines(scene)) {
          expect(outline.points).toHaveLength(4);
          for (const p of outline.points)
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        }
      },
    ),
    { numRuns: 200 },
  );
});
