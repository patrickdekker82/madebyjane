import { z } from "zod";
export const id = z.string().uuid();
const mm = z.number().int().min(-100000).max(100000);
const size = z.number().int().min(1).max(100000);
export const pointSchema = z.object({ id, x: mm, y: mm }).strict();
export const wallSchema = z
  .object({
    id,
    startId: id,
    endId: id,
    thickness: size.max(1000),
    height: size.max(10000),
  })
  .strict();
export const openingSchema = z
  .object({
    id,
    wallId: id,
    kind: z.enum(["door", "window"]),
    offset: z.number().int().nonnegative().max(100000),
    width: size,
    height: size.max(10000),
    sillHeight: z.number().int().nonnegative().max(10000),
    swing: z.enum(["left", "right"]),
  })
  .strict();
const symbolCoordinate = z.number().int().min(0).max(1000);
const symbolStyle = {
  stroke: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  strokeWidth: z.number().int().min(1).max(30),
};
const symbolBox = {
  x: symbolCoordinate,
  y: symbolCoordinate,
  width: z.number().int().min(1).max(1000),
  height: z.number().int().min(1).max(1000),
  fill: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ...symbolStyle,
};
export const symbolShapeSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("rect"), ...symbolBox }).strict(),
    z.object({ type: z.literal("ellipse"), ...symbolBox }).strict(),
    z
      .object({
        type: z.literal("line"),
        x: symbolCoordinate,
        y: symbolCoordinate,
        endX: symbolCoordinate,
        endY: symbolCoordinate,
        ...symbolStyle,
      })
      .strict(),
  ])
  .superRefine((shape, ctx) => {
    if (
      shape.type !== "line" &&
      (shape.x + shape.width > 1000 || shape.y + shape.height > 1000)
    )
      ctx.addIssue({
        code: "custom",
        message: "Een symboolvorm moet binnen het meubel blijven.",
      });
    if (
      shape.type === "line" &&
      shape.x === shape.endX &&
      shape.y === shape.endY
    )
      ctx.addIssue({
        code: "custom",
        message: "Een lijn heeft twee verschillende punten nodig.",
      });
  });
export const symbolSchema = z.array(symbolShapeSchema).min(1).max(32);
export type SymbolShape = z.infer<typeof symbolShapeSchema>;
export const catalogSchema = z
  .object({
    category: z.string().trim().max(80),
    description: z.string().trim().max(2000),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20),
    supplier: z.string().trim().max(120),
    sku: z.string().trim().max(120),
  })
  .strict();
export const libraryQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    q: z.string().trim().max(120).default(""),
    category: z.string().trim().max(80).default(""),
  })
  .strict();
/**
 * Laagindeling van het plan. Ontbreekt de laag bij een ouder object, dan telt
 * het als inrichting; oude scenes blijven daardoor geldig zonder migratie.
 */
export const itemLayers = {
  furniture: "Inrichting",
  finish: "Afwerking",
  electrical: "Elektra",
  lighting: "Verlichting",
  technical: "Technische presentatie",
} as const;
export const itemLayerSchema = z.enum([
  "furniture",
  "finish",
  "electrical",
  "lighting",
  "technical",
]);
export type ItemLayer = z.infer<typeof itemLayerSchema>;
export const itemSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    layer: itemLayerSchema.optional(),
    /** Vergrendelde objecten blijven zichtbaar maar zijn niet te verplaatsen of te verwijderen. */
    locked: z.boolean().optional(),
    /** Gedeelde verwijzing tussen objecten die als geheel bewegen. */
    groupId: id.optional(),
    hidden: z.boolean().optional(),
    x: mm,
    y: mm,
    width: size,
    depth: size,
    height: size,
    rotation: z.number().finite().min(-360).max(360),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    custom: z.boolean(),
    symbol: symbolSchema.optional(),
    catalog: catalogSchema.optional(),
    model: z
      .object({ assetId: id, width: size, depth: size, height: size })
      .strict()
      .optional(),
    libraryRef: z
      .object({
        entryId: id,
        versionId: id,
        version: z.number().int().positive(),
      })
      .strict()
      .optional(),
    kind: z.enum(["sofa", "table", "cabinet", "light"]),
  })
  .strict();
/**
 * Annotaties op het tekenblad. De gemeten lengte wordt niet opgeslagen: die is
 * afgeleid uit de twee punten, zodat een maatlijn nooit iets anders kan beweren
 * dan de geometrie zegt. `offset` is de loodrechte verschuiving van de maatlijn
 * ten opzichte van de gemeten lijn, zodat hij naast het object komt te liggen.
 */
export const annotationSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("dimension"),
        id,
        from: z.object({ x: mm, y: mm }).strict(),
        to: z.object({ x: mm, y: mm }).strict(),
        offset: z.number().int().min(-10000).max(10000),
      })
      .strict(),
    z
      .object({
        type: z.literal("note"),
        id,
        x: mm,
        y: mm,
        text: z.string().trim().min(1).max(300),
      })
      .strict(),
  ])
  .superRefine((annotation, ctx) => {
    if (
      annotation.type === "dimension" &&
      annotation.from.x === annotation.to.x &&
      annotation.from.y === annotation.to.y
    )
      ctx.addIssue({
        code: "custom",
        message: "Een maatlijn heeft twee verschillende punten nodig.",
      });
  });
