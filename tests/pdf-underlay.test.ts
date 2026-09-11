import { test, expect } from "vitest";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import {
  pdfPageCount,
  renderPdfPage,
  MAX_PAGE_SIDE_PX,
  type CanvasLike,
} from "../packages/image-import/src/pdf-page";
import { readImageHeader } from "../packages/image-import/src/index";
import { makePdf } from "./helpers/pdf";

/**
 * Een PDF mag nooit als PDF de editor in: dat is actieve inhoud. Hij wordt
 * eenmalig tot pixels gerekend en gaat daarna als gewone PNG dezelfde weg als
 * elke andere onderlegger. Deze proef rekent echte pagina's uit — in Node met
 * hetzelfde pdf.js dat de browser gebruikt — en toetst wat eruit komt.
 */
const canvasFor = (width: number, height: number): CanvasLike =>
  createCanvas(width, height) as unknown as CanvasLike;

const echt = (canvas: CanvasLike) => canvas as unknown as Canvas;
const png = (canvas: CanvasLike) => echt(canvas).toBuffer("image/png");

test("het aantal pagina's is te lezen zonder te renderen", async () => {
  expect(
    await pdfPageCount(
      makePdf([
        { widthPt: 200, heightPt: 100 },
        { widthPt: 200, heightPt: 100 },
        { widthPt: 200, heightPt: 100 },
      ]),
    ),
  ).toBe(3);
  expect(await pdfPageCount(makePdf([{ widthPt: 595, heightPt: 842 }]))).toBe(
    1,
  );
});

test("een pagina wordt een echte PNG met de juiste maten", async () => {
  const pdf = makePdf([{ widthPt: 200, heightPt: 100 }]);
  const { canvas, widthPx, heightPx } = await renderPdfPage(pdf, 1, canvasFor);
  // 2× de PDF-eenheid, zoals de module aanhoudt voor een lijntekening.
  expect([widthPx, heightPx]).toEqual([400, 200]);

  const bytes = png(canvas);
  // Het resultaat gaat door dezelfde keuring als elke andere onderlegger.
  expect(readImageHeader(bytes)).toEqual({
    mime: "image/png",
    widthPx: 400,
    heightPx: 200,
  });
  expect(bytes.length).toBeGreaterThan(100);
});

test("de gekozen pagina is werkelijk die pagina", async () => {
  // Twee pagina's met verschillende maten; dan is aan het resultaat te zien
  // welke er is gerekend, zonder naar pixels te hoeven kijken.
  const pdf = makePdf([
    { widthPt: 200, heightPt: 100 },
    { widthPt: 300, heightPt: 400 },
  ]);
  expect(await renderPdfPage(pdf, 1, canvasFor)).toMatchObject({
    widthPx: 400,
    heightPx: 200,
  });
  expect(await renderPdfPage(pdf, 2, canvasFor)).toMatchObject({
    widthPx: 600,
    heightPx: 800,
  });
});

test("een pagina die niet bestaat levert een uitlegbare melding", async () => {
  const pdf = makePdf([{ widthPt: 200, heightPt: 100 }]);
  await expect(renderPdfPage(pdf, 2, canvasFor)).rejects.toThrow(/1 pagina/);
  await expect(renderPdfPage(pdf, 0, canvasFor)).rejects.toThrow(/1 pagina/);
});

test("een groot plan wordt kleiner gerekend in plaats van geweigerd", async () => {
  // A0 liggend in punten; op 2× zou dat 6740 px breed worden.
  const { widthPx, heightPx } = await renderPdfPage(
    makePdf([{ widthPt: 3370, heightPt: 2384 }]),
    1,
    canvasFor,
  );
  expect(widthPx).toBeLessThanOrEqual(MAX_PAGE_SIDE_PX);
  expect(heightPx).toBeLessThanOrEqual(MAX_PAGE_SIDE_PX);
  // En niet zo klein dat er niets meer van te lezen valt.
  expect(Math.max(widthPx, heightPx)).toBeGreaterThan(MAX_PAGE_SIDE_PX / 2);
  // De verhouding blijft kloppen, anders klopt de kalibratie straks niet.
  expect(widthPx / heightPx).toBeCloseTo(3370 / 2384, 2);
});

test("waar niets staat is de onderlegger wit, niet doorzichtig", async () => {
  // Een doorzichtige PNG zou als zwart vlak onder de tekening komen te staan.
  const { canvas } = await renderPdfPage(
    makePdf([{ widthPt: 100, heightPt: 100 }]),
    1,
    canvasFor,
  );
  const context = echt(canvas).getContext("2d");
  const hoek = context.getImageData(2, 2, 1, 1).data;
  expect([hoek[0], hoek[1], hoek[2], hoek[3]]).toEqual([255, 255, 255, 255]);
  // En waar wél inhoud staat is het niet wit: er is werkelijk getekend. Het
  // vlak staat in PDF-eenheden op x 20-80 en y 20-60, vanaf linksónder; op een
  // canvas van 200×200 (2×) is dat x 40-160 en y 80-160 vanaf linksboven.
  const midden = context.getImageData(100, 120, 1, 1).data;
  expect(midden[0]).toBeLessThan(255);
});

test("een bestand dat geen PDF is wordt geweigerd", async () => {
  await expect(
    pdfPageCount(Buffer.from("dit is gewoon tekst")),
  ).rejects.toThrow();
});
