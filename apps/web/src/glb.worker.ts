import { inspectGlb } from "../../../packages/model-import/src/glb";
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const model = inspectGlb(event.data);
    self.postMessage({ model }, { transfer: [model.positions.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Modelcontrole mislukt." });
  }
};
