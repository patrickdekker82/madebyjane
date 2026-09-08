import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
test("offerteconcept, decimalen, finalisatie en vaste prijzen na herladen", async ({
  page,
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
