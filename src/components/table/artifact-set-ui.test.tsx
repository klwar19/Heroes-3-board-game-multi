// @vitest-environment jsdom
/**
 * Polish Set Artifacts — the UI half (art + the three surfaces).
 *
 * LIMIT, stated up front: jsdom cannot compute CSS, so nothing here proves a
 * badge is VISIBLE, correctly positioned or unclipped — only that the right
 * element, with the right image and the right dispatch, is in the DOM. The
 * on-disk art itself is pinned by `src/data/assets/set-artifact-images.test.ts`.
 *
 * Every claim has a rule-OFF (or below-2-pieces / non-member) CONTROL, because
 * the whole feature must render NOTHING on a default table.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  applyAction,
  artifactSetPowerOffers,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  getPlayerView,
  makeCombatUnitFromArmy,
  unitSideRuleOverrides,
  ARTIFACT_SETS,
  NEUTRAL_PLAYER_ID,
  type CardId,
  type CombatState,
  type GameAction,
  type GameState,
  type LegalAction
} from "@/engine";
import { CardFrame } from "./seats";
import { ArtifactSetIconsProvider } from "./artifact-set-badge";
import { artifactSetPowerGroups } from "./artifact-set-powers";
import { BattlefieldBoard, CommandDock, COMMAND_ACTION_TYPES } from "./board";
import { ReactionTray } from "./overlays";
import { CardZoomProvider, useCardZoom } from "./zoom";
import { ArtifactSetPanel, artifactSetPanelSeats } from "@/components/adventure/artifact-set-panel";
import { HeroActionsDock } from "@/components/adventure/hero-actions-dock";
import { PromptTray } from "@/components/adventure/screen";

afterEach(cleanup);

const membersOf = (setId: string) => ARTIFACT_SETS.find((set) => set.id === setId)!.members;
const AA_MEMBERS = membersOf("angelic_alliance");
const WW_MEMBERS = membersOf("wizards_well");
const DC_MEMBERS = membersOf("diplomats_cloak");
const GG_MEMBERS = membersOf("golden_goose");

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A live 2-player adventure with the house rule on (or off, for CONTROLs). */
function makeState(enabled: boolean, seed: string): GameState {
  let state = createAdventureGameState({
    startingBuildings: [],
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "legacy",
    houseRules: { "polish-set-artifacts": enabled }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/** Own exactly `cards` (and nothing else) — the engine re-syncs the status. */
function ownOnly(state: GameState, cards: CardId[], playerId = "p1"): GameState {
  const player = state.players[playerId];
  player.hand = [...cards];
  player.deck = [];
  player.discard = [];
  player.removed = [];
  player.permanents = [];
  player.ongoingCards = [];
  // The status field is synced at the applyAction tail, so push one no-op-ish
  // action through the real pipeline rather than hand-writing the field.
  return applyOk(state, { type: "END_TURN", playerId: state.activePlayerId! });
}

/** Stage a real p1-vs-neutral combat so the combat tiers become offers. */
function stageCombat(state: GameState, ownUnitCount = 1): CombatState {
  const overrides = unitSideRuleOverrides(state);
  const units: CombatState["units"] = {};
  for (let index = 1; index < ownUnitCount; index += 1) {
    const extra = makeCombatUnitFromArmy(
      { id: `own_${index}`, unitDefId: "castle.marksmen", side: "few" },
      "p1",
      `u_own_${index}`,
      index,
      "legacy",
      overrides
    )!;
    units[extra.id] = extra;
  }
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
  units[mine.id] = mine;
  units[foe.id] = foe;
  const hero = getMainHero(state, "p1")!;
  const combat = {
    id: "combat_set_ui",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    activeUnitId: mine.id,
    setup: null,
    awaitingContinue: false,
    outcome: null,
    units,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId ?? "field",
      difficulty: 1,
      hasAzure: false
    }
  } as CombatState;
  state.combat = combat;
  state.phase = "combat";
  state.activePlayerId = "p1";
  return combat;
}

// ===========================================================================
// 1. SET STATUS PANEL — the always-on "ongoing" display
// ===========================================================================

describe("Set Artifacts UI — the set status panel", () => {
  it("renders an active set as its CARD face with a pieces badge", () => {
    let state = makeState(true, "set-ui-panel");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1], AA_MEMBERS[2]]);

    const { container } = render(<ArtifactSetPanel state={state} viewerPlayerId="p1" />);

    const tile = container.querySelector<HTMLElement>('.artifactSetTile[data-set-id="angelic_alliance"]');
    expect(tile, "the Angelic Alliance tile must render at 3 pieces").toBeTruthy();
    // The card FACE, not a text chip.
    const face = tile!.querySelector<HTMLImageElement>("img.artifactSetCardImage");
    expect(face?.getAttribute("src")).toContain("/assets/set-artifacts/cards/angelic_alliance.webp");
    // …and the pieces badge reads the real count out of the engine's status.
    expect(tile!.querySelector(".artifactSetPieces")?.textContent).toBe("3/6");
    // Two bonuses are live at 3 pieces (tiers 2 and 3) — named for the reader.
    expect(tile!.getAttribute("aria-label")).toMatch(/3 of 6 pieces, 2 bonuses active/);
  });

  it("CONTROL: renders NOTHING with the house rule off, even holding the same cards", () => {
    let state = makeState(false, "set-ui-panel-off");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1], AA_MEMBERS[2]]);

    expect(artifactSetPanelSeats(state)).toEqual([]);
    const { container } = render(<ArtifactSetPanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".artifactSetPanel")).toBeNull();
  });

  it("CONTROL: a set at ONE piece grants nothing, so it is not shown", () => {
    let state = makeState(true, "set-ui-panel-one");
    state = ownOnly(state, [AA_MEMBERS[0]]);

    const { container } = render(<ArtifactSetPanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".artifactSetPanel")).toBeNull();
  });

  it("shows EVERY seat's sets, not just the viewer's (the count is public)", () => {
    let state = makeState(true, "set-ui-panel-public");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    state = ownOnly(state, [GG_MEMBERS[0], GG_MEMBERS[1]], "p2");

    const seats = artifactSetPanelSeats(state);
    expect(seats.map((seat) => seat.playerId).sort()).toEqual(["p1", "p2"]);

    // The viewer is p1, yet p2's Golden Goose tile still renders.
    const { container } = render(<ArtifactSetPanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector('.artifactSetTile[data-set-id="golden_goose"]')).toBeTruthy();
    expect(container.querySelector('.artifactSetTile[data-set-id="angelic_alliance"]')).toBeTruthy();
    expect(screen.getByText(/\(you\)/)).toBeTruthy();
  });
});

