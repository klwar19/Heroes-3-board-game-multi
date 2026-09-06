/**
 * Unit Experience — the ONE display derivation every combat-unit card view
 * shares (the board's inspector, the card zoom).
 *
 * PURE PRESENTATION over PUBLIC state: `CombatUnitState.unitExperience` and
 * `unitRank` are never redacted (`player-view` has no reference to them), so an
 * ENEMY PvP card and a neutral guard read exactly like an own card. Nothing
 * here touches an engine rule and nothing here dispatches.
 *
 * It adapts a combat unit onto the engine's own `armyUnitRankInfo` reader
 * (never a second ladder of its own), so the rank thresholds, the per-rank stat
 * deltas and the per-rank ability names are the ones the engine folded.
 */
import { armyUnitRankInfo, type CombatUnitState } from "@/engine";
import type { UnitRankStatBonus } from "@/data/units/experience-rank-abilities";
import type { UnitTier } from "@/data/factions/types";
import {
  MAX_UNIT_RANK,
  RANK_ABILITY_TRACK_LABELS,
  UNIT_RANK_NAMES,
  UNIT_RANK_THRESHOLDS
} from "@/data/units/experience";
import { unitAbilities } from "@/data/units/abilities";
import { coreUnitDefinitions } from "@/data/factions/units";

/** One rung of the veteran ladder as a card view shows it. */
export type UnitVeterancyRung = {
  rank: number;
  rankName: string;
  /** This unit has already reached this rung (its bonus is folded in). */
  reached: boolean;
  /** Threshold XP for the rung. */
  threshold: number | null;
  /** "+1 A · +1 HP" for a stats rung, the ability name for an ability rung. */
  text: string;
  abilities: { id: string; name: string; text: string }[];
};

export type UnitVeterancyView = {
  rank: number;
  /** "Seasoned" / "Veteran" / "Elite" …; "Recruit" at rank 0. */
  rankName: string;
  experience: number;
  /** XP the NEXT rank needs, or null once the track is maxed. */
  nextThreshold: number | null;
  maxed: boolean;
  /** Which signature/flavour path this unit's rank abilities come from. */
  trackLabel: string;
  ladder: UnitVeterancyRung[];
};

const STAT_LABELS: Array<[keyof UnitRankStatBonus, string]> = [
  ["attack", "A"],
  ["defense", "D"],
  ["health", "HP"],
  ["initiative", "I"]
];

function statGainText(gain: UnitRankStatBonus): string {
  const parts = STAT_LABELS.flatMap(([key, label]) =>
    gain[key] !== 0 ? [`${gain[key] > 0 ? "+" : ""}${gain[key]} ${label}`] : []
  );
  return parts.join(" · ");
}

/**
 * The veterancy view for a combat unit, or null when this card has no
 * veterancy at all — an untrained card (0 XP, rank 0), a unit with no
 * definition to read a track from, and therefore EVERY unit on a table with
 * Unit Experience / Neutral Rank-Up switched off (the engine only ever writes
 * those two fields when a rule folded a rank).
 */
export function combatUnitVeterancy(
  unit: Pick<CombatUnitState, "unitDefId" | "unitExperience" | "unitRank" | "job" | "bankUnit">
): UnitVeterancyView | null {
  if (!unit.unitDefId) {
    return null;
  }
  const experience = Math.max(0, Math.trunc(unit.unitExperience ?? 0));
  const rank = Math.max(0, Math.trunc(unit.unitRank ?? 0));
  if (experience <= 0 && rank <= 0) {
    return null;
  }
  // A combat unit carries no `side` / `companion`; the two are read only by the
  // MGQ job gate, which keys off the definition's faction OR a companion flag.
  // A mirrored `job` is the honest proxy for that flag, and `bankUnit` is the
  // one side value the gate itself looks at.
  const info = armyUnitRankInfo({
    unitDefId: unit.unitDefId,
    side: unit.bankUnit ? "bank" : "few",
    experience,
    job: unit.job,
    companion: unit.job !== undefined
  });
  if (!info) {
    return null;
  }
  const tier: UnitTier | undefined = coreUnitDefinitions[unit.unitDefId]?.tier;
  const thresholds = (tier ? UNIT_RANK_THRESHOLDS[tier] : undefined) ?? UNIT_RANK_THRESHOLDS.gold;
  const ladder: UnitVeterancyRung[] = [];
  for (let r = 1; r <= MAX_UNIT_RANK; r++) {
    const abilityIds = info.abilitiesByRank[r] ?? [];
    const abilityText = abilityIds
      .map((id) => unitAbilities[id]?.name ?? id)
      .filter(Boolean)
      .join(" · ");
    const stats = statGainText(
      info.statGainsByRank[r] ?? { attack: 0, defense: 0, health: 0, initiative: 0 }
    );
    ladder.push({
      rank: r,
      rankName: UNIT_RANK_NAMES[r] ?? `Rank ${r}`,
      reached: info.rank >= r,
      // `armyUnitRankInfo` publishes only the NEXT bar, so each rung's own bar
      // comes from the same shipped table that reader indexed into.
      threshold: thresholds[r - 1] ?? null,
      abilities: abilityIds.flatMap((id) => {
        const ability = unitAbilities[id];
        return ability ? [{ id, name: ability.name, text: ability.text }] : [];
      }),
      text: [stats, abilityText].filter(Boolean).join(" · ") || "—"
    });
  }
  return {
    rank: info.rank,
    rankName: info.rank > 0 ? info.rankName : "Recruit",
    experience: info.experience,
    nextThreshold: info.nextThreshold,
    maxed: info.rank >= MAX_UNIT_RANK,
    trackLabel: RANK_ABILITY_TRACK_LABELS[info.trackId] ?? info.trackId,
    ladder
  };
}

/** "7 / 9 XP" while training, "N XP · max" once the track is full. */
export function veterancyXpLabel(view: UnitVeterancyView): string {
  return view.maxed || view.nextThreshold === null
    ? `${view.experience} XP · max`
    : `${view.experience} / ${view.nextThreshold} XP`;
}
