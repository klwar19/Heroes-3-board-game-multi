import { bronzeArmyNeedsWithdrawal, openingGuardCommitment } from "./necropolis-combat";
import { coreUnitDefinitions } from "@/data/factions/units";
import { cardLibrary } from "@/data/cards/library";
import { bestAttackOpportunity, evaluateUnitAbility } from "./unit-ability-value";
import { unitAbilities } from "@/data/units/abilities";
import { adventurePvpTroopLoss, getUnitSide } from "../adventure";
import { commanderAdjacentAllies, commanderCastOf } from "../commanders";
import { commanderApSkillOf, commanderValuesMagicGrade } from "@/data/commanders";
import {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
} from "../adventure-reducer";
import {
  getBattlefieldDistance,
  getOrthogonalNeighbors,
  isAdjacent,
} from "../battlefield";
import type { CombatState, CombatUnitState, GameAction, GameState } from "../state";
import type { ComputerActionScore } from "./map-policy";
import {
  distanceToNearestEnemy,
  expectedAttackDamage,
  hasOutputAbility,
  hasThreatAbility,
  isParalyzed,
  livingEnemyUnits,
  pendingIncomingDamage,
  targetPriority,
  unitRemainingHealth,
  unitRemovalHealth,
  tierWeight,
  unitThreatValue,
} from "./score";
import type { ComputerObservation } from "./types";
import { coordinatedReplyDamage } from "./opponent-reply";
import { estimatedStrikeDamage, dealsElementalStrike } from "./strike-value";
import { houseRuleEnabled } from "../house-rules";
import { unitSideStrength } from "./army-strength";
import { canUnitAttack, canUnitMoveAndAttack, getLegalMoveDestinations } from "../legal-actions";
import { getPermanentCardIds } from "../permanents";
import { effectiveInitiative } from "../active-effects";
import { conditionExpectedStrikeDamage, conditionInitiativePrecedes } from "./battlefield-conditions";

/**
 * True when our side is clearly losing a neutral fight: no living unit can
 * still threaten meaningful damage and enemies out-bulk us. Used to prefer
 * RETREAT over CONTINUE when the fight is hopeless (saves MP and units).
 */
function combatIsHopeless(
  observation: ComputerObservation,
  combat: CombatState,
): boolean {
  if (openingGuardCommitment(observation.state as unknown as GameState, observation.playerId, combat) === "fight") return false;
  if (bronzeArmyNeedsWithdrawal(observation.state as unknown as GameState, observation.playerId, combat)) return true;
  const own = Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === observation.playerId &&
      unitRemainingHealth(unit) > 0,
  );
  if (own.length === 0) return true;
  const enemies = livingEnemyUnits(combat, observation.playerId);
  if (enemies.length === 0) return false;
  const ownThreat = own.reduce((sum, u) => sum + unitThreatValue(u), 0);
  const enemyThreat = enemies.reduce((sum, u) => sum + unitThreatValue(u), 0);
  // Once only one or two attackers remain, do not buy another combat round
  // against a materially stronger neutral force. The previous check required
  // both survivors to be almost dead, so a depleted army kept continuing and
  // was then wiped (notably against Mummies). The threshold is TIERED on a
  // real wound having landed: a healthy 2-card army the MAP gate cleared for
  // this fight retreats only when SEVERELY out-bulked (2×) — at a mild
  // mismatch, retreating unwounded at the FIRST continue window makes the map
  // policy immediately send it back in, an enter→retreat loop that bleeds the
  // army in one-round chunks and loses each fight anyway.
  const ownWounded = own.some((u) => u.damage > 0);
  const ownCasualties = Object.values(combat.units).some(
    (unit) => unit.controllerId === observation.playerId && unitRemainingHealth(unit) <= 0,
  );
  const hopelessRatio = ownWounded || ownCasualties ? 1.35 : 2;
  if (own.length <= 2 && enemyThreat >= ownThreat * hopelessRatio) {
    return true;
  }
  // Hopeless when out-bulked by more than 2× and we have at most one unit left,
  // or total threat is tiny vs the opposition.
  if (own.length <= 1 && enemyThreat >= ownThreat * 2.5) return true;
  if (ownThreat * 2 < enemyThreat && own.every((u) => unitRemainingHealth(u) <= 2)) {
    return true;
  }
  return false;
}

// Attack scores live in a band that always outranks the passive activation
// exits (DEFEND = 500, END_ACTIVATION = 400 in the foundation) so a computer
// unit that CAN strike always does, while target quality orders WITHIN the
// band. Kept below the mandatory stage scores (FINISH/PLACE ≥ 900) which belong
// to other combat stages.
const ATTACK_BASE = 620;
export const ATTACK_FLOOR = 560;
export const ATTACK_CEIL = 880;
const SPENT_RETALIATION_BONUS = 18;
// A pure suicide — zero expected damage AND a lethal retaliation invited —
// drops below the high-value Defend band (550+) so the unit is not thrown
// away, while still beating the plain defend/end exits (≤530/400): a unit with
// nothing to protect keeps trading rather than turtling.
const SUICIDAL_ATTACK_SCORE = 545;
// A value-losing trade — the retaliation kills our MORE valuable attacker for
// only a small chip on the defender. Sits just below the high-value Defend
// save (550) so a threatened key unit turtles instead, while plain-defend
// chaff (≤530) still takes the trade.
const BAD_TRADE_ATTACK_SCORE = 548;
// User lesson #7/#10 (2026-09-18, live tutoring): do NOT throw a fragile unit
// into a non-certain attack that a lethal retaliation punishes WHEN a strictly
// better line exists — a durable friendly body that will absorb this same
// enemy's attack and KILL it on the retaliation (the "bait the guard onto the
// Wraith, protect it, kill on the boosted counter" line). Then the fragile unit
// holds (Defend) and lets the enemy come to the body we can punish it with.
// This is NOT rigid passivity: it fires ONLY when such a bait body exists — with
// no better line the unit still trades or gambles (flexible, RNG-aware, per the
// certain-kill doctrine, since not every game rolls the same). Sits BELOW plain
// Defend (500) so the fragile unit turtles instead of gambling, while still
// beating END_ACTIVATION (400) as a last resort. Neutral fights only (PvP tier
// logic owns its own trades).
const NONCERTAIN_LETHAL_RETALIATION_SCORE = 470;
// Ranked replay room-room-nciy4l (Absolution vs VuHy, 2026-08-29) exposed a
// terminal version of the same mistake: a 4-Health Shaman chipped a Haspid for
// 1, invited a 4-damage retaliation, and died, immediately losing the PvP
// battle. A commander is not an ordinary tradeable stack—its removal ends the
// fight and leaves a costly persistent death—so a non-lethal attack that is
// expected to kill it on retaliation must lose even to END_ACTIVATION (400).
// Lethal attacks are unaffected because a removed defender cannot retaliate.
const COMMANDER_RETALIATION_DEATH_SCORE = 350;
// Enemy shooters strike every round without exposing themselves to melee
// retaliation — removing (or pressuring) them first is the classic opening.
const RANGED_TARGET_BONUS = 18;
// Reaching an enemy caster / activation-threat (Enchanter heal, Faerie Bolt,
// Genie, splash…) with our melee this activation is the same "deny the backline"
// hunt as pressuring a shooter — a strong humans-deny-shooters bonus.
const CASTER_TARGET_BONUS = 14;
// PvP only: humans hunt the enemy's GOLD body. Ranked-replay evidence (16 PvP
// fights, 167 attacks, 2026-09-10/11): gold bodies took 49.7% of attacks at
// 44.5% of the bodies, shooters 8.4% at 14.7%, and 17 of 24 opening attacks
// went at a gold stack (1 at a shooter); 26 of 27 unit-targeted spells hit
// gold or better. The /4 threat term above prices a whole gold tier at 5,
// below the flat shooter bonus, so the AI opened on the shooter instead.
// Neutral fights keep the shooter hunt: guard parties are scripted.
const PVP_TIER_TARGET_CAP = 24;
// Reach-aware target value (siege observation 2026-09-16): the defending Arrow
// Tower shot a Centaur Pack parked OUTSIDE the intact walls instead of the
// Elves shooting the garrison every round. The Centaur could not touch anyone
// for rounds; the Elves were the only damage coming in. An enemy's threat is
// therefore discounted by its STRIKE HORIZON — how many of its own activations
// it needs before it can hit ANY of our units, read off the real move engine
// (speed, blockers, walls/gate, flying): 0 = it strikes on its next activation
// (full value), 1 = it must spend a whole activation walking first, 2+ = it
// cannot reach us for at least two activations (a body behind intact
// fortifications, a slow stack across the board). Only the threat-derived
// terms are discounted (chip threat slice, PvP tier prize, Pack→Few flip value,
// and half of a kill's threat premium); the raw chip/kill value, the shooter and
// caster bonuses (a shooter always reaches, an activation ability needs no
// reach) and the Behemoth ruling premium are untouched, so a kill stays a kill.
const STRIKE_HORIZON_REACH = [1, 0.75, 0.45] as const;
// A hopeless PvP fight after a real casualty: the in-fight Retreat (5 gold,
// −1 morale, fall back home; survivors kept in losing-troop mode). Two of the
// 14 decided ranked PvP fights ended exactly so, with stacks still standing.
// Placed above every non-lethal poke and Defend (≤ ~720) but BELOW a lethal
// attack (≥ 780) so a kill that can still turn the fight is never conceded.
const PVP_CONCEDE_SCORE = 760;
// Focus fire: reward stacking damage onto a body reachable allies can also hit,
// capped so it orders WITHIN the attack band without swamping the lethal/chip
// signal, and a larger bonus when this hit plus those allies can FINISH it now.
const FOCUS_PRESSURE_CAP = 24;
const FOCUS_FINISH_BONUS = 24;
// Heal race (user doctrine 2026-09-15: counter an enemy heal with TIMING +
// FOCUS, never by avoiding the chip). When the PvP enemy heals EVERY round — a
// First Aid Tent in play, a healer unit (Enchanter-class activation heal) or a
// commander whose cast heals — a stack left alive-but-chipped is topped back up,
// while a REMOVED stack cannot be healed. Ranked replay dc1o0g R14: five
// Archangels healed +1 (tent) +1/+2/+1 (specialty) in one round while the
// other seat's damage was spread thin across the wall. Extra premium on this
// hit being a kill, or one the army can finish this round; orders WITHIN the
// attack band (below a plain lethal's 160+threat jump).
const HEAL_RACE_FINISH_BONUS = 14;
const FIRST_AID_TENT_CARD_ID = "war_machine.first_aid_tent";
// Removing a unit before it takes this round's activation is a larger tempo
// swing than finishing an otherwise-identical unit that already acted.
const UNACTED_FINISH_BONUS = 6;
// Kill-the-Behemoth premium (user ruling 2026-09-15): a hit that REMOVES an
// output-ability threat (Crushing Blow / Defense shred / double attack), or one
// the army can finish this round, outranks an equal removal of an ordinary body —
// and doubly so when the threat has not yet acted, denying its swing entirely.
// Sized to order WITHIN the attack band (below a plain lethal's 160+threat jump)
// without letting a Behemoth kill swamp a same-round lethal on another key body.
const OUTPUT_THREAT_KILL_BONUS = 18;
const OUTPUT_THREAT_UNACTED_BONUS = 16;
// Deployment penalties for parking our gold/azure lvl-7 in a Behemoth-class
// threat's round-1 reach (user ruling 2026-09-15 — "VERY DANGEROUS"). REACH = the
// threat acts BEFORE our body and crushes it where it stands: sized to OUTWEIGH the
// front-vs-back formation-fit swing (~55) so the gold deploys OUT of reach even
// though the front is its "nicer" cell — it walks up and strikes on its own turn
// instead of eating the round-1 crush. MOVER = our body acts first, so it can
// strike then step clear — a mild nudge only. When the threat reaches EVERY cell
// the penalty is uniform (no distortion); it only pulls the gold to a genuinely
// safer cell when one exists.
const OUTPUT_THREAT_GOLD_REACH_PENALTY = 72;
const OUTPUT_THREAT_GOLD_MOVER_PENALTY = 12;
// A non-lethal poke that the army cannot finish this round, thrown at a
// safely-skippable PARALYZED enemy, would only wake it (any damage removes the
// Paralysis token, cancelling the activation it was going to skip). Score it
// below the passive exits (END_ACTIVATION = 400) so the unit holds / does
// something real instead of trading its strike to wake a sleeper. A lethal hit
// (or one the army can finish) never reaches this — those remove the unit.
const PARALYSIS_WAKE_POKE_SCORE = 360;
// A PvP chip whose retaliation plus the opponents' remaining activations are
// projected to remove the attacker. Below Defend / useful movement, but above
// END_ACTIVATION so the unit still trades when no safer action exists.
const PVP_OVEREXTENSION_ATTACK_SCORE = 495;
// User ruling (2026-09-16): in PvP, poking UP the tier ladder — a bronze 2-Attack
// body into a gold lvl-7 (Defense 2–3) — for 0–1 damage while the gold's
// retaliation is still live is a wasted activation AND a wounded/dead bronze.
// It is only worth doing when the poke REMOVES the retaliation for someone: the
// gold already retaliated this round (the SPENT_RETALIATION_BONUS branch), or a
// stronger un-acted ally can hit the same body this round and our chaff eats
// the counter-hit for it (`retaliationSoakFollowUp`). Otherwise the poke drops
// below Defend (500+) and every closing / screening march (520+) but stays
// above END_ACTIVATION (400) so the unit still trades when nothing else exists.
const TIER_DOWN_POKE_SCORE = 490;
// The poke is a soak only when the ally it protects would otherwise eat a
// counter-hit that matters — at least this much retaliation damage on it.
const SOAK_FOLLOW_UP_MIN_RETALIATION = 2;
// Focus march: how strongly a MOVE toward the highest value-adjusted target is
// preferred (and the mild penalty for stepping away from it).
const FOCUS_MARCH_BONUS = 14;
const FOCUS_MARCH_AWAY_PENALTY = 6;
// User lesson (2026-09-17, live tutoring): a FLYER cannot be screened away from
// a shooter, and you cannot defend against ranged — so a flyer landing that lets
// it reach and strike an enemy SHOOTER endangering our own ranged unit is worth
// more than generic close-distance positioning OR setting up a same-round kill on
// a lesser non-shooter body. The shooter's own retaliation-priced attackScore is
// the base; this lifts a real shooter hit one clear tier above such a kill so the
// flyer converges to neutralize the shooter. A probable-but-not-die-guaranteed
// shooter kill (scored a non-lethal chip by attackScore, because the removal
// needs a good roll) is exactly the case this rescues. Tightly gated: only a
// flyer, only when we actually have a friendly ranged unit to protect, only a
// landing whose shooter strike is a genuine hit, and never when the shooter is
// already reachable from the current cell (that is a direct ATTACK_UNIT).
const FLYER_SHOOTER_HUNT_BONUS = 96;
// Neutral-fight priority floor for a flyer that reaches+strikes an enemy shooter.
// User ruling (2026-09-18, live tutoring): in a neutral fight the flyer's job is
// to fly out and KILL the enemy ranged unit (it shoots every round and cannot be
// defended against; only the flyer reaches the backline turn 1). That must beat
// an easy chaff kill — the shooter chip is FINISHED this turn with a boost card
// / another unit, while the chaff is handled by melee (and baited onto a
// retaliation later). This floor sits just above the physical-kill band (chaff
// lethals cap near ATTACK_CEIL 880) but below the mandatory stage tier (≥900).
const NEUTRAL_FLYER_SHOOTER_FLOOR = 890;
// Flyer JAMS the shooter while striking a bigger body (user ruling refinement
// 2026-09-18, live tutoring): a ranged unit with an adjacent enemy CANNOT shoot —
// it may only strike that adjacent unit (legal-actions ranged gate). So a flyer
// does NOT have to spend its strike KILLING the shooter; landing adjacent already
// neutralises it for free. When the SAME landing lets the flyer strike a different
// (more dangerous) enemy body AND sit adjacent to the shooter, that double duty —
// jam + remove another threat — beats simply killing the shooter. Sits one nudge
// above the plain shooter floor, still below the ≥900 mandatory stage tier.
const NEUTRAL_FLYER_JAM_BIGGER_FLOOR = 896;
// Polish Wait. The old scoring gave a healthy unit 560..580 — ABOVE the attack
// FLOOR (560) and above every closing march (≤ ~554) — so the computer waited
// with almost every unit almost every round instead of striking or advancing.
// Wait is a tempo tool, not a default:
//  - WAIT_IDLE keeps it above END_ACTIVATION (400) only, so a strike, a Defend
//    (500+) and any closing march (520+) all beat it;
//  - WAIT_BAIT is the ONE real upside — the unit cannot strike from where it
//    stands, but an enemy that has not yet acted this round stands one step
//    away, so acting last lets it come to us instead of us walking into it.
//    Still under the attack floor, so a reachable move-and-attack wins.
const WAIT_IDLE_SCORE = 430;
const WAIT_BAIT_SCORE = 555;
// Board distance at which an enemy that has not yet activated is expected to
// close onto us on its own activation (1 = already adjacent).
const WAIT_BAIT_MAX_DISTANCE = 2;
// A besieger with a living enemy BODY in reach should hit the body, not the
// masonry (a Wall/Gate deals no damage and takes no activation from the enemy).
// Below the attack floor (560) and the two "bad attack" scores (545/548), above
// Defend's base (500) so a wall still beats turtling.
const FORTIFICATION_WITH_TARGET_SCORE = 540;
// Nothing to hit — breaking in IS the play (unchanged from the old flat score).
const FORTIFICATION_BREACH_SCORE = 640;

