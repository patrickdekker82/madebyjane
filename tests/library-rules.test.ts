import { test, expect } from "vitest";
import {
  catalogSchema,
  libraryDefinitionSchema,
} from "../packages/contracts/src/index";
import { centerFromAnchor } from "../packages/geometry/src/index";
import { applyOperations } from "../packages/domain/src/index";
import { demoScene } from "../packages/test-fixtures/src/index";
import {
  defaultPresentation,
  resolveContent,
} from "../packages/domain/src/presentation";
import { presentationSchema } from "../packages/contracts/src/presentations";

/*
 * De drie regels die een bibliotheekitem mag opleggen aan het ontwerp: waar het
 * aan hangt bij plaatsen, hoeveel zijn maten mogen veranderen, en wat er van
 * zijn gegevens de deur uit mag.
 */

const variantId = crypto.randomUUID();
const scene = () =>
  demoScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    variantId,
    crypto.randomUUID(),
  );

test("het anker bepaalt welk punt van het object je aanwijst", () => {
  const kast = { width: 2000, depth: 600, rotation: 0 };
  // Zonder anker verandert er niets: het aangewezen punt is het hart.
  expect(centerFromAnchor(undefined, kast, { x: 1000, y: 500 })).toEqual({
    x: 1000,
    y: 500,
  });
  expect(centerFromAnchor("center", kast, { x: 1000, y: 500 })).toEqual({
    x: 1000,
    y: 500,
  });
  /*
   * Met de rug op de wandlijn staat het hart een halve diepte vóór die lijn.
   * Dat is de hele reden dat dit veld bestaat: anders rekent de gebruiker elke
   * keer zelf 300 mm bij.
   */
  expect(centerFromAnchor("back", kast, { x: 1000, y: 500 })).toEqual({
    x: 1000,
    y: 800,
  });
  expect(centerFromAnchor("front", kast, { x: 1000, y: 500 })).toEqual({
    x: 1000,
    y: 200,
  });
  expect(centerFromAnchor("left", kast, { x: 1000, y: 500 })).toEqual({
    x: 2000,
    y: 500,
  });
  expect(centerFromAnchor("right", kast, { x: 1000, y: 500 })).toEqual({
    x: 0,
    y: 500,
  });
});

test("het anker draait mee met het object", () => {
  const gedraaid = { width: 2000, depth: 600, rotation: 90 };
  // Een kwartslag verder ligt de rug niet meer boven maar links van het hart.
  expect(centerFromAnchor("back", gedraaid, { x: 1000, y: 500 })).toEqual({
    x: 700,
    y: 500,
  });
  // En een halve slag spiegelt het anker precies.
  expect(
    centerFromAnchor(
      "back",
      { ...gedraaid, rotation: 180 },
      { x: 1000, y: 500 },
    ),
  ).toEqual({ x: 1000, y: 200 });
  /*
   * Heen en terug moet op de millimeter kloppen, ook bij een hoek die geen
   * kwartslag is: anders schuift een item op bij elke plaatsing.
   */
  const schuin = { width: 2000, depth: 600, rotation: 37 };
  const hart = centerFromAnchor("back", schuin, { x: 1000, y: 500 });
  const terug = centerFromAnchor("front", schuin, hart);
  expect(Math.abs(terug.x - 1000)).toBeLessThanOrEqual(1);
  expect(Math.abs(terug.y - 500)).toBeLessThanOrEqual(1);
});

test("een vaste handelsmaat is ook met maatwerk niet te rekken", () => {
  const s = scene(),
    bank = s.items[0]!;
  bank.scaleMode = "fixed";
  const transform = (width: number, depth: number) => ({
    type: "TransformItem" as const,
    id: bank.id,
    x: bank.x,
    y: bank.y,
    width,
    depth,
    rotation: bank.rotation,
    custom: true,
  });
  expect(() => applyOperations(s, [transform(2600, 950)])).toThrow(
    /vaste handelsmaat/,
  );
  // Verplaatsen en draaien blijft gewoon mogelijk; alleen de maat ligt vast.
  const verplaatst = applyOperations(s, [
    { ...transform(bank.width, bank.depth), x: 2000, y: 3000, rotation: 45 },
  ]);
  expect(verplaatst.items[0]).toMatchObject({ x: 2000, y: 3000, rotation: 45 });
});

test("gelijkmatig schalen houdt de verhouding, met de afronding als marge", () => {
  const s = scene(),
    bank = s.items[0]!;
  bank.scaleMode = "uniform";
  const transform = (width: number, depth: number) => ({
    type: "TransformItem" as const,
    id: bank.id,
    x: bank.x,
    y: bank.y,
    width,
    depth,
    rotation: bank.rotation,
    custom: true,
  });
  // 2400 × 950 maal 1,5 is 3600 × 1425: dezelfde verhouding, dus toegestaan.
  expect(applyOperations(s, [transform(3600, 1425)]).items[0]).toMatchObject({
    width: 3600,
    depth: 1425,
  });
  // Alleen de breedte rekken verandert de vorm van het meubel en mag niet.
  expect(() => applyOperations(s, [transform(3600, 950)])).toThrow(
    /gelijkmatig/,
  );
  /*
   * Een factor die niet rond uitkomt mag niet stuklopen op een halve
   * millimeter: 2400 × 950 maal 1,337 wordt afgerond 3209 × 1270.
   */
  expect(applyOperations(s, [transform(3209, 1270)]).items[0]).toMatchObject({
    width: 3209,
  });
  // Een item zonder schaalmodus is van vóór dit veld en blijft vrij.
  const vrij = scene();
  vrij.items[0]!.scaleMode = undefined;
  expect(
    applyOperations(vrij, [{ ...transform(3600, 950), id: vrij.items[0]!.id }])
      .items[0],
  ).toMatchObject({ width: 3600, depth: 950 });
});

