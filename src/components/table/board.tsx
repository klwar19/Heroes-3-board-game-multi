"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronDown, ChevronUp, Crown, Mountain, ScrollText, Shield, Sparkles, Swords } from "lucide-react";
import { useState } from "react";
import {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  BATTLEFIELD_CELL_COUNT,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  getUnitAbilityDefinitions,
  isUnitAlive,
  sortUnitsForActivation,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { ARMY_UNIT_DRAG_TYPE } from "@/components/adventure/screen";
import { actionKey, formatEvent, isBoardTargetCardAction, sameCardSelection, unitName, type CardBoardAction } from "./utils";
import { useCardZoom } from "./zoom";

/**
 * Seat-relative orientation: your rows should sit nearest your hand. The
 * sandbox seats p1 in the top rows (flip for p1); adventure combats seat the
 * attacker in the bottom rows, so only the defender's view flips.
 */
function isBoardFlipped(state: GameState, viewerPlayerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return viewerPlayerId === "p1";
  }

  if (combat.context.kind === "sandbox") {
    return viewerPlayerId === "p1";
  }

  return viewerPlayerId === combat.defenderPlayerId;
}

export function BattlefieldBoard({
  state,
  viewerPlayerId,
  legalActions,
  selectedCardAction,
  flippedUnitIds,
  onAction,
  onInspect
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  selectedCardAction: CardBoardAction | null;
  /** Units that just turned to their Few side; plays a flip animation. */
  flippedUnitIds?: ReadonlySet<string>;
  onAction: (action: GameAction) => void;
  onInspect: (unitId: string) => void;
}) {
  const combat = state.combat;
  const flipped = isBoardFlipped(state, viewerPlayerId);
  const unitsByPosition = new Map<number, CombatUnitState>();
  const obstacles = new Set(combat?.obstacles ?? []);
  const moveActionsByDestination = new Map<number, GameAction>();
  const attackActionsByDefender = new Map<string, GameAction>();
  const cardActionsByTarget = new Map<string, GameAction>();
  const abilityTargetActions = new Map<string, GameAction>();

  if (combat) {
    for (const unit of Object.values(combat.units)) {
      if (isUnitAlive(unit)) {
        unitsByPosition.set(unit.position, unit);
      }
    }
  }

  for (const legal of legalActions) {
    if (legal.action.type === "MOVE_UNIT") {
      moveActionsByDestination.set(legal.action.destination, legal.action);
    }
    if (legal.action.type === "ATTACK_UNIT") {
      attackActionsByDefender.set(legal.action.defenderId, legal.action);
    }
    if (legal.action.type === "CHOOSE_ABILITY_TARGET") {
      abilityTargetActions.set(legal.action.targetUnitId, legal.action);
    }
    if (selectedCardAction && isBoardTargetCardAction(legal.action) && sameCardSelection(selectedCardAction, legal.action)) {
      cardActionsByTarget.set(legal.action.target.unitId, legal.action);
    }
  }

  // Drag-and-drop deployment: while it is the viewer's turn to place, the
  // two own rows accept army-unit drops (fresh placements and repositions).
  const setup = combat?.setup;
  const placing = Boolean(setup && setup.pendingPlayerIds[0] === viewerPlayerId);
  const ownRows = placing
    ? combat!.attackerPlayerId === viewerPlayerId
      ? new Set([...ATTACKER_FRONTLINE, ...ATTACKER_BACKLINE])
      : new Set([...DEFENDER_FRONTLINE, ...DEFENDER_BACKLINE])
    : new Set<number>();

  return (
    <div className={`boardFelt ${flipped ? "flipped" : ""}`} aria-label="Combat board">
      <div className="battlefield">
        {Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, index) => {
          const unit = unitsByPosition.get(index);
          const terrain = getBattlefieldTerrain(index);
          const isObstacle = obstacles.has(index);
          const moveAction = moveActionsByDestination.get(index);
          const attackAction = unit ? attackActionsByDefender.get(unit.id) : undefined;
          const cardAction = unit ? cardActionsByTarget.get(unit.id) : undefined;
          const abilityAction = unit ? abilityTargetActions.get(unit.id) : undefined;
          const isActive = Boolean(unit && combat?.activeUnitId === unit.id);
          const isFlipping = Boolean(unit && flippedUnitIds?.has(unit.id));
          const dropTarget = placing && ownRows.has(index) && !unit && !isObstacle;
          const className = `battleCell ${terrain} ${unit?.controllerId ?? ""} ${isActive ? "active" : ""} ${
            isObstacle ? "obstacle" : ""
          } ${moveAction && !selectedCardAction ? "moveTarget" : ""} ${
            attackAction && !selectedCardAction ? "attackTarget" : ""
          } ${cardAction ? "cardTarget" : ""} ${abilityAction ? "abilityTarget" : ""} ${dropTarget ? "dropTarget" : ""}`;
          const health = unit ? Math.max(0, unit.maxHealth - unit.damage) : 0;

          const dropProps = dropTarget
            ? {
                onDragOver: (event: React.DragEvent) => {
                  if (event.dataTransfer.types.includes(ARMY_UNIT_DRAG_TYPE)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                },
                onDrop: (event: React.DragEvent) => {
                  const armyUnitId = event.dataTransfer.getData(ARMY_UNIT_DRAG_TYPE);
                  if (armyUnitId) {
                    event.preventDefault();
                    onAction({ type: "PLACE_COMBAT_UNIT", playerId: viewerPlayerId, armyUnitId, position: index });
                  }
                }
              }
            : {};

          if (isObstacle) {
            return (
              <div
                aria-label={`Obstacle at ${getBattlefieldLabel(index)}: blocks ground and ranged movement`}
                className={className}
                key={index}
                title="Combat Obstacle — ground and ranged units must go around; flying units pass over"
              >
                <span className="obstacleMark">
                  <Mountain aria-hidden="true" size={26} />
                </span>
              </div>
            );
          }

          const content = unit ? (
            <article className={`boardCard ${unit.controllerId} ${isFlipping ? "flipping" : ""}`}>
              {unit.assets?.cardImage ? (
                <img
                  alt={unit.assets?.imageAlt ?? unit.cardName}
                  className="boardCardImage"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  src={unit.assets.cardImage}
                />
              ) : (
                <div className="boardCardImage cardFaceFallback">{unit.name}</div>
              )}
              <div className="boardCardHud">
                <strong>{unit.cardName}</strong>
                <span>
                  {health}/{unit.maxHealth} HP
                  {unit.defenseToken ? " +DEF" : ""}
                </span>
              </div>
              {isActive ? <span className="activeRing" aria-hidden="true" /> : null}
              {isFlipping ? <span className="flipBadge">Flipped to Few</span> : null}
            </article>
          ) : (
            <span className="emptyBoardMark" aria-hidden="true" />
          );

          // During deployment your placed units stay draggable to new spaces.
          const dragProps =
            placing && unit && unit.controllerId === viewerPlayerId && unit.armyUnitId
              ? {
                  draggable: true,
                  onDragStart: (event: React.DragEvent) => {
                    event.dataTransfer.setData(ARMY_UNIT_DRAG_TYPE, unit.armyUnitId as string);
                    event.dataTransfer.effectAllowed = "move";
                  }
                }
              : {};

          const interactiveAction = abilityAction ?? cardAction ?? (unit ? attackAction : moveAction);

          if (interactiveAction && (!selectedCardAction || cardAction)) {
            const label = abilityAction
              ? `Ability target: ${unit?.name}`
              : cardAction
                ? `Target ${unit?.name}`
                : unit
                  ? `Attack ${unit?.name}`
                  : `Move to ${getBattlefieldLabel(index)}`;
            return (
              <button
                aria-label={label}
                className={className}
                key={index}
                onClick={() => onAction(interactiveAction)}
                onMouseEnter={unit ? () => onInspect(unit.id) : undefined}
                title={label}
                type="button"
              >
                {content}
              </button>
            );
          }

          if (unit) {
            return (
              <button
                aria-label={`Inspect ${unit.name}`}
                className={className}
                key={index}
                onClick={() => onInspect(unit.id)}
                onMouseEnter={() => onInspect(unit.id)}
                title={`Inspect ${unit.name}`}
                type="button"
                {...dragProps}
              >
                {content}
              </button>
            );
          }

          return (
            <div
              aria-label={`${terrain} field ${getBattlefieldLabel(index)}${dropTarget ? " — drop a unit here" : ""}`}
              className={className}
              key={index}
              {...dropProps}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InitiativeRail({ state }: { state: GameState }) {
  const units = state.combat ? sortUnitsForActivation(state.combat) : [];

  return (
    <div className="initiativeRail" aria-label="Initiative order">
      <Swords aria-hidden="true" size={14} />
      {units.map((unit) => (
        <span
          className={`initChip ${unit.controllerId} ${state.combat?.activeUnitId === unit.id ? "active" : ""} ${
            unit.activatedThisRound ? "done" : ""
          }`}
          key={unit.id}
          title={`${unit.name} — initiative ${unit.initiative}${unit.activatedThisRound ? " (done)" : ""}`}
        >
          <strong>{unit.initiative}</strong>
          {unit.name}
        </span>
      ))}
      <span className="roundChip">Round {state.combat?.round ?? 0}</span>
    </div>
  );
}

export function InspectPanel({ state, unitId }: { state: GameState; unitId: string | null }) {
  const { zoomUnit } = useCardZoom();
  const unit = unitId ? state.combat?.units[unitId] : undefined;

  if (!unit) {
    return (
      <section className="inspectPanel empty" aria-label="Unit inspector">
        <span>Hover a unit to read its card — click it for a big view</span>
      </section>
    );
  }

  const health = Math.max(0, unit.maxHealth - unit.damage);
  const abilities = getUnitAbilityDefinitions(unit);

  return (
    <section className="inspectPanel" aria-label={`${unit.name} card`}>
      <button
        aria-label={`Read ${unit.cardName} at full size`}
        className="inspectZoom"
        onClick={() => zoomUnit(unit)}
        title="Click to enlarge"
        type="button"
      >
        {unit.assets?.cardImage ? (
          <img
            alt={unit.assets?.imageAlt ?? unit.cardName}
            className="inspectImage"
            loading="eager"
            referrerPolicy="no-referrer"
            src={unit.assets.cardImage}
          />
        ) : (
          <div className="inspectImage cardFaceFallback">{unit.cardName}</div>
        )}
      </button>
      <div className="inspectBody">
        <strong>{unit.cardName}</strong>
        <span className="inspectKind">
          {unit.grade} {unit.type} · initiative {unit.initiative}
        </span>
        <div className="inspectStats">
          <span title="Attack">⚔ {unit.attack}</span>
          <span title="Defense">
            <Shield aria-hidden="true" size={12} /> {unit.defense + (unit.defenseToken ? 1 : 0)}
          </span>
          <span title="Health">
            ♥ {health}/{unit.maxHealth}
          </span>
        </div>
        {abilities.length > 0 ? (
          <div className="inspectAbilities">
            {abilities.map((ability) => (
              <span
                className={ability.implementationStatus === "implemented" ? "implemented" : "pending"}
                key={ability.id}
                title={ability.text}
              >
                {ability.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function EffectsRail({
  state,
  legalActions,
  onAction
}: {
  state: GameState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const effectActions = legalActions.filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");

  if (state.activeEffects.length === 0 && effectActions.length === 0) {
    return null;
  }

  return (
    <section className="effectsRail" aria-label="Active effects">
      <header>Table effects</header>
      {state.activeEffects.map((effect) => (
        <div className="effectChip" key={effect.id} title={`${effect.name} (${effect.controllerId})`}>
          <span>{effect.name}</span>
          <small>
            {effect.target?.type === "unit" ? unitName(state, effect.target.unitId) : state.players[effect.controllerId]?.name}
          </small>
        </div>
      ))}
      {effectActions.map((legal) => (
        <button className="effectUse" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
          {legal.label}
        </button>
      ))}
    </section>
  );
}

const COMMAND_ACTION_TYPES = new Set<GameAction["type"]>([
  "DEFEND_UNIT",
  "END_ACTIVATION",
  "END_COMBAT_ROUND",
  "USE_UNIT_ABILITY",
  "COMPLETE_SIMULTANEOUS_TURN",
  "CONTINUE_NEUTRAL_COMBAT",
  "RETREAT_FROM_COMBAT",
  "BUILD_STRUCTURE",
  "MOVE_HERO",
  "END_TURN"
]);

function commandLabel(legal: LegalAction): string {
  const action = legal.action;
  switch (action.type) {
    case "DEFEND_UNIT":
      return "Defend";
    case "END_ACTIVATION":
      return "Hold position";
    case "END_COMBAT_ROUND":
      return "Next combat round";
    case "COMPLETE_SIMULTANEOUS_TURN":
      return "Ready";
    case "END_TURN":
      return "End turn";
    case "USE_UNIT_ABILITY":
      return legal.label;
    case "MOVE_HERO":
      return legal.label;
    case "BUILD_STRUCTURE":
      return `Build ${action.buildingId}`;
    default:
      return legal.label;
  }
}

export function CommandDock({
  state,
  viewerPlayerId,
  legalActions,
  onAction,
  onReset
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  onReset: () => void;
}) {
  const commands = legalActions.filter((legal) => COMMAND_ACTION_TYPES.has(legal.action.type));
  const activeUnitId = state.combat?.activeUnitId;
  const activeUnit = activeUnitId ? state.combat?.units[activeUnitId] : undefined;
  const outcome = state.combat?.outcome;
  const waitingOn =
    state.pendingChoice?.playerId ?? state.reactionWindow?.priorityPlayerId ?? state.activePlayerId;
  // A ranged unit that just fired may still take its 1-space step.
  const postShotMove = Boolean(
    activeUnit &&
      activeUnit.controllerId === viewerPlayerId &&
      activeUnit.attackedThisActivation &&
      !activeUnit.activatedThisRound &&
      activeUnit.type === "ranged"
  );
  const status = outcome
    ? `${state.players[outcome.winnerPlayerId]?.name ?? outcome.winnerPlayerId} wins`
    : waitingOn === viewerPlayerId
      ? activeUnit && activeUnit.controllerId === viewerPlayerId
        ? postShotMove
          ? `${activeUnit.name} fired — step 1 space or hold`
          : `${activeUnit.name} is active`
        : "Your move"
      : `Waiting for ${state.players[waitingOn]?.name ?? waitingOn}`;

  const player = state.players[viewerPlayerId];
  const spellLimit = 1 + (player?.combatStats.spellLimitBonusThisRound ?? 0);
  const spellsCast = player?.combatStats.spellsCastThisRound ?? 0;
  const crownsLeft = player ? player.limits.expertUses - player.combatStats.expertUsesSpentThisRound : 0;

  return (
    <div className="commandDock" aria-label="Commands">
      <span className="dockStatus">{status}</span>
      {state.combat && !outcome ? (
        <div className="dockLimits" aria-label="Per-round limits">
          <span
            className={spellsCast >= spellLimit ? "limitSpent" : ""}
            title={`One spell per combat round${spellLimit > 1 ? ` (+${spellLimit - 1} from Knowledge)` : ""}. Hero specialties never count against it.`}
          >
            <Sparkles aria-hidden="true" size={12} /> Spell {spellsCast}/{spellLimit}
          </span>
          <span title="Expert-effect crowns left this combat round">
            <Crown aria-hidden="true" size={12} /> {crownsLeft} crown{crownsLeft === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
      {commands.map((legal) => (
        <button className="commandButton" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
          {commandLabel(legal)}
        </button>
      ))}
      <button className="commandButton ghost" onClick={onReset} title="Reset this room" type="button">
        Reset table
      </button>
    </div>
  );
}

export function LogDrawer({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  const events = state.eventLog.slice(-30).reverse();
  const latest = events[0];

  return (
    <section className={`logDrawer ${open ? "open" : ""}`} aria-label="Game log">
      <button className="logToggle" onClick={() => setOpen(!open)} type="button">
        <ScrollText aria-hidden="true" size={14} />
        <span>{latest ? formatEvent(latest, state) : "Game log"}</span>
        {open ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronUp aria-hidden="true" size={14} />}
      </button>
      {open ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <span>{event.id}</span>
              {formatEvent(event, state)}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
