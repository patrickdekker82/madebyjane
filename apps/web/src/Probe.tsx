import { lazy, Suspense, useState } from "react";
import { PlanCanvas } from "../../../packages/editor-2d/src/Canvas";
import {
  demoScene,
  performanceScene,
} from "../../../packages/test-fixtures/src/index";
import { applyOperations, type Role } from "../../../packages/domain/src/index";
import type { Scene, Operation } from "../../../packages/contracts/src/index";
import { useEditor } from "../../../packages/editor-2d/src/store";
const Viewer = lazy(() => import("../../../packages/viewer-3d/src/Viewer"));
export function Probe() {
  const [scene, setScene] = useState(() =>
      new URLSearchParams(location.search).has("belasting")
        ? performanceScene()
        : demoScene(
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
          ),
    ),
    [history, setHistory] = useState<Scene[]>([]),
    [view, setView] = useState(false),
    [error, setError] = useState("");
  const { setTool, selected, select } = useEditor();
  const commit = (ops: Operation[]) => {
    try {
      const next = applyOperations(scene, ops);
      setHistory((h) => [...h, scene]);
      setScene(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const item = scene.items.find((i) => selected.includes(i.id));
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">s.</span>studio.
        </span>
        <span className="workspace">Fase 0 · geometrieproef</span>
        <span className="stage-badge">
          FICTIEVE DATA · ALLEEN IN DIT VENSTER
        </span>
      </header>
      <main className="editor">
        <div className="editor-heading">
          <div>
            <div className="breadcrumb">
              Woonkamer aan het park / proefmodel
            </div>
            <h1>Eén ruimte, twee perspectieven.</h1>
          </div>
          <div className="view-switch">
            <button
              className={!view ? "active" : ""}
              onClick={() => setView(false)}
            >
              Plattegrond
            </button>
            <button
              className={view ? "active" : ""}
              onClick={() => setView(true)}
            >
              3D bekijken
            </button>
          </div>
        </div>
        <div className="tools">
          <button onClick={() => setTool("select")}>Selecteren</button>
          <button onClick={() => setTool("wall")}>Muur tekenen</button>
          <button onClick={() => setTool("door")}>Deur plaatsen</button>
          <button onClick={() => setTool("window")}>Raam plaatsen</button>
          <button
            disabled={!history.length}
            onClick={() => {
              setScene(history.at(-1)!);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            Ongedaan maken
          </button>
        </div>
        {error && (
          <div role="alert" className="editor-message error">
            {error}
          </div>
        )}
        <div className="editor-body">
          <aside className="library">
            <div className="panel-heading">
              <h2>Begane grond</h2>
            </div>
            <span className="eyebrow">OBJECTEN</span>
            <div className="object-list">
              {scene.items.map((i) => (
                <button
                  key={i.id}
                  onClick={() => select(i.id)}
                  className={selected.includes(i.id) ? "selected" : ""}
                >
                  <span className="color-dot" style={{ background: i.color }} />
                  {i.name}
                </button>
              ))}
            </div>
            <p className="small">
              Schuine muur, raam, deur en meubels zijn afgeleid uit één model in
              millimeters.
            </p>
          </aside>
          <section className="drawing">
            {view ? (
              <Suspense fallback={<div>3D laden…</div>}>
                <Viewer scene={scene} />
              </Suspense>
            ) : (
              <PlanCanvas scene={scene} disabled={false} onCommand={commit} />
            )}
          </section>
          <aside className="properties">
            <div className="panel-heading">
              <h2>Eigenschappen</h2>
            </div>
            {item ? (
              <>
                <h3>{item.name}</h3>
                <p className="small">
                  {item.width.toLocaleString("nl-NL")} ×{" "}
                  {item.depth.toLocaleString("nl-NL")} mm
                  <br />
                  Rotatie: {item.rotation}°
                </p>
                <button
                  onClick={() =>
                    commit([
                      {
                        type: "TransformItem",
                        id: item.id,
                        x: item.x,
                        y: item.y,
                        width: item.width,
                        depth: item.depth,
                        rotation: (item.rotation + 90) % 360,
                        custom: item.custom,
                      },
                    ])
                  }
                >
                  90° draaien
                </button>
              </>
            ) : (
              <div className="property-empty">
                <h3>Elk detail telt.</h3>
                <p>Selecteer een meubel of sleep het in de plattegrond.</p>
              </div>
            )}
            <div className="property-tip">
              <span className="eyebrow">AFZONDERLIJKE PROEF</span>
              <p>
                Wijzigingen verdwijnen bij herladen. Dit scherm test geometrie
                en bediening. De beveiligde projectapp op de startpagina
                gebruikt PostgreSQL.
              </p>
            </div>
          </aside>
        </div>
        <footer className="statusbar">
          <span>Proef · niet opgeslagen</span>
          <span>Millimeters · revisie {scene.revision}</span>
        </footer>
      </main>
    </div>
  );
}
