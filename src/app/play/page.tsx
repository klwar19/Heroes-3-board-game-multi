"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LobbyScreen } from "@/components/lobby";
import { MenuShell } from "@/components/menu/menu-shell";
import { DEFAULT_SERVER } from "@/data/servers";
import { uiArtSlot } from "@/data/ui-art";
import { assetUrl } from "@/lib/asset-url";
import { getClientId, getDisplayName, setDisplayName } from "@/lib/identity";
import { fetchSession } from "@/lib/auth-client";
import { fetchLobbyChat, postLobbyChat, type LobbyChatMessage } from "@/lib/lobby-chat-client";
import { LobbyChat } from "@/components/lobby-chat";
import { savePendingRoomHosted, savePendingRoomName } from "@/lib/pending-room-name";
import {
  createRoomOnServer,
  fetchRoomList,
  requestCloseRoom,
  type RoomDirectoryEntry
} from "@/lib/realtime";

/**
 * Multiplayer front door (expansion plan Phase 0): the room browser under the
 * Erathia server badge. Reuses the EXISTING LobbyScreen presentational
 * component; this page owns the directory polling + create/close/join
 * transport calls that previously lived in the game page's lobby branch
 * (src/app/page.tsx, which now redirects bare visits to /menu). Joining
 * navigates to /?room=… — the exact shared-link path every room already
 * supports, so the in-room machinery is untouched.
 */
export default function PlayPage() {
  const router = useRouter();
  const clientId = useMemo(() => getClientId(), []);
  const [displayName, setDisplayNameState] = useState("");
  const [rooms, setRooms] = useState<RoomDirectoryEntry[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chatMessages, setChatMessages] = useState<LobbyChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

  // Persisted name is browser-only state: read after mount (same pattern and
  // lint scope as src/app/page.tsx).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = getDisplayName();
    if (stored) {
      setDisplayNameState(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Authoritative admin check (the session cookie, not the localStorage cache),
  // so the "delete any room" control only appears for a real platform admin. The
  // server re-verifies on every DELETE regardless, so this is display-only.
  useEffect(() => {
    fetchSession()
      .then((profile) => setIsAdmin(profile?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  // Only updates state in async callbacks (never synchronously), so the
  // polling effect below can call it without cascading renders.
  const refresh = useCallback(() => {
    fetchRoomList(clientId)
      .then((result) => {
        setRooms(result.rooms);
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
  }, [clientId]);

  // Poll the directory (and lobby chat) every 5s while the browser is open.
  useEffect(() => {
    refresh();
    const intervalId = window.setInterval(refresh, 5000);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  const sendChat = useCallback(
    (text: string) => {
      setChatError(null);
      postLobbyChat({ clientId, name: displayName.trim() || "Player", text })
        .then((message) => setChatMessages((prev) => [...prev.filter((m) => m.seq !== message.seq), message]))
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

  const handleCreate = (name: string, hosted: boolean) => {
    setError(null);
    createRoomOnServer({
      name: name || undefined,
      createdByName: displayName.trim() || undefined
    })
      .then(({ roomId }) => {
        // PartyKit creates rooms implicitly, so carry the chosen name across
        // the navigation for the game page to apply once connected (a no-op
        // on the API backend, which already seeded it server-side).
        if (name) {
          savePendingRoomName(roomId, name);
        }
        // A Closed table: carry the choice so the game page hosts the room once
        // the creator connects (they become host, seats lock). Open is default.
        if (hosted) {
          savePendingRoomHosted(roomId);
        }
        goToRoom(roomId);
      })
      .catch(() => setError("Could not create the room."));
  };

  const handleClose = (roomId: string) => {
    if (!window.confirm("Close this room for everyone? This deletes the game and cannot be undone.")) {
      return;
    }
    requestCloseRoom(roomId, clientId)
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
    <MenuShell as="div" backdrop="lobby-backdrop" panel={false}>
      <div className="serverBadge">
        <img alt={emblem.alt} className="serverBadgeEmblem" src={assetUrl(emblem.src)} />
        <span className="serverBadgeName">
          {DEFAULT_SERVER.name}
          <small>{DEFAULT_SERVER.description}</small>
        </span>
        <span className="serverBadgeStatus">{DEFAULT_SERVER.open ? "Online" : "Closed"}</span>
      </div>
      {/* Remount when the persisted name hydrates/changes so the name field's
          draft (captured at mount) always starts from the real value. */}
      <LobbyScreen
        key={displayName}
        displayName={displayName}
        error={error}
        loading={loading}
        onClose={handleClose}
        onCreate={handleCreate}
        onJoin={goToRoom}
        onRefresh={refresh}
        onRename={handleRename}
        rooms={rooms}
        supported={supported}
        isAdmin={isAdmin}
      />
      <LobbyChat clientId={clientId} messages={chatMessages} error={chatError} onSend={sendChat} />
    </MenuShell>
  );
}
