import { useState } from "react";
import {
  symbolShapeSchema,
  type SymbolShape,
} from "../../../packages/contracts/src/index";
import { symbolPrimitives } from "../../../packages/geometry/src/symbol";
export function SymbolEditor({
  shapes,
  onChange,
  width,
  depth,
  disabled,
}: {
  shapes: SymbolShape[];
  onChange: (shapes: SymbolShape[]) => void;
  width: number;
  depth: number;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState(0),
    [draftState, setDraftState] = useState<{
      shape: SymbolShape;
      values: Record<string, string>;
    } | null>(null),
    [error, setError] = useState("");
  const current = shapes[selected];
  const draft = draftState && draftState.shape === current
    ? draftState.values
    : Object.fromEntries(Object.entries(current ?? {}).map(([key, value]) => [
        key, typeof value === "number" ? String(value / 10) : value,
      ]));
  const setDraft = (values: Record<string, string>) => {
    if (current) setDraftState({ shape: current, values });
  };
  const select = (index: number) => {
    setSelected(index);
    setDraftState(null);
    setError("");
  };
  const add = (type: SymbolShape["type"]) => {
    if (shapes.length >= 32) return;
    const style = { stroke: "#393c33", strokeWidth: 5 };
    const next: SymbolShape =
      type === "line"
        ? { type, x: 100, y: 500, endX: 900, endY: 500, ...style }
        : {
            type,
            x: 100,
            y: 100,
            width: 800,
            height: 800,
            fill: "#c4b39d",
            ...style,
          };
    onChange([...shapes, next]);
    select(shapes.length);
  };
  const apply = () => {
    if (!current) return;
    const result = symbolShapeSchema.safeParse(
      Object.fromEntries(
        Object.entries(draft).map(([k, v]) => [
          k,
          ["type", "fill", "stroke"].includes(k)
            ? v
            : Math.round(Number(v.replace(",", ".")) * 10),
        ]),
      ),
    );
    if (!result.success) {
      setError(
        "Houd vormen binnen 0–100% en gebruik een positieve maat. Lijndikte: 0,1–3%.",
      );
      return;
    }
    onChange(shapes.map((s, i) => (i === selected ? result.data : s)));
    setError("");
  };
  return (
    <fieldset disabled={disabled} className="symbol-editor">
      <legend>Eigen 2D-symbool</legend>
      <p className="small">
        Vormen volgen de meubelbreedte en -diepte. Posities en maten hieronder
        zijn percentages. Pas een vorm toe voordat je de bibliotheekversie
        bewaart. Zonder gekoppeld 3D-model gebruikt 3D een blokvorm.
      </p>
      <svg
        role="img"
        aria-label="Symboolvoorbeeld"
        viewBox={`${-width / 2 - 20} ${-depth / 2 - 20} ${width + 40} ${depth + 40}`}
        style={{
          width: "100%",
          height: 180,
          background: "#f1f0e8",
          border: "1px solid #ddd",
        }}
      >
        <rect
          x={-width / 2}
          y={-depth / 2}
          width={width}
          height={depth}
          fill="none"
          stroke="#aaa"
          strokeWidth={2}
        />
        {symbolPrimitives(shapes, width, depth).map((s, i) => {
          const common = {
            onClick: () => !disabled && select(i),
            stroke: selected === i ? "#a36432" : s.stroke,
            strokeWidth: s.strokeWidth,
          };
          return s.type === "line" ? (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={s.endX}
              y2={s.endY}
              {...common}
            />
          ) : s.type === "ellipse" ? (
            <ellipse
              key={i}
              cx={s.x + s.width / 2}
              cy={s.y + s.height / 2}
              rx={s.width / 2}
              ry={s.height / 2}
              fill={s.fill}
              {...common}
            />
          ) : (
            <rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
              fill={s.fill}
              {...common}
            />
          );
        })}
      </svg>
      <div className="symbol-actions">
        {(["rect", "ellipse", "line"] as const).map((type, i) => (
          <button
            type="button"
            key={type}
            disabled={disabled || shapes.length >= 32}
            onClick={() => add(type)}
          >
            {["Rechthoek toevoegen", "Ellips toevoegen", "Lijn toevoegen"][i]}
          </button>
        ))}
      </div>
      {shapes.length > 0 && (
        <label>
          Vorm
          <select
            aria-label="Symboolvorm"
            value={selected}
            onChange={(e) => select(Number(e.target.value))}
          >
            {shapes.map((shape, i) => (
              <option key={i} value={i}>
                Vorm {i + 1} ·{" "}
                {shape.type === "rect"
                  ? "rechthoek"
                  : shape.type === "ellipse"
                    ? "ellips"
                    : "lijn"}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <>
          <div className="property-row">
            {(current.type === "line"
              ? ["x", "y", "endX", "endY", "strokeWidth"]
              : ["x", "y", "width", "height", "strokeWidth"]
            ).map((field) => (
              <label key={field}>
                {
                  (
                    {
                      x: "Positie X",
                      y: "Positie Y",
                      endX: "Einde X",
                      endY: "Einde Y",
                      width: "Breedte",
                      height: "Diepte",
                      strokeWidth: "Lijndikte",
                    } as Record<string, string>
                  )[field]
                }{" "}
                %
                <input
                  aria-label={"Symbool " + field}
                  inputMode="decimal"
                  value={draft[field] ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      apply();
                    }
                  }}
                />
              </label>
            ))}
          </div>
          {["stroke", ...(current.type !== "line" ? ["fill"] : [])].map(
            (field) => (
              <label key={field}>
                {field === "stroke" ? "Lijnkleur" : "Vulkleur"}
                <input
                  type="color"
                  aria-label={"Symbool " + field}
                  value={draft[field] ?? "#393c33"}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                />
              </label>
            ),
          )}
          <button type="button" onClick={apply}>
            Vorm toepassen
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(shapes.filter((_, i) => i !== selected));
              select(Math.max(0, selected - 1));
            }}
          >
            Vorm verwijderen
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
