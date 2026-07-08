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
  commanderDefinitions,
  commanderGradeUpLevels,
  commanderReviveCost,
  commanderStatValue,
  type CommanderGrade,
  type CommanderGrades,
  type CommanderSlug,
  type CommanderStatKey
} from "@/data/commanders";

// ---------------------------------------------------------------------------
// CommanderCard — renders a WOG Commander card (frame + art from
// public/assets/units-commander-<slug>.webp) with every number DYNAMIC:
//  - the four stat wells (Attack / Defense / Health / Speed) read the grades;
//  - Damage ("Might") and Magic Power ride as chips on the art window;
//  - the panel below lists the six grade tracks (pips), the command ability's
//    three Power tiers (current tier highlighted), the specialty, and the two
//    grade-3 combos.
// Live mode: pass `grades`/`level`/`dead`/`pendingGradeUps` from engine state
// plus `onGradeUp`/`onRevive` callbacks. Preview mode: `editable` keeps local
// state so every configuration can be inspected at /commander-preview.
// ---------------------------------------------------------------------------

const STAT_WELLS: { key: "attack" | "defense" | "health" | "speed"; topPct: number }[] = [
  { key: "attack", topPct: 25.0 },
  { key: "defense", topPct: 39.9 },
  { key: "health", topPct: 53.85 },
  { key: "speed", topPct: 68.3 }
];
const STAT_LEFT_PCT = 15.75;

const GRADES_ONE: CommanderGrades = { attack: 1, defense: 1, health: 1, damage: 1, magic: 1, speed: 1 };

function clampGrade(raw: number | undefined): CommanderGrade {
  return raw !== undefined && raw >= 3 ? 3 : raw === 2 ? 2 : 1;
}