/**
 * Hydra/Cerberi-style value from having at least one OTHER adjacent enemy when
 * attacking. Read from the actual ability effect so Pack-only abilities apply
 * automatically and Few sides without the printed head do not get the bonus.
 */
function surroundOpportunityBonus(
  combat: CombatState,
  playerId: string,
  unit: CombatUnitState,
  position: number,
): number {
  const adjacentEnemies = livingEnemyUnits(combat, playerId).filter((enemy) =>
    isAdjacent(position, enemy.position),
  ).length;
  if (adjacentEnemies < 2) return 0;

  let bonus = 0;
  for (const abilityId of unit.abilities ?? []) {
    const effect = unitAbilities[abilityId]?.effect;
    if (effect?.type === "FLAT_DAMAGE_ADJACENT_TO_SELF") {
      bonus = Math.max(bonus, 28);
    } else if (effect?.type === "SECOND_ATTACK_ONE_ADJACENT_TO_SELF") {
      bonus = Math.max(bonus, 42);
    } else if (effect?.type === "SECOND_ATTACK_ALL_ADJACENT_TO_SELF") {
      bonus = Math.max(bonus, Math.min(70, (adjacentEnemies - 1) * 30));
    }
  }
  return bonus;
}

function pendingIncomingDamageAtPosition(
  combat: CombatState,
  unit: CombatUnitState,
  position: number,
  removedEnemyId?: string,
  state?: GameState,
): number {
  return coordinatedReplyDamage(combat, unit, position, removedEnemyId, state);
}

/**
 * Risk of ending an action on a square multiple enemies can collapse onto.
 * Friendly adjacency represents a supported line; unsupported extra enemies
 * and lethal projected damage make a surrounded destination unattractive.
 */
function positionalExposurePenalty(
  combat: CombatState,
  playerId: string,
  unit: CombatUnitState,
  position: number,
  removedEnemyId?: string,
): number {
  const enemies = livingEnemyUnits(combat, playerId).filter(
    (enemy) =>
      enemy.id !== removedEnemyId && isAdjacent(position, enemy.position),
  );
  const support = livingFriendlies(combat, playerId).filter(
    (friend) => friend.id !== unit.id && isAdjacent(position, friend.position),
  ).length;
  // Multi-headed attackers deliberately accept one extra adjacent enemy: it is
  // a second target, not merely exposure. A third/fourth body remains danger.
  const multiHeadCoverage =
    surroundOpportunityBonus(combat, playerId, unit, position) > 0 ? 1 : 0;
  const unsupported = Math.max(
    0,
    enemies.length - Math.max(1, support) - multiHeadCoverage,
  );
  const incoming = enemies.reduce(
    (sum, enemy) =>
      enemy.activatedThisRound
        ? sum
        : sum + expectedAttackDamage(enemy, unit),
    0,
  );
  return (
    unsupported * 28 +
    (incoming >= unitRemainingHealth(unit) && enemies.length > 1 ? 30 : 0)
  );
}

/** Whether this attack would let the defender retaliate for damage back. */
function provokesRetaliation(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackFromPosition: number,
): boolean {
  if (defender.retaliatedThisRound) return false;
  if (attacker.abilities?.includes("ignores-retaliation")) return false;
  // A ranged unit shooting from range draws no retaliation; only a melee-range
  // strike (adjacent after any move) does. Move-and-attack always lands adjacent.
  if (
    attacker.type === "ranged" &&
    !isAdjacent(attackFromPosition, defender.position)
  ) {
    return false;
  }
  return true;
}

/**
 * Board signature for the strike-horizon cache: tests and some helpers mutate
 * a combat in place, so identity alone could serve a stale horizon.
 */
function strikeHorizonSignature(combat: CombatState, state: GameState): string {
  const units = Object.values(combat.units)
    .map((unit) => `${unit.id}@${unit.position}:${unit.damage}:${unit.activatedThisRound ? 1 : 0}${unit.type[0]}${isParalyzed(unit) ? "P" : ""}`)
    .join("|");
  const siege = combat.siege
    ? `#${combat.siege.walls.join(",")}/${combat.siege.gatePosition ?? "x"}`
    : "";
  // The horizon reads movement/attack legality through the live activeEffects
  // (Haste, Slow, Blind, Forgetfulness …), so an effect added or expiring with
  // no position/damage change must also invalidate the cached horizons.
  const effects = (state.activeEffects ?? []).map((effect) => effect.id).join(",");
  return `${combat.round}${siege}|${units}|${effects}`;
}

const strikeHorizonCache = new WeakMap<CombatState, { signature: string; horizons: Map<string, number> }>();

/**
 * How many of its own activations `enemy` needs before it can strike ANY living
 * unit of `playerId` (see STRIKE_HORIZON_REACH). The enemy is projected FRESH
 * (as at the start of its next activation) and its reach is read from the real
 * legal-move engine: 0 when it can attack or move-and-attack one of ours, 1 when
 * some first-move landing lets a second move end adjacent to one of ours, else
 * 2. Adjacency approximates the second-activation melee strike, so this only
 * ORDERS targets — it never makes a move legal or illegal. A shooter that
 * cannot shoot anyone right now (Forgetfulness-style) counts as 1: it recovers.
 * Cached per board so the extra reach scans cost one pass per decision.
 */
function enemyStrikeHorizon(
  combat: CombatState,
  playerId: string,
  enemy: CombatUnitState,
  state: GameState,
): number {
  const signature = strikeHorizonSignature(combat, state);
  let cache = strikeHorizonCache.get(combat);
  if (!cache || cache.signature !== signature) {
    cache = { signature, horizons: new Map() };
    strikeHorizonCache.set(combat, cache);
  }
  const key = `${playerId}>${enemy.id}`;
  const cached = cache.horizons.get(key);
  if (cached !== undefined) return cached;

  const ours = livingFriendlies(combat, playerId).filter((unit) => unit.id !== enemy.id);
  let horizon = 2;
  if (ours.length === 0) {
    horizon = 0;
  } else {
    const activeEffects = state.activeEffects ?? [];
    const fresh: CombatUnitState = {
      ...enemy,
      activatedThisRound: false,
      movedThisActivation: false,
      attackedThisActivation: false,
      waitPending: false,
    };
    const board: CombatState = { ...combat, waitPhase: false, units: { ...combat.units, [enemy.id]: fresh } };
    if (ours.some((unit) => canUnitAttack(board, fresh, unit, activeEffects))) {
      horizon = 0;
    } else if (fresh.type === "ranged") {
      horizon = 1;
    } else {
      const landings = getLegalMoveDestinations(board, fresh, state);
      // Adjacency prefilter keeps the (BFS-backed) move-and-attack check to the
      // few landing/target pairs that could possibly strike.
      if (landings.some((landing) => ours.some((unit) =>
        isAdjacent(landing, unit.position) && canUnitMoveAndAttack(board, fresh, landing, unit, state)))) {
        horizon = 0;
      } else {
        for (const landing of landings) {
          const moved: CombatUnitState = { ...fresh, position: landing };
          const movedBoard: CombatState = { ...board, units: { ...board.units, [enemy.id]: moved } };
          if (getLegalMoveDestinations(movedBoard, moved, state).some((cell) =>
            ours.some((unit) => isAdjacent(cell, unit.position)))) {
            horizon = 1;
            break;
          }
        }
      }
    }
  }
  cache.horizons.set(key, horizon);
  return horizon;
}

/**
 * Whether the PvP opponents of `playerId` heal every round: a First Aid Tent
 * permanent, a living healer unit (activation heal ability) or a commander whose
 * cast is a heal. Hidden hand cards are not read — only public state.
 */
function enemyHealsEachRound(combat: CombatState, playerId: string, state: GameState): boolean {
  if (combat.context?.kind !== "player") return false;
  const enemies = livingEnemyUnits(combat, playerId);
  const enemySeats = new Set(enemies.map((unit) => unit.controllerId));
  for (const seat of enemySeats) {
    if (getPermanentCardIds(state, seat).includes(FIRST_AID_TENT_CARD_ID)) return true;
  }
  return enemies.some((unit) => {
    if (unit.position < 0) return false;
    if ((unit.abilities ?? []).some((abilityId) =>
      unitAbilities[abilityId]?.effect?.type === "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF")) return true;
    const cast = unit.commanderSlug ? commanderCastOf(unit) : null;
    return cast?.effect.kind === "heal" || cast?.effect.kind === "heal-cleanse";
  });
}

/**
 * Whether a cheap poke at `defender` this activation serves as a RETALIATION
 * SOAK: a more valuable, un-acted ally can strike the same body later this
 * round with a real hit (≥2 damage), would itself draw the retaliation (melee
 * contact, no ignores-retaliation), and that counter-hit would matter
 * (≥ SOAK_FOLLOW_UP_MIN_RETALIATION on the ally). Reach is read off the real
 * legal-move engine on the board AFTER the poker has landed (its body may open
 * or block a landing cell), so this only orders actions and never legalises one.
 */
