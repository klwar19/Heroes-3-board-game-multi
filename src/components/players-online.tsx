"use client";

import { BadgeCheck, DoorOpen, UserPlus, Users } from "lucide-react";
import { authEnabled } from "@/lib/auth-mode";
import type { PresenceEntry } from "@/lib/lobby-presence-client";

/**
 * Lobby "Players online" panel — the global presence list shown in the room
 * browser (/play) beside the lobby chat. Purely presentational: the /play page
 * owns polling `players` (via the presence heartbeat) and the two intents:
 *  - Join  → hop into the room a player is currently in (spectate or take a seat);
 *  - Invite → popup on that player's client (+ a lobby-chat ping). From the
 *    lobby you have no room yet, so it is a "want to play?" nudge; the in-room
 *    panel's Invite carries a join link and a Join button on the popup.
 *
 * The verified/guest badge comes straight from the server (cookie-verified), so
 * it is trustworthy and consistent with the room roster's guest labelling.
 * Guest labels are only shown when accounts are ENABLED — with accounts off
 * everyone is a guest technically, and labelling them all "guest —" is noise.
 */
export function PlayersOnline({
  players,
  clientId,
  onJoinRoom,
  onInvite
}: {
  players: PresenceEntry[];
  clientId: string;
  onJoinRoom: (roomId: string) => void;
  onInvite: (player: PresenceEntry) => void;
}) {
  const showAuthLabels = authEnabled();

  return (
    <section className="playersOnline" aria-label="Players online">
      <header className="playersOnlineHeader">
        <Users aria-hidden="true" size={15} />
        <span>Players online</span>
        <span className="lobbyLiveDot" aria-hidden="true" />
        <small className="playersOnlineCount">{players.length}</small>
      </header>

      {players.length === 0 ? (
        // The viewer's own heartbeat always puts THEM in a loaded list, so an
        // empty list means the first poll hasn't answered yet — never claim
        // "nobody online" while we simply don't know.
        <p className="playersOnlineEmpty">Checking who is online…</p>
      ) : (
        <ul className="playersOnlineList">
          {players.map((player) => {
            const self = player.clientId === clientId;
            const showAsGuest = showAuthLabels && !player.verified;
            const where = player.roomId
              ? `in ${player.roomName ?? "a room"}${
                  player.roomStatus === "playing"
                    ? " · playing"
                    : player.roomStatus === "setup"
                      ? " · setting up"
                      : ""
                }`
              : "in the lobby";
            return (
              <li
                className={`playerOnline${showAuthLabels ? (player.verified ? " verified" : " guest") : ""}`}
                key={player.clientId}
              >
                <span className="playerOnlineDot" aria-hidden="true" />
                <span className="playerOnlineWho">
                  <span className="playerOnlineName">
                    {showAuthLabels && player.verified ? (
                      <BadgeCheck aria-hidden="true" size={12} className="playerOnlineBadge" />
                    ) : null}
                    {showAsGuest ? `guest — ${player.name}` : player.name}
                    {self ? <em> (you)</em> : null}
                  </span>
                  <small className="playerOnlineWhere">{where}</small>
                </span>
                {!self ? (
                  <span className="playerOnlineActions">
                    {player.roomId ? (
                      <button
                        className="commandButton ghost"
                        onClick={() => onJoinRoom(player.roomId!)}
                        title={`Join ${player.name}'s room`}
                        type="button"
                      >
                        <DoorOpen aria-hidden="true" size={13} /> Join
                      </button>
                    ) : null}
                    <button
                      className="commandButton ghost"
                      onClick={() => onInvite(player)}
                      title={`Send ${player.name} an invite popup`}
                      type="button"
                    >
                      <UserPlus aria-hidden="true" size={13} /> Invite
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
