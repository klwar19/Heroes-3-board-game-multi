import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

// Castle Halberdiers (Pack) "Parry": "[unit_passive] When the unit is targeted
// by any attack, you can discard a card and ignore the Attack die's roll
// result." Wired as a DEFENDER-side reaction in the post-roll die-cancel window
// (the same window Shield of the Dwarven Lords uses), offered only on a "+1"
// face and only while the controller holds a card to pay the discard cost.

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

/** Pass/resolve every open window until combat is idle. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety-- > 0 && current.reactionWindow) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

type Opts = { p2Hand?: string[]; defenderAbilities?: string[] };

/** Griffins (p1, attack 5) melee a Halberdiers stack (p2, defense 1). */
function declareAttack(seed: string, rolls: number[], opts: Opts = {}): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 5;
  attacker.abilities = [];
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.cardName = "Halberdiers";
  defender.name = "Halberdiers";
  defender.position = 13; // adjacent to 9
  defender.defense = 1;
  defender.maxHealth = 40;
  defender.damage = 0;
  defender.abilities = opts.defenderAbilities ?? ["halberdier-die-ignore"];
  state.players.p1.hand = [];
  state.players.p2.hand = opts.p2Hand ?? ["stat.attack"];
  script(state, rolls);
  setActive(state, "p1", "unit_p1_griffins");
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

function passToDieSettledWindow(state: GameState): GameState {
  let current = state;
  let safety = 12;
  while (
    safety-- > 0 &&
    current.reactionWindow &&
    current.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
  ) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function parryOffer(state: GameState) {
  return (state.reactionWindow?.legalReactions.p2 ?? []).find(
    (legal) => legal.action.type === "USE_UNIT_DIE_IGNORE" && legal.action.defenderUnitId === "unit_p2_skeletons"
  );
}

function parryOfferDiscarding(state: GameState, cardId: string) {
  return (state.reactionWindow?.legalReactions.p2 ?? []).find(
    (legal) => legal.action.type === "USE_UNIT_DIE_IGNORE" && legal.action.discardCardId === cardId
  );
}

function halberdierDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons.damage;
}

describe("Halberdiers Parry — discard a card to ignore the Attack die", () => {
  it("offers the parry to the defender on a '+1' face when it holds a card", () => {
    const atDie = passToDieSettledWindow(declareAttack("halberdier-offer", [1, 0, 0]));
    expect(atDie.reactionWindow?.triggerEvent.type).toBe("ATTACK_DIE_SETTLED");
    expect(parryOffer(atDie), "the parry should be offered").toBeTruthy();
  });

  it("ignoring a '+1' die drops the die bonus (5→4) and spends one card", () => {
    // Control: nobody parries — the +1 lands → 5 attack + 1 − 1 defense = 5.
    const control = settle(passToDieSettledWindow(declareAttack("halberdier-control", [1, 0, 0])));
    expect(halberdierDamage(control)).toBe(5);

    // Parry: discard a card and ignore the die → 5 attack + 0 − 1 defense = 4.
    const atDie = passToDieSettledWindow(declareAttack("halberdier-parry", [1, 0, 0]));
    const parry = parryOffer(atDie);
    expect(parry, "the parry should be offered").toBeTruthy();
    const after = settle(applyOk(atDie, parry!.action));

    expect(halberdierDamage(after)).toBe(4); // the +1 was ignored
    expect(after.players.p2.hand).toHaveLength(0); // the card was the discard cost
    expect(after.reactionWindow).toBeNull();
    expect(
      after.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "halberdier-die-ignore")
    ).toBe(true);
  });

  it("lets the Halberdiers' controller choose which card pays the discard cost", () => {
    const atDie = passToDieSettledWindow(
      declareAttack("halberdier-chosen-discard", [1, 0, 0], {
        p2Hand: ["stat.attack", "stat.defense"]
      })
    );
    expect(parryOfferDiscarding(atDie, "stat.attack")?.label).toContain("Attack");
    const discardDefense = parryOfferDiscarding(atDie, "stat.defense");
    expect(discardDefense?.label).toContain("Defense");

    const after = settle(applyOk(atDie, discardDefense!.action));
    expect(after.players.p2.hand).toEqual(["stat.attack"]);
    expect(after.players.p2.discard).toContain("stat.defense");
    expect(halberdierDamage(after)).toBe(4);
  });

  it("is NOT offered on a non-'+1' face, with no card to discard, or without the ability (controls)", () => {
    // A "0" face: nothing to cancel, no parry (the window need not even open).
    const zeroFace = passToDieSettledWindow(declareAttack("halberdier-zero", [0, 0, 0]));
    expect(parryOffer(zeroFace)).toBeUndefined();

    // A "+1" face but an empty hand: the discard cost cannot be paid.
    const noCard = passToDieSettledWindow(declareAttack("halberdier-nocard", [1, 0, 0], { p2Hand: [] }));
    expect(parryOffer(noCard)).toBeUndefined();

    // A "+1" face, a card in hand, but a plain unit (no ability): never offered.
    const noAbility = passToDieSettledWindow(
      declareAttack("halberdier-noability", [1, 0, 0], { defenderAbilities: [] })
    );
    expect(parryOffer(noAbility)).toBeUndefined();
  });
});
