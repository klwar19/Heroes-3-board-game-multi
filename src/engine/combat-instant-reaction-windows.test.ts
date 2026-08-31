import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions, getPlayerView } from "./index";
import { combatAnytimeInstantWindowJoins, getOffTurnCombatReactions } from "./legal-actions";
import { chooseComputerAction } from "./computer/policy";
import { nextAfkDropAction } from "./afk-drop";
import { cardLibrary } from "@/data/cards/library";
import type { CardId, GameAction, GameState, LegalAction, PlayerId } from "./state";

/**
 * "Instant (any time during Combat)" cards inside an OPEN reaction window —
 * the 2026-08-06 report: "I should be able to use the card ballista (all
 * speciality, ability...) before counter attack as reaction window. Actually,
 * all instant effects should be able to be used as reaction window like that."
 *
 * THE BUG. Off-turn, with no window open, the engine already offers every
 * printed `combatAnytime` face (Gerwulf's discard-the-Ballista damage, Adelaide's
 * / Glacius' Frost Ring, Deemer's Meteor Shower, Tarnum-Dungeon's row blast) —
 * `getOffTurnCombatReactions` → the combat branch. But `getLegalActions` returns
 * ONLY the window's own offer list once a reaction window is open, and
 * `isCombatCardWindowOpen` switches the whole off-turn card pass off while a
 * window/stack is live. So those instants were unreachable in a window, and —
 * with nothing else window-opening in hand — no window opened at all: the blow,
 * the Retaliation Attack and its damage all resolved inside ONE action, leaving
 * literally no moment to fire the Ballista before the counter-attack.
 *
 * THE RULE. A `combatAnytime` face JOINS every reaction window, for both
 * fighters.
 *
 * 2026-08-08 USER RULING — SUPERSEDES the original opener scope. It used to
 * read "only the side about to be HIT may OPEN an attack window with one
 * (`windowJoinOnly` for everyone else)", justified by "the other side had its
 * whole activation to play the card". The user rejected that: "instant
 * abilities should be able to be played before counter attack, when attack and
 * when defend, all of them, FIX PROPERLY." So inside an ATTACK window
 * (`UNIT_ATTACK_DECLARED` — primary, retaliation and printed follow-up alike)
 * EITHER combat participant's playable instant opens it, and the tests below
 * pass out of the attacker's own primary window on the way to the retaliation
 * one (`declaredPastPrimary`). NOTHING changed for a Spell cast, a unit
 * activation or a die-settled window — the CONTROLs for those are unchanged.
 *
 * Every claim below is mutation-checked; the reverting line is named per test.
 * Board: 4 rows × 5 cols, getOrthogonalNeighbors(9) = {5, 8, 10, 13}.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * p1's Marksmen (melee-ified, Attack 1) are about to hit p2's Skeletons at 13.
 * The Skeletons survive with a big Attack, so a Retaliation Attack is coming —
 * the moment the report is about. Scripted "+0" dice keep the maths exact.
 */
