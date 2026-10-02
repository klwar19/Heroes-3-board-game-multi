/**
 * Leaving a battle calls off the boss's delayed laugh (it used to sound ~1 s later
 * over whatever screen came next), against a CONTROL where the battle goes on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GarrisonEvent, GarrisonState } from "@/engine/garrison/sim";

const played: string[] = [];
vi.mock("@/lib/sound", () => ({
  playLibrarySound: (key: string) => { played.push(key); },
  playCardPlace: () => {}
}));
vi.mock("@/lib/sound-voices", () => ({ SOUND_PRIORITY: { cue: 3 } }));

const LAUGH = "effects/oc-evil-laugh";
const state = { cfg: { mode: "adventure" }, outcome: null, warbossId: undefined, boss: null, enemies: [] } as unknown as GarrisonState;
const bossEnter: GarrisonEvent = { e: "bossEnter", id: 1, kind: "oc-rust-dragon" } as GarrisonEvent;

describe("battle sounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    played.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a boss laugh still waiting when the battle ends never sounds; while it goes on, it does", async () => {
    const { cancelPendingBattleSounds, playEventSounds } = await import("./audio");
    // Left the battle right after the boss came in.
    playEventSounds(state, [bossEnter]);
    expect(played).toContain("effects/horn-4");
    cancelPendingBattleSounds();
    vi.advanceTimersByTime(3000);
    expect(played).not.toContain(LAUGH);
    // CONTROL: the battle goes on, the laugh follows the entrance.
    playEventSounds(state, [bossEnter]);
    vi.advanceTimersByTime(1500);
    expect(played).toContain(LAUGH);
  });
});
