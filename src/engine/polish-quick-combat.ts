import { coreUnitDefinitions } from "@/data/factions/units";
import { armyUnitStacksActive, houseRuleEnabled } from "./house-rules";
import type { ArmyUnitState, GameDifficulty, GameState, HeroState, PlayerId } from "./state";

/**
 * Polish house rule `polish-quick-combat` — strength-based Quick Combat
 * (tournament community sheet). With the rule ON, Quick Combat availability at
 * an ordinary guarded FIELD no longer depends on hero level alone:
 *
 * - The army's strength — the sum of its 5 STRONGEST unit cards — must reach
 *   the field strength `2 × Field Difficulty + X` (+1 when playing with Unit
 *   Stacks), where X is the game difficulty (easy 1 / normal 2 / hard 3 /
 *   impossible 4). Equal or higher qualifies. VI–VII fields are now eligible
 *   (the classic rule never Quick-Combats those).
 * - A unit card's strength is its tier value (bronze 1 / silver 2 / gold 3 /
 *   azure 4); a faction PACK side counts double; each purchased Unit-Stack
 *   layer adds 0.5 (the sheet's "stack of Minotaurs = 2×2 + 0.5 = 4.5").
 *   A recruited NEUTRAL-side card is a single group, so it counts 1× its tier
 *   (the sheet doubles "packs" only; azure cards exist as neutrals alone,
 *   matching the printed "azure 4").
 * - A covered fight that would give NO Experience resolves as a MANDATORY
 *   Quick Combat; a covered fight that could give Experience offers the player
 *   the fight-or-quick choice. An uncovered fight is always fought — even by a
 *   hero whose level beats the field difficulty.
 *
 * Deliberate readings (documented, engine-enforced in the wiring/tests):
 * - The threshold reads the PLAIN scenario difficulty (`adventure.difficulty`),
 *   never the Astrologers-eased `neutralArmyDifficulty` — the sheet's X is a
 *   per-game constant.
 * - "Playing with Stacks" is the `armyUnitStacksActive` seam (the Polish
 *   `polish-unit-stacks` rule OR the anime `unitStacks` module), the exact
 *   machinery whose layers the strength read also counts.
 * - The strength read uses the card's printed tier — Sandro's-Cloak covers and
 *   veteran ranks do not change a card's tier and are ignored.
 * - Banks, bank-style outpost/teleport guards and designer EXACT armies keep
 *   their own no-Quick-Combat rules; the Polish rule only replaces the
 *   ordinary guarded-field branch.
 */

/** Per-tier unit strength from the sheet graphic (bronze 1 … azure 4). */
export const POLISH_QUICK_COMBAT_TIER_STRENGTH: Record<"bronze" | "silver" | "gold" | "azure", number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  azure: 4
};

/** Each purchased Unit-Stack layer adds this much to the card's strength. */
export const POLISH_QUICK_COMBAT_STACK_LAYER_STRENGTH = 0.5;

/** The army strength sums only the N strongest cards (the sheet's "5 stronger units"). */
export const POLISH_QUICK_COMBAT_UNIT_COUNT = 5;

/**
 * The sheet's X — the game-difficulty term of the field strength. Same numbers
 * as the Creature-Bank STACK_TOKENS_BY_DIFFICULTY, but semantically its own
 * knob (a formula constant, not a token-roll count).
 */
export const POLISH_QUICK_COMBAT_DIFFICULTY_X: Record<GameDifficulty, number> = {
  easy: 1,
  normal: 2,
  hard: 3,
  impossible: 4
};

/** Whether the Polish strength-based Quick Combat rule is ON for this game. */
export function polishQuickCombatEnabled(state: Pick<GameState, "ruleset" | "adventure">): boolean {
  return houseRuleEnabled(state, "polish-quick-combat");
}

/**
 * Strength of one army card: tier value, doubled for a faction Pack side, plus
 * 0.5 per Unit-Stack layer. A neutral-side card counts 1× its tier (a single
 * group — see the module doc). Unknown definitions count 0.
 */
