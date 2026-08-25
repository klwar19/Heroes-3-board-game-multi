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
const PENALTY_PREFIXES = ["Otherworld Penalty —", "School Contribution Fund —", "Fleet Maintenance —"];

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
        <div
          className={`animePenaltyNotice${definition?.artImage ? " withBackground" : ""}`}
          style={definition?.artImage ? { backgroundImage: `linear-gradient(90deg, rgba(8,10,16,.9), rgba(8,10,16,.58)), url(${assetUrl(definition.artImage)})` } : undefined}
        >
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
  const dismiss = () => markSeen(introKey);

  return createPortal(
    <div className="animePenaltyBackdrop" role="dialog" aria-modal="true" aria-label="Anime and cultivation faction penalties">
      <div className="animeMechanicsModal">
        <header className="animeMechanicsHead">
          <div><small>OTHERWORLD RULES</small><h2>Anime &amp; Cultivation Town Penalties</h2></div>
          {selected ? <strong>{coreFactionDefinitions[selected.factionId]?.name}: {selected.short}</strong> : null}
        </header>
        <p className="animeMechanicsLead">These penalties are automatic. Resource losses happen after income and never create debt.</p>
        <div className="animeMechanicsTable" role="table" aria-label="Faction penalty table">
          {ANIME_FACTION_PENALTIES.map((entry) => {
            const faction = coreFactionDefinitions[entry.factionId];
            const active = entry.factionId === selectedFactionId;
            return (
              <div className={`animeMechanicsRow${active ? " selected" : ""}`} key={entry.factionId} role="row">
                <img alt="" src={assetUrl(townIconUrl(entry.factionId))} />
                <div className="animeMechanicsTown"><strong>{faction?.name ?? entry.factionId}</strong><small>{entry.title}</small></div>
                <div className="animeMechanicsRule"><strong>{entry.short}</strong><small>{entry.detail}</small></div>
                <span className={`animeMechanicsTiming ${entry.timing}`}>{entry.timing === "resource-round" ? "RESOURCE ROUND" : "COMBAT START"}</span>
              </div>
            );
          })}
        </div>
        <button type="button" className="animeMechanicsDone" onClick={dismiss}>I understand</button>
      </div>
    </div>,
    document.body
  );
}
