import { test, expect } from "vitest";
import { readImageHeader } from "../packages/image-import/src/index";
import { makePng, makeJpeg } from "./helpers/image";

test("PNG- en JPEG-maten komen uit de bestandskop", () => {
  expect(readImageHeader(makePng(1240, 874))).toEqual({
    mime: "image/png",
    widthPx: 1240,
    heightPx: 874,
  });
  expect(readImageHeader(makeJpeg(800, 600))).toEqual({
    mime: "image/jpeg",
    widthPx: 800,
    heightPx: 600,
  });
});

test("actieve inhoud en onbekende typen worden geweigerd", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  expect(() => readImageHeader(svg)).toThrow(/PNG- of JPEG/);
  expect(() => readImageHeader(Buffer.from("%PDF-1.7\n"))).toThrow(/PNG- of JPEG/);
  expect(() => readImageHeader(Buffer.from("GIF89a"))).toThrow(/PNG- of JPEG/);
  expect(() => readImageHeader(Buffer.alloc(0))).toThrow(/PNG- of JPEG/);
});

test("een afgekapt of misvormd bestand strandt met een leesbare fout", () => {
  const png = makePng(100, 100);
  expect(() => readImageHeader(png.subarray(0, 20))).toThrow(/onvolledig/);
  const broken = Buffer.from(png);
  broken.write("IHDX", 12, "latin1");
  expect(() => readImageHeader(broken)).toThrow(/geldige kop/);
  // Een JPEG die alleen uit de handtekening bestaat heeft geen maatsegment.
  expect(() => readImageHeader(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toThrow(
    /geldige kop/,
  );
});

test("onmogelijke maten worden geweigerd", () => {
  expect(() => readImageHeader(makePng(0, 100))).toThrow(/pixels per zijde/);
  const huge = makePng(1, 1);
  huge.writeUInt32BE(20001, 16);
  expect(() => readImageHeader(huge)).toThrow(/pixels per zijde/);
});

test("een JPEG met vulbytes en meerdere segmenten wordt gelezen", () => {
  const base = makeJpeg(640, 480);
  // Extra vulbytes tussen de segmenten, zoals scanners die produceren.
  const padded = Buffer.concat([
    base.subarray(0, 2),
    Buffer.from([0xff, 0xff]),
    base.subarray(2),
  ]);
  expect(readImageHeader(padded).widthPx).toBe(640);
});
