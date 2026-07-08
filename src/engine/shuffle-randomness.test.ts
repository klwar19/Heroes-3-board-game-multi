import { afterEach, describe, expect, it } from "vitest";
import { shuffleCards } from "./decks";
import { createSeededRandom, setActiveEntropy } from "./random";
import { spellDeckBinhBasic, spellDeckBinhBasicUnique } from "@/data/cards/spells";

/**
 * "Random doesn't feel random — Protection from Fire/Earth/Water/Air keeps coming
 * up." The report blamed the shuffle. These tests pin, statistically, that the
 * shuffle IS uniform: no card (protections included) is over-represented at the
 * top of the deck or at any position. If a future change breaks the shuffle
 * (drops the swap, biases the index, sorts by seed, "forgets" to shuffle), one of
 * these fails.
 *
 * The tests are fully deterministic — `shuffleCards` is a pure function of its
 * seed, so a fixed sweep of seeds gives a fixed distribution with no flakiness.
 * (The real over-surfacing of Protections is deck composition — 8 of 62 basic
 * cards are Protections — plus shared-deck draft drift as good spells get taken
 * and low-value leftovers recirculate. That is board-game behaviour, not an RNG
 * defect: this suite is the proof the RNG itself is sound.)
 */

const PROTECTIONS = new Set([
  "spell.protection_from_air",
  "spell.protection_from_earth",
  "spell.protection_from_fire",
  "spell.protection_from_water"
]);

const TRIALS = 20000;

/**
 * Fraction of shuffles in which a Protection card lands at each deck position.
 * `orderFor(trialIndex)` produces the deck order for that trial — the real test
 * passes a fresh seed per trial; the mutation control passes the unshuffled deck.
 */
function protectionPositionFractions(orderFor: (trial: number) => string[]): number[] {
  const hist = new Array<number>(spellDeckBinhBasic.length).fill(0);
  for (let t = 0; t < TRIALS; t += 1) {
    const order = orderFor(t);
    for (let i = 0; i < order.length; i += 1) {
      if (PROTECTIONS.has(order[i])) hist[i] += 1;
    }
  }
  return hist.map((count) => count / TRIALS);
}

describe("spell-deck shuffle is uniform (no Protection bias)", () => {
  it("spreads Protection cards evenly across every deck position", () => {
    const deck = spellDeckBinhBasic;
    const protCount = deck.filter((id) => PROTECTIONS.has(id)).length;
    expect(protCount).toBe(8); // 4 Protection spells × 2 copies
    const expected = protCount / deck.length; // ≈ 0.129

    // A distinct, realistic per-game seed for each trial (the live seed carries a
    // fresh crypto nonce, so opening deck order varies game to game).
    const fractions = protectionPositionFractions((trial) => shuffleCards(deck, `spell-shuffle-${trial}#deck#spells`));

    const maxDeviation = Math.max(...fractions.map((f) => Math.abs(f - expected)));
    // Empirically ~0.007 over 20k trials; 0.03 is a comfortable, non-flaky guard
    // that still catches any gross bias.
    expect(maxDeviation).toBeLessThan(0.03);
  });

  it("MUTATION CONTROL: an identity 'shuffle' (no shuffle) fails the same uniformity check", () => {
    const expected = 8 / spellDeckBinhBasic.length;
    // Not shuffling leaves the Protection block contiguous — every position is
    // either always or never a Protection, so the deviation is huge. This proves
    // the uniformity metric above actually discriminates a broken shuffle.
    const fractions = protectionPositionFractions(() => spellDeckBinhBasic);
    const maxDeviation = Math.max(...fractions.map((f) => Math.abs(f - expected)));
    expect(maxDeviation).toBeGreaterThan(0.5);
  });

  it("gives every basic spell a near-equal chance of being the next-drawn (top) card", () => {
    const deck = spellDeckBinhBasic;
    const topCounts = new Map<string, number>();
    for (let t = 0; t < TRIALS; t += 1) {
      // Draw = pop() from the top (last element), matching the engine.
      const order = shuffleCards(deck, `top-card-${t}#deck#spells`);
      const top = order[order.length - 1];
      topCounts.set(top, (topCounts.get(top) ?? 0) + 1);
    }
    const expected = 1 / deck.length; // each of the 62 physical cards equally likely
    // Every distinct spell id should surface as the top card; none dominates.
    for (const id of spellDeckBinhBasicUnique) {
      const fraction = (topCounts.get(id) ?? 0) / TRIALS;
      // Two copies each → ~2/62 ≈ 0.032 per id; allow a wide but bounded band.
      expect(fraction, `${id} top-card fraction`).toBeGreaterThan(expected); // > ~0.016, i.e. it DOES appear
      expect(fraction, `${id} top-card fraction`).toBeLessThan(0.07);
    }
  });
});

describe("shuffle is genuinely random per action, deterministic without entropy", () => {
  afterEach(() => setActiveEntropy(undefined));

  it("same deck + same seed → identical order with no entropy (reproducible tests/setup)", () => {
    const a = shuffleCards(spellDeckBinhBasic, "fixed#deck#spells");
    const b = shuffleCards(spellDeckBinhBasic, "fixed#deck#spells");
    expect(a).toEqual(b);
  });

  it("same deck + same seed → DIFFERENT order once per-action entropy is active (true random)", () => {
    const baseline = shuffleCards(spellDeckBinhBasic, "fixed#deck#spells");
    setActiveEntropy("action-entropy-1");
    const salted = shuffleCards(spellDeckBinhBasic, "fixed#deck#spells");
    expect(salted).not.toEqual(baseline);
    setActiveEntropy("action-entropy-2");
    const salted2 = shuffleCards(spellDeckBinhBasic, "fixed#deck#spells");
    // Distinct entropy → distinct order: the reshuffle is unpredictable turn to turn.
    expect(salted2).not.toEqual(salted);
  });

  it("CONTROL: the seeded generator itself is not the weak link — nearby seeds decorrelate", () => {
    // Reshuffle seeds differ only by a trailing counter; the first draw off each
    // must be independent, not marching in lockstep (the classic hash+PRNG smell).
    const firstDraws = Array.from({ length: 12 }, (_, i) => createSeededRandom(`reshuffle#spells#${i}`).next());
    const distinct = new Set(firstDraws.map((value) => value.toFixed(3)));
    expect(distinct.size).toBeGreaterThan(9); // no clustering / repeats
  });
});