export function polishQuickCombatUnitStrength(unit: ArmyUnitState): number {
  const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
  if (!tier) {
    return 0;
  }
  let strength = POLISH_QUICK_COMBAT_TIER_STRENGTH[tier];
  if (unit.side === "pack") {
    strength *= 2;
  }
  strength += Math.max(0, unit.stacks ?? 0) * POLISH_QUICK_COMBAT_STACK_LAYER_STRENGTH;
  return strength;
}

/** The player's army strength: the sum of the 5 strongest cards' strengths. */
export function polishQuickCombatArmyStrength(state: GameState, playerId: PlayerId): number {
  const army = state.players[playerId]?.army ?? [];
  return army
    .map((unit) => polishQuickCombatUnitStrength(unit))
    .sort((a, b) => b - a)
    .slice(0, POLISH_QUICK_COMBAT_UNIT_COUNT)
    .reduce((sum, value) => sum + value, 0);
}

/**
 * The field strength the army must equal or exceed:
 * `2 × fieldDifficulty + X` — plus 1 when the Unit-Stacks machinery is on
 * (the sheet's "if you played with Stacks … + 1").
 */
export function polishQuickCombatFieldStrength(state: GameState, fieldDifficulty: number): number {
  const scenario = state.adventure?.difficulty ?? "normal";
  const x = POLISH_QUICK_COMBAT_DIFFICULTY_X[scenario] ?? POLISH_QUICK_COMBAT_DIFFICULTY_X.normal;
  return fieldDifficulty * 2 + x + (armyUnitStacksActive(state) ? 1 : 0);
}

/**
 * Whether winning the fought battle COULD grant the hero Experience — the
 * sheet's mandatory/optional split ("must resolve quick combat if he would gain
 * NO EXPERIENCE"). Mirrors the finalize award exactly: a Secondary Hero never
 * gains Experience; difficulty Ⅶ fills to level 7 (nothing left at level 7);
 * otherwise a win pays only when the field difficulty is at least the hero's
 * own level (+2 above, +1 equal). Azure guards appear only at difficulty 7 in
 * every NEUTRAL_ARMY_TABLE row, so the printed difficulty is a complete
 * pre-fight read.
 */
export function polishQuickCombatXpPossible(hero: HeroState, difficulty: number): boolean {
  if (hero.kind !== "main") {
    return false;
  }
  if (difficulty >= 7) {
    return hero.level < 7;
  }
  return difficulty >= hero.level;
}

/**
 * How a fought neutral guard field of the given difficulty resolves under the
 * strength shortcut — the SINGLE classifier shared by the engine wiring
 * (`startNeutralEncounter`) and the map's pre-fight display, so the two can
 * never disagree about what a click will do:
 * - `"mandatory"`: the army covers the field AND the fight would pay no
 *   Experience → the guards fall unfought (auto Quick Combat).
 * - `"choice"`: the army covers the field but the fight could pay Experience →
 *   the player is asked to Quick Combat or fight.
 * - `"fight"`: the shortcut does not apply — the rule is off, the hero is at the
 *   EXACT field level and can actually gain Experience, or the army is too weak
 *   — so the normal guard combat is fought.
 *
 * `level` is the hero's NEUTRAL-battle level (a Secondary Hero fights at its
 * Main Hero's level), i.e. the exact `level` `startNeutralEncounter` computes.
 */
export type PolishQuickCombatOutcome = "mandatory" | "choice" | "fight";

export function polishQuickCombatOutcome(
  state: GameState,
  hero: HeroState,
  difficulty: number,
  level: number
): PolishQuickCombatOutcome {
  if (!polishQuickCombatEnabled(state)) {
    return "fight";
  }
  const xpPossible = polishQuickCombatXpPossible(hero, difficulty);
  // Preserve the ordinary exact-level fight only when THIS hero can actually
  // gain its Experience. A Secondary Hero uses the Main Hero's effective level
  // for neutral difficulty, but never gains XP; treating an exact level as an
  // unconditional carve-out incorrectly disabled its mandatory Quick Combat.
  if (level === difficulty && xpPossible) {
    return "fight";
  }
  if (polishQuickCombatArmyStrength(state, hero.controllerId) < polishQuickCombatFieldStrength(state, difficulty)) {
    return "fight";
  }
  return xpPossible ? "choice" : "mandatory";
}
