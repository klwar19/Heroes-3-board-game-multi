/**
 * Campaign progress + room binding store (Anime mod §12 / §3.3).
 *
 * Pure presentation state, per BROWSER, in localStorage — it NEVER enters
 * GameState and is never sent to the server (mirrors `ui-mode-preference` /
 * `story-language`: SSR-safe reads, try/catch around every storage call). Two
 * key namespaces:
 *
 *  - **Per-campaign completion** — `localStorage["binh-campaign:<campaignId>"]`
 *    holds the completed chapter ids. Drives the unlock chain (ch-1 always;
 *    chapter N unlocks once chapter N−1 is completed).
 *  - **Per-room binding** — `localStorage["binh-campaign-room:<roomId>"]` maps a
 *    single-player room to the `{ campaignId, chapterId }` it was launched for,
 *    plus the once-per-room `introShown` / `outcomeShown` markers so a reload
 *    never re-pops a scene. A room with NO binding (every normal table) triggers
 *    nothing — the absence of this record is the off switch.
 */

import type { Campaign } from "@/data/story/campaigns";

const COMPLETION_PREFIX = "binh-campaign:";
const ROOM_PREFIX = "binh-campaign-room:";

export type CampaignProgress = { completed: string[] };

export type CampaignRoomBinding = {
  campaignId: string;
  chapterId: string;
  /** The chapter's onStart scene has been popped for this room. */
  introShown?: boolean;
  /** The chapter's onVictory/onDefeat scene has been popped for this room. */
  outcomeShown?: boolean;
};

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — the store degrades to in-session only.
  }
}

// -----------------------------------------------------------------------------
// Per-campaign completion + unlock chain.
// -----------------------------------------------------------------------------

/** Completed chapter ids for a campaign (SSR-safe, defaults to none). */
export function getCampaignProgress(campaignId: string): CampaignProgress {
  const stored = readJson<CampaignProgress>(`${COMPLETION_PREFIX}${campaignId}`);
  if (!stored || !Array.isArray(stored.completed)) {
    return { completed: [] };
  }
  return { completed: stored.completed.filter((id): id is string => typeof id === "string") };
}

export function isChapterCompleted(campaignId: string, chapterId: string): boolean {
  return getCampaignProgress(campaignId).completed.includes(chapterId);
}

/** Record a chapter as completed (idempotent). */
export function markChapterCompleted(campaignId: string, chapterId: string): void {
  const { completed } = getCampaignProgress(campaignId);
  if (completed.includes(chapterId)) {
    return;
  }
  writeJson(`${COMPLETION_PREFIX}${campaignId}`, { completed: [...completed, chapterId] });
}

/**
 * Chapter 1 (index 0) is always unlocked; chapter N unlocks once chapter N−1 is
 * completed. A chapter id not in the campaign is never unlocked. Unlocking is
 * independent of `playable` — a completed ch-1 UNLOCKS an "in development" ch-2.
 */
export function isChapterUnlocked(campaign: Campaign, chapterId: string): boolean {
  const index = campaign.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) {
    return false;
  }
  if (index === 0) {
    return true;
  }
  return isChapterCompleted(campaign.id, campaign.chapters[index - 1].id);
}

// -----------------------------------------------------------------------------
// Per-room campaign binding + one-per-room scene markers.
// -----------------------------------------------------------------------------

/** Bind a single-player room to a campaign chapter (fresh markers). */
export function bindCampaignRoom(
  roomId: string,
  binding: { campaignId: string; chapterId: string }
): void {
  writeJson(`${ROOM_PREFIX}${roomId}`, {
    campaignId: binding.campaignId,
    chapterId: binding.chapterId
  } satisfies CampaignRoomBinding);
}

/** The campaign binding for a room, or null when the room is not a campaign room. */
export function getCampaignBinding(roomId: string): CampaignRoomBinding | null {
  const stored = readJson<CampaignRoomBinding>(`${ROOM_PREFIX}${roomId}`);
  if (!stored || typeof stored.campaignId !== "string" || typeof stored.chapterId !== "string") {
    return null;
  }
  return stored;
}

function updateBinding(roomId: string, patch: Partial<CampaignRoomBinding>): void {
  const current = getCampaignBinding(roomId);
  if (!current) {
    return;
  }
  writeJson(`${ROOM_PREFIX}${roomId}`, { ...current, ...patch });
}

export function markCampaignIntroShown(roomId: string): void {
  updateBinding(roomId, { introShown: true });
}

export function isCampaignIntroShown(roomId: string): boolean {
  return getCampaignBinding(roomId)?.introShown === true;
}

export function markCampaignOutcomeShown(roomId: string): void {
  updateBinding(roomId, { outcomeShown: true });
}

export function isCampaignOutcomeShown(roomId: string): boolean {
  return getCampaignBinding(roomId)?.outcomeShown === true;
}

/** Test helpers — the storage key prefixes (one source of truth). */
export const CAMPAIGN_COMPLETION_KEY_PREFIX = COMPLETION_PREFIX;
export const CAMPAIGN_ROOM_KEY_PREFIX = ROOM_PREFIX;
