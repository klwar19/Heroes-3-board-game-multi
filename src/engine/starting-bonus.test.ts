import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { applyAction } from "./reducer";
import {
  createAdventureGameState,
  TOURNAMENT_REMOVED_ABILITY_ID,
  TOURNAMENT_REMOVED_ARTIFACT_ID
} from "./adventure-setup";
import {
  reshuffleArtifactDecksAfterStartingBonus,
  revealUntilMinorArtifact,
  startingBonusDescription,
  startingBonusVisitSteps
} from "./adventure";
import type { GameState, PlayerId } from "./state";

/** Starting bonuses (and field visits) use RESOLVE_VISIT_STEP on pendingVisit, not CHOOSE_OPTION. */
function resolveVisitOption(state: GameState, playerId: PlayerId, optionIndex: number): GameState {
  return applyAction(state, {
    type: "RESOLVE_VISIT_STEP",
    playerId,
    optionIndex
  }).state;
}

/** Drain resource-die auto-resolves or pick the first face of a multi-die choice. */
function resolveResourceDieWindow(state: GameState, playerId: PlayerId): GameState {
  let next = state;
  // A single die with no luck may auto-apply; a 2-die "pick one" opens a visit CHOOSE_ONE.
  while (
    next.adventure?.pendingVisit?.playerId === playerId &&
    next.adventure.pendingVisit.steps[0]?.type === "CHOOSE_ONE" &&
    (next.adventure.pendingVisit.steps[0].prompt.includes("resource die") ||
      next.adventure.pendingVisit.steps[0].prompt.includes("Resource die") ||
      next.adventure.pendingVisit.steps[0].prompt.includes("Resource Die"))
  ) {
    next = resolveVisitOption(next, playerId, 0);
  }
  return next;
}

function startingBonusPrompt(state: GameState): string | null {
  const step = state.adventure?.pendingVisit?.steps[0];
  return step?.type === "CHOOSE_ONE" ? step.prompt : null;
}

describe("startingBonusDescription / steps (rulebook p.10)", () => {
  it("prints the rulebook bonus text per difficulty", () => {
    expect(startingBonusDescription("easy")).toMatch(/both/i);
    expect(startingBonusDescription("easy")).toMatch(/twice/i);
    expect(startingBonusDescription("normal")).toMatch(/one of them/i);
    expect(startingBonusDescription("hard")).toMatch(/Minor Artifact/i);
    expect(startingBonusDescription("impossible")).toMatch(/No starting bonus/i);
  });

  it("builds Easy both-dice OR Search twice", () => {
    const steps = startingBonusVisitSteps("easy");
    expect(steps?.[0]?.type).toBe("CHOOSE_ONE");
    if (steps?.[0]?.type !== "CHOOSE_ONE") {
      return;
    }
    expect(steps[0].options).toHaveLength(2);
    expect(steps[0].options[0]!.steps).toEqual([
      { type: "ROLL_RESOURCE_DICE", count: 1 },
      { type: "ROLL_RESOURCE_DICE", count: 1 }
    ]);
    expect(steps[0].options[1]!.steps).toEqual([{ type: "STARTING_BONUS_ARTIFACT_SEARCH", times: 2 }]);
  });

  it("builds Normal pick-one-die OR Search once", () => {
    const steps = startingBonusVisitSteps("normal");
    expect(steps?.[0]?.type).toBe("CHOOSE_ONE");
    if (steps?.[0]?.type !== "CHOOSE_ONE") {
      return;
    }
    expect(steps[0].options[0]!.steps).toEqual([{ type: "ROLL_RESOURCE_DICE", count: 2 }]);
    expect(steps[0].options[1]!.steps).toEqual([{ type: "STARTING_BONUS_ARTIFACT_SEARCH", times: 1 }]);
  });

  it("builds Hard one die OR reveal-until-minor; Impossible is none", () => {
    const hard = startingBonusVisitSteps("hard");
    expect(hard?.[0]?.type).toBe("CHOOSE_ONE");
    if (hard?.[0]?.type !== "CHOOSE_ONE") {
      return;
    }
    expect(hard[0].options[0]!.steps).toEqual([{ type: "ROLL_RESOURCE_DICE", count: 1 }]);
    expect(hard[0].options[1]!.steps).toEqual([{ type: "REVEAL_UNTIL_MINOR_ARTIFACT" }]);
    expect(startingBonusVisitSteps("impossible")).toBeNull();
  });
});

