import type { Scene } from "../../contracts/src/index";
import type { MaterialDefinition } from "../../contracts/src/materials";
import { detectRooms, type Room } from "./rooms";

/**
 * Welke materiaalkeuze op welk vlak ligt.
 *
 * De koppeling loopt **niet** over de vrij ingetypte velden `room` en
 * `category` — die zijn van een mens en zeggen niets met zekerheid. Hij loopt
 * over `calculation`: dat is door de server berekend en noemt de variant, de
 * ruimte en de grondslag. `floor_area` is de vloer van die ruimte, `wall_area`
 * zijn de wanden eromheen. Alleen dat is een verband waar een beeld op mag
 * steunen.
 *
 * Wat hier níét gebeurt is kleur verzinnen. Een leverancierscode als "RAL 9010"
 * is niet betrouwbaar naar een schermkleur te rekenen, en een gegokte tint in
 * een klantbeeld is erger dan een neutraal vlak. Alleen een kleur die de
 * ontwerper zelf heeft vastgelegd wordt getoond; de rest blijft neutraal en
 * staat in `notes`.
 */
export type Finish = {
  /** De materiaalversie die dit vlak bepaalt. */
  versionId: string;
  name: string;
  color: string;
  status: "chosen" | "client_confirmed";
};

export type SurfaceFinishes = {
  /** Per ruimte-ID de vloerafwerking. */
  floors: Record<string, Finish>;
  /** Per muur-ID de wandafwerking. */
  walls: Record<string, Finish>;
  /**
   * Wat er niet is toegepast en waarom, in gewone taal en op alfabet, zodat
   * hetzelfde ontwerp altijd dezelfde regels geeft. Deze horen in beeld: een
   * neutraal vlak mag niet doorgaan voor "hier is niets gekozen".
   */
  notes: string[];
};

type Version = { id: string; definition: MaterialDefinition };

/** De muren die deze ruimte omsluiten, via de punten in doorloopvolgorde. */
function wallsOf(scene: Scene, room: Room): string[] {
  const randen = new Set<string>();
  for (const ids of [room.nodeIds, ...room.holeNodeIds])
    for (let i = 0; i < ids.length; i++)
      randen.add([ids[i]!, ids[(i + 1) % ids.length]!].sort().join(":"));
  return scene.walls
    .filter((wall) => randen.has([wall.startId, wall.endId].sort().join(":")))
    .map((wall) => wall.id);
}

export function surfaceFinishes(
  scene: Scene,
  materials: readonly Version[],
): SurfaceFinishes {
  const floors: Record<string, Finish> = {},
    walls: Record<string, Finish> = {},
    notes = new Set<string>();
  const rooms = detectRooms(scene).rooms;
  /** Onthoudt per muur welke ruimtes er een wandafwerking op leggen. */
  const wandclaims = new Map<string, Finish[]>();

  for (const version of materials) {
    const { definition } = version,
      bron = definition.calculation;
    if (!bron) continue;
    // Een keuze hoort bij de variant waarop hij is gemeten.
    if (bron.variantId !== scene.designVariantId) continue;
    if (bron.basis !== "floor_area" && bron.basis !== "wall_area") continue;
    /*
     * Alleen een gemaakte keuze verft een vlak. Een voorstel of een aangevraagd
     * monster is nog geen besluit, en een beeld dat dat verschil niet maakt
     * praat de klant een keuze aan die niemand genomen heeft.
     */
    if (
      definition.status !== "chosen" &&
      definition.status !== "client_confirmed"
    ) {
      notes.add(
        `"${definition.name}" is nog geen gemaakte keuze en wordt niet getoond.`,
      );
      continue;
    }
    const room = rooms.find((r) => r.id === bron.roomId);
    if (!room) {
      notes.add(
        `"${definition.name}" hoort bij een ruimte die in deze revisie niet meer te vinden is.`,
      );
      continue;
    }
    if (!definition.displayColor) {
      notes.add(
        `"${definition.name}" heeft geen weergavekleur; het vlak blijft neutraal.`,
      );
      continue;
    }
    const finish: Finish = {
      versionId: version.id,
      name: definition.name,
      color: definition.displayColor,
      status: definition.status,
    };
    if (bron.basis === "floor_area") {
      const eerder = floors[room.id];
      if (eerder && eerder.color !== finish.color) {
        notes.add(
          `Voor één vloer zijn twee kleuren gekozen ("${eerder.name}" en "${finish.name}"); die blijft neutraal.`,
        );
        delete floors[room.id];
        continue;
      }
      floors[room.id] = finish;
      continue;
    }
    for (const wallId of wallsOf(scene, room))
      wandclaims.set(wallId, [...(wandclaims.get(wallId) ?? []), finish]);
  }

  /*
   * Een muur kan twee ruimtes scheiden. Kiezen die allebei een andere wand,
   * dan is er geen goede kant om te tonen: de muur staat in 3D als één blok en
   * heeft geen voor- en achterkant met een eigen materiaal. Dan blijft hij
   * neutraal, en het beeld zegt waarom.
   */
  for (const [wallId, claims] of wandclaims) {
    const uniek = [...new Map(claims.map((c) => [c.color, c])).values()];
    if (uniek.length === 1) walls[wallId] = uniek[0]!;
    else
      notes.add(
        `Een muur scheidt twee ruimtes met verschillende wandafwerking (${uniek
          .map((c) => `"${c.name}"`)
          .sort()
          .join(" en ")}); die muur blijft neutraal.`,
      );
  }
  return { floors, walls, notes: [...notes].sort() };
}
