import type { Point } from "../../contracts/src/index";

/**
 * Tekengegevens van een maatlijn.
 *
 * De lengte is afgeleid uit de twee punten en wordt nergens opgeslagen; een
 * maatlijn kan dus nooit iets anders beweren dan de geometrie zegt.
 *
 * `offset` verschuift de maatlijn loodrecht op de gemeten lijn, zodat hij naast
 * het object komt te liggen. De hulplijnen lopen van de gemeten punten naar de
 * verschoven maatlijn. Het label staat op het midden.
 *
 * De labelhoek blijft tussen -90 en 90 graden, zodat tekst nooit op zijn kop
 * staat. De lengte is afgerond op hele millimeters, gelijk aan de opslag.
 */
export type DimensionGeometry = {
  lengthMm: number;
  /** De maatlijn zelf, al verschoven. */
  line: { from: Point; to: Point };
  /** Hulplijnen van de gemeten punten naar de maatlijn. */
  extensions: { from: Point; to: Point }[];
  label: { x: number; y: number; angle: number };
};

export function dimensionGeometry(
  from: Point,
  to: Point,
  offset: number,
): DimensionGeometry {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  if (length === 0)
    throw new Error("Een maatlijn heeft twee verschillende punten nodig.");
  // Linkernormaal van de gemeten richting.
  const nx = -dy / length,
    ny = dx / length;
  const shift = (point: Point) => ({
    x: point.x + nx * offset,
    y: point.y + ny * offset,
  });
  const a = shift(from),
    b = shift(to);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return {
    lengthMm: Math.round(length),
    line: { from: a, to: b },
    extensions: [
      { from, to: a },
      { from: to, to: b },
    ],
    label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle },
  };
}

/** Nederlandse weergave van een maat in millimeters. */
export function formatMm(value: number) {
  return value.toLocaleString("nl-NL") + " mm";
}
