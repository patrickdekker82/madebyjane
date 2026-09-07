import type { SymbolShape } from "../../contracts/src/index";
/** Expand safe normalized shapes into the exact local millimetre footprint. */
export function symbolPrimitives(
  shapes: SymbolShape[],
  width: number,
  depth: number,
) {
  return shapes.map((shape) => {
    const base = {
      ...shape,
      x: (shape.x * width) / 1000 - width / 2,
      y: (shape.y * depth) / 1000 - depth / 2,
      strokeWidth: (shape.strokeWidth * Math.min(width, depth)) / 1000,
    };
    return shape.type === "line"
      ? {
          ...base,
          type: "line" as const,
          endX: (shape.endX * width) / 1000 - width / 2,
          endY: (shape.endY * depth) / 1000 - depth / 2,
        }
      : {
          ...base,
          type: shape.type,
          width: (shape.width * width) / 1000,
          height: (shape.height * depth) / 1000,
          fill: shape.fill,
        };
  });
}
export function symbolSvg(shapes: SymbolShape[], width: number, depth: number) {
  return symbolPrimitives(shapes, width, depth)
    .map((s) => {
      const style = `stroke="${s.stroke}" stroke-width="${s.strokeWidth}"`;
      if (s.type === "line")
        return `<line x1="${s.x}" y1="${s.y}" x2="${s.endX}" y2="${s.endY}" ${style}/>`;
      if (s.type === "ellipse")
        return `<ellipse cx="${s.x + s.width / 2}" cy="${s.y + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}" fill="${s.fill}" ${style}/>`;
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.fill}" ${style}/>`;
    })
    .join("");
}
