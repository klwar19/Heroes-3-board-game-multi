import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import { getAttackBonusIfFlipped, getDamageCapPerAttack, getOnKillResourceGain } from "./unit-abilities";
import { markUnitRemovedIfNeeded } from "./combat-units";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * The four new Cove unit mechanics, engine-enforced and tested here:
 *   • Nix (Pack)      — "cannot take more than 4 damage from a single attack"
 *   • Haspids (Few)   — "+2 attack if flipped from the Pack to the Few side"
 *   • Seamen (Pack)   — "once per Combat, gain 2 gold when it removes a unit"
 *   • Ayssids (Pack)  — "if the target is reduced to 0 HP … attack another adjacent unit"
 *
 * Each test scripts the dice so the resolved damage is deterministic, and every
 * assertion fails if the wiring is removed (the controls prove the opposite).
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

/** Pass instant windows and decline every reroll so the scripted roll stands. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function abilityEvents(state: GameState): { abilityId: string; message: string }[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => ({ abilityId: event.abilityId, message: event.message }));
}

function unitWith(abilities: string[], extra: Partial<CombatUnitState> = {}): CombatUnitState {
  return { abilities, ...extra } as CombatUnitState;
}

/**
 * A clean ranged duel mirroring printed-unit-abilities.test.ts: p1 Marksmen
 * shoot the p2 Skeletons from a non-adjacent space (no Retaliation Attack), so
 * the resolved damage is exactly attack − defense after the scripted roll.
 */
function rangedDuel(options: {
  attackerAbilities?: string[];
  attackerAttack?: number;
  defenderAbilities?: string[];
  defenderMaxHealth?: number;
  defenderVariant?: "few" | "pack";
  rolls: number[];
}): GameState {
  const state = createInitialGameState("cove-abilities-seed");
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.attackerAbilities ?? [];
  attacker.attack = options.attackerAttack ?? 3;
  attacker.position = 1;

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = options.defenderAbilities ?? [];
  defender.position = 13; // non-adjacent → ranged shot, no retaliation
  defender.defense = 0;
  defender.maxHealth = options.defenderMaxHealth ?? 20;
  defender.damage = 0;
  defender.variant = options.defenderVariant ?? "few";

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, options.rolls);
  setActive(state, "p1", "unit_p1_marksmen");

  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

// ---------------------------------------------------------------------------
// Nix (Pack) — "cannot take more than 4 damage from a single attack."
// ---------------------------------------------------------------------------

