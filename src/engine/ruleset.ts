import type { UnitSideDefinition } from "@/data/factions/types";
import { cardLibrary } from "@/data/cards/library";
import { STARTING_ONLY_SPELLS } from "@/data/cards/spells";
import { armyUnitStacksActive, houseRuleEnabled } from "./house-rules";
import type {
  CardId,
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
  overrides?: { griffinBuff?: boolean; marksmanBuff?: boolean }
): UnitSideDefinition {
  const griffinBuff = overrides?.griffinBuff ?? ruleset === "binh";
  const marksmanBuff = overrides?.marksmanBuff ?? ruleset === "binh";

  if (griffinBuff && unitDefId === "castle.griffins" && side === "few") {
    return { ...definition, attack: 3 };
  }
  if (griffinBuff && unitDefId === "castle.griffins" && side === "pack") {
    return { ...definition, defense: 1 };
  }
  if (marksmanBuff && unitDefId === "castle.marksmen" && side === "pack") {
    return { ...definition, health: 3 };
  }

  return definition;
}

/**
 * Resolve the unit-stat house-rule overrides for a live state — passed to
 * {@link applyUnitSideRules} / {@link applyUnitCurrentSide} so the Griffin and
 * Marksman buffs each honour their own toggle rather than the bundled mode.
 */
export function unitSideRuleOverrides(
  state: Pick<GameState, "ruleset" | "adventure">
): { griffinBuff: boolean; marksmanBuff: boolean; polishUnitStacks: boolean } {
  return {
    griffinBuff: houseRuleEnabled(state, "griffin-buff"),
    marksmanBuff: houseRuleEnabled(state, "marksman-buff"),
    // Either Polish rule activates army Stack layers: polish-unit-stacks sells
    // them, polish-bank-sizes grants them with a unit bank's Pack reward.
    polishUnitStacks: armyUnitStacksActive(state)
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
 * BINH gate for the Expert Spell deck: a hero may search it (choosing Basic or
 * Expert) once EITHER condition holds — the hero is level 4 or higher, OR a IV–V
 * (or deeper) map tile has been revealed. Below both, only the Basic deck is
 * available, unless the hero owns a key card (Eagle Eye, Wisdom, or a Basic
 * elemental Magic), which unlocks the Expert deck at any level / map state.
 *
 * `ignoreKeyCards` drops that key-card bypass: buying spells at the **Mage
 * Guild** must be Basic-only until the hero actually reaches level 4 or a IV–V
 * tile is discovered — owning Wisdom/Eagle Eye/Basic Magic must NOT open the
 * Expert deck there (those cards keep their own Expert access via their own
 * effects and via other spell sources, which pass the bypass through). The map
 * Spell Scroll and Eagle Eye's combat dig reach the Expert deck directly and
 * never route through this gate at all.
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
  const ignoresLimit = state.activeEffects.some(
    (effect) =>
      effect.controllerId === player.id &&
      effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME" && modifier.ignoreSpellLimit === true)
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

/** Whether a card id is a spell in the given library. */
export function isSpellCard(cards: CardLibrary, cardId: string): boolean {
  return cards[cardId]?.kind === "spell";
}
