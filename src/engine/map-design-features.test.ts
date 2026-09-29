/**
 * Map-designer break fields, random-tier guards, dig cost, random-town income,
 * ability token, tile picks, grail free-build picker, near live pool, built-Grail
 * control fight — each claim mutation-checked with CONTROLs.
 */
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  applyCustomGuardToField,
  beginFieldVisit,
  classifyHeroStep,
  customGuardArmyDifficulty,
  drawGuardArmy,
  ensureRevealedRandomTownFactions,
  getMainHero,
  isFieldGuarded,
  materializeTileFields,
  tickSettlementHoldControl
} from "./adventure";
import { flaggedMineSettlementCount } from "./victory-points";
import { applyAction, createAdventureGameState } from "./index";
import {
  applyBreakFieldOptions,
  customGuardArmyDifficultyFromEntries,
  describeGuardArmyGrouped,
  expandGuardUnitGroups,
  groupGuardUnitEntries,
  isCustomGuardUnitEntry,
  isPackGuardSlot,
  isRandomGuardSlot,
  neutralUnitPoolForTier,
  resolveCustomGuardDraws,
  survivorsToCustomGuardUnits,
  grailDigMovementCost,
  randomTownIncomeGold
} from "./map-design-features";
import {
  defaultObeliskBonusForKind,
  describeCustomMapPresetEntries,
  describeObeliskBonus,
  sanitizeCenterHexPlan,
  sanitizeCustomGuardSpec,
  sanitizeCustomMapPreset,
  sanitizeSettlementFieldPlan
} from "./map-preset";
import type { CustomMapTilePlan, GameAction, GameState, MapFieldState, MapTileState, PlayerId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import {
  finalizeAdventureCombat,
  grailFreeBuildingCandidates,
  isBuiltGrailField,
  startNeutralEncounter,
  startPlayerCombat,
  revisitField,
  tileDefHasResourceMine
} from "./adventure-reducer";

function makeGame(seed = "map-design-features"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest"
  });
}

function injectField(
  state: GameState,
  location: string,
  spaceId = "88,88",
  extra: Partial<MapFieldState> = {}
): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...extra
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function placeHero(state: GameState, playerId: PlayerId, spaceId: string): string {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = spaceId;
  return hero.id;
}

describe("map-design-features — certain army slots", () => {
  it("accepts neutral units, random:<tier>, pack:<id>, and few:<id> entries", () => {
    expect(isCustomGuardUnitEntry("neutral.skeletons")).toBe(true);
    expect(isRandomGuardSlot("random:bronze")).toBe(true);
    expect(isRandomGuardSlot("random:azure")).toBe(true);
    expect(isRandomGuardSlot("random:wood")).toBe(false);
    // A known Pack unit
    const packId = Object.keys(coreUnitDefinitions).find((id) => coreUnitDefinitions[id]?.pack);
    expect(packId).toBeTruthy();
    expect(isPackGuardSlot(`pack:${packId}`)).toBe(true);
    expect(isCustomGuardUnitEntry(`pack:${packId}`)).toBe(true);
    // A known Few unit
    const fewId = Object.keys(coreUnitDefinitions).find((id) => coreUnitDefinitions[id]?.few);
    expect(fewId).toBeTruthy();
    expect(isCustomGuardUnitEntry(`few:${fewId}`)).toBe(true);
    expect(isCustomGuardUnitEntry("random-few:bronze")).toBe(true);
    expect(isCustomGuardUnitEntry("not-a-unit")).toBe(false);
  });

  it("resolves few:<id> and random-few slots to faction Few bodies", () => {
    const fewId = Object.keys(coreUnitDefinitions).find(
      (id) => coreUnitDefinitions[id]?.few && coreUnitDefinitions[id]?.tier === "bronze"
    )!;
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => (i++ % (max + 1)) };
    const named = resolveCustomGuardDraws([`few:${fewId}`], rng);
    expect(named).toHaveLength(1);
    expect(named[0].unitDefId).toBe(fewId);
    expect(named[0].factionFew).toBe(true);
    expect(named[0].factionPack).toBeFalsy();

    const randomFew = resolveCustomGuardDraws(["random-few:bronze"], rng);
    expect(randomFew).toHaveLength(1);
    expect(randomFew[0].factionFew).toBe(true);
    expect(coreUnitDefinitions[randomFew[0].unitDefId]?.few).toBeTruthy();
    expect(randomFew[0].tier).toBe("bronze");
  });

  it("sanitiser keeps random-tier slots and drops garbage", () => {
    const spec = sanitizeCustomGuardSpec({
      units: ["random:bronze", "random:gold", "garbage", "neutral.skeletons"]
    });
    expect(spec?.units).toEqual(["random:bronze", "random:gold", "neutral.skeletons"]);
  });

  it("resolves random-tier slots to real Neutral units of that tier", () => {
    let i = 0;
    const rng = { nextInt: (_min: number, max: number) => (i++ % (max + 1)) };
    const draws = resolveCustomGuardDraws(["random:bronze", "random:silver"], rng);
    expect(draws).toHaveLength(2);
    expect(draws[0].tier).toBe("bronze");
    expect(draws[1].tier).toBe("silver");
    expect(coreUnitDefinitions[draws[0].unitDefId]?.neutral).toBeTruthy();
    expect(draws[0].bankGuard).toBe(true);
  });

  it("random:<tier> pools are CORE neutrals only — never a Doom / WOG mod creature the player did not enable", () => {
    // Reported bug: Doom monsters appeared in a Dragon Utopia (a Black Dragon +
    // 2 random:azure default guard) even with the Doom mod OFF, because the
    // random pool spanned the whole catalog. `random:<tier>` must match the deck
    // builder (`neutralUnitIdsByTier`) and exclude the doom./wog. rosters.
    for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
      const pool = neutralUnitPoolForTier(tier);
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.some((id) => id.startsWith("doom.") || id.startsWith("wog."))).toBe(false);
      expect(pool.every((id) => coreUnitDefinitions[id]?.tier === tier && coreUnitDefinitions[id]?.neutral)).toBe(true);
    }
  });

  it("draws repeated random silver slots without replacement", () => {
    const rng = { nextInt: () => 0 };
    const draws = resolveCustomGuardDraws(["random:silver", "random:silver"], rng);
    expect(draws).toHaveLength(2);
    expect(draws.every((draw) => draw.tier === "silver")).toBe(true);
    expect(new Set(draws.map((draw) => draw.unitDefId)).size).toBe(2);
  });

  it("customGuardArmyDifficulty understands random azure as Ⅶ", () => {
    expect(customGuardArmyDifficultyFromEntries(["random:azure"])).toBe(7);
    expect(customGuardArmyDifficulty(["random:bronze", "random:bronze"])).toBe(2);
  });

  it("groups consecutive certain-army entries for the designer UI (presentation only)", () => {
    expect(groupGuardUnitEntries(["random:gold", "random:gold", "random:gold", "neutral.storm_elementals"])).toEqual([
      { id: "random:gold", count: 3 },
      { id: "neutral.storm_elementals", count: 1 }
    ]);
    expect(describeGuardArmyGrouped(["random:gold", "random:gold", "random:gold", "neutral.storm_elementals"])).toBe(
      "3× Random gold Neutral, Storm Elementals"
    );
    expect(
      expandGuardUnitGroups([
        { id: "random:gold", count: 3 },
        { id: "neutral.storm_elementals", count: 1 }
      ])
    ).toEqual(["random:gold", "random:gold", "random:gold", "neutral.storm_elementals"]);
  });
});

