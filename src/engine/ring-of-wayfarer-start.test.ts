import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero, NEUTRAL_PLAYER_ID } from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

/**
 * Ring of the Wayfarer's SEPARATE paralysis effect ("At start of Combat with
 * Neutral Units put a Paralysis token on any unit except Azure") must fire as a
 * real start-of-combat decision — BEFORE any unit acts — not as a mid-round hand
 * play a faster guard could pre-empt. This end-to-end test drives a real Neutral
 * guard fight and fails if the finalizeCombatStart wiring is removed.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Sets up a real Neutral guard fight for p1, with `hand` in the player's hand,
 *  driven to the moment right after placement (finalizeCombatStart). */
function neutralGuardFightAfterPlacement(seed: string, hand: string[]): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state =
    state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;

  const hero = getMainHero(state, "p1")!;
  hero.level = 1; // below the field difficulty, so it is a real fight (no Quick Combat)
  hero.spaceId = "guard-field";
  state.players.p1.hand = [...hand];
  state.adventure!.fields["guard-field"] = {
    spaceId: "guard-field",
    tileInstanceId: "t",
    slot: 0,
    location: "empty_field",
    // Difficulty 3 draws bronze/silver guards (non-Azure) — valid paralysis
    // targets. (Difficulty 7 would draw Azure guards, which are excluded.)
    difficulty: 3,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };

  startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  state = apply(state, place!.action);
  return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

describe("Ring of the Wayfarer — paralyse a Neutral unit AT START of combat", () => {
  it("opens the paralysis decision right after placement — before any unit acts — and paralyses the chosen guard", () => {
    const state = neutralGuardFightAfterPlacement("wayfarer-e2e-paralyse", ["artifact.ring_of_the_wayfarer"]);

    // The decision is open before the first activation.
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("wayfarer-paralysis");
    expect(state.combat?.activeUnitId ?? null, "no unit has activated yet").toBeNull();
    if (choice?.type !== "OPTION_CHOICE" || !choice.wayfarerParalysis) {
      return;
    }

    // A Neutral guard is among the offered targets (paralyse the enemy at start).
    const offered = choice.wayfarerParalysis.unitIds;
    const guardId = offered.find((id) => state.combat!.units[id]?.controllerId === NEUTRAL_PLAYER_ID);
    expect(guardId, "a Neutral guard is offered as a paralysis target").toBeTruthy();
    const guardIndex = offered.indexOf(guardId!);

    const after = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: guardIndex });

    // The guard carries a Paralysis token, the Ring is spent, and the combat
    // proceeded past the decision (the wayfarer choice is no longer open).
    expect((after.combat!.units[guardId!].tokens ?? []).some((token) => token.kind === "paralysis")).toBe(true);
    expect(after.players.p1.hand).not.toContain("artifact.ring_of_the_wayfarer");
    expect(after.players.p1.discard).toContain("artifact.ring_of_the_wayfarer");
    expect(
      after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "wayfarer-paralysis"
    ).toBeFalsy();
  });

  it("CONTROL: with no Ring in hand, no paralysis decision opens at combat start", () => {
    const state = neutralGuardFightAfterPlacement("wayfarer-e2e-control", []);
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "wayfarer-paralysis"
    ).toBeFalsy();
    // Combat began (guards revealed, units in play) — the Ring never gated it.
    expect(Object.keys(state.combat?.units ?? {}).length).toBeGreaterThan(0);
    expect(state.combat?.outcome ?? null).toBeNull();
  });
});
