import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { spellRedirectTargets } from "./legal-actions";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * POLISH BANK-SPELL RULE: selected control / enchantment spells MAY affect a tierless
 * Creature-Bank unit (a bank GUARD such as the Nagas in a Naga Bank, AND a won
 * "gain a unit" bank REWARD card such as Dragon Flies). By default every tier-gated
 * spell treats a `bankUnit` as gradeless ∞ and silently drops it from the target
 * list; only with the Polish Balance Pack on does `bankAwareTierGateRank` rank a
 * bank unit. Counterstrike, Magic Mirror, Frenzy, Sacrifice, Resurrection, Clone
 * and Blind require the spell's HIGHEST Power rung; Anti-Magic, Sorrow and
 * Disrupting Ray keep their underlying-grade gate. Other tier-gated spells stay
 * blocked. Each
 * "reachable" test below is paired with a rule-OFF CONTROL proving the spell is NOT
 * offered on the bank unit without the Polish rule.
 *
 * Sandbox grades (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 * Marking a sandbox unit `bankUnit` (grade kept) models a bank guard / reward card,
 * exercising the exact tier-gate code path.
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

function findCast(state: GameState, playerId: PlayerId, cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, optionIndex: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      !legal.action.asPowerBoost
  );
}

/** Marks a sandbox combat unit as a Creature-Bank unit (guard or won reward). */
function makeBankUnit(state: GameState, unitId: UnitId): void {
  const unit = state.combat!.units[unitId];
  unit.bankUnit = true;
}

/**
 * Freezes the `polish-bank-unit-spells` flag onto the sandbox. `houseRuleEnabled`
 * reads `state.adventure?.houseRules` and nothing else, and a sandbox combat never
 * runs the adventure finalize path, so this is enough to drive the rule. It does
 * NOT enable the Balance Pack reprints, so the spell cards keep their base Power
 * ladders here.
 */
function withPolishBalance(state: GameState, enabled = true): GameState {
  state.adventure = {
    houseRules: { "polish-bank-unit-spells": enabled }
  } as unknown as GameState["adventure"];
  return state;
}

// ---------------------------------------------------------------------------
// Anti-Magic on your OWN bank reward unit (models a bronze Dragon Flies card)
// ---------------------------------------------------------------------------

