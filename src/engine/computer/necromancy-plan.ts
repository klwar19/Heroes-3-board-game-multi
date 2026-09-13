import { coreHeroDefinitions } from "@/data/factions/core";
import { cardLibrary } from "@/data/cards/library";
import type { GameState, PlayerId } from "../state";

/** Only the player's public hero and known cards establish this plan. */
export function hasNecromancyPlan(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const player = state.players[playerId];
  if (player?.factionId !== "necropolis") return false;
  const hero = coreHeroDefinitions[player.heroDefId ?? ""];
  return [
    hero?.startingAbilityCardId,
    hero?.specialtyCardIds?.[1],
    ...player.hand,
    ...player.discard,
  ].some((id) =>
    Boolean(id && cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE"),
  );
}

/** Far guards on Impossible need the earned core; Silver substitutes after
 * casualties. This never blocks home guards or changes engine fight legality. */
export function necropolisFarArmyReady(
  state: GameState,
  playerId: string,
): boolean {
  const army = state.players[playerId]?.army ?? [];
  return [
    "necropolis.skeletons",
    "necropolis.zombies",
    "necropolis.wraiths",
  ].every((id) => army.some((u) => u.unitDefId === id && u.side === "pack"));
}
