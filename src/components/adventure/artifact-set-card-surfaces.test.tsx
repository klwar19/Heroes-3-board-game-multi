// @vitest-environment jsdom
/**
 * Polish Set Artifacts — the set icon on EVERY card-face surface (2026-08-08).
 *
 * Reported: "No icon on this sword in small window, check all for set icon
 * attached." The badge was drawn by exactly two components — `CardFrame`
 * (seats.tsx) and the zoom reader — so every surface in `screen.tsx` that paints
 * a card face with a RAW `<img>` showed a set member with no badge: the shared
 * Artifact deck's discard top, the player's own discard top, the pile browser,
 * the Pandora card row, the visit-reward / discard-pick tiles, the Shady Auction
 * lot, the face-up event pool and the market's sell-from-hand tiles.
 *
 * Those surfaces now go through the ONE shared pair in `artifact-set-badge.tsx`
 * (no per-surface badge markup): `CardSetFrame` wraps a face that sits in normal
 * flow, `CardSetCornerBadge` hangs the badge on an already-positioned tile whose
 * face fills it (`position: absolute; inset: 0`, or `width: 100%`).
 *
 * Every case below carries a rule-OFF control, and the CONTROLS are not vacuous:
 * each asserts the same card face is still rendered, just bare.
 *
 * Leading with what is NOT covered:
 *  - jsdom cannot compute CSS, so WHERE the badge lands (unclipped, over the
 *    art, not on top of a count chip) is a real-browser concern.
 *  - `fx.tsx`'s card-FLIGHT face (`makeCardFaceElement`) builds its <img> with
 *    `document.createElement`, outside React, so it can never read the context
 *    gate and stays unbadged by design — a ~600ms animation, not a readable
 *    card.
 *  - The hand trays, combat fan, reaction/search trays, permanent tray, seat
 *    piles and the zoom reader all went through `CardFrame` / the zoom already;
 *    they are pinned by `artifact-set-ui.test.tsx` and `page-artifact-sets.test.tsx`.
 *
 * Mutation checks, verified: removing the four `CardSetCornerBadge` calls fails
 * 4 (both discard tops, the pile browser, the market tile); neutering
 * `CardSetFrame` inside screen.tsx fails 4 (Pandora row, discard-pick tiles,
 * auction lot, event pool); dropping `cardId` from `rewardArtForId` fails 1 (the
 * generic "take this card" reward tile).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  AdventureDecksPanel,
  AdventureOwnDeck,
  MarketPanel,
  PileModal,
  PromptTray
} from "./screen";
import { ArtifactSetIconsProvider } from "@/components/table/artifact-set-badge";
import { CardZoomProvider } from "@/components/table/zoom";
import { applyAction, createAdventureGameState, getLegalActions, getPlayerView } from "@/engine";
import type { GameState, LegalAction, MapFieldState, PlayerVisibleState } from "@/engine";

afterEach(cleanup);

/** An Angelic Alliance piece (a core Artifact with a real printed scan). */
const MEMBER = "artifact.sword_of_judgement";
/** …and a Power of the Dragon Father piece — the card the report showed. */
const MEMBER_2 = "artifact.red_dragon_flame_tongue";
/** A plain Artifact in no set at all: the non-member control. */
const OUTSIDER = "artifact.boots_of_speed";

function withProvider(enabled: boolean, node: React.ReactNode) {
  return render(
    <ArtifactSetIconsProvider enabled={enabled}>
      <CardZoomProvider>{node}</CardZoomProvider>
    </ArtifactSetIconsProvider>
  );
}

function badges(): NodeListOf<Element> {
  return document.querySelectorAll(".cardSetIcon");
}

function badgeSets(): string[] {
  return [...badges()].map((node) => node.getAttribute("data-set-id") ?? "");
}

function baseState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  return state;
}

// ---------------------------------------------------------------------------
// 1. The two discard TOPS (a face that fills its positioned button)
// ---------------------------------------------------------------------------

