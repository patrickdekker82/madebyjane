import { Lightbulb, Plug, Eye } from "lucide-react";
import type { Operation, Scene } from "../../../packages/contracts/src/index";
import {
  circuits,
  lightScenes,
  lightingTotals,
  UNASSIGNED,
} from "../../../packages/domain/src/lighting";

const decimals = (value: string) => value.replace(".", ",");

/**
 * Overzicht van elektragroepen en lichtscenes.
 *
 * Het opgetelde vermogen is de som van wat iemand zelf heeft ingevuld. Waar
 * niet elk armatuur een vermogen heeft, staat dat er bij: een totaal mag nooit
 * volledig lijken terwijl het dat niet is. Dit is een inventarisatie van de
 * tekening en geen groeps- of belastingberekening.
 *
 * Een scene tonen werkt als de laagpresets: het zet de zichtbaarheid van de
 * armaturen zelf, in een opdracht, dus het werkt door in de export en is met
 * een stap terug ongedaan te maken.
 */
export function LightingPanel({
  scene,
  disabled,
  onCommand,
}: {
  scene: Scene;
  disabled: boolean;
  onCommand: (operations: Operation[]) => void;
}) {
  const groups = circuits(scene.items);
  const scenes = lightScenes(scene.items);
  const totals = lightingTotals(scene.items, scene.ledPaths);
  if (!groups.length && !scene.ledPaths.length) return null;
  /** Toon precies een scene en verberg de andere armaturen. */
  const only = (name: string | null) => {
    const operations: Operation[] = [];
    for (const group of scenes) {
      const hidden = name !== null && group.name !== name;
      const changing = scene.items.filter(
        (item) => group.ids.includes(item.id) && !!item.hidden !== hidden,
      );
      if (changing.length)
        operations.push({
          type: "SetItemDisplay",
          ids: changing.map((item) => item.id),
          hidden,
        });
    }
    if (operations.length) onCommand(operations);
  };
  const power = (g: (typeof groups)[number]) =>
    g.withPower === 0
      ? "geen vermogen opgegeven"
      : g.withPower === g.count
        ? `${decimals(g.powerW)} W`
        : `${decimals(g.powerW)} W · ${g.withPower} van ${g.count} opgegeven`;
  return (
    <div className="lighting">
      <h4>Elektra en licht</h4>
      {groups.length > 0 && (
        <>
          <span className="eyebrow">GROEPEN</span>
          <ul className="lighting-list">
            {groups.map((g) => (
              <li key={g.name}>
                <div className="lighting-row">
                  <Plug size={12} />
                  <span className={g.name === UNASSIGNED ? "muted" : ""}>
                    {g.name}
                  </span>
                </div>
                <small>
                  {g.count} × · {power(g)}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
      {scenes.length > 0 && (
        <>
          <span className="eyebrow">LICHTSCÈNES</span>
          <ul className="lighting-list">
            {scenes.map((g) => (
              <li key={g.name}>
                <div className="lighting-row">
                  <Lightbulb size={12} />
                  <span className={g.name === UNASSIGNED ? "muted" : ""}>
                    {g.name}
                  </span>
                  <button
                    aria-label={"Alleen " + g.name + " tonen"}
                    title={"Alleen " + g.name + " tonen"}
                    disabled={disabled}
                    onClick={() => only(g.name)}
                  >
                    <Eye size={12} />
                  </button>
                </div>
                <small>
                  {g.count} ×{g.withLumen ? ` · ${g.lumen} lm` : ""}
                </small>
              </li>
            ))}
          </ul>
          <button disabled={disabled} onClick={() => only(null)}>
            Alle armaturen tonen
          </button>
        </>
      )}
      <p className="small">
        {totals.fixtures} armat{totals.fixtures === 1 ? "uur" : "uren"}
        {totals.withPower
          ? ` · ${decimals(totals.fixturePowerW)} W opgegeven`
          : ""}
        {totals.led.count
          ? ` · ${totals.led.count} LED-strip${totals.led.count === 1 ? "" : "s"} · ${decimals(totals.led.lengthM)} m · ${decimals(totals.led.powerW)} W`
          : ""}
        . Opgeteld uit wat is ingevuld; geen groeps- of belastingberekening.
      </p>
    </div>
  );
}
