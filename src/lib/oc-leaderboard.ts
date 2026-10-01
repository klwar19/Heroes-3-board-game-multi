"use client";

/**
 * Client for the Order & Chaos tally boards (the `ocscores` PartyKit party,
 * party/oc-scores.ts). Plain HTTP; every call resolves (never throws) and
 * reports `offline` when no PartyKit host is configured or the board can't be
 * reached, so a board being down never blocks play.
 */

import type { OcBoardEntry, OcBoardMode, OcBoardView, OcRunSummary } from "@/engine/garrison/order-chaos/scores";
import { ocPublicId } from "@/engine/garrison/order-chaos/scores";
import { getPartyKitHost, partyProtocol } from "@/lib/party-origin";

export type OcBoardRow = OcBoardEntry & { rank: number };

export type OcBoardQuery = { mode: OcBoardMode; view: OcBoardView; raid?: string; day?: string; setup?: string };

export type OcBoardResult = { ok: true; rows: OcBoardRow[]; today: string } | { ok: false; offline: boolean; error: string };

export type OcPlacing = { rank: number | null; best: OcBoardRow | null; improved: boolean };

export type OcPostResult = { ok: true; score: number; pid: string; today: OcPlacing; all: OcPlacing } | { ok: false; offline: boolean; error: string };

const SCORE_ID_KEY = "order-chaos:score-id:v1";
const OFFLINE = "The tally board can't be reached right now.";

let sessionId: string | null = null;

function freshId(): string {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `oc_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * This browser's anonymous tally-board id (kept in localStorage so a player
 * keeps one row per board). With storage blocked it lasts for this visit.
 */
export function getOcScoreId(): string {
  try {
    const stored = window.localStorage.getItem(SCORE_ID_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
    const id = freshId();
    window.localStorage.setItem(SCORE_ID_KEY, id);
    return id;
  } catch {
    sessionId ??= freshId();
    return sessionId;
  }
}

/** The public id the boards show for this browser (to highlight "you"). */
export function getOcPublicId(): string {
  return ocPublicId(getOcScoreId());
}

function endpoint(): string | null {
  const host = getPartyKitHost();
  return host ? `${partyProtocol(host)}://${host}/parties/ocscores/global` : null;
}

/** True when a tally board is configured at all (else it's always offline). */
export function ocBoardsConfigured(): boolean {
  return endpoint() !== null;
}

/** Boards fetched in the last few seconds (flipping tabs on the Tally Board doesn't refetch). */
const BOARD_CACHE_MS = 20_000;
const boardCache = new Map<string, { at: number; result: OcBoardResult & { ok: true } }>();
/** When this browser last posted (the browser may still hold a page from before it for a few seconds). */
let postedAt = 0;

/**
 * One board page. Called only while a tally screen is open (never polled); a
 * page fetched in the last BOARD_CACHE_MS is reused unless `fresh`.
 */
export async function fetchOcBoard(query: OcBoardQuery, fresh = false): Promise<OcBoardResult> {
  const base = endpoint();
  if (!base) return { ok: false, offline: true, error: "No tally board is set up for this game server." };
  const params = new URLSearchParams({ mode: query.mode, view: query.view });
  if (query.raid) params.set("raid", query.raid);
  if (query.day) params.set("day", query.day);
  if (query.setup) params.set("setup", query.setup);
  const url = `${base}?${params.toString()}`;
  const bypass = fresh || Date.now() - postedAt < 15_000;
  const hit = boardCache.get(url);
  if (!bypass && hit && Date.now() - hit.at < BOARD_CACHE_MS) return hit.result;
  try {
    const response = await fetch(url, { cache: bypass ? "no-store" : "default" });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; rows?: OcBoardRow[]; today?: string; error?: string } | null;
    if (!response.ok || !data?.ok || !Array.isArray(data.rows)) {
      return { ok: false, offline: response.status >= 500 || !data, error: data?.error ?? OFFLINE };
    }
    const result = { ok: true as const, rows: data.rows, today: typeof data.today === "string" ? data.today : "" };
    if (boardCache.size > 40) boardCache.clear();
    boardCache.set(url, { at: Date.now(), result });
    return result;
  } catch {
    return { ok: false, offline: true, error: OFFLINE };
  }
}

export async function postOcRun(name: string, run: OcRunSummary): Promise<OcPostResult> {
  const base = endpoint();
  if (!base) return { ok: false, offline: true, error: "No tally board is set up for this game server." };
  try {
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: getOcScoreId(), name, run })
    });
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; score?: number; pid?: string; today?: OcPlacing; all?: OcPlacing; error?: string }
      | null;
    if (!response.ok || !data?.ok || !data.today || !data.all) {
      return { ok: false, offline: response.status >= 500 || !data, error: data?.error ?? OFFLINE };
    }
    // The boards changed: the next look fetches them afresh.
    boardCache.clear();
    postedAt = Date.now();
    return { ok: true, score: data.score ?? 0, pid: data.pid ?? "", today: data.today, all: data.all };
  } catch {
    return { ok: false, offline: true, error: OFFLINE };
  }
}
