import type { CombatState, GameState } from "../state";
import { baseCardId } from "../phantom-cards";
import { coreUnitDefinitions } from "@/data/factions/units";
import { estimatedStrikeDamage } from "./strike-value";
import { forecastNeutralFight } from "./fight-forecast";
import { unitImmuneToSpellSchools } from "../unit-abilities";
import {
  hasThreatAbility,
  unitRemainingHealth,
  unitRemovalHealth,
} from "./score";

/**
 * USER RULING 2026-09-26 (replaces the 2026-09-15 "two Defense-2 guards →
 * always retreat" rule): TRY the fight when the AI can win it — Magic Arrow the
 * armored guards — and retreat only when it cannot, then come back later (the
 * guards are redrawn). The call is the bounded `forecastNeutralFight` on the
 * revealed board. A pristine board (nothing has acted or been hurt yet) must
 * clear the TRY bar; once the fight is under way it continues while the live
 * forecast stays above the lower KEEP bar, so one unlucky die does not turn a
 * committed fight into a retreat, but a collapsing one still cuts its losses at
 * the next continue window. Two+ armored guards need the higher ARMORED bar:
 * replays of armored parties (2 Gorgons / 2 Dendroids / 3 Elementals on Hard)
 * showed the forecast running 0.2-0.4 optimistic there, while ordinary parties
 * at 0.3+ were won or cut short without a single lost battle.
 */
export const FORECAST_TRY_MIN_WIN = 0.4;
export const FORECAST_ARMORED_TRY_MIN_WIN = 0.6;
export const FORECAST_KEEP_MIN_WIN = 0.2;

function combatUnderWay(combat: CombatState): boolean {
  return (combat.round ?? 1) > 1 ||
    Object.values(combat.units).some(unit => unit.activatedThisRound || unit.damage > 0);
}

function forecastCommitment(
  state: GameState,
  playerId: string,
  combat: CombatState,
  armored: boolean,
): "retreat" | "fight" | null {
  const forecast = forecastNeutralFight(state, playerId, combat);
  if (!forecast) return null;
  const bar = combatUnderWay(combat) ? FORECAST_KEEP_MIN_WIN
    : armored ? FORECAST_ARMORED_TRY_MIN_WIN : FORECAST_TRY_MIN_WIN;
  return forecast.winChance >= bar ? "fight" : "retreat";
}

/** Opening guard decision from revealed creatures, before spending cards. */
export function openingGuardCommitment(state: GameState, playerId: string, combat: CombatState): "retreat" | "fight" | null {
  if (combat.context.kind !== "neutral" || combat.context.bankId || combat.attackerPlayerId !== playerId ||
      state.heroes[combat.context.heroId]?.kind !== "main") return null;
  const guards = Object.values(combat.units).filter(u => u.controllerId !== playerId && unitRemainingHealth(u) > 0);
  if (!guards.length) return null;
  const own = Object.values(combat.units).filter(u => u.controllerId === playerId && unitRemainingHealth(u) > 0);
  // A Gold/Minotaur body keeps the old exemption from the armored-guard read.
  // Temporary Attack buffs or a commander must not count as that body.
  const hasStrongBody = own.some(u => u.grade === "gold" || u.grade === "azure" ||
    u.unitDefId === "dungeon.minotaurs");
  const armored = !hasStrongBody && guards.filter(u => u.defense >= 2).length >= 2;
  const army = state.players[playerId]?.army ?? [];
  const bronzeOnly = !army.some(u => ["silver", "gold", "azure"].includes(coreUnitDefinitions[u.unitDefId]?.tier));
  // Two+ armored guards (any army without a strong body) and every bronze-only
  // army decide by the forecast. Without a forecast (e.g. a Stack Token on the
  // board) the previous rules stand unchanged.
  if (armored || bronzeOnly) {
    // A scout stays a scout: retreat is only legal at the round's end, so
    // round 1 still has to be played after the pristine "retreat" read — the
    // first activation must not re-read that board as a fight under way.
    if (state.computerMemory?.[playerId]?.scoutedWithdrawalCombatId === combat.id) return "retreat";
    const decided = forecastCommitment(state, playerId, combat, armored);
    if (decided) return decided;
  }
  if (armored) return "retreat";
  if (!bronzeOnly) return null;
  const packs = army.filter(u => u.side === "pack" && coreUnitDefinitions[u.unitDefId]?.tier === "bronze").length;
  // Army cards preserve the entry core while combat units take wounds/flips.
  return packs >= 3 && guards.length <= 3 ? "fight" : null;
}

/** Public revealed guards only. Bronze armies cannot trade into repeated
 * armored hits just because its undamaged cards have a decent stat sum. */
export function bronzeArmyNeedsWithdrawal(
  state: GameState,
  playerId: string,
  combat: CombatState,
): boolean {
  if (
    !state.players[playerId] ||
    combat.context.kind !== "neutral" ||
    combat.attackerPlayerId !== playerId ||
    combat.context.bankId ||
    state.heroes[combat.context.heroId]?.kind !== "main"
  )
    return false;
  const commitment = openingGuardCommitment(state, playerId, combat);
  if (commitment) return commitment === "retreat";
  if (state.computerMemory?.[playerId]?.withdrawalCombatId === combat.id)
    return true;
  const own = Object.values(combat.units).filter(
    (u) => u.controllerId === playerId && unitRemainingHealth(u) > 0,
  );
  const guards = Object.values(combat.units).filter(
    (u) => u.controllerId !== playerId && unitRemainingHealth(u) > 0,
  );
  if (
    !own.length ||
    !guards.length ||
    own.some(
      (u) => u.grade === "gold" || u.grade === "azure" || u.grade === "silver",
    )
  )
    return false;
  const damage = Math.min(
    ...guards.map((g) =>
      own.reduce((sum, u) => sum + estimatedStrikeDamage(u, g), 0),
    ),
  );
  const incoming = guards.reduce(
    (sum, g) =>
      sum +
      Math.max(
        0,
        ...own.map((u) =>
          g.abilities.includes("elemental-damage")
            ? g.attack
            : estimatedStrikeDamage(g, u),
        ),
      ),
    0,
  );
  const ownHealth = own.reduce((sum, u) => sum + unitRemovalHealth(u), 0);
  if (
    guards.filter((g) => g.abilities.includes("elemental-damage")).length >=
      2 &&
    incoming > damage
  )
    return true;
  const casualty = Object.values(combat.units).some(
    (u) => u.controllerId === playerId && unitRemainingHealth(u) <= 0,
  );
  if (casualty && guards.some((g) => hasThreatAbility(g)) && own.length <= 2)
    return true;
  // Damage-dealing spells are an actual way through armor. Do not credit a
  // spent spell or an Arrow against a wholly Arrow-immune elemental army.
  const arrow =
    state.players[playerId].hand.some((id) => baseCardId(id) === "spell.magic_arrow") &&
    guards.some((g) => !unitImmuneToSpellSchools(g, ["any"]));
  const spellDamage = arrow ? 3 : 0;
  const roundsToWin =
    guards.reduce(
      (sum, g) =>
        sum +
        unitRemovalHealth(g) /
          Math.max(
            0.5,
            own.reduce((total, u) => total + estimatedStrikeDamage(u, g), 0),
          ),
      0,
    ) -
    spellDamage / Math.max(1, damage);
  const roundsToLose = ownHealth / Math.max(1, incoming);
  return (
    guards.length >= 2 && roundsToWin > roundsToLose * 1.4 && damage < incoming
  );
}
