import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getPlayerView } from "./index";
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
  RUNE_STARTING_BASE,
  effectiveRuneLevel,
  gainRunes,
  getRuneSummary,
  getRuneTrack,
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
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 4 → Level 1

    expect(getRuneSummary(state, "p1")).toMatchObject({ count: RUNE_LEVEL_THRESHOLDS[0], level: 1 });
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
    // No rune building: 7 Runes still caps at Level 1, no Defense buff.
    const capped = bulwarkState();
    gainRunes(capped, "p1", RUNE_LEVEL_THRESHOLDS[1]); // 7
    expect(effectiveRuneLevel(capped, "p1")).toBe(1);
    expect(getActiveDefenseBonus(capped, capped.combat!.units.unit_p1_marksmen)).toBe(0);

    // Sieidi built → 7 Runes reaches Level 2: +1 Attack AND +1 Defense.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_LEVEL_THRESHOLDS[1]); // 7
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
    // Sieidi only: 10 Runes caps at Level 2, no Initiative buff.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_LEVEL_THRESHOLDS[2]); // 10
    expect(effectiveRuneLevel(sieidi, "p1")).toBe(2);
    const slow = sieidi.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(slow, sieidi.activeEffects)).toBe(slow.initiative);

    // Altar built → 10 Runes reaches Level 3: +3 Initiative on top of L1+L2.
    const altar = bulwarkState();
    altar.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    gainRunes(altar, "p1", RUNE_LEVEL_THRESHOLDS[2]); // 10
    expect(effectiveRuneLevel(altar, "p1")).toBe(3);
    const unit = altar.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(unit, altar.activeEffects)).toBe(unit.initiative + 3);
    expect(getActiveDefenseBonus(altar, unit)).toBe(1);
  });

  it("runeLevelForCount maps totals to levels at the 4/7/10 thresholds", () => {
    // First rung at 4, then +3 (7), then +3 (10).
    expect([0, 3, 4, 6, 7, 9, 10, 13].map(runeLevelForCount)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("Bulwark Runes — RUNE_LEVEL_REACHED cue (drives the rune sound)", () => {
  it("emits a RUNE_LEVEL_REACHED event when a level turns on, never below the threshold", () => {
    const state = bulwarkState();
    // One short of the first threshold: no level, so no cue.
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0] - 1); // 3
    expect(state.eventLog.filter((event) => event.type === "RUNE_LEVEL_REACHED")).toHaveLength(0);

    // Crossing into Level 1 emits exactly one cue carrying the new level + count.
    gainRunes(state, "p1", 1); // 4 → Level 1
    const events = state.eventLog.filter((event) => event.type === "RUNE_LEVEL_REACHED");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ playerId: "p1", level: 1, count: 4 });
  });

  it("emits one cue per level climbed when a Rune-Empowered pool opens several at once (Altar seed)", () => {
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar"); // cap 3
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.players.p1.runeEmpoweredNextCombats = RUNE_LEVEL_THRESHOLDS[2]; // 10 → opens at Level 3
    seedRunesForCombat(state);
    const levels = state.eventLog
      .filter((event) => event.type === "RUNE_LEVEL_REACHED")
      .map((event) => (event as { level: number }).level);
    expect(levels).toEqual([1, 2, 3]); // one cue per level reached at seed time
  });
});