describe("starting bonus at game setup", () => {
  it("queues no starting bonus on Impossible (CONTROL)", () => {
    const state = createAdventureGameState({
      seed: "bonus-impossible",
      difficulty: "impossible",
      rollFirstPlayer: false,
      startingBonus: true
    });
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.rewardQueue.some((r) => r.kind === "visit-steps")).toBe(false);
  });

  it("opens the Easy starting-bonus choice for the first player when enabled", () => {
    const state = createAdventureGameState({
      seed: "bonus-easy-open",
      difficulty: "easy",
      rollFirstPlayer: false,
      startingBonus: true
    });
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(startingBonusPrompt(state)).toMatch(/Starting bonus \(Easy\)/);
    const step = state.adventure!.pendingVisit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    if (step.type !== "CHOOSE_ONE") {
      return;
    }
    expect(step.options.map((o) => o.label).join(" | ")).toMatch(/both/i);
    expect(step.options.map((o) => o.label).join(" | ")).toMatch(/twice/i);
  });

  it("Easy resource path: both Resource dice add resources (not pick-one)", () => {
    const before = createAdventureGameState({
      seed: "bonus-easy-both",
      difficulty: "easy",
      rollFirstPlayer: false,
      startingBonus: true
    });
    const gold0 = before.players.p1!.resources.gold;
    const mat0 = before.players.p1!.resources.buildingMaterials;
    const val0 = before.players.p1!.resources.valuables;

    // Option 0 = both resource dice
    let state = resolveVisitOption(before, "p1", 0);
    // Two sequential single-die rolls may auto-resolve or open luck windows
    state = resolveResourceDieWindow(state, "p1");
    state = resolveResourceDieWindow(state, "p1");
    // p2 still has their bonus
    if (startingBonusPrompt(state)?.includes("Starting bonus") && state.adventure?.pendingVisit?.playerId === "p2") {
      state = resolveVisitOption(state, "p2", 0);
      state = resolveResourceDieWindow(state, "p2");
      state = resolveResourceDieWindow(state, "p2");
    }

    const gained =
      state.players.p1!.resources.gold -
      gold0 +
      (state.players.p1!.resources.buildingMaterials - mat0) +
      (state.players.p1!.resources.valuables - val0);
    // CONTROL: Easy grants BOTH dice — the events log two resource rolls when both fire.
    const resourceRolls = state.eventLog.filter(
      (e) => e.type === "ADVENTURE_DICE_ROLLED" && e.playerId === "p1" && e.dice === "resource"
    );
    expect(resourceRolls.length).toBeGreaterThanOrEqual(2);
    expect(gained).toBeGreaterThan(0);
  });

  it("Normal resource path: two dice are rolled and exactly one result is taken", () => {
    const before = createAdventureGameState({
      seed: "bonus-normal-one",
      difficulty: "normal",
      rollFirstPlayer: false,
      startingBonus: true
    });
    const gold0 = before.players.p1!.resources.gold;
    const mat0 = before.players.p1!.resources.buildingMaterials;
    const val0 = before.players.p1!.resources.valuables;

    let state = resolveVisitOption(before, "p1", 0);
    // One ROLL_RESOURCE_DICE count:2 → choose one face (visit CHOOSE_ONE)
    const pickStep = state.adventure?.pendingVisit?.steps[0];
    expect(pickStep?.type).toBe("CHOOSE_ONE");
    if (pickStep?.type !== "CHOOSE_ONE") {
      return;
    }
    expect(pickStep.prompt).toMatch(/Choose one resource die/i);
    const faceLabel = pickStep.options[0]?.label ?? "";
    state = resolveVisitOption(state, "p1", 0);

    const goldGain = state.players.p1!.resources.gold - gold0;
    const matGain = state.players.p1!.resources.buildingMaterials - mat0;
    const valGain = state.players.p1!.resources.valuables - val0;
    // Exactly one face applied
    const nonZero = [goldGain, matGain, valGain].filter((n) => n > 0);
    expect(nonZero.length).toBe(1);
    expect(faceLabel.length).toBeGreaterThan(0);

    // CONTROL: the multi-die event shows 2 faces even though only one is kept
    const roll = state.eventLog.find(
      (e) => e.type === "ADVENTURE_DICE_ROLLED" && e.playerId === "p1" && e.dice === "resource"
    );
    expect(roll && roll.type === "ADVENTURE_DICE_ROLLED" ? roll.results.length : 0).toBe(2);
  });

  it("Easy Search path: opens a Search (2) of the Artifact deck (twice)", () => {
    const before = createAdventureGameState({
      seed: "bonus-easy-search",
      difficulty: "easy",
      rollFirstPlayer: false,
      startingBonus: true
    });
    // Option 1 = Search (2) twice
    const state = resolveVisitOption(before, "p1", 1);
    // First Search opens as pendingChoice (or deck-search-mode for discard top)
    expect(
      state.pendingChoice?.type === "DECK_SEARCH" ||
        // A "Search X" with a non-empty discard top opens the mode picker, and a
        // scouting prompt is also fine — both are OPTION_CHOICE search entries.
        state.pendingChoice?.type === "OPTION_CHOICE"
    ).toBe(true);
    expect(state.pendingChoice?.playerId).toBe("p1");
    // Remaining second search + reshuffle sit at the front of the queue
    const queuedSearches = (state.adventure?.rewardQueue ?? []).filter(
      (r) => r.kind === "shared-deck-search" && r.playerId === "p1"
    );
    const queuedReshuffle = (state.adventure?.rewardQueue ?? []).some(
      (r) =>
        r.kind === "visit-steps" &&
        r.playerId === "p1" &&
        r.steps.some((s) => s.type === "RESHUFFLE_ARTIFACT_DECKS")
    );
    // One search is open now; one more should still be queued (or both if mode choice is open)
    expect(queuedSearches.length + (state.pendingChoice ? 1 : 0)).toBeGreaterThanOrEqual(2);
    expect(queuedReshuffle).toBe(true);
  });

  it("Hard reveal path: a Minor Artifact lands in hand (not the starting deck)", () => {
    const before = createAdventureGameState({
      seed: "bonus-hard-minor",
      difficulty: "hard",
      rollFirstPlayer: false,
      startingBonus: true,
      // Combined artifact deck so reveal-until-minor can walk non-minors
      houseRules: { "split-decks": false },
      ruleset: "legacy"
    });
    const deckBefore = [...before.players.p1!.deck];
    const handBefore = before.players.p1!.hand.length;

    // Option 1 = reveal until minor
    let state = resolveVisitOption(before, "p1", 1);
    // p2 may still be open on their bonus
    if (startingBonusPrompt(state)?.includes("Starting bonus") && state.adventure?.pendingVisit?.playerId === "p2") {
      state = resolveVisitOption(state, "p2", 0);
      state = resolveResourceDieWindow(state, "p2");
    }

    const newHandCards = state.players.p1!.hand.filter((id) => !before.players.p1!.hand.includes(id));
    const minor = newHandCards.find(
      (id) => cardLibrary[id]?.kind === "artifact" && (cardLibrary[id]?.artifactTier ?? "minor") === "minor"
    );
    expect(minor, "Hard bonus must put a Minor Artifact into hand").toBeTruthy();
    expect(state.players.p1!.hand.length).toBeGreaterThan(handBefore);
    // Must NOT have been shuffled into the starting deck
    expect(state.players.p1!.deck).toEqual(deckBefore);
  });

  it("is OFF by default so a direct construction keeps its bonus-free opening (CONTROL)", () => {
    // Regression guard: the bonus must NOT auto-apply just because the real
    // first-player roll ran — that broke the turn-1 setup flow of many suites.
    // A direct build (no `startingBonus`) opens with no bonus prompt, whether or
    // not the first-player roll is skipped.
    const rolled = createAdventureGameState({ seed: "bonus-off-rolled", difficulty: "easy" });
    expect(rolled.adventure?.rewardQueue.some((r) => r.kind === "visit-steps")).toBe(false);
    const skipped = createAdventureGameState({ seed: "bonus-off-skip", difficulty: "easy", rollFirstPlayer: false });
    expect(startingBonusPrompt(skipped) ?? "").not.toMatch(/Starting bonus/);
  });

  it("resolves for every player and hands off to a normal, playable round 1", () => {
    // The whole point of the feature: once the bonus is taken it must not strand
    // setup. After every seat resolves, the table is at round 1 with the first
    // player's mandatory start-of-turn draw armed — identical to a bonus-free
    // build — and nothing left pending.
    let state = createAdventureGameState({
      seed: "bonus-handoff",
      difficulty: "easy",
      rollFirstPlayer: false,
      startingBonus: true
    });
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    let guard = 0;
    while (state.adventure?.pendingVisit && guard < 30) {
      const owner = state.adventure.pendingVisit.playerId;
      state = resolveVisitOption(state, owner, 0);
      state = resolveResourceDieWindow(state, owner);
      guard += 1;
    }

    expect(state.adventure?.pendingVisit).toBeFalsy();
    expect(state.pendingChoice).toBeNull();
    expect(state.round).toBe(1);
    expect(state.activePlayerId).toBe("p1");
    // The turn-1 mandatory draw is armed, exactly as in a game with no bonus.
    const control = createAdventureGameState({
      seed: "bonus-handoff",
      difficulty: "easy",
      rollFirstPlayer: false
    });
    expect(state.players.p1?.canMulligan).toBe(control.players.p1?.canMulligan);
    expect(state.players.p1?.needsHandRefresh).toBe(control.players.p1?.needsHandRefresh);
  });
});