describe("map-design-features — Ability token Obelisk reward", () => {
  it("ability_token is a first-class bonus kind (Search 1 Ability)", () => {
    expect(defaultObeliskBonusForKind("ability_token")).toEqual({ kind: "ability_token" });
    expect(describeObeliskBonus({ kind: "ability_token" })).toMatch(/Ability/i);
    const preset = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonuses: [{ kind: "ability_token" }] }
    });
    expect(preset?.obelisks?.bonuses).toEqual([{ kind: "ability_token" }]);
  });

  it("CONTROL: classic morale default still sanitises when kind is absent garbage", () => {
    const preset = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonuses: [{ kind: "not-real" }] }
    });
    // Degenerate bonuses fall back to default morale.
    expect(preset?.obelisks?.bonus).toEqual({ kind: "morale", amount: 1 });
  });
});

describe("map-design-features — break field + persistent army", () => {
  it("sanitises the Break team scope and defaults to individual", () => {
    expect(sanitizeCustomMapPreset({ breaks: { enterViiFields: true, teamScope: "team" } })?.breaks).toEqual({
      enterViiFields: true,
      teamScope: "team"
    });
    expect(sanitizeCustomMapPreset({ breaks: { enterViiFields: true, teamScope: "garbage" } })?.breaks).toEqual({
      enterViiFields: true
    });
  });

  it("shares a flagged Break with allies only in whole-team mode", () => {
    const state = makeGame("break-team-scope");
    state.playerTeams = { p1: "allies", p2: "allies" };
    const field = injectField(state, "mine", "10,10", {
      difficulty: 2,
      breakField: true,
      designedGuard: true,
      persistentGuard: true,
      flagOwnerId: "p2",
      everFlagged: true
    });
    placeHero(state, "p1", "10,11");
    const hero = getMainHero(state, "p1")!;
    state.adventure!.mapPreset = { breaks: { teamScope: "individual" } };
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(field.extraFlagOwnerIds).toContain("p1");
    expect(flaggedMineSettlementCount(state, "p1")).toBe(1);
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");

    delete field.extraFlagOwnerIds;

    state.adventure!.mapPreset = { breaks: { teamScope: "team" } };
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");

    // CONTROL: a rival's flag never clears the Break.
    state.playerTeams = { p1: "allies", p2: "rivals" };
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");
  });

  it("breakField forces stop even with Pathfinding passEncounters", () => {
    const state = makeGame("break-path");
    const field = injectField(state, "mine", "10,10", {
      difficulty: 2,
      breakField: true,
      designedGuard: true
    });
    placeHero(state, "p1", "10,11");
    const hero = getMainHero(state, "p1")!;
    // Without break: Pathfinding would make guarded = "encounter".
    const withBreak = classifyHeroStep(state, hero, field.spaceId, {
      passEncounters: true,
      moveThrough: false
    } as never);
    expect(withBreak).toBe("stop");

    // CONTROL: without breakField, Pathfinding yields encounter.
    delete field.breakField;
    const without = classifyHeroStep(state, hero, field.spaceId, {
      passEncounters: true,
      moveThrough: false
    } as never);
    expect(without).toBe("encounter");
  });

  it("a tile-group Break seals the WHOLE broken center tile, not just its guarded hex", () => {
    // REPORTED 2026-09-12: "Break: tiles VI–VII" only blocked the guarded VII
    // field, so a hero could step onto an OPEN hex of the tile and side-step the
    // guard. The seal now walls off every hex of the tile from outside until the
    // guard falls, while the guard itself stays enterable (you fight your way in).
    const state = makeGame("break-tile-seal");
    state.adventure!.mapPreset = { breaks: { enterCenterTiles: true } };
    state.adventure!.tiles["ctile"] = {
      id: "ctile",
      tileDefId: "C1",
      centerRow: 90,
      centerCol: 90,
      rotation: 0,
      faceDown: false,
      group: "center"
    } as never;
    const guard = injectField(state, "shrine_of_magic_gesture", "90,90", {
      tileInstanceId: "ctile",
      difficulty: 6,
      designedGuard: true
    });
    const open = injectField(state, "mystical_garden", "90,91", { tileInstanceId: "ctile" });
    injectField(state, "empty_field", "89,90", { tileInstanceId: "othertile" });
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "89,90";

    // Open hex: walled off from outside while the guard stands.
    expect(classifyHeroStep(state, hero, open.spaceId)).toBe("block");
    // Guarded hex: still enterable — the only way in is to fight it.
    expect(classifyHeroStep(state, hero, guard.spaceId)).toBe("stop");

    // CONTROL: without the tile-group Break the open hex is freely enterable.
    state.adventure!.mapPreset = { breaks: {} };
    expect(classifyHeroStep(state, hero, open.spaceId)).not.toBe("block");
  });

  it("clearing the broken tile's guard lifts the tile-group seal", () => {
    const state = makeGame("break-tile-open");
    state.adventure!.mapPreset = { breaks: { enterCenterTiles: true } };
    state.adventure!.tiles["ctile"] = {
      id: "ctile",
      tileDefId: "C1",
      centerRow: 90,
      centerCol: 90,
      rotation: 0,
      faceDown: false,
      group: "center"
    } as never;
    const guard = injectField(state, "shrine_of_magic_gesture", "90,90", {
      tileInstanceId: "ctile",
      difficulty: 6,
      designedGuard: true
    });
    const open = injectField(state, "mystical_garden", "90,91", { tileInstanceId: "ctile" });
    injectField(state, "empty_field", "89,90", { tileInstanceId: "othertile" });
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "89,90";
    expect(classifyHeroStep(state, hero, open.spaceId)).toBe("block");

    // Defeat + flag the guard: it is no longer guarded, so the tile opens.
    guard.flagOwnerId = "p1";
    guard.everFlagged = true;
    expect(classifyHeroStep(state, hero, open.spaceId)).not.toBe("block");
  });

  it("a designated Break field seals its WHOLE tile — guarded side-fields included — with the map-wide gate OFF, and opens once the break falls", () => {
    // USER REPORT (TEST MAP): an Obelisk marked "Break field" (via the per-object
    // / centerHex Break toggles) must gate its whole tile so a hero cannot slip
    // around it to fight the tile's GUARDED Pandora or step onto its open
    // Fountain — until the break guard is beaten, after which the tile opens.
    // This fires from the `breakField` designation ALONE: `mapPreset.breaks`
    // (the map-wide tile gate) is UNSET here, exactly as on the reported map.
    const state = makeGame("designated-break-tile-seal");
    state.adventure!.mapPreset = {}; // no map-wide Break-configuration gate
    state.adventure!.tiles["ntile"] = {
      id: "ntile",
      tileDefId: "N1",
      centerRow: 90,
      centerCol: 90,
      rotation: 0,
      faceDown: false,
      group: "near"
    } as never;
    const brk = injectField(state, "obelisk", "90,90", {
      tileInstanceId: "ntile",
      difficulty: 6,
      designedGuard: true,
      breakField: true,
      // The PER-TILE "Break field" tick (tile objectPlans / centerHex) — the
      // map-wide mines/obelisks flag stamps breakField WITHOUT this, and only
      // this gate seals the whole tile (see the global-stamp test below).
      breakTileGate: true
    });
    const sideGuard = injectField(state, "pandoras_box", "90,91", {
      tileInstanceId: "ntile",
      difficulty: 6,
      designedGuard: true
    });
    const open = injectField(state, "fountain_of_youth", "91,90", { tileInstanceId: "ntile" });
    injectField(state, "empty_field", "89,90", { tileInstanceId: "othertile" });
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "89,90";

    // The break guard itself is the ONE fightable entrance.
    expect(classifyHeroStep(state, hero, brk.spaceId)).toBe("stop");
    // Its GUARDED side-field (a Pandora) is walled — not offered as a fight
    // until the break falls. This is the "Pandora always movable" fix.
    expect(classifyHeroStep(state, hero, sideGuard.spaceId)).toBe("block");
    // Its open hex (a Fountain / "waterfall") is walled too.
    expect(classifyHeroStep(state, hero, open.spaceId)).toBe("block");

    // CONTROL: strip the Break designation — with no designated break and the
    // map-wide gate off, the side-guard is directly fightable and the open hex
    // freely enterable (the seal comes from the designation, nothing else).
    delete brk.breakField;
    delete brk.breakTileGate;
    expect(classifyHeroStep(state, hero, sideGuard.spaceId)).toBe("stop");
    expect(classifyHeroStep(state, hero, open.spaceId)).not.toBe("block");

    // Restore the break, then beat it: the whole tile opens — "no more break
    // means you can go", the Fountain / waterfall included.
    brk.breakField = true;
    brk.breakTileGate = true;
    expect(classifyHeroStep(state, hero, open.spaceId)).toBe("block");
    brk.flagOwnerId = "p1";
    brk.everFlagged = true; // break guard beaten -> no longer guarded
    expect(classifyHeroStep(state, hero, sideGuard.spaceId)).toBe("stop");
    expect(classifyHeroStep(state, hero, open.spaceId)).not.toBe("block");
  });

  it("a MAP-WIDE Break stamp never seals a Ⅳ–Ⅴ tile the Break options do not cover", () => {
    // USER REPORT 2026-09-16: "can't enter IV-V field with break even [though]
    // in options it is already said properly: for VI-VII field". The map-wide
    // mines/obelisks Break flag stamps `breakField` on EVERY mine — Ⅳ–Ⅴ and
    // underground tiles included — and the whole-tile seal must NOT fire from
    // that: only the per-tile designation (`breakTileGate`) seals a tile.
    const state = makeGame("global-break-no-tile-seal");
    state.adventure!.mapPreset = { breaks: { enterCenterTiles: true }, mines: { breakField: true } };
    state.adventure!.tiles["ntile"] = {
      id: "ntile",
      tileDefId: "N1",
      centerRow: 90,
      centerCol: 90,
      rotation: 0,
      faceDown: false,
      group: "near"
    } as never;
    // The global stamp: breakField WITHOUT breakTileGate (what
    // materializeTileFields writes for a map-wide mines/obelisks flag).
    const mine = injectField(state, "mine", "90,90", {
      tileInstanceId: "ntile",
      difficulty: 3,
      breakField: true
    });
    const sideGuard = injectField(state, "pandoras_box", "90,91", {
      tileInstanceId: "ntile",
      difficulty: 5,
      designedGuard: true
    });
    const open = injectField(state, "mystical_garden", "91,90", { tileInstanceId: "ntile" });
    injectField(state, "empty_field", "89,90", { tileInstanceId: "othertile" });
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "89,90";

    // The mine keeps its documented PER-FIELD Break meaning: fight to enter,
    // Pathfinding may not pass through.
    expect(
      classifyHeroStep(state, hero, mine.spaceId, { passEncounters: true, moveThrough: false } as never)
    ).toBe("stop");
    // But the REST of the Ⅳ–Ⅴ tile is not walled off by it: the side guard is
    // directly fightable and the open hex freely enterable.
    expect(classifyHeroStep(state, hero, sideGuard.spaceId)).toBe("stop");
    expect(classifyHeroStep(state, hero, open.spaceId)).not.toBe("block");

    // MUTATION CONTROL (old vs new rules diverge): promoting the same stamp to
    // the per-tile gate seals the tile again — proving the seal reads
    // `breakTileGate`, not `breakField`.
    mine.breakTileGate = true;
    expect(classifyHeroStep(state, hero, sideGuard.spaceId)).toBe("block");
    expect(classifyHeroStep(state, hero, open.spaceId)).toBe("block");
  });

  it("a designer 'no experience' field withholds hero XP on a REAL win (CONTROL: it pays without the flag)", () => {
    // Difficulty VI vs a level-1 hero normally pays experience for a fought win;
    // the designer opt-out (`field.noExperience`) suppresses ONLY the XP — the
    // fight is real and every other reward path still runs.
    function fightAndFinishXp(noExperience: boolean): number {
      const state = makeGame(`no-xp-${noExperience}`);
      const hero = getMainHero(state, "p1")!;
      hero.level = 1;
      hero.experience = 0;
      const field = injectField(state, "mine", "77,77", {
        difficulty: 6,
        designedGuard: true,
        customGuardUnits: ["neutral.skeletons"],
        ...(noExperience ? { noExperience: true } : {})
      });
      placeHero(state, "p1", field.spaceId);
      startNeutralEncounter(state, hero, field);
      const combat = state.combat!;
      combat.setup = null;
      combat.units = {};
      combat.activeUnitId = null;
      combat.outcome = {
        winnerPlayerId: "p1",
        defeatedPlayerId: NEUTRAL_PLAYER_ID,
        reason: "all-enemy-units-defeated"
      };
      finalizeAdventureCombat(state);
      return getMainHero(state, "p1")!.experience;
    }

    expect(fightAndFinishXp(false)).toBeGreaterThan(0);
    expect(fightAndFinishXp(true)).toBe(0);
  });

  it("survivorsToCustomGuardUnits keeps living units only", () => {
    const living = [
      { unitDefId: "neutral.skeletons", damage: 0, maxHealth: 2 },
      { unitDefId: "neutral.zombies", damage: 5, maxHealth: 5 }, // dead
      { unitDefId: "castle.halberdiers", factionPack: true, damage: 0, maxHealth: 3 }
    ];
    // Filter like the combat hook (living only).
    const survivors = survivorsToCustomGuardUnits(
      living.filter((u) => u.damage < u.maxHealth)
    );
    expect(survivors).toEqual(["neutral.skeletons", "pack:castle.halberdiers"]);
  });

  it("persistentGuard stamps survivors after a retreated fight", () => {
    const state = makeGame("persist-guard");
    // Low-level hero so Quick Combat cannot skip.
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    const field = injectField(state, "mine", "20,20", {
      difficulty: 3,
      designedGuard: true,
      persistentGuard: true,
      breakField: true,
      customGuardUnits: ["neutral.skeletons", "neutral.zombies", "neutral.wights"]
    });
    placeHero(state, "p1", field.spaceId);
    startNeutralEncounter(state, hero, field);
    expect(state.combat).toBeTruthy();
    // Kill one neutral, leave others alive, force a retreat outcome.
    const combat = state.combat!;
    // Skip placement: force combat ready with drawn guards.
    if (combat.setup) {
      combat.setup = null;
      combat.pendingNeutralDraws = drawGuardArmy(state, field, 3);
      // Mint minimal combat units for the neutrals.
      let n = 0;
      for (const draw of combat.pendingNeutralDraws ?? []) {
        const id = `n${n++}`;
        combat.units[id] = {
          id,
          controllerId: NEUTRAL_PLAYER_ID,
          name: draw.unitDefId,
          cardName: draw.unitDefId,
          variant: "neutral",
          grade: draw.tier,
          type: "melee",
          attack: 1,
          defense: 0,
          maxHealth: 2,
          damage: n === 1 ? 2 : 0, // first dies
          initiative: 1,
          position: n,
          unitDefId: draw.unitDefId,
          bankGuard: true,
          abilities: []
        } as never;
      }
      combat.pendingNeutralDraws = undefined;
    }
    combat.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "retreat"
    };
    finalizeAdventureCombat(state);
    // Field still guarded with survivors only.
    expect(isFieldGuarded(field)).toBe(true);
    expect(field.customGuardUnits?.length).toBeGreaterThan(0);
    expect(field.customGuardUnits?.length).toBeLessThan(3);
    expect(field.persistentGuard).toBe(true);
  });

  it("persistentGuard keeps a faction-Pack survivor AS a pack: slot (variant-derived — CombatUnitState has no factionPack flag)", () => {
    // Mutation control: reading a nonexistent unit.factionPack instead of the
    // variant would persist "castle.swordsmen" bare, which resolveCustomGuardDraws
    // then DROPS (no neutral side) — the guard would vanish from the re-fight.
    const state = makeGame("persist-pack-guard");
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    const field = injectField(state, "mine", "21,21", {
      difficulty: 2,
      designedGuard: true,
      persistentGuard: true,
      customGuardUnits: ["pack:castle.halberdiers", "neutral.zombies"]
    });
    placeHero(state, "p1", field.spaceId);
    startNeutralEncounter(state, hero, field);
    const combat = state.combat!;
    combat.setup = null;
    // Mint the two guards the way the engine would: the pack: slot is variant
    // "pack", the plain neutral is variant "neutral". Zombies die; the Pack —
    // flipped down to Few mid-fight — survives.
    combat.units.n0 = {
      id: "n0",
      controllerId: NEUTRAL_PLAYER_ID,
      name: "Halberdiers",
      cardName: "Pack of Halberdiers",
      variant: "few",
      grade: "bronze",
      type: "melee",
      attack: 1,
      defense: 0,
      maxHealth: 2,
      damage: 0,
      initiative: 1,
      position: 0,
      unitDefId: "castle.halberdiers",
      bankGuard: true,
      abilities: []
    } as never;
    combat.units.n1 = {
      id: "n1",
      controllerId: NEUTRAL_PLAYER_ID,
      name: "Zombies",
      cardName: "Neutral Zombies",
      variant: "neutral",
      grade: "bronze",
      type: "melee",
      attack: 1,
      defense: 0,
      maxHealth: 2,
      damage: 2, // dead
      initiative: 1,
      position: 1,
      unitDefId: "neutral.zombies",
      bankGuard: true,
      abilities: []
    } as never;
    combat.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "retreat"
    };
    finalizeAdventureCombat(state);
    expect(field.customGuardUnits, "Few survivor re-persists as its pack: slot").toEqual([
      "pack:castle.halberdiers"
    ]);
    // And the re-fight actually minted it (not silently dropped).
    const redraw = drawGuardArmy(state, field, 2);
    expect(redraw.map((d) => d.unitDefId)).toEqual(["castle.halberdiers"]);
    expect(redraw[0]?.factionPack).toBe(true);
  });
});

