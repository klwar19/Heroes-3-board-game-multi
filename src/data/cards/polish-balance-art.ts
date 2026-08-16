import { cardLibrary } from "@/data/cards/library";

/**
 * Polish Balance Pack (`polish-card-balance`) — the reprinted card FACES.
 *
 * `public/assets/polish-balance/<card id with "." → "-">.webp`, 743×1040 (the
 * repo's card-face size). While the house rule is ON, every surface that paints
 * one of these cards' faces shows the balance face instead of the classic scan;
 * with the rule OFF nothing here is consulted and the render is byte-identical.
 *
 * THE LIST IS THE CONTRACT (CLAUDE.md #1/#2). A card id lives here ONLY once its
 * NEW printed behaviour is genuinely engine-wired under the rule. A card whose
 * reprint is not implemented keeps its CLASSIC face on purpose: swapping in a
 * face whose printed text the engine does not run would be exactly the
 * "pasted-but-inert text" this repo forbids — the player would read rules that
 * never fire. So this registry doubles as the honest scope marker for the pack.
 *
 * The face also wins over the printed `-empowered` scan (see
 * `polishBalanceFaceImage`): that scan prints the OLD rules text, so an Empowered
 * holder must still read the NEW card. The Empowered cue stays the gold
 * ring/badge the render surfaces already draw on top.
 */

/**
 * Every card whose Balance-Pack reprint is WIRED (Abilities, Spells, Artifacts,
 * Specialties — all four categories, 72 cards) — see
 * the `polish-card-balance` registry entry in `house-rules.ts` for the per-card
 * summary, and `polish-balance-art.test.ts` for the on-disk + wiring pins.
 */
export const POLISH_BALANCE_CARD_IDS = [
  "ability.artillery",
  "ability.ballistics",
  "ability.diplomacy",
  "ability.eagle_eye",
  "ability.first_aid",
  "ability.interference",
  "ability.intelligence",
  "ability.learning",
  "ability.mysticism",
  "ability.pathfinding",
  "ability.scouting",
  "ability.tactics",
  "ability.wisdom",
  "spell.anti_magic",
  "spell.bless",
  "spell.blind",
  "spell.counterstrike",
  "spell.dispel",
  "spell.disrupting_ray",
  "spell.fire_shield",
  "spell.fire_wall",
  "spell.forgetfulness",
  "spell.fortune",
  "spell.frenzy",
  "spell.haste",
  "spell.mirth",
  "spell.misfortune",
  "spell.prayer",
  "spell.remove_obstacle",
  "spell.shield",
  "spell.slayer",
  "spell.slow",
  "spell.sorrow",
  "spell.visions",
  "artifact.ambassadors_sash",
  "artifact.blackshard_of_the_dead_knight",
  "artifact.boots_of_speed",
  "artifact.cape_of_velocity",
  "artifact.cards_of_prophecy",
  "artifact.celestial_necklace_of_bliss",
  "artifact.centaurs_axe",
  "artifact.crown_of_dragontooth",
  "artifact.crown_of_the_five_seas",
  "artifact.diplomats_ring",
  "artifact.dragon_wing_tabard",
  "artifact.equestrians_gloves",
  "artifact.eversmoking_ring_of_sulfur",
  "artifact.golden_bow",
  "artifact.helm_of_the_alabaster_unicorn",
  "artifact.hourglass_of_the_evil_hour",
  "artifact.lions_shield_of_courage",
  "artifact.necklace_of_swiftness",
  "artifact.pendant_of_second_sight",
  "artifact.rib_cage",
  "artifact.ring_of_the_wayfarer",
  "artifact.sandals_of_the_saint",
  "artifact.shamans_puppet",
  "artifact.speculum",
  "artifact.spirit_of_oppression",
  "artifact.sword_of_judgement",
  "artifact.thunder_helmet",
  "specialty.adelaide.4",
  "specialty.ciele.1",
  "specialty.ciele.4",
  "specialty.dracon.4",
  "specialty.gelu.4",
  "specialty.jeddite.1",
  "specialty.jeddite.6",
  "specialty.sandro.1",
  "specialty.sandro.4",
  "specialty.tarnum_conflux.1",
  "specialty.vidomina.4"
] as const;

/**
 * Balance-Pack cards that are DELIBERATELY not reprinted yet: their new printed
 * text is a restructure the engine does not run, so they keep the classic face.
 * An explicit, reviewable registry rather than silence (the
 * `DISPLAY_ONLY_ABILITIES` pattern) — moving an id from here to
 * `POLISH_BALANCE_CARD_IDS` is the conscious "it is wired now" step.
 *
 * EMPTY: all 13 Abilities, 21 Spells, 27 Artifacts AND 11 Specialties are
 * wired — the pack is complete (72/72). A FUTURE unwireable reprint belongs
 * here, never silently in the classic-face fallback.
 */
export const POLISH_BALANCE_NOT_IMPLEMENTED: Record<string, string> = {};

const COVERED = new Set<string>(POLISH_BALANCE_CARD_IDS);

/** Whether `cardId` has a wired Balance-Pack reprint. */
export function isPolishBalanceCard(cardId: string | undefined): boolean {
  return Boolean(cardId) && COVERED.has(cardId!);
}

/**
 * The balance-pack face for `cardId`, or `undefined` when the card has no wired
 * reprint. Path is DERIVED from the id (dots → dashes), so a file and its card
 * can never drift apart.
 */
export function polishBalanceCardImage(cardId: string | undefined): string | undefined {
  if (!isPolishBalanceCard(cardId)) {
    return undefined;
  }
  return `/assets/polish-balance/${cardId!.replaceAll(".", "-")}.webp`;
}

/**
 * The face to render for `cardId` while the Balance Pack is ON: the balance face
 * when the card has a wired reprint, else the card's own printed face. Never the
 * `-empowered` scan for a covered card — that scan prints the OLD text.
 */
export function polishBalanceFaceImage(cardId: string | undefined): string | undefined {
  return polishBalanceCardImage(cardId) ?? (cardId ? cardLibrary[cardId]?.assets?.cardImage : undefined);
}
