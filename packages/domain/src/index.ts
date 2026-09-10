import {
  sceneSchema,
  operationSchema,
  type Scene,
  type Operation,
} from "../../contracts/src/index";
import { validateGeometry } from "../../geometry/src/index";
import { reorder } from "./order";
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function validateScene(value: unknown): Scene {
  const scene = sceneSchema.parse(value);
  validateGeometry(scene);
  return scene;
}
export function applyOperations(before: Scene, operations: Operation[]): Scene {
  const s = structuredClone(before);
  for (const input of operations) {
    const op = operationSchema.parse(input);
    switch (op.type) {
      case "PlaceLibraryItem":
        throw new Error(
          "Bibliotheekplaatsing moet door de server worden uitgevoerd.",
        );
      case "RestoreRevision":
        throw new Error(
          "Revisieherstel moet door de server worden uitgevoerd.",
        );
      case "AddWall":
        for (const p of [op.start, op.end]) {
          const existing = s.nodes.find((n) => n.id === p.id);
          if (existing && (existing.x !== p.x || existing.y !== p.y))
            throw new Error("Eindpunt verschilt van bestaand punt.");
          if (!existing) s.nodes.push(p);
        }
        s.walls.push(op.wall);
        break;
      case "MoveWallNode": {
        const node = s.nodes.find((n) => n.id === op.id);
        if (!node) throw new Error("Punt niet gevonden.");
        node.x = op.x;
        node.y = op.y;
        break;
      }
      case "ResizeWall": {
        const wall = s.walls.find((w) => w.id === op.id);
        if (!wall) throw new Error("Muur niet gevonden.");
        wall.thickness = op.thickness;
        wall.height = op.height;
        break;
      }
      case "ResizeOpening": {
        const opening = s.openings.find((o) => o.id === op.id);
        if (!opening) throw new Error("Opening niet gevonden.");
        Object.assign(opening, {
          offset: op.offset,
          width: op.width,
          height: op.height,
          sillHeight: op.sillHeight,
        });
        break;
      }
      case "AddOpening":
        s.openings.push(op.opening);
        break;
      case "PlaceItem":
        s.items.push(op.item);
        break;
      case "SetItemDisplay": {
        const targets = s.items.filter((i) => op.ids.includes(i.id));
        if (targets.length !== op.ids.length)
          throw new Error("Meubel niet gevonden.");
        for (const item of targets) {
          if (op.layer !== undefined) item.layer = op.layer;
          if (op.locked !== undefined) item.locked = op.locked;
          if (op.hidden !== undefined) item.hidden = op.hidden;
        }
        break;
      }
      case "ReorderItems": {
        if (!op.ids.every((id) => s.items.some((i) => i.id === id)))
          throw new Error("Meubel niet gevonden.");
        const order = reorder(
          s.items.map((i) => i.id),
          op.ids,
          op.direction,
        );
        s.items = order.map((id) => s.items.find((i) => i.id === id)!);
        break;
      }
      case "TransformItem": {
        const item = s.items.find((i) => i.id === op.id);
        if (!item) throw new Error("Meubel niet gevonden.");
        // Vergrendelen moet ook gelden wanneer de opdracht niet uit de editor komt.
        if (item.locked)
          throw new Error(
            "Dit meubel is vergrendeld. Ontgrendel het eerst om het te verplaatsen.",
          );
        if (!op.custom && (item.width !== op.width || item.depth !== op.depth))
          throw new Error("Kies eerst maatwerk om handelsmaten te wijzigen.");
        Object.assign(item, {
          x: op.x,
          y: op.y,
          width: op.width,
          depth: op.depth,
          rotation: op.rotation,
          custom: op.custom,
        });
        break;
      }
      case "DeleteSelection":
        if (s.items.some((i) => op.ids.includes(i.id) && i.locked))
          throw new Error(
            "Dit meubel is vergrendeld. Ontgrendel het eerst om het te verwijderen.",
          );
        s.items = s.items.filter((i) => !op.ids.includes(i.id));
        s.walls = s.walls.filter((w) => !op.ids.includes(w.id));
        s.openings = s.openings.filter(
          (o) =>
            !op.ids.includes(o.id) && s.walls.some((w) => w.id === o.wallId),
        );
        s.nodes = s.nodes.filter((n) =>
          s.walls.some((w) => w.startId === n.id || w.endId === n.id),
        );
        break;
      case "RestoreContent":
        Object.assign(s, structuredClone(op.content));
        break;
    }
  }
  s.revision++;
  return validateScene(s);
}
export const contentOf = ({ nodes, walls, openings, items }: Scene) =>
  structuredClone({ nodes, walls, openings, items });
export type Role = "owner" | "admin" | "designer" | "finance" | "viewer";
export function canWrite(role: Role) {
  return ["owner", "admin", "designer"].includes(role);
}