test("een prijs zonder bron of datum wordt geweigerd", () => {
  const catalog = {
    category: "Zitmeubels",
    description: "",
    keywords: [],
    supplier: "Leverancier",
    sku: "AB-1",
  };
  // Helemaal geen prijs is prima: niet elk item heeft er een.
  expect(catalogSchema.safeParse(catalog).success).toBe(true);
  expect(
    catalogSchema.safeParse({ ...catalog, unitPrice: "1250.00" }).success,
  ).toBe(false);
  expect(
    catalogSchema.safeParse({
      ...catalog,
      unitPrice: "1250.00",
      priceSource: "Prijslijst 2026-1",
    }).success,
  ).toBe(false);
  expect(
    catalogSchema.safeParse({ ...catalog, priceDate: "2026-09-11" }).success,
  ).toBe(false);
  expect(
    catalogSchema.safeParse({
      ...catalog,
      unitPrice: "1250.00",
      priceSource: "Prijslijst 2026-1",
      priceDate: "2026-09-11",
    }).success,
  ).toBe(true);
  // Een datum die niet bestaat is geen datum.
  expect(
    catalogSchema.safeParse({
      ...catalog,
      priceSource: "Prijslijst",
      priceDate: "2026-02-30",
    }).success,
  ).toBe(false);
});

test("bibliotheekitems zonder anker, schaalmodus, prijs of rechten blijven geldig", () => {
  /*
   * Bestaande versies staan als JSON in de database en worden bij elk gebruik
   * opnieuw gelezen. Zouden de nieuwe velden verplicht zijn, dan was de hele
   * bibliotheek in één keer onleesbaar.
   */
  const oud = libraryDefinitionSchema.parse({
    name: "Bank",
    kind: "sofa",
    width: 2400,
    depth: 950,
    height: 780,
    color: "#c4b39d",
    catalog: {
      category: "Zitmeubels",
      description: "",
      keywords: [],
      supplier: "",
      sku: "",
    },
  });
  expect(oud.anchor).toBeUndefined();
  expect(oud.scaleMode).toBeUndefined();
  expect(oud.catalog?.unitPrice).toBeNull();
  // Zonder uitspraak over rechten mag een item gewoon mee; dat was het gedrag.
  expect(oud.catalog?.rights.exportAllowed).toBe(true);
});

test("exportrechten houden leveranciersgegevens binnen, vermelding gaat juist mee", () => {
  const s = scene();
  const [beschermd, vrij] = [s.items[0]!, s.items[1]!];
  beschermd.catalog = {
    category: "Zitmeubels",
    description: "",
    keywords: [],
    supplier: "Meubelmakerij Noord",
    sku: "MN-2200",
    priceSource: "",
    priceDate: null,
    unitPrice: null,
    rights: {
      licence: "Alleen intern gebruik",
      holder: "Meubelmakerij Noord",
      attribution: "Model © Meubelmakerij Noord",
      exportAllowed: false,
    },
  };
  vrij.catalog = {
    category: "Tafels",
    description: "",
    keywords: [],
    supplier: "Eigen werk",
    sku: "EW-1",
    priceSource: "",
    priceDate: null,
    unitPrice: null,
    rights: {
      licence: "",
      holder: "",
      attribution: "",
      exportAllowed: true,
    },
  };
  const blokId = crypto.randomUUID();
  const content = resolveContent(
    presentationSchema.parse({
      ...defaultPresentation("compact", {
        title: "Interieurvoorstel",
        customer: "Familie Voorbeeld",
        date: "2026-09-11",
        companyName: "Studio Voorbeeld",
        variantId,
      }),
      blocks: [
        {
          id: blokId,
          type: "products",
          heading: "Productlijst",
          variantId,
        },
      ],
    }),
    {
      scenes: { [variantId]: s },
      materials: [],
      quotes: {},
      images: {},
      logo: null,
      date: "2026-09-11",
    },
  );
  const block = content.blocks.find((b) => b.blockId === blokId);
  expect(block?.type).toBe("products");
  if (block?.type !== "products") throw new Error("Productblok ontbreekt.");
  const beschermdeRij = block.rows.find((r) => r.name === beschermd.name)!,
    vrijeRij = block.rows.find((r) => r.name === vrij.name)!;
  // Het meubel staat er gewoon in: weglaten zou de presentatie laten liegen.
  expect(beschermdeRij.supplier).toBe("");
  expect(beschermdeRij.sku).toBe("");
  expect(vrijeRij.supplier).toBe("Eigen werk");
  expect(block.withheld).toBe(1);
  expect(block.attributions).toEqual(["Model © Meubelmakerij Noord"]);
});
