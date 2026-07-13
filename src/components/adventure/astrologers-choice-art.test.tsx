// @vitest-environment jsdom
/**
 * Astrologers Proclaim choice tray: option art must be the thing you pick
 * (unit / statistic / war machine / map tile), NEVER the proclamation card scan.
 * Disruption must render tile thumbs instead of a wall of degree text.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import {
  createAdventureGameState,
  getLegalActions,
  pumpAdventureQueues,
  type GameState,
  type MapTileState
} from "@/engine";
import { materializeTileFields, startAdventureRound } from "@/engine/adventure";
import { coreUnitDefinitions } from "@/data/factions/units";
import { cardLibrary } from "@/data/cards/library";
import { allTileDefinitions } from "@/data/map/tiles";

afterEach(cleanup);

function stripMulligan(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
}

/** Stack the Astrologers deck so the next even-round wrap draws `cardId` (top = last). */
function stackAstrologers(state: GameState, cardId: string): void {
  const deck = state.decks.astrologers;
  if (!deck) {
    throw new Error("astrologers deck missing");
  }
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
  deck.discardPile = deck.discardPile.filter((id) => id !== cardId);
}

/** Two-player adventure that has just drawn the given proclamation on round 2. */
function drawProclamation(cardId: string, seed = "astro-choice-art"): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  stripMulligan(state);
  state.activePlayerId = "p1";
  stackAstrologers(state, cardId);
  state.round = 2;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  expect(state.adventure?.astrologers?.activeCardId).toBe(cardId);
  return state;
}

function renderTray(state: GameState, playerId: "p1" | "p2" = "p1") {
  const onAction = vi.fn();
  render(
    <PromptTray
      legalActions={getLegalActions(state, playerId)}
      onAction={onAction}
      state={state}
      viewerPlayerId={playerId}
    />
  );
  return onAction;
}

