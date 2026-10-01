import { describe, expect, it } from "vitest";
import { createAdventureGameState, createInitialGameState, getMainHero } from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import type { CombatState, GameState } from "./state";

/**
 * v196: a hero that ESCAPES a player battle (Retreat / Surrender / Give up) is
 * moved home silently, so finalizeAdventureCombat records adventure.heroEscapes
 * for the map marker on the battle hex. A fought-out loss is the CONTROL.
 */
function settle(reason: "retreat" | "surrender" | "give-up" | "all-enemy-units-defeated"): {
  game: GameState;
  fieldId: string;
} {
  const game = createAdventureGameState({ seed: "hero-escape-marker", rollFirstPlayer: false });
  const attacker = getMainHero(game, "p1")!;
  const defender = getMainHero(game, "p2")!;
  const fieldId = attacker.spaceId!;
  defender.spaceId = fieldId;
  game.players.p2.resources.gold = 30; // covers the Surrender toll
  game.adventure!.heroEscapes = [
    // Two rounds old: pruned by the next record. Last round: kept.
    { fieldId, heroId: defender.id, playerId: "p2", winnerPlayerId: "p1", reason: "retreat", toSpaceId: null, round: game.round - 2 },
    { fieldId, heroId: defender.id, playerId: "p2", winnerPlayerId: "p1", reason: "give-up", toSpaceId: null, round: game.round - 1 },
  ];
  game.combat = {
    ...createInitialGameState("hero-escape-marker").combat!,
    units: {},
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId },
    outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason },
  } as CombatState;
  finalizeAdventureCombat(game);
  return { game, fieldId };
}

describe("adventure.heroEscapes map marker", () => {
  it.each(["retreat", "surrender", "give-up"] as const)("a %s is recorded on the battle hex (old entries pruned)", (reason) => {
    const { game, fieldId } = settle(reason);
    const escapes = game.adventure!.heroEscapes ?? [];
    expect(escapes.map((entry) => entry.round)).toEqual([game.round - 1, game.round]);
    const latest = escapes[escapes.length - 1];
    const defender = getMainHero(game, "p2")!;
    expect(latest).toMatchObject({ fieldId, heroId: defender.id, playerId: "p2", winnerPlayerId: "p1", reason });
    // The defender auto-homes; the marker names where it fell back to.
    expect(defender.spaceId).not.toBe(fieldId);
    expect(latest.toSpaceId).toBe(defender.spaceId);
  });

  it("CONTROL: a fought-out loss is no escape — nothing new is recorded", () => {
    const { game } = settle("all-enemy-units-defeated");
    expect((game.adventure!.heroEscapes ?? []).map((entry) => entry.reason)).toEqual(["retreat", "give-up"]);
  });
});
