import type { UnitSideDefinition } from "@/data/factions/types";
import { cardLibrary } from "@/data/cards/library";
import { EVERSMOKING_RING_OF_SULFUR_ID, TORSO_OF_LEGION_ID } from "@/data/cards/artifacts";
import { STARTING_ONLY_SPELLS } from "@/data/cards/spells";
import { balanceIntelligenceWindowClosed } from "./combat-timing";
import { armyUnitStacksActive, houseRuleEnabled } from "./house-rules";
import type {
  ArtifactDeckAccess,
  CardId,
  CardLibrary,
  CardPlayMode,
  DeckId,
  GameRuleset,
  GameState,
  HeroState,
  PlayerId,
  PlayerState,
  SpellSchool,
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
    "The community rulebook baseline: one shared Spell deck, one Artifact deck, printed card values; " +
    "embarking ends movement, but disembarking does not.",
  binh:
    "BINH house rules: Basic/Expert Spell decks and Minor/Major/Relic Artifact decks with level and map gating, " +
    "Wisdom expert −3 gold, Estates 2/4 gold, Few Griffins 3 attack, Pack Griffins 1 defense, Pack Marksmen 3 HP, " +
    "Sandro's Horde/Legion of Skeletons fight with 3 HP, and both embarking and disembarking end movement."
};

export const VICTORY_MODE_LABELS: Record<VictoryMode, string> = {
  conquest: "Conquest",
  grail: "Holy Grail",
  "dragon-hunt": "Dragon Hunt",
  "dragon-conqueror": "Dragon Conqueror"
};

export const VICTORY_MODE_DESCRIPTIONS: Record<VictoryMode, string> = {
  conquest:
    "Eliminate every rival faction. Flagging an enemy Town is not an instant win: it earns you a resource-gain " +
    "level (+5 gold, +2 materials, or +1 valuables) and starts their clock — a player with no Town and no " +
    "Settlement lasts 2 more turns before being removed. A held Settlement keeps them fighting. Last faction standing wins.",
  grail:
    "Win either way: capture the Holy Grail (defeat its Lvl-VII guard, visit 2 distinct Obelisks, dig for 1 " +
    "movement point, then carry it home to your town), or beat every enemy hero in combat at least once " +
    "(only 2 of the 3 in a 4-player game). The map seeds at least 2 Obelisks (designer presets count) and " +
    "up to 2 Grail dig sites when layout space allows. The Dragon Utopia is just a creature bank here.",
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
  definition: UnitSideDefinition,
  /**
   * Per-rule overrides from the individual house-rule toggles. When omitted each
   * flag falls back to the bundled mode default (`ruleset === "binh"`), so every
   * existing caller keeps its old behaviour; live callers pass the resolved
   * `griffin-buff` / `marksman-buff` flags so a table can flip either alone.
   */
  overrides?: { griffinBuff?: boolean; marksmanBuff?: boolean; phoenixPackRebirth?: boolean }
): UnitSideDefinition {
  const griffinBuff = overrides?.griffinBuff ?? ruleset === "binh";
  const marksmanBuff = overrides?.marksmanBuff ?? ruleset === "binh";
  const phoenixPackRebirth = overrides?.phoenixPackRebirth ?? ruleset === "binh";

  if (griffinBuff && unitDefId === "castle.griffins" && side === "few") {
    return { ...definition, attack: 3 };
  }
  if (griffinBuff && unitDefId === "castle.griffins" && side === "pack") {
    return { ...definition, defense: 1 };
  }
  if (marksmanBuff && unitDefId === "castle.marksmen" && side === "pack") {
    return { ...definition, health: 3 };
  }
  // BINH-only house rule: Pack Phoenixes also get Rebirth (the Few always has it
  // in printed data). Base game / Legacy plays the printed Pack — no Rebirth.
  if (
    phoenixPackRebirth &&
    unitDefId === "conflux.phoenixes" &&
    side === "pack" &&
    !definition.abilities.includes("phoenix-rebirth")
  ) {
    return {
      ...definition,
      abilities: [...definition.abilities, "phoenix-rebirth"]
    };
  }

  return definition;
}

/**
 * Resolve the unit-stat house-rule overrides for a live state — passed to
 * {@link applyUnitSideRules} / {@link applyUnitCurrentSide} so the Griffin and
 * Marksman buffs each honour their own toggle rather than the bundled mode.
 */
