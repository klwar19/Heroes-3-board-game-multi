import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { factionUiLexicon, factionVisualRegister } from "@/data/faction-theme";
import { coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs, townIconUrl } from "@/data/towns/boards";
import { commanderSoundKey, unitSoundKey } from "@/data/unit-sounds";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState } from "@/engine";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "@/engine/state";

/**
 * Heavenly Demon Palace (`heavenly_demon`, Thiên Ma Cung) — the SECOND playable
 * xianxia town, the EVIL demonic-path sect. Gated on the SAME
 * `anime.enabled && anime.xianxiaTowns` flag as Azure Breeze Sect.
 *
 * This file pins the town like hidden-leaf-content / azur-lane-content: the EXACT
 * per-side ability ids of all seven units (the Few/Pack divergence is the mutation
 * control), the module gate truth table, the commander (Demon Ancestor) wiring,
 * all FIVE heroes' specialties, the starting tile, the board spec + bar art, the
 * wuxia visual register, the unit voices, the two dedicated NEW abilities'
 * registration — and one BEHAVIOURAL combat spot-check proving a roster arm
 * executes in play. The commander's own cast/specialty behaviour is pinned in
 * src/engine/wog-commanders.test.ts (the "Demon Ancestor" block).
 */

const FACTION = "heavenly_demon";

/** The COMPLETE, literal per-side wired ability list for every unit (CLAUDE.md §2). */
const EXPECTED_ABILITIES: Record<string, { few: string[]; pack: string[] }> = {
  "heavenly_demon.blood_disciples": { few: [], pack: ["heavenly-demon-blood-siphon"] },
  "heavenly_demon.gu_witches": {
    few: ["ignore-combat-penalties"],
    pack: ["ignore-combat-penalties", "basilisk-paralysis"]
  },
  "heavenly_demon.shadow_wraiths": { few: [], pack: ["ignores-retaliation"] },
  "heavenly_demon.corpse_puppets": {
    few: ["commander-defense-token"],
    pack: ["commander-defense-token", "automaton-detonate-1"]
  },
  "heavenly_demon.bone_reavers": {
    few: ["commander-charge"],
    pack: ["commander-charge", "ignores-retaliation"]
  },
  "heavenly_demon.ghost_king": { few: ["wraith-heal-1"], pack: ["wraith-heal-2", "unlimited-retaliation"] },
  "heavenly_demon.demon_avatar": {
    few: ["heavenly-demon-reap"],
    pack: ["heavenly-demon-reap", "titan-ignore-ongoing"]
  }
};

/** The two dedicated NEW engine arms this faction ships (behaviour: heavenly-demon-abilities.test.ts). */
const NEW_ABILITIES: Record<string, { type: string; amount: number }> = {
  "heavenly-demon-blood-siphon": { type: "HEAL_SELF_ON_DAMAGE_DEALT", amount: 1 },
  "heavenly-demon-reap": { type: "ATTACK_BUFF_ON_ADJACENT_REMOVAL", amount: 1 }
};

/** Stat/cost envelopes (both sides must sit inside). */
const ENVELOPES: Record<
  "bronze" | "silver" | "gold",
  { attack: [number, number]; defense: [number, number]; health: [number, number]; initiative: [number, number]; gold: [number, number]; valuables: [number, number] }
> = {
  bronze: { attack: [1, 3], defense: [1, 2], health: [2, 3], initiative: [5, 8], gold: [2, 6], valuables: [0, 0] },
  silver: { attack: [2, 4], defense: [2, 3], health: [3, 5], initiative: [3, 7], gold: [7, 13], valuables: [0, 0] },
  gold: { attack: [5, 7], defense: [2, 3], health: [5, 8], initiative: [3, 7], gold: [13, 23], valuables: [1, 2] }
};

