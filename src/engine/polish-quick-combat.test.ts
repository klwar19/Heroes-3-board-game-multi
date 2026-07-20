import { describe, expect, it } from "vitest";
import { startNeutralEncounter } from "./adventure-reducer";
import { applyAction, createAdventureGameState } from "./index";
import { HOUSE_RULES, resolveHouseRules } from "./house-rules";
import {
  POLISH_QUICK_COMBAT_DIFFICULTY_X,
  polishQuickCombatArmyStrength,
  polishQuickCombatFieldStrength,
  polishQuickCombatUnitStrength,
  polishQuickCombatXpPossible
} from "./polish-quick-combat";
import type {
  ArmyUnitState,
  GameAction,
  GameDifficulty,
  GameState,
  HeroState,
  HouseRuleId,
  MapFieldState
} from "./state";

/**
 * Polish house rule `polish-quick-combat` (strength-based Quick Combat,
 * default OFF). Every behavioural claim below is mutation-checked: the
 * rule-ON assertion diverges from a rule-OFF (or below-threshold) CONTROL, so
 * removing the gate in startNeutralEncounter — or the strength / threshold /
 * XP wiring — fails a named test.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeGame(
  seed: string,
  options: { houseRules?: Partial<Record<HouseRuleId, boolean>>; difficulty?: GameDifficulty } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: options.difficulty ?? "normal",
    rollFirstPlayer: false,
    houseRules: options.houseRules ?? { "polish-quick-combat": true }
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  return state;
}

function armyCard(
  unitDefId: string,
  side: ArmyUnitState["side"],
  stacks?: number
): Pick<ArmyUnitState, "unitDefId" | "side" | "stacks"> {
  return { unitDefId, side, ...(stacks !== undefined ? { stacks } : {}) };
}

function setArmy(state: GameState, cards: Pick<ArmyUnitState, "unitDefId" | "side" | "stacks">[]): void {
  state.players.p1.army = cards.map((card, index) => ({ id: `pqc_u${index}`, ...card })) as ArmyUnitState[];
}

/** Picks a real guarded field on the map and pins its difficulty for the test. */
function guardField(state: GameState, difficulty: number): MapFieldState {
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  field!.difficulty = difficulty;
  return field!;
}

function encounter(state: GameState, field: MapFieldState): void {
  startNeutralEncounter(state, state.heroes.hero_p1, field);
}

function quickCombatWon(state: GameState): boolean {
  return state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON");
}

/** The open OPTION_CHOICE's context (undefined for other/no pending choices). */
function choiceContext(state: GameState): string | undefined {
  return state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : undefined;
}

const strengthOf = (unitDefId: string, side: ArmyUnitState["side"], stacks?: number): number =>
  polishQuickCombatUnitStrength({
    id: "pqc_probe",
    unitDefId,
    side,
    ...(stacks !== undefined ? { stacks } : {})
  } as ArmyUnitState);

// ===========================================================================
// Pure strength / threshold / XP reads (the sheet's worked examples)
// ===========================================================================

