import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { presentationHtml } from "../packages/documents/src/presentation";
import {
  presentationPptx,
  pptxWarnings,
} from "../packages/documents/src/presentation-pptx";
import { renderSvgPng } from "../packages/documents/src/raster";
import { renderQuotePdf } from "../packages/documents/src/quote-pdf";
import {
  defaultPresentation,
  presentationHash,
  resolveContent,
} from "../packages/domain/src/presentation";
import { applyOperations } from "../packages/domain/src/index";
import { newFixtureItem } from "../packages/editor-2d/src/fixture-draft";
import { newLedPath } from "../packages/editor-2d/src/led-draft";
import { demoScene } from "../packages/test-fixtures/src/index";
import { presentationSchema } from "../packages/contracts/src/presentations";

await mkdir("outputs/qa", { recursive: true });
const variantId = randomUUID();
const base = demoScene(randomUUID(), randomUUID(), variantId, randomUUID());
const scene = applyOperations(base, [
  { type: "PlaceItem", item: newFixtureItem("spot", 2000, 1500) },
  { type: "PlaceItem", item: newFixtureItem("socket", 800, 3800) },
  {
    type: "AddLedPath",
    path: newLedPath([
      { x: 700, y: 700 },
      { x: 3200, y: 700 },
      { x: 3200, y: 1600 },
    ]),
  },
]);
const document = presentationSchema.parse({
  ...defaultPresentation("extended", {
    title: "Interieurvoorstel woonkamer",
    customer: "Familie Voorbeeld",
    date: "2026-09-10",
    companyName: "Studio Voorbeeld",
    variantId,
  }),
});
// Wat teksten invullen, zodat het blad er niet leeg uitziet.
for (const block of document.blocks) {
  if (block.type === "text")
    block.body =
      "Een rustige basis van natuurlijke materialen, met warm licht langs de keukenlijst.\n\nDeze demonstratie bevat uitsluitend fictieve gegevens.";
  if (block.type === "closing")
    block.body = "Graag horen we wat je ervan vindt.";
}
document.branding.contact =
  "Studio Voorbeeld\nVoorbeeldstraat 12\n1000 AA Amsterdam";

const content = resolveContent(document, {
  scenes: { [variantId]: scene },
  materials: [
    {
      entryId: randomUUID(),
      version: 2,
      definition: {
        name: "Eiken visgraat",
        category: "Vloer",
        room: "Woonkamer",
        supplier: "Voorbeeld Hout",
        unit: "m²",
        quantity: "31.240",
        status: "chosen",
      } as never,
    },
    {
      entryId: randomUUID(),
      version: 1,
      definition: {
        name: "Kalkverf zandwit",
        category: "Wandafwerking",
        room: "Woonkamer",
        supplier: "Voorbeeld Verf",
        unit: "liter",
        quantity: "14.000",
        status: "sample_requested",
      } as never,
    },
  ],
  quotes: {},
  images: {},
  logo: null,
  date: document.date,
});
const html = presentationHtml(document, content);
await writeFile("work/presentation.html", html);
const start = performance.now();
const pdf = await renderQuotePdf(html);
await writeFile("outputs/qa/presentatie-demo.pdf", pdf);
await writeFile(
  "work/presentation-expected.json",
  JSON.stringify(
    {
      hash: presentationHash(document, content),
      planBlocks: content.blocks.filter((b) => b.type === "plan").length,
      referenceMm: 100,
      elapsedMs: Math.round(performance.now() - start),
    },
    null,
    2,
  ),
);

// Dezelfde presentatie als PowerPoint. Planbladen kunnen niet als vector mee,
// dus die worden hier eenmalig naar afbeelding gezet.
const sheets: Record<string, Buffer> = {};
for (const block of content.blocks)
  if (block.type === "plan" && block.svg)
    sheets[block.blockId] = await renderSvgPng(
      block.svg,
      block.widthMm,
      block.heightMm,
    );
const warnings = pptxWarnings(document, content);
const pptx = await presentationPptx(document, content, sheets);
await writeFile("outputs/qa/presentatie-demo.pptx", pptx);
await writeFile(
  "work/presentation-pptx-expected.json",
  JSON.stringify(
    {
      slides: document.blocks.length + 1,
      sheets: Object.keys(sheets).length,
      warnings,
    },
    null,
    2,
  ),
);
console.log(
  `Presentatieproef: ${document.blocks.length} blokken, ${pdf.length} bytes PDF, ${pptx.length} bytes PPTX, ${warnings.length} waarschuwingen, ${Math.round(performance.now() - start)} ms.`,
);
