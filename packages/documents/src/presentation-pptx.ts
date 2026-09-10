import PptxGenJS from "pptxgenjs";
import type {
  Presentation,
  PresentationContent,
  ResolvedBlock,
} from "../../contracts/src/presentations";
import { presentationTemplateVersion } from "../../contracts/src/presentations";

/**
 * Dezelfde presentatie als PowerPoint.
 *
 * Teksten en tabellen worden echte tekstvakken en tabellen, dus in PowerPoint
 * gewoon te bewerken. Een planblad kan dat niet: PowerPoint kent geen
 * vectorblad dat op ware schaal blijft, dus dat gaat als afbeelding mee. Dat
 * staat ook op de dia zelf, want een afbeelding van een plattegrond is geen
 * maatvaste tekening — de PDF is dat wel.
 *
 * Er worden maar twee lettertypen gebruikt, dezelfde als in de PDF, omdat een
 * ontbrekend lettertype op de computer van de klant de opmaak stilletjes
 * verandert.
 */
const FONTS = { serif: "Georgia", sans: "Arial" } as const;

/** Dia van 25,4 bij 14,29 cm: 16:9, het formaat dat PowerPoint standaard opent. */
export const slide = { width: 10, height: 5.625 };
const margin = 0.55;

export type PptxWarning = { blockId: string; message: string };

/**
 * Wat er op een dia niet past. De opmaak wordt niet stilzwijgend afgekapt: dit
 * komt als waarschuwing terug zodat iemand het blok kan splitsen of inkorten.
 *
 * De grenzen zijn met de hand nagemeten op het gekozen diaformaat en
 * lettergrootte, en bewust aan de veilige kant.
 */
export const limits = { bodyChars: 900, tableRows: 12, headingChars: 70 };

export function pptxWarnings(
  document: Presentation,
  content: PresentationContent,
): PptxWarning[] {
  const warnings: PptxWarning[] = [];
  const byBlock = new Map(content.blocks.map((b) => [b.blockId, b]));
  for (const block of document.blocks) {
    if ("heading" in block && block.heading.length > limits.headingChars)
      warnings.push({
        blockId: block.id,
        message: `De kop is te lang voor een dia (${block.heading.length} van ${limits.headingChars} tekens).`,
      });
    if ("body" in block && block.body.length > limits.bodyChars)
      warnings.push({
        blockId: block.id,
        message: `De tekst past niet op één dia (${block.body.length} van ${limits.bodyChars} tekens). Splits het blok.`,
      });
    const resolved = byBlock.get(block.id);
    const rows = rowCount(resolved);
    if (rows > limits.tableRows)
      warnings.push({
        blockId: block.id,
        message: `De tabel heeft ${rows} regels; er passen er ${limits.tableRows} op een dia. De rest staat wel in de PDF.`,
      });
    if (
      block.type !== "cover" &&
      block.type !== "text" &&
      block.type !== "closing" &&
      !resolved
    )
      warnings.push({
        blockId: block.id,
        message: "Voor dit blok is niets vastgelegd; de dia blijft leeg.",
      });
  }
  return warnings;
}

function rowCount(block: ResolvedBlock | undefined) {
  if (!block) return 0;
  if (block.type === "materials" || block.type === "products")
    return block.rows.length;
  if (block.type === "price") return block.lines.length;
  if (block.type === "lighting")
    return block.circuits.length + block.scenes.length;
  return 0;
}

const table = (
  deck: PptxGenJS,
  slideRef: PptxGenJS.Slide,
  headers: string[],
  rows: string[][],
  accent: string,
  font: string,
) => {
  slideRef.addTable(
    [
      headers.map((h) => ({
        text: h,
        options: { bold: true, color: accent, fontSize: 10 },
      })),
      ...rows
        .slice(0, limits.tableRows)
        .map((row) => row.map((cell) => ({ text: cell, options: {} }))),
    ],
    {
      x: margin,
      y: 1.35,
      w: slide.width - margin * 2,
      fontSize: 10,
      fontFace: font,
      border: { type: "solid", pt: 0.5, color: "D7DED4" },
      autoPage: false,
    },
  );
  void deck;
};

