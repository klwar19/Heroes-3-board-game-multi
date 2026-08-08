// @vitest-environment jsdom
/**
 * Polish Set Artifacts — the PAGE mounts.
 *
 * `artifact-set-ui.test.tsx` pins the three components in isolation; this file
 * pins the thing those tests structurally cannot: that `page.tsx` actually
 * MOUNTS them on the real table. Without it, deleting either mount would leave
 * the whole feature invisible in the app with every component test still green
 * — the exact "engine offers existed with no UI surface" bug this repo keeps
 * shipping (the Polish Wait / Surrender precedent).
 *
 * Two mounts per screen are covered here on the MAP surface:
 *   - `<ArtifactSetPanel>` beside the Ongoing / Permanent tray, and
 *   - `<ArtifactSetIconsProvider>`, without which no card face can ever wear a
 *     set icon (proved through a real hand card, not the provider itself).
 * The combat screen mounts the same pair; jsdom cannot compute CSS, so neither
 * screen's LAYOUT (where the panel sits, whether the badge is unclipped) is
 * verified anywhere — that stays a real-browser concern.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import {
  ARTIFACT_SETS,
  createAdventureGameState,
  getMainHero,
  makeCombatUnitFromArmy,
  playerArtifactSetStatuses,
  redactStateForSeat,
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

const AA_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "angelic_alliance")!.members;

function serveRoom(state: GameState) {
  const snapshot: GameRoomSnapshot = {
    roomId: "set-artifacts-test",
    version: 1,
    updatedAt: new Date().toISOString(),
    state
  };
  connectRoomMock.mockReset().mockImplementation(() => ({
    close: vi.fn(),
    submitAction: vi.fn(async () => ({ version: 1, errors: [], notices: [] })),
    resetRoom: vi.fn(async () => snapshot),
    fetchSnapshot: vi.fn(async () => snapshot),
    restoreRoom: vi.fn(async () => snapshot),
    fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: 1 })),
    loadSinglePlayerSave: vi.fn(async () => snapshot)
  }));
}

async function settle(rounds = 2) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** A map-screen state where p1 holds 3 Angelic Alliance pieces in hand. */
function mapStateWithSet(enabled: boolean): GameState {
  const state = createAdventureGameState({
    seed: "page-set-artifacts",
    rollFirstPlayer: false,
    startingBuildings: [],
    events: false,
    ruleset: "legacy",
    houseRules: { "polish-set-artifacts": enabled }
  });
  const player = state.players.p1;
  player.hand = [AA_MEMBERS[0], AA_MEMBERS[1], AA_MEMBERS[2]];
  player.deck = [];
  player.discard = [];
  player.needsHandRefresh = false;
  player.canMulligan = false;
  // The status is normally synced at the applyAction tail; the page renders a
  // SERVED snapshot, so stamp what that sync would have produced.
  player.artifactSetStatus = enabled
    ? [{ setId: "angelic_alliance", pieces: 3, activeTiers: 2, memberCount: AA_MEMBERS.length }]
    : undefined;
  return state;
}

/** The same state, dropped into a real p1-vs-neutral combat (combat screen). */
function combatStateWithSet(enabled: boolean): GameState {
  const state = mapStateWithSet(enabled);
  const overrides = unitSideRuleOverrides(state);
  const mine = makeCombatUnitFromArmy(
    { id: "own_0", unitDefId: "castle.halberdiers", side: "few" },
    "p1",
    "u_own_0",
    0,
    "legacy",
    overrides
  )!;
  const foe = makeCombatUnitFromArmy(
    { id: "foe_0", unitDefId: "neutral.skeletons", side: "neutral" },
    NEUTRAL_PLAYER_ID,
    "u_foe_0",
    10,
    "legacy",
    overrides
  )!;
  const hero = getMainHero(state, "p1")!;
  state.combat = {
    id: "combat_page_sets",
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
  window.history.replaceState(null, "", "/?room=set-artifacts-test");
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});

afterEach(cleanup);

