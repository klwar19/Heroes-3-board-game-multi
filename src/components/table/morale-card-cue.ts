import type { GameEvent, GameState, PlayerId } from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import { MORALE_CARD_IDS } from "@/data/cards/morale";

/**
 * Presentation model for the Morale-card overlay (map AND combat screens):
 * every draw, automatic trigger, cancel and absorb becomes one big on-screen
 * card cue with the holder, the card art and a plain-words line saying what
 * just happened — plus the H3 good/bad-morale sting. Pure data builders live
 * here so page.tsx only wires queues and the tests can pin the wording.
 */

export type MoraleCardCueKind = "drawn" | "used" | "cancelled" | "absorbed";

export type MoraleCardCue = {
  id: string;
  playerId: string;
  playerName: string;
  /** The event happened to the viewing seat ("You" phrasing + louder styling). */
  viewerIsHolder: boolean;
  cardId: string;
  cardName: string;
  image?: string;
  polarity: "positive" | "negative";
  kind: MoraleCardCueKind;
  headline: string;
  detail: string;
  /** H3 sting: good-morale when the moment favors the holder, bad-morale otherwise. */
  soundKey: string;
};

/** The converted H3 morale stings (see /public/sounds/manifest.json). */
export const MORALE_CUE_SOUNDS = {
  good: "effects/good-morale",
  bad: "effects/bad-morale"
} as const;

/**
 * The printed rules text rides in the card's tags alongside the "morale" +
 * polarity markers — it is the one entry that is neither. (A length heuristic
 * misses "Reroll a die.", the shortest printed card.)
 */
export function moraleCardRulesText(cardId: string): string {
  const tags = cardLibrary[cardId]?.tags ?? [];
  return tags.find((tag) => tag !== "morale" && tag !== "positive" && tag !== "negative") ?? "";
}

/**
 * What a held card WILL do — shown on the held-card chips (combat panel, map
 * dock) so a player always knows how each face-up card is used or when it
 * will strike. Positive cards spell out where their use is offered; negative
 * cards spell out the automatic trigger.
 */
export const MORALE_CARD_HINTS: Record<string, string> = {
  [MORALE_CARD_IDS.repeatSearch]: "Offers itself right after you resolve a Search: discard the gained card, Search again.",
  [MORALE_CARD_IDS.combatDraw]: "Triggers by itself when your next Combat starts: draw 1 card.",
  [MORALE_CARD_IDS.combatBonus]: "Play during your own Combat: +1 Attack or +1 Defense for the whole fight.",
  [MORALE_CARD_IDS.rerollDie]: "Offered whenever your dice are rolled — pick it in the reroll window.",
  [MORALE_CARD_IDS.setAttackDiePlus]: "Offered on your Attack rolls — set one die to its +1 side.",
  [MORALE_CARD_IDS.removeToken]: "Play during your own Combat: remove a negative token from one of your units.",
  [MORALE_CARD_IDS.redrawHand]: "Play anytime: discard any number of hand cards and draw that many.",
  [MORALE_CARD_IDS.searchOne]: "Strikes your next Search (2+): it reveals only 1 card.",
  [MORALE_CARD_IDS.setAttackDieMinus]: "Strikes your next Attack roll: one die is forced to its −1 side.",
  [MORALE_CARD_IDS.nextRollMinusOne]: "Strikes your next Attack or Defend roll: −1 to the result.",
  [MORALE_CARD_IDS.rollOneLess]: "Strikes your next 2+-dice Attack or Treasure roll: one die fewer is thrown.",
  [MORALE_CARD_IDS.skipActivation]: "Before each of your unit activations: roll an Attack die — a −1 skips that unit.",
  [MORALE_CARD_IDS.randomCombatDiscard]: "Strikes when your next Combat starts: discard 1 random card from hand.",
  [MORALE_CARD_IDS.rerollPlusOne]: "Strikes your next +1 Attack die: it is forcibly rerolled."
};

/** What just happened when a negative card auto-resolved ("used"). */
const NEGATIVE_STRIKE_DETAILS: Record<string, string> = {
  [MORALE_CARD_IDS.searchOne]: "The Search is cut down to a single revealed card.",
  [MORALE_CARD_IDS.setAttackDieMinus]: "One Attack die is forced to its −1 side.",
  [MORALE_CARD_IDS.nextRollMinusOne]: "The roll suffers −1.",
  [MORALE_CARD_IDS.rollOneLess]: "One die fewer is thrown on this roll.",
  [MORALE_CARD_IDS.skipActivation]: "The −1 comes up — this unit's activation is skipped.",
  [MORALE_CARD_IDS.randomCombatDiscard]: "One random card is discarded from hand as the Combat starts.",
  [MORALE_CARD_IDS.rerollPlusOne]: "The +1 die is snatched back and forcibly rerolled."
};

