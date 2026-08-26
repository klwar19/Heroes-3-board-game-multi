/**
 * Anime Hero Grades (`anime.heroGrades`, plan §3.11).
 *
 * A per-hero power ranking — Merit accrues, crossing thresholds grades the hero
 * up (0→N) and awards a grade point spent on a small passive/skill TREE. It is
 * SHARED across both packages and EVERY hero (core factions included), and is
 * INDEPENDENT of Cultivation (§5.6) — both tracks coexist on the same hero.
 *
 * DATA-DRIVEN (extensibility, §3.11): the tier count, grade cap, tier gating and
 * grade-name registers all derive from `@/data/anime/hero-grades` — engine logic
 * hard-codes no literal tier number. The pure helpers `gradeForMerit` and
 * `pickableNodesFrom` take the thresholds / catalog as parameters so a
 * hypothetical extra tier is honoured (tested with a 4-tier fixture).
 *
 * This is the LEAF read-layer: it imports only `./state` (types), `./anime` (the
 * module gate), `./events` (feed events) and the catalog data, so the heavy
 * modules that consume its grants can import it with no cycle. The main-hero
 * lookup is inlined here for the same reason (mirroring anime-cultivation.ts).
 *
 * Default OFF ⇒ every helper returns 0/false/[] and `gainGradeProgress` stamps
 * nothing, so a module-off table and every legacy snapshot are byte-identical.
 */

import { appendEvent } from "./events";
import { animeModuleEnabled } from "./anime";
import {
  BESPOKE_FACTION_GRADE_REGISTERS,
  HERO_GRADE_MAX,
  HERO_GRADE_CHOICES_PER_TIER,
  HERO_GRADE_MERIT_THRESHOLDS,
  HERO_GRADE_NODES,
  HERO_GRADE_NODE_IDS,
  HERO_GRADE_PICKS_PER_TIER,
  HERO_GRADE_REGISTER_NODES,
  HERO_GRADE_REGISTERS,
  factionGradeRegister,
  type GradeLabel,
  type GradeRegisterKey,
  type HeroGradeNode
} from "@/data/anime/hero-grades";
import type { GameState, HeroState, PlayerId } from "./state";

/** Movement points the HERO_TRAIN action costs. */
export const HERO_TRAIN_MOVEMENT_COST = 2;
/** Merit granted by one HERO_TRAIN. */
export const HERO_TRAIN_MERIT = 1;

/** Whether the Hero Grades module is on (implies anime master enabled). */
export function heroGradesEnabled(state: Pick<GameState, "anime">): boolean {
  return animeModuleEnabled(state, "heroGrades");
}

/**
 * Wuxia TOWN factions (Azure Breeze Sect, Heavenly Demon Palace) run the
 * Cultivation Realm track (§5.6) as their ONLY hero-progression system. The
 * shared Hero-Grade tree is fully OFF for them — no display, no picker, no Merit
 * accrual and no grade bonuses — so the two never duplicate. USER RULE: "when
 * select wuxia town, no hero grade, only cultivation, no choice, no duplicate".
 */
export function heroGradeFactionExcluded(factionId: string | undefined): boolean {
  return factionId === "azure_breeze" || factionId === "heavenly_demon";
}

/**
 * The per-player Hero-Grade gate: the module is on AND this player's faction is
 * not a wuxia town. Every per-player read and the Merit arm gate on THIS, not the
 * bare module flag, so a wuxia-town hero never accrues Merit or a grade bonus.
 */
export function heroGradesEnabledForPlayer(state: GameState, playerId: PlayerId): boolean {
  return heroGradesEnabled(state) && !heroGradeFactionExcluded(state.players[playerId]?.factionId);
}

/** The player's MAIN hero (inlined to keep this a leaf — see the file header). */
function mainHeroOf(state: GameState, playerId: PlayerId): HeroState | null {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      return hero;
    }
  }
  return null;
}

// ===========================================================================
// Pure gating helpers (data-driven; parameterised so a 4-tier fixture works)
// ===========================================================================

