import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./adventure-setup";
import {
  getMainHero,
  processPendingVisit,
  PRINTED_RESOURCE_DIE_FACES,
  resourceDieFaces,
  SINGLE_VALUABLES_RESOURCE_DIE_FACES
} from "./adventure";
import { HOUSE_RULES, houseRuleDefaultFor } from "./house-rules";
import { polishReducedStartingBonusVisitSteps } from "./polish-house-rules";
import type { ActiveEffectState, GameRuleset, GameState, HouseRuleId, VisitStep } from "./state";

/**
 * The Resource die's "2 valuables" face is a PRINTED face of the base game.
 * The engine used to hardcode it away for EVERY mode; it is now the BINH-only
 * house rule `resource-die-single-valuables` (ON by default under BINH, OFF in
 * Legacy / the base game).
 *
 * Every claim below asserts the OBSERVABLE outcome — what the die actually
 * rolls, what the player actually gains, which "set the die" options are
 * actually offered — with a CONTROL on the other side of the toggle. Restoring
 * the old hardcoded capped table (or dropping the state-aware `resourceDieFaces`
 * read at any consumer) fails these.
 */

const RULE: HouseRuleId = "resource-die-single-valuables";

type Roll = { resource: string; amount: number };

function makeState(ruleset: GameRuleset, seed: string, houseRules?: Partial<Record<HouseRuleId, boolean>>) {
  return createAdventureGameState({
    seed,
    ruleset,
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(houseRules ? { houseRules } : {})
  });
}

function injectVisit(state: GameState, steps: VisitStep[]): void {
  const hero = getMainHero(state, "p1")!;
  state.adventure!.pendingVisit = {
    heroId: hero.id,
    playerId: "p1",
    fieldId: hero.spaceId!,
    steps
  };
}

function resourceRollsOf(state: GameState): Roll[] {
  return state.eventLog.flatMap((event) =>
    event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "resource" ? (event.resourceRolls ?? []) : []
  );
}

/**
 * Rolls the Resource die once per seed through the REAL visit pipeline and
 * returns every rolled face. A single die with no reroll/set effect
 * auto-resolves, so the gain lands too.
 */
function rollAcrossSeeds(
  ruleset: GameRuleset,
  seedPrefix: string,
  count: number,
  houseRules?: Partial<Record<HouseRuleId, boolean>>,
  step: VisitStep = { type: "ROLL_RESOURCE_DICE", count: 1 } as VisitStep
): Roll[] {
  const rolls: Roll[] = [];
  for (let index = 0; index < count; index += 1) {
    const state = makeState(ruleset, `${seedPrefix}-${index}`, houseRules);
    injectVisit(state, [step]);
    processPendingVisit(state);
    rolls.push(...resourceRollsOf(state));
  }
  return rolls;
}

function hasFace(rolls: Roll[], resource: string, amount: number): boolean {
  return rolls.some((roll) => roll.resource === resource && roll.amount === amount);
}

/** A spent-on-use "set the Resource die" effect (Cards of Prophecy's map half). */
function giveDieSetEffect(state: GameState): void {
  state.activeEffects.push({
    id: "test-die-set",
    name: "Cards of Prophecy",
    scope: "player",
    duration: { type: "current-turn" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "ADVENTURE_DIE_SET", dice: "any" }],
    source: { kind: "card", cardId: "artifact.cards_of_prophecy" },
    controllerId: "p1",
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  } as unknown as ActiveEffectState);
}

/** The labels of the "set the die" options offered after a roll. */
function setDieOptionLabels(ruleset: GameRuleset, houseRules?: Partial<Record<HouseRuleId, boolean>>): string[] {
  const state = makeState(ruleset, "set-die-options", houseRules);
  giveDieSetEffect(state);
  injectVisit(state, [{ type: "ROLL_RESOURCE_DICE", count: 1 } as VisitStep]);
  processPendingVisit(state);
  const step = state.adventure!.pendingVisit?.steps[0];
  if (!step || step.type !== "CHOOSE_ONE") {
    throw new Error("expected the die-set choice window to open");
  }
  return step.options
    .map((option) => option.label)
    .filter((label) => label.startsWith("Cards of Prophecy: set"));
}

// ---------------------------------------------------------------------------
// The two dice
// ---------------------------------------------------------------------------

