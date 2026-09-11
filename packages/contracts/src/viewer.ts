import { z } from "zod";
import { id } from "./index";

const vector3 = z.tuple([
  z.number().finite().min(-1000).max(1000),
  z.number().finite().min(-1000).max(1000),
  z.number().finite().min(-1000).max(1000),
]);
export const viewerViewSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    baseRevision: z.number().int().nonnegative(),
    camera: z
      .object({
        projection: z.enum(["perspective", "orthographic"]),
        mode: z.enum(["orbit", "walk"]),
        position: vector3,
        target: vector3,
        fov: z.number().finite().min(20).max(90),
        zoom: z.number().finite().min(0.1).max(500),
      })
      .strict(),
    settings: z
      .object({
        atmosphere: z.enum(["day", "evening"]),
        quality: z.enum(["low", "medium", "high"]),
        walls: z.enum(["all", "cutaway", "hidden"]),
        ceiling: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ViewerViewInput = z.infer<typeof viewerViewSchema>;
export type ViewerView = Omit<ViewerViewInput, "baseRevision"> & {
  revision: number;
  created_at: string;
  user_id: string;
};
