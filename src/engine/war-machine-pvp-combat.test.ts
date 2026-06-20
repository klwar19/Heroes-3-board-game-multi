import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * War machines are NOT a sandbox-only toy: their round-start fire is driven by
 * startWarMachineRound, which scans the permanents of BOTH the attacker and the
 * defender regardless of combat context. These tests put the engine into a real
 * player-vs-player ("player") combat — the multiplayer PvP battle — and prove a
 * Ballista fires for whichever side owns one, including both sides at once.
 *
 * Every assertion fails if the war-machine wiring is removed (CLAUDE.md #1).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Re-skins the sandbox combat as a real PvP (`player`-context) battle. */
function pvpCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: "field_center"
  };
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

/** Make `unitId` (owned by `owner`) the uniquely slowest, tanky enough to read. */
function singleSlowest(state: GameState, owner: "p1" | "p2", unitId: string): void {
  const units = state.combat!.units;
  let next = 8;
  for (const id of Object.keys(units)) {
    if (units[id].controllerId === owner) {
      units[id].initiative = id === unitId ? 1 : next--;
    }
  }
  units[unitId].maxHealth = 12;
  units[unitId].damage = 0;
}

/** END_COMBAT_ROUND with the active unit cleared so the war-machine round fires. */
function endRound(state: GameState, playerId: "p1" | "p2"): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

describe("war machines in PvP (player-context) combat", () => {
  it("the attacker's Ballista fires at the defender's slowest unit", () => {
    const state = pvpCombat("pvp-attacker-ballista");
    state.players.p1.permanents = ["war_machine.ballista"];
    singleSlowest(state, "p2", "unit_p2_dread_knights");

    const fired = endRound(state, "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
  });

  it("the defender's Ballista fires too — it is not attacker-only", () => {
    const state = pvpCombat("pvp-defender-ballista");
    state.players.p2.permanents = ["war_machine.ballista"];
    singleSlowest(state, "p1", "unit_p1_crusaders");

    const fired = endRound(state, "p1");
    expect(fired.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });

  it("both sides' Ballistas fire in the same round, each at the other's slowest", () => {
    const state = pvpCombat("pvp-both-ballistas");
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.permanents = ["war_machine.ballista"];
    singleSlowest(state, "p2", "unit_p2_dread_knights");
    singleSlowest(state, "p1", "unit_p1_crusaders");

    const fired = endRound(state, "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(fired.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });

  it("a war-machine card in hand is offered as a real play during PvP combat", () => {
    const state = pvpCombat("pvp-play-from-hand");
    // p1's griffins are the active unit in the freshly-built combat.
    state.players.p1.hand = ["war_machine.first_aid_tent"];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "war_machine.first_aid_tent"
    );
    expect(play, "the Tent should be playable into play during the owner's activation").toBeTruthy();

    const next = applyOk(state, play!.action);
    expect(next.players.p1.permanents).toContain("war_machine.first_aid_tent");
  });
});
