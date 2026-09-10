import { useState } from "react";
import { Check, FlipVertical2 } from "lucide-react";
import {
  dimensionGeometry,
  formatMm,
  parseDutchNumber,
} from "../../../packages/geometry/src/index";
import type { Annotation, Operation } from "../../../packages/contracts/src/index";

/**
 * Eigenschappen van een maatlijn. De gemeten lengte is afgeleid en dus niet te
 * bewerken; alleen de plek van de maatlijn ten opzichte van de gemeten lijn.
 */
export function DimensionProperties({
  annotation,
  disabled,
  onCommand,
}: {
  annotation: Extract<Annotation, { type: "dimension" }>;
  disabled: boolean;
  onCommand: (operations: Operation[]) => void;
}) {
  const [error, setError] = useState("");
  const geometry = dimensionGeometry(
    annotation.from,
    annotation.to,
    annotation.offset,
  );
  const apply = (offset: number) => {
    if (!Number.isInteger(offset) || Math.abs(offset) > 10000) {
      setError("Kies een afstand tussen -10.000 en 10.000 mm.");
      return;
    }
    setError("");
    onCommand([{ type: "SetAnnotationOffset", id: annotation.id, offset }]);
  };
  return (
    <div className="item-properties">
      <span className="eyebrow">MAATLIJN</span>
      <h3>{formatMm(geometry.lengthMm)}</h3>
      <p className="small">
        De lengte komt uit de twee gemeten punten en is niet los aan te passen.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get("offset") ?? "",
          );
          try {
            apply(Math.round(parseDutchNumber(value)));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Afstand tot de gemeten lijn <span>mm</span>
          <input
            name="offset"
            aria-label="Afstand maatlijn"
            inputMode="decimal"
            defaultValue={annotation.offset}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={disabled}>
          <Check size={15} />
          Toepassen
        </button>
      </form>
      <button
        className="subtle full"
        disabled={disabled}
        onClick={() => apply(-annotation.offset)}
      >
        <FlipVertical2 size={15} />
        Naar de andere kant
      </button>
    </div>
  );
}
