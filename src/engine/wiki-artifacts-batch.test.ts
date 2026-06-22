import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { makeActiveEffect } from "./active-effects";
import { placeCombatToken } from "./tokens";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine coverage for the artifacts imported from the fan wiki in this batch.
 * Every test drives the real card through the engine and fails if the wiring is
 * removed — no decorative entries.
 *
 *   • Endless Purse of Gold (Major) — gain 3 gold, or remove the card and
 *     discard 2 to gain 8.
 *   • The four elemental Orbs (Major) — option A doubles the Power of the
 *     owner's spells of one School for the Combat; option B removes the Orb for
 *     a flat +5 Power on a matching cast.
 *   • Pendant of Second Sight (Major) — option A makes a unit immune to
 *     Paralysis for the Combat (blocking the Blind Spell); option B strips a
 *     Paralysis token already on a unit.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findCast(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function hasParalysis(state: GameState, unitId: UnitId): boolean {
  return (state.combat?.units[unitId]?.tokens ?? []).some((token) => token.kind === "paralysis");
}

function findPlay(state: GameState, cardId: string, optionIndex: number, targetUnitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      (targetUnitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId))
  );
}

// ---------------------------------------------------------------------------
// Endless Purse of Gold
// ---------------------------------------------------------------------------

describe("Endless Purse of Gold", () => {
  function purseState(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    return state;
  }

  it("option A gains 3 gold and discards the card", () => {
    const state = purseState("purse-three");
    state.players.p1.hand = ["artifact.endless_purse_of_gold"];
    state.players.p1.discard = [];
    state.players.p1.resources.gold = 0;

    const play = findPlay(state, "artifact.endless_purse_of_gold", 0);
    expect(play, "gain-3-gold option should be offered on the map").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(after.players.p1.resources.gold).toBe(3);
    expect(after.players.p1.discard).toContain("artifact.endless_purse_of_gold");
    expect(after.players.p1.hand).not.toContain("artifact.endless_purse_of_gold");
  });

  it("option B removes the card and discards 2 cards to gain 8 gold", () => {
    const state = purseState("purse-eight");
    state.players.p1.hand = ["artifact.endless_purse_of_gold", "stat.attack", "stat.defense"];
    state.players.p1.discard = [];
    state.players.p1.removed = [];
    state.players.p1.resources.gold = 0;

    const play = findPlay(state, "artifact.endless_purse_of_gold", 1);
    expect(play, "remove-and-discard-2 option should be offered").toBeTruthy();
    const action = play!.action;
    if (action.type !== "PLAY_CARD") {
      throw new Error("expected a PLAY_CARD action");
    }
    const after = applyOk(state, { ...action, costCardIds: ["stat.attack", "stat.defense"] });

    expect(after.players.p1.resources.gold).toBe(8);
    // The Purse leaves the game (removed), not the discard pile.
    expect(after.players.p1.removed).toContain("artifact.endless_purse_of_gold");
    expect(after.players.p1.discard).not.toContain("artifact.endless_purse_of_gold");
    // The two paid cards went to the discard pile; the hand is empty.
    expect(after.players.p1.discard).toContain("stat.attack");
    expect(after.players.p1.discard).toContain("stat.defense");
    expect(after.players.p1.hand).toHaveLength(0);
  });

  it("requires exactly 2 paid cards for option B", () => {
    const state = purseState("purse-underpay");
    state.players.p1.hand = ["artifact.endless_purse_of_gold", "stat.attack", "stat.defense"];
    state.players.p1.resources.gold = 0;
    const play = findPlay(state, "artifact.endless_purse_of_gold", 1);
    const action = play!.action;
    if (action.type !== "PLAY_CARD") {
      throw new Error("expected a PLAY_CARD action");
    }
    // Underpaying (one card) is rejected and the gold never changes.
    const result = applyAction(state, { ...action, costCardIds: ["stat.attack"] });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.players.p1.resources.gold).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Elemental Orbs — Power doubling (option A) and the +5 Power removal (option B)
// ---------------------------------------------------------------------------

const FIRMAMENT = "artifact.orb_of_the_firmament"; // Air
const DRIVING_RAIN = "artifact.orb_of_driving_rain"; // Water

function orbCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.maxHealth = 30;
  target.damage = 0;
  return state;
}

// Lightning Bolt (Air): amountByPower { 0: 2, 1: 3, 2: 4 }. The two spare Power
// statistics keep p1's Empower window open so the cast waits on the stack while
// the test sets the Power actually paid (the Chain Lightning / Blind pattern).
function castBoltDamage(seed: string, orbSchool: "air" | "water" | null, paidPower: number): number {
  const state = orbCombat(seed);
  state.players.p1.hand = ["spell.lightning_bolt", "stat.power", "stat.power"];
  if (orbSchool) {
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Elemental Orb",
          scope: "player",
          duration: { type: "combat" },
          modifiers: [{ type: "SPELL_POWER_DOUBLE", school: orbSchool }]
        },
        { type: "card", cardId: orbSchool === "air" ? FIRMAMENT : DRIVING_RAIN, controllerId: "p1" },
        "p1"
      )
    );
  }
  const cast = findCast(state, "spell.lightning_bolt", "unit_p2_skeletons");
  expect(cast, "Lightning Bolt should be a legal cast").toBeTruthy();
  const casted = applyOk(state, cast!.action);
  casted.stack[0]!.modifiers.spellPowerBonus = paidPower;
  return passAllReactions(casted).combat!.units.unit_p2_skeletons.damage;
}

