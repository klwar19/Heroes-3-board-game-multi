/**
 * Combat Test (sandbox) free setup: choose factions, heroes, units, cards,
 * battlefield, WOG commanders and morale rules for both seats, then begin a
 * battle with that configuration.
 *
 * `createInitialGameState` remains the ready-to-fight Catherine-vs-Sandro
 * fixture used by unit tests. New Battle Test rooms open in the setup lobby
 * via `createCombatSandboxLobbyState` instead.
 */

import { cardLibrary } from "@/data/cards/library";
import {
  coreFactionDefinitions,
  coreHeroDefinitions,
  isPlayableFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { FactionId } from "@/data/factions/types";
import { COMMANDER_STAT_KEYS } from "@/data/commanders";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import { spellDeckBinhBasic, spellDeckBinhExpert, spellDeckLegacy } from "@/data/cards/spells";
import { EXPERT_USES_BY_LEVEL, HAND_LIMIT_BY_LEVEL } from "./adventure";
import {
  TOURNAMENT_REMOVED_ABILITY_ID,
  TOURNAMENT_REMOVED_ARTIFACT_ID
} from "./adventure-setup";
import { ATTACK_DIE_FACES } from "./battlefield";
import { makeInitialCommanderState } from "./commanders";
import { shuffleCards } from "./decks";
import { appendEvent, nextEventNumber } from "./events";
import { makeMoraleDecks } from "./morale-cards";
import { freshSeed } from "./seed";
import {
  DEFAULT_WOG_OPTIONS,
  type CardId,
  type CombatBoardArtId,
  type CombatSandboxPlayMode,
  type CombatSandboxSeatConfig,
  type CombatSandboxSetupState,
  type CombatSandboxUnitPick,
  type CommanderStatKey,
  type DeckState,
  type GameAction,
  type GameRuleset,
  type GameState,
  type PlayerId,
  type PlayerState,
  type WogModOptions
} from "./state";

const DEFAULT_HERO_LEVEL = 5;

/** Resolve the sandbox play-mode preset (default BINH for legacy snapshots). */
export function sandboxPlayMode(setup: CombatSandboxSetupState | null | undefined): CombatSandboxPlayMode {
  return setup?.playMode === "tournament" ? "tournament" : "binh";
}

/** Ruleset used by the fight: BINH house rules vs legacy (tournament). */
export function sandboxRulesetForMode(mode: CombatSandboxPlayMode): GameRuleset {
  return mode === "tournament" ? "legacy" : "binh";
}

const COMBAT_UNIT_LIMIT = 5;
const COMMANDER_COMBAT_UNIT_LIMIT = 4;

const DEFAULT_BOARD_ART_IDS: readonly CombatBoardArtId[] = [
  "classic",
  "frozen",
  "hell-necro",
  "jungle-fortress",
  "creature-bank-dungeon",
  "castle-siege",
  "ship-battle"
];

/** All battlefields a tester may force in the combat sandbox (including specials). */
export function sandboxBattlefieldChoices(): readonly CombatBoardArtId[] {
  return DEFAULT_BOARD_ART_IDS;
}

function makeSharedDeck(id: string, cardIds: string[], seed: string): DeckState {
  return {
    id,
    drawPile: shuffleCards(cardIds, `${seed}#deck#${id}`),
    discardPile: []
  };
}

function without(cardIds: string[], bannedId: string, ban: boolean): string[] {
  return ban ? cardIds.filter((id) => id !== bannedId) : cardIds;
}

function makeSandboxDecks(seed: string, mode: CombatSandboxPlayMode): Record<string, DeckState> {
  if (mode === "tournament") {
    // Legacy single decks + tournament Diplomacy / Hourglass bans.
    const lists: Record<string, string[]> = {
      spells: spellDeckLegacy,
      abilities: without(abilityDeckLegacy, TOURNAMENT_REMOVED_ABILITY_ID, true),
      artifacts: without(artifactDeckLegacy, TOURNAMENT_REMOVED_ARTIFACT_ID, true)
    };
    return Object.fromEntries(
      Object.entries(lists).map(([id, cardIds]) => [id, makeSharedDeck(id, cardIds, seed)])
    );
  }
  const lists: Record<string, string[]> = {
    spells: spellDeckBinhBasic,
    "spells-expert": spellDeckBinhExpert,
    abilities: abilityDeckBinh,
    "artifacts-minor": artifactDeckBinhMinor,
    "artifacts-major": artifactDeckBinhMajor,
    "artifacts-relic": artifactDeckBinhRelic
  };
  return Object.fromEntries(
    Object.entries(lists).map(([id, cardIds]) => [id, makeSharedDeck(id, cardIds, seed)])
  );
}

function clampHeroLevel(level: number | undefined): number {
  const n = Math.floor(level ?? DEFAULT_HERO_LEVEL);
  return Math.min(7, Math.max(1, n));
}

function clampMorale(value: number | undefined): number {
  const n = Math.floor(value ?? 0);
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function clampGrade(value: number | undefined): number {
  const n = Math.floor(value ?? 0);
  return n >= 3 ? 3 : n === 2 ? 2 : n === 1 ? 1 : 0;
}

function heroName(heroDefId: string, factionId: FactionId): string {
  const hero = coreHeroDefinitions[heroDefId];
  const faction = coreFactionDefinitions[factionId];
  const heroLabel = hero?.name ?? heroDefId;
  const factionLabel = faction?.name ?? factionId;
  return `${heroLabel} (${factionLabel})`;
}

function defaultHeroForFaction(factionId: FactionId): string {
  const heroes = Object.values(coreHeroDefinitions).filter((hero) => hero.faction === factionId);
  return heroes[0]?.id ?? "catherine";
}

function defaultUnitsForFaction(factionId: FactionId): CombatSandboxUnitPick[] {
  const roster = Object.values(coreUnitDefinitions).filter(
    (unit) => unit.faction === factionId && unit.pack
  );
  // Prefer pack bronze/silver picks so a default army has real printed abilities.
  const picks: CombatSandboxUnitPick[] = [];
  for (const unit of roster) {
    if (picks.length >= 3) {
      break;
    }
    if (unit.pack) {
      picks.push({ unitDefId: unit.id, side: "pack" });
    }
  }
  if (picks.length === 0) {
    // Fallback: any few side.
    for (const unit of roster) {
      if (picks.length >= 3) {
        break;
      }
      if (unit.few) {
        picks.push({ unitDefId: unit.id, side: "few" });
      }
    }
  }
  return picks;
}

function defaultHandForHero(heroDefId: string, level: number): CardId[] {
  const hero = coreHeroDefinitions[heroDefId];
  const hand: CardId[] = [];
  if (hero?.specialtyCardIds) {
    if (level >= 1) {
      hand.push(hero.specialtyCardIds[1]);
    }
    if (level >= 4) {
      hand.push(hero.specialtyCardIds[4]);
    }
    if (level >= 6) {
      hand.push(hero.specialtyCardIds[6]);
    }
  }
  if (hero?.startingAbilityCardId) {
    hand.push(hero.startingAbilityCardId);
  }
  // Always give Magic Arrow so a fresh seat can cast something.
  if (!hand.includes("spell.magic_arrow")) {
    hand.push("spell.magic_arrow");
  }
  return hand.filter((cardId) => Boolean(cardLibrary[cardId]));
}

function defaultSeat(playerId: PlayerId, factionId: FactionId, heroDefId: string): CombatSandboxSeatConfig {
  const level = DEFAULT_HERO_LEVEL;
  return {
    playerId,
    name: heroName(heroDefId, factionId),
    factionId,
    heroDefId,
    heroLevel: level,
    units: defaultUnitsForFaction(factionId),
    hand: defaultHandForHero(heroDefId, level),
    deck: [],
    morale: 0,
    moraleCards: { positive: [], negative: [] },
    commanderGrades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
    commanderGradePoints: 0
  };
}

/** Classic Catherine vs Sandro preset (matches the old hard-coded sandbox roster). */
function classicDefaultSetup(): CombatSandboxSetupState {
  return {
    seats: {
      p1: {
        playerId: "p1",
        name: "Catherine (Castle)",
        factionId: "castle",
        heroDefId: "catherine",
        heroLevel: DEFAULT_HERO_LEVEL,
        units: [
          { unitDefId: "castle.marksmen", side: "pack" },
          { unitDefId: "castle.griffins", side: "pack" },
          { unitDefId: "castle.crusaders", side: "pack" }
        ],
        hand: [
          "specialty.catherine.1",
          "stat.attack",
          "spell.magic_arrow",
          "spell.bloodlust",
          "artifact.centaurs_axe",
          "ability.offense",
          "spell.inferno",
          "spell.slayer",
          "spell.sorrow"
        ],
        deck: [
          "war_machine.first_aid_tent",
          "artifact.breastplate_of_petrified_wood",
          "ability.archery",
          "ability.luck",
          "spell.fortune",
          "stat.defense",
          "stat.power",
          "stat.attack"
        ],
        morale: 0,
        moraleCards: { positive: [], negative: [] },
        commanderGrades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
        commanderGradePoints: 0
      },
      p2: {
        playerId: "p2",
        name: "Sandro (Necropolis)",
        factionId: "necropolis",
        heroDefId: "sandro",
        heroLevel: DEFAULT_HERO_LEVEL,
        units: [
          { unitDefId: "necropolis.skeletons", side: "pack" },
          { unitDefId: "necropolis.vampires", side: "pack" },
          { unitDefId: "necropolis.dread_knights", side: "few" }
        ],
        hand: [
          "specialty.sandro.1",
          "stat.power",
          "stat.knowledge",
          "spell.magic_arrow",
          "artifact.buckler_of_the_gnoll_king",
          "ability.resistance"
        ],
        deck: [
          "artifact.ogres_club_of_havoc",
          "artifact.titans_gladius",
          "spell.stone_skin",
          "spell.cure",
          "spell.lightning_bolt",
          "stat.attack",
          "stat.defense"
        ],
        morale: 0,
        moraleCards: { positive: [], negative: [] },
        commanderGrades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
        commanderGradePoints: 0
      }
    },
    boardArtId: "classic",
    obstacles: [8, 11],
    moraleCards: false,
    wog: { ...DEFAULT_WOG_OPTIONS },
    playMode: "binh"
  };
}

function emptyLobbyPlayer(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    factionId: "castle",
    heroDefId: "catherine",
    deck: [],
    hand: [],
    discard: [],
    spellBook: [],
    removed: [],
    army: [],
    startingArmy: [],
    production: { gold: 0, buildingMaterials: 0, valuables: 0 },
    townTokens: { build: true, population: true, spellBook: true },
    morale: 0,
    moraleCards: { positive: [], negative: [] },
    resources: { gold: 10, buildingMaterials: 5, valuables: 1 },
    limits: {
      hand: HAND_LIMIT_BY_LEVEL[DEFAULT_HERO_LEVEL] ?? 6,
      expertUses: EXPERT_USES_BY_LEVEL[DEFAULT_HERO_LEVEL] ?? 2
    },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0
    }
  };
}

