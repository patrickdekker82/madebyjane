import {
  alignItems,
  distributeItems,
  type Alignment,
} from "../../../packages/geometry/src/arrange";
import { groupsIn } from "../../../packages/geometry/src/grouping";
import type { Item, Operation } from "../../../packages/contracts/src/index";
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Group as GroupIcon,
  Ungroup,
} from "lucide-react";

const alignments: [Alignment, string, typeof AlignStartVertical][] = [
  ["left", "Links uitlijnen", AlignStartVertical],
  ["centerX", "Horizontaal centreren", AlignCenterVertical],
  ["right", "Rechts uitlijnen", AlignEndVertical],
  ["top", "Boven uitlijnen", AlignStartHorizontal],
  ["centerY", "Verticaal centreren", AlignCenterHorizontal],
  ["bottom", "Onder uitlijnen", AlignEndHorizontal],
];

/**
 * Uitlijnen en verdelen van een meervoudige selectie. Alle verplaatsingen gaan
 * als een enkele batch naar de server, zodat de hele actie een stap terug is.
 */
export function Arrange({
  items,
  disabled,
  onCommand,
}: {
  items: Item[];
  disabled: boolean;
  onCommand: (operations: Operation[]) => void;
}) {
  const groups = groupsIn(items, items.map((item) => item.id));
  // Een groep die de hele selectie al beslaat, opnieuw groeperen verandert niets.
  const fullyGrouped =
    groups.length === 1 && items.every((item) => item.groupId === groups[0]);
  const apply = (placements: { id: string; x: number; y: number }[]) => {
    const operations = placements.flatMap((placement): Operation[] => {
      const item = items.find((i) => i.id === placement.id);
      if (!item || (item.x === placement.x && item.y === placement.y))
        return [];
      return [
        {
          type: "TransformItem",
          id: item.id,
          x: placement.x,
          y: placement.y,
          width: item.width,
          depth: item.depth,
          rotation: item.rotation,
          custom: item.custom,
        },
      ];
    });
    if (operations.length) onCommand(operations);
  };
  return (
    <div className="arrange">
      <h3>{items.length} meubels</h3>
      <p className="small">
        Uitlijnen gebruikt de omhullende van elk meubel, inclusief draaiing.
      </p>
      <div className="arrange-row">
        {alignments.map(([mode, label, Icon]) => (
          <button
            key={mode}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={() => apply(alignItems(items, mode))}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <div className="arrange-row pair">
        <button
          aria-label="Horizontaal gelijk verdelen"
          title="Horizontaal gelijk verdelen"
          disabled={disabled || items.length < 3}
          onClick={() => apply(distributeItems(items, "x"))}
        >
          <AlignHorizontalSpaceAround size={15} />
        </button>
        <button
          aria-label="Verticaal gelijk verdelen"
          title="Verticaal gelijk verdelen"
          disabled={disabled || items.length < 3}
          onClick={() => apply(distributeItems(items, "y"))}
        >
          <AlignVerticalSpaceAround size={15} />
        </button>
      </div>
      <div className="arrange-row pair">
        <button
          aria-label="Groeperen"
          title="Groeperen"
          disabled={disabled || items.length < 2 || fullyGrouped}
          onClick={() =>
            onCommand([
              {
                type: "SetItemGroup",
                ids: items.map((item) => item.id),
                groupId: crypto.randomUUID(),
              },
            ])
          }
        >
          <GroupIcon size={15} />
        </button>
        <button
          aria-label="Groep opheffen"
          title="Groep opheffen"
          disabled={disabled || !groups.length}
          onClick={() =>
            onCommand([
              {
                type: "SetItemGroup",
                ids: items.map((item) => item.id),
                groupId: null,
              },
            ])
          }
        >
          <Ungroup size={15} />
        </button>
      </div>
      {!!groups.length && (
        <p className="small">
          {groups.length === 1
            ? "Deze meubels vormen een groep en bewegen samen."
            : `${groups.length} groepen geselecteerd; opheffen maakt ze allemaal los.`}
        </p>
      )}
      {items.length < 3 && (
        <p className="small">
          Gelijk verdelen vraagt minimaal drie meubels; de buitenste blijven
          staan.
        </p>
      )}
    </div>
  );
}
