import { create } from "zustand";
export type Tool =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "measure"
  | "note"
  | "calibrate"
  | "underlay"
  | "led";
export const useEditor = create<{
  hasPending: boolean;
  setPending: (value: boolean) => void;
  /** Staat het onbevestigde werk ook als klad op dit apparaat? */
  localDraft: boolean;
  setLocalDraft: (value: boolean) => void;
  tool: Tool;
  /** Meerdere objecten tegelijk; bij een enkele selectie is dit een lijst van een. */
  selected: string[];
  zoom: number;
  grid: boolean;
  /** Vangen aan muurpunten, muren en meubels; staat los van het raster. */
  objectSnap: boolean;
  /**
   * Hoekpunten van de LED-strip die op dit moment getekend wordt. Staat hier en
   * niet in het canvas, zodat het paneel ernaast kan tonen hoeveel punten er
   * liggen en de strip kan afronden of weggooien.
   */
  ledDraft: { x: number; y: number }[];
  setLedDraft: (points: { x: number; y: number }[]) => void;
  /** Lichtbundels tonen; een visuele benadering, geen lichtberekening. */
  beams: boolean;
  toggleBeams: () => void;
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  /** Voegt toe of haalt weg, voor shift- of ctrl-klikken. */
  toggleSelected: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleObjectSnap: () => void;
}>((set) => ({
  hasPending: false,
  setPending: (hasPending) => set({ hasPending }),
  localDraft: false,
  setLocalDraft: (localDraft) => set({ localDraft }),
  tool: "select",
  selected: [],
  zoom: 0.09,
  grid: true,
  objectSnap: true,
  ledDraft: [],
  setLedDraft: (ledDraft) => set({ ledDraft }),
  beams: false,
  toggleBeams: () => set((s) => ({ beams: !s.beams })),
  setTool: (tool) => set({ tool, selected: [], ledDraft: [] }),
  select: (id) => set({ selected: id ? [id] : [] }),
  toggleSelected: (id) =>
    set((s) => ({
      selected: s.selected.includes(id)
        ? s.selected.filter((x) => x !== id)
        : [...s.selected, id],
    })),
  selectMany: (selected) => set({ selected }),
  setZoom: (zoom) => set({ zoom: Math.max(0.025, Math.min(0.3, zoom)) }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  toggleObjectSnap: () => set((s) => ({ objectSnap: !s.objectSnap })),
}));
