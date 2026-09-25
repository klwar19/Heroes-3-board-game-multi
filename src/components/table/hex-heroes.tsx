"use client";

// ---------------------------------------------------------------------------
// Hex Battlefield HERO figures (PC-style).
//
// Each side's fighting hero stands outside the grid like Heroes 3: the
// left-hand army's hero at the top-left, the right-hand one at the top-right,
// mirrored to face the field, with its player-coloured flag waving. The seat
// flip applies (your own army is always on the left). Figures never take the
// pointer and draw behind every creature and war machine.
//
// Placement follows VCMI BattleHero: a 64x136 box at the field's top corner,
// the 150x175 frame centred on it, the flag at the box centre + (+/-4, -41).
// The hero's feet stay where the PC puts them; the art is drawn at the same
// scale as the creatures. Animations: standing with an occasional idle
// shuffle, the cast group when the page sends a `hero` FX cue (the spell
// leaves at HERO_CAST_RELEASE_MS — the cue is timed so that beat is when the
// spell's FX starts, from this figure's `hero:<playerId>` anchor), victory /
// defeat once the combat's outcome has played out.
// ---------------------------------------------------------------------------

import { useEffect, useRef, type CSSProperties } from "react";
import { assetUrl } from "@/lib/asset-url";
import type { CombatState, GameState, PlayerId } from "@/engine";
import { coreFactionDefinitions } from "@/data/factions/core";
import {
  HERO_FRAME_MS,
  HERO_GROUP,
  heroFlagSprite,
  heroSpriteForHeroDef,
  type HeroSpriteAtlas
} from "@/data/battle-hex/hero-sprites";
import { HEX_BOARD_HEIGHT, HEX_BOARD_WIDTH, HEX_SPRITE_SCALE } from "./hex-battlefield";
import { onClock } from "./hex-figures";

/** Sent to a hero figure (`[data-hex-hero="<playerId>"]`) by the FX stage. */
export const HEX_HERO_CUE_EVENT = "hexherocue";

export type HexHeroPose = "cast" | "victory" | "defeat";

export type HexHeroCueDetail = {
  pose: HexHeroPose;
  /** Called exactly once when the figure has played the pose. */
  done: () => void;
  accepted?: boolean;
};

/** Same art scale as the creature figures (hex-figures.tsx SPRITE_SCALE). */
const SPRITE_SCALE = HEX_SPRITE_SCALE;
/** VCMI hero box (64x136 at the field's top corner): its centre, in PC pixels = board units. */
const PC_BOX_CENTER = { x: 32, y: 68 };
/** VCMI flag offset from the box centre (x mirrored for the right-hand hero). */
const PC_FLAG_OFFSET = { x: 4, y: -41 };
/** Imported sheets carry no PC origin: the H3 frame centre sits ~58 px above the feet. */
const DEFAULT_ORIGIN_LIFT = 58;
/** Behind every creature (10 + row) and war machine. */
const HERO_Z_INDEX = 9;
/** screen.tsx / chat-panel.tsx fallback when a seat has no faction colour. */
const FALLBACK_PLAYER_COLOR = "#b08d2f";

/**
 * The hero definition fighting for `playerId` in this combat: the PvP
 * attacker/defender hero, the hero that engaged the neutrals, or a Battle Test
 * seat's hero. A heroless garrison / the neutral side has none.
 */
export function combatSideHeroDefId(state: GameState, combat: CombatState, playerId: PlayerId): string | null {
  const context = combat.context;
  const fromHero = (heroId: string | null | undefined): string | null => {
    const hero = heroId ? state.heroes[heroId] : undefined;
    if (!hero || hero.controllerId !== playerId) return null;
    return hero.heroDefId ?? (hero.kind === "main" ? state.players[playerId]?.heroDefId ?? null : null);
  };
  if (context.kind === "player") {
    return fromHero(playerId === combat.attackerPlayerId ? context.attackerHeroId : context.defenderHeroId);
  }
  if (context.kind === "neutral") {
    return fromHero(context.heroId);
  }
  // Battle Test: both seats bring their chosen hero.
  return state.players[playerId]?.heroDefId ?? null;
}

function playerColor(state: GameState, playerId: PlayerId): string {
  const factionId = state.players[playerId]?.factionId;
  return (factionId && coreFactionDefinitions[factionId]?.color) || FALLBACK_PLAYER_COLOR;
}

