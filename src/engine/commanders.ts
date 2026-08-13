import {
  COMMANDER_DEFENSE_TOKEN_GRADE,
  COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION,
  COMMANDER_SLUG_BY_FACTION,
  COMMANDER_STANCE_MAX_ROUND,
  COMMANDER_STAT_KEYS,
  commanderCanRaiseGrade,
  commanderCastIsInstantReaction,
  commanderCastTierIndex,
  commanderDefinitions,
  commanderGradePointsForLevelUp,
  commanderMagicImmuneToOngoing,
  commanderStatValue,
  commanderUnlockedCombos,
  type CommanderCastDefinition,
  type CommanderDefinition,
  type CommanderGrade,
  type CommanderGrades,
  type CommanderSlug
} from "@/data/commanders";
import { aggregateCommanderArtifactBonuses } from "@/data/wog/commander-artifacts";
import { equipmentGrantsCommanderRevive, equipmentGrantsCommanderSort } from "./anime-equipment";
import { unitImmuneToParalysis } from "./active-effects";
import { isAdjacent } from "./battlefield";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { shuffleCards } from "./decks";
import { appendEvent, nextEventNumber } from "./events";
import { gainRunes } from "./runes";
import { noteUnitDamagedForTokens, placeCombatToken } from "./tokens";
import { isMechanicalUnit } from "./unit-abilities";
import { NEUTRAL_PLAYER_ID } from "./state";
import type {
  CombatUnitState,
  CommanderPlayerState,
  CommanderStatKey,
  GameState,
  HeroId,
  HeroState,
  PlayerId,
  PlayerState,
  UnitId
} from "./state";

/**
 * WOG Commanders — engine helpers (board-game adaptation, see
 * src/data/commanders.ts for the content tables and docs/wog-commanders-plan.md
 * for the design history). This module is import-safe from every engine layer
 * (it never imports adventure/reducer/legal-actions); resolution code that
 * needs reducer-private helpers (healUnitDamage, createActiveEffect…) lives in
 * reducer.ts and calls into these helpers for all commander-specific rules.
 */

// ---------------------------------------------------------------------------
// Player-state level: identity, grades, stats, level-ups.
// ---------------------------------------------------------------------------

/** Whether this game runs the WOG Commanders module. */
export function commandersModuleEnabled(state: GameState): boolean {
  return Boolean(state.wog?.enabled && state.wog.commanders);
}

/** Whether this game runs the WOG New Objects module (`wog.newObjects`). */
export function wogNewObjectsEnabled(state: Pick<GameState, "wog">): boolean {
  return Boolean(state.wog?.enabled && state.wog.newObjects);
}

export function commanderSlugForFaction(factionId: string | undefined): CommanderSlug | null {
  return factionId ? (COMMANDER_SLUG_BY_FACTION[factionId] ?? null) : null;
}

/** Fresh commander state for a faction (all six stats at grade 0, the base). */
export function makeInitialCommanderState(factionId: string | undefined): CommanderPlayerState | null {
  const slug = commanderSlugForFaction(factionId);
  if (!slug) {
    return null;
  }
  return {
    slug,
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 }
  };
}

export function commanderDefinitionOf(commander: CommanderPlayerState | undefined | null): CommanderDefinition | null {
  if (!commander) {
    return null;
  }
  return commanderDefinitions[commander.slug as CommanderSlug] ?? null;
}

/** Clamped grades (defensive against hand-edited snapshots). */
export function commanderGradesOf(commander: CommanderPlayerState): CommanderGrades {
  const grades = {} as Record<CommanderStatKey, CommanderGrade>;
  for (const key of COMMANDER_STAT_KEYS) {
    const raw = commander.grades?.[key] ?? 0;
    grades[key] = (raw >= 3 ? 3 : raw === 2 ? 2 : raw === 1 ? 1 : 0) as CommanderGrade;
  }
  return grades;
}

/** The commander's command-ability Power (0/1/2, from the Magic grade). */
export function commanderPowerOf(commander: CommanderPlayerState): number {
  return commanderStatValue("magic", commanderGradesOf(commander).magic);
}

/** The player's commander when it exists AND is alive (not dead). */
export function livingCommanderOf(player: PlayerState | undefined): CommanderPlayerState | null {
  const commander = player?.commander;
  return commander && !commander.dead ? commander : null;
}

/** Whether `playerId` has a LIVING commander of the given slug. */
export function playerHasLivingCommander(state: GameState, playerId: PlayerId, slug: CommanderSlug): boolean {
  const commander = livingCommanderOf(state.players[playerId]);
  return commander?.slug === slug;
}

/**
 * Whether a fight brought by `hero` would field its owner's LIVING commander —
 * the commander marches with the MAIN hero only (garrison defenses and
 * secondary-hero fights get none; mirrors injectCombatCommanders' hero gate).
 * The combat-start army-restore seams key off this: with the commander as a
 * body, an empty unit deck is NOT replaced with the starting units (house
 * rule — the commander must fall too before the free army reset).
 */
export function commanderMarchesWithHero(state: GameState, hero: HeroState | null | undefined): boolean {
  if (!hero || hero.kind !== "main" || !commandersModuleEnabled(state)) {
    return false;
  }
  return Boolean(livingCommanderOf(state.players[hero.controllerId]));
}

/**
 * Whether `playerId`'s LIVING commander stands (or will stand, once
 * finalizeCombatStart injects it) in the CURRENT combat. Used by the
 * deployment window: a player whose unit deck is empty may finish placement
 * with ZERO units when the commander is the army's remaining body.
 */
