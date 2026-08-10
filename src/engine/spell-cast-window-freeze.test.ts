import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, NEUTRAL_PLAYER_ID } from "./index";
import { getLegalReactionsForTrigger, reactionOfferOpensWindow } from "./legal-actions";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, UnitId } from "./state";

/**
 * REPORTED (game-breaking): "I buffed lightning bolt with 2 spells then returned
 * it to my hand with empowered knowledge. then i cast lightning bolt again, it
 * discarded without dealing dmg. when [the] enemy who was supposed to be dead …
 * turn's started, nothing happened. it failed to chose target for an attack.
 * couldnt progress to the next game state and had to abandon the run."
 *
 * ROOT CAUSE — two gates that had to agree, and did not. `performSpellCast`
 * decided "does anybody react?" with `reactionPlayerOrder(...) === 0` and then
 * called `openReactionWindowForTrigger` IGNORING its return value.
 * `openReactionWindowForTrigger` applies a SECOND gate: an offer only opens a
 * window when it passes `reactionOfferOpensWindow`, which is false — outside an
 * attack window — for the bare positive-Morale token draw/redraw spends and for
 * every `drawOnly` / `utilityOnly` / `windowJoinOnly` instant (they may JOIN a
 * window, never open one). A caster whose only offer was join-only therefore
 * hit BOTH "there is a reactor, do not resolve yet" AND "nothing opens a
 * window", and the cast was stranded on the stack with `status: "pending"`:
 *
 *   - the Spell had already been moved hand → discard (before the stack push),
 *     so it was SPENT and dealt nothing — "it discarded without dealing dmg";
 *   - the parked stack item then blocked every unit activation for the rest of
 *     the fight — "nothing happened … couldnt progress to the next game state".
 *
 * Holding a positive Morale token is the everyday trigger. Empowered Knowledge
 * is what makes a SECOND cast legal in one combat round (`basicSpellLimitBonus`),
 * which is why the reporter met it on the recast: by then the window-opening
 * cards (the Power discards, the Knowledge itself) were spent and only the
 * Morale token was left.
 *
 * THE FIX: `performSpellCast` branches on `openReactionWindowForTrigger`'s own
 * return value, exactly like every other window-opening call site
 * (openDeclaredAttackWindow, resumeAttackWindowAfterRedirect, the die-settled
 * and lethal-save probes). No window ⇒ resolve now.
 *
 * Every case below asserts the OBSERVABLE outcome (damage dealt, the fight
 * still playable) rather than the stack bookkeeping alone.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Opens the level-I guarded-mine fight with one player unit placed at B1. */
function neutralFight(seed = "cast-window-freeze"): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  state = apply(state, {
    type: "PLACE_COMBAT_UNIT",
    playerId: "p1",
    armyUnitId: state.players.p1.army[0].id,
    position: 13
  });
  // The player unit acts first, so the cast happens on its activation and the
  // guard's activation is the next thing the pump owes.
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
      unit.initiative = 99;
    }
  }
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  return state;
}

function guardOf(state: GameState): CombatUnitState {
  return Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
}

/** Reshapes the drawn guard into the reported Wolf Raiders, fat enough to survive. */
function makeWolfRaiders(state: GameState): UnitId {
  const guard = guardOf(state);
  guard.name = "Wolf Raiders";
  guard.cardName = "Wolf Raiders";
  guard.abilities = ["wolf-raiders-strike-twice"];
  guard.type = "ground";
  guard.grade = "bronze";
  guard.attack = 2;
  guard.defense = 0;
  guard.maxHealth = 30;
  guard.initiative = 1;
  guard.position = 1;
  return guard.id;
}

function castBolt(state: GameState, targetId: UnitId): GameState {
  return apply(state, {
    type: "CAST_SPELL",
    playerId: "p1",
    cardId: "spell.lightning_bolt",
    target: { type: "unit", unitId: targetId }
  });
}

function reactionOffer(
  state: GameState,
  cardId: string,
  extra?: (action: Extract<GameAction, { type: "PLAY_REACTION" }>) => boolean
) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId && (!extra || extra(legal.action))
  );
}

