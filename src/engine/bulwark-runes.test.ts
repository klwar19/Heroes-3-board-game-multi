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
  RUNE_SURPLUS_MAX,
  RUNE_THRESHOLD,
  availableRunes,
  effectiveRuneLevel,
  gainRunes,
  getRuneSummary,
  getRuneTrack,
  runeLevelForCount,
  runeTrackHasRoom,
  seedRunesForCombat,
  spendRunes
} from "./runes";
import { coreBuildingDefinitions } from "@/data/factions/core";
import type { CombatContext, GameAction, GameState } from "./state";

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
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 9 → Level 1

    // Reaching nine applies Level 1, resets the main track and banks the reserve.
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 0, reserve: RUNE_SURPLUS_MAX, level: 1 });
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

  it("Rune Level 2 (+3 Initiative) needs the Sieidi — the cap blocks it otherwise", () => {
    // No rune building: 18 Runes (two full cycles) still caps at Level 1, no Initiative buff.
    const capped = bulwarkState();
    gainRunes(capped, "p1", RUNE_THRESHOLD * 2); // 18
    expect(effectiveRuneLevel(capped, "p1")).toBe(1);
    const cappedUnit = capped.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(cappedUnit, capped.activeEffects)).toBe(cappedUnit.initiative);

    // Sieidi built → 18 Runes reaches Level 2: +1 Attack AND +3 Initiative.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_THRESHOLD * 2); // 18
    expect(effectiveRuneLevel(sieidi, "p1")).toBe(2);
    const unit = sieidi.combat!.units.unit_p1_marksmen;
    expect(getActiveAttackBonus(sieidi, {
      attacker: unit,
      defender: sieidi.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(1);
    expect(effectiveInitiative(unit, sieidi.activeEffects)).toBe(unit.initiative + 3);
    // Level 3 (Defense) still locked behind the Altar.
    expect(getActiveDefenseBonus(sieidi, unit)).toBe(0);
  });

  it("Rune Level 3 (+1 Defense) needs the Altar", () => {
    // Sieidi only: 27 Runes caps at Level 2 — Initiative is on, but no Defense buff.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_THRESHOLD * 3); // 27
    expect(effectiveRuneLevel(sieidi, "p1")).toBe(2);
    const capped = sieidi.combat!.units.unit_p1_marksmen;
    expect(getActiveDefenseBonus(sieidi, capped)).toBe(0);
    expect(effectiveInitiative(capped, sieidi.activeEffects)).toBe(capped.initiative + 3); // L2 Initiative is live

    // Altar built → 27 Runes reaches Level 3: +1 Defense on top of L1+L2.
    const altar = bulwarkState();
    altar.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    gainRunes(altar, "p1", RUNE_THRESHOLD * 3); // 27
    expect(effectiveRuneLevel(altar, "p1")).toBe(3);
    const unit = altar.combat!.units.unit_p1_marksmen;
    expect(getActiveDefenseBonus(altar, unit)).toBe(1);
    expect(effectiveInitiative(unit, altar.activeEffects)).toBe(unit.initiative + 3);
  });

  it("runeLevelForCount counts full nine-Rune cycles (9/18/27), capped at Level 3", () => {
    expect(RUNE_LEVEL_THRESHOLDS).toEqual([9, 9, 9]);
    expect([0, 8, 9, 17, 18, 26, 27, 40].map(runeLevelForCount)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("Bulwark Runes — RUNE_LEVEL_REACHED cue (drives the rune sound)", () => {
  it("emits a RUNE_LEVEL_REACHED event when a level turns on, never below the threshold", () => {
    const state = bulwarkState();
    // One short of the first threshold: no level, so no cue.
    gainRunes(state, "p1", RUNE_LEVEL_THRESHOLDS[0] - 1); // 8
    expect(state.eventLog.filter((event) => event.type === "RUNE_LEVEL_REACHED")).toHaveLength(0);

    // Crossing into Level 1 emits exactly one cue carrying the new level + count.
    gainRunes(state, "p1", 1); // 9 → Level 1
    const events = state.eventLog.filter((event) => event.type === "RUNE_LEVEL_REACHED");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ playerId: "p1", level: 1, count: RUNE_THRESHOLD });
  });

  it("emits one cue per level climbed when a Rune-Empowered pool opens several at once (Altar seed)", () => {
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar"); // cap 3
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.players.p1.runeEmpoweredNextCombats = RUNE_THRESHOLD * 3; // 27 → opens at Level 3
    seedRunesForCombat(state);
    const levels = state.eventLog
      .filter((event) => event.type === "RUNE_LEVEL_REACHED")
      .map((event) => (event as { level: number }).level);
    expect(levels).toEqual([1, 2, 3]); // one cue per level reached at seed time
  });
});

describe("Bulwark City Hall — the Rune-Empowered option reaches REAL combat (opens with +3)", () => {
  // Pins the observable opening count end-to-end: the City Hall's combat-focus
  // option value IS the flat number a fight opens with. If the data drifts — or
  // the seed stopped reading the City Hall flag — these fail.
  it("the City Hall combat-focus option is wired to +3 starting Runes", () => {
    const cityHall = coreBuildingDefinitions["bulwark.city_hall"];
    expect(cityHall?.effect?.type).toBe("RESOURCE_ROUND_CHOICE");
    const runeOption =
      cityHall?.effect?.type === "RESOURCE_ROUND_CHOICE"
        ? cityHall.effect.options.find((option) => option.runesNextCombats !== undefined)
        : undefined;
    expect(runeOption?.runesNextCombats).toBe(3);
  });

  it("a combat for a Rune-Empowered Bulwark army OPENS with exactly the City Hall value (3)", () => {
    const cityHall = coreBuildingDefinitions["bulwark.city_hall"];
    const flagFromCityHall =
      cityHall?.effect?.type === "RESOURCE_ROUND_CHOICE"
        ? cityHall.effect.options.find((option) => option.runesNextCombats !== undefined)?.runesNextCombats ?? 0
        : 0;

    const state = bulwarkState(); // p1 Bulwark, no rune building (cap 1)
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    // Exactly what the City Hall handler does when the combat-focus option is taken.
    state.players.p1.cityHallRunesNextCombats = flagFromCityHall;
    seedRunesForCombat(state);

    // OBSERVABLE OUTCOME: the fight opens with 3 Runes. (3 is below the Level-1
    // threshold of 9, so it is a head-start, not an immediate buff.)
    expect(state.combat!.runes?.p1?.count).toBe(3);
    expect(state.combat!.runes?.p1?.count).toBe(flagFromCityHall);
    expect(effectiveRuneLevel(state, "p1")).toBe(0);
  });
});

describe("Bulwark Runes — gained by combat actions (house-rule rates)", () => {
  it("an attack banks +1 Rune", () => {
    let state = rangedBulwarkState();
    state = settle(applyOk(state, RANGED_ATTACK));
    expect(state.combat!.runes?.p1?.count).toBe(RUNE_GAIN_ATTACK);
    expect(RUNE_GAIN_ATTACK).toBe(1);
  });

  it("the Defend action banks +3 Runes, enough to cross into Level 1 with six prior Runes", () => {
    const state = bulwarkState();
    const unit = state.combat!.units.unit_p1_marksmen;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = unit.id;
    gainRunes(state, "p1", 6); // 6 banked already; Defend's +3 should reach the 9-Rune Level 1

    const after = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: unit.id });
    expect(RUNE_GAIN_DEFEND).toBe(3);
    // 6 + 3 = 9 Runes = Level 1: the track resets and the reserve is credited…
    expect(getRuneSummary(after, "p1")).toMatchObject({ count: 0, reserve: RUNE_SURPLUS_MAX, level: 1 });
    // …and the army-wide +1 Attack is live.
    expect(getActiveAttackBonus(after, {
      attacker: after.combat!.units.unit_p1_marksmen,
      defender: after.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(1);
  });

  it("EARNING Runes in a seeded combat climbs the level and raises a real stat (Sieidi: L1→L2 Initiative)", () => {
    // The load-bearing anti-decorative case: a Sieidi player (max level 2) opens
    // the battle at 0 Runes (Level 0) and EARNS its way up; reaching the Level 2
    // threshold (the second nine-Rune cycle) turns on the army-wide +3 Initiative. Fails if the seed
    // pre-charges to the cap (no climb to make) OR if the attack's Rune gain is
    // removed (climb never happens) — testing the OUTCOME (initiative +0 → +3).
    const state = rangedBulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi");
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(state);
    const unitId = state.combat!.units.unit_p1_marksmen.id;
    const initiativeBonus = (s: GameState) =>
      effectiveInitiative(s.combat!.units[unitId], s.activeEffects) - s.combat!.units[unitId].initiative;

    expect(state.combat!.runes!.p1.count).toBe(0); // opens at 0, not pre-charged
    expect(effectiveRuneLevel(state, "p1")).toBe(0);
    expect(initiativeBonus(state)).toBe(0);
    // Seventeen Runes earned so far: Level 1 (9) done, the second cycle is one
    // short of nine, so the Initiative buff is not on yet.
    gainRunes(state, "p1", 17);
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 8, reserve: RUNE_SURPLUS_MAX, level: 1 });
    expect(initiativeBonus(state)).toBe(0);

    // …then a REAL attack action banks the ninth Rune of the cycle and crosses into Level 2.
    const after = settle(applyOk(state, RANGED_ATTACK));
    expect(getRuneSummary(after, "p1")).toMatchObject({ count: 0, reserve: RUNE_SURPLUS_MAX * 2, level: 2 });
    expect(effectiveRuneLevel(after, "p1")).toBe(2);
    expect(initiativeBonus(after)).toBe(3); // observable: the climb turned Initiative on
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

    // p2 retaliated once: +2 Runes; p1 (not Bulwark) banks nothing.
    expect(after.combat!.runes?.p2?.count).toBe(RUNE_GAIN_RETALIATION);
    expect(after.combat!.runes?.p1).toBeUndefined();
    expect(RUNE_GAIN_RETALIATION).toBe(2);
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
      state.combat!.runes = { p2: { count: banked, reserve: 0, appliedLevel: 0 } };

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

    // 7 banked + the retaliation's +2 = 9 = Level 1 threshold: the crossing blow
    // deals base 5 + the army-wide +1 = 6.
    expect(retaliationDamageWithBankedRunes(7)).toBe(6);
    // CONTROL: 6 banked + 2 = 8 Runes, one short of the threshold, so the blow
    // is the unbuffed base 5. (Fails to diverge if the fix mis-applies the buff.)
    expect(retaliationDamageWithBankedRunes(6)).toBe(5);
  });

  it("an ATTACK that crosses a threshold carries its new Level's +1 Attack on THAT very strike", () => {
    // The same fix from the attacker's side: a ranged shot that banks the Rune
    // crossing into Level 1 deals the +1 on the SAME shot. Observable damage,
    // with a one-short CONTROL that stays unbuffed.
    function shotDamageWithBankedRunes(banked: number): number {
      const state = rangedBulwarkState();
      state.combat!.attackerPlayerId = "p1";
      state.combat!.defenderPlayerId = "p2";
      state.combat!.runes = { p1: { count: banked, reserve: 0, appliedLevel: 0 } };
      const after = settle(applyOk(state, RANGED_ATTACK));
      const shot = after.eventLog.find(
        (event) => event.type === "ATTACK_ROLLED" && !(event as { isRetaliation?: boolean }).isRetaliation
      ) as { damage: number } | undefined;
      expect(shot, "the Marksmen should have fired").toBeTruthy();
      return shot!.damage;
    }

    // Marksmen base attack is 3, defender defense 0, die 0. 8 banked + this
    // shot's +1 = 9 = Level 1, so the crossing shot deals 3 + 1 = 4.
    expect(shotDamageWithBankedRunes(8)).toBe(4);
    // CONTROL: 7 banked → 8 Runes, one short, the unbuffed base 3.
    expect(shotDamageWithBankedRunes(7)).toBe(3);
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
    // No buff at the opening — Runes are earned, and Level 1 needs 9 of them.
    expect(effectiveRuneLevel(base, "p1")).toBe(0);
    expect(getActiveAttackBonus(base, {
      attacker: base.combat!.units.unit_p1_marksmen,
      defender: base.combat!.units.unit_p2_skeletons,
      attackKind: "ranged"
    })).toBe(0);
  });

  it("the City Hall Rune-Empowered flag is a +3 head-start toward the first threshold", () => {
    // Base 0 + City Hall combat focus (+3) = 3 starting Runes: a head-start that
    // still falls short of Level 1 (9), so earning SIX more Runes now reaches it.
    const flagged = bulwarkState();
    flagged.combat!.attackerPlayerId = "p1";
    flagged.combat!.defenderPlayerId = "p2";
    flagged.players.p1.cityHallRunesNextCombats = 3;
    seedRunesForCombat(flagged);
    expect(flagged.combat!.runes?.p1?.count).toBe(3);
    expect(effectiveRuneLevel(flagged, "p1")).toBe(0);
    gainRunes(flagged, "p1", 5);
    expect(effectiveRuneLevel(flagged, "p1")).toBe(0); // 8: still one short
    gainRunes(flagged, "p1", 1); // → 9 → Level 1 (vs 9 earned without the flag)
    expect(effectiveRuneLevel(flagged, "p1")).toBe(1);
  });

  it("the City Hall flag and Kriv's Rune-Empowered flag stack at combat start", () => {
    const state = bulwarkState();
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.players.p1.cityHallRunesNextCombats = 3;
    state.players.p1.runeEmpoweredNextCombats = 3;
    seedRunesForCombat(state);
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 6, reserve: 0, level: 0 });
  });

  it("re-seeding is IDEMPOTENT — a leaked Rune buff is never stacked into a second buff", () => {
    // The user-reported double-buff: a Level-2 unit reading base + 1 + 1 Attack.
    // Root cause — a Rune buff that survived from a prior combat (a Retreat /
    // Surrender ends combat WITHOUT expiring combat-scoped effects, see the
    // finalizeAdventureCombat test) was found in state.activeEffects when the
    // NEXT combat seeded, and the seed stacked a fresh copy on top. seeding must
    // rebuild EXACTLY one set of buffs, so the army-wide buffs stay single.
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi"); // cap 2
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.players.p1.runeEmpoweredNextCombats = RUNE_THRESHOLD * 2; // 18 → seeds straight to Level 2

    seedRunesForCombat(state);
    const unit = state.combat!.units.unit_p1_marksmen;
    const ctx = { attacker: unit, defender: state.combat!.units.unit_p2_skeletons, attackKind: "ranged" as const };
    const initiativeBonus = (s: GameState) => effectiveInitiative(unit, s.activeEffects) - unit.initiative;
    expect(getActiveAttackBonus(state, ctx)).toBe(1);
    expect(initiativeBonus(state)).toBe(3); // Level 2 = +3 Initiative after the swap

    // Seed AGAIN with the Level-1/2 buffs already live (the leak scenario): the
    // bonuses must NOT double — exactly one Rune Power / Rune Swiftness remains.
    seedRunesForCombat(state);
    expect(getActiveAttackBonus(state, ctx)).toBe(1); // not 2 — the reported bug
    expect(initiativeBonus(state)).toBe(3); // not 6
    expect(state.activeEffects.filter((effect) => effect.name === "Rune Power")).toHaveLength(1);
    expect(state.activeEffects.filter((effect) => effect.name === "Rune Swiftness")).toHaveLength(1);
  });

  it("the Sieidi/Altar buildings do NOT pre-charge Runes outside Neutral combats (sandbox)", () => {
    // Building starting Runes are Neutral-combat only. In any other combat the
    // buildings leave the player at 0 Runes / Level 0 — every level is earned.
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

    gainRunes(state, "p1", RUNE_THRESHOLD * 3);

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
    gainRunes(state, "p1", RUNE_THRESHOLD * 2); // 0 → 18 = Level 2
    gainRunes(state, "p2", RUNE_THRESHOLD); // 0 → 9 = Level 1
    expect(effectiveRuneLevel(state, "p1")).toBe(2);
    expect(effectiveRuneLevel(state, "p2")).toBe(1);

    const p1Unit = state.combat!.units.unit_p1_marksmen;
    const p2Unit = state.combat!.units.unit_p2_skeletons;
    // Each side carries its own Level-1 +1 Attack…
    expect(getActiveAttackBonus(state, { attacker: p1Unit, defender: p2Unit, attackKind: "ranged" })).toBe(1);
    expect(getActiveAttackBonus(state, { attacker: p2Unit, defender: p1Unit, attackKind: "ranged" })).toBe(1);
    // …but ONLY p1 (Level 2) has the +3 Initiative — it must NOT leak onto p2's units.
    expect(effectiveInitiative(p1Unit, state.activeEffects)).toBe(p1Unit.initiative + 3);
    expect(effectiveInitiative(p2Unit, state.activeEffects)).toBe(p2Unit.initiative);
  });

  it("a player's redacted view still carries the opponent's Rune state and towns (so the HUD renders)", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(state);
    gainRunes(state, "p1", RUNE_THRESHOLD * 3 + 2); // 29 = Level 3 with the Altar, 2 on the track, 15 reserve

    // p2 (the opponent) sees p1's Rune count AND p1's town buildings in their
    // redacted view — the two inputs getRuneTrack needs — so the HUD draws p1's
    // track on p2's client. (Runes/buildings are public; only hands etc. redact.)
    const p2View = getPlayerView(state, "p2");
    expect(p2View.combat?.runes?.p1).toMatchObject({ count: 2, reserve: RUNE_SURPLUS_MAX * 3, appliedLevel: 3 });
    expect(p2View.towns.town_p1.buildings).toEqual(
      expect.arrayContaining(["bulwark.sieidi", "bulwark.altar"])
    );
  });
});