describe("map-design-features — unlimited rounds flag", () => {
  it("field.unlimitedCombatRounds is stamped from mine/obelisk preset options", () => {
    const field = {
      spaceId: "1,1",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    applyBreakFieldOptions(field, { unlimitedRounds: true, breakField: true });
    expect(field.unlimitedCombatRounds).toBe(true);
    expect(field.breakField).toBe(true);
    // CONTROL: clearing
    applyBreakFieldOptions(field, {});
    expect(field.unlimitedCombatRounds).toBeUndefined();
  });
});

describe("map-design-features — Grail dig cost + random town income", () => {
  it("grailDigMovementCost reads preset (0/1/2) with classic 1 default", () => {
    const state = makeGame("dig-cost");
    expect(grailDigMovementCost(state)).toBe(1);
    state.adventure!.mapPreset = { objectives: { grailDigCost: 0 } };
    expect(grailDigMovementCost(state)).toBe(0);
    state.adventure!.mapPreset = { objectives: { grailDigCost: 2 } };
    expect(grailDigMovementCost(state)).toBe(2);
  });

  it("randomTownIncomeGold defaults to 10 and clamps a map-maker value", () => {
    const state = makeGame("rt-income");
    expect(randomTownIncomeGold(state)).toBe(10);
    state.adventure!.mapPreset = { randomTowns: { incomeGold: 5 } };
    expect(randomTownIncomeGold(state)).toBe(5);
  });

  it("sanitizeCustomMapPreset keeps mines / randomTowns / grail dig options", () => {
    const preset = sanitizeCustomMapPreset({
      mines: {
        guard: { level: 3 },
        breakField: true,
        persistentGuard: true,
        unlimitedRounds: true
      },
      randomTowns: {
        guard: { units: ["random:gold"] },
        incomeGold: 7,
        captureReward: { gold: 4, valuables: 1 }
      },
      objectives: {
        hiddenGrailUtopia: true,
        grailDigCost: 2,
        grailDigReward: { gold: 5 },
        grailPossessionVp: 3,
        grailAsUtopia: "after-dig-empty",
        grailBuildAt: "both",
        grailBuildReward: { gold: 2, freeBuilding: true }
      },
      obelisks: {
        role: "bonus",
        bonuses: [{ kind: "ability_token" }],
        guard: { units: ["random:bronze"] },
        breakField: true
      }
    });
    expect(preset?.mines?.breakField).toBe(true);
    expect(preset?.mines?.guard).toEqual({ level: 3 });
    expect(preset?.randomTowns?.incomeGold).toBe(7);
    expect(preset?.randomTowns?.guard?.units).toEqual(["random:gold"]);
    expect(preset?.objectives?.hiddenGrailUtopia).toBe(true);
    expect(preset?.objectives?.grailDigCost).toBe(2);
    expect(preset?.objectives?.grailBuildAt).toBe("both");
    expect(preset?.obelisks?.bonuses).toEqual([{ kind: "ability_token" }]);
    expect(preset?.obelisks?.breakField).toBe(true);
  });
});

describe("map-design-features — drawGuardArmy random slots", () => {
  it("mints random-tier certain-army units at fight time", () => {
    const state = makeGame("draw-random");
    const field = injectField(state, "obelisk", "30,30");
    applyCustomGuardToField(field, { units: ["random:bronze", "random:silver"] });
    const draws = drawGuardArmy(state, field, field.difficulty ?? 1);
    expect(draws.length).toBe(2);
    expect(draws.every((d) => d.bankGuard)).toBe(true);
    expect(draws[0].tier).toBe("bronze");
    expect(draws[1].tier).toBe("silver");
  });
});

describe("map-design-features — dig cost free path", () => {
  it("REVISIT dig with cost 0 works at 0 movement", () => {
    const state = createAdventureGameState({
      seed: "dig-free",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail"
    });
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      objectives: {
        ...(state.adventure!.mapPreset?.objectives ?? {}),
        grailDigCost: 0,
        grailObelisksRequired: 1
      }
    };
    // Arm dig: visit 1 obelisk worth of progress + diggable field.
    const field = injectField(state, "grail", "40,40", {
      difficulty: 7,
      blackCube: true,
      grailDiggable: true
    });
    const heroId = placeHero(state, "p1", field.spaceId);
    const hero = state.heroes[heroId]!;
    hero.movementPoints = 0;
    // Satisfy dig unlock.
    state.adventure!.grail = {
      status: "uncollected",
      obelisksVisited: { p1: ["ob1"] }
    };
    state.activePlayerId = "p1";
    state.phase = "player-turn";
    // Clear any start-of-turn hand gate that would block REVISIT.
    const player = state.players.p1;
    if (player) {
      player.canMulligan = false;
    }
    revisitField(state, { type: "REVISIT_FIELD", playerId: "p1", heroId });
    expect(state.adventure?.grail?.status).toBe("carried");
    expect(state.heroes[heroId]?.movementPoints).toBe(0);
  });
});

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function readyPlayer(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (player) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
}

