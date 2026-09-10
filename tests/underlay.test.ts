import { test, expect } from "vitest";
import fc from "fast-check";
import {
  underlayScale,
  underlayPlacement,
  underlayToWorld,
  worldToUnderlay,
  ASSUMED_MM_PER_PIXEL,
} from "../packages/geometry/src/underlay";

const base = { widthPx: 1000, heightPx: 800, x: 0, y: 0, calibration: null };

test("zonder kalibratie geldt een aangenomen schaal", () => {
  expect(underlayScale(base)).toBe(ASSUMED_MM_PER_PIXEL);
  expect(underlayPlacement(base)).toEqual({
    x: 0,
    y: 0,
    width: 1000 * ASSUMED_MM_PER_PIXEL,
    height: 800 * ASSUMED_MM_PER_PIXEL,
    scale: ASSUMED_MM_PER_PIXEL,
  });
});

test("de schaal volgt uit twee punten en de opgegeven afstand", () => {
  // 400 pixels staan voor 5.000 mm: 12,5 mm per pixel.
  const calibrated = {
    ...base,
    calibration: { from: { x: 100, y: 200 }, to: { x: 500, y: 200 }, lengthMm: 5000 },
  };
  expect(underlayScale(calibrated)).toBe(12.5);
  expect(underlayPlacement(calibrated).width).toBe(12500);
  // Ook schuin gemeten: 300-400-500.
  const diagonal = {
    ...base,
    calibration: { from: { x: 0, y: 0 }, to: { x: 300, y: 400 }, lengthMm: 2500 },
  };
  expect(underlayScale(diagonal)).toBe(5);
});

test("punten rekenen heen en weer met de plaatsing van de onderlegger", () => {
  const underlay = {
    ...base,
    x: -2000,
    y: 1500,
    calibration: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, lengthMm: 1000 },
  };
  // 10 mm per pixel.
  expect(underlayToWorld(underlay, { x: 50, y: 30 })).toEqual({ x: -1500, y: 1800 });
  expect(worldToUnderlay(underlay, { x: -1500, y: 1800 })).toEqual({ x: 50, y: 30 });
});

test("een kalibratie zonder afstand tussen de punten wordt geweigerd", () => {
  expect(() =>
    underlayScale({
      ...base,
      calibration: { from: { x: 5, y: 5 }, to: { x: 5, y: 5 }, lengthMm: 1000 },
    }),
  ).toThrow("twee verschillende punten");
  expect(() =>
    underlayScale({
      ...base,
      calibration: { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, lengthMm: 0 },
    }),
  ).toThrow("twee verschillende punten");
});

test("heen en terug rekenen levert hetzelfde punt op", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -20000, max: 20000 }),
      fc.integer({ min: -20000, max: 20000 }),
      fc.integer({ min: 1, max: 100000 }),
      fc.integer({ min: 1, max: 4000 }),
      (px, py, lengthMm, pixels) => {
        const underlay = {
          ...base,
          x: 1234,
          y: -567,
          calibration: {
            from: { x: 0, y: 0 },
            to: { x: pixels, y: 0 },
            lengthMm,
          },
        };
        const back = worldToUnderlay(underlay, underlayToWorld(underlay, { x: px, y: py }));
        expect(back.x).toBeCloseTo(px, 6);
        expect(back.y).toBeCloseTo(py, 6);
      },
    ),
    { numRuns: 200 },
  );
});
