import { test, expect } from "vitest";
import {
  readImageHeader,
  stripImageMetadata,
  orientationRotation,
  MIRRORED_ORIENTATIONS,
} from "../packages/image-import/src/index";
import {
  makePng,
  makeJpeg,
  makeJpegWithExif,
  makePngWithMetadata,
} from "./helpers/image";

/**
 * Een foto uit een telefoon draagt het adres van de klant mee. Deze proef legt
 * vast dat die gegevens verdwijnen vóór er iets wordt vastgelegd, en dat het
 * beeld zelf daarbij onaangeroerd blijft.
 */

test("EXIF met locatiegegevens verdwijnt uit een JPEG", () => {
  const vies = makeJpegWithExif(800, 600);
  // De naald zit er eerst werkelijk in; anders zou de proef niets bewijzen.
  expect(vies.includes(Buffer.from("HUIS"))).toBe(true);

  const schoon = stripImageMetadata(vies);
  expect(schoon.bytes.includes(Buffer.from("HUIS"))).toBe(false);
  expect(schoon.removed).toContain("exif");
  // Het beeld is hetzelfde gebleven: maten ongewijzigd, en byte voor byte
  // gelijk aan dezelfde JPEG zonder EXIF.
  expect(readImageHeader(schoon.bytes)).toEqual(readImageHeader(vies));
  expect(schoon.bytes.equals(makeJpeg(800, 600))).toBe(true);
});

test("tekst- en EXIF-chunks verdwijnen uit een PNG", () => {
  const vies = makePngWithMetadata(120, 90);
  expect(vies.includes(Buffer.from("HUIS"))).toBe(true);

  const schoon = stripImageMetadata(vies);
  expect(schoon.bytes.includes(Buffer.from("HUIS"))).toBe(false);
  expect(schoon.removed).toEqual(expect.arrayContaining(["tEXt", "eXIf"]));
  // De beelddata blijft ongemoeid: het resultaat is exact de kale PNG.
  expect(schoon.bytes.equals(makePng(120, 90))).toBe(true);
});

test("een bestand zonder metadata blijft byte voor byte hetzelfde", () => {
  for (const beeld of [makePng(40, 30), makeJpeg(640, 480)]) {
    const schoon = stripImageMetadata(beeld);
    expect(schoon.bytes.equals(beeld)).toBe(true);
    expect(schoon.removed).toEqual([]);
    expect(schoon.orientation).toBe(1);
  }
});

test("de oriëntatie wordt gelezen voordat de metadata verdwijnt", () => {
  // Zonder dit zou een staande foto na het opschonen liggend getoond worden.
  for (const [orientation, graden] of [
    [1, 0],
    [3, 180],
    [6, 90],
    [8, 270],
  ] as const) {
    expect(
      stripImageMetadata(makeJpegWithExif(800, 600, orientation)),
    ).toMatchObject({ orientation });
    expect(
      stripImageMetadata(makePngWithMetadata(80, 60, orientation)).orientation,
    ).toBe(orientation);
    expect(orientationRotation(orientation)).toBe(graden);
  }
});

test("gespiegelde oriëntaties zijn herkenbaar en geen draaiing", () => {
  for (const o of [2, 4, 5, 7]) {
    expect(MIRRORED_ORIENTATIONS.has(o)).toBe(true);
    // Ze zijn niet met draaien te herstellen; dat mag niet stilzwijgend gebeuren.
    expect(orientationRotation(o)).toBe(0);
  }
});

test("een misvormd of afgekapt bestand levert geen uitzondering op", () => {
  // Het opschonen mag nooit de reden zijn dat een upload klapt; weigeren doet
  // `readImageHeader` daarna, met een uitlegbare melding.
  const vies = makeJpegWithExif(800, 600);
  for (const lengte of [2, 5, 12, 30, vies.length - 3]) {
    const stuk = vies.subarray(0, lengte);
    expect(() => stripImageMetadata(stuk)).not.toThrow();
  }
  const png = makePngWithMetadata(60, 40);
  for (const lengte of [8, 20, 40, png.length - 5])
    expect(() => stripImageMetadata(png.subarray(0, lengte))).not.toThrow();
  // Een EXIF-blok met onzin erin levert gewoon oriëntatie 1 op.
  const rommel = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0c]),
    Buffer.from("Exif\0\0rommel", "latin1"),
    makeJpeg(10, 10).subarray(2),
  ]);
  expect(stripImageMetadata(rommel).orientation).toBe(1);
});
