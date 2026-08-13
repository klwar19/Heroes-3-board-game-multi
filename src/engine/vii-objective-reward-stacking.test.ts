import { describe, expect, it } from "vitest";
import { beginFieldVisit, getMainHero } from "./adventure";
import { createAdventureGameState } from "./index";
import {
  describeCustomMapPresetEntries,
  viiObjectiveRewardStacks,
  viiRewardStackWarnings
} from "./map-preset";
import type {
  CustomHexEvent,
  CustomMapPreset,
  CustomMapTilePlan,
  GameState,
  MapFieldState
} from "./state";

// ---------------------------------------------------------------------------
// Ⅶ Grail / Dragon Utopia reward STACKING (user report 2026-08-03: "make sure
// rewards to VII utopia or grail wont stack so much with other option of map
// design needlessly, will warn if that happen").
//
// A Ⅶ objective field already pays a built-in reward. INDEPENDENT map-design
// options can attach more payouts to the SAME field for the SAME clear:
//   • the centre-hex reward / VP (`plan.centerHex`)
//   • an invisible hex event's reward / VP on that hex (`preset.hexEvents`)
//   • the Dragon Utopia bonus Search (`preset.objectives.utopiaBonusSearch`)
// All three are DELIBERATE, so nothing is blocked or nerfed. This file pins the
// MATRIX empirically (which pay together for one clear, with the combined
// observable outcome) plus the two warning surfaces, each with a CONTROL.
// ---------------------------------------------------------------------------

const START_A = { row: 8, col: 2 } as const;
const START_B = { row: 10, col: 7 } as const;
const CENTER = { row: 9, col: 4 } as const;
/** The Ⅶ objective is slot 0 — the centre tile's own centre hex (rotation-proof). */
const CENTER_FIELD_ID = "h:9:4";

function startPlans(): CustomMapTilePlan[] {
  return [
    { row: START_A.row, col: START_A.col, group: "starting", faceDown: false },
    { row: START_B.row, col: START_B.col, group: "starting", faceDown: false }
  ];
}

/**
 * A two-seat map whose single face-up CENTRE tile carries a designated Ⅶ
 * objective. A designer-placed Grail / Utopia auto-activates the Grail & Dragon
 * Utopia field-rules package, so this is the live "hidden package" path.
 */
function centreObjectiveMap(
  seed: string,
  plan: Partial<CustomMapTilePlan>,
  preset: CustomMapPreset = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest",
    customMap: [
      ...startPlans(),
      {
        row: CENTER.row,
        col: CENTER.col,
        group: "center",
        faceDown: false,
        tileDefId: "C4",
        viiField: "dragon_utopia",
        ...plan
      }
    ],
    customMapPreset: preset
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  return state;
}

function objectiveField(state: GameState): MapFieldState {
  return Object.values(state.adventure!.fields).find((field) => field.difficulty === 7)!;
}

/** Artifact-family Searches queued as top-level rewards, in queue order. */
function queuedArtifactSearchCounts(state: GameState): number[] {
  return (state.adventure!.rewardQueue ?? [])
    .filter((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts")
    .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0));
}

/** Artifact Searches queued INSIDE a designer visit-steps package. */
function queuedVisitStepSearchCounts(state: GameState): number[] {
  const out: number[] = [];
  for (const reward of state.adventure!.rewardQueue ?? []) {
    if (reward.kind !== "visit-steps") continue;
    for (const step of reward.steps) {
      if (step.type === "SEARCH_SHARED_DECK" && step.deckId === "artifacts") {
        out.push(step.count);
      }
    }
  }
  return out;
}

function visitStepTypes(state: GameState): string[] {
  const out: string[] = [];
  for (const reward of state.adventure!.rewardQueue ?? []) {
    if (reward.kind !== "visit-steps") continue;
    for (const step of reward.steps) {
      out.push(step.type);
    }
  }
  return out;
}

/** Clear the Ⅶ objective once with p1's main hero and report what it paid. */
function clearObjectiveOnce(state: GameState, revisit = false) {
  const hero = getMainHero(state, "p1")!;
  const field = objectiveField(state);
  hero.spaceId = field.spaceId;
  const goldBefore = state.players.p1.resources.gold;
  beginFieldVisit(state, hero.id, field.spaceId, revisit);
  return {
    field: objectiveField(state),
    goldGained: state.players.p1.resources.gold - goldBefore,
    artifactSearches: queuedArtifactSearchCounts(state),
    visitStepSearches: queuedVisitStepSearchCounts(state),
    visitStepTypes: visitStepTypes(state)
  };
}

