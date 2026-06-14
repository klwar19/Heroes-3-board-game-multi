"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronDown, ChevronUp, Crown, Mountain, ScrollText, Shield, Sparkles, Swords } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
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
  getUnitTokens,
  isArrowTowerUnit,
  isUnitAlive,
  playerSpellCastsIgnoreLimit,
  sortUnitsForActivation,
  type CombatTokenState,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { ARMY_UNIT_DRAG_TYPE } from "@/components/adventure/screen";
import { actionKey, formatEvent, isBoardTargetCardAction, sameCardSelection, setUnitDragImage, unitName, type CardBoardAction } from "./utils";
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

const TOKEN_GLYPHS: Record<CombatTokenState["kind"], { symbol: string; describe: (token: CombatTokenState) => string }> = {
  attack: {
    symbol: "⚔",
    describe: (token) =>
      `Attack token: ${token.amount >= 0 ? "+" : ""}${token.amount} attack (${token.sourceName})`
  },
  weakness: {
    symbol: "⚔",
    describe: (token) => `Weakness token: ${token.amount} attack (${token.sourceName})`
  },
  corrosion: {
    symbol: "🛡",
    describe: (token) => `Corrosion token: ${token.amount} defense, minimum 0, until the end of combat (${token.sourceName})`
  },
  paralysis: {
    symbol: "💫",
    describe: (token) => `Paralysis: skips its next activation; removed when it takes damage (${token.sourceName})`
  }
};

/** Token chips drawn on a unit card (attack/weakness/corrosion/paralysis). */
function TokenChips({ unit }: { unit: CombatUnitState }) {
  const tokens = getUnitTokens(unit);
  if (tokens.length === 0) {
    return null;
  }

  return (
    <span className="tokenChips" aria-label="Combat tokens">
      {tokens.map((token) => {
        const glyph = TOKEN_GLYPHS[token.kind];
        return (
          <b className={`tokenChip ${token.kind}`} key={token.id} title={glyph.describe(token)}>
            {token.kind === "paralysis" ? glyph.symbol : `${token.amount > 0 ? "+" : ""}${token.amount}${glyph.symbol}`}
          </b>
        );
      })}
    </span>
  );
}

