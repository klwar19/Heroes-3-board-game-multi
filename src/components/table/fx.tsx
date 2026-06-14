"use client";

import { useEffect, useRef } from "react";
import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { getDeckBack } from "@/data/decks";
import { getFxSheet } from "@/data/fx";
import {
  playCardPlace,
  playCardSwish,
  playLibrarySound,
  playMeleeImpact,
  playProjectileImpact,
  playShuffle,
  playWhoosh
} from "@/lib/sound";

/**
 * Presentation layer for everything that physically moves on the table:
 * card flights (draw / play / discard), Heroes III spell sprites, spell
 * projectiles and damage floaters. Cues anchor to live DOM rects through
 * data attributes, so seat layout, board flipping and window size never
 * desync the animation from the table:
 *
 *   "deck:p1" / "discard:p1" / "hand:p1"   data-fx-anchor on seats
 *   "deck:shared-spells" etc.              data-fx-anchor on the deck wells
 *   "unit:<unitId>"                        data-fx-unit on battle cells
 *   "cell:<index>"                         data-fx-cell on battle cells
 *   "center"                               the viewport center stage
 *
 * Cues are fire-and-forget: a missing anchor (seat scrolled away, combat
 * ended) consumes the cue silently instead of erroring, so stale cues
 * self-heal. The game state is already final before any animation starts -
 * this layer is pure presentation and can never desync multiplayer state.
 */

export type FxCue =
  | {
      kind: "flight";
      id: string;
      from: string;
      to: string;
      /** Face shown after the flip; omitted = stays face down. */
      cardId?: string;
      deckId?: string;
      /** Pause enlarged at center stage (casting / playing a card). */
      holdMs?: number;
      delayMs?: number;
      sound?: boolean;
    }
  | {
      /** A combat unit sliding from one battle cell to another. */
      kind: "move";
      id: string;
      unitId: string;
      from: string;
      to: string;
      cardImage?: string;
      /** The card reads upside-down on the board (p1 / flipped view). */
      flip?: boolean;
      delayMs?: number;
    }
  | { kind: "sprite"; id: string; fxKey: string; at: string; delayMs?: number; sound?: string }
  | {
      kind: "projectile";
      id: string;
      fxKey: string;
      from: string;
      to: string;
      hitFxKey?: string;
      delayMs?: number;
      sound?: string;
      hitSound?: string;
    }
  | { kind: "floater"; id: string; at: string; text: string; tone: "damage" | "heal" | "info"; delayMs?: number }
  | { kind: "pulse"; id: string; at: string; text?: string; delayMs?: number }
  | {
      /**
       * The attacking unit's own card thrusts at its target (melee) or kicks
       * back as it looses a shot (ranged). Animates the real board card so it
       * reads as the unit itself moving; `to` points the lunge at the
       * defender's cell and `flip` matches the card's on-board orientation.
       */
      kind: "lunge";
      id: string;
      attackerId: string;
      to: string;
      attackKind: "melee" | "ranged";
      flip?: boolean;
      delayMs?: number;
    }
  | {
      /** The struck unit's card recoils in place at the moment of impact. */
      kind: "shake";
      id: string;
      unitId: string;
      delayMs?: number;
    }
  | {
      /** A melee strike flash (placeholder slash) landing on a cell. */
      kind: "slash";
      id: string;
      at: string;
      delayMs?: number;
    }
  | {
      /** A placeholder ranged projectile flying from one cell to another. */
      kind: "bolt";
      id: string;
      from: string;
      to: string;
      delayMs?: number;
    };

/** Flight timing shared with the cue builders in page.tsx. */
export const FLIGHT_MS = 620;
export const HOLD_CENTER_MS = 900;
export const FLIGHT_OUT_MS = 480;
export const DRAW_STAGGER_MS = 120;

/** A combat unit's card glides between battle cells over this long. */
export const COMBAT_MOVE_MS = 640;

