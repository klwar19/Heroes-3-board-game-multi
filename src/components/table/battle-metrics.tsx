import type { ReactNode } from "react";
import { moraleIcon } from "@/data/assets/homm-assets";
import { assetUrl } from "@/lib/asset-url";

export type BattleMetricKind = "spell" | "crown" | "hand" | "morale" | "movement" | "level";

/**
 * Movement is shown with the SAME 🐎 the adventure-map HUD uses (screen.tsx's
 * `.movePointIcon`), so a hero's movement points read identically on the map, in
 * the combat command dock and in every opponent-info panel — one icon, no drift.
 */
const MOVEMENT_EMOJI = "🐎";

const METRIC_ICONS: Record<Exclude<BattleMetricKind, "morale" | "movement">, string> = {
  spell: "/assets/glyphs/spellpower-hud.svg",
  crown: "/assets/glyphs/crown-expert.svg",
  hand: "/assets/glyphs/hand-hud.svg",
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
  return (
    <span
      className={`battleMetric battleMetric-${kind}${spent ? " limitSpent" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      {kind === "movement" ? (
        <span aria-hidden="true" className="battleMetricIcon battleMetricEmoji">
          {MOVEMENT_EMOJI}
        </span>
      ) : (
        <img
          alt=""
          aria-hidden="true"
          className="battleMetricIcon"
          src={assetUrl(kind === "morale" ? moraleIcon(morale) : METRIC_ICONS[kind])}
        />
      )}
      <span className="battleMetricLabel">{label}</span>
      {" "}
      <b className="battleMetricValue">{value}</b>
    </span>
  );
}
