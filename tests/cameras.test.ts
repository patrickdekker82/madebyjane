import { test, expect } from "vitest";
import {
  cameraSchema,
  sceneSchema,
  type Camera,
} from "../packages/contracts/src/index";
import { applyOperations } from "../packages/domain/src/index";
import { fromThree, toThree } from "../packages/geometry/src/index";
import { demoScene, emptyScene } from "../packages/test-fixtures/src/index";

/*
 * Een bewaard standpunt hoort bij het ontwerp en niet bij de browser. Daarom
 * gaat het door dezelfde opdrachtenweg als een muur, en staat het in dezelfde
 * maatvoering in het document.
 */

const scene = () =>
  demoScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
const standpunt = (naam: string, x = 2000): Camera => ({
  id: crypto.randomUUID(),
  name: naam,
  eye: { x, y: 6000, z: 1600 },
  target: { x: 3000, y: 2000, z: 1100 },
  fov: 45,
});

test("een standpunt reist heen en terug zonder te verschuiven", () => {
  const camera = standpunt("Vanaf de eettafel");
  const heen = toThree(camera.eye.x, camera.eye.y, camera.eye.z);
  // De weergave rekent in meters, met de hoogte als tweede as.
  expect(heen).toEqual([2, 1.6, 6]);
  expect(fromThree(...heen)).toEqual(camera.eye);
});

test("bewaren onder dezelfde ID werkt bij, niet erbij", () => {
  const s = scene();
  const camera = standpunt("Vanaf de deur");
  const eerste = applyOperations(s, [{ type: "SaveCamera", camera }]);
  expect(eerste.cameras).toHaveLength(1);
  // Hetzelfde standpunt opnieuw bewaren levert er geen tweede op; dat is ook
  // wat een dubbel verzonden opdracht moet doen.
  const tweede = applyOperations(eerste, [
    {
      type: "SaveCamera",
      camera: { ...camera, eye: { ...camera.eye, x: 900 } },
    },
  ]);
  expect(tweede.cameras).toHaveLength(1);
  expect(tweede.cameras[0]!.eye.x).toBe(900);
  // Een ander standpunt komt er wel bij.
  const derde = applyOperations(tweede, [
    { type: "SaveCamera", camera: standpunt("Vanaf het raam") },
  ]);
  expect(derde.cameras.map((c) => c.name)).toEqual([
    "Vanaf de deur",
    "Vanaf het raam",
  ]);
  // En verwijderen haalt precies dat ene weg.
  const weg = applyOperations(derde, [{ type: "DeleteCamera", id: camera.id }]);
  expect(weg.cameras.map((c) => c.name)).toEqual(["Vanaf het raam"]);
  expect(() =>
    applyOperations(weg, [{ type: "DeleteCamera", id: camera.id }]),
  ).toThrow(/niet gevonden/);
});

test("het document loopt niet ongemerkt vol met standpunten", () => {
  let s = scene();
  for (let i = 0; i < 24; i++)
    s = applyOperations(s, [
      { type: "SaveCamera", camera: standpunt(`Standpunt ${i}`) },
    ]);
  expect(s.cameras).toHaveLength(24);
  expect(() =>
    applyOperations(s, [{ type: "SaveCamera", camera: standpunt("Te veel") }]),
  ).toThrow(/24 camerastandpunten/);
});

test("een camera die naar zichzelf kijkt is geen camera", () => {
  const camera = standpunt("Onmogelijk");
  expect(
    cameraSchema.safeParse({ ...camera, target: { ...camera.eye } }).success,
  ).toBe(false);
  // En een beeldhoek buiten het bereik van een lens wordt geweigerd.
  expect(cameraSchema.safeParse({ ...camera, fov: 5 }).success).toBe(false);
  expect(cameraSchema.safeParse({ ...camera, fov: 160 }).success).toBe(false);
});

test("scenes van voor fase 7 blijven geldig en krijgen een lege lijst", () => {
  const oud = emptyScene(
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  );
  const { cameras: _weg, ...zonder } = oud;
  const gelezen = sceneSchema.parse(zonder);
  expect(gelezen.cameras).toEqual([]);
});
