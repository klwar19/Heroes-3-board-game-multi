import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Effect-level audit: Magic Arrow + Fire/Water/Air/Earth Magic (Tower School of
 * Magic permanents) + Basic X Magic (Conflux fetch permanents).
 *
 * Every claim is an observable outcome (damage / paralysis / permanent slot /
 * expert offered or not). CONTROLs where the school does not match are included
 * so a silent no-op cannot pass as "working".
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function combatReady(seed: string, hand: string[], permanent?: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = hand;
  state.players.p2.hand = [];
  if (permanent) {
    state.players.p1.permanents = [permanent];
  }
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 40;
  target.damage = 0;
  return state;
}

function castAt(
  state: GameState,
  cardId: string,
  unitId: string,
  useSchoolExpert = false
): GameState {
  const cast = getLegalActions(state, "p1").find(
    (l) =>
      l.action.type === "CAST_SPELL" &&
      l.action.cardId === cardId &&
      Boolean(l.action.useSchoolExpert) === useSchoolExpert &&
      l.action.target?.type === "unit" &&
      l.action.target.unitId === unitId
  );
  expect(cast, `cast of ${cardId} on ${unitId} expert=${useSchoolExpert}`).toBeTruthy();
  return passAll(applyOk(state, cast!.action));
}

describe("AUDIT Magic Arrow", () => {
  it("Power 0 deals 1 damage", () => {
    const s = castAt(combatReady("ma-base", ["spell.magic_arrow"]), "spell.magic_arrow", "unit_p2_skeletons");
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("is discardable for +1 Power on another cast", () => {
    const state = combatReady("ma-boost", ["spell.lightning_bolt", "spell.magic_arrow"]);
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.lightning_bolt" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    let s = applyOk(state, cast!.action);
    const boost = getLegalActions(s, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.asPowerBoost === true &&
        l.action.cardId === "spell.magic_arrow"
    );
    expect(boost, "Magic Arrow should be discardable for +1 Power").toBeTruthy();
    s = passAll(applyOk(s, boost!.action));
    // Lightning Bolt: Power 0 → 2, Power 1 → 3
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });
});

describe("AUDIT School of Magic permanent (+1 standing / +3 expert)", () => {
  const schools = [
    { school: "fire", perm: "ability.fire_magic" },
    { school: "water", perm: "ability.water_magic" },
    { school: "air", perm: "ability.air_magic" },
    { school: "earth", perm: "ability.earth_magic" }
  ] as const;

  for (const { school, perm } of schools) {
    it(`${school} Magic +1 on Magic Arrow (school "any")`, () => {
      const s = castAt(
        combatReady(`ma-${school}`, ["spell.magic_arrow"], perm),
        "spell.magic_arrow",
        "unit_p2_skeletons"
      );
      expect(s.combat!.units.unit_p2_skeletons.damage).toBe(2);
      expect(s.players.p1.permanents).toEqual([perm]);
    });

    it(`${school} Magic expert (+3) discards the permanent and maxes Magic Arrow`, () => {
      const state = combatReady(`exp-${school}`, ["spell.magic_arrow"], perm);
      const cast = getLegalActions(state, "p1").find(
        (l) =>
          l.action.type === "CAST_SPELL" &&
          l.action.cardId === "spell.magic_arrow" &&
          l.action.useSchoolExpert === true &&
          l.action.target?.type === "unit" &&
          l.action.target.unitId === "unit_p2_skeletons"
      );
      expect(cast).toBeTruthy();
      const s = passAll(applyOk(state, cast!.action));
      expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3);
      expect(s.players.p1.permanents).toEqual([]);
      expect(s.players.p1.discard).toContain(perm);
    });
  }

  it("Air Magic +1 lifts Lightning Bolt damage 2 → 3", () => {
    const base = castAt(
      combatReady("air-lb-base", ["spell.lightning_bolt"]),
      "spell.lightning_bolt",
      "unit_p2_skeletons"
    );
    const boosted = castAt(
      combatReady("air-lb-boost", ["spell.lightning_bolt"], "ability.air_magic"),
      "spell.lightning_bolt",
      "unit_p2_skeletons"
    );
    expect(base.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(boosted.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("Earth Magic +1 turns Implosion from 0 damage into 2", () => {
    // Implosion amountByPower: {0:0, 1:2, 3:4, 5:6}
    const base = castAt(
      combatReady("earth-imp-base", ["spell.implosion"]),
      "spell.implosion",
      "unit_p2_skeletons"
    );
    const boosted = castAt(
      combatReady("earth-imp-boost", ["spell.implosion"], "ability.earth_magic"),
      "spell.implosion",
      "unit_p2_skeletons"
    );
    expect(base.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(boosted.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("Water Magic +1 lifts a Water Weakness reaction (attack −1 → −2)", () => {
    // Weakness is Water; standing School Power is seeded into the attack window
    // when the defender plays it as a reaction (attack-window.test.ts pattern).
    const state = createInitialGameState("water-weakness");
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.weakness"];
    state.players.p2.permanents = ["ability.water_magic"];
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    griffins.abilities = [];
    skeletons.abilities = [];
    griffins.position = 9;
    skeletons.position = 13;
    griffins.attack = 8;
    skeletons.defense = 2;
    skeletons.maxHealth = 40;
    skeletons.damage = 0;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    let s = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.weakness", mode: "basic" });
    s = passAll(s);
    // 8 attack − 2 (Weakness at standing Power 1) − 2 defense + 0 die = 4
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("Fire Magic does NOT boost Lightning Bolt (air) — school gate CONTROL", () => {
    const base = castAt(
      combatReady("fire-no-air-base", ["spell.lightning_bolt"]),
      "spell.lightning_bolt",
      "unit_p2_skeletons"
    );
    const withFire = castAt(
      combatReady("fire-no-air", ["spell.lightning_bolt"], "ability.fire_magic"),
      "spell.lightning_bolt",
      "unit_p2_skeletons"
    );
    expect(withFire.combat!.units.unit_p2_skeletons.damage).toBe(
      base.combat!.units.unit_p2_skeletons.damage
    );
  });

  it("can put Fire Magic into play during own activation", () => {
    const state = combatReady("put-fire", ["ability.fire_magic"]);
    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.fire_magic"
    );
    expect(play, "Put Fire Magic into play should be offered").toBeTruthy();
    const s = applyOk(state, play!.action);
    expect(s.players.p1.permanents).toEqual(["ability.fire_magic"]);
  });
});

describe("AUDIT Basic X Magic permanent (fetch + expert +3)", () => {
  const schools = ["air", "earth", "fire", "water"] as const;

  for (const school of schools) {
    it(`Basic ${school} Magic enters play via ENTER_PLAY option`, () => {
      const cardId = `ability.basic_${school}_magic`;
      const state = combatReady(`basic-enter-${school}`, [cardId]);
      const play0 = getLegalActions(state, "p1").find(
        (l) =>
          l.action.type === "PLAY_CARD" &&
          l.action.cardId === cardId &&
          l.action.optionIndex === 0
      );
      expect(play0, "ENTER_PLAY option 0 should be offered").toBeTruthy();
      const s = applyOk(state, play0!.action);
      expect(s.players.p1.permanents).toEqual([cardId]);
    });
  }

  it("Basic Earth Magic expert +3 empowers Implosion (damage 4) and discards the permanent", () => {
    const state = combatReady("basic-exp-earth", ["spell.implosion"]);
    state.players.p1.permanents = ["ability.basic_earth_magic"];
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.implosion" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    let s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find((l) => l.action.type === "USE_SCHOOL_FETCH_EXPERT");
    expect(expert, "Basic Earth expert should be offered").toBeTruthy();
    // The offer names the consumption (never a silent discard).
    expect(expert!.label).toMatch(/discards the permanent/i);
    s = passAll(applyOk(s, expert!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(4);
    // USER RULING: the +3 consumes the fetch permanent (like the School-of-Magic
    // expert) — to the owner's DISCARD pile, never out of the game.
    expect(s.players.p1.permanents).toEqual([]);
    expect(s.players.p1.discard).toContain("ability.basic_earth_magic");
    expect(s.players.p1.removed ?? []).not.toContain("ability.basic_earth_magic");
  });

  it("Basic Fire Magic expert is NOT offered for Air Lightning Bolt — CONTROL", () => {
    const state = combatReady("basic-nomatch", ["spell.lightning_bolt"]);
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    const cast = getLegalActions(state, "p1").find(
      (l) => l.action.type === "CAST_SPELL" && l.action.cardId === "spell.lightning_bolt"
    );
    const s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find((l) => l.action.type === "USE_SCHOOL_FETCH_EXPERT");
    expect(expert).toBeFalsy();
  });

  it("Basic Fire Magic expert DOES empower Magic Arrow (any)", () => {
    const state = combatReady("basic-ma", ["spell.magic_arrow"]);
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.magic_arrow" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    let s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find((l) => l.action.type === "USE_SCHOOL_FETCH_EXPERT");
    expect(expert, "Basic Fire should empower Magic Arrow").toBeTruthy();
    s = passAll(applyOk(s, expert!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });
});

describe("AUDIT School of Magic expert FROM HAND school filter", () => {
  it("Fire Magic expert from hand is offered when casting Magic Arrow", () => {
    const state = combatReady("hand-exp-ma", ["spell.magic_arrow", "ability.fire_magic"]);
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.magic_arrow" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    const s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.cardId === "ability.fire_magic" &&
        l.action.mode === "expert"
    );
    expect(expert, "Fire Magic expert from hand should be offered for Magic Arrow").toBeTruthy();
  });

  it("Fire Magic expert from hand is NOT offered for an Air Lightning Bolt", () => {
    const state = combatReady("hand-exp-wrong", ["spell.lightning_bolt", "ability.fire_magic"]);
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.lightning_bolt" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast).toBeTruthy();
    const s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.cardId === "ability.fire_magic" &&
        l.action.mode === "expert"
    );
    expect(expert, "Fire Magic expert from hand must not empower Air").toBeFalsy();
  });

  it("Fire Magic expert from hand is offered for a Fire Blind cast (not only Magic Arrow)", () => {
    const state = combatReady("hand-exp-fire", ["spell.blind", "ability.fire_magic"]);
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.blind" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast).toBeTruthy();
    const s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.cardId === "ability.fire_magic" &&
        l.action.mode === "expert"
    );
    expect(expert, "Fire Magic expert should empower a Fire Blind cast").toBeTruthy();
  });

  it("Fire Magic expert from hand raises Magic Arrow damage to 3", () => {
    const state = combatReady("hand-exp-dmg", ["spell.magic_arrow", "ability.fire_magic"]);
    const cast = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.magic_arrow" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p2_skeletons"
    );
    let s = applyOk(state, cast!.action);
    const expert = getLegalActions(s, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.cardId === "ability.fire_magic" &&
        l.action.mode === "expert"
    );
    expect(expert).toBeTruthy();
    s = passAll(applyOk(s, expert!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(s.players.p1.hand).not.toContain("ability.fire_magic");
    expect(s.players.p1.discard).toContain("ability.fire_magic");
  });
});
