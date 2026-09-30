import type { RestiaState, SceneDef, SceneLine } from "./types";
import { STORY_SCENES } from "../data/scenes-story";
import { HEART_SCENES } from "../data/scenes-hearts";
import { PROLOGUE_SCENES } from "../data/scenes-prologue";
import { Ctx, fail } from "./core";
import { check } from "./conditions";
import { applyEffects } from "./effects";
import { isDoomScene, recordChoice, takeCheckpoint } from "./story";

export const SCENES: Record<string, SceneDef> = Object.fromEntries([...PROLOGUE_SCENES, ...STORY_SCENES, ...HEART_SCENES].map((scene) => [scene.id, scene]));

export function sceneDef(id: string): SceneDef {
  const def = SCENES[id];
  if (!def) throw new Error(`Unknown Restia scene ${id}`);
  return def;
}

function displayable(line: SceneLine): boolean {
  return "choice" in line || ("who" in line && "text" in line);
}

function labelIndex(def: SceneDef, label: string): number {
  const index = def.lines.findIndex((line) => "label" in line && line.label === label);
  if (index < 0) throw new Error(`Scene ${def.id} has no label ${label}`);
  return index;
}

/** Runs non-display lines (effects, labels, jumps) from `index` until a line to show or the end. */
function settle(state: RestiaState, ctx: Ctx): void {
  let guard = 0;
  while (state.scene) {
    if (guard++ > 500) throw new Error("Scene loop");
    const def = sceneDef(state.scene.id);
    const line = def.lines[state.scene.index];
    if (!line) {
      finishScene(state, ctx);
      return;
    }
    if (displayable(line)) return;
    if ("effects" in line) {
      state.scene.index += 1;
      applyEffects(state, line.effects, ctx);
    } else if ("goto" in line && !("if" in line)) {
      state.scene.index = labelIndex(def, line.goto);
    } else if ("if" in line) {
      state.scene.index = check(state, line.if) ? labelIndex(def, line.goto) : state.scene.index + 1;
    } else {
      state.scene.index += 1;
    }
  }
}

function finishScene(state: RestiaState, ctx: Ctx): void {
  if (!state.scene) return;
  const def = sceneDef(state.scene.id);
  if (def.once && !state.seenScenes.includes(def.id)) state.seenScenes.push(def.id);
  state.scene = null;
  startQueuedScene(state, ctx);
}

export function sceneSeen(state: RestiaState, id: string): boolean {
  return state.seenScenes.includes(id);
}

/** Plays now (or queues behind the current scene). Returns false when a once-scene was already seen. */
export function playScene(state: RestiaState, id: string, ctx: Ctx): boolean {
  const def = sceneDef(id);
  if (def.once && state.seenScenes.includes(id)) return false;
  if (state.scene) {
    if (state.scene.id !== id && !state.sceneQueue.includes(id)) state.sceneQueue.push(id);
    return true;
  }
  state.scene = { id, index: 0 };
  // Rewind point: the scene replays from its first line (scenes that end the game don't count).
  if (!isDoomScene(def)) takeCheckpoint(state);
  settle(state, ctx);
  return true;
}

/** Runs a restored scene's leading non-display lines (after a rewind). */
export function resumeScene(state: RestiaState, ctx: Ctx): void {
  settle(state, ctx);
}

export function startQueuedScene(state: RestiaState, ctx: Ctx): void {
  // A game over or a finished story waits for Peri / the ending card first.
  if (state.gameOver || state.ending) return;
  while (!state.scene && state.sceneQueue.length) {
    const next = state.sceneQueue.shift()!;
    // A battle started by the previous scene runs first; keep the rest queued.
    if (state.battle) {
      state.sceneQueue.unshift(next);
      return;
    }
    playScene(state, next, ctx);
  }
}

export function sceneNext(state: RestiaState, ctx: Ctx): void {
  if (!state.scene) fail("No scene is playing.");
  const def = sceneDef(state.scene.id);
  const line = def.lines[state.scene.index];
  if (line && "choice" in line) fail("Choose an answer.");
  state.scene.index += 1;
  settle(state, ctx);
}

export function sceneChoose(state: RestiaState, index: number, ctx: Ctx): void {
  if (!state.scene) fail("No scene is playing.");
  const def = sceneDef(state.scene.id);
  const line = def.lines[state.scene.index];
  if (!line || !("choice" in line)) fail("Nothing to choose.");
  const option = line.choice[index];
  if (!option) fail("Invalid choice.");
  if (!check(state, option.when)) fail("Invalid choice.");
  if (!check(state, option.requires)) fail(option.hint ?? "You can't choose that.");
  recordChoice(state, `${def.id}.${line.key ?? `c${state.scene.index}`}`, option.id ?? String(index));
  state.scene.index = option.goto ? labelIndex(def, option.goto) : state.scene.index + 1;
  if (option.effects) applyEffects(state, option.effects, ctx);
  settle(state, ctx);
}
