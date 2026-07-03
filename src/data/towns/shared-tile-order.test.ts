import { describe, expect, it } from "vitest";

import { coreBuildingDefinitions } from "@/data/factions/core";
import { townBoardSpecs } from "@/data/towns/boards";
import { applyAction, createAdventureGameState } from "@/engine";
import type { GameState } from "@/engine/state";

/**
 * Shared-tile build order (every town): each town board carries exactly ONE
 * two-in-one tile — a bar with two buildings — where the FIRST slot is the MAIN
 * (core) building and the SECOND is the SPECIAL. The special can only be raised
 * after its main. The rule is applied in core.ts from the authored board layout
 * (`townBoardSpecs.bars`) as a `prerequisites` entry, so the same build gate every
 * other building uses (legal-actions `canBuild` + adventure-reducer BUILD_STRUCTURE)
 * enforces it. These tests fail if that wiring is removed.
 */

// The effect types that mark a "main" (core) building — a dwelling, the Mage
// Guild, the Citadel, or the City Hall.
const CORE_MAIN_EFFECTS = new Set(["UNLOCK_RECRUIT_TIER", "MAGE_GUILD", "UNLOCK_REINFORCE", "RESOURCE_ROUND_CHOICE"]);

describe("shared-tile build order — every town", () => {
  it("every town's two-in-one tile makes the SPECIAL require its MAIN building", () => {
    let sharedTiles = 0;
    for (const [faction, spec] of Object.entries(townBoardSpecs)) {
      const shared = spec.bars.filter((bar) => bar.length > 1);
      // Exactly one shared tile per town board.
      expect(shared.length, `${faction}: one two-in-one tile`).toBe(1);
      for (const bar of shared) {
        sharedTiles++;
        const [mainId, ...specials] = bar;
        const main = coreBuildingDefinitions[mainId];
        expect(main, `${faction}: main ${mainId} defined`).toBeTruthy();
        // The main slot is always a core building (dwelling / mage guild / citadel).
        expect(
          CORE_MAIN_EFFECTS.has(main!.effect?.type ?? ""),
          `${faction}: shared-tile main ${mainId} (${main!.effect?.type}) is a core building`
        ).toBe(true);
        for (const specialId of specials) {
          const special = coreBuildingDefinitions[specialId];
          expect(special, `${faction}: special ${specialId} defined`).toBeTruthy();
          expect(special!.prerequisites ?? [], `${faction}: ${specialId} requires ${mainId} first`).toContain(mainId);
        }
      }
    }
    expect(sharedTiles, "one shared tile per town").toBe(Object.keys(townBoardSpecs).length);
  });

  it("CONTROL: the order is one-way — the MAIN never requires the SPECIAL", () => {
    for (const [faction, spec] of Object.entries(townBoardSpecs)) {
      for (const bar of spec.bars) {
        if (bar.length < 2) {
          continue;
        }
        const [mainId, ...specials] = bar;
        const main = coreBuildingDefinitions[mainId];
        for (const specialId of specials) {
          expect(
            main!.prerequisites ?? [],
            `${faction}: main ${mainId} must NOT require special ${specialId}`
          ).not.toContain(specialId);
        }
      }
    }
  });

  it("CONTROL: the Bulwark Altar keeps its Sieidi requirement AND gains the shared main", () => {
    // Merge, not overwrite: the Altar shares its tile with the Silver dwelling but
    // already required the Sieidi — it must now require both.
    const altar = coreBuildingDefinitions["bulwark.altar"];
    expect(altar.prerequisites).toContain("bulwark.sieidi");
    expect(altar.prerequisites).toContain("bulwark.dwelling_silver");
  });

  // ---- Behavioural gate (Factory: Bank shares the Industrialized Catacombs tile) ----

  it("a special cannot be built before its shared main, and can right after", () => {
    let state = createAdventureGameState({
      seed: "shared-tile-order",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const r = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(r.errors).toHaveLength(0);
      state = r.state;
    }
    const townId = Object.entries(state.towns).find(([, t]) => t.controllerId === "p1")![0];
    const ready = (s: GameState) => {
      s.players.p1.townTokens.build = true;
      s.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
    };
    const build = (s: GameState, buildingId: string) => applyAction(s, { type: "BUILD_STRUCTURE", playerId: "p1", townId, buildingId });

    ready(state);
    // Bank (the shared-tile SPECIAL) refuses to build before the Industrialized
    // Catacombs (the silver dwelling — its shared-tile MAIN).
    expect(build(state, "factory.bank").errors.length, "Bank rejected before its main dwelling").toBeGreaterThan(0);

    // Raise the dwelling chain up to the shared main…
    state = build(state, "factory.dwelling_bronze").state;
    ready(state);
    state = build(state, "factory.dwelling_silver").state;
    expect(state.towns[townId].buildings, "silver dwelling stands").toContain("factory.dwelling_silver");

    // …now the Bank builds.
    ready(state);
    const bank = build(state, "factory.bank");
    expect(bank.errors, bank.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(bank.state.towns[townId].buildings, "Bank stands after its main").toContain("factory.bank");
  });
});
