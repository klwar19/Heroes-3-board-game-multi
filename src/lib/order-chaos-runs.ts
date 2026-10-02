/**
 * Order & Chaos: suspended runs of the scored modes (Endless Siege, Daily
 * Siege, Chaos Raids). A run in progress is written to this device while it
 * is played (every few seconds, when the tab is hidden or closed, and when the
 * player leaves the battle), so a player who quits — or whose tab closes —
 * finds it again and plays on from where they were. Its board score so far is
 * recorded from the same snapshot (see oc-app.tsx), so leaving never loses it.
 *
 * One save per slot: "endless", "daily" and one per raid ("raid:r3"). The
 * whole simulation state is kept (it is plain data — the online game sends
 * the same snapshots); a save made by a different simulation version is still
 * shown and scored, but cannot be resumed.
 */

import { GARRISON_NET_VERSION } from "./garrison-net";
import { setItemMakingRoom } from "./storage-space";
import type { DefKind } from "@/engine/garrison/content";
import type { GarrisonState } from "@/engine/garrison/sim";

export type OcRunSlot = "endless" | "daily" | `raid:${string}`;

export type OcSavedRun = {
  /** This file's format. */
  v: number;
  /** The simulation version it was saved by (GARRISON_NET_VERSION): another cannot resume it. */
  sim: number;
  slot: OcRunSlot;
  /** The level played (OC_ENDLESS, a raid; the Daily Siege's own level). */
  levelId: string;
  /** The troops picked for it (a new run of the same slot starts from them). */
  cards: DefKind[];
  /** Daily Siege: the day of its orders and their fingerprint. */
  day?: string;
  setup?: string;
  hero?: string;
  savedAt: number;
  /** Shown before resuming: where the run stands. */
  wave: number;
  kills: number;
  ticks: number;
  state: GarrisonState;
};

const FORMAT = 1;
const PREFIX = "order-chaos:run:";

const keyOf = (slot: OcRunSlot) => `${PREFIX}${slot}`;

/** JSON keeps no Infinity / NaN: they travel as tagged strings. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "number" && !Number.isFinite(value) ? { $num: String(value) } : value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const tagged = value as { $num?: unknown };
    if (typeof tagged.$num === "string" && Object.keys(value).length === 1) return Number(tagged.$num);
  }
  return value;
}

export function saveOcRun(run: Omit<OcSavedRun, "v" | "sim" | "savedAt" | "wave" | "kills" | "ticks">): boolean {
  const state = run.state;
  const saved: OcSavedRun = {
    ...run,
    v: FORMAT,
    sim: GARRISON_NET_VERSION,
    savedAt: Date.now(),
    wave: state.director.wave,
    kills: state.stats.kills,
    ticks: state.tick,
    state: { ...state, events: [] }
  };
  try {
    return setItemMakingRoom(keyOf(run.slot), JSON.stringify(saved, replacer));
  } catch {
    return false;
  }
}

function parse(raw: string | null, slot: OcRunSlot): OcSavedRun | null {
  if (!raw) return null;
  try {
    const run = JSON.parse(raw, reviver) as OcSavedRun;
    if (!run || run.v !== FORMAT || run.slot !== slot || typeof run.levelId !== "string" || !run.state || typeof run.state.tick !== "number") return null;
    if (!Array.isArray(run.cards)) run.cards = [];
    return run;
  } catch {
    return null;
  }
}

export function loadOcRun(slot: OcRunSlot): OcSavedRun | null {
  try {
    return parse(window.localStorage.getItem(keyOf(slot)), slot);
  } catch {
    return null;
  }
}

/** Every suspended run on this device. */
export function loadOcRuns(): OcSavedRun[] {
  const runs: OcSavedRun[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const run = parse(window.localStorage.getItem(key), key.slice(PREFIX.length) as OcRunSlot);
      if (run) runs.push(run);
    }
  } catch {
    // Storage blocked: no saved runs.
  }
  return runs.sort((a, b) => b.savedAt - a.savedAt);
}

export function clearOcRun(slot: OcRunSlot): void {
  try {
    window.localStorage.removeItem(keyOf(slot));
  } catch {
    // Storage blocked: nothing was kept anyway.
  }
}

/** Can this save be played on (the simulation that wrote it is this one)? */
export function canResumeOcRun(run: OcSavedRun): boolean {
  return run.sim === GARRISON_NET_VERSION && !run.state.outcome;
}

/** "3 min ago" for a save. */
export function savedAgo(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