function aboutToAttack(
  hand: CardId[],
  options: { permanents?: CardId[]; skeletonHealth?: number } = {}
): GameState {
  const state = createInitialGameState("instant-window-seed");
  state.players.p1.hand = [...hand];
  state.players.p1.permanents = [...(options.permanents ?? [])];
  state.players.p2.hand = [];

  const units = state.combat!.units;
  const attacker = units.unit_p1_marksmen;
  attacker.position = 14;
  attacker.type = "ground"; // a melee blow, so the Skeletons may retaliate
  attacker.attack = 1;
  attacker.defense = 0;
  attacker.maxHealth = 20;
  attacker.abilities = [];
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;

  const target = units.unit_p2_skeletons;
  target.position = 13; // adjacent to 14
  target.initiative = 1; // the slowest enemy → Artillery's forced target
  target.maxHealth = options.skeletonHealth ?? 30;
  target.attack = 6; // a counter-attack that is clearly visible when it lands
  target.defense = 0;
  target.variant = "few";
  target.abilities = [];

  units.unit_p2_vampires.position = 10;
  units.unit_p2_vampires.initiative = 9;
  units.unit_p2_dread_knights.position = 9;
  units.unit_p2_dread_knights.initiative = 9;
  units.unit_p1_griffins.position = 0;
  units.unit_p1_crusaders.position = 1;

  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

const declareAttack: GameAction = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

function cardPlay(state: GameState, playerId: PlayerId, cardId: CardId, unitId?: string) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (unitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

function retaliationWindow(state: GameState) {
  const window = state.reactionWindow;
  return window?.triggerEvent.type === "UNIT_ATTACK_DECLARED" && window.triggerEvent.isRetaliation
    ? window
    : null;
}

/**
 * Declare p1's attack and pass out of the PRIMARY attack's own window.
 *
 * 2026-08-08 USER RULING ("instant abilities should be able to be played …
 * when attack and when defend, all of them"): a held instant now opens an
 * attack window for EITHER side, so a player about to attack while holding one
 * is asked FIRST, on their own declaration. Every "reach the retaliation
 * window" test below therefore needs one extra Pass that it did not before —
 * the retaliation window itself is unchanged.
 */
function declaredPastPrimary(state: GameState): GameState {
  let next = applyOk(state, declareAttack);
  for (let guard = 0; guard < 6 && next.reactionWindow && !retaliationWindow(next); guard += 1) {
    const pass = (["p1", "p2"] as const)
      .flatMap((playerId) => getLegalActions(next, playerId))
      .find((legal) => legal.action.type === "PASS_REACTION");
    if (!pass) {
      break;
    }
    next = applyOk(next, pass.action);
  }
  return next;
}

// ===========================================================================
// The reported case: the Ballista fires BEFORE the counter-attack
// ===========================================================================

describe("the Ballista discard is playable before the counter-attack", () => {
  it.each([
    "specialty.adelaide.1",
    "specialty.adelaide.4",
    "specialty.adelaide.6",
    "specialty.glacius.1",
    "specialty.glacius.4",
    "specialty.glacius.6",
    "specialty.deemer.1",
    "specialty.deemer.6",
    "specialty.kudryavka_noumi.1",
    "specialty.kudryavka_noumi.6",
    "specialty.tarnum_dungeon.4"
  ] as CardId[])("offers %s in the window before an enemy Retaliation Attack", (cardId) => {
    const state = aboutToAttack([
      cardId,
      "stat.attack",
      "stat.defense",
      "stat.power",
      "stat.knowledge"
    ]);
    // Frost Ring IV needs a Spell/Specialty in discard to recall. The extra
    // payment cards make every discard-priced I/VI face genuinely payable.
    state.players.p1.discard = ["spell.magic_arrow"];
    const declared = declaredPastPrimary(state);
    expect(retaliationWindow(declared), `${cardId}: retaliation window opens`).toBeTruthy();
    expect(
      getLegalActions(declared, "p1").some(
        (legal) =>
          (legal.action.type === "PLAY_CARD" || legal.action.type === "PLAY_REACTION") &&
          legal.action.cardId === cardId
      ),
      `${cardId}: offered before retaliation damage`
    ).toBe(true);
  });

  it("opens the retaliation window and offers it; with the join removed the whole exchange resolves at once (CONTROL)", () => {
    // Fails if the combatAnytimeInstantWindowJoins block is removed from
    // getLegalReactionsForTrigger, or if its offers are flagged windowJoinOnly
    // for the attacked side too (then nothing opens the retaliation window).
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.gerwulf.6"], { permanents: ["war_machine.ballista"] })
    );
    const window = retaliationWindow(declared);
    expect(window, "the incoming Retaliation Attack opened a window for its target's owner").toBeTruthy();
    expect(window!.allowedPlayerIds).toContain("p1");
    expect(
      cardPlay(declared, "p1", "specialty.gerwulf.6", "unit_p2_skeletons"),
      "Gerwulf's 'discard your Ballista: 3 damage' is offered in that window"
    ).toBeTruthy();

    // CONTROL: the same board with NO Ballista in play (the card's own
    // prerequisite) has nothing window-opening — the blow, the retaliation and
    // its damage all land inside the single ATTACK_UNIT action, which is exactly
    // what the report described.
    const noBallista = applyOk(aboutToAttack(["specialty.gerwulf.6"]), declareAttack);
    expect(noBallista.reactionWindow).toBeNull();
    expect(noBallista.combat!.units.unit_p1_marksmen.damage, "the counter-attack already landed").toBeGreaterThan(0);
  });

  it("firing it removes the retaliator, so the counter-attack never lands", () => {
    // Fails if the join is not offered, or if the reducer stops treating a
    // window PLAY_CARD as a reaction play (the parked retaliation would then
    // resolve from a corpse — the "no attack from beyond the grave" guard).
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.gerwulf.6"], { permanents: ["war_machine.ballista"], skeletonHealth: 3 })
    );
    const skeleton = declared.combat!.units.unit_p2_skeletons;
    expect(skeleton.damage, "the Marksmen's own blow dealt 1").toBe(1);
    expect(skeleton.damage, "the retaliator is still standing").toBeLessThan(skeleton.maxHealth);

    const fired = applyOk(declared, cardPlay(declared, "p1", "specialty.gerwulf.6", "unit_p2_skeletons")!.action);

    expect(fired.combat!.units.unit_p2_skeletons.damage, "1 + the Ballista's 3 removed it").toBe(4);
    expect(fired.combat!.units.unit_p1_marksmen.damage, "the dead retaliator's counter-attack is cancelled").toBe(0);
    expect(fired.stack, "the parked retaliation was dropped, not left stuck").toEqual([]);
    expect(fired.reactionWindow).toBeNull();
    // The Ballista really left play (the printed price of the shot).
    expect(fired.players.p1.permanents ?? []).not.toContain("war_machine.ballista");
  });

  it("a retaliator that survives the shot still counters — and the shot landed first", () => {
    // Fails if the join is removed (no window ⇒ no shot at all) — the assertion
    // is on the ORDER, so it also fails if the shot resolved after the counter.
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.gerwulf.6"], { permanents: ["war_machine.ballista"], skeletonHealth: 30 })
    );
    const fired = applyOk(declared, cardPlay(declared, "p1", "specialty.gerwulf.6", "unit_p2_skeletons")!.action);

    expect(fired.combat!.units.unit_p2_skeletons.damage, "1 from the blow + 3 from the Ballista").toBe(4);
    expect(fired.combat!.units.unit_p1_marksmen.damage, "the surviving retaliator's counter still lands").toBe(6);

    const shotIdx = fired.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p2_skeletons" &&
        event.amount === 3
    );
    const counterIdx = fired.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p1_marksmen"
    );
    expect(shotIdx).toBeGreaterThanOrEqual(0);
    expect(counterIdx, "the counter-attack resolved after the window closed").toBeGreaterThan(shotIdx);
  });

  it("the spent card drops out of the window's offers instead of leaving a stale menu", () => {
    // Fails if the PLAY_CARD → advanceReactionWindowAfterPlay tail is removed
    // from applyAction: the window would keep listing a card no longer in hand
    // (and its Ballista no longer in play), so a second click would reject.
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.gerwulf.6", "specialty.deemer.6"], {
        permanents: ["war_machine.ballista"],
        skeletonHealth: 30
      })
    );
    expect(retaliationWindow(declared)).toBeTruthy();
    const fired = applyOk(declared, cardPlay(declared, "p1", "specialty.gerwulf.6", "unit_p2_skeletons")!.action);

    expect(fired.reactionWindow, "a second instant is still in hand, so the window stays open").toBeTruthy();
    expect(fired.reactionWindow!.priorityPlayerId).toBe("p1");
    const offers = getLegalActions(fired, "p1");
    expect(
      offers.some((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gerwulf.6"),
      "the spent Ballista card is gone from the refreshed offers"
    ).toBe(false);
    expect(
      offers.some((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6"),
      "the OTHER held instant is still offered — 'keep playing' in the same window"
    ).toBe(true);
    // Every offer the window lists must actually execute (no dead buttons).
    for (const offer of offers) {
      expect(applyAction(fired, offer.action).errors).toEqual([]);
    }
  });

  it("a cost-bearing instant joins as a payable template: the enriched play is legal", () => {
    // Adelaide's Frost Ring VI prints "discard 2 cards", so the OFFER is a
    // template the client enriches with `costCardIds` (the shared submit path's
    // cost picker). `normalizeActionForMatch` ignores costCardIds for PLAY_CARD,
    // so the enriched play matches the offered template — this pins that
    // contract, i.e. the join is reachable and not a dead button.
    // Fails if the join block is removed (no offer at all) or if the payment
    // stops matching the offer.
    // The two payment cards are Power statistics: with no pairable spell instant
    // in hand a "+Power" face is withheld from an attack window, so the Frost Ring
    // itself is what opens this window (nothing else can).
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.adelaide.6", "stat.power", "stat.power"])
    );
    expect(retaliationWindow(declared)).toBeTruthy();
    const ring = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.adelaide.6"
    );
    expect(ring, "the Frost Ring joins the retaliation window").toBeTruthy();

    // The bare template cannot resolve — the printed price is unpaid.
    expect(applyAction(declared, ring!.action).errors.map((error) => error.message)).toEqual([
      "Frost Ring VI needs exactly 2 cards as payment."
    ]);
    // …and with the payment attached it resolves for real.
    const paid = applyOk(declared, {
      ...(ring!.action as Extract<GameAction, { type: "PLAY_CARD" }>),
      costCardIds: ["stat.power", "stat.power"]
    });
    expect(paid.players.p1.hand, "the printed price really left the hand").toEqual([]);
    expect(
      paid.eventLog.some((event) => event.type === "CARD_PLAYED" && event.cardId === "specialty.adelaide.6"),
      "the Frost Ring resolved inside the window"
    ).toBe(true);
  });

  it("a war-machine-free instant specialty (Meteor Shower) is offered there too", () => {
    // Fails with the join block removed. Deemer needs no permanent, so this
    // pins that the family — not one bespoke card — reached the window.
    const declared = declaredPastPrimary(aboutToAttack(["specialty.deemer.6"]));
    expect(retaliationWindow(declared), "a held Meteor Shower opens the retaliation window").toBeTruthy();
    const meteor = cardPlay(declared, "p1", "specialty.deemer.6", "unit_p2_skeletons");
    expect(meteor).toBeTruthy();
    const fired = applyOk(declared, meteor!.action);
    // Centre (the retaliator) + its neighbour at 14 — the attacking Marksmen —
    // each take 1: the blast is friend-and-foe, exactly as printed.
    expect(fired.combat!.units.unit_p2_skeletons.damage, "1 from the blow + 1 from the meteor").toBe(2);
  });
});