/**
 * The grade a hero of `merit` has reached, given the threshold array. Pure and
 * catalog-agnostic — the grade cap is `thresholds.length` (no literal number).
 */
export function gradeForMerit(merit: number, thresholds: readonly number[] = HERO_GRADE_MERIT_THRESHOLDS): number {
  let grade = 0;
  while (grade < thresholds.length && merit >= thresholds[grade]) {
    grade += 1;
  }
  return grade;
}

/**
 * The nodes pickable RIGHT NOW from an arbitrary catalog: tier ≤ `grade`, the
 * node unpicked, and that tier not yet at its per-tier pick cap. Pure so the
 * extensibility test can drive it with a hypothetical extra tier.
 */
export function pickableNodesFrom(
  nodes: readonly HeroGradeNode[],
  grade: number,
  pickedNodeIds: readonly string[],
  picksPerTier: number = HERO_GRADE_PICKS_PER_TIER
): HeroGradeNode[] {
  const picked = new Set(pickedNodeIds);
  const perTierCount = new Map<number, number>();
  for (const id of pickedNodeIds) {
    const tier = nodes.find((node) => node.id === id)?.tier;
    if (tier !== undefined) {
      perTierCount.set(tier, (perTierCount.get(tier) ?? 0) + 1);
    }
  }
  return nodes.filter(
    (node) => node.tier <= grade && !picked.has(node.id) && (perTierCount.get(node.tier) ?? 0) < picksPerTier
  );
}

// ===========================================================================
// Grade-name register resolution (one mechanic, faction-owned NAMES)
// ===========================================================================

/**
 * Which grade-name REGISTER labels this player's grades. Labels always follow
 * the owning faction; enabling a town package never relabels another faction's
 * hero. Mechanics/state never read this — labels are presentation only.
 */
export function heroGradeRegisterKey(state: GameState, playerId: PlayerId): GradeRegisterKey {
  const factionId = state.players[playerId]?.factionId;
  // BESPOKE faction override FIRST so shared visual families can still carry
  // naval/demonic names. Names-only.
  const bespoke = factionId ? BESPOKE_FACTION_GRADE_REGISTERS[factionId] : undefined;
  if (bespoke) {
    return bespoke;
  }
  return factionGradeRegister(factionId);
}

/** The bilingual label for a grade in the player's resolved register. */
export function heroGradeLabel(state: GameState, playerId: PlayerId, grade: number): GradeLabel {
  const register = HERO_GRADE_REGISTERS[heroGradeRegisterKey(state, playerId)] ?? HERO_GRADE_REGISTERS.core;
  return register[grade] ?? register[0] ?? HERO_GRADE_REGISTERS.core[0];
}

// ===========================================================================
// Per-player reads (all gated by the module being on)
// ===========================================================================

/** The grade the player's grants read from — their MAIN hero's grade (0 when off / unstamped). */
export function heroGradeOf(state: GameState, playerId: PlayerId): number {
  if (!heroGradesEnabledForPlayer(state, playerId)) {
    return 0;
  }
  return mainHeroOf(state, playerId)?.grade ?? 0;
}

/** Accumulated Merit on the player's main hero (0 when off / unstamped). */
export function heroGradeProgressOf(state: GameState, playerId: PlayerId): number {
  if (!heroGradesEnabledForPlayer(state, playerId)) {
    return 0;
  }
  return mainHeroOf(state, playerId)?.gradeProgress ?? 0;
}

/** Unspent grade points on the player's main hero (0 when off / unstamped). */
export function heroGradePointsOf(state: GameState, playerId: PlayerId): number {
  if (!heroGradesEnabledForPlayer(state, playerId)) {
    return 0;
  }
  return mainHeroOf(state, playerId)?.gradePoints ?? 0;
}

/** The tree node ids the player's main hero has picked ([] when off / unstamped). */
export function heroGradeNodesOf(state: GameState, playerId: PlayerId): string[] {
  if (!heroGradesEnabledForPlayer(state, playerId)) {
    return [];
  }
  return mainHeroOf(state, playerId)?.gradeNodes ?? [];
}

