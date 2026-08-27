import { describe, expect, it } from "vitest";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  LegalAction,
  PlayerVisibleState,
} from "../state";
import { formationFitScore } from "./combat-policy";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";

function unit(
  overrides: Partial<CombatUnitState> & { id: string },
): CombatUnitState {
  return {
    controllerId: "p2",
    name: overrides.id,
    cardName: overrides.id,
    variant: "neutral",
    grade: "bronze",
    type: "ground",
    attack: 3,
    defense: 2,
    maxHealth: 5,
    damage: 0,
    initiative: 5,
    position: 0,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    ...overrides,
  };
}

function observation(
  units: CombatUnitState[],
  legalActions: LegalAction[],
  extras: Partial<CombatState> = {},
): ComputerObservation {
  const unitMap: Record<string, CombatUnitState> = {};
  for (const u of units) unitMap[u.id] = u;
  const combat = {
    id: "c1",
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    units: unitMap,
    ...extras,
  } as unknown as CombatState;
  const state = {
    seed: "formation-test",
    round: 1,
    eventCounter: 0,
    combat,
    players: {
      p2: {
        id: "p2",
        army: [
          { id: "army_r", unitDefId: "castle.marksmen", side: "few" },
          { id: "army_m", unitDefId: "castle.pikemen", side: "few" },
        ],
      },
    },
  } as unknown as PlayerVisibleState;
  return { playerId: "p2", state, legalActions };
}

describe("formationFitScore", () => {
  it("prefers backline for ranged and frontline for melee", () => {
    const combat = {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      units: {},
    } as unknown as CombatState;
    // Attacker backline 16–19, frontline 12–15.
    const rangedBack = formationFitScore(combat, "p2", "ranged", 17);
    const rangedFront = formationFitScore(combat, "p2", "ranged", 13);
    expect(rangedBack).toBeGreaterThan(rangedFront);

    const meleeFront = formationFitScore(combat, "p2", "melee", 13);
    const meleeBack = formationFitScore(combat, "p2", "melee", 17);
    expect(meleeFront).toBeGreaterThan(meleeBack);
  });

  it("puts a ranged unit in a protected backline corner before a central back cell", () => {
    const combat = {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      units: {},
    } as unknown as CombatState;
    expect(formationFitScore(combat, "p2", "ranged", 16)).toBeGreaterThan(
      formationFitScore(combat, "p2", "ranged", 17),
    );
  });

  it("rewards a melee screen adjacent to a placed ranged ally", () => {
    const combat = {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      units: {
        R: unit({
          id: "R",
          type: "ranged",
          position: 17, // backline
          controllerId: "p2",
        }),
      },
    } as unknown as CombatState;
    // 13 is frontline adjacent-ish column to 17 in 4-wide rows.
    const withScreen = formationFitScore(combat, "p2", "melee", 13, "M", 10);
    const emptyCombat = {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      units: {},
    } as unknown as CombatState;
    const alone = formationFitScore(emptyCombat, "p2", "melee", 13, "M", 10);
    expect(withScreen).toBeGreaterThanOrEqual(alone);
  });
});

describe("placement multi-unit formation", () => {
  it("places a ranged unit on the backline over the frontline", () => {
    const legal: LegalAction[] = [
      {
        label: "front",
        action: {
          type: "PLACE_COMBAT_UNIT",
          playerId: "p2",
          armyUnitId: "army_r",
          position: 13,
        } as GameAction,
      },
      {
        label: "back",
        action: {
          type: "PLACE_COMBAT_UNIT",
          playerId: "p2",
          armyUnitId: "army_r",
          position: 17,
        } as GameAction,
      },
    ];
    // Seed player army so placeScore can read unit type from definition.
    const decision = chooseComputerAction(observation([], legal));
    expect(decision?.action.type).toBe("PLACE_COMBAT_UNIT");
    expect(
      (decision!.action as { position: number }).position,
    ).toBe(17);
  });

  it("chooses a backline corner over a central backline cell for a shooter", () => {
    const legal: LegalAction[] = [
      {
        label: "central back",
        action: {
          type: "PLACE_COMBAT_UNIT",
          playerId: "p2",
          armyUnitId: "army_r",
          position: 17,
        } as GameAction,
      },
      {
        label: "corner back",
        action: {
          type: "PLACE_COMBAT_UNIT",
          playerId: "p2",
          armyUnitId: "army_r",
          position: 16,
        } as GameAction,
      },
    ];
    const decision = chooseComputerAction(observation([], legal));
    expect((decision!.action as { position: number }).position).toBe(16);
  });
});

