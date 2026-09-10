import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve("work/browsers");
export default defineConfig({
  testDir: "tests/e2e",
  globalTeardown: "./scripts/e2e-teardown.ts",
  timeout: 45000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
    baseURL: "http://127.0.0.1:4320",
    // De app is Nederlands en rekent in Europe/Amsterdam; de tests draaien daarom
    // niet in de locale van de runner. Chromium tekent <input type="date"> wel in
    // zijn eigen UI-taal: in een container zonder Nederlands taalpakket staat er
    // op screenshots mm/dd/jjjj waar een Nederlandse browser dd-mm-jjjj toont.
    // Dat verschil zit in de testomgeving, niet in de app.
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    // Sommige omgevingen leveren een eigen Chromium op een vaste plek. Verwijs er
    // expliciet naar in plaats van een tweede browser te downloaden.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          },
        }
      : {}),
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `"${process.execPath}" "${resolve("node_modules/tsx/dist/cli.mjs")}" scripts/e2e-server.ts`,
    url: "http://127.0.0.1:4320",
    reuseExistingServer: false,
    timeout: 60000,
  },
  outputDir: "work/e2e-results",
});
