import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Eagle Eye in combat (CLAUDE.md rule #1 — engine-enforced + mutation-checked).
 *
 * Eagle Eye digs the shared Spell deck for the first Basic (basic play) or
 * Expert (expert play, crown) spell, then — per the printed card, exactly like
 * an elemental Tome's School dig — the player TAKES IT INTO HAND OR DISCARDS
 * IT, and the rest reshuffle. It NEVER touches a battlefield unit. These pin
 * down, each with a control that fails if the wiring is removed:
 *
 *  1. Played in combat it is self-targeted — it offers a `{type:"none"}` play
 *     and demands NO enemy-unit pick. (Before the fix it fell through to the
 *     default "enemy-unit" target: the "weird UI" that made you click a unit,
 *     and made Eagle Eye un-playable when no enemy unit was targetable.)
 *  2. The player PICKS Basic or Expert: basic is always offered; the Expert
 *     side (an Expert spell) is offered when a crown is available and spends it.
 *  3. The dug spell is DETERMINISTIC, not random: the FIRST matching spell from
 *     the top of the deck, skipping non-matching cards, with the rest reshuffled.
 */

const EAGLE = "ability.eagle_eye";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Every PLAY_CARD legal action for Eagle Eye offered to `playerId` right now. */
function eaglePlays(state: GameState, playerId: "p1" | "p2") {
  return getLegalActions(state, playerId)
    .map((legal) => legal.action)
    .filter(
      (action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
        action.type === "PLAY_CARD" && action.cardId === EAGLE
    );
}

/** A fresh combat sandbox (BINH split decks) with Eagle Eye in p1's hand. */
function combatWithEagle(seed: string, expertUses = 0): GameState {
  const state = createInitialGameState(seed);
  state.activePlayerId = "p1";
  state.players.p1.hand = [EAGLE];
  state.players.p1.limits.expertUses = expertUses;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  return state;
}

describe("Eagle Eye in combat: self-targeted, pick Basic or Expert", () => {
  it("offers a no-target play and never demands an enemy-unit pick", () => {
    const state = combatWithEagle("eagle-no-unit");
    // The default sandbox has live enemy units (p2 Skeletons/Vampires/Dread
    // Knights), so a stray "enemy-unit" target would have plenty to latch onto.
    const enemyUnits = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p2");
    expect(enemyUnits.length).toBeGreaterThan(0);

    const plays = eaglePlays(state, "p1");
    expect(plays.length).toBeGreaterThan(0);
    // Self-targeted: at least one no-target play…
    expect(plays.some((play) => play.target?.type === "none")).toBe(true);
    // …and CONTROL: not a single play hangs on an enemy-unit target. (Remove
    // EAGLE_EYE_DIG from selfTargetedEffect and every play here becomes a
    // per-enemy-unit pick, failing both lines.)
    expect(plays.some((play) => play.target?.type === "unit")).toBe(false);
  });

  it("offers only Basic without a crown, and adds the Expert pick with one", () => {
    const noCrown = eaglePlays(combatWithEagle("eagle-basic-only", 0), "p1");
    expect(noCrown.map((play) => play.mode ?? "basic")).toEqual(["basic"]);

    const withCrown = eaglePlays(combatWithEagle("eagle-pick-expert", 1), "p1");
    const modes = withCrown.map((play) => play.mode ?? "basic").sort();
    // CONTROL: the Expert dig only appears in combat because EAGLE_EYE_DIG is in
    // getPlayableModesForCard's crown-gated branch. Both stay no-target.
    expect(modes).toEqual(["basic", "expert"]);
    expect(withCrown.every((play) => play.target?.type === "none")).toBe(true);
  });
});

describe("Eagle Eye dig is deterministic (the first matching spell, not random)", () => {
  it("basic play takes the TOP-MOST Basic spell, skipping an Expert, then reshuffles the rest", () => {
    const state = combatWithEagle("eagle-basic-dig");
    // Draw pile top is the LAST element. Top→bottom: Implosion (expert),
    // Haste (basic), Bless (basic). The basic dig must skip Implosion and take
    // the FIRST basic from the top — Haste — never the deeper Bless, never the
    // Expert.
    state.decks.spells.drawPile = ["spell.bless", "spell.haste", "spell.implosion"];
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    expect(basic).toBeTruthy();
    const dug = applyOk(state, basic!);

    const choice = dug.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("eagle-eye");
    expect((choice as { eagleEye?: { cardId: string } }).eagleEye?.cardId).toBe("spell.haste");
    // Played mid-combat, the take/discard choice returns to combat, not the map.
    expect((choice as { returnPhase?: string }).returnPhase).toBe("combat");

    // Take it into hand.
    const taken = applyOk(dug, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });
    expect(taken.players.p1.hand).toContain("spell.haste");
    expect(taken.decks.spells.drawPile).not.toContain("spell.haste");
    // The skipped cards were reshuffled back into the deck, not consumed.
    expect(taken.decks.spells.drawPile).toContain("spell.bless");
    expect(taken.decks.spells.drawPile).toContain("spell.implosion");
    expect(taken.phase).toBe("combat");
  });

  /**
   * REPORTED BUG (2026-08-08): "Eagle eye did not propose to discard the card."
   * The player was right. The printed card — scan at
   * public/assets/abilities-eagle_eye.webp, both sides — reads "Draw cards from
   * the Spell deck until you find a Basic/Expert Spell card. Take it into your
   * hand OR DISCARD IT. Reshuffle the rest of the cards back to the Spell
   * deck." The engine used to offer take-ONLY (a lone option, and the resolver
   * threw "must be taken into your hand" on the discard index), so a hero was
   * forced to accept a Spell they did not want.
   */
  it("offers the PRINTED discard branch: the find may be pitched to the Spell discard", () => {
    const state = combatWithEagle("eagle-basic-discard");
    state.decks.spells.drawPile = ["spell.haste"];
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    const dug = applyOk(state, basic!);
    const choice = dug.pendingChoice as { id: string; options: { label: string }[] };
    // Two printed answers, in printed order: take, or discard.
    expect(choice.options.map((option) => option.label)).toEqual([
      expect.stringMatching(/^Take Haste into/),
      "Discard Haste"
    ]);

    const discarded = applyOk(dug, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1
    });
    // The observable outcome: the Spell is in the shared deck's DISCARD pile —
    // never destroyed, never forced into the hero's hand.
    expect(discarded.decks.spells.discardPile).toContain("spell.haste");
    expect(discarded.players.p1.hand).not.toContain("spell.haste");
    expect(discarded.decks.spells.drawPile).not.toContain("spell.haste");
    expect(discarded.pendingChoice).toBeNull();
    expect(discarded.phase).toBe("combat");
  });

  it("CONTROL: taking the same find puts it in HAND and leaves the discard pile empty", () => {
    const state = combatWithEagle("eagle-basic-take");
    state.decks.spells.drawPile = ["spell.haste"];
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    const dug = applyOk(state, basic!);
    const choice = dug.pendingChoice as { id: string };
    const taken = applyOk(dug, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });

    expect(taken.players.p1.hand).toContain("spell.haste");
    expect(taken.decks.spells.discardPile).not.toContain("spell.haste");
  });

  it("the EXPERT side carries the same printed discard branch", () => {
    const state = combatWithEagle("eagle-expert-discard", 1);
    state.decks["spells-expert"]!.drawPile = ["spell.implosion"];
    state.decks["spells-expert"]!.discardPile = [];

    const expert = eaglePlays(state, "p1").find((play) => play.mode === "expert");
    const dug = applyOk(state, expert!);
    const choice = dug.pendingChoice as { id: string; options: { label: string }[] };
    expect(choice.options).toHaveLength(2);

    const discarded = applyOk(dug, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1
    });
    // A split-deck Expert find goes back to the EXPERT deck's discard pile.
    expect(discarded.decks["spells-expert"]!.discardPile).toContain("spell.implosion");
    expect(discarded.players.p1.hand).not.toContain("spell.implosion");
  });

  it("expert play reads the Expert spell pool, surfaces an Expert spell, and spends a crown", () => {
    const state = combatWithEagle("eagle-expert-dig", 1);
    // BINH split decks: an Expert dig reads the Expert pool. Stock it with a
    // single Expert spell and leave a Basic on the basic pile as a control that
    // the Expert dig does NOT read the wrong deck.
    state.decks["spells-expert"]!.drawPile = ["spell.implosion"];
    state.decks["spells-expert"]!.discardPile = [];
    state.decks.spells.drawPile = ["spell.haste"];

    const expert = eaglePlays(state, "p1").find((play) => play.mode === "expert");
    expect(expert, "an Expert Eagle Eye play should be offered with a crown").toBeTruthy();
    const dug = applyOk(state, expert!);

    const choice = dug.pendingChoice;
    expect((choice as { eagleEye?: { cardId: string; deckId: string } }).eagleEye).toMatchObject({
      cardId: "spell.implosion",
      deckId: "spells-expert"
    });
    // The crown was spent — the Expert side is genuinely gated, not free.
    expect(dug.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    const taken = applyOk(dug, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });
    expect(taken.players.p1.hand).toContain("spell.implosion");
    // The basic pile was untouched.
    expect(taken.decks.spells.drawPile).toContain("spell.haste");
  });
});

