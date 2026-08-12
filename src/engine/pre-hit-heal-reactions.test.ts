import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { applyPermanentCombatEffects } from "./permanents";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Pre-hit heals (First Aid Tent, Cure) before damage lands — not only against
 * a declared attack, but also against a pending damaging Spell AND against a
 * specialty damage instant (Frost Ring / Meteor Shower).
 *
 * Each assertion fails if the wiring is removed (CLAUDE.md #1): the reaction
 * window must open with the heal on offer, the heal must land before damage,
 * and a CONTROL non-damaging cast must NOT force a heal window.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function damage(state: GameState, unitId: UnitId): number {
  return state.combat!.units[unitId].damage;
}

/** p1 has a wounded unit + First Aid Tent; p1's unit is active so p1 can cast. */
function castState(p1Hand: string[]): GameState {
  const state = createInitialGameState("pre-hit-heal-seed");
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [];
  state.players.p1.permanents = ["war_machine.first_aid_tent"];
  applyPermanentCombatEffects(state);

  const crusaders = state.combat!.units.unit_p1_crusaders;
  crusaders.maxHealth = 10;
  crusaders.damage = 3;
  crusaders.position = 14;

  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.maxHealth = 20;
  skeletons.damage = 0;
  skeletons.position = 13;

  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  state.combat!.units.unit_p1_griffins.attackedThisActivation = false;
  return state;
}

// ===========================================================================
// Damaging SPELL — Cure + First Aid Tent before the hit
// ===========================================================================

describe("pre-hit heals against a damaging Spell", () => {
  it("offers the First Aid Tent heal to the targeted player while Magic Arrow is pending", () => {
    // p2 will be the defender: give p2 the tent + a wounded unit, p1 casts Arrow.
    const state = createInitialGameState("pre-hit-spell-tent");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p2.permanents = ["war_machine.first_aid_tent"];
    applyPermanentCombatEffects(state);

    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 10;
    target.damage = 2;
    target.position = 13;
    state.combat!.units.unit_p1_griffins.position = 14;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    expect(casted.reactionWindow, "damaging spell opens a reaction window").toBeTruthy();
    expect(damage(casted, "unit_p2_skeletons"), "no spell damage yet").toBe(2);

    const heal = getLegalActions(casted, "p2").find(
      (legal) =>
        legal.action.type === "USE_ACTIVE_EFFECT" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(heal, "defender may use First Aid Tent before the Arrow hits").toBeTruthy();

    const resolved = applyOk(casted, heal!.action);
    // Spending the only reaction closes the window and resolves the Arrow in
    // the same action — heal must land BEFORE damage (event order).
    const healedIdx = resolved.eventLog.findIndex(
      (event) => event.type === "DAMAGE_HEALED" && event.target.type === "unit" && event.target.unitId === "unit_p2_skeletons"
    );
    const damageIdx = resolved.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p2_skeletons" &&
        event.source.type === "card" &&
        event.source.cardId === "spell.magic_arrow"
    );
    expect(healedIdx, "heal event logged").toBeGreaterThanOrEqual(0);
    expect(damageIdx, "Arrow damage logged").toBeGreaterThanOrEqual(0);
    expect(healedIdx, "heal before Arrow damage").toBeLessThan(damageIdx);
    // Started at 2; tent −1 then Arrow +1 → still 2.
    expect(damage(resolved, "unit_p2_skeletons")).toBe(2);
    expect(resolved.reactionWindow).toBeNull();
  });

  it("offers Cure as a PLAY_REACTION and heals before the Arrow resolves", () => {
    const state = createInitialGameState("pre-hit-spell-cure");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = ["spell.cure"];
    state.players.p2.permanents = [];

    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 10;
    target.damage = 3;
    target.position = 13;
    state.combat!.units.unit_p1_griffins.position = 14;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    const cure = getLegalActions(casted, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.cure" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cure, "Cure is offered as a reaction before the Arrow hits").toBeTruthy();

    const resolved = applyOk(casted, cure!.action);
    expect(resolved.players.p2.hand).not.toContain("spell.cure");
    // Power 0 Cure heals 1, then Arrow deals 1: 3 → 2 → 3. Event order pins heal-first.
    const curedIdx = resolved.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_HEALED" && event.source.type === "card" && event.source.cardId === "spell.cure"
    );
    const arrowIdx = resolved.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === "spell.magic_arrow"
    );
    expect(curedIdx).toBeGreaterThanOrEqual(0);
    expect(arrowIdx).toBeGreaterThanOrEqual(0);
    expect(curedIdx, "Cure before Arrow").toBeLessThan(arrowIdx);
    expect(damage(resolved, "unit_p2_skeletons")).toBe(3);
    expect(resolved.reactionWindow).toBeNull();
  });

  it("CONTROL: a non-damaging Spell (Haste) does NOT offer pre-hit heals", () => {
    const state = createInitialGameState("pre-hit-haste-ctrl");
    state.players.p1.hand = ["spell.haste"];
    state.players.p2.hand = ["spell.cure"];
    state.players.p2.permanents = ["war_machine.first_aid_tent"];
    applyPermanentCombatEffects(state);

    state.combat!.units.unit_p2_skeletons.maxHealth = 10;
    state.combat!.units.unit_p2_skeletons.damage = 3;
    state.combat!.units.unit_p1_griffins.position = 14;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    // Haste targets a friendly unit — buff, not damage.
    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.haste",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    // p2 must not be forced into a heal window for a buff on p1's unit.
    const p2Heals = (casted.reactionWindow?.legalReactions.p2 ?? []).filter(
      (legal) =>
        legal.action.type === "USE_ACTIVE_EFFECT" ||
        (legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.cure")
    );
    expect(p2Heals, "Haste must not open pre-hit heals for the opponent").toHaveLength(0);
  });
});

// ===========================================================================
// Specialty Frost Ring / Meteor Shower — heal before the blast
// ===========================================================================

describe("pre-hit heals against Frost Ring / Meteor Shower specialty", () => {
  it("pauses Deemer's Meteor Shower so the threatened player can First Aid before damage", () => {
    const state = createInitialGameState("pre-hit-deemer");
    // p1 plays Meteor Shower; p2 has the tent and a wounded unit in the blast.
    state.players.p1.hand = ["specialty.deemer.1"];
    state.players.p2.hand = [];
    state.players.p2.permanents = ["war_machine.first_aid_tent"];
    applyPermanentCombatEffects(state);

    // Centre at 9; neighbours 5,8,10,13. Put p2 skeletons on centre (hit).
    for (const id of Object.keys(state.combat!.units)) {
      state.combat!.units[id].maxHealth = 20;
      state.combat!.units[id].damage = 0;
    }
    state.combat!.units.unit_p2_skeletons.position = 9;
    state.combat!.units.unit_p2_skeletons.damage = 2;
    state.combat!.units.unit_p2_vampires.position = 10; // valid adjacent splash target
    state.combat!.units.unit_p1_griffins.position = 4;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    expect(played.reactionWindow, "Meteor Shower pauses for pre-hit heals").toBeTruthy();
    expect(damage(played, "unit_p2_skeletons"), "no specialty damage yet").toBe(2);

    const heal = getLegalActions(played, "p2").find((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(heal, "First Aid Tent offered against the specialty").toBeTruthy();
    const resolved = applyOk(played, heal!.action);
    // Heal then Meteor (Power 0 → 1): 2 − 1 + 1 = 2. Order pins heal-first.
    const healedIdx = resolved.eventLog.findIndex((event) => event.type === "DAMAGE_HEALED");
    const meteorIdx = resolved.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === "specialty.deemer.1"
    );
    expect(healedIdx).toBeGreaterThanOrEqual(0);
    expect(meteorIdx).toBeGreaterThanOrEqual(0);
    expect(healedIdx, "First Aid before Meteor damage").toBeLessThan(meteorIdx);
    expect(damage(resolved, "unit_p2_skeletons")).toBe(2);
    expect(resolved.reactionWindow).toBeNull();
  });

  it("pauses Adelaide's Frost Ring (space target) for Cure before the ring hits", () => {
    const state = createInitialGameState("pre-hit-adelaide");
    state.players.p1.hand = ["specialty.adelaide.1", "stat.attack"];
    state.players.p2.hand = ["spell.cure"];

    for (const id of Object.keys(state.combat!.units)) {
      state.combat!.units[id].maxHealth = 20;
      state.combat!.units[id].damage = 0;
    }
    // Ring of space 9 = {5,8,10,13}; centre spared. Put wounded p2 unit in the ring.
    state.combat!.units.unit_p2_skeletons.position = 10;
    state.combat!.units.unit_p2_skeletons.damage = 3;
    state.combat!.units.unit_p2_vampires.position = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.adelaide.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "space", position: 9 },
      costCardIds: ["stat.attack"]
    });

    expect(played.reactionWindow, "Frost Ring specialty pauses for heals").toBeTruthy();
    expect(damage(played, "unit_p2_skeletons"), "ring has not hit yet").toBe(3);

    const cure = getLegalActions(played, "p2").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.cure"
    );
    expect(cure, "Cure offered before the Frost Ring specialty hits").toBeTruthy();
    const resolved = applyOk(played, cure!.action);
    // Cure −1 then ring +1: 3 → 3. Heal must precede the ring damage event.
    const curedIdx = resolved.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_HEALED" &&
        event.source.type === "card" &&
        event.source.cardId === "spell.cure"
    );
    const ringIdx = resolved.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === "specialty.adelaide.1"
    );
    expect(curedIdx).toBeGreaterThanOrEqual(0);
    expect(ringIdx).toBeGreaterThanOrEqual(0);
    expect(curedIdx, "Cure before Frost Ring damage").toBeLessThan(ringIdx);
    expect(damage(resolved, "unit_p2_skeletons")).toBe(3);
  });

  it("the synthetic specialty window offers NO spell-hate reactions (Resistance / Knowledge recall)", () => {
    // A specialty is not a Spell: the SPELL_CAST_STARTED window it borrows so
    // heals can fire must NOT offer Resistance (the reducer's cancel branch is
    // gated on CAST_SPELL — playing it would eat the card for nothing) nor a
    // Knowledge/Mysticism recall to the specialty's owner.
    const state = createInitialGameState("pre-hit-no-spellhate");
    state.players.p1.hand = ["specialty.deemer.1", "stat.knowledge"];
    state.players.p2.hand = ["spell.cure", "ability.resistance"];

    for (const id of Object.keys(state.combat!.units)) {
      state.combat!.units[id].maxHealth = 20;
      state.combat!.units[id].damage = 0;
    }
    state.combat!.units.unit_p2_skeletons.position = 9;
    state.combat!.units.unit_p2_skeletons.damage = 2;
    state.combat!.units.unit_p2_vampires.position = 10;
    state.combat!.units.unit_p1_griffins.position = 4;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(played.reactionWindow, "the Cure offer still pauses the specialty").toBeTruthy();

    // Read the window's stored per-player offers (priority passes one player at
    // a time, so getLegalActions would hide the non-priority side's offers).
    const offeredCards = (playerId: "p1" | "p2", window: GameState["reactionWindow"]) =>
      (window?.legalReactions[playerId] ?? [])
        .filter((legal) => legal.action.type === "PLAY_REACTION")
        .map((legal) => (legal.action as Extract<GameAction, { type: "PLAY_REACTION" }>).cardId);

    expect(offeredCards("p2", played.reactionWindow), "Cure is offered").toContain("spell.cure");
    expect(
      offeredCards("p2", played.reactionWindow),
      "Resistance must NOT be offered against a specialty"
    ).not.toContain("ability.resistance");
    expect(
      offeredCards("p1", played.reactionWindow),
      "Knowledge recall must NOT be offered on a specialty"
    ).not.toContain("stat.knowledge");

    // CONTROL: on a REAL damaging Spell the same cards ARE offered.
    const control = createInitialGameState("pre-hit-spellhate-ctrl");
    control.players.p1.hand = ["spell.magic_arrow", "stat.knowledge"];
    control.players.p2.hand = ["ability.resistance"];
    control.combat!.units.unit_p2_skeletons.maxHealth = 10;
    control.combat!.units.unit_p2_skeletons.position = 13;
    control.combat!.units.unit_p1_griffins.position = 14;
    control.activePlayerId = "p1";
    control.combat!.activeUnitId = "unit_p1_griffins";
    const casted = applyOk(control, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(casted.reactionWindow).toBeTruthy();
    expect(
      offeredCards("p2", casted.reactionWindow),
      "CONTROL: Resistance offered against a real Spell"
    ).toContain("ability.resistance");
    expect(
      offeredCards("p1", casted.reactionWindow),
      "CONTROL: Knowledge recall offered on the caster's own Spell"
    ).toContain("stat.knowledge");
  });

  it("CONTROL: specialty still deals damage immediately when nobody can heal", () => {
    const state = createInitialGameState("pre-hit-noheal-ctrl");
    state.players.p1.hand = ["specialty.deemer.1"];
    state.players.p2.hand = []; // no Cure, no Tent
    state.combat!.units.unit_p2_skeletons.position = 9;
    state.combat!.units.unit_p2_skeletons.maxHealth = 20;
    state.combat!.units.unit_p2_skeletons.damage = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const resolved = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    // No heal available → no pause, damage lands at once (Power 0 → 1).
    expect(resolved.reactionWindow).toBeNull();
    expect(damage(resolved, "unit_p2_skeletons")).toBe(1);
  });
});