function retaliationSoakFollowUp(
  combat: CombatState,
  playerId: string,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackFromPosition: number,
  state: GameState,
): boolean {
  const activeEffects = state.activeEffects ?? [];
  const board: CombatState = {
    ...combat,
    units: { ...combat.units, [attacker.id]: { ...attacker, position: attackFromPosition } },
  };
  const attackerValue = unitThreatValue(attacker);
  return Object.values(combat.units).some((ally) => {
    if (
      ally.controllerId !== playerId ||
      ally.id === attacker.id ||
      ally.position < 0 ||
      ally.activatedThisRound ||
      ally.attackedThisActivation ||
      isParalyzed(ally) ||
      unitRemainingHealth(ally) <= 0 ||
      ally.abilities?.includes("ignores-retaliation") ||
      unitThreatValue(ally) <= attackerValue
    ) {
      return false;
    }
    // A shooter at range draws no retaliation, so nothing is soaked for it.
    if (ally.type === "ranged" && !isAdjacent(ally.position, defender.position)) return false;
    if (estimatedStrikeDamage(defender, ally, defender.position, true) < SOAK_FOLLOW_UP_MIN_RETALIATION) return false;
    if (estimatedStrikeDamage(ally, defender, ally.position) < 2) return false;
    if (canUnitAttack(board, ally, defender, activeEffects)) return true;
    if (ally.type === "ranged") return false;
    return getLegalMoveDestinations(board, ally, state).some((landing) =>
      isAdjacent(landing, defender.position) &&
      estimatedStrikeDamage(ally, defender, landing) >= 2 &&
      canUnitMoveAndAttack(board, ally, landing, defender, state));
  });
}

// A shooter whose THREAT survives being jammed: it carries an ability that fires
// on ITS OWN attack and harms us regardless of range, so pinning it in melee does
// NOT neutralise it — it still swings (in melee) and triggers the effect. Such a
// shooter must be KILLED, never merely blocked. Power Drain (Magi) discards one of
// our cards on every attack (a random one if we hold no Power card), so a jammed
// Magi can still strip a key card (e.g. Learning) — kill it. User ruling
// (2026-09-18, live tutoring).
const SHOOTER_MUST_KILL_ON_ATTACK_EFFECTS = new Set<string>([
  "ENEMY_DISCARDS_POWER_OR_RANDOM",
]);
function shooterThreatSurvivesJam(unit: CombatUnitState): boolean {
  return (unit.abilities ?? []).some((abilityId) => {
    const effect = unitAbilities[abilityId]?.effect?.type;
    return Boolean(effect && SHOOTER_MUST_KILL_ON_ATTACK_EFFECTS.has(effect));
  });
}

// Neutral must-kill floor: attacking a defense-ignoring ONE-SHOTTER we can boost
// to a guaranteed lethal outranks an easy chaff kill (below the ≥900 mandatory tier).
const NEUTRAL_MUST_KILL_ONESHOTTER_FLOOR = 895;

// Total ATTACK boost the player could stack on THIS attacker's strike from cards in
// hand (direct stat cards and the attack option of a CHOOSE_ONE specialty), doubling
// a might-specialty bonus that lands on its signature unit. Used only to tell whether
// a def-ignoring one-shotter is a REACHABLE guaranteed kill — a chip is worthless
// against it (its retaliation ignores our defense), so we commit only a lethal.
function handAttackBoostFor(
  state: GameState,
  playerId: string,
  attacker: CombatUnitState,
): number {
  const hand = state.players[playerId]?.hand ?? [];
  const signature = (attacker.unitDefId ?? "").toLowerCase();
  let total = 0;
  for (const cardId of hand) {
    const card = cardLibrary[cardId];
    if (!card) continue;
    const effects = card.effect?.type === "CHOOSE_ONE"
      ? card.effect.options.map((option) => option.effect)
      : [card.effect];
    let best = 0;
    for (const effect of effects) {
      if (effect?.type === "ADD_COMBAT_STAT" && effect.stat === "attack") {
        let amount = effect.amount ?? 1;
        const doubleName = (effect as { doubleForUnitName?: string }).doubleForUnitName;
        if (doubleName && signature.includes(doubleName.toLowerCase())) amount *= 2;
        best = Math.max(best, amount);
      }
    }
    total += best;
  }
  return total;
}

/**
 * Rank one of the active unit's legal attacks. A lethal removal is always
 * preferred (it deletes the enemy AND avoids their retaliation), scaled by how
 * dangerous the removed unit was; otherwise reward damage as a fraction of the
 * target's remaining health plus a slice of its threat, minus a nudge for the
 * retaliation the surviving defender would deal back.
 *
 * Multi-unit focus-fire: prefer the same enemy allies already threaten (or the
 * lowest-remaining high-threat target) so the army finishes units instead of
 * spreading chips.
 */
