import type { LedPath } from "../../contracts/src/index";

type Point = { x: number; y: number };

/**
 * LED-strips meten.
 *
 * De lengte wordt nergens opgeslagen. Hij volgt uit de hoekpunten, precies
 * zoals de lengte van een maatlijn uit haar twee punten volgt. Zo kan een
 * strip op de tekening nooit iets anders zijn dan wat er in de hoeveelheden
 * staat, ook niet nadat iemand een hoekpunt heeft verschoven.
 *
 * Alles rekent in millimeters. De uitkomst is een gewoon kommagetal, want de
 * som van schuine stukken is dat nu eenmaal; afronden gebeurt pas waar de
 * hoeveelheid wordt vastgesteld, met hetzelfde beleid als de andere maten.
 */
export function ledLengthMm(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
  return total;
}

/** De losse rechte stukken, voor tekenen en voor een stuklijst per segment. */
export function ledSegments(points: readonly Point[]) {
  const segments: { from: Point; to: Point; lengthMm: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!,
      to = points[i]!;
    segments.push({
      from,
      to,
      lengthMm: Math.hypot(to.x - from.x, to.y - from.y),
    });
  }
  return segments;
}

/**
 * Hoeken waar de strip werkelijk van richting verandert. Een punt dat precies
 * op de lijn tussen zijn buren ligt buigt niets en telt dus niet mee: anders
 * zou een extra sleeppunt een hoekprofiel op de stuklijst zetten dat niemand
 * nodig heeft. De drempel is een halve graad, ruim onder wat op papier zichtbaar is.
 */
export function ledCornerCount(points: readonly Point[]): number {
  let corners = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      c = points[i + 1]!;
    const inX = b.x - a.x,
      inY = b.y - a.y,
      outX = c.x - b.x,
      outY = c.y - b.y;
    const inLength = Math.hypot(inX, inY),
      outLength = Math.hypot(outX, outY);
    if (inLength === 0 || outLength === 0) continue;
    const cross = (inX * outY - inY * outX) / (inLength * outLength);
    const dot = (inX * outX + inY * outY) / (inLength * outLength);
    if (Math.abs(Math.atan2(cross, dot)) > (0.5 * Math.PI) / 180) corners++;
  }
  return corners;
}

/**
 * Het omhullende vierkant van een strip, zodat "passend in beeld" en het
 * planblad hem meenemen.
 */
export function ledBounds(path: Pick<LedPath, "points">) {
  const xs = path.points.map((p) => p.x),
    ys = path.points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
