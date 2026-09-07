import { expect, test } from "vitest";
import { materialDefinitionSchema, materialPublishSchema } from "../packages/contracts/src/materials";
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
