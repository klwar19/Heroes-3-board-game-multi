"use client";

import { FolderOpen, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GameState } from "@/engine";
import {
  clearPendingSinglePlayerLoad,
  deleteSavedSinglePlayerGame,
  loadSavedSinglePlayerGames,
  loadSavedSinglePlayerGameState,
  saveMatchesEngine,
  saveSinglePlayerGame,
  setPendingSinglePlayerLoad,
  type SavedSinglePlayerGame
} from "@/lib/single-player-saves";

function saveDate(savedAt: number): string {
  return new Date(savedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

/**
 * Single-player save slots. SAVE (in-game only) asks the server for the room's
 * RAW state — the frames the client holds are seat-redacted and cannot restore
 * a game — and stores it as a named slot in this browser (nothing per-save is
 * kept on the server). LOAD replaces that room's live game with the chosen
 * snapshot via the server's owner-gated whole-state swap; distinct names are
 * distinct save points, reusing a name overwrites its slot. From the
 * single-player menu (no live connection) Load records a pending marker and
 * navigates to the room, where the table page applies it once connected.
 */
export function SinglePlayerSavePanel({
  roomId,
  state,
  compact = false,
  onFetchSaveState,
  onLoadSave
}: {
  roomId?: string | null;
  state?: GameState | null;
  compact?: boolean;
  /** In-game: fetch the room's RAW state from the server for a local save. */
  onFetchSaveState?: () => Promise<{ state: GameState; version: number }>;
  /** In-game: push a saved state back into THIS room (whole-state swap). */
  onLoadSave?: (state: GameState) => Promise<void>;
}) {
  const [saves, setSaves] = useState<SavedSinglePlayerGame[]>([]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);

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

  const canSaveHere = Boolean(roomId && state?.sessionMode === "single-player" && onFetchSaveState);

  const saveCurrent = async () => {
    if (!roomId || !onFetchSaveState || busy) {
      return;
    }
    setBusy(true);
    try {
      // The server returns the UNREDACTED state (owner-only) — the only state
      // that can faithfully restore the game later.
      const raw = await onFetchSaveState();
      const result = saveSinglePlayerGame(name, roomId, raw.state);
      if (result.ok) {
        setName("");
        setNotice(`Saved “${result.save.name}” (round ${result.save.round}).`);
      } else {
        setNotice(result.reason);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read the game for saving.");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const loadGame = async (save: SavedSinglePlayerGame) => {
    if (busy) {
      return;
    }
    const versionNote = saveMatchesEngine(save)
      ? ""
      : "\n\nThis save was written by an older game version. It will usually still load; if it fails, the current game is unchanged.";
    if (
      !window.confirm(
        `Load “${save.name}” (round ${save.round})? The game in that room is replaced by this save.${versionNote}`
      )
    ) {
      return;
    }
    const savedState = loadSavedSinglePlayerGameState(save.id);
    if (!savedState) {
      setNotice("That save slot's data is missing from this browser — delete it.");
      return;
    }
    // Same room + live connection: apply directly. Otherwise (the menu page,
    // or a save of another sp room) hand over via the pending-load marker.
    if (roomId === save.roomId && onLoadSave) {
      setBusy(true);
      try {
        await onLoadSave(savedState);
        // Manual fallback after an automatic menu load failed: consume the
        // marker only now that this direct whole-state load actually committed.
        clearPendingSinglePlayerLoad(save.id, save.roomId);
        setNotice(`Loaded “${save.name}”.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not load the saved game.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!setPendingSinglePlayerLoad(save.id, save.roomId)) {
      setNotice("Could not prepare the load in browser storage. The current game was not changed.");
      return;
    }
    window.location.assign(`/?room=${encodeURIComponent(save.roomId)}`);
  };

  return (
    <section
      className={`singlePlayerSavePanel${compact ? " compact" : ""}${compactOpen ? " open" : ""}`}
      aria-label="Single-player saves"
    >
      {compact ? (
        <button
          aria-expanded={compactOpen}
          className="singlePlayerSaveToggle"
          onClick={() => setCompactOpen((current) => !current)}
          title="Open save and load slots"
          type="button"
        >
          <Save aria-hidden="true" size={13} />
          <span>Saves</span>
          <b>{saves.length}</b>
        </button>
      ) : null}
      <header className="singlePlayerSaveHead">
        <span>
          <Save aria-hidden="true" size={14} />
          <strong>Single-player saves</strong>
        </span>
        {!compact ? <small>Stored in this browser — private to this player</small> : null}
      </header>
      {canSaveHere ? (
        <div className="singlePlayerSaveCreate">
          <input
            aria-label="Save name"
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void saveCurrent();
              }
            }}
            placeholder="Save name (same name overwrites)"
            value={name}
          />
          <button disabled={busy} onClick={() => void saveCurrent()} type="button">
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
                <small>
                  Round {save.round} · {saveDate(save.savedAt)}
                  {saveMatchesEngine(save) ? "" : " · older version"}
                </small>
              </span>
              <button disabled={busy} onClick={() => void loadGame(save)} title={`Load ${save.name}`} type="button">
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
        Each save is its own restore point — loading returns the game to exactly that moment.
      </small>
    </section>
  );
}
