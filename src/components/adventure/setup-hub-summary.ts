/**
 * Pure derivations for the lobby Setup Hub (the four-box map-setup screen):
 * which big mode card is active, the exact option payload each mode preset
 * sends, whether the Advanced settings deviate from the active mode's
 * defaults, and the per-box summary lines. No React — unit-testable.
 */
import {
  DRAFT_FORMAT_LABELS,
  HOUSE_RULES,
  defaultGameSetupOptions,
  mapSupportedModes,
  resolveHouseRules,
  scenarioDefinitions,
  tournamentRulesAllOn,
  type GameSetupOptions,
  type GameState,
  type PlayerId,
  type TableGameMode
} from "@/engine";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { DEFAULT_SETUP_STARTING_BUILDINGS } from "@/data/map/scenarios";

/** The four big setup-mode cards (one-click presets). */
export type SetupModeId = "legacy" | "binh" | "tournament" | "custom";

export const SETUP_MODE_LABELS: Record<SetupModeId, string> = {
  legacy: "Legacy — printed rulebook",
  binh: "BINH — house-rule edition",
  tournament: "Tournament — competitive preset",
  custom: "Custom — your saved setup"
};

/** The four Setup Hub boxes — one window, one owner, per group of choices. */
export type SetupHubBoxId = "mode" | "heroes" | "map" | "advanced";

export const SETUP_HUB_BOX_TITLES: Record<SetupHubBoxId, string> = {
  mode: "Game mode",
  heroes: "Heroes & Draft",
  map: "Map",
  advanced: "Advanced settings"
};

/** Short mode names for the Game-mode box summary and the cross-window strip. */
export const SETUP_HUB_MODE_NAMES: Record<SetupModeId, string> = {
  legacy: "Legacy — printed rulebook",
  binh: "BINH — house-rule edition",
  tournament: "Tournament — competitive",
  custom: "Custom — your saved setup"
};

/**
 * Whether a DESIGNED map is genuinely in play — the ONE predicate every surface
 * must use (the Map box summary, the Map window's list/"in play" marks and the
 * classic Map & Setup picker). It mirrors the engine build exactly:
 * `createAdventureGameState` reads `setupOptions.customMap?.length`, so an
 * EMPTY tile plan is not a map at all — the game falls back to the scenario
 * layout. A surface testing only `Boolean(options.customMap)` would mark such a
 * plan "in play" while the Map box (and the real game) still showed the
 * scenario sheet.
 */
export function designedMapInPlay(options: GameSetupOptions): boolean {
  return Boolean(options.customMap && options.customMap.length > 0);
}

/**
 * Why a saved designed map cannot be applied, or null when it can. Shared by
 * both map pickers so they refuse the same records: an empty tile plan is
 * refused because applying it would silently leave the scenario layout in play
 * (see `designedMapInPlay`).
 */
export function designedMapBlockers(tileCount: number, planProblems: string[]): string[] {
  return tileCount === 0
    ? ["This map has no tiles — open it in the map designer and place some.", ...planProblems]
    : planProblems;
}

/**
 * CO-OP (step 6) — the TABLE mode, a separate axis from the four rule presets
 * above. ABSENT means clash everywhere in the engine, so this collapses the
 * missing field once and every surface reads it instead of re-testing
 * `=== "coop"`.
 */
export function tableGameMode(options: GameSetupOptions): TableGameMode {
  return options.gameMode === "coop" ? "coop" : "clash";
}

export const TABLE_MODE_LABELS: Record<TableGameMode, string> = {
  clash: "Clash — free-for-all",
  coop: "Co-op — humans vs computers"
};

export const TABLE_MODE_BLURBS: Record<TableGameMode, string> = {
  clash: "Every seat plays for itself. Computer enemies may still be added.",
  coop: "All human players are one alliance against the computer enemies. Unranked."
};

/**
 * Whether each table mode may be picked here, and the reason when it may not.
 * The ONLY rule is the picked map's declared support, read through the ENGINE's
 * own `mapSupportedModes` — the same predicate `startAdventureFromLobby` uses to
 * REFUSE the start — so the buttons can never offer a mode the start check will
 * then reject. A map that declares nothing (every built-in scenario, every
 * legacy designed map) allows both.
 */
export function tableModeAvailability(
  options: GameSetupOptions
): Record<TableGameMode, { allowed: boolean; reason?: string }> {
  const modes = mapSupportedModes(options.customMapPreset);
  return {
    clash: {
      allowed: modes.clash,
      reason: modes.clash ? undefined : "This map is designed for Co-op only."
    },
    coop: {
      allowed: modes.coop,
      reason: modes.coop ? undefined : "This map is designed for Clash only."
    }
  };
}

