import { describe, expect, it } from "vitest";

import { createAdventureGameState } from "./adventure-setup";
import { finalizeAdventureCombat, placementCellsFor, startNeutralEncounter } from "./adventure-reducer";
import {
  FUYUKI_COMMAND_SEAL_LIMIT,
  HIDDEN_LEAF_GOLD_COMBAT_LIMIT,
  fuyukiCommandSealsOf,
  hiddenLeafCombatFormationError,
  hiddenLeafMissionCompletion,
  hiddenLeafMissionPointsEarned,
  hiddenLeafMissionRankOf
} from "./anime-town-mechanics";
import { getMainHero } from "./adventure";
import { getLegalActions } from "./legal-actions";
import { applyAction } from "./reducer";
import { createInitialGameState } from "./setup";
import type { GameAction, GameState, MapFieldState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function fuyukiCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.factionId = "fuyuki";
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.attackedThisActivation = false;
  return state;
}

describe("Fuyuki City — Command Seals", () => {
  it("legacy Fuyuki state starts with three, spends one, and allows only one per combat", () => {
    let state = fuyukiCombat("fuyuki-command-seal");
    expect(fuyukiCommandSealsOf(state.players.p1)).toBe(FUYUKI_COMMAND_SEAL_LIMIT);
    const offers = getLegalActions(state, "p1").filter((entry) => entry.action.type === "USE_FUYUKI_COMMAND_SEAL");
    expect(offers.some((entry) => entry.action.type === "USE_FUYUKI_COMMAND_SEAL" && entry.action.mode === "compel")).toBe(true);

    state = applyOk(state, {
      type: "USE_FUYUKI_COMMAND_SEAL",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      mode: "compel"
    });
    expect(state.players.p1.fuyukiCommandSeals).toBe(2);
    expect(state.combat!.fuyukiCommandSealUsedPlayerIds).toEqual(["p1"]);
    expect(state.activeEffects.some((effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === "unit_p1_griffins" &&
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount === 1)
    )).toBe(true);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "USE_FUYUKI_COMMAND_SEAL")).toBe(false);

    const refused = applyAction(state, {
      type: "USE_FUYUKI_COMMAND_SEAL",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      mode: "compel"
    });
    expect(refused.errors.length).toBeGreaterThan(0);
  });

  it("Recall heals at most three damage and cannot be spent on a full-health unit", () => {
    let state = fuyukiCombat("fuyuki-command-seal-recall");
    state.combat!.units.unit_p1_griffins.maxHealth = 10;
    state.combat!.units.unit_p1_griffins.damage = 4;
    state = applyOk(state, {
      type: "USE_FUYUKI_COMMAND_SEAL",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      mode: "recall"
    });
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);

    const full = fuyukiCombat("fuyuki-command-seal-full");
    const refused = applyAction(full, {
      type: "USE_FUYUKI_COMMAND_SEAL",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      mode: "recall"
    });
    expect(refused.errors.length).toBeGreaterThan(0);
  });
});

