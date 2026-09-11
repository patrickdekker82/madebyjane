import { createHash } from "node:crypto";
import {
  presentationTemplateVersion,
  type Branding,
  type Presentation,
  type PresentationBlock,
  type PresentationContent,
  type PresentationTemplate,
  type ResolvedBlock,
} from "../../contracts/src/presentations";
import type { Scene } from "../../contracts/src/index";
import type { MaterialDefinition } from "../../contracts/src/materials";
import type { QuoteRecord } from "../../contracts/src/quotes";
import { planSvg } from "../../documents/src/plan";
import { circuits, lightScenes } from "./lighting";
import { ledTotals } from "./led";
import { materialStatuses } from "../../contracts/src/materials";

/** Neutrale huisstijl om mee te beginnen; alles is daarna aan te passen. */
export function defaultBranding(companyName: string): Branding {
  return {
    companyName,
    contact: "",
    footer: "",
    accent: "#536751",
    ink: "#27392f",
    font: "serif",
    logoAssetId: null,
  };
}

/**
 * De drie sjablonen verschillen niet alleen in uiterlijk maar ook in wat ze
 * standaard tonen. Een compact voorstel is een korte pitch, een uitgebreid
 * interieurplan neemt de klant mee door het hele ontwerp, en een technisch
 * planpakket is bedoeld voor de uitvoerende partij: planbladen, lichtplan en
 * productlijst, zonder verkooppraat.
 */
export function defaultBlocks(
  template: PresentationTemplate,
  variantId: string,
): PresentationBlock[] {
  const uuid = () => crypto.randomUUID();
  const cover: PresentationBlock = {
    id: uuid(),
    type: "cover",
    subtitle: "Interieurvoorstel",
  };
  const plan = (
    scale: 20 | 50 | 100,
    paper: "A4" | "A3",
    heading: string,
    beams = false,
  ): PresentationBlock => ({
    id: uuid(),
    type: "plan",
    heading,
    variantId,
    scale,
    paper,
    orientation: "landscape",
    beams,
  });
  if (template === "compact")
    return [
      cover,
      { id: uuid(), type: "text", heading: "Het voorstel", body: "" },
      plan(50, "A4", "Plattegrond"),
      { id: uuid(), type: "materials", heading: "Materialen", rooms: [] },
      { id: uuid(), type: "closing", heading: "Tot slot", body: "" },
    ];
  if (template === "extended")
    return [
      cover,
      { id: uuid(), type: "text", heading: "Het voorstel", body: "" },
      { id: uuid(), type: "moodboard", heading: "Sfeer", images: [] },
      plan(50, "A4", "Plattegrond"),
      { id: uuid(), type: "materials", heading: "Materialen", rooms: [] },
      { id: uuid(), type: "products", heading: "Meubels", variantId },
      { id: uuid(), type: "lighting", heading: "Lichtplan", variantId },
      { id: uuid(), type: "closing", heading: "Tot slot", body: "" },
    ];
  return [
    cover,
    plan(50, "A3", "Plattegrond 1:50"),
    plan(50, "A3", "Lichtplan 1:50", true),
    { id: uuid(), type: "lighting", heading: "Lichtplan", variantId },
    { id: uuid(), type: "products", heading: "Productlijst", variantId },
    { id: uuid(), type: "materials", heading: "Materiaalstaat", rooms: [] },
  ];
}

export function defaultPresentation(
  template: PresentationTemplate,
  input: {
    title: string;
    customer: string;
    date: string;
    companyName: string;
    variantId: string;
  },
): Presentation {
  return {
    title: input.title,
    customer: input.customer,
    date: input.date,
    template,
    branding: defaultBranding(input.companyName),
    blocks: defaultBlocks(template, input.variantId),
  };
}

/**
 * De inhoud van een publicatie samenstellen uit wat er nu in het ontwerp staat.
 *
 * Alles wat een blok toont wordt hier vastgelegd, inclusief het planblad als
 * vector en de bronrevisie. Wat er niet is, wordt niet verzonnen: een blok
 * zonder gegevens levert eenvoudigweg geen inhoud en het document meldt dat.
 */
export type ResolveInput = {
  scenes: Record<string, Scene>;
  materials: {
    definition: MaterialDefinition;
    version: number;
    entryId: string;
  }[];
  quotes: Record<string, QuoteRecord>;
  images: Record<string, string>;
  logo: string | null;
  date: string;
};

