import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, createAdventureGameState, getLegalActions } from "./index";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";
import { drawCardsForPlayer } from "./decks";
import type { GameAction, GameState } from "./state";

const spell = "spell.bloodlust";
const scales = "artifact.scales_of_the_greater_basilisk";
const mysticism = "ability.mysticism";
function act(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, JSON.stringify(action)).toEqual([]);
  return result.state;
}
function settle(state: GameState): GameState {
  for (let i = 0; state.reactionWindow && i < 20; i++) {
    state = act(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
  }
  expect(state.reactionWindow).toBeNull();
  return state;
}
function react(state: GameState, cardId: string, mode: "basic" | "expert" = "basic", extra = {}): GameState {
  return act(state, { type: "PLAY_REACTION", playerId: "p1", cardId, mode, ...extra });
}
function attack(hand: string[], configure?: (state: GameState) => void): GameState {
  let state = createInitialGameState("mysticism-regression");
  state.players.p1.hand = hand;
  state.players.p1.deck = ["stat.power"];
  state.players.p1.discard = [];
  state.players.p2.hand = [];
  state.combat!.units.unit_p2_vampires.maxHealth = 100;
  state.combat!.dice.scriptedRolls = [0, 0, 0];
  configure?.(state);
  state = act(state, { type: "MOVE_UNIT", playerId: "p1", unitId: "unit_p1_griffins", destination: 10 });
  return act(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_vampires" });
}
function bloodlustSequence(mode: "basic" | "expert", playDrawn: boolean, batch: boolean): GameState {
  let state = attack([spell, scales, mysticism, "stat.attack"]);
  if (batch) {
    state = act(state, { type: "PLAY_REACTIONS", playerId: "p1", plays: [
      { cardId: spell, mode: "basic" }, { cardId: scales, optionIndex: 1, mode: "basic" },
    ] });
  } else {
    state = react(state, spell);
    state = react(state, scales, "basic", { optionIndex: 1 });
  }
  expect(state.players.p1.hand).toContain("stat.power");
  expect(state.players.p1.hand).not.toContain(scales);
  if (playDrawn) state = react(state, "stat.power");
  state = react(state, mysticism, mode);
  expect(state.players.p1.hand).not.toContain(spell);
  expect(state.players.p1.hand).not.toContain(scales);
  return settle(state);
}
function castSetup(hand: string[], enemyHand: string[] = []): GameState {
  let state = createInitialGameState("mysticism-cast");
  state.players.p1.hand = ["spell.magic_arrow", ...hand];
  state.players.p1.deck = [];
  state.players.p1.discard = [];
  state.players.p1.limits.expertUses = 8;
  state.players.p2.hand = enemyHand;
  state.combat!.units.unit_p2_skeletons.maxHealth = 100;
  return act(state, { type: "CAST_SPELL", playerId: "p1", cardId: "spell.magic_arrow", target: { type: "unit", unitId: "unit_p2_skeletons" } });
}
function chooseLabel(state: GameState, text: RegExp): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type).toBe("OPTION_CHOICE");
  if (choice?.type !== "OPTION_CHOICE") throw new Error("missing choice");
  const optionIndex = choice.options.findIndex((option) => text.test(option.label));
  expect(optionIndex, choice.options.map((option) => option.label).join("\n")).toBeGreaterThanOrEqual(0);
  return act(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
}

describe("Mysticism full recall regression", () => {
  it("recorded wkz495 order: Bloodlust, expert Mysticism, Basilisk, draw Power, pass", () => {
    let state = attack([spell, scales, mysticism, "stat.attack"]);
    state = react(state, spell);
    state = react(state, mysticism, "expert");
    state = react(state, scales, "basic", { optionIndex: 1 });
    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.players.p1.discard).toContain(scales);
    state = settle(state);
    expect(state.players.p1.hand).toEqual(expect.arrayContaining([spell, scales, "stat.power"]));
    expect(state.players.p1.hand.filter((id) => id === "stat.power")).toHaveLength(1);
    expect(state.players.p1.discard).toContain(mysticism);
    expect(state.players.p1.discard).not.toContain(scales);
  });
  it.each([false, true])("Bloodlust + Basilisk draw + drawn Power + expert, batch=%s", (batch) => {
    const basic = bloodlustSequence("basic", true, batch);
    const expert = bloodlustSequence("expert", true, batch);
    expect(expert.players.p1.hand).toEqual(expect.arrayContaining([spell, scales, "stat.power"]));
    expect(expert.players.p1.discard).toContain(mysticism);
    expect(expert.players.p1.discard).not.toContain(scales);
    expect(expert.players.p1.discard).not.toContain("stat.power");
    expect(basic.players.p1.hand).toContain(spell);
    expect(basic.players.p1.hand).not.toContain(scales);
    expect(basic.players.p1.hand).not.toContain("stat.power");
    expect(expert.combat!.units.unit_p2_vampires.damage).toBe(basic.combat!.units.unit_p2_vampires.damage);
  });
  it("a drawn but unplayed Power stays in hand exactly once", () => {
    const state = bloodlustSequence("expert", false, false);
    expect(state.players.p1.hand.filter((id) => id === "stat.power")).toHaveLength(1);
    expect(state.players.p1.hand).toContain(scales);
  });
  it("a draw with an empty deck cannot reshuffle promised support before attack completion", () => {
    let state = attack([spell, scales, mysticism, "stat.attack"]);
    state = react(state, spell);
    state = react(state, scales, "basic", { optionIndex: 1 });
    state = react(state, mysticism, "expert");
    state.players.p1.deck = [];
    state.players.p1.discard = state.players.p1.discard.filter((id) => id !== mysticism);
    drawCardsForPlayer(state, "p1", 10);
    expect(state.players.p1.discard).toContain(scales);
    expect(state.players.p1.discard).toContain(spell);
    expect(state.players.p1.hand).not.toContain(scales);
    state = settle(state);
    expect(state.players.p1.hand).toEqual(expect.arrayContaining([spell, scales]));
  });
  it("instant recall excludes the opponent's same-id card in your older discard", () => {
    let state = attack([spell, mysticism, "stat.attack"]);
    state.players.p1.discard = ["stat.defense"];
    state.players.p2.hand = ["stat.defense"];
    state = react(state, spell);
    state = act(state, { type: "PASS_REACTION", playerId: "p1" });
    state = act(state, { type: "PLAY_REACTION", playerId: "p2", cardId: "stat.defense", mode: "basic" });
    if (state.reactionWindow?.priorityPlayerId === "p2") state = act(state, { type: "PASS_REACTION", playerId: "p2" });
    state = settle(react(state, mysticism, "expert"));
    expect(state.players.p1.hand).not.toContain("stat.defense");
    expect(state.players.p1.discard).toContain("stat.defense");
    expect(state.players.p1.hand).toContain(spell);
  });
  it.each([false, true])("cast returns Tome and duplicate Power, cancelled=%s", (cancelled) => {
    let state = castSetup([mysticism, "stat.power", "stat.power", "artifact.tome_of_air"], cancelled ? ["ability.resistance"] : []);
    state = react(state, "stat.power");
    state = react(state, "stat.power");
    state = react(state, "artifact.tome_of_air", "basic", { optionIndex: 1 });
    state = react(state, mysticism, "expert");
    if (cancelled) {
      if (state.reactionWindow?.priorityPlayerId === "p1") state = act(state, { type: "PASS_REACTION", playerId: "p1" });
      state = act(state, { type: "PLAY_REACTION", playerId: "p2", cardId: "ability.resistance", mode: "expert" });
    }
    state = settle(state);
    expect(state.players.p1.hand).toEqual(expect.arrayContaining(["spell.magic_arrow", "artifact.tome_of_air"]));
    expect(state.players.p1.hand.filter((id) => id === "stat.power")).toHaveLength(2);
    expect(state.players.p1.discard).toEqual([mysticism]);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(cancelled ? 0 : 3);
  });
  it.each(["hand", "school", "book"] as const)("Sorrow expert returns paid fuel: %s", (source) => {
    let state = createInitialGameState("mysticism-sorrow");
    state.players.p1.hand = ["spell.sorrow", mysticism, ...(source === "hand" ? ["stat.power", "stat.power"] : source === "book" ? ["stat.power"] : [])];
    state.players.p1.limits.expertUses = 8;
    state.players.p2.hand = [];
    if (source === "school") state.players.p1.permanents = ["ability.earth_magic"];
    if (source === "book") {
      state.adventure = createAdventureGameState({ seed: "old-book", spellBook: true, houseRules: { "polish-spell-book": false } }).adventure;
      state.players.p1.spellBook = ["spell.magic_arrow"];
    }
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(state.combat!.units)) unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_vampires";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.initiative = 0;
    state = act(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    if (source === "school") {
      const expert = getLegalActions(state, "p1").find((legal) => legal.action.type === "USE_SCHOOL_PERMANENT_EXPERT");
      expect(expert).toBeTruthy();
      state = act(state, expert!.action);
    }
    state = react(state, "spell.sorrow", "basic", { optionIndex: 1, costCardIds: source === "hand" ? ["stat.power", "stat.power"] : source === "book" ? ["stat.power", "spell.magic_arrow"] : [] });
    state = react(state, mysticism, "expert");
    expect(state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
    expect(state.players.p1.hand).toContain("spell.sorrow");
    if (source === "school") expect(state.players.p1.hand).toContain("ability.earth_magic");
    if (source === "hand") expect(state.players.p1.hand.filter((id) => id === "stat.power")).toHaveLength(2);
    if (source === "book") {
      expect(state.players.p1.hand).toContain("stat.power");
      expect(state.players.p1.hand).not.toContain("spell.magic_arrow");
      expect(state.players.p1.spellBook).toContain("spell.magic_arrow");
    }
  });
  it("Polish instant recall returns late fuel plus the enabler, and refreshes Bloodlust", () => {
    let state = attack([CAST_A_SPELL_CARD_ID, scales, mysticism, "stat.attack"], (initial) => {
      initial.adventure = createAdventureGameState({ seed: "polish-instant", houseRules: { "polish-spell-book": true } }).adventure;
      initial.players.p1.spellBook = [spell];
    });
    state = react(state, spell, "basic", { fromSpellBook: true, castEnablerCardId: CAST_A_SPELL_CARD_ID });
    state = react(state, mysticism, "expert");
    state = settle(react(state, scales, "basic", { optionIndex: 1 }));
    expect(state.players.p1.spellBook).toContain(spell);
    expect(state.players.p1.hand).not.toContain(spell);
    expect(state.players.p1.hand).toEqual(expect.arrayContaining([CAST_A_SPELL_CARD_ID, scales]));
    expect(state.players.p1.hand.filter((id) => id === CAST_A_SPELL_CARD_ID)).toHaveLength(1);
  });
  it("Power drawn by late Basilisk and then spent is also returned", () => {
    let state = attack([spell, scales, mysticism, "stat.attack"]);
    state = react(state, spell);
    state = react(state, mysticism, "expert");
    state = react(state, scales, "basic", { optionIndex: 1 });
    state = settle(react(state, "stat.power"));
    expect(state.players.p1.hand).toEqual(expect.arrayContaining([spell, scales, "stat.power"]));
    expect(state.players.p1.hand.filter((id) => id === "stat.power")).toHaveLength(1);
  });
  it("later Knowledge cannot downgrade expert Mysticism or return either recall card", () => {
    let state = castSetup([mysticism, "stat.knowledge", "stat.power"]);
    state = react(state, "stat.power");
    state = react(state, mysticism, "expert");
    state = settle(react(state, "stat.knowledge"));
    expect(state.players.p1.hand).toEqual(expect.arrayContaining(["spell.magic_arrow", "stat.power"]));
    expect(state.players.p1.hand).not.toContain(mysticism);
    expect(state.players.p1.hand).not.toContain("stat.knowledge");
  });
  it.each(["basic", "expert"] as const)("paid Magic Mirror returns fuel only at expert: %s", (mode) => {
    let state = createInitialGameState("mysticism-mirror");
    state.players.p1.hand = ["spell.magic_mirror", "stat.power", mysticism];
    state.players.p2.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state = act(state, { type: "CAST_SPELL", playerId: "p2", cardId: "spell.magic_arrow", target: { type: "unit", unitId: "unit_p1_griffins" } });
    state = react(state, "spell.magic_mirror", "basic", { optionIndex: 1, costCardIds: ["stat.power"] });
    const choice = state.pendingChoice!;
    state = act(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: "unit_p2_vampires" });
    state = settle(react(state, mysticism, mode));
    expect(state.players.p1.hand).toContain("spell.magic_mirror");
    expect(state.players.p1.hand.includes("stat.power")).toBe(mode === "expert");
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
  it.each([false, true])("map returns Power and Tome with Knowledge also held, Polish Book=%s", (polish) => {
    let state = createAdventureGameState({ seed: "mysticism-map", difficulty: "normal", rollFirstPlayer: false, houseRules: { "polish-spell-book": polish } });
    state = act(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state.players.p1.hand = [polish ? CAST_A_SPELL_CARD_ID : "spell.view_air", "stat.knowledge", mysticism, "stat.power", "artifact.tome_of_air"];
    state.players.p1.limits.expertUses = 8;
    state.players.p1.spellBook = polish ? ["spell.view_air"] : [];
    const cast = getLegalActions(state, "p1").find((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air");
    expect(cast).toBeTruthy();
    state = act(state, cast!.action);
    state = chooseLabel(state, /Power.*\+1|\+1.*Power/);
    state = chooseLabel(state, /Tome of Air/);
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "map-spell-boost") state = chooseLabel(state, /Commit Power and cast/);
    if (!state.pendingChoice) {
      const next = getLegalActions(state, "p1").find((legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Mysticism expert/.test(legal.label));
      expect(next, JSON.stringify(getLegalActions(state, "p1"))).toBeTruthy();
      state = act(state, next!.action);
    } else {
      state = chooseLabel(state, /Mysticism expert/);
    }
    expect(state.players.p1.hand).toEqual(expect.arrayContaining(["stat.power", "artifact.tome_of_air", "stat.knowledge"]));
    expect(state.players.p1.hand).not.toContain(mysticism);
    expect(polish ? state.players.p1.spellBook : state.players.p1.hand).toContain("spell.view_air");
  });
});
