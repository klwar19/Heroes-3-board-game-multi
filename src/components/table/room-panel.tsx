"use client";

import { useState } from "react";
import { Check, Copy, Crown, Eye, List, Lock, LogOut, ShieldCheck, Trash2, UserCog, UserX, Users } from "lucide-react";
import {
  getSeatIdentity,
  NEUTRAL_PLAYER_ID,
  roomDisplayName,
  seatPickSummary,
  type GameAction,
  type GameState,
  type RoomSeat
} from "@/engine";
import { authEnabled } from "@/lib/auth-mode";

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
  onBrowseRooms
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
}) {
  const [open, setOpen] = useState(false);
  // Seeded from the persisted name (already loaded by the time this panel
  // mounts); the user edits it freely and Save pushes it back up.
  const [nameDraft, setNameDraft] = useState(displayName);
  const [copied, setCopied] = useState(false);

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
  // Closing mirrors the engine rule: the host on a hosted room; anyone on an
  // open table (open tables have no ownership to protect — see viewerCanClose).
  const canClose = hosted ? isHost : true;

  const seatIds = state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID);
  const seatLabel = (seat: RoomSeat) => (seat === "observer" ? "Observer" : state.players[seat]?.name ?? seat);

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
          {roleLabel} · {members.length} in room
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

          <ul className="roomMembers">
            {members.map((member) => {
              const self = member.clientId === clientId;
              // What this member is playing (town + hero), when they hold a seat.
              const seatIdentity = member.seat !== "observer" ? getSeatIdentity(state, member.seat) : null;
              const pick = seatIdentity ? seatPickSummary(seatIdentity) : null;
              return (
                <li className="roomMember" key={member.clientId}>
                  <span className="roomMemberName">
                    {member.isHost ? <Crown aria-hidden="true" size={12} className="hostCrown" /> : null}
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
                            nickname); guests stay plain text. */}
                        {member.userId && authEnabled() ? (
                          <a
                            className="roomMemberProfileLink"
                            href={`/players/${encodeURIComponent(member.name)}`}
                            rel="noreferrer"
                            target="_blank"
                            title={`View ${member.name}'s profile`}
                          >
                            {member.name}
                          </a>
                        ) : (
                          member.name
                        )}
                        {self ? <em> (you)</em> : null}
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
                        <option key={seatId} value={seatId}>
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
                          <option key={seatId} value={seatId}>
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
