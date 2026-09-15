import { cardLibrary } from "@/data/cards/library";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyRecruitGoldDiscount, hasRecruitResources, heroMovementMax, isFieldGuarded,
  legionDiscountTargets, neutralRecruitCost, playerRecruitTierUnlocked, playerRecruitUnitSide,
  reinforcementDiscountCostFor, reinforceCostFor } from "../adventure";
import { polishArmyUnitStackCost } from "../polish-unit-stacks";
import { balanceCardLibrary } from "../community-balance-cards";
import { spellBookRuleEnabled } from "../ruleset";
import type { CardDefinition, GameState, RecruitDiscountVoucher, ResourceCost } from "../state";
import { armyDevelopmentProfile, goldArmyAllowsBronzePurchase } from "./development";
import { canBeatGuardedField, distanceFromHeroTo, primaryMapObjective, seatHoldsFarSupplyTile } from "./map-navigation";
import type { ComputerObservation } from "./types";
import { isOpeningFarSweepField } from "./far-sweep";
import { playersAreAllied } from "./control";
import { pvpReach } from "./pvp-reach";

/** Own ready cards only: discarded spells cannot support the hand's Power. */
export function readySpells(state: GameState, playerId: string): CardDefinition[] {
  const player = state.players[playerId];
  if (!player) return [];
  const cards = balanceCardLibrary(state, cardLibrary);
  return [...(player.hand ?? []), ...(spellBookRuleEnabled(state) ? player.spellBook ?? [] : [])]
    .map(id => cards[id]).filter(card => card?.kind === "spell" && card.implementationStatus === "implemented");
}

export type FightPreparation = { kind: "neutral" | "pvp"; spaceId?: string };
const preparationCache = new WeakMap<ComputerObservation, FightPreparation | null>();
const nearbyEnemyCache = new WeakMap<ComputerObservation, FightPreparation | null>();

/** Prepare for contact in our remaining movement or the enemy's next move.
 * Each side uses its own keys and movement abilities, without a two-turn radius
 * overriding development just because a distant enemy exists. */
export function nearbyPlayerFight(observation: ComputerObservation): FightPreparation | null {
  if (nearbyEnemyCache.has(observation)) return nearbyEnemyCache.get(observation)!;
  const state = observation.state as unknown as GameState;
  let result: FightPreparation | null = null;
  const heroes = Object.values(state.heroes ?? {});
  const ownHeroes = heroes.filter(hero => hero.controllerId === observation.playerId && hero.spaceId);
  let nearest = Infinity;
  if (state.adventure) for (const enemy of heroes) {
    if (!enemy.spaceId || enemy.controllerId === "neutrals" ||
        state.players[enemy.controllerId]?.eliminated ||
        playersAreAllied(state, observation.playerId, enemy.controllerId)) continue;
    for (const own of ownHeroes) {
      if (!own.spaceId) continue;
      const approach = pvpReach(state, own).get(enemy.spaceId) ?? Infinity;
      const incoming = pvpReach(state, enemy, true).get(own.spaceId) ?? Infinity;
      const distance = Math.min(approach, incoming);
      if (distance < nearest) {
        nearest = distance;
        result = { kind: "pvp", spaceId: enemy.spaceId };
      }
    }
  }
  nearbyEnemyCache.set(observation, result);
  return result;
}

/** Follow the actual march objective, including late-game and player fights. */
export function upcomingFight(observation: ComputerObservation): FightPreparation | null {
  if (preparationCache.has(observation)) return preparationCache.get(observation)!;
  const state = observation.state as unknown as GameState;
  const combat = state.combat;
  let result: FightPreparation | null = null;
  if (combat && !combat.outcome &&
      [combat.attackerPlayerId, combat.defenderPlayerId].includes(observation.playerId)) {
    result = { kind: combat.attackerPlayerId === "neutrals" || combat.defenderPlayerId === "neutrals" ? "neutral" : "pvp" };
  } else if (state.adventure) {
    result = nearbyPlayerFight(observation);
    if (result) {
      preparationCache.set(observation, result);
      return result;
    }
    const hero = Object.values(state.heroes ?? {}).find(h => h.controllerId === observation.playerId && h.kind === "main");
    const objective = hero ? primaryMapObjective(state, hero, undefined, observation.memory?.stickyObjectiveSpaceId) : null;
    const field = objective && state.adventure.fields[objective.spaceId];
    if (!result && hero && objective && field &&
        (distanceFromHeroTo(state, hero, field.spaceId, true) ?? Infinity) <= heroMovementMax(state, hero) * 2) {
      // Distant PvP objectives do not start early hand cycling. Actual contact
      // was already checked above with current movement and coastline stops.
      if (objective.kind !== "enemy-hero" && isFieldGuarded(field) && canBeatGuardedField(state, hero, field)) {
        result = { kind: "neutral", spaceId: field.spaceId };
      }
    }
    // Preparation starts while building/marching, before the readiness gate
    // admits the Far guard as an attack objective. Use revealed nearby fields
    // only; no guard or shared-deck peeking and no change to fight legality.
    if (!result && hero && state.round >= 2) {
      const planned = Object.values(state.adventure.fields).filter(candidate =>
        isOpeningFarSweepField(state, observation.playerId, candidate) &&
        isFieldGuarded(candidate) && (candidate.difficulty ?? 0) >= 3 &&
        !candidate.flagOwnerId &&
        (distanceFromHeroTo(state, hero, candidate.spaceId, true) ?? Infinity) <= heroMovementMax(state, hero) * 2,
      ).sort((a, b) =>
        (distanceFromHeroTo(state, hero, a.spaceId, true) ?? Infinity) -
        (distanceFromHeroTo(state, hero, b.spaceId, true) ?? Infinity) || a.spaceId.localeCompare(b.spaceId));
      if (planned[0]) result = { kind: "neutral", spaceId: planned[0].spaceId };
    }
    // Prepare while spending held Far supply; the guard identity is still
    // hidden, so conserve a general combat hand without inventing a target.
    if (!result && hero && state.round >= 2 && state.round <= 3 &&
        seatHoldsFarSupplyTile(state, observation.playerId)) result = { kind: "neutral" };
  }
  preparationCache.set(observation, result);
  return result;
}

