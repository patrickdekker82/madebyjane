import { makeGlb } from "../helpers/glb";
import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
let ownerCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
/** De in test 2 uitgenodigde collega; hergebruikt omdat inloggen gelimiteerd is. */
let colleagueCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
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
    colleagueCookies = await guest.context().cookies();
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
test("project beperken → collega ziet het niet → als projectlid weer wel", async ({
  page,
  browser,
}) => {
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  // Twee verschillende mensen op twee machines: de auth-limiet telt per
  // client-IP, dus krijgt elke rol hier zijn eigen adres. Dat bootst de
  // werkelijkheid na in plaats van de limiet te verlagen. De sessies zelf
  // komen uit eerdere routes, omdat inloggen gelimiteerd is.
  await page.setExtraHTTPHeaders({ "x-studio-client-ip": "203.0.113.10" });
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
  test.skip(
    colleagueCookies.length === 0,
    "Deze route hergebruikt de collega uit de uitnodigingsroute.",
  );
  const context = await browser.newContext({
      extraHTTPHeaders: { "x-studio-client-ip": "203.0.113.11" },
    }),
    guest = await context.newPage();
  try {
    await context.addCookies(colleagueCookies);
    await page.getByRole("button", { name: "Nieuw project" }).click();
    await page.getByLabel("Projectnaam").fill("Toegangsproef");
    await page.getByLabel("Klantnaam").fill("Familie Voorbeeld");
    await page
      .getByRole("button", { name: "Project aanmaken", exact: true })
      .click();
    // Open project: de collega ziet het gewoon staan.
    await guest.goto("/");
    await expect(
      guest.getByRole("button", { name: "Toegangsproef" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Projecttoegang", exact: true })
      .click();
    await expect(
      page.getByText(/Iedereen in deze werkruimte kan dit project openen/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Beperken tot gekozen leden", exact: true })
      .click();
    await expect(
      page.getByText(/Alleen de leden hieronder kunnen dit project openen/),
    ).toBeVisible();
    // Na beperken is het project voor de collega weg, niet alleen verborgen.
    await guest.reload();
    await expect(
      guest.getByRole("button", { name: "Toegangsproef" }),
    ).toHaveCount(0);
    // Expliciet lid maken geeft de toegang terug.
    await page
      .getByLabel("Collega")
      .selectOption({ label: "Fictieve kijker (kijker@example.test)" });
    await page.getByLabel("Rol binnen dit project").selectOption("designer");
    await page
      .getByRole("button", { name: "Lid toevoegen", exact: true })
      .click();
    await expect(page.getByText(/Fictieve kijker.*Ontwerper/)).toBeVisible();
    await guest.reload();
    await expect(
      guest.getByRole("button", { name: "Toegangsproef" }),
    ).toBeVisible();
    await mkdir("outputs/qa", { recursive: true });
    await page.screenshot({
      path: "outputs/qa/projecttoegang.png",
      fullPage: true,
    });
    // En weer intrekken sluit het net zo hard af.
    await page
      .getByRole("button", { name: "Lidmaatschap intrekken", exact: true })
      .click();
    await expect(page.getByText("Nog geen expliciete leden.")).toBeVisible();
    await guest.reload();
    await expect(
      guest.getByRole("button", { name: "Toegangsproef" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("collega kan niet meer inloggen → herstellink → nieuw wachtwoord → sessies uit", async ({
  page,
  browser,
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
  test.skip(
    colleagueCookies.length === 0,
    "Deze route herstelt de collega uit de uitnodigingsroute.",
  );
  // Deze route staat bewust na de andere routes die de collega gebruiken: een
  // herstel logt die collega overal uit. Opnieuw inloggen gebeurt hier niet,
  // want Better Auth staat drie inlogpogingen per tien seconden toe; dat het
  // nieuwe wachtwoord werkt en het oude niet meer, toetst recovery.test.ts.
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await context.addCookies(colleagueCookies);
    await guest.goto("/");
    await expect(
      guest.getByRole("heading", { name: "Ruimte voor het volgende." }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Toegang", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Accountherstel", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("listitem")
      .filter({ hasText: "kijker@example.test" })
      .getByRole("button", { name: "Herstellink maken", exact: true })
      .click();
    const url = await page.getByLabel("Eenmalige herstellink").inputValue();
    await mkdir("outputs/qa", { recursive: true });
    await page.screenshot({
      path: "outputs/qa/herstellink.png",
      fullPage: true,
    });

    // De collega zet een nieuw wachtwoord via de link.
    await guest.goto(url);
    await guest.getByLabel("Nieuw wachtwoord").fill("herstelwachtwoord-2026");
    await guest
      .getByRole("button", { name: "Wachtwoord instellen", exact: true })
      .click();
    await expect(
      guest.getByRole("heading", { name: "Je kunt weer inloggen." }),
    ).toBeVisible();

    // De bestaande sessie is ingetrokken: terug op het inlogscherm.
    await guest.goto("/");
    await expect(guest.getByLabel("E-mailadres")).toBeVisible();
    await expect(
      guest.getByRole("heading", { name: "Ruimte voor het volgende." }),
    ).toHaveCount(0);

    // Dezelfde link werkt geen tweede keer.
    await guest.goto(url);
    await guest.getByLabel("Nieuw wachtwoord").fill("nogeenpoging-2026");
    await guest
      .getByRole("button", { name: "Wachtwoord instellen", exact: true })
      .click();
    await expect(guest.getByRole("alert")).toBeVisible();
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
test("berekende hoeveelheid uit het ontwerp → ontwerp wijzigen → veroudering → herberekenen", async ({
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Hoeveelhedenstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Materiaalkeuzes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Materiaal toevoegen", exact: true })
    .click();
  await page
    .getByLabel("Materiaal name", { exact: true })
    .fill("Eiken vloerdelen");
  await page.getByLabel("Bereken uit ontwerp", { exact: true }).check();
  await expect(page.getByLabel("Bronruimte", { exact: true })).toHaveValue(
    /.+/,
  );
  await page.getByLabel("Bestelstap", { exact: true }).fill("0,5");
  await expect(page.getByLabel("Bestelstap", { exact: true })).toHaveValue(
    "0,5",
  );
  // 29,04 m² bruto langs de hartlijnen; 27,154275 m² netto binnen muren van 180 mm.
  await expect(page.getByRole("status")).toContainText(
    "Netto 27,154 m² + snijverlies 2,715 m² = bruto 29,869 m²",
  );
  await expect(page.getByRole("status")).toContainText(
    "Bestelhoeveelheid 30 m² uit ontwerpversie 0",
  );
  await page.screenshot({ path: "outputs/qa/hoeveelheid-berekenen.png" });
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();
  await expect(
    page.getByText("30 m² · berekend uit het ontwerp", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Netto vloeroppervlak · netto 27,154 m² + 10% snijverlies · bestelstap 0,5 m² = 30 m² · ontwerpversie 0",
      { exact: false },
    ),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/berekende-hoeveelheden.png" });
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();

  await page.getByRole("button", { name: "Muur 1", exact: true }).click();
  await page.getByLabel("Muurdikte", { exact: true }).fill("400");
  await page
    .getByRole("button", { name: "Maten toepassen", exact: true })
    .click();
  await expect(
    page.getByText("Server opgeslagen", { exact: false }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Materiaalkeuzes", exact: true })
    .click();
  await expect(
    page.getByText("Verouderd: het ontwerp (versie 1) geeft nu", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Herbereken Eiken vloerdelen", exact: true })
    .click();
  await expect(
    page.getByText("· ontwerpversie 1", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Verouderd", { exact: false })).toHaveCount(0);
  await expect(
    page.getByText("30 m² · berekend uit het ontwerp", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Materiaalkeuzes", exact: true })
    .click();
  await expect(
    page.getByText("· ontwerpversie 1", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("alternatief met prijsbron vastleggen → kiezen → herkomst en indicatiebedrag zichtbaar", async ({
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Alternatievenstudio");
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
  await page
    .getByLabel("Materiaal supplier", { exact: true })
    .fill("Fictieve vloermaker");
  await page.getByLabel("Materiaal sku", { exact: true }).fill("V-01");
  await page.getByLabel("Materiaal hoeveelheid", { exact: true }).fill("30");
  await page
    .getByLabel("Materiaal onderbouwing", { exact: true })
    .fill("Ingemeten door de leverancier.");
  await page.getByLabel("Eenheidsprijs", { exact: true }).fill("74,95");

  // Een prijs zonder bron en datum wordt geweigerd.
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Noteer bij een prijs ook de bron en de prijsdatum",
  );
  await page.getByLabel("Prijsbron", { exact: true }).fill("Prijslijst 2026");
  await page.getByLabel("Prijsdatum", { exact: true }).fill("2026-08-20");
  await page
    .getByLabel("Monsterstatus", { exact: true })
    .selectOption("received");
  await page.getByLabel("Monsterdatum", { exact: true }).fill("2026-08-28");
  await page
    .getByRole("button", { name: "Alternatief toevoegen", exact: true })
    .click();
  await page
    .getByLabel("Alternatief 1 naam", { exact: true })
    .fill("Es geborsteld");
  await page
    .getByLabel("Alternatief 1 leverancier", { exact: true })
    .fill("Andere vloermaker");
  await page
    .getByLabel("Alternatief 1 artikelnummer", { exact: true })
    .fill("V-02");
  await page
    .getByLabel("Alternatief 1 prijsbron", { exact: true })
    .fill("Offerte 2026-114");
  await page
    .getByLabel("Alternatief 1 prijsdatum", { exact: true })
    .fill("2026-09-01");
  await page
    .getByLabel("Alternatief 1 eenheidsprijs", { exact: true })
    .fill("68,50");
  await page.screenshot({ path: "outputs/qa/alternatief-invoeren.png" });
  await page
    .getByRole("button", { name: "Materiaal bewaren", exact: true })
    .click();

  await expect(
    page.getByText(
      "€ 74,95 per m² · bron: Prijslijst 2026 · prijsdatum 2026-08-20",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("indicatie € 2.248,50 bij 30 m²", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Monster ontvangen op 2026-08-28", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Het zijn geen offerteregels", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Es geborsteld · Andere vloermaker · V-02 · € 68,50 per m² (Offerte 2026-114, 2026-09-01)",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/alternatieven.png" });

  await page
    .getByRole("button", { name: "Kies Es geborsteld", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Es geborsteld", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Gekozen uit het alternatief “Es geborsteld”.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("indicatie € 2.055,00 bij 30 m²", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Eiken vloer · naturel · Fictieve vloermaker · V-01", {
      exact: false,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Materiaalkeuzes", exact: true })
    .click();
  await expect(page.getByText("Versie 2 ·", { exact: false })).toBeVisible();
  await page.getByLabel("Materialen zoeken", { exact: true }).fill("v-01");
  await expect(
    page.getByRole("heading", { name: "Es geborsteld", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("offerteconcept, decimalen, finalisatie en vaste prijzen na herladen", async ({
  page,
}) => {
  if (ownerCookies.length) {
    await page.context().addCookies(ownerCookies);
    await page.goto("/");
  } else {
    const credentials = JSON.parse(
      await readFile("work/e2e-credentials.json", "utf8"),
    );
    await page.goto("/");
    await page.getByLabel("E-mailadres").fill(credentials.email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  }
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
  await page
    .getByLabel("Inkoopprijs per eenheid EUR post 1", { exact: true })
    .fill("12");
  await page
    .getByLabel("Inkoopbron / datum post 1", { exact: true })
    .fill("Fictieve leverancier · 10 september 2026");
  await expect(
    page.getByRole("heading", { name: "Totaal: 54,44 €" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Marge excl. belasting: 14,99 € · 33,32% van netto verkoop",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Prijsbronnen en presentatiebijlagen",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Bijlagetitel", { exact: true })
    .fill("Presentatie woonkamer");
  await page
    .getByLabel("Presentatietekst", { exact: true })
    .fill("Rustige natuurlijke materialen voor de woonkamer.");
  await page
    .getByRole("button", {
      name: "Tekstblok bewaren en bijvoegen",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Presentatie woonkamer · text", { exact: true }),
  ).toBeChecked();
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
  await expect(
    page.getByLabel("Inkoopprijs per eenheid EUR post 1", { exact: true }),
  ).toHaveValue("12");
  // Auditoverzicht: wie deze offerte opsloeg en definitief maakte, met versie.
  await page
    .getByRole("button", { name: "Auditoverzicht bekijken", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Auditoverzicht", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Definitief gemaakt · versie 2 · 20/),
  ).toBeVisible();
  await expect(
    page.getByText("Concept opgeslagen · versie 1", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "outputs/qa/offerte-audit.png",
    fullPage: true,
  });
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Offerte-PDF downloaden", exact: true })
    .click();
  const pdf = await downloaded;
  await pdf.saveAs("outputs/qa/offerte-browser.pdf");
  await page
    .getByRole("button", { name: "Deellink maken", exact: true })
    .click();
  const link = await page.getByLabel("Deellink voor deze offerte").inputValue();
  expect((await page.request.get(link)).status()).toBe(200);
  await page
    .getByRole("button", { name: "Link intrekken", exact: true })
    .click();
  await expect(page.getByText("Ingetrokken", { exact: true })).toBeVisible();
  expect((await page.request.get(link)).status()).toBe(404);
  await page
    .getByRole("button", {
      name: "Verzending of klantreactie registreren",
      exact: true,
    })
    .click();
  await page.getByLabel("Afzender of reagerende klant").fill("Testontwerper");
  await page
    .getByLabel("Onderbouwing / bron")
    .fill("Fictieve e-mail voor browsertest");
  await page
    .getByRole("button", { name: "Registratie bewaren", exact: true })
    .click();
  await expect(
    page.getByText("Verzonden (handmatig geregistreerd)", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Vervolgconcept maken", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Concept zonder offertenummer · versie 3",
    }),
  ).toBeVisible();
  await page.getByLabel("Eenheidsprijs EUR post 1", { exact: true }).fill("30");
  await page
    .getByRole("button", { name: "Concept bewaren", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Concept zonder offertenummer · versie 4",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Versies bekijken", exact: true })
    .click();
  await page
    .getByRole("button", { name: /2026-\d+ · versie 2 · Verzonden/ })
    .click();
  await expect(
    page.getByLabel("Eenheidsprijs EUR post 1", { exact: true }),
  ).toHaveValue("19.995");
  await expect(
    page.getByLabel("Eenheidsprijs EUR post 1", { exact: true }),
  ).toBeDisabled();
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
  const drag = async (
    from: { x: number; y: number },
    dx: number,
    dy: number,
  ) => {
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
  await page
    .getByRole("button", { name: "Raster snap · 100 mm", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Vangen aan objecten", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Vangen uit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  const before = await position();
  await drag(
    { x: box.x + 60 + 1700 * guess, y: box.y + 60 + 3300 * guess },
    120,
    0,
  );
  await saved();
  const calibrated = await position();
  // Zonder deze verplaatsing heeft de sleep de bank niet geraakt en zegt de rest niets.
  expect(Math.abs(calibrated.x - before.x)).toBeGreaterThan(200);
  expect(calibrated.y).toBe(before.y);
  const mmPerPixel = (calibrated.x - before.x) / 120;
  const anchor = {
    x: box.x + 60 + 1700 * guess + 120,
    y: box.y + 60 + 3300 * guess,
  };
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
  await page
    .getByRole("button", { name: "Vrij plaatsen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Raster snap · 100 mm", exact: true }),
  ).toBeVisible();
  const sofa = await dragSofa(41, 27);
  expect(sofa.x % 100).toBe(0);
  expect(sofa.y % 100).toBe(0);
  expect(sofa.x).not.toBe(calibrated.x);

  // Raster uit, vangen aan objecten aan: alleen uitlijnen op de salontafel blijft over.
  await page
    .getByRole("button", { name: "Raster snap · 100 mm", exact: true })
    .click();
  await page.getByRole("button", { name: "Vangen uit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Vangen aan objecten", exact: true }),
  ).toBeVisible();
  // Alles in schermpixels uitdrukken: Konva start pas een sleep vanaf 3 pixels
  // en de vangtolerantie is 12 pixels. Een doel op 10 pixels met een sleep van
  // 8 pixels ligt dus altijd binnen bereik, bij elke zoomstand.
  const target = sofa.x + Math.round(10 * mmPerPixel);
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click();
  await page.getByLabel("Positie X", { exact: true }).fill(String(target));
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  expect((await position()).x).toBe(target);

  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Vangen aan objecten", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Vangen uit", exact: true }),
  ).toBeVisible();
  const free = await dragSofa(9, 0);
  expect(free.x).not.toBe(snappedSofa.x);
  expect(free.x).toBeGreaterThan(snappedSofa.x);

  await page.reload();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
      x: Number(
        await page.getByLabel("Positie X", { exact: true }).inputValue(),
      ),
      y: Number(
        await page.getByLabel("Positie Y", { exact: true }).inputValue(),
      ),
    };
  };
  // De demoruimte heeft vier meubels op verschillende posities.
  const before = {
    sofa: await positionOf("Bank · linnen naturel"),
    table: await positionOf("Salontafel · eiken"),
    dining: await positionOf("Eettafel · rond"),
  };
  expect(new Set([before.sofa.x, before.table.x, before.dining.x]).size).toBe(
    3,
  );

  // Shift-klikken in de objectlijst selecteert meerdere meubels.
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
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

  await page
    .getByRole("button", { name: "Links uitlijnen", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ongedaan maken", exact: true })
    .click();
  await saved();
  expect(await positionOf("Bank · linnen naturel")).toEqual(before.sofa);
  expect(await positionOf("Salontafel · eiken")).toEqual(before.table);
  expect(await positionOf("Eettafel · rond")).toEqual(before.dining);

  // Verticaal gelijk verdelen: de buitenste blijven staan, de tussenruimten worden gelijk.
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
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
  const gapOne =
    order[1]!.y - order[1]!.depth / 2 - (order[0]!.y + order[0]!.depth / 2);
  const gapTwo =
    order[2]!.y - order[2]!.depth / 2 - (order[1]!.y + order[1]!.depth / 2);
  expect(Math.abs(gapOne - gapTwo)).toBeLessThanOrEqual(1);
  // De buitenste twee staan nog op hun oude plek.
  expect(order[0]!.y - order[0]!.depth / 2).toBe(
    Math.min(before.sofa.y - 475, before.table.y - 325, before.dining.y - 600),
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Object verwijderen", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("vergrendeld");
  await expect(
    page.getByRole("button", { name: "Bank · linnen naturel", exact: true }),
  ).toBeVisible();

  // Ontgrendelen maakt verwijderen weer mogelijk.
  await page
    .getByRole("button", { name: "Inrichting ontgrendelen", exact: true })
    .click();
  await saved();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Naar voren halen", exact: true })
    .click();
  await saved();
  const order = async () => page.locator(".object-list button").allInnerTexts();
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
    await page
      .getByRole("button", { name: "Planblad SVG", exact: true })
      .click();
    const file = `outputs/maatblad-${sheet++}.svg`;
    await (await download).saveAs(file);
    return readFile(file, "utf8");
  };

  // Sneltoets t kiest het maatgereedschap.
  await page.locator(".canvas-wrap").hover();
  await page.keyboard.press("t");
  await expect(
    page.getByRole("button", { name: "Maat", exact: true }),
  ).toHaveClass(/active/);

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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
  const drag = async (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
      steps: 4,
    });
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
  await expect(
    page.getByLabel("Afstand maatlijn", { exact: true }),
  ).toHaveValue("900");
  // De maatlijn ligt nu verder van de muur; daar is hij ook aan te klikken.
  await page.mouse.click(at(3100, 900).x, at(3100, 900).y);
  await expect(
    page.getByLabel("Afstand maatlijn", { exact: true }),
  ).toHaveValue("900");

  await page
    .getByRole("button", { name: "Naar de andere kant", exact: true })
    .click();
  await saved();
  await page.getByRole("button", { name: "Maat 1", exact: true }).click();
  await expect(
    page.getByLabel("Afstand maatlijn", { exact: true }),
  ).toHaveValue("-900");
  // Passend brengt ook een maatlijn buiten de muren in beeld.
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/maatlijn-omgeklapt.png" });

  await page.reload();
  await page.getByRole("button", { name: "Maat 1", exact: true }).click();
  await expect(
    page.getByLabel("Afstand maatlijn", { exact: true }),
  ).toHaveValue("-900");
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
    ),
  });
  await expect(page.getByRole("alert")).toContainText("PNG- of JPEG");

  /*
   * Een PDF mag wél, maar niet als PDF: de gekozen pagina wordt in de browser
   * tot pixels gerekend en als PNG verstuurd. Dit bestand heeft twee pagina's
   * met verschillende maten, zodat aan de maten te zien is welke pagina er
   * werkelijk is omgezet.
   */
  const { makePdf } = await import("../helpers/pdf");
  await page.getByLabel("Onderlegger kiezen", { exact: true }).setInputFiles({
    name: "plattegrond.pdf",
    mimeType: "application/pdf",
    buffer: makePdf([
      { widthPt: 200, heightPt: 100 },
      { widthPt: 300, heightPt: 400 },
    ]),
  });
  const paginakeuze = page.getByLabel("Pagina (1 tot 2)", { exact: true });
  await expect(paginakeuze).toBeVisible();
  await paginakeuze.fill("2");
  await page
    .getByRole("button", { name: "Pagina gebruiken", exact: true })
    .click();
  await saved();
  // 300 x 400 pt op 2x: de tweede pagina, niet de eerste.
  await expect(page.getByText("600 × 800 px", { exact: false })).toBeVisible();
  await page.screenshot({ path: "outputs/qa/onderlegger-pdf.png" });
  await page
    .getByRole("button", { name: "Onderlegger verwijderen", exact: true })
    .click();

  // Een echte PNG van 1000 x 800 px, in de test zelf gemaakt.
  const { makePng } = await import("../helpers/image");
  await page.getByLabel("Onderlegger kiezen", { exact: true }).setInputFiles({
    name: "plattegrond.png",
    mimeType: "image/png",
    buffer: makePng(1000, 800),
  });
  await saved();
  await expect(page.getByText("1000 × 800 px", { exact: false })).toBeVisible();
  await expect(
    page.getByText("nog niet gekalibreerd", { exact: true }),
  ).toBeVisible();
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
  await page
    .getByRole("button", { name: "Schaal toepassen", exact: true })
    .click();
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
  await expect(
    page.getByText("nog niet gekalibreerd", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/onderlegger-gekalibreerd.png" });

  // Verplaatsen en draaien.
  const field = (name: string) => page.getByLabel(name, { exact: true });
  const apply = async () => {
    await page
      .getByRole("button", { name: "Plaatsing toepassen", exact: true })
      .click();
    await saved();
  };
  await field("Onderlegger X").fill("3000");
  await field("Onderlegger Y").fill("-1000");
  await apply();
  await expect(field("Onderlegger X")).toHaveValue("3000");
  await expect(field("Onderlegger Y")).toHaveValue("-1000");

  await field("Onderlegger draaiing").fill("90");
  await apply();
  await expect(field("Onderlegger draaiing")).toHaveValue("90");
  // Draaien gaat om het midden van de afbeelding, dus de hoek schuift mee.
  await expect(field("Onderlegger X")).not.toHaveValue("3000");
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/onderlegger-gedraaid.png" });

  // Vier kwartslagen brengen de onderlegger terug waar hij stond.
  const number = async (name: string) => Number(await field(name).inputValue());
  const x0 = await number("Onderlegger X"),
    y0 = await number("Onderlegger Y");
  for (const expected of [180, 270, 0, 90]) {
    await page
      .getByRole("button", { name: "90° draaien", exact: true })
      .click();
    await expect(field("Onderlegger draaiing")).toHaveValue(String(expected));
  }
  expect(Math.abs((await number("Onderlegger X")) - x0)).toBeLessThanOrEqual(3);
  expect(Math.abs((await number("Onderlegger Y")) - y0)).toBeLessThanOrEqual(3);

  // Slepen op het canvas, met het raster als vangnet.
  await field("Onderlegger X").fill("0");
  await field("Onderlegger Y").fill("0");
  await field("Onderlegger draaiing").fill("0");
  await apply();
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page
    .getByRole("button", { name: "Verplaatsen en draaien", exact: true })
    .click();
  const scale = await perPixel();
  const spread = await canvas.boundingBox();
  const fit2 = Math.min(
    (spread!.width - 120) / (1000 * scale),
    (spread!.height - 120) / (800 * scale),
  );
  const on = (x: number, y: number) => ({
    x: spread!.x + 60 + x * fit2,
    y: spread!.y + 60 + y * fit2,
  });
  const grip = on(1000 * scale * 0.5, 800 * scale * 0.5);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + 30, { steps: 8 });
  await page.mouse.up();
  await saved();
  const dx = await number("Onderlegger X"),
    dy = await number("Onderlegger Y");
  // Het raster staat aan, dus de plaatsing landt op hele honderden millimeters.
  expect(dx % 100).toBe(0);
  expect(dy % 100).toBe(0);
  expect(Math.abs(dx - 60 / fit2)).toBeLessThanOrEqual(150);
  expect(Math.abs(dy - 30 / fit2)).toBeLessThanOrEqual(150);
  await page.screenshot({ path: "outputs/qa/onderlegger-verplaatst.png" });
  await page
    .getByRole("button", { name: "Klaar met verplaatsen", exact: true })
    .click();

  const before = await perPixel();
  await page.reload();
  expect(await perPixel()).toBe(before);
  // Plaats en draaiing overleven het herladen.
  await expect(field("Onderlegger X")).toHaveValue(String(dx));
  await expect(field("Onderlegger Y")).toHaveValue(String(dy));
  await expect(field("Onderlegger draaiing")).toHaveValue("0");
  await page
    .getByRole("button", { name: "Onderlegger verwijderen", exact: true })
    .click();
  await saved();
  await expect(
    page.getByLabel("Onderlegger kiezen", { exact: true }),
  ).toBeVisible();
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
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
    await page
      .getByRole("button", { name: "Planblad SVG", exact: true })
      .click();
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
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click();
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

  await page
    .getByRole("button", { name: "Alle lagen tonen", exact: true })
    .click();
  await saved();
  const complete = await planSheet();
  expect(complete).toContain("Inrichting: 3 getoond");
  expect(complete).toContain("Bank · linnen naturel");
  expect(errors).toEqual([]);
});

test("meubels groeperen → samen verslepen → groep opheffen", async ({
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Groepstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();
  /**
   * Posities uit het geexporteerde planblad lezen. Een gegroepeerd meubel
   * aanwijzen selecteert de hele groep, dus het eigenschappenpaneel toont dan
   * geen losse coordinaten meer; het blad is bovendien echte uitvoer.
   */
  let sheet = 0;
  const positions = async () => {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Planblad SVG", exact: true })
      .click();
    const file = `outputs/groepstudio-${sheet++}.svg`;
    await (await download).saveAs(file);
    const svg = await readFile(file, "utf8");
    const read = (name: string) => {
      const match = new RegExp(
        `translate\\(([-\\d.]+),([-\\d.]+)\\) rotate\\([^)]*\\)">(?:(?!</g>)[^])*?>${name}<`,
      ).exec(svg);
      if (!match) throw new Error("Niet op het planblad gevonden: " + name);
      return { x: Number(match[1]), y: Number(match[2]) };
    };
    return {
      sofa: read("Bank · linnen naturel"),
      table: read("Salontafel · eiken"),
      dining: read("Eettafel · rond"),
    };
  };
  const before = await positions();

  // Bank en salontafel groeperen.
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Groeperen", exact: true }).click();
  await saved();
  await expect(
    page.getByText("Deze meubels vormen een groep en bewegen samen.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/groeperen.png" });

  // Eén lid aanwijzen pakt de hele groep; de eettafel blijft erbuiten.
  await page
    .getByRole("button", { name: "Eettafel · rond", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 meubels geselecteerd", exact: true }),
  ).toBeVisible();

  // Samen verslepen: beide schuiven even ver op, de eettafel niet.
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const box = (await canvas.boundingBox())!;
  const fit = Math.min((box.width - 120) / 6200, (box.height - 120) / 4800);
  const at = (x: number, y: number) => ({
    x: box.x + 60 + x * fit,
    y: box.y + 60 + y * fit,
  });
  const grip = at(before.sofa.x, before.sofa.y);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 30, grip.y, { steps: 4 });
  await page.mouse.move(grip.x + 60, grip.y, { steps: 4 });
  await page.screenshot({ path: "outputs/qa/groep-slepen.png" });
  await page.mouse.up();
  await saved();
  const after = await positions();
  expect(after.sofa.x).not.toBe(before.sofa.x);
  expect(after.table.x - before.table.x).toBe(after.sofa.x - before.sofa.x);
  expect(after.table.y).toBe(before.table.y);
  expect(after.dining).toEqual(before.dining);

  // Eén stap terug zet de hele groep terug.
  await page
    .getByRole("button", { name: "Ongedaan maken", exact: true })
    .click();
  await saved();
  const restored = await positions();
  expect(restored.sofa).toEqual(before.sofa);
  expect(restored.table).toEqual(before.table);

  // Opheffen: de bank beweegt weer alleen.
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Groep opheffen", exact: true })
    .click();
  await saved();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bank · linnen naturel", exact: true }),
  ).toBeVisible();

  await page.reload();
  await page
    .getByRole("button", { name: "Salontafel · eiken", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Salontafel · eiken", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

/*
 * Bewust een eigen route met een eigen project, los van de herstelroute
 * hieronder. Bewaren als variant ruimt het klad op, en dat is precies wat de
 * afmeldstap in die route nodig heeft; de twee horen elkaar niet in de weg te
 * zitten.
 */
test("lokaal werk dat niet meer past → bewaren als aparte variant", async ({
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Variantstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();
  const origineel = page.url();

  await page.getByRole("button", { name: "Lokaal herstel uit" }).click();
  await expect(
    page.getByRole("button", { name: "Lokaal herstel aan" }),
  ).toBeVisible();

  // Werk dat de server niet haalt, maar wel in deze browser blijft staan.
  await page.route("**/api/v1/variants/*/commands", (route) =>
    route.abort("failed"),
  );
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page.getByLabel("Positie X", { exact: true }).fill("2500");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await expect(page.getByText("Lokaal bewaard op dit apparaat")).toBeVisible();
  await page.unroute("**/api/v1/variants/*/commands");

  /*
   * En intussen schuift de server op. De bewerktoegang is exclusief, dus die
   * wordt niet afgepakt maar hergebruikt — zoals wanneer dezelfde gebruiker op
   * een ander apparaat verdergaat. Daarmee past het klad straks niet meer.
   */
  const rival = await page.evaluate(async () => {
    const variantId = location.pathname.split("/").pop();
    const me = await (await fetch("/api/v1/me")).json();
    const organizationId = me.organizations[0].id;
    const headers = {
      "x-organization-id": organizationId,
      "Content-Type": "application/json",
    };
    const document = await (
      await fetch("/api/v1/variants/" + variantId + "/document", {
        headers: { "x-organization-id": organizationId },
      })
    ).json();
    const leaseId = sessionStorage.getItem(
      "studio.lease:" + organizationId + ":" + variantId,
    );
    const response = await fetch(
      "/api/v1/variants/" + variantId + "/commands",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          baseRevision: document.revision,
          leaseId,
          operations: [
            {
              type: "SetItemDisplay",
              ids: [document.items[0].id],
              hidden: true,
            },
          ],
        }),
      },
    );
    return response.status;
  });
  expect(rival).toBe(200);

  // Na herladen is het klad onverzendbaar: terughalen kan niet meer.
  await page.reload();
  const banner = page.getByText("Lokaal werk gevonden op dit apparaat");
  await expect(banner).toBeVisible();
  await expect(page.locator(".editor-message")).toContainText(
    "nieuwere versie",
  );
  await expect(
    page.getByRole("button", { name: "Lokaal werk terughalen", exact: true }),
  ).toHaveCount(0);

  // Maar weggooien hoeft niet: het werk blijft bestaan als eigen variant.
  await page
    .getByRole("button", { name: "Bewaren als aparte variant", exact: true })
    .click();
  // De editor staat daarna op een ánder ontwerp: de zojuist gemaakte variant.
  await expect(page).not.toHaveURL(origineel);
  await expect(banner).toHaveCount(0);
  await saved();
  const gered = await page.evaluate(async () => {
    const variantId = location.pathname.split("/").pop();
    const me = await (await fetch("/api/v1/me")).json();
    const organizationId = me.organizations[0].id;
    const document = await (
      await fetch("/api/v1/variants/" + variantId + "/document", {
        headers: { "x-organization-id": organizationId },
      })
    ).json();
    return { revision: document.revision, items: document.items.length };
  });
  // Een eigen ontwerp op revisie 0, met het werk erin.
  expect(gered.revision).toBe(0);
  expect(gered.items).toBeGreaterThan(0);
  await page.screenshot({ path: "outputs/qa/herstel-variant.png" });

  // Het oorspronkelijke ontwerp staat er nog, en het klad is opgeruimd.
  await page.goto(origineel);
  await saved();
  await expect(banner).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("lokaal herstel: mislukt opslaan → herladen → terughalen → conflict → afmelden", async ({
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
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Herstelstudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();

  // Lokaal herstel staat standaard uit: de gebruiker kiest er zelf voor.
  await expect(
    page.getByRole("button", { name: "Lokaal herstel uit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lokaal herstel uit" }).click();
  await expect(
    page.getByRole("button", { name: "Lokaal herstel aan" }),
  ).toBeVisible();

  const blockSaving = () =>
    page.route("**/api/v1/variants/*/commands", (route) =>
      route.abort("failed"),
    );
  const allowSaving = () => page.unroute("**/api/v1/variants/*/commands");

  await blockSaving();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page.getByLabel("Positie X", { exact: true }).fill("2500");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await expect(page.getByText("Lokaal bewaard op dit apparaat")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("niet bereikbaar");

  // Herladen wist het venster; het klad in deze browser hoort het te overleven.
  await allowSaving();
  await page.reload();
  const banner = page.getByText("Lokaal werk gevonden op dit apparaat");
  await expect(banner).toBeVisible();
  // Lokale opslag wordt nergens een back-up genoemd.
  await expect(page.locator(".editor-message")).toContainText("geen back-up");
  // De server heeft de wijziging niet gekregen.
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await expect(page.getByLabel("Positie X", { exact: true })).not.toHaveValue(
    "2500",
  );
  await page
    .getByRole("button", { name: "Lokaal werk terughalen", exact: true })
    .click();
  await saved();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await expect(page.getByLabel("Positie X", { exact: true })).toHaveValue(
    "2500",
  );

  // Na het opslaan hoort het klad opgeruimd te zijn.
  await page.reload();
  await saved();
  await page.waitForTimeout(800);
  await expect(
    page.getByText("Lokaal werk gevonden op dit apparaat"),
  ).toHaveCount(0);

  // Nu een echt conflict: eerst lokaal werk, dan een tweede sessie die wint.
  await blockSaving();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page.getByLabel("Positie X", { exact: true }).fill("2600");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await expect(page.getByText("Lokaal bewaard op dit apparaat")).toBeVisible();
  await allowSaving();
  /**
   * Een tweede schrijver die de server wel bereikt. De bewerktoegang is
   * exclusief, dus die wordt hier niet afgepakt maar hergebruikt: dit is precies
   * wat er gebeurt wanneer dezelfde gebruiker de toegang op een ander apparaat
   * overneemt. Wat de test wil vastleggen is het antwoord van de server op een
   * opdracht die op een verouderde revisie is gebouwd.
   */
  const rival = await page.evaluate(async () => {
    const variantId = location.pathname.split("/").pop();
    const me = await (await fetch("/api/v1/me")).json();
    const organizationId = me.organizations[0].id;
    const headers = {
      "x-organization-id": organizationId,
      "Content-Type": "application/json",
    };
    const document = await (
      await fetch("/api/v1/variants/" + variantId + "/document", {
        headers: { "x-organization-id": organizationId },
      })
    ).json();
    const leaseId = sessionStorage.getItem(
      "studio.lease:" + organizationId + ":" + variantId,
    );
    const response = await fetch(
      "/api/v1/variants/" + variantId + "/commands",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          baseRevision: document.revision,
          leaseId,
          operations: [
            {
              type: "SetItemDisplay",
              ids: [document.items[0].id],
              hidden: true,
            },
          ],
        }),
      },
    );
    return { status: response.status, revision: document.revision };
  });
  expect(rival.status).toBe(200);
  await page
    .getByRole("button", { name: "Opnieuw opslaan", exact: true })
    .click();
  await expect(
    page.getByText("Conflict · de server heeft een nieuwere versie"),
  ).toBeVisible();
  await page.screenshot({ path: "outputs/qa/herstel-conflict.png" });

  // Na herladen mag dit klad niet meer worden teruggestuurd, alleen bewaard.
  await page.reload();
  await expect(banner).toBeVisible();
  await expect(page.locator(".editor-message")).toContainText(
    "nieuwere versie",
  );
  await expect(
    page.getByRole("button", { name: "Lokaal werk terughalen", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "outputs/qa/herstel-gevonden.png" });

  // Afmelden waarschuwt en biedt eerst een export aan.
  await page.getByRole("button", { name: "Afmelden", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Er staat werk dat de server niet heeft");
  // Bij meerdere ontwerpen moet te zien zijn welk ontwerp nog werk heeft staan.
  await expect(dialog).toContainText("Basisontwerp");
  await page.screenshot({ path: "outputs/qa/herstel-afmelden.png" });
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Herstelbestand downloaden", exact: true })
    .click();
  await (await download).saveAs("outputs/qa/lokaal-herstel.json");
  const exported = JSON.parse(
    await readFile("outputs/qa/lokaal-herstel.json", "utf8"),
  );
  expect(exported).toHaveLength(1);
  expect(exported[0].operations[0].type).toBe("TransformItem");
  expect(exported[0].scene.items.length).toBeGreaterThan(0);
  await dialog
    .getByRole("button", { name: "Verwijderen en afmelden", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inloggen", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("LED-strip tekenen → lengte uit de tekening → bestellengte → planblad", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
  if (ownerCookies.length) await page.context().addCookies(ownerCookies);
  await page.goto("/");
  // De herstelroute meldt zich af, dus een bewaarde sessie kan verlopen zijn.
  // Eerst wachten tot de app iets laat zien: het aanmeldscherm of de projecten.
  await expect(
    page
      .getByLabel("E-mailadres")
      .or(page.getByRole("button", { name: "Nieuw project", exact: true }))
      .first(),
  ).toBeVisible();
  if (await page.getByLabel("E-mailadres").isVisible()) {
    await page.getByLabel("E-mailadres").fill(credentials.email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    ownerCookies = await page.context().cookies();
  }
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Lichtstudio");
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
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });

  // Een strip met een hoek: drie punten, daarna afronden.
  await page.getByRole("button", { name: "LED-strip", exact: true }).click();
  await expect(
    page.getByText("Klik de hoekpunten van de strip aan"),
  ).toBeVisible();
  for (const [x, y] of [
    [160, 160],
    [420, 160],
    [420, 300],
  ] as const) {
    const p = at(x, y);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByText("3 punten", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Strip afronden", exact: true })
    .click();
  await saved();

  // De gemeten lengte komt uit de tekening; het paneel toont hem als uitkomst.
  const readout = page.locator(".led-readout div");
  const measured = async () =>
    (await readout.nth(0).locator("dd").innerText()).replace(" m", "").trim();
  expect(Number((await measured()).replace(",", "."))).toBeGreaterThan(0);
  await expect(readout.nth(1).locator("dd")).toHaveText("1");

  // Het planblad moet dezelfde strip tekenen, met dezelfde lengte.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Planblad SVG", exact: true }).click();
  await (await download).saveAs("outputs/lichtstudio.svg");
  const svg = await readFile("outputs/lichtstudio.svg", "utf8");
  const points = /<polyline points="([^"]+)"/.exec(svg)?.[1];
  if (!points) throw new Error("Geen LED-strip op het planblad gevonden");
  const parsed = points.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x: x!, y: y! };
  });
  expect(parsed).toHaveLength(3);
  let fromSheet = 0;
  for (let i = 1; i < parsed.length; i++)
    fromSheet += Math.hypot(
      parsed[i]!.x - parsed[i - 1]!.x,
      parsed[i]!.y - parsed[i - 1]!.y,
    );
  // Wat het paneel zegt en wat er op papier staat is dezelfde meting.
  expect(Number((await measured()).replace(",", "."))).toBeCloseTo(
    fromSheet / 1000,
    3,
  );
  // De legenda noemt de strip, de meters en de hoek.
  expect(svg).toContain("LED-strips: 1 ·");
  expect(svg).toContain("1 hoek");

  // De bestellengte staat los van de meting en toont het verschil beide kanten op.
  const metres = Number((await measured()).replace(",", "."));
  await page
    .getByLabel("LED bestellengte", { exact: true })
    .fill(String(metres + 1.5).replace(".", ","));
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await expect(
    page.getByText("blijft 1,500 m over", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("LED bestellengte", { exact: true })
    .fill(String(metres - 0.5).replace(".", ","));
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await expect(
    page.getByText("0,500 m te weinig besteld", { exact: false }),
  ).toBeVisible();

  // Naam en vermogen invullen; het vermogen is lengte maal watt per meter.
  await page.getByLabel("LED naam", { exact: true }).fill("Keukenlijst");
  await page.getByLabel("LED vermogen per meter", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await expect(readout.nth(2).locator("dd")).toHaveText(
    (metres * 12).toFixed(3).replace(".", ",") + " W",
  );
  // De maat op het planblad staat er maar een keer, met een eenheid.
  expect(svg).not.toContain("mm mm");
  await page.screenshot({ path: "outputs/qa/led-strip.png" });

  // Herladen: de strip staat op de server, met naam en alles erop.
  await page.reload();
  await saved();
  await page.getByRole("button", { name: "Keukenlijst", exact: true }).click();
  expect(await measured()).toBe(metres.toFixed(3).replace(".", ","));
  expect(errors).toEqual([]);
});

test("spot en wandcontact plaatsen → bundel tonen → symbolenlegenda op het blad", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
  if (ownerCookies.length) await page.context().addCookies(ownerCookies);
  await page.goto("/");
  // Wachten tot de app iets toont, anders is niet te zien of aanmelden nodig is.
  await expect(
    page
      .getByLabel("E-mailadres")
      .or(page.getByRole("button", { name: "Nieuw project", exact: true }))
      .first(),
  ).toBeVisible();
  if (await page.getByLabel("E-mailadres").isVisible()) {
    await page.getByLabel("E-mailadres").fill(credentials.email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    ownerCookies = await page.context().cookies();
  }
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Elektrastudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();

  // Een spot: verlichting, met een bundel die uit hoogte en hoek volgt.
  // De knop draagt ook zijn ondertitel, dus hier geen exacte naam.
  await page.getByRole("button", { name: "Spot" }).click();
  await saved();
  await expect(page.getByRole("heading", { name: "Inbouwspot" })).toBeVisible();
  await expect(page.getByLabel("Montagehoogte", { exact: true })).toHaveValue(
    "2700",
  );
  await expect(page.getByLabel("Bundelhoek", { exact: true })).toHaveValue(
    "36",
  );
  // Papiermaat en fysieke maat zijn verschillende dingen en staan er allebei.
  await expect(page.locator(".properties")).toContainText(
    "Symbool 300 mm op papier",
  );
  await expect(page.locator(".properties")).toContainText(
    "90 × 90 mm in het echt",
  );
  // 2 x 2700 x tan(18 graden) = 1755 mm.
  await expect(page.locator(".properties")).toContainText("1755 mm doorsnede");
  await expect(page.locator(".properties")).toContainText(
    "Geen lux, geen lichtberekening",
  );

  // Hoger hangen maakt de bundel groter; de formule staat erbij.
  await page.getByLabel("Montagehoogte", { exact: true }).fill("3000");
  await page.getByLabel("Groep", { exact: true }).fill("Groep 2");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await expect(page.locator(".properties")).toContainText("1950 mm doorsnede");
  await expect(page.getByLabel("Groep", { exact: true })).toHaveValue(
    "Groep 2",
  );

  // Elektra straalt niet en heeft dus geen bundelvelden.
  await page.getByRole("button", { name: "Wandcontact" }).click();
  await saved();
  await expect(
    page.getByRole("heading", { name: "Wandcontactdoos" }),
  ).toBeVisible();
  await expect(page.getByLabel("Bundelhoek", { exact: true })).toHaveCount(0);
  await expect(page.locator(".properties")).not.toContainText(
    "Bundel op de vloer",
  );

  // De bundels aanzetten en het blad ophalen: alleen dan staan ze erop.
  const sheet = async (name: string) => {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Planblad SVG", exact: true })
      .click();
    await (await download).saveAs(name);
    return readFile(name, "utf8");
  };
  const zonder = await sheet("outputs/elektra-zonder-bundel.svg");
  expect(zonder).not.toContain("Lichtbundels getoond");
  expect(zonder).toContain("SYMBOLEN");
  expect(zonder).toContain("Inbouwspot × 1");
  expect(zonder).toContain("Wandcontactdoos × 1");

  await page
    .getByRole("button", { name: "Lichtbundels uit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lichtbundels aan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Passend", exact: true }).click();
  await page.screenshot({ path: "outputs/qa/lichtbundel.png" });
  const met = await sheet("outputs/elektra-met-bundel.svg");
  expect(met).toContain("Lichtbundels getoond");
  expect(met).toContain("visuele benadering, geen lichtberekening");
  // De bundel is een cirkel met de straal die het paneel noemt.
  const circle = /<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/.exec(met);
  if (!circle) throw new Error("Geen lichtbundel op het planblad gevonden");
  expect(Number(circle[3])).toBeCloseTo(
    3000 * Math.tan((18 * Math.PI) / 180),
    3,
  );

  // Het overzicht telt de groepen en zegt erbij wat er niet is ingevuld.
  const overzicht = page.locator(".lighting");
  await expect(overzicht).toContainText("Groep 2");
  await expect(overzicht).toContainText("Niet toegewezen");
  await expect(overzicht).toContainText("geen vermogen opgegeven");
  await expect(overzicht).toContainText("geen groeps- of belastingberekening");

  // Twee lichtscenes maken en er een van tonen.
  await page.getByRole("button", { name: "Inbouwspot", exact: true }).click();
  await page.getByLabel("Lichtscene", { exact: true }).fill("Avond");
  await page.getByLabel("Opgenomen vermogen", { exact: true }).fill("7,5");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await page.getByRole("button", { name: "Hanglamp" }).click();
  await saved();
  await page.getByLabel("Lichtscene", { exact: true }).fill("Ochtend");
  await page.getByRole("button", { name: "Toepassen", exact: true }).click();
  await saved();
  await expect(overzicht).toContainText("Avond");
  await expect(overzicht).toContainText("Ochtend");
  await expect(overzicht).toContainText("7,500 W opgegeven");

  await page.getByRole("button", { name: "Alleen Avond tonen" }).click();
  await saved();
  // Wat je op het scherm ziet, komt op het blad: de hanglamp is er nu af.
  const alleenAvond = await sheet("outputs/elektra-avond.svg");
  expect(alleenAvond).toContain("Inbouwspot × 1");
  expect(alleenAvond).not.toContain("Hanglamp ×");
  await page
    .getByRole("button", { name: "Alle armaturen tonen", exact: true })
    .click();
  await saved();
  const alles = await sheet("outputs/elektra-alles.svg");
  expect(alles).toContain("Hanglamp × 1");
  await page.screenshot({ path: "outputs/qa/lichtscenes.png" });
  // Herladen: het punt en zijn groep staan op de server.
  await page.reload();
  await saved();
  await page.getByRole("button", { name: "Inbouwspot", exact: true }).click();
  await expect(page.getByLabel("Groep", { exact: true })).toHaveValue(
    "Groep 2",
  );
  await expect(page.getByLabel("Lichtscene", { exact: true })).toHaveValue(
    "Avond",
  );
  await expect(page.getByLabel("Montagehoogte", { exact: true })).toHaveValue(
    "3000",
  );
  expect(errors).toEqual([]);
});

test("presentatie samenstellen → publiceren → PDF → deellink intrekken", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
  if (ownerCookies.length) await page.context().addCookies(ownerCookies);
  await page.goto("/");
  await expect(
    page
      .getByLabel("E-mailadres")
      .or(page.getByRole("button", { name: "Nieuw project", exact: true }))
      .first(),
  ).toBeVisible();
  if (await page.getByLabel("E-mailadres").isVisible()) {
    await page.getByLabel("E-mailadres").fill(credentials.email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    ownerCookies = await page.context().cookies();
  }
  await page
    .getByRole("button", { name: "Nieuw project", exact: true })
    .click();
  await page.getByLabel("Projectnaam").fill("Presentatiestudio");
  await page.getByLabel("Start met de fictieve woonkamer").check();
  await page
    .getByRole("button", { name: "Project aanmaken", exact: true })
    .click();
  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  await saved();

  await page.getByRole("button", { name: "Presentaties", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Publiceren legt een versie vast");
  await dialog
    .getByRole("button", { name: "Uitgebreid interieurplan", exact: true })
    .click();

  // Het concept is te bewerken: kop en tekst.
  await dialog
    .getByLabel("Presentatieklant", { exact: true })
    .fill("Familie Voorbeeld");
  await dialog
    .getByLabel("Tekst blok 2", { exact: true })
    .fill("Een rustige basis.");
  await dialog.getByLabel("Kop blok 2", { exact: true }).blur();
  await expect(dialog.getByText("Nog niets gepubliceerd.")).toBeVisible();

  // Het moodboard vullen met een echte afbeelding uit de beeldbank.
  const { makePng: png } = await import("../helpers/image");
  await dialog
    .getByLabel("Moodboardafbeelding kiezen blok 3", { exact: true })
    .setInputFiles({
      name: "sfeer.png",
      mimeType: "image/png",
      buffer: png(600, 400),
    });
  const chosen = dialog.locator(".moodboard-editor > ul img");
  await expect(chosen.first()).toBeVisible();
  // Weghalen laat de afbeelding in de beeldbank staan; ze is daarna opnieuw te
  // kiezen zonder opnieuw te uploaden. De nieuwste staat vooraan.
  await dialog
    .getByRole("button", {
      name: "Afbeelding 1 verwijderen blok 3",
      exact: true,
    })
    .click();
  await expect(chosen).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Uit beeldbank kiezen blok 3", exact: true })
    .click();
  await dialog.locator(".image-picker button").first().click();
  await expect(chosen).toHaveCount(1);
  await dialog
    .getByLabel("Onderschrift afbeelding 1 blok 3", { exact: true })
    .fill("Rustige tinten");
  await dialog.getByLabel("Kop blok 3", { exact: true }).blur();

  // Blokken herschikken: het tweede blok omlaag.
  const secondBefore = await dialog
    .locator(".block-list > li")
    .nth(1)
    .locator("strong")
    .innerText();
  await dialog.getByRole("button", { name: "Blok 2 omlaag" }).click();
  await expect(
    dialog.locator(".block-list > li").nth(2).locator("strong"),
  ).toHaveText(secondBefore);

  // Publiceren legt een versie vast.
  await dialog.getByRole("button", { name: "Publiceren", exact: true }).click();
  await expect(dialog.getByText("Versie 1", { exact: false })).toBeVisible();
  await page.screenshot({ path: "outputs/qa/presentaties.png" });

  // De webviewer toont dezelfde versie in de browser. Het venster draait
  // afgeschermd, dus wat er staat komt uit het document zelf.
  await dialog.getByRole("button", { name: "Bekijken", exact: true }).click();
  const viewer = page.frameLocator(".viewer-frame");
  await expect(viewer.locator("h1")).toHaveText("Uitgebreid interieurplan");
  await expect(viewer.locator("figcaption")).toHaveText("Rustige tinten");
  await expect(viewer.locator("section.sheet svg")).toBeVisible();
  await expect(viewer.locator(".viewer-bar")).toContainText(
    "Alleen de PDF is maatvast",
  );
  await page.screenshot({ path: "outputs/qa/presentatie-webviewer.png" });
  // Het planblad past op het scherm in plaats van buiten beeld te lopen.
  await viewer.locator("section.sheet svg").scrollIntoViewIfNeeded();
  const sheet = await viewer.locator("section.sheet svg").boundingBox();
  const frame = await page.locator(".viewer-frame").boundingBox();
  expect(sheet!.width).toBeLessThanOrEqual(frame!.width);
  expect(sheet!.width).toBeGreaterThan(frame!.width * 0.5);
  await page.screenshot({ path: "outputs/qa/presentatie-webviewer-plan.png" });
  await page
    .getByRole("dialog")
    .filter({ hasText: "Presentatie bekijken" })
    .getByRole("button", { name: "Sluiten", exact: true })
    .click();

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "PDF", exact: true }).click();
  const pdf = await download;
  await pdf.saveAs("outputs/qa/presentatie-browser.pdf");

  // Een deellink wijst naar precies die versie en is in te trekken.
  await dialog.getByRole("button", { name: "Deellink", exact: true }).click();
  const link = await dialog
    .getByLabel("Deellink presentatie", { exact: true })
    .inputValue();
  expect(link).toContain("/view");
  const shared = await page.request.get(link);
  expect(shared.status()).toBe(200);
  expect(await shared.text()).toContain("Rustige tinten");
  // De maatvaste PDF hangt aan diezelfde link.
  expect((await page.request.get(link.replace(/\/view$/, ""))).status()).toBe(
    200,
  );
  await dialog
    .getByRole("button", { name: "Link intrekken", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Link intrekken", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get(link)).status()).toBe(404);

  // Het ontwerp wijzigen: de gepubliceerde versie blijft, het paneel meldt het.
  await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page
    .getByRole("button", { name: "Bank · linnen naturel", exact: true })
    .click();
  await page.getByRole("button", { name: "90° draaien", exact: true }).click();
  await saved();
  await page.getByRole("button", { name: "Presentaties", exact: true }).click();
  // Het paneel opent op dezelfde presentatie en haalt hem opnieuw op.
  await expect(
    page.getByText("nieuwe ontwerpwijzigingen beschikbaar", { exact: false }),
  ).toBeVisible();
  // De gepubliceerde versie blijft staan zoals hij was.
  await expect(page.getByRole("dialog")).toContainText("Versie 1");
  expect(errors).toEqual([]);
});

/*
 * Het exitcriterium van fase 3: "gebruiker maakt zonder programmeren een nieuw
 * meubelsymbool en lichtsymbool, gebruikt dit in twee projecten en importeert
 * veilig een bekend GLB."
 *
 * Het GLB-deel, de symboleneditor en "een nieuwe versie verandert geen
 * bestaande plaatsing" liggen al vast in de route hierboven met de muur en het
 * raam. Wat daar níét in zit, en hier wel: een zelfgemaakt **lichtsymbool** —
 * de elektrasymbolen elders zijn ingebouwd, niet zelf getekend — en het
 * gebruiken van dezelfde items in **twee** projecten. Dat laatste is de kern:
 * een bibliotheekitem hoort van de werkruimte te zijn en niet van het project
 * waarin het toevallig is gemaakt.
 */
test("eigen meubel- en lichtsymbool maken → in twee projecten gebruiken", async ({
  page,
}) => {
  // Deze route legt een lang pad af: twee items met een eigen symbool, twee
  // projecten en vier plaatsingen. Dat past niet in de standaardtijd.
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(
    await readFile("work/e2e-credentials.json", "utf8"),
  );
  await mkdir("outputs/qa", { recursive: true });
  if (ownerCookies.length) await page.context().addCookies(ownerCookies);
  await page.goto("/");
  // De herstelroute meldt zich af, dus een bewaarde sessie kan verlopen zijn.
  await expect(
    page
      .getByLabel("E-mailadres")
      .or(page.getByRole("button", { name: "Nieuw project", exact: true }))
      .first(),
  ).toBeVisible();
  if (await page.getByLabel("E-mailadres").isVisible()) {
    await page.getByLabel("E-mailadres").fill(credentials.email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    /*
     * Eerst wachten tot het aanmelden werkelijk rond is. Meteen doornavigeren
     * brak het verzoek af, waarna de app op het aanmeldscherm bleef staan.
     *
     * Ruim de tijd: aanmelden is bewust vertraagd tegen raden, en deze route
     * komt als laatste aan de beurt, vlak nadat de herstelroute zich heeft
     * afgemeld. De standaard vijf seconden zijn daar te kort voor.
     */
    await expect(
      page.getByRole("button", { name: "Nieuw project", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    ownerCookies = await page.context().cookies();
  }

  const saved = () =>
    expect(page.getByText("Server opgeslagen", { exact: false })).toBeVisible();
  const nieuwProject = async (naam: string) => {
    await page.goto("/");
    const nieuw = page.getByRole("button", {
      name: "Nieuw project",
      exact: true,
    });
    await expect(nieuw).toBeVisible({ timeout: 30000 });
    await nieuw.click();
    await page.getByLabel("Projectnaam").fill(naam);
    await page.getByLabel("Start met de fictieve woonkamer").check();
    await page
      .getByRole("button", { name: "Project aanmaken", exact: true })
      .click();
    await saved();
    return page.url();
  };
  const bibliotheek = () =>
    page
      .getByRole("button", { name: "Eigen bibliotheek", exact: true })
      .click();

  const eersteProject = await nieuwProject("Bibliotheekstudio een");

  /*
   * Twee items, zonder ook maar iets te programmeren: een meubel en een
   * lichtpunt, elk met een zelf getekend 2D-symbool.
   */
  for (const item of [
    {
      naam: "Studiobank",
      type: "sofa",
      categorie: "Zitmeubels",
      breedte: "2200",
      diepte: "900",
      hoogte: "760",
      vorm: "Rechthoek toevoegen",
    },
    {
      naam: "Studiospot",
      type: "light",
      categorie: "Verlichting",
      breedte: "120",
      diepte: "120",
      hoogte: "60",
      vorm: "Ellips toevoegen",
    },
  ]) {
    await bibliotheek();
    await page
      .getByRole("button", { name: "Bibliotheekitem maken", exact: true })
      .click();
    await page.getByLabel("Bibliotheeknaam", { exact: true }).fill(item.naam);
    await page
      .getByLabel("Item categorie", { exact: true })
      .fill(item.categorie);
    await page
      .getByLabel("Bibliotheektype", { exact: true })
      .selectOption(item.type);
    await page
      .getByLabel("Bibliotheekbreedte", { exact: true })
      .fill(item.breedte);
    await page
      .getByLabel("Bibliotheekdiepte", { exact: true })
      .fill(item.diepte);
    await page
      .getByLabel("Bibliotheekhoogte", { exact: true })
      .fill(item.hoogte);
    // Een eigen symbool tekenen: vorm erbij, maat instellen, toepassen.
    await page.getByRole("button", { name: item.vorm, exact: true }).click();
    await page.getByLabel("Symbool width", { exact: true }).fill("60");
    await page.getByLabel("Symbool height", { exact: true }).fill("60");
    await page
      .getByRole("button", { name: "Vorm toepassen", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Versie bewaren", exact: true })
      .click();
    // Terug in de lijst, dus de versie is werkelijk bewaard.
    await expect(
      page.getByRole("button", { name: `Plaats ${item.naam}`, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  }
  await page.screenshot({ path: "outputs/qa/bibliotheek-eigen-symbolen.png" });

  /** Plaatst beide items en geeft terug wat er daarna in het ontwerp staat. */
  const plaatsBeide = async () => {
    for (const naam of ["Studiobank", "Studiospot"]) {
      await bibliotheek();
      await page
        .getByRole("button", { name: `Plaats ${naam}`, exact: true })
        .click();
      await saved();
    }
    return page.evaluate(async () => {
      const variantId = location.pathname.split("/").pop();
      const me = await (await fetch("/api/v1/me")).json();
      const organizationId = me.organizations[0].id;
      const document = await (
        await fetch("/api/v1/variants/" + variantId + "/document", {
          headers: { "x-organization-id": organizationId },
        })
      ).json();
      return (document.items as { kind: string; libraryRef?: unknown }[])
        .filter((i) => i.libraryRef)
        .map((i) => ({ kind: i.kind, ref: JSON.stringify(i.libraryRef) }));
    });
  };

  const inEerste = await plaatsBeide();
  // Beide staan er, en het lichtpunt is werkelijk als lichtpunt bewaard.
  expect(inEerste.map((i) => i.kind).sort()).toEqual(["light", "sofa"]);

  // Een tweede project, en dezelfde twee items komen er gewoon in.
  const tweedeProject = await nieuwProject("Bibliotheekstudio twee");
  expect(tweedeProject).not.toBe(eersteProject);
  const inTweede = await plaatsBeide();
  expect(inTweede.map((i) => i.kind).sort()).toEqual(["light", "sofa"]);
  // Het is dezelfde bibliotheekversie: een item is van de werkruimte, niet van
  // het project waarin het toevallig is gemaakt.
  expect(inTweede.map((i) => i.ref).sort()).toEqual(
    inEerste.map((i) => i.ref).sort(),
  );
  await page.screenshot({ path: "outputs/qa/bibliotheek-tweede-project.png" });

  // En het eerste project is er niets van kwijtgeraakt.
  await page.goto(eersteProject);
  await saved();
  await expect(
    page.getByRole("button", { name: "Studiobank", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Studiospot", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
