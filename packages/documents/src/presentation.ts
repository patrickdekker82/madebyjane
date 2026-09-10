import {
  paperSizes,
  presentationTemplateVersion,
  sheetSize,
  type Presentation,
  type PresentationContent,
  type PresentationTemplate,
  type ResolvedBlock,
} from "../../contracts/src/presentations";
import { escapeXml as e } from "./plan";

/**
 * Presentatie naar HTML, klaar voor Chromium.
 *
 * Twee soorten pagina's staan in één document. Tekstpagina's staan op A4 staand
 * met marges. Planbladen krijgen een eigen paginastijl zonder marges, op hun
 * eigen papiermaat en richting, zodat de tekening op ware grootte staat: een
 * lijn van 5.000 mm is bij 1:50 precies 100 mm op papier.
 *
 * Wat we hier bewust NIET doen, met een reden die duur is geleerd bij de
 * offerte-PDF: het blok om een planblad krijgt geen eigen breedte en hoogte.
 * Zodra dat wel gebeurde, negeerde Chromium de paginastijl van dat blad, zette
 * het op een gewone pagina met marges en kromp het hele document. De schaalbalk
 * mat toen 88,6 mm in plaats van 100 mm. De maat hoort op de tekening zelf te
 * staan, niet op het blok eromheen.
 */
const fonts = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
} as const;

type Look = {
  /** Grootte van de omslagtitel in punten. */
  coverTitle: number;
  heading: number;
  body: number;
  /** Begint elk blok op een nieuwe pagina? */
  pagePerBlock: boolean;
  /** Toont het technische colofon met bronrevisies? */
  colophon: boolean;
};

export const looks: Record<PresentationTemplate, Look> = {
  compact: {
    coverTitle: 34,
    heading: 15,
    body: 10,
    pagePerBlock: false,
    colophon: false,
  },
  extended: {
    coverTitle: 44,
    heading: 19,
    body: 11,
    pagePerBlock: true,
    colophon: false,
  },
  technical: {
    coverTitle: 28,
    heading: 14,
    body: 9.5,
    pagePerBlock: true,
    colophon: true,
  },
};

/** Elke gebruikte papiermaat en richting krijgt een eigen benoemde pagina. */
function pageName(paper: string, orientation: string) {
  return `sheet_${paper.toLowerCase()}_${orientation}`;
}

function planPages(document: Presentation) {
  const used = new Map<string, { width: number; height: number }>();
  for (const b of document.blocks)
    if (b.type === "plan")
      used.set(
        pageName(b.paper, b.orientation),
        sheetSize(b.paper, b.orientation),
      );
  return [...used]
    .map(
      ([name, size]) =>
        `@page ${name}{size:${size.width}mm ${size.height}mm;margin:0}`,
    )
    .join(" ");
}

function planRules(document: Presentation) {
  const used = new Set<string>();
  for (const b of document.blocks)
    if (b.type === "plan") used.add(pageName(b.paper, b.orientation));
  return [...used]
    .map((name) => `.${name}{page:${name};break-before:page}`)
    .join(" ");
}

/**
 * Extra's voor de schermweergave. Alleen de webviewer geeft deze mee; de PDF
 * wordt zonder gemaakt, zodat het papier precies blijft zoals het was.
 */
export type ViewerOptions = {
  /** Waar de maatvaste PDF staat. Zonder link komt er geen knop. */
  pdfHref?: string;
  /** Regel naast de titel, bijvoorbeeld welke versie dit is. */
  subtitle?: string;
};

/**
 * De schermstijl staat volledig in `@media screen` en raakt het papier dus
 * niet. Op het scherm wordt een planblad naar de vensterbreedte geschaald; het
 * is daar bewust géén maat meer, en de balk zegt dat er ook bij.
 */
const screenCss = `@media screen{
 body{background:#4a4c48;padding:0 0 10mm}
 .cover,.block,.colophon,.sheet{background:#fff;margin:6mm auto;box-shadow:0 0.5mm 2mm rgba(0,0,0,0.35);max-width:100%}
 .cover,.block,.colophon{width:210mm;padding:18mm 16mm 20mm}
 .sheet{width:max-content}
 svg{max-width:100%;height:auto}
 .viewer-bar{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;gap:3mm;align-items:baseline;justify-content:space-between;background:#23261f;color:#f4f2ec;padding:4mm 6mm;font:11pt ${fonts.sans}}
 .viewer-bar strong{font-weight:600}
 .viewer-bar .viewer-note{font-size:9pt;opacity:0.8;max-width:110mm}
 .viewer-bar a{color:#f4f2ec;border:0.4mm solid #f4f2ec;border-radius:1mm;padding:1.5mm 4mm;text-decoration:none;font-size:9.5pt}
}
@media screen and (max-width:240mm){
 .cover,.block,.colophon{width:auto;padding:8mm}
}
@media print{.viewer-bar{display:none}}`;

