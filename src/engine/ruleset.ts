import type { UnitSideDefinition } from "@/data/factions/types";
import type {
  CardLibrary,
  CardPlayMode,
  DeckId,
  GameRuleset,
  GameState,
  HeroState,
  PlayerId,
  PlayerState,
  VictoryMode
} from "./state";

/**
 * Rules-variant helpers. "legacy" plays the community rulebook as printed;
 * "binh" layers the BINH house rules on top. Every mode-dependent number or
 * behaviour funnels through this module so the two modes stay auditable.
 */

export function getRuleset(state: Pick<GameState, "ruleset">): GameRuleset {
  return state.ruleset ?? "legacy";
}

export const RULESET_LABELS: Record<GameRuleset, string> = {
  legacy: "Legacy (rulebook)",
  binh: "House rules BINH"
};

export const RULESET_DESCRIPTIONS: Record<GameRuleset, string> = {
  legacy:
    "The community rulebook as printed: one shared Spell deck, one Artifact deck, printed card values.",
  binh:
    "BINH house rules: Basic/Expert Spell decks and Minor/Major/Relic Artifact decks with level and map gating, " +
    "Wisdom expert −3 gold, Estates 2/4 gold, Few Griffins 3 attack, Pack Griffins 1 defense, Pack Marksmen 3 HP, " +
    "and Sandro's Horde/Legion of Skeletons fight with 3 HP."
};

export const VICTORY_MODE_LABELS: Record<VictoryMode, string> = {
  conquest: "Conquest",
  grail: "Grail Hunt",
  "dragon-hunt": "Dragon Hunt",
  "dragon-conqueror": "Dragon Conqueror"
};

export const VICTORY_MODE_DESCRIPTIONS: Record<VictoryMode, string> = {
  conquest: "Flag an enemy faction Town to win — the classic skirmish goal.",
  grail:
    "Win either way: capture the Grail (defeat its Lvl-VII guard, dig it for 1 movement point, then carry it " +
    "home to your town), or beat every enemy hero in combat at least once (only 2 of the 3 in a 4-player game). " +
    "A Grail is guaranteed on a Center tile; the Dragon Utopia is just a creature bank here.",
  "dragon-hunt":
    "Win either way: defeat the Dragon Utopia (no need to hold it afterwards), or beat every enemy hero in combat " +
    "at least once (only 2 of the 3 in a 4-player game). A Dragon Utopia is guaranteed on a Center tile.",
  "dragon-conqueror":
    "Defeat the Dragon Utopia to capture it, then hold it. The holder garrisons the Utopia and rivals must " +
    "besiege it (Walls, Gate, Arrow Tower) to take it. Control the Utopia at the start of your turn to win."
};

export const PVP_TROOP_LOSS_LABELS: Record<"normal" | "none", string> = {
  normal: "Lose troops",
  none: "Keep troops"
};

export const PVP_TROOP_LOSS_DESCRIPTIONS: Record<"normal" | "none", string> = {
  normal: "Player-vs-player Combat costs casualties as normal: destroyed unit cards leave the army and damaged Packs flip to Few.",
  none: "Friendly fights: after a player-vs-player Combat neither side loses any units. The winner is still decided (the loser pays gold, loses morale and retreats), but no troops are lost. Fights against Neutral guards are unaffected."
};

// ---------------------------------------------------------------------------
// Unit stat overrides (BINH)
// ---------------------------------------------------------------------------

/**
 * BINH unit tweaks. Returns the side definition to actually fight with:
 *  - Few Griffins: 3 attack (printed 2)
 *  - Pack Griffins: 1 defense (printed 0)
 *  - Pack Marksmen: 3 HP (printed 2)
 *
 * Cerberi play by the printed card (1 flat damage to one adjacent enemy) in
 * both modes — no longer a BINH override.
 */
export function applyUnitSideRules(
  ruleset: GameRuleset,
  unitDefId: string,
  side: "few" | "pack" | "neutral",
  definition: UnitSideDefinition
): UnitSideDefinition {
  if (ruleset !== "binh") {
    return definition;
  }

  if (unitDefId === "castle.griffins" && side === "few") {
    return { ...definition, attack: 3 };
  }
  if (unitDefId === "castle.griffins" && side === "pack") {
    return { ...definition, defense: 1 };
  }
  if (unitDefId === "castle.marksmen" && side === "pack") {
    return { ...definition, health: 3 };
  }

  return definition;
}

