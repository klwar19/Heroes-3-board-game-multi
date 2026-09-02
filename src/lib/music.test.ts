// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/state";
import soundManifest from "../../public/sounds/manifest.json";
import {
  MUSIC_VOLUME,
  MUSIC_TRACKS,
  SCENE_TRACK,
  __resetMusicForTests,
  isMusicMuted,
  mapMusicContext,
  setMusicMuted,
  setMusicScene,
  subscribeMusic,
  type MusicScene,
} from "./music";

/**
 * A minimal stand-in for HTMLAudioElement that records the calls the music
 * controller makes, so the test asserts real behaviour (which track loads,
 * that it loops at low volume, pauses on mute, resumes on unmute) rather than
 * the presence of code.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  loop = false;
  volume = 1;
  paused = true;
  playCount = 0;
  pauseCount = 0;
  private events = new Map<string, Array<() => void>>();
  constructor() {
    FakeAudio.instances.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    this.playCount += 1;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.pauseCount += 1;
  }
  addEventListener(name: string, listener: () => void): void {
    this.events.set(name, [...(this.events.get(name) ?? []), listener]);
  }
  fireEnded(): void {
    for (const listener of this.events.get("ended") ?? []) listener();
  }
}

const library = soundManifest as Record<string, { src?: string; loop?: boolean }>;

beforeEach(() => {
  window.localStorage.clear();
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  vi.spyOn(Math, "random").mockReturnValue(0);
  __resetMusicForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function only(): FakeAudio {
  expect(FakeAudio.instances).toHaveLength(1);
  return FakeAudio.instances[0];
}

describe("scene → track mapping", () => {
  it("maps every scene to a real, looping manifest entry", () => {
    for (const scene of Object.keys(SCENE_TRACK) as MusicScene[]) {
      const entry = library[SCENE_TRACK[scene]];
      expect(entry, `manifest missing ${SCENE_TRACK[scene]}`).toBeTruthy();
      expect(entry.src).toMatch(/\.mp3$/);
      expect(entry.loop).toBe(true);
    }
  });

  it("maps every playlist member to a real manifest entry", () => {
    for (const tracks of Object.values(MUSIC_TRACKS)) {
      for (const track of tracks) {
        const entry = library[track];
        expect(entry, `manifest missing ${track}`).toBeTruthy();
        expect(entry.src).toMatch(/\.mp3$/);
      }
    }
  });

  it("uses the requested representative scene tracks", () => {
    expect(SCENE_TRACK.menu).toBe("music/main-menu");
    expect(SCENE_TRACK.map).toBe("music/rough");
    expect(SCENE_TRACK.combat).toBe("music/combat-02");
  });
});

describe("authoritative map context", () => {
  it("reads the active faction and the main hero's field/tile layer", () => {
    const state = {
      round: 4,
      activePlayerId: "p1",
      players: { p1: { factionId: "tower" } },
      heroes: { h1: { controllerId: "p1", kind: "main", spaceId: "sea-1" } },
      adventure: {
        fields: { "sea-1": { tileInstanceId: "tile-1", terrain: "water" } },
        tiles: { "tile-1": { group: "sea" } },
      },
    } as unknown as GameState;

    expect(mapMusicContext(state)).toEqual({
      turnKey: "4:p1",
      factionId: "tower",
      environment: "water",
    });

    delete state.adventure!.fields["sea-1"]!.terrain;
    state.adventure!.tiles["tile-1"]!.underground = true;
    expect(mapMusicContext(state).environment).toBe("underground");
  });
});

describe("playback", () => {
  it("loops the scene's track at a volume below the SFX layer", () => {
    setMusicScene("menu");
    const a = only();
    expect(a.src).toContain("/sounds/music/main-menu.mp3");
    expect(a.loop).toBe(true);
    expect(a.paused).toBe(false);
    expect(a.playCount).toBe(1);
    // SFX in lib/sound.ts play at 0.45–0.6; music must sit clearly under that.
    expect(a.volume).toBe(MUSIC_VOLUME);
    expect(MUSIC_VOLUME).toBeLessThan(0.45);
  });

  it("does not restart when the same scene is requested again", () => {
    setMusicScene("map");
    const a = only();
    expect(a.playCount).toBe(1);
    setMusicScene("map");
    expect(only().playCount).toBe(1);
  });

  it("swaps the source when the scene changes", () => {
    setMusicScene("map");
    const a = only();
    expect(a.src).toContain("rough.mp3");
    setMusicScene("combat");
    expect(a.src).toContain("combat-02.mp3");
    expect(a.playCount).toBe(2);
  });

  it("randomly rotates combat tracks without an immediate repeat", () => {
    setMusicScene("combat");
    const a = only();
    expect(a.src).toContain("combat-02.mp3");
    expect(a.loop).toBe(false);
    a.fireEnded();
    expect(a.src).toContain("combat-03.mp3");
    expect(a.playCount).toBe(2);
  });

  it("uses water and underground movement themes ahead of faction themes", () => {
    setMusicScene("map", { turnKey: "1:p1", factionId: "castle", environment: "water" });
    const a = only();
    expect(a.src).toContain("water.mp3");
    setMusicScene("map", { turnKey: "1:p1", factionId: "castle", environment: "underground" });
    expect(a.src).toContain("dirt.mp3");
  });

  it.each([
    ["necropolis", "necro-town.mp3"],
    ["rampart", "rampart.mp3"],
    ["cove", "cove-town.mp3"],
    ["castle", "castle-town.mp3"],
    ["stronghold", "stronghold.mp3"],
    ["tower", "snow.mp3"],
    ["fortress", "swamp.mp3"],
  ])("uses the prioritized %s turn theme", (factionId, file) => {
    setMusicScene("map", { turnKey: `1:${factionId}`, factionId, environment: "surface" });
    expect(only().src).toContain(file);
  });

  it("stops playback when the scene goes null", () => {
    setMusicScene("combat");
    const a = only();
    expect(a.paused).toBe(false);
    setMusicScene(null);
    expect(a.paused).toBe(true);
    expect(a.pauseCount).toBe(1);
  });
});

describe("mute", () => {
  it("pauses on mute and resumes the current scene on unmute", () => {
    setMusicScene("combat");
    const a = only();
    expect(a.paused).toBe(false);

    setMusicMuted(true);
    expect(isMusicMuted()).toBe(true);
    expect(a.paused).toBe(true);

    setMusicMuted(false);
    expect(isMusicMuted()).toBe(false);
    expect(a.paused).toBe(false);
    expect(a.src).toContain("combat-02.mp3");
  });

  it("does not start music while muted, even when the scene changes", () => {
    setMusicMuted(true);
    setMusicScene("menu");
    // Muted: nothing should have been constructed/played.
    expect(FakeAudio.instances).toHaveLength(0);
    setMusicMuted(false);
    // Unmuting resumes the remembered scene.
    expect(only().src).toContain("main-menu.mp3");
    expect(only().paused).toBe(false);
  });

  it("persists the mute choice to localStorage and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMusic(listener);
    setMusicMuted(true);
    expect(window.localStorage.getItem("h3-music-muted")).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
    setMusicMuted(false);
    expect(window.localStorage.getItem("h3-music-muted")).toBe("0");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
