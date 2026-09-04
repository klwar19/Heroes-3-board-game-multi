import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, isPlayableFaction } from "@/data/factions/core";
import { allTileDefinitions } from "@/data/map/tiles";
import { hasUniqueRankSchedule, rankScheduleFor } from "@/data/units/experience";
import { blueArchiveCharacters } from "@/data/anime/blue-archive-content";
import { animeTownHeroDefinitions } from "@/data/anime/towns";
import { describeBuildingEffect, buildingTimingLabel } from "@/data/towns/describe";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  makeCombatUnitFromArmy,
  NEUTRAL_PLAYER_ID
} from "./index";
import { startAdventureRound } from "./adventure";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, GameAction, GameState } from "./state";

/**
 * Blue Archive ("Kivotos Academy Domain") TOWN audit — everything except unit
 * abilities, hero specialty cards and the Ibuki casts (owned elsewhere).
 * Every claim asserts an OBSERVABLE outcome (gold / hand / XP delta, an offer
 * present or absent, an action refused) with a CONTROL on the same setup.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyErr(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be refused").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

function baGame(
  seed: string,
  options: { unitExperience?: boolean; ruleset?: "legacy" | "binh" } = {}
): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: options.ruleset ?? "legacy",
    ...(options.unitExperience !== undefined ? { unitExperience: options.unitExperience } : {}),
    players: [
      { id: "p1", name: "Sensei", factionId: "blue_archive", heroDefId: "mika_blue_archive" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  } as Parameters<typeof createAdventureGameState>[0]);
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function townOf(state: GameState, playerId: string) {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  if (!town) throw new Error(`no town for ${playerId}`);
  return town;
}

function richP1(state: GameState): GameState {
  state.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
  return state;
}

const KEI = { id: "ba_kei", unitDefId: "blue_archive.kei", side: "few" as const }; // bronze, few 2 gold / pack 6 gold
const ARU = { id: "ba_aru", unitDefId: "blue_archive.aru", side: "few" as const }; // bronze
const NERU = { id: "ba_neru", unitDefId: "blue_archive.neru", side: "few" as const }; // bronze

/** Same shape as unit-experience.test.ts: a finished neutral fight, then finalize. */
function finishNeutralCombat(
  state: GameState,
  units: CombatState["units"],
  outcomeWinner: "p1" | typeof NEUTRAL_PLAYER_ID,
  difficulty = 1
): void {
  const hero = getMainHero(state, "p1")!;
  hero.level = 10; // the base-XP ≤ hero-level cap never binds here
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units,
    setup: null,
    awaitingContinue: false,
    context: { kind: "neutral", heroId: hero.id, fieldId: hero.spaceId!, difficulty, hasAzure: false },
    outcome:
      outcomeWinner === "p1"
        ? { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" }
        : { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
  } as CombatState;
  finalizeAdventureCombat(state);
}

/** p1 army = survivor KEI (deployed, alive), ARU (deployed, fell), NERU (benched). */
function trainingFight(seed: string, options: { unitExperience: boolean; building: boolean; win: boolean }) {
  const state = baGame(seed, { unitExperience: options.unitExperience });
  const town = townOf(state, "p1");
  town.buildings = options.building ? ["blue_archive.training_ground"] : [];
  state.players.p1.army = [{ ...KEI }, { ...ARU }, { ...NERU }];
  const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_kei", 0, "legacy")!;
  const fallen = makeCombatUnitFromArmy(state.players.p1.army[1], "p1", "u_aru", 1, "legacy")!;
  fallen.damage = fallen.maxHealth;
  const goldBefore = state.players.p1.resources.gold;
  finishNeutralCombat(state, { [survivor.id]: survivor, [fallen.id]: fallen }, options.win ? "p1" : NEUTRAL_PLAYER_ID);
  const army = state.players.p1.army;
  return {
    state,
    goldDelta: state.players.p1.resources.gold - goldBefore,
    survivorXp: army.find((unit) => unit.id === KEI.id)?.experience,
    fallenXp: army.find((unit) => unit.id === ARU.id)?.experience,
    benchedXp: army.find((unit) => unit.id === NERU.id)?.experience
  };
}

// ===========================================================================
// 1. Buildings
// ===========================================================================

describe("Kivotos buildings — dwellings, citadel, guild, workshop", () => {
  it("District Academy gates BRONZE recruits and is charged 5 gold / 3 materials / 1 valuable", () => {
    let state = richP1(baGame("ba-dwelling-bronze"));
    const town = townOf(state, "p1");
    town.buildings = [];
    state.players.p1.army = [];

    // Without the dwelling the recruit is refused ("Build the dwelling…").
    expect(
      applyErr(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: KEI.unitDefId }] })
    ).toMatch(/dwelling/i);

    const before = { ...state.players.p1.resources };
    state = applyOk(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId: "blue_archive.dwelling_bronze" });
    expect(state.players.p1.resources.gold).toBe(before.gold - 5);
    expect(state.players.p1.resources.buildingMaterials).toBe(before.buildingMaterials - 3);
    expect(state.players.p1.resources.valuables).toBe(before.valuables - 1);

    // Now the bronze recruit lands and pays Kei's printed 2 gold.
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: KEI.unitDefId }] });
    expect(state.players.p1.army.map((unit) => unit.unitDefId)).toEqual([KEI.unitDefId]);
    expect(state.players.p1.resources.gold).toBe(goldBefore - 2);

    // CONTROL: a SILVER student (Mika) is still locked behind the Advanced Academy.
    state.players.p1.townTokens.population = true;
    expect(
      applyErr(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: "blue_archive.mika" }] })
    ).toMatch(/dwelling/i);
  });

  it("Advanced Academy needs the District Academy, Elite Sanctuary needs the Advanced Academy — and both charge their printed costs", () => {
    let state = richP1(baGame("ba-dwelling-chain"));
    const town = townOf(state, "p1");
    town.buildings = [];

    expect(
      applyErr(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId: "blue_archive.dwelling_silver" })
    ).toMatch(/Lower-level dwellings/);
    expect(
      applyErr(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId: "blue_archive.dwelling_gold" })
    ).toMatch(/Lower-level dwellings/);

    townOf(state, "p1").buildings.push("blue_archive.dwelling_bronze");
    let before = { ...state.players.p1.resources };
    state = applyOk(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId: "blue_archive.dwelling_silver" });
    expect(state.players.p1.resources).toEqual({ gold: before.gold - 8, buildingMaterials: before.buildingMaterials - 6, valuables: before.valuables - 3 });

    state.players.p1.townTokens.build = true;
    before = { ...state.players.p1.resources };
    state = applyOk(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId: "blue_archive.dwelling_gold" });
    expect(state.players.p1.resources).toEqual({ gold: before.gold - 10, buildingMaterials: before.buildingMaterials - 9, valuables: before.valuables - 4 });

    // Outcome: a GOLD student (Seia, few 15 gold) is now recruitable.
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: "blue_archive.seia" }] });
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "blue_archive.seia")).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore - 15);
  });

  it("Sanctum Citadel gates reinforcing: Kei stays Few without it, flips to Pack for the printed 6 gold with it", () => {
    const state = richP1(baGame("ba-citadel"));
    const town = townOf(state, "p1");
    town.buildings = ["blue_archive.dwelling_bronze"];
    state.players.p1.army = [{ ...KEI }];
    const reinforce: GameAction = {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: KEI.unitDefId, armyUnitId: KEI.id }]
    };

    applyErr(state, reinforce);
    expect(state.players.p1.army[0].side).toBe("few");

    town.buildings.push("blue_archive.citadel");
    const goldBefore = state.players.p1.resources.gold;
    const next = applyOk(state, reinforce);
    expect(next.players.p1.army[0].side).toBe("pack");
    expect(next.players.p1.resources.gold).toBe(goldBefore - 6);
  });

  it("Halo Research Tower sells the Spell Book search for exactly 5 gold (offer label AND charge)", () => {
    const state = baGame("ba-mage-guild");
    const town = townOf(state, "p1");
    town.buildings = ["blue_archive.mage_guild"];
    state.players.p1.mageGuildBuiltRound = undefined;
    state.players.p1.townTokens.spellBook = true;
    state.players.p1.resources.gold = 5;

    const offer = getLegalActions(state, "p1").find((legal) => legal.action.type === "SPELL_BOOK_ACTION");
    expect(offer?.label).toBe("5 gold: Buy spell — search (2)");
    const next = applyOk(state, offer!.action);
    expect(next.players.p1.resources.gold).toBe(0);

    // CONTROL: 4 gold is one short — no offer, and a forced buy is refused.
    const broke = baGame("ba-mage-guild-broke");
    townOf(broke, "p1").buildings = ["blue_archive.mage_guild"];
    broke.players.p1.mageGuildBuiltRound = undefined;
    broke.players.p1.resources.gold = 4;
    expect(getLegalActions(broke, "p1").some((legal) => legal.action.type === "SPELL_BOOK_ACTION")).toBe(false);
    applyErr(broke, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
  });

  it("Millennium Workshop (ARTIFACT_SMITH): the search costs 5 gold and queues an Artifact Search (2); selling pays 3 gold and REMOVES the card", () => {
    const state = baGame("ba-smith-search");
    townOf(state, "p1").buildings = ["blue_archive.research_workshop"];
    state.players.p1.resources.gold = 5;
    state.players.p1.blacksmithUsedRound = undefined;
    const search = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "BLACKSMITH_ACTION" && legal.action.option === "search"
    );
    expect(search?.label).toContain("pay 5 gold");
    const result = applyAction(state, search!.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.resources.gold).toBe(0);
    const queuedSearch =
      result.state.adventure!.rewardQueue.some((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts") ||
      result.state.pendingChoice !== null;
    expect(queuedSearch, "an Artifact Search (2) followed the payment").toBe(true);

    const sell = baGame("ba-smith-sell");
    townOf(sell, "p1").buildings = ["blue_archive.research_workshop"];
    sell.players.p1.hand = ["artifact.centaurs_axe"];
    sell.players.p1.blacksmithUsedRound = undefined;
    const goldBefore = sell.players.p1.resources.gold;
    const sellOffer = getLegalActions(sell, "p1").find(
      (legal) => legal.action.type === "BLACKSMITH_ACTION" && legal.action.option === "sell"
    );
    expect(sellOffer?.label).toContain("for 3 gold");
    const sold = applyOk(sell, sellOffer!.action);
    expect(sold.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(sold.players.p1.hand).not.toContain("artifact.centaurs_axe");
    expect(sold.players.p1.removed).toContain("artifact.centaurs_axe");

    // CONTROL: without the Workshop both arms are refused and never offered.
    const bare = baGame("ba-smith-control");
    townOf(bare, "p1").buildings = [];
    bare.players.p1.hand = ["artifact.centaurs_axe"];
    bare.players.p1.resources.gold = 50;
    expect(getLegalActions(bare, "p1").some((legal) => legal.action.type === "BLACKSMITH_ACTION")).toBe(false);
    expect(applyErr(bare, { type: "BLACKSMITH_ACTION", playerId: "p1", option: "search" })).toMatch(/Blacksmith/);
  });
});

describe("Kivotos General Student Council (RESOURCE_ROUND_CHOICE)", () => {
  function councilRound(seed: string, round: number): GameState {
    const state = baGame(seed);
    townOf(state, "p1").buildings = ["blue_archive.city_hall"];
    state.pendingChoice = null;
    state.adventure!.rewardQueue = [];
    state.round = round;
    startAdventureRound(state);
    return state;
  }

  function openCouncil(seed: string): GameState {
    const state = baGame(seed);
    townOf(state, "p1").buildings = ["blue_archive.city_hall"];
    state.pendingChoice = null;
    state.adventure!.rewardQueue = [{ playerId: "p1", kind: "city-hall-choice", buildingId: "blue_archive.city_hall" }];
    pumpAdventureQueues(state);
    // The assignment above narrowed the property to null; the pump re-filled it.
    const choice = state.pendingChoice as GameState["pendingChoice"];
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected the Council choice");
    }
    expect(choice.cityHall?.options).toHaveLength(2);
    return state;
  }

  it("queues the choice on a Resource round (odd) and NOT on an Astrologers' round (even)", () => {
    const resource = councilRound("ba-council-resource", 3);
    expect(
      resource.adventure!.rewardQueue.some(
        (reward) => reward.kind === "city-hall-choice" && reward.playerId === "p1" && reward.buildingId === "blue_archive.city_hall"
      ) || (resource.pendingChoice?.type === "OPTION_CHOICE" && resource.pendingChoice.context === "city-hall" && resource.pendingChoice.playerId === "p1")
    ).toBe(true);

    const astro = councilRound("ba-council-astro", 2);
    expect(astro.adventure!.rewardQueue.some((reward) => reward.kind === "city-hall-choice")).toBe(false);
    expect(astro.pendingChoice?.type === "OPTION_CHOICE" && astro.pendingChoice.context === "city-hall").toBe(false);
  });

  it("option 0 pays exactly 5 gold; option 1 draws exactly 3 cards", () => {
    const gold = openCouncil("ba-council-gold");
    const goldBefore = gold.players.p1.resources.gold;
    const handBefore = gold.players.p1.hand.length;
    const paid = applyOk(gold, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: gold.pendingChoice!.id, optionIndex: 0 });
    expect(paid.players.p1.resources.gold).toBe(goldBefore + 5);
    expect(paid.players.p1.hand.length).toBe(handBefore);

    const draw = openCouncil("ba-council-draw");
    while (draw.players.p1.deck.length < 3) draw.players.p1.deck.push("stat.attack");
    const deckBefore = draw.players.p1.deck.length;
    const handBefore2 = draw.players.p1.hand.length;
    const gold2 = draw.players.p1.resources.gold;
    const drawn = applyOk(draw, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: draw.pendingChoice!.id, optionIndex: 1 });
    expect(drawn.players.p1.hand.length).toBe(handBefore2 + 3);
    expect(drawn.players.p1.deck.length).toBe(deckBefore - 3);
    expect(drawn.players.p1.resources.gold).toBe(gold2);
  });
});

