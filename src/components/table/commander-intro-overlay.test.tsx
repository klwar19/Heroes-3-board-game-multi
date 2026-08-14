// @vitest-environment jsdom
/**
 * WOG Commanders intro popup — DOM contract only.
 *
 * jsdom cannot compute CSS, so nothing here proves the card is big, centered or
 * on top of anything; it reuses the level-up modal's committed classes and that
 * overlay's documented z-index slot, and the visible half is a real-browser
 * concern with no e2e spec. What IS pinned: WHEN it renders, that it states BOTH
 * halves of the rule, that one click dismisses it, and that it never re-shows for
 * the same game id.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialGameState } from "@/engine";
import type { GameState } from "@/engine/state";
import { CommanderIntroOverlay, commanderIntroSeen, markCommanderIntroSeen } from "./commander-intro-overlay";

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };

function stateWithCommander(id = "game-1", speed = 0): GameState {
  const state = createInitialGameState();
  state.id = id;
  state.wog = { ...WOG_ON };
  state.players.p1.commander = {
    slug: "paladin",
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed }
  };
  return state;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Commanders intro popup", () => {
  it("pops for a seat that owns a commander and states BOTH halves of the rule", () => {
    render(<CommanderIntroOverlay state={stateWithCommander()} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /how your commander is placed/i });
    const text = dialog.textContent ?? "";
    // Half 1: auto-placed until the Speed grade is raised.
    expect(text).toMatch(/placed automatically/i);
    // Half 2: raising Speed once unlocks placing/sorting it yourself, always.
    expect(text).toMatch(/Speed/);
    expect(text).toMatch(/always arranged together with your units/i);
    // ...and the ability-only front-line buff.
    expect(text).toMatch(/\+2 Speed/);
    expect(text).toMatch(/front line/i);
    // It portals to <body>, like the level-up modal it shares chrome with.
    expect(dialog.parentElement).toBe(document.body);
  });

  it("reports the viewer's CURRENT Speed grade (auto-placed vs already yours)", () => {
    render(<CommanderIntroOverlay state={stateWithCommander("g-locked", 0)} viewerPlayerId="p1" />);
    expect(screen.getByRole("dialog").textContent).toMatch(/Speed grade is 0/);
    cleanup();
    render(<CommanderIntroOverlay state={stateWithCommander("g-unlocked", 2)} viewerPlayerId="p1" />);
    expect(screen.getByRole("dialog").textContent).toMatch(/Speed grade is 2/);
    expect(screen.getByRole("dialog").textContent).toMatch(/already place it yourself/i);
  });

  it("one click dismisses it and it never returns for the same game", () => {
    const state = stateWithCommander("g-dismiss");
    const { unmount } = render(<CommanderIntroOverlay state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(commanderIntroSeen("g-dismiss")).toBe(true);

    // A remount (reload / reconnect) shows nothing.
    unmount();
    render(<CommanderIntroOverlay state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a DIFFERENT game id (a rematch) shows it again", () => {
    markCommanderIntroSeen("g-old");
    render(<CommanderIntroOverlay state={stateWithCommander("g-new")} viewerPlayerId="p1" />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("CONTROL: renders NOTHING with the module off, without a commander, or for an observer", () => {
    const off = stateWithCommander("g-off");
    off.wog = { enabled: false, commanders: false, newObjects: false, newCreatures: false, artifacts: false };
    render(<CommanderIntroOverlay state={off} viewerPlayerId="p1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    const noCommander = stateWithCommander("g-none");
    delete noCommander.players.p1.commander;
    render(<CommanderIntroOverlay state={noCommander} viewerPlayerId="p1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    render(<CommanderIntroOverlay state={stateWithCommander("g-observer")} viewerPlayerId={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the SERVER frame emits nothing (the snapshot is 'already seen')", () => {
    // localStorage is client-only, so the SSR/hydration render must not emit the
    // dialog — it appears on the next client render instead.
    const html = renderToStaticMarkup(<CommanderIntroOverlay state={stateWithCommander("g-ssr")} viewerPlayerId="p1" />);
    expect(html).toBe("");
  });

  it("dismissing in ANOTHER tab closes this one (the storage subscription)", () => {
    render(<CommanderIntroOverlay state={stateWithCommander("g-tabs")} viewerPlayerId="p1" />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => {
      // Another TAB wrote the key: only the storage event reaches this tab (the
      // same-tab CustomEvent never crosses a tab boundary), so this pins the
      // storage subscription specifically.
      window.localStorage.setItem("binh-commander-intro", JSON.stringify(["g-tabs"]));
      window.dispatchEvent(new StorageEvent("storage"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("CONTROL: a seat WITHOUT a commander in a commanders game is not shown it", () => {
    const state = stateWithCommander("g-seatless");
    render(<CommanderIntroOverlay state={state} viewerPlayerId="p2" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
