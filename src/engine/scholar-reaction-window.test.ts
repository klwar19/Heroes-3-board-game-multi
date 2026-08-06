import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { computerDecisionOwner } from "./computer/window";
import { chooseComputerAction } from "./computer/policy";
import { observeForComputer } from "./computer/observation";
import { nextAfkDropAction, nextTurnTimeoutAction } from "./afk-drop";
import type { GameAction, GameState } from "./state";

/**
 * REPORTED BUG (2026-08-06): "If Scholar is the last card in your hand and you
 * press 'play cards' when attacking/attacked the attack proceeds before you can
 * take a card from the discard pile into hand => WRONG. All draw or
 * take-from-discard-pile cards, when played as reaction: you take another card
 * and the reaction window won't stop there — allow you to keep playing."
 *
 * Root cause: a reaction play that opens a nested pendingChoice (Scholar's
 * TAKE_FROM_DISCARD pick) left the player's hand EMPTY for the moment the pick
 * is open, so advanceReactionWindowAfterPlay re-derived ZERO legal reactions,
 * closed the window "all-pass" and resolved the parked attack UNDER the still-
 * open choice — the taken card landed after the exchange and could never be
 * played into that window.
 *
 * Fix: advanceReactionWindowAfterPlay PAUSES on an open pendingChoice; the
 * CHOOSE_OPTION tail re-derives the window's offers for the picker afterwards.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * p2's Skeletons attack p1's Crusaders (or the mirror), with a deterministic
 * hit of 4 damage. The reacting side holds ONLY the cards in `hand` and has
 * `discard` in its discard pile.
 */
function attackSetup(options: {
  /** Which seat reacts: "p1" is the DEFENDER, "p2" the ATTACKER. */
  reactor: "p1" | "p2";
  hand: string[];
  discard: string[];
}): GameState {
  const state = createInitialGameState("scholar-reaction-window");
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.discard = [];
  state.players.p2.discard = [];
  state.players[options.reactor].hand = [...options.hand];
  state.players[options.reactor].discard = [...options.discard];

  const units = state.combat!.units;
  units.unit_p1_crusaders.position = 14;
  const attacker = units.unit_p2_skeletons;
  attacker.position = 13; // adjacent to 14
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;

  // Deterministic incoming hit: attack 4 vs defense 0 with a 0-face die.
  attacker.attack = 4;
  units.unit_p1_crusaders.defense = 0;
  units.unit_p1_crusaders.maxHealth = 12; // survives so the board state is readable
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;

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

function scholarOffer(state: GameState, playerId: "p1" | "p2", batch: boolean) {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === "ability.scholar"
  );
  if (!legal || legal.action.type !== "PLAY_REACTION") {
    return undefined;
  }
  if (!batch) {
    return legal.action;
  }
  // What the reaction tray's "Play cards" button dispatches for a multi-card
  // batch (overlays.tsx): the same play, wrapped in PLAY_REACTIONS.
  const play: GameAction = {
    type: "PLAY_REACTIONS",
    playerId,
    plays: [
      {
        cardId: legal.action.cardId,
        mode: legal.action.mode ?? "basic",
        ...(legal.action.optionIndex !== undefined ? { optionIndex: legal.action.optionIndex } : {})
      }
    ]
  };
  return play;
}

function crusaderDamage(state: GameState): number {
  return state.combat!.units.unit_p1_crusaders.damage;
}

