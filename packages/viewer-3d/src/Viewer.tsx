import { ModelItems } from "./ModelItems";
import { VIEWER_BUDGETS } from "./budgets";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Path,
  Shape,
  Vector2,
  Vector3,
  type Camera,
  type Scene as ThreeScene,
  type WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Scene } from "../../contracts/src/index";
import type { ViewerView } from "../../contracts/src/viewer";
import {
  detectRooms,
  endpoints,
  toThree,
  wallSegmentPrism,
  wallSegments,
  wallOutlines,
} from "../../geometry/src/index";

type Projection = "perspective" | "orthographic";
type Mode = "orbit" | "walk";
type Settings = {
  atmosphere: "day" | "evening";
  quality: "low" | "medium" | "high";
  walls: "all" | "cutaway" | "hidden";
  ceiling: boolean;
};
type CameraState = {
  projection: Projection;
  mode: Mode;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  zoom: number;
};
const initial: CameraState = {
  projection: "perspective",
  mode: "orbit",
  position: [9, 9, 10],
  target: [3, 0, 2],
  fov: 45,
  zoom: 1,
};

function Controls({
  state,
  apply,
  onChange,
}: {
  state: CameraState;
  apply: number;
  onChange: (s: CameraState, c: Camera, g: WebGLRenderer) => void;
}) {
  const { camera, gl, invalidate } = useThree(),
    control = useRef<OrbitControls | undefined>(undefined),
    keys = useRef(new Set<string>());
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    control.current = c;
    camera.position.fromArray(state.position);
    c.target.fromArray(state.target);
    if ("fov" in camera) camera.fov = state.fov;
    camera.zoom = state.projection === "orthographic" ? state.zoom : 1;
    camera.updateProjectionMatrix();
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = state.mode === "orbit";
    c.maxPolarAngle = state.mode === "walk" ? Math.PI * 0.6 : Math.PI / 2.02;
    c.minDistance = state.mode === "walk" ? 0.2 : 0.8;
    c.maxDistance = 40;
    const changed = () => {
      invalidate();
      onChange(
        {
          ...state,
          position: camera.position.toArray() as CameraState["position"],
          target: c.target.toArray() as CameraState["target"],
          fov: "fov" in camera ? camera.fov : state.fov,
          zoom: camera.zoom,
        },
        camera,
        gl,
      );
    };
    c.addEventListener("change", changed);
    c.update();
    changed();
    return () => {
      c.removeEventListener("change", changed);
      c.dispose();
    };
  }, [camera, gl, invalidate, state.projection, state.mode, apply, onChange]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase()),
      up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, []);
  useFrame((_, delta) => {
    const c = control.current;
    if (!c) return;
    if (state.mode === "walk") {
      const f = new Vector3();
      camera.getWorldDirection(f);
      f.y = 0;
      f.normalize();
      const right = new Vector3().crossVectors(f, camera.up).normalize(),
        m = new Vector3();
      if (keys.current.has("w")) m.add(f);
      if (keys.current.has("s")) m.sub(f);
      if (keys.current.has("a")) m.sub(right);
      if (keys.current.has("d")) m.add(right);
      if (m.lengthSq()) {
        m.normalize().multiplyScalar(Math.min(delta, 0.05) * 2.2);
        camera.position.add(m);
        c.target.add(m);
        camera.position.y = 1.65;
        c.target.y = 1.55;
        onChange(
          {
            ...state,
            position: camera.position.toArray() as CameraState["position"],
            target: c.target.toArray() as CameraState["target"],
          },
          camera,
          gl,
        );
        invalidate();
      }
    }
    if (c.update()) invalidate();
  });
  return null;
}
type RenderMetrics = { drawCalls: number; triangles: number };