export function commanderStandsInCurrentCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat || !commandersModuleEnabled(state)) {
    return false;
  }
  const injected = combat.units[commanderUnitId(playerId)];
  if (injected) {
    return injected.damage < injected.maxHealth;
  }
  if (!livingCommanderOf(state.players[playerId])) {
    return false;
  }
  const heroIsOwnMain = (heroId: HeroId | null | undefined): boolean => {
    const hero = heroId ? state.heroes[heroId] : null;
    return Boolean(hero && hero.kind === "main" && hero.controllerId === playerId);
  };
  const context = combat.context;
  if (context.kind === "neutral") {
    return heroIsOwnMain(context.heroId);
  }
  if (context.kind === "player") {
    return heroIsOwnMain(context.attackerHeroId) || heroIsOwnMain(context.defenderHeroId);
  }
  // Battle Test sandbox: both seats bring main heroes, so both get theirs.
  return context.kind === "sandbox" && (playerId === combat.attackerPlayerId || playerId === combat.defenderPlayerId);
}

/**
 * Award the stat points a hero level-up earns (1 normally, 2 at a milestone
 * level — see commanderGradePointsForLevelUp; the Paladin's Wise milestones are
 * levels 2 & 5). Called from gainExperience for each level crossed. Returns the
 * number of points awarded (0 = no commander, or level < 2).
 */
export function awardCommanderGradePoints(player: PlayerState, level: number): number {
  const commander = player.commander;
  if (!commander) {
    return 0;
  }
  const points = commanderGradePointsForLevelUp(commander.slug as CommanderSlug, level);
  if (points > 0) {
    commander.gradePoints = (commander.gradePoints ?? 0) + points;
  }
  return points;
}

/**
 * Stats a COMMANDER_GRADE_UP point may still be spent on: below grade 3, and —
 * for a grade-2 stat — only once the hero has reached the mastery level (a
 * grade-2 → grade-3 raise is gated by `heroLevel`). Pass the main hero's level;
 * it defaults to 1 (pre-mastery) so a missing hero never offers a masked raise.
 */
export function commanderGradeUpChoices(
  commander: CommanderPlayerState,
  heroLevel = 1
): CommanderStatKey[] {
  const grades = commanderGradesOf(commander);
  return COMMANDER_STAT_KEYS.filter((key) => commanderCanRaiseGrade(grades[key], heroLevel));
}

// ---------------------------------------------------------------------------
// Combat-unit level: building and finding the commander's battlefield unit.
// ---------------------------------------------------------------------------

export function commanderUnitId(playerId: PlayerId): UnitId {
  return `unit_${playerId}_commander`;
}

export function isCommanderUnit(unit: CombatUnitState | undefined | null): boolean {
  return Boolean(unit?.commanderSlug);
}

/**
 * Whether a commander combat unit is immune to ongoing effects. The immunity is
 * part of the Magic grade-1 package, so it keys off the unit's grade snapshot —
 * a grade-0-Magic commander is NOT immune (it carries no titan-ignore-ongoing).
 */
export function commanderUnitImmuneToOngoing(unit: CombatUnitState): boolean {
  return Boolean(unit.commanderSlug) && commanderMagicImmuneToOngoing(unit.commanderGrades?.magic ?? 0);
}

export function findCommanderUnit(state: GameState, playerId: PlayerId): CombatUnitState | null {
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  const unit = combat.units[commanderUnitId(playerId)];
  return unit?.commanderSlug && unit.controllerId === playerId ? unit : null;
}

/**
 * Ability ids the commander's combat unit carries, derived from its grades:
 *  - Magic package: NOTHING at grade 0 (the commander still takes full Spell
 *    damage and can be hit by ongoing effects); from grade 1 the ongoing-effect
 *    immunity plus the spell ward (-1 at grades 1 & 2, -3 at grade 3);
 *  - Damage grade 1/2/3: +1/+2/+3 bonus damage on its attacks;
 *  - every unlocked combination skill (one stat of the pair at grade 3, the
 *    other at 2+) — Sharpshooter has no ability id (it is the type flip);
 *  - the "Undead" specialty's paralysis immunity (Soul Eater, Demon Ancestor);
 *  - the commander's command ability (the once-per-round cast).
 */