/**
 * Attack choreography. From the attack being declared to the blow landing is
 * `ATTACK_IMPACT_MS`; the damage number, hurt cry, slash and the struck unit's
 * recoil are all aligned to that beat (page.tsx advances its cue timeline by
 * exactly this much per attack). A ranged shot leaves the shooter after
 * `RANGED_RELEASE_MS` and its projectile flies for the remainder, so it lands
 * on the same beat as a melee strike.
 */
export const ATTACK_IMPACT_MS = 500;
export const RANGED_RELEASE_MS = 120;
const BOLT_FLIGHT_MS = ATTACK_IMPACT_MS - RANGED_RELEASE_MS;
/** Full attacker lunge (thrust then recover); the thrust peaks near impact. */
const MELEE_LUNGE_MS = 820;
/** A shooter's recoil kick as the shot is released. */
const RANGED_RECOIL_MS = 440;
/** The struck unit's recoil vibration. */
const DEFENDER_SHAKE_MS = 360;
/** The melee slash flash sweeping across the target. */
const MELEE_SLASH_MS = 320;
/** The little burst where a projectile lands. */
const PROJECTILE_IMPACT_MS = 260;
/**
 * Neutral fights only: once a guard has slid into place the board holds for
 * this long so the table reads the move before the attack die is thrown.
 */
export const NEUTRAL_ATTACK_PAUSE_MS = 2000;

const SAFETY_TIMEOUT_MS = 9000;

function resolveAnchorRect(anchor: string): DOMRect | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (anchor === "center") {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return new DOMRect(w / 2 - 70, h / 2 - 98, 140, 196);
  }
  const [kind, value] = anchor.split(":", 2);
  const element =
    kind === "unit"
      ? document.querySelector(`[data-fx-unit="${value}"]`)
      : kind === "cell"
        ? document.querySelector(`[data-fx-cell="${value}"]`)
        : document.querySelector(`[data-fx-anchor="${anchor}"]`);
  return element ? element.getBoundingClientRect() : null;
}

