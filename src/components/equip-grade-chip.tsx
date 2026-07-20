/**
 * A tiny grade badge shared by every equipment surface (§3.13 UI polish): the
 * hero paper-doll slots + bag rows, the outfitter shop rows, and the WOG
 * commander-artifact window / stats panel. It tints a Roman numeral I/II/III
 * with the app's EXISTING tier hues (bronze / silver / gold — the `.tierDot`
 * palette) via ONE shared class family in globals.css (`.equipGradeChip
 * .gradeI/.gradeII/.gradeIII`). No new colours are invented.
 *
 * Equipment grades I/II/III map 1:1 to the Artifact tiers minor/major/relic, so
 * a commander artifact (which carries a `tier`) renders the same chip via
 * `tierToGrade`.
 */
import type { EquipmentGrade } from "@/data/anime/equipment";

/** Artifact tier → equipment grade (minor → I, major → II, relic → III). */
export function tierToGrade(tier: "minor" | "major" | "relic"): EquipmentGrade {
  return tier === "minor" ? "I" : tier === "major" ? "II" : "III";
}

export function EquipGradeChip({
  grade,
  className,
  title
}: {
  grade: EquipmentGrade;
  className?: string;
  /** Override the default "Grade X" tooltip (e.g. to name the tier). */
  title?: string;
}) {
  return (
    <span
      aria-label={`Grade ${grade}`}
      className={`equipGradeChip grade${grade}${className ? ` ${className}` : ""}`}
      title={title ?? `Grade ${grade}`}
    >
      {grade}
    </span>
  );
}
