"use client";

/**
 * WOG Commanders — the one-time "how your commander gets placed" popup, shown at
 * the START of a game that runs the Commanders module (user rule: "show big pop
 * up clearly warn this if play with commander, right at beginning").
 *
 * PRESENTATION ONLY. It reads GameState, never mutates it, dispatches nothing and
 * opens no engine window — so an AI or AFK seat can never stall on it (the rules
 * it describes are enforced by `commanderSortUnlocked` in the engine whether or
 * not anyone ever sees this card). Dismissed with one click.
 *
 * ONCE PER GAME PER BROWSER: the seen-set is keyed by `GameState.id` in
 * localStorage (`binh-commander-intro`), so a reload/reconnect never re-shows it
 * and a rematch — which mints a new game id — shows it again. Storage failures
 * (private mode, quota) degrade to "show it this session", never to a crash.
 *
 * Chrome is the EXISTING commander level-up modal shell
 * (`.commanderLevelUpBackdrop` / `Modal` / `Banner` / `Scroll` / `Done`) — no new
 * CSS, so it inherits that overlay's documented z-index slot (236), its scroll
 * region and its phone-mode sizing. jsdom cannot compute CSS, so only the DOM
 * contract below is pinned by test; the look is a real-browser concern.
 */

import { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { commanderGradesOf, commandersModuleEnabled, COMMANDER_SORT_SPEED_GRADE } from "@/engine";
import type { GameState, PlayerId } from "@/engine/state";

const STORAGE_KEY = "binh-commander-intro";
const CHANGE_EVENT = "binh-commander-intro-change";

function readSeen(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** Whether this browser has already shown the commander intro for `gameId`. */
export function commanderIntroSeen(gameId: string): boolean {
  return readSeen().includes(gameId);
}

/** Mark `gameId` shown (bounded to the newest 20 games so the key cannot grow forever). */
export function markCommanderIntroSeen(gameId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const next = [...readSeen().filter((entry) => entry !== gameId), gameId].slice(-20);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — the popup simply re-appears next mount.
  }
  // Same-tab sync (the storage event only fires in OTHER tabs), mirroring the
  // `binh-ui-mode` / helper-coach preference pattern.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribeSeen(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * True when this viewer should be shown the intro: the Commanders module is on
 * and the viewer holds a seat that actually owns a commander (an observer, and a
 * seat without one, get nothing).
 */
export function commanderIntroApplies(state: GameState, viewerPlayerId: PlayerId | null | undefined): boolean {
  if (!viewerPlayerId || !commandersModuleEnabled(state)) {
    return false;
  }
  return Boolean(state.players[viewerPlayerId]?.commander);
}

export function CommanderIntroOverlay({
  state,
  viewerPlayerId
}: {
  state: GameState;
  viewerPlayerId: PlayerId | null | undefined;
}) {
  const applies = commanderIntroApplies(state, viewerPlayerId);
  const gameId = state.id;
  // localStorage is a client-only read, so the SERVER snapshot is "already
  // seen": the SSR/hydration frame emits nothing and the popup appears on the
  // next client render. `useSyncExternalStore` (not a setState-in-effect, which
  // `react-hooks/set-state-in-effect` rejects) also gives cross-tab sync for
  // free — dismissing in one tab closes it in the others.
  const seen = useSyncExternalStore(
    subscribeSeen,
    useCallback(() => commanderIntroSeen(gameId), [gameId]),
    () => true
  );

  if (!applies || seen || typeof document === "undefined") {
    return null;
  }

  const commander = viewerPlayerId ? state.players[viewerPlayerId]?.commander : undefined;
  const speedGrade = commander ? commanderGradesOf(commander).speed : 0;
  const unlocked = speedGrade >= COMMANDER_SORT_SPEED_GRADE;

  const dismiss = () => markCommanderIntroSeen(gameId);

  return createPortal(
    <div
      className="commanderLevelUpBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Commanders: how your commander is placed"
      onClick={dismiss}
    >
      <div className="commanderLevelUpModal" onClick={(event) => event.stopPropagation()}>
        <div className="commanderLevelUpBanner">⚔ COMMANDERS — PLACING YOUR COMMANDER ⚔</div>
        <div className="commanderLevelUpModalBody commanderLevelUpScroll">
          <p>
            You are playing with <strong>Commanders</strong>. Until you raise your commander&apos;s{" "}
            <strong>Speed</strong> grade, it is <strong>placed automatically</strong> at the start of every battle —
            your own back row first, then the front row. You cannot move it during setup.
          </p>
          <p>
            <strong>Raise the Speed grade just once</strong> (spend one commander stat point on Speed when your hero
            levels up) and from then on your commander is <strong>always arranged together with your units</strong>{" "}
            before every battle, like any other body in your formation.
          </p>
          <p>
            Abilities that already grant that arrangement — the Cove Sea Marshal&apos;s{" "}
            <strong>Vanguard Marshal</strong> specialty (shared by the Bulwark Rune Keeper&apos;s Ruler and Little
            Busters&apos; Kyousuke) and the <strong>Marshal&apos;s War Horn</strong> equipment — additionally give the
            commander <strong>+2 Speed for the whole combat</strong> when it starts the fight on your{" "}
            <strong>front line</strong>. The Speed-grade unlock alone does not grant that bonus.
          </p>
          <p>
            {unlocked
              ? `Your commander's Speed grade is ${speedGrade} — you already place it yourself.`
              : "Your commander's Speed grade is 0 — it is auto-placed for now."}
          </p>
        </div>
        <button type="button" className="commanderLevelUpDone" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}