export function commanderAbilityIds(commander: CommanderPlayerState): string[] {
  const definition = commanderDefinitionOf(commander);
  const grades = commanderGradesOf(commander);
  const ids: string[] = [];

  // Magic package — begins at grade 1 per the module spec. At grade 0 the
  // commander gets NO spell ward and NO ongoing-effect immunity (only the
  // once-per-round cast, which every commander always has).
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic];
  if (spellWard >= 3) {
    ids.push("reduce-spell-damage-3");
  } else if (spellWard >= 2) {
    ids.push("reduce-spell-damage-2");
  } else if (spellWard >= 1) {
    ids.push("reduce-spell-damage-1");
  }
  if (commanderMagicImmuneToOngoing(grades.magic)) {
    ids.push("titan-ignore-ongoing");
  }

  // Defense grade II ("+1 def when attacked"): a permanent Defense token — the
  // commander rolls the Defend die when attacked. Grade III is a reliable flat
  // Defense 3 with no die, so ONLY grade II carries it.
  if (grades.defense === COMMANDER_DEFENSE_TOKEN_GRADE) {
    ids.push("commander-defense-token");
  }

  // Damage grade (Might): the number of EXTRA attack dice on each attack
  // (commanderStatValue("damage", grade) = 0/1/2/3 dice). Rolled + applied in
  // reducer.ts; each "+1" raises the attack, at most one "−1" counts.
  const mightDice = commanderStatValue("damage", grades.damage);
  if (mightDice >= 3) {
    ids.push("commander-might-3");
  } else if (mightDice >= 2) {
    ids.push("commander-might-2");
  } else if (mightDice >= 1) {
    ids.push("commander-might-1");
  }

  // Combination skills (one stat of the pair at grade 3, the other at 2+).
  for (const combo of commanderUnlockedCombos(grades)) {
    if (combo.abilityId) {
      ids.push(combo.abilityId);
    }
  }

  // Specialty-borne combat passive. The "Undead" Paralysis-token immunity is
  // keyed off the SPECIALTY id (not the "soul_eater" slug), the Belfast
  // first-aid precedent — so any future Undead commander (the Heavenly Demon
  // "Undying Demon Body") gets it too.
  if (definition?.specialty.id === "undead") {
    ids.push("ignore-paralysis");
  }

  // The command ability itself (offered as a USE_UNIT_ABILITY during its
  // activation; see legal-actions/reducer).
  if (definition) {
    ids.push(definition.cast.abilityId);
  }

  return ids;
}

/**
 * Build the commander's combat unit from the owner's persistent state. The
 * commander is tierless in play (grade kept for display only — the
 * bank-guard-style exemptions key off `commanderSlug`), enters at full health
 * and carries no army card.
 */
export function makeCommanderCombatUnit(
  player: PlayerState,
  position: number
): CombatUnitState | null {
  const commander = livingCommanderOf(player);
  const definition = commanderDefinitionOf(commander);
  if (!commander || !definition) {
    return null;
  }

  const grades = commanderGradesOf(commander);
  // Superior Combat (Shaman) stance and the Vanguard Marshal (Cove) front-line
  // +1 are NOT baked into the unit — both are LIVE reads at attack resolution
  // (commanderLiveAttackBonus / commanderLiveDefenseBonus): the Shaman stance
  // only holds for combat rounds 1-2, and the Vanguard Marshal bonus depends on
  // the commander's live position, so baking would go stale.
  // Sharpshooter combination skill (Attack+Speed): the commander fights as a
  // ranged unit — the combo has no ability tag, the TYPE is the mechanic.
  const canShoot = commanderUnlockedCombos(grades).some((combo) => combo.id === "can-shoot");
  // WOG Commander Artifacts (Task 2): fold the flat stat bonuses (axe/shield/
  // mail/boots) into the built unit beside the grade values, and append the
  // ability ids (sword's Might die, ring's line-attack). Cast-Power (pendant)
  // and free-revive (helm) are read at their own sites (commanderCastPower /
  // finalizeCommandersAfterCombat). Empty for a commander with no artifacts.
  const artifacts = aggregateCommanderArtifactBonuses(commander.artifacts);
  return {
    id: commanderUnitId(player.id),
    controllerId: player.id,
    name: definition.name,
    cardName: definition.name,
    variant: "few",
    grade: "gold",
    type: canShoot ? "ranged" : "ground",
    attack: commanderStatValue("attack", grades.attack) + artifacts.attack,
    defense: commanderStatValue("defense", grades.defense) + artifacts.defense,
    maxHealth: commanderStatValue("health", grades.health) + artifacts.health,
    damage: 0,
    initiative: commanderStatValue("speed", grades.speed) + artifacts.initiative,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [...commanderAbilityIds(commander), ...artifacts.abilityIds],
    commanderSlug: commander.slug,
    // Grade snapshot for the UI (inspect/zoom render the dynamic card face
    // from it). Grades cannot change mid-combat, so the copy stays true.
    commanderGrades: { ...grades },
    assets: {
      cardImage: definition.cardImage,
      imageAlt: `${definition.name} commander card`
    }
  };
}

/**
 * Auto-place the commander at combat start: the first free cell of the given
 * preference list (owner's backline first, then frontline — passed by the
 * caller, which owns the deployment-row constants). Returns the unit, or null
 * when the commander is dead/absent or no cell is free.
 */
export function injectCommanderIntoCombat(
  state: GameState,
  playerId: PlayerId,
  preferredCells: readonly number[]
): CombatUnitState | null {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || !player || !commandersModuleEnabled(state)) {
    return null;
  }
  if (combat.units[commanderUnitId(playerId)]) {
    return null;
  }

  const occupied = new Set<number>();
  for (const unit of Object.values(combat.units)) {
    if (unit.damage < unit.maxHealth) {
      occupied.add(unit.position);
    }
  }
  for (const obstacle of combat.obstacles ?? []) {
    occupied.add(obstacle);
  }

  const cell = preferredCells.find((candidate) => !occupied.has(candidate));
  if (cell === undefined) {
    return null;
  }

  const unit = makeCommanderCombatUnit(player, cell);
  if (!unit) {
    return null;
  }
  combat.units[unit.id] = unit;
  return unit;
}

// ---------------------------------------------------------------------------
// Pre-combat SORT capability + live positional/stance stat folds.
//
// Board geometry (mirrors ATTACKER_FRONTLINE etc. in adventure-reducer.ts;
// duplicated here as small documented constants so this import-safe module never
// depends on adventure-reducer). The 4-wide, 20-cell board: the attacker deploys
// on rows 3 (FRONT, 12-15) & 4 (back, 16-19); the defender on rows 0 (back) & 1
// (FRONT, 4-7). "Front line" = the row of the owner's deployment zone nearest the
// enemy.
// ---------------------------------------------------------------------------

