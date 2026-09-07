import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from "three";
import type { Scene } from "../../contracts/src/index";
import { toThree, toThreeRotation } from "../../geometry/src/index";
export function ModelItems({ scene, onStatus }: { scene: Scene; onStatus: (text: string) => void }) {
  const [geometries, setGeometries] = useState<Map<string, BufferGeometry>>(new Map());
  const key = JSON.stringify([...new Set(scene.items.flatMap(item => item.model ? [item.model.assetId] : []))].sort());
  useEffect(() => {
    const controller = new AbortController(), loaded = new Map<string, BufferGeometry>();
    let stopped = false;
    setGeometries(new Map());
    const ids = JSON.parse(key) as string[];
    onStatus(ids.length ? "Modellen laden…" : "");
    void (async () => {
      let triangles = 0;
      for (const id of ids) {
        if (stopped) break;
        try {
          const response = await fetch("/api/v1/model-assets/" + id, { credentials: "same-origin", headers: { "x-organization-id": scene.organizationId }, signal: controller.signal });
          if (!response.ok) continue;
          const bytes = await response.arrayBuffer();
          if (stopped) break;
          if (!bytes.byteLength || bytes.byteLength > 3600000 || bytes.byteLength % 36 || triangles + bytes.byteLength / 36 > 500000) continue;
          const view = new DataView(bytes), positions = new Float32Array(bytes.byteLength / 4);
          for (let i = 0; i < positions.length; i++) positions[i] = view.getFloat32(i * 4, true);
          if (!positions.every(Number.isFinite)) continue;
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new BufferAttribute(positions, 3));
          geometry.computeVertexNormals(); geometry.computeBoundingBox();
          triangles += bytes.byteLength / 36; loaded.set(id, geometry);
        } catch { if (stopped) break; }
      }
      if (!stopped) setGeometries(new Map(loaded));
    })();
    return () => { stopped = true; controller.abort(); loaded.forEach(g => g.dispose()); };
  }, [key, scene.organizationId, onStatus]);
  const choices = useMemo(() => {
    let triangles = 0;
    return scene.items.map(item => {
      const geometry = item.model ? geometries.get(item.model.assetId) : undefined;
      const count = geometry ? geometry.getAttribute("position").count / 3 : 0;
      if (geometry && triangles + count <= 500000) { triangles += count; return geometry; }
      return undefined;
    });
  }, [scene.items, geometries]);
  useEffect(() => {
    const missing = scene.items.filter((item, i) => item.model && !choices[i]).length;
    onStatus(missing ? `${missing} model(len) als blokvorm: nog niet geladen, niet beschikbaar of boven de weergavelimiet.` : scene.items.some(item => item.model) ? "Eigen 3D-modellen geladen" : "");
  }, [choices, scene.items, onStatus]);
  return <>{scene.items.map((item, i) => {
    const geometry = choices[i];
    const size = geometry?.boundingBox?.getSize(new Vector3());
    return geometry && size && size.x > 0 && size.y > 0 && size.z > 0 ? (
      <mesh key={item.id} position={toThree(item.x, item.y, 0)} rotation={[0, toThreeRotation(item.rotation), 0]}
        scale={[item.width / 1000 / size.x, item.height / 1000 / size.y, item.depth / 1000 / size.z]} castShadow receiveShadow>
        <primitive attach="geometry" object={geometry} />
        <meshStandardMaterial color={item.color} side={DoubleSide} roughness={0.8} />
      </mesh>
    ) : (
      <mesh key={item.id} position={toThree(item.x, item.y, item.height / 2)} rotation={[0, toThreeRotation(item.rotation), 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width / 1000, item.height / 1000, item.depth / 1000]} />
        <meshStandardMaterial color={item.color} roughness={0.8} />
      </mesh>
    );
  })}</>;
}
