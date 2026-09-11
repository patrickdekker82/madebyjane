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
/**
 * Prijsvelden van een bibliotheekitem. Bewust dezelfde drie velden en dezelfde
 * regel als bij materialen (`materials.ts`): een bedrag zonder bron en datum is
 * een prijs waarvan niemand meer weet waar hij vandaan komt, en die duikt een
 * half jaar later op in een offerte.
 *
 * Dit is de inkoop-/lijstprijs zoals hij bij het item hoort. De prijs die de
 * klant ziet, blijft een eigen keuze per project (`commercial_prices`); die
 * wordt hier niet door overschreven.
 */
const itemPriceDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = new Date(value + "T00:00:00.000Z");
    return (
      Number.isFinite(time.getTime()) &&
      time.toISOString().slice(0, 10) === value
    );
  }, "Gebruik een geldige datum.");
const itemMoney = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/,
    "Gebruik een bedrag met maximaal twee decimalen.",
  );
/**
 * Rechten bij een item. Een meubel uit een leverancierscatalogus, een gekocht
 * 3D-model en eigen tekenwerk hebben elk andere voorwaarden, en die zijn na een
 * jaar niet meer uit het hoofd te reconstrueren. Daarom staan ze bij het item.
 *
 * `exportAllowed` is de enige die iets afdwingt: staat hij uit, dan gaan de
 * leveranciersgegevens van dit item niet mee in documenten die de werkruimte
 * verlaten. Het object zelf blijft gewoon in de tekening staan — het weglaten
 * zou de plattegrond laten liegen over wat er staat.
 */
export const rightsSchema = z
  .object({
    /** Naam van de licentie of voorwaarde, vrij in te vullen. */
    licence: z.string().trim().max(160).default(""),
    /** Van wie het materiaal is: fabrikant, fotograaf, eigen werk. */
    holder: z.string().trim().max(160).default(""),
    /** Regel die letterlijk bij een export moet worden afgedrukt. */
    attribution: z.string().trim().max(300).default(""),
    exportAllowed: z.boolean().default(true),
  })
  .strict();
export type Rights = z.infer<typeof rightsSchema>;
export const catalogSchema = z
  .object({
    category: z.string().trim().max(80),
    description: z.string().trim().max(2000),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20),
    supplier: z.string().trim().max(120),
    sku: z.string().trim().max(120),
    /**
     * De drie prijsvelden en de rechten hebben een standaardwaarde, zodat
     * bestaande scenes en bibliotheekversies zonder migratie geldig blijven.
     */
    priceSource: z.string().trim().max(160).default(""),
    priceDate: itemPriceDate.nullable().default(null),
    unitPrice: itemMoney.nullable().default(null),
    rights: rightsSchema.default({
      licence: "",
      holder: "",
      attribution: "",
      exportAllowed: true,
    }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.unitPrice !== null && (!value.priceSource || !value.priceDate))
      ctx.addIssue({
        code: "custom",
        path: ["priceSource"],
        message: "Noteer bij een prijs ook de bron en de prijsdatum.",
      });
    if (value.priceDate !== null && !value.priceSource)
      ctx.addIssue({
        code: "custom",
        path: ["priceSource"],
        message: "Noteer waar de prijsdatum vandaan komt.",
      });
  });
/**
 * Waar de plaatsingscoördinaat van een item op slaat. Een kast hoort met zijn
 * rug tegen de wand en niet met zijn hart op de wandlijn; een hanglamp hangt
 * juist wél om zijn midden. Zonder anker moet de gebruiker dat elke keer zelf
 * terugrekenen met de halve diepte.
 *
 * De zijde is die van het item zelf, vóór draaiing: de achterzijde is de kant
 * met de kleinste y. Draait het item, dan draait het anker mee.
 */
