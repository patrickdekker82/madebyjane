import { test, expect } from "vitest";
import {
  circuits,
  lightScenes,
  lightingTotals,
  UNASSIGNED,
} from "../packages/domain/src/lighting";
import { newFixtureItem } from "../packages/editor-2d/src/fixture-draft";
import type { Item, LedPath } from "../packages/contracts/src/index";

const point = (
  kind: Parameters<typeof newFixtureItem>[0],
  over: Partial<Item["fixture"]> = {},
  id?: `${string}-${string}-${string}-${string}-${string}`,
): Item => {
  const item = newFixtureItem(kind, 0, 0, id);
  return { ...item, fixture: { ...item.fixture!, ...over } };
};

const strip: LedPath = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Keukenlijst",
  points: [
    { x: 0, y: 0 },
    { x: 2500, y: 0 },
  ],
  heightMm: 2400,
  profile: "surface",
  direction: "down",
  color: "#ffce8a",
  colorTemperatureK: 2700,
  wattPerMeterMw: 9600,
  connection: "",
  note: "",
  orderLengthMm: null,
};

test("groepen tellen alle punten, ook elektra zonder licht", () => {
  const items = [
    point(
      "spot",
      { circuit: "Groep 1", milliwatt: 5000 },
      "11111111-1111-4111-8111-111111111111",
    ),
    point(
      "spot",
      { circuit: "Groep 1", milliwatt: 5000 },
      "22222222-2222-4222-8222-222222222222",
    ),
    point(
      "socket",
      { circuit: "Groep 2" },
      "33333333-3333-4333-8333-333333333333",
    ),
  ];
  const groups = circuits(items);
  expect(groups.map((g) => g.name)).toEqual(["Groep 1", "Groep 2"]);
  expect(groups[0]!.count).toBe(2);
  expect(groups[0]!.powerW).toBe("10.000");
  expect(groups[0]!.withPower).toBe(2);
  // Zonder opgave blijft het totaal nul en is te zien dat er niets is ingevuld.
  expect(groups[1]!.powerW).toBe("0.000");
  expect(groups[1]!.withPower).toBe(0);
});

test("een deels ingevulde groep laat zien hoeveel er is opgegeven", () => {
  const groups = circuits([
    point(
      "spot",
      { circuit: "Groep 1", milliwatt: 7500 },
      "11111111-1111-4111-8111-111111111111",
    ),
    point(
      "spot",
      { circuit: "Groep 1", milliwatt: null },
      "22222222-2222-4222-8222-222222222222",
    ),
  ]);
  expect(groups[0]!.count).toBe(2);
  expect(groups[0]!.withPower).toBe(1);
  // Het totaal is de som van wat er staat, niet van wat er zou kunnen staan.
  expect(groups[0]!.powerW).toBe("7.500");
});

test("punten zonder groep vallen niet weg maar krijgen een eigen kop", () => {
  const groups = circuits([
    point("socket", { circuit: "" }, "11111111-1111-4111-8111-111111111111"),
    point(
      "spot",
      { circuit: "Groep 1" },
      "22222222-2222-4222-8222-222222222222",
    ),
  ]);
  expect(groups.map((g) => g.name)).toEqual(["Groep 1", UNASSIGNED]);
  // Niet toegewezen staat onderaan, want dat is de restpost.
  expect(groups.at(-1)!.name).toBe(UNASSIGNED);
});

test("lichtscenes tellen alleen wat licht geeft", () => {
  const items = [
    point(
      "spot",
      { scene: "Avond", lumen: 400 },
      "11111111-1111-4111-8111-111111111111",
    ),
    point(
      "pendant",
      { scene: "Avond", lumen: 800 },
      "22222222-2222-4222-8222-222222222222",
    ),
    point("socket", { scene: "Avond" }, "33333333-3333-4333-8333-333333333333"),
    point("switch", { scene: "Avond" }, "44444444-4444-4444-8444-444444444444"),
  ];
  const scenes = lightScenes(items);
  expect(scenes).toHaveLength(1);
  expect(scenes[0]!.count).toBe(2);
  expect(scenes[0]!.lumen).toBe(1200);
  expect(scenes[0]!.withLumen).toBe(2);
  // De wandcontactdoos en de schakelaar staan wel in de groepen.
  expect(circuits(items)[0]!.count).toBe(4);
});

test("scenes worden op naam gesorteerd met de restpost onderaan", () => {
  const scenes = lightScenes([
    point("spot", { scene: "" }, "11111111-1111-4111-8111-111111111111"),
    point("spot", { scene: "Ochtend" }, "22222222-2222-4222-8222-222222222222"),
    point("spot", { scene: "Avond" }, "33333333-3333-4333-8333-333333333333"),
  ]);
  expect(scenes.map((s) => s.name)).toEqual(["Avond", "Ochtend", UNASSIGNED]);
});

test("het totaal houdt armaturen en LED-strips uit elkaar", () => {
  const totals = lightingTotals(
    [
      point(
        "spot",
        { milliwatt: 5000 },
        "11111111-1111-4111-8111-111111111111",
      ),
      point("socket", {}, "22222222-2222-4222-8222-222222222222"),
    ],
    [strip],
  );
  // De wandcontactdoos telt niet als armatuur.
  expect(totals.fixtures).toBe(1);
  expect(totals.fixturePowerW).toBe("5.000");
  expect(totals.withPower).toBe(1);
  // 2,5 m x 9,6 W/m = 24 W, apart van het armatuurvermogen.
  expect(totals.led.lengthM).toBe("2.500");
  expect(totals.led.powerW).toBe("24.000");
});

test("een ontwerp zonder elektra levert lege lijsten op", () => {
  expect(circuits([])).toEqual([]);
  expect(lightScenes([])).toEqual([]);
  const totals = lightingTotals([], []);
  expect(totals.fixtures).toBe(0);
  expect(totals.fixturePowerW).toBe("0.000");
  expect(totals.led.count).toBe(0);
});

test("de ids van een scene wijzen de armaturen aan die erbij horen", () => {
  const a = point(
    "spot",
    { scene: "Avond" },
    "11111111-1111-4111-8111-111111111111",
  );
  const b = point(
    "spot",
    { scene: "Ochtend" },
    "22222222-2222-4222-8222-222222222222",
  );
  const scenes = lightScenes([a, b]);
  expect(scenes.find((s) => s.name === "Avond")!.ids).toEqual([a.id]);
  expect(scenes.find((s) => s.name === "Ochtend")!.ids).toEqual([b.id]);
});

test("spaties rond een groepsnaam maken geen tweede groep", () => {
  const groups = circuits([
    point(
      "spot",
      { circuit: "Groep 1" },
      "11111111-1111-4111-8111-111111111111",
    ),
    point(
      "spot",
      { circuit: "  Groep 1  " },
      "22222222-2222-4222-8222-222222222222",
    ),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.count).toBe(2);
});
