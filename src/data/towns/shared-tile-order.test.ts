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
const CORE_MAIN_EFFECTS = new Set([
  "UNLOCK_RECRUIT_TIER",
  "MAGE_GUILD",
  "UNLOCK_REINFORCE",
  "RESOURCE_ROUND_CHOICE",
  "MGQ_SPIRIT_SHRINE"
]);

describe("shared-tile build order — every town", () => {
  it("every town's two-in-one tile makes the SPECIAL require its MAIN building", () => {
    let sharedTiles = 0;
    for (const [faction, spec] of Object.entries(townBoardSpecs)) {
      const shared = spec.bars.filter((bar) => bar.length > 1);
      // Bulwark's official board shares one tile between two SPECIAL buildings
      // (Sieidi + Altar of the Runes), not a core main + special, so the core-
      // main check does not apply (pinned by the Bulwark CONTROL below).
      if (faction === "bulwark") {
        expect(shared.length, "bulwark: shared art strips").toBe(1);
        sharedTiles++;
        continue;
      }
      // MGQ has TWO main+special inserts (dwelling_silver+Colosseum,
      // citadel+Amira's Shop); its Spirit Shrine is a lone building, not a
      // shared bar. Every other board keeps exactly one shared bar.
      expect(shared.length, `${faction}: shared building bars`).toBe(faction === "mgq" ? 2 : 1);
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
    expect(sharedTiles, "one shared tile per town, plus MGQ's one extra shared bar").toBe(
      Object.keys(townBoardSpecs).length + 1
    );
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

  it("CONTROL: Bulwark's shared tile is the Sieidi + Altar (official board); the Altar requires only the Sieidi", () => {
    const bulwarkShared = townBoardSpecs.bulwark.bars.filter((bar) => bar.length > 1);
    expect(bulwarkShared).toEqual([["bulwark.sieidi", "bulwark.altar"]]);
    // The Glacial Halls stand on their own tile and never gate the Sieidi.
    expect(coreBuildingDefinitions["bulwark.sieidi"].prerequisites ?? []).not.toContain("bulwark.dwelling_gold");
    // Like Factory's Mage Guild + Artifact Merchants, the tile's second
    // building (the Altar) requires its first (the Sieidi).
    const altar = coreBuildingDefinitions["bulwark.altar"];
    expect(altar.prerequisites).toEqual(["bulwark.sieidi"]);
  });

  // ---- Behavioural gate (Factory board face: Artifact Merchants shares the Mage Guild bar) ----

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
    // The starting Factory town already stands its Mage Guild — take it down
    // so the shared-bar gate is observable (a captured or secondary Factory
    // town can genuinely lack it).
    state.towns[townId].buildings = state.towns[townId].buildings.filter(
      (id) => id !== "factory.mage_guild"
    );
    // Artifact Merchants (the shared-bar SPECIAL on the printed Factory face)
    // refuses to build before the Mage Guild (its shared-bar MAIN).
    expect(
      build(state, "factory.artifact_merchants").errors.length,
      "Artifact Merchants rejected before its main"
    ).toBeGreaterThan(0);

    // The Bank sits on its own bar of the printed face, so it needs no
    // dwelling — it builds straight away.
    const bank = build(state, "factory.bank");
    expect(bank.errors, bank.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(bank.state.towns[townId].buildings, "Bank stands on its own bar").toContain("factory.bank");
    state = bank.state;

    // Raise the shared main…
    ready(state);
    state = build(state, "factory.mage_guild").state;
    expect(state.towns[townId].buildings, "Mage Guild stands").toContain("factory.mage_guild");

    // …now the Merchants build.
    ready(state);
    const merchants = build(state, "factory.artifact_merchants");
    expect(merchants.errors, merchants.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(
      merchants.state.towns[townId].buildings,
      "Artifact Merchants stand after their main"
    ).toContain("factory.artifact_merchants");
  });
});
