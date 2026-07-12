"use client";

import { useCallback, useEffect, useState } from "react";
import { DoorOpen, UserPlus, X } from "lucide-react";
import {
  dismissLobbyInvite,
  fetchLobbyInvites,
  type LobbyInvite
} from "@/lib/lobby-invites-client";

/**
 * Global invite modal — polls pending invites for this tab and pops the newest
 * one in the player's face (Join room / Dismiss). Mounted in the lobby browser
 * AND the in-game page so an invite reaches someone already sitting at a table
 * or idling in the room list, not only as a chat line they might miss.
 */
export function InvitePopup({
  clientId,
  onJoinRoom
}: {
  clientId: string;
  /** Navigate into the invited room (lobby: router push; game: switch room). */
  onJoinRoom: (roomId: string) => void;
}) {
  const [invite, setInvite] = useState<LobbyInvite | null>(null);

  const refresh = useCallback(() => {
    if (!clientId) {
      return;
    }
    fetchLobbyInvites(clientId)
      .then((invites) => {
        // Newest first from the board; show the top one.
        setInvite(invites[0] ?? null);
      })
      .catch(() => {
        /* transient — next poll retries */
      });
  }, [clientId]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (!invite) {
    return null;
  }

  const roomLabel = invite.roomName?.trim() || (invite.roomId ? "a room" : null);

  const dismiss = () => {
    const id = invite.id;
    setInvite(null);
    void dismissLobbyInvite({ clientId, dismissId: id });
  };

  const accept = () => {
    const roomId = invite.roomId;
    dismiss();
    if (roomId) {
      onJoinRoom(roomId);
    }
  };

  return (
    <div className="invitePopupBackdrop" role="dialog" aria-label="Game invitation" aria-modal="true">
      <div className="invitePopup">
        <header className="invitePopupHeader">
          <UserPlus aria-hidden="true" size={18} />
          <strong>You&apos;re invited</strong>
          <button
            aria-label="Dismiss invitation"
            className="invitePopupClose"
            onClick={dismiss}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>
        <p className="invitePopupBody">
          <strong>{invite.fromName}</strong>
          {roomLabel ? (
            <>
              {" "}
              invites you to join <em>{roomLabel}</em>.
            </>
          ) : (
            <> wants to play — create or join a room and team up.</>
          )}
        </p>
        <div className="invitePopupActions">
          {invite.roomId ? (
            <button className="commandButton" onClick={accept} type="button">
              <DoorOpen aria-hidden="true" size={14} />
              <span>Join room</span>
            </button>
          ) : null}
          <button className="commandButton ghost" onClick={dismiss} type="button">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
