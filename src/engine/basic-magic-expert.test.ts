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
 * User demand: the Basic X Magic +3 expert must be offered AS PART OF the cast —
 * a first-class CAST_SPELL variant (`useSchoolFetchExpert`) while the fetch
 * permanent is IN PLAY — mirroring the Tower `useSchoolExpert` variant, instead of
 * only surfacing as the standalone USE_SCHOOL_FETCH_EXPERT reaction after the
 * cast. Using the +3 DISCARDS the fetch permanent (consumes it, like the Tower
 * School-of-Magic expert); a crown is spent; the +3 is folded up front.
 */
describe("Basic X Magic expert as an UP-FRONT cast variant (useSchoolFetchExpert)", () => {
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

  function upfrontCast(state: GameState, cardId: string, unitId = "unit_p2_skeletons") {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === cardId &&
        legal.action.useSchoolFetchExpert === true &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === unitId
    );
  }

  function plainCast(state: GameState, cardId: string, unitId = "unit_p2_skeletons") {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === cardId &&
        !legal.action.useSchoolFetchExpert &&
        !legal.action.useSchoolExpert &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === unitId
    );
  }

  it("offers the +3 cast variant with a crown; Magic Arrow (any) resolves at damage 3, permanent discarded", () => {
    const state = upfrontCombat("upfront-arrow", ["spell.magic_arrow"], "ability.basic_fire_magic", 1);
    const cast = upfrontCast(state, "spell.magic_arrow");
    expect(cast, "the up-front +3 cast variant should be offered for Magic Arrow").toBeTruthy();
    const spentBefore = state.players.p1.combatStats.expertUsesSpentThisRound;
    const s = passAll(applyOk(state, cast!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3); // Power 0 → 3 (+3)
    expect(s.players.p1.combatStats.expertUsesSpentThisRound).toBe(spentBefore + 1);
    expect(s.players.p1.permanents).toEqual([]); // consumed by the +3
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
  });

  it("empowers a FIRE-school spell (Fireball) up front — exact-school match, not just 'any'", () => {
    // Move the vampires off the skeleton's neighbour cell so Fireball's splash
    // opens no adjacent-target choice — the primary damage is the clean signal.
    const base = upfrontCombat("upfront-fb-base", ["spell.fireball"], "ability.basic_fire_magic", 1);
    base.combat!.units.unit_p2_vampires.position = 3;
    const plain = passAll(applyOk(base, plainCast(base, "spell.fireball")!.action));
    // Fireball ladder {0:1, 2:2, 4:3}: Power 0 → 1 damage.
    expect(plain.combat!.units.unit_p2_skeletons.damage).toBe(1);

    const state = upfrontCombat("upfront-fb", ["spell.fireball"], "ability.basic_fire_magic", 1);
    state.combat!.units.unit_p2_vampires.position = 3;
    const cast = upfrontCast(state, "spell.fireball");
    expect(cast, "Fireball (fire) should be offered the up-front fetch expert").toBeTruthy();
    const s = passAll(applyOk(state, cast!.action));
    // Power 3 → the minPower-2 tier = 2 damage (up from 1): the +3 moved it.
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(s.players.p1.permanents).toEqual([]); // consumed by the +3
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
  });

  it("CONTROL: with no crown the up-front variant is absent (the plain cast still is)", () => {
    const state = upfrontCombat("upfront-nocrown", ["spell.magic_arrow"], "ability.basic_fire_magic", 0);
    expect(upfrontCast(state, "spell.magic_arrow"), "no crown → no up-front +3").toBeFalsy();
    expect(plainCast(state, "spell.magic_arrow"), "the plain cast is unaffected").toBeTruthy();
  });

  it("CONTROL: a Water fetch permanent does NOT offer the up-front variant for a Fire spell", () => {
    const state = upfrontCombat("upfront-wrongschool", ["spell.fireball"], "ability.basic_water_magic", 1);
    expect(upfrontCast(state, "spell.fireball"), "a Water fetch must not empower Fireball (fire)").toBeFalsy();
    expect(plainCast(state, "spell.fireball"), "the plain Fireball cast is still offered").toBeTruthy();
  });

  it("is once per cast: after the up-front +3 the reaction is not re-offered and damage is +3, not +6", () => {
    // Two crowns so a spent crown alone cannot be what withholds the reaction;
    // Magic Arrow in hand keeps the power window open. The +3 consumed (discarded)
    // the permanent, so there is no fetch left to dip a second time.
    const state = upfrontCombat("upfront-once", ["spell.implosion", "spell.magic_arrow"], "ability.basic_earth_magic", 2);
    const cast = upfrontCast(state, "spell.implosion");
    expect(cast, "the up-front variant is offered for Implosion (earth)").toBeTruthy();
    let s = applyOk(state, cast!.action);
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
