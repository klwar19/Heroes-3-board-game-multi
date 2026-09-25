"use client";

import { useEffect, useRef } from "react";
import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { getDeckBack } from "@/data/decks";
import {
  DEFAULT_BEAM_TIMING,
  getFxSheet,
  LIGHTNING_BEAM_SHEET,
  SOUL_LINK_SHEET,
  type BeamTiming,
} from "@/data/fx";
import { RUNE_BURST_ART, runeWordForLevel } from "@/data/rune-words";
import { HEX_UNIT_CUE_EVENT, HEX_UNIT_PENDING_MOVE_EVENT, type HexUnitCueDetail } from "./hex-battlefield";
import { HEX_HERO_CUE_EVENT, type HexHeroCueDetail, type HexHeroPose } from "./hex-heroes";
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
      /**
       * Hex battlefield: the spaces the unit walked through (start-exclusive,
       * destination last), so its figure follows the real route hex by hex.
       */
      path?: number[];
      /** Hex battlefield: the space this move ends on (a unit may move twice in one snapshot). */
      toPosition?: number;
      /** Hex battlefield: the timeline slot the walk must fill (the figure paces itself to it). */
      durationMs?: number;
      teleportFxKey?: string;
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
  | {
      kind: "sprite";
      id: string;
      fxKey: string;
      at: string;
      delayMs?: number;
      sound?: string;
      fit?: "battlefield";
      playbackMs?: number;
    }
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
      recoil?: "ballista" | "catapult" | "cannon" | "lightning_generator";
    }
  | { kind: "line"; id: string; fxKey: string; from: string; to: string; delayMs?: number; sound?: string }
  /** A horizontal lightning beam from `from` to `to` (LIGHTNING_BEAM_SHEET). */
  | {
      kind: "beam";
      id: string;
      from: string;
      to: string;
      width: "thin" | "normal" | "thick";
      delayMs?: number;
      sound?: string;
      /** Grow/hold/fade (default DEFAULT_BEAM_TIMING, the quick zap). */
      timing?: BeamTiming;
    }
  | {
      /**
       * Necropolis Soul Link: a spectral soul-chain (SOUL_LINK_SHEET) reaches
       * from `from` to `to` (rotated to the live board geometry), pulses while a
       * soul orb rides it across, then fades. `intensity` < 1 is the lighter
       * link-chosen tether.
       */
      kind: "tether";
      id: string;
      from: string;
      to: string;
      timing: BeamTiming;
      intensity?: number;
      delayMs?: number;
      sound?: string;
    }
  | { kind: "floater"; id: string; at: string; text: string; tone: "damage" | "heal" | "info"; delayMs?: number }
  | { kind: "pulse"; id: string; at: string; text?: string; delayMs?: number }
  | {
      /**
       * A unit striking a pose on the hex battlefield (its H3 defend stance when
       * it Defends). Card boards have no pose, so the cue is a no-op there.
       */
      kind: "pose";
      id: string;
      unitId: string;
      pose: "defend";
      delayMs?: number;
    }
  | {
      /**
       * Hex battlefield: a unit re-placed from one hex to another without
       * moving across the board (re-placed during deployment, the Tactics
       * re-sort, a Tactics move or swap). The figure never walks: it blinks —
       * a short fade out where it stood, straight onto its new hex, a short
       * fade in. Card boards have no figure: a no-op.
       */
      kind: "place";
      id: string;
      unitId: string;
      delayMs?: number;
    }
  | {
      /**
       * A creature casting on the hex battlefield (Ogre Magi Bloodlust,
       * Enchanters, Faerie Dragons, a commander's cast…): its figure turns
       * toward `to` and plays its H3 spell-casting rows, releasing the spell
       * `releaseMs` after the cue starts — the beat the page times the spell's
       * own FX to. Card boards have no figure, so the cue is a no-op there.
       */
      kind: "cast";
      id: string;
      unitId: string;
      /** Cell anchor ("cell:<n>" / "unit:<id>") the caster faces; omitted = cast straight ahead. */
      to?: string;
      releaseMs?: number;
      delayMs?: number;
    }
  | {
      /**
       * Hex battlefield: a side's HERO figure plays its H3 cast (the spell
       * leaves it HERO_CAST_RELEASE_MS in, from its `hero:<playerId>` anchor),
       * victory or defeat pose. No figure (card boards, heroless side) = no-op.
       */
      kind: "hero";
      id: string;
      playerId: string;
      pose: HexHeroPose;
      delayMs?: number;
    }
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
      scaleMultiplier?: number;
      sound?: string;
      delayMs?: number;
      /**
       * Hex battlefield: how long after the cue starts the figure's blow lands,
       * so the contact sound plays on that beat instead of as the slash starts.
       */
      impactDelayMs?: number;
    }
  | {
      /** A placeholder ranged projectile flying from one cell to another. */
      kind: "bolt";
      id: string;
      from: string;
      to: string;
      delayMs?: number;
      /** Flight time (default BOLT_FLIGHT_MS); the hex board releases later, so it flies shorter. */
      flightMs?: number;
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
    }
  | {
      /**
       * Bulwark reached a Rune Level (RUNE_LEVEL_REACHED): the rune-circle
       * burst sprite blooms over the battlefield (viewport centre when the
       * board isn't on screen) while the level's Elder Futhark rune word is
       * inscribed glyph by glyph beneath it, then swells, blurs and flies into
       * `playerId`'s earned Level seal box on the Rune board. The cue is
       * silent — page.tsx rings `effects/rune-level-seal` on the same beat.
       */
      kind: "rune";
      id: string;
      playerId: string;
      level: number;
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
/**
 * Hex battlefield: a casting creature's spell leaves it this long after its
 * cast cue starts (the figure's wind-up). The page holds the spell's FX / sound
 * until then; the value lives with the sprite timings.
 */
export { HEX_CAST_RELEASE_MS } from "@/data/battle-hex/creature-sprites";
import { HEX_CAST_RELEASE_MS } from "@/data/battle-hex/creature-sprites";
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
    // Hex battlefield: the machine itself stands on the field; fire from it.
    return firstVisibleAnchor(`[data-hex-war-machine][data-fx-anchor="${anchor}"]`) ??
      firstVisibleAnchor(`[data-fx-anchor="${anchor}"]`);
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
  if (anchor.startsWith("area:")) {
    return resolveHexAreaRect(anchor);
  }
  const element = resolveAnchorElement(anchor);
  if (element) {
    // Hex battlefield: a unit's effects aim at its creature's body (drawn on
    // the figure layer), not at the hex floor.
    const bodyUnitId = anchor.startsWith("unit:") || anchor.startsWith("cell:")
      ? element.getAttribute("data-fx-unit")
      : null;
    const body = bodyUnitId
      ? document.querySelector(`[data-hex-unit="${CSS.escape(bodyUnitId)}"] [data-fx-body]`)
      : null;
    const rect = (body ?? element).getBoundingClientRect();
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
  // Hex battlefield: a spell leaves its caster's hero figure; a side with no
  // hero figure (no PC sprite for its town) launches from the hand as before.
  if (anchor.startsWith("hero:")) {
    return resolveAnchorRect(`hand:${anchor.slice("hero:".length)}`);
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

/** The hex battlefield is on screen (only it draws the hex grid). */
function hexBoardShown(): boolean {
  return typeof document !== "undefined" && document.querySelector("svg.hexGrid") !== null;
}

/** The rendered battle cells a unit stands on: two for a two-hex creature. */
function unitCellRects(unitId: string): DOMRect[] {
  return Array.from(document.querySelectorAll(`[data-fx-cell][data-fx-unit="${CSS.escape(unitId)}"]`))
    .map((cell) => cell.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

/**
 * Hex battlefield: where a two-hex creature's shot / breath / bolt leaves it —
 * its end nearer the target (the body rect slid over that hex), not the middle
 * of its two hexes. Every other anchor (and the whole 4x5 board, which has no
 * figures) keeps `rect`.
 */
function hexLaunchRect(anchor: string, rect: DOMRect, toward: { x: number; y: number }): DOMRect {
  if (!anchor.startsWith("unit:") && !anchor.startsWith("cell:")) return rect;
  const unitId = resolveAnchorElement(anchor)?.getAttribute("data-fx-unit");
  if (!unitId || !hexUnitFigure(unitId)) return rect;
  const cells = unitCellRects(unitId).map(centerOf);
  if (cells.length < 2) return rect;
  const distance = (point: { x: number; y: number }) => Math.hypot(point.x - toward.x, point.y - toward.y);
  const near = cells.reduce((best, cell) => (distance(cell) < distance(best) ? cell : best));
  return new DOMRect(near.x - rect.width / 2, rect.top, rect.width, rect.height);
}

/**
 * Hex battlefield area anchor `area:<centre anchor>|<unitId>,<unitId>…`: a
 * square centred on the blast's centre hex (or centre unit) just large enough
 * to cover every hex of the units that blast struck (engine DAMAGE_ASSIGNED
 * targets, resolved to their live cells) — so a Fireball / Inferno / Frost
 * Ring burst draws over exactly what it hit, never a 4x5-sized cell.
 */
function resolveHexAreaRect(anchor: string): DOMRect | null {
  const [centreAnchor, struckList = ""] = anchor.slice("area:".length).split("|");
  const centreCells = centreAnchor.startsWith("unit:")
    ? unitCellRects(centreAnchor.slice("unit:".length))
    : [resolveAnchorElement(centreAnchor)?.getBoundingClientRect()].filter(
        (rect): rect is DOMRect => Boolean(rect && rect.width > 0)
      );
  if (centreCells.length === 0) {
    return null;
  }
  const centres = centreCells.map(centerOf);
  const centre = {
    x: centres.reduce((sum, point) => sum + point.x, 0) / centres.length,
    y: centres.reduce((sum, point) => sum + point.y, 0) / centres.length
  };
  const cellWidth = centreCells[0].width;
  // Never smaller than the burst a single hex drew before (about 1.7 hexes).
  let radius = cellWidth * 0.85;
  for (const point of centres) {
    radius = Math.max(radius, Math.hypot(point.x - centre.x, point.y - centre.y) + cellWidth / 2);
  }
  for (const unitId of struckList.split(",").filter(Boolean)) {
    for (const rect of unitCellRects(unitId)) {
      const point = centerOf(rect);
      radius = Math.max(radius, Math.hypot(point.x - centre.x, point.y - centre.y) + rect.width / 2);
    }
  }
  return new DOMRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
}

/**
 * Plays an authored atlas at the display rate instead of hard-stepping it.
 * The sprite's image moves onto two stacked child layers that cross-dissolve
 * each frame into the next, so 16-32 painted frames flow like 60. The sprite
 * keeps its size, transform, filter and blend mode, which then apply once to
 * the combined layers. Both layers stay fully opaque around the midpoint, so
 * the blend never turns the effect see-through.
 */
function frameBlender(sprite: HTMLElement, cols: number, rows: number) {
  const image = sprite.style.backgroundImage;
  sprite.style.backgroundImage = "none";
  const layers = [0, 1].map(() => {
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;background-repeat:no-repeat;pointer-events:none";
    layer.style.backgroundImage = image;
    sprite.appendChild(layer);
    return layer;
  });
  /** `position` is a fractional frame index, blended only within [first, last]. */
  return (position: number, first: number, last: number, cellWidth: number, cellHeight: number) => {
    const clamped = Math.max(first, Math.min(last, position));
    const base = Math.floor(clamped);
    const frames = [base, Math.min(last, base + 1)];
    const mix = clamped - base;
    const opacities = [Math.min(1, 2 * (1 - mix)), Math.min(1, 2 * mix)];
    layers.forEach((layer, index) => {
      const frame = frames[index];
      layer.style.backgroundSize = `${cellWidth * cols}px ${cellHeight * rows}px`;
      layer.style.backgroundPosition = `-${(frame % cols) * cellWidth}px -${Math.floor(frame / cols) * cellHeight}px`;
      layer.style.opacity = String(opacities[index]);
    });
  };
}

/** Fractional frame at `progress` through `count` frames: each frame peaks mid-slot, keeping the stepped timing. */
function blendPosition(progress: number, first: number, count: number): number {
  return first + Math.max(0, Math.min(count - 1, progress * count - 0.5));
}

// Element-coloured halos; the shared gold glow suits only fire.
const breathGlow: Record<string, string> = {
  "azure-ice-breath-animated": "drop-shadow(0 0 9px rgb(150 210 255 / 60%))",
  "crystal-red-strike-animated": "drop-shadow(0 0 8px rgb(255 70 95 / 55%))",
  "rust-acid-breath-animated": "drop-shadow(0 0 8px rgb(185 215 60 / 50%))",
  "faerie-rainbow-breath-animated": "drop-shadow(0 0 8px rgb(225 175 255 / 55%))",
  "dragon-fierce-breath-animated": "brightness(1.07) saturate(1.15) drop-shadow(0 0 8px rgb(255 218 130 / 62%))",
};

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
  const teleportFxKey = cue.teleportFxKey ?? "magma-teleport-animated";
  if (realCard) realCard.style.opacity = "0";
  try {
    playLibrarySound("spells/teleport");
    await Promise.all([
      runSprite(stage, teleportFxKey, cue.from, undefined, 300),
      animate(ghost, [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.08)", opacity: 0 },
      ], { duration: 300, easing: "ease-in", fill: "forwards" }),
    ]);
    ghost.remove();
    const arrival = runSprite(stage, teleportFxKey, cue.to, undefined, 340);
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

/**
 * Hex battlefield: units are PC-style figures that animate themselves (walk the
 * route, swing, recoil, pose) on the same cue beats. Returns the figure of a
 * unit standing on a hex board, or null on the card boards.
 */
function hexUnitFigure(unitId: string): HTMLElement | null {
  const el = document.querySelector(`[data-hex-unit="${CSS.escape(unitId)}"]`);
  return el instanceof HTMLElement ? el : null;
}

/** Hand a pose to a hex battlefield hero figure; resolves when it has played it (at once when there is none). */
function playHexHeroCue(playerId: string, pose: HexHeroPose): Promise<void> {
  const figure = document.querySelector(`[data-hex-hero="${CSS.escape(playerId)}"]`);
  if (!(figure instanceof HTMLElement)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const detail: HexHeroCueDetail = { pose, done: () => resolve() };
    figure.dispatchEvent(new CustomEvent(HEX_HERO_CUE_EVENT, { detail }));
    if (!detail.accepted) {
      resolve();
    }
  });
}

/** Hand one cue to a hex figure; resolves when the figure has played it. */
function playHexUnitCue(figure: HTMLElement, cue: HexUnitCueDetail["cue"]): Promise<void> {
  return new Promise((resolve) => {
    const detail: HexUnitCueDetail = { cue, done: () => resolve() };
    figure.dispatchEvent(new CustomEvent(HEX_UNIT_CUE_EVENT, { detail }));
    // A figure mid-remount has no listener yet: nothing will call done().
    if (!detail.accepted) {
      resolve();
    }
  });
}

/** Blink duration of a hex figure's placement relocation (fade out + in). */
const HEX_PLACE_BLINK_MS = 260;

/**
 * Hex battlefield re-placement (deployment, Tactics re-sort / move / swap):
 * the figure never walks. It fades out on the hex it is still held on, is
 * dropped straight onto its new hex at the blink's dark beat — a `move` cue
 * with no `from` cell makes the figure release its hold and stand on its own
 * hex, with no route and so no walk — and fades back in.
 */
async function runHexPlace(cue: Extract<FxCue, { kind: "place" }>): Promise<void> {
  const figure = hexUnitFigure(cue.unitId);
  if (!figure) {
    return;
  }
  const blink = figure.animate(
    [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }],
    { duration: HEX_PLACE_BLINK_MS }
  );
  const drop = new Promise<void>((resolve) => {
    window.setTimeout(() => {
      void playHexUnitCue(figure, { kind: "move", from: "" }).then(resolve);
    }, Math.round(HEX_PLACE_BLINK_MS * 0.45));
  });
  await Promise.all([blink.finished.catch(() => undefined), drop]);
}

async function runMove(stage: HTMLElement, cue: Extract<FxCue, { kind: "move" }>): Promise<void> {
  const hexFigure = hexUnitFigure(cue.unitId);
  if (hexFigure) {
    const walk = playHexUnitCue(hexFigure, {
      kind: "move",
      from: cue.from,
      toPosition: cue.toPosition,
      teleport: cue.teleport,
      path: cue.path,
      holdMs: cue.holdMs,
      durationMs: cue.durationMs
    });
    if (!cue.teleport) {
      return walk;
    }
    // A teleport strike / nest return blinks: the figure vanishes and
    // reappears itself, but the blink's flare and sound (runTeleport's on the
    // card board) must still play — without them the hex blink is silent.
    playLibrarySound("spells/teleport");
    const teleportFxKey = cue.teleportFxKey ?? "magma-teleport-animated";
    await Promise.all([
      walk,
      runSprite(stage, teleportFxKey, cue.from, undefined, 300),
      cue.toPosition !== undefined
        ? new Promise<void>((resolve) => window.setTimeout(resolve, 300)).then(() =>
            runSprite(stage, teleportFxKey, `cell:${cue.toPosition}`, undefined, 340))
        : Promise.resolve()
    ]);
    return;
  }
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
  const hexFigure = hexUnitFigure(cue.attackerId);
  if (hexFigure) {
    return playHexUnitCue(hexFigure, { kind: "lunge", to: cue.to, attackKind: cue.attackKind });
  }
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
  const hexFigure = hexUnitFigure(cue.unitId);
  if (hexFigure) {
    return playHexUnitCue(hexFigure, { kind: "shake" });
  }
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
async function runThrust(
  stage: HTMLElement,
  cue: { fxKey: string; from: string; at: string; sound?: string; impactDelayMs?: number }
): Promise<void> {
  const sheet = getFxSheet(cue.fxKey);
  const toRect = resolveAnchorRect(cue.at);
  const sourceRect = resolveAnchorRect(cue.from);
  const fromRect = sourceRect && toRect ? hexLaunchRect(cue.from, sourceRect, centerOf(toRect)) : sourceRect;
  if (!sheet || !fromRect || !toRect) return;
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const dragonBreath = ["dragon-fire-breath-animated", "dragon-fierce-breath-animated", "dragon-small-breath-animated", "faerie-rainbow-breath-animated"].includes(cue.fxKey);
  const compactBreath = cue.fxKey === "dragon-small-breath-animated";
  // Let the dragon's fire carry past the struck unit instead of ending at its
  // center. Efreet and Fire Elementals launch from the near edge and stop at
  // the target instead, making the same frames visibly smaller and shorter.
  const sourceInset = compactBreath ? fromRect.width * 0.24 : 0;
  // Hex battlefield: a dragon's breath carries on through the hex behind its
  // target, as in the PC game (the target rect is only the creature's body).
  const hexBreathOverrun = dragonBreath && !compactBreath && hexBoardShown()
    ? resolveAnchorElement(cue.at)?.getBoundingClientRect().width
    : undefined;
  const targetOverrun = compactBreath
    ? toRect.width * 0.12
    : dragonBreath
      ? hexBreathOverrun ?? toRect.width * 0.58
      : 0;
  const width = Math.max(distance * 0.6, distance - sourceInset + targetOverrun);
  const height = Math.min(fromRect.height, toRect.height) * (compactBreath ? 0.67 : dragonBreath ? 1.14 : 0.88);
  const centerX = from.x + dx / distance * (sourceInset + width / 2);
  const centerY = from.y + dy / distance * (sourceInset + width / 2);
  const sprite = document.createElement("div");
  sprite.className = "fxSprite fxMeleeImpact";
  sprite.style.width = `${width}px`;
  sprite.style.height = `${height}px`;
  sprite.style.backgroundImage = `url(${assetUrl(sheet.src)})`;
  sprite.style.backgroundSize = `${width * sheet.cols}px ${height * sheet.rows}px`;
  sprite.style.left = `${centerX - width / 2}px`;
  sprite.style.top = `${centerY - height / 2}px`;
  sprite.style.transformOrigin = "center";
  sprite.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  if (breathGlow[cue.fxKey]) sprite.style.filter = breathGlow[cue.fxKey];
  const paintFrame = frameBlender(sprite, sheet.cols, sheet.rows);
  stage.appendChild(sprite);
  const playbackMs = (sheet.frames / sheet.fps) * 1000;
  // The last painted frames fade out gently instead of vanishing on removal.
  const tailMs = Math.min(90, playbackMs * 0.14);
  // Hex battlefield: a bite / thrust contact sounds on the figure's blow.
  const contactMs = cue.impactDelayMs ?? 0;
  const atContact = (play: () => void) => (contactMs > 0 ? window.setTimeout(play, contactMs) : play());
  if (cue.sound) playLibrarySound(cue.sound);
  else if (["melee-bite-snap-animated", "hydra-multi-bite", "haspid-poison-bite"].includes(cue.fxKey)) {
    atContact(() => playLibrarySound("mgq/effects/bite"));
    if (cue.fxKey === "haspid-poison-bite") {
      window.setTimeout(() => playLibrarySound("spells/poison", 0.45), Math.round(playbackMs * 0.5) + contactMs);
    }
  }
  else if (cue.fxKey === "thunderbird-trident-zap-animated") atContact(() => playLibrarySound("mgq/effects/thunder4"));
  else if (cue.fxKey.includes("breath") || cue.fxKey === "phoenix-flame-flow-animated") {
    playWhoosh();
    playMeleeImpact(Math.round(playbackMs * 0.55));
  } else playMeleeImpact(contactMs);
  const started = performance.now();
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        if (elapsed >= playbackMs) { resolve(); return; }
        paintFrame(blendPosition(elapsed / playbackMs, 0, sheet.frames), 0, sheet.frames - 1, width, height);
        sprite.style.opacity = String(Math.min(1, (playbackMs - elapsed) / tailMs));
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally { sprite.remove(); }
}

/**
 * Beam FRAME height as a share of the smaller card's height (the bolt core with
 * its glow fills about a third of a frame): the Lightning Generator volley and
 * Storm Circuit's chain arcs thin, Storm Circuit's centre bolt normal, the Forge
 * commander's Arc Discharge thick.
 */
const BEAM_WIDTH_FACTOR = { thin: 0.26, normal: 0.36, thick: 0.62 } as const;

/**
 * A horizontal lightning beam from source to target. The sheet's bolts run
 * left → right, so the strip is anchored at the SOURCE (transform-origin on its
 * left edge) and rotated by the source→target angle: it always leaves the caster
 * and ends on the target, whichever side of the board either stands on. The
 * bolt is revealed (not stretched) as it grows behind a glowing head, then
 * crackles — the painted frames cycle fast, each randomly mirrored (8 distinct
 * bolt shapes) with a brightness flicker — and fades.
 */
async function runLightningBeam(stage: HTMLElement, cue: Extract<FxCue, { kind: "beam" }>): Promise<void> {
  const toRect = resolveAnchorRect(cue.to);
  const sourceRect = resolveAnchorRect(cue.from);
  const fromRect = sourceRect && toRect ? hexLaunchRect(cue.from, sourceRect, centerOf(toRect)) : sourceRect;
  if (cue.sound) playLibrarySound(cue.sound);
  if (!fromRect || !toRect) return;
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;

  const thickness = Math.max(6, Math.min(fromRect.height, toRect.height) * BEAM_WIDTH_FACTOR[cue.width]);
  const frames = LIGHTNING_BEAM_SHEET.frames;
  const beam = document.createElement("div");
  beam.className = "fxSprite fxProjectile";
  beam.style.left = `${from.x}px`;
  beam.style.top = `${from.y - thickness / 2}px`;
  beam.style.height = `${thickness}px`;
  beam.style.width = "0px";
  beam.style.backgroundImage = `url(${assetUrl(LIGHTNING_BEAM_SHEET.src)})`;
  beam.style.backgroundRepeat = "no-repeat";
  beam.style.backgroundSize = `${distance}px ${thickness * frames}px`;
  beam.style.mixBlendMode = "screen";
  beam.style.filter = "drop-shadow(0 0 6px rgba(123, 207, 255, .85))";
  beam.style.transformOrigin = "0 50%";
  const angle = Math.atan2(dy, dx);
  beam.style.transform = `rotate(${angle}rad)`;
  stage.appendChild(beam);
  // The bright head that races ahead of the bolt while it grows.
  const head = document.createElement("div");
  head.className = "fxSprite";
  const headSize = thickness * 1.2;
  head.style.width = `${headSize}px`;
  head.style.height = `${headSize}px`;
  head.style.borderRadius = "50%";
  head.style.background = "radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(150,215,255,.75) 30%, rgba(60,140,255,0) 70%)";
  head.style.mixBlendMode = "screen";
  stage.appendChild(head);

  const started = performance.now();
  const { growMs, holdMs, fadeMs } = cue.timing ?? DEFAULT_BEAM_TIMING;
  // A slow, readable bolt (Storm Circuit) crackles a touch slower so each
  // painted shape registers; the quick zap keeps its 45 ms strobe.
  const frameMs = holdMs >= 400 ? 60 : 45;
  let shownFrame = -1;
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        if (elapsed >= growMs + holdMs + fadeMs) { resolve(); return; }
        const grown = Math.min(1, elapsed / growMs);
        // Ease-out so the head races across and settles on the target.
        const reach = distance * (1 - (1 - grown) ** 2);
        beam.style.width = `${reach}px`;
        head.style.left = `${from.x + Math.cos(angle) * reach - headSize / 2}px`;
        head.style.top = `${from.y + Math.sin(angle) * reach - headSize / 2}px`;
        // Once it lands the head stays as a flaring contact glow on the target
        // for the first part of the hold, then dies away.
        const contactMs = Math.max(120, holdMs * 0.6);
        head.style.opacity = grown < 1
          ? "1"
          : String(Math.max(0, 1 - (elapsed - growMs) / contactMs) * (cue.timing ? 0.75 + Math.random() * 0.25 : 1));
        const tickIndex = Math.floor(elapsed / frameMs);
        if (tickIndex !== shownFrame) {
          shownFrame = tickIndex;
          // Next painted frame, randomly mirrored across the beam's axis.
          const frame = (tickIndex + Math.floor(Math.random() * (frames - 1))) % frames;
          beam.style.backgroundPosition = `0 ${-frame * thickness}px`;
          beam.style.transform = `rotate(${angle}rad) scaleY(${Math.random() < 0.5 ? -1 : 1})`;
          beam.dataset.flicker = String(0.72 + Math.random() * 0.28);
        }
        const flicker = Number(beam.dataset.flicker ?? 1);
        beam.style.opacity = elapsed > growMs + holdMs
          ? String(Math.max(0, 1 - (elapsed - growMs - holdMs) / fadeMs) * flicker)
          : String(flicker);
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally {
    beam.remove();
    head.remove();
  }
}

/** Soul-chain thickness as a share of the smaller card's height. */
const TETHER_WIDTH_FACTOR = 0.46;

/** A ghost-green soul orb (the tether's growing tip, its rider, its end glows). */
function soulOrb(stage: HTMLElement, size: number): HTMLDivElement {
  const orb = document.createElement("div");
  orb.className = "fxSprite";
  orb.style.width = `${size}px`;
  orb.style.height = `${size}px`;
  orb.style.borderRadius = "50%";
  orb.style.background =
    "radial-gradient(circle, rgba(240,255,248,.95) 0%, rgba(150,255,205,.8) 26%, rgba(40,200,160,.35) 52%, rgba(20,120,110,0) 72%)";
  orb.style.mixBlendMode = "screen";
  orb.style.opacity = "0";
  stage.appendChild(orb);
  return orb;
}

/**
 * Necropolis Soul Link. A spectral soul-chain (SOUL_LINK_SHEET, tiled at its
 * natural proportions — never stretched) reaches from `from` to `to`, rotated to
 * the live board geometry, behind a glowing soul orb. While it holds, the chain
 * links creep toward the target, a second layer of ghost wisps drifts faster
 * over it, the whole tether pulses, and a soul orb rides the chain across and
 * flares on arrival (the moment the transferred damage lands). Then it fades.
 */
async function runSoulTether(stage: HTMLElement, cue: Extract<FxCue, { kind: "tether" }>): Promise<void> {
  const fromRect = resolveAnchorRect(cue.from);
  const toRect = resolveAnchorRect(cue.to);
  if (cue.sound) playLibrarySound(cue.sound);
  if (!fromRect || !toRect) return;
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;

  const intensity = Math.max(0.2, Math.min(1, cue.intensity ?? 1));
  const thickness = Math.max(
    10,
    Math.min(fromRect.height, toRect.height) * TETHER_WIDTH_FACTOR * (0.75 + 0.25 * intensity),
  );
  const frames = SOUL_LINK_SHEET.frames;
  const tileW = thickness * SOUL_LINK_SHEET.aspect;
  const angle = Math.atan2(dy, dx);

  // The rotated tether: it grows by revealing (overflow) — never stretching.
  const wrap = document.createElement("div");
  wrap.className = "fxSprite";
  wrap.style.left = `${from.x}px`;
  wrap.style.top = `${from.y - thickness / 2}px`;
  wrap.style.height = `${thickness}px`;
  wrap.style.width = "0px";
  wrap.style.overflow = "hidden";
  wrap.style.transformOrigin = "0 50%";
  wrap.style.transform = `rotate(${angle}rad)`;
  wrap.style.mixBlendMode = "screen";
  wrap.style.filter = `drop-shadow(0 0 ${Math.round(6 + 6 * intensity)}px rgba(80, 255, 190, .8))`;
  wrap.style.opacity = "0";
  const layer = (frame: number, mirrored: boolean): HTMLDivElement => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.width = `${distance}px`;
    el.style.height = `${thickness}px`;
    el.style.backgroundImage = `url(${assetUrl(SOUL_LINK_SHEET.src)})`;
    el.style.backgroundRepeat = "repeat-x";
    el.style.backgroundSize = `${tileW}px ${thickness * frames}px`;
    el.style.backgroundPositionY = `${-frame * thickness}px`;
    if (mirrored) el.style.transform = "scaleY(-1)";
    wrap.appendChild(el);
    return el;
  };
  const chain = layer(0, false);
  const wisps = layer(2, true);
  stage.appendChild(wrap);

  const orbSize = thickness * 1.5;
  const sourceGlow = soulOrb(stage, orbSize * 0.9);
  const tip = soulOrb(stage, orbSize);
  const rider = soulOrb(stage, orbSize * 0.85);
  const place = (orb: HTMLDivElement, along: number, size: number) => {
    orb.style.left = `${from.x + Math.cos(angle) * along - size / 2}px`;
    orb.style.top = `${from.y + Math.sin(angle) * along - size / 2}px`;
  };
  place(sourceGlow, 0, orbSize * 0.9);

  const { growMs, holdMs, fadeMs } = cue.timing;
  const total = growMs + holdMs + fadeMs;
  // The rider crosses in the first 85% of the hold, then flares on the target.
  const rideMs = holdMs * 0.85;
  const started = performance.now();
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        if (elapsed >= total) { resolve(); return; }
        const grown = Math.min(1, elapsed / growMs);
        const reach = distance * (1 - (1 - grown) ** 2);
        wrap.style.width = `${reach}px`;
        // Links creep toward the target; the wisp layer drifts faster.
        chain.style.backgroundPositionX = `${(elapsed / 1500) * tileW}px`;
        wisps.style.backgroundPositionX = `${(elapsed / 820) * tileW}px`;
        wisps.style.opacity = String(0.35 + 0.3 * Math.sin(elapsed / 140));
        const pulse = 0.82 + 0.18 * Math.sin(elapsed / 95);
        const fade = elapsed > growMs + holdMs ? Math.max(0, 1 - (elapsed - growMs - holdMs) / fadeMs) : 1;
        wrap.style.opacity = String(intensity * pulse * fade * Math.min(1, elapsed / 90));
        sourceGlow.style.opacity = String(intensity * 0.7 * pulse * fade);
        place(tip, reach, orbSize);
        tip.style.opacity = grown < 1
          ? String(intensity)
          : String(intensity * Math.max(0, 1 - (elapsed - growMs) / Math.max(160, holdMs * 0.4)));
        const riding = elapsed - growMs;
        if (riding >= 0 && riding < holdMs + fadeMs) {
          const t = Math.min(1, riding / rideMs);
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const flare = t >= 1 ? 1 + 0.9 * Math.min(1, (riding - rideMs) / 160) : 1;
          const size = orbSize * 0.85 * flare;
          rider.style.width = `${size}px`;
          rider.style.height = `${size}px`;
          place(rider, distance * eased, size);
          rider.style.opacity = String(intensity * (t >= 1 ? fade * Math.max(0, 1 - (riding - rideMs) / (holdMs - rideMs + fadeMs)) : 1));
        }
        window.requestAnimationFrame(tick);
      };
      tick(started);
    });
  } finally {
    wrap.remove();
    sourceGlow.remove();
    tip.remove();
    rider.remove();
  }
}

