import { ModelItems } from "./ModelItems";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useEffect, useState, useRef, useMemo } from "react";
import { Shape, Path, Vector2, Vector3, Quaternion, DoubleSide } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Camera, Operation, Scene } from "../../contracts/src/index";
import type { PlannedLight } from "../../geometry/src/index";
import {
  endpoints,
  fromThree,
  lightPlan,
  toThree,
  toThreeRotation,
  wallSegments,
  detectRooms,
} from "../../geometry/src/index";
import type { Object3D, PerspectiveCamera, SpotLight } from "three";
/**
 * Wat de knoppen buiten het doek van de camera binnenin mogen weten en vragen.
 * De camera zelf leeft in de render-lus; alles wat eromheen staat is gewone
 * React en kan er niet bij zonder deze brug.
 */
type ViewerApi = {
  /**
   * Het standpunt zoals het er nu bij staat, in millimeters van het plan. De
   * lichtstand komt er buiten de render-lus bij: die is gewone React-state.
   */
  read: () => Omit<Camera, "id" | "name" | "light">;
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
/**
 * Een spot met zijn zichtbare bundel.
 *
 * Twee dingen zitten hier bij elkaar omdat ze niet uit elkaar mogen lopen: het
 * licht dat op de vloer valt en de doorzichtige kegel die laat zien waar het
 * vandaan komt. Die kegel is nadrukkelijk een aanwijzing en geen lichtvlek —
 * dezelfde belofte als de bundels op het planblad.
 *
 * Een spotlight in three.js mikt op een los object; dat object staat hier in de
 * scene op het punt waar de lamp op gericht is.
 */
function SpotLamp({
  at,
  toward,
  lamp,
}: {
  at: [number, number, number];
  toward: [number, number, number];
  lamp: PlannedLight;
}) {
  const licht = useRef<SpotLight>(null);
  const doel = useRef<Object3D>(null);
  useEffect(() => {
    if (licht.current && doel.current) licht.current.target = doel.current;
  }, []);
  const halveHoek = ((lamp.coneHalfAngleDeg ?? 30) * Math.PI) / 180;
  const richting = new Vector3(...toward).sub(new Vector3(...at));
  const lengte = richting.length() || 0.001;
  /*
   * De kegel van three.js wijst met zijn punt omhoog. Hij wordt hier gedraaid
   * tot die punt de kant op wijst waar de lamp vandaan schijnt, en met zijn
   * hart op de helft tussen lamp en doel gezet.
   */
  const draai = new Quaternion().setFromUnitVectors(
    new Vector3(0, -1, 0),
    richting.clone().normalize(),
  );
  const midden = new Vector3(...at).addScaledVector(
    richting.clone().normalize(),
    lengte / 2,
  );
  return (
    <>
      <spotLight
        ref={licht}
        position={at}
        color={lamp.color}
        intensity={lamp.strength * 18}
        angle={halveHoek}
        penumbra={0.35}
        distance={lengte * 3}
        decay={2}
        castShadow
      />
      <object3D ref={doel} position={toward} />
      <mesh
        position={midden.toArray()}
        quaternion={draai.toArray() as [number, number, number, number]}
      >
        <coneGeometry
          args={[Math.tan(halveHoek) * lengte, lengte, 24, 1, true]}
        />
        <meshBasicMaterial
          color={lamp.color}
          transparent
          opacity={0.07}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </>
  );
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
  /*
   * Dag of avond is een kijkstand en geen ontwerpgegeven, dus hij staat hier en
   * niet in de scene. Bij een bewaard standpunt reist hij wel mee: daar hoort
   * hij bij het beeld.
   */
  const [light, setLight] = useState<Camera["light"]>("day");
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
  /*
   * De grens van acht lampen komt van WebGL en niet van het ontwerp: meer
   * lichtbronnen tegelijk halen de meeste browsers niet zonder haperen. Wat
   * erbuiten valt wordt geteld en staat in beeld.
   */
  const plan = useMemo(
    () => lightPlan(scene.items, { mode: light, max: 8 }),
    [scene.items, light],
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
        <color
          attach="background"
          args={[light === "day" ? "#e9e8df" : "#161a20"]}
        />
        {/*
          Overdag doet de zon het werk. 's Avonds blijft er een restje
          omgevingslicht staan: pikdonker tussen de lampen is fysiek
          verdedigbaar maar maakt een plaat waar niemand iets aan heeft, en de
          weergave is een presentatiemiddel.
        */}
        <ambientLight intensity={light === "day" ? 1.4 : 0.18} />
        <directionalLight
          position={[3, 8, 4]}
          intensity={light === "day" ? 2.5 : 0.12}
          color={light === "day" ? "#ffffff" : "#8fa4c8"}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {plan.lights.map((lamp) => {
          const at = toThree(lamp.at.x, lamp.at.y, lamp.at.z),
            toward = toThree(lamp.toward.x, lamp.toward.y, lamp.toward.z);
          /*
           * Een bundelhoek geeft een spot, geen bundelhoek een lamp die rondom
           * schijnt. De reikwijdte is de afstand tot het punt waar hij op mikt,
           * ruim genomen zodat de vloer niet precies op de rand valt.
           */
          return lamp.coneHalfAngleDeg === null ? (
            <pointLight
              key={lamp.id}
              position={at}
              color={lamp.color}
              intensity={lamp.strength * 12}
              distance={(lamp.reachMm / 1000) * 3}
              decay={2}
            />
          ) : (
            <SpotLamp key={lamp.id} at={at} toward={toward} lamp={lamp} />
          );
        })}
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
        {light === "evening" && (
          <span role="status">
            {" "}
            · Avondweergave: een visuele benadering, geen lichtberekening
            {plan.omitted > 0 &&
              ` · ${plan.omitted} armatuur${plan.omitted === 1 ? "" : "en"} brandt wel maar wordt niet als lichtbron getekend`}
          </span>
        )}
      </div>
      <div className="viewer-cameras">
        {scene.cameras.map((camera) => (
          <span key={camera.id}>
            <button
              onClick={() => {
                setCameraError("");
                // De lichtstand hoort bij het beeld, dus die gaat mee terug.
                setLight(camera.light);
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
                    light,
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
          aria-pressed={light === "evening"}
          onClick={() => setLight(light === "day" ? "evening" : "day")}
        >
          {light === "day" ? "Avond tonen" : "Dag tonen"}
        </button>
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
