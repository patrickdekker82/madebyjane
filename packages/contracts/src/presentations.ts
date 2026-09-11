import { z } from "zod";

const id = z.uuid();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * Presentatiedocument.
 *
 * Er zijn twee gescheiden dingen: de **definitie**, die de gebruiker instelt,
 * en de **inhoud**, die bij het publiceren uit het ontwerp wordt gehaald en
 * daarna onveranderlijk bij die versie hoort. Een blok zegt dus welk planblad
 * op welke schaal getoond wordt; wat er precies op stond op het moment van
 * publiceren staat in de bevroren inhoud, met de bronrevisie erbij.
 *
 * Daardoor verandert een gedeelde presentatie nooit vanzelf mee met het
 * ontwerp, en is achteraf te zien welke revisie de klant heeft gezien.
 */
export const presentationTemplates = {
  compact: "Compact voorstel",
  extended: "Uitgebreid interieurplan",
  technical: "Technisch planpakket",
} as const;
export const templateSchema = z.enum(["compact", "extended", "technical"]);
export type PresentationTemplate = z.infer<typeof templateSchema>;
/** De versie van de sjablonen zelf; gaat mee in elke publicatie. */
export const presentationTemplateVersion = "presentation-1";

/** Papiermaten in millimeters, staand genoteerd. */
export const paperSizes = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
} as const;
export const paperSchema = z.enum(["A4", "A3"]);
export const orientationSchema = z.enum(["portrait", "landscape"]);
export const planScaleSchema = z.union([
  z.literal(20),
  z.literal(50),
  z.literal(100),
]);
export type PlanScale = z.infer<typeof planScaleSchema>;

/** Papiermaat in de gekozen richting, in millimeters. */
export function sheetSize(
  paper: z.infer<typeof paperSchema>,
  orientation: z.infer<typeof orientationSchema>,
) {
  const { width, height } = paperSizes[paper];
  return orientation === "portrait"
    ? { width, height }
    : { width: height, height: width };
}

export const brandingSchema = z
  .object({
    companyName: z.string().trim().min(1).max(120),
    contact: z.string().trim().max(400),
    footer: z.string().trim().max(200),
    accent: hex,
    ink: hex,
    /** Alleen twee families, allebei op elk systeem aanwezig. */
    font: z.enum(["serif", "sans"]),
    /** Verwijzing naar een geüploade afbeelding, of geen logo. */
    logoAssetId: id.nullable(),
  })
  .strict();
export type Branding = z.infer<typeof brandingSchema>;

/** Zoveel beelden passen er op een moodboard; het paneel houdt dezelfde grens aan. */
export const moodboardImageLimit = 12;

const block = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ id, type: z.literal(type), ...shape }).strict();

export const presentationBlockSchema = z.discriminatedUnion("type", [
  block("cover", {
    subtitle: z.string().trim().max(200),
  }),
  block("text", {
    heading: z.string().trim().max(120),
    body: z.string().trim().max(4000),
  }),
  block("plan", {
    heading: z.string().trim().max(120),
    variantId: id,
    scale: planScaleSchema,
    paper: paperSchema,
    orientation: orientationSchema,
    /** Lichtbundels op het blad, dezelfde keuze als in de editor. */
    beams: z.boolean(),
  }),
  block("moodboard", {
    heading: z.string().trim().max(120),
    images: z
      .array(
        z.object({ assetId: id, caption: z.string().trim().max(160) }).strict(),
      )
      .max(moodboardImageLimit),
  }),
  block("materials", {
    heading: z.string().trim().max(120),
    /** Leeg betekent alle ruimtes. */
    rooms: z.array(z.string().trim().min(1).max(120)).max(20),
  }),
  block("lighting", {
    heading: z.string().trim().max(120),
    variantId: id,
  }),
  block("products", {
    heading: z.string().trim().max(120),
    variantId: id,
  }),
  block("price", {
    heading: z.string().trim().max(120),
    quoteId: id,
    /** Alleen het totaal, of ook de posten. */
    showLines: z.boolean(),
  }),
  block("closing", {
    heading: z.string().trim().max(120),
    body: z.string().trim().max(2000),
  }),
]);
export type PresentationBlock = z.infer<typeof presentationBlockSchema>;
export type BlockType = PresentationBlock["type"];

