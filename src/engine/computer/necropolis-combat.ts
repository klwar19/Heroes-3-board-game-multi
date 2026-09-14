import type { CombatState, GameState } from "../state";
import { estimatedStrikeDamage } from "./strike-value";
import { unitImmuneToSpellSchools } from "../unit-abilities";
import {
  hasThreatAbility,
  unitRemainingHealth,
  unitRemovalHealth,
} from "./score";

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
    state.players[playerId].hand.includes("spell.magic_arrow") &&
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
