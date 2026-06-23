import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "./index";
import { resolveVisitStep } from "./adventure-reducer";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import type { PlayerId, VisitStep } from "./state";

// Scholar is a CHOOSE_ONE. Basic (map): take 1 card from the discard pile into
// hand. Expert (map): "Remove up to 2 Statistic cards from your hand or discard
// pile, take up to 2 different Empowered Statistic cards on top of your discard
// pile, then Remove the Scholar." The engine swaps each removed Statistic for
// its own-type Empowered version (distinct types only).

function makeGame(): GameState {
  return createAdventureGameState({ seed: "scholar", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function ready(): GameState {
  const game = makeGame();
  // The start-of-turn draw only exists from a player's second turn on.
  return (game.players.p1.needsHandRefresh || game.players.p1.canMulligan)
    ? apply(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : game;
}

function scholarPlay(state: GameState, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "ability.scholar" &&
      legal.action.optionIndex === optionIndex
  );
}

/** Resolves the front visit-step CHOOSE_ONE by matching label (mutates state). */
function chooseStep(state: GameState, playerId: PlayerId, match: (label: string) => boolean): void {
  const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined;
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`Expected a CHOOSE_ONE visit step, got ${step?.type ?? "none"}`);
  }
  const optionIndex = step.options.findIndex((option) => match(option.label));
  if (optionIndex < 0) {
    throw new Error(`No option matched among: ${step.options.map((option) => option.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
}

// ===========================================================================
// Card definition — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("Scholar card definition", () => {
  it("is an implemented CHOOSE_ONE: basic discard-pick + expert Empowered-Statistic swap", () => {
    const card = cardLibrary["ability.scholar"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    // The old honest stub note must be gone now that the swap actually runs.
    expect(card.tags.join(" ")).not.toContain("not implemented");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      return;
    }
    expect(card.effect.options).toHaveLength(2);

    const basic = card.effect.options[0];
    expect(basic.effect.type).toBe("TAKE_FROM_DISCARD");
    // House rule: the basic side is usable on the map AND during Combat, so it
    // is no longer map-only and carries the allowInCombat flag.
    expect(basic.mapOnly).toBeFalsy();
    if (basic.effect.type === "TAKE_FROM_DISCARD") {
      expect(basic.effect.allowInCombat).toBe(true);
    }

    const expert = card.effect.options[1];
    expect(expert.expertOnly).toBe(true);
    expect(expert.mapOnly).toBe(true);
    expect(expert.cost?.removeSelf).toBe(true); // "Remove the Scholar"
    expect(expert.effect.type).toBe("SCHOLAR_EMPOWER_SWAP");
    if (expert.effect.type === "SCHOLAR_EMPOWER_SWAP") {
      expect(expert.effect.count).toBe(2);
    }
  });

  it("is reachable in real games — included in the ability decks", () => {
    expect(abilityDeckLegacy).toContain("ability.scholar");
    expect(abilityDeckBinh).toContain("ability.scholar");
  });
});

// ===========================================================================
// Basic side — still takes a card from the discard pile (regression guard)
// ===========================================================================

describe("Scholar basic — take a card from the discard pile", () => {
  it("opens a discard-pick and pulls the chosen card into hand", () => {
    let state = ready();
    state.players.p1.hand = ["ability.scholar"];
    state.players.p1.discard = ["spell.magic_arrow"];

    const play = scholarPlay(state, 0);
    expect(play, "the basic Scholar play should be offered on the map").toBeTruthy();
    state = apply(state, play!.action);

    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("discard-pick");
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });

    expect(state.players.p1.hand).toContain("spell.magic_arrow");
    expect(state.players.p1.discard).not.toContain("spell.magic_arrow");
    // The Scholar card itself went to the discard (basic side does not remove it).
    expect(state.players.p1.discard).toContain("ability.scholar");
  });
});

// ===========================================================================
// Basic side — HOUSE RULE: usable during Combat too
// ===========================================================================

describe("Scholar basic — usable during Combat", () => {
  it("opens the discard pick mid-fight and pulls the card into hand, combat still live", () => {
    const state = createInitialGameState("scholar-combat");
    state.players.p1.hand = ["ability.scholar"];
    state.players.p1.discard = ["spell.magic_arrow"];

    // It is p1's combat turn; the basic side is offered in the combat context.
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.scholar" &&
        legal.action.optionIndex === 0
    );
    expect(play, "Scholar basic should be offered during combat").toBeTruthy();

    // The reward queue is parked during combat — playing it must open the pick
    // immediately (not silently queue it for after the battle).
    const afterPlay = apply(state, play!.action);
    const choice = afterPlay.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("discard-pick");
    expect(afterPlay.combat, "combat must still be live").toBeTruthy();

    const afterPick = apply(afterPlay, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });

    expect(afterPick.players.p1.hand).toContain("spell.magic_arrow");
    expect(afterPick.players.p1.discard).not.toContain("spell.magic_arrow");
    // The Scholar itself is spent to the discard (basic side does not remove it).
    expect(afterPick.players.p1.discard).toContain("ability.scholar");
    // Control: the resolution returned to combat, not the map.
    expect(afterPick.combat).toBeTruthy();
    expect(afterPick.phase).toBe("combat");
  });

  it("is NOT silently lost — without the combat path the card would be unreachable", () => {
    // A sibling TAKE_FROM_DISCARD card WITHOUT allowInCombat is still map-only:
    // it is never offered in combat (the control proving allowInCombat is the
    // switch that lifts the gate).
    const state = createInitialGameState("scholar-combat-control");
    state.players.p1.hand = ["artifact.crown_of_dragontooth"]; // option 0 = TAKE_FROM_DISCARD, no allowInCombat
    state.players.p1.discard = ["spell.magic_arrow", "spell.bloodlust"];
    const offered = getLegalActions(state, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.crown_of_dragontooth" &&
        legal.action.optionIndex === 0
    );
    expect(offered).toBe(false);
  });
});

// ===========================================================================
// Expert side — swap Statistic cards for their Empowered versions
// ===========================================================================

describe("Scholar expert — Empowered-Statistic swap", () => {
  it("swaps a hand and a discard Statistic for Empowered ones on top of discard, and removes the Scholar", () => {
    let state = ready();
    state.players.p1.hand = ["ability.scholar", "stat.attack"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    const play = scholarPlay(state, 1);
    expect(play, "the expert swap should be offered with a Statistic card and a free crown").toBeTruthy();
    expect(play!.action.type === "PLAY_CARD" && play!.action.mode).toBe("expert");

    state = apply(state, play!.action);

    // The Scholar card is removed (not discarded) and one expert use is spent.
    expect(state.players.p1.removed).toContain("ability.scholar");
    expect(state.players.p1.hand).not.toContain("ability.scholar");
    expect(state.players.p1.discard).not.toContain("ability.scholar");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    // First swap: empower the hand Attack card.
    chooseStep(state, "p1", (label) => label === "Empower Attack (from hand)");
    expect(state.players.p1.hand).not.toContain("stat.attack");
    expect(state.players.p1.removed).toContain("stat.attack");

    // Second swap: empower the discard Defense card.
    chooseStep(state, "p1", (label) => label === "Empower Defense (from discard)");

    // Both Empowered cards sit on top of the discard pile; originals are gone.
    expect(state.players.p1.discard).toContain("stat.attack.empowered");
    expect(state.players.p1.discard).toContain("stat.defense.empowered");
    expect(state.players.p1.discard).not.toContain("stat.defense");
    expect(state.players.p1.removed).toContain("stat.defense");
    // The swap is finished (no lingering visit).
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("stops after one swap when the player chooses Done", () => {
    let state = ready();
    state.players.p1.hand = ["ability.scholar", "stat.power", "stat.knowledge"];
    state.players.p1.discard = [];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    state = apply(state, scholarPlay(state, 1)!.action);
    chooseStep(state, "p1", (label) => label === "Empower Power (from hand)");
    // A second swap is offered (Knowledge); decline it.
    chooseStep(state, "p1", (label) => label === "Done");

    expect(state.players.p1.discard).toContain("stat.power.empowered");
    expect(state.players.p1.discard).not.toContain("stat.knowledge.empowered");
    expect(state.players.p1.hand).toContain("stat.knowledge"); // untouched
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("never grants two of the same Empowered type (up to 2 DIFFERENT)", () => {
    let state = ready();
    state.players.p1.hand = ["ability.scholar", "stat.attack", "stat.attack"];
    state.players.p1.discard = [];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    state = apply(state, scholarPlay(state, 1)!.action);
    // Only one "Empower Attack" option despite two Attack cards.
    const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "CHOOSE_ONE" }>;
    const attackOptions = step.options.filter((option) => option.label.startsWith("Empower Attack"));
    expect(attackOptions).toHaveLength(1);

    chooseStep(state, "p1", (label) => label === "Empower Attack (from hand)");

    // Taking Empowered Attack closes the swap — the second Attack cannot be
    // turned into a duplicate Empowered Attack, so no further choice is offered.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.players.p1.discard.filter((id) => id === "stat.attack.empowered")).toHaveLength(1);
    expect(state.players.p1.hand).toContain("stat.attack"); // the second copy stays
  });

  it("does not offer the expert swap without a Statistic card to trade in", () => {
    const state = ready();
    state.players.p1.hand = ["ability.scholar"]; // no statistic cards
    state.players.p1.discard = [];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    expect(scholarPlay(state, 1)).toBeFalsy();
  });

  it("does not offer the expert swap with no expert use available (but the basic stays)", () => {
    const state = ready();
    state.players.p1.hand = ["ability.scholar", "stat.attack"];
    state.players.p1.discard = ["spell.magic_arrow"]; // something to take with the basic
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    expect(scholarPlay(state, 1)).toBeFalsy(); // expert needs a crown
    expect(scholarPlay(state, 0)).toBeTruthy(); // basic needs no crown
  });
});