// ===========================================================================
// 2. SET ICON on every member card face
// ===========================================================================

describe("Set Artifacts UI — the set icon on member cards", () => {
  it("wears its set's icon on a member Artifact's card face while the rule is on", () => {
    const { container } = render(
      <ArtifactSetIconsProvider enabled>
        <CardFrame cardId={AA_MEMBERS[0]} className="fanCardImage" />
      </ArtifactSetIconsProvider>
    );
    const badge = container.querySelector<HTMLImageElement>(".cardSetFrame .cardSetIcon");
    expect(badge, "a set member must wear its set icon").toBeTruthy();
    expect(badge!.getAttribute("data-set-id")).toBe("angelic_alliance");
    expect(badge!.getAttribute("src")).toContain("/assets/set-artifacts/icons/angelic_alliance.webp");
    // The card face itself is untouched — same class, still rendered.
    expect(container.querySelector("img.fanCardImage")).toBeTruthy();
  });

  it("CONTROL: rule OFF ⇒ the SAME card renders a bare face with no badge and no wrapper", () => {
    const { container } = render(
      <ArtifactSetIconsProvider enabled={false}>
        <CardFrame cardId={AA_MEMBERS[0]} className="fanCardImage" />
      </ArtifactSetIconsProvider>
    );
    expect(container.querySelector(".cardSetIcon")).toBeNull();
    expect(container.querySelector(".cardSetFrame")).toBeNull();
    expect(container.querySelector("img.fanCardImage")).toBeTruthy();
  });

  it("CONTROL: a NON-member artifact wears no badge even with the rule on", () => {
    const { container } = render(
      <ArtifactSetIconsProvider enabled>
        <CardFrame cardId="artifact.angel_wings" className="fanCardImage" />
      </ArtifactSetIconsProvider>
    );
    expect(container.querySelector(".cardSetIcon")).toBeNull();
    expect(container.querySelector(".cardSetFrame")).toBeNull();
  });

  it("CONTROL: with no provider at all (every non-table screen) there is no badge", () => {
    const { container } = render(<CardFrame cardId={AA_MEMBERS[0]} className="fanCardImage" />);
    expect(container.querySelector(".cardSetIcon")).toBeNull();
  });
});