function settleWindows(state: GameState): GameState {
  let current = state;
  for (let guard = 0; current.reactionWindow && guard < 40; guard += 1) {
    current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function anyoneCanAct(state: GameState): boolean {
  return ["p1", "p2", NEUTRAL_PLAYER_ID].some((seat) => getLegalActions(state, seat as PlayerId).length > 0);
}

/** The cast trigger the engine is about to raise, built by hand for a pre-cast probe. */
function castTriggerProbe(targetId: UnitId): GameEvent {
  return {
    id: "cast-probe",
    type: "SPELL_CAST_STARTED",
    playerId: "p1",
    spellCardId: "spell.lightning_bolt",
    target: { type: "unit", unitId: targetId },
    power: 0
  } as GameEvent;
}

/**
 * The reactions the caster would be offered AT the cast trigger — probed on a
 * clone with the Spell already moved hand → discard, which is what
 * `performSpellCast` does before it raises SPELL_CAST_STARTED. Probing with the
 * Spell still in hand would wrongly count its own "+1 Power discard" offer.
 */
function offersAtCastMoment(state: GameState, targetId: UnitId) {
  const clone = structuredClone(state) as GameState;
  const hand = clone.players.p1.hand;
  const index = hand.indexOf("spell.lightning_bolt");
  if (index !== -1) {
    hand.splice(index, 1);
    clone.players.p1.discard.push("spell.lightning_bolt");
  }
  const trigger = castTriggerProbe(targetId);
  const offers = (getLegalReactionsForTrigger(clone, trigger).p1 ?? []).filter(
    (legal) => legal.action.type !== "PASS_REACTION"
  );
  return {
    offers,
    opensWindow: offers.some((legal) => reactionOfferOpensWindow(legal, trigger))
  };
}

describe("A cast whose only reactions are join-only still resolves (frozen-table repro)", () => {
  it("REPRO: bolt + 2 Power discards + Empowered Knowledge recall, then the recast lands and the guard still acts", () => {
    let state = neutralFight();
    const guardId = makeWolfRaiders(state);
    state.players.p1.hand = [
      "spell.lightning_bolt",
      "spell.haste",
      "spell.slow",
      "stat.knowledge.empowered"
    ];
    // The everyday join-only offer: a stored positive Morale token. Its draw /
    // discard-redraw spends are legal reactions that deliberately never OPEN a
    // window — exactly the divergence that stranded the cast.
    state.players.p1.morale = 1;

    // First cast, buffed with two Spell discards ("+1 Power" each).
    state = castBolt(state, guardId);
    for (const boostCard of ["spell.haste", "spell.slow"]) {
      const boost = reactionOffer(state, boostCard, (action) => Boolean(action.asPowerBoost));
      expect(boost, `+1 Power discard should be offered for ${boostCard}`).toBeTruthy();
      state = apply(state, boost!.action);
    }
    // Empowered Knowledge takes the Spell back AND raises the per-round limit,
    // which is what makes the second cast legal at all.
    const knowledge = reactionOffer(state, "stat.knowledge.empowered");
    expect(knowledge, "Empowered Knowledge should be offered on your own cast").toBeTruthy();
    state = settleWindows(apply(state, knowledge!.action));

    expect(state.players.p1.hand, "the recall returned the Spell").toContain("spell.lightning_bolt");
    const damageAfterFirst = state.combat!.units[guardId].damage;
    expect(damageAfterFirst, "the boosted bolt resolved at Power 2").toBe(4);

    // Everything that could open a window is spent; only the Morale token is
    // left. Before the fix this cast was stranded and the fight died here.
    expect(state.players.p1.hand, "only the recalled Spell remains").toEqual(["spell.lightning_bolt"]);
    const preCast = offersAtCastMoment(state, guardId);
    expect(
      preCast.offers.length,
      "the caster DOES hold a legal reaction (so the old probe said 'wait')"
    ).toBeGreaterThan(0);
    expect(preCast.opensWindow, "but not one of them opens a window — the exact divergence").toBe(false);

    state = settleWindows(castBolt(state, guardId));

    // OBSERVABLE: the recast really damaged the guard, and the Spell is spent.
    expect(state.combat!.units[guardId].damage, "the second bolt dealt its damage").toBe(damageAfterFirst + 2);
    expect(state.players.p1.discard).toContain("spell.lightning_bolt");
    expect(state.stack, "no stranded cast on the stack").toHaveLength(0);
    expect(state.phase).toBe("combat");
    expect(anyoneCanAct(state), "the table is not frozen").toBe(true);

    // …and the fight genuinely progresses: the player hands over, the guard's
    // activation comes up and it attacks (the reported "nothing happened").
    const defend = getLegalActions(state, "p1").find((legal) => legal.action.type === "DEFEND_UNIT");
    expect(defend, "the caster's unit can still act").toBeTruthy();
    state = apply(state, defend!.action);
    for (let guardStep = 0; guardStep < 12 && !state.combat?.outcome; guardStep += 1) {
      if (state.reactionWindow) {
        state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
        continue;
      }
      const step = getLegalActions(state, "p1").find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP");
      if (!step) break;
      state = apply(state, step.action);
    }
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === guardId),
      "the guard chose a target and attacked"
    ).toBe(true);
  });

  it("MINIMAL: a lone cast while holding only a positive Morale token resolves at once", () => {
    let state = neutralFight("cast-window-freeze-minimal");
    const guardId = makeWolfRaiders(state);
    state.players.p1.hand = ["spell.lightning_bolt"];
    state.players.p1.morale = 1;

    state = castBolt(state, guardId);

    expect(state.combat!.units[guardId].damage, "the bolt dealt its damage").toBe(2);
    expect(state.stack).toHaveLength(0);
    expect(state.reactionWindow).toBeNull();
    expect(state.phase).toBe("combat");
    expect(anyoneCanAct(state)).toBe(true);
  });

  it("CONTROL: a real window-opening reaction still PAUSES the cast (the fix is not 'always auto-resolve')", () => {
    let state = neutralFight("cast-window-freeze-control");
    const guardId = makeWolfRaiders(state);
    state.players.p1.hand = ["spell.lightning_bolt", "stat.power"];
    state.players.p1.morale = 1;

    state = castBolt(state, guardId);

    expect(state.reactionWindow, "Power is a real cast-window reaction — the window opens").toBeTruthy();
    expect(state.stack, "the cast is paused, not resolved").toHaveLength(1);
    expect(state.combat!.units[guardId].damage).toBe(0);

    // Passing still resolves it, at the un-boosted Power.
    state = settleWindows(state);
    expect(state.combat!.units[guardId].damage).toBe(2);
    expect(state.stack).toHaveLength(0);
  });

  it("CONTROL: with no reaction of any kind the cast resolves immediately, exactly as before", () => {
    let state = neutralFight("cast-window-freeze-empty");
    const guardId = makeWolfRaiders(state);
    state.players.p1.hand = ["spell.lightning_bolt"];
    state.players.p1.morale = 0;

    expect(offersAtCastMoment(state, guardId).offers, "nothing at all to react with").toEqual([]);

    state = castBolt(state, guardId);
    expect(state.combat!.units[guardId].damage).toBe(2);
    expect(state.stack).toHaveLength(0);
    expect(state.reactionWindow).toBeNull();
  });

  it("CLASS: every join-only-offer hand resolves its cast — the stack is never left parked", () => {
    // One hand per source of a non-window-opening offer outside an attack window:
    // the bare Morale token, and the drawOnly / utilityOnly instant joins added by
    // the instant-card-gain sweeps.
    const hands: { label: string; hand: string[]; morale: number }[] = [
      { label: "morale token only", hand: ["spell.lightning_bolt"], morale: 1 },
      { label: "morale + Offense", hand: ["spell.lightning_bolt", "ability.offense"], morale: 1 },
      { label: "morale + Armorer", hand: ["spell.lightning_bolt", "ability.armorer"], morale: 1 },
      { label: "Offense only", hand: ["spell.lightning_bolt", "ability.offense"], morale: 0 },
      { label: "Armorer only", hand: ["spell.lightning_bolt", "ability.armorer"], morale: 0 },
      {
        label: "morale + Offense + Armorer",
        hand: ["spell.lightning_bolt", "ability.offense", "ability.armorer"],
        morale: 1
      }
    ];

    let sawJoinOnlyCase = false;
    for (const entry of hands) {
      let state = neutralFight(`cast-window-freeze-class-${entry.label}`);
      const guardId = makeWolfRaiders(state);
      state.players.p1.hand = [...entry.hand];
      state.players.p1.morale = entry.morale;

      const preCast = offersAtCastMoment(state, guardId);
      sawJoinOnlyCase ||= preCast.offers.length > 0 && !preCast.opensWindow;

      state = castBolt(state, guardId);
      if (state.reactionWindow) {
        state = settleWindows(state);
      }
      expect(state.stack, `${entry.label}: the cast must never stay parked`).toHaveLength(0);
      expect(state.combat!.units[guardId].damage, `${entry.label}: the bolt dealt its damage`).toBe(2);
      expect(anyoneCanAct(state), `${entry.label}: the table is not frozen`).toBe(true);
    }

    // Non-vacuity: at least one hand really did produce offers that all refuse to
    // open a window. Without this the sweep could pass on empty offer lists.
    expect(sawJoinOnlyCase, "the sweep exercised a genuine join-only-offer hand").toBe(true);
  });
});
