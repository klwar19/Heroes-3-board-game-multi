import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { makeCombatUnitFromNeutral } from "./adventure";
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
import { markUnitRemovedIfNeeded } from "./combat-units";
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

  function attackAndCheck(opts: { stacked: boolean; adjacent: boolean }): GameState {
    const state = createInitialGameState("bank-medusa-paralyze");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["bank-medusa-paralyze-stacked"];
    attacker.stackToken = opts.stacked ? "attack" : null;
    attacker.attack = 8; // high enough that even a long-range shot clearly lands
    attacker.type = "ranged"; // a Medusa is a ranged unit (can shoot OR melee)
    attacker.position = 1;
    // Clear the lane so a far shot has a clean line and no cell clash.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.id !== attacker.id && unit.id !== "unit_p2_skeletons") {
        unit.position = -1;
      }
    }
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    // Adjacent (melee, position 2) petrifies; a distant shot (position 9, a
    // straight ranged hit two rows down) must NOT.
    defender.position = opts.adjacent ? 2 : 9;
    defender.defense = 0;
    defender.maxHealth = 30;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0, 0, 0]);
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  it("a Stacked Medusa paralyzes an ADJACENT target it attacks (melee)", () => {
    const next = attackAndCheck({ stacked: true, adjacent: true });
    expect(hasToken(next.combat!.units.unit_p2_skeletons, "paralysis")).toBe(true);
    expect(abilityEventIds(next)).toContain("bank-medusa-paralyze-stacked");
  });

  it("a Stacked Medusa's RANGED shot at a distant target deals damage but does NOT paralyze", () => {
    const next = attackAndCheck({ stacked: true, adjacent: false });
    const target = next.combat!.units.unit_p2_skeletons;
    // The shot landed (the attack resolved)…
    expect(target.damage).toBeGreaterThan(0);
    // …but a down-range shot petrifies nobody (the adjacency gate).
    expect(hasToken(target, "paralysis")).toBe(false);
    expect(abilityEventIds(next)).not.toContain("bank-medusa-paralyze-stacked");
  });

  it("an un-Stacked Medusa does NOT paralyze even attacking adjacent", () => {
    const next = attackAndCheck({ stacked: false, adjacent: true });
    expect(hasToken(next.combat!.units.unit_p2_skeletons, "paralysis")).toBe(false);
    expect(abilityEventIds(next)).not.toContain("bank-medusa-paralyze-stacked");
  });
});

// ===========================================================================
// Crypt / Shipwreck Wraiths — on attack, the enemy discards a card from hand.
// ===========================================================================

