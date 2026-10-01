"use client";

/**
 * Order & Chaos battlefield UI (the systems are in engine/garrison/order-chaos/field.ts):
 * the "On this field" panel of the prep screen, the Almanac's Field tab, the
 * battle HUD's night/weather badge, hover tips for the lawn's tiles, landmarks
 * and structures, and Crag Hack's first-time lines and toasts in battle.
 * Everything shown is built from the catalog, so it matches the rules.
 */

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { CARDS, DEFENDERS, ENEMIES, GW_TPS } from "@/engine/garrison/content";
import { OC_LEVELS, fieldCardsFor, type OcLevel } from "@/engine/garrison/order-chaos/campaign";
import {
  FIELD, FIELD_FEATURES, FIELD_FEATURE_ORDER, TILE_KIND, WEATHER_NAMES, fieldFeatures, weatherPlan, weatherStepAt, type FieldFeature
} from "@/engine/garrison/order-chaos/field";
import type { OcLine } from "@/engine/garrison/order-chaos/story";
import { craterAt, hasFooting, icedAt, lawnStructureAt, tileCode, type GarrisonEvent, type GarrisonState } from "@/engine/garrison/sim";
import { assetUrl } from "@/lib/asset-url";
import styles from "../garrison.module.css";
import type { Tip } from "../hud";
import { CardArt } from "../thumbs";
import { AdvisorBubble } from "./story-ui";
import fs from "./field.module.css";

/** A feature's painted icon (its glyph while the art is missing); field packets show their card. */
export function FieldIcon({ feature, size = 40 }: { feature: FieldFeature; size?: number }) {
  const [failed, setFailed] = useState(false);
  const card = feature.group === "card" ? feature.id.slice(5) : null;
  if (card && CARDS[card]?.places) return <CardArt card={card} size={size} />;
  if (failed) return <span aria-hidden className={fs.glyph} style={{ width: size, height: size, fontSize: size * 0.62 }}>{feature.glyph}</span>;
  return <img alt="" className={fs.icon} draggable={false} onError={() => setFailed(true)} src={assetUrl(feature.icon)} style={{ width: size, height: size }} />;
}

/** The level where each feature is first met (campaign order). */
const FIRST_MET: Readonly<Record<string, string>> = (() => {
  const first: Record<string, string> = {};
  for (const level of OC_LEVELS) for (const id of fieldFeatures(level)) first[id] ??= level.id;
  return first;
})();

/** Features met in the levels cleared so far (the Almanac's Field tab). */
export function metFieldFeatures(cleared: readonly string[]): Set<string> {
  const met = new Set<string>();
  for (const level of OC_LEVELS) if (cleared.includes(level.id)) for (const id of fieldFeatures(level)) met.add(id);
  return met;
}

/** The prep screen's "On this field": every system the level switches on, one line each; Crag explains the new ones. */
export function FieldPanel({ level, hand = [] }: { level: OcLevel; hand?: readonly string[] }) {
  // The packets this hand will get too (a Wake-Up Brew for night folk in a day battle).
  const ids = fieldFeatures({ ...level, fieldCards: fieldCardsFor(level, hand) });
  if (!ids.length) return null;
  const plan = weatherPlan(level.weather);
  const fresh = ids.filter((id) => FIRST_MET[id] === level.id);
  return (
    <section className={`${styles.panel} ${fs.panel}`}>
      <h2>On this field</h2>
      <ul className={fs.list}>
        {ids.map((id) => {
          const f = FIELD_FEATURES[id]!;
          return (
            <li className={fs.item} key={id}>
              <FieldIcon feature={f} size={34} />
              <span>
                <strong>{f.name}{fresh.includes(id) ? <em className={fs.newTag}>New</em> : null}</strong>
                <small>{f.rule}</small>
              </span>
            </li>
          );
        })}
      </ul>
      {plan ? <p className={styles.note}>Weather: {plan}.</p> : null}
      {/* Crag's first-time lines play in the level's talk (newFieldLines); the newest one stays here as a reminder. */}
      {fresh.length ? <AdvisorBubble compact line={FIELD_FEATURES[fresh[fresh.length - 1]!]!.crag} /> : null}
    </section>
  );
}