export type Annotation = z.infer<typeof annotationSchema>;
/**
 * Onderlegger per verdieping: een foto of scan om op na te tekenen. De schaal
 * staat er bewust niet in; die volgt uit de twee kalibratiepunten en de
 * opgegeven werkelijke afstand. Zonder kalibratie geldt een aangenomen schaal
 * die de interface als schatting moet tonen.
 */
export const underlaySchema = z
  .object({
    assetId: id,
    widthPx: z.number().int().min(1).max(20000),
    heightPx: z.number().int().min(1).max(20000),
    x: mm,
    y: mm,
    /**
     * Graden met de klok mee om de linkerbovenhoek. Standaardwaarde, dus
     * scenes van voor deze stap blijven geldig zonder scene-migratie.
     */
    rotation: z.number().finite().min(-360).max(360).default(0),
    opacity: z.number().int().min(10).max(100),
    calibration: z
      .object({
        from: z
          .object({ x: z.number().finite(), y: z.number().finite() })
          .strict(),
        to: z
          .object({ x: z.number().finite(), y: z.number().finite() })
          .strict(),
        lengthMm: z.number().int().min(1).max(100000),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((underlay, ctx) => {
    const c = underlay.calibration;
    if (c && c.from.x === c.to.x && c.from.y === c.to.y)
      ctx.addIssue({
        code: "custom",
        message:
          "Kalibreren vraagt twee verschillende punten op de afbeelding.",
      });
  });
export type Underlay = z.infer<typeof underlaySchema>;
export const sceneSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    organizationId: id,
    projectId: id,
    designVariantId: id,
    floorId: id,
    nodes: z.array(pointSchema).max(2000),
    walls: z.array(wallSchema).max(1000),
    openings: z.array(openingSchema).max(500),
    items: z.array(itemSchema).max(2000),
    annotations: z.array(annotationSchema).max(500).default([]),
    underlay: underlaySchema.nullable().default(null),
  })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Point = { x: number; y: number };
export const operationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("PlaceLibraryItem"),
      id,
      versionId: id,
      x: mm,
      y: mm,
      rotation: z.number().finite().min(-360).max(360),
    })
    .strict(),
  z.object({ type: z.literal("RestoreRevision"), revisionId: id }).strict(),
  z
    .object({
      type: z.literal("SetItemDisplay"),
      ids: z.array(id).min(1).max(500),
      layer: itemLayerSchema.optional(),
      locked: z.boolean().optional(),
      hidden: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ReorderItems"),
      ids: z.array(id).min(1).max(500),
      direction: z.enum(["front", "back", "forward", "backward"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("AddWall"),
      start: pointSchema,
      end: pointSchema,
      wall: wallSchema,
    })
    .strict(),
  z.object({ type: z.literal("MoveWallNode"), id, x: mm, y: mm }).strict(),
  z.object({ type: z.literal("AddOpening"), opening: openingSchema }).strict(),
  z
    .object({
      type: z.literal("ResizeWall"),
      id,
      thickness: wallSchema.shape.thickness,
      height: wallSchema.shape.height,
    })
    .strict(),
  z
    .object({
      type: z.literal("ResizeOpening"),
      id,
      offset: openingSchema.shape.offset,
      width: openingSchema.shape.width,
      height: openingSchema.shape.height,
      sillHeight: openingSchema.shape.sillHeight,
    })
    .strict(),
  z.object({ type: z.literal("PlaceItem"), item: itemSchema }).strict(),
  z
    .object({ type: z.literal("AddAnnotation"), annotation: annotationSchema })
    .strict(),
  z
    .object({
      type: z.literal("SetUnderlay"),
      underlay: underlaySchema.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SetAnnotationOffset"),
      id,
      offset: z.number().int().min(-10000).max(10000),
    })
    .strict(),
  z
    .object({
      type: z.literal("SetItemGroup"),
      ids: z.array(id).min(1).max(500),
      groupId: id.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SetAnnotationText"),
      id,
      text: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      type: z.literal("TransformItem"),
      id,
      x: mm,
      y: mm,
      width: size,
      depth: size,
      rotation: z.number().finite().min(-360).max(360),
      custom: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("DeleteSelection"),
      ids: z.array(id).min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("RestoreContent"),
      content: sceneSchema.pick({
        nodes: true,
        walls: true,
        openings: true,
        items: true,
        annotations: true,
        underlay: true,
      }),
    })
    .strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
export const commandSchema = z
  .object({
    commandId: id,
    baseRevision: z.number().int().nonnegative(),
    leaseId: id,
    operations: z.array(operationSchema).min(1).max(100),
  })
  .strict();
export const projectInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    customer: z.string().trim().max(160),
    description: z.string().trim().max(2000),
    demo: z.boolean().default(false),
  })
  .strict();
export type ProjectInput = z.infer<typeof projectInput>;

export const variantCopyInput = z
  .object({
    variantId: id,
    name: z.string().trim().min(1).max(120),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();

export const libraryDefinitionSchema = itemSchema.pick({
  symbol: true,
  catalog: true,
  model: true,
  name: true,
  kind: true,
  width: true,
  depth: true,
  height: true,
  color: true,
});
export const libraryPublishSchema = z
  .object({
    entryId: id,
    versionId: id,
    baseVersion: z.number().int().nonnegative(),
    definition: libraryDefinitionSchema,
  })
  .strict();
export type LibraryDefinition = z.infer<typeof libraryDefinitionSchema>;
export type LibraryVersion = {
  id: string;
  entry_id: string;
  version: number;
  definition: LibraryDefinition;
};
