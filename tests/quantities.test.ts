import { test, expect } from "vitest";
import fc from "fast-check";
import { roomQuantities } from "../packages/geometry/src/index";
import { computeQuantity } from "../packages/domain/src/quantities";
import { emptyScene, demoScene } from "../packages/test-fixtures/src/index";
import type { Scene } from "../packages/contracts/src/index";

function scene(
  points: [number, number][],
  edges: [number, number][],
  thickness = 180,
  height = 2700,
): Scene {
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
    thickness,
    height,
  }));
  return s;
}
const ring = (from: number, count: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [from + i, from + ((i + 1) % count)]);
const rectangle = (w: number, h: number, thickness = 180) =>
  scene(
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    ring(0, 4),
    thickness,
  );

test("netto vloer, omtrek, plint en wandoppervlak volgen de halve muurdikte", () => {
  const s = rectangle(4000, 3000);
  const room = roomQuantities(s).rooms[0]!;
  expect(room.issues).toEqual([]);
  expect(room.grossFloorAreaMm2).toBe(12_000_000);
  expect(room.netFloorAreaMm2).toBe(3820 * 2820);
  expect(room.netPerimeterMm).toBe(2 * (3820 + 2820));
  expect(room.plinthLengthMm).toBe(room.netPerimeterMm);
  expect(room.wallAreaMm2).toBe(room.netPerimeterMm * 2700);
  expect(room.doorWidthMm).toBe(0);
});

test("een deur onderbreekt de plint, een raam niet; beide verkleinen het wandoppervlak", () => {
  const s = rectangle(4000, 3000);
  s.openings = [
    {
      id: crypto.randomUUID(),
      wallId: s.walls[0]!.id,
      kind: "door",
      offset: 500,
      width: 900,
      height: 2300,
      sillHeight: 0,
      swing: "left",
    },
    {
      id: crypto.randomUUID(),
      wallId: s.walls[1]!.id,
      kind: "window",
      offset: 400,
      width: 1200,
      height: 1400,
      sillHeight: 900,
      swing: "left",
    },
  ];
  const bare = roomQuantities(rectangle(4000, 3000)).rooms[0]!;
  const room = roomQuantities(s).rooms[0]!;
  expect(room.netFloorAreaMm2).toBe(bare.netFloorAreaMm2);
  expect(room.doorWidthMm).toBe(900);
  expect(room.plinthLengthMm).toBe(bare.netPerimeterMm - 900);
  expect(room.openingAreaMm2).toBe(900 * 2300 + 1200 * 1400);
  expect(room.wallAreaMm2).toBe(bare.wallAreaMm2 - room.openingAreaMm2);
});

test("een ingesloten ruimte wordt met muurdikte van het netto vloeroppervlak afgetrokken", () => {
  const s = scene(
    [
      [0, 0],
      [6000, 0],
      [6000, 6000],
      [0, 6000],
      [2000, 2000],
      [4000, 2000],
      [4000, 4000],
      [2000, 4000],
    ],
    [...ring(0, 4), ...ring(4, 4)],
  );
  const detection = roomQuantities(s);
  const outer = detection.rooms.find(
    (r) => r.grossFloorAreaMm2 === 36_000_000 - 4_000_000,
  )!;
  const inner = detection.rooms.find((r) => r.grossFloorAreaMm2 === 4_000_000)!;
  expect(outer.netFloorAreaMm2).toBe(5820 * 5820 - 2180 * 2180);
  expect(outer.netPerimeterMm).toBe(4 * 5820 + 4 * 2180);
  expect(inner.netFloorAreaMm2).toBe(1820 * 1820);
});

test("te dikke muren leveren geen hoeveelheid maar een leesbare melding", () => {
  const room = roomQuantities(rectangle(600, 600, 800)).rooms[0]!;
  expect(room.netFloorAreaMm2).toBe(0);
  expect(room.issues[0]).toMatch(/muurdiktes/i);
});

test("zonder gesloten contour zijn er geen hoeveelheden", () => {
  const s = scene(
    [
      [0, 0],
      [3000, 0],
      [3000, 2000],
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const detection = roomQuantities(s);
  expect(detection.rooms).toEqual([]);
  expect(detection.issues.length).toBe(1);
});

test("netto oppervlak is onafhankelijk van verschuiving, spiegeling en muurrichting", () => {
  const base = roomQuantities(rectangle(4000, 3000)).rooms[0]!;
  const reversed = scene(
    [
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ],
    [
      [1, 0],
      [2, 1],
      [3, 2],
      [0, 3],
    ],
  );
  expect(roomQuantities(reversed).rooms[0]!.netFloorAreaMm2).toBe(
    base.netFloorAreaMm2,
  );
  fc.assert(
    fc.property(
      fc.integer({ min: -20000, max: 20000 }),
      fc.integer({ min: -20000, max: 20000 }),
      (dx, dy) => {
        const moved = scene(
          (
            [
              [0, 0],
              [4000, 0],
              [4000, 3000],
              [0, 3000],
            ] as [number, number][]
          ).map(([x, y]) => [x + dx, y + dy] as [number, number]),
          ring(0, 4),
        );
        const room = roomQuantities(moved).rooms[0]!;
        expect(room.netFloorAreaMm2).toBe(base.netFloorAreaMm2);
        expect(room.netPerimeterMm).toBe(base.netPerimeterMm);
      },
    ),
    { numRuns: 200 },
  );
});

test("het schuine demoproject levert een netto oppervlak onder het hartlijnoppervlak", () => {
  const room = roomQuantities(
    demoScene(
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ),
  ).rooms[0]!;
  expect(room.issues).toEqual([]);
  expect(room.grossFloorAreaMm2).toBe(29_040_000);
  // Onafhankelijk nagerekend met A(d) = A - P*d + d^2 * som(cot(hoek/2)),
  // met d = 90 mm: 27.154.275,19 mm^2 en een netto omtrek van 20.607,94 mm.
  expect(room.netFloorAreaMm2).toBe(27_154_275);
  expect(room.netPerimeterMm).toBe(20_608);
  expect(room.doorWidthMm).toBe(930);
  expect(room.plinthLengthMm).toBe(20_608 - 930);
});

test("snijverlies en bestelstap rekenen met decimalen, niet met floats", () => {
  const room = roomQuantities(rectangle(4000, 3000)).rooms[0]!;
  expect(computeQuantity(room, "floor_area", "0", null)).toEqual({
    unit: "m²",
    netQuantity: "10.772",
    wasteQuantity: "0",
    grossQuantity: "10.772",
    orderQuantity: "10.772",
  });
  expect(computeQuantity(room, "floor_area", "10", "0.5")).toEqual({
    unit: "m²",
    netQuantity: "10.772",
    wasteQuantity: "1.077",
    grossQuantity: "11.849",
    orderQuantity: "12",
  });
  expect(computeQuantity(room, "plinth", "0", "2.4")).toEqual({
    unit: "m",
    netQuantity: "13.28",
    wasteQuantity: "0",
    grossQuantity: "13.28",
    orderQuantity: "14.4",
  });
  // 0,1 + 0,2 blijft exact in decimalrekenwerk.
  expect(
    computeQuantity({ ...room, netPerimeterMm: 100 }, "perimeter", "200", null)
      .grossQuantity,
  ).toBe("0.3");
});