function hexEvent(fieldId: string, extra: Partial<CustomHexEvent> = {}) {
  return {
    [fieldId]: {
      event: {
        id: "ev-cache",
        placement: { row: CENTER.row, col: CENTER.col },
        message: "A hidden cache!",
        reward: { gold: 15, searchArtifact: 3 },
        mode: "first" as const,
        ...extra
      },
      firedPlayerIds: []
    }
  };
}

describe("Ⅶ Dragon Utopia — the reward-stacking matrix (one clear)", () => {
  it("BASELINE: the built-in payout alone — Search 3/5/5 + the Morale / Empower pick, no designer extras", () => {
    const paid = clearObjectiveOnce(centreObjectiveMap("stack-base", {}));
    expect(paid.artifactSearches).toEqual([3, 3]);
    expect(paid.visitStepSearches).toEqual([]);
    expect(paid.visitStepTypes).toEqual(["CHOOSE_ONE"]);
    // The field-rules package pays no gold of its own (only the legacy Polish
    // house rule does), so a gold gain here can only come from a designer extra.
    expect(paid.goldGained).toBe(20);
  });

  it("STACK A — centre-hex reward pays ON TOP of the built-in ladder, exactly once", () => {
    const state = centreObjectiveMap("stack-center", {
      centerHex: { reward: { gold: 25, searchArtifact: 5, treasureDice: 2 }, vp: 4 }
    });
    const paid = clearObjectiveOnce(state);
    // Both halves land for the same clear: the Utopia's own 3/5/5 …
    expect(paid.artifactSearches).toEqual([3, 3]);
    // … plus the designer package (a 4th Artifact Search + 2 Treasure dice).
    expect(paid.visitStepSearches).toEqual([5]);
    expect(paid.visitStepTypes).toContain("ROLL_TREASURE_DICE");
    expect(paid.goldGained).toBe(45);
    expect(paid.field.centerHexClaimed).toBe(true);

    // …and NEVER twice: a second visit of the same field re-pays nothing.
    state.adventure!.rewardQueue = [];
    const again = clearObjectiveOnce(state, true);
    expect(again.goldGained).toBe(0);
    expect(again.visitStepSearches).toEqual([]);
  });

  it("STACK B — a hidden hex event on the objective's own hex pays ON TOP too", () => {
    const state = centreObjectiveMap("stack-hexevent", {});
    state.adventure!.hexEvents = hexEvent(CENTER_FIELD_ID) as never;
    const paid = clearObjectiveOnce(state);
    expect(paid.artifactSearches).toEqual([3, 3]);
    expect(paid.visitStepSearches).toEqual([3]);
    expect(paid.goldGained).toBe(35);
  });

  it("STACK C — the opt-in utopiaBonusSearch adds a 4th Search on a DESIGNATED Ⅶ Utopia (BUG FIX)", () => {
    // BEFORE this fix the package branch (which a designated Ⅶ Utopia always
    // activates — i.e. exactly the map the knob is set for) never read the knob,
    // so it silently paid NOTHING while the map-pick banner still advertised
    // "Dragon Utopia bonus: Search(N) Artifacts". The 4th Search below is the
    // repro: deleting the grantUtopiaBonusSearch call in the package branch
    // leaves [3, 5, 5] and fails here.
    const state = centreObjectiveMap("stack-bonus", {}, { objectives: { utopiaBonusSearch: 3 } });
    expect(state.adventure!.mapPreset?.objectives?.hiddenGrailUtopia).toBe(true);
    expect(clearObjectiveOnce(state).artifactSearches).toEqual([3, 3, 3]);

    // CONTROL: the same designated map with the knob unset pays the standard three.
    const control = centreObjectiveMap("stack-bonus-control", {});
    expect(clearObjectiveOnce(control).artifactSearches).toEqual([3, 3]);
  });

  it("ALL THREE stack for one clear — the fully loaded Ⅶ Utopia", () => {
    const state = centreObjectiveMap(
      "stack-all",
      { centerHex: { reward: { gold: 25, searchArtifact: 5 } } },
      { objectives: { utopiaBonusSearch: 2 } }
    );
    state.adventure!.hexEvents = hexEvent(CENTER_FIELD_ID) as never;
    const paid = clearObjectiveOnce(state);
    // Built-in ladder + the bonus Search as top-level rewards…
    expect(paid.artifactSearches).toEqual([3, 3, 2]);
    // …the hex event's Search(3) and the centre-hex Search(5) as designer packages…
    expect(paid.visitStepSearches.sort()).toEqual([3, 5]);
    // …and both gold packages (15 + 25). Six Artifact Searches from one clear:
    // deliberate, but the two warning surfaces below now say so up front.
    expect(paid.goldGained).toBe(60);
  });

  it("a Ⅶ GRAIL pays its centre-hex reward on the clear and its dig reward on the dig — each once", () => {
    const state = centreObjectiveMap("stack-grail", {
      viiField: "grail",
      centerHex: { reward: { gold: 30 } }
    });
    expect(objectiveField(state).location).toBe("grail");

    const clear = clearObjectiveOnce(state);
    expect(clear.goldGained).toBe(30);
    expect(clear.field.grailDiggable).toBe(true);

    // The dig (a revisit) pays the package's own 20 gold — and the already-latched
    // centre-hex reward is NOT paid a second time (30 + 20, never 30 + 30 + 20).
    const dig = clearObjectiveOnce(state, true);
    expect(dig.goldGained).toBe(20);
    expect(state.adventure!.grail?.status).toBe("carried");
  });
});

