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
  openingCorePackTarget,
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
  it("uses one exceptional Elves Pack, otherwise two ordinary Packs, before pivoting to Silver", () => {
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

    expect(openingCorePackTarget(state, "p2")).toBe(1);
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("establish-core");
    state.players.p2.army[2].side = "pack"; // double-attacking ranged Elves
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");

    // CONTROL: without the exceptional repeat attack, the same printed bodies
    // use the ordinary two-Pack opening rather than receiving an ID exception.
    const elfPack = coreUnitDefinitions["rampart.elves"].pack!;
    const abilities = elfPack.abilities;
    try {
      elfPack.abilities = [];
      expect(openingCorePackTarget(state, "p2")).toBe(2);
    } finally {
      elfPack.abilities = abilities;
    }
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
    const unit = state.players.p2.army[0];
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

    const side = buildingWith(
      state,
      (effect) =>
        effect.type === "MAGE_GUILD" ||
        effect.type === "RESOURCE_ROUND_CHOICE" ||
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