describe("Polish Set Artifacts — page mounts (map screen)", () => {
  it("mounts the set status panel and the icon provider on the real table", async () => {
    serveRoom(mapStateWithSet(true));
    render(<Home />);
    await settle();

    // (a) the always-on status panel really renders on the map screen…
    const tile = document.querySelector('.artifactSetTile[data-set-id="angelic_alliance"]');
    expect(tile, "page.tsx must mount <ArtifactSetPanel> on the map screen").toBeTruthy();
    expect(tile!.querySelector(".artifactSetPieces")?.textContent).toBe("3/6");

    // (b) …and a real hand card wears the set icon, which can only happen if the
    // provider is mounted above the hand (CardFrame reads it from context).
    const badge = document.querySelector('.cardSetIcon[data-set-id="angelic_alliance"]');
    expect(badge, "page.tsx must mount <ArtifactSetIconsProvider> above the card faces").toBeTruthy();
  });

  it("CONTROL: with the house rule off the same table renders neither", async () => {
    serveRoom(mapStateWithSet(false));
    render(<Home />);
    await settle();

    expect(document.querySelector(".artifactSetPanel")).toBeNull();
    expect(document.querySelector(".cardSetIcon")).toBeNull();
    // …and the CONTROL is not vacuous: the same three set-member cards are on
    // the table, rendered as ordinary bare card faces.
    expect(document.querySelectorAll("img.handCardImage").length).toBe(3);
    expect(document.querySelector(".cardSetFrame")).toBeNull();
  });
});

/**
 * The LIVE table shape a hosted room really serves: a per-seat REDACTED frame in
 * which even the viewer's OWN deck is `hidden` placeholders. Four of the six
 * Angelic Alliance pieces sit in that masked deck and its round-1 selection has
 * already been made, so the four bound combat tiers must be offered.
 */
function hostedRedactedCombatState(): GameState {
  const state = combatStateWithSet(true);
  const player = state.players.p1;
  player.hand = [AA_MEMBERS[0], AA_MEMBERS[1]];
  player.deck = [AA_MEMBERS[2], AA_MEMBERS[3], AA_MEMBERS[4], AA_MEMBERS[5]];
  player.artifactSetStatus = playerArtifactSetStatuses(state, "p1");
  // The tier-2 pick, as SELECT_ARTIFACT_SET_UNIT would have stamped it.
  player.combatStats.artifactSetSelections = { angelic_alliance: "u_own_0" };
  player.combatStats.artifactSetUsesThisCombat = ["angelic_alliance:2"];
  return redactStateForSeat(state, "p1");
}

describe("Polish Set Artifacts — page mounts (combat screen)", () => {
  it("mounts the set status panel and the icon provider on the battle table too", async () => {
    serveRoom(combatStateWithSet(true));
    render(<Home />);
    await settle();

    // The combat screen really is the one rendered (not the map).
    expect(document.querySelector("main.adventureRoot"), "should be the combat table").toBeNull();
    expect(
      document.querySelector('.artifactSetPanel.compact .artifactSetTile[data-set-id="angelic_alliance"]'),
      "page.tsx must mount <ArtifactSetPanel compact> on the combat screen"
    ).toBeTruthy();
    expect(
      document.querySelector('.cardSetIcon[data-set-id="angelic_alliance"]'),
      "page.tsx must mount <ArtifactSetIconsProvider> above the combat card faces"
    ).toBeTruthy();
  });

  it("CONTROL: rule off ⇒ the battle table renders neither", async () => {
    serveRoom(combatStateWithSet(false));
    render(<Home />);
    await settle();

    expect(document.querySelector("main.adventureRoot")).toBeNull();
    expect(document.querySelector(".artifactSetPanel")).toBeNull();
    expect(document.querySelector(".cardSetIcon")).toBeNull();
  });

  /**
   * The 2026-08-08 "Angelic Alliance does not work during combat" report. Every
   * single-player room and every CLOSED multiplayer table is HOSTED, so the
   * browser renders a REDACTED frame — and the set piece count used to be derived
   * from the visible zones alone, which read 2 of 6 pieces there. The status panel
   * (which reads the synced status) said "6/6 · 5 effects" while the combat dock
   * offered nothing. This is the whole chain — redacted frame → engine offers →
   * the dock's set-powers entry — in one pin.
   */
  it("EFFECT: a hosted (redacted) battle table still shows the set powers button", async () => {
    serveRoom(hostedRedactedCombatState());
    render(<Home />);
    await settle();

    // The panel still reports the true progress (it always did)…
    expect(document.querySelector(".artifactSetPieces")?.textContent).toBe("6/6");
    // …and now so does the dock: the 4 bound tiers are one entry button.
    const button = document.querySelector<HTMLElement>(".setPowerButton");
    expect(button, "the combat dock must offer the set powers on a hosted table").toBeTruthy();
    expect(button!.textContent).toContain("Set powers (4)");
  });
});