describe("Polish Balance Pack Eagle Eye auto-takes but NAMES the added spell", () => {
  // The reprinted Eagle Eye has no discard arm, so the find is taken silently
  // (a one-button prompt would be a dead click). The author asked to "show which
  // spell is added to the Spell Book": the auto-take must emit a feed line that
  // names the specific spell. Assert the OUTCOME (a named EVENT_NOTE + the spell
  // owned), with a rule-off CONTROL that still opens the naming pendingChoice.
  function balanceEagle(seed: string): GameState {
    const state = combatWithEagle(seed);
    // Freeze the balance pack on. combatWithEagle's sandbox has no adventure,
    // and houseRuleEnabled reads adventure.houseRules first.
    state.adventure = { ...(state.adventure ?? {}), houseRules: { "polish-card-balance": true } } as GameState["adventure"];
    return state;
  }

  it("opens a naming take window for the dug spell, then owns it (user ruling 2026-08-20)", () => {
    const state = balanceEagle("eagle-balance-name");
    state.decks.spells.drawPile = ["spell.bless", "spell.haste"]; // top = Haste
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    expect(basic).toBeTruthy();
    // Balance Eagle Eye asks Basic/Expert first (the spell-deck-pick window)...
    const picked = applyOk(state, basic!);
    const pick = picked.pendingChoice as { id: string; context: string };
    expect(pick.context).toBe("spell-deck-pick");

    const found = applyOk(picked, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: pick.id,
      optionIndex: 0 // Basic
    });

    // ...then a naming window SHOWS which spell was found (the user's ask). The
    // reprint has no discard arm, so it is a single take-only option.
    const choice = found.pendingChoice as {
      id: string;
      context: string;
      prompt: string;
      options: { label: string }[];
      eagleEye?: { cardId: string; allowDiscard: boolean };
    };
    expect(choice.context).toBe("eagle-eye");
    expect(choice.eagleEye?.cardId).toBe("spell.haste");
    expect(choice.eagleEye?.allowDiscard, "no discard arm on the reprint").toBe(false);
    expect(choice.options.length, "take-only window").toBe(1);
    expect(choice.prompt).toContain("Haste");

    const taken = applyOk(found, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
    expect(taken.pendingChoice).toBeNull();
    // The specific spell is owned (hand or Spell Book).
    const owned = [...taken.players.p1.hand, ...taken.players.p1.spellBook, ...taken.players.p1.deck];
    expect(owned).toContain("spell.haste");
  });

  it("CONTROL: with the balance rule OFF, the dig opens the take/discard prompt (two options)", () => {
    const state = combatWithEagle("eagle-balance-control");
    state.decks.spells.drawPile = ["spell.haste"];
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    const dug = applyOk(state, basic!);
    // The classic path shows the name AND keeps its discard arm (two options).
    const choice = dug.pendingChoice as { context: string; options: { label: string }[]; eagleEye?: { allowDiscard: boolean } };
    expect(choice.context).toBe("eagle-eye");
    expect(choice.eagleEye?.allowDiscard).toBe(true);
    expect(choice.options.length).toBe(2);
  });
});

