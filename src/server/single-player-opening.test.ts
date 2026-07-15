import { describe, expect, it } from "vitest";
import { createAdventureGameState, type GameState } from "@/engine";
import { locationDefinitions } from "@/data/map/locations";
import { playUntilRound } from "./single-player-soak-helpers";

/**
 * Opening-play end-to-end for the single-player computer: the AI should sweep
 * its OWN starting tile (tile Ⅰ) — the free resource symbol, the guarded
 * (difficulty 1) treasure, and the guarded (difficulty 1) income MINE — before
 * marching off, exactly as a strong human opens. Measured on the stock policy:
 * only the unguarded symbol was taken (1/3) and the hero abandoned the mine +
 * treasure. These drive REAL seeded games (driveComputerPlayers) and assert the
 * observable board outcome. If the home-tile sweep wiring in map-navigation.ts
 * is removed, the guarded mine stays unflagged and these fail.
 *
 * The scripted-human + settle-computers driver lives in
 * single-player-soak-helpers.ts (shared with the soak-matrix / tempo suites).
 */

type Payoff = { spaceId: string; location: string; collected: boolean };

/** Home-tile (tile Ⅰ) payoff fields for `playerId` and whether each is taken. */
function homePayoffs(state: GameState, playerId: string): Payoff[] {
  const fields = state.adventure!.fields;
  const town = Object.values(fields).find(
    (field) =>
      locationDefinitions[field.location]?.category === "town" &&
      field.flagOwnerId === playerId,
  );
  const homeTile = town?.tileInstanceId;
  const payoffs: Payoff[] = [];
  for (const field of Object.values(fields)) {
    if (field.tileInstanceId !== homeTile) continue;
    const category = locationDefinitions[field.location]?.category;
    if (category === "flaggable") {
      payoffs.push({
        spaceId: field.spaceId,
        location: field.location,
        collected: field.flagOwnerId === playerId,
      });
    } else if (category === "visitable") {
      payoffs.push({
        spaceId: field.spaceId,
        location: field.location,
        collected: Boolean(field.blackCube),
      });
    }
  }
  return payoffs;
}

function newGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
  });
}

describe("single-player opening: the computer sweeps its home tile", () => {
  // A few fixed seeds; the sweep is seed-robust (measured 3/3 on 8 soak seeds).
  const seeds = ["open-sweep-a", "open-sweep-b", "open-sweep-c"];

  for (const seed of seeds) {
    it(`seed ${seed}: all three home payoffs collected by round 2, mine flagged`, () => {
      const byRound2 = playUntilRound(newGame(seed), 3);
      expect(byRound2.stalled, byRound2.reason).toBe(false);
      const payoffs = homePayoffs(byRound2.state, "p2");
      // Fixture sanity: a home tile carries exactly the three payoffs.
      expect(payoffs.length).toBe(3);
      // Every one collected — including both difficulty-1 guarded fields.
      const uncollected = payoffs.filter((p) => !p.collected).map((p) => p.location);
      expect(uncollected, `uncollected home payoffs: ${uncollected.join(", ")}`).toEqual(
        [],
      );
      // The income MINE specifically — the thing the stock policy abandoned — is
      // flagged to the computer. This fails if the home-sweep wiring is removed.
      const mine = payoffs.find((p) => p.location === "mine");
      expect(mine?.collected, "home income mine must be flagged").toBe(true);
    });

    it(`seed ${seed}: turn 1 already banks a home payoff (no stall)`, () => {
      const afterTurn1 = playUntilRound(newGame(seed), 2);
      expect(afterTurn1.stalled, afterTurn1.reason).toBe(false);
      const collected = homePayoffs(afterTurn1.state, "p2").filter((p) => p.collected);
      // The fresh hero collects what its 3 movement points can reach on turn 1
      // instead of ending the turn on the town — at least one home payoff taken.
      expect(collected.length).toBeGreaterThanOrEqual(1);
    });
  }
});
