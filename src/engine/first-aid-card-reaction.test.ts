import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { applyPermanentCombatEffects } from "./permanents";
import type { GameAction, GameState } from "./state";

/**
 * First Aid as an INSTANT reaction to an enemy attack — resolved BEFORE the
 * incoming hit is calculated, so mending an existing wound can let a unit
 * survive a blow that would otherwise defeat it. Three things are covered, each
 * with a control that fails if the wiring is removed (CLAUDE.md #1/#1a):
 *
 *  1. The First Aid ability CARD (basic side) played straight from hand as a
 *     reaction — available even WITHOUT a First Aid Tent in play.
 *  2. The First Aid Tent's EXPERT volley offered as a reaction (Tent + card + crown).
 *  3. The expert volley resolves against the SAME target every time — the
 *     follow-up heals can only land on the unit the first expert heal mended.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** p2's Skeletons stand adjacent to p1's wounded Crusaders and are set to attack. */
function attackOnWoundedFriendly(): GameState {
  const state = createInitialGameState("first-aid-card-reaction");
  state.players.p1.hand = [];
  state.players.p2.hand = [];

  const units = state.combat!.units;
  const target = units.unit_p1_crusaders;
  target.maxHealth = 6;
  target.damage = 2;
  target.position = 14;
  const attacker = units.unit_p2_skeletons;
  attacker.position = 13;
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;

  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  return state;
}

function declareAttack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: "unit_p2_skeletons",
    defenderId: "unit_p1_crusaders"
  });
}

describe("First Aid ability CARD — instant heal when attacked (no Tent needed)", () => {
  it("offers the defender the basic card heal as a reaction to the enemy attack", () => {
    const state = attackOnWoundedFriendly();
    state.players.p1.hand = ["ability.first_aid"]; // card in hand, NO Tent in play
    const declared = declareAttack(state);

    expect(declared.reactionWindow, "the declared attack opened a reaction window").toBeTruthy();
    expect(declared.combat!.units.unit_p1_crusaders.damage, "no attack damage applied yet").toBe(2);

    const heal = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "ability.first_aid" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(heal, "p1 may play First Aid (basic) from hand in response to the attack").toBeTruthy();
  });

  it("CONTROL: with no First Aid card in hand, no such reaction is offered", () => {
    const state = attackOnWoundedFriendly();
    state.players.p1.hand = []; // neither card nor Tent
    const declared = declareAttack(state);

    const heal = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.first_aid"
    );
    expect(heal, "without the card there is nothing to react with").toBeUndefined();
  });

  it("heals BEFORE the hit so the Crusaders survive a blow that would otherwise kill them, and spends the card", () => {
    const state = attackOnWoundedFriendly();
    state.players.p1.hand = ["ability.first_aid"];
    // Lethal margin: 2 (existing) + 4 = 6 = dead without the heal; 1 + 4 = 5 survives.
    state.combat!.units.unit_p2_skeletons.attack = 4;
    state.combat!.units.unit_p1_crusaders.defense = 0;
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;

    const declared = declareAttack(state);
    const heal = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.first_aid"
    );
    expect(heal).toBeTruthy();
    const healed = applyOk(declared, heal!.action);

    const crusaders = healed.combat!.units.unit_p1_crusaders;
    expect(crusaders.damage).toBe(5); // wound mended 2->1, then the 4 lands => 5/6 alive
    expect(crusaders.damage).toBeLessThan(crusaders.maxHealth);
    // The window closed and the attack resolved (only one card-heal was on offer).
    expect(healed.reactionWindow ?? null).toBeNull();
    // The played card went to the discard pile.
    expect(healed.players.p1.hand).not.toContain("ability.first_aid");
    expect(healed.players.p1.discard).toContain("ability.first_aid");
  });

  it("logs the heal with the card as its source so the cure FX/sound fires", () => {
    const state = attackOnWoundedFriendly();
    state.players.p1.hand = ["ability.first_aid"];
    const declared = declareAttack(state);
    const heal = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.first_aid"
    );
    const healed = applyOk(declared, heal!.action);
    const event = healed.eventLog.find(
      (e) => e.type === "DAMAGE_HEALED" && e.source.type === "card" && e.source.cardId === "ability.first_aid"
    );
    expect(event, "the heal names the First Aid card as its source").toBeTruthy();
  });
});