describe("Elemental Orbs — double Power (option A)", () => {
  it("playing option A creates the School-scoped doubling effect for the Combat", () => {
    const state = orbCombat("orb-play-a");
    state.players.p1.hand = [FIRMAMENT];
    const playA = findPlay(state, FIRMAMENT, 0);
    expect(playA, "Orb option A should be a legal combat play").toBeTruthy();
    const after = applyOk(state, playA!.action);
    const doubling = after.activeEffects.find((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "SPELL_POWER_DOUBLE" && modifier.school === "air")
    );
    expect(doubling, "an Air SPELL_POWER_DOUBLE effect should be created").toBeTruthy();
    expect(doubling!.duration).toEqual({ type: "combat" });
  });

  it("control: Lightning Bolt at Power 1 deals 3 with no Orb in play", () => {
    expect(castBoltDamage("orb-control", null, 1)).toBe(3);
  });

  it("Orb of the Firmament doubles Air-spell Power (1 → 2): 4 damage", () => {
    expect(castBoltDamage("orb-air-double", "air", 1)).toBe(4);
  });

  it("a non-matching Orb (Water) leaves an Air spell's Power alone: 3 damage", () => {
    expect(castBoltDamage("orb-mismatch", "water", 1)).toBe(3);
  });
});

describe("Elemental Orbs — remove for +5 Power (option B)", () => {
  it("is offered toward a matching-School cast, boosts its Power, and removes the Orb", () => {
    const state = orbCombat("orb-b-air");
    state.players.p1.hand = ["spell.lightning_bolt", FIRMAMENT];
    state.players.p1.removed = [];

    const cast = findCast(state, "spell.lightning_bolt", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    const optionB = (casted.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === FIRMAMENT && legal.action.optionIndex === 1
    );
    expect(optionB, "Orb option B should be offered toward an Air cast").toBeTruthy();
    const after = passAllReactions(applyOk(casted, optionB!.action));

    // Lightning Bolt at Power 0 deals 2; the +5 lifts it past the Power-2
    // breakpoint to its capped 4 damage.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(after.players.p1.removed).toContain(FIRMAMENT);
    expect(after.players.p1.hand).not.toContain(FIRMAMENT);
  });

  it("control: Lightning Bolt at Power 0 deals 2 without the Orb boost", () => {
    const state = orbCombat("orb-b-control");
    state.players.p1.hand = ["spell.lightning_bolt"];
    const cast = findCast(state, "spell.lightning_bolt", "unit_p2_skeletons");
    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("is NOT offered toward a spell of another School", () => {
    const state = orbCombat("orb-b-fire");
    // Blind is a Fire spell; the two Power statistics open p1's own Empower
    // window, where the Air Orb's +5 would appear if it (wrongly) qualified.
    state.players.p1.hand = ["spell.blind", FIRMAMENT, "stat.power", "stat.power"];
    state.combat!.units.unit_p2_skeletons.grade = "bronze";

    const cast = findCast(state, "spell.blind", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    const optionB = (casted.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === FIRMAMENT && legal.action.optionIndex === 1
    );
    expect(optionB, "the Air Orb must not empower a Fire spell").toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Pendant of Second Sight
// ---------------------------------------------------------------------------

const PENDANT = "artifact.pendant_of_second_sight";

describe("Pendant of Second Sight", () => {
  function pendantCombat(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  // p1 casts Blind on the skeletons; the helper optionally grants the skeletons
  // the Pendant immunity first, so the same cast is tested with and without it.
  function blindOnSkeletons(seed: string, immune: boolean): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.blind"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.grade = "bronze"; // Power 0 paralyses bronze

    if (immune) {
      state.activeEffects.push(
        makeActiveEffect(
          state,
          {
            name: "Pendant of Second Sight",
            scope: "unit",
            duration: { type: "combat" },
            polarity: "positive",
            modifiers: [{ type: "PARALYSIS_IMMUNITY" }]
          },
          { type: "card", cardId: PENDANT, controllerId: "p2" },
          "p2",
          { type: "unit", unitId: "unit_p2_skeletons" }
        )
      );
    }

    const cast = findCast(state, "spell.blind", "unit_p2_skeletons");
    expect(cast, "Blind should be a legal cast on the skeletons").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("option A places a combat-long Paralysis immunity on the selected friendly unit", () => {
    const state = pendantCombat("pendant-immunity-create");
    state.players.p1.hand = [PENDANT];

    const play = findPlay(state, PENDANT, 0, "unit_p1_marksmen");
    expect(play, "Pendant option A should target a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);

    const immunity = after.activeEffects.find((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "PARALYSIS_IMMUNITY")
    );
    expect(immunity, "a PARALYSIS_IMMUNITY effect should be created").toBeTruthy();
    expect(immunity!.target).toEqual({ type: "unit", unitId: "unit_p1_marksmen" });
    expect(immunity!.duration).toEqual({ type: "combat" });
  });

  it("the immunity blocks the Blind Spell (control: Blind paralyses without it)", () => {
    const control = blindOnSkeletons("pendant-blind-control", false);
    expect(hasParalysis(control, "unit_p2_skeletons")).toBe(true);

    const immune = blindOnSkeletons("pendant-blind-immune", true);
    expect(hasParalysis(immune, "unit_p2_skeletons")).toBe(false);
  });

  it("option B removes a Paralysis token already on the selected unit", () => {
    const state = pendantCombat("pendant-remove-token");
    placeCombatToken(state, state.combat!.units.unit_p1_marksmen, "paralysis", 0, "test setup");
    expect(hasParalysis(state, "unit_p1_marksmen")).toBe(true);

    state.players.p1.hand = [PENDANT];
    state.players.p1.discard = [];
    const play = findPlay(state, PENDANT, 1, "unit_p1_marksmen");
    expect(play, "Pendant option B should target a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(hasParalysis(after, "unit_p1_marksmen")).toBe(false);
    expect(after.players.p1.discard).toContain(PENDANT);
  });
});
