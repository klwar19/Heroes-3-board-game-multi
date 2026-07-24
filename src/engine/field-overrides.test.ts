/**
 * GLOBAL Field Override system — effect-level tests (CLAUDE.md §1a).
 * Mechanism is core; Anime only registers content objects.
 */

import { describe, expect, it } from "vitest";
import { locationDefinitions } from "@/data/map/locations";
import {
  ANIME_FIELD_OVERRIDE_DEFINITIONS,
  FIELD_OVERRIDE_ART_PLACEHOLDERS
} from "@/data/anime/field-overrides";
import {
  allFieldOverrideDefinitions,
  customMapHasAnimeFieldOverridePins,
  customMapHasFieldOverridePins,
  fieldOverrideGlyph,
  fieldOverrideImage,
  fieldOverridePackageAllowed,
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions
} from "@/data/map/field-overrides";
import { createAdventureGameState, createAdventureLobbyState, applyAction } from "./index";
import {
  assignPoolFieldOverrides,
  carveFieldOverride,
  fieldOverrideMayCoverField,
  fieldOverridesEnabled,
  offerPendingFieldOverridePlacement,
  placeFieldOverride,
  resolveFieldOverridesEnabled
} from "./field-overrides";
import type { CustomMapTilePlan, GameState, MapTileState } from "./state";
import {
  eliminatePlayer,
  getTileFootprintSpaceIds,
  instantiateTile,
  tokenPlacementCandidates
} from "./adventure";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function animeOn() {
  return {
    enabled: true,
    mapObjects: true,
    xianxiaTowns: false,
    secretRealms: false,
    xianxiaNeutrals: false,
    elixirPills: false,
    cultivation: false,
    destiny: false,
    isekaiTowns: false,
    isekaiNeutrals: false,
    guild: false,
    monsterWaves: false,
    raidBosses: false,
    dungeon: false,
    gods: false,
    xianxiaArtifacts: false,
    heartDemon: false
  };
}

