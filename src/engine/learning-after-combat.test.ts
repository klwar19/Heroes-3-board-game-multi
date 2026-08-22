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
// Learning after a WON combat (USER RULE 2026-08-22).
//
// REPORT: "why i fight lv 3 neutral but can't use learning skill afterwards?
// make learning a pop up after neutral or pvp battle too, basic and expert".
//
// ROOT CAUSE: the printed timing is "play when the Hero is ABOUT TO LEVEL UP",
// and the engine queued the offer only when `hero.level > previousLevel`. A guard
// fight at a difficulty EQUAL to the hero's level pays 1 Experience = a HALF
// level, which crosses no level — so the offer never opened and the card looked
// dead after a won battle.
//
// FIX (superseded, then widened): the first pass flagged the two combat-victory
// XP seams. FOLLOW-UP USER RULE, same day — "the map object that offers
// experience: Learning ability not pick it up. Must show instant reaction
// whenever you receive exp, from ANY source" — moved the trigger to the single
// chokepoint `gainExperience`, so every source reaches it. The combat suites
// below still pass unchanged; the "any source" suite is further down.
//
// Each claim below carries a CONTROL that fails if the widening leaked
// somewhere it must not (no card, a loss, a zero gain, the Experience cap).
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed = "learning-after-combat"): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    players: [
      { id: "p1", name: "Attacker", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Defender", factionId: "rampart", heroDefId: "mephala" }
    ],
    rollFirstPlayer: false
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

/**
 * Stages a just-finished NEUTRAL combat on a plain guard field of the given
 * difficulty, won (or lost) by p1. finalizeAdventureCombat then runs the real
 * after-combat flow: the XP award, the deferred field visit and the queue pump.
 *
 * `difficulty` defaults to the hero's own LEVEL — the exact shape the user
 * reported: it pays 1 Experience (a half level) and crosses NO level, so the
 * old level-crossing gate withheld the Learning offer entirely.
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

function settleAfterCombat(state: GameState): void {
  finalizeAdventureCombat(state);
  pumpAdventureQueues(state);
}

describe("Learning is offered after a won NEUTRAL combat that paid Experience", () => {
  it("opens the offer after a same-level guard win that crosses NO level, and playing it really advances the Hero", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    // Level 1, Experience 0 — a Field Difficulty 1 guard pays exactly 1
    // Experience: half a level, NO level crossing. This is the reported case.
    expect(hero.level).toBe(1);
    expect(hero.experience).toBe(0);
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    // The combat XP landed and, as the report says, crossed no level.
    const afterWin = getMainHero(state, "p1")!;
    expect(afterWin.experience).toBe(1);
    expect(afterWin.level).toBe(1);

    // ...and the Learning pop-up is open anyway (the whole point of the fix).
    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    expect(choice!.playerId).toBe("p1");
    // Basic is offered; Decline is the trailing option.
    expect(choice!.learningLevelUp?.modes).toContain("basic");
    expect(choice!.options.at(-1)?.label).toMatch(/decline/i);

    // OBSERVABLE OUTCOME: taking the basic side moves the Hero's Experience.
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    const advanced = getMainHero(played, "p1")!;
    expect(advanced.experience).toBe(2); // 1 -> 2 (+1 Experience = a half level)
    expect(advanced.level).toBe(2); // and that half level really crossed into level 2
    // The spent card left the hand for the discard pile (basic side).
    expect(played.players.p1.hand).not.toContain("ability.learning");
    expect(played.players.p1.discard).toContain("ability.learning");
  });

  it("offers the EXPERT side when a crown is available, and it advances a FULL level and removes the card", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 2;
    hero.level = 2;
    state.players.p1.hand = ["ability.learning"];
    // Level 2 grants an expert use; make sure one is genuinely spare.
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    stageNeutralCombat(state, { difficulty: 2 }); // equal difficulty -> +1 XP, no level crossing
    settleAfterCombat(state);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    const expertIndex = choice!.learningLevelUp!.modes.indexOf("expert");
    expect(expertIndex).toBeGreaterThanOrEqual(0);

    const before = getMainHero(state, "p1")!.experience;
    expect(before).toBe(3); // 2 + the combat's 1
    const spentCrowns = state.players.p1.combatStats.expertUsesSpentThisRound;

    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: expertIndex });
    const advanced = getMainHero(played, "p1")!;
    expect(advanced.experience).toBe(5); // +2 Experience = a full level
    expect(advanced.level).toBe(3);
    // Expert removes the card from the game (never the discard) and burns a crown.
    expect(played.players.p1.removed).toContain("ability.learning");
    expect(played.players.p1.discard).not.toContain("ability.learning");
    expect(played.players.p1.combatStats.expertUsesSpentThisRound).toBe(spentCrowns + 1);
  });

  it("CONTROL: an Empowered Learning's Expert side spends NO crown", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 2;
    hero.level = 2;
    state.players.p1.hand = ["ability.learning"];
    state.players.p1.limits.expertUses = 0; // no crown at all
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.empoweredAbilities = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 2 });
    settleAfterCombat(state);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    // Empowered: the Expert side is offered even with zero crowns available.
    const expertIndex = choice!.learningLevelUp!.modes.indexOf("expert");
    expect(expertIndex).toBeGreaterThanOrEqual(0);

    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: expertIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(5);
    // The crown-free rule holds: nothing was spent.
    expect(played.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("declining costs nothing — the card stays in hand and the Experience is untouched", () => {
    const state = makeGame();
    state.players.p1.hand = ["ability.learning"];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    const declineIndex = choice!.options.length - 1;

    const declined = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: declineIndex });
    expect(getMainHero(declined, "p1")!.experience).toBe(1); // just the combat XP
    expect(declined.players.p1.hand).toContain("ability.learning");
    expect(learningChoice(declined)).toBeNull();
  });
});

describe("Learning after combat — CONTROLS", () => {
  it("CONTROL: no Learning card in hand -> no prompt at all", () => {
    const state = makeGame();
    state.players.p1.hand = ["ability.wisdom"];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(1); // the XP still landed
    expect(learningChoice(state)).toBeNull();
  });

  it("CONTROL: a LOST fight pays no Experience and opens no prompt", () => {
    const state = makeGame();
    state.players.p1.hand = ["ability.learning"];
    stageNeutralCombat(state, { difficulty: 1, won: false });
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(0);
    expect(learningChoice(state)).toBeNull();
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("CONTROL: a fight BELOW the hero's level pays no Experience, so no prompt", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 4;
    hero.level = 3;
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 1 }); // difficulty < level -> 0 XP
    settleAfterCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(4);
    expect(learningChoice(state)).toBeNull();
  });

  it("CONTROL: at the Experience cap the offer stays closed (advancing would do nothing)", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 12; // MAX_EXPERIENCE
    hero.level = 7;
    state.players.p1.hand = ["ability.learning"];

    stageNeutralCombat(state, { difficulty: 7 });
    settleAfterCombat(state);

    expect(learningChoice(state)).toBeNull();
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("the combat win offers EXACTLY ONE Learning window (no double-offer after the widening)", () => {
    const state = makeGame("learning-single-offer");
    state.players.p1.hand = ["ability.learning"];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

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
    expect((after.adventure?.rewardQueue ?? []).some((r) => r.kind === "learning-level-up")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Learning on EVERY Experience source (USER RULE 2026-08-22, superseding the
// combat-only widening above).
//
// REPORT: "The map object that offers experience: Learning ability not pick it
// up. Must show instant reaction whenever you receive exp, from ANY source —
// neutral, object… — and not mess up others."
//
// The trigger moved to the ONE chokepoint every hero-XP grant funnels through
// (`gainExperience`), so a map object, a designer timed event, a hex event, a
// centre-hex reward and a won fight all reach it without enumerating sources.
// ---------------------------------------------------------------------------
describe("Learning is offered on EVERY Experience source, not only combat", () => {
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

  it("a MAP OBJECT that pays Experience (Learning Stone) opens the offer, and playing it really advances the Hero", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object");
    state.players.p1.hand = ["ability.learning"];
    const hero = getMainHero(state, "p1")!;
    expect(hero.level).toBe(1);
    expect(hero.experience).toBe(0);

    // The exact reported shape: a visitable map object granting +1 hero XP —
    // half a level, crossing NO level, so the old level-crossing gate withheld
    // the offer entirely and the card "did not pick it up".
    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    const afterVisit = getMainHero(state, "p1")!;
    expect(afterVisit.experience).toBe(1);
    expect(afterVisit.level).toBe(1);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    expect(choice!.playerId).toBe("p1");

    // OBSERVABLE OUTCOME: the play moves Experience AND crosses the level.
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: basicIndex
    });
    expect(getMainHero(played, "p1")!.experience).toBe(2);
    expect(getMainHero(played, "p1")!.level).toBe(2);
    expect(played.players.p1.discard).toContain("ability.learning");
  });

  it("CONTROL: the same map object with NO Learning card pays the XP and opens nothing — the table keeps playing", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-control");
    state.players.p1.hand = ["ability.wisdom"];
    const hero = getMainHero(state, "p1")!;

    const fieldId = stageLocationField(state, "learning_stone");
    beginFieldVisit(state, hero.id, fieldId, false);
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.experience).toBe(1); // the XP still landed
    expect(learningChoice(state)).toBeNull();
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    // Nothing is stranded and the seat can still act.
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("declining a map-object offer costs nothing and leaves the table playable", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-decline");
    state.players.p1.hand = ["ability.learning"];
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
    expect(getMainHero(after, "p1")!.experience).toBe(1); // just the object's XP
    expect(after.players.p1.hand).toContain("ability.learning");
    expect(after.pendingChoice).toBeNull();
    expect(computerDecisionOwner(after)).toBeNull();
    expect(getLegalActions(after, "p1").length).toBeGreaterThan(0);
  });

  it("a designer TIMED MAP EVENT paying hero Experience offers it too (the shared pipeline, not a per-object hook)", async () => {
    const { applyCustomMapTimedEvents } = await import("./adventure");
    const state = makeGame("learning-timed-event");
    state.players.p1.hand = ["ability.learning"];
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      timedEvents: [{ round: 1, effect: { kind: "experience", amount: 1 } }]
    } as NonNullable<GameState["adventure"]>["mapPreset"];

    applyCustomMapTimedEvents(state);
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.experience).toBe(1);
    const choice = learningChoice(state);
    expect(choice).not.toBeNull();
    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: basicIndex
    });
    expect(getMainHero(played, "p1")!.experience).toBe(2);
  });

  it("CONTROL: a zero-Experience 'gain' opens nothing, and the Experience CAP still closes the offer", async () => {
    const { gainExperience } = await import("./adventure");
    const state = makeGame("learning-any-source-controls");
    const hero = getMainHero(state, "p1")!;
    state.players.p1.hand = ["ability.learning"];

    // No gain at all -> gainExperience returns early, nothing is queued.
    gainExperience(state, "p1", 0);
    pumpAdventureQueues(state);
    expect(learningChoice(state)).toBeNull();

    // A real gain from a bare non-combat source DOES open it now (the exact
    // line under test: revert the widening and this assertion flips).
    gainExperience(state, "p1", 1);
    pumpAdventureQueues(state);
    const openOffer = learningChoice(state);
    expect(openOffer).not.toBeNull();
    apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: openOffer!.id,
      optionIndex: openOffer!.options.length - 1
    });
    state.pendingChoice = null;
    state.phase = "player-turn";

    // At the Experience cap the offer stays closed (advancing does nothing).
    hero.experience = 12; // MAX_EXPERIENCE
    hero.level = 7;
    gainExperience(state, "p1", 1);
    pumpAdventureQueues(state);
    expect(learningChoice(state)).toBeNull();
    expect(state.players.p1.hand).toContain("ability.learning");
  });

  it("a computer seat never stalls on a map-object offer (it owns the window and is offered a real answer)", async () => {
    const { beginFieldVisit } = await import("./adventure");
    const state = makeGame("learning-map-object-ai");
    state.controllers = { ...(state.controllers ?? {}), p1: standardComputerController() };
    state.sessionMode = "single-player";
    state.players.p1.hand = ["ability.learning"];
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

  it("offers Learning after beating an equal-level enemy Hero (1 XP, no level crossing)", () => {
    const state = makeGame("learning-pvp");
    state.players.p1.hand = ["ability.learning"];
    stagePvpWin(state);
    settleAfterCombat(state);

    // Equal levels -> 1 Experience, which crosses no level from 0.
    const hero = getMainHero(state, "p1")!;
    expect(hero.experience).toBe(1);
    expect(hero.level).toBe(1);

    const choice = learningChoice(state);
    expect(choice).not.toBeNull();

    const basicIndex = choice!.learningLevelUp!.modes.indexOf("basic");
    const played = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(2);
    expect(getMainHero(played, "p1")!.level).toBe(2);
  });

  it("CONTROL: the LOSER of that PvP fight is never offered Learning", () => {
    const state = makeGame("learning-pvp-loser");
    state.players.p2.hand = ["ability.learning"];
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
    stageNeutralCombat(state, { difficulty: 1 });
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

  it("Necromancy still opens FIRST and holds the table; Learning waits behind it", () => {
    const state = makeNecroGame();
    state.players.p1.hand = ["ability.necromancy", "ability.learning"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    // The atomic Necromancy transaction owns the table: its window is open and
    // the Learning offer has NOT jumped the queue.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(learningChoice(state)).toBeNull();
    // The Learning offer is parked in the reward queue, not lost.
    expect(state.adventure?.rewardQueue.some((r) => r.kind === "learning-level-up")).toBe(true);

    // Resolving Necromancy releases it — nothing is stranded.
    const after = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(after.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(learningChoice(after)).not.toBeNull();

    // ...and it still pays out for real.
    const choice = learningChoice(after)!;
    const basicIndex = choice.learningLevelUp!.modes.indexOf("basic");
    const played = apply(after, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: basicIndex });
    expect(getMainHero(played, "p1")!.experience).toBe(2);
  });

  it("CONTROL: with no Learning card the Necromancy flow is byte-identical (window opens, resolves, nothing queued)", () => {
    const state = makeNecroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    stageNeutralCombat(state, { difficulty: 1 });
    settleAfterCombat(state);

    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(state.adventure?.rewardQueue.some((r) => r.kind === "learning-level-up")).toBe(false);

    const after = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(after.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(learningChoice(after)).toBeNull();
  });
});
