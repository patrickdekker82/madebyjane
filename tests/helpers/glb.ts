/** Own tetrahedron fixture, metres, no external assets or licensing dependencies. */
export function makeGlb(change?: (json: any) => void, coordinates?: number[]) {
  const positions = new Float32Array(coordinates ?? [
    0,0,0, 2,0,0, 0,1,0,
    0,0,0, 0,0,0.5, 2,0,0,
    0,0,0, 0,1,0, 0,0,0.5,
    2,0,0, 0,0,0.5, 0,1,0,
  ]);
  const json = {
    asset: { version: "2.0" }, buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  };
  change?.(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const result = new ArrayBuffer(28 + jsonLength + positions.byteLength), view = new DataView(result);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, jsonLength).fill(32); new Uint8Array(result, 20, text.length).set(text);
  view.setUint32(20 + jsonLength, positions.byteLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  new Uint8Array(result, 28 + jsonLength).set(new Uint8Array(positions.buffer));
  return result;
}
