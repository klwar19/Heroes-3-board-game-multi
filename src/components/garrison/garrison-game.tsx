"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  BLESSINGS, CARDS, DEFENDERS, SPELLS,
  type EnemyKind, type SpellId
} from "@/engine/garrison/content";
import {
  checkCast, checkMuster, checkPlace, defenderAt,
  type GarrisonState, type Side, type SidedCommand
} from "@/engine/garrison/sim";
import { assetUrl } from "@/lib/asset-url";
import { DEFEAT_STING_TRACK, VICTORY_FANFARE_TRACK, playCombatSting, useBackgroundMusic } from "@/lib/music";
import { isSoundMuted, setSoundMuted } from "@/lib/sound";
import { playEventSounds } from "./audio";
import type { GarrisonDriver } from "./driver";
import styles from "./garrison.module.css";
import { BOARD, boardCell, coinSize, createView, drawBoard, ingestEvents, laneTop, preloadForConfig, tileX, type Ghost, type Overlay } from "./renderer";
import { PROP, WORLD_W, drawCoinFlights, type CoinFlight } from "./scene";
import { ATK_KEYS, ATK_SPELL_KEYS, AtkTray, DEF_KEYS, DEF_SPELL_KEYS, DefTray, IconOr, Progress, SpellBar, formatTime, type Selection, type Tip } from "./hud";

export type GameResult = { winner: Side; reason: string; state: GarrisonState };

/** Level intro: the camera pans out to the waiting foes (`lineup`), then "Ready… Set… <cue>". */
export type GameIntro = { title: string; lineup: EnemyKind[]; cue: string };

type Announce = { text: string; tone: "title" | "ready" | "go" | "huge" | "final"; key: number };

/** Intro timeline (ms) and the camera offset / banner for a moment of it. */
function introReadyAt(intro: GameIntro): number {
  return intro.lineup.length > 0 ? 4300 : 1000;
}

function introAt(intro: GameIntro, t: number): { camX: number; phase: "title" | "out" | "ready" | "set" | "go" | "done"; halt: boolean } {
  const pan = intro.lineup.length > 0;
  const far = WORLD_W - BOARD.W;
  const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const readyAt = introReadyAt(intro);
  if (pan && t < 700) return { camX: 0, phase: "title", halt: true };
  if (pan && t < 1600) return { camX: far * ease((t - 700) / 900), phase: "out", halt: true };
  if (pan && t < 3300) return { camX: far, phase: "out", halt: true };
  if (pan && t < readyAt) return { camX: far * (1 - ease((t - 3300) / 1000)), phase: "out", halt: true };
  if (!pan && t < readyAt) return { camX: 0, phase: "title", halt: true };
  if (t < readyAt + 550) return { camX: 0, phase: "ready", halt: true };
  if (t < readyAt + 1100) return { camX: 0, phase: "set", halt: true };
  if (t < readyAt + 1900) return { camX: 0, phase: "go", halt: false };
  return { camX: 0, phase: "done", halt: false };
}

type Props = {
  driver: GarrisonDriver;
  /** Siege art for the castle wall. */
  town: string;
  /** Same screen: the attacker plays on the keyboard. */
  hotseat: boolean;
  onLeave(): void;
  onRestart?(): void;
  onFinish?(result: GameResult): void;
  next?: { label: string; onNext(): void } | null;
  unlockNote?: React.ReactNode;
  /** Banner colour of the defending garrison. */
  defColor?: string;
  /** Level intro (local games), or null. */
  intro?: GameIntro | null;
};

const HOVER_COLLECT_KEY = "garrison:hover-collect";

function readHoverCollect(): boolean {
  try {
    return window.localStorage.getItem(HOVER_COLLECT_KEY) === "1";
  } catch {
    return false;
  }
}

