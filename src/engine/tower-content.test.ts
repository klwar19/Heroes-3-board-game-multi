import { describe, expect, it } from "vitest";
import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  makeCombatUnitFromArmy,
  NEUTRAL_DECK_IDS
} from "./index";
import { gainExperience, getMainHero, levelOfExperience, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A fresh adventure state with Dracon active, holding his level-IV specialty. */
function draconIvState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Dracon", factionId: "tower", heroDefId: "dracon" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.hand = ["specialty.dracon.4"];
  return state;
}

/** A Dracon-IV PLAY_CARD legal action for a specific CHOOSE_ONE option. */
function findDraconOption(state: GameState, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "specialty.dracon.4" &&
      legal.action.optionIndex === optionIndex
  );
}

describe("Tower content", () => {
  it("wires the faction to its eight town buildings, six heroes, seven units, cards, and art slots", () => {
    const faction = coreFactionDefinitions.tower;
    expect(faction).toBeDefined();
    expect(faction.startingTileId).toBe("#S1");
    expect(faction.buildings).toEqual([
      "tower.city_hall",
      "tower.citadel",
      "tower.mage_guild",
      "tower.dwelling_bronze",
      "tower.dwelling_silver",
      "tower.dwelling_gold",
      "tower.artifact_merchants",
      "tower.wall_of_knowledge"
    ]);
    expect(Object.keys(TOWN_BUILDING_IMAGES.tower ?? {})).toHaveLength(8);
    for (const building of faction.buildings) {
      expect(coreBuildingDefinitions[building].assets?.image, `${building} art`).toContain("/assets/town/tower_");
    }

    // City Hall: 4 gold OR draw a card (wiki-verified).
    expect(coreBuildingDefinitions["tower.city_hall"].effect).toMatchObject({
      type: "RESOURCE_ROUND_CHOICE",
      options: [{ gold: 4 }, { drawCards: 1 }]
    });
    // Artifact Merchants is the Tower artifact source (search 7 gold / sell 2).
    expect(coreBuildingDefinitions["tower.artifact_merchants"].effect).toMatchObject({
      type: "ARTIFACT_SMITH",
      searchCost: 7,
      sellGold: 2
    });
    // Wall of Knowledge: the new Astrologers'-round statistic recovery.
    expect(coreBuildingDefinitions["tower.wall_of_knowledge"].effect).toMatchObject({
      type: "ASTROLOGERS_TAKE_STATISTIC"
    });
    expect(coreBuildingDefinitions["tower.wall_of_knowledge"].cost).toEqual({
      gold: 6,
      buildingMaterials: 4,
      valuables: 1
    });

    expect(faction.heroes).toEqual(["cyra", "dracon", "iona", "josephine", "solmyr", "torosar"]);
    for (const heroId of faction.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, heroId).toBeDefined();
      expect(hero.faction).toBe("tower");
      expect(hero.portrait, `${heroId} portrait`).toBeTruthy();
      expect(cardLibrary[hero.startingAbilityCardId], `${heroId} ability`).toBeDefined();
      for (const specialtyId of Object.values(hero.specialtyCardIds)) {
        expect(cardLibrary[specialtyId], `${heroId} specialty ${specialtyId}`).toBeDefined();
      }
    }
    // The four art-backed heroes carry a Tower board scan and a cropped portrait.
    for (const heroId of ["dracon", "iona", "josephine", "solmyr"]) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero.portrait).toBe(`/assets/hero_boardart-${heroId}.webp`);
      expect(hero.boardScan).toContain("/assets/heroes-tower-");
    }
    // The two heroes whose boards are not on the wiki yet use a PC portrait.
    for (const heroId of ["cyra", "torosar"]) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero.portrait).toBe(`/assets/hero_portraits-${heroId}.webp`);
      expect(hero.boardScan).toBeUndefined();
    }

    expect(faction.units).toEqual([
      "tower.gremlins",
      "tower.gargoyles",
      "tower.iron_golems",
      "tower.magi",
      "tower.genies",
      "tower.nagas",
      "tower.titans"
    ]);
    for (const unitId of faction.units) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit.few?.cardImage, `${unit.id} few art`).toContain("/assets/units-tower-");
      expect(unit.pack?.cardImage, `${unit.id} pack art`).toContain("/assets/units-tower-");
    }
    // Implemented engine ability tags are wired on the right sides.
    // Magi read "ignore the combat penalties" (all of them); Titans read
    // "...combat penalties against adjacent units" (only the adjacent one).
    expect(coreUnitDefinitions["tower.magi"].few?.abilities).toContain("ignore-all-combat-penalties");
    expect(coreUnitDefinitions["tower.nagas"].pack?.abilities).toContain("ignores-retaliation");
    expect(coreUnitDefinitions["tower.titans"].pack?.abilities).toContain("ignore-combat-penalties");
  });

  it("flips Gremlins and Titans from ground to ranged when reinforced (per-side type)", () => {
    for (const unitDefId of ["tower.gremlins", "tower.titans"]) {
      const few = makeCombatUnitFromArmy({ id: "a-few", unitDefId, side: "few" }, "p1", "u-few", 0);
      const pack = makeCombatUnitFromArmy({ id: "a-pack", unitDefId, side: "pack" }, "p1", "u-pack", 1);
      expect(few?.type, `${unitDefId} few`).toBe("ground");
      expect(pack?.type, `${unitDefId} pack`).toBe("ranged");
    }
    // A unit without a per-side override keeps the definition-level type.
    const magi = makeCombatUnitFromArmy({ id: "a-magi", unitDefId: "tower.magi", side: "pack" }, "p1", "u-magi", 0);
    expect(magi?.type).toBe("ranged");
    const golem = makeCombatUnitFromArmy({ id: "a-golem", unitDefId: "tower.iron_golems", side: "pack" }, "p1", "u-golem", 0);
    expect(golem?.type).toBe("ground");
  });

  it("places the Tower starting tile and town for a seated Tower player", () => {
    const state = createAdventureGameState({
      seed: "tower-setup",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Iona", factionId: "tower", heroDefId: "iona" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Tower player should own a town").toBeTruthy();
    expect(town?.factionId).toBe("tower");
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    expect(hero, "Tower player should have a main hero").toBeTruthy();
  });

  it("offers the Wall of Knowledge stat-recovery only when a Knowledge/Power Statistic is in the discard", () => {
    function towerAstrologersState(discard: string[]): GameState {
      const state = createAdventureGameState({
        seed: "tower-wok",
        rollFirstPlayer: false,
        players: [
          { id: "p1", name: "Josephine", factionId: "tower", heroDefId: "josephine" },
          { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
        ]
      });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
      if (!town) {
        throw new Error("no Tower town");
      }
      if (!town.buildings.includes("tower.wall_of_knowledge")) {
        town.buildings.push("tower.wall_of_knowledge");
      }
      state.players.p1.discard = [...discard];
      state.players.p1.hand = [];
      state.pendingChoice = null;
      if (state.adventure) {
        state.adventure.rewardQueue = [];
      }
      // Even rounds are Astrologers' rounds.
      state.round = 2;
      startAdventureRound(state);
      return state;
    }

    // With a Power Statistic (and an unrelated Attack Statistic) in discard, the
    // building queues its take-a-card choice for that player.
    const withStat = towerAstrologersState(["stat.power", "stat.attack"]);
    const queuedFor = (state: GameState) =>
      state.adventure?.rewardQueue.some(
        (reward) =>
          reward.playerId === "p1" &&
          reward.kind === "visit-steps" &&
          reward.steps.some((step) => step.type === "CHOOSE_ONE" && step.prompt.includes("Wall of Knowledge"))
      ) ?? false;
    expect(queuedFor(withStat)).toBe(true);

    // Pump the queue into the choice, take the card, and confirm only the
    // Power Statistic was offered (the Attack Statistic is filtered out).
    let state = withStat;
    pumpAdventureQueues(state);
    const take = getLegalActions(state, "p1").find((legal) => legal.label.includes("Take a Knowledge or Power Statistic"));
    expect(take, "the take-a-statistic option should be offered").toBeTruthy();
    state = applyOk(state, take!.action);
    pumpAdventureQueues(state);
    const pick = getLegalActions(state, "p1").filter((legal) => legal.label.startsWith("Take "));
    expect(pick.map((legal) => legal.label).join(" | ")).toContain("Power");
    expect(pick.map((legal) => legal.label).join(" | ")).not.toContain("Attack");
    state = applyOk(state, pick[0].action);
    expect(state.players.p1.hand).toContain("stat.power");

    // With no Knowledge/Power Statistic in the discard, nothing is queued.
    const withoutStat = towerAstrologersState(["stat.attack", "spell.magic_arrow"]);
    expect(queuedFor(withoutStat)).toBe(false);
  });

  it("lets Dracon trade a Pack of Magi for the unique Enchanters card (specialty IV)", () => {
    const state = createAdventureGameState({
      seed: "dracon-iv",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Dracon", factionId: "tower", heroDefId: "dracon" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.dracon.4"];
    state.players.p1.army = [{ id: "army_magi", unitDefId: "tower.magi", side: "pack" }];
    expect(state.decks[NEUTRAL_DECK_IDS.gold].drawPile).toContain("neutral.enchanters");

    const convert = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.dracon.4" && legal.action.optionIndex === 0
    );
    expect(convert, "the Magi→Enchanters trade should be offered").toBeTruthy();
    const next = applyOk(state, convert!.action);
    expect(next.players.p1.army.some((unit) => unit.unitDefId === "tower.magi")).toBe(false);
    expect(next.players.p1.army.some((unit) => unit.unitDefId === "neutral.enchanters")).toBe(true);
    expect(next.decks[NEUTRAL_DECK_IDS.gold].drawPile).not.toContain("neutral.enchanters");
  });

  // House rule (BINH): Dracon IV may ALSO upgrade the cheaper Few of Magi into the
  // unique Enchanters by paying 6 extra gold (the Pack option above is free).
  it("lets Dracon trade a Few of Magi + 6 gold for the unique Enchanters (house rule, option 2)", () => {
    const state = draconIvState("dracon-iv-few");
    state.players.p1.army = [{ id: "army_magi_few", unitDefId: "tower.magi", side: "few" }];
    state.players.p1.resources.gold = 6;
    expect(state.decks[NEUTRAL_DECK_IDS.gold].drawPile).toContain("neutral.enchanters");

    const convert = findDraconOption(state, 2);
    expect(convert, "the Few-of-Magi + 6 gold trade should be offered").toBeTruthy();
    const next = applyOk(state, convert!.action);

    expect(next.players.p1.army.some((unit) => unit.unitDefId === "tower.magi"), "the Few was discarded").toBe(
      false
    );
    expect(next.players.p1.army.some((unit) => unit.unitDefId === "neutral.enchanters")).toBe(true);
    expect(next.players.p1.resources.gold, "exactly 6 gold spent (6 → 0)").toBe(0);
    expect(next.decks[NEUTRAL_DECK_IDS.gold].drawPile).not.toContain("neutral.enchanters");
  });

  it("gates the Few trade on 6 gold: not offered at 5 (the draw option still is)", () => {
    const state = draconIvState("dracon-iv-few-poor");
    state.players.p1.army = [{ id: "army_magi_few", unitDefId: "tower.magi", side: "few" }];
    state.players.p1.resources.gold = 5;

    expect(findDraconOption(state, 2), "the Few trade needs 6 gold, not 5").toBeFalsy();
    expect(findDraconOption(state, 1), "the draw option is always available").toBeTruthy();
    // Control: the Pack trade (option 0) is also absent — the army holds only a Few,
    // proving fromSide is matched (a Few does not satisfy the Pack option).
    expect(findDraconOption(state, 0), "no Pack of Magi → the Pack trade is not offered").toBeFalsy();
  });

  it("CONTROL: the Few trade discards the FEW specifically, leaving a Pack of Magi untouched", () => {
    const state = draconIvState("dracon-iv-few-vs-pack");
    state.players.p1.army = [
      { id: "army_magi_few", unitDefId: "tower.magi", side: "few" },
      { id: "army_magi_pack", unitDefId: "tower.magi", side: "pack" }
    ];
    state.players.p1.resources.gold = 10;

    const convert = findDraconOption(state, 2);
    expect(convert, "the Few trade is offered with both sides present").toBeTruthy();
    const next = applyOk(state, convert!.action);

    expect(
      next.players.p1.army.some((unit) => unit.unitDefId === "tower.magi" && unit.side === "few"),
      "the Few was discarded"
    ).toBe(false);
    expect(
      next.players.p1.army.some((unit) => unit.unitDefId === "tower.magi" && unit.side === "pack"),
      "the Pack of Magi is left untouched"
    ).toBe(true);
    expect(next.players.p1.army.some((unit) => unit.unitDefId === "neutral.enchanters")).toBe(true);
    expect(next.players.p1.resources.gold, "6 gold spent (10 → 4)").toBe(4);
  });

  // House rule (BINH) UI driver: reaching level IV pops a notice in the client.
  // This pins down the exact engine SIGNAL the popup keys on — a HERO_LEVEL_UP
  // event with level 4 for Dracon — alongside his Enchanters IV landing in hand.
  it("fires a HERO_LEVEL_UP(level 4) event for Dracon when he reaches level IV (popup trigger)", () => {
    const state = draconIvState("dracon-iv-levelup");
    expect(state.players.p1.heroDefId, "p1 is Dracon").toBe("dracon");
    state.players.p1.hand = []; // start empty so the granted specialty is visible
    const hero = getMainHero(state, "p1")!;
    expect(hero, "Dracon's main hero exists").toBeTruthy();
    // Sit one step below level IV, then cross into it.
    hero.experience = 5;
    hero.level = levelOfExperience(5);
    expect(hero.level, "level 3 before the gain").toBe(3);

    gainExperience(state, "p1", 1); // exp 5 → 6 ⇒ level 3 → 4
    pumpAdventureQueues(state);

    expect(getMainHero(state, "p1")!.level, "Dracon reaches level IV").toBe(4);
    const levelUps = state.eventLog.filter(
      (event) => event.type === "HERO_LEVEL_UP" && event.playerId === "p1" && event.level === 4
    );
    expect(levelUps.length, "exactly one level-IV HERO_LEVEL_UP fired (drives the popup)").toBe(1);
    expect(state.players.p1.hand, "Enchanters IV landed in hand").toContain("specialty.dracon.4");
  });
});
