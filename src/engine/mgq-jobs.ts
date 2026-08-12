import { coreUnitDefinitions } from "@/data/factions/units";
import { MGQ_JOB_MASTERY_NODE } from "@/data/anime/hero-grades";
import type { ArmyUnitState, GameState, MgqJob, PlayerId } from "./state";
import { heroHasGradeNode } from "./anime-hero-grades";

export const MGQ_JOBS: readonly MgqJob[] = [
  "unemployed", "warrior", "guard", "mage", "healer", "martial_artist", "hunter", "thief",
  "spiritualist", "noble", "hero", "gadabout", "maid"
];
export const MGQ_JOB_GOLD_COST = 2;
export const MGQ_JOB_MASTERY_NODE_ID = MGQ_JOB_MASTERY_NODE.id;

export const MGQ_JOB_LABELS: Record<MgqJob, string> = {
  warrior: "Warrior",
  guard: "Guard",
  mage: "Mage",
  healer: "Healer",
  martial_artist: "Martial Artist",
  hunter: "Hunter",
  thief: "Thief",
  spiritualist: "Spiritualist",
  unemployed: "Unemployed",
  noble: "Noble",
  hero: "Hero",
  gadabout: "Gadabout",
  maid: "Maid"
};

const JOB_BASE_ABILITIES: Record<MgqJob, readonly string[]> = {
  warrior: ["attack-roll-advantage"],
  guard: ["commander-defense-token"],
  mage: ["mgq-mage-magic-arrow"],
  healer: ["mgq-job-heal-adjacent"],
  martial_artist: ["champion-reroll-minus"],
  hunter: ["mgq-hunter-low-roll-pierce"],
  thief: ["harpy-return"],
  spiritualist: ["reduce-spell-damage-1"],
  unemployed: [],
  noble: ["mgq-noble-income"],
  hero: ["mgq-hero-rebirth"],
  gadabout: ["mgq-gadabout-xp"],
  maid: ["mgq-maid-speed-aura"]
};

const JOB_RANK_THREE_SIGNATURE: Record<MgqJob, string | undefined> = {
  warrior: "ignores-retaliation",
  guard: "unlimited-retaliation",
  mage: "titan-ignore-ongoing",
  healer: "wraith-heal-1",
  martial_artist: "champion-roll-two-dice",
  hunter: "double-attack-low-roll",
  thief: "teleport-move",
  spiritualist: "unicorn-spell-ward-aura",
  unemployed: undefined,
  noble: undefined,
  hero: undefined,
  gadabout: undefined,
  maid: undefined
};

const CLASSIC_JOBS = ["unemployed", "warrior", "guard", "mage", "healer"] as const satisfies readonly MgqJob[];

