/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * reprinted UNIT-SIDE faces.
 *
 * A LEAF module on purpose: it imports nothing, so the ENGINE
 * (`src/engine/ruleset.ts`'s `applyUnitSideRules`) can stamp the community face
 * onto an overridden unit side without dragging the whole card library into the
 * engine's import graph. `src/data/cards/community-balance-art.ts` re-exports
 * every symbol here, so the pack's registries still read as one contract.
 *
 * A unit side is NOT a library card (no card id — it lives on
 * `coreUnitDefinitions[unitDefId][side]`), which is why it needs its own
 * registry and resolver instead of `COMMUNITY_BALANCE_CARD_IDS`.
 *
 * THE LIST IS THE CONTRACT, exactly as for the cards: a side is listed here
 * ONLY when the community sheet changes it AND the engine really runs the
 * change. The four listed sides are the whole Units tab — Halberdiers PACK (its
 * Parry loses the discard cost), Marksmen PACK (2 → 3 health) and Griffins FEW +
 * PACK (0 → 1 defense). Every OTHER side of those same units (Halberdiers Few,
 * Marksmen Few, the neutral sides) is unchanged and deliberately keeps its
 * printed scan.
 */

export const COMMUNITY_BALANCE_UNIT_FACES: readonly { unitDefId: string; side: "few" | "pack" | "neutral" }[] = [
  { unitDefId: "castle.halberdiers", side: "pack" },
  { unitDefId: "castle.marksmen", side: "pack" },
  { unitDefId: "castle.griffins", side: "few" },
  { unitDefId: "castle.griffins", side: "pack" }
] as const;

const unitFaceKey = (unitDefId: string, side: string) => `${unitDefId}#${side}`;

const UNIT_FACES_COVERED = new Set<string>(
  COMMUNITY_BALANCE_UNIT_FACES.map((entry) => unitFaceKey(entry.unitDefId, entry.side))
);

/** The committed basename (no extension) of a reprinted unit side's face. */
export function communityBalanceUnitFaceName(unitDefId: string, side: string): string {
  return `unit-${unitDefId.replaceAll(".", "-")}-${side}`;
}

/** File basenames of every unit face shipped on disk (the directory-listing contract). */
export const COMMUNITY_BALANCE_UNIT_FACE_NAMES = COMMUNITY_BALANCE_UNIT_FACES.map((entry) =>
  communityBalanceUnitFaceName(entry.unitDefId, entry.side)
);

/**
 * The community-balance face for a UNIT SIDE, or `undefined` when that side has
 * no wired reprint (then the caller keeps the printed `side.cardImage`). Path is
 * DERIVED from the key, so a file and the side it belongs to cannot drift.
 */
export function communityBalanceUnitFaceImage(
  unitDefId: string | undefined,
  side: string | undefined
): string | undefined {
  if (!unitDefId || !side || !UNIT_FACES_COVERED.has(unitFaceKey(unitDefId, side))) {
    return undefined;
  }
  return `/assets/community-balance/${communityBalanceUnitFaceName(unitDefId, side)}.webp`;
}