/**
 * Whether a Raid Bosses module is on — the UI MIRROR of `raidBossesOn` in
 * `createAdventureGameState`, which drops a `slay-raid-boss` win condition (with
 * a public feed line) when this is false. Kept here rather than imported so this
 * UI step touches no engine file; if the engine read ever changes, this must
 * move with it (pinned by the four-combination case in setup-hub-summary.test.ts).
 */
export function raidBossModuleEnabled(options: GameSetupOptions): boolean {
  return (
    Boolean(options.wog?.enabled && options.wog?.raidBosses) ||
    Boolean(options.anime?.enabled && options.anime?.raidBosses)
  );
}

/** Which big mode card is highlighted from the current options. */
export function deriveActiveSetupMode(options: GameSetupOptions): SetupModeId {
  if (options.customMode) {
    return "custom";
  }
  if (tournamentRulesAllOn(options) && options.ruleset === "legacy" && options.difficulty === "hard") {
    return "tournament";
  }
  if (options.ruleset === "legacy") {
    return "legacy";
  }
  return "binh";
}

/**
 * The exact SET_GAME_OPTIONS payload each mode preset sends (minus the
 * `wog`/`anime` disables, which spread the CURRENT mod options at the call
 * site). Shared by the mode cards' applySetupMode and by the
 * advanced-settings baseline below — one source, no drift.
 */
export const MODE_PRESET_PAYLOADS: Record<Exclude<SetupModeId, "custom">, Partial<GameSetupOptions>> = {
  legacy: {
    customMode: false,
    ruleset: "legacy",
    spellBook: false,
    tournamentMode: false,
    tournamentBanDiplomacy: false,
    tournamentBanHourglass: false,
    tournamentSecondPlayerMorale: false
  },
  binh: {
    customMode: false,
    ruleset: "binh",
    spellBook: true,
    tournamentMode: false,
    tournamentBanDiplomacy: false,
    tournamentBanHourglass: false,
    tournamentSecondPlayerMorale: false
  },
  tournament: {
    customMode: false,
    ruleset: "legacy",
    // Every rule at its LEGACY default (a blanket `false` would silently flip
    // default-ON legacy rules — e.g. `torso-of-legion-major`, whose registry
    // comment explains why defaulting it OFF re-tiers/re-prices the card),
    // plus the tournament headline: tier-split Spell / Artifact decks.
    houseRules: resolveHouseRules({
      ruleset: "legacy",
      houseRules: { "split-decks": true }
    }) as NonNullable<GameSetupOptions["houseRules"]>,
    spellBook: false,
    tournamentMode: true,
    tournamentBanDiplomacy: true,
    tournamentBanHourglass: true,
    tournamentSecondPlayerMorale: true,
    tournamentObservatoryRerotate: true,
    difficulty: "hard",
    pvpNeutralControl: true,
    events: false,
    moraleCards: false
  }
};

/** Difficulty picks (shared by the Map window's chess bar and the classic chip row). */
export const DIFFICULTY_CHOICES: { id: GameSetupOptions["difficulty"]; label: string; hint: string }[] = [
  {
    id: "easy",
    label: "Easy",
    hint: "Smallest guard armies. Starting bonus: Roll 2 Resource Dice and receive Resources from both — OR — Search (2) the Artifact Deck, twice."
  },
  {
    id: "normal",
    label: "Normal",
    hint: "Printed baseline guards. Starting bonus: Roll 2 Resource Dice and receive the Resources from one of them — OR — Search (2) the Artifact Deck."
  },
  {
    id: "hard",
    label: "Hard",
    hint: "Stronger guards. Starting bonus: Roll 1 Resource Die and receive the Resources on it — OR — reveal cards until you find 1 Minor Artifact (to hand)."
  },
  {
    id: "impossible",
    label: "Impossible",
    hint: "Default — strongest guards. No starting bonus."
  }
];

/**
 * The option keys OWNED by the Advanced-settings box (everything in the full
 * options panel except the Game-mode box's keys — customMode, ruleset, the
 * tournament flags, wog, anime — and the Map box's keys — scenarioId,
 * playerCount, the customMap fields, difficulty). A deviation in any of these
 * from the active mode's baseline reads as "Customized".
 */