/**
 * BINH house rule for Sandro's Cloak of the Undead King: the skeleton
 * upgrades — Horde of Skeletons (level I) and Legion of Skeletons (level
 * VI) — fight with 3 HP instead of the printed 2. The level IV Horde of
 * Zombies keeps its printed 3 HP in both modes.
 */
export function specialtyTransformHealth(ruleset: GameRuleset, specialtyCardId: string, printedHealth: number): number {
  if (ruleset === "binh" && (specialtyCardId === "specialty.sandro.1" || specialtyCardId === "specialty.sandro.6")) {
    return 3;
  }
  return printedHealth;
}

// ---------------------------------------------------------------------------
// Wisdom and Estates values
// ---------------------------------------------------------------------------

/** Gold discount Wisdom gives on a Mage Guild spell purchase. */
export function wisdomGoldDiscount(ruleset: GameRuleset, mode: CardPlayMode): number {
  if (ruleset === "binh") {
    return mode === "expert" ? 3 : 2;
  }
  // Printed card: "reduced by 2 gold" at both levels.
  return 2;
}

/** Search size Wisdom upgrades the Mage Guild purchase to (printed 3/4). */
export function wisdomSearchCount(mode: CardPlayMode): number {
  return mode === "expert" ? 4 : 3;
}

/** Gold gained by playing Estates (printed 3/6, BINH 2/4). */
export function estatesGold(ruleset: GameRuleset, mode: CardPlayMode): number {
  if (ruleset === "binh") {
    return mode === "expert" ? 4 : 2;
  }
  return mode === "expert" ? 6 : 3;
}

// ---------------------------------------------------------------------------
// Split decks (BINH): Basic/Expert spells, Minor/Major/Relic artifacts
// ---------------------------------------------------------------------------

export const SPELL_DECK_BASIC: DeckId = "spells";
export const SPELL_DECK_EXPERT: DeckId = "spells-expert";
export const ARTIFACT_DECK_SINGLE: DeckId = "artifacts";
export const ARTIFACT_DECK_MINOR: DeckId = "artifacts-minor";
export const ARTIFACT_DECK_MAJOR: DeckId = "artifacts-major";
export const ARTIFACT_DECK_RELIC: DeckId = "artifacts-relic";

export function isSpellDeck(deckId: DeckId): boolean {
  return deckId === SPELL_DECK_BASIC || deckId === SPELL_DECK_EXPERT;
}

export function isArtifactDeck(deckId: DeckId): boolean {
  return (
    deckId === ARTIFACT_DECK_SINGLE ||
    deckId === ARTIFACT_DECK_MINOR ||
    deckId === ARTIFACT_DECK_MAJOR ||
    deckId === ARTIFACT_DECK_RELIC
  );
}

export const DECK_DISPLAY_NAMES: Record<string, string> = {
  spells: "Spells",
  "spells-expert": "Expert Spells",
  abilities: "Abilities",
  artifacts: "Artifacts",
  "artifacts-minor": "Minor Artifacts",
  "artifacts-major": "Major Artifacts",
  "artifacts-relic": "Relic Artifacts"
};

/** In BINH mode the basic spell deck is labelled accordingly. */
export function deckDisplayName(state: Pick<GameState, "ruleset">, deckId: DeckId): string {
  if (deckId === SPELL_DECK_BASIC && getRuleset(state) === "binh") {
    return "Basic Spells";
  }
  return DECK_DISPLAY_NAMES[deckId] ?? deckId;
}

/** Cards that let a hero draw Expert spells regardless of level/map (BINH). */
export const EXPERT_SPELL_KEY_CARDS = [
  "ability.eagle_eye",
  "ability.wisdom",
  "ability.basic_air_magic",
  "ability.basic_earth_magic",
  "ability.basic_fire_magic",
  "ability.basic_water_magic"
];

