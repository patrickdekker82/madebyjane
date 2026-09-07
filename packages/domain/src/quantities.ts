import Decimal from "decimal.js";
import type { RoomQuantities } from "../../geometry/src/quantities";
import type { QuantityRequest } from "../../contracts/src/materials";

/**
 * Van geometrie naar bestelbare hoeveelheid, met decimalrekenwerk.
 *
 * Afrondingsbeleid, vastgelegd omdat het in offertes doorwerkt:
 * - netto = bronmaat gedeeld door 1.000 (mm naar m) of 1.000.000 (mm² naar m²),
 *   afgerond op drie decimalen, half naar boven.
 * - snijverlies = netto x percentage / 100, eveneens drie decimalen.
 * - bruto = netto + snijverlies, exact opgeteld.
 * - bestelhoeveelheid = bruto naar boven afgerond op de bestelstap. Zonder
 *   bestelstap is de bestelhoeveelheid gelijk aan bruto.
 */
export const quantityBases = {
  floor_area: { source: "netFloorAreaMm2", unit: "m²", divisor: 1_000_000 },
  wall_area: { source: "wallAreaMm2", unit: "m²", divisor: 1_000_000 },
  perimeter: { source: "netPerimeterMm", unit: "m", divisor: 1_000 },
  plinth: { source: "plinthLengthMm", unit: "m", divisor: 1_000 },
} as const satisfies Record<
  QuantityRequest["basis"],
  { source: keyof RoomQuantities; unit: "m²" | "m"; divisor: number }
>;

export type ComputedQuantity = {
  unit: "m²" | "m";
  netQuantity: string;
  wasteQuantity: string;
  grossQuantity: string;
  orderQuantity: string;
};

export function computeQuantity(
  room: RoomQuantities,
  basis: QuantityRequest["basis"],
  wastePercent: string,
  orderStep: string | null,
): ComputedQuantity {
  const base = quantityBases[basis];
  const raw = room[base.source];
  if (typeof raw !== "number" || !Number.isFinite(raw))
    throw new Error("Deze ruimte levert geen bruikbare bronmaat.");
  const net = new Decimal(raw)
    .div(base.divisor)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const waste = net
    .mul(wastePercent)
    .div(100)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const gross = net.plus(waste);
  const step = orderStep === null ? null : new Decimal(orderStep);
  const order =
    step && step.gt(0)
      ? gross
          .div(step)
          .toDecimalPlaces(0, Decimal.ROUND_CEIL)
          .mul(step)
          .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
      : gross;
  return {
    unit: base.unit,
    netQuantity: net.toFixed(),
    wasteQuantity: waste.toFixed(),
    grossQuantity: gross.toFixed(),
    orderQuantity: order.toFixed(),
  };
}