function fileExists(assetPath: string, minBytes = 1000): boolean {
  const file = join(process.cwd(), "public", assetPath.replace(/^\//, ""));
  return existsSync(file) && statSync(file).size > minBytes;
}

describe("Heavenly Demon Palace — registration & roster shape", () => {
  it("registers a complete faction: 7 units (3/2/2), 8 buildings, 5 heroes, demon tile + commander", () => {
    const faction = coreFactionDefinitions[FACTION];
    expect(faction).toBeDefined();
    expect(faction.name).toBe("Heavenly Demon Palace");
    expect(faction.startingTileId).toBe("D-S1");
    expect(faction.units).toHaveLength(7);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.heroes).toEqual(["xuedao", "guiyan", "xuanming", "yaoji", "molian"]);

    const byTier = { bronze: 0, silver: 0, gold: 0, azure: 0 };
    for (const id of faction.units) byTier[coreUnitDefinitions[id].tier] += 1;
    expect(byTier).toEqual({ bronze: 3, silver: 2, gold: 2, azure: 0 });

    // Every rostered unit is pinned in EXPECTED_ABILITIES (no unit escapes the pin).
    expect([...faction.units].sort()).toEqual(Object.keys(EXPECTED_ABILITIES).sort());
    expect(COMMANDER_SLUG_BY_FACTION[FACTION]).toBe("demon_ancestor");
  });

  it("maps heavenly_demon → demon_ancestor with an implemented cast + Undead specialty + a resolving voice", () => {
    const commander = commanderDefinitions.demon_ancestor;
    expect(commander).toBeDefined();
    expect(commander.faction).toBe("Heavenly Demon Palace");
    expect(commander.original).toBe(true);
    // Cast: REUSE the Dungeon Brute's Bloodlust arm (the Fuyuki Regent precedent).
    expect(commander.cast.name).toBe("Blood Frenzy");
    expect(commander.cast.abilityId).toBe("commander-cast-brute");
    expect(unitAbilities[commander.cast.abilityId]?.implementationStatus).toBe("implemented");
    expect(commander.cast.tierText).toHaveLength(3);
    // Specialty: REUSE the Soul Eater's `undead` id (specialty-keyed paralysis
    // immunity, the Belfast first-aid precedent).
    expect(commander.specialty.id).toBe("undead");
    expect(commander.specialty.name).toBe("Undying Demon Body");
    expect(fileExists(commander.cardImage)).toBe(true);
    // Every action resolves to a real clip (Dungeon Minotaur voice).
    for (const action of ["attack", "move", "defend", "hurt", "death"] as const) {
      expect(commanderSoundKey("demon_ancestor", action), action).toBeTruthy();
    }
  });

  it("uses the wuxia visual register (same as Azure Breeze) with the Martial-Path lexicon", () => {
    expect(factionVisualRegister(FACTION)).toBe("wuxia");
    expect(factionUiLexicon(FACTION).grade).toBe("Martial Path");
  });
});

describe("Heavenly Demon Palace — EXACT per-side ability ids (Few/Pack divergence is the control)", () => {
  for (const [unitId, expected] of Object.entries(EXPECTED_ABILITIES)) {
    it(`${unitId}: Few=[${expected.few.join(",")}] · Pack=[${expected.pack.join(",")}], all implemented`, () => {
      const unit = coreUnitDefinitions[unitId];
      expect(unit?.faction).toBe(FACTION);
      expect(unit.few!.abilities).toEqual(expected.few);
      expect(unit.pack!.abilities).toEqual(expected.pack);

      for (const id of [...expected.few, ...expected.pack]) {
        expect(unitAbilities[id]?.implementationStatus, id).toBe("implemented");
      }

      // abilityText hygiene: an empty-ability side carries NO abilityText.
      for (const side of [unit.few!, unit.pack!]) {
        if (side.abilities.length === 0) {
          expect(side.abilityText).toBeUndefined();
        } else {
          expect(side.abilityText && side.abilityText.length > 0).toBe(true);
        }
      }
    });
  }

  it("ships exactly TWO dedicated NEW engine arms, each implemented with its wired effect", () => {
    for (const [id, effect] of Object.entries(NEW_ABILITIES)) {
      const ability = unitAbilities[id];
      expect(ability?.implementationStatus, id).toBe("implemented");
      expect(ability?.effect).toEqual(effect);
    }
    // Both are actually carried on the roster (not orphaned).
    const rostered = new Set(
      coreFactionDefinitions[FACTION].units.flatMap((id) => [
        ...(coreUnitDefinitions[id].few?.abilities ?? []),
        ...(coreUnitDefinitions[id].pack?.abilities ?? [])
      ])
    );
    for (const id of Object.keys(NEW_ABILITIES)) {
      expect(rostered.has(id), `${id} referenced by a roster side`).toBe(true);
    }
  });

  it("demon_avatar Pack adds ongoing-immunity ON TOP of the reap the Few already has", () => {
    const few = coreUnitDefinitions["heavenly_demon.demon_avatar"].few!.abilities;
    const pack = coreUnitDefinitions["heavenly_demon.demon_avatar"].pack!.abilities;
    expect(few).toEqual(["heavenly-demon-reap"]);
    expect(pack).toContain("heavenly-demon-reap");
    expect(pack).toContain("titan-ignore-ongoing");
    expect(few).not.toContain("titan-ignore-ongoing");
  });
});

describe("Heavenly Demon Palace — balance envelopes & Few→Pack progression", () => {
  it("every side sits inside its tier envelope; Few→Pack never lowers a stat", () => {
    for (const unitId of coreFactionDefinitions[FACTION].units) {
      const unit = coreUnitDefinitions[unitId];
      const env = ENVELOPES[unit.tier as "bronze" | "silver" | "gold"];
      const few = unit.few!;
      const pack = unit.pack!;

      for (const side of [few, pack]) {
        for (const stat of ["attack", "defense", "health", "initiative"] as const) {
          expect(side[stat], `${unitId} ${stat}`).toBeGreaterThanOrEqual(env[stat][0]);
          expect(side[stat], `${unitId} ${stat}`).toBeLessThanOrEqual(env[stat][1]);
        }
        expect(side.cost.gold ?? 0, `${unitId} gold`).toBeGreaterThanOrEqual(env.gold[0]);
        expect(side.cost.gold ?? 0, `${unitId} gold`).toBeLessThanOrEqual(env.gold[1]);
        expect(side.cost.valuables ?? 0, `${unitId} valuables`).toBeGreaterThanOrEqual(env.valuables[0]);
        expect(side.cost.valuables ?? 0, `${unitId} valuables`).toBeLessThanOrEqual(env.valuables[1]);
      }

      for (const stat of ["attack", "defense", "health", "initiative"] as const) {
        expect(pack[stat], `${unitId} Few→Pack ${stat}`).toBeGreaterThanOrEqual(few[stat]);
      }
    }
  });

  it("ships exactly one RANGED unit (the Gu Witches)", () => {
    const ranged = coreFactionDefinitions[FACTION].units.filter((id) => coreUnitDefinitions[id].type === "ranged");
    expect(ranged).toEqual(["heavenly_demon.gu_witches"]);
  });
});

describe("Heavenly Demon Palace — module gate (xianxiaTowns), same flag as Azure Breeze", () => {
  it("is playable only with anime.enabled && anime.xianxiaTowns", () => {
    expect(isPlayableFaction(FACTION)).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: false, xianxiaTowns: true })).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: true, xianxiaTowns: false })).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: true, xianxiaTowns: true })).toBe(true);
    // CONTROL: the isekai flag never unlocks a xianxia town.
    expect(isPlayableFaction(FACTION, { enabled: true, isekaiTowns: true })).toBe(false);
  });
});

