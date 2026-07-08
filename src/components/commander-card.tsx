"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { assetUrl } from "@/lib/asset-url";
import {
  COMMANDER_COMBOS,
  COMMANDER_GRADE_VALUES,
  COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION,
  COMMANDER_STAT_KEYS,
  COMMANDER_STAT_LABELS,
  commanderCastTierIndex,
  commanderComboUnlocked,
  commanderDefinitions,
  commanderGradeUpLevels,
  commanderReviveCost,
  commanderStatValue,
  commanderUnlockedCombos,
  type CommanderGrade,
  type CommanderGrades,
  type CommanderSlug,
  type CommanderStatKey
} from "@/data/commanders";

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
// Live mode: pass `grades`/`level`/`dead`/`pendingGradeUps` from engine state
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

/** Roman grade tag for tooltips/labels (grade 0 = base, no numeral). */
function gradeNumeral(grade: CommanderGrade): string {
  return grade === 0 ? "base" : ["", "I", "II", "III"][grade];
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
      style={{ containerType: "inline-size", position: "relative", width: "100%", fontFamily: 'Georgia, "Times New Roman", serif', ...style }}
    >
      <img
        alt={`${def.name} — ${def.faction} Commander`}
        src={assetUrl(def.cardImage)}
        style={{ width: "100%", display: "block", borderRadius: "2.5cqw", filter: dead ? "grayscale(0.9) brightness(0.6)" : undefined }}
      />

      {/* Name + faction tag (overlaid on the banner). */}
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

      {/* Bonus Damage / command Power badges (top-right of the art window),
          shown only once they rise above 0 — a fresh commander stays clean. */}
      <span style={{ position: "absolute", right: "6%", top: "15.2%", display: "flex", gap: "1cqw" }}>
        {might > 0 ? (
          <span style={badgeStyle} title={`Damage grade ${gradeNumeral(grades.damage)}: attacks that deal damage deal +${might}.`}>
            ⚔ +{might}
          </span>
        ) : null}
        {power > 0 ? (
          <span
            style={badgeStyle}
            title={`Magic grade ${gradeNumeral(grades.magic)}: command Power ${power}, takes ${spellWard} less Spell damage, immune to ongoing effects.`}
          >
            ✦ {power}
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

export function CommanderCard({
  slug,
  grades: gradesProp,
  level = 1,
  dead = false,
  pendingGradeUps = 0,
  onGradeUp,
  onRevive,
  goldAvailable,
  stance,
  onSetStance,
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
  /** Owed grade-up picks (PlayerState.commander.pendingGradeUps.length). */
  pendingGradeUps?: number;
  /** Live mode: spend a grade-up pick on two DIFFERENT stats. */
  onGradeUp?: (stats: [CommanderStatKey, CommanderStatKey]) => void;
  /** Live mode: revive the dead commander (cost = 2 + 2x level gold). */
  onRevive?: () => void;
  /** Live mode: owner's gold, to enable/disable the revive button. */
  goldAvailable?: number;
  /** Superior Combat commanders: the current +1 Attack/Defense stance. */
  stance?: "attack" | "defense";
  /** Live mode: change the Superior Combat stance (only outside combat). */
  onSetStance?: (stance: "attack" | "defense") => void;
  /** Preview mode: local grade/level editing (no engine). */
  editable?: boolean;
  /** Hide the info panel to show just the card face. */
  showPanel?: boolean;
  className?: string;
}) {
  const def = commanderDefinitions[slug];
  const [localGrades, setLocalGrades] = useState<CommanderGrades>({ ...GRADES_ZERO });
  const [localLevel, setLocalLevel] = useState(1);
  const [picked, setPicked] = useState<CommanderStatKey[]>([]);
  const [localStance, setLocalStance] = useState<"attack" | "defense">("attack");

  const hasStance = def?.specialty.id === "superior-combat";
  const shownStance: "attack" | "defense" = editable ? localStance : (stance ?? "attack");
  const grades = editable ? localGrades : normalizeGrades(gradesProp);
  const shownLevel = editable ? localLevel : level;
  const power = commanderStatValue("magic", grades.magic);
  const tierIndex = commanderCastTierIndex(power);
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic];
  const combosUnlocked = useMemo(() => commanderUnlockedCombos(grades), [grades]);
  const reviveCost = commanderReviveCost(shownLevel);
  const gradeUpLevels = commanderGradeUpLevels(slug);

  if (!def) {
    return null;
  }

  const togglePick = (key: CommanderStatKey) => {
    setPicked((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : current.length < 2 ? [...current, key] : current
    );
  };

  const confirmGradeUp = () => {
    if (picked.length !== 2 || !onGradeUp) {
      return;
    }
    // Canonical stat-key order — must match the engine's offered pairs.
    const sorted = [...picked].sort(
      (left, right) => COMMANDER_STAT_KEYS.indexOf(left) - COMMANDER_STAT_KEYS.indexOf(right)
    ) as [CommanderStatKey, CommanderStatKey];
    setPicked([]);
    onGradeUp(sorted);
  };

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
            <Row label={`Level (grade-ups at ${gradeUpLevels.join(" & ")})`}>
              <Stepper
                value={localLevel}
                onDec={() => setLocalLevel((value) => Math.max(1, value - 1))}
                onInc={() => setLocalLevel((value) => Math.min(7, value + 1))}
              />
            </Row>
          ) : null}

          {/* Grade-up picker (live mode, when a pick is owed) — pulses so a
              fresh commander level-up is impossible to miss. */}
          {!editable && pendingGradeUps > 0 && onGradeUp && !dead ? (
            <div className="commanderGradeUpPulse" style={{ padding: 8, border: "1px dashed #b9985a", borderRadius: 6, background: "#241b10" }}>
              <div style={{ color: GOLD, fontWeight: 700, marginBottom: 6 }}>
                LEVEL UP{pendingGradeUps > 1 ? ` (x${pendingGradeUps})` : ""} — pick two different stats to grade up
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COMMANDER_STAT_KEYS.map((key) => {
                  const capped = grades[key] >= 3;
                  const active = picked.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={capped || (!active && picked.length >= 2)}
                      onClick={() => togglePick(key)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 12,
                        border: `1px solid ${active ? GOLD : "#6b5433"}`,
                        background: active ? "#7a5a2c" : "#2a2119",
                        color: capped ? "#6d6252" : active ? PALE : DIM,
                        cursor: capped ? "default" : "pointer",
                        fontWeight: 600
                      }}
                    >
                      {COMMANDER_STAT_LABELS[key]}
                      {capped ? " (max)" : ` ${gradeValueLabel(key, grades[key])} → ${gradeValueLabel(key, (grades[key] + 1) as CommanderGrade)}`}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={picked.length !== 2}
                onClick={confirmGradeUp}
                style={{
                  marginTop: 8,
                  padding: "6px 14px",
                  background: picked.length === 2 ? "#3f5c1c" : "#2a2119",
                  color: picked.length === 2 ? PALE : DIM,
                  border: "1px solid #8d683c",
                  borderRadius: 6,
                  cursor: picked.length === 2 ? "pointer" : "default",
                  fontWeight: 700
                }}
              >
                Confirm grade-up
              </button>
            </div>
          ) : null}

          {/* Six grade tracks (grade 0 = base, three pips to grade 3). */}
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              STATS{" "}
              <span style={{ opacity: 0.6, fontWeight: 400 }}>
                (start at grade 0 · picks at hero level {gradeUpLevels.join(" & ")})
              </span>
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
                        onClick={
                          editable
                            ? () =>
                                setLocalGrades((current) => ({
                                  ...current,
                                  // Clicking the current grade steps back down,
                                  // so grade 0 stays reachable in the preview.
                                  [key]: current[key] === grade ? ((grade - 1) as CommanderGrade) : grade
                                }))
                            : undefined
                        }
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: `1px solid ${reached ? GOLD : "#6b5433"}`,
                          background: reached ? (grades[key] >= 3 ? GOLD : "#a8842f") : "#241d16",
                          cursor: editable ? "pointer" : "default",
                          padding: 0
                        }}
                      />
                    );
                  })}
                </span>
                <span style={{ marginLeft: "auto", color: PALE, fontWeight: 700 }}>{gradeValueLabel(key, grades[key])}</span>
              </div>
            ))}
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
              Grade bonuses are the value shown, never added together (grade III: Attack +3, Health +4, Speed +5).
              <br />
              Magic (any grade): immune to ongoing effects · -{spellWard} Spell damage taken.
            </div>
          </div>

          {/* Command ability tiers. */}
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              <img
                alt=""
                src={assetUrl(def.cast.icon)}
                style={{ width: 18, height: 18, objectFit: "cover", borderRadius: 4, verticalAlign: "-4px", marginRight: 6, border: "1px solid #6b5433" }}
              />
              {def.cast.name.toUpperCase()}{" "}
              <span style={{ opacity: 0.6, fontWeight: 400 }}>(once per combat round · Power {power})</span>
            </div>
            {def.cast.tierText.map((text, index) => (
              <div
                key={index}
                style={{
                  padding: "3px 6px",
                  borderRadius: 4,
                  background: index === tierIndex ? "#33270f" : "transparent",
                  border: index === tierIndex ? "1px solid #8d683c" : "1px solid transparent",
                  color: index === tierIndex ? PALE : DIM,
                  fontSize: 12.5
                }}
              >
                <b style={{ color: index === tierIndex ? GOLD : DIM }}>Pow {index === 2 ? "2+" : index}:</b> {text}
              </div>
            ))}
          </div>

          {/* Specialty + stance. */}
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>SPECIALTY</div>
            <div style={{ fontSize: 12.5 }}>
              <b style={{ color: PALE }}>{def.specialty.name}.</b> {def.specialty.text}
            </div>
            {hasStance ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
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
          </div>

          {/* All 15 combination skills with their unlock state. */}
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              COMBINATION SKILLS{" "}
              <span style={{ opacity: 0.6, fontWeight: 400 }}>(one stat at grade III + the other at grade II)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px" }}>
              {COMMANDER_COMBOS.map((combo) => {
                const unlocked = commanderComboUnlocked(grades, combo);
                return (
                  <div
                    key={combo.id}
                    title={`${combo.name} (${COMMANDER_STAT_LABELS[combo.requires[0]]} + ${COMMANDER_STAT_LABELS[combo.requires[1]]}) — ${combo.text}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "2px 4px",
                      borderRadius: 4,
                      background: unlocked ? "#2c210f" : "transparent",
                      color: unlocked ? PALE : DIM,
                      fontSize: 12,
                      // Grid items must be allowed to shrink below their text's
                      // min-content width, or the panel overflows narrow cards.
                      minWidth: 0
                    }}
                  >
                    <img
                      alt=""
                      src={assetUrl(combo.icon)}
                      style={{
                        width: 20,
                        height: 20,
                        objectFit: "cover",
                        borderRadius: "50%",
                        border: `1px solid ${unlocked ? GOLD : "#4d3d26"}`,
                        filter: unlocked ? undefined : "grayscale(0.85) brightness(0.7)",
                        flexShrink: 0
                      }}
                    />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: unlocked ? 700 : 400 }}>
                      {combo.name}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: unlocked ? GOLD : "#8a7551", whiteSpace: "nowrap" }}>
                      {COMMANDER_STAT_ABBR[combo.requires[0]]}+{COMMANDER_STAT_ABBR[combo.requires[1]]}
                    </span>
                  </div>
                );
              })}
            </div>
            {combosUnlocked.length > 0 ? (
              <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                {combosUnlocked.map((combo) => (
                  <div key={combo.id} style={{ fontSize: 12, color: PALE }}>
                    <b style={{ color: GOLD }}>◆ {combo.name}.</b> {combo.text}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.65 }}>
                None unlocked yet — hover a skill to read what it will do.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function gradeValueLabel(key: CommanderStatKey, grade: CommanderGrade): string {
  const value = COMMANDER_GRADE_VALUES[key][grade];
  if (key === "damage") {
    return `+${value} dmg`;
  }
  if (key === "magic") {
    return `Power ${value}`;
  }
  return `${value}`;
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
