import { describe, expect, it } from "vitest";

import { mediaFileInfo } from "@/lib/media-manifest";
import { cardLibrary } from "@/data/cards/library";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs } from "@/data/towns/boards";
import { commanderSoundKey } from "@/data/unit-sounds";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState } from "@/engine";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "@/engine/state";

/**
 * Hidden Leaf Village (`hidden_leaf`) — the third playable Anime Realms town,
 * gated on the SAME `anime.enabled && anime.isekaiTowns` flag as Fuyuki.
 *
 * This file pins the town like conflux-content / factory-content: the EXACT
 * per-side ability ids of all eight units (the Few/Pack divergence is the
 * mutation control), the module gate truth table, the commander wiring, the
 * six heroes' specialties, the starting tile, the board spec + bar art, and —
 * so the roster is not pinned by DATA alone — one BEHAVIOURAL combat spot-check
 * proving a real roster reuse arm (Susanoo's damage cap) executes in play.
 */

const FACTION = "hidden_leaf";

/** The COMPLETE, literal per-side wired ability list for every unit (CLAUDE.md §2). */
const EXPECTED_ABILITIES: Record<string, { few: string[]; pack: string[] }> = {
  "hidden_leaf.genin_squad": { few: [], pack: ["wog-attack-when-attacking-1"] },
  "hidden_leaf.medical_nin": { few: [], pack: ["enchanter-heal-or-buff"] },
  "hidden_leaf.anbu": { few: ["ignore-combat-penalties"], pack: ["ignore-combat-penalties", "teleport-move"] },
  "hidden_leaf.jonin": { few: ["ignore-combat-penalties"], pack: ["ignore-all-combat-penalties", "ignores-retaliation"] },
  "hidden_leaf.giant_toad": {
    few: ["commander-defense-token"],
    pack: ["commander-defense-token", "automaton-detonate-1"]
  },
  "hidden_leaf.jinchuriki": { few: ["jinchuriki-chakra-burst"], pack: ["magic-elemental-attack-all-enemies"] },
  "hidden_leaf.susanoo": { few: ["nix-damage-cap"], pack: ["nix-damage-cap", "titan-ignore-ongoing"] },
  "hidden_leaf.hokage_vanguard": { few: ["teleport-move"], pack: ["teleport-move", "commander-defense-token"] }
};

/** Stat/cost envelopes from the design brief (both sides must sit inside). */
const ENVELOPES: Record<
  "bronze" | "silver" | "gold",
  { attack: [number, number]; defense: [number, number]; health: [number, number]; initiative: [number, number]; gold: [number, number]; valuables: [number, number] }
> = {
  bronze: { attack: [1, 3], defense: [1, 2], health: [2, 3], initiative: [6, 9], gold: [2, 7], valuables: [0, 0] },
  silver: { attack: [3, 4], defense: [2, 3], health: [4, 6], initiative: [4, 7], gold: [8, 13], valuables: [0, 0] },
  gold: { attack: [5, 6], defense: [2, 4], health: [6, 8], initiative: [4, 8], gold: [13, 25], valuables: [1, 3] }
};

/** Published (media-manifest.json) AND heavier than a stub — run npm run media:publish. */
function fileExists(assetPath: string, minBytes = 1000): boolean {
  const info = mediaFileInfo(assetPath);
  return info !== undefined && info.bytes > minBytes;
}

