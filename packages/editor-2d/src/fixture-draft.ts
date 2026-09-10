import {
  fixtureKinds,
  lightingKinds,
  type FixtureKind,
  type Item,
} from "../../contracts/src/index";
import {
  defaultSymbolSizeMm,
  fixtureSymbols,
} from "../../geometry/src/fixture-symbols";

/**
 * Beginwaarden voor een nieuw elektra- of verlichtingspunt.
 *
 * De fysieke maat (breedte, diepte, hoogte) is een gangbare inbouwmaat en staat
 * los van de symboolmaat waarmee het punt op papier wordt getekend. De
 * bundelhoek is alleen ingevuld waar hij betekenis heeft; elektra krijgt er
 * geen. Al deze waarden zijn een startpunt, geen advies over wat er hoort te
 * hangen.
 */
const physical: Record<FixtureKind, { size: number; height: number }> = {
  socket: { size: 80, height: 300 },
  switch: { size: 80, height: 1050 },
  ceiling: { size: 250, height: 2700 },
  spot: { size: 90, height: 2700 },
  wall: { size: 180, height: 1900 },
  pendant: { size: 350, height: 1800 },
};
const beam: Record<FixtureKind, number | null> = {
  socket: null,
  switch: null,
  ceiling: 120,
  spot: 36,
  wall: 90,
  pendant: 100,
};

export function newFixtureItem(
  kind: FixtureKind,
  x: number,
  y: number,
  id = crypto.randomUUID(),
): Item {
  const { size, height } = physical[kind];
  return {
    id,
    name: fixtureKinds[kind],
    layer: lightingKinds.includes(kind) ? "lighting" : "electrical",
    x,
    y,
    width: size,
    depth: size,
    height: 60,
    rotation: 0,
    color: "#e9eee7",
    custom: false,
    symbol: fixtureSymbols[kind],
    kind: "light",
    fixture: {
      kind,
      mountHeightMm: height,
      symbolSizeMm: defaultSymbolSizeMm[kind],
      circuit: "",
      scene: "",
      beamAngle: beam[kind],
      colorTemperatureK: lightingKinds.includes(kind) ? 2700 : null,
      dimLevel: 100,
      lumen: null,
      milliwatt: null,
    },
  };
}