const viewerBar = (document: Presentation, viewer: ViewerOptions) =>
  `<header class="viewer-bar"><div><strong>${e(document.title)}</strong>${
    viewer.subtitle ? ` · ${e(viewer.subtitle)}` : ""
  }</div><div class="viewer-note">Schermweergave. Alleen de PDF is maatvast; print die op 100%.</div>${
    viewer.pdfHref
      ? `<a href="${e(viewer.pdfHref)}" download>PDF downloaden</a>`
      : ""
  }</header>`;

const table = (headers: string[], rows: string[][]) =>
  `<table><thead><tr>${headers
    .map((h) => `<th>${e(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${e(cell)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;

function renderResolved(block: ResolvedBlock): string {
  switch (block.type) {
    case "plan":
      // Het blad staat er als vector in, op de maat waarop het is uitgegeven.
      return block.svg;
    case "moodboard":
      return `<div class="moodboard">${block.images
        .map(
          (image) =>
            `<figure><img src="${e(image.dataUri)}" alt=""/>${image.caption ? `<figcaption>${e(image.caption)}</figcaption>` : ""}</figure>`,
        )
        .join("")}</div>`;
    case "materials":
      return block.rows.length
        ? table(
            [
              "Ruimte",
              "Materiaal",
              "Categorie",
              "Leverancier",
              "Aantal",
              "Status",
            ],
            block.rows.map((r) => [
              r.room,
              r.name,
              r.category,
              r.supplier,
              r.quantity ? `${r.quantity.replace(".", ",")} ${r.unit}` : "—",
              r.status,
            ]),
          )
        : `<p class="empty">Nog geen materiaalkeuzes vastgelegd.</p>`;
    case "products":
      return block.rows.length
        ? table(
            ["Object", "Maat", "Leverancier", "Artikelnummer"],
            block.rows.map((r) => [
              r.name,
              r.size,
              r.supplier || "—",
              r.sku || "—",
            ]),
          )
        : `<p class="empty">Nog geen producten in dit ontwerp.</p>`;
    case "lighting":
      return `${
        block.circuits.length
          ? table(
              ["Groep", "Punten", "Opgegeven vermogen"],
              block.circuits.map((c) => [c.name, String(c.count), c.power]),
            )
          : ""
      }${
        block.scenes.length
          ? table(
              ["Lichtscène", "Armaturen"],
              block.scenes.map((s) => [s.name, String(s.count)]),
            )
          : ""
      }${
        block.led.count
          ? `<p>${block.led.count} LED-strip${block.led.count === 1 ? "" : "s"} · ${e(block.led.lengthM.replace(".", ","))} m · ${e(block.led.powerW.replace(".", ","))} W.</p>`
          : ""
      }<p class="note">Opgeteld uit wat is ingevuld. Geen groeps-, belasting- of lichtberekening.</p>`;
    case "price":
      return `${
        block.lines.length
          ? table(
              ["Omschrijving", "Aantal", "Eenheid", "Netto"],
              block.lines.map((l) => [
                l.description,
                l.quantity.replace(".", ","),
                l.unit,
                `${l.net.replace(".", ",")} EUR`,
              ]),
            )
          : ""
      }<p class="total">Totaal: ${e(block.total.replace(".", ","))} EUR</p><p class="note">Offerte ${e(block.number ?? "concept")} · versie ${block.version}.</p>`;
  }
}

export function presentationHtml(
  document: Presentation,
  content: PresentationContent,
  viewer?: ViewerOptions,
) {
  const look = looks[document.template];
  const byBlock = new Map(content.blocks.map((b) => [b.blockId, b]));
  const family = fonts[document.branding.font];
  const body = document.blocks
    .map((block) => {
      const resolvedBlock = byBlock.get(block.id);
      if (block.type === "cover")
        return `<section class="cover">${content.logo ? `<img class="logo" src="${e(content.logo.dataUri)}" alt="${e(document.branding.companyName)}"/>` : ""}<div class="brand">${e(document.branding.companyName)}</div><h1>${e(document.title)}</h1><p class="subtitle">${e(block.subtitle)}</p><p class="meta">${e(document.customer)}${document.customer && document.date ? " · " : ""}${e(document.date)}</p></section>`;
      if (block.type === "text")
        return `<section class="block"><h2>${e(block.heading)}</h2><div class="prose">${e(block.body)}</div></section>`;
      if (block.type === "closing")
        return `<section class="block closing"><h2>${e(block.heading)}</h2><div class="prose">${e(block.body)}</div><div class="prose contact">${e(document.branding.contact)}</div></section>`;
      if (block.type === "plan") {
        if (!resolvedBlock || resolvedBlock.type !== "plan")
          return `<section class="block"><h2>${e(block.heading)}</h2><p class="empty">Dit planblad is nog niet vastgelegd.</p></section>`;
        if (resolvedBlock.problem)
          return `<section class="block"><h2>${e(block.heading)}</h2><p class="empty">${e(resolvedBlock.problem)}</p></section>`;
        // Alleen de paginastijl en de tekening; geen maat op het blok eromheen.
        return `<section class="sheet ${pageName(block.paper, block.orientation)}">${renderResolved(resolvedBlock)}</section>`;
      }
      if (!resolvedBlock)
        return `<section class="block"><h2>${e(block.heading)}</h2><p class="empty">Voor dit blok is nog niets vastgelegd.</p></section>`;
      return `<section class="block"><h2>${e(block.heading)}</h2>${renderResolved(resolvedBlock)}</section>`;
    })
    .join("");
  const colophon = look.colophon
    ? `<section class="block colophon"><h2>Colofon</h2>${table(
        ["Bron", "Identiteit", "Revisie"],
        content.sources.map((s) => [
          s.kind === "variant"
            ? "Ontwerp"
            : s.kind === "materials"
              ? "Materiaalkeuzes"
              : "Offerte",
          s.id,
          String(s.revision),
        ]),
      )}<p class="note">Sjabloon ${e(presentationTemplateVersion)} · print op 100%.</p></section>`
    : "";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${e(document.title)}</title><style>
 @page{size:${paperSizes.A4.width}mm ${paperSizes.A4.height}mm;margin:18mm 16mm 20mm} @page doc{size:${paperSizes.A4.width}mm ${paperSizes.A4.height}mm;margin:18mm 16mm 20mm} ${planPages(document)}
 *{box-sizing:border-box}body{margin:0;color:${e(document.branding.ink)};font:${look.body}pt ${family};line-height:1.5}
 h1{font-size:${look.coverTitle}pt;font-weight:400;margin:0 0 6mm;line-height:1.1}
 h2{font-size:${look.heading}pt;font-weight:400;margin:0 0 4mm;color:${e(document.branding.accent)};break-after:avoid}
 /* Chromium houdt een benoemde pagina vast tot een volgend blok er zelf een
    kiest; page:auto zet hem niet terug. Tekstpagina's noemen daarom hun
    eigen pagina, anders erft het blok na een planblad diens papiermaat. */
 .cover,.block,.colophon{page:doc}
 /* Een planblad hoort een blok te zijn en geen regel tekst. Een svg staat
    standaard in een regel, en dan blijft de benoemde pagina van dat blad ook
    voor het blok erna gelden: de materiaalstaat kwam zo op A4 liggend terecht.
    Met display:block klopt zowel de paginamaat als de schaal. */
 svg{display:block}
 .cover{border-top:3mm solid ${e(document.branding.accent)};padding-top:10mm;${look.pagePerBlock ? "break-after:page;" : "margin-bottom:12mm;"}}
 .brand{text-transform:uppercase;letter-spacing:3px;font-size:8pt;margin-bottom:16mm}
 .subtitle{font-size:${look.heading}pt;margin:0 0 3mm}
 .meta{font-size:9pt;opacity:0.75}
 .block{${look.pagePerBlock ? "break-before:page;" : "margin-bottom:9mm;"}}
 .prose{white-space:pre-wrap;overflow-wrap:anywhere}
 .contact{margin-top:6mm;font-size:9pt;opacity:0.8}
 table{border-collapse:collapse;width:100%;margin:0 0 4mm;table-layout:fixed}
 thead{display:table-header-group}
 th{text-align:left;font-size:8pt;padding:2mm;border-bottom:0.6mm solid ${e(document.branding.accent)}}
 td{padding:2mm;border-bottom:0.2mm solid #d7ded4;font-size:${look.body - 1}pt;vertical-align:top;overflow-wrap:anywhere}
 tr{break-inside:avoid}
 .total{font-size:${look.heading}pt;margin:2mm 0 0}
 .note{font-size:8pt;opacity:0.7}
 .empty{font-size:9pt;opacity:0.7;font-style:italic}
 .moodboard{display:flex;flex-wrap:wrap;gap:4mm}
 .moodboard figure{margin:0;width:calc(50% - 2mm);break-inside:avoid}
 .moodboard img{width:100%;display:block}
 .moodboard figcaption{font-size:8pt;margin-top:1.5mm;opacity:0.8}
 .colophon td{font-size:8pt}
 .logo{max-height:22mm;margin-bottom:10mm}
 ${planRules(document)}
 ${viewer ? screenCss : ""}
 </style></head><body>${viewer ? viewerBar(document, viewer) : ""}${body}${colophon}</body></html>`;
}
