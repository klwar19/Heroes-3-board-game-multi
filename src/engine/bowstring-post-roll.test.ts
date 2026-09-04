import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getLegalReactionsForTrigger,
} from "./index";
import type { GameAction, GameState } from "./state";

const BOWSTRING = "artifact.bowstring_of_the_unicorns_mane";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(
    result.errors,
    result.errors.map((error) => error.message).join("; "),
  ).toEqual([]);
  return result.state;
}

function passToPostRoll(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (
    safety-- > 0 &&
    current.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED"
  ) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (safety-- > 0 && current.reactionWindow) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

function declareRangedAttack(
  seed: string,
  rolls: number[],
  { adjacent = false, bowOwner = "p1" as "p1" | "p2" } = {},
): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.type = "ranged";
  attacker.attack = 5;
  attacker.position = 9;
  attacker.abilities = adjacent ? [] : ["ignore-all-combat-penalties"];
  defender.position = adjacent ? 13 : 14;
  defender.defense = 1;
  defender.maxHealth = 40;
  defender.damage = 0;
  defender.abilities = [];
  state.players.p1.hand = bowOwner === "p1" ? [BOWSTRING] : [];
  state.players.p2.hand = bowOwner === "p2" ? [BOWSTRING] : [];
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
}

function bowstringOffer(state: GameState, dieIndex = 0) {
  return (state.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === BOWSTRING &&
      legal.action.optionIndex === 1 &&
      legal.action.dieIndex === dieIndex,
  );
}

describe("Bowstring of the Unicorn's Mane — post-roll die ignore", () => {
  it("opens an instant window for the ranged attacker after the roll", () => {
    const atRoll = passToPostRoll(
      declareRangedAttack("bowstring-post-roll-window", [-1]),
    );

    expect(atRoll.reactionWindow?.triggerEvent.type).toBe(
      "ATTACK_DIE_SETTLED",
    );
    expect(
      atRoll.reactionWindow?.triggerEvent.type === "ATTACK_DIE_SETTLED" &&
        atRoll.reactionWindow.triggerEvent.rolls,
    ).toEqual([-1]);
    const offer = bowstringOffer(atRoll);
    expect(offer).toBeTruthy();
    expect(
      offer?.action.type === "PLAY_REACTION" && offer.action.dieIndex,
    ).toBe(0);
  });

  it("treats an ignored lone die as 0", () => {
    const atRoll = passToPostRoll(
      declareRangedAttack("bowstring-ignore-one", [-1]),
    );
    const offer = bowstringOffer(atRoll, 0);
    expect(offer).toBeTruthy();

    const after = settle(applyOk(atRoll, offer!.action));
    // 5 Attack + ignored die (0) - 1 Defense = 4. The raw -1 would deal 3.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(after.players.p1.hand).not.toContain(BOWSTRING);
  });

  it("removes the least useful face when two dice were rolled", () => {
    // Adjacent ranged attacks roll with disadvantage. Ignoring the -1 leaves
    // the +1 die, rather than zeroing the entire two-die roll.
    const atRoll = passToPostRoll(
      declareRangedAttack("bowstring-ignore-one-of-two", [1, -1], {
        adjacent: true,
      }),
    );
    const offers = (atRoll.reactionWindow?.legalReactions.p1 ?? []).filter(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === BOWSTRING &&
        legal.action.optionIndex === 1,
    );
    expect(
      offers.map((legal) =>
        legal.action.type === "PLAY_REACTION" ? legal.action.dieIndex : null,
      ),
    ).toEqual([0, 1]);
    const offer = bowstringOffer(atRoll, 1);
    expect(offer).toBeTruthy();
    expect(
      atRoll.reactionWindow?.triggerEvent.type === "ATTACK_DIE_SETTLED" &&
        atRoll.reactionWindow.triggerEvent.rolls,
    ).toEqual([1, -1]);

    const after = settle(applyOk(atRoll, offer!.action));
    // 5 Attack + remaining +1 - 1 Defense = 5.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(5);
    const roll = [...after.eventLog]
      .reverse()
      .find(
        (event) =>
          event.type === "ATTACK_ROLLED" &&
          event.attackerId === "unit_p1_griffins",
      );
    expect(roll?.type === "ATTACK_ROLLED" && roll.roll).toBe(1);
  });

  it("honors choosing the +1 die instead of automatically removing the -1", () => {
    const atRoll = passToPostRoll(
      declareRangedAttack("bowstring-player-picks-positive", [1, -1], {
        adjacent: true,
      }),
    );
    const ignorePositive = bowstringOffer(atRoll, 0);
    expect(ignorePositive).toBeTruthy();

    const after = settle(applyOk(atRoll, ignorePositive!.action));
    // The player deliberately ignored die 1 (+1), leaving die 2 (-1):
    // 5 Attack - 1 - 1 Defense = 3.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(3);
    const roll = [...after.eventLog]
      .reverse()
      .find(
        (event) =>
          event.type === "ATTACK_ROLLED" &&
          event.attackerId === "unit_p1_griffins",
      );
    expect(roll?.type === "ATTACK_ROLLED" && roll.roll).toBe(-1);
  });

  it("is not offered to the defender or for a non-ranged attacker", () => {
    const wrongOwner = settle(
      passToPostRoll(
        declareRangedAttack("bowstring-defender-cannot-use", [0], {
          bowOwner: "p2",
        }),
      ),
    );
    expect(wrongOwner.players.p2.hand).toContain(BOWSTRING);

    const ground = createInitialGameState("bowstring-ground-cannot-use");
    const attacker = ground.combat!.units.unit_p1_griffins;
    const defender = ground.combat!.units.unit_p2_skeletons;
    attacker.type = "ground";
    ground.players.p1.hand = [BOWSTRING];
    ground.players.p2.hand = [];
    const offers = getLegalReactionsForTrigger(ground, {
      id: "ground-die-probe",
      type: "ATTACK_DIE_SETTLED",
      attackerId: attacker.id,
      defenderId: defender.id,
      rolls: [0],
      roll: 0,
    });
    expect(
      (offers.p1 ?? []).some(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === BOWSTRING,
      ),
    ).toBe(false);
  });
});
