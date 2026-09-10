import { test, expect } from "vitest";
import fc from "fast-check";
import { dimensionGeometry, formatMm } from "../packages/geometry/src/dimension";

test("een horizontale maat meet zijn lengte en verschuift loodrecht", () => {
  const d = dimensionGeometry({ x: 0, y: 0 }, { x: 5000, y: 0 }, 400);
  expect(d.lengthMm).toBe(5000);
  // Linkernormaal van (1,0) is (0,1): de maatlijn schuift naar y = 400.
  expect(d.line).toEqual({ from: { x: 0, y: 400 }, to: { x: 5000, y: 400 } });
  expect(d.extensions[0]).toEqual({
    from: { x: 0, y: 0 },
    to: { x: 0, y: 400 },
  });
  expect(d.label).toEqual({ x: 2500, y: 400, angle: 0 });
});

test("een negatieve verschuiving legt de maatlijn aan de andere kant", () => {
  const d = dimensionGeometry({ x: 0, y: 0 }, { x: 5000, y: 0 }, -400);
  expect(d.line.from.y).toBe(-400);
  expect(d.lengthMm).toBe(5000);
});

test("zonder verschuiving valt de maatlijn samen met de gemeten lijn", () => {
  const d = dimensionGeometry({ x: 100, y: 200 }, { x: 100, y: 900 }, 0);
  expect(d.line).toEqual({ from: { x: 100, y: 200 }, to: { x: 100, y: 900 } });
  expect(d.extensions.every((e) => e.from.x === e.to.x && e.from.y === e.to.y)).toBe(true);
  expect(d.lengthMm).toBe(700);
});

test("de lengte is de echte afstand, ook schuin, en op hele millimeters", () => {
  expect(dimensionGeometry({ x: 0, y: 0 }, { x: 3000, y: 4000 }, 0).lengthMm).toBe(5000);
  // 1000 en 1000 geeft 1414,21...; dat wordt 1414.
  expect(dimensionGeometry({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 0).lengthMm).toBe(1414);
});

test("het label staat nooit op zijn kop", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -20000, max: 20000 }),
      fc.integer({ min: -20000, max: 20000 }),
      fc.integer({ min: -1000, max: 1000 }),
      (x, y, offset) => {
        fc.pre(x !== 0 || y !== 0);
        const d = dimensionGeometry({ x: 0, y: 0 }, { x, y }, offset);
        expect(d.label.angle).toBeGreaterThanOrEqual(-90);
        expect(d.label.angle).toBeLessThanOrEqual(90);
        expect(Number.isInteger(d.lengthMm)).toBe(true);
      },
    ),
    { numRuns: 300 },
  );
});

test("twee gelijke punten leveren een leesbare fout", () => {
  expect(() => dimensionGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }, 100)).toThrow(
    "twee verschillende punten",
  );
});

test("maten worden Nederlands weergegeven", () => {
  expect(formatMm(2400)).toBe("2.400 mm");
  expect(formatMm(980)).toBe("980 mm");
});