describe("computer-controlled neutral formation", () => {
  it("fixes a reversed guard line, then finishes instead of swapping back", () => {
    const ranged = unit({
      id: "NR",
      controllerId: "neutral",
      type: "ranged",
      position: 5,
    });
    const melee = unit({
      id: "NM",
      controllerId: "neutral",
      type: "ground",
      position: 1,
      maxHealth: 8,
      defense: 4,
    });
    const finish: LegalAction = {
      label: "ready",
      action: { type: "FINISH_NEUTRAL_PLACEMENT", playerId: "p2" } as GameAction,
    };
    const fix: LegalAction = {
      label: "swap",
      action: {
        type: "PLACE_NEUTRAL_GUARD",
        playerId: "p2",
        unitId: "NR",
        position: 1,
      } as GameAction,
    };
    const extras = {
      attackerPlayerId: "p1",
      defenderPlayerId: "neutral",
      pendingNeutralPlacement: "p2",
    } as Partial<CombatState>;

    const decision = chooseComputerAction(
      observation([ranged, melee], [fix, finish], extras),
    );
    expect(decision?.action.type).toBe("PLACE_NEUTRAL_GUARD");

    const fixedRanged = unit({ ...ranged, position: 1 });
    const fixedMelee = unit({ ...melee, position: 5 });
    const undo: LegalAction = {
      label: "swap back",
      action: {
        type: "PLACE_NEUTRAL_GUARD",
        playerId: "p2",
        unitId: "NR",
        position: 5,
      } as GameAction,
    };
    const settled = chooseComputerAction(
      observation([fixedRanged, fixedMelee], [undo, finish], extras),
    );
    expect(settled?.action.type).toBe("FINISH_NEUTRAL_PLACEMENT");
  });
});

describe("tactics swaps", () => {
  it("swaps a misplaced ranged into the backline when that improves fit", () => {
    // Ranged stuck on front (13), melee on back (17) — swap improves both.
    const ranged = unit({
      id: "R",
      type: "ranged",
      position: 13,
      controllerId: "p2",
    });
    const melee = unit({
      id: "M",
      type: "ground",
      position: 17,
      controllerId: "p2",
      maxHealth: 8,
      defense: 4,
    });
    const legal: LegalAction[] = [
      {
        label: "swap",
        action: {
          type: "SWAP_COMBAT_UNITS",
          playerId: "p2",
          unitIdA: "R",
          unitIdB: "M",
        } as GameAction,
      },
      {
        label: "finish",
        action: { type: "FINISH_TACTICS", playerId: "p2" } as GameAction,
      },
    ];
    const decision = chooseComputerAction(observation([ranged, melee], legal));
    expect(decision?.action.type).toBe("SWAP_COMBAT_UNITS");

    // CONTROL: already correct formation — finish, do not thrash-swap.
    const fixedR = unit({ ...ranged, position: 17 });
    const fixedM = unit({ ...melee, position: 13 });
    const noSwap = chooseComputerAction(observation([fixedR, fixedM], legal));
    expect(noSwap?.action.type).toBe("FINISH_TACTICS");
  });
});

describe("focus fire", () => {
  it("prefers finishing a wounded enemy an ally already threatens", () => {
    const attacker = unit({
      id: "A",
      controllerId: "p2",
      attack: 4,
      position: 8,
    });
    const ally = unit({
      id: "ALLY",
      controllerId: "p2",
      position: 9,
    });
    // E1: wounded, adjacent to ally, dies to 4-atck vs def 0 (remaining 3).
    const e1 = unit({
      id: "E1",
      attack: 3,
      defense: 0,
      maxHealth: 5,
      damage: 2,
      position: 10,
    });
    // E2: full health, higher bulk, not threatened by ally.
    const e2 = unit({
      id: "E2",
      attack: 5,
      defense: 1,
      maxHealth: 8,
      position: 14,
    });
    const legal: LegalAction[] = [
      {
        label: "e1",
        action: {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "A",
          defenderId: "E1",
        } as GameAction,
      },
      {
        label: "e2",
        action: {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "A",
          defenderId: "E2",
        } as GameAction,
      },
    ];
    const decision = chooseComputerAction(
      observation([attacker, ally, e1, e2], legal),
    );
    expect((decision!.action as { defenderId: string }).defenderId).toBe("E1");
  });
});

describe("computer-controlled neutral attacks", () => {
  it("uses the opening against an enemy that already retaliated", () => {
    const guard = unit({
      id: "N",
      controllerId: "neutral",
      attack: 6,
      position: 5,
    });
    const ready = unit({
      id: "READY",
      controllerId: "p1",
      attack: 6,
      defense: 3,
      maxHealth: 9,
      position: 6,
      retaliatedThisRound: false,
    });
    const spent = unit({
      id: "SPENT",
      controllerId: "p1",
      attack: 6,
      defense: 3,
      maxHealth: 9,
      position: 9,
      retaliatedThisRound: true,
    });
    const legal: LegalAction[] = [ready, spent].map((target) => ({
      label: target.id,
      action: {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "N",
        defenderId: target.id,
      } as GameAction,
    }));
    const decision = chooseComputerAction(
      observation([guard, ready, spent], legal, {
        attackerPlayerId: "p1",
        defenderPlayerId: "neutral",
        activeUnitId: "N",
      }),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("SPENT");
  });
});
