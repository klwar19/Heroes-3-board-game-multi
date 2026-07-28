import { describe, expect, it } from "vitest";
import type {
  GameAction,
  LegalAction,
  PlayerVisibleState,
} from "../state";
import { scoreCardAction } from "./card-policy";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";

/**
 * Start-of-turn voluntary mulligan (withRefreshDiscards) and the after-combat
 * Necromancy window preference. Each claim is mutation-checked: removing the
 * voluntary-cycle loop, the Necropolis hunt threshold, the supply guard, or
 * the NECROMANCY_REINFORCE window score in card-policy fails a named test.
 */

type PlayerOverrides = {
  factionId?: string;
  hand?: string[];
  needsHandRefresh?: boolean;
  handLimit?: number;
  deckCount?: number;
  discard?: string[];
  deckDrawnAbilityCardIds?: string[];
};

function makeState(
  players: Record<string, PlayerOverrides>,
  extras: { pendingNecromancyFor?: string } = {},
): PlayerVisibleState {
  const playerMap: Record<string, unknown> = {};
  for (const [id, over] of Object.entries(players)) {
    playerMap[id] = {
      id,
      factionId: over.factionId,
      hand: over.hand ?? [],
      discard: over.discard ?? [],
      deckCount: over.deckCount ?? 0,
      deckDrawnAbilityCardIds: over.deckDrawnAbilityCardIds,
      needsHandRefresh: over.needsHandRefresh,
      limits: { hand: over.handLimit ?? 5 },
      permanents: [],
      resources: { gold: 10, buildingMaterials: 2, valuables: 1 },
      army: [],
    };
  }
  return {
    seed: "mulligan-test",
    round: 2,
    eventCounter: 0,
    combat: null,
    pendingChoice: null,
    players: playerMap,
    towns: {},
    adventure: {
      fields: {},
      ...(extras.pendingNecromancyFor
        ? { pendingNecromancy: { playerId: extras.pendingNecromancyFor } }
        : {}),
    },
  } as unknown as PlayerVisibleState;
}

function observe(
  state: PlayerVisibleState,
  legalActions: LegalAction[] = [],
  playerId = "p2",
): ComputerObservation {
  return { playerId, state, legalActions };
}

const refreshOffer: LegalAction = {
  label: "refresh",
  action: {
    type: "REFRESH_HAND",
    playerId: "p2",
    discardCardIds: [],
  } as GameAction,
};

function refreshDiscards(
  self: PlayerOverrides,
  extras: { pendingNecromancyFor?: string } = {},
): string[] {
  const state = makeState(
    { p2: { needsHandRefresh: true, ...self }, p1: { factionId: "tower" } },
    extras,
  );
  const decision = chooseComputerAction(observe(state, [refreshOffer]));
  expect(decision?.action.type).toBe("REFRESH_HAND");
  return (decision?.action as { discardCardIds: string[] }).discardCardIds;
}

describe("voluntary mulligan — every seat cycles true junk", () => {
  // ability.eagle_eye is D-tier (keep 10+28-12 = 26 < 30); the S-tier relic
  // and spell stay far above the junk threshold.
  const hand = [
    "ability.eagle_eye",
    "artifact.dragon_scale_armor",
    "spell.lightning_bolt",
  ];

  it("discards the sub-threshold junk card even with the hand under the limit", () => {
    const discards = refreshDiscards({
      factionId: "castle",
      hand,
      deckCount: 6,
    });
    expect(discards).toEqual(["ability.eagle_eye"]);
  });

  it("CONTROL: with no replacement supply (empty deck + discard) nothing is cycled", () => {
    const discards = refreshDiscards({
      factionId: "castle",
      hand,
      deckCount: 0,
      discard: [],
    });
    expect(discards).toEqual([]);
  });

  it("CONTROL: a mid-value card (stat.attack, keep 32) is NOT junk for a non-hunting seat", () => {
    const discards = refreshDiscards({
      factionId: "castle",
      hand: ["stat.attack", "artifact.dragon_scale_armor"],
      deckCount: 6,
    });
    expect(discards).toEqual([]);
  });
});

