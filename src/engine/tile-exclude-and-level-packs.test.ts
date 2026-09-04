/**
 * Map designer: landmark EXCLUDE is a real pool filter (no Obelisk never draws
 * an obelisk tile), and level guards can mint real Pack units (levelArmy packs)
 * with optional packFaction lock. Mutation-checked with CONTROLs.
 */
import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  createAdventureGameState,
  NEUTRAL_ARMY_TABLE,
  planExcludedSecretFeatures,
  resolveCustomGuardDraws,
  resolveLevelPackGuardDraws,
  sanitizeCustomGuardSpec,
  tileMatchesSecretFeature,
  tilePassesSecretFilters,
  isRandomPackGuardSlot,
  isCustomGuardUnitEntry
} from "./index";
import { applyCustomGuardToField, drawGuardArmy } from "./adventure";
import type { CustomMapTilePlan, GameState, MapFieldState } from "./state";

function makeCustomMapGame(tiles: CustomMapTilePlan[], seed = "exclude-pack-test"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest",
    customMap: tiles
  });
}

describe("tile excludeFeatures — real pool filter", () => {
  it("planExcludedSecretFeatures dedupes and drops junk", () => {
    expect(planExcludedSecretFeatures({ excludeFeatures: ["obelisk", "obelisk", "not-a-thing" as never] })).toEqual([
      "obelisk"
    ]);
    expect(planExcludedSecretFeatures({})).toEqual([]);
  });

  it("tilePassesSecretFilters: include AND NOT exclude", () => {
    const withObelisk = Object.values(allTileDefinitions).find(
      (d) => d.group === "near" && tileMatchesSecretFeature(d, "obelisk")
    );
    const without = Object.values(allTileDefinitions).find(
      (d) =>
        d.group === "near" &&
        !tileMatchesSecretFeature(d, "obelisk") &&
        tileMatchesSecretFeature(d, "any_mine")
    );
    expect(withObelisk).toBeTruthy();
    expect(without).toBeTruthy();
    expect(tilePassesSecretFilters(withObelisk!, [], ["obelisk"])).toBe(false);
    expect(tilePassesSecretFilters(without!, [], ["obelisk"])).toBe(true);
    expect(tilePassesSecretFilters(without!, ["any_mine"], ["obelisk"])).toBe(true);
    expect(tilePassesSecretFilters(withObelisk!, ["obelisk"], ["obelisk"])).toBe(false);
  });

  it("setup: face-down Near with exclude obelisk never places an obelisk tile", () => {
    // Place several Near face-down slots all banning obelisk — if exclude is
    // decorative, at least one would roll an obelisk when the pool has them.
    const nearObeliskIds = Object.values(allTileDefinitions)
      .filter((d) => d.group === "near" && tileMatchesSecretFeature(d, "obelisk"))
      .map((d) => d.id);
    expect(nearObeliskIds.length).toBeGreaterThan(0);

    const tiles: CustomMapTilePlan[] = [
      { row: 0, col: 0, group: "starting", faceDown: false },
      { row: 2, col: 0, group: "starting", faceDown: false },
      // Many near slots with no-obelisk ban
      ...Array.from({ length: 8 }, (_, i) => ({
        row: 4 + i * 2,
        col: 0,
        group: "near" as const,
        faceDown: true,
        excludeFeatures: ["obelisk" as const]
      }))
    ];

    const state = makeCustomMapGame(tiles, "no-obelisk-near-x8");
    const adventure = state.adventure!;
    const faceDownNear = Object.values(adventure.tiles).filter((t) => t.group === "near" && t.faceDown);
    expect(faceDownNear.length).toBeGreaterThan(0);
    for (const tile of faceDownNear) {
      const def = allTileDefinitions[tile.tileDefId];
      expect(def, tile.tileDefId).toBeTruthy();
      // THE claim: exclude is real — never an obelisk-bearing tile.
      expect(tileMatchesSecretFeature(def!, "obelisk")).toBe(false);
      expect(tile.excludeFeatures).toEqual(["obelisk"]);
    }

    // CONTROL (mutation check): the SAME layout without the ban DOES draw
    // obelisk tiles on this seed — so the filter above, not pool luck, is what
    // kept them out. If the exclude wiring is removed, the filtered run above
    // draws like this one and its no-obelisk assertion fails.
    const controlTiles: CustomMapTilePlan[] = tiles.map((t) => {
      if (t.group !== "near") return t;
      const rest = { ...t };
      delete rest.excludeFeatures;
      return rest;
    });
    const control = makeCustomMapGame(controlTiles, "with-obelisk-near-control");
    const controlNear = Object.values(control.adventure!.tiles).filter((t) => t.group === "near" && t.faceDown);
    expect(controlNear.length).toBeGreaterThan(0);
    const anyObelisk = controlNear.some((t) => {
      const def = allTileDefinitions[t.tileDefId];
      return def && tileMatchesSecretFeature(def, "obelisk");
    });
    expect(anyObelisk, "control seed must draw at least one obelisk tile unfiltered").toBe(true);
  });

  it("setup: secret gold_mine + exclude settlement never places a settlement-only mismatch", () => {
    const tiles: CustomMapTilePlan[] = [
      { row: 0, col: 0, group: "starting", faceDown: false },
      { row: 2, col: 0, group: "starting", faceDown: false },
      {
        row: 4,
        col: 0,
        group: "far",
        faceDown: true,
        secretFeatures: ["gold_mine"],
        excludeFeatures: ["settlement"]
      }
    ];
    const state = makeCustomMapGame(tiles, "gold-no-settlement");
    const far = Object.values(state.adventure!.tiles).find((t) => t.group === "far");
    expect(far).toBeTruthy();
    const def = allTileDefinitions[far!.tileDefId];
    expect(def).toBeTruthy();
    // Include held (or soft fallback — still must not have settlement if include worked).
    if (tileMatchesSecretFeature(def!, "gold_mine")) {
      expect(tileMatchesSecretFeature(def!, "settlement")).toBe(false);
    }
  });
});