describe("Anti-Magic on a bank unit", () => {
  function castAntiMagic(targetUnitId: UnitId, power: number, balance = true): GameState {
    const state = withPolishBalance(createInitialGameState("bank-antimagic"), balance);
    makeBankUnit(state, targetUnitId);
    state.players.p1.hand = ["spell.anti_magic", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.anti_magic", targetUnitId);
    if (!cast) {
      return state; // caller asserts the cast was (not) offered
    }
    const casted = applyOk(state, cast.action);
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    return passAllReactions(casted);
  }

  function spellImmuneMaxGrade(state: GameState, unitId: UnitId): string | undefined {
    const effect = state.activeEffects.find(
      (e) => e.target?.type === "unit" && e.target.unitId === unitId && e.modifiers.some((m) => m.type === "UNIT_SPELL_IMMUNE")
    );
    const modifier = effect?.modifiers.find((m) => m.type === "UNIT_SPELL_IMMUNE");
    return modifier && modifier.type === "UNIT_SPELL_IMMUNE" ? modifier.maxGrade : undefined;
  }

  it("can ward a BRONZE bank reward unit at 2 Power (the reported Dragon Flies case)", () => {
    // marksmen = p1 bronze. bronze(0) <= silver ceiling(power 2) => reachable.
    const state = withPolishBalance(createInitialGameState("bank-antimagic"));
    makeBankUnit(state, "unit_p1_marksmen");
    state.players.p1.hand = ["spell.anti_magic", "stat.power", "stat.power"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(
      findCast(state, "p1", "spell.anti_magic", "unit_p1_marksmen"),
      "Anti-Magic must be castable on your own bank unit"
    ).toBeTruthy();

    const resolved = castAntiMagic("unit_p1_marksmen", 2);
    expect(spellImmuneMaxGrade(resolved, "unit_p1_marksmen"), "the ward actually lands, up to silver").toBe("silver");
  });

  it("CONTROL: with the Polish rule OFF, Anti-Magic is NOT castable on the bank unit", () => {
    const state = withPolishBalance(createInitialGameState("bank-antimagic"), false);
    makeBankUnit(state, "unit_p1_marksmen");
    state.players.p1.hand = ["spell.anti_magic", "stat.power", "stat.power"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(
      findCast(state, "p1", "spell.anti_magic", "unit_p1_marksmen"),
      "without polish-card-balance a bank unit stays ∞-blocked"
    ).toBeUndefined();
  });

  it("still needs enough Power: a SILVER bank unit is NOT warded at 0 Power", () => {
    // crusaders = p1 silver. The offer uses the ladder CEILING (gold), so it is
    // offered — but RESOLUTION at power 0 (bronze) must fizzle: silver(1) > bronze(0).
    // Proves the fix uses the UNDERLYING grade, not a blanket "always land".
    const resolved = castAntiMagic("unit_p1_crusaders", 0);
    expect(
      spellImmuneMaxGrade(resolved, "unit_p1_crusaders"),
      "a bronze-Power cast cannot ward a silver bank unit"
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sorrow on an enemy bank GUARD (models a gold Naga defending a Naga Bank)
// ---------------------------------------------------------------------------

describe("Sorrow on a bank guard", () => {
  function aboutToActivate(targetId: UnitId, p1Hand: string[], balance = true): GameState {
    const state = withPolishBalance(createInitialGameState("bank-sorrow"), balance);
    makeBankUnit(state, targetId);
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== targetId;
    }
    return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
  }

  it("offers the GOLD skip on a gold bank guard, and skips its activation", () => {
    // dread_knights = p2 gold. The gold Sorrow option (index 2, pay 4) must match.
    let state = aboutToActivate("unit_p2_dread_knights", [
      "spell.sorrow",
      "stat.power",
      "stat.power",
      "stat.power",
      "stat.power"
    ]);
    expect(state.combat!.activeUnitId).toBe("unit_p2_dread_knights");
    expect(state.reactionWindow, "the activation-skip window opens over a bank guard").toBeTruthy();

    // Underlying-grade, not blanket-allow: only the GOLD option matches a gold guard.
    expect(reactionFor(state, "p1", "spell.sorrow", 0), "bronze option must NOT reach a gold bank guard").toBeUndefined();
    expect(reactionFor(state, "p1", "spell.sorrow", 1), "silver option must NOT reach a gold bank guard").toBeUndefined();
    const gold = reactionFor(state, "p1", "spell.sorrow", 2);
    expect(gold, "the gold skip is offered on the gold bank guard").toBeTruthy();

    state = applyOk(state, {
      ...gold!.action,
      costCardIds: ["stat.power", "stat.power", "stat.power", "stat.power"]
    } as GameAction);
    // The observable outcome: the gold guard's activation was SKIPPED — a Sorrow
    // skip event fired against it, and it never took its turn (the active unit
    // moved off it). It was the last unit to act, so the round then rolled over.
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "UNIT_ABILITY_TRIGGERED" &&
          event.unitId === "unit_p2_dread_knights" &&
          typeof event.message === "string" &&
          event.message.includes("skips")
      ),
      "the gold Sorrow skipped the gold bank guard's activation"
    ).toBe(true);
    // The guard never got to attack — its activation was skipped, not spent.
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === "unit_p2_dread_knights"
      )
    ).toBe(false);
    expect(state.combat!.activeUnitId).not.toBe("unit_p2_dread_knights");
  });

  it("CONTROL: with the Polish rule OFF, no Sorrow skip is offered on the bank guard", () => {
    const state = aboutToActivate(
      "unit_p2_dread_knights",
      ["spell.sorrow", "stat.power", "stat.power", "stat.power", "stat.power"],
      false
    );
    expect(state.combat!.activeUnitId).toBe("unit_p2_dread_knights");
    // No grade option reaches a ∞-ranked bank guard without the rule.
    expect(reactionFor(state, "p1", "spell.sorrow", 0)).toBeUndefined();
    expect(reactionFor(state, "p1", "spell.sorrow", 1)).toBeUndefined();
    expect(reactionFor(state, "p1", "spell.sorrow", 2)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Blind on an enemy bank guard — Power gate keeps mattering
// ---------------------------------------------------------------------------

describe("Blind on a bank guard", () => {
  function castBlind(power: number, balance = true): GameState {
    const state = withPolishBalance(createInitialGameState("bank-blind"), balance);
    makeBankUnit(state, "unit_p2_dread_knights");
    state.players.p1.hand = ["spell.blind", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.blind", "unit_p2_dread_knights");
    if (!cast) {
      return state;
    }
    const casted = applyOk(state, cast.action);
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    return passAllReactions(casted);
  }

  function hasParalysis(state: GameState, unitId: UnitId): boolean {
    const unit = state.combat!.units[unitId];
    return (unit.tokens ?? []).some((token) => token.kind === "paralysis");
  }

  /**
   * Casts Blind at `power` on `targetId`, with knobs for every axis the 2026-08-25
   * ruling touches. `bank` marks the target a Creature-Bank unit; `balancePack`
   * also switches the Polish Balance Pack reprint on, so the ladder's top rung
   * becomes the printed "ANY" (azure) instead of the base card's gold.
   */
  function castBlindAt(
    targetId: UnitId,
    power: number,
    {
      bank = true,
      bankSpells = true,
      balancePack = false
    }: { bank?: boolean; bankSpells?: boolean; balancePack?: boolean } = {}
  ): GameState {
    const state = createInitialGameState(`bank-blind-${targetId}-${power}-${bank}-${balancePack}`);
    state.adventure = {
      houseRules: { "polish-bank-unit-spells": bankSpells, "polish-card-balance": balancePack }
    } as unknown as GameState["adventure"];
    if (bank) {
      makeBankUnit(state, targetId);
    }
    state.players.p1.hand = ["spell.blind", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.blind", targetId);
    if (!cast) {
      return state;
    }
    const casted = applyOk(state, cast.action);
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    return passAllReactions(casted);
  }

  it("Paralyses a GOLD bank guard at Power 2 (gold), but not at Power 1 (silver)", () => {
    // Blind ladder {0:bronze,1:silver,2:gold}. A gold guard needs Power 2.
    const gold = castBlind(2);
    expect(hasParalysis(gold, "unit_p2_dread_knights"), "gold Power reaches the gold bank guard").toBe(true);

    const silver = castBlind(1);
    expect(hasParalysis(silver, "unit_p2_dread_knights"), "silver Power cannot reach the gold bank guard").toBe(false);
  });

  it("CONTROL: with the Polish rule OFF, Blind is NOT castable on the bank guard", () => {
    const state = withPolishBalance(createInitialGameState("bank-blind"), false);
    makeBankUnit(state, "unit_p2_dread_knights");
    state.players.p1.hand = ["spell.blind", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(
      findCast(state, "p1", "spell.blind", "unit_p2_dread_knights"),
      "without polish-card-balance a bank guard stays ∞-blocked"
    ).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // USER RULING 2026-08-25: "Blind with 0 SP should not work for bank units —
  // only Blind with +2 SP work for any unit." Blind's TOP rung is the one that
  // prints "ANY" (Polish reprint) / the full bronze-silver-gold list (base
  // scan); the sub-top rungs name grades a TIERLESS bank unit does not have,
  // so they reach it at no Power. bankAwareTierGateRank therefore ranks a bank
  // unit at GOLD for PLACE_PARALYSIS — reachable only from the "+2 SP" rung in
  // EITHER pack — instead of at its underlying grade.
  //
  // The cast is still OFFERED on a bank unit at any Power (the target filter
  // uses the ladder's CEILING because Power can be pooled in after the cast is
  // declared — exactly like a non-bank GOLD unit), so every assertion below is
  // by OUTCOME: did the Paralysis token actually land.
  // -------------------------------------------------------------------------

  it("a BRONZE bank guard is Paralysed ONLY by the top +2 Power rung", () => {
    // skeletons = p2 bronze. Before the ruling the bronze rung (Power 0) landed.
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 0), "unit_p2_skeletons"),
      "0 Power must NOT blind a bank unit"
    ).toBe(false);
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 1), "unit_p2_skeletons"),
      "the silver rung must NOT blind a bank unit either"
    ).toBe(false);
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 2), "unit_p2_skeletons"),
      "the top +2 Power rung DOES blind the bank unit"
    ).toBe(true);
  });

  it("a SILVER bank guard likewise needs the top rung, not its own silver rung", () => {
    // vampires = p2 silver: the underlying-grade read used to land at Power 1.
    expect(hasParalysis(castBlindAt("unit_p2_vampires", 1), "unit_p2_vampires")).toBe(false);
    expect(hasParalysis(castBlindAt("unit_p2_vampires", 2), "unit_p2_vampires")).toBe(true);
  });

  it("CONTROL: the SAME bronze unit that is NOT a bank unit is Paralysed at Power 0", () => {
    // Proves the top-rung demand is scoped to bank units (and that skeletons can
    // hold a Paralysis token at all), so the cases above measure the rule.
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 0, { bank: false }), "unit_p2_skeletons"),
      "an ordinary bronze unit keeps its bronze rung at 0 Power"
    ).toBe(true);
    expect(hasParalysis(castBlindAt("unit_p2_vampires", 1, { bank: false }), "unit_p2_vampires")).toBe(true);
  });

  it("with the Polish Balance Pack reprint on (top rung = 'ANY'), only +2 Power blinds a bank guard", () => {
    // The reprint ladder is {0: bronze, 1: silver, 2: azure} — the printed "ANY".
    expect(hasParalysis(castBlindAt("unit_p2_skeletons", 0, { balancePack: true }), "unit_p2_skeletons")).toBe(false);
    expect(hasParalysis(castBlindAt("unit_p2_skeletons", 1, { balancePack: true }), "unit_p2_skeletons")).toBe(false);
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 2, { balancePack: true }), "unit_p2_skeletons"),
      "the 'ANY' rung reaches the tierless bank unit"
    ).toBe(true);
    // CONTROL: the reprint does not change ordinary units' rungs.
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 0, { bank: false, balancePack: true }), "unit_p2_skeletons")
    ).toBe(true);
  });

  it("CONTROL: with the Polish bank rule OFF, even +2 Power never blinds a bank guard", () => {
    expect(
      hasParalysis(castBlindAt("unit_p2_skeletons", 2, { bankSpells: false }), "unit_p2_skeletons"),
      "the top rung is not a back door around the ∞ rank when the rule is off"
    ).toBe(false);
  });

  it("CONTROL: a WOG commander is never Blind-able, at any Power", () => {
    const state = withPolishBalance(createInitialGameState("bank-blind-commander"));
    state.combat!.units.unit_p2_skeletons.commanderSlug = "test-commander";
    state.players.p1.hand = ["spell.blind", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(
      findCast(state, "p1", "spell.blind", "unit_p2_skeletons"),
      "the bank exception never extends to a commander (still ∞-ranked)"
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CONTROL: the OTHER four allowlisted effects keep the 2026-08-18
// underlying-grade read — the 2026-08-25 ruling named Blind only.
// ---------------------------------------------------------------------------

describe("the Blind top-rung rule does not spread to the other four effects", () => {
  it("Anti-Magic still wards a BRONZE bank unit from its bronze rung (Power 0)", () => {
    const state = withPolishBalance(createInitialGameState("bank-antimagic-bronze-rung"));
    makeBankUnit(state, "unit_p1_marksmen"); // p1 bronze
    state.players.p1.hand = ["spell.anti_magic"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.anti_magic", "unit_p1_marksmen");
    expect(cast, "Anti-Magic is offered on the bank unit").toBeTruthy();
    const resolved = passAllReactions(applyOk(state, cast!.action));
    const ward = resolved.activeEffects.find(
      (effect) =>
        effect.target?.type === "unit" &&
        effect.target.unitId === "unit_p1_marksmen" &&
        effect.modifiers.some((modifier) => modifier.type === "UNIT_SPELL_IMMUNE")
    );
    expect(ward, "Anti-Magic keeps the underlying-grade read: bronze bank unit, bronze rung, 0 Power").toBeTruthy();
  });

  it("Sorrow still offers its BRONZE option on a bronze bank guard", () => {
    // dread_knights (gold) needed the gold option above; a BRONZE bank guard must
    // still be reachable from Sorrow's bronze option — i.e. no top-rung demand.
    const state = withPolishBalance(createInitialGameState("bank-sorrow-bronze-rung"));
    makeBankUnit(state, "unit_p2_skeletons");
    state.players.p1.hand = ["spell.sorrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_skeletons";
    }
    const defended = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(defended.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(
      reactionFor(defended, "p1", "spell.sorrow", 0),
      "the free bronze Sorrow option still reaches a bronze bank guard"
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Frenzy on an enemy bank GUARD — the attacker's Defense-ignore reaction.
// Unlike the four control spells above, Frenzy is not a CAST on the target: it
// is an attack-window reaction whose pierced grade is decided at RESOLUTION from
// the caster's pooled Power (`frenzyPierces`). We assert the OBSERVABLE outcome
// (the defender's Defense was ignored — measurable extra damage), not a flag,
// by comparing damage with Frenzy played vs. the same seed with it passed.
// Uses the Polish Balance reprint ladder {0:bronze,1:silver,3:gold}.
// ---------------------------------------------------------------------------

describe("Frenzy on a bank guard", () => {
  /** p1's griffins declare an attack on `targetId`, with `power` standing Power. */
  function declareFrenzyAttack(targetId: UnitId, power: number, bankSpells = true): GameState {
    const state = createInitialGameState(`bank-frenzy-${targetId}-${power}-${bankSpells}`);
    state.adventure = {
      houseRules: { "polish-card-balance": true, "polish-bank-unit-spells": bankSpells }
    } as unknown as GameState["adventure"];
    makeBankUnit(state, targetId);
    for (const unit of Object.values(state.combat!.units)) {
      unit.damage = 0;
      unit.maxHealth = 30;
    }
    const attacker = state.combat!.units.unit_p1_griffins;
    const defender = state.combat!.units[targetId];
    defender.defense = 4;
    attacker.position = 9;
    defender.position = 10;
    attacker.activatedThisRound = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.players.p1.hand = ["spell.frenzy"];
    state.players.p2.hand = [];
    if (power > 0) {
      state.activeEffects.push({
        id: `effect_power_p1_${power}`,
        name: "Test Power",
        scope: "player",
        controllerId: "p1",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SPELL_POWER_BONUS", amount: power }],
        source: { type: "system" },
        startedRound: state.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      } as unknown as GameState["activeEffects"][number]);
    }
    const attack = getLegalActions(state, "p1").find(
      (legal) =>
        (legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_AND_ATTACK_UNIT") &&
        "defenderId" in legal.action &&
        legal.action.defenderId === targetId
    );
    expect(attack, "griffins should be able to attack the bank guard").toBeTruthy();
    return applyOk(state, attack!.action);
  }

  function frenzyOffer(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.frenzy"
    );
  }

  /** Extra damage the Frenzy pierce dealt vs. the same attack with it passed. */
  function pierceDelta(targetId: UnitId, power: number, bankSpells = true): number {
    const withFrenzy = declareFrenzyAttack(targetId, power, bankSpells);
    const offer = frenzyOffer(withFrenzy);
    if (!offer) {
      return -1; // caller distinguishes "not even offered" from "offered, no pierce"
    }
    const played = passAllReactions(applyOk(withFrenzy, offer.action));
    const passed = passAllReactions(declareFrenzyAttack(targetId, power, bankSpells));
    return played.combat!.units[targetId].damage - passed.combat!.units[targetId].damage;
  }

  it("pierces a GOLD bank guard at Power 3 (gold), but NOT at Power 1 (silver)", () => {
    // dread_knights = p2 gold. Polish ladder reaches gold at Power 3 only.
    expect(pierceDelta("unit_p2_dread_knights", 3), "gold Power pierces the gold bank guard").toBeGreaterThan(0);
    expect(pierceDelta("unit_p2_dread_knights", 1), "silver Power cannot pierce the gold bank guard").toBe(0);
  });

  it("requires the highest Power rung even against a BRONZE bank guard", () => {
    expect(pierceDelta("unit_p2_skeletons", 0), "Power 0 must not pierce a bank guard").toBe(0);
    expect(pierceDelta("unit_p2_skeletons", 3), "Power 3 pierces the bank guard").toBeGreaterThan(0);
  });

  it("CONTROL: with the Polish rule OFF, Frenzy never pierces a bank guard, even at Power 3", () => {
    // Offered whenever you attack (Power-scaled form), but resolution keeps the
    // bank guard at ∞ without the rule, so the pierce fizzles — 0 extra damage.
    expect(
      pierceDelta("unit_p2_dread_knights", 3, false),
      "without polish-bank-unit-spells a bank guard's Defense is never ignored"
    ).toBe(0);
  });
});

describe("highest-SP bank spell exceptions", () => {
  function resolvedCast(cardId: string, targetId: UnitId, power: number, enabled = true): GameState {
    const state = withPolishBalance(createInitialGameState(`bank-top-${cardId}-${power}`), enabled);
    makeBankUnit(state, targetId);
    Object.values(state.combat!.units).forEach((unit, index) => {
      unit.position = index;
    });
    state.combat!.obstacles = [];
    state.combat!.units[targetId].position = 10;
    state.players.p1.hand = [cardId, ...Array(6).fill("stat.power")];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", cardId, targetId);
    expect(cast, `${cardId} must be offered on the bank unit under the Polish rule`).toBeTruthy();
    const declared = applyOk(state, cast!.action);
    declared.stack[0]!.modifiers.spellPowerBonus = power;
    return passAllReactions(declared);
  }

  it("Counterstrike clears a bank unit's retaliation only at its top rung", () => {
    const low = createInitialGameState("bank-counter-low");
    low.combat!.units.unit_p1_marksmen.retaliatedThisRound = true;
    const lowResolved = (() => {
      const state = withPolishBalance(low);
      makeBankUnit(state, "unit_p1_marksmen");
      state.players.p1.hand = ["spell.counterstrike", ...Array(4).fill("stat.power")];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      const cast = findCast(state, "p1", "spell.counterstrike", "unit_p1_marksmen")!;
      const declared = applyOk(state, cast.action);
      declared.stack[0]!.modifiers.spellPowerBonus = 3;
      return passAllReactions(declared);
    })();
    expect(lowResolved.combat!.units.unit_p1_marksmen.retaliatedThisRound).toBe(true);

    const high = createInitialGameState("bank-counter-high");
    high.combat!.units.unit_p1_marksmen.retaliatedThisRound = true;
    const state = withPolishBalance(high);
    makeBankUnit(state, "unit_p1_marksmen");
    state.players.p1.hand = ["spell.counterstrike", ...Array(4).fill("stat.power")];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.counterstrike", "unit_p1_marksmen")!;
    const declared = applyOk(state, cast.action);
    declared.stack[0]!.modifiers.spellPowerBonus = 4;
    const resolved = passAllReactions(declared);
    expect(resolved.combat!.units.unit_p1_marksmen.retaliatedThisRound).toBe(false);
  });

  it("Clone and Sacrifice open their real follow-up choices only at top SP", () => {
    const cloneLow = resolvedCast("spell.clone", "unit_p1_griffins", 4);
    expect(cloneLow.pendingChoice).toBeNull();
    const cloneHigh = resolvedCast("spell.clone", "unit_p1_griffins", 5);
    expect(cloneHigh.pendingChoice?.type).toBe("OPTION_CHOICE");

    const sacrifice = (power: number) => {
      const state = withPolishBalance(createInitialGameState(`bank-sacrifice-${power}`));
      makeBankUnit(state, "unit_p1_marksmen");
      state.combat!.units.unit_p1_marksmen.damage = 1;
      state.players.p1.hand = ["spell.sacrifice", ...Array(4).fill("stat.power")];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      const cast = findCast(state, "p1", "spell.sacrifice", "unit_p1_marksmen")!;
      const declared = applyOk(state, cast.action);
      declared.stack[0]!.modifiers.spellPowerBonus = power;
      return passAllReactions(declared);
    };
    expect(sacrifice(3).pendingChoice).toBeNull();
    expect(sacrifice(4).pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
  });

  it("Teleport reaches a bank unit only at its 'any except azure' top rung", () => {
    expect(resolvedCast("spell.teleport", "unit_p1_griffins", 1).pendingChoice).toBeNull();
    expect(resolvedCast("spell.teleport", "unit_p1_griffins", 2).pendingChoice?.type).toBe(
      "OPTION_CHOICE",
    );
  });

  it("Magic Mirror can redirect to a bank unit only at the gold/top option", () => {
    const state = withPolishBalance(createInitialGameState("bank-mirror-top"));
    makeBankUnit(state, "unit_p2_skeletons");
    expect(spellRedirectTargets(state, "unit_p1_marksmen", "silver").map((unit) => unit.id))
      .not.toContain("unit_p2_skeletons");
    expect(spellRedirectTargets(state, "unit_p1_marksmen", "gold").map((unit) => unit.id))
      .toContain("unit_p2_skeletons");
    state.adventure!.houseRules!["polish-bank-unit-spells"] = false;
    expect(spellRedirectTargets(state, "unit_p1_marksmen", "gold").map((unit) => unit.id))
      .not.toContain("unit_p2_skeletons");
  });

  it("CONTROL: Clone is still not offered on a bank unit with the rule off", () => {
    const state = withPolishBalance(createInitialGameState("bank-clone-off"), false);
    makeBankUnit(state, "unit_p1_marksmen");
    state.players.p1.hand = ["spell.clone", ...Array(5).fill("stat.power")];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(findCast(state, "p1", "spell.clone", "unit_p1_marksmen")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CONTROL: a NON-allowlisted tier-gated spell (Berserk) stays blocked
// ---------------------------------------------------------------------------

describe("bank unit tier-gate exception is scoped", () => {
  it("Berserk is STILL never castable on a bank unit (deliberate exclusion), even with the Polish rule ON", () => {
    const state = withPolishBalance(createInitialGameState("bank-berserk"));
    makeBankUnit(state, "unit_p2_skeletons");
    // Plenty of Power so only the bankUnit ∞-rank could be blocking it.
    state.players.p1.hand = ["spell.berserk", "stat.power", "stat.power", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(
      findCast(state, "p1", "spell.berserk", "unit_p2_skeletons"),
      "Berserk is not on the control/enchantment allowlist, so a bank unit is still ∞-blocked"
    ).toBeUndefined();
  });
});
