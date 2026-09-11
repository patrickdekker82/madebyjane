import { test, expect } from "vitest";
import { kelvinToRgb, lightPlan } from "../packages/geometry/src/light-3d";
import { newFixtureItem } from "../packages/editor-2d/src/fixture-draft";
import type { Item } from "../packages/contracts/src/index";

/*
 * De keuzes over wat er 's avonds aangaat staan in een pure functie en niet in
 * de weergave, zodat ze hier te toetsen zijn zonder browser. Wat hier niet in
 * staat is een lichtberekening: er komt geen lux uit en dat is geen omissie
 * maar de grens van wat de app belooft.
 */

const spot = (
  x: number,
  aanpassing: Partial<Item["fixture"] & object> = {},
) => {
  const item = newFixtureItem("spot", x, 1000);
  return { ...item, fixture: { ...item.fixture!, ...aanpassing } };
};

test("kleurtemperatuur loopt van warm geel naar blauw", () => {
  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [warmR, , warmB] = rgb(kelvinToRgb(2700));
  expect(warmR).toBeGreaterThan(warmB!);
  // Daglicht is ongeveer wit: de drie kanalen liggen dicht bij elkaar.
  const daglicht = rgb(kelvinToRgb(6500));
  expect(Math.max(...daglicht) - Math.min(...daglicht)).toBeLessThan(40);
  // En daarboven wint blauw.
  const [koudR, , koudB] = rgb(kelvinToRgb(10000));
  expect(koudB!).toBeGreaterThan(koudR!);
  // Buiten bereik klapt hij niet om, maar loopt hij tegen een grens aan.
  expect(kelvinToRgb(0)).toBe(kelvinToRgb(1000));
});

test("overdag gaat er niets aan", () => {
  const plan = lightPlan([spot(1000), spot(2000)], { mode: "day" });
  // De zon is dan de lichtbron; een brandende spot zou een vlek tonen die er
  // in het echt niet is.
  expect(plan).toEqual({ lights: [], omitted: 0 });
});

test("een lamp mikt naar beneden, een wandarmatuur de kamer in", () => {
  const plafond = lightPlan([spot(1000)], { mode: "evening" }).lights[0]!;
  expect(plafond.at.z).toBeGreaterThan(0);
  expect(plafond.toward).toEqual({ x: 1000, y: 1000, z: 0 });
  expect(plafond.reachMm).toBe(plafond.at.z);

  const wand = newFixtureItem("wall", 0, 0);
  const gedraaid = { ...wand, rotation: 90 };
  const licht = lightPlan([gedraaid], { mode: "evening" }).lights[0]!;
  // Een kwartslag: hij schijnt langs de y-as en blijft op zijn eigen hoogte.
  expect(licht.toward.x).toBe(0);
  expect(licht.toward.y).toBe(3000);
  expect(licht.toward.z).toBe(licht.at.z);
});

test("uit is uit, verborgen is weg, en elektra geeft geen licht", () => {
  const gedimd = spot(1000, { dimLevel: 0 });
  const verborgen = { ...spot(2000), hidden: true };
  const contactdoos = newFixtureItem("socket", 3000, 1000);
  const plan = lightPlan([gedimd, verborgen, contactdoos], {
    mode: "evening",
  });
  expect(plan.lights).toEqual([]);
  // Geen van drieën telt als weggelaten: er valt niets te tonen.
  expect(plan.omitted).toBe(0);
});

test("lichtstroom bepaalt de onderlinge verhouding, begrensd", () => {
  const gewoon = lightPlan([spot(1000, { lumen: 800 })], { mode: "evening" });
  expect(gewoon.lights[0]!.strength).toBe(1);
  // Half gedimd is half zo fel.
  const half = lightPlan([spot(1000, { lumen: 800, dimLevel: 50 })], {
    mode: "evening",
  });
  expect(half.lights[0]!.strength).toBe(0.5);
  // Een bouwlamp van 20.000 lumen mag de rest niet wegvagen.
  const fel = lightPlan([spot(1000, { lumen: 20000 })], { mode: "evening" });
  expect(fel.lights[0]!.strength).toBe(2);
  // Zonder opgave is elke lamp even fel; een getal verzinnen zou erger zijn.
  const onbekend = lightPlan([spot(1000, { lumen: null })], {
    mode: "evening",
  });
  expect(onbekend.lights[0]!.strength).toBe(1);
});

test("bij te veel lampen worden de felste getekend en de rest geteld", () => {
  /*
   * De grens komt van de weergave en niet van het ontwerp: een browser kan maar
   * een beperkt aantal lampen tegelijk aan. Het getal hoort in beeld, anders
   * lijkt een donkere hoek een ontwerpkeuze.
   */
  const lampen = [
    spot(1000, { dimLevel: 10 }),
    spot(2000, { dimLevel: 90 }),
    spot(3000, { dimLevel: 50 }),
  ];
  const plan = lightPlan(lampen, { mode: "evening", max: 2 });
  expect(plan.lights.map((l) => l.strength)).toEqual([0.9, 0.5]);
  expect(plan.omitted).toBe(1);
  // Dezelfde invoer geeft hetzelfde beeld, ook bij gelijke sterkte.
  const gelijk = [spot(1000), spot(2000), spot(3000)];
  const een = lightPlan(gelijk, { mode: "evening", max: 2 });
  const twee = lightPlan([...gelijk].reverse(), { mode: "evening", max: 2 });
  expect(een.lights.map((l) => l.id)).toEqual(twee.lights.map((l) => l.id));
});

test("een bundel breder dan een halve cirkel is geen kegel meer", () => {
  const smal = lightPlan([spot(1000, { beamAngle: 36 })], { mode: "evening" });
  expect(smal.lights[0]!.coneHalfAngleDeg).toBe(18);
  const breed = lightPlan([spot(1000, { beamAngle: 180 })], {
    mode: "evening",
  });
  expect(breed.lights[0]!.coneHalfAngleDeg).toBeNull();
  const zonder = lightPlan([spot(1000, { beamAngle: null })], {
    mode: "evening",
  });
  expect(zonder.lights[0]!.coneHalfAngleDeg).toBeNull();
});
