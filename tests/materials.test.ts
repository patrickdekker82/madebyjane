import { expect, test } from "vitest";
import { materialDefinitionSchema, materialPublishSchema, withDefaults, type MaterialDefinition } from "../packages/contracts/src/materials";
import { estimatedAmount } from "../packages/domain/src/pricing";
export const definition = { name: "Eiken vloer", category: "Vloer", room: "Woonkamer", supplier: "", collection: "", sku: "", colorCode: "", unit: "m²", quantity: null, quantityReason: "", status: "undecided", confirmationDate: null, confirmationNote: "", notes: "" };
test("onbekende materiaalhoeveelheid blijft onbekend en handmatige invoer vereist onderbouwing", () => {
  expect(materialDefinitionSchema.parse(definition).quantity).toBeNull();
  expect(materialDefinitionSchema.safeParse({ ...definition, quantity: "29.04" }).success).toBe(false);
  expect(materialDefinitionSchema.parse({ ...definition, quantity: "29.040", quantityReason: "Ingemeten leverancier" }).quantity).toBe("29.040");
  for (const quantity of ["-1", "1e3", "NaN", "1.2345", "10000000", "1,5"])
    expect(materialDefinitionSchema.safeParse({ ...definition, quantity, quantityReason: "Meting" }).success).toBe(false);
});
test("klantbevestiging vereist werkelijke datum en bron; interne keuze krijgt geen akkoord", () => {
  expect(materialDefinitionSchema.parse({ ...definition, status: "chosen" }).confirmationDate).toBeNull();
  expect(materialDefinitionSchema.safeParse({ ...definition, status: "client_confirmed" }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, status: "client_confirmed", confirmationDate: "2026-02-30", confirmationNote: "E-mail klant" }).success).toBe(false);
  expect(materialDefinitionSchema.parse({ ...definition, status: "client_confirmed", confirmationDate: "2026-09-07", confirmationNote: "E-mail klant" }).status).toBe("client_confirmed");
  expect(materialDefinitionSchema.safeParse({ ...definition, confirmationNote: "E-mail klant" }).success).toBe(false);
});
const calculation = {
  variantId: crypto.randomUUID(), roomId: "node-a:node-b", basis: "floor_area", wastePercent: "10", orderStep: "0.5",
  sourceRevision: 3, computedAt: "2026-09-07T10:00:00.000Z", unit: "m²",
  inputs: { grossFloorAreaMm2: 29040000, netFloorAreaMm2: 27154275, netPerimeterMm: 20608, plinthLengthMm: 19678, wallAreaMm2: 51000000, doorWidthMm: 930, openingAreaMm2: 6039000 },
  netQuantity: "27.154", wasteQuantity: "2.715", grossQuantity: "29.869", orderQuantity: "30",
};
test("een berekende hoeveelheid hoort bij zijn bron; afwijken vereist onderbouwing", () => {
  const calculated = { ...definition, quantity: "30", calculation };
  expect(materialDefinitionSchema.parse(calculated).calculation!.sourceRevision).toBe(3);
  expect(materialDefinitionSchema.parse(definition).calculation).toBeNull();
  expect(materialDefinitionSchema.safeParse({ ...calculated, quantity: null }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...calculated, quantity: "34" }).success).toBe(false);
  expect(materialDefinitionSchema.parse({ ...calculated, quantity: "34", quantityReason: "Levering per hele pakken." }).quantity).toBe("34");
  expect(materialDefinitionSchema.safeParse({ ...calculated, unit: "m" }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...calculated, calculation: { ...calculation, computedAt: "gisteren" } }).success).toBe(false);
});
test("de client stuurt alleen een rekenopdracht, geen uitkomst", () => {
  const request = { variantId: calculation.variantId, roomId: calculation.roomId, basis: "floor_area", wastePercent: "10", orderStep: "0.5" };
  const publish = { entryId: crypto.randomUUID(), versionId: crypto.randomUUID(), baseVersion: 0, definition };
  expect(materialPublishSchema.parse(publish).calculation).toBeNull();
  expect(materialPublishSchema.parse({ ...publish, calculation: request }).calculation!.basis).toBe("floor_area");
  // Een meegestuurde uitkomst wordt geweigerd; de server rekent zelf.
  expect(materialPublishSchema.safeParse({ ...publish, definition: { ...definition, calculation } }).success).toBe(false);
  expect(materialPublishSchema.safeParse({ ...publish, calculation: { ...request, orderStep: "0" } }).success).toBe(false);
  expect(materialPublishSchema.safeParse({ ...publish, calculation: { ...request, wastePercent: "150" } }).success).toBe(false);
  expect(materialPublishSchema.safeParse({ ...publish, calculation: { ...request, basis: "plafond" } }).success).toBe(false);
  expect(materialPublishSchema.safeParse({ ...publish, calculation: { ...request, variantId: "geen-uuid" } }).success).toBe(false);
});
const alternative = {
  id: crypto.randomUUID(), name: "Es geborsteld", supplier: "Andere vloermaker", collection: "Licht",
  sku: "V-02", colorCode: "L20", priceSource: "Offerte 2026-114", priceDate: "2026-09-01",
  unitPrice: "68.50", notes: "Langere levertijd.",
};
test("een prijs zonder bron of datum wordt geweigerd, met bron en datum bewaard", () => {
  expect(materialDefinitionSchema.parse(definition).unitPrice).toBeNull();
  expect(materialDefinitionSchema.safeParse({ ...definition, unitPrice: "68.50" }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, unitPrice: "68.50", priceSource: "Prijslijst" }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, priceDate: "2026-09-01" }).success).toBe(false);
  const priced = materialDefinitionSchema.parse({ ...definition, unitPrice: "68.50", priceSource: "Prijslijst 2026", priceDate: "2026-09-01" });
  expect(priced.unitPrice).toBe("68.50");
  for (const unitPrice of ["68,50", "68.505", "-1", "1e2", "10000000"])
    expect(materialDefinitionSchema.safeParse({ ...definition, unitPrice, priceSource: "Prijslijst", priceDate: "2026-09-01" }).success).toBe(false);
});
test("monsterstatus staat los van de keuzestatus maar vraagt wel een datum", () => {
  expect(materialDefinitionSchema.parse(definition).sampleStatus).toBe("none");
  expect(materialDefinitionSchema.safeParse({ ...definition, sampleStatus: "received" }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, sampleDate: "2026-09-01" }).success).toBe(false);
  expect(materialDefinitionSchema.parse({ ...definition, sampleStatus: "received", sampleDate: "2026-09-01" }).sampleDate).toBe("2026-09-01");
  // Keuzestatus "Monster aangevraagd" zonder monsterstatus is een tegenstrijdige registratie.
  expect(materialDefinitionSchema.safeParse({ ...definition, status: "sample_requested" }).success).toBe(false);
  expect(materialDefinitionSchema.parse({ ...definition, status: "sample_requested", sampleStatus: "requested", sampleDate: "2026-09-05" }).status).toBe("sample_requested");
});
test("alternatieven zijn volwaardige productvoorstellen met eigen prijsregels", () => {
  expect(materialDefinitionSchema.parse(definition).alternatives).toEqual([]);
  expect(materialDefinitionSchema.parse({ ...definition, alternatives: [alternative] }).alternatives[0]!.sku).toBe("V-02");
  expect(materialDefinitionSchema.safeParse({ ...definition, alternatives: [{ ...alternative, name: "" }] }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, alternatives: [{ ...alternative, priceSource: "" }] }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, alternatives: [alternative, { ...alternative, name: "Dubbel ID" }] }).success).toBe(false);
  expect(materialDefinitionSchema.safeParse({ ...definition, alternatives: Array.from({ length: 11 }, () => ({ ...alternative, id: crypto.randomUUID() })) }).success).toBe(false);
  expect(materialDefinitionSchema.parse({ ...definition, chosenFrom: { id: alternative.id, name: alternative.name } }).chosenFrom!.name).toBe("Es geborsteld");
  expect(materialDefinitionSchema.safeParse({ ...definition, chosenFrom: { id: alternative.id } }).success).toBe(false);
});
test("oudere materiaalversies krijgen lege standaardwaarden, niet ontbrekende velden", () => {
  const legacy = { ...definition } as unknown as MaterialDefinition;
  const filled = withDefaults(legacy);
  expect(filled.alternatives).toEqual([]);
  expect(filled.sampleStatus).toBe("none");
  expect([filled.priceSource, filled.priceDate, filled.unitPrice, filled.chosenFrom, filled.calculation]).toEqual(["", null, null, null, null]);
  // Bestaande waarden blijven onaangeroerd.
  expect(withDefaults({ ...filled, priceSource: "Offerte", priceDate: "2026-09-01", unitPrice: "10.00" }).unitPrice).toBe("10.00");
});
test("het indicatiebedrag rekent met decimalen en zwijgt bij ontbrekende gegevens", () => {
  expect(estimatedAmount("30", "68.50")).toBe("2055.00");
  expect(estimatedAmount("29.869", "68.50")).toBe("2046.03");
  expect(estimatedAmount(null, "68.50")).toBeNull();
  expect(estimatedAmount("30", null)).toBeNull();
  // 0,1 * 0,2 blijft exact; een float geeft hier 0,020000000000000004.
  expect(estimatedAmount("0.1", "0.2")).toBe("0.02");
});
