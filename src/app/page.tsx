"use client";

/* eslint-disable @next/next/no-img-element */

import {
  CircleOff,
  Crosshair,
  Eye,
  EyeOff,
  Footprints,
  RotateCcw,
  Shield,
  Sparkles,
  StepForward,
  Swords,
  Undo2
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  applyAction,
  BATTLEFIELD_CELL_COUNT,
  createInitialGameState,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  getLegalActions,
  getPlayerView,
  isUnitAlive,
  sampleCards,
  sortUnitsForActivation,
  type CardDefinition,
  type CombatUnitState,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PlayerVisibleState
} from "@/engine";

function getActionIcon(action: GameAction) {
  switch (action.type) {
    case "CAST_SPELL":
      return <Sparkles aria-hidden="true" size={16} />;
    case "ATTACK_UNIT":
      return <Crosshair aria-hidden="true" size={16} />;
    case "MOVE_UNIT":
      return <Footprints aria-hidden="true" size={16} />;
    case "DEFEND_UNIT":
      return <Shield aria-hidden="true" size={16} />;
    case "END_COMBAT_ROUND":
      return <StepForward aria-hidden="true" size={16} />;
    case "PLAY_REACTION":
      return <Undo2 aria-hidden="true" size={16} />;
    case "PASS_REACTION":
      return <CircleOff aria-hidden="true" size={16} />;
    case "END_TURN":
      return <StepForward aria-hidden="true" size={16} />;
  }
}

function unitName(state: GameState, unitId: string): string {
  return state.combat?.units[unitId]?.name ?? unitId;
}

function cardName(cardId: string): string {
  return sampleCards[cardId]?.name ?? cardId;
}

function formatEvent(event: GameEvent, state: GameState): string {
  switch (event.type) {
    case "GAME_CREATED":
      return event.message;
    case "COMBAT_ROUND_STARTED":
      return `Combat round ${event.round} started.`;
    case "UNIT_ACTIVATION_STARTED":
      return `${unitName(state, event.unitId)} activates.`;
    case "UNIT_ATTACK_DECLARED":
      return `${unitName(state, event.attackerId)} attacks ${unitName(state, event.defenderId)}.`;
    case "ATTACK_ROLLED":
      return `${event.isRetaliation ? "Retaliation" : "Attack"} roll ${event.roll >= 0 ? "+" : ""}${event.roll}: ${event.attackValue} vs ${event.defenseValue}, ${event.damage} damage.`;
    case "RETALIATION_ATTACKED":
      return `${unitName(state, event.attackerId)} retaliates against ${unitName(state, event.defenderId)}.`;
    case "UNIT_MOVED":
      return `${unitName(state, event.unitId)} moves from ${getBattlefieldLabel(event.from)} to ${getBattlefieldLabel(event.to)}.`;
    case "UNIT_DEFENDED":
      return `${unitName(state, event.unitId)} takes defense.`;
    case "UNIT_REMOVED":
      return `${unitName(state, event.unitId)} is removed.`;
    case "COMBAT_ROUND_ENDED":
      return `Combat round ${event.round} ends. Round ${event.nextRound} begins.`;
    case "COMBAT_ENDED":
      return `${state.players[event.winnerPlayerId]?.name ?? event.winnerPlayerId} wins the combat.`;
    case "TURN_ENDED":
      return `${event.playerId} ended turn. ${event.nextPlayerId} is active.`;
    case "SPELL_CAST_STARTED":
      return `${event.playerId} casts ${cardName(event.spellCardId)} at ${unitName(state, event.target.unitId)}.`;
    case "REACTION_WINDOW_OPENED":
      return `Reaction priority passes to ${event.priorityPlayerId}.`;
    case "REACTION_PASSED":
      return `${event.playerId} passes.`;
    case "REACTION_WINDOW_CLOSED":
      return `Reaction window closes by ${event.reason}.`;
    case "CARD_PLAYED":
      return `${event.playerId} plays ${cardName(event.cardId)}.`;
    case "SPELL_CAST_CANCELLED":
      return `${event.cancelledByPlayerId} cancels ${cardName(event.spellCardId)} with ${cardName(event.cancelledByCardId)}.`;
    case "DAMAGE_ASSIGNED":
      return `${event.amount} ${event.damageKind} damage assigned to ${unitName(state, event.target.unitId)}.`;
    case "SPELL_CAST_RESOLVED":
      return `${cardName(event.spellCardId)} resolves.`;
  }
}