const COMMANDER_ATTACKER_FRONT_CELLS: readonly number[] = [12, 13, 14, 15];
const COMMANDER_DEFENDER_FRONT_CELLS: readonly number[] = [4, 5, 6, 7];
// Creature-Bank / attacker-center layout: the attacker forms up in the six
// central cells (5,6 / 9,10 / 13,14) while the four guards hold the corners
// (rows 0 & 4). There is no single "enemy side" — the guards flank both ends —
// so the front line is read as the two central rows that TOUCH a guard row: 5,6
// (row 1, under the top corners) and 13,14 (row 3, above the bottom corners).
// The shielded middle row (9,10) is NOT a front line.
const COMMANDER_BANK_FRONT_CELLS: readonly number[] = [5, 6, 13, 14];

/** The Vanguard Marshal specialty (Cove Sea Marshal). */
function commanderIsVanguardMarshal(commander: CommanderPlayerState): boolean {
  return commanderDefinitionOf(commander)?.specialty.id === "vanguard-marshal";
}

/** The Superior Combat stance specialty (Fortress Shaman). */
function commanderHasSuperiorCombat(commander: CommanderPlayerState): boolean {
  return commanderDefinitionOf(commander)?.specialty.id === "superior-combat";
}

/** The First Aid post-combat restoration specialty (Rampart Hierophant, Azur Lane Belfast). */
function commanderHasFirstAid(commander: CommanderPlayerState): boolean {
  return commanderDefinitionOf(commander)?.specialty.id === "first-aid";
}

/**
 * Whether `playerId` has a LIVING commander that carries the First Aid specialty
 * (SPECIALTY-keyed, not slug-keyed — so any future First-Aid commander opens the
 * post-combat restoration window, not only the Hierophant).
 */
export function playerHasLivingFirstAidCommander(state: GameState, playerId: PlayerId): boolean {
  const commander = livingCommanderOf(state.players[playerId]);
  return commander ? commanderHasFirstAid(commander) : false;
}

/**
 * GENERIC pre-combat SORT capability. True when the Commanders module is on, the
 * player's commander is present + alive in THIS combat, AND some source grants
 * the capability. The reusable predicate the setup window keys off — designed so
 * a FUTURE hero-equipment item can grant it too (a second OR-branch reading the
 * hero's equipment; see the marked seam below), never touching the window
 * machinery.
 */
export function commanderPreCombatSortAvailable(state: GameState, playerId: PlayerId): boolean {
  if (!commandersModuleEnabled(state)) {
    return false;
  }
  const unit = findCommanderUnit(state, playerId);
  if (!unit || unit.damage >= unit.maxHealth) {
    return false;
  }
  const commander = state.players[playerId]?.commander;
  if (!commander) {
    return false;
  }
  // Source 1: the Vanguard Marshal specialty (Cove Sea Marshal).
  if (commanderIsVanguardMarshal(commander)) {
    return true;
  }
  // Source 2: the Marshal's War Horn hero-equipment item (anime.equipment). Reads
  // the main hero's equipment off `state`; module-off / unworn ⇒ false. This is
  // the seam the predicate was designed around — the window machinery is untouched.
  if (equipmentGrantsCommanderSort(state, playerId)) {
    return true;
  }
  return false;
}

/**
 * The same generic sort capability before the commander has been injected.
 * Used to put Vanguard/equipment commanders directly into ordinary troop
 * deployment, where commander, Little Busters hero and army cards are arranged
 * together and confirmed by one Ready action.
 */
export function commanderIntegratedDeploymentSortAvailable(state: GameState, playerId: PlayerId): boolean {
  if (!commandersModuleEnabled(state)) {
    return false;
  }
  const commander = livingCommanderOf(state.players[playerId]);
  if (!commander) {
    return false;
  }
  return commanderIsVanguardMarshal(commander) || equipmentGrantsCommanderSort(state, playerId);
}

/** The cells considered `unit`'s own front line in the current combat. */
function commanderFrontLineCells(state: GameState, unit: CombatUnitState): readonly number[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  // Bank fights: only the attacker deploys (in the central cells), so the bank
  // front-line reading applies whatever side flag the commander carries.
  if (combat.context.kind === "neutral" && combat.context.bankId) {
    return COMMANDER_BANK_FRONT_CELLS;
  }
  if (unit.controllerId === combat.defenderPlayerId) {
    return COMMANDER_DEFENDER_FRONT_CELLS;
  }
  // Attacker (the neutral fighter, or a PvP/sandbox attacker) — the default.
  return COMMANDER_ATTACKER_FRONT_CELLS;
}

/** Whether the commander unit currently stands on its own front line. */
export function commanderOnOwnFrontLine(state: GameState, unit: CombatUnitState): boolean {
  return commanderFrontLineCells(state, unit).includes(unit.position);
}

/** Whether a Superior Combat stance is ACTIVE this combat round (rounds 1-2). */
function commanderStanceRoundActive(state: GameState): boolean {
  return (state.combat?.round ?? 1) <= COMMANDER_STANCE_MAX_ROUND;
}

