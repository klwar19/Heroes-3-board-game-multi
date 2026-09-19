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
      teleport?: boolean;
      /** The card reads upside-down on the board (p1 / flipped view). */
      flip?: boolean;
      delayMs?: number;
      /**
       * A "held" glide (a Harpy's Strike-and-Return fly-back): the unit's real
       * card has already been committed to its destination, but the move must
       * wait out an intervening beat — the enemy's Retaliation Attack — before
       * it plays. We park a stand-in ghost on the `from` cell the instant the
       * cue mounts (hiding the real card so it never teleports to the
       * destination early), hold it there for `holdMs`, THEN glide it home. The
       * cue's own `delayMs` stays 0 so the park begins the moment the snapshot
       * lands.
       */
      holdMs?: number;
    }
  | { kind: "sprite"; id: string; fxKey: string; at: string; delayMs?: number; sound?: string }
  | {
      /**
       * A sprite-less colored wash (Bloodlust's red battle-rage) flashed over an
       * anchor — used when a tint plan resolves through a card play and there is
       * no board unit to tint (the unit-card tint path lives in page.tsx).
       */
      kind: "glow";
      id: string;
      at: string;
      tint: "bloodlust";
      delayMs?: number;
      sound?: string;
    }
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
      /** Fixed attack beat; independent of viewport size and shot distance. */
      flightMs?: number;
      /** Recoil the matching in-play war-machine card as the shot launches. */
      recoil?: "ballista" | "catapult" | "cannon";
    }
  | { kind: "line"; id: string; fxKey: string; from: string; to: string; delayMs?: number; sound?: string }
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
      /** An authored melee slash landing on a cell from the attacker's side. */
      kind: "slash";
      id: string;
      fxKey: string;
      from: string;
      at: string;
      sound?: string;
      delayMs?: number;
    }
  | {
      /** A placeholder ranged projectile flying from one cell to another. */
      kind: "bolt";
      id: string;
      from: string;
      to: string;
      delayMs?: number;
    }
  | {
      /**
       * A dramatic golden burst over an anchor — an expanding shockwave ring, a
       * radial flash and a spray of sparks. Punctuates a town building going up
       * (`tone: "build"`) and a new map tile landing (`tone: "tile"`). Anchors
       * to a `data-fx-anchor` (e.g. `building:<id>` / `tile:<id>`); a missing
       * anchor consumes the cue silently like every other FX.
       */
      kind: "burst";
      id: string;
      at: string;
      tone?: "build" | "tile";
      delayMs?: number;
    };

/** Flight timing shared with the cue builders in page.tsx. */
export const FLIGHT_MS = 620;
export const HOLD_CENTER_MS = 900;
export const FLIGHT_OUT_MS = 480;
export const DRAW_STAGGER_MS = 120;

/** A combat unit's card glides between battle cells over this long. */
export const COMBAT_MOVE_MS = 640;

/** A sprite-less tint wash (Bloodlust on a card play) holds this long. */
const GLOW_MS = 900;

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
/**
 * Time reserved for one unit's whole strike to play out (lunge in, hit, recover)
 * once its attack die has finished reading. The dice queue holds this long
 * between successive rolls so each attack animates in its own gap, and the FX
 * timeline lines its strikes up to the same beat. Covers the full lunge.
 */
export const ATTACK_ANIM_MS = 900;
/** Full attacker lunge (thrust then recover); the thrust peaks near impact. */
const MELEE_LUNGE_MS = 820;
/** A shooter's recoil kick as the shot is released. */
const RANGED_RECOIL_MS = 440;
/** The struck unit's recoil vibration. */
const DEFENDER_SHAKE_MS = 360;
/** The melee slash flash sweeping across the target. */
const MELEE_SLASH_MS = 400;
/** The little burst where a projectile lands. */
const PROJECTILE_IMPACT_MS = 260;
/**
 * Neutral fights only: once a guard has slid into place the board holds for
 * this long so the table reads the move before the attack die is thrown.
 */
