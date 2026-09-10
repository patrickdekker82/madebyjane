import { symbolSvg } from "../../geometry/src/symbol";
import {
  fixtureKinds,
  itemLayers,
  type FixtureKind,
  type Scene,
} from "../../contracts/src/index";
import {
  endpoints,
  wallOutlines,
  dimensionGeometry,
  formatMm,
  ledLengthMm,
  ledCornerCount,
  ledSegments,
  beamFootprint,
  beamBounds,
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
export function planSvg(
  scene: Scene,
  scale: 20 | 50 | 100 = 50,
  options: { beams?: boolean } = {},
) {
  /**
   * Bij een armatuur wordt het symbool op zijn papiermaat getekend en niet op
   * de fysieke maat: een spot van 90 mm zou op 1:50 minder dan twee tienden
   * millimeter zijn. De fysieke maat blijft in de eigenschappen staan.
   */
  const box = (item: Scene["items"][number]) =>
    item.fixture
      ? { width: item.fixture.symbolSizeMm, depth: item.fixture.symbolSizeMm }
      : { width: item.width, depth: item.depth };
  const all = [
    ...scene.nodes,
    ...scene.annotations.flatMap((a) => {
      if (a.type === "note") return [{ x: a.x, y: a.y }];
      const d = dimensionGeometry(a.from, a.to, a.offset);
      return [a.from, a.to, d.line.from, d.line.to];
    }),
    ...scene.ledPaths.filter((l) => !l.hidden).flatMap((l) => l.points),
    ...(options.beams
      ? scene.items
          .filter((i) => !i.hidden)
          .flatMap((i) => {
            const footprint = beamFootprint(i);
            if (!footprint) return [];
            const b = beamBounds(footprint);
            return [
              { x: b.minX, y: b.minY },
              { x: b.maxX, y: b.maxY },
            ];
          })
      : []),
    ...scene.items
      .filter((i) => !i.hidden)
      .flatMap((i) => [
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
  const outlines = new Map(
    wallOutlines(scene).map((o) => [o.wallId, o.points]),
  );
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
  // Verborgen objecten horen niet op het blad; anders belooft de legenda iets
  // anders dan de tekening laat zien.
  const items = scene.items
    .filter((i) => !i.hidden)
    .map(
      (i) =>
        `<g transform="translate(${i.x},${i.y}) rotate(${i.rotation})">${i.symbol ? symbolSvg(i.symbol, box(i).width, box(i).depth) : `<rect x="${-i.width / 2}" y="${-i.depth / 2}" width="${i.width}" height="${i.depth}" rx="50" fill="${i.color}" stroke="#4c5148" stroke-width="15"/>`}${i.fixture ? "" : `<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-size="${2.5 * scale}">${escapeXml(i.name)}</text>`}</g>`,
    )
    .join("");
  /**
   * Lichtbundels: transparante vlakken onder de symbolen, met de richting van
   * het armatuur. Ze staan alleen op het blad wanneer ze ook in de editor aan
   * staan, en de legenda zegt erbij dat het een benadering is.
   */
  const beamShapes = !options.beams
    ? ""
    : scene.items
        .filter((i) => !i.hidden)
        .map((i) => {
          const footprint = beamFootprint(i);
          if (!footprint) return "";
          const tint = i.fixture?.colorTemperatureK ? "#ffd9a0" : "#e6d9b8";
          const opacity = 0.1 + (0.22 * (i.fixture?.dimLevel ?? 100)) / 100;
          if (footprint.shape === "circle")
            return `<circle cx="${footprint.x}" cy="${footprint.y}" r="${footprint.radiusMm}" fill="${tint}" opacity="${opacity.toFixed(3)}"/>`;
          const point = (deg: number) => ({
            x:
              footprint.x +
              footprint.radiusMm * Math.cos((deg * Math.PI) / 180),
            y:
              footprint.y +
              footprint.radiusMm * Math.sin((deg * Math.PI) / 180),
          });
          const a = point(footprint.fromDeg),
            b = point(footprint.toDeg);
          const large = footprint.toDeg - footprint.fromDeg > 180 ? 1 : 0;
          return `<path d="M ${footprint.x} ${footprint.y} L ${a.x} ${a.y} A ${footprint.radiusMm} ${footprint.radiusMm} 0 ${large} 1 ${b.x} ${b.y} Z" fill="${tint}" opacity="${opacity.toFixed(3)}"/>`;
        })
        .join("");
  /**
   * LED-strips: een doorlopende lijn met ronde hoeken in de kleur van de strip,
   * met de gemeten lengte erbij. De lijndikte is een papiermaat en zegt niets
   * over de fysieke breedte van de strip; die staat in de eigenschappen.
   */
  const leds = scene.ledPaths
    .filter((l) => !l.hidden)
    .map((l) => {
      const points = l.points.map((p) => `${p.x},${p.y}`).join(" ");
      // Het label komt midden op het langste stuk: daar is de meeste ruimte,
      // en niet in een hoek waar het over de knik heen valt.
      const longest = ledSegments(l.points).reduce((a, b) =>
        b.lengthMm > a.lengthMm ? b : a,
      );
      const middle = {
        x: (longest.from.x + longest.to.x) / 2,
        y: (longest.from.y + longest.to.y) / 2,
      };
      return `<g><polyline points="${points}" fill="none" stroke="${escapeXml(l.color)}" stroke-width="${1.4 * scale}" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/><polyline points="${points}" fill="none" stroke="#6b5b3a" stroke-width="${0.25 * scale}" stroke-dasharray="${2 * scale} ${1.2 * scale}" stroke-linecap="round" stroke-linejoin="round"/><text x="${middle.x}" y="${middle.y}" dy="${-1.6 * scale}" text-anchor="middle" font-size="${2.2 * scale}" fill="#6b5b3a">${escapeXml(l.name)} · ${escapeXml(formatMm(Math.round(ledLengthMm(l.points))))}</text></g>`;
    })
    .join("");
  // Maatlijnen horen op het tekenblad; lijndikte en tekstgrootte volgen de schaal
  // zodat ze op papier leesbaar blijven en niet met de tekening meeschalen.
  const annotations = scene.annotations
    .map((annotation) => {
      if (annotation.type === "note")
        return `<text x="${annotation.x}" y="${annotation.y}" font-size="${2.5 * scale}" fill="#343b32">${escapeXml(annotation.text)}</text>`;
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
  /**
   * Legenda: welke lagen op dit blad staan en welke bewust verborgen zijn.
   * Zo is aan het blad zelf te zien dat er iets ontbreekt, in plaats van dat
   * een lezer een onvolledige tekening voor compleet aanziet.
   */
  const byLayer = new Map<string, { shown: number; hidden: number }>();
  for (const item of scene.items) {
    const label = itemLayers[item.layer ?? "furniture"];
    const entry = byLayer.get(label) ?? { shown: 0, hidden: 0 };
    entry[item.hidden ? "hidden" : "shown"] += 1;
    byLayer.set(label, entry);
  }
  /**
   * LED-strips staan niet in de laagtelling van meubels, maar horen wel in de
   * legenda: het lichtplan is juist wat een lezer op dit blad zoekt.
   */
  const shownLeds = scene.ledPaths.filter((l) => !l.hidden);
  const hiddenLeds = scene.ledPaths.length - shownLeds.length;
  if (scene.ledPaths.length) {
    const metres = (
      shownLeds.reduce((total, l) => total + ledLengthMm(l.points), 0) / 1000
    ).toLocaleString("nl-NL", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    const corners = shownLeds.reduce(
      (total, l) => total + ledCornerCount(l.points),
      0,
    );
    byLayer.set(
      `LED-strips: ${shownLeds.length} · ${metres} m · ${corners} ${corners === 1 ? "hoek" : "hoeken"}`,
      { shown: -1, hidden: hiddenLeds },
    );
  }
  const legendRows = [...byLayer]
    .filter(([, counts]) => counts.shown || counts.hidden)
    .sort(([a], [b]) => a.localeCompare(b, "nl-NL"));
  /**
   * Symbolenlegenda: elk soort punt dat op dit blad staat, met het teken zelf
   * ernaast. Zo hoeft niemand te raden wat een rondje met een kruis betekent.
   * Dit stond sinds fase 2 open en kon pas met deze symbolen worden gemaakt.
   */
  const kinds = new Map<FixtureKind, number>();
  for (const item of scene.items)
    if (item.fixture && !item.hidden)
      kinds.set(item.fixture.kind, (kinds.get(item.fixture.kind) ?? 0) + 1);
  const symbolLegend = [...kinds]
    .sort(([a], [b]) => fixtureKinds[a].localeCompare(fixtureKinds[b], "nl-NL"))
    .map(([kind, count], index) => {
      const y = 188 + index * 4;
      const shapes = scene.items.find(
        (i) => i.fixture?.kind === kind && i.symbol && !i.hidden,
      )?.symbol;
      // Het teken wordt op 3,2 mm getekend en op de tekstregel gecentreerd.
      const drawing = shapes
        ? `<g transform="translate(205 ${y - 2.4}) scale(0.0032)">${symbolSvg(shapes, 1000, 1000)}</g>`
        : "";
      return `${drawing}<text x="210" y="${y}" font-size="3">${escapeXml(fixtureKinds[kind])} × ${count}</text>`;
    })
    .join("");
  const legend = legendRows
    .map(([label, counts], index) => {
      // shown = -1 markeert een regel die het aantal al in het label draagt.
      const text =
        counts.shown === -1
          ? `${label}${counts.hidden ? `, ${counts.hidden} verborgen` : ""}`
          : `${label}: ${counts.shown} getoond${counts.hidden ? `, ${counts.hidden} verborgen` : ""}`;
      return `<text x="120" y="${188 + index * 4}" font-size="3">${escapeXml(text)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><rect width="297" height="210" fill="white"/><g font-family="Arial,sans-serif" transform="translate(10 12) scale(${1 / scale}) translate(${-minX} ${-minY})">${walls}${cuts}${openings}${beamShapes}${leds}${items}${annotations}</g><g font-family="Arial,sans-serif" fill="#343b32"><line x1="10" y1="180" x2="287" y2="180" stroke="#9b9c92" stroke-width="0.3"/><text x="10" y="190" font-size="5">STUDIO / Ontwerpblad</text><text x="10" y="197" font-size="3">Revisie ${scene.revision} · 1:${scale} · A4 liggend · Print op 100%</text>${options.beams ? `<text x="10" y="202" font-size="3" fill="#697164">Lichtbundels getoond: visuele benadering, geen lichtberekening.</text>` : ""}<text x="10" y="205.5" font-size="3">${referenceMm.toLocaleString("nl-NL")} mm</text><line id="scale-reference-${referenceMm}mm" x1="10" y1="208" x2="${10 + referenceMm / scale}" y2="208" stroke="#343b32" stroke-width="0.5"/><text x="120" y="184" font-size="3" fill="#697164">LEGENDA</text>${legend}${kinds.size ? `<text x="205" y="184" font-size="3" fill="#697164">SYMBOLEN</text>${symbolLegend}` : ""}</g></svg>`;
}
