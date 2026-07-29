import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import type { GameAction, GameState } from "./state";

/**
 * INVARIANT (CLAUDE.md 1a #5): an action `getLegalActions` offers must be an
 * action the reducer accepts. The PvP pre-battle preparation window is the one
 * place `addTownActions` runs with a combat open, and `activateTownBuilding` /
 * `hireSecondaryHero` both hard-refuse while `state.combat` is set ("Town
 * actions cannot interrupt a combat.") — so the "During your turn" building
 * uses and the Secondary-Hero hire must not be OFFERED there.
 *
 * Before the gate the prep window listed 8 dead buttons (Cover of Darkness,
 * Castle Gate and six hires), and the map hand rail's Cover of Darkness button
 * was one of them.
 */
function prepWindowState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Two "during your turn" buildings on the ACTIVE player's town plus the gold
  // and hand cards each of them needs, so every offer below is otherwise legal.
  state.towns.town_p1.buildings.push("necropolis.cover_of_darkness", "inferno.castle_gate");
  state.players.p1.hand = ["stat.attack", "stat.defense"];
  state.players.p2.hand = ["stat.attack", "stat.defense"];
  state.players.p1.resources.gold = 80;
  state.activePlayerId = "p1";
  return state;
}

function openPvpPrep(state: GameState, seed: string): GameState {
  state.combat = createInitialGameState(seed).combat;
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
  };
  state.phase = "combat";
  state.combat!.prep = { accepted: [] };
  state.priorityPlayerId = null;
  return state;
}

/** Every offered action the reducer refuses, as "type | message" lines. */
function rejectedOffers(state: GameState, playerId: "p1" | "p2"): string[] {
  const rejected: string[] = [];
  for (const legal of getLegalActions(state, playerId)) {
    // Cover of Darkness is offered with an empty pick list (the client fills it
    // from the hand rail), so play it with a real card to test the real path.
    const action: GameAction =
      legal.action.type === "USE_TOWN_BUILDING" && legal.action.buildingId.includes("cover_of_darkness")
        ? { ...legal.action, cardIds: ["stat.attack"] }
        : legal.action;
    const result = applyAction(state, action);
    if (result.errors.length > 0) {
      rejected.push(`${legal.action.type} | ${result.errors.map((error) => error.message).join("; ")}`);
    }
  }
  return rejected;
}

describe("PvP pre-battle prep window: no town action is offered that the reducer refuses", () => {
  it("offers nothing it cannot execute (was 8 dead buttons)", () => {
    const state = openPvpPrep(prepWindowState("prep-town-offers"), "prep-town-offers");

    expect(rejectedOffers(state, "p1")).toEqual([]);

    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Cover of Darkness"))).toBe(false);
    expect(labels.some((label) => label.includes("Castle Gate"))).toBe(false);
    expect(labels.some((label) => label.includes("Hire Secondary Hero"))).toBe(false);
    // The window itself is still live — readying up is what it is FOR.
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "ACCEPT_COMBAT"),
      "the prep window still offers its own Accept"
    ).toBe(true);
  });

  it("CONTROL: with no combat open the same three offers are there AND work", () => {
    const state = prepWindowState("prep-town-offers-control");

    const offers = getLegalActions(state, "p1");
    const cover = offers.find(
      (legal) =>
        legal.action.type === "USE_TOWN_BUILDING" &&
        legal.action.buildingId === "necropolis.cover_of_darkness"
    );
    const gate = offers.find(
      (legal) =>
        legal.action.type === "USE_TOWN_BUILDING" && legal.action.buildingId === "inferno.castle_gate"
    );
    const hire = offers.find((legal) => legal.action.type === "HIRE_SECONDARY_HERO");
    expect(cover, "Cover of Darkness is a normal map-turn action").toBeTruthy();
    expect(gate, "Castle Gate is a normal map-turn action").toBeTruthy();
    expect(hire, "hiring a Secondary Hero is a normal map-turn action").toBeTruthy();

    // …and each really executes off-turn-free, proving the gate above removed
    // dead offers only, never a working one.
    const played = applyAction(state, {
      ...(cover!.action as Extract<GameAction, { type: "USE_TOWN_BUILDING" }>),
      cardIds: ["stat.attack"]
    });
    expect(played.errors).toEqual([]);
    expect(played.state.players.p1.discard).toContain("stat.attack");
    expect(applyAction(state, gate!.action).errors).toEqual([]);
    expect(applyAction(state, hire!.action).errors).toEqual([]);
  });
});
