import type { FixtureKind, Item } from "../../contracts/src/index";
import { lightingKinds } from "../../contracts/src/index";

/**
 * Wat er 's avonds in de 3D-weergave aangaat.
 *
 * Net als `beamFootprint` in het platte vlak is dit een **visuele benadering en
 * geen lichtberekening**. Er komt geen lux uit, geen luxkaart en geen
 * gelijkmatigheid; de app dimensioneert geen verlichtingsinstallatie. Wat hier
 * uit komt is waar een lamp hangt, welke kant hij op schijnt, hoe warm zijn
 * licht is en hoe fel hij staat ten opzichte van de andere lampen in dezelfde
 * ruimte. Meer niet, en dat staat ook zo in beeld.
 *
 * De keuzes staan hier en niet in de weergave, om één reden: hier zijn ze te
 * toetsen zonder browser. De weergave tekent alleen wat deze functie zegt.
 */
export type PlannedLight = {
  id: string;
  kind: FixtureKind;
  /** Waar de lamp hangt, in mm; `z` is de hoogte boven de vloer. */
  at: { x: number; y: number; z: number };
  /** Het punt waar hij op mikt, in mm. */
  toward: { x: number; y: number; z: number };
  /** Kleur uit de kleurtemperatuur, als `#rrggbb`. */
  color: string;
  /**
   * Hoe fel, van 0 tot 2, waarbij 1 een gewone lamp is. Dit is een verhouding
   * tussen de lampen onderling en nadrukkelijk geen lichtsterkte.
   */
  strength: number;
  /** Halve tophoek van de kegel in graden; null bij een lamp die rondom schijnt. */
  coneHalfAngleDeg: number | null;
  /** Afstand van de lamp tot het punt waar hij op mikt, in mm. */
  reachMm: number;
};

export type LightPlan = {
  lights: PlannedLight[];
  /**
   * Armaturen die wel branden maar niet als lichtbron zijn getekend, omdat er
   * een grens zit aan het aantal lampen dat een browser aankan. Dit getal hoort
   * in beeld: een donkere hoek mag niet de indruk wekken dat daar geen licht
   * gepland is.
   */
  omitted: number;
};

/** Armaturen die de kamer in schijnen in plaats van recht naar beneden. */
const directional: readonly FixtureKind[] = ["wall"];
/**
 * Waar een wandarmatuur op mikt als er geen bundelhoek is opgegeven: drie meter
 * de kamer in, op ooghoogte. Een aanname, geen meting.
 */
const WALL_REACH_MM = 3000;
/** De lichtstroom waarbij een lamp "gewoon" fel staat; ongeveer een led van 9 W. */
const REFERENCE_LUMEN = 800;

/**
 * Kleurtemperatuur naar beeldschermkleur, met de bekende benadering van
 * Tanner Helland. Exact is het niet — de omrekening van Kelvin naar sRGB kent
 * geen enkele juiste uitkomst — maar de volgorde klopt, en dat is wat een
 * gebruiker ziet: 2700 K is warm geel, 4000 K neutraal, 6500 K wit en daarboven
 * wordt het blauw.
 */
export function kelvinToRgb(kelvin: number): string {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  const kanaal = (waarde: number) =>
    Math.round(Math.min(Math.max(waarde, 0), 255));
  const rood = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const groen =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const blauw =
    t >= 66
      ? 255
      : t <= 19
        ? 0
        : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return (
    "#" +
    [rood, groen, blauw]
      .map((waarde) => kanaal(waarde).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Welke armaturen er als lichtbron worden getekend, en welke niet.
 *
 * Overdag gaat er niets aan: dan is de zon de lichtbron en zou een brandende
 * spot alleen maar een vlek op de vloer opleveren die er in het echt niet is.
 *
 * De grens op het aantal lampen is een harde eis van de weergave en niet van
 * het ontwerp: een browser kan er maar een beperkt aantal tegelijk aan. Bij een
 * plafond vol spots worden daarom de felste getekend en de rest geteld. Welke
 * dat zijn ligt vast — op sterkte, dan op ID — zodat hetzelfde ontwerp twee keer
 * hetzelfde beeld oplevert.
 */
export function lightPlan(
  items: readonly Item[],
  options: { mode: "day" | "evening"; max?: number },
): LightPlan {
  if (options.mode === "day") return { lights: [], omitted: 0 };
  const max = options.max ?? 8;
  const branden: PlannedLight[] = [];
  for (const item of items) {
    const fixture = item.fixture;
    if (!fixture || item.hidden) continue;
    if (!lightingKinds.includes(fixture.kind)) continue;
    // Een lamp die helemaal uit gedimd is, is uit. Die telt ook niet als
    // weggelaten: er valt niets te tonen.
    if (fixture.dimLevel <= 0) continue;
    const gedimd = fixture.dimLevel / 100;
    /*
     * Zonder opgegeven lichtstroom is elke lamp even fel; dat is eerlijker dan
     * een getal verzinnen. Met lichtstroom telt de verhouding tot een gewone
     * lamp mee, begrensd zodat één sterke bouwlamp de rest niet wegvaagt.
     */
    const uitLumen =
      fixture.lumen === null || fixture.lumen <= 0
        ? 1
        : Math.min(Math.max(fixture.lumen / REFERENCE_LUMEN, 0.25), 2);
    const strength = Math.round(gedimd * uitLumen * 100) / 100;
    const zijwaarts = directional.includes(fixture.kind);
    const radialen = (item.rotation * Math.PI) / 180;
    const at = { x: item.x, y: item.y, z: fixture.mountHeightMm };
    const halveHoek = fixture.beamAngle === null ? null : fixture.beamAngle / 2;
    const toward = zijwaarts
      ? {
          x: Math.round(item.x + Math.cos(radialen) * WALL_REACH_MM),
          y: Math.round(item.y + Math.sin(radialen) * WALL_REACH_MM),
          z: fixture.mountHeightMm,
        }
      : { x: item.x, y: item.y, z: 0 };
    /*
     * De reikwijdte is de afstand tot het punt waar de lamp op mikt: voor een
     * plafondpunt de montagehoogte, voor een wandarmatuur de aangenomen drie
     * meter. Hangt een lamp op de vloer of lager, dan valt er niets te
     * beschijnen.
     */
    const reachMm = zijwaarts ? WALL_REACH_MM : fixture.mountHeightMm;
    if (reachMm <= 0) continue;
    branden.push({
      id: item.id,
      kind: fixture.kind,
      at,
      toward,
      color: kelvinToRgb(fixture.colorTemperatureK ?? 2700),
      strength,
      // Boven de 180 graden bestaat er geen zinnige kegel meer; dan schijnt hij
      // rondom. Dezelfde grens als in het platte vlak.
      coneHalfAngleDeg:
        halveHoek === null || halveHoek >= 90 ? null : halveHoek,
      reachMm,
    });
  }
  const opSterkte = [...branden].sort(
    (a, b) => b.strength - a.strength || a.id.localeCompare(b.id),
  );
  return {
    lights: opSterkte.slice(0, max),
    omitted: Math.max(opSterkte.length - max, 0),
  };
}