/** The Arrow Tower card beside the board during sieges. */
function ArrowTowerCard({
  state,
  tower,
  legalActions,
  onAction,
  onInspect
}: {
  state: GameState;
  tower: CombatUnitState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  onInspect: (unitId: string) => void;
}) {
  const health = Math.max(0, tower.maxHealth - tower.damage);
  const attackAction = legalActions.find(
    (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.defenderId === tower.id
  );
  const demolishAction = legalActions.find(
    (legal) => legal.action.type === "ATTACK_FORTIFICATION" && legal.action.target.kind === "arrow-tower"
  );
  const isActive = state.combat?.activeUnitId === tower.id;

  return (
    <div className={`arrowTower ${isActive ? "active" : ""}`} aria-label="Arrow Tower">
      <button className="arrowTowerBody" onClick={() => onInspect(tower.id)} title="Arrow Tower — shoots without positioning penalties; only ranged attacks and card effects can hit it; collapses when all Walls and the Gate fall." type="button">
        <span aria-hidden="true" className="arrowTowerIcon">🏹🗼</span>
        <strong>Arrow Tower</strong>
        <small>
          ⚔ {tower.attack} · <Shield aria-hidden="true" size={10} /> {tower.defense} · ♥ {health}/{tower.maxHealth} · init {tower.initiative}
        </small>
      </button>
      {attackAction ? (
        <button className="commandButton" onClick={() => onAction(attackAction.action)} type="button">
          Shoot the tower
        </button>
      ) : null}
      {demolishAction ? (
        <button className="commandButton" onClick={() => onAction(demolishAction.action)} type="button">
          {demolishAction.label}
        </button>
      ) : null}
    </div>
  );
}

export function BattlefieldBoard({
  state,
  viewerPlayerId,
  legalActions,
  selectedCardAction,
  flippedUnitIds,
  tintedUnits,
  onAction,
  onInspect
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  selectedCardAction: CardBoardAction | null;
  /** Units that just turned to their Few side; plays a flip animation. */
  flippedUnitIds?: ReadonlySet<string>;
  /** unitId -> tint key ("bloodlust") while a palette-style effect plays. */
  tintedUnits?: ReadonlyMap<string, string>;
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
  const spaceCardActionsByPosition = new Map<number, GameAction>();
  const abilityTargetActions = new Map<string, GameAction>();
  const fortificationActionsByPosition = new Map<number, LegalAction>();

  const siege = combat?.siege ?? null;
  const wallPositions = new Set(siege?.walls ?? []);
  const gatePosition = siege?.gatePosition ?? null;
  const arrowTower = siege?.arrowTowerUnitId ? combat?.units[siege.arrowTowerUnitId] : null;

  if (combat) {
    for (const unit of Object.values(combat.units)) {
      if (isUnitAlive(unit) && unit.position >= 0) {
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
    if (legal.action.type === "ATTACK_FORTIFICATION" && legal.action.target.kind !== "arrow-tower") {
      fortificationActionsByPosition.set(legal.action.target.position, legal);
    }
    if (selectedCardAction && isBoardTargetCardAction(legal.action) && sameCardSelection(selectedCardAction, legal.action)) {
      if (legal.action.target.type === "unit") {
        cardActionsByTarget.set(legal.action.target.unitId, legal.action);
      } else if (legal.action.target.type === "space") {
        // Summon spells: highlight the empty space the elemental will appear on.
        spaceCardActionsByPosition.set(legal.action.target.position, legal.action);
      }
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
          const spaceCardAction = !unit ? spaceCardActionsByPosition.get(index) : undefined;
          const abilityAction = unit ? abilityTargetActions.get(unit.id) : undefined;
          const isActive = Boolean(unit && combat?.activeUnitId === unit.id);
          const isFlipping = Boolean(unit && flippedUnitIds?.has(unit.id));
          const dropTarget = placing && ownRows.has(index) && !unit && !isObstacle;
          const className = `battleCell ${terrain} ${unit?.controllerId ?? ""} ${isActive ? "active" : ""} ${
            isObstacle ? "obstacle" : ""
          } ${moveAction && !selectedCardAction ? "moveTarget" : ""} ${
            attackAction && !selectedCardAction ? "attackTarget" : ""
          } ${cardAction || spaceCardAction ? "cardTarget" : ""} ${abilityAction ? "abilityTarget" : ""} ${dropTarget ? "dropTarget" : ""}`;
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

          // Siege fortifications: walls and the gate live in the middle row.
          const isWall = wallPositions.has(index);
          const isGate = gatePosition === index;
          if (isWall || isGate) {
            const fortAction = fortificationActionsByPosition.get(index);
            const label = isGate
              ? "Gate — open to the defender, an obstacle to the attacker. Adjacent ground/flying units may tear it down as their attack."
              : "Wall — a combat obstacle. Adjacent ground/flying units may tear it down as their attack; defenders in its column take 1 less ranged damage.";
            const content = (
              <span className={`fortMark ${isGate ? "gate" : "wall"}`}>
                <span aria-hidden="true">{isGate ? "🚪" : "🧱"}</span>
                <small>{isGate ? "Gate" : "Wall"}</small>
              </span>
            );
            if (fortAction) {
              return (
                <button
                  aria-label={fortAction.label}
                  className={`${className} fortification attackTarget`}
                  data-fx-cell={index}
                  key={index}
                  onClick={() => onAction(fortAction.action)}
                  title={`${fortAction.label} — automatically successful, no die, no cards`}
                  type="button"
                >
                  {content}
                </button>
              );
            }
            return (
              <div aria-label={label} className={`${className} fortification`} data-fx-cell={index} key={index} title={label}>
                {content}
              </div>
            );
          }

          if (isObstacle) {
            return (
              <div
                aria-label={`Obstacle at ${getBattlefieldLabel(index)}: blocks ground and ranged movement`}
                className={className}
                data-fx-cell={index}
                key={index}
                title="Combat Obstacle — ground and ranged units must go around; flying units pass over"
              >
                <span className="obstacleMark">
                  <Mountain aria-hidden="true" size={26} />
                </span>
              </div>
            );
          }

          const tint = unit ? tintedUnits?.get(unit.id) : undefined;
          const content = unit ? (
            <article className={`boardCard ${unit.controllerId} ${isFlipping ? "flipping" : ""} ${tint ? `fxTint-${tint}` : ""}`}>
              {unit.assets?.cardImage ? (
                <img
                  alt={unit.assets?.imageAlt ?? unit.cardName}
                  className="boardCardImage"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  src={assetUrl(unit.assets.cardImage)}
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
              <TokenChips unit={unit} />
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
                    // Without this the ghost is the whole battlefield card.
                    setUnitDragImage(event, unit.assets?.cardImage);
                  }
                }
              : {};

          const interactiveAction = abilityAction ?? cardAction ?? spaceCardAction ?? (unit ? attackAction : moveAction);

          if (interactiveAction && (!selectedCardAction || cardAction || spaceCardAction)) {
            const label = abilityAction
              ? `Ability target: ${unit?.name}`
              : cardAction
                ? `Target ${unit?.name}`
                : spaceCardAction
                  ? `Cast on ${getBattlefieldLabel(index)}`
                  : unit
                    ? `Attack ${unit?.name}`
                    : `Move to ${getBattlefieldLabel(index)}`;
            return (
              <button
                aria-label={label}
                className={className}
                data-fx-cell={index}
                data-fx-unit={unit?.id}
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
                data-fx-cell={index}
                data-fx-unit={unit.id}
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
              data-fx-cell={index}
              key={index}
              {...dropProps}
            >
              {content}
            </div>
          );
        })}
      </div>
      {arrowTower && isUnitAlive(arrowTower) ? (
        <ArrowTowerCard
          legalActions={legalActions}
          onAction={onAction}
          onInspect={onInspect}
          state={state}
          tower={arrowTower}
        />
      ) : null}
    </div>
  );
}

/**
 * The activation order as a row of the actual unit cards, sorted the way the
 * round will play out (initiative, attacker first on ties). Visible already
 * during deployment, so both sides see how the placed armies will be sorted
 * before the combat starts.
 */
export function InitiativeRail({ state }: { state: GameState }) {
  const { zoomUnit } = useCardZoom();
  const units = state.combat ? sortUnitsForActivation(state.combat, state.activeEffects) : [];
  const inSetup = Boolean(state.combat?.setup);

  return (
    <div className="initiativeRail" aria-label="Initiative order">
      <span className="initLabel" title="Units activate in this order (highest initiative first)">
        <Swords aria-hidden="true" size={14} />
        {inSetup ? "Order" : "Order"}
      </span>
      {units.length === 0 && inSetup ? <small className="initHint">Deploy units — they sort by initiative here.</small> : null}
      {units.map((unit, index) => (
        <button
          className={`initCard ${unit.controllerId} ${state.combat?.activeUnitId === unit.id ? "active" : ""} ${
            unit.activatedThisRound ? "done" : ""
          }`}
          key={unit.id}
          onClick={() => zoomUnit(unit)}
          title={`${index + 1}. ${unit.cardName} — initiative ${unit.initiative}${
            unit.activatedThisRound ? " (already activated)" : ""
          }. Click to read the card.`}
          type="button"
        >
          {unit.assets?.cardImage ? (
            <img alt={unit.cardName} loading="lazy" src={assetUrl(unit.assets.cardImage)} />
          ) : (
            <span className="initCardFallback">{unit.name}</span>
          )}
          <b className="initBadge">{unit.initiative}</b>
        </button>
      ))}
      <span className="roundChip">{inSetup ? "Setup" : `Round ${state.combat?.round ?? 0}`}</span>
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
            src={assetUrl(unit.assets.cardImage)}
          />
        ) : (
          <div className="inspectImage cardFaceFallback">{unit.cardName}</div>
        )}
      </button>
      <div className="inspectBody">
        <strong>{unit.cardName}</strong>
        <span className="inspectKind">
          {isArrowTowerUnit(unit) ? "siege " : ""}
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
        {getUnitTokens(unit).length > 0 ? (
          <div className="inspectTokens">
            {getUnitTokens(unit).map((token) => (
              <span className={`tokenChip ${token.kind}`} key={token.id} title={TOKEN_GLYPHS[token.kind].describe(token)}>
                {token.kind === "paralysis"
                  ? `${TOKEN_GLYPHS[token.kind].symbol} paralysis`
                  : `${token.amount > 0 ? "+" : ""}${token.amount}${TOKEN_GLYPHS[token.kind].symbol} ${token.kind}`}
                {token.expiresAtCombatRoundEnd !== undefined ? ` (until round ${token.expiresAtCombatRoundEnd} ends)` : ""}
              </span>
            ))}
          </div>
        ) : null}
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
  "SUMMON_DEMONS",
  "COMPLETE_SIMULTANEOUS_TURN",
  "CONTINUE_NEUTRAL_COMBAT",
  "RETREAT_FROM_COMBAT",
  "ACKNOWLEDGE_COMBAT_END",
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
    case "ACKNOWLEDGE_COMBAT_END":
      return "Return to the adventure map";
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
  // Expert Intelligence "ignores the limit": casts still tick the counter, so
  // show the cap as ∞ and never mark it spent while that effect is held.
  const ignoreSpellLimit = Boolean(player) && playerSpellCastsIgnoreLimit(state, viewerPlayerId);
  const spellLimit = 1 + (player?.combatStats.spellLimitBonusThisRound ?? 0);
  const spellLimitLabel = ignoreSpellLimit ? "∞" : String(spellLimit);
  const spellsCast = player?.combatStats.spellsCastThisRound ?? 0;
  const crownsLeft = player ? player.limits.expertUses - player.combatStats.expertUsesSpentThisRound : 0;

  return (
    <div className="commandDock" aria-label="Commands">
      <span className="dockStatus">{status}</span>
      {state.combat && !outcome ? (
        <div className="dockLimits" aria-label="Per-round limits">
          <span
            className={!ignoreSpellLimit && spellsCast >= spellLimit ? "limitSpent" : ""}
            title={
              ignoreSpellLimit
                ? "Intelligence (expert): your spells no longer count toward the per-combat-round limit."
                : `One spell per combat round${spellLimit > 1 ? ` (+${spellLimit - 1} from Knowledge)` : ""}. Hero specialties never count against it.`
            }
          >
            <Sparkles aria-hidden="true" size={12} /> Spell {spellsCast}/{spellLimitLabel}
          </span>
          <span title="Expert-effect crowns left this combat round">
            <Crown aria-hidden="true" size={12} /> {crownsLeft} crown{crownsLeft === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
      {commands.map((legal) => (
        <button
          className={`commandButton ${legal.action.type === "DEFEND_UNIT" ? "defendButton" : ""}`}
          key={actionKey(legal.action)}
          onClick={() => onAction(legal.action)}
          type="button"
        >
          {legal.action.type === "DEFEND_UNIT" ? (
            <img alt="" aria-hidden="true" className="defendButtonIcon" src={assetUrl("/assets/ui/defend-button.png")} />
          ) : null}
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
