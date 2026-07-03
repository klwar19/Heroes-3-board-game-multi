/**
 * Seat identity — who is at a seat and what they are playing.
 *
 * The table carries two separate name concepts that were never surfaced
 * together:
 *  - the PERSON: `RoomMember.name` (their account nickname when signed in, or
 *    their chosen guest name), keyed by the seat the member holds;
 *  - the SEAT: `PlayerState.name` (a bare "Player N" until a faction + hero are
 *    locked, then "<Hero> of <Town>"), plus the chosen `factionId` / `heroDefId`.
 *
 * A player looking at "Solmyr of Tower" could not tell WHICH of their friends
 * was playing it. `getSeatIdentity` bundles both — person, hero, town and room
 * role — so the UI can introduce a seat properly (person first, hero + town as
 * detail, or the room role when a seat isn't being played). Pure and defensive:
 * safe on open/solo tables and legacy snapshots (every derived field is optional).
 */
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import type { FactionId } from "@/data/factions/types";
import type { GameState, PlayerId, RoomMember } from "./state";

export type SeatRole = "host" | "player" | "observer";

export type SeatIdentity = {
  playerId: PlayerId;
  /** In-game seat label as stored ("Player 1" or "Solmyr of Tower"). */
  seatName: string;
  /**
   * The human at this seat — the room member's display name (account nickname
   * when signed in). Undefined when no room member currently holds the seat
   * (an open/solo table, or a seat nobody has claimed).
   */
  personName?: string;
  /** True when the seated member is bound to a verified account. */
  verified: boolean;
  /** Room role of the seated member. Undefined when no member holds the seat. */
  role?: SeatRole;
  factionId?: FactionId;
  /** Town/faction display name once chosen (e.g. "Castle"). */
  townName?: string;
  /** Faction flag colour, for tinting a badge. */
  factionColor?: string;
  heroDefId?: string;
  /** Hero display name once chosen (e.g. "Solmyr"). */
  heroName?: string;
};

/** Find the room member currently seated at `playerId` (none on open/solo tables). */
export function memberForSeat(state: GameState, playerId: PlayerId): RoomMember | null {
  return state.room?.members.find((member) => member.seat === playerId) ?? null;
}

/**
 * Resolve everything needed to introduce a seat: who is playing it (person),
 * what they picked (hero + town), and their room role.
 */
export function getSeatIdentity(state: GameState, playerId: PlayerId): SeatIdentity {
  const player = state.players[playerId];
  const member = memberForSeat(state, playerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  const hero = player?.heroDefId ? coreHeroDefinitions[player.heroDefId] : undefined;
  return {
    playerId,
    seatName: player?.name ?? playerId,
    personName: member?.name,
    verified: Boolean(member?.userId),
    // A member found via `seat === playerId` is by definition seated (never an
    // observer), so the role is host or player.
    role: member ? (member.isHost ? "host" : "player") : undefined,
    factionId: player?.factionId,
    townName: faction?.name,
    factionColor: faction?.color,
    heroDefId: player?.heroDefId,
    heroName: hero?.name
  };
}

/**
 * A compact "what are they playing" summary for a secondary line:
 * "Solmyr · Tower" when both are chosen, the town alone if only that is locked,
 * or null before any pick (nothing to show).
 */
export function seatPickSummary(identity: SeatIdentity): string | null {
  if (identity.heroName && identity.townName) {
    return `${identity.heroName} · ${identity.townName}`;
  }
  if (identity.townName) {
    return identity.townName;
  }
  if (identity.heroName) {
    return identity.heroName;
  }
  return null;
}

/**
 * The best single label for "who is this seat", person-first:
 * the person's name when a member holds the seat, otherwise the in-game seat
 * label. (The hero/town detail is shown separately via `seatPickSummary`.)
 */
export function seatPersonLabel(identity: SeatIdentity): string {
  return identity.personName ?? identity.seatName;
}
