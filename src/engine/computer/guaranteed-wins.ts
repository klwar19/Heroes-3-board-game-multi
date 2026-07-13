import { neutralBattleLevel } from "../adventure";
import { finishCombatIfNeeded } from "../combat-units";
import { appendEvent } from "../events";
import { neutralCombatControllerId } from "../neutral-control";
import { NEUTRAL_PLAYER_ID } from "../state";
import type { CombatState, GameState, PlayerId } from "../state";
import { isComputerPlayer, sessionModeOf } from "./control";

/**
 * Single-player smoothing (house rule): a computer seat's first TWO eligible
 * neutral-guard battles are guaranteed flawless wins — every guard falls
 * before any unit acts, the computer's army takes zero damage, and the fight
 * ends inside round 1 (no movement spent to extend). ONLY the dice are
 * skipped: the outcome resolves through the normal victory path
 * (finishCombatIfNeeded → ACKNOWLEDGE_COMBAT_END → finalizeAdventureCombat),
 * so experience, Freelancer's Guild gold, neutral-card recycling and the
 * field visit are exactly what a real full win grants.
 *
 * Leading with what does NOT get the guarantee (the abuse guards — the AI's
 * unchanged map policy never reads this module, so it cannot seek fights to
 * exploit the free win):
 * - Guard FIELDS only, difficulty I/II, and only when the hero's own
 *   neutral-battle level already covers the difficulty — exactly the fights
 *   the policy naturally takes (level-I guards first, then level-II from the
 *   II–III tiles it explores). A free win can never leapfrog that ladder.
 * - Creature Banks never qualify (their strength is not level-bounded).
 * - PvP fights never qualify — a human (or another seat) is a participant,
 *   and a PvP-Neutral-Control controller likewise disables the shortcut.
 * - Quick Combat (level > difficulty) resolves BEFORE combat opens and never
 *   consumes a slot: the guarantee covers the first two fights that would
 *   actually be FOUGHT.
 * - Multiplayer sessions and human seats are untouched; from the third
 *   eligible battle on, the seat fights every battle normally.
 */
export const COMPUTER_GUARANTEED_WIN_LIMIT = 2;

/** Abuse cap: only level I/II guards ever qualify for the free win. */
export const COMPUTER_GUARANTEED_WIN_MAX_DIFFICULTY = 2;

/** Guaranteed instant wins this computer seat has consumed (0..LIMIT). */
export function computerGuaranteedWinsUsed(
  state: GameState,
  playerId: PlayerId,
): number {
  return state.computerGuaranteedWins?.[playerId] ?? 0;
}

/**
 * Whether the just-assembled combat qualifies for the seat's guaranteed win.
 * Evaluated at the single combat-start chokepoint (finalizeCombatStart), after
 * the guards are revealed and before any unit acts.
 */
export function combatQualifiesForComputerGuaranteedWin(
  state: GameState,
  combat: CombatState,
): boolean {
  if (sessionModeOf(state) !== "single-player") {
    return false;
  }
  const context = combat.context;
  if (context.kind !== "neutral" || combat.outcome) {
    return false;
  }
  // Guard FIELDS only — a Creature Bank's strength is not bounded by the
  // hero's level, so a free bank win could leapfrog the natural progression.
  if (context.bankId !== undefined) {
    return false;
  }
  const attackerId = combat.attackerPlayerId;
  if (!isComputerPlayer(state, attackerId)) {
    return false;
  }
  if (
    computerGuaranteedWinsUsed(state, attackerId) >=
    COMPUTER_GUARANTEED_WIN_LIMIT
  ) {
    return false;
  }
  // Abuse cap: only the fights the (unchanged) policy naturally takes — level
  // I/II guards the hero's own battle level already covers. Difficulty 0 is
  // the bank/unguarded placeholder and never qualifies either.
  const difficulty = context.difficulty ?? 0;
  if (difficulty < 1 || difficulty > COMPUTER_GUARANTEED_WIN_MAX_DIFFICULTY) {
    return false;
  }
  const hero = state.heroes[context.heroId];
  if (!hero || neutralBattleLevel(state, hero) < difficulty) {
    return false;
  }
  // PvP Neutral Control (defensive; the mode is multiplayer-only): never
  // pre-empt a seat that would PLAY the guards.
  if (neutralCombatControllerId(state, combat)) {
    return false;
  }
  return true;
}

/**
 * Fires the guaranteed win when the open combat qualifies: consumes one slot,
 * strikes every guard down and ends the combat through the normal
 * finishCombatIfNeeded path (the fighter then acknowledges the end and
 * finalizeAdventureCombat grants the real rewards). Returns true when the win
 * fired — the caller skips the rest of combat start.
 */
export function applyComputerGuaranteedWin(state: GameState): boolean {
  const combat = state.combat;
  if (
    !combat ||
    combat.context.kind !== "neutral" ||
    !combatQualifiesForComputerGuaranteedWin(state, combat)
  ) {
    return false;
  }

  const context = combat.context;
  const attackerId = combat.attackerPlayerId;
  const used = computerGuaranteedWinsUsed(state, attackerId) + 1;
  state.computerGuaranteedWins = {
    ...(state.computerGuaranteedWins ?? {}),
    [attackerId]: used,
  };

  combat.setup = null;
  combat.pendingTacticsSwaps = null;

  appendEvent(state, {
    type: "COMPUTER_GUARANTEED_WIN",
    playerId: attackerId,
    heroId: context.heroId,
    fieldId: context.fieldId,
    difficulty: context.difficulty,
    battleNumber: used,
  });

  // Strike every guard down before any unit acts. Direct lethal damage
  // deliberately BYPASSES the removal chokepoint (markUnitRemovedIfNeeded):
  // no rebirth roll may bring a guard back and no on-death Detonate may
  // splash the computer's own units — "flawless" means zero losses,
  // guaranteed. finalizeAdventureCombat still recycles the guard cards to
  // their tier discard piles exactly like a fought-out sweep.
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      unit.damage = unit.maxHealth;
    }
  }
  finishCombatIfNeeded(state);
  return true;
}
