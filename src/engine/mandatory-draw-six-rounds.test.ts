import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getAdjacentSpaceIds,
  getLegalActions,
  getPlayerView,
  heroMoveStartsBattle,
  type GameAction,
  type GameState,
  type MapSpaceId
} from "./index";

// ---------------------------------------------------------------------------
// House rule: the start-of-turn draw is MANDATORY before moving or using a
// card, and a move that walks into a Combat while troops can still be bought is
// warned by the UI. These integration tests drive a real 2-player game and
// assert the gate holds for BOTH seats across six full rounds, that the
// multiplayer player-view preserves it, that town management (buy troops) is NOT
// gated, and that nothing soft-locks.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  const state = createAdventureGameState({ seed: "mandatory-draw-6r", difficulty: "normal", rollFirstPlayer: false });
  // Benign Astrologers Proclaims for the even rounds (2, 4, 6) so the round-start
  // phase never leaves a pending choice dangling between turns.
  state.decks.astrologers!.drawPile.push(
    "astrologers.dead_silence",
    "astrologers.dead_silence",
    "astrologers.dead_silence"
  );
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

const typesOf = (state: GameState, playerId: string) =>
  new Set(getLegalActions(state, playerId).map((legal) => legal.action.type));

describe("Mandatory start-of-turn draw — six rounds, two players", () => {
  it("gates movement, exploration and card use behind the draw on every turn for both seats", () => {
    let state = makeGame();

    for (let turn = 0; turn < 12; turn += 1) {
      const active = state.activePlayerId;
      const other = active === "p1" ? "p2" : "p1";
      const where = `turn ${turn}, round ${state.round}, ${active}`;

      // The mandatory draw is armed at the start of the turn, the hand is not over
      // the limit, and no start-of-turn choice is left dangling.
      expect(state.players[active]?.canMulligan, where).toBe(true);
      expect(state.players[active]?.needsHandRefresh, where).toBe(false);
      expect(state.pendingChoice, where).toBeNull();

      // While the draw is unspent, only the draw, End turn (and town/morale) are
      // offered — no movement, exploration, market, tile work or card use.
      const gated = typesOf(state, active);
      expect(gated.has("REFRESH_HAND"), where).toBe(true);
      expect(gated.has("END_TURN"), where).toBe(true);
      expect(gated.has("MOVE_HERO"), where).toBe(false);
      expect(gated.has("MOVE_HERO_PATH"), where).toBe(false);
      expect(gated.has("PLAY_CARD"), where).toBe(false);
      expect(gated.has("CAST_SPELL"), where).toBe(false);
      expect(gated.has("OPEN_MARKET"), where).toBe(false);
      expect(gated.has("DISCOVER_TILE"), where).toBe(false);

      // Multiplayer: the active seat's own VIEW preserves the draw flag, and the
      // off-turn seat is never offered the draw or a move (not their turn).
      const myView = getPlayerView(state, active);
      expect(myView.players[active]?.canMulligan, where).toBe(true);
      const offTurn = typesOf(state, other);
      expect(offTurn.has("REFRESH_HAND"), where).toBe(false);
      expect(offTurn.has("MOVE_HERO"), where).toBe(false);

      // The engine backstops the gate even for the handler-validated MOVE_HERO:
      // a forced move before the draw is rejected, and the hero does not move.
      const here = state.heroes[`hero_${active}`]?.spaceId as MapSpaceId | undefined;
      const dest = here ? getAdjacentSpaceIds(here).find((id) => state.adventure?.fields[id]) : undefined;
      if (dest) {
        const forced = applyAction(state, { type: "MOVE_HERO", playerId: active, heroId: `hero_${active}`, to: dest });
        expect(forced.errors.length, `${where}: a move before the draw must be rejected`).toBeGreaterThan(0);
        expect(forced.state.heroes[`hero_${active}`]?.spaceId, where).toBe(here);
      }

      // Take the mandatory draw — the gate opens and movement becomes available.
      state = apply(state, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] });
      expect(state.players[active]?.canMulligan, where).toBe(false);
      expect(typesOf(state, active).has("MOVE_HERO"), `${where}: move opens after the draw`).toBe(true);

      state = apply(state, { type: "END_TURN", playerId: active });
    }

    // 12 turns = six full rounds; the seventh has just begun.
    expect(state.round).toBe(7);
  });

  it("lets a seat end its turn WITHOUT drawing (ending is deliberate, never a forgotten draw)", () => {
    let state = makeGame();
    expect(state.players.p1.canMulligan).toBe(true);
    // End turn is offered while the draw is pending and goes through unspent.
    expect(typesOf(state, "p1").has("END_TURN")).toBe(true);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    expect(state.players.p2.canMulligan).toBe(true);
  });
});

