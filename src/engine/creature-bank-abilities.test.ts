import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import {
  getEnemySpellPowerReduction,
  getFlatAttackBonus,
  getOnAttackEnemyDiscard,
  getOnAttackParalysis,
  getUnitAbilityDefinitions,
  hasSelfDefenseToken,
  hasSpellCastLock
} from "./unit-abilities";
import { hasToken } from "./tokens";
import { unitAbilities } from "@/data/units/abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, StackTokenStat } from "./state";

/**
 * Engine enforcement for the Creature Bank card abilities that used to be
 * declared display-only (DISPLAY_ONLY_BANK_ABILITIES, now empty). Each test
 * fails if the wiring is removed — exactly the bar CLAUDE.md sets:
 *   • Imp Cache Familiars         — bank-familiar-power-drain (while Stacked)
 *   • Crypt/Shipwreck Wraiths     — bank-wraith-attack-discard (on attack)
 *   • Dwarves / Crystal Dragons   — bank-stacked-defense-token (while Stacked)
 *   • Dragon Utopia Black Dragons — bank-black-dragon-stacked-attack (while Stacked)
 *   • Dragon Utopia Faerie Dragons— bank-faerie-dragon-spell-lock (while Stacked)
 *   • Medusa Stores Medusas       — bank-medusa-paralyze-stacked (while Stacked, on attack)
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

function settle(state: GameState): GameState {
  let current = state;
  let safety = 50;
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

/** A bare combat unit shell carrying the given abilities and Stack state. */
function unitWith(abilities: string[], stackToken: StackTokenStat | null = null): CombatUnitState {
  return { abilities, stackToken } as CombatUnitState;
}

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

// ===========================================================================
// The Stacked gate: every "while Stacked" ability is hidden by the single
// ability chokepoint until the unit carries a Stack Token, and reappears with
// it. (bank-wraith-attack-discard is NOT gated — its card has no Stacked clause.)
// ===========================================================================

describe("requiresStacked gate at getUnitAbilityDefinitions", () => {
  const gated = [
    "bank-familiar-power-drain",
    "bank-stacked-defense-token",
    "bank-black-dragon-stacked-attack",
    "bank-faerie-dragon-spell-lock",
    "bank-medusa-paralyze-stacked"
  ];

  it("registers each new bank ability as an implemented engine effect", () => {
    for (const id of [...gated, "bank-wraith-attack-discard"]) {
      const ability = unitAbilities[id];
      expect(ability, id).toBeTruthy();
      expect(ability.implementationStatus, id).toBe("implemented");
      expect(ability.effect?.type, id).toBeTruthy();
    }
    for (const id of gated) {
      expect(unitAbilities[id].requiresStacked, id).toBe(true);
    }
    // The on-attack discard fires whether or not the Wraiths are Stacked.
    expect(unitAbilities["bank-wraith-attack-discard"].requiresStacked ?? false).toBe(false);
  });

  it("hides a Stacked-only ability when the unit is not Stacked, and shows it when it is", () => {
    for (const id of gated) {
      const unstacked = getUnitAbilityDefinitions(unitWith([id], null)).map((ability) => ability.id);
      const stacked = getUnitAbilityDefinitions(unitWith([id], "attack")).map((ability) => ability.id);
      expect(unstacked, `${id} must be hidden while un-Stacked`).not.toContain(id);
      expect(stacked, `${id} must appear while Stacked`).toContain(id);
    }
  });

  it("never hides an un-gated ability (the Wraith discard) regardless of Stack state", () => {
    expect(getUnitAbilityDefinitions(unitWith(["bank-wraith-attack-discard"], null)).map((a) => a.id)).toContain(
      "bank-wraith-attack-discard"
    );
  });
});

// ===========================================================================
// Imp Cache Familiars — while Stacked, every enemy spell loses 1 Power.
// ===========================================================================