function Ready({ done }: { done: (metrics: RenderMetrics) => void }) {
  const ready = useRef(false);
  useFrame(({ gl, invalidate }) => {
    if (
      !ready.current &&
      (gl.info.render.calls > 0
        ? ((ready.current = true),
          done({
            drawCalls: gl.info.render.calls,
            triangles: gl.info.render.triangles,
          }))
        : invalidate())
    )
      return;
  });
  return null;
}
function Openings({ scene }: { scene: Scene }) {
  return (
    <>
      {scene.openings.map((o) => {
        const w = scene.walls.find((x) => x.id === o.wallId);
        if (!w) return null;
        const { a, angle } = endpoints(scene, w),
          center = o.offset + o.width / 2,
          pos = toThree(
            a.x + Math.cos(angle) * center,
            a.y + Math.sin(angle) * center,
            o.sillHeight + o.height / 2,
          ),
          thick = Math.max(0.04, w.thickness / 1000 + 0.018);
        return (
          <group key={o.id} position={pos} rotation={[0, -angle, 0]}>
            {o.kind === "window" ? (
              <>
                <mesh>
                  <boxGeometry
                    args={[o.width / 1000, o.height / 1000, 0.018]}
                  />
                  <meshPhysicalMaterial
                    color="#b8d7df"
                    transparent
                    opacity={0.28}
                    roughness={0.12}
                    transmission={0.3}
                  />
                </mesh>
                {[-1, 1].map((n) => (
                  <mesh key={"v" + n} position={[(n * o.width) / 2000, 0, 0]}>
                    <boxGeometry
                      args={[0.045, o.height / 1000 + 0.09, thick]}
                    />
                    <meshStandardMaterial color="#e8e4d9" />
                  </mesh>
                ))}
                {[-1, 1].map((n) => (
                  <mesh key={"h" + n} position={[0, (n * o.height) / 2000, 0]}>
                    <boxGeometry args={[o.width / 1000, 0.045, thick]} />
                    <meshStandardMaterial color="#e8e4d9" />
                  </mesh>
                ))}
              </>
            ) : (
              <>
                <mesh position={[-o.width / 2000, 0, 0]}>
                  <boxGeometry args={[0.055, o.height / 1000, thick]} />
                  <meshStandardMaterial color="#8a6848" />
                </mesh>
                <mesh position={[0, o.height / 2000, 0]}>
                  <boxGeometry args={[o.width / 1000, 0.055, thick]} />
                  <meshStandardMaterial color="#8a6848" />
                </mesh>
                <mesh
                  position={[
                    -o.width / 2000,
                    0,
                    o.swing === "left" ? 0.02 : -0.02,
                  ]}
                  rotation={[
                    0,
                    o.swing === "left" ? -Math.PI / 2.5 : Math.PI / 2.5,
                    0,
                  ]}
                >
                  <boxGeometry
                    args={[o.width / 1000, o.height / 1000, 0.035]}
                  />
                  <meshStandardMaterial color="#a9825d" roughness={0.75} />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </>
  );
}

export default function Viewer({
  scene,
  organizationId = scene.organizationId,
  variantId = scene.designVariantId,
  selected = [],
  disabled = true,
  onSelect = () => {},
  onMove = () => {},
}: {
  scene: Scene;
  organizationId?: string;
  variantId?: string;
  selected?: string[];
  disabled?: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}) {
  const [ready, setReady] = useState(false),
    [metrics, setMetrics] = useState<RenderMetrics | null>(null),
    [status, setStatus] = useState(""),
    [message, setMessage] = useState(""),
    [camera, setCamera] = useState(initial),
    [apply, setApply] = useState(0);
  const [settings, setSettings] = useState<Settings>({
      atmosphere: "day",
      quality: "medium",
      walls: "all",
      ceiling: false,
    }),
    [views, setViews] = useState<ViewerView[]>([]),
    [selectedView, setSelectedView] = useState("");
  const renderer = useRef<WebGLRenderer | undefined>(undefined),
    renderScene = useRef<ThreeScene | undefined>(undefined),
    activeCamera = useRef<Camera | undefined>(undefined),
    cameraState = useRef(camera);
  const onCamera = useCallback(
    (s: CameraState, c: Camera, g: WebGLRenderer) => {
      cameraState.current = s;
      activeCamera.current = c;
      renderer.current = g;
    },
    [],
  );
  const modelStatus = useCallback((s: string) => setStatus(s), []);
  const request = async <T,>(path: string, body?: unknown): Promise<T> => {
    const r = await fetch("/api/v1" + path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        "x-organization-id": organizationId,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message ?? "3D-instelling kon niet worden bewaard.");
    }
    return r.json();
  };
  const load = async () =>
    setViews(
      (
        await request<{ items: ViewerView[] }>(
          `/variants/${variantId}/viewer-views`,
        )
      ).items,
    );
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [variantId]);
  useEffect(() => {
    const move = (e: KeyboardEvent) => {
      if (
        disabled ||
        camera.mode === "walk" ||
        !selected.length ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        return;
      const item = scene.items.find((i) => i.id === selected[0]);
      if (!item) return;
      e.preventDefault();
      const n = e.shiftKey ? 10 : 100;
      onMove(
        item.id,
        item.x + (e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0),
        item.y + (e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0),
      );
    };
    addEventListener("keydown", move);
    return () => removeEventListener("keydown", move);
  }, [camera.mode, disabled, onMove, scene.items, selected]);
  const floors = useMemo(
    () =>
      detectRooms(scene).rooms.map((room) => {
        const shape = new Shape(
          room.contour.map((p) => new Vector2(p.x / 1000, -p.y / 1000)),
        );
        for (const hole of room.holes) {
          const path = new Path();
          hole.forEach((p, i) =>
            i
              ? path.lineTo(p.x / 1000, -p.y / 1000)
              : path.moveTo(p.x / 1000, -p.y / 1000),
          );
          path.closePath();
          shape.holes.push(path);
        }
        return { id: room.id, shape };
      }),
    [scene.nodes, scene.walls],
  );
  const wallPieces = useMemo(() => {
    const outlines = new Map(
      wallOutlines(scene).map((outline) => [outline.wallId, outline]),
    );
    return scene.walls.flatMap((wall, wallIndex) =>
      wallSegments(scene, wall).map((segment, segmentIndex) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new BufferAttribute(
            wallSegmentPrism(scene, wall, segment, outlines.get(wall.id)),
            3,
          ),
        );
        geometry.computeVertexNormals();
        return { wall, wallIndex, segmentIndex, geometry };
      }),
    );
  }, [scene.nodes, scene.openings, scene.walls]);
  useEffect(
    () => () => wallPieces.forEach((piece) => piece.geometry.dispose()),
    [wallPieces],
  );
  const save = async () => {
    const name = prompt("Naam voor deze camera", "Presentatiecamera");
    if (!name) return;
    try {
      const saved = await request<ViewerView>(
        `/variants/${variantId}/viewer-views`,
        {
          id: crypto.randomUUID(),
          name,
          baseRevision: scene.revision,
          camera: cameraState.current,
          settings,
        },
      );
      setSelectedView(saved.id);
      await load();
      setMessage("Camera en ontwerpversie zijn opgeslagen.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const exportPng = () => {
    const view = views.find((v) => v.id === selectedView);
    if (!view || view.revision !== scene.revision) {
      setMessage("Sla eerst deze camera op voor de huidige ontwerprevisie.");
      return;
    }
    const gl = renderer.current,
      c = activeCamera.current,
      s = renderScene.current;
    if (!gl || !c || !s) return;
    gl.render(s, c);
    gl.domElement.toBlob((blob) => {
      if (!blob) return setMessage("Beeldexport is niet beschikbaar.");
      const a = document.createElement("a"),
        url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `3d-${view.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-r${scene.revision}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
  };
  const removeView = async () => {
    if (!selectedView) return;
    try {
      await request(
        `/variants/${variantId}/viewer-views/${selectedView}/delete`,
        {},
      );
      setSelectedView("");
      await load();
      setMessage("Opgeslagen camera is verwijderd.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const evening = settings.atmosphere === "evening",
    withinDrawCallBudget =
      metrics === null || metrics.drawCalls <= VIEWER_BUDGETS.drawCalls,
    dpr =
      settings.quality === "low"
        ? 1
        : Math.min(
            devicePixelRatio,
            settings.quality === "high" ? VIEWER_BUDGETS.devicePixelRatio : 1.5,
          );
  return (
    <div
      className="viewer"
      data-render-ready={ready}
      data-draw-calls={metrics?.drawCalls}
      data-render-triangles={metrics?.triangles}
      data-performance-budget={
        metrics ? (withinDrawCallBudget ? "ok" : "exceeded") : "pending"
      }
    >
      <div className="viewer-toolbar" aria-label="3D-bediening">
        <label>
          Weergave
          <select
            value={camera.projection}
            onChange={(e) => {
              setCamera({
                ...camera,
                projection: e.target.value as Projection,
                zoom: e.target.value === "orthographic" ? 75 : 1,
              });
              setApply((n) => n + 1);
            }}
          >
            <option value="perspective">Perspectief</option>
            <option value="orthographic">Orthografisch</option>
          </select>
        </label>
        <button
          onClick={() => {
            const n: {
              projection: Projection;
              mode: Mode;
              position: [number, number, number];
              target: [number, number, number];
              fov: number;
              zoom: number;
            } = {
              ...camera,
              projection: "orthographic",
              mode: "orbit",
              position: [8, 8, 8],
              target: [3, 0, 2],
              zoom: 75,
            };
            setCamera(n);
            cameraState.current = n;
            setApply((x) => x + 1);
          }}
        >
          Isometrisch
        </button>
        <button
          aria-pressed={camera.mode === "walk"}
          onClick={() => {
            const mode: Mode = camera.mode === "walk" ? "orbit" : "walk",
              n: CameraState = {
                ...cameraState.current,
                mode,
                position:
                  mode === "walk" ? [3, 1.65, 4] : cameraState.current.position,
                target:
                  mode === "walk" ? [3, 1.55, 3] : cameraState.current.target,
              };
            setCamera(n);
            cameraState.current = n;
            setApply((x) => x + 1);
          }}
        >
          {camera.mode === "walk" ? "Orbit gebruiken" : "Walk-modus"}
        </button>
        <label>
          Sfeer
          <select
            value={settings.atmosphere}
            onChange={(e) =>
              setSettings({
                ...settings,
                atmosphere: e.target.value as Settings["atmosphere"],
              })
            }
          >
            <option value="day">Dag</option>
            <option value="evening">Avond</option>
          </select>
        </label>
        <label>
          Kwaliteit
          <select
            value={settings.quality}
            onChange={(e) =>
              setSettings({
                ...settings,
                quality: e.target.value as Settings["quality"],
              })
            }
          >
            <option value="low">Laag</option>
            <option value="medium">Normaal</option>
            <option value="high">Hoog</option>
          </select>
        </label>
        <label>
          Muren
          <select
            value={settings.walls}
            onChange={(e) =>
              setSettings({
                ...settings,
                walls: e.target.value as Settings["walls"],
              })
            }
          >
            <option value="all">Alle muren</option>
            <option value="cutaway">Doorsnede</option>
            <option value="hidden">Verborgen</option>
          </select>
        </label>
        <button
          aria-pressed={settings.ceiling}
          onClick={() =>
            setSettings({ ...settings, ceiling: !settings.ceiling })
          }
        >
          {settings.ceiling ? "Plafond verbergen" : "Plafond tonen"}
        </button>
        <span className="viewer-floor">Verdieping · Begane grond</span>
        <button disabled={disabled} onClick={() => void save()}>
          Camera opslaan
        </button>
        <button onClick={exportPng}>PNG exporteren</button>
        {!!views.length && (
          <label>
            Camera
            <select
              aria-label="Opgeslagen camera"
              value={selectedView}
              onChange={(e) => {
                setSelectedView(e.target.value);
                const v = views.find((x) => x.id === e.target.value);
                if (v) {
                  setCamera(v.camera);
                  cameraState.current = v.camera;
                  setSettings(v.settings);
                  setApply((n) => n + 1);
                  setMessage(
                    v.revision === scene.revision
                      ? "Opgeslagen camera geopend."
                      : "Camera hoort bij een oudere ontwerprevisie.",
                  );
                }
              }}
            >
              <option value="">Kies…</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · revisie {v.revision}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          disabled={!selectedView || disabled}
          onClick={() => void removeView()}
        >
          Camera verwijderen
        </button>
      </div>
      <Canvas
        key={`${camera.projection}:${settings.atmosphere}:${settings.quality}`}
        orthographic={camera.projection === "orthographic"}
        shadows={settings.quality !== "low"}
        dpr={dpr}
        camera={
          camera.projection === "orthographic"
            ? { position: camera.position, zoom: camera.zoom }
            : { position: camera.position, fov: camera.fov }
        }
        frameloop="demand"
        gl={{
          antialias: settings.quality !== "low",
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl, scene: threeScene }) => {
          renderScene.current = threeScene;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = evening ? 0.82 : 1;
          gl.setClearColor(new Color(evening ? "#182334" : "#dfe9ef"));
        }}
      >
        <color attach="background" args={[evening ? "#182334" : "#dfe9ef"]} />
        <ambientLight intensity={evening ? 0.35 : 1.25} />
        <hemisphereLight
          args={[
            evening ? "#7f8fba" : "#dceeff",
            evening ? "#2d2520" : "#736957",
            evening ? 0.65 : 1.3,
          ]}
        />
        <directionalLight
          position={[3, 8, 4]}
          intensity={evening ? 0.3 : 2.2}
          castShadow={settings.quality !== "low"}
          shadow-mapSize={[
            settings.quality === "high" ? VIEWER_BUDGETS.shadowMapPixels : 1024,
            settings.quality === "high" ? VIEWER_BUDGETS.shadowMapPixels : 1024,
          ]}
        />
        {evening && (
          <pointLight
            position={[3, 2.4, 2]}
            intensity={16}
            distance={8}
            color="#ffd0a0"
            castShadow={settings.quality === "high"}
          />
        )}
        <Controls state={camera} apply={apply} onChange={onCamera} />
        <Ready
          done={(nextMetrics) => {
            setMetrics(nextMetrics);
            setReady(true);
          }}
        />
        {floors.map((f) => (
          <mesh
            key={f.id}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.015, 0]}
            receiveShadow
          >
            <shapeGeometry args={[f.shape]} />
            <meshStandardMaterial
              color={evening ? "#7f6b54" : "#c9b18e"}
              roughness={0.88}
            />
          </mesh>
        ))}
        {settings.ceiling &&
          floors.map((f) => (
            <mesh
              key={`ceiling-${f.id}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[
                0,
                Math.max(...scene.walls.map((w) => w.height), 2500) / 1000,
                0,
              ]}
              receiveShadow
            >
              <shapeGeometry args={[f.shape]} />
              <meshStandardMaterial
                color="#f4eee1"
                roughness={0.95}
                side={DoubleSide}
              />
            </mesh>
          ))}
        {settings.walls !== "hidden" &&
          wallPieces.map((piece) => {
            if (settings.walls === "cutaway" && piece.wallIndex % 2)
              return null;
            return (
              <mesh
                key={piece.wall.id + piece.segmentIndex}
                castShadow
                receiveShadow
              >
                <primitive attach="geometry" object={piece.geometry} />
                <meshStandardMaterial
                  color={evening ? "#b8aa98" : "#f4eee1"}
                  roughness={0.92}
                />
              </mesh>
            );
          })}
        {settings.walls !== "hidden" && <Openings scene={scene} />}
        <ModelItems
          scene={scene}
          selected={selected}
          onSelect={onSelect}
          onStatus={modelStatus}
        />
      </Canvas>
      <div className="canvas-note">
        3D · sleep om te draaien · scroll om te zoomen
        {camera.mode === "walk" && " · W/A/S/D om te lopen"}
        {!!selected.length &&
          camera.mode === "orbit" &&
          " · pijltjestoetsen verplaatsen 100 mm, Shift 10 mm"}
        {status && <span role="status"> · {status}</span>}
        {metrics && (
          <span role={withinDrawCallBudget ? undefined : "alert"}>
            {` · ${metrics.drawCalls} draw calls · ${metrics.triangles.toLocaleString("nl-NL")} driehoeken`}
            {!withinDrawCallBudget &&
              ` · budget van ${VIEWER_BUDGETS.drawCalls} draw calls overschreden; kies lagere kwaliteit`}
          </span>
        )}
        {message && <span role="status"> · {message}</span>}
      </div>
    </div>
  );
}
