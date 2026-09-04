import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { createInitialGameState } from "./setup";
import type { ActiveEffectState, GameAction, GameState, PlayerId, SpellSchool } from "./state";

/**
 * Basic Air/Earth/Fire/Water Magic — the in-play spell-fetch permanent — also
 * carries its printed Expert side: spend an expert use for +3 Power on a
 * matching-school spell, whether a normal cast or an instant played into an
 * attack. Every rule here is engine-enforced (a mutation breaks a test).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Put a Basic X Magic spell-fetch permanent into play for a player. */
function pushFetch(state: GameState, playerId: PlayerId, school: SpellSchool): void {
  state.activeEffects.push({
    id: `fetch_${school}`,
    name: `Basic ${school} Magic`,
    scope: "player",
    duration: { type: "permanent" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_SCHOOL_FETCH", school }],
    source: { type: "system" },
    controllerId: playerId,
    startedRound: state.round,
    startedCombatRound: state.combat!.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  } satisfies ActiveEffectState);
}

function fetchExpert(state: GameState, playerId: "p1" | "p2") {
  return getLegalActions(state, playerId).find((legal) => legal.action.type === "USE_SCHOOL_FETCH_EXPERT");
}

describe("Basic X Magic expert (+3 Power) from the in-play fetch permanent", () => {
  it("empowers a normal cast of its school (Implosion at Power 3 → 4 damage)", () => {
    const state = createInitialGameState("basic-magic-cast");
    state.players.p1.hand = ["spell.implosion"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 30;
    pushFetch(state, "p1", "earth"); // Implosion is Earth

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.implosion" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    let s = applyOk(state, cast!.action);
    const offer = fetchExpert(s, "p1");
    expect(offer, "Basic Earth Magic's +3 expert should be offered for an Earth cast").toBeTruthy();
    const before = s.players.p1.combatStats.expertUsesSpentThisRound;
    s = applyOk(s, offer!.action);
    // The expert use is spent, and Power 3 lifts Implosion to 4 damage (0 → none).
    expect(s.players.p1.combatStats.expertUsesSpentThisRound).toBe(before + 1);
    s = passAll(s);
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("is offered only once per cast (the expert use is not refundable)", () => {
    const state = createInitialGameState("basic-magic-once");
    state.players.p1.hand = ["spell.implosion"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    pushFetch(state, "p1", "earth");
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.implosion"
    );
    let s = applyOk(state, cast!.action);
    s = applyOk(s, fetchExpert(s, "p1")!.action);
    expect(fetchExpert(s, "p1"), "the +3 expert is spent and no longer offered").toBeFalsy();
  });

  it("empowers an instant of its school played into an attack (Bloodlust → +3)", () => {
    const state = createInitialGameState("basic-magic-instant");
    state.players.p1.hand = ["spell.bloodlust"]; // Fire instant
    state.players.p2.hand = [];
    pushFetch(state, "p1", "fire");
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;

    let s = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    // Bloodlust first (Power 0 → +1), then the Basic Fire Magic +3 expert lifts
    // the attacker's pool to 3 → Bloodlust at Power 3 = +3 attack.
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    const offer = fetchExpert(s, "p1");
    expect(offer, "Basic Fire Magic's +3 expert should be offered for a Fire instant on the attack").toBeTruthy();
    s = applyOk(s, offer!.action);
    s = passAll(s);

    const rolled = [...s.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(3);
  });

  it("is not offered without a matching-school spell to empower", () => {
    const state = createInitialGameState("basic-magic-nomatch");
    state.players.p1.hand = ["spell.bloodlust"]; // Fire
    state.players.p2.hand = [];
    pushFetch(state, "p1", "water"); // Water fetch — does not match a Fire instant
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    let s = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    expect(fetchExpert(s, "p1"), "a Water fetch must not empower a Fire instant").toBeFalsy();
  });
});

/**
 * User bug ("BASIC fire magic Gives +1 so to arrow — it shouldn't"): a FETCH
 * permanent (Basic X Magic) carries `permanentEffect.schoolFetch` and NO
 * `permanentEffect.schoolBonus`, so unlike the Tower School-of-Magic permanent
 * it grants ZERO standing Power — its only Power boost is the +3 EXPERT that the
 * caster must actively play (needing a crown). A Magic Arrow cast with only the
 * fetch permanent in play resolves at printed Power (0 → 1 damage). The +1 the
 * user saw comes from a DIFFERENT, correct source (Conflux Elemental terrain /
 * Pack-Elemental activation / Astrologers) — pinned here by the Tower Fire Magic
 * CONTROL that a real school +1 source still lifts the arrow to 2 damage.
 */
describe("Basic X Magic fetch permanent grants NO standing Power", () => {
  function arrowCombat(seed: string, permanent: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p1.permanents = [permanent];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 40;
    target.damage = 0;
    return state;
  }

  function castArrow(state: GameState): GameState {
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        !legal.action.useSchoolExpert &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Magic Arrow cast should be legal").toBeTruthy();
    return passAll(applyOk(state, cast!.action));
  }

  it("Magic Arrow with only Basic Fire Magic in play resolves at Power +0 (damage 1)", () => {
    const s = castArrow(arrowCombat("fetch-no-standing", "ability.basic_fire_magic"));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // The fetch permanent is never discarded / spent by a plain cast.
    expect(s.players.p1.permanents).toEqual(["ability.basic_fire_magic"]);
  });

  it("CONTROL: the Tower Fire Magic permanent (a real schoolBonus) DOES give +1 (damage 2)", () => {
    const s = castArrow(arrowCombat("school-standing", "ability.fire_magic"));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

/**
 * Sub-bug 2, from-HAND holding: the Basic X Magic card's printed expert side
 * (CHOOSE_ONE option 1, trigger SPELL_CAST_STARTED, +3 Power for a matching-
 * school spell) is offered and RESOLVES as a reaction on the owner's own cast,
 * gated on a crown.
 */
describe("Basic X Magic expert (+3) FROM HAND on the owner's own cast", () => {
  function arrowHand(seed: string, crowns: number): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.magic_arrow", "ability.basic_fire_magic"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = crowns;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 40;
    target.damage = 0;
    return state;
  }

  function beginArrowCast(state: GameState): GameState {
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    return applyOk(state, cast!.action);
  }

  function handExpert(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "ability.basic_fire_magic" &&
        legal.action.mode === "expert"
    );
  }

  it("with a crown: resolves at +3 (Magic Arrow damage 3) and discards the card", () => {
    let s = beginArrowCast(arrowHand("basic-hand-crown", 1));
    const expert = handExpert(s);
    expect(expert, "Basic Fire Magic expert should be offered from hand for Magic Arrow").toBeTruthy();
    s = passAll(applyOk(s, expert!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
  });

  it("CONTROL: with no crown the from-hand expert is withheld", () => {
    const s = beginArrowCast(arrowHand("basic-hand-nocrown", 0));
    expect(handExpert(s), "no crown → no +3 expert").toBeFalsy();
  });
});

/**
 * The Basic X Magic +3 expert for an IN-PLAY fetch permanent, committed in the
 * cast's OWN instant Power window (USE_SCHOOL_FETCH_EXPERT). There is no
 * up-front `useSchoolFetchExpert` CAST_SPELL variant any more — castSpell
 * REJECTS one — because an up-front variant had to pick the Spell's school
 * before the cast existed (the Magic Arrow one-target arming bug). A crown is
 * spent unless the ability is Empowered, and the +3 CONSUMES its source: the
 * permanent goes to the owner's DISCARD pile (user ruling — never out of the
 * game), which is announced in the offer label because a silent consumption
 * reads as "my Basic Magic stopped working" (the original bug report).
 */
describe("Basic X Magic expert (+3) committed in the cast's own Power window", () => {
  function upfrontCombat(seed: string, hand: string[], permanent: string, crowns = 1): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = hand;
    state.players.p2.hand = [];
    state.players.p1.permanents = [permanent];
    state.players.p1.limits.expertUses = crowns;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 40;
    target.damage = 0;
    return state;
  }

  function plainCast(state: GameState, cardId: string, unitId = "unit_p2_skeletons") {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === cardId &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === unitId,
    );
  }

  /** Begin the cast, then read the +3 commit offered inside its Power window. */
  function castThenOffer(state: GameState, cardId: string, unitId = "unit_p2_skeletons") {
    const cast = plainCast(state, cardId, unitId);
    expect(cast, `${cardId} should be castable`).toBeTruthy();
    const opened = applyOk(state, cast!.action);
    return { opened, offer: fetchExpert(opened, "p1") };
  }

  it("offers the +3 in the cast's window with a crown; Magic Arrow resolves at damage 3, permanent discarded", () => {
    const state = upfrontCombat("upfront-arrow", ["spell.magic_arrow"], "ability.basic_fire_magic", 1);
    const { opened, offer } = castThenOffer(state, "spell.magic_arrow");
    expect(offer, "the +3 commit should be offered in Magic Arrow's Power window").toBeTruthy();
    // The offer NAMES the consumption — a silent discard reads as "my Basic
    // Magic stopped working" (the user bug report behind this rule).
    expect(offer!.label).toMatch(/discards the permanent/i);
    const spentBefore = opened.players.p1.combatStats.expertUsesSpentThisRound;
    const s = passAll(applyOk(opened, offer!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3); // Power 0 → 3 (+3)
    expect(s.players.p1.combatStats.expertUsesSpentThisRound).toBe(spentBefore + 1);
    // USER RULING: the +3 consumes its source — the permanent goes to the
    // owner's DISCARD pile (recycles into their deck; never out of the game).
    expect(s.players.p1.permanents).toEqual([]);
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
    expect(s.players.p1.removed ?? []).not.toContain("ability.basic_fire_magic");
  });

  it("empowers a FIRE-school spell (Fireball) — exact-school match, not just 'any'", () => {
    // Move the vampires off the skeleton's neighbour cell so Fireball's splash
    // opens no adjacent-target choice — the primary damage is the clean signal.
    const base = upfrontCombat("upfront-fb-base", ["spell.fireball"], "ability.basic_fire_magic", 1);
    base.combat!.units.unit_p2_vampires.position = 3;
    const plain = passAll(applyOk(base, plainCast(base, "spell.fireball")!.action));
    // Fireball ladder {0:1, 2:2, 4:3}: Power 0 → 1 damage.
    expect(plain.combat!.units.unit_p2_skeletons.damage).toBe(1);

    const state = upfrontCombat("upfront-fb", ["spell.fireball"], "ability.basic_fire_magic", 1);
    state.combat!.units.unit_p2_vampires.position = 3;
    const { opened, offer } = castThenOffer(state, "spell.fireball");
    expect(offer, "Fireball (fire) should be offered the fetch +3 in its window").toBeTruthy();
    const s = passAll(applyOk(opened, offer!.action));
    // Power 3 → the minPower-2 tier = 2 damage (up from 1): the +3 moved it.
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(s.players.p1.permanents).toEqual([]); // consumed by the +3
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
  });

  it("CONTROL: with no crown the +3 commit is absent (the plain cast still is)", () => {
    const state = upfrontCombat("upfront-nocrown", ["spell.magic_arrow"], "ability.basic_fire_magic", 0);
    expect(plainCast(state, "spell.magic_arrow"), "the plain cast is unaffected").toBeTruthy();
    const { offer } = castThenOffer(state, "spell.magic_arrow");
    expect(offer, "no crown → no +3 commit").toBeFalsy();
  });

  it("CONTROL: a Water fetch permanent does NOT offer the +3 for a Fire spell", () => {
    const state = upfrontCombat("upfront-wrongschool", ["spell.fireball"], "ability.basic_water_magic", 1);
    expect(plainCast(state, "spell.fireball"), "the plain Fireball cast is still offered").toBeTruthy();
    const { offer } = castThenOffer(state, "spell.fireball");
    expect(offer, "a Water fetch must not empower Fireball (fire)").toBeFalsy();
  });

  it("is once per cast: after the +3 the commit is not re-offered and damage is +3, not +6", () => {
    // Two crowns so a spent crown alone cannot be what withholds the second
    // offer; Magic Arrow in hand keeps the power window open. The +3 consumed
    // (discarded) the permanent, so there is no fetch left to dip a second time.
    const state = upfrontCombat("upfront-once", ["spell.implosion", "spell.magic_arrow"], "ability.basic_earth_magic", 2);
    const { opened, offer } = castThenOffer(state, "spell.implosion");
    expect(offer, "the +3 commit is offered for Implosion (earth)").toBeTruthy();
    let s = applyOk(opened, offer!.action);
    // The window stays open (p1 may still discard Magic Arrow for +1 Power) with a
    // crown to spare, yet the fetch permanent is already consumed for this cast.
    expect(s.reactionWindow, "a power window is open").toBeTruthy();
    expect(s.players.p1.permanents, "the fetch permanent was discarded by the +3").toEqual([]);
    expect(fetchExpert(s, "p1"), "the +3 is spent once — no second dip").toBeFalsy();
    s = passAll(s);
    // Implosion {0:0, 1:2, 3:4, 5:6}: Power 3 = 4 (NOT Power 6 = 6 → applied once).
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });
});

/**
 * USER BUG REPORT ("Basic effect of basic fire magic not working" … "now even
 * basic is gone"): the whole card LIFECYCLE, engine-enforced end to end. While
 * the fetch permanent is IN PLAY its BASIC effect (the Spell-deck fetch) works;
 * using the +3 expert CONSUMES the permanent to the owner's DISCARD PILE (user
 * ruling — never removed from the game), after which the fetch is correctly
 * gone; redrawing and replaying the card brings the BASIC fetch back. Each leg
 * fails if its wiring is removed.
 */
describe("Basic X Magic lifecycle: fetch works → expert consumes → replay restores the fetch", () => {
  function fetchOptionFor(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && /Fire Magic spell/i.test(legal.label)
    );
  }

  it("plays through the whole story on one state", () => {
    let s = createInitialGameState("fetch-lifecycle");
    s.players.p1.hand = ["ability.basic_fire_magic", "spell.magic_arrow"];
    s.players.p2.hand = [];
    s.players.p1.deck = [];
    s.players.p1.discard = [];
    s.players.p1.limits.expertUses = 1;
    s.activePlayerId = "p1";
    s.combat!.activeUnitId = "unit_p1_marksmen";
    const target = s.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 40;

    // 1. Play the BASIC side: the card enters play as the fetch permanent.
    const basicPlay = getLegalActions(s, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.basic_fire_magic" && l.action.optionIndex === 0
    );
    expect(basicPlay, "the basic (enter play) side is offered").toBeTruthy();
    s = applyOk(s, basicPlay!.action);
    expect(s.players.p1.permanents).toEqual(["ability.basic_fire_magic"]);

    // 2. The BASIC effect works: a Spell-deck Search offers the fetch and delivers.
    s.decks["spells"].drawPile = ["spell.bloodlust", "spell.slow", "spell.slow"];
    s.decks["spells"].discardPile = [];
    s = applyOk(s, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const fetch1 = fetchOptionFor(s);
    expect(fetch1, "the Fire fetch is offered while the permanent is in play").toBeTruthy();
    s = applyOk(s, fetch1!.action);
    expect(s.players.p1.hand).toContain("spell.bloodlust");

    // 3. Use the +3 EXPERT on a cast: it consumes the permanent to the DISCARD
    //    pile (user ruling) — never out of the game.
    const cast = getLegalActions(s, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.magic_arrow" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "the Magic Arrow cast is offered").toBeTruthy();
    s = applyOk(s, cast!.action);
    const commit = fetchExpert(s, "p1");
    expect(commit, "the +3 commit is offered in the cast's Power window").toBeTruthy();
    s = passAll(applyOk(s, commit!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(s.players.p1.permanents).toEqual([]);
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
    expect(s.players.p1.removed ?? []).not.toContain("ability.basic_fire_magic");

    // 4. With the permanent consumed, a Search correctly offers NO fetch
    //    (straight to the reveal when nothing else is up front).
    s.decks["spells"].drawPile = ["spell.bloodlust", "spell.slow", "spell.slow"];
    s.decks["spells"].discardPile = [];
    s = applyOk(s, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    expect(fetchOptionFor(s), "no fetch offer without the permanent").toBeFalsy();
    expect(s.pendingChoice?.type).toBe("DECK_SEARCH");
    const keep = getLegalActions(s, "p1").find((l) => l.action.type === "RESOLVE_DECK_SEARCH");
    s = applyOk(s, keep!.action);

    // 5. The card recycles: redraw it (simulated) and replay the BASIC side —
    //    the fetch permanent (and its basic effect) is BACK.
    const discardIndex = s.players.p1.discard.indexOf("ability.basic_fire_magic");
    expect(discardIndex, "the card is still in the personal discard cycle").toBeGreaterThanOrEqual(0);
    s.players.p1.discard.splice(discardIndex, 1);
    s.players.p1.hand.push("ability.basic_fire_magic");
    const replay = getLegalActions(s, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.basic_fire_magic" && l.action.optionIndex === 0
    );
    expect(replay, "the basic side is playable again after the redraw").toBeTruthy();
    s = applyOk(s, replay!.action);
    expect(s.players.p1.permanents).toEqual(["ability.basic_fire_magic"]);

    s.decks["spells"].drawPile = ["spell.curse", "spell.slow"];
    s.decks["spells"].discardPile = [];
    s = applyOk(s, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const fetch2 = fetchOptionFor(s);
    expect(fetch2, "the BASIC fetch works again after the replay").toBeTruthy();
    s = applyOk(s, fetch2!.action);
    expect(s.players.p1.hand).toContain("spell.curse");
  });

  it("a fetch that finds no takeable spell says so instead of failing silently", () => {
    let s = createInitialGameState("fetch-empty-note");
    s.players.p1.hand = [];
    s.players.p2.hand = [];
    s.players.p1.permanents = ["ability.basic_fire_magic"];
    s.activePlayerId = "p1";
    // No Fire/any spell in the deck: the fetch resolves to nothing — the player
    // must be TOLD (a silent no-op reads as "the basic effect did not work").
    s.decks["spells"].drawPile = ["spell.slow", "spell.haste"]; // earth / air only
    s.decks["spells"].discardPile = [];
    s = applyOk(s, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const fetch = getLegalActions(s, "p1").find(
      (l) => l.action.type === "CHOOSE_OPTION" && /Fire Magic spell/i.test(l.label)
    );
    expect(fetch, "the fetch option is offered (the deck content is hidden)").toBeTruthy();
    const handBefore = s.players.p1.hand.length;
    s = applyOk(s, fetch!.action);
    expect(s.players.p1.hand.length).toBe(handBefore);
    const note = [...s.eventLog].reverse().find((event) => event.type === "EVENT_NOTE");
    expect(note && note.type === "EVENT_NOTE" ? note.message : "").toMatch(/no takeable Fire Magic spell/i);
  });
});