function attackScore(
  combat: CombatState,
  playerId: string,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackFromPosition: number,
  state: GameState,
): number {
  if (bronzeArmyNeedsWithdrawal(state, playerId, combat)) return 180;
  const remaining = unitRemainingHealth(defender);
  const threat = unitThreatValue(defender);
  const damage = estimatedStrikeDamage(attacker, defender, attackFromPosition);
  const griffinShooterAttack = attacker.unitDefId === "castle.griffins" && defender.type === "ranged";
  if (["castle.marksmen", "stronghold.wolf_raiders"].includes(attacker.unitDefId ?? "") &&
      defender.defense >= 2 && livingEnemyUnits(combat, playerId).some(enemy =>
        enemy.id !== defender.id && enemy.defense < 2 &&
        canUnitAttack({ ...combat, units: { ...combat.units, [attacker.id]: { ...attacker, position: attackFromPosition } } },
          { ...attacker, position: attackFromPosition }, enemy, state.activeEffects ?? []))) return 200;
  // Overkill past the current bar is not extra value: a Pack flip carries the
  // excess onto the Few side (rewarded below as the flip), a stack token absorbs
  // it. Uncapped, a 10-Attack hit on a 3-Health bar scored 3.3 bars and outbid a
  // real kill elsewhere.
  const damageFraction = remaining > 0 ? Math.min(1, damage / remaining) : 0;
  // Reach discount for every threat-derived term (see STRIKE_HORIZON_REACH).
  const reach = STRIKE_HORIZON_REACH[Math.min(2, enemyStrikeHorizon(combat, playerId, defender, state))];
  // Do not erase retaliation/reply risk on a kill that needs a neutral die.
  // Deterministic elemental damage keeps its printed value under that rule.
  const lowDamage = estimatedStrikeDamage(attacker, defender, attackFromPosition, false,
    dealsElementalStrike(attacker) && houseRuleEnabled(state, "elemental-damage-no-die") ? 0 : -1);
  const lethal = lowDamage > 0 && lowDamage >= unitRemovalHealth(defender);
  const ownRemaining = unitRemainingHealth(attacker);
  let retaliationDamage = 0;
  // Does this hit flip the defender's Pack down to its weaker Few side? (Valued
  // below; also exempts the tier-down poke rule — a flip IS bringing it down.)
  const flipsDefenderToFew = defender.variant === "pack" && Boolean(defender.unitDefId) &&
    lowDamage >= unitRemainingHealth(defender);

  // Project the attacker's landing before measuring immediate follow-ups.
  // Engaged/disabled shooters and paralyzed allies cannot supply a free shot.
  const projectedAttacker = { ...attacker, position: attackFromPosition };
  const attackBoard = { ...combat, units: { ...combat.units, [attacker.id]: projectedAttacker } };
  const reachingAllies = Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === playerId &&
      unit.id !== attacker.id &&
      unitRemainingHealth(unit) > 0 &&
      !unit.activatedThisRound &&
      !unit.attackedThisActivation &&
      unit.position >= 0 &&
      !isParalyzed(unit) &&
      canUnitAttack(attackBoard, unit, defender, state.activeEffects ?? []),
  );
  // Breaking a Pack's first health bar is a flip, not a removal. Do not use
  // that false finish to justify waking paralysis or exposing a valuable unit.
  const armyCanFinish = lowDamage + reachingAllies.reduce((sum, unit) => sum + estimatedStrikeDamage(unit, defender,
    unit.position, false, dealsElementalStrike(unit) && houseRuleEnabled(state, "elemental-damage-no-die") ? 0 : -1), 0) >= unitRemovalHealth(defender);

  // Don't wake a safely-skippable paralyzed enemy for chip: any damage removes
  // its Paralysis token, cancelling the activation it would have skipped. Only a
  // kill — or a hit the army can finish this round (the wake-up is then moot) —
  // is worth it; otherwise leave the sleeper be.
  if (
    !lethal &&
    !armyCanFinish &&
    isParalyzed(defender) &&
    !defender.activatedThisRound
  ) {
    return PARALYSIS_WAKE_POKE_SCORE;
  }

  // Does this strike draw a retaliation? A Vampire or Hydra (ignores-retaliation)
  // or a ranged unit shooting from range does NOT — so its hit is FREE value and
  // the bad-trade / overextension bails below must never suppress it (user ruling
  // 2026-09-15: a no-retaliation attacker always attacks; chipping is never a bad
  // trade when nothing hits back — Hydra Pack in particular wants to be surrounded
  // and swing at everyone, rewarded by surroundOpportunityBonus).
  const drawsRetaliation = provokesRetaliation(attacker, defender, attackFromPosition);
  let quality: number;
  if (lethal) {
    // A kill is permanent, so only half of its threat premium follows the reach
    // discount: deleting the active shooter still outranks deleting an equal
    // body that cannot reach us yet, but that body's removal stays a real kill.
    quality = 160 + Math.round(Math.min(80, threat) * (0.5 + 0.5 * reach));
  } else {
    quality = Math.round(damageFraction * 80) + Math.min(40, Math.round((threat * reach) / 4));
    if (griffinShooterAttack && damage > 0) quality += 65;
    // Physical attackers should work through low-Defense targets and leave a
    // heavily armoured body to Defense-ignoring spells when available.
    quality += Math.min(18, damage * 3);
    if (damage === 0) quality -= 35;
    else quality -= Math.min(18, Math.max(0, defender.defense - attacker.attack) * 3);
    if (drawsRetaliation) {
      const retaliation = estimatedStrikeDamage(defender, attacker, defender.position, true);
      retaliationDamage = retaliation;
      if (
        attacker.commanderSlug &&
        retaliation >= ownRemaining &&
        !lethal
      ) {
        return COMMANDER_RETALIATION_DEATH_SCORE;
      }
      // Tier-down poke (user ruling 2026-09-16, PvP only): a lower-tier body
      // chipping a higher-tier one for ≤1 damage while eating a live counter-hit
      // neither brings the target down (no kill, no finish, no Pack→Few flip —
      // a die-0 hit that empties its current bar is a PROBABLE flip/removal and
      // is exempt too) nor removes its retaliation for anyone — unless a
      // stronger ally follows up on that body this round, in which case the poke
      // is the soak that buys the ally a free hit and keeps its attack-band score.
      if (
        combat.context?.kind === "player" &&
        !armyCanFinish &&
        !flipsDefenderToFew &&
        damage < remaining &&
        retaliation > 0 &&
        damage <= 1 &&
        tierWeight(defender.grade) > tierWeight(attacker.grade) &&
        // The anti-Fuyuki front-line doctrine below (+1200 / +900) is a user
        // order that every body swings at the Pack; it keeps precedence.
        !(defender.variant === "pack" &&
          (defender.unitDefId === "fuyuki.berserkers" || defender.unitDefId === "fuyuki.sabers")) &&
        !retaliationSoakFollowUp(combat, playerId, attacker, defender, attackFromPosition, state)
      ) {
        return TIER_DOWN_POKE_SCORE;
      }
      quality -= Math.min(50, retaliation * 4);
      if (damage === 0 && retaliation >= ownRemaining) {
        return SUICIDAL_ATTACK_SCORE;
      }
      // Bait-and-retaliate (user lesson #7/#10 — see
      // NONCERTAIN_LETHAL_RETALIATION_SCORE). Our chip cannot kill (so the target
      // lives to retaliate), we survive the median counter but the target's +1
      // die counter KILLS us — AND we have a strictly better line: a durable
      // friendly body that survives this enemy's own attack and whose retaliation
      // reliably removes it. Hold the fragile unit and let the enemy be baited
      // onto the body we punish it with, rather than trading ourselves away. With
      // no such bait body this never fires, so a lone unit still trades/gambles.
      if (
        combat.context?.kind !== "player" &&
        !armyCanFinish &&
        damage > 0 &&
        damage < remaining &&
        retaliation < ownRemaining &&
        estimatedStrikeDamage(defender, attacker, defender.position, true, 1) >= ownRemaining &&
        Object.values(combat.units).some((bait) =>
          bait.controllerId === playerId &&
          bait.id !== attacker.id &&
          unitRemainingHealth(bait) > 0 &&
          // Survives THIS enemy's median attack (we hold Defense for the +1 case).
          estimatedStrikeDamage(defender, bait, defender.position) < unitRemovalHealth(bait) &&
          // Its retaliation reliably removes the enemy — baiting the enemy onto it
          // kills the enemy for free, a strictly better line than our chip.
          estimatedStrikeDamage(bait, defender, bait.position, true) >= unitRemovalHealth(defender))
      ) {
        return NONCERTAIN_LETHAL_RETALIATION_SCORE;
      }
      // Expected-value trade: refuse ONLY when the counter-hit KILLS our
      // attacker (we lose its whole value), we would be trading DOWN (our unit
      // is worth more than the target), and the value we remove now
      // (damage-fraction × the target's value) is less than half the value we
      // lose. A big chip — or trading a cheaper body UP into a pricier one —
      // still strikes; a high-value Defend wins here instead.
      if (retaliation >= ownRemaining) {
        const removedValue = damageFraction * threat;
        const ownValue = unitThreatValue(attacker);
        if (ownValue > threat && removedValue < ownValue * 0.5) {
          return BAD_TRADE_ATTACK_SCORE;
        }
      }
    } else if (
      defender.retaliatedThisRound &&
      !attacker.abilities?.includes("ignores-retaliation") &&
      (attacker.type !== "ranged" ||
        isAdjacent(attackFromPosition, defender.position))
    ) {
      // A melee target that already counter-attacked is a brief, concrete
      // opening. Make that safe hit matter even when another target is a little
      // more attractive on raw stats; lethal and major threat differences can
      // still outweigh it.
      quality += SPENT_RETALIATION_BONUS;
    }
  }

  // Hunt shooters AND casters in reach: a shooter deals full damage every round
  // from safety, a caster warps the fight from the backline — removing either
  // beats an equal-stat melee body. (Additive: a ranged caster is top priority.)
  if (defender.type === "ranged") {
    quality += RANGED_TARGET_BONUS;
  }
  if (hasThreatAbility(defender)) {
    quality += CASTER_TARGET_BONUS;
  }
  if (combat.context?.kind === "player") {
    quality += Math.round(Math.min(PVP_TIER_TARGET_CAP, tierWeight(defender.grade)) * reach);
  }
  // User-directed anti-Fuyuki doctrine: break the durable front line before
  // wasting actions on Medea's fixed-damage backliner.
  if (defender.unitDefId === "fuyuki.berserkers" && defender.variant === "pack") quality += 1200;
  else if (defender.unitDefId === "fuyuki.sabers" && defender.variant === "pack") quality += 900;
  else if (defender.unitDefId === "fuyuki.casters") quality -= 350;

  // Focus fire: stack onto a body reachable allies can also hit, and especially
  // one this hit plus those allies can FINISH this round — the army removes a
  // unit instead of spreading chips.
  quality += Math.min(FOCUS_PRESSURE_CAP, reachingAllies.length * 8);
  if (!lethal && armyCanFinish) {
    quality += FOCUS_FINISH_BONUS;
  }
  if (!defender.activatedThisRound && (lethal || armyCanFinish)) {
    quality += UNACTED_FINISH_BONUS;
  }
  // Heal race: against a per-round healer, removals beat spread chips harder.
  if ((lethal || armyCanFinish) && enemyHealsEachRound(combat, playerId, state)) {
    quality += HEAL_RACE_FINISH_BONUS;
  }
  // User ruling (2026-09-15): a Behemoth-class OUTPUT threat (Crushing Blow /
  // Defense shred / double attack — the `hasOutputAbility` set) must be KILLED at
  // all cost, not trade-hit. When this hit removes it (lethal) or the army can
  // finish it this round, add a premium so the army converges to DELETE it — and a
  // larger one when it has NOT yet acted (killing it denies its crush entirely).
  // A mere chip that cannot finish it gets nothing here (chip-trading a Behemoth is
  // exactly what the ruling forbids); the overextension guard below still applies.
  if (hasOutputAbility(defender) && (lethal || armyCanFinish)) {
    quality += defender.activatedThisRound ? OUTPUT_THREAT_KILL_BONUS : OUTPUT_THREAT_KILL_BONUS + OUTPUT_THREAT_UNACTED_BONUS;
  }
  const multiHeadOpportunity = surroundOpportunityBonus(
    combat,
    playerId,
    attacker,
    attackFromPosition,
  );
  quality += multiHeadOpportunity;
  // Prefer wounded targets among equal threats so damage is concentrated into
  // removals rather than spread across fresh stacks.
  const missing = Math.max(0, defender.maxHealth - remaining);
  quality += Math.min(18, missing * 4);

  // User ruling (2026-09-15): be decisive — if we cannot REMOVE the stack, at
  // least flip a PACK down to Few when that cuts its damage output. Depleting a
  // Pack's current bar flips it to its weaker Few side; reward that as the real
  // damage reduction it is, scaled by how much Attack the flip strips. This is a
  // value nudge ONLY: `lethal` / `armyCanFinish` still key on FULL removal, so a
  // flip never counts as a finish and never justifies waking a paralyzed sleeper
  // or an overextension (those guards above are unchanged).
  if (!lethal && flipsDefenderToFew && defender.unitDefId) {
    const fewSide = getUnitSide(defender.unitDefId, "few");
    if (fewSide && fewSide.attack < defender.attack) {
      quality += Math.round(Math.min(30, 10 + (defender.attack - fewSide.attack) * 8) * reach);
    }
  }

  // Do not step into an unsupported surround for a marginal strike. A lethal
  // attack discounts the body it removes before measuring the resulting line.
  quality -= positionalExposurePenalty(
    combat,
    playerId,
    attacker,
    attackFromPosition,
    lethal ? defender.id : undefined,
  );

  // Both PvP opponents and human-driven neutrals can focus remaining attacks.
  // Do not assume neutral stacks will distribute damage harmlessly. Occasionally hold
  // or reposition instead of taking a small chip when retaliation plus the
  // enemies that can still act are projected to remove this valuable unit.
  // Lethals, same-round focus finishes and multi-head attacks stay aggressive.
  const followUpIncoming = pendingIncomingDamageAtPosition(
    combat,
    attacker,
    attackFromPosition,
    lethal ? defender.id : undefined,
    state,
  );
  // User ruling (2026-09-15) on trading hits — think the whole exchange through,
  // and be FLEXIBLE. Hold/Defend instead of attacking ONLY when we cannot bring the
  // target down (neither kill NOR flip its Pack→Few) AND the retaliation plus the
  // enemy's own-turn follow-up would remove or flip OUR body (`ownRemaining` is our
  // current bar, so `>=` already means kill-or-flip). The classic bad gold-vs-gold
  // trade: our faster gold hits first, the enemy gold retaliates and then swings
  // back, and we could not dent it — turtle the gold instead. But if THIS hit flips
  // or kills them, the trade is worth it and we take it (flipsDefenderToFew / lethal
  // exempt below); lethals, focus finishes and multi-head attacks also stay
  // aggressive.
  if (
    !lethal &&
    !flipsDefenderToFew &&
    !armyCanFinish &&
    drawsRetaliation &&
    multiHeadOpportunity === 0 &&
    (combat.context?.kind === "player" ||
      livingEnemyUnits(combat, playerId).filter(enemy => !enemy.activatedThisRound).length > 1) &&
    retaliationDamage + followUpIncoming >= ownRemaining &&
    damage / Math.max(1, unitRemovalHealth(defender)) < 0.5 &&
    unitThreatValue(attacker) >= threat * 0.8
  ) {
    return PVP_OVEREXTENSION_ATTACK_SCORE;
  }

  // Weather changes the expected value, while guaranteed-removal and trading
  // safeguards above keep using the established conservative lower bound.
  quality += Math.round((conditionExpectedStrikeDamage(state, attacker, defender, attackFromPosition) - damage) * 12);
  const result = Math.max(ATTACK_FLOOR, Math.min(ATTACK_CEIL, ATTACK_BASE + quality));
  // Must-kill a defense-ignoring ONE-SHOTTER (user ruling 2026-09-18, live tutoring):
  // an enemy that deals elemental (defense-ignoring) damage AND can remove one of our
  // bodies cannot be tanked or safely traded with — its retaliation ignores our
  // defense, so a chip only feeds it. It must be KILLED before it acts. When our HAND
  // can boost THIS strike to a guaranteed lethal (worst die still removes it), rank it
  // above an easy chaff kill so the AI commits the boost here — a kill draws no
  // retaliation, so the body is removed for free. If we cannot reach a guaranteed kill
  // we deliberately do NOT lift it (chipping it is a trap).
  if (
    combat.context?.kind !== "player" &&
    dealsElementalStrike(defender) &&
    livingFriendlies(combat, playerId).some(
      (ally) => ally.id !== attacker.id && defender.attack + 1 >= unitRemovalHealth(ally),
    )
  ) {
    const boostedLow = attacker.attack + handAttackBoostFor(state, playerId, attacker) - 1;
    const guaranteedKill =
      boostedLow - (dealsElementalStrike(attacker) ? 0 : defender.defense) >=
      unitRemovalHealth(defender);
    if (guaranteedKill) {
      // Prefer the landing that ALSO blocks an enemy shooter: adjacency denies its
      // ranged shot at our backline (a Power-Drain Magi still melees us, but it can no
      // longer freely shoot the fragile Marksman). User ruling 2026-09-18, live tutoring.
      const blocksShooter = livingEnemyUnits(combat, playerId).some(
        (enemy) =>
          enemy.type === "ranged" &&
          enemy.position >= 0 &&
          enemy.id !== defender.id &&
          isAdjacent(attackFromPosition, enemy.position),
      );
      return Math.max(
        result,
        blocksShooter ? NEUTRAL_FLYER_JAM_BIGGER_FLOOR : NEUTRAL_MUST_KILL_ONESHOTTER_FLOOR,
      );
    }
  }
  // Flyer hunts the enemy SHOOTER (user ruling 2026-09-18, live tutoring): in a
  // NEUTRAL fight a flyer's strike on an enemy ranged unit is THE priority and
  // must outrank an easy chaff kill that happens to be reachable from the same
  // landing (the shooter chip is finished this turn with a boost card / another
  // unit; only the flyer reaches the backline). Lift above the physical-kill band
  // (chaff lethals cap near ATTACK_CEIL) but below the mandatory stage tier. Any
  // real hit (damage > 0); the suicide/bad-trade bails above already returned, so
  // this never rewards throwing the flyer away. PvP keeps ordinary target value.
  if (
    combat.context?.kind !== "player" &&
    attacker.type === "flying" &&
    defender.type === "ranged" &&
    damage > 0
  ) {
    return Math.max(result, NEUTRAL_FLYER_SHOOTER_FLOOR);
  }
  // Jam-and-hit-bigger: this flyer strike lands adjacent to an enemy SHOOTER (a
  // different unit from the target), so it neutralises that shooter by blocking
  // while removing a more dangerous body. Prefer it over spending the strike on
  // the shooter itself — but ONLY for a shooter that is safe to leave jammed. A
  // shooter whose threat survives a jam (Power Drain and the like) must be killed,
  // so blocking it earns no premium. See NEUTRAL_FLYER_JAM_BIGGER_FLOOR.
  if (
    combat.context?.kind !== "player" &&
    attacker.type === "flying" &&
    defender.type !== "ranged" &&
    damage > 0 &&
    livingEnemyUnits(combat, playerId).some(
      (enemy) =>
        enemy.type === "ranged" &&
        enemy.position >= 0 &&
        enemy.id !== defender.id &&
        isAdjacent(attackFromPosition, enemy.position) &&
        !shooterThreatSurvivesJam(enemy),
    )
  ) {
    return Math.max(result, NEUTRAL_FLYER_JAM_BIGGER_FLOOR);
  }
  return result;
}

function isBacklineCell(combat: CombatState, playerId: string, position: number): boolean {
  if (playerId === combat.attackerPlayerId) {
    return ATTACKER_BACKLINE.includes(position);
  }
  return DEFENDER_BACKLINE.includes(position);
}

function isFrontlineCell(combat: CombatState, playerId: string, position: number): boolean {
  if (playerId === combat.attackerPlayerId) {
    return ATTACKER_FRONTLINE.includes(position);
  }
  return DEFENDER_FRONTLINE.includes(position);
}

function cellColumn(position: number): number {
  return position % 4;
}

type UnitRole = "ranged" | "melee" | "flying";

function unitRole(unit: { type?: string } | null | undefined): UnitRole {
  if (unit?.type === "ranged") return "ranged";
  if (unit?.type === "flying") return "flying";
  return "melee";
}

function livingFriendlies(
  combat: CombatState,
  playerId: string,
): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === playerId && unitRemainingHealth(unit) > 0,
  );
}

/** A destination's effect on the remaining ground allies' legal attacks. */
function friendlyLaneChange(combat: CombatState, mover: CombatUnitState, position: number, state: GameState): number {
  if (position === mover.position) return 0;
  const side = mover.controllerId;
  const projected = { ...combat, units: { ...combat.units, [mover.id]: { ...mover, position } } };
  const attackAccess = (board: CombatState, ally: CombatUnitState): number => {
    const projectedState = { ...state, combat: board, activeEffects: state.activeEffects ?? [] };
    const destinations = getLegalMoveDestinations(board, ally, projectedState);
    return Math.max(0, ...livingEnemyUnits(board, side).map(enemy => {
      let damage = canUnitAttack(board, ally, enemy, projectedState.activeEffects)
        ? estimatedStrikeDamage(ally, enemy) : 0;
      for (const destination of destinations) {
        if (canUnitMoveAndAttack(board, ally, destination, enemy, projectedState)) {
          damage = Math.max(damage, estimatedStrikeDamage(ally, enemy, destination));
        }
      }
      return Math.min(unitRemovalHealth(enemy), damage);
    }));
  };
  let laneGain = 0;
  for (const ally of livingFriendlies(combat, side)) {
    if (ally.id === mover.id || unitRole(ally) !== "melee" || ally.position < 0 ||
        ally.activatedThisRound || ally.attackedThisActivation || isParalyzed(ally)) continue;
    const gain = attackAccess(projected, ally) - attackAccess(combat, ally);
    laneGain += Math.max(-180, Math.min(180, gain * 35));
  }
  return laneGain;
}

