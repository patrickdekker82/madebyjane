import { resolve } from "node:path";

/**
 * Een SVG naar PNG, in hetzelfde geïsoleerde Chromium als de PDF.
 *
 * PowerPoint kan geen vector-planblad opnemen dat op ware schaal blijft, dus
 * gaat het als afbeelding mee. De PDF blijft het schaalvaste stuk; dat staat
 * ook op de dia zelf. De pagina krijgt geen netwerktoegang en de sandbox blijft
 * aan, precies zoals bij de PDF.
 */
export async function renderSvgPng(
  svg: string,
  widthMm: number,
  heightMm: number,
  pixelsPerMm = 4,
): Promise<Buffer> {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("work/browsers");
  const { chromium } = await import("@playwright/test");
  const width = Math.round(widthMm * pixelsPerMm),
    height = Math.round(heightMm * pixelsPerMm);
  if (width * height > 40_000_000)
    throw new Error("Deze afbeelding wordt te groot voor een dia.");
  const browser = await chromium.launch({
    chromiumSandbox: true,
    timeout: 15000,
    ...(process.env.QUOTE_CHROMIUM_PATH
      ? { executablePath: process.env.QUOTE_CHROMIUM_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block;width:${width}px;height:${height}px}</style></head><body>${svg}</body></html>`,
      { waitUntil: "load", timeout: 15000 },
    );
    return await page.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}
