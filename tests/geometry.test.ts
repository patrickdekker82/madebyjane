import { test, expect } from "vitest";
import fc from "fast-check";
import { demoScene } from "../packages/test-fixtures/src/index";
import {
  applyOperations,
  contentOf,
  validateScene,
} from "../packages/domain/src/index";
import {
  toThree,
  toThreeRotation,
  wallSegments,
  endpoints,
  polygonArea,
  parseDutchNumber,
} from "../packages/geometry/src/index";
import { planSvg } from "../packages/documents/src/plan";
const demo = () =>
  demoScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
test("2400 mm meubel behoudt maat na rotatie, serialisatie en undo", () => {
  const s = demo(),
    i = s.items[0]!;
  const moved = applyOperations(s, [
    {
      type: "TransformItem",
      id: i.id,
      x: 2300,
      y: 1700,
      width: 2400,
      depth: 950,
      rotation: 90,
      custom: false,
    },
  ]);
  const round = validateScene(JSON.parse(JSON.stringify(moved)));
  expect(round.items[0]!.width).toBe(2400);
  expect(toThree(round.items[0]!.width, 0)[0]).toBe(2.4);
  expect(toThreeRotation(90)).toBe(-Math.PI / 2);
  expect(
    contentOf(
      applyOperations(round, [
        { type: "RestoreContent", content: contentOf(s) },
      ]),
    ),
  ).toEqual(contentOf(s));
});
test("eenheden property roundtrip bij gehele mm", () =>
  fc.assert(
    fc.property(
      fc.integer({ min: -100000, max: 100000 }),
      fc.integer({ min: -100000, max: 100000 }),
      fc.integer({ min: 0, max: 10000 }),
      (x, y, h) => {
        const p = toThree(x, y, h);
        expect(Math.round(p[0] * 1000)).toBe(x);
        expect(Math.round(p[2] * 1000)).toBe(y);
        expect(Math.round(p[1] * 1000)).toBe(h);
      },
    ),
    { numRuns: 500 },
  ));
test("echte deuropening in 3D heeft uitsluitend latei", () => {
  const s = demo(),
    o = s.openings.find((o) => o.kind === "door")!,
    w = s.walls.find((w) => w.id === o.wallId)!;
  const sections = wallSegments(s, w);
  const middle = sections.filter(
    (p) => p.offset === o.offset && p.width === o.width,
  );
  expect(middle).toEqual([
    { offset: o.offset, width: o.width, bottom: 2300, height: 400 },
  ]);
});
test("raam houdt borstwering en latei, schuine muur heeft juiste lengte", () => {
  const s = demo(),
    w = s.walls[2]!;
  expect(endpoints(s, w).length).toBeCloseTo(Math.sqrt(1200 ** 2 * 2), 5);
  const sections = wallSegments(s, s.walls[0]!);
  expect(sections.some((p) => p.height === 850)).toBe(true);
  expect(sections.some((p) => p.bottom === 2350 && p.height === 350)).toBe(
    true,
  );
});
test("overlap, buitenmuur, NaN, duplicaten en korte muur worden afgewezen", () => {
  const s = demo(),
    o = s.openings[0]!;
  expect(() =>
    applyOperations(s, [
      { type: "AddOpening", opening: { ...o, id: crypto.randomUUID() } },
    ]),
  ).toThrow(/overlap/);
  expect(() =>
    applyOperations(s, [
      {
        type: "AddOpening",
        opening: { ...o, id: crypto.randomUUID(), offset: 6000 },
      },
    ]),
  ).toThrow();
  expect(() =>
    validateScene({ ...s, items: [{ ...s.items[0], x: NaN }] }),
  ).toThrow();
  expect(() =>
    validateScene({ ...s, nodes: [...s.nodes, s.nodes[0]] }),
  ).toThrow();
  expect(() =>
    applyOperations(s, [
      { type: "MoveWallNode", id: s.nodes[1]!.id, x: 1, y: 1 },
    ]),
  ).toThrow(/50 mm/);
});
test("batchfout verandert originele scene niet; vaste maat vereist maatwerk", () => {
  const s = demo(),
    copy = structuredClone(s),
    i = s.items[0]!;
  expect(() =>
    applyOperations(s, [
      {
        type: "TransformItem",
        id: i.id,
        x: 1000,
        y: 1000,
        width: 3000,
        depth: 950,
        rotation: 0,
        custom: false,
      },
    ]),
  ).toThrow(/maatwerk/);
  expect(s).toEqual(copy);
});
test("oppervlak en NL invoer hebben expliciete semantiek", () => {
  expect(
    polygonArea([
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]) / 1e6,
  ).toBe(20);
  expect(parseDutchNumber("2,4")).toBe(2.4);
  expect(() => parseDutchNumber("2.400,00")).toThrow();
});
test("vectorplan heeft fysieke mm, correcte 5m referentie en weigert niet-passend plan", () => {
  const s = demo(),
    svg = planSvg(s);
  expect(svg).toContain('width="297mm" height="210mm"');
  expect(svg).toContain("scale(0.02)");
  expect(svg).toContain('x2="275"');
  expect(() => planSvg(s, 20)).toThrow(/past niet/);
});