/**
 * LIVE Attack bonus on a COMMANDER's own combat unit, read at attack resolution
 * (folded into getAttackStackDetails). Positional / stance-based, not
 * attack-type-based, so it applies on the commander's own attacks AND its
 * retaliations. Two sources:
 *  - Vanguard Marshal (Cove Sea Marshal): +1 while the commander stands on its
 *    own FRONT LINE (a live position read — walking on/off it flips the bonus).
 *  - Superior Combat (Shaman): the chosen +1 Attack stance, but ONLY during
 *    combat rounds 1-2 (from round 3 the stance is gone).
 * 0 for any non-commander unit.
 */
export function commanderLiveAttackBonus(state: GameState, unit: CombatUnitState): number {
  if (!unit.commanderSlug) {
    return 0;
  }
  const commander = state.players[unit.controllerId]?.commander;
  if (!commander) {
    return 0;
  }
  let bonus = 0;
  if (commanderIsVanguardMarshal(commander) && commanderOnOwnFrontLine(state, unit)) {
    bonus += 1;
  }
  if (
    commanderHasSuperiorCombat(commander) &&
    (commander.stance ?? "attack") === "attack" &&
    commanderStanceRoundActive(state)
  ) {
    bonus += 1;
  }
  return bonus;
}

/**
 * LIVE Defense bonus on a COMMANDER's own combat unit, read when it is attacked
 * (folded into getAttackStackDetails' defender bonus). The Superior Combat
 * (Shaman) +1 Defense stance, ONLY during combat rounds 1-2. 0 otherwise.
 */
export function commanderLiveDefenseBonus(state: GameState, unit: CombatUnitState): number {
  if (!unit.commanderSlug) {
    return 0;
  }
  const commander = state.players[unit.controllerId]?.commander;
  if (!commander) {
    return 0;
  }
  if (
    commanderHasSuperiorCombat(commander) &&
    (commander.stance ?? "attack") === "defense" &&
    commanderStanceRoundActive(state)
  ) {
    return 1;
  }
  return 0;
}

/**
 * Sonya's Unbreakable Bond is a live read: the marked army card has +1 Defense
 * during round 1 while Sonya's own combat unit is still standing. Because the
 * bonus stays separate from printed/job Defense and keys on the persistent
 * army-card id, Pack/Few flips and Guard Job recomputes cannot overwrite it.
 */
export function sonyaBondDefenseBonus(state: GameState, unit: CombatUnitState): number {
  const commander = state.players[unit.controllerId]?.commander;
  if (
    !unit.armyUnitId ||
    state.combat?.round !== 1 ||
    commander?.slug !== "sonya" ||
    commander.bondedArmyUnitId !== unit.armyUnitId
  ) {
    return 0;
  }
  const sonya = findCommanderUnit(state, unit.controllerId);
  return sonya?.commanderSlug === "sonya" && sonya.damage < sonya.maxHealth ? 1 : 0;
}

// ---------------------------------------------------------------------------
// The command ability (once per combat round, free during its activation).
// ---------------------------------------------------------------------------

export function commanderCastOf(unit: CombatUnitState): CommanderCastDefinition | null {
  const slug = unit.commanderSlug as CommanderSlug | undefined;
  return slug ? (commanderDefinitions[slug]?.cast ?? null) : null;
}

/**
 * Power the cast resolves at (from the owner's Magic grade), plus the WOG
 * Commander-Artifact Pendant of Sorcery bonus (+1 when bound). Folded here — the
 * ONE cast-Power site — so the higher effective Power lifts the cast tier and
 * every Power-laddered amount/target gate, while the Magic-grade ability package
 * (spell ward, ongoing immunity) still keys off the raw grade.
 */
export function commanderCastPower(state: GameState, unit: CombatUnitState): number {
  const commander = state.players[unit.controllerId]?.commander;
  if (!commander) {
    return 0;
  }
  return commanderPowerOf(commander) + aggregateCommanderArtifactBonuses(commander.artifacts).castPowerBonus;
}

/** Runes the cast costs at the current Power (0 for every non-rune cast). */
export function commanderCastRuneCost(state: GameState, unit: CombatUnitState): number {
  const cast = commanderCastOf(unit);
  if (!cast?.targeting.runeCostByPower) {
    return 0;
  }
  return cast.targeting.runeCostByPower[commanderCastTierIndex(commanderCastPower(state, unit))];
}

/** The owner's current per-combat Rune pool (Bulwark subsystem). */
export function commanderRunePool(state: GameState, playerId: PlayerId): number {
  return state.combat?.runes?.[playerId]?.count ?? 0;
}

const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2 };

/**
 * Whether the cast has already been used this combat round; the once-per-round
 * budget is tracked as the round number of the last cast.
 */
export function commanderCastUsedThisRound(state: GameState, unit: CombatUnitState): boolean {
  return unit.commanderCastRound !== undefined && unit.commanderCastRound === state.combat?.round;
}

/**
 * Legal targets of the commander's cast at its current Power. Encodes every
 * targeting rule of the module: side, ranged/melee gate, mechanical gate,
 * damaged-only gate, the bronze/silver/gold tier ladder (tierless targets —
 * commanders, bank guards, summons — never pass a tier ladder), the
 * below-Power adjacency gate, and the no-self / no-commander rule for
 * ongoing-effect casts (a commander's ongoing immunity would fizzle them).
 */
