import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { cardLibrary } from "@/data/cards/library";

// ---------------------------------------------------------------------------
// "Ongoing cards stay in play" — the shared invariant + the paths that broke it
//
// User report: an ongoing Spell / Ability / Artifact (Luck, Water Walk,
// Pathfinding …) must be VISIBLE in play while its effect runs, and reach the
// discard pile only once the effect is gone. The engine already held cards whose
// effect was created inside their own play action; this file pins the invariant
// itself (library-derived) plus the one path that used to violate it — a card
// whose lasting effect is created LATER, when its Power/boost prompt is answered.
// ---------------------------------------------------------------------------

function makeMap(): GameState {
  const state = createAdventureGameState({
    seed: "ongoing-cards",
    difficulty: "normal",
    rollFirstPlayer: false
  });
  // The mandatory start-of-turn hand step is not what these fixtures exercise.
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function makeCombat(): GameState {
  return createInitialGameState();
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * THE INVARIANT under test: a card whose play left a LIVE lasting effect must
 * not be lying in its owner's discard pile — it belongs in the Ongoing tray
 * until that effect ends. Returns one string per violating (owner, card).
 */
function liveEffectCardsInDiscard(state: GameState): string[] {
  const violations = new Set<string>();
  for (const effect of state.activeEffects) {
    if (effect.source.type !== "card" || effect.duration.type === "instant") {
      continue;
    }
    const owner = state.players[effect.source.controllerId];
    if (owner?.discard.includes(effect.source.cardId)) {
      violations.add(`${owner.id}:${effect.source.cardId}:${effect.name}:${effect.duration.type}`);
    }
  }
  return [...violations];
}

/** Every copy of `cardId` this player owns, wherever it currently sits. */
function copiesOwned(state: GameState, playerId: PlayerId, cardId: string): number {
  const player = state.players[playerId];
  const zones = [
    player.hand,
    player.deck,
    player.discard,
    player.removed,
    player.permanents ?? [],
    player.spellBook ?? [],
    player.spellBookUsed ?? [],
    (player.ongoingCards ?? []).map((held) => held.cardId)
  ];
  return zones.reduce((total, zone) => total + zone.filter((id) => id === cardId).length, 0);
}

function ongoingIds(state: GameState, playerId: PlayerId): string[] {
  return (state.players[playerId]?.ongoingCards ?? []).map((held) => held.cardId);
}

/** Answer p1-owned OPTION_CHOICEs with their LAST option ("play now" / decline). */
function settleOwnChoices(state: GameState, playerId: PlayerId = "p1"): GameState {
  let next = state;
  for (let step = 0; step < 4; step += 1) {
    const choice = next.pendingChoice;
    if (!choice || choice.playerId !== playerId || choice.type !== "OPTION_CHOICE") {
      break;
    }
    const result = applyAction(next, {
      type: "CHOOSE_OPTION",
      playerId,
      choiceId: choice.id,
      optionIndex: choice.options.length - 1
    });
    if (result.errors.length > 0) {
      break;
    }
    next = result.state;
  }
  return next;
}

describe("ongoing cards — the live-effect invariant across the whole card library", () => {
  /**
   * Library-derived sweep: give p1 every implemented card in turn (plus two
   * power sources, so cast-then-boost prompts really open), play EVERY offer the
   * engine makes for it, answer any follow-up option prompt, then assert the
   * invariant. This is the guard that a NEW card cannot quietly leave its own
   * lasting effect running from the discard pile.
   *
   * LIMIT (honest): only cards the two fixtures below make playable are
   * exercised — the covered-play floors are asserted so the sweep cannot
   * silently stop covering anything.
   */
  function sweepLibrary(make: () => GameState): { violations: string[]; plays: number } {
    const violations = new Set<string>();
    let plays = 0;
    const implemented = Object.keys(cardLibrary).filter(
      (id) => cardLibrary[id]?.implementationStatus === "implemented"
    );
    for (const cardId of implemented) {
      const state = make();
      state.players.p1.hand = [cardId, "spell.haste", "spell.magic_arrow"];
      let offers;
      try {
        offers = getLegalActions(state, "p1").filter(
          (legal) =>
            (legal.action.type === "PLAY_CARD" || legal.action.type === "CAST_SPELL") &&
            legal.action.cardId === cardId
        );
      } catch {
        continue;
      }
      for (const offer of offers) {
        let result;
        try {
          result = applyAction(state, offer.action as GameAction);
        } catch {
          continue;
        }
        if (result.errors.length > 0) {
          continue;
        }
        plays += 1;
        for (const violation of liveEffectCardsInDiscard(settleOwnChoices(result.state))) {
          violations.add(`${cardId} | ${offer.label} | ${violation}`);
        }
      }
    }
    return { violations: [...violations], plays };
  }

  it("no MAP play leaves a live lasting effect running from the discard pile", () => {
    const { violations, plays } = sweepLibrary(makeMap);
    expect(violations, violations.join("\n")).toEqual([]);
    // Coverage floor: the sweep really played a large slice of the library.
    expect(plays).toBeGreaterThan(200);
  }, 600000);

  it("no COMBAT play leaves a live lasting effect running from the discard pile", () => {
    const { violations, plays } = sweepLibrary(makeCombat);
    expect(violations, violations.join("\n")).toEqual([]);
    expect(plays).toBeGreaterThan(700);
  }, 600000);
});

describe("ongoing cards — a boost-prompt card is held in play (Fortune, map)", () => {
  /** Play Fortune on the map; `powerCards` are the extra hand cards it may spend. */
  function playFortune(powerCards: string[]): { before: GameState; after: GameState; prompted: boolean } {
    const before = makeMap();
    before.players.p1.hand = ["spell.fortune", ...powerCards];
    const played = applyOk(before, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
    const prompted =
      played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.context === "fortune-boost";
    return { before, after: settleOwnChoices(played), prompted };
  }

  it("REPRO: Fortune whose Power prompt creates the effect in a LATER action stays in play", () => {
    const { before, after, prompted } = playFortune(["spell.haste"]);
    // The prompt is what made this play different: the reroll effect is created
    // when it is answered, i.e. after the play action's own hold hook has run.
    expect(prompted, "a power source in hand must open Fortune's boost prompt").toBe(true);

    const fortune = after.activeEffects.filter(
      (effect) => effect.source.type === "card" && effect.source.cardId === "spell.fortune"
    );
    expect(fortune, "the reroll effect is live").toHaveLength(1);
    expect(after.players.p1.discard).not.toContain("spell.fortune");
    expect(ongoingIds(after, "p1")).toContain("spell.fortune");
    expect(after.players.p1.ongoingCards?.[0]?.effectIds).toEqual([fortune[0].id]);
    expect(liveEffectCardsInDiscard(after)).toEqual([]);

    // Card-count conservation: exactly one Fortune before and after, never two.
    expect(copiesOwned(before, "p1", "spell.fortune")).toBe(1);
    expect(copiesOwned(after, "p1", "spell.fortune")).toBe(1);
  });

  it("CONTROL: the same card with NO power source (no prompt) was already held by the play hook", () => {
    const { after, prompted } = playFortune([]);
    expect(prompted, "no power source ⇒ no prompt ⇒ the effect is made inside the play action").toBe(false);
    expect(ongoingIds(after, "p1")).toContain("spell.fortune");
    expect(after.players.p1.discard).not.toContain("spell.fortune");
  });

  it("CONTROL: an instant with no lasting effect still goes straight to the discard", () => {
    const state = makeMap();
    state.players.p1.hand = ["ability.estates"];
    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.estates",
      mode: "basic",
      target: { type: "none" }
    });
    expect(played.players.p1.discard).toContain("ability.estates");
    expect(ongoingIds(played, "p1")).not.toContain("ability.estates");
  });

  it("the held card reaches the discard exactly once, when its effect ends", () => {
    const { after } = playFortune(["spell.haste"]);
    expect(ongoingIds(after, "p1")).toContain("spell.fortune");

    // End the effect at its own seam (the reroll is consumed / the turn ends),
    // then let any action run the shared release pass.
    const effectIds = new Set(
      after.activeEffects
        .filter((effect) => effect.source.type === "card" && effect.source.cardId === "spell.fortune")
        .map((effect) => effect.id)
    );
    expect(effectIds.size).toBe(1);
    const expired = { ...after, activeEffects: after.activeEffects.filter((effect) => !effectIds.has(effect.id)) };
    const settled = applyOk(expired, { type: "END_TURN", playerId: "p1" });

    expect(ongoingIds(settled, "p1")).not.toContain("spell.fortune");
    expect(settled.players.p1.discard.filter((id) => id === "spell.fortune")).toHaveLength(1);
    expect(copiesOwned(settled, "p1", "spell.fortune")).toBe(1);
  });

  it("the owner can end the held card early, and it goes to its OWN zone", () => {
    const { after } = playFortune(["spell.haste"]);
    const discardOffer = getLegalActions(after, "p1").find(
      (legal) => legal.action.type === "DISCARD_ONGOING_CARD" && legal.action.cardId === "spell.fortune"
    );
    expect(discardOffer, "an Ongoing card the engine holds must be endable by its owner").toBeTruthy();

    const ended = applyOk(after, discardOffer!.action);
    expect(
      ended.activeEffects.some(
        (effect) => effect.source.type === "card" && effect.source.cardId === "spell.fortune"
      )
    ).toBe(false);
    expect(ongoingIds(ended, "p1")).not.toContain("spell.fortune");
    expect(ended.players.p1.discard).toContain("spell.fortune");
    expect(copiesOwned(ended, "p1", "spell.fortune")).toBe(1);
  });
});

describe("ongoing cards — cards that were ALREADY correct stay correct", () => {
  it.each([
    ["ability.pathfinding", "Pathfinding"],
    ["ability.luck", "Luck"]
  ])("%s is held in play while its effect runs", (cardId) => {
    const state = makeMap();
    state.players.p1.hand = [cardId];
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
    );
    expect(offer, `${cardId} must be map-playable`).toBeTruthy();

    const played = applyOk(state, offer!.action);
    expect(ongoingIds(played, "p1")).toContain(cardId);
    expect(played.players.p1.discard).not.toContain(cardId);
    expect(liveEffectCardsInDiscard(played)).toEqual([]);
    expect(copiesOwned(played, "p1", cardId)).toBe(1);
  });
});

