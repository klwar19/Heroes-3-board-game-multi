/**
 * Neutral Rank-Up (OPTIONAL module: wog.neutralRankUp / anime.neutralRankUp).
 *
 * NEUTRAL guard units gain the SAME veteran ranks a player army earns, reusing
 * the unit-experience machinery verbatim (no parallel stat table), via two
 * independent halves, each frozen behind `adventure.neutralRankUp`:
 *   • ROUNDS — every NON-bank guard folds to the (capped-at-Veteran) rank its
 *     tier reaches by the current round (virtual XP = round - 1).
 *   • STACKS — a Creature-Bank defender carrying a Stack Token fights rank 1.
 *
 * Every claim below fails if its wiring is removed; the balance guardrails
 * (cap at 2 rounds / 1 stacks, rounds 1-3 untouched, banks excluded from
 * rounds, rewards unchanged, guaranteed-win unaffected) each carry a CONTROL,
 * and the core fold is mutation-checked (noted inline).
 */
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState, markUnitRemovedIfNeeded, standardComputerController } from "./index";
import { applyUnitCurrentSide } from "./unit-transforms";
import {
  buildCreatureBankCombatUnits,
  getMainHero,
  makeCombatUnitFromNeutral,
  type NeutralDraw
} from "./adventure";
import { revealNeutralArmy, startNeutralEncounter } from "./adventure-reducer";
import { getRuleset, unitSideRuleOverrides } from "./ruleset";
import {
  NEUTRAL_ROUNDS_RANK_CAP,
  NEUTRAL_STACK_RANK,
  applyNeutralRoundsRank,
  combatUnitRankFold,
  neutralRankUpActive,
  neutralRoundsMirrorXp,
  neutralRoundsRank,
  neutralRoundsVirtualXp,
  neutralStackRankFold,
  unitRankAbilityIds
} from "./unit-experience";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatUnitState, GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A plain neutral guard, minted exactly as the reveal seam mints it. */
function mintNeutral(unitDefId: string, tier: "bronze" | "silver" | "gold"): CombatUnitState {
  return makeCombatUnitFromNeutral({ unitDefId, tier }, "u1", 0, "legacy")!;
}

// neutral.boars: bronze ground, printed abilities []. Generator-served (no
// bespoke UNIT_RANK_SCHEDULES entry), so rank 1 = +1 Health (its per-unit stat
// ladder's first step) and rank 2 is the ability rank.
const BOARS = "neutral.boars";
// neutral.behemoths: gold, ranks slower (rank-1 threshold 5 vs bronze 3).
const BEHEMOTHS = "neutral.behemoths";

// ===========================================================================
// Flag, freezing & default-OFF byte-identical
// ===========================================================================

describe("Neutral Rank-Up — flag freezing (WOG + anime surfaces, default OFF)", () => {
  function build(surface: "wog" | "anime" | "off"): GameState {
    return createAdventureGameState({
      seed: `nru-freeze-${surface}`,
      rollFirstPlayer: false,
      ...(surface === "wog" ? { ruleset: "binh" as const, wog: { enabled: true, neutralRankUp: true } } : {}),
      ...(surface === "anime" ? { ruleset: "binh" as const, anime: { enabled: true, neutralRankUp: true } } : {})
    });
  }

  it("freezes adventure.neutralRankUp from EITHER module surface; absent when off", () => {
    expect(build("wog").adventure!.neutralRankUp).toBe(true);
    expect(build("anime").adventure!.neutralRankUp).toBe(true);
    // CONTROL: no surface → the frozen flag is absent (legacy-snapshot safe).
    expect(build("off").adventure!.neutralRankUp).toBeUndefined();
    expect(neutralRankUpActive(build("wog"))).toBe(true);
    expect(neutralRankUpActive(build("off"))).toBe(false);
  });

  it("default OFF is byte-identical: a guard minted with the module off is untouched", () => {
    const off = mintNeutral(BOARS, "bronze");
    // The off engine simply never calls the fold — the printed side stands.
    expect(off.attack).toBe(2);
    expect(off.defense).toBe(0);
    expect(off.maxHealth).toBe(4);
    expect(off.abilities).toEqual([]);
    expect(off.unitRank).toBeUndefined();
    expect(off.unitExperience).toBeUndefined();
  });
});

// ===========================================================================
// ROUNDS half — the mid-game ramp
// ===========================================================================

