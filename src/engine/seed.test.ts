import { afterEach, describe, expect, it, vi } from "vitest";
import { freshEntropy, freshSeed } from "./seed";
import { createAdventureGameState } from "./adventure-setup";

const TWO_PLAYERS = [
  { id: "p1", name: "P1", factionId: "bulwark" as const },
  { id: "p2", name: "P2", factionId: "necropolis" as const }
];

describe("freshEntropy / freshSeed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mints distinct tokens across many calls", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      tokens.add(freshEntropy());
    }
    expect(tokens.size).toBe(1000);
  });

  it("stays distinct even when Date.now() and Math.random() are FROZEN (it uses crypto)", () => {
    // Reproduces a locked-down edge isolate: a pinned clock and a per-isolate
    // seeded Math.random. The old `${Date.now()}-${Math.random()}` recipe would
    // return the same token three times here; freshEntropy must not.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.4242);
    const seeds = new Set([freshSeed(), freshSeed(), freshSeed()]);
    expect(seeds.size).toBe(3);
  });

  it("still distinct via its counter when NO crypto exists and the clock+RNG are frozen", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    vi.spyOn(Date, "now").mockReturnValue(0);
    vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      const a = freshEntropy();
      const b = freshEntropy();
      expect(a).not.toBe(b);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "crypto", original);
      }
    }
  });

  it("two seedless adventures do NOT share a map + Creature Bank order (the reported bug)", () => {
    // The exact symptom: a brand-new game (no explicit seed) always opened on the
    // same Far tiles and the same first/second bank. With a constant default seed
    // every signature below is identical and the Set collapses to size 1.
    const signatures = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const state = createAdventureGameState({ rollFirstPlayer: false, players: TWO_PLAYERS });
      const adventure = state.adventure;
      if (!adventure) {
        throw new Error("expected an adventure state");
      }
      signatures.add(
        JSON.stringify({
          far: adventure.creatureBankTokensFar,
          near: adventure.creatureBankTokensNear,
          p1: adventure.playerFarTiles.p1,
          p2: adventure.playerFarTiles.p2
        })
      );
    }
    expect(signatures.size).toBeGreaterThan(1);
  });
});