export function commanderCastCandidates(state: GameState, unit: CombatUnitState): CombatUnitState[] {
  const combat = state.combat;
  const cast = commanderCastOf(unit);
  if (!combat || !cast) {
    return [];
  }

  const power = commanderCastPower(state, unit);
  const tierIndex = commanderCastTierIndex(power);
  const targeting = cast.targeting;
  // Heals and Belfast's Royal Salvo are INSTANT (damage/heal now, no lingering
  // effect), so ongoing-effect immunity never makes them a dead choice.
  const ongoingCast =
    cast.effect.kind !== "heal" &&
    cast.effect.kind !== "heal-cleanse" &&
    cast.effect.kind !== "enemy-damage";

  return Object.values(combat.units).filter((target) => {
    if (target.damage >= target.maxHealth || target.position < 0) {
      return false;
    }
    const friendly = target.controllerId === unit.controllerId;
    if (targeting.side === "friendly" ? !friendly : friendly) {
      return false;
    }
    if (target.id === unit.id && !targeting.canTargetSelf) {
      return false;
    }
    // Ongoing-effect casts never land on a commander that is IMMUNE to ongoing
    // effects (Magic grade >= 1) — the buff would fizzle, so no dead choices are
    // offered. A grade-0-Magic commander is NOT immune and stays a legal target.
    if (
      ongoingCast &&
      target.commanderSlug &&
      target.id !== unit.id &&
      commanderUnitImmuneToOngoing(target)
    ) {
      return false;
    }
    if (targeting.unitType === "ranged" && target.type !== "ranged") {
      return false;
    }
    if (targeting.unitType === "melee" && target.type === "ranged") {
      return false;
    }
    if (targeting.mechanical && !isMechanicalUnit(target)) {
      return false;
    }
    if (targeting.damagedOnly && target.damage <= 0) {
      return false;
    }
    if (targeting.maxTierByPower) {
      // Tierless bodies never pass a tier ladder — the same set gradeRankOfUnit
      // excludes (a Little Busters battlefield hero joins commanders/banks/
      // summons here: `heroUnit` is tierless BOTH ways).
      const targetRank =
        target.commanderSlug || target.bankUnit || target.summoned || target.heroUnit
          ? null
          : (TIER_RANK[target.grade] ?? null);
      const maxRank = TIER_RANK[targeting.maxTierByPower[tierIndex]] ?? 0;
      if (targetRank === null || targetRank > maxRank) {
        return false;
      }
    }
    if (
      targeting.adjacentBelowPower !== undefined &&
      power < targeting.adjacentBelowPower &&
      !isAdjacent(unit.position, target.position)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Whether the commander may use its cast right now: its own activation, not
 * yet moved/attacked, once per combat round, rune cost payable, and at least
 * one legal target on the board.
 */
export function commanderCastAvailable(state: GameState, unit: CombatUnitState): boolean {
  const combat = state.combat;
  const cast = commanderCastOf(unit);
  if (!combat || !unit.commanderSlug || !cast || combat.activeUnitId !== unit.id) {
    return false;
  }
  // The two defend buffs are INSTANT REACTIONS (played when a unit is attacked),
  // never offered as an activation cast — see commanderDefenseReactionUnit.
  if (commanderCastIsInstantReaction(cast)) {
    return false;
  }
  if (unit.activatedThisRound || unit.movedThisActivation || unit.attackedThisActivation) {
    return false;
  }
  if (commanderCastUsedThisRound(state, unit)) {
    return false;
  }
  const runeCost = commanderCastRuneCost(state, unit);
  if (runeCost > 0 && commanderRunePool(state, unit.controllerId) < runeCost) {
    return false;
  }
  return commanderCastCandidates(state, unit).length > 0;
}

/**
 * INSTANT-REACTION defend buffs (Hierophant's Shield, Ogre Leader's Stone Skin):
 * the living commander that may react to `defenderUnit` being attacked by
 * `attackerUnit`, or null when no reaction is available. Offered off-turn (no
 * activation gate) when:
 *  - the defender's controller owns a living commander whose command is an
 *    instant-reaction defend buff, not yet used this combat round,
 *  - the attacked unit is a legal target of that buff (side/self/immune rules,
 *    via commanderCastCandidates), and
 *  - the buff would actually blunt this hit: a melee-only Shield is NOT offered
 *    against a ranged-TYPE attacker (its DEFENSE_VS_ATTACKER_TYPE would do
 *    nothing), matching how the Shield spell's reaction is gated.
 * The commander itself is never a target (canTargetSelf is false on both), so it
 * cannot self-shield — commanderCastCandidates already excludes it.
 */
export function commanderDefenseReactionUnit(
  state: GameState,
  defenderUnit: CombatUnitState,
  attackerUnit: CombatUnitState | undefined
): CombatUnitState | null {
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  const commander = findCommanderUnit(state, defenderUnit.controllerId);
  if (!commander || commander.damage >= commander.maxHealth) {
    return null;
  }
  const cast = commanderCastOf(commander);
  if (!cast || !commanderCastIsInstantReaction(cast) || commanderCastUsedThisRound(state, commander)) {
    return null;
  }
  const runeCost = commanderCastRuneCost(state, commander);
  if (runeCost > 0 && commanderRunePool(state, commander.controllerId) < runeCost) {
    return null;
  }
  if (!commanderCastCandidates(state, commander).some((candidate) => candidate.id === defenderUnit.id)) {
    return null;
  }
  if (
    cast.effect.kind === "defense-buff" &&
    cast.effect.vs === "melee" &&
    attackerUnit?.type === "ranged"
  ) {
    return null;
  }
  return commander;
}

// ---------------------------------------------------------------------------
// Combat start: inject specialties that fire when the battle begins.
// ---------------------------------------------------------------------------

function combatSeed(state: GameState, purpose: string): string {
  return `${state.seed}#commander#${purpose}#${state.combat?.id ?? "combat"}#${nextEventNumber(state)}`;
}

function livingNeutralDefenders(state: GameState): CombatUnitState[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  return Object.values(combat.units).filter(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.damage < unit.maxHealth
  );
}

function emitSpecialty(state: GameState, playerId: PlayerId, slug: CommanderSlug, specialtyId: string, message: string): void {
  appendEvent(state, {
    type: "COMMANDER_SPECIALTY_TRIGGERED",
    playerId,
    commanderSlug: slug,
    specialtyId,
    message
  });
}

/**
 * Succubus — Charming: at the start of a combat against neutral units, one
 * random enemy neutral unit (any tier) gains a Paralysis token. Paralysis-
 * immune guards are skipped when picking (the charm always lands on a
 * charmable target if any exists).
 */
function applyCharming(state: GameState, playerId: PlayerId): void {
  const candidates = livingNeutralDefenders(state).filter((unit) => !unitImmuneToParalysis(state, unit));
  if (candidates.length === 0) {
    return;
  }
  const pick = shuffleCards(
    candidates.map((unit) => unit.id).sort(),
    combatSeed(state, "charming")
  )[0];
  const target = pick ? state.combat?.units[pick] : undefined;
  if (!target) {
    return;
  }
  placeCombatToken(state, target, "paralysis", 0, "Succubus' Charming");
  emitSpecialty(state, playerId, "succubus", "charming", `The Succubus charms ${target.cardName} — it gains a Paralysis token.`);
}

/**
 * Astral Spirit — Elemental Scourge: at the start of a combat against neutral
 * units, every enemy neutral unit takes 1 damage. Dealt as effect damage
 * through the normal removal path (so a 1-HP guard that dies triggers rebirth /
 * a Pack→Few flip and the outcome check), sourced from the commander's own
 * combat unit. Every neutral combat qualifies (creature banks included — its
 * bank guards are neutral units too).
 */
function applyElementalScourge(state: GameState, playerId: PlayerId, commander: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    return;
  }
  const targets = livingNeutralDefenders(state);
  if (targets.length === 0) {
    return;
  }
  emitSpecialty(
    state,
    playerId,
    "astral_spirit",
    "elemental-scourge",
    `The Astral Spirit's Elemental Scourge sears every neutral unit for 1 damage.`
  );
  for (const target of targets) {
    // A rebirth/flip earlier in the loop can only ADD units, never revive one
    // already resolved, so re-check the target is still standing before hitting.
    if (target.damage >= target.maxHealth) {
      continue;
    }
    target.damage += 1;
    noteUnitDamagedForTokens(state, target, 1);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "unit", unitId: commander.id, controllerId: playerId },
      target: { type: "unit", unitId: target.id },
      amount: 1,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, target);
  }
  // A scourge that wipes the last 1-HP guard ends the fight before any turn.
  finishCombatIfNeeded(state);
}

/**
 * Commander combat-start package, run from finalizeCombatStart AFTER the
 * commanders were injected: Mana Magician charges, Rune Ritual, Charming and
 * the Elemental Scourge. Only players whose commander actually stands in this
 * combat get their specialty (the commander must be present and alive).
 */
export function applyCommanderCombatStart(state: GameState): void {
  const combat = state.combat;
  if (!combat || !commandersModuleEnabled(state)) {
    return;
  }

  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (playerId === NEUTRAL_PLAYER_ID) {
      continue;
    }
    const unit = findCommanderUnit(state, playerId);
    const player = state.players[playerId];
    if (!unit || !player || unit.damage >= unit.maxHealth) {
      continue;
    }

    switch (unit.commanderSlug) {
      case "temple_guardian":
        player.combatStats.commanderManaCharges = 2;
        break;
      // Rune Keeper's Rune Ritual is NOT a combat-start grant — it triggers the
      // first time the commander is attacked (applyCommanderRuneRitual).
      case "succubus":
        applyCharming(state, playerId);
        break;
      case "astral_spirit":
        applyElementalScourge(state, playerId, unit);
        break;
      default:
        break;
    }
  }
}

