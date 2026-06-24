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

/** One leading-activation-spell cast, with the beats the FX timeline pins to. */
export type ActivationSpellCast = {
  eventId: string;
  abilityId: string;
  unitId: string;
  targetUnitId: string;
  /** When this cast's projectile/sprite begins, measured from the snapshot start. */
  castStart: number;
  /** When its damage lands (the bolt's burst, end of the cast) — held to here. */
  damageAt: number;
};

/** Where every leading cast sits, and the total time the rest of the timeline shifts by. */
export type ActivationSpellPreamble = { leadMs: number; casts: ActivationSpellCast[] };

/**
 * Plan the "leading activation spell" preamble for a combat snapshot.
 *
 * A neutral Faerie Dragon resolves its activation Ice Bolt and THEN moves /
 * attacks in the SAME pump, so the cast, its damage and the unit's glide all
 * arrive in one snapshot — the cast logged first. Played back in raw log order
 * the move animates at t=0 while the cast waits behind the attack dice, so the
 * dragon glides before it ever casts. To read "cast → damage → move → attack"
 * the cast must lead and everything else trail it.
 *
 * Given the snapshot's unit-ability events (in log order), the set of ability
 * ids that are such leading casts, and how long each takes to present
 * (`castMs`) plus how long after that its damage is held back (`holdMs`), this
 * lays the casts out back-to-back from t=0 and returns each cast's start +
 * damage beat and the total `leadMs` the move + dice clock must shift by.
 * Non-leading abilities are ignored, so a snapshot with none returns
 * `{ leadMs: 0, casts: [] }` — i.e. no shift, the path every ordinary combat
 * takes.
 */
export function planActivationSpellPreamble<
  E extends { id: string; type: GameEvent["type"]; abilityId?: string; unitId?: string; targetUnitId?: string }
>(
  events: readonly E[],
  leadingAbilityIds: ReadonlySet<string>,
  timingFor: (abilityId: string) => { castMs: number; holdMs: number }
): ActivationSpellPreamble {
  let clock = 0;
  const casts: ActivationSpellCast[] = [];
  for (const event of events) {
    if (
      event.type !== "UNIT_ABILITY_TRIGGERED" ||
      event.abilityId === undefined ||
      !leadingAbilityIds.has(event.abilityId)
    ) {
      continue;
    }
    const { castMs, holdMs } = timingFor(event.abilityId);
    const castStart = clock;
    casts.push({
      eventId: event.id,
      abilityId: event.abilityId,
      unitId: event.unitId ?? "",
      targetUnitId: event.targetUnitId ?? event.unitId ?? "",
      castStart,
      damageAt: castStart + castMs
    });
    clock += castMs + holdMs;
  }
  return { leadMs: clock, casts };
}

/**
 * Per-attacker pre-die delay for attackers that slid into range THIS snapshot.
 *
 * A unit that flies/walks into range and then attacks in the same snapshot logs
 * its approach move, its declaration and its roll together. If the die were
 * thrown at t=0 it would tumble (and the strike would land) while the card is
 * still gliding across the board — the Harpy "rolls mid-flight". So any attacker
 * with a fresh approach move must let its glide finish (`glideMs`) before its
 * first die. A neutral guard adds a dramatic pre-attack pause (`neutralPauseMs`)
 * on top so the table watches it arrive and steady before the cube is cast.
 *
 * The returned map is attacker-unit-id → milliseconds to hold the first die. An
 * attacker that did not move this snapshot (already adjacent) is absent — no
 * hold. This used to be applied to NEUTRAL movers only, which left a player's
 * Harpy rolling mid-glide; it now covers every controller. The neutral case is
 * unchanged (`glideMs + neutralPauseMs`), so only player/ally movers are fixed.
 */
export function planApproachAttackPreDelays(
  approachMoves: readonly { unitId: string; neutral: boolean }[],
  rolls: readonly { attackerId: string }[],
  glideMs: number,
  neutralPauseMs: number
): Map<string, number> {
  const attackerIds = new Set(rolls.map((roll) => roll.attackerId));
  const delays = new Map<string, number>();
  for (const move of approachMoves) {
    // Only an approach that belongs to a unit actually rolling this snapshot
    // gates a die; one per attacker (its first die carries the whole hold).
    if (!attackerIds.has(move.unitId) || delays.has(move.unitId)) {
      continue;
    }
    delays.set(move.unitId, glideMs + (move.neutral ? neutralPauseMs : 0));
  }
  return delays;
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
