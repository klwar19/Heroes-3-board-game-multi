import { describe, expect, it } from "vitest";
import { processPendingVisit } from "./adventure";
import { sellScrollSpell, SCROLL_SPELL_SELL_GOLD } from "./adventure-reducer";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  findEvent,
  getLegalActions
} from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  while (current.reactionWindow) {
    const playerId = current.reactionWindow.priorityPlayerId;
    current = applyOk(current, { type: "PASS_REACTION", playerId });
  }
  return current;
}

/** Combat sandbox with a Spell Scroll holding two Magic Arrows for p1. */
function scrollCombatState(spells: string[] = ["spell.magic_arrow", "spell.magic_arrow"]): GameState {
  const state = createInitialGameState();
  state.players.p1.hand = [];
  state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: [...spells] }];
  state.activePlayerId = "p1";
  if (state.combat) {
    state.combat.activeUnitId = "unit_p1_griffins";
  }
  return state;
}

describe("Spell Scroll — acquisition", () => {
  it("takes a scroll and draws two spells (Basic then Expert) into it", () => {
    let state = createAdventureGameState({
      seed: "scroll-seed",
      difficulty: "normal",
      ruleset: "binh",
      rollFirstPlayer: false
    });
    const heroId = "hero_p1";
    const fieldId = state.heroes[heroId].spaceId ?? "";

    const basicBefore = state.decks.spells.drawPile.length;
    const expertBefore = state.decks["spells-expert"].drawPile.length;

    state.adventure!.pendingVisit = {
      heroId,
      playerId: "p1",
      fieldId,
      steps: [{ type: "SPELL_SCROLL", remaining: 2 }]
    };
    processPendingVisit(state);

    // The scroll exists immediately; the first deck choice is waiting.
    expect(state.players.p1.scrolls).toHaveLength(1);
    expect(state.players.p1.scrolls![0].spellCardIds).toHaveLength(0);
    expect(state.adventure!.pendingVisit?.steps[0].type).toBe("CHOOSE_ONE");

    // First spell from the Basic Magic deck (option 0), second from Expert (1).
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.scrolls![0].spellCardIds).toHaveLength(1);

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });

    const scroll = state.players.p1.scrolls![0];
    expect(scroll.spellCardIds).toHaveLength(2);
    expect(state.decks.spells.drawPile.length).toBe(basicBefore - 1);
    expect(state.decks["spells-expert"].drawPile.length).toBe(expertBefore - 1);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(findEvent(state, "SPELL_SCROLL_GAINED")).toBeTruthy();
  });
});

const TARGET = "unit_p2_vampires";

/** The scroll cast aimed at a specific enemy unit. */
function scrollCastAt(state: GameState, unitId: string) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.fromScroll === "scroll_1" &&
      legal.action.target.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

describe("Spell Scroll — casting in combat", () => {
  it("offers the scroll spell as a cast and consumes it (gone, not discarded)", () => {
    let state = scrollCombatState();

    const cast = scrollCastAt(state, TARGET);
    expect(cast, "scroll cast should be a legal action").toBeTruthy();

    state = applyOk(state, cast!.action);
    state = passAllReactions(state);

    // Power 0 → 1 damage; the spell left the scroll for good (never discard).
    expect(state.combat!.units[TARGET].damage).toBe(1);
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(state.players.p1.scrolls![0].spellCardIds).toEqual(["spell.magic_arrow"]);
    expect(state.players.p1.discard).not.toContain("spell.magic_arrow");
    expect(state.players.p1.removed).toContain("spell.magic_arrow");

    const resolved = findEvent(state, "SPELL_CAST_RESOLVED");
    expect(resolved && resolved.type === "SPELL_CAST_RESOLVED" ? resolved.power : -1).toBe(0);
  });

  it("removes the whole scroll once both spells are used", () => {
    let state = scrollCombatState();

    for (let cast = 0; cast < 2; cast += 1) {
      // A fresh combat round resets the one-spell-per-round limit.
      state.players.p1.combatStats.spellsCastThisRound = 0;
      const action = scrollCastAt(state, TARGET);
      expect(action).toBeTruthy();
      state = passAllReactions(applyOk(state, action!.action));
    }

    expect(state.players.p1.scrolls ?? []).toHaveLength(0);
    expect(state.combat!.units[TARGET].damage).toBe(2);
  });

  it("cannot be buffed by Power — a power play during the cast does nothing", () => {
    let state = scrollCombatState(["spell.magic_arrow"]);
    state.players.p1.hand = ["stat.power"];

    const cast = scrollCastAt(state, TARGET);
    state = applyOk(state, cast!.action);

    // Spend a Power source into the scroll cast's window if one is offered.
    const powerPlay = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(powerPlay, "a Power source should be offered into the cast window").toBeTruthy();
    state = applyOk(state, powerPlay!.action);
    state = passAllReactions(state);

    // Still 1 damage: the scroll spell is locked to power 0 despite the Power.
    expect(state.combat!.units[TARGET].damage).toBe(1);
    const resolved = findEvent(state, "SPELL_CAST_RESOLVED");
    expect(resolved && resolved.type === "SPELL_CAST_RESOLVED" ? resolved.power : -1).toBe(0);
  });
});

