import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import soundManifest from "../../../public/sounds/manifest.json";
import type { GameEvent, GameState } from "@/engine";
import {
  MORALE_CARD_IDS,
  moraleNegativeDeckCardIds,
  moralePositiveDeckCardIds
} from "@/data/cards/morale";
import {
  buildMoraleCardCues,
  isMoraleCardEvent,
  MORALE_CARD_HINTS,
  MORALE_CUE_SOUNDS,
  moraleCardRulesText
} from "./morale-card-cue";

const library = soundManifest as Record<string, { src?: string }>;

/** The cue builder only reads player names, so a light stub is enough. */
const state = {
  players: {
    p1: { name: "Alice" },
    p2: { name: "Bob" }
  }
} as unknown as GameState;

function drawn(cardId: string, polarity: "positive" | "negative", playerId = "p1"): GameEvent {
  return {
    id: `evt_${cardId}_drawn`,
    type: "MORALE_CARD_DRAWN",
    playerId,
    cardId,
    polarity,
    reshuffledDiscard: false
  } as GameEvent;
}

function used(cardId: string, polarity: "positive" | "negative", playerId = "p1"): GameEvent {
  return {
    id: `evt_${cardId}_used`,
    type: "MORALE_CARD_USED",
    playerId,
    cardId,
    polarity,
    reason: "used"
  } as GameEvent;
}

function discarded(
  cardId: string,
  polarity: "positive" | "negative",
  reason: "cancelled-by-positive" | "absorbed-negative" | "positive-limit",
  playerId = "p1"
): GameEvent {
  return {
    id: `evt_${cardId}_${reason}`,
    type: "MORALE_CARD_DISCARDED",
    playerId,
    cardId,
    polarity,
    reason
  } as GameEvent;
}

describe("morale card overlay cues", () => {
  it("a positive draw pops a gold cue with the good-morale sting", () => {
    const [cue] = buildMoraleCardCues([drawn(MORALE_CARD_IDS.combatDraw, "positive")], state, "p1");
    expect(cue).toBeTruthy();
    expect(cue.kind).toBe("drawn");
    expect(cue.headline).toBe("Positive Morale!");
    expect(cue.polarity).toBe("positive");
    expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.good);
    expect(cue.viewerIsHolder).toBe(true);
    expect(cue.playerName).toBe("Alice");
    expect(cue.image).toContain("/assets/morale-cards/");
    expect(cue.detail).toContain("You draw");
  });

  it("a negative draw pops a red cue with the bad-morale sting and the strike hint", () => {
    const [cue] = buildMoraleCardCues([drawn(MORALE_CARD_IDS.searchOne, "negative", "p2")], state, "p1");
    expect(cue.headline).toBe("Negative Morale!");
    expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.bad);
    expect(cue.viewerIsHolder).toBe(false);
    expect(cue.detail).toContain("Bob draws");
    expect(cue.detail).toContain(MORALE_CARD_HINTS[MORALE_CARD_IDS.searchOne]);
  });

  it("a negative auto-strike says exactly what happened (skip activation)", () => {
    const [cue] = buildMoraleCardCues([used(MORALE_CARD_IDS.skipActivation, "negative")], state, "p1");
    expect(cue.kind).toBe("used");
    expect(cue.headline).toBe("Negative Morale strikes!");
    expect(cue.detail).toContain("activation is skipped");
    expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.bad);
  });

  it("every negative card's strike cue names its concrete effect", () => {
    for (const cardId of new Set(moraleNegativeDeckCardIds)) {
      const [cue] = buildMoraleCardCues([used(cardId, "negative")], state, "p1");
      expect(cue, cardId).toBeTruthy();
      expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.bad);
      // The generic printed text is the fallback; each in-deck card should have
      // its own plain-words outcome line, not just repeat the rules text.
      expect(cue.detail.length, cardId).toBeGreaterThan(20);
    }
  });

  it("a positive use keeps the good sting and names the user", () => {
    const [cue] = buildMoraleCardCues([used(MORALE_CARD_IDS.rerollDie, "positive", "p2")], state, "p1");
    expect(cue.headline).toBe("Bob uses Positive Morale");
    expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.good);
  });

  it("cancelling a held Negative card is GOOD news despite the card's polarity", () => {
    const [cue] = buildMoraleCardCues(
      [discarded(MORALE_CARD_IDS.searchOne, "negative", "cancelled-by-positive")],
      state,
      "p1"
    );
    expect(cue.kind).toBe("cancelled");
    expect(cue.headline).toBe("Negative Morale cancelled");
    // CONTROL: the card is negative, but the moment favors the holder.
    expect(cue.polarity).toBe("negative");
    expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.good);
  });

  it("losing a Positive card to absorb is BAD news despite the card's polarity", () => {
    const [cue] = buildMoraleCardCues(
      [discarded(MORALE_CARD_IDS.combatDraw, "positive", "absorbed-negative")],
      state,
      "p1"
    );
    expect(cue.kind).toBe("absorbed");
    expect(cue.polarity).toBe("positive");
    expect(cue.soundKey).toBe(MORALE_CUE_SOUNDS.bad);
  });

  it("the two-Positive-cards limit tidy-up stays a quiet feed line (no overlay)", () => {
    const cues = buildMoraleCardCues(
      [discarded(MORALE_CARD_IDS.combatDraw, "positive", "positive-limit")],
      state,
      "p1"
    );
    expect(cues).toEqual([]);
  });

  it("ignores non-morale events and keeps log order", () => {
    const cues = buildMoraleCardCues(
      [
        { id: "evt_x", type: "MORALE_CHANGED", playerId: "p1", amount: 1, total: 1 } as GameEvent,
        drawn(MORALE_CARD_IDS.combatDraw, "positive"),
        used(MORALE_CARD_IDS.searchOne, "negative")
      ],
      state,
      "p1"
    );
    expect(cues.map((cue) => cue.kind)).toEqual(["drawn", "used"]);
    expect(isMoraleCardEvent({ type: "MORALE_CHANGED" })).toBe(false);
    expect(isMoraleCardEvent({ type: "MORALE_CARD_DRAWN" })).toBe(true);
  });

  it("every regular-deck morale card carries a hint and printed rules text", () => {
    for (const cardId of new Set([...moralePositiveDeckCardIds, ...moraleNegativeDeckCardIds])) {
      expect(MORALE_CARD_HINTS[cardId], cardId).toBeTruthy();
      expect(moraleCardRulesText(cardId), cardId).not.toBe("");
    }
  });

  it("both morale stings resolve to real clips on disk", () => {
    for (const key of [MORALE_CUE_SOUNDS.good, MORALE_CUE_SOUNDS.bad]) {
      const src = library[key]?.src;
      expect(src, `${key} should have a src`).toBeTruthy();
      const file = fileURLToPath(new URL(`../../../public${src}`, import.meta.url));
      expect(existsSync(file), `${src} should exist on disk`).toBe(true);
    }
  });
});
