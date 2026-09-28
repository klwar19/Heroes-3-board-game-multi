// @vitest-environment jsdom
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HEX_BATTLE_SPEED_STORAGE_KEY,
  HEX_SPEED_DEFAULTS,
  getHexBattleSpeed,
  resetHexBattleSpeedCacheForTests,
  sanitizeHexBattleSpeed,
  setHexBattleSpeed,
  useHexBattleSpeed
} from "./hex-battle-speed";
import { HexBattleOptions } from "@/components/table/hex-battle-options";
import { hexMovePlan } from "@/data/battle-hex/creature-sprites";

beforeEach(() => {
  window.localStorage.clear();
  resetHexBattleSpeedCacheForTests();
});

afterEach(() => {
  window.localStorage.clear();
  resetHexBattleSpeedCacheForTests();
});

const tokenWalkMs = () => hexMovePlan({ steps: 3, distance: 3, flying: false, teleport: false }).legsMs;

describe("hex battle speed preference", () => {
  it("defaults to fast moves and calm blows / hits until the player changes it", () => {
    expect(getHexBattleSpeed()).toEqual({ move: 3, attack: 1.25, reaction: 1.25 });
    expect(getHexBattleSpeed()).toEqual(HEX_SPEED_DEFAULTS);
  });

  it("persists each channel under the storage key and reads it back after a reload", () => {
    setHexBattleSpeed({ attack: 2.5 });
    expect(JSON.parse(window.localStorage.getItem(HEX_BATTLE_SPEED_STORAGE_KEY) ?? "{}")).toEqual({
      move: 3,
      attack: 2.5,
      reaction: 1.25
    });
    resetHexBattleSpeedCacheForTests();
    expect(getHexBattleSpeed().attack).toBe(2.5);
  });

  it("repairs a bad stored value: out-of-range speeds clamp, missing or broken ones fall back", () => {
    expect(sanitizeHexBattleSpeed({ move: 99, attack: 0, reaction: "fast" })).toEqual({ move: 5, attack: 1, reaction: 1.25 });
    // Attacks stop at the PC's fast speed (a phased shot's 120 ms launch must
    // fit before its release beat); moves and reactions go up to 5 (CONTROL).
    expect(sanitizeHexBattleSpeed({ move: 5, attack: 5, reaction: 5 })).toEqual({ move: 5, attack: 3, reaction: 5 });
    window.localStorage.setItem(HEX_BATTLE_SPEED_STORAGE_KEY, "{not json");
    expect(getHexBattleSpeed()).toEqual(HEX_SPEED_DEFAULTS);
  });

  it("the hook hydrates the stored pace and updates every subscriber in this tab", () => {
    setHexBattleSpeed({ move: 2 });
    const { result } = renderHook(() => useHexBattleSpeed());
    expect(result.current.ready).toBe(true);
    expect(result.current.speed.move).toBe(2);
    const { result: other } = renderHook(() => useHexBattleSpeed());
    act(() => result.current.setSpeed({ move: 4 }));
    expect(other.current.speed.move).toBe(4);
    expect(getHexBattleSpeed().move).toBe(4);
  });
});

describe("battle bar Options panel", () => {
  it("a preset changes the pace the board animates at (CONTROL: the default walk)", () => {
    const { container, getByRole } = render(createElement(HexBattleOptions));
    const defaultWalk = tokenWalkMs();
    expect(defaultWalk).toBeCloseTo(500, 6);
    fireEvent.click(container.querySelector(".hexBarButton.options")!);
    fireEvent.click(getByRole("button", { name: "Slow" }));
    expect(getHexBattleSpeed()).toEqual({ move: 1, attack: 1, reaction: 1 });
    expect(tokenWalkMs()).toBeCloseTo(1500, 6);
    expect(getByRole("button", { name: "Slow" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("each slider sets only its own channel, on the PC speed stops", () => {
    const { container } = render(createElement(HexBattleOptions));
    fireEvent.click(container.querySelector(".hexBarButton.options")!);
    const sliders = container.querySelectorAll<HTMLInputElement>(".hexSpeedRow input[type=range]");
    expect(sliders).toHaveLength(3);
    // Movement offers every stop up to 5; Attacks stop at 3 (6 stops).
    expect(sliders[0].max).toBe("7");
    expect(sliders[1].max).toBe("5");
    // Stops: 1, 1.25, 1.5, 2, 2.5, 3, 4, 5 — index 3 is the PC's normal speed.
    fireEvent.change(sliders[1], { target: { value: "3" } });
    expect(getHexBattleSpeed()).toEqual({ move: 3, attack: 2, reaction: 1.25 });
    expect(container.querySelectorAll(".hexSpeedRow output")[1].textContent).toBe("×2 · PC normal");
  });

  it("closes on Escape", () => {
    const { container } = render(createElement(HexBattleOptions));
    fireEvent.click(container.querySelector(".hexBarButton.options")!);
    expect(container.querySelector(".hexSpeedPanel")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".hexSpeedPanel")).toBeNull();
  });
});