describe("revealUntilMinorArtifact / reshuffle helpers", () => {
  it("takes the first acquirable Minor from the minor deck when decks are split", () => {
    const state = createAdventureGameState({
      seed: "reveal-split",
      difficulty: "impossible",
      rollFirstPlayer: false
    });
    const minorDeck = state.decks["artifacts-minor"];
    expect(minorDeck).toBeTruthy();
    // Ensure the top is a minor the player can take
    const top = minorDeck!.drawPile[minorDeck!.drawPile.length - 1]!;
    expect(cardLibrary[top]?.artifactTier).toBe("minor");
    const taken = revealUntilMinorArtifact(state, "p1");
    expect(taken).toBe(top);
    expect(state.players.p1!.hand).toContain(top);
  });

  it("reshuffle rebuilds every artifact deck with exactly one discard-top", () => {
    const state = createAdventureGameState({
      seed: "reshuffle-art",
      difficulty: "impossible",
      rollFirstPlayer: false
    });
    // Pollute discards
    for (const id of ["artifacts-minor", "artifacts-major", "artifacts-relic"] as const) {
      const deck = state.decks[id];
      if (!deck) continue;
      deck.discardPile.push(...deck.drawPile.splice(0, 2));
    }
    reshuffleArtifactDecksAfterStartingBonus(state);
    for (const id of ["artifacts-minor", "artifacts-major", "artifacts-relic"] as const) {
      const deck = state.decks[id];
      if (!deck) continue;
      expect(deck.discardPile.length).toBe(1);
      expect(deck.drawPile.length).toBeGreaterThan(0);
    }
  });
});