function playerOwnsAnyCard(state: GameState, playerId: PlayerId, cardIds: string[]): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  const owned = new Set([...player.hand, ...player.deck, ...player.discard]);
  if (cardIds.some((cardId) => owned.has(cardId))) {
    return true;
  }

  // Permanent effects already played count too (Basic X Magic in play).
  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.source.type === "card" &&
      cardIds.includes(effect.source.cardId)
  );
}

/** Tile group ("starting" | "far" | "near" | "center") the hero stands on. */
function heroTileGroup(state: GameState, hero: HeroState | null): string | null {
  if (!hero?.spaceId || !state.adventure) {
    return null;
  }

  const field = state.adventure.fields[hero.spaceId];
  const tile = field ? state.adventure.tiles[field.tileInstanceId] : null;
  if (!tile) {
    return null;
  }

  switch (tile.backLabel) {
    case "Ⅰ":
      return "starting";
    case "Ⅱ–Ⅲ":
      return "far";
    case "Ⅳ–Ⅴ":
      return "near";
    case "Ⅵ–Ⅶ":
      return "center";
    default:
      return null;
  }
}

/** Whether any IV–V (or deeper) tile has been revealed on the map. */
function anyNearOrCenterTileRevealed(state: GameState): boolean {
  const adventure = state.adventure;
  if (!adventure) {
    return false;
  }

  return Object.values(adventure.tiles).some(
    (tile) => !tile.faceDown && !tile.awaitingRotation && (tile.backLabel === "Ⅳ–Ⅴ" || tile.backLabel === "Ⅵ–Ⅶ")
  );
}

/**
 * BINH gate for the Expert Spell deck: heroes below level 4 — or before any
 * IV–V map tile is open — cannot draw from it, unless the hero owns a key
 * card (Eagle Eye, Wisdom, or a Basic elemental Magic).
 */
export function canDrawExpertSpells(state: GameState, playerId: PlayerId, hero: HeroState | null): boolean {
  if (getRuleset(state) !== "binh") {
    return false;
  }

  if (playerOwnsAnyCard(state, playerId, EXPERT_SPELL_KEY_CARDS)) {
    return true;
  }

  return (hero?.level ?? 1) >= 4 && anyNearOrCenterTileRevealed(state);
}

/** Whether the player's town has an artifact-granting building (Blacksmith). */
export function hasArtifactSource(state: GameState, playerId: PlayerId, buildingHasSmith: (buildingId: string) => boolean): boolean {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  return Boolean(town?.buildings.some((buildingId) => buildingHasSmith(buildingId)));
}

export type ArtifactDeckAccess = {
  minor: boolean;
  major: boolean;
  relic: boolean;
};

/**
 * BINH artifact deck gates:
 *  - Minor: always.
 *  - Major: hero on a IV–V or VI–VII tile, OR level ≥ 4 with an artifact
 *    source (Blacksmith / artifact-granting specialty).
 *  - Relic: hero on a VI–VII tile, OR level ≥ 6 with an artifact source.
 */
export function artifactDeckAccess(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState | null,
  artifactSource: boolean
): ArtifactDeckAccess {
  const group = heroTileGroup(state, hero);
  const level = hero?.level ?? 1;

  return {
    minor: true,
    major: group === "near" || group === "center" || (level >= 4 && artifactSource),
    relic: group === "center" || (level >= 6 && artifactSource)
  };
}

/** The spell decks this player may search right now (BINH-aware). */
export function eligibleSpellDecks(state: GameState, playerId: PlayerId, hero: HeroState | null): DeckId[] {
  if (getRuleset(state) !== "binh") {
    return [SPELL_DECK_BASIC];
  }

  const decks: DeckId[] = [SPELL_DECK_BASIC];
  if (canDrawExpertSpells(state, playerId, hero) && state.decks[SPELL_DECK_EXPERT]) {
    decks.push(SPELL_DECK_EXPERT);
  }
  return decks;
}

