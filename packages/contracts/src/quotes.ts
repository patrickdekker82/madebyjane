import { z } from "zod";
import { id } from "./index";
const date = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Gebruik een geldige datum tussen 2000 en 2099.");
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/);
const percent = z
  .string()
  .regex(/^(?:\d{1,2}(?:\.\d{1,3})?|100(?:\.0{1,3})?)$/);
export const quoteLineSchema = z
  .object({
    id,
    description: z.string().trim().min(1).max(300),
    unit: z.string().trim().min(1).max(30),
    quantity: decimal,
    unitPrice: z.string().regex(/^-?(?:0|[1-9]\d{0,6})(?:\.\d{1,4})?$/),
    discount: percent,
    taxCategory: z.string().trim().min(1).max(60),
    taxRate: percent,
    source: z.object({ entryId: id, versionId: id }).strict().nullable(),
    priceNote: z.string().trim().min(1).max(300),
  })
  .strict();
export const quoteDefinitionSchema = z
  .object({
    customer: z.string().trim().min(1).max(2000),
    title: z.string().trim().min(1).max(200),
    date,
    validUntil: date,
    currency: z.literal("EUR"),
    terms: z.string().trim().max(10000),
    lines: z.array(quoteLineSchema).max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.validUntil < v.date)
      ctx.addIssue({
        code: "custom",
        message: "Geldigheid ligt vóór de offertedatum.",
      });
    if (new Set(v.lines.map((l) => l.id)).size !== v.lines.length)
      ctx.addIssue({ code: "custom", message: "Dubbele regel-ID." });
    const sources = v.lines.flatMap((l) =>
      l.source ? [l.source.entryId] : [],
    );
    if (new Set(sources).size !== sources.length)
      ctx.addIssue({
        code: "custom",
        message: "Een materiaalkeuze mag maar eenmaal voorkomen.",
      });
    const rates = new Map<string, string>();
    for (const l of v.lines) {
      if (
        rates.has(l.taxCategory) &&
        Number(rates.get(l.taxCategory)) !== Number(l.taxRate)
      )
        ctx.addIssue({
          code: "custom",
          message: "Eén tarief per belastingcategorie vereist.",
        });
      rates.set(l.taxCategory, l.taxRate);
    }
  });
export const quoteSaveSchema = z
  .object({
    id,
    requestId: id,
    baseVersion: z.number().int().min(0),
    definition: quoteDefinitionSchema,
  })
  .strict();
export const quoteFinalizeSchema = z
  .object({ requestId: id, baseVersion: z.number().int().min(1) })
  .strict();
export type QuoteDefinition = z.infer<typeof quoteDefinitionSchema>;
export type QuoteLine = z.infer<typeof quoteLineSchema>;
export type QuoteRecord = {
  id: string;
  version: number;
  number: string | null;
  definition: QuoteDefinition;
  totals: QuoteTotals;
  created_at: string;
};
export type QuoteTotals = {
  lines: { id: string; net: string }[];
  taxes: { category: string; rate: string; net: string; tax: string }[];
  net: string;
  tax: string;
  total: string;
};