/**
 * Rune Keeper commander — Rune Ritual (attack half): EVERY time the commander is
 * attacked in a combat, its owner gains 1 Rune. Called from the attack resolution
 * with the attack's DEFENDER; a no-op unless that defender is a living Rune Keeper
 * commander. `isRetaliation` is the incoming attack's flag — a retaliation's
 * "defender" is the original attacker (the commander striking back is not "being
 * attacked"), so those are skipped. There is NO once-per-combat cap: each incoming
 * attack banks a Rune (the move half is applyCommanderRuneOnMove).
 */
export function applyCommanderRuneRitual(state: GameState, defender: CombatUnitState, isRetaliation: boolean): void {
  if (isRetaliation || defender.commanderSlug !== "bulwark" || defender.damage >= defender.maxHealth) {
    return;
  }
  gainRunes(state, defender.controllerId, 1);
  emitSpecialty(
    state,
    defender.controllerId,
    "bulwark",
    "rune-ritual",
    `The Rune Keeper's ritual answers the attack — +1 Rune.`
  );
}

/**
 * Rune Keeper commander — Rune Ritual (move half): every time the commander
 * MOVES, its owner gains 1 Rune. Called from moveUnit after a Rune Keeper
 * commander's move resolves; a no-op for any other unit. A commander moves at
 * most once per activation, so this is naturally bounded to one Rune per turn.
 */