// ===========================================================================
// Artillery — the trigger-free ability instant, now on BOTH sides
// ===========================================================================

describe("Artillery joins the window for the attacking side as well", () => {
  it("the attacker may fire it in a window opened by the defender", () => {
    // Fails if the attackerArtillery block is removed from
    // getLegalReactionsForTrigger's UNIT_ATTACK_DECLARED section.
    // p2's Skeletons attack p1's Crusaders; p2 (the ATTACKER) holds Artillery,
    // and p1's Misfortune-free defence opens the window with its own Artillery.
    const state = aboutToAttack([]);
    state.players.p1.hand = ["ability.artillery"];
    state.players.p2.hand = ["ability.artillery"];
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.activatedThisRound = false;
    skeletons.attackedThisActivation = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = skeletons.id;
    // p1's Marksmen are the slowest of p2's enemies → Artillery's forced target.
    state.combat!.units.unit_p1_marksmen.initiative = 1;
    state.combat!.units.unit_p1_griffins.initiative = 9;
    state.combat!.units.unit_p1_crusaders.initiative = 9;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_marksmen"
    });
    expect(declared.reactionWindow).toBeTruthy();
    expect(declared.reactionWindow!.allowedPlayerIds, "the attacking side is in the window too").toContain("p2");
    const attackerShot = declared.reactionWindow!.legalReactions.p2?.find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.artillery"
    );
    expect(attackerShot, "the ATTACKER may fire Artillery in the open window").toBeTruthy();
    // The `windowJoinOnly` marker is still stamped (the trap-twin/labelling
    // machinery reads it), but since 2026-08-08 it no longer withholds the
    // OPENER inside an attack window — see the flipped case below.
    expect(attackerShot!.windowJoinOnly).toBe(true);
  });

  it("holding Artillery now DOES pause your OWN declared attack (2026-08-08 ruling)", () => {
    // FLIPPED EXPECTATION, justified: this used to be the CONTROL
    // "holding Artillery does not pause your OWN declared attack", resting on
    // "the attacker had their whole activation to play the card". The user's
    // ruling — "when attack and when defend, all of them" — rejects that, so an
    // attacker holding a playable instant is asked on their own declaration too.
    // Fails if reactionOfferOpensWindow stops treating `windowJoinOnly` as an
    // opener inside a UNIT_ATTACK_DECLARED window.
    const declared = applyOk(aboutToAttack(["ability.artillery"]), declareAttack);
    const primary = declared.reactionWindow;
    expect(primary?.triggerEvent.type, "the DECLARATION now opens a window").toBe("UNIT_ATTACK_DECLARED");
    expect(
      primary?.triggerEvent.type === "UNIT_ATTACK_DECLARED" ? primary.triggerEvent.isRetaliation : true,
      "…and it is the primary attack's own window, not the retaliation's"
    ).toBeFalsy();
    expect(primary!.allowedPlayerIds, "the attacking side is the one being asked").toContain("p1");

    // Passing it resumes the exchange exactly as before: the blow lands, the
    // Retaliation Attack opens its own window, and nothing about the maths moved.
    const past = declaredPastPrimary(aboutToAttack(["ability.artillery"]));
    expect(retaliationWindow(past), "the RETALIATION window still opens after the Pass").toBeTruthy();
    expect(past.combat!.units.unit_p2_skeletons.damage, "the primary blow resolved on the Pass").toBe(1);
  });
});

