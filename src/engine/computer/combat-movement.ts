import {
  fieldCreatureBankId, heroMovementMax, isBankStyleGuardLocation, isFieldGuarded,
  isTeleportObjectGuardLocation, neutralBattleLevel, neutralArmyDifficultyForField,
} from "../adventure";
import { houseRuleEnabled } from "../house-rules";
import { polishQuickCombatEnabled, polishQuickCombatOutcome } from "../polish-quick-combat";
import type { GameState, HeroState, MapFieldState } from "../state";
import { isOpeningFarMaterialMine } from "./far-sweep";

/** Entry budget only; dice/cards can still require additional continuations. */
export function premiumCombatMovementReserve(state: GameState, hero: HeroState, field: MapFieldState): number {
  if (!isFieldGuarded(field) || houseRuleEnabled(state, "free-neutral-combat-extend") ||
      field.combatRoundLimit === "unlimited") return 0;
  const bankId = fieldCreatureBankId(field);
  const designerPaidRounds = typeof field.combatRoundLimit === "number";
  if (!designerPaidRounds && (
      (bankId && !houseRuleEnabled(state, "bank-move-points")) ||
      field.location === "dragon_utopia" || isBankStyleGuardLocation(field.location) ||
      isTeleportObjectGuardLocation(field.location) || field.location === "random_town" ||
      field.unlimitedCombatRounds || (field.difficulty ?? 0) >= 7)) return 0;
  if (!bankId && !designerPaidRounds && !field.customGuardUnits?.length) {
    const difficulty = field.difficulty ?? 1;
    const quickWin = polishQuickCombatEnabled(state)
      ? polishQuickCombatOutcome(state, hero, difficulty) === "mandatory"
      : neutralBattleLevel(state, hero) > difficulty;
    if (quickWin) return 0;
  }
  // Impossible economy guards need a full three-point attack turn: one for
  // entry and two paid continuations. Easier II–III guards keep one continuation
  // so a short approach can still lead to an earlier attack that same turn.
  const economyFight = field.location === "settlement" || field.location === "mine";
  const premium = field.location === "settlement" ||
    (hero.kind === "main" && isOpeningFarMaterialMine(state, hero.controllerId, field)) ||
    (field.location === "mine" && (field.resource === "gold" || field.resource === "valuables"));
  const impossibleEconomy = premium && (field.difficulty ?? 0) >= 2 &&
    neutralArmyDifficultyForField(state, field) === "impossible";
  const reserve = impossibleEconomy ? 2 : economyFight && (field.difficulty ?? 0) >= 4 ? 2 : 1;
  // ALWAYS capped by a refreshed turn's actual capacity after paying entry: a
  // Secondary Hero (2 MP) or a main hero under the -1 Astrologers movement
  // event can never reach 1 + 2, so an uncapped reserve made every entry score
  // "save the continuation" forever — the hero could never open that fight.
  return Math.min(reserve, Math.max(0, heroMovementMax(state, hero) - 1));
}