export function GarrisonGame({ driver, town, hotseat, onLeave, onRestart, onFinish, next, unlockNote, defColor, intro: introProp = null }: Props) {
  useBackgroundMusic("combat");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef(createView(town, defColor));
  /** HUD overlay: coins flying to the counter (in page space, above the bars). */
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<HTMLDivElement | null>(null);
  const goldIconRef = useRef<HTMLImageElement | null>(null);
  const flightsRef = useRef<CoinFlight[]>([]);
  /** Gold still in the air: the counter ticks up as each coin lands. */
  const pendingGoldRef = useRef(0);
  const [pendingGold, setPendingGold] = useState(0);
  const [bump, setBump] = useState(0);
  /** The intro plan is fixed for this match (the component is keyed per match). */
  const [intro] = useState(introProp);
  /** Intro clock: advanced by capped frame steps, so a slow first frame (images decoding) cannot skip a beat. */
  const introRef = useRef<{ elapsed: number; phase: string }>({ elapsed: 0, phase: intro ? "" : "done" });
  /** Any click or key during the intro jumps straight to "Defend!". */
  const skipIntro = useCallback((): boolean => {
    const run = introRef.current;
    if (!intro || run.phase === "done" || run.phase === "go") return false;
    run.elapsed = introReadyAt(intro) + 1100;
    return true;
  }, [intro]);
  const [announce, setAnnounce] = useState<Announce | null>(null);
  const announceNow = useCallback((text: string, tone: Announce["tone"], ms: number) => {
    const key = performance.now() + Math.random();
    setAnnounce({ text, tone, key });
    window.setTimeout(() => setAnnounce((current) => (current?.key === key ? null : current)), ms);
  }, []);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [selection, setSelection] = useState<Selection>(null);
  const selectionRef = useRef<Selection>(null);
  const [popover, setPopover] = useState<number | null>(null);
  const popoverRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [toast, setToast] = useState<{ text: string; tone: "warn" | "info" | "boss"; id: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [atkLane, setAtkLane] = useState(2);
  const atkLaneRef = useRef(2);
  const hoverRef = useRef<{ lane: number; col: number; x: number; px: number; py: number } | null>(null);
  const [hoverCollect, setHoverCollect] = useState(readHoverCollect);
  const hoverCollectRef = useRef(hoverCollect);
  const [muted, setMuted] = useState(isSoundMuted);
  const finishedRef = useRef(false);
  /** When each coin was last asked for (hover fires every frame; online sends each ask). */
  const askedRef = useRef(new Map<number, number>());
  const askCollect = useCallback((id: number) => {
    const now = performance.now();
    if (now - (askedRef.current.get(id) ?? -1e9) < 800) return;
    // Forget old asks (a long Endless run collects thousands of coins).
    if (askedRef.current.size > 200) for (const [key, at] of askedRef.current) if (now - at > 5000) askedRef.current.delete(key);
    askedRef.current.set(id, now);
    driver.submit({ t: "collect", id, by: "def" });
  }, [driver]);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const s = driver.state();
  const localDef = driver.local.includes("def");
  const localAtk = driver.local.includes("atk");

  const select = useCallback((next: Selection) => {
    selectionRef.current = next;
    setSelection(next);
    if (next) {
      popoverRef.current = null;
      setPopover(null);
    }
  }, []);

  const openPopover = useCallback((id: number | null) => {
    popoverRef.current = id;
    setPopover(id);
  }, []);

  const showToast = useCallback((text: string, tone: "warn" | "info" | "boss" = "info") => {
    const id = Date.now() + Math.random();
    setToast({ text, tone, id });
    window.setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 2600);
  }, []);

  const flashHint = useCallback((text: string) => {
    setHint(text);
    window.setTimeout(() => setHint((current) => (current === text ? null : current)), 1600);
  }, []);

  const setPausedBoth = useCallback((value: boolean) => {
    if (!driver.canPause) return;
    pausedRef.current = value;
    setPaused(value);
  }, [driver.canPause]);

  // ---- Commands -------------------------------------------------------------
  const submit = useCallback((cmd: SidedCommand) => driver.submit(cmd), [driver]);

  const mustAtkLane = useCallback((kind: EnemyKind, lane: number, x?: number, col?: number) => {
    const state = driver.state();
    if (kind === "tent") {
      const cols = col !== undefined ? [col] : [8, 7];
      let reason = "";
      for (const c of cols) {
        const check = checkMuster(state, "tent", lane, c);
        if (check.ok) {
          submit({ t: "tent", lane, col: c, by: "atk" });
          return true;
        }
        reason ||= check.reason;
      }
      flashHint(reason);
      return false;
    }
    const check = checkMuster(state, kind, lane);
    if (!check.ok) {
      flashHint(check.reason);
      return false;
    }
    submit({ t: "muster", kind, lane, x, by: "atk" });
    return true;
  }, [driver, submit, flashHint]);

  const castAt = useCallback((side: Side, spell: SpellId, lane: number, x: number) => {
    const check = checkCast(driver.state(), side, spell, lane, x);
    if (!check.ok) {
      flashHint(check.reason);
      return false;
    }
    submit({ t: "cast", side, spell, lane, x, by: side });
    return true;
  }, [driver, submit, flashHint]);

  const chooseSpell = useCallback((side: Side, spell: SpellId) => {
    const def = SPELLS[spell];
    if (def.target === "none") {
      castAt(side, spell, 0, 0);
      return;
    }
    const check = checkCast(driver.state(), side, spell, 2, 5);
    if (!check.ok && check.reason !== "No foe there.") {
      flashHint(check.reason);
      return;
    }
    select({ t: "spell", spell, side });
  }, [castAt, driver, flashHint, select]);

  const chooseOrClear = useCallback((side: Side, spell: SpellId) => {
    const current = selectionRef.current;
    if (current?.t === "spell" && current.spell === spell) select(null);
    else chooseSpell(side, spell);
  }, [chooseSpell, select]);

  const pickAtk = useCallback((kind: EnemyKind) => {
    if (hotseat) {
      mustAtkLane(kind, atkLaneRef.current);
      return;
    }
    const current = selectionRef.current;
    select(current?.t === "atk" && current.kind === kind ? null : { t: "atk", kind });
  }, [hotseat, mustAtkLane, select]);

  useEffect(() => preloadForConfig(driver.state().cfg), [driver]);

  // ---- Gold coins fly to the counter ------------------------------------------------
  /** A collected coin leaves the lawn where it was drawn and arcs up to the gold counter. */
  const launchCoin = useCallback((id: number, value: number, now: number) => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const icon = goldIconRef.current;
    const from = viewRef.current.coinPos.get(id);
    if (!canvas || !overlay || !icon || !from) return;
    const board = canvas.getBoundingClientRect();
    const box = overlay.getBoundingClientRect();
    const target = icon.getBoundingClientRect();
    const k = board.width / BOARD.W;
    flightsRef.current.push({
      x0: board.left - box.left + (from.x - viewRef.current.camX) * k,
      y0: board.top - box.top + from.y * (board.height / BOARD.H),
      x1: target.left - box.left + target.width / 2,
      y1: target.top - box.top + target.height / 2,
      start: now, dur: 720, value, size: coinSize(value) * k, seed: id * 0.7, trail: []
    });
    pendingGoldRef.current += value;
    setPendingGold(pendingGoldRef.current);
  }, []);

  const drawOverlay = useCallback((now: number) => {
    const overlay = overlayRef.current;
    const ctx = overlay?.getContext("2d");
    if (!overlay || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = overlay.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    } else if (flightsRef.current.length === 0) {
      if (overlay.dataset.dirty !== "1") return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    overlay.dataset.dirty = flightsRef.current.length ? "1" : "0";
    if (!flightsRef.current.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { flying, landed } = drawCoinFlights(ctx, flightsRef.current, now);
    flightsRef.current = flying;
    if (landed.length) {
      for (const f of landed) pendingGoldRef.current = Math.max(0, pendingGoldRef.current - f.value);
      setPendingGold(pendingGoldRef.current);
      setBump((n) => n + 1);
    }
  }, []);

  // ---- Main loop ------------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      const state = driver.state();
      const view = viewRef.current;
      // Level intro: pan out to the waiting foes, then "Ready… Set… Defend!" (the match waits).
      let introHalt = false;
      const run = introRef.current;
      if (intro && run.phase !== "done") {
        run.elapsed += Math.min(dt, 50);
        const at = introAt(intro, run.elapsed);
        view.camX = at.camX;
        view.lineup = intro.lineup;
        introHalt = at.halt;
        if (at.phase !== run.phase) {
          run.phase = at.phase;
          if (at.phase === "title") announceNow(intro.title, "title", 1600);
          else if (at.phase === "ready") announceNow("Ready…", "ready", 560);
          else if (at.phase === "set") announceNow("Set…", "ready", 560);
          else if (at.phase === "go") announceNow(intro.cue, "go", 900);
          else if (at.phase === "done") view.lineup = null;
        }
      }
      const halt = pausedRef.current || introHalt;
      const { events, alpha } = driver.pump(dt, halt, speedRef.current);
      let urgent = false;
      if (events.length) {
        ingestEvents(view, state, events, now);
        playEventSounds(state, events);
        for (const ev of events) {
          if (ev.e === "hugeWave") {
            announceNow("A huge wave is approaching!", "huge", 2600);
            if (ev.final) window.setTimeout(() => announceNow("Final wave!", "final", 2200), 2700);
          } else if (ev.e === "wave" && ev.wave === 1) showToast("The attack begins!", "info");
          else if (ev.e === "collect" && driver.local.includes("def")) launchCoin(ev.id, ev.value, now);
          else if (ev.e === "overtime") showToast("Overtime! Might flows twice as fast; no more gold from the sky.", "warn");
          else if (ev.e === "raided") showToast("A lane is broken!", "boss");
          else if (ev.e === "charger") showToast("Last line! The gate charger rides out.", "warn");
          else if (ev.e === "bossAction") {
            showToast(ev.action === "summon" ? "The Dracolich raises the dead!" : ev.action === "breath" ? "The Dracolich breathes death down its lane!"
              : ev.action === "dragon" ? "A Bone Dragon falls from the sky!" : "The Dracolich shifts lanes.", "boss");
          }
          if (ev.e === "outcome" || ev.e === "blessingOffer" || ev.e === "defDie" || ev.e === "upgrade" || ev.e === "fuse") urgent = true;
        }
      }
      // Hover-to-collect gold.
      const hover = hoverRef.current;
      if (hover && hoverCollectRef.current && driver.local.includes("def") && !state.def.offer) {
        for (const p of state.pickups) {
          const t = Math.max(0, Math.min(1, (state.tick - p.bornAt) / Math.max(1, p.landAt - p.bornAt)));
          const py = BOARD.TOP + (p.y0 + (p.y - p.y0) * t) * BOARD.LANE_H;
          if (Math.hypot(tileX(p.x) - hover.px, py - hover.py) < 36) askCollect(p.id);
        }
      }
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.round(BOARD.W * dpr);
        if (canvas.width !== width) {
          canvas.width = width;
          canvas.height = Math.round(BOARD.H * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        const localDefender = driver.local.includes("def") && state.cfg.mode !== "raid";
        const overlay: Overlay = {
          ghost: computeGhost(state, selectionRef.current, hoverRef.current),
          dpr,
          upgradeGold: localDefender ? state.def.gold : null,
          selected: popoverRef.current,
          atkLane: hotseat && driver.local.includes("atk") ? atkLaneRef.current : null,
          defCols: state.cfg.defCols
        };
        drawBoard(ctx, state, view, now, alpha, overlay);
      }
      drawOverlay(now);
      if (state.outcome && !finishedRef.current) {
        finishedRef.current = true;
        const won = driver.local.includes(state.outcome.winner);
        const both = driver.local.length > 1;
        playCombatSting(both || won ? VICTORY_FANFARE_TRACK : DEFEAT_STING_TRACK);
        onFinishRef.current?.({ winner: state.outcome.winner, reason: state.outcome.reason, state });
        urgent = true;
      }
      if (urgent || now - hudAt > 110) {
        hudAt = now;
        force();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [announceNow, askCollect, drawOverlay, driver, hotseat, intro, launchCoin, showToast]);

  // ---- Pointer --------------------------------------------------------------
  const logical = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { px: ((event.clientX - rect.left) * BOARD.W) / rect.width, py: ((event.clientY - rect.top) * BOARD.H) / rect.height };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { px, py } = logical(event);
    const cell = boardCell(px, py);
    hoverRef.current = cell ? { ...cell, px, py } : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (skipIntro()) return;
    if (event.button === 2) {
      select(null);
      openPopover(null);
      return;
    }
    const state = driver.state();
    if (state.outcome || state.def.offer) return;
    const { px, py } = logical(event);
    // Gold first: it is on top of everything.
    if (localDef) {
      for (const p of state.pickups) {
        const t = Math.max(0, Math.min(1, (state.tick - p.bornAt) / Math.max(1, p.landAt - p.bornAt)));
        const cy = BOARD.TOP + (p.y0 + (p.y - p.y0) * t) * BOARD.LANE_H;
        if (Math.hypot(tileX(p.x) - px, cy - py) < 38) {
          askCollect(p.id);
          return;
        }
      }
    }
    const cell = boardCell(px, py);
    if (!cell) return;
    const sel = selectionRef.current;
    if (sel?.t === "card") {
      const check = checkPlace(state, sel.card, cell.lane, cell.col, sel.beltId);
      if (!check.ok) {
        flashHint(check.reason);
        return;
      }
      submit({ t: "place", card: sel.card, lane: cell.lane, col: cell.col, beltId: sel.beltId, by: "def" });
      select(null);
      return;
    }
    if (sel?.t === "spell") {
      if (castAt(sel.side, sel.spell, cell.lane, cell.x)) select(null);
      return;
    }
    if (sel?.t === "shovel") {
      const d = defenderAt(state, cell.lane, cell.col);
      if (d) submit({ t: "dismiss", id: d.id, by: "def" });
      select(null);
      return;
    }
    if (sel?.t === "atk") {
      if (state.cfg.mode === "raid" && cell.x < (state.cfg.atkMinX ?? 6)) {
        flashHint("Muster your troops right of the red line.");
        return;
      }
      if (mustAtkLane(sel.kind, cell.lane, state.cfg.mode === "raid" ? cell.x : undefined, sel.kind === "tent" ? cell.col : undefined)) select(null);
      return;
    }
    if (localDef && state.cfg.mode !== "raid") {
      const d = defenderAt(state, cell.lane, cell.col);
      openPopover(d && d.id !== popoverRef.current ? d.id : null);
    }
  };

  // ---- Keyboard ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (skipIntro()) {
        event.preventDefault();
        return;
      }
      const state = driver.state();
      if (key === "escape") {
        if (selectionRef.current || popoverRef.current) {
          select(null);
          openPopover(null);
        } else if (driver.canPause) {
          setPausedBoth(!pausedRef.current);
        }
        return;
      }
      if (key === " " && driver.canPause) {
        setPausedBoth(!pausedRef.current);
        event.preventDefault();
        return;
      }
      if (localDef) {
        const index = DEF_KEYS.indexOf(key);
        if (index >= 0) {
          if (state.cfg.conveyorPool) {
            const item = state.def.belt[index];
            if (item) select({ t: "card", card: item.card, beltId: item.uid });
          } else {
            const slot = state.def.cards[index];
            if (slot) select({ t: "card", card: slot.id });
          }
          event.preventDefault();
          return;
        }
      }
      if (hotseat && localAtk) {
        if (key === "arrowup" || key === "arrowdown") {
          const lanes = state.cfg.lanes;
          const at = Math.max(0, lanes.indexOf(atkLaneRef.current));
          const lane = lanes[Math.max(0, Math.min(lanes.length - 1, at + (key === "arrowup" ? -1 : 1)))] ?? atkLaneRef.current;
          atkLaneRef.current = lane;
          setAtkLane(lane);
          event.preventDefault();
          return;
        }
        const atkIndex = ATK_KEYS.indexOf(key);
        if (atkIndex >= 0) {
          const slot = state.atk.cards[atkIndex];
          if (slot) mustAtkLane(slot.id, atkLaneRef.current);
          event.preventDefault();
          return;
        }
        const spellIndex = ATK_SPELL_KEYS.indexOf(key);
        if (spellIndex >= 0) {
          const spell = state.cfg.atkSpells[spellIndex];
          if (spell) castAt("atk", spell, atkLaneRef.current, 5);
          return;
        }
        return;
      }
      if (localDef) {
        const spellIndex = DEF_SPELL_KEYS.indexOf(key);
        if (spellIndex >= 0) {
          const spell = state.cfg.spells[spellIndex];
          if (spell) chooseSpell("def", spell);
          return;
        }
        if (key === "s") select(selectionRef.current?.t === "shovel" ? null : { t: "shovel" });
      }
      if (key === "f" && driver.canPause) {
        const nextSpeed = speedRef.current === 1 ? 2 : 1;
        speedRef.current = nextSpeed;
        setSpeed(nextSpeed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [castAt, chooseSpell, driver, hotseat, localAtk, localDef, mustAtkLane, openPopover, select, setPausedBoth, skipIntro]);

  // ---- HUD pieces ---------------------------------------------------------------
  const tick = s.tick;
  const popDef = popover !== null ? s.defenders.find((d) => d.id === popover) : undefined;
  const offer = s.def.offer;
  const outcome = s.outcome;
  const localWon = outcome ? driver.local.includes(outcome.winner) : false;
  const bothLocal = driver.local.length > 1;
  const status = driver.status();
  // The counter lags the purse by the coins still in the air, then ticks up as each one lands.
  const shownGold = Math.max(0, s.def.gold - pendingGold);

  return (
    <div className={styles.game} ref={gameRef}>
      <header className={styles.topBar}>
        {localDef ? (
          <div className={`${styles.resource} ${styles.goldPlaque}`} title="Gold">
            <img alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = assetUrl("/assets/icons/resource-gold.webp"); }} ref={goldIconRef} src={assetUrl(PROP.coin)} />
            <b className={bump ? styles.goldBump : undefined} key={bump}>{s.cfg.conveyorPool ? "Belt" : shownGold}</b>
          </div>
        ) : (
          <div className={styles.resource} title="Might">
            <img alt="" src={assetUrl("/assets/icons/symbol-attack.webp")} />
            <b>{s.atk.might}</b>
          </div>
        )}
        {localDef ? (
          <DefTray gold={shownGold} onSelect={select} onTip={setTip} s={s} selection={selection} />
        ) : localAtk ? (
          <AtkTray onPick={pickAtk} onTip={setTip} s={s} selection={selection} showKeys={hotseat} />
        ) : null}
        <div className={styles.tools}>
          {localDef && s.cfg.mode !== "raid" ? (
            <button
              aria-label="Dismiss a defender"
              className={`${styles.tool} ${selection?.t === "shovel" ? styles.cardSelected : ""}`}
              onClick={() => select(selection?.t === "shovel" ? null : { t: "shovel" })}
              title="Dismiss a defender (S) — no refund"
              type="button"
            >
              <IconOr className={styles.toolIcon} fallback="⛏" src={PROP.spade} />
            </button>
          ) : null}
          {driver.canPause ? (
            <>
              <button aria-label={speed === 2 ? "Normal speed" : "Double speed"} className={`${styles.tool} ${speed === 2 ? styles.cardSelected : ""}`}
                onClick={() => { const v = speed === 1 ? 2 : 1; speedRef.current = v; setSpeed(v); }} title="Speed (F)" type="button">
                {speed === 2 ? "»»" : "»"}
              </button>
              <button aria-label="Pause" className={styles.tool} onClick={() => setPausedBoth(true)} title="Pause (Space / Esc)" type="button">❚❚</button>
            </>
          ) : (
            <button aria-label="Leave" className={styles.tool} onClick={onLeave} type="button">✕</button>
          )}
        </div>
      </header>

      <div className={styles.boardWrap}>
        <div className={styles.boardFrame}>
        <canvas
          aria-label={`${s.cfg.title} battlefield`}
          className={styles.board}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerLeave={() => { hoverRef.current = null; }}
          onPointerMove={onPointerMove}
          ref={canvasRef}
        />
        {popDef && localDef ? (
          <div
            className={styles.popover}
            style={{ left: `${(tileX(popDef.col + 0.5) / BOARD.W) * 100}%`, top: `${(laneTop(popDef.lane) / BOARD.H) * 100}%` }}
          >
            <strong>{DEFENDERS[popDef.kind]!.name}</strong>
            <small>{Math.max(0, Math.round(popDef.hp))} / {popDef.maxHp} HP{popDef.shell > 0 ? ` · shell ${popDef.shell}` : ""}</small>
            <p>{DEFENDERS[popDef.kind]!.blurb}</p>
            {DEFENDERS[popDef.kind]!.upgrade ? (
              <button
                className={styles.primary}
                disabled={s.def.gold < DEFENDERS[popDef.kind]!.upgrade!.cost}
                onClick={() => { submit({ t: "upgrade", id: popDef.id, by: "def" }); openPopover(null); }}
                title={DEFENDERS[DEFENDERS[popDef.kind]!.upgrade!.to]!.blurb}
                type="button"
              >
                Upgrade → {DEFENDERS[DEFENDERS[popDef.kind]!.upgrade!.to]!.name} ({DEFENDERS[popDef.kind]!.upgrade!.cost} gold)
              </button>
            ) : null}
            <button className={styles.ghostButton} onClick={() => { submit({ t: "dismiss", id: popDef.id, by: "def" }); openPopover(null); }} type="button">
              Dismiss (no refund)
            </button>
          </div>
        ) : null}
        </div>
        {toast ? <div className={`${styles.toast} ${styles[`toast_${toast.tone}`]}`} key={toast.id}>{toast.text}</div> : null}
        {announce ? <div aria-live="polite" className={`${styles.announce} ${styles[`announce_${announce.tone}`]}`} key={announce.key}>{announce.text}</div> : null}
        {hint ? <div className={styles.hint}>{hint}</div> : null}
        {status ? <div className={styles.netStatus}>{status}</div> : null}
        {tip ? (
          <div className={styles.tip} role="tooltip">
            <strong>{tip.title}</strong>
            {tip.lines.map((line, i) => <span key={i}>{line}</span>)}
          </div>
        ) : null}
      </div>

      <footer className={styles.bottomBar}>
        {localDef ? (
          <SpellBar keys={hotseat ? [] : DEF_SPELL_KEYS} onChoose={chooseOrClear} onTip={setTip} s={s} selection={selection} side="def" />
        ) : localAtk ? (
          <SpellBar keys={[]} onChoose={chooseOrClear} onTip={setTip} s={s} selection={selection} side="atk" />
        ) : null}
        <Progress s={s} />
        {hotseat && localAtk ? (
          <div className={styles.hotseat}>
            <div className={styles.resource} title="Might">
              <img alt="" src={assetUrl("/assets/icons/symbol-attack.webp")} />
              <b>{s.atk.might}</b>
            </div>
            <span className={styles.laneTag}>Lane {s.cfg.lanes.indexOf(atkLane) + 1} (↑/↓)</span>
            <AtkTray onPick={pickAtk} onTip={setTip} s={s} selection={selection} showKeys />
            <SpellBar keys={ATK_SPELL_KEYS} onChoose={chooseOrClear} onTip={setTip} s={s} selection={selection} side="atk" />
          </div>
        ) : null}
      </footer>
      <canvas aria-hidden="true" className={styles.fxOverlay} ref={overlayRef} />

      {offer ? (
        <div className={styles.scrim}>
          <section aria-label="Choose an artifact" aria-modal="true" className={styles.dialog} role="dialog">
            <h2>A treasure chest! Choose one artifact</h2>
            <div className={styles.offer}>
              {offer.map((id, index) => (
                <button className={styles.relic} key={id} onClick={() => submit({ t: "bless", index, by: "def" })} type="button">
                  <img alt="" src={assetUrl(BLESSINGS[id].icon)} />
                  <strong>{BLESSINGS[id].name}</strong>
                  <span>{BLESSINGS[id].blurb}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {paused && !outcome ? (
        <div className={styles.scrim}>
          <section aria-label="Paused" aria-modal="true" className={styles.dialog} role="dialog">
            <h2>Paused</h2>
            <div className={styles.menuButtons}>
              <button className={styles.primary} onClick={() => setPausedBoth(false)} type="button">Resume</button>
              {onRestart ? <button className={styles.ghostButton} onClick={onRestart} type="button">Restart</button> : null}
              <label className={styles.toggle}>
                <input checked={hoverCollect} onChange={(event) => {
                  const on = event.target.checked;
                  setHoverCollect(on);
                  hoverCollectRef.current = on;
                  try { window.localStorage.setItem(HOVER_COLLECT_KEY, on ? "1" : "0"); } catch { /* storage unavailable */ }
                }} type="checkbox" />
                Collect gold by hovering
              </label>
              <label className={styles.toggle}>
                <input checked={muted} onChange={(event) => { setMuted(event.target.checked); setSoundMuted(event.target.checked); }} type="checkbox" />
                Mute sound effects
              </label>
              <button className={styles.ghostButton} onClick={onLeave} type="button">Quit to menu</button>
            </div>
            <p className={styles.keysHelp}>
              {hotseat
                ? "Defender: 1–0 cards, mouse for the rest · Attacker: ↑/↓ lane · A–; muster · Z/X/C spells · Space pause · Esc cancel"
                : `${localDef ? "1–0 cards · Q–T spells · S dismiss · " : ""}Space pause · F speed · Esc cancel`}
            </p>
          </section>
        </div>
      ) : null}

      {outcome ? (
        <div className={styles.scrim}>
          <section aria-label="Result" aria-modal="true" className={`${styles.dialog} ${styles.result}`} role="dialog">
            <h2 className={localWon || bothLocal ? styles.win : styles.lose}>
              {bothLocal ? (outcome.winner === "def" ? "The defenders win!" : "The attackers win!") : localWon ? "Victory!" : "Defeat"}
            </h2>
            <p>{outcome.reason}</p>
            <dl className={styles.stats}>
              <div><dt>Foes slain</dt><dd>{s.stats.kills}</dd></div>
              <div><dt>Troops raised</dt><dd>{s.stats.placed}</dd></div>
              <div><dt>Troops lost</dt><dd>{s.stats.lost}</dd></div>
              <div><dt>Gold earned</dt><dd>{s.stats.goldEarned}</dd></div>
              <div><dt>Time</dt><dd>{formatTime(tick)}</dd></div>
              {s.cfg.endless ? <div><dt>Waves</dt><dd>{s.director.wave}</dd></div> : null}
            </dl>
            {unlockNote}
            <div className={styles.menuButtons}>
              {next && localWon ? <button className={styles.primary} onClick={next.onNext} type="button">{next.label}</button> : null}
              {onRestart ? <button className={localWon && next ? styles.ghostButton : styles.primary} onClick={onRestart} type="button">Play again</button> : null}
              <button className={styles.ghostButton} onClick={onLeave} type="button">Back to menu</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

/** What the hovered tile would do with the current selection. */
function computeGhost(s: GarrisonState, sel: Selection, hover: { lane: number; col: number; x: number } | null): Ghost {
  if (!sel || !hover) return null;
  if (sel.t === "card") {
    const card = CARDS[sel.card]!;
    const check = checkPlace(s, sel.card, hover.lane, hover.col, sel.beltId);
    if (card.spell === "fireball" && !(check.ok && check.action === "fuse")) return { t: "area", lane: hover.lane, x: hover.col + 0.5, ok: check.ok };
    if (card.spell === "fire-wall") return { t: "lane", lane: hover.lane, ok: check.ok };
    if (card.spell === "stone-skin") return { t: "tile", lane: hover.lane, col: hover.col, ok: check.ok };
    if (check.ok && check.action === "fuse" && check.result) {
      return { t: "unit", lane: hover.lane, col: hover.col, sprite: DEFENDERS[check.result]!.sprite, ok: true, label: `Fuse → ${DEFENDERS[check.result]!.name}` };
    }
    const sprite = card.places && card.places !== "mine" ? DEFENDERS[card.places]!.sprite : "";
    return sprite ? { t: "unit", lane: hover.lane, col: hover.col, sprite, ok: check.ok } : { t: "tile", lane: hover.lane, col: hover.col, ok: check.ok };
  }
  if (sel.t === "spell") {
    const def = SPELLS[sel.spell];
    const ok = checkCast(s, sel.side, sel.spell, hover.lane, hover.x).ok;
    if (def.target === "area") return { t: "area", lane: hover.lane, x: hover.x, ok };
    return { t: "tile", lane: hover.lane, col: Math.max(0, Math.min(8, Math.floor(hover.x))), ok };
  }
  if (sel.t === "shovel") {
    return { t: "tile", lane: hover.lane, col: hover.col, ok: defenderAt(s, hover.lane, hover.col) !== undefined };
  }
  if (sel.kind === "tent") return { t: "tile", lane: hover.lane, col: hover.col, ok: checkMuster(s, "tent", hover.lane, hover.col).ok };
  return { t: "lane", lane: hover.lane, ok: checkMuster(s, sel.kind, hover.lane).ok && (s.cfg.mode !== "raid" || hover.x >= (s.cfg.atkMinX ?? 6)) };
}
