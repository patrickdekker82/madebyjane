import type { Scene } from "../../contracts/src/index";
export function emptyScene(
  organizationId: string,
  projectId: string,
  designVariantId: string,
  floorId: string,
): Scene {
  return {
    schemaVersion: 1,
    revision: 0,
    organizationId,
    projectId,
    designVariantId,
    floorId,
    nodes: [],
    walls: [],
    openings: [],
    items: [],
    annotations: [],
    ledPaths: [],
    underlay: null,
    cameras: [],
  };
}
export function demoScene(
  organizationId: string,
  projectId: string,
  designVariantId: string,
  floorId: string,
): Scene {
  const s = emptyScene(organizationId, projectId, designVariantId, floorId);
  s.nodes = [
    [0, 0],
    [6200, 0],
    [6200, 3600],
    [5000, 4800],
    [0, 4800],
  ].map(([x, y]) => ({ id: crypto.randomUUID(), x: x!, y: y! }));
  s.walls = s.nodes.map((n, i) => ({
    id: crypto.randomUUID(),
    startId: n.id,
    endId: s.nodes[(i + 1) % s.nodes.length]!.id,
    thickness: 180,
    height: 2700,
  }));
  s.openings = [
    {
      id: crypto.randomUUID(),
      wallId: s.walls[0]!.id,
      kind: "window",
      offset: 1600,
      width: 2600,
      height: 1500,
      sillHeight: 850,
      swing: "left",
    },
    {
      id: crypto.randomUUID(),
      wallId: s.walls[4]!.id,
      kind: "door",
      offset: 900,
      width: 930,
      height: 2300,
      sillHeight: 0,
      swing: "right",
    },
  ];
  s.items = [
    {
      id: crypto.randomUUID(),
      name: "Bank · linnen naturel",
      kind: "sofa",
      x: 1700,
      y: 3300,
      width: 2400,
      depth: 950,
      height: 780,
      rotation: 0,
      color: "#c4b39d",
      custom: false,
    },
    {
      id: crypto.randomUUID(),
      name: "Salontafel · eiken",
      kind: "table",
      x: 1900,
      y: 2150,
      width: 1200,
      depth: 650,
      height: 380,
      rotation: 0,
      color: "#96734e",
      custom: false,
    },
    {
      id: crypto.randomUUID(),
      name: "Eettafel · rond",
      kind: "table",
      x: 4700,
      y: 1600,
      width: 1200,
      depth: 1200,
      height: 750,
      rotation: 0,
      color: "#af8b62",
      custom: false,
    },
    {
      id: crypto.randomUUID(),
      name: "Dressoir",
      kind: "cabinet",
      x: 4750,
      y: 4000,
      width: 1800,
      depth: 450,
      height: 800,
      rotation: -45,
      color: "#687463",
      custom: false,
    },
  ];
  return s;
}
export function performanceScene(): Scene {
  const uid = (n: number) =>
    "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
  const scene = emptyScene(uid(1), uid(2), uid(3), uid(4));
  for (let n = 0; n < 100; n++) {
    const row = Math.floor(n / 10),
      col = n % 10;
    const a = { id: uid(1000 + n * 2), x: col * 600, y: row * 450 },
      b = { id: uid(1001 + n * 2), x: col * 600 + 500, y: row * 450 + 150 };
    scene.nodes.push(a, b);
    scene.walls.push({
      id: uid(2000 + n),
      startId: a.id,
      endId: b.id,
      thickness: 80,
      height: 2700,
    });
  }
  for (let n = 0; n < 500; n++)
    scene.items.push({
      id: uid(3000 + n),
      name: "Testmeubel " + (n + 1),
      kind: "cabinet",
      x: 100 + (n % 25) * 240,
      y: 100 + Math.floor(n / 25) * 220,
      width: 150,
      depth: 120,
      height: 750,
      rotation: (n % 4) * 45,
      color: "#8e9a80",
      custom: false,
    });
  return scene;
}
