"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";

import { assetUrl } from "@/lib/asset-url";
import { playLibrarySound } from "@/lib/sound";
import {
  COMMANDER_COMBOS,
  COMMANDER_DEFENSE_TOKEN_GRADE,
  COMMANDER_GRADE_VALUES,
  COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION,
  COMMANDER_MASTERY_MIN_HERO_LEVEL,
  COMMANDER_STAT_ICON,
  COMMANDER_STAT_KEYS,
  COMMANDER_STAT_LABELS,
  commanderCastTierIndex,
  commanderComboSiteIcon,
  commanderComboUnlocked,
  commanderDefinitions,
  commanderDoublePointLevels,
  commanderMagicImmuneToOngoing,
  commanderReviveCost,
  commanderStatValue,
  commanderUnlockedCombos,
  type CommanderGrade,
  type CommanderGrades,
  type CommanderSlug,
  type CommanderStatKey
} from "@/data/commanders";
import { COMMANDER_ARTIFACT_SPECS } from "@/data/wog/commander-artifacts";
import { EquipGradeChip, tierToGrade } from "@/components/equip-grade-chip";
import type { CommanderArtifactSlot } from "@/engine/state";

// ---------------------------------------------------------------------------
// CommanderCard — renders a WOG Commander card (frame + art from
// public/assets/units-commander-<slug>.webp) with every number DYNAMIC:
//  - the four stat wells (Attack / Defense / Health / Speed) show the REAL
//    stat numbers read from the grades (or the live combat unit's values);
//  - bonus Damage and command Power ride as small badges by the art window
//    (only once they are above 0 — a fresh commander shows a clean face);
//  - every UNLOCKED combination skill shows as a spell-icon chip on the face;
//  - the panel below lists the six grade tracks (grade 0..3 pips), the
//    command ability's Power tiers (current tier highlighted), the specialty,
//    and all 15 combination skills with their unlock state.
// Live mode: pass `grades`/`level`/`dead`/`gradePoints` from engine state
// plus `onGradeUp`/`onRevive` callbacks. Preview mode: `editable` keeps local
// state so every configuration can be inspected at /commander-preview.
// CommanderCardFace alone renders in the combat inspect/zoom panels (pass
// `statValues` with the live unit's numbers so buffs/stance are visible).
// ---------------------------------------------------------------------------

const STAT_WELLS: { key: "attack" | "defense" | "health" | "speed"; topPct: number }[] = [
  { key: "attack", topPct: 25.0 },
  { key: "defense", topPct: 39.9 },
  { key: "health", topPct: 53.85 },
  { key: "speed", topPct: 68.3 }
];
const STAT_LEFT_PCT = 15.75;

const GRADES_ZERO: CommanderGrades = { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 };

export const COMMANDER_STAT_ABBR: Record<CommanderStatKey, string> = {
  attack: "ATK",
  defense: "DEF",
  health: "HP",
  damage: "DMG",
  magic: "MAG",
  speed: "SPD"
};

function clampGrade(raw: number | undefined): CommanderGrade {
  return raw !== undefined && raw >= 3 ? 3 : raw === 2 ? 2 : raw === 1 ? 1 : 0;
}

function normalizeGrades(grades?: Partial<Record<CommanderStatKey, number>>): CommanderGrades {
  const out = { ...GRADES_ZERO };
  for (const key of COMMANDER_STAT_KEYS) {
    out[key] = clampGrade(grades?.[key]);
  }
  return out;
}

const GOLD = "#f4d774";
const PALE = "#fff4c8";
const DIM = "#b9a988";
const OUTLINE =
  "0 0 2px #140c07, 0 0 2px #140c07, 1px 1px 0 #140c07, -1px 1px 0 #140c07, 1px -1px 0 #140c07, -1px -1px 0 #140c07";

type CommanderCardLayout = "classic" | "azur-lane" | "wuxia";

/**
 * Belfast uses commissioned card art with its own title banner. Every other
 * commander, including the two cultivation commanders, is composited into the
 * real golden commander frame and therefore uses the classic dynamic overlay.
 */
const THEMED_CARD_STYLES: Record<Exclude<CommanderCardLayout, "classic">, {
  panel: string;
  panelStrong: string;
  border: string;
  accent: string;
  text: string;
}> = {
  "azur-lane": {
    panel: "rgba(6, 24, 53, 0.94)",
    panelStrong: "rgba(10, 42, 84, 0.98)",
    border: "#6fb3e8",
    accent: "#f4d774",
    text: "#eff7ff"
  },
  wuxia: {
    panel: "rgba(38, 10, 17, 0.95)",
    panelStrong: "rgba(78, 17, 29, 0.98)",
    border: "#c66b4e",
    accent: "#e6b866",
    text: "#f8e2c1"
  }
};

function commanderCardLayout(slug: CommanderSlug): CommanderCardLayout {
  if (slug === "belfast") return "azur-lane";
  return "classic";
}

/** Roman grade tag for tooltips/labels (grade 0 = base, no numeral). */
function gradeNumeral(grade: CommanderGrade): string {
  return grade === 0 ? "base" : ["", "I", "II", "III"][grade];
}

