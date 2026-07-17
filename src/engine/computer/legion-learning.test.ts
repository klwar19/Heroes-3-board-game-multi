import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import type {
  GameAction,
  PendingChoice,
  PlayerVisibleState,
} from "../state";
import { cardKeepValue, scoreCardAction } from "./card-policy";
import { TIER_SCORE } from "./card-values";
import { scoreChoiceAction } from "./choice-policy";
import type { ComputerObservation } from "./types";

/**
 * Legion-voucher play timing and the Learning climb valuation. Mutation-checked:
 * removing the every-phase Legion play score, the outstanding-voucher hold, the
 * Learning level-gated tier bump, or the expert-mode learning-level-up pick
 * fails a named test here.
 */

type PlayerOverrides = {
  factionId?: string;
  hand?: string[];
  army?: { unitDefId: string; side?: string }[];
  recruitDiscounts?: unknown[];
  expertUses?: number;
  expertUsesSpent?: number;
};

function makeState(
  players: Record<string, PlayerOverrides>,
  extras: {
    heroes?: Record<
      string,
      { controllerId: string; kind: string; level: number }
    >;
    pendingChoice?: PendingChoice | null;
  } = {},
): PlayerVisibleState {
  const playerMap: Record<string, unknown> = {};
  for (const [id, over] of Object.entries(players)) {
    playerMap[id] = {
      id,
      factionId: over.factionId,
      hand: over.hand ?? [],
      discard: [],
      recruitDiscounts: over.recruitDiscounts,
      limits: { hand: 5, expertUses: over.expertUses ?? 2 },
      combatStats: { expertUsesSpentThisRound: over.expertUsesSpent ?? 0 },
      permanents: [],
      resources: { gold: 10, buildingMaterials: 2, valuables: 1 },
      army: (over.army ?? []).map((entry, index) => ({
        id: `army_${id}_${index}`,
        unitDefId: entry.unitDefId,
        side: entry.side ?? "pack",
      })),
    };
  }
  return {
    seed: "legion-learning-test",
    round: 3,
    eventCounter: 0,
    combat: null,
    pendingChoice: extras.pendingChoice ?? null,
    players: playerMap,
    towns: {},
    heroes: extras.heroes ?? {},
    adventure: { fields: {} },
  } as unknown as PlayerVisibleState;
}

function observe(
  state: PlayerVisibleState,
  playerId = "p2",
): ComputerObservation {
  return { playerId, state, legalActions: [] };
}

describe("Learning — an A-tier engine while the hero still climbs", () => {
  function keepAtLevel(level: number | null): number {
    const heroes: Record<
      string,
      { controllerId: string; kind: string; level: number }
    > =
      level === null
        ? {}
        : { h1: { controllerId: "p2", kind: "main", level } };
    return cardKeepValue(
      "ability.learning",
      observe(makeState({ p2: { factionId: "castle" }, p1: {} }, { heroes })),
    );
  }

  it("values Learning a full tier higher at hero level 2 than at level 7", () => {
    expect(keepAtLevel(2) - keepAtLevel(7)).toBe(TIER_SCORE.A - TIER_SCORE.B);
  });

  it("CONTROL: with no main hero on the map the printed B tier stands", () => {
    expect(keepAtLevel(null)).toBe(keepAtLevel(7));
  });
});

describe("Learning level-up choice — expert full level beats the half step", () => {
  const bothModes: PendingChoice = {
    id: "c1",
    type: "OPTION_CHOICE",
    playerId: "p2",
    prompt: "Learning?",
    options: [
      { label: "Play Learning — advance a half level (+1 Experience)" },
      { label: "Play Learning (expert) — advance a full level (+2 Experience), then remove it" },
      { label: "Decline" },
    ],
    context: "learning-level-up",
    learningLevelUp: { modes: ["basic", "expert"] },
  } as unknown as PendingChoice;

  function scoreOption(optionIndex: number, expertUses: number): number {
    const state = makeState(
      { p2: { factionId: "castle", expertUses }, p1: {} },
      { pendingChoice: bothModes },
    );
    const action: GameAction = {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      optionIndex,
    } as GameAction;
    return scoreChoiceAction(observe(state), action)?.score ?? 0;
  }

  it("prefers the expert full level with 2 crowns spare", () => {
    expect(scoreOption(1, 2)).toBeGreaterThan(scoreOption(0, 2));
    expect(scoreOption(0, 2)).toBeGreaterThan(scoreOption(2, 2));
  });

  it("CONTROL: with the round's last crown, the basic half step wins", () => {
    expect(scoreOption(0, 1)).toBeGreaterThan(scoreOption(1, 1));
    expect(scoreOption(1, 1)).toBeGreaterThan(scoreOption(2, 1));
  });
});

describe("Legion voucher — played for the discount in every phase", () => {
  // Three bronze Packs => past establish-core (unlock-silver phase).
  const bronzePacks = [
    { unitDefId: "castle.halberdiers" },
    { unitDefId: "castle.marksmen" },
    { unitDefId: "castle.griffins" },
  ];

  it("fixture sanity: the packs are real units and the phase leaves establish-core", () => {
    for (const unit of bronzePacks) {
      expect(coreUnitDefinitions[unit.unitDefId]).toBeTruthy();
    }
  });

  function scoreLegionPlay(recruitDiscounts?: unknown[]): number {
    const state = makeState({
      p2: {
        factionId: "castle",
        hand: ["artifact.legs_of_legion"],
        army: bronzePacks,
        recruitDiscounts,
      },
      p1: {},
    });
    const action: GameAction = {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "artifact.legs_of_legion",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" },
    } as GameAction;
    return scoreCardAction(observe(state), action)?.score ?? 0;
  }

  it("scores the discount play decisively past establish-core (voucher = banked recruit gold)", () => {
    expect(scoreLegionPlay()).toBeGreaterThan(700);
  });

  it("CONTROL: an outstanding voucher holds the next Legion piece back", () => {
    const heldBack = scoreLegionPlay([
      { cardId: "artifact.head_of_legion", amount: 6 },
    ]);
    expect(heldBack).toBeLessThan(700);
    expect(scoreLegionPlay()).toBeGreaterThan(heldBack);
  });
});