function centerOf(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function makeCardFaceElement(cardId: string | undefined): HTMLElement {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const src = card?.assets?.cardImage;
  if (src) {
    const img = document.createElement("img");
    img.src = assetUrl(src);
    img.alt = card?.name ?? "card";
    img.className = "fxCardFace";
    return img;
  }
  const div = document.createElement("div");
  div.className = "fxCardFace fxCardFaceFallback";
  div.textContent = card?.name ?? cardId ?? "";
  return div;
}

function makeCardBackElement(deckId: string | undefined): HTMLElement {
  const back = getDeckBack(deckId);
  if (back.image) {
    const img = document.createElement("img");
    img.src = assetUrl(back.image);
    img.alt = back.label;
    img.className = "fxCardBack";
    return img;
  }
  const div = document.createElement("div");
  div.className = `fxCardBack cardBack back-${back.styleKey}`;
  const span = document.createElement("span");
  span.textContent = "H3";
  div.appendChild(span);
  return div;
}

function animate(element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  return new Promise((resolve) => {
    const animation = element.animate(keyframes, options);
    animation.onfinish = () => resolve();
    animation.oncancel = () => resolve();
  });
}

/** Translate+scale transform that maps a card sized for `to` onto `from`. */
function rectTransform(from: DOMRect, to: { x: number; y: number; w: number; h: number }): string {
  const fromCenter = centerOf(from);
  const dx = fromCenter.x - to.x;
  const dy = fromCenter.y - to.y;
  const scale = Math.max(0.2, Math.min(from.width / to.w, from.height / to.h));
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

async function runFlight(stage: HTMLElement, cue: Extract<FxCue, { kind: "flight" }>): Promise<void> {
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.to);
  if (!fromRect || !toRect) {
    return;
  }

  // The traveling card is sized like a hand card; source/target rects are
  // matched with transforms so piles, fans and cells all look right.
  const w = 96;
  const h = Math.round((w * 7) / 5);

  const holder = document.createElement("div");
  holder.className = "fxFlight";
  holder.style.width = `${w}px`;
  holder.style.height = `${h}px`;

  const flipper = document.createElement("div");
  flipper.className = "fxFlipper";
  const back = makeCardBackElement(cue.deckId);
  flipper.appendChild(back);
  if (cue.cardId !== undefined) {
    flipper.appendChild(makeCardFaceElement(cue.cardId));
    flipper.classList.add("hasFace");
  }
  holder.appendChild(flipper);
  stage.appendChild(holder);

  const place = (point: { x: number; y: number }) => {
    holder.style.left = `${point.x - w / 2}px`;
    holder.style.top = `${point.y - h / 2}px`;
  };

  try {
    const start = centerOf(fromRect);
    place(start);
    if (cue.sound !== false) {
      playCardSwish();
    }

    const showsFace = cue.cardId !== undefined;
    const flipKeyframes = showsFace ? { from: "rotateY(180deg)", mid: "rotateY(90deg)", to: "rotateY(0deg)" }
      : { from: "rotateY(180deg)", mid: "rotateY(180deg)", to: "rotateY(180deg)" };

    if (cue.holdMs) {
      // Hand -> center stage (read the card) -> destination pile.
      const center = resolveAnchorRect("center")!;
      const centerPoint = centerOf(center);
      const startTransform = rectTransform(fromRect, { ...centerPoint, w, h });
      await animate(
        holder,
        [
          { transform: `${startTransform}`, offset: 0 },
          { transform: "translate(0, 0) scale(1.65)", offset: 1 }
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.25, 0.8, 0.3, 1)", fill: "forwards" }
      );
      place(centerPoint);
      holder.style.transform = "scale(1.65)";
      void animate(
        flipper,
        [{ transform: flipKeyframes.from }, { transform: flipKeyframes.to }],
        { duration: Math.min(FLIGHT_MS, 420), easing: "ease-out", fill: "forwards" }
      );
      holder.classList.add("held");
      await new Promise((resolve) => setTimeout(resolve, cue.holdMs));
      holder.classList.remove("held");

      const finalRect = resolveAnchorRect(cue.to) ?? toRect;
      const finalCenter = centerOf(finalRect);
      const exitScale = Math.max(0.2, Math.min(finalRect.width / w, finalRect.height / h));
      await animate(
        holder,
        [
          { transform: "translate(0, 0) scale(1.65)" },
          {
            transform: `translate(${finalCenter.x - centerPoint.x}px, ${finalCenter.y - centerPoint.y}px) scale(${exitScale})`
          }
        ],
        { duration: FLIGHT_OUT_MS, easing: "cubic-bezier(0.5, 0, 0.75, 0.9)", fill: "forwards" }
      );
      playCardPlace();
      return;
    }

    // Straight flight (draw / discard): lift, arc, settle.
    const end = centerOf(toRect);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const startScale = Math.max(0.2, Math.min(fromRect.width / w, fromRect.height / h));
    const endScale = Math.max(0.2, Math.min(toRect.width / w, toRect.height / h));
    const drift = Math.random() * 6 - 3;

    void animate(
      flipper,
      [
        { transform: flipKeyframes.from, offset: 0 },
        { transform: flipKeyframes.mid, offset: 0.5 },
        { transform: flipKeyframes.to, offset: 1 }
      ],
      { duration: FLIGHT_MS, easing: "ease-in-out", fill: "forwards" }
    );
    await animate(
      holder,
      [
        { transform: `translate(0px, 0px) scale(${startScale}) rotate(0deg)`, offset: 0 },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 36}px) scale(${Math.max(startScale, endScale) * 1.12}) rotate(${drift}deg)`,
          offset: 0.55
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${endScale}) rotate(0deg)`, offset: 1 }
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.3, 0.7, 0.35, 1)", fill: "forwards" }
    );
    playCardPlace();
  } finally {
    holder.remove();
  }
}

/**
 * A combat unit gliding from one cell to another. By the time this runs the
 * board already shows the unit at its destination, so we hide the real card
 * and fly a ghost copy from the old square along a gentle arc, leaving a short
 * fading trail of after-images behind it. A missing card (combat ended, unit
 * removed) consumes the cue silently.
 */
