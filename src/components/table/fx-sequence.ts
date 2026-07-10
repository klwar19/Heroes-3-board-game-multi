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
 * Schedule each combat-unit move against its OWN attacker's dice, for a snapshot
 * that may BATCH several units' activations.
 *
 * The neutral pump runs back-to-back guard activations into one snapshot when
 * the human has nothing to react with, so a Harpy that attacks AFTER another
 * guard shares that guard's dice/strikes in the same FX pass. Timing the moves
 * off the snapshot start (the old `lead + index*stagger` / global-timeline-end)
 * then flew the Harpy in before the earlier guard's dice were thrown, and flew
 * it home only after every later guard had also struck — the "very buggy"
 * neutral Harpy. Pinning each move to its own attacker's beats fixes both ends:
 *
 * - An APPROACH glide lands exactly as its attacker's first die is thrown:
 *   `dieThrowByAttacker - preDelayByAttacker` (the pre-die hold already folds in
 *   the glide + pause, so backing it out gives the glide's start), floored at
 *   `leadMs` so it never precedes a leading activation-spell cast.
 * - A fly-back leaves just after that attacker's LAST strike has fully played:
 *   `strikeEndByAttacker`.
 *
 * A move whose unit has no die in this snapshot — a player Harpy's fly-back
 * arrives a frame later, alone, after its return choice — falls back to the
 * staggered lead / the running `fallbackReturnAt` timeline end, matching the
 * single-activation behaviour exactly. Beats are milliseconds from the snapshot
 * start; `staggerMs` only separates same-class moves that share a fallback.
 */
export function planApproachMoveDelays(
  approachMoves: readonly { unitId: string }[],
  dieThrowByAttacker: ReadonlyMap<string, number>,
  preDelayByAttacker: ReadonlyMap<string, number>,
  leadMs: number,
  staggerMs: number
): number[] {
  return approachMoves.map((move, index) => {
    const dieThrow = dieThrowByAttacker.get(move.unitId);
    const preDelay = preDelayByAttacker.get(move.unitId);
    if (dieThrow !== undefined && preDelay !== undefined) {
      // Land the glide exactly as this unit's own first die is thrown.
      return Math.max(leadMs, dieThrow - preDelay);
    }
    // No die this snapshot (a plain reposition): stagger from the lead as before.
    return leadMs + index * staggerMs;
  });
}

/**
 * Decide which after-attack fly-back moves must be HELD on their strike cell
 * until the rest of the snapshot has played, rather than gliding home at their
 * cue time.
 *
 * A neutral Harpy's "Strike and Return" resolves move → attack → (enemy
 * Retaliation Attack) → fly-back. When the Retaliation lands in the SAME
 * snapshot as the fly-back, the engine has already moved the Harpy's card home,
 * so the board renders it on its origin while the fly-back still waits out the
 * retaliation. Without a hold the player sees the card teleport home, the
 * retaliation strike the empty origin, then the card glide home a SECOND time —
 * the "buggy" double fly-back. Holding parks a stand-in on the strike cell
 * (`from`) so the unit reads as standing there through the retaliation, then
 * glides home exactly once.
 *
 * A move is held only when it is a Harpy return AND its unit does NOT roll its
 * own attack this snapshot: a single-snapshot move → attack → return keeps the
 * card live for its OWN lunge (its fly-back already trails its own strike with
 * no separate teleport to hide), so it is never held. Returns a map of held
 * unit id → the strike cell it parks on (and flies back from).
 */
export function planHarpyReturnHolds<M extends { unitId: string; from: number }>(
  returnMoves: readonly M[],
  rollingAttackerIds: ReadonlySet<string>,
  isHarpyReturn: (unitId: string) => boolean
): Map<string, number> {
  const holds = new Map<string, number>();
  for (const move of returnMoves) {
    if (isHarpyReturn(move.unitId) && !rollingAttackerIds.has(move.unitId)) {
      holds.set(move.unitId, move.from);
    }
  }
  return holds;
}

export function planReturnMoveDelays(
  returnMoves: readonly { unitId: string }[],
  strikeEndByAttacker: ReadonlyMap<string, number>,
  fallbackReturnAt: number,
  staggerMs: number
): number[] {
  return returnMoves.map((move, index) => {
    // Leave just after this unit's OWN strike has played; a player Harpy's
    // fly-back (a later, separate snapshot) has no strike here, so it trails the
    // running timeline end exactly as before.
    const strikeEnd = strikeEndByAttacker.get(move.unitId);
    return (strikeEnd ?? fallbackReturnAt) + index * staggerMs;
  });
}

/**
 * Map each moving unit to the beat its card finishes gliding onto its
 * destination cell — the glide-start beat (`delays[i]`, from
 * planApproachMoveDelays) plus the glide duration (`combatMoveMs`).
 *
 * A battlefield-token burn sprung BY that move — a Fire Wall's flames and the
 * effect-damage "−N" it deals, a Land Mine's blast — must be held to this beat.
 * Otherwise the burn is queued on the running `timeline`, which is 0 at the
 * start of a plain move, so the flare + number + hurt cry fire a whole glide
 * BEFORE the card reaches the token and are gone by the time it arrives — the
 * "nothing happened" bug. This is the token-burn analogue of `impactByTarget`
 * (which pins an ATTACK's damage to its strike beat).
 *
 * Keyed by unit id; if a unit somehow has two moves this batch, the later
 * (latest) arrival wins. A `delays` entry may be undefined (defensive) and is
 * skipped.
 */
export function planMoveArrivalBeats(
  approachMoves: readonly { unitId: string }[],
  delays: readonly number[],
  combatMoveMs: number
): Map<string, number> {
  const arrivals = new Map<string, number>();
  approachMoves.forEach((move, index) => {
    const start = delays[index];
    if (start === undefined) {
      return;
    }
    const arrival = start + combatMoveMs;
    arrivals.set(move.unitId, Math.max(arrivals.get(move.unitId) ?? arrival, arrival));
  });
  return arrivals;
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