export const anchorModes = {
  center: "Midden",
  back: "Achterzijde",
  front: "Voorzijde",
  left: "Linkerzijde",
  right: "Rechterzijde",
} as const;
export type AnchorMode = keyof typeof anchorModes;
export const anchorSchema = z.enum(
  Object.keys(anchorModes) as [AnchorMode, ...AnchorMode[]],
);
/**
 * Hoeveel vrijheid de maten van dit item hebben.
 *
 * `fixed` is de handelsmaat van een fabrikant: een bank van 2.200 mm is niet
 * stiekem 2.350 mm te maken omdat hij anders niet past. `uniform` laat schalen
 * toe zolang de verhouding klopt. `free` is tekenwerk zonder die belofte.
 */
export const scaleModes = {
  free: "Vrij te schalen",
  uniform: "Alleen gelijkmatig schalen",
  fixed: "Vaste handelsmaat",
} as const;
export type ScaleMode = keyof typeof scaleModes;
export const scaleModeSchema = z.enum(
  Object.keys(scaleModes) as [ScaleMode, ...ScaleMode[]],
);
export const libraryQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    q: z.string().trim().max(120).default(""),
    category: z.string().trim().max(80).default(""),
    /**
     * Gearchiveerde items staan standaard niet in de lijst: ze worden niet meer
     * gevoerd. Ze moeten wel te vínden zijn, anders valt er niets terug te
     * halen — vandaar deze schakelaar in plaats van ze te verbergen.
     */
    archived: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((v) => v === true || v === "true")
      .default(false),
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
/**
 * Elektra en verlichting.
 *
 * `symbolSizeMm` is de maat waarop het symbool op papier wordt getekend en
 * staat nadrukkelijk los van `width` en `depth`, die de fysieke maat van het
 * armatuur blijven. Een wandcontactdoos van 80 mm zou op 1:50 anderhalve
 * millimeter groot zijn en dus onleesbaar; een spot van 90 mm hetzelfde. Het
 * symbool is een tekenafspraak, geen maatvoering.
 *
 * Lumen en milliwatt staan als losse fabrikantwaarden naast elkaar. Er wordt
 * nergens tussen omgerekend en er komt geen lux uit: dat zijn verschillende
 * grootheden en deze app dimensioneert geen installatie.
 */
export const fixtureKinds = {
  socket: "Wandcontactdoos",
  switch: "Schakelaar",
  ceiling: "Lichtpunt plafond",
  spot: "Inbouwspot",
  wall: "Wandarmatuur",
  pendant: "Hanglamp",
} as const;
export const fixtureKindSchema = z.enum([
  "socket",
  "switch",
  "ceiling",
  "spot",
  "wall",
  "pendant",
]);
export type FixtureKind = z.infer<typeof fixtureKindSchema>;
/** Welke soorten licht geven; de rest is elektra en heeft geen bundel. */
export const lightingKinds: readonly FixtureKind[] = [
  "ceiling",
  "spot",
  "wall",
  "pendant",
];
export const fixtureSchema = z
  .object({
    kind: fixtureKindSchema,
    /** Hoogte van het punt zelf boven de vloer. */
    mountHeightMm: z.number().int().min(0).max(20000),
    symbolSizeMm: z.number().int().min(50).max(2000),
    /** Groep waar dit punt op zit; vrije tekst, geen installatieberekening. */
    circuit: z.string().trim().max(60),
    /** Lichtscene waar dit armatuur in meedoet. */
    scene: z.string().trim().max(60),
    /** Bundelhoek in graden; null bij elektra en bij onbekende armaturen. */
    beamAngle: z.number().int().min(1).max(180).nullable(),
    colorTemperatureK: z.number().int().min(1000).max(10000).nullable(),
    dimLevel: z.number().int().min(0).max(100),
    /** Fabrikantwaarde: lichtstroom. */
    lumen: z.number().int().min(0).max(200000).nullable(),
    /** Fabrikantwaarde: opgenomen vermogen, in milliwatt voor hele getallen. */
    milliwatt: z.number().int().min(0).max(2000000).nullable(),
  })
  .strict();
