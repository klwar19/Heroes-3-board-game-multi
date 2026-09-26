/**
 * Computer policy for the WoG era modules (src/engine/wog-era.ts). Every
 * action here is only ever OFFERED while its module is on, so these scorers
 * are inert in every other game.
 *
 * Score bands (policy.ts / map-policy.ts): END_TURN 300, real map plays
 * ~590+, mandatory prompts 1_100+. A null / low score means "never pick".
 */

import { coreUnitDefinitions } from "@/data/factions/units";
import {
  LOAN_PRINCIPAL,
  LOAN_REPAY,
  LOAN_TERM_ROUNDS,
  MITHRIL_FORGE_MINE_COST,
  MITHRIL_WAR_MACHINE_COST,
  MITHRIL_WAR_MACHINES,
  SKILL_COMBOS,
  TEACHER_LESSONS,
  wanderingBossDefinition
} from "@/data/wog/era";
import type { GameAction, GameState, PlayerId } from "../state";
import { upgradeableWarMachines, wanderingBossOnMap } from "../wog-era";
import { playerArmyStrength } from "./army-strength";
import { cardKeepValue } from "./card-policy";
import { developmentResourceTargets, nextGoldLadderStep } from "./development";
import { forecastGuardField } from "./fight-forecast";
import type { ComputerActionScore } from "./map-policy";
import type { ComputerObservation } from "./types";

/** The boss in the same strength currency as unitSideStrength (remaining HP). */
function wanderingBossStrength(state: GameState): number {
  const boss = wanderingBossOnMap(state);
  if (!boss) {
    return Infinity;
  }
  const def = wanderingBossDefinition(boss.defId);
  const remaining = boss.maxHealth - boss.damage;
  return def.attack * 3 + remaining * 2 + def.defense + Math.round(def.initiative / 2);
}

/** Gold the seat will collect from Resource Rounds in rounds (from, to]. */
function goldIncomeBetween(state: GameState, playerId: PlayerId, from: number, to: number): number {
  const perRound = Math.max(0, state.players[playerId]?.production.gold ?? 0);
  let rounds = 0;
  for (let round = from + 1; round <= to; round += 1) {
    if (round > 1 && round % 2 === 1) {
      rounds += 1;
    }
  }
  return perRound * rounds;
}

function surplusGold(state: GameState, playerId: PlayerId): number {
  const gold = state.players[playerId]?.resources.gold ?? 0;
  return gold - developmentResourceTargets(state, playerId).gold;
}