/**
 * How well a unit of the given role sits on `position` given already-placed
 * friendlies. Higher is better. Used for placement AND tactics swaps.
 */
export function formationFitScore(
  combat: CombatState,
  playerId: string,
  role: UnitRole,
  position: number,
  /** Unit being scored (excluded from "already placed" column counts). */
  selfId?: string,
  /** Extra bulk for tank preference on the front. */
  bulk?: number,
  /** Printed combat value: premium shooters deserve the safest screened cell. */
  priority = 0,
  reserve = false,
  unitDefId?: string,
): number {
  let score = 0;
  const front = isFrontlineCell(combat, playerId, position);
  const back = isBacklineCell(combat, playerId, position);
  const self = selfId ? combat.units[selfId] : undefined;
  const definitionId = unitDefId ?? self?.unitDefId;
  if (self?.unitDefId === "stronghold.orcs" && self.attack >= 3) role = "melee";
  // User ruling: Castle's Griffins hold the FRONT line as a fast body (with a
  // Halberdier standing directly above them), not the screened back row. Score
  // them like a front-line melee body for placement; the generic flyer branch
  // that keeps OTHER flyers in reserve is left untouched.
  const castleGriffin = definitionId === "castle.griffins";
  if (castleGriffin) role = "melee";

  if (role === "ranged") {
    score += back ? 30 : front ? -20 : -5;
    if (back) score += Math.min(12, Math.round(priority / 4));
    // Classic protected-corner deployment: shooters claim the two back-row
    // corners first, leaving the square directly in front free for a screen.
    // This outweighs both the generic central-column reach bonus and a screen
    // that happened to be placed centrally before the shooter took its cell.
    if (back && (cellColumn(position) === 0 || cellColumn(position) === 3)) {
      score += 25;
    }
  } else if (role === "melee") {
    score += front ? 28 : back ? -18 : 5;
    // Durable tanks prefer the front more.
    if (front && (bulk ?? 0) > 0) {
      score += Math.min(12, bulk ?? 0);
    }
    // Neutral focus-tank (user ruling, 2026-09-18 live tutoring): a neutral guard
    // party of the same tier focus-fires your BEST body, so your Silver/Gold ground
    // unit is the designated TANK. It should anchor the FRONT CORNER cell (the screen
    // square in front of a back-row shooter) and soak that focus, rather than drift
    // to the central column. This outranks the central-column nudge below and, by
    // claiming the corner first (it deploys first as the highest-threat body), leaves
    // the bronze Griffin/Halberdier pairing to form beside it. Pure-bronze armies
    // never trigger this, so their generic front pairing is unchanged.
    const tankTier = definitionId ? coreUnitDefinitions[definitionId]?.tier : undefined;
    if (front && combat.context?.kind !== "player" &&
        (tankTier === "silver" || tankTier === "gold" || tankTier === "azure")) {
      score += 8;
      const tankCol = cellColumn(position);
      if (tankCol === 0 || tankCol === 3) score += 12;
    }
  } else {
    // Flyer deployment. In a NEUTRAL fight the guard party routinely fields
    // shooters the flyer must fly out and neutralise (you cannot defend against
    // ranged), so it deploys FORWARD to threaten the backline on turn 1 (user
    // ruling 2026-09-18, live tutoring: "for neutral fight, need flier to reach
    // ranged"). In PvP the classic second-row counter-position holds — the
    // opponent chooses the engagement and a premature forward flyer is exposed.
    if (combat.context?.kind !== "player") {
      score += front ? 22 : back ? -8 : 10;
    } else {
      score += front ? -12 : back ? 26 : 8;
    }
  }
  // Flyers can counter through a screen; ground units need an open front. A
  // reserve flyer normally sits behind the screen (PvP), but in a neutral fight
  // it still wants the forward cell so it can reach the enemy shooters.
  if (reserve && role === "flying") {
    score += combat.context?.kind !== "player"
      ? (front ? 40 : back ? -30 : 10)
      : (back ? 55 : front ? -45 : 10);
  }

  // Prefer central columns (1,2) for reach / less edge waste. Ranged units get
  // a larger protected-corner bonus above and therefore still choose corners.
  const col = cellColumn(position);
  score += col === 1 || col === 2 ? 4 : 0;

  const friends = livingFriendlies(combat, playerId).filter(
    (unit) => unit.id !== selfId,
  );
  // Castle opening formation (user ruling): Griffins hold the front line and a
  // Halberdier stands on the front line directly ABOVE its Griffin — the cell
  // one row up in the same visual file, which is one lower engine column (`col`
  // is `position % 4`). Reward that pairing so the two group up front together
  // while the Marksmen keep the protected back row.
  if (castleGriffin && front && friends.some(unit =>
      unit.unitDefId === "castle.halberdiers" && isFrontlineCell(combat, playerId, unit.position) &&
      cellColumn(unit.position) === col - 1)) score += 60;
  if (definitionId === "castle.halberdiers" && front && friends.some(unit =>
      unit.unitDefId === "castle.griffins" && isFrontlineCell(combat, playerId, unit.position) &&
      cellColumn(unit.position) === col + 1)) score += 60;

  // Column diversity: avoid stacking 3+ bodies in one file.
  const sameCol = friends.filter((unit) => cellColumn(unit.position) === col).length;
  if (sameCol >= 2) score -= 10 * (sameCol - 1);

  // Ranged wants a friendly melee adjacent in front (screen).
  if (role === "ranged" || role === "flying") {
    const screened = friends.some(
      (unit) =>
        unitRole(unit) === "melee" &&
        isAdjacent(unit.position, position) &&
        isFrontlineCell(combat, playerId, unit.position),
    );
    if (screened) score += 14 + Math.min(10, Math.round(priority / 5));
  }

  // Melee wants to sit in front of a friendly ranged (be the screen).
  if (role === "melee" && front) {
    const coversRanged = friends.some(
      (unit) =>
        (unitRole(unit) === "ranged" || unitRole(unit) === "flying") &&
        isAdjacent(unit.position, position),
    );
    if (coversRanged) score += 12;
  }

  return score;
}

function reserveCombatUnit(combat: CombatState, unit: CombatUnitState): boolean {
  if (unit.unitDefId === "castle.griffins" && livingEnemyUnits(combat, unit.controllerId).some(enemy => enemy.type === "ranged")) return false;
  // Ground damage dealers need an open front: they cannot counter through a screen.
  if (unitRole(unit) === "melee") return false;
  if (unit.type === "flying" && livingFriendlies(combat, unit.controllerId).some(ally =>
      ally.id !== unit.id && unitRole(ally) === "melee" && !ally.commanderSlug)) return true;
  return (unit.grade === "gold" || unit.grade === "azure" || hasThreatAbility(unit)) &&
    livingFriendlies(combat, unit.controllerId).some((ally) =>
      ally.id !== unit.id && ally.position >= 0 && ally.type !== "ranged" &&
      !ally.commanderSlug && unitThreatValue(ally) < unitThreatValue(unit) * 0.65);
}

/**
 * Deployment risk of parking our GOLD/azure lvl-7 at `position` in front of a
 * Behemoth-class OUTPUT threat (Crushing Blow / Defense shred / double attack).
 * The ruling (2026-09-15): the gold body must avoid that threat's hit while still
 * being able to move and strike — so this is turn-order + reach aware, NOT a flat
 * "in reach = bad" penalty.
 *
 * Reach is `canUnitMoveAndAttack`, which already accounts for the threat's real
 * SPEED (move range), whether it FLIES (ignores blockers) or is ground (blocked by
 * our SCREEN), and flying landing rules — so screening the gold naturally removes
 * the risk. Turn order uses effectiveInitiative (highest acts first; ties lead to
 * the attacker side): if the threat acts BEFORE our body it crushes it where it
 * stands (heavy risk); if our body acts first it can strike and STEP AWAY, so the
 * deploy square matters far less (mild nudge — the move scorer keeps it ending
 * clear). Only gold/azure bodies pay this, so the extra reach scan stays cheap.
 */
function outputThreatDeploymentRisk(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  position: number,
): number {
  if (!(unit.grade === "gold" || unit.grade === "azure") || unit.commanderSlug) return 0;
  const activeEffects = state.activeEffects ?? [];
  const projected = { ...combat, units: { ...combat.units, [unit.id]: { ...unit, position } } };
  const body = projected.units[unit.id];
  const bodyInitiative = effectiveInitiative(body, activeEffects, projected);
  let risk = 0;
  for (const enemy of livingEnemyUnits(projected, unit.controllerId)) {
    if (enemy.position < 0 || enemy.activatedThisRound || isParalyzed(enemy) || !hasOutputAbility(enemy)) continue;
    const reaches = canUnitAttack(projected, enemy, body, activeEffects) ||
      getLegalMoveDestinations(projected, enemy, state).some((destination) =>
        canUnitMoveAndAttack(projected, enemy, destination, body, state));
    if (!reaches) continue;
    const enemyInitiative = effectiveInitiative(enemy, activeEffects, projected);
    const threatActsFirst = conditionInitiativePrecedes(enemyInitiative, bodyInitiative, projected) ||
      (enemyInitiative === bodyInitiative && enemy.controllerId === projected.attackerPlayerId);
    risk = Math.max(risk, threatActsFirst ? OUTPUT_THREAT_GOLD_REACH_PENALTY : OUTPUT_THREAT_GOLD_MOVER_PENALTY);
  }
  return risk;
}

/** All reposition/swap callers use the same whole-board objective, so changing
 * one screen cannot create a swap cycle. Reach checks include flying landings
 * and blockers; no projected attack is executed. */
function placedUnitFit(state: GameState, combat: CombatState, unit: CombatUnitState): number {
  const premium = unit.grade === "gold" || unit.grade === "azure";
  const fit = formationFitScore(combat, unit.controllerId, unitRole(unit), unit.position,
    unit.id, unit.maxHealth + unit.defense, unitThreatValue(unit), reserveCombatUnit(combat, unit));
  const incoming = coordinatedReplyDamage(combat, unit, unit.position, undefined, state);
  const exposure = Math.min(55, incoming * (premium ? 7 : 3));
  return fit - exposure - outputThreatDeploymentRisk(state, combat, unit, unit.position);
}

/**
 * Placement: multi-unit formation — tanks/frontline melee screen, ranged in
 * back, column diversity, adjacency to complementary allies. Base stays in the
 * PLACE band (above FINISH = 900 foundation when units remain).
 */
function placeScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }>,
): number {
  const combat = observation.state.combat;
  const player = observation.state.players[observation.playerId];
  if (!combat || !player) {
    return 920;
  }
  const armyUnit = player.army.find((unit) => unit.id === action.armyUnitId);
  const existing = Object.values(combat.units).find(
    (unit) => unit.armyUnitId === action.armyUnitId,
  );
  const def = armyUnit ? coreUnitDefinitions[armyUnit.unitDefId] : undefined;
  const side = armyUnit
    ? getUnitSide(armyUnit.unitDefId, armyUnit.side)
    : undefined;
  // Unit TYPE lives on the definition root (Few/Pack sides rarely re-declare it).
  const sideType = existing?.type ?? side?.type ?? def?.type;
  const role = armyUnit?.unitDefId === "stronghold.orcs" && (side?.attack ?? existing?.attack ?? 0) >= 3
    ? "melee" : unitRole({ type: sideType });
  const bulk =
    (side?.health ?? existing?.maxHealth ?? 0) +
    (side?.defense ?? existing?.defense ?? 0);

  if (existing && existing.position >= 0) {
    // Placement is reversible. Only accept a strict improvement to the WHOLE
    // formation (including a displaced ally), otherwise Ready must win.
    const allies = Object.values(combat.units).filter(unit =>
      unit.controllerId === observation.playerId && unit.position >= 0);
    const formationValue = (candidate: CombatState) => allies.reduce((sum, unit) => {
      const current = candidate.units[unit.id];
      return sum + placedUnitFit(observation.state as unknown as GameState, candidate, current);
    }, 0);
    const occupant = allies.find(unit => unit.id !== existing.id && unit.position === action.position);
    const units = { ...combat.units, [existing.id]: { ...existing, position: action.position } };
    if (occupant) units[occupant.id] = { ...occupant, position: existing.position };
    const gain = formationValue({ ...combat, units }) - formationValue(combat);
    return gain > 0 ? 905 + Math.min(40, gain) : 870;
  }

  // Fill the limited deployment slots with the force used by the engagement
  // estimate. A cheap shooter's perfect corner must not bench a gold Pack.
  // Lower-strength cards remain legal fallbacks, but wait for stronger cards.
  if (armyUnit && player.army.some(candidate =>
    observation.legalActions.some(legal => legal.action.type === "PLACE_COMBAT_UNIT" &&
      legal.action.armyUnitId === candidate.id) &&
    !Object.values(combat.units).some(unit => unit.armyUnitId === candidate.id) &&
    unitSideStrength(candidate) > unitSideStrength(armyUnit))) return 890;

  let score =
    920 +
    formationFitScore(
      combat,
      observation.playerId,
      role,
      action.position,
      existing?.id,
      bulk,
      side
        ? side.attack * 3 + side.health * 2 + side.defense + Math.round(side.initiative / 2)
        : 0,
      Boolean(def && (role === "flying" || def.tier === "gold" || def.tier === "azure") &&
        player.army.some((ally) => {
          const allyDef = coreUnitDefinitions[ally.unitDefId];
          const allySide = getUnitSide(ally.unitDefId, ally.side);
          return ally.id !== armyUnit?.id && (allyDef?.tier === "bronze" || allyDef?.tier === "silver") &&
            (allySide?.type ?? allyDef?.type) !== "ranged";
        })),
      armyUnit?.unitDefId,
    );

  if (armyUnit) {
    score += Math.min(5, armyUnit.permanentAttackBonus ?? 0);
  }
  // Prefer deploying higher-threat units first (better cells claimed early).
  if (side) {
    score += Math.min(8, Math.round((side.attack * 3 + side.health) / 8));
  }
  // Keep our gold/azure lvl-7 out of a Behemoth-class threat's round-1 reach at
  // INITIAL deploy too (the reposition/swap path already carries this via
  // placedUnitFit). Uses the undeployed combat unit's real stats when present; if
  // the unit is not on the board yet the reposition pass corrects it after deploy.
  if (existing && (existing.grade === "gold" || existing.grade === "azure")) {
    score -= outputThreatDeploymentRisk(observation.state as unknown as GameState, combat, existing, action.position);
  }
  // An awkward remaining square still beats leaving a deployment slot empty.
  return Math.max(901, score);
}

