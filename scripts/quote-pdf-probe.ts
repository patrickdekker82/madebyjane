import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { quoteHtml } from "../packages/documents/src/quote";
import { renderQuotePdf } from "../packages/documents/src/quote-pdf";
import { calculateQuote } from "../packages/domain/src/quote-calculation";
import { digest } from "../packages/domain/src/quote-resources";
import { demoScene } from "../packages/test-fixtures/src/index";
import { planSvg } from "../packages/documents/src/plan";
import type {
  QuoteRecord,
  QuoteDefinition,
} from "../packages/contracts/src/quotes";
await mkdir("outputs/qa", { recursive: true });
const definition: QuoteDefinition = {
  seller: "Studio Voorbeeld\nVoorbeeldstraat 12\n1000 AA Amsterdam",
  customer: "Familie Voorbeeld\nVoorbeeldlaan 8\n1000 BB Amsterdam",
  title: "Interieurvoorstel - woonkamer",
  date: "2026-09-10",
  validUntil: "2026-10-10",
  currency: "EUR",
  terms:
    "Levering en montage op afspraak.\nDeze demonstratie bevat uitsluitend fictieve gegevens.",
  lines: Array.from({ length: 40 }, (_, i) => ({
    id: randomUUID(),
    description: `POST-${String(i + 1).padStart(3, "0")} ${i % 3 === 0 ? "Eiken afwerking met lange omschrijving, zorgvuldig geselecteerd op kleur en materiaal. ".repeat(3) : "Interieuronderdeel volgens ontwerp"}`,
    quantity: i % 2 ? "2" : "1.25",
    unit: i % 2 ? "stuk" : "m²",
    unitPrice: i === 39 ? "-15" : "49.995",
    discount: i % 3 ? "0" : "10",
    taxCategory: i % 2 ? "Hoog" : "Laag",
    taxRate: i % 2 ? "21" : "9",
    source: null,
    priceNote: "Fictieve prijslijst",
  })),
};
const scene = demoScene(randomUUID(), randomUUID(), randomUUID(), randomUUID());
const frozen = {
  attachments: [
    {
      id: randomUUID(),
      kind: "plan" as const,
      title: "Woonkamer op schaal 1:50",
      html: planSvg(scene, 50),
      hash: digest(scene),
    },
  ],
};
const q: QuoteRecord = {
  id: randomUUID(),
  version: 2,
  number: "2026-DEMO",
  created_at: new Date().toISOString(),
  definition,
  totals: calculateQuote(definition),
  frozen,
};
q.content_hash = digest({
  number: q.number,
  definition,
  totals: q.totals,
  frozen,
});
const start = performance.now(),
  pdf = await renderQuotePdf(quoteHtml(q));
await writeFile("outputs/qa/offerte-demo.pdf", pdf);
await writeFile(
  "work/quote-pdf-expected.json",
  JSON.stringify({
    total: q.totals.total,
    rows: 40,
    referenceMm: 100,
    elapsedMs: Math.round(performance.now() - start),
    sha256: digest(pdf.toString("base64")),
  }),
);
console.log(
  `Offerteproef: 40 posten, totaal ${q.totals.total} EUR, ${Math.round(performance.now() - start)} ms.`,
);