describe("Resource die faces — printed vs. the BINH valuables cap", () => {
  it("the PRINTED die keeps its 2-valuables face; the house-rule die reduces it to 1", () => {
    expect(PRINTED_RESOURCE_DIE_FACES).toEqual([
      { resource: "buildingMaterials", amount: 2 },
      { resource: "buildingMaterials", amount: 4 },
      { resource: "valuables", amount: 1 },
      { resource: "valuables", amount: 2 },
      { resource: "gold", amount: 3 },
      { resource: "gold", amount: 6 }
    ]);
    expect(SINGLE_VALUABLES_RESOURCE_DIE_FACES).toEqual([
      { resource: "buildingMaterials", amount: 2 },
      { resource: "buildingMaterials", amount: 4 },
      { resource: "valuables", amount: 1 },
      { resource: "valuables", amount: 1 },
      { resource: "gold", amount: 3 },
      { resource: "gold", amount: 6 }
    ]);
    // Same length + same face ORDER, so the die-cube face indexes line up.
    expect(SINGLE_VALUABLES_RESOURCE_DIE_FACES).toHaveLength(PRINTED_RESOURCE_DIE_FACES.length);
    expect(SINGLE_VALUABLES_RESOURCE_DIE_FACES.map((face) => face.resource)).toEqual(
      PRINTED_RESOURCE_DIE_FACES.map((face) => face.resource)
    );
  });

  it("is a BINH-only house rule: ON by default in BINH, OFF in Legacy", () => {
    const def = HOUSE_RULES.find((rule) => rule.id === RULE);
    expect(def).toBeDefined();
    expect(def!.default).toBe(true);
    expect(def!.legacyDefault).toBeUndefined();
    expect(houseRuleDefaultFor("binh", RULE)).toBe(true);
    expect(houseRuleDefaultFor("legacy", RULE)).toBe(false);
  });

  it("resourceDieFaces picks the die off the rule, in either mode", () => {
    const binh = makeState("binh", "faces-binh");
    const legacy = makeState("legacy", "faces-legacy");
    expect(resourceDieFaces(binh)).toEqual(SINGLE_VALUABLES_RESOURCE_DIE_FACES);
    expect(resourceDieFaces(legacy)).toEqual(PRINTED_RESOURCE_DIE_FACES);
    // Either mode may flip it explicitly.
    expect(resourceDieFaces(makeState("binh", "faces-binh-off", { [RULE]: false }))).toEqual(
      PRINTED_RESOURCE_DIE_FACES
    );
    expect(resourceDieFaces(makeState("legacy", "faces-legacy-on", { [RULE]: true }))).toEqual(
      SINGLE_VALUABLES_RESOURCE_DIE_FACES
    );
  });
});

// ---------------------------------------------------------------------------
// (a) BINH default — 2 valuables can never be rolled
// ---------------------------------------------------------------------------