export const NEUTRAL_ATTACK_PAUSE_MS = 2000;

const SAFETY_TIMEOUT_MS = 9000;

/** Prefer a rendered copy when responsive layouts contain duplicate anchors. */
function firstVisibleAnchor(selector: string): Element | null {
  const matches = document.querySelectorAll(selector);
  for (const match of matches) {
    const rect = match.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return match;
    }
  }
  return null;
}

function resolveAnchorElement(anchor: string): Element | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (anchor.startsWith("war-machine:")) {
    return firstVisibleAnchor(`[data-fx-anchor="${anchor}"]`);
  }
  const [kind, value] = anchor.split(":", 2);
  return kind === "unit"
    ? firstVisibleAnchor(`[data-fx-unit="${value}"]`)
    : kind === "cell"
      ? firstVisibleAnchor(`[data-fx-cell="${value}"]`)
      : firstVisibleAnchor(`[data-fx-anchor="${anchor}"]`);
}

function resolveAnchorRect(anchor: string): DOMRect | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (anchor === "center") {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return new DOMRect(w / 2 - 70, h / 2 - 98, 140, 196);
  }
  const element = resolveAnchorElement(anchor);
  if (element) {
    const rect = element.getBoundingClientRect();
    if (anchor.startsWith("hand:") &&
      (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth)) {
      return resolveAnchorRect("center");
    }
    return rect;
  }
  // A temporary specialty-granted Ballista has no physical permanent card.
  // Launch from its owner's hand/seat instead; if that dock is off-screen, use
  // center stage so multiplayer spectators still see the shot.
  if (anchor.startsWith("war-machine:")) {
    const [, playerId] = anchor.split(":", 3);
    return resolveAnchorElement(`hand:${playerId}`)?.getBoundingClientRect() ?? resolveAnchorRect("center");
  }
  // Opponent hands may live in a closed info panel, especially on phones.
  // Spell flight must still launch when that hand has no rendered anchor.
  if (anchor.startsWith("hand:")) {
    return resolveAnchorRect("center");
  }
  return null;
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

  // The traveling card is a small token — big enough to read which deck it came
  // from, small enough not to dominate the combat board. Source/target rects are
  // matched with transforms so piles, fans and cells all look right.
  const w = 58;
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
          { transform: "translate(0, 0) scale(2.4)", offset: 1 }
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.25, 0.8, 0.3, 1)", fill: "forwards" }
      );
      place(centerPoint);
      holder.style.transform = "scale(2.4)";
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
          { transform: "translate(0, 0) scale(2.4)" },
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
async function runTeleport(stage: HTMLElement, cue: Extract<FxCue, { kind: "move" }>): Promise<void> {
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.to);
  const realCard = boardCardFor(cue.unitId);
  if (!fromRect || !toRect) return;
  const origin = centerOf(fromRect);
  const width = realCard?.getBoundingClientRect().width ?? toRect.width;
  const height = realCard?.getBoundingClientRect().height ?? toRect.height;
  const ghost = document.createElement("div");
  ghost.className = "fxMoveGhost";
  ghost.style.width = `${width}px`;
  ghost.style.height = `${height}px`;
  ghost.style.left = `${origin.x - width / 2}px`;
  ghost.style.top = `${origin.y - height / 2}px`;
  if (cue.cardImage) {
    const card = document.createElement("img");
    card.src = assetUrl(cue.cardImage);
    card.alt = "";
    card.className = "fxMoveGhostCard";
    ghost.appendChild(card);
  }
  stage.appendChild(ghost);
  const previousOpacity = realCard?.style.opacity;
  if (realCard) realCard.style.opacity = "0";
  try {
    playLibrarySound("spells/teleport");
    await Promise.all([
      runSprite(stage, "magma-teleport-animated", cue.from, undefined, 300),
      animate(ghost, [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.08)", opacity: 0 },
      ], { duration: 300, easing: "ease-in", fill: "forwards" }),
    ]);
    ghost.remove();
    const arrival = runSprite(stage, "magma-teleport-animated", cue.to, undefined, 340);
    if (realCard) {
      realCard.style.opacity = previousOpacity ?? "";
      await Promise.all([arrival, animate(realCard, [
          { transform: "scale(0.08)", opacity: 0 },
          { transform: "scale(1)", opacity: 1 },
        ], { duration: 340, easing: "ease-out", composite: "add" })]);
    } else {
      await arrival;
    }
  } finally {
    ghost.remove();
    if (realCard) realCard.style.opacity = previousOpacity ?? "";
  }
}