describe("Hidden Leaf Village — Mission Rank", () => {
  it("uses a bounded D→S ladder and excludes forced waves and teleport guards", () => {
    expect([0, 2, 3, 6, 7, 11, 12, 17, 18, 99].map(hiddenLeafMissionRankOf)).toEqual([
      "D", "D", "C", "C", "B", "B", "A", "A", "S", "S"
    ]);
    expect(hiddenLeafMissionPointsEarned({
      kind: "neutral", heroId: "h", fieldId: "f", difficulty: 6, hasAzure: false
    })).toBe(3);
    expect(hiddenLeafMissionPointsEarned({
      kind: "neutral", heroId: "h", fieldId: "f", difficulty: 0, hasAzure: false, waveAssault: { wave: 1 }
    })).toBe(0);
    expect(hiddenLeafMissionPointsEarned({
      kind: "neutral", heroId: "h", fieldId: "f", difficulty: 0, hasAzure: false, teleportArrival: true
    })).toBe(0);
  });

  it("caps recurring bounties at two gold and grants valuables only on promotion", () => {
    const state = createInitialGameState("hidden-leaf-mission-pure");
    const player = state.players.p1;
    player.factionId = "hidden_leaf";
    player.hiddenLeafMissionPoints = 11;
    const result = hiddenLeafMissionCompletion(player, {
      kind: "neutral", heroId: "h", fieldId: "f", difficulty: 3, hasAzure: false
    });
    expect(result).toMatchObject({
      pointsEarned: 2,
      totalPoints: 13,
      previousRank: "B",
      rank: "A",
      bountyGold: 2,
      promotionValuables: 1
    });
  });

  it("awards mission points and the promotion bounty through real neutral-combat finalization", () => {
    const state = createAdventureGameState({
      seed: "hidden-leaf-mission-integration",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: { enabled: true, isekaiTowns: true }
    });
    const player = state.players.p1;
    player.factionId = "hidden_leaf";
    player.hiddenLeafMissionPoints = 1;
    const hero = getMainHero(state, "p1")!;
    const field: MapFieldState = {
      spaceId: "mission-field",
      tileInstanceId: "mission-tile",
      slot: 0,
      location: "mine",
      difficulty: 3,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[field.spaceId] = field;
    hero.spaceId = field.spaceId;
    startNeutralEncounter(state, hero, field);
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") unit.damage = unit.maxHealth;
    }
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);

    expect(player.hiddenLeafMissionPoints).toBe(3);
    expect(state.eventLog).toContainEqual(expect.objectContaining({
      type: "RESOURCES_GAINED",
      playerId: "p1",
      gold: 1,
      valuables: 1,
      reason: "Hidden Leaf C-rank mission"
    }));
    expect(state.eventLog).toContainEqual(expect.objectContaining({
      type: "FACTION_MECHANIC_TRIGGERED",
      playerId: "p1",
      mechanicId: "mission-rank"
    }));
  });
});

describe("Hidden Leaf Village — shinobi-only combat formation", () => {
  it("allows at most two Gold cards and never offers Neutral-side cards for deployment", () => {
    let state = createInitialGameState("hidden-leaf-formation");
    const player = state.players.p1;
    player.factionId = "hidden_leaf";
    player.army = [
      { id: "gold-nine-tails", unitDefId: "hidden_leaf.jinchuriki", side: "few" },
      { id: "gold-susanoo", unitDefId: "hidden_leaf.susanoo", side: "few" },
      { id: "gold-hokage", unitDefId: "hidden_leaf.hokage_vanguard", side: "few" },
      { id: "neutral-boars", unitDefId: "neutral.boars", side: "neutral" }
    ];
    state.phase = "combat-setup";
    state.priorityPlayerId = "p1";
    state.activePlayerId = "p1";
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.combat!.units = {};
    state.combat!.setup = {
      pendingPlayerIds: ["p1", "p2"],
      placedUnitIds: { p1: [], p2: [] },
      unitLimit: 5
    };

    expect(HIDDEN_LEAF_GOLD_COMBAT_LIMIT).toBe(2);
    expect(hiddenLeafCombatFormationError(player, [
      { side: "few", tier: "gold" },
      { side: "pack", tier: "gold" }
    ])).toBeNull();
    const [firstPosition, secondPosition, thirdPosition] = placementCellsFor(state, "p1");

    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: "gold-nine-tails", position: firstPosition
    });
    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: "gold-susanoo", position: secondPosition
    });

    const offers = getLegalActions(state, "p1").filter((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    expect(offers.some((entry) => entry.action.type === "PLACE_COMBAT_UNIT" && entry.action.armyUnitId === "gold-hokage")).toBe(false);
    expect(offers.some((entry) => entry.action.type === "PLACE_COMBAT_UNIT" && entry.action.armyUnitId === "neutral-boars")).toBe(false);

    for (const armyUnitId of ["gold-hokage", "neutral-boars"]) {
      const forged = applyAction(state, {
        type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId, position: thirdPosition
      });
      expect(forged.errors.length, armyUnitId).toBeGreaterThan(0);
    }
  });
});
