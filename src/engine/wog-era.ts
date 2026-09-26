/**
 * WoG "era" modules — engine (data: src/data/wog/era.ts).
 *
 * Six OPTIONAL modules, each surfaced on BOTH the WOG and the Anime mod
 * windows; either surface activates ONE flag frozen onto AdventureState at
 * setup (presence = ON). Every reader below starts from that flag, so a game
 * that leaves a module off — and every legacy snapshot — is byte-identical.
 *
 *  - Moving Raid Boss (`adventure.wanderingBoss`): NOT the Rift Lair raid boss
 *    (`raidBosses`, untouched). One lone boss — picked at random from
 *    WANDERING_BOSSES — arrives on round 4/5 (announced a round ahead), walks
 *    one field per round toward the richest seat, heals 25% of its Health each
 *    round and keeps every wound. Heroes fight it from its field or an adjacent
 *    one; the kill pays a relic-tier Artifact search, the other seats split a
 *    gold pot by the damage they dealt.
 *  - Wandering Teacher (`adventure.wanderingTeacher`): a token that relocates
 *    every round and offers two of three lessons to a hero standing on it; a
 *    seat may take two lessons per game.
 *  - Loan Bank (`adventure.loanBank`): borrow 10, repay 15 within 3 rounds or
 *    the bank seizes your newest leaf building (else VP / your gold).
 *  - Mithril (`adventure.mithril`): the discoverer of a new tile gains Far 1 /
 *    Near 2 / Center 3, every seat +1 every 3rd round, and each Near tile
 *    uncovers a Mithril Mine (+1 per Resource Round to its holder); spent only on
 *    enchantments (reroll any die once per round, a forged mine's doubled next
 *    payout, Mithril war machines).
 *  - Karmic Battles (`adventure.karmicBattles`): opt into an empowered guard.
 *  - Skill Combos (`adventure.skillCombos`): one combo card per game.
 *
 * Functions only — this module sits in the adventure.ts import cycle, so it
 * never calls an imported binding at module-evaluation time.
 */

import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions } from "@/data/map/locations";
import {
  LOAN_DEFAULT_VP,
  LOAN_PRINCIPAL,
  LOAN_REPAY,
  LOAN_TERM_ROUNDS,
  MITHRIL_DISCOVERY,
  MITHRIL_FORGE_MINE_COST,
  MITHRIL_INCOME_EVERY_ROUNDS,
  MITHRIL_MINE_INCOME,
  MITHRIL_MINE_KIND,
  MITHRIL_MINE_LOCATION_ID,
  MITHRIL_REROLL_COST,
  MITHRIL_WAR_MACHINE_COST,
  MITHRIL_WAR_MACHINES,
  SKILL_COMBOS,
  TEACHER_LESSON_ORDER,
  TEACHER_LESSONS,
  TEACHER_LESSONS_PER_GAME,
  TEACHER_LESSONS_PER_ROUND,
  TEACHER_RETRAIN_SEARCH,
  TEACHER_STUDY_UNIT_XP,
  WANDERING_BOSS_ATTACK_MP,
  WANDERING_BOSS_IDS,
  WANDERING_BOSS_DEFAULT_SPAWN_ROUND,
  WANDERING_BOSS_GOLD_POT,
  WANDERING_BOSS_HEAL_FRACTION,
  WANDERING_TEACHER_FIRST_ROUND,
  wanderingBossDefinition,
  type SkillComboDefinition
} from "@/data/wog/era";
import {
  canCrossEdge,
  drillableArmyUnits,
  gainExperience,
  gainResources,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  getMainHero,
  getTownOfPlayer,
  isBankStyleGuardLocation,
  isSeaField,
  isTeleportObjectGuardLocation,
  markAbilityEmpowered,
  spendResources
} from "./adventure";
import { appendEvent } from "./events";
import { carveFieldOverride, fieldOverridePlacementCandidates } from "./field-overrides";
import { parallelEngagementOwner, parallelPvpKeeps } from "./parallel-combats";
import { createSeededRandom } from "./random";
import { makeRaidBossCombatUnit } from "./raid-bosses";
import { grantArmyUnitExperience, unitExperienceActive } from "./unit-experience";
import {
  NEUTRAL_PLAYER_ID,
  type AdventureState,
  type AnimeModOptions,
  type AttackRerollSource,
  type CardId,
  type CombatState,
  type CombatUnitState,
  type GameState,
  type HeroId,
  type GameAction,
  type HeroState,
  type LegalAction,
  type MapFieldState,
  type MapSpaceId,
  type MapTileState,
  type PlayerId,
  type PlayerState,
  type TeacherLessonKind,
  type WanderingBossState,
  type WanderingTeacherState,
  type WogModOptions
} from "./state";
import { victoryPointsModeActive } from "./victory-points";

// ---------------------------------------------------------------------------
// Module gates + setup freeze
// ---------------------------------------------------------------------------

export const ERA_MODULE_KEYS = [
  "wanderingBoss",
  "wanderingTeacher",
  "loanBank",
  "mithril",
  "karmicBattles",
  "skillCombos"
] as const;
export type EraModuleKey = (typeof ERA_MODULE_KEYS)[number];

/**
 * The RESOLVED era-module switches for a new game: a module is ON when either
 * surface ticks it (and that surface's mod is enabled). Read once, by the setup
 * freeze (adventure-setup.ts).
 */
export function resolveEraModules(
  wog: Pick<WogModOptions, "enabled" | EraModuleKey | "wanderingBossSpawnRound"> | undefined,
  anime: Pick<AnimeModOptions, "enabled" | EraModuleKey | "wanderingBossSpawnRound"> | undefined
): Record<EraModuleKey, boolean> & { wanderingBossSpawnRound: number } {
  const on = (key: EraModuleKey) =>
    Boolean(wog?.enabled && wog[key]) || Boolean(anime?.enabled && anime[key]);
  // Anime wins ties (the PvE-settings precedent), then WOG, then the default.
  const spawnCandidate =
    anime?.enabled && anime.wanderingBoss
      ? anime.wanderingBossSpawnRound
      : wog?.enabled && wog.wanderingBoss
        ? wog.wanderingBossSpawnRound
        : undefined;
  return {
    wanderingBoss: on("wanderingBoss"),
    wanderingTeacher: on("wanderingTeacher"),
    loanBank: on("loanBank"),
    mithril: on("mithril"),
    karmicBattles: on("karmicBattles"),
    skillCombos: on("skillCombos"),
    wanderingBossSpawnRound:
      spawnCandidate === 4 || spawnCandidate === 5 ? spawnCandidate : WANDERING_BOSS_DEFAULT_SPAWN_ROUND
  };
}

/** The AdventureState fields a new game freezes (nothing for OFF modules). */
export function eraAdventureFields(
  era: ReturnType<typeof resolveEraModules>
): Partial<
  Pick<
    AdventureState,
    "wanderingBoss" | "wanderingTeacher" | "loanBank" | "mithril" | "karmicBattles" | "skillCombos"
  >
