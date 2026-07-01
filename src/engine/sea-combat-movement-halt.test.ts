/**
 * ============================================================================
 *  Fighting on the open sea ends a hero's movement for the turn.
 * ============================================================================
 *
 * The coastline already halts a hero that wades across it (seaStepHalts /
 * map-movement-spells.test.ts). This pins the companion rule for the OTHER way a
 * hero ends up fighting at sea: it began the turn already afloat and sailed
 * (sea→sea, which does NOT halt) into a guarded sea hex. After winning that
 * battle it must not be able to keep sailing — exactly like wading would have
 * stopped it. A battle fought on LAND is the control: there the hero keeps any
 * movement points it has left.
 *
 * Tests assert the OBSERVABLE effect — whether the engine still offers the hero
 * any click-to-move target (getReachableHeroPaths) — not just the internal flag.
 */
import { describe, expect, it } from "vitest";
import { coreFactionDefinitions } from "@/data/factions/core";
import { createAdventureGameState } from "./index";
import {
  getMainHero,
  getReachableHeroPaths,
  getAdjacentSpaceIds,
  isSeaField,
  materializeTileFields
} from "./adventure";
import { finalizeAdventureCombat } from "./adventure-reducer";
import type { CombatState, GameState, HeroState, MapTileState } from "./state";

/** A real sea map with every tile flipped face-up so its terrain is materialized. */
function seaMap(): GameState {
  const players = ["castle", "cove"].map((f, i) => ({
    id: `p${i + 1}`,
    name: f,
    factionId: f as never,
    heroDefId: coreFactionDefinitions[f].heroes[0]
  }));
  const state = createAdventureGameState({
    seed: "sea-combat-halt",
    scenarioId: "sea-2p",
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: false,
    players
  });
  const adv = state.adventure!;
  for (const tile of Object.values(adv.tiles) as MapTileState[]) {
    if (tile.faceDown) {
      tile.faceDown = false;
      materializeTileFields(adv, tile);
    }
  }
  return state;
}

/** A field that the hero can stand on AND step off (≥1 same-terrain neighbour). */
function fieldWithNeighbour(state: GameState, water: boolean): string {
  const adv = state.adventure!;
  for (const id of Object.keys(adv.fields)) {
    if (isSeaField(state, id) !== water) {
      continue;
    }
    const hasMatchingNeighbour = getAdjacentSpaceIds(id).some(
      (nb) => adv.fields[nb] && isSeaField(state, nb) === water && !adv.fields[nb].difficulty
    );
    if (hasMatchingNeighbour) {
      return id;
    }
  }
  throw new Error(`no ${water ? "sea" : "land"} field with a same-terrain neighbour`);
}

/** Park p1's main hero on `fieldId` with movement to spare and not yet halted. */
function parkHero(state: GameState, fieldId: string): HeroState {
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = fieldId;
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
  state.activePlayerId = "p1";
  return hero;
}

/** Stage a just-won neutral combat on `fieldId`, ready for finalizeAdventureCombat. */
function stageWin(state: GameState, hero: HeroState, fieldId: string): void {
  state.combat = {
    context: { kind: "neutral", heroId: hero.id, fieldId, difficulty: 1, hasAzure: false },
    outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
    units: {}
  } as unknown as CombatState;
}

describe("fighting on the open sea ends the hero's movement", () => {
  it("a hero that sailed in and won a sea battle can no longer move (despite points left)", () => {
    const state = seaMap();
    const seaField = fieldWithNeighbour(state, true);
    const hero = parkHero(state, seaField);

    // Baseline: afloat with points, the hero CAN sail on (targets exist).
    expect(isSeaField(state, seaField)).toBe(true);
    expect(getReachableHeroPaths(state, hero).size).toBeGreaterThan(0);

    stageWin(state, hero, seaField);
    finalizeAdventureCombat(state);

    const after = state.heroes[hero.id];
    // It still has movement points — but the sea battle ended its move.
    expect(after.movementPoints).toBeGreaterThan(0);
    expect(after.movementHaltedThisTurn).toBe(true);
    // The OBSERVABLE effect: the engine offers no click-to-move target at all.
    expect(getReachableHeroPaths(state, after).size).toBe(0);
  });

  it("CONTROL: a hero that won the same battle on LAND keeps moving", () => {
    const state = seaMap();
    const landField = fieldWithNeighbour(state, false);
    const hero = parkHero(state, landField);

    expect(isSeaField(state, landField)).toBe(false);
    expect(getReachableHeroPaths(state, hero).size).toBeGreaterThan(0);

    stageWin(state, hero, landField);
    finalizeAdventureCombat(state);

    const after = state.heroes[hero.id];
    // No sea halt on land: it keeps its points AND can still move.
    expect(after.movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });

  it("a Water Walking hero is NOT halted by a sea battle (the sea is normal terrain)", () => {
    const state = seaMap();
    const seaField = fieldWithNeighbour(state, true);
    const hero = parkHero(state, seaField);

    // Water Walk active for p1 (the Spell / expert Pathfinding grant).
    state.activeEffects.push({
      id: "ww-test",
      source: { type: "card", cardId: "spell.water_walk", controllerId: "p1" },
      controllerId: "p1",
      startedRound: state.round,
      duration: { type: "current-turn" },
      polarity: "positive",
      modifiers: [{ type: "HERO_WATER_WALK" }]
    } as unknown as GameState["activeEffects"][number]);

    stageWin(state, hero, seaField);
    finalizeAdventureCombat(state);

    const after = state.heroes[hero.id];
    // Water Walk removes the sea-battle halt exactly as it removes the wading halt.
    expect(after.movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });
});

/** Stage a finished PvP fight on `fieldId`, attacker p1 the winner. */
function stagePvpWin(state: GameState, fieldId: string): { attacker: HeroState } {
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  attacker.spaceId = fieldId;
  defender.spaceId = fieldId;
  attacker.movementPoints = 3;
  attacker.movementHaltedThisTurn = false;
  state.activePlayerId = "p1";
  state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];
  state.combat = {
    id: "c1",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId },
    setup: null,
    outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
    units: {}
  } as unknown as CombatState;
  return { attacker };
}

describe("winning a PvP fight on the open sea also ends the attacker's movement", () => {
  it("the attacker who took a sea hex cannot sail on", () => {
    const state = seaMap();
    const seaField = fieldWithNeighbour(state, true);
    const { attacker } = stagePvpWin(state, seaField);
    expect(getReachableHeroPaths(state, attacker).size).toBeGreaterThan(0);

    finalizeAdventureCombat(state);

    const after = state.heroes[attacker.id];
    expect(after.movementHaltedThisTurn).toBe(true);
    expect(getReachableHeroPaths(state, after).size).toBe(0);
  });

  it("CONTROL: winning the same PvP fight on LAND leaves the attacker free to move", () => {
    const state = seaMap();
    const landField = fieldWithNeighbour(state, false);
    const { attacker } = stagePvpWin(state, landField);

    finalizeAdventureCombat(state);

    const after = state.heroes[attacker.id];
    expect(after.movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });
});
