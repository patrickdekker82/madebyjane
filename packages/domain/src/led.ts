import Decimal from "decimal.js";
import type { LedPath } from "../../contracts/src/index";
import { ledCornerCount, ledLengthMm } from "../../geometry/src/led";

/**
 * Van een getekende strip naar iets bestelbaars.
 *
 * Afrondingsbeleid, gelijk aan dat van de vloer- en plinthoeveelheden omdat het
 * in dezelfde offerte terechtkomt: meters op drie decimalen, half naar boven.
 *
 * Vermogen is een expliciete vermenigvuldiging en geen schatting: vermogen =
 * lengte in meters x vermogen per meter. Er wordt hier niets omgerekend tussen
 * watt, lumen, candela en lux; dat zijn verschillende grootheden en de app doet
 * niet alsof zij uit elkaar volgen.
 *
 * De bestel- of kniplengte is een keuze van de gebruiker en staat daarom apart.
 * Hij wordt nooit stilzwijgend gelijkgetrokken met de gemeten lengte; het
 * verschil is juist wat iemand wil zien voordat hij bestelt.
 */
export type LedQuantity = {
  /** Gemeten lengte, afgeleid uit de hoekpunten. */
  lengthM: string;
  /** Hoeken waar de strip van richting verandert. */
  corners: number;
  /** Vermogen bij de gemeten lengte, in watt. */
  powerW: string;
  /** De gekozen bestel- of kniplengte, of null zolang die niet gekozen is. */
  orderLengthM: string | null;
  /** Bestel- min gemeten lengte; negatief betekent te kort besteld. */
  orderDifferenceM: string | null;
};

export function ledQuantity(path: LedPath): LedQuantity {
  const lengthM = new Decimal(ledLengthMm(path.points))
    .div(1000)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const powerW = lengthM
    .mul(path.wattPerMeterMw)
    .div(1000)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const orderLengthM =
    path.orderLengthMm === null
      ? null
      : new Decimal(path.orderLengthMm)
          .div(1000)
          .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  return {
    lengthM: lengthM.toFixed(3),
    corners: ledCornerCount(path.points),
    powerW: powerW.toFixed(3),
    orderLengthM: orderLengthM ? orderLengthM.toFixed(3) : null,
    orderDifferenceM: orderLengthM
      ? orderLengthM.minus(lengthM).toFixed(3)
      : null,
  };
}

/** Alles bij elkaar, voor een lichtplan of een offerteregel per project. */
export function ledTotals(paths: readonly LedPath[]) {
  let length = new Decimal(0),
    power = new Decimal(0),
    corners = 0;
  for (const path of paths) {
    const q = ledQuantity(path);
    length = length.plus(q.lengthM);
    power = power.plus(q.powerW);
    corners += q.corners;
  }
  return {
    count: paths.length,
    lengthM: length.toFixed(3),
    powerW: power.toFixed(3),
    corners,
  };
}
