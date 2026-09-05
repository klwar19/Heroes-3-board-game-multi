// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/state";
import soundManifest from "../../public/sounds/manifest.json";
import {
  MUSIC_VOLUME,
  MUSIC_TRACKS,
  SCENE_TRACK,
  __resetMusicForTests,
  DEFEAT_STING_TRACK,
  VICTORY_FANFARE_TRACK,
  VICTORY_FANFARE_VOLUME,
  playCombatSting,
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
      id: "game-912",
      seed: 912,
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
      gameKey: "game-912:912",
      factionId: "tower",
      environment: "water",
    });

    delete state.adventure!.fields["sea-1"]!.terrain;
    state.adventure!.tiles["tile-1"]!.underground = true;
    expect(mapMusicContext(state).environment).toBe("underground");
  });

  it("uses the seated viewer's faction and hero terrain during parallel turns", () => {
    const state = {
      id: "parallel-44",
      seed: 44,
      round: 2,
      activePlayerId: "p1",
      players: {
        p1: { factionId: "necropolis" },
        p2: { factionId: "castle" },
      },
      heroes: {
        h1: { controllerId: "p1", kind: "main", spaceId: "surface-1" },
        h2: { controllerId: "p2", kind: "main", spaceId: "under-1" },
      },
      adventure: {
        fields: {
          "surface-1": { tileInstanceId: "tile-1", terrain: "grass" },
          "under-1": { tileInstanceId: "tile-2", terrain: "dirt" },
        },
        tiles: {
          "tile-1": { group: "starting" },
          "tile-2": { group: "subterranean" },
        },
      },
      turn: { mode: "parallel", completedPlayerIds: [], simultaneousRoundLimit: 4 },
    } as unknown as GameState;

    expect(mapMusicContext(state, "p2")).toEqual({
      turnKey: "2:p2",
      gameKey: "parallel-44:44",
      factionId: "castle",
      environment: "underground",
    });
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

  it("keeps setup/menu music on its original single looping theme", () => {
    setMusicScene("menu");
    const a = only();
    expect(a.src).toContain("main-menu.mp3");
    expect(a.loop).toBe(true);
    expect(a.playCount).toBe(1);
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
    expect(a.src).toContain("sand.mp3");
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

  it("plays a surface faction theme once, then joins the varied terrain playlist", () => {
    setMusicScene("map", { turnKey: "1:p1", factionId: "necropolis", environment: "surface" });
    const a = only();
    expect(a.src).toContain("necro-town.mp3");
    expect(a.loop).toBe(false);

    a.fireEnded();
    expect(a.src).toContain("sand.mp3");
    expect(a.playCount).toBe(2);

    a.fireEnded();
    expect(a.src).toContain("snow.mp3");
    expect(a.playCount).toBe(3);
  });

  it("includes grass in the random surface terrain playlist", () => {
    expect(MUSIC_TRACKS["map-general"]).toContain("music/grass");
  });

  it("shuffles a fresh terrain order for each game instead of using a fixed first track", () => {
    setMusicScene("map", { turnKey: "1:p1", gameKey: "game-a", environment: "surface" });
    const firstGame = only();
    const order = [firstGame.src];
    for (let index = 1; index < MUSIC_TRACKS["map-general"].length; index += 1) {
      firstGame.fireEnded();
      order.push(firstGame.src);
    }
    expect(order[0]).toContain("sand.mp3");
    expect(new Set(order).size).toBe(MUSIC_TRACKS["map-general"].length);

    __resetMusicForTests();
    FakeAudio.instances = [];
    vi.mocked(Math.random).mockReturnValue(0.999);
    setMusicScene("map", { turnKey: "1:p1", gameKey: "game-b", environment: "surface" });
    expect(only().src).toContain("rough.mp3");
  });

  // The per-game playlist reset lives INSIDE setMusicScene (a new gameKey
  // clears the queues), so it can only be pinned by switching gameKey with no
  // __resetMusicForTests in between — a test that resets by hand passes even
  // when the production reset is deleted.
  it("reshuffles on a new gameKey and keeps its order across turns of one game", () => {
    setMusicScene("map", { turnKey: "1:p1", gameKey: "game-a", environment: "surface" });
    const a = only();
    const order = [a.src];
    a.fireEnded();
    order.push(a.src);
    expect(new Set(order).size).toBe(2);

    // SAME game, a new turn: the shuffled order simply continues.
    setMusicScene("map", { turnKey: "2:p1", gameKey: "game-a", environment: "surface" });
    const continued = a.src;
    expect(order).not.toContain(continued);

    // A NEW GAME starts a fresh cycle — a track this game already played is
    // back at the front instead of the leftover tail of the old queue.
    setMusicScene("map", { turnKey: "1:p1", gameKey: "game-b", environment: "surface" });
    expect(a.src).toBe(order[0]);
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

describe("combat-outcome stings (playCombatSting)", () => {
  it("pauses the background track, plays the win-battle sting on its own element, and resumes the scene when it ends", () => {
    setMusicScene("menu");
    const background = only();
    expect(background.paused).toBe(false);

    playCombatSting(VICTORY_FANFARE_TRACK);
    expect(FakeAudio.instances).toHaveLength(2);
    const sting = FakeAudio.instances[1];
    expect(background.paused).toBe(true);
    expect(sting.src).toBe(library[VICTORY_FANFARE_TRACK].src);
    expect(sting.loop).toBe(false);
    expect(sting.volume).toBe(VICTORY_FANFARE_VOLUME);
    expect(sting.paused).toBe(false);

    const playsBefore = background.playCount;
    sting.fireEnded();
    expect(background.paused).toBe(false);
    expect(background.playCount).toBe(playsBefore + 1);
    // The scene's own track came back, not something else.
    expect(background.src).toBe(library[SCENE_TRACK.menu].src);
  });

  it("the defeat sting loads the LoseCombat track on the SAME reusable element, and ended-listeners never stack", () => {
    setMusicScene("combat");
    playCombatSting(VICTORY_FANFARE_TRACK);
    playCombatSting(DEFEAT_STING_TRACK);
    expect(FakeAudio.instances).toHaveLength(2);
    const background = FakeAudio.instances[0];
    const sting = FakeAudio.instances[1];
    expect(sting.src).toBe(library[DEFEAT_STING_TRACK].src);
    const playsBefore = background.playCount;
    sting.fireEnded();
    expect(background.playCount).toBe(playsBefore + 1);
  });

  it("CONTROL: honours the music mute — nothing plays and the (already silent) background is left alone", () => {
    setMusicScene("menu");
    setMusicMuted(true);
    const background = only();
    const pausesBefore = background.pauseCount;
    playCombatSting(VICTORY_FANFARE_TRACK);
    playCombatSting(DEFEAT_STING_TRACK);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(background.pauseCount).toBe(pausesBefore);
  });

  it("with no scene playing the sting still plays and nothing resumes afterwards", () => {
    playCombatSting(DEFEAT_STING_TRACK);
    expect(FakeAudio.instances).toHaveLength(1);
    const sting = FakeAudio.instances[0];
    expect(sting.src).toBe(library[DEFEAT_STING_TRACK].src);
    sting.fireEnded();
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("both sting tracks are real sound-manifest entries", () => {
    expect(library[VICTORY_FANFARE_TRACK]?.src).toBe("/sounds/music/win-battle.mp3");
    expect(library[DEFEAT_STING_TRACK]?.src).toBe("/sounds/music/lose-combat.mp3");
  });
});
