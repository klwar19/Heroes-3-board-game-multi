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
