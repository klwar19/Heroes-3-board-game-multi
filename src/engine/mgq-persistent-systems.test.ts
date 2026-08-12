import { describe, expect, it } from "vitest";

import { UNIT_RANK_THRESHOLDS } from "@/data/units/experience";
import {
  applyAction,
  combatUnitLimit,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  makeCombatUnitFromArmy,
  NEUTRAL_DECK_IDS,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState
} from "./index";
import { chooseComputerAction } from "./computer";
import { nextAfkDropAction } from "./afk-drop";
import type { PlayerVisibleState } from "./state";
import { mainHeroInOwnTown } from "./adventure";
import { mgqCompanionOptionsAfterCombat, startNeutralEncounter } from "./adventure-reducer";
import type { CombatState, MapFieldState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function mgqMapState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    players: [
      { id: "p1", name: "Luka", factionId: "mgq", heroDefId: "luka" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.canOpeningMulligan = false;
  }
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  state.priorityPlayerId = null;
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.combat = null;
  state.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
  state.players.p1.mgqGoldContracts = ["mgq.carmilla", "mgq.giga"];
  state.players.p1.mgqGoldContractSetupRequired = false;
  state.players.p1.townTokens.population = true;
  expect(mainHeroInOwnTown(state, "p1"), "fixture must keep Luka in his own Town").toBe(true);
  return state;
}

function stageNeutralDiscard(state: GameState, unitDefId: string, tier: "bronze" | "silver"): void {
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  deck.drawPile = deck.drawPile.filter((cardId) => cardId !== unitDefId);
  deck.discardPile = deck.discardPile.filter((cardId) => cardId !== unitDefId);
  deck.discardPile.push(unitDefId);
}

function targetedCardCount(state: GameState, unitDefId: string, tier: "bronze" | "silver"): number {
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  return (
    deck.drawPile.filter((cardId) => cardId === unitDefId).length +
    deck.discardPile.filter((cardId) => cardId === unitDefId).length +
    state.players.p1.army.filter((unit) => unit.unitDefId === unitDefId).length
  );
}

describe("MGQ persistent per-card Jobs", () => {
  it("Pocket Castle Kitchen grants one real free Job reassignment and keeps the gold City Hall option intact", () => {
    let state = mgqMapState("mgq-kitchen-job-charge");
    state.players.p1.army = [
      { id: "kitchen-pochi", unitDefId: "mgq.pochi", side: "few", job: "warrior" }
    ];
    state.players.p1.resources.gold = 5;
    state.pendingChoice = {
      id: "choice_mgq_kitchen",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Pocket Castle Kitchen: choose this round's bonus",
      options: [{ label: "Gain 4 gold" }, { label: "Reassign one Job for free" }],
      context: "city-hall",
      cityHall: {
        options: [
          { label: "Gain 4 gold", gold: 4 },
          { label: "Reassign one Job for free", freeJobReassign: true }
        ]
      },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_mgq_kitchen",
      optionIndex: 1
    });
    expect(state.players.p1.mgqFreeJobReassignments).toBe(1);
    expect(state.players.p1.resources.gold).toBe(5);

    state = applyOk(state, {
      type: "ASSIGN_UNIT_JOB",
      playerId: "p1",
      armyUnitId: "kitchen-pochi",
      job: "guard"
    });
    expect(state.players.p1.army[0]?.job).toBe("guard");
    expect(state.players.p1.mgqFreeJobReassignments).toBe(0);
    expect(state.players.p1.resources.gold).toBe(5);

    let goldState = mgqMapState("mgq-kitchen-gold-control");
    goldState.players.p1.resources.gold = 5;
    goldState.pendingChoice = {
      id: "choice_mgq_kitchen_gold",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Pocket Castle Kitchen: choose this round's bonus",
      options: [{ label: "Gain 4 gold" }, { label: "Reassign one Job for free" }],
      context: "city-hall",
      cityHall: {
        options: [
          { label: "Gain 4 gold", gold: 4 },
          { label: "Reassign one Job for free", freeJobReassign: true }
        ]
      },
      returnPhase: "player-turn"
    };
    goldState.phase = "choice";
    goldState.priorityPlayerId = "p1";
    goldState = applyOk(goldState, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_mgq_kitchen_gold",
      optionIndex: 0
    });
    expect(goldState.players.p1.resources.gold).toBe(9);
    expect(goldState.players.p1.mgqFreeJobReassignments ?? 0).toBe(0);
  });

  it("pays for assignment/reassignment and swaps both the base package and rank-3 signature", () => {
    let state = mgqMapState("mgq-job-swap-outcome");
    const card = {
      id: "pochi-job-card",
      unitDefId: "mgq.pochi",
      side: "few" as const,
      experience: UNIT_RANK_THRESHOLDS.bronze[2],
      job: "warrior" as const
    };
    state.players.p1.army = [card];
    state.players.p1.resources.gold = 10;

    const warrior = makeCombatUnitFromArmy(card, "p1", "warrior-pochi", 16)!;
    expect(warrior.abilities).toEqual(
      expect.arrayContaining(["attack-roll-advantage", "ignores-retaliation"])
    );

    state = applyOk(state, {
      type: "ASSIGN_UNIT_JOB",
      playerId: "p1",
      armyUnitId: card.id,
      job: "guard"
    });
    expect(state.players.p1.resources.gold).toBe(8);
    expect(state.players.p1.army[0]?.job).toBe("guard");
    const guard = makeCombatUnitFromArmy(state.players.p1.army[0]!, "p1", "guard-pochi", 16)!;
    expect(guard.abilities).toEqual(
      expect.arrayContaining(["commander-defense-token", "unlimited-retaliation"])
    );
    expect(guard.abilities).not.toContain("attack-roll-advantage");
    expect(guard.abilities).not.toContain("ignores-retaliation");

    state = applyOk(state, {
      type: "ASSIGN_UNIT_JOB",
      playerId: "p1",
      armyUnitId: card.id,
      job: "mage"
    });
    expect(state.players.p1.resources.gold).toBe(6);
    const mage = makeCombatUnitFromArmy(state.players.p1.army[0]!, "p1", "mage-pochi", 16)!;
    expect(mage.abilities).toEqual(
      expect.arrayContaining(["mgq-mage-magic-arrow", "titan-ignore-ongoing"])
    );
    expect(mage.abilities).not.toContain("commander-defense-token");
    expect(mage.abilities).not.toContain("unlimited-retaliation");
  });

  it("lets a sealed Companion take a Job, spends a Kitchen charge first, and rejects an ordinary Neutral atomically", () => {
    let state = mgqMapState("mgq-companion-job-eligibility");
    state.players.p1.army = [
      { id: "sealed-minotaur", unitDefId: "neutral.minotaurs", side: "neutral", companion: true },
      { id: "plain-griffin", unitDefId: "neutral.griffins", side: "neutral" }
    ];
    state.players.p1.resources.gold = 5;
    state.players.p1.mgqFreeJobReassignments = 1;

    state = applyOk(state, {
      type: "ASSIGN_UNIT_JOB",
      playerId: "p1",
      armyUnitId: "sealed-minotaur",
      job: "healer"
    });
    expect(state.players.p1.resources.gold).toBe(5);
    expect(state.players.p1.mgqFreeJobReassignments).toBe(0);
    expect(state.players.p1.army[0]?.job).toBe("healer");

    const rejected = applyAction(state, {
      type: "ASSIGN_UNIT_JOB",
      playerId: "p1",
      armyUnitId: "plain-griffin",
      job: "guard"
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state.players.p1.resources.gold).toBe(5);
    expect(rejected.state.players.p1.army[1]?.job).toBeUndefined();
  });
});

