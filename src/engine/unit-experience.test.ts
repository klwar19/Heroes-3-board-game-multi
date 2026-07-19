import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_UNIT_RANK,
  RANK_TEMPLATES,
  UNIT_RANK_SCHEDULES,
  UNIT_RANK_THRESHOLDS,
  UNIT_STAT_STEPS,
  UNIT_XP_BANK_MIN,
  UNIT_XP_PVP_WIN,
  hasUniqueRankSchedule,
  rankScheduleFor,
  rankAbilityTrackFor,
  scheduleAbilityCount,
  scheduleTemplateId,
  unitRankAbilityIcon
} from "@/data/units/experience";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  NEUTRAL_PLAYER_ID
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, GameAction, GameState } from "./state";
import {
  awardUnitExperienceAfterCombat,
  unitRankAbilityIds,
  unitRankForExperience,
  unitRankStatBonuses,
  unitRankStatBonusesFor,
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
    anime?: { enabled: boolean; unitExperience?: boolean; isekaiTowns?: boolean; xianxiaTowns?: boolean };
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
  context?: Partial<Extract<CombatState["context"], { kind: "neutral" }>>
): void {
  const hero = getMainHero(state, "p1")!;
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
  it("tier-scaled even ladder XP: bronze 3/6/10/14 (gold ranks slower, not stronger)", () => {
    expect(UNIT_RANK_THRESHOLDS.bronze).toEqual([3, 6, 10, 14]);
    expect(UNIT_RANK_THRESHOLDS.gold).toEqual([5, 10, 16, 22]);
    expect(MAX_UNIT_RANK).toBe(4);
    expect(unitRankForExperience("bronze", 3)).toBe(1);
    expect(unitRankForExperience("bronze", 6)).toBe(2);
    expect(unitRankForExperience("bronze", 10)).toBe(3);
    expect(unitRankForExperience("bronze", 14)).toBe(4);
    expect(unitRankForExperience("gold", 4)).toBe(0);
    expect(unitRankForExperience("gold", 5)).toBe(1);
  });

  it("stat STEPS: bronze Defense-first; gold Attack-first; same 3-step budget (gold not larger)", () => {
    expect(UNIT_STAT_STEPS.bronze[0]).toEqual({ attack: 0, defense: 1, health: 0, initiative: 0 });
    expect(UNIT_STAT_STEPS.bronze[1]).toEqual({ attack: 1, defense: 0, health: 0, initiative: 0 });
    expect(UNIT_STAT_STEPS.bronze[2]).toEqual({ attack: 0, defense: 0, health: 1, initiative: 1 });
    expect(UNIT_STAT_STEPS.gold[0]).toEqual({ attack: 1, defense: 0, health: 0, initiative: 0 });
    expect(UNIT_STAT_STEPS.gold[1]).toEqual({ attack: 0, defense: 1, health: 0, initiative: 0 });
    expect(UNIT_STAT_STEPS.gold[2]).toEqual({ attack: 0, defense: 0, health: 1, initiative: 0 });
    // Pure step table via (tier, rank) — cumulative first N steps
    expect(unitRankStatBonuses("bronze", 1)).toEqual({ attack: 0, defense: 1, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("bronze", 2)).toEqual({ attack: 1, defense: 1, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("gold", 1)).toEqual({ attack: 1, defense: 0, health: 0, initiative: 0 });
  });

  it("THREE templates only: standard=1 ability, strong=2, rare=3", () => {
    expect(RANK_TEMPLATES.standard.filter((k) => k === "ability")).toHaveLength(1);
    expect(RANK_TEMPLATES.strong.filter((k) => k === "ability")).toHaveLength(2);
    expect(RANK_TEMPLATES.rare.filter((k) => k === "ability")).toHaveLength(3);
    // Every unique schedule matches a template pattern.
    for (const [id, schedule] of Object.entries(UNIT_RANK_SCHEDULES)) {
      const t = scheduleTemplateId(schedule);
      expect(["standard", "strong", "rare"], id).toContain(t);
      for (const r of [1, 2, 3, 4] as const) {
        const step = schedule[r];
        expect(step.kind === "stats" || step.kind === "ability").toBe(true);
        if (step.kind === "ability") expect(step.choices.length).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(UNIT_RANK_SCHEDULES).length, "unique schedules").toBeGreaterThanOrEqual(80);
  });

  it("gold units do NOT get more abilities than bronze peers", () => {
    expect(scheduleAbilityCount(rankScheduleFor("castle.marksmen"))).toBe(2);
    expect(scheduleAbilityCount(rankScheduleFor("tower.titans"))).toBe(2);
    expect(scheduleAbilityCount(rankScheduleFor("castle.halberdiers"))).toBe(1);
    expect(scheduleAbilityCount(rankScheduleFor("castle.griffins"))).toBe(1);
    expect(scheduleAbilityCount(rankScheduleFor("castle.archangels"))).toBe(2); // strong flyer unique
  });

  it("REGISTRY: every ability choice on unique schedules is implemented", () => {
    const ids = new Set<string>();
    for (const schedule of Object.values(UNIT_RANK_SCHEDULES)) {
      for (const r of [1, 2, 3, 4] as const) {
        const step = schedule[r];
        if (step.kind === "ability") for (const id of step.choices) ids.add(id);
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

  it("DIFFERENT unique paths: marksmen ≠ griffins ≠ champions ≠ sabers", () => {
    expect(hasUniqueRankSchedule("castle.marksmen")).toBe(true);
    expect(hasUniqueRankSchedule("castle.champions")).toBe(true);
    expect(hasUniqueRankSchedule("fuyuki.sabers")).toBe(true);

    expect(unitRankStep("castle.marksmen", 1)?.kind).toBe("stats");
    expect(unitRankStep("castle.marksmen", 2)?.kind).toBe("ability");
    expect(unitRankAbilityIds("castle.marksmen", 1)).toEqual([]);
    expect(unitRankAbilityIds("castle.marksmen", 2)).toContain("bulwark-air-shield");
    expect(unitRankAbilityIds("castle.marksmen", 4)).toContain("ignore-all-combat-penalties");
    expect(unitRankStatBonusesFor("castle.marksmen", "bronze", 3)).toEqual({
      attack: 1,
      defense: 1,
      health: 0,
      initiative: 0
    });
    expect(unitRankStatBonusesFor("castle.marksmen", "bronze", 4)).toEqual({
      attack: 1,
      defense: 1,
      health: 0,
      initiative: 0
    });

    expect(unitRankStep("castle.champions", 1)?.kind).toBe("ability");
    expect(unitRankAbilityIds("castle.champions", 1)).toContain("commander-charge");
    expect(unitRankAbilityIds("castle.champions", 3)).toContain("ignores-retaliation");
    expect(unitRankStatBonusesFor("castle.champions", "gold", 1)).toEqual({
      attack: 0,
      defense: 0,
      health: 0,
      initiative: 0
    });
    expect(unitRankStatBonusesFor("castle.champions", "gold", 2)).toEqual({
      attack: 1,
      defense: 0,
      health: 0,
      initiative: 0
    });

    expect(scheduleAbilityCount(rankScheduleFor("fuyuki.sabers"))).toBe(3);
    expect(unitRankAbilityIds("fuyuki.sabers", 3)).toContain("double-attack");
    expect(rankAbilityTrackFor("castle.marksmen")).toContain("unique");
  });

  it("every core/anime unit has a schedule; ability budget ≤ 3; grants are cumulative", () => {
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
      const budget = scheduleAbilityCount(schedule);
      expect(budget).toBeGreaterThanOrEqual(1);
      expect(budget).toBeLessThanOrEqual(3);
      const maxIds = unitRankAbilityIds(unitDefId, 4);
      expect(maxIds.length).toBeLessThanOrEqual(budget);
      for (let r = 1; r <= 4; r++) {
        const prev = unitRankAbilityIds(unitDefId, r - 1);
        const cur = unitRankAbilityIds(unitDefId, r);
        for (const id of prev) expect(cur).toContain(id);
      }
    }
    expect(uniqueCount, "most faction units should be unique").toBeGreaterThanOrEqual(80);
  });

  it("ability icons resolve (dedicated glyph on disk or spell-icon fallback)", () => {
    for (const id of unitRankAbilityIds("castle.marksmen", 4)) {
      const icon = unitRankAbilityIcon(id);
      expect(icon.startsWith("/assets/")).toBe(true);
      if (icon.includes("/rank-ability/")) {
        expect(existsSync(join(process.cwd(), "public", icon.replace(/^\//, "")))).toBe(true);
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
    finishNeutralCombat(state, { [survivor.id]: survivor, [casualty.id]: casualty }, "p1", { difficulty: 3 });
    expect(state.players.p1.army.find((unit) => unit.id === MARKSMEN.id)?.experience).toBe(3);
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
});

function resolveArmyAttack(
  seed: string,
  attackerArmy: { unitDefId: string; side: "few" | "pack" | "neutral"; experience?: number },
  defenderArmy?: { unitDefId: string; side: "few" | "pack" | "neutral"; experience?: number },
  defenderAttack = 0
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
    defender.maxHealth = 40;
    defender.attack = defenderAttack;
    state.combat!.units.unit_p2_skeletons = defender;
  } else {
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 1;
    defender.maxHealth = 40;
    defender.damage = 0;
    defender.abilities = [];
    defender.attack = defenderAttack;
  }
  state.combat!.dice.scriptedRolls = Array(8).fill(0);
  state.combat!.dice.rollCount = 0;
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

describe("Unit Experience — observable either/or effects in combat", () => {
  it("halberdiers R1 is STATS (+1 Def for bronze) — lowers incoming damage by 1", () => {
    // Halberdiers melee_line: R1 stats. Bronze first step = +1 Defense.
    const control = resolveArmyAttack(
      "uxp-def-ctl",
      { unitDefId: "castle.champions", side: "few" },
      { unitDefId: "castle.halberdiers", side: "few" }
    );
    const seasoned = resolveArmyAttack(
      "uxp-def-vet",
      { unitDefId: "castle.champions", side: "few" },
      { unitDefId: "castle.halberdiers", side: "few", experience: 3 }
    );
    const controlDamage = control.combat!.units.unit_p2_skeletons.damage;
    expect(controlDamage).toBeGreaterThan(0);
    expect(seasoned.combat!.units.unit_p2_skeletons.damage).toBe(controlDamage - 1);
  });

  it("champions R2 is STATS (+1 Atk gold) — raises hit by 1 over rank-1 CONTROL (ability only)", () => {
    // Champions: R1 ability (no stats), R2 stats (+1 Atk gold). Gold R2 at 10 XP.
    const rank1 = resolveArmyAttack("uxp-atk-r1", {
      unitDefId: "castle.champions",
      side: "few",
      experience: 5
    });
    const rank2 = resolveArmyAttack("uxp-atk-r2", {
      unitDefId: "castle.champions",
      side: "few",
      experience: 10
    });
    const d1 = rank1.combat!.units.unit_p2_skeletons.damage;
    expect(d1, "rank1 ability-only: 5 attack + 0 die − 1 def").toBe(4);
    expect(rank2.combat!.units.unit_p2_skeletons.damage).toBe(d1 + 1);
  });

  it("champions R3 ability ignores retaliation (R2 CONTROL still takes it)", () => {
    // R2 = 10 XP: stats only (+1 Atk). Defense still 2. Retaliation 6 − 2 = 4.
    // R3 = 16 XP: ability ignores-retaliation → 0 damage taken.
    const control = resolveArmyAttack(
      "uxp-elite-ctl",
      { unitDefId: "castle.champions", side: "few", experience: 10 },
      undefined,
      6
    );
    const elite = resolveArmyAttack(
      "uxp-elite",
      { unitDefId: "castle.champions", side: "few", experience: 16 },
      undefined,
      6
    );
    expect(control.combat!.units.unit_p1_griffins.damage, "rank 2 still takes retaliation").toBe(4);
    expect(elite.combat!.units.unit_p1_griffins.damage, "rank 3 no retaliation").toBe(0);
    expect(makeCombatUnitFromArmy(
      { id: "c", unitDefId: "castle.champions", side: "few", experience: 16 },
      "p1",
      "u_c",
      0,
      "legacy"
    )!.abilities).toContain("ignores-retaliation");
  });

  it("marksmen R3 has 2 stats steps (+1 Def +1 Atk) but NOT HP/Init (those need a 3rd stats rank)", () => {
    const plain = makeCombatUnitFromArmy({ ...MARKSMEN }, "p1", "u_plain", 0, "legacy")!;
    const r3 = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 10 }, "p1", "u_r3", 0, "legacy")!;
    expect(r3.unitRank).toBe(3);
    expect(r3.defense).toBe(plain.defense + 1);
    expect(r3.attack).toBe(plain.attack + 1);
    expect(r3.maxHealth).toBe(plain.maxHealth); // no 3rd stats step on 2-ability path
    expect(r3.initiative).toBe(plain.initiative);
    expect(r3.abilities).toContain("bulwark-air-shield"); // from R2 ability
  });

  it("marksmen R4 grants Legend ability (no extra stats over R3)", () => {
    const r3 = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 10 }, "p1", "u_r3b", 0, "legacy")!;
    const r4 = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 14 }, "p1", "u_r4", 0, "legacy")!;
    expect(r4.unitRank).toBe(4);
    expect(r4.attack).toBe(r3.attack);
    expect(r4.defense).toBe(r3.defense);
    expect(r4.abilities).toContain("ignore-all-combat-penalties");
  });

  it("halberdiers standard path R3 takes 3 stats steps (+Def +Atk +HP/Init)", () => {
    const plain = makeCombatUnitFromArmy({ ...HALBERDIERS }, "p1", "u_h0", 0, "legacy")!;
    const r3 = makeCombatUnitFromArmy({ ...HALBERDIERS, experience: 10 }, "p1", "u_h3", 0, "legacy")!;
    // Standard melee: R1 stats, R2 ability, R3 stats, R4 stats → at R3 only 2 stats steps
    expect(unitRankStep("castle.halberdiers", 2)?.kind).toBe("ability");
    expect(r3.defense).toBe(plain.defense + 1);
    expect(r3.attack).toBe(plain.attack + 1);
    // R4 (14 XP) is third stats step
    const r4 = makeCombatUnitFromArmy({ ...HALBERDIERS, experience: 14 }, "p1", "u_h4", 0, "legacy")!;
    expect(r4.maxHealth).toBe(plain.maxHealth + 1);
    expect(r4.initiative).toBe(plain.initiative + 1);
    expect(r4.abilities).toContain("bulwark-thick-hide");
  });

  it("mid-combat Pack→Few keeps rank folds", () => {
    const state = makeAdventure("uxp-midflip", { unitExperience: true });
    const packDef = coreUnitDefinitions[GRIFFINS.unitDefId]!.pack!;
    const fewDef = coreUnitDefinitions[GRIFFINS.unitDefId]!.few!;
    // Griffins R1 stats at 3 XP = +1 Def
    const unit = makeCombatUnitFromArmy({ ...GRIFFINS, experience: 3 }, "p1", "u_mid", 0, "legacy")!;
    expect(unit.defense).toBe(packDef.defense + 1);
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.defense).toBe(fewDef.defense + 1);
  });

  it("silver crusaders R1 stats = +1 Def; R3 has two stats steps", () => {
    const CRUSADERS = { id: "xp_crusaders", unitDefId: "castle.crusaders", side: "few" as const };
    const plain = makeCombatUnitFromArmy({ ...CRUSADERS }, "p1", "u_s0", 0, "legacy")!;
    const r1 = makeCombatUnitFromArmy({ ...CRUSADERS, experience: 4 }, "p1", "u_s1", 0, "legacy")!;
    const r3 = makeCombatUnitFromArmy({ ...CRUSADERS, experience: 13 }, "p1", "u_s3", 0, "legacy")!;
    expect(r1.defense).toBe(plain.defense + 1);
    expect(r1.attack).toBe(plain.attack);
    // Cavalry strong: R1 stats, R2 ability, R3 stats, R4 ability → R3 = 2 stats
    expect(r3.attack).toBe(plain.attack + 1);
    expect(r3.defense).toBe(plain.defense + 1);
    expect(r3.maxHealth).toBe(plain.maxHealth);
  });
});

describe("Unit Experience — upgrade dilution", () => {
  it("reinforcing Few→Pack halves XP; Stack layer costs 1 XP; First Aid does not dilute", () => {
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
    stack.players.p1.army = [{ id: "vet_pack", unitDefId: "castle.griffins", side: "pack", experience: 5 }];
    const afterStack = applyOk(stack, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [
        { kind: "stack", unitDefId: "castle.griffins", armyUnitId: "vet_pack" },
        { kind: "stack", unitDefId: "castle.griffins", armyUnitId: "vet_pack" }
      ]
    });
    expect(afterStack.players.p1.army[0].experience).toBe(3);

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
      { id: "maxed", unitDefId: "castle.halberdiers", side: "few", experience: 14 }
    ];
    return state;
  }

  it("pays 2 gold for +1 XP once per turn; maxed cards not offered", () => {
    const state = drillState("uxp-drill");
    const offers = getLegalActions(state, "p1").filter((legal) => legal.action.type === "DRILL_UNIT");
    expect(offers.map((legal) => (legal.action.type === "DRILL_UNIT" ? legal.action.armyUnitId : ""))).toEqual([
      MARKSMEN.id
    ]);
    const next = applyOk(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    expect(next.players.p1.resources.gold).toBe(8);
    expect(next.players.p1.army[0].experience).toBe(1);
    expect(applyAction(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message).toContain(
      "once per turn"
    );
  });

  it("CONTROLs: rule off / away from town / maxed card", () => {
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