describe("Neutral Rank-Up — ROUNDS half (constants + rank math)", () => {
  it("virtual XP = round - 1, run through the REAL tier thresholds, capped at Veteran", () => {
    expect(neutralRoundsVirtualXp(1)).toBe(0);
    expect(neutralRoundsVirtualXp(7)).toBe(6);
    expect(NEUTRAL_ROUNDS_RANK_CAP).toBe(2);
    expect(NEUTRAL_STACK_RANK).toBe(1);
    // bronze Seasoned r4 / Veteran r7; silver r5/r9; gold+azure r6/r11.
    expect(neutralRoundsRank("bronze", 3)).toBe(0);
    expect(neutralRoundsRank("bronze", 4)).toBe(1);
    expect(neutralRoundsRank("bronze", 7)).toBe(2);
    expect(neutralRoundsRank("silver", 4)).toBe(0);
    expect(neutralRoundsRank("silver", 5)).toBe(1);
    expect(neutralRoundsRank("silver", 9)).toBe(2);
    expect(neutralRoundsRank("gold", 5)).toBe(0);
    expect(neutralRoundsRank("gold", 6)).toBe(1);
    expect(neutralRoundsRank("gold", 11)).toBe(2);
    // CAP: never past Veteran, however old the game gets.
    expect(neutralRoundsRank("bronze", 30)).toBe(2);
    expect(neutralRoundsRank("gold", 99)).toBe(2);
  });

  it("mirror XP is clamped below the rank-3 threshold so any recompute stays capped", () => {
    // bronze rank-3 threshold = 10 → mirror clamps to 9 (= Veteran, never Elite).
    expect(neutralRoundsMirrorXp("bronze", 30)).toBe(9);
    expect(neutralRoundsMirrorXp("bronze", 7)).toBe(6);
    expect(neutralRoundsMirrorXp("gold", 99)).toBe(15); // gold rank-3 threshold 16 → 15
  });
});