async function runMove(stage: HTMLElement, cue: Extract<FxCue, { kind: "move" }>): Promise<void> {
  const fromRect = resolveAnchorRect(cue.from);
  // Size and land on the real card so the ghost lines up exactly when it stops.
  const realCard = document.querySelector(`[data-fx-unit="${cue.unitId}"] .boardCard`);
  const toRect = realCard instanceof HTMLElement ? realCard.getBoundingClientRect() : resolveAnchorRect(cue.to);
  if (!fromRect || !toRect || toRect.width === 0) {
    return;
  }

  const w = toRect.width;
  const h = toRect.height;
  const start = centerOf(fromRect);
  const end = centerOf(toRect);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Longer hops lift a touch higher, capped so neighbouring steps stay grounded.
  const lift = Math.min(26, 8 + Math.hypot(dx, dy) * 0.06);
  const rotate = cue.flip ? " rotate(180deg)" : "";

  const makeGhost = (): HTMLElement => {
    const ghost = document.createElement("div");
    ghost.className = "fxMoveGhost";
    ghost.style.width = `${w}px`;
    ghost.style.height = `${h}px`;
    ghost.style.left = `${start.x - w / 2}px`;
    ghost.style.top = `${start.y - h / 2}px`;
    if (cue.cardImage) {
      const img = document.createElement("img");
      img.src = assetUrl(cue.cardImage);
      img.alt = "";
      img.className = "fxMoveGhostCard";
      img.style.transform = rotate.trim() || "none";
      ghost.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "fxMoveGhostCard fxMoveGhostFallback";
      fallback.style.transform = rotate.trim() || "none";
      ghost.appendChild(fallback);
    }
    return ghost;
  };

  const keyframes: Keyframe[] = [
    { transform: `translate(0px, 0px)${rotate} scale(1)`, offset: 0 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px)${rotate} scale(1.06)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px)${rotate} scale(1)`, offset: 1 }
  ];
  const easing = "cubic-bezier(0.34, 0.72, 0.36, 1)";

  // Two faint after-images lag behind the leader for a sense of speed.
  const trail = [0, 1, 2].map((index) => {
    const node = makeGhost();
    if (index > 0) {
      node.classList.add("fxMoveEcho");
      node.style.opacity = `${0.26 - (index - 1) * 0.11}`;
    }
    stage.appendChild(node);
    return { node, index };
  });

  const realEl = realCard instanceof HTMLElement ? realCard : null;
  if (realEl) {
    realEl.style.opacity = "0";
  }

  try {
    await Promise.all(
      trail.map(({ node, index }) =>
        animate(node, keyframes, {
          duration: COMBAT_MOVE_MS + index * 70,
          easing,
          fill: "forwards"
        })
      )
    );
  } finally {
    for (const { node } of trail) {
      node.remove();
    }
    if (realEl) {
      realEl.style.opacity = "";
    }
  }
}

/** The live board card for a unit, if it is currently rendered on screen. */
function boardCardFor(unitId: string): HTMLElement | null {
  const el = document.querySelector(`[data-fx-unit="${unitId}"] .boardCard`);
  return el instanceof HTMLElement ? el : null;
}

/**
 * The attacker's own card thrusts at the target (melee) or kicks back as it
 * looses a shot (ranged), then settles. The card lives inside the battlefield,
 * which is rotated 180° in the defender's seat view (and p1's cards carry their
 * own 180° flip), so the animation is composited onto the card's existing
 * transform (`composite: "add"`) and the screen-space lunge vector is flipped
 * back into that rotated frame when `flip` is set. A removed attacker (combat
 * ended) or a missing target consumes the cue silently.
 */
async function runLunge(cue: Extract<FxCue, { kind: "lunge" }>): Promise<void> {
  const card = boardCardFor(cue.attackerId);
  const targetRect = resolveAnchorRect(cue.to);
  if (!card || !targetRect) {
    return;
  }
  const cardRect = card.getBoundingClientRect();
  if (cardRect.width === 0) {
    return;
  }

  const from = centerOf(cardRect);
  const to = centerOf(targetRect);
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / dist;
  const uy = (to.y - from.y) / dist;
  // Map the screen-space direction into the (possibly 180°-rotated) frame the
  // card's own transform lives in.
  const sign = cue.flip ? -1 : 1;

  card.style.zIndex = "6";
  try {
    if (cue.attackKind === "ranged") {
      const kick = Math.min(dist * 0.14, cardRect.width * 0.32);
      const kx = -sign * ux * kick;
      const ky = -sign * uy * kick;
      await animate(
        card,
        [
          { transform: "translate(0px, 0px)", offset: 0 },
          { transform: `translate(${kx}px, ${ky}px)`, offset: 0.28 },
          { transform: `translate(${kx * 0.4}px, ${ky * 0.4}px)`, offset: 0.5 },
          { transform: "translate(0px, 0px)", offset: 1 }
        ],
        { duration: RANGED_RECOIL_MS, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", composite: "add" }
      );
      return;
    }

    const reach = Math.min(dist * 0.46, cardRect.width * 0.8);
    const fx = sign * ux * reach;
    const fy = sign * uy * reach;
    const bx = -sign * ux * reach * 0.16;
    const by = -sign * uy * reach * 0.16;
    // Perpendicular jitter gives the thrust a brief shake at the moment of contact.
    const jit = cardRect.width * 0.07;
    const px = -uy * jit;
    const py = ux * jit;
    await animate(
      card,
      [
        { transform: "translate(0px, 0px)", offset: 0 },
        { transform: `translate(${bx}px, ${by}px)`, offset: 0.22 },
        { transform: `translate(${fx}px, ${fy}px)`, offset: 0.56 },
        { transform: `translate(${fx + px}px, ${fy + py}px)`, offset: 0.63 },
        { transform: `translate(${fx - px}px, ${fy - py}px)`, offset: 0.7 },
        { transform: `translate(${fx * 0.45}px, ${fy * 0.45}px)`, offset: 0.82 },
        { transform: "translate(0px, 0px)", offset: 1 }
      ],
      { duration: MELEE_LUNGE_MS, easing: "cubic-bezier(0.34, 0.62, 0.28, 1)", composite: "add" }
    );
  } finally {
    card.style.zIndex = "";
  }
}

/**
 * The struck unit's card vibrates in place. Composited onto the card's resting
 * transform and built from symmetric jitter, so it reads the same whichever way
 * the board (or the card) is flipped. A unit destroyed by the blow is no longer
 * on the board, so the cue simply finds no card and ends — the slash on its
 * cell and its death cry carry the hit instead.
 */
async function runShake(cue: Extract<FxCue, { kind: "shake" }>): Promise<void> {
  const card = boardCardFor(cue.unitId);
  if (!card || card.getBoundingClientRect().width === 0) {
    return;
  }
  await animate(
    card,
    [
      { transform: "translate(0px, 0px) scale(1)", offset: 0 },
      { transform: "translate(-3px, 2px) scale(1.05)", offset: 0.15 },
      { transform: "translate(3px, -2px) scale(1.03)", offset: 0.3 },
      { transform: "translate(-3px, 1px) scale(1.02)", offset: 0.45 },
      { transform: "translate(2px, -1px) scale(1.01)", offset: 0.62 },
      { transform: "translate(-1px, 1px) scale(1)", offset: 0.8 },
      { transform: "translate(0px, 0px) scale(1)", offset: 1 }
    ],
    { duration: DEFENDER_SHAKE_MS, easing: "ease-out", composite: "add" }
  );
}

/**
 * A melee strike landing: a bright slash streak sweeps across the target cell
 * with an impact spark at its center. Anchored to the cell (not the unit) so it
 * still plays on a killing blow. Placeholder art — a real slash sprite can drop
 * straight into this handler later.
 */
async function runSlash(stage: HTMLElement, cue: Extract<FxCue, { kind: "slash" }>): Promise<void> {
  const rect = resolveAnchorRect(cue.at);
  if (!rect) {
    return;
  }
  const center = centerOf(rect);
  const reach = Math.max(rect.width, rect.height);
  const angle = -32 - Math.random() * 46;

  const container = document.createElement("div");
  container.className = "fxSlash";
  container.style.left = `${center.x}px`;
  container.style.top = `${center.y}px`;
  container.style.setProperty("--fx-slash-rot", `${angle}deg`);

  const streak = document.createElement("div");
  streak.className = "fxSlashStreak";
  streak.style.width = `${reach * 1.15}px`;

  const spark = document.createElement("div");
  spark.className = "fxSlashSpark";

  container.append(streak, spark);
  stage.appendChild(container);
  playMeleeImpact();

  try {
    await Promise.all([
      animate(
        streak,
        [
          { transform: "translate(-50%, -50%) translateX(-55%) scaleX(0.15)", opacity: 0, offset: 0 },
          { transform: "translate(-50%, -50%) translateX(-12%) scaleX(1)", opacity: 1, offset: 0.35 },
          { transform: "translate(-50%, -50%) translateX(22%) scaleX(1.05)", opacity: 0, offset: 1 }
        ],
        { duration: MELEE_SLASH_MS, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }
      ),
      animate(
        spark,
        [
          { transform: "translate(-50%, -50%) scale(0.3)", opacity: 0, offset: 0 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95, offset: 0.3 },
          { transform: "translate(-50%, -50%) scale(1.5)", opacity: 0, offset: 1 }
        ],
        { duration: MELEE_SLASH_MS, easing: "ease-out" }
      )
    ]);
  } finally {
    container.remove();
  }
}

/** The little burst of light where a projectile lands. */
async function runProjectileImpact(stage: HTMLElement, point: { x: number; y: number }): Promise<void> {
  const spark = document.createElement("div");
  spark.className = "fxImpactSpark";
  spark.style.left = `${point.x}px`;
  spark.style.top = `${point.y}px`;
  stage.appendChild(spark);
  playProjectileImpact();
  try {
    await animate(
      spark,
      [
        { transform: "translate(-50%, -50%) scale(0.3)", opacity: 0, offset: 0 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 0.9, offset: 0.3 },
        { transform: "translate(-50%, -50%) scale(1.6)", opacity: 0, offset: 1 }
      ],
      { duration: PROJECTILE_IMPACT_MS, easing: "ease-out" }
    );
  } finally {
    spark.remove();
  }
}

/**
 * A placeholder ranged projectile: a glowing bolt flies from the shooter's cell
 * to the target's, then bursts. Real projectile art can replace `.fxBolt` and
 * this flight without touching the rest of the pipeline.
 */
async function runBolt(stage: HTMLElement, cue: Extract<FxCue, { kind: "bolt" }>): Promise<void> {
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.to);
  if (!fromRect || !toRect) {
    return;
  }
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const bolt = document.createElement("div");
  bolt.className = "fxBolt";
  stage.appendChild(bolt);
  const halfW = bolt.offsetWidth / 2 || 15;
  const halfH = bolt.offsetHeight / 2 || 3;
  bolt.style.left = `${from.x - halfW}px`;
  bolt.style.top = `${from.y - halfH}px`;
  playWhoosh();

  try {
    await animate(
      bolt,
      [
        { transform: `translate(0px, 0px) rotate(${angle}deg) scaleX(0.6)`, opacity: 0, offset: 0 },
        { transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 1 }
      ],
      { duration: BOLT_FLIGHT_MS, easing: "cubic-bezier(0.45, 0.15, 0.85, 0.55)", fill: "forwards" }
    );
  } finally {
    bolt.remove();
  }

  await runProjectileImpact(stage, to);
}

/** Steps a converted .def sheet frame by frame over the anchored cell. */
async function runSprite(stage: HTMLElement, fxKey: string, at: string, soundKey?: string): Promise<void> {
  const sheet = getFxSheet(fxKey);
  const rect = resolveAnchorRect(at);
  if (!sheet || !rect) {
    return;
  }

  // The original art targets ~90px battle hexes; scaling by cell width keeps
  // the authored proportions. Oversized effects are capped at ~2.4 cells.
  let scale = rect.width / 90;
  scale = Math.min(scale, (rect.height * 2.4) / sheet.frameHeight, (rect.width * 2.4) / sheet.frameWidth);

  const sprite = document.createElement("div");
  sprite.className = "fxSprite";
  sprite.style.width = `${sheet.frameWidth}px`;
  sprite.style.height = `${sheet.frameHeight}px`;
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  if (sheet.opacity !== undefined) {
    sprite.style.opacity = String(sheet.opacity);
  }

  const anchor = centerOf(rect);
  const scaledH = sheet.frameHeight * scale;
  const top =
    sheet.anchor === "bottom"
      ? rect.bottom - scaledH - rect.height * 0.06
      : anchor.y - scaledH / 2;
  sprite.style.left = `${anchor.x - (sheet.frameWidth * scale) / 2}px`;
  sprite.style.top = `${top}px`;
  sprite.style.transform = `scale(${scale})`;
  sprite.style.transformOrigin = "top left";
  // transform-origin top left keeps math simple: position pre-scaled.
  sprite.style.left = `${anchor.x - (sheet.frameWidth * scale) / 2}px`;
  stage.appendChild(sprite);

  if (soundKey) {
    playLibrarySound(soundKey);
  }

  try {
    // Single-frame sheets (the lightning bolt is one tall still) flash with
    // a fade instead of vanishing after a 15th of a second.
    if (sheet.frames === 1) {
      await animate(
        sprite,
        [{ opacity: 0 }, { opacity: sheet.opacity ?? 1, offset: 0.15 }, { opacity: sheet.opacity ?? 1, offset: 0.7 }, { opacity: 0 }],
        { duration: 480, easing: "ease-out" }
      );
      return;
    }
    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const totalMs = (sheet.frames / sheet.fps) * 1000;
      const step = (now: number) => {
        const elapsed = now - startTime;
        if (elapsed >= totalMs) {
          resolve();
          return;
        }
        const frame = Math.min(sheet.frames - 1, Math.floor((elapsed / 1000) * sheet.fps));
        const col = frame % sheet.cols;
        const row = Math.floor(frame / sheet.cols);
        sprite.style.backgroundPosition = `-${col * sheet.frameWidth}px -${row * sheet.frameHeight}px`;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  } finally {
    sprite.remove();
  }
}

async function runProjectile(stage: HTMLElement, cue: Extract<FxCue, { kind: "projectile" }>): Promise<void> {
  const sheet = getFxSheet(cue.fxKey);
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.to);
  if (!sheet || !fromRect || !toRect) {
    return;
  }

  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const durationMs = Math.max(280, Math.min(560, distance / 1.4));
  // Projectile art points to the right; rotate along the flight vector and
  // mirror vertically on right-to-left shots so it never flies upside down.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const mirror = Math.abs(angle) > 90 ? " scaleY(-1)" : "";

  const scale = (toRect.width / 90) * 1.1;
  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxProjectile";
  sprite.style.width = `${sheet.frameWidth}px`;
  sprite.style.height = `${sheet.frameHeight}px`;
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.left = `${from.x - sheet.frameWidth / 2}px`;
  sprite.style.top = `${from.y - sheet.frameHeight / 2}px`;
  stage.appendChild(sprite);

  if (cue.sound) {
    playLibrarySound(cue.sound);
  }

  let frameTimer = 0;
  try {
    frameTimer = window.setInterval(() => {
      const frame = Math.floor(Math.random() * sheet.frames);
      const col = frame % sheet.cols;
      const row = Math.floor(frame / sheet.cols);
      sprite.style.backgroundPosition = `-${col * sheet.frameWidth}px -${row * sheet.frameHeight}px`;
    }, 1000 / sheet.fps);

    await animate(
      sprite,
      [
        { transform: `translate(0, 0) rotate(${angle}deg)${mirror} scale(${scale * 0.8})`, opacity: 0 },
        { transform: `translate(${dx * 0.12}px, ${dy * 0.12}px) rotate(${angle}deg)${mirror} scale(${scale})`, opacity: 1, offset: 0.15 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg)${mirror} scale(${scale})`, opacity: 1 }
      ],
      { duration: durationMs, easing: "cubic-bezier(0.4, 0, 0.8, 0.6)", fill: "forwards" }
    );
  } finally {
    window.clearInterval(frameTimer);
    sprite.remove();
  }

  if (cue.hitFxKey) {
    await runSprite(stage, cue.hitFxKey, cue.to, cue.hitSound);
  } else if (cue.hitSound) {
    playLibrarySound(cue.hitSound);
  }
}