function describeCard(card: CardDefinition): string {
  if (card.effect.type === "DEAL_DAMAGE") {
    return `${card.effect.amount} ${card.effect.damageKind} damage at ${card.power ?? 0} power`;
  }

  if (card.effect.type === "CANCEL_SPELL") {
    return `Ignore spell effect up to ${card.effect.maxPower ?? "any"} power`;
  }

  return card.kind;
}

function actionKey(action: GameAction): string {
  return JSON.stringify(action);
}

function actionLabel(action: GameAction, state: GameState): string {
  switch (action.type) {
    case "ATTACK_UNIT":
      return `Attack ${unitName(state, action.defenderId)}`;
    case "MOVE_UNIT":
      return `Move to ${getBattlefieldLabel(action.destination)}`;
    case "DEFEND_UNIT":
      return "Defend";
    case "CAST_SPELL":
      return `${cardName(action.cardId)} -> ${unitName(state, action.target.unitId)}`;
    case "PLAY_REACTION":
      return cardName(action.cardId);
    case "PASS_REACTION":
      return "Pass";
    case "END_COMBAT_ROUND":
      return "Next Round";
    case "END_TURN":
      return "End Turn";
  }
}

function CardImage({
  src,
  alt,
  className
}: {
  src?: string;
  alt: string;
  className: string;
}) {
  if (!src) {
    return <div className={`${className} cardImageFallback`}>{alt}</div>;
  }

  return <img alt={alt} className={className} loading="eager" referrerPolicy="no-referrer" src={src} />;
}

