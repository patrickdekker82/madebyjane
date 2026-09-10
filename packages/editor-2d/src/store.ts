import { create } from "zustand";
export type Tool =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "measure"
  | "note"
  | "calibrate"
  | "underlay";
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
  setTool: (tool) => set({ tool, selected: [] }),
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