async function runMove(stage: HTMLElement, cue: Extract<FxCue, { kind: "move" }>): Promise<void> {
  if (cue.teleport) return runTeleport(stage, cue);
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
    // A held fly-back (Harpy Strike-and-Return): the ghost is already parked on
    // the strike cell with the real card hidden, so the unit reads as standing
    // there — being struck by the enemy's Retaliation Attack — until the hold
    // elapses, then it glides home. Without this the real card would sit on its
    // origin for the whole retaliation and the fly-back would play as a second,
    // late glide on top of that teleport.
    if (cue.holdMs && cue.holdMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cue.holdMs));
    }
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

/** The long thrust grows from the attacking unit and ends at the defender. */
async function runThrust(stage: HTMLElement, cue: { fxKey: string; from: string; at: string; sound?: string }): Promise<void> {
  const sheet = getFxSheet(cue.fxKey);
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.at);
  if (!sheet || !fromRect || !toRect) return;
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const width = Math.hypot(dx, dy);
  if (width < 1) return;
  const height = Math.min(fromRect.height, toRect.height) * 0.88;
  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxMeleeImpact";
  sprite.style.width = `${width}px`;
  sprite.style.height = `${height}px`;
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.backgroundSize = `${width * sheet.cols}px ${height * sheet.rows}px`;
  sprite.style.left = `${(from.x + to.x) / 2 - width / 2}px`;
  sprite.style.top = `${(from.y + to.y) / 2 - height / 2}px`;
  sprite.style.transformOrigin = "center";
  sprite.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  stage.appendChild(sprite);
  const playbackMs = (sheet.frames / sheet.fps) * 1000;
  if (cue.sound) playLibrarySound(cue.sound);
  else if (cue.fxKey === "melee-bite-snap-animated") playLibrarySound("mgq/effects/bite");
  else if (cue.fxKey === "thunderbird-trident-zap-animated") playLibrarySound("mgq/effects/thunder4");
  else if (cue.fxKey.includes("breath") || cue.fxKey === "phoenix-flame-flow-animated") {
    playWhoosh();
    playMeleeImpact(Math.round(playbackMs * 0.55));
  } else playMeleeImpact();
  const started = performance.now();
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        if (elapsed >= playbackMs) { resolve(); return; }
        const frame = Math.min(sheet.frames - 1, Math.floor(elapsed / playbackMs * sheet.frames));
        sprite.style.backgroundPosition = `-${frame % sheet.cols * width}px -${Math.floor(frame / sheet.cols) * height}px`;
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally { sprite.remove(); }
}