export function resolveContent(
  document: Presentation,
  input: ResolveInput,
): PresentationContent {
  const blocks: ResolvedBlock[] = [];
  const sources: PresentationContent["sources"] = [];
  const seen = new Set<string>();
  const note = (
    kind: "variant" | "materials" | "quote",
    id: string,
    revision: number,
  ) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ kind, id, revision });
  };
  for (const block of document.blocks) {
    if (block.type === "plan") {
      const scene = input.scenes[block.variantId];
      if (!scene) continue;
      const size = { paper: block.paper, orientation: block.orientation };
      /**
       * Past de tekening niet op het gekozen papier, dan gaat de presentatie
       * gewoon door en staat de reden in het document. Kleiner tekenen met
       * hetzelfde schaallabel erbij zou een onjuiste maat naar de klant sturen.
       */
      let svg = "",
        problem: string | null = null;
      try {
        svg = planSvg(scene, block.scale, {
          ...size,
          beams: block.beams,
          date: input.date,
        });
      } catch (e) {
        problem = e instanceof Error ? e.message : "Planblad mislukt.";
      }
      blocks.push({
        blockId: block.id,
        type: "plan",
        svg,
        problem,
        revision: scene.revision,
        widthMm:
          block.orientation === "portrait"
            ? block.paper === "A4"
              ? 210
              : 297
            : block.paper === "A4"
              ? 297
              : 420,
        heightMm:
          block.orientation === "portrait"
            ? block.paper === "A4"
              ? 297
              : 420
            : block.paper === "A4"
              ? 210
              : 297,
        scale: block.scale,
      });
      note("variant", block.variantId, scene.revision);
    }
    if (block.type === "moodboard") {
      const images = block.images
        .filter((image) => input.images[image.assetId])
        .map((image) => ({
          dataUri: input.images[image.assetId]!,
          caption: image.caption,
        }));
      if (images.length)
        blocks.push({ blockId: block.id, type: "moodboard", images });
    }
    if (block.type === "materials") {
      const rows = input.materials
        .filter(
          (m) =>
            !block.rooms.length ||
            block.rooms.includes(m.definition.room.trim()),
        )
        .map((m) => ({
          name: m.definition.name,
          room: m.definition.room || "—",
          category: m.definition.category,
          supplier: m.definition.supplier || "—",
          quantity: m.definition.quantity ?? "",
          unit: m.definition.unit,
          status:
            materialStatuses[
              m.definition.status as keyof typeof materialStatuses
            ],
          version: m.version,
        }));
      blocks.push({ blockId: block.id, type: "materials", rows });
      for (const m of input.materials) note("materials", m.entryId, m.version);
    }
    if (block.type === "lighting") {
      const scene = input.scenes[block.variantId];
      if (!scene) continue;
      blocks.push({
        blockId: block.id,
        type: "lighting",
        revision: scene.revision,
        circuits: circuits(scene.items).map((c) => ({
          name: c.name,
          count: c.count,
          power:
            c.withPower === 0
              ? "niet opgegeven"
              : c.withPower === c.count
                ? `${c.powerW} W`
                : `${c.powerW} W (${c.withPower} van ${c.count})`,
        })),
        scenes: lightScenes(scene.items).map((s) => ({
          name: s.name,
          count: s.count,
        })),
        led: ledTotals(scene.ledPaths),
      });
      note("variant", block.variantId, scene.revision);
    }
    if (block.type === "products") {
      const scene = input.scenes[block.variantId];
      if (!scene) continue;
      blocks.push({
        blockId: block.id,
        type: "products",
        revision: scene.revision,
        rows: scene.items
          .filter((i) => !i.fixture && !i.hidden)
          .map((i) => ({
            name: i.name,
            size: `${i.width} × ${i.depth} × ${i.height} mm`,
            supplier: i.catalog?.supplier ?? "",
            sku: i.catalog?.sku ?? "",
          })),
      });
      note("variant", block.variantId, scene.revision);
    }
    if (block.type === "price") {
      const quote = input.quotes[block.quoteId];
      if (!quote) continue;
      blocks.push({
        blockId: block.id,
        type: "price",
        number: quote.number,
        version: quote.version,
        total: quote.totals.total,
        lines: block.showLines
          ? quote.definition.lines.map((line, index) => ({
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              net: quote.totals.lines[index]!.net,
            }))
          : [],
      });
      note("quote", quote.id, quote.version);
    }
  }
  return {
    blocks,
    sources,
    logo: input.logo ? { dataUri: input.logo } : null,
  };
}

/**
 * De inhoudshash van een publicatie. Definitie, inhoud en sjabloonversie gaan
 * er alle drie in: een andere sjabloonversie levert een ander document op, ook
 * wanneer het ontwerp niet is veranderd.
 */
export function presentationHash(
  document: Presentation,
  content: PresentationContent,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        template: presentationTemplateVersion,
        document,
        content,
      }),
    )
    .digest("hex");
}