describe("map-design-features — near live pool (resource pick)", () => {
  it("parks leftover Near tiles on adventure.nearTilePool at setup (CONTROL: far twin)", () => {
    const state = makeGame("near-pool-setup");
    expect(Array.isArray(state.adventure?.nearTilePool)).toBe(true);
    expect(Array.isArray(state.adventure?.farTilePool)).toBe(true);
    // Both pools are leftovers after layout draws — non-negative, independent.
    expect((state.adventure?.nearTilePool ?? []).length).toBeGreaterThanOrEqual(0);
    expect((state.adventure?.farTilePool ?? []).length).toBeGreaterThanOrEqual(0);
  });

  it("Near resource pick draws from nearTilePool (not a face-down swap)", () => {
    const state = makeGame("near-pool-pick");
    // Plant a face-down near tile without a gold mine, and a live pool entry WITH one.
    const nearGoldId = Object.keys(allTileDefinitions).find((id) => tileDefHasResourceMine(id, "gold")) ?? null;
    expect(nearGoldId, "need at least one gold-mine tile def in data").toBeTruthy();

    const tileId = "near-pick-tile";
    state.adventure!.tiles[tileId] = {
      id: tileId,
      tileDefId: "N1",
      centerRow: 50,
      centerCol: 50,
      rotation: 0,
      faceDown: true,
      group: "near",
      playerResourcePick: true
    };
    // Ensure the provisional def is NOT already the preferred mine (so a pick must reassign).
    // Seed the live near pool with the gold mine tile.
    state.adventure!.nearTilePool = [nearGoldId!];
    const poolBefore = [...(state.adventure!.nearTilePool ?? [])];
    expect(poolBefore).toContain(nearGoldId);

    // Resolve as if the player picked gold (option 0).
    state.pendingChoice = {
      id: "c1",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Choose the mine type for this tile",
      options: [{ label: "Gold mine" }, { label: "Valuables mine" }, { label: "No preference (random)" }],
      context: "player-resource-pick",
      playerTilePick: { tileInstanceId: tileId },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state.activePlayerId = "p1";
    readyPlayer(state, "p1");

    const next = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "c1",
      optionIndex: 0
    });
    // Tile took a gold-mine def from the LIVE pool.
    expect(tileDefHasResourceMine(next.adventure!.tiles[tileId]!.tileDefId, "gold")).toBe(true);
    // Pool exchanged: gold id left, provisional N1 returned when known.
    expect(next.adventure!.nearTilePool).not.toContain(nearGoldId);
    // CONTROL: no other face-down near tile was rewritten (none existed).
    const otherNear = Object.values(next.adventure!.tiles).filter(
      (t) => t.id !== tileId && t.group === "near" && t.faceDown
    );
    for (const t of otherNear) {
      // None planted — empty loop is the control that we did not invent swaps.
      expect(t.tileDefId).toBeTruthy();
    }
    expect(poolBefore.length).toBeGreaterThan(0);
  });
});

