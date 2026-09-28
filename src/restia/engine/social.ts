import type { BuildingId, ItemId, NpcId, RestiaState, ZoneId } from "./types";
import { NPCS, NPC_IDS, type NpcSpot } from "../data/npcs";
import { HEART_EVENTS } from "../data/scenes-hearts";
import { GIFT_POINTS, GIFTS_PER_WEEK, POINTS_PER_HEART, TALK_POINTS } from "../data/progression";
import { ZONES } from "../data/zones";
import { ITEMS, itemDef } from "../data/items";
import { Ctx, dayOfSeason, fail, hashString, isRainy, perk, removeItem, seasonOf, weekday } from "./core";
import { check } from "./conditions";
import { hearts } from "./party";
import { playScene, sceneSeen } from "./scenes";
import { track } from "./quests";

const H = 60;

export type NpcWhere = { zone: ZoneId; x: number; y: number } | { building: BuildingId } | null;

function resolveSpot(spot: NpcSpot): NpcWhere {
  if ("away" in spot) return null;
  if ("building" in spot) return { building: spot.building };
  const pos = ZONES[spot.zone].spots[spot.spot];
  if (!pos) throw new Error(`Unknown spot ${spot.spot} in ${spot.zone}`);
  return { zone: spot.zone, x: pos.x, y: pos.y };
}

/** Where an NPC is right now (null = away / not in Dawnhollow yet). */
export function npcWhere(state: RestiaState, npc: NpcId): NpcWhere {
  const def = NPCS[npc];
  if (def.available && !check(state, def.available)) return null;
  const minute = state.minute;
  if (state.social[npc].status === "married" && (minute < 9 * H || minute >= 19 * H)) return { building: "farmhouse" };
  const wet = isRainy(state.weather) || state.weather === "snow";
  const day = weekday(state.day);
  for (const entry of def.schedule) {
    if (minute < entry.from || minute >= entry.to) continue;
    if (entry.days && !entry.days.includes(day)) continue;
    if (entry.weather === "rain" && !wet) continue;
    if (entry.weather === "dry" && wet) continue;
    if (entry.when && !check(state, entry.when)) continue;
    if ("building" in entry.at && state.town.levels[entry.at.building] < 1) continue;
    return resolveSpot(entry.at);
  }
  return null;
}

export function npcsHere(state: RestiaState): NpcId[] {
  return NPC_IDS.filter((npc) => isHere(state, npc));
}

export function isHere(state: RestiaState, npc: NpcId): boolean {
  const where = npcWhere(state, npc);
  if (!where) return false;
  if (state.player.inside) return "building" in where && where.building === state.player.inside;
  return "zone" in where && where.zone === state.player.zone;
}

export function isBirthday(state: RestiaState, npc: NpcId): boolean {
  const birthday = NPCS[npc].birthday;
  return seasonOf(state.day) === birthday.season && dayOfSeason(state.day) === birthday.day;
}

function heartCap(state: RestiaState, npc: NpcId): number {
  const rel = state.social[npc];
  if (NPCS[npc].romance && rel.status === "none") return 8 * POINTS_PER_HEART + POINTS_PER_HEART - 1;
  return 10 * POINTS_PER_HEART;
}

export function addPoints(state: RestiaState, npc: NpcId, n: number, ctx: Ctx): void {
  const rel = state.social[npc];
  const before = Math.floor(rel.points / POINTS_PER_HEART);
  const scaled = n > 0 && perk(state, "silverTongue") ? Math.round(n * 1.25) : n;
  rel.points = Math.max(0, Math.min(heartCap(state, npc), rel.points + scaled));
  const after = Math.floor(rel.points / POINTS_PER_HEART);
  if (after > before) ctx.events.push({ kind: "hearts", npc, hearts: after });
}

export type GiftTaste = keyof typeof GIFT_POINTS;

export function giftTaste(npc: NpcId, item: ItemId): GiftTaste {
  const def = NPCS[npc];
  const tags = ITEMS[item]?.tags ?? [];
  if (def.loves.includes(item)) return "love";
  if (def.hates.includes(item)) return "hate";
  if (def.dislikes.includes(item) || tags.some((tag) => def.dislikeTags?.includes(tag))) return "dislike";
  if (def.likes.includes(item) || tags.some((tag) => def.likeTags?.includes(tag)) || item === "giftBox") return "like";
  return "neutral";
}

const REACTIONS: Record<GiftTaste, string[]> = {
  love: ["This is my favourite! How did you know?!", "Oh... oh wow. You really get me.", "I'm going to treasure this. Thank you!"],
  like: ["Oh, how nice! Thank you.", "I like this. You have good taste.", "For me? That's sweet."],
  neutral: ["Thanks, I guess I'll find a use for it.", "Oh. Thank you.", "That's... thoughtful."],
  dislike: ["Um... thanks. I suppose.", "I'm not really into this, sorry.", "Oh. This. Right."],
  hate: ["...Why would you give me this?", "Please don't give me this again.", "Ugh. Really?"]
};

function presentOrFail(state: RestiaState, npc: NpcId): void {
  if (!isHere(state, npc)) fail(`${NPCS[npc].name} isn't here right now.`);
}

