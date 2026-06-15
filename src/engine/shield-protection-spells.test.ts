import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { CardPlayMode, GameAction, GameState, UnitId, UnitType } from "./state";

/**
 * Engine tests for the Tower-expansion / stretch-goal defensive spells. Each
 * rule is engine-enforced; every test fails if the wiring is removed.
 *
 *  - Shield      (Basic Earth) — Ongoing +Defense vs a GROUND or FLYING attacker
 *                                until the end of the Combat (Power 0/1/2 →
 *                                +1/+2/+3); a ranged attacker is unaffected.
 *  - Air Shield  (Basic Air)   — Ongoing +Defense vs a RANGED attacker until the
 *                                end of the Combat (Power 0/1/2 → +1/+2/+3); a
 *                                ground/flying attacker is unaffected.
 *  - Protection from Air/Earth/Fire/Water (Basic, one per School) — Resistance
 *                                for a single School: the instant ends an enemy
 *                                Spell of that School (basic play a Basic Spell,
 *                                expert play a Basic or an Expert Spell). A
 *                                School-agnostic Spell (Magic Arrow) is never
 *                                touched.
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
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Passes priority until `playerId` holds it (or the window closes). */
function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety > 0) {
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

function reactionOffered(
  state: GameState,
  playerId: "p1" | "p2",
  cardId: string,
  mode: CardPlayMode
): boolean {
  return getLegalActions(state, playerId).some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (legal.action.mode ?? "basic") === mode &&
      !legal.action.asPowerBoost
  );
}

// ===========================================================================
// Shield / Air Shield — cast wiring: the conditional-defense effect created.
// ===========================================================================