export type Fixture = z.infer<typeof fixtureSchema>;
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
    /**
     * Ontbreken bij scenes van vóór deze velden. Een ontbrekend anker telt als
     * `center` en een ontbrekende schaalmodus als `free`: precies het gedrag
     * dat die scenes altijd al hadden, dus ze blijven zonder migratie geldig.
     */
    anchor: anchorSchema.optional(),
    scaleMode: scaleModeSchema.optional(),
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
    /** Aanwezig bij elektra- en verlichtingspunten; ontbreekt bij meubels. */
    fixture: fixtureSchema.optional(),
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
/**
 * LED-strip als bewerkbare polyline.
 *
 * De lengte staat er niet in: die volgt uit de hoekpunten, zodat een strip
 * nooit een andere lengte kan beweren dan hij op de tekening heeft. Wat er wel
 * in staat is de gekozen bestel- of kniplengte, want dat is een besluit van de
 * gebruiker en geen meting; die twee horen apart zichtbaar te zijn.
 *
 * Vermogen staat in milliwatt per meter zodat het een geheel getal blijft,
 * net als alle andere maten in dit model.
 */
export const ledProfiles = {
  none: "Geen profiel",
  surface: "Opbouwprofiel",
  recessed: "Inbouwprofiel",
  corner: "Hoekprofiel",
} as const;
export const ledProfileSchema = z.enum([
  "none",
  "surface",
  "recessed",
  "corner",
]);
export type LedProfile = z.infer<typeof ledProfileSchema>;
export const ledDirections = {
  up: "Omhoog",
  down: "Omlaag",
  forward: "Vooruit",
} as const;
export const ledDirectionSchema = z.enum(["up", "down", "forward"]);
export type LedDirection = z.infer<typeof ledDirectionSchema>;
export const ledPathSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    /** Hoekpunten in wereldmillimeters; minstens twee, dus altijd een lijn. */
    points: z
      .array(z.object({ x: mm, y: mm }).strict())
      .min(2)
      .max(200),
    /** Montagehoogte boven de vloer. */
    heightMm: z.number().int().min(0).max(20000),
    profile: ledProfileSchema,
    direction: ledDirectionSchema,
    /** Lichtkleur zoals hij op de tekening staat. */
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    /** Kleurtemperatuur in kelvin; los begrip, wordt nergens omgerekend. */
    colorTemperatureK: z.number().int().min(1000).max(10000).nullable(),
    /** Vermogen per meter in milliwatt. */
    wattPerMeterMw: z.number().int().min(0).max(200000),
    connection: z.string().trim().max(200),
    note: z.string().trim().max(300),
    /** Gekozen bestel- of kniplengte; null wanneer die nog niet gekozen is. */
    orderLengthMm: z.number().int().min(0).max(100000).nullable(),
    hidden: z.boolean().optional(),
  })
  .strict()
  .superRefine((path, ctx) => {
    for (let i = 1; i < path.points.length; i++)
      if (
        path.points[i]!.x === path.points[i - 1]!.x &&
        path.points[i]!.y === path.points[i - 1]!.y
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Een LED-strip mag geen twee dezelfde punten na elkaar hebben.",
        });
  });
export type LedPath = z.infer<typeof ledPathSchema>;
/**
 * Een bewaard camerastandpunt.
 *
 * Alles in millimeter en in de assen van het plan, net als de rest van het
 * ontwerp; de 3D-weergave deelt zelf door duizend. Zo blijft er één
 * maatvoering in het document en is een standpunt ook buiten de viewer te
 * lezen. `z` is de hoogte boven de vloer.
 *
 * Het standpunt hoort bij het ontwerp en niet bij de browser: het reist mee met
 * revisies en varianten, en een collega die het project opent ziet hetzelfde
 * beeld als degene die het bewaarde.
 */
