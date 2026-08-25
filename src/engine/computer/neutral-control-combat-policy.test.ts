import { describe, expect, it } from "vitest";
import { NEUTRAL_PLAYER_ID } from "../state";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  LegalAction,
  PlayerVisibleState,
} from "../state";
import { scoreCombatAction } from "./combat-policy";
import type { ComputerObservation } from "./types";

/**
 * PvP NEUTRAL CONTROL — the AI as the guards' controller. The decision owner
 * is a player seat while the acting guard stays controlled by the NEUTRAL
 * side. The ATTACK branch always scored from the unit's actual side; the
 * MOVE / DEFEND / targeted-ability branches read `observation.playerId`, so an
 * AI seat driving the guards counted its own guards as "enemies": every
 * distance read was ~0 (a sibling guard is always adjacent), closing moves
 * scored as holds, Defend saw phantom besiegers, and a buff on a sibling guard
 * scored as if aimed at an enemy. Pinned here with own-army CONTROLs — the
 * fix must leave a normal fight's scoring byte-identical.
 */

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
  legalActions: LegalAction[] = [],
  playerId = "p2",
): ComputerObservation {
  const unitMap: Record<string, CombatUnitState> = {};
  for (const u of units) unitMap[u.id] = u;
  const combat = { id: "c1", units: unitMap } as unknown as CombatState;
  const state = {
    seed: "neutral-control-policy-test",
    round: 1,
    eventCounter: 0,
    combat,
    players: {},
  } as unknown as PlayerVisibleState;
  return { playerId, state, legalActions };
}

describe("MOVE_UNIT — a controlled neutral guard closes on the FIGHTER, not on its sibling guard", () => {
  it("scores the approach toward the enemy army as close-distance; CONTROL: an own-army mover is scored identically", () => {
    // Guards on the back row (sibling adjacent), the fighter's unit far ahead.
    const guards = [
      unit({ id: "g1", controllerId: NEUTRAL_PLAYER_ID, position: 14 }),
      unit({ id: "g2", controllerId: NEUTRAL_PLAYER_ID, position: 15 }),
      unit({ id: "e1", controllerId: "p1", position: 2 }),
    ];
    const move = {
      type: "MOVE_UNIT",
      playerId: "p2",
      unitId: "g1",
      destination: 10,
    } as GameAction;

    // The AI seat p2 drives the guards: stepping toward the p1 army must read
    // as closing distance. (Pre-fix, the sibling guard at 15 counted as the
    // "nearest enemy" from p2's perspective — current distance 1 — so the
    // approach scored as a hold/away step and the guard never advanced.)
    const scored = scoreCombatAction(observation(guards), move);
    expect(scored?.policy).toBe("combat.close-distance");
    expect(scored?.score).toBeGreaterThan(500);

    // CONTROL: the same shape with an OWN p2 unit moving toward a p1 enemy —
    // ordinary fights keep the ordinary reading.
    const own = [
      unit({ id: "m1", controllerId: "p2", position: 14 }),
      unit({ id: "m2", controllerId: "p2", position: 15 }),
      unit({ id: "e1", controllerId: "p1", position: 2 }),
    ];
    const ownMove = {
      type: "MOVE_UNIT",
      playerId: "p2",
      unitId: "m1",
      destination: 10,
    } as GameAction;
    const ownScored = scoreCombatAction(observation(own), ownMove);
    expect(ownScored?.policy).toBe("combat.close-distance");
    expect(ownScored?.score).toBe(scored?.score);
  });
});

describe("DEFEND_UNIT — a controlled neutral guard's support is its SIBLING guards", () => {
  it("an adjacent sibling guard counts as support, not as a besieger", () => {
    // Wounded guard g1 with one adjacent sibling g2 and two adjacent enemies:
    // 2 enemies vs 1 support → NOT surrounded (2 > 1+1 is false). Pre-fix the
    // sibling counted as a third ENEMY and support was zero (3 > 0+1), so the
    // guard was scored as besieged by its own side.
    const guards = [
      unit({
        id: "g1",
        controllerId: NEUTRAL_PLAYER_ID,
        position: 5,
        damage: 2,
      }),
      unit({ id: "g2", controllerId: NEUTRAL_PLAYER_ID, position: 9 }),
      unit({ id: "e1", controllerId: "p1", position: 1 }),
      unit({ id: "e2", controllerId: "p1", position: 6 }),
    ];
    const defendAction = {
      type: "DEFEND_UNIT",
      playerId: "p2",
      unitId: "g1",
    } as GameAction;

    const scored = scoreCombatAction(observation(guards), defendAction);
    expect(scored?.policy).toBe("combat.defend-wounded");

    // CONTROL: remove the sibling's support (move it away) — now genuinely
    // surrounded (2 enemies vs 0 support) and the save bump applies.
    const alone = guards.map((u) =>
      u.id === "g2" ? { ...u, position: 15 } : u,
    );
    const aloneScored = scoreCombatAction(observation(alone), defendAction);
    expect(aloneScored?.policy).toBe("combat.defend-surrounded");
    expect(aloneScored!.score).toBeGreaterThan(scored!.score);
  });
});

describe("USE_UNIT_ABILITY — a buff aimed at a sibling guard is an ALLY play", () => {
  it("scores a wounded sibling target as use-ability-ally; CONTROL: the fighter's unit stays the enemy read", () => {
    const guards = [
      unit({ id: "g1", controllerId: NEUTRAL_PLAYER_ID, position: 5 }),
      unit({
        id: "g2",
        controllerId: NEUTRAL_PLAYER_ID,
        position: 9,
        damage: 2,
      }),
      unit({ id: "e1", controllerId: "p1", position: 1 }),
    ];
    const buffSibling = {
      type: "USE_UNIT_ABILITY",
      playerId: "p2",
      unitId: "g1",
      abilityId: "some-buff",
      target: { type: "unit", unitId: "g2" },
    } as GameAction;
    const scored = scoreCombatAction(observation(guards), buffSibling);
    // Pre-fix: g2.controllerId !== "p2" read the sibling as an ENEMY target.
    expect(scored?.policy).toBe("combat.use-ability-ally");

    const aimEnemy = {
      type: "USE_UNIT_ABILITY",
      playerId: "p2",
      unitId: "g1",
      abilityId: "some-strike",
      target: { type: "unit", unitId: "e1" },
    } as GameAction;
    const enemyScored = scoreCombatAction(observation(guards), aimEnemy);
    expect(enemyScored?.policy).toBe("combat.use-ability-enemy");
  });
});
