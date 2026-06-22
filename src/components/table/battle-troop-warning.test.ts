import { describe, expect, it } from "vitest";
import { canBuyTroopsNow, moveIntoBattleWithTroopsToBuy } from "./utils";
import { createAdventureGameState, createInitialGameState, getAdjacentSpaceIds } from "@/engine";
import type { GameAction, GameState, LegalAction, MapSpaceId } from "@/engine";

/**
 * The map UI pops a "you can still buy troops — keep moving into battle, or stop
 * and recruit?" confirmation exactly when moveIntoBattleWithTroopsToBuy is true:
 * a hero move BY the seated active player onto a field that starts a Combat,
 * while at least one recruit/reinforce is on offer. It must stay silent for a
 * move into open ground, off-turn, in combat, or when no troops can be bought —
 * so the prompt never blocks the wrong thing and never goes missing.
 */

function mapTurn(): GameState {
  const state = createAdventureGameState({ seed: "battle-troop", difficulty: "normal", rollFirstPlayer: false });
  // The mandatory start-of-turn draw isn't under test here — treat it as taken.
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  return state;
}

/** An adjacent field to p1's hero, turned into undefeated neutral guards. */
function guardedNeighbor(state: GameState): MapSpaceId {
  const hero = state.heroes.hero_p1;
  const here = hero.spaceId as MapSpaceId;
  const neighbor = getAdjacentSpaceIds(here).find((id) => state.adventure?.fields[id]);
  if (!neighbor) {
    throw new Error("no adjacent field to guard");
  }
  const field = state.adventure!.fields[neighbor]!;
  field.difficulty = 2;
  field.blackCube = false;
  field.everFlagged = false;
  field.flagOwnerId = null;
  return neighbor;
}

const recruitLegal: LegalAction[] = [
  {
    label: "Recruit few Pikemen",
    action: { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: "castle.pikemen" }] }
  }
];

describe("moveIntoBattleWithTroopsToBuy — when the pre-battle troop confirm pops", () => {
  it("fires for a MOVE_HERO into a guarded field while a recruit is on offer", () => {
    const state = mapTurn();
    const to = guardedNeighbor(state);
    const move: GameAction = { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to };
    expect(moveIntoBattleWithTroopsToBuy(state, "p1", move, recruitLegal)).toBe(true);
  });

  it("fires for a MOVE_HERO_PATH whose FINAL field starts the battle", () => {
    const state = mapTurn();
    const to = guardedNeighbor(state);
    const move: GameAction = { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [to] };
    expect(moveIntoBattleWithTroopsToBuy(state, "p1", move, recruitLegal)).toBe(true);
  });

  it("does NOT fire when no troops can be bought (no recruit/reinforce on offer)", () => {
    const state = mapTurn();
    const to = guardedNeighbor(state);
    const move: GameAction = { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to };
    expect(moveIntoBattleWithTroopsToBuy(state, "p1", move, [])).toBe(false);
  });

  it("does NOT fire for a move into open ground (no battle starts there)", () => {
    const state = mapTurn();
    const here = state.heroes.hero_p1.spaceId as MapSpaceId;
    // An adjacent field left as-is (no guards, no enemy hero) does not start a fight.
    const open = getAdjacentSpaceIds(here).find(
      (id) => state.adventure?.fields[id] && !state.adventure.fields[id]!.difficulty
    )!;
    const move: GameAction = { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: open };
    expect(moveIntoBattleWithTroopsToBuy(state, "p1", move, recruitLegal)).toBe(false);
  });

  it("does NOT fire off-turn (someone else is the active player)", () => {
    const state = mapTurn();
    const to = guardedNeighbor(state);
    state.activePlayerId = "p2";
    const move: GameAction = { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to };
    expect(moveIntoBattleWithTroopsToBuy(state, "p1", move, recruitLegal)).toBe(false);
  });

  it("does NOT fire in combat (the warning is a map-only step)", () => {
    const combat = createInitialGameState("battle-troop-combat");
    combat.activePlayerId = "p1";
    expect(combat.combat, "the fixture should be in combat").toBeTruthy();
    const move: GameAction = { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:0:0" };
    expect(moveIntoBattleWithTroopsToBuy(combat, "p1", move, recruitLegal)).toBe(false);
  });

  it("does NOT fire for a non-move action (card play / cast)", () => {
    const state = mapTurn();
    const play: GameAction = { type: "PLAY_CARD", playerId: "p1", cardId: "spell.town_portal", target: { type: "none" } };
    expect(moveIntoBattleWithTroopsToBuy(state, "p1", play, recruitLegal)).toBe(false);
  });
});

describe("canBuyTroopsNow", () => {
  it("is true when a recruit or reinforce POPULATION_ACTION is offered to the player", () => {
    expect(canBuyTroopsNow(recruitLegal, "p1")).toBe(true);
    const reinforce: LegalAction[] = [
      {
        label: "Reinforce",
        action: {
          type: "POPULATION_ACTION",
          playerId: "p1",
          purchases: [{ kind: "reinforce", unitDefId: "castle.pikemen", armyUnitId: "u1" }]
        }
      }
    ];
    expect(canBuyTroopsNow(reinforce, "p1")).toBe(true);
  });

  it("is false when no recruit is offered, or it belongs to another player", () => {
    expect(canBuyTroopsNow([], "p1")).toBe(false);
    expect(canBuyTroopsNow(recruitLegal, "p2")).toBe(false);
  });
});