describe("polish-quick-combat — unit & army strength", () => {
  it("scores tiers 1/2/3/4, doubles Packs, and counts a recruited Neutral 1× its tier", () => {
    expect(strengthOf("castle.griffins", "few"), "bronze Few = 1").toBe(1);
    expect(strengthOf("castle.griffins", "pack"), "bronze Pack = 2").toBe(2);
    expect(strengthOf("castle.crusaders", "few"), "silver Few = 2").toBe(2);
    expect(strengthOf("castle.crusaders", "pack"), "silver Pack = 4").toBe(4);
    expect(strengthOf("castle.champions", "pack"), "gold Pack = 6").toBe(6);
    // A Neutral-side card is a single group — 1× tier, never doubled. Azure
    // cards exist only as Neutrals, matching the sheet's flat "azure 4".
    expect(strengthOf("neutral.azure_dragons", "neutral"), "azure Neutral = 4").toBe(4);
    expect(strengthOf("dungeon.minotaurs", "neutral"), "silver Neutral = 2 (not the Pack 4)").toBe(2);
  });

  it("adds 0.5 per Unit-Stack layer (the sheet's Minotaur example: 2×2 + 0.5 = 4.5)", () => {
    expect(strengthOf("dungeon.minotaurs", "pack", 1)).toBe(4.5);
    expect(strengthOf("castle.crusaders", "pack", 2), "each layer adds 0.5").toBe(5);
    // CONTROL: no layers, no bonus.
    expect(strengthOf("dungeon.minotaurs", "pack")).toBe(4);
  });

  it("sums only the 5 STRONGEST army cards", () => {
    const state = makeGame("pqc-top5");
    setArmy(state, [
      armyCard("castle.champions", "pack"), // 6
      armyCard("castle.champions", "pack"), // 6
      armyCard("castle.griffins", "few"), // 1
      armyCard("castle.griffins", "few"), // 1
      armyCard("castle.griffins", "few"), // 1
      armyCard("castle.griffins", "few") // 1 — the 6th, weakest, must NOT count
    ]);
    expect(polishQuickCombatArmyStrength(state, "p1")).toBe(6 + 6 + 1 + 1 + 1);
  });
});

describe("polish-quick-combat — field strength (2×difficulty + X, +1 with Stacks)", () => {
  it("matches the sheet's worked examples", () => {
    // "normal game with stacks, field III: 2×3 + 2 + 1 = 9"
    const normalStacks = makeGame("pqc-thr-1", {
      houseRules: { "polish-quick-combat": true, "polish-unit-stacks": true }
    });
    expect(polishQuickCombatFieldStrength(normalStacks, 3)).toBe(9);

    // "hard difficulty, no stack mode, field V: 2×5 + 3 = 13"
    const hardPlain = makeGame("pqc-thr-2", { difficulty: "hard" });
    expect(polishQuickCombatFieldStrength(hardPlain, 5)).toBe(13);

    // Range checks: easy field Ⅰ and impossible field Ⅶ with stacks.
    const easyPlain = makeGame("pqc-thr-3", { difficulty: "easy" });
    expect(polishQuickCombatFieldStrength(easyPlain, 1)).toBe(3);
    const impossibleStacks = makeGame("pqc-thr-4", {
      difficulty: "impossible",
      houseRules: { "polish-quick-combat": true, "polish-unit-stacks": true }
    });
    expect(polishQuickCombatFieldStrength(impossibleStacks, 7)).toBe(19);

    // CONTROL: normal WITHOUT stacks drops the +1.
    const normalPlain = makeGame("pqc-thr-5");
    expect(polishQuickCombatFieldStrength(normalPlain, 3)).toBe(8);

    expect(POLISH_QUICK_COMBAT_DIFFICULTY_X).toEqual({ easy: 1, normal: 2, hard: 3, impossible: 4 });
  });
});

describe("polish-quick-combat — the no-Experience read (mandatory vs optional)", () => {
  it("mirrors the finalize XP award: main hero only, difficulty ≥ own level, Ⅶ fills to 7", () => {
    const main = (level: number) => ({ kind: "main", level }) as HeroState;
    expect(polishQuickCombatXpPossible(main(2), 1), "level above the field → no XP").toBe(false);
    expect(polishQuickCombatXpPossible(main(2), 2), "equal level → +1 XP possible").toBe(true);
    expect(polishQuickCombatXpPossible(main(2), 3), "field above the level → +2 XP possible").toBe(true);
    expect(polishQuickCombatXpPossible(main(6), 7), "Ⅶ fills to level 7").toBe(true);
    expect(polishQuickCombatXpPossible(main(7), 7), "a level-7 hero has nothing left to gain").toBe(false);
    expect(polishQuickCombatXpPossible({ kind: "secondary", level: 1 } as HeroState, 5), "a Secondary Hero never gains XP").toBe(
      false
    );
  });
});