describe("BINH default (rule ON) — the die never grants 2 valuables", () => {
  it("60 real rolls hit the 1-valuables face and never a 2-valuables one", () => {
    const rolls = rollAcrossSeeds("binh", "binh-cap", 60);
    expect(rolls.length).toBeGreaterThanOrEqual(60);
    expect(hasFace(rolls, "valuables", 1)).toBe(true); // the valuables faces ARE reachable
    expect(rolls.filter((roll) => roll.resource === "valuables" && roll.amount >= 2)).toEqual([]);
  });

  it("the 'set the Resource die' picks dedupe to ONE 1-valuables option", () => {
    const labels = setDieOptionLabels("binh");
    expect(labels.filter((label) => label.includes("1 valuables"))).toHaveLength(1);
    expect(labels.some((label) => label.includes("2 valuables"))).toBe(false);
    // The other five printed faces are still offered (2/4 materials, 3/6 gold).
    expect(labels.some((label) => label.includes("2 materials"))).toBe(true);
    expect(labels.some((label) => label.includes("4 materials"))).toBe(true);
    expect(labels.some((label) => label.includes("6 gold"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) Legacy / base game — the printed 2-valuables face is live
// ---------------------------------------------------------------------------

describe("Legacy / base game (rule OFF) — the printed 2-valuables face is reachable", () => {
  it("a real roll lands on 2 valuables and the player GAINS 2 valuables", () => {
    let granted = 0;
    let seen = false;
    for (let index = 0; index < 60 && !seen; index += 1) {
      const state = makeState("legacy", `legacy-printed-${index}`);
      const before = state.players.p1!.resources.valuables;
      injectVisit(state, [{ type: "ROLL_RESOURCE_DICE", count: 1 } as VisitStep]);
      processPendingVisit(state);
      const rolls = resourceRollsOf(state);
      if (hasFace(rolls, "valuables", 2)) {
        seen = true;
        // Observable outcome: the single-die roll auto-resolves into a gain.
        granted = state.players.p1!.resources.valuables - before;
      }
    }
    expect(seen).toBe(true);
    expect(granted).toBe(2);
  });

  it("the 'set the Resource die' picks include a DISTINCT 2-valuables option", () => {
    const labels = setDieOptionLabels("legacy");
    expect(labels.filter((label) => label.includes("1 valuables"))).toHaveLength(1);
    expect(labels.filter((label) => label.includes("2 valuables"))).toHaveLength(1);
    // All six printed faces are distinct → six picks (the capped die dedupes to five).
    expect(labels).toHaveLength(6);
    expect(setDieOptionLabels("binh")).toHaveLength(5);
  });

  it("legacy snapshots with no frozen flag roll the PRINTED die", () => {
    // A pre-rule snapshot carries no `resource-die-single-valuables` entry, so
    // the mode default decides — and Legacy's default is the printed die.
    const state = makeState("legacy", "legacy-snapshot");
    delete state.adventure!.houseRules![RULE];
    expect(resourceDieFaces(state)).toEqual(PRINTED_RESOURCE_DIE_FACES);
  });
});

// ---------------------------------------------------------------------------
// (c) Explicit toggles win in BOTH modes
// ---------------------------------------------------------------------------

describe("the toggle wins in both modes", () => {
  it("BINH with the rule OFF rolls the printed die (2 valuables reachable)", () => {
    const rolls = rollAcrossSeeds("binh", "binh-off", 60, { [RULE]: false });
    expect(hasFace(rolls, "valuables", 2)).toBe(true);
  });

  it("Legacy with the rule ON caps valuables at 1", () => {
    const rolls = rollAcrossSeeds("legacy", "legacy-on", 60, { [RULE]: true });
    expect(hasFace(rolls, "valuables", 1)).toBe(true);
    expect(rolls.filter((roll) => roll.resource === "valuables" && roll.amount >= 2)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (d) Polish reduced starting bonus — the high-face reroll is now LIVE on
//     valuables (it was dead while the table hardcoded the cap)
// ---------------------------------------------------------------------------

describe("Polish reduced starting bonus vs. the printed die", () => {
  const capStep = (() => {
    const bonus = polishReducedStartingBonusVisitSteps()[0];
    if (bonus.type !== "CHOOSE_ONE") {
      throw new Error("expected the reduced starting bonus CHOOSE_ONE");
    }
    const step = bonus.options[1]!.steps[0]!;
    expect(step).toMatchObject({ type: "ROLL_RESOURCE_DICE", capHighValues: true });
    return step;
  })();

  it("rerolls the printed 2-valuables face away, and KEEPS 1 valuables", () => {
    const rolls = rollAcrossSeeds("legacy", "polish-cap-printed", 80, undefined, capStep);
    expect(rolls.length).toBeGreaterThanOrEqual(80);
    // Every "high value" face is rerolled away — the valuables clause is live now.
    expect(rolls.filter((roll) => roll.resource === "valuables" && roll.amount >= 2)).toEqual([]);
    expect(rolls.filter((roll) => roll.resource === "buildingMaterials" && roll.amount >= 4)).toEqual([]);
    expect(rolls.filter((roll) => roll.resource === "gold" && roll.amount >= 6)).toEqual([]);
    // CONTROL: the low valuables face is NOT capped away — the reroll targets
    // the AMOUNT, not the resource.
    expect(hasFace(rolls, "valuables", 1)).toBe(true);
    expect(hasFace(rolls, "buildingMaterials", 2)).toBe(true);
    expect(hasFace(rolls, "gold", 3)).toBe(true);
  });

  it("CONTROL: without the cap the same printed die DOES roll the high faces", () => {
    const rolls = rollAcrossSeeds("legacy", "polish-cap-printed", 80);
    expect(hasFace(rolls, "valuables", 2)).toBe(true);
    expect(hasFace(rolls, "buildingMaterials", 4)).toBe(true);
    expect(hasFace(rolls, "gold", 6)).toBe(true);
  });
});
