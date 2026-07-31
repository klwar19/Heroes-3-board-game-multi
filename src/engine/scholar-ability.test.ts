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

// Scholar is a CHOOSE_ONE. Basic (map + combat house rule): take 1 card from
// the discard pile into hand. Expert (map): printed card —
// "Remove up to 2 Statistic cards from your hand or discard pile. Take up to 2
// different Empowered Statistic cards and put them on top of your discard pile.
// Remove the Scholar." The two "up to" phases are independent (remove type ≠
// take type is legal).

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

function withExpert(state: GameState): GameState {
  state.players.p1.limits.expertUses = 2;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  return state;
}

// ===========================================================================
// Card definition — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("Scholar card definition", () => {
  it("is an implemented CHOOSE_ONE: basic discard-pick + expert remove-then-take", () => {
    const card = cardLibrary["ability.scholar"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
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
  it("can recover a card inside an open reaction window, then play that card there", () => {
    const state = createInitialGameState("scholar-reaction");
    state.players.p1.hand = ["ability.scholar"];
    state.players.p1.discard = ["spell.curse"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;

    let declared = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    while (declared.reactionWindow && declared.reactionWindow.priorityPlayerId !== "p1") {
      declared = apply(declared, {
        type: "PASS_REACTION",
        playerId: declared.reactionWindow.priorityPlayerId
      });
    }

    const scholar = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "ability.scholar" &&
        legal.action.mode === "basic"
    );
    expect(scholar, "Scholar should be usable in an open reaction window").toBeTruthy();
    const afterPlay = apply(declared, scholar!.action);
    const choice = afterPlay.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("discard-pick");

    const afterPick = apply(afterPlay, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });
    expect(
      getLegalActions(afterPick, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.curse"
      )
    ).toBe(true);
  });

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

  it("an INSTANT artifact's take-a-card side is also offered in combat (house rule), still gated by a takeable card", () => {
    // House rule: an instant artifact is click-to-use in combat, so its
    // TAKE_FROM_DISCARD side is offered mid-battle even WITHOUT `allowInCombat`
    // (the Scholar ABILITY above still needs allowInCombat — abilities are not
    // instant artifacts). It stays gated by the precondition: nothing takeable,
    // nothing offered.
    const offers = (state: GameState) =>
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "artifact.crown_of_dragontooth" &&
          legal.action.optionIndex === 0
      );

    const withSpell = createInitialGameState("scholar-combat-artifact");
    withSpell.players.p1.hand = ["artifact.crown_of_dragontooth"]; // instant artifact; option 0 = TAKE_FROM_DISCARD (spell)
    withSpell.players.p1.discard = ["spell.magic_arrow", "spell.bloodlust"];
    expect(offers(withSpell), "an instant artifact's take-from-discard is offered in combat").toBe(true);

    // Divergence control: an empty discard has nothing to recover, so the option
    // is not offered even in combat — the precondition still gates it.
    const empty = createInitialGameState("scholar-combat-artifact-empty");
    empty.players.p1.hand = ["artifact.crown_of_dragontooth"];
    empty.players.p1.discard = [];
    expect(offers(empty), "with nothing takeable the option stays hidden").toBe(false);
  });
});

// ===========================================================================
// Expert side — remove Statistics, then take different Empowered ones
// ===========================================================================

/** Labels of the current CHOOSE_ONE options (throws if none). */
function optionLabels(state: GameState): string[] {
  const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined;
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`Expected a CHOOSE_ONE visit step, got ${step?.type ?? "none"}`);
  }
  return step.options.map((option) => option.label);
}

