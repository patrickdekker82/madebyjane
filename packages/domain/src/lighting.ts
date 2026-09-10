import Decimal from "decimal.js";
import type { Item, LedPath } from "../../contracts/src/index";
import { lightingKinds } from "../../contracts/src/index";
import { ledTotals } from "./led";

/**
 * Overzicht van groepen en lichtscenes.
 *
 * Dit is een inventarisatie van wat er getekend is, geen installatieberekening.
 * Het opgetelde vermogen is de som van de vermogens die iemand zelf heeft
 * ingevuld; armaturen zonder opgave tellen niet mee en worden apart geteld,
 * zodat een totaal nooit volledig lijkt terwijl het dat niet is. Er wordt geen
 * groepsbelasting, geen zekeringmaat en geen lux uit afgeleid.
 *
 * Punten zonder groep of scene vallen onder een eigen kop in plaats van
 * stilzwijgend weg te vallen: juist die wil je zien voordat je een lichtplan
 * naar een installateur stuurt.
 */
export const UNASSIGNED = "Niet toegewezen";

export type LightingGroup = {
  name: string;
  /** Aantal punten in deze groep of scene. */
  count: number;
  /** Aantal daarvan met een opgegeven vermogen. */
  withPower: number;
  /** Som van de opgegeven vermogens, in watt. */
  powerW: string;
  /** Aantal met een opgegeven lichtstroom, en de som daarvan. */
  withLumen: number;
  lumen: number;
  ids: string[];
};

function group(
  items: readonly Item[],
  key: (item: Item) => string,
): LightingGroup[] {
  const byName = new Map<string, Item[]>();
  for (const item of items) {
    const name = key(item).trim() || UNASSIGNED;
    byName.set(name, [...(byName.get(name) ?? []), item]);
  }
  return [...byName]
    .map(([name, members]) => {
      let power = new Decimal(0),
        withPower = 0,
        lumen = 0,
        withLumen = 0;
      for (const member of members) {
        const f = member.fixture!;
        if (f.milliwatt !== null) {
          power = power.plus(new Decimal(f.milliwatt).div(1000));
          withPower++;
        }
        if (f.lumen !== null) {
          lumen += f.lumen;
          withLumen++;
        }
      }
      return {
        name,
        count: members.length,
        withPower,
        powerW: power.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3),
        withLumen,
        lumen,
        ids: members.map((m) => m.id),
      };
    })
    .sort((a, b) =>
      // "Niet toegewezen" staat onderaan; de rest op naam.
      a.name === UNASSIGNED
        ? 1
        : b.name === UNASSIGNED
          ? -1
          : a.name.localeCompare(b.name, "nl-NL"),
    );
}

/** Elektragroepen: alle punten, dus ook wandcontactdozen en schakelaars. */
export function circuits(items: readonly Item[]): LightingGroup[] {
  return group(
    items.filter((i) => i.fixture),
    (i) => i.fixture!.circuit,
  );
}

/** Lichtscenes: alleen armaturen die licht geven. */
export function lightScenes(items: readonly Item[]): LightingGroup[] {
  return group(
    items.filter((i) => i.fixture && lightingKinds.includes(i.fixture.kind)),
    (i) => i.fixture!.scene,
  );
}

/**
 * Wat er in het hele ontwerp aan licht hangt. LED-strips staan apart van de
 * armaturen: hun vermogen komt uit lengte maal vermogen per meter en is dus
 * van een andere orde dan een opgegeven armatuurvermogen.
 */
export function lightingTotals(
  items: readonly Item[],
  ledPaths: readonly LedPath[],
) {
  const fixtures = items.filter(
    (i) => i.fixture && lightingKinds.includes(i.fixture.kind),
  );
  let power = new Decimal(0),
    withPower = 0;
  for (const item of fixtures)
    if (item.fixture!.milliwatt !== null) {
      power = power.plus(new Decimal(item.fixture!.milliwatt).div(1000));
      withPower++;
    }
  return {
    fixtures: fixtures.length,
    withPower,
    fixturePowerW: power.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3),
    led: ledTotals(ledPaths),
  };
}
