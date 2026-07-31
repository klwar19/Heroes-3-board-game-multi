"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Layers, Trash2, Users, X } from "lucide-react";
import { playerSpellCastsIgnoreLimit, type GameState, type PlayerId } from "@/engine";
import { getSeatIdentity } from "@/engine/player-identity";
import { RESOURCE_ICONS } from "@/data/assets/homm-assets";
import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import { CardFrame, SeatNameplate } from "@/components/table/seats";
import { HeroBoard } from "@/components/hero-board";
import { ArmyPanel } from "@/components/adventure/screen";
import { BattleMetric, signedMorale } from "@/components/table/battle-metrics";

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
  const identity = getSeatIdentity(state, playerId);
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
  );
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  const buildings = town?.buildings ?? [];
  // Public counts only. In a redacted view an opponent's `hand`/`deck` are
  // same-length placeholder ids (see redactStateForSeat), so their LENGTH is the
  // real count while the cards themselves stay hidden — exactly what the physical
  // game shows across the table.
  const handCount = player?.hand.length ?? 0;
  const deckCount = player?.deck.length ?? 0;
  // Crowns left this combat round, with the seat's total — the same arithmetic the
  // combat command dock uses for the viewer's own crowns.
  const crownsTotal = (player?.limits.expertUses ?? 0) + (player?.combatStats.expertUseBonusThisRound ?? 0);
  const crownsLeft = Math.max(0, crownsTotal - (player?.combatStats.expertUsesSpentThisRound ?? 0));
  const ignoreSpellLimit = Boolean(player) && playerSpellCastsIgnoreLimit(state, playerId);
  const spellLimit = 1 + (player?.combatStats.spellLimitBonusThisRound ?? 0);
  const spellLimitLabel = ignoreSpellLimit ? "∞" : String(spellLimit);

  // PORTAL to <body>: the dock lives inside the fixed, scrollable left rail
  // (z-index 36). Rendered inline, this fixed backdrop is trapped in that
  // stacking context, so the fixed hand tray / top HUD / library rails paint
  // OVER the panel — the enemy hero section was invisible under the hand tray.
  // Same fix HeroInfoModal needed in the setup lobby.
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div className="modalBackdrop opponentInfoBackdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="opponentInfoModal"
        onClick={(event) => event.stopPropagation()}
        style={{ "--opp-faction": identity.factionColor ?? "#b08d2f" } as CSSProperties}
      >
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

        {player ? (
          <section className="opponentInfoSection" aria-label="Battle status">
            <h4>Battle status</h4>
            <div className="opponentBattleMetrics">
              {hero ? <BattleMetric kind="level" label="Level" title="Main hero level" value={hero.level} /> : null}
              <BattleMetric
                kind="spell"
                label="Spell"
                title="Spells cast this combat round"
                value={`${player.combatStats.spellsCastThisRound}/${spellLimitLabel}`}
              />
              <BattleMetric
                kind="crown"
                label="Crowns"
                title={`Expert-effect crowns left this combat round: ${crownsLeft} of ${crownsTotal}`}
                value={`${crownsLeft}/${crownsTotal}`}
              />
              <BattleMetric
                kind="hand"
                label="Hand"
                title="Cards in their hand (card identities remain hidden)"
                value={handCount}
              />
              <BattleMetric
                kind="morale"
                label="Morale"
                morale={player.morale}
                title="Current morale"
                value={signedMorale(player.morale)}
              />
              {hero ? (
                <BattleMetric
                  kind="movement"
                  label="Move"
                  title="Movement points their main hero has left this turn"
                  value={hero.movementPoints}
                />
              ) : null}
            </div>
            <div className="opponentCardCounts">
              <span className="opponentCountChip" title="Cards left in their draw deck (order hidden from everyone)">
                <Layers aria-hidden="true" size={12} /> Deck <b>{deckCount}</b>
              </span>
              <span className="opponentCountChip" title="Cards in their discard pile — public, listed below">
                <Trash2 aria-hidden="true" size={12} /> Discard <b>{player.discard.length}</b>
              </span>
            </div>
          </section>
        ) : null}

        {/* The enemy HERO is the panel's headline — it sits right under the
            counts, never below the fold behind the long discard list. */}
        <section className="opponentInfoSection opponentHeroSection" aria-label="Hero">
          <h4>Hero</h4>
          {hero ? <HeroBoard playerId={playerId} state={state} /> : <p className="opponentInfoEmpty">No hero.</p>}
        </section>

        <section className="opponentInfoSection" aria-label="Current units">
          <h4>Current units</h4>
          <ArmyPanel playerId={playerId} state={state} />
        </section>

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

        {player ? (
          <section className="opponentInfoSection" aria-label="Discard pile">
            <h4>Discard pile ({player.discard.length})</h4>
            {player.discard.length > 0 ? (
              // A discard pile is PUBLIC in this game (player-view never masks it),
              // so the whole pile is browsable — newest (the face-up top) first.
              <div className="opponentDiscardGrid">
                {[...player.discard].reverse().map((cardId, index) => (
                  <CardFrame
                    cardId={cardId}
                    className={`opponentDiscardCard${index === 0 ? " top" : ""}`}
                    empowered={player.empoweredAbilities?.includes(cardId)}
                    key={`${cardId}-${index}`}
                    title={`${cardLibrary[cardId]?.name ?? cardId}${index === 0 ? " (face-up top)" : ""}`}
                  />
                ))}
              </div>
            ) : (
              <p className="opponentInfoEmpty">Their discard pile is empty.</p>
            )}
          </section>
        ) : null}
      </div>
    </div>,
    document.body
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
        aria-label={`Show ${name} details`}
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
