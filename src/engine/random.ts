export type SeededRandom = {
  next: () => number;
  nextInt: (min: number, maxInclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

// ---------------------------------------------------------------------------
// True randomness vs. seeded determinism
// ---------------------------------------------------------------------------
//
// The engine derives EVERY random outcome from `createSeededRandom(seedString)`,
// which makes a game a pure function of its seed — great for tests (reproducible)
// but it also means that, within one game, a player who knew the seed could
// predict every future die roll, shuffle and tile flip. To make actual play
// "true random" the authoritative server mints fresh crypto entropy (freshEntropy)
// for EVERY action and hands it to applyAction, which parks it here for the
// duration of that action. While it is set, every seed is salted with it, so the
// outcome cannot be reproduced from the game seed alone — it is genuinely
// unpredictable game-to-game and turn-to-turn.
//
// When no entropy is set (the default — every unit test calls applyAction without
// it, and setup runs outside any action), the salt is inert and behaviour is
// byte-for-byte identical to the pure seeded engine, so the whole deterministic
// test suite is unaffected.
//
// Lazily-derived stored seeds (only combat dice: `dice.seed` is fixed at combat
// start, then each roll is derived later, often in a different action) must NOT
// pick up the *live* per-action salt — that would make roll index i differ
// depending on which action consumed it. Those callers pass `{ salt: false }` and
// instead bake the entropy into the stored seed once, at creation time.

let activeEntropy: string | undefined;

/** Park the fresh per-action entropy (or `undefined` to clear). Returns the previous value so callers can restore it (re-entrant). */
export function setActiveEntropy(value: string | undefined): string | undefined {
  const previous = activeEntropy;
  activeEntropy = value;
  return previous;
}

/** The entropy currently salting seeds, if any. Used to bake it into stored seeds (combat dice) at creation. */
export function getActiveEntropy(): string | undefined {
  return activeEntropy;
}

/**
 * Bake the live per-action entropy into a seed string ONCE, for seeds that are
 * stored and derived from lazily across later actions (combat dice): the whole
 * sequence is then non-reproducible game-to-game, while each later derivation
 * (with `{ salt: false }`) stays a stable function of the stored seed. A no-op
 * when no entropy is active, so the seeded test suite is unchanged.
 */
export function bakeEntropy(seed: string): string {
  return activeEntropy === undefined ? seed : `${seed}#e:${activeEntropy}`;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string, options?: { salt?: boolean }): SeededRandom {
  // Mix in the live per-action entropy unless the caller opts out (lazily-derived
  // stored seeds bake their own entropy at creation — see the note above).
  const salted = options?.salt === false || activeEntropy === undefined ? seed : `${seed}#e:${activeEntropy}`;
  let state = hashSeed(salted) || 0x9e3779b9;

  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt: (min, maxInclusive) => {
      if (maxInclusive < min) {
        throw new Error("maxInclusive must be greater than or equal to min");
      }
      return Math.floor(next() * (maxInclusive - min + 1)) + min;
    },
    pick: (items) => {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list");
      }
      return items[Math.floor(next() * items.length)];
    }
  };
}
