import type { CombatState, GameState, PlayerId } from "../state";
import {
  computeVictoryPoints,
  controlledBuildingCount,
  victoryPointsModeActive,
} from "../victory-points";

// Victory Points mode (victory-points.ts): the game ends when the round limit
// wraps and the most VP wins. These reads let the AI play for the score
// instead of for an economy that ends with the game. Every helper is inert
// (null / 0 / false) when VP mode is off, so normal games are unaffected.

/**
 * Rounds left AFTER this one before the VP scoring (0 = this is the last
 * round). Null when VP mode is off or the game has no round limit — then
 * nothing ends on a known round and the endgame reads below stay off.
 */
export function vpRoundsLeft(state: GameState): number | null {
  if (!victoryPointsModeActive(state)) return null;
  const limit = state.adventure?.mapPreset?.roundLimit;
  if (!limit || limit <= 0) return null;
  return Math.max(0, limit - state.round);
}

/** Buildings in controlled Towns score 1 VP each, at most this many. */
export const VP_BUILDING_CAP = 8;
/**
 * The last rounds in which a building is bought for its VP: one build token
 * per round, and resources left at the scoring are worth nothing. Before
 * this window the development plan decides what (and whether) to build.
 */
export const VP_ENDGAME_BUILD_ROUNDS = 2;

/** Whether one more building in our Towns still adds a Victory Point. */
export function vpBuildingAddsPoint(state: GameState, playerId: PlayerId): boolean {
  return victoryPointsModeActive(state) && controlledBuildingCount(state, playerId) < VP_BUILDING_CAP;
}

/** Whether `winnerId` still earns the 3-VP Main Hero defeat against `loserId`
 * (a Main hero counts once per opponent; a surrender scores only 1 VP). */
export function mainHeroDefeatStillScores(state: GameState, winnerId: PlayerId, loserId: PlayerId): boolean {
  return !(state.adventure?.vpLedger?.[winnerId]?.mainHeroDefeats ?? []).includes(loserId);
}

/**
 * Our VP lead over `rivalId` (alliance totals when allies score together), or
 * null outside VP mode. Read from our own seat view: a rival's hidden hand
 * and deck are empty there, so its Artifact VP can read low.
 */
export function vpLead(state: GameState, playerId: PlayerId, rivalId: PlayerId): number | null {
  if (!victoryPointsModeActive(state)) return null;
  const { breakdown } = computeVictoryPoints(state);
  const own = breakdown.find(row => row.playerId === playerId);
  const rival = breakdown.find(row => row.playerId === rivalId);
  if (!own || !rival) return null;
  return (own.allianceTotal ?? own.total) - (rival.allianceTotal ?? rival.total);
}

/** The VP endgame for PvP decisions: this round and the next one. */
export const VP_ENDGAME_PVP_ROUNDS = 1;
/** A fight whose loss hands the rival the lead needs this much more win chance. */
export const VP_PROTECT_LEAD_MARGIN = 0.2;
/** A fight whose win takes the lead may go this much below the usual bar. */
export const VP_TAKE_LEAD_DISCOUNT = 0.15;

/**
 * Shift of the PvP engage bar in the VP endgame, against a rival MAIN hero:
 * defeating it scores 3 VP (once per opponent) and losing ours hands the rival
 * the same. Ahead by no more than what a loss gives away: demand more. Behind
 * or level by less than what a win brings: accept less. 0 anywhere else.
 */
export function vpEngageBarShift(state: GameState, playerId: PlayerId, enemyId: PlayerId): number {
  const left = vpRoundsLeft(state);
  if (left === null || left > VP_ENDGAME_PVP_ROUNDS) return 0;
  const lead = vpLead(state, playerId, enemyId);
  if (lead === null) return 0;
  const winGain = mainHeroDefeatStillScores(state, playerId, enemyId) ? 3 : 0;
  const lossGift = mainHeroDefeatStillScores(state, enemyId, playerId) ? 3 : 0;
  if (lead > 0 && lead - lossGift <= 0) return VP_PROTECT_LEAD_MARGIN;
  if (lead <= 0 && lead + winGain > 0) return -VP_TAKE_LEAD_DISCOUNT;
  return 0;
}

/**
 * Leaving a lost PvP fight with our MAIN hero: a Retreat (or a fought-out
 * loss) credits the opponent with the 3-VP Main Hero defeat — and the
 * experience of our hero's level — while a Surrender scores it 1 VP and no
 * experience. True when that 3 VP is still open to the opponent.
 */
export function vpSurrenderSavesPoints(state: GameState, playerId: PlayerId, combat: CombatState): boolean {
  if (!victoryPointsModeActive(state) || combat.context.kind !== "player") return false;
  const attacking = combat.attackerPlayerId === playerId;
  const heroId = attacking ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId || state.heroes[heroId]?.kind !== "main") return false;
  const enemyId = attacking ? combat.defenderPlayerId : combat.attackerPlayerId;
  return mainHeroDefeatStillScores(state, enemyId, playerId);
}