describe("Bulwark Runes — getRuneTrack (combat UI readout)", () => {
  it("marks each level active / pending / locked from the count and the building cap", () => {
    // No rune building: max level 1. 9 Runes earned -> L1 active; L2/L3 locked.
    const base = bulwarkState();
    gainRunes(base, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 9
    const baseTrack = getRuneTrack(base, "p1");
    expect(baseTrack).toMatchObject({
      count: 0,
      reserve: RUNE_SURPLUS_MAX,
      available: RUNE_SURPLUS_MAX,
      surplus: RUNE_SURPLUS_MAX,
      level: 1,
      levelCap: 1,
      max: RUNE_THRESHOLD,
      nextThreshold: null
    });
    expect(baseTrack.levels.map((l) => l.status)).toEqual(["active", "locked", "locked"]);
    expect(baseTrack.levels.map((l) => l.threshold)).toEqual([9, 9, 9]);
    expect(baseTrack.levels.map((l) => l.bonusLabel)).toEqual(["+1 Attack", "+3 Speed", "+1 Defense"]);

    // Sieidi built, only 9 Runes earned: L2 is PENDING (unlocked, not yet earned).
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_LEVEL_THRESHOLDS[0]); // 9
    const sieidiTrack = getRuneTrack(sieidi, "p1");
    expect(sieidiTrack).toMatchObject({ level: 1, levelCap: 2, nextThreshold: RUNE_THRESHOLD });
    expect(sieidiTrack.levels.map((l) => l.status)).toEqual(["active", "pending", "locked"]);

    // Altar built and 27 Runes earned: all three levels active.
    const altar = bulwarkState();
    altar.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    gainRunes(altar, "p1", RUNE_THRESHOLD * 3); // 27
    const altarTrack = getRuneTrack(altar, "p1");
    expect(altarTrack).toMatchObject({ count: 0, reserve: RUNE_SURPLUS_MAX * 3, level: 3, levelCap: 3, nextThreshold: null });
    expect(altarTrack.levels.map((l) => l.status)).toEqual(["active", "active", "active"]);
  });
});