describe("Hidden Leaf Village — registration & roster shape", () => {
  it("registers a complete faction: 8 units (3/2/3), 8 buildings, 6 heroes, leaf tile + commander", () => {
    const faction = coreFactionDefinitions[FACTION];
    expect(faction).toBeDefined();
    expect(faction.name).toBe("Hidden Leaf Village");
    expect(faction.startingTileId).toBe("L-S1");
    expect(faction.units).toHaveLength(8);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.heroes).toEqual(["naruto", "sasuke", "tsunade", "kakashi_hatake", "shikamaru_nara", "jiraiya"]);

    const byTier = { bronze: 0, silver: 0, gold: 0, azure: 0 };
    for (const id of faction.units) byTier[coreUnitDefinitions[id].tier] += 1;
    expect(byTier).toEqual({ bronze: 3, silver: 2, gold: 3, azure: 0 });

    // Every rostered unit is pinned in EXPECTED_ABILITIES (no unit escapes the pin).
    expect([...faction.units].sort()).toEqual(Object.keys(EXPECTED_ABILITIES).sort());
    expect(COMMANDER_SLUG_BY_FACTION[FACTION]).toBe("might_guy");
  });
});

describe("Hidden Leaf Village — EXACT per-side ability ids (Few/Pack divergence is the control)", () => {
  for (const [unitId, expected] of Object.entries(EXPECTED_ABILITIES)) {
    it(`${unitId}: Few=[${expected.few.join(",")}] · Pack=[${expected.pack.join(",")}], all implemented`, () => {
      const unit = coreUnitDefinitions[unitId];
      expect(unit?.faction).toBe(FACTION);
      expect(unit.few!.abilities).toEqual(expected.few);
      expect(unit.pack!.abilities).toEqual(expected.pack);

      // Every wired tag resolves to an IMPLEMENTED ability.
      for (const id of [...expected.few, ...expected.pack]) {
        expect(unitAbilities[id]?.implementationStatus, id).toBe("implemented");
      }

      // abilityText hygiene: an empty-ability side carries NO abilityText (a stub
      // would); a wired side always states what runs.
      for (const side of [unit.few!, unit.pack!]) {
        if (side.abilities.length === 0) {
          expect(side.abilityText).toBeUndefined();
        } else {
          expect(side.abilityText && side.abilityText.length > 0).toBe(true);
        }
      }
    });
  }

  it("Jinchuriki Few (Chakra Burst) and Pack (attack-all-enemies) are DIFFERENT arms — not a shared tag", () => {
    const few = coreUnitDefinitions["hidden_leaf.jinchuriki"].few!.abilities;
    const pack = coreUnitDefinitions["hidden_leaf.jinchuriki"].pack!.abilities;
    expect(few).toContain("jinchuriki-chakra-burst");
    expect(pack).not.toContain("jinchuriki-chakra-burst");
    expect(pack).toContain("magic-elemental-attack-all-enemies");
    expect(few).not.toContain("magic-elemental-attack-all-enemies");
  });

  it("Susanoo Pack adds ongoing-immunity ON TOP of the cap the Few already has", () => {
    const few = coreUnitDefinitions["hidden_leaf.susanoo"].few!.abilities;
    const pack = coreUnitDefinitions["hidden_leaf.susanoo"].pack!.abilities;
    expect(few).toEqual(["nix-damage-cap"]);
    expect(pack).toContain("nix-damage-cap");
    expect(pack).toContain("titan-ignore-ongoing");
    expect(few).not.toContain("titan-ignore-ongoing");
  });
});

describe("Hidden Leaf Village — balance envelopes & Few→Pack progression", () => {
  it("prices the three Gold choices by role while keeping Hokage Vanguard crystal-intensive", () => {
    expect(coreUnitDefinitions["hidden_leaf.jinchuriki"].few!.cost).toEqual({ gold: 15, valuables: 1 });
    expect(coreUnitDefinitions["hidden_leaf.jinchuriki"].pack!.cost).toEqual({ gold: 24, valuables: 2 });
    expect(coreUnitDefinitions["hidden_leaf.susanoo"].few!.cost).toEqual({ gold: 16, valuables: 1 });
    expect(coreUnitDefinitions["hidden_leaf.susanoo"].pack!.cost).toEqual({ gold: 25, valuables: 2 });
    expect(coreUnitDefinitions["hidden_leaf.hokage_vanguard"].few!.cost).toEqual({ gold: 13, valuables: 2 });
    expect(coreUnitDefinitions["hidden_leaf.hokage_vanguard"].pack!.cost).toEqual({ gold: 21, valuables: 3 });
  });

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
});

