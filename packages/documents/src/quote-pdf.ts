import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { DomainError } from "../../domain/src/index";
let active = false;
export async function renderQuotePdf(html: string): Promise<Buffer> {
  if (active)
    throw new DomainError(
      "EXPORT_BUSY",
      "Er wordt al een PDF gemaakt. Probeer over een minuut opnieuw.",
      503,
    );
  if (Buffer.byteLength(html) > 12000000)
    throw new DomainError("EXPORT_LIMIT", "Het document is te groot.");
  active = true;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("work/browsers");
    browser = await chromium.launch({
      chromiumSandbox: true,
      timeout: 15000,
      ...(process.env.QUOTE_CHROMIUM_PATH
        ? { executablePath: process.env.QUOTE_CHROMIUM_PATH }
        : {}),
    });
    const work = async () => {
      const context = await browser!.newContext({
        javaScriptEnabled: false,
        serviceWorkers: "block",
      });
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 15000 });
      const pdf = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="width:100%;text-align:center;font:8px Arial;color:#657060"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      if (pdf.length > 20000000)
        throw new DomainError("EXPORT_LIMIT", "De PDF overschrijdt 20 MB.");
      return pdf;
    };
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new DomainError(
                "EXPORT_TIMEOUT",
                "PDF maken duurde te lang. Probeer opnieuw.",
                503,
              ),
            ),
          40000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await browser?.close();
    } finally {
      active = false;
    }
  }
}
