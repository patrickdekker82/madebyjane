import { parentPort, workerData } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";
try {
  const { inspectGlb } = await tsImport("./glb.ts", import.meta.url);
  const model = inspectGlb(workerData);
  parentPort.postMessage({ model }, [model.positions.buffer]);
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Modelcontrole mislukt." });
}
