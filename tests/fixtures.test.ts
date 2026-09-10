import { test, expect } from "vitest";
import fc from "fast-check";
import { beamFootprint, beamBounds } from "../packages/geometry/src/beam";
import {
  fixtureSymbols,
  defaultSymbolSizeMm,
} from "../packages/geometry/src/fixture-symbols";
import { newFixtureItem } from "../packages/editor-2d/src/fixture-draft";
import { applyOperations } from "../packages/domain/src/index";
import { demoScene } from "../packages/test-fixtures/src/index";
import {
  fixtureKinds,
  lightingKinds,
  symbolSchema,
  type FixtureKind,
} from "../packages/contracts/src/index";
import { planSvg } from "../packages/documents/src/plan";

const scene = demoScene(
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
);

test("elk vast symbool is geldig volgens hetzelfde schema als een eigen symbool", () => {
  for (const kind of Object.keys(fixtureKinds) as FixtureKind[]) {
    expect(() => symbolSchema.parse(fixtureSymbols[kind])).not.toThrow();
    expect(defaultSymbolSizeMm[kind]).toBeGreaterThan(0);
  }
});

test("een spot recht naar beneden geeft een cirkel met een narekenbare straal", () => {
  const item = newFixtureItem("spot", 1000, 2000);
  // 2.700 mm hoog, 36 graden: straal = 2700 x tan(18 graden).
  const footprint = beamFootprint(item)!;
  expect(footprint.shape).toBe("circle");
  expect(footprint.x).toBe(1000);
  expect(footprint.y).toBe(2000);
  expect(footprint.radiusMm).toBeCloseTo(
    2700 * Math.tan((18 * Math.PI) / 180),
    6,
  );
});

test("een wandarmatuur geeft een sector rond zijn eigen richting", () => {
  const item = { ...newFixtureItem("wall", 0, 0), rotation: 90 };
  const footprint = beamFootprint(item)!;
  if (footprint.shape !== "sector") throw new Error("sector verwacht");
  // Bundel van 90 graden, dus 45 graden aan weerszijden van de richting.
  expect(footprint.fromDeg).toBe(45);
  expect(footprint.toDeg).toBe(135);
  expect(footprint.radiusMm).toBeCloseTo(
    1900 * Math.tan((45 * Math.PI) / 180),
    6,
  );
});

test("elektra straalt niet", () => {
  expect(beamFootprint(newFixtureItem("socket", 0, 0))).toBeNull();
  expect(beamFootprint(newFixtureItem("switch", 0, 0))).toBeNull();
});

test("zonder bundelhoek of boven het werkvlak komt er geen bundel", () => {
  const spot = newFixtureItem("spot", 0, 0);
  expect(
    beamFootprint({ ...spot, fixture: { ...spot.fixture!, beamAngle: null } }),
  ).toBeNull();
  // Een punt op of onder het werkvlak levert geen zinnige kegel.
  expect(
    beamFootprint({
      ...spot,
      fixture: { ...spot.fixture!, mountHeightMm: 1000 },
    }),
  ).not.toBeNull();
  expect(
    beamFootprint(
      { ...spot, fixture: { ...spot.fixture!, mountHeightMm: 800 } },
      800,
    ),
  ).toBeNull();
  // Een meubel zonder armatuurgegevens straalt evenmin.
  expect(beamFootprint(scene.items[0]!)).toBeNull();
});

test("een hoger werkvlak maakt de bundel kleiner", () => {
  const spot = newFixtureItem("spot", 0, 0);
  const floor = beamFootprint(spot)!.radiusMm;
  const table = beamFootprint(spot, 750)!.radiusMm;
  expect(table).toBeLessThan(floor);
  // De verhouding volgt de hoogte, want de hoek verandert niet.
  expect(table / floor).toBeCloseTo((2700 - 750) / 2700, 6);
});

test("de omhullende doos dekt de hele bundel", () => {
  const footprint = beamFootprint(newFixtureItem("spot", 500, -300))!;
  const bounds = beamBounds(footprint);
  expect(bounds.maxX - bounds.minX).toBeCloseTo(2 * footprint.radiusMm, 6);
  expect(bounds.minY).toBeCloseTo(-300 - footprint.radiusMm, 6);
});

test("de straal groeit met de hoogte en met de hoek", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 100, max: 8000 }),
      fc.integer({ min: 1, max: 179 }),
      (height, angle) => {
        const spot = newFixtureItem("spot", 0, 0);
        const at = (h: number, a: number) =>
          beamFootprint({
            ...spot,
            fixture: { ...spot.fixture!, mountHeightMm: h, beamAngle: a },
          })!.radiusMm;
        expect(at(height + 100, angle)).toBeGreaterThan(at(height, angle));
        if (angle < 179)
          expect(at(height, angle + 1)).toBeGreaterThan(at(height, angle));
      },
    ),
    { numRuns: 200 },
  );
});

