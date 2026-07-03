"use client";

import { useState } from "react";
import { Crown, Eye, Lock, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import type { RoomDirectoryEntry } from "@/lib/realtime";

/**
 * Lobby / room browser shown when the app is opened without a `?room=` link.
 * Purely presentational: it renders the room directory and the create / join /
 * close controls, and reports every intent back through callbacks so the page
 * owns all transport + navigation. (Mirrors the room rules: the Close control
 * only appears on rooms the server says this client `canClose`.)
 */
export function LobbyScreen({
  rooms,
  supported,
  loading,
  error,
  displayName,
  onRename,
  onRefresh,
  onJoin,
  onCreate,
  onClose,
  isAdmin = false
}: {
  rooms: RoomDirectoryEntry[];
  supported: boolean;
  loading: boolean;
  error: string | null;
  displayName: string;
  onRename: (name: string) => void;
  onRefresh: () => void;
  onJoin: (roomId: string) => void;
  /** Create a room; `hosted` picks Closed (host-controlled seats) vs Open (free seats). */
  onCreate: (name: string, hosted: boolean) => void;
  onClose: (roomId: string) => void;
  /** A signed-in platform admin: may delete ANY room (the server verifies the session). */
  isAdmin?: boolean;
}) {
  const [nameDraft, setNameDraft] = useState(displayName);
  const [newRoomName, setNewRoomName] = useState("");
  const [createHosted, setCreateHosted] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const createRoom = () => {
    onCreate(newRoomName.trim(), createHosted);
    setNewRoomName("");
  };
  const joinByCode = () => {
    const code = joinCode.trim();
    if (code) {
      onJoin(code);
    }
  };

  return (
    <main className="lobbyRoot">
      <div className="lobbyCard">
        <header className="lobbyHeader">
          <h1>
            <Users aria-hidden="true" size={20} /> Multiplayer Lobby
          </h1>
          <button className="commandButton ghost" onClick={onRefresh} title="Refresh the room list" type="button">
            <RefreshCw aria-hidden="true" size={14} /> Refresh
          </button>
        </header>

        <div className="lobbyIdentity">
          <label htmlFor="lobbyName">Your name</label>
          <input
            id="lobbyName"
            maxLength={24}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Your name"
            value={nameDraft}
          />
          <button
            className="commandButton"
            disabled={nameDraft.trim().length === 0 || nameDraft.trim() === displayName}
            onClick={() => onRename(nameDraft.trim())}
            type="button"
          >
            Save
          </button>
        </div>

        <div className="lobbyActions">
          <div className="lobbyCreate">
            <input
              aria-label="New room name"
              maxLength={40}
              onChange={(event) => setNewRoomName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && createRoom()}
              placeholder="New room name (optional)"
              value={newRoomName}
            />
            <button className="commandButton primary" onClick={createRoom} type="button">
              <Plus aria-hidden="true" size={14} /> Create room
            </button>
          </div>

          <div className="lobbyCreateMode" role="radiogroup" aria-label="Table type">
            <button
              aria-checked={!createHosted}
              className={`lobbyModeOption ${!createHosted ? "active" : ""}`}
              onClick={() => setCreateHosted(false)}
              role="radio"
              type="button"
            >
              <Eye aria-hidden="true" size={14} />
              <span className="lobbyModeName">Open table</span>
              <span className="lobbyModeHint">Anyone can pick any seat</span>
            </button>
            <button
              aria-checked={createHosted}
              className={`lobbyModeOption ${createHosted ? "active" : ""}`}
              onClick={() => setCreateHosted(true)}
              role="radio"
              type="button"
            >
              <Lock aria-hidden="true" size={14} />
              <span className="lobbyModeName">Closed table</span>
              <span className="lobbyModeHint">You host — one player per seat</span>
            </button>
          </div>
          <div className="lobbyJoinCode">
            <input
              aria-label="Room code"
              onChange={(event) => setJoinCode(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && joinByCode()}
              placeholder="Join by room code…"
              value={joinCode}
            />
            <button className="commandButton" disabled={joinCode.trim().length === 0} onClick={joinByCode} type="button">
              Join
            </button>
          </div>
        </div>

        {error ? <p className="lobbyError">{error}</p> : null}

        {!supported ? (
          <p className="lobbyNote">
            Room browsing isn&apos;t available on the edge (PartyKit) backend. Create a room or join by code / shared
            link above — everyone who opens the same link lands in the same room.
          </p>
        ) : rooms.length === 0 ? (
          <p className="lobbyNote">{loading ? "Loading rooms…" : "No rooms yet — create one above to get started."}</p>
        ) : (
          <ul className="lobbyRooms" aria-label="Open rooms">
            {rooms.map((room) => (
              <li className="lobbyRoom" key={room.roomId}>
                <button className="lobbyRoomMain" onClick={() => onJoin(room.roomId)} type="button">
                  <span className="lobbyRoomName">
                    {room.hosted ? (
                      <Lock aria-hidden="true" size={13} className="lobbyRoomLock" />
                    ) : (
                      <Eye aria-hidden="true" size={13} className="lobbyRoomOpen" />
                    )}
                    {room.name}
                  </span>
                  <span className="lobbyRoomMeta">
                    <span className="lobbyRoomCount" title="Members in the room">
                      <Users aria-hidden="true" size={12} /> {room.memberCount}
                      {room.seatedCount > 0 ? ` (${room.seatedCount} seated)` : ""}
                    </span>
                    <span className={`lobbyRoomStatus ${room.inProgress ? "playing" : "setup"}`}>
                      {room.inProgress ? "In progress" : "Setting up"}
                    </span>
                    {room.hostName ? (
                      <span className="lobbyRoomHost" title="Host">
                        <Crown aria-hidden="true" size={12} /> {room.hostName}
                      </span>
                    ) : room.createdByName ? (
                      <span className="lobbyRoomHost">by {room.createdByName}</span>
                    ) : null}
                  </span>
                </button>
                <div className="lobbyRoomButtons">
                  <button className="commandButton" onClick={() => onJoin(room.roomId)} type="button">
                    {room.inProgress ? "Watch / play" : "Join"}
                  </button>
                  {room.canClose || isAdmin ? (
                    <button
                      aria-label={`${room.canClose ? "Close" : "Admin: delete"} ${room.name}`}
                      className="iconButton danger"
                      onClick={() => onClose(room.roomId)}
                      title={room.canClose ? "Close this room for everyone" : "Admin: delete this room"}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
