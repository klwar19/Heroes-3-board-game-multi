"use client";

import { useState } from "react";
import { Crown, Eye, Lock, Medal, Plus, RefreshCw, Search, Swords, Trash2, Users } from "lucide-react";
import { authEnabled } from "@/lib/auth-mode";
import type { PresenceEntry } from "@/lib/lobby-presence-client";
import type { RoomDirectoryEntry } from "@/lib/realtime";

/** Show the room filter once the list is long enough for scanning to hurt. */
const ROOM_FILTER_MIN_ROOMS = 6;

/** Case-insensitive match on the room's name, host, creator, or any member. */
function roomMatchesFilter(room: RoomDirectoryEntry, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [
    room.name,
    room.hostName ?? "",
    room.createdByName ?? "",
    ...(room.members ?? []).map((member) => member.name)
  ].some((field) => field.toLowerCase().includes(needle));
}

/**
 * Members of this room who are ACTUALLY online right now (presence heartbeat),
 * keyed by lowercase name. Presence is short-TTL (generous enough to absorb
 * background-tab timer throttling, so nobody blinks off just for alt-tabbing),
 * so a seated player whose tab DIED still drops off within a couple of minutes
 * even though the room roster keeps listing them; a clean close drops at once
 * via the leave beacon.
 */
function onlineNamesInRoom(roomId: string, players: PresenceEntry[] | undefined): Set<string> {
  const names = new Set<string>();
  if (!players) {
    return names;
  }
  for (const player of players) {
    if (player.roomId === roomId && player.name) {
      names.add(player.name.trim().toLowerCase());
    }
  }
  return names;
}

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
  isAdmin = false,
  /** Live presence board — used to mark which roster names are actually online. */
  onlinePlayers,
  title = "Multiplayer Lobby",
  createLabel = "Create room",
  emptyHint = "No rooms yet — create one above to get started."
}: {
  rooms: RoomDirectoryEntry[];
  supported: boolean;
  loading: boolean;
  error: string | null;
  displayName: string;
  onRename: (name: string) => void;
  onRefresh: () => void;
  onJoin: (roomId: string) => void;
  /**
   * Create a room; `hosted` picks Closed (host-controlled seats) vs Open (free
   * seats), `ranked` picks Ranked (counts MMR) vs Normal (casual, no MMR).
   */
  onCreate: (name: string, hosted: boolean, ranked: boolean) => void;
  onClose: (roomId: string) => void;
  /** A signed-in platform admin: may delete ANY room (the server verifies the session). */
  isAdmin?: boolean;
  onlinePlayers?: PresenceEntry[];
  /** Heading (default the multiplayer lobby; the battle-test arena reuses this). */
  title?: string;
  /** Label on the create button ("Create room" / "Create arena"). */
  createLabel?: string;
  /** Empty-state hint shown when the directory has no rooms. */
  emptyHint?: string;
}) {
  const showAuthLabels = authEnabled();
  const [nameDraft, setNameDraft] = useState(displayName);
  const [newRoomName, setNewRoomName] = useState("");
  const [createHosted, setCreateHosted] = useState(false);
  // Default Normal (casual): a game only counts toward MMR when explicitly Ranked.
  // Ranked ALWAYS forces a Closed table — open tables store no seats, so the
  // ladder cannot attribute a win/loss (detectFinishedMatch would drop them).
  const [createRanked, setCreateRanked] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  const showFilter = rooms.length >= ROOM_FILTER_MIN_ROOMS;
  const visibleRooms = showFilter ? rooms.filter((room) => roomMatchesFilter(room, roomFilter)) : rooms;

  const createRoom = () => {
    // Ranked ⇒ closed (hosted), always — seat identity is required for W/L.
    const hosted = createRanked ? true : createHosted;
    onCreate(newRoomName.trim(), hosted, createRanked);
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
            <Users aria-hidden="true" size={20} /> {title}
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
              <Plus aria-hidden="true" size={14} /> {createLabel}
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

          <div className="lobbyCreateMode" role="radiogroup" aria-label="Match type">
            <button
              aria-checked={!createRanked}
              className={`lobbyModeOption ${!createRanked ? "active" : ""}`}
              onClick={() => setCreateRanked(false)}
              role="radio"
              type="button"
            >
              <Swords aria-hidden="true" size={14} />
              <span className="lobbyModeName">Normal game</span>
              <span className="lobbyModeHint">Casual — does not count MMR</span>
            </button>
            <button
              aria-checked={createRanked}
              className={`lobbyModeOption ${createRanked ? "active" : ""}`}
              onClick={() => {
                setCreateRanked(true);
                setCreateHosted(true); // Ranked needs closed seats for the ladder.
              }}
              role="radio"
              type="button"
            >
              <Medal aria-hidden="true" size={14} />
              <span className="lobbyModeName">Ranked game</span>
              <span className="lobbyModeHint">Counts MMR · closed table</span>
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

        {supported && showFilter ? (
          <div className="lobbyFilter">
            <Search aria-hidden="true" size={14} />
            <input
              aria-label="Filter rooms"
              onChange={(event) => setRoomFilter(event.target.value)}
              placeholder="Filter by room, host, or creator…"
              value={roomFilter}
            />
            <span className="lobbyFilterCount">
              {visibleRooms.length} / {rooms.length}
            </span>
          </div>
        ) : null}

        {!supported ? (
          <p className="lobbyNote">
            Room browsing isn&apos;t available on the edge (PartyKit) backend. Create a room or join by code / shared
            link above — everyone who opens the same link lands in the same room.
          </p>
        ) : rooms.length === 0 ? (
          <p className="lobbyNote">{loading ? "Loading rooms…" : emptyHint}</p>
        ) : visibleRooms.length === 0 ? (
          <p className="lobbyNote">No rooms match &ldquo;{roomFilter.trim()}&rdquo; — clear the filter to see all {rooms.length}.</p>
        ) : (
          <ul className="lobbyRooms" aria-label="Open rooms">
            {visibleRooms.map((room) => {
              const liveNames = onlineNamesInRoom(room.roomId, onlinePlayers);
              const liveCount = (room.members ?? []).filter((m) => liveNames.has(m.name.trim().toLowerCase())).length;
              return (
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
                    <span
                      className="lobbyRoomCount"
                      title={
                        onlinePlayers
                          ? `${liveCount} connected now · ${room.memberCount} in roster` +
                            (room.seatedCount > 0 ? ` · ${room.seatedCount} seated` : "")
                          : "Members in the room roster"
                      }
                    >
                      <Users aria-hidden="true" size={12} />{" "}
                      {onlinePlayers
                        ? `${liveCount} online${room.memberCount > liveCount ? ` / ${room.memberCount}` : ""}`
                        : room.memberCount}
                      {room.seatedCount > 0 ? ` (${room.seatedCount} seated)` : ""}
                    </span>
                    <span className={`lobbyRoomStatus ${room.inProgress ? "playing" : "setup"}`}>
                      {room.inProgress ? "Game on" : "Setting up"}
                    </span>
                    <span
                      className={`lobbyRoomRanked ${room.ranked ? "ranked" : "casual"}`}
                      title={room.ranked ? "Ranked game — counts MMR" : "Normal game — does not count MMR"}
                    >
                      {room.ranked ? (
                        <>
                          <Medal aria-hidden="true" size={12} /> Ranked
                        </>
                      ) : (
                        <>
                          <Swords aria-hidden="true" size={12} /> Normal
                        </>
                      )}
                    </span>
                    {room.locked ? (
                      <span
                        className="lobbyRoomLocked"
                        title="Password-protected — you will be asked for the password to join"
                      >
                        <Lock aria-hidden="true" size={12} /> Password
                      </span>
                    ) : null}
                    {room.hostName ? (
                      <span className="lobbyRoomHost" title="Host">
                        <Crown aria-hidden="true" size={12} /> {room.hostName}
                      </span>
                    ) : room.createdByName ? (
                      <span className="lobbyRoomHost">by {room.createdByName}</span>
                    ) : null}
                  </span>
                  {(room.members ?? []).length > 0 ? (
                    // Who is inside: host first (crown), registered players by
                    // nickname, guests honestly labeled only when accounts are on.
                    // A green/grey mark shows who is actually online right now.
                    <span className="lobbyRoomPeople" aria-label="Players in this room">
                      {(room.members ?? []).map((member, index) => {
                        const isGuest = showAuthLabels && member.guest;
                        const isLive = liveNames.has(member.name.trim().toLowerCase());
                        const statusBit = onlinePlayers
                          ? isLive
                            ? " · connected"
                            : " · away (not connected)"
                          : "";
                        return (
                        <span
                          className={`lobbyRoomPerson${isGuest ? " guest" : ""}${member.seated ? "" : " observer"}${
                            onlinePlayers ? (isLive ? " live" : " away") : ""
                          }`}
                          key={`${member.name}-${index}`}
                          title={
                            (member.host ? "Host — " : "") +
                            (showAuthLabels
                              ? member.guest
                                ? "guest (no account)"
                                : "verified account"
                              : "player") +
                            (member.seated ? "" : ", observer") +
                            statusBit
                          }
                        >
                          {onlinePlayers ? (
                            <span
                              className={`lobbyRoomLiveDot${isLive ? " on" : ""}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          {member.host ? <Crown aria-hidden="true" size={11} /> : null}
                          {isGuest ? `guest — ${member.name}` : member.name}
                        </span>
                        );
                      })}
                      {room.memberCount > (room.members ?? []).length ? (
                        <span className="lobbyRoomPerson observer">+{room.memberCount - (room.members ?? []).length} more</span>
                      ) : null}
                    </span>
                  ) : null}
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
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