// ===========================================================================
// The deliberate non-opening scope (no new pause at the table)
// ===========================================================================

describe("an 'any time' instant JOINS other windows but never opens them", () => {
  it("CONTROL: a Spell cast does not pause for a held Meteor Shower", () => {
    // Fails if instantJoinOpenerId is widened past UNIT_ATTACK_DECLARED (or the
    // windowJoinOnly flag is dropped): every cast at the table would stop.
    const state = aboutToAttack(["specialty.deemer.6", "spell.magic_arrow"]);
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast, "Magic Arrow is castable on p1's own activation").toBeTruthy();
    const casted = applyOk(state, {
      ...cast!.action,
      target: { type: "unit", unitId: "unit_p2_vampires" }
    } as GameAction);
    expect(casted.reactionWindow, "the cast resolved without a window").toBeNull();
    expect(casted.players.p1.hand, "the cast really happened (the Spell left hand)").not.toContain(
      "spell.magic_arrow"
    );
    expect(
      casted.eventLog.some((event) => event.type === "SPELL_CAST_STARTED"),
      "the cast really started (so a window COULD have opened here)"
    ).toBe(true);
    expect(
      casted.eventLog.filter((event) => event.type === "REACTION_WINDOW_OPENED"),
      "no window opened at all — the held instant is a join, never an opener on a cast"
    ).toEqual([]);
  });

  it("but the join IS listed once such a window is open for another reason", () => {
    // Fails if the join block is scoped to attack windows only.
    // p2 casts Magic Arrow at p1's Marksmen; p1 holds Resistance (a real
    // SPELL_CAST_STARTED reaction that opens the window) plus a Meteor Shower.
    const state = aboutToAttack([]);
    state.players.p1.hand = ["ability.resistance", "specialty.deemer.6"];
    state.players.p2.hand = ["spell.magic_arrow"];
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.activatedThisRound = false;
    skeletons.attackedThisActivation = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = skeletons.id;

    const cast = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast).toBeTruthy();
    const casted = applyOk(state, {
      ...cast!.action,
      target: { type: "unit", unitId: "unit_p1_marksmen" }
    } as GameAction);
    expect(casted.reactionWindow?.triggerEvent.type, "Resistance opened the cast window").toBe("SPELL_CAST_STARTED");
    expect(
      (casted.reactionWindow!.legalReactions.p1 ?? []).some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6"
      ),
      "the held instant rides the open cast window"
    ).toBe(true);
  });
});