export function scoreWogEraAction(
  observation: ComputerObservation,
  action: GameAction
): ComputerActionScore | null {
  const state = observation.state as unknown as GameState;
  const playerId = observation.playerId;
  const player = state.players[playerId];
  if (!player) {
    return null;
  }
  switch (action.type) {
    case "ATTACK_WANDERING_BOSS": {
      // Main hero only; engage when the army clearly out-muscles what is left
      // of the boss, or vulture a badly wounded boss with a sound army. The
      // boss retaliates without limit, so a thin army never pokes it.
      const hero = state.heroes[action.heroId];
      const boss = wanderingBossOnMap(state);
      if (!hero || hero.kind !== "main" || !boss) {
        return { score: 5, policy: "wog-era.boss-skip" };
      }
      const army = playerArmyStrength(state, playerId);
      const bossStrength = wanderingBossStrength(state);
      const remainingShare = (boss.maxHealth - boss.damage) / boss.maxHealth;
      if (remainingShare <= 0.35 && army >= bossStrength * 1.3) {
        return { score: 780, policy: "wog-era.boss-vulture" };
      }
      if (army >= bossStrength * 2.2) {
        return { score: 640, policy: "wog-era.boss-engage" };
      }
      return { score: 5, policy: "wog-era.boss-too-strong" };
    }
    case "TEACHER_LESSON": {
      const lesson = TEACHER_LESSONS[action.lesson];
      const surplus = surplusGold(state, playerId) - lesson.gold;
      if (surplus < 0) {
        return { score: 5, policy: "wog-era.teacher-preserve-gold" };
      }
      if (action.lesson === "mastery" && action.cardId) {
        // Empower the card worth keeping most (a crown-free Expert side).
        const value = cardKeepValue(action.cardId, observation);
        return { score: value >= 30 ? 600 + Math.min(40, value) : 5, policy: "wog-era.teacher-mastery" };
      }
      if (action.lesson === "retrain" && action.cardId) {
        // Trade away only a card the seat barely wants.
        const value = cardKeepValue(action.cardId, observation);
        return { score: value <= 18 ? 520 : 5, policy: "wog-era.teacher-retrain" };
      }
      if (action.armyUnitId) {
        // Unit study: train a gold/silver body (bronze last).
        const armyUnit = player.army.find((candidate) => candidate.id === action.armyUnitId);
        const tier = armyUnit ? coreUnitDefinitions[armyUnit.unitDefId]?.tier : undefined;
        const nudge = tier === "gold" || tier === "azure" ? 30 : tier === "silver" ? 18 : 4;
        return { score: 505 + nudge, policy: "wog-era.teacher-study-unit" };
      }
      return { score: 500, policy: "wog-era.teacher-study" };
    }
    case "TAKE_LOAN": {
      // Borrow only to land the next Gold-ladder purchase NOW, and only when the
      // Resource Rounds before the deadline repay it with margin.
      const step = nextGoldLadderStep(state, playerId);
      const cost = step?.cost.gold ?? 0;
      const gold = player.resources.gold;
      if (!step || cost <= gold || cost > gold + LOAN_PRINCIPAL) {
        return { score: 5, policy: "wog-era.loan-not-needed" };
      }
      const affordable =
        (step.cost.buildingMaterials ?? 0) <= player.resources.buildingMaterials &&
        (step.cost.valuables ?? 0) <= player.resources.valuables;
      const leftover = gold + LOAN_PRINCIPAL - cost;
      const income = goldIncomeBetween(state, playerId, state.round, state.round + LOAN_TERM_ROUNDS);
      if (!affordable || leftover + income < LOAN_REPAY + 3) {
        return { score: 5, policy: "wog-era.loan-unsafe" };
      }
      return { score: 610, policy: "wog-era.loan-for-gold-ladder" };
    }
    case "REPAY_LOAN": {
      const loan = player.loan;
      if (!loan) {
        return { score: 5, policy: "wog-era.no-loan" };
      }
      // Last round of the term: always settle (a default costs a building).
      if (state.round >= loan.dueRound) {
        return { score: 1_000, policy: "wog-era.repay-due" };
      }
      return surplusGold(state, playerId) - loan.repay >= 0
        ? { score: 560, policy: "wog-era.repay-from-surplus" }
        : { score: 5, policy: "wog-era.repay-later" };
    }
    case "MITHRIL_FORGE_MINE": {
      // A one-shot doubled payout. Save for a war machine first when one is
      // still unforged and the forge would dip below its price.
      const mithril = player.mithril ?? 0;
      if (
        upgradeableWarMachinesIgnoringCost(state, playerId) &&
        mithril - MITHRIL_FORGE_MINE_COST < MITHRIL_WAR_MACHINE_COST
      ) {
        return { score: 5, policy: "wog-era.save-mithril-for-machine" };
      }
      const field = state.adventure?.fields[action.fieldId];
      const nudge = field?.resource === "gold" ? 30 : field?.resource === "valuables" ? 20 : 10;
      return { score: 600 + nudge + (field?.amount ?? 0) * 4, policy: "wog-era.forge-mine" };
    }
    case "MITHRIL_UPGRADE_WAR_MACHINE": {
      if (!MITHRIL_WAR_MACHINES[action.cardId]) {
        return { score: 5, policy: "wog-era.unknown-machine" };
      }
      // A machine already in play pays off every fight; one in hand later.
      const inPlay = (player.permanents ?? []).includes(action.cardId) || player.permanent === action.cardId;
      return { score: inPlay ? 620 : 540, policy: "wog-era.forge-war-machine" };
    }
    case "FORGE_SKILL_COMBO": {
      // Free power for one deck slot, once per game: take it as soon as it is
      // offered; prefer the combos this engine values most in combat.
      const combo = SKILL_COMBOS.find((candidate) => candidate.id === action.comboId);
      const value = combo ? cardKeepValue(combo.cardId, observation) : 0;
      return { score: 700 + Math.min(40, Math.max(0, value)), policy: "wog-era.forge-combo" };
    }
    default:
      return null;
  }
}

/**
 * Karmic Battle pick (CHOOSE_OPTION "karmic-battle"): the empowered guard (1)
 * is taken ONLY on a near-certain, near-lossless forecast at difficulty ≤ V,
 * so the AI never gambles its army for the bonus; otherwise the printed fight.
 */
export function karmicBattleEmpowerWorthIt(
  state: GameState,
  playerId: PlayerId,
  heroId: string,
  fieldId: string,
  difficulty: number
): boolean {
  const hero = state.heroes[heroId];
  const field = state.adventure?.fields[fieldId];
  if (!hero || !field || hero.controllerId !== playerId || difficulty > 5) {
    return false;
  }
  const forecast = forecastGuardField(state, hero, field, Math.max(0, hero.movementPoints));
  return Boolean(forecast && forecast.winChance >= 0.97 && forecast.expectedOwnLosses <= 0.25);
}

/** Whether the seat owns a war machine it has not forged yet (cost ignored). */
function upgradeableWarMachinesIgnoringCost(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  // upgradeableWarMachines gates on the price; probe with the price granted.
  const probe = { ...state, players: { ...state.players, [playerId]: { ...player, mithril: MITHRIL_WAR_MACHINE_COST } } };
  return upgradeableWarMachines(probe as GameState, playerId).length > 0;
}
