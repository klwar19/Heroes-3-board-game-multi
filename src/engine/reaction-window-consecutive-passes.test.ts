import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction, createInitialGameState, getLegalActions, getPlayerView } from "./index";
import { chooseComputerAction } from "./computer/policy";
import type { CardId, GameAction, GameState, LegalAction, PlayerId } from "./state";

/**
 * USER RULE 2026-08-22 — "Reaction window: only end when both sides press pass
 * one after another. So if one passes and the other plays a card, [the first]
 * can still react again."
 *
 * WHAT WAS ALREADY TRUE. `passReaction` closes a window only once EVERY allowed
 * player sits in `passedPlayerIds`, and `advanceReactionWindowAfterPlay` empties
 * that set after every card play — so for a PLAY_CARD / PLAY_REACTION the set has
 * always meant "passes SINCE THE LAST PLAY" and priority really does come back
 * round. The first three tests below pin that (it had no dedicated coverage).
 *
 * WHAT WAS BROKEN. Five NON-card in-window plays called
 * `refreshReactionWindowLegalReactions` DIRECTLY, and that helper KEEPS the pass
 * set (it only drops players who lost their offers): the Morale spend, a Town
 * cube spend, the Hall of Valhalla boost, Crag Hack's Offense VI card→attack
 * conversion and Basic X Magic's expert +3 Power. An opponent who had already
 * passed therefore never got to answer one of those, and the actor's own pass
 * closed the window. They now share ONE seam, `noteReactionWindowPlay`.
 *
 * Every claim is mutation-checked; the reverting line is named per test.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** The plain (basic-mode) reaction offer for a card. */
function reaction(state: GameState, playerId: PlayerId, cardId: CardId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      legal.action.mode === "basic"
  );
}

/** Crag Hack's Offense VI conversion offer for a held card. */
function convert(state: GameState, playerId: PlayerId, cardId: CardId) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "CONVERT_CARD_TO_ATTACK" && legal.action.cardId === cardId
  );
}

function pass(state: GameState, playerId: PlayerId): GameState {
  return applyOk(state, { type: "PASS_REACTION", playerId });
}

/** Drain whatever is left of the window so the parked attack resolves. */
function drain(state: GameState): GameState {
  let next = state;
  for (let guard = 0; next.reactionWindow && guard < 20; guard += 1) {
    next = pass(next, next.reactionWindow.priorityPlayerId);
  }
  expect(next.reactionWindow, "the window closed — the table is not frozen").toBeNull();
  return next;
}

const declareAttack: GameAction = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_griffins",
  defenderId: "unit_p2_skeletons"
};

/**
 * p1's Griffins (Attack 4) are about to hit p2's Skeletons (Defense 0, 40 HP)
 * with scripted "+0" dice, so the blow's damage IS the running attack/defense
 * arithmetic — every reaction played into the window moves it by exactly 1.
 *
 * p1 holds Crag Hack's Offense VI, whose aura turns any held card into a "+1
 * attack instead" CONVERT_CARD_TO_ATTACK reaction — one of the five non-card
 * in-window plays this suite is about.
 */
function auraBoard(seed: string, p2Hand: CardId[]): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["specialty.crag_hack.6", "stat.attack", "stat.power"];
  state.players.p2.hand = [...p2Hand];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";

  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.abilities = [];
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 4;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 40;
  defender.damage = 0;
  state.combat!.dice.scriptedRolls = new Array(12).fill(0);
  state.combat!.dice.rollCount = 0;

  const aura = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.crag_hack.6"
  );
  expect(aura, "Offense VI is playable in combat").toBeTruthy();
  return applyOk(state, aura!.action);
}

function skeletonDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons.damage;
}

// ===========================================================================
// (a) THE CORE SCENARIO — the five non-card plays clear the standing pass
// ===========================================================================