describe("Spell Scroll — attack-window instants", () => {
  it("plays a trigger instant (Curse) from the scroll into an attack at power 0", () => {
    let state = createInitialGameState("scroll-attack-seed");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.curse"] }];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });

    const curse = (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.curse" && legal.action.fromScroll === "scroll_1"
    );
    expect(curse, "Curse from the scroll should be offered into the attack").toBeTruthy();

    state = passAllReactions(applyOk(state, curse!.action));

    // Curse at power 0 = -1 defense on the defender; the spell is consumed.
    const rolled = state.eventLog.find((event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation);
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.defenseBonus : 99).toBe(-1);
    expect(state.players.p1.scrolls ?? []).toHaveLength(0);
    expect(state.players.p1.discard).not.toContain("spell.curse");
    expect(state.players.p1.removed).toContain("spell.curse");
  });
});

describe("Spell Scroll — selling at the market", () => {
  it("sells a scroll spell for 2 gold and removes an emptied scroll", () => {
    const state = createAdventureGameState({
      seed: "scroll-sell-seed",
      difficulty: "normal",
      ruleset: "binh",
      rollFirstPlayer: false
    });
    const heroId = "hero_p1";
    const fieldId = state.heroes[heroId].spaceId ?? "";
    const player = state.players.p1 as { resources: { gold: number }; scrolls?: unknown };
    player.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.haste", "spell.fireball"] }];
    state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "TRADING_POST" }] };

    const goldBefore = state.players.p1.resources.gold;
    sellScrollSpell(state, { type: "SELL_SCROLL_SPELL", playerId: "p1", scrollId: "scroll_1", cardId: "spell.haste" });

    expect(state.players.p1.resources.gold).toBe(goldBefore + SCROLL_SPELL_SELL_GOLD);
    expect(state.players.p1.scrolls![0].spellCardIds).toEqual(["spell.fireball"]);
    expect(state.players.p1.removed).toContain("spell.haste");
    expect(findEvent(state, "SCROLL_SPELL_SOLD")).toBeTruthy();

    sellScrollSpell(state, { type: "SELL_SCROLL_SPELL", playerId: "p1", scrollId: "scroll_1", cardId: "spell.fireball" });
    expect(state.players.p1.scrolls ?? []).toHaveLength(0);
    expect(state.players.p1.resources.gold).toBe(goldBefore + SCROLL_SPELL_SELL_GOLD * 2);
  });

  it("offers the scroll-sell action at an open Trading Post", () => {
    const state = createAdventureGameState({
      seed: "scroll-sell-seed-2",
      difficulty: "normal",
      ruleset: "binh",
      rollFirstPlayer: false
    });
    const heroId = "hero_p1";
    const fieldId = state.heroes[heroId].spaceId ?? "";
    (state.players.p1 as { scrolls?: unknown }).scrolls = [
      { id: "scroll_1", spellCardIds: ["spell.haste"] }
    ];
    state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "TRADING_POST" }] };

    const sell = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "SELL_SCROLL_SPELL" && legal.action.cardId === "spell.haste"
    );
    expect(sell).toBeTruthy();
  });
});