/** What just happened when a positive card resolved ("used"). */
const POSITIVE_USE_DETAILS: Record<string, string> = {
  [MORALE_CARD_IDS.repeatSearch]: "The gained card goes back — the same Search runs again.",
  [MORALE_CARD_IDS.combatDraw]: "Combat begins with one extra card drawn.",
  [MORALE_CARD_IDS.combatBonus]: "A +1 combat bonus lasts for this whole fight.",
  [MORALE_CARD_IDS.rerollDie]: "A die is picked up and rolled again.",
  [MORALE_CARD_IDS.setAttackDiePlus]: "One Attack die is turned to its +1 side.",
  [MORALE_CARD_IDS.removeToken]: "A negative token is lifted off a unit.",
  [MORALE_CARD_IDS.redrawHand]: "Cards are cycled — discard some, draw as many."
};

type MoraleCardEvent = Extract<
  GameEvent,
  { type: "MORALE_CARD_DRAWN" } | { type: "MORALE_CARD_USED" } | { type: "MORALE_CARD_DISCARDED" }
>;

export function isMoraleCardEvent(event: { type: GameEvent["type"] }): boolean {
  return (
    event.type === "MORALE_CARD_DRAWN" ||
    event.type === "MORALE_CARD_USED" ||
    event.type === "MORALE_CARD_DISCARDED"
  );
}

/**
 * One overlay cue for a morale-card event, or null for the quiet cases (the
 * two-Positive-cards limit discard stays a feed line only). The sound picks by
 * whether the moment favors the holder, not by the card's polarity: cancelling
 * a held Negative card is GOOD news, losing a Positive card to absorb is BAD.
 */
export function buildMoraleCardCue(
  event: MoraleCardEvent,
  state: GameState,
  viewerPlayerId: PlayerId | null
): MoraleCardCue | null {
  const card = cardLibrary[event.cardId];
  const playerName = state.players[event.playerId]?.name ?? event.playerId;
  const viewerIsHolder = viewerPlayerId !== null && event.playerId === viewerPlayerId;
  const you = viewerIsHolder;
  const base = {
    id: event.id,
    playerId: event.playerId,
    playerName,
    viewerIsHolder,
    cardId: event.cardId,
    cardName: card?.name ?? event.cardId,
    image: card?.assets?.cardImage,
    polarity: event.polarity
  };

  if (event.type === "MORALE_CARD_DRAWN") {
    return {
      ...base,
      kind: "drawn",
      headline: event.polarity === "positive" ? "Positive Morale!" : "Negative Morale!",
      detail:
        event.polarity === "positive"
          ? `${you ? "You draw" : `${playerName} draws`} a Positive Morale card — held face-up, used whenever ${
              you ? "you wish" : `${playerName} wishes`
            }. ${moraleCardRulesText(event.cardId)}`
          : `${you ? "You draw" : `${playerName} draws`} a Negative Morale card — it strikes by itself. ${
              MORALE_CARD_HINTS[event.cardId] ?? moraleCardRulesText(event.cardId)
            }`,
      soundKey: event.polarity === "positive" ? MORALE_CUE_SOUNDS.good : MORALE_CUE_SOUNDS.bad
    };
  }

  if (event.type === "MORALE_CARD_USED") {
    return {
      ...base,
      kind: "used",
      headline:
        event.polarity === "positive"
          ? you
            ? "You use Positive Morale"
            : `${playerName} uses Positive Morale`
          : "Negative Morale strikes!",
      detail:
        event.polarity === "positive"
          ? POSITIVE_USE_DETAILS[event.cardId] ?? moraleCardRulesText(event.cardId)
          : `${you ? "Your" : `${playerName}'s`} curse resolves. ${
              NEGATIVE_STRIKE_DETAILS[event.cardId] ?? moraleCardRulesText(event.cardId)
            }`,
      soundKey: event.polarity === "positive" ? MORALE_CUE_SOUNDS.good : MORALE_CUE_SOUNDS.bad
    };
  }

  if (event.reason === "cancelled-by-positive") {
    return {
      ...base,
      kind: "cancelled",
      headline: "Negative Morale cancelled",
      detail: `Positive morale lifts the curse — ${you ? "your" : `${playerName}'s`} ${
        card?.name ?? event.cardId
      } returns under its deck instead of striking.`,
      soundKey: MORALE_CUE_SOUNDS.good
    };
  }
  if (event.reason === "absorbed-negative") {
    return {
      ...base,
      kind: "absorbed",
      headline: "Positive Morale absorbs the blow",
      detail: `${you ? "You discard" : `${playerName} discards`} ${
        card?.name ?? event.cardId
      } to soak the negative morale — no Negative card is drawn.`,
      soundKey: MORALE_CUE_SOUNDS.bad
    };
  }
  // "positive-limit" (discarding down to the two-card cap) is the player's own
  // tidy-up choice — a feed line, not a full-screen moment.
  return null;
}

/** All overlay cues for a batch of fresh events, in log order. */
export function buildMoraleCardCues(
  events: readonly GameEvent[],
  state: GameState,
  viewerPlayerId: PlayerId | null
): MoraleCardCue[] {
  const cues: MoraleCardCue[] = [];
  for (const event of events) {
    if (!isMoraleCardEvent(event)) {
      continue;
    }
    const cue = buildMoraleCardCue(event as MoraleCardEvent, state, viewerPlayerId);
    if (cue) {
      cues.push(cue);
    }
  }
  return cues;
}
