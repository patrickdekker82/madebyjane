import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  presentationSchema,
  sheetSize,
  presentationTemplateVersion,
  type PresentationTemplate,
} from "../packages/contracts/src/presentations";
import {
  defaultBlocks,
  defaultPresentation,
  presentationHash,
  resolveContent,
} from "../packages/domain/src/presentation";
import { presentationHtml } from "../packages/documents/src/presentation";
import {
  limits,
  pptxWarnings,
  slide,
} from "../packages/documents/src/presentation-pptx";
import { planSvg } from "../packages/documents/src/plan";
import { applyOperations } from "../packages/domain/src/index";
import { newFixtureItem } from "../packages/editor-2d/src/fixture-draft";
import { newLedPath } from "../packages/editor-2d/src/led-draft";
import { demoScene } from "../packages/test-fixtures/src/index";

const variantId = randomUUID();
const scene = applyOperations(
  demoScene(randomUUID(), randomUUID(), variantId, randomUUID()),
  [
    { type: "PlaceItem", item: newFixtureItem("spot", 2000, 1500) },
    {
      type: "AddLedPath",
      path: newLedPath([
        { x: 700, y: 700 },
        { x: 3200, y: 700 },
      ]),
    },
  ],
);
const document = (template: PresentationTemplate = "extended") =>
  presentationSchema.parse(
    defaultPresentation(template, {
      title: "Interieurvoorstel",
      customer: "Familie Voorbeeld",
      date: "2026-09-10",
      companyName: "Studio Voorbeeld",
      variantId,
    }),
  );
const input = {
  scenes: { [variantId]: scene },
  materials: [
    {
      entryId: randomUUID(),
      version: 3,
      definition: {
        name: "Eiken visgraat",
        category: "Vloer",
        room: "Woonkamer",
        supplier: "Voorbeeld Hout",
        unit: "m²",
        quantity: "31.240",
        status: "chosen",
      },
    },
    {
      entryId: randomUUID(),
      version: 1,
      definition: {
        name: "Kalkverf",
        category: "Wand",
        room: "Slaapkamer",
        supplier: "",
        unit: "liter",
        quantity: null,
        status: "undecided",
      },
    },
  ] as never,
  quotes: {},
  images: {},
  logo: null,
  date: "2026-09-10",
};

test("papiermaat volgt de richting", () => {
  expect(sheetSize("A4", "portrait")).toEqual({ width: 210, height: 297 });
  expect(sheetSize("A4", "landscape")).toEqual({ width: 297, height: 210 });
  expect(sheetSize("A3", "portrait")).toEqual({ width: 297, height: 420 });
  expect(sheetSize("A3", "landscape")).toEqual({ width: 420, height: 297 });
});

test("de drie sjablonen tonen verschillende dingen", () => {
  const types = (t: PresentationTemplate) =>
    defaultBlocks(t, variantId).map((b) => b.type);
  // Een compact voorstel is een korte pitch.
  expect(types("compact")).toEqual([
    "cover",
    "text",
    "plan",
    "materials",
    "closing",
  ]);
  // Het uitgebreide plan neemt de klant mee door het hele ontwerp.
  expect(types("extended")).toContain("moodboard");
  expect(types("extended")).toContain("lighting");
  // Het technische pakket is voor de uitvoerder: geen verkooptekst.
  expect(types("technical")).not.toContain("text");
  expect(types("technical")).not.toContain("closing");
  expect(types("technical").filter((t) => t === "plan")).toHaveLength(2);
});

test("elke presentatie is geldig volgens het schema", () => {
  for (const template of ["compact", "extended", "technical"] as const)
    expect(() => document(template)).not.toThrow();
});

test("een tweede omslag wordt geweigerd", () => {
  const doc = document();
  expect(() =>
    presentationSchema.parse({
      ...doc,
      blocks: [...doc.blocks, { ...doc.blocks[0]!, id: randomUUID() }],
    }),
  ).toThrow(/omslag/);
});

test("het planblad wordt vastgelegd met zijn bronrevisie en maat", () => {
  const content = resolveContent(document(), input);
  const plan = content.blocks.find((b) => b.type === "plan")!;
  if (plan.type !== "plan") throw new Error("planblok verwacht");
  expect(plan.revision).toBe(scene.revision);
  expect(plan.widthMm).toBe(297);
  expect(plan.heightMm).toBe(210);
  expect(plan.svg).toContain('width="297mm"');
  // De bron staat in het colofon, precies een keer per ontwerp.
  expect(
    content.sources.filter((s) => s.kind === "variant" && s.id === variantId),
  ).toHaveLength(1);
});

