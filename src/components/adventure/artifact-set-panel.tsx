"use client";

import { artifactSetCardImage, artifactSetDefinition, houseRuleEnabled, type GameState } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { useOptionalCardZoom } from "@/components/table/zoom";

// ---------------------------------------------------------------------------
// Polish Set Artifacts — the always-on set status, rendered beside the Ongoing /
// Permanent tray on BOTH the map and the combat screen ("put them on 'ongoing'
// effects to be seen all the time for every player").
//
// It renders EVERY seat's active sets, not just the viewer's: the piece count is
// PUBLIC state by design (`PlayerState.artifactSetStatus`, a documented leak —
// it says how many members a player holds SOMEWHERE, never which zone or which
// cards). Nothing here re-derives anything: the counts come straight off that
// synced field, and a set with fewer than 2 pieces has no bonus and is omitted.
// ---------------------------------------------------------------------------

type PanelSet = {
  setId: string;
  name: string;
  pieces: number;
  memberCount: number;
  activeTiers: number;
};

type PanelSeat = { playerId: string; name: string; sets: PanelSet[] };

/**
 * Every seat's ACTIVE sets (pieces >= 2), in turn order. Pure — exported so the
 * "what should show" rule is testable apart from the JSX.
 */
export function artifactSetPanelSeats(state: GameState): PanelSeat[] {
  if (!houseRuleEnabled(state, "polish-set-artifacts")) {
    return [];
  }
  const order = state.turnOrder?.length ? state.turnOrder : Object.keys(state.players);
  const seats: PanelSeat[] = [];
  for (const playerId of order) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    const sets: PanelSet[] = [];
    for (const status of player.artifactSetStatus ?? []) {
      // Below 2 pieces the set grants nothing at all — showing it would claim a
      // bonus that does not exist.
      if (status.pieces < 2) {
        continue;
      }
      sets.push({
        setId: status.setId,
        name: artifactSetDefinition(status.setId)?.name ?? status.setId,
        pieces: status.pieces,
        memberCount: status.memberCount,
        activeTiers: status.activeTiers
      });
    }
    if (sets.length > 0) {
      seats.push({ playerId, name: player.name ?? playerId, sets });
    }
  }
  return seats;
}

/** The printed tier lines a piece count has switched on (for the zoom view). */
function activeTierLines(setId: string, pieces: number): string[] {
  const definition = artifactSetDefinition(setId);
  if (!definition) {
    return [];
  }
  return definition.tiers.map(
    (tier) => `${pieces >= tier.threshold ? "✔" : "✖"} ${tier.threshold} pieces — ${tier.text}`
  );
}

export function ArtifactSetPanel({
  compact,
  state,
  viewerPlayerId
}: {
  compact?: boolean;
  state: GameState;
  viewerPlayerId?: string | null;
}) {
  const zoom = useOptionalCardZoom();
  const seats = artifactSetPanelSeats(state);
  if (seats.length === 0) {
    return null;
  }

  return (
    <section aria-label="Artifact sets" className={`artifactSetPanel${compact ? " compact" : ""}`}>
      <div className="trayBoxHeader">
        <strong>Artifact sets</strong>
      </div>
      {seats.map((seat) => (
        <div className="artifactSetSeat" key={seat.playerId}>
          <small className="artifactSetSeatName">
            {seat.name}
            {seat.playerId === viewerPlayerId ? " (you)" : ""}
          </small>
          <div className="artifactSetTiles">
            {seat.sets.map((set) => {
              const label = `${set.name}: ${set.pieces} of ${set.memberCount} pieces, ${set.activeTiers} bonus${
                set.activeTiers === 1 ? "" : "es"
              } active`;
              return (
                <button
                  aria-label={label}
                  className="artifactSetTile"
                  data-set-id={set.setId}
                  key={set.setId}
                  onClick={() =>
                    zoom?.zoomContent({
                      image: artifactSetCardImage(set.setId),
                      lines: activeTierLines(set.setId, set.pieces),
                      subtitle: `${seat.name} — ${set.pieces}/${set.memberCount} pieces, ${set.activeTiers} active`,
                      title: set.name
                    })
                  }
                  title={label}
                  type="button"
                >
                  <img
                    alt={set.name}
                    className="artifactSetCardImage"
                    decoding="async"
                    draggable={false}
                    loading="lazy"
                    src={assetUrl(artifactSetCardImage(set.setId))}
                  />
                  <span className="artifactSetPieces">
                    {set.pieces}/{set.memberCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
