import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  tileFootprint,
  tileFootprintsTouch,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState
} from "./index";

function makeGame(): GameState {
  return createAdventureGameState({ seed: "test-seed" });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  return apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
}

describe("hex math", () => {
  it("keeps the six neighbours at distance 1 in ring order", () => {
    for (const center of [
      { row: 4, col: 4 },
      { row: 5, col: 4 }
    ]) {
      const neighbors = hexNeighbors(center);
      expect(neighbors).toHaveLength(6);
      for (const neighbor of neighbors) {
        expect(hexDistance(center, neighbor)).toBe(1);
      }
      expect(new Set(neighbors.map(hexSpaceId)).size).toBe(6);
    }
  });

  it("builds 7-hex tile footprints that rotate in place", () => {
    const center = { row: 8, col: 2 };
    const footprint = tileFootprint(center, 0);
    expect(footprint).toHaveLength(7);
    expect(new Set(footprint.map(hexSpaceId)).size).toBe(7);

    const rotated = tileFootprint(center, 2);
    expect(new Set(rotated.map(hexSpaceId))).toEqual(new Set(footprint.map(hexSpaceId)));
    // Rotation by two steps moves slot 1 to where slot 3 was.
    expect(hexSpaceId(rotated[1])).toBe(hexSpaceId(footprint[3]));
  });

  it("treats tiles as touching exactly at center distance 3", () => {
    const base = { row: 8, col: 2 };
    expect(tileFootprintsTouch(base, { row: 8, col: 5 })).toBe(true);
    expect(tileFootprintsTouch(base, { row: 8, col: 4 })).toBe(false);
    expect(tileFootprintsTouch(base, { row: 8, col: 6 })).toBe(false);
  });
});

describe("adventure setup", () => {
  it("places starting tiles, towns and heroes, and a connected map", () => {
    const state = makeGame();
    const adventure = state.adventure;
    expect(adventure).not.toBeNull();
    if (!adventure) {
      return;
    }

    // 2 starting + 2 near + 1 center tile.
    expect(Object.keys(adventure.tiles)).toHaveLength(5);

    const centers = Object.values(adventure.tiles).map((tile) => ({ row: tile.centerRow, col: tile.centerCol }));
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        expect(hexDistance(centers[i], centers[j])).toBeGreaterThanOrEqual(3);
      }
    }

    const hero = state.heroes.hero_p1;
    expect(hero.spaceId).toBeTruthy();
    const heroField = adventure.fields[hero.spaceId ?? ""];
    expect(heroField.location).toBe("town");
    expect(state.towns.town_p1.fieldId).toBe(hero.spaceId);

    // Starting deck: Catherine has 2/2/1/1 stats + magic arrow + ability + specialty.
    const player = state.players.p1;
    expect(player.deck.length + player.hand.length).toBe(9);
    expect(player.limits.hand).toBe(4);
    expect(player.limits.expertUses).toBe(0);
    expect(player.army.length).toBeGreaterThanOrEqual(3);
  });

  it("hides face-down tiles and foreign far tile supplies in the player view", () => {
    const state = makeGame();
    const view = getPlayerView(state, "p1");
    const faceDown = Object.values(view.adventure?.tiles ?? {}).filter((tile) => tile.faceDown);
    expect(faceDown.length).toBeGreaterThan(0);
    for (const tile of faceDown) {
      expect(tile.tileDefId).toBe("hidden");
    }
    expect(view.adventure?.playerFarTiles.p2.every((tileId) => tileId === "hidden")).toBe(true);
    expect(view.adventure?.playerFarTiles.p1.every((tileId) => tileId !== "hidden")).toBe(true);
  });
});

