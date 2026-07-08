import {
  COMMANDER_DEFENSE_TOKEN_GRADE,
  COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION,
  COMMANDER_SLUG_BY_FACTION,
  COMMANDER_STAT_KEYS,
  commanderCastTierIndex,
  commanderDefinitions,
  commanderGradeUpLevels,
  commanderStatValue,
  commanderUnlockedCombos,
  type CommanderCastDefinition,
  type CommanderDefinition,
  type CommanderGrade,
  type CommanderGrades,
  type CommanderSlug
} from "@/data/commanders";
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
 * Queue the grade-up picks a hero level-up crossed (hero level 3/6; the
 * Paladin's Wise: 2/5). Called from gainExperience for each level crossed.
 */
export function queueCommanderGradeUp(player: PlayerState, level: number): boolean {
  const commander = player.commander;
  if (!commander) {
    return false;
  }
  const levels = commanderGradeUpLevels(commander.slug as CommanderSlug);
  if (!levels.includes(level)) {
    return false;
  }
  const pending = (commander.pendingGradeUps ??= []);
  if (!pending.includes(level)) {
    pending.push(level);
  }
  return true;
}

/** Stats a COMMANDER_GRADE_UP pick may still raise (below grade 3). */
export function commanderGradeUpChoices(commander: CommanderPlayerState): CommanderStatKey[] {
  const grades = commanderGradesOf(commander);
  return COMMANDER_STAT_KEYS.filter((key) => grades[key] < 3);
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
 *  - Magic package (grade 0 baseline): ongoing-effect immunity and -1 Spell
 *    damage, rising to -2 at Magic grade 2 and -3 at grade 3;
 *  - Damage grade 1/2/3: +1/+2/+3 bonus damage on its attacks;
 *  - every unlocked combination skill (one stat of the pair at grade 3, the
 *    other at 2+) — Sharpshooter has no ability id (it is the type flip);
 *  - the Soul Eater's Undead paralysis immunity;
 *  - the commander's command ability (the once-per-round cast).
 */
export function commanderAbilityIds(commander: CommanderPlayerState): string[] {
  const definition = commanderDefinitionOf(commander);
  const grades = commanderGradesOf(commander);
  const ids: string[] = [];

  // Magic package (grade 0 baseline, per the module spec).
  const spellWard = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[grades.magic];
  ids.push(spellWard >= 3 ? "reduce-spell-damage-3" : spellWard >= 2 ? "reduce-spell-damage-2" : "reduce-spell-damage-1");
  ids.push("titan-ignore-ongoing");

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

  // Specialty-borne combat passive.
  if (commander.slug === "soul_eater") {
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
  // Superior Combat specialty (Shaman / Sea Marshal): +1 to the chosen stance
  // stat (default Attack), baked into the unit at combat setup.
  const stanceStat = definition.specialty.id === "superior-combat" ? (commander.stance ?? "attack") : null;
  // Sharpshooter combination skill (Attack+Speed): the commander fights as a
  // ranged unit — the combo has no ability tag, the TYPE is the mechanic.
  const canShoot = commanderUnlockedCombos(grades).some((combo) => combo.id === "can-shoot");
  return {
    id: commanderUnitId(player.id),
    controllerId: player.id,
    name: definition.name,
    cardName: definition.name,
    variant: "few",
    grade: "gold",
    type: canShoot ? "ranged" : "ground",
    attack: commanderStatValue("attack", grades.attack) + (stanceStat === "attack" ? 1 : 0),
    defense: commanderStatValue("defense", grades.defense) + (stanceStat === "defense" ? 1 : 0),
    maxHealth: commanderStatValue("health", grades.health),
    damage: 0,
    initiative: commanderStatValue("speed", grades.speed),
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: commanderAbilityIds(commander),
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
// The command ability (once per combat round, free during its activation).
// ---------------------------------------------------------------------------

export function commanderCastOf(unit: CombatUnitState): CommanderCastDefinition | null {
  const slug = unit.commanderSlug as CommanderSlug | undefined;
  return slug ? (commanderDefinitions[slug]?.cast ?? null) : null;
}

/** Power the cast resolves at (from the owner's Magic grade). */
export function commanderCastPower(state: GameState, unit: CombatUnitState): number {
  const commander = state.players[unit.controllerId]?.commander;
  return commander ? commanderPowerOf(commander) : 0;
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
  const ongoingCast =
    cast.effect.kind !== "heal" && cast.effect.kind !== "heal-cleanse";

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
    // Ongoing-effect casts never land on ANY commander (they all carry the
    // Magic grade 1 ongoing-effect immunity) — no dead choices offered.
    if (ongoingCast && target.commanderSlug && target.id !== unit.id) {
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
      const targetRank = target.commanderSlug || target.bankUnit || target.summoned ? null : (TIER_RANK[target.grade] ?? null);
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
  if (!combat || !unit.commanderSlug || combat.activeUnitId !== unit.id) {
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
 * Rune Keeper commander — Rune Ritual: the first time the commander is attacked
 * in a combat, its owner gains 1 Rune (once per combat). Called from the attack
 * resolution with the attack's DEFENDER; a no-op unless that defender is a
 * living Rune Keeper commander that has not yet banked the grant this fight.
 * `isRetaliation` is the incoming attack's flag — a retaliation's "defender" is
 * the original attacker (the commander striking back is not "being attacked"),
 * so those are skipped.
 */
export function applyCommanderRuneRitual(state: GameState, defender: CombatUnitState, isRetaliation: boolean): void {
  if (isRetaliation || defender.commanderSlug !== "bulwark" || defender.runeRitualDone) {
    return;
  }
  defender.runeRitualDone = true;
  gainRunes(state, defender.controllerId, 1);
  emitSpecialty(
    state,
    defender.controllerId,
    "bulwark",
    "rune-ritual",
    `The Rune Keeper's ritual answers the attack — +1 Rune.`
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
      if (!player.commander.dead) {
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
    if (unit.controllerId !== playerId || unit.commanderSlug || unit.temporary || unit.cloneOfUnitId || unit.summoned) {
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
