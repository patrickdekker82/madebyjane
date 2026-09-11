import { test, expect } from "vitest";
import { surfaceFinishes } from "../packages/geometry/src/finishes";
import { detectRooms } from "../packages/geometry/src/rooms";
import { emptyScene } from "../packages/test-fixtures/src/index";
import type { Scene } from "../packages/contracts/src/index";
import type { MaterialDefinition } from "../packages/contracts/src/materials";

/*
 * Welke materiaalkeuze op welk vlak ligt. De koppeling loopt over `calculation`
 * — door de server berekend, met variant, ruimte en grondslag — en niet over de
 * vrij ingetypte velden `room` en `category`. En er wordt geen kleur verzonnen:
 * alleen wat de ontwerper zelf heeft vastgelegd komt in beeld.
 */

function scene(points: [number, number][], edges: [number, number][]): Scene {
  const s = emptyScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
  s.nodes = points.map(([x, y]) => ({ id: crypto.randomUUID(), x, y }));
  s.walls = edges.map(([a, b]) => ({
    id: crypto.randomUUID(),
    startId: s.nodes[a]!.id,
    endId: s.nodes[b]!.id,
    thickness: 180,
    height: 2700,
  }));
  return s;
}
/** Twee kamers naast elkaar, met één gedeelde muur in het midden. */
const tweeKamers = () =>
  scene(
    [
      [0, 0],
      [4000, 0],
      [8000, 0],
      [8000, 3000],
      [4000, 3000],
      [0, 3000],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [1, 4],
    ],
  );

const materiaal = (
  s: Scene,
  roomId: string,
  aanpassing: Partial<MaterialDefinition> & {
    basis?: "floor_area" | "wall_area";
  } = {},
) => {
  const { basis = "floor_area", ...rest } = aanpassing;
  const definition = {
    name: "Eiken visgraat",
    category: "Vloer",
    room: "Woonkamer",
    supplier: "",
    collection: "",
    sku: "",
    colorCode: "",
    priceSource: "",
    priceDate: null,
    unitPrice: null,
    displayColor: "#8a5a2b",
    sampleStatus: "none" as const,
    sampleDate: null,
    alternatives: [],
    chosenFrom: null,
    unit: "m²" as const,
    quantity: null,
    quantityReason: "",
    status: "chosen" as const,
    confirmationDate: null,
    confirmationNote: "",
    notes: "",
    calculation: {
      variantId: s.designVariantId,
      roomId,
      basis,
      wastePercent: "0",
      orderStep: null,
      sourceRevision: 0,
      computedAt: "2026-09-11T00:00:00.000Z",
      unit: "m²" as const,
      inputs: {
        grossFloorAreaMm2: 0,
        netFloorAreaMm2: 0,
        netPerimeterMm: 0,
        plinthLengthMm: 0,
        wallAreaMm2: 0,
        doorWidthMm: 0,
        openingAreaMm2: 0,
      },
      netQuantity: "1",
      wasteQuantity: "0",
      grossQuantity: "1",
      orderQuantity: "1",
    },
    ...rest,
  } as unknown as MaterialDefinition;
  return { id: crypto.randomUUID(), definition };
};

test("een gekozen vloer verft de vloer van precies die ruimte", () => {
  const s = tweeKamers();
  const [links, rechts] = detectRooms(s).rooms;
  const f = surfaceFinishes(s, [materiaal(s, links!.id)]);
  expect(f.floors[links!.id]).toMatchObject({
    name: "Eiken visgraat",
    color: "#8a5a2b",
    status: "chosen",
  });
  // De andere kamer blijft ongemoeid: er is daar niets gekozen.
  expect(f.floors[rechts!.id]).toBeUndefined();
  expect(f.notes).toEqual([]);
});

test("de koppeling loopt over de berekening en niet over de ingetypte ruimtenaam", () => {
  const s = tweeKamers();
  const room = detectRooms(s).rooms[0]!;
  // Een keuze van een ándere variant hoort hier niet te landen, hoe de velden
  // ook zijn ingevuld.
  const vreemd = materiaal(s, room.id, { room: "Woonkamer" });
  vreemd.definition.calculation!.variantId = crypto.randomUUID();
  expect(surfaceFinishes(s, [vreemd]).floors).toEqual({});
  // En een keuze zonder berekening heeft geen vlak om op te liggen.
  const los = materiaal(s, room.id);
  los.definition.calculation = null;
  expect(surfaceFinishes(s, [los]).floors).toEqual({});
});

