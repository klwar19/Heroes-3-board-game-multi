import { describe, expect, it } from "vitest";
import type { CombatUnitState, GameAction, LegalAction, PlayerVisibleState } from "../state";
import { refinePvpCombatSpellRound } from "./decision-planning";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";

function unit(id: string, overrides: Partial<CombatUnitState>): CombatUnitState {
  return {
    id, name: id, cardName: id, controllerId: "p1", variant: "few",
    grade: "gold", type: "ground", attack: 5, defense: 3,
    maxHealth: 9, damage: 0, initiative: 6, position: 12,
    activatedThisRound: false, movedThisActivation: false,
    retaliatedThisRound: false, defenseToken: false, abilities: [],
    ...overrides,
  } as CombatUnitState;
}

function setup(units: CombatUnitState[], actions: GameAction[], activeUnitId = "ALLY",
  hand = ["spell.magic_arrow"]): ComputerObservation {
  const combat = {
    id: "arrow-plan", round: 1, context: { kind: "player" }, activeUnitId,
    units: Object.fromEntries(units.map(entry => [entry.id, entry])),
  } as unknown as PlayerVisibleState["combat"];
  const state = {
    seed: "arrow-plan", round: 1, eventCounter: 0, combat,
    activeEffects: [], stack: [],
    players: { p2: {
      id: "p2", hand, resources: { gold: 0, buildingMaterials: 0, valuables: 0 },
      army: [], limits: { expertUses: 0 }, combatStats: {
        spellsCastThisRound: 0, spellLimitBonusThisRound: 0, commanderManaCharges: 0,
      },
    } },
  } as unknown as PlayerVisibleState;
  return { playerId: "p2", state, legalActions: actions.map(action => ({ action, label: action.type })) };
}

function arrow(unitId: string): GameAction {
  return damageSpell("spell.magic_arrow", unitId);
}

function damageSpell(cardId: string, unitId: string): GameAction {
  return { type: "CAST_SPELL", playerId: "p2", cardId,
    target: { type: "unit", unitId } } as GameAction;
}

function ranked(observation: ComputerObservation, scores: number[]) {
  return observation.legalActions.map((legal: LegalAction, index) =>
    ({ legal, score: scores[index], policy: "control", tie: 0 }));
}