// ===========================================================================
// Non-stalling: the drivers can always close the window
// ===========================================================================

describe("the new offers never strand a window", () => {
  it("the AFK / turn-timeout driver closes it with a Pass", () => {
    // Fails if a join ever became the ONLY offer (no Pass) — the driver would
    // then have nothing to fire and the forced resolution would loop forever.
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.gerwulf.6"], { permanents: ["war_machine.ballista"] })
    );
    expect(retaliationWindow(declared)).toBeTruthy();
    expect(nextAfkDropAction(declared, "p1")).toMatchObject({ type: "PASS_REACTION", playerId: "p1" });
  });

  it("a computer seat answers the window (it PASSES — the damage band sits below PASS_REACTION)", () => {
    // Documented limit, pinned so it cannot silently become a stall: the AI's
    // combat-damage band (640–860) is below PASS_REACTION (1_050), so a computer
    // holding one of these instants passes rather than firing it in a window —
    // the same behaviour it had before this change. What matters is that it
    // ALWAYS answers: a null decision would freeze the table.
    const declared = declaredPastPrimary(
      aboutToAttack(["specialty.gerwulf.6"], { permanents: ["war_machine.ballista"] })
    );
    const decision = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(declared, "p1"),
      legalActions: getLegalActions(declared, "p1")
    });
    expect(decision, "the AI always has an answer in this window").toBeTruthy();
    expect(decision!.action.type).toBe("PASS_REACTION");
  });
});

// ===========================================================================
// The invariant sweep + the documented exclusion registry
// ===========================================================================

/**
 * Every printed "Instant (any time during Combat)" face in the library, as a
 * conscious list: a NEW `combatAnytime` face fails this test until it is added
 * here, forcing a decision about the window behaviour (registry hygiene, the
 * DISPLAY_ONLY_ABILITIES pattern).
 */
