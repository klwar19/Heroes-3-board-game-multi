import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  type GameState,
} from "./index";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";

function polishState(seed: string): GameState {
  const state = createInitialGameState(seed);
  const adventure = createAdventureGameState({
    seed: `${seed}-rules`,
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules: { "polish-spell-book": true },
  });
  state.adventure = adventure.adventure;
  state.ruleset = "binh";
  state.activePlayerId = "p1";
  state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
  state.players.p1.spellBook = ["spell.magic_arrow"];
  state.players.p1.spellBookUsed = [];
  state.players.p2.hand = [];
  for (const u of Object.values(state.combat!.units)) {
    u.activatedThisRound = false;
    u.movedThisActivation = false;
    u.attackedThisActivation = false;
    u.abilities = [];
  }
  return state;
}

function canCastBook(state: GameState): boolean {
  return getLegalActions(state, "p1").some(
    (l) =>
      l.action.type === "CAST_SPELL" &&
      l.action.fromSpellBook &&
      l.action.cardId === "spell.magic_arrow"
  );
}

describe("Polish Spell Book — cast across successive unit activations", () => {
  it("also blocks a normal hand Magic Arrow after movement", () => {
    const state = createInitialGameState("hand-arrow-pre-move");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    const handArrow = () => getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" && !legal.action.fromSpellBook,
    );
    expect(handArrow()).toBe(true);
    state.combat!.units.unit_p1_griffins.movedThisActivation = true;
    expect(handArrow()).toBe(false);
  });

  it("offers Book cast on first own unit activation AND second", () => {
    const state = polishState("polish-multi-act");
    // First unit
    state.combat!.activeUnitId = "unit_p1_griffins";
    expect(canCastBook(state), "castable on first own unit").toBe(true);

    // Second unit without finishing first (simulate switch) — also own
    state.combat!.activeUnitId = "unit_p1_crusaders";
    expect(canCastBook(state), "castable on second own unit").toBe(true);
  });

  it("blocks combat-timing Book cast while enemy unit is active (CONTROL)", () => {
    const state = polishState("polish-enemy-act");
    state.combat!.activeUnitId = "unit_p2_skeletons";
    expect(canCastBook(state), "not castable on enemy unit without Intelligence").toBe(false);
  });

  it("blocks Magic Arrow after the first own unit moves, then offers it before the next unit moves", () => {
    const state = polishState("polish-after-move");
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.movedThisActivation = true;
    expect(canCastBook(state), "Magic Arrow must precede movement").toBe(false);
    state.combat!.units.unit_p1_griffins.activatedThisRound = true;
    state.combat!.activeUnitId = "unit_p1_crusaders";
    expect(canCastBook(state), "fresh ally has a pre-move cast window").toBe(true);
  });

  it("blocks after the active unit has attacked, then offers again on next unit", () => {
    const state = polishState("polish-after-attack");
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.attackedThisActivation = true;
    expect(canCastBook(state), "blocked after attack on this unit").toBe(false);

    state.combat!.units.unit_p1_griffins.activatedThisRound = true;
    state.combat!.activeUnitId = "unit_p1_crusaders";
    expect(canCastBook(state), "castable on next unit after first finished attacking").toBe(true);
  });

  it("blocks while activation-order pendingChoice is open (activeUnit null)", () => {
    const state = polishState("polish-order-choice");
    state.combat!.activeUnitId = null;
    state.pendingChoice = {
      id: "order",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "pick",
      options: [{ label: "a" }, { label: "b" }],
      context: "combat-activation-order",
      activationOrder: { unitIds: ["unit_p1_griffins", "unit_p1_crusaders"], side: "p1" },
      returnPhase: "combat",
    };
    expect(canCastBook(state), "no cast during order pick").toBe(false);
  });
});