describe("Crypt / Shipwreck Wraiths: enemy discard on attack", () => {
  /**
   * Mints p1's Griffins as a Wraith (Soul Siphon) at position 1 attacking p2's
   * Skeletons at the adjacent position 2 (a fat 30-Health target, so the blow is
   * never lethal and combat stays open for the follow-up). The enemy of the
   * attacker (p1) is p2, so the Soul Siphon discard choice belongs to p2.
   */
  function wraithAttack(p2Hand: string[]): GameState {
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
    state.players.p2.hand = [...p2Hand];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0]);
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  it("getOnAttackEnemyDiscard reports a 1-card discard (un-gated by Stack state)", () => {
    expect(getOnAttackEnemyDiscard(unitWith(["bank-wraith-attack-discard"], null))).toMatchObject({ count: 1 });
    expect(getOnAttackEnemyDiscard(unitWith([], null))).toBeNull();
  });

  it("lets the ATTACKED player CHOOSE which card leaves their hand", () => {
    // Three cards in hand — the discard is the attacked player's decision, so
    // the EXACT card they pick (not a random one) is what ends up discarded.
    let state = wraithAttack(["stat.power", "stat.attack", "spell.magic_arrow"]);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("COMBAT_HAND_DISCARD");
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      return;
    }
    expect(choice.kind).toBe("wraith-choose-discard");
    // The choice belongs to the DEFENDER (p2), not the attacking player (p1).
    expect(choice.playerId).toBe("p2");
    // Every card in hand is selectable — and there is NO random option offered.
    expect(new Set(choice.powerCardIds)).toEqual(new Set(["stat.power", "stat.attack", "spell.magic_arrow"]));
    const legal = getLegalActions(state, "p2");
    const discardActions = legal.filter((entry) => entry.action.type === "RESOLVE_COMBAT_DISCARD");
    expect(discardActions).toHaveLength(3); // three cards, no "random" arm
    expect(
      discardActions.some(
        (entry) => entry.action.type === "RESOLVE_COMBAT_DISCARD" && entry.action.cardId === "random"
      )
    ).toBe(false);

    state = applyOk(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p2",
      choiceId: choice.id,
      cardId: "stat.attack"
    });

    // The chosen card — and only it — leaves the hand for the discard pile.
    expect(state.players.p2.discard).toContain("stat.attack");
    expect(state.players.p2.hand).toEqual(["stat.power", "spell.magic_arrow"]);
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("combat");
    expect(abilityEventIds(state)).toContain("bank-wraith-attack-discard");
  });

  it("rejects a 'random' resolution — the Soul Siphon is always a chosen card", () => {
    const state = wraithAttack(["stat.power", "stat.attack"]);
    const choice = state.pendingChoice;
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      throw new Error("expected the Soul Siphon choice");
    }
    const wrong = applyAction(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p2",
      choiceId: choice.id,
      cardId: "random"
    });
    expect(wrong.errors.length).toBeGreaterThan(0);
    // Nothing discarded: the card only leaves on a valid chosen pick.
    expect(wrong.state.players.p2.hand).toHaveLength(2);
  });

  it("only the attacked player may resolve the discard", () => {
    const state = wraithAttack(["stat.power", "stat.attack"]);
    const choice = state.pendingChoice;
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      throw new Error("expected the Soul Siphon choice");
    }
    // p1 (the attacker) cannot answer for p2.
    const wrong = applyAction(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p1",
      choiceId: choice.id,
      cardId: "stat.power"
    });
    expect(wrong.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: an empty hand is a no-op — no choice opens, nothing discarded", () => {
    const state = wraithAttack([]);
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p2.hand).toHaveLength(0);
    expect(state.players.p2.discard).toHaveLength(0);
    // The combat never parked on a discard choice — it resolved through.
    expect(state.phase).not.toBe("choice");
  });
});

// ===========================================================================
// Crypt / Shipwreck Wraiths — the Soul Siphon fires on a RETALIATION Attack
// too: "Whenever this unit attacks" covers its counter-blow, so the unit that
// provoked the retaliation discards a card of THEIR choice. The park happens
// mid-sequence (inside the retaliation's finishResolvedAttack) and must resume
// EXACTLY where it paused — the original attacker's activation concludes and
// combat continues.
// ===========================================================================

