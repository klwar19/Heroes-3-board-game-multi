// @vitest-environment jsdom
/**
 * Phone UI mode — the PAGE wiring (the part CSS cannot test in jsdom):
 *  - the pre-game prompt appears on the setup lobby BEFORE the game begins,
 *    takes precedence over the helper-coach prompt, and choosing Computer
 *    leaves the desktop DOM untouched;
 *  - with the per-browser preference on "phone", the adventure map and the
 *    combat table render the `.phoneMode` root + `data-phone-tab` attribute +
 *    the bottom tab bar, and tapping tabs flips the attribute the phone CSS
 *    keys on;
 *  - CONTROL: in computer mode none of that exists — the desktop-unchanged
 *    guarantee.
 * The visual effect of the attribute (panels actually hiding/showing) is a
 * real-browser concern, pinned by tests/e2e/phone-ui-mode.spec.ts.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import {
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  type GameAction,
  type GameState
} from "@/engine";
import type { GameRoomSnapshot, RoomConnectionHandlers } from "@/lib/realtime";
import { UI_MODE_STORAGE_KEY } from "@/lib/ui-mode-preference";
import { HELPER_COACH_STORAGE_KEY } from "@/lib/helper-coach-preference";

const { connectRoomMock, routerPush } = vi.hoisted(() => ({
  connectRoomMock: vi.fn(),
  routerPush: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/music", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/music")>();
  // Only the looping-audio hook is stubbed (jsdom has no real <audio>); the
  // mute store stays real for the MusicToggle in the table menu.
  return { ...original, useBackgroundMusic: vi.fn() };
});
vi.mock("@/lib/lobby-presence-client", () => ({
  sendPresence: vi.fn(async () => undefined),
  leavePresence: vi.fn()
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...original,
    fetchSession: vi.fn(async () => null),
    fetchSocketToken: vi.fn(async () => undefined)
  };
});
vi.mock("@/lib/match-claim-client", () => ({ maybeClaimFinishedMatch: vi.fn() }));
vi.mock("@/lib/performance-metrics", () => ({
  metricNow: () => Date.now(),
  observeBrowserResponsiveness: () => () => {},
  recordPerformanceMetric: vi.fn()
}));
vi.mock("@/lib/realtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...original, connectRoom: connectRoomMock };
});

function snapshotFor(state: GameState): GameRoomSnapshot {
  return {
    roomId: "phone-mode-test",
    version: 1,
    updatedAt: new Date().toISOString(),
    state
  };
}

/** Wire the fake room transport to serve `state` to the page. */
function serveRoom(state: GameState) {
  const snapshot = snapshotFor(state);
  connectRoomMock.mockReset().mockImplementation((_roomId: string, _handlers: RoomConnectionHandlers) => ({
    close: vi.fn(),
    submitAction: vi.fn(async () => ({ version: snapshot.version, errors: [], notices: [] })),
    resetRoom: vi.fn(async () => snapshot),
    fetchSnapshot: vi.fn(async () => snapshot),
    restoreRoom: vi.fn(async () => snapshot),
    fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: snapshot.version })),
    loadSinglePlayerSave: vi.fn(async () => snapshot)
  }));
}

/**
 * Like serveRoom but captures the live handlers so a test can push later
 * snapshots into the page (higher versions the arbiter accepts), simulating a
 * mid-game state change arriving from the server.
 */
function serveRoomCapturing(state: GameState) {
  const snapshot = snapshotFor(state);
  let handlers: RoomConnectionHandlers | null = null;
  connectRoomMock.mockReset().mockImplementation((_roomId: string, given: RoomConnectionHandlers) => {
    handlers = given;
    return {
      close: vi.fn(),
      submitAction: vi.fn(async () => ({ version: snapshot.version, errors: [], notices: [] })),
      resetRoom: vi.fn(async () => snapshot),
      fetchSnapshot: vi.fn(async () => snapshot),
      restoreRoom: vi.fn(async () => snapshot),
    fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: snapshot.version })),
    loadSinglePlayerSave: vi.fn(async () => snapshot)
    };
  });
  return {
    push(next: GameState, version: number) {
      handlers?.onSnapshot({ ...snapshotFor(next), version });
    }
  };
}