// ===========================================================================
// 2b. SET ICON on the ENLARGED (zoom) card — where a card is actually studied
// ===========================================================================

describe("Set Artifacts UI — the set icon on the enlarged card", () => {
  /** A one-button harness that zooms `cardId` through the real provider. */
  function ZoomOpener({ cardId }: { cardId: string }) {
    const zoom = useCardZoom();
    return (
      <button onClick={() => zoom.zoomCard(cardId)} type="button">
        open
      </button>
    );
  }

  function renderZoom(enabled: boolean, cardId: string) {
    const view = render(
      <ArtifactSetIconsProvider enabled={enabled}>
        <CardZoomProvider>
          <ZoomOpener cardId={cardId} />
        </CardZoomProvider>
      </ArtifactSetIconsProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    return view;
  }

  it("wears the set icon on the zoomed card face while the rule is on", () => {
    const { container } = renderZoom(true, AA_MEMBERS[0]);
    // The enlarged reader really opened…
    expect(container.querySelector(".zoomCardStage")).toBeTruthy();
    const badge = container.querySelector<HTMLImageElement>(".zoomSetFrame .cardSetIcon");
    expect(badge, "the enlarged member card must wear its set icon").toBeTruthy();
    expect(badge!.getAttribute("data-set-id")).toBe("angelic_alliance");
    expect(badge!.getAttribute("src")).toContain("/assets/set-artifacts/icons/angelic_alliance.webp");
    // …and the card face itself is untouched.
    expect(container.querySelector("img.zoomCardImage")).toBeTruthy();
  });

  it("CONTROL: rule OFF ⇒ the same zoomed card has no badge and no wrapper", () => {
    const { container } = renderZoom(false, AA_MEMBERS[0]);
    expect(container.querySelector(".zoomCardStage")).toBeTruthy();
    expect(container.querySelector(".cardSetIcon")).toBeNull();
    expect(container.querySelector(".zoomSetFrame")).toBeNull();
    expect(container.querySelector("img.zoomCardImage")).toBeTruthy();
  });

  it("CONTROL: a NON-member artifact zooms without a badge even with the rule on", () => {
    const { container } = renderZoom(true, "artifact.angel_wings");
    expect(container.querySelector(".zoomCardStage")).toBeTruthy();
    expect(container.querySelector(".cardSetIcon")).toBeNull();
  });
});

// ===========================================================================
// 3. ACTION SURFACES — every offer the engine makes must be clickable
// ===========================================================================

describe("Set Artifacts UI — MAP offers reach the hero actions dock", () => {
  it("renders the Wizard's Well draw-then-discard offer and dispatches the exact payload", () => {
    let state = makeState(true, "set-ui-map-ww");
    state = ownOnly(state, [...WW_MEMBERS]);
    state.activePlayerId = "p1";

    const legalActions = getLegalActions(state, "p1");
    const offer = legalActions.find(
      (entry) => entry.action.type === "USE_ARTIFACT_SET_POWER" && entry.action.setId === "wizards_well"
    );
    expect(offer, "the engine must offer the Wizard's Well map tier").toBeTruthy();

    const onAction = vi.fn();
    render(<HeroActionsDock legalActions={legalActions} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Wizard's Well/i }));
    expect(onAction).toHaveBeenCalledWith(offer!.action);
  });

  it("renders ONE button per Diplomat's Cloak deck offer, each dispatching its own deck", () => {
    let state = makeState(true, "set-ui-map-dc");
    state = ownOnly(state, [...DC_MEMBERS]);
    state.activePlayerId = "p1";

    const legalActions = getLegalActions(state, "p1");
    const scries = legalActions.filter(
      (entry) => entry.action.type === "USE_ARTIFACT_SET_POWER" && entry.action.setId === "diplomats_cloak"
    );
    expect(scries.length, "one scry offer per populated Neutral deck").toBeGreaterThan(1);

    // Colliding React keys only WARN, so count alone cannot catch a per-deck
    // key regression — assert the duplicate-key warning is absent too.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onAction = vi.fn();
    render(<HeroActionsDock legalActions={legalActions} onAction={onAction} />);
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key/i);
    consoleError.mockRestore();

    expect(screen.getAllByRole("button", { name: /Diplomat's Cloak/i })).toHaveLength(scries.length);
    const bronze = scries.find(
      (entry) => entry.action.type === "USE_ARTIFACT_SET_POWER" && entry.action.neutralTier === "bronze"
    )!;
    fireEvent.click(screen.getByRole("button", { name: /top bronze Neutral card/i }));
    expect(onAction).toHaveBeenCalledWith(bronze.action);
  });

  it("CONTROL: rule OFF ⇒ no offer and no dock at all", () => {
    let state = makeState(false, "set-ui-map-off");
    state = ownOnly(state, [...WW_MEMBERS, ...DC_MEMBERS]);
    state.activePlayerId = "p1";

    const legalActions = getLegalActions(state, "p1");
    expect(legalActions.some((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER")).toBe(false);
    const { container } = render(<HeroActionsDock legalActions={legalActions} onAction={vi.fn()} />);
    expect(container.querySelector('.heroActionButton[title*="Artifact set"]')).toBeNull();
  });
});

describe("Set Artifacts UI — COMBAT offers reach ONE dock entry, then the board", () => {
  /** Dock + battlefield under the SAME arming provider, exactly as page.tsx. */
  function renderTable(state: GameState, legalActions: LegalAction[], onAction: (action: GameAction) => void) {
    return render(
      <ArtifactSetIconsProvider enabled>
        <CardZoomProvider>
          <CommandDock legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />
          <BattlefieldBoard
            legalActions={legalActions}
            onAction={onAction}
            onInspect={() => {}}
            selectedCardAction={null}
            state={state}
            viewerPlayerId="p1"
          />
        </CardZoomProvider>
      </ArtifactSetIconsProvider>
    );
  }

  it("collapses every set offer behind ONE entry button — no flat per-target buttons", () => {
    let state = makeState(true, "set-ui-combat-entry");
    state = ownOnly(state, [...AA_MEMBERS]);
    stageCombat(state, 2);

    const legalActions = getLegalActions(state, "p1");
    const setOffers = legalActions.filter(
      (entry) =>
        entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
    );
    expect(setOffers.length, "two own units ⇒ the selection tier alone is 2 offers").toBeGreaterThan(1);

    render(<CommandDock legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // ONE entry, and NOT one look-alike button per (power x target) any more.
    expect(screen.getByRole("button", { name: /Set powers \(\d+\)/ })).toBeTruthy();
    for (const offer of setOffers) {
      expect(screen.queryByRole("button", { name: offer.label }), `${offer.label} must not be a flat dock button`).toBeNull();
    }
    // The dock's own filter must not carry the two types back (that IS the
    // regression: re-adding them re-floods the dock).
    expect(COMMAND_ACTION_TYPES.has("SELECT_ARTIFACT_SET_UNIT")).toBe(false);
    expect(COMMAND_ACTION_TYPES.has("USE_ARTIFACT_SET_POWER")).toBe(false);
  });

  it("the window lists each distinct POWER once, not once per target unit", () => {
    let state = makeState(true, "set-ui-combat-window");
    state = ownOnly(state, [...AA_MEMBERS]);
    const combat = stageCombat(state, 2);
    state.players.p1.combatStats = {
      ...(state.players.p1.combatStats ?? {}),
      artifactSetSelections: { angelic_alliance: "u_own_0" }
    } as never;
    combat.round = 1;

    const legalActions = getLegalActions(state, "p1");
    const groups = artifactSetPowerGroups(legalActions);
    const setOffers = legalActions.filter(
      (entry) =>
        entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
    );
    // The whole point: many offers, few POWERS.
    expect(setOffers.length).toBeGreaterThan(groups.length);
    expect(groups.every((group) => group.offers.length >= 1)).toBe(true);
    // Nothing is dropped by the grouping.
    expect(groups.reduce((sum, group) => sum + group.offers.length, 0)).toBe(setOffers.length);

    render(<CommandDock legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Set powers \(\d+\)/ }));
    const rows = document.querySelectorAll(".setPowerWindow .setPowerRow");
    expect(rows).toHaveLength(groups.length);
    for (const group of groups) {
      expect(document.querySelector(`.setPowerRow[data-power-key="${group.key}"]`)).toBeTruthy();
    }
  });

  it("a SINGLE-target power resolves with one click, dispatching the exact engine action", () => {
    let state = makeState(true, "set-ui-combat-single");
    // Power of the Dragon Father prints no selection tier; with ONE own unit its
    // tier-2 advantage roll has exactly one legal target.
    // (3 pieces, not 2: this set's tier 2 is the roll-the-higher INSTANT, which
    // lives in the attack window and is deliberately not a dock power. Tier 3 —
    // the Defense token — is the single-target dock offer here.)
    state = ownOnly(state, membersOf("power_of_the_dragon_father").slice(0, 3));
    stageCombat(state);

    const legalActions = getLegalActions(state, "p1");
    const use = legalActions.find((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER")!;
    expect(use).toBeTruthy();

    const onAction = vi.fn();
    render(<CommandDock legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Set powers \(\d+\)/ }));
    fireEvent.click(screen.getByRole("button", { name: use.label }));
    expect(onAction).toHaveBeenCalledWith(use.action);
    // …and the window closed behind it.
    expect(document.querySelector(".setPowerWindow")).toBeNull();
  });

  it("a MULTI-target power ARMS the board: the legal units glow and a click uses that unit's own offer", () => {
    let state = makeState(true, "set-ui-combat-arm");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    stageCombat(state, 2);

    const legalActions = getLegalActions(state, "p1");
    const selects = legalActions.filter((entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT");
    expect(selects.length, "two own units ⇒ two selection offers").toBe(2);

    const onAction = vi.fn();
    const { container } = renderTable(state, legalActions, onAction);

    // Nothing glows before arming.
    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Set powers \(\d+\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /choose one of 2 units on the battlefield/i }));
    // The window steps out of the way so the board can be read and clicked.
    expect(document.querySelector(".setPowerWindow")).toBeNull();
    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(2);
    expect(screen.getByLabelText("Set power aiming")).toBeTruthy();

    // Click the SECOND unit — the dispatched payload must be that unit's offer.
    const second = selects.find(
      (entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT" && entry.action.unitId === "u_own_1"
    )!;
    fireEvent.click(container.querySelector('.battleCell.artifactSetTarget[data-fx-unit="u_own_1"]')!);
    expect(onAction).toHaveBeenCalledWith(second.action);
    // The aim is spent — the glow is gone.
    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(0);
  });

  it("AUTO-DISARMS when the armed power stops being offered (the combat-start window closed)", () => {
    // The board stores only the power's GROUP KEY, so an aim left armed when the
    // "at the beginning of the combat" window closes (a unit acted, the round
    // rolled on) must drop its glow and its Cancel button instead of promising a
    // click the engine would refuse.
    let state = makeState(true, "set-ui-auto-disarm");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    const combat = stageCombat(state, 2);

    const legalActions = getLegalActions(state, "p1");
    const onAction = vi.fn();
    const { container, rerender } = renderTable(state, legalActions, onAction);
    fireEvent.click(screen.getByRole("button", { name: /Set powers \(\d+\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /choose one of 2 units on the battlefield/i }));
    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Cancel Angelic Alliance$/ })).toBeTruthy();

    // The fighting begins — the engine now offers no selection at all.
    combat.units.u_own_0.activatedThisRound = true;
    combat.units.u_own_0.attackedThisActivation = true;
    const closed = getLegalActions(state, "p1");
    expect(closed.some((entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT")).toBe(false);

    rerender(
      <ArtifactSetIconsProvider enabled>
        <CardZoomProvider>
          <CommandDock legalActions={closed} onAction={onAction} state={state} viewerPlayerId="p1" />
          <BattlefieldBoard
            legalActions={closed}
            onAction={onAction}
            onInspect={() => {}}
            selectedCardAction={null}
            state={state}
            viewerPlayerId="p1"
          />
        </CardZoomProvider>
      </ArtifactSetIconsProvider>
    );

    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(0);
    expect(screen.queryByLabelText("Set power aiming")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Cancel Angelic Alliance$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Set powers \(\d+\)/ })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Cancel disarms the aim without dispatching anything", () => {
    let state = makeState(true, "set-ui-combat-cancel");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    stageCombat(state, 2);

    const legalActions = getLegalActions(state, "p1");
    const onAction = vi.fn();
    const { container } = renderTable(state, legalActions, onAction);

    fireEvent.click(screen.getByRole("button", { name: /Set powers \(\d+\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /choose one of 2 units on the battlefield/i }));
    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(2);

    fireEvent.click(within(screen.getByLabelText("Set power aiming")).getByRole("button", { name: "Cancel" }));
    expect(container.querySelectorAll(".battleCell.artifactSetTarget")).toHaveLength(0);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("EVERY combat offer the engine makes stays reachable (no orphans)", () => {
    let state = makeState(true, "set-ui-combat-sweep");
    // Full Angelic Alliance, the pick already made, TWO own units — so the sweep
    // covers both action types, single-target rows AND multi-target aiming.
    state = ownOnly(state, [...AA_MEMBERS]);
    const combat = stageCombat(state, 2);
    state.players.p1.combatStats = {
      ...(state.players.p1.combatStats ?? {}),
      artifactSetSelections: { angelic_alliance: "u_own_0" }
    } as never;
    combat.round = 1;

    const legalActions = getLegalActions(state, "p1");
    const setOffers = legalActions.filter(
      (entry) =>
        entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
    );
    expect(setOffers.length, "fixture must produce the 2 selection offers plus the bound tiers").toBe(5);
    // Cross-check against the shared derivation the reducer validates with.
    expect(artifactSetPowerOffers(state, "p1").length).toBe(setOffers.length);

    const dispatched: GameAction[] = [];
    for (const offer of setOffers) {
      cleanup();
      const onAction = vi.fn((action: GameAction) => void dispatched.push(action));
      const { container } = renderTable(state, legalActions, onAction);
      fireEvent.click(screen.getByRole("button", { name: /Set powers \(\d+\)/ }));
      const group = artifactSetPowerGroups(legalActions).find((entry) => entry.offers.includes(offer))!;
      const row = document.querySelector<HTMLElement>(`.setPowerRow[data-power-key="${group.key}"]`)!;
      expect(row, `${offer.label} has no power row`).toBeTruthy();
      fireEvent.click(row);
      if (group.targets.size > 1) {
        // Aimed on the board: click THIS offer's own unit.
        const unitId =
          offer.action.type === "SELECT_ARTIFACT_SET_UNIT" || offer.action.type === "USE_ARTIFACT_SET_POWER"
            ? offer.action.unitId
            : undefined;
        const cell = container.querySelector(`.battleCell.artifactSetTarget[data-fx-unit="${unitId}"]`);
        expect(cell, `${offer.label} is not clickable on the board`).toBeTruthy();
        fireEvent.click(cell!);
      }
      expect(onAction).toHaveBeenLastCalledWith(offer.action);
    }
    expect(dispatched).toHaveLength(setOffers.length);
  });

  it("CONTROL: rule OFF ⇒ the same combat offers nothing and the dock shows no set entry", () => {
    let state = makeState(false, "set-ui-combat-off");
    state = ownOnly(state, [...AA_MEMBERS]);
    stageCombat(state, 2);

    const legalActions = getLegalActions(state, "p1");
    expect(
      legalActions.some(
        (entry) =>
          entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
      )
    ).toBe(false);
    render(<CommandDock legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("button", { name: /Set powers/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Angelic Alliance/i })).toBeNull();
  });
});

describe("Set Artifacts UI — the Diplomat's Cloak scry window", () => {
  it("renders in the GENERIC prompt tray (its context is excluded nowhere)", () => {
    let state = makeState(true, "set-ui-scry-tray");
    state = ownOnly(state, [...DC_MEMBERS]);
    state.activePlayerId = "p1";
    state = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "bronze"
    });
    const choice = state.pendingChoice;
    expect(choice && choice.type === "OPTION_CHOICE" ? choice.context : null).toBe("artifact-set-scry");

    const legalActions = getLegalActions(state, "p1");
    const options = legalActions.filter((entry) => entry.action.type === "CHOOSE_OPTION");
    expect(options).toHaveLength(2);

    const onAction = vi.fn();
    render(
      <PromptTray legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    // Both printed answers are clickable, and each dispatches its own index.
    for (const option of options) {
      fireEvent.click(screen.getByRole("button", { name: option.label }));
      expect(onAction).toHaveBeenLastCalledWith(option.action);
    }
  });
});

// ===========================================================================
// 6. THE POP-UP INSTANT (2026-08-11 ruling) — the REACTION TRAY, not the dock
//
// "Rolls 2 dice and resolves the higher result" (Angelic Alliance 3, Power of the
// Dragon Father 2) is an instant offered inside the attacking unit's own attack
// window. Its surface is the instant window's tray; the command dock's Set-powers
// menu must NOT show a second, duplicate button for it.
// ===========================================================================

describe("Set Artifacts UI — the roll-the-higher pop-up lives in the instant window", () => {
  /** p1's Halberdiers adjacent to a guard, 3 AA pieces in the (masked-safe) deck. */
  function popupWindow(seed: string): GameState {
    let state = makeState(true, seed);
    state = ownOnly(state, []);
    state.players.p1.deck = [...AA_MEMBERS.slice(0, 3)];
    const combat = stageCombat(state);
    combat.units.u_own_0.position = 5;
    combat.units.u_foe_0.position = 6;
    combat.units.u_foe_0.maxHealth = 40;
    combat.units.u_foe_0.defense = 0;
    combat.dice = { faces: [-1, -1, 0, 0, 1, 1], seed: `${seed}-dice`, rollCount: 0, scriptedRolls: [-1, 1, -1, 1] };
    state.activePlayerId = "p1";
    state.priorityPlayerId = "p1";
    let next = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: "angelic_alliance", unitId: "u_own_0" });
    next = applyOk(next, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "u_own_0", defenderId: "u_foe_0" });
    expect(next.reactionWindow?.triggerEvent.type, "the engine must have opened the pop-up window").toBe(
      "UNIT_ATTACK_DECLARED"
    );
    return next;
  }

  it("renders a tray tile that dispatches the exact engine action", () => {
    const state = popupWindow("set-ui-popup-tray");
    const legalActions = getLegalActions(state, "p1");
    const offer = legalActions.find((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER")!;
    expect(offer, "the engine offer is the premise of this test").toBeTruthy();

    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={legalActions}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    // The tray must not read "No playable instants" — that WAS the shape of an
    // engine offer with no button.
    expect(document.querySelector(".trayEmpty")).toBeNull();
    const button = screen.getByRole("button", { name: offer.label });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(offer.action);
    // …and the dispatched action really resolves (end-to-end sanity).
    expect(applyAction(state, offer.action).errors).toEqual([]);
  });

  it("the tile wears the owning set's icon", () => {
    const state = popupWindow("set-ui-popup-icon");
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    const icon = document.querySelector<HTMLElement>('.reactionTray img[data-set-id="angelic_alliance"]');
    expect(icon).toBeTruthy();
    expect(icon!.getAttribute("src")).toContain("/assets/set-artifacts/icons/angelic_alliance.webp");
  });

  it("the command dock shows NO duplicate button for it (the grouping drops it)", () => {
    const state = popupWindow("set-ui-popup-no-dock");
    const legalActions = getLegalActions(state, "p1");
    // The grouping — the ONE derivation both dock surfaces read — drops it.
    expect(artifactSetPowerGroups(legalActions)).toEqual([]);

    const { container } = render(
      <ArtifactSetIconsProvider enabled>
        <CardZoomProvider>
          <CommandDock legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
        </CardZoomProvider>
      </ArtifactSetIconsProvider>
    );
    expect(container.querySelector(".setPowerButton"), "no Set-powers entry while only the instant is offered").toBeNull();

    // CONTROL: the same grouping DOES keep an ordinary dock tier, so the empty
    // result above is the attack-window exclusion and not a broken grouping.
    const dockOffer: LegalAction[] = [
      {
        action: { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: "angelic_alliance", tier: 5, unitId: "u_own_0" },
        label: "Angelic Alliance (5): +1 AT — Halberdiers"
      }
    ];
    expect(artifactSetPowerGroups(dockOffer)).toHaveLength(1);
  });

  it("the MAP hero-actions dock shows no button for it either", () => {
    // Defensive: however the two table screens are mounted, the map dock must
    // never grow a duplicate button for a window-only instant.
    const windowOffer: LegalAction[] = [
      {
        action: { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: "angelic_alliance", tier: 3, unitId: "u_own_0" },
        label: "Angelic Alliance (3): Halberdiers rolls 2 Attack dice and keeps the higher on THIS attack"
      }
    ];
    const { container } = render(<HeroActionsDock legalActions={windowOffer} onAction={vi.fn()} />);
    expect(container.querySelectorAll(".heroActionButton")).toHaveLength(0);

    // CONTROL: a real MAP tier still renders (so the emptiness is the filter).
    cleanup();
    const mapOffer: LegalAction[] = [
      {
        action: { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: "wizards_well", tier: 2 },
        label: "Wizard's Well: draw 1 then discard 1"
      }
    ];
    const map = render(<HeroActionsDock legalActions={mapOffer} onAction={vi.fn()} />);
    expect(map.container.querySelectorAll(".heroActionButton")).toHaveLength(1);
  });
});

/** Reachability sweep: the two action types have a surface on their own screen. */
describe("Set Artifacts UI — no orphan action types", () => {
  it("both engine action types are covered by a rendered surface", () => {
    // Combat half: BOTH types are deliberately OUT of the dock's flat filter —
    // they reach the player through the set-powers window / board aiming, which
    // the sweep above exercises offer-by-offer.
    expect(COMMAND_ACTION_TYPES.has("SELECT_ARTIFACT_SET_UNIT")).toBe(false);
    expect(COMMAND_ACTION_TYPES.has("USE_ARTIFACT_SET_POWER")).toBe(false);
    // Map half: only USE_ARTIFACT_SET_POWER ever reaches a map action list, and
    // the dock renders it (asserted for real above).
    const mapOnly: LegalAction[] = [
      {
        action: { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: "wizards_well", tier: 2 },
        label: "Wizard's Well: draw 1 then discard 1"
      }
    ];
    const { container } = render(<HeroActionsDock legalActions={mapOnly} onAction={vi.fn()} />);
    expect(container.querySelectorAll(".heroActionButton")).toHaveLength(1);
  });
});
