import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getLegalReactionsForTrigger } from "./legal-actions";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Knowledge / Mysticism recall for spell INSTANTS played as reactions into an
 * attack window (Stone Skin, Bloodlust, Curse, …). The cast-window recall
 * (CAST_SPELL → SPELL_CAST_STARTED window) has always worked; these pin the
 * attack-window path: a spell played via PLAY_REACTION never opens a cast
 * window, so the recall is offered inside the SAME attack window instead.
 * Every test asserts the observable game outcome (card zones, the damage the
 * attack actually deals), not just bookkeeping.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passPriority(state: GameState): GameState {
  const playerId = state.reactionWindow?.priorityPlayerId;
  if (!playerId) {
    throw new Error("Expected an open reaction window.");
  }
  return applyOk(state, { type: "PASS_REACTION", playerId });
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  while (current.reactionWindow) {
    current = passPriority(current);
  }
  return current;
}

function scriptDice(state: GameState, rolls: number[]): void {
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }
  state.combat.dice.scriptedRolls = rolls;
  state.combat.dice.rollCount = 0;
}

/** Declares the Griffins → Vampires attack with the die scripted to 0. */
function declareAttack(state: GameState): GameState {
  scriptDice(state, [0]);
  const moved = applyOk(state, {
    type: "MOVE_UNIT",
    playerId: "p1",
    unitId: "unit_p1_griffins",
    destination: 10
  });
  return applyOk(moved, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

function knowledgeOffers(state: GameState, playerId: PlayerId): GameAction[] {
  return getLegalActions(state, playerId)
    .filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.knowledge"
    )
    .map((legal) => legal.action);
}

describe("Knowledge recall of a spell instant played into an attack window", () => {
  it("returns the just-played Stone Skin to hand while its defense boost still applies", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.stone_skin", "stat.knowledge", "stat.knowledge"];

    const declared = declareAttack(state);
    // CONTROL: before any spell is played into the attack, Knowledge is not
    // offered (its printed trigger is the cast window, not the attack).
    expect(knowledgeOffers(declared, "p2")).toEqual([]);

    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    // The spell instant makes Knowledge legal in the SAME window, basic and
    // expert alike (p2 still holds crowns).
    const offers = knowledgeOffers(buffed, "p2");
    expect(offers.some((action) => action.type === "PLAY_REACTION" && action.mode === "basic")).toBe(true);
    expect(offers.some((action) => action.type === "PLAY_REACTION" && action.mode === "expert")).toBe(true);

    const recalled = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    // Stone Skin came straight back ("instead of discarding it"); Knowledge
    // itself is spent. The basic play raises no spell limit.
    expect(recalled.players.p2.hand).toContain("spell.stone_skin");
    expect(recalled.players.p2.discard).not.toContain("spell.stone_skin");
    expect(recalled.players.p2.discard).toContain("stat.knowledge");
    expect(recalled.players.p2.combatStats.spellLimitBonusThisRound).toBe(0);

    // The recall is consumed: the SECOND held Knowledge copy is no longer
    // offered (nothing of p2's is left to take back).
    expect(knowledgeOffers(recalled, "p2")).toEqual([]);

    // The attack resolves with Stone Skin's +1 defense still applied:
    // Griffins 3 + roll 0 vs Vampires 1 + 1 = damage 1 (2 without the spell).
    const resolved = passAllReactions(recalled);
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(1);
    // The recalled copy survived combat resolution in hand.
    expect(resolved.players.p2.hand).toContain("spell.stone_skin");
  });

  it("expert Knowledge raises the spell limit so the recalled Stone Skin can be cast AGAIN into the same attack", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.stone_skin", "stat.knowledge"];

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    const recalled = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "expert"
    });
    expect(recalled.players.p2.hand).toContain("spell.stone_skin");
    expect(recalled.players.p2.combatStats.spellLimitBonusThisRound).toBe(1);
    expect(recalled.players.p2.combatStats.expertUsesSpentThisRound).toBe(1);

    // The raised limit lets the SAME physical card be cast a second time.
    const rebuffed = applyOk(recalled, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    const resolved = passAllReactions(rebuffed);
    // Two Stone Skins: Griffins 3 + roll 0 vs Vampires 1 + 1 + 1 → no damage.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(0);
    // The second cast stays in the discard pile (no second recall was played).
    expect(resolved.players.p2.discard).toContain("spell.stone_skin");
  });

  it("never offers Knowledge to the player who cast NO spell into the attack", () => {
    const state = createInitialGameState();
    // The attacker holds Knowledge but casts nothing; the defender casts.
    // The defender's spare Defense statistic keeps the window open after the
    // spell play so the attacker's offers can be inspected.
    state.players.p1.hand = ["stat.knowledge"];
    state.players.p2.hand = ["spell.stone_skin", "stat.defense"];

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });

    const trigger = buffed.reactionWindow?.triggerEvent;
    expect(trigger).toBeTruthy();
    const reactions = getLegalReactionsForTrigger(buffed, trigger!);
    const p1Knowledge = (reactions.p1 ?? []).filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.knowledge"
    );
    expect(p1Knowledge, "the attacker cast no spell — nothing to take back").toEqual([]);
  });

  it("rejects a forged Knowledge reaction when no own spell is on the attack", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["stat.knowledge", "stat.defense"];

    const declared = declareAttack(state);
    const result = applyAction(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    expect(result.errors.length).toBeGreaterThan(0);
    // Nothing moved: Knowledge stays in hand.
    expect(result.state.players.p2.hand).toContain("stat.knowledge");
  });
});
