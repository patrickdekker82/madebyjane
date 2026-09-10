import Decimal from "decimal.js";

/**
 * Indicatiebedrag van een materiaalkeuze: hoeveelheid x eenheidsprijs.
 *
 * Bewust apart van de latere offertemodule. Dit bedrag wordt nergens opgeslagen
 * en is geen offerteregel: er zit geen korting, belastingcategorie of
 * prijsbevriezing in. Afronding is half naar boven op hele centen; invoer met
 * meer decimalen wordt niet stilzwijgend afgekapt maar meegerekend en pas op
 * het eindbedrag afgerond.
 */
export function estimatedAmount(
  quantity: string | null,
  unitPrice: string | null,
): string | null {
  if (quantity === null || unitPrice === null) return null;
  const amount = new Decimal(quantity).mul(unitPrice);
  if (!amount.isFinite()) return null;
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