/**
 * Opens a Battle Test arena in free setup: both seats pre-filled with the
 * classic Catherine vs Sandro army, every option editable before Begin.
 */
export function createCombatSandboxLobbyState(seed = freshSeed("homm3bg-battle")): GameState {
  const setup = classicDefaultSetup();
  const playMode = sandboxPlayMode(setup);
  return {
    id: "combat-sandbox-lobby",
    seed,
    mode: "combat-sandbox",
    ruleset: sandboxRulesetForMode(playMode),
    wog: { ...setup.wog },
    round: 0,
    phase: "setup",
    activePlayerId: "p1",
    priorityPlayerId: null,
    turnOrder: ["p1", "p2"],
    players: {
      p1: emptyLobbyPlayer("p1", setup.seats.p1.name),
      p2: emptyLobbyPlayer("p2", setup.seats.p2.name)
    },
    adventure: null,
    combatSandboxSetup: setup,
    map: {
      spaces: {
        town_p1: { id: "town_p1", adjacent: ["field_center"] },
        town_p2: { id: "town_p2", adjacent: ["field_center"] },
        field_center: { id: "field_center", adjacent: ["town_p1", "town_p2"] }
      }
    },
    towns: {},
    heroes: {},
    combat: null,
    decks: makeSandboxDecks(seed, playMode),
    stack: [],
    reactionWindow: null,
    activeEffects: [],
    eventLog: [
      {
        id: "evt_1",
        type: "GAME_CREATED",
        message:
          "Battle Test setup: choose factions, units, cards, battlefield, morale and WOG options, then press Begin battle."
      }
    ],
    pendingChoice: null,
    turn: {
      mode: "simultaneous",
      simultaneousRoundLimit: 4,
      completedPlayerIds: [],
      observingPlayerId: null
    }
  };
}

