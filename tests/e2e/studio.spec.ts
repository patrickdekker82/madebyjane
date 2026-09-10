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
  await glbFile.setInputFiles({
    name: "ongeldig.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from("geen glb"),
  });
  await expect(page.getByRole("alert")).toContainText("geen volledig GLB");
  await glbFile.setInputFiles({
    name: "eigen-testmodel.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(makeGlb()),
  });
  await expect(
    page.getByText("Model gecontroleerd · 4 driehoeken", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Breedte 2000 mm · diepte 500 mm · hoogte 1000 mm", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("GLB 3D-preview", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByLabel("GLB 3D-preview", { exact: true }).locator("canvas"),
  ).toBeVisible();
  await expect(
    page.getByLabel("GLB 3D-preview", { exact: true }),
  ).toHaveAttribute("data-render-ready", "true");
  await page.screenshot({ path: "outputs/qa/glb-controle.png" });
  await glbFile.setInputFiles({
    name: "externe-bron.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(
      makeGlb((j) => {
        j.buffers[0].uri = "https://example.invalid/model.bin";
      }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("Externe bronnen");
  await expect(page.getByLabel("GLB 3D-preview", { exact: true })).toHaveCount(
    0,
  );
  await glbFile.setInputFiles({
    name: "eigen-testmodel.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(makeGlb()),
  });
  await expect(
    page.getByText("Model gecontroleerd · 4 driehoeken", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Model bewaren en meubel maken",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Maten en oriëntatie gecontroleerd",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Model bewaren en meubel maken", exact: true })
    .click();
  await expect(
    page.getByText("Eigen 3D-model gekoppeld.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Bibliotheekbreedte", { exact: true }),
  ).toHaveValue("2000");
  await page
    .getByLabel("Bibliotheeknaam", { exact: true })
    .fill("GLB proefmeubel");
  await page
    .getByRole("button", { name: "Versie bewaren", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Plaats GLB proefmeubel", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "3D bekijken", exact: true }).click();
  await expect(
    page.getByText("Eigen 3D-modellen geladen", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-render-ready",
    "true",
  );
  await page.screenshot({ path: "outputs/qa/glb-opgeslagen-3d.png" });
  await page.getByRole("button", { name: "Plattegrond", exact: true }).click();
  await page
    .getByRole("button", { name: "Eigen bibliotheek", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Nieuwe versie van GLB proefmeubel",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Eigen 3D-model gekoppeld.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Bibliotheekbreedte", { exact: true }).fill("2200");
  await page
    .getByRole("button", { name: "Versie bewaren", exact: true })
    .click();
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "GLB proefmeubel", exact: true })
    .click();
  await expect(page.getByLabel("Breedte", { exact: true })).toHaveValue("2000");
  await page
    .getByRole("button", { name: "Eigen bibliotheek", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bibliotheekitem maken", exact: true })
    .click();
  await page.getByLabel("Bibliotheeknaam", { exact: true }).fill("Atelierbank");
  await page.getByLabel("Item categorie", { exact: true }).fill("Zitmeubels");
  await page
    .getByLabel("Item leverancier", { exact: true })
    .fill("Werkplaats Noord");
  await page.getByLabel("Item artikelnummer", { exact: true }).fill("BANK-01");
  await page
    .getByLabel("Item zoektermen", { exact: true })
    .fill("linnen, naturel");
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
  await expect(
    page.getByRole("img", { name: "Symboolvoorbeeld" }).locator("rect").nth(1),
  ).toHaveAttribute("width", "1680");
  await page
    .getByRole("button", { name: "Ellips toevoegen", exact: true })
    .click();
  await page.getByLabel("Symbool width", { exact: true }).fill("30");
  await page.getByLabel("Symbool height", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Vorm toepassen", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Symboolvoorbeeld" }).locator("ellipse"),
  ).toHaveAttribute("rx", "360");
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
  await page
    .getByLabel("Bibliotheek zoeken", { exact: true })
    .fill("onvindbaar");
  await page
    .getByRole("button", { name: "Zoeken in bibliotheek", exact: true })
    .click();
  await expect(
    page.getByText("Geen items gevonden voor deze zoekopdracht."),
  ).toBeVisible();
  await page.getByLabel("Bibliotheek zoeken", { exact: true }).fill("LINNEN");
  await page
    .getByLabel("Bibliotheekcategorie filter", { exact: true })
    .fill("zitmeubels");
  await page
    .getByRole("button", { name: "Zoeken in bibliotheek", exact: true })
    .click();
  await expect(
    page.getByText("Zitmeubels · Werkplaats Noord · BANK-01"),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/bibliotheek-zoeken.png" });
  await page
    .getByRole("button", { name: "Nieuwe versie van Atelierbank", exact: true })
    .click();
  await expect(
    page.getByLabel("Item artikelnummer", { exact: true }),
  ).toHaveValue("BANK-01");
  await page
    .getByRole("button", { name: "Terug naar bibliotheek", exact: true })
    .click();
  await expect(
    page.getByLabel("Bibliotheek zoeken", { exact: true }),
  ).toHaveValue("LINNEN");
  await expect(
    page.getByLabel("Bibliotheekcategorie filter", { exact: true }),
  ).toHaveValue("zitmeubels");
  await page
    .getByRole("button", { name: "Nieuwe versie van Atelierbank", exact: true })
    .click();
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
  await expect(page.getByLabel("Opgeslagen productgegevens")).toContainText(
    "Artikelnummer: BANK-01",
  );
  const symbolDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Planblad SVG", exact: true }).click();
  await (await symbolDownload).saveAs("outputs/symbool-planblad.svg");
  const symbolSvg = await readFile("outputs/symbool-planblad.svg", "utf8");
  expect(symbolSvg).toContain('width="1680" height="760"');
  expect(symbolSvg).toContain('rx="360" ry="237.5"');
});
test("materiaalkeuzes → onderbouwde hoeveelheid → interne keuze → vastgelegd klantakkoord", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  await page.getByLabel("Projectnaam").fill("Materiaalstudio");
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Materiaalkeuzes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Materiaal toevoegen", exact: true })
    .click();
  await page
    .getByLabel("Materiaal name", { exact: true })
    .fill("Eiken vloer · naturel");
  await page.getByLabel("Materiaal room", { exact: true }).fill("Woonkamer");
  await page
    .getByLabel("Materiaal supplier", { exact: true })
    .fill("Fictieve vloermaker");
  await page.getByLabel("Materiaal sku", { exact: true }).fill("VLOER-01");
  await page
    .getByLabel("Materiaal collection", { exact: true })
    .fill("Rustiek Eiken");
  await page.getByLabel("Materiaal colorCode", { exact: true }).fill("N-204");
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();
  await expect(
    page.getByText("Hoeveelheid onbekend", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wijzig Eiken vloer · naturel", exact: true })
    .click();
  await page.getByLabel("Materiaal hoeveelheid", { exact: true }).fill("31,5");
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Onderbouw de handmatig ingevoerde hoeveelheid",
  );
  await page
    .getByLabel("Materiaal onderbouwing", { exact: true })
    .fill("Ingemeten leverancier: 29,04 m² plus snijverlies.");
  await page
    .getByLabel("Materiaal status", { exact: true })
    .selectOption("chosen");
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();
  await expect(
    page.getByText("31,5 m² · handmatig", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Klantakkoord handmatig vastgelegd", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Wijzig Eiken vloer · naturel", exact: true })
    .click();
  await page
    .getByLabel("Materiaal status", { exact: true })
    .selectOption("client_confirmed");
  await page
    .getByLabel("Datum klantakkoord", { exact: true })
    .fill("2026-09-07");
  await page
    .getByLabel("Bron klantakkoord", { exact: true })
    .fill("Fictieve klant bevestigde per e-mail, onderwerp vloerkeuze.");
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Materiaalkeuzes", exact: true })
    .click();
  await expect(
    page.getByText("Klantakkoord handmatig vastgelegd op 2026-09-07:", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Materialen zoeken", { exact: true })
    .fill("onvindbaar");
  await expect(
    page.getByText("Geen passende materiaalkeuzes.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Materialen zoeken", { exact: true }).fill("vloer-01");
  await expect(
    page.getByRole("heading", { name: "Eiken vloer · naturel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Collectie: Rustiek Eiken · Kleurcode: N-204", {
      exact: true,
    }),
  ).toBeVisible();
  for (const query of ["rustiek", "n-204"]) {
    await page.getByLabel("Materialen zoeken", { exact: true }).fill(query);
    await expect(
      page.getByRole("heading", { name: "Eiken vloer · naturel", exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({ path: "outputs/qa/materiaalkeuzes.png" });
  expect(errors).toEqual([]);
});
test("berekende hoeveelheid uit het ontwerp → ontwerp wijzigen → veroudering → herberekenen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const credentials = JSON.parse(await readFile("work/e2e-credentials.json", "utf8"));
  await mkdir("outputs/qa", { recursive: true });
  if (ownerCookies.length) { await page.context().addCookies(ownerCookies); await page.goto("/"); }
  else {
    await page.goto("/"); await page.getByLabel("E-mailadres").fill(credentials.email);
    await page.getByLabel("Wachtwoord", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  }
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Hoeveelhedenstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page.getByRole("button", { name: "Project aanmaken", exact: true }).click();
  await expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await page.getByRole("button", { name: "Materiaal toevoegen", exact: true }).click();
  await page.getByLabel("Materiaal name", { exact: true }).fill("Eiken vloerdelen");
  await page.getByLabel("Bereken uit ontwerp", { exact: true }).check();
  await expect(page.getByLabel("Bronruimte", { exact: true })).toHaveValue(/.+/);
  await page.getByLabel("Bestelstap", { exact: true }).fill("0,5");
  await expect(page.getByLabel("Bestelstap", { exact: true })).toHaveValue("0,5");
  // 29,04 m² bruto langs de hartlijnen; 27,154275 m² netto binnen muren van 180 mm.
  await expect(page.getByRole("status")).toContainText("Netto 27,154 m² + snijverlies 2,715 m² = bruto 29,869 m²");
  await expect(page.getByRole("status")).toContainText("Bestelhoeveelheid 30 m² uit ontwerpversie 0");
  await page.screenshot({ path: "outputs/qa/hoeveelheid-berekenen.png" });
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();
  await expect(page.getByText("30 m² · berekend uit het ontwerp", { exact: false })).toBeVisible();
  await expect(page.getByText("Netto vloeroppervlak · netto 27,154 m² + 10% snijverlies · bestelstap 0,5 m² = 30 m² · ontwerpversie 0", { exact: false })).toBeVisible();
  await page.screenshot({ path: "outputs/qa/berekende-hoeveelheden.png" });
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();

  await page.getByRole("button", { name: "Muur 1", exact: true }).click();
  await page.getByLabel("Muurdikte", { exact: true }).fill("400");
  await page.getByRole("button", { name: "Maten toepassen", exact: true }).click();
  await expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await expect(page.getByText("Verouderd: het ontwerp (versie 1) geeft nu", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Herbereken Eiken vloerdelen", exact: true }).click();
  await expect(page.getByText("· ontwerpversie 1", { exact: false })).toBeVisible();
  await expect(page.getByText("Verouderd", { exact: false })).toHaveCount(0);
  await expect(page.getByText("30 m² · berekend uit het ontwerp", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await expect(page.getByText("· ontwerpversie 1", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
test("alternatief met prijsbron vastleggen → kiezen → herkomst en indicatiebedrag zichtbaar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const credentials = JSON.parse(await readFile("work/e2e-credentials.json", "utf8"));
  await mkdir("outputs/qa", { recursive: true });
  if (ownerCookies.length) { await page.context().addCookies(ownerCookies); await page.goto("/"); }
  else {
    await page.goto("/"); await page.getByLabel("E-mailadres").fill(credentials.email);
    await page.getByLabel("Wachtwoord", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  }
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Alternatievenstudio");
  await page.getByRole("button", { name: "Project aanmaken", exact: true }).click();
  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await page.getByRole("button", { name: "Materiaal toevoegen", exact: true }).click();
  await page.getByLabel("Materiaal name", { exact: true }).fill("Eiken vloer · naturel");
  await page.getByLabel("Materiaal supplier", { exact: true }).fill("Fictieve vloermaker");
  await page.getByLabel("Materiaal sku", { exact: true }).fill("V-01");
  await page.getByLabel("Materiaal hoeveelheid", { exact: true }).fill("30");
  await page.getByLabel("Materiaal onderbouwing", { exact: true }).fill("Ingemeten door de leverancier.");
  await page.getByLabel("Eenheidsprijs", { exact: true }).fill("74,95");

  // Een prijs zonder bron en datum wordt geweigerd.
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Noteer bij een prijs ook de bron en de prijsdatum");
  await page.getByLabel("Prijsbron", { exact: true }).fill("Prijslijst 2026");
  await page.getByLabel("Prijsdatum", { exact: true }).fill("2026-08-20");
  await page.getByLabel("Monsterstatus", { exact: true }).selectOption("received");
  await page.getByLabel("Monsterdatum", { exact: true }).fill("2026-08-28");
  await page.getByRole("button", { name: "Alternatief toevoegen", exact: true }).click();
  await page.getByLabel("Alternatief 1 naam", { exact: true }).fill("Es geborsteld");
  await page.getByLabel("Alternatief 1 leverancier", { exact: true }).fill("Andere vloermaker");
  await page.getByLabel("Alternatief 1 artikelnummer", { exact: true }).fill("V-02");
  await page.getByLabel("Alternatief 1 prijsbron", { exact: true }).fill("Offerte 2026-114");
  await page.getByLabel("Alternatief 1 prijsdatum", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Alternatief 1 eenheidsprijs", { exact: true }).fill("68,50");
  await page.screenshot({ path: "outputs/qa/alternatief-invoeren.png" });
  await page.getByRole("button", { name: "Materiaal bewaren", exact: true }).click();

  await expect(page.getByText("€ 74,95 per m² · bron: Prijslijst 2026 · prijsdatum 2026-08-20", { exact: false })).toBeVisible();
  await expect(page.getByText("indicatie € 2.248,50 bij 30 m²", { exact: false })).toBeVisible();
  await expect(page.getByText("Monster ontvangen op 2026-08-28", { exact: true })).toBeVisible();
  await expect(page.getByText("Het zijn geen offerteregels", { exact: false })).toBeVisible();
  await expect(page.getByText("Es geborsteld · Andere vloermaker · V-02 · € 68,50 per m² (Offerte 2026-114, 2026-09-01)", { exact: true })).toBeVisible();
  await page.screenshot({ path: "outputs/qa/alternatieven.png" });

  await page.getByRole("button", { name: "Kies Es geborsteld", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Es geborsteld", exact: true })).toBeVisible();
  await expect(page.getByText("Gekozen uit het alternatief “Es geborsteld”.", { exact: true })).toBeVisible();
  await expect(page.getByText("indicatie € 2.055,00 bij 30 m²", { exact: false })).toBeVisible();
  await expect(page.getByText("Eiken vloer · naturel · Fictieve vloermaker · V-01", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Materiaalkeuzes", exact: true }).click();
  await expect(page.getByText("Versie 2 ·", { exact: false })).toBeVisible();
  await page.getByLabel("Materialen zoeken", { exact: true }).fill("v-01");
  await expect(page.getByRole("heading", { name: "Es geborsteld", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("offerteconcept, decimalen, finalisatie en vaste prijzen na herladen", async ({
  page,
}) => {
  await page.context().addCookies(ownerCookies);
  await page.goto("/");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  await page.getByLabel("Projectnaam").fill("Offerte woonkamer");
  await page.getByLabel("Klantnaam").fill("Familie Voorbeeld");
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  await page.getByRole("button", { name: "Offertes", exact: true }).click();
  await page.getByRole("button", { name: "Nieuw offerteconcept" }).click();
  await page
    .getByLabel("Klant / bedrijf en adres")
    .fill("Familie Voorbeeld\nVoorbeeldstraat 1");
  await page.getByRole("button", { name: "Handmatige post toevoegen" }).click();
  await page
    .getByLabel("Omschrijving post 1", { exact: true })
    .fill("Eiken vloer");
  await page.getByLabel("Hoeveelheid post 1", { exact: true }).fill("2,5");
  await page
    .getByLabel("Eenheidsprijs EUR post 1", { exact: true })
    .fill("19,995");
  await page.getByLabel("Korting % post 1", { exact: true }).fill("10");
  await expect(
    page.getByRole("heading", { name: "Totaal: 54,44 €" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Concept bewaren", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Concept zonder offertenummer · versie 1",
    }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Definitief maken", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /20\d{2}-\d{5} · versie 2/ }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Eenheidsprijs EUR post 1", { exact: true }),
  ).toBeDisabled();
  await mkdir("outputs/qa", { recursive: true });
  await page.screenshot({
    path: "outputs/qa/offerte-definitief.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Offertes", exact: true }).click();
  await expect(
    page.getByText("Definitief · niet door de app verzonden", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open offerte", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Totaal: 54,44 €" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Eenheidsprijs EUR post 1", { exact: true }),
  ).toHaveValue("19.995");
});

test("vangen op het raster en op een ander meubel → passend in beeld → vangen uitschakelen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Vangstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();

  // Passend in beeld geeft een deterministische uitgangspositie. De omrekening
  // van wereld naar scherm meten we daarna zelf op, zodat deze test niet op de
  // fit-formule van de editor leunt.
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const box = (await canvas.boundingBox())!;
  const guess = Math.min((box.width - 120) / 6200, (box.height - 120) / 4800);
  const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
    await page.mouse.up();
  };
  const position = async () => ({
    x: Number(await page.getByLabel("Positie X", { exact: true }).inputValue()),
    y: Number(await page.getByLabel("Positie Y", { exact: true }).inputValue()),
  });
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();

  // Kalibreren met alle vangen uit: een sleep van 120 px levert de schaal.
  await page.getByRole("button", { name: "Raster snap · 100 mm", exact: true }).click();
  await page.getByRole("button", { name: "Vangen aan objecten", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vangen uit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  const before = await position();
  await drag({ x: box.x + 60 + 1700 * guess, y: box.y + 60 + 3300 * guess }, 120, 0);
  await saved();
  const calibrated = await position();
  // Zonder deze verplaatsing heeft de sleep de bank niet geraakt en zegt de rest niets.
  expect(Math.abs(calibrated.x - before.x)).toBeGreaterThan(200);
  expect(calibrated.y).toBe(before.y);
  const mmPerPixel = (calibrated.x - before.x) / 120;
  const anchor = { x: box.x + 60 + 1700 * guess + 120, y: box.y + 60 + 3300 * guess };
  const at = (x: number, y: number) => ({
    x: anchor.x + (x - calibrated.x) / mmPerPixel,
    y: anchor.y + (y - calibrated.y) / mmPerPixel,
  });

  // Na de kalibratiesleep ligt de muisaanwijzer gegarandeerd binnen de bank.
  // Dat punt is daarmee een betrouwbaar grijppunt; het schuift mee met elke sleep.
  let grip = { ...anchor };
  const dragSofa = async (dx: number, dy: number) => {
    await drag(grip, dx, dy);
    grip = { x: grip.x + dx, y: grip.y + dy };
    await saved();
    return position();
  };

  // Raster aan: elke sleep eindigt op hele honderdtallen.
  await page.getByRole("button", { name: "Vrij plaatsen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Raster snap · 100 mm", exact: true })).toBeVisible();
  const sofa = await dragSofa(41, 27);
  expect(sofa.x % 100).toBe(0);
  expect(sofa.y % 100).toBe(0);
  expect(sofa.x).not.toBe(calibrated.x);

  // Raster uit, vangen aan objecten aan: alleen uitlijnen op de salontafel blijft over.
  await page.getByRole("button", { name: "Raster snap · 100 mm", exact: true }).click();
  await page.getByRole("button", { name: "Vangen uit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vangen aan objecten", exact: true })).toBeVisible();
  // Alles in schermpixels uitdrukken: Konva start pas een sleep vanaf 3 pixels
  // en de vangtolerantie is 12 pixels. Een doel op 10 pixels met een sleep van
  // 8 pixels ligt dus altijd binnen bereik, bij elke zoomstand.
  const target = sofa.x + Math.round(10 * mmPerPixel);
  await page.getByRole("button", { name: "Salontafel · eiken", exact: true }).click();
  await page.getByLabel("Positie X", { exact: true }).fill(String(target));
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  expect((await position()).x).toBe(target);

  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  // Halverwege de sleep vasthouden om de hulplijnen daadwerkelijk te zien.
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 4, grip.y, { steps: 3 });
  await page.mouse.move(grip.x + 8, grip.y, { steps: 3 });
  await page.screenshot({ path: "outputs/qa/vanghulplijn.png" });
  await page.mouse.up();
  grip = { x: grip.x + 8, y: grip.y };
  await saved();
  const snappedSofa = await position();
  // Het hart van de bank valt exact op het hart van de salontafel.
  expect(snappedSofa.x).toBe(target);
  expect(snappedSofa.y).toBe(sofa.y);
  await page.screenshot({ path: "outputs/qa/vangen.png" });

  // Vangen uit: de bank blijft staan waar zij losgelaten wordt.
  await page.getByRole("button", { name: "Vangen aan objecten", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vangen uit", exact: true })).toBeVisible();
  const free = await dragSofa(9, 0);
  expect(free.x).not.toBe(snappedSofa.x);
  expect(free.x).toBeGreaterThan(snappedSofa.x);

  await page.reload();
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  expect((await position()).x).toBe(free.x);
  expect(errors).toEqual([]);
});

test("meerdere meubels selecteren → uitlijnen → gelijk verdelen → één stap terug", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Uitlijnstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();

  const positionOf = async (name: string) => {
    await page.getByRole("button", { name, exact: true }).click();
    return {
      x: Number(await page.getByLabel("Positie X", { exact: true }).inputValue()),
      y: Number(await page.getByLabel("Positie Y", { exact: true }).inputValue()),
    };
  };
  // De demoruimte heeft vier meubels op verschillende posities.
  const before = {
    sofa: await positionOf("Bank · linnen naturel"),
    table: await positionOf("Salontafel · eiken"),
    dining: await positionOf("Eettafel · rond"),
  };
  expect(new Set([before.sofa.x, before.table.x, before.dining.x]).size).toBe(3);

  // Shift-klikken in de objectlijst selecteert meerdere meubels.
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Eettafel · rond", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(
    page.getByRole("heading", { name: "3 meubels geselecteerd", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/uitlijnen.png" });

  await page.getByRole("button", { name: "Links uitlijnen", exact: true }).click();
  await saved();
  const aligned = {
    sofa: await positionOf("Bank · linnen naturel"),
    table: await positionOf("Salontafel · eiken"),
    dining: await positionOf("Eettafel · rond"),
  };
  // Linkerranden gelijk: hart min halve breedte is voor alle drie hetzelfde.
  const left = (p: { x: number }, width: number) => p.x - width / 2;
  expect(left(aligned.sofa, 2400)).toBe(left(aligned.table, 1200));
  expect(left(aligned.sofa, 2400)).toBe(left(aligned.dining, 1200));
  // De y-as blijft ongemoeid.
  expect(aligned.sofa.y).toBe(before.sofa.y);
  expect(aligned.dining.y).toBe(before.dining.y);

  // Eén stap terug zet alle drie de meubels tegelijk terug.
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  await page.getByRole("button", { name: "Ongedaan maken", exact: true }).click();
  await saved();
  expect(await positionOf("Bank · linnen naturel")).toEqual(before.sofa);
  expect(await positionOf("Salontafel · eiken")).toEqual(before.table);
  expect(await positionOf("Eettafel · rond")).toEqual(before.dining);

  // Verticaal gelijk verdelen: de buitenste blijven staan, de tussenruimten worden gelijk.
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Eettafel · rond", exact: true })
    .click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Verticaal gelijk verdelen", exact: true })
    .click();
  await saved();
  const spread = {
    sofa: { ...(await positionOf("Bank · linnen naturel")), depth: 950 },
    table: { ...(await positionOf("Salontafel · eiken")), depth: 650 },
    dining: { ...(await positionOf("Eettafel · rond")), depth: 1200 },
  };
  const order = [spread.dining, spread.table, spread.sofa].sort(
    (a, b) => a.y - b.y,
  );
  const gapOne = order[1]!.y - order[1]!.depth / 2 - (order[0]!.y + order[0]!.depth / 2);
  const gapTwo = order[2]!.y - order[2]!.depth / 2 - (order[1]!.y + order[1]!.depth / 2);
  expect(Math.abs(gapOne - gapTwo)).toBeLessThanOrEqual(1);
  // De buitenste twee staan nog op hun oude plek.
  expect(order[0]!.y - order[0]!.depth / 2).toBe(
    Math.min(
      before.sofa.y - 475,
      before.table.y - 325,
      before.dining.y - 600,
    ),
  );

  await page.reload();
  expect((await positionOf("Salontafel · eiken")).y).toBe(spread.table.y);
  expect(errors).toEqual([]);
});

test("lagen: verbergen, vergrendelen, van laag wisselen en volgorde", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Lagenstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();

  // Alle demomeubels zitten in de standaardlaag Inrichting.
  await expect(
    page.getByRole("button", { name: "Inrichting verbergen", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salontafel · eiken", exact: true }).click();
  await page
    .getByLabel("Laag van de selectie", { exact: true })
    .selectOption("lighting");
  await saved();
  await expect(
    page.getByRole("button", { name: "Verlichting verbergen", exact: true }),
  ).toBeVisible();

  // Verlichting verbergen: de tafel verdwijnt uit beeld maar blijft in de lijst.
  await page
    .getByRole("button", { name: "Verlichting verbergen", exact: true })
    .click();
  await saved();
  await expect(
    page.getByRole("button", { name: "Verlichting tonen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salontafel · eiken", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/lagen.png" });

  // Inrichting vergrendelen: de bank is niet meer te verwijderen.
  await page
    .getByRole("button", { name: "Inrichting vergrendelen", exact: true })
    .click();
  await saved();
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  await page.getByRole("button", { name: "Object verwijderen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("vergrendeld");
  await expect(
    page.getByRole("button", { name: "Bank · linnen naturel", exact: true }),
  ).toBeVisible();

  // Ontgrendelen maakt verwijderen weer mogelijk.
  await page
    .getByRole("button", { name: "Inrichting ontgrendelen", exact: true })
    .click();
  await saved();
  await page.getByRole("button", { name: "Bank · linnen naturel", exact: true }).click();
  await page.getByRole("button", { name: "Naar voren halen", exact: true }).click();
  await saved();
  const order = async () =>
    page.locator(".object-list button").allInnerTexts();
  const names = await order();
  expect(names[0]).not.toContain("Bank · linnen naturel");

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Verlichting tonen", exact: true }),
  ).toBeVisible();
  expect((await order())[0]).toBe(names[0]);
  expect(errors).toEqual([]);
});

test("meten en maatlijn vastleggen → sneltoetsen → maat op het planblad", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Maatstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  /** Het planblad via de downloadknop; dat is de route die de gebruiker ook neemt. */
  let sheet = 0;
  const planSheet = async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Planblad SVG", exact: true }).click();
    const file = `outputs/maatblad-${sheet++}.svg`;
    await (await download).saveAs(file);
    return readFile(file, "utf8");
  };

  // Sneltoets t kiest het maatgereedschap.
  await page.locator(".canvas-wrap").hover();
  await page.keyboard.press("t");
  await expect(page.getByRole("button", { name: "Maat", exact: true })).toHaveClass(
    /active/,
  );

  // Twee muurpunten aanklikken: vangen levert exact de muurlengte van 6.200 mm.
  const canvas = page.locator(".canvas-wrap canvas").first();
  const box = (await canvas.boundingBox())!;
  const fit = Math.min((box.width - 120) / 6200, (box.height - 120) / 4800);
  const at = (x: number, y: number) => ({
    x: box.x + 60 + x * fit,
    y: box.y + 60 + y * fit,
  });
  const first = at(0, 0);
  await page.mouse.click(first.x, first.y);
  const second = at(6200, 0);
  await page.mouse.move(second.x, second.y);
  await page.screenshot({ path: "outputs/qa/meten.png" });
  await page.mouse.click(second.x, second.y);
  await saved();

  // De maat komt uit de geometrie, niet uit de muisposities.
  await page.screenshot({ path: "outputs/qa/maatlijn.png" });
  expect(await planSheet()).toContain("6.200 mm");

  // Escape brengt terug naar selecteren; Delete verwijdert de maatlijn.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Selecteren", exact: true }),
  ).toHaveClass(/active/);
  // De maatlijn ligt 400 mm naast de gemeten lijn; daar klik je hem aan.
  await page.mouse.click(at(3100, 400).x, at(3100, 400).y);
  await page.keyboard.press("Delete");
  await saved();
  expect(await planSheet()).not.toContain("6.200 mm");

  // Ctrl+Z zet de verwijdering terug.
  await page.keyboard.press("Control+z");
  await saved();
  await page.reload();
  expect(await planSheet()).toContain("6.200 mm");
  expect(errors).toEqual([]);
});

test("sleepkader selecteert meerdere meubels → maatlijn verplaatsen en omklappen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Kaderstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const box = (await canvas.boundingBox())!;
  const fit = Math.min((box.width - 120) / 6200, (box.height - 120) / 4800);
  const at = (x: number, y: number) => ({
    x: box.x + 60 + x * fit,
    y: box.y + 60 + y * fit,
  });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
  };

  // Kader over de linkerhelft: bank en salontafel liggen daar, de eettafel niet.
  const from = at(200, 1400),
    to = at(3400, 4400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.screenshot({ path: "outputs/qa/sleepkader-actief.png" });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect(
    page.getByRole("heading", { name: "2 meubels geselecteerd", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/sleepkader.png" });

  // Een klik op leeg vlak zonder slepen heft de selectie weer op.
  await page.mouse.click(at(5800, 4400).x, at(5800, 4400).y);
  await expect(
    page.getByRole("heading", { name: "Elk detail telt.", exact: true }),
  ).toBeVisible();

  // Een muur blijft aanwijsbaar op het canvas zelf, ook nu hij als gevulde
  // contour getekend wordt in plaats van als dikke lijn. Het raam loopt van
  // 1.600 tot 4.200 mm, dus daarbuiten aanwijzen.
  await page.mouse.click(at(5000, 0).x, at(5000, 0).y);
  await expect(
    page.getByRole("heading", { name: "Muur op maat", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Maatlijn tekenen langs de bovenmuur en daarna bijstellen.
  await page.keyboard.press("t");
  await page.mouse.click(at(0, 0).x, at(0, 0).y);
  await page.mouse.click(at(6200, 0).x, at(6200, 0).y);
  await saved();
  await page.keyboard.press("Escape");
  // De maatlijn staat in de objectlijst, het toegankelijke alternatief voor
  // aanklikken op het canvas.
  await page.getByRole("button", { name: "Maat 1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "6.200 mm", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Afstand maatlijn", { exact: true }).fill("900");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await page.getByRole("button", { name: "Maat 1", exact: true }).click();
  await expect(page.getByLabel("Afstand maatlijn", { exact: true })).toHaveValue("900");
  // De maatlijn ligt nu verder van de muur; daar is hij ook aan te klikken.
  await page.mouse.click(at(3100, 900).x, at(3100, 900).y);
  await expect(page.getByLabel("Afstand maatlijn", { exact: true })).toHaveValue("900");

  await page.getByRole("button", { name: "Naar de andere kant", exact: true }).click();
  await saved();
  await page.getByRole("button", { name: "Maat 1", exact: true }).click();
  await expect(page.getByLabel("Afstand maatlijn", { exact: true })).toHaveValue("-900");
  // Passend brengt ook een maatlijn buiten de muren in beeld.
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/maatlijn-omgeklapt.png" });

  await page.reload();
  await page.getByRole("button", { name: "Maat 1", exact: true }).click();
  await expect(page.getByLabel("Afstand maatlijn", { exact: true })).toHaveValue("-900");
  expect(errors).toEqual([]);
});

test("onderlegger uploaden → inmeten met twee punten → schaal klopt", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Onderleggerstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();

  // SVG wordt geweigerd: actieve inhoud hoort niet als onderlegger de pagina in.
  await page.getByLabel("Onderlegger kiezen", { exact: true }).setInputFiles({
    name: "plattegrond.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
  });
  await expect(page.getByRole("alert")).toContainText("PNG- of JPEG");

  // Een echte PNG van 1000 x 800 px, in de test zelf gemaakt.
  const { makePng } = await import("../helpers/image");
  await page.getByLabel("Onderlegger kiezen", { exact: true }).setInputFiles({
    name: "plattegrond.png",
    mimeType: "image/png",
    buffer: makePng(1000, 800),
  });
  await saved();
  await expect(page.getByText("1000 × 800 px", { exact: false })).toBeVisible();
  await expect(page.getByText("nog niet gekalibreerd", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/onderlegger.png" });

  // Inmeten: twee punten op de afbeelding, 400 px uit elkaar.
  const canvas = page.locator(".canvas-wrap canvas").first();
  const box = (await canvas.boundingBox())!;
  // De onderlegger loopt zonder kalibratie van (0,0) tot (10000, 8000) mm.
  const fit = Math.min((box.width - 120) / 10000, (box.height - 120) / 8000);
  const at = (x: number, y: number) => ({
    x: box.x + 60 + x * fit,
    y: box.y + 60 + y * fit,
  });
  await page.getByRole("button", { name: "Inmeten", exact: true }).click();
  // Pixel (100,200) en (500,200) liggen bij 10 mm/px op 1000 en 5000 mm.
  await page.mouse.click(at(1000, 2000).x, at(1000, 2000).y);
  await page.mouse.click(at(5000, 2000).x, at(5000, 2000).y);
  await page.getByLabel("Werkelijke afstand", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Schaal toepassen", exact: true }).click();
  await saved();

  // Ongeveer 400 px staat nu voor 5.000 mm: 12,5 mm per pixel. Een muisklik
  // landt op een hele schermpixel, hier zo'n 0,65 afbeeldingspixel, dus de
  // uitkomst mag daar iets van afwijken; de kalibratie gebruikt wat de
  // gebruiker werkelijk heeft aangewezen.
  const perPixel = async () =>
    Number(
      (await page.locator(".underlay p").first().innerText())
        .replace(/.*·\s*/, "")
        .replace(" mm per pixel", "")
        .replace(",", "."),
    );
  expect(await perPixel()).toBeGreaterThan(12.3);
  expect(await perPixel()).toBeLessThan(12.7);
  await expect(page.getByText("nog niet gekalibreerd", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/onderlegger-gekalibreerd.png" });

  const before = await perPixel();
  await page.reload();
  expect(await perPixel()).toBe(before);
  await page.getByRole("button", { name: "Onderlegger verwijderen", exact: true }).click();
  await saved();
  await expect(page.getByLabel("Onderlegger kiezen", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("notitie plaatsen → laagpreset → legenda op het planblad", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
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
  await page.getByRole("button", { name: "Nieuw project", exact: true }).click();
  await page.getByLabel("Projectnaam").fill("Bladstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const box = (await canvas.boundingBox())!;
  const fit = Math.min((box.width - 120) / 6200, (box.height - 120) / 4800);
  const at = (x: number, y: number) => ({
    x: box.x + 60 + x * fit,
    y: box.y + 60 + y * fit,
  });
  let sheet = 0;
  const planSheet = async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Planblad SVG", exact: true }).click();
    const file = `outputs/bladstudio-${sheet++}.svg`;
    await (await download).saveAs(file);
    return readFile(file, "utf8");
  };

  // Notitie plaatsen en de tekst aanpassen.
  await page.getByRole("button", { name: "Notitie", exact: true }).click();
  await page.mouse.click(at(2600, 2600).x, at(2600, 2600).y);
  await saved();
  // Het gereedschap springt terug naar Selecteren zodat de tekst meteen te wijzigen is.
  await expect(
    page.getByRole("button", { name: "Selecteren", exact: true }),
  ).toHaveClass(/active/);
  await page.getByRole("button", { name: "Notitie 1", exact: true }).click();
  await page
    .getByLabel("Notitietekst", { exact: true })
    .fill("Bestaande radiator blijft staan");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  expect(await planSheet()).toContain("Bestaande radiator blijft staan");

  // Legenda: vier meubels, allemaal getoond.
  expect(await planSheet()).toContain("Inrichting: 4 getoond");

  // Laagpreset: zet de salontafel op verlichting en toon alleen dat blad.
  await page.getByRole("button", { name: "Salontafel · eiken", exact: true }).click();
  await page
    .getByLabel("Laag van de selectie", { exact: true })
    .selectOption("lighting");
  await saved();
  await page
    .getByRole("button", { name: "Alleen verlichting tonen", exact: true })
    .click();
  await saved();
  await page.screenshot({ path: "outputs/qa/laagpreset.png" });
  const lightingSheet = await planSheet();
  // De legenda meldt wat er verborgen is, zodat niemand het blad voor compleet aanziet.
  expect(lightingSheet).toContain("Inrichting: 0 getoond, 3 verborgen");
  expect(lightingSheet).toContain("Verlichting: 1 getoond");
  // En het blad tekent ze ook werkelijk niet; de legenda mag niets anders beweren.
  expect(lightingSheet).not.toContain("Bank · linnen naturel");
  expect(lightingSheet).not.toContain("Dressoir");
  expect(lightingSheet).toContain("Salontafel · eiken");

  await page.getByRole("button", { name: "Alle lagen tonen", exact: true }).click();
  await saved();
  const complete = await planSheet();
  expect(complete).toContain("Inrichting: 3 getoond");
  expect(complete).toContain("Bank · linnen naturel");
  expect(errors).toEqual([]);
});
