import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelPreview } from "../../../packages/model-import/src/glb";
function Controls({ height }: { height: number }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, height / 2000, 0);
    const changed = () => invalidate();
    controls.addEventListener("change", changed);
    controls.update();
    return () => { controls.removeEventListener("change", changed); controls.dispose(); };
  }, [camera, gl, invalidate, height]);
  return null;
}
function RenderReady({ onReady }: { onReady: () => void }) {
  const ready = useRef(false);
  useFrame(({ gl, invalidate }) => {
    if (ready.current) return;
    if (gl.info.render.calls > 0) { ready.current = true; onReady(); }
    else invalidate();
  });
  return null;
}
function Mesh({ model }: { model: ModelPreview }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(model.positions, 3));
    result.computeVertexNormals();
    return result;
  }, [model]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial color="#b9aa92" side={DoubleSide} /></mesh>;
}
export default function GlbInspector({ organizationId, onSaved }: {
  organizationId: string;
  onSaved: (asset: { id: string; width: number; depth: number; height: number }) => void;
}) {
  const [model, setModel] = useState<ModelPreview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false), [filename, setFilename] = useState("");
  const [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false);
  const upload = useRef<{ file?: File; id?: string; controller?: AbortController }>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; upload.current.controller?.abort(); }; }, []);
  const save = async () => {
    if (!upload.current.file || !model || !confirmed || saving) return;
    setSaving(true); setError("");
    upload.current.id ??= crypto.randomUUID();
    upload.current.controller = new AbortController();
    try {
      const response = await fetch("/api/v1/model-assets/" + upload.current.id, {
        method: "POST", credentials: "same-origin", signal: upload.current.controller.signal,
        headers: { "Content-Type": "application/octet-stream", "x-organization-id": organizationId },
        body: upload.current.file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Model opslaan mislukt.");
      if (alive.current) onSaved(result);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Model opslaan mislukt."); }
    finally { if (alive.current) setSaving(false); }
  };
  const job = useRef<{ worker?: Worker; timer?: ReturnType<typeof setTimeout>; id: number }>({ id: 0 });
  const cancel = () => {
    job.current.worker?.terminate(); clearTimeout(job.current.timer);
    job.current = { id: job.current.id + 1 };
  };
  useEffect(() => cancel, []);
  const inspect = async (file?: File) => {
    cancel(); setModel(null); setError(""); setBusy(false); setReady(false); setFilename(file?.name ?? "");
    upload.current = { file }; setConfirmed(false);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Het GLB-bestand is groter dan 10 MiB."); return; }
    const id = job.current.id;
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      if (job.current.id !== id) return;
      const worker = new Worker(new URL("./glb.worker.ts", import.meta.url), { type: "module" });
      job.current.worker = worker;
      const finish = (message: string, result: ModelPreview | null = null) => {
        if (job.current.id !== id) return;
        cancel(); setError(message); setModel(result); setBusy(false);
      };
      worker.onmessage = (event: MessageEvent<{ model?: ModelPreview; error?: string }>) => finish(event.data.error ?? "", event.data.model ?? null);
      worker.onerror = () => finish("Modelcontrole kon niet worden uitgevoerd.");
      job.current.timer = setTimeout(() => finish("De modelcontrole duurde te lang. Kies een eenvoudiger bestand."), 15000);
      worker.postMessage(buffer, [buffer]);
    } catch { if (job.current.id === id) { cancel(); setError("Het bestand kon niet worden gelezen."); setBusy(false); } }
  };
  const distance = model ? Math.max(model.width, model.height, model.depth) / 1000 * 1.5 : 2;
  return <section aria-label="GLB-modelcontrole">
    <p className="small">Controleer een statisch GLB-model zonder textures, animaties of compressie, maximaal 10 MiB en 100.000 driehoeken. De preview blijft lokaal totdat je het model bewaart. Bij bewaren controleert de server het bestand opnieuw en bewaart alleen de geometrie.</p>
    <label>GLB-bestand<input type="file" disabled={saving} accept=".glb,model/gltf-binary" aria-label="GLB-bestand" onChange={event => { void inspect(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {filename && <p className="small">Geselecteerd: {filename}</p>}
    {busy && <p role="status">Model controleren…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {model && <>
      <p role="status">Model gecontroleerd · {model.triangles.toLocaleString("nl-NL")} driehoeken</p>
      <p>Breedte {model.width} mm · diepte {model.depth} mm · hoogte {model.height} mm</p>
      <p className="small">Berekend uit geometrie en transformaties in glTF-meters. Controleer deze maten met de leverancier. Neutrale kleur; originele materialen worden niet getoond. Sleep om te draaien.</p>
      <label><input type="checkbox" checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)} />Maten en oriëntatie gecontroleerd</label>
      <button type="button" disabled={!confirmed || saving} onClick={() => void save()}>{saving ? "Model wordt gecontroleerd en opgeslagen…" : "Model bewaren en meubel maken"}</button>
      <div data-render-ready={ready} aria-label="GLB 3D-preview" style={{ height: 280, background: "#e9e7df" }}>
        <Canvas key={model.positions.length + ":" + job.current.id} frameloop="demand" camera={{ fov: 40, position: [distance, distance, distance], near: Math.max(distance / 1000, 0.0001), far: distance * 20 }}>
          <ambientLight intensity={1.5} /><directionalLight position={[3, 5, 4]} intensity={3} />
          <Mesh model={model} /><Controls height={model.height} /><RenderReady onReady={() => setReady(true)} />
        </Canvas>
      </div>
    </>}
  </section>;
}
