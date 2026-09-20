import { locationDefinitions } from "@/data/map/locations";
import { cardLibrary } from "@/data/cards/library";
import { isFieldGuarded } from "../adventure";
import { effectiveInitiative } from "../active-effects";
import { isAdjacent } from "../battlefield";
import { getSpellDamageAmount } from "../effects";
import { canUnitAttack, canUnitMoveAndAttack, getLegalMoveDestinations, standingSpellPower } from "../legal-actions";
import { baseCardId } from "../phantom-cards";
import { previewSpellDamage } from "../reducer";
import { spellLimitFor } from "../ruleset";
import { balanceCardLibrary } from "../community-balance-cards";
import type { CombatUnitState, GameState, LegalAction } from "../state";
import { crownsAvailable } from "./card-policy";
import { upcomingFight } from "./card-planning";
import { playersAreAllied } from "./control";
import { ATTACK_CEIL, ATTACK_FLOOR } from "./combat-policy";
import { isParalyzed, unitRemainingHealth, unitRemovalHealth, unitThreatValue } from "./score";
import { estimatedStrikeDamage } from "./strike-value";
import {
  combatHorizonAdjustment,
  COMBAT_PLANNING_CANDIDATES,
  COMBAT_PLANNING_WORK_LIMIT,
} from "./planning-horizon";
import type { ComputerObservation } from "./types";

type RankedAction = { legal: LegalAction; score: number; policy: string; tie: number };

type RoundStrike = { damage: number; beforeEnemy: boolean; current?: RankedAction };

/** Look across every friendly activation still available this round. The
 * forecast uses legal current attacks and the move engine for later units; it
 * never assumes an unreachable melee hit. Resolution is reconsidered after
 * every actual action, so dice, retaliation and changed lanes are observed. */
