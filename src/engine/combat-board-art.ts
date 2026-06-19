import { createSeededRandom } from "./random";
import { NEUTRAL_PLAYER_ID, type CombatBoardArtId, type CombatState, type GameState } from "./state";

export const SHIP_BATTLE_OBSTACLES = [9, 10] as const;

const BASE_BOARD_ART_IDS: readonly CombatBoardArtId[] = ["classic", "frozen", "hell-necro", "jungle-fortress"];

export function isSeaCombat(state: GameState, combat: CombatState | null | undefined): boolean {
  if (!combat || combat.context.kind === "sandbox") {
    return false;
  }

  return state.adventure?.fields[combat.context.fieldId]?.terrain === "water";
}

export function isSiegeCombat(combat: CombatState | null | undefined): boolean {
  return Boolean(combat && (combat.siege || (combat.context.kind === "player" && combat.context.siege)));
}

function combatFactionIds(state: GameState, combat: CombatState): Set<string> {
  const factionIds: string[] = [];
  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (playerId === NEUTRAL_PLAYER_ID) {
      continue;
    }
    const factionId = state.players[playerId]?.factionId;
    if (factionId) {
      factionIds.push(factionId);
    }
  }
  return new Set(factionIds);
}

export function eligibleCombatBoardArtIds(state: GameState, combat: CombatState | null | undefined): CombatBoardArtId[] {
  if (!combat) {
    return ["classic"];
  }

  const siege = isSiegeCombat(combat);
  const ids: CombatBoardArtId[] = [...BASE_BOARD_ART_IDS];

  if (siege) {
    ids.push("castle-siege");
  } else if (isSeaCombat(state, combat)) {
    ids.push("ship-battle");
  }

  return ids;
}

export function weightedCombatBoardArtIds(state: GameState, combat: CombatState | null | undefined): CombatBoardArtId[] {
  const eligible = eligibleCombatBoardArtIds(state, combat);
  if (!combat) {
    return eligible;
  }

  const pool = [...eligible];
  const eligibleSet = new Set(eligible);
  const factions = combatFactionIds(state, combat);

  if (factions.has("tower") && eligibleSet.has("frozen")) {
    pool.push("frozen", "frozen", "frozen");
  }

  if ((factions.has("inferno") || factions.has("necropolis")) && eligibleSet.has("hell-necro")) {
    pool.push("hell-necro", "hell-necro", "hell-necro");
  }

  if (isSiegeCombat(combat) && eligibleSet.has("castle-siege")) {
    pool.push("castle-siege", "castle-siege", "castle-siege");
  }

  if (!isSiegeCombat(combat) && isSeaCombat(state, combat) && eligibleSet.has("ship-battle")) {
    pool.push("ship-battle", "ship-battle", "ship-battle");
  }

  return pool;
}

export function pickCombatBoardArtId(state: GameState, combat: CombatState | null | undefined): CombatBoardArtId {
  if (!combat) {
    return "classic";
  }

  if (combat.boardArtId) {
    return combat.boardArtId;
  }

  return createSeededRandom(`${state.seed}:${combat.id}:combat-board-art`).pick(weightedCombatBoardArtIds(state, combat));
}

export function applyCombatBoardArtObstacles(combat: CombatState): void {
  if (combat.boardArtId !== "ship-battle") {
    return;
  }

  const obstacles = new Set(combat.obstacles ?? []);
  for (const position of SHIP_BATTLE_OBSTACLES) {
    obstacles.add(position);
  }
  combat.obstacles = [...obstacles].sort((left, right) => left - right);
}

export function assignCombatBoardArt(state: GameState, combat: CombatState): void {
  combat.boardArtId = pickCombatBoardArtId(state, combat);
  applyCombatBoardArtObstacles(combat);
}
