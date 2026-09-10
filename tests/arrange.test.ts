import { test, expect } from "vitest";
import fc from "fast-check";
import {
  alignItems,
  distributeItems,
  bounds,
  halfExtent,
  itemsInRect,
  type Placed,
} from "../packages/geometry/src/arrange";

const placed = (
  id: string,
  x: number,
  y: number,
  width = 1000,
  depth = 400,
  rotation = 0,
): Placed => ({ id, x, y, width, depth, rotation });

test("de omhullende houdt rekening met draaiing", () => {
  expect(halfExtent(placed("a", 0, 0, 1000, 400))).toEqual({ x: 500, y: 200 });
  // Een kwartslag verwisselt breedte en diepte.
  const quarter = halfExtent(placed("a", 0, 0, 1000, 400, 90));
  expect(quarter.x).toBeCloseTo(200, 9);
  expect(quarter.y).toBeCloseTo(500, 9);
  // 45 graden: (1000 + 400) / 2 * sqrt(2)/2 in beide richtingen.
  const diagonal = halfExtent(placed("a", 0, 0, 1000, 400, 45));
  expect(diagonal.x).toBeCloseTo((1400 * Math.SQRT1_2) / 2, 9);
  expect(diagonal.y).toBeCloseTo(diagonal.x, 9);
  // De draairichting doet er niet toe voor de omhullende.
  expect(halfExtent(placed("a", 0, 0, 1000, 400, -30))).toEqual(
    halfExtent(placed("a", 0, 0, 1000, 400, 30)),
  );
});

test("uitlijnen zet randen of harten gelijk en laat de andere as met rust", () => {
  const items = [
    placed("a", 1000, 500, 1000, 400),
    placed("b", 3000, 900, 600, 200),
  ];
  expect(alignItems(items, "left")).toEqual([
    { id: "a", x: 1000, y: 500 },
    { id: "b", x: 800, y: 900 },
  ]);
  // Gezamenlijke rechterrand ligt op 3300: a wordt 3300 - 500, b wordt 3300 - 300.
  expect(alignItems(items, "right")).toEqual([
    { id: "a", x: 2800, y: 500 },
    { id: "b", x: 3000, y: 900 },
  ]);
  // Gezamenlijke omhullende loopt van 500 tot 3300; hart is 1900.
  expect(alignItems(items, "centerX")).toEqual([
    { id: "a", x: 1900, y: 500 },
    { id: "b", x: 1900, y: 900 },
  ]);
  // Omhullenden op de y-as: a loopt 300..700, b loopt 800..1000.
  expect(alignItems(items, "top")).toEqual([
    { id: "a", x: 1000, y: 500 },
    { id: "b", x: 3000, y: 400 },
  ]);
  expect(alignItems(items, "bottom")).toEqual([
    { id: "a", x: 1000, y: 800 },
    { id: "b", x: 3000, y: 900 },
  ]);
});

test("uitlijnen gebruikt de gedraaide omhullende", () => {
  const items = [
    placed("a", 1000, 1000, 1000, 400),
    placed("b", 3000, 1000, 1000, 400, 90),
  ];
  // b is gedraaid en dus 400 breed: zijn linkerrand ligt op 2800.
  expect(bounds(items[1]!).minX).toBeCloseTo(2800, 9);
  const [, movedB] = alignItems(items, "left");
  expect(movedB).toEqual({ id: "b", x: 700, y: 1000 });
});

test("minder dan twee meubels levert geen wijziging", () => {
  expect(alignItems([placed("a", 0, 0)], "left")).toEqual([]);
  expect(alignItems([], "left")).toEqual([]);
  expect(distributeItems([placed("a", 0, 0), placed("b", 5000, 0)], "x")).toEqual([]);
});

