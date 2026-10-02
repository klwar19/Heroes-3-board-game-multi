"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  BLESSINGS, CARDS, DEFENDERS, ENEMIES, GW_TPS, SPELLS,
  type EnemyKind, type SpellId
} from "@/engine/garrison/content";
import { VALOR_NEED, baseKind } from "@/engine/garrison/order-chaos/forms";
import { OC_ULTIMATES } from "@/engine/garrison/order-chaos/roster";
import type { OcLine, OcQuipEvent } from "@/engine/garrison/order-chaos/story";
import { surgeText } from "@/engine/garrison/order-chaos/surge-text";
import {
  checkAscend, checkCast, checkMuster, checkPlace, checkSurge, defenderAt,
  type GarrisonEvent, type GarrisonState, type Side, type SidedCommand
} from "@/engine/garrison/sim";
import { OC_ITEMS, isOcItem } from "@/engine/garrison/order-chaos/treasury";
import { assetUrl } from "@/lib/asset-url";
import {
  BOSS_ARRIVAL_BEAT_S, DEFEAT_STING_TRACK, VICTORY_FANFARE_TRACK, bossEffectsDuck, isMusicMuted, playCombatSting, preloadBossWarning, setBossApproach, setMusicHeld, setMusicMuted,
  subscribeMusic, useBackgroundMusic, type MusicScene
} from "@/lib/music";
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from "@/lib/sound";
import { openSettings } from "@/lib/settings-dialog";
import { cancelPendingBattleSounds, playEventSounds, setBattleDuck } from "./audio";
import { BossOmen, bossApproachLeft, type BossArrival } from "./boss-omen";
import { playFieldEventSounds, updateFieldAmbience } from "./field-audio";
import { AdvisorBubble } from "./order-chaos/story-ui";
import { FieldBadge, fieldQuip, fieldTipAt, fieldToast } from "./order-chaos/field-ui";
import { rosterQuip } from "./order-chaos/roster-ui";
import type { GarrisonDriver } from "./driver";
import styles from "./garrison.module.css";
import { BOARD, boardCell, coinSize, createView, drawBoard, ingestEvents, laneTop, preloadForConfig, tileX, type Ghost, type Overlay } from "./renderer";
import { PROP, SURROUNDS, WORLD_W, drawCoinFlights, type CoinFlight } from "./scene";
import { ATK_KEYS, ATK_SPELL_KEYS, AtkTray, DEF_KEYS, DEF_SPELL_KEYS, DefTray, IconOr, Progress, SatchelBar, SpellBar, formatTime, type Selection, type Tip } from "./hud";
import { CARD_SCENES, cardSceneSrc } from "./thumbs";

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
  /** Every batch of simulation events as it happens (Order & Chaos: a Satchel item used spends its copy from the save). */
  onEvents?(events: readonly GarrisonEvent[]): void;
  next?: { label: string; onNext(): void } | null;
  unlockNote?: React.ReactNode;
  /** Banner colour of the defending garrison. */
  defColor?: string;
  /** Level intro (local games), or null. */
  intro?: GameIntro | null;
  /**
   * "order-chaos": the mode's own score (preparation theme while Last Stand
   * planning, battle opener + combat rotation once it runs, held while paused).
   * Default: the classic combat rotation.
   */
  /**
   * Order & Chaos music: "-horde" puts Remnants of the Horde in the battle rotation;
   * "-remnants" opens with it, then Grasswalk, the two taking turns.
   */
  music?: "order-chaos" | "order-chaos-horde" | "order-chaos-remnants";
  /** Order & Chaos: what Crag Hack says at a moment of the battle (null: nothing). */
  advisor?: (event: OcQuipEvent) => OcLine | null;
};

const HOVER_COLLECT_KEY = "garrison:hover-collect";
/** The painted battle HUD: oak seed-bank tray, card packets, tool buttons (CSS falls back to gradients). */
/** The unit-card backdrops (--gw-scene-day … --gw-scene-grove), picked per card by data-scene. */
const SCENE_VARS = Object.fromEntries(CARD_SCENES.map((scene) => [`--gw-scene-${scene}`, `url("${assetUrl(cardSceneSrc(scene))}")`]));
const HUD_ART = {
  tray: "/assets/order-chaos/ui/tray.webp",
  packet: "/assets/order-chaos/ui/packet-frame.webp",
  button: "/assets/order-chaos/ui/button.webp"
} as const;
/** Order & Chaos battle-HUD icons (IconOr routes them through assetUrl). */
const OC_HUD_ICON = {
  surge: "/assets/order-chaos/icons/surge.webp",
  valor: "/assets/order-chaos/icons/valor.webp"
} as const;

