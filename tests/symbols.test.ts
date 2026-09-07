import { test, expect } from "vitest";
import {
  symbolSchema,
  libraryDefinitionSchema,
  type SymbolShape,
} from "../packages/contracts/src/index";
import { symbolPrimitives, symbolSvg } from "../packages/geometry/src/symbol";
import { demoScene } from "../packages/test-fixtures/src/index";
import { applyOperations } from "../packages/domain/src/index";
import { planSvg } from "../packages/documents/src/plan";
const rectangle: SymbolShape = {
  type: "rect",
  x: 100,
  y: 100,
  width: 800,
  height: 800,
  fill: "#c4b39d",
  stroke: "#393c33",
  strokeWidth: 5,
};
test("symboolcoördinaten schalen exact naar meubelbreedte en diepte", () => {
  const p = symbolPrimitives([rectangle], 2400, 950)[0]!;
  expect(p.x).toBe(-960);
  expect(p.y).toBe(-380);
  expect(p.type === "rect" && p.width).toBe(1920);
  expect(p.type === "rect" && p.height).toBe(760);
  expect(p.strokeWidth).toBe(4.75);
  expect(symbolSvg([rectangle], 2400, 950)).toContain(
    'width="1920" height="760"',
  );
});
test("symbolen weigeren onbegrensde vormen, externe inhoud en te veel vormen", () => {
  for (const shapes of [
    [{ ...rectangle, width: 1000 }],
    [{ ...rectangle, x: -1 }],
    [{ ...rectangle, fill: "url(https://example.test/image)" }],
    [{ ...rectangle, type: "script" }],
    [{ ...rectangle, href: "https://example.test" }],
    Array(33).fill(rectangle),
  ])
    expect(symbolSchema.safeParse(shapes).success).toBe(false);
  expect(
    symbolSchema.safeParse([
      {
        type: "line",
        x: 100,
        y: 100,
        endX: 100,
        endY: 100,
        stroke: "#000000",
        strokeWidth: 5,
      },
    ]).success,
  ).toBe(false);
});
test("bibliotheeksymbool blijft snapshot bij transform en wordt als vector geëxporteerd", () => {
  const scene = demoScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
  const item = scene.items[0]!;
  item.symbol = [
    rectangle,
    {
      type: "ellipse",
      x: 250,
      y: 250,
      width: 500,
      height: 500,
      fill: "#ffffff",
      stroke: "#393c33",
      strokeWidth: 5,
    },
  ];
  const next = applyOperations(scene, [
    {
      type: "TransformItem",
      id: item.id,
      x: 2200,
      y: item.y,
      width: item.width,
      depth: item.depth,
      rotation: 90,
      custom: false,
    },
  ]);
  expect(next.items[0]!.symbol).toEqual(item.symbol);
  expect(planSvg(next)).toContain("<ellipse");
  expect(planSvg(next)).toContain("rotate(90)");
  expect(
    libraryDefinitionSchema.parse({
      name: item.name,
      kind: item.kind,
      width: item.width,
      depth: item.depth,
      height: item.height,
      color: item.color,
      symbol: item.symbol,
    }).symbol,
  ).toEqual(item.symbol);
});
