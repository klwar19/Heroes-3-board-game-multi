/**
 * Card-back art per deck. CSS renders the styled fallback until real back
 * images land in /public/assets - then setting `image` here switches every
 * pile, fan and flight animation at once.
 */
export type DeckBackStyle = {
  label: string;
  /** CSS class suffix; styles live in globals.css under .cardBack.back-*. */
  styleKey: "player" | "spells" | "abilities" | "artifacts";
  image?: string;
};

export const deckBacks: Record<string, DeckBackStyle> = {
  player: { label: "Player deck", styleKey: "player" },
  spells: { label: "Spells", styleKey: "spells" },
  abilities: { label: "Abilities", styleKey: "abilities" },
  artifacts: { label: "Artifacts", styleKey: "artifacts" }
};

export function getDeckBack(deckId?: string): DeckBackStyle {
  return deckBacks[deckId ?? "player"] ?? deckBacks.player;
}