describe("Imp Cache Familiars: enemy spell Power drain (while Stacked)", () => {
  it("getEnemySpellPowerReduction is 0 un-Stacked and 1 Stacked", () => {
    expect(getEnemySpellPowerReduction(unitWith(["bank-familiar-power-drain"], null))).toBe(0);
    expect(getEnemySpellPowerReduction(unitWith(["bank-familiar-power-drain"], "attack"))).toBe(1);
  });

  /**
   * p1 casts a hand Magic Arrow. The active caster carries `magi-power-boost`,
   * which adds +1 Power to its first spell this round (Magic Arrow deals Power+1
   * damage, so +1 Power → 2 damage). A Stacked enemy Familiar shaves that Power
   * back to 0 → 1 damage.
   */
  function castArrow(setup: (state: GameState) => void): GameState {
    const state = createInitialGameState("bank-familiar-drain");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    // +1 Power to the first spell this round, so the −1 drain is observable.
    state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"];
    const target = state.combat!.units.unit_p2_vampires;
    target.maxHealth = 20;
    target.damage = 0;
    setup(state);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        !legal.action.fromScroll &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(cast, "Magic Arrow at the target should be castable").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("a Stacked enemy Familiar reduces the spell's damage by 1; an un-Stacked one does not", () => {
    const drained = castArrow((state) => {
      const fam = state.combat!.units.unit_p2_skeletons;
      fam.abilities = ["bank-familiar-power-drain"];
      fam.stackToken = "attack";
    });
    expect(drained.combat!.units.unit_p2_vampires.damage).toBe(1); // Power 1 − 1 → 1 damage

    const full = castArrow((state) => {
      const fam = state.combat!.units.unit_p2_skeletons;
      fam.abilities = ["bank-familiar-power-drain"];
      fam.stackToken = null; // not Stacked: the drain is inert
    });
    expect(full.combat!.units.unit_p2_vampires.damage).toBe(2); // full Power 1 → 2 damage
  });
});

// ===========================================================================
// Dragon Utopia Black Dragons — while Stacked, +3 Attack.
// ===========================================================================

describe("Dragon Utopia Black Dragons: +3 Attack (while Stacked)", () => {
  it("getFlatAttackBonus is 0 un-Stacked and 3 Stacked", () => {
    expect(getFlatAttackBonus(unitWith(["bank-black-dragon-stacked-attack"], null))).toBe(0);
    expect(getFlatAttackBonus(unitWith(["bank-black-dragon-stacked-attack"], "health"))).toBe(3);
  });

  /** A melee attack at Attack 3, die "0", against a 30-HP, 0-Defense target. */
  function attackDamage(stacked: boolean): number {
    const state = createInitialGameState("bank-black-dragon-attack");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["bank-black-dragon-stacked-attack"];
    attacker.stackToken = stacked ? "health" : null;
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.defense = 0;
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0]);
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    return next.combat!.units.unit_p2_skeletons.damage;
  }

  it("a Stacked Black Dragon deals exactly 3 more melee damage than an un-Stacked one", () => {
    expect(attackDamage(true) - attackDamage(false)).toBe(3);
  });
});

// ===========================================================================
// Dwarves / Crystal Dragons — while Stacked, treated as if it had a Defense token.
// ===========================================================================

describe("Dwarven Treasury / Crystal Dragons: virtual Defense token (while Stacked)", () => {
  it("hasSelfDefenseToken is false un-Stacked and true Stacked", () => {
    expect(hasSelfDefenseToken(unitWith(["bank-stacked-defense-token"], null))).toBe(false);
    expect(hasSelfDefenseToken(unitWith(["bank-stacked-defense-token"], "attack"))).toBe(true);
  });

  /** Damage a 30-HP defender takes from an Attack-3 melee hit, every die "+1". */
  function defenderDamage(stacked: boolean): number {
    const state = createInitialGameState("bank-defense-token");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = ["bank-stacked-defense-token"];
    defender.stackToken = stacked ? "health" : null;
    defender.defense = 0;
    defender.defenseToken = false;
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [1, 1, 1, 1, 1, 1]); // attack die "+1" AND the Defend die "+1"
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    return next.combat!.units.unit_p2_skeletons.damage;
  }

  it("a Stacked defender rolls the Defend die and soaks 1 less damage than an un-Stacked one", () => {
    expect(defenderDamage(false) - defenderDamage(true)).toBe(1);
  });
});

