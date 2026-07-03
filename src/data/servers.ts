import type { UiArtSlotId } from "@/data/ui-art";

/**
 * Named game servers ("shards") for the multiplayer platform. A server is a
 * named partition of the room directory + lobby chat, NOT a separate
 * deployment (expansion plan §D3): game rooms are already isolated per room
 * on both transports, so adding "Server 2" later is one more entry here plus
 * the per-server directory plumbing (Phase 4) — configuration, not code.
 *
 * Phase 0 ships the single home server, Erathia, purely as UI identity (the
 * lobby badge). Room ids are not yet server-prefixed; that lands with the
 * directory partition work in Phase 4.
 */
export type GameServerInfo = {
  /** Stable id used in directory partitions and (later) room-id prefixes. */
  id: string;
  /** Player-facing name. */
  name: string;
  /** One-line flavor/description shown in the server strip. */
  description: string;
  /** Closed servers render greyed out and refuse entry. */
  open: boolean;
  /** Art slot for the server crest. */
  emblemSlot: UiArtSlotId;
};

export const GAME_SERVERS: readonly GameServerInfo[] = [
  {
    id: "erathia",
    name: "Erathia",
    description: "The home server — all tables and players meet here.",
    open: true,
    emblemSlot: "server-emblem-erathia"
  }
];

/** The server new visitors land on. Exactly one server exists today. */
export const DEFAULT_SERVER: GameServerInfo = GAME_SERVERS[0];
