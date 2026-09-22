import {
  battlefieldConditionForDice,
  formatBattlefieldConditionDie,
  getBattlefieldCondition,
  type BattlefieldConditionDie,
  type BattlefieldConditionId,
} from "@/data/battlefield-conditions";
import { ATTACK_DIE_FACES } from "./battlefield";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { appendEvent } from "./events";
import { houseRuleEnabled } from "./house-rules";
import { createSeededRandom } from "./random";
import type { CombatState, GameState } from "./state";

/**
 * One authoritative ordered pair per combat, on its own random stream. This
 * never spends attack rolls or reads a client's clock. Stored results survive
 * saves, parallel combat switches and agreed activation retakes.
 * `preset` is the explicit extension point for future map-authored conditions.
 */
export function initializeBattlefieldCondition(
  state: GameState,
  combat: CombatState,
  preset?: BattlefieldConditionId,
): void {
  if (combat.battlefieldCondition || (!preset && !houseRuleEnabled(state, "battlefield-conditions") && !state.sandboxRules?.battlefieldConditions)) return;
  const random = createSeededRandom(`${combat.dice.seed}#${combat.id}#battlefield-condition`);
  const dice: [BattlefieldConditionDie, BattlefieldConditionDie] = preset
    ? [...getBattlefieldCondition(preset).dice]
    : [random.pick(ATTACK_DIE_FACES) as BattlefieldConditionDie, random.pick(ATTACK_DIE_FACES) as BattlefieldConditionDie];
  const definition = preset ? getBattlefieldCondition(preset) : battlefieldConditionForDice(dice);
  combat.battlefieldCondition = { id: definition.id, dice, source: preset ? "preset" : "dice" };
  appendEvent(state, {
    type: "EVENT_NOTE",
    message: `Battlefield Conditions: ${dice.map(formatBattlefieldConditionDie).join(" / ")} — ${definition.name}. ${definition.summary}`,
  });
}

/** Start-only tokens apply to the deployed army once, before any unit acts. */
export function applyBattlefieldConditionAtCombatStart(state: GameState): void {
  const combat = state.combat;
  const condition = combat?.battlefieldCondition;
  if (!combat || !condition || condition.applied) return;
  condition.applied = true;
  const living = Object.values(combat.units).filter(unit => unit.damage < unit.maxHealth);
  if (condition.id === "rocky-terrain") {
    for (const unit of living) {
      if (unit.type === "ground") unit.defenseToken = true;
    }
  } else if (condition.id === "scorching-earth") {
    const targets = living.filter(unit => !unit.bankUnit && !unit.commanderSlug && !unit.heroUnit && (unit.grade === "silver" || unit.grade === "gold"));
    // A starting damage TOKEN is not an attack/spell hit. Do not consume hit
    // shields or damage-reduction charges through DAMAGE_ASSIGNED listeners.
    for (const unit of targets) {
      // A previous casualty's removal effect may already have removed this
      // body; never resolve that removal a second time.
      if (unit.damage >= unit.maxHealth) continue;
      unit.damage += 1;
      markUnitRemovedIfNeeded(state, unit);
    }
    finishCombatIfNeeded(state);
  }
}