describe("Bulwark Runes — gained by combat actions (house-rule rates)", () => {
  it("an attack banks +1 Rune", () => {
    let state = rangedBulwarkState();
    state = settle(applyOk(state, RANGED_ATTACK));
    expect(state.combat!.runes?.p1?.count).toBe(RUNE_GAIN_ATTACK);
    expect(RUNE_GAIN_ATTACK).toBe(1);
  });

  it("the Defend action banks +2 Runes, enough to cross into Level 1 with two prior Runes", () => {
    const state = bulwarkState();
    const unit = state.combat!.units.unit_p1_marksmen;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = unit.id;
    gainRunes(state, "p1", 2); // 2 banked already; Defend's +2 should reach the 4-Rune Level 1

    const after = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: unit.id });
    expect(after.combat!.runes?.p1?.count).toBe(2 + RUNE_GAIN_DEFEND); // 4
    expect(RUNE_GAIN_DEFEND).toBe(2);
    // 2 + 2 = 4 Runes = Level 1: the army-wide +1 Attack is live.
    expect(getActiveAttackBonus(after, {
      attacker: after.combat!.units.unit_p1_marksmen,
      defender: after.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(1);
  });

  it("EARNING Runes in a seeded combat climbs the level and raises a real stat (Sieidi: L1→L2 Defense)", () => {
    // The load-bearing anti-decorative case: a Sieidi player (max level 2) opens
    // the battle at 0 Runes (Level 0) and EARNS its way up; reaching the Level 2
    // threshold (7) turns on the army-wide +1 Defense. Fails if the seed
    // pre-charges to the cap (no climb to make) OR if the attack's Rune gain is
    // removed (climb never happens) — testing the OUTCOME (defense 0 → 1).
    const state = rangedBulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi");
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(state);
    const unitId = state.combat!.units.unit_p1_marksmen.id;
    const defenseBonus = (s: GameState) => getActiveDefenseBonus(s, s.combat!.units[unitId]);

    expect(state.combat!.runes!.p1.count).toBe(0); // opens at 0, not pre-charged
    expect(effectiveRuneLevel(state, "p1")).toBe(0);
    expect(defenseBonus(state)).toBe(0);
    // Six Runes earned so far this fight: past Level 1 (4) but one short of the
    // Level 2 threshold (7), so the Defense buff is not on yet.
    gainRunes(state, "p1", 6);
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 6, level: 1 });
    expect(defenseBonus(state)).toBe(0);

    // …then a REAL attack action banks the 7th Rune and crosses into Level 2.
    const after = settle(applyOk(state, RANGED_ATTACK));
    expect(after.combat!.runes!.p1.count).toBe(RUNE_LEVEL_THRESHOLDS[1]); // 7
    expect(effectiveRuneLevel(after, "p1")).toBe(2);
    expect(defenseBonus(after)).toBe(1); // observable: the climb turned Defense on
  });

  it("a Retaliation Attack banks +1 Rune for the retaliating Bulwark player", () => {
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

    // p2 retaliated once: +1 Rune; p1 (not Bulwark) banks nothing.
    expect(after.combat!.runes?.p2?.count).toBe(RUNE_GAIN_RETALIATION);
    expect(after.combat!.runes?.p1).toBeUndefined();
    expect(RUNE_GAIN_RETALIATION).toBe(1);
  });

  it("the strike that CROSSES a threshold carries its new Level's +1 Attack on THAT very blow", () => {
    // The user-reported bug: "rune doesn't have effect the moment it reaches the
    // threshold (defend, then reach threshold, but retaliate and still no +1
    // attack)". A strike that earns the Rune crossing into Level 1 must already
    // deal the army-wide +1 Attack on the SAME blow — not only on the next one.
    // Asserts the OBSERVABLE damage (not just the Rune count), with a one-short
    // CONTROL that does NOT cross (so it deals exactly the base attack).
    function retaliationDamageWithBankedRunes(banked: number): number {
      const state = createInitialGameState();
      state.players.p2.factionId = "bulwark";
      state.towns.town_p2.factionId = "bulwark";
      const attacker = state.combat!.units.unit_p1_marksmen;
      attacker.abilities = [];
      attacker.attack = 1;
      attacker.position = 1;
      attacker.defense = 0; // so the retaliation damage is purely the attacker's value
      attacker.maxHealth = 50;
      attacker.damage = 0;
      const defender = state.combat!.units.unit_p2_skeletons;
      defender.abilities = [];
      defender.attack = 5; // base retaliation attack
      defender.position = 2; // adjacent → melee, retaliation provoked
      defender.defense = 0;
      defender.maxHealth = 20;
      defender.damage = 0;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0]; // every die 0 → isolates the buff
      state.combat!.dice.rollCount = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      // Bank p2 (Bulwark) to `banked` Runes before the fight's retaliation.
      state.combat!.runes = { p2: { count: banked, appliedLevel: runeLevelForCount(banked) } };

      const after = settle(applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: attacker.id,
        defenderId: defender.id
      }));
      const retaliation = after.eventLog.find(
        (event) => event.type === "ATTACK_ROLLED" && (event as { isRetaliation?: boolean }).isRetaliation
      ) as { damage: number } | undefined;
      expect(retaliation, "p2 should have retaliated").toBeTruthy();
      return retaliation!.damage;
    }

    // 3 banked + the retaliation's +1 = 4 = Level 1 threshold: the crossing blow
    // deals base 5 + the army-wide +1 = 6.
    expect(retaliationDamageWithBankedRunes(3)).toBe(6);
    // CONTROL: 0 banked + 1 = 1 Rune, nowhere near the 4 threshold, so the blow
    // is the unbuffed base 5. (Fails to diverge if the fix mis-applies the buff.)
    expect(retaliationDamageWithBankedRunes(0)).toBe(5);
  });

  it("an ATTACK that crosses a threshold carries its new Level's +1 Attack on THAT very strike", () => {
    // The same fix from the attacker's side: a ranged shot that banks the Rune
    // crossing into Level 1 deals the +1 on the SAME shot. Observable damage,
    // with a one-short CONTROL that stays unbuffed.
    function shotDamageWithBankedRunes(banked: number): number {
      const state = rangedBulwarkState();
      state.combat!.attackerPlayerId = "p1";
      state.combat!.defenderPlayerId = "p2";
      state.combat!.runes = { p1: { count: banked, appliedLevel: runeLevelForCount(banked) } };
      const after = settle(applyOk(state, RANGED_ATTACK));
      const shot = after.eventLog.find(
        (event) => event.type === "ATTACK_ROLLED" && !(event as { isRetaliation?: boolean }).isRetaliation
      ) as { damage: number } | undefined;
      expect(shot, "the Marksmen should have fired").toBeTruthy();
      return shot!.damage;
    }

    // Marksmen base attack is 3, defender defense 0, die 0. 3 banked + this
    // shot's +1 = 4 = Level 1, so the crossing shot deals 3 + 1 = 4.
    expect(shotDamageWithBankedRunes(3)).toBe(4);
    // CONTROL: 0 banked → 1 Rune, no crossing, the unbuffed base 3.
    expect(shotDamageWithBankedRunes(0)).toBe(3);
  });
});