export function applyCommanderRuneOnMove(state: GameState, unit: CombatUnitState): void {
  if (unit.commanderSlug !== "bulwark" || unit.damage >= unit.maxHealth) {
    return;
  }
  gainRunes(state, unit.controllerId, 1);
  emitSpecialty(
    state,
    unit.controllerId,
    "bulwark",
    "rune-ritual",
    `The Rune Keeper carves a rune as it advances — +1 Rune.`
  );
}

// ---------------------------------------------------------------------------
// Combat end: death persistence and the First Aid casualty window.
// ---------------------------------------------------------------------------

/**
 * Persist commander deaths when a combat resolves: a commander unit that ended
 * the fight at 0 Health marks its owner's commander dead (revivable for gold).
 * Mana charges are cleared for both seats. Returns the set of owners whose
 * commander SURVIVED this combat (used by the First Aid window).
 */
export function finalizeCommandersAfterCombat(state: GameState): Set<PlayerId> {
  const survivors = new Set<PlayerId>();
  const combat = state.combat;
  if (!combat) {
    return survivors;
  }

  for (const unit of Object.values(combat.units)) {
    if (!unit.commanderSlug) {
      continue;
    }
    const player = state.players[unit.controllerId];
    if (!player?.commander) {
      continue;
    }
    if (unit.damage >= unit.maxHealth) {
      // FREE-REVIVE gate: a commander that died this combat is NOT marked dead.
      // Death never persists, no revive gold is spent, and it re-enters the next
      // combat at full health. Two sources (DELIBERATE overlap — different
      // modules, so a player usually has only one): the WOG Commander Artifact
      // Helm of Immortality (relic, bound to the commander's armor slot) OR the
      // anime.equipment Spirit Crane Mount (the main hero's mount slot). Without
      // either, death persists exactly as before (the CONTROL).
      const helm = aggregateCommanderArtifactBonuses(player.commander.artifacts);
      const craneRevive = equipmentGrantsCommanderRevive(state, unit.controllerId);
      if (helm.reviveFree || craneRevive) {
        // The commander is alive AFTER this combat (revived free), so it counts
        // as a survivor — a saved Hierophant still tends the wounded.
        survivors.add(unit.controllerId);
        if (!player.commander.dead) {
          appendEvent(state, {
            type: "COMMANDER_ARTIFACT_SAVED",
            playerId: unit.controllerId,
            commanderSlug: unit.commanderSlug,
            cardId: helm.reviveFree
              ? player.commander.artifacts?.armor ?? "wog.artifact.helm_of_immortality"
              : "anime.equip.spirit_crane_mount",
            message: helm.reviveFree
              ? `${unit.cardName} would have fallen, but the Helm of Immortality revives it — free.`
              : `${unit.cardName} would have fallen, but the Spirit Crane Mount revives it — free.`
          });
        }
      } else if (!player.commander.dead) {
        player.commander.dead = true;
        appendEvent(state, {
          type: "COMMANDER_DIED",
          playerId: unit.controllerId,
          commanderSlug: unit.commanderSlug,
          message: `${unit.cardName} has fallen — revive it for ${2 + 2 * (mainHeroLevelOf(state, unit.controllerId) ?? 1)} gold.`
        });
      }
    } else {
      survivors.add(unit.controllerId);
    }
  }

  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    const player = state.players[playerId];
    if (player?.combatStats.commanderManaCharges !== undefined) {
      delete player.combatStats.commanderManaCharges;
    }
  }

  return survivors;
}

function mainHeroLevelOf(state: GameState, playerId: PlayerId): number | null {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      return hero.level;
    }
  }
  return null;
}

export type CommanderFirstAidOption = NonNullable<
  NonNullable<GameState["adventure"]>["pendingCommanderFirstAid"]
>["options"][number];

/**
 * Hierophant — First Aid Master: collect this player's restorable casualties.
 * MUST run BEFORE the army-sync casualty loop (it reads the pre-sync
 * `armyUnit.side` to detect a Pack→Few flip). Bronze/silver units only.
 */
export function collectFirstAidCandidates(state: GameState, playerId: PlayerId): CommanderFirstAidOption[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  const player = state.players[playerId];
  if (!player) {
    return [];
  }

  const options: CommanderFirstAidOption[] = [];
  for (const unit of Object.values(combat.units)) {
    if (
      unit.controllerId !== playerId ||
      unit.commanderSlug ||
      unit.temporary ||
      unit.cloneOfUnitId ||
      unit.summoned ||
      unit.bankUnit
    ) {
      continue;
    }
    if (unit.grade !== "bronze" && unit.grade !== "silver") {
      continue;
    }
    const armyUnit = player.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (!armyUnit || !unit.unitDefId) {
      continue;
    }

    if (unit.damage >= unit.maxHealth) {
      // Died: the card is about to leave the army (a recruited Neutral card
      // recycles to its tier discard — the revive pulls it back out).
      options.push({
        label: `Revive ${unit.cardName}`,
        kind: "revive",
        unitDefId: unit.unitDefId,
        side: armyUnit.side === "neutral" ? "neutral" : unit.variant === "pack" ? "pack" : "few",
        neutralTier: armyUnit.side === "neutral" ? unit.grade : undefined
      });
    } else if (armyUnit.side === "pack" && unit.variant === "few") {
      // Survived, but flipped down from its Pack side during the fight.
      options.push({
        label: `Restore ${unit.name} to a Pack`,
        kind: "flip-up",
        unitDefId: unit.unitDefId,
        side: "pack",
        armyUnitId: armyUnit.id
      });
    }
  }
  return options;
}
