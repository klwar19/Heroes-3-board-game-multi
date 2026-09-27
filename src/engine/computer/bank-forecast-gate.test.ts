import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit } from "../adventure";
import type { FactionId, GameState, MapFieldState } from "../state";
import { BANK_ENGAGE_RATIO, bankFightRounds, creatureBankMatchupRatio } from "./army-strength";
import { forecastCreatureBankField } from "./fight-forecast";

// Lab 2026-09-27: in-reach banks the simulated fight called >= 90% were never
// fought because the stat-sum ratio sat under 0.85 and the forecast was not
// consulted (ranked humans take 2.25 banks by R7, the AI took 0.61). The
// forecast now decides whenever it can run.

function towerAt(bankId: string, army: Array<[string, "few" | "pack"]>, factionId: FactionId = "tower", heroDefId = "solmyr"): { state: GameState; field: MapFieldState } {
  const state = createAdventureGameState({
    seed: "bank-gate", difficulty: "impossible", events: false, rollFirstPlayer: false,
    players: [{ id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" }, { id: "p2", name: "P2", factionId, heroDefId }],
  });
  state.round = 4;
  const player = state.players.p2;
  player.army = [];
  player.hand = [];
  for (const [unitDefId, side] of army) addArmyUnit(player, unitDefId, side);
  const field = Object.values(state.adventure!.fields).find(candidate => candidate.location === "empty_field")!;
  Object.assign(field, { location: "creature_bank", bankId, blackCube: false, flagOwnerId: null, everFlagged: false, difficulty: undefined });
  return { state, field };
}

describe("creature bank gate: the simulated fight decides", () => {
  it("promotes a resource bank the forecast calls a near-certain cheap win, whatever the stat-sum ratio", () => {
    const { state, field } = towerAt("crypt", [["tower.gremlins", "pack"], ["tower.gargoyles", "pack"], ["tower.iron_golems", "pack"]]);
    const forecast = forecastCreatureBankField(state, "p2", field, bankFightRounds(state, "p2"))!;
    expect(forecast.winChance).toBeGreaterThanOrEqual(0.9);
    expect(forecast.expectedOwnLosses).toBeLessThanOrEqual(0.5);
    expect(creatureBankMatchupRatio(state, "p2", field)).toBeGreaterThanOrEqual(1.2);
  });

  it("a unit-reward bank keeps the stat-sum pre-gate (Dragon Fly Hive detours cost the level-7)", () => {
    const { state, field } = towerAt("dragon_fly_hive",
      [["inferno.familiars", "pack"], ["inferno.magogs", "few"], ["inferno.cerberi", "pack"], ["inferno.pit_lords", "few"]], "inferno", "xyron");
    const forecast = forecastCreatureBankField(state, "p2", field, bankFightRounds(state, "p2"))!;
    expect(forecast.winChance).toBeGreaterThanOrEqual(0.75);
    expect(creatureBankMatchupRatio(state, "p2", field)).toBeLessThan(BANK_ENGAGE_RATIO);
  });

  it("CONTROL: a bank the forecast calls a likely loss stays vetoed", () => {
    const { state, field } = towerAt("crypt", [["tower.gremlins", "few"]]);
    const forecast = forecastCreatureBankField(state, "p2", field, bankFightRounds(state, "p2"))!;
    expect(forecast.winChance).toBeLessThan(0.75);
    expect(creatureBankMatchupRatio(state, "p2", field)).toBeLessThan(BANK_ENGAGE_RATIO);
  });
});
