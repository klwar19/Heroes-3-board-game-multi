import type { CharId, JobId, MemberState, PassiveId, RestiaState, SkillId, StatKey, Stats } from "./types";
import { JOBS, JOB_EXP, JOB_MAX } from "../data/jobs";
import { CHARACTERS } from "../data/characters";
import { Ctx, fail } from "./core";

/**
 * Jobs: permanent stat gains, skills and passives earned per job level. Anything
 * learned stays after changing jobs; job EXP only goes to the current job.
 */

export function jobStats(member: MemberState): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const [id, progress] of Object.entries(member.jobs ?? {})) {
    const def = JOBS[id];
    if (!def) continue;
    for (const level of def.levels.slice(0, progress.level)) {
      for (const [key, value] of Object.entries(level.stats)) out[key as StatKey] = (out[key as StatKey] ?? 0) + (value ?? 0);
    }
  }
  return out;
}

export function jobSkills(member: MemberState): SkillId[] {
  const out: SkillId[] = [];
  for (const [id, progress] of Object.entries(member.jobs ?? {})) {
    for (const level of JOBS[id]?.levels.slice(0, progress.level) ?? []) if (level.skill && !out.includes(level.skill)) out.push(level.skill);
  }
  return out;
}

export function jobPassives(member: MemberState): PassiveId[] {
  const out: PassiveId[] = [];
  for (const [id, progress] of Object.entries(member.jobs ?? {})) {
    for (const level of JOBS[id]?.levels.slice(0, progress.level) ?? []) if (level.passive && !out.includes(level.passive)) out.push(level.passive);
  }
  return out;
}

/** Why a member can't take a job, or null when they can. */
export function jobLock(member: MemberState, job: JobId): string | null {
  const def = JOBS[job];
  if (!def) return "Unknown job.";
  if (def.only && !def.only.includes(member.id)) return `Only ${def.only.map((id) => CHARACTERS[id].name).join(", ")} can be a ${def.name}.`;
  if (def.requires) {
    const have = member.jobs?.[def.requires.job]?.level ?? 0;
    if (have < def.requires.level) return `Needs ${JOBS[def.requires.job]?.name ?? def.requires.job} Lv ${def.requires.level}.`;
  }
  return null;
}

export function setJob(state: RestiaState, id: CharId, job: JobId, ctx: Ctx): void {
  const member = state.members[id];
  if (!member) fail("That character hasn't joined.");
  if (state.battle) fail("Not during a battle.");
  if (state.dungeon) fail("Change jobs in town, not in the ruins.");
  const lock = jobLock(member, job);
  if (lock) fail(lock);
  if (member.job === job) fail(`${CHARACTERS[id].name} is already a ${JOBS[job]!.name}.`);
  member.job = job;
  member.jobs[job] ??= { level: 1, exp: 0 };
  ctx.toast(`${CHARACTERS[id].name} is now a ${JOBS[job]!.name} (Lv ${member.jobs[job]!.level}).`, "good");
}

/** Adds job EXP to the member's current job; announces level ups and what they teach. */
export function gainJobExp(state: RestiaState, id: CharId, amount: number, ctx: Ctx): { job: JobId; level: number } | null {
  const member = state.members[id];
  if (!member || amount <= 0) return null;
  const progress = (member.jobs[member.job] ??= { level: 1, exp: 0 });
  if (progress.level >= JOB_MAX) return null;
  progress.exp += amount;
  let leveled = false;
  while (progress.level < JOB_MAX && progress.exp >= JOB_EXP[progress.level - 1]!) {
    progress.exp -= JOB_EXP[progress.level - 1]!;
    progress.level += 1;
    leveled = true;
    const def = JOBS[member.job]!;
    const taught = def.levels[progress.level - 1]!;
    const what = taught.skill ? ` Learned a skill!` : taught.passive ? ` Learned a passive!` : "";
    ctx.toast(`${CHARACTERS[id].name}: ${def.name} Lv ${progress.level}.${what}`, "good");
  }
  if (progress.level >= JOB_MAX) progress.exp = 0;
  return leveled ? { job: member.job, level: progress.level } : null;
}

export function defaultJobs(id: CharId): Pick<MemberState, "job" | "jobs"> {
  const job = CHARACTERS[id].job;
  return { job, jobs: { [job]: { level: 1, exp: 0 } } };
}
