import { describe, expect, it } from "vitest";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  LegalAction,
  PlayerVisibleState,
} from "../state";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";

/** Minimal combat unit; only the fields the policy reads matter, the rest are
 * inert defaults so the fixture compiles as a real CombatUnitState. */
function unit(overrides: Partial<CombatUnitState> & { id: string }): CombatUnitState {
  return {
    controllerId: "p1",
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
  playerId = "p2",
): ComputerObservation {
  const unitMap: Record<string, CombatUnitState> = {};
  for (const u of units) unitMap[u.id] = u;
  const combat = { id: "c1", units: unitMap } as unknown as CombatState;
  const state = {
    seed: "combat-policy-test",
    round: 1,
    eventCounter: 0,
    combat,
    players: {},
  } as unknown as PlayerVisibleState;
  return { playerId, state, legalActions };
}

const attackOn = (attackerId: string, defenderId: string): LegalAction => ({
  action: { type: "ATTACK_UNIT", playerId: "p2", attackerId, defenderId } as GameAction,
  label: `attack ${defenderId}`,
});

const moveTo = (unitId: string, destination: number): LegalAction => ({
  action: { type: "MOVE_UNIT", playerId: "p2", unitId, destination } as GameAction,
  label: `move ${destination}`,
});

const defend = (unitId: string): LegalAction => ({
  action: { type: "DEFEND_UNIT", playerId: "p2", unitId } as GameAction,
  label: "defend",
});

describe("combat policy — attack target selection", () => {
  it("takes a lethal removal over a bigger but non-lethal hit", () => {
    // Attacker (att 6). E1 is the better CHIP target (6-0=6 of 8 HP) but cannot
    // be killed this hit; E2 is fragile and dies (6-2=4 >= 3 HP). The lethal
    // removal is preferred over the larger non-lethal chip.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 6, defense: 2, position: 8 });
    const e1 = unit({ id: "E1", attack: 5, defense: 0, maxHealth: 8, position: 9 });
    const e2Lethal = unit({ id: "E2", attack: 2, defense: 2, maxHealth: 3, position: 12 });

    const lethal = chooseComputerAction(
      observation([attacker, e1, e2Lethal], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect(lethal?.action.type).toBe("ATTACK_UNIT");
    expect((lethal?.action as { defenderId: string }).defenderId).toBe("E2");
    expect(lethal?.policy).toBe("combat.attack-target");

    // CONTROL: make E2 durable (6-2=4 < 12 HP), a poor chip. With no lethal
    // removal available, the harder-hit E1 becomes the pick — proving the lethal
    // bonus, not the target order, drove the first choice.
    const e2Survives = unit({ id: "E2", attack: 2, defense: 2, maxHealth: 12, position: 12 });
    const chipped = chooseComputerAction(
      observation([attacker, e1, e2Survives], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((chipped?.action as { defenderId: string }).defenderId).toBe("E1");
  });

  it("among lethal removals, deletes the higher-threat enemy", () => {
    // Both enemies die to the att-10 attacker; E2 is the far scarier unit.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 10, position: 8 });
    const weak = unit({ id: "E1", attack: 3, defense: 0, maxHealth: 3, initiative: 4, position: 9 });
    const scary = unit({ id: "E2", attack: 9, defense: 0, maxHealth: 3, initiative: 9, position: 12 });

    const decision = chooseComputerAction(
      observation([attacker, weak, scary], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E2");

    // CONTROL: move the scary stats onto E1 and the choice follows the threat.
    const weakSwapped = unit({ id: "E1", attack: 9, defense: 0, maxHealth: 3, initiative: 9, position: 9 });
    const scarySwapped = unit({ id: "E2", attack: 3, defense: 0, maxHealth: 3, initiative: 4, position: 12 });
    const swapped = chooseComputerAction(
      observation([attacker, weakSwapped, scarySwapped], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((swapped?.action as { defenderId: string }).defenderId).toBe("E1");
  });

  it("prefers the equal target that cannot retaliate", () => {
    // Two identical durable enemies; only E2 has already retaliated this round,
    // so hitting it draws no counter-damage.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 5, defense: 2, position: 8 });
    const e1 = unit({ id: "E1", attack: 9, defense: 3, maxHealth: 12, position: 9, retaliatedThisRound: false });
    const e2 = unit({ id: "E2", attack: 9, defense: 3, maxHealth: 12, position: 7, retaliatedThisRound: true });

    const decision = chooseComputerAction(
      observation([attacker, e1, e2], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E2");

    // CONTROL: swap which enemy has spent its retaliation and the choice swaps.
    const e1Spent = unit({ id: "E1", attack: 9, defense: 3, maxHealth: 12, position: 9, retaliatedThisRound: true });
    const e2Ready = unit({ id: "E2", attack: 9, defense: 3, maxHealth: 12, position: 7, retaliatedThisRound: false });
    const swapped = chooseComputerAction(
      observation([attacker, e1Spent, e2Ready], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((swapped?.action as { defenderId: string }).defenderId).toBe("E1");
  });
});

describe("combat policy — defend the high-value threatened unit", () => {
  // A (att 5 vs def 6 → 0 damage) pokes for nothing while E's retaliation
  // (9 − 2 = 7) kills it outright; A's threat value (26) is worth keeping.
  const highValue = () =>
    unit({ id: "A", controllerId: "p2", attack: 5, defense: 2, maxHealth: 6, position: 8 });
  const executioner = () =>
    unit({ id: "E", attack: 9, defense: 6, maxHealth: 8, position: 9 });

  it("defends a high-value unit instead of a suicidal 0-damage poke", () => {
    const decision = chooseComputerAction(
      observation([highValue(), executioner()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("DEFEND_UNIT");
    expect(decision?.policy).toBe("combat.defend-high-value");
  });

  it("CONTROL: a real strike still beats defending", () => {
    // Same mortal danger, but the attack now lands 2 damage — strike.
    const hitter = unit({
      id: "A", controllerId: "p2", attack: 8, defense: 2, maxHealth: 6, position: 8,
    });
    const decision = chooseComputerAction(
      observation([hitter, executioner()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("ATTACK_UNIT");
  });

  it("CONTROL: a low-value unit keeps trading rather than turtling", () => {
    // Same suicidal poke, but the chaff body (threat 17) is not worth a Defend.
    const chaff = unit({
      id: "A", controllerId: "p2", attack: 2, defense: 2, maxHealth: 6, position: 8,
    });
    const decision = chooseComputerAction(
      observation([chaff, executioner()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("ATTACK_UNIT");
  });

  it("CONTROL: out of reach, the high-value unit is not defense-locked", () => {
    // The executioner is far away and not ranged — no incoming threat, so the
    // plain wounded-defend baseline applies (attack at 545+ would still win,
    // but here only MOVE/DEFEND are offered and closing distance wins).
    const distantExecutioner = unit({
      id: "E", attack: 9, defense: 6, maxHealth: 8, position: 3,
    });
    const decision = chooseComputerAction(
      observation(
        [highValue(), distantExecutioner],
        [moveTo("A", 9), defend("A")],
      ),
    );
    expect(decision?.action.type).toBe("MOVE_UNIT");
  });
});

describe("combat policy — closing distance", () => {
  it("advances toward the enemy when no attack is in reach, but never below a defend", () => {
    // Mover at A1(0), enemy at D1(3), Manhattan distance 3. B1(1) is distance 2
    // (closer); A2(4) is distance 4 (farther). DEFEND is the foundation exit.
    const mover = unit({ id: "M", controllerId: "p2", position: 0 });
    const enemy = unit({ id: "E", attack: 4, position: 3 });

    const advance = chooseComputerAction(
      observation([mover, enemy], [moveTo("M", 1), moveTo("M", 4), defend("M")]),
    );
    expect(advance?.action.type).toBe("MOVE_UNIT");
    expect((advance?.action as { destination: number }).destination).toBe(1);
    expect(advance?.policy).toBe("combat.close-distance");

    // CONTROL: without a distance-reducing move, defending in place beats
    // wandering to the farther cell — the unit never flees.
    const hold = chooseComputerAction(
      observation([mover, enemy], [moveTo("M", 4), defend("M")]),
    );
    expect(hold?.action.type).toBe("DEFEND_UNIT");
  });
});