> {
  return {
    ...(era.wanderingBoss
      ? {
          // The boss itself is picked (seeded) when it is announced.
          wanderingBoss: {
            spawnRound: era.wanderingBossSpawnRound,
            defId: "",
            spaceId: null,
            maxHealth: 0,
            damage: 0,
            damageBy: {}
          }
        }
      : {}),
    ...(era.wanderingTeacher
      ? { wanderingTeacher: { spaceId: null, offer: [], movedRound: 0 } }
      : {}),
    ...(era.loanBank ? { loanBank: true as const } : {}),
    ...(era.mithril ? { mithril: true as const } : {}),
    ...(era.karmicBattles ? { karmicBattles: true as const } : {}),
    ...(era.skillCombos ? { skillCombos: true as const } : {})
  };
}

// ---------------------------------------------------------------------------
// Legal-action offers (own open map turn, nothing pending — legal-actions.ts
// calls this beside HERO_TRAIN, after the start-of-turn draw gate)
// ---------------------------------------------------------------------------

const RESOURCE_WORD: Record<string, string> = {
  gold: "gold",
  buildingMaterials: "building materials",
  valuables: "valuables"
};

export function addWogEraActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
    return;
  }
  const push = (label: string, action: GameAction) => actions.push({ label, action });
  if (adventure.wanderingBoss) {
    for (const hero of wanderingBossAttackers(state, playerId)) {
      push(`Attack ${wanderingBossDefinition(adventure.wanderingBoss.defId).name} with your ${hero.kind === "main" ? "Main" : "Secondary"} Hero (${WANDERING_BOSS_ATTACK_MP} movement)`, {
        type: "ATTACK_WANDERING_BOSS",
        playerId,
        heroId: hero.id
      });
    }
  }
  if (adventure.wanderingTeacher) {
    for (const offer of teacherLessonOffers(state, playerId)) {
      push(teacherLessonLabel(offer), {
        type: "TEACHER_LESSON",
        playerId,
        heroId: offer.heroId,
        lesson: offer.lesson,
        ...(offer.cardId ? { cardId: offer.cardId } : {}),
        ...(offer.armyUnitId ? { armyUnitId: offer.armyUnitId } : {})
      });
    }
  }
  if (adventure.loanBank) {
    if (canTakeLoan(state, playerId)) {
      push(`Loan Bank: borrow ${LOAN_PRINCIPAL} gold (repay ${LOAN_REPAY} by the end of round ${state.round + LOAN_TERM_ROUNDS})`, {
        type: "TAKE_LOAN",
        playerId
      });
    }
    if (canRepayLoan(state, playerId)) {
      push(`Loan Bank: repay ${player.loan!.repay} gold now`, { type: "REPAY_LOAN", playerId });
    }
  }
  if (adventure.mithril) {
    for (const field of forgeableMines(state, playerId)) {
      push(
        `Mithril: forge your ${RESOURCE_WORD[field.resource ?? ""] ?? "resource"} mine — double its next Resource-round payout (${MITHRIL_FORGE_MINE_COST} Mithril)`,
        { type: "MITHRIL_FORGE_MINE", playerId, fieldId: field.spaceId }
      );
    }
    for (const cardId of upgradeableWarMachines(state, playerId)) {
      push(`Mithril: forge a ${MITHRIL_WAR_MACHINES[cardId]!.name} (${MITHRIL_WAR_MACHINE_COST} Mithril)`, {
        type: "MITHRIL_UPGRADE_WAR_MACHINE",
        playerId,
        cardId
      });
    }
  }
  if (adventure.skillCombos) {
    for (const combo of availableSkillCombos(state, playerId)) {
      push(
        `Skill Combo: forge ${combo.name} (${combo.requires.map((cardId) => cardLibrary[cardId]?.name ?? cardId).join(" + ")}) — one per game`,
        { type: "FORGE_SKILL_COMBO", playerId, comboId: combo.id }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function liveSeats(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (playerId) => playerId !== NEUTRAL_PLAYER_ID && Boolean(state.players[playerId]) && !state.players[playerId]?.eliminated
  );
}

function playerName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

function coreUnitName(unitDefId: string): string {
  return coreUnitDefinitions[unitDefId]?.name ?? unitDefId;
}

function heroSpaces(state: GameState): Set<MapSpaceId> {
  const spaces = new Set<MapSpaceId>();
  for (const hero of Object.values(state.heroes)) {
    if (hero?.spaceId) {
      spaces.add(hero.spaceId);
    }
  }
  return spaces;
}

/** Locations a wandering token never stands on (objectives and gateways). */
const TOKEN_AVOID_LOCATIONS = new Set([
  "town",
  "random_town",
  "settlement",
  "rift_lair",
  "dungeon_gate",
  "calamity_gate",
  "subterranean_gate"
]);

/**
 * Whether a wandering token (the moving boss or the Teacher) may stand on this
 * field: revealed land, not blocked, not an objective / gateway, and no hero on
 * it. Guarded fields are fine — a token is an overlay; the field keeps its own
 * content.
 */
function tokenCanStand(state: GameState, field: MapFieldState | undefined, occupied: Set<MapSpaceId>): boolean {
  if (!field) {
    return false;
  }
  if (occupied.has(field.spaceId) || isSeaField(state, field.spaceId)) {
    return false;
  }
  if (locationDefinitions[field.location]?.category === "blocked") {
    return false;
  }
  if (
    TOKEN_AVOID_LOCATIONS.has(field.location) ||
    isTeleportObjectGuardLocation(field.location) ||
    isBankStyleGuardLocation(field.location) ||
    field.riftLair ||
    field.dungeonSite
  ) {
    return false;
  }
  return true;
}

function eraRandom(state: GameState, label: string) {
  return createSeededRandom(`${state.seed}#wog-era#${label}#${state.round}`);
}

function note(state: GameState, message: string, playerId?: PlayerId): void {
  appendEvent(state, { type: "EVENT_NOTE", ...(playerId ? { playerId } : {}), message });
}

// ---------------------------------------------------------------------------
// Round start (called from startAdventureRound's shared prefix, every round)
// ---------------------------------------------------------------------------

/** Every era module's round-start work, in a fixed order. No-op when all off. */
export function applyEraRoundStart(state: GameState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  if (adventure.loanBank) {
    settleDueLoans(state);
  }
  if (adventure.mithril) {
    applyMithrilRoundIncome(state);
  }
  if (adventure.wanderingBoss) {
    applyWanderingBossRoundStart(state, adventure.wanderingBoss);
  }
  if (adventure.wanderingTeacher) {
    applyWanderingTeacherRoundStart(state, adventure.wanderingTeacher);
  }
}

// ---------------------------------------------------------------------------
// Moving Raid Boss
// ---------------------------------------------------------------------------

/** The boss while it is on the map and alive, else null. */
export function wanderingBossOnMap(state: GameState): WanderingBossState | null {
  const boss = state.adventure?.wanderingBoss;
  if (!boss || !boss.spaceId || boss.slainBy || boss.damage >= boss.maxHealth) {
    return null;
  }
  return boss;
}

/** The boss unit id minted into a fight (one boss per game). */
export function wanderingBossUnitId(defId: string): string {
  return `boss_${defId}`;
}

/** Seeded pick of this game's boss (once; at the announcement or arrival). */
function pickWanderingBoss(state: GameState, boss: WanderingBossState): void {
  if (boss.defId && WANDERING_BOSS_IDS.includes(boss.defId)) {
    return;
  }
  const pool = [...WANDERING_BOSS_IDS].sort();
  const defId = pool[eraRandom(state, "boss-pick").nextInt(0, pool.length - 1)] ?? pool[0]!;
  const def = wanderingBossDefinition(defId);
  boss.defId = def.id;
  boss.maxHealth = def.health;
  boss.damage = 0;
}

/**
 * Whether the boss's recorded engagement is backed by a live fight: the active
 * combat or a parked parallel combat of the engaged seat. A stale lock (a fight
 * that vanished without settling) must never block the boss forever.
 */
function wanderingBossEngagementLive(state: GameState, boss: WanderingBossState): boolean {
  const seat = boss.engagedBy;
  if (!seat) {
    return false;
  }
  const isBossFight = (combat: CombatState | null | undefined) =>
    Boolean(combat && combat.context.kind === "neutral" && combat.context.wanderingBoss && combat.attackerPlayerId === seat);
  return (
    isBossFight(state.combat) ||
    isBossFight(state.parallelCombats?.[seat]?.combat) ||
    isBossFight(state.adventure?.parallelEventSuspended?.[seat]?.combat)
  );
}

/**
 * Heroes of `playerId` that may attack the boss right now (1 MP, on/adjacent).
 * The gate mirrors an ordinary hero-initiated fight (a step onto a guard —
 * getHeroMoveDestinations): a hero whose movement is halted this turn (a sea
 * step) cannot start one, and the edge toward the boss is crossed with the
 * hero's own movement capabilities (Pathfinding over a yellow border, …). Like
 * ordinary guard fights there is no per-turn fight cap: each attempt costs 1 MP.
 */
export function wanderingBossAttackers(state: GameState, playerId: PlayerId): HeroState[] {
  const boss = wanderingBossOnMap(state);
  if (!boss?.spaceId || wanderingBossEngagementLive(state, boss)) {
    return [];
  }
  const bossSpace = boss.spaceId;
  return Object.values(state.heroes).filter(
    (hero): hero is HeroState =>
      Boolean(hero) &&
      hero.controllerId === playerId &&
      Boolean(hero.spaceId) &&
      !hero.movementHaltedThisTurn &&
      hero.movementPoints >= WANDERING_BOSS_ATTACK_MP &&
      (hero.spaceId === bossSpace ||
        (getAdjacentSpaceIds(hero.spaceId!).includes(bossSpace) &&
          canCrossEdge(state, hero.spaceId!, bossSpace, getHeroMovementCapabilities(state, hero))))
  );
}

/**
 * Commit a boss attack (the combat itself is opened by the caller): spend the
 * movement and stamp the engagement so no second fight can open on stale
 * wounds. Throws when the attack is not available.
 */
export function beginWanderingBossAttack(state: GameState, playerId: PlayerId, heroId: HeroId): HeroState {
  const hero = state.heroes[heroId];
  const boss = wanderingBossOnMap(state);
  if (!hero || !boss || !wanderingBossAttackers(state, playerId).some((candidate) => candidate.id === heroId)) {
    throw new Error("That hero cannot reach the moving Raid Boss right now.");
  }
  hero.movementPoints -= WANDERING_BOSS_ATTACK_MP;
  boss.engagedBy = playerId;
  boss.engagedStartDamage = boss.damage;
  note(
    state,
    `${playerName(state, playerId)} attacks ${wanderingBossDefinition(boss.defId).name} (${boss.maxHealth - boss.damage}/${boss.maxHealth} Health left).`,
    playerId
  );
  return hero;
}

/** Mint the lone boss body for a fight, its recorded wounds carried in. */
export function mintWanderingBossUnit(state: GameState, position: number): CombatUnitState | null {
  const boss = state.adventure?.wanderingBoss;
  if (!boss) {
    return null;
  }
  const def = wanderingBossDefinition(boss.defId);
  const unit = makeRaidBossCombatUnit(def, 1, wanderingBossUnitId(def.id), position);
  unit.maxHealth = boss.maxHealth;
  unit.damage = Math.max(0, Math.min(boss.maxHealth - 1, boss.damage));
  return unit;
}

/**
 * Combat end (every outcome): write the boss's wounds back, credit the damage
 * this fight dealt to the fighter, release the engagement. Returns whether the
 * boss fell in this fight.
 */
export function settleWanderingBossCombat(state: GameState, combat: CombatState, playerId: PlayerId): boolean {
  const boss = state.adventure?.wanderingBoss;
  if (!boss) {
    return false;
  }
  const def = wanderingBossDefinition(boss.defId);
  const unit = combat.units[wanderingBossUnitId(def.id)];
  if (!unit) {
    // The boss was never revealed (the fight ended during placement): nothing
    // was dealt, nothing changes — only the engagement is released.
    delete boss.engagedBy;
    delete boss.engagedStartDamage;
    return false;
  }
  const dead = unit.damage >= unit.maxHealth;
  const endDamage = dead ? boss.maxHealth : Math.max(0, Math.min(boss.maxHealth, unit.damage));
  const startDamage = boss.engagedStartDamage ?? boss.damage;
  const dealt = Math.max(0, endDamage - startDamage);
  if (dealt > 0) {
    boss.damageBy[playerId] = (boss.damageBy[playerId] ?? 0) + dealt;
  }
  boss.damage = endDamage;
  delete boss.engagedBy;
  delete boss.engagedStartDamage;
  if (!dead) {
    note(
      state,
      `${def.name} survives with ${boss.maxHealth - boss.damage}/${boss.maxHealth} Health (${dealt} damage dealt by ${playerName(state, playerId)}; wounds persist).`,
      playerId
    );
  }
  return dead;
}

/**
 * The kill: the killer takes a relic-tier Artifact search; every OTHER seat
 * that dealt damage splits the gold pot in proportion to its share of all the
 * damage the boss ever took (minimum 1 gold for any damage). Idempotent.
 */
export function resolveWanderingBossVictory(state: GameState, killerId: PlayerId): void {
  const adventure = state.adventure;
  const boss = adventure?.wanderingBoss;
  // Only a boss whose settled wounds reached its Health can be claimed.
  if (!adventure || !boss || boss.slainBy || boss.damage < boss.maxHealth) {
    return;
  }
  const def = wanderingBossDefinition(boss.defId);
  boss.slainBy = killerId;
  boss.slainRound = state.round;
  boss.damage = boss.maxHealth;
  boss.spaceId = null;
  delete boss.engagedBy;
  delete boss.engagedStartDamage;
  const totalDamage = Object.values(boss.damageBy).reduce((sum, value) => sum + value, 0);
  const shares: string[] = [];
  for (const playerId of liveSeats(state)) {
    const dealt = boss.damageBy[playerId] ?? 0;
    if (playerId === killerId || dealt <= 0 || totalDamage <= 0) {
      continue;
    }
    const gold = Math.max(1, Math.floor((WANDERING_BOSS_GOLD_POT * dealt) / totalDamage));
    // Parallel turns, PvP "keep": a seat busy elsewhere (a battle, a choice)
    // must not be changed by this action — the table's safety net would refuse
    // the killing blow itself (and a computer fighter would retry it). Its share
    // is banked and paid at the next round start instead.
    if (parallelPvpKeeps(state) && parallelEngagementOwner(state, playerId, state.parallelCombatOwnerId)) {
      const owed = (boss.pendingShares ??= {});
      owed[playerId] = (owed[playerId] ?? 0) + gold;
      shares.push(`${playerName(state, playerId)} +${gold} gold at the next round start (${dealt} damage)`);
      continue;
    }
    gainResources(state, playerId, { gold }, `damage dealt to ${def.name}`);
    shares.push(`${playerName(state, playerId)} +${gold} gold (${dealt} damage)`);
  }
  const relicDeck = state.decks["artifacts-relic"] ? "artifacts-relic" : "artifacts";
  adventure.rewardQueue.unshift({ playerId: killerId, kind: "shared-deck-search", deckId: relicDeck, count: 1 });
  note(
    state,
    `${playerName(state, killerId)} lands the killing blow on ${def.name} and claims a relic-tier Artifact search!${
      shares.length > 0 ? ` Chip damage paid out: ${shares.join(", ")}.` : ""
    }`,
    killerId
  );
}

/** The seat the boss hunts: most gold, then most total resources, then turn order. */
export function wanderingBossQuarry(state: GameState): PlayerId | null {
  let best: PlayerId | null = null;
  let bestKey: [number, number] = [-1, -1];
  for (const playerId of liveSeats(state)) {
    const resources = state.players[playerId]?.resources;
    if (!resources) {
      continue;
    }
    const key: [number, number] = [
      resources.gold,
      resources.gold + resources.buildingMaterials + resources.valuables
    ];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
      best = playerId;
      bestKey = key;
    }
  }
  return best;
}

/** BFS distances from `from` over fields the boss may stand on (plus `from`). */
function tokenDistances(
  state: GameState,
  from: MapSpaceId,
  occupied: Set<MapSpaceId>
): Map<MapSpaceId, { distance: number; firstStep: MapSpaceId | null }> {
  const fields = state.adventure?.fields ?? {};
  const result = new Map<MapSpaceId, { distance: number; firstStep: MapSpaceId | null }>();
  result.set(from, { distance: 0, firstStep: null });
  const queue: MapSpaceId[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const entry = result.get(current)!;
    for (const next of getAdjacentSpaceIds(current)) {
      if (result.has(next) || !tokenCanStand(state, fields[next], occupied) || !canCrossEdge(state, current, next)) {
        continue;
      }
      result.set(next, { distance: entry.distance + 1, firstStep: entry.firstStep ?? next });
      queue.push(next);
    }
  }
  return result;
}

/**
 * The boss's one step toward its quarry: the nearest of the quarry's heroes (or
 * its town) measured to a standable field ADJACENT to it; the boss never enters
 * a hero's field. Null = stay (already adjacent, or no route).
 */
function wanderingBossNextStep(
  state: GameState,
  boss: WanderingBossState,
  quarry: PlayerId
): MapSpaceId | null {
  const from = boss.spaceId;
  if (!from) {
    return null;
  }
  const occupied = heroSpaces(state);
  if (state.adventure?.wanderingTeacher?.spaceId) {
    occupied.add(state.adventure.wanderingTeacher.spaceId);
  }
  const distances = tokenDistances(state, from, occupied);
  const targets: MapSpaceId[] = Object.values(state.heroes)
    .filter((hero): hero is HeroState => Boolean(hero?.spaceId) && hero.controllerId === quarry)
    .map((hero) => hero.spaceId!);
  const town = getTownOfPlayer(state, quarry);
  if (targets.length === 0 && town?.fieldId) {
    targets.push(town.fieldId);
  }
  let best: { distance: number; step: MapSpaceId | null } | null = null;
  for (const target of [...targets].sort()) {
    const around = getAdjacentSpaceIds(target);
    if (target === from || (around.includes(from) && canCrossEdge(state, from, target))) {
      return null; // already on / next to the quarry
    }
    for (const approach of around) {
      const entry = distances.get(approach);
      if (!entry || entry.distance === 0) {
        continue;
      }
      if (!best || entry.distance < best.distance) {
        best = { distance: entry.distance, step: entry.firstStep };
      }
    }
  }
  return best?.step ?? null;
}

function applyWanderingBossRoundStart(state: GameState, boss: WanderingBossState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  // Chip-damage shares banked at the kill for seats that were busy then
  // (parallel PvP "keep" — see resolveWanderingBossVictory).
  if (boss.pendingShares) {
    const live = new Set(liveSeats(state));
    for (const [playerId, gold] of Object.entries(boss.pendingShares).sort(([a], [b]) => a.localeCompare(b))) {
      if (live.has(playerId) && gold > 0) {
        gainResources(state, playerId, { gold }, `damage dealt to ${wanderingBossDefinition(boss.defId).name}`);
      }
    }
    delete boss.pendingShares;
  }
  if (boss.slainBy) {
    return;
  }
  if (boss.engagedBy && !wanderingBossEngagementLive(state, boss)) {
    delete boss.engagedBy;
    delete boss.engagedStartDamage;
  }
  if (!boss.spaceId) {
    if (state.round === boss.spawnRound - 1) {
      pickWanderingBoss(state, boss);
      note(
        state,
        `The ground trembles — ${wanderingBossDefinition(boss.defId).name} will stride onto the map at the start of round ${boss.spawnRound} and hunt the richest player.`
      );
    }
    if (state.round >= boss.spawnRound) {
      spawnWanderingBoss(state, boss);
    }
    return;
  }
  if ((boss.spawnedRound ?? state.round) >= state.round) {
    return;
  }
  // A fight still running across the round boundary owns the boss: no heal
  // (it would skew that fight's damage credit) and no step until it settles.
  if (wanderingBossEngagementLive(state, boss)) {
    return;
  }
  // Heal first (25% of its Health, rounded up), then walk one field.
  if (boss.damage > 0) {
    const heal = Math.min(boss.damage, Math.ceil(boss.maxHealth * WANDERING_BOSS_HEAL_FRACTION));
    boss.damage -= heal;
    note(
      state,
      `${wanderingBossDefinition(boss.defId).name} regenerates ${heal} Health (${boss.maxHealth - boss.damage}/${boss.maxHealth}). Keep chipping or it recovers.`
    );
  }
  const quarry = wanderingBossQuarry(state);
  if (!quarry) {
    return;
  }
  boss.targetPlayerId = quarry;
  const step = wanderingBossNextStep(state, boss, quarry);
  if (step) {
    boss.spaceId = step;
    note(state, `${wanderingBossDefinition(boss.defId).name} moves one field toward ${playerName(state, quarry)}, the richest player.`);
  }
}

function spawnWanderingBoss(state: GameState, boss: WanderingBossState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  const occupied = heroSpaces(state);
  if (adventure.wanderingTeacher?.spaceId) {
    occupied.add(adventure.wanderingTeacher.spaceId);
  }
  const bandRank: Record<string, number> = { center: 0, near: 1, far: 2 };
  const candidates = Object.values(adventure.fields).filter((field) => tokenCanStand(state, field, occupied));
  if (candidates.length === 0) {
    return; // nothing revealed to stand on yet — retried next round
  }
  const rank = (field: MapFieldState) => bandRank[adventure.tiles[field.tileInstanceId]?.group ?? ""] ?? 3;
  const bestRank = Math.min(...candidates.map(rank));
  const pool = candidates.filter((field) => rank(field) === bestRank).sort((a, b) => a.spaceId.localeCompare(b.spaceId));
  const field = pool[eraRandom(state, "boss-spawn").nextInt(0, pool.length - 1)] ?? pool[0]!;
  pickWanderingBoss(state, boss);
  const def = wanderingBossDefinition(boss.defId);
  boss.spaceId = field.spaceId;
  boss.spawnedRound = state.round;
  boss.damage = 0;
  note(
    state,
    `${def.name} (${boss.maxHealth} Health — ${def.summary}) strides onto the map! It walks one field toward the richest player every round and regenerates 25% of its Health each round; wounds persist. Attack it from its field or an adjacent one (1 movement). The killing blow claims a relic-tier Artifact search; everyone else who hurt it splits ${WANDERING_BOSS_GOLD_POT} gold by damage dealt.`
  );
}

// ---------------------------------------------------------------------------
// Wandering Teacher
// ---------------------------------------------------------------------------

function applyWanderingTeacherRoundStart(state: GameState, teacher: WanderingTeacherState): void {
  const adventure = state.adventure;
  if (!adventure || state.round < WANDERING_TEACHER_FIRST_ROUND || teacher.movedRound === state.round) {
    return;
  }
  const occupied = heroSpaces(state);
  const bossSpace = adventure.wanderingBoss?.spaceId;
  if (bossSpace) {
    occupied.add(bossSpace);
  }
  const candidates = Object.values(adventure.fields)
    .filter((field) => field.spaceId !== teacher.spaceId && tokenCanStand(state, field, occupied))
    .sort((a, b) => a.spaceId.localeCompare(b.spaceId));
  teacher.movedRound = state.round;
  if (candidates.length === 0) {
    return;
  }
  const random = eraRandom(state, "teacher");
  teacher.spaceId = candidates[random.nextInt(0, candidates.length - 1)]!.spaceId;
  const lessons = [...TEACHER_LESSON_ORDER];
  for (let index = lessons.length - 1; index > 0; index -= 1) {
    const swap = random.nextInt(0, index);
    [lessons[index], lessons[swap]] = [lessons[swap]!, lessons[index]!];
  }
  teacher.offer = TEACHER_LESSON_ORDER.filter((kind) => lessons.slice(0, TEACHER_LESSONS_PER_ROUND).includes(kind));
  note(
    state,
    `The Wandering Teacher moves on and now offers ${teacher.offer
      .map((kind) => `${TEACHER_LESSONS[kind].name} (${TEACHER_LESSONS[kind].gold} gold)`)
      .join(" and ")} this round — reach the Teacher's field with a hero.`
  );
}

/**
 * Hand Ability cards a lesson may take: Mastery Empowers any not-yet-Empowered
 * Ability (a forged combo card included); Retrain never sets a combo aside.
 */
function lessonHandAbilities(player: PlayerState, lesson: TeacherLessonKind): CardId[] {
  const seen = new Set<CardId>();
  for (const cardId of player.hand) {
    const card = cardLibrary[cardId];
    if (card?.kind !== "ability" || seen.has(cardId)) {
      continue;
    }
    if (lesson === "retrain" && cardId.startsWith("combo.")) {
      continue;
    }
    if (lesson === "mastery" && player.empoweredAbilities?.includes(cardId)) {
      continue;
    }
    seen.add(cardId);
  }
  return [...seen];
}

export type TeacherLessonOffer = {
  heroId: HeroId;
  lesson: TeacherLessonKind;
  cardId?: CardId;
  /** Study with Unit Experience on: the army unit that gains the XP. */
  armyUnitId?: string;
  armyUnitName?: string;
  gold: number;
};

/** Lessons `playerId` may still take this game. */
export function teacherLessonsLeft(state: GameState, playerId: PlayerId): number {
  return Math.max(0, TEACHER_LESSONS_PER_GAME - (state.players[playerId]?.teacherLessons ?? 0));
}

/** Every concrete lesson `playerId` may buy right now (the legal-action source). */
export function teacherLessonOffers(state: GameState, playerId: PlayerId): TeacherLessonOffer[] {
  const teacher = state.adventure?.wanderingTeacher;
  const player = state.players[playerId];
  if (!teacher?.spaceId || !player || teacherLessonsLeft(state, playerId) <= 0) {
    return [];
  }
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate?.controllerId === playerId && candidate.spaceId === teacher.spaceId
  );
  if (!hero) {
    return [];
  }
  const offers: TeacherLessonOffer[] = [];
  for (const lesson of teacher.offer) {
    const gold = TEACHER_LESSONS[lesson].gold;
    if (player.resources.gold < gold) {
      continue;
    }
    if (lesson === "study") {
      const main = getMainHero(state, playerId);
      if (main) {
        offers.push({ heroId: hero.id, lesson, gold });
      }
      // Unit Experience on: the lesson may train one army unit instead.
      if (unitExperienceActive(state)) {
        for (const armyUnit of drillableArmyUnits(state, playerId)) {
          offers.push({ heroId: hero.id, lesson, armyUnitId: armyUnit.id, armyUnitName: coreUnitName(armyUnit.unitDefId), gold });
        }
      }
      continue;
    }
    for (const cardId of lessonHandAbilities(player, lesson)) {
      offers.push({ heroId: hero.id, lesson, cardId, gold });
    }
  }
  return offers;
}