export const presentationSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    customer: z.string().trim().max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    template: templateSchema,
    branding: brandingSchema,
    blocks: z.array(presentationBlockSchema).min(1).max(60),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.blocks.map((b) => b.id)).size !== value.blocks.length)
      ctx.addIssue({ code: "custom", message: "Elk blok heeft een eigen ID." });
    if (value.blocks.filter((b) => b.type === "cover").length > 1)
      ctx.addIssue({
        code: "custom",
        message: "Een presentatie heeft hoogstens één omslag.",
      });
  });
export type Presentation = z.infer<typeof presentationSchema>;

/**
 * De inhoud zoals die bij het publiceren uit het ontwerp is gehaald. Elk blok
 * dat iets afleidt draagt zijn eigen bronrevisie, zodat achteraf vaststaat
 * welke versie van het ontwerp de klant heeft gezien.
 */
const resolved = <T extends string, S extends z.ZodRawShape>(
  type: T,
  shape: S,
) => z.object({ blockId: id, type: z.literal(type), ...shape }).strict();

export const resolvedBlockSchema = z.discriminatedUnion("type", [
  resolved("plan", {
    /** Het planblad als vector, precies zoals het is uitgegeven. Leeg wanneer
     *  het niet gemaakt kon worden; dan staat de reden in `problem`. */
    svg: z.string().max(4000000),
    /**
     * Waarom er geen blad is. Een tekening die niet op het gekozen papier past
     * wordt niet stilletjes kleiner getekend; de presentatie zegt het.
     */
    problem: z.string().max(300).nullable().default(null),
    revision: z.number().int().nonnegative(),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    scale: planScaleSchema,
  }),
  resolved("moodboard", {
    images: z
      .array(
        z
          .object({
            /** De afbeelding zelf, zodat de publicatie op zichzelf staat. */
            dataUri: z.string().max(4000000),
            caption: z.string().trim().max(160),
          })
          .strict(),
      )
      .max(12),
  }),
  resolved("materials", {
    rows: z
      .array(
        z
          .object({
            name: z.string(),
            room: z.string(),
            category: z.string(),
            supplier: z.string(),
            quantity: z.string(),
            unit: z.string(),
            status: z.string(),
            version: z.number().int().positive(),
          })
          .strict(),
      )
      .max(300),
  }),
  resolved("lighting", {
    revision: z.number().int().nonnegative(),
    circuits: z
      .array(
        z
          .object({
            name: z.string(),
            count: z.number().int(),
            power: z.string(),
          })
          .strict(),
      )
      .max(60),
    scenes: z
      .array(z.object({ name: z.string(), count: z.number().int() }).strict())
      .max(60),
    led: z
      .object({
        count: z.number().int(),
        lengthM: z.string(),
        powerW: z.string(),
      })
      .strict(),
  }),
  resolved("products", {
    revision: z.number().int().nonnegative(),
    rows: z
      .array(
        z
          .object({
            name: z.string(),
            size: z.string(),
            supplier: z.string(),
            sku: z.string(),
          })
          .strict(),
      )
      .max(300),
    /*
     * Rechten reizen mee met de publicatie, niet met de bibliotheek: een
     * uitgegeven presentatie moet over tien jaar nog kunnen laten zien welke
     * vermelding er toen bij hoorde. Beide velden hebben een standaardwaarde,
     * zodat presentaties die vóór deze velden zijn gepubliceerd leesbaar
     * blijven.
     */
    attributions: z.array(z.string().max(300)).max(300).default([]),
    /** Aantal producten waarvan de leveranciersgegevens zijn weggelaten. */
    withheld: z.number().int().nonnegative().default(0),
  }),
  resolved("price", {
    number: z.string().nullable(),
    version: z.number().int().positive(),
    total: z.string(),
    lines: z
      .array(
        z
          .object({
            description: z.string(),
            quantity: z.string(),
            unit: z.string(),
            net: z.string(),
          })
          .strict(),
      )
      .max(300),
  }),
]);
export type ResolvedBlock = z.infer<typeof resolvedBlockSchema>;

export const presentationContentSchema = z
  .object({
    blocks: z.array(resolvedBlockSchema).max(60),
    /** Het logo als data-URI, zodat de publicatie op zichzelf staat. */
    logo: z
      .object({ dataUri: z.string().max(2000000) })
      .strict()
      .nullable()
      .default(null),
    /** Waar de inhoud vandaan komt, voor het colofon van de publicatie. */
    sources: z
      .array(
        z
          .object({
            kind: z.enum(["variant", "materials", "quote"]),
            id,
            revision: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(60),
  })
  .strict();
export type PresentationContent = z.infer<typeof presentationContentSchema>;