export function refinePvpCombatSpellRound(observation: ComputerObservation, ranked: RankedAction[]): void {
  const combat = observation.state.combat;
  if (combat?.context.kind !== "player") return;
  const state = observation.state as unknown as GameState;
  const cards = balanceCardLibrary(state, cardLibrary);
  const damageCasts = ranked.filter(candidate => {
    const action = candidate.legal.action;
    if (action.type !== "CAST_SPELL" || action.target?.type !== "unit") return false;
    const card = cards[baseCardId(action.cardId)];
    return card?.kind === "spell" && (card.timing === "combat" || card.timing === "action") &&
      card.effect.type === "DEAL_DAMAGE";
  });
  const denialCasts = ranked.filter(candidate => {
    const action = candidate.legal.action;
    if (action.type !== "CAST_SPELL" || action.target?.type !== "unit") return false;
    const card = cards[baseCardId(action.cardId)];
    return card?.kind === "spell" && (card.timing === "combat" || card.timing === "action") &&
      (card.effect.type === "PLACE_PARALYSIS" || card.effect.type === "SKIP_ACTIVATION");
  });
  const friendlies = Object.values(combat.units).filter(unit => unit.controllerId === observation.playerId &&
    unit.position >= 0 && unitRemainingHealth(unit) > 0 && !unit.activatedThisRound &&
    !unit.attackedThisActivation && !isParalyzed(unit));
  const owner = state.players[observation.playerId];
  const heldPower = (owner?.hand ?? []).filter(id => baseCardId(id) === "stat.power").length;
  const powerBudget = heldPower + Math.min(heldPower, Math.max(0, crownsAvailable(observation)));
  const activeAttacks = ranked.filter(candidate =>
    (candidate.legal.action.type === "ATTACK_UNIT" || candidate.legal.action.type === "MOVE_AND_ATTACK_UNIT") &&
    candidate.score >= ATTACK_FLOOR);

  // Attack-triggered Instant spells have their own window AFTER an attack is
  // declared. Plan that sequence separately from pre-move activation casts:
  // Bloodlust/Precision/Prayer can turn a reachable strike into a removal,
  // but cannot be spent before the attack or on a unit they do not affect.
  const instantSlotOpen = Boolean(owner &&
    (owner.combatStats?.spellsCastThisRound ?? 0) < spellLimitFor(state, owner));
  const instantAttackBoost = (attacker: CombatUnitState): number => {
    if (!instantSlotOpen) return 0;
    let best = 0;
    for (const cardId of owner?.hand ?? []) {
      const card = cards[baseCardId(cardId)];
      if (card?.kind !== "spell" || card.timing !== "instant") continue;
      const options = card.effect.type === "CHOOSE_ONE"
        ? card.effect.options.map(option => ({ trigger: option.trigger, effect: option.effect }))
        : [{ trigger: card.trigger, effect: card.effect }];
      for (const option of options) {
        if (option.trigger?.event !== "UNIT_ATTACK_DECLARED" ||
            (option.trigger.controller !== "self" && option.trigger.controller !== "any") ||
            option.effect.type !== "ADD_COMBAT_STAT" || option.effect.stat !== "attack" ||
            (option.effect.unitTypes && !option.effect.unitTypes.includes(attacker.type))) continue;
        best = Math.max(best, option.effect.amountByPower?.[0] ?? option.effect.amount ?? 0);
      }
    }
    return best;
  };
  for (const candidate of activeAttacks) {
    const action = candidate.legal.action;
    if (action.type !== "ATTACK_UNIT" && action.type !== "MOVE_AND_ATTACK_UNIT") continue;
    const attacker = combat.units[action.attackerId];
    const defender = combat.units[action.defenderId];
    if (!attacker || !defender || defender.controllerId === observation.playerId) continue;
    const from = action.type === "MOVE_AND_ATTACK_UNIT" ? action.destination : attacker.position;
    const base = estimatedStrikeDamage(attacker, defender, from);
    const boosted = base + instantAttackBoost(attacker);
    if (base < unitRemovalHealth(defender) && boosted >= unitRemovalHealth(defender)) {
      candidate.score = Math.max(candidate.score, 865 +
        (defender.type === "ranged" && !defender.activatedThisRound ? 20 : 0));
      candidate.policy = "plan.instant-spell-attack-removal";
    }
  }

  const usefulDamage = (ally: CombatUnitState, enemy: CombatUnitState, from: number): number => {
    const damage = estimatedStrikeDamage(ally, enemy, from);
    if (damage <= 0) return 0;
    if (damage < unitRemovalHealth(enemy) && isAdjacent(from, enemy.position) &&
        !enemy.retaliatedThisRound && !ally.abilities?.includes("ignores-retaliation") &&
        estimatedStrikeDamage(enemy, ally, enemy.position, true) >= unitRemainingHealth(ally)) return 0;
    return damage;
  };
  // strikesAgainst is pure for the duration of this planning pass (it only
  // reads the fixed combat/friendlies/activeAttacks state), yet it is invoked
  // once per denial and once per damage candidate — recomputing the same
  // enemy's reachable-strike forecast, including the move-engine scan, many
  // times over. Cache by enemy id so a large PvP combat does not regress into
  // the documented multi-second AI-decision freeze.
  const strikeCache = new Map<string, RoundStrike[]>();
  const strikesAgainst = (enemy: CombatUnitState): RoundStrike[] => {
    const cached = strikeCache.get(enemy.id);
    if (cached) return cached;
    const enemyInitiative = effectiveInitiative(enemy, state.activeEffects ?? [], combat);
    const strikes: RoundStrike[] = [];
    for (const ally of friendlies) {
      let best = 0;
      let current: RankedAction | undefined;
      if (ally.id === combat.activeUnitId) {
        for (const candidate of activeAttacks) {
          const action = candidate.legal.action;
          if ((action.type !== "ATTACK_UNIT" && action.type !== "MOVE_AND_ATTACK_UNIT") ||
              action.attackerId !== ally.id || action.defenderId !== enemy.id) continue;
          const damage = usefulDamage(ally, enemy,
            action.type === "MOVE_AND_ATTACK_UNIT" ? action.destination : ally.position);
          if (damage > best) { best = damage; current = candidate; }
        }
      } else {
        if (canUnitAttack(combat, ally, enemy, state.activeEffects ?? [])) {
          best = usefulDamage(ally, enemy, ally.position);
        }
        if (best < unitRemovalHealth(enemy)) {
          for (const destination of getLegalMoveDestinations(combat, ally, state)) {
            if (canUnitMoveAndAttack(combat, ally, destination, enemy, state)) {
              best = Math.max(best, usefulDamage(ally, enemy, destination));
            }
          }
        }
      }
      if (best > 0) strikes.push({
        damage: best,
        current,
        beforeEnemy: enemy.activatedThisRound || ally.id === combat.activeUnitId ||
          effectiveInitiative(ally, state.activeEffects ?? [], combat) > enemyInitiative,
      });
    }
    strikeCache.set(enemy.id, strikes);
    return strikes;
  };

  // Activation denial must land before the victim acts. A later friendly
  // activation can provide the same pre-move cast window, so let useful moves
  // and attacks happen first. Do not spend Blind on a unit the army can remove
  // before it acts (damage would also clear Blind's token).
  for (const candidate of denialCasts) {
    const action = candidate.legal.action;
    if (action.type !== "CAST_SPELL" || action.target?.type !== "unit") continue;
    const enemy = combat.units[action.target.unitId];
    if (!enemy || enemy.controllerId === observation.playerId || enemy.activatedThisRound || isParalyzed(enemy)) continue;
    const before = strikesAgainst(enemy).filter(strike => strike.beforeEnemy)
      .reduce((sum, strike) => sum + strike.damage, 0);
    if (before >= unitRemovalHealth(enemy)) {
      candidate.score = 370;
      candidate.policy = "plan.denial-spell-physical-removal";
      continue;
    }
    const enemyInitiative = effectiveInitiative(enemy, state.activeEffects ?? [], combat);
    const laterCastWindow = friendlies.some(ally => ally.id !== combat.activeUnitId &&
      effectiveInitiative(ally, state.activeEffects ?? [], combat) > enemyInitiative);
    if (laterCastWindow) {
      candidate.score = 440;
      candidate.policy = "plan.denial-spell-later-window";
    } else {
      candidate.score = Math.min(875, 810 + Math.min(35, Math.round(unitThreatValue(enemy) / 2)) +
        (enemy.type === "ranged" ? 25 : 0));
      candidate.policy = "plan.denial-spell-before-enemy";
    }
  }

  for (const candidate of damageCasts) {
    const action = candidate.legal.action;
    if (action.type !== "CAST_SPELL" || action.target?.type !== "unit") continue;
    const card = cards[baseCardId(action.cardId)];
    if (!card) continue;
    const enemy = combat.units[action.target.unitId];
    if (!enemy || enemy.controllerId === observation.playerId) continue;
    const printed = getSpellDamageAmount(card,
      Math.max(0, (card.power ?? 0) + standingSpellPower(state, observation.playerId, card) + powerBudget));
    const spellDamage = previewSpellDamage(state, enemy, card, printed);
    if (spellDamage <= 0) { candidate.score = 200; candidate.policy = "plan.damage-spell-no-hit"; continue; }
    const removal = unitRemovalHealth(enemy);
    const strikes = strikesAgainst(enemy);
    const before = strikes.filter(strike => strike.beforeEnemy).reduce((sum, strike) => sum + strike.damage, 0);
    const all = strikes.reduce((sum, strike) => sum + strike.damage, 0);
    const shooter = enemy.type === "ranged";
    const threat = Math.min(35, Math.round(unitThreatValue(enemy) / 2));
    const current = strikes.find(strike => strike.current)?.current;
    const instantRemoval = activeAttacks.some(entry => {
      const attack = entry.legal.action;
      return entry.policy === "plan.instant-spell-attack-removal" &&
        (attack.type === "ATTACK_UNIT" || attack.type === "MOVE_AND_ATTACK_UNIT") &&
        attack.defenderId === enemy.id;
    });
    // The entire reachable army can remove this target without the spell.
    if (before >= removal || (enemy.activatedThisRound && all >= removal)) {
      candidate.score = 380;
      candidate.policy = "plan.damage-spell-physical-removal";
      continue;
    }
    if (instantRemoval && spellDamage < removal) {
      candidate.score = 430;
      candidate.policy = "plan.damage-spell-save-for-instant-removal";
      continue;
    }
    // One or more reachable attacks plus this spell can finish it this round. It
    // cannot be cast after THIS unit moves or attacks. Attack first only when
    // another friendly will have a pre-move cast window before this enemy acts;
    // otherwise cast now, then use this unit's still-legal attack.
    if (spellDamage < removal && all > 0 && all + spellDamage >= removal) {
      const laterCastWindow = friendlies.some(ally => ally.id !== combat.activeUnitId &&
        (enemy.activatedThisRound || effectiveInitiative(ally, state.activeEffects ?? [], combat) >
          effectiveInitiative(enemy, state.activeEffects ?? [], combat)));
      if (current && !laterCastWindow) {
        candidate.score = Math.min(895, 850 + threat + (shooter ? 25 : 0));
        candidate.policy = "plan.damage-spell-before-move-attack";
      } else {
        candidate.score = 455;
        candidate.policy = "plan.damage-spell-at-later-unit-window";
        if (current) {
          current.score = Math.max(current.score, 870 + (shooter && !enemy.activatedThisRound ? 20 : 0));
          current.policy = "plan.attack-then-later-cast";
        }
      }
      continue;
    }
    // An immediate removal denies the next activation, especially a gold
    // Factory shooter. No tier rule may prefer a nonlethal gold tank chip.
    if (spellDamage >= removal) {
      candidate.score = Math.min(890, 815 + threat + (shooter ? 35 : 0) + (!enemy.activatedThisRound ? 10 : 0));
      candidate.policy = "plan.damage-spell-remove-threat";
      continue;
    }
    // If no friendly will offer another pre-move cast window this round, cast
    // now before this unit moves. Otherwise the AI may let the present unit
    // act and reconsider on the next friendly activation. This last-window
    // floor prevents indefinitely hoarding a real hit.
    const laterCastWindow = friendlies.some(ally => ally.id !== combat.activeUnitId);
    candidate.score = laterCastWindow
      ? (shooter ? 475 : 420) + Math.min(20, spellDamage * 5)
      : Math.min(895, (shooter ? 860 : 825) + Math.min(30, spellDamage * 8));
    candidate.policy = laterCastWindow ? "plan.damage-spell-wait-for-round" : "plan.damage-spell-last-window";
  }
}