// ===========================================================================
// Medusa Stores Medusas — while Stacked, the attack also Paralyzes the target.
// ===========================================================================

describe("Medusa Stores Medusas: paralyze on attack (while Stacked)", () => {
  it("getOnAttackParalysis is null un-Stacked and set Stacked", () => {
    expect(getOnAttackParalysis(unitWith(["bank-medusa-paralyze-stacked"], null))).toBeNull();
    expect(getOnAttackParalysis(unitWith(["bank-medusa-paralyze-stacked"], "attack"))).toMatchObject({
      abilityId: "bank-medusa-paralyze-stacked"
    });
  });

  function attackAndCheck(stacked: boolean): GameState {
    const state = createInitialGameState("bank-medusa-paralyze");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["bank-medusa-paralyze-stacked"];
    attacker.stackToken = stacked ? "attack" : null;
    attacker.attack = 1;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0]);
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  it("a Stacked Medusa paralyzes the target it attacks", () => {
    const next = attackAndCheck(true);
    expect(hasToken(next.combat!.units.unit_p2_skeletons, "paralysis")).toBe(true);
    expect(abilityEventIds(next)).toContain("bank-medusa-paralyze-stacked");
  });

  it("an un-Stacked Medusa does NOT paralyze", () => {
    const next = attackAndCheck(false);
    expect(hasToken(next.combat!.units.unit_p2_skeletons, "paralysis")).toBe(false);
    expect(abilityEventIds(next)).not.toContain("bank-medusa-paralyze-stacked");
  });
});

// ===========================================================================
// Crypt / Shipwreck Wraiths — on attack, the enemy discards a card from hand.
// ===========================================================================

describe("Crypt / Shipwreck Wraiths: enemy discard on attack", () => {
  it("getOnAttackEnemyDiscard reports a 1-card discard (un-gated by Stack state)", () => {
    expect(getOnAttackEnemyDiscard(unitWith(["bank-wraith-attack-discard"], null))).toMatchObject({ count: 1 });
    expect(getOnAttackEnemyDiscard(unitWith([], null))).toBeNull();
  });

  it("forces the enemy to discard 1 card after this unit's own attack", () => {
    const state = createInitialGameState("bank-wraith-discard");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["bank-wraith-attack-discard"];
    attacker.attack = 1;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = ["stat.power"]; // the enemy of the attacker (p1) is p2
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0]);
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    expect(next.players.p2.hand).toEqual([]);
    expect(abilityEventIds(next)).toContain("bank-wraith-attack-discard");
  });
});

// ===========================================================================
// Dragon Utopia Faerie Dragons — while Stacked, the enemy cannot cast spells.
// ===========================================================================

describe("Dragon Utopia Faerie Dragons: enemy spell lock (while Stacked)", () => {
  it("hasSpellCastLock is false un-Stacked and true Stacked", () => {
    expect(hasSpellCastLock(unitWith(["bank-faerie-dragon-spell-lock"], null))).toBe(false);
    expect(hasSpellCastLock(unitWith(["bank-faerie-dragon-spell-lock"], "attack"))).toBe(true);
  });

  function lockScene(stacked: boolean): GameState {
    const state = createInitialGameState("bank-faerie-lock");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const faerie = state.combat!.units.unit_p2_skeletons;
    faerie.abilities = ["bank-faerie-dragon-spell-lock"];
    faerie.stackToken = stacked ? "attack" : null;
    return state;
  }

  function spellOffered(state: GameState): boolean {
    return getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
  }

  it("offers no Spell cast while a Stacked enemy Faerie Dragons lives, but does once it is un-Stacked", () => {
    expect(spellOffered(lockScene(true))).toBe(false);
    expect(spellOffered(lockScene(false))).toBe(true);
  });

  it("rejects a forced cast at resolution while locked (backstop), but allows it un-Stacked", () => {
    const locked = applyAction(lockScene(true), {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    expect(locked.errors.length).toBeGreaterThan(0);

    const open = applyAction(lockScene(false), {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    expect(open.errors).toEqual([]);
  });
});
