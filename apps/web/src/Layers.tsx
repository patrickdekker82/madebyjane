import { Eye, EyeOff, Lock, LockOpen, ChevronsUp, ChevronsDown } from "lucide-react";
import {
  itemLayers,
  type Item,
  type ItemLayer,
  type Operation,
} from "../../../packages/contracts/src/index";

const layerOf = (item: Item): ItemLayer => item.layer ?? "furniture";

/**
 * Lagen van het plan. Zichtbaarheid en vergrendeling zijn eigenschappen van de
 * objecten zelf, niet van een aparte laaglijst: een object houdt zijn stand ook
 * wanneer het van laag wisselt, en de server bewaakt de vergrendeling.
 */
export function LayerPanel({
  items,
  selected,
  disabled,
  onCommand,
}: {
  items: Item[];
  selected: string[];
  disabled: boolean;
  onCommand: (operations: Operation[]) => void;
}) {
  const used = (Object.keys(itemLayers) as ItemLayer[])
    .map((layer) => ({
      layer,
      members: items.filter((item) => layerOf(item) === layer),
    }))
    .filter(({ members }) => members.length);
  if (!used.length) return null;
  const chosen = items.filter((item) => selected.includes(item.id));
  /**
   * Laagpreset voor een tekenblad: toon precies een laag en verberg de rest.
   * Zichtbaarheid hoort bij de objecten zelf, dus dit is een gewone wijziging
   * die in de export doorwerkt en met een stap terug ongedaan te maken is.
   */
  const preset = (only: ItemLayer | null) => {
    const operations: Operation[] = [];
    for (const { layer, members } of used) {
      const hidden = only !== null && layer !== only;
      const changing = members.filter((item) => !!item.hidden !== hidden);
      if (changing.length)
        operations.push({
          type: "SetItemDisplay",
          ids: changing.map((item) => item.id),
          hidden,
        });
    }
    if (operations.length) onCommand(operations);
  };
  return (
    <div className="layers">
      <h4>Lagen</h4>
      <ul>
        {used.map(({ layer, members }) => {
          const hidden = members.every((item) => item.hidden);
          const locked = members.every((item) => item.locked);
          const ids = members.map((item) => item.id);
          return (
            <li key={layer}>
              <span>
                {itemLayers[layer]} <em>{members.length}</em>
              </span>
              <button
                aria-label={`${itemLayers[layer]} ${hidden ? "tonen" : "verbergen"}`}
                title={hidden ? "Tonen" : "Verbergen"}
                disabled={disabled}
                onClick={() =>
                  onCommand([
                    { type: "SetItemDisplay", ids, hidden: !hidden },
                  ])
                }
              >
                {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                aria-label={`${itemLayers[layer]} ${locked ? "ontgrendelen" : "vergrendelen"}`}
                title={locked ? "Ontgrendelen" : "Vergrendelen"}
                disabled={disabled}
                onClick={() =>
                  onCommand([
                    { type: "SetItemDisplay", ids, locked: !locked },
                  ])
                }
              >
                {locked ? <Lock size={13} /> : <LockOpen size={13} />}
              </button>
            </li>
          );
        })}
      </ul>
      {used.length > 1 && (
        <div className="layer-presets">
          <span className="small">Blad tonen</span>
          <div>
            <button aria-label="Alle lagen tonen" disabled={disabled} onClick={() => preset(null)}>
              Alles
            </button>
            {used.map(({ layer }) => (
              <button
                key={layer}
                aria-label={`Alleen ${itemLayers[layer].toLocaleLowerCase("nl-NL")} tonen`}
                disabled={disabled}
                onClick={() => preset(layer)}
              >
                {itemLayers[layer]}
              </button>
            ))}
          </div>
        </div>
      )}
      {!!chosen.length && (
        <div className="layer-actions">
          <label>
            Laag van de selectie
            <select
              aria-label="Laag van de selectie"
              disabled={disabled}
              value={
                new Set(chosen.map(layerOf)).size === 1
                  ? layerOf(chosen[0]!)
                  : ""
              }
              onChange={(event) =>
                onCommand([
                  {
                    type: "SetItemDisplay",
                    ids: chosen.map((item) => item.id),
                    layer: event.target.value as ItemLayer,
                  },
                ])
              }
            >
              {new Set(chosen.map(layerOf)).size > 1 && (
                <option value="">Verschillende lagen</option>
              )}
              {(Object.keys(itemLayers) as ItemLayer[]).map((layer) => (
                <option key={layer} value={layer}>
                  {itemLayers[layer]}
                </option>
              ))}
            </select>
          </label>
          <div className="arrange-row pair">
            <button
              aria-label="Naar voren halen"
              title="Naar voren halen"
              disabled={disabled}
              onClick={() =>
                onCommand([
                  {
                    type: "ReorderItems",
                    ids: chosen.map((item) => item.id),
                    direction: "front",
                  },
                ])
              }
            >
              <ChevronsUp size={15} />
            </button>
            <button
              aria-label="Naar achteren sturen"
              title="Naar achteren sturen"
              disabled={disabled}
              onClick={() =>
                onCommand([
                  {
                    type: "ReorderItems",
                    ids: chosen.map((item) => item.id),
                    direction: "back",
                  },
                ])
              }
            >
              <ChevronsDown size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