const COMBAT_ANYTIME_FACES: { cardId: CardId; optionIndex: number }[] = [
  { cardId: "ability.artillery", optionIndex: 0 },
  // Balance Pack First Aid EXPERT: +2 Health, an overheal buff played
  // defensively before a hit lands. Its offer stays gated on polish-card-balance
  // + a First Aid Tent in play + a payable crown (addOptionPlays), so it is
  // absent from a rule-off / Tent-less fixture — the in-window sweep below skips
  // it as an unmet-prerequisite face, and first-aid-instant-when-attacked pins
  // the real reaction.
  { cardId: "ability.first_aid", optionIndex: 2 },
  { cardId: "specialty.deemer.1", optionIndex: 0 },
  { cardId: "specialty.deemer.6", optionIndex: 0 },
  { cardId: "specialty.adelaide.1", optionIndex: 0 },
  { cardId: "specialty.adelaide.4", optionIndex: 0 },
  { cardId: "specialty.adelaide.6", optionIndex: 0 },
  { cardId: "specialty.glacius.1", optionIndex: 0 },
  { cardId: "specialty.glacius.4", optionIndex: 0 },
  { cardId: "specialty.glacius.6", optionIndex: 0 },
  // Anime specialty redesign (2026-08-25): Kakashi's Raikiri · Sharingan is an
  // Adelaide (Frost Ring) clone and Guiyan's Ghostfire Coil a Glacius clone —
  // each inherits the source's three combatAnytime faces verbatim.
  { cardId: "specialty.kakashi_hatake.1", optionIndex: 0 },
  { cardId: "specialty.kakashi_hatake.4", optionIndex: 0 },
  { cardId: "specialty.kakashi_hatake.6", optionIndex: 0 },
  { cardId: "specialty.guiyan.1", optionIndex: 0 },
  { cardId: "specialty.guiyan.4", optionIndex: 0 },
  { cardId: "specialty.guiyan.6", optionIndex: 0 },
  { cardId: "specialty.gerwulf.1", optionIndex: 1 },
  { cardId: "specialty.gerwulf.4", optionIndex: 1 },
  { cardId: "specialty.gerwulf.6", optionIndex: 1 },
  { cardId: "specialty.luka.6", optionIndex: 0 },
  { cardId: "specialty.tarnum_dungeon.4", optionIndex: 0 },
  { cardId: "specialty.tarnum_dungeon.6", optionIndex: 0 },
  // MGQ + Little Busters hero specialties (ORIGINAL cards) whose printed text is
  // an "Instant (any time during Combat)" face. Each joins every reaction
  // window (verified by the in-window sweep below); none carries a printed
  // reaction trigger, so none is a trap twin.
  { cardId: "specialty.alice.1", optionIndex: 0 },
  { cardId: "specialty.alice.4", optionIndex: 0 },
  { cardId: "specialty.alice.4", optionIndex: 1 },
  { cardId: "specialty.alice.4", optionIndex: 2 },
  // Blue Archive: Chise I and IV are explicit beginning-of-combat instant
  // reactions, so both faces must remain available in every reaction window.
  { cardId: "specialty.chise_blue_archive.1", optionIndex: 0 },
  { cardId: "specialty.chise_blue_archive.4", optionIndex: 0 },
  { cardId: "specialty.granberia.4", optionIndex: 0 },
  { cardId: "specialty.ilias.4", optionIndex: 0 },
  { cardId: "specialty.kudryavka_noumi.1", optionIndex: 0 },
  { cardId: "specialty.kudryavka_noumi.6", optionIndex: 0 },
  { cardId: "specialty.jeremy.1", optionIndex: 1 },
  { cardId: "specialty.jeremy.4", optionIndex: 0 },
  { cardId: "specialty.jeremy.4", optionIndex: 1 },
  { cardId: "specialty.jeremy.6", optionIndex: 0 },
  { cardId: "specialty.jeremy.6", optionIndex: 1 },
  { cardId: "specialty.melodia.1", optionIndex: 1 },
  { cardId: "specialty.promestein.6", optionIndex: 0 },
  { cardId: "specialty.tarnum_castle.1", optionIndex: 1 },
  { cardId: "specialty.tarnum_castle.4", optionIndex: 0 },
  { cardId: "specialty.tarnum_castle.4", optionIndex: 1 },
  { cardId: "specialty.tarnum_castle.6", optionIndex: 0 },
  { cardId: "specialty.tarnum_rampart.6", optionIndex: 1 },
  { cardId: "specialty.torosar.1", optionIndex: 1 },
  { cardId: "specialty.torosar.6", optionIndex: 0 },
  { cardId: "specialty.yuiko_kurugaya.1", optionIndex: 1 }
];

