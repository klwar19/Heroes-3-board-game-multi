import type { GuildRank, NpcId, RequestState, RestiaState } from "./types";
import {
  MAX_ACCEPTED_REQUESTS,
  MISSIONS,
  QUESTS,
  RANK_EXAM,
  RANK_GP,
  RANKS,
  REQUESTS_PER_GUILD_LEVEL,
  REQUEST_TEMPLATES,
  rankIndex
} from "../data/progression";
import { CROPS } from "../data/crops";
import { MONSTERS } from "../data/monsters";
import { NPCS } from "../data/npcs";
import { itemDef } from "../data/items";
import { Ctx, count, fail, pick, randInt, removeItem, seasonOf } from "./core";
import { check } from "./conditions";
import { applyEffects } from "./effects";
import { addPoints } from "./social";
import { playScene } from "./scenes";
import { isOpen } from "./world";

// ---------------------------------------------------------------------------
// Tracking (missions, hunt requests, lifetime counters)
// ---------------------------------------------------------------------------

export function track(state: RestiaState, ctx: Ctx, key: string, n: number, subject?: string): void {
  if (n <= 0) return;
  state.stats.today[key] = (state.stats.today[key] ?? 0) + n;
  state.stats.counters[key] = (state.stats.counters[key] ?? 0) + n;
  for (const mission of state.missions.list) {
    const template = MISSIONS.find((entry) => entry.id === mission.id);
    if (!template || template.key !== key || mission.done) continue;
    mission.progress = Math.min(mission.target, mission.progress + n);
    if (mission.progress >= mission.target) {
      mission.done = true;
      state.admin.ap += mission.ap;
      ctx.toast(`[SYSTEM] Mission complete: ${template.text.replace("{n}", String(mission.target))} (+${mission.ap} AP)`, "system");
    }
  }
  if (key === "defeat" && subject) {
    for (const request of state.requests) {
      if (request.accepted && request.kind === "hunt" && request.target === subject && request.progress < request.amount) {
        request.progress = Math.min(request.amount, request.progress + n);
        if (request.progress >= request.amount) ctx.toast(`Request ready to turn in: ${requestTitle(request)}`, "good");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Story quests
// ---------------------------------------------------------------------------

export function startQuest(state: RestiaState, id: string, ctx: Ctx): void {
  const def = QUESTS[id];
  if (!def) throw new Error(`Unknown Restia quest ${id}`);
  if (state.quests.active.includes(id) || state.quests.done.includes(id)) return;
  state.quests.active.push(id);
  ctx.toast(`New quest: ${def.title}`, "system");
}

export function checkQuests(state: RestiaState, ctx: Ctx): void {
  for (let pass = 0; pass < 10; pass++) {
    const ready = state.quests.active.find((id) => QUESTS[id]!.goals.every((goal) => check(state, goal.cond)));
    if (!ready) return;
    const def = QUESTS[ready]!;
    state.quests.active = state.quests.active.filter((id) => id !== ready);
    state.quests.done.push(ready);
    ctx.toast(`Quest complete: ${def.title}`, "good");
    applyEffects(state, def.rewards, ctx);
    for (const next of def.next ?? []) startQuest(state, next, ctx);
    if (def.scene) playScene(state, def.scene, ctx);
  }
}

// ---------------------------------------------------------------------------
// Guild requests & rank
// ---------------------------------------------------------------------------

export function requestTitle(request: RequestState): string {
  switch (request.kind) {
    case "gather":
      return `Gather ${request.amount} ${itemDef(request.target).name}`;
    case "deliver":
      return `Deliver ${request.amount} ${itemDef(request.target).name}`;
    case "craft":
      return `Make ${request.amount} ${itemDef(request.target).name}`;
    case "hunt":
      return `Defeat ${request.amount} ${MONSTERS[request.target]!.name}`;
    case "explore":
      return `Reach floor ${request.amount} of the catacombs`;
  }
}

export function requestReady(state: RestiaState, request: RequestState): boolean {
  switch (request.kind) {
    case "gather":
    case "deliver":
    case "craft":
      return count(state, request.target) >= request.amount;
    case "hunt":
      return request.progress >= request.amount;
    case "explore":
      return state.stats.deepest >= request.amount;
  }
}

function newRequest(state: RestiaState): RequestState | null {
  const rank = state.guild.rank;
  const eligible = REQUEST_TEMPLATES.filter(
    (template) => rankIndex(template.rank) <= rankIndex(rank) && check(state, template.when)
  );
  const template = pick(state, eligible);
  if (!template) return null;
  let target = template.target;
  let amount = randInt(state, template.amount[0], template.amount[1]);
  let gold = template.unit * amount;
  if (template.kind === "deliver") {
    const season = seasonOf(state.day);
    const crops = Object.values(CROPS).filter((crop) => crop.seasons.includes(season));
    const crop = pick(state, crops);
    if (!crop) return null;
    target = crop.produce;
    gold = Math.round(itemDef(target).price * amount * 1.6);
  }
  if (template.kind === "explore") {
    amount = Math.max(1, state.stats.deepest) + randInt(state, template.amount[0], template.amount[1]);
    gold = 120 * amount;
  }
  const rankBonus = 1 + rankIndex(rank) * 0.15;
  return {
    uid: `r${state.day}-${Math.floor(state.rng >>> 8) % 100000}-${state.requests.length}`,
    kind: template.kind,
    target,
    amount,
    progress: 0,
    gold: Math.round(gold * rankBonus),
    gp: template.gp,
    client: pick(state, template.clients) as NpcId,
    expires: state.day + randInt(state, 3, 5),
    accepted: false,
    rank: template.rank
  };
}

/** Morning refresh: expire old postings, fill the board. */
export function refreshRequests(state: RestiaState, ctx: Ctx): void {
  if (!state.flags.registered || state.requestDay === state.day) return;
  state.requestDay = state.day;
  const kept: RequestState[] = [];
  for (const request of state.requests) {
    if (request.expires >= state.day) kept.push(request);
    else if (request.accepted) ctx.toast(`Request expired: ${requestTitle(request)}`, "bad");
  }
  state.requests = kept;
  const wanted = REQUESTS_PER_GUILD_LEVEL[state.town.levels.guild] ?? 3;
  let open = state.requests.filter((request) => !request.accepted).length;
  let guard = 0;
  while (open < wanted && guard++ < 30) {
    const request = newRequest(state);
    if (!request) break;
    // No duplicate postings of the same thing.
    if (state.requests.some((other) => other.kind === request.kind && other.target === request.target)) continue;
    state.requests.push(request);
    open += 1;
  }
}

function atGuild(state: RestiaState): void {
  if (state.player.inside !== "guild") fail("Talk to Elise at the Guild counter for that.");
  if (!isOpen(state, "guild")) fail("The Guild counter has closed for today.");
}

export function acceptRequest(state: RestiaState, uid: string, ctx: Ctx): void {
  atGuild(state);
  const request = state.requests.find((entry) => entry.uid === uid);
  if (!request) fail("That request is gone.");
  if (request.accepted) fail("Already accepted.");
  if (state.requests.filter((entry) => entry.accepted).length >= MAX_ACCEPTED_REQUESTS) {
    fail(`You can hold at most ${MAX_ACCEPTED_REQUESTS} requests at once.`);
  }
  request.accepted = true;
  request.progress = 0;
  ctx.toast(`Accepted: ${requestTitle(request)}`, "info");
}

export function abandonRequest(state: RestiaState, uid: string, ctx: Ctx): void {
  const request = state.requests.find((entry) => entry.uid === uid);
  if (!request) fail("That request is gone.");
  state.requests = state.requests.filter((entry) => entry.uid !== uid);
  ctx.toast(`Abandoned: ${requestTitle(request)}`, "bad");
}

export function turnIn(state: RestiaState, uid: string, ctx: Ctx): void {
  atGuild(state);
  const request = state.requests.find((entry) => entry.uid === uid);
  if (!request || !request.accepted) fail("You haven't accepted that request.");
  if (!requestReady(state, request)) fail("That request isn't finished yet.");
  if (request.kind === "gather" || request.kind === "deliver" || request.kind === "craft") {
    removeItem(state, request.target, request.amount);
  }
  state.requests = state.requests.filter((entry) => entry.uid !== uid);
  state.gold += request.gold;
  addPoints(state, request.client, 25, ctx);
  track(state, ctx, "request", 1);
  ctx.toast(`Request complete! +${request.gold} G, +${request.gp} GP (${NPCS[request.client].name} is pleased)`, "good");
  addGp(state, request.gp, ctx);
}

export function nextRank(state: RestiaState): GuildRank | null {
  return RANKS[rankIndex(state.guild.rank) + 1] ?? null;
}

export function addGp(state: RestiaState, n: number, ctx: Ctx): void {
  const next = nextRank(state);
  const before = state.guild.gp;
  state.guild.gp += n;
  if (next && before < RANK_GP[next] && state.guild.gp >= RANK_GP[next]) {
    ctx.toast(`Enough Guild Points for the Rank ${next} exam! Ask Elise at the Guild.`, "system");
  }
}

export function rankExam(state: RestiaState, ctx: Ctx): void {
  atGuild(state);
  const next = nextRank(state);
  if (!next) fail("You are already Rank S. There is nothing left to prove.");
  if (state.guild.gp < RANK_GP[next]) fail(`Rank ${next} needs ${RANK_GP[next]} Guild Points (you have ${state.guild.gp}).`);
  const exam = RANK_EXAM[next];
  if (exam.cond && !check(state, exam.cond)) fail(`Rank ${next} exam: ${exam.text}.`);
  if (exam.scene) {
    playScene(state, exam.scene, ctx);
    return;
  }
  rankUp(state, ctx);
}

export function rankUp(state: RestiaState, ctx: Ctx): void {
  const next = nextRank(state);
  if (!next) return;
  state.guild.rank = next;
  ctx.toast(`Promoted to Guild Rank ${next}!`, "good");
}

// ---------------------------------------------------------------------------
// System missions
// ---------------------------------------------------------------------------

export function refreshMissions(state: RestiaState): void {
  if (!state.flags.registered || state.missions.day === state.day) return;
  const eligible = MISSIONS.filter((mission) => check(state, mission.when));
  const list = [];
  const pool = [...eligible];
  for (let i = 0; i < 3 && pool.length; i++) {
    const index = randInt(state, 0, pool.length - 1);
    const template = pool.splice(index, 1)[0]!;
    list.push({ id: template.id, target: randInt(state, template.n[0], template.n[1]), progress: 0, done: false, ap: template.ap });
  }
  state.missions = { day: state.day, list };
}