/** Crag's first-time lines for the features this level brings in (appended to its talk). */
export function newFieldLines(level: OcLevel): OcLine[] {
  return fieldFeatures(level).filter((id) => FIRST_MET[id] === level.id).map((id) => FIELD_FEATURES[id]!.crag);
}

/** The Almanac's Field tab: every battlefield system, the ones met so far explained. */
export function FieldAlmanac({ cleared }: { cleared: readonly string[] }) {
  const met = metFieldFeatures(cleared);
  return (
    <div className={fs.almanac}>
      {FIELD_FEATURE_ORDER.map((id) => {
        const f = FIELD_FEATURES[id]!;
        const open = met.has(id);
        const where = OC_LEVELS.find((level) => level.id === FIRST_MET[id]);
        return (
          <div className={`${fs.entry} ${open ? "" : fs.locked}`} key={id}>
            {open ? <FieldIcon feature={f} size={48} /> : <span className={fs.glyph} style={{ width: 48, height: 48, fontSize: 28 }}>?</span>}
            <div>
              <strong>{open ? f.name : "???"}</strong>
              {open ? <p>{f.rule}</p> : <small>{where ? `First met in ${where.world}-${where.id.split("-")[1]}: ${where.name}.` : "Not met yet."}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Battle HUD

const secs = (ticks: number) => Math.max(0, Math.ceil(ticks / GW_TPS));

/** Night and weather chips beside the wave meter; hover for the rule. */
export function FieldBadge({ s, onTip }: { s: GarrisonState; onTip(tip: Tip): void }) {
  const night = s.cfg.oc?.night === true;
  const w = s.weather;
  if (!night && (!w || (w.kind === "clear" && !s.cfg.oc?.weather?.length))) return null;
  const steps = s.cfg.oc?.weather ?? [];
  const next = w ? steps[w.step + 1] ?? (w.step < 0 ? steps[0] : undefined) : undefined;
  const chips: FieldFeature[] = [];
  if (night) chips.push(FIELD_FEATURES["weather:night"]!);
  if (w && w.kind !== "clear") chips.push(FIELD_FEATURES[`weather:${w.kind}`]!);
  const upcoming = next && (next.wave ?? 0) > s.director.wave ? `Next: ${WEATHER_NAMES[next.kind]} at wave ${next.wave}.` : null;
  return (
    <div className={fs.badge} aria-label="Battlefield conditions">
      {chips.map((f) => (
        <span
          className={fs.chip}
          key={f.id}
          onMouseEnter={() => onTip({ title: f.name, lines: [f.rule, ...(upcoming ? [upcoming] : [])] })}
          onMouseLeave={() => onTip(null)}
        >
          <FieldIcon feature={f} size={24} />
          {f.name}
        </span>
      ))}
      {!chips.length && upcoming ? (
        <span className={fs.chip} onMouseEnter={() => onTip({ title: "Clear skies", lines: [upcoming] })} onMouseLeave={() => onTip(null)}>☀ Clear</span>
      ) : null}
    </div>
  );
}

/** What the player is pointing at on the lawn, when it is part of the battlefield (null: nothing to say). */
export function fieldTipAt(s: GarrisonState, lane: number, col: number): Tip {
  if (!s.cfg.oc) return null;
  const lines: string[] = [];
  let title = "";
  const structure = lawnStructureAt(s, lane, col);
  if (structure) {
    const def = ENEMIES[structure.kind]!;
    title = def.name;
    lines.push(`${Math.max(0, Math.round(structure.hp))} / ${structure.maxHp}`, def.blurb);
  }
  const d = s.defenders.find((unit) => !unit.dead && unit.lane === lane && unit.col === col);
  if (d && DEFENDERS[d.kind]!.landmark) {
    title ||= DEFENDERS[d.kind]!.name;
    lines.push(`${Math.max(0, Math.round(d.hp))} / ${d.maxHp}`, DEFENDERS[d.kind]!.blurb);
  }
  const kind = TILE_KIND[tileCode(s, lane, col)];
  if (kind) {
    const f = FIELD_FEATURES[`tile:${kind === "ridge" ? "roof" : kind}`];
    if (f) {
      const footing = hasFooting(s, lane, col);
      title ||= kind === "ridge" ? "Roof ridge" : footing ? (kind === "water" ? "Raft" : "Crate") : f.name;
      lines.push(kind === "bridge" ? FIELD_FEATURES["tile:bridge"]!.rule : f.rule);
      if (footing) lines.push(kind === "water" ? "A raft is laid here: any troop can stand on it." : "A crate is set here: any troop can stand on it.");
    }
  }
  if (icedAt(s, lane, col)) {
    title ||= "Ice";
    const left = (s.field!.ice[lane * 9 + col] ?? 0) - s.tick;
    lines.push(`${FIELD_FEATURES["tile:ice"]!.rule} (melts in ${secs(left)} s)`);
  }
  if (craterAt(s, lane, col)) {
    title ||= "Crater";
    const left = (s.field!.crater[lane * 9 + col] ?? 0) - s.tick;
    lines.push(`${FIELD_FEATURES["tile:crater"]!.rule} (${secs(left)} s left)`);
  }
  if (!lines.length) return null;
  return { title, lines };
}

/** Crag's line the first time a battlefield moment happens in this battle (null: nothing new). */
export function fieldQuip(ev: GarrisonEvent, s: GarrisonState, said: Set<string>): OcLine | null {
  let id: string | null = null;
  if (ev.e === "weather" && ev.kind !== "clear") id = `weather:${ev.kind}`;
  else if (ev.e === "emerge" && ev.origin !== "crypt") id = `origin:${ev.origin}`;
  else if (ev.e === "iced") id = "tile:ice";
  else if (ev.e === "lull") id = "card:oc-brew";
  else if (ev.e === "wake" && s.enemies.some((e) => e.id === ev.id)) id = "structure:oc-bank";
  if (!id || said.has(id)) return null;
  said.add(id);
  return FIELD_FEATURES[id]?.crag ?? null;
}

/** A toast for a battlefield moment (null: none). */
export function fieldToast(ev: GarrisonEvent, s: GarrisonState): { text: string; tone: "warn" | "info" | "boss" } | null {
  switch (ev.e) {
    case "weather":
      if (ev.kind === "clear") return { text: "The skies clear.", tone: "info" };
      return { text: `${WEATHER_NAMES[ev.kind]}! ${FIELD_FEATURES[`weather:${ev.kind}`]?.rule ?? ""}`, tone: "warn" };
    case "bankFreed":
      return { text: `The creature bank is broken — ${DEFENDERS[ev.kind]?.name ?? "a troop"} joins you!`, tone: "info" };
    case "loot":
      return { text: `A thief pocketed a treasure chest (${ev.value} gold) — slay it to get the gold back!`, tone: "warn" };
    case "lull": {
      const d = s.defenders.find((unit) => unit.id === ev.target);
      return { text: `A Nightmare put your ${d ? DEFENDERS[d.kind]!.name : "troop"} to sleep — pour a Wake-Up Brew on it.`, tone: "warn" };
    }
    default:
      return null;
  }
}

/** The ice-melt and crater numbers for places the text needs them. */
export const FIELD_TIMES = { iceMelt: secs(FIELD.iceMelt), crater: secs(FIELD.crater) };

/** Whether a weather plan changes during the battle (for the prep text). */
export function weatherTurns(level: OcLevel): boolean {
  return weatherStepAt(level.weather, 0) !== weatherStepAt(level.weather, level.waves);
}