describe("Ⅶ reward stacking — the designer warning", () => {
  const utopiaPlan = (extra: Partial<CustomMapTilePlan> = {}): CustomMapTilePlan[] => [
    ...startPlans(),
    {
      row: CENTER.row,
      col: CENTER.col,
      group: "center",
      faceDown: false,
      tileDefId: "C4",
      viiField: "dragon_utopia",
      ...extra
    }
  ];

  it("warns once per stacked Ⅶ field, naming the objective, its position and every extra", () => {
    const plans = utopiaPlan({ centerHex: { reward: { gold: 25 } } });
    const preset: CustomMapPreset = {
      objectives: { utopiaBonusSearch: 2 },
      hexEvents: [
        {
          id: "ev1",
          placement: { row: CENTER.row, col: CENTER.col },
          reward: { gold: 5 }
        }
      ]
    };
    const warnings = viiRewardStackWarnings(plans, preset);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Dragon Utopia at row 9, col 4");
    expect(warnings[0]).toContain("three Artifact Searches (3, then 5, 5)");
    expect(warnings[0]).toContain("the centre-hex reward");
    expect(warnings[0]).toContain("a hidden hex event on that same hex");
    expect(warnings[0]).toContain("the Dragon Utopia bonus Search");

    expect(viiObjectiveRewardStacks(plans, preset)).toEqual([
      {
        row: CENTER.row,
        col: CENTER.col,
        objective: "dragon_utopia",
        sources: ["center-hex", "hex-event", "utopia-bonus-search"]
      }
    ]);
  });

  it("CONTROL: a Ⅶ Utopia with no extra reward warns about nothing", () => {
    expect(viiRewardStackWarnings(utopiaPlan(), {})).toEqual([]);
    // An empty / all-zero reward package is not a payout either.
    expect(viiRewardStackWarnings(utopiaPlan({ centerHex: { reward: {}, vp: 0 } }), {})).toEqual([]);
    // A centre-hex GUARD change is not a reward.
    expect(
      viiRewardStackWarnings(utopiaPlan({ centerHex: { guard: { level: 5 } } }), {})
    ).toEqual([]);
  });

  it("CONTROL: the same extras on a Ⅶ field that is NOT a Grail / Utopia are not reported", () => {
    // A Random Town centre pays no Utopia/Grail objective reward, so its
    // centre-hex reward stacks on nothing.
    expect(
      viiRewardStackWarnings(
        utopiaPlan({ viiField: "town", centerHex: { reward: { gold: 25 } } }),
        { objectives: { utopiaBonusSearch: 2 } }
      )
    ).toEqual([]);
    // And a printed non-objective centre tile (#C1 = settlement) likewise.
    expect(
      viiRewardStackWarnings(
        utopiaPlan({ viiField: undefined, tileDefId: "#C1", centerHex: { reward: { gold: 9 } } }),
        {}
      )
    ).toEqual([]);
  });

  it("a PRINTED Grail / Utopia centre tile (no designation) is reported too, by name", () => {
    const grail = viiRewardStackWarnings(
      utopiaPlan({ viiField: undefined, tileDefId: "C2", centerHex: { reward: { valuables: 3 } } }),
      {}
    );
    expect(grail).toHaveLength(1);
    expect(grail[0]).toContain("Grail at row 9, col 4");
    expect(grail[0]).toContain("Grail dig");

    const utopia = viiRewardStackWarnings(
      utopiaPlan({ viiField: undefined, tileDefId: "C1", centerHex: { vp: 3 } }),
      {}
    );
    expect(utopia).toHaveLength(1);
    expect(utopia[0]).toContain("Dragon Utopia at row 9, col 4");
  });

  it("a hex event only stacks when it sits on the objective's OWN hex", () => {
    const plans = utopiaPlan();
    const onObjective: CustomMapPreset = {
      hexEvents: [{ id: "ev1", placement: { row: CENTER.row, col: CENTER.col }, reward: { gold: 5 } }]
    };
    const onRingHex: CustomMapPreset = {
      hexEvents: [
        { id: "ev1", placement: { row: CENTER.row, col: CENTER.col + 1 }, reward: { gold: 5 } }
      ]
    };
    expect(viiRewardStackWarnings(plans, onObjective)).toHaveLength(1);
    // CONTROL: a ring hex of the same tile is a different field — no stacking.
    expect(viiRewardStackWarnings(plans, onRingHex)).toEqual([]);
    // A message-only event pays nothing, so it does not stack either.
    expect(
      viiRewardStackWarnings(plans, {
        hexEvents: [{ id: "ev1", placement: { row: CENTER.row, col: CENTER.col }, message: "Boo" }]
      })
    ).toEqual([]);
  });

  it("a \"one of these tiles\" centre slot counts only when EVERY candidate is the same objective", () => {
    const allUtopia = viiRewardStackWarnings(
      utopiaPlan({
        viiField: undefined,
        tileDefId: undefined,
        oneOfTileDefIds: ["C1", "C3"],
        centerHex: { reward: { gold: 10 } }
      }),
      {}
    );
    expect(allUtopia).toHaveLength(1);
    expect(allUtopia[0]).toContain("Dragon Utopia");

    // CONTROL: a mixed list (Utopia + Grail) or a plain random centre slot is
    // uncertain at design time and is deliberately NOT warned.
    expect(
      viiRewardStackWarnings(
        utopiaPlan({
          viiField: undefined,
          tileDefId: undefined,
          oneOfTileDefIds: ["C1", "C2"],
          centerHex: { reward: { gold: 10 } }
        }),
        {}
      )
    ).toEqual([]);
    expect(
      viiRewardStackWarnings(
        utopiaPlan({ viiField: undefined, tileDefId: undefined, centerHex: { reward: { gold: 10 } } }),
        {}
      )
    ).toEqual([]);
  });

  it("the utopiaBonusSearch knob alone stacks only where a Ⅶ Utopia actually exists", () => {
    const preset: CustomMapPreset = { objectives: { utopiaBonusSearch: 3 } };
    expect(viiRewardStackWarnings(utopiaPlan(), preset)).toHaveLength(1);
    // CONTROL: a Grail-only design — the knob never touches a Grail field.
    expect(viiRewardStackWarnings(utopiaPlan({ viiField: "grail" }), preset)).toEqual([]);
    // CONTROL: no centre tile at all.
    expect(viiRewardStackWarnings(startPlans(), preset)).toEqual([]);
  });
});