export function teacherLessonLabel(offer: TeacherLessonOffer): string {
  const lesson = TEACHER_LESSONS[offer.lesson];
  const cardName = offer.cardId ? cardLibrary[offer.cardId]?.name ?? offer.cardId : "";
  if (offer.lesson === "mastery") {
    return `Teacher — Mastery: Empower ${cardName} (${lesson.gold} gold)`;
  }
  if (offer.lesson === "retrain") {
    return `Teacher — Retrain: remove ${cardName}, Search the Ability deck (${TEACHER_RETRAIN_SEARCH}) (${lesson.gold} gold)`;
  }
  if (offer.armyUnitId) {
    return `Teacher — Study: ${offer.armyUnitName ?? "an army unit"} +${TEACHER_STUDY_UNIT_XP} experience (${lesson.gold} gold)`;
  }
  return `Teacher — Study: Main Hero +1 experience (${lesson.gold} gold)`;
}

/** Resolve a bought lesson. Throws when the lesson is not on offer. */
export function takeTeacherLesson(
  state: GameState,
  playerId: PlayerId,
  heroId: HeroId,
  lesson: TeacherLessonKind,
  cardId: CardId | undefined,
  armyUnitId: string | undefined
): void {
  const teacher = state.adventure?.wanderingTeacher;
  const player = state.players[playerId];
  const offer = teacherLessonOffers(state, playerId).find(
    (candidate) =>
      candidate.heroId === heroId &&
      candidate.lesson === lesson &&
      candidate.cardId === cardId &&
      candidate.armyUnitId === armyUnitId
  );
  if (!teacher || !player || !offer) {
    throw new Error("The Wandering Teacher does not offer that lesson to you right now.");
  }
  spendResources(state, playerId, { gold: offer.gold }, `${TEACHER_LESSONS[lesson].name} lesson`);
  player.teacherLessons = (player.teacherLessons ?? 0) + 1;
  if (lesson === "mastery" && cardId) {
    markAbilityEmpowered(player, cardId);
    note(
      state,
      `${playerName(state, playerId)} studies Mastery with the Wandering Teacher: ${cardLibrary[cardId]?.name ?? cardId} is Empowered (Expert side without a crown).`,
      playerId
    );
    return;
  }
  if (lesson === "retrain" && cardId) {
    const index = player.hand.indexOf(cardId);
    if (index >= 0) {
      player.hand.splice(index, 1);
      player.removed.push(cardId);
    }
    state.adventure!.rewardQueue.push({
      playerId,
      kind: "shared-deck-search",
      deckId: "abilities",
      count: TEACHER_RETRAIN_SEARCH
    });
    note(
      state,
      `${playerName(state, playerId)} retrains with the Wandering Teacher: ${cardLibrary[cardId]?.name ?? cardId} is set aside for a Search of the Ability deck (${TEACHER_RETRAIN_SEARCH}).`,
      playerId
    );
    return;
  }
  if (armyUnitId) {
    const armyUnit = player.army.find((candidate) => candidate.id === armyUnitId);
    if (armyUnit) {
      grantArmyUnitExperience(state, playerId, armyUnit, TEACHER_STUDY_UNIT_XP);
      note(
        state,
        `${playerName(state, playerId)} studies with the Wandering Teacher: ${coreUnitName(armyUnit.unitDefId)} gains ${TEACHER_STUDY_UNIT_XP} experience.`,
        playerId
      );
    }
    return;
  }
  gainExperience(state, playerId, 1);
  note(state, `${playerName(state, playerId)} studies with the Wandering Teacher: +1 experience.`, playerId);
}