describe("Bulwark Runes — starting pool (earned in battle; City Hall flag head-start)", () => {
  it("opens every combat at 0 Runes / Level 0 with no building or flag", () => {
    const base = bulwarkState();
    base.combat!.attackerPlayerId = "p1";
    base.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(base);
    expect(base.combat!.runes?.p1?.count).toBe(RUNE_STARTING_BASE);
    expect(RUNE_STARTING_BASE).toBe(0);
    // No buff at the opening — Runes are earned, and Level 1 needs 4 of them.
    expect(effectiveRuneLevel(base, "p1")).toBe(0);
    expect(getActiveAttackBonus(base, {
      attacker: base.combat!.units.unit_p1_marksmen,
      defender: base.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(0);
  });

  it("the City Hall Rune-Empowered flag is a +3 head-start toward the first threshold", () => {
    // Base 0 + City Hall combat focus (+3) = 3 starting Runes: a head-start that
    // still falls short of Level 1 (4), so earning ONE more Rune now reaches it.
    const flagged = bulwarkState();
    flagged.combat!.attackerPlayerId = "p1";
    flagged.combat!.defenderPlayerId = "p2";
    flagged.players.p1.runeEmpoweredNextCombats = 3;
    seedRunesForCombat(flagged);
    expect(flagged.combat!.runes?.p1?.count).toBe(3);
    expect(effectiveRuneLevel(flagged, "p1")).toBe(0);
    gainRunes(flagged, "p1", 1); // one earned Rune → 4 → Level 1 (vs 4 without the flag)
    expect(effectiveRuneLevel(flagged, "p1")).toBe(1);
  });

  it("re-seeding is IDEMPOTENT — a leaked Rune buff is never stacked into a second +Attack", () => {
    // The user-reported double-buff: a Level-2 unit reading base + 1 + 1 Attack.
    // Root cause — a Rune buff that survived from a prior combat (a Retreat /
    // Surrender ends combat WITHOUT expiring combat-scoped effects, see the
    // finalizeAdventureCombat test) was found in state.activeEffects when the
    // NEXT combat seeded, and the seed stacked a fresh copy on top. seeding must
    // rebuild EXACTLY one set of buffs, so the army-wide +Attack stays +1.
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi"); // cap 2
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.players.p1.runeEmpoweredNextCombats = RUNE_LEVEL_THRESHOLDS[1]; // 7 → seeds straight to Level 2

    seedRunesForCombat(state);
    const unit = state.combat!.units.unit_p1_marksmen;
    const ctx = { attacker: unit, defender: state.combat!.units.unit_p2_skeletons, attackKind: "ranged" as const };
    expect(getActiveAttackBonus(state, ctx)).toBe(1);
    expect(getActiveDefenseBonus(state, unit)).toBe(1);

    // Seed AGAIN with the Level-1/2 buffs already live (the leak scenario): the
    // bonuses must NOT double to +2 — exactly one Rune Power / Rune Ward remains.
    seedRunesForCombat(state);
    expect(getActiveAttackBonus(state, ctx)).toBe(1); // not 2 — the reported bug
    expect(getActiveDefenseBonus(state, unit)).toBe(1); // not 2
    expect(state.activeEffects.filter((effect) => effect.name === "Rune Power")).toHaveLength(1);
    expect(state.activeEffects.filter((effect) => effect.name === "Rune Ward")).toHaveLength(1);
  });

  it("the Sieidi/Altar buildings RAISE THE MAX LEVEL but do NOT pre-charge Runes (anti-decorative)", () => {
    // The original design seeded base 4 + Altar baseline 6 = 10 → started at the
    // Level 3 cap, making the earn-by-acting loop, Kriv and the City Hall option
    // inert. The buildings must leave the player at 0 Runes / Level 0, with every
    // level reached only by EARNING Runes in battle.
    for (const built of [["bulwark.sieidi"], ["bulwark.sieidi", "bulwark.altar"]]) {
      const state = bulwarkState();
      state.combat!.attackerPlayerId = "p1";
      state.combat!.defenderPlayerId = "p2";
      state.towns.town_p1.buildings.push(...built);
      seedRunesForCombat(state);
      // Opens at 0 / Level 0 — NOT pre-charged to the unlocked max level.
      expect(state.combat!.runes?.p1?.count, built.join("+")).toBe(0);
      expect(effectiveRuneLevel(state, "p1"), built.join("+")).toBe(0);
      const unit = state.combat!.units.unit_p1_marksmen;
      expect(getActiveDefenseBonus(state, unit), built.join("+")).toBe(0);
      expect(effectiveInitiative(unit, state.activeEffects), built.join("+")).toBe(unit.initiative);
    }
  });

  it("uses the strongest rune building across all controlled towns", () => {
    const state = bulwarkState();
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    // p1's original town has no rune building, but a captured/controlled
    // Bulwark town does. The cap lookup must not stop at the first owned town.
    state.towns.town_p1.buildings = [];
    state.towns.town_p2.controllerId = "p1";
    state.towns.town_p2.factionId = "bulwark";
    state.towns.town_p2.buildings = ["bulwark.sieidi", "bulwark.altar"];

    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[2]);

    expect(effectiveRuneLevel(state, "p1")).toBe(3);
    const unit = state.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(unit, state.activeEffects)).toBe(unit.initiative + 3);
  });
});

describe("Bulwark Runes — PvP / multiplayer", () => {
  it("scopes each Bulwark player's Runes to their OWN units in a two-Bulwark mirror (no leak)", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.players.p2.factionId = "bulwark";
    state.towns.town_p2.factionId = "bulwark";
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    // p1 builds the Sieidi (max level 2); p2 has no rune building (max level 1).
    state.towns.town_p1.buildings.push("bulwark.sieidi");
    seedRunesForCombat(state);
    // Both open at 0 / Level 0.
    expect(state.combat!.runes?.p1?.count).toBe(RUNE_STARTING_BASE);
    expect(state.combat!.runes?.p2?.count).toBe(RUNE_STARTING_BASE);

    // p1 EARNS up to Level 2; p2 earns only to Level 1.
    gainRunes(state, "p1", 7); // 0 → 7 = Level 2
    gainRunes(state, "p2", 4); // 0 → 4 = Level 1
    expect(effectiveRuneLevel(state, "p1")).toBe(2);
    expect(effectiveRuneLevel(state, "p2")).toBe(1);

    const p1Unit = state.combat!.units.unit_p1_marksmen;
    const p2Unit = state.combat!.units.unit_p2_skeletons;
    // Each side carries its own Level-1 +1 Attack…
    expect(getActiveAttackBonus(state, { attacker: p1Unit, defender: p2Unit, attackKind: "ranged" })).toBe(1);
    expect(getActiveAttackBonus(state, { attacker: p2Unit, defender: p1Unit, attackKind: "ranged" })).toBe(1);
    // …but ONLY p1 (Level 2) has the +1 Defense — it must NOT leak onto p2's units.
    expect(getActiveDefenseBonus(state, p1Unit)).toBe(1);
    expect(getActiveDefenseBonus(state, p2Unit)).toBe(0);
  });

  it("a player's redacted view still carries the opponent's Rune state and towns (so the HUD renders)", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(state);
    gainRunes(state, "p1", 10); // 0 → 10 = Level 3 with the Altar

    // p2 (the opponent) sees p1's Rune count AND p1's town buildings in their
    // redacted view — the two inputs getRuneTrack needs — so the HUD draws p1's
    // track on p2's client. (Runes/buildings are public; only hands etc. redact.)
    const p2View = getPlayerView(state, "p2");
    expect(p2View.combat?.runes?.p1?.count).toBe(10);
    expect(p2View.towns.town_p1.buildings).toEqual(
      expect.arrayContaining(["bulwark.sieidi", "bulwark.altar"])
    );
  });
});

