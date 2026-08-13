// @vitest-environment jsdom
/**
 * The REAL page, a live PvP prep window, and the reported shopping spree —
 * buy a unit → buy another → upgrade → buy spells → resolve the Search from
 * the visible UI → keep shopping → accept.
 *
 * USER REPORT (repeated): "when attacked by another player I can only buy 1
 * unit, then can't buy another or upgrade, can't do both units and spells."
 * The engine halves are pinned in population-token-combat-prep.test.ts (the
 * token) and pvp-prep-simultaneous-shopping.test.ts (the opponent's open
 * Search/visit no longer freezing the shopper). This file pins the CLIENT
 * pipeline end-to-end: unlike the other page-mount tests, the mock room
 * actually APPLIES every submitted action through the engine and pushes the
 * new snapshot, so ingest → legalActions → panel re-render runs for every
 * step of the spree — a button that dies after the first purchase, a Search
 * modal that never shows, or a rejected second buy all fail here.
 *
 * jsdom cannot compute CSS: this proves the DOM/dispatch contract only.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { applyAction, createAdventureGameState, getMainHero } from "@/engine";
import type { GameAction, GameState } from "@/engine/state";
import type { GameRoomSnapshot } from "@/lib/realtime";
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
  return { ...original, useBackgroundMusic: vi.fn() };
});
vi.mock("@/lib/lobby-presence-client", () => ({
  sendPresence: vi.fn(async () => undefined),
  leavePresence: vi.fn()
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth-client")>();
  return { ...original, fetchSession: vi.fn(async () => null), fetchSocketToken: vi.fn(async () => undefined) };
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

const GAME_ACTIONS = new Set([
  "POPULATION_ACTION",
  "SPELL_BOOK_ACTION",
  "BUILD_STRUCTURE",
  "CHOOSE_OPTION",
  "RESOLVE_DECK_SEARCH",
  "ACCEPT_COMBAT",
  "MOVE_HERO"
]);

type LiveRoom = {
  gameErrors: string[];
  submitted: GameAction[];
  state: () => GameState;
};

function serveLiveRoom(initial: GameState): LiveRoom {
  let current = initial;
  let version = 1;
  let handlers: { onSnapshot: (s: GameRoomSnapshot, meta?: unknown) => void } | null = null;
  const gameErrors: string[] = [];
  const submitted: GameAction[] = [];
  const snapshot = (): GameRoomSnapshot => ({
    roomId: "prep-shop-test",
    version,
    updatedAt: new Date().toISOString(),
    state: current
  });
  connectRoomMock.mockReset().mockImplementation((...args: unknown[]) => {
    handlers = args.find(
      (arg): arg is { onSnapshot: (s: GameRoomSnapshot) => void } =>
        Boolean(arg) && typeof arg === "object" && "onSnapshot" in (arg as object)
    ) ?? null;
    return {
      close: vi.fn(),
      submitAction: async (action: GameAction) => {
        submitted.push(action);
        const result = applyAction(current, action);
        if (result.errors.length === 0) {
          current = result.state;
          version += 1;
          handlers?.onSnapshot(snapshot(), { seatAuthoritative: true });
          return { version, errors: [], notices: [] };
        }
        if (GAME_ACTIONS.has(action.type)) {
          gameErrors.push(`${action.type}: ${result.errors.map((e) => e.message).join("; ")}`);
        }
        return { version, errors: result.errors, notices: [] };
      },
      resetRoom: vi.fn(async () => snapshot()),
      fetchSnapshot: vi.fn(async () => snapshot()),
      restoreRoom: vi.fn(async () => snapshot()),
      fetchSinglePlayerSave: vi.fn(async () => ({ state: current, version })),
      loadSinglePlayerSave: vi.fn(async () => snapshot())
    };
  });
  return { gameErrors, submitted, state: () => current };
}

async function settle(rounds = 3) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** A live PvP prep: p2 attacked p1 (the viewer/defender, Castle, full shops). */
function prepSnapshot(): GameState {
  const state = createAdventureGameState({
    startingBuildings: [],
    seed: "page-prep-shop",
    ruleset: "binh",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.towns.town_p1.buildings = [
    ...new Set([
      ...state.towns.town_p1.buildings,
      "castle.dwelling_bronze",
      "castle.citadel",
      "castle.mage_guild"
    ])
  ];
  state.players.p1.mageGuildBuiltRound = 0;
  state.players.p1.army = state.players.p1.army.filter(
    (unit) => unit.unitDefId !== "castle.marksmen" && unit.unitDefId !== "castle.griffins"
  );
  state.players.p1.resources.gold = 200;
  state.players.p2.resources.gold = 200;
  const p1Field = getMainHero(state, "p1")!.spaceId!;
  getMainHero(state, "p2")!.spaceId = "h:9:2";
  state.adventure!.lastVisitedField.hero_p1 = p1Field;
  state.adventure!.lastVisitedField.hero_p2 = "h:9:2";
  for (const hero of Object.values(state.heroes)) {
    hero.movementPoints = 5;
    hero.movementHaltedThisTurn = false;
  }
  state.activePlayerId = "p2";
  const attacked = applyAction(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
  expect(attacked.errors).toEqual([]);
  expect(attacked.state.combat?.prep?.accepted).toEqual([]);
  return attacked.state;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/?room=prep-shop-test");
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});

afterEach(cleanup);

function prepButtons(): string[] {
  return Array.from(document.querySelectorAll(".prepTownActions button, .preBattlePanel button")).map(
    (button) => (button as HTMLButtonElement).textContent ?? ""
  );
}

async function clickButton(pattern: RegExp) {
  const all = Array.from(document.querySelectorAll("button"));
  const target = all.find((button) => pattern.test(button.textContent ?? ""));
  expect(target, `button matching ${pattern} exists; have:\n` + prepButtons().join("\n")).toBeTruthy();
  await act(async () => {
    fireEvent.click(target!);
  });
  await settle();
}

describe("REAL PAGE: attacked defender's shopping spree in the prep window", () => {
  it("buy → buy again → upgrade → buy spells → resolve search → keep shopping → accept", async () => {
    const room = serveLiveRoom(prepSnapshot());
    render(<Home />);
    await settle(4);

    // The map screen with the prep panel is up for the defender p1.
    expect(document.querySelector(".preBattlePanel"), "PreBattlePanel renders").toBeTruthy();
    expect(document.querySelector(".prepTownActions"), "in-context shopping section renders").toBeTruthy();

    // 1. Buy unit #1.
    await clickButton(/Recruit few Marksmen/i);
    expect(room.gameErrors, room.gameErrors.join("\n")).toEqual([]);
    expect(room.state().players.p1.army.some((u) => u.unitDefId === "castle.marksmen")).toBe(true);

    // 2. The panel STILL offers the second buy and the upgrade.
    expect(
      prepButtons().some((label) => /Recruit few Griffins/i.test(label)),
      "second recruit still offered after the first buy; have:\n" + prepButtons().join("\n")
    ).toBe(true);

    // 3. Upgrade the just-bought unit.
    await clickButton(/Reinforce Marksmen to a pack/i);
    expect(room.gameErrors, room.gameErrors.join("\n")).toEqual([]);
    expect(room.state().players.p1.army.find((u) => u.unitDefId === "castle.marksmen")?.side).toBe("pack");

    // 4. Buy spells.
    await clickButton(/gold: Buy spell — search/i);
    expect(room.gameErrors, room.gameErrors.join("\n")).toEqual([]);

    // 5. The deck-pick / search choice must be VISIBLE and resolvable on this screen.
    let guard = 0;
    while (room.state().pendingChoice && guard++ < 8) {
      const stateNow = room.state();
      const choice = stateNow.pendingChoice!;
      // Find any button whose click resolves the open choice (search mode pick or keep).
      const all = Array.from(document.querySelectorAll("button"));
      const searchButton = all.find((button) =>
        /Search \(\d\)|Take the top discard|^Keep /i.test(button.textContent ?? "")
      );
      expect(
        searchButton,
        `the open ${choice.type} choice has a visible button; page buttons:\n` +
          all.map((b) => b.textContent).join("\n")
      ).toBeTruthy();
      await act(async () => {
        fireEvent.click(searchButton!);
      });
      await settle();
    }
    expect(room.state().pendingChoice ?? null, "search fully resolved from the UI").toBeNull();
    expect(room.gameErrors, room.gameErrors.join("\n")).toEqual([]);

    // 6. STILL shopping after the spell purchase.
    expect(
      prepButtons().some((label) => /Recruit few Griffins/i.test(label)),
      "recruit still offered AFTER the spell buy; have:\n" + prepButtons().join("\n")
    ).toBe(true);
    await clickButton(/Recruit few Griffins/i);
    expect(room.gameErrors, room.gameErrors.join("\n")).toEqual([]);
    expect(room.state().players.p1.army.some((u) => u.unitDefId === "castle.griffins")).toBe(true);

    // 7. Accept the battle.
    await clickButton(/Accept the battle/i);
    expect(room.gameErrors, room.gameErrors.join("\n")).toEqual([]);
    expect(room.state().combat?.prep?.accepted).toContain("p1");
  }, 30000);
});
