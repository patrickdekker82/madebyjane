import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { calculateQuote } from "../packages/domain/src/quote-calculation";
import { quoteDefinitionSchema } from "../packages/contracts/src/quotes";
const line = () => ({
  id: randomUUID(),
  description: "Vloer",
  unit: "m²",
  quantity: "2.5",
  unitPrice: "19.995",
  discount: "10",
  taxCategory: "Hoog",
  taxRate: "21",
  source: null,
  priceNote: "Leverancier 8 september",
});
const definition = () => ({
  customer: "Fictieve klant",
  title: "Offerte",
  date: "2026-09-08",
  validUntil: "2026-10-08",
  currency: "EUR",
  terms: "",
  lines: [line()],
});
test("decimalen, korting, negatieve correctie en verschillende belastingcategorieën", () => {
  const d = definition();
  d.lines.push(
    { ...line(), quantity: "1", unitPrice: "-5", discount: "0" },
    {
      ...line(),
      quantity: "3",
      unitPrice: "10",
      discount: "0",
      taxCategory: "Laag",
      taxRate: "9",
    },
  );
  const r = calculateQuote(d);
  expect(r.lines.map((l) => l.net)).toEqual(["44.99", "-5.00", "30.00"]);
  expect(r).toMatchObject({ net: "69.99", tax: "11.10", total: "81.09" });
});
test("belasting wordt over afgeronde regels per categorie berekend", () => {
  const d = definition();
  d.lines = Array.from({ length: 3 }, () => ({
    ...line(),
    quantity: "1",
    unitPrice: "0.03",
    discount: "0",
  }));
  expect(calculateQuote(d)).toMatchObject({
    net: "0.09",
    tax: "0.02",
    total: "0.11",
  });
  d.lines = [{ ...line(), quantity: "1", unitPrice: "-0.005", discount: "0" }];
  expect(calculateQuote(d).net).toBe("-0.01");
});
test("lege concepten, hoge waarden, volledige korting en ongeldige invoer", () => {
  expect(calculateQuote({ ...definition(), lines: [] })).toMatchObject({
    total: "0.00",
  });
  const d = definition();
  d.lines = [
    {
      ...line(),
      quantity: "9999999.999",
      unitPrice: "9999999.9999",
      discount: "0",
    },
  ];
  expect(calculateQuote(d).net).toBe("99999999989000.00");
  d.lines[0]!.discount = "100";
  expect(calculateQuote(d).total).toBe("0.00");
  for (const quantity of ["-1", "1e3", "1,5", "NaN", "10000000", "1.0001"])
    expect(
      quoteDefinitionSchema.safeParse({
        ...definition(),
        lines: [{ ...line(), quantity }],
      }).success,
    ).toBe(false);
  expect(
    quoteDefinitionSchema.safeParse({ ...definition(), date: "2026-02-30" })
      .success,
  ).toBe(false);
  expect(
    quoteDefinitionSchema.safeParse({
      ...definition(),
      validUntil: "2026-01-01",
    }).success,
  ).toBe(false);
});
test("dubbele bronnen en verschillende tarieven onder dezelfde categorie afgewezen", () => {
  const source = { entryId: randomUUID(), versionId: randomUUID() };
  expect(
    quoteDefinitionSchema.safeParse({
      ...definition(),
      lines: [
        { ...line(), source },
        { ...line(), source },
      ],
    }).success,
  ).toBe(false);
  expect(
    quoteDefinitionSchema.safeParse({
      ...definition(),
      lines: [line(), { ...line(), taxRate: "9" }],
    }).success,
  ).toBe(false);
});
