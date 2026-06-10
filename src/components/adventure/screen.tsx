"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type ReactNode } from "react";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions } from "@/data/map/locations";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import {
  ABILITY_SEARCH_LEVELS,
  EXPERT_USES_BY_LEVEL,
  HAND_LIMIT_BY_LEVEL,
  NEUTRAL_DECK_IDS,
  SPECIALTY_LEVELS,
  hexDistance,
  hexToPixel,
  parseHexSpaceId,
  tileFootprint,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState
} from "@/engine";
import { actionKey, cardName, formatCost, titleCase } from "@/components/table/utils";

const HEX_SIZE = 34;

const TERRAIN_COLORS: Record<string, string> = {
  grass: "#3c7a39",
  dirt: "#8a6642",
  subterranean: "#4d3f5c",
  cursed: "#6e5d72",
  snow: "#aebcd4",
  swamp: "#5c6e4e",
  lava: "#73392c"
};

const LOCATION_GLYPHS: Record<string, string> = {
  town: "🏰",
  random_town: "🏰",
  settlement: "🏠",
  mine: "⛏",
  resource_symbol: "🎲",
  treasure_symbol: "💰",
  artifact_symbol: "🗝",
  windmill: "🌀",
  water_wheel: "💧",
  mystical_garden: "🌷",
  learning_stone: "📘",
  tree_of_knowledge: "🌳",
  fountain_of_youth: "⛲",
  temple: "⛪",
  warriors_tomb: "🪦",
  shrine_of_magic_incantation: "🔮",
  shrine_of_magic_gesture: "🔮",
  magic_spring: "✨",
  witch_hut: "🧹",
  scholar: "🎓",
  redwood_observatory: "🗼",
  pandoras_box: "📦",
  stables: "🐎",
  sanctuary: "🕊",
  trading_post: "⚖",
  war_machine_factory: "⚙",
  obelisk: "▲",
  dragon_utopia: "🐉",
  grail: "🏆",
  star_axis: "✴",
  blocked_field: "⛔"
};

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];

