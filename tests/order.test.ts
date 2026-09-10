import { test, expect } from "vitest";
import { reorder } from "../packages/domain/src/order";

const all = ["a", "b", "c", "d", "e"];

test("naar voren en naar achteren zetten de selectie aan de rand", () => {
  expect(reorder(all, ["b"], "front")).toEqual(["a", "c", "d", "e", "b"]);
  expect(reorder(all, ["d"], "back")).toEqual(["d", "a", "b", "c", "e"]);
  // De onderlinge volgorde van de selectie blijft intact.
  expect(reorder(all, ["d", "b"], "front")).toEqual(["a", "c", "e", "b", "d"]);
  expect(reorder(all, ["d", "b"], "back")).toEqual(["b", "d", "a", "c", "e"]);
});

test("een stap vooruit of achteruit schuift over precies een ander object", () => {
  expect(reorder(all, ["b"], "forward")).toEqual(["a", "c", "b", "d", "e"]);
  expect(reorder(all, ["b"], "backward")).toEqual(["b", "a", "c", "d", "e"]);
  expect(reorder(all, ["c"], "forward")).toEqual(["a", "b", "d", "c", "e"]);
});

test("een aaneengesloten selectie schuift als geheel", () => {
  expect(reorder(all, ["b", "c"], "forward")).toEqual(["a", "d", "b", "c", "e"]);
  expect(reorder(all, ["c", "d"], "backward")).toEqual(["a", "c", "d", "b", "e"]);
});

test("een onderbroken selectie schuift als geheel voorbij het eerstvolgende object", () => {
  // Bovenste van de selectie is c; het eerste niet-geselecteerde object daarboven
  // is d. Beide geselecteerde objecten komen dus boven d te liggen.
  expect(reorder(all, ["a", "c"], "forward")).toEqual(["b", "d", "a", "c", "e"]);
  // Onderste van de selectie is c; daaronder ligt b, dus de selectie zakt onder b.
  expect(reorder(all, ["c", "e"], "backward")).toEqual(["a", "c", "e", "b", "d"]);
});

test("tegen de rand verandert er niets", () => {
  expect(reorder(all, ["e"], "forward")).toEqual(all);
  expect(reorder(all, ["a"], "backward")).toEqual(all);
  expect(reorder(all, ["d", "e"], "forward")).toEqual(all);
  expect(reorder(all, ["a", "b"], "backward")).toEqual(all);
});

test("lege of volledige selecties en onbekende ID's laten de lijst met rust", () => {
  for (const direction of ["front", "back", "forward", "backward"] as const) {
    expect(reorder(all, [], direction)).toEqual(all);
    expect(reorder(all, all, direction)).toEqual(all);
    expect(reorder(all, ["onbekend"], direction)).toEqual(all);
  }
});

test("iedere richting behoudt precies dezelfde verzameling objecten", () => {
  for (const direction of ["front", "back", "forward", "backward"] as const)
    for (const ids of [["a"], ["c"], ["a", "e"], ["b", "c", "d"]]) {
      const result = reorder(all, ids, direction);
      expect(result).toHaveLength(all.length);
      expect([...result].sort()).toEqual([...all].sort());
    }
});