/** Compact claw marks flash over the defender; they never fly like a projectile. */
async function runClawSwipe(stage: HTMLElement, cue: Extract<FxCue, { kind: "slash" }>): Promise<void> {
  const sheet = getFxSheet(cue.fxKey);
  const toRect = resolveAnchorRect(cue.at);
  const sourceRect = resolveAnchorRect(cue.from);
  const fromRect = sourceRect && toRect ? hexLaunchRect(cue.from, sourceRect, centerOf(toRect)) : sourceRect;
  if (!sheet || !fromRect || !toRect) return;
  const attacker = centerOf(fromRect);
  const target = centerOf(toRect);
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const firesLeft = dx < 0;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const forwardAngle = firesLeft ? angle - Math.sign(angle || 1) * 180 : angle;
  const scale = Math.min(
    (toRect.width * 1.05) / sheet.frameWidth,
    (toRect.height * 1.05) / sheet.frameHeight,
  ) * (cue.scaleMultiplier ?? 1) * (sheet.scaleMultiplier ?? 1);
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
  if (cue.impactDelayMs && cue.impactDelayMs > 0) {
    window.setTimeout(() => playLibrarySound("mgq/effects/slash6"), cue.impactDelayMs);
  } else {
    playLibrarySound("mgq/effects/slash6");
  }
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
  if (cue.fxKey === "melee-claw-rake-animated" || cue.fxKey === "cyberbrute-claw-rake-animated") {
    return runClawSwipe(stage, cue);
  }
  if ([
    "melee-thrust-impact", "melee-bite-snap-animated",
    "thunderbird-trident-zap-animated",
    "hydra-multi-bite", "haspid-poison-bite",
    "phoenix-flame-flow-animated", "dragon-fire-breath-animated", "dragon-fierce-breath-animated",
    "dragon-small-breath-animated", "faerie-rainbow-breath-animated",
    "azure-ice-breath-animated", "crystal-red-strike-animated", "rust-acid-breath-animated",
  ].includes(cue.fxKey)) return runThrust(stage, cue);
  const sheet = getFxSheet(cue.fxKey);
  const rect = resolveAnchorRect(cue.at);
  const sourceRect = resolveAnchorRect(cue.from);
  const fromRect = sourceRect && rect ? hexLaunchRect(cue.from, sourceRect, centerOf(rect)) : sourceRect;
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
  // The slash reaches the target 56% of the way through (see `advance`); on
  // the hex board the contact sound waits for the figure's blow.
  playMeleeImpact(cue.impactDelayMs ?? 0);

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
  const paintFrame = frameBlender(sprite, sheet.cols, sheet.rows);
  stage.appendChild(sprite);
  const started = performance.now();
  let playedShot = false;
  let playedImpact = false;
  try {
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!stage.isConnected) { resolve(); return; }
        const elapsed = now - started;
        let range: [number, number];
        let progress: number;
        if (elapsed < launchMs) {
          range = [0, 4]; progress = elapsed / launchMs;
        } else if (elapsed < launchMs + flightMs) {
          if (!playedShot) { playedShot = true; if (cue.sound) playLibrarySound(cue.sound); }
          range = [4, 7]; progress = (elapsed - launchMs) / flightMs;
        } else if (elapsed < launchMs + flightMs + fadeMs) {
          if (!playedImpact) {
            playedImpact = true;
            if (cue.hitSound && !cue.hitFxKey) playLibrarySound(cue.hitSound);
          }
          range = [11, 5]; progress = (elapsed - launchMs - flightMs) / fadeMs;
        } else { resolve(); return; }
        paintFrame(blendPosition(progress, range[0], range[1]), range[0], range[0] + range[1] - 1, width, height);
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
  const toRect = resolveAnchorRect(cue.to);
  const sourceRect = resolveAnchorRect(cue.from);
  const fromRect = sourceRect && toRect ? hexLaunchRect(cue.from, sourceRect, centerOf(toRect)) : sourceRect;
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
      { duration: cue.flightMs ?? BOLT_FLIGHT_MS, easing: "cubic-bezier(0.45, 0.15, 0.85, 0.55)", fill: "forwards" }
    );
  } finally {
    bolt.remove();
  }

  await runProjectileImpact(stage, to);
}