function requireSandboxSetup(state: GameState): CombatSandboxSetupState {
  if (state.mode !== "combat-sandbox" || state.phase !== "setup" || !state.combatSandboxSetup) {
    throw new Error("Battle Test setup is only available before the fight begins.");
  }
  return state.combatSandboxSetup;
}

function validateUnitPick(pick: CombatSandboxUnitPick): void {
  const def = coreUnitDefinitions[pick.unitDefId];
  if (!def) {
    throw new Error(`Unknown unit ${pick.unitDefId}.`);
  }
  const side =
    pick.side === "few" ? def.few : pick.side === "pack" ? def.pack : def.neutral;
  if (!side) {
    throw new Error(`${def.name} has no ${pick.side} side.`);
  }
}

function validateCardId(cardId: CardId): void {
  if (!cardLibrary[cardId]) {
    throw new Error(`Unknown card ${cardId}.`);
  }
}

function unitLimitForWog(wog: WogModOptions): number {
  return wog.enabled && wog.commanders ? COMMANDER_COMBAT_UNIT_LIMIT : COMBAT_UNIT_LIMIT;
}

function normalizeSeat(
  seat: CombatSandboxSeatConfig,
  patch: Partial<CombatSandboxSeatConfig>,
  unitLimit: number
): CombatSandboxSeatConfig {
  const next: CombatSandboxSeatConfig = {
    ...seat,
    ...patch,
    moraleCards: {
      positive: patch.moraleCards?.positive ?? seat.moraleCards?.positive ?? [],
      negative: patch.moraleCards?.negative ?? seat.moraleCards?.negative ?? []
    },
    commanderGrades: {
      attack: 0,
      defense: 0,
      health: 0,
      damage: 0,
      magic: 0,
      speed: 0,
      ...seat.commanderGrades,
      ...patch.commanderGrades
    }
  };

  next.heroLevel = clampHeroLevel(next.heroLevel);
  next.morale = clampMorale(next.morale);
  next.commanderGradePoints = Math.max(0, Math.floor(next.commanderGradePoints ?? 0));

  for (const key of COMMANDER_STAT_KEYS) {
    next.commanderGrades![key] = clampGrade(next.commanderGrades?.[key]);
  }

  if (patch.factionId && patch.factionId !== seat.factionId && !patch.heroDefId) {
    // Faction change without an explicit hero: pick the first hero of the new town.
    next.heroDefId = defaultHeroForFaction(patch.factionId);
  }
  if (patch.factionId && patch.factionId !== seat.factionId && !patch.units) {
    next.units = defaultUnitsForFaction(patch.factionId);
  }
  if (
    (patch.factionId && patch.factionId !== seat.factionId) ||
    (patch.heroDefId && patch.heroDefId !== seat.heroDefId)
  ) {
    if (!patch.hand) {
      next.hand = defaultHandForHero(next.heroDefId, next.heroLevel);
    }
    if (!patch.name) {
      next.name = heroName(next.heroDefId, next.factionId);
    }
  } else if (!patch.name) {
    next.name = heroName(next.heroDefId, next.factionId);
  }

  if (!isPlayableFaction(next.factionId)) {
    throw new Error(`Faction ${next.factionId} is not playable.`);
  }
  const hero = coreHeroDefinitions[next.heroDefId];
  if (!hero) {
    throw new Error(`Unknown hero ${next.heroDefId}.`);
  }
  if (hero.faction !== next.factionId) {
    throw new Error(`${hero.name} is not a ${next.factionId} hero.`);
  }

  if (next.units.length > unitLimit) {
    next.units = next.units.slice(0, unitLimit);
  }
  for (const unit of next.units) {
    validateUnitPick(unit);
  }
  for (const cardId of next.hand) {
    validateCardId(cardId);
  }
  for (const cardId of next.deck) {
    validateCardId(cardId);
  }
  for (const cardId of next.moraleCards?.positive ?? []) {
    validateCardId(cardId);
  }
  for (const cardId of next.moraleCards?.negative ?? []) {
    validateCardId(cardId);
  }

  return next;
}

