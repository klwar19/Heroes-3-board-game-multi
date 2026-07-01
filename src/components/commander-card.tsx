"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { assetUrl } from "@/lib/asset-url";
import {
  COMMANDER_BASE_STATS,
  PRIMARY_SKILLS,
  SECONDARY_SKILLS,
  SKILL_TIERS,
  commanderDefinitions,
  type CommanderSlug,
  type CommanderStats,
  type SkillTier
} from "@/data/commanders";

// ---------------------------------------------------------------------------
// CommanderCard — renders a built WoG Commander card (frame + art + name +
// abilities, from public/assets/units-commander-<slug>.webp) and OVERLAYS the
// four DYNAMIC stat numbers (Attack / Defense / Health / Speed) so they are not
// baked into the art and can be upgraded as the commander levels up.
//
// The four stat wells sit at these positions in the 743x1040 frame (x centre
// 119, y baselines 286/456/611/793) → percentages below. Clicking "Upgrades &
// Skills" opens the growth panel (the "option bar"): a Level control, +/- stat
// steppers that update the overlaid numbers live, the six primary-skill tiers
// (comm3), and the secondary skills that unlock at two Master-tier primaries.
// ---------------------------------------------------------------------------

// Icon rows measured in the golden frame at y≈218/361/512/660; the dynamic
// number sits just below each icon, x-centred on the ~117px stat column.
const STAT_WELLS: { key: keyof CommanderStats; topPct: number }[] = [
  { key: "attack", topPct: 25.0 },
  { key: "defense", topPct: 39.9 },
  { key: "health", topPct: 53.85 },
  { key: "speed", topPct: 68.3 }
];
const STAT_LEFT_PCT = 15.75;

type PrimaryLevels = Record<(typeof PRIMARY_SKILLS)[number]["key"], SkillTier>;

const ZERO_LEVELS = Object.fromEntries(
  PRIMARY_SKILLS.map((s) => [s.key, 0])
) as PrimaryLevels;