const FREE_INFORMATION_INTERACTIONS = new Set([
  "ROLL_RESOURCE_DICE", "ROLL_TREASURE_DICE", "GAIN_RESOURCES",
  "SEARCH_SHARED_DECK", "DISCOVER_ADJACENT_TILE", "SCHOLAR",
]);

/** A finite reveal/pickup can change the best use of money and town tokens.
 * Defer discretionary spending until that result is known, but preserve core
 * development, vouchers, battle preparation and every existing safety gate.
 * No new routes or hypothetical purchases are generated here. */
export function deferDiscretionarySpending(observation: ComputerObservation, ranked: RankedAction[]): void {
  const state = observation.state as unknown as GameState;
  if (!state.adventure || state.combat || upcomingFight(observation)?.kind === "pvp" ||
      observation.memory?.developmentPlan?.goal === "rebuild") return;

  let informationScore = 300;
  for (const candidate of ranked) {
    if (candidate.score <= 300) continue;
    const action = candidate.legal.action;
    if (action.type === "DISCOVER_TILE") {
      informationScore = Math.max(informationScore, candidate.score);
    } else if (action.type === "MOVE_HERO") {
      const field = state.adventure.fields[action.to];
      // Restrict to a fresh, unguarded pickup. Empty moves, repeat visits,
      // banks, town assaults and teleports must not starve development.
      if (!field || field.blackCube || isFieldGuarded(field) ||
          locationDefinitions[field.location]?.category !== "visitable" ||
          !FREE_INFORMATION_INTERACTIONS.has(locationDefinitions[field.location]?.interaction.type) ||
          Object.values(state.heroes).some(hero => hero.spaceId === action.to &&
            !playersAreAllied(state, observation.playerId, hero.controllerId))) continue;
      informationScore = Math.max(informationScore, candidate.score);
    }
  }
  if (informationScore <= 300) return;
  for (const candidate of ranked) {
    const type = candidate.legal.action.type;
    // The 950+ band contains explicit milestone / hero priorities. The
    // voucher and preparation bands are higher still and remain untouched.
    if ((type === "BUILD_STRUCTURE" || type === "POPULATION_ACTION") &&
        candidate.score > 300 && candidate.score < 950 && candidate.score >= informationScore) {
      candidate.score = Math.max(301, informationScore - 13);
      candidate.policy = "plan.observe-before-discretionary-spend";
    }
  }
}