/** Whether the player's main hero has picked a specific tree node. */
export function heroHasGradeNode(state: GameState, playerId: PlayerId, nodeId: string): boolean {
  return heroGradeNodesOf(state, playerId).includes(nodeId);
}

// --- Passive grant helpers (each gated by the node being picked) ------------

/** Deep Pockets (tier 2): +1 hand limit. Folded at effectiveHandLimit. */
export function heroGradeHandLimitBonus(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.deepPockets) ? 1 : 0;
}

/** Arcane Insight (tier 3): +1 spell Power. Folded at the standing spell-power chokepoint. */
export function heroGradeSpellPowerBonus(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.arcaneInsight) ? 1 : 0;
}

/** Bounty Hunter's Eye (tier 1): +1 gold after each won combat. */
export function heroGradeWinGold(state: GameState, playerId: PlayerId): number {
  let gold = 0;
  if (heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.bountyHuntersEye)) {
    gold += 1;
  }
  if (heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.standingOvation)) {
    gold += 1;
  }
  return gold;
}

/** Provisioner (tier 1): +1 building materials at each Resources round. */
export function heroGradeResourceRoundMaterials(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.provisioner) ? 1 : 0;
}

/** Tactician (tier 3): +2 gold at each Resources round. */
export function heroGradeResourceRoundGold(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.tactician) ? 2 : 0;
}

/** Crystal Dividend (tier 2): +1 valuable/crystal each Resources round. */
export function heroGradeResourceRoundValuables(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.crystalDividend) ? 1 : 0;
}

/** Forced March (tier 2): +1 main-hero movement each Resources round. */
export function heroGradeResourceRoundMovement(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.forcedMarch) ? 1 : 0;
}

/** Ore Divination (tier 1): +1 building material each Astrologers round. */
export function heroGradeAstrologersRoundMaterials(state: GameState, playerId: PlayerId): number {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.oreDivination) ? 1 : 0;
}

/** Whether the Astrologers-round 3-gold random Minor Artifact offer is owned. */
export function heroGradeMinorArtifactOffer(state: GameState, playerId: PlayerId): boolean {
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.wanderingCurioDealer);
}

/** Whether start-turn hand refresh may draw one temporary over-limit card. */
export function heroGradeOverdrawAvailable(state: GameState, playerId: PlayerId): boolean {
  const hero = mainHeroOf(state, playerId);
  return Boolean(
    heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.overflowingInsight) &&
      hero?.heroGradeOverdrawRound !== state.round
  );
}

/** Mark Overflowing Insight's draw as used this turn/round. */
export function markHeroGradeOverdrawUsed(state: GameState, playerId: PlayerId): void {
  const hero = mainHeroOf(state, playerId);
  if (hero) hero.heroGradeOverdrawRound = state.round;
}

/** First Blood: +2 on the first own declared attack of the combat. */
export function heroGradeFirstBloodBonus(state: GameState, playerId: PlayerId, isRetaliation: boolean): number {
  if (isRetaliation || !playerMainHeroInCombat(state, playerId)) return 0;
  return heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.firstBlood) &&
    heroSkillAvailableThisCombat(state, playerId, HERO_GRADE_NODE_IDS.firstBlood)
    ? 2
    : 0;
}

/** Consume First Blood only when its qualifying declared attack resolves. */
export function markHeroGradeFirstBloodUsed(state: GameState, playerId: PlayerId, isRetaliation: boolean): void {
  if (heroGradeFirstBloodBonus(state, playerId, isRetaliation) > 0) {
    markHeroSkillUsedThisCombat(state, playerId, HERO_GRADE_NODE_IDS.firstBlood);
  }
}

// ===========================================================================
// Merit → grade advancement (the ONE shared arm)
// ===========================================================================

