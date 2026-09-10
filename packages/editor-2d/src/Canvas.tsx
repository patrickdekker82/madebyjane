import { symbolPrimitives } from "../../geometry/src/symbol";
import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Line,
  Rect,
  Group,
  Text,
  Circle,
  Arc,
  Ellipse,
} from "react-konva";
import type Konva from "konva";
import type { Scene, Operation, Point } from "../../contracts/src/index";
import {
  endpoints,
  snapPoint,
  dimensionGeometry,
  formatMm,
  type SnapTarget,
} from "../../geometry/src/index";
import { useEditor } from "./store";
export function PlanCanvas({
  scene,
  onCommand,
  disabled,
}: {
  scene: Scene;
  onCommand: (ops: Operation[]) => void;
  disabled: boolean;
}) {
  const el = useRef<HTMLDivElement>(null),
    stage = useRef<Konva.Stage>(null),
    fitted = useRef(false);
  const [size, setSize] = useState({ width: 800, height: 650 });
  const [pan, setPan] = useState({ x: 95, y: 90 });
  const [start, setStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const {
    tool,
    selected,
    zoom,
    grid,
    objectSnap,
    select,
    toggleSelected,
    setZoom,
  } = useEditor();
  const [snapped, setSnapped] = useState<SnapTarget[]>([]);
  /**
   * Vangtolerantie: twaalf schermpixels omgerekend naar millimeters. Bij elke
   * zoomstand voelt het vangen daardoor even ver, terwijl de opgeslagen maat
   * nooit met de schermzoom vermenigvuldigd wordt.
   */
  // Verborgen objecten doen niet mee: niet tekenen, en niet vangen.
  const visible = scene.items.filter((i) => !i.hidden);
  const snapScene = { ...scene, items: visible };
  const snapTo = (point: Point, exclude?: string[]) =>
    snapPoint(snapScene, point, {
      toleranceMm: 12 / zoom,
      grid,
      exclude,
      kinds: objectSnap
        ? undefined
        : { node: false, wall: false, object: false },
    });
  /** Het hele plan met een rand van 60 px in beeld brengen. */
  const fitToProject = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const minX = Math.min(0, ...scene.nodes.map((n) => n.x)),
      minY = Math.min(0, ...scene.nodes.map((n) => n.y)),
      maxX = Math.max(6200, ...scene.nodes.map((n) => n.x)),
      maxY = Math.max(4800, ...scene.nodes.map((n) => n.y));
    const fit = Math.min(
      (width - 120) / (maxX - minX),
      (height - 120) / (maxY - minY),
    );
    setZoom(fit);
    setPan({ x: 60 - minX * fit, y: 60 - minY * fit });
  };
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
        if (!fitted.current && width > 0 && height > 0) {
          fitToProject(width, height);
          fitted.current = true;
        }
      }
    });
    if (el.current) ro.observe(el.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setStart(null);
  }, [tool]);
  const world = () => {
    const p = stage.current?.getPointerPosition();
    if (!p) return null;
    const result = snapTo({ x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom });
    setSnapped(result.targets);
    return { x: result.x, y: result.y };
  };
  const wallClick = (wallId: string) => {
    if (disabled) return;
    if (tool === "door" || tool === "window") {
      const p = world();
      if (!p) return;
      const wall = scene.walls.find((w) => w.id === wallId)!;
      const { a, b, length } = endpoints(scene, wall);
      const offset = Math.round(
        ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length - 450,
      );
      onCommand([
        {
          type: "AddOpening",
          opening: {
            id: crypto.randomUUID(),
            wallId,
            kind: tool,
            offset: Math.max(0, offset),
            width: 900,
            height: tool === "door" ? 2100 : 1400,
            sillHeight: tool === "door" ? 0 : 900,
            swing: "left",
          },
        },
      ]);
    } else if (tool === "select") select(wallId);
  };
  const click = () => {
    if (disabled || !stage.current) return;
    if (tool === "wall") {
      const p = world();
      if (!p) return;
      if (!start) {
        setStart(p);
        return;
      }
      const node = (point: Point) =>
        scene.nodes.find(
          (n) => Math.hypot(n.x - point.x, n.y - point.y) < 12 / zoom,
        ) ?? { id: crypto.randomUUID(), ...point };
      const a = node(start),
        b = node(p);
      onCommand([
        {
          type: "AddWall",
          start: a,
          end: b,
          wall: {
            id: crypto.randomUUID(),
            startId: a.id,
            endId: b.id,
            thickness: 180,
            height: 2700,
          },
        },
      ]);
      setStart(null);
    } else if (tool === "measure") {
      const p = world();
      if (!p) return;
      if (!start) {
        setStart(p);
        return;
      }
      if (p.x === start.x && p.y === start.y) return;
      onCommand([
        {
          type: "AddAnnotation",
          annotation: {
            type: "dimension",
            id: crypto.randomUUID(),
            from: start,
            to: p,
            // Vaste tekenafstand naast de gemeten lijn, aan de linkerzijde van
            // de tekenrichting. De hulplijnen verbinden hem met de meetpunten.
            offset: 400,
          },
        },
      ]);
      setStart(null);
    } else if (tool === "select") select(null);
  };
  const wheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stage.current?.getPointerPosition();
    if (!p) return;
    const next = Math.max(
      0.025,
      Math.min(0.3, zoom * (e.evt.deltaY > 0 ? 0.9 : 1.1)),
    );
    setPan({
      x: p.x - ((p.x - pan.x) / zoom) * next,
      y: p.y - ((p.y - pan.y) / zoom) * next,
    });
    setZoom(next);
  };
  const gridSpacing = (100 * zoom >= 8 ? 100 : 500) * zoom;
  // Een muurpunt of muur legt een concreet punt vast; dat verdient een markering.
  const anchor = snapped.find((t) => t.kind === "node" || t.kind === "wall");
  const snapMarker =
    anchor && cursor && tool === "wall"
      ? cursor
      : anchor && anchor.kind === "node"
        ? scene.nodes.find((n) => n.id === anchor.id)
        : null;
  return (
    <div
      ref={el}
      className={"canvas-wrap tool-" + tool}
      aria-label="Plattegrond. Gebruik de objectlijst als alternatief."
    >
      <Stage
        ref={stage}
        width={size.width}
        height={size.height}
        onWheel={wheel}
        onMouseMove={() => {
          if ((tool === "wall" || tool === "measure") && start)
            setCursor(world());
        }}
        onMouseDown={(e) => {
          // Meten en muren tekenen moeten juist op bestaande muren en punten
          // kunnen beginnen; anders is aansluiten op wat er staat onmogelijk.
          if (tool === "measure" || tool === "wall" || e.target === stage.current)
            click();
        }}
        onTouchStart={(e) => {
          if (e.target === stage.current) click();
        }}
      >
        <Layer listening={false}>
          {grid &&
            Array.from(
              { length: Math.ceil(size.width / gridSpacing) + 1 },
              (_, i) => (
                <Line
                  key={"x" + i}
                  points={[
                    i * gridSpacing + (pan.x % gridSpacing),
                    0,
                    i * gridSpacing + (pan.x % gridSpacing),
                    size.height,
                  ]}
                  stroke="#e5e4dc"
                  strokeWidth={0.5}
                />
              ),
            )}
          {grid &&
            Array.from(
              { length: Math.ceil(size.height / gridSpacing) + 1 },
              (_, i) => (
                <Line
                  key={"y" + i}
                  points={[
                    0,
                    i * gridSpacing + (pan.y % gridSpacing),
                    size.width,
                    i * gridSpacing + (pan.y % gridSpacing),
                  ]}
                  stroke="#e5e4dc"
                  strokeWidth={0.5}
                />
              ),
            )}
        </Layer>
        <Layer x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
          {scene.walls.map((w) => {
            const { a, b, length } = endpoints(scene, w);
            return (
              <Group key={w.id}>
                <Line
                  points={[a.x, a.y, b.x, b.y]}
                  stroke={selected.includes(w.id) ? "#b47b45" : "#465044"}
                  strokeWidth={w.thickness}
                  hitStrokeWidth={Math.max(20 / zoom, w.thickness)}
                  onClick={() => wallClick(w.id)}
                  onTap={() => wallClick(w.id)}
                />
                <Text
                  listening={false}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 230}
                  text={Math.round(length).toLocaleString("nl-NL")}
                  fontSize={11 / zoom}
                  fill="#697164"
                />
              </Group>
            );
          })}
          {scene.openings.map((o) => {
            const w = scene.walls.find((w) => w.id === o.wallId)!;
            const { a, angle } = endpoints(scene, w);
            return (
              <Group
                key={o.id}
                x={a.x + Math.cos(angle) * o.offset}
                y={a.y + Math.sin(angle) * o.offset}
                rotation={(angle * 180) / Math.PI}
                onClick={() => select(o.id)}
              >
                <Rect
                  x={0}
                  y={-w.thickness / 2 - 2}
                  width={o.width}
                  height={w.thickness + 4}
                  fill="#f5f3ec"
                />
                {o.kind === "window" ? (
                  <>
                    <Line
                      points={[0, -40, o.width, -40]}
                      stroke="#7c9b9f"
                      strokeWidth={18}
                    />
                    <Line
                      points={[0, 40, o.width, 40]}
                      stroke="#7c9b9f"
                      strokeWidth={18}
                    />
                  </>
                ) : (
                  <>
                    <Line
                      points={[0, 0, 0, o.width]}
                      stroke="#927952"
                      strokeWidth={24}
                    />
                    <Arc
                      innerRadius={o.width}
                      outerRadius={o.width + 10}
                      angle={90}
                      rotation={0}
                      fill="#927952"
                    />
                  </>
                )}
              </Group>
            );
          })}
          {visible.map((i) => (
            <Group
              key={i.id}
              x={i.x}
              y={i.y}
              rotation={i.rotation}
              draggable={!disabled && tool === "select" && !i.locked}
              onClick={(e) => {
                if (tool !== "select") return;
                if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)
                  toggleSelected(i.id);
                else select(i.id);
              }}
              onTap={() => select(i.id)}
              onDragStart={() => {
                if (!useEditor.getState().selected.includes(i.id)) select(i.id);
              }}
              onDragMove={(e) => {
                setSnapped(
                  snapTo({ x: e.target.x(), y: e.target.y() }, [i.id]).targets,
                );
              }}
              onDragEnd={(e) => {
                const { x, y } = snapTo(
                  { x: e.target.x(), y: e.target.y() },
                  [i.id],
                );
                e.target.position({ x, y });
                setSnapped([]);
                onCommand([
                  {
                    type: "TransformItem",
                    id: i.id,
                    x,
                    y,
                    width: i.width,
                    depth: i.depth,
                    rotation: i.rotation,
                    custom: i.custom,
                  },
                ]);
              }}
            >
              {i.symbol ? (
                <>
                  <Rect
                    x={-i.width / 2}
                    y={-i.depth / 2}
                    width={i.width}
                    height={i.depth}
                    fill="rgba(0,0,0,0)"
                    stroke={selected.includes(i.id) ? "#a36432" : undefined}
                    strokeWidth={2 / zoom}
                  />
                  {symbolPrimitives(i.symbol, i.width, i.depth).map(
                    (shape, index) =>
                      shape.type === "line" ? (
                        <Line
                          key={index}
                          listening={false}
                          points={[shape.x, shape.y, shape.endX, shape.endY]}
                          stroke={shape.stroke}
                          strokeWidth={shape.strokeWidth}
                        />
                      ) : shape.type === "ellipse" ? (
                        <Ellipse
                          key={index}
                          listening={false}
                          x={shape.x + shape.width / 2}
                          y={shape.y + shape.height / 2}
                          radiusX={shape.width / 2}
                          radiusY={shape.height / 2}
                          fill={shape.fill}
                          stroke={shape.stroke}
                          strokeWidth={shape.strokeWidth}
                        />
                      ) : (
                        <Rect
                          key={index}
                          listening={false}
                          x={shape.x}
                          y={shape.y}
                          width={shape.width}
                          height={shape.height}
                          fill={shape.fill}
                          stroke={shape.stroke}
                          strokeWidth={shape.strokeWidth}
                        />
                      ),
                  )}
                </>
              ) : (
                <Rect
                  x={-i.width / 2}
                  y={-i.depth / 2}
                  width={i.width}
                  height={i.depth}
                  cornerRadius={i.kind === "table" ? 100 : 60}
                  fill={i.color}
                  stroke={selected.includes(i.id) ? "#a36432" : "#756f61"}
                  strokeWidth={selected.includes(i.id) ? 3 / zoom : 1 / zoom}
                />
              )}
              {!i.symbol && i.kind === "sofa" && (
                <>
                  <Rect
                    listening={false}
                    x={-i.width / 2 + 90}
                    y={-i.depth / 2 + 90}
                    width={i.width - 180}
                    height={180}
                    cornerRadius={40}
                    fill="#ffffff44"
                  />
                  <Line
                    listening={false}
                    points={[0, -i.depth / 2 + 300, 0, i.depth / 2 - 70]}
                    stroke="#756f6170"
                    strokeWidth={15}
                  />
                </>
              )}
              <Text
                listening={false}
                x={-i.width / 2}
                y={-40}
                width={i.width}
                align="center"
                text={
                  i.kind === "sofa"
                    ? "BANK"
                    : i.kind === "table"
                      ? "TAFEL"
                      : i.kind === "light"
                        ? "LICHT"
                        : "KAST"
                }
                fontSize={Math.min(115, 11 / zoom)}
                fill="#393c33"
              />
              {selected.includes(i.id) && (
                <Circle
                  x={i.width / 2}
                  y={i.depth / 2}
                  radius={4 / zoom}
                  fill="#a36432"
                />
              )}
            </Group>
          ))}
          {tool === "wall" && start && cursor && (
            <Line
              listening={false}
              points={[start.x, start.y, cursor.x, cursor.y]}
              stroke="#a36432"
              strokeWidth={180}
              opacity={0.5}
            />
          )}
          {scene.annotations.map((annotation) => {
            const d = dimensionGeometry(
              annotation.from,
              annotation.to,
              annotation.offset,
            );
            const chosen = selected.includes(annotation.id);
            return (
              <Group key={annotation.id} onClick={() => select(annotation.id)}>
                {d.extensions.map((extension, index) => (
                  <Line
                    key={index}
                    listening={false}
                    points={[
                      extension.from.x,
                      extension.from.y,
                      extension.to.x,
                      extension.to.y,
                    ]}
                    stroke="#8a8f83"
                    strokeWidth={1 / zoom}
                  />
                ))}
                <Line
                  points={[
                    d.line.from.x,
                    d.line.from.y,
                    d.line.to.x,
                    d.line.to.y,
                  ]}
                  stroke={chosen ? "#a36432" : "#4c5148"}
                  strokeWidth={(chosen ? 2 : 1) / zoom}
                  hitStrokeWidth={20 / zoom}
                />
                <Text
                  listening={false}
                  x={d.label.x}
                  y={d.label.y}
                  offsetY={14 / zoom}
                  rotation={d.label.angle}
                  text={formatMm(d.lengthMm)}
                  fontSize={12 / zoom}
                  align="center"
                  width={2000}
                  offsetX={1000}
                  fill="#4c5148"
                />
              </Group>
            );
          })}
          {tool === "measure" && start && cursor && (
            <>
              <Line
                listening={false}
                points={[start.x, start.y, cursor.x, cursor.y]}
                stroke="#a36432"
                strokeWidth={1 / zoom}
                dash={[10 / zoom, 6 / zoom]}
              />
              <Text
                listening={false}
                x={(start.x + cursor.x) / 2}
                y={(start.y + cursor.y) / 2}
                offsetY={14 / zoom}
                text={formatMm(
                  Math.round(Math.hypot(cursor.x - start.x, cursor.y - start.y)),
                )}
                fontSize={12 / zoom}
                align="center"
                width={2000}
                offsetX={1000}
                fill="#a36432"
              />
            </>
          )}
          {/* Vangfeedback: hulplijnen bij uitlijnen, een markering op het vangpunt. */}
          {snapped.map((target, index) =>
            target.guide ? (
              <Line
                key={"guide" + index}
                listening={false}
                points={[
                  target.guide.from.x,
                  target.guide.from.y,
                  target.guide.to.x,
                  target.guide.to.y,
                ]}
                stroke="#a36432"
                strokeWidth={1 / zoom}
                dash={[8 / zoom, 6 / zoom]}
              />
            ) : null,
          )}
          {snapMarker && (
            <Circle
              listening={false}
              x={snapMarker.x}
              y={snapMarker.y}
              radius={5 / zoom}
              stroke="#a36432"
              strokeWidth={2 / zoom}
            />
          )}
        </Layer>
      </Stage>
      <div className="canvas-note">
        {tool === "wall"
          ? start
            ? "Klik het eindpunt · klik op een bestaand punt om aan te sluiten"
            : "Klik het beginpunt van de muur"
          : tool === "door" || tool === "window"
            ? "Klik op een muur om de opening te plaatsen"
            : "Sleep meubels · scroll om te zoomen"}
      </div>
      <div className="canvas-pan">
        <button
          onClick={() => setPan((p) => ({ ...p, x: p.x + 70 }))}
          aria-label="Beeld naar rechts"
        >
          →
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, x: p.x - 70 }))}
          aria-label="Beeld naar links"
        >
          ←
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, y: p.y + 70 }))}
          aria-label="Beeld naar beneden"
        >
          ↓
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, y: p.y - 70 }))}
          aria-label="Beeld naar boven"
        >
          ↑
        </button>
        <button onClick={() => fitToProject(size.width, size.height)}>
          Passend
        </button>
      </div>
    </div>
  );
}
