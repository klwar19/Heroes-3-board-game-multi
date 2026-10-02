"use client";

/**
 * Order & Chaos: a world boss approaches. Drawn over the board in step with the
 * music (src/lib/music.ts setBossApproach): while the warning plays the edges
 * pulse red behind hazard tape and WARNING blinks; once the boss theme swells
 * in, the boss is named with a countdown to its arrival; on the arrival a
 * flash and its name slammed across the field. Presentation only: the battle
 * knows when the boss is due (`director.bossDue`), nothing here touches it.
 * With reduced motion it is the same words and colors without the blinking,
 * scrolling or slamming.
 */

import { useSyncExternalStore } from "react";
import { ENEMIES, GW_TPS, type EnemyKind } from "@/engine/garrison/content";
import type { GarrisonState } from "@/engine/garrison/sim";
import { prefersReducedMotion, subscribeReducedMotion } from "@/lib/display-preferences";
import { BOSS_ARRIVAL_BEAT_S, BOSS_HUSH_S, BOSS_WARNING_LEAD_S } from "@/lib/music";
import styles from "./garrison.module.css";

/**
 * Seconds before the announced world boss steps onto the lawn; null when none is due.
 * (The battle runs at normal speed meanwhile — see GarrisonGame's frame loop — so they are real seconds.)
 */
export function bossApproachLeft(s: GarrisonState): number | null {
  const due = s.director.bossDue;
  if (!due || s.outcome || s.planning || s.cfg.mode === "versus") return null;
  return Math.max(0, due.at - s.tick) / GW_TPS;
}

/** The boss that just arrived (shown for a moment), keyed so a second arrival replays. */
export type BossArrival = { kind: EnemyKind; key: number };

function bossName(kind: EnemyKind | undefined): string {
  return (kind && ENEMIES[kind]?.name) || "The world boss";
}

export function BossOmen({ left, kind, arrival }: { left: number | null; kind: EnemyKind | undefined; arrival: BossArrival | null }) {
  const calm = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const stage = left === null || left > BOSS_WARNING_LEAD_S + BOSS_HUSH_S ? null : left > BOSS_ARRIVAL_BEAT_S ? "warn" : "near";
  if (!stage && !arrival) return null;
  const rootClass = `${styles.omen} ${calm ? styles.omenCalm : ""}`;
  if (arrival) {
    return (
      <div aria-live="assertive" className={rootClass} key={`arrive-${arrival.key}`}>
        <div className={styles.omenFlash} />
        <div className={styles.omenSlam}>
          <span className={styles.omenSlamName}>{bossName(arrival.kind)}</span>
          <span className={styles.omenSlamSub}>has come!</span>
        </div>
      </div>
    );
  }
  return (
    <div aria-live="polite" className={`${rootClass} ${stage === "near" ? styles.omenNear : ""}`}>
      <div className={styles.omenVignette} />
      <div className={`${styles.omenTape} ${styles.omenTapeTop}`} />
      <div className={`${styles.omenTape} ${styles.omenTapeBottom}`} />
      {stage === "warn" ? (
        <div className={styles.omenText}>
          <span className={styles.omenWarn}>⚠ WARNING ⚠</span>
          <span className={styles.omenSub}>Something enormous is coming. Brace the lanes!</span>
        </div>
      ) : (
        <div className={styles.omenText}>
          <span className={styles.omenName}>{bossName(kind)}</span>
          <span className={styles.omenSub}>approaches!</span>
          <span className={styles.omenCount} key={Math.ceil(left ?? 0)}>{Math.max(1, Math.ceil(left ?? 0))}</span>
        </div>
      )}
    </div>
  );
}