test("een blok zonder gegevens levert geen inhoud in plaats van verzonnen inhoud", () => {
  const content = resolveContent(document(), { ...input, scenes: {} });
  expect(content.blocks.some((b) => b.type === "plan")).toBe(false);
  expect(content.blocks.some((b) => b.type === "lighting")).toBe(false);
  // Het document meldt dat zelf, in plaats van het blok weg te laten.
  const html = presentationHtml(document(), content);
  expect(html).toContain("nog niet vastgelegd");
});

test("de materiaalstaat filtert op ruimte wanneer die is opgegeven", () => {
  const doc = document();
  const all = resolveContent(doc, input).blocks.find(
    (b) => b.type === "materials",
  );
  if (all?.type !== "materials") throw new Error("materiaalblok verwacht");
  expect(all.rows).toHaveLength(2);
  const one = resolveContent(
    {
      ...doc,
      blocks: doc.blocks.map((b) =>
        b.type === "materials" ? { ...b, rooms: ["Woonkamer"] } : b,
      ),
    },
    input,
  ).blocks.find((b) => b.type === "materials");
  if (one?.type !== "materials") throw new Error("materiaalblok verwacht");
  expect(one.rows.map((r) => r.name)).toEqual(["Eiken visgraat"]);
  // De status staat er in gewone woorden, niet als sleutel.
  expect(one.rows[0]!.status).toBe("Gekozen");
});

test("de productlijst laat armaturen en verborgen objecten weg", () => {
  const content = resolveContent(document(), input);
  const products = content.blocks.find((b) => b.type === "products");
  if (products?.type !== "products") throw new Error("productblok verwacht");
  expect(products.rows.map((r) => r.name)).not.toContain("Inbouwspot");
  expect(products.rows.length).toBe(
    scene.items.filter((i) => !i.fixture && !i.hidden).length,
  );
});

test("het lichtplan neemt groepen, scenes en LED-strips mee", () => {
  const content = resolveContent(document(), input);
  const lighting = content.blocks.find((b) => b.type === "lighting");
  if (lighting?.type !== "lighting") throw new Error("lichtblok verwacht");
  expect(lighting.circuits[0]!.power).toBe("niet opgegeven");
  expect(lighting.led.count).toBe(1);
  expect(lighting.led.lengthM).toBe("2.500");
});

test("de inhoudshash verandert bij ander ontwerp en bij andere inhoud", () => {
  const doc = document();
  const content = resolveContent(doc, input);
  const base = presentationHash(doc, content);
  expect(presentationHash(doc, content)).toBe(base);
  expect(presentationHash({ ...doc, title: "Anders" }, content)).not.toBe(base);
  expect(presentationHash(doc, { ...content, sources: [] })).not.toBe(base);
});

test("het document gebruikt een eigen paginastijl per papiermaat", () => {
  const doc = document("technical");
  const html = presentationHtml(doc, resolveContent(doc, input));
  // Twee A3-planbladen liggend: een benoemde pagina, niet twee.
  expect(html.match(/@page sheet_a3_landscape\{/g)).toHaveLength(1);
  expect(html).toContain("size:420mm 297mm;margin:0");
  // Tekstpagina's noemen hun eigen pagina, anders erven ze de vorige.
  expect(html).toContain(".cover,.block,.colophon{page:doc}");
  // Een planblad hoort een blok te zijn en geen regel tekst.
  expect(html).toContain("svg{display:block}");
});

test("alleen het technische pakket toont het colofon met bronrevisies", () => {
  const technical = document("technical");
  expect(
    presentationHtml(technical, resolveContent(technical, input)),
  ).toContain("Colofon");
  const compact = document("compact");
  const html = presentationHtml(compact, resolveContent(compact, input));
  expect(html).not.toContain("Colofon");
  // De sjabloonversie hoort wel altijd in de hash te zitten.
  expect(presentationTemplateVersion).toBe("presentation-1");
});

test("het planblad klopt op A3 staand net zo goed als op A4 liggend", () => {
  const svg = planSvg(scene, 50, { paper: "A3", orientation: "portrait" });
  expect(svg).toContain('width="297mm" height="420mm"');
  const reference =
    /id="scale-reference-5000mm" x1="([\d.]+)"[^/]*x2="([\d.]+)"/.exec(svg)!;
  // Een lijn van 5.000 mm is bij 1:50 precies 100 mm, ongeacht het papier.
  expect(Number(reference[2]) - Number(reference[1])).toBeCloseTo(100, 6);
  expect(svg).toContain("A3 staand");
});

test("een plan dat niet past levert een fout op in plaats van stiekem kleiner", () => {
  // 1:20 op A4 is te krap voor deze woonkamer; het blad zegt welk papier het was.
  expect(() => planSvg(scene, 20, { paper: "A4" })).toThrow(
    /A4 liggend bij 1:20/,
  );
  expect(() => planSvg(scene, 20, { paper: "A3" })).toThrow(
    /A3 liggend bij 1:20/,
  );
  // Op 1:50 past dezelfde tekening wel.
  expect(() => planSvg(scene, 50, { paper: "A4" })).not.toThrow();
});

test("een presentatie gaat door wanneer een blad niet past, met de reden erbij", () => {
  const doc = document();
  const tooTight = {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "plan" ? { ...b, scale: 20 as const } : b,
    ),
  };
  const content = resolveContent(tooTight, input);
  const plan = content.blocks.find((b) => b.type === "plan");
  if (plan?.type !== "plan") throw new Error("planblok verwacht");
  expect(plan.svg).toBe("");
  expect(plan.problem).toMatch(/past niet/);
  // Het document zegt het, in plaats van stil een kleinere tekening te tonen.
  const html = presentationHtml(tooTight, content);
  expect(html).toContain("past niet");
  expect(html).not.toContain("<svg");
});

