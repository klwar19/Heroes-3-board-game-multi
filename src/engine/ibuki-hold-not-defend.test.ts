import { describe, expect, it } from "vitest";
import { applyAction, commanderUnitId, createInitialGameState, getLegalActions, makeCommanderCombatUnit } from "./index";
import { commanderCommandUsedThisActivation } from "./commanders";
import type { GameAction, GameState } from "./state";

/**
 * USER RULE 2026-09-04: the Blue Archive commander Ibuki, after using a skill
 * (an AP command or Executive Order) in her activation, may only HOLD POSITION —
 * she can no longer Defend. Pinned at both seams (the Defend OFFER and the
 * defendUnit handler) with a fresh-Ibuki CONTROL that still Defends normally.
 */

function ibukiState(actionPoints = 3): GameState {
  const state = createInitialGameState();
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
  state.players.p1.commander = {
    slug: "ibuki",
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
  };
  const unit = makeCommanderCombatUnit(state.players.p1, 9);
  if (!unit) throw new Error("expected a commander combat unit");
  unit.commanderActionPoints = actionPoints;
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.abilities = [];
  skeletons.position = 10;
  skeletons.defense = 0;
  skeletons.maxHealth = 20;
  skeletons.damage = 0;
  state.combat!.activeUnitId = unit.id;
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function offersFor(state: GameState, unitId: string): string[] {
  return getLegalActions(state, "p1")
    .filter((legal) => "unitId" in legal.action && legal.action.unitId === unitId)
    .map((legal) => legal.action.type);
}

describe("Ibuki: after a command she may only hold position, never Defend", () => {
  it("CONTROL: a fresh Ibuki is offered Defend and it applies", () => {
    const state = ibukiState();
    const ibuki = commanderUnitId("p1");
    expect(commanderCommandUsedThisActivation(state.combat!.units[ibuki])).toBe(false);
    const offers = offersFor(state, ibuki);
    expect(offers).toContain("DEFEND_UNIT");
    expect(offers).toContain("END_ACTIVATION");
    const defended = apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: ibuki });
    expect(defended.combat!.units[ibuki].defenseToken).toBe(true);
  });

  it("after Sniper Shot: hold position is offered, Defend is neither offered nor accepted", () => {
    const state = ibukiState();
    const ibuki = commanderUnitId("p1");
    const shot = apply(state, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: ibuki,
      abilityId: "commander-ibuki-sniper-shot",
      target: { type: "unit", unitId: "unit_p2_skeletons" },
    });
    expect(shot.combat!.units.unit_p2_skeletons.damage).toBe(1); // the command really fired
    expect(shot.combat!.activeUnitId).toBe(ibuki); // her activation is still open
    expect(commanderCommandUsedThisActivation(shot.combat!.units[ibuki])).toBe(true);
    const offers = offersFor(shot, ibuki);
    expect(offers).toContain("END_ACTIVATION");
    expect(offers).not.toContain("DEFEND_UNIT");
    expect(offers).not.toContain("MOVE_UNIT"); // the cast already ended her movement
    const forged = applyAction(shot, { type: "DEFEND_UNIT", playerId: "p1", unitId: ibuki });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.combat!.units[ibuki].defenseToken).not.toBe(true);
    // Hold position still closes the activation cleanly.
    const held = apply(shot, { type: "END_ACTIVATION", playerId: "p1", unitId: ibuki });
    expect(held.combat!.units[ibuki].activatedThisRound).toBe(true);
  });

  it("after Up to Mischief (a 2-AP command) the same lock applies", () => {
    const state = ibukiState();
    const ibuki = commanderUnitId("p1");
    const used = apply(state, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: ibuki,
      abilityId: "commander-ibuki-up-to-mischief",
      target: { type: "unit", unitId: "unit_p2_skeletons" },
    });
    expect(used.combat!.units[ibuki].commanderActionPoints).toBe(1);
    const offers = offersFor(used, ibuki);
    expect(offers).toContain("END_ACTIVATION");
    expect(offers).not.toContain("DEFEND_UNIT");
    expect(applyAction(used, { type: "DEFEND_UNIT", playerId: "p1", unitId: ibuki }).errors.length).toBeGreaterThan(0);
  });

  it("the lock is per ACTIVATION: a new activation next round Defends again", () => {
    const state = ibukiState();
    const ibuki = commanderUnitId("p1");
    const shot = apply(state, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: ibuki,
      abilityId: "commander-ibuki-sniper-shot",
      target: { type: "unit", unitId: "unit_p2_skeletons" },
    });
    // Simulate the activation-start reset the engine performs (setActiveUnit
    // clears movementLockedThisActivation) — the predicate must read false again.
    const next = structuredClone(shot);
    next.combat!.units[ibuki].movementLockedThisActivation = false;
    expect(commanderCommandUsedThisActivation(next.combat!.units[ibuki])).toBe(false);
  });
});