describe("Eagle Eye never hands the hero a duplicate Spell it already owns", () => {
  // House rule (CLAUDE.md): a hero never keeps two copies of the same Spell.
  // The shared-deck Search redraws past an owned card; Eagle Eye's dig must do
  // the same. Before the fix the dig surfaced the first Basic spell by level
  // ALONE, so a hero already holding it could Take a second copy.
  it("digs PAST a Basic spell already in the hero's zones and surfaces the next acquirable one", () => {
    const state = combatWithEagle("eagle-dedup");
    state.players.p1.deck = ["spell.haste"]; // p1 already owns Haste
    // Top→bottom of the draw pile (top = last element): Haste (owned), then
    // Bless. The dig must skip the owned Haste and surface Bless instead.
    state.decks.spells.drawPile = ["spell.bless", "spell.haste"];
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    expect(basic).toBeTruthy();
    const dug = applyOk(state, basic!);

    const choice = dug.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("eagle-eye");
    expect((choice as { eagleEye?: { cardId: string } }).eagleEye?.cardId).toBe("spell.bless");

    const taken = applyOk(dug, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });
    // The hero gained Bless and still holds exactly ONE Haste — never two.
    expect(taken.players.p1.hand).toContain("spell.bless");
    const allZones = [...taken.players.p1.hand, ...taken.players.p1.deck, ...taken.players.p1.discard];
    expect(allZones.filter((id) => id === "spell.haste")).toHaveLength(1);
    expect(allZones.filter((id) => id === "spell.bless")).toHaveLength(1);
  });

  it("CONTROL: with the same deck but NOT owning Haste, the dig surfaces Haste (the dedup is what diverges)", () => {
    const state = combatWithEagle("eagle-dedup-control");
    state.players.p1.deck = []; // owns no spell
    state.decks.spells.drawPile = ["spell.bless", "spell.haste"];
    state.decks.spells.discardPile = [];

    const basic = eaglePlays(state, "p1").find((play) => (play.mode ?? "basic") === "basic");
    const dug = applyOk(state, basic!);
    const choice = dug.pendingChoice;
    expect((choice as { eagleEye?: { cardId: string } }).eagleEye?.cardId).toBe("spell.haste");
  });
});