function normalizeGrades(grades?: Partial<Record<CommanderStatKey, number>>): CommanderGrades {
  const out = { ...GRADES_ONE };
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
  const [localGrades, setLocalGrades] = useState<CommanderGrades>({ ...GRADES_ONE });
  const [localLevel, setLocalLevel] = useState(1);
  const [picked, setPicked] = useState<CommanderStatKey[]>([]);
  const [localStance, setLocalStance] = useState<"attack" | "defense">("attack");

  const hasStance = def?.specialty.id === "superior-combat";
  const shownStance: "attack" | "defense" = editable ? localStance : (stance ?? "attack");
  const grades = editable ? localGrades : normalizeGrades(gradesProp);
  const shownLevel = editable ? localLevel : level;
  const power = commanderStatValue("magic", grades.magic);
  const tierIndex = commanderCastTierIndex(power);
  const might = commanderStatValue("damage", grades.damage);
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic - 1];
  const combosUnlocked = useMemo(
    () => COMMANDER_COMBOS.filter((combo) => combo.requires.every((key) => grades[key] >= 3)),
    [grades]
  );
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

  const wrapStyle: CSSProperties = {
    containerType: "inline-size",
    position: "relative",
    width: "100%",
    maxWidth: 420,
    fontFamily: 'Georgia, "Times New Roman", serif'
  };

  const chipStyle: CSSProperties = {
    position: "absolute",
    padding: "0.6cqw 1.6cqw",
    borderRadius: "1.4cqw",
    background: "rgba(16, 10, 5, 0.78)",
    border: "1px solid #8d683c",
    color: PALE,
    fontSize: "2.6cqw",
    fontWeight: 700,
    letterSpacing: "0.1cqw",
    pointerEvents: "none",
    lineHeight: 1.2
  };

  return (
    <div className={className} style={wrapStyle}>
      <div style={{ position: "relative", width: "100%" }}>
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

        {/* Dynamic stat numbers over the frame wells (Attack/Defense/Health/Speed).
            A Superior Combat commander shows its +1 stance bonus baked in. */}
        {STAT_WELLS.map(({ key, topPct }) => {
          const stanceBonus = hasStance && key === shownStance ? 1 : 0;
          return (
            <span
              key={key}
              title={`${COMMANDER_STAT_LABELS[key]} (grade ${grades[key]}${stanceBonus ? ", +1 stance" : ""})`}
              style={{
                position: "absolute",
                left: `${STAT_LEFT_PCT}%`,
                top: `${topPct}%`,
                transform: "translate(-50%, -50%)",
                fontSize: "4.6cqw",
                fontWeight: 700,
                color: stanceBonus ? "#9be29b" : grades[key] >= 3 ? GOLD : PALE,
                textShadow: OUTLINE,
                pointerEvents: "none",
                lineHeight: 1
              }}
            >
              {commanderStatValue(key, grades[key]) + stanceBonus}
            </span>
          );
        })}

        {/* Level badge (top-left of the art window). */}
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
          Lv {shownLevel}
        </span>

        {/* Might / Magic chips riding the art window's bottom corners. */}
        <span style={{ ...chipStyle, left: "24.5%", bottom: "31.5%" }} title={`Damage grade ${grades.damage}: attacks that deal damage deal ${might} more.`}>
          MIGHT +{might}
        </span>
        <span
          style={{ ...chipStyle, right: "5.5%", bottom: "31.5%" }}
          title={`Magic grade ${grades.magic}: Power ${power}, -${spellWard} Spell damage, immune to ongoing effects.`}
        >
          POW {power} · WARD {spellWard}
        </span>

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
            style={{ width: "11cqw", height: "11cqw", objectFit: "cover", borderRadius: "1.4cqw", border: "1px solid #8d683c", flexShrink: 0 }}
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

          {/* Grade-up picker (live mode, when a pick is owed). */}
          {!editable && pendingGradeUps > 0 && onGradeUp && !dead ? (
            <div style={{ padding: 8, border: "1px dashed #b9985a", borderRadius: 6, background: "#241b10" }}>
              <div style={{ color: GOLD, fontWeight: 700, marginBottom: 6 }}>
                GRADE UP{pendingGradeUps > 1 ? ` (x${pendingGradeUps})` : ""} — pick two different stats
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
                      {capped ? " (max)" : ` ${grades[key]}→${grades[key] + 1}`}
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

          {/* Six grade tracks. */}
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              STATS <span style={{ opacity: 0.6, fontWeight: 400 }}>(grade 1-3 · picks at hero level {gradeUpLevels.join(" & ")})</span>
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
                        title={`Grade ${grade}: ${gradeValueLabel(key, grade)}`}
                        onClick={editable ? () => setLocalGrades((current) => ({ ...current, [key]: grade })) : undefined}
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
              Magic grade 1+: immune to ongoing effects · -{spellWard} Spell damage taken.
            </div>
          </div>

          {/* Command ability tiers. */}
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              {def.cast.name.toUpperCase()} <span style={{ opacity: 0.6, fontWeight: 400 }}>(once per combat round · Power {power})</span>
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
                <b style={{ color: index === tierIndex ? GOLD : DIM }}>Pow {index}:</b> {text}
              </div>
            ))}
          </div>

          {/* Specialty + combos. */}
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
          <div>
            <div style={{ color: "#e6c56a", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              COMBOS <span style={{ opacity: 0.6, fontWeight: 400 }}>(both stats at grade 3)</span>
            </div>
            {COMMANDER_COMBOS.map((combo) => {
              const unlocked = combosUnlocked.some((candidate) => candidate.id === combo.id);
              return (
                <div key={combo.id} style={{ fontSize: 12.5, color: unlocked ? PALE : DIM, padding: "2px 0" }}>
                  <b style={{ color: unlocked ? GOLD : DIM }}>
                    {unlocked ? "◆" : "◇"} {combo.name}
                  </b>{" "}
                  ({COMMANDER_STAT_LABELS[combo.requires[0]]} + {COMMANDER_STAT_LABELS[combo.requires[1]]}) — {combo.text.split(": ")[1] ?? combo.text}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function gradeValueLabel(key: CommanderStatKey, grade: CommanderGrade): string {
  const value = COMMANDER_GRADE_VALUES[key][grade - 1];
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