export async function presentationPptx(
  document: Presentation,
  content: PresentationContent,
  /** Planbladen als PNG, per blok-ID; die kunnen niet als vector mee. */
  sheets: Record<string, Buffer>,
): Promise<Buffer> {
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_16x9";
  deck.author = document.branding.companyName;
  deck.title = document.title;
  const font = FONTS[document.branding.font];
  const accent = document.branding.accent.replace("#", "");
  const ink = document.branding.ink.replace("#", "");
  const byBlock = new Map(content.blocks.map((b) => [b.blockId, b]));
  const heading = (s: PptxGenJS.Slide, text: string) =>
    s.addText(text, {
      x: margin,
      y: 0.5,
      w: slide.width - margin * 2,
      h: 0.6,
      fontSize: 22,
      fontFace: font,
      color: accent,
    });

  for (const block of document.blocks) {
    const s = deck.addSlide();
    const resolved = byBlock.get(block.id);
    if (block.type === "cover") {
      s.addText(document.branding.companyName.toUpperCase(), {
        x: margin,
        y: 0.6,
        w: slide.width - margin * 2,
        h: 0.3,
        fontSize: 10,
        fontFace: font,
        color: accent,
        charSpacing: 3,
      });
      s.addText(document.title, {
        x: margin,
        y: 1.4,
        w: slide.width - margin * 2,
        h: 1.6,
        fontSize: 40,
        fontFace: font,
        color: ink,
      });
      s.addText(
        [document.customer, document.date].filter(Boolean).join(" · "),
        {
          x: margin,
          y: 3.2,
          w: slide.width - margin * 2,
          h: 0.4,
          fontSize: 12,
          fontFace: font,
          color: ink,
        },
      );
      continue;
    }
    if ("heading" in block) heading(s, block.heading);
    if (block.type === "text" || block.type === "closing") {
      s.addText(
        block.type === "closing"
          ? [block.body, document.branding.contact].filter(Boolean).join("\n\n")
          : block.body,
        {
          x: margin,
          y: 1.35,
          w: slide.width - margin * 2,
          h: slide.height - 2,
          fontSize: 13,
          fontFace: font,
          color: ink,
          valign: "top",
        },
      );
      continue;
    }
    if (!resolved) {
      s.addText("Voor dit blok is nog niets vastgelegd.", {
        x: margin,
        y: 1.35,
        w: slide.width - margin * 2,
        h: 0.5,
        fontSize: 12,
        fontFace: font,
        color: ink,
        italic: true,
      });
      continue;
    }
    if (resolved.type === "plan") {
      const png = sheets[block.id];
      if (!png) {
        s.addText(
          resolved.problem ?? "Dit planblad kon niet als afbeelding mee.",
          {
            x: margin,
            y: 1.35,
            w: slide.width - margin * 2,
            h: 0.6,
            fontSize: 12,
            fontFace: font,
            color: ink,
            italic: true,
          },
        );
        continue;
      }
      // Het blad past op de dia met behoud van zijn verhouding.
      const available = { w: slide.width - margin * 2, h: slide.height - 2.1 };
      const ratio = resolved.widthMm / resolved.heightMm;
      const size =
        available.w / available.h > ratio
          ? { w: available.h * ratio, h: available.h }
          : { w: available.w, h: available.w / ratio };
      s.addImage({
        data: `image/png;base64,${png.toString("base64")}`,
        x: margin + (available.w - size.w) / 2,
        y: 1.3,
        w: size.w,
        h: size.h,
      });
      s.addText(
        `Afbeelding van het planblad 1:${resolved.scale}. Alleen de PDF is maatvast; print die op 100%.`,
        {
          x: margin,
          y: slide.height - 0.62,
          w: slide.width - margin * 2,
          h: 0.35,
          fontSize: 9,
          fontFace: font,
          color: ink,
          italic: true,
        },
      );
      continue;
    }
    if (resolved.type === "moodboard") {
      resolved.images.slice(0, 4).forEach((image, index) => {
        const column = index % 2,
          rowIndex = Math.floor(index / 2);
        s.addImage({
          data: image.dataUri.replace(/^data:/, ""),
          x: margin + column * ((slide.width - margin * 2) / 2 + 0.1),
          y: 1.35 + rowIndex * 1.9,
          w: (slide.width - margin * 2) / 2 - 0.1,
          h: 1.7,
        });
      });
      continue;
    }
    if (resolved.type === "materials")
      table(
        deck,
        s,
        ["Ruimte", "Materiaal", "Categorie", "Leverancier", "Aantal", "Status"],
        resolved.rows.map((r) => [
          r.room,
          r.name,
          r.category,
          r.supplier,
          r.quantity ? `${r.quantity.replace(".", ",")} ${r.unit}` : "—",
          r.status,
        ]),
        accent,
        font,
      );
    if (resolved.type === "products")
      table(
        deck,
        s,
        ["Object", "Maat", "Leverancier", "Artikelnummer"],
        resolved.rows.map((r) => [
          r.name,
          r.size,
          r.supplier || "—",
          r.sku || "—",
        ]),
        accent,
        font,
      );
    if (resolved.type === "lighting")
      table(
        deck,
        s,
        ["Onderdeel", "Aantal", "Toelichting"],
        [
          ...resolved.circuits.map((c) => [
            `Groep ${c.name}`,
            String(c.count),
            c.power,
          ]),
          ...resolved.scenes.map((x) => [
            `Scène ${x.name}`,
            String(x.count),
            "",
          ]),
          [
            "LED-strips",
            String(resolved.led.count),
            `${resolved.led.lengthM.replace(".", ",")} m · ${resolved.led.powerW.replace(".", ",")} W`,
          ],
        ],
        accent,
        font,
      );
    if (resolved.type === "price") {
      if (resolved.lines.length)
        table(
          deck,
          s,
          ["Omschrijving", "Aantal", "Eenheid", "Netto"],
          resolved.lines.map((l) => [
            l.description,
            l.quantity.replace(".", ","),
            l.unit,
            `${l.net.replace(".", ",")} EUR`,
          ]),
          accent,
          font,
        );
      s.addText(`Totaal: ${resolved.total.replace(".", ",")} EUR`, {
        x: margin,
        y: slide.height - 1.1,
        w: slide.width - margin * 2,
        h: 0.4,
        fontSize: 16,
        fontFace: font,
        color: ink,
      });
    }
  }
  deck
    .addSlide()
    .addText(
      `Sjabloon ${presentationTemplateVersion}. Planbladen staan hier als afbeelding; de bijbehorende PDF is de maatvaste versie.`,
      {
        x: margin,
        y: slide.height / 2 - 0.4,
        w: slide.width - margin * 2,
        h: 0.8,
        fontSize: 11,
        fontFace: font,
        color: ink,
        italic: true,
      },
    );
  return (await deck.write({ outputType: "nodebuffer" })) as Buffer;
}
