import { z } from "zod";
import { id } from "./index";
export const quoteDate = z
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
    purchaseUnitPrice: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,4})?$/)
      .optional(),
    purchaseNote: z.string().trim().min(1).max(300).optional(),
    discount: percent,
    taxCategory: z.string().trim().min(1).max(60),
    taxRate: percent,
    source: z.object({ entryId: id, versionId: id }).strict().nullable(),
    designSource: z
      .object({ variantId: id, revisionId: id, itemId: id })
      .strict()
      .optional(),
    priceRef: z.object({ id }).strict().optional(),
    overlapReason: z.string().trim().max(1000).optional(),
    priceNote: z.string().trim().min(1).max(300),
  })
  .strict();
export const quoteDefinitionSchema = z
  .object({
    customer: z.string().trim().min(1).max(2000),
    seller: z.string().trim().max(2000).optional(),
    title: z.string().trim().min(1).max(200),
    date: quoteDate,
    validUntil: quoteDate,
    currency: z.literal("EUR"),
    terms: z.string().trim().max(10000),
    lines: z.array(quoteLineSchema).max(200),
    attachments: z.array(id).max(12).optional(),
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
    const designKeys = v.lines.flatMap((l) =>
      l.designSource
        ? [l.designSource.variantId + ":" + l.designSource.itemId]
        : [],
    );
    if (new Set(designKeys).size !== designKeys.length)
      ctx.addIssue({
        code: "custom",
        message: "Een ontwerpobject mag maar eenmaal voorkomen.",
      });
    if (new Set(v.attachments ?? []).size !== (v.attachments ?? []).length)
      ctx.addIssue({ code: "custom", message: "Dubbele bijlage." });
    for (const l of v.lines) {
      if (l.purchaseUnitPrice !== undefined && !l.purchaseNote)
        ctx.addIssue({
          code: "custom",
          message: "Vermeld de bron of datum van de inkoopprijs.",
          path: ["lines", v.lines.indexOf(l), "purchaseNote"],
        });
      if (l.purchaseUnitPrice === undefined && l.purchaseNote)
        ctx.addIssue({
          code: "custom",
          message: "Een inkoopprijs ontbreekt bij de inkoopbron.",
          path: ["lines", v.lines.indexOf(l), "purchaseUnitPrice"],
        });
      if (l.source && l.designSource)
        ctx.addIssue({ code: "custom", message: "Kies één bron per post." });
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
  status?: QuoteStatus;
  event_version?: number;
  content_hash?: string;
  frozen?: { attachments: AttachmentSnapshot[] };
};
export const quoteStatuses = {
  draft: "Concept",
  final: "Definitief",
  sent: "Verzonden (handmatig geregistreerd)",
  accepted: "Geaccepteerd (handmatig geregistreerd)",
  rejected: "Afgewezen",
  expired: "Verlopen",
  replaced: "Vervangen",
} as const;
export type QuoteStatus = keyof typeof quoteStatuses;
export const auditActions = {
  "quote.saved": "Concept opgeslagen",
  "quote.finalized": "Definitief gemaakt",
  "quote.share_created": "Deellink gemaakt",
  "quote.share_revoked": "Deellink ingetrokken",
} as const;
export type QuoteAuditAction = keyof typeof auditActions;
/** Eén registratie uit audit_events. `version` is null bij regels van vóór migration 0013. */
export type QuoteAuditEntry = {
  id: string;
  action: QuoteAuditAction;
  version: number | null;
  number: string | null;
  created_at: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
};
export const statusInput = z
  .object({
    requestId: id,
    baseEventVersion: z.number().int().min(0),
    status: z.enum(["sent", "accepted", "rejected", "expired"]),
    occurredOn: quoteDate,
    actor: z.string().trim().min(1).max(200),
    evidence: z.string().trim().min(1).max(2000),
  })
  .strict();
export const priceInput = z
  .object({
    id,
    entryId: id,
    baseVersion: z.number().int().min(0),
    sourceType: z.enum(["material", "library"]),
    sourceId: id,
    unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,4})?$/),
    unit: z.string().trim().min(1).max(30),
    taxCategory: z.string().trim().min(1).max(60),
    taxRate: percent,
    date: quoteDate,
    note: z.string().trim().min(1).max(300),
  })
  .strict();
export type CatalogPrice = z.infer<typeof priceInput> & { version: number };
export const attachmentInput = z.discriminatedUnion("kind", [
  z
    .object({
      id,
      kind: z.literal("plan"),
      title: z.string().trim().min(1).max(160),
      revisionId: id,
      scale: z.union([z.literal(20), z.literal(50), z.literal(100)]),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal("materials"),
      title: z.string().trim().min(1).max(160),
      versionIds: z.array(id).min(1).max(100),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal("text"),
      title: z.string().trim().min(1).max(160),
      text: z.string().trim().min(1).max(10000),
    })
    .strict(),
]);
export type AttachmentSnapshot = {
  id: string;
  title: string;
  kind: "plan" | "materials" | "text";
  html: string;
  hash: string;
  revisionId?: string;
  variantId?: string;
  materialVersions?: { entryId: string; versionId: string }[];
};
export type QuoteTotals = {
  lines: { id: string; net: string }[];
  taxes: { category: string; rate: string; net: string; tax: string }[];
  net: string;
  tax: string;
  total: string;
  commercial?: {
    lines: { id: string; cost: string | null }[];
    knownCost: string;
    margin: string | null;
    marginPercent: string | null;
    missingLineIds: string[];
  };
};
export type QuoteSummary = Omit<QuoteRecord, "definition" | "frozen"> & {
  definition: Pick<QuoteDefinition, "title">;
};
