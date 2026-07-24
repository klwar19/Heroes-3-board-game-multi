"use client";

import { FolderOpen, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GameState } from "@/engine";
import { saveCachedRoom } from "@/lib/room-cache";
import {
  deleteSavedSinglePlayerGame,
  loadSavedSinglePlayerGames,
  saveSinglePlayerGame,
  type SavedSinglePlayerGame
} from "@/lib/single-player-saves";

function saveDate(savedAt: number): string {
  return new Date(savedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function SinglePlayerSavePanel({
  roomId,
  roomVersion,
  state,
  compact = false
}: {
  roomId?: string | null;
  roomVersion?: number;
  state?: GameState | null;
  compact?: boolean;
}) {
  const [saves, setSaves] = useState<SavedSinglePlayerGame[]>([]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => setSaves(loadSavedSinglePlayerGames()), []);
  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const saveCurrent = () => {
    if (!roomId || !state || state.sessionMode !== "single-player") {
      return;
    }
    // The room cache already mirrors every snapshot; save explicitly as well
    // so this named slot remains recoverable if the server room is recycled.
    saveCachedRoom(roomId, roomVersion ?? 0, state);
    const existing = saves.find((save) => save.roomId === roomId);
    const saved = saveSinglePlayerGame(name, roomId, state.round, roomVersion ?? 0, existing?.id);
    setName("");
    setNotice(`Saved “${saved.name}”.`);
    refresh();
  };

  const loadGame = (save: SavedSinglePlayerGame) => {
    window.location.assign(`/?room=${encodeURIComponent(save.roomId)}`);
  };

  return (
    <section className={`singlePlayerSavePanel${compact ? " compact" : ""}`} aria-label="Single-player saves">
      <header className="singlePlayerSaveHead">
        <span>
          <Save aria-hidden="true" size={14} />
          <strong>Single-player saves</strong>
        </span>
        {!compact ? <small>Private to this player</small> : null}
      </header>
      {roomId && state?.sessionMode === "single-player" ? (
        <div className="singlePlayerSaveCreate">
          <input
            aria-label="Save name"
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                saveCurrent();
              }
            }}
            placeholder="Save name (optional)"
            value={name}
          />
          <button onClick={saveCurrent} type="button">
            <Save aria-hidden="true" size={12} /> Save game
          </button>
        </div>
      ) : null}
      {notice ? <small className="singlePlayerSaveNotice" role="status">{notice}</small> : null}
      {saves.length === 0 ? (
        <small className="singlePlayerSaveEmpty">No saved games yet.</small>
      ) : (
        <ul className="singlePlayerSaveList">
          {saves.map((save) => (
            <li key={save.id}>
              <span>
                <strong>{save.name}</strong>
                <small>Round {save.round} · {saveDate(save.savedAt)}</small>
              </span>
              <button onClick={() => loadGame(save)} title={`Load ${save.name}`} type="button">
                <FolderOpen aria-hidden="true" size={12} /> Load
              </button>
              <button
                aria-label={`Delete ${save.name}`}
                className="ghost"
                onClick={() => {
                  deleteSavedSinglePlayerGame(save.id);
                  refresh();
                }}
                title="Delete save slot"
                type="button"
              >
                <Trash2 aria-hidden="true" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <small className="singlePlayerSaveHint">
        Loading returns to the latest saved state of that private table.
      </small>
    </section>
  );
}
