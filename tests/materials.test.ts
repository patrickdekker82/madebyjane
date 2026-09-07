import { expect, test } from "vitest";
import { materialDefinitionSchema } from "../packages/contracts/src/materials";
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
