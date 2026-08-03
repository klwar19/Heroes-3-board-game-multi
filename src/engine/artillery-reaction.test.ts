import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Artillery (basic) played as an INSTANT REACTION the moment one of your units
 * is attacked — the ballista shot (1 damage to the slowest enemy) resolves in
 * the open attack window, BEFORE the exchange (and that unit's counter-attack).
 *
 * Every assertion fails if the reaction wiring is removed (CLAUDE.md #1): the
 * offer added to the UNIT_ATTACK_DECLARED window for the attacked side, and the
 * DAMAGE_LOWEST_INITIATIVE_ENEMY resolution on the reaction path.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** p2's Skeletons (the slowest enemy) attack p1's Crusaders; p1 holds Artillery. */
function attackWithArtilleryInHand(handArtillery = true): GameState {
  const state = createInitialGameState("artillery-reaction");
  state.players.p1.hand = handArtillery ? ["ability.artillery"] : [];
  state.players.p2.hand = [];

  const units = state.combat!.units;
  units.unit_p1_crusaders.position = 14;
  const attacker = units.unit_p2_skeletons;
  attacker.position = 13; // adjacent to 14
  attacker.initiative = 1; // the SLOWEST enemy → Artillery's forced target
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  units.unit_p2_vampires.initiative = 9;
  units.unit_p2_dread_knights.initiative = 9;

  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  return state;
}

function artilleryOffer(state: GameState, playerId: "p1" | "p2") {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.artillery"
  );
}

describe("Artillery (basic) — instant reaction when your unit is attacked", () => {
  it("offers Artillery to the attacked unit's owner; without the card there is no offer (CONTROL)", () => {
    const declared = applyOk(attackWithArtilleryInHand(true), {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    expect(declared.reactionWindow, "the declared attack opened a reaction window").toBeTruthy();

    const offer = artilleryOffer(declared, "p1");
    expect(offer, "p1 may fire Artillery in response to the attack").toBeTruthy();
    expect(offer!.action.type === "PLAY_REACTION" && offer!.action.target).toEqual({
      type: "unit",
      unitId: "unit_p2_skeletons" // the slowest enemy
    });

    // CONTROL: with Artillery not in hand, the offer is absent.
    const declaredNoCard = applyOk(attackWithArtilleryInHand(false), {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    expect(artilleryOffer(declaredNoCard, "p1")).toBeUndefined();
  });

  it("firing it deals 1 damage to the slowest enemy, and it lands BEFORE the incoming hit", () => {
    const state = attackWithArtilleryInHand(true);
    // Make the incoming Skeletons hit a deterministic 4 (attack 4, defence 0, +0 die).
    state.combat!.units.unit_p2_skeletons.attack = 4;
    state.combat!.units.unit_p1_crusaders.defense = 0;
    state.combat!.units.unit_p1_crusaders.maxHealth = 12; // survives the 4 so it stays on the board
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    expect(declared.combat!.units.unit_p2_skeletons.damage, "no damage yet").toBe(0);
    expect(declared.combat!.units.unit_p1_crusaders.damage, "the attack has not landed yet").toBe(0);

    const offer = artilleryOffer(declared, "p1");
    const fired = applyOk(declared, offer!.action);

    // The slowest enemy took exactly 1 effect damage from the Artillery shot…
    expect(fired.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // …and the card is spent (no second free shot from the same copy).
    expect(fired.players.p1.hand).not.toContain("ability.artillery");

    // The window then closed and the Skeletons' attack resolved (crusaders +4),
    // but the Artillery shot was logged FIRST — it fired before the hit landed.
    expect(fired.combat!.units.unit_p1_crusaders.damage).toBe(4);
    const artilleryIdx = fired.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === "ability.artillery" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p2_skeletons"
    );
    const hitIdx = fired.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p1_crusaders"
    );
    expect(artilleryIdx, "the Artillery shot must carry its card source (for FX/sound)").toBeGreaterThanOrEqual(0);
    expect(hitIdx, "the incoming hit resolved after the window").toBeGreaterThan(artilleryIdx);
  });

  it("a shot that KILLS the attacker cancels its parked blow (no attack from beyond the grave)", () => {
    // The attacker is a FEW side at 1 remaining HP with a huge Attack: the
    // Artillery shot removes it inside the window, and the parked attack must
    // be dropped — mirroring the pre-emptive-retaliation rule ("unless the
    // counter felled the attacker, in which case its blow is cancelled").
    const state = attackWithArtilleryInHand(true);
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.variant = "few";
    attacker.damage = attacker.maxHealth - 1;
    attacker.attack = 10; // would flip the Crusaders if the corpse's blow landed

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    const fired = applyOk(declared, artilleryOffer(declared, "p1")!.action);

    expect(fired.combat!.units.unit_p2_skeletons.damage, "the shot removed the attacker").toBeGreaterThanOrEqual(
      fired.combat!.units.unit_p2_skeletons.maxHealth
    );
    expect(fired.combat!.units.unit_p1_crusaders.damage, "the dead attacker's blow is cancelled").toBe(0);
    expect(fired.stack, "the parked attack was dropped, not left stuck").toEqual([]);
    expect(fired.reactionWindow).toBeNull();

    // CONTROL: the same shot on a healthy attacker leaves the exchange intact —
    // the blow still lands (the mid-window kill, not the shot itself, cancels).
    const healthy = attackWithArtilleryInHand(true);
    healthy.combat!.units.unit_p2_skeletons.attack = 10;
    healthy.combat!.units.unit_p1_crusaders.maxHealth = 20;
    const healthyDeclared = applyOk(healthy, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    const healthyFired = applyOk(healthyDeclared, artilleryOffer(healthyDeclared, "p1")!.action);
    expect(healthyFired.combat!.units.unit_p1_crusaders.damage, "a surviving attacker's blow lands").toBeGreaterThan(0);
  });
});