/** SANDBOX_CONFIGURE_SEAT: free-edit one seat's army / cards / hero / morale. */
export function sandboxConfigureSeat(
  state: GameState,
  action: Extract<GameAction, { type: "SANDBOX_CONFIGURE_SEAT" }>
): void {
  const setup = requireSandboxSetup(state);
  if (action.playerId !== "p1" && action.playerId !== "p2") {
    throw new Error("Only a battle seat may edit the setup.");
  }
  const seat = setup.seats[action.seatId];
  if (!seat) {
    throw new Error(`Unknown seat ${action.seatId}.`);
  }

  const unitLimit = unitLimitForWog(setup.wog);
  const { type: _t, playerId: _p, seatId: _s, ...patch } = action;
  setup.seats[action.seatId] = normalizeSeat(seat, patch, unitLimit);

  // Keep the live player nameplates in sync for the lobby UI.
  const player = state.players[action.seatId];
  if (player) {
    player.name = setup.seats[action.seatId].name;
    player.factionId = setup.seats[action.seatId].factionId;
    player.heroDefId = setup.seats[action.seatId].heroDefId;
  }

  appendEvent(state, {
    type: "SANDBOX_SETUP_CHANGED",
    message: `${state.players[action.playerId]?.name ?? action.playerId} updated ${action.seatId}'s battle setup.`
  });
}