describe("turns and movement", () => {
  it("requires a hand refresh, then draws to the hand limit", () => {
    let state = makeGame();
    expect(state.players.p1.needsHandRefresh).toBe(true);

    state = refreshP1(state);
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p1.needsHandRefresh).toBe(false);
  });

  it("moves one field for 1 MP and visits resource fields with a die roll", () => {
    let state = refreshP1(makeGame());
    const heroSpace = state.heroes.hero_p1.spaceId ?? "";
    // S3 town at (8,2): the E ring hex (8,3) is the Resources field.
    const target = "h:8:3";
    const before = state.players.p1.resources;
    const totalBefore = before.gold + before.buildingMaterials + before.valuables;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
    expect(state.heroes.hero_p1.spaceId).toBe(target);
    expect(state.heroes.hero_p1.movementPoints).toBe(2);

    const after = state.players.p1.resources;
    const totalAfter = after.gold + after.buildingMaterials + after.valuables;
    expect(totalAfter).toBeGreaterThan(totalBefore);
    expect(state.adventure?.fields[target].blackCube).toBe(true);

    // Re-entering a used visitable field does nothing further.
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: heroSpace });
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
    expect(state.heroes.hero_p1.movementPoints).toBe(0);
  });

  it("rejects moves into blocked fields and through sealed outer edges", () => {
    const state = refreshP1(makeGame());
    // S3 NW ring hex (7,1) is the blocked field.
    const result = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: "h:7:1"
    });
    expect(result.errors).toHaveLength(1);
  });

  it("advances rounds, refreshes tokens, and pays income on resource rounds", () => {
    let state = refreshP1(makeGame());
    state.players.p1.production.gold = 3;
    state.players.p1.townTokens.build = false;

    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    state = apply(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    const goldBefore = state.players.p1.resources.gold;
    state = apply(state, { type: "END_TURN", playerId: "p2" });

    // Round 2 is an Astrologers round: tokens refresh, no income.
    expect(state.round).toBe(2);
    expect(state.players.p1.townTokens.build).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore);

    state = refreshP1(state);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    state = apply(state, { type: "END_TURN", playerId: "p2" });

    // Round 3 is a Resource round: production pays out.
    expect(state.round).toBe(3);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
  });
});

describe("neutral combat", () => {
  function moveOntoGuardedMine(state: GameState): GameState {
    // S3 SW ring hex (9,1) is the building-materials mine guarded at level I.
    return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  }

  it("starts combat setup with the difficulty-table army", () => {
    const state = moveOntoGuardedMine(refreshP1(makeGame()));
    expect(state.phase).toBe("combat-setup");
    expect(state.combat).not.toBeNull();
    expect(state.combat?.context.kind).toBe("neutral");

    // Normal difficulty, level I field: one bronze neutral.
    const neutrals = Object.values(state.combat?.units ?? {}).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(neutrals).toHaveLength(1);
    expect(neutrals[0].grade).toBe("bronze");
  });

  it("lets the hero place units, fights an automated neutral round, and gates on the time limit", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const armyUnit = state.players.p1.army[0];

    state = apply(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 13
    });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // The pump runs neutral activations until a human decision is needed:
    // either an instant window opened, the round ended (continue/retreat), or
    // the player unit is up.
    const combat = state.combat;
    expect(combat).not.toBeNull();
    const pausedForHuman =
      state.reactionWindow !== null ||
      combat?.awaitingContinue === true ||
      (combat?.activeUnitId !== null &&
        combat?.units[combat.activeUnitId ?? ""]?.controllerId === "p1") ||
      combat?.outcome !== null;
    expect(pausedForHuman).toBe(true);
  });

  it("skips combat entirely with quick combat when the hero outlevels the field", () => {
    let state = refreshP1(makeGame());
    state.heroes.hero_p1.level = 3;
    const productionBefore = state.players.p1.production.buildingMaterials;

    state = moveOntoGuardedMine(state);
    expect(state.combat).toBeNull();
    // The mine is flagged immediately after the free win.
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBe("p1");
    expect(state.players.p1.production.buildingMaterials).toBe(productionBefore + 2);
    expect(state.players.p1.resources.buildingMaterials).toBeGreaterThan(0);
  });

  it("awards experience and resolves the mine flag after winning the fight", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const armyUnit = state.players.p1.army.find((unit) => unit.unitDefId === "castle.griffins") ?? state.players.p1.army[0];
    state = apply(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 13
    });

    // Make the fight deterministic: the player's unit one-shots anything.
    state.combat!.dice.scriptedRolls = [1, 1, 1, 1, 1, 1, 1, 1];
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "p1") {
        unit.attack = 99;
        unit.initiative = 99;
      }
    }

    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Drive the combat: the player attacks with their single unit; instant
    // windows are passed through.
    let safety = 30;
    while (state.combat && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const attack = actions.find((legal) => legal.action.type === "ATTACK_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = attack ?? pass ?? keepRoll ?? actions[0];
      expect(next, `no action available in phase ${state.phase}`).toBeTruthy();
      state = apply(state, next.action);
    }

    expect(state.combat).toBeNull();
    // Difficulty I at hero level I: +1 experience.
    expect(state.heroes.hero_p1.experience).toBe(1);
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBe("p1");
    expect(state.players.p1.production.buildingMaterials).toBe(2);
    expect(state.phase).toBe("player-turn");
  });

  it("returns the hero on retreat and keeps the field guarded", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const townSpace = state.towns.town_p1.fieldId ?? "";
    const armyUnit = state.players.p1.army[0];
    state = apply(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 16
    });
    // Stack the dice against the player so the round ends with both alive.
    state.combat!.dice.scriptedRolls = [-1, -1, -1, -1, -1, -1];
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
    }
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    let safety = 30;
    while (state.combat && !state.combat.awaitingContinue && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const defend = actions.find((legal) => legal.action.type === "DEFEND_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = defend ?? pass ?? keepRoll ?? actions[0];
      expect(next, `no action available in phase ${state.phase}`).toBeTruthy();
      state = apply(state, next.action);
    }

    expect(state.combat?.awaitingContinue).toBe(true);
    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });

    expect(state.combat).toBeNull();
    expect(state.heroes.hero_p1.spaceId).toBe(townSpace);
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBeNull();
    expect(state.adventure?.fields["h:9:1"].difficulty).toBe(1);
  });
});