function readHoverCollect(): boolean {
  try {
    return window.localStorage.getItem(HOVER_COLLECT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A "charger" event from the lane's own gate Champion riding out (the last line).
 * A hero's Royal Charge raises the same event but leaves the Champion waiting.
 */
function laneChampionRode(s: GarrisonState, lane: number): boolean {
  return s.chargers.some((c) => c.lane === lane && c.dmg === undefined && c.state !== "ready");
}

export function GarrisonGame({ driver, town, hotseat, onLeave, onRestart, onFinish, onEvents, next, unlockNote, defColor, intro: introProp = null, music, advisor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // (Created once: a plain useRef(createView(...)) would build and drop a fresh view on every HUD render.)
  const [initialView] = useState(() => createView(town, defColor));
  const viewRef = useRef(initialView);
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
  const onEventsRef = useRef(onEvents);
  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  const s = driver.state();
  const localDef = driver.local.includes("def");
  const localAtk = driver.local.includes("atk");

  // ---- Music ------------------------------------------------------------------
  const ocMusic = music === "order-chaos" || music === "order-chaos-horde" || music === "order-chaos-remnants";
  // A world boss on the lawn (or the Dracolich): the boss theme until it falls. An announced world
  // boss brings it in early (the warning first, see the frame loop's setBossApproach) so it lands on the beat.
  const bossAlive = !s.outcome && (s.warbossId !== undefined || s.boss !== null)
    && s.enemies.some((e) => !e.dead && (e.id === s.warbossId || e.id === s.boss?.id));
  const bossLeft = bossApproachLeft(s, speed);
  const bossTheme = bossAlive || (bossLeft !== null && bossLeft <= BOSS_ARRIVAL_BEAT_S);
  const musicScene: MusicScene = ocMusic ? (s.planning ? "oc-prep" : bossTheme ? "oc-boss" : music === "order-chaos-horde" ? "oc-battle-horde" : music === "order-chaos-remnants" ? "oc-battle-remnants" : "oc-battle") : "combat";
  useBackgroundMusic(musicScene);
  const ocMusicRef = useRef(ocMusic);
  useEffect(() => {
    ocMusicRef.current = ocMusic;
  }, [ocMusic]);
  // (The lawn's sounds never stay hushed past this battle.)
  useEffect(() => () => setBattleDuck(1), []);
  // A world boss will come (a level's last wave, or Endless): its warning loads now.
  const bossBattle = ocMusic && (s.cfg.oc?.warboss !== undefined || (s.cfg.endless === true && (s.cfg.oc?.endlessBosses?.length ?? 0) > 0));
  useEffect(() => {
    if (bossBattle) preloadBossWarning();
  }, [bossBattle]);
  const [bossArrival, setBossArrival] = useState<BossArrival | null>(null);
  const arrivalTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(arrivalTimerRef.current), []);
  // Order & Chaos: a pause holds the track and resuming continues it where it stopped.
  // Declared after useBackgroundMusic so on unmount the scene stops before the hold lifts.
  const holdMusic = ocMusic && paused && !s.outcome;
  useEffect(() => {
    setMusicHeld(holdMusic);
  }, [holdMusic]);
  useEffect(() => () => setMusicHeld(false), []);
  const [musicMuted, setMusicMutedState] = useState(isMusicMuted);
  useEffect(() => subscribeMusic(() => setMusicMutedState(isMusicMuted())), []);
  // Options (or another tab) can flip the effects mute too: keep this checkbox in step.
  useEffect(() => subscribeSoundMuted(() => setMuted(isSoundMuted())), []);

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

  // Crag Hack pipes up: each moment once per battle (the great assaults every time).
  const [quip, setQuip] = useState<{ line: OcLine; id: number } | null>(null);
  const quipsSaidRef = useRef(new Set<OcQuipEvent>());
  const advisorRef = useRef(advisor);
  useEffect(() => {
    advisorRef.current = advisor;
  }, [advisor]);
  const quipTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(quipTimerRef.current), []);
  const showQuip = useCallback((line: OcLine) => {
    const id = performance.now();
    setQuip({ line, id });
    window.clearTimeout(quipTimerRef.current);
    quipTimerRef.current = window.setTimeout(() => setQuip((current) => (current?.id === id ? null : current)), 5200);
  }, []);
  const sayQuip = useCallback((event: OcQuipEvent) => {
    if (event !== "huge-wave" && quipsSaidRef.current.has(event)) return;
    quipsSaidRef.current.add(event);
    const line = advisorRef.current?.(event);
    if (line) showQuip(line);
  }, [showQuip]);
  /** Order & Chaos battlefield moments Crag has explained this battle (weather, the ways in, ice, sleep, banks). */
  const fieldSaidRef = useRef(new Set<string>());
  /** The hovered lawn tile's battlefield tip is showing (the tray's own tips aren't touched). */
  const fieldTipRef = useRef(false);

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

  /** Order & Chaos: take a Surge orb in hand (then click a unit). */
  const chooseSurge = useCallback(() => {
    const state = driver.state();
    if (!state.cfg.oc || state.cfg.mode === "raid") return;
    if (selectionRef.current?.t === "surge") {
      select(null);
      return;
    }
    if (state.def.surges <= 0) {
      flashHint("No Surge orbs — slay the glowing foes to gather them.");
      return;
    }
    select({ t: "surge" });
  }, [driver, flashHint, select]);

  const surgeOn = useCallback((id: number) => {
    const check = checkSurge(driver.state(), id);
    if (!check.ok) {
      flashHint(check.reason);
      return false;
    }
    submit({ t: "surge", id, by: "def" });
    return true;
  }, [driver, flashHint, submit]);

  /** Order & Chaos: take a Valor crown in hand (then click a unit to Ascend it). */
  const chooseAscend = useCallback(() => {
    const state = driver.state();
    if (!state.cfg.oc?.ultimates?.length || state.cfg.mode === "raid") return;
    if (selectionRef.current?.t === "ascend") {
      select(null);
      return;
    }
    if (state.def.crowns <= 0) {
      flashHint("No Valor crown yet — slay the horde to fill it.");
      return;
    }
    select({ t: "ascend" });
  }, [driver, flashHint, select]);

  const ascendOn = useCallback((id: number) => {
    const check = checkAscend(driver.state(), id);
    if (!check.ok) {
      flashHint(check.reason);
      return false;
    }
    submit({ t: "ascend", id, by: "def" });
    return true;
  }, [driver, flashHint, submit]);

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
    // Nothing flying and nothing left on it: no work, and no layout read every frame
    // (it is re-measured when the next coin flies; a blank canvas needs no resizing).
    if (flightsRef.current.length === 0 && overlay.dataset.dirty !== "1") return;
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
      // Order & Chaos: a world boss is due — the music hushes, the warning plays, the boss theme
      // swells in on its beat, and the lawn's own sounds step aside and come back with it.
      if (ocMusicRef.current) {
        const left = bossApproachLeft(driver.state(), speedRef.current);
        setBossApproach(left);
        setBattleDuck(bossEffectsDuck(left));
      }
      let urgent = false;
      if (events.length) {
        onEventsRef.current?.(events);
        ingestEvents(view, state, events, now);
        playEventSounds(state, events);
        if (state.cfg.oc) playFieldEventSounds(events);
        for (const ev of events) {
          // Order & Chaos battlefield: a first-time word from Crag, and a toast.
          if (state.cfg.oc && advisorRef.current && driver.local.includes("def")) {
            const line = fieldQuip(ev, state, fieldSaidRef.current) ?? rosterQuip(ev, fieldSaidRef.current);
            if (line) showQuip(line);
            const note = fieldToast(ev, state);
            if (note) showToast(note.text, note.tone);
          }
          // Crag Hack's quips ride alongside the usual announcements and toasts.
          if (ev.e === "hugeWave") sayQuip(ev.final ? "final-wave" : "huge-wave");
          else if (ev.e === "wave" && ev.wave === 1) sayQuip("start");
          else if ((ev.e === "orb" || ev.e === "crown") && driver.local.includes("def")) sayQuip(ev.e);
          else if (ev.e === "charger" && laneChampionRode(driver.state(), ev.lane)) sayQuip("charger");
          else if (ev.e === "bossAction") sayQuip("boss");
          if (ev.e === "bossEnter" && state.cfg.oc) {
            const key = now;
            setBossArrival({ kind: ev.kind, key });
            window.clearTimeout(arrivalTimerRef.current);
            arrivalTimerRef.current = window.setTimeout(() => setBossArrival((current) => (current?.key === key ? null : current)), 2300);
          }
          // (A world boss leading the assault has its own omen on screen: no second banner over it.)
          if (ev.e === "hugeWave" && state.director.bossDue) {
            // The omen names the boss and counts it down.
          } else if (ev.e === "hugeWave") {
            announceNow("A huge wave is approaching!", "huge", 2600);
            if (ev.final) window.setTimeout(() => announceNow("Final wave!", "final", 2200), 2700);
          } else if (ev.e === "wave" && ev.wave === 1) showToast("The attack begins!", "info");
          else if (ev.e === "collect" && !ev.surge && driver.local.includes("def")) launchCoin(ev.id, ev.value, now);
          else if (ev.e === "horn") announceNow("Here they come!", "go", 1400);
          else if (ev.e === "item" && isOcItem(ev.id)) showToast(`${OC_ITEMS[ev.id].name} used from the Satchel.`, "info");
          else if (ev.e === "snatchDrop") {
            const d = state.defenders.find((unit) => unit.id === ev.target);
            showToast(`A Harpy is snatching your ${d ? DEFENDERS[d.kind]!.name : "troop"}! Slay her!`, "warn");
          } else if (ev.e === "snatched" && ev.target >= 0) showToast(`Your ${DEFENDERS[ev.kind]?.name ?? "troop"} was carried off!`, "boss");
          else if (ev.e === "overtime") showToast("Overtime! Might flows twice as fast; no more gold from the sky.", "warn");
          else if (ev.e === "raided") showToast("A lane is broken!", "boss");
          else if (ev.e === "crown" && driver.local.includes("def")) showToast("A Valor crown is ready! Press U and pick a unit to Ascend it.", "info");
          else if (ev.e === "ascend") announceNow(`${DEFENDERS[ev.kind]?.name ?? "Ascension"}!`, "go", 1500);
          else if (ev.e === "charger" && laneChampionRode(driver.state(), ev.lane)) showToast("Last line! The gate charger rides out.", "warn");
          else if (ev.e === "bossAction") {
            showToast(ev.action === "summon" ? "The Dracolich raises the dead!" : ev.action === "breath" ? "The Dracolich breathes death down its lane!"
              : ev.action === "dragon" ? `A ${ENEMIES[state.cfg.oc?.bossDragon ?? "bone-dragon"]?.name ?? "dragon"} falls from the sky!` : "The Dracolich shifts lanes.", "boss");
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
        // (A boss laugh still waiting must not sound over the result.)
        cancelPendingBattleSounds();
        const won = driver.local.includes(state.outcome.winner);
        const both = driver.local.length > 1;
        playCombatSting(both || won ? VICTORY_FANFARE_TRACK : DEFEAT_STING_TRACK);
        onFinishRef.current?.({ winner: state.outcome.winner, reason: state.outcome.reason, state });
        urgent = true;
      }
      // (Paused or held by the intro, the match cannot change: the HUD re-renders only for its own UI state.)
      if (urgent || (!halt && now - hudAt > 110)) {
        hudAt = now;
        force();
      }
      // Order & Chaos: one quiet loop for the weather or the night (stopped while paused and once it's over).
      updateFieldAmbience(state.cfg.oc && !state.outcome && !pausedRef.current ? state : null);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      updateFieldAmbience(null);
      cancelPendingBattleSounds();
    };
  }, [announceNow, askCollect, drawOverlay, driver, hotseat, intro, launchCoin, sayQuip, showQuip, showToast]);

  // ---- Pointer --------------------------------------------------------------
  const logical = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { px: ((event.clientX - rect.left) * BOARD.W) / rect.width, py: ((event.clientY - rect.top) * BOARD.H) / rect.height };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { px, py } = logical(event);
    const cell = boardCell(px, py);
    hoverRef.current = cell ? { ...cell, px, py } : null;
    // Order & Chaos: what that tile of the battlefield does (while nothing is in hand).
    const state = driver.state();
    if (state.cfg.oc && !selectionRef.current) {
      const tip = cell && cell.x >= 0 && cell.x < 9 ? fieldTipAt(state, cell.lane, cell.col) : null;
      if (tip) {
        fieldTipRef.current = true;
        // (The same text keeps the same tip object: no re-render of the whole battle screen on every pointer move.)
        setTip((current) => (current && current.title === tip.title && current.lines.join("\n") === tip.lines.join("\n") ? current : tip));
      } else if (fieldTipRef.current) {
        fieldTipRef.current = false;
        setTip(null);
      }
    }
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
    if (sel?.t === "surge") {
      const d = defenderAt(state, cell.lane, cell.col);
      if (!d) {
        flashHint("Drop the Surge on one of your troops.");
        return;
      }
      if (surgeOn(d.id)) select(null);
      return;
    }
    if (sel?.t === "ascend") {
      const d = defenderAt(state, cell.lane, cell.col);
      if (!d) {
        flashHint("Pick one of your troops to Ascend.");
        return;
      }
      if (ascendOn(d.id)) select(null);
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
        if (key === "g") chooseSurge();
        if (key === "u") chooseAscend();
        if (key === "enter" && state.planning) submit({ t: "begin", by: "def" });
      }
      if (key === "f" && driver.canPause) {
        const nextSpeed = speedRef.current === 1 ? 2 : 1;
        speedRef.current = nextSpeed;
        setSpeed(nextSpeed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [castAt, chooseAscend, chooseSpell, chooseSurge, driver, hotseat, localAtk, localDef, mustAtkLane, openPopover, select, setPausedBoth, skipIntro, submit]);

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
    <div
      className={styles.game}
      data-hudart=""
      ref={gameRef}
      style={{
        ["--gw-surround" as string]: `url("${assetUrl(SURROUNDS[s.cfg.terrain] ?? SURROUNDS.grass)}")`,
        ["--gw-tray-img" as string]: `url("${assetUrl(HUD_ART.tray)}")`,
        ["--gw-packet-img" as string]: `url("${assetUrl(HUD_ART.packet)}")`,
        ["--gw-button-img" as string]: `url("${assetUrl(HUD_ART.button)}")`,
        ...SCENE_VARS
      }}
    >
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
          {localDef && s.cfg.oc && s.cfg.mode !== "raid" ? (
            <button
              aria-label={`Surge orbs: ${s.def.surges} of ${s.def.surgeMax}`}
              className={`${styles.tool} ${styles.surgeTool} ${selection?.t === "surge" ? styles.cardSelected : ""} ${s.def.surges > 0 ? styles.surgeReady : ""}`}
              onClick={chooseSurge}
              title="Surge (G): drop an orb on a unit to unleash its Surge"
              type="button"
            >
              <IconOr className={styles.toolIcon} fallback="✦" src={OC_HUD_ICON.surge} />
              <b className={styles.surgeCount}>{s.def.surges}/{s.def.surgeMax}</b>
            </button>
          ) : null}
          {localDef && s.cfg.oc?.ultimates?.length && s.cfg.mode !== "raid" ? (
            <button
              aria-label={`Valor crowns: ${s.def.crowns} of ${s.def.crownMax}`}
              className={`${styles.tool} ${styles.surgeTool} ${styles.crownTool} ${selection?.t === "ascend" ? styles.cardSelected : ""} ${s.def.crowns > 0 ? styles.crownReady : ""}`}
              onClick={chooseAscend}
              title={`Ascend (U): spend a Valor crown to turn a unit into its Ascended form. Slain foes fill the next crown (${Math.floor(s.def.valor)} / ${VALOR_NEED}).`}
              type="button"
            >
              <span aria-hidden className={styles.valorFill} style={{ height: `${s.def.crowns >= s.def.crownMax ? 100 : (s.def.valor / VALOR_NEED) * 100}%` }} />
              <IconOr className={styles.toolIcon} fallback="♛" src={OC_HUD_ICON.valor} />
              <b className={styles.surgeCount}>{s.def.crowns}/{s.def.crownMax}</b>
            </button>
          ) : null}
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
          onPointerLeave={() => { hoverRef.current = null; if (fieldTipRef.current) { fieldTipRef.current = false; setTip(null); } }}
          onPointerMove={onPointerMove}
          ref={canvasRef}
        />
        {popDef && localDef ? (
          <div
            className={styles.popover}
            style={{ left: `${(tileX(popDef.col + 0.5) / BOARD.W) * 100}%`, top: `${(laneTop(popDef.lane) / BOARD.H) * 100}%` }}
          >
            <strong>{DEFENDERS[popDef.kind]!.name}{(DEFENDERS[popDef.kind]!.level ?? 1) > 1 ? ` · Lv ${DEFENDERS[popDef.kind]!.level}` : ""}</strong>
            <small>{Math.max(0, Math.round(popDef.hp))} / {popDef.maxHp} HP{popDef.shell > 0 ? ` · shell ${popDef.shell}` : ""}</small>
            <p>{DEFENDERS[popDef.kind]!.blurb}</p>
            {popDef.asleep ? <p className={styles.surgeLine}>Zzz — asleep{popDef.asleep === 2 ? " (a Nightmare's lull)" : " (a night creature by day)"}: pour a Wake-Up Brew on it to wake it.</p> : null}
            {/* Order & Chaos content pass: a band's size, a Nix's bashes, an Iron Maiden shut, a troop in ice. */}
            {DEFENDERS[popDef.kind]!.band ? <p className={styles.surgeLine}>{(popDef.members ?? 1) >= 3 ? "A Horde" : (popDef.members ?? 1) === 2 ? "A Pack" : "A lone elf"} of {popDef.members ?? 1}{(popDef.members ?? 1) < DEFENDERS[popDef.kind]!.band!.max ? " — drop the same packet on it to grow it." : "."}</p> : null}
            {DEFENDERS[popDef.kind]!.repel ? <p className={styles.surgeLine}>Shield-bashes ready: {DEFENDERS[popDef.kind]!.repel!.charges - popDef.stacks} of {DEFENDERS[popDef.kind]!.repel!.charges}.</p> : null}
            {DEFENDERS[popDef.kind]!.maw && popDef.busyUntil > s.tick ? <p className={styles.surgeLine}>Shut tight — opens again in {Math.ceil((popDef.busyUntil - s.tick) / GW_TPS)} s.</p> : null}
            {(popDef.iceUntil ?? 0) > s.tick ? <p className={styles.surgeLine}>Sealed in ice for {Math.ceil(((popDef.iceUntil ?? 0) - s.tick) / GW_TPS)} s — a fire troop beside it, Cure or a Surge thaws it.</p> : null}
            {DEFENDERS[popDef.kind]!.surge ? <p className={styles.surgeLine}>Surge: {surgeText(DEFENDERS[popDef.kind]!)}</p> : null}
            {s.cfg.oc && DEFENDERS[popDef.kind]!.surge ? (
              <button
                className={styles.primary}
                disabled={s.def.surges <= 0 || popDef.surgeLeft > 0}
                onClick={() => { if (surgeOn(popDef.id)) openPopover(null); }}
                type="button"
              >
                Surge ({s.def.surges} left)
              </button>
            ) : null}
            {DEFENDERS[popDef.kind]!.ascendedFrom ? (
              <p className={styles.ascendLine}>♛ Ascended — {Math.max(0, Math.ceil((popDef.ascendUntil - s.tick) / GW_TPS))} s left</p>
            ) : s.cfg.oc?.ultimates?.includes(baseKind(popDef.kind)) && OC_ULTIMATES[baseKind(popDef.kind)] ? (
              <>
                <p className={styles.ascendLine}>♛ {OC_ULTIMATES[baseKind(popDef.kind)]!.name} (+30% health and power): {OC_ULTIMATES[baseKind(popDef.kind)]!.blurb}</p>
                <button
                  className={styles.primary}
                  disabled={s.def.crowns <= 0}
                  onClick={() => { if (ascendOn(popDef.id)) openPopover(null); }}
                  type="button"
                >
                  Ascend ({s.def.crowns} crown{s.def.crowns === 1 ? "" : "s"})
                </button>
              </>
            ) : null}
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
            {DEFENDERS[popDef.kind]!.landmark ? null : (
              <button className={styles.ghostButton} onClick={() => { submit({ t: "dismiss", id: popDef.id, by: "def" }); openPopover(null); }} type="button">
                Dismiss (no refund)
              </button>
            )}
          </div>
        ) : null}
        </div>
        {s.planning && localDef ? (
          <div className={styles.planning}>
            <span>Last Stand — place your troops (no recharge while you plan), then sound the horn.</span>
            <button className={styles.primary} onClick={() => submit({ t: "begin", by: "def" })} type="button">Sound the horn (Enter)</button>
          </div>
        ) : null}
        {toast ? <div className={`${styles.toast} ${styles[`toast_${toast.tone}`]}`} key={toast.id}>{toast.text}</div> : null}
        {quip ? <div aria-live="polite" className={styles.quip} key={quip.id}><AdvisorBubble compact line={quip.line} /></div> : null}
        {s.cfg.oc ? <BossOmen arrival={bossArrival} kind={s.director.bossDue?.kind} left={bossLeft} /> : null}
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
          <>
            <SpellBar keys={hotseat ? [] : DEF_SPELL_KEYS} onChoose={chooseOrClear} onTip={setTip} s={s} selection={selection} side="def" />
            <SatchelBar onTip={setTip} onUse={(id) => submit({ t: "item", id, by: "def" })} s={s} />
          </>
        ) : localAtk ? (
          <SpellBar keys={[]} onChoose={chooseOrClear} onTip={setTip} s={s} selection={selection} side="atk" />
        ) : null}
        <Progress s={s} />
        {s.cfg.oc ? <FieldBadge onTip={setTip} s={s} /> : null}
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
              <label className={styles.toggle}>
                <input checked={musicMuted} onChange={(event) => setMusicMuted(event.target.checked)} type="checkbox" />
                Mute music
              </label>
              <button className={styles.ghostButton} onClick={() => openSettings("audio")} type="button">Options (volume, display…)</button>
              <button className={styles.ghostButton} onClick={onLeave} type="button">Quit to menu</button>
            </div>
            <p className={styles.keysHelp}>
              {hotseat
                ? "Defender: 1–0 cards, mouse for the rest · Attacker: ↑/↓ lane · A–; muster · Z/X/C spells · Space pause · Esc cancel"
                : `${localDef ? `1–0 cards · Q–${s.cfg.spells.length > 5 ? "Y" : "T"} spells · S dismiss · ${s.cfg.oc ? "G surge · " : ""}${s.cfg.oc?.ultimates?.length ? "U ascend · " : ""}` : ""}Space pause · F speed · Esc cancel`}
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
    // Order & Chaos band: regrouping grows it (a dearer packet).
    if (check.ok && check.action === "band" && check.target) {
      const next = (check.target.members ?? 1) + 1;
      return { t: "unit", lane: hover.lane, col: hover.col, sprite: DEFENDERS[check.target.kind]!.sprite, ok: true, label: `${next >= 3 ? "Horde" : "Pack"} (${next}) · ${check.cost} gold` };
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
  if (sel.t === "surge") {
    const d = defenderAt(s, hover.lane, hover.col);
    return { t: "tile", lane: hover.lane, col: hover.col, ok: d !== undefined && checkSurge(s, d.id).ok };
  }
  if (sel.t === "ascend") {
    const d = defenderAt(s, hover.lane, hover.col);
    return { t: "tile", lane: hover.lane, col: hover.col, ok: d !== undefined && checkAscend(s, d.id).ok };
  }
  if (sel.kind === "tent") return { t: "tile", lane: hover.lane, col: hover.col, ok: checkMuster(s, "tent", hover.lane, hover.col).ok };
  return { t: "lane", lane: hover.lane, ok: checkMuster(s, sel.kind, hover.lane).ok && (s.cfg.mode !== "raid" || hover.x >= (s.cfg.atkMinX ?? 6)) };
}
