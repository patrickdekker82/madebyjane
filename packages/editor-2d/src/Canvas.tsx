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
  Image as KonvaImage,
} from "react-konva";
import type Konva from "konva";
import type { Scene, Operation, Point } from "../../contracts/src/index";
import {
  endpoints,
  snapPoint,
  itemsInRect,
  wallOutlines,
  underlayPlacement,
  worldToUnderlay,
  dimensionGeometry,
  formatMm,
  type SnapTarget,
} from "../../geometry/src/index";
import { useEditor } from "./store";
export function PlanCanvas({
  scene,
  onCommand,
  onCalibrate,
  disabled,
}: {
  scene: Scene;
  onCommand: (ops: Operation[]) => void;
  /** Twee aangewezen punten op de onderlegger, in afbeeldingspixels. */
  onCalibrate?: (from: Point, to: Point) => void;
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
    selectMany,
    setZoom,
  } = useEditor();
  const [snapped, setSnapped] = useState<SnapTarget[]>([]);
  const [underlayImage, setUnderlayImage] = useState<HTMLImageElement | null>(
    null,
  );
  /** Sleepkader in wereldcoordinaten; alleen actief met het gereedschap Selecteren. */
  const [band, setBand] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
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
    // Maatlijnen en de onderlegger liggen naast de geometrie en kunnen er dus
    // buiten steken; ook die horen in beeld te komen.
    const underlayCorners = scene.underlay
      ? (({ x, y, width, height }) => [
          { x, y },
          { x: x + width, y: y + height },
        ])(underlayPlacement(scene.underlay))
      : [];
    const points = [
      ...scene.nodes,
      ...underlayCorners,
      ...scene.annotations.flatMap((a) => {
        const d = dimensionGeometry(a.from, a.to, a.offset);
        return [a.from, a.to, d.line.from, d.line.to];
      }),
    ];
    const minX = Math.min(0, ...points.map((n) => n.x)),
      minY = Math.min(0, ...points.map((n) => n.y)),
      maxX = Math.max(6200, ...points.map((n) => n.x)),
      maxY = Math.max(4800, ...points.map((n) => n.y));
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
  /**
   * De onderlegger wordt met fetch opgehaald in plaats van via een img-src,
   * omdat een img geen werkruimte-header kan meesturen. De autorisatie op de
   * route blijft daardoor precies zoals bij alle andere gegevens. De blob-URL
   * is same-origin en wordt weer vrijgegeven zodra de afbeelding wisselt.
   */
  const assetId = scene.underlay?.assetId ?? null,
    organizationId = scene.organizationId;
  useEffect(() => {
    if (!assetId) {
      setUnderlayImage(null);
      return;
    }
    let url = "";
    const image = new window.Image();
    const load = async () => {
      const response = await fetch("/api/v1/underlay-assets/" + assetId, {
        credentials: "same-origin",
        headers: { "x-organization-id": organizationId },
      });
      if (!response.ok) return;
      url = URL.createObjectURL(await response.blob());
      image.onload = () => setUnderlayImage(image);
      image.src = url;
    };
    void load();
    return () => {
      image.onload = null;
      setUnderlayImage(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId, organizationId]);
  const rawWorld = () => {
    const p = stage.current?.getPointerPosition();
    return p ? { x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom } : null;
  };
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
    } else if (tool === "calibrate") {
      const underlay = scene.underlay;
      if (!underlay) return;
      const p = rawWorld();
      if (!p) return;
      if (!start) {
        setStart(p);
        return;
      }
      if (p.x === start.x && p.y === start.y) return;
      // De twee punten worden in afbeeldingspixels bewaard, zodat de kalibratie
      // blijft kloppen wanneer de onderlegger later verschoven wordt.
      onCalibrate?.(worldToUnderlay(underlay, start), worldToUnderlay(underlay, p));
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
  // Versneden muurcontouren: dikke lijnen met stompe uiteinden laten in elke
  // hoek een hap open.
  const outlines = new Map(
    wallOutlines(scene).map((o) => [o.wallId, o.points]),
  );
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
          if (tool === "calibrate" && start) setCursor(rawWorld());
          if (band) {
            const p = rawWorld();
            if (p) setBand({ ...band, x2: p.x, y2: p.y });
          }
        }}
        onMouseUp={() => {
          if (!band) return;
          const dragged =
            Math.abs(band.x2 - band.x1) > 5 / zoom ||
            Math.abs(band.y2 - band.y1) > 5 / zoom;
          // Een klik zonder sleep blijft gewoon de selectie opheffen.
          if (dragged) selectMany(itemsInRect(visible, band));
          else select(null);
          setBand(null);
        }}
        onMouseDown={(e) => {
          // Meten en muren tekenen moeten juist op bestaande muren en punten
          // kunnen beginnen; anders is aansluiten op wat er staat onmogelijk.
          if (tool === "measure" || tool === "wall" || tool === "calibrate")
            return click();
          if (e.target !== stage.current) return;
          if (tool !== "select") return click();
          const p = rawWorld();
          if (p) setBand({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
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
        <Layer x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom} listening={false}>
          {scene.underlay &&
            underlayImage &&
            (({ x, y, width, height }) => (
              <KonvaImage
                image={underlayImage}
                x={x}
                y={y}
                width={width}
                height={height}
                opacity={scene.underlay!.opacity / 100}
              />
            ))(underlayPlacement(scene.underlay))}
        </Layer>
        <Layer x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
          {scene.walls.map((w) => {
            const { a, b, length } = endpoints(scene, w);
            const outline = outlines.get(w.id);
            return (
              <Group key={w.id}>
                <Line
                  points={(outline ?? []).flatMap((p) => [p.x, p.y])}
                  closed
                  fill={selected.includes(w.id) ? "#b47b45" : "#465044"}
                  // Een dunne muur is bij uitzoomen maar enkele pixels breed;
                  // deze trefzone rond de contour houdt hem aanwijsbaar.
                  hitStrokeWidth={20 / zoom}
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
          {tool === "calibrate" && start && cursor && (
            <Line
              listening={false}
              points={[start.x, start.y, cursor.x, cursor.y]}
              stroke="#2f6f8f"
              strokeWidth={2 / zoom}
            />
          )}
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
          {band && (
            <Rect
              listening={false}
              x={Math.min(band.x1, band.x2)}
              y={Math.min(band.y1, band.y2)}
              width={Math.abs(band.x2 - band.x1)}
              height={Math.abs(band.y2 - band.y1)}
              fill="#a3643222"
              stroke="#a36432"
              strokeWidth={1 / zoom}
              dash={[8 / zoom, 6 / zoom]}
            />
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