describe("a reaction window ends only on CONSECUTIVE passes", () => {
  it("p1's card→attack conversion re-opens p1's already-passed opponent's priority", () => {
    // Fails if noteReactionWindowPlay's CONVERT_CARD_TO_ATTACK site goes back to
    // a bare refreshReactionWindowLegalReactions (which KEEPS passedPlayerIds):
    // p2's earlier pass then still stands, p1's pass closes the window and p2's
    // second Defense card never lands — 4 damage instead of 3.
    let state = applyOk(auraBoard("consec-core", ["stat.defense", "stat.defense", "stat.defense"]), declareAttack);
    expect(state.reactionWindow, "the declared attack opened a window").toBeTruthy();
    expect(state.reactionWindow!.allowedPlayerIds).toEqual(expect.arrayContaining(["p1", "p2"]));

    // p1 (the attacker/initiator) leads and passes.
    state = pass(state, "p1");
    expect(state.reactionWindow!.priorityPlayerId, "priority moved to the defender").toBe("p2");
    expect(state.reactionWindow!.passedPlayerIds).toEqual(["p1"]);

    // p2 answers with a Defense card — which clears p1's standing pass.
    state = applyOk(state, reaction(state, "p2", "stat.defense")!.action);
    expect(state.reactionWindow!.passedPlayerIds, "the play wiped every standing pass").toEqual([]);

    // p2 is done, so priority comes back to p1 — the rule, from p1's side.
    state = pass(state, "p2");
    expect(state.reactionWindow!.priorityPlayerId, "the passed player gets another look").toBe("p1");

    // THE FIXED HALF: p1 answers with a NON-card in-window play (Offense VI's
    // conversion). Before the fix this left p2 flagged as passed.
    state = applyOk(state, convert(state, "p1", "stat.attack")!.action);
    expect(state.players.p1.discard, "the converted card was spent").toContain("stat.attack");
    expect(
      state.reactionWindow!.passedPlayerIds,
      "a NON-card play clears the standing pass exactly like a card play"
    ).toEqual([]);

    // …so when p1 finally passes, p2 gets to answer the conversion.
    state = pass(state, "p1");
    expect(state.reactionWindow, "the window did NOT close on p1's lone pass").toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p2");

    const second = reaction(state, "p2", "stat.defense");
    expect(second, "p2's second Defense card is reachable — the previously unreachable play").toBeTruthy();
    state = applyOk(state, second!.action);

    // Both sides now pass one after another → the window closes and the parked
    // attack resolves: 4 (+1 conversion) − 2 Defense = 3.
    state = pass(state, "p2");
    expect(state.reactionWindow, "one pass is not enough").toBeTruthy();
    state = pass(state, "p1");
    expect(state.reactionWindow, "two consecutive passes closed it").toBeNull();
    expect(state.stack, "the parked attack resolved").toEqual([]);
    expect(skeletonDamage(state), "attack 4 +1 conversion − 2 Defense").toBe(3);
  });

  it("CONTROL: pass, pass ⇒ the window closes exactly as before", () => {
    // The simple path is unchanged by the fix: two consecutive passes with no
    // play in between still close the window on the second one.
    let state = applyOk(auraBoard("consec-control", ["stat.defense"]), declareAttack);
    state = pass(state, "p1");
    expect(state.reactionWindow, "one pass leaves the window open for the other side").toBeTruthy();
    state = pass(state, "p2");
    expect(state.reactionWindow, "the second consecutive pass closed it").toBeNull();
    expect(skeletonDamage(state), "a plain attack, nothing played").toBe(4);
  });

  it("CONTROL: a side with NOTHING playable never holds the window open", () => {
    // p2's hand is empty, so p2 is not an allowed reactor at all: p1's own pass
    // is the only one needed and the attack resolves. This is the anti-stall
    // half of the rule — re-granting priority can never wait on an empty hand.
    let state = applyOk(auraBoard("consec-empty", []), declareAttack);
    expect(state.reactionWindow!.allowedPlayerIds, "only p1 can react").toEqual(["p1"]);
    state = applyOk(state, convert(state, "p1", "stat.attack")!.action);
    expect(state.reactionWindow, "p1 keeps the window to convert again").toBeTruthy();
    state = pass(state, "p1");
    expect(state.reactionWindow, "nobody else to wait for").toBeNull();
    expect(skeletonDamage(state), "attack 4 +1 conversion").toBe(5);
  });

  it("a spent source is NOT re-offered when priority comes back round", () => {
    // Fails if the re-granted priority served a STALE offer list: the converted
    // copy left the hand, so only the OTHER card may still be converted.
    let state = applyOk(auraBoard("consec-spent", ["stat.defense", "stat.defense"]), declareAttack);
    state = applyOk(state, convert(state, "p1", "stat.attack")!.action);
    state = pass(state, "p1");
    state = applyOk(state, reaction(state, "p2", "stat.defense")!.action);
    state = pass(state, "p2");
    expect(state.reactionWindow!.priorityPlayerId, "priority is back with p1").toBe("p1");
    expect(convert(state, "p1", "stat.attack"), "the spent copy is gone from the offers").toBeFalsy();
    expect(convert(state, "p1", "stat.power"), "the unspent card is still convertible").toBeTruthy();
    state = drain(state);
    expect(skeletonDamage(state), "attack 4 +1 conversion − 1 Defense").toBe(4);
  });

  it("a computer opponent is asked again after every play and the exchange still terminates", () => {
    // Anti-stall: the human keeps converting, the AI keeps being handed the
    // re-opened priority, and the loop terminates because every play spends a
    // card. Fails if a re-granted priority ever left the AI with NO action to
    // take (the frozen-table shape) or if the exchange never closed.
    let state = applyOk(auraBoard("consec-ai", ["stat.defense", "stat.defense"]), declareAttack);
    let convertNext = true;
    let humanPlays = 0;
    let aiTurns = 0;
    let guard = 0;
    for (; state.reactionWindow && guard < 30; guard += 1) {
      const priority = state.reactionWindow.priorityPlayerId;
      if (priority === "p1") {
        // Convert ONE card, then pass — so the AI really is handed the
        // re-opened priority once per conversion.
        const play: LegalAction | undefined = convertNext
          ? convert(state, "p1", "stat.attack") ?? convert(state, "p1", "stat.power")
          : undefined;
        state = play ? applyOk(state, play.action) : pass(state, "p1");
        humanPlays += play ? 1 : 0;
        convertNext = !play;
        continue;
      }
      const chosen = chooseComputerAction({
        playerId: "p2",
        state: getPlayerView(state, "p2"),
        legalActions: getLegalActions(state, "p2")
      });
      expect(chosen, "the AI always has an answer while it holds priority").toBeTruthy();
      aiTurns += 1;
      state = applyOk(state, chosen!.action);
    }
    expect(guard, "the exchange terminated well inside the guard").toBeLessThan(30);
    expect(state.reactionWindow, "the window closed").toBeNull();
    expect(humanPlays, "both conversions landed").toBe(2);
    expect(aiTurns, "the AI was handed priority again after each conversion").toBeGreaterThanOrEqual(2);
    // Attack 4, +2 from the two conversions, minus the AI's Defense answers.
    expect(skeletonDamage(state), "the AI really did answer both conversions").toBe(2);
  });
});

