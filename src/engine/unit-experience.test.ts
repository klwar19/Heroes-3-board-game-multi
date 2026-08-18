import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_UNIT_RANK,
  UNIT_RANK_ABILITY_ICONS,
  UNIT_RANK_STAT_ICONS,
  UNIT_RANK_THRESHOLDS,
  UNIT_STAT_STEPS,
  UNIT_XP_BANK_MIN,
  UNIT_XP_PVP_WIN,
  hasUniqueRankSchedule,
  rankScheduleFor,
  rankAbilityTrackFor,
  scheduleAbilityCount,
  unitStatStepsFor,
  unitRankAbilityIcon
} from "@/data/units/experience";
import { coreUnitDefinitions } from "@/data/factions/units";
import { HERO_GRADE_NODE_IDS } from "@/data/anime/hero-grades";
import { unitAbilities } from "@/data/units/abilities";
import { mgqJobsForUnit } from "./mgq-jobs";
import { getLegalMoveDestinations } from "./legal-actions";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  DEFAULT_ANIME_OPTIONS,
  getLegalActions,
  getMainHero,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  NEUTRAL_PLAYER_ID
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { makeCombatUnitFromNeutral } from "./adventure";
import { applyUnitCurrentSide } from "./unit-transforms";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, GameAction, GameState } from "./state";
import {
  armyUnitRankInfo,
  awardUnitExperienceAfterCombat,
  printedAbilityIdsOf,
  unitRankAbilityIds,
  unitRankAbilityGainsAt,
  unitRankForExperience,
  unitRankStatBonuses,
  unitRankStatBonusesFor,
  unitRankStatGainsAt,
  unitRankStep
} from "./unit-experience";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeAdventure(
  seed: string,
  options: {
    unitExperience?: boolean;
    ruleset?: "legacy" | "binh";
    wog?: { enabled: boolean; unitExperience?: boolean; commanders?: boolean };
    anime?: { enabled: boolean; unitExperience?: boolean; heroGrades?: boolean; isekaiTowns?: boolean; xianxiaTowns?: boolean };
    houseRules?: Record<string, boolean>;
    players?: { id: string; name: string; factionId: string; heroId?: string }[];
  } = {}
): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: options.ruleset ?? "legacy",
    ...(options.unitExperience !== undefined ? { unitExperience: options.unitExperience } : {}),
    ...(options.wog ? { wog: options.wog } : {}),
    ...(options.anime ? { anime: options.anime } : {}),
    ...(options.houseRules ? { houseRules: options.houseRules } : {}),
    ...(options.players ? { players: options.players } : {})
  } as Parameters<typeof createAdventureGameState>[0]);
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function finishNeutralCombat(
  state: GameState,
  units: CombatState["units"],
  outcomeWinner: "p1" | typeof NEUTRAL_PLAYER_ID,
  context?: Partial<Extract<CombatState["context"], { kind: "neutral" }>>,
  heroLevel = 10
): void {
  const hero = getMainHero(state, "p1")!;
  // Default the winner's hero high enough that the base-XP-≤-hero-level cap does
  // not bind — the difficulty/bank award assertions test the base amount, and
  // the cap has its own focused test (which passes an explicit low heroLevel).
  hero.level = heroLevel;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units,
    setup: null,
    awaitingContinue: false,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId!,
      difficulty: 3,
      hasAzure: false,
      ...context
    },
    outcome:
      outcomeWinner === "p1"
        ? { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" }
        : { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
  } as CombatState;
  finalizeAdventureCombat(state);
}

const MARKSMEN = { id: "xp_marksmen", unitDefId: "castle.marksmen", side: "few" as const };
const GRIFFINS = { id: "xp_griffins", unitDefId: "castle.griffins", side: "pack" as const };
const ZEALOTS = { id: "xp_zealots", unitDefId: "castle.zealots", side: "few" as const };
const HALBERDIERS = { id: "xp_halbs", unitDefId: "castle.halberdiers", side: "few" as const };

