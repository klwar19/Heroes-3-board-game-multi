"use client";

import { BadgeCheck, DoorOpen, UserPlus, Users } from "lucide-react";
import type { PresenceEntry } from "@/lib/lobby-presence-client";

/**
 * Lobby "Players online" panel — the global presence list shown in the room
 * browser (/play) beside the lobby chat. Purely presentational: the /play page
 * owns polling `players` (via the presence heartbeat) and the two intents:
 *  - Join  → hop into the room a player is currently in (spectate or take a seat);
 *  - Invite → ping the player in the global lobby chat (the "link + lobby-chat
 *    ping" invite the user asked for — from the lobby you have no room yet, so
 *    it is a nudge to team up; the in-room panel's Invite carries a join link).
 *
 * The verified/guest badge comes straight from the server (cookie-verified), so
 * it is trustworthy and consistent with the room roster's guest labelling.
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
  return (
    <section className="playersOnline" aria-label="Players online">
      <header className="playersOnlineHeader">
        <Users aria-hidden="true" size={15} />
        <span>Players online</span>
        <small className="playersOnlineCount">{players.length}</small>
      </header>

      {players.length === 0 ? (
        <p className="playersOnlineEmpty">Nobody else is online right now.</p>
      ) : (
        <ul className="playersOnlineList">
          {players.map((player) => {
            const self = player.clientId === clientId;
            return (
              <li className={`playerOnline${player.verified ? " verified" : " guest"}`} key={player.clientId}>
                <span className="playerOnlineDot" aria-hidden="true" />
                <span className="playerOnlineWho">
                  <span className="playerOnlineName">
                    {player.verified ? (
                      <BadgeCheck aria-hidden="true" size={12} className="playerOnlineBadge" />
                    ) : null}
                    {player.verified ? player.name : `guest — ${player.name}`}
                    {self ? <em> (you)</em> : null}
                  </span>
                  <small className="playerOnlineWhere">
                    {player.roomId ? `in ${player.roomName ?? "a room"}` : "in the lobby"}
                  </small>
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
                      title={`Invite ${player.name} in the lobby chat`}
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