/**
 * Deterministically drive the page past its async boot: roomId effect →
 * connect → fetchSnapshot → state → surface mount → the surface's own passive
 * effects (e.g. the prompt's `ready` flip). A real-timer macrotask inside act
 * flushes the promise chain AND the cascaded effects; two rounds cover mounts
 * that themselves schedule work. (findBy* alone races here: an effect queued
 * from an update that lands inside waitFor's act scope only flushes when that
 * scope exits — after the timeout.)
 */
async function settle(rounds = 2) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function mainEl(): HTMLElement {
  const main = document.querySelector("main");
  expect(main, "the table <main>").toBeTruthy();
  return main as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/?room=phone-mode-test");
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  // Keep the coach quiet unless a test is specifically about it.
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
});

afterEach(cleanup);

describe("phone UI mode — adventure map surface", () => {
  it("phone preference: .phoneMode root, data-phone-tab, tab bar; taps flip the attribute", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    serveRoom(createAdventureGameState({ seed: "phone-map", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    const tablist = screen.getByRole("tablist", { name: /screen panels/i });
    const main = mainEl();
    expect(main.className).toContain("phoneMode");
    expect(main.className).toContain("adventureRoot");
    expect(main.getAttribute("data-phone-tab")).toBe("map");

    // The full adventure tab set for a seated player (no open combat → no
    // Battle tab). "End turn" appears because END_TURN is legal for the viewer
    // on their open turn.
    const tabLabels = Array.from(tablist.querySelectorAll(".phoneTabLabel")).map((el) => el.textContent);
    expect(tabLabels).toEqual(["Map", "Hand", "Army", "Decks", "End turn", "Menu"]);

    fireEvent.click(screen.getByRole("tab", { name: /hand/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("hand");
    fireEvent.click(screen.getByRole("tab", { name: /menu/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("menu");
    // The Menu panel's content exists (CSS shows it on this tab): the mode
    // toggle lives there, currently reading "Phone UI".
    expect(screen.getByRole("button", { name: /phone ui/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /map/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("map");

    // "End turn" is a direct thumb ACTION, not a panel: tapping it submits the
    // viewer's END_TURN and the active panel stays where it was.
    fireEvent.click(screen.getByRole("tab", { name: /end turn/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("map");
    const submitAction = connectRoomMock.mock.results[0]?.value.submitAction as ReturnType<typeof vi.fn>;
    expect(
      submitAction.mock.calls.some((call) => (call[0] as GameAction | undefined)?.type === "END_TURN")
    ).toBe(true);
  });

  it("auto-switches to the Map tab when the viewer owes a tile rotation (and not for another seat)", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    const room = serveRoomCapturing(createAdventureGameState({ seed: "phone-rotate", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    const main = mainEl();
    // Start on the map, then the player wanders off to another tab.
    expect(main.getAttribute("data-phone-tab")).toBe("map");
    fireEvent.click(screen.getByRole("tab", { name: /hand/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("hand");

    const tileId = (state: GameState) => Object.keys(state.adventure!.tiles)[0]!;

    // CONTROL: a rotation owed by ANOTHER seat must NOT drag the viewer's tab.
    const othersRotation = createAdventureGameState({ seed: "phone-rotate", rollFirstPlayer: false });
    othersRotation.adventure!.pendingTileChoice = {
      tileInstanceId: tileId(othersRotation),
      playerId: "p2",
      kind: "reveal"
    };
    await act(async () => room.push(othersRotation, 2));
    await settle();
    expect(main.getAttribute("data-phone-tab")).toBe("hand");

    // The viewer (p1) now owes a rotation — the tab snaps back to the map so the
    // on-map rotate card is actually visible (the reported "shows nothing" bug).
    const myRotation = createAdventureGameState({ seed: "phone-rotate", rollFirstPlayer: false });
    myRotation.adventure!.pendingTileChoice = {
      tileInstanceId: tileId(myRotation),
      playerId: "p1",
      kind: "starting"
    };
    await act(async () => room.push(myRotation, 3));
    await settle();
    expect(main.getAttribute("data-phone-tab")).toBe("map");
  });

  it("the Hand tab pulses with the mandatory start-of-turn hand step", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    const state = createAdventureGameState({ seed: "phone-draw", rollFirstPlayer: false });
    // The active seat owes the mandatory hand step — precisely what must pulse.
    expect(state.players[state.activePlayerId]?.canMulligan).toBe(true);
    serveRoom(state);
    render(<Home />);
    await settle();

    screen.getByRole("tablist", { name: /screen panels/i });
    // The default local viewer is p1; only pin the pulse when p1 IS the active
    // seat (the seat that owes the draw). Otherwise pin its absence — the tab
    // must not cry wolf on someone else's turn.
    const handTab = screen.getByRole("tab", { name: /hand/i });
    if (state.activePlayerId === "p1") {
      expect(handTab.className).toContain("attention");
      expect(handTab.querySelector(".phoneTabAttention")?.textContent).toBe("Draw!");
    } else {
      expect(handTab.className).not.toContain("attention");
    }
    // The badge always shows the hand size.
    expect(handTab.querySelector(".phoneTabBadge")?.textContent).toBe(
      String(state.players.p1!.hand.length)
    );
  });

  it("CONTROL — computer preference: no phoneMode class, no tab bar, no data attribute", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureGameState({ seed: "phone-map", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    const main = mainEl();
    expect(main.className).toContain("adventureRoot");
    expect(main.className).not.toContain("phoneMode");
    expect(main.getAttribute("data-phone-tab")).toBeNull();
    expect(screen.queryByRole("tablist", { name: /screen panels/i })).toBeNull();
  });
});

describe("phone UI mode — the pre-game prompt on the setup lobby", () => {
  it("asks BEFORE the game begins, ahead of the coach prompt; Computer keeps the desktop DOM", async () => {
    // Both preferences unanswered — the mode question must come first.
    window.localStorage.removeItem(HELPER_COACH_STORAGE_KEY);
    serveRoom(createAdventureLobbyState({ seed: "phone-lobby" }));
    render(<Home />);
    await settle();

    expect(screen.getByRole("dialog", { name: /choose your screen layout/i })).toBeTruthy();
    // The lobby (not the game) is on screen — this IS "before the game begins".
    expect(mainEl().className).toContain("setupPhase");
    // Precedence: the helper-coach prompt waits its turn.
    expect(screen.queryByRole("dialog", { name: /on-screen helper tips/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /computer mode/i }));
    await settle();
    expect(screen.queryByRole("dialog", { name: /choose your screen layout/i })).toBeNull();
    // Desktop stays desktop…
    expect(mainEl().className).not.toContain("phoneMode");
    // …and only now may the coach ask its own question.
    expect(screen.getByRole("dialog", { name: /on-screen helper tips/i })).toBeTruthy();
  });

  it("choosing Phone in the lobby applies immediately (the lobby gets the phone shell too)", async () => {
    serveRoom(createAdventureLobbyState({ seed: "phone-lobby-2" }));
    render(<Home />);
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /phone mode/i }));
    await settle();
    expect(mainEl().className).toContain("phoneMode");
    // The lobby is a single scrolling column — no tabs until the game begins.
    expect(screen.queryByRole("tablist", { name: /screen panels/i })).toBeNull();
  });
});

describe("phone UI mode — combat surface", () => {
  it("phone preference: Board/Hand/Menu tabs on the combat root; taps flip the attribute", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    serveRoom(createInitialGameState("phone-combat"));
    render(<Home />);
    await settle();

    const tablist = screen.getByRole("tablist", { name: /screen panels/i });
    const main = mainEl();
    expect(main.className).toContain("phoneMode");
    // The combat surface, not the adventure one.
    expect(main.className).not.toContain("adventureRoot");
    expect(main.getAttribute("data-phone-tab")).toBe("board");

    const tabLabels = Array.from(tablist.querySelectorAll(".phoneTabLabel")).map((el) => el.textContent);
    expect(tabLabels).toEqual(["Board", "Hand", "Menu"]);

    fireEvent.click(screen.getByRole("tab", { name: /hand/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("hand");
    fireEvent.click(screen.getByRole("tab", { name: /board/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("board");
  });

  it("a fresh combat id snaps the surface back to the Board tab (not another fight's leftover tab)", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    const first = createInitialGameState("phone-combat");
    const room = serveRoomCapturing(first);
    render(<Home />);
    await settle();

    const main = mainEl();
    expect(main.getAttribute("data-phone-tab")).toBe("board");
    // The player wanders to the Hand tab (reading cards) and leaves it there as
    // the previous fight ends.
    fireEvent.click(screen.getByRole("tab", { name: /hand/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("hand");

    // CONTROL: the SAME combat re-broadcast (same id) must NOT drag the tab —
    // the player is free to keep reading their hand mid-fight.
    const sameFight = createInitialGameState("phone-combat");
    await act(async () => room.push(sameFight, 2));
    await settle();
    expect(main.getAttribute("data-phone-tab")).toBe("hand");

    // A brand-new fight arrives (new combat id) — the surface snaps to the board
    // so the battlefield is what opens, not the leftover Hand tab.
    const nextFight = createInitialGameState("phone-combat");
    nextFight.combat = { ...nextFight.combat!, id: "combat_2" };
    await act(async () => room.push(nextFight, 3));
    await settle();
    expect(main.getAttribute("data-phone-tab")).toBe("board");
  });

  it("arming a board-target card from the Hand tab snaps to the Board tab so the target is clickable", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    // The sandbox seats p1 with Magic Arrow (three enemy targets) castable now.
    serveRoom(createInitialGameState("phone-combat"));
    render(<Home />);
    await settle();

    const main = mainEl();
    expect(main.getAttribute("data-phone-tab")).toBe("board");
    // Go to the Hand tab to pick the spell (jsdom ignores the CSS that hides the
    // board there — the point is the wiring, not the paint).
    fireEvent.click(screen.getByRole("tab", { name: /hand/i }));
    expect(main.getAttribute("data-phone-tab")).toBe("hand");

    // Tapping Magic Arrow arms selectedCardAction (its only completion is a tap
    // on a glowing board target). The card shows as selected…
    const magicArrow = screen.getByTitle(/^Magic Arrow —/i);
    fireEvent.click(magicArrow);
    expect(magicArrow.className).toContain("selected");

    // …and the surface flips to the Board tab so that glowing target is reachable
    // (without the wiring the player would sit on the Hand tab, banner up, board
    // hidden — the reported "click, see nothing").
    expect(main.getAttribute("data-phone-tab")).toBe("board");
  });

  it("CONTROL — computer preference: the combat table renders without any phone chrome", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createInitialGameState("phone-combat"));
    render(<Home />);
    await settle();

    expect(document.querySelector(".battlefield")).toBeTruthy();
    const main = mainEl();
    expect(main.className).not.toContain("phoneMode");
    expect(main.getAttribute("data-phone-tab")).toBeNull();
    expect(screen.queryByRole("tablist", { name: /screen panels/i })).toBeNull();
  });
});

describe("in-game top-row table menu — the box-free variant class", () => {
  // The table-controls panel (`.tableMenu`) is shared by the setup lobby, the
  // Battle Test setup, and the two IN-GAME table screens (map + combat). Only
  // the in-game placements sit in the top-row band beside the HUD, so only they
  // carry `.tableMenuInline` — the hook the desktop CSS keys on to strip EVERY
  // wrapping box (no gem frame, no border/background), leaving the self-styled
  // controls bare in the top band. jsdom cannot compute the CSS, so this pins
  // the class WIRING (present in-game, absent pre-game); the actual box-free
  // paint is a real-browser concern.
  it("the adventure map tags the controls panel with `.tableMenuInline`", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureGameState({ seed: "menu-band-map", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    const menu = document.querySelector(".tableMenu");
    expect(menu, "the table-controls panel").toBeTruthy();
    expect(menu?.classList.contains("tableMenuInline")).toBe(true);
  });

  it("the combat table tags the controls panel with `.tableMenuInline`", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createInitialGameState("menu-band-combat"));
    render(<Home />);
    await settle();

    const menu = document.querySelector(".tableMenu");
    expect(menu, "the table-controls panel").toBeTruthy();
    expect(menu?.classList.contains("tableMenuInline")).toBe(true);
  });

  it("CONTROL — the setup lobby keeps the ornate box (no `.tableMenuInline`)", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureLobbyState({ seed: "menu-band-lobby" }));
    render(<Home />);
    await settle();

    // The lobby is a setup screen…
    expect(mainEl().className).toContain("setupPhase");
    const menu = document.querySelector(".tableMenu");
    // …and still renders the controls panel, but WITHOUT the in-game band hook,
    // so its ornate framed box is left untouched.
    expect(menu, "the table-controls panel").toBeTruthy();
    expect(menu?.classList.contains("tableMenuInline")).toBe(false);
  });
});

describe("in-game table controls — the collapse trigger", () => {
  // Desktop ≥1101px collapses the in-game table controls behind one "Table"
  // trigger (globals.css hides every other child of `.tableMenuInline` until
  // `.controlsOpen`). jsdom cannot compute CSS, so this pins the WIRING the CSS
  // keys on — the trigger, the aria state, the class flip, and the ONE child
  // deliberately exempt from the collapse. The paint is a real-browser concern.
  const toggle = () => document.querySelector<HTMLButtonElement>(".tableControlsToggle");
  const menu = () => document.querySelector(".tableMenu");

  it("the adventure map renders the trigger; clicking flips `.controlsOpen` + aria-expanded", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureGameState({ seed: "controls-toggle-map", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    expect(toggle(), "the Table trigger").toBeTruthy();
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(menu()?.classList.contains("controlsOpen")).toBe(false);

    fireEvent.click(toggle()!);
    await settle();
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(menu()?.classList.contains("controlsOpen")).toBe(true);

    fireEvent.click(toggle()!);
    await settle();
    expect(menu()?.classList.contains("controlsOpen")).toBe(false);
  });

  it("the combat table renders it too, and both screens drop the join-by-ID row", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createInitialGameState("controls-toggle-combat"));
    render(<Home />);
    await settle();

    expect(toggle(), "the Table trigger on the battle screen").toBeTruthy();
    // The room-ID field is lobby chrome: in-game the invite link inside the Room
    // panel is the way to share a table, so the row is gone from the band.
    expect(document.querySelector(".tableMenu .roomRow")).toBeNull();
  });

  it("a LOCKED room keeps its password gate out of the collapse (`.roomPasswordRow`)", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    const locked = createAdventureGameState({ seed: "controls-toggle-locked", rollFirstPlayer: false });
    // A joiner following a direct link into a running, password-protected room:
    // room has a hash, and this browser is not a member yet.
    locked.room = { ...(locked.room ?? { members: [] }), passwordHash: "hash", members: [] } as GameState["room"];
    serveRoom(locked);
    render(<Home />);
    await settle();

    const gate = document.querySelector('.tableMenu [aria-label="Room password"]');
    expect(gate, "the password gate").toBeTruthy();
    // The class the collapse rule excludes — without it the one control this
    // viewer must reach would be hidden behind the "Table" trigger.
    expect(gate?.classList.contains("roomPasswordRow")).toBe(true);
    expect(menu()?.classList.contains("controlsOpen"), "still collapsed").toBe(false);
  });

  it("CONTROL — the setup lobby renders no trigger (nothing is collapsed pre-game)", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureLobbyState({ seed: "controls-toggle-lobby" }));
    render(<Home />);
    await settle();

    expect(toggle()).toBeNull();
    expect(document.querySelector(".tableMenu .roomRow"), "the lobby keeps join-by-ID").toBeTruthy();
  });
});

describe("hand-step directives banner — the mandatory start-of-turn draw", () => {
  // The draw/mulligan/discard controls must live OUTSIDE the one-line hand
  // header (`.handTopBar`): the desktop HUD anchors `.handDirectives` as a
  // fixed banner above the tray, and inside the header the hand cards used to
  // paint OVER the mandatory "Draw new" button, leaving it unclickable. jsdom
  // cannot compute the fixed positioning — this pins the DOM contract the CSS
  // keys on (container outside the header + `.mandatory` while the draw is
  // owed), the visible half lives in the Playwright screenshots.
  it("renders `.handDirectives.mandatory` outside the hand header with the Draw button inside", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    const state = createAdventureGameState({ seed: "banner-draw", rollFirstPlayer: false });
    expect(state.activePlayerId).toBe("p1");
    expect(state.players.p1?.canMulligan).toBe(true);
    serveRoom(state);
    render(<Home />);
    await settle();

    const banner = mainEl().querySelector(".handDirectives");
    expect(banner, "the directives banner").toBeTruthy();
    expect(banner?.classList.contains("mandatory")).toBe(true);
    // Outside the header — the fixed desktop anchor depends on it.
    expect(banner?.closest(".handTopBar")).toBeNull();
    expect(banner?.querySelector(".handDirectivesTitle")?.textContent).toMatch(/Start of turn/i);
    const draw = Array.from(banner?.querySelectorAll("button") ?? []).find((button) =>
      /Draw new/.test(button.textContent ?? "")
    );
    expect(draw, "the mandatory Draw button inside the banner").toBeTruthy();
    // The header itself holds ONLY the hand-size plaque now.
    expect(mainEl().querySelector(".handTopBar")?.querySelector("button")).toBeNull();
  });

  it("CONTROL — with the draw already taken the banner is gone", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    const state = createAdventureGameState({ seed: "banner-draw-done", rollFirstPlayer: false });
    // The flag that owes the draw is what mounts the banner — clear it.
    state.players.p1!.canMulligan = false;
    state.players.p1!.canOpeningMulligan = false;
    serveRoom(state);
    render(<Home />);
    await settle();

    expect(mainEl().querySelector(".handDirectives")).toBeNull();
  });
});

describe("left command rail — the full-panel overflow escape hatch", () => {
  // The 218px desktop rail scrolls, so its lower stations (morale, VP,
  // opponents) can sit below the fold. "View all" promotes the SAME live rail
  // content into a centred panel. jsdom cannot compute CSS, so this pins the
  // WIRING the CSS keys on: the header lives directly inside `.leftRail` (the
  // sticky rule uses a child selector), the class + aria state flip, the
  // click-to-close backdrop mounts only while expanded, and Escape defers to a
  // stacked window instead of closing two levels at once. The paint (fixed
  // panel, sticky header, the ≥1101px gating that hides the trigger) is a
  // real-browser concern.
  const header = () => mainEl().querySelector(".leftRail > .leftRailToolbar");
  const trigger = () => mainEl().querySelector<HTMLButtonElement>(".leftRailExpandButton");
  const rail = () => mainEl().querySelector(".leftRail");
  const backdrop = () => mainEl().querySelector(".leftRailExpandedBackdrop");

  it("the trigger flips `.leftRailExpanded` + aria-expanded and mounts the backdrop", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureGameState({ seed: "rail-expand", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    // Direct child of the rail — the sticky-header rule is `> .leftRailToolbar`.
    expect(header(), "the rail header inside .leftRail").toBeTruthy();
    expect(trigger(), "the View all trigger").toBeTruthy();
    expect(trigger()?.getAttribute("aria-expanded")).toBe("false");
    expect(rail()?.classList.contains("leftRailExpanded")).toBe(false);
    expect(backdrop(), "no backdrop while compact").toBeNull();

    fireEvent.click(trigger()!);
    await settle();
    expect(rail()?.classList.contains("leftRailExpanded")).toBe(true);
    expect(trigger()?.getAttribute("aria-expanded")).toBe("true");
    expect(rail()?.getAttribute("role")).toBe("dialog");
    expect(backdrop(), "the click-to-close backdrop").toBeTruthy();

    // Clicking the backdrop closes it (the same state the trigger toggles).
    fireEvent.click(backdrop()!);
    await settle();
    expect(rail()?.classList.contains("leftRailExpanded")).toBe(false);
    expect(backdrop()).toBeNull();
  });

  it("Escape closes the panel — but DEFERS while a window is stacked above it", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createAdventureGameState({ seed: "rail-expand-escape", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    fireEvent.click(trigger()!);
    await settle();
    expect(rail()?.classList.contains("leftRailExpanded")).toBe(true);

    // A window opened FROM the panel owns the Escape (the SetupHubWindow rule):
    // closing both at once would throw the player back two levels.
    const stacked = document.createElement("div");
    stacked.className = "modalBackdrop townWindowBackdrop";
    document.body.appendChild(stacked);
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(rail()?.classList.contains("leftRailExpanded"), "still open behind the window").toBe(true);

    stacked.remove();
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(rail()?.classList.contains("leftRailExpanded")).toBe(false);
  });

  it("CONTROL — phone mode renders the rail with no header and no trigger surface", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    serveRoom(createAdventureGameState({ seed: "rail-expand-phone", rollFirstPlayer: false }));
    render(<Home />);
    await settle();

    expect(mainEl().classList.contains("phoneMode"), "the phone shell").toBe(true);
    // The rail itself still exists (the Army tab shows it); only the desktop
    // escape hatch is inert — CSS hides the header, so nothing can expand.
    expect(rail(), "the rail is still in the DOM").toBeTruthy();
    expect(rail()?.classList.contains("leftRailExpanded")).toBe(false);
    expect(backdrop()).toBeNull();
  });

  it("CONTROL — the combat table has no command rail at all", async () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    serveRoom(createInitialGameState("rail-expand-combat"));
    render(<Home />);
    await settle();

    expect(mainEl().querySelector(".leftRail")).toBeNull();
    expect(mainEl().querySelector(".leftRailExpandButton")).toBeNull();
  });
});
