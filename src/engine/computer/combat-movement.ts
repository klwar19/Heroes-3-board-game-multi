import {
  fieldCreatureBankId, heroMovementMax, isBankStyleGuardLocation, isFieldGuarded,
  isTeleportObjectGuardLocation, neutralBattleLevel, neutralArmyDifficultyForField,
} from "../adventure";
import { HEX_DEFAULT_FREE_COMBAT_ROUNDS } from "../hex-battlefield";
import { houseRuleEnabled } from "../house-rules";
import { isGrailUtopiaModeField } from "../map-design-features";
import { polishQuickCombatEnabled, polishQuickCombatOutcome } from "../polish-quick-combat";
import type { GameState, HeroState, MapFieldState } from "../state";
import { coreUnitDefinitions } from "@/data/factions/units";

export type ArmyTopTier = "bronze" | "silver" | "gold" | "goldPack";

/** The strongest body class in the seat's own army (bank cards excluded). */
export function armyTopTier(state: GameState, playerId: string): ArmyTopTier {
  let top: ArmyTopTier = "bronze";
  for (const unit of state.players[playerId]?.army ?? []) {
    if (unit.side === "bank") continue;
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    if (tier === "gold" || tier === "azure") {
      if (unit.side === "pack") return "goldPack";
      top = "gold";
    } else if (tier === "silver" && top === "bronze") {
      top = "silver";
    }
  }
  return top;
}

/**
 * USER RULING (2026-09-17): the highest neutral guard level a seat may open
 * with TWO movement points (entry + one paid continuation), by scenario
 * neutral difficulty and the army's strongest body. Above the cap the fight
 * wants a fresh three-point turn (entry + two continuations). Fixed points
 * from the ruling: Hard lv3 on a bronze core; Impossible lv3 with a Silver,
 * lv4 with a Gold Few, lv5 with a Gold Pack. Easier scenarios add one level,
 * Normal follows Hard (its guards still take the printed rounds to grind).
 */
export const TWO_MOVE_GUARD_CAP: Readonly<Record<string, Readonly<Record<ArmyTopTier, number>>>> = {
  easy: { bronze: 4, silver: 5, gold: 6, goldPack: 6 },
  normal: { bronze: 3, silver: 4, gold: 5, goldPack: 6 },
  hard: { bronze: 3, silver: 4, gold: 5, goldPack: 6 },
  impossible: { bronze: 2, silver: 3, gold: 4, goldPack: 5 },
};

/** The level cap for a two-point attack turn on this field's neutral difficulty. */
export function twoMoveGuardCap(state: GameState, playerId: string, field: MapFieldState): number {
  const row = TWO_MOVE_GUARD_CAP[neutralArmyDifficultyForField(state, field)] ?? TWO_MOVE_GUARD_CAP.normal;
  return row[armyTopTier(state, playerId)];
}

/** Entry budget only; dice/cards can still require additional continuations. */
export function premiumCombatMovementReserve(state: GameState, hero: HeroState, field: MapFieldState): number {
  if (!isFieldGuarded(field) || houseRuleEnabled(state, "free-neutral-combat-extend") ||
      field.combatRoundLimit === "unlimited") return 0;
  const bankId = fieldCreatureBankId(field);
  if (!bankId && isGrailUtopiaModeField(state, field)) return 0;
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
  // A guard above the two-point cap for this scenario difficulty and army
  // (TWO_MOVE_GUARD_CAP) needs a full three-point attack turn: one for entry
  // and two paid continuations. At or below the cap one continuation is kept,
  // so a short approach can still lead to an attack that same turn.
  const gridReserve = (field.difficulty ?? 0) > twoMoveGuardCap(state, hero.controllerId, field) ? 2 : 1;
  // Hex battlefield: the default Round limit counts after HEX_DEFAULT_FREE_
  // COMBAT_ROUNDS rounds (rounds 1-2 free, ruling 2026-09-26) — one free round
  // more than the grid — but the armies spend about one round closing the 10
  // hexes between them, so the fight still needs the grid's paid
  // continuations. The reserve only shrinks for free rounds beyond that
  // approach round. A designer's numeric limit keeps its own count.
  const hexExtraFreeRounds = Math.max(0, HEX_DEFAULT_FREE_COMBAT_ROUNDS - 2);
  const reserve = houseRuleEnabled(state, "hex-battlefield") && !designerPaidRounds
    ? Math.max(0, gridReserve - hexExtraFreeRounds)
    : gridReserve;
  // ALWAYS capped by a refreshed turn's actual capacity after paying entry: a
  // Secondary Hero (2 MP) or a main hero under the -1 Astrologers movement
  // event can never reach 1 + 2, so an uncapped reserve made every entry score
  // "save the continuation" forever — the hero could never open that fight.
  return Math.min(reserve, Math.max(0, heroMovementMax(state, hero) - 1));
}
