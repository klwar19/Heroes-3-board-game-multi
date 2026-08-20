import { cardLibrary } from "@/data/cards/library";

/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * reprinted card FACES.
 *
 * `public/assets/community-balance/<card id with "." → "-">.webp`, 743×1040 (the
 * repo's card-face size). While the house rule is ON, every surface that paints
 * one of these cards' faces shows the community face instead of the classic
 * scan; with the rule OFF nothing here is consulted and the render is
 * byte-identical.
 *
 * THE LIST IS THE CONTRACT (CLAUDE.md #1/#2). A card id lives here ONLY once its
 * NEW printed behaviour is genuinely engine-wired under the rule. A card whose
 * reprint is not implemented keeps its CLASSIC face on purpose: swapping in a
 * face whose printed text the engine does not run would be exactly the
 * "pasted-but-inert text" this repo forbids — the player would read rules that
 * never fire. So this registry doubles as the honest scope marker for the pack.
 *
 * PRECEDENCE with the Polish Balance Pack: when BOTH `polish-card-balance` and
 * `community-card-balance` are on, the COMMUNITY reprint and face WIN for a card
 * covered by both (see `resolveCardFaceImage` in
 * `src/components/table/polish-balance-art.tsx` and `balanceCardLibrary` /
 * `balanceCardForDisplay` in `src/engine/community-balance-cards.ts`).
 *
 * The face also wins over the printed `-empowered` scan (see
 * `communityBalanceFaceImage`): that scan prints the OLD rules text, so an
 * Empowered holder must still read the NEW card. The Empowered cue stays the
 * gold ring/badge the render surfaces already draw on top.
 *
 * STEP 1 (scaffolding): both registries below are EMPTY on purpose — the pack's
 * card content lands in later steps. Nothing swaps yet, on or off.
 */

/**
 * Every card whose Community-Balance reprint is WIRED. Empty until the first
 * content step lands a reprint whose NEW text the engine really runs; see the
 * `community-card-balance` registry entry in `house-rules.ts` for the per-card
 * summary and `community-balance-art.test.ts` for the on-disk + wiring pins.
 */
export const COMMUNITY_BALANCE_CARD_IDS: readonly string[] = [
  // ---- Abilities (all TWELVE of the sheet's ability cards are wired) --------
  "ability.artillery",
  "ability.ballistics",
  "ability.estates",
  "ability.first_aid",
  "ability.intelligence",
  "ability.leadership",
  "ability.luck",
  "ability.mysticism",
  "ability.necromancy",
  "ability.scouting",
  "ability.tactics",
  "ability.wisdom"
] as const;

/**
 * Community-Balance cards that are DELIBERATELY not reprinted: their new printed
 * text is a restructure the engine does not run, so they keep the classic face.
 * An explicit, reviewable registry rather than silence (the
 * `DISPLAY_ONLY_ABILITIES` pattern) — moving an id from here to
 * `COMMUNITY_BALANCE_CARD_IDS` is the conscious "it is wired now" step.
 */
export const COMMUNITY_BALANCE_NOT_IMPLEMENTED: Record<string, string> = {
  // EMPTY for the ABILITIES family: all twelve sheet abilities are wired. The
  // last two (Necromancy's Recruit-or-Reinforce dwelling gate and Intelligence's
  // "play a spell from your discard pile") landed with the `anySpell` /
  // `castEnablerMode` cast seam and the `RECRUIT_FEW_AT_COST` visit step. Keep
  // this registry so a future family's unwired reprint is a conscious entry.
};

const COVERED = new Set<string>(COMMUNITY_BALANCE_CARD_IDS);

/** Whether `cardId` has a wired Community-Balance reprint. */
export function isCommunityBalanceCard(cardId: string | undefined): boolean {
  return Boolean(cardId) && COVERED.has(cardId!);
}

/**
 * The community-balance face for `cardId`, or `undefined` when the card has no
 * wired reprint. Path is DERIVED from the id (dots → dashes), so a file and its
 * card can never drift apart.
 */
export function communityBalanceCardImage(cardId: string | undefined): string | undefined {
  if (!isCommunityBalanceCard(cardId)) {
    return undefined;
  }
  return `/assets/community-balance/${cardId!.replaceAll(".", "-")}.webp`;
}

/**
 * Ability card ids that ship a DEDICATED Community-Balance EMPOWERED face, drawn
 * when the card is shown in its empowered display state
 * (`player.empoweredAbilities`) while the pack is on. These have no distinct
 * empowered card id — "empowered" is a per-owner display state over the same id
 * — so they need this explicit list (unlike a real distinct library card such as
 * `stat.knowledge.empowered`, whose face `communityBalanceCardImage` derives).
 */
export const COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS: readonly string[] = [
  // The sheet's Empowered-Abilities tab ships a dedicated Empowered face for
  // every reprinted ability EXCEPT Mysticism (which has no Expert side at all,
  // so no Empowered printing exists).
  "ability.artillery",
  "ability.ballistics",
  "ability.estates",
  "ability.first_aid",
  "ability.intelligence",
  "ability.leadership",
  "ability.luck",
  "ability.necromancy",
  "ability.scouting",
  "ability.tactics",
  "ability.wisdom"
] as const;

const EMPOWERED_COVERED = new Set<string>(COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS);

/** File basenames (no extension) of every empowered community face shipped on disk. */
export const COMMUNITY_BALANCE_EMPOWERED_FACE_NAMES = COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS.map(
  (id) => `${id.replaceAll(".", "-")}-empowered`
);

/**
 * The dedicated empowered community face for `cardId`, or `undefined` when the
 * card has no such variant (fall back to the plain community face). Path DERIVED
 * from the id so a file and its card can never drift.
 */
export function communityBalanceEmpoweredCardImage(cardId: string | undefined): string | undefined {
  if (!cardId || !EMPOWERED_COVERED.has(cardId)) {
    return undefined;
  }
  return `/assets/community-balance/${cardId.replaceAll(".", "-")}-empowered.webp`;
}

/**
 * The face to render for `cardId` while the Community Balance pack is ON: the
 * community face when the card has a wired reprint, else the card's own printed
 * face. Never the `-empowered` scan for a covered card — that scan prints the
 * OLD text.
 */
export function communityBalanceFaceImage(cardId: string | undefined): string | undefined {
  return communityBalanceCardImage(cardId) ?? (cardId ? cardLibrary[cardId]?.assets?.cardImage : undefined);
}
