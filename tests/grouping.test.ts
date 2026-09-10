import { test, expect } from "vitest";
import {
  expandSelection,
  groupsIn,
  singletonGroupMembers,
} from "../packages/geometry/src/grouping";
import { demoScene } from "../packages/test-fixtures/src/index";
import { applyOperations } from "../packages/domain/src/index";

const items = [
  { id: "a", groupId: "g1" },
  { id: "b", groupId: "g1" },
  { id: "c", groupId: "g2" },
  { id: "d", groupId: "g2" },
  { id: "e", groupId: undefined },
];

test("een lid aanwijzen pakt de hele groep", () => {
  expect(expandSelection(items, ["a"])).toEqual(["a", "b"]);
  expect(expandSelection(items, ["d"])).toEqual(["c", "d"]);
  // Twee groepen tegelijk blijven allebei volledig.
  expect(expandSelection(items, ["a", "c"])).toEqual(["a", "b", "c", "d"]);
});

test("losse objecten blijven los", () => {
  expect(expandSelection(items, ["e"])).toEqual(["e"]);
  expect(expandSelection(items, ["e", "a"])).toEqual(["a", "b", "e"]);
  expect(expandSelection(items, [])).toEqual([]);
  expect(expandSelection(items, ["onbekend"])).toEqual([]);
});

test("de groepen in een selectie zijn op te vragen", () => {
  expect(groupsIn(items, ["a", "b"])).toEqual(["g1"]);
  expect(groupsIn(items, ["a", "c"])).toEqual(["g1", "g2"]);
  expect(groupsIn(items, ["e"])).toEqual([]);
});

test("een groep met een enkel lid groepeert niets", () => {
  expect(singletonGroupMembers(items)).toEqual([]);
  expect(
    singletonGroupMembers([{ id: "a", groupId: "g1" }, { id: "e", groupId: undefined }]),
  ).toEqual(["a"]);
});

const demo = () =>
  demoScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );

test("groeperen en opheffen gaan via een opdracht en behouden de rest", () => {
  const scene = demo(),
    groupId = crypto.randomUUID();
  const ids = [scene.items[0]!.id, scene.items[1]!.id];
  const grouped = applyOperations(scene, [
    { type: "SetItemGroup", ids, groupId },
  ]);
  expect(grouped.items.slice(0, 2).map((i) => i.groupId)).toEqual([
    groupId,
    groupId,
  ]);
  expect(grouped.items[2]!.groupId).toBeUndefined();
  const ungrouped = applyOperations(grouped, [
    { type: "SetItemGroup", ids, groupId: null },
  ]);
  expect(ungrouped.items.every((i) => i.groupId === undefined)).toBe(true);
});

test("een groep van een enkel meubel kan niet ontstaan", () => {
  const scene = demo();
  expect(() =>
    applyOperations(scene, [
      {
        type: "SetItemGroup",
        ids: [scene.items[0]!.id],
        groupId: crypto.randomUUID(),
      },
    ]),
  ).toThrow("minimaal twee");
  expect(() =>
    applyOperations(scene, [
      {
        type: "SetItemGroup",
        ids: [crypto.randomUUID(), crypto.randomUUID()],
        groupId: crypto.randomUUID(),
      },
    ]),
  ).toThrow("niet gevonden");
});

test("het verwijderen van een lid laat geen groep van een achter", () => {
  const scene = demo(),
    groupId = crypto.randomUUID();
  const [first, second, third] = scene.items;
  const grouped = applyOperations(scene, [
    {
      type: "SetItemGroup",
      ids: [first!.id, second!.id, third!.id],
      groupId,
    },
  ]);
  // Twee leden weg: het laatste lid houdt geen groepsverwijzing over.
  const pruned = applyOperations(grouped, [
    { type: "DeleteSelection", ids: [first!.id, second!.id] },
  ]);
  expect(pruned.items.find((i) => i.id === third!.id)!.groupId).toBeUndefined();
  // Een lid weg uit een groep van drie laat de overige twee wel groep.
  const kept = applyOperations(grouped, [
    { type: "DeleteSelection", ids: [first!.id] },
  ]);
  expect(kept.items.find((i) => i.id === second!.id)!.groupId).toBe(groupId);
});