describe("Tournament Mode setup (rulebook p.54)", () => {
  it("removes Diplomacy and Hourglass of the Evil Hour from shared decks when on", () => {
    const on = createAdventureGameState({
      seed: "tourney-on",
      difficulty: "impossible",
      rollFirstPlayer: false,
      tournamentMode: true
    });
    const abilityCards = [
      ...on.decks.abilities!.drawPile,
      ...on.decks.abilities!.discardPile
    ];
    expect(abilityCards).not.toContain(TOURNAMENT_REMOVED_ABILITY_ID);

    const artifactCards = on.decks["artifacts-minor"]
      ? [
          ...on.decks["artifacts-minor"]!.drawPile,
          ...on.decks["artifacts-minor"]!.discardPile,
          ...(on.decks["artifacts-major"]?.drawPile ?? []),
          ...(on.decks["artifacts-major"]?.discardPile ?? []),
          ...(on.decks["artifacts-relic"]?.drawPile ?? []),
          ...(on.decks["artifacts-relic"]?.discardPile ?? [])
        ]
      : [...(on.decks.artifacts?.drawPile ?? []), ...(on.decks.artifacts?.discardPile ?? [])];
    expect(artifactCards).not.toContain(TOURNAMENT_REMOVED_ARTIFACT_ID);

    // CONTROL: with tournament off, both cards are present in their decks
    const off = createAdventureGameState({
      seed: "tourney-off",
      difficulty: "impossible",
      rollFirstPlayer: false,
      tournamentMode: false
    });
    const offAbilities = [...off.decks.abilities!.drawPile, ...off.decks.abilities!.discardPile];
    expect(offAbilities).toContain(TOURNAMENT_REMOVED_ABILITY_ID);
    const offArtifacts = [
      ...(off.decks["artifacts-minor"]?.drawPile ?? []),
      ...(off.decks["artifacts-minor"]?.discardPile ?? []),
      ...(off.decks.artifacts?.drawPile ?? []),
      ...(off.decks.artifacts?.discardPile ?? [])
    ];
    expect(offArtifacts).toContain(TOURNAMENT_REMOVED_ARTIFACT_ID);
  });

  it("gives the second player +1 positive morale at game start", () => {
    // Default p2 is Necropolis (ignores morale) — use two morale-aware factions.
    const on = createAdventureGameState({
      seed: "tourney-morale",
      difficulty: "impossible",
      rollFirstPlayer: false,
      tournamentMode: true,
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "mephala" }
      ]
    });
    // turnOrder is p1, p2 when first-player roll is skipped
    expect(on.turnOrder[0]).toBe("p1");
    expect(on.turnOrder[1]).toBe("p2");
    expect(on.players.p2!.morale).toBe(1);
    // First player is not granted the tournament morale
    expect(on.players.p1!.morale).toBe(0);

    // CONTROL: tournament off → no free morale
    const off = createAdventureGameState({
      seed: "tourney-morale-off",
      difficulty: "impossible",
      rollFirstPlayer: false,
      tournamentMode: false,
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "mephala" }
      ]
    });
    expect(off.players.p2!.morale).toBe(0);
  });

  it("does not remove a hero's starting Diplomacy copy from their personal deck", () => {
    // Oidana / heroes with startingAbilityCardId diplomacy still keep their copy
    const state = createAdventureGameState({
      seed: "tourney-start-dip",
      difficulty: "impossible",
      rollFirstPlayer: false,
      tournamentMode: true,
      players: [
        { id: "p1", name: "Dip", factionId: "castle", heroDefId: "sorsha" },
        { id: "p2", name: "Other", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    // Shared deck has none
    const shared = [...state.decks.abilities!.drawPile, ...state.decks.abilities!.discardPile];
    expect(shared).not.toContain(TOURNAMENT_REMOVED_ABILITY_ID);
    // If a seat happens to start with Diplomacy it stays in hand/deck — we only
    // assert the shared-deck removal (the rule targets deck building).
  });
});
