import { useRef, useState } from "react";
import { Image as ImageIcon, Ruler, Trash2 } from "lucide-react";
import {
  underlayScale,
  parseDutchNumber,
} from "../../../packages/geometry/src/index";
import type { Operation, Scene } from "../../../packages/contracts/src/index";
import { useEditor } from "../../../packages/editor-2d/src/store";
import { ApiError } from "./api";

type Pending = { from: { x: number; y: number }; to: { x: number; y: number } };

/**
 * Onderlegger beheren: afbeelding kiezen, doorzichtigheid, kalibreren en
 * verwijderen. Een niet-gekalibreerde onderlegger wordt als schatting getoond,
 * zodat niemand er maten uit overneemt die nergens op gebaseerd zijn.
 */
export function UnderlayPanel({
  scene,
  organizationId,
  disabled,
  pending,
  onCommand,
  onCalibrated,
}: {
  scene: Scene;
  organizationId: string;
  disabled: boolean;
  /** Twee punten die de gebruiker net op de afbeelding heeft aangewezen. */
  pending: Pending | null;
  onCommand: (operations: Operation[]) => void;
  onCalibrated: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { tool, setTool } = useEditor();
  const underlay = scene.underlay;

  const upload = async (chosen: File) => {
    setBusy(true);
    setError("");
    try {
      const assetId = crypto.randomUUID();
      const response = await fetch("/api/v1/underlay-assets/" + assetId, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-organization-id": organizationId,
          "Content-Type": "application/octet-stream",
        },
        body: await chosen.arrayBuffer(),
      });
      const body = await response.json();
      if (!response.ok) throw new ApiError(body.code, body.message, response.status);
      onCommand([
        {
          type: "SetUnderlay",
          underlay: {
            assetId,
            widthPx: body.widthPx,
            heightPx: body.heightPx,
            x: 0,
            y: 0,
            opacity: 45,
            calibration: null,
          },
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="underlay">
      <h4>Onderlegger</h4>
      {!underlay && (
        <>
          <p className="small">
            Leg een foto of scan van een bestaande plattegrond onder je tekening
            en meet hem in. PNG of JPEG, maximaal 16 MiB.
          </p>
          <input
            ref={file}
            type="file"
            aria-label="Onderlegger kiezen"
            accept="image/png,image/jpeg"
            disabled={disabled || busy}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void upload(chosen);
            }}
          />
        </>
      )}
      {underlay && (
        <>
          <p className="small">
            {underlay.widthPx} × {underlay.heightPx} px ·{" "}
            {underlay.calibration ? (
              <strong>
                {underlayScale(underlay).toLocaleString("nl-NL", {
                  maximumFractionDigits: 3,
                })}{" "}
                mm per pixel
              </strong>
            ) : (
              <strong>nog niet gekalibreerd</strong>
            )}
          </p>
          {!underlay.calibration && (
            <p className="small">
              De schaal is nu een aanname. Meet een bekende maat in om er echt op
              te kunnen tekenen.
            </p>
          )}
          <label>
            Doorzichtigheid <span>{underlay.opacity}%</span>
            <input
              type="range"
              aria-label="Doorzichtigheid onderlegger"
              min={10}
              max={100}
              step={5}
              value={underlay.opacity}
              disabled={disabled}
              onChange={(event) =>
                onCommand([
                  {
                    type: "SetUnderlay",
                    underlay: { ...underlay, opacity: Number(event.target.value) },
                  },
                ])
              }
            />
          </label>
          {pending ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = String(
                  new FormData(event.currentTarget).get("length") ?? "",
                );
                try {
                  const lengthMm = Math.round(parseDutchNumber(value));
                  if (lengthMm < 1 || lengthMm > 100000)
                    throw new Error("Vul een maat tussen 1 en 100.000 mm in.");
                  setError("");
                  onCommand([
                    {
                      type: "SetUnderlay",
                      underlay: { ...underlay, calibration: { ...pending, lengthMm } },
                    },
                  ]);
                  onCalibrated();
                  setTool("select");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Werkelijke afstand tussen de twee punten <span>mm</span>
                <input
                  name="length"
                  aria-label="Werkelijke afstand"
                  inputMode="decimal"
                  autoFocus
                  defaultValue=""
                />
              </label>
              <button className="primary" disabled={disabled}>
                Schaal toepassen
              </button>
              <button type="button" onClick={onCalibrated}>
                Annuleren
              </button>
            </form>
          ) : (
            <button
              className={tool === "calibrate" ? "active" : ""}
              disabled={disabled}
              onClick={() => setTool(tool === "calibrate" ? "select" : "calibrate")}
            >
              <Ruler size={13} />
              {tool === "calibrate"
                ? "Wijs twee punten aan…"
                : underlay.calibration
                  ? "Opnieuw inmeten"
                  : "Inmeten"}
            </button>
          )}
          <button
            className="subtle"
            disabled={disabled}
            onClick={() => onCommand([{ type: "SetUnderlay", underlay: null }])}
          >
            <Trash2 size={13} />
            Onderlegger verwijderen
          </button>
        </>
      )}
      {busy && (
        <p className="small" role="status">
          <ImageIcon size={13} /> Afbeelding wordt gecontroleerd…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