/**
 * Combat card faces that deliberately do NOT join a reaction window, with the
 * reason. This is the conscious exclusion registry the audit asked for — a
 * reader must never have to reverse-engineer why something is missing.
 *
 * - `mapOnly` faces are an ABSOLUTE bar: a printed zone restriction must never
 *   be overridden by a window join (pinned below).
 * - A `combatOnly` face WITHOUT `combatAnytime` is a TURN play, not an instant:
 *   Gerwulf IV's free 1 damage and Gerwulf VI's ongoing "you aim the Ballista"
 *   print no "any time" clause, and the same card's instant side is the one that joins.
 * - A face with a printed reaction TRIGGER is already a real reaction through
 *   the ordinary variant loop (Tarnum-Dungeon VI's "+2 attack" on
 *   UNIT_ATTACK_DECLARED) — it needs no join, and giving it one would be a
 *   strictly-worse trap twin (the `cardHasPrintedTriggerMatch` rule).
 * - Casting a SPELL off-turn stays gated behind Intelligence — a printed rule,
 *   not an oversight; a window changes nothing about it.
 * - Rolls that fire mid-resolution (the Dwarven resistance die, the defensive
 *   soak, the Medusa gaze, the skip-activation check) cannot pause, so they get
 *   no window at all.
 */
const DOCUMENTED_WINDOW_EXCLUSIONS: { cardId: CardId; optionIndex: number; reason: string }[] = [
  { cardId: "specialty.gerwulf.1", optionIndex: 0, reason: "mapOnly: pay 5 gold to gain a Ballista" },
  { cardId: "specialty.gerwulf.4", optionIndex: 0, reason: "turn play: the free 1 damage prints no instant clause" },
  { cardId: "specialty.gerwulf.6", optionIndex: 0, reason: "turn play: the ongoing 'you aim the Ballista' effect" },
  { cardId: "specialty.tarnum_dungeon.6", optionIndex: 1, reason: "printed UNIT_ATTACK_DECLARED trigger — already a real reaction" }
];

/** A live combat where p1 holds `hand` and it is p2's Skeletons' activation. */
function offTurnHolder(hand: CardId[], permanents: CardId[] = []): GameState {
  const state = aboutToAttack([]);
  state.players.p1.hand = [...hand];
  state.players.p1.permanents = [...permanents];
  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.activatedThisRound = false;
  skeletons.attackedThisActivation = false;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = skeletons.id;
  return state;
}