// ===========================================================================
// (e) A PAUSED window (area-pick) resumes under the same rule
// ===========================================================================

describe("a window paused by an area-pick keeps the consecutive-pass rule", () => {
  /** Griffins(8) attack Skeletons(9); the meteor centre has 3 living neighbours. */
  function meteorBoard(): GameState {
    const state = createInitialGameState("consec-meteor");
    state.players.p1.hand = ["specialty.deemer.6", "stat.attack"];
    state.players.p2.hand = ["stat.defense", "stat.defense", "stat.defense"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const [id, position] of [
      ["unit_p1_griffins", 8],
      ["unit_p1_marksmen", 0],
      ["unit_p1_crusaders", 1],
      ["unit_p2_skeletons", 9],
      ["unit_p2_vampires", 10],
      ["unit_p2_dread_knights", 13]
    ] as const) {
      const unit = state.combat!.units[id];
      unit.position = position;
      unit.damage = 0;
      unit.maxHealth = 30;
      unit.abilities = [];
    }
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.type = "ground";
    griffins.attack = 4;
    griffins.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.defense = 0;
    state.combat!.dice.scriptedRolls = new Array(12).fill(0);
    state.combat!.dice.rollCount = 0;
    return state;
  }

  it("p1's paused-then-resumed Meteor Shower still clears p2's standing pass", () => {
    // Fails if advanceReactionWindowAfterPlay stops emptying passedPlayerIds
    // (either in its pendingChoice PAUSE branch or in its main tail): p2's pass
    // then survives the blast and the window closes on p1's pass, so p2's second
    // Defense card never lands.
    let state = applyOk(meteorBoard(), declareAttack);
    expect(state.reactionWindow, "the declared attack opened a window").toBeTruthy();

    // p2 answers first with one Defense card, then passes; priority to p1.
    state = pass(state, "p1");
    state = applyOk(state, reaction(state, "p2", "stat.defense")!.action);
    state = pass(state, "p2");
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");
    expect(state.reactionWindow!.passedPlayerIds, "p2's pass is standing").toEqual(["p2"]);

    // p1 fires Meteor Shower INSIDE the window: 3 neighbours > 2 picks, so the
    // area-pick opens and PAUSES the window.
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(state.pendingChoice?.type, "the 2nd/3rd-target pick opened").toBe("ABILITY_TARGET_CHOICE");
    expect(state.reactionWindow, "the window is paused, not closed").toBeTruthy();
    expect(state.reactionWindow!.passedPlayerIds, "the pause already wiped the standing pass").toEqual([]);

    for (const targetUnitId of ["unit_p2_vampires", "unit_p2_dread_knights"]) {
      const choice = state.pendingChoice;
      expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
      state = applyOk(state, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: choice!.id,
        targetUnitId
      });
    }
    expect(state.pendingChoice, "the pick chain completed").toBeNull();
    expect(state.reactionWindow, "the window RESUMED").toBeTruthy();

    // p1 passes → p2 gets another look and spends the second Defense card.
    state = pass(state, "p1");
    expect(state.reactionWindow!.priorityPlayerId, "the resumed window came back to p2").toBe("p2");
    const second = reaction(state, "p2", "stat.defense");
    expect(second, "p2 may answer the blast").toBeTruthy();
    state = applyOk(state, second!.action);
    state = pass(state, "p2");
    state = pass(state, "p1");

    expect(state.reactionWindow, "consecutive passes closed it").toBeNull();
    expect(state.pendingChoice).toBeNull();
    // The blast's 1 damage plus the attack's 4 − 2 Defense = 1 + 2 = 3.
    expect(state.combat!.units.unit_p2_skeletons.damage, "blast 1 + attack (4 − 2 Defense)").toBe(3);
  });
});