describe("Ⅶ reward stacking — the lobby map-pick banner line", () => {
  const plans: CustomMapTilePlan[] = [
    ...startPlans(),
    {
      row: CENTER.row,
      col: CENTER.col,
      group: "center",
      faceDown: false,
      tileDefId: "C4",
      viiField: "dragon_utopia",
      centerHex: { reward: { gold: 25 } }
    }
  ];

  it("adds ONE concise line naming the stacked Ⅶ objective", () => {
    const lines = describeCustomMapPresetEntries({ notes: "A test map" }, plans).map(
      (entry) => entry.text
    );
    const stackLines = lines.filter((text) => /Extra rewards stack/.test(text));
    expect(stackLines).toHaveLength(1);
    expect(stackLines[0]).toContain("Ⅶ Dragon Utopia");
    expect(stackLines[0]).toContain("the standard objective reward still pays too");
  });

  it("shows even with an otherwise-empty preset (the stack rides the TILES)", () => {
    // A centre-hex reward lives on the tile plan, so the preset can be inactive.
    const entries = describeCustomMapPresetEntries(undefined, plans);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toMatch(/Extra rewards stack/);
  });

  it("CONTROL: no stacking ⇒ no line (and no tiles ⇒ the classic preset-only banner)", () => {
    const noExtras = plans.map((plan) =>
      plan.group === "center" ? { ...plan, centerHex: undefined } : plan
    );
    expect(
      describeCustomMapPresetEntries({ notes: "A test map" }, noExtras).map((entry) => entry.text)
    ).toEqual(["A test map"]);
    // Called without tiles (legacy one-arg callers) the line can never appear.
    expect(
      describeCustomMapPresetEntries({ notes: "A test map" }).map((entry) => entry.text)
    ).toEqual(["A test map"]);
  });
});