describe("First Aid Tent EXPERT volley — offered and used as a reaction to an enemy attack", () => {
  function tentCardAndCrown(): GameState {
    const state = attackOnWoundedFriendly();
    state.players.p1.permanents = ["war_machine.first_aid_tent"];
    applyPermanentCombatEffects(state);
    state.players.p1.hand = ["ability.first_aid"];
    state.players.p1.limits.expertUses = 1;
    // Tanky target so it stays wounded across the volley.
    state.combat!.units.unit_p1_crusaders.maxHealth = 8;
    state.combat!.units.unit_p1_crusaders.damage = 4;
    return state;
  }

  it("offers the expert activation in the attack window when the player holds the card with a crown", () => {
    const declared = declareAttack(tentCardAndCrown());
    const expert = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.mode === "expert"
    );
    expect(expert, "the expert volley reacts to an enemy attack via the Tent").toBeTruthy();
  });

  it("CONTROL: with no crown the expert is not offered (only the basic Tent heal is)", () => {
    const state = tentCardAndCrown();
    state.players.p1.limits.expertUses = 0;
    const declared = declareAttack(state);
    const offers = getLegalActions(declared, "p1").filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(offers.some((legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.mode === "expert")).toBe(
      false
    );
    expect(offers.length, "the basic Tent heal is still on offer").toBeGreaterThan(0);
  });

  it("the expert heal lands BEFORE the hit and keeps the reaction window open for the volley", () => {
    const declared = declareAttack(tentCardAndCrown());
    const expert = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.mode === "expert"
    );
    const after = applyOk(declared, expert!.action);

    expect(after.combat!.units.unit_p1_crusaders.damage).toBe(3); // 4 -> 3, before the hit
    expect(after.reactionWindow, "the window stays open so the volley can continue").toBeTruthy();
    // A crown was spent and the card consumed.
    expect(after.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(after.players.p1.hand).not.toContain("ability.first_aid");
  });
});

describe("First Aid expert volley — resolves against the SAME target", () => {
  function tentTwoWounded(): GameState {
    const state = createInitialGameState("first-aid-same-target");
    state.players.p1.hand = ["war_machine.first_aid_tent", "ability.first_aid"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = 2;
    state.combat!.units.unit_p1_crusaders.maxHealth = 8;
    state.combat!.units.unit_p1_crusaders.damage = 4;
    state.combat!.units.unit_p1_griffins.maxHealth = 8;
    state.combat!.units.unit_p1_griffins.damage = 4;
    return applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
  }

  function effectId(state: GameState): string {
    return state.activeEffects.find((e) => e.name === "First Aid Tent")!.id;
  }

  it("after the expert is activated on one unit, only that unit is offered the follow-up heals", () => {
    let state = tentTwoWounded();
    const id = effectId(state);
    state = applyOk(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: id,
      target: { type: "unit", unitId: "unit_p1_crusaders" },
      mode: "expert"
    });

    const continuations = getLegalActions(state, "p1").filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(continuations.length, "a continuation heal is on offer").toBeGreaterThan(0);
    // Every continuation targets the pinned unit (Crusaders), never the other wounded unit.
    for (const legal of continuations) {
      expect(legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.target.type === "unit").toBe(true);
      if (legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.target.type === "unit") {
        expect(legal.action.target.unitId).toBe("unit_p1_crusaders");
      }
    }
    expect(
      continuations.some(
        (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.target.type === "unit" && legal.action.target.unitId === "unit_p1_griffins"
      ),
      "the OTHER wounded unit is never offered the volley's follow-up heal"
    ).toBe(false);
  });

  it("rejects a forged follow-up heal aimed at a different unit, and heals the same target 3x", () => {
    let state = tentTwoWounded();
    const id = effectId(state);
    state = applyOk(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: id,
      target: { type: "unit", unitId: "unit_p1_crusaders" },
      mode: "expert"
    });

    // A forged continuation on the other wounded unit must be rejected.
    const forged = applyAction(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: id,
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    expect(forged.errors.length, "the volley cannot switch targets").toBeGreaterThan(0);
    expect(forged.state.combat!.units.unit_p1_griffins.damage, "the other unit was untouched").toBe(4);

    // The same target keeps healing: 4 -> 3 (expert) -> 2 -> 1 across the 3 heals.
    const heal = () =>
      (state = applyOk(state, {
        type: "USE_ACTIVE_EFFECT",
        playerId: "p1",
        effectId: id,
        target: { type: "unit", unitId: "unit_p1_crusaders" }
      }));
    heal(); // 2nd
    heal(); // 3rd
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(1);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    // The other unit never received any of the volley.
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(4);
  });
});
