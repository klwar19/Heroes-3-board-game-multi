// @vitest-environment jsdom
/**
 * The battlefield card's LIVE-EFFECT icon rail (`.boardCardEffectIcons`).
 *
 * LIMIT, stated up front: jsdom cannot compute CSS, so NOTHING here proves an
 * icon is visible, correctly positioned, unclipped, or clear of the printed stat
 * rail / name plate / HUD — only that the right element, with the right image and
 * the right tooltip text, is in the DOM and that it appears and disappears with
 * the state it reads. The `pointer-events: none` rail also means the native
 * `title` tooltip does not fire on hover in a real browser (see the component's
 * doc comment); the attribute is the accessible text and the DOM contract.
 *
 * WHAT ALREADY RENDERED BEFORE THIS RAIL (so these tests are not re-pinning it):
 * combat TOKENS (Attack / Weakness / Corrosion / Paralysis) drew on the card as
 * `TokenChips`, and stat SWINGS drew on the outer-right `.boardCardStatTokens`
 * rail. A DEFENSE TOKEN drew only a shield on the initiative rail and a line of
 * inspector text — nothing on the battlefield card. A Set Artifact bonus drew
 * NOTHING anywhere on the board.
 *
 * Every claim has a CONTROL: the same board with the effect gone / the token
 * absent must render no rail at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  applyAction,
  artifactSetPowerOffers,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  makeActiveEffect,
  makeCombatUnitFromArmy,
  unitSideRuleOverrides,
  ARTIFACT_SETS,
  NEUTRAL_PLAYER_ID,
  type CardId,
  type CombatState,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import { BattlefieldBoard } from "./board";
import { unitEffectIcons } from "./unit-effect-icons";
import { ArtifactSetIconsProvider } from "./artifact-set-badge";
import { CardZoomProvider } from "./zoom";

afterEach(cleanup);

const AA = "angelic_alliance";
const AA_MEMBERS = ARTIFACT_SETS.find((set) => set.id === AA)!.members;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A live 2-player adventure, with the Set Artifacts house rule on or off. */
function makeState(setsEnabled: boolean, seed: string): GameState {
  let state = createAdventureGameState({
    startingBuildings: [],
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "legacy",
    houseRules: { "polish-set-artifacts": setsEnabled }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/** Own exactly `cards` — the engine re-syncs the set status through the tail. */
function ownOnly(state: GameState, cards: CardId[]): GameState {
  const player = state.players.p1;
  player.hand = [...cards];
  player.deck = [];
  player.discard = [];
  player.removed = [];
  player.permanents = [];
  player.ongoingCards = [];
  return applyOk(state, { type: "END_TURN", playerId: state.activePlayerId! });
}

/** A real p1-vs-neutral combat so the combat tiers become legal offers. */
function stageCombat(state: GameState): CombatState {
  const overrides = unitSideRuleOverrides(state);
  const mine = makeCombatUnitFromArmy(
    { id: "own_0", unitDefId: "castle.marksmen", side: "few" },
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
  const combat = {
    id: "combat_effect_icons",
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
  state.combat = combat;
  state.phase = "combat";
  state.activePlayerId = "p1";
  return combat;
}

/** The real battlefield, exactly as page.tsx mounts it. */
function renderBoard(state: GameState, viewerPlayerId: PlayerId = "p1") {
  return render(
    <ArtifactSetIconsProvider enabled>
      <CardZoomProvider>
        <BattlefieldBoard
          legalActions={getLegalActions(state, viewerPlayerId)}
          onAction={vi.fn()}
          onInspect={() => {}}
          selectedCardAction={null}
          state={state}
          viewerPlayerId={viewerPlayerId}
        />
      </CardZoomProvider>
    </ArtifactSetIconsProvider>
  );
}

/** A 6-piece Angelic Alliance holder in a live combat, with its unit selected. */
function aaCombatWithSelection(seed: string): GameState {
  let state = makeState(true, seed);
  state = ownOnly(state, [...AA_MEMBERS]);
  stageCombat(state);
  expect(
    artifactSetPowerOffers(state, "p1").some((offer) => offer.kind === "select"),
    "the selection tier must be on offer in combat round 1"
  ).toBe(true);
  return applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
}

// ===========================================================================
// 1. SET-ARTIFACT effects wear their OWNING SET's icon
// ===========================================================================

describe("battlefield effect icons — Set Artifact bonuses", () => {
  it("a unit carrying a set-sourced bonus wears that set's icon with a naming tooltip", () => {
    // Tier 2 (the selection) already lays a tagged INITIATIVE_BONUS; tier 6 is
    // the +1 Defense buff.
    //
    // NOTE (2026-08-11): this used to use tier 3, "the better of 2 dice". That
    // tier is now an INSTANT played inside the attacking unit's own reaction
    // window and lifts exactly one roll through a stack-item modifier, so it lays
    // NO active effect and has nothing to hang an icon on — there is no board
    // frame in which a player could read it (the attack resolves in the same
    // action that closes the window). No set tier creates an ATTACK_ROLL_ADVANTAGE
    // effect any more; the set-sourced roll-mode icon path is still exercised by
    // Armor of the Damned's disadvantage curse.
    let state = aaCombatWithSelection("effect-icons-adv");
    state = applyOk(state, { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: AA, tier: 6, unitId: "u_own_0" });

    // The pure derivation first: the bonus really is attributed to the set.
    const icons = unitEffectIcons(state, state.combat!.units.u_own_0);
    const defense = icons.find((icon) => icon.label.includes("+1 Defense"));
    expect(defense?.kind).toBe("artifact-set");
    expect(defense?.setId).toBe(AA);
    expect(defense?.label).toBe("Angelic Alliance (set) — +1 Defense");
    // …and no generic dice icon is invented on top of it.
    expect(icons.filter((icon) => icon.kind === "roll-advantage")).toHaveLength(0);

    const { container } = renderBoard(state);
    const rail = container.querySelector(".boardCardEffectIcons");
    expect(rail, "the unit card must carry the live-effect rail").toBeTruthy();
    const badge = rail!.querySelector<HTMLElement>(`.boardEffectIcon.artifact-set[data-set-id="${AA}"]`);
    expect(badge, "the set-sourced effect must wear the Angelic Alliance icon").toBeTruthy();
    expect(badge!.querySelector("img")!.getAttribute("src")).toContain(
      "/assets/set-artifacts/icons/angelic_alliance.webp"
    );
    expect(
      rail!.querySelector('[title="Angelic Alliance (set) — +1 Defense"]'),
      "the tooltip must name the set AND what it does"
    ).toBeTruthy();
  });

  it("the selection tier's initiative bonus is named too, and each live effect gets its own icon", () => {
    let state = aaCombatWithSelection("effect-icons-init");
    const afterSelect = unitEffectIcons(state, state.combat!.units.u_own_0);
    expect(afterSelect.map((icon) => icon.label)).toEqual(["Angelic Alliance (set) — +1 Initiative"]);

    state = applyOk(state, { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: AA, tier: 5, unitId: "u_own_0" });
    const labels = unitEffectIcons(state, state.combat!.units.u_own_0).map((icon) => icon.label);
    expect(labels).toContain("Angelic Alliance (set) — +1 Initiative");
    expect(labels).toContain("Angelic Alliance (set) — +1 Attack");

    const { container } = renderBoard(state);
    expect(container.querySelectorAll(`.boardEffectIcon.artifact-set[data-set-id="${AA}"]`)).toHaveLength(2);
  });

  it("the icons are public: a NON-participant seat's board shows the same rail", () => {
    let state = aaCombatWithSelection("effect-icons-public");
    state = applyOk(state, { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: AA, tier: 6, unitId: "u_own_0" });

    const { container } = renderBoard(state, "p2");
    expect(container.querySelector(`.boardEffectIcon.artifact-set[data-set-id="${AA}"]`)).toBeTruthy();
  });

  it("CONTROL: the icon is GONE once the effect ends", () => {
    let state = aaCombatWithSelection("effect-icons-expiry");
    state = applyOk(state, { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: AA, tier: 6, unitId: "u_own_0" });
    expect(container_setIcons(renderBoard(state).container)).toBeGreaterThan(0);
    cleanup();

    // Same state, effects dropped (what expiry leaves behind) — no rail at all.
    state = { ...state, activeEffects: [] };
    expect(unitEffectIcons(state, state.combat!.units.u_own_0)).toEqual([]);
    const { container } = renderBoard(state);
    expect(container.querySelector(".boardCardEffectIcons")).toBeNull();
  });

  it("CONTROL: a legacy effect with no set tag (and a plain unit) wears no set icon", () => {
    const state = makeState(false, "effect-icons-legacy");
    stageCombat(state);
    const unit = state.combat!.units.u_own_0;
    // The shape a pre-`artifactSetId` snapshot holds: a real unit effect with no
    // set tag. It must not be attributed to any set — and must not crash.
    state.activeEffects.push(
      makeActiveEffect(
        state,
        { name: "Some old effect", duration: { type: "combat" }, scope: "unit", modifiers: [{ type: "ATTACK_BONUS", amount: 1 }] },
        { type: "system" },
        "p1",
        { type: "unit", unitId: unit.id }
      )
    );
    expect(unitEffectIcons(state, state.combat!.units.u_own_0)).toEqual([]);
    const { container } = renderBoard(state);
    expect(container.querySelector(".boardCardEffectIcons")).toBeNull();
  });
});

/** How many set icons the rendered board shows (a tiny helper for the CONTROL). */
function container_setIcons(container: HTMLElement): number {
  return container.querySelectorAll(".boardEffectIcon.artifact-set").length;
}

// ===========================================================================
// 2. The DEFENSE TOKEN — which drew nothing on the battlefield card before
// ===========================================================================

describe("battlefield effect icons — the Defense token", () => {
  it("a Defense-token carrier wears the printed Defense-token disc", () => {
    let state = aaCombatWithSelection("effect-icons-defense");
    expect(state.combat!.units.u_own_0.defenseToken).toBe(false); // control: not yet
    expect(renderBoard(state).container.querySelector(".boardEffectIcon.defense-token")).toBeNull();
    cleanup();

    // Angelic Alliance tier 4 IS a real Defense-token grant, so this is the
    // engine's own flow rather than a hand-set flag.
    state = applyOk(state, { type: "USE_ARTIFACT_SET_POWER", playerId: "p1", setId: AA, tier: 4, unitId: "u_own_0" });
    expect(state.combat!.units.u_own_0.defenseToken).toBe(true);

    const icons = unitEffectIcons(state, state.combat!.units.u_own_0);
    expect(icons[0]?.kind).toBe("defense-token");
    expect(icons[0]?.label).toContain("Defend die");

    const { container } = renderBoard(state);
    const badge = container.querySelector<HTMLElement>(".boardEffectIcon.defense-token");
    expect(badge, "a Defense token must show on the battlefield card").toBeTruthy();
    expect(badge!.querySelector("img")!.getAttribute("src")).toContain("/assets/board/tokens/combat-defense.webp");
    expect(badge!.getAttribute("title")).toContain("Defense token");
  });

  it("shows for a token from ANY source, and disappears when the token is spent", () => {
    // No Set Artifacts at all: the plainest possible Defend action / grant.
    const state = makeState(false, "effect-icons-defense-plain");
    stageCombat(state);
    state.combat!.units.u_own_0.defenseToken = true;

    expect(unitEffectIcons(state, state.combat!.units.u_own_0).map((icon) => icon.kind)).toEqual(["defense-token"]);
    expect(renderBoard(state).container.querySelector(".boardEffectIcon.defense-token")).toBeTruthy();
    cleanup();

    state.combat!.units.u_own_0.defenseToken = false;
    expect(unitEffectIcons(state, state.combat!.units.u_own_0)).toEqual([]);
    expect(renderBoard(state).container.querySelector(".boardCardEffectIcons")).toBeNull();
  });
});

// ===========================================================================
// 3. Non-set advantage / disadvantage — the generic two-dice glyph
// ===========================================================================

describe("battlefield effect icons — non-set roll modes", () => {
  it("a NON-set disadvantage effect wears the generic dice glyph", () => {
    const state = makeState(false, "effect-icons-puppet");
    stageCombat(state);
    // The shape the Shaman's Puppet / Nightmare Fear card path produces.
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Shaman's Puppet",
          duration: { type: "next-activation" },
          scope: "unit",
          modifiers: [{ type: "ATTACK_ROLL_DISADVANTAGE" }]
        },
        { type: "system" },
        "p1",
        { type: "unit", unitId: "u_own_0" }
      )
    );

    const icons = unitEffectIcons(state, state.combat!.units.u_own_0);
    expect(icons.map((icon) => icon.kind)).toEqual(["roll-disadvantage"]);
    expect(icons[0].label).toBe("Rolls 2 Attack dice and keeps the lower");
    expect(icons[0].image, "the generic glyph is a lucide icon, not an asset").toBeUndefined();

    const { container } = renderBoard(state);
    const badge = container.querySelector<HTMLElement>(".boardEffectIcon.roll-disadvantage");
    expect(badge).toBeTruthy();
    expect(badge!.querySelector("svg"), "the dice glyph renders as an svg").toBeTruthy();
    expect(badge!.getAttribute("title")).toBe("Rolls 2 Attack dice and keeps the lower");
  });

  it("CONTROL: an ordinary unit with nothing live renders no rail at all", () => {
    const state = makeState(false, "effect-icons-plain");
    stageCombat(state);
    expect(unitEffectIcons(state, state.combat!.units.u_own_0)).toEqual([]);
    expect(unitEffectIcons(state, state.combat!.units.u_foe_0)).toEqual([]);
    const { container } = renderBoard(state);
    expect(container.querySelector(".boardCardEffectIcons")).toBeNull();
    expect(container.querySelector(".boardEffectIcon")).toBeNull();
    // …while the card itself still renders exactly as before.
    expect(container.querySelector(".boardCard")).toBeTruthy();
  });
});

// ===========================================================================
// 4. Card-sourced ongoing effects — card icon + duration counter
// ===========================================================================

describe("battlefield effect icons — ongoing Spell markers", () => {
  it("shows Fire Shield outside its target card with a two-round counter", () => {
    const state = makeState(false, "effect-icons-fire-shield");
    stageCombat(state);
    state.combat!.round = 2;
    const unit = state.combat!.units.u_own_0;
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Fire Shield",
          duration: { type: "next-combat-round" },
          scope: "unit",
          modifiers: [{ type: "FIRE_SHIELD", amount: 1 }]
        },
        { type: "card", cardId: "spell.fire_shield", controllerId: "p1" },
        "p1",
        { type: "unit", unitId: unit.id }
      )
    );

    const marker = unitEffectIcons(state, unit).find((icon) => icon.kind === "ongoing-card");
    expect(marker).toMatchObject({ counter: "2" });
    expect(marker?.label).toContain("Fire Shield");
    const { container } = renderBoard(state);
    const rendered = container.querySelector<HTMLElement>('.boardEffectIcon.ongoing-card');
    expect(rendered).toBeTruthy();
    expect(rendered?.querySelector("img")?.getAttribute("src")).toContain("spells-fire_shield");
    expect(rendered?.querySelector(".boardEffectCounter")?.textContent).toBe("2");
  });

  it("removes the marker as soon as the ongoing effect ends", () => {
    const state = makeState(false, "effect-icons-forgetfulness");
    stageCombat(state);
    const unit = state.combat!.units.u_foe_0;
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Forgetfulness",
          duration: { type: "next-activation" },
          scope: "unit",
          modifiers: [{ type: "UNIT_CANNOT_ATTACK" }]
        },
        { type: "card", cardId: "spell.forgetfulness", controllerId: "p1" },
        "p1",
        { type: "unit", unitId: unit.id }
      )
    );
    expect(unitEffectIcons(state, unit).find((icon) => icon.kind === "ongoing-card")?.counter).toBe("1");
    state.activeEffects = [];
    expect(unitEffectIcons(state, unit).some((icon) => icon.kind === "ongoing-card")).toBe(false);
  });
});