describe("Hidden Leaf Village — module gate (isekaiTowns), same flag as Fuyuki", () => {
  it("is playable only with anime.enabled && anime.isekaiTowns", () => {
    expect(isPlayableFaction(FACTION)).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: false, isekaiTowns: true })).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: true, isekaiTowns: true })).toBe(true);
    // CONTROL: the xianxia flag never unlocks an isekai town.
    expect(isPlayableFaction(FACTION, { enabled: true, xianxiaTowns: true })).toBe(false);
  });
});

describe("Hidden Leaf Village — commander (Might Guy)", () => {
  it("maps hidden_leaf → might_guy with an implemented cast + a resolving voice", () => {
    const commander = commanderDefinitions.might_guy;
    expect(commander).toBeDefined();
    expect(commander.faction).toBe("Hidden Leaf Village");
    expect(commander.original).toBe(true);
    expect(commander.cast.name).toBe("Body Flicker");
    expect(commander.cast.abilityId).toBe("commander-cast-shaman");
    expect(unitAbilities[commander.cast.abilityId]?.implementationStatus).toBe("implemented");
    expect(commander.cast.tierText).toHaveLength(3);
    expect(commander.specialty.id).toBe("superior-combat");
    expect(commander.specialty.name).toBe("Eight Gates");
    expect(fileExists(commander.cardImage)).toBe(true);
    // Every action resolves to a real clip (Monk voice).
    for (const action of ["attack", "move", "defend", "hurt", "death"] as const) {
      expect(commanderSoundKey("might_guy", action), action).toBeTruthy();
    }
  });
});

describe("Hidden Leaf Village — heroes & specialties", () => {
  it("all six heroes carry implemented, own-portrait specialties I/IV/VI", () => {
    for (const heroId of ["naruto", "sasuke", "tsunade", "kakashi_hatake", "shikamaru_nara", "jiraiya"] as const) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero?.faction).toBe(FACTION);
      expect(fileExists(hero!.portrait!)).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const cardId = hero!.specialtyCardIds![level];
        expect(cardId).toBe(`specialty.${heroId}.${level}`);
        expect(cardLibrary[cardId]?.implementationStatus, cardId).toBe("implemented");
      }
    }
  });

  it("Naruto is the ONE kept unit specialist; the other might heroes carry the redesigned sets", () => {
    // 2026-08-25 specialty redesign: Sasuke / Kakashi / Shikamaru / Jiraiya
    // dropped the generic unit-buff trio for distinct rethemedSpecialty clones
    // (mechanics pinned clone↔source in anime-specialty-redesign.test.ts).
    const factionUnitNames = coreFactionDefinitions[FACTION].units.map((id) => coreUnitDefinitions[id]?.name);
    const effect = cardLibrary["specialty.naruto.1"]?.effect;
    expect(effect?.type).toBe("CHOOSE_ONE");
    const doubled =
      effect?.type === "CHOOSE_ONE" &&
      effect.options[0]?.effect?.type === "ADD_COMBAT_STAT" &&
      effect.options[0].effect.doubleForUnitName;
    expect(doubled).toBe("Nine-Tails Chakra Avatar");
    // Mutation control: the doubled unit is one the faction can recruit.
    expect(factionUnitNames, "naruto doubles a fielded unit").toContain(doubled);
    // The redesigned four are no longer doubling unit buffs.
    for (const [heroId, newName] of [
      ["sasuke", "Chidori Stream"],
      ["kakashi_hatake", "Raikiri · Sharingan"],
      ["shikamaru_nara", "Shadow Possession"],
      ["jiraiya", "Toad Oil Flame Bomb"]
    ] as const) {
      for (const level of [1, 4, 6] as const) {
        const card = cardLibrary[`specialty.${heroId}.${level}`];
        expect(card?.name, `${heroId} ${level}`).toMatch(new RegExp(`^${newName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} `));
        expect(JSON.stringify(card?.effect), `${heroId} ${level} is not a unit-doubling buff`).not.toContain(
          "doubleForUnitName"
        );
      }
    }
  });

  it("Tsunade is the faction-agnostic medic clone (Hundred Healings), no unit doubling", () => {
    for (const level of [1, 4, 6] as const) {
      const card = cardLibrary[`specialty.tsunade.${level}`];
      expect(card?.name).toMatch(/^Hundred Healings /);
      expect(card?.implementationStatus).toBe("implemented");
    }
  });
});