test("de datum staat in het titelblok", () => {
  expect(planSvg(scene, 50, { date: "2026-09-10" })).toContain("2026-09-10");
  expect(planSvg(scene, 50)).toContain("Print op 100%");
});

test("de PowerPoint meldt wat er niet op een dia past", () => {
  const doc = document();
  const content = resolveContent(doc, input);
  // Zoals het is levert het alleen een melding over het lege moodboard.
  expect(pptxWarnings(doc, content).map((w) => w.message)).toEqual([
    "Voor dit blok is niets vastgelegd; de dia blijft leeg.",
  ]);
  const long = {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "text"
        ? { ...b, heading: "x".repeat(80), body: "y".repeat(1000) }
        : b,
    ),
  };
  const messages = pptxWarnings(long, resolveContent(long, input)).map(
    (w) => w.message,
  );
  // De tekst wordt niet stilzwijgend afgekapt; er komt een melding.
  expect(messages.some((m) => m.includes("kop is te lang"))).toBe(true);
  expect(messages.some((m) => m.includes("past niet op één dia"))).toBe(true);
});

test("een lange tabel meldt dat de rest in de PDF staat", () => {
  const doc = document();
  const content = resolveContent(doc, input);
  const many = {
    ...content,
    blocks: content.blocks.map((b) =>
      b.type === "materials"
        ? {
            ...b,
            rows: Array.from({ length: 20 }, () => b.rows[0]!),
          }
        : b,
    ),
  };
  const message = pptxWarnings(doc, many).find((w) =>
    w.message.includes("regels"),
  )!;
  expect(message.message).toContain(`er passen er ${limits.tableRows}`);
  expect(message.message).toContain("De rest staat wel in de PDF");
});

test("het diaformaat is 16:9 en verandert niet stilletjes", () => {
  // Tien bij 5,625 inch is wat PowerPoint standaard opent.
  expect(slide).toEqual({ width: 10, height: 5.625 });
  expect(slide.width / slide.height).toBeCloseTo(16 / 9, 6);
});

test("de webviewer toont hetzelfde document als de PDF", () => {
  const doc = document("technical");
  const content = resolveContent(doc, input);
  const paper = presentationHtml(doc, content);
  const viewer = presentationHtml(doc, content, {
    pdfHref: "/api/v1/presentation-shares/x/y",
    subtitle: "Versie 4",
  });
  // De inhoud is letterlijk dezelfde; de viewer zet er alleen een balk voor.
  const body = paper.slice(
    paper.indexOf("<body>") + 6,
    paper.indexOf("</body>"),
  );
  expect(body.length).toBeGreaterThan(1000);
  expect(viewer).toContain(body);
  expect(viewer).toContain("Versie 4");
  expect(viewer).toContain('href="/api/v1/presentation-shares/x/y"');
  // Het scherm is geen papier, en dat staat er ook bij.
  expect(viewer).toContain("Alleen de PDF is maatvast");
  expect(viewer).toContain("@media screen{");
  expect(viewer).toContain("@media print{.viewer-bar{display:none}}");
});

test("de PDF-uitvoer krijgt geen schermstijl of knoppen", () => {
  const doc = document();
  const html = presentationHtml(doc, resolveContent(doc, input));
  expect(html).not.toContain("@media screen");
  expect(html).not.toContain("viewer-bar");
  expect(html).not.toContain("PDF downloaden");
});

test("de viewer laadt niets van buiten", () => {
  const doc = document();
  const viewer = presentationHtml(doc, resolveContent(doc, input), {
    pdfHref: "/pdf",
  });
  expect(viewer).toContain(
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  );
  expect(viewer).not.toContain("<script");
  expect(viewer).not.toMatch(/src="https?:/);
});