describe("Heavenly Demon Palace — heroes & specialties", () => {
  it("all five heroes carry implemented, own-portrait specialties I/IV/VI", () => {
    for (const [heroId, type] of [
      ["xuedao", "might"],
      ["guiyan", "might"],
      ["xuanming", "might"],
      ["yaoji", "magic"],
      ["molian", "magic"]
    ] as const) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero?.faction).toBe(FACTION);
      expect(hero?.type).toBe(type);
      expect(fileExists(hero!.portrait!, 50_000), `${heroId} portrait`).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const cardId = hero!.specialtyCardIds![level];
        expect(cardId).toBe(`specialty.${heroId}.${level}`);
        expect(cardLibrary[cardId]?.implementationStatus, cardId).toBe("implemented");
      }
    }
  });

  it("might specialists (Xuedao/Guiyan/Xuanming) double on units the faction actually FIELDS", () => {
    const factionUnitNames = coreFactionDefinitions[FACTION].units.map((id) => coreUnitDefinitions[id]?.name);
    for (const [heroId, unitName] of [
      ["xuedao", "Heavenly Demon Avatar"],
      ["guiyan", "Ghost King"],
      ["xuanming", "Bone Reavers"]
    ] as const) {
      const effect = cardLibrary[`specialty.${heroId}.1`]?.effect;
      expect(effect?.type).toBe("CHOOSE_ONE");
      const doubled =
        effect?.type === "CHOOSE_ONE" &&
        effect.options[0]?.effect?.type === "ADD_COMBAT_STAT" &&
        effect.options[0].effect.doubleForUnitName;
      expect(doubled, heroId).toBe(unitName);
      // Mutation control: the doubled unit is one the faction can recruit.
      expect(factionUnitNames, `${heroId} doubles a fielded unit`).toContain(doubled);
    }
  });

  it("Yaoji (Blood Renewal) & Molian (Corpse Suture) are faction-agnostic medic clones, no unit doubling", () => {
    for (const [heroId, name] of [
      ["yaoji", "Blood Renewal"],
      ["molian", "Corpse Suture"]
    ] as const) {
      for (const level of [1, 4, 6] as const) {
        const card = cardLibrary[`specialty.${heroId}.${level}`];
        expect(card?.name).toMatch(new RegExp(`^${name} `));
        expect(card?.implementationStatus).toBe("implemented");
        // A medic clone carries NO unit-doubling clause (the dead-clause trap) —
        // its whole serialized card never names a `doubleForUnitName`.
        expect(JSON.stringify(card), `${heroId} L${level}`).not.toContain("doubleForUnitName");
      }
    }
  });
});