describe("Hidden Leaf Village — starting tile & town board", () => {
  it("L-S1 seats the town on hex 0 with the Hidden Leaf faction", () => {
    const tile = allTileDefinitions["L-S1"];
    expect(tile).toBeDefined();
    expect(tile.fields[0]).toMatchObject({ location: "town", faction: FACTION });
    expect(fileExists(tile.assets!.tileImage!)).toBe(true);
  });

  it("ships a 7-bar board spec whose panorama == townImage, with bar art on disk", () => {
    const spec = townBoardSpecs[FACTION];
    const faction = coreFactionDefinitions[FACTION];
    expect(spec).toBeDefined();
    expect(spec.bars).toHaveLength(7);
    expect(spec.panoramaImage).toBe(faction.townImage);
    // The bars carry the 8 buildings, exactly one two-building bar.
    expect([...spec.bars.flat()].sort()).toEqual([...faction.buildings].sort());
    expect(spec.bars.filter((bar) => bar.length === 2)).toHaveLength(1);
    // Panorama + all seven bar slices exist on disk (real art) and
    // every bar file follows the dashed hidden-leaf naming.
    expect(fileExists(spec.panoramaImage!)).toBe(true);
    expect(fileExists(spec.fullImage!)).toBe(true);
    for (const slice of spec.barTileImages!) {
      expect(slice).toMatch(/\/assets\/town-board\/hidden-leaf-bar-[1-7]\.webp$/);
      expect(fileExists(slice)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// BEHAVIOURAL spot-check: prove a roster reuse arm actually EXECUTES in combat
// on a Hidden Leaf unit's real ability list (not pinned by data alone).
// Harness modelled on src/engine/after-attack-splash.test.ts (combat sandbox,
// scripted "0" attack dice so damage = attack − defense, clamped ≥ 0).
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

function meleeAttack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId as PlayerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

describe("Hidden Leaf Village — behavioural: Susanoo's real abilities cap a big hit", () => {
  // The abilities come straight from the faction data: removing `nix-damage-cap`
  // from Susanoo's Few side changes this array and the cap vanishes → the test
  // fails. So the roster reuse arm is proven to EXECUTE, not merely declared.
  const susanooFewAbilities = coreUnitDefinitions["hidden_leaf.susanoo"].few!.abilities;

  function bigHitDamage(defenderAbilities: string[], seed: string): number {
    const state = freshCombat(seed);
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 8,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: defenderAbilities,
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    // Park the other sandbox units far away so nothing interferes.
    place(state, "unit_p1_griffins", { position: 0, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    const after = meleeAttack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    return after.combat!.units.unit_p2_skeletons.damage;
  }

  it("Ethereal Armor caps an 8-damage hit at 4 (CONTROL: uncapped = 8)", () => {
    expect(susanooFewAbilities).toContain("nix-damage-cap"); // the arm under test rides the real data
    expect(bigHitDamage(susanooFewAbilities, "hidden-leaf-susanoo-cap")).toBe(4);
    expect(bigHitDamage([], "hidden-leaf-susanoo-cap-control")).toBe(8);
  });
});