describe("voluntary mulligan — Necropolis digs for its Necromancy engine", () => {
  it("cycles mid-value cards while no playable Necromancy is held", () => {
    const discards = refreshDiscards({
      factionId: "necropolis",
      hand: ["stat.attack", "artifact.dragon_scale_armor"],
      deckCount: 6,
    });
    expect(discards).toEqual(["stat.attack"]);
  });

  it("CONTROL: holding the Necromancy ability ends the hunt (and is never discarded)", () => {
    const discards = refreshDiscards({
      factionId: "necropolis",
      hand: ["stat.attack", "ability.necromancy", "artifact.dragon_scale_armor"],
      deckCount: 6,
    });
    expect(discards).toEqual([]);
  });

  it("a shared-Ability-deck Necromancy copy IS playable (Necropolis, wiki p.24) — the hunt ends past it", () => {
    // A Necropolis hero may play a deck-drawn Necromancy, so holding one is the
    // faction engine in hand: the AI stops digging for it (and never discards
    // it). Re-adding the deck-drawn exclusion makes the hunt cycle stat.attack.
    const discards = refreshDiscards({
      factionId: "necropolis",
      hand: ["stat.attack", "ability.necromancy", "artifact.dragon_scale_armor"],
      deckCount: 6,
      deckDrawnAbilityCardIds: ["ability.necromancy"],
    });
    expect(discards).toEqual([]);
  });

  it("a Vidomina specialty counts as the held engine too", () => {
    const discards = refreshDiscards({
      factionId: "necropolis",
      hand: ["stat.attack", "specialty.vidomina.1", "artifact.dragon_scale_armor"],
      deckCount: 6,
    });
    expect(discards).toEqual([]);
  });

  it("caps the voluntary cycle at 3 cards", () => {
    const discards = refreshDiscards({
      factionId: "necropolis",
      hand: [
        "stat.attack",
        "stat.defense",
        "ability.eagle_eye",
        "ability.ballistics",
        "artifact.dragon_scale_armor",
      ],
      deckCount: 8,
    });
    expect(discards).toHaveLength(3);
    expect(discards).not.toContain("artifact.dragon_scale_armor");
  });
});

describe("Necromancy window — playing the card outranks skipping", () => {
  const playNecromancy: GameAction = {
    type: "PLAY_CARD",
    playerId: "p2",
    cardId: "ability.necromancy",
    mode: "basic",
    target: { type: "none" },
  } as GameAction;

  it("scores the play above SKIP_NECROMANCY (1_120) while the window is open", () => {
    const state = makeState(
      { p2: { factionId: "necropolis", hand: ["ability.necromancy"] }, p1: {} },
      { pendingNecromancyFor: "p2" },
    );
    const score = scoreCardAction(observe(state), playNecromancy);
    expect(score?.score ?? 0).toBeGreaterThan(1_120);
  });

  it("CONTROL: outside the window the play keeps its ordinary map-economy score", () => {
    const state = makeState({
      p2: { factionId: "necropolis", hand: ["ability.necromancy"] },
      p1: {},
    });
    const score = scoreCardAction(observe(state), playNecromancy);
    expect(score?.score ?? 0).toBeLessThan(700);
  });

  it("end to end: the AI picks PLAY_CARD over SKIP_NECROMANCY", () => {
    const state = makeState(
      { p2: { factionId: "necropolis", hand: ["ability.necromancy"] }, p1: {} },
      { pendingNecromancyFor: "p2" },
    );
    const legal: LegalAction[] = [
      { label: "skip", action: { type: "SKIP_NECROMANCY", playerId: "p2" } as GameAction },
      { label: "play", action: playNecromancy },
    ];
    const decision = chooseComputerAction(observe(state, legal));
    expect(decision?.action.type).toBe("PLAY_CARD");
  });

  // The atomic window's exit (SKIP_NECROMANCY, "Resolve bonuses and continue")
  // EXPIRES every reinforcement offer the window banked. At the ordinary
  // 820/760 redeem score the AI played its Necromancy card and then scored the
  // Resolve above the redeem — spending the card for nothing after every win.
  const redeemBank: GameAction = {
    type: "REDEEM_REINFORCEMENT_DISCOUNT",
    playerId: "p2",
    discountId: "bank_1",
    armyUnitId: "army_1",
    kind: "reinforce",
  } as GameAction;

  it("redeems the banked offer BEFORE resolving the window (the bank expires on Resolve)", () => {
    const state = makeState(
      { p2: { factionId: "necropolis", hand: [] }, p1: {} },
      { pendingNecromancyFor: "p2" },
    );
    const legal: LegalAction[] = [
      { label: "resolve", action: { type: "SKIP_NECROMANCY", playerId: "p2" } as GameAction },
      { label: "redeem", action: redeemBank },
    ];
    const decision = chooseComputerAction(observe(state, legal));
    expect(
      decision?.action.type,
      "resolving first throws the just-played Necromancy card away",
    ).toBe("REDEEM_REINFORCEMENT_DISCOUNT");
  });

  it("CONTROL: outside the window the redeem keeps its ordinary map score, below the Resolve", () => {
    const state = makeState({
      p2: { factionId: "necropolis", hand: [] },
      p1: {},
    });
    const legal: LegalAction[] = [
      { label: "resolve", action: { type: "SKIP_NECROMANCY", playerId: "p2" } as GameAction },
      { label: "redeem", action: redeemBank },
    ];
    const decision = chooseComputerAction(observe(state, legal));
    expect(decision?.action.type).toBe("SKIP_NECROMANCY");
  });

  it("still plays every held Necromancy card BEFORE redeeming a bank", () => {
    const state = makeState(
      { p2: { factionId: "necropolis", hand: ["ability.necromancy"] }, p1: {} },
      { pendingNecromancyFor: "p2" },
    );
    const legal: LegalAction[] = [
      { label: "redeem", action: redeemBank },
      { label: "play", action: playNecromancy },
    ];
    const decision = chooseComputerAction(observe(state, legal));
    expect(decision?.action.type).toBe("PLAY_CARD");
  });
});