export function unitSideRuleOverrides(
  state: Pick<GameState, "ruleset" | "adventure" | "anime">
): {
  griffinBuff: boolean;
  marksmanBuff: boolean;
  polishUnitStacks: boolean;
  neutralRankUp: boolean;
  phoenixPackRebirth: boolean;
} {
  return {
    griffinBuff: houseRuleEnabled(state, "griffin-buff"),
    marksmanBuff: houseRuleEnabled(state, "marksman-buff"),
    // Army Stack layers: the Polish house rule OR the anime `unitStacks` module
    // (one machinery — see armyUnitStacksActive).
    polishUnitStacks: armyUnitStacksActive(state),
    // Neutral Rank-Up (optional module): the bank stat-recompute branch reads
    // the Far/Near round rank mirrored onto its combat unit. Field guards also
    // mirror their explicit tier-round rank (see unit-experience.ts).
    neutralRankUp: Boolean(state.adventure?.neutralRankUp),
    // Pack of Phoenixes Rebirth is a BINH HOUSE RULE ONLY — a plain
    // `houseRuleEnabled` read like every other unit toggle. The printed/wiki card
    // gives Rebirth to the FEW (and the Neutral azure) Phoenix only; the Pack has
    // the line attack + Fire immunity. So the BASE GAME (Legacy, registry
    // `legacyDefault` absent ⇒ OFF) plays the printed card, BINH defaults it ON
    // (registry `default: true`), and either mode may flip it explicitly — the
    // soft-Legacy convention shared by `griffin-buff` / `discovery-border-gate`.
    phoenixPackRebirth: houseRuleEnabled(state, "phoenix-pack-rebirth")
    // Unit Experience is NOT threaded through these overrides: the shared
    // veterancy machinery folds the rank bonus straight off `armyUnit.experience`
    // / the mirrored `unit.unitExperience` (see unit-experience.ts), which a card
    // only ever carries while the rule is on — no flag to pass here.
  };
}

/**
 * BINH house rule for Sandro's Cloak of the Undead King: the skeleton
 * upgrades — Horde of Skeletons (level I) and Legion of Skeletons (level
 * VI) — fight with 3 HP instead of the printed 2. The level IV Horde of
 * Zombies keeps its printed 3 HP in both modes.
 */
export function specialtyTransformHealth(
  ruleset: GameRuleset,
  specialtyCardId: string,
  printedHealth: number,
  /** `sandro-skeleton-hp` toggle; falls back to the bundled mode default. */
  enabled?: boolean
): number {
  const on = enabled ?? ruleset === "binh";
  if (on && (specialtyCardId === "specialty.sandro.1" || specialtyCardId === "specialty.sandro.6")) {
    return 3;
  }
  return printedHealth;
}

// ---------------------------------------------------------------------------
// Wisdom and Estates values
// ---------------------------------------------------------------------------

/**
 * Gold discount Wisdom gives on a Mage Guild spell purchase. The `expert`
 * discount is the house-rule buff (−3 vs the printed −2); `enabled` is the
 * `wisdom-expert-discount` toggle and falls back to the bundled mode default.
 * Basic is −2 in every mode.
 */
export function wisdomGoldDiscount(ruleset: GameRuleset, mode: CardPlayMode, enabled?: boolean): number {
  const on = enabled ?? ruleset === "binh";
  if (on && mode === "expert") {
    return 3;
  }
  // Printed card: "reduced by 2 gold" at both levels.
  return 2;
}

/** Search size Wisdom upgrades the Mage Guild purchase to (printed 3/4). */
export function wisdomSearchCount(mode: CardPlayMode): number {
  return mode === "expert" ? 4 : 3;
}

/**
 * Polish Balance Pack: the reprinted Wisdom's basic side is RELATIVE — "do Search
 * (X+2) instead of Search (X), once" — so the widen scales with the purchase's own
 * base count instead of the printed flat 3. The ONE constant the Mage-Guild
 * purchase label, its reducer spend and the build-round prompt all read.
 */
export const WISDOM_BALANCE_SEARCH_DELTA = 2;

/**
 * Gold gained by playing Estates (printed 3/6, BINH nerf 2/4). `enabled` is the
 * `estates-nerf` toggle and falls back to the bundled mode default.
 */