// ===========================================================================
// Attack window still offers Cure (parity with First Aid Tent)
// ===========================================================================

describe("pre-hit Cure against a declared attack", () => {
  it("offers Cure when a wounded friendly is attacked", () => {
    const state = createInitialGameState("pre-hit-attack-cure");
    state.players.p1.hand = ["spell.cure"];
    state.players.p2.hand = [];

    const target = state.combat!.units.unit_p1_crusaders;
    target.maxHealth = 8;
    target.damage = 2;
    target.position = 14;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.position = 13;
    attacker.activatedThisRound = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });

    const cure = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.cure"
    );
    expect(cure, "Cure is offered in the attack reaction window").toBeTruthy();
  });
});

// Sanity: specialty still offered on own turn / after enemy move (existing contract).
describe("Frost Ring / Meteor Shower specialty timing still holds", () => {
  it("Meteor Shower is still playable on the owner's own activation", () => {
    const state = castState(["specialty.deemer.1"]);
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.1"
    );
    expect(offered).toBe(true);
  });

  it("Frost Ring offers space targets on the owner's turn", () => {
    const state = castState(["specialty.adelaide.1", "stat.attack"]);
    const spacePlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.adelaide.1" &&
        legal.action.target?.type === "space"
    );
    expect(spacePlay, "Frost Ring space targeting on own turn").toBeTruthy();
  });
});
