import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { makeActiveEffect } from "./active-effects";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import { spellCards } from "@/data/cards/spells";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for the new area spells/specialties. Every rule here is
 * engine-enforced — each test fails if the matching logic is removed.
 *
 *   - Frost Ring  — Expert Water spell: select a SPACE (occupied or empty); the
 *                   units ADJACENT to it (not the centre) take the power-scaled
 *                   damage, friend or foe. Up to two; with more, the caster picks.
 *   - Deemer's Meteor Shower I/IV/VI — the new Dungeon Warlock's specialty.
 *   - Fireball verification — it targets a unit (so an occupied space is always a
 *                   legal centre) and splashes one adjacent unit ("2 adjacent
 *                   spaces").
 *
 * Board (4 cols × 5 rows):
 *    0  1  2  3
 *    4  5  6  7
 *    8  9 10 11
 *   12 13 14 15
 *   16 17 18 19
 * getOrthogonalNeighbors(9) = {5, 8, 10, 13}.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function damage(state: GameState, unitId: UnitId): number {
  return state.combat!.units[unitId].damage;
}

// ---------------------------------------------------------------------------
// Frost Ring — Expert Water spell, the ring around a chosen space
// ---------------------------------------------------------------------------

describe("Frost Ring", () => {
  /**
   * Casts Frost Ring on space 9 at the given Power (paid with stat.power
   * discards). `place` positions the units before the cast; griffins is the
   * caster and is kept out of the blast unless `place` moves it in.
   */
  function castFrostRing(power: number, place: (state: GameState) => void): GameState {
    let state = createInitialGameState("frost-ring-seed");
    state.players.p1.hand = ["spell.frost_ring", ...Array.from({ length: power }, () => "stat.power")];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    // Park everyone out of the blast by default; `place` puts the test's units in.
    for (const [id, position] of [
      ["unit_p1_griffins", 0],
      ["unit_p1_marksmen", 1],
      ["unit_p1_crusaders", 2],
      ["unit_p2_skeletons", 3],
      ["unit_p2_vampires", 7],
      ["unit_p2_dread_knights", 19]
    ] as const) {
      const unit = state.combat!.units[id];
      unit.position = position;
      unit.damage = 0;
      unit.maxHealth = 20;
      unit.abilities = [];
    }
    place(state);

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.frost_ring" &&
        legal.action.target.type === "space" &&
        legal.action.target.position === 9
    );
    expect(cast, "Frost Ring should be castable on space 9 (occupied or not)").toBeTruthy();
    state = applyOk(state, cast!.action);

    for (let i = 0; i < power; i += 1) {
      const boost = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
      );
      expect(boost, `power boost ${i + 1} should be offered`).toBeTruthy();
      state = applyOk(state, boost!.action);
    }
    return passAllReactions(state);
  }

  it("damages the units adjacent to the space — friend and foe — but NOT the centre", () => {
    const state = castFrostRing(0, (s) => {
      s.combat!.units.unit_p2_skeletons.position = 9; // enemy ON the centre space
      s.combat!.units.unit_p1_marksmen.position = 8; // friendly, adjacent
      s.combat!.units.unit_p2_vampires.position = 10; // enemy, adjacent
    });
    // Centre is spared (Frost Ring rings the space, never the space itself).
    expect(damage(state, "unit_p2_skeletons")).toBe(0);
    // Both adjacent units take 1 (Power 0), friend and foe alike.
    expect(damage(state, "unit_p1_marksmen")).toBe(1);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    // Outside the ring: untouched.
    expect(damage(state, "unit_p1_griffins")).toBe(0);
  });

  it("works on an EMPTY centre space (the ring still hits the neighbours)", () => {
    const state = castFrostRing(0, (s) => {
      // Nobody on 9; two enemies in the ring.
      s.combat!.units.unit_p2_skeletons.position = 8;
      s.combat!.units.unit_p2_vampires.position = 10;
    });
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
  });

  it("scales the damage with Power (0/2/4 → 1/2/3)", () => {
    const place = (s: GameState) => {
      s.combat!.units.unit_p2_skeletons.position = 8;
      s.combat!.units.unit_p2_vampires.position = 10;
    };
    expect(damage(castFrostRing(0, place), "unit_p2_skeletons")).toBe(1);
    expect(damage(castFrostRing(2, place), "unit_p2_skeletons")).toBe(2);
    expect(damage(castFrostRing(4, place), "unit_p2_skeletons")).toBe(3);
  });

  it("hits at most two; with more than two adjacent the caster PICKS which two", () => {
    let state = castFrostRing(0, (s) => {
      // Four units around the empty centre 9: marksmen(8), vampires(10),
      // dread_knights(5), skeletons(13).
      s.combat!.units.unit_p1_marksmen.position = 8;
      s.combat!.units.unit_p2_vampires.position = 10;
      s.combat!.units.unit_p2_dread_knights.position = 5;
      s.combat!.units.unit_p2_skeletons.position = 13;
    });

    const choice = state.pendingChoice;
    expect(choice?.type, "more than two adjacent → an area-pick choice opens").toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("area-pick");
    expect(choice.picksRemaining).toBe(2);
    expect(new Set(choice.candidateUnitIds)).toEqual(
      new Set(["unit_p1_marksmen", "unit_p2_vampires", "unit_p2_dread_knights", "unit_p2_skeletons"])
    );

    // Pick the marksmen first; the choice re-opens for the second pick.
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_marksmen"
    });
    const second = state.pendingChoice;
    expect(second?.type, "the second pick is still pending").toBe("ABILITY_TARGET_CHOICE");
    if (second?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(second.picksRemaining).toBe(1);
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: second.id,
      targetUnitId: "unit_p2_vampires"
    });

    expect(state.pendingChoice).toBeNull();
    // Exactly the two picked units took damage; the other two were spared.
    expect(damage(state, "unit_p1_marksmen")).toBe(1);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    expect(damage(state, "unit_p2_dread_knights")).toBe(0);
    expect(damage(state, "unit_p2_skeletons")).toBe(0);
  });

  it("is dealt into the deck as an implemented Expert Water spell", () => {
    expect(spellCards["spell.frost_ring"].implementationStatus).toBe("implemented");
    expect(spellCards["spell.frost_ring"].spellLevel).toBe("expert");
    expect(spellCards["spell.frost_ring"].spellSchools).toEqual(["water"]);
  });
});

