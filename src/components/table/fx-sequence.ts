import type { GameEvent } from "@/engine";

/**
 * Pure presentation-ordering helper for the combat FX timeline.
 *
 * The engine logs a spell's outcome BEFORE the spell itself resolves: a damage
 * spell appends DAMAGE_ASSIGNED (and any UNIT_REMOVED) while it is still on the
 * resolution stack, then appends SPELL_CAST_RESOLVED once the stack pops. Played
 * back in log order the damage number and the dying unit would land before the
 * fireball even appears.
 *
 * This re-sequences each SPELL_CAST_RESOLVED to sit just AHEAD of the
 * damage / heal / removal run it produced, so the cue builder walks events in
 * the order the table should see them: spell sprite first, then its result.
 *
 * Attack damage is unaffected: it carries no SPELL_CAST_RESOLVED, so its
 * DAMAGE_ASSIGNED / UNIT_REMOVED keep their original order (and are pinned to
 * the strike beat by the caller regardless). Unit-ability damage already logs
 * the trigger before its damage, so it is likewise untouched.
 */

const RESULT_EVENT_TYPES = new Set<GameEvent["type"]>([
  "DAMAGE_ASSIGNED",
  "DAMAGE_HEALED",
  "UNIT_REMOVED"
]);

export function orderFxEventsForPresentation<T extends { type: GameEvent["type"] }>(events: T[]): T[] {
  const ordered: T[] = [];
  // Damage / heal / removal events buffered until we know whether they belong
  // to a spell still to resolve (flush after it) or to something else (flush in
  // place, ahead of the next non-result event).
  let pendingResults: T[] = [];

  for (const event of events) {
    if (RESULT_EVENT_TYPES.has(event.type)) {
      pendingResults.push(event);
      continue;
    }
    if (event.type === "SPELL_CAST_RESOLVED") {
      // The spell's own sprite/sound leads; its buffered outcome follows.
      ordered.push(event);
      ordered.push(...pendingResults);
      pendingResults = [];
      continue;
    }
    // Any other event flushes buffered results in their original position.
    if (pendingResults.length > 0) {
      ordered.push(...pendingResults);
      pendingResults = [];
    }
    ordered.push(event);
  }

  ordered.push(...pendingResults);
  return ordered;
}

/**
 * Split this snapshot's combat-unit moves into the ones that happen BEFORE a
 * unit's own attack (its approach to the target) and the ones that happen AFTER
 * it (a Harpy's "Strike and Return" fly-back, or a ranged unit's step after
 * shooting).
 *
 * A neutral guard resolves move → attack → return in a single action, so all
 * three events land in one snapshot. Played back in raw log order the return
 * move would animate first — the Harpy teleports home before the dice even roll
 * — which is the bug this fixes. By detecting that a move sits AFTER the same
 * unit's `ATTACK_ROLLED` in the event log, the caller can pin the fly-back to
 * after the strike so the table reads "move in → dice → attack/sfx → fly back".
 *
 * `eventLog` must be in log order. A move is "after-attack" when this unit
 * (`unitId`) has an `ATTACK_ROLLED` (as `attackerId`) earlier in the log.
 */
export function partitionCombatMoves<M extends { id: string; unitId: string }>(
  eventLog: readonly { id: string; type: GameEvent["type"]; attackerId?: string }[],
  moves: M[]
): { approach: M[]; afterAttack: M[] } {
  const positionById = new Map<string, number>();
  eventLog.forEach((event, index) => positionById.set(event.id, index));

  const firstAttackIndexByUnit = new Map<string, number>();
  eventLog.forEach((event, index) => {
    if (event.type === "ATTACK_ROLLED" && event.attackerId !== undefined) {
      if (!firstAttackIndexByUnit.has(event.attackerId)) {
        firstAttackIndexByUnit.set(event.attackerId, index);
      }
    }
  });

  const approach: M[] = [];
  const afterAttack: M[] = [];
  for (const move of moves) {
    const movePosition = positionById.get(move.id);
    const attackPosition = firstAttackIndexByUnit.get(move.unitId);
    if (movePosition !== undefined && attackPosition !== undefined && attackPosition < movePosition) {
      afterAttack.push(move);
    } else {
      approach.push(move);
    }
  }
  return { approach, afterAttack };
}
