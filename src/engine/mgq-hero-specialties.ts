import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { appendEvent } from "./events";
import { fightingHeroIdForPlayer } from "./heroes";
import { NEUTRAL_PLAYER_ID } from "./state";
import { noteUnitDamagedForTokens } from "./tokens";
import type { CombatUnitState, GameState, PlayerId } from "./state";

function fightingHeroDefId(state: GameState, playerId: PlayerId): string | null {
  const heroId = fightingHeroIdForPlayer(state, playerId);
  const hero = heroId ? state.heroes[heroId] : null;
  return hero?.kind === "main" ? (hero.heroDefId ?? state.players[playerId]?.heroDefId ?? null) : null;
}

/** Granberia VI is a separate first-attack charge, so it stacks with equipment. */
export function mgqGranberiaFirstAttackAvailable(
  state: GameState,
  attacker: CombatUnitState,
  isRetaliation: boolean
): boolean {
  return (
    !isRetaliation &&
    fightingHeroDefId(state, attacker.controllerId) === "granberia" &&
    !state.players[attacker.controllerId]?.combatStats.mgqGranberiaFirstAttackUsed
  );
}

/** Spend Granberia's independent charge when her first qualifying attack lands. */
export function markMgqGranberiaAttackResolved(
  state: GameState,
  attacker: CombatUnitState,
  isRetaliation: boolean
): void {
  if (!mgqGranberiaFirstAttackAvailable(state, attacker, isRetaliation)) {
    return;
  }
  const stats = state.players[attacker.controllerId]?.combatStats;
  if (stats) {
    stats.mgqGranberiaFirstAttackUsed = true;
  }
}

/** Ilias — Divine Wrath, resolved through the normal effect-damage path. */
export function applyMgqHeroCombatStart(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    return;
  }

  const playerId = combat.attackerPlayerId;
  if (fightingHeroDefId(state, playerId) !== "ilias") {
    return;
  }

  const targets = Object.values(combat.units).filter(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.damage < unit.maxHealth
  );
  for (const target of targets) {
    if (target.damage >= target.maxHealth) {
      continue;
    }
    target.damage += 1;
    noteUnitDamagedForTokens(state, target, 1);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "system" },
      target: { type: "unit", unitId: target.id },
      amount: 1,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, target);
  }
  finishCombatIfNeeded(state);
}
