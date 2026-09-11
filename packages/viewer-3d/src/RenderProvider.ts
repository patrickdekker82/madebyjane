import type { Scene } from "../../contracts/src/index";
import type { ViewerView } from "../../contracts/src/viewer";

/** Boundary for a future, separately secured rendering service. */
export interface RenderProvider {
  readonly id: string;
  render(input: {
    scene: Scene;
    view: ViewerView;
    artifactType: "geometry-still";
    signal: AbortSignal;
  }): Promise<{
    bytes: Uint8Array;
    mediaType: "image/png" | "image/jpeg";
    sha256: string;
  }>;
}
