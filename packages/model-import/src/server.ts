import { Worker } from "node:worker_threads";
import type { ModelPreview } from "./glb";
import { DomainError } from "../../domain/src/index";
let running = 0;
export async function inspectGlbOnServer(bytes: Uint8Array): Promise<ModelPreview> {
  if (running >= 2) throw new DomainError("MODEL_BUSY", "Er worden al modellen gecontroleerd. Probeer het zo opnieuw.", 503);
  running++;
  try {
    return await new Promise<ModelPreview>((resolve, reject) => {
      const data = Uint8Array.from(bytes).buffer;
      const worker = new Worker(new URL("./server-worker.mjs", import.meta.url), {
        workerData: data, transferList: [data], execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
      let finished = false;
      const finish = (error?: Error, model?: ModelPreview) => {
        if (finished) return;
        finished = true; clearTimeout(timer); void worker.terminate();
        if (error) reject(error); else resolve(model!);
      };
      const timer = setTimeout(() => finish(new DomainError("MODEL_TIMEOUT", "Modelcontrole duurde te lang.", 422)), 15000);
      worker.once("message", (result: { model?: ModelPreview; error?: string }) => {
        if (result.error || !result.model) finish(new DomainError("INVALID_MODEL", result.error ?? "Ongeldig model.", 422));
        else finish(undefined, result.model);
      });
      worker.once("error", () => finish(new DomainError("INVALID_MODEL", "Modelcontrole kon niet worden afgerond.", 422)));
      worker.once("exit", () => { if (!finished) finish(new DomainError("INVALID_MODEL", "Modelcontrole is afgebroken.", 422)); });
    });
  } finally { running--; }
}
