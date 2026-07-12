/**
 * ============================================================================
 *  Winning a battle at sea does NOT end a hero's movement (BINH house rule).
 * ============================================================================
 *
 * House rule (user spec): "sea to sea battle has no effect" on movement — a hero
 * that was already afloat and sailed (sea→sea, which does NOT halt) into a
 * guarded sea hex keeps its remaining movement and can sail on after winning,
 * exactly like a hero that wins a battle on LAND.
 *
 * The COASTLINE (wading) halt is a SEPARATE rule that still stands: "land to sea,
 * fight, still can use remaining move points but halt; sea to land same." A hero
 * that WADED onto the guarded hex is halted by that land↔sea STEP itself
 * (haltAfterSeaStep, set during the move) — not by the fight — so it keeps its
 * points but cannot move further. Only the extra post-sea-combat halt is dropped;
 * the wading halt is untouched (pinned in map-movement-spells.test.ts and by the
 * "waded in" case below).
 *
 * Tests assert the OBSERVABLE effect — whether the engine still offers the hero
 * any click-to-move target (getReachableHeroPaths) — not just the internal flag.
 * Reverting the fix (re-halting after a sea combat) fails the sea-win cases.
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

describe("winning a battle at sea does NOT end the hero's movement (sea→sea has no effect)", () => {
  it("a hero that sailed in and won a sea battle CAN keep sailing (points remain)", () => {
    const state = seaMap();
    const seaField = fieldWithNeighbour(state, true);
    const hero = parkHero(state, seaField);

    // Baseline: afloat with points, the hero CAN sail on (targets exist).
    expect(isSeaField(state, seaField)).toBe(true);
    expect(getReachableHeroPaths(state, hero).size).toBeGreaterThan(0);

    stageWin(state, hero, seaField);
    finalizeAdventureCombat(state);

    const after = state.heroes[hero.id];
    // It keeps its movement points AND is NOT halted — the sea battle had no
    // effect on movement (this fails if the sea-combat halt is re-added).
    expect(after.movementPoints).toBeGreaterThan(0);
    expect(after.movementHaltedThisTurn).toBeFalsy();
    // The OBSERVABLE effect: the engine still offers click-to-move targets.
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });

  it("winning the same battle on LAND likewise leaves the hero free to move", () => {
    const state = seaMap();
    const landField = fieldWithNeighbour(state, false);
    const hero = parkHero(state, landField);

    expect(isSeaField(state, landField)).toBe(false);
    expect(getReachableHeroPaths(state, hero).size).toBeGreaterThan(0);

    stageWin(state, hero, landField);
    finalizeAdventureCombat(state);

    const after = state.heroes[hero.id];
    expect(after.movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });

  it("COASTLINE control: a hero that WADED in stays halted through the fight (keeps points)", () => {
    // "land to sea, fight, still can use remaining move points but halt." The
    // wading STEP (land→sea) sets movementHaltedThisTurn during the move, before
    // the combat; winning does not clear it. So the hero keeps its points but is
    // still halted — the coastline rule is intact independent of the sea-combat
    // halt removal.
    const state = seaMap();
    const seaField = fieldWithNeighbour(state, true);
    const hero = parkHero(state, seaField);
    // Simulate that the hero got here by wading (the move already halted it).
    hero.movementHaltedThisTurn = true;

    stageWin(state, hero, seaField);
    finalizeAdventureCombat(state);

    const after = state.heroes[hero.id];
    // Points remain, but the wading halt still stops further movement.
    expect(after.movementPoints).toBeGreaterThan(0);
    expect(after.movementHaltedThisTurn).toBe(true);
    expect(getReachableHeroPaths(state, after).size).toBe(0);
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

describe("winning a PvP fight at sea also does NOT end the attacker's movement", () => {
  it("the attacker who took a sea hex by sailing in CAN sail on", () => {
    const state = seaMap();
    const seaField = fieldWithNeighbour(state, true);
    const { attacker } = stagePvpWin(state, seaField);
    expect(getReachableHeroPaths(state, attacker).size).toBeGreaterThan(0);

    finalizeAdventureCombat(state);

    const after = state.heroes[attacker.id];
    // Not halted by the sea combat (fails if the sea-combat halt is re-added).
    expect(after.movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });

  it("winning the same PvP fight on LAND likewise leaves the attacker free to move", () => {
    const state = seaMap();
    const landField = fieldWithNeighbour(state, false);
    const { attacker } = stagePvpWin(state, landField);

    finalizeAdventureCombat(state);

    const after = state.heroes[attacker.id];
    expect(after.movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, after).size).toBeGreaterThan(0);
  });
});