describe("PvP combat spell round plan", () => {
  it("casts before the active unit's reachable move-and-attack when both hits are needed", () => {
    const ally = unit("ALLY", { controllerId: "p2", type: "flying", attack: 3,
      defense: 3, maxHealth: 6, position: 8, initiative: 9 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      attack: 5, defense: 1, maxHealth: 5, damage: 2, position: 9, initiative: 8 });
    const dread = unit("DREAD", { unitDefId: "factory.dreadnoughts", position: 12 });
    const attack = { type: "MOVE_AND_ATTACK_UNIT", playerId: "p2", attackerId: "ALLY",
      defenderId: "SHOOTER", destination: 10 } as GameAction;
    const observed = setup([ally, shooter, dread], [arrow("SHOOTER"), arrow("DREAD"), attack]);
    const choices = ranked(observed, [780, 740, 620]);
    // CONTROL: the old one-action ranking picked a cast target without proving
    // that its follow-up move-and-attack could remove the shooter.
    expect(choices.reduce((best, entry) => entry.score > best.score ? entry : best).legal.action.type).toBe("CAST_SPELL");
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[0].policy).toBe("plan.damage-spell-before-move-attack");
    expect(choices[0].score).toBeGreaterThan(choices[2].score);
    expect(choices[0].score).toBeGreaterThan(choices[1].score);
    const chosen = chooseComputerAction(observed)?.action;
    expect(chosen?.type).toBe("CAST_SPELL");
    if (chosen?.type === "CAST_SPELL") expect(chosen.target).toEqual({ type: "unit", unitId: "SHOOTER" });
    // After Arrow resolves, the move-and-attack finishes the shooter.
    const afterCast = setup([ally, { ...shooter, damage: 3 }, dread], [attack]);
    expect(chooseComputerAction(afterCast)?.action.type).toBe("MOVE_AND_ATTACK_UNIT");
  });

  it("may attack first only when a later friendly pre-move cast window beats the shooter", () => {
    const ally = unit("ALLY", { controllerId: "p2", type: "flying", attack: 3,
      defense: 3, maxHealth: 6, position: 8, initiative: 9 });
    const later = unit("LATER", { controllerId: "p2", attack: 2, defense: 3,
      position: 13, initiative: 10 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      attack: 5, defense: 1, maxHealth: 5, damage: 1, position: 9, initiative: 8 });
    const attack = { type: "ATTACK_UNIT", playerId: "p2", attackerId: "ALLY",
      defenderId: "SHOOTER" } as GameAction;
    const observed = setup([ally, later, shooter], [arrow("SHOOTER"), attack]);
    const choices = ranked(observed, [780, 620]);
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[1].policy).toBe("plan.attack-then-later-cast");
    expect(choices[1].score).toBeGreaterThan(choices[0].score);
    expect(chooseComputerAction(observed)?.action.type).toBe("ATTACK_UNIT");
    const laterAttack = { type: "ATTACK_UNIT", playerId: "p2", attackerId: "LATER",
      defenderId: "SHOOTER" } as GameAction;
    const laterWindow = setup([
      { ...ally, activatedThisRound: true, attackedThisActivation: true },
      later, { ...shooter, damage: 3 },
    ], [arrow("SHOOTER"), laterAttack], "LATER");
    const laterChoices = ranked(laterWindow, [750, 620]);
    refinePvpCombatSpellRound(laterWindow, laterChoices);
    expect(laterChoices[0].policy).toBe("plan.damage-spell-before-move-attack");
    expect(chooseComputerAction(laterWindow)?.action.type).toBe("CAST_SPELL");
  });

  it("removes the gold shooter instead of chipping the three-Defense gold Dreadnought", () => {
    const ally = unit("ALLY", { controllerId: "p2", position: 8 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      defense: 1, maxHealth: 5, damage: 4, position: 9, initiative: 8 });
    const dread = unit("DREAD", { unitDefId: "factory.dreadnoughts", position: 12 });
    const observed = setup([ally, shooter, dread], [arrow("DREAD"), arrow("SHOOTER")]);
    const choices = ranked(observed, [790, 720]);
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[1].score).toBeGreaterThan(choices[0].score);
    expect(choices[1].policy).toBe("plan.damage-spell-remove-threat");
    const chosen = chooseComputerAction(observed)?.action;
    expect(chosen?.type).toBe("CAST_SPELL");
    if (chosen?.type === "CAST_SPELL") expect(chosen.target).toEqual({ type: "unit", unitId: "SHOOTER" });
  });

  it("casts a useful Arrow in the last window instead of holding it forever", () => {
    const ally = unit("ALLY", { controllerId: "p2", position: 8 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      defense: 1, maxHealth: 6, position: 12, initiative: 8 });
    const defend = { type: "DEFEND_UNIT", playerId: "p2", unitId: "ALLY" } as GameAction;
    const observed = setup([ally, shooter], [arrow("SHOOTER"), defend]);
    const choices = ranked(observed, [700, 500]);
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[0].policy).toBe("plan.damage-spell-last-window");
    expect(choices[0].score).toBeGreaterThan(choices[1].score);
    expect(chooseComputerAction(observed)?.action.type).toBe("CAST_SPELL");
  });

  it("plans Lightning Bolt before a reachable attack with the same pre-move timing", () => {
    const ally = unit("ALLY", { controllerId: "p2", attack: 2, defense: 3,
      maxHealth: 6, position: 8, initiative: 9 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      defense: 1, maxHealth: 5, damage: 2, position: 9, initiative: 8 });
    const dread = unit("DREAD", { unitDefId: "factory.dreadnoughts", position: 12 });
    const attack = { type: "ATTACK_UNIT", playerId: "p2", attackerId: "ALLY",
      defenderId: "SHOOTER" } as GameAction;
    const observed = setup([ally, shooter, dread],
      [damageSpell("spell.lightning_bolt", "DREAD"), damageSpell("spell.lightning_bolt", "SHOOTER"), attack],
      "ALLY", ["spell.lightning_bolt"]);
    const choices = ranked(observed, [790, 720, 620]);
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[1].policy).toBe("plan.damage-spell-before-move-attack");
    expect(choices[1].score).toBeGreaterThan(choices[0].score);
    const chosen = chooseComputerAction(observed)?.action;
    expect(chosen?.type).toBe("CAST_SPELL");
    if (chosen?.type === "CAST_SPELL") {
      expect(chosen.cardId).toBe("spell.lightning_bolt");
      expect(chosen.target).toEqual({ type: "unit", unitId: "SHOOTER" });
    }
  });

  it("plans an attack-triggered Bloodlust Instant in its reaction window", () => {
    const ally = unit("ALLY", { controllerId: "p2", attack: 3, defense: 3,
      maxHealth: 6, position: 8, initiative: 9 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      defense: 1, maxHealth: 5, damage: 2, position: 9, initiative: 8 });
    const dread = unit("DREAD", { unitDefId: "factory.dreadnoughts", position: 12 });
    const attack = { type: "ATTACK_UNIT", playerId: "p2", attackerId: "ALLY",
      defenderId: "SHOOTER" } as GameAction;
    const observed = setup([ally, shooter, dread],
      [damageSpell("spell.lightning_bolt", "DREAD"), attack],
      "ALLY", ["spell.lightning_bolt", "spell.bloodlust"]);
    const choices = ranked(observed, [790, 620]);
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[1].policy).toBe("plan.instant-spell-attack-removal");
    expect(choices[1].score).toBeGreaterThan(choices[0].score);
    expect(chooseComputerAction(observed)?.action.type).toBe("ATTACK_UNIT");
  });

  it("waits for the next pre-move Blind window, then denies the shooter's activation", () => {
    const ally = unit("ALLY", { controllerId: "p2", position: 8, initiative: 10 });
    const later = unit("LATER", { controllerId: "p2", position: 13, initiative: 9 });
    const shooter = unit("SHOOTER", { unitDefId: "factory.gunslingers", type: "ranged",
      maxHealth: 8, position: 20, initiative: 8 });
    const defend = { type: "DEFEND_UNIT", playerId: "p2", unitId: "ALLY" } as GameAction;
    const blind = damageSpell("spell.blind", "SHOOTER");
    const observed = setup([ally, later, shooter], [blind, defend], "ALLY", ["spell.blind"]);
    const choices = ranked(observed, [780, 500]);
    refinePvpCombatSpellRound(observed, choices);
    expect(choices[0].policy).toBe("plan.denial-spell-later-window");
    expect(choices[0].score).toBeLessThan(choices[1].score);
    const lastWindow = setup([
      { ...ally, activatedThisRound: true }, later, shooter,
    ], [blind, { type: "DEFEND_UNIT", playerId: "p2", unitId: "LATER" } as GameAction],
    "LATER", ["spell.blind"]);
    const lastChoices = ranked(lastWindow, [780, 500]);
    refinePvpCombatSpellRound(lastWindow, lastChoices);
    expect(lastChoices[0].policy).toBe("plan.denial-spell-before-enemy");
    expect(lastChoices[0].score).toBeGreaterThan(lastChoices[1].score);
  });
});