describe("Field Override is GLOBAL (not anime-mod-gated)", () => {
  it("CONTROL: default off when no option and no pins", () => {
    expect(resolveFieldOverridesEnabled({ fieldOverrides: undefined, customMap: null })).toBe(false);
    const state = createAdventureGameState({
      seed: "fo-global-off",
      ruleset: "binh",
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    expect(fieldOverridesEnabled(state)).toBe(false);
  });

  it("enables from GameSetupOptions.fieldOverrides without anime", () => {
    const state = createAdventureGameState({
      seed: "fo-global-on",
      ruleset: "binh",
      fieldOverrides: true,
      fieldOverridePlacement: "random",
      // anime absent — pool only has kinds whose packages allow (anime kinds need anime)
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    expect(state.adventure?.fieldOverrides).toBe(true);
    expect(fieldOverridesEnabled(state)).toBe(true);
    expect(state.anime?.enabled ?? false).toBe(false);
  });

  it("auto-enables when customMap has fieldOverride pins (not token teleports)", () => {
    expect(
      customMapHasFieldOverridePins([
        { fieldOverride: undefined, fieldOverrides: undefined }
      ])
    ).toBe(false);
    // Token-only plans: FO helpers only look at fieldOverride(s), not tokens.
    expect(customMapHasFieldOverridePins([{ fieldOverride: { kind: "kiem_trung" } }])).toBe(true);
    expect(
      customMapHasFieldOverridePins([{ fieldOverrides: [{ kind: "linh_tuyen" }, { kind: "bi_canh" }] }])
    ).toBe(true);
    expect(
      resolveFieldOverridesEnabled({
        customMap: [{ row: 0, col: 0, group: "far", faceDown: true, fieldOverride: { kind: "linh_tuyen", slot: 0 } }]
      } as never)
    ).toBe(true);
  });

  it("anime-package pins are detected separately (auto Anime crest)", () => {
    expect(customMapHasAnimeFieldOverridePins([{ fieldOverride: { kind: "bi_canh" } }])).toBe(true);
    expect(
      customMapHasAnimeFieldOverridePins([{ fieldOverrides: [{ kind: "kiem_trung" }] }])
    ).toBe(true);
  });
});

// The 5 wave-1 kinds that shipped WITH hex art on disk — must keep their art.
const WAVE1_ART_KINDS = [
  "bi_canh",
  "kiem_trung",
  "linh_tuyen",
  "ngo_dao_thach",
  "tran_phap_truyen_tong"
];

describe("Anime content package registration", () => {
  it("registers the xianxia + isekai Ninefold kinds, all implemented", () => {
    const xianxia = listFieldOverrideDefinitions({
      package: "anime-xianxia",
      implementedOnly: true
    }).map((d) => d.id);
    expect(xianxia.sort()).toEqual(
      [
        "bi_canh",
        "kiem_trung",
        "linh_tuyen",
        "ngo_dao_thach",
        "tran_phap_truyen_tong",
        // wave 2 (§5.5 / §5.8)
        "thuong_hoi_tram",
        "song_bac_quan",
        "dai_luyen_khi",
        // wave 3 (WOG-parity)
        "thi_luyen_thap",
        "linh_dien"
      ].sort()
    );
    const isekai = listFieldOverrideDefinitions({
      package: "anime-isekai",
      implementedOnly: true
    }).map((d) => d.id);
    expect(isekai.sort()).toEqual(
      ["capsule_lab", "urahara_shop", "onsen_ryokan", "dungeon_gate", "guild_bounty"].sort()
    );

    // Every kind's location id resolves to an implemented location.
    for (const def of Object.values(ANIME_FIELD_OVERRIDE_DEFINITIONS)) {
      expect(locationDefinitions[def.locationId]?.implementationStatus, def.id).toBe("implemented");
    }
  });

  it("every registered kind has art ON DISK or is a declared art placeholder", () => {
    for (const def of allFieldOverrideDefinitions()) {
      const isPlaceholder = FIELD_OVERRIDE_ART_PLACEHOLDERS.has(def.id);
      if (def.image) {
        // Art claimed → the file must exist AND the kind must NOT be a placeholder.
        const abs = resolve(process.cwd(), `public${def.image}`);
        expect(existsSync(abs), `missing art file ${def.image} for ${def.id}`).toBe(true);
        expect(isPlaceholder, `${def.id} has art but is also an art placeholder`).toBe(false);
      } else {
        // No art → it MUST be a declared placeholder (never a silent invisible hex).
        expect(isPlaceholder, `${def.id} has no art and is not a declared placeholder`).toBe(true);
      }
    }
  });

  it("the 5 wave-1 kinds keep real hex art on disk (never demoted to placeholders)", () => {
    for (const id of WAVE1_ART_KINDS) {
      const def = getFieldOverrideDefinition(id)!;
      expect(def.image, id).toBeTruthy();
      expect(existsSync(resolve(process.cwd(), `public${def.image}`)), `missing ${def.image}`).toBe(true);
      expect(FIELD_OVERRIDE_ART_PLACEHOLDERS.has(id), id).toBe(false);
    }
  });

  it("the art-placeholder registry names only real, implemented, art-LESS kinds", () => {
    // 2026-07: every shipped kind has art, so the registry is legitimately
    // EMPTY — the loop below still guards any future declared placeholder.
    for (const id of FIELD_OVERRIDE_ART_PLACEHOLDERS) {
      const def = getFieldOverrideDefinition(id);
      expect(def, `placeholder "${id}" is not a registered kind`).toBeTruthy();
      expect(def?.image, `placeholder "${id}" actually has art — remove it from the registry`).toBeFalsy();
      expect(def?.implementationStatus, id).toBe("implemented");
      // Promote-flow direction (a): dropping the .webp is HALF the promote — the
      // registry entry must go too. A placeholder that already has a file on disk
      // (even before its `image` is wired) is a stale registry, so it must fail.
      const artOnDisk = resolve(process.cwd(), `public/assets/anime/field-overrides/${id}.webp`);
      expect(
        existsSync(artOnDisk),
        `placeholder "${id}" already has a hex-art file on disk — set image: art("${id}") and remove it from FIELD_OVERRIDE_ART_PLACEHOLDERS`
      ).toBe(false);
    }
  });

  it("every kind renders visibly: art OR a fallback glyph (never a blank hex)", () => {
    // Mutation guard: drop a placeholder kind's `glyph` and this fails.
    for (const def of allFieldOverrideDefinitions()) {
      const visible = Boolean(def.image) || Boolean(fieldOverrideGlyph(def.id));
      expect(visible, `${def.id} would render as an invisible hex (no art, no glyph)`).toBe(true);
      // Art wins: a kind WITH art exposes no glyph fallback.
      if (def.image) {
        expect(fieldOverrideGlyph(def.id), def.id).toBeUndefined();
      }
    }
  });

  it("every registered kind has a non-empty summary (the player-facing 'what happens')", () => {
    // The board tooltip + inspect float show this text so every WOG/anime hex
    // says what visiting does; a blank summary would be a silent, useless hex.
    for (const def of allFieldOverrideDefinitions()) {
      expect(def.summary?.trim().length ?? 0, `${def.id} has an empty summary`).toBeGreaterThan(0);
      expect(def.name?.trim().length ?? 0, `${def.id} has an empty name`).toBeGreaterThan(0);
    }
  });

  it("fieldOverrideImage resolves location and kind", () => {
    expect(fieldOverrideImage("kiem_trung")).toContain("kiem_trung.webp");
    expect(fieldOverrideImage("anime.kiem_trung")).toContain("kiem_trung.webp");
  });

  it("fieldOverrideGlyph: art wins over the glyph — by id and by location id", () => {
    // 2026-07: every shipped kind has art, so even glyph-carrying kinds
    // (song_bac_quan keeps its "🀄" as a text fallback) resolve to NO glyph.
    expect(getFieldOverrideDefinition("song_bac_quan")?.glyph).toBeTruthy();
    expect(fieldOverrideGlyph("song_bac_quan")).toBeUndefined();
    expect(fieldOverrideGlyph("anime.song_bac_quan")).toBeUndefined();
    expect(fieldOverrideGlyph("kiem_trung")).toBeUndefined();
    expect(fieldOverrideGlyph("anime.kiem_trung")).toBeUndefined();
  });

  it("Teleportation Array is NOT a plain monolith location id (own art + network membership)", () => {
    expect(getFieldOverrideDefinition("tran_phap_truyen_tong")?.locationId).toBe(
      "anime.tran_phap_truyen_tong"
    );
  });
});

describe("isekai package parity with xianxia (pool + palette gating)", () => {
  it("anime-isekai kinds are pool-eligible exactly when the mod is on", () => {
    // Mod ON: both anime packages are allowed; a center-eligible isekai kind
    // (capsule_lab) joins the center pool alongside the xianxia bi_canh.
    const onCenter = listFieldOverrideDefinitions({
      tileGroup: "center",
      implementedOnly: true,
      packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, { animeEnabled: true })
    }).map((d) => d.id);
    expect(onCenter).toContain("capsule_lab"); // isekai
    expect(onCenter).toContain("bi_canh"); // xianxia (control: same pool)

    // Mod OFF: neither anime package is allowed → both drop out together.
    const offCenter = listFieldOverrideDefinitions({
      tileGroup: "center",
      implementedOnly: true,
      packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, { animeEnabled: false })
    }).map((d) => d.id);
    expect(offCenter).not.toContain("capsule_lab");
    expect(offCenter).not.toContain("bi_canh");
  });

  it("an isekai pin auto-detects the Anime crest exactly like a xianxia pin", () => {
    expect(customMapHasAnimeFieldOverridePins([{ fieldOverride: { kind: "capsule_lab" } }])).toBe(true);
    expect(
      customMapHasAnimeFieldOverridePins([{ fieldOverrides: [{ kind: "onsen_ryokan" }] }])
    ).toBe(true);
  });
});

describe("anime `mapObjects` module gates the Field Override pool", () => {
  it("fieldOverridePackageAllowed: anime FO needs enabled && mapObjects !== false", () => {
    // enabled + mapObjects ON → both anime packages allowed.
    expect(fieldOverridePackageAllowed("anime-xianxia", { animeEnabled: true, animeMapObjects: true })).toBe(true);
    expect(fieldOverridePackageAllowed("anime-isekai", { animeEnabled: true, animeMapObjects: true })).toBe(true);
    // enabled + mapObjects EXPLICITLY FALSE (module unticked) → dropped.
    expect(fieldOverridePackageAllowed("anime-xianxia", { animeEnabled: true, animeMapObjects: false })).toBe(false);
    expect(fieldOverridePackageAllowed("anime-isekai", { animeEnabled: true, animeMapObjects: false })).toBe(false);
    // enabled + mapObjects ABSENT → ON (legacy snapshots / campaign chapters).
    expect(fieldOverridePackageAllowed("anime-xianxia", { animeEnabled: true })).toBe(true);
    expect(fieldOverridePackageAllowed("anime-isekai", { animeEnabled: true })).toBe(true);
    // Master off → never allowed, even with mapObjects true.
    expect(fieldOverridePackageAllowed("anime-xianxia", { animeEnabled: false, animeMapObjects: true })).toBe(false);
    // WOG on / anime off must NOT leak an anime kind (and wog stays allowed).
    expect(fieldOverridePackageAllowed("anime-xianxia", { wogNewObjects: true })).toBe(false);
    expect(fieldOverridePackageAllowed("wog", { wogNewObjects: true })).toBe(true);
    // core/shared always available.
    expect(fieldOverridePackageAllowed("core", {})).toBe(true);
  });

  it("listFieldOverrideDefinitions surfaces anime kinds only when mapObjects allows", () => {
    const ids = (mods: Parameters<typeof fieldOverridePackageAllowed>[1]) =>
      listFieldOverrideDefinitions({
        tileGroup: "far",
        implementedOnly: true,
        packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, mods)
      }).map((d) => d.id);
    expect(ids({ animeEnabled: true, animeMapObjects: true })).toContain("bi_canh");
    expect(ids({ animeEnabled: true, animeMapObjects: false })).not.toContain("bi_canh");
    expect(ids({ animeEnabled: true })).toContain("bi_canh"); // absent = ON
  });

  it("the pool draws anime overrides iff mapObjects is not explicitly false (state seam)", () => {
    const build = () =>
      createAdventureGameState({
        seed: "anime-mapobjects-gate",
        ruleset: "binh",
        fieldOverrides: true,
        fieldOverridePlacement: "random",
        anime: animeOn(),
        rollFirstPlayer: false,
        rotateStartTiles: false
      });
    const pendingCount = (state: GameState) =>
      Object.values(state.adventure!.tiles).filter(
        (t) => t.pendingFieldOverride || (t.pendingFieldOverrides?.length ?? 0) > 0
      ).length;
    const clearPending = (state: GameState) => {
      for (const t of Object.values(state.adventure!.tiles)) {
        t.pendingFieldOverride = undefined;
        t.pendingFieldOverrides = undefined;
      }
    };

    // mapObjects ON (animeOn): setup populates the anime pool.
    const on = build();
    expect(pendingCount(on)).toBeGreaterThan(0);

    // mapObjects EXPLICITLY FALSE → the pool stays empty (no other FO package on).
    const off = build();
    clearPending(off);
    off.anime!.mapObjects = false;
    assignPoolFieldOverrides(off, () => 0.5, { enabled: true });
    expect(pendingCount(off)).toBe(0);

    // mapObjects ABSENT (legacy snapshot) → still ON, the pool repopulates.
    const legacy = build();
    clearPending(legacy);
    delete (legacy.anime as { mapObjects?: boolean }).mapObjects;
    assignPoolFieldOverrides(legacy, () => 0.5, { enabled: true });
    expect(pendingCount(legacy)).toBeGreaterThan(0);
  });
});

describe("carve + placement", () => {
  it("carves location and stamps guard for Bí Cảnh", () => {
    const state = createAdventureGameState({
      seed: "fo-carve",
      ruleset: "binh",
      fieldOverrides: true,
      anime: animeOn(),
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const field = Object.values(state.adventure!.fields).find(
      (f) => f.location !== "town" && !f.difficulty
    )!;
    carveFieldOverride(state.adventure!, field.spaceId, "bi_canh");
    expect(state.adventure!.fields[field.spaceId]?.location).toBe("anime.bi_canh");
    expect(state.adventure!.fields[field.spaceId]?.difficulty).toBe(5);
  });

  it("pool stamps pending on face-down far when anime content is available", () => {
    const state = createAdventureGameState({
      seed: "fo-pool",
      ruleset: "binh",
      fieldOverrides: true,
      anime: animeOn(),
      fieldOverridePlacement: "random",
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const tile = Object.values(state.adventure!.tiles)[0] as MapTileState;
    tile.faceDown = true;
    tile.group = "far";
    delete tile.pendingFieldOverride;
    assignPoolFieldOverrides(state, () => 0, { enabled: true });
    const pending = state.adventure!.tiles[tile.id]?.pendingFieldOverride;
    if (!pending) {
      throw new Error("expected pool stamp");
    }
    expect(pending.fromPool).toBe(true);
    expect(getFieldOverrideDefinition(pending.kind)).toBeTruthy();
  });

  it("CONTROL: anime-only kinds are NOT pooled when anime is off", () => {
    const state = createAdventureGameState({
      seed: "fo-pool-no-anime",
      ruleset: "binh",
      fieldOverrides: true,
      fieldOverridePlacement: "random",
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const tile = Object.values(state.adventure!.tiles)[0] as MapTileState;
    tile.faceDown = true;
    tile.group = "far";
    delete tile.pendingFieldOverride;
    assignPoolFieldOverrides(state, () => 0, { enabled: true });
    // Every registered kind is anime-xianxia or anime-isekai — both need the
    // Anime mod on, so with anime off the pool is empty.
    expect(state.adventure!.tiles[tile.id]?.pendingFieldOverride).toBeUndefined();
  });

  it("random placement mode places without a choice", () => {
    const state = createAdventureGameState({
      seed: "fo-random",
      ruleset: "binh",
      fieldOverrides: true,
      anime: animeOn(),
      fieldOverridePlacement: "random",
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const tile = Object.values(state.adventure!.tiles).find((t) => !t.faceDown)!;
    tile.group = "far";
    tile.awaitingRotation = false;
    tile.pendingFieldOverride = { kind: "linh_tuyen", fromPool: true };
    const opened = offerPendingFieldOverridePlacement(state, tile, "p1");
    expect(opened).toBe(false);
    expect(
      Object.values(state.adventure!.fields).some((f) => f.location === "anime.linh_tuyen")
    ).toBe(true);
  });

  it("manual-or-refuse choice can place via CHOOSE_OPTION", () => {
    const state = createAdventureGameState({
      seed: "fo-manual",
      ruleset: "binh",
      fieldOverrides: true,
      anime: animeOn(),
      fieldOverridePlacement: "manual-or-refuse",
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const tile = Object.values(state.adventure!.tiles).find((t) => !t.faceDown)!;
    tile.group = "far";
    tile.awaitingRotation = false;
    tile.pendingFieldOverride = { kind: "ngo_dao_thach", fromPool: true };
    const opened = offerPendingFieldOverridePlacement(state, tile, "p1");
    if (!opened || state.pendingChoice?.type !== "OPTION_CHOICE") {
      expect(
        Object.values(state.adventure!.fields).some((f) => f.location === "anime.ngo_dao_thach")
      ).toBe(true);
      return;
    }
    const spaceId = state.pendingChoice.fieldOverride!.candidates[0];
    const result = applyAction(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    expect(result.state.adventure!.fields[spaceId]?.location).toBe("anime.ngo_dao_thach");
  });
});

// ---------------------------------------------------------------------------
// Audit regressions — each test fails if its fix is reverted.
// ---------------------------------------------------------------------------

describe("placement choice terminates (no endless pool re-draws)", () => {
  function stagedManualGame(seed: string) {
    const state = createAdventureGameState({
      seed,
      ruleset: "binh",
      creatureBanks: false,
      fieldOverrides: true,
      anime: animeOn(),
      fieldOverridePlacement: "manual-or-refuse",
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const tile = Object.values(state.adventure!.tiles).find((t) => !t.faceDown)! as MapTileState;
    tile.group = "far";
    tile.awaitingRotation = false;
    tile.pendingFieldOverrides = [{ kind: "ngo_dao_thach", fromPool: true }];
    tile.pendingFieldOverride = tile.pendingFieldOverrides[0];
    const opened = offerPendingFieldOverridePlacement(state, tile, "p1");
    return { state, tile, opened };
  }

  it("PLACING via CHOOSE_OPTION carves once, closes the window and never re-opens it", () => {
    const { state, tile, opened } = stagedManualGame("fo-no-loop-place");
    if (!opened || state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a manual placement choice");
    }
    const result = applyAction(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    expect(result.errors).toHaveLength(0);
    const after = result.state;
    // Pre-fix this re-stamped a fresh pool draw and trapped the player in an
    // endless placement window: the choice must be CLOSED and the queue empty.
    expect(after.pendingChoice).toBeNull();
    const tileAfter = after.adventure!.tiles[tile.id];
    expect(tileAfter.pendingFieldOverride).toBeUndefined();
    expect(tileAfter.pendingFieldOverrides).toBeUndefined();
    const carved = Object.values(after.adventure!.fields).filter(
      (f) => f.location === "anime.ngo_dao_thach"
    );
    expect(carved).toHaveLength(1);
  });

  it("REFUSING closes the window for good — the tile stays as printed", () => {
    const { state, tile, opened } = stagedManualGame("fo-no-loop-refuse");
    if (!opened || state.pendingChoice?.type !== "OPTION_CHOICE" || !state.pendingChoice.fieldOverride) {
      throw new Error("expected a manual-or-refuse choice");
    }
    const refuseIndex = state.pendingChoice.fieldOverride.candidates.length;
    const result = applyAction(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: refuseIndex
    });
    expect(result.errors).toHaveLength(0);
    const after = result.state;
    expect(after.pendingChoice).toBeNull();
    const tileAfter = after.adventure!.tiles[tile.id];
    expect(tileAfter.pendingFieldOverride).toBeUndefined();
    expect(tileAfter.pendingFieldOverrides).toBeUndefined();
    expect(
      Object.values(after.adventure!.fields).some((f) => f.location.startsWith("anime."))
    ).toBe(false);
  });
});

describe("a carved override hex is protected (Location-Token-like)", () => {
  it("a second override and a Monolith token both refuse the carved hex (empty sibling CONTROL)", () => {
    const state = createAdventureGameState({
      seed: "fo-protect",
      ruleset: "binh",
      creatureBanks: false,
      fieldOverrides: true,
      anime: animeOn(),
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    const adventure = state.adventure!;
    const tile = Object.values(adventure.tiles).find((t) => !t.faceDown)! as MapTileState;
    tile.group = "far";
    tile.awaitingRotation = false;
    const footprint = getTileFootprintSpaceIds(tile);
    // Two clean, guard-free land hexes on the tile.
    const [carvedHex, controlHex] = footprint.filter((spaceId) => {
      const field = adventure.fields[spaceId];
      return (
        field &&
        field.location !== "town" &&
        field.location !== "blocked_field" &&
        !field.difficulty &&
        field.terrain !== "water" &&
        !Object.values(state.heroes).some((hero) => hero.spaceId === spaceId)
      );
    });
    if (!carvedHex || !controlHex) {
      throw new Error("expected two clean hexes on the staged tile");
    }
    for (const hex of [carvedHex, controlHex]) {
      const field = adventure.fields[hex];
      field.location = "empty_field";
      delete field.difficulty;
      delete field.resource;
      delete field.amount;
    }
    carveFieldOverride(adventure, carvedHex, "kiem_trung");
    const ngoDef = getFieldOverrideDefinition("ngo_dao_thach")!;

    // A later override in the queue must pick a DIFFERENT hex…
    expect(fieldOverrideMayCoverField(state, carvedHex, ngoDef)).toBe(false);
    // …and a Monolith/Whirlpool/Gate token may not overwrite it either.
    tile.pendingToken = { kind: "monolith" };
    const candidates = tokenPlacementCandidates(state, tile, "monolith");
    expect(candidates).not.toContain(carvedHex);
    // CONTROL: the untouched empty sibling hex stays coverable by both.
    expect(fieldOverrideMayCoverField(state, controlHex, ngoDef)).toBe(true);
    expect(candidates).toContain(controlHex);
  });
});

describe("elimination mid-placement never strands the reveal chain", () => {
  it("drops the override queue and auto-places the waiting designed token", () => {
    const state = createAdventureGameState({
      seed: "fo-eliminate",
      ruleset: "binh",
      creatureBanks: false,
      fieldOverrides: true,
      anime: animeOn(),
      fieldOverridePlacement: "manual-or-refuse",
      rollFirstPlayer: false,
      rotateStartTiles: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const adventure = state.adventure!;
    // A fresh face-up Far tile away from every hero, fields materialized.
    const tile = instantiateTile(adventure, "F1", { row: 24, col: 12 }, 0, false);
    tile.group = "far";
    tile.awaitingRotation = false;
    for (const spaceId of getTileFootprintSpaceIds(tile)) {
      const field = adventure.fields[spaceId];
      if (field) {
        field.location = "empty_field";
        delete field.difficulty;
        delete field.resource;
        delete field.amount;
        delete field.terrain;
      }
    }
    tile.pendingFieldOverrides = [{ kind: "ngo_dao_thach", fromPool: true }];
    tile.pendingFieldOverride = tile.pendingFieldOverrides[0];
    const monolithHex = getTileFootprintSpaceIds(tile)[2];
    tile.pendingTokens = [{ kind: "monolith", preferredSpaceId: monolithHex }];
    tile.pendingToken = tile.pendingTokens[0];

    const opened = offerPendingFieldOverridePlacement(state, tile, "p1");
    expect(opened, "the manual window opened and was holding the token behind it").toBe(true);

    eliminatePlayer(state, "p1", "left the game", false);

    // The choice is gone, the queue with it, and the designed Monolith was
    // auto-placed instead of leaking forever on the revealed tile.
    expect(state.pendingChoice).toBeNull();
    const tileAfter = state.adventure!.tiles[tile.id];
    expect(tileAfter.pendingFieldOverride).toBeUndefined();
    expect(tileAfter.pendingFieldOverrides).toBeUndefined();
    expect(tileAfter.pendingToken).toBeUndefined();
    expect(tileAfter.pendingTokens).toBeUndefined();
    expect(state.adventure!.fields[monolithHex]?.location).toBe("monolith");
  });
});

describe("starting tiles never host an override pin", () => {
  it("no registered kind claims the 'starting' tile group (setup skips starting plans)", () => {
    for (const def of listFieldOverrideDefinitions()) {
      expect(def.tileGroups, def.id).not.toContain("starting");
    }
  });
});