test("een nieuw punt komt op de juiste laag en houdt papier en werkelijkheid uit elkaar", () => {
  for (const kind of Object.keys(fixtureKinds) as FixtureKind[]) {
    const item = newFixtureItem(kind, 0, 0);
    expect(item.layer).toBe(
      lightingKinds.includes(kind) ? "lighting" : "electrical",
    );
    // De symboolmaat op papier is een tekenafspraak, niet de fysieke maat.
    expect(item.fixture!.symbolSizeMm).not.toBe(item.width);
    expect(item.fixture!.lumen).toBeNull();
    expect(item.fixture!.milliwatt).toBeNull();
  }
});

test("armatuurvelden zijn alleen op een punt te zetten en niet op een meubel", () => {
  const spot = newFixtureItem("spot", 1200, 1200);
  const placed = applyOperations(scene, [{ type: "PlaceItem", item: spot }]);
  const changed = applyOperations(placed, [
    {
      type: "SetFixture",
      id: spot.id,
      fixture: { ...spot.fixture!, circuit: "Groep 3", dimLevel: 40 },
    },
  ]);
  expect(changed.items.find((i) => i.id === spot.id)!.fixture!.circuit).toBe(
    "Groep 3",
  );
  expect(() =>
    applyOperations(placed, [
      {
        type: "SetFixture",
        id: scene.items[0]!.id,
        fixture: spot.fixture!,
      },
    ]),
  ).toThrow("geen elektra- of verlichtingspunt");
  expect(() =>
    applyOperations(placed, [
      {
        type: "SetFixture",
        id: "55555555-5555-4555-8555-555555555555",
        fixture: spot.fixture!,
      },
    ]),
  ).toThrow("bestaat niet meer");
});

test("een vergrendeld punt is niet te wijzigen", () => {
  const spot = { ...newFixtureItem("spot", 1200, 1200), locked: true };
  const placed = applyOperations(scene, [{ type: "PlaceItem", item: spot }]);
  expect(() =>
    applyOperations(placed, [
      { type: "SetFixture", id: spot.id, fixture: spot.fixture! },
    ]),
  ).toThrow("vergrendeld");
});

test("het planblad tekent bundels alleen wanneer erom gevraagd is", () => {
  const spot = newFixtureItem("spot", 2000, 2000);
  const placed = applyOperations(scene, [{ type: "PlaceItem", item: spot }]);
  const plain = planSvg(placed, 50);
  const lit = planSvg(placed, 50, { beams: true });
  expect(plain).not.toContain("Lichtbundels getoond");
  expect(lit).toContain("Lichtbundels getoond");
  expect(lit).toContain("visuele benadering, geen lichtberekening");
  // De cirkel van de bundel staat er alleen in de tweede versie.
  expect(lit.match(/<circle /g)?.length ?? 0).toBeGreaterThan(
    plain.match(/<circle /g)?.length ?? 0,
  );
});

test("de symbolenlegenda noemt elk soort punt dat op het blad staat", () => {
  const placed = applyOperations(scene, [
    { type: "PlaceItem", item: newFixtureItem("spot", 2000, 2000) },
    { type: "PlaceItem", item: newFixtureItem("spot", 2600, 2000) },
    { type: "PlaceItem", item: newFixtureItem("socket", 1000, 500) },
  ]);
  const svg = planSvg(placed, 50);
  expect(svg).toContain("SYMBOLEN");
  expect(svg).toContain("Inbouwspot × 2");
  expect(svg).toContain("Wandcontactdoos × 1");
  // Wat niet op het blad staat, staat ook niet in de legenda.
  expect(svg).not.toContain("Hanglamp");
});

test("een verborgen punt verdwijnt uit tekening en symbolenlegenda", () => {
  const spot = newFixtureItem("spot", 2000, 2000);
  const placed = applyOperations(scene, [{ type: "PlaceItem", item: spot }]);
  const hidden = applyOperations(placed, [
    { type: "SetItemDisplay", ids: [spot.id], hidden: true },
  ]);
  expect(planSvg(placed, 50)).toContain("Inbouwspot × 1");
  expect(planSvg(hidden, 50)).not.toContain("Inbouwspot ×");
  // En de bundel gaat mee weg: het verborgen punt levert geen extra cirkel meer.
  const circles = (svg: string) => svg.match(/<circle /g)?.length ?? 0;
  expect(circles(planSvg(placed, 50, { beams: true }))).toBe(
    circles(planSvg(hidden, 50, { beams: true })) + 1,
  );
});
