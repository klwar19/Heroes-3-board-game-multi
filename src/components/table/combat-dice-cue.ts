import { unitAbilities } from "@/data/units/abilities";
import type { GameEvent, GameState } from "@/engine";
import type { DiceCue } from "./overlays";
import { unitName } from "./utils";

/** Find the declaration paired with a resolved roll, even across reaction snapshots. */
export function attackDeclarationForRoll(
  log: GameState["eventLog"],
  attackerId: string,
  defenderId: string,
  isRetaliation: boolean,
  rollEventId?: string
): Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> | undefined {
  const rollIndex = rollEventId ? log.findIndex((event) => event.id === rollEventId) : -1;
  // A batch can contain two attacks by the same unit against the same target.
  // Start immediately before THIS roll so the first die never inherits the
  // later follow-up's declaration merely because both arrived together.
  for (let index = rollIndex >= 0 ? rollIndex - 1 : log.length - 1; index >= 0; index -= 1) {
    const event = log[index];
    if (
      event.type === "UNIT_ATTACK_DECLARED" &&
      event.attackerId === attackerId &&
      event.defenderId === defenderId &&
      event.isRetaliation === isRetaliation
    ) {
      return event;
    }
  }
  return undefined;
}

/** Translate every resolved attack—including printed follow-ups—into its visible dice beat. */
export function makeCombatDiceCue(
  state: GameState,
  event: Extract<GameEvent, { type: "ATTACK_ROLLED" }>,
  preDelayMs = 0
): DiceCue {
  const declaration = attackDeclarationForRoll(
    state.eventLog,
    event.attackerId,
    event.defenderId,
    event.isRetaliation,
    event.id
  );
  const abilityAttack = declaration?.abilityAttack;
  return {
    id: event.id,
    rolls: event.rolls,
    roll: event.roll,
    dieMultiplier: event.dieMultiplier ?? 1,
    rollMode: event.rollMode,
    attackerName: unitName(state, event.attackerId),
    defenderName: unitName(state, event.defenderId),
    attackValue: event.attackValue,
    defenseValue: event.defenseValue,
    attackBonus: event.attackBonus,
    defenseBonus: event.defenseBonus,
    damage: event.damage,
    isRetaliation: event.isRetaliation,
    ...(abilityAttack
      ? {
          abilityAttack: {
            name: unitAbilities[abilityAttack.abilityId]?.name ?? "Ability attack",
            baseAttack: abilityAttack.baseAttack
          }
        }
      : {}),
    ...(event.sumAllDice ? { sumAllDice: true } : {}),
    ...(event.defendRoll !== undefined ? { defendRoll: event.defendRoll } : {}),
    ...(event.mightRolls?.length ? { mightRolls: event.mightRolls } : {}),
    ...(event.rollModifiers?.length ? { modifiers: event.rollModifiers } : {}),
    ...(event.rerollBeats?.length ? { rerollBeats: event.rerollBeats } : {}),
    ...(preDelayMs > 0 ? { preDelayMs } : {})
  };
}
