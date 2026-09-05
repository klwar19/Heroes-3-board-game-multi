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

/**
 * USER RULE (2026-09-05) — "Death Stare must happen BEFORE the retaliation."
 *
 * An ability that throws its own dice AFTER a blow (a Gorgon's Death Stare,
 * the Thunderbird extra die) resolves in the engine before the parked
 * Retaliation Attack, but the client built its overlay queue in TWO passes:
 * every ATTACK_ROLLED cue of the snapshot first, then the ability/spell dice
 * appended behind them. In a batch carrying the whole exchange (primary die →
 * stare dice → retaliation die) the table therefore SHOWED the retaliation
 * roll before the stare that could have cancelled it.
 *
 * This splices freshly built cues into the pending queue at the position their
 * SOURCE EVENT holds, using `order` (cue id → index in the event log). A cue
 * with no entry in `order` is appended, so every cue class the page still
 * queues blind (spell rolls, leftovers from an earlier snapshot) keeps its
 * previous placement.
 */
export function mergeDiceCuesInEventOrder(
  queue: readonly DiceCue[],
  incoming: readonly DiceCue[],
  order: ReadonlyMap<string, number>
): DiceCue[] {
  const merged = [...queue];
  for (const cue of incoming) {
    const position = order.get(cue.id);
    if (position === undefined) {
      merged.push(cue);
      continue;
    }
    const index = merged.findIndex((queued) => {
      const queuedPosition = order.get(queued.id);
      return queuedPosition !== undefined && queuedPosition > position;
    });
    if (index < 0) {
      merged.push(cue);
    } else {
      merged.splice(index, 0, cue);
    }
  }
  return merged;
}
