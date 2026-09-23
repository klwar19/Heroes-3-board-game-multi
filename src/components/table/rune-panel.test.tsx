// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInitialGameState } from "@/engine";
import type { GameState } from "@/engine/state";
import { RunePanel } from "./rune-panel";

/**
 * Bulwark Rune tracker panel (combat right rail), drawn as the printed board.
 * Everything shown comes from the engine's `getRuneTrack`: the cube on the
 * main-track slot matching the Runes on the track, a seal on each earned
 * Level's "9" box (the next one lit, beyond-cap ones locked), and the reserve tray.
 */
describe("RunePanel — Bulwark Rune tracker", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  function bulwarkCombat(buildings: string[], runes: { count: number; reserve: number; appliedLevel: number }): GameState {
    const state = createInitialGameState("rune-panel-ui");
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.towns.town_p1.buildings.push(...buildings);
    state.combat!.runes = { p1: runes };
    return state;
  }

  it("places the track cube, the level seals and the reserve cubes on the board", () => {
    // Sieidi built (cap 2), Level 2 already earned, 3 Runes on the fresh track, 10 in reserve.
    const state = bulwarkCombat(["bulwark.sieidi"], { count: 3, reserve: 10, appliedLevel: 2 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);

    expect(screen.getByLabelText(/Runes for .*: track 3 of 9, reserve 10, level 2 of 2/i)).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Rune Level 1: \+1 Attack .* earned this combat$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Rune Level 2: \+3 Speed .* earned this combat$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Rune Level 3: \+1 Defense .* locked \(build the Altar/ })).toBeTruthy();

    // One cube, on slot 3's measured centre of the printed track; slots 1-2 lit as passed.
    const cubes = container.querySelectorAll<HTMLElement>(".runeBoardCube");
    expect(cubes).toHaveLength(1);
    expect(cubes[0].style.left).toBe("35.31%");
    expect(cubes[0].title).toBe("Main track: 3 of 9 Runes");
    expect(container.querySelectorAll(".runeBoardPassed")).toHaveLength(2);
    expect(container.querySelectorAll(".runeBoardLevel.active .runeBoardSeal")).toHaveLength(2);
    expect(container.querySelectorAll(".runeBoardLevel.locked .runeBoardLock")).toHaveLength(1);
    expect(container.querySelector(".runeBoardLevel.next")).toBeNull();
    expect(container.querySelectorAll(".runeReserveCube")).toHaveLength(10);
    expect(container.querySelector(".runeReserveCount")?.textContent).toBe("10");
    expect(container.querySelector(".runeReserveTray.stocked")).toBeTruthy();
    // Docked by default on desktop: no floating window styling.
    expect(container.querySelector(".runePanel.docked")).toBeTruthy();
  });

  it("lights the next threshold box and leaves an empty reserve unstocked", () => {
    const state = bulwarkCombat(["bulwark.sieidi"], { count: 4, reserve: 0, appliedLevel: 1 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelectorAll(".runeBoardLevel.active")).toHaveLength(1);
    const next = container.querySelectorAll(".runeBoardLevel.pending.next");
    expect(next).toHaveLength(1);
    expect(next[0].getAttribute("aria-label")).toMatch(/^Rune Level 2:/);
    expect(container.querySelectorAll(".runeBoardLevel.locked")).toHaveLength(1);
    expect(container.querySelector<HTMLElement>(".runeBoardCube")?.style.left).toBe("44.69%");
    expect(container.querySelectorAll(".runeReserveCube")).toHaveLength(0);
    expect(container.querySelector(".runeReserveTray.stocked")).toBeNull();
    expect(screen.getByText("5 more Runes to Level 2")).toBeTruthy();
  });

  it("shows no cube on an empty track and rests a full capped track on the emblem past slot 8", () => {
    const empty = bulwarkCombat([], { count: 0, reserve: 0, appliedLevel: 0 });
    const first = render(<RunePanel state={empty} viewerPlayerId="p1" />);
    expect(first.container.querySelector(".runeBoardCube")).toBeNull();
    expect(first.container.querySelector(".runeBoardLevel.next")?.getAttribute("aria-label")).toMatch(/^Rune Level 1:/);
    cleanup();

    // No rune building: capped at Level 1, which is earned, and the track has refilled to nine.
    const full = bulwarkCombat([], { count: 9, reserve: 5, appliedLevel: 1 });
    const { container } = render(<RunePanel state={full} viewerPlayerId="p1" />);
    expect(container.querySelector<HTMLElement>(".runeBoardCube")?.style.left).toBe("91.38%");
    expect(container.querySelectorAll(".runeBoardPassed")).toHaveLength(8);
    expect(container.querySelector(".runeBoardLevel.next")).toBeNull();
    expect(container.querySelectorAll(".runeBoardLevel.locked")).toHaveLength(2);
    expect(screen.getByText("Level 1 is your cap — the track now only banks spendable Runes")).toBeTruthy();
  });

  it("minimizes to the one-line readout and expands again", () => {
    const state = bulwarkCombat(["bulwark.sieidi", "bulwark.altar"], { count: 2, reserve: 5, appliedLevel: 1 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".runePanelBody")).toBeTruthy();
    expect(container.querySelector(".runePanelSummary")?.textContent).toBe("2/9 · R5 · Lv 1/3");

    fireEvent.click(screen.getByRole("button", { name: "Minimize the Rune tracker" }));
    expect(container.querySelector(".runePanelBody")).toBeNull();
    expect(container.querySelector(".runePanel.minimized")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand the Rune tracker" }));
    expect(container.querySelector(".runePanelBody")).toBeTruthy();
  });

  it("pops out as a floating window in <body> and docks back", () => {
    const state = bulwarkCombat([], { count: 0, reserve: 0, appliedLevel: 0 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".runePanel.docked")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pop out the Rune tracker" }));
    // Floating windows portal to <body> so no ancestor can trap or clip them.
    expect(container.querySelector(".runePanel")).toBeNull();
    expect(document.body.querySelector(":scope > .runePanel.floating")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dock the Rune tracker" }));
    expect(container.querySelector(".runePanel.docked")).toBeTruthy();
    expect(document.body.querySelector(":scope > .runePanel.floating")).toBeNull();
  });

  it("drags the docked panel out of the rail by its header and remembers where it was dropped", () => {
    const state = bulwarkCombat([], { count: 2, reserve: 0, appliedLevel: 0 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    const head = container.querySelector(".runePanelHead")!;

    // A press that barely moves is a click, not a drag: still docked.
    fireEvent.pointerDown(head, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 103, clientY: 101 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 103, clientY: 101 });
    expect(container.querySelector(".runePanel.docked")).toBeTruthy();

    fireEvent.pointerDown(head, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 400, clientY: 300 });
    const floating = document.body.querySelector<HTMLElement>(":scope > .runePanel.floating.dragging");
    expect(floating).toBeTruthy();
    // jsdom lays the docked panel out at 0,0, so it lands at the pointer delta.
    expect(floating!.style.left).toBe("300px");
    expect(floating!.style.top).toBe("200px");
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 420, clientY: 330 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 420, clientY: 330 });
    expect(document.body.querySelector(".runePanel.dragging")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("homm3bg.runePanel") ?? "{}")).toMatchObject({
      floating: true,
      pos: { x: 320, y: 230 }
    });
    // The preference store is module-level: dock back so later tests start docked.
    fireEvent.click(screen.getByRole("button", { name: "Dock the Rune tracker" }));
  });

  it("on the phone layout it floats and starts minimized so the board stays clear", () => {
    const state = bulwarkCombat(["bulwark.sieidi"], { count: 6, reserve: 0, appliedLevel: 0 });
    render(<RunePanel phone state={state} viewerPlayerId="p1" />);
    expect(document.body.querySelector(".runePanel.floating.phone.minimized")).toBeTruthy();
    expect(document.body.querySelector(".runePanelBody")).toBeNull();
    // No dock/pop-out toggle on the phone — only the expand control.
    expect(screen.queryByRole("button", { name: /Pop out|Dock/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand the Rune tracker" }));
    expect(document.body.querySelector<HTMLElement>(".runeBoardCube")?.style.left).toBe("63.44%");
  });

  it("renders nothing when no Bulwark player is in the fight", () => {
    const state = createInitialGameState("rune-panel-none");
    state.players.p1.factionId = "castle";
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.firstChild).toBeNull();
  });
});
