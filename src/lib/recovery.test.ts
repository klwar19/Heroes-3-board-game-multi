// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_CACHE_PREFIX } from "./room-cache";
import { escapeToFreshRoom, freshRoomId } from "./recovery";

describe("escapeToFreshRoom", () => {
  let assignSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    window.localStorage.clear();
    originalLocation = window.location;
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignSpy, pathname: "/" }
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("mints a unique room id each call", () => {
    expect(freshRoomId()).not.toBe(freshRoomId());
  });

  it("navigates to a new room id and clears every cached room", () => {
    window.localStorage.setItem(ROOM_CACHE_PREFIX + "dev-room", "x");
    window.localStorage.setItem(ROOM_CACHE_PREFIX + "other", "y");

    escapeToFreshRoom();

    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy.mock.calls[0][0]).toMatch(/^\/\?room=room-/);
    expect(window.localStorage.getItem(ROOM_CACHE_PREFIX + "dev-room")).toBeNull();
    expect(window.localStorage.getItem(ROOM_CACHE_PREFIX + "other")).toBeNull();
  });
});