/** A physical claw pivots in place over the defender; it never flies like a projectile. */
async function runClawSwipe(stage: HTMLElement, cue: Extract<FxCue, { kind: "slash" }>): Promise<void> {
  const sheet = getFxSheet(cue.fxKey);
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.at);
  if (!sheet || !fromRect || !toRect) return;
  const attacker = centerOf(fromRect);
  const target = centerOf(toRect);
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const firesLeft = dx < 0;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const forwardAngle = firesLeft ? angle - Math.sign(angle || 1) * 180 : angle;
  const scale = Math.min(
    (toRect.width * 1.5) / sheet.frameWidth,
    (toRect.height * 1.5) / sheet.frameHeight,
  );
  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxMeleeImpact";
  sprite.style.width = `${sheet.frameWidth}px`;
  sprite.style.height = `${sheet.frameHeight}px`;
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.left = `${target.x - sheet.frameWidth / 2}px`;
  sprite.style.top = `${target.y - sheet.frameHeight / 2}px`;
  sprite.style.transformOrigin = "center";
  sprite.style.transform = `rotate(${forwardAngle}deg) scale(${firesLeft ? -scale : scale}, ${scale})`;
  stage.appendChild(sprite);
  playLibrarySound("mgq/effects/slash6");
  const playbackMs = (sheet.frames / sheet.fps) * 1000;
  const started = performance.now();
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        if (elapsed >= playbackMs) { resolve(); return; }
        const frame = Math.min(sheet.frames - 1, Math.floor(elapsed / playbackMs * sheet.frames));
        sprite.style.backgroundPosition = `-${(frame % sheet.cols) * sheet.frameWidth}px -${Math.floor(frame / sheet.cols) * sheet.frameHeight}px`;
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally { sprite.remove(); }
}