const ADVANCED_OWNED_KEYS = [
  "victoryMode",
  "pvpTroopLoss",
  "dragonUtopiaGuards",
  "creatureBanks",
  "fieldOverrides",
  "fieldOverridePlacement",
  "events",
  "victoryPoints",
  "victoryPointsRoundLimit",
  "customWinConditions",
  "spellBook",
  "moraleCards",
  "pvpNeutralControl",
  "pvpNeutralControlMustAttack",
  "parallelTurns",
  "undoMoves",
  "manualGuardControl",
  "startingHandMulligan",
  "unitExperience",
  "farTileOpening",
  "farTilesPerPlayer",
  "farTileBlindChoice",
  "farTileTypeChoice",
  "startingResources",
  "startingProduction",
  "startingUnitTiers",
  "startingUnits",
  "startingBuildings"
] as const satisfies readonly (keyof GameSetupOptions)[];

/**
 * Engine defaults for the advanced keys the fresh-lobby baseline leaves UNSET
 * (absent means this value at build time). Needed so an explicit toggle set
 * back to its default still reads "Default" — e.g. `events: false` equals an
 * absent `events`, while `creatureBanks: true` equals an absent
 * `creatureBanks` (its default is ON).
 */
const ADVANCED_KEY_DEFAULTS: Partial<Record<keyof GameSetupOptions, unknown>> = {
  creatureBanks: true,
  fieldOverrides: false,
  fieldOverridePlacement: "manual-or-refuse",
  events: false,
  victoryPoints: false,
  victoryPointsRoundLimit: 0,
  customWinConditions: [],
  parallelTurns: 0,
  undoMoves: false,
  unitExperience: false
};

