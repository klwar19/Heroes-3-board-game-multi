"use client";

/* eslint-disable @next/next/no-img-element */

import {
  CircleOff,
  Crosshair,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Footprints,
  Hand,
  Hammer,
  RotateCcw,
  Shield,
  Sparkles,
  StepForward,
  Swords,
  Undo2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ATTACK_DIE_FACES,
  BATTLEFIELD_CELL_COUNT,
  createInitialGameState,
  describeCardEffect,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  getLegalActions,
  getPlayerView,
  getUnitAbilityDefinitions,
  isUnitAlive,
  sampleCards,
  sortUnitsForActivation,
  type BuildingEffectDefinition,
  type CardDefinition,
  type CombatUnitState,
  type EngineResult,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState,
  type ResourceCost,
  type ResourceKind,
  type TargetRef
} from "@/engine";

function getActionIcon(action: GameAction) {
  switch (action.type) {
    case "CAST_SPELL":
      return <Sparkles aria-hidden="true" size={16} />;
    case "PLAY_CARD":
      return <Sparkles aria-hidden="true" size={16} />;
    case "ATTACK_UNIT":
      return <Crosshair aria-hidden="true" size={16} />;
    case "MOVE_AND_ATTACK_UNIT":
      return <Swords aria-hidden="true" size={16} />;
    case "MOVE_UNIT":
      return <Footprints aria-hidden="true" size={16} />;
    case "USE_UNIT_ABILITY":
      return <Hand aria-hidden="true" size={16} />;
    case "USE_ACTIVE_EFFECT":
      return <Sparkles aria-hidden="true" size={16} />;
    case "DEFEND_UNIT":
      return <Shield aria-hidden="true" size={16} />;
    case "END_ACTIVATION":
      return <Hand aria-hidden="true" size={16} />;
    case "END_COMBAT_ROUND":
      return <StepForward aria-hidden="true" size={16} />;
    case "BUILD_STRUCTURE":
      return <Hammer aria-hidden="true" size={16} />;
    case "COMPLETE_SIMULTANEOUS_TURN":
      return <StepForward aria-hidden="true" size={16} />;
    case "REROLL_PENDING_CHOICE":
      return <Dices aria-hidden="true" size={16} />;
    case "CHOOSE_PENDING_ROLL":
      return <Dices aria-hidden="true" size={16} />;
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

function targetName(state: GameState, target: TargetRef): string {
  return target.type === "unit" ? unitName(state, target.unitId) : "no target";
}

function cardName(cardId: string): string {
  return sampleCards[cardId]?.name ?? cardId;
}

function titleCase(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCardMetaLabels(card: CardDefinition): string[] {
  const labels = [titleCase(card.kind)];

  if (card.kind === "spell") {
    if (card.spellLevel) {
      labels.push(`${titleCase(card.spellLevel)} spell`);
    }

    if (card.spellSchools?.length) {
      labels.push(card.spellSchools.map(titleCase).join("/"));
    }
  }

  if (card.kind === "artifact" && card.artifactTier) {
    labels.push(`${titleCase(card.artifactTier)} artifact`);
  }

  if (card.kind === "statistic" && card.statisticType) {
    labels.push(titleCase(card.statisticType));
  }

  if (card.kind === "ability" && card.abilityClass) {
    labels.push(titleCase(card.abilityClass));
  }

  labels.push(titleCase(card.timing));
  return Array.from(new Set(labels));
}

function formatResourceName(resource: ResourceKind): string {
  if (resource === "buildingMaterials") {
    return "materials";
  }

  return resource;
}

function formatCost(cost: ResourceCost): string {
  const parts = (Object.entries(cost) as [ResourceKind, number][])
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${formatResourceName(resource)}`);

  return parts.length > 0 ? parts.join(", ") : "free";
}

function formatBuildingEffect(effect: BuildingEffectDefinition): string {
  if (effect.type === "GAIN_RESOURCE") {
    return `gain ${effect.amount} ${formatResourceName(effect.resource)}`;
  }

  if (effect.type === "ADD_EXPERT_USE_LIMIT") {
    return `expert limit +${effect.amount}`;
  }

  return "building effect";
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
      return `${unitName(state, event.attackerId)} ${event.isRetaliation ? "retaliates against" : "attacks"} ${unitName(state, event.defenderId)} (${event.attackKind}, ${event.rollMode}).`;
    case "ATTACK_ROLLED":
      return `${event.isRetaliation ? "Retaliation" : "Attack"} roll ${event.rolls.map((roll) => `${roll >= 0 ? "+" : ""}${roll}`).join("/")} -> ${event.roll >= 0 ? "+" : ""}${event.roll}: ${event.attackValue} vs ${event.defenseValue}, ${event.damage} damage.`;
    case "PENDING_CHOICE_CREATED":
      return event.message;
    case "ATTACK_REROLLED":
      return `${event.playerId} rerolls ${event.rolls.map((roll) => `${roll >= 0 ? "+" : ""}${roll}`).join("/")} -> ${event.roll >= 0 ? "+" : ""}${event.roll}.`;
    case "PENDING_CHOICE_RESOLVED":
      return `${event.playerId} chooses roll option ${event.selectedIndex + 1}.`;
    case "RETALIATION_ATTACKED":
      return `${unitName(state, event.attackerId)} retaliates against ${unitName(state, event.defenderId)}.`;
    case "UNIT_MOVED":
      return `${unitName(state, event.unitId)} moves from ${getBattlefieldLabel(event.from)} to ${getBattlefieldLabel(event.to)}.`;
    case "UNIT_DEFENDED":
      return `${unitName(state, event.unitId)} takes defense.`;
    case "UNIT_ACTIVATION_ENDED":
      return `${unitName(state, event.unitId)} holds position.`;
    case "UNIT_REMOVED":
      return `${unitName(state, event.unitId)} is removed.`;
    case "COMBAT_ROUND_ENDED":
      return `Combat round ${event.round} ends. Round ${event.nextRound} begins.`;
    case "COMBAT_ENDED":
      return `${state.players[event.winnerPlayerId]?.name ?? event.winnerPlayerId} wins the combat.`;
    case "TURN_ENDED":
      return `${event.playerId} ended turn. ${event.nextPlayerId} is active.`;
    case "SPELL_CAST_STARTED":
      return `${event.playerId} casts ${cardName(event.spellCardId)} at ${targetName(state, event.target)}.`;
    case "REACTION_WINDOW_OPENED":
      return `Reaction priority passes to ${event.priorityPlayerId}.`;
    case "REACTION_PASSED":
      return `${event.playerId} passes.`;
    case "REACTION_WINDOW_CLOSED":
      return `Reaction window closes by ${event.reason}.`;
    case "CARD_PLAYED":
      return `${event.playerId} plays ${cardName(event.cardId)}${event.mode === "expert" ? " as expert" : ""}${event.effectAmount ? ` for +${event.effectAmount}` : ""}.`;
    case "SPELL_CAST_CANCELLED":
      return `${event.cancelledByPlayerId} cancels ${cardName(event.spellCardId)} with ${cardName(event.cancelledByCardId)}.`;
    case "DAMAGE_ASSIGNED":
      return `${event.amount} ${event.damageKind} damage assigned to ${targetName(state, event.target)}.`;
    case "DAMAGE_HEALED":
      return `${event.amount} damage removed from ${targetName(state, event.target)}.`;
    case "ACTIVE_EFFECTS_REMOVED":
      return `${event.effectIds.length} effect${event.effectIds.length === 1 ? "" : "s"} removed from ${targetName(state, event.target)}.`;
    case "SPELL_CAST_RESOLVED":
      return `${cardName(event.spellCardId)} resolves at power ${event.power}.`;
    case "UNIT_ABILITY_TRIGGERED":
      return event.message;
    case "STRUCTURE_BUILT":
      return `${state.players[event.playerId]?.name ?? event.playerId} builds ${event.buildingId} in ${event.townId} for ${formatCost(event.cost)}.`;
    case "BUILDING_EFFECT_APPLIED":
      return `${event.buildingId} effect: ${formatBuildingEffect(event.effect)}.`;
    case "ACTIVE_EFFECT_CREATED":
      return `${event.name} is active.`;
    case "ACTIVE_EFFECT_USED":
      return `${event.playerId} uses ${event.effectId} on ${targetName(state, event.target)}.`;
    case "ACTIVE_EFFECT_EXPIRED":
      return `${event.effectId} expires by ${event.reason}.`;
    case "SIMULTANEOUS_TURN_COMPLETED":
      return `${state.players[event.playerId]?.name ?? event.playerId} completes their simultaneous turn.`;
    case "ORDERED_TURNS_STARTED":
      return `Ordered turns begin with ${state.players[event.activePlayerId]?.name ?? event.activePlayerId}.`;
  }
}

function actionKey(action: GameAction): string {
  return JSON.stringify(action);
}

type CardLegalAction = LegalAction & {
  action: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_REACTION" | "PLAY_CARD" }>;
};

function isCardLegalAction(legal: LegalAction): legal is CardLegalAction {
  return legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD";
}

type BoardTargetCardAction = Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> & {
  target: { type: "unit"; unitId: string };
};

function isBoardTargetCardAction(action: GameAction): action is BoardTargetCardAction {
  return (
    (action.type === "CAST_SPELL" || action.type === "PLAY_CARD") &&
    Boolean(action.target && action.target.type === "unit")
  );
}

function cardSelectionKey(action: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }>): string {
  return JSON.stringify({
    type: action.type,
    playerId: action.playerId,
    cardId: action.cardId,
    mode: "mode" in action ? (action.mode ?? "basic") : "basic"
  });
}

function sameCardSelection(
  selected: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> | null,
  action: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }>
): boolean {
  return Boolean(selected && cardSelectionKey(selected) === cardSelectionKey(action));
}

function actionLabel(action: GameAction, state: GameState): string {
  switch (action.type) {
    case "ATTACK_UNIT":
      return `Attack ${unitName(state, action.defenderId)}`;
    case "MOVE_AND_ATTACK_UNIT":
      return `Move ${getBattlefieldLabel(action.destination)} + attack ${unitName(state, action.defenderId)}`;
    case "MOVE_UNIT":
      return `Move to ${getBattlefieldLabel(action.destination)}`;
    case "DEFEND_UNIT":
      return "Defend";
    case "END_ACTIVATION":
      return "Hold Position";
    case "CAST_SPELL":
      return `${cardName(action.cardId)} -> ${targetName(state, action.target)}`;
    case "PLAY_CARD":
      return `${cardName(action.cardId)}${action.target ? ` -> ${targetName(state, action.target)}` : ""}`;
    case "USE_UNIT_ABILITY":
      return `${unitName(state, action.unitId)} ability -> ${targetName(state, action.target)}`;
    case "USE_ACTIVE_EFFECT":
      return `Use effect -> ${targetName(state, action.target)}`;
    case "REROLL_PENDING_CHOICE":
      return "Reroll";
    case "CHOOSE_PENDING_ROLL":
      return `Choose roll ${action.candidateIndex + 1}`;
    case "PLAY_REACTION":
      return `${cardName(action.cardId)}${action.mode === "expert" ? " Expert" : ""}`;
    case "PASS_REACTION":
      return state.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED" ? "Normal attack" : "Pass";
    case "BUILD_STRUCTURE":
      return `Build ${action.buildingId}`;
    case "COMPLETE_SIMULTANEOUS_TURN":
      return "Ready";
    case "END_COMBAT_ROUND":
      return "Next Round";
    case "END_TURN":
      return "End Turn";
  }
}

function cardActionLabel(action: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_REACTION" | "PLAY_CARD" }>, state: GameState): string {
  if (action.type === "CAST_SPELL") {
    return action.target.type === "unit" ? `Target ${targetName(state, action.target)}` : "Use";
  }

  if (action.type === "PLAY_CARD") {
    return action.target?.type === "unit" ? `Target ${targetName(state, action.target)}` : action.mode === "expert" ? "Use expert" : "Use";
  }

  return action.mode === "expert" ? "Use expert" : "Use";
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
  playerId,
  state,
  legalActions,
  selectedCardAction,
  onSelectCardAction,
  onAction
}: {
  view: PlayerVisibleState;
  playerId: PlayerId;
  state: GameState;
  legalActions: LegalAction[];
  selectedCardAction: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> | null;
  onSelectCardAction: (action: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> | null) => void;
  onAction: (action: GameAction) => void;
}) {
  const player = view.players[playerId];
  if (!player) {
    return null;
  }

  const isViewer = view.viewerPlayerId === playerId;
  const legalCardActions = legalActions
    .filter(isCardLegalAction)
    .filter((legal) => player.hand.includes(legal.action.cardId));

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
            const metaLabels = card ? getCardMetaLabels(card) : [];
            const cardActions = legalCardActions.filter((legal) => legal.action.cardId === cardId);
            const boardTargetActions = cardActions
              .map((legal) => legal.action)
              .filter(isBoardTargetCardAction);
            const boardTargetSelections = Array.from(
              new Map(boardTargetActions.map((action) => [cardSelectionKey(action), action])).values()
            );
            const immediateActions = cardActions.filter((legal) => !isBoardTargetCardAction(legal.action));
            const isSelected = boardTargetSelections.some((action) => sameCardSelection(selectedCardAction, action));
            return (
              <article className={`handCard ${cardActions.length > 0 ? "playable" : ""} ${isSelected ? "selected" : ""}`} key={cardId}>
                <CardImage
                  alt={card?.assets?.imageAlt ?? cardId}
                  className="handCardImage"
                  src={card?.assets?.cardImage}
                />
                <div>
                  <div className="handCardTitle">
                    <strong>{card?.name ?? cardId}</strong>
                    <small>{card?.timing ?? "card"}</small>
                  </div>
                  {metaLabels.length > 0 ? (
                    <div className="cardMeta" aria-label={`${card?.name ?? cardId} categories`}>
                      {metaLabels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  ) : null}
                  <span>{card ? describeCardEffect(card) : cardId}</span>
                  {cardActions.length > 0 ? (
                    <div className="cardActions">
                      {boardTargetSelections.map((action) => (
                        <button
                          className="cardUseButton"
                          key={cardSelectionKey(action)}
                          onClick={() => onSelectCardAction(sameCardSelection(selectedCardAction, action) ? null : action)}
                          title={`Select ${card?.name ?? cardId}, then click a highlighted unit`}
                          type="button"
                        >
                          {getActionIcon(action)}
                          <span>
                            {sameCardSelection(selectedCardAction, action)
                              ? "Selected"
                              : "mode" in action && action.mode === "expert"
                                ? "Select expert"
                                : "Select target"}
                          </span>
                        </button>
                      ))}
                      {immediateActions.map((legal) => (
                        <button
                          className="cardUseButton"
                          key={actionKey(legal.action)}
                          onClick={() => onAction(legal.action)}
                          title={legal.label}
                          type="button"
                        >
                          {getActionIcon(legal.action)}
                          <span>{cardActionLabel(legal.action, state)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <small className="cardTiming">No legal timing</small>
                  )}
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
  viewerPlayerId: PlayerId;
  onChange: (playerId: PlayerId) => void;
}) {
  return (
    <section className="panel viewPanel" aria-label="Player view">
      <div className="panelHeader">
        <h2>View As</h2>
        <Eye aria-hidden="true" size={18} />
      </div>
      <div className="viewToggle">
        {state.turnOrder.map((playerId) => (
          <button
            aria-pressed={viewerPlayerId === playerId}
            className={`viewButton ${viewerPlayerId === playerId ? "selected" : ""}`}
            key={playerId}
            onClick={() => onChange(playerId)}
            title={`View as ${state.players[playerId]?.name ?? playerId}`}
            type="button"
          >
            <Eye aria-hidden="true" size={15} />
            <span>{state.players[playerId]?.name ?? playerId}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TurnPanel({ state }: { state: GameState }) {
  return (
    <section className="panel turnPanel" aria-label="Turn order">
      <div className="panelHeader">
        <h2>Seats</h2>
        <Hand aria-hidden="true" size={18} />
      </div>
      <div className="seatList">
        {state.turnOrder.map((playerId) => {
          const player = state.players[playerId];
          const spellLimit = 1 + player.combatStats.spellLimitBonusThisRound;

          return (
            <article className={state.activePlayerId === playerId ? "active" : ""} key={playerId}>
              <strong>{player.name}</strong>
              <div>
                <span>{player.hand.length} hand</span>
                <span>
                  {player.combatStats.spellsCastThisRound}/{spellLimit} spells
                </span>
                <span className="metricWithIcon">
                  <Crown aria-hidden="true" size={12} />
                  {player.combatStats.expertUsesSpentThisRound}/{player.limits.expertUses} crowns
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatDieFace(face: number): string {
  return `${face >= 0 ? "+" : ""}${face}`;
}

function DicePanel({ state }: { state: GameState }) {
  const combat = state.combat;
  const lastRoll = [...state.eventLog]
    .reverse()
    .find((event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED");
  const [animatedRolls, setAnimatedRolls] = useState<number[]>(lastRoll?.rolls ?? []);
  const [isRolling, setIsRolling] = useState(false);
  const dieFaces = combat?.dice.faces.length ? combat.dice.faces : [...ATTACK_DIE_FACES];
  const visibleRolls = lastRoll ? (isRolling ? animatedRolls : lastRoll.rolls) : [];
  const visibleSelectedRoll = lastRoll
    ? isRolling
      ? (animatedRolls[0] ?? lastRoll.roll)
      : lastRoll.roll
    : null;

  useEffect(() => {
    if (!lastRoll) {
      return;
    }

    const cycle = [-1, 0, 1, 0];
    let frame = 0;
    const timeoutId = window.setTimeout(() => {
      setIsRolling(true);
      setAnimatedRolls(lastRoll.rolls.map((_, index) => cycle[index % cycle.length] ?? 0));
    }, 0);

    const intervalId = window.setInterval(() => {
      frame += 1;
      setAnimatedRolls(lastRoll.rolls.map((_, index) => cycle[(frame + index) % cycle.length] ?? 0));

      if (frame >= 9) {
        window.clearInterval(intervalId);
        setAnimatedRolls(lastRoll.rolls);
        setIsRolling(false);
      }
    }, 64);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [lastRoll]);

  return (
    <section className="panel dicePanel" aria-label="Attack dice">
      <div className="panelHeader">
        <h2>Dice</h2>
        <Dices aria-hidden="true" size={18} />
      </div>
      <div className="diceAnimation" aria-live="polite">
        <div className="diceTrack">
          {visibleRolls.length > 0 ? (
            visibleRolls.map((roll, index) => (
              <span className={`die ${isRolling ? "rolling" : ""}`} key={`${lastRoll?.id ?? "roll"}-${index}`}>
                {roll >= 0 ? `+${roll}` : roll}
              </span>
            ))
          ) : (
            <span className="die empty">-</span>
          )}
        </div>
        <div className="diceResult">
          <span>result</span>
          <strong>{visibleSelectedRoll === null ? "-" : visibleSelectedRoll >= 0 ? `+${visibleSelectedRoll}` : visibleSelectedRoll}</strong>
        </div>
      </div>
      <div className="diceRows">
        <div>
          <span>Die faces</span>
          <strong>{dieFaces.map(formatDieFace).join("  ")}</strong>
        </div>
        <div>
          <span>Last</span>
          <strong>
            {lastRoll
              ? `${lastRoll.rolls.map(formatDieFace).join("/")} -> ${formatDieFace(lastRoll.roll)}`
              : "none"}
          </strong>
        </div>
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
  const abilities = getUnitAbilityDefinitions(unit);

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
          <span>
            {unit.grade} {unit.type}
          </span>
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
        {abilities.length > 0 ? (
          <div className="abilityList" aria-label={`${unit.name} abilities`}>
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
    </article>
  );
}

function Battlefield({
  state,
  legalActions,
  selectedCardAction,
  onAction
}: {
  state: GameState;
  legalActions: LegalAction[];
  selectedCardAction: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> | null;
  onAction: (action: GameAction) => void;
}) {
  const combat = state.combat;
  const unitsByPosition = new Map<number, CombatUnitState>();
  const moveActionsByDestination = new Map<number, GameAction>();
  const attackActionsByDefender = new Map<string, GameAction>();
  const cardActionsByTarget = new Map<string, GameAction>();
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
    if (selectedCardAction && isBoardTargetCardAction(legal.action) && sameCardSelection(selectedCardAction, legal.action)) {
      cardActionsByTarget.set(legal.action.target.unitId, legal.action);
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
            const attackAction = unit ? attackActionsByDefender.get(unit.id) : undefined;
            const cardAction = unit ? cardActionsByTarget.get(unit.id) : undefined;
            const isActive = Boolean(unit && combat?.activeUnitId === unit.id);
            const className = `battleCell ${terrain} ${unit?.controllerId ?? ""} ${
              isActive ? "active" : ""
            } ${moveAction && !selectedCardAction ? "moveTarget" : ""} ${attackAction && !selectedCardAction ? "attackTarget" : ""} ${cardAction ? "cardTarget" : ""}`;
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

            if (cardAction && unit) {
              return (
                <button
                  aria-label={`Target ${unit.name}`}
                  className={className}
                  key={index}
                  onClick={() => onAction(cardAction)}
                  title={`Target ${unit.name}`}
                  type="button"
                >
                  {content}
                </button>
              );
            }

            if (moveAction && !unit && !selectedCardAction) {
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

            if (attackAction && unit && !selectedCardAction) {
              return (
                <button
                  aria-label={`Attack ${unit.name}`}
                  className={className}
                  key={index}
                  onClick={() => onAction(attackAction)}
                  title={`Attack ${unit.name}`}
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

function formatEffectDuration(effect: GameState["activeEffects"][number]): string {
  if (effect.expiresAtCombatRoundEnd !== undefined) {
    return `through combat round ${effect.expiresAtCombatRoundEnd}`;
  }

  if (effect.expiresAtTurnEndPlayerId) {
    return `until ${effect.expiresAtTurnEndPlayerId} turn end`;
  }

  if (effect.duration.type === "combat") {
    return "until combat ends";
  }

  if (effect.duration.type === "permanent") {
    return "permanent";
  }

  return effect.duration.type;
}

function RoomPanel({
  roomId,
  roomInput,
  roomVersion,
  syncStatus,
  onRoomInput,
  onJoin
}: {
  roomId: string;
  roomInput: string;
  roomVersion: number;
  syncStatus: string;
  onRoomInput: (roomId: string) => void;
  onJoin: () => void;
}) {
  return (
    <section className="panel roomPanel" aria-label="Room sync">
      <div className="panelHeader">
        <h2>Room</h2>
        <span>v{roomVersion}</span>
      </div>
      <div className="roomControls">
        <input
          aria-label="Room ID"
          onChange={(event) => onRoomInput(event.target.value)}
          value={roomInput}
        />
        <button className="actionButton secondary" onClick={onJoin} title="Join room" type="button">
          <StepForward aria-hidden="true" size={16} />
          <span>Join</span>
        </button>
      </div>
      <div className="roomStatus">
        <strong>{roomId}</strong>
        <span>{syncStatus}</span>
      </div>
    </section>
  );
}

function MultiplayerPanel({ state }: { state: GameState }) {
  const completed = new Set(state.turn.completedPlayerIds);

  return (
    <section className="panel multiplayerPanel" aria-label="Multiplayer flow">
      <div className="panelHeader">
        <h2>Multiplayer</h2>
        <span>{state.turn.mode}</span>
      </div>
      <div className="flowRows">
        <div>
          <span>Opening</span>
          <strong>
            rounds 1-{state.turn.simultaneousRoundLimit} {state.round <= state.turn.simultaneousRoundLimit ? "private" : "done"}
          </strong>
        </div>
        <div>
          <span>Observe</span>
          <strong>{state.turn.observingPlayerId ? state.players[state.turn.observingPlayerId]?.name : "private turns"}</strong>
        </div>
      </div>
      {state.turn.mode === "simultaneous" ? (
        <div className="completionList">
          {state.turnOrder.map((playerId) => (
            <span className={completed.has(playerId) ? "done" : ""} key={playerId}>
              {state.players[playerId]?.name ?? playerId}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ActiveEffectsPanel({ state }: { state: GameState }) {
  return (
    <section className="panel activeEffectsPanel" aria-label="Active effects">
      <div className="panelHeader">
        <h2>Effects</h2>
        <Sparkles aria-hidden="true" size={18} />
      </div>
      <div className="effectList">
        {state.activeEffects.length === 0 ? <div className="emptySlot compact">No active effects</div> : null}
        {state.activeEffects.map((effect) => (
          <article key={effect.id}>
            <strong>{effect.name}</strong>
            <span>{state.players[effect.controllerId]?.name ?? effect.controllerId}</span>
            <small>{formatEffectDuration(effect)}</small>
          </article>
        ))}
      </div>
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
  viewerPlayerId: PlayerId;
  currentActorId: string;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  onReset: () => void;
}) {
  const commandActions = legalActions.filter((legal) => !isCardLegalAction(legal) && legal.action.type !== "MOVE_UNIT");
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
        <h2>Unit Commands</h2>
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

type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
};

async function fetchRoom(roomId: string): Promise<GameRoomSnapshot> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Could not load room.");
  }

  return (await response.json()) as GameRoomSnapshot;
}

function getInitialRoomId(): string {
  if (typeof window === "undefined") {
    return "dev-room";
  }

  return new URLSearchParams(window.location.search).get("room") || "dev-room";
}

export default function Home() {
  const [state, setState] = useState(() => createInitialGameState());
  const [viewerPlayerId, setViewerPlayerId] = useState<PlayerId>("p1");
  const [errors, setErrors] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("dev-room");
  const [roomInput, setRoomInput] = useState("dev-room");
  const [roomVersion, setRoomVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [selectedCardAction, setSelectedCardAction] = useState<Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> | null>(null);
  const currentActorId = state.pendingChoice?.playerId ?? state.reactionWindow?.priorityPlayerId ?? state.activePlayerId;
  const playerView = useMemo(() => getPlayerView(state, viewerPlayerId), [state, viewerPlayerId]);
  const legalActions = useMemo(() => getLegalActions(state, viewerPlayerId), [viewerPlayerId, state]);
  const selectedCardTargetCount = selectedCardAction
    ? legalActions.filter((legal) => isBoardTargetCardAction(legal.action) && sameCardSelection(selectedCardAction, legal.action)).length
    : 0;
  const latestEvents = state.eventLog.slice(-10).reverse();
  const outcome = state.combat?.outcome ?? null;

  useEffect(() => {
    const initialRoomId = getInitialRoomId();
    if (initialRoomId === roomId) {
      return;
    }

    window.setTimeout(() => {
      setRoomId(initialRoomId);
      setRoomInput(initialRoomId);
    }, 0);
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;

    fetchRoom(roomId)
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        setState(snapshot.state);
        setRoomVersion(snapshot.version);
        setSyncStatus(`synced v${snapshot.version}`);
      })
      .catch((error) => {
        if (!cancelled) {
          setSyncStatus(error instanceof Error ? error.message : "room sync failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchRoom(roomId)
        .then((snapshot) => {
          setRoomVersion((currentVersion) => {
            if (snapshot.version > currentVersion) {
              setState(snapshot.state);
              setSelectedCardAction(null);
              setSyncStatus(`synced v${snapshot.version}`);
              return snapshot.version;
            }

            setSyncStatus(`synced v${currentVersion}`);
            return currentVersion;
          });
        })
        .catch(() => setSyncStatus("room sync failed"));
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [roomId]);

  const submitAction = async (action: GameAction) => {
    setSyncStatus("submitting");
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      setErrors(["Server rejected the action request."]);
      setSyncStatus("submit failed");
      return;
    }

    const payload = (await response.json()) as {
      snapshot: GameRoomSnapshot;
      result: EngineResult;
    };
    setErrors(payload.result.errors.map((error) => error.message));
    setState(payload.snapshot.state);
    setRoomVersion(payload.snapshot.version);
    setSyncStatus(`synced v${payload.snapshot.version}`);

    if (payload.result.errors.length === 0) {
      setSelectedCardAction(null);
    }
  };

  const resetRoom = async () => {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reset: true })
    });

    if (!response.ok) {
      setErrors(["Could not reset the room."]);
      return;
    }

    const snapshot = (await response.json()) as GameRoomSnapshot;
    setState(snapshot.state);
    setRoomVersion(snapshot.version);
    setErrors([]);
    setSelectedCardAction(null);
    setSyncStatus(`synced v${snapshot.version}`);
  };

  const joinRoom = () => {
    const nextRoomId = roomInput.trim() || "dev-room";
    window.history.replaceState(null, "", `?room=${encodeURIComponent(nextRoomId)}`);
    setErrors([]);
    setSelectedCardAction(null);
    setRoomId(nextRoomId);
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
              : (state.combat?.dice.faces.length ? state.combat.dice.faces : [...ATTACK_DIE_FACES])
                  .map((face) => (face >= 0 ? `+${face}` : `${face}`))
                  .join(" ")}
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

      {selectedCardAction ? (
        <section className="targetBanner" aria-label="Selected card target">
          <Crosshair aria-hidden="true" size={18} />
          <strong>{cardName(selectedCardAction.cardId)}</strong>
          <span>{selectedCardTargetCount > 0 ? "Click a highlighted unit" : "No legal board target"}</span>
        </section>
      ) : null}

      {state.pendingChoice ? (
        <section className="choiceBanner" aria-label="Pending choice">
          <Dices aria-hidden="true" size={18} />
          <strong>Pending Reroll</strong>
          <span>
            {state.pendingChoice.candidates
              .map((candidate, index) => `${index + 1}: ${candidate.roll >= 0 ? "+" : ""}${candidate.roll}`)
              .join("  ")}
          </span>
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
        <Battlefield
          legalActions={legalActions}
          onAction={submitAction}
          selectedCardAction={selectedCardAction}
          state={state}
        />
        <div className="sideStack">
          <ViewAsControl onChange={setViewerPlayerId} state={state} viewerPlayerId={viewerPlayerId} />
          <RoomPanel
            onJoin={joinRoom}
            onRoomInput={setRoomInput}
            roomId={roomId}
            roomInput={roomInput}
            roomVersion={roomVersion}
            syncStatus={syncStatus}
          />
          <TurnPanel state={state} />
          <DicePanel state={state} />
          <MultiplayerPanel state={state} />
          <ActiveEffectsPanel state={state} />
          <ActionPanel
            currentActorId={currentActorId}
            legalActions={legalActions}
            onAction={submitAction}
            onReset={resetRoom}
            state={state}
            viewerPlayerId={viewerPlayerId}
          />
          <InitiativePanel state={state} />
        </div>
        <div className="handGrid">
          {state.turnOrder.map((playerId) => (
            <PlayerHand
              key={playerId}
              legalActions={legalActions}
              onAction={submitAction}
              onSelectCardAction={setSelectedCardAction}
              playerId={playerId}
              selectedCardAction={selectedCardAction}
              state={state}
              view={playerView}
            />
          ))}
        </div>
        <UnitGallery state={state} />
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
