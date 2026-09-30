import type { CharId, Fate, RestiaState, SceneDef, StoryState } from "./types";
import { ENDINGS, PENALTY_DAYS } from "../data/endings";
import { CHARACTERS } from "../data/characters";
import { CAST_NAMES, NPCS } from "../data/npcs";
import { Ctx, clamp } from "./core";

/**
 * Story state: hidden karma, named story stats, every recorded choice, fates,
 * event-battle history, endings and scars. Scenes read it through conditions
 * (engine/conditions.ts) and change it through effects (engine/effects.ts).
 *
 * Consequences are story-driven (bad choices, bad situations), never random:
 * - Bad ends and losing a main party member (anyone in CHARACTERS) are GAME OVERS.
 *   Peri's Green Room reviews the flop, gives a hint and rewinds to the last
 *   checkpoint with "Bad Ratings" for a few days (Monster Girl Quest style).
 * - Side characters can die, leave or go missing for real. They leave town, stop
 *   posting requests, their building closes to mourn, and they stay as a scar.
 * - Other endings finish the story (ending card).
 */

export const MOURNING_DAYS = 7;
/** Scar reminders appear in the morning summary every this many days. */
export const SCAR_REMINDER_DAYS = 7;

export function newStory(): StoryState {
  return { karma: 0, traits: {}, choices: {}, fates: {}, battles: {}, endings: [], scars: [], rewinds: 0, penaltyUntil: 0 };
}

export function addKarma(state: RestiaState, n: number): void {
  state.story.karma = clamp(state.story.karma + n, -100, 100);
}

export function addTrait(state: RestiaState, key: string, n: number): void {
  state.story.traits[key] = (state.story.traits[key] ?? 0) + n;
}

export function trait(state: RestiaState, key: string): number {
  return state.story.traits[key] ?? 0;
}

export function recordChoice(state: RestiaState, key: string, option: string): void {
  state.story.choices[key] = option;
}

export function nameOf(who: string): string {
  return CHARACTERS[who as CharId]?.name ?? NPCS[who as keyof typeof NPCS]?.name ?? CAST_NAMES[who as keyof typeof CAST_NAMES] ?? who;
}

export function isMainParty(who: string): boolean {
  return who === "bin" || who in CHARACTERS;
}

/**
 * Seals a fate. A main party member's loss is a game over (rewindable); a side
 * character's is permanent and leaves a scar.
 */
export function setFate(state: RestiaState, who: string, fate: Fate, ctx: Ctx): void {
  if (isMainParty(who)) {
    state.story.lostWho = who;
    gameOver(state, "badLostMember");
    return;
  }
  if (state.story.fates[who]) return;
  state.story.fates[who] = fate;
  state.story.scars.push({ who, fate, day: state.day });
  const name = nameOf(who);
  ctx.toast(fate === "dead" ? `${name} is gone.` : fate === "left" ? `${name} has left Frostbitten.` : `${name} is missing.`, "bad");
}

/** False for anyone whose fate has been sealed (they're out of the story). */
export function available(state: RestiaState, who: string): boolean {
  return !state.story.fates[who];
}

/** True while a lost owner's building is closed to mourn. */
export function mourning(state: RestiaState, owner: string | undefined): boolean {
  if (!owner) return false;
  const scar = state.story.scars.find((entry) => entry.who === owner);
  return !!scar && state.day < scar.day + MOURNING_DAYS;
}

export function recordBattle(state: RestiaState, encounter: string, result: "won" | "lost" | "fled"): void {
  const entry = (state.story.battles[encounter] ??= { won: 0, lost: 0, fled: 0, last: result });
  entry[result] += 1;
  entry.last = result;
}

/** Bad ends go to Peri's Green Room; every other ending finishes the story. */
export function reachEnding(state: RestiaState, id: string): void {
  const def = ENDINGS[id];
  if (!def) throw new Error(`Unknown Restia ending ${id}`);
  if (def.kind === "bad") {
    gameOver(state, id);
    return;
  }
  state.ending = id;
  if (!state.story.endings.includes(id)) state.story.endings.push(id);
}

function gameOver(state: RestiaState, id: string): void {
  state.gameOver = id;
  if (!state.story.endings.includes(id)) state.story.endings.push(id);
}

// ---------------------------------------------------------------------------
// Checkpoints & rewind
// ---------------------------------------------------------------------------

/** A scene that can end the game or seal a fate never becomes the rewind point (no loops). */
export function isDoomScene(def: SceneDef): boolean {
  return def.lines.some(
    (line) =>
      ("effects" in line && line.effects.some((effect) => effect.kind === "ending" || effect.kind === "fate")) ||
      ("choice" in line && line.choice.some((option) => option.effects?.some((effect) => effect.kind === "ending" || effect.kind === "fate")))
  );
}

/** Remembers the current state as the rewind point. */
export function takeCheckpoint(state: RestiaState): void {
  if (state.gameOver || state.ending) return;
  const { checkpoint: _previous, ...rest } = state;
  state.checkpoint = structuredClone({ ...rest, checkpoint: null }) as RestiaState;
}

export function penaltyActive(state: RestiaState): boolean {
  return state.day <= state.story.penaltyUntil;
}

/** Jester Points are halved while the Bad Ratings last. Returns what was granted. */
export function gainJp(state: RestiaState, n: number): number {
  const got = n > 0 && penaltyActive(state) ? Math.floor(n / 2) : n;
  state.admin.ap += got;
  return got;
}

/**
 * Peri's rewind: back to the checkpoint, keeping the bad ends you've seen and the
 * rewind count, with Bad Ratings for PENALTY_DAYS days. Without a checkpoint (an old
 * save), the game over is cleared on the spot and the loss is undone.
 */
export function rewindState(state: RestiaState): RestiaState {
  const endings = [...state.story.endings];
  const rewinds = state.story.rewinds + 1;
  const base = state.checkpoint;
  let next: RestiaState;
  if (base) {
    next = structuredClone(base);
    next.checkpoint = structuredClone(base);
  } else {
    next = structuredClone(state);
    next.battle = null;
    next.scene = null;
    next.sceneQueue = [];
  }
  next.gameOver = null;
  next.story.endings = [...new Set([...next.story.endings, ...endings])];
  next.story.rewinds = rewinds;
  delete next.story.lostWho;
  next.story.penaltyUntil = next.day + PENALTY_DAYS - 1;
  return next;
}