function PlayerHand({
  view,
  playerId
}: {
  view: PlayerVisibleState;
  playerId: "p1" | "p2";
}) {
  const player = view.players[playerId];
  const isViewer = view.viewerPlayerId === playerId;

  return (
    <section className="panel handPanel" aria-label={`${player.name} hand`}>
      <div className="panelHeader">
        <h2>{player.name}</h2>
        <span>{isViewer ? `${player.hand.length} cards` : `${player.handCount} hidden`}</span>
      </div>
      <div className="handCards">
        {!isViewer ? (
          <div className="emptySlot hiddenHand">
            <EyeOff aria-hidden="true" size={18} />
            <span>{player.handCount} hidden cards</span>
          </div>
        ) : player.hand.length === 0 ? (
          <div className="emptySlot">Empty hand</div>
        ) : (
          player.hand.map((cardId) => {
            const card = sampleCards[cardId];
            return (
              <article className="handCard" key={cardId}>
                <CardImage
                  alt={card?.assets?.imageAlt ?? cardId}
                  className="handCardImage"
                  src={card?.assets?.cardImage}
                />
                <div>
                  <strong>{card?.name ?? cardId}</strong>
                  <span>{card ? describeCard(card) : cardId}</span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ViewAsControl({
  state,
  viewerPlayerId,
  onChange
}: {
  state: GameState;
  viewerPlayerId: "p1" | "p2";
  onChange: (playerId: "p1" | "p2") => void;
}) {
  return (
    <section className="panel viewPanel" aria-label="Player view">
      <div className="panelHeader">
        <h2>View As</h2>
        <Eye aria-hidden="true" size={18} />
      </div>
      <div className="viewToggle">
        {(["p1", "p2"] as const).map((playerId) => (
          <button
            aria-pressed={viewerPlayerId === playerId}
            className={`viewButton ${viewerPlayerId === playerId ? "selected" : ""}`}
            key={playerId}
            onClick={() => onChange(playerId)}
            title={`View as ${state.players[playerId].name}`}
            type="button"
          >
            <Eye aria-hidden="true" size={15} />
            <span>{state.players[playerId].name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function UnitReferenceCard({
  unit,
  active
}: {
  unit: CombatUnitState;
  active: boolean;
}) {
  const health = Math.max(0, unit.maxHealth - unit.damage);

  return (
    <article className={`unitReference ${unit.controllerId} ${active ? "active" : ""}`}>
      <CardImage
        alt={unit.assets?.imageAlt ?? unit.cardName}
        className="unitReferenceImage"
        src={unit.assets?.cardImage}
      />
      <div className="unitReferenceBody">
        <div className="unitTitle">
          <strong>{unit.cardName}</strong>
          <span>{unit.type}</span>
        </div>
        <div className="healthBar" aria-label={`${unit.name} health`}>
          <span style={{ width: `${(health / unit.maxHealth) * 100}%` }} />
        </div>
        <dl className="unitStats">
          <div>
            <dt>HP</dt>
            <dd>
              {health}/{unit.maxHealth}
            </dd>
          </div>
          <div>
            <dt>ATK</dt>
            <dd>{unit.attack}</dd>
          </div>
          <div>
            <dt>DEF</dt>
            <dd>{unit.defense + (unit.defenseToken ? 1 : 0)}</dd>
          </div>
          <div>
            <dt>INI</dt>
            <dd>{unit.initiative}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function Battlefield({
  state,
  legalActions,
  onAction
}: {
  state: GameState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const combat = state.combat;
  const unitsByPosition = new Map<number, CombatUnitState>();
  const moveActionsByDestination = new Map<number, GameAction>();
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
  }

  return (
    <section className="panel battlefieldPanel" aria-label="Combat board">
      <div className="panelHeader">
        <h2>Combat Board</h2>
        <span>Round {combat?.round ?? 0}</span>
      </div>
      <div className="battlefieldFrame">
        <div className="battlefield">
          {Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, index) => {
            const unit = unitsByPosition.get(index);
            const terrain = getBattlefieldTerrain(index);
            const moveAction = moveActionsByDestination.get(index);
            const isActive = Boolean(unit && combat?.activeUnitId === unit.id);
            const className = `battleCell ${terrain} ${unit?.controllerId ?? ""} ${
              isActive ? "active" : ""
            } ${moveAction ? "moveTarget" : ""}`;
            const content = unit ? (
              <article className={`boardCard ${unit.controllerId}`}>
                <CardImage
                  alt={unit.assets?.imageAlt ?? unit.cardName}
                  className="boardCardImage"
                  src={unit.assets?.cardImage}
                />
                <div className="boardCardHud">
                  <strong>{unit.name}</strong>
                  <span>
                    {Math.max(0, unit.maxHealth - unit.damage)}/{unit.maxHealth} HP
                  </span>
                </div>
              </article>
            ) : (
              <span className="emptyBoardMark" aria-hidden="true" />
            );

            if (moveAction && !unit) {
              return (
                <button
                  aria-label={`Move active unit to ${getBattlefieldLabel(index)}`}
                  className={className}
                  key={index}
                  onClick={() => onAction(moveAction)}
                  title={`Move to ${getBattlefieldLabel(index)}`}
                  type="button"
                >
                  {content}
                </button>
              );
            }

            return (
              <div aria-label={`${terrain} battlefield cell ${getBattlefieldLabel(index)}`} className={className} key={index}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function InitiativePanel({ state }: { state: GameState }) {
  const units = state.combat ? sortUnitsForActivation(state.combat) : [];

  return (
    <section className="panel initiativePanel" aria-label="Initiative">
      <div className="panelHeader">
        <h2>Initiative</h2>
        <Swords aria-hidden="true" size={18} />
      </div>
      <ol className="initiativeList">
        {units.map((unit) => (
          <li className={state.combat?.activeUnitId === unit.id ? "active" : ""} key={unit.id}>
            <span>{unit.initiative}</span>
            <strong>{unit.name}</strong>
            <small>{unit.activatedThisRound ? "done" : unit.controllerId}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActionPanel({
  state,
  viewerPlayerId,
  currentActorId,
  legalActions,
  onAction,
  onReset
}: {
  state: GameState;
  viewerPlayerId: "p1" | "p2";
  currentActorId: string;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  onReset: () => void;
}) {
  const commandActions = legalActions.filter((legal) => legal.action.type !== "MOVE_UNIT");
  const currentActorName = state.players[currentActorId]?.name ?? currentActorId;
  const status =
    state.phase === "game-over"
      ? "Battle resolved"
      : viewerPlayerId === currentActorId
        ? "Your command"
        : `Waiting for ${currentActorName}`;

  return (
    <section className="panel actionPanel" aria-label="Legal actions">
      <div className="panelHeader">
        <h2>Actions</h2>
        <span>{status}</span>
      </div>
      <div className="actionGrid">
        {commandActions.length === 0 ? <div className="emptyActions">{status}</div> : null}
        {commandActions.map((legal) => (
          <button
            className="actionButton"
            key={actionKey(legal.action)}
            onClick={() => onAction(legal.action)}
            title={legal.reason ?? legal.label}
            type="button"
          >
            {getActionIcon(legal.action)}
            <span>{actionLabel(legal.action, state)}</span>
          </button>
        ))}
        <button className="actionButton secondary" onClick={onReset} title="Reset combat" type="button">
          <RotateCcw aria-hidden="true" size={16} />
          <span>Reset</span>
        </button>
      </div>
    </section>
  );
}

function UnitGallery({ state }: { state: GameState }) {
  const units = state.combat ? Object.values(state.combat.units) : [];

  return (
    <section className="panel unitGallery" aria-label="Unit cards">
      <div className="panelHeader">
        <h2>Unit Cards</h2>
        <span>wiki references</span>
      </div>
      <div className="unitReferenceGrid">
        {units.map((unit) => (
          <UnitReferenceCard active={state.combat?.activeUnitId === unit.id} key={unit.id} unit={unit} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [state, setState] = useState(() => createInitialGameState());
  const [viewerPlayerId, setViewerPlayerId] = useState<"p1" | "p2">("p1");
  const [errors, setErrors] = useState<string[]>([]);
  const currentActorId = state.reactionWindow?.priorityPlayerId ?? state.activePlayerId;
  const playerView = useMemo(() => getPlayerView(state, viewerPlayerId), [state, viewerPlayerId]);
  const legalActions = useMemo(() => getLegalActions(state, viewerPlayerId), [viewerPlayerId, state]);
  const latestEvents = state.eventLog.slice(-10).reverse();
  const outcome = state.combat?.outcome ?? null;

  const submitAction = (action: GameAction) => {
    const result = applyAction(state, action);
    setErrors(result.errors.map((error) => error.message));

    if (result.errors.length === 0) {
      setState(result.state);
    }
  };

  return (
    <main className="workspace">
      <section className="combatHeader" aria-label="Game status">
        <div>
          <span>Phase</span>
          <strong>{state.phase}</strong>
        </div>
        <div>
          <span>Active Unit</span>
          <strong>
            {outcome
              ? "combat complete"
              : state.combat?.activeUnitId
                ? unitName(state, state.combat.activeUnitId)
                : "round end"}
          </strong>
        </div>
        <div>
          <span>Priority</span>
          <strong>{state.priorityPlayerId ? state.players[state.priorityPlayerId]?.name : "none"}</strong>
        </div>
        <div>
          <span>{outcome ? "Winner" : "Attack Die"}</span>
          <strong>
            {outcome
              ? state.players[outcome.winnerPlayerId]?.name
              : (state.combat?.attackDie[state.combat.attackDieIndex % state.combat.attackDie.length] ?? 0)}
          </strong>
        </div>
      </section>

      {state.reactionWindow ? (
        <section className="reactionBanner" aria-label="Reaction window">
          <Shield aria-hidden="true" size={18} />
          <strong>Reaction Window</strong>
          <span>{formatEvent(state.reactionWindow.triggerEvent, state)}</span>
        </section>
      ) : null}

      {errors.length > 0 ? (
        <section className="errorBanner" aria-label="Rules errors">
          {errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
        </section>
      ) : null}

      <div className="tableGrid">
        <Battlefield legalActions={legalActions} onAction={submitAction} state={state} />
        <div className="sideStack">
          <ViewAsControl onChange={setViewerPlayerId} state={state} viewerPlayerId={viewerPlayerId} />
          <ActionPanel
            currentActorId={currentActorId}
            legalActions={legalActions}
            onAction={submitAction}
            onReset={() => {
              setState(createInitialGameState());
              setErrors([]);
            }}
            state={state}
            viewerPlayerId={viewerPlayerId}
          />
          <InitiativePanel state={state} />
        </div>
        <UnitGallery state={state} />
        <div className="handGrid">
          <PlayerHand playerId="p1" view={playerView} />
          <PlayerHand playerId="p2" view={playerView} />
        </div>
        <section className="panel logPanel" aria-label="Rules log">
          <div className="panelHeader">
            <h2>Rules Log</h2>
            <Swords aria-hidden="true" size={18} />
          </div>
          <ol>
            {latestEvents.map((event) => (
              <li key={event.id}>
                <span>{event.id}</span>
                {formatEvent(event, state)}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