/** Deep-equal via JSON — the compared values are plain option data. */
function sameOptionValue(a: unknown, b: unknown): boolean {
  const norm = (value: unknown) => (value === undefined || value === null ? null : value);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Whether the Advanced settings deviate from the active mode's defaults.
 * Baseline = a fresh LOBBY's options for this scenario with the active mode's
 * preset payload applied — so a just-clicked Legacy/BINH/Tournament table
 * reads "Default". `customMode` short-circuits honestly (a custom setting
 * file IS a customized setup). House rules compare RESOLVED (mode defaults
 * folded in), so an explicit toggle set back to its default stays "Default".
 *
 * LIMIT: the baseline is the LOBBY baseline (what the Setup Hub always
 * renders). A raw `defaultGameSetupOptions(scenario)` object — only reachable
 * through a direct `createAdventureGameState` build, never through the hub —
 * differs in `startingBuildings` and would read "Customized".
 */
export function advancedSettingsChanged(options: GameSetupOptions): { changed: boolean; label: string } {
  const mode = deriveActiveSetupMode(options);
  if (mode === "custom") {
    return { changed: true, label: "Custom setup file" };
  }
  const scenario = scenarioDefinitions[options.scenarioId];
  if (!scenario) {
    return { changed: false, label: "Default" };
  }
  const baseline: GameSetupOptions = { ...defaultGameSetupOptions(scenario), ...MODE_PRESET_PAYLOADS[mode] };
  // A fresh LOBBY (createAdventureLobbyState / buildAdventureFromLobby) pre-builds
  // the three universal core town cards when the scenario authors none — that is
  // the honest "Default", not defaultGameSetupOptions' empty list.
  if (scenario.startingBuildings.length === 0) {
    baseline.startingBuildings = [...DEFAULT_SETUP_STARTING_BUILDINGS];
  }
  const currentRules = resolveHouseRules(options);
  const baselineRules = resolveHouseRules(baseline);
  if (!sameOptionValue(currentRules, baselineRules)) {
    return { changed: true, label: "Customized" };
  }
  for (const key of ADVANCED_OWNED_KEYS) {
    // Resolve "absent" on either side: the baseline's explicit value wins,
    // else the key's engine default (absent == that value at build time).
    const fallback = key in ADVANCED_KEY_DEFAULTS ? ADVANCED_KEY_DEFAULTS[key] : undefined;
    const baseValue = baseline[key] === undefined || baseline[key] === null ? fallback : baseline[key];
    const currentValue = options[key] === undefined || options[key] === null ? baseValue : options[key];
    if (!sameOptionValue(currentValue, baseValue)) {
      return { changed: true, label: "Customized" };
    }
  }
  return { changed: false, label: "Default" };
}

export type HeroesBoxSummary = {
  formatLabel: string;
  /** The viewer's own pick, e.g. "Castle — Christian"; null while unpicked / observer. */
  yourPick: string | null;
  picked: number;
  seats: number;
  /**
   * Computer seats at this table. CO-OP (step 6): controller-driven, NOT
   * session-gated — a multiplayer lobby may hold computer enemies too, and the
   * Heroes box has to count them or it under-reports the seats. An all-human
   * table still reports 0 (CONTROL-pinned).
   */
  computers: number;
};

export function heroesSummary(state: GameState, viewerPlayerId: PlayerId): HeroesBoxSummary | null {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const format = lobby.draft?.format ?? "open";
  const mySeat = lobby.seats.find((seat) => seat.playerId === viewerPlayerId);
  const faction = mySeat?.factionId ? coreFactionDefinitions[mySeat.factionId] : null;
  const hero = mySeat?.heroDefId ? coreHeroDefinitions[mySeat.heroDefId] : null;
  const yourPick = faction ? `${faction.name}${hero ? ` — ${hero.name}` : ""}` : null;
  return {
    formatLabel: DRAFT_FORMAT_LABELS[format],
    yourPick,
    picked: lobby.seats.filter((seat) => seat.factionId && seat.heroDefId).length,
    seats: lobby.seats.length,
    computers: lobby.seats.filter((seat) => state.controllers?.[seat.playerId]?.kind === "computer").length
  };
}

export type MapBoxSummary = {
  name: string;
  seats: number;
  difficulty: GameSetupOptions["difficulty"];
  difficultyLabel: string;
  /** Whether a designed (custom) map is applied, vs a built-in scenario sheet. */
  designed: boolean;
};

/**
 * One entry of the cross-window strip: the box, its title, its headline value
 * and a second, dimmer line — the same two-line shape the boxes themselves use,
 * so neither line has to be squeezed into an ellipsis.
 */
export type SetupHubNavItem = { id: SetupHubBoxId; title: string; value: string; detail?: string };

/**
 * The live value of EVERY box, for the strip each Setup Hub window shows at the
 * top. It is derived from the same `setupLobby.options` the boxes read, so the
 * strip can never disagree with them — that shared derivation IS the connection
 * between the windows (open Advanced settings and you still see which map, mode
 * and difficulty the table is on, one click from changing any of them).
 */
export function setupHubNavItems(state: GameState, viewerPlayerId: PlayerId): SetupHubNavItem[] {
  const lobby = state.setupLobby;
  if (!lobby) {
    return [];
  }
  const options = lobby.options;
  const mods = [options.wog?.enabled ? "WOG" : null, options.anime?.enabled ? "Anime" : null].filter(Boolean);
  const heroes = heroesSummary(state, viewerPlayerId);
  const map = mapSummary(state);
  // CO-OP (step 6): the table mode joins the Game-mode chip's second line only
  // when it is CO-OP. Clash is the absent default — every table has always been
  // one — so naming it would add a line to every lobby that ever existed; the
  // Game-mode window itself always shows both buttons.
  const modeDetail = [
    tableGameMode(options) === "coop" ? "Co-op" : null,
    mods.length ? `Mods: ${mods.join(" + ")}` : null
  ].filter(Boolean);
  return [
    {
      id: "mode",
      title: SETUP_HUB_BOX_TITLES.mode,
      value: SETUP_HUB_MODE_NAMES[deriveActiveSetupMode(options)],
      detail: modeDetail.length ? modeDetail.join(" · ") : undefined
    },
    {
      id: "heroes",
      title: SETUP_HUB_BOX_TITLES.heroes,
      value: heroes ? heroes.yourPick ?? "no town yet" : "—",
      detail: heroes ? `${heroes.formatLabel} · ${heroes.picked}/${heroes.seats} picked` : undefined
    },
    {
      id: "map",
      title: SETUP_HUB_BOX_TITLES.map,
      value: map ? map.name : "—",
      detail: map ? `${map.seats} players · ${map.difficultyLabel}` : undefined
    },
    { id: "advanced", title: SETUP_HUB_BOX_TITLES.advanced, value: advancedSettingsChanged(options).label }
  ];
}

export function mapSummary(state: GameState): MapBoxSummary | null {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const options = lobby.options;
  const scenario = scenarioDefinitions[options.scenarioId];
  const designed = designedMapInPlay(options);
  return {
    name: (designed ? options.customMapName : null) ?? scenario?.name ?? options.scenarioId,
    seats: lobby.seats.length,
    difficulty: options.difficulty,
    difficultyLabel: DIFFICULTY_CHOICES.find((choice) => choice.id === options.difficulty)?.label ?? options.difficulty,
    designed
  };
}
