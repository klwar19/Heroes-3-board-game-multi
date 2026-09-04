import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { hasBallistaChooseTarget } from "./active-effects";
import { startWarMachineRound } from "./permanents";
import type { GameAction, GameState } from "./state";

const FAST = "unit_p2_vampires";
const SLOW = "unit_p2_skeletons";

function setup(hand: string[] = ["ability.artillery"], crowns = 0): GameState {
  const state = createInitialGameState("polish-ballista-timing");
  state.adventure = { houseRules: { "polish-card-balance": true } } as GameState["adventure"];
  state.players.p1.hand = hand;
  state.players.p2.hand = [];
  state.players.p1.permanents = ["war_machine.ballista"];
  state.players.p1.limits.expertUses = crowns;
  for (const unit of Object.values(state.combat!.units)) unit.maxHealth = 100;
  state.combat!.units[SLOW].initiative = 1;
  state.combat!.units[FAST].initiative = 8;
  state.combat!.units.unit_p2_dread_knights.initiative = 7;
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function choose(state: GameState, label: string): GameState {
  const offer = getLegalActions(state, "p1").find((legal) => legal.label.includes(label));
  expect(offer, label).toBeTruthy();
  return apply(state, offer!.action);
}

function target(state: GameState, id = FAST): GameState {
  const offer = getLegalActions(state, "p1").find((legal) =>
    legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === id);
  expect(offer, `target ${id}`).toBeTruthy();
  return apply(state, offer!.action);
}

function play(state: GameState, id: string, optionIndex?: number): GameState {
  const offer = getLegalActions(state, "p1").find((legal) =>
    legal.action.type === "PLAY_CARD" && legal.action.cardId === id &&
    (optionIndex === undefined || legal.action.optionIndex === optionIndex));
  expect(offer, `play ${id}`).toBeTruthy();
  return apply(state, offer!.action);
}

describe("Polish Ballista firing windows", () => {
  it.each([[0, "basic", 2], [1, "expert", 3]] as const)(
    "offers Artillery with %i crowns, aims the %s volley, and keeps aiming next round",
    (crowns, mode, damage) => {
      let state = setup(undefined, crowns);
      startWarMachineRound(state);
      expect(state.combat!.units[SLOW].damage).toBe(0);
      state = choose(state, `(${mode})`);
      state = target(state);
      expect(state.combat!.units[FAST].damage).toBe(damage);
      expect(state.combat!.units[SLOW].damage).toBe(0);
      expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(crowns);
      expect(state.players.p1.ongoingCards?.some((card) => card.cardId === "ability.artillery")).toBe(true);
      state.combat!.activeUnitId = null;
      state = apply(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
      state = target(state, SLOW);
      expect(state.combat!.units[SLOW].damage).toBe(1);
      expect(state.combat!.warMachineRound).toBeNull();
    }
  );

  it("offers again for the next Ballista if Artillery was kept", () => {
    const state = setup();
    state.players.p1.permanents!.push("war_machine.ballista");
    startWarMachineRound(state);
    let next = choose(state, "Fire once");
    expect(next.combat!.units[SLOW].damage).toBe(1);
    expect(next.players.p1.hand).toContain("ability.artillery");
    next = target(choose(next, "(basic)"));
    expect(next.combat!.units[FAST].damage).toBe(2);
    expect(next.combat!.warMachineRound).toBeNull();
  });

  it("keeping Artillery in round 1 offers it again in round 2 and grants ongoing target choice", () => {
    let state = setup();
    startWarMachineRound(state);
    state = choose(state, "Fire once");
    expect(hasBallistaChooseTarget(state, "p1")).toBe(false);
    expect(state.players.p1.hand).toContain("ability.artillery");
    state.combat!.activeUnitId = null;
    state = apply(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(state.combat!.round).toBe(2);
    state = target(choose(state, "(basic)"));
    expect(state.combat!.units[FAST].damage).toBe(2);
    expect(hasBallistaChooseTarget(state, "p1")).toBe(true);
    expect(state.players.p1.ongoingCards?.some((card) => card.cardId === "ability.artillery")).toBe(true);
    state.combat!.activeUnitId = null;
    state = apply(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
    state = target(state);
    expect(state.combat!.units[FAST].damage).toBe(3);
  });

  it("late Artillery in an attack reaction deals one damage without granting aim", () => {
    let state = setup();
    const units = state.combat!.units;
    units.unit_p1_crusaders.position = 14;
    units[SLOW].position = 13;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = SLOW;
    state = apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: SLOW, defenderId: "unit_p1_crusaders" });
    const reaction = getLegalActions(state, "p1").find((legal) =>
      legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.artillery");
    expect(reaction).toBeTruthy();
    const previousDamage = state.combat!.units[SLOW].damage;
    state = apply(state, reaction!.action);
    expect(state.eventLog.some((event) => event.type === "DAMAGE_ASSIGNED" &&
      event.source.type === "card" && event.source.cardId === "ability.artillery" && event.amount === 1)).toBe(true);
    expect(state.combat!.units[SLOW].damage).toBeGreaterThan(previousDamage);
    expect(hasBallistaChooseTarget(state, "p1")).toBe(false);
    expect(state.players.p1.discard).toContain("ability.artillery");
  });

  it("a specialty's nested firing prompt resumes the parked attack after aiming", () => {
    let state = setup(["specialty.torosar.1", "ability.artillery"]);
    state.combat!.units.unit_p1_crusaders.position = 14;
    state.combat!.units[SLOW].position = 13;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = SLOW;
    state = apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: SLOW, defenderId: "unit_p1_crusaders" });
    state = play(state, "specialty.torosar.1", 1);
    expect(state.phase).toBe("choice");
    expect(state.reactionWindow).toBeTruthy();
    state = target(choose(state, "(basic)"));
    expect(state.combat!.units[FAST].damage).toBe(2);
    expect(state.stack).toEqual([]);
    expect(state.reactionWindow).toBeNull();
    expect(state.phase).toBe("combat");
  });

  it.each(["specialty.torosar.1", "specialty.tarnum_castle.1", "specialty.gerwulf.1"])(
    "%s uses ongoing Artillery targeting for its activation", (id) => {
      let state = setup();
      startWarMachineRound(state);
      state = target(choose(state, "(basic)"));
      state.players.p1.hand = [id];
      state = target(play(state, id, 1));
      expect(state.combat!.units[FAST].damage).toBe(3);
      expect(state.combat!.units[SLOW].damage).toBe(0);
    }
  );

  it("offers Artillery when a specialty activates a Ballista mid-fight", () => {
    let state = setup(["specialty.torosar.1", "ability.artillery"]);
    state = play(state, "specialty.torosar.1", 1);
    expect(state.combat!.units[SLOW].damage).toBe(0);
    state = target(choose(state, "(basic)"));
    expect(state.combat!.units[FAST].damage).toBe(2);
  });

  it.each(["specialty.tarnum_castle.4", "specialty.torosar.6"])(
    "can play %s before opening Artillery, then aim every queued Ballista", (id) => {
      let state = setup([id, "ability.artillery"]);
      startWarMachineRound(state);
      state = play(state, id);
      expect(state.combat!.units[SLOW].damage).toBe(0);
      state = target(choose(state, "(basic)"));
      while (state.combat!.warMachineRound) state = target(state);
      expect(state.combat!.units[FAST].damage).toBe(id.includes("torosar") ? 4 : 3);
      expect(state.combat!.units[SLOW].damage).toBe(0);
      expect(state.players.p1.ongoingCards?.some((card) => card.cardId === id)).toBe(true);
    }
  );

  it("Gerwulf may establish aim before the opening shot even without Artillery", () => {
    let state = setup(["specialty.gerwulf.6"]);
    startWarMachineRound(state);
    state = play(state, "specialty.gerwulf.6", 0);
    state = target(state);
    expect(state.combat!.units[FAST].damage).toBe(1);
    expect(state.combat!.units[SLOW].damage).toBe(0);
  });

  it("discarding one of two Ballistas before firing cancels exactly its queued shot", () => {
    let state = setup(["specialty.gerwulf.6", "ability.artillery"]);
    state.players.p1.permanents!.push("war_machine.ballista");
    startWarMachineRound(state);
    const discard = getLegalActions(state, "p1").find((legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gerwulf.6" &&
      legal.action.optionIndex === 1 && legal.action.target?.type === "unit" && legal.action.target.unitId === FAST);
    expect(discard).toBeTruthy();
    state = apply(state, discard!.action);
    expect(state.combat!.units[FAST].damage).toBe(3);
    expect(state.combat!.warMachineRound?.pending).toHaveLength(1);
    state = target(choose(state, "(basic)"));
    expect(state.combat!.units[FAST].damage).toBe(5);
    expect(state.combat!.warMachineRound).toBeNull();
  });

  /**
   * The "play a Ballista specialty first, or fire now" prompt existed whenever
   * the hand held ANY `ballista`-tagged specialty, but the offer list only shows
   * a CHOOSE_ONE specialty with a `combatAnytime` option (or, inside the
   * combat-start window, any option). Torosar IV is a bare map-timed
   * BALLISTA_SPECIALTY, so the prompt opened every round with ONE button and no
   * Skip — a dead click that could not be answered with the card it was about.
   */
  it("does NOT open the specialty prompt for a map-only Ballista specialty (Torosar IV)", () => {
    const state = setup(["specialty.torosar.4"]);
    startWarMachineRound(state);
    expect(state.pendingChoice, "no prompt for a card this window cannot play").toBeNull();
    // The shot resolved straight away at the slowest enemy.
    expect(state.combat!.units[SLOW].damage).toBe(1);
    expect(state.combat!.warMachineRound).toBeNull();
    expect(state.players.p1.hand).toContain("specialty.torosar.4");
  });

  it("CONTROL: a combatAnytime Ballista specialty (Gerwulf VI) still opens the prompt", () => {
    const state = setup(["specialty.gerwulf.6"]);
    startWarMachineRound(state);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.combat!.units[SLOW].damage).toBe(0);
    const specialtyPlay = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gerwulf.6");
    expect(specialtyPlay, "the prompt exists so this card can be played into it").toBeTruthy();
  });

  it("a temporary Ballista alone can receive Artillery's ongoing aim", () => {
    let state = setup(["specialty.torosar.6", "ability.artillery"]);
    state.players.p1.permanents = [];
    state = play(state, "specialty.torosar.6");
    state = target(choose(state, "(basic)"));
    expect(state.combat!.units[FAST].damage).toBe(2);
    expect(hasBallistaChooseTarget(state, "p1")).toBe(true);
  });
});
