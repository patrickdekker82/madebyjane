import { test, expect } from "vitest";
import fc from "fast-check";
import {
  underlayScale,
  underlayPlacement,
  underlayToWorld,
  worldToUnderlay,
  underlayCorners,
  underlayCenter,
  rotateUnderlay,
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
    rotation: 0,
    scale: ASSUMED_MM_PER_PIXEL,
  });
});

test("de schaal volgt uit twee punten en de opgegeven afstand", () => {
  // 400 pixels staan voor 5.000 mm: 12,5 mm per pixel.
  const calibrated = {
    ...base,
    calibration: {
      from: { x: 100, y: 200 },
      to: { x: 500, y: 200 },
      lengthMm: 5000,
    },
  };
  expect(underlayScale(calibrated)).toBe(12.5);
  expect(underlayPlacement(calibrated).width).toBe(12500);
  // Ook schuin gemeten: 300-400-500.
  const diagonal = {
    ...base,
    calibration: {
      from: { x: 0, y: 0 },
      to: { x: 300, y: 400 },
      lengthMm: 2500,
    },
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
  expect(underlayToWorld(underlay, { x: 50, y: 30 })).toEqual({
    x: -1500,
    y: 1800,
  });
  expect(worldToUnderlay(underlay, { x: -1500, y: 1800 })).toEqual({
    x: 50,
    y: 30,
  });
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
      fc.integer({ min: -360, max: 360 }),
      (px, py, lengthMm, pixels, rotation) => {
        const underlay = {
          ...base,
          x: 1234,
          y: -567,
          rotation,
          calibration: {
            from: { x: 0, y: 0 },
            to: { x: pixels, y: 0 },
            lengthMm,
          },
        };
        const back = worldToUnderlay(
          underlay,
          underlayToWorld(underlay, { x: px, y: py }),
        );
        expect(back.x).toBeCloseTo(px, 6);
        expect(back.y).toBeCloseTo(py, 6);
      },
    ),
    { numRuns: 200 },
  );
});

const turned = {
  ...base,
  x: 1000,
  y: 500,
  rotation: 90,
  calibration: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, lengthMm: 1000 },
};

test("een gedraaide onderlegger rekent om de linkerbovenhoek", () => {
  // 10 mm per pixel; een kwartslag met de klok mee zet +x naar beneden.
  const point = underlayToWorld(turned, { x: 50, y: 30 });
  expect(point.x).toBeCloseTo(1000 - 300, 6);
  expect(point.y).toBeCloseTo(500 + 500, 6);
  const back = worldToUnderlay(turned, point);
  expect(back.x).toBeCloseTo(50, 6);
  expect(back.y).toBeCloseTo(30, 6);
});

test("de plaatsing draagt de draaiing mee naar de tekenlaag", () => {
  expect(underlayPlacement(turned).rotation).toBe(90);
  // Zonder veld blijft het nul: scenes van voor deze stap draaien niet mee.
  expect(underlayPlacement(base).rotation).toBe(0);
});

test("de vier hoeken volgen de draaiing", () => {
  const corners = underlayCorners(turned);
  expect(corners).toHaveLength(4);
  // Rechtsboven op de afbeelding ligt na een kwartslag recht onder de hoek.
  expect(corners[1]!.x).toBeCloseTo(1000, 6);
  expect(corners[1]!.y).toBeCloseTo(500 + 10000, 6);
  // Ongedraaid is het gewoon de rechthoek zelf.
  expect(underlayCorners(base)).toEqual([
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 8000 },
    { x: 0, y: 8000 },
  ]);
});

test("draaien houdt het midden op zijn plaats", () => {
  const before = underlayCenter(turned);
  const next = rotateUnderlay(turned, 180);
  const after = underlayCenter({ ...turned, ...next });
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(next.rotation).toBe(180);
  // De verschuiving blijft in hele millimeters.
  expect(Number.isInteger(next.x)).toBe(true);
  expect(Number.isInteger(next.y)).toBe(true);
});

test("draaien naar dezelfde hoek verplaatst niets", () => {
  expect(rotateUnderlay(turned, 90)).toEqual({ rotation: 90, x: 1000, y: 500 });
});
