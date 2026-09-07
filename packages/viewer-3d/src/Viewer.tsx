import { ModelItems } from "./ModelItems";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useEffect, useState, useRef, useMemo } from "react";
import { Shape, Path, Vector2 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Scene } from "../../contracts/src/index";
import {
  endpoints,
  toThree,
  toThreeRotation,
  wallSegments,
  detectRooms,
} from "../../geometry/src/index";
function Controls() {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(3, 0, 2);
    c.maxPolarAngle = Math.PI / 2.02;
    const changed = () => invalidate();
    c.addEventListener("change", changed);
    c.update();
    return () => {
      c.removeEventListener("change", changed);
      c.dispose();
    };
  }, [camera, gl, invalidate]);
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
export default function Viewer({ scene }: { scene: Scene }) {
  const [ready, setReady] = useState(false);
  const [modelStatus, setModelStatus] = useState("");
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
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#e9e8df"]} />
        <ambientLight intensity={1.4} />
        <directionalLight
          position={[3, 8, 4]}
          intensity={2.5}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Controls />
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
    </div>
  );
}