describe("Bulwark Runes — nine-Rune track, reserve and building grants", () => {
  function neutralContext(): CombatContext {
    return { kind: "neutral", heroId: "hero_p1", fieldId: "0,0", difficulty: 1, hasAzure: false };
  }

  it("reaching 9 applies Level 1, resets the track to 0 and credits a 5-Rune reserve", () => {
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi"); // cap 2, so the next cycle also has room
    gainRunes(state, "p1", 8);
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 8, reserve: 0, level: 0 });
    gainRunes(state, "p1", 3); // 8 + 3: nine completes Level 1, the two extra carry over
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 2, reserve: RUNE_SURPLUS_MAX, available: 7, level: 1 });
    expect(state.activeEffects.filter((effect) => effect.name === "Rune Power")).toHaveLength(1);
  });

  it("spendRunes takes from the reserve first, then the main track, and never revokes a level", () => {
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(state, "p1", RUNE_THRESHOLD + 3); // Level 1, track 3, reserve 5
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 3, reserve: 5, level: 1 });

    expect(spendRunes(state, "p1", 4)).toBe(true); // all from the reserve
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 3, reserve: 1 });
    expect(spendRunes(state, "p1", 3)).toBe(true); // 1 reserve + 2 track
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 1, reserve: 0, level: 1 });
    // CONTROL: more than is available is refused and changes nothing.
    expect(spendRunes(state, "p1", 2)).toBe(false);
    expect(availableRunes(state, "p1")).toBe(1);
    // The earned Level 1 buff persists after spending.
    expect(effectiveRuneLevel(state, "p1")).toBe(1);
    expect(state.activeEffects.some((effect) => effect.name === "Rune Power")).toBe(true);
  });

  it("with levelCap 1 (no rune building) the track stops at 9 after Level 1 and has no room", () => {
    const capped = bulwarkState();
    gainRunes(capped, "p1", RUNE_THRESHOLD); // Level 1 → track 0, reserve 5
    expect(runeTrackHasRoom(capped, "p1")).toBe(true);
    gainRunes(capped, "p1", RUNE_THRESHOLD + 4); // fills the track to 9, the rest is lost
    expect(getRuneSummary(capped, "p1")).toMatchObject({ count: RUNE_THRESHOLD, reserve: RUNE_SURPLUS_MAX, level: 1 });
    expect(runeTrackHasRoom(capped, "p1")).toBe(false);
    expect(capped.activeEffects.filter((effect) => effect.name === "Rune Power")).toHaveLength(1);
    expect(capped.activeEffects.some((effect) => effect.name === "Rune Swiftness")).toBe(false);

    // CONTROL: the Sieidi raises the cap, so the same gains reach Level 2 and reset.
    const sieidi = bulwarkState();
    sieidi.towns.town_p1.buildings.push("bulwark.sieidi");
    gainRunes(sieidi, "p1", RUNE_THRESHOLD);
    gainRunes(sieidi, "p1", RUNE_THRESHOLD + 4);
    expect(getRuneSummary(sieidi, "p1")).toMatchObject({ count: 4, reserve: RUNE_SURPLUS_MAX * 2, level: 2 });
    expect(runeTrackHasRoom(sieidi, "p1")).toBe(true);
  });

  it("Sieidi (4) + Altar (2) grant 6 starting Runes in a Neutral combat and 0 in a PvP combat", () => {
    function seededCount(buildings: string[], context: CombatContext): number {
      const state = bulwarkState();
      state.towns.town_p1.buildings.push(...buildings);
      state.combat!.attackerPlayerId = "p1";
      state.combat!.defenderPlayerId = "p2";
      state.combat!.context = context;
      seedRunesForCombat(state);
      return state.combat!.runes!.p1.count;
    }
    const pvp: CombatContext = { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "0,0" };
    expect(seededCount(["bulwark.sieidi", "bulwark.altar"], neutralContext())).toBe(6);
    expect(seededCount(["bulwark.sieidi"], neutralContext())).toBe(4);
    expect(seededCount([], neutralContext())).toBe(0);
    expect(seededCount(["bulwark.sieidi", "bulwark.altar"], pvp)).toBe(0);
    expect(seededCount(["bulwark.sieidi", "bulwark.altar"], { kind: "sandbox" })).toBe(0);
  });

  it("Neutral building Runes stack with the City Hall head-start and can open straight into Level 1", () => {
    const state = bulwarkState();
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar");
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.combat!.context = neutralContext();
    state.players.p1.cityHallRunesNextCombats = 3;
    seedRunesForCombat(state); // 6 + 3 = 9 → Level 1 at the opening
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 0, reserve: RUNE_SURPLUS_MAX, level: 1 });
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
