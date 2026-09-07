import { expect, test } from "vitest";
import { inspectGlb, MAX_GLB_BYTES } from "../packages/model-import/src/glb";
import { makeGlb } from "./helpers/glb";
test("GLB bounds come from transformed vertices; preview is centred on the floor", () => {
  const model = inspectGlb(makeGlb(j => { j.nodes = [{ children: [1], translation: [10, 5, 2], scale: [2, 3, 4] }, { mesh: 0 }]; }));
  expect([model.width, model.depth, model.height, model.triangles]).toEqual([4000, 2000, 3000, 4]);
  expect(Math.min(...Array.from(model.positions).filter((_, i) => i % 3 === 1))).toBe(0);
  expect(Math.min(...Array.from(model.positions).filter((_, i) => i % 3 === 0))).toBe(-2);
});
test("GLB rejects truncated, oversized, invalid version and invalid chunks", () => {
  expect(() => inspectGlb(new ArrayBuffer(12))).toThrow();
  expect(() => inspectGlb(new ArrayBuffer(MAX_GLB_BYTES + 1))).toThrow(/10 MiB/);
  const data = makeGlb(); new DataView(data).setUint32(4, 1, true);
  expect(() => inspectGlb(data)).toThrow(/header/);
  const chunk = makeGlb(); new DataView(chunk).setUint32(12, 0xffffffff, true);
  expect(() => inspectGlb(chunk)).toThrow(/chunk/);
});
test("GLB rejects external sources, textures, compression and animations before rendering", () => {
  for (const edit of [
    (j: any) => { j.buffers[0].uri = "https://example.invalid/secret"; },
    (j: any) => { j.images = [{ uri: "data:image/png;base64,AAAA" }]; },
    (j: any) => { j.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} }; },
    (j: any) => { j.animations = []; },
    (j: any) => { j.accessors[0].sparse = {}; },
  ]) expect(() => inspectGlb(makeGlb(edit))).toThrow(/ondersteund/);
});
test("GLB rejects invalid ranges, nonfinite binary values, cycles and excessive expansion", () => {
  expect(() => inspectGlb(makeGlb(j => { j.bufferViews[0].byteLength += 4; }))).toThrow(/Bufferbereik/);
  expect(() => inspectGlb(makeGlb(j => { j.accessors[0].count = 300000; }))).toThrow(/Accessorbereik/);
  expect(() => inspectGlb(makeGlb(undefined, [NaN,0,0, 1,1,1, 0,0,0]))).toThrow(/niet-eindige/);
  expect(() => inspectGlb(makeGlb(j => { j.nodes[0].children = [0]; }))).toThrow(/Cyclische/);
  expect(() => inspectGlb(makeGlb(j => {
    j.meshes[0].primitives = Array.from({length:128}, () => ({attributes:{POSITION:0}}));
    j.nodes = Array.from({length:256}, (_,i) => ({mesh:0, ...(i === 0 ? {children: Array.from({length:255},(_,n)=>n+1)} : {})}));
  }))).toThrow(/100.000/);
});
test("GLB rejects invalid transforms and physically unusable bounds", () => {
  expect(() => inspectGlb(makeGlb(j => { j.nodes[0].rotation = [0,0,0,0]; }))).toThrow(/rotatie/);
  expect(() => inspectGlb(makeGlb(j => { j.nodes[0].scale = [0,1,1]; }))).toThrow(/modelmaten/);
  expect(() => inspectGlb(makeGlb(j => { j.nodes[0].scale = [100,1,1]; }))).toThrow(/modelmaten/);
});
test("GLB reads indexed triangles and rejects out-of-range indices", () => {
  const data = makeGlb(j => {
    j.bufferViews = [{buffer:0, byteOffset:0, byteLength:48}, {buffer:0, byteOffset:48, byteLength:24}];
    j.accessors = [{bufferView:0, componentType:5126, count:4, type:"VEC3"}, {bufferView:1, componentType:5123, count:12, type:"SCALAR"}];
    j.meshes[0].primitives[0].indices = 1;
  }, [0,0,0, 2,0,0, 0,1,0, 0,0,0.5, ...Array(6).fill(0)]);
  const indices = new DataView(data, data.byteLength - 24);
  [0,1,2, 0,3,1, 0,2,3, 1,3,2].forEach((v,i) => indices.setUint16(i*2,v,true));
  expect(inspectGlb(data).triangles).toBe(4);
  indices.setUint16(0,4,true);
  expect(() => inspectGlb(data)).toThrow(/index verwijst buiten/);
});
