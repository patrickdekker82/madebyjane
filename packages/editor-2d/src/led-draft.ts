import type { LedPath } from "../../contracts/src/index";

/**
 * De beginwaarden van een nieuwe strip: een gangbare opbouwstrip van 9,6 W/m op
 * 2.400 mm, naar beneden schijnend en warmwit. Alles is daarna aan te passen;
 * dit voorkomt alleen dat iemand eerst tien velden moet invullen voordat er iets
 * op de tekening staat. Ze zijn nadrukkelijk geen advies over wat er hoort te
 * hangen.
 */
export function newLedPath(
  points: readonly { x: number; y: number }[],
  id = crypto.randomUUID(),
): LedPath {
  return {
    id,
    name: "LED-strip",
    points: points.map((p) => ({ x: p.x, y: p.y })),
    heightMm: 2400,
    profile: "surface",
    direction: "down",
    color: "#ffce8a",
    colorTemperatureK: 2700,
    wattPerMeterMw: 9600,
    connection: "",
    note: "",
    orderLengthMm: null,
  };
}
