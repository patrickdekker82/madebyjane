import { symbolSvg } from "../../geometry/src/symbol";
import type { Scene } from "../../contracts/src/index";
import {
  endpoints,
  wallOutlines,
  dimensionGeometry,
  formatMm,
} from "../../geometry/src/index";
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
    ...scene.annotations.flatMap((a) => {
      const d = dimensionGeometry(a.from, a.to, a.offset);
      return [a.from, a.to, d.line.from, d.line.to];
    }),
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
  // Versneden contouren in plaats van dikke lijnen: stompe uiteinden laten in
  // elke hoek een hap open. Alle muurvlakken gaan er eerst op, daarna pas de
  // doorsnede op 1.200 mm, zodat een aangrenzende muur nooit een opening dicht
  // tekent die vlak bij een hoek ligt.
  const outlines = new Map(wallOutlines(scene).map((o) => [o.wallId, o.points]));
  const walls = scene.walls
    .map(
      (w) =>
        `<polygon points="${(outlines.get(w.id) ?? [])
          .map((p) => `${p.x},${p.y}`)
          .join(" ")}" fill="#343b32"/>`,
    )
    .join("");
  const cuts = scene.openings
    .filter((o) => o.sillHeight <= 1200 && o.sillHeight + o.height > 1200)
    .map((o) => {
      const w = scene.walls.find((wall) => wall.id === o.wallId)!;
      const { a, b, length, angle } = endpoints(scene, w);
      const x = a.x + ((b.x - a.x) * o.offset) / length,
        y = a.y + ((b.y - a.y) * o.offset) / length;
      return `<g transform="translate(${x},${y}) rotate(${(angle * 180) / Math.PI})"><rect x="0" y="${-w.thickness / 2 - 1}" width="${o.width}" height="${w.thickness + 2}" fill="white"/></g>`;
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
  // Maatlijnen horen op het tekenblad; lijndikte en tekstgrootte volgen de schaal
  // zodat ze op papier leesbaar blijven en niet met de tekening meeschalen.
  const annotations = scene.annotations
    .map((annotation) => {
      const d = dimensionGeometry(
        annotation.from,
        annotation.to,
        annotation.offset,
      );
      const helpers = d.extensions
        .map(
          (e) =>
            `<line x1="${e.from.x}" y1="${e.from.y}" x2="${e.to.x}" y2="${e.to.y}" stroke="#8a8f83" stroke-width="${0.2 * scale}"/>`,
        )
        .join("");
      return `<g>${helpers}<line x1="${d.line.from.x}" y1="${d.line.from.y}" x2="${d.line.to.x}" y2="${d.line.to.y}" stroke="#343b32" stroke-width="${0.3 * scale}"/><text x="${d.label.x}" y="${d.label.y}" transform="rotate(${d.label.angle} ${d.label.x} ${d.label.y})" text-anchor="middle" dy="${-1 * scale}" font-size="${2.5 * scale}" fill="#343b32">${escapeXml(formatMm(d.lengthMm))}</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><rect width="297" height="210" fill="white"/><g font-family="Arial,sans-serif" transform="translate(10 12) scale(${1 / scale}) translate(${-minX} ${-minY})">${walls}${cuts}${openings}${items}${annotations}</g><g font-family="Arial,sans-serif" fill="#343b32"><line x1="10" y1="180" x2="287" y2="180" stroke="#9b9c92" stroke-width="0.3"/><text x="10" y="190" font-size="5">STUDIO / Ontwerpblad</text><text x="10" y="198" font-size="3">Revisie ${scene.revision} · 1:${scale} · A4 liggend · Print op 100%</text><line id="scale-reference-${referenceMm}mm" x1="175" y1="195" x2="${175 + referenceMm / scale}" y2="195" stroke="#343b32" stroke-width="0.5"/><text x="175" y="191" font-size="3">${referenceMm.toLocaleString("nl-NL")} mm</text></g></svg>`;
}
