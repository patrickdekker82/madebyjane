import { z } from "zod";
import { id } from "./index";
export const materialStatuses = {
  undecided: "Nog te kiezen", proposed: "Voorgesteld", sample_requested: "Monster aangevraagd",
  chosen: "Gekozen", client_confirmed: "Door klant bevestigd", replaced: "Vervangen",
} as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value;
}, "Gebruik een geldige datum.");
export const materialDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  room: z.string().trim().max(120),
  supplier: z.string().trim().max(120),
  collection: z.string().trim().max(120),
  sku: z.string().trim().max(120),
  colorCode: z.string().trim().max(80),
  unit: z.enum(["m²", "m", "stuk", "liter", "kg", "rol"]),
  quantity: z.string().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/, "Gebruik een positief aantal met maximaal drie decimalen.").nullable(),
  quantityReason: z.string().trim().max(1000),
  status: z.enum(["undecided", "proposed", "sample_requested", "chosen", "client_confirmed", "replaced"]),
  confirmationDate: date.nullable(),
  confirmationNote: z.string().trim().max(1000),
  notes: z.string().trim().max(2000),
}).strict().superRefine((value, ctx) => {
  if (value.quantity !== null && !value.quantityReason)
    ctx.addIssue({ code: "custom", path: ["quantityReason"], message: "Onderbouw de handmatig ingevoerde hoeveelheid." });
  if (value.status === "client_confirmed" && (!value.confirmationDate || !value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Leg datum en bron van het klantakkoord vast." });
  if (value.status !== "client_confirmed" && (value.confirmationDate !== null || value.confirmationNote))
    ctx.addIssue({ code: "custom", path: ["confirmationNote"], message: "Klantakkoord hoort alleen bij de status Door klant bevestigd." });
});
export const materialPublishSchema = z.object({
  entryId: id, versionId: id, baseVersion: z.number().int().min(0), definition: materialDefinitionSchema,
}).strict();
export type MaterialDefinition = z.infer<typeof materialDefinitionSchema>;
export type MaterialVersion = {
  id: string; entry_id: string; version: number; definition: MaterialDefinition;
  user_id: string; created_at: string;
};