// ---------------------------------------------------------------------------
// Loan Bank
// ---------------------------------------------------------------------------

export function canTakeLoan(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    state.adventure?.loanBank &&
      player &&
      !player.loan &&
      !player.loanDefaulted &&
      Object.values(state.towns).some((town) => town?.controllerId === playerId)
  );
}

export function canRepayLoan(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(state.adventure?.loanBank && player?.loan && player.resources.gold >= player.loan.repay);
}

export function takeLoan(state: GameState, playerId: PlayerId): void {
  if (!canTakeLoan(state, playerId)) {
    throw new Error("The Loan Bank will not lend to you right now.");
  }
  const player = state.players[playerId]!;
  player.loan = {
    principal: LOAN_PRINCIPAL,
    repay: LOAN_REPAY,
    takenRound: state.round,
    dueRound: state.round + LOAN_TERM_ROUNDS
  };
  gainResources(state, playerId, { gold: LOAN_PRINCIPAL }, "Loan Bank loan");
  note(
    state,
    `${playerName(state, playerId)} borrows ${LOAN_PRINCIPAL} gold from the Loan Bank — ${LOAN_REPAY} gold is due by the end of round ${player.loan.dueRound}.`,
    playerId
  );
}

export function repayLoan(state: GameState, playerId: PlayerId): void {
  if (!canRepayLoan(state, playerId)) {
    throw new Error("You cannot repay the loan right now.");
  }
  const player = state.players[playerId]!;
  const repay = player.loan!.repay;
  spendResources(state, playerId, { gold: repay }, "repaid the Loan Bank");
  delete player.loan;
  note(state, `${playerName(state, playerId)} repays the Loan Bank (${repay} gold).`, playerId);
}

