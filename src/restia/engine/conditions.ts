import type { Condition, RestiaState } from "./types";
import { rankIndex } from "../data/progression";
import { count, seasonOf } from "./core";
import { hearts } from "./party";
import { trait } from "./story";

function inRange(value: number, min: number | undefined, max: number | undefined): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

export function check(state: RestiaState, cond: Condition | undefined): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case "flag": {
      const value = state.flags[cond.key];
      return cond.value === undefined ? !!value : value === cond.value;
    }
    case "noFlag":
      return !state.flags[cond.key];
    case "hearts":
      return hearts(state, cond.npc) >= cond.min;
    case "item":
      return count(state, cond.id) >= cond.n;
    case "building":
      return state.town.levels[cond.id] >= cond.level;
    case "rank":
      return rankIndex(state.guild.rank) >= rankIndex(cond.rank);
    case "season":
      return seasonOf(state.day) === cond.season;
    case "floor":
      return state.stats.deepest >= cond.n;
    case "day":
      return state.day >= cond.min;
    case "questDone":
      return state.quests.done.includes(cond.id);
    case "status":
      return state.social[cond.npc].status === cond.status;
    case "recruited":
      return !!state.members[cond.id];
    case "time":
      return state.minute >= cond.from && state.minute < cond.to;
    case "weather":
      return cond.weather.includes(state.weather);
    case "shipped":
      return (cond.item ? state.stats.shipped[cond.item] ?? 0 : state.stats.shippedTotal) >= cond.n;
    case "defeated":
      return (cond.monster ? state.stats.defeated[cond.monster] ?? 0 : state.stats.defeatedTotal) >= cond.n;
    case "level":
      return (state.members.bin?.level ?? 1) >= cond.n;
    case "gold":
      return state.gold >= cond.n;
    case "tamed":
      return state.stats.befriended >= cond.n;
    case "counter":
      return (state.stats.counters[cond.key] ?? 0) >= cond.n;
    case "any":
      return cond.of.some((inner) => check(state, inner));
    case "all":
      return cond.of.every((inner) => check(state, inner));
    case "not":
      return !check(state, cond.of);
    case "karma":
      return inRange(state.story.karma, cond.min, cond.max);
    case "trait":
      return inRange(trait(state, cond.key), cond.min, cond.max);
    case "chose":
      return state.story.choices[cond.key] === cond.option;
    case "battle": {
      const entry = state.story.battles[cond.encounter];
      if (!entry) return false;
      if (cond.result && entry.last !== cond.result) return false;
      return cond.wins === undefined || entry.won >= cond.wins;
    }
    case "fate":
      return cond.fate === "alive" ? !state.story.fates[cond.who] : state.story.fates[cond.who] === cond.fate;
    case "ending":
      return state.story.endings.includes(cond.id);
  }
}