/** The artifact decks this player may search right now (BINH-aware). */
export function eligibleArtifactDecks(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState | null,
  artifactSource: boolean
): DeckId[] {
  if (getRuleset(state) !== "binh") {
    return [ARTIFACT_DECK_SINGLE];
  }

  const access = artifactDeckAccess(state, playerId, hero, artifactSource);
  const decks: DeckId[] = [ARTIFACT_DECK_MINOR];
  if (access.major && state.decks[ARTIFACT_DECK_MAJOR]) {
    decks.push(ARTIFACT_DECK_MAJOR);
  }
  if (access.relic && state.decks[ARTIFACT_DECK_RELIC]) {
    decks.push(ARTIFACT_DECK_RELIC);
  }
  return decks;
}

// ---------------------------------------------------------------------------
// Search-size modifiers (Wisdom purchases handled at the Spell Book action;
// Scouting applies to the next Search of any deck)
// ---------------------------------------------------------------------------

/** Applies and consumes a pending Scouting override on a search size. */
export function applySearchCountEffects(state: GameState, playerId: PlayerId, baseCount: number): number {
  let count = baseCount;
  const effect = state.activeEffects.find(
    (candidate) =>
      candidate.controllerId === playerId &&
      candidate.modifiers.some((modifier) => modifier.type === "SEARCH_COUNT_OVERRIDE")
  );

  if (effect) {
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SEARCH_COUNT_OVERRIDE") {
        count = Math.max(count, modifier.count);
      }
    }
    state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effect.id);
  }

  return count;
}

/** Pops a one-shot "repeat the next search" effect (Pendant of Courage). */
export function takeSearchRepeatEffect(state: GameState, playerId: PlayerId): boolean {
  const effect = state.activeEffects.find(
    (candidate) =>
      candidate.controllerId === playerId &&
      candidate.modifiers.some((modifier) => modifier.type === "SEARCH_REPEAT_ONCE")
  );
  if (!effect) {
    return false;
  }

  state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effect.id);
  return true;
}

/** Spell schools the player can fetch instead of searching (Basic X Magic). */
export function activeSchoolFetches(state: GameState, playerId: PlayerId): ("air" | "earth" | "fire" | "water")[] {
  const schools = new Set<"air" | "earth" | "fire" | "water">();
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_SCHOOL_FETCH" && modifier.school !== "any") {
        schools.add(modifier.school);
      }
    }
  }
  return [...schools];
}

// ---------------------------------------------------------------------------
// Ruleset-dependent card notes for the UI
// ---------------------------------------------------------------------------

/** Shown on the card popover when the active mode changes a printed value. */
export function rulesetCardNote(ruleset: GameRuleset, cardId: string): string | null {
  if (ruleset !== "binh") {
    return null;
  }

  switch (cardId) {
    case "ability.wisdom":
      return "BINH: basic −2 gold & Search (3); expert −3 gold & Search (4).";
    case "ability.estates":
      return "BINH: gain 2 gold (basic) / 4 gold (expert) instead of 3/6.";
    default:
      return null;
  }
}

/** Spell limit per combat round, including lasting bonuses. */
export function spellLimitFor(state: GameState, player: PlayerState): number {
  // Expert Intelligence "ignores the limit": the one-Spell-per-round cap no
  // longer applies to that player, so every limit check (which all derive from
  // this value) passes for as long as the effect is held.
  const ignoresLimit = state.activeEffects.some(
    (effect) =>
      effect.controllerId === player.id &&
      effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME" && modifier.ignoreSpellLimit === true)
  );
  if (ignoresLimit) {
    return Number.POSITIVE_INFINITY;
  }

  const effectBonus = state.activeEffects.reduce((total, effect) => {
    if (effect.controllerId !== player.id) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce(
        (sum, modifier) => (modifier.type === "SPELL_LIMIT_BONUS" ? sum + modifier.amount : sum),
        0
      )
    );
  }, 0);

  return 1 + player.combatStats.spellLimitBonusThisRound + effectBonus;
}

/** Expert uses available this round, including one-shot bonuses. */
export function expertUsesAvailable(player: PlayerState): number {
  return (
    player.limits.expertUses +
    (player.combatStats.expertUseBonusThisRound ?? 0) -
    player.combatStats.expertUsesSpentThisRound
  );
}

/** Whether a card id is a spell in the given library. */
export function isSpellCard(cards: CardLibrary, cardId: string): boolean {
  return cards[cardId]?.kind === "spell";
}
