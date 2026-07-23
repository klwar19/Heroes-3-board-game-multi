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

describe("Spell Scroll — never holds a duplicate spell (no-duplicate rule)", () => {
  /** A visit drawing `remaining` scroll spells from the Basic deck only. */
  function scrollDraw(seed: string, drawPile: string[], owned: string[] = []) {
    const state = createAdventureGameState({ seed, difficulty: "normal", ruleset: "binh", rollFirstPlayer: false });
    const heroId = "hero_p1";
    const fieldId = state.heroes[heroId].spaceId ?? "";
    // Only the Basic Spell deck holds cards, so each draw auto-resolves with no
    // "which deck?" choice — making the two draws deterministic.
    state.decks.spells.drawPile = [...drawPile];
    state.decks.spells.discardPile = [];
    state.decks["spells-expert"].drawPile = [];
    state.decks["spells-expert"].discardPile = [];
    state.players.p1.hand = [];
    state.players.p1.deck = [...owned];
    state.players.p1.discard = [];
    state.players.p1.scrolls = [];
    state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "SPELL_SCROLL", remaining: 2 }] };
    processPendingVisit(state);
    return state;
  }

  it("draws two DIFFERENT spells even when the deck top is two copies of the same spell", () => {
    // Top→bottom (top = last): Haste, Haste, Bless. The first draw takes Haste;
    // the second must SKIP the second Haste (now owned via the scroll) and take
    // Bless instead — never two Hastes in one scroll.
    const state = scrollDraw("scroll-dedup-twins", ["spell.bless", "spell.haste", "spell.haste"]);
    const ids = state.players.p1.scrolls![0].spellCardIds;
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // no duplicate within the scroll
    expect(ids).toContain("spell.haste");
    expect(ids).toContain("spell.bless");
  });

  it("does not draw a spell the hero already owns in another zone", () => {
    // p1 already owns Haste (in deck). Deck top is Haste then Bless: the draw
    // skips the owned Haste and the scroll gets Bless only (the second draw finds
    // nothing acquirable left). The hero never holds two Hastes.
    const state = scrollDraw("scroll-dedup-owned", ["spell.bless", "spell.haste"], ["spell.haste"]);
    const ids = state.players.p1.scrolls?.[0]?.spellCardIds ?? [];
    expect(ids).not.toContain("spell.haste");
    expect(ids).toContain("spell.bless");
    const everywhere = [...state.players.p1.deck, ...ids];
    expect(everywhere.filter((id) => id === "spell.haste")).toHaveLength(1);
  });

  it("CONTROL: with no prior copy, the deck top IS taken (the dedup is what diverges)", () => {
    const state = scrollDraw("scroll-dedup-control", ["spell.bless", "spell.haste"]);
    const ids = state.players.p1.scrolls![0].spellCardIds;
    // Both distinct cards are taken — proving the skip in the prior tests is the
    // no-duplicate rule biting, not the deck simply running dry.
    expect(ids).toContain("spell.haste");
    expect(ids).toContain("spell.bless");
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
    // Scroll casts do NOT count toward the one-Spell-per-round limit.
    expect(state.combat!.units[TARGET].damage).toBe(1);
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(state.players.p1.scrolls![0].spellCardIds).toEqual(["spell.magic_arrow"]);
    expect(state.players.p1.discard).not.toContain("spell.magic_arrow");
    expect(state.players.p1.removed).toContain("spell.magic_arrow");

    const resolved = findEvent(state, "SPELL_CAST_RESOLVED");
    expect(resolved && resolved.type === "SPELL_CAST_RESOLVED" ? resolved.power : -1).toBe(0);
  });

  it("does not count toward the spell limit and stays castable after a hand Spell", () => {
    let state = scrollCombatState(["spell.magic_arrow"]);
    // Spend the one-Spell-per-round limit with a hand Magic Arrow first.
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.combatStats.spellsCastThisRound = 0;
    const handCast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        !legal.action.fromScroll &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === TARGET
    );
    expect(handCast, "hand Magic Arrow should be castable").toBeTruthy();
    state = passAllReactions(applyOk(state, handCast!.action));
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);

    // CONTROL: a second hand Spell is blocked at the limit.
    state.players.p1.hand = ["spell.magic_arrow"];
    const blockedHand = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        !legal.action.fromScroll
    );
    expect(blockedHand, "hand Spell must stay blocked at the limit").toBeUndefined();

    // Scroll cast is still offered and does not bump the counter.
    const scrollCast = scrollCastAt(state, TARGET);
    expect(scrollCast, "scroll cast must remain legal after the limit is spent").toBeTruthy();
    state = passAllReactions(applyOk(state, scrollCast!.action));
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(state.players.p1.scrolls ?? []).toHaveLength(0);
    expect(state.combat!.units[TARGET].damage).toBe(2); // hand 1 + scroll 1
  });

  it("removes the whole scroll once both spells are used", () => {
    let state = scrollCombatState();

    for (let cast = 0; cast < 2; cast += 1) {
      // Scrolls ignore the limit — both can fire in the same round.
      const action = scrollCastAt(state, TARGET);
      expect(action).toBeTruthy();
      state = passAllReactions(applyOk(state, action!.action));
    }

    expect(state.players.p1.scrolls ?? []).toHaveLength(0);
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(state.combat!.units[TARGET].damage).toBe(2);
  });

  it("cannot climb past the lowest useful tier — Power on Magic Arrow stays at 0", () => {
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

    // Magic Arrow's lowest useful tier is Power 0 (1 damage). Paid Power cannot
    // raise a Scroll cast past that floor — still 1 damage, not the Power-1 rung.
    expect(state.combat!.units[TARGET].damage).toBe(1);
    const resolved = findEvent(state, "SPELL_CAST_RESOLVED");
    expect(resolved && resolved.type === "SPELL_CAST_RESOLVED" ? resolved.power : -1).toBe(0);
  });

  it("can pay Power to reach the lowest useful tier of a floor-gated spell (Implosion)", () => {
    // Implosion amountByPower {0:0, 1:2, …}: at Power 0 it deals nothing; the
    // lowest useful tier is Power 1 → 2 damage. A Scroll may fuel that floor
    // with a paid Power source, but never climb higher.
    let state = scrollCombatState(["spell.implosion"]);
    state.players.p1.hand = ["stat.power"];
    // Target needs enough HP to observe the 2 damage.
    state.combat!.units[TARGET].maxHealth = 9;
    state.combat!.units[TARGET].damage = 0;

    const cast = scrollCastAt(state, TARGET);
    expect(cast, "Implosion scroll cast offered").toBeTruthy();
    state = applyOk(state, cast!.action);

    const powerPlay = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(powerPlay, "Power must be offerable to fuel the Implosion floor").toBeTruthy();
    state = applyOk(state, powerPlay!.action);
    state = passAllReactions(state);

    expect(state.combat!.units[TARGET].damage).toBe(2);
    const resolved = findEvent(state, "SPELL_CAST_RESOLVED");
    expect(resolved && resolved.type === "SPELL_CAST_RESOLVED" ? resolved.power : -1).toBe(1);
  });

  it("CONTROL: without paying Power, a scroll Implosion fizzles at Power 0", () => {
    let state = scrollCombatState(["spell.implosion"]);
    state.players.p1.hand = []; // nothing to fuel with — may pass under floor
    state.combat!.units[TARGET].maxHealth = 9;
    state.combat!.units[TARGET].damage = 0;

    const cast = scrollCastAt(state, TARGET);
    state = passAllReactions(applyOk(state, cast!.action));

    expect(state.combat!.units[TARGET].damage).toBe(0);
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

describe("Spell Scroll — a fizzled scroll Clone does not evade the one-Spell limit", () => {
  const ALLY = "unit_p1_marksmen";

  /** A hand Magic Arrow at the enemy, offered only when NOT already spent. */
  function handArrowCast(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        !legal.action.fromScroll &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === TARGET
    );
  }

  it("keeps the round's Spell limit spent — a scroll Clone at Power 0 fizzles, it does not refund a hand cast", () => {
    // A scroll Clone is always Power 0, and Clone needs Power ≥ 1, so it can
    // never place a copy — it always hits the insufficient-Power refund. That
    // refund must NOT roll back spellsCastThisRound (a scroll never incremented
    // it), or a player could cast a hand Spell, then a scroll Clone, then a
    // SECOND hand Spell "for free" in a one-Spell-per-round window.
    let state = scrollCombatState(["spell.clone"]);
    state.players.p1.hand = ["spell.magic_arrow"];

    // Spend the one-Spell-per-round limit with a hand Magic Arrow.
    const hand = handArrowCast(state);
    expect(hand, "hand Magic Arrow should be castable").toBeTruthy();
    state = passAllReactions(applyOk(state, hand!.action));
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);

    // CONTROL: a second hand Spell is blocked at the limit BEFORE the scroll cast.
    state.players.p1.hand = ["spell.magic_arrow"];
    expect(handArrowCast(state), "second hand Spell blocked at the limit").toBeUndefined();

    // Now cast the fizzling scroll Clone at a friendly unit (use the engine's own
    // offered action so the target is whatever it deems legal — at Power 0 any
    // friendly target hits the insufficient-Power refund).
    const scrollClone = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.clone" &&
        legal.action.fromScroll === "scroll_1"
    );
    expect(scrollClone, "scroll Clone should be offered").toBeTruthy();
    state = passAllReactions(applyOk(state, scrollClone!.action));

    // The scroll spell is spent (one-use), never duplicated into the discard.
    expect(findEvent(state, "SPELL_CAST_REFUNDED")).toBeTruthy();
    expect(state.players.p1.scrolls ?? []).toHaveLength(0);
    expect(state.players.p1.removed).toContain("spell.clone");
    expect(state.players.p1.discard).not.toContain("spell.clone");

    // THE FIX: the limit is still spent. Counter AND the observable outcome —
    // a second hand Spell is STILL blocked (no evasion). Reverting the
    // `!scrollLocked` guard rolls spellsCastThisRound back to 0, which re-offers
    // the hand Magic Arrow — this assertion then fails.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    state.players.p1.hand = ["spell.magic_arrow"];
    expect(
      handArrowCast(state),
      "a fizzled scroll Clone must not re-open the spent Spell limit"
    ).toBeUndefined();
  });

  it("CONTROL: a HAND Clone underpay DOES refund — card back to hand, its own count rolled back", () => {
    // The divergence proof: a hand Clone that fizzles returns to hand and rolls
    // back the count it just spent (a normal refund), whereas the scroll cast
    // above does neither (it is spent and the count is untouched).
    let state = scrollCombatState(["spell.clone"]);
    state.players.p1.scrolls = [];
    state.players.p1.hand = ["spell.clone"];
    state.players.p1.combatStats.spellsCastThisRound = 0;

    state = passAllReactions(
      applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.clone",
        target: { type: "unit", unitId: ALLY }
      })
    );

    expect(findEvent(state, "SPELL_CAST_REFUNDED")).toBeTruthy();
    // Hand cast: the card returns to hand and its own count is rolled back to 0.
    expect(state.players.p1.hand).toContain("spell.clone");
    expect(state.players.p1.removed).not.toContain("spell.clone");
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
  });
});