describe("MGQ Companion Recruitment transaction", () => {
  it("offers only actually defeated, eligible bronze/silver cards from a main-hero neutral win", () => {
    const state = mgqMapState("mgq-companion-eligibility");
    const hero = getMainHero(state, "p1")!;
    const combat = createInitialGameState("mgq-companion-combat-shell").combat!;
    combat.context = {
      kind: "neutral",
      heroId: hero.id,
      fieldId: "mgq-companion-field",
      difficulty: 2,
      hasAzure: false
    };
    combat.attackerPlayerId = "p1";
    combat.defenderPlayerId = NEUTRAL_PLAYER_ID;
    combat.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    const defeatedBronze = makeCombatUnitFromArmy(
      { id: "neutral-griffin-card", unitDefId: "neutral.griffins", side: "neutral" },
      NEUTRAL_PLAYER_ID,
      "defeated-bronze",
      0
    )!;
    const defeatedSilver = makeCombatUnitFromArmy(
      { id: "neutral-medusa-card", unitDefId: "neutral.medusas", side: "neutral" },
      NEUTRAL_PLAYER_ID,
      "defeated-silver",
      1
    )!;
    const survivor = makeCombatUnitFromArmy(
      { id: "neutral-halberdier-card", unitDefId: "neutral.halberdiers", side: "neutral" },
      NEUTRAL_PLAYER_ID,
      "surviving-bronze",
      2
    )!;
    const gold = makeCombatUnitFromArmy(
      { id: "neutral-dread-knight-card", unitDefId: "neutral.dread_knights", side: "neutral" },
      NEUTRAL_PLAYER_ID,
      "defeated-gold",
      3
    )!;
    const summon = makeCombatUnitFromArmy(
      { id: "summoned-card", unitDefId: "neutral.halberdiers", side: "neutral" },
      NEUTRAL_PLAYER_ID,
      "defeated-summon",
      4
    )!;
    defeatedBronze.damage = defeatedBronze.maxHealth;
    defeatedSilver.damage = defeatedSilver.maxHealth;
    survivor.damage = survivor.maxHealth - 1;
    gold.damage = gold.maxHealth;
    summon.damage = summon.maxHealth;
    summon.summoned = true;
    combat.units = {
      [defeatedBronze.id]: defeatedBronze,
      [defeatedSilver.id]: defeatedSilver,
      [survivor.id]: survivor,
      [gold.id]: gold,
      [summon.id]: summon
    };

    expect(mgqCompanionOptionsAfterCombat(state, combat as CombatState)).toEqual([
      { unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 7 } },
      { unitDefId: "neutral.medusas", tier: "silver", cost: { gold: 11 } }
    ]);

    combat.context = { ...combat.context, bankId: "dragon_utopia" };
    expect(mgqCompanionOptionsAfterCombat(state, combat as CombatState)).toEqual([]);
    combat.context = {
      kind: "player",
      attackerHeroId: hero.id,
      defenderHeroId: getMainHero(state, "p2")!.id,
      fieldId: "mgq-companion-field"
    };
    expect(mgqCompanionOptionsAfterCombat(state, combat as CombatState)).toEqual([]);
  });

  it("uses the combat-start unit snapshot, excluding an unflagged body added after round 1 began", () => {
    let state = mgqMapState("mgq-companion-start-snapshot");
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "mgq-companion-snapshot-field";
    const field: MapFieldState = {
      spaceId: hero.spaceId,
      tileInstanceId: "mgq-companion-snapshot-tile",
      slot: 0,
      location: "guard",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[field.spaceId] = field;
    state.players.p1.hand = [];
    state.decks[NEUTRAL_DECK_IDS.bronze].drawPile = ["neutral.griffins"];
    state.decks[NEUTRAL_DECK_IDS.bronze].discardPile = [];

    startNeutralEncounter(state, hero, field);
    const place = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLACE_COMBAT_UNIT"
    );
    expect(place, "MGQ must be able to deploy a card").toBeTruthy();
    state = applyOk(state, place!.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const combat = state.combat!;
    const actualStartCard = Object.values(combat.units).find(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.unitDefId === "neutral.griffins"
    );
    expect(actualStartCard, "the exact guard must be present at combat start").toBeTruthy();
    expect(combat.mgqCompanionStartDefenderUnitIds).toEqual([actualStartCard!.id]);

    // This body is intentionally indistinguishable from an ordinary Neutral
    // card by the old post-combat checks: no summoned/temporary/bank/boss flag.
    // Its only disqualifier is that its unit-instance id was not in the frozen
    // round-1 snapshot.
    const spawnedLooking = makeCombatUnitFromArmy(
      { id: "late-medusa-card", unitDefId: "neutral.medusas", side: "neutral" },
      NEUTRAL_PLAYER_ID,
      "late-unflagged-medusa",
      4
    )!;
    combat.units[spawnedLooking.id] = spawnedLooking;
    actualStartCard!.damage = actualStartCard!.maxHealth;
    spawnedLooking.damage = spawnedLooking.maxHealth;
    combat.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };

    expect(mgqCompanionOptionsAfterCombat(state, combat)).toEqual([
      { unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 7 } }
    ]);
  });

  it("accepts at printed cost, moves exactly one physical card, marks it as a Companion, and keeps the normal deployment cap", () => {
    let state = mgqMapState("mgq-companion-accept-conservation");
    const player = state.players.p1;
    player.army = [
      { id: "a1", unitDefId: "mgq.pochi", side: "few" },
      { id: "a2", unitDefId: "mgq.shesta", side: "few" },
      { id: "a3", unitDefId: "mgq.gigi", side: "few" },
      { id: "a4", unitDefId: "mgq.kamuro_kitsu", side: "few" },
      { id: "a5", unitDefId: "mgq.fleesia", side: "few" }
    ];
    player.resources = { gold: 7, buildingMaterials: 4, valuables: 3 };
    stageNeutralDiscard(state, "neutral.griffins", "bronze");
    state.adventure!.pendingCompanionRecruitment = {
      playerId: "p1",
      heroId: getMainHero(state, "p1")!.id,
      options: [{ unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 7 } }]
    };
    const deploymentLimitBefore = combatUnitLimit(state);
    expect(targetedCardCount(state, "neutral.griffins", "bronze")).toBe(1);

    state = applyOk(state, {
      type: "RESOLVE_COMPANION_RECRUITMENT",
      playerId: "p1",
      unitDefId: "neutral.griffins"
    });
    expect(player).not.toBe(state.players.p1);
    expect(state.players.p1.resources).toEqual({ gold: 0, buildingMaterials: 4, valuables: 3 });
    expect(targetedCardCount(state, "neutral.griffins", "bronze")).toBe(1);
    expect(state.decks[NEUTRAL_DECK_IDS.bronze].discardPile).not.toContain("neutral.griffins");
    expect(state.players.p1.army).toHaveLength(6);
    expect(state.players.p1.army.at(-1)).toMatchObject({
      unitDefId: "neutral.griffins",
      side: "neutral",
      companion: true
    });
    expect(combatUnitLimit(state)).toBe(deploymentLimitBefore);
    expect(combatUnitLimit(state)).toBeLessThan(state.players.p1.army.length);
    expect(state.adventure?.pendingCompanionRecruitment ?? null).toBeNull();
  });

  it("rejects unaffordable or missing-card accepts without spending, minting, or closing the offer", () => {
    const unaffordable = mgqMapState("mgq-companion-cost-atomic");
    unaffordable.players.p1.resources = { gold: 6, buildingMaterials: 0, valuables: 0 };
    stageNeutralDiscard(unaffordable, "neutral.griffins", "bronze");
    unaffordable.adventure!.pendingCompanionRecruitment = {
      playerId: "p1",
      heroId: getMainHero(unaffordable, "p1")!.id,
      options: [{ unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 7 } }]
    };
    const armyBefore = unaffordable.players.p1.army.length;
    const failedCost = applyAction(unaffordable, {
      type: "RESOLVE_COMPANION_RECRUITMENT",
      playerId: "p1",
      unitDefId: "neutral.griffins"
    });
    expect(failedCost.errors.length).toBeGreaterThan(0);
    expect(failedCost.state.players.p1.resources.gold).toBe(6);
    expect(failedCost.state.players.p1.army).toHaveLength(armyBefore);
    expect(targetedCardCount(failedCost.state, "neutral.griffins", "bronze")).toBe(1);
    expect(failedCost.state.adventure?.pendingCompanionRecruitment).not.toBeNull();

    const missing = mgqMapState("mgq-companion-card-atomic");
    missing.players.p1.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    const deck = missing.decks[NEUTRAL_DECK_IDS.bronze];
    deck.drawPile = deck.drawPile.filter((cardId) => cardId !== "neutral.griffins");
    deck.discardPile = deck.discardPile.filter((cardId) => cardId !== "neutral.griffins");
    missing.adventure!.pendingCompanionRecruitment = {
      playerId: "p1",
      heroId: getMainHero(missing, "p1")!.id,
      options: [{ unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 7 } }]
    };
    const failedCard = applyAction(missing, {
      type: "RESOLVE_COMPANION_RECRUITMENT",
      playerId: "p1",
      unitDefId: "neutral.griffins"
    });
    expect(failedCard.errors.length).toBeGreaterThan(0);
    expect(failedCard.state.players.p1.resources.gold).toBe(20);
    expect(failedCard.state.players.p1.army.some((unit) => unit.unitDefId === "neutral.griffins")).toBe(false);
    expect(failedCard.state.adventure?.pendingCompanionRecruitment).not.toBeNull();
  });

  it("decline conserves the card and releases the deferred field reward only after the atomic window closes", () => {
    let state = mgqMapState("mgq-companion-decline-deferred");
    const hero = getMainHero(state, "p1")!;
    const fieldId = "mgq-atomic-water-wheel";
    hero.spaceId = fieldId;
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "mgq-atomic-tile",
      slot: 0,
      location: "water_wheel",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } satisfies MapFieldState;
    state.players.p1.resources.gold = 4;
    stageNeutralDiscard(state, "neutral.griffins", "bronze");
    state.adventure!.pendingCompanionRecruitment = {
      playerId: "p1",
      heroId: hero.id,
      options: [{ unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 7 } }],
      deferredReward: { kind: "field-visit", heroId: hero.id, fieldId }
    };
    const armyBefore = state.players.p1.army.length;
    expect(state.players.p1.resources.gold).toBe(4);
    expect(state.adventure!.fields[fieldId]?.blackCube).toBe(false);

    state = applyOk(state, {
      type: "RESOLVE_COMPANION_RECRUITMENT",
      playerId: "p1",
      unitDefId: null
    });
    expect(state.adventure?.pendingCompanionRecruitment ?? null).toBeNull();
    expect(state.players.p1.army).toHaveLength(armyBefore);
    expect(targetedCardCount(state, "neutral.griffins", "bronze")).toBe(1);
    expect(state.players.p1.resources.gold).toBe(7);
    expect(state.adventure?.fields[fieldId]?.blackCube).toBe(true);
  });
});

