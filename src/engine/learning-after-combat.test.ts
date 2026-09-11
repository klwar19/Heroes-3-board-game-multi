import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState
} from "./index";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { computerDecisionOwner } from "./computer/window";
import { standardComputerController } from "./computer/control";
import type { CombatState, MapFieldState } from "./state";

// ---------------------------------------------------------------------------
// Learning after a won combat — CLASSIC LEVEL-CROSSING TIMING.
//
// The printed card reads "play when the Hero is ABOUT TO LEVEL UP", and that is
// exactly what the engine does: `gainExperience` queues the "learning-level-up"
// offer only when the gain actually crosses a whole level (`levelsGained > 0`)
// and the Hero is still below the Experience cap. A gain that stays inside the
// same level offers nothing.
//
// Experience runs in HALF levels: `levelOfExperience(e) = min(7, 1 + floor(e/2))`,
// so Experience 0/1 = level 1, 2/3 = level 2, 4/5 = level 3 … 12 = level 7 (the
// cap). A +1 gain therefore crosses a level only from an ODD Experience (the
// half-step just below the boundary: 1 -> 2, 3 -> 4, 5 -> 6); a +2 gain always
// crosses one. The fixtures below park the Hero on that half-step whenever a
// crossing is wanted, and each claim carries a CONTROL at a NON-crossing gain.
//
// ONLY the Polish Balance Pack reprint (`polish-card-balance`) widens the timing
// to EVERY Experience gain — one spec at the bottom pins that difference.
//
// The trigger lives at the single chokepoint every hero-XP grant funnels through
// (`gainExperience`), so a won fight, a map object, a designer timed event and a
// PvP win all reach it without enumerating sources — the suites below cover each
// of those seams at a crossing gain, plus the usual no-card / loss / zero-gain /
// Experience-cap controls.
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed = "learning-after-combat", houseRules?: { "polish-card-balance"?: boolean }): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    players: [
      { id: "p1", name: "Attacker", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Defender", factionId: "rampart", heroDefId: "mephala" }
    ],
    rollFirstPlayer: false,
    ...(houseRules ? { houseRules } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

/**
 * Parks p1's main Hero on a given Experience (its level follows the half-level
 * scale). An ODD value is the half-step just below a level boundary, so the next
 * +1 Experience crosses a level; an EVEN value stays inside the level.
 */
function setExperience(state: GameState, experience: number): void {
  const hero = getMainHero(state, "p1")!;
  hero.experience = experience;
  hero.level = Math.min(7, 1 + Math.floor(experience / 2));
}

/**
 * Stages a just-finished NEUTRAL combat on a plain guard field of the given
 * difficulty, won (or lost) by p1. finalizeAdventureCombat then runs the real
 * after-combat flow: the XP award, the deferred field visit and the queue pump.
 *
 * `difficulty` defaults to the hero's own LEVEL — an equal-difficulty guard,
 * which pays 1 Experience (a half level). Whether that opens the Learning offer
 * depends entirely on where the Hero started: from an odd Experience it crosses
 * a level and the offer opens, from an even one it does not.
 */
function stageNeutralCombat(
  state: GameState,
  options: { difficulty?: number; won?: boolean } = {}
): { fieldId: string } {
  const hero = getMainHero(state, "p1")!;
  const difficulty = options.difficulty ?? hero.level;
  const won = options.won ?? true;
  const fieldId = "99,1";
  const field: MapFieldState = {
    spaceId: fieldId,
    tileInstanceId: "test-tile",
    slot: 0,
    location: "none",
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[fieldId] = field;
  hero.spaceId = fieldId;
  state.activePlayerId = "p1";
  state.combat = {
    context: { kind: "neutral", heroId: hero.id, fieldId, difficulty, hasAzure: false },
    outcome: won
      ? { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" }
      : { winnerPlayerId: "neutral", defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" },
    units: {}
  } as unknown as CombatState;
  return { fieldId };
}

/** The open Learning offer, or null. */
function learningChoice(state: GameState) {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "learning-level-up") {
    return null;
  }
  return choice;
}

/** True when a Learning offer is parked in the reward queue (not yet opened). */
function learningQueued(state: GameState): boolean {
  return (state.adventure?.rewardQueue ?? []).some((reward) => reward.kind === "learning-level-up");
}

function settleAfterCombat(state: GameState): void {
  finalizeAdventureCombat(state);
  pumpAdventureQueues(state);
}

describe("Learning after a won NEUTRAL combat — offered only when the Experience CROSSES a level", () => {
  it("opens the offer when the guard's 1 Experience crosses a level, and playing it really advances the Hero", () => {
    const state = makeGame();
    // Experience 1 = level 1, the half-step just below the level-2 boundary. An
    // equal-difficulty (1) guard pays 1 Experience: 1 -> 2, which IS a level-up,
    // so the Hero is "about to level up" and the offer must open.
    setExperience(state, 1);
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    // The combat XP landed and crossed the level.
    const afterWin = getMainHero(state, "p1")!;
    expect(afterWin.experience).toBe(2);
    expect(afterWin.level).toBe(2);

    // ...and the Learning pop-up is open.
    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    expect(choice!.playerId).toBe("p1");
    // The classic prompt names the level-up timing, not a bare gain.
    expect(choice!.prompt).toContain("leveling up");
    // Basic is offered; Decline is the trailing option.
    expect(choice!.learningLevelUp?.modes).toContain("basic");
    expect(choice!.options.at(-1)?.label).toMatch(/decline/i);

    // OBSERVABLE OUTCOME: taking the basic side moves the Hero's Experience.
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    const advanced = getMainHero(played, "p1")!;
    expect(advanced.experience).toBe(3); // 2 -> 3 (+1 Experience = a half level)
    expect(advanced.level).toBe(2);
    // The spent card left the hand for the discard pile (basic side).
    expect(played.players.p1.hand).not.toContain("ability.learning");
    expect(played.players.p1.discard).toContain("ability.learning");
  });

  it("CONTROL: the same guard win that stays INSIDE the level opens nothing", () => {
    const state = makeGame("learning-no-crossing");
    const hero = getMainHero(state, "p1")!;
    // Experience 0 = level 1; the guard's 1 Experience takes it to 1, still
    // level 1. No level is about to be crossed, so the classic card stays silent.
    expect(hero.level).toBe(1);
    expect(hero.experience).toBe(0);
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    const afterWin = getMainHero(state, "p1")!;
    expect(afterWin.experience).toBe(1); // the XP still landed
    expect(afterWin.level).toBe(1);

    expect(learningChoice(state)).toBeNull();
    expect(learningQueued(state)).toBe(false);
    expect(state.players.p1.hand).toContain("ability.learning");
    // Nothing is stranded: the seat can keep playing.
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("offers the EXPERT side when a crown is available, and it advances a FULL level and removes the card", () => {
    const state = makeGame();
    // Experience 3 = level 2, the half-step below the level-3 boundary.
    setExperience(state, 3);
    state.players.p1.hand = ["ability.learning"];
    // Level 2 grants an expert use; make sure one is genuinely spare.
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    stageNeutralCombat(state, { difficulty: 2 }); // equal difficulty -> +1 XP: 3 -> 4 = level 3
    settleAfterCombat(state);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    const expertIndex = choice!.learningLevelUp!.modes.indexOf("expert");
    expect(expertIndex).toBeGreaterThanOrEqual(0);

    const before = getMainHero(state, "p1")!.experience;
    expect(before).toBe(4); // 3 + the combat's 1, and that crossed into level 3
    expect(getMainHero(state, "p1")!.level).toBe(3);
    const spentCrowns = state.players.p1.combatStats.expertUsesSpentThisRound;

    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: expertIndex });
    const advanced = getMainHero(played, "p1")!;
    expect(advanced.experience).toBe(6); // +2 Experience = a full level
    expect(advanced.level).toBe(4);
    // Expert removes the card from the game (never the discard) and burns a crown.
    expect(played.players.p1.removed).toContain("ability.learning");
    expect(played.players.p1.discard).not.toContain("ability.learning");
    expect(played.players.p1.combatStats.expertUsesSpentThisRound).toBe(spentCrowns + 1);
  });

  it("CONTROL: an Empowered Learning's Expert side spends NO crown", () => {
    const state = makeGame();
    setExperience(state, 3); // level 2, one half-step below level 3
    state.players.p1.hand = ["ability.learning"];
    state.players.p1.limits.expertUses = 0; // no crown at all
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.empoweredAbilities = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 2 }); // 3 -> 4 = a level crossing
    settleAfterCombat(state);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    // Empowered: the Expert side is offered even with zero crowns available.
    const expertIndex = choice!.learningLevelUp!.modes.indexOf("expert");
    expect(expertIndex).toBeGreaterThanOrEqual(0);

    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: expertIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(6);
    // The crown-free rule holds: nothing was spent.
    expect(played.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("declining costs nothing — the card stays in hand and the Experience is untouched", () => {
    const state = makeGame();
    setExperience(state, 1); // the crossing fixture: 1 -> 2 = level 2
    state.players.p1.hand = ["ability.learning"];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    const declineIndex = choice!.options.length - 1;
    const declined = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: declineIndex });
    expect(getMainHero(declined, "p1")!.experience).toBe(2); // just the combat XP
    expect(declined.players.p1.hand).toContain("ability.learning");
    expect(learningChoice(declined)).toBeNull();
  });
});

describe("Learning after combat — CONTROLS", () => {
  it("CONTROL: no Learning card in hand -> no prompt at all", () => {
    const state = makeGame();
    setExperience(state, 1); // a crossing gain, so only the missing card can silence it
    state.players.p1.hand = ["ability.wisdom"];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(2); // the XP still landed
    expect(getMainHero(state, "p1")!.level).toBe(2); // and it crossed a level
    expect(learningChoice(state)).toBeNull();
  });

  it("CONTROL: a LOST fight pays no Experience and opens no prompt", () => {
    const state = makeGame();
    setExperience(state, 1); // a WIN here would cross a level; the loss pays nothing
    state.players.p1.hand = ["ability.learning"];
    stageNeutralCombat(state, { difficulty: 1, won: false });
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(1);
    expect(learningChoice(state)).toBeNull();
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("CONTROL: a fight BELOW the hero's level pays no Experience, so no prompt", () => {
    const state = makeGame();
    setExperience(state, 5); // level 3, one half-step below level 4
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 1 }); // difficulty < level -> 0 XP
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(5);
    expect(learningChoice(state)).toBeNull();
  });

  it("CONTROL: at the Experience cap the offer stays closed (advancing would do nothing)", () => {
    const state = makeGame();
    setExperience(state, 12); // MAX_EXPERIENCE, level 7
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 7 });
    settleAfterCombat(state);

    expect(learningChoice(state)).toBeNull();
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("a combat win that crosses a level offers EXACTLY ONE Learning window", () => {
    const state = makeGame("learning-single-offer");
    setExperience(state, 5); // level 3; the guard's +1 crosses into level 4
    state.players.p1.hand = ["ability.learning"];
    stageNeutralCombat(state, { difficulty: 3 });
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.level).toBe(4);
    // One queued offer, one open window — not two.
    const queued = (state.adventure?.rewardQueue ?? []).filter((r) => r.kind === "learning-level-up");
    expect(queued).toHaveLength(0); // the single offer was popped into the window
    expect(learningChoice(state)).not.toBeNull();

    // Declining closes it for good: no second copy waiting behind it.
    const choice = learningChoice(state)!;
    const after = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.options.length - 1
    });
    expect(learningChoice(after)).toBeNull();
    expect(learningQueued(after)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Learning on EVERY Experience SOURCE — still gated on the level crossing.
//
// The trigger sits at the ONE chokepoint every hero-XP grant funnels through
// (`gainExperience`), so a map object, a designer timed event, a hex event, a
// centre-hex reward and a won fight all reach it without enumerating sources.
// What each of them must respect is the printed timing: the offer opens when the
// gain is about to level the Hero, and stays shut when it is not.
// ---------------------------------------------------------------------------
describe("Learning is reachable from EVERY Experience source, at a level crossing", () => {
  /** Puts p1's main hero on a real map field carrying the given location. */
  function stageLocationField(state: GameState, location: string): string {
    const hero = getMainHero(state, "p1")!;
    const fieldId = "97,1";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile-loc",
      slot: 0,
      location,
      difficulty: 0,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as unknown as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    return fieldId;
  }

  it("a MAP OBJECT that levels the Hero (Learning Stone) opens the offer, and playing it really advances further", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object");
    state.players.p1.hand = ["ability.learning"];
    // Experience 1 = level 1: the Stone's +1 crosses into level 2.
    setExperience(state, 1);
    const hero = getMainHero(state, "p1")!;

    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    const afterVisit = getMainHero(state, "p1")!;
    expect(afterVisit.experience).toBe(2);
    expect(afterVisit.level).toBe(2);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    expect(choice!.playerId).toBe("p1");

    // OBSERVABLE OUTCOME: the play moves Experience another half level.
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: basicIndex
    });
    expect(getMainHero(played, "p1")!.experience).toBe(3);
    expect(getMainHero(played, "p1")!.level).toBe(2);
    expect(played.players.p1.discard).toContain("ability.learning");
  });

  it("CONTROL: the same map object with NO Learning card pays the XP and opens nothing — the table keeps playing", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-control");
    state.players.p1.hand = ["ability.wisdom"];
    // Experience 5 = level 3: the Stone's +1 crosses into level 4 (a specialty
    // level, so the crossing queues no Ability Search to leave a window open).
    setExperience(state, 5);
    const hero = getMainHero(state, "p1")!;

    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.experience).toBe(6); // the XP still landed
    expect(getMainHero(state, "p1")!.level).toBe(4); // and it crossed a level
    expect(learningChoice(state)).toBeNull();
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    // Nothing is stranded and the seat can still act.
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("CONTROL: a map object whose Experience crosses NO level opens nothing, card in hand or not", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-no-crossing");
    state.players.p1.hand = ["ability.learning"];
    const hero = getMainHero(state, "p1")!;
    // Experience 0 = level 1; the Stone's +1 leaves the Hero inside level 1.
    expect(hero.experience).toBe(0);

    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.experience).toBe(1);
    expect(getMainHero(state, "p1")!.level).toBe(1);
    expect(learningChoice(state)).toBeNull();
    expect(learningQueued(state)).toBe(false);
    expect(state.players.p1.hand).toContain("ability.learning");
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("declining a map-object offer costs nothing and leaves the table playable", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-decline");
    state.players.p1.hand = ["ability.learning"];
    // Experience 5 -> 6 crosses into level 4 — a specialty level, so nothing
    // else (no Ability Search) is waiting behind the declined offer.
    setExperience(state, 5);
    const hero = getMainHero(state, "p1")!;

    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    const choice = learningChoice(state)!;
    const after = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.options.length - 1
    });
    expect(getMainHero(after, "p1")!.experience).toBe(6); // just the object's XP
    expect(after.players.p1.hand).toContain("ability.learning");
    expect(after.pendingChoice).toBeNull();
    expect(computerDecisionOwner(after)).toBeNull();
    expect(getLegalActions(after, "p1").length).toBeGreaterThan(0);
  });

  it("a designer TIMED MAP EVENT that levels the Hero offers it too (the shared pipeline, not a per-object hook)", async () => {
    const { applyCustomMapTimedEvents } = await import("./adventure");
    const state = makeGame("learning-timed-event");
    state.players.p1.hand = ["ability.learning"];
    setExperience(state, 1); // the event's +1 crosses into level 2
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      timedEvents: [{ round: 1, effect: { kind: "experience", amount: 1 } }]
    } as NonNullable<GameState["adventure"]>["mapPreset"];

    applyCustomMapTimedEvents(state);
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.experience).toBe(2);
    expect(getMainHero(state, "p1")!.level).toBe(2);
    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: basicIndex
    });
    expect(getMainHero(played, "p1")!.experience).toBe(3);
  });

  it("CONTROL: the same timed event inside the level opens nothing", async () => {
    const { applyCustomMapTimedEvents } = await import("./adventure");
    const state = makeGame("learning-timed-event-no-crossing");
    state.players.p1.hand = ["ability.learning"];
    // Experience 0 -> 1 stays inside level 1.
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      timedEvents: [{ round: 1, effect: { kind: "experience", amount: 1 } }]
    } as NonNullable<GameState["adventure"]>["mapPreset"];

    applyCustomMapTimedEvents(state);
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.experience).toBe(1);
    expect(getMainHero(state, "p1")!.level).toBe(1);
    expect(learningChoice(state)).toBeNull();
    expect(learningQueued(state)).toBe(false);
  });

  it("CONTROL: a zero-Experience 'gain' and a non-crossing gain open nothing, and the Experience CAP closes the offer", async () => {
    const { gainExperience } = await import("./adventure");
    const state = makeGame("learning-any-source-controls");
    const hero = getMainHero(state, "p1")!;
    state.players.p1.hand = ["ability.learning"];

    // No gain at all -> gainExperience returns early, nothing is queued.
    gainExperience(state, "p1", 0);
    pumpAdventureQueues(state);
    expect(learningChoice(state)).toBeNull();
    expect(learningQueued(state)).toBe(false);

    // A real gain that stays INSIDE the level (0 -> 1) still opens nothing —
    // this is the exact line under test: widen the gate and this flips.
    gainExperience(state, "p1", 1);
    pumpAdventureQueues(state);
    expect(getMainHero(state, "p1")!.experience).toBe(1);
    expect(learningChoice(state)).toBeNull();
    expect(learningQueued(state)).toBe(false);

    // The very next half-step DOES cross into level 2, and the offer opens.
    gainExperience(state, "p1", 1);
    pumpAdventureQueues(state);
    const openOffer = learningChoice(state);
    expect(openOffer).not.toBeNull();
    expect(getMainHero(state, "p1")!.level).toBe(2);
    apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: openOffer!.id,
      optionIndex: openOffer!.options.length - 1
    });
    state.pendingChoice = null;
    state.phase = "player-turn";

    // At the Experience cap the offer stays closed even though the level moved
    // (advancing further does nothing).
    hero.experience = 11; // one half-step below the cap, level 6
    hero.level = 6;
    gainExperience(state, "p1", 1); // 11 -> 12 = MAX_EXPERIENCE, level 7
    pumpAdventureQueues(state);
    expect(getMainHero(state, "p1")!.level).toBe(7);
    expect(learningChoice(state)).toBeNull();
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("a computer seat never stalls on a map-object offer (it owns the window and is offered a real answer)", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-ai");
    state.controllers = { ...(state.controllers ?? {}), p1: standardComputerController() };
    state.sessionMode = "single-player";
    state.players.p1.hand = ["ability.learning"];
    setExperience(state, 1); // the Stone's +1 crosses into level 2
    const hero = getMainHero(state, "p1")!;

    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    expect(learningChoice(state)).not.toBeNull();
    expect(computerDecisionOwner(state)).toBe("p1");
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "CHOOSE_OPTION")).toBe(true);
  });
});

