"use client";

/**
 * Order & Chaos: a world boss's wail (WarbossMove "wail", the Frost Wyrm's
 * Banshee's Wail). While it winds the wail up, frost creeps in over the edges
 * of the battle and the colours go cold; as it lands, the face of a screaming
 * ghost woman flashes over the whole battle for a moment, then the frost holds
 * while the troops stay frozen and thaws away. Presentation only: the battle
 * freezes the troops (sim.ts landBossMove); nothing here touches it. With
 * reduced motion the face fades in and out softly instead of lunging and
 * shaking.
 */

import { useSyncExternalStore } from "react";
import { ENEMIES, type EnemyKind } from "@/engine/garrison/content";
import { assetUrl } from "@/lib/asset-url";
import { prefersReducedMotion, subscribeReducedMotion } from "@/lib/display-preferences";
import { image } from "./art";
import styles from "./garrison.module.css";

const FACE = "/assets/order-chaos/boss/wyrm-wail.webp";
const FROST = "/assets/order-chaos/boss/frost-frame.webp";

/** `chill`: the wail is winding up; `scare`: it has just landed. Keyed so a second wail replays. */
export type WailCue = { stage: "chill" | "scare"; key: number };

/** How long each stage stays on screen (ms) when nothing follows it. */
export const WAIL_CHILL_MS = 4000;
export const WAIL_SCARE_MS = 3200;

/** Does this boss wail? */
export function bossWails(kind: EnemyKind | undefined): boolean {
  return !!kind && !!ENEMIES[kind]?.warboss?.moves.some((move) => move.kind === "wail");
}

/** Fetch and decode the wail's pictures ahead of time, so the face is there the instant the wail lands. */
export function preloadWailArt(): void {
  image(FACE);
  image(FROST);
}

export function WailOverlay({ cue }: { cue: WailCue | null }) {
  const calm = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  if (!cue) return null;
  return (
    <div aria-hidden className={`${styles.wail} ${cue.stage === "scare" ? styles.wailScare : styles.wailChill} ${calm ? styles.wailCalm : ""}`} key={`${cue.stage}-${cue.key}`}>
      <div className={styles.wailCold} />
      <div className={styles.wailFrost} style={{ backgroundImage: `url(${assetUrl(FROST)})` }} />
      {cue.stage === "scare" ? (
        <>
          <div className={styles.wailFace} style={{ backgroundImage: `url(${assetUrl(FACE)})` }} />
          <div className={styles.wailFlash} />
        </>
      ) : null}
    </div>
  );
}