describe("Neutral Rank-Up — ROUNDS half (observable stat folds)", () => {
  it("a round-7 bronze guard fights with the Veteran stat delta AND the rank ability [MUTATION-CHECK]", () => {
    const base = mintNeutral(BOARS, "bronze");
    const veteran = mintNeutral(BOARS, "bronze");
    applyNeutralRoundsRank(veteran, 7);

    // Observable: Health rises by exactly the boars' Veteran fold (+1 — their
    // rank-1 step on the per-unit stat ladder); every other printed stat is
    // untouched (rank 2 is the ability rank).
    expect(veteran.maxHealth).toBe(base.maxHealth + 1);
    expect(veteran.attack).toBe(base.attack);
    expect(veteran.defense).toBe(base.defense);
    expect(veteran.unitRank).toBe(2);
    // The schedule's rank-≤2 ability id is granted on top (boars print none).
    const granted = unitRankAbilityIds(BOARS, 2);
    expect(granted.length).toBeGreaterThan(0);
    for (const id of granted) {
      expect(veteran.abilities).toContain(id);
    }
    // If applyNeutralRoundsRank were a no-op (fold removed) `veteran` would equal
    // `base` and both the +1 Health and the unitRank assertions above fail.
  });

  it("round 1 is IDENTICAL to off (below every tier's first threshold)", () => {
    const base = mintNeutral(BOARS, "bronze");
    const early = mintNeutral(BOARS, "bronze");
    applyNeutralRoundsRank(early, 1); // virtual XP 0 → rank 0 → no-op
    expect(early.attack).toBe(base.attack);
    expect(early.defense).toBe(base.defense);
    expect(early.maxHealth).toBe(base.maxHealth);
    expect(early.abilities).toEqual(base.abilities);
    expect(early.unitRank).toBeUndefined();
    expect(early.unitExperience).toBeUndefined();
  });

  it("tier scaling: same round, a bronze guard is ranked while a gold guard is NOT yet", () => {
    const bronze = mintNeutral(BOARS, "bronze");
    const gold = mintNeutral(BEHEMOTHS, "gold");
    const goldBaseAttack = gold.attack;
    applyNeutralRoundsRank(bronze, 4); // bronze rank 1
    applyNeutralRoundsRank(gold, 4); // gold still rank 0

    expect(bronze.unitRank).toBe(1);
    expect(bronze.maxHealth).toBe(coreUnitDefinitions[BOARS]!.neutral!.health + 1);
    // CONTROL: the gold guard's threshold is higher — round 4 leaves it bare.
    expect(gold.unitRank).toBeUndefined();
    expect(gold.attack).toBe(goldBaseAttack);
    expect(gold.unitExperience).toBeUndefined();
  });

  it("caps at Veteran (rank 2) even in a very long game — no Elite/Legend leak", () => {
    const late = mintNeutral(BOARS, "bronze");
    applyNeutralRoundsRank(late, 30);
    expect(late.unitRank).toBe(2);
    // The cap is observable: an UNCAPPED bronze at 29 XP would be Legend (rank 4)
    // and carry the rank-3 +Defense step. Capped, only rank 1's +Health lands
    // (rank 2 is the boars' ability rank).
    expect(late.attack).toBe(coreUnitDefinitions[BOARS]!.neutral!.attack); // NOT +1
    expect(late.defense).toBe(coreUnitDefinitions[BOARS]!.neutral!.defense); // NOT +1
    expect(late.maxHealth).toBe(coreUnitDefinitions[BOARS]!.neutral!.health + 1);
    // And a downstream recompute reproduces the SAME capped rank (mirror XP).
    expect(combatUnitRankFold(late).rank).toBe(2);
  });

  it("the rank survives a mid-combat printed-side recompute (Random-Town Pack→Few flip)", () => {
    // A Random-Town defender is minted on its Pack side and CAN flip to Few
    // mid-combat (applyUnitCurrentSide). The mirrored capped XP reproduces the
    // exact rank on the recompute — and never exceeds the cap.
    const pack = makeCombatUnitFromNeutral(
      { unitDefId: "castle.halberdiers", tier: "bronze", factionPack: true, bankGuard: true },
      "rt1",
      0,
      "legacy"
    )!;
    applyNeutralRoundsRank(pack, 30);
    expect(pack.unitRank).toBe(2);
    const flippedDefense = pack.defense;

    pack.variant = "few";
    applyUnitCurrentSide(pack, "legacy");
    // The Few side keeps Veteran rank (mirror XP), never climbing to Elite.
    expect(pack.unitRank).toBe(2);
    expect(combatUnitRankFold(pack).rank).toBe(2);
    // Defense fold still present on the recomputed side (non-vacuous).
    expect(pack.defense).toBeGreaterThanOrEqual(1);
    expect(flippedDefense).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// ROUNDS half — the reveal seam (freeze → mint → fold, end to end)
// ===========================================================================

describe("Neutral Rank-Up — ROUNDS seam (revealNeutralArmy)", () => {
  function neutralCombat(seed: string, moduleOn: boolean, round: number): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      ...(moduleOn ? { ruleset: "binh" as const, wog: { enabled: true, neutralRankUp: true, newCreatures: false } } : {})
    });
    state.round = round;
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "guard-field";
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 2, // strictly above hero level → a real neutral shell
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
    return state;
  }

  function seedAndFind(state: GameState, draws: NeutralDraw[], unitDefId: string): CombatUnitState {
    const combat = state.combat!;
    combat.units = {};
    combat.pendingNeutralDraws = null;
    state.pendingChoice = null;
    revealNeutralArmy(state, draws);
    const unit = Object.values(state.combat!.units).find((entry) => entry.unitDefId === unitDefId);
    expect(unit, `revealed guard ${unitDefId}`).toBeTruthy();
    return unit!;
  }

  it("ranks every non-bank guard at reveal — tier-scaled — when the module is on", () => {
    const state = neutralCombat("nru-reveal-on", true, 7);
    expect(neutralRankUpActive(state)).toBe(true);
    const draws: NeutralDraw[] = [
      { unitDefId: BOARS, tier: "bronze" },
      { unitDefId: BEHEMOTHS, tier: "gold" }
    ];
    // Fresh reveal, so re-seed both together.
    const combat = state.combat!;
    combat.units = {};
    combat.pendingNeutralDraws = null;
    state.pendingChoice = null;
    revealNeutralArmy(state, draws);

    const boars = Object.values(state.combat!.units).find((u) => u.unitDefId === BOARS)!;
    const behemoth = Object.values(state.combat!.units).find((u) => u.unitDefId === BEHEMOTHS)!;
    // Round 7: bronze reaches Veteran (2), gold only Seasoned (1) — tier-scaled.
    expect(boars.unitRank).toBe(2);
    expect(boars.maxHealth).toBe(coreUnitDefinitions[BOARS]!.neutral!.health + 1);
    expect(behemoth.unitRank).toBe(1);
    expect(boars.controllerId).toBe(NEUTRAL_PLAYER_ID);
  });

  it("CONTROL: with the module OFF the same reveal produces bare, unranked guards", () => {
    const state = neutralCombat("nru-reveal-off", false, 7);
    expect(neutralRankUpActive(state)).toBe(false);
    const boars = seedAndFind(state, [{ unitDefId: BOARS, tier: "bronze" }], BOARS);
    expect(boars.unitRank).toBeUndefined();
    expect(boars.maxHealth).toBe(coreUnitDefinitions[BOARS]!.neutral!.health);
    expect(boars.unitExperience).toBeUndefined();
  });

  it("a designer exact-army guard list is ranked too (it funnels through the same seam)", () => {
    // Designer exact/level armies are just NeutralDraw[] fed to revealNeutralArmy,
    // so the ROUNDS fold reaches them exactly like a rolled guard.
    const state = neutralCombat("nru-reveal-designer", true, 7);
    const guard = seedAndFind(state, [{ unitDefId: BOARS, tier: "bronze", bankGuard: true }], BOARS);
    expect(guard.unitRank).toBe(2);
  });

  it("reward driver is UNTOUCHED: ranking guards never changes the fight difficulty", () => {
    // Rewards/XP for beating a guard are difficulty-based; the module raises guard
    // STATS only. The context difficulty (the reward driver) is unchanged.
    const state = neutralCombat("nru-reward", true, 7);
    seedAndFind(state, [{ unitDefId: BOARS, tier: "bronze" }], BOARS);
    const ctx = state.combat!.context;
    expect(ctx.kind).toBe("neutral");
    if (ctx.kind === "neutral") {
      expect(ctx.difficulty).toBe(2);
    }
  });
});

// ===========================================================================
// STACKS half — a Stacked bank defender fights one rank up
// ===========================================================================

describe("Neutral Rank-Up — STACKS half (Creature Bank defenders)", () => {
  const bankNagaDraw: NeutralDraw = { unitDefId: "neutral.nagas", tier: "bronze", bankUnit: true };

  it("the stack fold is a fixed Seasoned rank keyed off the UNDERLYING unit tier", () => {
    const fold = neutralStackRankFold("neutral.nagas");
    expect(fold.rank).toBe(1);
    // neutral.nagas' rank 1 is an ABILITY rank, so the fold's payload is the
    // granted id (a stat assertion here would have no teeth — see the
    // behavioural damage-delta in veteran-guarded-stance.test.ts).
    expect(fold.abilityIds).toEqual(["veteran-guarded-stance"]);
    expect(fold.abilityId).toBe("veteran-guarded-stance");
    expect(coreUnitDefinitions["neutral.nagas"]!.tier).toBe("gold");
    // The tier really is read from the DEF (bank draws mint "bronze"): a bronze
    // guard's rank-1 fold differs, so the def-keyed lookup is what runs.
    expect(neutralStackRankFold("neutral.boars").rank).toBe(1);
    expect(neutralStackRankFold("neutral.boars").health).toBe(1);
  });

  it("a Stacked defender fights rank 1 ON TOP of the Stack Token; the token alone does NOT rank", () => {
    // Token on Health; the rank's own payload is the granted ABILITY, so the
    // two are independently observable.
    const ranked = makeCombatUnitFromNeutral(bankNagaDraw, "u1", 0, "legacy")!;
    ranked.stackToken = "health";
    applyUnitCurrentSide(ranked, "legacy", { neutralRankUp: true });
    expect(ranked.maxHealth).toBe(6); // 5 base + 1 Health token
    expect(ranked.abilities).toContain("veteran-guarded-stance"); // rank 1
    expect(ranked.unitRank).toBe(1);

    // CONTROL A: module ON but NO token — a plain (un-Stacked) defender never ranks.
    const noToken = makeCombatUnitFromNeutral(bankNagaDraw, "u2", 0, "legacy")!;
    applyUnitCurrentSide(noToken, "legacy", { neutralRankUp: true });
    expect(noToken.unitRank).toBeUndefined();
    expect(noToken.abilities).not.toContain("veteran-guarded-stance");

    // CONTROL B: token present but module OFF — the +1 Stack Token stands alone.
    const off = makeCombatUnitFromNeutral(bankNagaDraw, "u3", 0, "legacy")!;
    off.stackToken = "health";
    applyUnitCurrentSide(off, "legacy");
    expect(off.maxHealth).toBe(6);
    expect(off.abilities).not.toContain("veteran-guarded-stance"); // token gives no rank
    expect(off.unitRank).toBeUndefined();
  });

  it("Stack Token absorb is UNCHANGED; the rank drops with the token", () => {
    const state = createAdventureGameState({
      seed: "nru-absorb",
      rollFirstPlayer: false,
      ruleset: "binh",
      wog: { enabled: true, neutralRankUp: true, newCreatures: false }
    });
    const overrides = unitSideRuleOverrides(state);
    expect(overrides.neutralRankUp).toBe(true);

    const unit = makeCombatUnitFromNeutral(bankNagaDraw, "u1", 0, getRuleset(state), overrides)!;
    unit.stackToken = "health";
    applyUnitCurrentSide(unit, getRuleset(state), overrides);
    expect(unit.maxHealth).toBe(6);
    expect(unit.abilities).toContain("veteran-guarded-stance"); // Stacked → rank 1
    expect(unit.unitRank).toBe(1);

    // Lethal blow: the token is discarded (rulebook p.67), carrying the excess —
    // exactly as without the module — and the rank reverts to a plain bank card.
    unit.damage = 8; // >= 6, 2 excess over the Stacked Health
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.stackToken).toBeNull();
    expect(unit.maxHealth).toBe(5);
    expect(unit.abilities).not.toContain("veteran-guarded-stance"); // rank gone with the token
    expect(unit.unitRank).toBeUndefined();
    expect(unit.damage).toBe(2);
    expect(state.eventLog.some((e) => e.type === "STACK_TOKEN_DISCARDED" && e.unitId === "u1")).toBe(true);
    expect(state.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === "u1")).toBe(false);
  });

  it("threads through the real bank build: Stacked defenders rank, unstacked do not", () => {
    const on = createAdventureGameState({
      seed: "nru-bankbuild-on",
      rollFirstPlayer: false,
      ruleset: "binh",
      wog: { enabled: true, neutralRankUp: true, newCreatures: false },
      houseRules: { "polish-bank-sizes": true }
    });
    // Polish size 4 → all four naga defenders are guaranteed Stacked.
    const built = buildCreatureBankCombatUnits(on, "naga_bank", 4);
    expect(built.stackedCount).toBe(4);
    for (const unit of built.units) {
      expect(unit.stackToken).toBeTruthy();
      expect(unit.unitRank).toBe(1); // Stacked → Seasoned
    }

    // CONTROL: module off → the same Stacked build carries no rank.
    const off = createAdventureGameState({
      seed: "nru-bankbuild-off",
      rollFirstPlayer: false,
      ruleset: "binh",
      houseRules: { "polish-bank-sizes": true }
    });
    const offBuilt = buildCreatureBankCombatUnits(off, "naga_bank", 4);
    expect(offBuilt.stackedCount).toBe(4);
    for (const unit of offBuilt.units) {
      expect(unit.stackToken).toBeTruthy();
      expect(unit.unitRank).toBeUndefined();
    }
  });

  it("banks are EXCLUDED from the ROUNDS half (no round-rank at round 12)", () => {
    const bankUnit = makeCombatUnitFromNeutral(bankNagaDraw, "u1", 0, "legacy")!;
    const baseAttack = bankUnit.attack;
    applyNeutralRoundsRank(bankUnit, 12); // bank guard → guarded no-op
    expect(bankUnit.unitRank).toBeUndefined();
    expect(bankUnit.attack).toBe(baseAttack);
    expect(bankUnit.unitExperience).toBeUndefined();
  });
});

