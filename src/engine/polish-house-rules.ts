/**
 * Pure helpers for the additional Polish house-rule variants:
 * reduced starting bonus, Rule 111, reduced surrender, random artifacts, Wait.
 *
 * Every function here is gated by `houseRuleEnabled` at the call site — this
 * module only encodes the numbers and band tables so behaviour stays testable
 * without a full game state.
 */

import type { ArtifactDeckAccess, GameDifficulty, VisitStep } from "./state";

// ---------------------------------------------------------------------------
// Reduced starting bonus
// ---------------------------------------------------------------------------

/** Visit steps for the reduced Polish starting bonus (Easy/Normal/Hard). */
export function polishReducedStartingBonusVisitSteps(): VisitStep[] {
  return [
    {
      type: "CHOOSE_ONE",
      prompt: "Starting bonus (Reduced)",
      options: [
        {
          label: "Draw 2 Minor Artifacts and choose 1 (no discard top)",
          steps: [{ type: "DRAW_CHOOSE_MINOR_ARTIFACTS", drawCount: 2, keepCount: 1 }]
        },
        {
          // Polish rule: you do NOT pick a resource — roll the Resource die, but
          // reroll any "high value" face (6 gold / 4 building materials / 2
          // valuables) so the grant is random yet capped to the low faces.
          label: "Roll for resources (random, no high value)",
          steps: [{ type: "ROLL_RESOURCE_DICE", count: 1, capHighValues: true }]
        }
      ]
    }
  ];
}

export function polishReducedStartingBonusDescription(_difficulty: GameDifficulty): string {
  return "Draw 2 Minor Artifacts and choose 1 — OR — roll for resources (random, never 6 gold / 4 building materials / 2 valuables).";
}

// ---------------------------------------------------------------------------
// Reduced surrender cost
// ---------------------------------------------------------------------------

export const POLISH_SURRENDER_BASE_COST = 10;
export const POLISH_SURRENDER_REDUCTION_PER_ROUND = 3;
export const POLISH_SURRENDER_MIN_COST = 1;

/**
 * Gold toll to surrender under the reduced-surrender house rule.
 * Round 1 (and prep, before any unit acts) costs the base 10; after each
 * completed combat round the cost drops by 3, floored at 1.
 *
 * `combatRound` is the combat's current `round` field (1-based). When surrender
 * is still allowed in prep before round 1 starts, pass 1.
 */
export function polishSurrenderGoldCost(combatRound: number): number {
  const completedRounds = Math.max(0, combatRound - 1);
  return Math.max(
    POLISH_SURRENDER_MIN_COST,
    POLISH_SURRENDER_BASE_COST - completedRounds * POLISH_SURRENDER_REDUCTION_PER_ROUND
  );
}

// ---------------------------------------------------------------------------
// Random Artifacts — tier bands + die upgrade
// ---------------------------------------------------------------------------

/** Tile / hero-level band for the Polish Random Artifacts table. */
export type PolishArtifactBand = "starting" | "far" | "near" | "center";

/**
 * Map a map-tile group to the Random Artifacts band.
 * Sea / subterranean tiles use "near" as a conservative mid-game reading.
 */
export function polishArtifactBandFromTileGroup(
  group: string | null | undefined
): PolishArtifactBand {
  switch (group) {
    case "starting":
      return "starting";
    case "far":
      return "far";
    case "near":
    case "subterranean":
    case "sea":
      return "near";
    case "center":
      return "center";
    default:
      return "starting";
  }
}

/** Map hero experience level to the Random Artifacts band (merchant / card path). */
export function polishArtifactBandFromHeroLevel(level: number): PolishArtifactBand {
  if (level >= 6) return "center";
  if (level >= 4) return "near";
  if (level >= 2) return "far";
  return "starting";
}

/**
 * Base access (before the die roll) per the Polish sheet:
 *   Starting / Far  → Minor only
 *   Near / Central  → Minor + Major (no Relic by default)
 */
export function polishArtifactBaseAccess(band: PolishArtifactBand): ArtifactDeckAccess {
  const major = band === "near" || band === "center";
  return { minor: true, major, relic: false };
}

/**
 * Apply the Attack-die roll to the band's base access.
 *
 * Sheet:
 *  - Starting / Far: +1 unlocks Major
 *  - Near: +1 unlocks Relic
 *  - Central: 0 or +1 unlocks Relic; −1 keeps Relic locked
 *
 * A +1 always upgrades one class above the base (Minor→Major, Major→Relic).
 * On the center band, 0 also unlocks Relic (and −1 never does).
 */
export function polishArtifactAccessAfterRoll(
  band: PolishArtifactBand,
  dieFace: number
): ArtifactDeckAccess {
  const base = polishArtifactBaseAccess(band);
  const access: ArtifactDeckAccess = { ...base };

  if (band === "center") {
    // Central / VI–VII: Relic on 0 or +1 only.
    access.relic = dieFace === 0 || dieFace === 1;
    return access;
  }

  if (dieFace === 1) {
    if (!access.major) {
      access.major = true;
    } else {
      access.relic = true;
    }
  }

  return access;
}

// ---------------------------------------------------------------------------
// Polish Pandora Search
// ---------------------------------------------------------------------------

/**
 * Base Pandora Search size for the Polish house rule (before any die upgrade):
 *   IV–V (near)  → Search (2)
 *   VI–VII (center) → Search (3)
 * Other bands (starting/far/sea) use Search (2) as the near-floor reading.
 */
export function polishPandoraBaseSearchCount(band: PolishArtifactBand): number {
  return band === "center" ? 3 : 2;
}

/**
 * Final Pandora Search size after an optional Random-Artifacts die face.
 * A "+1" face raises the base by 1; every other face leaves the base alone.
 */
export function polishPandoraSearchCount(band: PolishArtifactBand, dieFace: number | null | undefined): number {
  const base = polishPandoraBaseSearchCount(band);
  return dieFace === 1 ? base + 1 : base;
}

// ---------------------------------------------------------------------------
// Wait tokens
// ---------------------------------------------------------------------------

/** Lowest free Wait-token number among living units (1-based). */
export function nextWaitTokenNumber(existingTokens: Iterable<number | undefined>): number {
  const used = new Set<number>();
  for (const token of existingTokens) {
    if (typeof token === "number" && token >= 1) {
      used.add(token);
    }
  }
  let n = 1;
  while (used.has(n)) {
    n += 1;
  }
  return n;
}
