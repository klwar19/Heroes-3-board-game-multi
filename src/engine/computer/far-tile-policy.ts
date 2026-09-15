import { tileDefHasOreMine, tileDefHasResourceMine, tileDefHasSettlement, type FarTileType } from "../far-tile-types";
import type { ComputerObservation } from "./types";

/** Evaluate only the revealed candidates and the engine's offered type menu. */
export function farTileChoiceValue(observation: ComputerObservation, index: number): number | null {
  const flip = observation.state.adventure?.pendingFarTileFlip;
  if (!flip || flip.playerId !== observation.playerId) return null;
  const owns = (kind: FarTileType) => Object.values(observation.state.adventure?.fields ?? {}).some(field =>
    field.flagOwnerId === observation.playerId && (kind === "settlement"
      ? field.location === "settlement"
      : field.location === "mine" && field.resource === kind));
  const kindValue = (kind: FarTileType | null): number => {
    if (!kind) return 12;
    const base = kind === "settlement" ? 60 : kind === "gold" ? 50 : kind === "valuables" ? 46 : 24;
    return base - (owns(kind) ? 8 : 0);
  };
  const tileValue = (id: string | null): number => {
    if (!id) return 0;
    return Math.max(12, tileDefHasSettlement(id) ? kindValue("settlement") : 0,
      ...(["gold", "valuables", "buildingMaterials"] as const).map(kind =>
        (kind === "buildingMaterials" ? tileDefHasOreMine(id) : tileDefHasResourceMine(id, kind)) ? kindValue(kind) : 0));
  };
  switch (flip.offerMode) {
    case "type-choice": return kindValue(flip.typeOptions?.[index] ?? null);
    case "blind": return kindValue(index === 1 ? "gold" : index === 2 ? "valuables" : null);
    case "pick": return tileValue(index === 1 ? flip.lastNonSettlement : flip.candidate);
    case "settlement":
      // The engine offers this only while a Settlement remains available.
      return index === 1 ? 70 : tileValue(index === 2 ? flip.lastNonSettlement : flip.candidate);
    case "mine":
      // One legal free redraw retains the old tile as a fallback. Do not
      // reroll away a Settlement just because the same tile also has ore.
      return index === 1 ? (tileDefHasSettlement(flip.candidate) ? 10 : 65) : tileValue(flip.candidate);
  }
}