function playKeys(offers: LegalAction[], cardId: CardId): string[] {
  return offers
    .filter((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId)
    .map((legal) => {
      const action = legal.action as Extract<GameAction, { type: "PLAY_CARD" }>;
      return `${action.optionIndex ?? "-"}:${JSON.stringify(action.target ?? null)}`;
    })
    .sort();
}

describe("invariant sweep — a window never swallows an 'any time' instant", () => {
  it.each([
    "specialty.deemer.1",
    "specialty.deemer.6",
    "specialty.kudryavka_noumi.1",
    "specialty.kudryavka_noumi.6"
  ] as CardId[])("offers %s before an enemy attack resolves", (cardId) => {
    const state = aboutToAttack([]);
    state.players.p1.hand = [cardId, "stat.attack", "stat.defense"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.attackedThisActivation = false;
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_marksmen"
    });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");
    expect(
      getLegalActions(declared, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
      ),
      `${cardId} must be playable before enemy attack damage`
    ).toBe(true);
  });

  it("the library's combatAnytime faces are exactly the registered list", () => {
    const found: { cardId: CardId; optionIndex: number }[] = [];
    for (const [cardId, card] of Object.entries(cardLibrary)) {
      if (card.implementationStatus !== "implemented" || card.effect.type !== "CHOOSE_ONE") {
        continue;
      }
      card.effect.options.forEach((option, optionIndex) => {
        if (option.combatAnytime) {
          found.push({ cardId, optionIndex });
        }
      });
    }
    const key = (entry: { cardId: CardId; optionIndex: number }) => `${entry.cardId}#${entry.optionIndex}`;
    expect(found.map(key).sort()).toEqual(COMBAT_ANYTIME_FACES.map(key).sort());
  });

  it("EVERY combatAnytime face offered off-turn is also offered inside an open reaction window", () => {
    // The invariant, one assertion for the whole family: whatever the printed
    // prerequisites of a face are, if the engine lets you play it during the
    // enemy's activation it must also let you play it while a reaction window
    // is open. Fails for every face if the join block is removed.
    let checked = 0;
    for (const { cardId } of COMBAT_ANYTIME_FACES) {
      // Generous prerequisites: a Ballista to discard, and spare cards to pay
      // the printed discard costs (Frost Ring / Meteor Shower).
      const hand: CardId[] = [cardId, "stat.attack", "stat.defense", "stat.attack"];
      const permanents: CardId[] = ["war_machine.ballista"];
      // Scope to the card's combatAnytime option(s): getOffTurnCombatReactions
      // returns the whole card's off-turn plays — including a SEPARATE plain
      // draw option (e.g. Promestein VI option 1) that joins windows via the
      // draw-utility path, not combatAnytimeInstantWindowJoins. That draw is
      // pinned by instant-card-gain-legality; here we compare only the
      // combatAnytime face against its window join.
      const card = cardLibrary[cardId];
      const anytimeIdx = new Set(
        card?.effect.type === "CHOOSE_ONE"
          ? card.effect.options.flatMap((option, index) => (option.combatAnytime ? [index] : []))
          : []
      );
      const onlyAnytime = (keys: string[]) => keys.filter((key) => anytimeIdx.has(Number(key.split(":")[0])));
      const offTurn = onlyAnytime(playKeys(getOffTurnCombatReactions(offTurnHolder(hand, permanents), "p1"), cardId));
      if (offTurn.length === 0) {
        // Not playable in this fixture either (a prerequisite this board cannot
        // supply) — nothing for the window to swallow, so the invariant holds
        // trivially. Never silently skipped: the registry test above still pins
        // the face's existence.
        continue;
      }
      const inWindow = onlyAnytime(playKeys(combatAnytimeInstantWindowJoins(offTurnHolder(hand, permanents), "p1"), cardId));
      expect(inWindow, `${cardId} must join a reaction window with the same offers it has off-turn`).toEqual(
        offTurn
      );
      checked += 1;
    }
    expect(checked, "the sweep really exercised the family").toBeGreaterThanOrEqual(8);
  });

  it("the documented exclusions are all real card faces, and none of them joins a window", () => {
    for (const { cardId, optionIndex, reason } of DOCUMENTED_WINDOW_EXCLUSIONS) {
      const card = cardLibrary[cardId];
      expect(card, `${cardId} is registered`).toBeTruthy();
      expect(card.effect.type).toBe("CHOOSE_ONE");
      if (card.effect.type !== "CHOOSE_ONE") {
        continue;
      }
      const option = card.effect.options[optionIndex];
      expect(option, `${cardId} option ${optionIndex} exists (${reason})`).toBeTruthy();
      expect(Boolean(option.combatAnytime), `${cardId}#${optionIndex} is not an instant: ${reason}`).toBe(false);

      const joins = combatAnytimeInstantWindowJoins(
        offTurnHolder([cardId, "stat.attack", "stat.defense"], ["war_machine.ballista"]),
        "p1"
      );
      expect(
        joins.some(
          (legal) =>
            legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId && legal.action.optionIndex === optionIndex
        ),
        `${cardId}#${optionIndex} must NOT join a window: ${reason}`
      ).toBe(false);
    }
  });

  it("CONTROL: a mapOnly face never joins even though its Ballista activation side does", () => {
    // Gerwulf I prints [mapOnly "pay 5 gold for a Ballista", turn-only
    // "Activate your Ballista"] — neither is an instant, so the whole card is
    // absent from the window. Fails if the join filter stops reading
    // `combatAnytime` and starts offering every combat face.
    const joins = combatAnytimeInstantWindowJoins(
      offTurnHolder(["specialty.gerwulf.1"], ["war_machine.ballista"]),
      "p1"
    );
    const gerwulf = joins.filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gerwulf.1"
    );
    expect(gerwulf).toHaveLength(1);
    expect(gerwulf[0].action.type === "PLAY_CARD" ? gerwulf[0].action.optionIndex : -1).toBe(1);
  });

  it("CONTROL: a hand-locked defender (no hero in the fight) is offered no join", () => {
    // Fails if the isHandLockedInCombat gate is removed from the new pass.
    const state = offTurnHolder(["specialty.deemer.6"]);
    // A heroless garrison-style defense: "You cannot use your Deck during this
    // Combat" — units only, so no card may join a window either.
    state.combat!.context = { kind: "player", attackerHeroId: null, defenderHeroId: null, fieldId: "0,0" } as never;
    expect(combatAnytimeInstantWindowJoins(state, "p1")).toEqual([]);
  });
});
