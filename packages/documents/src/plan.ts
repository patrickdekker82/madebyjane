import { symbolSvg } from "../../geometry/src/symbol";
import type { Scene } from "../../contracts/src/index";
import { endpoints, wallSegments } from "../../geometry/src/index";
export const escapeXml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function planSvg(scene: Scene, scale: 20 | 50 | 100 = 50) {
  const all = [
    ...scene.nodes,
    ...scene.items.flatMap((i) => [
      {
        x: i.x - i.width / 2 - i.depth / 2,
        y: i.y - i.width / 2 - i.depth / 2,
      },
      {
        x: i.x + i.width / 2 + i.depth / 2,
        y: i.y + i.width / 2 + i.depth / 2,
      },
    ]),
  ];
  const minX = Math.min(0, ...all.map((p) => p.x)) - 500,
    minY = Math.min(0, ...all.map((p) => p.y)) - 500,
    maxX = Math.max(0, ...all.map((p) => p.x)) + 500,
    maxY = Math.max(0, ...all.map((p) => p.y)) + 500;
  if ((maxX - minX) / scale > 277 || (maxY - minY) / scale > 165)
    throw new Error(
      "Ontwerp past niet op A4 liggend bij deze schaal. Kies een kleinere schaal.",
    );
  const referenceMm = scale === 20 ? 1000 : 5000;
  const walls = scene.walls
    .map((w) => {
      const { a, b, length } = endpoints(scene, w);
      return wallSegments(scene, w)
        .filter((s) => s.bottom <= 1200 && s.bottom + s.height > 1200)
        .map(
          (s) =>
            `<line x1="${a.x + ((b.x - a.x) * s.offset) / length}" y1="${a.y + ((b.y - a.y) * s.offset) / length}" x2="${a.x + ((b.x - a.x) * (s.offset + s.width)) / length}" y2="${a.y + ((b.y - a.y) * (s.offset + s.width)) / length}" stroke="#343b32" stroke-width="${w.thickness}"/>`,
        )
        .join("");
    })
    .join("");
  const openings = scene.openings
    .map((o) => {
      const w = scene.walls.find((w) => w.id === o.wallId)!;
      const { a, angle } = endpoints(scene, w);
      return `<g transform="translate(${a.x + Math.cos(angle) * o.offset},${a.y + Math.sin(angle) * o.offset}) rotate(${(angle * 180) / Math.PI})"><line x1="0" y1="0" x2="${o.width}" y2="0" stroke="${o.kind === "window" ? "#64838a" : "#8d775d"}" stroke-width="20"/>${o.kind === "door" ? `<path d="M0 0 L0 ${o.width} A${o.width} ${o.width} 0 0 0 ${o.width} 0" fill="none" stroke="#8d775d" stroke-width="15"/>` : ""}</g>`;
    })
    .join("");
  const items = scene.items
    .map(
      (i) =>
        `<g transform="translate(${i.x},${i.y}) rotate(${i.rotation})">${i.symbol ? symbolSvg(i.symbol, i.width, i.depth) : `<rect x="${-i.width / 2}" y="${-i.depth / 2}" width="${i.width}" height="${i.depth}" rx="50" fill="${i.color}" stroke="#4c5148" stroke-width="15"/>`}<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-size="${2.5 * scale}">${escapeXml(i.name)}</text></g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><rect width="297" height="210" fill="white"/><g font-family="Arial,sans-serif" transform="translate(10 12) scale(${1 / scale}) translate(${-minX} ${-minY})">${walls}${openings}${items}</g><g font-family="Arial,sans-serif" fill="#343b32"><line x1="10" y1="180" x2="287" y2="180" stroke="#9b9c92" stroke-width="0.3"/><text x="10" y="190" font-size="5">STUDIO / Ontwerpblad</text><text x="10" y="198" font-size="3">Revisie ${scene.revision} · 1:${scale} · A4 liggend · Print op 100%</text><line id="scale-reference-${referenceMm}mm" x1="175" y1="195" x2="${175 + referenceMm / scale}" y2="195" stroke="#343b32" stroke-width="0.5"/><text x="175" y="191" font-size="3">${referenceMm.toLocaleString("nl-NL")} mm</text></g></svg>`;
}
