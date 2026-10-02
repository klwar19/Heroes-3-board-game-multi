"use client";

/**
 * Client for the Order & Chaos tally boards: the app's own API
 * (/api/order-chaos/scores, src/server/oc-scores), where every row belongs to
 * a Heroes 3 account and shows its nickname, kept like ranked MMR. Plain
 * HTTP; every call resolves (never throws) and reports `offline` when the
 * board can't be reached, so a board being down never blocks play.
 *
 * Reading is open to everyone. Posting needs a signed-in account (the session
 * cookie rides along on these same-origin calls); guests keep their bests on
 * the device until they sign in. The previous home of the boards, the
 * `ocscores` PartyKit party, is no longer used.
 */

import type { OcBoardEntry, OcBoardMode, OcBoardView, OcRunSummary } from "@/engine/garrison/order-chaos/scores";
import { useEffect, useSyncExternalStore } from "react";
import { fetchSession } from "@/lib/auth-client";
import { ocAccountPid } from "@/lib/oc-account-pid";

export type OcBoardRow = OcBoardEntry & { rank: number };

export type OcBoardQuery = { mode: OcBoardMode; view: OcBoardView; raid?: string; day?: string; setup?: string };

export type OcBoardResult = { ok: true; rows: OcBoardRow[]; today: string } | { ok: false; offline: boolean; error: string };

export type OcPlacing = { rank: number | null; best: OcBoardRow | null; improved: boolean };

/**
 * `busy`: the board asked for a pause between posts (try again in a few seconds).
 * `signedOut`: no signed-in account (nothing was posted; sign in and it goes up).
 */
export type OcPostResult =
  | { ok: true; score: number; pid: string; today: OcPlacing; all: OcPlacing }
  | { ok: false; offline: boolean; busy?: boolean; signedOut?: boolean; error: string };

const ENDPOINT = "/api/order-chaos/scores";
const OFFLINE = "The tally board can't be reached right now.";
const SIGNED_OUT = "Sign in to your Heroes 3 account to go on the tally board.";

/** True: the boards are this app's own API, always there (a failed call reports `offline`). */
export function ocBoardsConfigured(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// Who is posting: the signed-in account

/** The signed-in account the boards know this player by (`pid`: the id its rows carry). */
export type OcAccount = { id: string; nickname: string; pid: string };

/** undefined: not checked yet; null: a guest (or the check failed). */
let account: OcAccount | null | undefined;
let checking: Promise<void> | null = null;
const accountListeners = new Set<() => void>();

function setAccount(next: OcAccount | null): void {
  if (account === next || (account && next && account.id === next.id && account.nickname === next.nickname)) return;
  account = next;
  for (const listener of accountListeners) listener();
}

/** Ask the server who is signed in (deduplicated while one check is running). */
export function refreshOcAccount(): Promise<void> {
  checking ??= (async () => {
    try {
      const profile = await fetchSession();
      setAccount(profile ? { id: profile.id, nickname: profile.nickname, pid: ocAccountPid(profile.id) } : null);
    } catch {
      // Can't tell: keep what an earlier check said; with none, post nothing until a later check says who this is.
      if (account === undefined) setAccount(null);
    } finally {
      checking = null;
    }
  })();
  return checking;
}

/** The account as last checked (undefined before the first check finishes). */
export function getOcAccount(): OcAccount | null | undefined {
  return account;
}

function subscribeAccount(listener: () => void): () => void {
  accountListeners.add(listener);
  return () => accountListeners.delete(listener);
}

/**
 * The signed-in account, kept current: checked when a component using it
 * mounts (so coming back from the sign-in page is noticed) and whenever the
 * window regains focus. undefined while the first check runs.
 */
export function useOcAccount(): OcAccount | null | undefined {
  const value = useSyncExternalStore(subscribeAccount, getOcAccount, () => undefined);
  useEffect(() => {
    void refreshOcAccount();
    const onFocus = () => void refreshOcAccount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return value;
}

/** The public id this player's rows carry (to highlight "you"); "" for a guest. */
export function getOcPublicId(): string {
  return account?.pid ?? "";
}

// ---------------------------------------------------------------------------
// Reading

/** Boards fetched in the last few seconds (flipping tabs on the Tally Board doesn't refetch). */
const BOARD_CACHE_MS = 20_000;
const boardCache = new Map<string, { at: number; result: OcBoardResult & { ok: true } }>();
/** When this browser last posted (the browser may still hold a page from before it for a few seconds). */
let postedAt = 0;

/**
 * One board page. Called only while a tally screen is open (it refreshes
 * itself then, see OcTallyBoard); a page fetched in the last BOARD_CACHE_MS is
 * reused unless `fresh`.
 */
export async function fetchOcBoard(query: OcBoardQuery, fresh = false): Promise<OcBoardResult> {
  const params = new URLSearchParams({ mode: query.mode, view: query.view });
  if (query.raid) params.set("raid", query.raid);
  if (query.day) params.set("day", query.day);
  if (query.setup) params.set("setup", query.setup);
  const url = `${ENDPOINT}?${params.toString()}`;
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

// ---------------------------------------------------------------------------
// Posting

/** The board takes one post per account every 5 s: posts from this browser queue up this far apart. */
const POST_GAP_MS = 5_300;
let postQueue: Promise<unknown> = Promise.resolve();
let lastPostStart = 0;
const postListeners = new Set<() => void>();

/** Called after any post the board accepted (an open Tally Board refreshes). */
export function subscribeOcPosts(listener: () => void): () => void {
  postListeners.add(listener);
  return () => postListeners.delete(listener);
}

/**
 * Post a run to its boards under the signed-in account (the server takes the
 * name from the account). Posts are sent one at a time, spaced to the board's
 * per-account limit, so the automatic sync and a finished run's panel never
 * trip over each other.
 */
export function postOcRun(run: OcRunSummary): Promise<OcPostResult> {
  const next = postQueue.then(async () => {
    const wait = lastPostStart + POST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastPostStart = Date.now();
    const result = await sendOcRun(run);
    if (result.ok) for (const listener of postListeners) listener();
    return result;
  });
  postQueue = next.catch(() => undefined);
  return next;
}

async function sendOcRun(run: OcRunSummary): Promise<OcPostResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run })
    });
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; score?: number; pid?: string; today?: OcPlacing; all?: OcPlacing; error?: string; signedOut?: boolean }
      | null;
    if (response.status === 401 || data?.signedOut) {
      // The session is gone: this player is a guest now (their bests wait on the device).
      setAccount(null);
      return { ok: false, offline: false, signedOut: true, error: data?.error ?? SIGNED_OUT };
    }
    if (!response.ok || !data?.ok || !data.today || !data.all) {
      return { ok: false, offline: response.status >= 500 || !data, busy: response.status === 429, error: data?.error ?? OFFLINE };
    }
    // The boards changed: the next look fetches them afresh.
    boardCache.clear();
    postedAt = Date.now();
    return { ok: true, score: data.score ?? 0, pid: data.pid ?? "", today: data.today, all: data.all };
  } catch {
    return { ok: false, offline: true, error: OFFLINE };
  }
}
