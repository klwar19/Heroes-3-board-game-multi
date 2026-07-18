// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureLobbyState,
  DEFAULT_ANIME_OPTIONS,
  DEFAULT_WOG_OPTIONS
} from "./index";
import type { GameSetupOptions, GameState } from "./state";

/**
 * The Anime mod is a STANDALONE lobby mod (WOG precedent): a client
 * SET_GAME_OPTIONS carries the `anime` block, the reducer stores every module,
 * enabling it forces BINH so the modules can load, switching to Legacy forces it
 * off, and it coexists with WOG. Each claim fails if its wiring is removed.
 */
function newLobby(): GameState {
  return createAdventureLobbyState({ seed: "anime-lobby", scenarioId: "skirmish" });
}

function driver(initial: GameState) {
  let state = initial;
  const apply = (options: Partial<GameSetupOptions>) => {
    const result = applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options });
    expect(result.errors.map((e) => e.message).join("; ")).toBe("");
    state = result.state;
  };
  return { apply, get: () => state };
}

describe("Anime mod — lobby SET_GAME_OPTIONS wiring", () => {
  it("enabling the Anime mod on a Legacy table forces BINH and stores the modules", () => {
    const { apply, get } = driver(newLobby());
    apply({ ruleset: "legacy" });
    expect(get().ruleset).toBe("legacy");

    apply({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true } });
    // BINH-forced so the anime modules can load (WOG precedent).
    expect(get().ruleset).toBe("binh");
    expect(get().anime?.enabled).toBe(true);
    // mapObjects defaults ON.
    expect(get().anime?.mapObjects).toBe(true);
  });

  it("stores each module tick independently — mapObjects can be unticked", () => {
    const { apply, get } = driver(newLobby());
    apply({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, mapObjects: false, cultivation: true } });
    expect(get().anime?.enabled).toBe(true);
    expect(get().anime?.mapObjects).toBe(false);
    expect(get().anime?.cultivation).toBe(true);
    // Untouched modules stay off (only the ticked flag changed).
    expect(get().anime?.heroGrades).toBe(false);
    expect(get().anime?.equipment).toBe(false);
    expect(get().anime?.xianxiaArtifacts).toBe(false);
  });

  it("switching to Legacy forces the Anime mod off (mirrors WOG)", () => {
    const { apply, get } = driver(newLobby());
    apply({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true } });
    expect(get().anime?.enabled).toBe(true);
    apply({ ruleset: "legacy" });
    expect(get().ruleset).toBe("legacy");
    expect(get().anime?.enabled).toBe(false);
  });

  it("WOG and Anime coexist — enabling one leaves the other's flags intact", () => {
    const { apply, get } = driver(newLobby());
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, commanders: true } });
    apply({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, cultivation: true } });
    expect(get().wog?.enabled).toBe(true);
    expect(get().wog?.commanders).toBe(true);
    expect(get().anime?.enabled).toBe(true);
    expect(get().anime?.cultivation).toBe(true);

    // CONTROL: unticking one mod does not touch the other.
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, ...get().wog, enabled: false } });
    expect(get().wog?.enabled).toBe(false);
    expect(get().anime?.enabled).toBe(true);
    expect(get().anime?.cultivation).toBe(true);
  });
});
