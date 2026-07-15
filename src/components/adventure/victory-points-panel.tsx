"use client";

import { useState } from "react";
import { Award, Trophy, X } from "lucide-react";
import { computeVictoryPoints, victoryPointsModeActive, type GameState, type PlayerId } from "@/engine";
import { getSeatIdentity } from "@/engine/player-identity";
import { assetUrl } from "@/lib/asset-url";
import { REWARD_GLYPH_ICONS } from "@/data/assets/homm-assets";

/**
 * The board-game reward glyph (Heegu-sama/Homm3BG print-and-play set) for a VP
 * breakdown row, matched by the engine's row label. Purely decorative — the row
 * text still carries the meaning — so unmatched rows (extra objectives) simply
 * render without one.
 */
function vpRowGlyph(label: string): string | undefined {
  if (/Experience Level/i.test(label)) return REWARD_GLYPH_ICONS.experience;
  if (/Artifact/i.test(label)) return REWARD_GLYPH_ICONS.artifact;
  if (/Flagged Mines|Settlement/i.test(label)) return REWARD_GLYPH_ICONS.gold;
  if (/Building/i.test(label)) return REWARD_GLYPH_ICONS.materials;
  if (/surrender/i.test(label)) return REWARD_GLYPH_ICONS.defense;
  if (/defeated|Heroes/i.test(label)) return REWARD_GLYPH_ICONS.attack;
  if (/Completed the victory/i.test(label)) return REWARD_GLYPH_ICONS.ok;
  return undefined;
}

// ---------------------------------------------------------------------------
// Victory Points UI — pure presentation over the engine's `computeVictoryPoints`
// (live "if scored now" standings for everyone) and the `VP_SCORING` event (the
// final game-over breakdown). No engine change; both read already-public state.
// ---------------------------------------------------------------------------

type BreakdownRow = { playerId: PlayerId; total: number; rows: { label: string; vp: number }[] };

function seatName(state: GameState, playerId: PlayerId): string {
  const identity = getSeatIdentity(state, playerId);
  return identity.personName ?? identity.seatName;
}

/** One player's expandable breakdown card (shared by the dock modal + overlay). */
function BreakdownCard({
  state,
  row,
  isWinner,
  isViewer
}: {
  state: GameState;
  row: BreakdownRow;
  isWinner?: boolean;
  isViewer?: boolean;
}) {
  const identity = getSeatIdentity(state, row.playerId);
  return (
    <div className={`vpBreakdownCard${isWinner ? " winner" : ""}${isViewer ? " viewer" : ""}`}>
      <header className="vpBreakdownHead">
        <span className="seatFactionDot" style={{ background: identity.factionColor ?? "#b08d2f" }} aria-hidden="true" />
        <strong>{seatName(state, row.playerId)}</strong>
        {isWinner ? <Trophy aria-label="Winner" size={14} /> : null}
        <span className="vpBreakdownTotal">{row.total} VP</span>
      </header>
      {row.rows.length > 0 ? (
        <ul className="vpBreakdownRows">
          {row.rows.map((entry, index) => {
            const glyph = vpRowGlyph(entry.label);
            return (
              <li key={`${entry.label}-${index}`}>
                <span className="vpRowLabel">
                  {glyph ? (
                    // eslint-disable-next-line @next/next/no-img-element -- assetUrl CDN path; decorative
                    <img
                      alt=""
                      aria-hidden="true"
                      className={`vpRowGlyph${glyph === REWARD_GLYPH_ICONS.ok ? " status" : ""}`}
                      draggable={false}
                      src={assetUrl(glyph)}
                    />
                  ) : null}
                  {entry.label}
                </span>
                <b>+{entry.vp}</b>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="vpBreakdownEmpty">No Victory Points yet.</p>
      )}
    </div>
  );
}

/** The full standings modal (opened from the live dock). */
function VictoryPointsStandingsModal({
  state,
  viewerPlayerId,
  onClose
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onClose: () => void;
}) {
  const { breakdown } = computeVictoryPoints(state);
  return (
    <div className="modalBackdrop vpStandingsBackdrop" role="dialog" aria-modal="true" aria-label="Victory Points standings" onClick={onClose}>
      <div className="vpStandingsModal" onClick={(event) => event.stopPropagation()}>
        <button className="heroInfoClose" onClick={onClose} title="Close" type="button">
          <X size={16} />
        </button>
        <header className="vpStandingsHead">
          <Award aria-hidden="true" size={18} />
          <strong>Victory Points — if scored now</strong>
        </header>
        <div className="vpBreakdownList">
          {breakdown.map((row) => (
            <BreakdownCard key={row.playerId} state={state} row={row} isViewer={row.playerId === viewerPlayerId} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Live Victory-Points standings dock (rendered only when VP mode is on). Shows a
 * compact, sorted "if scored now" list to EVERYONE and opens the full per-player
 * breakdown on click. Self-contained (holds its own open state).
 */
export function VictoryPointsDock({
  state,
  viewerPlayerId
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
}) {
  const [open, setOpen] = useState(false);
  if (!victoryPointsModeActive(state)) {
    return null;
  }
  const { breakdown } = computeVictoryPoints(state);
  return (
    <div className="vpDock" aria-label="Victory Points standings">
      <button
        aria-label="Show the full Victory Points breakdown"
        className="vpDockButton"
        onClick={() => setOpen(true)}
        type="button"
        title="Show the full Victory Points breakdown"
      >
        <Award aria-hidden="true" size={13} />
        <span className="vpDockLabel">VP — if scored now</span>
      </button>
      <ol className="vpDockList">
        {breakdown.map((row) => (
          <li key={row.playerId} className={row.playerId === viewerPlayerId ? "viewer" : undefined}>
            <span className="vpDockName">{seatName(state, row.playerId)}</span>
            <b className="vpDockScore">{row.total}</b>
          </li>
        ))}
      </ol>
      {open ? (
        <VictoryPointsStandingsModal onClose={() => setOpen(false)} state={state} viewerPlayerId={viewerPlayerId} />
      ) : null}
    </div>
  );
}

/**
 * Game-over Victory-Points scoring overlay — reads the `VP_SCORING` event and
 * shows the final per-player breakdown (winner first) with the winner crowned.
 * Rendered alongside the winner overlay at game end. Returns null with no event.
 */
export function VictoryPointsScoringOverlay({
  state,
  viewerPlayerId,
  onDismiss
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onDismiss?: () => void;
}) {
  const scoring = [...state.eventLog].reverse().find((event) => event.type === "VP_SCORING");
  if (!scoring || scoring.type !== "VP_SCORING") {
    return null;
  }
  const winnerName = seatName(state, scoring.winnerPlayerId);
  return (
    <div className="vpScoringOverlay" role="dialog" aria-modal="true" aria-label="Victory Points scoring">
      <div className="vpScoringPanel">
        <header className="vpScoringHead">
          <Trophy aria-hidden="true" size={22} />
          <div>
            <strong>{winnerName} wins on Victory Points</strong>
            <small>Scored because {scoring.reason}.</small>
          </div>
        </header>
        <div className="vpBreakdownList">
          {scoring.breakdown.map((row) => (
            <BreakdownCard
              key={row.playerId}
              state={state}
              row={row}
              isWinner={row.playerId === scoring.winnerPlayerId}
              isViewer={row.playerId === viewerPlayerId}
            />
          ))}
        </div>
        {onDismiss ? (
          <button className="commandButton" onClick={onDismiss} type="button">
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
}
