import { isCreatureBankId } from "./adventure";
import { createSeededRandom } from "./random";
import { NEUTRAL_PLAYER_ID, type CombatBoardArtId, type CombatState, type GameState } from "./state";

export const SHIP_BATTLE_OBSTACLES = [9, 10] as const;

const BASE_BOARD_ART_IDS: readonly CombatBoardArtId[] = ["classic", "frozen", "hell-necro", "jungle-fortress"];
const CREATURE_BANK_BOARD_ART_ID: CombatBoardArtId = "creature-bank-dungeon";

/** These three context marks are reserved for the shared optional PvE director. */
export function isPveEncounterCombat(combat: CombatState | null | undefined): boolean {
  return Boolean(
    combat?.context.kind === "neutral" &&
      (combat.context.waveAssault ||
        combat.context.raidBossId !== undefined ||
        combat.context.dungeonFloor !== undefined)
  );
}

function pveEncounterBoardArtId(state: GameState): CombatBoardArtId {
  return state.adventure?.pveTheme === "doom"
    ? "pve-calamity-doom"
    : "pve-calamity-classic";
}

export function isSeaCombat(state: GameState, combat: CombatState | null | undefined): boolean {
  if (!combat || combat.context.kind === "sandbox") {
    return false;
  }

  return state.adventure?.fields[combat.context.fieldId]?.terrain === "water";
}

export function isSiegeCombat(combat: CombatState | null | undefined): boolean {
  return Boolean(combat && (combat.siege || (combat.context.kind === "player" && combat.context.siege)));
}

/**
 * A Creature Bank fight (Naval Battles optional rule). Gated on the bank id the
 * neutral-combat context carries — set for EVERY bank in `beginNeutralCombatPlacement`
 * from `fieldCreatureBankId(field)`, BEFORE the board art is assigned. Keying on
 * `context.bankId` (rather than a hand-listed subset of banks) means all twelve
 * current banks AND any future bank automatically fight on the dungeon board, and
 * an ordinary Field-Difficulty neutral fight never does.
 */
export function isCreatureBankCombat(combat: CombatState | null | undefined): boolean {
  return Boolean(combat && combat.context.kind === "neutral" && isCreatureBankId(combat.context.bankId));
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

  // The two authored calamity boards belong only to Waves, Raid Bosses and the
  // Dungeon. They are forced by the frozen encounter theme and never enter the
  // random open-field pool.
  if (isPveEncounterCombat(combat)) {
    return [pveEncounterBoardArtId(state)];
  }

  // A Creature Bank is ALWAYS fought on its dungeon board — never a random
  // open-field battlefield — so it is the sole eligible art (mirrors the siege
  // rule below).
  if (isCreatureBankCombat(combat)) {
    return [CREATURE_BANK_BOARD_ART_ID];
  }

  const siege = isSiegeCombat(combat);
  const ids: CombatBoardArtId[] = [...BASE_BOARD_ART_IDS];

  if (siege) {
    ids.push("castle-siege");
  } else if (isSeaCombat(state, combat)) {
    // A fight on the open sea is ALWAYS a naval battle on the ship board — it is
    // the SOLE eligible battlefield (mirrors the bank/siege forced boards
    // above). The land battlefields (classic/frozen/hell-necro/jungle) make no
    // sense on the water, so they are dropped entirely rather than weighted.
    return ["ship-battle"];
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

  if (isPveEncounterCombat(combat)) {
    return pveEncounterBoardArtId(state);
  }

  // A siege is ALWAYS fought on the castle siege board: the defender stands on
  // the castle side, behind the Walls and the Gate that the battle is fought
  // over. The other battlefields are flavour for open-field fights only — a
  // siege must show the fortifications, so it is never a random pick.
  if (isSiegeCombat(combat)) {
    return "castle-siege";
  }

  // A Creature Bank fight always shows the dungeon board (see isCreatureBankCombat).
  if (isCreatureBankCombat(combat)) {
    return CREATURE_BANK_BOARD_ART_ID;
  }

  // A fight on the open sea ALWAYS shows the ship-battle board — never a random
  // land battlefield. Like a siege or a bank, the terrain dictates the board:
  // you are fighting on the water, so the naval map is forced (not just weighted
  // into a pool the random pick could still skip). Checked after siege/bank so a
  // (land) siege keeps the castle board.
  if (isSeaCombat(state, combat)) {
    return "ship-battle";
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
