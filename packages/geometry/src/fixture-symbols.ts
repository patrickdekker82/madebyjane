import type { FixtureKind, SymbolShape } from "../../contracts/src/index";

/**
 * Vaste tekensymbolen voor elektra en verlichting.
 *
 * Ze gebruiken dezelfde veilige primitieven als de symbooleditor: rechthoek,
 * ellips en lijn, in een genormaliseerd vierkant van 0 tot 1.000. Er zit geen
 * JavaScript of losse HTML in, en ze worden op dezelfde manier getekend als een
 * zelfgemaakt symbool.
 *
 * De symbolen zijn bewust eenvoudig en met de hand uit te leggen:
 * - wandcontactdoos: een halve cirkel op een streep, de gangbare vorm;
 * - schakelaar: een rondje met een schuine hendel;
 * - lichtpunt plafond: een rondje met een kruis erdoor;
 * - inbouwspot: een rondje met een gevulde kern;
 * - wandarmatuur: een halve vorm tegen een streep, met de schijnrichting eruit;
 * - hanglamp: een rondje met een pendel erboven.
 *
 * Dit zijn tekenafspraken, geen normsymbolen uit een installatienorm.
 */
const line = (
  x: number,
  y: number,
  endX: number,
  endY: number,
  strokeWidth = 24,
): SymbolShape => ({
  type: "line",
  x,
  y,
  endX,
  endY,
  stroke: "#343b32",
  strokeWidth,
});
const circle = (
  x: number,
  y: number,
  size: number,
  fill: string,
  strokeWidth = 24,
): SymbolShape => ({
  type: "ellipse",
  x: x - size / 2,
  y: y - size / 2,
  width: size,
  height: size,
  fill,
  stroke: "#343b32",
  strokeWidth,
});

export const fixtureSymbols: Record<FixtureKind, SymbolShape[]> = {
  socket: [
    circle(500, 460, 520, "#ffffff"),
    line(180, 720, 820, 720, 30),
    line(500, 720, 500, 200),
  ],
  switch: [
    circle(400, 600, 400, "#ffffff"),
    line(400, 600, 800, 220),
    line(760, 220, 840, 300, 30),
  ],
  ceiling: [
    circle(500, 500, 560, "#ffffff"),
    line(280, 280, 720, 720),
    line(720, 280, 280, 720),
  ],
  spot: [circle(500, 500, 560, "#ffffff"), circle(500, 500, 240, "#343b32", 1)],
  wall: [
    line(140, 760, 860, 760, 30),
    circle(500, 560, 380, "#ffffff"),
    line(500, 560, 500, 160),
    line(430, 250, 500, 160, 24),
    line(570, 250, 500, 160, 24),
  ],
  pendant: [
    line(500, 100, 500, 420, 24),
    circle(500, 620, 520, "#ffffff"),
    line(240, 620, 760, 620, 24),
  ],
};

/**
 * Een gangbare symboolmaat op papier per soort, in millimeters. Dit is geen
 * fysieke maat: het is hoe groot het teken op de plattegrond staat, zodat het
 * op 1:50 leesbaar blijft. De fysieke maat van het armatuur blijft in breedte,
 * diepte en hoogte staan.
 */
export const defaultSymbolSizeMm: Record<FixtureKind, number> = {
  socket: 300,
  switch: 300,
  ceiling: 400,
  spot: 300,
  wall: 350,
  pendant: 400,
};