/** SANDBOX_SET_OPTIONS: battlefield, morale cards, WOG modules, obstacles. */
export function sandboxSetOptions(
  state: GameState,
  action: Extract<GameAction, { type: "SANDBOX_SET_OPTIONS" }>
): void {
  const setup = requireSandboxSetup(state);
  if (action.playerId !== "p1" && action.playerId !== "p2") {
    throw new Error("Only a battle seat may edit the setup.");
  }

  const opts = action.options;
  if (opts.boardArtId !== undefined) {
    if (opts.boardArtId !== "random" && !DEFAULT_BOARD_ART_IDS.includes(opts.boardArtId)) {
      throw new Error(`Unknown battlefield ${opts.boardArtId}.`);
    }
    setup.boardArtId = opts.boardArtId;
  }
  if (opts.obstacles !== undefined) {
    setup.obstacles = [...new Set(opts.obstacles.filter((n) => n >= 0 && n < 20))].sort(
      (a, b) => a - b
    );
  }
  if (opts.moraleCards !== undefined) {
    setup.moraleCards = Boolean(opts.moraleCards);
  }
  if (opts.playMode !== undefined) {
    if (opts.playMode !== "binh" && opts.playMode !== "tournament") {
      throw new Error(`Unknown battle play mode ${String(opts.playMode)}.`);
    }
    setup.playMode = opts.playMode;
    state.ruleset = sandboxRulesetForMode(opts.playMode);
    // Rebuild shared decks for the chosen mode (BINH split vs tournament legacy).
    state.decks = makeSandboxDecks(state.seed, opts.playMode);
    // Tournament is competitive — WOG modules stay off with the preset
    // (tester can still re-enable WOG after switching modes if they want).
    if (opts.playMode === "tournament" && setup.wog.enabled) {
      setup.wog = { ...setup.wog, enabled: false, commanders: false, newObjects: false };
      state.wog = { ...setup.wog };
    }
  }
  if (opts.wog !== undefined) {
    const nextWog: WogModOptions = {
      ...DEFAULT_WOG_OPTIONS,
      ...setup.wog,
      ...opts.wog
    };
    // Commanders / modules require the WOG master switch.
    if (!nextWog.enabled) {
      nextWog.commanders = false;
      nextWog.newObjects = false;
    }
    setup.wog = nextWog;
    state.wog = { ...nextWog };

    // Trim armies if the commander module lowers the deploy cap.
    const limit = unitLimitForWog(nextWog);
    for (const seat of Object.values(setup.seats)) {
      if (seat.units.length > limit) {
        seat.units = seat.units.slice(0, limit);
      }
    }
  }

  appendEvent(state, {
    type: "SANDBOX_SETUP_CHANGED",
    message: `${state.players[action.playerId]?.name ?? action.playerId} updated battle options.`
  });
}

