import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, makeCommanderCombatUnit, markUnitRemovedIfNeeded } from "./index";
import { sonyaBondDefenseBonus } from "./commanders";
import type { CombatUnitState, GameState } from "./state";

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
const ZERO_GRADES = { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 } as const;

function sonyaSandbox(): { state: GameState; bonded: CombatUnitState; sonya: CombatUnitState } {
  const state = createInitialGameState();
  state.wog = { ...WOG_ON };
  const bonded = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
  bonded.armyUnitId = "army_bonded";
  bonded.variant = "few";
  bonded.abilities = [];
  bonded.armyStacks = 0;
  bonded.stackToken = null;
  state.players.p1.commander = {
    slug: "sonya",
    grades: { ...ZERO_GRADES },
    bondedArmyUnitId: bonded.armyUnitId
  };
  const sonya = makeCommanderCombatUnit(state.players.p1, 5)!;
  state.combat!.units[sonya.id] = sonya;
  return { state, bonded, sonya };
}

describe("MGQ — Sonya's Unbreakable Bond", () => {
  it("persists a chosen own army-card instance through the real action", () => {
    const state = createAdventureGameState({
      seed: "mgq-sonya-bond",
      ruleset: "binh",
      wog: WOG_ON,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "One", factionId: "mgq", heroDefId: "luka" },
        { id: "p2", name: "Two", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const target = state.players.p1.army[0];
    expect(target).toBeTruthy();
    state.pendingChoice = null;
    state.players.p1.mgqGoldContracts = ["mgq.carmilla", "mgq.giga"];
    state.players.p1.mgqGoldContractSetupRequired = false;
    const result = applyAction(state, { type: "COMMANDER_SET_BOND", playerId: "p1", armyUnitId: target.id });
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.commander?.bondedArmyUnitId).toBe(target.id);
    expect(result.state.eventLog.some((event) => event.type === "COMMANDER_BOND_SET")).toBe(true);
  });

  it("adds +1 Defense only in round 1 while Sonya is alive, independent of printed Defense", () => {
    const { state, bonded, sonya } = sonyaSandbox();
    bonded.defense = 1;
    expect(sonyaBondDefenseBonus(state, bonded)).toBe(1);
    state.combat!.round = 2;
    expect(sonyaBondDefenseBonus(state, bonded)).toBe(0);
    expect(bonded.defense).toBe(1);
    state.combat!.round = 1;
    sonya.damage = sonya.maxHealth;
    expect(sonyaBondDefenseBonus(state, bonded)).toBe(0);
  });

  it("redirects exactly the first lethal state, damages Sonya, and then expires", () => {
    const { state, bonded, sonya } = sonyaSandbox();
    bonded.damage = bonded.maxHealth + 4;
    markUnitRemovedIfNeeded(state, bonded);

    expect(bonded.damage).toBe(bonded.maxHealth - 1);
    expect(sonya.damage).toBe(1);
    expect(state.combat?.sonyaBondRedirectUsedBy).toEqual(["p1"]);
    expect(
      state.eventLog.filter(
        (event) => event.type === "COMMANDER_SPECIALTY_TRIGGERED" && event.specialtyId === "unbreakable-bond"
      )
    ).toHaveLength(1);

    bonded.damage = bonded.maxHealth;
    markUnitRemovedIfNeeded(state, bonded);
    expect(bonded.damage).toBeGreaterThanOrEqual(bonded.maxHealth);
    expect(sonya.damage).toBe(1);
    expect(state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === bonded.id)).toBe(true);
  });

  it("does not redirect when a different card is bonded or Sonya has fallen", () => {
    const first = sonyaSandbox();
    first.state.players.p1.commander!.bondedArmyUnitId = "some_other_card";
    first.bonded.damage = first.bonded.maxHealth;
    markUnitRemovedIfNeeded(first.state, first.bonded);
    expect(first.sonya.damage).toBe(0);

    const second = sonyaSandbox();
    second.sonya.damage = second.sonya.maxHealth;
    second.bonded.damage = second.bonded.maxHealth;
    markUnitRemovedIfNeeded(second.state, second.bonded);
    expect(second.state.combat?.sonyaBondRedirectUsedBy).toBeUndefined();
  });
});