describe("Shield / Air Shield cast", () => {
  /** Casts the spell on a friendly unit at the given Power; returns the effect. */
  function castOnCrusaders(cardId: string, power: number) {
    const state = createInitialGameState(`${cardId}-${power}`);
    // Spare Power statistics open the caster's Empower window so the cast waits on
    // the stack, where the test sets the Power actually paid (see wiki-spells).
    state.players.p1.hand = [cardId, "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const cast = findCast(state, "p1", cardId, "unit_p1_crusaders");
    expect(cast, `${cardId} should be a legal cast on a friendly unit`).toBeTruthy();
    const casted = applyOk(state, cast!.action);
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    const result = passAllReactions(casted);
    return result.activeEffects.find(
      (effect) =>
        effect.target?.type === "unit" &&
        effect.target.unitId === "unit_p1_crusaders" &&
        effect.modifiers.some((modifier) => modifier.type === "DEFENSE_VS_ATTACKER_TYPE")
    );
  }

  it("Shield creates a combat-long Defense buff vs ground/flying attackers (Power 0 → +1)", () => {
    const effect = castOnCrusaders("spell.shield", 0);
    expect(effect, "Shield should create a conditional defense effect").toBeTruthy();
    expect(effect!.duration.type).toBe("combat");
    const modifier = effect!.modifiers.find((m) => m.type === "DEFENSE_VS_ATTACKER_TYPE");
    expect(modifier).toMatchObject({ type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: "ground-or-flying", amount: 1 });
  });

  it("Air Shield creates a combat-long Defense buff vs ranged attackers (Power 0 → +1)", () => {
    const effect = castOnCrusaders("spell.air_shield", 0);
    expect(effect, "Air Shield should create a conditional defense effect").toBeTruthy();
    expect(effect!.duration.type).toBe("combat");
    const modifier = effect!.modifiers.find((m) => m.type === "DEFENSE_VS_ATTACKER_TYPE");
    expect(modifier).toMatchObject({ type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: "ranged", amount: 1 });
  });

  it("the Defense bonus scales with Power (0/1/2 → +1/+2/+3) for both spells", () => {
    for (const cardId of ["spell.shield", "spell.air_shield"]) {
      expect(castOnCrusaders(cardId, 0)!.modifiers.find((m) => m.type === "DEFENSE_VS_ATTACKER_TYPE")).toMatchObject({ amount: 1 });
      expect(castOnCrusaders(cardId, 1)!.modifiers.find((m) => m.type === "DEFENSE_VS_ATTACKER_TYPE")).toMatchObject({ amount: 2 });
      expect(castOnCrusaders(cardId, 2)!.modifiers.find((m) => m.type === "DEFENSE_VS_ATTACKER_TYPE")).toMatchObject({ amount: 3 });
    }
  });
});

// ===========================================================================
// Shield / Air Shield — application: the bonus only bites a matching attacker.
// ===========================================================================

describe("Shield / Air Shield in combat", () => {
  /**
   * One attack of `attackerType` on a crusaders defender that may carry a shield
   * effect; returns the damage dealt. Attacker and defender are adjacent, so the
   * shield keys purely on the attacker's UNIT TYPE (a ranged unit attacking
   * adjacent is still "ranged"), never the melee/ranged attack kind.
   */
  function damageWithShield(
    attackerType: UnitType,
    shield: { attackerType: "ground-or-flying" | "ranged"; amount: number } | null
  ): number {
    const state = createInitialGameState(`shield-fight-${attackerType}-${shield?.attackerType ?? "none"}`);
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    const defender = state.combat!.units.unit_p1_crusaders;
    attacker.abilities = [];
    defender.abilities = [];
    attacker.type = attackerType;
    attacker.position = 9;
    defender.position = 13; // adjacent
    attacker.attack = 6;
    defender.defense = 2;
    attacker.maxHealth = 40;
    defender.maxHealth = 40;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    attacker.activatedThisRound = false;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    if (shield) {
      state.activeEffects.push({
        id: `shield_${shield.attackerType}`,
        name: "Shield",
        scope: "unit",
        duration: { type: "combat" },
        polarity: "positive",
        removable: true,
        modifiers: [{ type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: shield.attackerType, amount: shield.amount }],
        source: { type: "system" },
        controllerId: "p1",
        target: { type: "unit", unitId: "unit_p1_crusaders" },
        startedRound: state.round,
        startedCombatRound: state.combat!.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      });
    }

    const attacked = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    return passAllReactions(attacked).combat!.units.unit_p1_crusaders.damage;
  }

  it("baseline (no shield): 6 attack − 2 defense = 4 damage, whatever the attacker type", () => {
    expect(damageWithShield("ground", null)).toBe(4);
    expect(damageWithShield("flying", null)).toBe(4);
    expect(damageWithShield("ranged", null)).toBe(4);
  });

  it("Shield (+3) cuts a ground OR flying attacker (4 → 1) but not a ranged one", () => {
    expect(damageWithShield("ground", { attackerType: "ground-or-flying", amount: 3 })).toBe(1);
    expect(damageWithShield("flying", { attackerType: "ground-or-flying", amount: 3 })).toBe(1);
    // A ranged attacker slips past Shield — the bonus never applies.
    expect(damageWithShield("ranged", { attackerType: "ground-or-flying", amount: 3 })).toBe(4);
  });

  it("Air Shield (+3) cuts a ranged attacker (4 → 1) but not a ground/flying one", () => {
    expect(damageWithShield("ranged", { attackerType: "ranged", amount: 3 })).toBe(1);
    // A melee (ground/flying) attacker slips past Air Shield.
    expect(damageWithShield("ground", { attackerType: "ranged", amount: 3 })).toBe(4);
    expect(damageWithShield("flying", { attackerType: "ranged", amount: 3 })).toBe(4);
  });

  it("the magnitude tracks the bonus (+1 → 3 damage, +2 → 2 damage)", () => {
    expect(damageWithShield("ground", { attackerType: "ground-or-flying", amount: 1 })).toBe(3);
    expect(damageWithShield("ground", { attackerType: "ground-or-flying", amount: 2 })).toBe(2);
  });
});

// ===========================================================================
// Protection from X — Resistance for a single School.
// ===========================================================================

describe("Protection from X spells", () => {
  /** p1 casts `spellId` on p2's vampires; returns the state with p2 on priority. */
  function castOnVampires(seed: string, spellId: string, p2Hand: string[]): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [spellId];
    state.players.p2.hand = p2Hand;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", spellId, "unit_p2_vampires");
    expect(cast, `${spellId} should be castable on an enemy unit`).toBeTruthy();
    return passUntil(applyOk(state, cast!.action), "p2");
  }

  it("Protection from Air ends an enemy Basic Air spell (Lightning Bolt deals 0)", () => {
    const onP2 = castOnVampires("prot-air-cancel", "spell.lightning_bolt", ["spell.protection_from_air"]);
    expect(reactionOffered(onP2, "p2", "spell.protection_from_air", "basic")).toBe(true);
    const result = passAllReactions(
      applyOk(onP2, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.protection_from_air", mode: "basic" })
    );
    expect(result.reactionWindow).toBeNull();
    expect(result.stack).toEqual([]);
    expect(result.combat!.units.unit_p2_vampires.damage).toBe(0);
    expect(result.players.p2.discard).toContain("spell.protection_from_air");
    expect(result.eventLog.find((event) => event.type === "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByPlayerId: "p2",
      cancelledByCardId: "spell.protection_from_air"
    });
  });

  it("is School-locked: Protection from Fire is NOT offered against an Air spell", () => {
    const onP2 = castOnVampires("prot-wrong-school", "spell.lightning_bolt", [
      "spell.protection_from_fire",
      "spell.protection_from_air"
    ]);
    expect(reactionOffered(onP2, "p2", "spell.protection_from_fire", "basic")).toBe(false);
    // The matching School is still offered, proving the gate is School-specific.
    expect(reactionOffered(onP2, "p2", "spell.protection_from_air", "basic")).toBe(true);
  });

  it("never touches a School-agnostic spell (Magic Arrow is not 'from a School')", () => {
    const onP2 = castOnVampires("prot-any", "spell.magic_arrow", [
      "spell.protection_from_air",
      "spell.protection_from_fire",
      "spell.protection_from_earth",
      "spell.protection_from_water"
    ]);
    for (const school of ["air", "fire", "earth", "water"]) {
      expect(reactionOffered(onP2, "p2", `spell.protection_from_${school}`, "basic")).toBe(false);
    }
  });

  it("the basic play ends a Basic spell of its School (Slow → no Slow effect)", () => {
    const state = createInitialGameState("prot-earth-basic");
    state.players.p1.hand = ["spell.slow"];
    state.players.p2.hand = ["spell.protection_from_earth"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.slow", "unit_p2_vampires");
    const onP2 = passUntil(applyOk(state, cast!.action), "p2");
    expect(reactionOffered(onP2, "p2", "spell.protection_from_earth", "basic")).toBe(true);
    const result = passAllReactions(
      applyOk(onP2, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.protection_from_earth", mode: "basic" })
    );
    // The Slow never created an initiative debuff on the vampires.
    expect(
      result.activeEffects.some(
        (effect) => effect.target?.type === "unit" && effect.target.unitId === "unit_p2_vampires"
      )
    ).toBe(false);
    expect(result.eventLog.find((event) => event.type === "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByCardId: "spell.protection_from_earth"
    });
  });

  it("is level-gated: basic Protection cannot end an Expert spell, but the expert play can", () => {
    // Implosion is an Expert Earth spell. Basic Protection from Earth must not
    // reach it; the expert play (spending a crown) ends it.
    const onP2 = castOnVampires("prot-earth-expert", "spell.implosion", ["spell.protection_from_earth"]);
    expect(reactionOffered(onP2, "p2", "spell.protection_from_earth", "basic")).toBe(false);
    expect(reactionOffered(onP2, "p2", "spell.protection_from_earth", "expert")).toBe(true);

    const result = passAllReactions(
      applyOk(onP2, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.protection_from_earth", mode: "expert" })
    );
    expect(result.stack).toEqual([]);
    expect(result.eventLog.find((event) => event.type === "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByCardId: "spell.protection_from_earth"
    });
  });

  it("reverses a matching-School enemy Spell instant on an attack (Curse undone)", () => {
    // p1's griffins attack p2's skeletons; p1 casts Curse (Fire) to drop the
    // skeletons' Defense. p2 answers with Protection from Fire, undoing the Curse
    // so the skeletons keep their printed Defense.
    const state = createInitialGameState("prot-fire-instant");
    state.players.p1.hand = ["spell.curse"];
    state.players.p2.hand = ["spell.protection_from_fire", "spell.protection_from_air"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.position = 9;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.position = 13;
    skeletons.defense = 5;
    skeletons.maxHealth = 40;
    griffins.attack = 6;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const cursed = passUntil(
      applyOk(declared, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.curse", mode: "basic" }),
      "p2"
    );
    // Protection from Air does not match a Fire instant; Protection from Fire does.
    expect(reactionOffered(cursed, "p2", "spell.protection_from_air", "basic")).toBe(false);
    expect(reactionOffered(cursed, "p2", "spell.protection_from_fire", "basic")).toBe(true);

    const result = passAllReactions(
      applyOk(cursed, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.protection_from_fire", mode: "basic" })
    );
    // Curse (−1 defense) reversed → full Defense 5 stands: 6 attack − 5 = 1 damage.
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(result.eventLog.find((event) => event.type === "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByCardId: "spell.protection_from_fire"
    });
  });
});