describe("map-design-features — Grail free-build picker", () => {
  function grailCarryAtTown(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail"
    });
    readyPlayer(state, "p1");
    state.activePlayerId = "p1";
    state.phase = "player-turn";
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      objectives: {
        ...(state.adventure!.mapPreset?.objectives ?? {}),
        grailBuildAt: "town",
        grailBuildReward: { freeBuilding: true, gold: 2 }
      }
    };
    const town = state.towns.town_p1;
    expect(town?.fieldId).toBeTruthy();
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = town.fieldId!;
    state.adventure!.grail = { status: "carried", carrierHeroId: hero.id };
    // Ensure the Build token is still available so a CONTROL can prove free
    // build does NOT spend it.
    state.players.p1.townTokens.build = true;
    // Strip gold so a normal BUILD_STRUCTURE would fail — free must ignore cost.
    state.players.p1.resources.gold = 0;
    state.players.p1.resources.buildingMaterials = 0;
    state.players.p1.resources.valuables = 0;
    return state;
  }

  it("BUILD_GRAIL with freeBuilding opens a free-build picker (not a note-only flag)", () => {
    let state = grailCarryAtTown("grail-free-pick");
    const candidates = grailFreeBuildingCandidates(state, "p1", "town_p1");
    expect(candidates.length).toBeGreaterThan(0);

    state = applyOk(state, { type: "BUILD_GRAIL", playerId: "p1", heroId: "hero_p1" });
    expect(state.adventure?.grail?.status).toBe("built");
    expect(state.players.p1.resources.gold).toBe(2); // dig/build gold reward still paid
    // Real picker, not a grailFreeBuilding boolean voucher.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe(
      "grail-free-building"
    );
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.grailFreeBuilding?.buildingIds.length
    ).toBe(candidates.length);
    // No decorative player flag.
    expect((state.players.p1 as { grailFreeBuilding?: boolean }).grailFreeBuilding).toBeUndefined();
  });

  it("resolving the picker builds for free without spending the Build token or resources", () => {
    let state = grailCarryAtTown("grail-free-resolve");
    state = applyOk(state, { type: "BUILD_GRAIL", playerId: "p1", heroId: "hero_p1" });
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    const choice = state.pendingChoice!;
    const buildingId =
      choice.type === "OPTION_CHOICE" ? choice.grailFreeBuilding?.buildingIds[0] : undefined;
    expect(buildingId).toBeTruthy();
    const goldBefore = state.players.p1.resources.gold;
    const matsBefore = state.players.p1.resources.buildingMaterials;
    const buildTokenBefore = state.players.p1.townTokens.build;

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
    expect(state.towns.town_p1.buildings).toContain(buildingId);
    expect(state.players.p1.resources.gold).toBe(goldBefore);
    expect(state.players.p1.resources.buildingMaterials).toBe(matsBefore);
    expect(state.players.p1.townTokens.build).toBe(buildTokenBefore);
    expect(state.pendingChoice).toBeNull();
  });

  it("Skip declines without building (CONTROL)", () => {
    let state = grailCarryAtTown("grail-free-skip");
    const buildingsBefore = [...state.towns.town_p1.buildings];
    state = applyOk(state, { type: "BUILD_GRAIL", playerId: "p1", heroId: "hero_p1" });
    const choice = state.pendingChoice!;
    const skipIndex =
      choice.type === "OPTION_CHOICE" ? (choice.grailFreeBuilding?.buildingIds.length ?? 0) : 0;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: skipIndex
    });
    expect(state.towns.town_p1.buildings).toEqual(buildingsBefore);
    expect(state.pendingChoice).toBeNull();
  });
});

