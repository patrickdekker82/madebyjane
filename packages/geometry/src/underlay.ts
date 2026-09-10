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
  /** Linkerbovenhoek in wereldmillimeters; ook het draaipunt. */
  x: number;
  y: number;
  /** Graden met de klok mee. Ontbreekt in scenes van voor deze stap. */
  rotation?: number;
  calibration: Calibration | null;
};

function radians(underlay: UnderlayLike) {
  return ((underlay.rotation ?? 0) * Math.PI) / 180;
}

/** Millimeters per afbeeldingspixel. */
export function underlayScale(underlay: UnderlayLike): number {
  const c = underlay.calibration;
  if (!c) return ASSUMED_MM_PER_PIXEL;
  const pixels = Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y);
  if (!(pixels > 0) || !(c.lengthMm > 0))
    throw new Error("Een kalibratie heeft twee verschillende punten nodig.");
  return c.lengthMm / pixels;
}

/**
 * Plaats en afmeting van de onderlegger in wereldmillimeters. De draaiing gaat
 * om de linkerbovenhoek, precies zoals de tekenlaag een afbeelding om haar
 * eigen oorsprong draait; model en tekening kunnen zo niet uit elkaar lopen.
 */
export function underlayPlacement(underlay: UnderlayLike) {
  const scale = underlayScale(underlay);
  return {
    x: underlay.x,
    y: underlay.y,
    width: underlay.widthPx * scale,
    height: underlay.heightPx * scale,
    rotation: underlay.rotation ?? 0,
    scale,
  };
}

/** Een punt op de afbeelding omrekenen naar wereldcoordinaten. */
export function underlayToWorld(underlay: UnderlayLike, pixel: Point): Point {
  const scale = underlayScale(underlay);
  const a = radians(underlay),
    cos = Math.cos(a),
    sin = Math.sin(a);
  const dx = pixel.x * scale,
    dy = pixel.y * scale;
  return {
    x: underlay.x + dx * cos - dy * sin,
    y: underlay.y + dx * sin + dy * cos,
  };
}

/** Een wereldpunt terugrekenen naar afbeeldingspixels. */
export function worldToUnderlay(underlay: UnderlayLike, point: Point): Point {
  const scale = underlayScale(underlay);
  const a = radians(underlay),
    cos = Math.cos(a),
    sin = Math.sin(a);
  const dx = point.x - underlay.x,
    dy = point.y - underlay.y;
  return {
    x: (dx * cos + dy * sin) / scale,
    y: (-dx * sin + dy * cos) / scale,
  };
}

/** De vier hoeken in wereldmillimeters; bij een draaiing is dat geen rechthoek meer. */
export function underlayCorners(underlay: UnderlayLike): Point[] {
  return [
    { x: 0, y: 0 },
    { x: underlay.widthPx, y: 0 },
    { x: underlay.widthPx, y: underlay.heightPx },
    { x: 0, y: underlay.heightPx },
  ].map((pixel) => underlayToWorld(underlay, pixel));
}

/** Het middelpunt van de afbeelding in wereldmillimeters. */
export function underlayCenter(underlay: UnderlayLike): Point {
  return underlayToWorld(underlay, {
    x: underlay.widthPx / 2,
    y: underlay.heightPx / 2,
  });
}

/**
 * Draaien om het midden in plaats van om de hoek. De hoek blijft het draaipunt
 * van het model; de verschuiving die daarbij hoort wordt hier meteen verrekend,
 * zodat de afbeelding onder de cursor blijft liggen in plaats van weg te
 * zwaaien. Millimeters blijven geheel.
 */
export function rotateUnderlay(underlay: UnderlayLike, rotation: number) {
  const before = underlayCenter(underlay);
  const after = underlayCenter({ ...underlay, rotation });
  return {
    rotation,
    x: Math.round(underlay.x + before.x - after.x),
    y: Math.round(underlay.y + before.y - after.y),
  };
}
