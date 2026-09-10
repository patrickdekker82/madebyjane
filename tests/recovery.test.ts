import { test, expect } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  draftKey,
  draftVerdict,
  indexedDbDrafts,
  saveState,
  saveStateLabel,
  warnsOnLeaving,
  type Draft,
} from "../packages/editor-2d/src/recovery";
import { demoScene } from "../packages/test-fixtures/src/index";

const scene = demoScene(
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
);
const now = Date.UTC(2026, 0, 20, 12, 0, 0);
const draft = (over: Partial<Draft> = {}): Draft => ({
  savedAt: now - 60_000,
  baseRevision: scene.revision,
  commandId: "55555555-5555-4555-8555-555555555555",
  leaseId: "66666666-6666-4666-8666-666666666666",
  operations: [{ type: "DeleteSelection", ids: [] }],
  scene,
  ...over,
});

test("een klad hoort bij één gebruiker, werkruimte en ontwerp", () => {
  expect(draftKey("u", "o", "v")).toBe("u:o:v");
  // Dezelfde variant onder een andere gebruiker is een ander klad.
  expect(draftKey("u", "o", "v")).not.toBe(draftKey("u2", "o", "v"));
});

test("een klad op de huidige revisie is opnieuw te versturen", () => {
  expect(draftVerdict(draft(), scene.revision, now)).toBe("herstelbaar");
});

test("een verschoven serverrevisie is een conflict, geen herstel", () => {
  expect(draftVerdict(draft(), scene.revision + 1, now)).toBe("conflict");
  // Ook een teruggedraaide server is niet zomaar over te sturen.
  expect(
    draftVerdict(
      draft({ baseRevision: 9, scene: { ...scene, revision: 9 } }),
      4,
      now,
    ),
  ).toBe("conflict");
});

test("er valt niets te herstellen zonder klad", () => {
  expect(draftVerdict(null, scene.revision, now)).toBe("geen");
});

test("een oud klad wordt niet meer aangeboden", () => {
  expect(
    draftVerdict(
      draft({ savedAt: now - DRAFT_MAX_AGE_MS - 1 }),
      scene.revision,
      now,
    ),
  ).toBe("verlopen");
  expect(
    draftVerdict(
      draft({ savedAt: now - DRAFT_MAX_AGE_MS + 1 }),
      scene.revision,
      now,
    ),
  ).toBe("herstelbaar");
});

test("een klad dat zichzelf tegenspreekt wordt niet gebruikt", () => {
  // Het document mag hooguit één revisie voorbij de basis staan: dat is precies
  // het resultaat van de ene opdracht die nog niet is opgeslagen.
  expect(
    draftVerdict(
      draft({ scene: { ...scene, revision: scene.revision + 3 } }),
      scene.revision,
      now,
    ),
  ).toBe("onbruikbaar");
  expect(
    draftVerdict(
      draft({ scene: { ...scene, revision: scene.revision - 1 } }),
      scene.revision,
      now,
    ),
  ).toBe("onbruikbaar");
});

test("het lokaal toegepaste resultaat telt als geldig klad", () => {
  // De editor past de opdracht meteen toe, dus het bewaarde document staat één
  // revisie verder dan de basis waarop de opdracht is gebouwd.
  expect(
    draftVerdict(
      draft({ scene: { ...scene, revision: scene.revision + 1 } }),
      scene.revision,
      now,
    ),
  ).toBe("herstelbaar");
});

test("de opslagtoestand is altijd precies één van de gemelde toestanden", () => {
  const base = {
    canWrite: true,
    syncing: false,
    pending: false,
    conflict: false,
    storedLocally: false,
  };
  expect(saveState(base)).toBe("server-opgeslagen");
  expect(saveState({ ...base, canWrite: false })).toBe("leesmodus");
  expect(saveState({ ...base, syncing: true })).toBe("synchroniseren");
  expect(saveState({ ...base, pending: true })).toBe("in-dit-venster");
  expect(saveState({ ...base, pending: true, storedLocally: true })).toBe(
    "lokaal-bewaard",
  );
  // Een conflict overstemt de rest: dat moet de gebruiker als eerste zien.
  expect(
    saveState({ ...base, conflict: true, syncing: true, pending: true }),
  ).toBe("conflict");
});

test("lezen gaat voor op opslaan: leesmodus wint nooit van openstaand werk", () => {
  expect(
    saveState({
      canWrite: false,
      syncing: false,
      pending: true,
      conflict: false,
      storedLocally: true,
    }),
  ).toBe("lokaal-bewaard");
});

test("alleen onbewaard werk waarschuwt bij weggaan", () => {
  expect(warnsOnLeaving("in-dit-venster")).toBe(true);
  expect(warnsOnLeaving("conflict")).toBe(true);
  // Lokaal bewaard werk staat na herladen weer klaar, dus geen waarschuwing.
  expect(warnsOnLeaving("lokaal-bewaard")).toBe(false);
  expect(warnsOnLeaving("server-opgeslagen")).toBe(false);
});

test("geen enkele toestand heet een back-up", () => {
  for (const label of Object.values(saveStateLabel))
    expect(label.toLowerCase()).not.toContain("back-up");
});

test("zonder IndexedDB wordt geen lokale opslag voorgewend", () => {
  // Node heeft geen IndexedDB; de editor hoort dat te melden in plaats van
  // te doen alsof er iets bewaard is.
  expect(typeof indexedDB).toBe("undefined");
  expect(indexedDbDrafts()).toBeNull();
});