/**
 * Neutral-control placement is a SORT, not initial deployment: every legal
 * move remains available after it is made. Score only strict improvements to
 * the whole guard formation so the computer converges and then chooses Ready
 * instead of endlessly swapping the same units.
 */
function neutralPlacementScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "PLACE_NEUTRAL_GUARD" }>,
): number {
  const combat = observation.state.combat;
  if (!combat) return 870;
  const guard = combat.units[action.unitId];
  if (!guard) return 870;

  const guards = Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === guard.controllerId && unitRemainingHealth(unit) > 0,
  );
  const occupant = guards.find(
    (unit) => unit.id !== guard.id && unit.position === action.position,
  );

  const formationScore = (candidate: CombatState): number =>
    guards.reduce((sum, original) => {
      const unit = candidate.units[original.id];
      return (
        sum +
        placedUnitFit(observation.state as unknown as GameState, candidate, unit)
      );
    }, 0);

  const before = formationScore(combat);
  const units = { ...combat.units };
  units[guard.id] = { ...guard, position: action.position };
  if (occupant) {
    units[occupant.id] = { ...occupant, position: guard.position };
  }
  const after = formationScore({ ...combat, units });
  const gain = after - before;
  return gain > 0 ? 905 + Math.min(40, gain) : 870;
}

/**
 * Tactics swap: only swap when whole-formation quality improves. Finish
 * when no swap is clearly better so we never thrash.
 */
function swapScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "SWAP_COMBAT_UNITS" }>,
): number {
  const combat = observation.state.combat;
  if (!combat) return 880;
  const a = combat.units[action.unitIdA];
  const b = combat.units[action.unitIdB];
  if (!a || !b) return 850;
  if (a.controllerId !== observation.playerId || b.controllerId !== observation.playerId) {
    return 800;
  }

  const formationValue = (candidate: CombatState) => Object.values(candidate.units)
    .filter(unit => unit.controllerId === observation.playerId && unit.position >= 0)
    .reduce((sum, unit) => sum + placedUnitFit(observation.state as unknown as GameState, candidate, unit), 0);
  const before = formationValue(combat);
  const after = formationValue({ ...combat, units: { ...combat.units,
    [a.id]: { ...a, position: b.position }, [b.id]: { ...b, position: a.position },
  } });
  const gain = after - before;
  if (gain <= 0) {
    // No improvement — fall below FINISH_TACTICS (900) so we stop.
    return 870;
  }
  // Improvement: outrank finish so the swap is taken.
  return 905 + Math.min(40, gain);
}

/**
 * Multi-unit movement: close on enemies, screen friendly ranged, keep ranged
 * out of melee when they already have a shot, and cluster toward focus targets.
 */
function moveUnitScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "MOVE_UNIT" }>,
): ComputerActionScore | null {
  const combat = observation.state.combat;
  if (!combat) return null;
  const mover = combat.units[action.unitId];
  if (!mover) return null;

  if (bronzeArmyNeedsWithdrawal(observation.state as unknown as GameState, observation.playerId, combat)) {
    const before = distanceToNearestEnemy(combat, mover.controllerId, mover.position) ?? 0;
    const after = distanceToNearestEnemy(combat, mover.controllerId, action.destination) ?? 0;
    const beforeIncoming = coordinatedReplyDamage(combat, mover, mover.position, undefined, observation.state as unknown as GameState);
    const afterIncoming = coordinatedReplyDamage(combat, mover, action.destination, undefined, observation.state as unknown as GameState);
    // A stationary ranged guard can remain the nearest enemy on every safe
    // square. Still escape approaching melee guards instead of defending in
    // their charge lane merely because that nearest-enemy distance ties.
    const melee = livingEnemyUnits(combat, mover.controllerId).filter(enemy =>
      enemy.type !== "ranged" && !enemy.activatedThisRound && enemy.position >= 0);
    const meleeDistance = (position: number) => melee.reduce((sum, enemy) =>
      sum + getBattlefieldDistance(position, enemy.position), 0);
    const meleeGain = meleeDistance(action.destination) - meleeDistance(mover.position);
    const spacing = (position: number) => livingEnemyUnits(combat, mover.controllerId)
      .filter(enemy => !enemy.activatedThisRound && enemy.position >= 0)
      .reduce((sum, enemy) => sum + getBattlefieldDistance(position, enemy.position), 0);
    const spacingGain = spacing(action.destination) - spacing(mover.position);
    // Preserve the formation, not just the active unit. A retreating flyer
    // may need to block a charge lane until the slower shooter can withdraw.
    const armyRisk = (position: number) => {
      const projected = { ...combat, units: { ...combat.units, [mover.id]: { ...mover, position } } };
      return livingFriendlies(projected, mover.controllerId).reduce((sum, friend) => {
        // Withdrawal should survive a +1 die, and elemental attacks ignore
        // printed Defense. Keep this conservative projection in retreat only.
        const units = Object.fromEntries(Object.entries(projected.units).map(([id, unit]) => [id,
          unit.controllerId === mover.controllerId ? unit : { ...unit,
            attack: unit.attack + 1 + (unit.abilities.includes("elemental-damage") ? friend.defense : 0) }]));
        const incoming = coordinatedReplyDamage({ ...projected, units }, friend, friend.position, undefined, observation.state as unknown as GameState);
        const fraction = incoming / Math.max(1, unitRemovalHealth(friend));
        return sum + Math.min(2, fraction) * unitThreatValue(friend) + (fraction >= 1 ? 60 : 0);
      }, 0);
    };
    const protectionGain = armyRisk(mover.position) - armyRisk(action.destination);
    // Move once to a safer square, then defend. Never spend round 1 charging
    // or poking while the plan is to preserve the army and withdraw.
    return { score: protectionGain > 1 || (protectionGain >= 0 && afterIncoming <= beforeIncoming &&
        (after > before || afterIncoming < beforeIncoming || meleeGain > 0 || spacingGain > 0))
      ? 700 + Math.min(100, protectionGain * 4) + Math.min(20, after * 3) + Math.min(12, meleeGain * 3) + Math.min(8, spacingGain * 2) - Math.min(30, afterIncoming * 3) : 180,
      policy: "combat.bronze-disengage" };
  }

  // In player-controlled-neutrals mode the decision owner is a player, but the
  // acting guard remains controlled by the neutral side. Score allies, enemies
  // and distances from the unit's ACTUAL side (the attack branch already did;
  // this scorer read observation.playerId, so an AI seat driving the guards
  // counted its own guards as "enemies" and every distance read was noise).
  const side = mover.controllerId;

  const current = distanceToNearestEnemy(combat, side, mover.position);
  const next = distanceToNearestEnemy(combat, side, action.destination);
  if (current === null || next === null) return null;

  const role = unitRole(mover);
  const state = { ...observation.state, activeEffects: observation.state.activeEffects ?? [] } as unknown as GameState;
  const incomingNow = coordinatedReplyDamage(combat, mover, mover.position, undefined, state);
  const incomingNext = coordinatedReplyDamage(combat, mover, action.destination, undefined, state);
  const remaining = unitRemainingHealth(mover);
  const escapesLethalReply = incomingNow >= remaining && incomingNext < remaining;
  const entersLethalReply = incomingNext >= remaining && incomingNext > incomingNow;
  // Post-shot step (ranged only): the shot is spent, so closing in buys nothing
  // and adjacency costs next round's clean shot. Back off when engaged; never
  // outrank the passive exit (END_ACTIVATION = 400) by advancing.
  if (mover.attackedThisActivation && mover.type === "ranged") {
    if (escapesLethalReply) return { score: 570, policy: "combat.ranged-escape-focus" };
    if (entersLethalReply) return { score: 180, policy: "combat.ranged-avoid-focus" };
    const touchNow = current <= 1;
    const touchNext = next <= 1;
    if (touchNow && !touchNext) return { score: 560, policy: "combat.ranged-disengage" };
    if (!touchNow && touchNext) return { score: 120, policy: "combat.ranged-step-into-melee" };
    return { score: next > current ? 430 : 330, policy: "combat.ranged-post-shot-step" };
  }
  let score: number;

  if (next < current) {
    score = 520 + Math.min(20, current - next);
  } else if (next === current) {
    score = 400;
  } else {
    // Moving away — only for ranged disengaging or screening reposition.
    score = 260;
  }

  let landingAttack = 0;
  if (!mover.attackedThisActivation && mover.type !== "ranged") {
    const attacks = livingEnemyUnits(combat, side).filter(enemy=>
      canUnitMoveAndAttack(combat, mover, action.destination, enemy, state));
    const canBait = pendingIncomingDamage(combat, side, mover) === 0 && observation.legalActions.some(legal =>
      legal.action.type === "WAIT_UNIT" && legal.action.unitId === mover.id);
    const best = Math.max(0,...attacks.map(enemy => {
      const damage = estimatedStrikeDamage(mover, enemy, action.destination);
      // When Wait is actually offered, do not spend a safe initiative lead on
      // an even chip trade. A kill, favorable hit or exhausted enemy still goes.
      if (canBait && !enemy.activatedThisRound && damage < unitRemovalHealth(enemy) &&
          provokesRetaliation(mover, enemy, action.destination) &&
          damage <= estimatedStrikeDamage(enemy, mover, enemy.position, true)) return 0;
      return attackScore(combat,side,mover,enemy,action.destination,state);
    }));
    landingAttack = best;
    // Compare the actual strike, including retaliation and replies, rather than
    // marching at the highest-tier enemy even when a softer target is reachable.
    if (best >= ATTACK_FLOOR) score = Math.max(score, best - 1);
  }

  // Ranged: strong penalty for walking adjacent to an enemy (melee range).
  if (role === "ranged") {
    const enemies = livingEnemyUnits(combat, side);
    const wouldTouch = enemies.some((enemy) =>
      isAdjacent(action.destination, enemy.position),
    );
    const alreadyTouch = enemies.some((enemy) =>
      isAdjacent(mover.position, enemy.position),
    );
    if (wouldTouch && !alreadyTouch) {
      score -= 80;
    }
    // Prefer staying put-ish in backline if already back and not threatened.
    if (
      isBacklineCell(combat, side, action.destination) &&
      !wouldTouch
    ) {
      score += 15;
    }
  }

  // Melee tank: reward moves that put us adjacent to a friendly ranged that is
  // threatened (screen), or between enemy and that ranged.
  if (role === "melee" || role === "flying") {
    const friends = livingFriendlies(combat, side).filter(
      (unit) => unit.id !== mover.id && (unitRole(unit) === "ranged" ||
        (role === "melee" && unitRole(unit) === "flying")),
    );
    for (const ranged of friends) {
      // Threats near THIS ranged ally. Use board distance per enemy — the old
      // `distanceToNearestEnemy(ranged.position)` took no enemy argument, so its
      // clause was constant across the filter (every enemy in, or none), never
      // the intended "enemies within 2 of this ally". Distance ≤ 2 already
      // subsumes adjacency (adjacent = distance 1).
      const enemiesNearRanged = livingEnemyUnits(combat, side).filter(
        (enemy) => getBattlefieldDistance(enemy.position, ranged.position) <= 2,
      );
      if (enemiesNearRanged.length === 0) continue;
      if (isAdjacent(action.destination, ranged.position)) {
        score += 25;
      }
      // An occupied orthogonal landing square physically screens a shooter
      // from a flying unit, which may cross blockers but may not land on one.
      const flyingThreat = enemiesNearRanged.some(
        (enemy) => unitRole(enemy) === "flying",
      );
      if (
        flyingThreat &&
        getOrthogonalNeighbors(ranged.position).includes(action.destination)
      ) {
        score += 18;
      }
      // Step closer to the threat near the ranged ally. Board distance, not the
      // linear cell-index difference (the board is a 4-wide grid — index diff is
      // not distance and can reward a move that increases real distance).
      for (const threat of enemiesNearRanged) {
        const before = getBattlefieldDistance(mover.position, threat.position);
        const after = getBattlefieldDistance(action.destination, threat.position);
        if (after < before) score += 8;
      }
    }
  }

  // Focus march: converge on the highest VALUE-adjusted target we can threaten
  // (tier / ranged / caster via `targetPriority`, a wounded body a premium),
  // not merely the nearest — so the army collapses onto one worthwhile unit
  // instead of chasing whatever chaff is closest. Value primary, wounds break
  // ties. Stepping toward it is rewarded; stepping away is mildly penalised.
  const enemies = livingEnemyUnits(combat, side);
  if (enemies.length > 0) {
    const shooters = mover.unitDefId === "castle.griffins" ? enemies.filter(enemy => enemy.type === "ranged") : [];
    const focus = [...(shooters.length ? shooters : enemies)].sort(
      (a, b) =>
        fuyukiFocusPriority(b) - fuyukiFocusPriority(a) ||
        targetPriority(b) - targetPriority(a) ||
        unitRemainingHealth(a) - unitRemainingHealth(b),
    )[0];
    const before = getBattlefieldDistance(mover.position, focus.position);
    const after = getBattlefieldDistance(action.destination, focus.position);
    if (after < before) score += FOCUS_MARCH_BONUS;
    if (shooters.length && after < before && !mover.attackedThisActivation) score += 65;
    else if (after > before) score -= FOCUS_MARCH_AWAY_PENALTY;
  }

  score += surroundOpportunityBonus(combat, side, mover, action.destination);

  score -= positionalExposurePenalty(combat, side, mover, action.destination);

  // A friendly body changes ground reach. Charge lanes belong to the whole
  // army: penalize closing an ally's attack route and reward opening it.
  const laneGain = friendlyLaneChange(combat, mover, action.destination, state);
  score += laneGain;
  if (laneGain > 0 && incomingNext <= incomingNow) score = Math.max(score, 520 + laneGain);

  // Flyer shooter-hunt: a flyer that MOVES to a landing from which it can strike
  // an enemy SHOOTER prefers that landing over generic close-distance AND over an
  // easy chaff kill. An enemy ranged unit fires every round and cannot be
  // defended against — removing it is the flyer's job (only the flyer reaches the
  // backline turn 1). User ruling (2026-09-18): fire whenever an enemy shooter is
  // reachable — a friendly ranged ally is NOT required, because the enemy shooter
  // threatens the WHOLE army (the old gate wrongly demanded we own a shooter, so
  // a shooter-less army never hunted). In a NEUTRAL fight the strike is lifted
  // above the physical-kill band (the chip is finished with a boost card / other
  // units this turn); in PvP it keeps the modest bonus and the tighter
  // protect-our-ranged framing (the opponent chooses the engagement).
  const neutralFight = combat.context?.kind !== "player";
  if (
    mover.type === "flying" &&
    !mover.attackedThisActivation &&
    (neutralFight ||
      livingFriendlies(combat, side).some(
        (ally) => ally.id !== mover.id && unitRole(ally) === "ranged",
      ))
  ) {
    const shooterHunt = Math.max(
      0,
      ...livingEnemyUnits(combat, side)
        .filter(
          (enemy) =>
            enemy.type === "ranged" &&
            estimatedStrikeDamage(mover, enemy, action.destination) > 0 &&
            // Only reward MOVING to reach the shooter; a shot available from the
            // current cell is an ATTACK_UNIT and must not be out-bid by a move.
            !canUnitAttack(combat, mover, enemy, state.activeEffects ?? []) &&
            canUnitMoveAndAttack(combat, mover, action.destination, enemy, state),
        )
        .map((enemy) =>
          attackScore(combat, side, mover, enemy, action.destination, state),
        ),
    );
    // A real hit only (≥ ATTACK_FLOOR): a suppressed suicide / bad-trade poke
    // (SUICIDAL/BAD_TRADE/overextension scores < FLOOR) never triggers the hunt.
    if (shooterHunt >= ATTACK_FLOOR) {
      score = neutralFight
        ? Math.max(score, Math.max(shooterHunt, NEUTRAL_FLYER_SHOOTER_FLOOR))
        : Math.max(score, shooterHunt + FLYER_SHOOTER_HUNT_BONUS);
    }
  }

  // Movement accounts for enemy move-and-attacks, not only bodies already
  // adjacent. A screen or a safe retreat can preserve the next shot.
  if (escapesLethalReply) return { score: Math.max(570, score), policy: "combat.escape-focus" };
  if (entersLethalReply && landingAttack < ATTACK_FLOOR) return { score: Math.min(350, score), policy: "combat.avoid-focus" };
  if (reserveCombatUnit(combat, mover) && incomingNext > incomingNow && !mover.attackedThisActivation && landingAttack < ATTACK_FLOOR) {
    return { score: Math.min(450, score), policy: "combat.preserve-counter-position" };
  }

  if (next >= current && score < 400) {
    return { score: Math.min(score, 260), policy: "combat.hold-position" };
  }
  if (next < current) {
    return { score, policy: "combat.close-distance" };
  }
  return { score, policy: "combat.reposition-formation" };
}

