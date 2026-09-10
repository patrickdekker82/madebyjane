import { z } from "zod";
import { id } from "./index";
export const materialStatuses = {
  undecided: "Nog te kiezen", proposed: "Voorgesteld", sample_requested: "Monster aangevraagd",
  chosen: "Gekozen", client_confirmed: "Door klant bevestigd", replaced: "Vervangen",
} as const;
export const quantityBasisLabels = {
  floor_area: "Netto vloeroppervlak", wall_area: "Netto wandoppervlak",
  perimeter: "Netto omtrek", plinth: "Plintlengte (omtrek min deuren)",
} as const;
export const quantityBasisUnits = {
  floor_area: "m²", wall_area: "m²", perimeter: "m", plinth: "m",
} as const;
/** Monsterstatus staat los van de keuzestatus: een monster kan er zijn zonder besluit. */
export const sampleStatuses = {
  none: "Geen monster", requested: "Monster aangevraagd", received: "Monster ontvangen",
  approved: "Monster goedgekeurd", rejected: "Monster afgewezen",
} as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value;
}, "Gebruik een geldige datum.");
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/, "Gebruik een positief aantal met maximaal drie decimalen.");
const percent = z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/, "Gebruik een opslag tussen 0 en 99,99 procent.");
const step = z.string().regex(/^(?:0|[1-9]\d{0,4})(?:\.\d{1,3})?$/).refine(value => Number(value) > 0, "Een bestelstap moet groter dan nul zijn.");
const mm = z.number().int().nonnegative().max(1e12);
const money = z.string().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/, "Gebruik een bedrag met maximaal twee decimalen.");
/** Product- en prijsgegevens; identiek voor de gekozen optie en voor alternatieven. */
const productFields = {
  supplier: z.string().trim().max(120),
  collection: z.string().trim().max(120),
  sku: z.string().trim().max(120),
  colorCode: z.string().trim().max(80),
  priceSource: z.string().trim().max(160).default(""),
  priceDate: date.nullable().default(null),
  unitPrice: money.nullable().default(null),
};
type Product = { priceSource: string; priceDate: string | null; unitPrice: string | null };
const productRules = (value: Product, ctx: z.RefinementCtx) => {
  if (value.unitPrice !== null && (!value.priceSource || value.priceDate === null))
    ctx.addIssue({ code: "custom", path: ["priceSource"], message: "Noteer bij een prijs ook de bron en de prijsdatum." });
  if (value.priceDate !== null && !value.priceSource)
    ctx.addIssue({ code: "custom", path: ["priceSource"], message: "Noteer waar de prijsdatum vandaan komt." });
};
/** Een alternatief is een volwaardig productvoorstel dat nog niet gekozen is. */
export const alternativeSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  ...productFields,
  notes: z.string().trim().max(1000),
}).strict().superRefine(productRules);
/** Wat de gebruiker vraagt te berekenen. De server bepaalt zelf de uitkomst. */
export const quantityRequestSchema = z.object({
  variantId: id,
  roomId: z.string().trim().min(1).max(4000),
  basis: z.enum(["floor_area", "wall_area", "perimeter", "plinth"]),
  wastePercent: percent,
  orderStep: step.nullable(),
}).strict();
/** Wat de server heeft berekend en onveranderlijk bij de materiaalversie bewaart. */
export const quantitySourceSchema = quantityRequestSchema.extend({
  sourceRevision: z.number().int().nonnegative(),
  computedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  unit: z.enum(["m²", "m"]),
  inputs: z.object({
    grossFloorAreaMm2: mm, netFloorAreaMm2: mm, netPerimeterMm: mm,
    plinthLengthMm: mm, wallAreaMm2: mm, doorWidthMm: mm, openingAreaMm2: mm,
  }).strict(),
  netQuantity: decimal, wasteQuantity: decimal, grossQuantity: decimal, orderQuantity: decimal,
}).strict();
const definitionFields = {
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  room: z.string().trim().max(120),
  ...productFields,
  sampleStatus: z.enum(["none", "requested", "received", "approved", "rejected"]).default("none"),
  sampleDate: date.nullable().default(null),
  alternatives: z.array(alternativeSchema).max(10).default([]),
  /** Provenance: het alternatief uit de vorige versie dat hiermee gekozen is. */
  chosenFrom: z.object({ id, name: z.string().trim().min(1).max(120) }).strict().nullable().default(null),
  unit: z.enum(["m²", "m", "stuk", "liter", "kg", "rol"]),
  quantity: decimal.nullable(),
  quantityReason: z.string().trim().max(1000),
  status: z.enum(["undecided", "proposed", "sample_requested", "chosen", "client_confirmed", "replaced"]),
  confirmationDate: date.nullable(),
  confirmationNote: z.string().trim().max(1000),
  notes: z.string().trim().max(2000),
};
type Fields = {
  quantity: string | null; quantityReason: string; status: string;
  confirmationDate: string | null; confirmationNote: string;
  sampleStatus: string; sampleDate: string | null;
  alternatives: { id: string }[];
} & Product;
/** Regels die voor iedere versie gelden, ongeacht of de hoeveelheid berekend is. */
const sharedRules = (value: Fields, ctx: z.RefinementCtx) => {
  productRules(value, ctx);
  if (value.sampleStatus === "none" && value.sampleDate !== null)
    ctx.addIssue({ code: "custom", path: ["sampleDate"], message: "Een monsterdatum hoort bij een monsterstatus." });
  if (value.sampleStatus !== "none" && value.sampleDate === null)
    ctx.addIssue({ code: "custom", path: ["sampleDate"], message: "Leg vast op welke datum deze monsterstatus geldt." });
  if (value.status === "sample_requested" && value.sampleStatus === "none")
    ctx.addIssue({ code: "custom", path: ["sampleStatus"], message: "Zet ook de monsterstatus wanneer de keuze op Monster aangevraagd staat." });
  if (new Set(value.alternatives.map(a => a.id)).size !== value.alternatives.length)
    ctx.addIssue({ code: "custom", path: ["alternatives"], message: "Elk alternatief heeft een eigen ID." });
  if (value.status === "client_confirmed" && (!value.confirmationDate || !value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Leg datum en bron van het klantakkoord vast." });
  if (value.status !== "client_confirmed" && (value.confirmationDate !== null || value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Klantakkoord hoort alleen bij de status Door klant bevestigd." });
};
const manualQuantityRule = (value: Fields, ctx: z.RefinementCtx) => {
  if (value.quantity !== null && !value.quantityReason)
    ctx.addIssue({ code: "custom", path: ["quantityReason"], message: "Onderbouw de handmatig ingevoerde hoeveelheid." });
};
/** Wat de client instuurt: zonder berekende bron, die vult de server in. */
export const materialDefinitionInputSchema = z.object(definitionFields).strict().superRefine((value, ctx) => {
  sharedRules(value, ctx);
  manualQuantityRule(value, ctx);
});
/** Wat wordt opgeslagen. Een berekende hoeveelheid moet bij de bron passen. */
export const materialDefinitionSchema = z.object({
  ...definitionFields,
  calculation: quantitySourceSchema.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  sharedRules(value, ctx);
  if (!value.calculation) return manualQuantityRule(value, ctx);
  if (value.unit !== value.calculation.unit)
    ctx.addIssue({ code: "custom", path: ["unit"], message: "De eenheid moet bij de berekende hoeveelheid passen." });
  if (value.quantity === null)
    ctx.addIssue({ code: "custom", path: ["quantity"], message: "Een berekende keuze heeft altijd een hoeveelheid." });
  else if (value.quantity !== value.calculation.orderQuantity && !value.quantityReason)
    ctx.addIssue({ code: "custom", path: ["quantityReason"], message: "Onderbouw waarom je afwijkt van de berekende hoeveelheid." });
});
export const materialPublishSchema = z.object({
  entryId: id, versionId: id, baseVersion: z.number().int().min(0),
  definition: materialDefinitionInputSchema,
  calculation: quantityRequestSchema.nullable().default(null),
}).strict();
export type QuantityRequest = z.infer<typeof quantityRequestSchema>;
export type QuantitySource = z.infer<typeof quantitySourceSchema>;
export type MaterialDefinitionInput = z.infer<typeof materialDefinitionInputSchema>;
export type MaterialDefinition = z.infer<typeof materialDefinitionSchema>;
export type MaterialVersion = {
  id: string; entry_id: string; version: number; definition: MaterialDefinition;
  user_id: string; created_at: string;
};
/**
 * Materiaalversies van voor de prijs-, monster- en alternatievenvelden missen
 * die sleutels. De lijst leest ruwe rijen, dus vullen we ze hier aan zonder te
 * valideren; een oude versie blijft precies zoals hij bewaard is.
 */
export function withDefaults(definition: MaterialDefinition): MaterialDefinition {
  return {
    ...definition,
    priceSource: definition.priceSource ?? "",
    priceDate: definition.priceDate ?? null,
    unitPrice: definition.unitPrice ?? null,
    sampleStatus: definition.sampleStatus ?? "none",
    sampleDate: definition.sampleDate ?? null,
    alternatives: definition.alternatives ?? [],
    chosenFrom: definition.chosenFrom ?? null,
    calculation: definition.calculation ?? null,
  };
}
export type Alternative = z.infer<typeof alternativeSchema>;