function hexCorners(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${(cx + size * Math.cos(angle)).toFixed(1)},${(cy + size * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
}

function playerColor(state: GameState, playerId: PlayerId | null): string {
  if (!playerId) {
    return "#999";
  }
  const factionId = state.players[playerId]?.factionId;
  return (factionId && coreFactionDefinitions[factionId]?.color) || "#b08d2f";
}

export function HexMapBoard({
  state,
  viewerPlayerId,
  legalActions,
  onAction,
  placement
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  placement: { tileDefId: string; rotation: number } | null;
}) {
  const adventure = state.adventure;

  const moveTargets = useMemo(() => {
    const targets = new Map<string, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "MOVE_HERO") {
        targets.set(legal.action.to, legal.action);
      }
    }
    return targets;
  }, [legalActions]);

  const discoverByTile = useMemo(() => {
    const targets = new Map<string, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "DISCOVER_TILE") {
        targets.set(legal.action.tileInstanceId, legal.action);
      }
    }
    return targets;
  }, [legalActions]);

  const placementCenters = useMemo(() => {
    if (!placement || !adventure) {
      return [] as { row: number; col: number }[];
    }

    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === viewerPlayerId && candidate.kind === "main"
    );
    const heroCoord = hero?.spaceId ? parseHexSpaceId(hero.spaceId) : null;
    if (!heroCoord) {
      return [];
    }

    // Candidate centers near the hero: at least distance 3 from every tile and
    // exactly 3 from two or more (the engine re-validates on submit).
    const existing = Object.values(adventure.tiles).map((tile) => ({ row: tile.centerRow, col: tile.centerCol }));
    const centers: { row: number; col: number }[] = [];
    for (let row = heroCoord.row - 4; row <= heroCoord.row + 4; row += 1) {
      for (let col = heroCoord.col - 4; col <= heroCoord.col + 4; col += 1) {
        const candidate = { row, col };
        if (existing.some((center) => hexDistance(center, candidate) < 3)) {
          continue;
        }
        if (existing.filter((center) => hexDistance(center, candidate) === 3).length < 2) {
          continue;
        }
        centers.push(candidate);
      }
    }
    return centers;
  }, [placement, adventure, state.heroes, viewerPlayerId]);

  if (!adventure) {
    return null;
  }

  const cells: ReactNode[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const heroesBySpace = new Map<string, { playerId: PlayerId; heroId: string }[]>();
  for (const hero of Object.values(state.heroes)) {
    if (hero.spaceId) {
      const list = heroesBySpace.get(hero.spaceId) ?? [];
      list.push({ playerId: hero.controllerId, heroId: hero.id });
      heroesBySpace.set(hero.spaceId, list);
    }
  }

  const track = (x: number, y: number) => {
    minX = Math.min(minX, x - HEX_SIZE * 1.2);
    minY = Math.min(minY, y - HEX_SIZE * 1.2);
    maxX = Math.max(maxX, x + HEX_SIZE * 1.2);
    maxY = Math.max(maxY, y + HEX_SIZE * 1.2);
  };

  for (const tile of Object.values(adventure.tiles)) {
    const tileDef = coreTileDefinitions[tile.tileDefId];
    const footprint = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, tile.rotation);

    if (tile.faceDown) {
      const discover = discoverByTile.get(tile.id);
      for (const [faceDownSlot, coord] of footprint.entries()) {
        const { x, y } = hexToPixel(coord, HEX_SIZE);
        track(x, y);
        cells.push(
          <g key={`${tile.id}-${faceDownSlot}`}>
            <polygon
              className={`hexFaceDown ${discover ? "discoverable" : ""}`}
              onClick={discover ? () => onAction(discover) : undefined}
              points={hexCorners(x, y, HEX_SIZE - 1.2)}
            />
            {faceDownSlot === 0 ? (
              <text className="hexFaceDownLabel" textAnchor="middle" x={x} y={y + 5}>
                {discover ? "Discover" : "?"}
              </text>
            ) : null}
          </g>
        );
      }
      continue;
    }

    const terrain = TERRAIN_COLORS[tileDef?.terrain ?? "dirt"] ?? TERRAIN_COLORS.dirt;
    for (const coord of footprint) {
      const spaceId = `h:${coord.row}:${coord.col}`;
      const field = adventure.fields[spaceId];
      if (!field) {
        continue;
      }

      const { x, y } = hexToPixel(coord, HEX_SIZE);
      track(x, y);

      const location = locationDefinitions[field.location];
      const moveAction = moveTargets.get(spaceId);
      const guarded = Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
      const glyph = LOCATION_GLYPHS[field.location] ?? "";
      const occupants = heroesBySpace.get(spaceId) ?? [];

      cells.push(
        <g key={spaceId}>
          <polygon
            className={`hexCell ${field.location === "blocked_field" ? "blocked" : ""} ${moveAction ? "moveTarget" : ""}`}
            fill={terrain}
            onClick={moveAction ? () => onAction(moveAction) : undefined}
            points={hexCorners(x, y, HEX_SIZE - 1.2)}
          >
            <title>
              {`${location?.name ?? field.location}${field.difficulty ? ` (guard ${ROMAN[field.difficulty]})` : ""}${
                field.flagOwnerId ? ` — flagged by ${state.players[field.flagOwnerId]?.name}` : ""
              }`}
            </title>
          </polygon>
          {glyph && field.location !== "empty_field" ? (
            <text className="hexGlyph" textAnchor="middle" x={x} y={y + 6}>
              {glyph}
            </text>
          ) : null}
          {field.difficulty && guarded ? (
            <text className="hexDifficulty" textAnchor="middle" x={x} y={y - HEX_SIZE * 0.45}>
              {ROMAN[field.difficulty]}
            </text>
          ) : null}
          {field.blackCube ? <rect className="blackCube" height={9} width={9} x={x + HEX_SIZE * 0.36} y={y - HEX_SIZE * 0.62} /> : null}
          {field.flagOwnerId ? (
            <g transform={`translate(${x - HEX_SIZE * 0.62}, ${y - HEX_SIZE * 0.72})`}>
              <line className="flagPole" x1={0} x2={0} y1={0} y2={16} />
              <path d="M0 1 L11 4.5 L0 8 Z" fill={playerColor(state, field.flagOwnerId)} stroke="#1d1206" strokeWidth={0.7} />
            </g>
          ) : null}
          {field.settlementResource ? (
            <text className="hexProduction" textAnchor="middle" x={x} y={y + HEX_SIZE * 0.72}>
              {field.settlementResource === "buildingMaterials" ? "⚒" : field.settlementResource === "gold" ? "🪙" : "♦"}
            </text>
          ) : null}
          {field.resource && field.location === "mine" ? (
            <text className="hexProduction" textAnchor="middle" x={x} y={y + HEX_SIZE * 0.72}>
              {field.resource === "buildingMaterials" ? "⚒" : field.resource === "gold" ? "🪙" : "♦"}
              {field.amount}
            </text>
          ) : null}
          {occupants.map((occupant, index) => (
            <g key={occupant.heroId} transform={`translate(${x + index * 10 - 5}, ${y - 4})`}>
              <circle className="heroPawnBase" r={9.5} />
              <circle fill={playerColor(state, occupant.playerId)} r={7.5} />
              <line className="heroFlagPole" x1={0} x2={0} y1={-7} y2={-22} />
              <path
                d={`M0 -21 L13 -17 L0 -13 Z`}
                fill={playerColor(state, occupant.playerId)}
                stroke="#160d04"
                strokeWidth={0.8}
              />
            </g>
          ))}
        </g>
      );
    }
  }

  // Tile placement ghosts.
  if (placement) {
    for (const center of placementCenters) {
      const action: GameAction = {
        type: "PLACE_TILE",
        playerId: viewerPlayerId,
        heroId: `hero_${viewerPlayerId}`,
        tileDefId: placement.tileDefId,
        centerRow: center.row,
        centerCol: center.col,
        rotation: placement.rotation
      };
      const { x, y } = hexToPixel(center, HEX_SIZE);
      track(x, y);
      cells.push(
        <circle
          className="placementGhost"
          cx={x}
          cy={y}
          key={`ghost-${center.row}-${center.col}`}
          onClick={() => onAction(action)}
          r={HEX_SIZE * 0.5}
        >
          <title>Place the tile centered here</title>
        </circle>
      );
    }
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  return (
    <div className="hexMapWrap" aria-label="Adventure map">
      <svg className="hexMapSvg" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}>
        {cells}
      </svg>
    </div>
  );
}