export function estatesGold(ruleset: GameRuleset, mode: CardPlayMode, enabled?: boolean): number {
  const nerf = enabled ?? ruleset === "binh";
  if (nerf) {
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

/** With the split decks on, the basic spell deck is labelled accordingly. */
export function deckDisplayName(state: Pick<GameState, "ruleset" | "adventure">, deckId: DeckId): string {
  if (deckId === SPELL_DECK_BASIC && houseRuleEnabled(state, "split-decks")) {
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

/**
 * The permanent cards this player has in play (war machines, Schools of Magic,
 * Basic X Magic, Pandora's permanents), oldest first. Read inline instead of
 * importing getPermanentCardIds from permanents.ts, which imports this module —
 * pulling it in here would create a cycle. Mirrors getPermanentCardIds exactly.
 */
function inPlayPermanentIds(player: PlayerState): CardId[] {
  return player.permanents ?? (player.permanent ? [player.permanent] : []);
}

function playerOwnsAnyCard(state: GameState, playerId: PlayerId, cardIds: string[]): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  const owned = new Set([...player.hand, ...player.deck, ...player.discard]);
  if (cardIds.some((cardId) => owned.has(cardId))) {
    return true;
  }

  // Permanent cards already played count too (Basic X Magic in play). The
  // School-of-Magic / Basic-Magic cards live ONLY in `player.permanents` — they
  // spawn no active effect (no combatEffect) — so reading permanents directly is
  // the only way to see them; scanning activeEffects alone would miss them.
  if (cardIds.some((cardId) => inPlayPermanentIds(player).includes(cardId))) {
    return true;
  }

  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.source.type === "card" &&
      cardIds.includes(effect.source.cardId)
  );
}

/** The Necropolis-only Ability and the faction allowed to draw it. */
export const NECROMANCY_ABILITY_ID = "ability.necromancy";
export const NECROPOLIS_FACTION_ID = "necropolis";

/**
 * Every card the player currently holds, across every zone they could later
 * draw it back from: hand, draw pile, discard, the Spell Book (house-rule stash
 * — a Book Spell is still owned and re-castable), cards held in play (ongoing
 * spells/abilities), spell scrolls, in-play permanents (Fire/Water/Air/Earth
 * Magic and Basic X Magic), and any permanent effect already on the table. Used
 * to stop a hero ever owning two copies of the same Ability/Spell — so Basic X
 * Magic and every shared-deck draw/search skip a Spell already stashed in the
 * Book, not just one in hand/deck/discard.
 */
function playerHeldCardIds(state: GameState, playerId: PlayerId): Set<CardId> {
  const player = state.players[playerId];
  if (!player) {
    return new Set();
  }

  const held = new Set<CardId>([
    ...player.hand,
    ...player.deck,
    ...player.discard,
    ...(player.spellBook ?? []),
    ...(player.spellBookUsed ?? [])
  ]);
  for (const ongoing of player.ongoingCards ?? []) {
    held.add(ongoing.cardId);
  }
  for (const scroll of player.scrolls ?? []) {
    for (const cardId of scroll.spellCardIds) {
      held.add(cardId);
    }
  }
  // In-play permanents: the School-of-Magic (Fire/Water/Air/Earth Magic) and
  // Basic X Magic ability cards sit ONLY in `player.permanents` and spawn no
  // active effect, so without this a hero holding one in play could still draw a
  // second copy from the Ability deck — the "permanent card still duplicates"
  // bug. War machines are permanents too, but they are never in the shared decks.
  for (const cardId of inPlayPermanentIds(player)) {
    held.add(cardId);
  }
  for (const effect of state.activeEffects) {
    if (effect.controllerId === playerId && effect.source.type === "card") {
      held.add(effect.source.cardId);
    }
  }
  return held;
}

/** Artifact card ids are the globally-unique cards (one of each in the game). */
function isArtifactCard(cardId: CardId): boolean {
  return cardId.startsWith("artifact.");
}

/**
 * The artifact tier the engine treats `cardId` as in THIS game — the ONE seam
 * every tier-read chokepoint routes through. Identical to the card's static
 * `artifactTier` for every artifact EXCEPT Torso of Legion, which BINH plays as
 * a MAJOR artifact by default (house rule `torso-of-legion-major`, default ON in
 * both modes). With that rule OFF the engine reads Torso as its PRINTED Minor
 * tier — Minor deck placement, Minor black-market/junk/event prices, Minor
 * Polish tier gates, Minor deck-return. Every other card returns its own tier
 * unchanged, so keying a chokepoint off this helper is byte-identical while the
 * rule is ON (or absent — the mode default is ON). Returns `undefined` for a
 * non-artifact card, exactly like a raw `card.artifactTier` read (callers keep
 * their `?? "minor"`).
 */
export function effectiveArtifactTier(
  state: Pick<GameState, "ruleset" | "adventure">,
  cardId: CardId
): "minor" | "major" | "relic" | undefined {
  if (cardId === TORSO_OF_LEGION_ID && !houseRuleEnabled(state, "torso-of-legion-major")) {
    return "minor";
  }
  // Torso-of-Legion pattern: the static tier is the rule-ON reading ("major");
  // with the rule OFF the engine reads the printed Minor tier.
  if (
    cardId === EVERSMOKING_RING_OF_SULFUR_ID &&
    !houseRuleEnabled(state, "eversmoking-ring-of-sulfur-major")
  ) {
    return "minor";
  }
  return cardLibrary[cardId]?.artifactTier;
}

/**
 * Whether ANY player currently holds `cardId` across every zone they could draw
 * it back from (hand/deck/discard/in-play/scroll). Artifacts are globally unique
 * — only one of each exists in the whole game — so an artifact held by any seat
 * may never be acquired by another.
 */
function anyPlayerHoldsCard(state: GameState, cardId: CardId): boolean {
  return Object.keys(state.players).some((playerId) => playerHeldCardIds(state, playerId).has(cardId));
}

/**
 * Whether `cardId` revealed from shared deck `deckId` is a legal pull for this
 * hero right now. The deck search must redraw past any card this returns false
 * for. Enforces three house rules:
 *  - a hero never takes a second copy of an Ability/Spell it already owns
 *    (the deck holds two of each, so different players can still each take one);
 *  - Necromancy is Necropolis-only — every other faction skips it entirely;
 *  - Magic Arrow (and any other starting-only Spell) is never drawn from a deck.
 */
export function canAcquireSharedDeckCard(
  state: GameState,
  playerId: PlayerId,
  deckId: DeckId,
  cardId: CardId
): boolean {
  if (STARTING_ONLY_SPELLS.includes(cardId)) {
    return false;
  }

  if (cardId === NECROMANCY_ABILITY_ID && state.players[playerId]?.factionId !== NECROPOLIS_FACTION_ID) {
    return false;
  }

  // Artifacts are globally unique: exactly one of each exists, shared across all
  // players, so no seat may take one any player already holds. Spells/Abilities
  // keep the per-player rule (the deck holds two copies, one per player).
  if (isArtifactCard(cardId)) {
    return !anyPlayerHoldsCard(state, cardId);
  }

  return !playerHeldCardIds(state, playerId).has(cardId);
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
 * Which Spell deck a Search may reach.
 *
 * OFFICIAL rule (house rule `deck-access-hero-level` OFF — the default): the TILE
 * the searching hero stands on decides, and nothing else. Starting and far tiles
 * (Ⅰ–Ⅲ) reach Basic Spells only; near (Ⅳ–Ⅴ) and centre (Ⅵ–Ⅶ) tiles reach the
 * Expert deck too (weaker cards stay allowed, so the choice is Basic OR Expert).
 * A "tile-agnostic" Search — playing an Artifact, activating the Mage Guild — uses
 * the MAIN hero's tile, which is what `hero` carries at those call sites.
 *
 * With the house rule ON, the old BINH tier-progression unlocks apply on TOP of
 * the tile band: hero level ≥ 4, OR any Ⅳ–Ⅴ (or deeper) tile revealed anywhere on
 * the map, OR owning a key card (Eagle Eye, Wisdom, a Basic elemental Magic).
 *
 * `ignoreKeyCards` drops that key-card bypass: buying spells at the **Mage
 * Guild** must be Basic-only until the hero actually reaches level 4 or a IV–V
 * tile is discovered — owning Wisdom/Eagle Eye/Basic Magic must NOT open the
 * Expert deck there (those cards keep their own Expert access via their own
 * effects and via other spell sources, which pass the bypass through). The map
 * Spell Scroll and Eagle Eye's combat dig reach the Expert deck directly and
 * never route through this gate at all. It is meaningless while the house rule is
 * off (there are no key-card unlocks to drop).
 */
export function canDrawExpertSpells(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState | null,
  options?: { ignoreKeyCards?: boolean }
): boolean {
  if (!houseRuleEnabled(state, "split-decks")) {
    return false;
  }

  // Official: the hero's own tile band is the whole rule.
  const group = heroTileGroup(state, hero);
  if (group === "near" || group === "center") {
    return true;
  }

  if (!houseRuleEnabled(state, "deck-access-hero-level")) {
    return false;
  }

  if (!options?.ignoreKeyCards && playerOwnsAnyCard(state, playerId, EXPERT_SPELL_KEY_CARDS)) {
    return true;
  }

  return (hero?.level ?? 1) >= 4 || anyNearOrCenterTileRevealed(state);
}

/** Whether the player's town has an artifact-granting building (Blacksmith). */
export function hasArtifactSource(state: GameState, playerId: PlayerId, buildingHasSmith: (buildingId: string) => boolean): boolean {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  return Boolean(town?.buildings.some((buildingId) => buildingHasSmith(buildingId)));
}

export type { ArtifactDeckAccess };

/**
 * Which Artifact decks a Search may reach.
 *
 * OFFICIAL rule (house rule `deck-access-hero-level` OFF — the default): the TILE
 * the hero stands on decides, and nothing else:
 *  - Minor: always (starting & far tiles Ⅰ–Ⅲ, and every deeper band too);
 *  - Major: hero on a near (Ⅳ–Ⅴ) or centre (Ⅵ–Ⅶ) tile;
 *  - Relic: hero on a centre (Ⅵ–Ⅶ) tile.
 * Weaker tiers stay allowed, so a centre tile can still Search Minors.
 *
 * With the house rule ON, the old BINH level unlocks apply on TOP of that band:
 * Major also at level ≥ 4 and Relic at level ≥ 6, each with an artifact source
 * (Blacksmith / artifact-granting specialty).
 *
 * With `polish-random-artifacts` ON (and split decks), a live override on
 * `adventure.polishArtifactAccess` replaces this table for the current
 * acquisition — see polish-house-rules.ts.
 */
export function artifactDeckAccess(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState | null,
  artifactSource: boolean
): ArtifactDeckAccess {
  const polishOverride = state.adventure?.polishArtifactAccess;
  if (polishOverride && houseRuleEnabled(state, "polish-random-artifacts")) {
    return polishOverride;
  }

  const group = heroTileGroup(state, hero);
  const levelUnlocks = houseRuleEnabled(state, "deck-access-hero-level");
  const level = hero?.level ?? 1;

  return {
    minor: true,
    major: group === "near" || group === "center" || (levelUnlocks && level >= 4 && artifactSource),
    relic: group === "center" || (levelUnlocks && level >= 6 && artifactSource)
  };
}

/**
 * The spell decks this player may search right now (BINH-aware). `ignoreKeyCards`
 * enforces the strict Mage-Guild gate (Basic-only until level 4 / a IV–V tile,
 * no Wisdom/Eagle-Eye/Basic-Magic bypass); every other spell source leaves it
 * off and keeps the bypass.
 */
export function eligibleSpellDecks(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState | null,
  options?: { ignoreKeyCards?: boolean }
): DeckId[] {
  if (!houseRuleEnabled(state, "split-decks")) {
    return [SPELL_DECK_BASIC];
  }

  const decks: DeckId[] = [SPELL_DECK_BASIC];
  if (canDrawExpertSpells(state, playerId, hero, options) && state.decks[SPELL_DECK_EXPERT]) {
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
  if (!houseRuleEnabled(state, "split-decks")) {
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

/**
 * The ONE read of a standing Search-size override (a played Scouting): what a
 * Search of `baseCount` would ACTUALLY reveal, which effect grants it, and
 * whether that grant survives being used.
 *
 * Both the consuming path (`applySearchCountEffects`, called at reveal) and the
 * honest "Search (N)" LABEL in the up-front deck menu read this, so the label can
 * never promise a different count from the reveal (the reported Derelict Ship
 * bug). Polish Balance Pack: a modifier carrying `balanceDelta` is read as
 * `base + delta` while `polish-card-balance` is ON — the classic flat `count` is
 * what the same modifier means with the rule off.
 */
export function searchCountOverrideFor(
  state: GameState,
  playerId: PlayerId,
  baseCount: number
): { effectId: string; count: number; source: string; persist: boolean } | null {
  const effect = state.activeEffects.find(
    (candidate) =>
      candidate.controllerId === playerId &&
      candidate.modifiers.some((modifier) => modifier.type === "SEARCH_COUNT_OVERRIDE")
  );
  if (!effect) {
    return null;
  }
  const balance = houseRuleEnabled(state, "polish-card-balance");
  let count = baseCount;
  let persist = false;
  for (const modifier of effect.modifiers) {
    if (modifier.type !== "SEARCH_COUNT_OVERRIDE") {
      continue;
    }
    const target =
      balance && modifier.balanceDelta !== undefined ? baseCount + modifier.balanceDelta : modifier.count;
    count = Math.max(count, target);
    if (balance && modifier.balancePersist) {
      persist = true;
    }
  }
  return { effectId: effect.id, count, source: effect.name, persist };
}

/**
 * Applies and consumes a pending Scouting override on a search size. A
 * Balance-Pack EXPERT Scouting is NOT consumed (it widens every Search until the
 * end of the turn); its `current-turn` duration is what ends it.
 */
export function applySearchCountEffects(state: GameState, playerId: PlayerId, baseCount: number): number {
  const override = searchCountOverrideFor(state, playerId, baseCount);
  if (!override) {
    return baseCount;
  }
  if (!override.persist) {
    state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== override.effectId);
  }
  return override.count;
}

/**
 * Spell schools the player can fetch instead of searching (Basic X Magic).
 * Primary source is the in-play permanent card (its `permanentEffect.schoolFetch`)
 * — the fetch is tied to the single permanent slot, so it stops the instant the
 * card is replaced or discarded. Legacy snapshots that still carry the old
 * `SPELL_SCHOOL_FETCH` active effect keep working via the union below.
 */
export function activeSchoolFetches(state: GameState, playerId: PlayerId): ("air" | "earth" | "fire" | "water")[] {
  const schools = new Set<"air" | "earth" | "fire" | "water">();

  const player = state.players[playerId];
  const permanentIds = player?.permanents ?? (player?.permanent ? [player.permanent] : []);
  for (const cardId of permanentIds) {
    const fetch = cardLibrary[cardId]?.permanentEffect?.schoolFetch;
    if (fetch) {
      schools.add(fetch);
    }
  }

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

/**
 * The Basic X Magic (fetch permanent) school whose +3 expert can empower a cast
 * of `spellSchools` for `playerId`: the first in-play fetch school the spell
 * matches (a fixed-school match, or ANY fetch for a school-"any" spell like Magic
 * Arrow), else null. Shared by the up-front CAST_SPELL variant (legal-actions)
 * and its cast-time application (reducer) so both read one rule.
 */
export function matchingSchoolFetchForCast(
  state: GameState,
  playerId: PlayerId,
  spellSchools: readonly SpellSchool[]
): "air" | "earth" | "fire" | "water" | null {
  for (const school of activeSchoolFetches(state, playerId)) {
    if (spellSchools.includes(school) || spellSchools.includes("any")) {
      return school;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ruleset-dependent card notes for the UI
// ---------------------------------------------------------------------------

/**
 * Shown on card popovers when an active house rule changes a printed value.
 * A state observes individual overrides; the ruleset-only compatibility form
 * uses that mode's default preset.
 */
export function rulesetCardNote(
  stateOrRuleset: GameRuleset | Pick<GameState, "ruleset" | "adventure">,
  cardId: string
): string | null {
  const state =
    typeof stateOrRuleset === "string"
      ? ({ ruleset: stateOrRuleset } as Pick<GameState, "ruleset" | "adventure">)
      : stateOrRuleset;
  switch (cardId) {
    case "ability.wisdom":
      return houseRuleEnabled(state, "wisdom-expert-discount")
        ? "House rule: Expert Wisdom reduces the Mage Guild price by 3 gold instead of the printed 2."
        : null;
    case "ability.estates":
      return houseRuleEnabled(state, "estates-nerf")
        ? "House rule: gain 2 gold (basic) / 4 gold (expert) instead of the printed 3/6."
        : null;
    default:
      return null;
  }
}

/** Spell limit per combat round, including lasting bonuses. */
export function spellLimitFor(state: GameState, player: PlayerState): number {
  // Expert Intelligence "ignores the limit": the one-Spell-per-round cap no
  // longer applies to that player, so every limit check (which all derive from
  // this value) passes for as long as the effect is held.
  // Polish Balance Pack: the reprinted Intelligence's no-limit rider is scoped to
  // the start-of-combat window (the same shared read `playerHasSpellTimingFreedom`
  // takes), so once a unit has acted the limit is the ordinary one again.
  const ignoresLimit =
    !balanceIntelligenceWindowClosed(state) &&
    state.activeEffects.some(
      (effect) =>
        effect.controllerId === player.id &&
        effect.modifiers.some(
          (modifier) => modifier.type === "SPELL_CAST_ANYTIME" && modifier.ignoreSpellLimit === true
        )
    );
  // Polish Spell Book reading of Intelligence (reference sheet): the ability is
  // "Start of Combat: Cast a Spell" (the SPELL_CAST_ANYTIME timing freedom stays)
  // and its EXPERT side reads "+1 Limit" — the per-round cap rises by exactly 1
  // instead of the base game's unlimited casting. So under the Polish rule the
  // Expert Intelligence effect grants +1 here rather than Infinity.
  const polishBook = houseRuleEnabled(state, "polish-spell-book");
  if (ignoresLimit && !polishBook) {
    return Number.POSITIVE_INFINITY;
  }
  const intelligenceExpertBonus = ignoresLimit && polishBook ? 1 : 0;

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

  // Temple Guardian commander ("Mana Magician"): each unspent charge lets one
  // more Spell through this round's limit. A cast that actually exceeds the
  // charge-free limit burns a charge in noteSpellCast, so the allowance is
  // twice per COMBAT (charges are seeded once at combat start), not per round.
  const manaCharges = state.combat ? (player.combatStats.commanderManaCharges ?? 0) : 0;

  return 1 + player.combatStats.spellLimitBonusThisRound + effectBonus + manaCharges + intelligenceExpertBonus;
}

/** Expert uses available this round, including one-shot bonuses. */
export function expertUsesAvailable(player: PlayerState): number {
  return (
    player.limits.expertUses +
    (player.combatStats.expertUseBonusThisRound ?? 0) -
    player.combatStats.expertUsesSpentThisRound
  );
}

/**
 * Total Expert uses (crowns) this round BEFORE any are spent — the level-derived
 * budget plus one-shot bonuses. This is the denominator the HUD shows the
 * {@link expertUsesAvailable} remainder against (remaining / total); as crowns
 * are spent the remainder drops while the total holds.
 */
export function expertUsesTotalThisRound(player: PlayerState): number {
  return player.limits.expertUses + (player.combatStats.expertUseBonusThisRound ?? 0);
}

/**
 * Spell Book house rule on? Stored per adventure (`adventure.spellBook`, default
 * ON). The combat sandbox has no adventure state, so the Book is available there
 * too — sandbox tests seed `player.spellBook` directly. A `false` adventure flag
 * (the lobby toggle) is the only thing that turns it off.
 */
export function spellBookRuleEnabled(state: GameState): boolean {
  if (getRuleset(state) === "legacy") {
    return false;
  }
  return state.adventure ? state.adventure.spellBook ?? true : true;
}

/**
 * Whether `cardId` is a Spell that may be set aside in a player's Spell Book.
 * House rule: a starting-only Spell (Magic Arrow) may be drawn, held in hand and
 * cast like any other, but it can NEVER enter the Spell Book — it has no Book
 * home and is excluded from both the hand→Book stash and the discard→Book pickup.
 * Every other Spell is eligible.
 */
export function spellCanEnterSpellBook(cardId: CardId): boolean {
  return !STARTING_ONLY_SPELLS.includes(cardId);
}

/**
 * Whether this player may still spend a Spell Book Spell as a +1 Power source
 * this turn. The Book is capped at ONE Power discard per turn (crown-style); the
 * hand and every other Power source are unaffected.
 */
export function spellBookPowerAvailable(player: PlayerState): boolean {
  return !player.combatStats.spellBookPowerUsedThisTurn;
}

/**
 * Whether a TAKE_FROM_DISCARD option may be played mid-Combat (opening the
 * discard-pick immediately) rather than staying a map-only play. True when the
 * option explicitly opts in via `allowInCombat` (Scholar's basic side, Ciele's
 * Magic-Arrow recall), OR — HOUSE RULE — whenever the card is an INSTANT card
 * (see instantSideAllowedInCombat). An Instant is a click-to-use card, NOT
 * reaction-only: its "take a card from your discard pile" side (Skull Helmet,
 * Helm of the Alabaster Unicorn, Crown of the Five Seas, …) is usable in battle
 * too, not just on the map. Shared by the offering (legal-actions) and the
 * resolution (reducer) so the two never drift.
 */
export function discardPickAllowedInCombat(
  card: { kind?: string; timing?: string } | undefined,
  effect: { allowInCombat?: boolean }
): boolean {
  return Boolean(effect.allowInCombat) || instantSideAllowedInCombat(card);
}

/**
 * The HOUSE RULE behind discardPickAllowedInCombat, shared by every deck-
 * manipulation side an INSTANT card carries (any kind — artifact, hero-specialty
 * OR ability): an Instant is a click-to-use card, NOT reaction-only, so its
 * "Search a shared deck" / "take from discard" / "remove a card then Search" /
 * "dig your deck" / Eagle-Eye-dig sides (Spellbinder's Hat, Breastplate of
 * Brimstone, the Tomes, AND their hero-specialty twins — Adrienne's Fire Magic
 * IV, Jeddite's dig, Miriam's Scouting, Tazar's War Hero VI) are playable
 * mid-Combat too. Map-SPATIAL Instant sides (movement, teleport, resource gain,
 * recruiting, mine capture) stay map-only via their own `context === "map"`
 * gates, so keying purely on the Instant timing never leaks those into combat.
 */
export function instantSideAllowedInCombat(
  card: { kind?: string; timing?: string } | undefined
): boolean {
  return card?.timing === "instant";
}

/**
 * Whether playing `cardId` on its Expert side is free of a crown for this
 * player — true only for an ability the player has had Empowered (the Dragon
 * Fly Hive / Griffin Conservatory Creature Bank bonus). The `empoweredAbilities`
 * list only ever holds ability card ids, so a plain id match is enough.
 */
export function abilityExpertIsCrownFree(player: PlayerState, cardId: string | undefined): boolean {
  return Boolean(cardId && player.empoweredAbilities?.includes(cardId));
}

/**
 * Whether this player may play `cardId` on its Expert side right now: either a
 * crown (Expert use) is available, or the card is an Empowered ability whose
 * Expert side costs no crown.
 */
export function canPlayExpertMode(player: PlayerState, cardId: string | undefined): boolean {
  return expertUsesAvailable(player) > 0 || abilityExpertIsCrownFree(player, cardId);
}

/**
 * Cards whose printed EXPERT side is a strict SUPERSET of their basic side —
 * same card cost, same zone the card leaves to, and every basic outcome still
 * reachable. For such a card, once the ability is EMPOWERED (its Expert side
 * costs no crown) the basic option is a strictly-worse trap button, so the offer
 * collapses to Expert alone.
 *
 * This is a deliberate PER-CARD registry, never a blanket rule, because for most
 * abilities the basic side does something the expert side cannot:
 *   - `ability.learning` — Expert REMOVES the card from the game, basic discards
 *     it (the card can come back). Not a superset.
 *   - `ability.pathfinding` — which half each side grants depends on the
 *     `pathfinding-expert` house rule, so basic is the full card under BINH.
 *   - `ability.eagle_eye` — Expert digs the EXPERT Spell deck instead of the
 *     basic one; a hero may genuinely want a basic Spell.
 *   - `ability.tactics` — basic is the pre-battle setup swap, expert the
 *     mid-combat one; different windows, not tiers of one effect.
 *   - Statistic / stat-buff abilities (Offense, Armorer, Sorcery, Leadership…)
 *     — Expert is a bigger number, which IS a superset, but they are played in
 *     reaction windows where the batch tray already shows both sides side by
 *     side with their values; collapsing them would hide the printed card.
 * The one entry today is Necromancy: basic reinforces a bronze/silver unit for
 * half the gold, Expert reinforces ANY unit for half the gold — identical cost,
 * identical discard, strictly wider target set.
 */
export const EXPERT_SUPERSEDES_BASIC_CARD_IDS: readonly string[] = ["ability.necromancy"];

/**
 * Whether the basic offer for `cardId` should be withheld: the card's Expert
 * side supersedes it (registry above) AND this player has it Empowered, so the
 * Expert side is free. A non-empowered holder still chooses (Expert costs a
 * crown there, so basic is a real trade-off).
 */
export function empoweredExpertSupersedesBasic(
  player: PlayerState,
  cardId: string | undefined
): boolean {
  return (
    Boolean(cardId) &&
    EXPERT_SUPERSEDES_BASIC_CARD_IDS.includes(cardId as string) &&
    abilityExpertIsCrownFree(player, cardId)
  );
}

/** Whether a card id is a spell in the given library. */
export function isSpellCard(cards: CardLibrary, cardId: string): boolean {
  return cards[cardId]?.kind === "spell";
}
