import { deflateSync } from "node:zlib";
import { crc32 } from "node:zlib";

/**
 * Een echt, geldig PNG-bestand van de gevraagde maat; eigen pixels, geen externe
 * asset. Middengrijs, zodat een schermopname laat zien of de onderlegger ook
 * werkelijk getekend wordt.
 */
export function makePng(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = 2; // truecolour
  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 128)]),
    ),
  );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Een minimale maar structureel geldige JPEG-kop met een SOF0-segment. */
export function makeJpeg(width: number, height: number) {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2); // segmentlengte
  sof[4] = 8; // precisie
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3; // componenten
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "latin1"),
    Buffer.alloc(9),
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
}

/**
 * Een EXIF-blok zoals een telefoon het meegeeft: oriëntatie plus GPS-breedte,
 * zodat een proef kan aantonen dat de locatiegegevens werkelijk verdwijnen.
 */
export function makeExif(orientation: number) {
  const tiff = Buffer.alloc(2 + 2 + 4 + 2 + 12 * 2 + 4 + 20);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(0x002a, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 begint hier
  tiff.writeUInt16LE(2, 8); // twee ingangen
  // 0x0112 oriëntatie, type SHORT, één waarde
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  // 0x8825 verwijst naar de GPS-IFD; de tekst eronder staat er als herkenbare
  // naald in de hooiberg, zodat een proef kan zoeken of hij nog voorkomt.
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(38, 28);
  tiff.writeUInt32LE(0, 32); // geen volgende IFD
  tiff.write("GPS 52.37,4.89 HUIS", 38, "latin1");
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
}

/** Dezelfde JPEG als `makeJpeg`, maar met een APP1-EXIF-segment ervoor. */
export function makeJpegWithExif(
  width: number,
  height: number,
  orientation = 1,
) {
  const exif = makeExif(orientation);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  const basis = makeJpeg(width, height);
  // Na de SOI en vóór de rest, zoals een camera het schrijft.
  return Buffer.concat([basis.subarray(0, 2), app1, exif, basis.subarray(2)]);
}

/** Een PNG met een tEXt-chunk en een eXIf-chunk erin. */
export function makePngWithMetadata(
  width: number,
  height: number,
  orientation = 1,
) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const basis = makePng(width, height);
  // Tussen de handtekening met IHDR en de rest.
  const na = 8 + 25; // handtekening + IHDR-chunk
  return Buffer.concat([
    basis.subarray(0, na),
    chunk("tEXt", Buffer.from("Author\0Jane HUIS", "latin1")),
    chunk("eXIf", makeExif(orientation).subarray(6)),
    basis.subarray(na),
  ]);
}
