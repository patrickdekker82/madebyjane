/**
 * Opt-in lokaal herstel.
 *
 * Dit is geen back-up en het wordt nergens zo genoemd. Het is één klad per
 * gebruiker, werkruimte en ontwerp, opgeslagen in de browser van dit apparaat,
 * met precies één doel: werk terugvinden nadat het opslaan op de server is
 * mislukt en het venster daarna is herladen of gesloten. De server blijft de
 * enige bewaarplaats van het ontwerp. Wat hier staat is alleen leesbaar in dit
 * browserprofiel, op dit apparaat, en verdwijnt zodra de opdracht alsnog is
 * opgeslagen, de gebruiker het klad weggooit, of zich afmeldt.
 *
 * Er wordt niet beweerd dat je hiermee offline kunt doorwerken: zolang een
 * opdracht niet door de server is bevestigd, neemt de editor geen nieuwe
 * opdrachten aan. Er staat dus hooguit één onbevestigde opdracht in het klad.
 */
import type { Operation, Scene } from "../../contracts/src/index";

/** Een klad hoort bij precies één gebruiker, werkruimte en ontwerpvariant. */
export function draftKey(
  userId: string,
  organizationId: string,
  variantId: string,
) {
  return `${userId}:${organizationId}:${variantId}`;
}

export type Draft = {
  /** Wanneer dit klad is weggeschreven, om aan de gebruiker te tonen. */
  savedAt: number;
  /**
   * De naam van de ontwerpvariant op het moment van bewaren, zodat bij het
   * afmelden te zien is over welk ontwerp het gaat. Ontbreekt in kladden van
   * eerdere versies en bij een nog niet geladen naam.
   */
  label?: string;
  /** De serverrevisie waarop dit lokale werk voortbouwt. */
  baseRevision: number;
  commandId: string;
  leaseId: string;
  operations: Operation[];
  /** Het volledige document zoals dit venster het zag, inclusief de opdracht. */
  scene: Scene;
};

/**
 * Een klad dat lang blijft liggen is eerder verwarrend dan behulpzaam: de kans
 * dat het nog op de huidige serverrevisie past is dan vrijwel nul.
 */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftVerdict =
  "geen" | "verlopen" | "herstelbaar" | "conflict" | "onbruikbaar";

/**
 * Bepaalt wat er met een aangetroffen klad kan gebeuren zodra het ontwerp van
 * de server is geladen. Alleen wanneer het klad exact op de huidige revisie
 * voortbouwt kan de opdracht opnieuw worden verstuurd; in elk ander geval is er
 * intussen iets veranderd en mag de gebruiker alleen exporteren of weggooien.
 */
export function draftVerdict(
  draft: Draft | null,
  serverRevision: number,
  now: number,
): DraftVerdict {
  if (!draft) return "geen";
  if (now - draft.savedAt > DRAFT_MAX_AGE_MS) return "verlopen";
  /**
   * Het bewaarde document is het resultaat van de opdracht en staat dus één
   * revisie voorbij de basis. Twee opdrachten worden pas op de server uitgewerkt
   * (een revisie terugzetten en een bibliotheekstuk plaatsen); daar staat het
   * document nog op de basisrevisie. Alles daarbuiten komt niet uit deze editor.
   */
  const step = draft.scene.revision - draft.baseRevision;
  if (step !== 0 && step !== 1) return "onbruikbaar";
  if (draft.baseRevision === serverRevision) return "herstelbaar";
  return "conflict";
}

export type SaveState =
  | "leesmodus"
  | "synchroniseren"
  | "lokaal-bewaard"
  | "in-dit-venster"
  | "server-opgeslagen"
  | "conflict";

/**
 * Vertaalt de toestand van de editor naar precies één opslagtoestand. Het
 * verschil tussen "alleen in dit venster" en "lokaal bewaard" is wezenlijk: het
 * eerste overleeft geen herlaadbeurt, het tweede wel.
 */
export function saveState(input: {
  canWrite: boolean;
  syncing: boolean;
  pending: boolean;
  conflict: boolean;
  storedLocally: boolean;
}): SaveState {
  if (input.conflict) return "conflict";
  if (input.syncing) return "synchroniseren";
  if (input.pending)
    return input.storedLocally ? "lokaal-bewaard" : "in-dit-venster";
  if (!input.canWrite) return "leesmodus";
  return "server-opgeslagen";
}

export const saveStateLabel: Record<SaveState, string> = {
  leesmodus: "Leesmodus",
  synchroniseren: "Synchroniseren…",
  "lokaal-bewaard": "Lokaal bewaard op dit apparaat · nog niet op de server",
  "in-dit-venster": "Niet opgeslagen · alleen in dit venster",
  "server-opgeslagen": "Server opgeslagen",
  conflict: "Conflict · de server heeft een nieuwere versie",
};

/** De toestanden waarin werk verloren gaat als het venster nu sluit. */
export function warnsOnLeaving(state: SaveState) {
  return state === "in-dit-venster" || state === "conflict";
}

const OPT_IN_PREFIX = "studio.lokaal-herstel:";

/**
 * De keuze staat per gebruiker in localStorage en niet op de server: het gaat
 * over dit apparaat, en op een gedeelde computer hoort die keuze niet mee te
 * reizen.
 */
export function recoveryEnabled(userId: string) {
  try {
    return localStorage.getItem(OPT_IN_PREFIX + userId) === "aan";
  } catch {
    return false;
  }
}

export function setRecoveryEnabled(userId: string, on: boolean) {
  try {
    if (on) localStorage.setItem(OPT_IN_PREFIX + userId, "aan");
    else localStorage.removeItem(OPT_IN_PREFIX + userId);
  } catch {
    // Zonder localStorage blijft de keuze uit; de editor meldt dat zelf.
  }
}

export type DraftStore = {
  read(key: string): Promise<Draft | null>;
  write(key: string, draft: Draft): Promise<void>;
  clear(key: string): Promise<void>;
  /** Alle kladden van dit browserprofiel, voor het afmelden. */
  keys(): Promise<string[]>;
  clearAll(): Promise<void>;
};

const DB_NAME = "studio-herstel";
const STORE = "kladversies";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Lokale opslag weigert te openen."));
    request.onblocked = () =>
      reject(new Error("Een ander venster houdt de lokale opslag bezet."));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = body(transaction.objectStore(STORE));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onabort = transaction.onerror = () => {
          db.close();
          reject(
            transaction.error ??
              new Error("Lokaal opslaan is door de browser geweigerd."),
          );
        };
      }),
  );
}

/**
 * Geeft null wanneer de browser geen IndexedDB heeft. De editor meldt dat dan
 * aan de gebruiker in plaats van te doen alsof er lokaal iets bewaard wordt.
 */
export function indexedDbDrafts(): DraftStore | null {
  if (typeof indexedDB === "undefined") return null;
  return {
    read: (key) =>
      run<Draft | undefined>("readonly", (s) => s.get(key)).then(
        (value) => value ?? null,
      ),
    write: (key, draft) =>
      run("readwrite", (s) => s.put(draft, key)).then(() => undefined),
    clear: (key) =>
      run("readwrite", (s) => s.delete(key)).then(() => undefined),
    keys: () =>
      run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((keys) =>
        keys.map(String),
      ),
    clearAll: () => run("readwrite", (s) => s.clear()).then(() => undefined),
  };
}
