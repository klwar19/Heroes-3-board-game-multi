"use client";

/* eslint-disable @next/next/no-img-element */

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ANIME_FACTION_PENALTIES, animeFactionPenalty } from "@/data/anime/faction-penalties";
import { coreFactionDefinitions } from "@/data/factions/core";
import { townIconUrl } from "@/data/towns/boards";
import { assetUrl } from "@/lib/asset-url";
import type { GameEvent, GameState, PlayerId } from "@/engine/state";

const STORAGE_KEY = "binh-anime-faction-mechanics";
const CHANGE_EVENT = "binh-anime-faction-mechanics-change";
// Every town names its own penalty; the engine emits `${title} — …` for it, so the
// per-trigger notice matches an event to a town by its own title (single source of
// truth in the data table — never a shared "Otherworld Penalty" prefix).
const PENALTY_PREFIXES = ANIME_FACTION_PENALTIES.map((entry) => `${entry.title} —`);

function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function readSeenSnapshot(): string {
  return JSON.stringify(readSeen());
}

function markSeen(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...readSeen().filter((entry) => entry !== key), key].slice(-160)));
  } catch {
    // Private browsing/quota failure: dismiss for this render without crashing.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function viewerFactionId(state: GameState, viewerPlayerId: PlayerId | null | undefined): string | undefined {
  if (!viewerPlayerId || viewerPlayerId === "neutrals") return undefined;
  if (state.phase === "setup") {
    return state.setupLobby?.seats.find((seat) => seat.playerId === viewerPlayerId)?.factionId ?? undefined;
  }
  return state.players[viewerPlayerId]?.factionId;
}

export function animeMechanicsIntroKey(state: GameState, viewerPlayerId: PlayerId | null | undefined): string | null {
  const factionId = viewerFactionId(state, viewerPlayerId);
  if (!animeFactionPenalty(factionId)) return null;
  return state.phase === "setup"
    ? `pick:${state.id}:${factionId}`
    : `start:${state.id}:${viewerPlayerId}:${factionId}`;
}

function isPenaltyEvent(event: GameEvent, viewerPlayerId: PlayerId): boolean {
  return event.type === "EVENT_NOTE" &&
    event.playerId === viewerPlayerId &&
    PENALTY_PREFIXES.some((prefix) => event.message.startsWith(prefix));
}

/**
 * Pure-presentation warning system: a full mechanic table appears on faction
 * selection and again when the game starts; later engine EVENT_NOTE penalties
 * become one-click affected-player notices. It never blocks engine/AI progress.
 */
export function AnimeFactionMechanicsOverlay({
  state,
  viewerPlayerId
}: {
  state: GameState;
  viewerPlayerId: PlayerId | null | undefined;
}) {
  const seenSnapshot = useSyncExternalStore(subscribe, readSeenSnapshot, () => "[]");
  const seen = JSON.parse(seenSnapshot) as string[];
  if (!viewerPlayerId || viewerPlayerId === "neutrals" || typeof document === "undefined") return null;

  const introKey = animeMechanicsIntroKey(state, viewerPlayerId);
  const selectedFactionId = viewerFactionId(state, viewerPlayerId);
  const penaltyEvent = [...state.eventLog]
    .reverse()
    .find((event) => isPenaltyEvent(event, viewerPlayerId) && !seen.includes(`event:${state.id}:${event.id}`));

  if (penaltyEvent && penaltyEvent.type === "EVENT_NOTE") {
    const eventKey = `event:${state.id}:${penaltyEvent.id}`;
    const definition = animeFactionPenalty(state.players[viewerPlayerId]?.factionId);
    const faction = definition ? coreFactionDefinitions[definition.factionId] : undefined;
    return createPortal(
      <div className="animePenaltyBackdrop" role="dialog" aria-modal="true" aria-label={definition?.title ?? "Faction penalty"}>
        <div className="animePenaltyNotice">
          {definition?.artImage ? (
            <div className="animeNoticeArt">
              <img alt="" src={assetUrl(definition.artImage)} />
            </div>
          ) : null}
          <header>
            {definition ? <img alt="" src={assetUrl(townIconUrl(definition.factionId))} /> : null}
            <div><small>FACTION PENALTY</small><h2>{definition?.title ?? faction?.name ?? "Penalty"}</h2></div>
          </header>
          <p>{penaltyEvent.message}</p>
          <button type="button" onClick={() => markSeen(eventKey)}>Understood</button>
        </div>
      </div>,
      document.body
    );
  }

  if (!introKey || seen.includes(introKey)) return null;
  const selected = animeFactionPenalty(selectedFactionId);
  if (!selected) return null;
  const faction = coreFactionDefinitions[selected.factionId];
  const dismiss = () => markSeen(introKey);
  const kindLabel = selected.register === "wuxia" ? "CULTIVATION SECT" : "OTHERWORLD TOWN";

  // Per-town briefing: only the VIEWER's own town, explaining its signature
  // mechanic and its own themed penalty — never the whole roster grouped.
  return createPortal(
    <div
      className="animePenaltyBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${faction?.name ?? "Town"} — how your town plays`}
    >
      <div
        className="animeTownBriefing"
        data-register={selected.register}
      >
        <div className="animeNoticeArt">
          <img alt="" src={assetUrl(selected.artImage)} />
        </div>
        <header className="animeTownBriefingHead">
          <img alt="" src={assetUrl(townIconUrl(selected.factionId))} />
          <div>
            <small>{kindLabel}</small>
            <h2>{faction?.name ?? selected.factionId}</h2>
          </div>
        </header>
        <section className="animeTownBriefingCard mechanic">
          <span className="animeTownBriefingTag good">SIGNATURE</span>
          <h3>{selected.mechanicTitle}</h3>
          <p>{selected.mechanicDetail}</p>
        </section>
        <section className="animeTownBriefingCard penalty">
          <span className="animeTownBriefingTag warn">
            {selected.timing === "resource-round"
              ? "EACH RESOURCE ROUND"
              : selected.timing === "astrologers-round"
                ? "EACH ASTROLOGERS ROUND"
                : selected.timing === "alternating-rounds"
                  ? "RESOURCE + ASTROLOGERS ROUNDS"
                  : "EACH COMBAT"}
          </span>
          <h3>{selected.title}</h3>
          <p><strong>{selected.short}.</strong> {selected.detail}</p>
        </section>
        <button type="button" className="animeMechanicsDone" onClick={dismiss}>Got it</button>
      </div>
    </div>,
    document.body
  );
}
