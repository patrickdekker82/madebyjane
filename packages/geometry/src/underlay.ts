import type { Point } from "../../contracts/src/index";

/**
 * Onderlegger: een ingemeten foto of scan van een bestaande plattegrond.
 *
 * De schaal wordt niet opgeslagen. Wat vastligt zijn twee punten in
 * afbeeldingspixels en de werkelijke afstand daartussen in millimeters; de
 * millimeters per pixel volgen daaruit. Zo blijft de kalibratie navolgbaar:
 * je ziet altijd welke twee punten en welke maat de gebruiker heeft opgegeven,
 * en niemand kan een schaal invullen die nergens op stoelt.
 *
 * Zonder kalibratie geldt een aangenomen schaal. Die is expliciet een
 * schatting; de interface hoort dat te melden en om correctie te vragen.
 */
export const ASSUMED_MM_PER_PIXEL = 10;

export type Calibration = {
  from: Point;
  to: Point;
  lengthMm: number;
};
export type UnderlayLike = {
  widthPx: number;
  heightPx: number;
  x: number;
  y: number;
  calibration: Calibration | null;
};

/** Millimeters per afbeeldingspixel. */
export function underlayScale(underlay: UnderlayLike): number {
  const c = underlay.calibration;
  if (!c) return ASSUMED_MM_PER_PIXEL;
  const pixels = Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y);
  if (!(pixels > 0) || !(c.lengthMm > 0))
    throw new Error("Een kalibratie heeft twee verschillende punten nodig.");
  return c.lengthMm / pixels;
}

/** Plaats en afmeting van de onderlegger in wereldmillimeters. */
export function underlayPlacement(underlay: UnderlayLike) {
  const scale = underlayScale(underlay);
  return {
    x: underlay.x,
    y: underlay.y,
    width: underlay.widthPx * scale,
    height: underlay.heightPx * scale,
    scale,
  };
}

/** Een punt op de afbeelding omrekenen naar wereldcoordinaten. */
export function underlayToWorld(underlay: UnderlayLike, pixel: Point): Point {
  const scale = underlayScale(underlay);
  return { x: underlay.x + pixel.x * scale, y: underlay.y + pixel.y * scale };
}

/** Een wereldpunt terugrekenen naar afbeeldingspixels. */
export function worldToUnderlay(underlay: UnderlayLike, point: Point): Point {
  const scale = underlayScale(underlay);
  return { x: (point.x - underlay.x) / scale, y: (point.y - underlay.y) / scale };
}