describe("Scholar expert — remove Statistics then take Empowered", () => {
  it("removes stats, then sequential take-any (and removes the Scholar)", () => {
    let state = withExpert(ready());
    state.players.p1.hand = ["ability.scholar", "stat.attack"];
    state.players.p1.discard = ["stat.defense"];

    const play = scholarPlay(state, 1);
    expect(play, "the expert should be offered with a free crown").toBeTruthy();
    expect(play!.action.type === "PLAY_CARD" && play!.action.mode).toBe("expert");

    state = apply(state, play!.action);

    // The Scholar card is removed (not discarded) and one expert use is spent.
    expect(state.players.p1.removed).toContain("ability.scholar");
    expect(state.players.p1.hand).not.toContain("ability.scholar");
    expect(state.players.p1.discard).not.toContain("ability.scholar");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    // Phase 1: remove up to 2 Statistic cards.
    chooseStep(state, "p1", (label) => label === "Remove Attack (from hand)");
    expect(state.players.p1.hand).not.toContain("stat.attack");
    expect(state.players.p1.removed).toContain("stat.attack");

    chooseStep(state, "p1", (label) => label === "Remove Defense (from discard)");
    expect(state.players.p1.discard).not.toContain("stat.defense");
    expect(state.players.p1.removed).toContain("stat.defense");

    // Phase 2 pick 1: ANY of the four Empowered types (including the same types
    // as just removed — "different" only constrains the two takes vs each other).
    expect(optionLabels(state)).toEqual(
      expect.arrayContaining([
        "Empowered Attack",
        "Empowered Defense",
        "Empowered Power",
        "Empowered Knowledge",
        "Done"
      ])
    );
    chooseStep(state, "p1", (label) => label === "Empowered Attack");
    expect(state.players.p1.discard).toContain("stat.attack.empowered");

    // Phase 2 pick 2: any of the other three — not Attack again.
    const second = optionLabels(state);
    expect(second).not.toContain("Empowered Attack");
    expect(second).toEqual(
      expect.arrayContaining(["Empowered Defense", "Empowered Power", "Empowered Knowledge", "Done"])
    );
    chooseStep(state, "p1", (label) => label === "Empowered Power");

    expect(state.players.p1.discard).toContain("stat.attack.empowered");
    expect(state.players.p1.discard).toContain("stat.power.empowered");
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("phase 2: first take any Empowered, second any except the first type", () => {
    let state = withExpert(ready());
    state.players.p1.hand = ["ability.scholar"];
    state.players.p1.discard = [];

    state = apply(state, scholarPlay(state, 1)!.action);
    // No stats to remove → remove phase skips; take opens immediately.
    const first = optionLabels(state);
    expect(first.filter((label) => label.startsWith("Empowered "))).toHaveLength(4);

    chooseStep(state, "p1", (label) => label === "Empowered Knowledge");

    const second = optionLabels(state);
    const empowered = second.filter((label) => label.startsWith("Empowered "));
    expect(empowered).toHaveLength(3);
    expect(empowered).not.toContain("Empowered Knowledge");
    // Any remaining combination is fine — e.g. Defense after Knowledge.
    chooseStep(state, "p1", (label) => label === "Empowered Defense");

    expect(state.players.p1.discard).toEqual(
      expect.arrayContaining(["stat.knowledge.empowered", "stat.defense.empowered"])
    );
    expect(state.players.p1.discard.filter((id) => id.endsWith(".empowered"))).toHaveLength(2);
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("allows Done on remove, then still offers the take phase (and Done after one take)", () => {
    let state = withExpert(ready());
    state.players.p1.hand = ["ability.scholar", "stat.power", "stat.knowledge"];
    state.players.p1.discard = [];

    state = apply(state, scholarPlay(state, 1)!.action);
    // Decline every removal.
    chooseStep(state, "p1", (label) => label === "Done");

    // Both stats stay; take phase still opens with all four.
    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.players.p1.hand).toContain("stat.knowledge");
    expect(optionLabels(state).filter((label) => label.startsWith("Empowered "))).toHaveLength(4);
    chooseStep(state, "p1", (label) => label === "Empowered Attack");
    chooseStep(state, "p1", (label) => label === "Done");

    expect(state.players.p1.discard).toContain("stat.attack.empowered");
    expect(state.players.p1.discard).not.toContain("stat.defense.empowered");
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("is offered with no Statistic cards (take phase alone is enough)", () => {
    const state = withExpert(ready());
    state.players.p1.hand = ["ability.scholar"];
    state.players.p1.discard = [];
    expect(scholarPlay(state, 1), "expert needs only a crown — remove is optional").toBeTruthy();
  });

  it("does not offer the expert with no expert use available (but the basic stays)", () => {
    const state = ready();
    state.players.p1.hand = ["ability.scholar", "stat.attack"];
    state.players.p1.discard = ["spell.magic_arrow"]; // something to take with the basic
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    expect(scholarPlay(state, 1)).toBeFalsy(); // expert needs a crown
    expect(scholarPlay(state, 0)).toBeTruthy(); // basic needs no crown
  });
});
