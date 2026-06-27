import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, getLegalActions, getPlayerView } from "./index";
import type { GameAction, GameState } from "./state";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";

/**
 * Map-setup lobby Draft tab: ban-pick and random town/hero assignment. These
 * tests drive the real engine handlers (SET_DRAFT_MODE / TOGGLE_HERO_BAN /
 * RANDOM_ASSIGN_SEAT) and assert the observable outcome — a banned hero is
 * genuinely unpickable, a random roll lands on a legal pick — so each fails if
 * the wiring is removed.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function lobby(state: GameState) {
  if (!state.setupLobby) {
    throw new Error("expected a setup lobby");
  }
  return state.setupLobby;
}

describe("ban-pick removes heroes from the pool", () => {
  it("rejects a manual pick of a banned hero and hides it from the legal actions, but a sibling stays pickable", () => {
    let state = createAdventureLobbyState({ seed: "draft-ban" });
    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });
    state = apply(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });

    expect(lobby(state).draft?.bannedHeroDefIds).toContain("catherine");

    // The engine refuses the banned hero...
    const blocked = applyAction(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
    expect(blocked.errors.length, "banned hero must be rejected").toBeGreaterThan(0);
    expect(lobby(blocked.state).seats.find((seat) => seat.playerId === "p1")?.heroDefId).toBeNull();

    // ...and never offers it, while an un-banned castle sibling (Rion) stays on
    // the menu. (Mutation control: if the ban filter were dropped, Catherine
    // would re-appear here and the pick above would succeed.)
    const legal = getLegalActions(state, "p1");
    const offered = legal
      .map((entry) => entry.action)
      .filter((action): action is Extract<GameAction, { type: "CHOOSE_FACTION" }> => action.type === "CHOOSE_FACTION");
    expect(offered.some((action) => action.heroDefId === "catherine")).toBe(false);
    expect(offered.some((action) => action.heroDefId === "rion")).toBe(true);

    // Rion really is pickable.
    const picked = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "rion" });
    expect(lobby(picked).seats.find((seat) => seat.playerId === "p1")?.heroDefId).toBe("rion");
  });

  it("only allows bans while ban-pick is on, and toggling clears/re-adds", () => {
    let state = createAdventureLobbyState({ seed: "draft-toggle" });

    // Open mode: banning is refused.
    const tooEarly = applyAction(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });
    expect(tooEarly.errors.length, "cannot ban in open mode").toBeGreaterThan(0);

    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });
    state = apply(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });
    expect(lobby(state).draft?.bannedHeroDefIds).toEqual(["catherine"]);
    // Toggling again un-bans.
    state = apply(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });
    expect(lobby(state).draft?.bannedHeroDefIds).toEqual([]);
  });

  it("cannot ban a hero a seat already chose", () => {
    let state = createAdventureLobbyState({ seed: "draft-chosen" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });

    const blocked = applyAction(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });
    expect(blocked.errors.length, "a chosen hero cannot be banned").toBeGreaterThan(0);
  });

  it("returning to open mode clears every ban and re-opens the pool", () => {
    let state = createAdventureLobbyState({ seed: "draft-clear" });
    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });
    state = apply(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });
    expect(lobby(state).draft?.bannedHeroDefIds).toContain("catherine");

    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "open" });
    expect(lobby(state).draft?.bannedHeroDefIds).toEqual([]);

    // Catherine is pickable again.
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    expect(lobby(state).seats.find((seat) => seat.playerId === "p1")?.heroDefId).toBe("catherine");
  });
});

describe("random town/hero assignment", () => {
  it("is a pure function of the seed and never lands on a faction another seat holds", () => {
    const roll = (): { factionId: string | null; heroDefId: string | null } => {
      let state = createAdventureLobbyState({ seed: "draft-random" });
      // p2 locks Castle, so p1's random town must avoid it.
      state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "castle", heroDefId: "catherine" });
      state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
      const seat = lobby(state).seats.find((entry) => entry.playerId === "p1");
      return { factionId: seat?.factionId ?? null, heroDefId: seat?.heroDefId ?? null };
    };

    const first = roll();
    const second = roll();
    // Deterministic: identical action sequence + seed → identical pick.
    expect(first).toEqual(second);
    // A real, complete pick that avoids the taken faction.
    expect(first.factionId).toBeTruthy();
    expect(first.factionId).not.toBe("castle");
    const faction = coreFactionDefinitions[first.factionId as keyof typeof coreFactionDefinitions];
    expect(faction.heroes).toContain(first.heroDefId);
  });

  it("a random hero re-roll keeps the seat's faction and stays within it", () => {
    let state = createAdventureLobbyState({ seed: "draft-rehero" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "hero" });

    const seat = lobby(state).seats.find((entry) => entry.playerId === "p1");
    expect(seat?.factionId).toBe("castle");
    expect(coreFactionDefinitions.castle.heroes).toContain(seat?.heroDefId);
  });

  it("both seats can roll independently, never collide on a town, and the rolled picks start a real adventure", () => {
    let state = createAdventureLobbyState({ seed: "draft-multi" });
    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p2", scope: "faction" });

    const p1Seat = lobby(state).seats.find((seat) => seat.playerId === "p1");
    const p2Seat = lobby(state).seats.find((seat) => seat.playerId === "p2");
    expect(p1Seat?.factionId).toBeTruthy();
    expect(p2Seat?.factionId).toBeTruthy();
    // Two seats must never randomly land on the same town.
    expect(p1Seat?.factionId).not.toBe(p2Seat?.factionId);

    // The rolled picks are complete and legal, so the adventure actually builds.
    const started = apply(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.setupLobby).toBeNull();
    expect(started.adventure).not.toBeNull();
    expect(Object.values(started.heroes).map((hero) => hero.controllerId).sort()).toEqual(["p1", "p2"]);
  });

  it("propagates the draft (mode + bans) to every player's view so bans are shared", () => {
    let state = createAdventureLobbyState({ seed: "draft-view" });
    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });
    state = apply(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "catherine" });

    // p2 (the opponent) sees the same ban in their filtered view.
    const opponentView = getPlayerView(state, "p2");
    expect(opponentView.setupLobby?.draft?.mode).toBe("ban");
    expect(opponentView.setupLobby?.draft?.bannedHeroDefIds).toContain("catherine");
  });

  it("never rolls a banned hero — banning all but one pick forces that exact town and hero", () => {
    let state = createAdventureLobbyState({ seed: "draft-forced" });
    state = apply(state, { type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });

    // Ban every hero except a single Tower hero, so the only legal random pick is
    // Tower + Iona. (Mutation control: drop the ban filter from the roll and the
    // pick becomes any of ~70 heroes — almost never this exact one.)
    const survivor = "iona";
    for (const heroId of Object.keys(coreHeroDefinitions)) {
      if (heroId !== survivor) {
        state = apply(state, { type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: heroId });
      }
    }

    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
    const seat = lobby(state).seats.find((entry) => entry.playerId === "p1");
    expect(seat?.factionId).toBe("tower");
    expect(seat?.heroDefId).toBe(survivor);
  });
});