function buildPlayerFromSeat(seat: CombatSandboxSeatConfig, moraleCardsOn: boolean): PlayerState {
  const level = clampHeroLevel(seat.heroLevel);
  const commander =
    makeInitialCommanderState(seat.factionId) ??
    null;
  if (commander) {
    for (const key of COMMANDER_STAT_KEYS) {
      commander.grades[key as CommanderStatKey] = clampGrade(seat.commanderGrades?.[key]) as 0 | 1 | 2 | 3;
    }
    if ((seat.commanderGradePoints ?? 0) > 0) {
      commander.gradePoints = seat.commanderGradePoints;
    }
  }

  return {
    id: seat.playerId,
    name: seat.name,
    factionId: seat.factionId,
    heroDefId: seat.heroDefId,
    deck: [...seat.deck],
    hand: [...seat.hand],
    discard: [],
    spellBook: [],
    removed: [],
    army: seat.units.map((unit, index) => ({
      id: `army_${seat.playerId}_${index + 1}`,
      unitDefId: unit.unitDefId,
      side: unit.side
    })),
    startingArmy: seat.units.map((unit) => ({
      unitDefId: unit.unitDefId,
      side: unit.side === "neutral" ? ("few" as const) : unit.side
    })),
    production: { gold: 0, buildingMaterials: 0, valuables: 0 },
    townTokens: { build: true, population: true, spellBook: true },
    morale: moraleCardsOn ? 0 : clampMorale(seat.morale),
    moraleCards: {
      positive: moraleCardsOn ? [...(seat.moraleCards?.positive ?? [])] : [],
      negative: moraleCardsOn ? [...(seat.moraleCards?.negative ?? [])] : []
    },
    resources: { gold: 50, buildingMaterials: 10, valuables: 5 },
    limits: {
      hand: HAND_LIMIT_BY_LEVEL[level] ?? 6,
      expertUses: EXPERT_USES_BY_LEVEL[level] ?? 2
    },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0
    },
    ...(commander ? { commander } : {})
  };
}

/**
 * SANDBOX_BEGIN_COMBAT: materialise free setup into a PvP-style combat-setup
 * deployment. Both seats place their army on the board (attacker first, then
 * defender), then lock in with "Ready for battle" — exactly like a normal
 * hero-vs-hero fight. Commanders inject when placement finishes (finalizeCombatStart).
 */