test("alleen een gemaakte keuze verft; een voorstel wordt gemeld", () => {
  const s = tweeKamers();
  const room = detectRooms(s).rooms[0]!;
  for (const status of ["undecided", "proposed", "sample_requested"] as const) {
    const f = surfaceFinishes(s, [materiaal(s, room.id, { status })]);
    expect(f.floors).toEqual({});
    // Het beeld mag de klant geen keuze aanpraten die niemand genomen heeft,
    // maar mag hem ook niet verzwijgen.
    expect(f.notes).toEqual([
      '"Eiken visgraat" is nog geen gemaakte keuze en wordt niet getoond.',
    ]);
  }
  // Een klantakkoord verft net zo goed als een interne keuze.
  const bevestigd = surfaceFinishes(s, [
    materiaal(s, room.id, {
      status: "client_confirmed",
      confirmationDate: "2026-09-11",
      confirmationNote: "Per mail akkoord",
    }),
  ]);
  expect(bevestigd.floors[room.id]!.status).toBe("client_confirmed");
});

test("zonder weergavekleur blijft het vlak neutraal en staat dat erbij", () => {
  const s = tweeKamers();
  const room = detectRooms(s).rooms[0]!;
  const f = surfaceFinishes(s, [
    materiaal(s, room.id, { displayColor: null, name: "Kalkverf" }),
  ]);
  expect(f.floors).toEqual({});
  expect(f.notes).toEqual([
    '"Kalkverf" heeft geen weergavekleur; het vlak blijft neutraal.',
  ]);
});

test("een wandkeuze verft de muren om die ruimte, de gedeelde muur alleen als beide het eens zijn", () => {
  const s = tweeKamers();
  const [links, rechts] = detectRooms(s).rooms;
  const eenzijdig = surfaceFinishes(s, [
    materiaal(s, links!.id, { basis: "wall_area", displayColor: "#efe7d8" }),
  ]);
  // Vier muren om de linkerkamer, inclusief de gedeelde.
  expect(Object.keys(eenzijdig.walls)).toHaveLength(4);
  expect(eenzijdig.notes).toEqual([]);

  // Kiezen beide kamers dezelfde wand, dan is er geen strijd.
  const eensgezind = surfaceFinishes(s, [
    materiaal(s, links!.id, { basis: "wall_area", displayColor: "#efe7d8" }),
    materiaal(s, rechts!.id, { basis: "wall_area", displayColor: "#efe7d8" }),
  ]);
  expect(Object.keys(eensgezind.walls)).toHaveLength(7);
  expect(eensgezind.notes).toEqual([]);

  /*
   * Verschillen ze, dan is er geen goede kant om te tonen: een muur staat in 3D
   * als één blok zonder eigen voor- en achterkant. Die blijft neutraal, en het
   * beeld zegt waarom.
   */
  const oneens = surfaceFinishes(s, [
    materiaal(s, links!.id, {
      basis: "wall_area",
      displayColor: "#efe7d8",
      name: "Kalkverf wit",
    }),
    materiaal(s, rechts!.id, {
      basis: "wall_area",
      displayColor: "#2f3b2a",
      name: "Kalkverf groen",
    }),
  ]);
  // Zes buitenmuren wel, de gedeelde niet.
  expect(Object.keys(oneens.walls)).toHaveLength(6);
  expect(oneens.notes).toEqual([
    'Een muur scheidt twee ruimtes met verschillende wandafwerking ("Kalkverf groen" en "Kalkverf wit"); die muur blijft neutraal.',
  ]);
});

test("twee vloerkeuzes voor dezelfde ruimte laten die vloer neutraal", () => {
  const s = tweeKamers();
  const room = detectRooms(s).rooms[0]!;
  const f = surfaceFinishes(s, [
    materiaal(s, room.id, { name: "Eiken", displayColor: "#8a5a2b" }),
    materiaal(s, room.id, { name: "Travertin", displayColor: "#d8d2c4" }),
  ]);
  expect(f.floors).toEqual({});
  expect(f.notes).toEqual([
    'Voor één vloer zijn twee kleuren gekozen ("Eiken" en "Travertin"); die blijft neutraal.',
  ]);
});