// ===========================================================================
// Engine wiring in startNeutralEncounter (each with a diverging CONTROL)
// ===========================================================================

describe("polish-quick-combat — mandatory Quick Combat when covered with no XP", () => {
  it("resolves the fight unfought, with no choice, no combat and no Experience", () => {
    const state = makeGame("pqc-mandatory");
    const hero = state.heroes.hero_p1;
    hero.level = 2; // above the field → no XP possible
    const xpBefore = hero.experience;
    setArmy(state, [armyCard("castle.champions", "pack"), armyCard("castle.champions", "pack")]); // 12 ≥ 4
    const field = guardField(state, 1);

    encounter(state, field);

    expect(quickCombatWon(state)).toBe(true);
    expect(state.combat, "no combat opens").toBeNull();
    expect(state.pendingChoice, "the mandatory case never asks").toBeNull();
    expect(state.heroes.hero_p1.experience, "a Quick Combat pays no Experience").toBe(xpBefore);
  });

  it("MUTATION CONTROL: a covered high-level hero with a too-weak army must FIGHT (rule off: classic auto-win)", () => {
    // Rule ON, level > difficulty, but strength 1 < threshold 4 → a REAL fight.
    const state = makeGame("pqc-short");
    state.heroes.hero_p1.level = 2;
    setArmy(state, [armyCard("castle.griffins", "few")]); // strength 1
    encounter(state, guardField(state, 1));
    expect(quickCombatWon(state), "the level auto-win must NOT apply under the Polish rule").toBe(false);
    expect(state.combat?.context.kind).toBe("neutral");
    expect(state.phase).toBe("combat-setup");

    // CONTROL: rule OFF — the same hero auto-wins on level alone.
    const control = makeGame("pqc-short-control", { houseRules: { "polish-quick-combat": false } });
    control.heroes.hero_p1.level = 2;
    setArmy(control, [armyCard("castle.griffins", "few")]);
    encounter(control, guardField(control, 1));
    expect(quickCombatWon(control)).toBe(true);
    expect(control.combat).toBeNull();
  });
});

describe("polish-quick-combat — fight-or-quick choice when Experience is possible", () => {
  function openChoice(seed: string): GameState {
    const state = makeGame(seed);
    state.heroes.hero_p1.level = 1;
    setArmy(state, [armyCard("castle.champions", "pack"), armyCard("castle.champions", "pack")]); // 12 ≥ 6
    encounter(state, guardField(state, 2)); // difficulty 2 > level 1 → +2 XP possible
    return state;
  }

  it("opens the choice; resolving Quick Combat wins unfought with no Experience", () => {
    let state = openChoice("pqc-choice-quick");
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(choiceContext(state)).toBe("polish-quick-combat");
    expect(state.phase).toBe("choice");
    const xpBefore = state.heroes.hero_p1.experience;

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(quickCombatWon(state)).toBe(true);
    expect(state.combat).toBeNull();
    expect(state.heroes.hero_p1.experience, "the chosen Quick Combat pays no Experience").toBe(xpBefore);
  });

  it("resolving Fight opens the normal guard Combat Setup", () => {
    let state = openChoice("pqc-choice-fight");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(quickCombatWon(state)).toBe(false);
    expect(state.combat?.context.kind).toBe("neutral");
    expect(state.combat?.context.kind === "neutral" && state.combat.context.difficulty).toBe(2);
    expect(state.phase).toBe("combat-setup");
  });

  it("CONTROL: rule OFF — the same setup goes straight to Combat Setup (no choice, no Quick Combat)", () => {
    const control = makeGame("pqc-choice-control", { houseRules: { "polish-quick-combat": false } });
    control.heroes.hero_p1.level = 1;
    setArmy(control, [armyCard("castle.champions", "pack"), armyCard("castle.champions", "pack")]);
    encounter(control, guardField(control, 2));
    expect(control.pendingChoice).toBeNull();
    expect(quickCombatWon(control)).toBe(false);
    expect(control.phase).toBe("combat-setup");
  });

  it("choosing Fight at a matching level still offers Cyra's Diplomacy afterwards", () => {
    const state = makeGame("pqc-diplomacy");
    state.heroes.hero_p1.level = 1;
    state.players.p1.hand = ["ability.diplomacy"];
    setArmy(state, [armyCard("castle.champions", "pack"), armyCard("castle.champions", "pack")]); // 12 ≥ 4
    encounter(state, guardField(state, 1)); // level == difficulty → +1 XP possible
    expect(choiceContext(state)).toBe("polish-quick-combat");

    const next = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(choiceContext(next), "Diplomacy keeps its matching-level offer").toBe("diplomacy-skip");
  });
});

