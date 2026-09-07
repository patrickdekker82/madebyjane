import { z } from "zod";
import { Matrix4, Quaternion, Vector3 } from "three";
export const MAX_GLB_BYTES = 10 * 1024 * 1024;
const MAX_TRIANGLES = 100000;
const index = z.number().int().nonnegative().max(MAX_GLB_BYTES);
const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const schema = z.object({
  asset: z.object({ version: z.literal("2.0") }),
  buffers: z.array(z.object({ byteLength: index })).length(1),
  bufferViews: z.array(z.object({ buffer: z.literal(0), byteOffset: index.default(0), byteLength: index, byteStride: z.number().int().min(4).max(252).optional() })).max(512),
  accessors: z.array(z.object({ bufferView: index, byteOffset: index.default(0), componentType: z.number(), count: z.number().int().min(1).max(300000), type: z.string(), normalized: z.literal(false).optional() })).max(512),
  meshes: z.array(z.object({ primitives: z.array(z.object({ attributes: z.object({ POSITION: index }), indices: index.optional(), mode: z.literal(4).default(4) })).min(1).max(128) })).min(1).max(128),
  nodes: z.array(z.object({ mesh: index.optional(), children: z.array(index).max(256).default([]), matrix: z.array(z.number().finite()).length(16).optional(), translation: vec3.optional(), scale: vec3.optional(), rotation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).optional() })).min(1).max(256),
  scenes: z.array(z.object({ nodes: z.array(index).min(1).max(256) })).min(1).max(32),
  scene: index.default(0),
});
export type ModelPreview = { positions: Float32Array; width: number; depth: number; height: number; triangles: number };
function fail(message: string): never { throw new Error(message); }
/** Restricted geometry-only GLB reader. Never delegates raw documents to a loader. */
export function inspectGlb(data: ArrayBuffer): ModelPreview {
  if (data.byteLength > MAX_GLB_BYTES) fail("Het GLB-bestand is groter dan 10 MiB.");
  if (data.byteLength < 28) fail("Het bestand is geen volledig GLB-bestand.");
  const view = new DataView(data);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== data.byteLength) fail("Ongeldige GLB-header of bestandslengte.");
  let offset = 12;
  const chunks: { type: number; bytes: Uint8Array }[] = [];
  while (offset < data.byteLength) {
    if (offset + 8 > data.byteLength || chunks.length >= 2) fail("Onverwachte GLB-chunk.");
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > data.byteLength) fail("Ongeldige GLB-chunklengte.");
    chunks.push({ type, bytes: new Uint8Array(data, offset + 8, length) });
    offset += 8 + length;
  }
  if (chunks[0]?.type !== 0x4e4f534a || chunks[1]?.type !== 0x004e4942 || chunks[0].bytes.length > 1024 * 1024) fail("GLB moet één JSON-chunk (maximaal 1 MiB) en één BIN-chunk bevatten.");
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(chunks[0].bytes)); } catch { fail("Ongeldige GLB-JSON."); }
  let entries = 0;
  const scan = (value: unknown, depth = 0) => {
    if (++entries > 50000 || depth > 32) fail("De modelstructuur is te complex.");
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["uri", "extensions", "extensionsRequired", "extensionsUsed", "sparse", "animations", "skins", "skin", "targets", "weights", "images", "textures"].includes(key)) fail("Externe bronnen, textures, animaties, morphs en extensies worden nog niet ondersteund.");
      scan(child, depth + 1);
    }
  };
  scan(raw);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail("Dit model valt buiten het ondersteunde GLB-profiel (statische driehoeken).");
  const model = parsed.data, bin = chunks[1].bytes;
  const bufferLength = model.buffers[0]!.byteLength;
  if (bufferLength > bin.length || bin.length - bufferLength > 3) fail("BIN-bufferlengte klopt niet.");
  const binary = new DataView(bin.buffer, bin.byteOffset, bufferLength);
  for (const b of model.bufferViews) if (b.byteOffset + b.byteLength > bufferLength || (b.byteStride && b.byteStride % 4)) fail("Bufferbereik valt buiten het bestand.");
  const read = (id: number, position: boolean) => {
    const a = model.accessors[id];
    if (!a) fail("Onbekende accessor.");
    const b = model.bufferViews[a.bufferView];
    if (!b) fail("Onbekende bufferView.");
    const bytes = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4;
    if (position ? a.componentType !== 5126 || a.type !== "VEC3" : ![5121, 5123, 5125].includes(a.componentType) || a.type !== "SCALAR" || b.byteStride !== undefined) fail("Niet-ondersteunde positie- of indexgegevens.");
    const components = position ? 3 : 1, stride = b.byteStride ?? bytes * components;
    if (stride < bytes * components || (b.byteOffset + a.byteOffset) % bytes || a.byteOffset % bytes || a.byteOffset + (a.count - 1) * stride + bytes * components > b.byteLength) fail("Accessorbereik of uitlijning is ongeldig.");
    return { count: a.count, at: (i: number, c = 0) => {
      const address = b.byteOffset + a.byteOffset + i * stride + c * bytes;
      const value = position ? binary.getFloat32(address, true) : bytes === 1 ? binary.getUint8(address) : bytes === 2 ? binary.getUint16(address, true) : binary.getUint32(address, true);
      if (!Number.isFinite(value)) fail("Het model bevat niet-eindige coördinaten.");
      return value;
    } };
  };
  const selectedScene = model.scenes[model.scene];
  if (!selectedScene) fail("De geselecteerde scene bestaat niet.");
  const seen = new Set<number>(), positions: number[] = [], min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  const visit = (id: number, parent: Matrix4, depth: number) => {
    if (depth > 32 || seen.has(id)) fail("Cyclische of meervoudig gekoppelde modelnodes.");
    seen.add(id);
    const node = model.nodes[id];
    if (!node) fail("Onbekende modelnode.");
    if (node.matrix && (node.translation || node.scale || node.rotation)) fail("Matrix en losse transformaties mogen niet samen voorkomen.");
    const rotation = new Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
    if (Math.abs(rotation.length() - 1) > 0.0001) fail("Ongeldige modelrotatie.");
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), rotation, new Vector3(...(node.scale ?? [1, 1, 1])));
    if (local.elements[3] !== 0 || local.elements[7] !== 0 || local.elements[11] !== 0 || local.elements[15] !== 1) fail("Niet-affiene modelmatrix.");
    const transform = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      const mesh = model.meshes[node.mesh];
      if (!mesh) fail("Onbekende mesh.");
      for (const primitive of mesh.primitives) {
        const vertices = read(primitive.attributes.POSITION, true), indices = primitive.indices === undefined ? null : read(primitive.indices, false);
        const count = indices?.count ?? vertices.count;
        if (count % 3 || positions.length / 9 + count / 3 > MAX_TRIANGLES) fail("Een model mag maximaal 100.000 volledige driehoeken bevatten.");
        for (let i = 0; i < count; i++) {
          const vertex = indices ? indices.at(i) : i;
          if (vertex >= vertices.count) fail("Een index verwijst buiten de vertexbuffer.");
          const p = new Vector3(vertices.at(vertex, 0), vertices.at(vertex, 1), vertices.at(vertex, 2)).applyMatrix4(transform);
          if (![p.x, p.y, p.z].every(v => Number.isFinite(v) && Math.abs(v) <= 10000)) fail("Modelcoördinaten vallen buiten het ondersteunde bereik.");
          min.min(p); max.max(p); positions.push(p.x, p.y, p.z);
        }
      }
    }
    for (const child of node.children) visit(child, transform, depth + 1);
  };
  for (const root of selectedScene.nodes) visit(root, new Matrix4(), 0);
  if (!positions.length) fail("Het model bevat geen zichtbare driehoeken.");
  const size = max.clone().sub(min);
  if (![size.x, size.y, size.z].every(v => v >= 0.001 && v <= 100)) fail("De modelmaten moeten tussen 1 mm en 100 meter liggen.");
  const center = min.clone().add(max).multiplyScalar(0.5);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i]! -= center.x; positions[i + 1]! -= min.y; positions[i + 2]! -= center.z;
  }
  return { positions: new Float32Array(positions), width: Math.round(size.x * 1000), height: Math.round(size.y * 1000), depth: Math.round(size.z * 1000), triangles: positions.length / 9 };
}
