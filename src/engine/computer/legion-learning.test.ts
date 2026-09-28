import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import type {
  GameAction,
  PendingChoice,
  PlayerVisibleState,
} from "../state";
import { createAdventureGameState } from "../adventure-setup";
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
    houseRules?: Record<string, boolean>;
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
    adventure: { fields: {}, houseRules: extras.houseRules ?? {} },
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

  // acc2eeef (v143, "Learning kept pre-level-7"): below hero level 7 Learning
  // keeps at least 70 (cardKeepValue floor, above its A-tier climb value); an
  // unknown level reads as a level-1 hero (`ownHeroLevel ?? 1`).
  it("values Learning a full tier higher at hero level 2 than at level 7", () => {
    expect(keepAtLevel(2) - keepAtLevel(7)).toBeGreaterThanOrEqual(TIER_SCORE.A - TIER_SCORE.B);
    expect(keepAtLevel(2)).toBeGreaterThanOrEqual(70);
    expect(keepAtLevel(6)).toBe(keepAtLevel(2));
  });

  it("CONTROL: past the climb (level 7+) the printed B tier stands", () => {
    expect(keepAtLevel(9)).toBe(keepAtLevel(7));
    expect(keepAtLevel(7)).toBeLessThan(70);
    expect(keepAtLevel(null)).toBe(keepAtLevel(1));
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
  // Since acc2eeef (v143, "Legion voucher savings priced through the engine's
  // own rules") the play is valued by the gold it ACTUALLY saves on a purchase
  // the seat can make now (legionPurchaseSavings), so the fixture is a real
  // Castle game whose only discountable purchase is the Griffin Few -> Pack
  // reinforce (6 gold; Population token and Citadel standing).
  const army = [
    { id: "army_hal", unitDefId: "castle.halberdiers", side: "pack" as const },
    { id: "army_mks", unitDefId: "castle.marksmen", side: "pack" as const },
    { id: "army_grf", unitDefId: "castle.griffins", side: "few" as const },
  ];
  // Vouchers are reserved for one exact purchase (RecruitDiscountVoucher.target).
  const loinsOnGriffin = { cardId: "artifact.loins_of_legion", amount: 5,
    target: { kind: "reinforce", armyUnitId: "army_grf" } };

  it("fixture sanity: the army cards are real units", () => {
    for (const unit of army) {
      expect(coreUnitDefinitions[unit.unitDefId]).toBeTruthy();
    }
  });

  function scoreLegionPlay(recruitDiscounts?: unknown[], oldRule = false): number {
    const state = createAdventureGameState({
      seed: "legion-learning-test", events: false, rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Rival", factionId: "necropolis", heroDefId: "vidomina" },
        { id: "p2", name: "Legion", factionId: "castle", heroDefId: "catherine" },
      ],
    });
    state.round = 3;
    state.players.p2.army = army.map((unit) => ({ ...unit }));
    state.players.p2.hand = ["artifact.legs_of_legion"];
    state.players.p2.recruitDiscounts = (recruitDiscounts ?? []) as typeof state.players.p2.recruitDiscounts;
    if (oldRule) {
      state.adventure!.houseRules = { ...state.adventure!.houseRules, "immediate-reinforcement-prompts": true };
    }
    const action: GameAction = {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "artifact.legs_of_legion",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" },
    } as GameAction;
    return scoreCardAction(observe(state as unknown as PlayerVisibleState), action)?.score ?? 0;
  }

  it("scores the discount play decisively when it saves real recruit gold (voucher = banked recruit gold)", () => {
    expect(scoreLegionPlay()).toBeGreaterThan(700);
  });

  // AUDIT FIX (2026-07-27). Distinct Legion pieces now STACK, so an already
  // outstanding voucher is no longer a reason to sit on the next piece — the
  // hold belongs to the OLD non-stacking reading alone.
  it("plays the next piece anyway while a voucher is outstanding (pieces stack)", () => {
    // Loins (5) already cuts the 6-gold reinforce to 1; Legs still saves that 1.
    const outstanding = scoreLegionPlay([loinsOnGriffin]);
    expect(outstanding, "a second distinct piece adds, so play it").toBeGreaterThan(700);
  });

  it("CONTROL: under the old non-stacking rule an outstanding voucher still holds it back", () => {
    // Only the larger voucher counts, so Legs (4) under Loins (5) saves nothing.
    const heldBack = scoreLegionPlay([loinsOnGriffin], true);
    expect(heldBack).toBeLessThan(700);
    expect(scoreLegionPlay(undefined, true)).toBeGreaterThan(heldBack);
  });
});
