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
  needsPremiumSilverBreakthrough,
  nextGoldLadderStep,
  nextPlannedSilver,
  openingCorePackTarget,
  preferredOpeningPacks,
  rankedGoldUnits,
  shouldLaunchBronzeRush,
  silverRecruitPlan,
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

/** Re-seat p2 as another core faction: hero, a three-unit bronze core and the
 * town's parallel building ids (every core town names them alike). */
function asFaction(
  state: GameState,
  factionId: "castle" | "necropolis" | "stronghold",
  heroDefId: string,
): void {
  state.players.p2.factionId = factionId;
  state.players.p2.heroDefId = heroDefId;
  state.players.p2.army = coreFactionDefinitions[factionId].units
    .filter((id) => coreUnitDefinitions[id]?.tier === "bronze")
    .slice(0, 3)
    .map((unitDefId, index) => ({ id: `${factionId}-${index}`, unitDefId, side: "few" as const }));
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
  town.buildings = town.buildings
    .map((id) => id.replace(/^[a-z_]+\./, `${factionId}.`))
    .filter((id) => Boolean(coreBuildingDefinitions[id]));
}

describe("computer long-horizon development plan", () => {
  it("requires both Elves and Dwarves Packs before the Rampart Silver pivot", () => {
    const state = game();
    state.players.p2.factionId = "rampart";
    // The seat's hero steers preferredOpeningPacks (a Necromancy hero plans a
    // Skeleton-first core instead), so pin Rampart's own hero for this fixture.
    state.players.p2.heroDefId = "gelu";
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

    // Genuine surplus alone is NOT enough any more: the 2026-09-16 user rule
    // holds every side building in the 280 band until the faction's Gold
    // dwelling stands, surplus included.
    state.players.p2.resources = {
      gold: target.gold + (sideCost.gold ?? 0),
      buildingMaterials: target.buildingMaterials + (sideCost.buildingMaterials ?? 0),
      valuables: target.valuables + (sideCost.valuables ?? 0),
    };
    expect(scoreMapAction(observation(state), buildSide)!.score).toBeLessThanOrEqual(280);

    // CONTROL: with the Gold dwelling built AND genuine surplus (its remaining
    // recruit fund plus the side cost) the same build is allowed again.
    town.buildings.push(
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
      ),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
      ),
    );
    const goldTarget = developmentResourceTargets(state, "p2");
    state.players.p2.resources = {
      gold: goldTarget.gold + (sideCost.gold ?? 0),
      buildingMaterials: goldTarget.buildingMaterials + (sideCost.buildingMaterials ?? 0),
      valuables: goldTarget.valuables + (sideCost.valuables ?? 0),
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
    // Under the 2026-09-18 silver-accessible doctrine only the lv3 bronze Pack is worth
    // paying for (lv1/lv2 stay Few meatshields), so the "pay full price for a Pack" the
    // fight substitutes for is the lv3 body (Wraiths), not a lv1 chaff Pack.
    const target = state.players.p2.army.find((unit) => unit.unitDefId === "necropolis.wraiths")
      ?? state.players.p2.army[0];
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

    // Magic Arrow already owned, so the separate "seek the Arrow" fund does not
    // apply and the buy is priced as an ordinary Book purchase (5 gold).
    state.players.p2.spellBook = ["spell.magic_arrow"];

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

    // CONTROL: surplus gold (the whole 5-gold price on top of the fund) funds
    // the Spell Book.
    state.players.p2.resources.gold = target.gold + 5;
    const flush = scoreMapAction(observation(state), buySpells);
    expect(flush?.policy).toBe("town.buy-spells-after-army-core");
    expect(flush!.score).toBe(620);

    // CONTROL: two gold over the fund is NOT enough on its own...
    state.players.p2.resources.gold = target.gold + 2;
    const short = scoreMapAction(observation(state), buySpells);
    expect(short?.policy).toBe("town.skip-spell-buy-fund-army");

    // ...but Wisdom rides along (cheaper buy, bigger Search) — worth it even on
    // that tight budget.
    state.players.p2.hand = ["ability.wisdom"];
    const wise = scoreMapAction(observation(state), {
      ...buySpells,
      wisdom: { cardId: "ability.wisdom", mode: "expert" },
    } as GameAction);
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
    // Fund the plan: an unaffordable dwelling drops to the affordability floor.
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };

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

  it("takes an affordable Silver dwelling over a bronze Pack when on-map gold funds it (situational)", () => {
    // User 2026-09-18 (live tutoring): with early valuables the Silver dwelling is
    // affordable in establish-core, and if there is FREE gold the hero can grab this
    // turn to fund the Silver body, a level-4 Silver beats finishing a third bronze
    // Pack. Situational and flexible — it hinges on reachable map gold (RNG), so the
    // eval-tuned packs-first ladder still holds when no such gold is in reach.
    const state = game();
    asFaction(state, "castle", "catherine");
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze");
    const silver = buildingWith(state, (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze]; // establish-core: packs not yet finished
    const cost = coreBuildingDefinitions[silver]!.cost!;
    // Live math: build the dwelling, grab the 3-gold water wheel, and the treasury
    // reaches the Crusader's 6-gold price (leftover 3 + 3 wheel). Hold the scarce
    // valuables (the early-silver enabler).
    state.players.p2.resources = {
      gold: (cost.gold ?? 0) + 3,
      buildingMaterials: cost.buildingMaterials ?? 0,
      valuables: cost.valuables ?? 0,
    };
    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
    // Inject a free, unguarded gold field one step from the hero (the situational RNG).
    const near = state.adventure!.fields["h:9:7"]!;
    Object.assign(near, { location: "water_wheel", resource: "gold", amount: 3, flagOwnerId: null, difficulty: undefined });
    hero.movementPoints = 3;
    const build = (id: string) => scoreMapAction(observation(state), {
      type: "BUILD_STRUCTURE", playerId: "p2", townId: town.id, buildingId: id,
    })?.score;
    expect(build(silver)).toBe(984); // early-silver breakthrough fires

    // CONTROL: no reachable map gold (hero cannot move) — keep the packs-first ladder.
    hero.movementPoints = 0;
    expect(build(silver)).toBeLessThan(984);
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
    // USER RULING (2026-09-17): the seed's Necropolis never builds its hall —
    // the situational rules are exercised on Castle (same low 5-gold payout).
    asFaction(state, "castle", "catherine");
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
    const income = buildingWith(state, (effect) => effect.type === "RESOURCE_ROUND_CHOICE");
    const silver = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
    );
    const hallCost = coreBuildingDefinitions[income].cost ?? {};
    // Castle's hall pays 5 gold a round (a LOW-payout hall), so it must also
    // leave the five-gold cushion behind — its price alone is not enough.
    const hallAffordable = () => {
      state.players.p2.resources = {
        gold: (hallCost.gold ?? 0) + 5,
        buildingMaterials: hallCost.buildingMaterials ?? 0,
        valuables: 0,
      };
    };
    state.round = 3;
    state.players.p2.production = { gold: 5, buildingMaterials: 2, valuables: 0 };
    // Silver dwelling out of reach, hall affordable: hall first, exempt from
    // the dwelling-fund guard, below a scenario-winning step.
    hallAffordable();
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    // CONTROL: the hall's bare price with nothing left over is NOT enough for a
    // low-payout hall — the next fight's re-recruits would eat the dwelling.
    state.players.p2.resources = {
      gold: hallCost.gold ?? 0,
      buildingMaterials: hallCost.buildingMaterials ?? 0,
      valuables: 0,
    };
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    hallAffordable();
    // CONTROL: once THIS seat has secured a Far tile the premium Silver
    // breakthrough body owns the purse instead — no hall first.
    flagFarGoldMine("p2");
    expect(needsPremiumSilverBreakthrough(state, "p2")).toBe(true);
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    // CONTROL: the SAME Far mine flagged by the OPPONENT is not p2's economy,
    // so the situational hall-first step is back on.
    flagFarGoldMine("p1");
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
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
    // From R4 a dwelling landing next Resource Round is not pushed out either:
    // the same purse, but a valuables income that brings the Silver dwelling
    // within one Resource Round — which paying for the hall would undo.
    state.round = 4;
    state.players.p2.production = { gold: 5, buildingMaterials: 2, valuables: 1 };
    hallAffordable();
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.players.p2.production = { gold: 5, buildingMaterials: 2, valuables: 0 };
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    // Too late: no hall-first after R4; from R9 the hall is never built.
    hallAffordable();
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
    // USER RULING (2026-09-16): the hall-first window closes after R4 for every
    // seat — a slow bronze stretch (no unit experience, no commanders) no
    // longer buys extra rounds.
    state.round = 4;
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    state.round = 5;
    state.adventure!.unitExperience = true;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.adventure!.unitExperience = false;
    if (state.wog) state.wog.enabled = false;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.round = 3;
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    // Player-controlled neutrals (PvP Neutral Control with a live human rival)
    // halve the "behind already" tolerance: ONE hostile level is enough.
    state.adventure!.pvpNeutralControl = true;
    state.controllers = { ...(state.controllers ?? {}), p1: { kind: "human" } };
    enemyMain.level = ownMain.level + 1;
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    state.adventure!.pvpNeutralControl = false;
    // CONTROL: with the scripted Neutral AI the same one-level gap is tolerated.
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    enemyMain.level = ownMain.level;
    // CONTROL: with the hall standing the Silver dwelling is the milestone again.
    town.buildings.push(income);
    state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
    expect(score(state, build(state, silver))).toBe(955);
    // The opening never waits for the hall: Pack reinforces come first.
    town.buildings.pop();
    hallAffordable();
    for (const unit of state.players.p2.army) unit.side = "few";
    expect(incomeBuildingBeforeDwelling(state, "p2")).toBeNull();
  });

  it("USER RULING 2026-09-17: Necropolis and Stronghold never build the City Hall (CONTROL: Castle still does)", () => {
    const setup = (factionId: "castle" | "necropolis" | "stronghold", heroDefId: string) => {
      const state = game();
      asFaction(state, factionId, heroDefId);
      establishPacks(state);
      coreTown(state);
      const income = buildingWith(state, (effect) => effect.type === "RESOURCE_ROUND_CHOICE");
      const hallCost = coreBuildingDefinitions[income].cost ?? {};
      state.round = 3;
      state.players.p2.production = { gold: 5, buildingMaterials: 2, valuables: 0 };
      state.players.p2.resources = {
        gold: (hallCost.gold ?? 0) + 5,
        buildingMaterials: hallCost.buildingMaterials ?? 0,
        valuables: 0,
      };
      return { state, income };
    };
    for (const [factionId, heroDefId] of [["necropolis", "vidomina"], ["stronghold", "crag_hack"]] as const) {
      const { state, income } = setup(factionId, heroDefId);
      expect(incomeBuildingBeforeDwelling(state, "p2"), factionId).toBeNull();
      expect(score(state, build(state, income)), factionId).toBeLessThanOrEqual(280);
      // Not even from genuine surplus inside the R5–R6 "marginal" window.
      state.round = 5;
      state.players.p2.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
      expect(score(state, build(state, income)), factionId).toBeLessThanOrEqual(280);
    }
    // CONTROL: the same board and purse on Castle keeps the situational hall-first step.
    const { state, income } = setup("castle", "catherine");
    expect(incomeBuildingBeforeDwelling(state, "p2")?.id).toBe(income);
    expect(score(state, build(state, income))).toBeGreaterThanOrEqual(970);
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
    // USER RULING (2026-09-16): from a flush purse the lower Gold Few cannot
    // delay the level-7 landing, so it is released — but still behind the top
    // body's saved ladder step.
    const lowerFlush = score(state, recruit(lower));
    expect(lowerFlush).toBeGreaterThan(900);
    expect(lowerFlush).toBeLessThan(topScore);
    // The treasury target now saves for the TOP body, not the cheapest one.
    const target = developmentResourceTargets(state, "p2");
    const topCost = coreUnitDefinitions[top].few!.cost;
    expect(target.gold).toBe((topCost.gold ?? 0) + 5);
    expect(target.valuables).toBe(topCost.valuables ?? 0);
    // CONTROL: a purse that exactly covers the TOP body — spending it on the
    // lower Few would push the level-7 landing out, so the lower Few waits.
    state.players.p2.resources = {
      gold: topCost.gold ?? 0,
      buildingMaterials: 0,
      valuables: topCost.valuables ?? 0,
    };
    expect(score(state, recruit(lower))).toBeLessThanOrEqual(240);
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

  it("skips the first Silver body when it would eat a Gold dwelling the seat can build now", () => {
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
    // The Gold dwelling is payable RIGHT NOW: it is the bigger milestone (the
    // Build and Population tokens are separate, so a flush seat does both the
    // same turn), so the premium-Silver breakthrough exemption closes and the
    // body must not spend the dwelling's fund.
    state.players.p2.production = { gold: 5, buildingMaterials: 4, valuables: 1 };
    const bodyCost = coreUnitDefinitions[silverUnit].few!.cost;
    state.players.p2.resources = {
      gold: (cost.gold ?? 0) + (bodyCost.gold ?? 0),
      buildingMaterials: (cost.buildingMaterials ?? 0) + (bodyCost.buildingMaterials ?? 0),
      valuables: (cost.valuables ?? 0) + (bodyCost.valuables ?? 0),
    };
    expect(needsPremiumSilverBreakthrough(state, "p2")).toBe(false);
    expect(score(state, recruit(silverUnit))).toBeLessThanOrEqual(240);
    // CONTROL: with the dwelling out of reach the seat is STALLED, so the
    // planned Silver breakthrough body keeps its exemption — it is what takes
    // the lv3 premium guards (user ruling 2026-09-16).
    state.players.p2.resources = { gold: 8, buildingMaterials: 0, valuables: 0 };
    expect(needsPremiumSilverBreakthrough(state, "p2")).toBe(true);
    expect(score(state, recruit(silverUnit))).toBeGreaterThanOrEqual(976);
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
    // A Gold Few alone no longer re-opens paid Silver Packs: they wait for the
    // WHOLE Gold ladder (both Few bodies AND both Packs).
    const [topGold, lowerGold] = rankedGoldUnits(state, "p2");
    addUnit(state, topGold, "few");
    expect(score(state, reinforce(state, silvers[1]))).toBeLessThanOrEqual(240);
    // CONTROL: the finished Gold ladder re-opens Silver Packs.
    state.players.p2.army.find((unit) => unit.unitDefId === topGold)!.side = "pack";
    addUnit(state, lowerGold, "pack");
    expect(nextGoldLadderStep(state, "p2")).toBeNull();
    expect(score(state, reinforce(state, silvers[1]))).toBeGreaterThan(900);
  });
});

/**
 * THE STALLED OPENING (2026-09-16). A seat whose Silver dwelling stands and
 * whose opening Pack core is complete, but which has not secured ONE Far tile,
 * is exactly the seat that cannot win the Far III fight its whole economy hangs
 * on. Measured (Rampart seed eval-19, R4-R7, 30-seed impossible eval): the
 * Dendroid Few (8 gold) sat unbought at 13 gold for three straight Resource
 * Rounds because the treasury target had already jumped to the Gold dwelling
 * PLUS its Gold recruit (10 + 22 + 5 = 37 gold), so the shared "other Silver is
 * a surplus purchase" guard scored the body 240. The first Far landed R10 and
 * the Gold body R11.
 */
describe("stalled opening — the planned Silver body outranks the Gold fund", () => {
  function stalledRampart(): GameState {
    const state = game();
    state.round = 5;
    state.players.p2.factionId = "rampart";
    state.players.p2.army = [
      // Rampart's ordered opening Packs are Elves (level-3) then Centaurs.
      { id: "r-0", unitDefId: "rampart.dwarves", side: "few" as const },
      { id: "r-1", unitDefId: "rampart.centaurs", side: "pack" as const },
      { id: "r-2", unitDefId: "rampart.elves", side: "pack" as const },
    ];
    const town = Object.values(state.towns).find((t) => t.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (e) => e.type === "UNLOCK_RECRUIT_TIER" && e.tier === "bronze"),
      buildingWith(state, (e) => e.type === "UNLOCK_RECRUIT_TIER" && e.tier === "silver"),
    ];
    state.players.p2.resources = { gold: 13, buildingMaterials: 6, valuables: 0 };
    state.players.p2.production = { gold: 10, buildingMaterials: 4, valuables: 1 };
    return state;
  }
  const recruitOne = (unitDefId: string): GameAction => ({
    type: "POPULATION_ACTION",
    playerId: "p2",
    purchases: [{ kind: "recruit", unitDefId }],
  });
  const scoreOf = (state: GameState, action: GameAction) =>
    scoreMapAction(observation(state), action)!.score;

  it("buys the PLANNED Silver (Dendroids) at 13 gold although the Gold fund wants 37", () => {
    const state = stalledRampart();
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-gold");
    expect(hasOpenedFarEconomy(state, "p2")).toBe(false);
    expect(needsPremiumSilverBreakthrough(state, "p2")).toBe(true);
    // The breakthrough body is funded first: its own cost plus the cushion,
    // NOT the Gold dwelling + Gold recruit fund that stalled the seat.
    expect(developmentResourceTargets(state, "p2").gold).toBeLessThanOrEqual(13);
    expect(scoreOf(state, recruitOne("rampart.dendroids"))).toBeGreaterThanOrEqual(976);
  });

  it("CONTROL: an OFF-plan Silver in the same position is still held back", () => {
    const state = stalledRampart();
    expect(scoreOf(state, recruitOne("rampart.pegasi"))).toBeLessThanOrEqual(240);
  });

  it("CONTROL: once the planned body stands the exemption closes", () => {
    const state = stalledRampart();
    state.players.p2.army.push({ id: "r-3", unitDefId: "rampart.dendroids", side: "few" });
    expect(needsPremiumSilverBreakthrough(state, "p2")).toBe(false);
    // Back to the Gold-dwelling fund: a second Silver body cannot spend it.
    expect(developmentResourceTargets(state, "p2").gold).toBeGreaterThan(20);
    expect(scoreOf(state, recruitOne("rampart.pegasi"))).toBeLessThanOrEqual(240);
  });
});

/**
 * INFERNO's breakthrough Silver (2026-09-16), read like Rampart's Dendroid
 * ruling: the planned body is the one that can CARRY the Far III fight, not the
 * cheapest. Pit Lords (8 gold, Attack 4 / Health 6; Pack Attack 5 + summon) vs
 * Demons (6 gold, Attack 3 / Health 4 — the weakest Silver Few in the game).
 * Measured (Inferno seeds eval-20 / eval-27): every premium level-3 attempt
 * behind the cheapest-first Demons was lost or retreated, no Far income ever
 * landed, and Inferno finished the 30-seed eval at 22/30 Gold bodies by R9.
 */
describe("Inferno's planned Silver is the breakthrough body", () => {
  function infernoSeat(): GameState {
    const state = game();
    state.round = 5;
    state.players.p2.factionId = "inferno";
    state.players.p2.army = [
      { id: "i-0", unitDefId: "inferno.magogs", side: "few" as const },
      { id: "i-1", unitDefId: "inferno.familiars", side: "pack" as const },
      { id: "i-2", unitDefId: "inferno.cerberi", side: "pack" as const },
    ];
    const town = Object.values(state.towns).find((t) => t.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(state, (e) => e.type === "UNLOCK_RECRUIT_TIER" && e.tier === "bronze"),
      buildingWith(state, (e) => e.type === "UNLOCK_RECRUIT_TIER" && e.tier === "silver"),
    ];
    state.players.p2.resources = { gold: 12, buildingMaterials: 6, valuables: 0 };
    state.players.p2.production = { gold: 10, buildingMaterials: 4, valuables: 1 };
    return state;
  }
  const recruitOne = (unitDefId: string): GameAction => ({
    type: "POPULATION_ACTION",
    playerId: "p2",
    purchases: [{ kind: "recruit", unitDefId }],
  });
  const scoreOf = (state: GameState, action: GameAction) =>
    scoreMapAction(observation(state), action)!.score;

  it("plans Pit Lords, not the cheaper Demons", () => {
    const state = infernoSeat();
    expect(silverRecruitPlan(state, "p2")[0]).toBe("inferno.pit_lords");
    expect(nextPlannedSilver(state, "p2")).toBe("inferno.pit_lords");
  });

  it("buys Pit Lords first; CONTROL: the cheaper Demons are deferred", () => {
    const state = infernoSeat();
    const pitLords = scoreOf(state, recruitOne("inferno.pit_lords"));
    const demons = scoreOf(state, recruitOne("inferno.demons"));
    expect(pitLords).toBeGreaterThanOrEqual(976);
    expect(demons).toBeLessThan(pitLords);
    expect(demons).toBeLessThanOrEqual(240);
  });
});
