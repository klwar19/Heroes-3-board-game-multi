// Entropy for seeding new games.
//
// A game's entire map layout, Far-tile draft and Creature Bank order are a pure
// function of its seed string (see adventure-setup.ts). So the seed MUST be
// unique per game — if two games are created from the same seed they get the
// same map, the same first Far tile and the same bank reveal order.
//
// The obvious `${Date.now()}-${Math.random()}` recipe is NOT reliable for this:
// on locked-down edge/worker isolates (e.g. the Cloudflare runtime PartyKit uses)
// `Date.now()` can be frozen to the start of the request and `Math.random()` can
// be seeded per-isolate, so every freshly spun server handed out the SAME seed —
// which is exactly why a brand-new game/window always opened on the same tiles
// and the same "first bank imp, second bank dwarf" order while an in-process
// "New adventure" (which re-rolls in a warm isolate) varied.
//
// `crypto.getRandomValues` / `crypto.randomUUID` are genuinely non-deterministic
// in browsers, Node and Cloudflare Workers alike, so we prefer them. The
// time+random+counter fallback only runs where no crypto exists at all, and the
// monotonic counter still keeps it distinct within a single process even if the
// clock and Math.random are both frozen.

let fallbackCounter = 0;

/** A unique, high-entropy token. Prefers the platform crypto RNG. */
export function freshEntropy(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  if (typeof cryptoObj?.getRandomValues === "function") {
    const buffer = new Uint32Array(4);
    cryptoObj.getRandomValues(buffer);
    return Array.from(buffer, (value) => value.toString(36)).join("");
  }
  fallbackCounter += 1;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${fallbackCounter.toString(36)}`;
}

/** A fresh, unique game seed string, namespaced by a human-readable prefix. */
export function freshSeed(prefix = "homm3bg"): string {
  return `${prefix}-${freshEntropy()}`;
}
