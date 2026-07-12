import { describe, expect, it } from "vitest";
import { standardComputerController, type GameEvent, type GameState } from "@/engine";
import { buildComputerBattleReport } from "./computer-battle-report";

/** Minimal state: computer controllers + player names, all buildReport reads. */
function stateWith(computerIds: string[]): GameState {
  const controllers = Object.fromEntries(
    computerIds.map((id) => [id, standardComputerController()]),
  );
  const players = Object.fromEntries(
    ["p1", "p2", "p3"].map((id) => [id, { id, name: id.toUpperCase() }]),
  );
  return { controllers, players } as unknown as GameState;
}

function ev(event: Partial<GameEvent> & { type: string }): GameEvent {
  return event as unknown as GameEvent;
}

describe("buildComputerBattleReport", () => {
  it("reports a computer's won neutral fight with its reward, skipping human fights", () => {
    const state = stateWith(["p2"]);
    const cues = buildComputerBattleReport(state, [
      // A human (p1) fight is shown live and never reported here.
      ev({ id: "e1", type: "COMBAT_ENDED", winnerPlayerId: "p1", defeatedPlayerId: "neutrals", reason: "all-enemy-units-defeated" }),
      // The computer's fight, then its post-combat spoils.
      ev({ id: "e2", type: "COMBAT_ENDED", winnerPlayerId: "p2", defeatedPlayerId: "neutrals", reason: "all-enemy-units-defeated" }),
      ev({ id: "e3", type: "FIELD_FLAGGED", playerId: "p2", fieldId: "h:1:1", location: "mine", previousOwnerId: null }),
      ev({ id: "e4", type: "RESOURCES_GAINED", playerId: "p2", gold: 3, buildingMaterials: 0, valuables: 1, reason: "mine" }),
      ev({ id: "e5", type: "EXPERIENCE_GAINED", playerId: "p2", heroId: "hero_p2", amount: 1, experience: 2, level: 2 }),
    ]);

    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      playerId: "p2",
      playerName: "P2",
      won: true,
      quick: false,
      opponentLabel: "the neutral guards",
    });
    expect(cues[0].rewardText).toContain("claimed a mine");
    expect(cues[0].rewardText).toContain("+3 gold");
    expect(cues[0].rewardText).toContain("+1 valuables");
    expect(cues[0].rewardText).toContain("hero reached level 2");
  });

  it("reports a Quick-Combat win as a bloodless victory", () => {
    const state = stateWith(["p2"]);
    const cues = buildComputerBattleReport(state, [
      ev({ id: "q1", type: "QUICK_COMBAT_WON", playerId: "p2", heroId: "hero_p2", fieldId: "h:2:2", difficulty: 1 }),
      ev({ id: "q2", type: "FIELD_FLAGGED", playerId: "p2", fieldId: "h:2:2", location: "treasure_symbol", previousOwnerId: null }),
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0].quick).toBe(true);
    expect(cues[0].won).toBe(true);
    expect(cues[0].rewardText).toContain("claimed a treasure");
  });

  it("reports a computer LOSS with no reward, and does not bleed the next fight's spoils in", () => {
    const state = stateWith(["p2"]);
    const cues = buildComputerBattleReport(state, [
      ev({ id: "l1", type: "COMBAT_ENDED", winnerPlayerId: "neutrals", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" }),
      // A later, unrelated win's reward must NOT attach to the loss above.
      ev({ id: "w1", type: "QUICK_COMBAT_WON", playerId: "p2", heroId: "hero_p2", fieldId: "h:3:3", difficulty: 1 }),
      ev({ id: "w2", type: "RESOURCES_GAINED", playerId: "p2", gold: 5, buildingMaterials: 0, valuables: 0, reason: "mine" }),
    ]);
    // Two cues: the loss (no reward) then the quick win (+5 gold).
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ won: false, rewardText: null });
    expect(cues[1]).toMatchObject({ won: true, quick: true });
    expect(cues[1].rewardText).toContain("+5 gold");
  });

  it("CONTROL: an all-human (multiplayer) snapshot yields no cues", () => {
    const state = stateWith([]);
    const cues = buildComputerBattleReport(state, [
      ev({ id: "e1", type: "COMBAT_ENDED", winnerPlayerId: "p1", defeatedPlayerId: "neutrals", reason: "all-enemy-units-defeated" }),
      ev({ id: "e2", type: "QUICK_COMBAT_WON", playerId: "p2", heroId: "hero_p2", fieldId: "h:1:1", difficulty: 1 }),
    ]);
    expect(cues).toEqual([]);
  });
});
