import { makeGlb } from "../helpers/glb";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
let ownerCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
test("login → project → exacte bank → draaien → undo → herladen → SVG → 3D", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
  await page.goto("/");
  await page.getByLabel("E-mailadres").fill(credentials.email);
  await page
    .getByLabel("Wachtwoord", { exact: true })
    .fill(credentials.password);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ruimte voor het volgende." }),
  ).toBeVisible();
  ownerCookies = await page.context().cookies();
  await page.getByRole("button", { name: "Nieuw project" }).click();
  await page.getByLabel("Projectnaam").fill("Woonkamer aan het park");
  await page.getByLabel("Klantnaam").fill("Familie Voorbeeld");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Breedte", exact: true }),
  ).toHaveValue("2400");
  await page.getByRole("button", { name: "90° draaien" }).click();
  await expect(page.getByLabel("Rotatie", { exact: true })).toHaveValue("90");
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ongedaan maken", exact: true })
    .click();
  await expect(page.getByLabel("Rotatie", { exact: true })).toHaveValue("0");
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Positie X", { exact: true }).fill("2200");
  await page.getByRole("button", { name: "Toepassen" }).click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Herkende ruimtes" }),
  ).toContainText("29,04 m²");
  await page.screenshot({ path: "outputs/qa/ontwerp-desktop.png" });
  const sceneUrl = page.url();
  await page.reload();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await expect(page.getByLabel("Positie X", { exact: true })).toHaveValue(
    "2200",
  );
  await expect(
    page.getByRole("textbox", { name: "Breedte", exact: true }),
  ).toHaveValue("2400");
  // Reload resumes the same tab lease immediately, not after the 45 s expiry.
  await expect(
    page.getByRole("button", { name: "Toepassen", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Positie X", { exact: true }).fill("2300");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  // window.open copies sessionStorage: the local lock must reject a copied lease ID.
  const popupPromise = page.waitForEvent("popup");
  await page.evaluate(() => {
    window.open(location.href, "_blank");
  });
  const duplicate = await popupPromise;
  try {
    await duplicate
      .getByRole("button", { name: "Bank · linnen naturel", exact: true })
      .click();
    await expect(
      duplicate.getByText("Dit ontwerp is al geopend in een andere tab.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      duplicate.getByRole("button", { name: "Toepassen", exact: true }),
    ).toBeDisabled();
  } finally {
    await duplicate.close();
  }
  await page
    .getByRole("button", { name: "Ongedaan maken", exact: true })
    .click();
  await expect(page.getByLabel("Positie X", { exact: true })).toHaveValue(
    "2200",
  );
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Planblad SVG" }).click();
  const file = await download;
  await file.saveAs("outputs/ontwerpblad.svg");
  expect(await readFile("outputs/ontwerpblad.svg", "utf8")).toContain(
    'width="297mm"',
  );
  await page.getByRole("button", { name: "3D bekijken", exact: true }).click();
  await expect(page.locator(".viewer canvas")).toBeVisible();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-render-ready",
    "true",
  );
  await page.screenshot({ path: "outputs/qa/ontwerp-3d.png" });
  await page
    .getByRole("button", { name: "Terug naar projecten", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Woonkamer aan het park" }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/projecten-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "outputs/qa/projecten-telefoon.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(sceneUrl);
  await expect(page.locator(".canvas-wrap canvas").first()).toBeVisible();
  await page.screenshot({ path: "outputs/qa/ontwerp-tablet.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("collega uitnodigen → account → viewer kan alleen lezen", async ({
  page,
  browser,
}) => {
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await page.goto("/");
  await page.getByLabel("E-mailadres").fill(credentials.email);
  await page
    .getByLabel("Wachtwoord", { exact: true })
    .fill(credentials.password);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await page.getByRole("button", { name: "Toegang", exact: true }).click();
  await page.getByLabel("E-mailadres collega").fill("kijker@example.test");
  await page.getByLabel("Toegang", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Uitnodigingslink maken" }).click();
  const url = await page.getByLabel("Eenmalige uitnodigingslink").inputValue();
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await guest.goto(url);
    await guest.getByLabel("Je naam", { exact: true }).fill("Fictieve kijker");
    await guest.getByLabel("Kies een wachtwoord").fill(credentials.password);
    await guest.getByRole("button", { name: "Uitnodiging accepteren" }).click();
    await expect(
      guest.getByRole("heading", { name: "Welkom in de studio." }),
    ).toBeVisible();
    await guest.getByRole("link", { name: "Naar inloggen" }).click();
    await guest.getByLabel("E-mailadres").fill("kijker@example.test");
    await guest
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await guest.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(
      guest.getByRole("heading", { name: "Ruimte voor het volgende." }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Nieuw project" }),
    ).toHaveCount(0);
    await guest.getByRole("button", { name: "Toegang", exact: true }).click();
    await expect(
      guest.getByRole("heading", {
        name: "Toegang wordt door je beheerder geregeld",
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
test("belastingproef 500 objecten en 100 muren: rAF-frametijden tijdens pannen", async ({
  page,
}) => {
  await page.goto("/proef?belasting=1");
  await expect(
    page.getByRole("button", { name: "Testmeubel 500", exact: true }),
  ).toBeAttached();
  await expect(page.locator(".canvas-wrap canvas").first()).toBeVisible();
  await page.evaluate(() => {
    const win = window as unknown as {
      probeFrames: number[];
      probeRunning: boolean;
    };
    win.probeFrames = [];
    win.probeRunning = true;
    let last = performance.now();
    const tick = (now: number) => {
      win.probeFrames.push(now - last);
      last = now;
      if (win.probeRunning) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let n = 0; n < 25; n++) {
    await page
      .getByRole("button", {
        name: n % 2 ? "Beeld naar links" : "Beeld naar rechts",
        exact: true,
      })
      .click();
  }
  const frames = await page.evaluate(() => {
    const win = window as unknown as {
      probeFrames: number[];
      probeRunning: boolean;
    };
    win.probeRunning = false;
    return win.probeFrames.slice(2);
  });
  expect(frames.length).toBeGreaterThan(10);
  frames.sort((a, b) => a - b);
  const p = (fraction: number) =>
    frames[Math.min(frames.length - 1, Math.floor(frames.length * fraction))];
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    "work/performance.json",
    JSON.stringify(
      {
        objects: 500,
        walls: 100,
        samples: frames.length,
        medianFrameMs: p(0.5),
        p95FrameMs: p(0.95),
        maxFrameMs: p(1),
        browser: page.context().browser()?.version(),
        platform: process.platform,
        arch: process.arch,
        scope:
          "Headless Chromium rAF during 25 discrete canvas pan actions; not continuous drag latency or a reference-laptop certification.",
      },
      null,
      2,
    ),
  );
});

test("muur en raam op maat → ongeldige opening afgewezen → undo → herladen", async ({
  page,
}) => {
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  if (ownerCookies.length) {
    await page.context().addCookies(ownerCookies);
    await page.goto("/");
  } else {
    await page.goto("/");
    await page.getByLabel("E-mailadres").fill(credentials.email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Maatvaste structuur");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Muur 1", exact: true }).click();
  await page.getByLabel("Muurdikte", { exact: true }).fill("240");
  await page.getByLabel("Muurhoogte", { exact: true }).fill("3000");
  await page
    .getByRole("button", { name: "Maten toepassen", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Raam 1", exact: true }).click();
  await page.getByLabel("Openingsbreedte", { exact: true }).fill("1000");
  await page
    .getByRole("button", { name: "Maten toepassen", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Afstand vanaf muurbegin", { exact: true })
    .fill("99999");
  await page
    .getByRole("button", { name: "Maten toepassen", exact: true })
    .click();
  await expect(page.locator(".editor-message.error")).toBeVisible();
  await page
    .getByRole("button", { name: "Ongedaan maken", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Muur 1", exact: true }).click();
  await expect(page.getByLabel("Muurdikte", { exact: true })).toHaveValue(
    "240",
  );
  await expect(page.getByLabel("Muurhoogte", { exact: true })).toHaveValue(
    "3000",
  );
  await page.screenshot({ path: "outputs/qa/muurmaten.png" });
  await page
    .getByRole("button", { name: "Revisie bewaren", exact: true })
    .click();
  await expect(
    page.getByText("is onveranderlijk bewaard.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Muurdikte", { exact: true }).fill("320");
  await page
    .getByRole("button", { name: "Maten toepassen", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Versiegeschiedenis", exact: true })
    .click();
  await page.getByRole("button", { name: /Herstel revisie/ }).click();
  await page.screenshot({ path: "outputs/qa/versiegeschiedenis.png" });
  await page
    .getByRole("button", { name: "Deze versie herstellen", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Muurdikte", { exact: true })).toHaveValue(
    "240",
  );
  await page
    .getByRole("button", { name: "Versiegeschiedenis", exact: true })
    .click();
  await expect(
    page.getByText("Voor herstel · revisie", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  const originalUrl = page.url();
  await page
    .getByRole("button", { name: "Ontwerpvarianten", exact: true })
    .click();
  await page.getByLabel("Naam alternatief", { exact: true }).fill("Indeling B");
  await page
    .getByRole("button", { name: "Variant maken", exact: true })
    .click();
  await expect(page).not.toHaveURL(originalUrl);
  await expect(
    page.getByLabel("Huidige ontwerpvariant", { exact: true }),
  ).toHaveText("Indeling B");
  await page.getByRole("button", { name: "Muur 1", exact: true }).click();
  await page.getByLabel("Muurdikte", { exact: true }).fill("350");
  await page
    .getByRole("button", { name: "Maten toepassen", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ontwerpvarianten", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Basisontwerp", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/ontwerpvarianten.png" });
  await page.getByRole("button", { name: "Basisontwerp", exact: true }).click();
  await expect(page).toHaveURL(originalUrl);
  await page.getByRole("button", { name: "Muur 1", exact: true }).click();
  await expect(page.getByLabel("Muurdikte", { exact: true })).toHaveValue(
    "240",
  );
  await page
    .getByRole("button", { name: "Eigen bibliotheek", exact: true })
    .click();
  await page.getByText("3D-model controleren (GLB)", { exact: true }).click();
  const glbFile = page.getByLabel("GLB-bestand", { exact: true });
  await glbFile.setInputFiles({ name: "ongeldig.glb", mimeType: "model/gltf-binary", buffer: Buffer.from("geen glb") });
  await expect(page.getByRole("alert")).toContainText("geen volledig GLB");
  await glbFile.setInputFiles({ name: "eigen-testmodel.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(makeGlb()) });
  await expect(page.getByText("Model gecontroleerd · 4 driehoeken", { exact: true })).toBeVisible();
  await expect(page.getByText("Breedte 2000 mm · diepte 500 mm · hoogte 1000 mm", { exact: true })).toBeVisible();
  await page.getByLabel("GLB 3D-preview", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel("GLB 3D-preview", { exact: true }).locator("canvas")).toBeVisible();
  await expect(page.getByLabel("GLB 3D-preview", { exact: true })).toHaveAttribute("data-render-ready", "true");
  await page.screenshot({ path: "outputs/qa/glb-controle.png" });
  await glbFile.setInputFiles({ name: "externe-bron.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(makeGlb(j => { j.buffers[0].uri = "https://example.invalid/model.bin"; })) });
  await expect(page.getByRole("alert")).toContainText("Externe bronnen");
  await expect(page.getByLabel("GLB 3D-preview", { exact: true })).toHaveCount(0);
  await glbFile.setInputFiles({ name: "eigen-testmodel.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(makeGlb()) });
  await expect(page.getByText("Model gecontroleerd · 4 driehoeken", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Model bewaren en meubel maken", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Maten en oriëntatie gecontroleerd", exact: true }).check();
  await page.getByRole("button", { name: "Model bewaren en meubel maken", exact: true }).click();
  await expect(page.getByText("Eigen 3D-model gekoppeld.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Bibliotheekbreedte", { exact: true })).toHaveValue("2000");
  await page.getByLabel("Bibliotheeknaam", { exact: true }).fill("GLB proefmeubel");
  await page.getByRole("button", { name: "Versie bewaren", exact: true }).click();
  await page.getByRole("button", { name: "Plaats GLB proefmeubel", exact: true }).click();
  await expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "3D bekijken", exact: true }).click();
  await expect(page.getByText("Eigen 3D-modellen geladen", { exact: false })).toBeVisible();
  await expect(page.locator(".viewer")).toHaveAttribute("data-render-ready", "true");
  await page.screenshot({ path: "outputs/qa/glb-opgeslagen-3d.png" });
  await page.getByRole("button", { name: "Plattegrond", exact: true }).click();
  await page.getByRole("button", { name: "Eigen bibliotheek", exact: true }).click();
  await page.getByRole("button", { name: "Nieuwe versie van GLB proefmeubel", exact: true }).click();
  await expect(page.getByText("Eigen 3D-model gekoppeld.", { exact: false })).toBeVisible();
  await page.getByLabel("Bibliotheekbreedte", { exact: true }).fill("2200");
  await page.getByRole("button", { name: "Versie bewaren", exact: true }).click();
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "GLB proefmeubel", exact: true }).click();
  await expect(page.getByLabel("Breedte", { exact: true })).toHaveValue("2000");
  await page.getByRole("button", { name: "Eigen bibliotheek", exact: true }).click();
  await page
    .getByRole("button", { name: "Bibliotheekitem maken", exact: true })
    .click();
  await page.getByLabel("Bibliotheeknaam", { exact: true }).fill("Atelierbank");
  await page.getByLabel("Item categorie", { exact: true }).fill("Zitmeubels");
  await page.getByLabel("Item leverancier", { exact: true }).fill("Werkplaats Noord");
  await page.getByLabel("Item artikelnummer", { exact: true }).fill("BANK-01");
  await page.getByLabel("Item zoektermen", { exact: true }).fill("linnen, naturel");
  await page.getByLabel("Bibliotheekbreedte", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Versie bewaren", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("geldige maten");
  await page.getByLabel("Bibliotheekbreedte", { exact: true }).fill("2400");
  await page
    .getByRole("button", { name: "Rechthoek toevoegen", exact: true })
    .click();
  await page.getByLabel("Symbool width", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "Vorm toepassen", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Eigen 2D-symbool" }).getByRole("alert"),
  ).toContainText("Houd vormen binnen");
  await page.getByLabel("Symbool width", { exact: true }).fill("70");
  await page
    .getByRole("button", { name: "Vorm toepassen", exact: true })
    .click();
  await expect(page.getByRole("img", { name: "Symboolvoorbeeld" }).locator("rect").nth(1)).toHaveAttribute("width", "1680");
  await page
    .getByRole("button", { name: "Ellips toevoegen", exact: true })
    .click();
  await page.getByLabel("Symbool width", { exact: true }).fill("30");
  await page.getByLabel("Symbool height", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Vorm toepassen", exact: true })
    .click();
  await expect(page.getByRole("img", { name: "Symboolvoorbeeld" }).locator("ellipse")).toHaveAttribute("rx", "360");
  await page
    .getByRole("button", { name: "Lijn toevoegen", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Versie bewaren", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Plaats Atelierbank", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Breedte", { exact: true })).toHaveValue("2400");
  await page
    .getByRole("button", { name: "Eigen bibliotheek", exact: true })
    .click();
  await page.getByLabel("Bibliotheek zoeken", { exact: true }).fill("onvindbaar");
  await page.getByRole("button", { name: "Zoeken in bibliotheek", exact: true }).click();
  await expect(page.getByText("Geen items gevonden voor deze zoekopdracht.")).toBeVisible();
  await page.getByLabel("Bibliotheek zoeken", { exact: true }).fill("LINNEN");
  await page.getByLabel("Bibliotheekcategorie filter", { exact: true }).fill("zitmeubels");
  await page.getByRole("button", { name: "Zoeken in bibliotheek", exact: true }).click();
  await expect(page.getByText("Zitmeubels · Werkplaats Noord · BANK-01")).toBeVisible();
  await page.screenshot({ path: "outputs/qa/bibliotheek-zoeken.png" });
  await page
    .getByRole("button", { name: "Nieuwe versie van Atelierbank", exact: true })
    .click();
  await expect(page.getByLabel("Item artikelnummer", { exact: true })).toHaveValue("BANK-01");
  await page.getByRole("button", { name: "Terug naar bibliotheek", exact: true }).click();
  await expect(page.getByLabel("Bibliotheek zoeken", { exact: true })).toHaveValue("LINNEN");
  await expect(page.getByLabel("Bibliotheekcategorie filter", { exact: true })).toHaveValue("zitmeubels");
  await page.getByRole("button", { name: "Nieuwe versie van Atelierbank", exact: true }).click();
  await page.getByLabel("Bibliotheekbreedte", { exact: true }).fill("3000");
  await page
    .getByRole("img", { name: "Symboolvoorbeeld", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "outputs/qa/symboleneditor.png" });
  await page
    .getByRole("button", { name: "Versie bewaren", exact: true })
    .click();
  await expect(
    page.getByText("3000 × 950 × 780 mm · versie 2", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/meubelbibliotheek.png" });
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Atelierbank", exact: true }).click();
  await expect(page.getByLabel("Breedte", { exact: true })).toHaveValue("2400");
  await expect(
    page.getByText("Bibliotheek · versie 1.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Opgeslagen productgegevens")).toContainText("Artikelnummer: BANK-01");
  const symbolDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Planblad SVG", exact: true }).click();
  await (await symbolDownload).saveAs("outputs/symbool-planblad.svg");
  const symbolSvg = await readFile("outputs/symbool-planblad.svg", "utf8");
  expect(symbolSvg).toContain('width="1680" height="760"');
  expect(symbolSvg).toContain('rx="360" ry="237.5"');
});
test("materiaalkeuzes → onderbouwde hoeveelheid → interne keuze → vastgelegd klantakkoord", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const credentials = JSON.parse(await readFile("work/e2e-credentials.json", "utf8"));
  if (ownerCookies.length) { await page.context().addCookies(ownerCookies); await page.goto("/"); }
  else {
    await page.goto("/"); await page.getByLabel("E-mailadres").fill(credentials.email);
    await page.getByLabel("Wachtwoord", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  }
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Materiaalstudio");
  await page.getByRole("button", { name: "Project aanmaken", exact: true }).click();
  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await page.getByRole("button", { name: "Materiaal toevoegen", exact: true }).click();
  await page.getByLabel("Materiaal name", { exact: true }).fill("Eiken vloer · naturel");
  await page.getByLabel("Materiaal room", { exact: true }).fill("Woonkamer");
  await page.getByLabel("Materiaal supplier", { exact: true }).fill("Fictieve vloermaker");
  await page.getByLabel("Materiaal sku", { exact: true }).fill("VLOER-01");
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();
  await expect(page.getByText("Hoeveelheid onbekend", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Wijzig Eiken vloer · naturel", exact: true }).click();
  await page.getByLabel("Materiaal hoeveelheid", { exact: true }).fill("31,5");
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Onderbouw de handmatig ingevoerde hoeveelheid");
  await page.getByLabel("Materiaal onderbouwing", { exact: true }).fill("Ingemeten leverancier: 29,04 m² plus snijverlies.");
  await page.getByLabel("Materiaal status", { exact: true }).selectOption("chosen");
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();
  await expect(page.getByText("31,5 m² · handmatig", { exact: false })).toBeVisible();
  await expect(page.getByText("Klantakkoord handmatig vastgelegd", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Wijzig Eiken vloer · naturel", exact: true }).click();
  await page.getByLabel("Materiaal status", { exact: true }).selectOption("client_confirmed");
  await page.getByLabel("Datum klantakkoord", { exact: true }).fill("2026-09-07");
  await page.getByLabel("Bron klantakkoord", { exact: true }).fill("Fictieve klant bevestigde per e-mail, onderwerp vloerkeuze.");
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await expect(page.getByText("Klantakkoord handmatig vastgelegd op 2026-09-07:", { exact: false })).toBeVisible();
  await page.getByLabel("Materialen zoeken", { exact: true }).fill("onvindbaar");
  await expect(page.getByText("Geen passende materiaalkeuzes.", { exact: true })).toBeVisible();
  await page.getByLabel("Materialen zoeken", { exact: true }).fill("vloer-01");
  await expect(page.getByRole("heading", { name: "Eiken vloer · naturel", exact: true })).toBeVisible();
  await page.screenshot({ path: "outputs/qa/materiaalkeuzes.png" });
  expect(errors).toEqual([]);
});
