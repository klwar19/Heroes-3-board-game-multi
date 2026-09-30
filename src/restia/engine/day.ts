import type { DaySummary, RestiaState } from "./types";
import { SCAR_REMINDER_DAYS, nameOf, takeCheckpoint } from "./story";
import { itemDef } from "../data/items";
import { NPCS } from "../data/npcs";
import { ZONES } from "../data/zones";
import { Ctx, DAY_START, fail, formatTime, isRainy, pick, rollWeather, seasonOf } from "./core";
import { maxStamina } from "./state";
import { healEveryone } from "./party";
import { farmNight, runSprinklers, waterAllTilled, witherOutOfSeason } from "./farm";
import { dailyFaith, progressConstruction, sellValue } from "./town";
import { refreshMissions, refreshRequests, track } from "./quests";
import { spawnFieldMonsters, spawnForage } from "./world";
import { spouse } from "./social";

export function sleep(state: RestiaState, ctx: Ctx): void {
  if (state.player.inside !== "farmhouse") fail("Sleep in your bunk at Garr's hut.");
  endDay(state, ctx, false, null);
}

/** Let time pass (waiting for a shop to open, an NPC to arrive...). Never past midnight. */
export function waitFor(state: RestiaState, minutes: number, ctx: Ctx): void {
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 18 * 60) fail("Invalid amount of time.");
  if (state.minute + minutes > 24 * 60) fail("It's too late to wait around. Go to bed.");
  state.minute += minutes;
  ctx.toast(`Time passes... it's now ${formatTime(state.minute)}.`, "info");
}

export function passOut(state: RestiaState, ctx: Ctx, reason: string): void {
  endDay(state, ctx, true, reason);
}

/** Morning chores shared by a new game and every new day. */
export function morning(state: RestiaState, ctx: Ctx): void {
  refreshRequests(state, ctx);
  refreshMissions(state);
  spawnForage(state);
  spawnFieldMonsters(state);
}

function endDay(state: RestiaState, ctx: Ctx, passedOut: boolean, reason: string | null): void {
  const summary: DaySummary = {
    day: state.day,
    shippedGold: 0,
    shippedItems: { ...state.shipping },
    passedOut,
    goldLost: 0,
    grown: 0,
    petWork: [],
    built: null,
    faithGain: 0,
    notes: []
  };
  state.battle = null;
  state.dungeon = null;
  // The ruins restock overnight: every floor is rebuilt fresh tomorrow.
  state.floorsToday = {};
  state.scene = null;
  for (const [item, n] of Object.entries(state.shipping)) {
    summary.shippedGold += sellValue(state, item) * n;
    state.stats.shipped[item] = (state.stats.shipped[item] ?? 0) + n;
    state.stats.shippedTotal += n;
  }
  state.gold += summary.shippedGold;
  track(state, ctx, "ship", Object.values(summary.shippedItems).reduce((sum, n) => sum + n, 0));
  state.shipping = {};
  if (passedOut) {
    summary.goldLost = Math.min(1000, Math.floor(state.gold * 0.1));
    state.gold -= summary.goldLost;
    if (reason) summary.notes.push(reason);
  }
  const night = farmNight(state, isRainy(state.weather), ctx);
  summary.grown = night.grown;
  summary.petWork = night.petWork;
  for (const name of night.giants) summary.notes.push(`A giant ${name} grew on your field overnight!`);
  summary.built = progressConstruction(state, ctx);
  summary.faithGain = dailyFaith(state);
  state.faith += summary.faithGain;

  const oldSeason = seasonOf(state.day);
  state.day += 1;
  state.minute = DAY_START;
  state.weather = state.tomorrow;
  state.tomorrow = rollWeather(state, state.day + 1);
  if (seasonOf(state.day) !== oldSeason) {
    const withered = witherOutOfSeason(state);
    summary.notes.push(`${seasonOf(state.day)[0]!.toUpperCase()}${seasonOf(state.day).slice(1)} has begun.${withered ? ` ${withered} out-of-season crops withered.` : ""}`);
  }
  if (isRainy(state.weather)) waterAllTilled(state);
  const sprinkled = runSprinklers(state);
  if (sprinkled) summary.notes.push(`Your sprinklers watered ${sprinkled} plot${sprinkled === 1 ? "" : "s"}.`);
  state.buffs = [];
  state.stats.today = {};
  const home = ZONES.farm.lots.farmhouse!.door;
  state.player = { zone: "farm", x: home.x, y: home.y + 1, facing: "down", inside: "farmhouse" };
  healEveryone(state);
  state.stamina = passedOut ? Math.floor(maxStamina(state) / 2) : maxStamina(state);
  const partner = spouse(state);
  if (partner) {
    const dish = pick(state, ["bread", "salad", "omelet", "herbTea", "cornSoup"])!;
    state.inventory[dish] = (state.inventory[dish] ?? 0) + 1;
    summary.notes.push(`${NPCS[partner].name} packed you ${itemDef(dish).name} for the day.`);
  }
  if (state.story.penaltyUntil && state.day === state.story.penaltyUntil + 1) summary.notes.push("The Bad Ratings have worn off. Peri says the audience has forgiven you. Mostly.");
  for (const scar of state.story.scars) {
    const days = state.day - scar.day;
    if (days > 0 && days % SCAR_REMINDER_DAYS === 0) {
      const what = scar.fate === "dead" ? "since you lost" : scar.fate === "left" ? "since" : "since anyone last saw";
      summary.notes.push(`${days} days ${what} ${nameOf(scar.who)}${scar.fate === "left" ? " left" : ""}. Frostbitten still feels the gap.`);
    }
  }
  morning(state, ctx);
  takeCheckpoint(state);
  ctx.events.push({ kind: "dayEnd", summary });
}
