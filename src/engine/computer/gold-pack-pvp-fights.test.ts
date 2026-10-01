import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit } from "../adventure";
import { createInitialGameState } from "../index";
import type { CombatState, CombatUnitState, GameAction, GameState } from "../state";
import { scoreCombatAction } from "./combat-policy";
import { getComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";

// USER RULING 2026-10-01: a computer hero holding a Gold Pack FIGHTS a player
// battle — no Retreat / Surrender / Give up before it has lost a unit in it.
// Each claim is checked against a CONTROL where the old escape scoring stands.

function mainHero(state: GameState, playerId: string) {
  return Object.values(state.heroes).find((hero) => hero.controllerId === playerId && hero.kind === "main")!;
}

function observe(state: GameState, legal: GameAction[]): ComputerObservation {
  return {
    playerId: "p1",
    state: state as unknown as ComputerObservation["state"],
    legalActions: legal.map((action) => ({ label: action.type, action })),
    memory: getComputerMemory(state, "p1"),
  };
}

/** p1 (Castle) is attacked by an overwhelming p2 army; `goldSide` is p1's Archangels card. */
function setup(goldSide: "pack" | "few", ownUnitLost = false): GameState {
  const state = createAdventureGameState({
    seed: "gold-pack-fights", difficulty: "impossible", events: false, rollFirstPlayer: false,
  });
  state.activePlayerId = "p1";
  const own = state.players.p1;
  own.army = [];
  for (const id of ["castle.halberdiers", "castle.marksmen"]) addArmyUnit(own, id, "few");
  addArmyUnit(own, "castle.archangels", goldSide);
  own.resources.gold = 20;
  const enemy = state.players.p2;
  enemy.army = [];
  for (const id of ["castle.archangels", "castle.champions", "castle.crusaders", "castle.zealots", "castle.griffins"]) {
    addArmyUnit(enemy, id, "pack");
  }
  const units: Record<string, CombatUnitState> = {};
  if (ownUnitLost) {
    // A real combat unit shape, owned by p1 and fully destroyed.
    const template = createInitialGameState("gold-pack-unit").combat!.units.unit_p1_crusaders;
    units.unit_p1_lost = { ...template, id: "unit_p1_lost", controllerId: "p1", damage: template.maxHealth, armyStacks: 0 } as CombatUnitState;
  }
  state.combat = {
    id: "combat_gold_pack", round: 1, attackerPlayerId: "p2", defenderPlayerId: "p1", activeUnitId: null, units,
    context: {
      kind: "player",
      attackerHeroId: mainHero(state, "p2").id,
      defenderHeroId: mainHero(state, "p1").id,
      fieldId: mainHero(state, "p1").spaceId!,
    },
  } as unknown as CombatState;
  return state;
}

const escapes: GameAction[] = [
  { type: "RETREAT_FROM_COMBAT", playerId: "p1" },
  { type: "SURRENDER_COMBAT", playerId: "p1" },
  { type: "GIVE_UP_COMBAT", playerId: "p1" },
];

function policies(state: GameState) {
  const observation = observe(state, escapes);
  return escapes.map((action) => scoreCombatAction(observation, action)!);
}

describe("AI with a Gold Pack never flees a player battle (ruling 2026-10-01)", () => {
  it("refuses every escape while no unit of its own has fallen", () => {
    for (const scored of policies(setup("pack"))) {
      expect(scored.policy).toBe("combat.gold-pack-fights");
      expect(scored.score).toBe(-900);
    }
  });

  it("CONTROL: the same army with the Gold card on its Few side keeps the old escape scoring", () => {
    const [retreat, ...rest] = policies(setup("few"));
    // Forecast-hopeless (no Gold Pack): the AI leaves by Retreat before the battle.
    expect(retreat.policy).toBe("combat.pvp-escape-hopeless");
    for (const scored of rest) {
      expect(scored.policy).not.toBe("combat.gold-pack-fights");
    }
  });

  it("CONTROL: once a unit of its own has fallen in the battle, the escape is no longer blocked", () => {
    for (const scored of policies(setup("pack", true))) {
      expect(scored.policy).not.toBe("combat.gold-pack-fights");
    }
  });
});