describe("Buying troops is NOT gated by the draw (so 'stop and buy troops' works)", () => {
  it("offers Build and Recruit before the draw is taken, and keeps them after", () => {
    let state = makeGame();
    // Town management is available before the draw: build a dwelling now.
    expect(typesOf(state, "p1").has("BUILD_STRUCTURE")).toBe(true);
    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });
    // Free up two bronze units (each card exists once) and fund their purchase.
    state.players.p1.army = state.players.p1.army.filter(
      (unit) => unit.unitDefId !== "castle.marksmen" && unit.unitDefId !== "castle.griffins"
    );
    state.players.p1.resources.gold = 50;

    const hasRecruit = (s: GameState) =>
      getLegalActions(s, "p1").some(
        (legal) =>
          legal.action.type === "POPULATION_ACTION" &&
          legal.action.purchases.some((purchase) => purchase.kind === "recruit")
      );

    // Recruiting is offered WHILE the draw is still pending — the player can stop
    // and buy troops before committing to a move.
    expect(state.players.p1.canMulligan).toBe(true);
    expect(hasRecruit(state), "recruit offered before the draw").toBe(true);
    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);

    // And it is still offered after the draw (the draw didn't consume the token).
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(hasRecruit(state), "recruit still offered after the draw").toBe(true);
  });
});

describe("heroMoveStartsBattle — the engine signal behind the pre-battle warning", () => {
  it("is true for undefeated guards and an enemy hero, false for open or own-flagged fields", () => {
    const state = makeGame();
    const hero = state.heroes.hero_p1;
    const here = hero.spaceId as MapSpaceId;
    const neighbors = getAdjacentSpaceIds(here).filter((id) => state.adventure?.fields[id]);
    expect(neighbors.length).toBeGreaterThan(0);

    // An empty, unguarded neighbour is not a battle.
    const open = neighbors.find((id) => !state.adventure!.fields[id]!.difficulty)!;
    expect(heroMoveStartsBattle(state, "hero_p1", open)).toBe(false);

    // Turn it into undefeated guards → a battle.
    const field = state.adventure!.fields[open]!;
    field.difficulty = 2;
    field.blackCube = false;
    field.everFlagged = false;
    field.flagOwnerId = null;
    expect(heroMoveStartsBattle(state, "hero_p1", open)).toBe(true);

    // Once the hero has flagged it (own field), it is no longer a battle.
    field.flagOwnerId = "p1";
    expect(heroMoveStartsBattle(state, "hero_p1", open)).toBe(false);

    // An enemy hero standing on a field is a battle (PvP combat).
    const enemySpace = neighbors.find((id) => id !== open)!;
    state.heroes.hero_p2.spaceId = enemySpace;
    expect(heroMoveStartsBattle(state, "hero_p1", enemySpace)).toBe(true);
    // …but not when the mover is the same controller (own secondary hero).
    state.heroes.hero_p2.controllerId = "p1";
    expect(heroMoveStartsBattle(state, "hero_p1", enemySpace)).toBe(false);
  });
});

describe("No soft-lock: the mandatory draw always resolves", () => {
  it("clears the gate even when the deck AND discard are empty (draws nothing)", () => {
    let state = makeGame();
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    expect(state.players.p1.canMulligan).toBe(true);

    // REFRESH_HAND with nothing to draw still succeeds and opens the turn.
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(state.players.p1.canMulligan).toBe(false);
    expect(typesOf(state, "p1").has("MOVE_HERO")).toBe(true);
  });
});
