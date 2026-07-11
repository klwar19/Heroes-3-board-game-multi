"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LobbyScreen } from "@/components/lobby";
import { LobbyChat } from "@/components/lobby-chat";
import { PlayersOnline } from "@/components/players-online";
import { MenuShell } from "@/components/menu/menu-shell";
import { DEFAULT_SERVER } from "@/data/servers";
import { uiArtSlot } from "@/data/ui-art";
import type { GameMode } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { fetchSession, fetchSocketToken } from "@/lib/auth-client";
import { getClientId, getDisplayName, setDisplayName } from "@/lib/identity";
import { fetchLobbyChat, postLobbyChat, type LobbyChatMessage } from "@/lib/lobby-chat-client";
import { leavePresence, sendPresence, type PresenceEntry } from "@/lib/lobby-presence-client";
import {
  savePendingRoomHosted,
  savePendingRoomMode,
  savePendingRoomName,
  savePendingRoomRanked
} from "@/lib/pending-room-name";
import {
  createRoomOnServer,
  fetchRoomList,
  requestAdminCloseRoom,
  requestCloseRoom,
  type RoomDirectoryEntry
} from "@/lib/realtime";

/**
 * Shared room browser powering BOTH the Multiplayer lobby (`/play`, adventure
 * tables) and the Battle Test lobby (`/battle`, combat-sandbox arenas). It owns
 * the directory polling and the create / join / close transport, filtered to a
 * single `mode` so each front door only shows — and only opens — its own kind of
 * table. Everything is shared for all players: the directory, the global lobby
 * chat, and every created room live on the server.
 */
export type RoomBrowserLabels = {
  /** Server-badge subtitle (what this front door is for). */
  badgeNote: string;
  /** Lobby heading. */
  title: string;
  /** Create-button label. */
  createLabel: string;
  /** Empty-state hint. */
  emptyHint: string;
  /** Backdrop art slot for the MenuShell. */
  backdrop: "lobby-backdrop" | "menu-backdrop";
};