describe("town economy", () => {
  it("builds with the build token, enforcing cost and dwelling order", () => {
    let state = refreshP1(makeGame());

    const silverFirst = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_silver"
    });
    expect(silverFirst.errors).toHaveLength(1);

    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_bronze");
    expect(state.players.p1.resources.gold).toBe(5);
    expect(state.players.p1.townTokens.build).toBe(false);

    const secondBuild = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.mage_guild"
    });
    expect(secondBuild.errors).toHaveLength(1);
  });

  it("recruits with the population token once a dwelling stands", () => {
    let state = refreshP1(makeGame());

    const tooEarly = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.halberdiers" }]
    });
    expect(tooEarly.errors).toHaveLength(1);

    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });

    const armyBefore = state.players.p1.army.length;
    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.halberdiers" }]
    });
    expect(state.players.p1.army).toHaveLength(armyBefore + 1);
    expect(state.players.p1.townTokens.population).toBe(false);
  });

  it("buys spells through the Mage Guild one round after construction", () => {
    let state = refreshP1(makeGame());
    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.mage_guild"
    });

    // Building it queues two free Search (2) of the Spell deck.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    for (let i = 0; i < 2 && state.pendingChoice; i += 1) {
      const actions = getLegalActions(state, "p1");
      state = apply(state, actions[0].action);
    }

    const sameRound = applyAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(sameRound.errors).toHaveLength(1);

    // Pass to the next round; the two searched spells push the hand over the
    // limit, so the start-of-turn refresh has to discard down to 4 first.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    state = apply(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: state.players.p1.hand.slice(0, Math.max(0, state.players.p1.hand.length - 4))
    });

    state.players.p1.resources.gold = 10;
    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(state.players.p1.resources.gold).toBe(4);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
  });
});

describe("experience and victory", () => {
  it("applies level effects: hand limit, expert slots, searches and specialties", () => {
    let state = refreshP1(makeGame());
    state.adventure!.fields["h:7:2"].location = "learning_stone";

    // Visiting a learning stone grants 1 XP (still level I at one step).
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:7:2" });
    expect(state.heroes.hero_p1.experience).toBe(1);
    expect(state.heroes.hero_p1.level).toBe(1);

    // Push straight to level IV: searches queue and the specialty is gained.
    const handBefore = state.players.p1.hand.length;
    state.heroes.hero_p1.experience = 5;
    state.adventure!.fields["h:9:2"].location = "learning_stone";
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:2" });
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:2" });

    expect(state.heroes.hero_p1.level).toBe(4);
    expect(state.players.p1.limits.hand).toBe(5);
    expect(state.players.p1.limits.expertUses).toBe(2);
    expect(state.players.p1.hand.length).toBeGreaterThan(handBefore);
    expect(state.players.p1.hand).toContain("specialty.catherine.4");
    // Ability searches from levels II and III open one at a time.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("wins the game by flagging the enemy town", () => {
    let state = refreshP1(makeGame());
    const enemyTownField = state.towns.town_p2.fieldId ?? "";
    const hero = state.heroes.hero_p1;
    // Teleport next to the enemy town for the test.
    state.heroes.hero_p2.spaceId = null;
    hero.spaceId = "h:8:7";
    state.adventure!.fields["h:8:7"] = {
      ...state.adventure!.fields[enemyTownField],
      spaceId: "h:8:7",
      location: "empty_field",
      difficulty: undefined,
      flagOwnerId: null,
      blackCube: false,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.lastVisitedField.hero_p1 = "h:8:7";

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: enemyTownField });
    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
  });
});