function fuyukiFocusPriority(unit: CombatUnitState): number {
  if (unit.unitDefId === "fuyuki.berserkers" && unit.variant === "pack") return 3;
  if (unit.unitDefId === "fuyuki.sabers" && unit.variant === "pack") return 2;
  if (unit.unitDefId === "fuyuki.casters") return -1;
  return 0;
}

/**
 * Score a WOG commander's activation cast (a `USE_UNIT_ABILITY` with the cast's
 * ability and no board target yet — the target picker opens after and is scored
 * by choice-policy's ability-target handler). The cast is FREE (the commander may
 * still ATTACK afterwards) but LOCKS its MOVEMENT for the activation (engine
 * rule): a marginal cast that strands a melee commander from a target it still
 * needs to WALK to should lose to MOVE_AND_ATTACK, while a cast that swings the
 * fight — a real heal, or an attack buff the commander can follow with an in-place
 * strike — is preferred. `commanderCastAvailable` already guarantees a legal
 * target exists, so no cast reaching here is wholly wasted.
 */
function commanderCastScore(
  observation: ComputerObservation,
  combat: CombatState,
  unit: CombatUnitState,
  cast: NonNullable<ReturnType<typeof commanderCastOf>>,
): number {
  const playerId = observation.playerId;
  const enemies = livingEnemyUnits(combat, playerId);
  const hasAdjacentEnemy = enemies.some((enemy) =>
    isAdjacent(unit.position, enemy.position),
  );
  // A melee commander with no adjacent enemy must still WALK to fight; casting
  // now forfeits that walk. A ranged commander, one already engaged, or one with
  // nothing to reach pays no such price.
  const strandsFromTarget =
    enemies.length > 0 && !hasAdjacentEnemy && unit.type !== "ranged";

  let base: number;
  let swing = false;
  switch (cast.effect.kind) {
    case "heal":
    case "heal-cleanse": {
      // Offered only with a damaged friendly present (damagedOnly targeting).
      // Value by the most-wounded ally — a big heal genuinely swings the fight.
      const maxMissing = Object.values(combat.units).reduce(
        (worst, other) =>
          other.controllerId === playerId && unitRemainingHealth(other) > 0
            ? Math.max(worst, other.maxHealth - unitRemainingHealth(other))
            : worst,
        0,
      );
      base = 600 + Math.min(60, maxMissing * 15);
      swing = maxMissing >= 2;
      break;
    }
    case "attack-buff":
    case "precision":
      // A pre-attack buff pays off when the commander can strike THIS activation
      // (buff, then attack in place): with an adjacent enemy it is a clear swing.
      base = hasAdjacentEnemy ? 640 : 560;
      swing = hasAdjacentEnemy;
      break;
    case "initiative-shift":
      // Haste an ally / slow an enemy — a solid tempo buff.
      base = 575;
      break;
    case "adjacent-allies-buff": {
      // Kyousuke's rally buffs every ADJACENT ally, so its value is the size of
      // the huddle: alone it does nothing at all and must never be cast. Reads
      // the ENGINE's own commanderAdjacentAllies, so the score, the offer gate
      // and the resolution can never disagree about who is rallied.
      const rallied = commanderAdjacentAllies(combat, unit).length;
      if (rallied === 0) {
        return -1_000;
      }
      base = 570 + Math.min(60, rallied * 20);
      swing = rallied >= 2;
      break;
    }
    case "fire-shield":
    case "unlimited-retaliation":
      // Defensive buffs — worth casting while the fight continues.
      base = 560;
      break;
    default:
      base = 550;
  }
  // Caster commanders (Necropolis Soul Eater / Animate Dead, Tower Temple
  // Guardian / Precision, Conflux Astral Spirit / Counterstrike) grade Magic
  // specifically to power their once-per-round Command cast, and they are
  // back-line support that never wanted a melee walk. Ranked humans cast exactly
  // these almost every round a target exists (soul_eater 15, temple 5, astral 4
  // across 16 commander games) while the AI, scoring the cast below a routine
  // ~700 attack, cast them ~0 (self-play: astral 11 legal/0, temple 9/0). The
  // cast is only OFFERED when a valid target exists (commanderCastAvailable →
  // commanderCastCandidates > 0), so lifting a caster's beneficial cast above a
  // routine attack never produces a no-op; a clearly better attack (lethal on a
  // gold body, ~780+) still outscores it. A big SWING heal is worth casting for
  // ANY commander (Paladin's Cure on a badly-wounded ally). Hierophant's Shield
  // and Ogre's Stone Skin are instant reactions handled off-turn, never here.
  const isCaster = commanderValuesMagicGrade(unit.commanderSlug);
  const bigHeal = swing && (cast.effect.kind === "heal" || cast.effect.kind === "heal-cleanse");
  if (isCaster && base > 0) {
    base = Math.max(base, 715);
  } else if (bigHeal) {
    base = Math.max(base, 710);
  }
  // Movement lock: a marginal MELEE-rush commander that would forfeit a NEEDED
  // walk loses to a real strike / move-and-attack (620+). Casters pay no such
  // price (support, not rushers); a swing cast still fires.
  if (strandsFromTarget && !swing && !isCaster) {
    base -= 130;
  }
  return base;
}

/**
 * Strategic scores for a computer's own combat activation. Returns null for any
 * action it does not specialize (tactics finish, end-activation…), delegating
 * those to the map/foundation layers unchanged.
 */
