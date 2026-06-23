import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import {
  effectiveInitiative,
  expireEffectsForCombatEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  makeActiveEffect
} from "./active-effects";
import {
  RUNE_GAIN_ATTACK,
  RUNE_GAIN_DEFEND,
  RUNE_GAIN_RETALIATION,
  RUNE_LEVEL_THRESHOLDS,
  effectiveRuneLevel,
  gainRunes,
  getRuneSummary,
  runeLevelForCount,
  seedRunesForCombat
} from "./runes";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass reactions / decline rerolls until an attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
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

/** Sandbox combat with p1 flagged as the Bulwark player (no rune building yet). */
function bulwarkState(): GameState {
  const state = createInitialGameState();
  state.players.p1.factionId = "bulwark";
  state.towns.town_p1.factionId = "bulwark";
  return state;
}

/** A clean ranged duel: p1 Marksmen (attack 3, die 0) shoot p2 Skeletons (defense 0). */
function rangedBulwarkState(): GameState {
  const state = bulwarkState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = [];
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13; // non-adjacent → ranged, no retaliation
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

const RANGED_ATTACK: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

describe("Bulwark Runes — level thresholds and army-wide buffs", () => {
  it("only a Bulwark player banks Runes", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "castle";
    gainRunes(state, "p1", 5);
    expect(state.combat!.runes?.p1).toBeUndefined();
    expect(getActiveAttackBonus(state, {
      attacker: state.combat!.units.unit_p1_marksmen,
      defender: state.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(0);
  });

  it("reaching Rune Level 1 grants +1 Attack to ALL the player's units (and nothing else yet)", () => {
    const state = bulwarkState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    const defender = state.combat!.units.unit_p2_skeletons;
    const ctx = { attacker, defender, attackKind: "ranged" as const };

    expect(getActiveAttackBonus(state, ctx)).toBe(0);
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 3 → Level 1

    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 3, level: 1 });
    expect(getActiveAttackBonus(state, ctx)).toBe(1);
    // Level 2/3 buffs must NOT be active yet (and the cap is 1 with no building).
    expect(getActiveDefenseBonus(state, attacker)).toBe(0);
    expect(effectiveInitiative(attacker, state.activeEffects)).toBe(attacker.initiative);
  });

  it("the Rune Level 1 buff actually raises a unit's resolved attack damage (3 → 4)", () => {
    // Control: no Runes → 3 damage.
    let control = rangedBulwarkState();
    control = settle(applyOk(control, RANGED_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3);

    // With Rune Level 1 → 4 damage (attack 3 + die 0 + 1 Rune − defense 0).
    let state = rangedBulwarkState();
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]);
    state = settle(applyOk(state, RANGED_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("Rune Level 2 (+1 Defense) needs the Sieidi — the cap blocks it otherwise", () => {
    // No rune building: 6 Runes still caps at Level 1, no Defense buff.
    const capped = bulwarkState();
    gainRunes(capped, "p1", RUNE_LEVEL_THRESHOLDS[1]); // 6
    expect(effectiveRuneLevel(capped, "p1")).toBe(1);
    expect(getActiveDefenseBonus(capped, capped.combat!.units.unit_p1_marksmen)).toBe(0);

    // Sieidi built → 6 Runes reaches Level 2: +1 Attack AND +1 Defense.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_LEVEL_THRESHOLDS[1]); // 6
    expect(effectiveRuneLevel(sieidi, "p1")).toBe(2);
    const unit = sieidi.combat!.units.unit_p1_marksmen;
    expect(getActiveAttackBonus(sieidi, {
      attacker: unit,
      defender: sieidi.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(1);
    expect(getActiveDefenseBonus(sieidi, unit)).toBe(1);
    // Level 3 (initiative) still locked behind the Altar.
    expect(effectiveInitiative(unit, sieidi.activeEffects)).toBe(unit.initiative);
  });

  it("Rune Level 3 (+3 Initiative) needs the Altar", () => {
    // Sieidi only: 9 Runes caps at Level 2, no Initiative buff.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_LEVEL_THRESHOLDS[2]); // 9
    expect(effectiveRuneLevel(sieidi, "p1")).toBe(2);
    const slow = sieidi.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(slow, sieidi.activeEffects)).toBe(slow.initiative);

    // Altar built → 9 Runes reaches Level 3: +3 Initiative on top of L1+L2.
    const altar = bulwarkState();
    altar.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    gainRunes(altar, "p1", RUNE_LEVEL_THRESHOLDS[2]); // 9
    expect(effectiveRuneLevel(altar, "p1")).toBe(3);
    const unit = altar.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(unit, altar.activeEffects)).toBe(unit.initiative + 3);
    expect(getActiveDefenseBonus(altar, unit)).toBe(1);
  });

  it("runeLevelForCount maps totals to levels at the 3/6/9 thresholds", () => {
    expect([0, 1, 2, 3, 5, 6, 8, 9, 12].map(runeLevelForCount)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("Bulwark Runes — gained by combat actions (Gamefound Update #3)", () => {
  it("an attack banks +1 Rune", () => {
    let state = rangedBulwarkState();
    state = settle(applyOk(state, RANGED_ATTACK));
    expect(state.combat!.runes?.p1?.count).toBe(RUNE_GAIN_ATTACK);
    expect(RUNE_GAIN_ATTACK).toBe(1);
  });

  it("the Defend action banks +3 Runes and immediately reaches Rune Level 1", () => {
    const state = bulwarkState();
    const unit = state.combat!.units.unit_p1_marksmen;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = unit.id;

    const after = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: unit.id });
    expect(after.combat!.runes?.p1?.count).toBe(RUNE_GAIN_DEFEND);
    expect(RUNE_GAIN_DEFEND).toBe(3);
    // 3 Runes = Level 1 → the army-wide +1 Attack is live.
    expect(getActiveAttackBonus(after, {
      attacker: after.combat!.units.unit_p1_marksmen,
      defender: after.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(1);
  });

  it("a Retaliation Attack banks +2 Runes for the retaliating Bulwark player", () => {
    const state = createInitialGameState();
    // p2 is the Bulwark side here; p1 melee-attacks so p2 retaliates.
    state.players.p2.factionId = "bulwark";
    state.towns.town_p2.factionId = "bulwark";
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = [];
    attacker.attack = 1;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.attack = 1;
    defender.position = 2; // adjacent → melee, retaliation provoked
    defender.defense = 0;
    defender.maxHealth = 20;
    defender.damage = 0;
    attacker.maxHealth = 20;
    attacker.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;

    const after = settle(applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: attacker.id,
      defenderId: defender.id
    }));

    // p2 retaliated once → +2 Runes; p1 (not Bulwark) banks nothing.
    expect(after.combat!.runes?.p2?.count).toBe(RUNE_GAIN_RETALIATION);
    expect(after.combat!.runes?.p1).toBeUndefined();
    expect(RUNE_GAIN_RETALIATION).toBe(2);
  });
});

describe("Bulwark Runes — starting pool (City Hall flag + Sieidi/Altar baseline)", () => {
  it("seeds the Sieidi/Altar baseline and the City Hall Rune-Empowered bonus at combat start", () => {
    // City Hall combat focus alone: +3 starting Runes → start at Level 1.
    const flagged = bulwarkState();
    flagged.combat!.attackerPlayerId = "p1";
    flagged.combat!.defenderPlayerId = "p2";
    flagged.players.p1.runeEmpoweredNextCombats = 3;
    seedRunesForCombat(flagged);
    expect(flagged.combat!.runes?.p1?.count).toBe(3);
    expect(effectiveRuneLevel(flagged, "p1")).toBe(1);

    // Altar baseline (6) + the flag (3) = 9, capped at the max → start at Level 3.
    const maxed = bulwarkState();
    maxed.combat!.attackerPlayerId = "p1";
    maxed.combat!.defenderPlayerId = "p2";
    maxed.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    maxed.players.p1.runeEmpoweredNextCombats = 3;
    seedRunesForCombat(maxed);
    expect(maxed.combat!.runes?.p1?.count).toBe(9);
    expect(effectiveRuneLevel(maxed, "p1")).toBe(3);
    const unit = maxed.combat!.units.unit_p1_marksmen;
    expect(getActiveDefenseBonus(maxed, unit)).toBe(1);
    expect(effectiveInitiative(unit, maxed.activeEffects)).toBe(unit.initiative + 3);
  });
});

describe("Bulwark Runes — reset and dispel resistance", () => {
  it("the Rune buffs are combat-scoped and clear at the end of the battle", () => {
    const state = bulwarkState();
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]);
    const runeEffect = state.activeEffects.find((effect) => effect.name === "Rune Power");
    expect(runeEffect?.duration.type).toBe("combat");
    expireEffectsForCombatEnd(state);
    expect(state.activeEffects.some((effect) => effect.name === "Rune Power")).toBe(false);
  });

  it("the army-wide Rune buff is player-scoped, so an enemy single-target Dispel cannot strip it", () => {
    const state = bulwarkState();
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]);
    const runeEffect = state.activeEffects.find((effect) => effect.name === "Rune Power");
    expect(runeEffect?.scope).toBe("player");
    // No unit target → a Dragon Fly's "remove ongoing effects ON THE TARGET" can
    // never match it (Dispel only removes unit-scoped effects placed on a unit).
    expect(runeEffect?.target).toBeUndefined();

    // Sanity: a unit-targeted buff (the kind Dispel removes) does carry a target.
    const targeted = makeActiveEffect(
      state,
      { name: "x", scope: "unit", modifiers: [{ type: "ATTACK_BONUS", amount: 1 }], duration: { type: "combat" } },
      { type: "system" },
      "p1",
      { type: "unit", unitId: state.combat!.units.unit_p1_marksmen.id }
    );
    expect(targeted.target).toBeDefined();
  });
});
