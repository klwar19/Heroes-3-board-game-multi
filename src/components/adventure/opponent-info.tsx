"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import type { GameState, PlayerId } from "@/engine/state";
import { getSeatIdentity } from "@/engine/player-identity";
import { RESOURCE_ICONS } from "@/data/assets/homm-assets";
import { assetUrl } from "@/lib/asset-url";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import { SeatNameplate } from "@/components/table/seats";
import { HeroBoard } from "@/components/hero-board";
import { ArmyPanel } from "@/components/adventure/screen";

// ---------------------------------------------------------------------------
// Opponent info — a clear per-opponent button that opens a read-only panel with
// that opponent's PUBLIC state: resources (+ income), their hero (level, stats,
// specialties), their current unit deck (army), and the buildings they own.
// Everything shown is already public (only hands/decks/spell-books are masked in
// player-view), so this is a pure presentation layer. The dock is rendered on
// BOTH the adventure map and the combat screen.
// ---------------------------------------------------------------------------

const RESOURCE_ROWS = [
  { key: "gold" as const, label: "Gold" },
  { key: "buildingMaterials" as const, label: "Building materials (ore)" },
  { key: "valuables" as const, label: "Valuables (crystal)" }
];

/** The read-only info panel for a single opponent. */
function OpponentInfoModal({
  state,
  playerId,
  onClose
}: {
  state: GameState;
  playerId: PlayerId;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const player = state.players[playerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
  );
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  const buildings = town?.buildings ?? [];

  return (
    <div className="modalBackdrop opponentInfoBackdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="opponentInfoModal" onClick={(event) => event.stopPropagation()}>
        <button className="heroInfoClose" onClick={onClose} title="Close" type="button">
          <X size={16} />
        </button>

        <header className="opponentInfoHead">
          <SeatNameplate playerId={playerId} state={state} />
          {hero ? <span className="opponentInfoLevel">Hero level {hero.level}</span> : null}
        </header>

        {player ? (
          <section className="opponentInfoSection" aria-label="Resources and income">
            <h4>Resources</h4>
            <div className="opponentResources">
              {RESOURCE_ROWS.map((resource) => (
                <span
                  className="resourceChip"
                  key={resource.key}
                  title={`${resource.label}: ${player.resources[resource.key]} — income +${player.production[resource.key]} each resource round`}
                >
                  <img alt={resource.label} className="resourceIcon" src={assetUrl(RESOURCE_ICONS[resource.key])} />
                  <b>{player.resources[resource.key]}</b>
                  <small className="incomeTag">+{player.production[resource.key]}</small>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="opponentInfoSection" aria-label="Buildings">
          <h4>Buildings ({buildings.length})</h4>
          {buildings.length > 0 ? (
            <ul className="opponentBuildingList">
              {buildings.map((buildingId) => {
                const building = coreBuildingDefinitions[buildingId];
                const timing = building ? buildingTimingLabel(building) : null;
                return (
                  <li key={buildingId} title={building ? describeBuildingEffect(building) : buildingId}>
                    <span className="opponentBuildingName">{building?.name ?? buildingId}</span>
                    {timing ? <small>{timing}</small> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="opponentInfoEmpty">No buildings constructed yet.</p>
          )}
        </section>

        <section className="opponentInfoSection" aria-label="Current units">
          <h4>Current units</h4>
          <ArmyPanel playerId={playerId} state={state} />
        </section>

        <section className="opponentInfoSection" aria-label="Hero">
          <h4>Hero</h4>
          {hero ? <HeroBoard playerId={playerId} state={state} /> : <p className="opponentInfoEmpty">No hero.</p>}
        </section>
      </div>
    </div>
  );
}

/**
 * A per-opponent control — one small button per opponent, each opening the
 * read-only info modal on click. Self-contained (holds its own open-seat
 * state), so it drops in with no extra wiring. Two placements:
 * - `"map"`: a compact button pill at the top of the adventure map's LEFT rail.
 * - `"combat"`: a compact button pill in the combat card strip.
 */
export function OpponentInfoDock({
  state,
  viewerPlayerId,
  seatIds,
  variant = "map"
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  seatIds: PlayerId[];
  variant?: "map" | "combat";
}) {
  const [openSeat, setOpenSeat] = useState<PlayerId | null>(null);
  const opponents = seatIds.filter((id) => id !== viewerPlayerId);

  // No opponents (solo / a one-live-seat table) → render nothing at all, so
  // neither the left rail nor the combat strip is left with an empty box.
  if (opponents.length === 0) {
    return null;
  }

  const label = (
    <span className="opponentInfoDockLabel">
      <Users aria-hidden="true" size={13} /> Opponents
    </span>
  );
  const buttons = opponents.map((id) => {
    const identity = getSeatIdentity(state, id);
    const name = identity.personName ?? identity.seatName;
    return (
      <button
        className="opponentInfoBtn"
        key={id}
        onClick={() => setOpenSeat(id)}
        title={`Show ${name}'s resources, units, hero level and buildings`}
        type="button"
      >
        <span className="seatFactionDot" style={{ background: identity.factionColor ?? "#b08d2f" }} aria-hidden="true" />
        {name}
      </button>
    );
  });
  const modal = openSeat ? (
    <OpponentInfoModal onClose={() => setOpenSeat(null)} playerId={openSeat} state={state} />
  ) : null;

  return (
    <div className={`opponentInfoDock ${variant}`} aria-label="Opponent info">
      {label}
      <div className="opponentInfoBtnRow">{buttons}</div>
      {modal}
    </div>
  );
}
