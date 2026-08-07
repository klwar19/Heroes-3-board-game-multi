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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  applyAction,
  artifactSetPowerOffers,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
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
import { CommandDock, COMMAND_ACTION_TYPES } from "./board";
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
function stageCombat(state: GameState): CombatState {
  const overrides = unitSideRuleOverrides(state);
  const units: CombatState["units"] = {};
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

describe("Set Artifacts UI — COMBAT offers reach the command dock", () => {
  it("renders the round-1 unit selection as a command button and dispatches it", () => {
    let state = makeState(true, "set-ui-combat-select");
    state = ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    stageCombat(state);

    const legalActions = getLegalActions(state, "p1");
    const select = legalActions.find((entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT");
    expect(select, "the engine must offer the Angelic Alliance selection in round 1").toBeTruthy();
    // The dock is the ONLY surface — an offer type it does not carry is an
    // orphan (the Polish Wait / Surrender precedent).
    expect(COMMAND_ACTION_TYPES.has(select!.action.type)).toBe(true);

    const onAction = vi.fn();
    render(<CommandDock legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Angelic Alliance: select/i }));
    expect(onAction).toHaveBeenCalledWith(select!.action);
  });

  it("renders a once-per-combat tier power as a command button and dispatches it", () => {
    let state = makeState(true, "set-ui-combat-power");
    // Power of the Dragon Father prints no selection tier, so its tier-2
    // advantage roll is offered straight away against a freely-picked own unit.
    state = ownOnly(state, membersOf("power_of_the_dragon_father").slice(0, 2));
    stageCombat(state);

    const legalActions = getLegalActions(state, "p1");
    const use = legalActions.find((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER");
    expect(use, "the engine must offer the PofDF tier-2 power").toBeTruthy();
    expect(COMMAND_ACTION_TYPES.has(use!.action.type)).toBe(true);

    const onAction = vi.fn();
    render(<CommandDock legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Power of the Dragon Father/i }));
    expect(onAction).toHaveBeenCalledWith(use!.action);
  });

  it("EVERY combat offer the engine makes is a rendered, clickable button (no orphans)", () => {
    let state = makeState(true, "set-ui-combat-sweep");
    // Full Angelic Alliance: the selection tier plus four bound tiers.
    state = ownOnly(state, [...AA_MEMBERS]);
    const combat = stageCombat(state);
    // Make the tier-2 pick so the "selected-own" tiers 3-6 also become offers.
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
    // A full 6-piece Angelic Alliance with the pick already made offers the
    // round-1 selection PLUS the four bound tiers (3-6) — so this really sweeps
    // both action types and both offer shapes, not just one button.
    expect(setOffers.length, "fixture must produce the selection plus 4 bound tiers").toBe(5);
    // Cross-check against the shared derivation the reducer validates with.
    expect(artifactSetPowerOffers(state, "p1").length).toBe(setOffers.length);

    const onAction = vi.fn();
    render(<CommandDock legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);
    for (const offer of setOffers) {
      const button = screen.getByRole("button", { name: offer.label });
      fireEvent.click(button);
      expect(onAction).toHaveBeenLastCalledWith(offer.action);
    }
    expect(onAction).toHaveBeenCalledTimes(setOffers.length);
  });

  it("CONTROL: rule OFF ⇒ the same combat offers nothing and the dock shows no set button", () => {
    let state = makeState(false, "set-ui-combat-off");
    state = ownOnly(state, [...AA_MEMBERS]);
    stageCombat(state);

    const legalActions = getLegalActions(state, "p1");
    expect(
      legalActions.some(
        (entry) =>
          entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
      )
    ).toBe(false);
    render(<CommandDock legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
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

/** Reachability sweep: the two action types have a surface on their own screen. */
describe("Set Artifacts UI — no orphan action types", () => {
  it("both engine action types are covered by a rendered surface", () => {
    const surfaced: Record<string, string> = {
      SELECT_ARTIFACT_SET_UNIT: "combat command dock",
      USE_ARTIFACT_SET_POWER: "combat command dock + map hero-actions dock"
    };
    // Combat half: COMMAND_ACTION_TYPES is the dock's only filter.
    for (const type of Object.keys(surfaced)) {
      expect(COMMAND_ACTION_TYPES.has(type as GameAction["type"]), `${type} has no dock entry`).toBe(true);
    }
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
