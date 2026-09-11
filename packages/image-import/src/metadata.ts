/**
 * Metadata uit een onderleggerafbeelding verwijderen.
 *
 * Een foto uit een telefoon draagt EXIF mee: GPS-coördinaten van het adres van
 * de klant, een cameraserienummer, de opnametijd. Die gegevens horen niet in de
 * opslag van de studio en al helemaal niet in een presentatie die naar buiten
 * gaat. Ze worden daarom bij het uploaden verwijderd, vóór het vastleggen.
 *
 * Dit gebeurt zonder decoder: de pixels worden niet aangeraakt en niet opnieuw
 * gecodeerd. Er worden alleen hele segmenten (JPEG) of hele chunks (PNG)
 * weggelaten. Dat betekent geen beeldbibliotheek op de server, geen kwaliteit-
 * verlies, en geen enkele kans dat het beeld zelf verandert.
 *
 * Wat blijft staan is precies wat nodig is om het beeld juist te tónen: de
 * JFIF-kop, een ICC-kleurprofiel, de Adobe-marker, en bij PNG de chunks voor
 * kleur, gamma en pixeldichtheid. Alles wat beschrijft wáár en waarmée de foto
 * gemaakt is, gaat eruit.
 */

export type StrippedImage = {
  bytes: Buffer;
  /**
   * De EXIF-oriëntatie die in het bestand stond; 1 als er geen stond. De
   * waarde verdwijnt met de metadata, dus de aanroeper moet hem overnemen —
   * anders zou een staande foto liggend getoond worden.
   */
  orientation: number;
  /** Welke soorten metadata daadwerkelijk zijn weggelaten. */
  removed: string[];
};

/** JPEG-segmenten die blijven staan omdat ze het beeld beschrijven, niet de maker. */
const JPEG_KEEP_APP = new Set([
  0xe0, // APP0: JFIF-kop met pixeldichtheid
  0xe2, // APP2: ICC-kleurprofiel
  0xee, // APP14: Adobe-marker, nodig voor de juiste kleurtransformatie
]);

/**
 * PNG-chunks die blijven staan. Kritieke chunks (hoofdletter aan het begin)
 * blijven altijd; van de optionele houden we alleen wat de weergave bepaalt.
 */
const PNG_KEEP_ANCILLARY = new Set([
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "bKGD",
  "pHYs",
  "hIST",
  "sPLT",
]);

/** Leest tag 0x0112 (oriëntatie) uit een EXIF-blok. Bij twijfel: 1. */
function exifOrientation(exif: Buffer): number {
  // Structuur: TIFF-kop (bytevolgorde, 0x002A, offset naar IFD0), dan IFD0 met
  // 12-byte ingangen. Alles hieronder is begrensd; een misvormd blok levert 1.
  if (exif.length < 8) return 1;
  const order = exif.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return 1;
  const big = order === "MM";
  const u16 = (o: number) =>
    big ? exif.readUInt16BE(o) : exif.readUInt16LE(o);
  const u32 = (o: number) =>
    big ? exif.readUInt32BE(o) : exif.readUInt32LE(o);
  if (u16(2) !== 0x002a) return 1;
  const ifd = u32(4);
  if (ifd + 2 > exif.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > exif.length) return 1;
    if (u16(entry) !== 0x0112) continue;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

function stripJpeg(bytes: Buffer): StrippedImage {
  const houden: Buffer[] = [bytes.subarray(0, 2)]; // SOI
  const removed: string[] = [];
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    // Vulbytes tussen segmenten horen erbij en blijven staan.
    if (marker === 0xff) {
      houden.push(bytes.subarray(offset, offset + 1));
      offset += 1;
      continue;
    }
    // Vanaf de beelddata staat geen metadata meer; de rest gaat er ongemoeid in.
    if (marker === 0xda) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    const einde = Math.min(offset + 2 + length, bytes.length);
    const segment = bytes.subarray(offset, einde);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (isApp && marker === 0xe1) {
      // APP1 draagt EXIF of XMP. De oriëntatie halen we eruit vóór we hem weggooien.
      const payload = segment.subarray(4);
      if (payload.subarray(0, 6).toString("latin1") === "Exif\0\0") {
        orientation = exifOrientation(payload.subarray(6));
        removed.push("exif");
      } else removed.push("xmp");
      offset = einde;
      continue;
    }
    if ((isApp && !JPEG_KEEP_APP.has(marker)) || isComment) {
      removed.push(isComment ? "comment" : `app${marker - 0xe0}`);
      offset = einde;
      continue;
    }
    houden.push(segment);
    offset = einde;
  }
  houden.push(bytes.subarray(offset));
  return { bytes: Buffer.concat(houden), orientation, removed };
}

function stripPng(bytes: Buffer): StrippedImage {
  const houden: Buffer[] = [bytes.subarray(0, 8)]; // handtekening
  const removed: string[] = [];
  let orientation = 1;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const einde = offset + 12 + length;
    if (length > bytes.length || einde > bytes.length) break;
    const chunk = bytes.subarray(offset, einde);
    // Een kleine letter vooraan betekent optioneel; kritieke chunks blijven altijd.
    const optioneel = type[0] === type[0]!.toLowerCase();
    if (optioneel && !PNG_KEEP_ANCILLARY.has(type)) {
      if (type === "eXIf")
        orientation = exifOrientation(chunk.subarray(8, 8 + length));
      removed.push(type);
      offset = einde;
      if (type === "IEND") break;
      continue;
    }
    houden.push(chunk);
    offset = einde;
    if (type === "IEND") break;
  }
  return { bytes: Buffer.concat(houden), orientation, removed };
}

/**
 * Verwijdert metadata uit een PNG of JPEG. Onbekende formaten komen hier niet:
 * `readImageHeader` heeft die al geweigerd.
 */
export function stripImageMetadata(bytes: Buffer): StrippedImage {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(png))
    return stripPng(bytes);
  return stripJpeg(bytes);
}

/**
 * Oriëntaties 2, 4, 5 en 7 spiegelen het beeld. Draaien kan de app; spiegelen
 * niet zonder de pixels opnieuw te coderen. Bij een ingemeten plattegrond is
 * stilzwijgend een spiegelbeeld tonen erger dan weigeren.
 */
export const MIRRORED_ORIENTATIONS = new Set([2, 4, 5, 7]);

/** De draaiing in graden met de klok mee die bij een oriëntatie hoort. */
export function orientationRotation(orientation: number): number {
  return orientation === 3
    ? 180
    : orientation === 6
      ? 90
      : orientation === 8
        ? 270
        : 0;
}
