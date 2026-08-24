"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  Crown,
  Eye,
  List,
  Lock,
  LogOut,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  UserX,
  Users
} from "lucide-react";
import {
  AFK_IDLE_MS,
  getSeatIdentity,
  idleMillis,
  isComputerPlayer,
  NEUTRAL_PLAYER_ID,
  roomDisplayName,
  seatPickSummary,
  type GameAction,
  type GameState,
  type RoomSeat
} from "@/engine";
import { authEnabled } from "@/lib/auth-mode";
import { pollTickAllowed } from "@/lib/hidden-tab-poll";
import { postLobbyChat } from "@/lib/lobby-chat-client";
import { sendLobbyInvite } from "@/lib/lobby-invites-client";
import { fetchPresence, type PresenceEntry } from "@/lib/lobby-presence-client";

/**
 * Room membership UI: shareable invite link, host controls (assign seats, kick,
 * transfer host, toggle hosted), and each member's seat. Mirrors the engine
 * rules in src/engine/room.ts — the buttons here only ever offer what the
 * engine will accept (host-only controls are hidden for non-hosts), and the
 * engine rejects anything that slips through regardless.
 */
export function RoomPanel({
  state,
  roomId,
  clientId,
  displayName,
  onAction,
  onCreateRoom,
  onRename,
  onCloseRoom,
  onBrowseRooms,
  compact = false
}: {
  state: GameState;
  roomId: string;
  clientId: string;
  displayName: string;
  onAction: (action: GameAction) => void;
  onCreateRoom?: () => void;
  onRename: (name: string) => void;
  /** Close (delete) this room for everyone — only offered when allowed. */
  onCloseRoom?: () => void;
  /** Leave this room and return to the lobby room browser. */
  onBrowseRooms?: () => void;
  /** In-game HUD: keep the closed trigger terse; the full manager still opens. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Seeded from the persisted name (already loaded by the time this panel
  // mounts); the user edits it freely and Save pushes it back up.
  const [nameDraft, setNameDraft] = useState(displayName);
  const [copied, setCopied] = useState(false);
  // Global online players (for inviting), fetched while the panel is open.
  const [online, setOnline] = useState<PresenceEntry[]>([]);
  // Whether the live-presence poll has returned at least once. Until it has, we
  // must assume the host is present (never offer host recovery on a cold panel).
  const [presenceLoaded, setPresenceLoaded] = useState(false);
  // Names we just pinged, to flip the button to "Invited" as feedback.
  const [invited, setInvited] = useState<Record<string, boolean>>({});

  const room = state.room ?? null;
  const members = room?.members ?? [];
  const hosted = Boolean(room?.hosted);
  const me = members.find((member) => member.clientId === clientId) ?? null;
  const isHost = Boolean(me?.isHost);
  const mySeat: RoomSeat = me?.seat ?? "observer";

  // Room name: anyone may set it on an open table; host-only when hosted.
  const [roomNameDraft, setRoomNameDraft] = useState(room?.name ?? "");
  const canRename = Boolean(me) && (!hosted || isHost);
  const currentRoomName = roomDisplayName(state, roomId);
  // Room join password: same authority as the name (open: any member; hosted:
  // host-only). The stored hash is redacted in views, so we only ever know
  // whether a password is SET — never its value.
  const [roomPasswordDraft, setRoomPasswordDraft] = useState("");
  const canSetPassword = canRename;
  const hasPassword = Boolean(room?.passwordHash);
  // `canClose` / `canReclaimHost` also depend on live presence, so they are
  // derived below once `liveInThisRoom` is built.

  const seatIds = state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID);
  // CO-OP (step 6): a COMPUTER seat holds no room member, but it is still in
  // `turnOrder`, so it appeared in both seat dropdowns as a nameless assignable
  // option the engine then refused (`assignSeat` never seats a computer). Label
  // it and disable the option — derived from `state.controllers` through
  // `isComputerPlayer`, never from the seat's name.
  const seatIsComputer = (seat: RoomSeat) => seat !== "observer" && isComputerPlayer(state, seat);
  const seatLabel = (seat: RoomSeat) =>
    seat === "observer"
      ? "Observer"
      : `${state.players[seat]?.name ?? seat}${seatIsComputer(seat) ? " (Computer)" : ""}`;
  // The mode is frozen on a STARTED game; while the lobby is open it lives on
  // the setup options (absent = clash in both places).
  const coopTable = state.gameMode === "coop" || state.setupLobby?.options.gameMode === "coop";

  const inviteLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;

  const copyLink = () => {
    if (!inviteLink) {
      return;
    }
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    try {
      void navigator.clipboard?.writeText(inviteLink).then(done, done);
    } catch {
      done();
    }
  };

  // While the panel is open, poll the global online list so the host can invite
  // specific players who are online elsewhere (in the lobby or another room).
  useEffect(() => {
    if (!open) {
      return;
    }
    let live = true;
    const load = () => {
      fetchPresence()
        .then((players) => {
          if (live) {
            setOnline(players);
            setPresenceLoaded(true);
          }
        })
        .catch(() => {
          /* transient — the next tick retries */
        });
    };
    load();
    // 10 s is fresh enough for an invite list; hidden tabs skip ticks (each
    // tick is a billed same-origin edge request on the production host).
    const id = window.setInterval(() => {
      if (!pollTickAllowed()) {
        return;
      }
      load();
    }, 10_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [open]);

  // Players online who are NOT already in this room (and not me) — the invite
  // candidates. Someone already here needs no invite.
  const inviteCandidates = online.filter(
    (player) => player.clientId !== clientId && player.roomId !== roomId
  );

  // Who is live in THIS room right now (presence heartbeat). Seated players can
  // stay on the roster after a disconnect; this is what tells "really here"
  // from "ghost / closed the tab".
  const liveInThisRoom = new Map(
    online
      .filter((player) => player.roomId === roomId)
      .flatMap((player) => {
        const keys: [string, PresenceEntry][] = [[player.clientId, player]];
        if (player.name) {
          keys.push([`name:${player.name.trim().toLowerCase()}`, player]);
        }
        return keys;
      })
  );

  // Host recovery (mirrors the engine RECLAIM_HOST rule + the server's
  // reset/close authority): a hosted room whose host holds NO live connection
  // is not owned by anyone reachable, so any member may take it over or delete
  // it. This unsticks the common guest case — a host whose per-tab clientId died
  // with their browser rejoins as a fresh member and would otherwise be locked
  // out of managing their OWN table. Until presence has loaded once we assume
  // the host is present, so a cold panel never offers recovery by mistake; the
  // engine/server re-check the live host and refuse if we guessed wrong.
  const hostClientId = room?.hostClientId ?? null;
  const hostIsLive =
    !presenceLoaded ||
    Boolean(hostClientId && (hostClientId === clientId || liveInThisRoom.has(hostClientId)));
  const hostAbsent = hosted && Boolean(me) && !isHost && Boolean(hostClientId) && !hostIsLive;
  // Closing mirrors the engine rule: the host on a hosted room, any member once
  // the host is gone, and anyone on an open table (no ownership to protect).
  const canClose = hosted ? isHost || hostAbsent : true;
  // "Take over host": offered to a member of a hosted room whose host is absent.
  const canReclaimHost = hostAbsent;

  // Invite = a POPUP on the invitee's client (Join room / Dismiss) plus a
  // lobby-chat ping with the join link as a fallback for anyone who missed the
  // modal. Best-effort; a failure just leaves the button as-is.
  const invitePlayer = (player: PresenceEntry) => {
    const from = displayName.trim() || "A player";
    const text = `🎲 ${player.name} — ${from} invites you to “${currentRoomName}”: ${inviteLink}`;
    const markInvited = () => setInvited((prev) => ({ ...prev, [player.clientId]: true }));
    void sendLobbyInvite({
      fromClientId: clientId,
      fromName: from,
      toClientId: player.clientId,
      roomId,
      roomName: currentRoomName
    })
      .then(markInvited)
      .catch(() => {
        /* popup delivery best-effort — chat ping still helps */
      });
    postLobbyChat({ clientId, name: from, text })
      .then(markInvited)
      .catch(() => {
        /* best-effort — the host can retry or copy the link instead */
      });
  };

  const showAuthLabels = authEnabled();
  const gameInProgress = state.phase !== "setup" || !state.setupLobby;
  // Wall-clock tick for the AFK badge (idleMillis compares against "now").
  // Kept in state — render must stay pure — and refreshed every 15s so a seat
  // crossing the AFK threshold shows up without any other prop changing.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const roleLabel = isHost
    ? "Host"
    : mySeat === "observer"
      ? "Observer"
      : `Seat ${seatLabel(mySeat)}`;

  return (
    <div className="roomPanel" aria-label="Room and seats">
      <button
        aria-expanded={open}
        className={`roomToggle ${open ? "open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title={compact ? `${roleLabel} · ${members.length} in room` : undefined}
        type="button"
      >
        <Users aria-hidden="true" size={13} />
        <span>Room</span>
        <span className="roomToggleMeta">
          {hosted ? (
            <Lock aria-hidden="true" size={11} />
          ) : (
            <Eye aria-hidden="true" size={11} />
          )}
          {isHost ? <Crown aria-hidden="true" size={11} /> : null}
          {compact ? members.length : `${roleLabel} · ${members.length} in room`}
        </span>
      </button>

      {open ? (
        <div className="roomBody">
          <div className="roomInvite">
            <input aria-label="Invite link" readOnly value={inviteLink} />
            <button className="commandButton" onClick={copyLink} title="Copy the invite link" type="button">
              {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
              <span>{copied ? "Copied" : "Copy link"}</span>
            </button>
            {onCreateRoom ? (
              <button
                className="commandButton ghost"
                onClick={onCreateRoom}
                title="Open a brand-new room with its own link"
                type="button"
              >
                New room
              </button>
            ) : null}
          </div>

          {inviteCandidates.length > 0 ? (
            <div className="roomInvitePlayers">
              <span className="roomInvitePlayersLabel">
                <UserPlus aria-hidden="true" size={12} /> Invite players online
              </span>
              <ul className="roomInvitePlayersList">
                {inviteCandidates.map((player) => (
                  <li className="roomInvitePlayer" key={player.clientId}>
                    <span className="roomInvitePlayerName">
                      {showAuthLabels && player.verified ? <BadgeCheck aria-hidden="true" size={11} /> : null}
                      {showAuthLabels && !player.verified ? `guest — ${player.name}` : player.name}
                      <small className="roomInvitePlayerWhere">
                        {player.roomId
                          ? `(in another room${
                              player.roomStatus === "playing"
                                ? ", game on"
                                : player.roomStatus === "setup"
                                  ? ", setting up"
                                  : ""
                            })`
                          : "(in the lobby)"}
                      </small>
                    </span>
                    <button
                      className="commandButton ghost"
                      disabled={Boolean(invited[player.clientId])}
                      onClick={() => invitePlayer(player)}
                      title={`Send ${player.name} a join popup for this room`}
                      type="button"
                    >
                      {invited[player.clientId] ? (
                        <>
                          <Check aria-hidden="true" size={12} /> Invited
                        </>
                      ) : (
                        <>
                          <UserPlus aria-hidden="true" size={12} /> Invite
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="roomTitleRow">
            <span className="roomTitleLabel">Room name</span>
            <input
              aria-label="Room name"
              disabled={!canRename}
              maxLength={40}
              onChange={(event) => setRoomNameDraft(event.target.value)}
              placeholder={currentRoomName}
              value={roomNameDraft}
            />
            <button
              className="commandButton"
              disabled={!canRename || roomNameDraft.trim() === (room?.name ?? "")}
              onClick={() => onAction({ type: "SET_ROOM_NAME", clientId, name: roomNameDraft.trim() })}
              type="button"
            >
              Save
            </button>
          </div>

          {canSetPassword ? (
            <div className="roomTitleRow">
              <span className="roomTitleLabel">
                {hasPassword ? (
                  <>
                    <Lock aria-hidden="true" size={12} /> Password
                  </>
                ) : (
                  "Password"
                )}
              </span>
              <input
                aria-label="Room password"
                autoComplete="off"
                maxLength={32}
                onChange={(event) => setRoomPasswordDraft(event.target.value)}
                placeholder={hasPassword ? "Password set — type to change" : "No password"}
                type="password"
                value={roomPasswordDraft}
              />
              <button
                className="commandButton"
                disabled={roomPasswordDraft.trim().length === 0}
                onClick={() => {
                  onAction({ type: "SET_ROOM_PASSWORD", clientId, password: roomPasswordDraft.trim() });
                  setRoomPasswordDraft("");
                }}
                type="button"
              >
                {hasPassword ? "Change" : "Set"}
              </button>
              {hasPassword ? (
                <button
                  className="commandButton"
                  onClick={() => {
                    onAction({ type: "SET_ROOM_PASSWORD", clientId, password: "" });
                    setRoomPasswordDraft("");
                  }}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ) : hasPassword ? (
            <div className="roomModeNote">
              <Lock aria-hidden="true" size={12} /> This room is password-protected.
            </div>
          ) : null}

          <div className="roomNameRow">
            <input
              aria-label="Your display name"
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

          <div className="roomModeRow">
            {!hosted ? (
              <>
                <span className="roomModeNote">
                  Open table — anyone may pick any seat (handy for solo testing).
                </span>
                <button
                  className="commandButton primary"
                  onClick={() => onAction({ type: "SET_ROOM_HOSTED", clientId, hosted: true })}
                  type="button"
                >
                  <Lock aria-hidden="true" size={13} /> Host this room
                </button>
              </>
            ) : (
              <>
                <span className="roomModeNote">
                  Hosted —{" "}
                  {isHost
                    ? "you are the host and can seat anyone; players may also take an open seat."
                    : "pick an open seat below, or ask the host to move you into a taken one."}
                </span>
                {isHost ? (
                  <button
                    className="commandButton"
                    onClick={() => onAction({ type: "SET_ROOM_HOSTED", clientId, hosted: false })}
                    type="button"
                  >
                    <Eye aria-hidden="true" size={13} /> Open the table
                  </button>
                ) : null}
                {/* Verified-account lock (Phase 2): only meaningful with accounts
                    on — a guest deployment has no verified identity to require. */}
                {isHost && authEnabled() ? (
                  <button
                    className="commandButton"
                    onClick={() =>
                      onAction({ type: "SET_ROOM_REQUIRE_AUTH", clientId, requireAuth: !room?.requireAuth })
                    }
                    type="button"
                    aria-pressed={Boolean(room?.requireAuth)}
                    title={
                      room?.requireAuth
                        ? "Guests are blocked from joining. Click to allow them."
                        : "Require a signed-in account to join this table."
                    }
                  >
                    <ShieldCheck aria-hidden="true" size={13} />{" "}
                    {room?.requireAuth ? "Accounts required — allow guests" : "Require verified accounts"}
                  </button>
                ) : null}
                {room?.requireAuth ? (
                  <span className="roomModeNote">This table is locked to verified accounts.</span>
                ) : null}
              </>
            )}
          </div>

          {/* CO-OP (step 6): a co-op game is NEVER match-reported (step 4 nulls
              it at `detectFinishedMatch` whatever `room.ranked` says), so this
              is the honest ranked surface — the room's own Ranked flag is a
              cosmetic leftover of the create-time choice at /play. */}
          {coopTable ? (
            <div className="roomModeNote">
              Co-op — humans vs the computer enemies. Unranked: this table never counts toward MMR.
            </div>
          ) : null}

          <p className="roomRosterStatus" aria-live="polite">
            {gameInProgress ? "Game on" : "Setting up"}
            {" · "}
            {members.length} in roster
            {online.length > 0
              ? ` · ${members.filter((m) => liveInThisRoom.has(m.clientId) || liveInThisRoom.has(`name:${m.name.trim().toLowerCase()}`)).length} connected now`
              : ""}
          </p>

          <ul className="roomMembers">
            {members.map((member) => {
              const self = member.clientId === clientId;
              // What this member is playing (town + hero), when they hold a seat.
              const seatIdentity = member.seat !== "observer" ? getSeatIdentity(state, member.seat) : null;
              const pick = seatIdentity ? seatPickSummary(seatIdentity) : null;
              const isGuest = showAuthLabels && !member.userId;
              const isVerified = showAuthLabels && Boolean(member.userId);
              // Connected = presence heartbeat in this room. Self always counts
              // as live while this panel is open. Without a presence poll yet
              // (empty list), only mark self — never flash everyone as away.
              const presenceKnown = online.length > 0;
              const isLive =
                self ||
                liveInThisRoom.has(member.clientId) ||
                liveInThisRoom.has(`name:${member.name.trim().toLowerCase()}`);
              const seated = member.seat !== "observer";
              const isAfk =
                gameInProgress &&
                seated &&
                idleMillis(state, member.seat, nowMs) >= AFK_IDLE_MS;
              const statusLabel = self
                ? isAfk
                  ? "AFK"
                  : "online"
                : !presenceKnown
                  ? null
                  : isLive
                    ? isAfk
                      ? "AFK"
                      : "online"
                    : "away";
              const showLiveDot = self || presenceKnown;
              return (
                <li
                  className={`roomMember${isGuest ? " guest" : ""}${
                    showLiveDot ? (isLive ? " live" : " away") : ""
                  }`}
                  key={member.clientId}
                >
                  <span className="roomMemberName">
                    {showLiveDot ? (
                      <span
                        className={`roomMemberLiveDot${isLive ? " on" : ""}${isAfk ? " afk" : ""}`}
                        title={statusLabel ?? undefined}
                        aria-hidden="true"
                      />
                    ) : null}
                    {member.isHost ? <Crown aria-hidden="true" size={12} className="hostCrown" /> : null}
                    {isVerified ? <BadgeCheck aria-hidden="true" size={12} className="roomMemberVerified" /> : null}
                    {seatIdentity ? (
                      <span
                        className="seatFactionDot roomMemberDot"
                        style={{ background: seatIdentity.factionColor ?? "#b08d2f" }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="roomMemberWho">
                      <span className="roomMemberPerson">
                        {/* A verified member's name opens their public profile
                            (signed-in members are named by their account
                            nickname). Guests are labeled only when accounts are
                            on — with accounts off everyone is a guest and the
                            label is pure noise. */}
                        {isVerified ? (
                          <a
                            className="roomMemberProfileLink"
                            href={`/players/${encodeURIComponent(member.name)}`}
                            rel="noreferrer"
                            target="_blank"
                            title={`View ${member.name}'s profile`}
                          >
                            {member.name}
                          </a>
                        ) : isGuest ? (
                          <span title="Guest — not signed in">{`guest — ${member.name}`}</span>
                        ) : (
                          member.name
                        )}
                        {self ? <em> (you)</em> : null}
                        {statusLabel ? (
                          <small className={`roomMemberPresence ${statusLabel === "AFK" ? "afk" : statusLabel}`}>
                            {statusLabel}
                          </small>
                        ) : null}
                      </span>
                      {pick ? <small className="roomMemberPick">{pick}</small> : null}
                    </span>
                  </span>

                  {hosted && isHost ? (
                    // Host: full seat control over every member.
                    <select
                      aria-label={`Seat for ${member.name}`}
                      className="roomSeatSelect"
                      onChange={(event) =>
                        onAction({
                          type: "ASSIGN_SEAT",
                          clientId,
                          targetClientId: member.clientId,
                          seat: event.target.value as RoomSeat
                        })
                      }
                      value={member.seat}
                    >
                      <option value="observer">Observer</option>
                      {seatIds.map((seatId) => (
                        <option disabled={seatIsComputer(seatId)} key={seatId} value={seatId}>
                          {seatLabel(seatId)}
                        </option>
                      ))}
                    </select>
                  ) : hosted && self ? (
                    // Non-host, own row: self-serve seating — Observer plus any
                    // seat not already held by someone else (the engine enforces
                    // the same rule; the host can still override).
                    <select
                      aria-label="Your seat"
                      className="roomSeatSelect"
                      onChange={(event) =>
                        onAction({
                          type: "ASSIGN_SEAT",
                          clientId,
                          targetClientId: clientId,
                          seat: event.target.value as RoomSeat
                        })
                      }
                      value={member.seat}
                    >
                      <option value="observer">Observer</option>
                      {seatIds
                        .filter(
                          (seatId) =>
                            seatId === member.seat ||
                            !members.some((other) => other.clientId !== member.clientId && other.seat === seatId)
                        )
                        .map((seatId) => (
                          <option disabled={seatIsComputer(seatId)} key={seatId} value={seatId}>
                            {seatLabel(seatId)}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className={`roomSeatBadge ${member.seat === "observer" ? "observer" : ""}`}>
                      {member.seat === "observer" ? (
                        <Eye aria-hidden="true" size={11} />
                      ) : (
                        <Crown aria-hidden="true" size={11} />
                      )}
                      {seatLabel(member.seat)}
                    </span>
                  )}

                  {hosted && isHost && !self ? (
                    <span className="roomMemberActions">
                      <button
                        className="iconButton"
                        onClick={() =>
                          onAction({ type: "TRANSFER_HOST", clientId, targetClientId: member.clientId })
                        }
                        title={`Make ${member.name} the host`}
                        type="button"
                      >
                        <UserCog aria-hidden="true" size={13} />
                      </button>
                      <button
                        className="iconButton danger"
                        onClick={() =>
                          onAction({ type: "KICK_MEMBER", clientId, targetClientId: member.clientId })
                        }
                        title={`Remove ${member.name} from the room`}
                        type="button"
                      >
                        <UserX aria-hidden="true" size={13} />
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
            {members.length === 0 ? <li className="roomMemberEmpty">Connecting…</li> : null}
          </ul>

          <div className="roomFooterButtons">
            {onBrowseRooms ? (
              <button className="commandButton ghost" onClick={onBrowseRooms} type="button">
                <List aria-hidden="true" size={13} /> Browse rooms
              </button>
            ) : null}
            {me ? (
              <button
                className="commandButton ghost roomLeave"
                onClick={() => onAction({ type: "LEAVE_ROOM", clientId })}
                type="button"
              >
                <LogOut aria-hidden="true" size={13} /> Leave room
              </button>
            ) : null}
            {canReclaimHost ? (
              <button
                className="commandButton ghost roomReclaimHost"
                onClick={() => onAction({ type: "RECLAIM_HOST", clientId })}
                title="The host has left — take over hosting so you can manage seats and settings"
                type="button"
              >
                <Crown aria-hidden="true" size={13} /> Take over host
              </button>
            ) : null}
            {onCloseRoom && canClose ? (
              <button
                className="commandButton danger roomClose"
                onClick={() => {
                  if (
                    typeof window === "undefined" ||
                    window.confirm("Close this room for everyone? This deletes the game and cannot be undone.")
                  ) {
                    onCloseRoom();
                  }
                }}
                title="Close (delete) this room for everyone"
                type="button"
              >
                <Trash2 aria-hidden="true" size={13} /> Close room
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
