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
import { endpoints, snap } from "../../geometry/src/index";
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
  const { tool, selected, zoom, grid, select, setZoom } = useEditor();
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
        if (!fitted.current && width > 0 && height > 0) {
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
    const x = (p.x - pan.x) / zoom,
      y = (p.y - pan.y) / zoom;
    return {
      x: grid ? snap(x) : Math.round(x),
      y: grid ? snap(y) : Math.round(y),
    };
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
    } else select(wallId);
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
          if (tool === "wall" && start) setCursor(world());
        }}
        onMouseDown={(e) => {
          if (e.target === stage.current) click();
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
                  stroke={selected === w.id ? "#b47b45" : "#465044"}
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
          {scene.items.map((i) => (
            <Group
              key={i.id}
              x={i.x}
              y={i.y}
              rotation={i.rotation}
              draggable={!disabled && tool === "select"}
              onClick={() => select(i.id)}
              onTap={() => select(i.id)}
              onDragStart={() => select(i.id)}
              onDragEnd={(e) => {
                const x = grid ? snap(e.target.x()) : Math.round(e.target.x()),
                  y = grid ? snap(e.target.y()) : Math.round(e.target.y());
                e.target.position({ x, y });
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
                    stroke={selected === i.id ? "#a36432" : undefined}
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
                  stroke={selected === i.id ? "#a36432" : "#756f61"}
                  strokeWidth={selected === i.id ? 3 / zoom : 1 / zoom}
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
              {selected === i.id && (
                <Circle
                  x={i.width / 2}
                  y={i.depth / 2}
                  radius={4 / zoom}
                  fill="#a36432"
                />
              )}
            </Group>
          ))}
          {start && cursor && (
            <Line
              listening={false}
              points={[start.x, start.y, cursor.x, cursor.y]}
              stroke="#a36432"
              strokeWidth={180}
              opacity={0.5}
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
        <button
          onClick={() => {
            const maxX = Math.max(6200, ...scene.nodes.map((n) => n.x)),
              maxY = Math.max(4800, ...scene.nodes.map((n) => n.y));
            setZoom(
              Math.min((size.width - 150) / maxX, (size.height - 150) / maxY),
            );
            setPan({ x: 75, y: 75 });
          }}
        >
          Passend
        </button>
      </div>
    </div>
  );
}
