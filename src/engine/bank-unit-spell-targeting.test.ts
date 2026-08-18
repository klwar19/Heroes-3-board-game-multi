import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * POLISH BALANCE RULE (`polish-card-balance`): the control / enchantment spells —
 * Anti-Magic, Blind, Frenzy, Sorrow, Disrupting Ray — MAY be cast on a tierless
 * Creature-Bank unit (a bank GUARD such as the Nagas in a Naga Bank, AND a won
 * "gain a unit" bank REWARD card such as Dragon Flies). By default every tier-gated
 * spell treats a `bankUnit` as gradeless ∞ and silently drops it from the target
 * list; only with the Polish Balance Pack on does `bankAwareTierGateRank` rank a
 * bank unit at its UNDERLYING grade (capped at gold) for exactly these five effects
 * — so Power still matters against a high-tier guard — while EVERY other tier-gated
 * spell (Berserk, Teleport, Clone, damage) stays blocked on a bank unit. Each
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

  it("pierces a BRONZE bank guard at Power 0 (the low-tier reward case)", () => {
    // skeletons = p2 bronze. Power 0 already reaches bronze.
    expect(pierceDelta("unit_p2_skeletons", 0), "Power 0 pierces the bronze bank guard").toBeGreaterThan(0);
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