describe("Nix Hardened Shell — per-attack damage cap", () => {
  it("getDamageCapPerAttack reports the cap (and nothing without it)", () => {
    expect(getDamageCapPerAttack(unitWith(["nix-damage-cap"]))?.amount).toBe(4);
    expect(getDamageCapPerAttack(unitWith([]))).toBeNull();
  });

  it("clamps a single attack's damage to 4 and logs the ability", () => {
    // attack 10, roll 0, defense 0 → raw 10, capped to 4.
    const next = rangedDuel({ attackerAttack: 10, defenderAbilities: ["nix-damage-cap"], rolls: [0] });
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(abilityEvents(next).some((event) => event.abilityId === "nix-damage-cap")).toBe(true);
  });

  it("does not cap a hit that is already at or below 4", () => {
    // attack 3, roll 0 → 3 damage; the cap never fires (no event).
    const next = rangedDuel({ attackerAttack: 3, defenderAbilities: ["nix-damage-cap"], rolls: [0] });
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(abilityEvents(next).some((event) => event.abilityId === "nix-damage-cap")).toBe(false);
  });

  it("control: without the ability the full damage lands", () => {
    const next = rangedDuel({ attackerAttack: 10, defenderAbilities: [], rolls: [0] });
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Haspids (Few) — "+2 attack if flipped from the Pack to the Few side."
// ---------------------------------------------------------------------------

describe("Haspids Vengeance — +2 attack once flipped down", () => {
  it("getAttackBonusIfFlipped only pays out once the flip flag is set", () => {
    expect(getAttackBonusIfFlipped(unitWith(["haspid-vengeance"], { flippedDownThisCombat: true }))).toBe(2);
    expect(getAttackBonusIfFlipped(unitWith(["haspid-vengeance"], { flippedDownThisCombat: false }))).toBe(0);
    expect(getAttackBonusIfFlipped(unitWith([], { flippedDownThisCombat: true }))).toBe(0);
  });

  it("adds +2 to the attack only when the attacker has been flipped this combat", () => {
    const flipped = rangedDuel({ attackerAbilities: ["haspid-vengeance"], attackerAttack: 5, rolls: [0] });
    // The harness attacker was not flipped, so no bonus yet (control path below).
    expect(flipped.combat!.units.unit_p2_skeletons.damage).toBe(5);

    // Now flag the attacker as flipped and re-run the same attack: +2.
    const state = createInitialGameState("cove-haspid-seed");
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = ["haspid-vengeance"];
    attacker.attack = 5;
    attacker.position = 1;
    attacker.flippedDownThisCombat = true;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 20;
    defender.damage = 0;
    defender.variant = "few";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0]);
    setActive(state, "p1", "unit_p1_marksmen");
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(7); // 5 + 2 vengeance
  });

  it("a real Pack→Few flip sets the flag and turns on the Few-side ability", () => {
    const state = createInitialGameState("cove-haspid-flip-seed");
    const haspid = state.combat!.units.unit_p2_skeletons;
    haspid.unitDefId = "cove.haspids";
    haspid.name = "Haspids";
    haspid.variant = "pack";
    haspid.maxHealth = 8;
    haspid.damage = 7; // one more point flips the Pack down to its Few side
    expect(haspid.flippedDownThisCombat ?? false).toBe(false);

    haspid.damage = 8;
    markUnitRemovedIfNeeded(state, haspid);

    expect(haspid.variant).toBe("few");
    expect(haspid.flippedDownThisCombat).toBe(true);
    expect(haspid.abilities).toContain("haspid-vengeance");
    expect(getAttackBonusIfFlipped(haspid)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Seamen (Pack) — "Once per Combat, when this unit removes a unit, gain 2 gold."
// ---------------------------------------------------------------------------

describe("Seamen Plunder — gold on a kill, once per combat", () => {
  it("getOnKillResourceGain reports the 2-gold reward", () => {
    expect(getOnKillResourceGain(unitWith(["seamen-plunder"]))).toMatchObject({ resource: "gold", amount: 2 });
    expect(getOnKillResourceGain(unitWith([]))).toBeNull();
  });

  it("grants 2 gold when the attack removes a unit", () => {
    const next = rangedDuel({
      attackerAbilities: ["seamen-plunder"],
      attackerAttack: 5,
      defenderMaxHealth: 3,
      defenderVariant: "few",
      rolls: [0]
    });
    expect(next.combat!.units.unit_p2_skeletons.damage).toBeGreaterThanOrEqual(3); // removed
    expect(next.players.p1.resources.gold).toBe(12); // 10 + 2
    expect(next.combat!.units.unit_p1_marksmen.gainedKillGoldThisCombat).toBe(true);
    expect(abilityEvents(next).some((event) => event.abilityId === "seamen-plunder")).toBe(true);
  });

  it("control: a non-lethal hit pays nothing", () => {
    const next = rangedDuel({
      attackerAbilities: ["seamen-plunder"],
      attackerAttack: 5,
      defenderMaxHealth: 20,
      defenderVariant: "few",
      rolls: [0]
    });
    expect(next.players.p1.resources.gold).toBe(10);
    expect(next.combat!.units.unit_p1_marksmen.gainedKillGoldThisCombat ?? false).toBe(false);
  });

  it("only pays once per combat (the flag blocks a second kill)", () => {
    const state = createInitialGameState("cove-seamen-twice-seed");
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = ["seamen-plunder"];
    attacker.attack = 5;
    attacker.position = 1;
    attacker.gainedKillGoldThisCombat = true; // already banked earlier this fight
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 3;
    defender.damage = 0;
    defender.variant = "few";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0]);
    setActive(state, "p1", "unit_p1_marksmen");
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
    expect(next.players.p1.resources.gold).toBe(10); // no second payout
  });
});

// ---------------------------------------------------------------------------
// Ayssids (Pack) — "if the target is reduced to 0 HP … attack another adjacent unit."
// ---------------------------------------------------------------------------

/**
 * Melee setup: the p1 attacker stands adjacent to two p2 units. It attacks the
 * first; if that target is removed, the Ayssid follow-up strikes the second
 * (the only other adjacent enemy → resolved automatically, no target choice).
 */
function ayssidStrike(options: { firstTargetHealth: number }): GameState {
  const state = createInitialGameState("cove-ayssid-seed");
  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.abilities = ["ayssid-pounce"];
  attacker.attack = 10;
  attacker.position = 5; // row 1, col 1

  const first = state.combat!.units.unit_p2_skeletons;
  first.abilities = [];
  first.position = 4; // row 1, col 0 → adjacent to 5
  first.defense = 0;
  first.maxHealth = options.firstTargetHealth;
  first.damage = 0;
  first.variant = "few";

  const second = state.combat!.units.unit_p2_vampires;
  second.abilities = [];
  second.position = 9; // row 2, col 1 → adjacent to 5
  second.defense = 0;
  second.maxHealth = 20;
  second.damage = 0;
  second.variant = "few";

  // Keep the friendly crusaders out of the way so the only adjacent enemies are
  // the two targets above.
  state.combat!.units.unit_p1_crusaders.position = 0;
  state.combat!.units.unit_p2_dread_knights.position = 19;

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, [0, 0, 0, 0]);
  setActive(state, "p1", "unit_p1_griffins");

  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("Ayssids Killer Instinct — pounce on a kill", () => {
  it("attacks another adjacent unit when the first target is removed", () => {
    const next = ayssidStrike({ firstTargetHealth: 3 }); // attack 10 → first target removed
    const removed = next.eventLog.some(
      (event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons"
    );
    expect(removed).toBe(true);
    // The follow-up strikes the second adjacent enemy.
    expect(next.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
    expect(abilityEvents(next).some((event) => event.abilityId === "ayssid-pounce")).toBe(true);
  });

  it("control: no pounce when the first target survives", () => {
    const next = ayssidStrike({ firstTargetHealth: 30 }); // attack 10 → target survives
    expect(
      next.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(0);
    expect(abilityEvents(next).some((event) => event.abilityId === "ayssid-pounce")).toBe(false);
  });
});
