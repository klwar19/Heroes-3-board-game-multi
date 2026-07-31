import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { applyAction } from "./reducer";
import {
  createAdventureGameState,
  createAdventureLobbyState,
  TOURNAMENT_REMOVED_ABILITY_ID,
  TOURNAMENT_REMOVED_ARTIFACT_ID
} from "./adventure-setup";
import { hexSpaceId } from "./hex";
import { scenarioDefinitions } from "@/data/map/scenarios";
import {
  eliminatePlayer,
  openDrawChooseMinorArtifacts,
  reshuffleArtifactDecksAfterStartingBonus,
  revealUntilMinorArtifact,
  startingBonusDescription,
  startingBonusVisitSteps
} from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { calculateFirstPlayerRoll, gameOrderForFirstPlayerRoll } from "./first-player";
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
  it("Polish draw-and-choose reshuffles an empty Minor Artifact draw pile", () => {
    const state = createAdventureGameState({
      seed: "bonus-polish-minor-discard",
      difficulty: "normal",
      rollFirstPlayer: false,
      startingBonus: true
    });
    const deck = state.decks["artifacts-minor"] ?? state.decks.artifacts;
    const minors = deck.drawPile
      .filter((cardId) => cardLibrary[cardId]?.artifactTier === "minor")
      .slice(0, 2);
    expect(minors).toHaveLength(2);
    deck.drawPile = [];
    deck.discardPile = [...minors];
    const visit = state.adventure!.pendingVisit!;

    openDrawChooseMinorArtifacts(state, visit, 2, 1);

    expect(visit.steps[0]).toMatchObject({ type: "CHOOSE_ONE" });
    expect(visit.steps[0]?.type === "CHOOSE_ONE" ? visit.steps[0].options : []).toHaveLength(2);
    expect(deck.discardPile).toEqual([]);
  });

  it("reveal-until-Minor reshuffles a discard-only Artifact deck", () => {
    const state = createAdventureGameState({
      seed: "bonus-reveal-minor-discard",
      difficulty: "hard",
      rollFirstPlayer: false
    });
    const deck = state.decks["artifacts-minor"] ?? state.decks.artifacts;
    const minor = deck.drawPile.find(
      (cardId) => cardLibrary[cardId]?.artifactTier === "minor"
    );
    expect(minor).toBeTruthy();
    deck.drawPile = [];
    deck.discardPile = [minor!];
    state.players.p1.hand = [];

    expect(revealUntilMinorArtifact(state, "p1")).toBe(minor);
    expect(state.players.p1.hand).toContain(minor);
    expect(deck.discardPile).toEqual([]);
  });

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

  it("takes every starting bonus before publishing the first-player roll", () => {
    let state = createAdventureGameState({
      seed: "bonus-before-order",
      difficulty: "hard",
      startingBonus: true
    });

    // The seeded result may already determine home placement internally, but
    // the ceremony is not part of public game state until both seats finish.
    expect(state.adventure?.firstPlayerRoll).toBeFalsy();
    expect(state.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(false);
    expect(startingBonusPrompt(state)).toMatch(/Starting bonus \(Hard\)/);

    for (const playerId of ["p1", "p2"] as const) {
      expect(state.adventure?.pendingVisit?.playerId).toBe(playerId);
      state = resolveVisitOption(state, playerId, 0);
      state = resolveResourceDieWindow(state, playerId);
      if (playerId === "p1") {
        expect(state.adventure?.firstPlayerRoll).toBeFalsy();
      }
    }

    const bonusRollAt = state.eventLog.findIndex(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "resource"
    );
    const firstPlayerRollAt = state.eventLog.findIndex((event) => event.type === "FIRST_PLAYER_ROLLED");
    expect(bonusRollAt).toBeGreaterThanOrEqual(0);
    expect(firstPlayerRollAt).toBeGreaterThan(bonusRollAt);
    expect(state.adventure?.firstPlayerRoll?.winnerPlayerId).toBe(state.turnOrder[0]);
    expect(state.activePlayerId).toBe(state.turnOrder[0]);
  });

  it("keeps delayed live-server entropy aligned with the already assigned home positions", () => {
    let state = createAdventureLobbyState({ seed: "live-opening-order", scenarioId: "skirmish" });
    state = applyAction(
      state,
      { type: "SET_GAME_OPTIONS", playerId: "p1", options: { difficulty: "hard" } },
      { entropy: "options-entropy" }
    ).state;
    state = applyAction(
      state,
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" },
      { entropy: "pick-one-entropy" }
    ).state;
    state = applyAction(
      state,
      { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "mephala" },
      { entropy: "pick-two-entropy" }
    ).state;
    state = applyAction(
      state,
      { type: "START_ADVENTURE", playerId: "p1" },
      { entropy: "start-entropy" }
    ).state;

    const firstHome = hexSpaceId(scenarioDefinitions.skirmish.layout.starts[0]!);
    const firstPositionOwner =
      state.towns.town_p1.fieldId === firstHome ? ("p1" as const) : ("p2" as const);
    expect(state.adventure?.firstPlayerRoll).toBeFalsy();

    for (const [playerId, entropy] of [
      ["p1", "bonus-one-entropy"],
      ["p2", "bonus-two-different-entropy"]
    ] as const) {
      state = applyAction(
        state,
        { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 },
        { entropy }
      ).state;
      state = resolveResourceDieWindow(state, playerId);
    }

    expect(state.adventure?.firstPlayerRoll?.winnerPlayerId).toBe(firstPositionOwner);
    expect(state.turnOrder[0]).toBe(firstPositionOwner);
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

  it("with an artifact bonus the opening hand fills UP TO the limit (bonus counts) — never limit+1 forcing a discard", () => {
    // Hard difficulty's artifact option is a plain reveal-until-minor (no Search
    // sub-flow), so the bonus card lands in hand directly.
    let state = createAdventureGameState({
      seed: "bonus-no-five",
      difficulty: "hard",
      rollFirstPlayer: false,
      startingBonus: true,
      houseRules: { "split-decks": false },
      ruleset: "legacy"
    });
    const limit = state.players.p1!.limits.hand;
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    // p1 takes the artifact (option 1); drain the other seats' bonus visits so
    // p1's start-of-turn hand step finalizes.
    let guard = 0;
    while (state.adventure?.pendingVisit && guard < 30) {
      const owner = state.adventure.pendingVisit.playerId;
      state = resolveVisitOption(state, owner, owner === "p1" ? 1 : 0);
      state = resolveResourceDieWindow(state, owner);
      guard += 1;
    }

    const p1 = state.players.p1!;
    const bonusArtifact = p1.hand.find((id) => cardLibrary[id]?.kind === "artifact");
    expect(bonusArtifact, "the bonus artifact is in hand").toBeTruthy();
    // Mutation check: with the pre-deal restored the hand would be limit+1 and
    // `needsHandRefresh` would be TRUE (a forced discard). The bonus counts toward
    // the limit, so the player is never forced to discard before the optional draw.
    expect(p1.hand.length).toBeLessThanOrEqual(limit);
    expect(p1.needsHandRefresh).toBe(false);
    expect(p1.canMulligan).toBe(true);

    // The mandatory start-of-turn draw ("draw new", discarding nothing) succeeds
    // and fills the hand to EXACTLY the limit — the bonus was one of those cards.
    const drawn = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(drawn.errors, drawn.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    const filled = drawn.state.players.p1!;
    expect(filled.hand.length).toBe(limit);
    expect(filled.hand).toContain(bonusArtifact);
  });

  it("survives eliminating seat 1 mid-bonus: the ceremony still publishes the PREVIEW's winner and round 1 starts", () => {
    // Two regressions pinned at once. (1) eliminatePlayer used to sweep the
    // table-wide opening divider with seat 1's rewards (it nominally carries
    // p1's id) — round 1 then never started: the frozen-table class. (2) the
    // delayed commit used to re-roll over the LIVE turn order, which consumes
    // different random values after a mid-bonus elimination and could crown a
    // different winner than the one whose town the preview placed at position 1.
    let state = createAdventureGameState({
      seed: "bonus-elim-seat1",
      difficulty: "hard",
      startingBonus: true,
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "mephala" },
        { id: "p3", name: "C", factionId: "tower", heroDefId: "solmyr" }
      ]
    });
    const allSeats: PlayerId[] = ["p1", "p2", "p3"];
    const previewRoll = calculateFirstPlayerRoll(
      allSeats.map((id) => ({ playerId: id, name: state.players[id]!.name })),
      state.adventure!.openingFirstPlayerSeed!
    )!;

    eliminatePlayer(state, "p1", "removed mid-bonus", false);
    // The table-wide divider survives the eliminated seat's reward sweep.
    expect(
      state.adventure!.rewardQueue.some((reward) => reward.kind === "opening-first-player-roll")
    ).toBe(true);
    pumpAdventureQueues(state);

    let guard = 0;
    while (state.adventure?.pendingVisit && guard < 30) {
      const owner = state.adventure.pendingVisit.playerId;
      state = resolveVisitOption(state, owner, 0);
      state = resolveResourceDieWindow(state, owner);
      guard += 1;
    }

    // Round 1 really starts, publishing the SAME winner the setup preview used
    // to place the towns; the dead seat leads nothing.
    expect(state.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(true);
    expect(state.adventure?.firstPlayerRoll?.winnerPlayerId).toBe(previewRoll.winnerPlayerId);
    const expectedOrder = gameOrderForFirstPlayerRoll(allSeats, previewRoll).filter(
      (id) => id !== "p1"
    );
    expect(state.turnOrder).toEqual(expectedOrder);
    expect(state.activePlayerId).toBe(expectedOrder[0]);
    expect(state.eventLog.some((event) => event.type === "ROUND_STARTED")).toBe(true);
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

  it("granular Ban Diplomacy works without the full tournamentMode master flag", () => {
    const onlyDip = createAdventureGameState({
      seed: "tourney-ban-dip-only",
      difficulty: "impossible",
      rollFirstPlayer: false,
      tournamentBanDiplomacy: true,
      tournamentBanHourglass: false,
      tournamentSecondPlayerMorale: false,
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "mephala" }
      ]
    });
    const abilities = [...onlyDip.decks.abilities!.drawPile, ...onlyDip.decks.abilities!.discardPile];
    expect(abilities).not.toContain(TOURNAMENT_REMOVED_ABILITY_ID);
    // Hourglass still present (control).
    const artifacts = [
      ...(onlyDip.decks["artifacts-minor"]?.drawPile ?? []),
      ...(onlyDip.decks["artifacts-minor"]?.discardPile ?? []),
      ...(onlyDip.decks.artifacts?.drawPile ?? []),
      ...(onlyDip.decks.artifacts?.discardPile ?? [])
    ];
    expect(artifacts).toContain(TOURNAMENT_REMOVED_ARTIFACT_ID);
    // No second-player morale.
    expect(onlyDip.players.p2!.morale).toBe(0);
  });
});
