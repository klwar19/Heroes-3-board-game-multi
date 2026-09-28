import type { RestiaEvent, RestiaState, Season, Weather } from "./types";
import { itemDef } from "../data/items";

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) stored in the save, so reloading a save and
// repeating the same actions reproduces the same results.
// ---------------------------------------------------------------------------

export function random(state: RestiaState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state: RestiaState, min: number, max: number): number {
  return min + Math.floor(random(state) * (max - min + 1));
}

export function chance(state: RestiaState, p: number): boolean {
  return random(state) < p;
}

export function pickWeighted<T extends { weight: number }>(state: RestiaState, list: T[]): T | null {
  const total = list.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;
  let roll = random(state) * total;
  for (const entry of list) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return list[list.length - 1] ?? null;
}

export function pick<T>(state: RestiaState, list: readonly T[]): T | null {
  return list.length ? list[Math.floor(random(state) * list.length)]! : null;
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export const DAYS_PER_SEASON = 28;
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_START = 6 * 60;
/** 2 AM: Bin passes out. */
export const PASS_OUT = 26 * 60;

export function seasonOf(day: number): Season {
  return SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % 4]!;
}
export function dayOfSeason(day: number): number {
  return ((day - 1) % DAYS_PER_SEASON) + 1;
}
export function yearOf(day: number): number {
  return Math.floor((day - 1) / (DAYS_PER_SEASON * 4)) + 1;
}
export function weekday(day: number): number {
  return (day - 1) % 7;
}
export function formatTime(minute: number): string {
  const total = minute % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
export function formatDate(day: number): string {
  const season = seasonOf(day);
  return `${WEEKDAYS[weekday(day)]}, ${season[0]!.toUpperCase()}${season.slice(1)} ${dayOfSeason(day)} · Year ${yearOf(day)}`;
}

export function rollWeather(state: RestiaState, day: number): Weather {
  const season = seasonOf(day);
  if (dayOfSeason(day) === 1) return "sunny";
  const roll = random(state);
  switch (season) {
    case "spring":
      return roll < 0.22 ? "rain" : roll < 0.35 ? "cloudy" : "sunny";
    case "summer":
      return roll < 0.12 ? "rain" : roll < 0.17 ? "storm" : roll < 0.27 ? "cloudy" : "sunny";
    case "autumn":
      return roll < 0.22 ? "rain" : roll < 0.4 ? "cloudy" : "sunny";
    default:
      return roll < 0.3 ? "snow" : roll < 0.45 ? "cloudy" : "sunny";
  }
}

export function isRainy(weather: Weather): boolean {
  return weather === "rain" || weather === "storm";
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function count(state: RestiaState, id: string): number {
  return state.inventory[id] ?? 0;
}

export function addItem(state: RestiaState, id: string, n: number): void {
  if (n <= 0) return;
  itemDef(id);
  state.inventory[id] = (state.inventory[id] ?? 0) + n;
}

export function removeItem(state: RestiaState, id: string, n: number): boolean {
  const have = state.inventory[id] ?? 0;
  if (n <= 0 || have < n) return false;
  if (have === n) delete state.inventory[id];
  else state.inventory[id] = have - n;
  return true;
}

export function hasItems(state: RestiaState, items: Record<string, number>): boolean {
  return Object.entries(items).every(([id, n]) => count(state, id) >= n);
}

// ---------------------------------------------------------------------------
// Events & tracking
// ---------------------------------------------------------------------------

export class Ctx {
  events: RestiaEvent[] = [];
  toast(text: string, tone: "info" | "good" | "bad" | "system" | "love" = "info"): void {
    this.events.push({ kind: "toast", text, tone });
  }
  sound(id: string): void {
    this.events.push({ kind: "sound", id });
  }
}

export class ActionError extends Error {}

export function fail(message: string): never {
  throw new ActionError(message);
}

export function perk(state: RestiaState, id: string): boolean {
  return state.admin.perks.includes(id);
}

export function advanceTime(state: RestiaState, minutes: number): void {
  state.minute += minutes;
}