describe("Set icons — discard tops", () => {
  function decksPanel(enabled: boolean, cardId: string) {
    const state = baseState("sets-shared-discard");
    // The Artifact deck's own discard top: the most-seen set-member face there is.
    state.decks["artifacts-major"]!.discardPile = [cardId];
    const view: PlayerVisibleState = getPlayerView(state, "p1");
    return withProvider(enabled, <AdventureDecksPanel onShowPile={vi.fn()} view={view} viewerPlayerId="p1" />);
  }

  it("EFFECT: the shared Artifact deck's discard top wears its set badge", () => {
    decksPanel(true, MEMBER_2);
    expect(badgeSets()).toEqual(["power_of_the_dragon_father"]);
  });

  it("CONTROL: rule off / a non-member leaves the same face bare", () => {
    const { unmount } = decksPanel(false, MEMBER_2);
    expect(document.querySelector(".advDiscardTop"), "the face still renders").toBeTruthy();
    expect(badges().length).toBe(0);
    unmount();
    decksPanel(true, OUTSIDER);
    expect(document.querySelector(".advDiscardTop")).toBeTruthy();
    expect(badges().length).toBe(0);
  });

  function ownDeck(enabled: boolean, cardId: string) {
    const state = baseState("sets-own-discard");
    state.players.p1.discard = [cardId];
    return withProvider(
      enabled,
      <AdventureOwnDeck onShowPile={vi.fn()} view={getPlayerView(state, "p1")} viewerPlayerId="p1" />
    );
  }

  it("EFFECT: the player's OWN discard top wears its set badge", () => {
    ownDeck(true, MEMBER);
    expect(badgeSets()).toEqual(["angelic_alliance"]);
  });

  it("CONTROL: rule off leaves the own discard top bare", () => {
    ownDeck(false, MEMBER);
    expect(document.querySelector(".ownDiscardTop")).toBeTruthy();
    expect(badges().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The pile BROWSER (the same positioned tile as the Empowered overlay)
// ---------------------------------------------------------------------------

describe("Set icons — the pile browser", () => {
  it("EFFECT: browsing a discard pile marks every set piece in it", () => {
    withProvider(
      true,
      <PileModal cardIds={[MEMBER, OUTSIDER, MEMBER_2]} kind="cards" onClose={vi.fn()} title="Discard" />
    );
    expect(badgeSets()).toEqual(["power_of_the_dragon_father", "angelic_alliance"]);
  });

  it("CONTROL: rule off browses the same three faces with no badge", () => {
    withProvider(
      false,
      <PileModal cardIds={[MEMBER, OUTSIDER, MEMBER_2]} kind="cards" onClose={vi.fn()} title="Discard" />
    );
    expect(document.querySelectorAll(".pileCardButton").length).toBe(3);
    expect(badges().length).toBe(0);
  });

  it("CONTROL: a UNIT pile is never badged (a unit id can collide with nothing)", () => {
    withProvider(true, <PileModal cardIds={["neutral.skeletons"]} kind="units" onClose={vi.fn()} title="Guards" />);
    expect(badges().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. The market's sell-from-hand tiles (a `width: 100%` face)
// ---------------------------------------------------------------------------

describe("Set icons — the market sell-from-hand tiles", () => {
  function market(enabled: boolean, cardId: string) {
    const state = baseState("sets-market");
    const field: MapFieldState = {
      spaceId: "50,50",
      tileInstanceId: "sets-market-tile",
      slot: 0,
      location: "trading_post",
      difficulty: undefined,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[field.spaceId] = field;
    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main"
    )!;
    hero.spaceId = field.spaceId;
    hero.movementPoints = 1;
    state.players.p1.hand = [cardId];
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId: hero.id,
      fieldId: field.spaceId,
      steps: [{ type: "TRADING_POST" }]
    };
    return withProvider(
      enabled,
      <MarketPanel
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p1"
      />
    );
  }

  it("EFFECT: a set piece offered for sale wears its badge", () => {
    market(true, MEMBER);
    expect(document.querySelectorAll(".marketSellCard").length).toBeGreaterThan(0);
    expect(badgeSets()).toEqual(["angelic_alliance"]);
  });

  it("CONTROL: rule off offers the same card with no badge", () => {
    market(false, MEMBER);
    expect(document.querySelectorAll(".marketSellCard").length).toBeGreaterThan(0);
    expect(badges().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. The PromptTray surfaces (Pandora row, reward tiles, auction lot, pool)
// ---------------------------------------------------------------------------

describe("Set icons — the prompt tray's card faces", () => {
  function tray(enabled: boolean, state: GameState, legalActions: LegalAction[]) {
    return withProvider(
      enabled,
      <PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
  }

  /** A live Pandora scry of the ARTIFACT deck: three revealed faces to keep/pitch. */
  function scryState(): { state: GameState; legalActions: LegalAction[] } {
    const state = baseState("sets-pandora");
    state.players.p1.hand = ["pandora.scry_artifacts"];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "pandora.scry_artifacts"
    );
    expect(play, "the artifact scry should be playable").toBeTruthy();
    const result = applyOk(state, play!);
    // Force known faces so the assertion does not depend on the deck shuffle.
    const choice = result.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.pandoraScry) {
      throw new Error("expected a pandora-scry choice");
    }
    choice.pandoraScry.remaining = [MEMBER, OUTSIDER];
    return { state: result, legalActions: getLegalActions(result, "p1") };
  }

  function applyOk(state: GameState, legal: LegalAction): GameState {
    const result = applyAction(state, legal.action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return result.state;
  }

  it("EFFECT: the Pandora card row badges the revealed set piece only", () => {
    const { state, legalActions } = scryState();
    tray(true, state, legalActions);
    expect(document.querySelectorAll(".pandoraCardTile").length).toBe(2);
    expect(badgeSets()).toEqual(["angelic_alliance"]);
  });

  it("CONTROL: rule off shows the same two Pandora faces bare", () => {
    const { state, legalActions } = scryState();
    tray(false, state, legalActions);
    expect(document.querySelectorAll(".pandoraCardTile").length).toBe(2);
    expect(badges().length).toBe(0);
  });

  /** A live discard-pick: the reward tiles that show each candidate's face. */
  function discardPickState(): { state: GameState; legalActions: LegalAction[] } {
    const state = baseState("sets-discard-pick");
    state.pendingChoice = {
      id: "choice_discard_pick",
      type: "OPTION_CHOICE",
      playerId: "p1",
      context: "discard-pick",
      prompt: "Take a card from your discard pile",
      options: [{ label: "Take Sword of Judgement" }, { label: "Take Boots of Speed" }],
      discardPick: { cardIds: [MEMBER, OUTSIDER] }
    } as GameState["pendingChoice"];
    return { state, legalActions: getLegalActions(state, "p1") };
  }

  it("EFFECT: a reward/discard-pick tile badges the set piece it is offering", () => {
    const { state, legalActions } = discardPickState();
    tray(true, state, legalActions);
    expect(document.querySelectorAll(".promptRewardCard").length).toBe(2);
    expect(badgeSets()).toEqual(["angelic_alliance"]);
  });

  it("CONTROL: rule off shows the same two reward tiles bare", () => {
    const { state, legalActions } = discardPickState();
    tray(false, state, legalActions);
    expect(document.querySelectorAll(".promptRewardCard").length).toBe(2);
    expect(badges().length).toBe(0);
  });

  /**
   * The GENERIC reward-tile path: a CHOOSE_ONE visit whose option steps name a
   * card, so `rewardArtFromVisitSteps` → `rewardArtForId` resolves the face. This
   * is the only case that pins `rewardArtForId` carrying the card id through.
   */
  function gainCardState(): { state: GameState; legalActions: LegalAction[] } {
    const state = baseState("sets-gain-card");
    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main"
    )!;
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId: hero.id,
      fieldId: hero.spaceId ?? "field",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Take one",
          options: [
            { label: "Take Sword of Judgement", steps: [{ type: "EVENT_TAKE_CARD", cardId: MEMBER, deckId: "artifacts-major" }] },
            { label: "Take Boots of Speed", steps: [{ type: "EVENT_TAKE_CARD", cardId: OUTSIDER, deckId: "artifacts-minor" }] }
          ]
        }
      ]
    };
    return { state, legalActions: getLegalActions(state, "p1") };
  }

  it("EFFECT: a generic 'take this card' reward tile badges the set piece", () => {
    const { state, legalActions } = gainCardState();
    tray(true, state, legalActions);
    expect(document.querySelectorAll(".promptRewardCard").length).toBe(2);
    expect(badgeSets()).toEqual(["angelic_alliance"]);
  });

  it("CONTROL: rule off shows the same two reward faces bare", () => {
    const { state, legalActions } = gainCardState();
    tray(false, state, legalActions);
    expect(document.querySelectorAll(".promptRewardCard").length).toBe(2);
    expect(badges().length).toBe(0);
  });

  /** A Shady Auction lot + a face-up Event pool, both public tray previews. */
  function eventTrayState(): { state: GameState; legalActions: LegalAction[] } {
    const state = baseState("sets-event-tray");
    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main"
    )!;
    const adventure = state.adventure!;
    adventure.pendingVisit = {
      playerId: "p1",
      heroId: hero.id,
      fieldId: hero.spaceId ?? "field",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Bid",
          options: [
            { label: "Bid 0 gold", steps: [] },
            { label: "Bid 1 gold", steps: [] }
          ]
        }
      ]
    };
    adventure.events = {
      ...(adventure.events ?? {}),
      auction: { lotCardId: MEMBER_2, bids: {} }
    } as NonNullable<GameState["adventure"]>["events"];
    return { state, legalActions: getLegalActions(state, "p1") };
  }

  it("EFFECT: the Shady Auction lot wears its set badge", () => {
    const { state, legalActions } = eventTrayState();
    tray(true, state, legalActions);
    expect(document.querySelector('[data-testid="auction-lot"]')).toBeTruthy();
    expect(badgeSets()).toEqual(["power_of_the_dragon_father"]);
  });

  it("CONTROL: rule off shows the same lot bare", () => {
    const { state, legalActions } = eventTrayState();
    tray(false, state, legalActions);
    expect(document.querySelector(".auctionLotCard")).toBeTruthy();
    expect(badges().length).toBe(0);
  });

  function eventPoolState(): { state: GameState; legalActions: LegalAction[] } {
    const { state, legalActions } = eventTrayState();
    const adventure = state.adventure!;
    // No auction — a plain face-up market pool instead.
    adventure.events = {
      ...(adventure.events ?? {}),
      auction: null,
      pool: [
        { cardId: MEMBER, deckId: "artifacts-major", faceUp: true },
        { cardId: OUTSIDER, deckId: "artifacts-major", faceUp: true }
      ]
    } as NonNullable<GameState["adventure"]>["events"];
    return { state, legalActions };
  }

  it("EFFECT: a face-up event pool badges the set piece on offer", () => {
    const { state, legalActions } = eventPoolState();
    tray(true, state, legalActions);
    expect(document.querySelectorAll(".eventPoolCard").length).toBe(2);
    expect(badgeSets()).toEqual(["angelic_alliance"]);
  });

  it("CONTROL: rule off shows the same pool bare", () => {
    const { state, legalActions } = eventPoolState();
    tray(false, state, legalActions);
    expect(document.querySelectorAll(".eventPoolCard").length).toBe(2);
    expect(badges().length).toBe(0);
  });
});
