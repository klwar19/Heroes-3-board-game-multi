import {
  COMMANDER_ARTIFACT_SPEC_LIST,
  COMMANDER_ARTIFACT_SPECS,
  aggregateCommanderArtifactBonuses,
  type CommanderArtifactBonuses,
  type CommanderArtifactSpec
} from "@/data/wog/commander-artifacts";
import { createSeededRandom } from "./random";
import type { ArtifactTier, CardId, CombatUnitState, GameState, PlayerId } from "./state";

export const COMMANDER_ARTIFACT_GOLD_COST: Record<ArtifactTier, number> = {
  minor: 5,
  major: 8,
  relic: 11
};

/** Each gold purchase (offer or Forge) raises every later purchase by +2 gold. */
export const COMMANDER_ARTIFACT_REPEAT_SURCHARGE = 2;

/** Cumulative +2-per-purchase price increase for this player's NEXT purchase. */
export function commanderArtifactSurcharge(state: GameState, playerId: PlayerId): number {
  return (state.players[playerId]?.commander?.artifactPurchases ?? 0) * COMMANDER_ARTIFACT_REPEAT_SURCHARGE;
}

/** One gold purchase per round: true while this round's budget is spent. */
export function commanderArtifactBoughtThisRound(state: GameState, playerId: PlayerId): boolean {
  return state.players[playerId]?.commander?.artifactPurchaseRound === state.round;
}

/** Record a completed gold purchase (round budget + escalating price). */
export function noteCommanderArtifactPurchase(state: GameState, playerId: PlayerId): void {
  const commander = state.players[playerId]?.commander;
  if (!commander) return;
  commander.artifactPurchases = (commander.artifactPurchases ?? 0) + 1;
  commander.artifactPurchaseRound = state.round;
}

export function commanderArtifactTierForNeutralVictory(difficulty: number): ArtifactTier | null {
  if (difficulty === 3) return "minor";
  if (difficulty === 4 || difficulty === 5) return "major";
  return null;
}

export function commanderArtifactTierForDungeonFloor(floor: number): ArtifactTier {
  return floor >= 8 ? "relic" : floor >= 4 ? "major" : "minor";
}

/** Queue the optional two-card post-neutral purchase, if it is affordable. */
export function queueNeutralCommanderArtifactOffer(
  state: GameState,
  playerId: PlayerId,
  difficulty: number
): boolean {
  const tier = commanderArtifactTierForNeutralVictory(difficulty);
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!tier || !adventure || !player?.commander) return false;
  if (commanderArtifactBoughtThisRound(state, playerId)) return false;
  const cost = COMMANDER_ARTIFACT_GOLD_COST[tier] + commanderArtifactSurcharge(state, playerId);
  if ((player.resources.gold ?? 0) < cost) return false;
  const cardIds = commanderForgeCandidates(state, playerId, tier).map((spec) => spec.cardId);
  if (cardIds.length === 0) return false;
  adventure.rewardQueue.push({
    playerId,
    kind: "commander-artifact-offer",
    cardIds,
    cost,
    source: `level-${difficulty} Neutral victory`
  });
  return true;
}

const EMPTY_BONUSES = aggregateCommanderArtifactBonuses(undefined);

/** Artifact effects apply only to the owner's live commander combat body. */
export function commanderArtifactBonusesForUnit(
  state: GameState,
  unit: CombatUnitState | undefined | null
): CommanderArtifactBonuses {
  if (!unit?.commanderSlug) return EMPTY_BONUSES;
  return aggregateCommanderArtifactBonuses(state.players[unit.controllerId]?.commander?.artifacts);
}

/** Cards already owned/bound by any player cannot be duplicated by reward paths. */
function commanderArtifactIdsOutsideSharedDecks(state: GameState): Set<string> {
  const claimed = new Set<string>();
  for (const player of Object.values(state.players)) {
    for (const zone of [player.hand, player.deck, player.discard, player.removed]) {
      for (const id of zone) {
        if (COMMANDER_ARTIFACT_SPECS[id]) claimed.add(id);
      }
    }
    for (const id of Object.values(player.commander?.artifacts ?? {})) {
      if (id) claimed.add(id);
    }
  }
  return claimed;
}

/**
 * Available means unclaimed by a player; a copy still waiting in a shared
 * Artifact deck remains available and is removed from that deck when granted.
 */
export function availableCommanderArtifactSpecs(
  state: GameState,
  playerId: PlayerId,
  tier?: ArtifactTier,
  requireEmptySlot = false
): CommanderArtifactSpec[] {
  const player = state.players[playerId];
  if (!player?.commander) return [];
  const claimed = commanderArtifactIdsOutsideSharedDecks(state);
  return COMMANDER_ARTIFACT_SPEC_LIST.filter(
    (spec) =>
      (!tier || spec.tier === tier) &&
      !claimed.has(spec.cardId) &&
      (!requireEmptySlot || !player.commander?.artifacts?.[spec.slot])
  );
}

/** Stable two-card offer: reopening the Forge never rerolls its inventory. */
export function commanderForgeCandidates(
  state: GameState,
  playerId: PlayerId,
  tier: ArtifactTier
): CommanderArtifactSpec[] {
  const candidates = availableCommanderArtifactSpecs(state, playerId, tier, true);
  const random = createSeededRandom(`${state.seed}#commander-forge#${playerId}#${tier}`, { salt: false });
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = random.nextInt(0, index);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled.slice(0, 2);
}

/** Remove the unique card from shared deck zones and put it in the buyer's hand. */
export function grantCommanderArtifactCard(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  const player = state.players[playerId];
  if (!player?.commander || !COMMANDER_ARTIFACT_SPECS[cardId]) return false;
  if (commanderArtifactIdsOutsideSharedDecks(state).has(cardId)) return false;
  for (const deck of Object.values(state.decks)) {
    deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
    deck.discardPile = deck.discardPile.filter((id) => id !== cardId);
  }
  player.hand.push(cardId);
  return true;
}