describe("Crypt / Shipwreck Wraiths: enemy discard on RETALIATION", () => {
  /**
   * p1's Griffins (no ability, attack 1) attack p2's Skeletons minted as a Wraith
   * (Soul Siphon, attack 1). Both are fat-Health (30) so neither blow is lethal:
   * the Wraith survives to RETALIATE, and its Retaliation Attack triggers the
   * Soul Siphon against p1 — the unit that provoked the counter — so p1 holds the
   * discard choice.
   */
  function wraithRetaliation(p1Hand: string[]): GameState {
    const state = createInitialGameState("bank-wraith-retaliation");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.attack = 1;
    attacker.position = 1;
    attacker.maxHealth = 30;
    attacker.damage = 0;
    const wraith = state.combat!.units.unit_p2_skeletons;
    wraith.abilities = ["bank-wraith-attack-discard"];
    wraith.attack = 1;
    wraith.position = 2; // adjacent to 1
    wraith.maxHealth = 30;
    wraith.damage = 0;
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0, 0, 0, 0, 0]);
    return settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
  }

  it("fires the Soul Siphon for the ATTACKING player when the Wraith RETALIATES", () => {
    let state = wraithRetaliation(["stat.power", "stat.attack", "spell.magic_arrow"]);
    // The Wraith actually retaliated (this whole path is the retaliation).
    expect(state.eventLog.some((event) => event.type === "RETALIATION_ATTACKED")).toBe(true);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("COMBAT_HAND_DISCARD");
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      return;
    }
    expect(choice.kind).toBe("wraith-choose-discard");
    // The discard belongs to p1 — the unit that ATTACKED the Wraith — not p2.
    expect(choice.playerId).toBe("p1");
    expect(new Set(choice.powerCardIds)).toEqual(new Set(["stat.power", "stat.attack", "spell.magic_arrow"]));

    state = applyOk(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p1",
      choiceId: choice.id,
      cardId: "stat.attack"
    });

    // The chosen card — and only it — lands in p1's discard.
    expect(state.players.p1.discard).toContain("stat.attack");
    expect(state.players.p1.hand).toEqual(["stat.power", "spell.magic_arrow"]);
    expect(abilityEventIds(state)).toContain("bank-wraith-attack-discard");

    // The mid-sequence park resumed correctly: the choice is gone, combat
    // continues, the original attacker still acted, and the Wraith's counter is
    // spent (retaliatedThisRound). Nothing was stranded.
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("combat");
    expect(state.combat!.units.unit_p1_griffins.attackedThisActivation).toBe(true);
    expect(state.combat!.units.unit_p2_skeletons.retaliatedThisRound).toBe(true);
  });

  it("CONTROL: a RETALIATION with an empty hand no-ops — no choice, combat continues", () => {
    const state = wraithRetaliation([]);
    // The retaliation still fired…
    expect(state.eventLog.some((event) => event.type === "RETALIATION_ATTACKED")).toBe(true);
    // …but with no hand to raid, nothing parked and nothing was discarded.
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).not.toBe("choice");
    expect(state.players.p1.discard).toHaveLength(0);
    expect(state.combat!.units.unit_p2_skeletons.retaliatedThisRound).toBe(true);
  });
});

// ===========================================================================
// Crypt Skeletons — Rebirth: once per combat, a killing blow leaves it at 1 HP.
// Rebirth resolves before either a Stack Token or a Pack side is lost.
// ===========================================================================

describe("Crypt Skeletons: Rebirth (once per combat)", () => {
  function lethalHitOnBankSkeleton(): GameState {
    const state = createInitialGameState("bank-skeleton-rebirth");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.attack = 10;
    attacker.position = 1;
    const skeleton = state.combat!.units.unit_p2_skeletons;
    // Mint it as the Crypt bank card: bank unit, neutral variant (not Pack — so
    // it never flips down), Rebirth, 2 Health, no Stack Token.
    skeleton.abilities = ["phoenix-rebirth"];
    skeleton.bankUnit = true;
    skeleton.variant = "neutral";
    skeleton.stackToken = null;
    skeleton.defense = 0;
    skeleton.attack = 0;
    skeleton.maxHealth = 2;
    skeleton.damage = 0;
    skeleton.position = 2; // adjacent to 1
    skeleton.usedRebirthThisCombat = false;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, [0, 0, 0, 0]);
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  it("survives a killing blow at 1 Health and fires the Rebirth ability", () => {
    const next = lethalHitOnBankSkeleton();
    const skeleton = next.combat!.units.unit_p2_skeletons;
    // Clung to life: alive, at exactly 1 Health (maxHealth 2, damage 1).
    expect(skeleton.damage).toBeLessThan(skeleton.maxHealth);
    expect(skeleton.maxHealth - skeleton.damage).toBe(1);
    expect(skeleton.usedRebirthThisCombat).toBe(true);
    expect(abilityEventIds(next)).toContain("phoenix-rebirth");
  });

  it("a second killing blow this combat removes it (Rebirth is once per combat)", () => {
    const next = lethalHitOnBankSkeleton();
    const skeleton = next.combat!.units.unit_p2_skeletons;
    skeleton.damage = skeleton.maxHealth + 5; // lethal again, same combat
    markUnitRemovedIfNeeded(next, skeleton);
    expect(skeleton.damage).toBeGreaterThanOrEqual(skeleton.maxHealth);
    expect(next.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === "unit_p2_skeletons")).toBe(true);
  });
});

