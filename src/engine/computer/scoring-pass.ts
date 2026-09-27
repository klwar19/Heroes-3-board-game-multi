import type { GameState } from "../state";

/**
 * Per-scoring-pass memo shared by the AI's map and development reads.
 * `chooseComputerAction` scores every legal action against ONE immutable
 * state, and each scorer re-derived the same reads from scratch — measured at
 * several seconds per decision on a live table (the AI "taking longer every
 * turn"). The cache is active only inside `withScoringPass` and only for that
 * exact state object; any other state (a reducer clone, a probe) computes
 * uncached, so nothing can observe a stale value.
 *
 * Kept in its own module so development.ts can use it without importing
 * map-navigation (which imports development).
 */
export type ScoringPass = {
  state: GameState;
  entries: Map<string, unknown>;
  /** JSON keys of records already stringified in this pass (identity-keyed). */
  keys: WeakMap<object, string>;
};

let active: ScoringPass | null = null;

export function withScoringPass<T>(state: GameState, run: () => T): T {
  if (active && active.state === state) return run();
  const previous = active;
  active = { state, entries: new Map(), keys: new WeakMap() };
  try {
    return run();
  } finally {
    active = previous;
  }
}

export function scoringPassCached<T>(state: GameState, key: string, compute: () => T): T {
  const cache = active;
  if (!cache || cache.state !== state) return compute();
  if (cache.entries.has(key)) return cache.entries.get(key) as T;
  const value = compute();
  cache.entries.set(key, value);
  return value;
}

/** The pass currently active (any state), or null outside a scoring pass. */
export function activeScoringPass(): ScoringPass | null {
  return active;
}
