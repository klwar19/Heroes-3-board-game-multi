import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect } from "@/data/factions/types";
import { createAdventureGameState } from "../adventure-setup";
import type { GameAction, GameState, PlayerVisibleState } from "../state";
import { scoreCardAction } from "./card-policy";
import {
  armyDevelopmentProfile,
  developmentResourceTargets,
  hasOpenedFarEconomy,
  incomeBuildingBeforeDwelling,
  nextGoldLadderStep,
  openingCorePackTarget,
  preferredOpeningPacks,
  rankedGoldUnits,
  shouldLaunchBronzeRush,
} from "./development";
import { resourceDeficits, scoreMapAction } from "./map-policy";
import { observeForComputer } from "./observation";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";
import { polishUnitStackCost } from "../polish-unit-stacks";

function game(): GameState {
  return createAdventureGameState({
    seed: "computer-development",
    scenarioId: "skirmish",
    playerCount: 2,
    events: false,
    rollFirstPlayer: false,
  });
}

function observation(state: GameState): ComputerObservation {
  return {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: [],
  };
}

function buildingWith(
  state: GameState,
  predicate: (effect: TownBuildingEffect) => boolean,
): string {
  const factionId = state.players.p2.factionId!;
  const buildingId = coreFactionDefinitions[factionId].buildings.find((id) => {
    const effect = coreBuildingDefinitions[id]?.effect;
    return effect ? predicate(effect) : false;
  });
  if (!buildingId) throw new Error("fixture faction is missing a required building");
  return buildingId;
}

function establishPacks(state: GameState): void {
  for (const unit of state.players.p2.army) unit.side = "pack";
}