/** Plays the unit-appropriate melee-contact atlas over the defender. */
async function runSlash(stage: HTMLElement, cue: Extract<FxCue, { kind: "slash" }>): Promise<void> {
  if (cue.fxKey === "melee-claw-rake-animated") return runClawSwipe(stage, cue);
  if ([
    "melee-thrust-impact", "melee-bite-snap-animated",
    "thunderbird-trident-zap-animated",
    "phoenix-flame-flow-animated", "dragon-fire-breath-animated",
    "azure-ice-breath-animated", "crystal-red-strike-animated", "rust-acid-breath-animated",
  ].includes(cue.fxKey)) return runThrust(stage, cue);
  const sheet = getFxSheet(cue.fxKey);
  const fromRect = resolveAnchorRect(cue.from);
  const rect = resolveAnchorRect(cue.at);
  if (!sheet || !fromRect || !rect) {
    return;
  }
  const attacker = centerOf(fromRect);
  const target = centerOf(rect);
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const scale = Math.min(
    (rect.width * 1.45) / sheet.frameWidth,
    (rect.height * 1.45) / sheet.frameHeight,
  );
  const firesLeft = dx < 0;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const forwardAngle = firesLeft ? angle - Math.sign(angle || 1) * 180 : angle;
  const frameOrder = sheet.frameOrder ?? Array.from({ length: sheet.frames }, (_, frame) => frame);

  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxMeleeImpact";
  sprite.style.width = `${sheet.frameWidth}px`;
  sprite.style.height = `${sheet.frameHeight}px`;
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.left = `${target.x - sheet.frameWidth / 2}px`;
  sprite.style.top = `${target.y - sheet.frameHeight / 2}px`;
  sprite.style.transform = `rotate(${forwardAngle}deg) scale(${firesLeft ? -scale : scale}, ${scale})`;
  sprite.style.transformOrigin = "center";
  stage.appendChild(sprite);
  playMeleeImpact();

  try {
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const tick = (now: number) => {
        if (!stage.isConnected) {
          resolve();
          return;
        }
        const elapsed = now - started;
        if (elapsed >= MELEE_SLASH_MS) {
          resolve();
          return;
        }
        const sequenceIndex = Math.min(
          frameOrder.length - 1,
          Math.floor((elapsed / MELEE_SLASH_MS) * frameOrder.length),
        );
        const frame = frameOrder[sequenceIndex];
        // The leading frames travel from the attacker's edge into the target.
        // The impact frames stay on the struck card while the sparks dissipate.
        const advance = Math.min(1, elapsed / (MELEE_SLASH_MS * 0.56));
        sprite.style.left = `${attacker.x + dx * advance - sheet.frameWidth / 2}px`;
        sprite.style.top = `${attacker.y + dy * advance - sheet.frameHeight / 2}px`;
        const col = frame % sheet.cols;
        const row = Math.floor(frame / sheet.cols);
        sprite.style.backgroundPosition = `-${col * sheet.frameWidth}px -${row * sheet.frameHeight}px`;
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally {
    sprite.remove();
  }
}

/** Full-length animated ray: frames extend, pulse, and burst at the live target. */
async function runBeamProjectile(
  stage: HTMLElement,
  cue: Extract<FxCue, { kind: "projectile" }>,
  sheet: NonNullable<ReturnType<typeof getFxSheet>>,
  fromRect: DOMRect,
  toRect: DOMRect,
): Promise<void> {
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const ux = dx / distance;
  const uy = dy / distance;
  const sourceInset = Math.min(distance * 0.2, Math.min(fromRect.width, fromRect.height) * 0.25);
  const targetInset = Math.min(distance * 0.2, Math.min(toRect.width, toRect.height) * 0.2);
  const start = { x: from.x + ux * sourceInset, y: from.y + uy * sourceInset };
  const end = { x: to.x - ux * targetInset, y: to.y - uy * targetInset };
  const width = Math.hypot(end.x - start.x, end.y - start.y);
  const height = Math.min(fromRect.height, toRect.height) * 0.92;
  const flightMs = cue.flightMs ?? BOLT_FLIGHT_MS;
  const launchMs = RANGED_RELEASE_MS;
  const fadeMs = 220;
  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxProjectile fxBeam";
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.width = `${width}px`;
  sprite.style.height = `${height}px`;
  sprite.style.backgroundSize = `${width * sheet.cols}px ${height * sheet.rows}px`;
  sprite.style.left = `${(start.x + end.x) / 2 - width / 2}px`;
  sprite.style.top = `${(start.y + end.y) / 2 - height / 2}px`;
  sprite.style.transformOrigin = "center";
  sprite.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  stage.appendChild(sprite);
  const started = performance.now();
  let playedShot = false;
  let playedImpact = false;
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        let frame: number;
        if (elapsed < launchMs) {
          frame = Math.min(3, Math.floor(elapsed / launchMs * 4));
        } else if (elapsed < launchMs + flightMs) {
          if (!playedShot) { playedShot = true; if (cue.sound) playLibrarySound(cue.sound); }
          frame = 4 + Math.min(6, Math.floor((elapsed - launchMs) / flightMs * 7));
        } else if (elapsed < launchMs + flightMs + fadeMs) {
          if (!playedImpact) {
            playedImpact = true;
            if (cue.hitSound && !cue.hitFxKey) playLibrarySound(cue.hitSound);
          }
          frame = 11 + Math.min(4, Math.floor((elapsed - launchMs - flightMs) / fadeMs * 5));
        } else { resolve(); return; }
        sprite.style.backgroundPosition = `-${(frame % sheet.cols) * width}px -${Math.floor(frame / sheet.cols) * height}px`;
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally { sprite.remove(); }
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
async function runSprite(stage: HTMLElement, fxKey: string, at: string, soundKey?: string, playbackMs?: number): Promise<void> {
  const sheet = getFxSheet(fxKey);
  const rect = resolveAnchorRect(at);
  if (!sheet || !rect) {
    return;
  }

  // The original art targets ~90px battle hexes; scaling by cell width keeps
  // the authored proportions. Oversized effects are capped at ~2.4 cells.
  let scale = rect.width / 90;
  scale = Math.min(scale, (rect.height * 2.4) / sheet.frameHeight, (rect.width * 2.4) / sheet.frameWidth);
  scale *= sheet.scaleMultiplier ?? 1;

  const sprite = document.createElement("div");
  sprite.className = "fxSprite";
  if (sheet.blendMode) sprite.style.mixBlendMode = sheet.blendMode;
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
      const totalMs = playbackMs ?? (sheet.frames / sheet.fps) * 1000;
      const step = (now: number) => {
        const elapsed = now - startTime;
        if (elapsed >= totalMs) {
          resolve();
          return;
        }
        const frame = Math.min(sheet.frames - 1, Math.floor((elapsed / totalMs) * sheet.frames));
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

async function runPhasedProjectile(
  stage: HTMLElement,
  cue: Extract<FxCue, { kind: "projectile" }>,
  sheet: NonNullable<ReturnType<typeof getFxSheet>>,
  fromRect: DOMRect,
  toRect: DOMRect,
): Promise<void> {
  const phases = sheet.projectilePhases!;
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const firesLeft = dx < 0;
  // Every authored phase atlas faces right. Keep the art upright while aiming
  // it along the shot: a left-firing atlas is mirrored horizontally first,
  // then only tilted by the screen-space slope. This also follows the board's
  // seat flip because `dx` comes from the rendered source/target anchors.
  const flightAngle = firesLeft ? angle - Math.sign(angle || 1) * 180 : angle;
  const flightTransform = `rotate(${flightAngle}deg)${firesLeft ? " scaleX(-1)" : ""}`;
  // Impact frames still contain the projectile/remnants, so they must retain
  // the firing side even though the burst itself should no longer be tilted.
  const impactTransform = firesLeft ? "scaleX(-1)" : "none";
  const cellWidth = Math.min(fromRect.width, toRect.width);
  const launchMs = 120;
  const flightMs = cue.flightMs ?? BOLT_FLIGHT_MS;
  const impactMs = 300;
  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxProjectile";
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.mixBlendMode = "normal";
  // Phased atlases contain real alpha; their appearance must not depend on
  // compositing through the fixed stage or its ancestors' stacking contexts.
  sprite.style.filter = "none";
  sprite.style.transformOrigin = "center";
  stage.appendChild(sprite);
  const paint = (
    range: [number, number],
    progress: number,
    x: number,
    y: number,
    width: number,
    transform: string,
  ) => {
    const frame = range[0] + Math.min(range[1] - 1, Math.floor(progress * range[1]));
    const height = width * sheet.frameHeight / sheet.frameWidth;
    sprite.style.width = `${width}px`;
    sprite.style.height = `${height}px`;
    sprite.style.backgroundSize = `${width * sheet.cols}px ${height * sheet.rows}px`;
    sprite.style.backgroundPosition = `-${(frame % sheet.cols) * width}px -${Math.floor(frame / sheet.cols) * height}px`;
    sprite.style.left = `${x - width / 2}px`;
    sprite.style.top = `${y - height / 2}px`;
    sprite.style.transform = transform;
  };
  const started = performance.now();
  let playedShot = false;
  let playedImpact = false;
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) {
          resolve();
          return;
        }
        const elapsed = now - started;
        if (elapsed < launchMs) {
          paint(phases.launch, elapsed / launchMs, from.x, from.y, cellWidth * phases.widthInCells, flightTransform);
        } else if (elapsed < launchMs + flightMs) {
          if (!playedShot) {
            playedShot = true;
            if (cue.sound) playLibrarySound(cue.sound);
          }
          const p = (elapsed - launchMs) / flightMs;
          paint(phases.flight, p, from.x + dx * p, from.y + dy * p, cellWidth * phases.widthInCells, flightTransform);
        } else if (elapsed < launchMs + flightMs + impactMs) {
          if (!playedImpact) {
            playedImpact = true;
            // A separate hit sprite (Kud's Inferno after her rocket) owns the
            // impact sound when it begins immediately after this atlas.
            if (cue.hitSound && !cue.hitFxKey) playLibrarySound(cue.hitSound);
          }
          paint(phases.impact, (elapsed - launchMs - flightMs) / impactMs,
            to.x, to.y, toRect.width * phases.impactWidthInCells, impactTransform);
        } else {
          resolve();
          return;
        }
        window.requestAnimationFrame(tick);
      };
      tick(started);
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
    // A layout change can remove a visual anchor while a delayed cue waits.
    // Missing geometry must not also swallow the spell's sound.
    if (cue.sound) playLibrarySound(cue.sound);
    return;
  }
  if (sheet.beamFrames) {
    await runBeamProjectile(stage, cue, sheet, fromRect, toRect);
    if (cue.hitFxKey) await runSprite(stage, cue.hitFxKey, cue.to, cue.hitSound);
    return;
  }
  if (sheet.projectilePhases) {
    await runPhasedProjectile(stage, cue, sheet, fromRect, toRect);
    if (cue.hitFxKey) {
      await runSprite(stage, cue.hitFxKey, cue.to, cue.hitSound);
    }
    return;
  }

  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const durationMs = cue.flightMs ?? Math.max(280, Math.min(560, distance / 1.4));
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

  const launcher = resolveAnchorElement(cue.from) as HTMLElement | null;
  if (launcher && cue.recoil) {
    const recoilPx = cue.recoil === "cannon" ? 11 : cue.recoil === "catapult" ? 8 : 5;
    const unitX = distance > 0 ? dx / distance : 1;
    const unitY = distance > 0 ? dy / distance : 0;
    void animate(
      launcher,
      [
        { transform: "translate(0, 0) scale(1)" },
        { transform: `translate(${-unitX * recoilPx}px, ${-unitY * recoilPx}px) scale(0.97)`, offset: 0.28 },
        { transform: "translate(0, 0) scale(1)" }
      ],
      { duration: cue.recoil === "cannon" ? 520 : 400, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }
    );
  }

  let frameTimer = 0;
  let projectileFrame = 0;
  try {
    frameTimer = window.setInterval(() => {
      const frame = sheet.sequentialFrames
        ? (projectileFrame = (projectileFrame + 1) % sheet.frames)
        : Math.floor(Math.random() * sheet.frames);
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

/**
 * A sprite-less colored wash flashed over an anchor (Bloodlust's red battle-rage
 * on a card play, where there is no board unit to tint). Mirrors the unit-card
 * bloodlust pulse's hold so it reads for the same beat. A missing anchor consumes
 * the cue silently.
 */
async function runGlow(stage: HTMLElement, cue: Extract<FxCue, { kind: "glow" }>): Promise<void> {
  const rect = resolveAnchorRect(cue.at);
  if (!rect) {
    return;
  }
  const center = centerOf(rect);
  const size = Math.max(rect.width, rect.height) * 2.6;
  const glow = document.createElement("div");
  glow.className = `fxGlow fxGlow-${cue.tint}`;
  glow.style.left = `${center.x}px`;
  glow.style.top = `${center.y}px`;
  glow.style.width = `${size}px`;
  glow.style.height = `${size}px`;
  stage.appendChild(glow);
  if (cue.sound) {
    playLibrarySound(cue.sound);
  }
  try {
    await animate(
      glow,
      [
        { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0, offset: 0 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.28 },
        { transform: "translate(-50%, -50%) scale(1.08)", opacity: 0.9, offset: 0.7 },
        { transform: "translate(-50%, -50%) scale(1.12)", opacity: 0, offset: 1 }
      ],
      { duration: GLOW_MS, easing: "ease-in-out" }
    );
  } finally {
    glow.remove();
  }
}

/**
 * A dramatic golden burst over an anchor: an expanding shockwave ring (plus a
 * second, softer echo ring), a radial flash and a ring of sparks flung outward.
 * Used to punctuate a town building going up and a new map tile landing. Rings
 * scale via transform (GPU-friendly); a missing anchor consumes the cue.
 */
async function runBurst(stage: HTMLElement, cue: Extract<FxCue, { kind: "burst" }>): Promise<void> {
  const rect = resolveAnchorRect(cue.at);
  if (!rect) {
    return;
  }
  // Respect reduced motion — skip the burst rather than flash the screen.
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return;
  }
  const center = centerOf(rect);
  const tone = cue.tone ?? "build";
  const reach = Math.max(rect.width, rect.height);
  const ringSize = Math.max(120, reach * 3);

  const burst = document.createElement("div");
  burst.className = `fxBurst ${tone}`;
  burst.style.left = `${center.x}px`;
  burst.style.top = `${center.y}px`;

  const flash = document.createElement("div");
  flash.className = "fxBurstFlash";
  const ring = document.createElement("div");
  ring.className = "fxBurstRing";
  ring.style.width = `${ringSize}px`;
  ring.style.height = `${ringSize}px`;
  const ring2 = document.createElement("div");
  ring2.className = "fxBurstRing echo";
  ring2.style.width = `${ringSize * 0.72}px`;
  ring2.style.height = `${ringSize * 0.72}px`;
  burst.append(flash, ring, ring2);

  const SPARKS = 10;
  const sparks: HTMLElement[] = [];
  for (let index = 0; index < SPARKS; index += 1) {
    const spark = document.createElement("i");
    spark.className = "fxBurstSpark";
    burst.appendChild(spark);
    sparks.push(spark);
  }

  stage.appendChild(burst);
  try {
    await Promise.all([
      animate(
        flash,
        [
          { opacity: 0, transform: "translate(-50%, -50%) scale(0.3)" },
          { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.22 },
          { opacity: 0, transform: "translate(-50%, -50%) scale(1.35)" }
        ],
        { duration: 640, easing: "ease-out" }
      ),
      animate(
        ring,
        [
          { opacity: 0.95, transform: "translate(-50%, -50%) scale(0.05)" },
          { opacity: 0, transform: "translate(-50%, -50%) scale(1)" }
        ],
        { duration: 780, easing: "cubic-bezier(0.15, 0.7, 0.3, 1)" }
      ),
      animate(
        ring2,
        [
          { opacity: 0, transform: "translate(-50%, -50%) scale(0.05)" },
          { opacity: 0.7, transform: "translate(-50%, -50%) scale(0.2)", offset: 0.2 },
          { opacity: 0, transform: "translate(-50%, -50%) scale(1)" }
        ],
        { duration: 900, easing: "ease-out" }
      ),
      ...sparks.map((spark, index) => {
        const angle = (index / SPARKS) * Math.PI * 2 + (tone === "tile" ? 0.32 : 0);
        const dist = ringSize * (0.34 + (index % 3) * 0.06);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        return animate(
          spark,
          [
            { opacity: 1, transform: "translate(-50%, -50%) translate(0, 0) scale(1)" },
            { opacity: 1, offset: 0.55 },
            { opacity: 0, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.35)` }
          ],
          { duration: 700 + (index % 4) * 70, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)" }
        );
      })
    ]);
  } finally {
    burst.remove();
  }
}

// A battle can emit the same effect many times. Keep one decoded browser-cache
// warmup per asset instead of allocating a new Image object for every cue.
const preloadedFxSources = new Set<string>();

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

      // Start fetching phase art while the dice/card presentation is still
      // running, rather than waiting until its first launch frame is due.
      if (["projectile", "line", "slash", "sprite"].includes(cue.kind)) {
        const fxKey = "fxKey" in cue ? cue.fxKey : undefined;
        const sheet = fxKey ? getFxSheet(fxKey) : undefined;
        if (sheet && !preloadedFxSources.has(sheet.src)) {
          preloadedFxSources.add(sheet.src);
          const preload = new Image();
          preload.src = assetUrl(sheet.src);
        }
      }

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
          case "line":
            return runThrust(stage, { fxKey: cue.fxKey, from: cue.from, at: cue.to, sound: cue.sound });
          case "floater":
            return runFloater(stage, cue);
          case "pulse":
            return runPulse(stage, cue);
          case "glow":
            return runGlow(stage, cue);
          case "lunge":
            return runLunge(cue);
          case "shake":
            return runShake(cue);
          case "slash":
            return runSlash(stage, cue);
          case "bolt":
            return runBolt(stage, cue);
          case "burst":
            return runBurst(stage, cue);
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