/**
 * Grant `amount` Merit to the player's MAIN hero and auto-grade-up across every
 * threshold now crossed (one grade point + one HERO_GRADE_ADVANCED feed event
 * per grade). The SINGLE shared arm consumed by all Merit sources — level-ups,
 * hex riders, HERO_TRAIN, the Training Manual item and the generic
 * GAIN_GRADE_PROGRESS card payload. No-op when the module is off or `amount`
 * ≤ 0, so a module-off table stamps nothing. Data-driven: the grade cap is
 * HERO_GRADE_MAX (= threshold array length), never a literal.
 */
export function gainGradeProgress(state: GameState, playerId: PlayerId, amount: number, source: string): void {
  if (!heroGradesEnabledForPlayer(state, playerId) || amount <= 0) {
    return;
  }
  const hero = mainHeroOf(state, playerId);
  if (!hero) {
    return;
  }
  hero.gradeProgress = (hero.gradeProgress ?? 0) + amount;

  let grade = hero.grade ?? 0;
  while (grade < HERO_GRADE_MAX && hero.gradeProgress >= HERO_GRADE_MERIT_THRESHOLDS[grade]) {
    grade += 1;
    hero.grade = grade;
    hero.gradePoints = (hero.gradePoints ?? 0) + 1;
    appendEvent(state, {
      type: "HERO_GRADE_ADVANCED",
      playerId,
      heroId: hero.id,
      grade
    });
  }
  // `source` is a documentation/attribution hint for callers; the feed event
  // above carries the grade, not the source (Merit is fungible).
  void source;
}

// ===========================================================================
// Tree picking
// ===========================================================================

/** Shared nodes plus additions owned by one grade-name register. */
export function heroGradeNodesForRegister(register: GradeRegisterKey): HeroGradeNode[] {
  const shared = Object.values(HERO_GRADE_NODES);
  const sharedIds = new Set(shared.map((node) => node.id));
  const additions = (HERO_GRADE_REGISTER_NODES[register] ?? []).filter((node) => !sharedIds.has(node.id));
  return [...shared, ...additions];
}

/** Stable 32-bit hash used to deal synchronized, seed-owned node choices. */
function gradeChoiceHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Exactly four candidates per tier for this hero. The deal varies by game seed,
 * faction/town and hero id, but is deterministic on every client/server.
 * Already-owned legacy nodes stay in the four so snapshots never lose a pick.
 */
export function heroGradeNodesForPlayer(state: GameState, playerId: PlayerId): HeroGradeNode[] {
  const hero = mainHeroOf(state, playerId);
  const faction = state.players[playerId]?.factionId ?? "core";
  const register = heroGradeRegisterKey(state, playerId);
  const catalog = heroGradeNodesForRegister(register);
  const registerOwnedIds = new Set((HERO_GRADE_REGISTER_NODES[register] ?? []).map((node) => node.id));
  const owned = new Set(heroGradeNodesOf(state, playerId));
  const tiers = [...new Set(catalog.map((node) => node.tier))].sort((a, b) => a - b);
  return tiers.flatMap((tier) => {
    const tierNodes = catalog.filter((node) => node.tier === tier);
    const ownedTier = tierNodes.filter((node) => owned.has(node.id));
    const townTier = tierNodes.filter((node) => !owned.has(node.id) && registerOwnedIds.has(node.id));
    const remaining = tierNodes
      .filter((node) => !owned.has(node.id) && !registerOwnedIds.has(node.id))
      .sort((a, b) =>
        gradeChoiceHash(`${state.seed}|${faction}|${hero?.heroDefId ?? hero?.id ?? playerId}|${tier}|${a.id}`) -
          gradeChoiceHash(`${state.seed}|${faction}|${hero?.heroDefId ?? hero?.id ?? playerId}|${tier}|${b.id}`) ||
        a.id.localeCompare(b.id)
      );
    // A register-exclusive node is part of that town's identity, so reserve a
    // slot for it; the rest of the four remains seed/hero/town-randomized.
    return [...ownedTier, ...townTier, ...remaining].slice(0, HERO_GRADE_CHOICES_PER_TIER);
  });
}