export function AdventureHud({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const player = state.players[viewerPlayerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === viewerPlayerId && candidate.kind === "main"
  );
  const activeName = state.players[state.activePlayerId]?.name ?? state.activePlayerId;
  const roundKind = state.round === 1 ? "setup round" : state.round % 2 === 1 ? "resource round" : "astrologers round";

  const refresh = legalActions.find((legal) => legal.action.type === "REFRESH_HAND");
  const endTurn = legalActions.find((legal) => legal.action.type === "END_TURN");
  const winner = state.adventure?.winnerPlayerId;

  return (
    <div className="advHud" aria-label="Adventure status">
      <div className="advHudCell">
        <strong>Round {state.round}</strong>
        <small>{roundKind}</small>
      </div>
      <div className="advHudCell">
        <strong>{activeName}&apos;s turn</strong>
        <small>{state.phase}</small>
      </div>
      {player && player.id !== "neutrals" ? (
        <div className="advHudCell resources">
          <span title="Gold">🪙 {player.resources.gold}</span>
          <span title="Building materials">⚒ {player.resources.buildingMaterials}</span>
          <span title="Valuables">♦ {player.resources.valuables}</span>
          <small title="Production each resource round">
            +{player.production.gold}/+{player.production.buildingMaterials}/+{player.production.valuables}
          </small>
        </div>
      ) : null}
      {hero ? (
        <div className="advHudCell">
          <strong>
            MP {hero.movementPoints}/{hero.movementPointsMax}
          </strong>
          <small>
            level {hero.level} · {player?.morale ? `morale ${player.morale > 0 ? "+" : ""}${player.morale}` : "no morale"}
          </small>
        </div>
      ) : null}
      {winner ? (
        <div className="advHudCell winner">
          <strong>{state.players[winner]?.name} wins!</strong>
        </div>
      ) : null}
      <div className="advHudButtons">
        {refresh ? (
          <button className="commandButton" onClick={() => onAction(refresh.action)} type="button">
            Refresh hand
          </button>
        ) : null}
        {endTurn ? (
          <button className="commandButton" onClick={() => onAction(endTurn.action)} type="button">
            End turn
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function HeroBoardPanel({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const player = state.players[playerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
  );
  const heroDef = player?.heroDefId ? coreHeroDefinitions[player.heroDefId] : undefined;
  if (!player || !hero || !heroDef) {
    return null;
  }

  const faction = coreFactionDefinitions[heroDef.faction];

  return (
    <section className="heroBoard" aria-label={`${heroDef.name} hero board`}>
      <header>
        {heroDef.portrait ? (
          <img alt={`${heroDef.name} portrait`} className="heroPortrait" referrerPolicy="no-referrer" src={heroDef.portrait} />
        ) : null}
        <div>
          <strong>{heroDef.name}</strong>
          <small>
            {heroDef.class} · {heroDef.type === "might" ? "Might" : "Magic"} · {faction?.name}
          </small>
          <small>
            A{heroDef.startingStats.attack} D{heroDef.startingStats.defense} P{heroDef.startingStats.power} K
            {heroDef.startingStats.knowledge}
          </small>
        </div>
      </header>
      <div className="levelTrack" aria-label="Level tracker">
        {[1, 2, 3, 4, 5, 6, 7].map((level) => {
          const reached = hero.level >= level;
          const isSpecialty = level === 1 || SPECIALTY_LEVELS.includes(level as 4 | 6);
          return (
            <div className={`levelSlot ${reached ? "reached" : ""} ${isSpecialty ? "gold" : "silver"}`} key={level}>
              <span>{ROMAN[level]}</span>
              <small>
                {HAND_LIMIT_BY_LEVEL[level] !== HAND_LIMIT_BY_LEVEL[level - 1] ? `🂠${HAND_LIMIT_BY_LEVEL[level]}` : ""}
                {EXPERT_USES_BY_LEVEL[level] !== EXPERT_USES_BY_LEVEL[level - 1] ? "👑" : ""}
                {ABILITY_SEARCH_LEVELS.includes(level) ? "🔍" : ""}
                {isSpecialty && level > 1 ? "★" : ""}
              </small>
              {hero.level === level ? (
                <span className="levelCube" style={{ background: faction?.color }} title={`Experience ${hero.experience}/12`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <small className="heroXp">
        Experience {hero.experience}/12 · hand limit {player.limits.hand} · expert effects {player.limits.expertUses}
      </small>
    </section>
  );
}

export function ArmyPanel({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const player = state.players[playerId];
  if (!player || player.army.length === 0) {
    return (
      <section className="armyPanel">
        <h3>Unit deck</h3>
        <small>No units. The scenario&apos;s starting units return after the next combat.</small>
      </section>
    );
  }

  return (
    <section className="armyPanel" aria-label="Unit deck">
      <h3>Unit deck ({player.army.length})</h3>
      <ul>
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const side = unit.side === "few" ? def?.few : def?.pack;
          return (
            <li key={unit.id} title={side?.abilityText ?? def?.name}>
              <span className={`tierDot ${def?.tier}`} />
              <strong>
                {unit.side === "few" ? "Few" : "Pack"} {def?.name ?? unit.unitDefId}
              </strong>
              {side ? (
                <small>
                  A{side.attack} D{side.defense} HP{side.health} I{side.initiative}
                </small>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TownPanel({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  if (!player || !town || !faction) {
    return null;
  }

  const buildActions = legalActions.filter((legal) => legal.action.type === "BUILD_STRUCTURE");
  const populationActions = legalActions.filter((legal) => legal.action.type === "POPULATION_ACTION");
  const spellBook = legalActions.find((legal) => legal.action.type === "SPELL_BOOK_ACTION");
  const morale = legalActions.find((legal) => legal.action.type === "SPEND_MORALE");

  return (
    <section className="townPanel" aria-label={`${faction.name} town`}>
      <h3>
        {faction.name} town
        <small>
          tokens: {player.townTokens.build ? "🔨" : "▫"} {player.townTokens.population ? "👥" : "▫"}{" "}
          {player.townTokens.spellBook ? "📖" : "▫"}
        </small>
      </h3>
      <div className="townBuildings">
        {faction.buildings.map((buildingId) => {
          const building = coreBuildingDefinitions[buildingId];
          const built = town.buildings.includes(buildingId);
          const action = buildActions.find(
            (legal) => legal.action.type === "BUILD_STRUCTURE" && legal.action.buildingId === buildingId
          );
          return (
            <div className={`townBuilding ${built ? "built" : ""}`} key={buildingId} title={building?.source.credit}>
              <strong>{building?.name}</strong>
              <small>{built ? "built" : formatCost(building?.cost ?? {})}</small>
              {building?.implementationStatus === "not-implemented" ? <small className="todoTag">data only</small> : null}
              {action ? (
                <button className="commandButton" onClick={() => onAction(action.action)} type="button">
                  Build
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {populationActions.length > 0 ? (
        <div className="townRecruits">
          <h4>Population token</h4>
          {populationActions.map((legal) => (
            <button className="commandButton" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
              {legal.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="townFooter">
        {spellBook ? (
          <button className="commandButton" onClick={() => onAction(spellBook.action)} type="button">
            {spellBook.label}
          </button>
        ) : null}
        {morale ? (
          <button className="commandButton" onClick={() => onAction(morale.action)} type="button">
            {morale.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function PromptTray({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const visit = state.adventure?.pendingVisit;
  const choice = state.pendingChoice;

  const visitActions = legalActions.filter(
    (legal) => legal.action.type === "RESOLVE_VISIT_STEP" || legal.action.type === "TRADE_RESOURCES"
  );
  const optionActions = legalActions.filter((legal) => legal.action.type === "CHOOSE_OPTION");
  const combatGate = legalActions.filter(
    (legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT" || legal.action.type === "RETREAT_FROM_COMBAT"
  );

  let title: string | null = null;
  let body: LegalAction[] = [];

  if (choice?.type === "OPTION_CHOICE" && choice.playerId === viewerPlayerId) {
    title = choice.prompt;
    body = optionActions;
  } else if (visit && visit.playerId === viewerPlayerId && visitActions.length > 0) {
    const step = visit.steps[0];
    const field = state.adventure?.fields[visit.fieldId];
    title =
      step?.type === "CHOOSE_ONE"
        ? step.prompt
        : step?.type === "PAY_TO"
          ? step.prompt
          : `${locationDefinitions[field?.location ?? ""]?.name ?? "Field"}: choose`;
    body = visitActions;
  } else if (combatGate.length > 0) {
    title = "The combat round is over";
    body = combatGate;
  }

  if (!title || body.length === 0) {
    return null;
  }

  return (
    <div className="promptTray" role="dialog" aria-label={title}>
      <strong>{title}</strong>
      <div className="promptOptions">
        {body.map((legal) => (
          <button className="commandButton" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
            {legal.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FarTileTray({
  state,
  view,
  viewerPlayerId,
  placement,
  onTogglePlacement
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  placement: { tileDefId: string; rotation: number } | null;
  onTogglePlacement: (placement: { tileDefId: string; rotation: number } | null) => void;
}) {
  const tiles = view.adventure?.playerFarTiles[viewerPlayerId] ?? [];
  if (tiles.length === 0 || state.activePlayerId !== viewerPlayerId) {
    return null;
  }

  return (
    <div className="farTileTray" aria-label="Your far tiles">
      <small>Far tiles (1 MP to place):</small>
      {tiles.map((tileDefId, index) => (
        <button
          className={`commandButton ${placement?.tileDefId === tileDefId ? "selected" : ""}`}
          key={`${tileDefId}-${index}`}
          onClick={() =>
            onTogglePlacement(
              placement?.tileDefId === tileDefId ? null : { tileDefId, rotation: placement?.rotation ?? 0 }
            )
          }
          type="button"
        >
          {tileDefId}
        </button>
      ))}
      {placement ? (
        <button
          className="commandButton"
          onClick={() => onTogglePlacement({ ...placement, rotation: (placement.rotation + 1) % 6 })}
          type="button"
        >
          Rotate ({placement.rotation * 60}°)
        </button>
      ) : null}
    </div>
  );
}

export function AdventureDecksPanel({
  view,
  viewerPlayerId,
  onShowPile
}: {
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  onShowPile: (title: string, cardIds: string[], kind: "cards" | "units") => void;
}) {
  const player = view.players[viewerPlayerId];

  const sharedDecks: { id: string; name: string }[] = [
    { id: "spells", name: "Spells" },
    { id: "abilities", name: "Abilities" },
    { id: "artifacts", name: "Artifacts" }
  ];

  return (
    <section className="advDecks" aria-label="Decks and discard piles">
      {player ? (
        <div className="advDeckRow own">
          <div className="advDeck" title="Your draw deck (face down)">
            <div className="cardBack small">
              <span>H3</span>
            </div>
            <small>Deck {player.deckCount}</small>
          </div>
          <button
            className="advDiscard"
            onClick={() => onShowPile(`${player.name} — discard pile`, player.discard, "cards")}
            type="button"
          >
            <span>{player.discard.length}</span>
            <small>Discard</small>
          </button>
        </div>
      ) : null}
      {sharedDecks.map((deck) => {
        const deckState = view.decks[deck.id];
        if (!deckState) {
          return null;
        }
        return (
          <div className="advDeckRow" key={deck.id}>
            <div className="advDeck" title={`${deck.name} deck (face down)`}>
              <div className="cardBack small shared">
                <span>{deck.name[0]}</span>
              </div>
              <small>
                {deck.name} {deckState.drawCount}
              </small>
            </div>
            <button
              className="advDiscard"
              onClick={() => onShowPile(`${deck.name} — discard pile`, deckState.discardPile, "cards")}
              type="button"
            >
              <span>{deckState.discardPile.length}</span>
              <small>Discard</small>
            </button>
          </div>
        );
      })}
      <div className="advDeckRow neutral">
        {(["bronze", "silver", "gold", "azure"] as const).map((tier) => {
          const deckState = view.decks[NEUTRAL_DECK_IDS[tier]];
          if (!deckState) {
            return null;
          }
          return (
            <button
              className={`neutralDeck ${tier}`}
              key={tier}
              onClick={() => onShowPile(`Neutral ${tier} — discard pile`, deckState.discardPile, "units")}
              title={`Neutral ${tier} deck: ${deckState.drawCount} cards, ${deckState.discardPile.length} discarded`}
              type="button"
            >
              <span>{deckState.drawCount}</span>
              <small>{tier}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PileModal({
  title,
  cardIds,
  kind,
  onClose
}: {
  title: string;
  cardIds: string[];
  kind: "cards" | "units";
  onClose: () => void;
}) {
  return (
    <div className="pileModalBackdrop" onClick={onClose} role="dialog" aria-label={title}>
      <div className="pileModal" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{title}</strong>
          <button className="commandButton ghost" onClick={onClose} type="button">
            Close
          </button>
        </header>
        {cardIds.length === 0 ? <small>Empty.</small> : null}
        <ul>
          {[...cardIds].reverse().map((cardId, index) => {
            const card = kind === "cards" ? cardLibrary[cardId] : undefined;
            const unit = kind === "units" ? coreUnitDefinitions[cardId] : undefined;
            const image = card?.assets?.cardImage ?? unit?.neutral?.cardImage;
            return (
              <li key={`${cardId}-${index}`}>
                {image ? (
                  <img alt={card?.name ?? unit?.name ?? cardId} loading="lazy" referrerPolicy="no-referrer" src={image} />
                ) : (
                  <div className="pileFallback">{card?.name ?? unit?.name ?? cardName(cardId)}</div>
                )}
                <small>
                  {index === 0 ? "top · " : ""}
                  {card?.name ?? unit?.name ?? cardId}
                </small>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function PlacementPanel({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const combat = state.combat;
  const setup = combat?.setup;
  const player = state.players[viewerPlayerId];
  if (!combat || !setup || !player) {
    return null;
  }

  const myTurn = setup.pendingPlayerIds[0] === viewerPlayerId;
  const placed = setup.placedUnitIds[viewerPlayerId] ?? [];

  const placeActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }> } =>
      legal.action.type === "PLACE_COMBAT_UNIT"
  );
  const finish = legalActions.find((legal) => legal.action.type === "FINISH_COMBAT_PLACEMENT");
  const unplaceActions = legalActions.filter((legal) => legal.action.type === "UNPLACE_COMBAT_UNIT");

  const cellsForSelected = selectedUnitId
    ? placeActions.filter((legal) => legal.action.armyUnitId === selectedUnitId)
    : [];

  if (!myTurn) {
    const waitingOn = state.players[setup.pendingPlayerIds[0]]?.name ?? "the other side";
    return (
      <div className="placementPanel" aria-label="Combat setup">
        <strong>Combat setup</strong>
        <small>Waiting for {waitingOn} to deploy their army…</small>
      </div>
    );
  }

  return (
    <div className="placementPanel" aria-label="Deploy your units">
      <strong>
        Deploy up to {setup.unitLimit} units ({placed.length} placed)
      </strong>
      <div className="placementUnits">
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const isPlaced = placed.includes(unit.id);
          const canPlace = placeActions.some((legal) => legal.action.armyUnitId === unit.id);
          return (
            <button
              className={`placementUnit ${selectedUnitId === unit.id ? "selected" : ""} ${isPlaced ? "placed" : ""}`}
              disabled={!canPlace && !isPlaced}
              key={unit.id}
              onClick={() => {
                if (isPlaced) {
                  const unplace = unplaceActions.find(
                    (legal) => legal.action.type === "UNPLACE_COMBAT_UNIT" && legal.action.armyUnitId === unit.id
                  );
                  if (unplace) {
                    onAction(unplace.action);
                  }
                  return;
                }
                setSelectedUnitId(selectedUnitId === unit.id ? null : unit.id);
              }}
              type="button"
            >
              <span className={`tierDot ${def?.tier}`} />
              {unit.side} {def?.name ?? unit.unitDefId}
              {isPlaced ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      {selectedUnitId ? (
        <div className="placementCells">
          {cellsForSelected.map((legal) => (
            <button
              className="commandButton"
              key={actionKey(legal.action)}
              onClick={() => {
                onAction(legal.action);
                setSelectedUnitId(null);
              }}
              type="button"
            >
              {legal.label.split(" at ")[1] ?? legal.label}
            </button>
          ))}
          {cellsForSelected.length === 0 ? <small>No free spaces.</small> : null}
        </div>
      ) : (
        <small>Pick a unit, then a deployment space. Back line: row E. Front line: row D.</small>
      )}
      {finish ? (
        <button className="commandButton primary" onClick={() => onAction(finish.action)} type="button">
          Ready for battle
        </button>
      ) : null}
    </div>
  );
}

export function titleCaseLocation(location: string): string {
  return titleCase(location);
}