test("verdelen maakt de tussenruimten gelijk en laat de buitenste staan", () => {
  const items = [
    placed("a", 500, 0, 1000, 400),
    placed("b", 2000, 0, 600, 400),
    placed("c", 9500, 0, 1000, 400),
  ];
  const result = distributeItems(items, "x");
  expect(result[0]).toEqual({ id: "a", x: 500, y: 0 });
  expect(result[2]).toEqual({ id: "c", x: 9500, y: 0 });
  // Beslag 1000 + 600 + 1000 = 2600 over een span van 10000; twee gaten van 3700.
  expect(result[1]).toEqual({ id: "b", x: 5000, y: 0 });
  const gaps = result.map((r, index) => {
    const item = items.find((i) => i.id === r.id)!;
    return { min: r.x - halfExtent(item).x, max: r.x + halfExtent(item).x, index };
  });
  expect(gaps[1]!.min - gaps[0]!.max).toBeCloseTo(gaps[2]!.min - gaps[1]!.max, 6);
});

test("verdelen werkt ook op de y-as en negeert de invoervolgorde", () => {
  const items = [
    placed("c", 0, 9000, 400, 1000),
    placed("a", 0, 1000, 400, 1000),
    placed("b", 0, 3000, 400, 1000),
  ];
  const result = distributeItems(items, "y");
  expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  expect(result[0]!.y).toBe(1000);
  expect(result[2]!.y).toBe(9000);
  expect(result[1]!.y).toBe(5000);
  expect(result.every((r) => r.x === 0)).toBe(true);
});

test("te weinig ruimte levert overlap, geen fout", () => {
  const items = [
    placed("a", 500, 0, 1000, 400),
    placed("b", 800, 0, 1000, 400),
    placed("c", 1100, 0, 1000, 400),
  ];
  const result = distributeItems(items, "x");
  expect(result).toHaveLength(3);
  expect(result[0]!.x).toBe(500);
  expect(result[2]!.x).toBe(1100);
  expect(result.every((r) => Number.isInteger(r.x))).toBe(true);
});

test("uitkomsten zijn altijd hele millimeters", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          x: fc.integer({ min: -20000, max: 20000 }),
          y: fc.integer({ min: -20000, max: 20000 }),
          width: fc.integer({ min: 1, max: 5000 }),
          depth: fc.integer({ min: 1, max: 5000 }),
          rotation: fc.integer({ min: -360, max: 360 }),
        }),
        { minLength: 3, maxLength: 8 },
      ),
      (records) => {
        const items = records.map((r, index) => ({ id: "i" + index, ...r }));
        for (const mode of ["left", "right", "top", "bottom", "centerX", "centerY"] as const)
          for (const p of alignItems(items, mode))
            expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        for (const axis of ["x", "y"] as const)
          for (const p of distributeItems(items, axis))
            expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
      },
    ),
    { numRuns: 200 },
  );
});

test("een sleepkader raakt objecten die het kader aanraken", () => {
  const items = [
    placed("a", 1000, 1000, 1000, 400),
    placed("b", 5000, 1000, 1000, 400),
    placed("c", 1000, 5000, 1000, 400),
  ];
  const rect = { x1: 0, y1: 0, x2: 2000, y2: 2000 };
  expect(itemsInRect(items, rect)).toEqual(["a"]);
  // Alleen de rand raken is genoeg: a loopt van 500 tot 1500.
  expect(itemsInRect(items, { x1: 1500, y1: 1000, x2: 1600, y2: 1100 })).toEqual(["a"]);
  expect(itemsInRect(items, { x1: 1501, y1: 1000, x2: 1600, y2: 1100 })).toEqual([]);
  // Het kader mag van rechtsonder naar linksboven getrokken zijn.
  expect(itemsInRect(items, { x1: 2000, y1: 2000, x2: 0, y2: 0 })).toEqual(["a"]);
  expect(itemsInRect(items, { x1: -1000, y1: -1000, x2: 9000, y2: 9000 })).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("het sleepkader gebruikt de gedraaide omhullende", () => {
  const upright = placed("a", 1000, 1000, 400, 3000);
  const turned = placed("b", 6000, 1000, 400, 3000, 90);
  // Gedraaid is b 3000 breed: van 4500 tot 7500.
  expect(itemsInRect([upright, turned], { x1: 4600, y1: 900, x2: 4700, y2: 1100 })).toEqual(["b"]);
  // Ongedraaid zou b daar niet komen.
  expect(itemsInRect([{ ...turned, rotation: 0 }], { x1: 4600, y1: 900, x2: 4700, y2: 1100 })).toEqual([]);
});
