import { useMemo } from "react";
import type { Scene } from "../../../packages/contracts/src/index";
import { detectRooms } from "../../../packages/geometry/src/index";
export function RoomSummary({ scene }: { scene: Scene }) {
  const result = useMemo(() => detectRooms(scene), [scene.nodes, scene.walls]);
  return (
    <section className="room-summary" aria-label="Herkende ruimtes">
      <span className="eyebrow">RUIMTES</span>
      {result.rooms.map((room, i) => (
        <p key={room.id}>
          Ruimte {i + 1}{" "}
          <strong>
            {(room.areaMm2 / 1000000).toLocaleString("nl-NL", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            m²
          </strong>
        </p>
      ))}
      {result.issues.map((issue) => (
        <p className="small" key={issue}>
          {issue}
        </p>
      ))}
      {result.rooms.length > 0 && (
        <p className="small">
          Oppervlakte tot de hartlijn van de muren. Geen netto vloer- of
          bestelhoeveelheid.
        </p>
      )}
    </section>
  );
}
