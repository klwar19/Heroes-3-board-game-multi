import { describe, expect, it } from "vitest";
import { createAdventureGameState, type FactionId, type GameState } from "@/engine";
import { locationDefinitions } from "@/data/map/locations";
import { coreFactionDefinitions } from "@/data/factions/core";
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

function newFactionGame(seed: string, factionId: FactionId): GameState {
  const opponentFactionId = factionId === "castle" ? "necropolis" : "castle";
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    players: [
      {
        id: "p1",
        name: "Human",
        factionId: opponentFactionId,
        heroDefId: coreFactionDefinitions[opponentFactionId].heroes[0],
      },
      {
        id: "p2",
        name: "Computer",
        factionId,
        heroDefId: coreFactionDefinitions[factionId].heroes[0],
      },
    ],
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
      const town = Object.values(byRound2.state.adventure!.fields).find(
        (field) =>
          locationDefinitions[field.location]?.category === "town" &&
          field.flagOwnerId === "p2",
      );
      const hero = Object.values(byRound2.state.heroes).find(
        (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
      );
      expect(hero?.spaceId, "computer main hero should be on the map").toBeTruthy();
      expect(
        byRound2.state.adventure!.fields[hero!.spaceId!]?.tileInstanceId,
        "after sweeping tile I, the computer should enter a II-III tile",
      ).not.toBe(town?.tileInstanceId);
    });

    it(`seed ${seed}: turn 1 banks at least two home payoffs (no stall)`, () => {
      const afterTurn1 = playUntilRound(newGame(seed), 2);
      expect(afterTurn1.stalled, afterTurn1.reason).toBe(false);
      const collected = homePayoffs(afterTurn1.state, "p2").filter((p) => p.collected);
      // The fresh hero collects what its 3 movement points can reach on turn 1
      // instead of ending the turn on the town — at least one home payoff taken.
      expect(collected.length).toBeGreaterThanOrEqual(2);
    });
  }

  it("uses the sweep-and-expand route for every faction starting tile", () => {
    for (const factionId of Object.keys(coreFactionDefinitions) as FactionId[]) {
      const seed = `opening-all-factions-${factionId}`;
      const afterTurn1 = playUntilRound(newFactionGame(seed, factionId), 2);
      expect.soft(afterTurn1.stalled, `${factionId}: ${afterTurn1.reason}`).toBe(false);
      expect.soft(
        homePayoffs(afterTurn1.state, "p2").filter((payoff) => payoff.collected).length,
        `${factionId}: turn one should collect two tile-I objects`,
      ).toBeGreaterThanOrEqual(2);

      const afterTurn2 = playUntilRound(newFactionGame(seed, factionId), 3);
      expect.soft(afterTurn2.stalled, `${factionId}: ${afterTurn2.reason}`).toBe(false);
      const payoffs = homePayoffs(afterTurn2.state, "p2");
      expect.soft(
        payoffs.filter((payoff) => payoff.collected).length,
        `${factionId}: all tile-I objects should be collected by turn two`,
      ).toBe(payoffs.length);
      expect.soft(
        afterTurn2.state.adventure!.farTilesOpenedByPlayer?.p2 ?? 0,
        `${factionId}: turn two should open expansion land`,
      ).toBeGreaterThanOrEqual(1);

      const afterTurn3 = playUntilRound(newFactionGame(seed, factionId), 4);
      expect.soft(afterTurn3.stalled, `${factionId}: ${afterTurn3.reason}`).toBe(false);
      const town = Object.values(afterTurn3.state.adventure!.fields).find(
        (field) =>
          locationDefinitions[field.location]?.category === "town" &&
          field.flagOwnerId === "p2",
      );
      const hero = Object.values(afterTurn3.state.heroes).find(
        (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
      );
      const heroTile = afterTurn3.state.adventure!.fields[hero!.spaceId!]?.tileInstanceId;
      expect.soft(
        heroTile,
        `${factionId}: hero should enter II-III no later than turn three`,
      ).not.toBe(town?.tileInstanceId);
    }
  }, 60_000);
});
