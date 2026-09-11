import { useRef, useState } from "react";
import {
  Image as ImageIcon,
  Move,
  Ruler,
  RotateCw,
  Trash2,
} from "lucide-react";
import {
  underlayScale,
  rotateUnderlay,
  parseDutchNumber,
} from "../../../packages/geometry/src/index";
import type { Operation, Scene } from "../../../packages/contracts/src/index";
import { useEditor } from "../../../packages/editor-2d/src/store";
import { uploadImage } from "./Images";

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
      const uploaded = await uploadImage(chosen, organizationId);
      onCommand([
        {
          type: "SetUnderlay",
          underlay: {
            assetId: uploaded.id,
            widthPx: uploaded.widthPx,
            heightPx: uploaded.heightPx,
            x: 0,
            y: 0,
            rotation: uploaded.rotation,
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
              De schaal is nu een aanname. Meet een bekende maat in om er echt
              op te kunnen tekenen.
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
                    underlay: {
                      ...underlay,
                      opacity: Number(event.target.value),
                    },
                  },
                ])
              }
            />
          </label>
          <button
            className={tool === "underlay" ? "active" : ""}
            disabled={disabled}
            onClick={() => setTool(tool === "underlay" ? "select" : "underlay")}
          >
            <Move size={13} />
            {tool === "underlay"
              ? "Klaar met verplaatsen"
              : "Verplaatsen en draaien"}
          </button>
          {tool === "underlay" && (
            <p className="small">
              Sleep de afbeelding op de plattegrond. Zolang dit aan staat,
              verplaats je alleen de onderlegger.
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = (name: string) => String(form.get(name) ?? "");
              try {
                const x = Math.round(parseDutchNumber(value("x"))),
                  y = Math.round(parseDutchNumber(value("y"))),
                  rotation = parseDutchNumber(value("rotation"));
                if (Math.abs(x) > 1000000 || Math.abs(y) > 1000000)
                  throw new Error("Vul een plaats binnen 1.000 meter in.");
                if (!(rotation >= -360 && rotation <= 360))
                  throw new Error("Vul een hoek tussen -360 en 360 graden in.");
                setError("");
                // Alleen de hoek verandert: het midden blijft dan liggen. Zijn
                // ook X en Y ingevuld, dan wint wat de gebruiker intikt.
                const turned = rotateUnderlay(underlay, rotation);
                const moved = x !== underlay.x || y !== underlay.y;
                onCommand([
                  {
                    type: "SetUnderlay",
                    underlay: moved
                      ? { ...underlay, x, y, rotation }
                      : { ...underlay, ...turned },
                  },
                ]);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="pair">
              <label>
                Onderlegger X <span>mm</span>
                <input
                  name="x"
                  aria-label="Onderlegger X"
                  inputMode="decimal"
                  key={"x" + underlay.x}
                  defaultValue={underlay.x}
                  disabled={disabled}
                />
              </label>
              <label>
                Onderlegger Y <span>mm</span>
                <input
                  name="y"
                  aria-label="Onderlegger Y"
                  inputMode="decimal"
                  key={"y" + underlay.y}
                  defaultValue={underlay.y}
                  disabled={disabled}
                />
              </label>
            </div>
            <label>
              Draaiing <span>°</span>
              <input
                name="rotation"
                aria-label="Onderlegger draaiing"
                inputMode="decimal"
                key={"r" + underlay.rotation}
                defaultValue={underlay.rotation}
                disabled={disabled}
              />
            </label>
            <button className="primary" disabled={disabled}>
              Plaatsing toepassen
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onCommand([
                  {
                    type: "SetUnderlay",
                    underlay: {
                      ...underlay,
                      // Zelfde afspraak als bij meubels: altijd 0 tot 359 graden.
                      ...rotateUnderlay(
                        underlay,
                        (((underlay.rotation + 90) % 360) + 360) % 360,
                      ),
                    },
                  },
                ])
              }
            >
              <RotateCw size={13} />
              90° draaien
            </button>
          </form>
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
                      underlay: {
                        ...underlay,
                        calibration: { ...pending, lengthMm },
                      },
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
              onClick={() =>
                setTool(tool === "calibrate" ? "select" : "calibrate")
              }
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
