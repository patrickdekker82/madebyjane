import { ModelItems } from "./ModelItems";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useEffect, useState, useRef, useMemo } from "react";
import { Shape, Path, Vector2 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Camera, Operation, Scene } from "../../contracts/src/index";
import {
  endpoints,
  fromThree,
  toThree,
  toThreeRotation,
  wallSegments,
  detectRooms,
} from "../../geometry/src/index";
import type { PerspectiveCamera } from "three";
/**
 * Wat de knoppen buiten het doek van de camera binnenin mogen weten en vragen.
 * De camera zelf leeft in de render-lus; alles wat eromheen staat is gewone
 * React en kan er niet bij zonder deze brug.
 */
type ViewerApi = {
  /** Het standpunt zoals het er nu bij staat, in millimeters van het plan. */
  read: () => Omit<Camera, "id" | "name">;
  apply: (camera: Camera) => void;
  /** Een PNG van het beeld zoals het er nu uitziet, als data-URI. */
  snapshot: () => string;
};
function Controls({ api }: { api: React.RefObject<ViewerApi | null> }) {
  const { camera, gl, invalidate, scene } = useThree();
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(3, 0, 2);
    c.maxPolarAngle = Math.PI / 2.02;
    const changed = () => invalidate();
    c.addEventListener("change", changed);
    c.update();
    const lens = camera as PerspectiveCamera;
    api.current = {
      read: () => ({
        eye: fromThree(camera.position.x, camera.position.y, camera.position.z),
        target: fromThree(c.target.x, c.target.y, c.target.z),
        fov: Math.round(lens.fov),
      }),
      apply: (bewaard) => {
        camera.position.set(
          ...toThree(bewaard.eye.x, bewaard.eye.y, bewaard.eye.z),
        );
        c.target.set(
          ...toThree(bewaard.target.x, bewaard.target.y, bewaard.target.z),
        );
        lens.fov = bewaard.fov;
        lens.updateProjectionMatrix();
        c.update();
        invalidate();
      },
      /*
       * Eerst zelf een beeld tekenen en dan pas uitlezen. De weergave tekent
       * alleen op verzoek (`frameloop="demand"`), dus zonder deze regel lees je
       * het beeld van een willekeurig moment daarvoor uit — of een leeg doek.
       */
      snapshot: () => {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      },
    };
    return () => {
      api.current = null;
      c.removeEventListener("change", changed);
      c.dispose();
    };
  }, [api, camera, gl, invalidate, scene]);
  return null;
}
function RenderReady({ onReady }: { onReady: () => void }) {
  const ready = useRef(false);
  useFrame(({ gl, invalidate }) => {
    if (ready.current) return;
    if (gl.info.render.calls > 0) {
      ready.current = true;
      onReady();
    } else invalidate();
  });
  return null;
}
export default function Viewer({
  scene,
  onCommand,
  disabled = false,
}: {
  scene: Scene;
  /** Ontbreekt bij alleen kijken; dan zijn standpunten wel te gebruiken, niet te bewaren. */
  onCommand?: (operations: Operation[]) => void;
  disabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [modelStatus, setModelStatus] = useState("");
  const [cameraName, setCameraName] = useState("");
  const [cameraError, setCameraError] = useState("");
  const api = useRef<ViewerApi | null>(null);
  const floors = useMemo(
    () =>
      detectRooms(scene).rooms.map((room) => {
        const shape = new Shape(
          room.contour.map((p) => new Vector2(p.x / 1000, -p.y / 1000)),
        );
        for (const hole of room.holes) {
          const path = new Path();
          hole.forEach((p, i) =>
            i === 0
              ? path.moveTo(p.x / 1000, -p.y / 1000)
              : path.lineTo(p.x / 1000, -p.y / 1000),
          );
          path.closePath();
          shape.holes.push(path);
        }
        return { id: room.id, shape };
      }),
    [scene.nodes, scene.walls],
  );
  return (
    <div className="viewer" data-render-ready={ready}>
      <Canvas
        shadows
        camera={{ position: [9, 9, 10], fov: 45 }}
        frameloop="demand"
        /*
         * Het beeld moet na het tekenen nog uit te lezen zijn, anders levert
         * "beeld opslaan" een leeg bestand. Dat kost geheugen en is daarom
         * standaard uit.
         */
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#e9e8df"]} />
        <ambientLight intensity={1.4} />
        <directionalLight
          position={[3, 8, 4]}
          intensity={2.5}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Controls api={api} />
        <RenderReady onReady={() => setReady(true)} />
        {floors.map((floor) => (
          <mesh
            key={floor.id}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.015, 0]}
            receiveShadow
          >
            <shapeGeometry args={[floor.shape]} />
            <meshStandardMaterial color="#d6c7af" />
          </mesh>
        ))}
        {scene.walls.flatMap((w) => {
          const { a, angle } = endpoints(scene, w);
          return wallSegments(scene, w).map((part, index) => {
            const center = part.offset + part.width / 2;
            return (
              <mesh
                key={w.id + index}
                position={toThree(
                  a.x + Math.cos(angle) * center,
                  a.y + Math.sin(angle) * center,
                  part.bottom + part.height / 2,
                )}
                rotation={[0, -angle, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry
                  args={[
                    part.width / 1000,
                    part.height / 1000,
                    w.thickness / 1000,
                  ]}
                />
                <meshStandardMaterial color="#f4eee1" />
              </mesh>
            );
          });
        })}
        <ModelItems scene={scene} onStatus={setModelStatus} />
      </Canvas>
      <div className="canvas-note">
        3D · sleep om te draaien · scroll om te zoomen
        {modelStatus && <span role="status"> · {modelStatus}</span>}
      </div>
      <div className="viewer-cameras">
        {scene.cameras.map((camera) => (
          <span key={camera.id}>
            <button
              onClick={() => {
                setCameraError("");
                api.current?.apply(camera);
              }}
            >
              {camera.name}
            </button>
            {onCommand && (
              <button
                aria-label={`Standpunt ${camera.name} verwijderen`}
                disabled={disabled}
                onClick={() => {
                  setCameraError("");
                  onCommand([{ type: "DeleteCamera", id: camera.id }]);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {onCommand && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const standpunt = api.current?.read();
              if (!standpunt) {
                setCameraError("De weergave is nog niet klaar.");
                return;
              }
              const naam = cameraName.trim();
              if (!naam) {
                setCameraError("Geef het standpunt een naam.");
                return;
              }
              /*
               * Een bestaande naam is bijwerken en geen tweede standpunt: dat
               * is wat iemand bedoelt die de camera verzet en opnieuw bewaart
               * onder dezelfde naam.
               */
              const bestaand = scene.cameras.find((c) => c.name === naam);
              setCameraError("");
              setCameraName("");
              onCommand([
                {
                  type: "SaveCamera",
                  camera: {
                    ...standpunt,
                    id: bestaand?.id ?? crypto.randomUUID(),
                    name: naam,
                  },
                },
              ]);
            }}
          >
            <input
              aria-label="Naam van het standpunt"
              value={cameraName}
              maxLength={80}
              placeholder="Bijvoorbeeld: vanaf de eettafel"
              disabled={disabled}
              onChange={(event) => setCameraName(event.target.value)}
            />
            <button disabled={disabled}>Standpunt bewaren</button>
          </form>
        )}
        <button
          onClick={() => {
            const beeld = api.current?.snapshot();
            if (!beeld) {
              setCameraError("De weergave is nog niet klaar.");
              return;
            }
            setCameraError("");
            const a = document.createElement("a");
            a.href = beeld;
            a.download = `aanzicht-revisie-${scene.revision}.png`;
            a.click();
          }}
        >
          Beeld opslaan (PNG)
        </button>
        {cameraError && (
          <span role="alert" className="error">
            {cameraError}
          </span>
        )}
      </div>
    </div>
  );
}
