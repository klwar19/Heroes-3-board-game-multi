import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState,
  type HeroState,
  type MapFieldState
} from "./index";

function field(state: GameState, spaceId: string, location = "empty_field"): void {
  state.adventure!.fields[spaceId] = {
    spaceId,
    tileInstanceId: `alliance-${spaceId}`,
    slot: 0,
    location,
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  } as MapFieldState;
}

function game(rule = true): GameState {
  const state = createAdventureGameState({ seed: "alliance-transfers", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.playerTeams = { p1: "friends", p2: "friends" };
  (state.adventure!.houseRules ??= {})["polish-alliance-mode"] = rule;
  state.adventure!.pendingVisit = null;
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("Polish Alliance transfers", () => {
  it("lets adjacent secondary Heroes make a private Artifact offer that the ally accepts", () => {
    let state = game();
    const source = { ...getMainHero(state, "p1")!, id: "hero_p1_secondary", kind: "secondary" } as HeroState;
    const target = { ...getMainHero(state, "p2")!, id: "hero_p2_secondary", kind: "secondary" } as HeroState;
    source.spaceId = "h:50:50";
    target.spaceId = "h:50:51";
    state.heroes[source.id] = source;
    state.heroes[target.id] = target;
    field(state, source.spaceId);
    field(state, target.spaceId);
    state.players.p1.hand = ["artifact.centaurs_axe"];
    state.players.p2.hand = [];

    const offer = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "OFFER_ALLY_TRANSFER" &&
        entry.action.fromHeroId === source.id &&
        entry.action.targetHeroId === target.id &&
        entry.action.transfer.kind === "artifact"
    );
    expect(offer).toBeTruthy();
    state = apply(state, offer!.action);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(state.adventure?.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");

    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p2", optionIndex: 0 });
    expect(state.players.p1.hand).not.toContain("artifact.centaurs_axe");
    expect(state.players.p2.hand).toContain("artifact.centaurs_axe");
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("allows a resource offer from a Town without adjacent Heroes and preserves it on decline", () => {
    let state = game();
    const source = getMainHero(state, "p1")!;
    const target = getMainHero(state, "p2")!;
    source.spaceId = "h:60:60";
    target.spaceId = "h:70:70";
    field(state, source.spaceId, "town");
    field(state, target.spaceId);
    state.players.p1.resources.gold = 2;
    state.players.p2.resources.gold = 0;

    const offer = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "OFFER_ALLY_TRANSFER" &&
        entry.action.targetPlayerId === "p2" &&
        entry.action.targetHeroId === undefined &&
        entry.action.transfer.kind === "resource" &&
        entry.action.transfer.resource === "gold"
    );
    expect(offer).toBeTruthy();
    state = apply(state, offer!.action);
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p2", optionIndex: 1 });
    expect(state.players.p1.resources.gold).toBe(2);
    expect(state.players.p2.resources.gold).toBe(0);

    const acceptedOffer = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "OFFER_ALLY_TRANSFER" &&
        entry.action.targetPlayerId === "p2" &&
        entry.action.targetHeroId === undefined &&
        entry.action.transfer.kind === "resource" &&
        entry.action.transfer.resource === "gold"
    );
    state = apply(state, acceptedOffer!.action);
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p2", optionIndex: 0 });
    expect(state.players.p1.resources.gold).toBe(1);
    expect(state.players.p2.resources.gold).toBe(1);
  });

  it("offers nothing with the rule off and rejects non-adjacent Artifact payloads", () => {
    const off = game(false);
    expect(getLegalActions(off, "p1").some((entry) => entry.action.type === "OFFER_ALLY_TRANSFER")).toBe(false);

    const state = game();
    const source = getMainHero(state, "p1")!;
    const target = getMainHero(state, "p2")!;
    source.spaceId = "h:80:80";
    target.spaceId = "h:90:90";
    field(state, source.spaceId);
    field(state, target.spaceId);
    state.players.p1.hand = ["artifact.centaurs_axe"];
    const forged = applyAction(state, {
      type: "OFFER_ALLY_TRANSFER",
      playerId: "p1",
      fromHeroId: source.id,
      targetPlayerId: "p2",
      targetHeroId: target.id,
      transfer: { kind: "artifact", cardId: "artifact.centaurs_axe" }
    });
    expect(forged.errors[0]?.message).toMatch(/adjacent fields/i);
    expect(forged.state.players.p1.hand).toContain("artifact.centaurs_axe");
  });
});