function ThemedCommanderCardOverlays({
  slug,
  grades,
  level,
  stance,
  statValues
}: {
  slug: CommanderSlug;
  grades: CommanderGrades;
  level?: number;
  stance?: "attack" | "defense";
  statValues?: { attack: number; defense: number; health: number; speed: number };
}) {
  const def = commanderDefinitions[slug];
  const layout = commanderCardLayout(slug);
  if (!def || layout === "classic") return null;

  const theme = THEMED_CARD_STYLES[layout];
  const power = commanderStatValue("magic", grades.magic);
  const might = commanderStatValue("damage", grades.damage);
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic];
  const tierIndex = commanderCastTierIndex(power);
  const combosUnlocked = commanderUnlockedCombos(grades);
  const hasStance = def.specialty.id === "superior-combat";
  const shownStance = stance ?? "attack";
  const statKeys = ["attack", "defense", "health", "speed"] as const;
  const themedPanel: CSSProperties = {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    boxShadow: "0 2px 7px rgba(0, 0, 0, 0.7)",
    color: theme.text
  };

  return (
    <div
      aria-label={`${def.name} themed commander information`}
      data-card-layout={layout}
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
    >
      {/* The commissioned art already prints the title banner. The rail below
          carries the same live stat information as the classic card without
          placing numbers on top of the character. */}
      <div
        className="themedCommanderStats"
        style={{
          ...themedPanel,
          position: "absolute",
          left: "4%",
          top: "21%",
          bottom: "23%",
          width: "23%",
          borderRadius: "1.2cqw",
          padding: "1.5cqw",
          display: "grid",
          gridTemplateRows: "auto repeat(4, 1fr) auto",
          gap: "0.7cqw",
          boxSizing: "border-box"
        }}
      >
        <div style={{ color: theme.accent, fontSize: "2cqw", fontWeight: 700, letterSpacing: "0.12cqw", textAlign: "center" }}>
          COMMANDER
          {level !== undefined ? <span style={{ display: "block", color: theme.text, fontSize: "1.8cqw", letterSpacing: 0 }}>Lv {level}</span> : null}
        </div>
        {statKeys.map((key) => {
          const stanceBonus = !statValues && hasStance && key === shownStance ? 1 : 0;
          const value = statValues ? statValues[key] : commanderStatValue(key, grades[key]) + stanceBonus;
          const boosted = stanceBonus > 0 || (statValues && value > commanderStatValue(key, grades[key]));
          return (
            <div
              key={key}
              title={`${COMMANDER_STAT_LABELS[key]} ${value}`}
              style={{
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5cqw",
                borderTop: "1px solid rgba(255, 255, 255, 0.2)",
                paddingTop: "0.5cqw"
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "1.9cqw", opacity: 0.9 }}>
                {COMMANDER_STAT_ABBR[key]}
              </span>
              <b style={{ color: boosted ? "#9be29b" : theme.accent, fontSize: "4.2cqw", lineHeight: 1 }}>{value}</b>
            </div>
          );
        })}
        {might > 0 || grades.magic > 0 ? (
          <div style={{ display: "grid", gap: "0.45cqw", fontSize: "1.7cqw", lineHeight: 1.1, textAlign: "center" }}>
            {might > 0 ? <span style={{ color: theme.accent }}>Might +{might} die{might === 1 ? "" : "s"}</span> : null}
            {grades.magic > 0 ? <span style={{ color: theme.text }}>Power {power}{spellWard > 0 ? ` · −${spellWard} spell` : ""}</span> : null}
          </div>
        ) : null}
      </div>

      {combosUnlocked.length > 0 ? (
        <div
          className="themedCommanderCombos"
          style={{
            ...themedPanel,
            background: theme.panelStrong,
            position: "absolute",
            left: "30%",
            right: "4%",
            top: "21%",
            minHeight: "10%",
            maxHeight: "16%",
            borderRadius: "1.2cqw",
            padding: "1cqw",
            display: "flex",
            flexWrap: "wrap",
            alignContent: "flex-start",
            justifyContent: "flex-end",
            gap: "0.8cqw",
            overflow: "hidden",
            boxSizing: "border-box"
          }}
        >
          {combosUnlocked.map((combo) => (
            <img
              alt={combo.name}
              key={combo.id}
              src={assetUrl(combo.icon)}
              title={`${combo.name} (${COMMANDER_STAT_LABELS[combo.requires[0]]} + ${COMMANDER_STAT_LABELS[combo.requires[1]]}) · ${combo.text}`}
              style={{
                width: "5.5cqw",
                height: "5.5cqw",
                objectFit: "cover",
                borderRadius: "50%",
                border: `0.35cqw solid ${theme.accent}`,
                boxShadow: "0 0 5px rgba(0, 0, 0, 0.8)",
                background: "#100a05"
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        className="themedCommanderAbility"
        style={{
          ...themedPanel,
          position: "absolute",
          left: "4%",
          right: "4%",
          bottom: "4%",
          minHeight: "16%",
          borderRadius: "1.3cqw",
          padding: "1.6cqw 2cqw",
          display: "flex",
          alignItems: "center",
          gap: "1.6cqw",
          boxSizing: "border-box"
        }}
      >
        <img
          alt=""
          src={assetUrl(def.cast.icon)}
          style={{
            width: "8cqw",
            height: "8cqw",
            flexShrink: 0,
            objectFit: "cover",
            borderRadius: "1cqw",
            border: `1px solid ${theme.border}`,
            background: "#100a05"
          }}
        />
        <span style={{ minWidth: 0, color: theme.text, textAlign: "left", lineHeight: 1.18 }}>
          <b style={{ display: "block", color: theme.accent, fontSize: "2.8cqw", letterSpacing: "0.12cqw" }}>
            {def.cast.name} · once per combat round
          </b>
          <span style={{ display: "block", marginTop: "0.6cqw", fontSize: "2.15cqw" }}>{def.cast.tierText[tierIndex]}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * The commander card FACE only: frame art + every dynamic overlay. Reused by
 * the combat inspect/zoom panels — pass `statValues` (the live combat unit's
 * Attack/Defense/Health/Initiative) to show exactly what fights, otherwise
 * the numbers derive from the grades (+ the Superior Combat stance).
 */
export function CommanderCardFace({
  slug,
  grades: gradesProp,
  level,
  dead = false,
  stance,
  statValues,
  className,
  style
}: {
  slug: CommanderSlug;
  grades?: Partial<Record<CommanderStatKey, number>>;
  /** Hero level badge; omit to hide it (e.g. a viewer without hero state). */
  level?: number;
  dead?: boolean;
  /** Superior Combat commanders: the current +1 Attack/Defense stance. */
  stance?: "attack" | "defense";
  /** Live combat unit values (already include stance/effects). */
  statValues?: { attack: number; defense: number; health: number; speed: number };
  className?: string;
  style?: CSSProperties;
}) {
  const def = commanderDefinitions[slug];
  const grades = normalizeGrades(gradesProp);
  const power = commanderStatValue("magic", grades.magic);
  const tierIndex = commanderCastTierIndex(power);
  const might = commanderStatValue("damage", grades.damage);
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic];
  const combosUnlocked = commanderUnlockedCombos(grades);
  const hasStance = def?.specialty.id === "superior-combat";
  const shownStance: "attack" | "defense" = stance ?? "attack";
  const cardLayout = commanderCardLayout(slug);

  if (!def) {
    return null;
  }

  const badgeStyle: CSSProperties = {
    padding: "0.5cqw 1.5cqw",
    borderRadius: "1.4cqw",
    background: "rgba(16, 10, 5, 0.82)",
    border: "1px solid #a8843f",
    color: PALE,
    fontSize: "2.7cqw",
    fontWeight: 700,
    letterSpacing: "0.1cqw",
    lineHeight: 1.25,
    pointerEvents: "auto"
  };

  return (
    <div
      className={className}
      data-card-layout={cardLayout}
      style={{ containerType: "inline-size", position: "relative", width: "100%", fontFamily: 'Georgia, "Times New Roman", serif', ...style }}
    >
      <img
        alt={`${def.name} — ${def.faction} Commander`}
        src={assetUrl(def.cardImage)}
        style={{ width: "100%", display: "block", borderRadius: "2.5cqw", filter: dead ? "grayscale(0.9) brightness(0.6)" : undefined }}
      />

      {/* Animated rainbow frame spark: a rotating rainbow ring with a bright
          travelling spark, tracing the card border. Hidden for a fallen
          commander (its frame is greyed out). Purely decorative — pointer-events
          off so it never eats clicks. */}
      {!dead ? <div className="commanderRainbowFrame" aria-hidden="true" data-testid="commander-rainbow-spark" /> : null}

      {cardLayout === "classic" ? (
        <>
          {/* Name + faction tag (overlaid on the classic blank banner). */}
      <span
        style={{
          position: "absolute",
          left: "51.5%",
          top: "9.2%",
          transform: "translate(-50%, -50%)",
          width: "68%",
          textAlign: "center",
          fontSize: def.name.length > 13 ? "5cqw" : "6cqw",
          fontWeight: 700,
          color: "#f6e7a6",
          textShadow: "0 0 2px #170f09, 1px 1px 0 #170f09, -1px 1px 0 #170f09, 1px -1px 0 #170f09, -1px -1px 0 #170f09",
          pointerEvents: "none",
          lineHeight: 1
        }}
      >
        {def.name}
      </span>
      <span
        style={{
          position: "absolute",
          left: "51.5%",
          top: "12.7%",
          transform: "translate(-50%, -50%)",
          fontSize: "2.3cqw",
          fontWeight: 700,
          letterSpacing: "0.35cqw",
          color: "#e6c56a",
          textShadow: "0 0 2px #170f09, 1px 1px 0 #170f09",
          pointerEvents: "none"
        }}
      >
        {def.faction.toUpperCase()} COMMANDER
      </span>

      {/* The four stat wells: the ACTUAL Attack / Defense / Health / Speed
          numbers. Live combat values win; otherwise grades (+ stance). */}
      {STAT_WELLS.map(({ key, topPct }) => {
        const stanceBonus = !statValues && hasStance && key === shownStance ? 1 : 0;
        const value = statValues ? statValues[key] : commanderStatValue(key, grades[key]) + stanceBonus;
        const boosted = stanceBonus > 0 || (statValues && value > commanderStatValue(key, grades[key]));
        return (
          <span
            key={key}
            title={`${COMMANDER_STAT_LABELS[key]} ${value} (grade ${gradeNumeral(grades[key])}${stanceBonus ? ", +1 stance" : ""})`}
            style={{
              position: "absolute",
              left: `${STAT_LEFT_PCT}%`,
              top: `${topPct}%`,
              transform: "translate(-50%, -50%)",
              fontSize: "4.6cqw",
              fontWeight: 700,
              color: boosted ? "#9be29b" : grades[key] >= 3 ? GOLD : PALE,
              textShadow: OUTLINE,
              pointerEvents: "none",
              lineHeight: 1
            }}
          >
            {value}
          </span>
        );
      })}

      {/* Level badge (top-left of the art window). */}
      {level !== undefined ? (
        <span
          style={{
            position: "absolute",
            left: "27.5%",
            top: "17%",
            transform: "translate(-50%, -50%)",
            fontSize: "3cqw",
            fontWeight: 700,
            color: GOLD,
            textShadow: "0 0 2px #000, 1px 1px 0 #000",
            pointerEvents: "none"
          }}
        >
          Lv {level}
        </span>
      ) : null}

      {/* Bonus Damage / Magic badges (top-right of the art window), shown only
          once the grade buys something — a fresh commander stays clean. */}
      <span style={{ position: "absolute", right: "6%", top: "15.2%", display: "flex", gap: "1cqw" }}>
        {might > 0 ? (
          <span
            style={badgeStyle}
            title={`Damage grade ${gradeNumeral(grades.damage)} (Might): rolls ${might} extra attack ${might === 1 ? "die" : "dice"} on each attack — every "+1" raises the Attack, at most one "−1" counts.`}
          >
            🎲 +{might}
          </span>
        ) : null}
        {grades.magic > 0 ? (
          <span
            style={badgeStyle}
            title={`Magic grade ${gradeNumeral(grades.magic)}: command Power ${power}${spellWard > 0 ? `, takes ${spellWard} less Spell damage` : ""}, immune to ongoing effects.`}
          >
            ✦ {power > 0 ? `Pow ${power}` : "🛡"}
          </span>
        ) : null}
      </span>

      {/* Unlocked combination skills: spell-icon chips on the art window. */}
      {combosUnlocked.length > 0 ? (
        <span
          style={{
            position: "absolute",
            left: "52%",
            top: "62.8%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "1.4cqw"
          }}
        >
          {combosUnlocked.map((combo) => (
            <img
              alt={combo.name}
              key={combo.id}
              src={assetUrl(combo.icon)}
              title={`${combo.name} (${COMMANDER_STAT_LABELS[combo.requires[0]]} + ${COMMANDER_STAT_LABELS[combo.requires[1]]}) — ${combo.text}`}
              style={{
                width: "8.4cqw",
                height: "8.4cqw",
                objectFit: "cover",
                borderRadius: "50%",
                border: "0.45cqw solid #d8b25c",
                boxShadow: "0 0 6px rgba(0, 0, 0, 0.8)",
                background: "#100a05"
              }}
            />
          ))}
        </span>
      ) : null}

      {/* Command ability line in the bottom leather panel. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "86.5%",
          transform: "translate(-50%, -50%)",
          width: "82%",
          display: "flex",
          alignItems: "center",
          gap: "2cqw",
          pointerEvents: "none",
          color: "#fff1c2"
        }}
      >
        <img
          alt=""
          src={assetUrl(def.cast.icon)}
          style={{
            width: "10cqw",
            height: "10cqw",
            objectFit: "cover",
            borderRadius: "1.4cqw",
            border: "1px solid #a8843f",
            boxShadow: "0 0 5px rgba(0, 0, 0, 0.7)",
            background: "#100a05",
            flexShrink: 0
          }}
        />
        <span style={{ textAlign: "left", lineHeight: 1.25 }}>
          <b style={{ color: "#e6c56a", fontSize: "2.8cqw", letterSpacing: "0.2cqw" }}>
            {def.cast.name} · once per combat round
          </b>
          <br />
          <span style={{ fontSize: "2.45cqw", textShadow: "1px 1px 0 #160e08" }}>{def.cast.tierText[tierIndex]}</span>
        </span>
      </div>
        </>
      ) : (
        <ThemedCommanderCardOverlays
          slug={slug}
          grades={grades}
          level={level}
          stance={hasStance ? shownStance : undefined}
          statValues={statValues}
        />
      )}

      {/* Fallen overlay. */}
      {dead ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none"
          }}
        >
          <span
            style={{
              transform: "rotate(-14deg)",
              padding: "1.2cqw 4cqw",
              border: "0.6cqw solid #a33",
              borderRadius: "1.5cqw",
              color: "#ff8d7a",
              background: "rgba(20, 6, 4, 0.72)",
              fontSize: "6cqw",
              fontWeight: 700,
              letterSpacing: "0.6cqw",
              textShadow: "0 0 4px #000"
            }}
          >
            FALLEN
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommanderStatsPanel — the "pro" read-only stats view used in the combat
// inspect / zoom (the user asked for the authentic WoG comm3 symbols here, NOT
// on the card face). It surfaces all SIX stats with the grade bonus spelled
// out, the Damage DICE mechanic, the Magic Power ladder (current tier + spell
// ward highlighted), the command ability, the specialty, and every combination
// skill with its site symbol + full explanation.
// ---------------------------------------------------------------------------

const PANEL_BG = "#191308";
const PANEL_BORDER = "#8d683c";
const ROW_BG = "#221a0f";

/** Damage grade shows the DICE count, not a stat number; the rest show a value. */
function statMainValue(
  key: CommanderStatKey,
  grades: CommanderGrades,
  statValues: { attack: number; defense: number; health: number; speed: number } | undefined,
  stanceBonus: number
): number {
  if (key === "damage") {
    return commanderStatValue("damage", grades.damage);
  }
  if (key === "magic") {
    return commanderStatValue("magic", grades.magic);
  }
  if (statValues && (key === "attack" || key === "defense" || key === "health" || key === "speed")) {
    return statValues[key];
  }
  return commanderStatValue(key, grades[key]) + stanceBonus;
}

function CommanderStatIcon({ statKey, size = 30 }: { statKey: CommanderStatKey; size?: number }) {
  return (
    <img
      alt={COMMANDER_STAT_LABELS[statKey]}
      src={assetUrl(COMMANDER_STAT_ICON[statKey])}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))"
      }}
    />
  );
}

export function CommanderStatsPanel({
  slug,
  grades: gradesProp,
  level,
  statValues,
  stance,
  artifacts,
  showArtifactSlots = false,
  className,
  style
}: {
  slug: CommanderSlug;
  grades?: Partial<Record<CommanderStatKey, number>>;
  level?: number;
  /** Live combat values (already fold in buffs/stance) for the four board stats. */
  statValues?: { attack: number; defense: number; health: number; speed: number };
  stance?: "attack" | "defense";
  /** WOG Commander Artifacts (Task 2): the card id bound into each slot. */
  artifacts?: Partial<Record<CommanderArtifactSlot, string>>;
  /**
   * Show the three artifact slots (bound chips + empty placeholders). True while
   * the WOG Commander-Artifacts module is on; off (default) hides the section
   * for a plain WOG Commanders game.
   */
  showArtifactSlots?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const def = commanderDefinitions[slug];
  const grades = normalizeGrades(gradesProp);
  const power = commanderStatValue("magic", grades.magic);
  const tierIndex = commanderCastTierIndex(power);
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic];
  const mightDice = commanderStatValue("damage", grades.damage);
  const hasStance = def?.specialty.id === "superior-combat";
  const shownStance: "attack" | "defense" = stance ?? "attack";
  const combosUnlocked = commanderUnlockedCombos(grades);

  if (!def) {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        color: "#e8ddc6",
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 8,
        padding: 12,
        display: "grid",
        gap: 12,
        maxWidth: 460,
        ...style
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #4d3d26", paddingBottom: 6 }}>
        <span>
          <b style={{ color: GOLD, fontSize: 16, letterSpacing: 0.3 }}>{def.name}</b>
          <span style={{ color: DIM, fontSize: 12, marginLeft: 8 }}>{def.faction} Commander · tierless</span>
        </span>
        {level !== undefined ? <span style={{ color: PALE, fontSize: 12, fontWeight: 700 }}>Lv {level}</span> : null}
      </div>

      {/* Stat rows — authentic WoG comm3 symbols + grade bonus spelled out. */}
      <div style={{ display: "grid", gap: 5 }}>
        {COMMANDER_STAT_KEYS.map((key) => {
          const gradeIndex = grades[key];
          const base = COMMANDER_GRADE_VALUES[key][0];
          const stanceBonus = !statValues && hasStance && key === shownStance ? 1 : 0;
          const mainValue = statMainValue(key, grades, statValues, stanceBonus);
          const gradeValue = commanderStatValue(key, gradeIndex);
          const bonusOverBase = gradeValue - base;
          const buffed = Boolean(statValues) && (key === "attack" || key === "defense" || key === "health" || key === "speed") && mainValue > gradeValue;
          const stanceLift = stanceBonus > 0;

          // The right-hand explanation of what this grade buys.
          let detail: ReactNode;
          if (key === "damage") {
            detail = mightDice > 0
              ? <>Rolls <b style={{ color: GOLD }}>{mightDice}</b> extra attack {mightDice === 1 ? "die" : "dice"} — each “+1” raises Attack; at most one “−1”.</>
              : <span style={{ opacity: 0.7 }}>No extra attack dice yet.</span>;
          } else if (key === "magic") {
            const immune = commanderMagicImmuneToOngoing(gradeIndex);
            detail = (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <PowerLadder power={power} />
                {spellWard > 0 || immune ? (
                  <span style={{ opacity: 0.85 }}>
                    {spellWard > 0 ? `−${spellWard} Spell dmg` : ""}
                    {spellWard > 0 && immune ? " · " : ""}
                    {immune ? "immune to ongoing effects" : ""}
                  </span>
                ) : (
                  <span style={{ opacity: 0.7 }}>Cast only — no ward, not immune to ongoing (grade I gains both).</span>
                )}
              </span>
            );
          } else if (key === "defense") {
            detail = gradeIndex === COMMANDER_DEFENSE_TOKEN_GRADE
              ? <><b style={{ color: GOLD }}>+1 def when attacked</b> — rolls the Defend die (a “+1” face gives +1 Defense).</>
              : gradeIndex >= 3
                ? <span style={{ opacity: 0.85 }}>Reliable flat Defense (no die).</span>
                : <span style={{ opacity: 0.7 }}>{bonusOverBase > 0 ? `+${bonusOverBase} over base ${base}.` : `Base ${base}.`}</span>;
          } else {
            detail = (
              <span style={{ opacity: 0.75 }}>
                base {base}{bonusOverBase > 0 ? ` · grade ${gradeNumeral(gradeIndex)} +${bonusOverBase}` : ""}
                {stanceLift ? " · +1 stance" : ""}
              </span>
            );
          }

          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, background: ROW_BG, borderRadius: 6, padding: "5px 8px" }}>
              <CommanderStatIcon statKey={key} />
              <span style={{ width: 62, fontWeight: 700, color: PALE, fontSize: 13 }}>{COMMANDER_STAT_LABELS[key]}</span>
              <span
                style={{
                  minWidth: 30,
                  textAlign: "center",
                  fontSize: key === "damage" || key === "magic" ? 15 : 19,
                  fontWeight: 800,
                  color: buffed || stanceLift ? "#9be29b" : gradeIndex >= 3 ? GOLD : PALE,
                  textShadow: OUTLINE
                }}
              >
                {key === "damage" ? `🎲${mightDice}` : key === "magic" ? `✦${power}` : mainValue}
              </span>
              <GradeChips grade={gradeIndex} />
              <span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.25, textAlign: "right" }}>{detail}</span>
            </div>
          );
        })}
      </div>

      {/* Command ability (once per combat round). */}
      <div style={{ background: ROW_BG, borderRadius: 6, padding: "7px 9px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <img
            alt=""
            src={assetUrl(def.cast.icon)}
            style={{ width: 22, height: 22, objectFit: "cover", borderRadius: 4, border: "1px solid #6b5433" }}
          />
          <b style={{ color: "#e6c56a", fontSize: 13, letterSpacing: 0.3 }}>{def.cast.name}</b>
          <span style={{ color: DIM, fontSize: 11 }}>once per combat round · Power {power}</span>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {def.cast.tierText.map((text, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                gap: 6,
                padding: "2px 6px",
                borderRadius: 4,
                background: index === tierIndex ? "#3a2c10" : "transparent",
                border: index === tierIndex ? "1px solid #8d683c" : "1px solid transparent",
                color: index === tierIndex ? PALE : DIM,
                fontSize: 11.5
              }}
            >
              <b style={{ color: index === tierIndex ? GOLD : DIM, whiteSpace: "nowrap" }}>Pow {index === 2 ? "2+" : index}</b>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Specialty. */}
      <div style={{ fontSize: 12 }}>
        <span style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>SPECIALTY</span>
        <div style={{ marginTop: 2 }}>
          <b style={{ color: PALE }}>{def.specialty.name}.</b> <span style={{ opacity: 0.9 }}>{def.specialty.text}</span>
        </div>
      </div>

      {/* Commander Artifacts (Task 2) — the three permanent slots. Bound chips
          show the icon + name + wired effect line; empty slots show a placeholder
          so the growth path reads. Shown only while the module is on. */}
      {showArtifactSlots ? <CommanderArtifactSlots artifacts={artifacts} /> : null}

      {/* Combination skills — the WoG comm3 symbols + full explanation. */}
      <div>
        <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, fontSize: 11, marginBottom: 4 }}>
          COMBINATION SKILLS{" "}
          <span style={{ opacity: 0.55, fontWeight: 400 }}>(one stat at grade III + the other at II)</span>
        </div>
        {combosUnlocked.length > 0 ? (
          <div style={{ display: "grid", gap: 4, marginBottom: 6 }}>
            {combosUnlocked.map((combo) => (
              <div key={combo.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#2c210f", borderRadius: 6, padding: "5px 7px" }}>
                <img
                  alt={combo.name}
                  src={assetUrl(commanderComboSiteIcon(combo.tag))}
                  style={{ width: 30, height: 30, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}
                />
                <span style={{ fontSize: 11.5, lineHeight: 1.3 }}>
                  <b style={{ color: GOLD }}>[{combo.tag}] {combo.name}</b>
                  <span style={{ color: DIM }}> · {COMMANDER_STAT_ABBR[combo.requires[0]]}+{COMMANDER_STAT_ABBR[combo.requires[1]]}</span>
                  <br />
                  <span style={{ opacity: 0.9 }}>{combo.text}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {/* All 15 at a glance (locked dimmed) so the growth path reads clearly. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(30px, 1fr))", gap: 4 }}>
          {COMMANDER_COMBOS.map((combo) => {
            const unlocked = commanderComboUnlocked(grades, combo);
            return (
              <img
                key={combo.id}
                alt={combo.name}
                src={assetUrl(commanderComboSiteIcon(combo.tag))}
                title={`[${combo.tag}] ${combo.name} (${COMMANDER_STAT_LABELS[combo.requires[0]]} + ${COMMANDER_STAT_LABELS[combo.requires[1]]})${unlocked ? " — UNLOCKED" : " — locked"}: ${combo.text}`}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "contain",
                  borderRadius: 5,
                  border: `1px solid ${unlocked ? GOLD : "#4d3d26"}`,
                  background: unlocked ? "#2c210f" : "#161009",
                  filter: unlocked ? "none" : "grayscale(0.85) brightness(0.55)"
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ARTIFACT_SLOT_ORDER: readonly CommanderArtifactSlot[] = ["weapon", "armor", "trinket"];
const ARTIFACT_SLOT_GLYPH: Record<CommanderArtifactSlot, string> = {
  weapon: "⚔",
  armor: "🛡",
  trinket: "💍"
};

/** WOG Commander Artifact slot chips (bound icon + effect, or an empty placeholder). */
function CommanderArtifactSlots({ artifacts }: { artifacts?: Partial<Record<CommanderArtifactSlot, string>> }) {
  return (
    <div>
      <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, fontSize: 11, marginBottom: 4 }}>
        COMMANDER ARTIFACTS <span style={{ opacity: 0.55, fontWeight: 400 }}>(permanent — one per slot)</span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {ARTIFACT_SLOT_ORDER.map((slot) => {
          const cardId = artifacts?.[slot];
          const spec = cardId ? COMMANDER_ARTIFACT_SPECS[cardId] : undefined;
          return (
            <div
              key={slot}
              data-artifact-slot={slot}
              data-artifact-bound={spec ? "true" : "false"}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: spec ? "#2c210f" : "#161009",
                border: `1px solid ${spec ? GOLD : "#4d3d26"}`,
                borderRadius: 6,
                padding: "5px 7px"
              }}
            >
              {spec ? (
                <img
                  alt={spec.name}
                  src={assetUrl(`/assets/wog/artifacts/icons/${spec.slug}.webp`)}
                  style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 5, flexShrink: 0, border: "1px solid #6b5433" }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: 0.5, flexShrink: 0 }}
                >
                  {ARTIFACT_SLOT_GLYPH[slot]}
                </span>
              )}
              <span style={{ fontSize: 11.5, lineHeight: 1.3 }}>
                <b style={{ color: spec ? GOLD : DIM, textTransform: "capitalize" }}>{slot}</b>
                {spec ? (
                  <>
                    {" "}
                    <EquipGradeChip grade={tierToGrade(spec.tier)} title={`${spec.tier} · Grade ${tierToGrade(spec.tier)}`} />
                    {" · "}
                    <b style={{ color: PALE }}>{spec.name}</b>
                    <br />
                    <span style={{ opacity: 0.9, textTransform: "capitalize" }}>{spec.effectText}</span>
                  </>
                ) : (
                  <span style={{ color: DIM, opacity: 0.75 }}> · empty</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The 3 grade pips (I/II/III) for a stat, filled up to `grade`. */
function GradeChips({ grade }: { grade: CommanderGrade }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }} title={`grade ${gradeNumeral(grade)}`}>
      {([1, 2, 3] as const).map((step) => (
        <span
          key={step}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: `1px solid ${grade >= step ? GOLD : "#6b5433"}`,
            background: grade >= step ? (grade >= 3 ? GOLD : "#a8842f") : "#241d16"
          }}
        />
      ))}
    </span>
  );
}

/** Magic Power ladder 0→1→2 with the current tier highlighted (the spec caps
 *  command Power at 2 — grades map to Power 0/0/1/2). */
function PowerLadder({ power }: { power: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[0, 1, 2].map((step) => {
        const active = power === step;
        const reached = power >= step;
        return (
          <span
            key={step}
            title={`Power ${step}${active ? " (current)" : ""}`}
            style={{
              minWidth: 16,
              textAlign: "center",
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 4,
              padding: "0 3px",
              color: active ? "#1a1206" : reached ? GOLD : "#6b5f49",
              background: active ? GOLD : "transparent",
              border: `1px solid ${reached ? GOLD : "#4d3d26"}`
            }}
          >
            {step}
          </span>
        );
      })}
    </span>
  );
}

export function CommanderCard({
  slug,
  grades: gradesProp,
  level = 1,
  dead = false,
  gradePoints = 0,
  onGradeUp,
  onRevive,
  goldAvailable,
  stance,
  onSetStance,
  bondedArmyUnitId,
  bondOptions,
  onSetBond,
  artifacts,
  showArtifactSlots = false,
  editable = false,
  showPanel = true,
  className
}: {
  slug: CommanderSlug;
  /** Live grades from engine state (PlayerState.commander.grades). */
  grades?: Partial<Record<CommanderStatKey, number>>;
  /** Hero level (= commander level). */
  level?: number;
  dead?: boolean;
  /** Unspent stat points (PlayerState.commander.gradePoints). */
  gradePoints?: number;
  /** Live mode: spend ONE point to raise a single stat by a grade. */
  onGradeUp?: (stat: CommanderStatKey) => void;
  /** Live mode: revive the dead commander (cost = 2 + 2x level gold). */
  onRevive?: () => void;
  /** Live mode: owner's gold, to enable/disable the revive button. */
  goldAvailable?: number;
  /** Superior Combat commanders: the current +1 Attack/Defense stance. */
  stance?: "attack" | "defense";
  /** Live mode: change the Superior Combat stance (only outside combat). */
  onSetStance?: (stance: "attack" | "defense") => void;
  /** Sonya: persistent army-card instance protected by Unbreakable Bond. */
  bondedArmyUnitId?: string;
  /** Own army cards shown in Sonya's outside-combat bond picker. */
  bondOptions?: { id: string; label: string }[];
  /** Live mode: change Sonya's bonded army card (outside combat only). */
  onSetBond?: (armyUnitId: string) => void;
  /** WOG Commander Artifacts (Task 2): the card id bound into each slot. */
  artifacts?: Partial<Record<CommanderArtifactSlot, string>>;
  /** Show the three artifact slots (module on). */
  showArtifactSlots?: boolean;
  /** Preview mode: local grade/level editing (no engine). */
  editable?: boolean;
  /** Hide the info panel to show just the card face. */
  showPanel?: boolean;
  className?: string;
}) {
  const def = commanderDefinitions[slug];
  const [localGrades, setLocalGrades] = useState<CommanderGrades>({ ...GRADES_ZERO });
  const [localLevel, setLocalLevel] = useState(1);
  const [localStance, setLocalStance] = useState<"attack" | "defense">("attack");

  const hasStance = def?.specialty.id === "superior-combat";
  const hasBond = def?.specialty.id === "unbreakable-bond";
  const shownStance: "attack" | "defense" = editable ? localStance : (stance ?? "attack");
  const grades = editable ? localGrades : normalizeGrades(gradesProp);
  const shownLevel = editable ? localLevel : level;
  const reviveCost = commanderReviveCost(shownLevel);
  const doublePointLevels = commanderDoublePointLevels(slug);

  if (!def) {
    return null;
  }

  return (
    <div className={className} style={{ position: "relative", width: "100%", maxWidth: 420, fontFamily: 'Georgia, "Times New Roman", serif' }}>
      <CommanderCardFace
        slug={slug}
        grades={grades}
        level={shownLevel}
        dead={dead}
        stance={hasStance ? shownStance : undefined}
      />

      {showPanel ? (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: "#1c1712",
            border: "1px solid #8d683c",
            borderRadius: 6,
            color: "#e8ddc6",
            fontSize: 13,
            display: "grid",
            gap: 10
          }}
        >
          {/* Revive row (live mode) / editable level (preview mode). */}
          {dead ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#ff9d8a", fontWeight: 700 }}>
                Fallen — revive for {reviveCost} gold
              </span>
              {onRevive ? (
                <button
                  type="button"
                  onClick={onRevive}
                  disabled={goldAvailable !== undefined && goldAvailable < reviveCost}
                  style={{
                    padding: "6px 12px",
                    background: "#5c2f1c",
                    color: PALE,
                    border: "1px solid #b9985a",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 700,
                    opacity: goldAvailable !== undefined && goldAvailable < reviveCost ? 0.5 : 1
                  }}
                >
                  Revive ({reviveCost} gold)
                </button>
              ) : null}
            </div>
          ) : null}

          {editable ? (
            <Row label={`Level (milestone points at ${doublePointLevels.join(" & ")})`}>
              <Stepper
                value={localLevel}
                onDec={() => setLocalLevel((value) => Math.max(1, value - 1))}
                onInc={() => setLocalLevel((value) => Math.min(7, value + 1))}
              />
            </Row>
          ) : null}

          {/* Grade-up picker (live mode, when points are unspent) — one click
              spends one point on a stat. Each stat is a clearly-separated,
              individually-highlighted option. */}
          {!editable && gradePoints > 0 && onGradeUp && !dead ? (
            <CommanderLevelUpPicker
              grades={grades}
              gradePoints={gradePoints}
              level={shownLevel}
              onGradeUp={onGradeUp}
            />
          ) : null}

          {/* Editable grade tracks (preview tool only — click a pip to set a
              grade). The rich read-only display lives in CommanderStatsPanel. */}
          {editable ? (
            <div>
              <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                EDIT GRADES{" "}
                <span style={{ opacity: 0.6, fontWeight: 400 }}>(milestone points at hero level {doublePointLevels.join(" & ")})</span>
              </div>
              {COMMANDER_STAT_KEYS.map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  <span style={{ width: 72, opacity: 0.9 }}>{COMMANDER_STAT_LABELS[key]}</span>
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {([1, 2, 3] as const).map((grade) => {
                      const reached = grades[key] >= grade;
                      return (
                        <button
                          key={grade}
                          type="button"
                          title={`Grade ${gradeNumeral(grade)}: ${gradeValueLabel(key, grade)}`}
                          onClick={() =>
                            setLocalGrades((current) => ({
                              ...current,
                              // Clicking the current grade steps back down, so
                              // grade 0 stays reachable in the preview.
                              [key]: current[key] === grade ? ((grade - 1) as CommanderGrade) : grade
                            }))
                          }
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: `1px solid ${reached ? GOLD : "#6b5433"}`,
                            background: reached ? (grades[key] >= 3 ? GOLD : "#a8842f") : "#241d16",
                            cursor: "pointer",
                            padding: 0
                          }}
                        />
                      );
                    })}
                  </span>
                  <span style={{ marginLeft: "auto", color: PALE, fontWeight: 700 }}>{gradeValueLabel(key, grades[key])}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Superior Combat stance toggle (interactive). */}
          {hasStance ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ opacity: 0.85 }}>Combat stance:</span>
              {(["attack", "defense"] as const).map((option) => {
                const active = shownStance === option;
                const settable = editable || Boolean(onSetStance);
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={!settable}
                    onClick={
                      editable
                        ? () => setLocalStance(option)
                        : onSetStance
                          ? () => onSetStance(option)
                          : undefined
                    }
                    style={{
                      padding: "3px 10px",
                      borderRadius: 12,
                      border: `1px solid ${active ? GOLD : "#6b5433"}`,
                      background: active ? "#7a5a2c" : "#2a2119",
                      color: active ? PALE : DIM,
                      cursor: settable ? "pointer" : "default",
                      fontWeight: 600
                    }}
                  >
                    +1 {option === "attack" ? "Attack" : "Defense"}
                  </button>
                );
              })}
            </div>
          ) : null}

          {hasBond && bondOptions?.length ? (
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: GOLD, fontWeight: 700 }}>Unbreakable Bond</span>
              <select
                aria-label="Sonya bonded army card"
                value={bondedArmyUnitId ?? ""}
                disabled={!onSetBond}
                onChange={(event) => {
                  if (event.target.value && onSetBond) onSetBond(event.target.value);
                }}
                style={{
                  padding: "6px 8px",
                  background: "#2a2119",
                  color: PALE,
                  border: `1px solid ${GOLD}`,
                  borderRadius: 5
                }}
              >
                <option value="" disabled>Choose one army card</option>
                {bondOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <small style={{ color: DIM }}>+1 Defense in combat round 1 while Sonya lives; first lethal hit each combat is redirected to her.</small>
            </label>
          ) : null}

          {/* The pro read-only stats view: the authentic WoG comm3 symbols, the
              grade bonuses spelled out, the Damage dice, the Power ladder and
              every combination skill with its explanation. */}
          <CommanderStatsPanel
            slug={slug}
            grades={grades}
            level={shownLevel}
            stance={hasStance ? shownStance : undefined}
            artifacts={artifacts}
            showArtifactSlots={showArtifactSlots}
            style={{ maxWidth: "100%", background: "transparent", border: "none", padding: 0 }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The commander level-up stat picker: one clearly-separated, individually
 * highlighted option per stat. Each option shows the stat's comm3 symbol, its
 * name, the grade pips (current → next), the numeric stat value change and a
 * plain-words "what this buys" line. One click spends one point (COMMANDER_
 * GRADE_UP). Reused by the commander card panel AND the level-up popup.
 */
export function CommanderLevelUpPicker({
  grades: gradesProp,
  gradePoints,
  level,
  onGradeUp
}: {
  grades?: Partial<Record<CommanderStatKey, number>>;
  gradePoints: number;
  /** Hero level — gates the grade 2 → 3 "mastery" raise (needs level 5+). */
  level?: number;
  onGradeUp: (stat: CommanderStatKey) => void;
}) {
  const grades = normalizeGrades(gradesProp);
  const heroLevel = level ?? 1;
  return (
    <div className="commanderGradeUpPulse commanderLevelUpPicker">
      <div className="commanderLevelUpTitle">
        LEVEL UP — {gradePoints} stat {gradePoints === 1 ? "point" : "points"} to spend
      </div>
      <div className="commanderLevelUpHint">
        Spend 1 point on a stat. Raise Speed to grade I to arrange your commander with your units.
      </div>
      <div className="commanderLevelUpGrid">
        {COMMANDER_STAT_KEYS.map((key) => {
          const current = grades[key];
          const capped = current >= 3;
          // The final grade-2 → grade-3 raise waits for the mastery level.
          const masteryLocked = current === 2 && heroLevel < COMMANDER_MASTERY_MIN_HERO_LEVEL;
          const disabled = capped || masteryLocked;
          const nextGrade = (current + 1) as CommanderGrade;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onGradeUp(key)}
              className="commanderPickStat"
              data-stat={key}
              data-capped={capped ? "true" : "false"}
              data-locked={masteryLocked ? "true" : "false"}
              aria-label={
                capped
                  ? `${COMMANDER_STAT_LABELS[key]} is already at grade III`
                  : masteryLocked
                    ? `${COMMANDER_STAT_LABELS[key]} mastery (grade III) unlocks at hero level ${COMMANDER_MASTERY_MIN_HERO_LEVEL}`
                    : `Raise ${COMMANDER_STAT_LABELS[key]} to grade ${gradeNumeral(nextGrade)}: ${gradeUpBenefit(key, nextGrade)}`
              }
              title={
                capped
                  ? `${COMMANDER_STAT_LABELS[key]} is at grade III (max)`
                  : masteryLocked
                    ? `Mastery (grade III) unlocks at hero level ${COMMANDER_MASTERY_MIN_HERO_LEVEL}`
                    : gradeUpBenefit(key, nextGrade)
              }
            >
              <span className="commanderPickAccent" aria-hidden="true" />
              <CommanderStatIcon statKey={key} size={30} />
              <span className="commanderPickBody">
                <span className="commanderPickHead">
                  <span className="commanderPickName">{COMMANDER_STAT_LABELS[key]}</span>
                  <span className="commanderPickGrades">
                    <GradeChips grade={current} />
                    <span className="commanderPickArrow">{capped ? "MAX" : `→ ${gradeNumeral(nextGrade)}`}</span>
                  </span>
                </span>
                {capped ? (
                  <span className="commanderPickCapped">Already grade III (max) — pick another stat</span>
                ) : masteryLocked ? (
                  <span className="commanderPickCapped">
                    Mastery (grade III) unlocks at hero level {COMMANDER_MASTERY_MIN_HERO_LEVEL}
                  </span>
                ) : (
                  <span className="commanderPickBenefit">
                    <b>
                      {gradeValueLabel(key, current)} → {gradeValueLabel(key, nextGrade)}
                    </b>{" "}
                    · {gradeUpBenefit(key, nextGrade)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Level-up POPUP: a slam-in celebratory modal shown the moment a hero level-up
 * awards the commander stat points. It plays a fanfare, shows the commander face
 * and the clearer stat picker so the owner can spend right away (or close and
 * spend later from the dock). Driven by live props — screen.tsx renders it while
 * new points are owed and closes it when they are all spent.
 */
export function CommanderLevelUpOverlay({
  slug,
  grades,
  level,
  gradePoints,
  onGradeUp,
  onClose
}: {
  slug: CommanderSlug;
  grades?: Partial<Record<CommanderStatKey, number>>;
  level?: number;
  gradePoints: number;
  onGradeUp: (stat: CommanderStatKey) => void;
  onClose: () => void;
}) {
  // A one-shot fanfare on mount (the converted H3 "climax" sting), like the
  // morale-card overlay plays its good/bad sting.
  useEffect(() => {
    playLibrarySound("effects/climax", 0.6);
  }, []);

  // PORTAL to <body>. Rendered inline this overlay sits inside the left command
  // rail's `.leftRailDock` (position: relative; z-index: 20), which is a
  // stacking context — so the fixed backdrop's own z-index was meaningless and
  // the desktop HUD's fixed hand tray (z 48) painted OVER the modal's bottom,
  // hiding the LAST stat option (Speed) and the "Spend later" button with no
  // way to scroll them clear. In phone mode it was worse: the rail is
  // `display: none` on every tab but Army, so the popup did not render at all.
  // Same fix OpponentInfoModal / HeroInfoModal already needed.
  if (!commanderDefinitions[slug] || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="commanderLevelUpBackdrop" role="dialog" aria-modal="true" aria-label="Commander level up">
      <div className="commanderLevelUpModal">
        <div className="commanderLevelUpBanner">
          ⭐ COMMANDER LEVEL UP{level ? ` — Level ${level}` : ""} ⭐
        </div>
        {/* The banner and the Done/Spend-later escape stay pinned; THIS is the
            scroll region (`.commanderLevelUpScroll`), so all six stat options —
            Speed last — are reachable on a short viewport. */}
        <div className="commanderLevelUpModalBody commanderLevelUpScroll">
          <div className="commanderLevelUpFace">
            <CommanderCardFace slug={slug} grades={grades} level={level} />
          </div>
          <CommanderLevelUpPicker
            grades={grades}
            gradePoints={gradePoints}
            level={level}
            onGradeUp={onGradeUp}
          />
        </div>
        <button type="button" className="commanderLevelUpDone" onClick={onClose}>
          {gradePoints > 0 ? "Spend later" : "Done"}
        </button>
      </div>
    </div>,
    document.body
  );
}

function gradeValueLabel(key: CommanderStatKey, grade: CommanderGrade): string {
  const value = COMMANDER_GRADE_VALUES[key][grade];
  if (key === "damage") {
    // Damage grade = number of extra attack dice rolled (not a flat bonus).
    return value === 0 ? "no dice" : `${value} ${value === 1 ? "die" : "dice"}`;
  }
  if (key === "magic") {
    // The Magic grade ladders a whole package, not just Power (0/0/1/2).
    if (grade === 0) {
      return "cast only";
    }
    const ward = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grade];
    return value > 0 ? `Power ${value}, −${ward} ward` : `−${ward} ward, immune`;
  }
  if (key === "defense" && grade === COMMANDER_DEFENSE_TOKEN_GRADE) {
    // Grade II is Defense 2 PLUS the "+1 when attacked" Defense token.
    return `${value} +token`;
  }
  return `${value}`;
}

/**
 * A short, human "what this grade buys" line — used to explain each stat point
 * the owner is about to spend (the grade-up picker). `grade` is the grade the
 * stat would REACH by spending the point.
 */
function gradeUpBenefit(key: CommanderStatKey, grade: CommanderGrade): string {
  const base = COMMANDER_GRADE_VALUES[key][0];
  const value = COMMANDER_GRADE_VALUES[key][grade];
  switch (key) {
    case "attack":
      return `Attack ${value} (+${value - base} over base)`;
    case "health":
      return `Health ${value} (+${value - base} over base)`;
    case "speed":
      return `Initiative ${value} (+${value - base} over base)`;
    case "defense":
      if (grade === COMMANDER_DEFENSE_TOKEN_GRADE) {
        return `Defense ${value} + a "+1 when attacked" Defend die`;
      }
      return grade >= 3 ? `Defense ${value} (reliable, no die)` : `Defense ${value}`;
    case "damage":
      return `Roll ${value} extra attack ${value === 1 ? "die" : "dice"} on every attack (Might)`;
    case "magic":
      switch (grade) {
        case 1:
          return "−1 Spell damage + immune to ongoing effects";
        case 2:
          return "command Power 1 (keeps −1 ward + ongoing immunity)";
        case 3:
          return "command Power 2, −3 Spell damage, immune to ongoing";
        default:
          return "the once-per-round cast";
      }
    default:
      return "";
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0" }}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function Stepper({ value, onInc, onDec }: { value: number; onInc: () => void; onDec: () => void }) {
  const buttonStyle: CSSProperties = {
    width: 26,
    height: 26,
    cursor: "pointer",
    border: "1px solid #6b5433",
    borderRadius: 4,
    background: "#2a2119",
    color: "#f4d774",
    fontWeight: 700
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button onClick={onDec} style={buttonStyle} aria-label="decrease" type="button">
        −
      </button>
      <span style={{ minWidth: 22, textAlign: "center", color: "#fff4c8", fontWeight: 700 }}>{value}</span>
      <button onClick={onInc} style={buttonStyle} aria-label="increase" type="button">
        +
      </button>
    </span>
  );
}