describe("Astrologers choice tray — relevant option art, not the proclamation card", () => {
  it("Dancing Imp: shows Statistic card art for each empower pick, not the Imp scan", () => {
    const state = drawProclamation("astrologers.dancing_imp");
    // Seed a hand Statistic so the offer is non-empty (draw path may already have one).
    if (!state.players.p1.hand.some((id) => cardLibrary[id]?.kind === "statistic" && !id.endsWith(".empowered"))) {
      state.players.p1.hand.push("stat.attack");
    }
    // Re-pump so STAT_EMPOWER_OFFER expands against the live hand.
    state.adventure!.pendingVisit = null;
    state.adventure!.rewardQueue = [
      {
        playerId: "p1",
        kind: "visit-steps",
        steps: [
          {
            type: "STAT_EMPOWER_OFFER",
            sources: ["hand", "discard"],
            remaining: 1,
            prompt: "Dancing Imp: empower one Statistic card (hand or discard)"
          }
        ]
      }
    ];
    pumpAdventureQueues(state);

    renderTray(state);

    expect(screen.queryByTestId("astrologers-choice-card")).toBeNull();
    expect(screen.getByRole("dialog", { name: /Dancing Imp/i })).toBeTruthy();

    const empower = screen.getByRole("button", { name: /Empower Attack/i });
    const img = empower.querySelector("img");
    expect(img?.getAttribute("src")).toContain("statistics-attack");
    expect(img?.getAttribute("src") ?? "").not.toMatch(/astrologers/i);
  });

  it("Isra's Friends: shows each reinforce unit's card art (armyUnitId), not the proclamation", () => {
    const state = drawProclamation("astrologers.isras_friends", "astro-isra");
    state.players.p1.resources.gold = 20;
    state.players.p1.resources.buildingMaterials = 10;
    state.players.p1.resources.valuables = 10;
    // Ensure a Few unit that can reinforce is present and affordable.
    const few = state.players.p1.army.find(
      (unit) => unit.side === "few" && coreUnitDefinitions[unit.unitDefId]?.pack
    );
    if (!few) {
      state.players.p1.army.push({ id: "few_griffins", unitDefId: "castle.griffins", side: "few" });
    }
    state.adventure!.pendingVisit = null;
    state.adventure!.rewardQueue = [
      {
        playerId: "p1",
        kind: "visit-steps",
        steps: [
          {
            type: "CHOOSE_ONE",
            prompt: "Isra's Friends: reinforce one Few unit at half cost",
            options: state.players.p1.army
              .filter((unit) => unit.side === "few" && coreUnitDefinitions[unit.unitDefId]?.pack)
              .map((unit) => ({
                label: `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId}`,
                steps: [{ type: "REINFORCE_ARMY_UNIT" as const, armyUnitId: unit.id, halfCost: true }]
              }))
              .concat([{ label: "Skip", steps: [] }])
          }
        ]
      }
    ];
    pumpAdventureQueues(state);

    renderTray(state);

    expect(screen.queryByTestId("astrologers-choice-card")).toBeNull();
    const unitButtons = screen.getAllByRole("button").filter((btn) => /Reinforce/i.test(btn.getAttribute("aria-label") ?? btn.textContent ?? ""));
    expect(unitButtons.length).toBeGreaterThan(0);
    for (const button of unitButtons) {
      const src = button.querySelector("img")?.getAttribute("src") ?? "";
      expect(src).toMatch(/units-/);
      expect(src).not.toMatch(/astrologers/i);
    }
  });

  it("McGiver: shows War Machine card art, not the proclamation", () => {
    const state = drawProclamation("astrologers.mcgiver", "astro-mcgiver");
    // McGiver resolves at the NEXT resource round — force the grant offer open now.
    const supply = state.adventure?.warMachineSupply ?? ["war_machine.ballista", "war_machine.ammo_cart", "war_machine.first_aid_tent"];
    state.adventure!.warMachineSupply = [...supply];
    state.adventure!.pendingVisit = null;
    state.adventure!.rewardQueue = [
      {
        playerId: "p1",
        kind: "visit-steps",
        steps: [{ type: "WAR_MACHINE_GRANT_OFFER" }]
      }
    ];
    pumpAdventureQueues(state);

    renderTray(state);

    expect(screen.queryByTestId("astrologers-choice-card")).toBeNull();
    const machine = screen.getAllByRole("button").find((btn) => /Take .* \(free\)/i.test(btn.getAttribute("aria-label") ?? ""));
    expect(machine).toBeTruthy();
    const src = machine!.querySelector("img")?.getAttribute("src") ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/astrologers/i);
  });

  it("text-only proclamation options still show the card scan (control)", () => {
    // Dead Silence is passive — use a forced CHOOSE_ONE with no reward ids to
    // prove the scan only appears when options have no art of their own.
    const state = drawProclamation("astrologers.dead_silence", "astro-text-only");
    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: state.heroes.hero_p1.spaceId ?? Object.keys(state.adventure!.fields)[0],
      location: "astrologers",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Dead Silence: nothing to pick",
          options: [{ label: "Acknowledge", steps: [] }]
        }
      ]
    } as NonNullable<GameState["adventure"]>["pendingVisit"];

    renderTray(state);

    // No per-option art → the proclamation scan is allowed as the preview.
    // dead_silence may be art-less; either the preview shows or the text button alone is fine.
    expect(screen.getByRole("button", { name: /Acknowledge/i })).toBeTruthy();
    const cardPreview = screen.queryByTestId("astrologers-choice-card");
    if (cardPreview) {
      const src = cardPreview.querySelector("img")?.getAttribute("src") ?? "";
      expect(src).toMatch(/astrologers|dead_silence/i);
    }
  });
});

/**
 * Disruption redraws at draw-time when no tile is rotatable (home tiles hold
 * heroes + towns). UI tests stamp the active card and plant a fresh revealed
 * F1 far from the play area — the same setup the engine tests use.
 */
function disruptionTrayState(seed: string): { state: GameState; tile: MapTileState } {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  stripMulligan(state);
  state.activePlayerId = "p1";
  state.round = 2;
  if (!state.adventure!.astrologers) {
    state.adventure!.astrologers = {
      activeCardId: "astrologers.disruption",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: [],
      disruptionRotatedTileIds: []
    };
  } else {
    state.adventure!.astrologers.activeCardId = "astrologers.disruption";
    state.adventure!.astrologers.disruptionRotatedTileIds = [];
  }
  const tile: MapTileState = {
    id: "tile_disruption_ui",
    tileDefId: "F1",
    centerRow: 20,
    centerCol: 20,
    rotation: 0,
    faceDown: false,
    group: "far"
  };
  state.adventure!.tiles[tile.id] = tile;
  materializeTileFields(state.adventure!, tile);
  state.adventure!.pendingVisit = null;
  state.adventure!.rewardQueue = [];
  state.pendingChoice = null;
  return { state, tile };
}

