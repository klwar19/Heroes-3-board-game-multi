import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeActiveEffect,
  NEUTRAL_PLAYER_ID,
  planNeutralActivation,
  unitIsBerserk
} from "./index";
import type { ActiveEffectModifier, GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for two combat spells imported from the fan wiki. Every rule is
 * engine-enforced; each test fails if the wiring is removed.
 *  - Berserk  (Expert Fire)  — the selected unit MUST attack the nearest unit
 *                              (friend or foe) on its next activation; grade-gated
 *                              like Blind (Power 0/2/4 → bronze/silver/gold).
 *  - Teleport (Expert Water) — move one of your units to any empty space,
 *                              ignoring obstacles/distance; grade-gated by the
 *                              moved unit (Power 0/1/2 → bronze/silver/gold).
 *
 * Sandbox grades/types (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findCast(state: GameState, playerId: "p1" | "p2", cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

/** Casts a unit-target spell at the given Power, resolving it on the stack. */
function castAt(state: GameState, cardId: string, targetUnitId: UnitId, power: number): GameState {
  const cast = findCast(state, "p1", cardId, targetUnitId);
  expect(cast, `${cardId} should be a legal cast on ${targetUnitId}`).toBeTruthy();
  const casted = applyOk(state, cast!.action);
  // Spare Power statistics open the Empower window; the test pays `power` into it.
  casted.stack[0]!.modifiers.spellPowerBonus = power;
  return passAllReactions(casted);
}

// ---------------------------------------------------------------------------
// Berserk — force a unit to attack the nearest (friend or foe)
// ---------------------------------------------------------------------------

describe("Berserk spell", () => {
  /**
   * Catherine's marksmen (caster, far) berserks Sandro's skeletons, who stand
   * next to their own vampires — so the nearest unit to the skeletons is a
   * friendly. Every other unit is two or more spaces away.
   */
  function berserkScene(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.combat!.obstacles = [];
    const units = state.combat!.units;
    units.unit_p1_marksmen.position = 3;
    units.unit_p1_griffins.position = 0;
    units.unit_p1_crusaders.position = 2;
    units.unit_p2_skeletons.position = 8; // row 2, col 0
    units.unit_p2_vampires.position = 9; // row 2, col 1 — adjacent to the skeletons
    units.unit_p2_dread_knights.position = 19;
    for (const id of Object.keys(units)) {
      units[id].abilities = [];
      units[id].maxHealth = 40;
      units[id].damage = 0;
      units[id].activatedThisRound = false;
    }
    units.unit_p2_skeletons.attack = 5;
    units.unit_p2_skeletons.defense = 2;
    units.unit_p2_vampires.attack = 4;
    units.unit_p2_vampires.defense = 1;
    state.players.p1.hand = ["spell.berserk", "stat.power", "stat.power", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  /** Hands the activation to a (berserked) unit so its legal actions can be read. */
  function activate(state: GameState, unitId: UnitId): GameState {
    const next: GameState = { ...state };
    next.combat!.activeUnitId = unitId;
    next.combat!.units[unitId].activatedThisRound = false;
    next.combat!.units[unitId].movedThisActivation = false;
    next.combat!.units[unitId].attackedThisActivation = false;
    next.activePlayerId = next.combat!.units[unitId].controllerId;
    return next;
  }

  function unitActions(state: GameState, unitId: UnitId, type: GameAction["type"]) {
    const controller = state.combat!.units[unitId].controllerId as "p1" | "p2";
    return getLegalActions(state, controller).filter((legal) => {
      const action = legal.action;
      if (action.type !== type) {
        return false;
      }
      if (action.type === "ATTACK_UNIT" || action.type === "MOVE_AND_ATTACK_UNIT") {
        return action.attackerId === unitId;
      }
      if (action.type === "MOVE_UNIT" || action.type === "DEFEND_UNIT" || action.type === "END_ACTIVATION") {
        return action.unitId === unitId;
      }
      return false;
    });
  }

  it("places the forced-attack effect, gated by Power (Power 0 reaches bronze)", () => {
    const state = berserkScene("berserk-create");
    const resolved = castAt(state, "spell.berserk", "unit_p2_skeletons", 0);
    expect(unitIsBerserk(resolved.activeEffects, resolved.combat!.units.unit_p2_skeletons)).toBe(true);
  });

  it("is grade-gated: Power 0 cannot berserk a gold unit, but Power 4 can", () => {
    const gated = castAt(berserkScene("berserk-gate"), "spell.berserk", "unit_p2_dread_knights", 0);
    expect(unitIsBerserk(gated.activeEffects, gated.combat!.units.unit_p2_dread_knights)).toBe(false);

    const powered = castAt(berserkScene("berserk-power"), "spell.berserk", "unit_p2_dread_knights", 4);
    expect(unitIsBerserk(powered.activeEffects, powered.combat!.units.unit_p2_dread_knights)).toBe(true);
  });

  it("forces the unit to attack only the nearest unit — no free move, defend or other target", () => {
    const cast = castAt(berserkScene("berserk-constrain"), "spell.berserk", "unit_p2_skeletons", 0);
    const state = activate(cast, "unit_p2_skeletons");

    const attacks = unitActions(state, "unit_p2_skeletons", "ATTACK_UNIT");
    // The nearest unit is the friendly vampires — the only legal attack.
    expect(attacks).toHaveLength(1);
    expect(attacks[0].action.type === "ATTACK_UNIT" && attacks[0].action.defenderId).toBe("unit_p2_vampires");
    // Berserk strips the rest of the menu while a target stands adjacent.
    expect(unitActions(state, "unit_p2_skeletons", "MOVE_UNIT")).toHaveLength(0);
    expect(unitActions(state, "unit_p2_skeletons", "DEFEND_UNIT")).toHaveLength(0);
    expect(unitActions(state, "unit_p2_skeletons", "END_ACTIVATION")).toHaveLength(0);
  });

  it("a berserked unit strikes its own ally, who retaliates as normal", () => {
    const cast = castAt(berserkScene("berserk-friendly-fire"), "spell.berserk", "unit_p2_skeletons", 0);
    const state = activate(cast, "unit_p2_skeletons");

    const resolved = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p2_vampires"
      })
    );
    // The ally took the forced blow (5 attack − 1 defense = 4)…
    expect(resolved.combat!.units.unit_p2_vampires.damage).toBe(4);
    // …and retaliated (4 attack − 2 defense = 2), even though both are p2's.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("lasts only the one activation — the unit is no longer berserked afterwards", () => {
    const cast = castAt(berserkScene("berserk-expire"), "spell.berserk", "unit_p2_skeletons", 0);
    const state = activate(cast, "unit_p2_skeletons");
    const resolved = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p2_vampires"
      })
    );
    expect(unitIsBerserk(resolved.activeEffects, resolved.combat!.units.unit_p2_skeletons)).toBe(false);
  });

  it("forces a move toward the nearest unit when it cannot strike this activation", () => {
    const cast = castAt(berserkScene("berserk-approach"), "spell.berserk", "unit_p2_skeletons", 0);
    // Pull every other unit far away so the nearest is out of strike range but
    // reachable by moving.
    cast.combat!.units.unit_p2_skeletons.position = 0; // row 0, col 0
    cast.combat!.units.unit_p2_vampires.position = 16; // row 4, col 0 — 4 spaces below
    cast.combat!.units.unit_p1_marksmen.position = 19;
    cast.combat!.units.unit_p1_griffins.position = 18;
    cast.combat!.units.unit_p1_crusaders.position = 17;
    cast.combat!.units.unit_p2_dread_knights.position = 15;
    const state = activate(cast, "unit_p2_skeletons");

    // No strike is reachable, so only forward moves (toward the vampires) are
    // offered — never a defend or a hold while it can still close in.
    expect(unitActions(state, "unit_p2_skeletons", "ATTACK_UNIT")).toHaveLength(0);
    expect(unitActions(state, "unit_p2_skeletons", "DEFEND_UNIT")).toHaveLength(0);
    const moves = unitActions(state, "unit_p2_skeletons", "MOVE_UNIT");
    expect(moves.length).toBeGreaterThan(0);
    // Every offered step lands strictly closer to the vampires (a lower row).
    for (const move of moves) {
      if (move.action.type === "MOVE_UNIT") {
        expect(move.action.destination).toBeGreaterThan(0); // moved down off row 0
        expect(move.action.destination % 4).toBe(0); // stays in column 0, the line to the vampires
      }
    }
  });

  it("Dispel removes the Berserk effect (it is a removable ongoing effect)", () => {
    const cast = castAt(berserkScene("berserk-dispel"), "spell.berserk", "unit_p2_skeletons", 0);
    expect(unitIsBerserk(cast.activeEffects, cast.combat!.units.unit_p2_skeletons)).toBe(true);

    // Catherine dispels her own spell off the skeletons (any-unit, Power 0 bronze).
    // Reset the per-round spell allowance Berserk already spent.
    cast.players.p1.hand = ["spell.dispel", "stat.power"];
    cast.players.p1.combatStats.spellsCastThisRound = 0;
    cast.activePlayerId = "p1";
    cast.combat!.activeUnitId = "unit_p1_marksmen";
    cast.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    const dispelled = castAt(cast, "spell.dispel", "unit_p2_skeletons", 0);
    expect(unitIsBerserk(dispelled.activeEffects, dispelled.combat!.units.unit_p2_skeletons)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Berserk — neutral AI targets the nearest unit (friend or foe)
// ---------------------------------------------------------------------------

describe("Berserk vs the neutral AI", () => {
  function pushBerserk(state: GameState, unitId: UnitId): void {
    const effect: ActiveEffectModifier = { type: "BERSERK_FORCED_ATTACK" };
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Berserk",
          scope: "unit",
          duration: { type: "next-activation" },
          polarity: "negative",
          removable: true,
          modifiers: [effect]
        },
        { type: "system" },
        state.combat!.units[unitId].controllerId,
        { type: "unit", unitId }
      )
    );
  }

  it("a berserked neutral attacks the nearest unit even when it is a fellow neutral", () => {
    const state = createInitialGameState("berserk-neutral");
    state.combat!.obstacles = [];
    const guard = state.combat!.units.unit_p2_skeletons;
    const fellow = state.combat!.units.unit_p2_vampires;
    const enemy = state.combat!.units.unit_p1_crusaders;
    for (const unit of [guard, fellow, enemy]) {
      unit.controllerId = unit.id === enemy.id ? "p1" : NEUTRAL_PLAYER_ID;
      unit.type = "ground";
      unit.abilities = [];
      unit.activatedThisRound = false;
      unit.movedThisActivation = false;
      unit.attackedThisActivation = false;
    }
    guard.position = 0; // row 0, col 0
    fellow.position = 1; // adjacent fellow neutral — the nearest unit
    enemy.position = 2; // a step farther
    state.combat!.units = { [guard.id]: guard, [fellow.id]: fellow, [enemy.id]: enemy };
    pushBerserk(state, guard.id);

    const intent = planNeutralActivation(state, state.combat!, guard);
    // Without Berserk the guard would march on the enemy; berserked, it must hit
    // the nearest unit — its own ally.
    expect(intent).toEqual({ kind: "attack", defenderId: fellow.id });
  });

  it("a berserked neutral that cannot reach the nearest advances on it", () => {
    const state = createInitialGameState("berserk-neutral-approach");
    state.combat!.obstacles = [];
    const guard = state.combat!.units.unit_p2_skeletons;
    const enemy = state.combat!.units.unit_p1_crusaders;
    for (const unit of [guard, enemy]) {
      unit.type = "ground";
      unit.abilities = [];
      unit.activatedThisRound = false;
      unit.movedThisActivation = false;
      unit.attackedThisActivation = false;
    }
    guard.controllerId = NEUTRAL_PLAYER_ID;
    guard.position = 0;
    enemy.controllerId = "p1";
    enemy.position = 19; // far corner — unreachable this activation
    state.combat!.units = { [guard.id]: guard, [enemy.id]: enemy };
    pushBerserk(state, guard.id);

    const intent = planNeutralActivation(state, state.combat!, guard);
    expect(intent.kind).toBe("move");
  });
});

// ---------------------------------------------------------------------------
// Teleport — relocate one of your units to any empty space
// ---------------------------------------------------------------------------

describe("Teleport spell", () => {
  function teleportScene(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.combat!.obstacles = [];
    const units = state.combat!.units;
    units.unit_p1_marksmen.position = 0;
    units.unit_p1_griffins.position = 1;
    units.unit_p1_crusaders.position = 2;
    units.unit_p2_skeletons.position = 16;
    units.unit_p2_vampires.position = 17;
    units.unit_p2_dread_knights.position = 18;
    for (const id of Object.keys(units)) {
      units[id].activatedThisRound = false;
    }
    state.players.p1.hand = ["spell.teleport", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  function teleportChoice(state: GameState) {
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "combat-teleport" || !choice.teleport) {
      return null;
    }
    return choice;
  }

  it("opens an empty-space picker for the chosen friendly unit (Power 0 bronze)", () => {
    const resolved = castAt(teleportScene("teleport-open"), "spell.teleport", "unit_p1_griffins", 0);
    const choice = teleportChoice(resolved);
    expect(choice, "Teleport should open the combat-teleport destination choice").toBeTruthy();
    expect(choice!.teleport!.unitId).toBe("unit_p1_griffins");
    // Every offered destination is genuinely empty (no occupied cells listed).
    const occupied = new Set(Object.values(resolved.combat!.units).map((unit) => unit.position));
    for (const position of choice!.teleport!.positions) {
      expect(occupied.has(position)).toBe(false);
    }
  });

  it("relocates the unit to the chosen empty space, ignoring distance", () => {
    const resolved = castAt(teleportScene("teleport-move"), "spell.teleport", "unit_p1_griffins", 0);
    const choice = teleportChoice(resolved)!;
    // A space far from the griffins (top-left → bottom area), well out of normal
    // move range — Teleport ignores the distance.
    const destination = 11; // row 2, col 3
    const optionIndex = choice.teleport!.positions.indexOf(destination);
    expect(optionIndex, "the far empty space should be a legal teleport destination").toBeGreaterThanOrEqual(0);

    const moved = applyOk(resolved, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex
    });
    expect(moved.combat!.units.unit_p1_griffins.position).toBe(destination);
    expect(moved.pendingChoice).toBeNull();
    // A free relocation: the griffins did not attack and took no retaliation.
    expect(moved.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("never offers an occupied space or an obstacle as a destination", () => {
    const state = teleportScene("teleport-blocked");
    state.combat!.obstacles = [10]; // row 2, col 2 — a combat obstacle
    const resolved = castAt(state, "spell.teleport", "unit_p1_griffins", 0);
    const choice = teleportChoice(resolved)!;
    expect(choice.teleport!.positions).not.toContain(10); // the obstacle
    expect(choice.teleport!.positions).not.toContain(0); // the marksmen's cell
    expect(choice.teleport!.positions).not.toContain(16); // a skeleton's cell
  });

  it("is grade-gated by the moved unit: Power 0 cannot teleport a gold unit, Power 2 can", () => {
    const goldGated = teleportScene("teleport-gate");
    goldGated.combat!.units.unit_p1_crusaders.grade = "gold";
    const gated = castAt(goldGated, "spell.teleport", "unit_p1_crusaders", 0);
    expect(teleportChoice(gated), "Power 0 must not reach a gold unit").toBeNull();

    const goldPowered = teleportScene("teleport-gate-power");
    goldPowered.combat!.units.unit_p1_crusaders.grade = "gold";
    const powered = castAt(goldPowered, "spell.teleport", "unit_p1_crusaders", 2);
    expect(teleportChoice(powered), "Power 2 reaches a gold unit").toBeTruthy();
  });

  it("does not spend the teleported unit's activation (it can still act)", () => {
    const resolved = castAt(teleportScene("teleport-activation"), "spell.teleport", "unit_p1_griffins", 0);
    const choice = teleportChoice(resolved)!;
    const moved = applyOk(resolved, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
    // Teleport is the caster's spell, not the griffins' turn — the griffins have
    // not been marked activated and stand ready to act on their own initiative.
    expect(moved.combat!.units.unit_p1_griffins.activatedThisRound).toBe(false);
  });
});
