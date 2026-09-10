import Decimal from "decimal.js";
import {
  quoteDefinitionSchema,
  type QuoteTotals,
} from "../../contracts/src/quotes";
// Isolated precision and rounding: no dependency on another module's Decimal config.
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function calculateQuote(input: unknown): QuoteTotals {
  const value = quoteDefinitionSchema.parse(input);
  const groups = new Map<string, { rate: string; net: Decimal }>();
  let net = new D(0),
    tax = new D(0);
  const lines = value.lines.map((line) => {
    const amount = new D(line.quantity)
      .mul(line.unitPrice)
      .mul(new D(1).minus(new D(line.discount).div(100)))
      .toDecimalPlaces(2);
    net = net.plus(amount);
    const group = groups.get(line.taxCategory) ?? {
      rate: line.taxRate,
      net: new D(0),
    };
    group.net = group.net.plus(amount);
    groups.set(line.taxCategory, group);
    return { id: line.id, net: amount.toFixed(2) };
  });
  const taxes = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, g]) => {
      const amount = g.net.mul(g.rate).div(100).toDecimalPlaces(2);
      tax = tax.plus(amount);
      return {
        category,
        rate: g.rate,
        net: g.net.toFixed(2),
        tax: amount.toFixed(2),
      };
    });
  return {
    lines,
    taxes,
    net: net.toFixed(2),
    tax: tax.toFixed(2),
    total: net.plus(tax).toFixed(2),
  };
}