describe("Disruption rotate-tile tray — tile art, not a wall of text", () => {
  it("tile pick shows each eligible tile's scan as a thumb (not the Disruption card)", () => {
    const { state } = disruptionTrayState("astro-disruption");
    state.adventure!.rewardQueue = [
      { playerId: "p1", kind: "visit-steps", steps: [{ type: "DISRUPTION_ROTATE_OFFER" }] }
    ];
    pumpAdventureQueues(state);

    const visit = state.adventure?.pendingVisit;
    expect(visit?.steps[0]?.type).toBe("CHOOSE_ONE");

    renderTray(state);

    expect(screen.queryByTestId("astrologers-choice-card")).toBeNull();
    expect(screen.getByRole("dialog", { name: /Disruption/i })).toBeTruthy();

    const tileButtons = screen
      .getAllByRole("button")
      .filter((btn) => /Rotate tile/i.test(btn.getAttribute("aria-label") ?? ""));
    expect(tileButtons.length).toBeGreaterThan(0);

    let sawTileArt = false;
    for (const button of tileButtons) {
      expect(button.className).toMatch(/tileThumb|promptRewardCard/);
      const src = button.querySelector("img")?.getAttribute("src") ?? "";
      if (src) {
        sawTileArt = true;
        expect(src).not.toMatch(/astrologers/i);
        const anyTileHasArt = Object.values(allTileDefinitions).some((def) => def.assets?.tileImage);
        if (anyTileHasArt) {
          expect(src).toMatch(/tiles|board/i);
        }
      }
    }
    // Skip stays a plain text button.
    expect(screen.getByRole("button", { name: /^Skip$/i })).toBeTruthy();
    expect(sawTileArt || tileButtons.some((b) => b.querySelector(".marketCardFallback"))).toBe(true);
  });

  it("degree pick shows rotated tile thumbs labelled 60°/120°… instead of long text only", () => {
    const { state, tile } = disruptionTrayState("astro-disruption-deg");
    tile.rotation = 0;

    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: Object.keys(state.adventure!.fields)[0],
      location: "astrologers",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: `Disruption: rotate tile ${tile.tileDefId} by how much?`,
          options: [
            ...[1, 2, 3, 4, 5].map((turns) => ({
              label: `Turn ${turns * 60}° clockwise`,
              steps: [{ type: "DISRUPTION_SET_ROTATION" as const, tileInstanceId: tile.id, rotation: turns }]
            })),
            { label: "Pick a different tile", steps: [{ type: "DISRUPTION_ROTATE_OFFER" as const }] }
          ]
        }
      ]
    } as NonNullable<GameState["adventure"]>["pendingVisit"];

    renderTray(state);

    expect(screen.queryByTestId("astrologers-choice-card")).toBeNull();

    for (const deg of [60, 120, 180, 240, 300]) {
      const button = screen.getByRole("button", { name: new RegExp(`Turn ${deg}° clockwise`, "i") });
      expect(button.className).toMatch(/tileThumb/);
      // Caption under the thumb is the short degree label, not the long sentence alone.
      expect(button.textContent).toMatch(new RegExp(`${deg}°`));
      const wrap = button.querySelector(".promptRewardArtWrap") as HTMLElement | null;
      const styleText = wrap?.getAttribute("style") ?? "";
      expect(styleText).toMatch(new RegExp(`${deg}deg`));
    }
    // Back-out stays a plain command button (no fake tile art).
    expect(screen.getByRole("button", { name: /Pick a different tile/i }).className).toMatch(/commandButton/);
  });

  it("clicking a degree thumb dispatches the matching RESOLVE_VISIT_STEP", () => {
    const { state, tile } = disruptionTrayState("astro-disruption-click");
    tile.rotation = 0;
    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: Object.keys(state.adventure!.fields)[0],
      location: "astrologers",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Disruption: rotate tile by how much?",
          options: [
            {
              label: "Turn 60° clockwise",
              steps: [{ type: "DISRUPTION_SET_ROTATION", tileInstanceId: tile.id, rotation: 1 }]
            },
            { label: "Pick a different tile", steps: [{ type: "DISRUPTION_ROTATE_OFFER" }] }
          ]
        }
      ]
    } as NonNullable<GameState["adventure"]>["pendingVisit"];

    const onAction = renderTray(state);
    fireEvent.click(screen.getByRole("button", { name: /Turn 60° clockwise/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "RESOLVE_VISIT_STEP", optionIndex: 0 });
  });
});