describe("MGQ two-choice Gold Contract", () => {
  function goldSetup(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Luka", factionId: "mgq", heroDefId: "luka" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    state.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings = ["mgq.dwelling_bronze", "mgq.dwelling_silver", "mgq.dwelling_gold"];
    state.players.p1.army = state.players.p1.army.filter(
      (unit) => !["mgq.carmilla", "mgq.giga", "mgq.lucretia"].includes(unit.unitDefId)
    );
    return state;
  }

  const recruit = (unitDefId: string): GameAction => ({
    type: "POPULATION_ACTION",
    playerId: "p1",
    purchases: [{ kind: "recruit", unitDefId }]
  });

  it("opens one atomic 56-trio setup choice and commits exactly the selected three identities", () => {
    let state = goldSetup("mgq-gold-contract-setup");
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("mgq-gold-contract");
    if (choice?.type !== "OPTION_CHOICE" || !choice.mgqGoldContract) throw new Error("missing Gold setup");
    expect(choice.mgqGoldContract.pairs).toHaveLength(56);
    expect(getLegalActions(state, "p1")).toHaveLength(56);
    expect(state.players.p1.mgqGoldContracts).toEqual([]);
    const optionIndex = choice.mgqGoldContract.pairs.findIndex(
      ([first, second, third]) => first === "mgq.carmilla" && second === "mgq.giga" && third === "mgq.lucifina_chan"
    );
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    state = structuredClone(state);
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.mgqGoldContractSetupRequired).toBe(false);
    expect(state.players.p1.mgqGoldContracts).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);

    const goldRecruitIds = getLegalActions(state, "p1")
      .filter((legal) => legal.action.type === "POPULATION_ACTION")
      .flatMap((legal) => legal.action.type === "POPULATION_ACTION" ? legal.action.purchases.map((purchase) => purchase.unitDefId) : [])
      .filter((unitDefId) => unitDefId.startsWith("mgq."));
    expect(goldRecruitIds).toEqual(expect.arrayContaining(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]));
    expect(goldRecruitIds).not.toContain("mgq.lucretia");
  });

  it("rejects an uncontracted third identity atomically and keeps either selected identity recruitable", () => {
    let state = goldSetup("mgq-gold-contract-lock");
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE" || !choice.mgqGoldContract) throw new Error("missing Gold setup");
    const optionIndex = choice.mgqGoldContract.pairs.findIndex(
      ([first, second, third]) => first === "mgq.carmilla" && second === "mgq.giga" && third === "mgq.lucifina_chan"
    );
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });

    const goldBefore = state.players.p1.resources.gold;
    const armyBefore = state.players.p1.army.length;
    const blocked = applyAction(state, recruit("mgq.lucretia"));
    expect(blocked.errors.some((error) => /Gold Contract/i.test(error.message))).toBe(true);
    expect(blocked.state.players.p1.resources.gold).toBe(goldBefore);
    expect(blocked.state.players.p1.army).toHaveLength(armyBefore);
    expect(blocked.state.players.p1.mgqGoldContracts).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);

    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "mgq.carmilla");
    state = applyOk(state, recruit("mgq.carmilla"));
    expect(state.players.p1.mgqGoldContracts).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);
    expect(state.players.p1.army.filter((unit) => unit.unitDefId === "mgq.carmilla")).toHaveLength(1);
  });

  it("AI and AFK drivers both answer the mandatory setup window with a legal pair", () => {
    const state = goldSetup("mgq-gold-contract-auto");
    const legalActions = getLegalActions(state, "p1");
    const decision = chooseComputerAction({
      playerId: "p1",
      state: state as unknown as PlayerVisibleState,
      legalActions
    });
    expect(decision?.action.type).toBe("CHOOSE_OPTION");
    expect(decision?.policy).toBe("choice.mgq-gold-contract");

    state.afk = { lastActionAt: {}, vote: null, droppingPlayerId: "p1" };
    const afkAction = nextAfkDropAction(state, "p1");
    expect(afkAction?.type).toBe("CHOOSE_OPTION");
    const resolved = applyOk(state, afkAction!);
    expect(resolved.players.p1.mgqGoldContracts).toHaveLength(3);
    expect(resolved.players.p1.mgqGoldContractSetupRequired).toBe(false);
  });

  it("cuts custom Gold starting armies down to the same three selected physical identities", () => {
    let state = createAdventureGameState({
      seed: "mgq-gold-contract-custom-start",
      difficulty: "normal",
      rollFirstPlayer: false,
      startingUnits: Array.from({ length: 8 }, () => ({ tier: "gold" as const, side: "few" as const })),
      players: [
        { id: "p1", name: "Luka", factionId: "mgq", heroDefId: "luka" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    expect(state.players.p1.army.filter((unit) => unit.unitDefId.startsWith("mgq."))).toHaveLength(8);
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE" || !choice.mgqGoldContract) throw new Error("missing Gold setup");
    const optionIndex = choice.mgqGoldContract.pairs.findIndex(
      ([first, second, third]) => first === "mgq.carmilla" && second === "mgq.giga" && third === "mgq.lucifina_chan"
    );
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
    expect(state.players.p1.army.map((unit) => unit.unitDefId).sort()).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);
    expect(state.players.p1.startingArmy.map((unit) => unit.unitDefId).sort()).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);
  });

  it("keeps legacy snapshots without the setup marker recruitable and bounded to three identities", () => {
    let state = mgqMapState("mgq-gold-contract-legacy");
    delete state.players.p1.mgqGoldContracts;
    delete state.players.p1.mgqGoldContractSetupRequired;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings = ["mgq.dwelling_gold"];
    state.players.p1.army = [];
    state = applyOk(state, recruit("mgq.carmilla"));
    state = applyOk(state, recruit("mgq.giga"));
    state = applyOk(state, recruit("mgq.lucifina_chan"));
    expect(state.players.p1.mgqGoldContracts).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);

    const resourcesBefore = { ...state.players.p1.resources };
    const rejected = applyAction(state, recruit("mgq.lucretia"));
    expect(rejected.errors.some((error) => /Gold Contract/i.test(error.message))).toBe(true);
    expect(rejected.state.players.p1.resources).toEqual(resourcesBefore);
  });

  it("rejects a batch containing an uncontracted Gold before any card or resource mutation", () => {
    let state = goldSetup("mgq-gold-contract-batch-atomic");
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE" || !choice.mgqGoldContract) throw new Error("missing Gold setup");
    const optionIndex = choice.mgqGoldContract.pairs.findIndex(
      ([first, second, third]) => first === "mgq.carmilla" && second === "mgq.giga" && third === "mgq.lucifina_chan"
    );
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
    const resourcesBefore = { ...state.players.p1.resources };
    const armyBefore = state.players.p1.army.length;
    const result = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [
        { kind: "recruit", unitDefId: "mgq.lucretia" }
      ]
    });
    expect(result.errors.some((error) => /Gold Contract/i.test(error.message))).toBe(true);
    expect(result.state.players.p1.resources).toEqual(resourcesBefore);
    expect(result.state.players.p1.army).toHaveLength(armyBefore);
    expect(result.state.players.p1.mgqGoldContracts).toEqual(["mgq.carmilla", "mgq.giga", "mgq.lucifina_chan"]);
  });
});