export function CommanderCard({
  slug,
  editable = true,
  className
}: {
  slug: CommanderSlug;
  editable?: boolean;
  className?: string;
}) {
  const def = commanderDefinitions[slug];
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(1);
  const [stats, setStats] = useState<CommanderStats>({ ...COMMANDER_BASE_STATS });
  const [primary, setPrimary] = useState<PrimaryLevels>({ ...ZERO_LEVELS });

  const unlockedSecondary = useMemo(
    () => SECONDARY_SKILLS.filter((s) => primary[s.requires[0]] >= 4 && primary[s.requires[1]] >= 4),
    [primary]
  );

  if (!def) return null;

  const bump = (key: keyof CommanderStats, delta: number) =>
    setStats((s) => ({ ...s, [key]: Math.max(0, s[key] + delta) }));

  const wrapStyle: CSSProperties = {
    containerType: "inline-size",
    position: "relative",
    width: "100%",
    maxWidth: 420,
    fontFamily: 'Georgia, "Times New Roman", serif'
  };

  return (
    <div className={className} style={wrapStyle}>
      <div style={{ position: "relative", width: "100%" }}>
        <img
          alt={`${def.name} — ${def.faction} Commander`}
          src={assetUrl(def.cardImage)}
          style={{ width: "100%", display: "block", borderRadius: "2.5cqw" }}
        />

        {/* Name + faction tag (overlaid on the banner — editable via data). */}
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

        {/* Signature abilities (bottom panel — editable via data). */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "87%",
            transform: "translate(-50%, -50%)",
            width: "80%",
            textAlign: "center",
            pointerEvents: "none",
            color: "#fff1c2"
          }}
        >
          <div style={{ fontSize: "2.1cqw", fontWeight: 700, letterSpacing: "0.3cqw", color: "#e6c56a", marginBottom: "1.2cqw" }}>
            SIGNATURE ABILITIES
          </div>
          {def.abilities.map((line, i) => (
            <div key={i} style={{ fontSize: "2.5cqw", fontWeight: 600, lineHeight: 1.15, marginTop: i ? "1cqw" : 0, textShadow: "1px 1px 0 #160e08" }}>
              {line}
            </div>
          ))}
        </div>

        {/* Dynamic (upgradeable) stat numbers overlaid on the empty frame wells. */}
        {STAT_WELLS.map(({ key, topPct }) => (
          <span
            key={key}
            style={{
              position: "absolute",
              left: `${STAT_LEFT_PCT}%`,
              top: `${topPct}%`,
              transform: "translate(-50%, -50%)",
              fontSize: "4.6cqw",
              fontWeight: 700,
              color: "#fff4c8",
              textShadow:
                "0 0 2px #140c07, 0 0 2px #140c07, 1px 1px 0 #140c07, -1px 1px 0 #140c07, 1px -1px 0 #140c07, -1px -1px 0 #140c07",
              pointerEvents: "none",
              lineHeight: 1
            }}
          >
            {stats[key]}
          </span>
        ))}

        {/* Level badge (top-left of the art window). */}
        <span
          style={{
            position: "absolute",
            left: "27.5%",
            top: "17%",
            transform: "translate(-50%, -50%)",
            fontSize: "3cqw",
            fontWeight: 700,
            color: "#f4d774",
            textShadow: "0 0 2px #000, 1px 1px 0 #000",
            pointerEvents: "none"
          }}
        >
          Lv {level}
        </span>
      </div>

      {editable && (
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "8px 12px",
            background: open ? "#3a2c1a" : "#241d16",
            color: "#f4d774",
            border: "1px solid #8d683c",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
            letterSpacing: 1
          }}
        >
          {open ? "▾ Upgrades & Skills" : "▸ Upgrades & Skills"}
        </button>
      )}

      {editable && open && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: "#1c1712",
            border: "1px solid #8d683c",
            borderRadius: 6,
            color: "#e8ddc6",
            fontSize: 13
          }}
        >
          {/* Level */}
          <Row label="Level">
            <Stepper value={level} onDec={() => setLevel((l) => Math.max(1, l - 1))} onInc={() => setLevel((l) => l + 1)} />
          </Row>

          {/* Dynamic base stats */}
          <div style={{ margin: "8px 0 4px", color: "#e6c56a", fontWeight: 700, letterSpacing: 1 }}>STATS (dynamic)</div>
          {STAT_WELLS.map(({ key }) => (
            <Row key={key} label={cap(key)}>
              <Stepper value={stats[key]} onDec={() => bump(key, -1)} onInc={() => bump(key, +1)} />
            </Row>
          ))}

          {/* Primary skills */}
          <div style={{ margin: "10px 0 4px", color: "#e6c56a", fontWeight: 700, letterSpacing: 1 }}>
            PRIMARY SKILLS <span style={{ opacity: 0.6, fontWeight: 400 }}>(pick 4 of 6)</span>
          </div>
          {PRIMARY_SKILLS.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 82, opacity: 0.9 }}>{s.label}</span>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {SKILL_TIERS.map((tierName, tier) => {
                  const active = primary[s.key] === tier;
                  return (
                    <button
                      key={tier}
                      title={`${tierName} → ${s.tiers[tier]}`}
                      onClick={() => setPrimary((p) => ({ ...p, [s.key]: tier as SkillTier }))}
                      style={{
                        minWidth: 22,
                        padding: "2px 4px",
                        fontSize: 11,
                        cursor: "pointer",
                        border: "1px solid #6b5433",
                        borderRadius: 3,
                        background: active ? "#7a5a2c" : "#2a2119",
                        color: active ? "#fff4c8" : "#b9a988"
                      }}
                    >
                      {tier === 0 ? "–" : tierName[0]}
                    </button>
                  );
                })}
              </div>
              <span style={{ marginLeft: "auto", minWidth: 46, textAlign: "right", color: "#fff4c8" }}>
                {s.tiers[primary[s.key]]}
              </span>
            </div>
          ))}

          {/* Secondary skills */}
          <div style={{ margin: "10px 0 4px", color: "#e6c56a", fontWeight: 700, letterSpacing: 1 }}>
            SECONDARY SKILLS <span style={{ opacity: 0.6, fontWeight: 400 }}>(2 Master primaries)</span>
          </div>
          {unlockedSecondary.length === 0 ? (
            <div style={{ opacity: 0.55 }}>None yet — raise two primaries to Master.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unlockedSecondary.map((s) => (
                <span
                  key={s.tag}
                  title={s.name}
                  style={{
                    padding: "2px 8px",
                    background: "#7a5a2c",
                    border: "1px solid #b9985a",
                    borderRadius: 12,
                    color: "#fff4c8",
                    fontSize: 12
                  }}
                >
                  [{s.tag}] {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const btn: CSSProperties = {
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
      <button onClick={onDec} style={btn} aria-label="decrease">−</button>
      <span style={{ minWidth: 22, textAlign: "center", color: "#fff4c8", fontWeight: 700 }}>{value}</span>
      <button onClick={onInc} style={btn} aria-label="increase">+</button>
    </span>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
