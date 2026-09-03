import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { getMainHero, placeCreatureBank } from "./adventure";
import { bankAutoCombatSafeUnit, startNeutralEncounter } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function startImpCache(seed: string, enabled = true): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "easy",
    rollFirstPlayer: false,
    houseRules: { "polish-bank-auto-combat": enabled }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.army = [
    { id: "gorgons", unitDefId: "fortress.gorgons", side: "few" }
  ];
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = "bank-field";
  state.adventure!.fields["bank-field"] = {
    spaceId: "bank-field",
    tileInstanceId: "test-tile",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  placeCreatureBank(state, "bank-field", "imp_cache");
  startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
  const placement = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLACE_COMBAT_UNIT"
  );
  state = applyOk(state, placement!.action);
  return applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

function findOpening(predicate: (state: GameState) => boolean, enabled = true): GameState {
  for (let index = 0; index < 32; index += 1) {
    const state = startImpCache(`bank-auto-${enabled}-${index}`, enabled);
    if (predicate(state)) return state;
  }
  throw new Error("Expected a deterministic Imp Cache opening in the sampled seeds.");
}

describe("Polish Banks auto combat", () => {
  it("offers only after Stack rolls when a deployed unit is mathematically immune", () => {
    const state = findOpening(
      (candidate) =>
        candidate.pendingChoice?.type === "OPTION_CHOICE" &&
        candidate.pendingChoice.context === "polish-bank-auto-combat"
    );
    const safe = bankAutoCombatSafeUnit(state);
    expect(safe?.unitDefId).toBe("fortress.gorgons");
    expect(safe?.defense).toBe(2);
    const guards = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "neutrals");
    expect(guards).toHaveLength(4);
    expect(guards.some((guard) => guard.stackToken)).toBe(true);
    expect(Math.max(...guards.map((guard) => guard.attack + 1))).toBeLessThanOrEqual(2);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.options.map((o) => o.label) : [])
      .toEqual(["Use Auto Combat: win the bank", "Fight the bank normally"]);
  });

  it("withholds the proposal when a rolled +1 Attack Stack can hurt that unit", () => {
    const state = findOpening((candidate) => {
      const guards = Object.values(candidate.combat!.units).filter((unit) => unit.controllerId === "neutrals");
      return guards.some((guard) => guard.stackToken === "attack");
    });
    expect(bankAutoCombatSafeUnit(state)).toBeNull();
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(false);
  });

  it("accepting records a normal bank victory; declining starts the fight", () => {
    const offered = findOpening(
      (candidate) =>
        candidate.pendingChoice?.type === "OPTION_CHOICE" &&
        candidate.pendingChoice.context === "polish-bank-auto-combat"
    );
    const choice = offered.pendingChoice!;
    const won = applyOk(offered, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
    expect(won.combat?.outcome).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals",
      reason: "all-enemy-units-defeated"
    });
    expect(won.eventLog.some((event) => event.type === "COMBAT_ENDED")).toBe(true);

    const declinedOpening = findOpening(
      (candidate) =>
        candidate.pendingChoice?.type === "OPTION_CHOICE" &&
        candidate.pendingChoice.context === "polish-bank-auto-combat"
    );
    const declined = applyOk(declinedOpening, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: declinedOpening.pendingChoice!.id,
      optionIndex: 1
    });
    expect(declined.combat?.outcome ?? null).toBeNull();
    expect(declined.pendingChoice?.type === "OPTION_CHOICE" && declined.pendingChoice.context === "polish-bank-auto-combat")
      .toBe(false);
    expect(declined.phase).toBe("combat");
  });

  it("is completely inert when the house rule is off", () => {
    const state = findOpening(() => true, false);
    expect(bankAutoCombatSafeUnit(state)).toBeNull();
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(false);
  });
});
