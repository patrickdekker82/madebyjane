import { create } from "zustand";
export type Tool = "select" | "wall" | "door" | "window";
export const useEditor = create<{
  hasPending: boolean;
  setPending: (value: boolean) => void;
  tool: Tool;
  selected: string | null;
  zoom: number;
  grid: boolean;
  /** Vangen aan muurpunten, muren en meubels; staat los van het raster. */
  objectSnap: boolean;
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleObjectSnap: () => void;
}>((set) => ({
  hasPending: false,
  setPending: (hasPending) => set({ hasPending }),
  tool: "select",
  selected: null,
  zoom: 0.09,
  grid: true,
  objectSnap: true,
  setTool: (tool) => set({ tool, selected: null }),
  select: (selected) => set({ selected }),
  setZoom: (zoom) => set({ zoom: Math.max(0.025, Math.min(0.3, zoom)) }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  toggleObjectSnap: () => set((s) => ({ objectSnap: !s.objectSnap })),
}));