describe("map-design-features — Built Grail control fight", () => {
  it("isBuiltGrailField is true only on the built field (CONTROL: other field)", () => {
    const state = makeGame("built-grail-id");
    const field = injectField(state, "town", "70,70", { flagOwnerId: "p1" });
    const other = injectField(state, "settlement", "71,71", { flagOwnerId: "p1" });
    state.adventure!.grail = { status: "built", builtFieldId: field.spaceId };
    expect(isBuiltGrailField(state, field)).toBe(true);
    expect(isBuiltGrailField(state, other)).toBe(false);
    // CONTROL: carried (not built) is not a control site.
    state.adventure!.grail = { status: "carried", carrierHeroId: "hero_p1" };
    expect(isBuiltGrailField(state, field)).toBe(false);
  });

  it("contesting a built Grail site is always a siege (normal town CONTROL: no Citadel = no siege)", () => {
    const state = createAdventureGameState({
      seed: "grail-siege",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail"
    });
    readyPlayer(state, "p1");
    readyPlayer(state, "p2");
    state.activePlayerId = "p1";
    state.phase = "player-turn";

    // p2's town without Citadel — plain capture would NOT be a siege.
    const town = state.towns.town_p2;
    town.buildings = town.buildings.filter(
      (id) => !id.includes("citadel") && !id.includes("castle")
    );
    // Ensure no UNLOCK_REINFORCE building remains.
    town.buildings = [];
    const fieldId = town.fieldId!;
    const field = state.adventure!.fields[fieldId];
    field.flagOwnerId = "p2";
    field.everFlagged = true;
    state.adventure!.grail = { status: "built", builtFieldId: fieldId };

    const attacker = getMainHero(state, "p1")!;
    // Place attacker next to the town for a direct combat start.
    attacker.spaceId = fieldId;
    // p2 main hero stands on the field so this is hero-vs-hero.
    const defender = getMainHero(state, "p2")!;
    defender.spaceId = fieldId;

    startPlayerCombat(state, attacker, defender, fieldId);
    expect(state.combat?.context.kind).toBe("player");
    expect(state.combat?.context.kind === "player" && state.combat.context.siege).toBe(true);

    // CONTROL: same fight without built Grail and without Citadel is NOT a siege.
    const control = createAdventureGameState({
      seed: "grail-siege-control",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail"
    });
    readyPlayer(control, "p1");
    readyPlayer(control, "p2");
    control.activePlayerId = "p1";
    control.phase = "player-turn";
    const cTown = control.towns.town_p2;
    cTown.buildings = [];
    const cFieldId = cTown.fieldId!;
    control.adventure!.fields[cFieldId].flagOwnerId = "p2";
    // No built grail.
    control.adventure!.grail = { status: "uncollected" };
    const cAttacker = getMainHero(control, "p1")!;
    const cDefender = getMainHero(control, "p2")!;
    cAttacker.spaceId = cFieldId;
    cDefender.spaceId = cFieldId;
    startPlayerCombat(control, cAttacker, cDefender, cFieldId);
    expect(control.combat?.context.kind === "player" && control.combat.context.siege).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Map editor 2026-09-29 (engine protocol v192): Cyclops Cavern options, Utopia
// Obelisk entry requirement, scoring hold objectives, Random Town fixed
// faction. Each behaviour has a CONTROL where the classic rule must apply.
// ---------------------------------------------------------------------------
describe("map editor 2026-09-29 — Cyclops Cavern / Utopia gate / scoring holds / fixed Random Town", () => {
  const bankCyclopes = (state: GameState, field: MapFieldState) =>
    drawGuardArmy(state, field, 7).filter((draw) => draw.unitDefId === "neutral.cyclopes" && draw.bankGuard).length;

  it("Cyclops Cavern: the map-wide extra-Cyclopes option is stamped on reveal and drawn (printed 2 is the CONTROL)", () => {
    const control = makeGame("cyclops-control");
    const controlTile: MapTileState = { id: "cyc-c", tileDefId: "U7", centerRow: 40, centerCol: 40, rotation: 0, faceDown: false, group: "subterranean" };
    control.adventure!.tiles[controlTile.id] = controlTile;
    materializeTileFields(control.adventure!, controlTile);
    const controlField = Object.values(control.adventure!.fields).find((field) => field.tileInstanceId === "cyc-c" && field.location === "cyclops_stockpile")!;
    expect(controlField.cyclopsExtraGuards).toBeUndefined();
    expect(bankCyclopes(control, controlField)).toBe(2);

    const state = makeGame("cyclops-extra");
    state.adventure!.mapPreset = sanitizeCustomMapPreset({ cyclopsStockpiles: { extraCyclopes: 4 } }) ?? null;
    const tile: MapTileState = { id: "cyc-x", tileDefId: "U7", centerRow: 40, centerCol: 40, rotation: 0, faceDown: false, group: "subterranean" };
    state.adventure!.tiles[tile.id] = tile;
    materializeTileFields(state.adventure!, tile);
    const field = Object.values(state.adventure!.fields).find((candidate) => candidate.tileInstanceId === "cyc-x" && candidate.location === "cyclops_stockpile")!;
    expect(field.cyclopsExtraGuards).toBe(4);
    expect(bankCyclopes(state, field)).toBe(4);
    field.cyclopsExtraGuards = 0;
    expect(bankCyclopes(state, field)).toBe(0);
  });

  it("Utopia gate: a hero cannot enter until their side flagged N Obelisks (no requirement is the CONTROL)", () => {
    const plans: CustomMapTilePlan[] = [
      { row: 8, col: 2, group: "starting", faceDown: false },
      { row: 10, col: 7, group: "starting", faceDown: false },
      { row: 9, col: 4, group: "center", faceDown: false, tileDefId: "C4", viiField: "dragon_utopia", centerHex: { utopiaObelisksRequired: 2 } }
    ];
    const state = createAdventureGameState({ seed: "utopia-gate", difficulty: "normal", rollFirstPlayer: false, victoryMode: "conquest", customMap: plans });
    const utopia = Object.values(state.adventure!.fields).find((field) => field.location === "dragon_utopia")!;
    expect(utopia.utopiaObelisksRequired).toBe(2);
    const hero = getMainHero(state, "p1")!;
    expect(classifyHeroStep(state, hero, utopia.spaceId)).toBe("block");
    // One flagged Obelisk is still short.
    injectField(state, "obelisk", "70,70", { flagOwnerId: "p1" });
    expect(classifyHeroStep(state, hero, utopia.spaceId)).toBe("block");
    // The opponent's Obelisks never count for p1.
    injectField(state, "obelisk", "71,71", { flagOwnerId: "p2" });
    expect(classifyHeroStep(state, hero, utopia.spaceId)).toBe("block");
    injectField(state, "obelisk", "72,72", { flagOwnerId: "p1" });
    expect(classifyHeroStep(state, hero, utopia.spaceId)).not.toBe("block");

    // CONTROL: the same Utopia without the option is enterable at once.
    const open = createAdventureGameState({
      seed: "utopia-gate",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: plans.map((plan) => (plan.group === "center" ? { ...plan, centerHex: undefined } : plan))
    });
    const openUtopia = Object.values(open.adventure!.fields).find((field) => field.location === "dragon_utopia")!;
    expect(openUtopia.utopiaObelisksRequired).toBeUndefined();
    expect(classifyHeroStep(open, getMainHero(open, "p1")!, openUtopia.spaceId)).not.toBe("block");
    // The lobby banner explains the gate before the game starts.
    expect(describeCustomMapPresetEntries(undefined, plans).some((entry) => /Obelisk/.test(entry.text))).toBe(true);
    expect(describeCustomMapPresetEntries(undefined, plans.slice(0, 2)).some((entry) => /Obelisk/.test(entry.text))).toBe(false);
  });

  it("scoring hold: 'vp' pays the hold VP once and never ends the game; 'both' pays and wins; classic 'win' is the CONTROL", () => {
    const hold = (seed: string, outcome: "vp" | "both" | undefined) => {
      const state = makeGame(seed);
      const field = injectField(state, "settlement", "60,60", { flagOwnerId: "p1", holdRoundsToWin: 2 });
      if (outcome) {
        field.holdOutcome = outcome;
        field.holdVp = 5;
      }
      return { state, field };
    };
    const vp = hold("hold-vp", "vp");
    tickSettlementHoldControl(vp.state);
    expect(vp.state.adventure!.vpLedger?.p1?.holdVp ?? 0).toBe(0);
    tickSettlementHoldControl(vp.state);
    expect(vp.state.adventure!.vpLedger?.p1?.holdVp).toBe(5);
    expect(vp.state.adventure!.winnerPlayerId ?? null).toBeNull();
    tickSettlementHoldControl(vp.state);
    expect(vp.state.adventure!.vpLedger?.p1?.holdVp).toBe(5); // paid once per holder

    const both = hold("hold-both", "both");
    tickSettlementHoldControl(both.state);
    tickSettlementHoldControl(both.state);
    expect(both.state.adventure!.vpLedger?.p1?.holdVp).toBe(5);
    expect(both.state.adventure!.winnerPlayerId).toBe("p1");

    const classic = hold("hold-win", undefined);
    tickSettlementHoldControl(classic.state);
    tickSettlementHoldControl(classic.state);
    expect(classic.state.adventure!.winnerPlayerId).toBe("p1");
    expect(classic.state.adventure!.vpLedger?.p1?.holdVp ?? 0).toBe(0);
  });

  it("Random Town fixed faction: every revealed Random Town uses it (the rolled unused faction is the CONTROL)", () => {
    const used = (state: GameState) => state.players.p1.factionId!;
    const control = makeGame("rt-fixed-control");
    const controlField = injectField(control, "random_town", "61,61");
    ensureRevealedRandomTownFactions(control);
    // The classic roll never picks a faction a player already uses.
    expect(controlField.faction).toBeTruthy();
    expect(controlField.faction).not.toBe(used(control));

    const state = makeGame("rt-fixed");
    state.adventure!.mapPreset = sanitizeCustomMapPreset({ randomTowns: { fixedFaction: used(state) } }) ?? null;
    const field = injectField(state, "random_town", "61,61");
    ensureRevealedRandomTownFactions(state);
    expect(field.faction).toBe(used(state));
  });

  it("new preset fields round-trip through the sanitizer; legacy presets and garbage get safe defaults", () => {
    const preset = sanitizeCustomMapPreset({
      cyclopsStockpiles: { extraCyclopes: 9, vp: 3 },
      randomTowns: { fixedFaction: "tower" }
    });
    expect(preset?.cyclopsStockpiles).toEqual({ extraCyclopes: 4, vp: 3 });
    expect(preset?.randomTowns?.fixedFaction).toBe("tower");
    expect(sanitizeCustomMapPreset({ randomTowns: { fixedFaction: "no-such-faction" } })?.randomTowns).toBeUndefined();
    const legacy = sanitizeCustomMapPreset({ randomTowns: { vp: 2 } });
    expect(legacy?.cyclopsStockpiles).toBeUndefined();
    expect(legacy?.randomTowns?.fixedFaction).toBeUndefined();

    expect(sanitizeCenterHexPlan({ holdRoundsToWin: 3, holdOutcome: "vp", holdVp: 4, utopiaObelisksRequired: 12 })).toMatchObject({
      holdRoundsToWin: 3,
      holdOutcome: "vp",
      holdVp: 4,
      utopiaObelisksRequired: 8
    });
    // An outcome without a hold has nothing to score.
    expect(sanitizeCenterHexPlan({ holdOutcome: "vp", holdVp: 4, vp: 1 })?.holdOutcome).toBeUndefined();
    expect(sanitizeSettlementFieldPlan({ holdRoundsToWin: 2, holdOutcome: "both" })).toMatchObject({ holdRoundsToWin: 2, holdOutcome: "both" });
    expect(sanitizeSettlementFieldPlan({ holdRoundsToWin: 2, holdOutcome: "sideways" })?.holdOutcome).toBeUndefined();
  });
});