describe("computer long-horizon development plan", () => {
  it("requires both Elves and Dwarves Packs before the Rampart Silver pivot", () => {
    const state = game();
    state.players.p2.factionId = "rampart";
    state.players.p2.army = ["rampart.centaurs", "rampart.dwarves", "rampart.elves"].map(
      (unitDefId, index) => ({ id: `rampart-${index}`, unitDefId, side: "few" as const }),
    );
    const town = Object.values(state.towns).find(
      (candidate) => candidate.controllerId === "p2",
    )!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
      ),
    ];

    expect(openingCorePackTarget(state, "p2")).toBe(2);
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("establish-core");
    state.players.p2.army[2].side = "pack"; // double-attacking ranged Elves
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("establish-core");
    // CONTROL: an unrelated Centaur Pack cannot replace the Dwarf screen.
    state.players.p2.army[0].side = "pack";
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("establish-core");
    state.players.p2.army[0].side = "few";
    state.players.p2.army[1].side = "pack";
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");
  });

  it("reinforces the tempo Pack before cheaper low-impact upgrades", () => {
    const state = game();
    state.players.p2.factionId = "rampart";
    state.players.p2.army = ["rampart.centaurs", "rampart.dwarves", "rampart.elves"].map(
      (unitDefId, index) => ({ id: `rampart-${index}`, unitDefId, side: "few" as const }),
    );
    const scores = state.players.p2.army.map((unit) =>
      scoreMapAction(observation(state), {
        type: "POPULATION_ACTION",
        playerId: "p2",
        purchases: [{ kind: "reinforce", unitDefId: unit.unitDefId, armyUnitId: unit.id }],
      })!.score,
    );
    expect(scores[2]).toBeGreaterThan(scores[0]);
    expect(scores[2]).toBeGreaterThan(scores[1]);
  });

  it("launches the round-3 three-Bronze-Pack fallback only without Far economy", () => {
    const state = game();
    establishPacks(state);
    state.round = 2;
    expect(shouldLaunchBronzeRush(state, "p2")).toBe(false);

    state.round = 3;
    expect(hasOpenedFarEconomy(state, "p2")).toBe(false);
    expect(shouldLaunchBronzeRush(state, "p2")).toBe(true);

    const sourceTile = Object.values(state.adventure!.tiles)[0];
    const sourceField = Object.values(state.adventure!.fields)[0];
    state.adventure!.tiles["rush-far"] = {
      ...sourceTile,
      id: "rush-far",
      group: "far",
      faceDown: false,
    };
    // A Far (II-III) gold mine THIS player (p2) has FLAGGED = secured economy.
    state.adventure!.fields["h:99:99"] = {
      ...sourceField,
      spaceId: "h:99:99",
      tileInstanceId: "rush-far",
      location: "mine",
      resource: "gold",
      difficulty: undefined,
      flagOwnerId: "p2",
    };
    expect(hasOpenedFarEconomy(state, "p2")).toBe(true);
    expect(shouldLaunchBronzeRush(state, "p2")).toBe(false);

    // CONTROL: the SAME Far gold mine flagged by the OPPONENT must NOT count as
    // p2's economy — a rival opening Far economy can never flip p2's rush plan
    // (the previous global field scan wrongly did).
    state.adventure!.fields["h:99:99"].flagOwnerId = "p1";
    expect(hasOpenedFarEconomy(state, "p2")).toBe(false);
    expect(shouldLaunchBronzeRush(state, "p2")).toBe(true);
  });

  it("chooses the real legal sequence: reinforcement unlock, Packs, Silver, then Gold", () => {
    const state = game();
    state.phase = "player-turn";
    state.activePlayerId = "p2";
    state.priorityPlayerId = "p2";
    state.players.p2.canMulligan = false;
    state.players.p2.needsHandRefresh = false;
    state.players.p2.resources = {
      gold: 99,
      buildingMaterials: 99,
      valuables: 99,
    };
    const citadel = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_REINFORCE",
    );
    const bronze = buildingWith(
      state,
      (effect) =>
        effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const silver = buildingWith(
      state,
      (effect) =>
        effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
    );
    const gold = buildingWith(
      state,
      (effect) =>
        effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
    );
    const town = Object.values(state.towns).find(
      (candidate) => candidate.controllerId === "p2",
    )!;

    town.buildings = [];
    const unlock = chooseComputerAction(observeForComputer(state, "p2"));
    expect(unlock?.action).toMatchObject({
      type: "BUILD_STRUCTURE",
      buildingId: citadel,
    });

    town.buildings = [citadel, bronze];
    const pack = chooseComputerAction(observeForComputer(state, "p2"));
    expect(pack?.action.type).toBe("POPULATION_ACTION");
    const packAction = pack?.action as
      | Extract<GameAction, { type: "POPULATION_ACTION" }>
      | undefined;
    expect(packAction?.purchases[0]?.kind).toBe("reinforce");

    establishPacks(state);
    // Flush treasury: the Silver dwelling is in reach, so the situational
    // income-first step stays off and the dwelling goes up first.
    const unlockSilver = chooseComputerAction(observeForComputer(state, "p2"));
    expect(unlockSilver?.action).toMatchObject({
      type: "BUILD_STRUCTURE",
      buildingId: silver,
    });

    town.buildings.push(silver);
    const unlockGold = chooseComputerAction(observeForComputer(state, "p2"));
    expect(unlockGold?.action).toMatchObject({
      type: "BUILD_STRUCTURE",
      buildingId: gold,
    });
  });

  it("prioritizes reinforcing the three-unit core above an ordinary map march", () => {
    const state = game();
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    // Reinforce the Pack the opening actually wants first (the level-3 bronze
    // under the lv3-first order; a Necromancy hero keeps its Skeleton-first
    // earned plan). A Few-first core reinforce must still beat an ordinary march.
    const firstPack = preferredOpeningPacks(state, "p2")[0];
    const unit = state.players.p2.army.find((u) => u.unitDefId === firstPack) ?? state.players.p2.army[0];
    const score = scoreMapAction(observation(state), {
      type: "POPULATION_ACTION",
      playerId: "p2",
      purchases: [
        {
          kind: "reinforce",
          unitDefId: unit.unitDefId,
          armyUnitId: unit.id,
        },
      ],
    });
    expect(score?.score).toBeGreaterThan(900);
    expect(score?.policy).toBe("map.recruit-army");
  });

  it("dwelling-first: a side build that would eat the Silver fund waits", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");

    // City Hall is income-first (exempt from the fund guard by design), so the
    // side build must be a genuine extra.
    const side = buildingWith(
      state,
      (effect) =>
        effect.type === "MAGE_GUILD" ||
        effect.type === "RESOURCE_ROUND_SEARCH_DISCARD",
    );
    const sideCost = coreBuildingDefinitions[side].cost ?? {};
    expect(
      (sideCost.gold ?? 0) +
        (sideCost.buildingMaterials ?? 0) +
        (sideCost.valuables ?? 0),
      "fixture side building must actually cost something",
    ).toBeGreaterThan(0);
    const target = developmentResourceTargets(state, "p2");
    // Treasury EXACTLY covers the dwelling plan — any side spend breaks it.
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: target.buildingMaterials,
      valuables: target.valuables,
    };
    const buildSide: GameAction = {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: side,
    } as GameAction;
    const starved = scoreMapAction(observation(state), buildSide);
    expect(starved!.score).toBeLessThanOrEqual(280);

    // CONTROL: genuine surplus (fund + the side cost) keeps the build allowed.
    state.players.p2.resources = {
      gold: target.gold + (sideCost.gold ?? 0),
      buildingMaterials: target.buildingMaterials + (sideCost.buildingMaterials ?? 0),
      valuables: target.valuables + (sideCost.valuables ?? 0),
    };
    const flush = scoreMapAction(observation(state), buildSide);
    expect(flush!.score).toBeGreaterThan(700);
  });

  it("Necropolis builds its Necromancy engine from surplus, with less urgency once the card is held", () => {
    const state = game();
    state.players.p2.factionId = "necropolis";
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold"),
    ];
    const amplifier = buildingWith(state, (effect) => effect.type === "TURN_START_NECROMANCY");
    const cover = buildingWith(state, (effect) => effect.type === "COVER_OF_DARKNESS");
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    const build = (buildingId: string): GameAction => ({
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId,
    }) as GameAction;

    const missingEngine = scoreMapAction(observation(state), build(amplifier))!.score;
    expect(missingEngine).toBeGreaterThan(scoreMapAction(observation(state), build(cover))!.score);
    state.players.p2.hand = ["ability.necromancy"];
    expect(scoreMapAction(observation(state), build(amplifier))!.score).toBeLessThan(missingEngine);
  });

  it("Necropolis fights a beatable neutral before paying full price for a Pack", () => {
    const state = game();
    state.players.p2.factionId = "necropolis";
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
    ];
    const target = state.players.p2.army[0];
    target.side = "few";
    state.players.p2.hand = ["ability.necromancy"];
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
    )!;
    const guard = Object.values(state.adventure!.fields).find(
      (field) => field.flagOwnerId == null && field.location !== "home_town",
    )!;
    guard.difficulty = 1;
    guard.blackCube = true;
    const reinforce: GameAction = {
      type: "POPULATION_ACTION",
      playerId: "p2",
      purchases: [{ kind: "reinforce", unitDefId: target.unitDefId, armyUnitId: target.id }],
    };

    expect(scoreMapAction(observation(state), reinforce)!.score).toBeLessThanOrEqual(650);
    state.players.p2.hand = [];
    expect(scoreMapAction(observation(state), reinforce)!.score).toBeGreaterThan(650);
    expect(hero, "fixture retains a main hero for the neutral objective").toBeTruthy();
  });

  it("buys spells only with Wisdom in hand or surplus gold (army funds first)", () => {
    const state = game();
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
      ),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
      ),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
      ),
    ];
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("improve-army");
    const target = developmentResourceTargets(state, "p2");
    const buySpells: GameAction = {
      type: "SPELL_BOOK_ACTION",
      playerId: "p2",
    } as GameAction;

    // Gold at the development target, no Wisdom — the purchase waits.
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: 1,
      valuables: 0,
    };
    state.players.p2.hand = [];
    const tight = scoreMapAction(observation(state), buySpells);
    expect(tight?.policy).toBe("town.skip-spell-buy-fund-army");
    expect(tight!.score).toBeLessThan(300);

    // CONTROL: surplus gold funds the Spell Book.
    state.players.p2.resources.gold = target.gold + 4;
    const flush = scoreMapAction(observation(state), buySpells);
    expect(flush?.policy).toBe("town.buy-spells-after-army-core");
    expect(flush!.score).toBe(620);

    // CONTROL: Wisdom rides along (cheaper buy, bigger Search) — worth it even
    // on a tight budget.
    state.players.p2.resources.gold = target.gold;
    state.players.p2.hand = ["ability.wisdom"];
    const wise = scoreMapAction(observation(state), buySpells);
    expect(wise?.policy).toBe("town.buy-spells-after-army-core");
    expect(wise!.score).toBe(620);
  });

  it("buys Polish Stack layers only from surplus after the full army core", () => {
    const state = game();
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold"),
    ];
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("improve-army");
    const unit = state.players.p2.army[0];
    const cost = polishUnitStackCost(unit.unitDefId)?.gold ?? 0;
    const target = developmentResourceTargets(state, "p2");
    const buyStack: GameAction = {
      type: "POPULATION_ACTION",
      playerId: "p2",
      purchases: [{ kind: "stack", unitDefId: unit.unitDefId, armyUnitId: unit.id }]
    };

    state.players.p2.resources.gold = Math.max(5, target.gold) + cost - 1;
    expect(scoreMapAction(observation(state), buyStack)!.score).toBeLessThan(300);

    state.players.p2.resources.gold = Math.max(5, target.gold) + cost;
    const first = scoreMapAction(observation(state), buyStack)!;
    expect(first.score).toBeGreaterThan(300);
    unit.stacks = 1;
    const later = scoreMapAction(observation(state), buyStack)!;
    expect(first.score).toBeGreaterThan(later.score);
  });

  it("prices a recruited NEUTRAL card's Stack off its own printed side, not the (absent) Pack", () => {
    // A recruited Neutral card has no Pack side at all, so the old default-"pack"
    // price read returned null → +Infinity → the AI could never buy a Stack for
    // one however rich it was. The score must respond to the NEUTRAL price
    // (neutral.griffins: printed 7 gold + bronze tier 1 = 8) exactly like a Pack.
    const state = game();
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold"),
    ];
    const neutral = { id: "army_neutral_griffins", unitDefId: "neutral.griffins", side: "neutral" as const };
    state.players.p2.army.push(neutral);
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("improve-army");
    const cost = polishUnitStackCost(neutral.unitDefId, "neutral")?.gold ?? 0;
    expect(cost, "neutral.griffins Stack = 7 printed + bronze 1").toBe(8);
    const target = developmentResourceTargets(state, "p2");
    const buyStack: GameAction = {
      type: "POPULATION_ACTION",
      playerId: "p2",
      purchases: [{ kind: "stack", unitDefId: neutral.unitDefId, armyUnitId: neutral.id }]
    };

    state.players.p2.resources.gold = Math.max(5, target.gold) + cost - 1;
    expect(scoreMapAction(observation(state), buyStack)!.score, "one gold short of the plan").toBeLessThan(300);

    state.players.p2.resources.gold = Math.max(5, target.gold) + cost;
    expect(scoreMapAction(observation(state), buyStack)!.score, "affordable from surplus").toBeGreaterThan(300);
  });

  it("buys Polish Cast supply when the Book outgrows it and rolls only weak Spells", () => {
    const state = game();
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold"),
    ];
    const target = developmentResourceTargets(state, "p2");
    state.players.p2.resources.gold = target.gold + 10;
    state.players.p2.hand = [];
    state.players.p2.deck = ["spell.cast_a_spell"];
    state.players.p2.discard = [];
    state.players.p2.spellBook = ["spell.haste", "spell.slow"];
    state.players.p2.spellBookUsed = [];

    const buyCast: GameAction = { type: "SPELL_BOOK_ACTION", playerId: "p2", takeCastCard: true };
    expect(scoreMapAction(observation(state), buyCast)?.policy).toBe("town.buy-polish-cast-enabler");
    state.players.p2.deck.push("spell.cast_a_spell");
    expect(scoreMapAction(observation(state), buyCast)?.policy).toBe("town.cast-supply-sufficient");

    const rollWeak: GameAction = {
      type: "SPELL_BOOK_ACTION",
      playerId: "p2",
      rollSpell: { cardId: "spell.earthquake", source: "refreshed" }
    };
    const rollStrong: GameAction = {
      type: "SPELL_BOOK_ACTION",
      playerId: "p2",
      rollSpell: { cardId: "spell.fly", source: "refreshed" }
    };
    expect(scoreMapAction(observation(state), rollWeak)?.policy).toBe("town.roll-weak-polish-spell");
    expect(scoreMapAction(observation(state), rollStrong)?.policy).toBe("town.keep-useful-polish-spell");
  });

  it("unlocks Silver after three Packs, then Gold after Silver", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const silver = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
    );
    const gold = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];

    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");
    const silverScore = scoreMapAction(observation(state), {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: silver,
    });
    expect(silverScore?.score).toBe(955);

    town.buildings.push(silver);
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-gold");
    const goldScore = scoreMapAction(observation(state), {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: gold,
    });
    expect(goldScore?.score).toBe(950);
  });

  it("saves the exact materials and valuables required by the next dwelling", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    const target = developmentResourceTargets(state, "p2");
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: Math.max(0, target.buildingMaterials - 1),
      valuables: target.valuables,
    };
    const deficit = resourceDeficits(state, "p2");
    expect(deficit.buildingMaterials).toBe(1);
    expect(deficit.valuables).toBe(0);
  });

  it("plays a resource card before moving when it completes the next build fund", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    const target = developmentResourceTargets(state, "p2");
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: Math.max(0, target.buildingMaterials - 2),
      valuables: target.valuables,
    };
    state.players.p2.hand = ["artifact.inexhaustible_cart_of_lumber"];
    const scored = scoreCardAction(observation(state), {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "artifact.inexhaustible_cart_of_lumber",
      optionIndex: 0,
      target: { type: "none" },
    });
    expect(scored?.score).toBeGreaterThan(800);
    expect(scored?.policy).toBe("card.play-artifact");
  });
});

