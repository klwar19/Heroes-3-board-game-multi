// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENGINE_SIGNATURE, type GameState } from "@/engine";
import {
  ROOM_CACHE_PREFIX,
  clearAllCachedRooms,
  loadCachedRoom,
  saveCachedRoom
} from "./room-cache";

// A minimal stand-in for a serialized in-progress game. The cache never
// inspects the shape beyond `state` + `version`, so this is enough.
const fakeState = { phase: "adventure" } as unknown as GameState;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("room recovery cache versioning", () => {
  it("round-trips a save written by the current engine", () => {
    saveCachedRoom("dev-room", 7, fakeState);
    const loaded = loadCachedRoom("dev-room");
    expect(loaded).toEqual({ version: 7, state: fakeState });
  });

  it("discards (and removes) a save from a different engine version", () => {
    // Simulate a save written by an older deploy: a stale signature.
    window.localStorage.setItem(
      ROOM_CACHE_PREFIX + "dev-room",
      JSON.stringify({ signature: "old-engine-signature", version: 3, state: fakeState })
    );

    // This is the crux of the "can't return or reset" fix: an incompatible save
    // must NOT be returned (restoring it crashes the new render), and it must be
    // purged so it can never be restored again on the next reload.
    expect(loadCachedRoom("dev-room")).toBeNull();
    expect(window.localStorage.getItem(ROOM_CACHE_PREFIX + "dev-room")).toBeNull();
  });

  it("discards a legacy save that carries no signature at all", () => {
    window.localStorage.setItem(
      ROOM_CACHE_PREFIX + "dev-room",
      JSON.stringify({ version: 3, state: fakeState })
    );
    expect(loadCachedRoom("dev-room")).toBeNull();
  });

  it("stamps the current signature on every save", () => {
    saveCachedRoom("dev-room", 1, fakeState);
    const raw = window.localStorage.getItem(ROOM_CACHE_PREFIX + "dev-room");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).signature).toBe(ENGINE_SIGNATURE);
  });

  it("clearAllCachedRooms wipes every room save but leaves unrelated keys", () => {
    saveCachedRoom("dev-room", 1, fakeState);
    saveCachedRoom("room-b", 2, fakeState);
    window.localStorage.setItem("unrelated-key", "keep-me");

    clearAllCachedRooms();

    expect(loadCachedRoom("dev-room")).toBeNull();
    expect(loadCachedRoom("room-b")).toBeNull();
    expect(window.localStorage.getItem("unrelated-key")).toBe("keep-me");
  });
});