describe("Scholar as the LAST card in an open attack window (reported bug)", () => {
  for (const batch of [false, true]) {
    const label = batch ? "batch (PLAY_REACTIONS)" : "single (PLAY_REACTION)";

    it(`defender side, ${label}: the attack WAITS for the discard pick`, () => {
      const state = declareAttack(
        attackSetup({ reactor: "p1", hand: ["ability.scholar"], discard: ["ability.offense"] })
      );
      expect(state.reactionWindow, "the declared attack opened a window").toBeTruthy();
      expect(crusaderDamage(state), "the hit has not landed yet").toBe(0);

      const play = scholarOffer(state, "p1", batch);
      expect(play, "p1 may play Scholar into the attack window").toBeTruthy();
      const played = applyOk(state, play!);

      // The pick is open…
      expect(played.pendingChoice?.type, "the discard pick opened").toBe("OPTION_CHOICE");
      // …and the parked attack has NOT resolved under it.
      expect(crusaderDamage(played), "the attack must WAIT for the pick").toBe(0);
      expect(played.reactionWindow, "the window is still open").toBeTruthy();
      expect(played.players.p1.hand, "the taken card is not in hand yet").not.toContain("ability.offense");
    });

    it(`attacker side, ${label}: the attack WAITS for the discard pick`, () => {
      const state = declareAttack(
        attackSetup({ reactor: "p2", hand: ["ability.scholar"], discard: ["ability.offense"] })
      );
      const play = scholarOffer(state, "p2", batch);
      expect(play, "the attacker may play Scholar into their own attack window").toBeTruthy();
      const played = applyOk(state, play!);

      expect(played.pendingChoice?.type, "the discard pick opened").toBe("OPTION_CHOICE");
      expect(crusaderDamage(played), "the attack must WAIT for the pick").toBe(0);
      expect(played.reactionWindow, "the window is still open").toBeTruthy();
    });
  }

  it("KEEP PLAYING: the card taken from the discard is playable into the SAME window", () => {
    // Offense (+1 Attack to your attacking unit, then draw) is a real attacker
    // reaction — so the attacker takes it back with Scholar and plays it into
    // the very window Scholar was played in.
    const state = declareAttack(
      attackSetup({ reactor: "p2", hand: ["ability.scholar"], discard: ["ability.offense"] })
    );
    const played = applyOk(state, scholarOffer(state, "p2", false)!);
    expect(crusaderDamage(played), "still parked").toBe(0);

    // Answer the discard pick: take Offense.
    const pick = played.pendingChoice!;
    expect(pick.type).toBe("OPTION_CHOICE");
    const optionIndex =
      pick.type === "OPTION_CHOICE"
        ? pick.options.findIndex((option) => option.label.toLowerCase().includes("offense"))
        : -1;
    expect(optionIndex, "Offense is offered from the discard pile").toBeGreaterThanOrEqual(0);
    const taken = applyOk(played, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: pick.id, optionIndex });

    expect(taken.players.p2.hand, "Offense is in hand").toContain("ability.offense");
    expect(crusaderDamage(taken), "the attack STILL waits — the window did not stop at the take").toBe(0);
    expect(taken.reactionWindow, "the window is still open").toBeTruthy();
    expect(taken.reactionWindow!.priorityPlayerId, "priority is back with the picker").toBe("p2");

    // …and the just-taken card is offered in that same window and can be played.
    const offense = getLegalActions(taken, "p2").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === "ability.offense"
    );
    expect(offense, "the just-taken Offense is playable into the SAME window").toBeTruthy();
    const boosted = applyOk(taken, offense!.action);

    // The Offense landed BEFORE the hit: the attack resolved for 4 + 1 = 5.
    expect(crusaderDamage(boosted), "+1 Attack from the recovered Offense folded into the parked hit").toBe(5);
  });

  it("a taken card that is NOT playable here: the window advances and the hit lands unchanged", () => {
    // Pathfinding's every printed side is mapOnly — an ABSOLUTE bar on joining
    // a combat window — so taking it back leaves nothing playable here.
    const unplayable = "ability.pathfinding";
    const state = declareAttack(
      attackSetup({ reactor: "p1", hand: ["ability.scholar"], discard: [unplayable] })
    );
    const played = applyOk(state, scholarOffer(state, "p1", false)!);
    const pick = played.pendingChoice!;
    const optionIndex =
      pick.type === "OPTION_CHOICE"
        ? pick.options.findIndex((option) => option.label.toLowerCase().includes("pathfinding"))
        : -1;
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    const taken = applyOk(played, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: pick.id, optionIndex });

    expect(taken.players.p1.hand, "the taken card is in hand").toContain(unplayable);
    // Nothing left to play → the ORIGINAL window closed (the retaliation opens
    // its own) and the attack resolved with the ORIGINAL numbers (4, no buff).
    expect(taken.reactionWindow?.id, "the attack's own window closed").not.toBe(played.reactionWindow!.id);
    expect(crusaderDamage(taken), "the hit landed unchanged").toBe(4);
  });

  it("the PAUSED window is answerable by the AI and the AFK driver (no frozen table)", () => {
    const state = declareAttack(
      attackSetup({ reactor: "p2", hand: ["ability.scholar"], discard: ["ability.offense"] })
    );
    const played = applyOk(state, scholarOffer(state, "p2", false)!);
    expect(played.pendingChoice?.playerId, "p2 owns the paused pick").toBe("p2");

    // The AI driver: a pendingChoice outranks the reaction window in
    // computerDecisionOwner (it must mirror getLegalActions' gate order), so a
    // computer seat holding the paused pick is DRIVEN, never stalled.
    const aiState: GameState = {
      ...played,
      sessionMode: "single-player",
      controllers: {
        p1: { kind: "human" },
        p2: { kind: "computer", difficulty: "standard", policyVersion: 1 }
      }
    };
    expect(computerDecisionOwner(aiState), "the AI owns the paused pick").toBe("p2");
    const decision = chooseComputerAction(observeForComputer(aiState, "p2"));
    expect(decision?.action.type, "the AI answers it instead of stalling").toBe("CHOOSE_OPTION");
    // …and the answer really lands the card and un-pauses the attack.
    const aiAnswered = applyOk(aiState, decision!.action);
    expect(aiAnswered.pendingChoice, "the pick is resolved").toBeFalsy();

    // The AFK / turn-timeout driver: CHOOSE_OPTION is in RESOLVING_ACTION_TYPES
    // and pendingChoice ownership is recognised, so a dropped seat's paused pick
    // is default-answered rather than stranding the parked attack forever.
    // A bare PASS_REACTION would be REJECTED here (a pendingChoice is exclusive
    // in getLegalActions), so a driver that passed first would re-emit a
    // rejected action forever.
    expect(
      applyAction(played, { type: "PASS_REACTION", playerId: "p2" }).errors,
      "passing is illegal while the pick is owed"
    ).not.toEqual([]);
    for (const driver of [nextAfkDropAction, nextTurnTimeoutAction]) {
      const forced = driver(played, "p2");
      expect(forced?.type, `${driver.name} default-answers the paused pick`).toBe("CHOOSE_OPTION");
      const afkAnswered = applyOk(played, forced!);
      expect(afkAnswered.pendingChoice, "the pick is resolved").toBeFalsy();
    }
  });

  it("CONTROL: a plain reaction with no pendingChoice advances the window exactly as before", () => {
    const state = declareAttack(
      attackSetup({ reactor: "p2", hand: ["ability.offense"], discard: [] })
    );
    const offense = getLegalActions(state, "p2").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === "ability.offense"
    );
    expect(offense).toBeTruthy();
    const played = applyOk(state, offense!.action);

    expect(played.pendingChoice, "no nested choice").toBeFalsy();
    // The window ran out of plays, closed, and the buffed hit resolved AT ONCE
    // — one action, no pause (the retaliation opens its own, later window).
    expect(played.reactionWindow?.id, "the attack's own window closed").not.toBe(state.reactionWindow!.id);
    expect(crusaderDamage(played), "4 + 1 Offense").toBe(5);
  });
});
