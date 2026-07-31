import type { ReactNode } from "react";
import { moraleIcon } from "@/data/assets/homm-assets";
import { assetUrl } from "@/lib/asset-url";

export type BattleMetricKind = "spell" | "crown" | "hand" | "morale" | "movement" | "level";

const METRIC_ICONS: Record<Exclude<BattleMetricKind, "morale">, string> = {
  spell: "/assets/glyphs/spellpower-hud.svg",
  crown: "/assets/glyphs/crown-expert.svg",
  hand: "/assets/glyphs/hand-hud.svg",
  movement: "/assets/glyphs/movement.svg",
  level: "/assets/glyphs/experience.svg"
};

export function signedMorale(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function BattleMetric({
  kind,
  label,
  value,
  title,
  morale = 0,
  spent = false,
  className = ""
}: {
  kind: BattleMetricKind;
  label: string;
  value: ReactNode;
  title: string;
  morale?: number;
  spent?: boolean;
  className?: string;
}) {
  const icon = kind === "morale" ? moraleIcon(morale) : METRIC_ICONS[kind];
  return (
    <span
      className={`battleMetric battleMetric-${kind}${spent ? " limitSpent" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      <img alt="" aria-hidden="true" className="battleMetricIcon" src={assetUrl(icon)} />
      <span className="battleMetricLabel">{label}</span>
      {" "}
      <b className="battleMetricValue">{value}</b>
    </span>
  );
}