// ---------------------------------------------------------------------------
// Deemer — Meteor Shower I / IV / VI
// ---------------------------------------------------------------------------

describe("Deemer's Meteor Shower", () => {
  function meteorState(hand: string[]): GameState {
    const state = createInitialGameState("meteor-seed");
    state.players.p1.hand = [...hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    for (const [id, position] of [
      ["unit_p1_griffins", 0],
      ["unit_p1_marksmen", 1],
      ["unit_p1_crusaders", 2],
      ["unit_p2_skeletons", 9],
      ["unit_p2_vampires", 10],
      ["unit_p2_dread_knights", 19]
    ] as const) {
      const unit = state.combat!.units[id];
      unit.position = position;
      unit.damage = 0;
      unit.maxHealth = 20;
      unit.abilities = [];
    }
    return state;
  }

  it("I hits the target unit and one adjacent unit (Power 0 → 1 damage each)", () => {
    // skeletons(9) centre, vampires(10) the only adjacent unit → both hit, no pick.
    const state = meteorState(["specialty.deemer.1"]);
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(1); // the centre target
    expect(damage(result, "unit_p2_vampires")).toBe(1); // its one neighbour
    expect(damage(result, "unit_p1_griffins")).toBe(0); // out of range
  });

  it("I is disallowed when no unit has an adjacent target, with a clear requirement", () => {
    const state = meteorState(["specialty.deemer.1"]);
    const separated = [0, 3, 8, 11, 16, 19];
    Object.values(state.combat!.units).forEach((unit, index) => {
      unit.position = separated[index];
    });
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.1",
      ),
    ).toBe(false);
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
    });
    expect(result.errors.map((error) => error.message).join(" ")).toContain(
      "requires the selected unit to have 1 living adjacent target",
    );
    expect(result.state.players.p1.hand).toContain("specialty.deemer.1");
  });

  it("I scales with the Power brought: discard 2 power-source cards → 2 damage", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power", "stat.power"]);
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power", "stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(2);
    expect(damage(result, "unit_p2_vampires")).toBe(2);
  });

  it("I reaches max damage (Power 4 → 3) by discarding 4 power-source cards", () => {
    const state = meteorState([
      "specialty.deemer.1",
      "stat.power",
      "stat.power",
      "stat.power",
      "stat.power"
    ]);
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power", "stat.power", "stat.power", "stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(3);
    expect(damage(result, "unit_p2_vampires")).toBe(3);
  });

  it("I lets one Power card use its crown side, spends the crown, and deals Power-2 damage", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power"]);
    const crownsBefore = state.players.p1.combatStats.expertUsesSpentThisRound;
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(2);
    expect(damage(result, "unit_p2_vampires")).toBe(2);
    expect(result.players.p1.combatStats.expertUsesSpentThisRound).toBe(crownsBefore + 1);
  });

  // The core bug this fix closes: a power source counts its printed Power VALUE,
  // not as one "card". A single +2 source brings Power 2 → 2 damage, where the
  // old count-based tier wrongly needed two separate discards. (Mutation guard:
  // if the engine reverts to counting cards, ONE card reads as Power 1 → 1.)
  it("I counts a power source's VALUE, not the card count (one +2 source → 2 damage)", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power.empowered"]);
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power.empowered"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(2);
    expect(damage(result, "unit_p2_vampires")).toBe(2);
  });

  // Meteor is a Specialty, not a Spell. Its dedicated window counts chosen
  // fuel cards; effects whose wording only boosts Spells do not leak into it.
  it("I ignores standing bonuses that only boost Spells", () => {
    const buffed = meteorState(["specialty.deemer.1", "stat.power"]);
    buffed.players.p1.permanents = ["pandora.power_or_morale"];
    const result = applyOk(buffed, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(1);
    expect(damage(result, "unit_p2_vampires")).toBe(1);

    // CONTROL: without that Spell bonus, the same fuel gives the same result.
    const plain = meteorState(["specialty.deemer.1", "stat.power"]);
    const control = applyOk(plain, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power"]
    });
    expect(damage(control, "unit_p2_skeletons")).toBe(1);
  });

  // A school-scoped School-of-Magic permanent is another Spell-only bonus and
  // likewise never enters the Meteor fuel total.
  it("I is NOT buffed by a school-scoped School-of-Magic permanent (a Specialty has no school)", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power"]);
    state.players.p1.permanents = ["ability.water_magic"]; // +1 to WATER spells only
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(1);
    expect(damage(result, "unit_p2_vampires")).toBe(1);
  });

  // A school-RESTRICTED additive power source ("+N Power for a <school> spell" —
  // e.g. Basic Water Magic, or an Orb's remove-this-card-for-+5 side) brings 0
  // Power to a school-less Specialty: a +3 WATER source contributes nothing, so
  // this deals LESS than the generic +2 source above (which reached 2). (The Orbs'
  // ONGOING side only DOUBLES a matching-school spell and never touches a
  // Specialty — see the Orb test below.)
  it("I refuses a source that only boosts a School's Spells", () => {
    const state = meteorState(["specialty.deemer.1", "ability.basic_water_magic"]);
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["ability.basic_water_magic"]
    });
    expect(result.errors.map((error) => error.message).join(" ")).toContain(
      "only boosts a School's Spells"
    );
    expect(result.state.players.p1.hand).toContain("ability.basic_water_magic");
  });

  it("I accepts Spells, Power specialties, and other school-less +Power cards as fuel", () => {
    const state = meteorState([
      "specialty.deemer.1",
      "spell.magic_arrow",
      "specialty.deemer.4",
      "stat.power"
    ]);
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["spell.magic_arrow", "specialty.deemer.4", "stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(2);
    expect(damage(result, "unit_p2_vampires")).toBe(2);
  });

  // The Magi pack's "+1 Power to the first spell you cast this round"
  // (magi-power-boost, school-less) is a SPELL-cast rider on the active unit — it
  // must NOT fuel a Specialty (gated to `card.kind === "spell"`). With it on the
  // active unit, Deemer + 1 stat.power stays Power 1 → 1 damage (not 2). Sharp
  // guard: removing the spell gate makes this deal 2.
  it("I is NOT buffed by the Magi pack's first-cast spell-power boost", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power"]);
    state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"]; // the active unit
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(1);
    expect(damage(result, "unit_p2_vampires")).toBe(1);
  });

  // The Orbs (Orb of Driving Rain, Orb of the Firmament, …) only DOUBLE a
  // matching-school spell's Power (SPELL_POWER_DOUBLE, applied solely in the
  // CAST_SPELL pipeline). A Specialty has no school AND the doubler never reaches
  // playCardSpellPower, so an active water Orb neither doubles NOR zeroes Deemer's
  // Power — 2 power-source discards still deal exactly 2.
  it("I is unaffected by an Orb's school power-DOUBLING (Specialty keeps normal, un-doubled Power)", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power", "stat.power"]);
    // The Orb of Driving Rain's ongoing side: double the Power of WATER spells.
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Orb of Driving Rain",
          scope: "player",
          duration: { type: "combat" },
          modifiers: [{ type: "SPELL_POWER_DOUBLE", school: "water" }]
        },
        { type: "card", cardId: "artifact.orb_of_driving_rain", controllerId: "p1" },
        "p1"
      )
    );
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      costCardIds: ["stat.power", "stat.power"]
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(2);
    expect(damage(result, "unit_p2_vampires")).toBe(2);
  });

  // A single clean activation, NOT a 3-tier menu: only optionIndex 0 is offered
  // (the reported "click has 2 options, weird").
  it("I offers a single activation option (no tier menu)", () => {
    const state = meteorState(["specialty.deemer.1", "stat.power", "stat.power", "stat.power", "stat.power"]);
    const optionIndexes = new Set(
      getLegalActions(state, "p1")
        .filter(
          (legal) =>
            legal.action.type === "PLAY_CARD" &&
            legal.action.cardId === "specialty.deemer.1" &&
            legal.action.target?.type === "unit" &&
            legal.action.target.unitId === "unit_p2_skeletons"
        )
        .map((legal) => (legal.action.type === "PLAY_CARD" ? legal.action.optionIndex : undefined))
    );
    expect(optionIndexes).toEqual(new Set([0]));
  });

  it("VI hits the target and TWO adjacent units (auto when exactly two are adjacent)", () => {
    // skeletons(9) centre, vampires(10) + dread_knights(13) adjacent → all three hit.
    const state = meteorState(["specialty.deemer.6"]);
    state.combat!.units.unit_p2_dread_knights.position = 13;
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(damage(result, "unit_p2_skeletons")).toBe(1);
    expect(damage(result, "unit_p2_vampires")).toBe(1);
    expect(damage(result, "unit_p2_dread_knights")).toBe(1);
  });

  it("VI is disallowed unless one centre has two adjacent living targets", () => {
    const state = meteorState(["specialty.deemer.6"]);
    const separated = [0, 3, 8, 11, 16, 19];
    Object.values(state.combat!.units).forEach((unit, index) => {
      unit.position = separated[index];
    });
    state.combat!.units.unit_p2_vampires.position = 9;
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6",
      ),
    ).toBe(false);
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
    });
    expect(result.errors.map((error) => error.message).join(" ")).toContain(
      "requires the selected unit to have 2 living adjacent targets",
    );
    expect(result.state.players.p1.hand).toContain("specialty.deemer.6");
  });

  it("VI lets the caster pick TWO when more than two are adjacent", () => {
    const state = meteorState(["specialty.deemer.6"]);
    // Three neighbours of 9: marksmen(8), vampires(10), dread_knights(13).
    state.combat!.units.unit_p1_marksmen.position = 8;
    state.combat!.units.unit_p2_dread_knights.position = 13;
    let result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    // The centre took its hit immediately; the over-supply of neighbours opens a pick.
    expect(damage(result, "unit_p2_skeletons")).toBe(1);
    const choice = result.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("area-pick");
    expect(choice.picksRemaining).toBe(2);

    result = applyOk(result, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_marksmen"
    });
    const second = result.pendingChoice;
    expect(second?.type).toBe("ABILITY_TARGET_CHOICE");
    if (second?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    result = applyOk(result, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: second.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(result.pendingChoice).toBeNull();
    expect(damage(result, "unit_p1_marksmen")).toBe(1);
    expect(damage(result, "unit_p2_vampires")).toBe(1);
    expect(damage(result, "unit_p2_dread_knights")).toBe(0); // the spared neighbour
  });

  it("IV shuffles the PRIOR discard into the deck first, then discards itself and draws", () => {
    const state = meteorState(["specialty.deemer.4"]);
    state.players.p1.discard = ["stat.attack", "stat.defense"];
    state.players.p1.deck = [];
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.4",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    // Shuffle runs FIRST on the prior discard (attack/defense → the empty deck);
    // the Meteor Shower IV card is discarded AFTER, so it stays in the discard and
    // is never swept back into the deck (nor drawable this play).
    expect(result.players.p1.discard).toEqual(["specialty.deemer.4"]);
    expect(result.players.p1.deck).not.toContain("specialty.deemer.4");
    expect(result.players.p1.hand).not.toContain("specialty.deemer.4");
    // The two prior-discard cards split between deck (1) and the drawn hand (1).
    expect(result.players.p1.hand).toHaveLength(1);
    expect(["stat.attack", "stat.defense"]).toContain(result.players.p1.hand[0]);
    expect(result.players.p1.deck).toHaveLength(1);
    expect(
      result.eventLog.some((event) => event.type === "CARDS_DRAWN" && event.playerId === "p1" && event.count === 1)
    ).toBe(true);
  });

  it("IV offers its +1 Power side as a reaction while you cast a spell", () => {
    const state = meteorState(["specialty.deemer.4", "spell.magic_arrow"]);
    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    const offered = (cast.reactionWindow?.legalReactions.p1 ?? []).some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.deemer.4" &&
        legal.action.optionIndex === 1
    );
    expect(offered, "Meteor Shower IV's +1 Power should boost a spell you cast").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Adelaide's Frost Ring SPECIALTY — fixed damage, NOT power-scaled
// ---------------------------------------------------------------------------

describe("Adelaide's Frost Ring specialty is fixed damage (not buffed by spell power)", () => {
  // Two cards named "Frost Ring" diverge by design: the SPELL (spell.frost_ring)
  // and Deemer's Meteor Shower scale with the Power brought (the book/Power
  // table), but Adelaide's Frost Ring SPECIALTY prints "Discard 1 card … suffer 1
  // damage" — a FLAT discard of ANY card for a FIXED amount, no book/Power table.
  // This guards that the engine's power computation short-circuits on a fixed
  // `amount` and never lets a standing buff inflate the specialty's damage.
  function meteorState(hand: string[]): GameState {
    const state = createInitialGameState("adelaide-frost-seed");
    state.players.p1.hand = [...hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    for (const [id, position] of [
      ["unit_p1_griffins", 0],
      ["unit_p2_skeletons", 9],
      ["unit_p2_vampires", 10]
    ] as const) {
      const unit = state.combat!.units[id];
      unit.position = position;
      unit.damage = 0;
      unit.maxHealth = 20;
      unit.abilities = [];
    }
    return state;
  }

  it("deals its fixed 1 damage even with a standing +1 spell power (Pandora's)", () => {
    const state = meteorState(["specialty.adelaide.1", "stat.attack"]);
    state.players.p1.permanents = ["pandora.power_or_morale"]; // +1 standing Power
    const result = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.adelaide.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "space", position: 9 }, // rings 9; vampires(10) is adjacent
      costCardIds: ["stat.attack"] // any card pays the discard-1 cost
    });
    // Adjacent unit takes the FIXED 1 — the +1 standing buff does NOT raise it to 2.
    expect(damage(result, "unit_p2_vampires")).toBe(1);
    // Frost Ring rings the centre and spares it.
    expect(damage(result, "unit_p2_skeletons")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deemer hero registration
// ---------------------------------------------------------------------------

describe("Deemer is a registered Dungeon Warlock", () => {
  it("is in the hero roster with the Meteor Shower specialty cards", () => {
    const deemer = coreHeroDefinitions.deemer;
    expect(deemer).toBeTruthy();
    expect(deemer.faction).toBe("dungeon");
    expect(deemer.type).toBe("magic");
    expect(deemer.startingStats).toEqual({ attack: 0, defense: 0, power: 3, knowledge: 2 });
    expect(deemer.startingAbilityCardId).toBe("ability.scouting");
    expect(deemer.specialtyCardIds).toEqual({
      1: "specialty.deemer.1",
      4: "specialty.deemer.4",
      6: "specialty.deemer.6"
    });
  });

  it("is selectable in the Dungeon faction, and its specialties are implemented", () => {
    expect(coreFactionDefinitions.dungeon.heroes).toContain("deemer");
    for (const level of [1, 4, 6] as const) {
      const card = adventureCards[`specialty.deemer.${level}`];
      expect(card, `specialty.deemer.${level} should exist`).toBeTruthy();
      expect(card.implementationStatus).toBe("implemented");
      expect(card.tags).not.toContain("needs-implementation");
    }
  });
});

// ---------------------------------------------------------------------------
// Fireball — verification of "select 2 adjacent spaces"
// ---------------------------------------------------------------------------

describe("Fireball (2 adjacent spaces)", () => {
  it("still works with no adjacent second unit", () => {
    let state = createInitialGameState("fireball-one-target");
    state.players.p1.hand = ["spell.fireball"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unitId of Object.keys(state.combat!.units)) {
      if (unitId !== "unit_p1_griffins" && unitId !== "unit_p2_skeletons") {
        delete state.combat!.units[unitId];
      }
    }
    state.combat!.units.unit_p1_griffins.position = 0;
    state.combat!.units.unit_p2_skeletons.position = 9;
    state.combat!.units.unit_p2_skeletons.maxHealth = 20;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.fireball" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons",
    );
    expect(cast).toBeTruthy();
    state = passAllReactions(applyOk(state, cast!.action));
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(state.pendingChoice).toBeNull();
  });

  it("centres on a unit (an occupied space) and splashes one adjacent unit", () => {
    let state = createInitialGameState("fireball-seed");
    state.players.p1.hand = ["spell.fireball"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.combat!.units.unit_p1_griffins.position = 0;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    const vampires = state.combat!.units.unit_p2_vampires;
    skeletons.position = 9;
    skeletons.damage = 0;
    skeletons.maxHealth = 20;
    skeletons.abilities = [];
    vampires.position = 10; // adjacent to 9
    vampires.damage = 0;
    vampires.maxHealth = 20;
    vampires.abilities = [];

    // The occupied space (the skeletons at 9) is a legal Fireball target.
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.fireball" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Fireball should target the occupied space (a unit)").toBeTruthy();
    state = passAllReactions(applyOk(state, cast!.action));

    // The target took the hit; a second-space (adjacent unit) splash is offered.
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("spell-splash");
    expect(choice.candidateUnitIds).toContain("unit_p2_vampires");

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    // Both units on the two adjacent spaces took the damage.
    expect(damage(state, "unit_p2_vampires")).toBe(1);
  });
});
