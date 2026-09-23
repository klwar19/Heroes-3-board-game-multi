import { RUNE_LEVEL_LABELS } from "@/engine/runes";

/**
 * The "rune word" inscribed when a Bulwark army reaches a Rune Level: an Elder
 * Futhark spelling of the rune that names the level's buff, shown by the
 * RUNE_LEVEL_REACHED celebration overlay (FX cue `kind: "rune"`). The buff text
 * itself is the engine's own `RUNE_LEVEL_LABELS`, so it follows the real level
 * data rather than repeating it here.
 *
 *   L1 Tiwaz  (ᛏ, the war-god's spear)  → Attack
 *   L2 Raidho (ᚱ, the ride / journey)    → Speed (Initiative)
 *   L3 Algiz  (ᛉ, the warding elk-sedge) → Defense
 */
export const RUNE_BURST_ART = "/fx/rune-level-burst.webp";

const RUNE_WORDS = [
  { name: "TIWAZ", futhark: "ᛏᛁᚹᚨᛉ" },
  { name: "RAIDHO", futhark: "ᚱᚨᛁᛞᛟ" },
  { name: "ALGIZ", futhark: "ᚨᛚᚷᛁᛉ" }
] as const;

export type RuneWord = { level: number; name: string; futhark: string; label: string };

/** The rune word for a reached Rune Level (1-based); clamps to the known levels. */
export function runeWordForLevel(level: number): RuneWord {
  const index = Math.max(0, Math.min(RUNE_WORDS.length - 1, Math.round(level) - 1));
  const word = RUNE_WORDS[index];
  return {
    level: index + 1,
    name: word.name,
    futhark: word.futhark,
    label: RUNE_LEVEL_LABELS[index] ?? ""
  };
}