/** Look up any known node definition (undefined for an unknown id). */
export function heroGradeNode(nodeId: string): HeroGradeNode | undefined {
  const shared = HERO_GRADE_NODES[nodeId];
  if (shared) {
    return shared;
  }
  for (const additions of Object.values(HERO_GRADE_REGISTER_NODES)) {
    const node = additions?.find((candidate) => candidate.id === nodeId);
    if (node) {
      return node;
    }
  }
  return undefined;
}

/**
 * The nodes the player may pick RIGHT NOW: an unspent point exists, the node's
 * tier is ≤ the hero's grade, and that tier is not yet at its pick cap. Used by
 * legal-actions (the pick offers) and the pick handler mirrors this exactly.
 */
export function heroGradePickableNodes(state: GameState, playerId: PlayerId): HeroGradeNode[] {
  if (!heroGradesEnabledForPlayer(state, playerId) || heroGradePointsOf(state, playerId) <= 0) {
    return [];
  }
  return pickableNodesFrom(
    heroGradeNodesForPlayer(state, playerId),
    heroGradeOf(state, playerId),
    heroGradeNodesOf(state, playerId)
  );
}

// ===========================================================================
// Combat scope + skill cooldowns
// ===========================================================================

/**
 * Whether the player's MAIN hero is a fighter in the current combat (the
 * commander-scope convention, mirroring injectCombatCommanders): a neutral fight
 * by their main hero, or a PvP/sandbox side their main hero leads. Garrison
 * defenses (no defender hero) and secondary-hero fights return false, so the
 * combat SKILL nodes (War Cry, and the reaction skills) never apply there.
 */
export function playerMainHeroInCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const brings = (heroId: string | null | undefined): boolean => {
    const hero = heroId ? state.heroes[heroId] : null;
    return Boolean(hero && hero.kind === "main" && hero.controllerId === playerId);
  };
  const context = combat.context;
  if (context.kind === "neutral") {
    return brings(context.heroId);
  }
  if (context.kind === "player") {
    return brings(context.attackerHeroId) || brings(context.defenderHeroId);
  }
  if (context.kind === "sandbox") {
    // Battle Test: both seats bring main heroes.
    return combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId;
  }
  return false;
}

/** Whether a combat SKILL node is still unused this combat (once-per-combat). */
export function heroSkillAvailableThisCombat(state: GameState, playerId: PlayerId, nodeId: string): boolean {
  return !(state.players[playerId]?.combatStats.heroSkillsUsedThisCombat ?? []).includes(nodeId);
}

/** Mark a combat SKILL node used this combat. */
export function markHeroSkillUsedThisCombat(state: GameState, playerId: PlayerId, nodeId: string): void {
  const stats = state.players[playerId]?.combatStats;
  if (!stats) {
    return;
  }
  stats.heroSkillsUsedThisCombat = [...(stats.heroSkillsUsedThisCombat ?? []), nodeId];
}

/** Whether a once-per-round map SKILL node is still unused this round. */
export function heroSkillAvailableThisRound(state: GameState, playerId: PlayerId, nodeId: string): boolean {
  return (state.players[playerId]?.heroSkillUsedRound ?? {})[nodeId] !== state.round;
}

/** Mark a once-per-round map SKILL node used this round. */
export function markHeroSkillUsedThisRound(state: GameState, playerId: PlayerId, nodeId: string): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.heroSkillUsedRound = { ...(player.heroSkillUsedRound ?? {}), [nodeId]: state.round };
}

/**
 * Whether HERO_TRAIN is AVAILABLE to this player right now (module on, main hero
 * on the map with ≥ the MP cost, not already trained this turn). The caller
 * additionally gates on "own open turn, no exclusive interaction".
 */
export function heroTrainAvailable(state: GameState, playerId: PlayerId): boolean {
  if (!heroGradesEnabledForPlayer(state, playerId)) {
    return false;
  }
  const hero = mainHeroOf(state, playerId);
  if (!hero || hero.spaceId === null) {
    return false;
  }
  return hero.movementPoints >= HERO_TRAIN_MOVEMENT_COST && hero.heroTrainedRound !== state.round;
}
