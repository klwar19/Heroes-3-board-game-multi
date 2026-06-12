"use client";

import { useEffect, useRef } from "react";
import { cardLibrary } from "@/data/cards/library";
import { getDeckBack } from "@/data/decks";
import { getFxSheet } from "@/data/fx";
import { playCardPlace, playCardSwish, playLibrarySound, playShuffle } from "@/lib/sound";

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
  | { kind: "pulse"; id: string; at: string; text?: string; delayMs?: number };

/** Flight timing shared with the cue builders in page.tsx. */
export const FLIGHT_MS = 620;
export const HOLD_CENTER_MS = 900;
export const FLIGHT_OUT_MS = 480;
export const DRAW_STAGGER_MS = 120;

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
    img.src = src;
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
    img.src = back.image;
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
  sprite.style.backgroundImage = `url(${sheet.src})`;
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
  sprite.style.backgroundImage = `url(${sheet.src})`;
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
          case "sprite":
            return runSprite(stage, cue.fxKey, cue.at, cue.sound);
          case "projectile":
            return runProjectile(stage, cue);
          case "floater":
            return runFloater(stage, cue);
          case "pulse":
            return runPulse(stage, cue);
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