export const cameraSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    /** Waar de camera staat. */
    eye: z.object({ x: mm, y: mm, z: mm }).strict(),
    /** Waar hij naar kijkt. */
    target: z.object({ x: mm, y: mm, z: mm }).strict(),
    /** Beeldhoek in graden; smal is een telelens, breed vertekent. */
    fov: z.number().int().min(10).max(120),
    /**
     * Dag of avond. Hoort bij het standpunt omdat het bij het beeld hoort:
     * "vanaf de eettafel" overdag en 's avonds zijn twee verschillende platen,
     * en juist die tweede is waarvoor het lichtplan is gemaakt.
     *
     * Standaardwaarde, dus standpunten van vóór dit veld blijven geldig en
     * openen zoals ze altijd deden: overdag.
     */
    light: z.enum(["day", "evening"]).default("day"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.eye.x === value.target.x &&
      value.eye.y === value.target.y &&
      value.eye.z === value.target.z
    )
      ctx.addIssue({
        code: "custom",
        message: "Een camera kan niet naar zijn eigen positie kijken.",
      });
  });
export type Camera = z.infer<typeof cameraSchema>;
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
    /** Standaardwaarde, dus scenes van voor fase 4 blijven geldig zonder migratie. */
    ledPaths: z.array(ledPathSchema).max(200).default([]),
    underlay: underlaySchema.nullable().default(null),
    /**
     * Bewaarde camerastandpunten. Standaardwaarde, dus scenes van voor fase 7
     * blijven geldig zonder migratie. Het maximum is een rem op een document
     * dat ongemerkt volloopt, niet een uitspraak over wat genoeg is.
     */
    cameras: z.array(cameraSchema).max(24).default([]),
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
  z.object({ type: z.literal("AddLedPath"), path: ledPathSchema }).strict(),
  /*
   * Een standpunt bewaren is een gewone ontwerpopdracht: hij gaat door dezelfde
   * revisie- en conflictcontrole als een muur, want hij hoort bij het ontwerp en
   * niet bij de browser waarin hij toevallig is ingesteld.
   */
  z.object({ type: z.literal("SaveCamera"), camera: cameraSchema }).strict(),
  z.object({ type: z.literal("DeleteCamera"), id }).strict(),
  /** Elektra- en armatuurvelden van een bestaand punt bijwerken. */
  z
    .object({ type: z.literal("SetFixture"), id, fixture: fixtureSchema })
    .strict(),
  /**
   * Een strip bijwerken. De hoekpunten en de losse velden gaan in een opdracht,
   * zodat een sleep met meerdere gewijzigde punten een stap terug is.
   */
  z
    .object({
      type: z.literal("UpdateLedPath"),
      id,
      path: ledPathSchema,
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
        ledPaths: true,
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

/**
 * Lokaal werk dat niet meer op de server past, veiligstellen als eigen variant.
 *
 * Anders dan bij `variantCopyInput` komt het document hier van de client: het is
 * het klad uit de browser, dat juist níét meer aansluit op wat de server heeft.
 * Er is dus geen `baseRevision` om tegen te toetsen — dat het afwijkt is de
 * reden dat dit bestaat. De server neemt het document niet op gezag aan: het
 * moet een geldige scène zijn, in dezelfde werkruimte en hetzelfde project als
 * de bronvariant.
 */
export const variantRescueInput = z
  .object({
    variantId: id,
    name: z.string().trim().min(1).max(120),
    scene: sceneSchema,
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
  anchor: true,
  scaleMode: true,
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

/** Gedeeld tussen server en interface; geen databasecode in dit bestand. */
export const projectAccessModes = ["organization", "restricted"] as const;
export type ProjectAccess = (typeof projectAccessModes)[number];
/**
 * Projectrollen zijn bewust beperkt tot de drie werkrollen: owner en admin zijn
 * hier niet toe te kennen, anders was ledenbeheer via een project uit te breiden.
 */
export const projectRoles = ["designer", "finance", "viewer"] as const;
export const projectMemberInput = z
  .object({ userId: z.string().min(1).max(255), role: z.enum(projectRoles) })
  .strict();
export const projectAccessInput = z
  .object({ access: z.enum(projectAccessModes) })
  .strict();