// ===========================================================================
// Registry hygiene — the other four sites share the SAME seam
// ===========================================================================

describe("no dispatcher case bypasses the consecutive-pass seam", () => {
  /**
   * HONEST LABEL: this is a SOURCE check, not a behaviour check — the effect of
   * the seam is pinned above through CONVERT_CARD_TO_ATTACK, the one of the five
   * sites that is scriptable in a two-line combat fixture. Its four siblings
   * (SPEND_MORALE, SPEND_TOWN_CUBE, HALL_OF_VALHALLA_BOOST,
   * USE_SCHOOL_FETCH_EXPERT, USE_SCHOOL_PERMANENT_EXPERT) run the identical code path, and this sweep is what
   * keeps a NEW in-window action from quietly re-introducing the bare
   * `refreshReactionWindowLegalReactions` that kept an opponent's pass standing.
   */
  it("applyAction's switch routes every in-window play through noteReactionWindowPlay", () => {
    const source = readFileSync(new URL("./reducer.ts", import.meta.url), "utf8");
    const dispatcher = source.slice(source.indexOf("function applyAction"));
    expect(dispatcher.length, "the dispatcher was located").toBeGreaterThan(0);
    expect(
      dispatcher.includes("refreshReactionWindowLegalReactions(nextState, cards)"),
      "a dispatcher case calls the bare refresh — use noteReactionWindowPlay so the play clears the opponent's standing pass"
    ).toBe(false);
    expect(
      (dispatcher.match(/noteReactionWindowPlay\(nextState, action\.playerId, cards\)/g) ?? []).length,
      "the six non-card in-window plays share the seam"
    ).toBe(6);
  });
});