test("muur- en openingmaten valideren atomisch en behouden undo", () => {
  const before = demo(),
    wall = before.walls[0]!,
    window = before.openings.find((o) => o.kind === "window")!;
  const changed = applyOperations(before, [
    { type: "ResizeWall", id: wall.id, thickness: 240, height: 3000 },
    {
      type: "ResizeOpening",
      id: window.id,
      offset: window.offset,
      width: 1000,
      height: 1200,
      sillHeight: 800,
    },
  ]);
  expect(changed.walls[0]!.thickness).toBe(240);
  expect(changed.openings.find((o) => o.id === window.id)!.width).toBe(1000);
  expect(
    contentOf(
      applyOperations(changed, [
        { type: "RestoreContent", content: contentOf(before) },
      ]),
    ),
  ).toEqual(contentOf(before));
  const snapshot = structuredClone(before);
  expect(() =>
    applyOperations(before, [
      { type: "ResizeWall", id: wall.id, thickness: 240, height: 3000 },
      {
        type: "ResizeOpening",
        id: window.id,
        offset: 99999,
        width: 1000,
        height: 1200,
        sillHeight: 800,
      },
    ]),
  ).toThrow();
  expect(before).toEqual(snapshot);
  expect(() =>
    applyOperations(before, [
      { type: "ResizeWall", id: window.wallId, thickness: 240, height: 1000 },
    ]),
  ).toThrow();
  expect(() =>
    applyOperations(before, [
      {
        type: "ResizeOpening",
        id: crypto.randomUUID(),
        offset: 0,
        width: 1000,
        height: 1200,
        sillHeight: 800,
      },
    ]),
  ).toThrow("Opening niet gevonden");
});

test("gedeeld muurpunt verplaatst aansluitingen zonder dubbele knopen", () => {
  const before = demo(),
    wall = before.walls[0]!,
    point = before.nodes.find((n) => n.id === wall.startId)!;
  const connected = before.walls.filter(
    (w) => w.startId === point.id || w.endId === point.id,
  );
  expect(connected.length).toBeGreaterThan(1);
  const next = applyOperations(before, [
    { type: "MoveWallNode", id: point.id, x: point.x + 100, y: point.y },
  ]);
  expect(next.nodes.length).toBe(before.nodes.length);
  for (const original of connected) {
    const current = next.walls.find((w) => w.id === original.id)!;
    const ends = endpoints(next, current);
    expect(current.startId === point.id ? ends.a.x : ends.b.x).toBe(
      point.x + 100,
    );
  }
  expect(before.nodes.find((n) => n.id === point.id)!.x).toBe(point.x);
});