describe("Learning after a won PvP combat", () => {
  /** Stages a finished PvP fight where p1 beat p2's main hero. */
  function stagePvpWin(state: GameState): void {
    const winner = getMainHero(state, "p1")!;
    const loser = getMainHero(state, "p2")!;
    const fieldId = "98,1";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile-pvp",
      slot: 0,
      location: "none",
      difficulty: 0,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    winner.spaceId = fieldId;
    loser.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: {
        kind: "player",
        attackerHeroId: winner.id,
        defenderHeroId: loser.id,
        fieldId
      },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
  }

  it("offers Learning after beating an enemy Hero when the 1 XP crosses a level", () => {
    const state = makeGame("learning-pvp");
    state.players.p1.hand = ["ability.learning"];
    // Beating an equal-level Hero pays 1 Experience; from 1 that crosses into
    // level 2, so the winner is "about to level up".
    setExperience(state, 1);
    stagePvpWin(state);
    settleAfterCombat(state);

    const hero = getMainHero(state, "p1")!;
    expect(hero.experience).toBe(2);
    expect(hero.level).toBe(2);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();

    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(3);
    expect(getMainHero(played, "p1")!.level).toBe(2);
  });

  it("CONTROL: the same PvP win whose 1 XP crosses NO level opens nothing", () => {
    const state = makeGame("learning-pvp-no-crossing");
    state.players.p1.hand = ["ability.learning"];
    // Experience 0 -> 1: the reward lands but the winner stays inside level 1.
    stagePvpWin(state);
    settleAfterCombat(state);

    const hero = getMainHero(state, "p1")!;
    expect(hero.experience).toBe(1);
    expect(hero.level).toBe(1);
    expect(learningChoice(state)).toBeNull();
    expect(learningQueued(state)).toBe(false);
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("CONTROL: the LOSER of that PvP fight is never offered Learning", () => {
    const state = makeGame("learning-pvp-loser");
    state.players.p2.hand = ["ability.learning"];
    setExperience(state, 1); // the WINNER crosses a level here; the loser gains nothing
    stagePvpWin(state);
    settleAfterCombat(state);

    const choice = learningChoice(state);
    // Any Learning window that did open must belong to the WINNER, never p2.
    expect(choice?.playerId ?? "p1").toBe("p1");
    expect(state.players.p2.hand).toContain("ability.learning");
    expect(getMainHero(state, "p2")!.experience).toBe(0);
  });
});

describe("Learning after combat — no stall for a computer/AFK seat", () => {
  it("a computer seat OWNS the offer (so the runner answers it) and never freezes the table", () => {
    const state = makeGame("learning-ai");
    state.controllers = { ...(state.controllers ?? {}), p1: standardComputerController() };
    state.sessionMode = "single-player";
    state.players.p1.hand = ["ability.learning"];
    setExperience(state, 1); // the guard's +1 crosses into level 2
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    expect(learningChoice(state)).not.toBeNull();
    // computerDecisionOwner must name the seat that owes the window — the
    // anti-freeze contract. It handles any pendingChoice generically, so this
    // offer adds NO new window kind to keep in lockstep with legal-actions.
    expect(computerDecisionOwner(state)).toBe("p1");

    // And a real answer is actually offered to that seat.
    const legal = getLegalActions(state, "p1");
    expect(legal.some((entry) => entry.action.type === "CHOOSE_OPTION")).toBe(true);
  });

  it("the offer is answerable and clears — declining leaves the table playable", () => {
    const state = makeGame("learning-ai-clear");
    state.players.p1.hand = ["ability.learning"];
    // 5 -> 6 crosses into level 4 (a specialty level), so declining leaves an
    // EMPTY table rather than the level's own Ability Search.
    setExperience(state, 5);
    stageNeutralCombat(state, { difficulty: 3 });
    settleAfterCombat(state);

    const choice = learningChoice(state)!;
    const after = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.options.length - 1
    });
    expect(after.pendingChoice).toBeNull();
    expect(computerDecisionOwner(after)).toBeNull();
  });
});

