import type { Fixture, Item } from "../../contracts/src/index";
import { lightingKinds } from "../../contracts/src/index";

/**
 * De 2D-uitstraling van een armatuur.
 *
 * Dit is een visuele benadering en nadrukkelijk geen lichtberekening. Er komt
 * geen lux uit, geen luxkaart en geen UGR-waarde; de app dimensioneert geen
 * verlichtingsinstallatie. Wat hier staat is de vorm die een bundel op de
 * vloer zou beslaan onder twee uitgesproken aannames:
 *
 * 1. De bundel is een rechte kegel met de opgegeven bundelhoek.
 * 2. Hij valt op het werkvlak, standaard de vloer op hoogte nul.
 *
 * Daaruit volgt de straal met een formule die niets verstopt:
 *
 *     straal = (montagehoogte - werkvlak) x tan(bundelhoek / 2)
 *
 * Een plafondpunt, spot of hanglamp schijnt recht naar beneden en levert een
 * cirkel. Een wandarmatuur schijnt de kamer in en levert een sector rond de
 * richting waarin het armatuur staat; de rotatie van het object is die
 * richting. Boven de 180 graden bestaat er geen zinnige kegel meer, dus daar
 * wordt de bundel niet getekend.
 */
export type BeamFootprint =
  | { shape: "circle"; x: number; y: number; radiusMm: number }
  | {
      shape: "sector";
      x: number;
      y: number;
      radiusMm: number;
      /** Graden, met de klok mee, gelijk aan de rotatie van het object. */
      fromDeg: number;
      toDeg: number;
    };

/** Armaturen die met de wand mee schijnen in plaats van recht naar beneden. */
const directional: readonly Fixture["kind"][] = ["wall"];

export function beamFootprint(
  item: Pick<Item, "x" | "y" | "rotation"> & { fixture?: Fixture },
  workPlaneMm = 0,
): BeamFootprint | null {
  const fixture = item.fixture;
  if (!fixture) return null;
  if (!lightingKinds.includes(fixture.kind)) return null;
  if (fixture.beamAngle === null) return null;
  const drop = fixture.mountHeightMm - workPlaneMm;
  if (drop <= 0) return null;
  const radiusMm = drop * Math.tan((fixture.beamAngle * Math.PI) / 360);
  if (!(radiusMm > 0)) return null;
  if (!directional.includes(fixture.kind))
    return { shape: "circle", x: item.x, y: item.y, radiusMm };
  const half = fixture.beamAngle / 2;
  return {
    shape: "sector",
    x: item.x,
    y: item.y,
    radiusMm,
    fromDeg: item.rotation - half,
    toDeg: item.rotation + half,
  };
}

/**
 * De uiterste punten van een bundel, zodat "passend in beeld" en de bladomvang
 * hem meenemen. Voor een sector wordt het omhullende vierkant van de hele
 * cirkel genomen: dat is ruimer dan nodig, maar nooit te krap.
 */
export function beamBounds(footprint: BeamFootprint) {
  return {
    minX: footprint.x - footprint.radiusMm,
    minY: footprint.y - footprint.radiusMm,
    maxX: footprint.x + footprint.radiusMm,
    maxY: footprint.y + footprint.radiusMm,
  };
}
