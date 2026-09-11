import { test, expect } from "vitest";
import fc from "fast-check";
import {
  ledLengthMm,
  ledSegments,
  ledCornerCount,
  ledBounds,
} from "../packages/geometry/src/led";
import { ledQuantity, ledTotals } from "../packages/domain/src/led";
import { applyOperations } from "../packages/domain/src/index";
import { demoScene } from "../packages/test-fixtures/src/index";
import type { LedPath } from "../packages/contracts/src/index";

const strip = (over: Partial<LedPath> = {}): LedPath => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "LED onder de keukenkast",
  points: [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
  ],
  heightMm: 2400,
  profile: "surface",
  direction: "down",
  color: "#ffd9a0",
  colorTemperatureK: 2700,
  wattPerMeterMw: 9600,
  connection: "Driver in de kast, links",
  note: "",
  orderLengthMm: null,
  ...over,
});

test("de lengte volgt uit de hoekpunten", () => {
  expect(ledLengthMm(strip().points)).toBe(3000);
  // Drie stukken met een hoek: 3.000 + 1.000 + 2.000.
  expect(
    ledLengthMm([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
      { x: 1000, y: 1000 },
    ]),
  ).toBe(6000);
  // Schuin: 3-4-5.
  expect(
    ledLengthMm([
      { x: 0, y: 0 },
      { x: 3000, y: 4000 },
    ]),
  ).toBe(5000);
});

test("segmenten geven elk stuk apart terug", () => {
  const segments = ledSegments([
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 1000 },
  ]);
  expect(segments).toHaveLength(2);
  expect(segments[0]!.lengthMm).toBe(3000);
  expect(segments[1]!.lengthMm).toBe(1000);
});

test("alleen echte knikken tellen als hoek", () => {
  expect(ledCornerCount(strip().points)).toBe(0);
  expect(
    ledCornerCount([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
    ]),
  ).toBe(1);
  // Een extra punt midden op een rechte lijn buigt niets en telt dus niet mee.
  expect(
    ledCornerCount([
      { x: 0, y: 0 },
      { x: 1500, y: 0 },
      { x: 3000, y: 0 },
    ]),
  ).toBe(0);
  // Terugvouwen is wel degelijk een hoek, ook al ligt het punt op de lijn.
  expect(
    ledCornerCount([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 1000, y: 0 },
    ]),
  ).toBe(1);
});

test("het omhullende vierkant dekt alle punten", () => {
  expect(
    ledBounds({
      points: [
        { x: -500, y: 200 },
        { x: 3000, y: -100 },
      ],
    }),
  ).toEqual({ minX: -500, minY: -100, maxX: 3000, maxY: 200 });
});

test("de hoeveelheid rekent meters en watt uit de tekening", () => {
  const q = ledQuantity(strip());
  expect(q.lengthM).toBe("3.000");
  // 3 m x 9,6 W/m = 28,8 W.
  expect(q.powerW).toBe("28.800");
  expect(q.corners).toBe(0);
  // Zolang er niets besteld is, staat er geen bestellengte.
  expect(q.orderLengthM).toBeNull();
  expect(q.orderDifferenceM).toBeNull();
});

test("de bestellengte staat los van de gemeten lengte", () => {
  const q = ledQuantity(strip({ orderLengthMm: 5000 }));
  expect(q.lengthM).toBe("3.000");
  expect(q.orderLengthM).toBe("5.000");
  expect(q.orderDifferenceM).toBe("2.000");
  // Te kort besteld hoort zichtbaar te zijn, niet stilzwijgend aangevuld.
  expect(ledQuantity(strip({ orderLengthMm: 2500 })).orderDifferenceM).toBe(
    "-0.500",
  );
});

test("meters worden op drie decimalen afgerond, half naar boven", () => {
  const q = ledQuantity(
    strip({
      points: [
        { x: 0, y: 0 },
        { x: 1234, y: 1234 },
      ],
    }),
  );
  // 1.234 x wortel 2 = 1745,1385... mm.
  expect(q.lengthM).toBe("1.745");
});

test("totalen tellen strips bij elkaar op", () => {
  const totals = ledTotals([
    strip(),
    strip({
      id: "22222222-2222-4222-8222-222222222222",
      points: [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
        { x: 2000, y: 500 },
      ],
      wattPerMeterMw: 4800,
    }),
  ]);
  expect(totals.count).toBe(2);
  expect(totals.lengthM).toBe("5.500");
  // 28,800 + 2,500 x 4,8 = 28,800 + 12,000.
  expect(totals.powerW).toBe("40.800");
  expect(totals.corners).toBe(1);
});

test("de lengte is nooit negatief en verandert niet door de volgorde om te draaien", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          x: fc.integer({ min: -50000, max: 50000 }),
          y: fc.integer({ min: -50000, max: 50000 }),
        }),
        { minLength: 2, maxLength: 40 },
      ),
      (points) => {
        const forward = ledLengthMm(points);
        expect(forward).toBeGreaterThanOrEqual(0);
        expect(ledLengthMm([...points].reverse())).toBeCloseTo(forward, 6);
      },
    ),
    { numRuns: 200 },
  );
});

const scene = demoScene(
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
);

test("een strip plaatsen, bijwerken en verwijderen via opdrachten", () => {
  const added = applyOperations(scene, [{ type: "AddLedPath", path: strip() }]);
  expect(added.ledPaths).toHaveLength(1);
  const moved = applyOperations(added, [
    {
      type: "UpdateLedPath",
      id: strip().id,
      path: strip({
        points: [
          { x: 0, y: 0 },
          { x: 3000, y: 0 },
          { x: 3000, y: 1200 },
        ],
      }),
    },
  ]);
  expect(ledQuantity(moved.ledPaths[0]!).lengthM).toBe("4.200");
  const removed = applyOperations(moved, [
    { type: "DeleteSelection", ids: [strip().id] },
  ]);
  expect(removed.ledPaths).toHaveLength(0);
});

test("een strip kan niet twee keer bestaan of van identiteit wisselen", () => {
  const added = applyOperations(scene, [{ type: "AddLedPath", path: strip() }]);
  expect(() =>
    applyOperations(added, [{ type: "AddLedPath", path: strip() }]),
  ).toThrow("bestaat al");
  expect(() =>
    applyOperations(added, [
      {
        type: "UpdateLedPath",
        id: strip().id,
        path: strip({ id: "77777777-7777-4777-8777-777777777777" }),
      },
    ]),
  ).toThrow("identiteit");
  expect(() =>
    applyOperations(scene, [
      {
        type: "UpdateLedPath",
        id: strip().id,
        path: strip(),
      },
    ]),
  ).toThrow("bestaat niet meer");
});

test("twee dezelfde punten na elkaar worden geweigerd", () => {
  expect(() =>
    applyOperations(scene, [
      {
        type: "AddLedPath",
        path: strip({
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        }),
      },
    ]),
  ).toThrow();
});

test("scenes van voor deze stap blijven geldig", () => {
  // ledPaths heeft een standaardwaarde, dus een ouder document parseert gewoon.
  const { ledPaths, ...older } = scene;
  expect(ledPaths).toEqual([]);
  const parsed = applyOperations({ ...older, ledPaths: [] }, [
    { type: "AddLedPath", path: strip() },
  ]);
  expect(parsed.ledPaths).toHaveLength(1);
});
