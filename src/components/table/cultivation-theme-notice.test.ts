import { describe, expect, it } from "vitest";

import {
  createAdventureGameState,
  getMainHero,
  type GameEvent,
} from "@/engine";
import type { FactionId } from "@/data/factions/types";
import { formatEvent } from "./utils";

function breakthroughText(factionId: FactionId, heroDefId: string): string {
  const state = createAdventureGameState({
    seed: `cultivation-feed-${factionId}`,
    rollFirstPlayer: false,
    anime: {
      enabled: true,
      cultivation: true,
      xianxiaTowns: true,
      isekaiTowns: true,
    },
    players: [
      { id: "p1", name: factionId, factionId, heroDefId },
      {
        id: "p2",
        name: "Sandro",
        factionId: "necropolis",
        heroDefId: "sandro",
      },
    ],
  });
  const event = {
    id: `realm-${factionId}`,
    type: "CULTIVATION_REALM_ADVANCED",
    playerId: "p1",
    heroId: getMainHero(state, "p1")!.id,
    realm: 2,
  } satisfies GameEvent;
  return formatEvent(event, state);
}

describe("Cultivation breakthrough event feed — faction-themed names", () => {
  it("uses the same owning-faction lookup as the hero board", () => {
    expect(breakthroughText("castle", "catherine")).toContain(
      "Master (Bậc Thầy)",
    );
    expect(breakthroughText("fuyuki", "bin")).toContain(
      "Ascendant (Thăng Hoa)",
    );
    expect(breakthroughText("azure_breeze", "qingyun")).toContain(
      "Core Formation (Kim Đan)",
    );
    expect(breakthroughText("heavenly_demon", "xuedao")).toContain(
      "Demon Core (Ma Đan)",
    );
  });
});