async function runFloater(stage: HTMLElement, cue: Extract<FxCue, { kind: "floater" }>): Promise<void> {
  const rect = resolveAnchorRect(cue.at);
  if (!rect) {
    return;
  }
  const floater = document.createElement("div");
  floater.className = `fxFloater ${cue.tone}`;
  floater.textContent = cue.text;
  const anchor = centerOf(rect);
  floater.style.left = `${anchor.x}px`;
  floater.style.top = `${rect.top + rect.height * 0.22}px`;
  stage.appendChild(floater);
  try {
    await animate(
      floater,
      [
        { transform: "translate(-50%, 6px) scale(0.8)", opacity: 0 },
        { transform: "translate(-50%, -8px) scale(1.06)", opacity: 1, offset: 0.25 },
        { transform: "translate(-50%, -44px) scale(1)", opacity: 0 }
      ],
      { duration: 1050, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" }
    );
  } finally {
    floater.remove();
  }
}

async function runPulse(stage: HTMLElement, cue: Extract<FxCue, { kind: "pulse" }>): Promise<void> {
  const rect = resolveAnchorRect(cue.at);
  if (!rect) {
    return;
  }
  playShuffle();
  const pulse = document.createElement("div");
  pulse.className = "fxPulse";
  pulse.style.left = `${rect.left - 6}px`;
  pulse.style.top = `${rect.top - 6}px`;
  pulse.style.width = `${rect.width + 12}px`;
  pulse.style.height = `${rect.height + 12}px`;
  if (cue.text) {
    const label = document.createElement("span");
    label.textContent = cue.text;
    pulse.appendChild(label);
  }
  stage.appendChild(pulse);
  try {
    await animate(
      pulse,
      [
        { opacity: 0, transform: "scale(0.9)" },
        { opacity: 1, transform: "scale(1.06)", offset: 0.3 },
        { opacity: 0, transform: "scale(1)" }
      ],
      { duration: 1100, easing: "ease-out" }
    );
  } finally {
    pulse.remove();
  }
}

export function FxStage({ cues, onDone }: { cues: FxCue[]; onDone: (id: string) => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef<Set<string>>(new Set());
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    for (const cue of cues) {
      if (startedRef.current.has(cue.id)) {
        continue;
      }
      startedRef.current.add(cue.id);

      const play = async () => {
        switch (cue.kind) {
          case "flight":
            return runFlight(stage, cue);
          case "move":
            return runMove(stage, cue);
          case "sprite":
            return runSprite(stage, cue.fxKey, cue.at, cue.sound);
          case "projectile":
            return runProjectile(stage, cue);
          case "floater":
            return runFloater(stage, cue);
          case "pulse":
            return runPulse(stage, cue);
          case "lunge":
            return runLunge(cue);
          case "shake":
            return runShake(cue);
          case "slash":
            return runSlash(stage, cue);
          case "bolt":
            return runBolt(stage, cue);
        }
      };

      const finish = () => onDoneRef.current(cue.id);
      window.setTimeout(() => {
        Promise.race([
          play().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, SAFETY_TIMEOUT_MS))
        ]).then(finish, finish);
      }, cue.delayMs ?? 0);
    }
  }, [cues]);

  return <div aria-hidden="true" className="fxStage" ref={stageRef} />;
}
