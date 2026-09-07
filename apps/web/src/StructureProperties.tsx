import { useState } from "react";
import type { Scene, Operation } from "../../../packages/contracts/src/index";
import {
  endpoints,
  parseDutchNumber,
} from "../../../packages/geometry/src/index";
export function StructureProperties({
  scene,
  selected,
  disabled,
  onCommand,
}: {
  scene: Scene;
  selected: string;
  disabled: boolean;
  onCommand: (ops: Operation[]) => void;
}) {
  const [error, setError] = useState("");
  const wall = scene.walls.find((w) => w.id === selected),
    opening = scene.openings.find((o) => o.id === selected);
  if (!wall && !opening) return null;
  const ends = wall ? endpoints(scene, wall) : null;
  const fields: [string, string, number][] =
    wall && ends
      ? [
          ["ax", "Begin X", ends.a.x],
          ["ay", "Begin Y", ends.a.y],
          ["bx", "Einde X", ends.b.x],
          ["by", "Einde Y", ends.b.y],
          ["thickness", "Muurdikte", wall.thickness],
          ["height", "Muurhoogte", wall.height],
        ]
      : opening
        ? [
            ["offset", "Afstand vanaf muurbegin", opening.offset],
            ["width", "Openingsbreedte", opening.width],
            ["height", "Openingshoogte", opening.height],
            ...(opening.kind === "window"
              ? [
                  ["sillHeight", "Borstwering", opening.sillHeight] as [
                    string,
                    string,
                    number,
                  ],
                ]
              : []),
          ]
        : [];
  return (
    <div className="item-properties">
      <span className="eyebrow">
        {wall ? "MUUR" : opening?.kind === "door" ? "DEUR" : "RAAM"}
      </span>
      <h3>{wall ? "Muur op maat" : "Opening op maat"}</h3>
      {ends && (
        <p className="small">
          Lengte: {Math.round(ends.length).toLocaleString("nl-NL")} mm. Gedeelde
          eindpunten verplaatsen ook de aansluitende muren.
        </p>
      )}
      {opening && (
        <p className="small">
          Afstand gemeten langs de muur vanaf het beginpunt. De opening moet
          volledig binnen de muur passen.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            const value = (name: string) =>
              Math.round(parseDutchNumber(String(data.get(name))));
            const operations: Operation[] = wall
              ? [
                  {
                    type: "MoveWallNode",
                    id: wall.startId,
                    x: value("ax"),
                    y: value("ay"),
                  },
                  {
                    type: "MoveWallNode",
                    id: wall.endId,
                    x: value("bx"),
                    y: value("by"),
                  },
                  {
                    type: "ResizeWall",
                    id: wall.id,
                    thickness: value("thickness"),
                    height: value("height"),
                  },
                ]
              : [
                  {
                    type: "ResizeOpening",
                    id: opening!.id,
                    offset: value("offset"),
                    width: value("width"),
                    height: value("height"),
                    sillHeight:
                      opening!.kind === "door" ? 0 : value("sillHeight"),
                  },
                ];
            onCommand(operations);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset
          disabled={disabled}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          {fields.map(([name, label, value]) => (
            <label key={name}>
              {label} <span>mm</span>
              <input
                name={name}
                aria-label={label}
                defaultValue={value}
                inputMode="decimal"
                required
              />
            </label>
          ))}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary">Maten toepassen</button>
        </fieldset>
      </form>
    </div>
  );
}