// ===========================================================================
// Scope — the computer guaranteed-win smoothing is unaffected
// ===========================================================================

describe("Neutral Rank-Up — scope guardrails", () => {
  it("the computer guaranteed-win smoothing still auto-wins flawlessly with the module on", () => {
    let state = createAdventureGameState({
      seed: "nru-guaranteed-win",
      difficulty: "normal",
      rollFirstPlayer: false,
      ruleset: "binh",
      wog: { enabled: true, neutralRankUp: true, newCreatures: false },
      sessionMode: "single-player",
      controllers: { p1: standardComputerController() }
    });
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    // Determinism: keep Diplomacy/Tactics out of the pre-battle windows.
    state.players.p1.hand = state.players.p1.hand.filter(
      (id) => id !== "ability.diplomacy" && id !== "ability.tactics"
    );
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "treasure_symbol",
      difficulty: 1, // eligible for the smoothing
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    hero.spaceId = "guard-field";
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);

    // Deploy one unit and finish placement → guards reveal (ranked) then the
    // guaranteed win wipes them at combat start regardless of their stats.
    expect(state.phase).toBe("combat-setup");
    const armyUnit = state.players.p1.army[0];
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    expect(state.eventLog.some((e) => e.type === "COMPUTER_GUARANTEED_WIN")).toBe(true);
    const outcome = state.combat?.outcome;
    expect(outcome?.winnerPlayerId).toBe("p1");
    // Flawless: every guard is dead, the attacker's deployed unit is undamaged.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) {
        expect(unit.damage).toBeGreaterThanOrEqual(unit.maxHealth);
      } else {
        expect(unit.damage).toBe(0);
      }
    }
  });
});
