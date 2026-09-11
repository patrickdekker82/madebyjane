/**
 * Kop van een onderleggerafbeelding lezen.
 *
 * Bewust géén decoder: we lezen alleen de maten uit de bestandskop en laten de
 * pixels ongemoeid. De browser decodeert straks in een gewone img-tag. Zo komt
 * er op de server nooit een beeldbibliotheek met eigen kwetsbaarheden aan te
 * pas, en kan een misvormd bestand hooguit hier stranden.
 *
 * Alleen PNG en JPEG. SVG en PDF zijn uitgesloten: dat is actieve inhoud die
 * scripts en externe verwijzingen kan bevatten en dus niet als onderlegger de
 * pagina in mag.
 *
 * Metadata verwijderen gebeurt in `metadata.ts`, ook zonder decoder: hele
 * segmenten en chunks worden weggelaten, de pixels blijven onaangeraakt.
 */
export type ImageHeader = {
  mime: "image/png" | "image/jpeg";
  widthPx: number;
  heightPx: number;
};

const MAX_SIDE = 20000;

function readPng(bytes: Buffer): ImageHeader {
  // Handtekening, dan een IHDR-chunk met lengte 13 op een vaste plek.
  if (bytes.length < 24) throw new Error("Het PNG-bestand is onvolledig.");
  if (
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("latin1", 12, 16) !== "IHDR"
  )
    throw new Error("Dit PNG-bestand mist een geldige kop.");
  const widthPx = bytes.readUInt32BE(16),
    heightPx = bytes.readUInt32BE(20);
  return { mime: "image/png", widthPx, heightPx };
}

function readJpeg(bytes: Buffer): ImageHeader {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff)
      throw new Error("Dit JPEG-bestand mist een geldige kop.");
    const marker = bytes[offset + 1]!;
    // Vulbytes tussen segmenten overslaan.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // SOF0 tot en met SOF15 dragen de maten; DHT, DAC en RST horen er niet bij.
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) throw new Error("Dit JPEG-bestand mist een geldige kop.");
    if (isFrame)
      return {
        mime: "image/jpeg",
        heightPx: bytes.readUInt16BE(offset + 5),
        widthPx: bytes.readUInt16BE(offset + 7),
      };
    if (marker === 0xda) break; // Beelddata begint; verder zoeken heeft geen zin.
    offset += 2 + length;
  }
  throw new Error("Dit JPEG-bestand mist een geldige kop.");
}

export function readImageHeader(bytes: Buffer): ImageHeader {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header =
    bytes.length >= 8 && bytes.subarray(0, 8).equals(png)
      ? readPng(bytes)
      : bytes.length >= 3 &&
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes[2] === 0xff
        ? readJpeg(bytes)
        : (() => {
            throw new Error(
              "Kies een PNG- of JPEG-afbeelding. SVG en PDF worden niet als onderlegger geaccepteerd.",
            );
          })();
  if (
    !Number.isInteger(header.widthPx) ||
    !Number.isInteger(header.heightPx) ||
    header.widthPx < 1 ||
    header.heightPx < 1 ||
    header.widthPx > MAX_SIDE ||
    header.heightPx > MAX_SIDE
  )
    throw new Error(
      `De afbeelding moet tussen 1 en ${MAX_SIDE} pixels per zijde zijn.`,
    );
  return header;
}

export {
  stripImageMetadata,
  orientationRotation,
  MIRRORED_ORIENTATIONS,
  type StrippedImage,
} from "./metadata";