// ===========================================================================
// Rebirth keeps a dying unit on its CURRENT side AND its Stack Token — a Pack
// unit stays Pack at 1 HP (never flips to Few) and a Stacked bank card stays
// Stacked at 1 HP (never discards its token), "going down only on the NEXT
// lethal hit". Ordering: Rebirth resolves FIRST — before the Stack Token absorb
// AND before the Pack→Few flip — for EVERY unit, bank or not.
// ===========================================================================

describe("Rebirth keeps the unit on its current side (Pack stays Pack)", () => {
  function killRebirthUnit(opts: { variant: "few" | "pack" | "neutral"; bankUnit?: boolean }): CombatUnitState {
    const state = createInitialGameState("rebirth-side");
    const unit = state.combat!.units.unit_p2_skeletons; // necropolis.skeletons HAS a Few side to flip to
    unit.abilities = ["phoenix-rebirth"];
    unit.variant = opts.variant;
    unit.bankUnit = opts.bankUnit;
    unit.stackToken = null;
    unit.usedRebirthThisCombat = false;
    unit.maxHealth = 8;
    unit.damage = 99; // lethal
    markUnitRemovedIfNeeded(state, unit);
    return unit;
  }

  it("a non-bank Pack unit with Rebirth stays Pack at 1 HP (does not flip to Few)", () => {
    const unit = killRebirthUnit({ variant: "pack" });
    expect(unit.variant).toBe("pack");
    expect(unit.usedRebirthThisCombat).toBe(true);
    expect(unit.maxHealth - unit.damage).toBe(1);
  });

  it("a bank Pack unit with Rebirth stays Pack at 1 HP (does not flip to Few)", () => {
    const unit = killRebirthUnit({ variant: "pack", bankUnit: true });
    expect(unit.variant).toBe("pack");
    expect(unit.usedRebirthThisCombat).toBe(true);
    expect(unit.maxHealth - unit.damage).toBe(1);
  });

  it("a Pack unit WITHOUT Rebirth still flips Pack→Few (the flip is intact)", () => {
    const state = createInitialGameState("rebirth-side-control");
    const unit = state.combat!.units.unit_p2_skeletons;
    unit.abilities = []; // no Rebirth
    unit.variant = "pack";
    unit.bankUnit = undefined as never;
    unit.usedRebirthThisCombat = false;
    unit.maxHealth = 8;
    unit.damage = 99;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.variant).toBe("few"); // control: the Pack→Few flip is untouched
  });
});

// ===========================================================================
// A Stacked Crypt Skeleton (the "Pack" of a bank card) Rebirths FIRST and KEEPS
// its Stack Token, going down (discarding the token) only on the NEXT lethal
// hit — the reported "skeleton bank only works for few, not the pack (dies into
// few)" fix. Driven through the real bank build so the token + Rebirth come from
// the engine, not hand-set fields.
// ===========================================================================

