// @vitest-environment jsdom
/**
 * Ash's Bloodlust IV — the card can really be CLICKED AND USED in battle.
 *
 * USER REPORT (2026-08-12): "make sure Ash IV can be clicked and used in
 * battle, before, it could not be done." The engine offer is pinned in
 * `ash-bloodlust-specialty.test.ts` (including the hosted/redacted frame), but
 * an engine offer with no working click surface is exactly the "engine offers
 * existed with no UI surface" bug this repo keeps shipping (the Polish Wait /
 * Surrender / Arrow-Tower precedents). This file drives the REAL page:
 * hand card click → board targeting armed → battle-cell click → the exact
 * PLAY_CARD action submitted to the room connection.
 *
 * jsdom cannot compute CSS, so nothing here proves the glow is VISIBLE — only
 * the DOM/dispatch contract (clickable elements exist and send the engine's own
 * action). The printed ground-or-flying gate is the CONTROL: with a RANGED-only
 * line the card is correctly not playable at all.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import {
  createAdventureGameState,
  getMainHero,
  makeCombatUnitFromArmy,
  unitSideRuleOverrides,
  NEUTRAL_PLAYER_ID,
  type CombatState,
  type GameState
} from "@/engine";
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

function serveRoom(state: GameState) {
  const snapshot: GameRoomSnapshot = {
    roomId: "ash-bloodlust-test",
    version: 1,
    updatedAt: new Date().toISOString(),
    state
  };
  const submitAction = vi.fn(async (_action: unknown) => ({ version: 1, errors: [], notices: [] }));
  connectRoomMock.mockReset().mockImplementation(() => ({
    close: vi.fn(),
    submitAction,
    resetRoom: vi.fn(async () => snapshot),
    fetchSnapshot: vi.fn(async () => snapshot),
    restoreRoom: vi.fn(async () => snapshot),
    fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: 1 })),
    loadSinglePlayerSave: vi.fn(async () => snapshot)
  }));
  return submitAction;
}

async function settle(rounds = 2) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * A real p1-vs-neutral combat on the p1 unit's OWN activation — the window an
 * "ongoing, for this Combat" card is played in — with Bloodlust IV in hand.
 */
function combatWithAshIV(unitType: "ground" | "ranged" = "ground"): GameState {
  const state = createAdventureGameState({
    seed: "page-ash-bloodlust",
    rollFirstPlayer: false,
    startingBuildings: [],
    events: false,
    ruleset: "legacy"
  });
  const player = state.players.p1;
  player.hand = ["specialty.ash.4"];
  player.deck = [];
  player.discard = [];
  player.needsHandRefresh = false;
  player.canMulligan = false;
  const overrides = unitSideRuleOverrides(state);
  const mine = makeCombatUnitFromArmy(
    { id: "own_0", unitDefId: "castle.halberdiers", side: "few" },
    "p1",
    "u_own_0",
    13,
    "legacy",
    overrides
  )!;
  mine.type = unitType;
  const foe = makeCombatUnitFromArmy(
    { id: "foe_0", unitDefId: "neutral.skeletons", side: "neutral" },
    NEUTRAL_PLAYER_ID,
    "u_foe_0",
    9,
    "legacy",
    overrides
  )!;
  const hero = getMainHero(state, "p1")!;
  state.combat = {
    id: "combat_page_ash",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    activeUnitId: mine.id,
    setup: null,
    awaitingContinue: false,
    outcome: null,
    units: { [mine.id]: mine, [foe.id]: foe },
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId ?? "field",
      difficulty: 1,
      hasAzure: false
    }
  } as CombatState;
  state.phase = "combat";
  state.activePlayerId = "p1";
  return state;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/?room=ash-bloodlust-test");
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});

afterEach(cleanup);

describe("Ash's Bloodlust IV — clickable end-to-end on the real battle table", () => {
  it("hand card click arms targeting, the own unit's cell glows, clicking it submits the play", async () => {
    const submitAction = serveRoom(combatWithAshIV());
    render(<Home />);
    await settle();

    // The battle screen really is the one rendered, with the card in the fan.
    expect(document.querySelector("main.adventureRoot"), "should be the combat table").toBeNull();
    const fanCard = document.querySelector<HTMLButtonElement>(".fanCard");
    expect(fanCard, "Bloodlust IV renders in the combat hand fan").toBeTruthy();
    expect(
      fanCard!.className.includes("playable"),
      "the card reads as playable (the engine offer reached the hand UI)"
    ).toBe(true);

    // ONE board-target play and no immediate action ⇒ clicking the card arms
    // click-to-target straight away (the Lightning-Bolt fast path).
    await act(async () => {
      fireEvent.click(fanCard!);
    });
    const targetCell = document.querySelector<HTMLButtonElement>("button.battleCell.cardTarget");
    expect(targetCell, "the own ground unit's cell becomes the card's click target").toBeTruthy();
    expect(targetCell!.getAttribute("data-fx-unit")).toBe("u_own_0");

    await act(async () => {
      fireEvent.click(targetCell!);
    });
    await settle();

    const sent = submitAction.mock.calls
      .map(
        ([action]) => action as { type?: string; cardId?: string; target?: { type?: string; unitId?: string } }
      )
      .find((action) => action?.type === "PLAY_CARD");
    expect(sent, "clicking the glowing cell submits the play to the room").toBeTruthy();
    expect(sent!.cardId).toBe("specialty.ash.4");
    expect(sent!.target).toMatchObject({ type: "unit", unitId: "u_own_0" });
  });

  it("CONTROL: with a RANGED-only line the printed gate holds — no playable card, no target cell", async () => {
    serveRoom(combatWithAshIV("ranged"));
    render(<Home />);
    await settle();

    const fanCard = document.querySelector<HTMLButtonElement>(".fanCard");
    expect(fanCard, "the card still renders in the fan").toBeTruthy();
    expect(fanCard!.className.includes("playable"), "printed ground-or-flying gate").toBe(false);
    await act(async () => {
      fireEvent.click(fanCard!);
    });
    expect(document.querySelector("button.battleCell.cardTarget")).toBeNull();
  });
});