describe("Unit Experience — rank math & either/or rewards", () => {
  it("tier-scaled even ladder XP: bronze 5/9/13/17 (gold ranks slower, not stronger)", () => {
    expect(UNIT_RANK_THRESHOLDS.bronze).toEqual([5, 9, 13, 17]);
    expect(UNIT_RANK_THRESHOLDS.gold).toEqual([8, 13, 19, 25]);
    expect(MAX_UNIT_RANK).toBe(4);
    expect(unitRankForExperience("bronze", 5)).toBe(1);
    expect(unitRankForExperience("bronze", 9)).toBe(2);
    expect(unitRankForExperience("bronze", 13)).toBe(3);
    expect(unitRankForExperience("bronze", 17)).toBe(4);
    expect(unitRankForExperience("gold", 7)).toBe(0);
    expect(unitRankForExperience("gold", 8)).toBe(1);
  });

  it("the LIVE stat ladder is per-unit (unitStatStepsFor), not the tier table", () => {
    // The fold that actually runs reads unitStatStepsFor(unitDefId, tier) — the
    // per-unit ladder. Pinned on two units whose ladders genuinely DIVERGE from
    // the tier table, so this fails if the fold ever falls back to UNIT_STAT_STEPS.
    expect(unitStatStepsFor("castle.halberdiers", "bronze")[0]).toEqual({
      attack: 1,
      defense: 0,
      health: 0,
      initiative: 0
    });
    expect(unitStatStepsFor("castle.marksmen", "bronze")[0]).toEqual({
      attack: 0,
      defense: 1,
      health: 0,
      initiative: 0
    });
    expect(unitStatStepsFor("castle.halberdiers", "bronze")[0]).not.toEqual(UNIT_STAT_STEPS.bronze[0]);
    // …and the cumulative fold really uses it. Halberdiers' R1/R2 are ability
    // ranks, so their FIRST stat step lands at R3 — and it is the per-unit
    // ladder's +1 Attack, not the bronze table's +1 Defense.
    expect(unitRankStatBonusesFor("castle.halberdiers", "bronze", 2)).toEqual({
      attack: 0,
      defense: 0,
      health: 0,
      initiative: 0
    });
    expect(unitRankStatBonusesFor("castle.halberdiers", "bronze", 3)).toEqual({
      attack: 1,
      defense: 0,
      health: 0,
      initiative: 0
    });

    // The flat tier table survives ONLY through the deprecated 2-arg overload
    // (tier, rank), which the engine no longer calls. Pinned so a caller that
    // still uses it keeps its documented shape.
    expect(UNIT_STAT_STEPS.bronze[0]).toEqual({ attack: 0, defense: 1, health: 0, initiative: 0 });
    expect(UNIT_STAT_STEPS.gold[0]).toEqual({ attack: 1, defense: 0, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("bronze", 2)).toEqual({ attack: 1, defense: 1, health: 0, initiative: 0 });
  });

  it("unit-aware balance: printed Defense 3 never gains Defense", () => {
    expect(unitStatStepsFor("castle.archangels", "gold")).toEqual([
      { attack: 0, defense: 0, health: 0, initiative: 1 },
      { attack: 1, defense: 0, health: 0, initiative: 0 },
      { attack: 0, defense: 0, health: 1, initiative: 0 }
    ]);
    expect(unitRankStatBonusesFor("castle.archangels", "gold", 4)).toEqual({
      attack: 0,
      defense: 0,
      health: 0,
      initiative: 1
    });
    for (const def of Object.values(coreUnitDefinitions)) {
      const printedDefense = Math.max(def.few?.defense ?? 0, def.pack?.defense ?? 0, def.neutral?.defense ?? 0);
      if (printedDefense < 3) continue;
      expect(unitRankStatBonusesFor(def.id, def.tier, 4).defense, def.id).toBe(0);
    }
  });

  it("R1 uses only the approved small reward pool (every unit but the two overrides)", () => {
    const flatDefenseIds = new Set([
      "stronghold.wolf_raiders", "fuyuki.riders", "azure_breeze.spirit_crane", "hidden_leaf.anbu",
      "azur_lane.javelin", "heavenly_demon.bone_reavers", "little_busters.haruka", "mgq.miyabi",
      "mgq.hild", "mgq.pochi", "conflux.ice_elementals", "dungeon.minotaurs", "necropolis.wraiths",
      "inferno.demons", "tower.genies", "rampart.dendroids", "castle.marksmen", "fortress.gnolls",
      "wog.ghost", "doom.former_human", "doom.cacodemon"
    ]);
    for (const def of Object.values(coreUnitDefinitions)) {
      const step = rankScheduleFor(def.id)[1];
      // The two EXPLICIT R1 overrides are the ONLY units outside the pool.
      if (def.id === "fortress.hydras") {
        expect(step.kind === "ability" && step.choices).toEqual(["veteran-fear-aura"]);
        continue;
      }
      if (def.id === "castle.champions") {
        expect(step.kind === "ability" && step.choices).toEqual(["veteran-moving-pierce"]);
        continue;
      }
      // Every other unit is generator-served at R1: one point of stats, or one
      // of the three approved small abilities.
      const gain = unitStatStepsFor(def.id, def.tier)[0]!;
      expect(gain.attack + gain.defense + gain.health + gain.initiative, def.id).toBe(1);
      if (step.kind === "stats") {
        expect(gain.attack, def.id).toBe(0);
        if (gain.defense > 0) expect(flatDefenseIds.has(def.id), def.id).toBe(true);
      } else {
        expect(step.choices, def.id).toHaveLength(1);
        expect([
          "veteran-attack-when-attacking",
          "veteran-retaliation-fury",
          "veteran-guarded-stance"
        ], def.id).toContain(step.choices[0]);
      }
    }
    for (const unitDefId of flatDefenseIds) {
      const def = coreUnitDefinitions[unitDefId]!;
      expect(unitRankStatGainsAt(unitDefId, def.tier, 1).defense, unitDefId).toBe(1);
    }
  });

  it("REGISTRY: every resolved reward choice is implemented", () => {
    const ids = new Set<string>();
    for (const unitDefId of Object.keys(coreUnitDefinitions)) {
      const schedule = rankScheduleFor(unitDefId);
      for (const r of [1, 2, 3, 4] as const) {
        const step = schedule[r];
        if (step.kind !== "stats") for (const id of step.choices) ids.add(id);
      }
    }
    expect(ids.size).toBeGreaterThan(10);
    for (const abilityId of ids) {
      const ability = unitAbilities[abilityId];
      expect(ability, abilityId).toBeTruthy();
      expect(ability.implementationStatus).toBe("implemented");
      expect(ability.requiresStacked).not.toBe(true);
    }
  });

  it("explicit signature examples resolve exactly at their requested ranks", () => {
    expect(unitRankAbilityIds("necropolis.skeletons", 4)).toContain("veteran-rebirth");
    expect(unitRankAbilityIds("tower.magi", 4)).toContain("veteran-spell-sunder");
    expect(unitRankAbilityIds("rampart.unicorns", 4)).toContain("veteran-low-roll-insight");
    expect(unitRankAbilityIds("castle.zealots", 4)).toContain("veteran-defense-pierce");
    expect(unitRankAbilityIds("necropolis.ghost_dragons", 4)).toContain("veteran-soul-feast");
    expect(rankScheduleFor("dungeon.black_dragons")[3]).toMatchObject({
      kind: "hybrid",
      stats: { initiative: 2 },
      choices: ["veteran-speed-hunter"]
    });
    expect(rankScheduleFor("conflux.phoenixes")[3]).toMatchObject({
      kind: "ability",
      choices: ["veteran-regeneration-2"]
    });
    expect(unitRankStatGainsAt("fortress.gorgons", "silver", 1)).toMatchObject({ initiative: 1 });
    expect(unitRankAbilityIds("fortress.hydras", 1)).toContain("veteran-fear-aura");
    expect(unitRankAbilityIds("stronghold.behemoths", 3)).toContain("veteran-flying-movement");
    expect(unitRankAbilityIds("conflux.sprites", 4)).toContain("pegasi-magic-damper");
    expect(unitRankAbilityIds("castle.archangels", 3)).toContain("veteran-layer-draw");
    expect(unitRankAbilityIds("castle.champions", 1)).toContain("veteran-moving-pierce");
    expect(unitRankStatGainsAt("castle.champions", "gold", 2)).toMatchObject({ health: 1 });
    expect(rankScheduleFor("castle.champions")[3]).toMatchObject({
      kind: "hybrid",
      stats: { initiative: 2 },
      choices: ["veteran-mobility-1"]
    });
    expect(unitRankAbilityIds("castle.crusaders", 4)).toContain("veteran-double-attack");
    expect(unitRankAbilityIds("inferno.pit_lords", 4)).toContain("veteran-defense-pierce");
    expect(unitRankStatGainsAt("inferno.magogs", "bronze", 4)).toMatchObject({ health: 2 });
    expect(unitRankAbilityIds("necropolis.dread_knights", 4)).toContain("reduce-spell-and-specialty-damage-2");
  });

  it("every core/anime unit has four non-empty rewards; grants are cumulative", () => {
    const unitIds = Object.keys(coreUnitDefinitions).filter(
      (id) =>
        !id.startsWith("neutral.") &&
        !id.includes("city_hall") &&
        !id.includes("dwelling") &&
        !id.includes("mage_guild") &&
        !id.includes("citadel") &&
        !id.includes("pavilion") &&
        !id.includes("outfitter") &&
        !id.includes("summoning") &&
        !id.includes("alchemy")
    );
    expect(unitIds.length).toBeGreaterThan(80);
    let uniqueCount = 0;
    for (const unitDefId of unitIds) {
      if (hasUniqueRankSchedule(unitDefId)) uniqueCount += 1;
      const schedule = rankScheduleFor(unitDefId);
      for (const r of [1, 2, 3, 4] as const) {
        const step = schedule[r];
        // "non-empty" is the claim in the title: every rank pays SOMETHING —
        // an ability choice list, or a stat step the ladder can serve.
        if (step.kind === "stats") {
          const gains = unitRankStatGainsAt(unitDefId, coreUnitDefinitions[unitDefId]!.tier, r);
          expect(
            gains.attack + gains.defense + gains.health + gains.initiative,
            `${unitDefId} R${r}`
          ).toBeGreaterThan(0);
        } else {
          expect(step.choices.length, `${unitDefId} R${r}`).toBeGreaterThan(0);
          expect(unitRankAbilityGainsAt(unitDefId, r), `${unitDefId} R${r}`).toHaveLength(1);
        }
      }
      const budget = scheduleAbilityCount(schedule);
      expect(budget).toBeGreaterThanOrEqual(1);
      expect(budget).toBeLessThanOrEqual(4);
      const maxIds = unitRankAbilityIds(unitDefId, 4);
      expect(maxIds.length).toBeLessThanOrEqual(budget);
      for (let r = 1; r <= 4; r++) {
        const prev = unitRankAbilityIds(unitDefId, r - 1);
        const cur = unitRankAbilityIds(unitDefId, r);
        for (const id of prev) expect(cur).toContain(id);
      }
    }
    // hasUniqueRankSchedule is a REAL read: it is true only for the units that
    // own an EXPLICIT signature rank, false for everything the generator serves.
    // (It used to be `Boolean(coreUnitDefinitions[id])` — a tautology that could
    // never fail — and later a lookup in a bespoke table that no longer exists.)
    expect(uniqueCount).toBeGreaterThan(5);
    expect(uniqueCount).toBeLessThan(unitIds.length / 2);
  });

  it("SCHEDULE PRECEDENCE: explicit per-unit override > flavour generator, and nothing else", () => {
    // The redesign (26f6e37f / 2d2da234) has exactly TWO tiers. The old
    // hand-authored UNIT_RANK_SCHEDULES table is DELETED, and
    // docs/unit-experience-balance-sheet.md is the design authority.
    //
    // (i) an explicit override wins its rank…
    expect(hasUniqueRankSchedule("castle.crusaders")).toBe(true);
    expect(rankScheduleFor("castle.crusaders")[4]).toMatchObject({
      kind: "ability",
      choices: ["veteran-double-attack"]
    });
    // …while every OTHER rank of that same unit is the generator's cavalry
    // rotation (a bespoke entry would have made R2 a single lore-keyed choice).
    expect(rankScheduleFor("castle.crusaders")[2]).toEqual({
      kind: "ability",
      choices: [
        "veteran-retaliation-fury",
        "veteran-attack-when-attacking",
        "wog-no-negative-attack-roll",
        "commander-charge"
      ]
    });
    expect(rankScheduleFor("castle.crusaders")[3]).toEqual({ kind: "stats" });

    // (ii) a unit with NO override is the generator top to bottom. Halberdiers
    // are the canonical case: the deleted table gave them S / A(thick-hide,
    // air-shield) / S / S, so this whole schedule fails if a bespoke tier is
    // ever re-plugged into the resolver.
    expect(hasUniqueRankSchedule("castle.halberdiers")).toBe(false);
    expect(rankScheduleFor("castle.halberdiers")).toEqual({
      1: { kind: "ability", choices: ["veteran-attack-when-attacking"] },
      2: {
        kind: "ability",
        choices: [
          "commander-charge",
          "wog-no-negative-attack-roll",
          "veteran-attack-when-attacking",
          "veteran-guarded-stance"
        ]
      },
      3: { kind: "stats" },
      4: {
        kind: "ability",
        choices: [
          "veteran-defense-pierce",
          "veteran-rebirth",
          "unlimited-retaliation",
          "commander-max-damage"
        ]
      }
    });
    expect(hasUniqueRankSchedule("neutral.boars")).toBe(false);
    expect(rankScheduleFor("neutral.boars")[2].kind).toBe("ability");

    // (iii) the reward economy is EXACTLY the override ids plus the generator
    // pools. These arms lived only in the deleted table, so their reappearance
    // in a resolved schedule means the bespoke tier is back.
    const reachable = new Set<string>();
    for (const unitDefId of Object.keys(coreUnitDefinitions)) {
      const schedule = rankScheduleFor(unitDefId);
      for (const r of [1, 2, 3, 4] as const) {
        const step = schedule[r];
        if (step.kind !== "stats") for (const id of step.choices) reachable.add(id);
      }
    }
    for (const deletedTableOnlyId of [
      "kansen-full-barrage",
      "kansen-fleet-formation",
      "gorgon-death-stare",
      "unicorn-paralyze-retaliation",
      "bulwark-thick-hide",
      "gargoyle-spell-ward",
      "ignore-paralysis",
      "zombie-resilience",
      "attack-roll-advantage",
      "sandworm-strike-again",
      "ignore-combat-penalties"
    ]) {
      expect(
        reachable.has(deletedTableOnlyId),
        `${deletedTableOnlyId} came only from the deleted UNIT_RANK_SCHEDULES table`
      ).toBe(false);
    }
  });

  it("INVARIANT: a DOUBLE_ATTACK reward is never handed to a unit that cannot shoot", () => {
    // maybeDeclareDoubleAttack refuses a DOUBLE_ATTACK without `anyRange` unless
    // the attack itself was ranged (getAttackKind needs attacker.type
    // "ranged"), so such a reward on a ground/flying body is a dead rank.
    let checked = 0;
    for (const def of Object.values(coreUnitDefinitions)) {
      const canShoot = [def.few, def.pack, def.neutral].some((side) => side?.type === "ranged");
      for (const abilityId of unitRankAbilityIds(def.id, MAX_UNIT_RANK)) {
        const effect = unitAbilities[abilityId]?.effect;
        if (effect?.type !== "DOUBLE_ATTACK") continue;
        checked += 1;
        expect(
          Boolean(effect.anyRange) || canShoot,
          `${def.id} is granted ${abilityId} but never shoots`
        ).toBe(true);
      }
    }
    expect(checked, "the sweep must actually reach some DOUBLE_ATTACK grants").toBeGreaterThan(5);
  });

  it("INVARIANT: no granted rank ability is a strict no-op against the unit's printed kit", () => {
    // First-match / max-wins readers: a second copy of these effects can never
    // move a number, so the rank must fall through to the next choice instead.
    const coverage = (effect: { ownAttackOnly?: boolean; retaliationOnly?: boolean }) =>
      effect.ownAttackOnly ? "own" : effect.retaliationOnly ? "retaliation" : "any";
    let checked = 0;
    for (const def of Object.values(coreUnitDefinitions)) {
      const printed = [...printedAbilityIdsOf(def.id)]
        .map((id) => unitAbilities[id]?.effect)
        .filter(Boolean);
      const seen: NonNullable<(typeof printed)[number]>[] = [...printed] as never;
      for (const abilityId of unitRankAbilityIds(def.id, MAX_UNIT_RANK)) {
        const granted = unitAbilities[abilityId]?.effect;
        if (!granted) continue;
        for (const held of seen) {
          if (!held || held.type !== granted.type) continue;
          if (granted.type === "MINIMUM_ATTACK_DIE" && held.type === "MINIMUM_ATTACK_DIE") {
            checked += 1;
            expect(
              held.minimum < granted.minimum,
              `${def.id} → ${abilityId}: printed floor already ≥ this one`
            ).toBe(true);
          } else if (granted.type === "ATTACK_ROLL_ADVANTAGE" && held.type === "ATTACK_ROLL_ADVANTAGE") {
            checked += 1;
            expect(
              coverage(held) !== "any" && coverage(held) !== coverage(granted),
              `${def.id} → ${abilityId}: printed advantage already covers it`
            ).toBe(true);
          } else if (
            ["ON_ATTACK_HEAL_SELF", "SELF_REBIRTH_ONCE", "DOUBLE_ATTACK", "MOVE_ANYWHERE"].includes(
              granted.type
            )
          ) {
            checked += 1;
            expect(
              false,
              `${def.id} → ${abilityId}: the ${granted.type} reader takes the FIRST match, so this grant is dead`
            ).toBe(true);
          }
        }
        seen.push(granted as never);
      }
    }
    // The sweep is only meaningful because the dedupe FIRES. The two known
    // offenders now fall through to the next choice in their rotation instead
    // of buying a rank that changes nothing:
    //  • wog.sylvan_centaur R2 — veteran-steady-aim (MINIMUM_ATTACK_DIE 0) over
    //    its printed wog-no-negative-attack-roll (the same floor).
    const centaurR2 = rankScheduleFor("wog.sylvan_centaur")[2];
    expect(centaurR2.kind).toBe("ability");
    // The schedule still OFFERS it first — the resolver is what skips it.
    expect(centaurR2.kind === "ability" && centaurR2.choices[0]).toBe("veteran-steady-aim");
    expect(unitRankAbilityGainsAt("wog.sylvan_centaur", 2)).toEqual(["bulwark-air-shield"]);
    //  • neutral.vampires R4 — veteran-soul-feast (ON_ATTACK_HEAL_SELF 1) over
    //    its printed vampire-heal-on-attack (amount 2, and the reader takes the
    //    FIRST match anyway).
    expect(unitRankAbilityIds("neutral.vampires", 4)).not.toContain("veteran-soul-feast");
    expect(unitRankAbilityGainsAt("neutral.vampires", 4)).toEqual(["wraith-enemy-discard"]);
    // `checked` counts the same-type (granted, held) pairs the sweep actually
    // JUDGED. Today exactly two survive as legitimate stacks — doom.mancubus
    // (printed retaliation-only advantage + the granted unconditional one) and
    // neutral.halflings (printed own-attack-only + the granted unconditional
    // one) — so a 0 here would mean the sweep stopped looking at anything.
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it("every shared ability and stat reward resolves to dedicated veterancy art on disk", () => {
    for (const [id, icon] of Object.entries(UNIT_RANK_ABILITY_ICONS)) {
      expect(icon, id).toContain("/assets/ui/rank-ability/");
      expect(existsSync(join(process.cwd(), "public", icon.replace(/^\//, ""))), id).toBe(true);
      expect(unitRankAbilityIcon(id), id).toBe(icon);
    }
    for (const [stat, icon] of Object.entries(UNIT_RANK_STAT_ICONS)) {
      expect(icon, stat).toContain("/assets/ui/rank-stat/");
      expect(existsSync(join(process.cwd(), "public", icon.replace(/^\//, ""))), stat).toBe(true);
    }
  });

  it("every offered MGQ unit/job path grants a non-empty reward at every rank", () => {
    for (const def of Object.values(coreUnitDefinitions).filter((unit) => unit.faction === "mgq")) {
      for (const job of mgqJobsForUnit(def.id)) {
        for (const rank of [1, 2, 3, 4]) {
          const stat = unitRankStatGainsAt(def.id, def.tier, rank, job);
          const statTotal = stat.attack + stat.defense + stat.health + stat.initiative;
          const abilities = unitRankAbilityGainsAt(def.id, rank, job);
          expect(statTotal + abilities.length, `${def.id}/${job}/R${rank}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("Unit Experience — anime commanders auto-enable", () => {
  it("anime towns / Fuyuki seat forces WOG Commanders on (BINH)", () => {
    const state = makeAdventure("cmd-anime", {
      ruleset: "binh",
      anime: { enabled: true, isekaiTowns: true },
      players: [
        { id: "p1", name: "P1", factionId: "fuyuki" },
        { id: "p2", name: "P2", factionId: "castle" }
      ]
    });
    expect(state.wog?.enabled).toBe(true);
    expect(state.wog?.commanders).toBe(true);
    expect(state.players.p1.commander?.slug).toBe("ruler");
    expect(state.players.p2.commander?.slug).toBe("paladin");
  });

  it("CONTROL: plain table without anime towns leaves commanders off by default", () => {
    const state = makeAdventure("cmd-off", { ruleset: "binh" });
    expect(state.wog?.commanders).not.toBe(true);
    expect(state.players.p1.commander).toBeUndefined();
  });
});

describe("Unit Experience — toggle surfaces", () => {
  it("is OFF by default; lobby / WOG / anime module freeze it ON", () => {
    expect(makeAdventure("uxp-default").adventure?.unitExperience).toBeUndefined();
    expect(makeAdventure("uxp-lobby", { unitExperience: true }).adventure?.unitExperience).toBe(true);
    expect(
      makeAdventure("uxp-wog", { ruleset: "binh", wog: { enabled: true, unitExperience: true } }).adventure
        ?.unitExperience
    ).toBe(true);
    expect(
      makeAdventure("uxp-anime", { ruleset: "binh", anime: { enabled: true, unitExperience: true } }).adventure
        ?.unitExperience
    ).toBe(true);
  });
});

describe("Unit Experience — XP awards after combat", () => {
  it("Combat Scholar adds 1 UNIT XP to each surviving deployed unit after a win", () => {
    const state = makeAdventure("uxp-combat-scholar", {
      unitExperience: true,
      anime: { enabled: true, unitExperience: true, heroGrades: true }
    });
    state.anime = { ...DEFAULT_ANIME_OPTIONS, ...state.anime, enabled: true, heroGrades: true };
    getMainHero(state, "p1")!.gradeNodes = [HERO_GRADE_NODE_IDS.combatScholar];
    state.players.p1.army = [{ ...MARKSMEN }];
    const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_scholar", 0, "legacy")!;
    finishNeutralCombat(state, { [survivor.id]: survivor }, "p1", { difficulty: 3 });
    expect(state.players.p1.army[0].experience).toBe(4);
  });

  it("a won neutral fight grants difficulty XP to SURVIVING deployed units only", () => {
    const state = makeAdventure("uxp-award", { unitExperience: true });
    state.players.p1.army = [{ ...MARKSMEN }, { ...GRIFFINS }, { ...ZEALOTS }];
    const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_survivor", 0, "legacy")!;
    const casualty = makeCombatUnitFromArmy(
      { ...state.players.p1.army[1], side: "few" },
      "p1",
      "u_casualty",
      1,
      "legacy"
    )!;
    casualty.damage = casualty.maxHealth;
    finishNeutralCombat(state, { [survivor.id]: survivor, [casualty.id]: casualty }, "p1", { difficulty: 5 });
    expect(state.players.p1.army.find((unit) => unit.id === MARKSMEN.id)?.experience).toBe(5);
    expect(state.players.p1.army.find((unit) => unit.id === GRIFFINS.id)).toBeUndefined();
    expect(state.players.p1.army.find((unit) => unit.id === ZEALOTS.id)?.experience).toBeUndefined();
    const rankUp = state.eventLog.find((event) => event.type === "UNIT_RANK_UP");
    expect(rankUp && "rank" in rankUp ? rankUp.rank : null).toBe(1);
  });

  it("CONTROL — rule OFF awards nothing; LOST fight trains nobody", () => {
    const off = makeAdventure("uxp-award-off");
    off.players.p1.army = [{ ...MARKSMEN }];
    const s = makeCombatUnitFromArmy(off.players.p1.army[0], "p1", "u_ctl", 0, "legacy")!;
    finishNeutralCombat(off, { [s.id]: s }, "p1", { difficulty: 3 });
    expect(off.players.p1.army[0].experience).toBeUndefined();

    const loss = makeAdventure("uxp-award-loss", { unitExperience: true });
    loss.players.p1.army = [{ ...MARKSMEN }];
    const u = makeCombatUnitFromArmy(loss.players.p1.army[0], "p1", "u_loss", 0, "legacy")!;
    finishNeutralCombat(loss, { [u.id]: u }, NEUTRAL_PLAYER_ID, { difficulty: 3 });
    expect(loss.players.p1.army[0].experience).toBeUndefined();
  });

  it("Pack→Few flip keeps XP; bank pays max(2, Stacked); PvP pays flat 2", () => {
    const state = makeAdventure("uxp-flip", { unitExperience: true });
    state.players.p1.army = [{ ...GRIFFINS, experience: 1 }];
    const unit = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_flip", 0, "legacy")!;
    unit.variant = "few";
    unit.damage = 0;
    finishNeutralCombat(state, { [unit.id]: unit }, "p1", { difficulty: 2 });
    expect(state.players.p1.army.find((e) => e.id === GRIFFINS.id)?.experience).toBe(3);

    const bank = makeAdventure("uxp-bank", { unitExperience: true });
    bank.players.p1.army = [{ ...MARKSMEN }];
    const bankUnit = makeCombatUnitFromArmy(bank.players.p1.army[0], "p1", "u_bank", 0, "legacy")!;
    finishNeutralCombat(bank, { [bankUnit.id]: bankUnit }, "p1", {
      difficulty: 0,
      bankId: "crypt",
      bankStackCount: 4
    });
    expect(bank.players.p1.army[0].experience).toBe(4);
    expect(UNIT_XP_BANK_MIN).toBe(2);

    const pvp = makeAdventure("uxp-pvp", { unitExperience: true });
    pvp.players.p1.army = [{ ...MARKSMEN }];
    pvp.players.p2.army = [{ id: "p2_zealots", unitDefId: "castle.zealots", side: "few" }];
    const winnerUnit = makeCombatUnitFromArmy(pvp.players.p1.army[0], "p1", "u_pvp_w", 0, "legacy")!;
    const loserUnit = makeCombatUnitFromArmy(pvp.players.p2.army[0], "p2", "u_pvp_l", 1, "legacy")!;
    pvp.combat = {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      units: { [winnerUnit.id]: winnerUnit, [loserUnit.id]: loserUnit },
      setup: null,
      awaitingContinue: false,
      context: { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "f" },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
    } as CombatState;
    awardUnitExperienceAfterCombat(pvp);
    expect(pvp.players.p1.army[0].experience).toBe(UNIT_XP_PVP_WIN);
    expect(pvp.players.p2.army[0].experience).toBeUndefined();
  });

  it("caps the neutral guard / bank BASE XP at the winner's main-hero level", () => {
    // Guard field: difficulty 5, but a level-2 hero caps the base at 2.
    const guard = makeAdventure("uxp-cap-guard", { unitExperience: true });
    guard.players.p1.army = [{ ...MARKSMEN }];
    const gUnit = makeCombatUnitFromArmy(guard.players.p1.army[0], "p1", "u_cap_g", 0, "legacy")!;
    finishNeutralCombat(guard, { [gUnit.id]: gUnit }, "p1", { difficulty: 5 }, 2);
    expect(guard.players.p1.army[0].experience).toBe(2);

    // Creature Bank: Stacked 4, but a level-1 hero caps the base at 1.
    const bank = makeAdventure("uxp-cap-bank", { unitExperience: true });
    bank.players.p1.army = [{ ...MARKSMEN }];
    const bUnit = makeCombatUnitFromArmy(bank.players.p1.army[0], "p1", "u_cap_b", 0, "legacy")!;
    finishNeutralCombat(bank, { [bUnit.id]: bUnit }, "p1", {
      difficulty: 0,
      bankId: "crypt",
      bankStackCount: 4
    }, 1);
    expect(bank.players.p1.army[0].experience).toBe(1);

    // CONTROL — a hero level at or above the base does not cap it.
    const uncapped = makeAdventure("uxp-cap-control", { unitExperience: true });
    uncapped.players.p1.army = [{ ...MARKSMEN }];
    const uUnit = makeCombatUnitFromArmy(uncapped.players.p1.army[0], "p1", "u_cap_c", 0, "legacy")!;
    finishNeutralCombat(uncapped, { [uUnit.id]: uUnit }, "p1", { difficulty: 5 }, 5);
    expect(uncapped.players.p1.army[0].experience).toBe(5);
  });
});

function resolveArmyAttack(
  seed: string,
  attackerArmy: { unitDefId: string; side: "few" | "pack" | "neutral"; experience?: number },
  defenderArmy?: { unitDefId: string; side: "few" | "pack" | "neutral"; experience?: number },
  defenderAttack = 0,
  defenderInitiative?: number,
  options: { defenderMaxHealth?: number; attackerMoved?: boolean; attackerDeck?: string[] } = {}
): GameState {
  let state = createInitialGameState(seed);
  const attacker = makeCombatUnitFromArmy(
    { id: "xp_att", ...attackerArmy },
    "p1",
    "unit_p1_griffins",
    9,
    "legacy"
  )!;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.movedThisActivation = options.attackerMoved ?? false;
  state.combat!.units.unit_p1_griffins = attacker;
  if (defenderArmy) {
    const defender = makeCombatUnitFromArmy(
      { id: "xp_def", ...defenderArmy },
      "p2",
      "unit_p2_skeletons",
      13,
      "legacy"
    )!;
    defender.position = 13;
    defender.maxHealth = options.defenderMaxHealth ?? 40;
    defender.attack = defenderAttack;
    if (defenderInitiative !== undefined) defender.initiative = defenderInitiative;
    state.combat!.units.unit_p2_skeletons = defender;
  } else {
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 1;
    defender.maxHealth = options.defenderMaxHealth ?? 40;
    defender.damage = 0;
    defender.abilities = [];
    defender.attack = defenderAttack;
    if (defenderInitiative !== undefined) defender.initiative = defenderInitiative;
  }
  state.combat!.dice.scriptedRolls = Array(8).fill(0);
  state.combat!.dice.rollCount = 0;
  if (options.attackerDeck) {
    state.players.p1.hand = [];
    state.players.p1.deck = [...options.attackerDeck];
  }
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
  let safety = 40;
  while (safety-- > 0 && (state.reactionWindow || state.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = state.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      state = applyOk(state, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return state;
}

describe("Unit Experience — observable redesigned effects in combat", () => {
  it("halberdiers R1 adds +1 Attack only when they initiate", () => {
    const control = resolveArmyAttack("uxp-r1-attack-ctl", {
      unitDefId: "castle.halberdiers",
      side: "few"
    });
    const seasoned = resolveArmyAttack("uxp-r1-attack", {
      unitDefId: "castle.halberdiers",
      side: "few",
      experience: 5
    });
    expect(seasoned.combat!.units.unit_p2_skeletons.damage).toBe(
      control.combat!.units.unit_p2_skeletons.damage + 1
    );
  });

  it("champions R2 adds +1 HP without changing their attack damage", () => {
    const rank1 = resolveArmyAttack("uxp-atk-r1", {
      unitDefId: "castle.champions",
      side: "few",
      experience: 8
    });
    const rank2 = resolveArmyAttack("uxp-atk-r2", {
      unitDefId: "castle.champions",
      side: "few",
      experience: 13
    });
    const d1 = rank1.combat!.units.unit_p2_skeletons.damage;
    expect(d1).toBeGreaterThan(0);
    expect(rank2.combat!.units.unit_p2_skeletons.damage).toBe(d1);
    expect(rank2.combat!.units.unit_p1_griffins.maxHealth).toBe(
      rank1.combat!.units.unit_p1_griffins.maxHealth + 1
    );
  });

  it("champions R4 ignores retaliation (R3 CONTROL still takes it)", () => {
    // Champions carry EXPLICIT overrides at R1-R3; R4 is the generator's
    // cavalry capstone rotation, whose first choice is ignores-retaliation.
    const control = resolveArmyAttack(
      "uxp-elite-ctl",
      { unitDefId: "castle.champions", side: "few", experience: 19 },
      undefined,
      6
    );
    const elite = resolveArmyAttack(
      "uxp-elite",
      { unitDefId: "castle.champions", side: "few", experience: 25 },
      undefined,
      6
    );
    expect(control.combat!.units.unit_p1_griffins.damage, "rank 3 still takes retaliation").toBeGreaterThan(0);
    expect(elite.combat!.units.unit_p1_griffins.damage, "rank 4 no retaliation").toBe(0);
    expect(makeCombatUnitFromArmy(
      { id: "c", unitDefId: "castle.champions", side: "few", experience: 25 },
      "p1",
      "u_c",
      0,
      "legacy"
    )!.abilities).toContain("ignores-retaliation");
    expect(unitRankAbilityGainsAt("castle.champions", 4)).toEqual(["ignores-retaliation"]);
  });

  it("marksmen R3 has 2 stats steps (+1 Def +1 Atk) but NOT HP/Init (those need a 3rd stats rank)", () => {
    const plain = makeCombatUnitFromArmy({ ...MARKSMEN }, "p1", "u_plain", 0, "legacy")!;
    const r3 = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 13 }, "p1", "u_r3", 0, "legacy")!;
    expect(r3.unitRank).toBe(3);
    expect(r3.defense).toBe(plain.defense + 1);
    expect(r3.attack).toBe(plain.attack + 1);
    expect(r3.maxHealth).toBe(plain.maxHealth); // no 3rd stats step on 2-ability path
    expect(r3.initiative).toBe(plain.initiative);
    expect(r3.abilities).toContain("bulwark-air-shield"); // from R2 ability
  });

  it("marksmen R4 grants Legend ability (no extra stats over R3)", () => {
    const r3 = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 13 }, "p1", "u_r3b", 0, "legacy")!;
    const r4 = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 17 }, "p1", "u_r4", 0, "legacy")!;
    expect(r4.unitRank).toBe(4);
    expect(r4.attack).toBe(r3.attack);
    expect(r4.defense).toBe(r3.defense);
    expect(r4.abilities).toContain("ranged-extra-shot-on-low-roll");
  });

  it("Black Dragons R3 gain +2 Initiative and +1 Attack against a slower target", () => {
    const veteran = makeCombatUnitFromArmy(
      { id: "bd2", unitDefId: "dungeon.black_dragons", side: "few", experience: 13 },
      "p1",
      "bd2",
      0,
      "legacy"
    )!;
    const elite = makeCombatUnitFromArmy(
      { id: "bd3", unitDefId: "dungeon.black_dragons", side: "few", experience: 19 },
      "p1",
      "bd3",
      0,
      "legacy"
    )!;
    expect(elite.initiative).toBe(veteran.initiative + 2);
    expect(elite.abilities).toContain("veteran-speed-hunter");

    const control = resolveArmyAttack("uxp-black-dragon-r2", {
      unitDefId: "dungeon.black_dragons",
      side: "few",
      experience: 13
    });
    const rank3 = resolveArmyAttack("uxp-black-dragon-r3", {
      unitDefId: "dungeon.black_dragons",
      side: "few",
      experience: 19
    });
    expect(rank3.combat!.units.unit_p2_skeletons.damage).toBe(
      control.combat!.units.unit_p2_skeletons.damage + 1
    );
    const fasterControl = resolveArmyAttack(
      "uxp-black-dragon-fast-r2",
      { unitDefId: "dungeon.black_dragons", side: "few", experience: 13 },
      undefined,
      0,
      99
    );
    const fasterRank3 = resolveArmyAttack(
      "uxp-black-dragon-fast-r3",
      { unitDefId: "dungeon.black_dragons", side: "few", experience: 19 },
      undefined,
      0,
      99
    );
    expect(fasterRank3.combat!.units.unit_p2_skeletons.damage).toBe(
      fasterControl.combat!.units.unit_p2_skeletons.damage
    );
  });

  it("Behemoths R3 use real flying movement to cross a blocking unit", () => {
    const state = createInitialGameState("uxp-behemoth-flying");
    const ground = makeCombatUnitFromArmy(
      { id: "behemoth-r2", unitDefId: "stronghold.behemoths", side: "few", experience: 13 },
      "p1",
      "behemoth-r2",
      0,
      "legacy"
    )!;
    const flying = makeCombatUnitFromArmy(
      { id: "behemoth-r3", unitDefId: "stronghold.behemoths", side: "few", experience: 19 },
      "p1",
      "behemoth-r3",
      0,
      "legacy"
    )!;
    const blocker = state.combat!.units.unit_p2_skeletons;
    blocker.position = 1;

    state.combat!.units = { [ground.id]: ground, [blocker.id]: blocker };
    expect(ground.type).toBe("ground");
    expect(getLegalMoveDestinations(state.combat!, ground)).not.toContain(2);

    state.combat!.units = { [flying.id]: flying, [blocker.id]: blocker };
    expect(flying.type).toBe("flying");
    expect(getLegalMoveDestinations(state.combat!, flying)).toContain(2);
  });

  it("Champions R1 pierce 1 Defense only after moving", () => {
    const control = resolveArmyAttack(
      "uxp-champion-pierce-control",
      { unitDefId: "castle.champions", side: "few" },
      undefined,
      0,
      undefined,
      { attackerMoved: true }
    );
    const moved = resolveArmyAttack(
      "uxp-champion-pierce-moved",
      { unitDefId: "castle.champions", side: "few", experience: 8 },
      undefined,
      0,
      undefined,
      { attackerMoved: true }
    );
    const unmoved = resolveArmyAttack("uxp-champion-pierce-unmoved", {
      unitDefId: "castle.champions",
      side: "few",
      experience: 8
    });
    expect(moved.combat!.units.unit_p2_skeletons.damage).toBe(
      control.combat!.units.unit_p2_skeletons.damage + 1
    );
    expect(unmoved.combat!.units.unit_p2_skeletons.damage).toBe(
      control.combat!.units.unit_p2_skeletons.damage
    );
  });

  it("Champions R3 gain +2 Initiative and one real movement space", () => {
    const state = createInitialGameState("uxp-champion-mobility");
    const rank2 = makeCombatUnitFromArmy(
      { id: "champ-r2", unitDefId: "castle.champions", side: "few", experience: 13 },
      "p1",
      "champ-r2",
      0,
      "legacy"
    )!;
    const rank3 = makeCombatUnitFromArmy(
      { id: "champ-r3", unitDefId: "castle.champions", side: "few", experience: 19 },
      "p1",
      "champ-r3",
      0,
      "legacy"
    )!;
    state.combat!.units = { [rank2.id]: rank2 };
    expect(getLegalMoveDestinations(state.combat!, rank2)).not.toContain(7);
    state.combat!.units = { [rank3.id]: rank3 };
    expect(rank3.initiative).toBe(rank2.initiative + 2);
    expect(getLegalMoveDestinations(state.combat!, rank3)).toContain(7);
  });

  it("Archangels R3 draw when their attack defeats a Pack side", () => {
    const rank2 = resolveArmyAttack(
      "uxp-archangel-layer-control",
      { unitDefId: "castle.archangels", side: "few", experience: 13 },
      { unitDefId: "castle.griffins", side: "pack" },
      0,
      undefined,
      { defenderMaxHealth: 4, attackerDeck: ["stat.attack"] }
    );
    const rank3 = resolveArmyAttack(
      "uxp-archangel-layer-draw",
      { unitDefId: "castle.archangels", side: "few", experience: 19 },
      { unitDefId: "castle.griffins", side: "pack" },
      0,
      undefined,
      { defenderMaxHealth: 4, attackerDeck: ["stat.attack"] }
    );
    expect(rank2.players.p1.hand).toHaveLength(0);
    expect(rank3.players.p1.hand).toEqual(["stat.attack"]);
    expect(rank3.combat!.units.unit_p2_skeletons.variant).toBe("few");
  });

  it("Crusaders R4 attack an adjacent target twice", () => {
    const rank3 = resolveArmyAttack("uxp-crusader-r3", {
      unitDefId: "castle.crusaders",
      side: "few",
      experience: 15
    });
    const rank4 = resolveArmyAttack("uxp-crusader-r4", {
      unitDefId: "castle.crusaders",
      side: "few",
      experience: 20
    });
    expect(rank4.combat!.units.unit_p2_skeletons.damage).toBe(
      rank3.combat!.units.unit_p2_skeletons.damage * 2
    );
  });

  it("halberdiers R3 adds a single Attack stat while ability ranks stay stat-neutral", () => {
    // Generator-served end to end (A / A / S / A): R1 and R2 are abilities, so
    // the FIRST stat step of the per-unit ladder (+1 Attack) lands at R3.
    const plain = makeCombatUnitFromArmy({ ...HALBERDIERS }, "p1", "u_h0", 0, "legacy")!;
    const r2 = makeCombatUnitFromArmy({ ...HALBERDIERS, experience: 9 }, "p1", "u_h2", 0, "legacy")!;
    const r3 = makeCombatUnitFromArmy({ ...HALBERDIERS, experience: 13 }, "p1", "u_h3", 0, "legacy")!;
    expect(unitRankStep("castle.halberdiers", 2)?.kind).toBe("ability");
    expect(r2.attack).toBe(plain.attack);
    expect(r2.abilities).toContain("commander-charge");
    expect(r3.attack).toBe(plain.attack + 1);
    expect(r3.defense).toBe(plain.defense);
    const r4 = makeCombatUnitFromArmy({ ...HALBERDIERS, experience: 17 }, "p1", "u_h4", 0, "legacy")!;
    expect(r4.attack).toBe(r3.attack);
    expect(r4.abilities).toContain("veteran-defense-pierce");
  });

  it("mid-combat Pack→Few keeps rank folds", () => {
    const state = makeAdventure("uxp-midflip", { unitExperience: true });
    const packDef = coreUnitDefinitions[GRIFFINS.unitDefId]!.pack!;
    const fewDef = coreUnitDefinitions[GRIFFINS.unitDefId]!.few!;
    // Griffins R1 = +1 HP, and the fold must remain after Pack→Few.
    const unit = makeCombatUnitFromArmy({ ...GRIFFINS, experience: 5 }, "p1", "u_mid", 0, "legacy")!;
    expect(unit.maxHealth).toBe(packDef.health + 1);
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.maxHealth).toBe(fewDef.health + 1);
  });

  it("silver crusaders separate retaliation training from their R3 Initiative stat", () => {
    const CRUSADERS = { id: "xp_crusaders", unitDefId: "castle.crusaders", side: "few" as const };
    const plain = makeCombatUnitFromArmy({ ...CRUSADERS }, "p1", "u_s0", 0, "legacy")!;
    const r1 = makeCombatUnitFromArmy({ ...CRUSADERS, experience: 6 }, "p1", "u_s1", 0, "legacy")!;
    const r3 = makeCombatUnitFromArmy({ ...CRUSADERS, experience: 15 }, "p1", "u_s3", 0, "legacy")!;
    expect(r1.abilities).toContain("veteran-retaliation-fury");
    expect(r1.defense).toBe(plain.defense);
    expect(r1.attack).toBe(plain.attack);
    expect(r3.initiative).toBe(plain.initiative + 1);
    expect(r3.attack).toBe(plain.attack);
    expect(r3.defense).toBe(plain.defense);
    expect(r3.maxHealth).toBe(plain.maxHealth);
  });
});

describe("Unit Experience — upgrade dilution", () => {
  it("reinforcing Few→Pack halves XP; Stack layer costs 3 XP; First Aid does not dilute", () => {
    const state = makeAdventure("uxp-dilute", { unitExperience: true });
    state.players.p1.townTokens.population = true;
    state.players.p1.resources = { gold: 100, buildingMaterials: 10, valuables: 10 };
    const reinforceTown = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    for (const building of ["castle.citadel", "castle.dwelling_bronze"]) {
      if (!reinforceTown.buildings.includes(building)) reinforceTown.buildings.push(building);
    }
    state.players.p1.army = [
      { id: "vet_griffins", unitDefId: "castle.griffins", side: "few", experience: 7 },
      { id: "fresh_marksmen", unitDefId: "castle.marksmen", side: "few" }
    ];
    const next = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "castle.griffins", armyUnitId: "vet_griffins" }]
    });
    expect(next.players.p1.army.find((u) => u.id === "vet_griffins")?.experience).toBe(3);

    const stack = makeAdventure("uxp-stack-dilute", {
      unitExperience: true,
      houseRules: { "polish-unit-stacks": true }
    });
    stack.players.p1.townTokens.population = true;
    stack.players.p1.resources = { gold: 500, buildingMaterials: 10, valuables: 10 };
    const town = Object.values(stack.towns).find((candidate) => candidate.controllerId === "p1")!;
    if (!town.buildings.includes("castle.citadel")) town.buildings.push("castle.citadel");
    stack.players.p1.army = [{ id: "vet_pack", unitDefId: "castle.griffins", side: "pack", experience: 8 }];
    const afterStack = applyOk(stack, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [
        { kind: "stack", unitDefId: "castle.griffins", armyUnitId: "vet_pack" },
        { kind: "stack", unitDefId: "castle.griffins", armyUnitId: "vet_pack" }
      ]
    });
    // Two layers × 3 XP each = 6 lost, so 8 → 2.
    expect(afterStack.players.p1.army[0].experience).toBe(2);

    const aid = makeAdventure("uxp-firstaid", { unitExperience: true });
    aid.players.p1.army = [{ id: "aid_griffins", unitDefId: "castle.griffins", side: "few", experience: 6 }];
    aid.adventure!.pendingCommanderFirstAid = {
      playerId: "p1",
      options: [
        {
          label: "Restore Griffins to a Pack",
          kind: "flip-up",
          unitDefId: "castle.griffins",
          side: "pack",
          armyUnitId: "aid_griffins"
        }
      ]
    };
    const afterAid = applyOk(aid, { type: "COMMANDER_FIRST_AID", playerId: "p1", optionIndex: 0 });
    expect(afterAid.players.p1.army[0].experience).toBe(6);
    expect(afterAid.eventLog.some((e) => e.type === "UNIT_XP_DILUTED")).toBe(false);
  });
});

describe("Unit Experience — Drill", () => {
  function drillState(seed: string, on = true): GameState {
    const state = makeAdventure(seed, on ? { unitExperience: true } : {});
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    getMainHero(state, "p1")!.spaceId = town.fieldId ?? null;
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.army = [
      { ...MARKSMEN },
      { id: "maxed", unitDefId: "castle.halberdiers", side: "few", experience: 17 }
    ];
    return state;
  }

  it("bronze pays 1 gold for +1 XP once at hero levels I–III; maxed cards are not offered", () => {
    const state = drillState("uxp-drill");
    const offers = getLegalActions(state, "p1").filter((legal) => legal.action.type === "DRILL_UNIT");
    expect(offers.map((legal) => (legal.action.type === "DRILL_UNIT" ? legal.action.armyUnitId : ""))).toEqual([
      MARKSMEN.id
    ]);
    const next = applyOk(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    expect(next.players.p1.resources.gold).toBe(9);
    expect(next.players.p1.army[0].experience).toBe(1);
    expect(applyAction(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message).toContain(
      "unused drill"
    );
  });

  it("player-controlled recruited Neutrals earn persistent XP without Neutral Rank-Up", () => {
    const state = makeAdventure("uxp-recruited-neutral", { unitExperience: true });
    expect(state.adventure?.neutralRankUp).toBeUndefined();
    state.players.p1.army = [{ id: "recruited_naga", unitDefId: "neutral.nagas", side: "neutral" }];
    const naga = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_recruited_naga", 0, "legacy")!;
    finishNeutralCombat(state, { [naga.id]: naga }, "p1", { difficulty: 8 });
    expect(state.players.p1.army[0].experience).toBe(8);
    expect(state.players.p1.army[0].side).toBe("neutral");
    expect(armyUnitRankInfo(state.players.p1.army[0])?.rank).toBe(1);
  });

  it("defeating Veteran/Elite neutral-owned guards adds +1/+2 unit XP", () => {
    const wonAgainst = (rank: number) => {
      const state = makeAdventure(`uxp-ranked-neutral-${rank}`, { unitExperience: true });
      state.players.p1.army = [{ ...MARKSMEN }];
      const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", `u_survivor_${rank}`, 0, "legacy")!;
      const guard = makeCombatUnitFromNeutral(
        { unitDefId: "neutral.boars", tier: "bronze" },
        `u_guard_${rank}`,
        1,
        "legacy"
      )!;
      guard.unitRank = rank;
      guard.damage = guard.maxHealth;
      finishNeutralCombat(state, { [survivor.id]: survivor, [guard.id]: guard }, "p1", { difficulty: 3 });
      return state.players.p1.army[0].experience ?? 0;
    };

    expect(wonAgainst(1), "Seasoned gives no bonus").toBe(3);
    expect(wonAgainst(2), "Veteran gives +1").toBe(4);
    expect(wonAgainst(3), "Elite gives +2").toBe(5);
  });

  it("prices recruited Neutral/bronze at 1, silver at 2, and gold at 3", () => {
    const state = drillState("uxp-drill-prices");
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    state.players.p1.army = [
      { id: "neutral", unitDefId: "neutral.nagas", side: "neutral" },
      { id: "silver", unitDefId: "castle.crusaders", side: "few" },
      { id: "gold", unitDefId: "castle.champions", side: "few" }
    ];
    let next = applyOk(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: "neutral" });
    expect(next.players.p1.resources.gold).toBe(9);
    next = applyOk(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: "silver" });
    expect(next.players.p1.resources.gold).toBe(7);
    next = applyOk(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: "gold" });
    expect(next.players.p1.resources.gold).toBe(4);
  });

  it("allows two drills from hero level IV and three from level VII", () => {
    const levelFour = drillState("uxp-drill-level-four");
    getMainHero(levelFour, "p1")!.level = 4;
    let next = applyOk(levelFour, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    next = applyOk(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    expect(next.players.p1.army[0].experience).toBe(2);
    expect(applyAction(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message).toContain(
      "unused drill"
    );

    const levelSeven = drillState("uxp-drill-level-seven");
    getMainHero(levelSeven, "p1")!.level = 7;
    let max = levelSeven;
    for (let index = 0; index < 3; index += 1) {
      max = applyOk(max, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    }
    expect(max.players.p1.army[0].experience).toBe(3);
  });

  it("waives movement at Towns, Settlements and Random Towns; elsewhere spends exactly 1 movement", () => {
    for (const location of ["town", "settlement", "random_town"] as const) {
      const state = drillState(`uxp-drill-free-${location}`);
      const hero = getMainHero(state, "p1")!;
      hero.movementPoints = 2;
      state.adventure!.fields[hero.spaceId!].location = location;
      const next = applyOk(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
      expect(next.heroes[hero.id].movementPoints, `${location} waives movement`).toBe(2);
      expect(next.players.p1.army[0].experience).toBe(1);
    }

    const field = drillState("uxp-drill-field-cost");
    const hero = getMainHero(field, "p1")!;
    hero.movementPoints = 2;
    field.adventure!.fields[hero.spaceId!].location = "empty";
    expect(
      getLegalActions(field, "p1").find((legal) => legal.action.type === "DRILL_UNIT")?.label
    ).toContain("1 movement");
    const drilled = applyOk(field, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    expect(drilled.heroes[hero.id].movementPoints).toBe(1);
    expect(drilled.players.p1.resources.gold).toBe(9);
    expect(drilled.players.p1.army[0].experience).toBe(1);

    const exhausted = drillState("uxp-drill-no-movement");
    const tiredHero = getMainHero(exhausted, "p1")!;
    tiredHero.movementPoints = 0;
    exhausted.adventure!.fields[tiredHero.spaceId!].location = "empty";
    expect(getLegalActions(exhausted, "p1").some((legal) => legal.action.type === "DRILL_UNIT")).toBe(false);
    expect(
      applyAction(exhausted, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message
    ).toContain("needs 1 movement");
  });

  it("CONTROLs: rule off / maxed card (the old own-Town gate is now the movement test above)", () => {
    const off = drillState("uxp-drill-off", false);
    expect(applyAction(off, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message).toContain(
      "off for this game"
    );
    const state = drillState("uxp-drill-maxed");
    expect(applyAction(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: "maxed" }).errors[0]?.message).toContain(
      "max veteran rank"
    );
  });
});

// ===========================================================================
// A WON Creature Bank card (Dragon Fly Hive / Griffin Conservatory reward,
// `side: "bank"`) trains on the SAME veteran track as every other army card
// (USER RULE 2026-08-15): its XP folds off the underlying definition's printed
// tier (Griffins / Dragon Flies are bronze), it earns won-combat XP like any
// deployed survivor, and Drill trains it at the cheap 1-gold rate.
// ===========================================================================

describe("Unit Experience — a won Creature Bank card trains on the veteran track", () => {
  const BANK_FLIES = { id: "xp_bank_flies", unitDefId: "neutral.dragon_flies", side: "bank" as const };

  it("the READ side folds a bank card's XP off its definition's tier", () => {
    const loaded = { ...BANK_FLIES, experience: 17 };
    const info = armyUnitRankInfo(loaded);
    expect(info, "a bank face now has a veteran track").not.toBeNull();
    expect(info!.rank, "bronze thresholds: 17 XP = max rank").toBe(MAX_UNIT_RANK);
    const plain = makeCombatUnitFromArmy(BANK_FLIES, "p1", "u_bank_plain", 0, "legacy")!;
    const veteran = makeCombatUnitFromArmy(loaded, "p1", "u_bank_vet", 0, "legacy")!;
    expect(veteran.unitRank).toBe(MAX_UNIT_RANK);
    expect(veteran.unitExperience).toBe(17);
    // The fold is observable on the combat card, not just a rank number.
    expect(
      veteran.attack + veteran.defense + veteran.maxHealth + veteran.abilities.length
    ).toBeGreaterThan(plain.attack + plain.defense + plain.maxHealth + plain.abilities.length);
    // …and a mid-combat recompute (the bank branch of applyUnitCurrentSide)
    // reproduces the same fold instead of wiping it back to the bank face.
    const recomputed = makeCombatUnitFromArmy(loaded, "p1", "u_bank_recompute", 0, "legacy")!;
    applyUnitCurrentSide(recomputed, "legacy");
    expect(recomputed.unitRank).toBe(MAX_UNIT_RANK);
    expect(recomputed.attack).toBe(veteran.attack);
    expect(recomputed.defense).toBe(veteran.defense);
    // CONTROL: no XP ⇒ the bank face is byte-identical to before (rank never folds).
    expect(plain.unitRank ?? 0).toBe(0);
    expect(plain.unitExperience ?? 0).toBe(0);
  });

  it("a won combat awards XP to the surviving bank card like any deployed card", () => {
    const state = makeAdventure("uxp-bank-reward", { unitExperience: true });
    state.players.p1.army = [{ ...BANK_FLIES }, { ...MARKSMEN }];
    const bankCard = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_bank_card", 0, "legacy")!;
    const marksmen = makeCombatUnitFromArmy(state.players.p1.army[1], "p1", "u_marks", 1, "legacy")!;
    bankCard.damage = 0;
    marksmen.damage = 0;
    finishNeutralCombat(state, { [bankCard.id]: bankCard, [marksmen.id]: marksmen }, "p1", { difficulty: 5 });

    expect(state.players.p1.army.find((unit) => unit.id === MARKSMEN.id)?.experience, "CONTROL").toBe(5);
    expect(state.players.p1.army.find((unit) => unit.id === BANK_FLIES.id)?.experience).toBe(5);
    // Crossing bronze rank-1 (5 XP) announces the rank-up for the bank card too.
    expect(
      state.eventLog.some((event) => event.type === "UNIT_RANK_UP" && event.unitDefId === "neutral.dragon_flies")
    ).toBe(true);
  });

  it("is a Drill target at the cheap 1-gold rate (like a recruited Neutral)", () => {
    const state = makeAdventure("uxp-bank-drill", { unitExperience: true });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    getMainHero(state, "p1")!.spaceId = town.fieldId ?? null;
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.army = [{ ...BANK_FLIES }, { ...MARKSMEN }];

    const offered = getLegalActions(state, "p1")
      .filter((legal) => legal.action.type === "DRILL_UNIT")
      .map((legal) => (legal.action.type === "DRILL_UNIT" ? legal.action.armyUnitId : ""));
    expect(offered).toEqual([BANK_FLIES.id, MARKSMEN.id]);

    const drilled = applyOk(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: BANK_FLIES.id });
    expect(drilled.players.p1.resources.gold, "bank card drills for 1 gold").toBe(9);
    expect(drilled.players.p1.army[0].experience).toBe(1);

    // CONTROL: a maxed bank card is not offered (the shared max-rank gate).
    const maxed = makeAdventure("uxp-bank-drill-maxed", { unitExperience: true });
    const maxedTown = Object.values(maxed.towns).find((candidate) => candidate.controllerId === "p1")!;
    getMainHero(maxed, "p1")!.spaceId = maxedTown.fieldId ?? null;
    maxed.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    maxed.players.p1.army = [{ ...BANK_FLIES, experience: 17 }];
    expect(
      getLegalActions(maxed, "p1").filter((legal) => legal.action.type === "DRILL_UNIT")
    ).toEqual([]);
  });
});