describe("level packs + random-pack + packFaction", () => {
  it("accepts random-pack:<tier> entries", () => {
    expect(isRandomPackGuardSlot("random-pack:bronze")).toBe(true);
    expect(isRandomPackGuardSlot("random-pack:azure")).toBe(true);
    expect(isRandomPackGuardSlot("random:bronze")).toBe(false);
    expect(isCustomGuardUnitEntry("random-pack:gold")).toBe(true);
  });

  it("sanitiser keeps random-pack, levelArmy packs, and packFaction", () => {
    const army = sanitizeCustomGuardSpec({
      units: ["random-pack:bronze", "random:silver", "garbage"],
      packFaction: "castle"
    });
    expect(army?.units).toEqual(["random-pack:bronze", "random:silver"]);
    expect(army?.packFaction).toBe("castle");

    const levelPacks = sanitizeCustomGuardSpec({
      level: 3,
      levelArmy: "packs",
      packFaction: "random"
    });
    expect(levelPacks).toEqual({ level: 3, levelArmy: "packs", packFaction: "random" });

    // CONTROL: level without packs drops packFaction
    const levelNeutral = sanitizeCustomGuardSpec({ level: 2, packFaction: "castle" });
    expect(levelNeutral).toEqual({ level: 2 });
  });

  it("resolves random-pack to real Pack units of that tier", () => {
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => i++ % (max + 1) };
    const draws = resolveCustomGuardDraws(["random-pack:bronze", "random-pack:gold"], rng);
    expect(draws).toHaveLength(2);
    expect(draws[0].factionPack).toBe(true);
    expect(draws[0].tier).toBe("bronze");
    expect(coreUnitDefinitions[draws[0].unitDefId]?.pack).toBeTruthy();
    expect(draws[1].tier).toBe("gold");
    expect(coreUnitDefinitions[draws[1].unitDefId]?.pack).toBeTruthy();
  });

  it("packFaction castle locks every Pack to Castle", () => {
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => i++ % (max + 1) };
    const draws = resolveCustomGuardDraws(
      ["random-pack:bronze", "random-pack:silver", "random-pack:gold"],
      rng,
      { packFaction: "castle" }
    );
    expect(draws.length).toBeGreaterThan(0);
    for (const d of draws) {
      expect(d.factionPack).toBe(true);
      expect(coreUnitDefinitions[d.unitDefId]?.faction).toBe("castle");
    }
  });

  it("packFaction random: all packs in one fight share one faction", () => {
    const rng = { nextInt: () => 0 }; // always pick first of remaining pools
    const draws = resolveCustomGuardDraws(
      ["random-pack:bronze", "random-pack:silver"],
      rng,
      {
        packFaction: "random",
        playableFactions: ["rampart", "castle"]
      }
    );
    expect(draws.length).toBe(2);
    const factions = new Set(draws.map((d) => coreUnitDefinitions[d.unitDefId]?.faction));
    expect(factions.size).toBe(1);
  });

  it("level pack composition matches NEUTRAL_ARMY_TABLE body counts as Packs", () => {
    const composition = NEUTRAL_ARMY_TABLE.normal[3];
    expect(composition).toEqual({ bronze: 2, silver: 1, gold: 0, azure: 0 });
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => i++ % (max + 1) };
    const draws = resolveLevelPackGuardDraws(composition, rng, { packFaction: "necropolis" });
    expect(draws).toHaveLength(3); // 2 bronze + 1 silver
    expect(draws.every((d) => d.factionPack)).toBe(true);
    expect(draws.filter((d) => d.tier === "bronze")).toHaveLength(2);
    expect(draws.filter((d) => d.tier === "silver")).toHaveLength(1);
    for (const d of draws) {
      expect(coreUnitDefinitions[d.unitDefId]?.faction).toBe("necropolis");
    }
  });

  it("a Pack slot that cannot mint a Pack falls back to a same-tier NEUTRAL (never a missing body)", () => {
    // No faction ships an azure Pack — a random-pack:azure slot must still
    // field a body (an azure Neutral), because the slot's azure flag already
    // drove the derived difficulty to Ⅶ. A silent skip would make the player
    // fight a smaller army than the difficulty (and experience) advertise.
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => i++ % (max + 1) };
    const draws = resolveCustomGuardDraws(["random-pack:azure", "random-pack:bronze"], rng);
    expect(draws).toHaveLength(2);
    expect(draws[0].tier).toBe("azure");
    expect(draws[0].factionPack).toBeFalsy();
    expect(coreUnitDefinitions[draws[0].unitDefId]?.neutral, "azure fallback is a Neutral side").toBeTruthy();
    // CONTROL: the bronze slot (a Pack pool exists) still mints a real Pack.
    expect(draws[1].tier).toBe("bronze");
    expect(draws[1].factionPack).toBe(true);
  });

  it("a faction-locked NAMED pack of the wrong faction converts to the locked faction's Pack of that tier", () => {
    const castleBronzePack = Object.values(coreUnitDefinitions).find(
      (def) => def.pack && def.faction === "castle" && def.tier === "bronze"
    );
    expect(castleBronzePack).toBeTruthy();
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => i++ % (max + 1) };
    const draws = resolveCustomGuardDraws([`pack:${castleBronzePack!.id}`], rng, {
      packFaction: "necropolis"
    });
    // The body is NOT dropped: same tier, still a Pack, in the locked faction.
    expect(draws).toHaveLength(1);
    expect(draws[0].tier).toBe("bronze");
    expect(draws[0].factionPack).toBe(true);
    expect(coreUnitDefinitions[draws[0].unitDefId]?.faction).toBe("necropolis");
    // CONTROL: with a matching lock the named pack itself is kept.
    let j = 0;
    const rng2 = { nextInt: (_min: number, max: number) => j++ % (max + 1) };
    const kept = resolveCustomGuardDraws([`pack:${castleBronzePack!.id}`], rng2, {
      packFaction: "castle"
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].unitDefId).toBe(castleBronzePack!.id);
  });

  it("level-7 packs guard fields the FULL table row — azure bodies mint as azure Neutrals", () => {
    // normal[7] = 2 azure only. Pre-fallback this minted ZERO bodies (an empty
    // guard army). The azure bodies must come through as azure Neutrals.
    const composition = NEUTRAL_ARMY_TABLE.normal[7];
    expect(composition).toEqual({ bronze: 0, silver: 0, gold: 0, azure: 2 });
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => i++ % (max + 1) };
    const draws = resolveLevelPackGuardDraws(composition, rng, { packFaction: "castle" });
    expect(draws).toHaveLength(2);
    for (const d of draws) {
      expect(d.tier).toBe("azure");
      expect(coreUnitDefinitions[d.unitDefId]?.neutral).toBeTruthy();
    }
  });

  it("a map-designed packs level guard ignores Astrologers Rulebook easing", () => {
    const makeField = (spaceId: string): MapFieldState => ({
      spaceId,
      tileInstanceId: "t",
      slot: 0,
      location: "settlement",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    });
    // hard[2] = 3 bronze, normal[2] = 2 bronze — the eased row is one body
    // smaller, so the easing is observable in the minted army size.
    expect(NEUTRAL_ARMY_TABLE.hard[2]).toEqual({ bronze: 3, silver: 0, gold: 0, azure: 0 });
    expect(NEUTRAL_ARMY_TABLE.normal[2]).toEqual({ bronze: 2, silver: 0, gold: 0, azure: 0 });

    const ruled = createAdventureGameState({
      seed: "packs-eased",
      difficulty: "hard",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    ruled.adventure!.astrologers = {
      activeCardId: "astrologers.rulebook",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    const field = makeField("97,97");
    ruled.adventure!.fields[field.spaceId] = field;
    applyCustomGuardToField(field, { level: 2, levelArmy: "packs" });
    expect(drawGuardArmy(ruled, field, 2)).toHaveLength(3);

    // CONTROL: another face-up card also leaves the authored hard row in force.
    const plain = createAdventureGameState({
      seed: "packs-eased",
      difficulty: "hard",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    plain.adventure!.astrologers = {
      activeCardId: "astrologers.dead_silence",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    const field2 = makeField("96,96");
    plain.adventure!.fields[field2.spaceId] = field2;
    applyCustomGuardToField(field2, { level: 2, levelArmy: "packs" });
    expect(drawGuardArmy(plain, field2, 2)).toHaveLength(3);
  });

  it("applyCustomGuardToField stamps level packs; drawGuardArmy mints Pack units", () => {
    const state = createAdventureGameState({
      seed: "level-pack-draw",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    const field: MapFieldState = {
      spaceId: "99,99",
      tileInstanceId: "t",
      slot: 0,
      location: "settlement",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[field.spaceId] = field;
    applyCustomGuardToField(field, {
      level: 3,
      levelArmy: "packs",
      packFaction: "castle"
    });
    expect(field.difficulty).toBe(3);
    expect(field.customGuardLevel).toBe(3);
    expect(field.customGuardLevelArmy).toBe("packs");
    expect(field.customGuardPackFaction).toBe("castle");
    expect(field.designedGuard).toBe(true);

    const draws = drawGuardArmy(state, field, 3);
    expect(draws.length).toBe(3);
    expect(draws.every((d) => d.factionPack)).toBe(true);
    for (const d of draws) {
      expect(coreUnitDefinitions[d.unitDefId]?.faction).toBe("castle");
    }

    // CONTROL: level without packs → Neutrals (no factionPack)
    const field2: MapFieldState = { ...field, spaceId: "98,98" };
    delete (field2 as { customGuardLevel?: number }).customGuardLevel;
    delete (field2 as { customGuardLevelArmy?: string }).customGuardLevelArmy;
    delete (field2 as { customGuardPackFaction?: string }).customGuardPackFaction;
    applyCustomGuardToField(field2, { level: 3 });
    expect(field2.customGuardLevelArmy).toBeUndefined();
    const neutralDraws = drawGuardArmy(state, field2, 3);
    expect(neutralDraws.length).toBe(3);
    expect(neutralDraws.every((d) => !d.factionPack)).toBe(true);
  });
});