// ===========================================================================
// 2. Schale Training Ground
// ===========================================================================

describe("Schale Training Ground (HALL_OF_VALHALLA amount 0 + trainingWinXp 1 / trainingWinGoldWhenXpOff 2)", () => {
  it("Unit Experience ON: a won fight gives the SURVIVING DEPLOYED unit +1 XP over the base; the fallen and the benched get nothing; no gold", () => {
    const withGround = trainingFight("ba-training-xp-on", { unitExperience: true, building: true, win: true });
    const control = trainingFight("ba-training-xp-on-control", { unitExperience: true, building: false, win: true });
    expect(control.survivorXp, "CONTROL: difficulty-1 base alone").toBe(1);
    expect(withGround.survivorXp, "base 1 + Training Ground 1").toBe(2);
    expect(withGround.fallenXp ?? 0).toBe(0);
    expect(withGround.benchedXp ?? 0).toBe(0);
    // The XP arm pays no gold: the building changes nothing about the gold delta.
    expect(withGround.goldDelta).toBe(control.goldDelta);
  });

  it("Unit Experience ON: a LOST fight trains nobody (Training Ground or not)", () => {
    const lost = trainingFight("ba-training-xp-lost", { unitExperience: true, building: true, win: false });
    expect(lost.survivorXp ?? 0).toBe(0);
    expect(lost.benchedXp ?? 0).toBe(0);
  });

  it("Unit Experience OFF: a won fight pays exactly +2 gold and no XP; a lost fight pays nothing", () => {
    const won = trainingFight("ba-training-gold-win", { unitExperience: false, building: true, win: true });
    const wonControl = trainingFight("ba-training-gold-win-control", { unitExperience: false, building: false, win: true });
    expect(won.goldDelta - wonControl.goldDelta, "the Training Ground adds exactly 2 gold").toBe(2);
    expect(won.survivorXp).toBeUndefined();

    const lost = trainingFight("ba-training-gold-lost", { unitExperience: false, building: true, win: false });
    const lostControl = trainingFight("ba-training-gold-lost-control", { unitExperience: false, building: false, win: false });
    expect(lost.goldDelta - lostControl.goldDelta, "a loss pays nothing").toBe(0);
  });

  it("never surfaces a useless '+0 attack' Hall-of-Valhalla boost in an attack window (a real +1 hall on the same town IS offered)", () => {
    const state = createInitialGameState("ba-valhalla-gate");
    state.players.p1.hand = [];
    state.players.p2.hand = ["stat.defense"]; // a real defender reaction guarantees the window opens
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ground";
    attacker.position = 9;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.towns = {
      town_p1: {
        id: "town_p1",
        controllerId: "p1",
        buildings: ["blue_archive.training_ground", "little_busters.practice_field"]
      }
    } as GameState["towns"];

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(declared.reactionWindow, "the declared attack opened a window").toBeTruthy();
    const boosts = getLegalActions(declared, "p1").filter((legal) => legal.action.type === "HALL_OF_VALHALLA_BOOST");
    expect(boosts.map((legal) => (legal.action as Extract<GameAction, { type: "HALL_OF_VALHALLA_BOOST" }>).buildingId)).toEqual([
      "little_busters.practice_field"
    ]);
    expect(boosts[0]!.label).toContain("+1 attack");
    expect(boosts.some((legal) => legal.label.includes("+0"))).toBe(false);
  });

  it("player-visible descriptions promise the XP/gold effect, not an attack boost", () => {
    const ground = coreBuildingDefinitions["blue_archive.training_ground"];
    const text = describeBuildingEffect(ground);
    expect(text).toContain("+1 unit experience");
    expect(text).toContain("2 gold");
    expect(text).not.toMatch(/\+0/);
    expect(buildingTimingLabel(ground)).toBe("after won combat");
    // CONTROL: a real hall keeps the attack-boost wording.
    const hall = coreBuildingDefinitions["little_busters.practice_field"];
    expect(describeBuildingEffect(hall)).toContain("+1 attack");
    expect(buildingTimingLabel(hall)).toBe("during combat");
  });
});

