import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS,
  type GameAction,
  type GameState
} from "./index";
import { getMainHero, getTownOfPlayer } from "./adventure";
import { startNeutralEncounter, startPlayerCombat } from "./adventure-reducer";

// ---------------------------------------------------------------------------
// Tactics (Mutare / Cassiopeia) and Diplomacy (Cyra) ability cards.
//
// Tactics: regular side switches any two of your units at the start of Combat;
// the expert side switches two on your turn before your active unit moves.
// Diplomacy: the Map side draws one Neutral Unit card per Dwelling and lets you
// recruit one; the Instant side skips a matching-level Neutral fight for no XP.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  // "normal" keeps the guard armies small and deterministic.
  return createAdventureGameState({ seed: "tactics-diplomacy", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  return state.players.p1.needsHandRefresh ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
}

/** Steps p1's level-1 hero onto the building-materials mine guarded at level I. */
function moveOntoGuardedMine(state: GameState): GameState {
  return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
}

function p1CombatUnits(state: GameState) {
  return Object.values(state.combat?.units ?? {}).filter((unit) => unit.controllerId === "p1");
}

// ===========================================================================
// Tactics — card definition
// ===========================================================================

describe("Tactics card definition", () => {
  it("is an implemented CHOOSE_ONE with regular + expert sides, no longer a stub", () => {
    const card = cardLibrary["ability.tactics"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type === "CHOOSE_ONE") {
      expect(card.effect.options).toHaveLength(2);
      expect(card.effect.options[0].effect.type).toBe("TACTICS_SWAP");
      expect(card.effect.options[1].effect.type).toBe("TACTICS_SWAP");
      expect(card.effect.options[1].expertOnly).toBe(true);
    }
  });

  it("cannot be played through PLAY_CARD (it runs through the swap window)", () => {
    const state = refreshP1(makeGame());
    state.players.p1.hand = ["ability.tactics"];
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.tactics",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Tactics — start of combat (regular)
// ===========================================================================

describe("Tactics — start-of-combat swap (regular)", () => {
  function setupWindow(): GameState {
    let state = refreshP1(makeGame());
    expect(state.players.p1.army.length).toBeGreaterThanOrEqual(2);
    state.players.p1.hand = ["ability.tactics"];

    state = moveOntoGuardedMine(state);
    const [a, b] = state.players.p1.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a.id, position: 13 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: b.id, position: 17 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    return state;
  }

  it("opens a swap window once the guards are revealed, for a Tactics holder with 2+ units", () => {
    const state = setupWindow();
    expect(state.combat?.pendingTacticsSwaps).toEqual(["p1"]);
    expect(state.phase).toBe("combat-setup");
    expect(state.priorityPlayerId).toBe("p1");

    const actions = getLegalActions(state, "p1");
    expect(actions.some((a) => a.action.type === "SWAP_COMBAT_UNITS")).toBe(true);
    expect(actions.some((a) => a.action.type === "FINISH_TACTICS")).toBe(true);
  });

  it("switches the two units' positions, spends the card (no expert use), then begins round 1", () => {
    let state = setupWindow();
    const before = p1CombatUnits(state);
    const [unitA, unitB] = before;
    const posA = unitA.position;
    const posB = unitB.position;
    const spentBefore = state.players.p1.combatStats.expertUsesSpentThisRound;

    state = apply(state, {
      type: "SWAP_COMBAT_UNITS",
      playerId: "p1",
      unitIdA: unitA.id,
      unitIdB: unitB.id
    });

    expect(state.combat?.units[unitA.id].position).toBe(posB);
    expect(state.combat?.units[unitB.id].position).toBe(posA);
    // The Tactics card was spent (regular side: no expert use).
    expect(state.players.p1.hand).not.toContain("ability.tactics");
    expect(state.players.p1.discard).toContain("ability.tactics");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(spentBefore);
    // The window closed and round 1 has begun.
    expect(state.combat?.pendingTacticsSwaps ?? null).toBeNull();
    expect(state.phase).toBe("combat");
  });

  it("can be declined (FINISH_TACTICS): positions unchanged, card kept, round 1 begins", () => {
    let state = setupWindow();
    const before = p1CombatUnits(state).map((unit) => ({ id: unit.id, position: unit.position }));

    state = apply(state, { type: "FINISH_TACTICS", playerId: "p1" });

    for (const snapshot of before) {
      expect(state.combat?.units[snapshot.id].position).toBe(snapshot.position);
    }
    expect(state.players.p1.hand).toContain("ability.tactics");
    expect(state.combat?.pendingTacticsSwaps ?? null).toBeNull();
    expect(state.phase).toBe("combat");
  });

  it("does NOT open a window when the attacker is not holding Tactics", () => {
    let state = refreshP1(makeGame());
    state.players.p1.hand = []; // no Tactics
    state = moveOntoGuardedMine(state);
    const [a, b] = state.players.p1.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a.id, position: 13 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: b.id, position: 17 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    expect(state.combat?.pendingTacticsSwaps ?? null).toBeNull();
    expect(state.phase).toBe("combat");
  });
});

// ===========================================================================
// Tactics — player-vs-player ordering
// ===========================================================================

describe("Tactics — player-vs-player swap windows", () => {
  it("queues the attacker before a hero-present defender, both able to swap", () => {
    let state = refreshP1(makeGame());
    const heroP1 = getMainHero(state, "p1")!;
    const heroP2 = getMainHero(state, "p2")!;
    state.players.p1.hand = ["ability.tactics"];
    state.players.p2.hand = ["ability.tactics"];
    expect(state.players.p1.army.length).toBeGreaterThanOrEqual(2);
    expect(state.players.p2.army.length).toBeGreaterThanOrEqual(2);

    const fieldId = heroP1.spaceId ?? Object.keys(state.adventure!.fields)[0];
    startPlayerCombat(state, heroP1, heroP2, fieldId);

    // Attacker (p1) deploys first, then the defender (p2).
    const [a1, a2] = state.players.p1.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a1.id, position: 13 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a2.id, position: 17 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const [d1, d2] = state.players.p2.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: d1.id, position: 4 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: d2.id, position: 0 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });

    // Both hold Tactics: the attacker's window opens first, then the defender's.
    expect(state.combat?.pendingTacticsSwaps).toEqual(["p1", "p2"]);
    expect(state.priorityPlayerId).toBe("p1");

    // Attacker declines; priority passes to the defender (round 1 not yet begun).
    state = apply(state, { type: "FINISH_TACTICS", playerId: "p1" });
    expect(state.combat?.pendingTacticsSwaps).toEqual(["p2"]);
    expect(state.priorityPlayerId).toBe("p2");
    expect(state.phase).toBe("combat-setup");

    // Defender swaps; the queue drains and round 1 begins.
    const defenders = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p2");
    const [posA, posB] = defenders.map((unit) => unit.position);
    state = apply(state, {
      type: "SWAP_COMBAT_UNITS",
      playerId: "p2",
      unitIdA: defenders[0].id,
      unitIdB: defenders[1].id
    });
    expect(state.combat?.units[defenders[0].id].position).toBe(posB);
    expect(state.combat?.units[defenders[1].id].position).toBe(posA);
    expect(state.players.p2.hand).not.toContain("ability.tactics");
    expect(state.phase).toBe("combat");
  });

  it("a garrison defender with no hero in the combat gets no Tactics window", () => {
    let state = refreshP1(makeGame());
    const heroP1 = getMainHero(state, "p1")!;
    state.players.p1.hand = []; // attacker holds no Tactics
    state.players.p2.hand = ["ability.tactics"]; // defender holds it, but its hero is away

    const fieldId = heroP1.spaceId ?? Object.keys(state.adventure!.fields)[0];
    // Garrison defense: defender p2 has no hero standing in the combat.
    startPlayerCombat(state, heroP1, null, fieldId, "p2");

    const [a1, a2] = state.players.p1.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a1.id, position: 13 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a2.id, position: 17 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const [d1, d2] = state.players.p2.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: d1.id, position: 4 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: d2.id, position: 0 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });

    // The hero-absent defender is not eligible, and the attacker holds no card.
    expect(state.combat?.pendingTacticsSwaps ?? null).toBeNull();
    expect(state.phase).toBe("combat");
  });
});

// ===========================================================================
// Tactics — during combat (expert)
// ===========================================================================

describe("Tactics — mid-combat swap (expert)", () => {
  /** A neutral combat in round 1 with two living p1 units and one fresh on the clock. */
  function combatWithFreshActiveUnit(): GameState {
    let state = refreshP1(makeGame());
    state = moveOntoGuardedMine(state);
    const [a, b] = state.players.p1.army;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a.id, position: 13 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: b.id, position: 17 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Deterministically put a fresh p1 unit on the clock in the combat phase.
    const combat = state.combat!;
    const units = p1CombatUnits(state);
    expect(units).toHaveLength(2);
    for (const unit of units) {
      unit.damage = 0;
      unit.movedThisActivation = false;
      unit.attackedThisActivation = false;
      unit.activatedThisRound = false;
    }
    combat.activeUnitId = units[0].id;
    combat.pendingNeutralStep = null;
    combat.awaitingContinue = false;
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.priorityPlayerId = null;

    // Grant the Tactics card and one expert use.
    state.players.p1.hand = ["ability.tactics"];
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.combatStats.expertUseBonusThisRound = 0;
    return state;
  }

  it("offers an expert swap on your turn before your active unit moves", () => {
    const state = combatWithFreshActiveUnit();
    const swaps = getLegalActions(state, "p1").filter((a) => a.action.type === "SWAP_COMBAT_UNITS");
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps[0].label).toContain("expert");
  });

  it("switches positions, spends the card AND one expert use, combat continues", () => {
    let state = combatWithFreshActiveUnit();
    const [unitA, unitB] = p1CombatUnits(state);
    const posA = unitA.position;
    const posB = unitB.position;

    state = apply(state, {
      type: "SWAP_COMBAT_UNITS",
      playerId: "p1",
      unitIdA: unitA.id,
      unitIdB: unitB.id
    });

    expect(state.combat?.units[unitA.id].position).toBe(posB);
    expect(state.combat?.units[unitB.id].position).toBe(posA);
    expect(state.players.p1.hand).not.toContain("ability.tactics");
    expect(state.players.p1.discard).toContain("ability.tactics");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(state.phase).toBe("combat");
  });

  it("is NOT offered once the active unit has already moved", () => {
    const state = combatWithFreshActiveUnit();
    state.combat!.units[state.combat!.activeUnitId!].movedThisActivation = true;
    const swaps = getLegalActions(state, "p1").filter((a) => a.action.type === "SWAP_COMBAT_UNITS");
    expect(swaps).toHaveLength(0);
  });

  it("is NOT offered without an available expert use", () => {
    const state = combatWithFreshActiveUnit();
    state.players.p1.limits.expertUses = 0;
    const swaps = getLegalActions(state, "p1").filter((a) => a.action.type === "SWAP_COMBAT_UNITS");
    expect(swaps).toHaveLength(0);
  });

  it("rejects a direct expert swap once the unit has moved", () => {
    const state = combatWithFreshActiveUnit();
    const [unitA, unitB] = p1CombatUnits(state);
    state.combat!.units[state.combat!.activeUnitId!].movedThisActivation = true;
    const result = applyAction(state, {
      type: "SWAP_COMBAT_UNITS",
      playerId: "p1",
      unitIdA: unitA.id,
      unitIdB: unitB.id
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Diplomacy — card definition
// ===========================================================================

describe("Diplomacy card definition", () => {
  it("is an implemented CHOOSE_ONE with a Map recruit and an Instant skip", () => {
    const card = cardLibrary["ability.diplomacy"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type === "CHOOSE_ONE") {
      expect(card.effect.options[0].effect.type).toBe("DIPLOMACY_RECRUIT");
      expect(card.effect.options[0].mapOnly).toBe(true);
      expect(card.effect.options[1].effect.type).toBe("DIPLOMACY_SKIP_COMBAT");
    }
  });

  it("the Instant skip side cannot be played directly through PLAY_CARD", () => {
    const state = refreshP1(makeGame());
    state.players.p1.hand = ["ability.diplomacy"];
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.diplomacy",
      optionIndex: 1,
      target: { type: "none" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Diplomacy — Map recruit (regular)
// ===========================================================================

describe("Diplomacy — Map recruit", () => {
  function withBronzeDwelling(): GameState {
    const state = refreshP1(makeGame());
    const player = state.players.p1;
    player.resources.gold = 50;
    player.resources.buildingMaterials = 50;
    player.resources.valuables = 50;
    player.hand = ["ability.diplomacy"];
    getTownOfPlayer(state, "p1")!.buildings.push("castle.dwelling_bronze");
    return state;
  }

  it("offers the Map play only with at least one Dwelling", () => {
    // No Dwelling: the Map option is gated out.
    const bare = refreshP1(makeGame());
    bare.players.p1.hand = ["ability.diplomacy"];
    const town = getTownOfPlayer(bare, "p1")!;
    town.buildings = town.buildings.filter(
      (id) => id !== "castle.dwelling_bronze" && id !== "castle.dwelling_silver" && id !== "castle.dwelling_gold"
    );
    expect(
      getLegalActions(bare, "p1").some(
        (a) => a.action.type === "PLAY_CARD" && a.action.cardId === "ability.diplomacy"
      )
    ).toBe(false);

    // With a Dwelling: the Map option appears.
    const ready = withBronzeDwelling();
    expect(
      getLegalActions(ready, "p1").some(
        (a) => a.action.type === "PLAY_CARD" && a.action.cardId === "ability.diplomacy"
      )
    ).toBe(true);
  });

  it("draws one Neutral card per Dwelling and recruits the chosen unit, paying its cost", () => {
    let state = withBronzeDwelling();
    const goldBefore = state.players.p1.resources.gold;
    const armyBefore = state.players.p1.army.length;

    const play = getLegalActions(state, "p1").find(
      (a) => a.action.type === "PLAY_CARD" && a.action.cardId === "ability.diplomacy"
    );
    expect(play).toBeTruthy();
    state = apply(state, play!.action);

    // The Diplomacy card was spent, the draw was logged, and a recruit choice opened.
    expect(state.players.p1.hand).not.toContain("ability.diplomacy");
    const drawn = state.eventLog.find((event) => event.type === "DIPLOMACY_NEUTRALS_DRAWN");
    expect(drawn?.type === "DIPLOMACY_NEUTRALS_DRAWN" && drawn.unitDefIds.length).toBeGreaterThanOrEqual(1);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("diplomacy-recruit");

    // Recruit the first offered unit.
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (state.pendingChoice as { id: string }).id,
      optionIndex: 0
    });

    expect(state.players.p1.army.length).toBe(armyBefore + 1);
    expect(state.players.p1.army.at(-1)!.side).toBe("neutral");
    expect(state.players.p1.resources.gold).toBeLessThan(goldBefore);
    const recruited = state.eventLog.find((event) => event.type === "UNIT_RECRUITED");
    expect(recruited).toBeTruthy();
  });

  it("recruiting nothing keeps the army and returns the drawn cards to their deck", () => {
    let state = withBronzeDwelling();
    const armyBefore = state.players.p1.army.length;
    const goldBefore = state.players.p1.resources.gold;
    const bronze = state.decks[NEUTRAL_DECK_IDS.bronze];
    const drawPileBefore = bronze.drawPile.length;
    const discardBefore = bronze.discardPile.length;

    const play = getLegalActions(state, "p1").find(
      (a) => a.action.type === "PLAY_CARD" && a.action.cardId === "ability.diplomacy"
    )!;
    state = apply(state, play.action);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    const declineIndex =
      choice?.type === "OPTION_CHOICE" ? choice.options.findIndex((option) => option.label === "Recruit none") : -1;
    expect(declineIndex).toBeGreaterThanOrEqual(0);

    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: declineIndex
    });

    // No unit recruited, no gold spent; the drawn card returned to the deck.
    expect(state.players.p1.army.length).toBe(armyBefore);
    expect(state.players.p1.resources.gold).toBe(goldBefore);
    const afterBronze = state.decks[NEUTRAL_DECK_IDS.bronze];
    expect(afterBronze.drawPile.length + afterBronze.discardPile.length).toBe(drawPileBefore + discardBefore);
  });
});

// ===========================================================================
// Diplomacy — Instant skip (regular)
// ===========================================================================

describe("Diplomacy — Instant skip a matching-level Neutral fight", () => {
  it("offers a skip-or-fight pop-up when the field difficulty equals the hero's level", () => {
    let state = refreshP1(makeGame());
    state.players.p1.hand = ["ability.diplomacy"];
    expect(getMainHero(state, "p1")!.level).toBe(1); // h:9:1 mine is difficulty 1

    state = moveOntoGuardedMine(state);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("diplomacy-skip");
    expect(state.combat).toBeNull();
  });

  it("skipping claims the field, spends the card and grants no experience", () => {
    let state = refreshP1(makeGame());
    state.players.p1.hand = ["ability.diplomacy"];
    const hero = getMainHero(state, "p1")!;
    const xpBefore = hero.experience;

    state = moveOntoGuardedMine(state);
    const choiceId = (state.pendingChoice as { id: string }).id;
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 });

    // No combat happened, the field is claimed, the card is spent, no XP gained.
    expect(state.combat).toBeNull();
    expect(state.players.p1.hand).not.toContain("ability.diplomacy");
    expect(state.players.p1.discard).toContain("ability.diplomacy");
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBe("p1");
    expect(getMainHero(state, "p1")!.experience).toBe(xpBefore);
    expect(state.eventLog.some((event) => event.type === "DIPLOMACY_COMBAT_SKIPPED")).toBe(true);
  });

  it("choosing to fight proceeds to normal Combat Setup and keeps the card", () => {
    let state = refreshP1(makeGame());
    state.players.p1.hand = ["ability.diplomacy"];

    state = moveOntoGuardedMine(state);
    const choiceId = (state.pendingChoice as { id: string }).id;
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 1 });

    expect(state.combat).not.toBeNull();
    expect(state.phase).toBe("combat-setup");
    expect(state.players.p1.hand).toContain("ability.diplomacy");
  });

  it("does not pop up (normal combat starts) without the Diplomacy card in hand", () => {
    let state = refreshP1(makeGame());
    state.players.p1.hand = []; // no Diplomacy
    state = moveOntoGuardedMine(state);
    expect(state.pendingChoice).toBeNull();
    expect(state.combat).not.toBeNull();
  });

  it("does not pop up when the hero out-levels the field (quick combat wins instead)", () => {
    let state = refreshP1(makeGame());
    state.players.p1.hand = ["ability.diplomacy"];
    getMainHero(state, "p1")!.level = 3; // beats the level-1 mine outright

    state = moveOntoGuardedMine(state);
    expect(state.pendingChoice).toBeNull();
    expect(state.combat).toBeNull();
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBe("p1");
  });
});

// ===========================================================================
// startNeutralEncounter wiring (matching level, no Diplomacy held)
// ===========================================================================

describe("Diplomacy skip is gated on matching level", () => {
  it("a level-2 hero meeting level-2 guards while holding Diplomacy is offered the skip", () => {
    const state = refreshP1(makeGame());
    const hero = getMainHero(state, "p1")!;
    hero.level = 2;
    hero.spaceId = "test-field";
    state.players.p1.hand = ["ability.diplomacy"];
    state.adventure!.fields["test-field"] = {
      spaceId: "test-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 2,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    startNeutralEncounter(state, hero, state.adventure!.fields["test-field"]);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("diplomacy-skip");
  });

  it("a level-1 hero meeting level-2 guards is NOT offered the skip (mismatched level)", () => {
    const state = refreshP1(makeGame());
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "test-field";
    state.players.p1.hand = ["ability.diplomacy"];
    state.adventure!.fields["test-field"] = {
      spaceId: "test-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 2,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    startNeutralEncounter(state, hero, state.adventure!.fields["test-field"]);
    // Mismatched level: straight to Combat Setup, no skip pop-up.
    expect(state.pendingChoice).toBeNull();
    expect(state.combat).not.toBeNull();
  });

  it("empowered skip claims the field and resolves its effect WITHOUT spending a crown", () => {
    let state = refreshP1(makeGame());
    const hero = getMainHero(state, "p1")!;
    hero.level = 2;
    hero.spaceId = "test-field";
    state.players.p1.hand = ["ability.diplomacy"];
    // A crown is available — the Empowered skip (expert effect) must not spend it.
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    const xpBefore = hero.experience;
    state.adventure!.fields["test-field"] = {
      spaceId: "test-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 2,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    startNeutralEncounter(state, hero, state.adventure!.fields["test-field"]);
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("diplomacy-skip");
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });

    // Claims the field (resolving its effect — the mine is flagged) for no XP...
    expect(state.adventure!.fields["test-field"].flagOwnerId).toBe("p1");
    expect(getMainHero(state, "p1")!.experience).toBe(xpBefore);
    expect(state.combat).toBeNull();
    // ...and the Empowered mechanic spends NO expert use (crown).
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(state.players.p1.limits.expertUses).toBe(1);
    // The card is spent for that one use (either side).
    expect(state.players.p1.discard).toContain("ability.diplomacy");
  });
});