describe("Learning after combat — the Necromancy window is unaffected", () => {
  function makeNecroGame(): GameState {
    const state = createAdventureGameState({
      seed: "learning-necro-order",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    return state;
  }

  it("Necromancy still opens FIRST and holds the table; the level-up Learning offer waits behind it", () => {
    const state = makeNecroGame();
    state.players.p1.hand = ["ability.necromancy", "ability.learning"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    setExperience(state, 1); // the guard's +1 crosses into level 2, so Learning qualifies
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    // The atomic Necromancy transaction owns the table: its window is open and
    // the Learning offer has NOT jumped the queue.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(learningChoice(state)).toBeNull();
    // The Learning offer is parked in the reward queue, not lost.
    expect(learningQueued(state)).toBe(true);

    // Resolving Necromancy releases it — nothing is stranded.
    const after = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(after.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(learningChoice(after)).not.toBeNull();

    // ...and it still pays out for real.
    const choice = learningChoice(after)!;
    const basicIndex = choice.learningLevelUp!.modes.indexOf("basic");
    const played = apply(after, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(3);
  });

  it("CONTROL: with no Learning card the Necromancy flow is byte-identical (window opens, resolves, nothing queued)", () => {
    const state = makeNecroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    setExperience(state, 1); // the same crossing gain as the spec above
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(learningQueued(state)).toBe(false);

    const after = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(after.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(learningChoice(after)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The ONE house rule that widens the timing: the Polish Balance Pack reprint.
// ---------------------------------------------------------------------------
describe("Polish Balance Pack — the reprint still offers Learning on a NON-crossing gain", () => {
  it("a guard win that stays inside the level opens the offer under polish-card-balance", () => {
    const state = makeGame("learning-polish-balance", { "polish-card-balance": true });
    const hero = getMainHero(state, "p1")!;
    // Experience 0 -> 1: no level crossed. Classic keeps quiet here (see the
    // CONTROL in the first suite); the Polish reprint asks anyway.
    expect(hero.experience).toBe(0);
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    const afterWin = getMainHero(state, "p1")!;
    expect(afterWin.experience).toBe(1);
    expect(afterWin.level).toBe(1); // still inside level 1

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    // The reprint's prompt names the GAIN timing, not the level-up timing.
    expect(choice!.prompt).toContain("gained Experience");
    expect(choice!.prompt).not.toContain("leveling up");

    // ...and it still pays out: the basic side advances another half level.
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(2);
    expect(played.players.p1.discard).toContain("ability.learning");
  });
});