export function HexHeroesLayer({ state, combat, flipped }: { state: GameState; combat: CombatState; flipped: boolean }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const apply = () => {
      const width = layer.getBoundingClientRect().width;
      if (width > 0) layer.style.setProperty("--hex-scale", String(width / HEX_BOARD_WIDTH));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);
  const sides = ([
    [combat.attackerPlayerId, true],
    [combat.defenderPlayerId, false]
  ] as const).map(([playerId, attacker]) => {
    const atlas = heroSpriteForHeroDef(combatSideHeroDefId(state, combat, playerId));
    return atlas ? { playerId, atlas, leftSide: attacker !== flipped } : null;
  });
  const outcome = combat.outcome;
  return (
    <div
      aria-hidden="true"
      className="hexHeroesLayer"
      ref={layerRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {sides.map((side) =>
        side ? (
          <HexHeroFigure
            atlas={side.atlas}
            color={playerColor(state, side.playerId)}
            combatId={combat.id}
            endPose={
              outcome
                ? outcome.winnerPlayerId === side.playerId ? "victory" : outcome.defeatedPlayerId === side.playerId ? "defeat" : null
                : null
            }
            key={`${side.playerId}:${side.atlas.slug}`}
            leftSide={side.leftSide}
            playerId={side.playerId}
          />
        ) : null
      )}
    </div>
  );
}

function HexHeroFigure({
  playerId,
  atlas,
  leftSide,
  color,
  combatId,
  endPose
}: {
  playerId: PlayerId;
  atlas: HeroSpriteAtlas;
  leftSide: boolean;
  color: string;
  combatId: string;
  /** The combat is over: this hero's closing pose (null = neither winner nor loser). */
  endPose: "victory" | "defeat" | null;
}) {
  const figureRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const flagGreyRef = useRef<HTMLDivElement | null>(null);
  const flagTintRef = useRef<HTMLDivElement | null>(null);
  const endPoseRef = useRef(endPose);
  endPoseRef.current = endPose;
  const flag = heroFlagSprite(leftSide);

  // Sprite controller: standing, idle shuffle, cast / victory / defeat cues.
  useEffect(() => {
    const figure = figureRef.current;
    const sprite = spriteRef.current;
    if (!figure || !sprite) return;
    let disposed = false;
    let ended = false;
    let busy = 0;
    let idleTimer = 0;
    let stopClip: (() => void) | null = null;

    const showFrame = (group: number, index: number) => {
      const info = atlas.groups[String(group)] ?? atlas.groups[String(HERO_GROUP.standing)];
      if (!info) return;
      const column = Math.min(index, info.frames - 1);
      sprite.style.backgroundPosition = `${-column * atlas.frameWidth}px ${-info.row * atlas.frameHeight}px`;
    };
    const lastFrame = (group: number) => Math.max(0, (atlas.groups[String(group)]?.frames ?? 1) - 1);

    /** Plays one group once at the H3 10 fps; `hold` keeps its last frame. */
    const playClip = (group: number, hold: boolean): Promise<void> =>
      new Promise((resolve) => {
        stopClip?.();
        const frames = atlas.groups[String(group)]?.frames ?? 0;
        if (frames === 0) {
          resolve();
          return;
        }
        const total = frames * HERO_FRAME_MS;
        let start = -1;
        const stop = onClock((now) => {
          if (disposed) {
            resolve();
            return false;
          }
          if (start < 0) start = now;
          const elapsed = now - start;
          if (elapsed >= total) {
            if (hold) showFrame(group, frames - 1);
            else showFrame(HERO_GROUP.standing, 0);
            resolve();
            return false;
          }
          showFrame(group, Math.floor(elapsed / HERO_FRAME_MS));
          return true;
        });
        stopClip = () => {
          stop();
          resolve();
        };
      });

    const scheduleIdle = () => {
      window.clearTimeout(idleTimer);
      if (disposed || ended) return;
      idleTimer = window.setTimeout(async () => {
        if (disposed || ended) return;
        if (busy === 0) await playClip(HERO_GROUP.shuffle, false);
        scheduleIdle();
      }, 4500 + Math.random() * 6000);
    };

    const handle = (event: Event) => {
      const detail = (event as CustomEvent<HexHeroCueDetail>).detail;
      if (!detail || detail.accepted) return;
      detail.accepted = true;
      event.stopPropagation();
      if (ended && detail.pose === "cast") {
        detail.done();
        return;
      }
      if (detail.pose !== "cast") {
        ended = true;
        window.clearTimeout(idleTimer);
      }
      busy += 1;
      const group = detail.pose === "cast" ? HERO_GROUP.cast : detail.pose === "victory" ? HERO_GROUP.victory : HERO_GROUP.defeat;
      playClip(group, detail.pose !== "cast")
        .catch(() => undefined)
        .finally(() => {
          busy = Math.max(0, busy - 1);
          detail.done();
        });
    };

    // Reconnecting onto a finished fight: stand in the closing pose at once.
    const initialEnd = endPoseRef.current;
    if (initialEnd) {
      ended = true;
      const group = initialEnd === "victory" ? HERO_GROUP.victory : HERO_GROUP.defeat;
      showFrame(group, lastFrame(group));
    } else {
      showFrame(HERO_GROUP.standing, 0);
      scheduleIdle();
    }
    figure.addEventListener(HEX_HERO_CUE_EVENT, handle);
    return () => {
      disposed = true;
      stopClip?.();
      window.clearTimeout(idleTimer);
      figure.removeEventListener(HEX_HERO_CUE_EVENT, handle);
    };
    // A new combat or new art rebuilds the controller (atlas objects are rebuilt
    // every render, so key on the slug); the end pose is read live.
  }, [atlas.slug, combatId]);

  // Flag: loops forever at 10 fps (CSS steps via WAAPI, no per-frame work).
  useEffect(() => {
    if (!flag) return;
    const span = flag.frameWidth * flag.columns;
    const duration = flag.columns * HERO_FRAME_MS;
    const options: KeyframeAnimationOptions = { duration, iterations: Infinity, easing: `steps(${flag.columns})` };
    const animations = [
      flagGreyRef.current?.animate([{ backgroundPosition: "0px 0px" }, { backgroundPosition: `${-span}px 0px` }], options),
      flagTintRef.current?.animate(
        [
          { maskPosition: "0px 0px", webkitMaskPosition: "0px 0px" },
          { maskPosition: `${-span}px 0px`, webkitMaskPosition: `${-span}px 0px` }
        ] as Keyframe[],
        options
      )
    ];
    return () => {
      for (const animation of animations) animation?.cancel();
    };
  }, [flag?.slug, flag?.columns, flag?.frameWidth]);

  // PC origin (the frame centre VCMI centres on the hero box) in cell pixels.
  const originX = atlas.originX ?? atlas.anchorX;
  const originY = atlas.originY ?? atlas.anchorY - DEFAULT_ORIGIN_LIFT;
  // The feet stand where the PC draws them; x mirrors for the right-hand hero.
  const footLeftX = PC_BOX_CENTER.x + (atlas.anchorX - originX);
  const foot = { x: leftSide ? footLeftX : HEX_BOARD_WIDTH - footLeftX, y: PC_BOX_CENTER.y + (atlas.anchorY - originY) };
  const face = leftSide ? 1 : -1;

  const figureStyle: CSSProperties = {
    left: `${(foot.x / HEX_BOARD_WIDTH) * 100}%`,
    top: `${(foot.y / HEX_BOARD_HEIGHT) * 100}%`,
    zIndex: HERO_Z_INDEX
  };
  // One wrapper in sprite pixels, scaled (and mirrored) around the feet, so the
  // flag and the FX anchor ride the sprite exactly.
  const bodyStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: `${atlas.frameWidth}px`,
    height: `${atlas.frameHeight}px`,
    marginLeft: `${-atlas.anchorX}px`,
    marginTop: `${-atlas.anchorY}px`,
    transformOrigin: `${atlas.anchorX}px ${atlas.anchorY}px`,
    transform: `scale(calc(var(--hex-scale, 1) * ${SPRITE_SCALE} * ${face}), calc(var(--hex-scale, 1) * ${SPRITE_SCALE}))`,
    pointerEvents: "none"
  };
  const flagImage = flag ? `url("${assetUrl(flag.image)}")` : "";
  return (
    <div className="hexFigure hexHero" data-hex-hero={playerId} ref={figureRef} style={figureStyle}>
      <div style={bodyStyle}>
        {flag ? (
          // Drawn first (behind the hero), un-mirrored: the right-hand hero
          // flies CMFLAGR as the PC does.
          <div
            style={{
              position: "absolute",
              left: `${originX + PC_FLAG_OFFSET.x - flag.anchorX}px`,
              top: `${originY + PC_FLAG_OFFSET.y - flag.anchorY}px`,
              width: `${flag.frameWidth}px`,
              height: `${flag.frameHeight}px`,
              transform: `scaleX(${face})`,
              isolation: "isolate"
            }}
          >
            <div
              ref={flagGreyRef}
              style={{ position: "absolute", inset: 0, backgroundImage: flagImage, backgroundRepeat: "no-repeat" }}
            />
            {/* The seat's player colour, multiplied onto the flag's luminance ramp. */}
            <div
              ref={flagTintRef}
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: color,
                mixBlendMode: "multiply",
                maskImage: flagImage,
                WebkitMaskImage: flagImage,
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskPosition: "0px 0px",
                WebkitMaskPosition: "0px 0px"
              }}
            />
          </div>
        ) : null}
        <div
          className="hexSprite"
          ref={spriteRef}
          style={{
            width: `${atlas.frameWidth}px`,
            height: `${atlas.frameHeight}px`,
            backgroundImage: `url("${assetUrl(atlas.image)}")`
          }}
        />
        {/* Spells leave the hero here (VCMI: the hero box centre). */}
        <span
          data-fx-anchor={`hero:${playerId}`}
          style={{ position: "absolute", left: `${originX - 18}px`, top: `${originY - 20}px`, width: "36px", height: "40px" }}
        />
      </div>
    </div>
  );
}