describe("Bulwark Runes — getRuneTrack (combat UI readout)", () => {
  it("marks each level active / pending / locked from the count and the building cap", () => {
    // No rune building: max level 1. 4 Runes earned -> L1 active; L2/L3 locked.
    const base = bulwarkState();
    gainRunes(base, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 4
    const baseTrack = getRuneTrack(base, "p1");
    expect(baseTrack).toMatchObject({ count: 4, level: 1, levelCap: 1, max: 10, nextThreshold: null });
    expect(baseTrack.levels.map((l) => l.status)).toEqual(["active", "locked", "locked"]);
    expect(baseTrack.levels.map((l) => l.threshold)).toEqual([4, 7, 10]);
    expect(baseTrack.levels.map((l) => l.bonusLabel)).toEqual(["+1 Attack", "+1 Defense", "+3 Initiative"]);

    // Sieidi built, only 4 Runes earned: L2 is PENDING (unlocked, not yet earned).
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 4
    const sieidiTrack = getRuneTrack(sieidi, "p1");
    expect(sieidiTrack).toMatchObject({ level: 1, levelCap: 2, nextThreshold: 7 });
    expect(sieidiTrack.levels.map((l) => l.status)).toEqual(["active", "pending", "locked"]);

    // Altar built and 10 Runes earned: all three levels active.
    const altar = bulwarkState();
    altar.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    gainRunes(altar, "p1", RUNE_LEVEL_THRESHOLDS[2]); // 10
    const altarTrack = getRuneTrack(altar, "p1");
    expect(altarTrack).toMatchObject({ count: 10, level: 3, levelCap: 3, nextThreshold: null });
    expect(altarTrack.levels.map((l) => l.status)).toEqual(["active", "active", "active"]);
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
