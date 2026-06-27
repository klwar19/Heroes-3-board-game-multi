import { afterEach, describe, expect, it } from "vitest";
import { bakeEntropy, createSeededRandom, getActiveEntropy, setActiveEntropy } from "./random";

// The entropy salt is the single choke point that turns the seeded engine into a
// genuinely-random one in live play (the authoritative server mints fresh crypto
// entropy per action and parks it here). These tests pin both halves of the
// contract: WITH entropy the seeded sequence changes (true random), WITHOUT it the
// behaviour is byte-for-byte the pure seeded engine (so the whole test suite — and
// reproducible setup — is unaffected).
describe("per-action entropy salt", () => {
  afterEach(() => setActiveEntropy(undefined));

  function sequence(seed: string, options?: { salt?: boolean }): number[] {
    const rng = createSeededRandom(seed, options);
    return [rng.next(), rng.next(), rng.next()];
  }

  it("is inert by default — identical to the pure seeded engine", () => {
    expect(getActiveEntropy()).toBeUndefined();
    expect(sequence("seed-x")).toEqual(sequence("seed-x"));
  });

  it("changes the sequence for the same seed once entropy is active (true random)", () => {
    const baseline = sequence("seed-x");
    setActiveEntropy("entropy-a");
    const salted = sequence("seed-x");
    expect(salted).not.toEqual(baseline);
    // Removing the salt is removing the only mutation if the logic is intact.
    if (salted.every((value, index) => value === baseline[index])) {
      throw new Error("entropy salt had no effect — the true-random wiring is dead");
    }
  });

  it("gives a DIFFERENT sequence per distinct entropy token (non-reproducible game-to-game)", () => {
    const seen = new Set<string>();
    for (const token of ["a", "b", "c", "d", "e"]) {
      setActiveEntropy(token);
      seen.add(JSON.stringify(sequence("same-seed")));
    }
    expect(seen.size).toBe(5);
  });

  it("respects { salt: false } — the lazily-derived combat-dice path ignores the live salt", () => {
    const unsalted = sequence("dice-seed#0", { salt: false });
    setActiveEntropy("entropy-a");
    // Same seed, salt disabled → still the pure result, so combat roll index i is a
    // stable function of dice.seed no matter which action consumes it.
    expect(sequence("dice-seed#0", { salt: false })).toEqual(unsalted);
    // …while a salted draw of the same seed diverges.
    expect(sequence("dice-seed#0")).not.toEqual(unsalted);
  });

  it("setActiveEntropy returns the previous value so it can be restored (re-entrant)", () => {
    const first = setActiveEntropy("outer");
    expect(first).toBeUndefined();
    const second = setActiveEntropy("inner");
    expect(second).toBe("outer");
    setActiveEntropy(second);
    expect(getActiveEntropy()).toBe("outer");
  });

  it("bakeEntropy folds the active entropy into a stored seed once (combat-dice seed)", () => {
    expect(bakeEntropy("combat-1")).toBe("combat-1");
    setActiveEntropy("entropy-a");
    expect(bakeEntropy("combat-1")).toBe("combat-1#e:entropy-a");
    setActiveEntropy("entropy-b");
    expect(bakeEntropy("combat-1")).not.toBe("combat-1#e:entropy-a");
  });
});
