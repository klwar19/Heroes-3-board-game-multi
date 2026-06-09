import { describe, expect, it } from "vitest";
import { createSeededRandom } from "./index";

describe("createSeededRandom", () => {
  it("produces deterministic sequences for the same seed", () => {
    const first = createSeededRandom("antagarich");
    const second = createSeededRandom("antagarich");

    expect([first.next(), first.next(), first.nextInt(1, 6)]).toEqual([
      second.next(),
      second.next(),
      second.nextInt(1, 6)
    ]);
  });

  it("can pick stable items from a list", () => {
    const random = createSeededRandom("castle");

    expect(random.pick(["attack", "defense", "power", "knowledge"])).toBe("attack");
  });
});
