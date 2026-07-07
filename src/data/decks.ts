/**
 * Card-back art per deck. The images are the printed backs scanned by the
 * community rulebook project (github.com/Heegu-sama/Homm3BG, assets/cards),
 * hosted locally: every Might & Magic card (player decks, Spells, Abilities,
 * Artifacts) shares the red M&M back; Astrologers Proclaim and the neutral
 * unit decks have their own. The CSS classes stay as a fallback for decks
 * without an image.
 */
export type DeckBackStyle = {
  label: string;
  /** CSS class suffix; styles live in globals.css under .cardBack.back-*. */
  styleKey: "player" | "spells" | "abilities" | "artifacts";
  image?: string;
};

export const CARD_BACK_IMAGES = {
  mm: "/assets/card_back-mm.webp",
  astrologers: "/assets/card_back-astrologers.webp",
  neutral: "/assets/card_back-neutral.webp",
  events: "/assets/card_back-events.webp",
  moralePositive: "/assets/morale-cards/sheet/positive-back-sheet.png",
  moraleNegative: "/assets/morale-cards/sheet/negative-back-sheet.png"
} as const;

export const deckBacks: Record<string, DeckBackStyle> = {
  player: { label: "Player deck", styleKey: "player", image: CARD_BACK_IMAGES.mm },
  spells: { label: "Spells", styleKey: "spells", image: CARD_BACK_IMAGES.mm },
  "spells-expert": { label: "Expert Spells", styleKey: "spells", image: CARD_BACK_IMAGES.mm },
  abilities: { label: "Abilities", styleKey: "abilities", image: CARD_BACK_IMAGES.mm },
  artifacts: { label: "Artifacts", styleKey: "artifacts", image: CARD_BACK_IMAGES.mm },
  "artifacts-minor": { label: "Minor Artifacts", styleKey: "artifacts", image: CARD_BACK_IMAGES.mm },
  "artifacts-major": { label: "Major Artifacts", styleKey: "artifacts", image: CARD_BACK_IMAGES.mm },
  "artifacts-relic": { label: "Relic Artifacts", styleKey: "artifacts", image: CARD_BACK_IMAGES.mm },
  astrologers: { label: "Astrologers Proclaim", styleKey: "player", image: CARD_BACK_IMAGES.astrologers },
  // The Fortress Event deck now uses its own printed back (event-back scan,
  // rotated to the portrait card-back slot) instead of the shared M&M stand-in.
  events: { label: "Events", styleKey: "player", image: CARD_BACK_IMAGES.events },
  "morale-positive": { label: "Positive Morale", styleKey: "player", image: CARD_BACK_IMAGES.moralePositive },
  "morale-negative": { label: "Negative Morale", styleKey: "player", image: CARD_BACK_IMAGES.moraleNegative }
};

export function getDeckBack(deckId?: string): DeckBackStyle {
  return deckBacks[deckId ?? "player"] ?? deckBacks.player;
}