describe("computer Population scoring — Settlement Neutral-Units recruits (BINH house rule)", () => {
  it("prices and values the single-sided NEUTRAL card the offer really adds", async () => {
    // Audit 2026-09-05: a Settlement Neutral-Units recruit has no Few side, so
    // the scorer read a zero-cost / zero-gain phantom — every such offer scored
    // identically whatever the card. Two bronze Neutrals of different strength
    // must now score differently (the gain term reads the neutral face).
    const { neutralUnitIdsByFaction } = await import("@/data/factions/core");
    const { ensureSettlementRecruitFactions } = await import("../adventure");
    const { unitDevelopmentSideStrength } = await import("./development");
    const state = game();
    establishPacks(state);
    state.players.p2.factionId = "castle";
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "settlement-neutral-recruitment": true };
    state.adventure!.fields["ai-neutral-shop"] = {
      spaceId: "ai-neutral-shop", tileInstanceId: "test", slot: 0, location: "settlement", faction: "dungeon",
      blackCube: false, flagOwnerId: "p2", everFlagged: true, settlementResource: "gold",
    };
    ensureSettlementRecruitFactions(state);
    state.players.p2.resources = { gold: 200, buildingMaterials: 20, valuables: 20 };

    const bronze = neutralUnitIdsByFaction.dungeon
      .filter((id) => coreUnitDefinitions[id]?.tier === "bronze")
      .map((id) => ({ id, strength: unitDevelopmentSideStrength(id, "neutral") }))
      .sort((left, right) => left.strength - right.strength);
    expect(bronze.length).toBeGreaterThanOrEqual(2);
    const weakest = bronze[0]!;
    const strongest = bronze.at(-1)!;
    expect(weakest.strength).toBeGreaterThan(0);
    expect(strongest.strength).toBeGreaterThan(weakest.strength);

    const scoreOf = (unitDefId: string) =>
      scoreMapAction(observation(state), {
        type: "POPULATION_ACTION",
        playerId: "p2",
        purchases: [{ kind: "recruit", unitDefId }],
      })!.score;
    expect(scoreOf(strongest.id)).not.toBe(scoreOf(weakest.id));
  });
});