export function scoreCombatAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  const combat: CombatState | null = observation.state.combat;
  if (!combat) return null;

  if (action.type === "USE_UNIT_ABILITY" || action.type === "SUMMON_DEMONS" || action.type === "USE_GENIE_DECK_DRAW") {
    const state = observation.state as unknown as GameState;
    const value = evaluateUnitAbility(state, action);
    const actor = combat.units[action.unitId];
    if (value && actor) {
      if (value.value <= 0) return { score: 350, policy: "combat.ability-no-benefit" };
      if (value.free) return { score: 890 + Math.min(9, value.value), policy: "combat.free-unit-ability" };
      const opportunity = bestAttackOpportunity(state, actor);
      const bestAttackScore = Math.max(550, ...observation.legalActions.flatMap(({ action: candidate }) => {
        if ((candidate.type !== "ATTACK_UNIT" && candidate.type !== "MOVE_AND_ATTACK_UNIT") || candidate.attackerId !== actor.id) return [];
        const target = combat.units[candidate.defenderId];
        return target ? [attackScore(combat, actor.controllerId, actor, target,
          candidate.type === "MOVE_AND_ATTACK_UNIT" ? candidate.destination : actor.position, state)] : [];
      }));
      return { score: Math.max(410, Math.min(885, bestAttackScore + (value.value - opportunity) * 24)),
        policy: "combat.unit-ability-value" };
    }
  }

  switch (action.type) {
    case "PLACE_COMBAT_UNIT":
      return {
        score: placeScore(observation, action),
        policy: "combat.place-formation",
      };
    case "PLACE_NEUTRAL_GUARD":
      return {
        score: neutralPlacementScore(observation, action),
        policy: "combat.place-neutral-formation",
      };
    case "SWAP_COMBAT_UNITS":
      return {
        score: swapScore(observation, action),
        policy: "combat.tactics-swap",
      };
    case "FINISH_TACTICS":
      // Finish once no improving swap remains (swaps score 905+ when useful,
      // 870 when not — finish at 900 wins over no-op swaps).
      return { score: 900, policy: "combat.finish-tactics" };
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT": {
      const attacker = combat.units[action.attackerId];
      const defender = combat.units[action.defenderId];
      if (!attacker || !defender) return null;
      const attackFrom =
        action.type === "MOVE_AND_ATTACK_UNIT"
          ? action.destination
          : attacker.position;
      const baseScore = attackScore(
        combat,
        // A player directing neutral guards is not the attacking unit's side.
        attacker.controllerId,
        attacker,
        defender,
        attackFrom,
        observation.state as unknown as GameState,
      );
      return {
        score: baseScore + (action.type === "MOVE_AND_ATTACK_UNIT"
          ? Math.min(0, friendlyLaneChange(combat, attacker, attackFrom, observation.state as unknown as GameState)) : 0),
        // Preserve special priority/safety decisions even if the lane penalty
        // moves their final number back into the ordinary attack band.
        policy: baseScore > ATTACK_CEIL || baseScore < ATTACK_FLOOR
          ? "combat.attack-rule-priority" : "combat.attack-target",
      };
    }
    case "MOVE_UNIT":
      return moveUnitScore(observation, action);
    case "USE_UNIT_ABILITY": {
      // WOG commander activation cast (target picked after, no board target yet):
      // score by whether the cast swings the fight, factoring the movement lock.
      const actor = combat.units[action.unitId];
      // ACTION-POINT commanders (Ibuki, Kyousuke): a TARGET-LESS utility skill
      // (Kyousuke's Strategy Meeting card draw) is priced on its own, because
      // the generic 550 fallthrough below would buy a card ahead of a Defend
      // that saves the body — and, worse, ahead of the walk into the fight (a
      // command ends the activation's movement). The TARGETED AP skills keep the
      // generic enemy/ally scoring, so Ibuki's numbers are unchanged.
      const apSkill = actor
        ? commanderApSkillOf(actor.commanderSlug, action.abilityId)
        : null;
      if (actor && apSkill && apSkill.target === "none") {
        const enemies = livingEnemyUnits(combat, actor.controllerId);
        const engaged = enemies.some((enemy) =>
          isAdjacent(actor.position, enemy.position),
        );
        const strands =
          enemies.length > 0 &&
          !engaged &&
          actor.type !== "ranged" &&
          !actor.movedThisActivation;
        return {
          score: strands ? 420 : 552,
          policy: "combat.commander-ap-utility",
        };
      }
      const cast = actor ? commanderCastOf(actor, action.abilityId) : null;
      if (
        actor &&
        cast &&
        cast.abilityId === action.abilityId &&
        action.target?.type === "none"
      ) {
        return {
          score: commanderCastScore(observation, combat, actor, cast),
          policy: "combat.commander-cast",
        };
      }
      // Prefer spending an activation ability over a plain defend when offered.
      // Targeted abilities that name a high-threat enemy score higher.
      if (action.target?.type === "unit") {
        const target = combat.units[action.target.unitId];
        // Ally/enemy from the ACTING unit's side (a controlled neutral's ally
        // is another guard, never the controller's own army).
        const actingSide = actor?.controllerId ?? observation.playerId;
        if (target && target.controllerId !== actingSide) {
          return {
            score: 560 + Math.min(40, Math.round(unitThreatValue(target) / 3)),
            policy: "combat.use-ability-enemy",
          };
        }
        if (target && target.controllerId === actingSide) {
          const missing = unitRemainingHealth(target) < target.maxHealth;
          return {
            score: missing ? 580 : 545,
            policy: "combat.use-ability-ally",
          };
        }
      }
      return { score: 550, policy: "combat.use-ability" };
    }
    case "SUMMON_DEMONS":
      return { score: 600, policy: "combat.summon-demons" };
    case "USE_GENIE_DECK_DRAW":
      return { score: 590, policy: "combat.genie-wish" };
    case "USE_HERO_SKILL":
      // Anime Hero Grades War Cry (§3.11): a +Attack buff on the active unit,
      // offered only BEFORE it attacks. Scored just above a real attack (700) so
      // the AI lands the free once-per-combat buff first, then strikes. The map
      // Forced March (no combat) is scored by map-policy instead.
      return combat ? { score: 715, policy: "combat.hero-war-cry" } : null;
    case "USE_FUYUKI_COMMAND_SEAL": {
      if (!combat) return null;
      if (action.mode === "recall") {
        const target = combat.units[action.unitId];
        const missing = target ? target.maxHealth - unitRemainingHealth(target) : 0;
        return { score: missing >= 2 ? 722 : 705, policy: "combat.fuyuki-command-seal-recall" };
      }
      return { score: 716, policy: "combat.fuyuki-command-seal-compel" };
    }
    case "LITTLE_BUSTERS_COUNTER": {
      // Each counter is a one-time 1-gold PvP action. Use it before the normal
      // activation: damaging the campus hero is strongest, forced discard
      // denies an immediate combat card, and drawing replaces itself in value.
      const score = action.counter === "damage" ? 5030 : action.counter === "discard" ? 5020 : 5010;
      return { score, policy: `combat.little-busters-counter-${action.counter}` };
    }
    case "WAIT_UNIT": {
      // Polish Wait: re-queue the unit at the end of the round. Wait is only
      // worth an activation when it BUYS something — see WAIT_IDLE_SCORE /
      // WAIT_BAIT_SCORE. Score the unit's ACTUAL side (a controlled Neutral's
      // enemies are the fighter's army, not the controller's).
      const waiter = combat.units[action.unitId];
      if (!waiter) return { score: WAIT_IDLE_SCORE, policy: "combat.wait-idle" };
      const side = waiter.controllerId;
      const enemies = livingEnemyUnits(combat, side);
      // A unit that can strike RIGHT NOW must strike: a ranged unit always has
      // a shot, a melee/flying one whenever an enemy is adjacent.
      const canStrikeNow =
        !waiter.attackedThisActivation &&
        enemies.some(
          (enemy) => canUnitAttack(combat, waiter, enemy, observation.state.activeEffects ?? []),
        );
      if (canStrikeNow) {
        return { score: WAIT_IDLE_SCORE, policy: "combat.wait-idle" };
      }
      // Wait behind a screen only when an unspent enemy has a legal approach
      // to that screen and we can answer from the resulting board. Ranged
      // enemies never supply this bait; a flyer still needs a free landing.
      const state = observation.state as unknown as GameState;
      if (reserveCombatUnit(combat, waiter) &&
          coordinatedReplyDamage(combat, waiter, waiter.position, undefined, state) === 0) {
        const screens = livingFriendlies(combat, side).filter((ally) =>
          ally.id !== waiter.id && !ally.commanderSlug &&
          unitThreatValue(ally) < unitThreatValue(waiter) * 0.65);
        const canCounterApproach = enemies.some((enemy) =>
          !enemy.activatedThisRound && enemy.type !== "ranged" && !isParalyzed(enemy) &&
          getLegalMoveDestinations(combat, enemy, state).some((destination) => {
            if (!screens.some((screen) => canUnitMoveAndAttack(combat, enemy, destination, screen, state))) return false;
            const moved = { ...enemy, position: destination };
            const board = { ...combat, units: { ...combat.units, [enemy.id]: moved } };
            const projected = { ...state, combat: board };
            return canUnitAttack(board, waiter, moved, state.activeEffects) ||
              getLegalMoveDestinations(board, waiter, projected).some((reply) =>
                canUnitMoveAndAttack(board, waiter, reply, moved, projected));
          }));
        if (canCounterApproach) return { score: 590, policy: "combat.wait-screen-counter" };
      }
      // A wounded body saves itself with Defend (500+) rather than acting last.
      if (waiter.maxHealth - unitRemainingHealth(waiter) >= 2) {
        return { score: WAIT_IDLE_SCORE, policy: "combat.wait-idle" };
      }
      // The real upside: an enemy that has NOT acted this round is one step
      // away, so waiting makes IT close the gap and we strike after it moves,
      // instead of marching into its charge. A distant enemy is chased, not
      // waited for — that is what made the AI wait every round.
      const baited = enemies.some(
        (enemy) =>
          !enemy.activatedThisRound &&
          enemy.type !== "ranged" &&
          !isParalyzed(enemy) &&
          enemy.position >= 0 &&
          getBattlefieldDistance(waiter.position, enemy.position) <=
            WAIT_BAIT_MAX_DISTANCE,
      );
      return baited
        ? { score: WAIT_BAIT_SCORE, policy: "combat.wait-bait" }
        : { score: WAIT_IDLE_SCORE, policy: "combat.wait-idle" };
    }
    case "DEFEND_UNIT": {
      // Prefer defending a wounded unit over a healthy one (still below any
      // real attack). A unit that already moved and cannot strike should sit
      // in Defend rather than END_ACTIVATION when offered.
      const defender = combat.units[action.unitId];
      if (!defender) return { score: 500, policy: "combat.defend" };
      // Legal-actions already suppresses this, but keep the policy invariant
      // explicit so a synthetic or future action source cannot defend twice.
      if (defender.defendedLastActivation) {
        return { score: -1_000, policy: "combat.defend-consecutive-refuse" };
      }
      const missing = defender.maxHealth - unitRemainingHealth(defender);
      let score = 500 + Math.min(30, missing * 4);
      // Save the high-value body: when the enemies in reach (adjacent melee +
      // any ranged) can finish this unit and it is worth keeping, Defend
      // outranks a suicidal 0-damage poke (545). The surround (+45..75) and
      // high-value (+50) bumps below can lift Defend to ~655 for a wounded,
      // surrounded, valuable unit the enemy would otherwise kill — a deliberate
      // save, so a marginal strike just under that yields to preserving it;
      // stronger real strikes (well above ~655) still win and chaff keeps trading.
      // Score threats and support from the DEFENDING unit's actual side —
      // under player-controlled neutrals the decision owner is a player while
      // the guard stays neutral-side (the attack branch's rule).
      const defenderSide = defender.controllerId;
      const incoming = combat.context?.kind === "player"
        ? coordinatedReplyDamage(combat, defender, defender.position, undefined, observation.state as unknown as GameState)
        : pendingIncomingDamage(combat, defenderSide, defender);
      const adjacentEnemies = livingEnemyUnits(combat, defenderSide).filter(
        (enemy) => isAdjacent(enemy.position, defender.position),
      ).length;
      const adjacentSupport = livingFriendlies(combat, defenderSide).filter(
        (friend) =>
          friend.id !== defender.id &&
          isAdjacent(friend.position, defender.position),
      ).length;
      if (incoming > 0 && adjacentEnemies > adjacentSupport + 1) {
        score += 45 + Math.min(30, (adjacentEnemies - adjacentSupport - 1) * 15);
      }
      if (
        unitThreatValue(defender) >= 25 &&
        incoming >= unitRemainingHealth(defender)
      ) {
        score += 50;
        return { score, policy: "combat.defend-high-value" };
      }
      return {
        score,
        policy:
          adjacentEnemies > adjacentSupport + 1
            ? "combat.defend-surrounded"
            : "combat.defend-wounded",
      };
    }
    case "ATTACK_FORTIFICATION": {
      const breacher = combat.units[action.attackerId];
      const siege = combat.siege;
      // NEVER tear down our OWN Walls/Gate. The printed rule allows it ("even
      // by your own defending units", see `attackFortification`) and the offer
      // is deliberately left legal for a human, but a computer defending its
      // town — or a computer-driven Random Town guard — demolishing the very
      // fortification it hides behind is always a blunder. Refuse below every
      // exit so it can never be picked.
      if (breacher && siege && breacher.controllerId === siege.townPlayerId) {
        return {
          score: -1_000,
          policy: "combat.attack-own-fortification-refuse",
        };
      }
      // A besieger with a living enemy body already in reach hits the body:
      // masonry never activates, never retaliates and never dies to focus fire.
      const reachableEnemy =
        breacher &&
        livingEnemyUnits(combat, breacher.controllerId).some(
          (enemy) =>
            breacher.type === "ranged" ||
            isAdjacent(breacher.position, enemy.position),
        );
      return {
        score: reachableEnemy
          ? FORTIFICATION_WITH_TARGET_SCORE
          : FORTIFICATION_BREACH_SCORE,
        policy: "combat.attack-fortification",
      };
    }
    case "CONTINUE_NEUTRAL_COMBAT": {
      // Keep fighting when the battle is still winnable; when hopeless, fall
      // below RETREAT so the AI spends the continue only when it matters.
      if (combatIsHopeless(observation, combat)) {
        return { score: 200, policy: "combat.continue-hopeless" };
      }
      return { score: 360, policy: "combat.continue" };
    }
    case "RETREAT_FROM_COMBAT":
    case "SURRENDER_COMBAT":
    case "GIVE_UP_COMBAT": {
      // Foundation scores these −900 (last resort). Promote only when the fight
      // is clearly lost so the AI saves movement / remaining army.
      // Keep-troops PvP (lobby casualty mode "none"): a lost battle costs no
      // unit, so leaving early only forfeits the chance to win — and a Give up
      // even discards the whole hand. USER RULE: in this mode the AI never runs
      // from a player battle; it fights to the last unit.
      if (combat.context.kind === "player" &&
          adventurePvpTroopLoss(observation.state as unknown as GameState) === "none") {
        return { score: -900, policy: "combat.keep-troops-never-retreat" };
      }
      if (combatIsHopeless(observation, combat)) {
        const lostAUnit = Object.values(combat.units).some(
          (unit) =>
            unit.controllerId === observation.playerId && unitRemainingHealth(unit) <= 0,
        );
        if (
          combat.context.kind === "player" &&
          lostAUnit &&
          livingFriendlies(combat, observation.playerId).length > 0
        ) {
          return { score: PVP_CONCEDE_SCORE, policy: "combat.pvp-concede-hopeless" };
        }
        return { score: 380, policy: "combat.retreat-hopeless" };
      }
      return { score: -900, policy: "combat.retreat-refuse" };
    }
    default:
      return null;
  }
}
