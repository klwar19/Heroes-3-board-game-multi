import { describe, expect, it } from "vitest";
import { processPendingVisit } from "./adventure";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function quietMap(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function mainHeroId(state: GameState): string {
  return Object.values(state.heroes).find((hero) => hero.controllerId === "p1" && hero.kind === "main")!.id;
}

/**
 * Ability Empower token (rulebook token; house rule on bank wins):
 * - Tokens stack; spend one anytime to Empower one Ability currently in HAND.
 * Each claim mutation-checked; CONTROLs prove hand-only and exact decrement.
 */
describe("Ability Empower token", () => {
  it("spends the token to Empower a hand Ability; Expert is then crown-free", () => {
    let state = quietMap("ability-token-spend");
    state.players.p1.hand = ["ability.archery", "stat.attack"];
    state.players.p1.discard = [];
    state.players.p1.empoweredAbilities = [];
    state.players.p1.abilityEmpowerToken = 1;
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.cardId === "ability.archery"
    );
    expect(offer, "token spend offered for Archery in hand").toBeTruthy();

    // CONTROL: Statistics / non-abilities are never offered.
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.cardId === "stat.attack"
      )
    ).toBe(false);

    state = applyOk(state, offer!.action);
    expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);
    expect(state.players.p1.empoweredAbilities).toContain("ability.archery");
    expect(state.eventLog.some((e) => e.type === "ABILITY_EMPOWER_TOKEN_SPENT")).toBe(true);
    expect(state.eventLog.some((e) => e.type === "ABILITY_EMPOWERED")).toBe(true);
  });

  it("CONTROL: token cannot Empower an Ability that is only in discard (hand only)", () => {
    const state = quietMap("ability-token-hand-only");
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = ["ability.archery"];
    state.players.p1.empoweredAbilities = [];
    state.players.p1.abilityEmpowerToken = 1;

    const offers = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "USE_ABILITY_EMPOWER_TOKEN"
    );
    expect(offers, "no token spend when the Ability is not in hand").toHaveLength(0);

    const forced = applyAction(state, {
      type: "USE_ABILITY_EMPOWER_TOKEN",
      playerId: "p1",
      cardId: "ability.archery"
    });
    expect(forced.errors.length, "forged spend of a discard Ability is rejected").toBeGreaterThan(0);
    expect(forced.state.players.p1.abilityEmpowerToken).toBe(1);
    expect(forced.state.players.p1.empoweredAbilities ?? []).not.toContain("ability.archery");
  });

  it("CONTROL: no token → no spend offer; forged spend rejected", () => {
    const state = quietMap("ability-token-none");
    state.players.p1.hand = ["ability.archery"];
    state.players.p1.abilityEmpowerToken = 0;

    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "USE_ABILITY_EMPOWER_TOKEN")
    ).toBe(false);

    const forced = applyAction(state, {
      type: "USE_ABILITY_EMPOWER_TOKEN",
      playerId: "p1",
      cardId: "ability.archery"
    });
    expect(forced.errors.length).toBeGreaterThan(0);
  });

  it("a second bank reward stacks a second token without forcing an immediate Empower", () => {
    let state = quietMap("ability-token-surplus");
    state.players.p1.hand = ["ability.archery", "ability.luck"];
    state.players.p1.empoweredAbilities = [];
    state.players.p1.abilityEmpowerToken = 1;

    // Simulate a bank reward step: process a pending visit with GAIN_ABILITY_EMPOWER_TOKEN.
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId: mainHeroId(state),
      fieldId: Object.keys(state.adventure!.fields)[0],
      steps: [{ type: "GAIN_ABILITY_EMPOWER_TOKEN" }]
    };

    processPendingVisit(state);

    expect(state.players.p1.abilityEmpowerToken).toBe(2);
    expect(state.players.p1.empoweredAbilities).toEqual([]);
    expect(state.adventure!.pendingVisit?.steps.length ?? 0).toBe(0);
    expect(state.eventLog.some((e) => e.type === "ABILITY_EMPOWER_TOKEN_GAINED" && e.total === 2)).toBe(true);

    const pick = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.cardId === "ability.archery"
    );
    expect(pick).toBeTruthy();
    state = applyOk(state, pick!.action);
    expect(state.players.p1.empoweredAbilities).toContain("ability.archery");
    expect(state.players.p1.abilityEmpowerToken).toBe(1);
  });

  it("stacks a token even when no Ability is currently in hand", () => {
    const state = quietMap("ability-token-surplus-empty");
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = ["ability.archery"];
    state.players.p1.empoweredAbilities = [];
    state.players.p1.abilityEmpowerToken = 1;

    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId: mainHeroId(state),
      fieldId: Object.keys(state.adventure!.fields)[0],
      steps: [{ type: "GAIN_ABILITY_EMPOWER_TOKEN" }]
    };

    processPendingVisit(state);

    expect(state.players.p1.abilityEmpowerToken).toBe(2);
    expect(state.players.p1.empoweredAbilities ?? []).toHaveLength(0);
    // No force menu when nothing in hand can be empowered.
    expect(state.adventure!.pendingVisit?.steps.length ?? 0).toBe(0);
    expect(state.eventLog.some((e) => e.type === "ABILITY_EMPOWER_TOKEN_GAINED" && e.total === 2)).toBe(true);
  });
});