/** Steps a converted .def sheet frame by frame over the anchored cell. */
async function runSprite(
  stage: HTMLElement,
  fxKey: string,
  at: string,
  soundKey?: string,
  playbackMs?: number,
  fit?: "battlefield",
): Promise<void> {
  const sheet = getFxSheet(fxKey);
  const rect = resolveAnchorRect(at);
  if (!sheet || !rect) {
    return;
  }

  // Unit effects stay compact; battlefield effects cover the complete board
  // and are clipped to its ornate frame rather than spilling across the HUD.
  // A hex area anchor (see resolveHexAreaRect) is sized to the struck hexes:
  // the burst covers it, like a battlefield effect covers the board.
  const areaFit = at.startsWith("area:");
  let scale = fit === "battlefield" || areaFit
    ? Math.max(rect.width / sheet.frameWidth, rect.height / sheet.frameHeight)
    : rect.width / 90;
  if (fit !== "battlefield" && !areaFit) {
    scale = Math.min(scale, (rect.height * 2.4) / sheet.frameHeight, (rect.width * 2.4) / sheet.frameWidth);
  }
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

  const clip = fit === "battlefield" ? document.createElement("div") : null;
  if (clip) {
    clip.className = "fxBattlefieldSpriteClip";
    clip.style.left = `${rect.left}px`;
    clip.style.top = `${rect.top}px`;
    clip.style.width = `${rect.width}px`;
    clip.style.height = `${rect.height}px`;
    stage.appendChild(clip);
  }
  const anchor = fit === "battlefield"
    ? { x: rect.width / 2, y: rect.height / 2 }
    : centerOf(rect);
  const scaledH = sheet.frameHeight * scale;
  const top =
    sheet.anchor === "bottom"
      ? (fit === "battlefield" ? rect.height : rect.bottom) - scaledH - rect.height * 0.06
      : anchor.y - scaledH / 2;
  sprite.style.left = `${anchor.x - (sheet.frameWidth * scale) / 2}px`;
  sprite.style.top = `${top}px`;
  sprite.style.transform = `scale(${scale})`;
  sprite.style.transformOrigin = "top left";
  // transform-origin top left keeps math simple: position pre-scaled.
  sprite.style.left = `${anchor.x - (sheet.frameWidth * scale) / 2}px`;
  (clip ?? stage).appendChild(sprite);

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
    // Authored sequential atlases flow; unordered classic sheets keep stepping.
    const paintFrame = sheet.sequentialFrames ? frameBlender(sprite, sheet.cols, sheet.rows) : null;
    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const totalMs = playbackMs ?? (sheet.frames / sheet.fps) * 1000;
      const step = (now: number) => {
        const elapsed = now - startTime;
        if (elapsed >= totalMs) {
          resolve();
          return;
        }
        if (paintFrame) {
          paintFrame(blendPosition(elapsed / totalMs, 0, sheet.frames), 0, sheet.frames - 1, sheet.frameWidth, sheet.frameHeight);
          requestAnimationFrame(step);
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
    (clip ?? sprite).remove();
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
  const paintFrame = frameBlender(sprite, sheet.cols, sheet.rows);
  stage.appendChild(sprite);
  const paint = (
    range: [number, number],
    progress: number,
    x: number,
    y: number,
    width: number,
    transform: string,
  ) => {
    const height = width * sheet.frameHeight / sheet.frameWidth;
    sprite.style.width = `${width}px`;
    sprite.style.height = `${height}px`;
    paintFrame(blendPosition(progress, range[0], range[1]), range[0], range[0] + range[1] - 1, width, height);
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
  const toRect = resolveAnchorRect(cue.to);
  const sourceRect = resolveAnchorRect(cue.from);
  const fromRect = sourceRect && toRect ? hexLaunchRect(cue.from, sourceRect, centerOf(toRect)) : sourceRect;
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
  if (launcher?.hasAttribute("data-hex-war-machine")) {
    // A war machine on the hex battlefield plays its own firing frames.
    void playHexUnitCue(launcher, { kind: "lunge", to: cue.to, attackKind: "ranged", releaseMs: 0 });
  } else if (launcher && cue.recoil) {
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

/**
 * Elder Futhark glyphs drawn as SVG strokes on a 10×16 grid, so the rune word
 * renders identically on every device (few system fonts carry the Runic block).
 */
const RUNE_GLYPH_PATHS: Record<string, string> = {
  "ᛏ": "M5 16V0M1 4.5L5 0L9 4.5", // Tiwaz
  "ᛁ": "M5 16V0", // Isa
  "ᚹ": "M2.5 16V0L8 4L2.5 8", // Wunjo
  "ᚨ": "M2.5 16V0L8 4M2.5 5L8 9", // Ansuz
  "ᛉ": "M5 16V0M5 7L1 2.5M5 7L9 2.5", // Algiz
  "ᚱ": "M2.5 16V0L8 4L2.5 8L8 16", // Raidho
  "ᛞ": "M1 0V16L9 0V16L1 0", // Dagaz
  "ᛟ": "M5 0L9 4.5L1.5 12V16M5 0L1 4.5L8.5 12V16", // Othala
  "ᛚ": "M2.5 16V0L8 5", // Laguz
  "ᚷ": "M1 1L9 15M9 1L1 15" // Gebo
};

function makeRuneGlyph(char: string): HTMLElement {
  const holder = document.createElement("span");
  holder.className = "fxRuneGlyph";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-1 -1 12 18");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", RUNE_GLYPH_PATHS[char] ?? "M5 16V0");
  svg.appendChild(path);
  holder.appendChild(svg);
  return holder;
}

/** Rune Level celebration length: bloom (0–30%), swell + blur (30–48%), flight into the board (48–80%), seal flash + fade. */
const RUNE_LEVEL_MS = 2600;

/** Warm the rune-burst art once a Bulwark army is in a fight (page.tsx). */
let runeBurstPreloaded = false;
export function preloadRuneBurstArt(): void {
  if (runeBurstPreloaded || typeof window === "undefined") {
    return;
  }
  runeBurstPreloaded = true;
  const img = new Image();
  img.decoding = "async";
  img.src = assetUrl(RUNE_BURST_ART);
}

/**
 * Where the burst lands: the earned Level's seal box on that seat's printed
 * Rune board (`data-rune-seat` / `data-rune-level` in rune-panel.tsx), else the
 * Rune panel itself (minimized / collapsed to its header). Measured once, at
 * trigger; null when neither is on screen (the burst then fades in place).
 */
function runeLevelTargetRect(playerId: string, level: number): DOMRect | null {
  const onScreen = (element: Element | null): DOMRect | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
      ? rect
      : null;
  };
  return (
    onScreen(firstVisibleAnchor(`[data-rune-seat="${playerId}"] [data-rune-level="${level}"]`)) ??
    onScreen(firstVisibleAnchor(".runePanel"))
  );
}

/**
 * Rune Level celebration, "enlarge, blur, then go": the rune-circle sprite
 * blooms big over the combat board with the level's rune word inscribed glyph
 * by glyph beneath it, swells and blurs, then flies and shrinks into the
 * earned Level's seal box on the printed Rune board (the panel when that box
 * is not shown) and flashes out there. One-shot Web Animations of transform /
 * opacity / filter only (no per-frame JS); the target is one
 * getBoundingClientRect at trigger. Under prefers-reduced-motion it is a brief
 * static flash of the same art and word, with no flight.
 */
async function runRuneLevel(stage: HTMLElement, cue: Extract<FxCue, { kind: "rune" }>): Promise<void> {
  const rect = resolveAnchorRect("battlefield") ?? resolveAnchorRect("center");
  if (!rect) {
    return;
  }
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const word = runeWordForLevel(cue.level);
  const center = centerOf(rect);
  // Sized to the board, clamped to the phone viewport (16px gutters).
  const size = Math.round(
    Math.max(160, Math.min(420, Math.min(rect.width, rect.height) * 0.62, window.innerWidth - 32, window.innerHeight * 0.5))
  );
  // Keep the inscription (hung below the ring) inside the viewport.
  const x = center.x;
  const y = Math.max(size * 0.3, Math.min(center.y, window.innerHeight - size * 0.34 - 100));

  const root = document.createElement("div");
  root.className = `fxRuneLevel level-${word.level}`;
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  root.style.setProperty("--rune-size", `${size}px`);

  const halo = document.createElement("div");
  halo.className = "fxRuneHalo";
  const burst = document.createElement("img");
  burst.className = "fxRuneBurst";
  burst.src = assetUrl(RUNE_BURST_ART);
  burst.alt = "";
  burst.decoding = "async";
  burst.draggable = false;

  const inscription = document.createElement("div");
  inscription.className = "fxRuneWord";
  inscription.setAttribute("aria-label", `${word.name}: ${word.label}`);
  const glyphRow = document.createElement("div");
  glyphRow.className = "fxRuneGlyphs";
  glyphRow.title = word.futhark;
  const glyphs = Array.from(word.futhark).map((char) => makeRuneGlyph(char));
  glyphRow.append(...glyphs);
  const caption = document.createElement("div");
  caption.className = "fxRuneCaption";
  const name = document.createElement("strong");
  name.textContent = word.name;
  const label = document.createElement("span");
  label.textContent = word.label;
  caption.append(name, document.createTextNode(" — "), label);
  inscription.append(glyphRow, caption);

  root.append(halo, burst, inscription);
  // Mounted on <body>, not inside the FX stage: the stage's stacking context
  // (z 89) sits under the floating Rune panel (z 880), and the burst has to
  // land visibly ON the board. Viewport coordinates are the same either way.
  (stage.ownerDocument?.body ?? stage).appendChild(root);

  try {
    if (reduced) {
      // Static pieces (CSS starts them hidden for the animated path).
      burst.style.opacity = "1";
      halo.style.opacity = "0.6";
      inscription.style.opacity = "1";
      await animate(
        root,
        [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
        { duration: 1400, easing: "linear" }
      );
      return;
    }

    // Flight vector into the seal box (or the panel), measured once now.
    const target = runeLevelTargetRect(cue.playerId, cue.level);
    const c = "translate(-50%, -50%)";
    let flight: Keyframe[];
    if (target) {
      const to = centerOf(target);
      const dx = Math.round(to.x - x);
      const dy = Math.round(to.y - y);
      // Land a touch larger than the box so the ring visibly "seats" over it.
      const landScale = Math.max(0.05, Math.min(0.6, (Math.max(target.width, target.height) * 1.5) / size));
      flight = [
        { opacity: 0, transform: `${c} scale(0.25) rotate(-50deg)`, filter: "blur(0px) brightness(1)" },
        { opacity: 1, transform: `${c} scale(1.05) rotate(0deg)`, filter: "blur(0px) brightness(1.1)", offset: 0.18 },
        { opacity: 1, transform: `${c} scale(1) rotate(8deg)`, filter: "blur(0px) brightness(1)", offset: 0.3 },
        // Enlarge + blur...
        { opacity: 0.95, transform: `${c} scale(1.4) rotate(18deg)`, filter: "blur(7px) brightness(1.5)", offset: 0.48 },
        // ...then go: shrink and fly into the seal box, sharpening on the way in.
        {
          opacity: 1,
          transform: `${c} translate(${dx}px, ${dy}px) scale(${landScale}) rotate(200deg)`,
          filter: "blur(1px) brightness(1.7)",
          offset: 0.8,
          easing: "ease-out"
        },
        {
          opacity: 0,
          transform: `${c} translate(${dx}px, ${dy}px) scale(${landScale * 1.8}) rotate(230deg)`,
          filter: "blur(3px) brightness(2)"
        }
      ];
    } else {
      flight = [
        { opacity: 0, transform: `${c} scale(0.25) rotate(-50deg)`, filter: "blur(0px)" },
        { opacity: 1, transform: `${c} scale(1.05) rotate(0deg)`, filter: "blur(0px)", offset: 0.18 },
        { opacity: 1, transform: `${c} scale(1) rotate(8deg)`, filter: "blur(0px)", offset: 0.3 },
        { opacity: 0.9, transform: `${c} scale(1.4) rotate(18deg)`, filter: "blur(7px)", offset: 0.55 },
        { opacity: 0, transform: `${c} scale(1.7) rotate(30deg)`, filter: "blur(12px)" }
      ];
    }
    // The halo stays at centre stage: it flares with the bloom and dies as the
    // burst leaves, so the trail reads as the burst departing the board.
    const haloFrames: Keyframe[] = [
      { opacity: 0, transform: `${c} scale(0.3)` },
      { opacity: 1, transform: `${c} scale(1.1)`, offset: 0.16 },
      { opacity: 0.55, transform: `${c} scale(0.95)`, offset: 0.32 },
      { opacity: 0.8, transform: `${c} scale(1.45)`, offset: 0.48 },
      { opacity: 0, transform: `${c} scale(1.6)`, offset: 0.62 },
      { opacity: 0, transform: `${c} scale(1.6)` }
    ];

    await Promise.all([
      animate(burst, flight, { duration: RUNE_LEVEL_MS, easing: "cubic-bezier(0.3, 0.6, 0.35, 1)" }),
      animate(halo, haloFrames, { duration: RUNE_LEVEL_MS, easing: "ease-out" }),
      // The rune word: glyphs strike in one after another under the ring, the
      // buff label follows, and it holds until the burst takes flight.
      animate(
        inscription,
        [
          { opacity: 0, transform: "translate(-50%, 0) translateY(10px)" },
          { opacity: 1, transform: "translate(-50%, 0) translateY(0)", offset: 0.08 },
          { opacity: 1, transform: "translate(-50%, 0) translateY(0)", offset: 0.6 },
          { opacity: 0, transform: "translate(-50%, 0) translateY(-6px)", offset: 0.72 },
          { opacity: 0, transform: "translate(-50%, 0) translateY(-6px)" }
        ],
        { duration: RUNE_LEVEL_MS, easing: "ease-out" }
      ),
      ...glyphs.map((glyph, index) =>
        animate(
          glyph,
          [
            { opacity: 0, transform: "scale(1.9)" },
            { opacity: 1, transform: "scale(0.92)", offset: 0.6 },
            { opacity: 1, transform: "scale(1)" }
          ],
          { duration: 280, delay: 200 + index * 110, easing: "ease-out", fill: "backwards" }
        )
      ),
      animate(
        caption,
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: 300, delay: 200 + glyphs.length * 110 + 100, easing: "ease-out", fill: "backwards" }
      )
    ]);
  } finally {
    root.remove();
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
      // Hex battlefield: tell the moving figure right away that its walk is
      // queued, so it stays on the hex it left instead of snapping ahead.
      if (cue.kind === "move") {
        document
          .querySelector(`[data-hex-unit="${CSS.escape(cue.unitId)}"]`)
          ?.dispatchEvent(new CustomEvent(HEX_UNIT_PENDING_MOVE_EVENT, { detail: { delayMs: cue.delayMs ?? 0 } }));
      }

      // Start fetching phase art while the dice/card presentation is still
      // running, rather than waiting until its first launch frame is due.
      if (cue.kind === "beam" && !preloadedFxSources.has(LIGHTNING_BEAM_SHEET.src)) {
        preloadedFxSources.add(LIGHTNING_BEAM_SHEET.src);
        const preload = new Image();
        preload.src = assetUrl(LIGHTNING_BEAM_SHEET.src);
      }
      if (cue.kind === "tether" && !preloadedFxSources.has(SOUL_LINK_SHEET.src)) {
        preloadedFxSources.add(SOUL_LINK_SHEET.src);
        const preload = new Image();
        preload.src = assetUrl(SOUL_LINK_SHEET.src);
      }
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
            return runSprite(stage, cue.fxKey, cue.at, cue.sound, cue.playbackMs, cue.fit);
          case "projectile":
            return runProjectile(stage, cue);
          case "line":
            return runThrust(stage, { fxKey: cue.fxKey, from: cue.from, at: cue.to, sound: cue.sound });
          case "beam":
            return runLightningBeam(stage, cue);
          case "tether":
            return runSoulTether(stage, cue);
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
          case "pose": {
            const hexFigure = hexUnitFigure(cue.unitId);
            return hexFigure ? playHexUnitCue(hexFigure, { kind: "pose", pose: cue.pose }) : undefined;
          }
          case "place":
            return runHexPlace(cue);
          case "cast": {
            const hexFigure = hexUnitFigure(cue.unitId);
            return hexFigure
              ? playHexUnitCue(hexFigure, { kind: "cast", to: cue.to, releaseMs: cue.releaseMs ?? HEX_CAST_RELEASE_MS })
              : undefined;
          }
          case "hero":
            return playHexHeroCue(cue.playerId, cue.pose);
          case "slash":
            return runSlash(stage, cue);
          case "bolt":
            return runBolt(stage, cue);
          case "burst":
            return runBurst(stage, cue);
          case "rune":
            return runRuneLevel(stage, cue);
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
