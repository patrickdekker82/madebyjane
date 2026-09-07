import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { demoScene } from "../packages/test-fixtures/src/index";
import { planSvg } from "../packages/documents/src/plan";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("work/browsers");
const { chromium } = await import("@playwright/test");
await mkdir("outputs", { recursive: true });
const scene = demoScene(
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
);
const svg = planSvg(scene, 50);
await writeFile("outputs/schaalproef.svg", svg);
const browser = await chromium.launch({ chromiumSandbox: true });
const start = performance.now();
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>@page{size:297mm 210mm;margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${svg}</body></html>`,
    { waitUntil: "load" },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: "outputs/schaalproef-1-50.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await writeFile(
    "work/pdf-metrics.json",
    JSON.stringify(
      {
        browser: browser.version(),
        platform: process.platform,
        arch: process.arch,
        durationMs: Math.round(performance.now() - start),
        scale: 50,
        referenceMm: 5000,
        expectedPrintedMm: 100,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
