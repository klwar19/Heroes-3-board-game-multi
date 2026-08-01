"use client";

import { useState } from "react";
import { Award, CheckCircle2, Circle, MapPin, Target, Trophy, X } from "lucide-react";
import {
  computeVictoryPoints,
  customWinConditionProgress,
  describeCustomWinCondition,
  describeVictoryPointObjective,
  victoryPointObjectiveProgress,
  victoryPointsConfig,
  victoryPointsModeActive,
  VICTORY_MODE_LABELS,
  type GameState,
  type PlayerId
} from "@/engine";
import { getSeatIdentity } from "@/engine/player-identity";
import { assetUrl } from "@/lib/asset-url";
import { REWARD_GLYPH_ICONS } from "@/data/assets/homm-assets";
import { locationDefinitions } from "@/data/map/locations";

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
      <small className="vpDockSurrenderNote" title="When an enemy hero surrenders to you, you gain 1 VP (not the full 3 VP main-hero defeat).">
        Surrender → opponent gains 1 VP
      </small>
      {open ? (
        <VictoryPointsStandingsModal onClose={() => setOpen(false)} state={state} viewerPlayerId={viewerPlayerId} />
      ) : null}
    </div>
  );
}

/** A compact, always-readable scenario brief. Designed-map targets, custom win
 * conditions and VP objectives are deliberately derived from live engine state;
 * this is not a second set of hand-written campaign claims. */
export function ScenarioObjectivesDock({
  state,
  viewerPlayerId
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
}) {
  const [open, setOpen] = useState(false);
  const adventure = state.adventure;
  if (!adventure) return null;

  const preset = adventure.mapPreset;
  const custom = preset?.customWinConditions ?? [];
  const vp = victoryPointsConfig(state);
  const encounterFields = Object.values(adventure.fields).filter((field) => field.designerWinCondition);
  const modeLabel = adventure.victoryMode
    ? VICTORY_MODE_LABELS[adventure.victoryMode] ?? "Scenario victory"
    : "Scenario victory";
  const roundLimit = preset?.roundLimit;
  const headline = encounterFields.length > 0
    ? `Defeat ${locationDefinitions[encounterFields[0]!.location]?.name ?? "the marked encounter"}`
    : custom[0]
      ? describeCustomWinCondition(custom[0])
      : modeLabel;

  return (
    <div className="objectiveDock" aria-label="Scenario objectives">
      <button
        aria-label="Show scenario objectives"
        className="objectiveDockButton"
        onClick={() => setOpen(true)}
        title="Show objectives and live progress"
        type="button"
      >
        <Target aria-hidden size={15} />
        <span><small>Objective</small><strong>{headline}</strong></span>
      </button>
      {roundLimit ? <span className="objectiveRound">Round {state.round}/{roundLimit}</span> : null}
      {open ? (
        <div className="modalBackdrop objectiveBackdrop" role="dialog" aria-modal="true" aria-label="Scenario objectives" onClick={() => setOpen(false)}>
          <section className="objectiveModal" onClick={(event) => event.stopPropagation()}>
            <button className="heroInfoClose" onClick={() => setOpen(false)} title="Close" type="button"><X size={16} /></button>
            <header className="objectiveModalHead">
              <Target aria-hidden size={22} />
              <div>
                <span>MISSION LEDGER</span>
                <h2>Scenario objectives</h2>
              </div>
            </header>
            <p className="objectiveRuleSummary">
              {vp
                ? `Complete an end condition or reach round ${roundLimit ?? "limit"}; then the highest Victory Point total wins. The completer earns +${vp.victoryConditionVp ?? 3} VP.`
                : `${modeLabel}. Complete any marked or listed victory condition to win immediately.`}
            </p>

            {encounterFields.length > 0 ? (
              <section className="objectiveGroup">
                <h3><MapPin aria-hidden size={15} /> Marked encounters</h3>
                <ul className="objectiveList">
                  {encounterFields.map((field) => {
                    const tile = adventure.tiles[field.tileInstanceId];
                    const location = locationDefinitions[field.location]?.name ?? field.location;
                    const guard = field.customGuardUnits?.length
                      ? `${field.customGuardUnits.length} specified guard card${field.customGuardUnits.length === 1 ? "" : "s"}`
                      : field.difficulty
                        ? `level ${field.difficulty} encounter`
                        : "marked encounter";
                    return (
                      <li key={field.spaceId}>
                        <Circle aria-hidden size={16} />
                        <span><strong>Defeat {location}</strong><small>{guard} · {tile?.group ?? "map"} tile · {field.spaceId}</small></span>
                        <b>ENDS</b>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {custom.length > 0 ? (
              <section className="objectiveGroup">
                <h3><Target aria-hidden size={15} /> Victory conditions</h3>
                <ul className="objectiveList">
                  {custom.map((condition, index) => {
                    const progress = customWinConditionProgress(state, viewerPlayerId, condition);
                    return (
                      <li className={progress.complete ? "complete" : undefined} key={`${condition.kind}-${index}`}>
                        {progress.complete ? <CheckCircle2 aria-hidden size={16} /> : <Circle aria-hidden size={16} />}
                        <span><strong>{describeCustomWinCondition(condition)}</strong><small>Your progress: {Math.min(progress.current, progress.target)} / {progress.target}</small></span>
                        <b>{progress.complete ? "DONE" : "WIN"}</b>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {vp?.objectives?.length ? (
              <section className="objectiveGroup">
                <h3><Award aria-hidden size={15} /> Bonus Victory Points</h3>
                <ul className="objectiveList">
                  {vp.objectives.map((objective, index) => {
                    const progress = victoryPointObjectiveProgress(state, viewerPlayerId, objective);
                    return (
                      <li className={progress.complete ? "complete" : undefined} key={`${objective.kind}-${index}`}>
                        {progress.complete ? <CheckCircle2 aria-hidden size={16} /> : <Circle aria-hidden size={16} />}
                        <span><strong>{describeVictoryPointObjective(objective)}</strong><small>Your progress: {Math.min(progress.current, progress.target)} / {progress.target}</small></span>
                        <b>+{objective.vp} VP</b>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Game-over Victory-Points scoring overlay — reads the `VP_SCORING` event and
 * shows the final per-player breakdown (winner first) with the winner crowned.
 * Rendered alongside the winner overlay at game end. Returns null with no event.
 * Offers Close (dismiss overlay) and Go to main menu.
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
          {onDismiss ? (
            <button
              aria-label="Close scoring window"
              className="vpScoringClose"
              onClick={onDismiss}
              type="button"
            >
              <X size={16} />
            </button>
          ) : null}
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
        <div className="vpScoringActions">
          {onDismiss ? (
            <button className="commandButton" onClick={onDismiss} type="button">
              Close
            </button>
          ) : null}
          <a className="commandButton primary" href="/menu">
            Go to main menu
          </a>
        </div>
      </div>
    </div>
  );
}
