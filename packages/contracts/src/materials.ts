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
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value;
}, "Gebruik een geldige datum.");
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/, "Gebruik een positief aantal met maximaal drie decimalen.");
const percent = z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/, "Gebruik een opslag tussen 0 en 99,99 procent.");
const step = z.string().regex(/^(?:0|[1-9]\d{0,4})(?:\.\d{1,3})?$/).refine(value => Number(value) > 0, "Een bestelstap moet groter dan nul zijn.");
const mm = z.number().int().nonnegative().max(1e12);
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
  supplier: z.string().trim().max(120),
  collection: z.string().trim().max(120),
  sku: z.string().trim().max(120),
  colorCode: z.string().trim().max(80),
  unit: z.enum(["m²", "m", "stuk", "liter", "kg", "rol"]),
  quantity: decimal.nullable(),
  quantityReason: z.string().trim().max(1000),
  status: z.enum(["undecided", "proposed", "sample_requested", "chosen", "client_confirmed", "replaced"]),
  confirmationDate: date.nullable(),
  confirmationNote: z.string().trim().max(1000),
  notes: z.string().trim().max(2000),
};
type Fields = { quantity: string | null; quantityReason: string; status: string; confirmationDate: string | null; confirmationNote: string };
const commonRules = (value: Fields, ctx: z.RefinementCtx) => {
  if (value.quantity !== null && !value.quantityReason)
    ctx.addIssue({ code: "custom", path: ["quantityReason"], message: "Onderbouw de handmatig ingevoerde hoeveelheid." });
  if (value.status === "client_confirmed" && (!value.confirmationDate || !value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Leg datum en bron van het klantakkoord vast." });
  if (value.status !== "client_confirmed" && (value.confirmationDate !== null || value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Klantakkoord hoort alleen bij de status Door klant bevestigd." });
};
/** Wat de client instuurt: zonder berekende bron, die vult de server in. */
export const materialDefinitionInputSchema = z.object(definitionFields).strict().superRefine(commonRules);
/** Wat wordt opgeslagen. Een berekende hoeveelheid moet bij de bron passen. */
export const materialDefinitionSchema = z.object({
  ...definitionFields,
  calculation: quantitySourceSchema.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (!value.calculation) return commonRules(value, ctx);
  if (value.unit !== value.calculation.unit)
    ctx.addIssue({ code: "custom", path: ["unit"], message: "De eenheid moet bij de berekende hoeveelheid passen." });
  if (value.quantity === null)
    ctx.addIssue({ code: "custom", path: ["quantity"], message: "Een berekende keuze heeft altijd een hoeveelheid." });
  else if (value.quantity !== value.calculation.orderQuantity && !value.quantityReason)
    ctx.addIssue({ code: "custom", path: ["quantityReason"], message: "Onderbouw waarom je afwijkt van de berekende hoeveelheid." });
  if (value.status === "client_confirmed" && (!value.confirmationDate || !value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Leg datum en bron van het klantakkoord vast." });
  if (value.status !== "client_confirmed" && (value.confirmationDate !== null || value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Klantakkoord hoort alleen bij de status Door klant bevestigd." });
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
