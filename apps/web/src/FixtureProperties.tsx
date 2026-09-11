import { useState } from "react";
import { Lightbulb } from "lucide-react";
import {
  fixtureKinds,
  lightingKinds,
  type Fixture,
  type Item,
  type Operation,
} from "../../../packages/contracts/src/index";
import { beamFootprint } from "../../../packages/geometry/src/index";
import { parseDutchNumber } from "../../../packages/geometry/src/index";

const decimals = (value: string) => value.replace(".", ",");

/**
 * Eigenschappen van een elektra- of verlichtingspunt.
 *
 * Lumen en watt staan als losse fabrikantwaarden naast elkaar; er wordt niets
 * uit elkaar afgeleid. De bundeldiameter die hier verschijnt is een uitkomst
 * van een expliciete formule en wordt ook als benadering benoemd, want deze app
 * rekent geen verlichtingsinstallatie door.
 */
export function FixtureProperties({
  item,
  disabled,
  onCommand,
}: {
  item: Item & { fixture: Fixture };
  disabled: boolean;
  onCommand: (operations: Operation[]) => void;
}) {
  const [error, setError] = useState("");
  const f = item.fixture;
  const lighting = lightingKinds.includes(f.kind);
  const footprint = beamFootprint(item);
  const set = (patch: Partial<Fixture>) =>
    onCommand([
      { type: "SetFixture", id: item.id, fixture: { ...f, ...patch } },
    ]);
  return (
    <>
      <span className="eyebrow">{lighting ? "VERLICHTING" : "ELEKTRA"}</span>
      <h3>{fixtureKinds[f.kind]}</h3>
      <p className="small">
        Symbool {f.symbolSizeMm} mm op papier · armatuur {item.width} ×{" "}
        {item.depth} mm in het echt. Het symbool is een tekenafspraak en geen
        maatvoering.
      </p>
      {footprint && (
        <p className="small">
          Bundel op de vloer:{" "}
          <strong>
            {decimals((2 * footprint.radiusMm).toFixed(0))} mm{" "}
            {footprint.shape === "circle" ? "doorsnede" : "reikwijdte"}
          </strong>{" "}
          bij {f.mountHeightMm} mm hoogte en {f.beamAngle}°. Dit is een visuele
          benadering: (hoogte × tan(hoek/2)) × 2. Geen lux, geen
          lichtberekening.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const text = (name: string) => String(data.get(name) ?? "").trim();
          const optional = (name: string, max: number) => {
            const raw = text(name);
            if (!raw) return null;
            const value = Math.round(parseDutchNumber(raw));
            if (!(value >= 0 && value <= max))
              throw new Error(`Vul bij ${name} een getal tot ${max} in.`);
            return value;
          };
          try {
            const height = Math.round(parseDutchNumber(text("height")));
            if (!(height >= 0 && height <= 20000))
              throw new Error("Vul een hoogte tussen 0 en 20.000 mm in.");
            const symbol = Math.round(parseDutchNumber(text("symbol")));
            if (!(symbol >= 50 && symbol <= 2000))
              throw new Error("Vul een symboolmaat tussen 50 en 2.000 mm in.");
            const beam = text("beam")
              ? Math.round(parseDutchNumber(text("beam")))
              : null;
            if (beam !== null && !(beam >= 1 && beam <= 180))
              throw new Error("Vul een bundelhoek tussen 1 en 180 graden in.");
            const dim = Math.round(parseDutchNumber(text("dim") || "100"));
            if (!(dim >= 0 && dim <= 100))
              throw new Error("Vul een dimniveau tussen 0 en 100% in.");
            const kelvin = text("kelvin")
              ? Math.round(parseDutchNumber(text("kelvin")))
              : null;
            if (kelvin !== null && !(kelvin >= 1000 && kelvin <= 10000))
              throw new Error(
                "Vul een kleurtemperatuur tussen 1.000 en 10.000 K in.",
              );
            const watt = text("watt") ? parseDutchNumber(text("watt")) : null;
            if (watt !== null && !(watt >= 0 && watt <= 2000))
              throw new Error("Vul een vermogen tot 2.000 W in.");
            setError("");
            set({
              mountHeightMm: height,
              symbolSizeMm: symbol,
              beamAngle: beam,
              dimLevel: dim,
              colorTemperatureK: kelvin,
              lumen: optional("lumen", 200000),
              milliwatt: watt === null ? null : Math.round(watt * 1000),
              circuit: text("circuit"),
              scene: text("scene"),
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="pair">
          <label>
            Montagehoogte <span>mm</span>
            <input
              name="height"
              aria-label="Montagehoogte"
              inputMode="decimal"
              key={"h" + f.mountHeightMm}
              defaultValue={f.mountHeightMm}
              disabled={disabled}
            />
          </label>
          <label>
            Symbool op papier <span>mm</span>
            <input
              name="symbol"
              aria-label="Symboolmaat"
              inputMode="decimal"
              key={"s" + f.symbolSizeMm}
              defaultValue={f.symbolSizeMm}
              disabled={disabled}
            />
          </label>
        </div>
        {lighting && (
          <>
            <div className="pair">
              <label>
                Bundelhoek <span>°</span>
                <input
                  name="beam"
                  aria-label="Bundelhoek"
                  inputMode="decimal"
                  key={"b" + f.beamAngle}
                  defaultValue={f.beamAngle ?? ""}
                  disabled={disabled}
                />
              </label>
              <label>
                Dimniveau <span>%</span>
                <input
                  name="dim"
                  aria-label="Dimniveau"
                  inputMode="decimal"
                  key={"d" + f.dimLevel}
                  defaultValue={f.dimLevel}
                  disabled={disabled}
                />
              </label>
            </div>
            <div className="pair">
              <label>
                Kleurtemperatuur <span>K</span>
                <input
                  name="kelvin"
                  aria-label="Kleurtemperatuur"
                  inputMode="decimal"
                  key={"k" + f.colorTemperatureK}
                  defaultValue={f.colorTemperatureK ?? ""}
                  disabled={disabled}
                />
              </label>
              <label>
                Lichtstroom <span>lm</span>
                <input
                  name="lumen"
                  aria-label="Lichtstroom"
                  inputMode="decimal"
                  key={"l" + f.lumen}
                  defaultValue={f.lumen ?? ""}
                  disabled={disabled}
                />
              </label>
            </div>
            <label>
              Opgenomen vermogen <span>W</span>
              <input
                name="watt"
                aria-label="Opgenomen vermogen"
                inputMode="decimal"
                key={"w" + f.milliwatt}
                defaultValue={
                  f.milliwatt === null
                    ? ""
                    : decimals(String(f.milliwatt / 1000))
                }
                disabled={disabled}
              />
            </label>
            <p className="small">
              Lichtstroom en vermogen zijn fabrikantwaarden. Ze worden niet uit
              elkaar afgeleid en leveren geen lux op.
            </p>
          </>
        )}
        <div className="pair">
          <label>
            Groep
            <input
              name="circuit"
              aria-label="Groep"
              key={"c" + f.circuit}
              defaultValue={f.circuit}
              disabled={disabled}
            />
          </label>
          <label>
            Lichtscène
            <input
              name="scene"
              aria-label="Lichtscene"
              key={"sc" + f.scene}
              defaultValue={f.scene}
              disabled={disabled}
            />
          </label>
        </div>
        <button className="primary" disabled={disabled}>
          <Lightbulb size={15} />
          Toepassen
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