/** Called once after ordinary scoring, before learned close-choice nudges.
 * At most four close attacks share 384 reply checks. Exhaustion discards the
 * whole refinement, so enumeration order cannot reward an unfinished search. */
export function refineCombatShortlist(observation: ComputerObservation, ranked: RankedAction[]): void {
  if (!observation.state.combat) return;
  const ordinaryAttack = (candidate: RankedAction) =>
    candidate.policy === "combat.attack-target" && candidate.score >= ATTACK_FLOOR && candidate.score <= ATTACK_CEIL;
  const shortlist = ranked.filter(ordinaryAttack)
    .sort((a, b) => b.score - a.score || b.tie - a.tie);
  const best = shortlist[0];
  if (!best || ranked.some(candidate => !ordinaryAttack(candidate) && candidate.score > Math.min(ATTACK_CEIL, best.score + 24))) return;
  const close = shortlist.filter(candidate => best.score - candidate.score <= 48).slice(0, COMBAT_PLANNING_CANDIDATES);
  const budget = { remaining: COMBAT_PLANNING_WORK_LIMIT };
  const adjustments: number[] = [];
  for (const candidate of close) {
    adjustments.push(combatHorizonAdjustment(observation.state as unknown as GameState, candidate.legal.action, budget));
    if (budget.remaining < 0) return;
  }
  close.forEach((candidate, index) => {
    candidate.score = Math.max(ATTACK_FLOOR, Math.min(ATTACK_CEIL, candidate.score + adjustments[index]));
    if (adjustments[index] !== 0) candidate.policy = "combat.attack-target-lookahead";
  });
}