/** Story conversations that replace the daily line when their moment comes. */
function storyTalk(state: RestiaState, npc: NpcId, ctx: Ctx): boolean {
  if (npc === "guildGirl" && !state.flags.registered) return playScene(state, "guildRegister", ctx);
  if (npc === "pip" && !sceneSeen(state, "meetPip")) return playScene(state, "meetPip", ctx);
  if (npc === "seren" && !state.members.seren && check(state, { kind: "rank", rank: "D" })) return playScene(state, "serenJoins", ctx);
  if (npc === "nell" && !state.members.nell && hearts(state, "nell") >= 3 && state.town.levels.inn >= 1) {
    return playScene(state, "nellJoins", ctx);
  }
  return false;
}

export function talk(state: RestiaState, npc: NpcId, ctx: Ctx): void {
  presentOrFail(state, npc);
  const rel = state.social[npc];
  const first = rel.talkedDay !== state.day;
  if (first) {
    rel.talkedDay = state.day;
    rel.met = true;
    addPoints(state, npc, TALK_POINTS, ctx);
    track(state, ctx, "talk", 1);
    state.minute += 10;
  }
  if (storyTalk(state, npc, ctx)) return;
  for (const event of HEART_EVENTS) {
    if (event.npc !== npc || sceneSeen(state, event.scene)) continue;
    if (hearts(state, npc) < event.hearts) continue;
    if (event.needsDating && rel.status === "none") continue;
    if (playScene(state, event.scene, ctx)) return;
  }
  if (isBirthday(state, npc)) {
    ctx.events.push({ kind: "say", npc, text: "It's my birthday today! ...Not that I'm hinting at anything. Well. Maybe a little." });
    return;
  }
  const pool = NPCS[npc].lines.filter((line) => check(state, line.when));
  // Prefer the most specific lines (conditioned) half of the time for variety.
  const special = pool.filter((line) => line.when);
  const seed = hashString(`${npc}:${state.day}:${first ? 0 : 1}`);
  const list = special.length && seed % 2 === 0 ? special : pool;
  const line = list[seed % list.length];
  if (line) ctx.events.push({ kind: "say", npc, text: line.text });
}

export function gift(state: RestiaState, npc: NpcId, item: ItemId, ctx: Ctx): void {
  presentOrFail(state, npc);
  const def = itemDef(item);
  if ((state.inventory[item] ?? 0) < 1) fail(`You don't have ${def.name}.`);
  if (item === "dawnCharm") return confess(state, npc, ctx);
  if (item === "eternalRing") return propose(state, npc, ctx);
  const rel = state.social[npc];
  if (rel.giftDay === state.day) fail(`You already gave ${NPCS[npc].name} a gift today.`);
  const week = Math.floor((state.day - 1) / 7);
  if (rel.giftWeek !== week) {
    rel.giftWeek = week;
    rel.giftsWeek = 0;
  }
  const birthday = isBirthday(state, npc);
  if (rel.giftsWeek >= GIFTS_PER_WEEK && !birthday) fail(`${NPCS[npc].name} has had enough gifts this week.`);
  removeItem(state, item, 1);
  rel.giftDay = state.day;
  rel.giftsWeek += 1;
  rel.met = true;
  const taste = giftTaste(npc, item);
  addPoints(state, npc, GIFT_POINTS[taste] * (birthday ? 5 : 1), ctx);
  track(state, ctx, "gift", 1);
  const lines = REACTIONS[taste];
  const text = birthday && (taste === "love" || taste === "like") ? "On my birthday, too! You're wonderful." : lines[hashString(`${npc}${item}${state.day}`) % lines.length]!;
  ctx.events.push({ kind: "say", npc, text });
  state.minute += 5;
}

function partner(state: RestiaState): NpcId | null {
  return NPC_IDS.find((id) => state.social[id].status !== "none") ?? null;
}

function confess(state: RestiaState, npc: NpcId, ctx: Ctx): void {
  const def = NPCS[npc];
  const rel = state.social[npc];
  if (!def.romance) fail(`${def.name} smiles politely. That charm is meant for a sweetheart.`);
  if (rel.status !== "none") fail(`You're already together with ${def.name}.`);
  const current = partner(state);
  if (current) fail(`You're already with ${NPCS[current].name}.`);
  if (hearts(state, npc) < 8) {
    ctx.events.push({ kind: "say", npc, text: "I... I don't think we know each other well enough for that yet." });
    return;
  }
  removeItem(state, "dawnCharm", 1);
  rel.status = "dating";
  addPoints(state, npc, 50, ctx);
  playScene(state, `confess-${npc}`, ctx);
  ctx.toast(`You are now dating ${def.name}!`, "love");
}

function propose(state: RestiaState, npc: NpcId, ctx: Ctx): void {
  const def = NPCS[npc];
  const rel = state.social[npc];
  if (rel.status === "married") fail(`${def.name} is already your spouse.`);
  if (rel.status !== "dating") fail(`${def.name} blushes. You should be dating first (Dawn Charm at 8 hearts).`);
  if (hearts(state, npc) < 10) fail(`${def.name} needs a little more time (10 hearts).`);
  if (state.town.levels.farmhouse < 2) fail("Expand the farmhouse first (Restoration Board) so there's room for two.");
  removeItem(state, "eternalRing", 1);
  rel.status = "married";
  playScene(state, `propose-${npc}`, ctx);
  ctx.toast(`You married ${def.name}!`, "love");
}

export function spouse(state: RestiaState): NpcId | null {
  return NPC_IDS.find((id) => state.social[id].status === "married") ?? null;
}