/** Marginal, spendable savings before movement expires a Legion voucher. */
export function legionPurchaseSavings(
  state: GameState, playerId: string, amount: number, valuables = 0,
  target?: RecruitDiscountVoucher["target"],
): number {
  const player = state.players[playerId];
  if (!player || !state.adventure) return 0;
  const profile = armyDevelopmentProfile(state, playerId);
  let best = 0;
  for (const entry of legionDiscountTargets(state, playerId)) {
    const purchase = entry.purchase;
    if (target && (target.kind !== purchase.kind ||
        (target.kind === "recruit" ? target.unitDefId !== purchase.unitDefId :
          purchase.kind === "recruit" || target.armyUnitId !== purchase.armyUnitId))) continue;
    if (!goldArmyAllowsBronzePurchase(state, playerId, purchase.unitDefId, purchase.kind)) continue;
    const voucherTarget: RecruitDiscountVoucher["target"] = purchase.kind === "recruit"
      ? { kind: "recruit", unitDefId: purchase.unitDefId }
      : { kind: purchase.kind, armyUnitId: purchase.armyUnitId };
    // Price a hypothetical voucher with the engine's own rules. Never mutate
    // the observation, and preserve old half-cost-versus-flat-discount rules.
    const discounted: GameState = { ...state, players: { ...state.players, [playerId]: {
      ...player, recruitDiscounts: [...(player.recruitDiscounts ?? []),
        { cardId: "ai-price-preview", amount, valuables, target: voucherTarget }],
    } } };
    const prices: Array<(view: GameState) => ResourceCost | null> = [];
    if (player.townTokens.population && playerRecruitTierUnlocked(state, playerId, purchase.unitDefId) &&
        (purchase.kind === "recruit" || profile.reinforceUnlocked)) {
      prices.push(view => {
        if (purchase.kind === "reinforce") return reinforceCostFor(view, playerId, purchase.armyUnitId, false, false, false);
        if (purchase.kind === "stack") {
          const unit = player.army.find(unit => unit.id === purchase.armyUnitId);
          const cost = unit && polishArmyUnitStackCost(unit);
          return cost ? applyRecruitGoldDiscount(view, playerId, purchase, cost) : null;
        }
        const side = playerRecruitUnitSide(view, playerId, purchase.unitDefId);
        const definition = coreUnitDefinitions[purchase.unitDefId];
        return side && definition?.[side] ? applyRecruitGoldDiscount(view, playerId, purchase, definition[side]!.cost) : null;
      });
    }
    if (purchase.kind !== "recruit") {
      for (const bank of player.reinforcementDiscounts ?? []) {
        prices.push(view => reinforcementDiscountCostFor(view, playerId, bank.id, purchase.armyUnitId, purchase.kind));
      }
    }
    for (const price of prices) {
      const cost = price(state);
      const reduced = price(discounted);
      if (!cost || !reduced || !hasRecruitResources(state, playerId, reduced)) continue;
      best = Math.max(best, (cost.gold ?? 0) - (reduced.gold ?? 0) +
        ((cost.valuables ?? 0) - (reduced.valuables ?? 0)) * 6);
    }
  }
  return best;
}

/** Keep the physical card across a fight; playing its voucher now expires it. */
export function saveLegionForAfterFight(observation: ComputerObservation): boolean {
  if (!upcomingFight(observation)) return false;
  const state = observation.state as unknown as GameState;
  const player = state.players[observation.playerId];
  if (!player) return false;
  const necromancyReady = player.factionId === "necropolis" && player.hand.some(id =>
    cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE");
  const profile = armyDevelopmentProfile(state, observation.playerId);
  return legionDiscountTargets(state, observation.playerId).some(({ purchase }) =>
    ((player.townTokens.population && (purchase.kind === "recruit" || profile.reinforceUnlocked) &&
      playerRecruitTierUnlocked(state, observation.playerId, purchase.unitDefId)) ||
      (necromancyReady && purchase.kind === "reinforce")) &&
    goldArmyAllowsBronzePurchase(state, observation.playerId, purchase.unitDefId, purchase.kind));
}

/** Inline offers are finite: only spend a piece that saves real recruit gold. */
export function inlineLegionSavings(state: GameState, playerId: string, unitDefId: string, amount: number, goldReduction = 0): number {
  const cost = neutralRecruitCost(state, playerId, unitDefId, goldReduction);
  const savings = Math.min(amount, cost.gold ?? 0);
  return hasRecruitResources(state, playerId, { ...cost, gold: (cost.gold ?? 0) - savings }) ? savings : 0;
}