describe("Stacked Crypt Skeleton: Rebirth keeps the Pack (Stack Token), goes down next hit", () => {
  function stackedBankSkeleton(): { state: GameState; skeleton: CombatUnitState } {
    const state = createInitialGameState("stacked-skeleton-rebirth");
    const skeleton = state.combat!.units.unit_p2_skeletons;
    // Mint it as the Crypt bank card carrying a Stack Token (the "Pack").
    skeleton.unitDefId = "neutral.skeletons";
    skeleton.bankUnit = true;
    skeleton.variant = "neutral";
    skeleton.abilities = ["phoenix-rebirth"];
    skeleton.usedRebirthThisCombat = false;
    skeleton.stackToken = "health"; // Stacked
    skeleton.maxHealth = 3; // 2 base + 1 health token
    skeleton.damage = 0;
    return { state, skeleton };
  }

  it("hit 1 → Rebirth fires, the Stack Token is KEPT (stays Stacked at 1 Health)", () => {
    const { state, skeleton } = stackedBankSkeleton();
    skeleton.damage = skeleton.maxHealth; // lethal
    markUnitRemovedIfNeeded(state, skeleton);
    expect(skeleton.usedRebirthThisCombat).toBe(true);
    expect(skeleton.stackToken).toBe("health"); // the Pack is preserved — NOT discarded
    expect(skeleton.maxHealth - skeleton.damage).toBe(1); // clings to life at 1 Health
    expect(abilityEventIds(state)).toContain("phoenix-rebirth");
    // It did NOT spend the token this hit.
    expect(state.eventLog.some((e) => e.type === "STACK_TOKEN_DISCARDED")).toBe(false);
  });

  it("a real 5-damage attack leaves the actual bank Skeleton Stacked at 1 HP", () => {
    const state = createInitialGameState("stacked-skeleton-five-damage");
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = [];
    attacker.attack = 5;
    attacker.position = 1;

    // Construct from the real Creature Bank side so Rebirth comes from the
    // Crypt Skeleton data, then add the health Stack Token exactly as setup does.
    const skeleton = makeCombatUnitFromNeutral(
      { unitDefId: "neutral.skeletons", tier: "bronze", bankUnit: true },
      "unit_p2_skeletons",
      13,
      "binh"
    )!;
    skeleton.controllerId = "p2";
    skeleton.stackToken = "health";
    skeleton.maxHealth = 3; // printed 2 HP + the health Stack Token
    state.combat!.units.unit_p2_skeletons = skeleton;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    script(state, [0]); // Attack 5 + die 0 - Defense 0 = exactly 5 damage

    const next = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: attacker.id,
        defenderId: skeleton.id
      })
    );
    const after = next.combat!.units.unit_p2_skeletons;
    const assigned = [...next.eventLog].reverse().find(
      (event): event is Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }> =>
        event.type === "DAMAGE_ASSIGNED" && event.target.type === "unit" && event.target.unitId === after.id
    );

    expect(assigned?.amount).toBe(5);
    expect(after.usedRebirthThisCombat).toBe(true);
    expect(after.stackToken).toBe("health");
    expect(after.maxHealth - after.damage).toBe(1);
    expect(abilityEventIds(next)).toContain("phoenix-rebirth");
    expect(next.eventLog.some((event) => event.type === "STACK_TOKEN_DISCARDED" && event.unitId === after.id)).toBe(false);
    expect(next.eventLog.some((event) => event.type === "UNIT_FLIPPED" && event.unitId === after.id)).toBe(false);
  });

  it("hit 2 → Rebirth is spent, NOW the Stack Token absorbs (drops to the un-stacked card)", () => {
    const { state, skeleton } = stackedBankSkeleton();
    skeleton.damage = skeleton.maxHealth;
    markUnitRemovedIfNeeded(state, skeleton); // hit 1: rebirth, keeps token
    skeleton.damage = skeleton.maxHealth; // hit 2: lethal again
    markUnitRemovedIfNeeded(state, skeleton);
    expect(skeleton.stackToken).toBeNull(); // token now discarded
    expect(skeleton.maxHealth).toBe(2); // reverted to the bare bank card
    expect(skeleton.damage).toBeLessThan(skeleton.maxHealth); // still alive (the un-stacked "few")
    expect(state.eventLog.some((e) => e.type === "STACK_TOKEN_DISCARDED")).toBe(true);
    expect(state.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === "unit_p2_skeletons")).toBe(false);
  });

  it("hit 3 → finally removed (Rebirth spent, token spent)", () => {
    const { state, skeleton } = stackedBankSkeleton();
    for (let i = 0; i < 3; i += 1) {
      skeleton.damage = skeleton.maxHealth;
      markUnitRemovedIfNeeded(state, skeleton);
    }
    expect(state.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === "unit_p2_skeletons")).toBe(true);
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
