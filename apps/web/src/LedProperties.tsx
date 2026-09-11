import { useState } from "react";
import { Zap } from "lucide-react";
import {
  ledDirections,
  ledProfiles,
  type LedPath,
  type Operation,
} from "../../../packages/contracts/src/index";
import { ledQuantity } from "../../../packages/domain/src/led";
import { parseDutchNumber } from "../../../packages/geometry/src/index";

/** Nederlandse decimalen, net als in het materialenpaneel. */
const decimals = (value: string) => value.replace(".", ",");

/**
 * Eigenschappen van een LED-strip.
 *
 * De gemeten lengte staat bovenaan als uitkomst en niet als invoerveld: die
 * komt uit de hoekpunten op de tekening en is hier niet te overschrijven. De
 * bestel- of kniplengte is dat wel, en staat er los naast met het verschil
 * erbij, zodat te kort of te ruim besteld meteen opvalt.
 */
export function LedProperties({
  led,
  disabled,
  onCommand,
}: {
  led: LedPath;
  disabled: boolean;
  onCommand: (operations: Operation[]) => void;
}) {
  const [error, setError] = useState("");
  const q = ledQuantity(led);
  const update = (patch: Partial<LedPath>) =>
    onCommand([
      { type: "UpdateLedPath", id: led.id, path: { ...led, ...patch } },
    ]);
  return (
    <>
      <span className="eyebrow">LED-STRIP</span>
      <h3>{led.name}</h3>
      <dl className="led-readout">
        <div>
          <dt>Gemeten lengte</dt>
          <dd>
            <strong>{decimals(q.lengthM)} m</strong>
          </dd>
        </div>
        <div>
          <dt>Hoeken</dt>
          <dd>{q.corners}</dd>
        </div>
        <div>
          <dt>Vermogen</dt>
          <dd>{decimals(q.powerW)} W</dd>
        </div>
      </dl>
      <p className="small">
        De lengte komt uit de hoekpunten op de tekening. Vermogen is lengte maal
        het vermogen per meter, meer niet.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const text = (name: string) => String(f.get(name) ?? "").trim();
          try {
            const height = Math.round(parseDutchNumber(text("height")));
            if (height < 0 || height > 20000)
              throw new Error("Vul een hoogte tussen 0 en 20.000 mm in.");
            const watt = parseDutchNumber(text("watt"));
            if (!(watt >= 0 && watt <= 200))
              throw new Error("Vul een vermogen tussen 0 en 200 W/m in.");
            const kelvin = text("kelvin");
            if (kelvin && !(Number(kelvin.replace(",", ".")) >= 1000))
              throw new Error(
                "Vul een kleurtemperatuur van minstens 1.000 K in.",
              );
            const order = text("order");
            setError("");
            update({
              name: text("name") || led.name,
              heightMm: height,
              wattPerMeterMw: Math.round(watt * 1000),
              colorTemperatureK: kelvin
                ? Math.round(parseDutchNumber(kelvin))
                : null,
              connection: text("connection"),
              note: text("note"),
              orderLengthMm: order
                ? Math.round(parseDutchNumber(order) * 1000)
                : null,
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Naam
          <input
            name="name"
            aria-label="LED naam"
            key={"n" + led.name}
            defaultValue={led.name}
            disabled={disabled}
          />
        </label>
        <div className="pair">
          <label>
            Montagehoogte <span>mm</span>
            <input
              name="height"
              aria-label="LED montagehoogte"
              inputMode="decimal"
              key={"h" + led.heightMm}
              defaultValue={led.heightMm}
              disabled={disabled}
            />
          </label>
          <label>
            Vermogen <span>W/m</span>
            <input
              name="watt"
              aria-label="LED vermogen per meter"
              inputMode="decimal"
              key={"w" + led.wattPerMeterMw}
              defaultValue={decimals(String(led.wattPerMeterMw / 1000))}
              disabled={disabled}
            />
          </label>
        </div>
        <div className="pair">
          <label>
            Kleurtemperatuur <span>K</span>
            <input
              name="kelvin"
              aria-label="LED kleurtemperatuur"
              inputMode="decimal"
              key={"k" + led.colorTemperatureK}
              defaultValue={led.colorTemperatureK ?? ""}
              disabled={disabled}
            />
          </label>
          <label>
            Bestel- of kniplengte <span>m</span>
            <input
              name="order"
              aria-label="LED bestellengte"
              inputMode="decimal"
              key={"o" + led.orderLengthMm}
              defaultValue={
                led.orderLengthMm === null
                  ? ""
                  : decimals(String(led.orderLengthMm / 1000))
              }
              disabled={disabled}
            />
          </label>
        </div>
        {q.orderDifferenceM !== null && (
          <p className={Number(q.orderDifferenceM) < 0 ? "error" : "small"}>
            {Number(q.orderDifferenceM) < 0
              ? `Er is ${decimals(q.orderDifferenceM.replace("-", ""))} m te weinig besteld.`
              : `Er blijft ${decimals(q.orderDifferenceM)} m over.`}
          </p>
        )}
        <label>
          Aansluiting
          <input
            name="connection"
            aria-label="LED aansluiting"
            key={"c" + led.connection}
            defaultValue={led.connection}
            disabled={disabled}
          />
        </label>
        <label>
          Notitie
          <input
            name="note"
            aria-label="LED notitie"
            key={"t" + led.note}
            defaultValue={led.note}
            disabled={disabled}
          />
        </label>
        <button className="primary" disabled={disabled}>
          <Zap size={15} />
          Toepassen
        </button>
      </form>
      <div className="pair">
        <label>
          Profiel
          <select
            aria-label="LED profiel"
            value={led.profile}
            disabled={disabled}
            onChange={(event) =>
              update({ profile: event.target.value as LedPath["profile"] })
            }
          >
            {Object.entries(ledProfiles).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Richting
          <select
            aria-label="LED richting"
            value={led.direction}
            disabled={disabled}
            onChange={(event) =>
              update({ direction: event.target.value as LedPath["direction"] })
            }
          >
            {Object.entries(ledDirections).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Kleur op de tekening
        <input
          type="color"
          aria-label="LED kleur"
          value={led.color}
          disabled={disabled}
          onChange={(event) => update({ color: event.target.value })}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