/**
 * The building the bank seizes on a default: the most recently built building
 * that no other standing building needs, in the seat's home town first, then
 * any other town it controls. Null when it has nothing to seize.
 */
function seizableBuilding(state: GameState, playerId: PlayerId): { townId: string; buildingId: string } | null {
  const home = getTownOfPlayer(state, playerId);
  const towns = [
    ...(home ? [home] : []),
    ...Object.values(state.towns).filter((town) => town && town !== home && town.controllerId === playerId)
  ];
  for (const town of towns) {
    for (let index = town.buildings.length - 1; index >= 0; index -= 1) {
      const buildingId = town.buildings[index]!;
      const needed = town.buildings.some(
        (other) => other !== buildingId && (coreBuildingDefinitions[other]?.prerequisites ?? []).includes(buildingId)
      );
      if (!needed) {
        return { townId: town.id, buildingId };
      }
    }
  }
  return null;
}

/** Round start: settle every loan whose last round has passed. */
function settleDueLoans(state: GameState): void {
  for (const playerId of liveSeats(state)) {
    const player = state.players[playerId];
    const loan = player?.loan;
    if (!player || !loan || state.round <= loan.dueRound) {
      continue;
    }
    if (player.resources.gold >= loan.repay) {
      spendResources(state, playerId, { gold: loan.repay }, "Loan Bank collection");
      delete player.loan;
      note(state, `The Loan Bank collects ${loan.repay} gold from ${playerName(state, playerId)} — loan settled.`, playerId);
      continue;
    }
    delete player.loan;
    player.loanDefaulted = true;
    const seized = seizableBuilding(state, playerId);
    if (seized) {
      const town = state.towns[seized.townId]!;
      town.buildings = town.buildings.filter((buildingId) => buildingId !== seized.buildingId);
      if (town.factionCubes) {
        delete town.factionCubes[seized.buildingId];
      }
      note(
        state,
        `${playerName(state, playerId)} defaults on the Loan Bank — the bank seizes ${
          coreBuildingDefinitions[seized.buildingId]?.name ?? seized.buildingId
        }. The bank will never lend to them again.`,
        playerId
      );
      continue;
    }
    if (victoryPointsModeActive(state) && state.adventure) {
      const ledger = (state.adventure.vpLedger ??= {});
      const entry = (ledger[playerId] ??= {});
      entry.loanDefaultVp = (entry.loanDefaultVp ?? 0) + LOAN_DEFAULT_VP;
      note(
        state,
        `${playerName(state, playerId)} defaults on the Loan Bank with no building to seize — ${LOAN_DEFAULT_VP} Victory Points are forfeited.`,
        playerId
      );
      continue;
    }
    const gold = player.resources.gold;
    if (gold > 0) {
      spendResources(state, playerId, { gold }, "Loan Bank default");
    }
    note(
      state,
      `${playerName(state, playerId)} defaults on the Loan Bank with no building to seize — the bank takes all ${gold} of their gold.`,
      playerId
    );
  }
}