describe("polish-quick-combat — VI–VII fields become eligible", () => {
  it("a level-1 hero with a strong army gets the choice at a difficulty-6 field (rule off: always fights)", () => {
    const state = makeGame("pqc-vi");
    state.heroes.hero_p1.level = 1;
    setArmy(state, Array.from({ length: 5 }, () => armyCard("castle.champions", "pack"))); // 30 ≥ 14
    encounter(state, guardField(state, 6));
    expect(choiceContext(state)).toBe("polish-quick-combat");

    const control = makeGame("pqc-vi-control", { houseRules: { "polish-quick-combat": false } });
    control.heroes.hero_p1.level = 1;
    setArmy(control, Array.from({ length: 5 }, () => armyCard("castle.champions", "pack")));
    encounter(control, guardField(control, 6));
    expect(control.pendingChoice).toBeNull();
    expect(control.phase).toBe("combat-setup");
  });
});

describe("polish-quick-combat — Stacks interplay at the ≥ boundary", () => {
  const stacksRules = { "polish-quick-combat": true, "polish-unit-stacks": true } as const;

  it("with Stacks on, the threshold gains +1 and each layer adds 0.5 — equal strength qualifies", () => {
    // Threshold: field Ⅲ on normal WITH stacks = 2×3 + 2 + 1 = 9.
    // 8.5 (4 + 4.5) < 9 → the fight is mandatory. Were the +1 wired away, the
    // 8-threshold would qualify 8.5 and this assertion fails (mutation check).
    const short = makeGame("pqc-stacks-short", { houseRules: { ...stacksRules } });
    short.heroes.hero_p1.level = 4; // no XP → would be a mandatory Quick Combat if covered
    setArmy(short, [armyCard("castle.crusaders", "pack"), armyCard("castle.crusaders", "pack", 1)]);
    encounter(short, guardField(short, 3));
    expect(quickCombatWon(short)).toBe(false);
    expect(short.phase).toBe("combat-setup");

    // 9.0 (4 + 5) == 9 → "equal or higher" qualifies → mandatory Quick Combat.
    const covered = makeGame("pqc-stacks-covered", { houseRules: { ...stacksRules } });
    covered.heroes.hero_p1.level = 4;
    setArmy(covered, [armyCard("castle.crusaders", "pack"), armyCard("castle.crusaders", "pack", 2)]);
    encounter(covered, guardField(covered, 3));
    expect(quickCombatWon(covered)).toBe(true);
    expect(covered.combat).toBeNull();
  });
});

describe("polish-quick-combat — registry", () => {
  it("is a polish-category rule, default OFF in BINH and Legacy", () => {
    const def = HOUSE_RULES.find((rule) => rule.id === "polish-quick-combat");
    expect(def).toBeTruthy();
    expect(def!.category).toBe("polish");
    expect(def!.default).toBe(false);
    expect(resolveHouseRules({ ruleset: "binh" })["polish-quick-combat"]).toBe(false);
    expect(resolveHouseRules({ ruleset: "legacy" })["polish-quick-combat"]).toBe(false);
  });
});