export function RoomBrowser({ mode, labels }: { mode: GameMode; labels: RoomBrowserLabels }) {
  const router = useRouter();
  const clientId = useMemo(() => getClientId(), []);
  const [displayName, setDisplayNameState] = useState("");
  const [rooms, setRooms] = useState<RoomDirectoryEntry[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<LobbyChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [playersOnline, setPlayersOnline] = useState<PresenceEntry[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = getDisplayName();
    if (stored) {
      setDisplayNameState(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Authoritative session check (the cookie, not the localStorage cache): drives
  // the "signed in as …" chip, the admin-only delete control, and the display
  // name used for presence / room joins. The server re-verifies every privileged
  // action regardless; here we also force the nickname so a signed-in player is
  // never heartbeating under an old guest name.
  useEffect(() => {
    fetchSession()
      .then((profile) => {
        setIsAdmin(profile?.role === "admin");
        setAccountName(profile?.nickname ?? null);
        if (profile?.nickname) {
          setDisplayName(profile.nickname);
          setDisplayNameState(profile.nickname);
        }
      })
      .catch(() => {
        setIsAdmin(false);
        setAccountName(null);
      });
  }, []);

  // Only updates state in async callbacks (never synchronously), so the polling
  // effect below can call it without cascading renders. Rooms are filtered to
  // this browser's mode so /play shows adventures and /battle shows arenas.
  const refresh = useCallback(() => {
    fetchRoomList(clientId)
      .then((result) => {
        setRooms(result.rooms.filter((room) => room.mode === mode));
        setSupported(result.supported);
        setError(null);
      })
      .catch(() => setError("Could not load the room list."))
      .finally(() => setLoading(false));
    // The global lobby chat rides the same poll (ephemeral, best-effort).
    fetchLobbyChat()
      .then(setChatMessages)
      .catch(() => {
        /* transient — the next poll retries */
      });
    // Announce that we are online (in the lobby, no room) and pick up the fresh
    // online list in the same round trip. Prefer the signed-in nickname so the
    // online board never labels a real account under a stale guest name.
    // Best-effort — presence is decorative; a failed beat resolves null and
    // must NOT blank the list (that read as everyone blinking offline).
    const presenceName = (accountName ?? getDisplayName()).trim() || "Player";
    sendPresence({ clientId, name: presenceName })
      .then((players) => {
        if (players) {
          setPlayersOnline(players);
        }
      })
      .catch(() => {
        /* transient — the next poll retries */
      });
  }, [clientId, mode, accountName]);

  // Poll the directory (and lobby chat) every 3s while the browser is open —
  // chat feels fresher without hammering the server (best-effort ephemeral).
  // Background tabs get their timers throttled to >= 60s, so also refresh the
  // moment the tab becomes visible again instead of waiting out a stale tick.
  useEffect(() => {
    refresh();
    const intervalId = window.setInterval(refresh, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Drop off the online list promptly when the lobby is left (navigating into a
  // room, back to the menu, or closing the tab) instead of lingering out the TTL.
  useEffect(() => {
    const leave = () => leavePresence(clientId);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [clientId]);

  const sendChat = useCallback(
    (text: string) => {
      setChatError(null);
      // After a successful post, re-fetch the full feed so concurrent lines from
      // other browsers land immediately (not only our own optimistic merge).
      postLobbyChat({ clientId, name: displayName.trim() || "Player", text })
        .then(() => fetchLobbyChat())
        .then(setChatMessages)
        .catch((sendError: unknown) =>
          setChatError(sendError instanceof Error ? sendError.message : "Could not send the message.")
        );
    },
    [clientId, displayName]
  );

  const goToRoom = useCallback(
    (roomId: string) => {
      router.push(`/?room=${encodeURIComponent(roomId)}`);
    },
    [router]
  );

  // Invite an online player from the lobby: a friendly ping in the global lobby
  // chat (the "lobby-chat ping" the user asked for). From the lobby you have no
  // room to link yet, so this nudges them to team up; the in-room panel's Invite
  // carries an actual join link.
  const invitePlayer = useCallback(
    (player: PresenceEntry) => {
      sendChat(`👋 ${player.name} — want to play? Create or join a room and let's go!`);
    },
    [sendChat]
  );

  const handleCreate = (name: string, hosted: boolean, ranked: boolean) => {
    setError(null);
    // Ranked always closes the table so seats exist for match reporting.
    const effectiveHosted = ranked ? true : hosted;
    createRoomOnServer({
      name: name || undefined,
      createdByName: displayName.trim() || undefined,
      mode,
      ranked,
      hosted: effectiveHosted
    })
      .then(({ roomId }) => {
        // PartyKit creates rooms implicitly, so carry the choices across the
        // navigation for the game page to apply once connected (no-ops on the
        // API backend, which already seeded them server-side).
        if (name) {
          savePendingRoomName(roomId, name);
        }
        if (effectiveHosted) {
          savePendingRoomHosted(roomId);
        }
        // Always carry the match type so PartyKit applies the explicit choice
        // (both Ranked and Normal, since the edge default would otherwise be
        // "ranked").
        savePendingRoomRanked(roomId, ranked);
        // A battle test needs the room switched to combat-sandbox on connect.
        if (mode !== "adventure") {
          savePendingRoomMode(roomId, mode);
        }
        goToRoom(roomId);
      })
      .catch(() => setError("Could not create the room."));
  };

  const handleClose = (roomId: string) => {
    if (!window.confirm("Close this room for everyone? This deletes the game and cannot be undone.")) {
      return;
    }
    // A PLATFORM ADMIN deletes through the SAME-ORIGIN app (cookie-verified,
    // then forwarded to the edge server-side) — the reliable path that replaced
    // the cross-origin socket-ticket delete that kept refusing with "Only
    // members of this room can close it". A non-admin closing their OWN room
    // (room.canClose — host/member authority) keeps the direct edge close.
    const close = isAdmin
      ? requestAdminCloseRoom(roomId)
      : requestCloseRoom(roomId, clientId, fetchSocketToken);
    close
      .then((result) => {
        if (!result.closed) {
          setError(result.reason ?? "Could not close the room.");
        }
        refresh();
      })
      .catch(() => setError("Could not close the room."));
  };

  const handleRename = (name: string) => {
    setDisplayName(name);
    setDisplayNameState(name);
  };

  const emblem = uiArtSlot(DEFAULT_SERVER.emblemSlot);

  return (
    <MenuShell as="div" backdrop={labels.backdrop} panel={false}>
      <div className="serverBadge">
        <img alt={emblem.alt} className="serverBadgeEmblem" src={assetUrl(emblem.src)} />
        <span className="serverBadgeName">
          {DEFAULT_SERVER.name}
          <small>{labels.badgeNote}</small>
        </span>
        <span className="serverBadgeStatus">{DEFAULT_SERVER.open ? "Online" : "Closed"}</span>
        <Link className="serverBadgeAccount" href="/menu" title="Back to the main menu">
          {accountName ? (
            <>
              Signed in as <strong>{accountName}</strong>
              {isAdmin ? <em className="serverBadgeAdmin"> · admin</em> : null}
            </>
          ) : (
            "Guest · Menu"
          )}
        </Link>
      </div>
      {/* Two-column lobby: the room directory on the left, a LIVE social rail
          (who is online + the global lobby chat) pinned on the right so both
          are visible at a glance instead of hiding below the fold. Narrow
          screens stack the rail under the rooms (CSS). */}
      <div className="lobbyLayout">
        {/* Remount when the persisted name hydrates/changes so the name field's
            draft (captured at mount) always starts from the real value. */}
        <LobbyScreen
          key={displayName}
          createLabel={labels.createLabel}
          displayName={displayName}
          emptyHint={labels.emptyHint}
          error={error}
          isAdmin={isAdmin}
          loading={loading}
          onClose={handleClose}
          onCreate={handleCreate}
          onJoin={goToRoom}
          onRefresh={refresh}
          onRename={handleRename}
          onlinePlayers={playersOnline}
          rooms={rooms}
          supported={supported}
          title={labels.title}
        />
        <aside className="lobbySidebar" aria-label="Players online and lobby chat">
          <PlayersOnline
            players={playersOnline}
            clientId={clientId}
            onJoinRoom={goToRoom}
            onInvite={invitePlayer}
          />
          <LobbyChat clientId={clientId} messages={chatMessages} error={chatError} onSend={sendChat} />
        </aside>
      </div>
    </MenuShell>
  );
}