// ---------------------------------------------------------------------------
// Mithril
// ---------------------------------------------------------------------------

export function mithrilOf(state: GameState, playerId: PlayerId): number {
  return state.players[playerId]?.mithril ?? 0;
}

function spendMithril(state: GameState, playerId: PlayerId, amount: number): void {
  const player = state.players[playerId];
  if (!player || (player.mithril ?? 0) < amount) {
    throw new Error("Not enough Mithril.");
  }
  player.mithril = (player.mithril ?? 0) - amount;
}

function gainMithril(state: GameState, playerId: PlayerId, amount: number, why: string): void {
  const player = state.players[playerId];
  if (!player || amount <= 0 || playerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  player.mithril = (player.mithril ?? 0) + amount;
  note(state, `${playerName(state, playerId)} gains ${amount} Mithril (${why}) — now ${player.mithril}.`, playerId);
}

/**
 * Discovery Mithril: the player who DISCOVERS a new tile (reveals or places it —
 * the SET_TILE_ROTATION that materializes it) gains Far 1 / Near 2 / Center 3,
 * once per tile. Starting, sea and subterranean tiles pay nothing.
 */
export function grantDiscoveryMithril(state: GameState, playerId: PlayerId, tile: MapTileState): void {
  if (!state.adventure?.mithril || tile.mithrilGranted) {
    return;
  }
  const amount = MITHRIL_DISCOVERY[tile.group ?? ""] ?? 0;
  if (amount <= 0) {
    return;
  }
  tile.mithrilGranted = true;
  gainMithril(state, playerId, amount, `discovered a ${tile.group} tile`);
}

/**
 * Mithril Mine: carve the one Mithril Mine a revealed Near tile carries onto a
 * legal plain field (the Field-Override cover rules: no guard, objective, bank,
 * town or hero there). Called after the tile materializes — the discovery's
 * SET_TILE_ROTATION and the setup pass for tiles already face up. Seeded pick;
 * tried once per tile (no candidate ⇒ no mine on that tile).
 */
export function carveMithrilMine(state: GameState, tile: MapTileState): void {
  const adventure = state.adventure;
  if (!adventure?.mithril || tile.group !== "near" || tile.faceDown || tile.awaitingRotation || tile.mithrilMine) {
    return;
  }
  tile.mithrilMine = true;
  // Designer-pinned Field Overrides still queued on this tile take priority:
  // never take a pin's preferred hex, and leave at least one legal hex per pin
  // that has no preferred hex (pool draws simply pick around the mine).
  const designerPins = [
    ...(tile.pendingFieldOverrides ?? []),
    ...(tile.pendingFieldOverride && !tile.pendingFieldOverrides?.length ? [tile.pendingFieldOverride] : [])
  ].filter((pin) => !pin.fromPool);
  const pinnedHexes = new Set(designerPins.map((pin) => pin.preferredSpaceId).filter(Boolean));
  const candidates = [...fieldOverridePlacementCandidates(state, tile, MITHRIL_MINE_KIND)]
    .filter((spaceId) => !pinnedHexes.has(spaceId))
    .sort();
  const unplacedPins = designerPins.filter((pin) => !pin.preferredSpaceId).length;
  if (candidates.length === 0 || candidates.length <= unplacedPins) {
    return;
  }
  const spaceId = candidates[eraRandom(state, `mithril-mine-${tile.id}`).nextInt(0, candidates.length - 1)]!;
  if (carveFieldOverride(adventure, spaceId, MITHRIL_MINE_KIND)) {
    note(state, "A Mithril Mine is uncovered on the new tile (guarded Ⅴ) — its holder gains 1 Mithril every Resource Round.");
  }
}

/** A hero flags a Mithril Mine (called from beginFieldVisit after any guard fell). */
export function isMithrilMineLocation(locationId: string): boolean {
  return locationId === MITHRIL_MINE_LOCATION_ID;
}

/** Every live seat gains 1 Mithril at the start of every 3rd round. */
function applyMithrilRoundIncome(state: GameState): void {
  if (state.round <= 1 || state.round % MITHRIL_INCOME_EVERY_ROUNDS !== 0) {
    return;
  }
  for (const playerId of liveSeats(state)) {
    gainMithril(state, playerId, 1, `round ${state.round} Mithril income`);
  }
}

/** Whether `playerId` may still spend Mithril on a reroll this round (any die). */
export function mithrilRerollAvailable(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return (
    Boolean(state.adventure?.mithril) &&
    mithrilOf(state, playerId) >= MITHRIL_REROLL_COST &&
    player?.mithrilRerollRound !== state.round
  );
}

/** Spend the round's Mithril reroll (map-die arm and combat reroll window). */
export function consumeMithrilForReroll(state: GameState, playerId: PlayerId): void {
  if (!mithrilRerollAvailable(state, playerId)) {
    return;
  }
  spendMithril(state, playerId, MITHRIL_REROLL_COST);
  state.players[playerId]!.mithrilRerollRound = state.round;
  note(state, `${playerName(state, playerId)} spends ${MITHRIL_REROLL_COST} Mithril to reroll (once per round).`, playerId);
}

/**
 * The combat reroll-window source (Attack dice and unit-ability dice): appended
 * LAST by the reducer, so every free source is spent before Mithril.
 */
export function mithrilRerollSources(state: GameState, playerId: PlayerId): AttackRerollSource[] {
  return mithrilRerollAvailable(state, playerId)
    ? [{ name: `Mithril (${MITHRIL_REROLL_COST}, once per round)`, mithril: true, remaining: 1, used: 0 }]
    : [];
}

/** Mines `playerId` may forge right now (held, no boost already pending). */
export function forgeableMines(state: GameState, playerId: PlayerId): MapFieldState[] {
  if (!state.adventure?.mithril || mithrilOf(state, playerId) < MITHRIL_FORGE_MINE_COST) {
    return [];
  }
  return Object.values(state.adventure.fields)
    .filter(
      (field) =>
        field.location === "mine" &&
        field.flagOwnerId === playerId &&
        !field.mithrilBoostBy &&
        Boolean(field.resource) &&
        (field.amount ?? 0) > 0
    )
    .sort((a, b) => a.spaceId.localeCompare(b.spaceId));
}

/** Forge a mine: its NEXT Resource-Round payout is doubled for the forger. */
export function forgeMine(state: GameState, playerId: PlayerId, fieldId: MapSpaceId): void {
  const field = forgeableMines(state, playerId).find((candidate) => candidate.spaceId === fieldId);
  if (!field?.resource) {
    throw new Error("You cannot forge that mine.");
  }
  spendMithril(state, playerId, MITHRIL_FORGE_MINE_COST);
  field.mithrilBoostBy = playerId;
  note(
    state,
    `${playerName(state, playerId)} forges a mine with Mithril: its next Resource-round payout is doubled (+${field.amount} ${RESOURCE_WORD[field.resource] ?? field.resource}).`,
    playerId
  );
}

/**
 * Resource Round (after the ordinary income): every forged mine pays its amount
 * AGAIN to the forger if that seat still holds it; the mark clears either way.
 */
export function payMithrilMineBoosts(state: GameState): void {
  const adventure = state.adventure;
  if (!adventure?.mithril) {
    return;
  }
  // Mithril Mines: every flag holder (an alliance's individual flags included)
  // gains 1 Mithril per mine.
  const live = new Set(liveSeats(state));
  for (const field of Object.values(adventure.fields).sort((a, b) => a.spaceId.localeCompare(b.spaceId))) {
    if (field.location !== MITHRIL_MINE_LOCATION_ID) {
      continue;
    }
    const holders = new Set([field.flagOwnerId, ...(field.extraFlagOwnerIds ?? [])].filter(Boolean) as PlayerId[]);
    for (const holder of holders) {
      if (live.has(holder)) {
        gainMithril(state, holder, MITHRIL_MINE_INCOME, "Mithril Mine");
      }
    }
  }
  for (const field of Object.values(adventure.fields).sort((a, b) => a.spaceId.localeCompare(b.spaceId))) {
    const forger = field.mithrilBoostBy;
    if (!forger) {
      continue;
    }
    delete field.mithrilBoostBy;
    if (field.flagOwnerId !== forger || !field.resource || (field.amount ?? 0) <= 0) {
      note(state, `A Mithril-forged mine changed hands before paying out — the forging is lost.`, forger);
      continue;
    }
    const payout = { gold: 0, buildingMaterials: 0, valuables: 0 };
    payout[field.resource] = field.amount ?? 0;
    gainResources(state, forger, payout, "Mithril-forged mine (double payout)");
  }
}

/** Every war-machine card id `playerId` owns (any zone). */
function ownedWarMachineIds(player: PlayerState): CardId[] {
  const zones = [player.hand, player.deck, player.discard, player.permanents ?? [], player.permanent ? [player.permanent] : []];
  const ids = new Set<CardId>();
  for (const zone of zones) {
    for (const cardId of zone) {
      if (MITHRIL_WAR_MACHINES[cardId]) {
        ids.add(cardId);
      }
    }
  }
  return [...ids].sort();
}

/** War machines `playerId` may forge in Mithril right now. */
export function upgradeableWarMachines(state: GameState, playerId: PlayerId): CardId[] {
  const player = state.players[playerId];
  if (!state.adventure?.mithril || !player || mithrilOf(state, playerId) < MITHRIL_WAR_MACHINE_COST) {
    return [];
  }
  return ownedWarMachineIds(player).filter((cardId) => !player.mithrilWarMachines?.includes(cardId));
}

export function upgradeWarMachine(state: GameState, playerId: PlayerId, cardId: CardId): void {
  const player = state.players[playerId];
  if (!player || !upgradeableWarMachines(state, playerId).includes(cardId)) {
    throw new Error("You cannot forge that war machine.");
  }
  spendMithril(state, playerId, MITHRIL_WAR_MACHINE_COST);
  (player.mithrilWarMachines ??= []).push(cardId);
  note(
    state,
    `${playerName(state, playerId)} forges a ${MITHRIL_WAR_MACHINES[cardId]!.name}: ${MITHRIL_WAR_MACHINES[cardId]!.text}`,
    playerId
  );
}

/** Whether `playerId` has forged this war-machine card in Mithril. */
export function mithrilWarMachineForged(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  return Boolean(state.adventure?.mithril && state.players[playerId]?.mithrilWarMachines?.includes(cardId));
}

const EVEN_ROUND_MACHINES = new Set<CardId>(["war_machine.cannon", "war_machine.lightning_generator"]);

/**
 * Extra round-start damage of a forged machine: the Ballista always +1; the
 * Cannon and the Lightning Generator +1 in EVEN combat rounds. 0 otherwise.
 */
export function mithrilRoundStartBonus(state: GameState, playerId: PlayerId, cardId: CardId): number {
  if (!mithrilWarMachineForged(state, playerId, cardId)) {
    return 0;
  }
  if (cardId === "war_machine.ballista") {
    return 1;
  }
  return EVEN_ROUND_MACHINES.has(cardId) && (state.combat?.round ?? 1) % 2 === 0 ? 1 : 0;
}

/** A forged First Aid Tent heals +1 in EVEN combat rounds (2 instead of 1). */
export function mithrilTentHealBonus(state: GameState, playerId: PlayerId): number {
  return mithrilWarMachineForged(state, playerId, "war_machine.first_aid_tent") &&
    (state.combat?.round ?? 1) % 2 === 0
    ? 1
    : 0;
}

/** A forged Catapult may hit ANY two targets (not only adjacent ones). */
export function mithrilCatapultAnyTargets(state: GameState, playerId: PlayerId): boolean {
  return mithrilWarMachineForged(state, playerId, "war_machine.catapult");
}

// ---------------------------------------------------------------------------
// Karmic Battles
// ---------------------------------------------------------------------------

/** Whether a plain field-guard fight at this difficulty offers the karmic pick. */
export function karmicBattleOffered(state: GameState, difficulty: number): boolean {
  return Boolean(state.adventure?.karmicBattles) && difficulty >= 1;
}

// ---------------------------------------------------------------------------
// Skill Combos
// ---------------------------------------------------------------------------

/** Owned = in hand, deck or discard, or in play (a Basic X Magic permanent). */
function ownsCard(player: PlayerState, cardId: CardId): boolean {
  return (
    player.hand.includes(cardId) ||
    player.deck.includes(cardId) ||
    player.discard.includes(cardId) ||
    player.permanent === cardId ||
    Boolean(player.permanents?.includes(cardId))
  );
}

/** Combos `playerId` may forge now (none once one was forged). */
export function availableSkillCombos(state: GameState, playerId: PlayerId): SkillComboDefinition[] {
  const player = state.players[playerId];
  if (!state.adventure?.skillCombos || !player || player.skillCombo) {
    return [];
  }
  return SKILL_COMBOS.filter((combo) => combo.requires.every((cardId) => ownsCard(player, cardId)));
}

export function forgeSkillCombo(state: GameState, playerId: PlayerId, comboId: string): void {
  const player = state.players[playerId];
  const combo = availableSkillCombos(state, playerId).find((candidate) => candidate.id === comboId);
  if (!player || !combo) {
    throw new Error("You cannot forge that Skill Combo.");
  }
  player.skillCombo = combo.id;
  player.hand.push(combo.cardId);
  note(
    state,
    `${playerName(state, playerId)} forges the ${combo.name} Skill Combo (${combo.requires
      .map((cardId) => cardLibrary[cardId]?.name ?? cardId)
      .join(" + ")}) — the card joins their hand. One combo per game.`,
    playerId
  );
}