describe("computer development — income-first City Hall and the Gold ladder (ranked replays 2026-09-10/11)", () => {
  function coreTown(state: GameState, extra: string[] = []) {
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze"),
      ...extra,
    ];
    return town;
  }
  const build = (state: GameState, buildingId: string): GameAction =>
    ({
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!.id,
      buildingId,
    }) as GameAction;
  const recruit = (unitDefId: string): GameAction => ({
    type: "POPULATION_ACTION",
    playerId: "p2",
    purchases: [{ kind: "recruit", unitDefId }],
  });
  const reinforce = (state: GameState, unitDefId: string): GameAction => ({
    type: "POPULATION_ACTION",
    playerId: "p2",
    purchases: [
      {
        kind: "reinforce",
        unitDefId,
        armyUnitId: state.players.p2.army.find((unit) => unit.unitDefId === unitDefId)!.id,
      },
    ],
  });
  const score = (state: GameState, action: GameAction) =>
    scoreMapAction(observation(state), action)!.score;
  function goldTown(state: GameState) {
    establishPacks(state);
    return coreTown(state, [
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold"),
      buildingWith(state, (effect) => effect.type === "RESOURCE_ROUND_CHOICE"),
    ]);
  }
  function addUnit(state: GameState, unitDefId: string, side: "few" | "pack") {
    state.players.p2.army.push({ id: `ladder-${state.players.p2.army.length}`, unitDefId, side });
  }

  it("puts City Hall first only when it is situational: dwelling out of reach, early, not behind", () => {
    const state = game();
    establishPacks(state);
    const town = coreTown(state);
    const farTile = Object.values(state.adventure!.tiles)[0];
    const farField = Object.values(state.adventure!.fields)[0];
    const flagFarGoldMine = (owner: "p1" | "p2") => {
      state.adventure!.tiles["hall-far"] = { ...farTile, id: "hall-far", group: "far", faceDown: false };
      state.adventure!.fields["h:99:99"] = {
        ...farField,
        spaceId: "h:99:99",
        tileInstanceId: "hall-far",
        location: "mine",
        resource: "gold",
        difficulty: undefined,
        flagOwnerId: owner,
      };
    };
    flagFarGoldMine("p2");
    const income = buildingWith(state, (effect) => effect.type === "RESOURCE_ROUND_CHOICE");
    const silver = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
    );
    const hallCost = coreBuildingDefinitions[income].cost ?? {};
    const hallOnly = () => {
      state.players.p2.resources = {
        gold: hallCost.gold ?? 0,
        buildingMaterials: hallCost.buildingMaterials ?? 0,
        valuables: 0,
      };
    };
    state.round = 3;
    state.players.p2.production = { gold: 5, buildingMaterials: 2, valuables: 1 };
    // Silver dwelling out of reach, hall affordable: hall first, exempt from
    // the dwelling-fund guard, below a scenario-winning step.
    hallOnly();
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    // CONTROL: without a captured FAR income (a rival's flag does not count)
    // every coin funds the dwelling and its army — no hall first.
    flagFarGoldMine("p1");
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    flagFarGoldMine("p2");
    const hall = score(state, build(state, income));
    expect(hall).toBeGreaterThanOrEqual(970);
    expect(hall).toBeLessThan(980);
    expect(score(state, build(state, silver))).toBeLessThanOrEqual(960);
    // Silver dwelling in reach now: take it; the hall is an ordinary side
    // build again (early Silver won 06j7su R3, 58nqa1 R4, 5fcaqr R3).
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    expect(score(state, build(state, silver))).toBe(955);
    expect(score(state, build(state, income))).toBeLessThan(900);
    // From R4 a dwelling landing next Resource Round is not pushed out either.
    state.round = 4;
    const silverCost = coreBuildingDefinitions[silver].cost ?? {};
    state.players.p2.resources = {
      gold: (silverCost.gold ?? 0) - 1,
      buildingMaterials: silverCost.buildingMaterials ?? 0,
      valuables: silverCost.valuables ?? 0,
    };
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    // Too late: no hall-first after R6; from R9 the hall is never built.
    hallOnly();
    state.round = 7;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.round = 9;
    expect(score(state, build(state, income))).toBeLessThanOrEqual(280);
    // Behind already: a hostile main hero two levels up → army first.
    state.round = 3;
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    const enemyMain = Object.values(state.heroes).find(
      (hero) => hero.controllerId === "p1" && hero.kind === "main",
    )!;
    const ownMain = Object.values(state.heroes).find(
      (hero) => hero.controllerId === "p2" && hero.kind === "main",
    )!;
    enemyMain.level = ownMain.level + 2;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    enemyMain.level = ownMain.level;
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    // Bronze core with nothing it can win: the dwelling is the plan instead.
    expect(incomeBuildingBeforeDwelling(state, "p2", false)).toBeNull();
    // Slow bronze stretch (no unit experience, no commanders) or player-
    // controlled neutrals: the hall-first window closes after R4.
    state.round = 5;
    state.adventure!.unitExperience = true;
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    state.adventure!.unitExperience = false;
    if (state.wog) state.wog.enabled = false;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.round = 3;
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    state.round = 5;
    state.adventure!.unitExperience = true;
    state.adventure!.pvpNeutralControl = true;
    state.controllers = { ...(state.controllers ?? {}), p1: { kind: "human" } };
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.round = 3;
    enemyMain.level = ownMain.level + 1;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    enemyMain.level = ownMain.level;
    state.adventure!.pvpNeutralControl = false;
    // CONTROL: with the hall standing the Silver dwelling is the milestone again.
    town.buildings.push(income);
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    expect(score(state, build(state, silver))).toBe(955);
    // The opening never waits for the hall: Pack reinforces come first.
    town.buildings.pop();
    hallOnly();
    for (const unit of state.players.p2.army) unit.side = "few";
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
  });

  it("walks the Gold ladder: top Few, lower Few, top Pack, lower Pack", () => {
    const state = game();
    goldTown(state);
    const [top, lower] = rankedGoldUnits(state, "p2");
    expect(top && lower, "fixture faction needs two Gold units").toBeTruthy();
    const topFewCost = coreUnitDefinitions[top].few!.cost;
    expect(
      (topFewCost.gold ?? 0) + (topFewCost.valuables ?? 0) * 7,
      "the top body is the expensive one",
    ).toBeGreaterThan((coreUnitDefinitions[lower].few!.cost.gold ?? 0));
    expect(nextGoldLadderStep(state, "p2")).toMatchObject({ unitDefId: top, kind: "recruit", rank: 0 });
    addUnit(state, top, "few");
    expect(nextGoldLadderStep(state, "p2")).toMatchObject({ unitDefId: lower, kind: "recruit" });
    addUnit(state, lower, "few");
    expect(nextGoldLadderStep(state, "p2")).toMatchObject({ unitDefId: top, kind: "reinforce", rank: 0 });
    state.players.p2.army.find((unit) => unit.unitDefId === top)!.side = "pack";
    expect(nextGoldLadderStep(state, "p2")).toMatchObject({ unitDefId: lower, kind: "reinforce" });
    state.players.p2.army.find((unit) => unit.unitDefId === lower)!.side = "pack";
    expect(nextGoldLadderStep(state, "p2")).toBeNull();
  });

  it("buys the top Gold Few first and skips the lower Few while the top one lands within two rounds", () => {
    const state = game();
    goldTown(state);
    const [top, lower] = rankedGoldUnits(state, "p2");
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    const topScore = score(state, recruit(top));
    expect(topScore).toBeGreaterThanOrEqual(968);
    expect(topScore).toBeLessThan(980);
    expect(score(state, recruit(lower))).toBeLessThanOrEqual(240);
    // The treasury target now saves for the TOP body, not the cheapest one.
    const target = developmentResourceTargets(state, "p2");
    const topCost = coreUnitDefinitions[top].few!.cost;
    expect(target.gold).toBe((topCost.gold ?? 0) + 5);
    expect(target.valuables).toBe(topCost.valuables ?? 0);
    // CONTROL: the top body out of reach for two Resource Rounds → the lower
    // Few is bought now instead of idling the token.
    const lowerCost = coreUnitDefinitions[lower].few!.cost;
    state.players.p2.resources = { gold: lowerCost.gold ?? 0, buildingMaterials: 0, valuables: 0 };
    state.players.p2.production = { gold: 1, buildingMaterials: 0, valuables: 0 };
    expect(score(state, recruit(lower))).toBeGreaterThan(900);
  });

  it("upgrades the top Gold Pack before the lower one and holds a lower Pack that would delay it a round", () => {
    const state = game();
    goldTown(state);
    const [top, lower] = rankedGoldUnits(state, "p2");
    addUnit(state, top, "few");
    addUnit(state, lower, "few");
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    const topPack = score(state, reinforce(state, top));
    const lowerPack = score(state, reinforce(state, lower));
    expect(topPack).toBeGreaterThanOrEqual(968);
    expect(lowerPack).toBeGreaterThan(900);
    expect(topPack).toBeGreaterThan(lowerPack);
    // Top Pack lands NEXT round; the lower Pack would push it a round further.
    const packCost = coreUnitDefinitions[top].pack!.cost;
    state.players.p2.production = { gold: 10, buildingMaterials: 1, valuables: 1 };
    state.players.p2.resources = {
      gold: (packCost.gold ?? 0) - 5,
      buildingMaterials: 5,
      valuables: packCost.valuables ?? 0,
    };
    expect(score(state, reinforce(state, lower))).toBeLessThanOrEqual(240);
  });

  it("skips the first Silver body when it would delay a Gold dwelling that lands next round", () => {
    const state = game();
    establishPacks(state);
    coreTown(state, [
      buildingWith(state, (effect) => effect.type === "RESOURCE_ROUND_CHOICE"),
      buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver"),
    ]);
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-gold");
    const factionId = state.players.p2.factionId!;
    const silverUnit = coreFactionDefinitions[factionId].units.find(
      (unitDefId) => coreUnitDefinitions[unitDefId]?.tier === "silver",
    )!;
    const gold = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
    );
    const cost = coreBuildingDefinitions[gold].cost ?? {};
    // Inputs secured, one gold short: the dwelling lands next Resource Round
    // unless the Silver body spends that gold first.
    state.players.p2.production = { gold: 5, buildingMaterials: 4, valuables: 1 };
    state.players.p2.resources = {
      gold: (cost.gold ?? 0) - 1,
      buildingMaterials: cost.buildingMaterials ?? 0,
      valuables: cost.valuables ?? 0,
    };
    expect(score(state, recruit(silverUnit))).toBeLessThanOrEqual(240);
    // CONTROL: with the dwelling far off, the first Silver body keeps its
    // exemption — it is what takes the lv3 premium guards.
    state.players.p2.resources = { gold: 8, buildingMaterials: 0, valuables: 0 };
    expect(score(state, recruit(silverUnit))).toBe(945);
  });

  it("keeps Silver at Few (one Pack at most) until the top Gold body is owned", () => {
    const state = game();
    goldTown(state);
    const factionId = state.players.p2.factionId!;
    const silvers = coreFactionDefinitions[factionId].units.filter(
      (unitDefId) => coreUnitDefinitions[unitDefId]?.tier === "silver",
    );
    expect(silvers.length, "fixture faction needs two Silver units").toBeGreaterThanOrEqual(2);
    addUnit(state, silvers[0], "pack");
    addUnit(state, silvers[1], "few");
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    expect(score(state, reinforce(state, silvers[1]))).toBeLessThanOrEqual(240);
    // CONTROL: the top Gold Few in the army re-opens Silver Packs.
    addUnit(state, rankedGoldUnits(state, "p2")[0], "few");
    expect(score(state, reinforce(state, silvers[1]))).toBeGreaterThan(900);
  });
});