describe("Heavenly Demon Palace — starting tile, town board & voices", () => {
  it("D-S1 seats the town on hex 0 with the Heavenly Demon faction", () => {
    const tile = allTileDefinitions["D-S1"];
    expect(tile).toBeDefined();
    expect(tile.fields[0]).toMatchObject({ location: "town", faction: FACTION });
    expect(fileExists(tile.assets!.tileImage!, 10_000)).toBe(true);
  });

  it("ships a 7-bar board spec whose panorama == townImage, one shared bar, bar art on disk", () => {
    const spec = townBoardSpecs[FACTION];
    const faction = coreFactionDefinitions[FACTION];
    expect(spec).toBeDefined();
    expect(spec.bars).toHaveLength(7);
    expect(spec.panoramaImage).toBe(faction.townImage);
    expect([...spec.bars.flat()].sort()).toEqual([...faction.buildings].sort());
    expect(spec.bars.filter((bar) => bar.length === 2)).toHaveLength(1);
    // Distinct bar ORDER from Azure Breeze's: the shared bar sits at slot 3.
    expect(spec.bars[2]).toHaveLength(2);
    expect(spec.bars.findIndex((bar) => bar.length === 2)).not.toBe(
      townBoardSpecs.azure_breeze.bars.findIndex((bar) => bar.length === 2)
    );

    expect(fileExists(spec.panoramaImage!, 10_000)).toBe(true);
    expect(fileExists(spec.fullImage!, 10_000)).toBe(true);
    for (const slice of spec.barTileImages!) {
      expect(slice).toMatch(/\/assets\/town-board\/heavenly-demon-bar-[1-7]\.webp$/);
      expect(fileExists(slice, 3000)).toBe(true);
    }
    // Town icon on the standard convention.
    expect(fileExists(townIconUrl(FACTION))).toBe(true);
  });

  it("every unit resolves a combat voice (the Gu Witches, ranged, resolve a shoot clip)", () => {
    for (const unitId of coreFactionDefinitions[FACTION].units) {
      expect(unitSoundKey(unitId, "attack"), unitId).toBeTruthy();
    }
    expect(unitSoundKey("heavenly_demon.gu_witches", "shoot")).toBeTruthy();
  });

  it("every unit's Few+Pack card art exists on disk", () => {
    for (const unitId of coreFactionDefinitions[FACTION].units) {
      const unit = coreUnitDefinitions[unitId];
      for (const side of [unit.few!, unit.pack!]) {
        expect(fileExists(side.cardImage!, 10_000), side.cardImage).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// BEHAVIOURAL spot-check: prove a roster arm actually EXECUTES in combat on a
// Heavenly Demon unit's REAL ability list (not pinned by data alone). Harness
// modelled on src/engine/after-attack-splash.test.ts.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
    }
  }
  return current;
}

function freshCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: Partial<CombatUnitState>): void {
  Object.assign(state.combat!.units[id], overrides);
}

describe("Heavenly Demon Palace — behavioural: the Blood Disciples Pack's real ability heals on a landed hit", () => {
  // The abilities come straight from the faction data: removing
  // `heavenly-demon-blood-siphon` from the Pack changes this array and the heal
  // vanishes → the test fails. So the roster arm is proven to EXECUTE.
  const packAbilities = coreUnitDefinitions["heavenly_demon.blood_disciples"].pack!.abilities;

  function attackerDamageAfter(abilities: string[], seed: string): number {
    const state = freshCombat(seed);
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities,
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 3,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 100, damage: 0, type: "ground" });
    place(state, "unit_p1_griffins", { position: 0, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 3, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_vampires", { position: 16, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    const attacker = state.combat!.units.unit_p1_marksmen;
    state.activePlayerId = attacker.controllerId as PlayerId;
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const after = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
    return after.combat!.units.unit_p1_marksmen.damage;
  }

  it("Blood Siphon heals the disciple 1 after it deals damage (CONTROL: no ability → no heal)", () => {
    expect(packAbilities).toContain("heavenly-demon-blood-siphon"); // rides the real data
    expect(attackerDamageAfter(packAbilities, "hd-blood-siphon-live")).toBe(2); // 3 → 2
    expect(attackerDamageAfter([], "hd-blood-siphon-live-control")).toBe(3); // no heal
  });
});