describe("ongoing cards — Knowledge/Mysticism recall of a card held in play", () => {
  it("re-marks the newly held card to come back to the hand when its effect ends", () => {
    const state = makeMap();
    state.players.p1.hand = ["spell.fortune", "spell.haste", "stat.knowledge"];
    let played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
    played = settleOwnChoices(played);
    expect(ongoingIds(played, "p1")).toContain("spell.fortune");

    // The map recall step (KNOWLEDGE_RECALL_MAP_SPELL) is queued behind the play.
    // It already knows about the Ongoing tray, so a card the new hold pass moved
    // out of the discard is still recallable — it is flagged to return, not lost.
    const recall = getLegalActions(played, "p1").find(
      (legal) => legal.label === "Use Knowledge: return Fortune to your hand"
    );
    expect(recall, "the map Knowledge recall must be offered for the held Spell").toBeTruthy();

    const recalled = applyOk(played, recall!.action);
    const held = recalled.players.p1.ongoingCards?.find((entry) => entry.cardId === "spell.fortune");
    expect(held?.returnTo, "the recalled card must not be routed to the discard").toBe("hand");
    expect(recalled.players.p1.discard).not.toContain("spell.fortune");
    expect(copiesOwned(recalled, "p1", "spell.fortune")).toBe(1);
  });
});