/** Four thematic choices per printed MGQ monster; Companions use the classic four. */
const MGQ_UNIT_JOB_POOLS: Record<string, readonly [MgqJob, MgqJob, MgqJob, MgqJob, MgqJob]> = {
  "mgq.pochi": ["unemployed", "warrior", "guard", "mage", "healer"],
  "mgq.shesta": ["unemployed", "thief", "mage", "hunter", "maid"],
  "mgq.gigi": ["unemployed", "guard", "martial_artist", "spiritualist", "hero"],
  "mgq.kamuro_kitsu": ["unemployed", "thief", "healer", "spiritualist", "maid"],
  "mgq.fleesia": ["unemployed", "mage", "healer", "spiritualist", "maid"],
  "mgq.sofia": ["unemployed", "healer", "mage", "spiritualist", "noble"],
  "mgq.miyabi": ["unemployed", "warrior", "martial_artist", "thief", "gadabout"],
  "mgq.eater": ["unemployed", "guard", "martial_artist", "hunter", "gadabout"],
  "mgq.hild": ["unemployed", "hunter", "thief", "mage", "hero"],
  "mgq.chrome_frederica": ["unemployed", "guard", "healer", "spiritualist", "maid"],
  "mgq.shizuku": ["unemployed", "martial_artist", "guard", "thief", "hero"],
  "mgq.regina": ["unemployed", "warrior", "martial_artist", "hunter", "hero"],
  "mgq.maiden": ["unemployed", "mage", "spiritualist", "thief", "hero"],
  "mgq.seraphy": ["unemployed", "hunter", "thief", "spiritualist", "gadabout"],
  "mgq.lisa": ["unemployed", "mage", "healer", "noble", "maid"],
  "mgq.tama": ["unemployed", "martial_artist", "hunter", "thief", "gadabout"],
  "mgq.maya": ["unemployed", "hunter", "mage", "thief", "gadabout"],
  "mgq.matis": ["unemployed", "martial_artist", "hunter", "thief", "hero"],
  "mgq.ooma": ["unemployed", "guard", "healer", "spiritualist", "gadabout"],
  "mgq.jessie": ["unemployed", "guard", "martial_artist", "hunter", "hero"],
  "mgq.aria": ["unemployed", "guard", "healer", "maid", "noble"],
  "mgq.carmilla": ["unemployed", "thief", "mage", "martial_artist", "noble"],
  "mgq.giga": ["unemployed", "guard", "martial_artist", "hero", "noble"],
  "mgq.lucretia": ["unemployed", "hunter", "thief", "martial_artist", "maid"],
  "mgq.cupi": ["unemployed", "hunter", "thief", "gadabout", "maid"],
  "mgq.sphinx": ["unemployed", "guard", "mage", "spiritualist", "noble"],
  "mgq.lucifina_chan": ["unemployed", "healer", "mage", "noble", "hero"],
  "mgq.spider_princess": ["unemployed", "guard", "hunter", "thief", "maid"],
  "mgq.emily": ["unemployed", "healer", "thief", "spiritualist", "gadabout"]
};

export function mgqJobsForUnit(unitDefId: string): readonly MgqJob[] {
  return MGQ_UNIT_JOB_POOLS[unitDefId] ?? CLASSIC_JOBS;
}

/** Exact always-on/activation package contributed by a persistent Job token. */
export function mgqJobBaseAbilityIds(job: MgqJob | undefined): string[] {
  return job ? [...JOB_BASE_ABILITIES[job]] : [];
}

/** Rank-3 signature for a Job-aware veteran card. */
export function mgqJobSignatureAbilityId(job: MgqJob): string | undefined {
  return JOB_RANK_THREE_SIGNATURE[job];
}

/** Append the current Job package without duplicating a printed/rank ability. */
export function withMgqJobAbilities(abilities: string[], job: MgqJob | undefined): string[] {
  if (!job) return abilities;
  let next = abilities;
  for (const abilityId of JOB_BASE_ABILITIES[job]) {
    if (!next.includes(abilityId)) {
      if (next === abilities) next = [...abilities];
      next.push(abilityId);
    }
  }
  return next;
}

/** Only faction cards and cards genuinely sealed as Companions may take Jobs. */
export function mgqJobEligible(
  unit: Pick<ArmyUnitState, "unitDefId" | "side" | "companion">
): boolean {
  if (unit.side === "bank") return false;
  const definition = coreUnitDefinitions[unit.unitDefId];
  return (definition?.faction === "mgq" && !definition.summonOnly) || unit.companion === true;
}

/** Legacy/new cards with an empty slot begin as Warriors; reassignment costs normally. */
export function mgqEffectiveJob(
  unit: Pick<ArmyUnitState, "unitDefId" | "side" | "companion" | "job">
): MgqJob | undefined {
  return mgqJobEligible(unit) ? (unit.job ?? "unemployed") : undefined;
}

/** Single cost gate shared by legal offers and the self-validating reducer. */
export function mgqJobAssignmentCost(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return MGQ_JOB_GOLD_COST;
  if (heroHasGradeNode(state, playerId, MGQ_JOB_MASTERY_NODE_ID)) return 0;
  if ((player.mgqFreeJobReassignments ?? 0) > 0) return 0;
  return MGQ_JOB_GOLD_COST;
}

/** Whether a Kitchen charge, rather than Job Mastery, pays the zero-cost action. */
export function consumesMgqKitchenCharge(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    player &&
      (player.mgqFreeJobReassignments ?? 0) > 0 &&
      !heroHasGradeNode(state, playerId, MGQ_JOB_MASTERY_NODE_ID)
  );
}