// ===========================================================================
// 3. Starting tile, heroes, gate, commander
// ===========================================================================

describe("Kivotos seat wiring", () => {
  it("BA-S1 copies Rampart S4 (fields, difficulties, mine, outer borders) with only the town faction swapped, and deals to a Kivotos seat", () => {
    const ba = allTileDefinitions["BA-S1"]!;
    const s4 = allTileDefinitions.S4!;
    expect(coreFactionDefinitions.blue_archive.startingTileId).toBe("BA-S1");
    expect(ba.group).toBe("starting");
    expect(ba.fields).toEqual(s4.fields.map((field, index) => (index === 0 ? { ...field, faction: "blue_archive" } : field)));
    expect(ba.outerImpassable).toEqual(s4.outerImpassable);
    expect(ba.assets?.tileImage).toBe("/assets/anime/tiles/ba-s1-v2.webp");

    const state = baGame("ba-tile-deal");
    const tiles = Object.values(state.adventure!.tiles);
    const baTiles = tiles.filter((tile) => tile.tileDefId === "BA-S1");
    expect(baTiles).toHaveLength(1);
    const town = townOf(state, "p1");
    const townField = state.adventure!.fields[town.fieldId!];
    expect(townField?.tileInstanceId).toBe(baTiles[0]!.id);
    // CONTROL: the castle seat did not get it.
    expect(tiles.filter((tile) => tile.tileDefId === coreFactionDefinitions.castle.startingTileId)).toHaveLength(1);
  });

  it("all five heroes' starting Ability cards exist in the library and are seeded into that hero's deck", () => {
    const heroes = coreFactionDefinitions.blue_archive.heroes;
    expect(heroes).toHaveLength(5);
    for (const heroId of heroes) {
      const hero = animeTownHeroDefinitions[heroId]!;
      const card = cardLibrary[hero.startingAbilityCardId];
      expect(card, `${heroId}: ${hero.startingAbilityCardId}`).toBeDefined();
      expect(card!.kind).toBe("ability");
      expect(["might", "magic"]).toContain(hero.type);
      const state = createAdventureGameState({
        seed: `ba-hero-${heroId}`,
        rollFirstPlayer: false,
        players: [
          { id: "p1", name: "Sensei", factionId: "blue_archive", heroDefId: heroId },
          { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
        ]
      });
      const owned = [...state.players.p1.deck, ...state.players.p1.hand];
      expect(owned, `${heroId} owns ${hero.startingAbilityCardId}`).toContain(hero.startingAbilityCardId);
      expect(getMainHero(state, "p1")?.heroDefId).toBe(heroId);
    }
  });

  it("is playable only with Anime Mod + Isekai towns; excluded from the Battle-Test sandbox (no-anime call)", () => {
    expect(isPlayableFaction("blue_archive", { enabled: true, isekaiTowns: true })).toBe(true);
    expect(isPlayableFaction("blue_archive", { enabled: true, xianxiaTowns: true })).toBe(false);
    expect(isPlayableFaction("blue_archive", { enabled: false, isekaiTowns: true })).toBe(false);
    expect(isPlayableFaction("blue_archive")).toBe(false); // combat-sandbox-setup.tsx calls it with no anime arg
    expect(isPlayableFaction("castle")).toBe(true); // CONTROL
  });

  it("a BINH Kivotos seat spawns the Ibuki commander (a legacy seat spawns none)", () => {
    const binh = baGame("ba-commander-binh", { ruleset: "binh" });
    expect(binh.players.p1.commander?.slug).toBe("ibuki");
    expect(binh.players.p2.commander?.slug).toBe("paladin"); // CONTROL: castle
    const legacy = baGame("ba-commander-legacy", { ruleset: "legacy" });
    expect(legacy.players.p1.commander).toBeUndefined();
  });
});

// ===========================================================================
// 4. Unit Experience schedules for the 19-card roster
// ===========================================================================

describe("Kivotos unit veterancy schedules", () => {
  it("every Kivotos card resolves a 4-step generated schedule (no explicit override) and folds into a combat unit without throwing", () => {
    for (const unit of blueArchiveCharacters) {
      const schedule = rankScheduleFor(unit.id);
      for (const rank of [1, 2, 3, 4] as const) {
        const step = schedule[rank];
        expect(step, `${unit.id} R${rank}`).toBeTruthy();
        expect(["stats", "ability"]).toContain(step.kind);
      }
      expect(hasUniqueRankSchedule(unit.id), `${unit.id} uses the flavour generator`).toBe(false);
      const combatUnit = makeCombatUnitFromArmy({ id: `xp_${unit.name}`, unitDefId: unit.id, side: "few", experience: 30 }, "p1", `u_${unit.name}`, 0, "legacy");
      expect(combatUnit, unit.id).toBeTruthy();
    }
    // CONTROL: a signature unit DOES own an explicit override.
    expect(hasUniqueRankSchedule("dungeon.black_dragons")).toBe(true);
  });
});