export function sandboxBeginCombat(
  state: GameState,
  action: Extract<GameAction, { type: "SANDBOX_BEGIN_COMBAT" }>
): void {
  const setup = requireSandboxSetup(state);
  if (action.playerId !== "p1" && action.playerId !== "p2") {
    throw new Error("Only a battle seat may begin the fight.");
  }

  const p1 = setup.seats.p1;
  const p2 = setup.seats.p2;
  if (!p1 || !p2) {
    throw new Error("Both seats must be configured.");
  }
  // Each side must place at least one unit to finish deployment (same rule as
  // finishCombatPlacement), so both armies need something to field.
  if (p1.units.length === 0 || p2.units.length === 0) {
    throw new Error("Both sides need at least one unit to deploy.");
  }

  const moraleCardsOn = Boolean(setup.moraleCards);
  const wog: WogModOptions = {
    ...DEFAULT_WOG_OPTIONS,
    ...setup.wog,
    ...(setup.wog.enabled ? {} : { commanders: false, newObjects: false })
  };
  const unitLimit = unitLimitForWog(wog);

  const playMode = sandboxPlayMode(setup);
  state.wog = wog;
  state.ruleset = sandboxRulesetForMode(playMode);
  // Ensure decks match the chosen mode at fight start (covers a mode switch
  // that ran before decks were rebuilt, and legacy snapshots without playMode).
  state.decks = makeSandboxDecks(state.seed, playMode);
  state.sandboxRules = { moraleCards: moraleCardsOn };
  state.players = {
    p1: buildPlayerFromSeat(p1, moraleCardsOn),
    p2: buildPlayerFromSeat(p2, moraleCardsOn)
  };

  const level1 = clampHeroLevel(p1.heroLevel);
  const level2 = clampHeroLevel(p2.heroLevel);
  state.heroes = {
    hero_p1: {
      id: "hero_p1",
      controllerId: "p1",
      kind: "main",
      heroDefId: p1.heroDefId,
      level: level1,
      experience: 0,
      movementPoints: 3,
      movementPointsMax: 3,
      spaceId: "field_center"
    },
    hero_p2: {
      id: "hero_p2",
      controllerId: "p2",
      kind: "main",
      heroDefId: p2.heroDefId,
      level: level2,
      experience: 0,
      movementPoints: 3,
      movementPointsMax: 3,
      spaceId: "field_center"
    }
  };

  state.towns = {
    town_p1: {
      id: "town_p1",
      controllerId: "p1",
      buildings: ["village_hall"],
      factionId: p1.factionId
    },
    town_p2: {
      id: "town_p2",
      controllerId: "p2",
      buildings: ["village_hall"],
      factionId: p2.factionId
    }
  };

  // Shared wells stay (BINH complete catalog). Morale decks join when the rule is on.
  if (moraleCardsOn) {
    Object.assign(state.decks, makeMoraleDecks(state.seed));
  }

  const obstacles = new Set<number>(setup.obstacles ?? []);
  // Ship-battle art always carries the two mast obstacles.
  const boardArtId: CombatBoardArtId =
    setup.boardArtId === "random" ? "classic" : (setup.boardArtId ?? "classic");
  if (boardArtId === "ship-battle") {
    obstacles.add(9);
    obstacles.add(10);
  }

  // Empty board + combat-setup: same shape as startPlayerCombat for a PvP fight.
  // Attacker (p1) deploys first, then defender (p2); finishCombatPlacement →
  // beginPlayerCombatRounds → finalizeCombatStart (commanders, war machines…).
  state.combat = {
    id: `combat_${nextEventNumber(state)}`,
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    activeUnitId: null,
    context: { kind: "sandbox" },
    boardArtId,
    setup: {
      pendingPlayerIds: ["p1", "p2"],
      placedUnitIds: { p1: [], p2: [] },
      unitLimit
    },
    awaitingContinue: false,
    outcome: null,
    dice: {
      faces: [...ATTACK_DIE_FACES],
      seed: `${state.seed}-attack-die`,
      rollCount: 0
    },
    units: {},
    obstacles: [...obstacles].sort((a, b) => a - b)
  };

  state.phase = "combat-setup";
  state.round = 1;
  state.activePlayerId = "p1";
  state.priorityPlayerId = "p1";
  state.combatSandboxSetup = null;

  appendEvent(state, {
    type: "SANDBOX_COMBAT_BEGUN",
    message: `Deployment: ${p1.name} vs ${p2.name} on ${boardArtId}. Place your units, then Ready for battle.`,
    boardArtId,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2"
  });
}

/** Whether this combat-sandbox state is still in free setup (before Begin). */
export function isCombatSandboxSetup(state: GameState): boolean {
  return state.mode === "combat-sandbox" && state.phase === "setup" && Boolean(state.combatSandboxSetup);
}

/** Default seat factory for the UI "reset this seat" control. */
export function makeDefaultSandboxSeat(
  playerId: PlayerId,
  factionId: FactionId,
  heroDefId?: string
): CombatSandboxSeatConfig {
  const hero = heroDefId ?? defaultHeroForFaction(factionId);
  return defaultSeat(playerId, factionId, hero);
}
