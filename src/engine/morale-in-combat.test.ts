import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function moraleActions(state: GameState, playerId: string) {
  return getLegalActions(state, playerId).filter((l) => l.action.type === "SPEND_MORALE");
}

describe("morale during combat (combat sandbox)", () => {
  it("offers the draw and discard-redraw morale plays to a combat participant who holds a token", () => {
    const state = createInitialGameState("morale-combat-offer");
    state.players.p1.morale = 1;
    state.players.p1.hand = ["stat.attack", "stat.defense"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    const offers = moraleActions(state, "p1");
    const benefits = offers.map((l) => (l.action as { benefit?: string }).benefit);
    expect(benefits).toContain("draw");
    expect(benefits).toContain("redraw");
  });

  it("spends the token to draw a card in combat", () => {
    let state = createInitialGameState("morale-combat-draw");
    state.players.p1.morale = 1;
    state.players.p1.hand = [];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    state = applyOk(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "draw" });
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.hand.length).toBe(1);
  });

  it("can draw and play a defense instant before the retaliation die is rolled", () => {
    let state = createInitialGameState("morale-retaliation-draw");
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    for (const unit of Object.values(state.combat!.units)) {
      unit.abilities = [];
    }
    griffins.type = "ground";
    griffins.position = 9;
    griffins.attack = 1;
    griffins.defense = 0;
    griffins.maxHealth = 40;
    griffins.damage = 0;
    skeletons.position = 13;
    skeletons.attack = 5;
    skeletons.defense = 0;
    skeletons.maxHealth = 40;
    skeletons.damage = 0;
    skeletons.retaliatedThisRound = false;
    state.players.p1.morale = 1;
    state.players.p1.hand = [];
    // Personal-deck top is the final entry. Armorer itself then draws Attack.
    state.players.p1.deck = ["stat.attack", "ability.armorer"];
    state.players.p2.hand = [];
    state.combat!.dice.scriptedRolls = [0, 0];
    state.combat!.dice.rollCount = 0;
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });

    // Resolve the original attack's window. The engine then opens a fresh
    // UNIT_ATTACK_DECLARED window for the Skeletons' retaliation, before roll 2.
    let safety = 30;
    while (safety-- > 0) {
      if (
        state.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
        state.reactionWindow.triggerEvent.isRetaliation
      ) {
        break;
      }
      if (state.reactionWindow) {
        state = applyOk(state, {
          type: "PASS_REACTION",
          playerId: state.reactionWindow.priorityPlayerId
        });
        continue;
      }
      if (state.pendingChoice?.type === "ATTACK_DIE_REROLL") {
        const choice = state.pendingChoice;
        state = applyOk(state, {
          type: "CHOOSE_PENDING_ROLL",
          playerId: choice.playerId,
          choiceId: choice.id,
          candidateIndex: choice.candidates.length - 1
        });
        continue;
      }
      break;
    }
    expect(
      state.eventLog
        .filter((event) => event.type === "UNIT_ATTACK_DECLARED")
        .map((event) => ({
          attackerId: event.attackerId,
          defenderId: event.defenderId,
          isRetaliation: event.isRetaliation,
          attackKind: event.attackKind
        }))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attackerId: "unit_p2_skeletons",
          defenderId: "unit_p1_griffins",
          isRetaliation: true
        })
      ])
    );
    expect(state.reactionWindow?.triggerEvent).toMatchObject({
      type: "UNIT_ATTACK_DECLARED",
      isRetaliation: true,
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    expect(state.combat!.dice.rollCount).toBe(1);

    // The retaliating side may receive priority first. Pass only until the
    // defending player can spend the token; do not close the retaliation window.
    while (state.reactionWindow && state.reactionWindow.priorityPlayerId !== "p1") {
      state = applyOk(state, {
        type: "PASS_REACTION",
        playerId: state.reactionWindow.priorityPlayerId
      });
    }
    const draws = moraleActions(state, "p1").filter(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "draw"
    );
    // Exactly ONE draw offer (the addMoraleActions one) — never a second
    // look-alike retaliation-specific button beside it.
    expect(draws).toHaveLength(1);
    const draw = draws[0];
    state = applyOk(state, draw!.action);

    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.hand).toContain("ability.armorer");
    expect(state.reactionWindow?.triggerEvent).toMatchObject({
      type: "UNIT_ATTACK_DECLARED",
      isRetaliation: true
    });
    expect(state.combat!.dice.rollCount).toBe(1);

    const armorer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "ability.armorer" &&
        legal.action.mode === "basic"
    );
    expect(armorer, "the newly drawn Armorer must be playable in the same retaliation window").toBeTruthy();
    state = applyOk(state, armorer!.action);
    while (state.reactionWindow) {
      state = applyOk(state, {
        type: "PASS_REACTION",
        playerId: state.reactionWindow.priorityPlayerId
      });
    }

    const retaliation = [...state.eventLog]
      .reverse()
      .find(
        (event) =>
          event.type === "ATTACK_ROLLED" &&
          event.isRetaliation &&
          event.attackerId === "unit_p2_skeletons"
      );
    expect(retaliation).toMatchObject({ type: "ATTACK_ROLLED", defenseBonus: 1 });
    expect(state.players.p1.discard).toContain("ability.armorer");
    expect(state.players.p1.hand).toContain("stat.attack");
  });

  it("discards chosen cards and redraws that many in combat", () => {
    let state = createInitialGameState("morale-combat-redraw");
    state.players.p1.morale = 1;
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.deck = ["stat.defense", "stat.power"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    state = applyOk(state, {
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "redraw",
      discardCardIds: ["stat.attack"]
    });
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.discard).toContain("stat.attack");
    expect(state.players.p1.hand.length).toBe(1);
  });

  it("offers the morale token as an attack-die reroll source in combat", () => {
    let state = createInitialGameState("morale-combat-reroll");
    state.players.p1.morale = 1;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9; // adjacent to skeletons
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 1, -1];

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });

    // A reroll choice opens, listing the morale token as a source.
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") {
      return;
    }
    expect(choice.rerollSources.some((s) => s.morale)).toBe(true);

    const reroll = getLegalActions(state, "p1").find((l) => l.action.type === "REROLL_PENDING_CHOICE");
    expect(reroll, "a morale reroll should be offered").toBeTruthy();
    state = applyOk(state, reroll!.action);
    // Taking the reroll spends the morale token.
    expect(state.players.p1.morale).toBe(0);
  });
});
