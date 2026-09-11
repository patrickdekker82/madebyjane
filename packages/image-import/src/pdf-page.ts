/**
 * Een PDF-pagina omzetten naar een PNG, om als onderlegger te gebruiken.
 *
 * Een bestaande plattegrond komt vaak als PDF binnen. Die mag niet zomaar de
 * pagina op: een PDF kan scripts, formulieren en externe verwijzingen bevatten,
 * en actieve inhoud hoort niet in de editor. Daarom wordt hij nooit getoond of
 * opgeslagen, maar één keer omgezet naar losse pixels. Wat de server te zien
 * krijgt is een gewone PNG, langs dezelfde weg en dezelfde keuring als elke
 * andere onderlegger.
 *
 * Het omzetten gebeurt op het apparaat van de gebruiker, niet op de server. Zo
 * komt er nooit een PDF-parser op de server te staan, en dat is precies de
 * component waar je er geen van wilt hebben.
 *
 * Dit bestand wordt bewust niet vanuit `index.ts` doorgegeven: alleen wie
 * werkelijk een PDF omzet laadt pdf.js, en de server laadt het nooit.
 */

/** Een canvas: zowel `OffscreenCanvas` als een canvas uit Node past hierop. */
export type CanvasLike = {
  width: number;
  height: number;
  getContext(type: "2d"): unknown;
};

export type PdfPageOptions = {
  /**
   * Waar pdf.js zijn worker vandaan haalt. In de browser hoort dit gezet te
   * zijn, anders rekent de pagina op de hoofddraad en staat het scherm stil.
   * In Node blijft het leeg en draait pdf.js zonder worker.
   */
  workerSrc?: string;
};

/**
 * De langste zijde van het resultaat. Ruim genoeg om maatlijnen op een A1-plan
 * te kunnen lezen, en klein genoeg om binnen de 16 MiB van een upload te
 * blijven en de tekening niet te laten haperen.
 */
export const MAX_PAGE_SIDE_PX = 4000;

/** Minder dan dit levert een onleesbare plattegrond op. */
const MIN_SCALE = 1;
/** 2× de PDF-eenheid is ongeveer 144 dpi; genoeg voor een lijntekening. */
const TARGET_SCALE = 2;

async function pdfjs(options: PdfPageOptions) {
  // De legacy-build draait zowel in de browser als in Node.
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (options.workerSrc) lib.GlobalWorkerOptions.workerSrc = options.workerSrc;
  return lib;
}

async function open(bytes: Uint8Array, options: PdfPageOptions) {
  const lib = await pdfjs(options);
  const taak = lib.getDocument({
    // Een kopie, want pdf.js maakt de buffer onbruikbaar na gebruik.
    data: new Uint8Array(bytes),
    // Niets van buiten ophalen: dit bestand wordt gelezen als tekening en
    // verder nergens voor vertrouwd. Ook geen eigen lettertypen binnenhalen.
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    // Een fout in één stukje pagina mag de hele omzetting niet afbreken.
    stopAtErrors: false,
  });
  return { taak, doc: await taak.promise };
}

/** Hoeveel pagina's het bestand heeft, om de gebruiker te laten kiezen. */
export async function pdfPageCount(
  bytes: Uint8Array,
  options: PdfPageOptions = {},
): Promise<number> {
  const { taak, doc } = await open(bytes, options);
  try {
    return doc.numPages;
  } finally {
    await taak.destroy();
  }
}

/**
 * Rekent één pagina uit tot pixels. De schaal wordt zo gekozen dat de langste
 * zijde onder `MAX_PAGE_SIDE_PX` blijft; een groot plan wordt dus kleiner
 * gerekend in plaats van geweigerd.
 */
export async function renderPdfPage(
  bytes: Uint8Array,
  pageNumber: number,
  canvasFor: (width: number, height: number) => CanvasLike,
  options: PdfPageOptions = {},
): Promise<{ canvas: CanvasLike; widthPx: number; heightPx: number }> {
  const { taak, doc } = await open(bytes, options);
  try {
    if (pageNumber < 1 || pageNumber > doc.numPages)
      throw new Error(
        `Deze PDF heeft ${doc.numPages} ${doc.numPages === 1 ? "pagina" : "pagina's"}; kies er daar een van.`,
      );
    const page = await doc.getPage(pageNumber);
    const eenheid = page.getViewport({ scale: 1 });
    const langste = Math.max(eenheid.width, eenheid.height);
    const scale = Math.max(
      MIN_SCALE,
      Math.min(TARGET_SCALE, MAX_PAGE_SIDE_PX / langste),
    );
    const viewport = page.getViewport({ scale });
    const widthPx = Math.max(1, Math.floor(viewport.width));
    const heightPx = Math.max(1, Math.floor(viewport.height));
    const canvas = canvasFor(widthPx, heightPx);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Deze browser kan geen afbeelding tekenen.");
    // Een PDF-pagina is doorzichtig waar niets staat; zonder witte ondergrond
    // zou de onderlegger als zwart vlak in de tekening komen te staan.
    const flat = context as CanvasRenderingContext2D;
    flat.fillStyle = "#ffffff";
    flat.fillRect(0, 0, widthPx, heightPx);
    await page.render({
      canvasContext: flat,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    return { canvas, widthPx, heightPx };
  } finally {
    await taak.destroy();
  }
}
