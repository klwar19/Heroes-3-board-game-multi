import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { applyAction, createAdventureLobbyState, createAdventureGameState } from "./index";
import { beginFieldVisit, checkDragonConquerorHold, drawGuardArmy, getMainHero, materializeTileFields } from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter, pumpAdventureQueues } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatState, CustomMapTilePlan, DragonUtopiaGuards, GameAction, GameState } from "./state";

const starts: CustomMapTilePlan[] = [
  { row: 8, col: 2, group: "starting", faceDown: false },
  { row: 10, col: 7, group: "starting", faceDown: false },
];
const centers: CustomMapTilePlan[] = [
  { row: 9, col: 4, group: "center", faceDown: true, viiFields: ["grail", "dragon_utopia"] },
  { row: 9, col: 4, group: "center", faceDown: false, tileDefId: "C2", viiField: "grail" },
  { row: 9, col: 4, group: "center", faceDown: true, viiField: "town" },
  { row: 9, col: 4, group: "center", faceDown: true },
];
function ok(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}
function start(mode: "dragon-hunt" | "dragon-conqueror", center: CustomMapTilePlan, guards: DragonUtopiaGuards): GameState {
  let state = createAdventureLobbyState({ seed: `dragon-map-${mode}-${center.tileDefId}-${guards}`, scenarioId: "skirmish" });
  state = ok(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: {
    playerCount: 2, difficulty: "hard",
    customMap: [...starts, center],
    customMapPreset: { objectives: { hiddenGrailUtopia: true, utopiaGuards: "four" } },
    victoryMode: mode, dragonUtopiaGuards: guards,
  } });
  expect(state.setupLobby!.options.victoryMode).toBe(mode);
  state = ok(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
  state = ok(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" });
  state = ok(state, { type: "START_ADVENTURE", playerId: "p1" });
  expect(state.adventure!.victoryMode).toBe(mode);
  for (const tile of Object.values(state.adventure!.tiles)) {
    if (tile.faceDown) { tile.faceDown = false; materializeTileFields(state.adventure!, tile); }
  }
  return state;
}

describe("Dragon victories on designed VI–VII maps", () => {
  it("only Hunt objective guards have a rank-one floor with Unit Experience, preserving higher ranks", () => {
    for (const mode of ["dragon-hunt", "dragon-conqueror"] as const) {
      for (const enabled of [false, true]) {
        for (const round of [1, 14]) {
          for (const guards of ["four", "two-azure-two-gold", "by-difficulty"] as const) {
            let state = start(mode, centers[1], guards);
            state.adventure!.unitExperience = enabled;
            state.adventure!.neutralRankUp = round === 14;
            state.round = round;
            const field = Object.values(state.adventure!.fields).find(f => f.location === "dragon_utopia")!;
            const hero = getMainHero(state, "p1")!;
            hero.spaceId = field.spaceId;
            for (const player of Object.values(state.players)) {
              player.canMulligan = false; player.needsHandRefresh = false; player.hand = [];
            }
            state.activePlayerId = "p1";
            state.phase = "player-turn";
            startNeutralEncounter(state, hero, field);
            state = ok(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1",
              armyUnitId: state.players.p1.army[0].id, position: 13 });
            state = ok(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
            const units = Object.values(state.combat!.units).filter(u => u.controllerId === NEUTRAL_PLAYER_ID);
            expect(units.length).toBeGreaterThan(0);
            for (const unit of units) {
              expect(unit.unitRank ?? 0).toBe(round === 14 ? 3 : enabled && mode === "dragon-hunt" ? 1 : 0);
            }
          }
        }
      }
    }
  });

  it("uses a map's guard default, allows a lobby override, and clears the default when the map is removed", () => {
    const preset = { victoryMode: "dragon-hunt" as const, objectives: { utopiaGuards: "two-azure-two-gold" as const } };
    let lobby = createAdventureLobbyState({ seed: "dragon-guard-default" });
    lobby = ok(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: {
      customMap: [...starts, centers[0]], customMapPreset: preset,
    } });
    expect(lobby.setupLobby!.options.dragonUtopiaGuards).toBe("two-azure-two-gold");
    lobby = ok(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { dragonUtopiaGuards: "four" } });
    expect(lobby.setupLobby!.options.dragonUtopiaGuards).toBe("four");
    lobby = ok(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { customMap: null } });
    expect(lobby.setupLobby!.options.dragonUtopiaGuards).toBe("by-difficulty");
    const state = createAdventureGameState({ seed: "dragon-direct-default", rollFirstPlayer: false,
      customMap: [...starts, centers[0]], customMapPreset: preset });
    expect(state.adventure!.victoryMode).toBe("dragon-hunt");
    expect(state.adventure!.dragonUtopiaGuards).toBe("two-azure-two-gold");
  });

  for (const mode of ["dragon-hunt", "dragon-conqueror"] as const) {
    for (const [index, center] of centers.entries()) {
      for (const guards of ["four", "two-azure-two-gold", "by-difficulty"] as const) {
        it(`${mode}, map ${index}, ${guards}: lobby starts, Utopia exists, selected guards fight and the condition wins`, () => {
          const state = start(mode, center, guards);
          const fields = Object.values(state.adventure!.fields).filter(field => field.location === "dragon_utopia");
          expect(fields).toHaveLength(1);
          const field = fields[0]!;
          expect(field.difficulty).toBe(7);
          const tile = state.adventure!.tiles[field.tileInstanceId]!;
          expect(allTileDefinitions[tile.tileDefId]?.group).toBe("center");
          expect(allTileDefinitions[tile.tileDefId]?.fields.some(f => f.location === "dragon_utopia")).toBe(true);
          const draws = drawGuardArmy(state, field, 7);
          if (guards === "four") {
            expect(draws.map(draw => draw.unitDefId).sort()).toEqual([
              "neutral.azure_dragons", "neutral.crystal_dragons", "neutral.faerie_dragons", "neutral.rust_dragons",
            ]);
          } else {
            expect(draws.map(draw => draw.tier).sort()).toEqual(guards === "two-azure-two-gold"
              ? ["azure", "azure", "gold", "gold"] : ["azure", "azure", "gold"]);
          }
          const hero = getMainHero(state, "p1")!;
          hero.spaceId = field.spaceId;
          for (const player of Object.values(state.players)) { player.canMulligan = false; player.needsHandRefresh = false; player.hand = []; }
          state.activePlayerId = "p1";
          state.combat = {
            id: "map-utopia-fight", round: 1, attackerPlayerId: "p1", defenderPlayerId: NEUTRAL_PLAYER_ID,
            activeUnitId: null, context: { kind: "neutral", heroId: hero.id, fieldId: field.spaceId, difficulty: 7, hasAzure: true },
            setup: null, awaitingContinue: false, units: {},
            outcome: { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" },
            dice: { faces: [...ATTACK_DIE_FACES], seed: "utopia", rollCount: 0 },
          } as CombatState;
          finalizeAdventureCombat(state);
          expect(state.combat).toBeNull();
          if (mode === "dragon-conqueror") {
            expect(state.adventure!.winnerPlayerId).toBeNull();
            expect(field.flagOwnerId).toBe("p1");
            expect(field.blackCube).toBe(false);
            // A rival's turn cannot award the holder a premature victory.
            checkDragonConquerorHold(state, "p2");
            expect(state.adventure!.winnerPlayerId).toBeNull();
            checkDragonConquerorHold(state, "p1");
          }
          expect(state.adventure!.winnerPlayerId).toBe("p1");
          expect(state.phase).toBe("game-over");
        });
      }
    }
  }

  it("the visit/quick-resolution path also wins with the hidden field package enabled", () => {
    const state = start("dragon-hunt", centers[0], "two-azure-two-gold");
    const field = Object.values(state.adventure!.fields).find(f => f.location === "dragon_utopia")!;
    const hero = getMainHero(state, "p1")!; hero.spaceId = field.spaceId;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("scenario maps guarantee Utopia even with the Polish objective mix on", () => {
    for (let seed = 0; seed < 6; seed++) {
      const state = createAdventureGameState({ seed: `dragon-polish-${seed}`, victoryMode: "dragon-conqueror",
        houseRules: { "polish-grail-utopia": true }, rollFirstPlayer: false });
      expect(Object.values(state.adventure!.tiles).some(tile =>
        allTileDefinitions[tile.tileDefId]?.group === "center" &&
        allTileDefinitions[tile.tileDefId]?.fields.some(f => f.location === "dragon_utopia"))).toBe(true);
    }
  });

  it("Dragon Conqueror wins when real END_TURN actions bring play back to the holder", () => {
    let state = createAdventureGameState({ seed: "dragon-hold-real-turns", rollFirstPlayer: false,
      victoryMode: "dragon-conqueror", dragonUtopiaGuards: "two-azure-two-gold",
      customMap: [...starts, centers[0]], customMapPreset: { objectives: { hiddenGrailUtopia: true } } });
    for (const tile of Object.values(state.adventure!.tiles)) {
      if (tile.faceDown) { tile.faceDown = false; materializeTileFields(state.adventure!, tile); }
    }
    const field = Object.values(state.adventure!.fields).find(f => f.location === "dragon_utopia")!;
    const hero = getMainHero(state, "p1")!; hero.spaceId = field.spaceId;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    expect(state.adventure!.winnerPlayerId).toBeNull();
    pumpAdventureQueues(state);
    for (let step = 0; state.pendingChoice && step < 20; step++) {
      const choice = state.pendingChoice;
      if (choice.type === "OPTION_CHOICE") {
        state = ok(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
      } else if (choice.type === "DECK_SEARCH") {
        state = ok(state, { type: "RESOLVE_DECK_SEARCH", playerId: "p1", choiceId: choice.id,
          pick: { kind: "revealed", index: 0 } });
      } else break;
    }
    expect(state.pendingChoice).toBeNull();
    for (const player of Object.values(state.players)) {
      player.canMulligan = false; player.needsHandRefresh = false;
    }
    state = ok(state, { type: "END_TURN", playerId: "p1" });
    expect(state.adventure!.winnerPlayerId).toBeNull();
    state = ok(state, { type: "END_TURN", playerId: "p2" });
    expect(state.adventure!.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
  });
});
