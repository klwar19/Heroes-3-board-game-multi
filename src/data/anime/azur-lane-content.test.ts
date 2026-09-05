import { describe, expect, it } from "vitest";

import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
import { LUCKY_E_SPECIALTY_SOURCES } from "@/data/cards/adventure";
import { cardLibrary } from "@/data/cards/library";
import { factionUiLexicon, factionVisualRegister } from "@/data/faction-theme";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs } from "@/data/towns/boards";
import { commanderSoundKey } from "@/data/unit-sounds";
import { unitAbilities } from "@/data/units/abilities";
import {
  AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE,
  AZUR_LANE_RANK_ABILITY_ICONS,
  UNIT_RANK_ABILITY_ICONS,
  hasUniqueRankSchedule,
  rankScheduleFor,
  unitRankAbilityIcon
} from "@/data/units/experience";
import type { RankSchedule } from "@/data/units/experience";
import { applyAction, createInitialGameState, getLegalActions, makeCombatUnitFromArmy } from "@/engine";
import { unitRankAbilityIds } from "@/engine/unit-experience";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "@/engine/state";

/**
 * Azur Lane Naval Base (`azur_lane`) — the FOURTH playable Anime Realms town,
 * gated on the SAME `anime.enabled && anime.isekaiTowns` flag as Fuyuki /
 * Hidden Leaf. Its NINE units are NAMED shipgirls (Laffey, Javelin, Honolulu,
 * Unicorn, Yukikaze, Ayanami, Prinz Eugen, I-19, Akagi — the last two of those
 * added by the 2026-09-05 roster expansion).
 *
 * This file pins the town like hidden-leaf-content / conflux-content: the EXACT
 * per-side ability ids of all seven units (the Few/Pack divergence is the
 * mutation control), the module gate truth table, the commander wiring, the
 * five heroes' specialties, the starting tile, the board spec + bar art, and —
 * so the roster is not pinned by DATA alone — one BEHAVIOURAL combat spot-check
 * proving a real roster reuse arm (Prinz Eugen's damage cap) executes in play.
 */

const FACTION = "azur_lane";

/** The COMPLETE, literal per-side wired ability list for every unit (CLAUDE.md §2). */
const EXPECTED_ABILITIES: Record<string, { few: string[]; pack: string[] }> = {
  "azur_lane.laffey": { few: [], pack: ["ignores-retaliation"] },
  "azur_lane.javelin": { few: [], pack: ["kansen-best-friends"] },
  "azur_lane.honolulu": {
    few: ["ignore-combat-penalties"],
    // 2026-07 upgrade: her Pack prints the town's bespoke around-target salvo
    // arm (kansen-full-barrage) instead of the generic flat +1.
    pack: ["ignore-combat-penalties", "kansen-full-barrage"]
  },
  "azur_lane.unicorn": {
    few: ["enchanter-heal-or-buff"],
    pack: ["enchanter-heal-or-buff", "unicorn-spell-ward-aura"]
  },
  "azur_lane.yukikaze": {
    few: ["commander-defense-token"],
    pack: ["commander-defense-token", "yukikaze-torpedo-run"]
  },
  // 2026-09-05 expansion: the charge destroyer. Few→Pack ADDS the
  // no-retaliation arm on top of Charge (the divergence control).
  "azur_lane.ayanami": {
    few: ["commander-charge"],
    pack: ["commander-charge", "ignores-retaliation"]
  },
  "azur_lane.prinz_eugen": { few: ["nix-damage-cap"], pack: ["nix-damage-cap", "unlimited-retaliation"] },
  "azur_lane.i19": {
    few: ["ignores-retaliation", "teleport-move"],
    pack: ["ignores-retaliation", "teleport-move", "i19-oxygen-torpedo-spread"]
  },
  // 2026-09-05 expansion: the second RANGED shipgirl. Few→Pack ADDS the Foxfire
  // fire shield on top of the around-target salvo (the divergence control).
  "azur_lane.akagi": {
    few: ["kansen-full-barrage"],
    pack: ["kansen-full-barrage", "wog-fire-shield-1"]
  }
};

/** Stat/cost envelopes for this roster (both sides must sit inside). */
const ENVELOPES: Record<
  "bronze" | "silver" | "gold",
  { attack: [number, number]; defense: [number, number]; health: [number, number]; initiative: [number, number]; gold: [number, number]; valuables: [number, number] }
> = {
  bronze: { attack: [1, 3], defense: [0, 2], health: [2, 4], initiative: [6, 12], gold: [2, 6], valuables: [0, 0] },
  // Ayanami (2026-09-05) widened the silver band: she is the glass-cannon
  // charge destroyer — 1 Defense and the roster's highest Initiative.
  silver: { attack: [3, 4], defense: [1, 3], health: [3, 5], initiative: [5, 11], gold: [7, 13], valuables: [0, 0] },
  gold: { attack: [5, 7], defense: [2, 3], health: [5, 8], initiative: [4, 7], gold: [14, 23], valuables: [1, 2] }
};

/** Published (media-manifest.json) AND heavier than a stub — run npm run media:publish. */
function fileExists(assetPath: string, minBytes = 1000): boolean {
  const info = mediaFileInfo(assetPath);
  return info !== undefined && info.bytes > minBytes;
}

describe("Azur Lane Naval Base — registration & roster shape", () => {
  it("registers a complete faction: 9 named shipgirls (3/3/3), 8 buildings, 5 heroes, P-S1 tile + commander", () => {
    const faction = coreFactionDefinitions[FACTION];
    expect(faction).toBeDefined();
    expect(faction.name).toBe("Azur Lane Naval Base");
    expect(faction.startingTileId).toBe("P-S1");
    expect(faction.units).toHaveLength(9);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.heroes).toEqual(["enterprise", "bismarck", "nagato", "akashi", "sirius"]);

    const byTier = { bronze: 0, silver: 0, gold: 0, azure: 0 };
    for (const id of faction.units) byTier[coreUnitDefinitions[id].tier] += 1;
    expect(byTier).toEqual({ bronze: 3, silver: 3, gold: 3, azure: 0 });

    // Every rostered unit is pinned in EXPECTED_ABILITIES (no unit escapes the pin).
    expect([...faction.units].sort()).toEqual(Object.keys(EXPECTED_ABILITIES).sort());
    expect(COMMANDER_SLUG_BY_FACTION[FACTION]).toBe("belfast");
  });
});

describe("Azur Lane Naval Base — EXACT per-side ability ids (Few/Pack divergence is the control)", () => {
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

  it("I-19 Pack ADDS the fixed Attack-4 extra-strike arm ON TOP of the Few's kit", () => {
    const few = coreUnitDefinitions["azur_lane.i19"].few!.abilities;
    const pack = coreUnitDefinitions["azur_lane.i19"].pack!.abilities;
    expect(few).toEqual(["ignores-retaliation", "teleport-move"]);
    expect(pack).toContain("i19-oxygen-torpedo-spread");
    expect(pack).toContain("ignores-retaliation");
    expect(pack).toContain("teleport-move");
    expect(few).not.toContain("i19-oxygen-torpedo-spread");
  });

  it("Prinz Eugen Pack adds unlimited-retaliation ON TOP of the cap the Few already has", () => {
    const few = coreUnitDefinitions["azur_lane.prinz_eugen"].few!.abilities;
    const pack = coreUnitDefinitions["azur_lane.prinz_eugen"].pack!.abilities;
    expect(few).toEqual(["nix-damage-cap"]);
    expect(pack).toContain("nix-damage-cap");
    expect(pack).toContain("unlimited-retaliation");
    expect(few).not.toContain("unlimited-retaliation");
  });
});

describe("Azur Lane Naval Base — balance envelopes & Few→Pack progression", () => {
  it("pins the requested shipgirl stat updates", () => {
    const laffey = coreUnitDefinitions["azur_lane.laffey"];
    expect(laffey.few).toMatchObject({ attack: 2, defense: 0, health: 3, initiative: 12 });
    expect(laffey.pack).toMatchObject({ attack: 3, defense: 0, health: 4, initiative: 12 });

    expect(coreUnitDefinitions["azur_lane.javelin"].pack).toMatchObject({ attack: 2 });
    expect(coreUnitDefinitions["azur_lane.prinz_eugen"].few).toMatchObject({ initiative: 5 });
    expect(coreUnitDefinitions["azur_lane.prinz_eugen"].pack).toMatchObject({ initiative: 6 });
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

describe("Azur Lane Naval Base — module gate (isekaiTowns), same flag as Fuyuki", () => {
  it("is playable only with anime.enabled && anime.isekaiTowns", () => {
    expect(isPlayableFaction(FACTION)).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: false, isekaiTowns: true })).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction(FACTION, { enabled: true, isekaiTowns: true })).toBe(true);
    // CONTROL: the xianxia flag never unlocks an isekai town.
    expect(isPlayableFaction(FACTION, { enabled: true, xianxiaTowns: true })).toBe(false);
  });
});

describe("Azur Lane Naval Base — commander (Belfast)", () => {
  it("maps azur_lane → belfast with the bespoke Royal Salvo cast + First Aid specialty + a resolving voice", () => {
    const commander = commanderDefinitions.belfast;
    expect(commander).toBeDefined();
    expect(commander.faction).toBe("Azur Lane Naval Base");
    expect(commander.original).toBe(true);
    // 2026-07 upgrade: the module's first OFFENSIVE command — enemy-targeted
    // effect damage (kind "enemy-damage"), behaviour pinned in
    // kansen-abilities.test.ts.
    expect(commander.cast.name).toBe("Royal Salvo");
    expect(commander.cast.abilityId).toBe("commander-cast-belfast");
    expect(commander.cast.targeting.side).toBe("enemy");
    expect(commander.cast.effect).toEqual({ kind: "enemy-damage", damageByPower: [1, 1, 2] });
    expect(unitAbilities[commander.cast.abilityId]?.implementationStatus).toBe("implemented");
    expect(commander.cast.tierText).toHaveLength(3);
    expect(commander.cast.icon).toContain("commander-royal-salvo.webp");
    expect(fileExists(commander.cast.icon)).toBe(true);
    // Belfast is the SECOND First-Aid commander (specialty-keyed window, not slug).
    expect(commander.specialty.id).toBe("first-aid");
    expect(commander.specialty.name).toBe("Impeccable Service");
    expect(fileExists(commander.cardImage)).toBe(true);
    // Every action resolves to a real clip (Sea Witch voice).
    for (const action of ["attack", "move", "defend", "hurt", "death"] as const) {
      expect(commanderSoundKey("belfast", action), action).toBeTruthy();
    }
  });
});

describe("Azur Lane Naval Base — heroes & specialties", () => {
  it("all five heroes carry implemented, own-portrait specialties I/IV/VI", () => {
    for (const heroId of ["enterprise", "bismarck", "nagato", "akashi", "sirius"] as const) {
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

  it("Enterprise carries the bespoke Lucky E dice specialty (proactive half + held die half)", () => {
    // The proactive halves are real CHOOSE_ONE stat options; the die half is the
    // engine's LUCKY_E_SPECIALTY_SOURCES contract (behaviour pinned in
    // kansen-abilities.test.ts). I = defense-only, IV/VI = attack+defense picks.
    for (const [level, optionCount] of [
      [1, 1],
      [4, 2],
      [6, 2]
    ] as const) {
      const card = cardLibrary[`specialty.enterprise.${level}`];
      expect(card?.name).toMatch(/^Lucky E /);
      expect(card?.implementationStatus).toBe("implemented");
      expect(card?.effect?.type).toBe("CHOOSE_ONE");
      if (card?.effect?.type === "CHOOSE_ONE") {
        expect(card.effect.options).toHaveLength(optionCount);
      }
    }
    expect(LUCKY_E_SPECIALTY_SOURCES.map((spec) => spec.cardId)).toEqual([
      "specialty.enterprise.1",
      "specialty.enterprise.4",
      "specialty.enterprise.6"
    ]);
    // I rerolls, IV sets the die, VI offers both halves.
    expect(LUCKY_E_SPECIALTY_SOURCES.map((spec) => [spec.reroll, spec.setDie])).toEqual([
      [true, false],
      [false, true],
      [true, true]
    ]);
  });

  it("Bismarck / Nagato / Akashi / Sirius each own a BESPOKE wired set — no generic clone survives", () => {
    // 2026-09-05 redesign. Each level carries the exact effect the engine runs;
    // the CONTROL is that NONE of them is the old generic shape any more (no
    // doubleForUnitName unit-specialist arm, no Gem/Rion medic HEAL_DAMAGE face).
    const expected: Record<string, { name: string; effects: readonly string[] }> = {
      bismarck: { name: "Concentrated Fire", effects: ["ADD_COMBAT_STAT", "ADD_COMBAT_STAT", "ADD_COMBAT_STAT"] },
      nagato: { name: "Big Seven Bombardment", effects: ["BOMBARDMENT_ATTACK", "BOMBARDMENT_ATTACK", "BOMBARDMENT_ATTACK"] },
      akashi: { name: "Repair Dock", effects: ["BANK_REINFORCEMENT_DISCOUNT", "BANK_REINFORCEMENT_DISCOUNT", "BANK_REINFORCEMENT_DISCOUNT"] },
      sirius: {
        name: "Royal Maid's Cover",
        effects: ["INTERCEPT_DECLARED_ATTACK", "INTERCEPT_DECLARED_ATTACK", "INTERCEPT_DECLARED_ATTACK"]
      }
    };
    for (const [heroId, spec] of Object.entries(expected)) {
      for (const [index, level] of ([1, 4, 6] as const).entries()) {
        const label = `specialty.${heroId}.${level}`;
        const card = cardLibrary[label];
        expect(card?.name?.startsWith(`${spec.name} `), label).toBe(true);
        expect(card?.implementationStatus, label).toBe("implemented");
        expect(card?.effect?.type, label).toBe(spec.effects[index]);
        // No leftover clone shapes.
        expect(JSON.stringify(card?.effect)).not.toContain("doubleForUnitName");
        expect(JSON.stringify(card?.effect)).not.toContain("HEAL_DAMAGE");
        // Every card carries a prose tag stating what runs (CLAUDE.md §2).
        expect(
          card?.tags?.some((tag) => /\s/u.test(tag) && tag.length > 40),
          `${label} tag`
        ).toBe(true);
      }
    }
  });

  it("the ladders escalate exactly as printed (I < IV < VI)", () => {
    const bismarckCaps = [1, 4, 6].map((level) => {
      const effect = cardLibrary[`specialty.bismarck.${level}`]?.effect;
      return effect?.type === "ADD_COMBAT_STAT" ? effect.maxAmount : undefined;
    });
    expect(bismarckCaps).toEqual([1, 2, 3]);
    const bismarckVi = cardLibrary["specialty.bismarck.6"]?.effect;
    expect(bismarckVi?.type === "ADD_COMBAT_STAT" && bismarckVi.ignoresRetaliation).toBe(true);
    const bismarckIv = cardLibrary["specialty.bismarck.4"]?.effect;
    expect(bismarckIv?.type === "ADD_COMBAT_STAT" && bismarckIv.ignoresRetaliation).toBeUndefined();

    const nagatoRanges = [1, 4, 6].map((level) => {
      const effect = cardLibrary[`specialty.nagato.${level}`]?.effect;
      return effect?.type === "BOMBARDMENT_ATTACK" ? effect.range : undefined;
    });
    expect(nagatoRanges).toEqual([2, undefined, undefined]);
    const nagatoVi = cardLibrary["specialty.nagato.6"]?.effect;
    expect(nagatoVi?.type === "BOMBARDMENT_ATTACK" && nagatoVi.attackBonus).toBe(1);

    const akashiDiscounts = [1, 4, 6].map((level) => {
      const effect = cardLibrary[`specialty.akashi.${level}`]?.effect;
      return effect?.type === "BANK_REINFORCEMENT_DISCOUNT" ? effect.flatGoldDiscount : undefined;
    });
    expect(akashiDiscounts).toEqual([2, 3, 4]);

    const siriusDefense = [1, 4, 6].map((level) => {
      const effect = cardLibrary[`specialty.sirius.${level}`]?.effect;
      return effect?.type === "INTERCEPT_DECLARED_ATTACK" ? effect.defenseBonus : undefined;
    });
    expect(siriusDefense).toEqual([1, 2, 2]);
    const siriusVi = cardLibrary["specialty.sirius.6"]?.effect;
    expect(siriusVi?.type === "INTERCEPT_DECLARED_ATTACK" && siriusVi.counterDamage).toBe(1);
    const siriusIv = cardLibrary["specialty.sirius.4"]?.effect;
    expect(siriusIv?.type === "INTERCEPT_DECLARED_ATTACK" && siriusIv.counterDamage).toBeUndefined();
  });
});

describe("Azur Lane Naval Base — starting tile & town board", () => {
  it("P-S1 seats the town on hex 0 with the Azur Lane faction", () => {
    const tile = allTileDefinitions["P-S1"];
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
    // Panorama + all seven bar slices exist on disk and every bar file follows
    // the dashed azur-lane naming.
    expect(fileExists(spec.panoramaImage!)).toBe(true);
    expect(fileExists(spec.fullImage!)).toBe(true);
    for (const slice of spec.barTileImages!) {
      expect(slice).toMatch(/\/assets\/town-board\/azur-lane-bar-[1-7]\.webp$/);
      expect(fileExists(slice)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// BEHAVIOURAL spot-check: prove a roster reuse arm actually EXECUTES in combat
// on an Azur Lane unit's real ability list (not pinned by data alone).
// Harness modelled on hidden-leaf-content.test.ts (combat sandbox, scripted "0"
// attack dice so damage = attack − defense, clamped ≥ 0).
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

describe("Azur Lane Naval Base — behavioural: Prinz Eugen's real abilities cap a big hit", () => {
  // The abilities come straight from the faction data: removing `nix-damage-cap`
  // from Prinz Eugen's Few side changes this array and the cap vanishes → the
  // test fails. So the roster reuse arm is proven to EXECUTE, not merely declared.
  const prinzEugenFewAbilities = coreUnitDefinitions["azur_lane.prinz_eugen"].few!.abilities;

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

  it("Unsinkable caps an 8-damage hit at 4 (CONTROL: uncapped = 8)", () => {
    expect(prinzEugenFewAbilities).toContain("nix-damage-cap"); // the arm under test rides the real data
    expect(bigHitDamage(prinzEugenFewAbilities, "azur-lane-prinz-cap")).toBe(4);
    expect(bigHitDamage([], "azur-lane-prinz-cap-control")).toBe(8);
  });

  it("I-19's stealth kit rides the real data: teleport-move is present and implemented", () => {
    const fewAbilities = coreUnitDefinitions["azur_lane.i19"].few!.abilities;
    expect(fewAbilities).toContain("teleport-move");
    expect(unitAbilities["teleport-move"]?.implementationStatus).toBe("implemented");
  });
});

/**
 * MUTATION CHECKS for the block below (each applied to src/data/anime/towns.ts,
 * run, reverted — every one killed 4 cases in this file):
 *  - drop `commander-charge` from Ayanami's FEW abilities;
 *  - drop `ignores-retaliation` from Ayanami's PACK abilities;
 *  - drop `kansen-full-barrage` from Akagi's FEW abilities;
 *  - drop `wog-fire-shield-1` from Akagi's PACK abilities.
 */
describe("Azur Lane Naval Base — behavioural: the 2026-09-05 ships run their REAL printed arms", () => {
  /**
   * Every ability array below is read straight out of the faction data, so
   * deleting an id from Ayanami's / Akagi's printed side changes the array and
   * the damage assertion fails: the reuse is proven to EXECUTE, not declared.
   *
   * Board: 4 columns × 5 rows. Attacker @9, target @10, target's other
   * neighbours @6 / @14; @19 is the far corner.
   */
  function board(state: GameState): void {
    for (const [id, position] of [
      ["unit_p1_marksmen", 9],
      ["unit_p2_skeletons", 10],
      ["unit_p2_vampires", 6],
      ["unit_p1_griffins", 14],
      ["unit_p1_crusaders", 0],
      ["unit_p2_dread_knights", 19]
    ] as const) {
      place(state, id, {
        position,
        abilities: [],
        attack: 0,
        defense: 0,
        maxHealth: 60,
        damage: 0,
        type: "ground"
      });
    }
  }

  it("Ayanami's Demon's Blade pays +1 only when she attacks AFTER MOVING", () => {
    const fewAbilities = coreUnitDefinitions["azur_lane.ayanami"].few!.abilities;
    expect(fewAbilities).toContain("commander-charge");

    function blow(seed: string, abilities: string[], move: boolean): number {
      const state = freshCombat(seed);
      board(state);
      // Ayanami starts one space further out (@13) when she is to charge in.
      place(state, "unit_p1_marksmen", {
        position: move ? 13 : 9,
        controllerId: "p1",
        abilities,
        attack: 3
      });
      place(state, "unit_p2_skeletons", { controllerId: "p2", maxHealth: 60 });
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      let current: GameState = state;
      if (move) {
        // A REAL step from @13 to @9 (the space beside the target), taken off
        // the engine's own offer list — that is what arms the Charge rider.
        const step = getLegalActions(state, "p1").find(
          (legal) =>
            legal.action.type === "MOVE_UNIT" &&
            legal.action.unitId === "unit_p1_marksmen" &&
            legal.action.destination === 9
        );
        expect(step, "a step from @13 to @9 must be offered").toBeTruthy();
        current = applyOk(state, step!.action);
        expect(current.combat!.units.unit_p1_marksmen.position, "she really moved").toBe(9);
      }
      const after = meleeAttack(current, "unit_p1_marksmen", "unit_p2_skeletons");
      return after.combat!.units.unit_p2_skeletons.damage;
    }

    expect(blow("ayanami-charge", fewAbilities, true), "attack 3 + the Charge rider").toBe(4);
    expect(blow("ayanami-standing", fewAbilities, false), "CONTROL: standing still pays nothing").toBe(3);
    expect(blow("ayanami-no-arm", [], true), "CONTROL: without the printed arm the charge pays nothing").toBe(3);
  });

  it("Ayanami's Pack Kamikaze Torpedoes really silence the Retaliation Attack", () => {
    const packAbilities = coreUnitDefinitions["azur_lane.ayanami"].pack!.abilities;
    expect(packAbilities).toContain("ignores-retaliation");

    function retaliationTaken(seed: string, abilities: string[]): number {
      const state = freshCombat(seed);
      board(state);
      place(state, "unit_p1_marksmen", { controllerId: "p1", abilities, attack: 2, defense: 0 });
      place(state, "unit_p2_skeletons", { controllerId: "p2", attack: 4, maxHealth: 60 });
      const after = meleeAttack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return after.combat!.units.unit_p1_marksmen.damage;
    }
    expect(retaliationTaken("ayanami-pack-noretal", packAbilities)).toBe(0);
    expect(
      retaliationTaken("ayanami-few-retal", coreUnitDefinitions["azur_lane.ayanami"].few!.abilities),
      "CONTROL: the Few side has no such arm and eats the counter-blow"
    ).toBe(4);
  });

  it("Akagi's Air Strike splashes 1 onto the enemies flanking her target, never her own ally", () => {
    const fewAbilities = coreUnitDefinitions["azur_lane.akagi"].few!.abilities;
    expect(fewAbilities).toContain("kansen-full-barrage");

    function splash(seed: string, abilities: string[]) {
      const state = freshCombat(seed);
      board(state);
      place(state, "unit_p1_marksmen", { controllerId: "p1", abilities, attack: 2, type: "ranged" });
      // Defense 50 soaks the attack itself, so every later read is pure splash.
      place(state, "unit_p2_skeletons", { controllerId: "p2", defense: 50, maxHealth: 60 });
      place(state, "unit_p2_vampires", { controllerId: "p2", maxHealth: 60 });
      place(state, "unit_p1_griffins", { controllerId: "p1", maxHealth: 60 });
      const after = meleeAttack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return {
        flankingEnemy: after.combat!.units.unit_p2_vampires.damage,
        flankingAlly: after.combat!.units.unit_p1_griffins.damage
      };
    }
    expect(splash("akagi-barrage", fewAbilities)).toEqual({ flankingEnemy: 1, flankingAlly: 0 });
    expect(splash("akagi-barrage-control", []), "CONTROL: no arm, no splash").toEqual({
      flankingEnemy: 0,
      flankingAlly: 0
    });
  });

  it("Akagi's Pack Foxfire burns an adjacent attacker for 1", () => {
    const packAbilities = coreUnitDefinitions["azur_lane.akagi"].pack!.abilities;
    expect(packAbilities).toContain("wog-fire-shield-1");

    function attackerDamage(seed: string, defenderAbilities: string[]): number {
      const state = freshCombat(seed);
      board(state);
      place(state, "unit_p2_skeletons", { controllerId: "p2", abilities: [], attack: 2, maxHealth: 60 });
      place(state, "unit_p1_marksmen", {
        controllerId: "p1",
        abilities: defenderAbilities,
        attack: 0,
        defense: 0,
        maxHealth: 60
      });
      const after = meleeAttack(state, "unit_p2_skeletons", "unit_p1_marksmen");
      return after.combat!.units.unit_p2_skeletons.damage;
    }
    expect(attackerDamage("akagi-foxfire", packAbilities)).toBe(1);
    expect(
      attackerDamage("akagi-foxfire-control", coreUnitDefinitions["azur_lane.akagi"].few!.abilities),
      "CONTROL: the Few side has no shield"
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Themed UI lexicon: Azur Lane wears bespoke NAVAL words over the shared "anime"
// VISUAL register (so its CSS theme class stays theme-anime). Names only — this
// pins the words + a fuyuki CONTROL proving the generic anime lexicon is the
// fall-through (removing the azur_lane special-case makes these assertions read
// Fuyuki's "Hero Grade"/"Servant roster" and fail).
// ---------------------------------------------------------------------------

describe("Azur Lane Naval Base — themed UI lexicon (naval words, anime visual register)", () => {
  it("gives azur_lane its own naval lexicon while KEEPING the anime visual register", () => {
    const lexicon = factionUiLexicon(FACTION);
    expect(lexicon.grade).toBe("Fleet Rating");
    expect(lexicon.equipment).toBe("Rigging & Gear");
    expect(lexicon.commanderEquipment).toBe("Flagship Regalia");
    expect(lexicon.army).toBe("Fleet roster");
    expect(lexicon.train).toBe("Tactical drill");
    expect(lexicon.experienceBoard).toBe("Fleet Training Board");
    // The VISUAL register is unchanged — the CSS theme class stays theme-anime.
    expect(lexicon.register).toBe("anime");
    expect(factionVisualRegister(FACTION)).toBe("anime");
  });

  it("CONTROL: fuyuki (same anime register) keeps the GENERIC anime lexicon", () => {
    const fuyuki = factionUiLexicon("fuyuki");
    expect(fuyuki.register).toBe("anime");
    expect(fuyuki.grade).toBe("Hero Grade");
    expect(fuyuki.army).toBe("Servant roster");
    expect(fuyuki.equipment).toBe("Mystic Loadout");
    // Proves the two anime-register factions genuinely diverge in words.
    expect(fuyuki.grade).not.toBe(factionUiLexicon(FACTION).grade);
  });
});

// ---------------------------------------------------------------------------
// Fleet veterancy — the Unit Experience REDESIGN (26f6e37f / 2d2da234).
// A rank is EITHER an explicit per-unit override OR the flavour generator's
// roll; there is no bespoke per-unit schedule table any more (the old
// hand-authored one is deleted — see experience-rank-abilities.ts). None of the
// seven shipgirls owns an override, so all seven are generator-served, and
// `docs/unit-experience-balance-sheet.md` is the design authority for what
// follows. The pins below are the EXACT live ladder, rank by rank.
// ---------------------------------------------------------------------------

type RankPin = "stats" | readonly string[];

/**
 * The EXACT resolved schedule per shipgirl: per rank, either "stats" or the
 * ability CHOICE ARRAY the resolver offers (offer order matters — the first
 * choice the unit does not already answer is what it gains). This table is the
 * mutation control: change any schedule and the deep-equal below fails.
 */
const EXPECTED_SCHEDULES: Record<string, readonly [RankPin, RankPin, RankPin, RankPin]> = {
  "azur_lane.laffey": [
    ["veteran-retaliation-fury"],
    ["veteran-guarded-stance", "commander-charge", "wog-no-negative-attack-roll", "veteran-attack-when-attacking"],
    "stats",
    ["commander-max-damage", "veteran-defense-pierce", "veteran-rebirth", "unlimited-retaliation"]
  ],
  "azur_lane.javelin": [
    "stats",
    ["wog-no-negative-attack-roll", "veteran-attack-when-attacking", "veteran-guarded-stance", "commander-charge"],
    "stats",
    ["veteran-rebirth", "unlimited-retaliation", "commander-max-damage", "veteran-defense-pierce"]
  ],
  "azur_lane.honolulu": [
    ["veteran-attack-when-attacking"],
    ["attack-roll-advantage-passive", "ranged-extra-shot-on-low-roll", "veteran-steady-aim", "bulwark-air-shield"],
    ["veteran-defense-pierce", "ignore-all-combat-penalties", "veteran-low-roll-insight", "ranged-extra-shot-on-low-roll"],
    ["veteran-low-roll-insight", "veteran-spell-sunder", "ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ],
  "azur_lane.unicorn": [
    ["veteran-attack-when-attacking"],
    ["commander-charge", "veteran-retaliation-fury", "veteran-attack-when-attacking", "wog-no-negative-attack-roll"],
    "stats",
    ["commander-max-damage", "ignores-retaliation", "veteran-speed-hunter", "veteran-double-attack-low-roll"]
  ],
  "azur_lane.yukikaze": [
    "stats",
    ["wog-no-negative-attack-roll", "veteran-attack-when-attacking", "veteran-guarded-stance", "commander-charge"],
    "stats",
    ["veteran-rebirth", "unlimited-retaliation", "commander-max-damage", "veteran-defense-pierce"]
  ],
  "azur_lane.prinz_eugen": [
    ["veteran-guarded-stance"],
    ["commander-charge", "wog-no-negative-attack-roll", "veteran-attack-when-attacking", "veteran-guarded-stance"],
    "stats",
    ["veteran-defense-pierce", "veteran-rebirth", "unlimited-retaliation", "commander-max-damage"]
  ],
  "azur_lane.i19": [
    "stats",
    ["veteran-guarded-stance", "commander-charge", "wog-no-negative-attack-roll", "veteran-attack-when-attacking"],
    "stats",
    ["commander-max-damage", "veteran-defense-pierce", "veteran-rebirth", "unlimited-retaliation"]
  ],
  "azur_lane.ayanami": [
    ["veteran-guarded-stance"],
    ["commander-charge", "wog-no-negative-attack-roll", "veteran-attack-when-attacking", "veteran-guarded-stance"],
    "stats",
    ["veteran-defense-pierce", "veteran-rebirth", "unlimited-retaliation", "commander-max-damage"]
  ],
  "azur_lane.akagi": [
    "stats",
    ["ranged-extra-shot-on-low-roll", "veteran-steady-aim", "bulwark-air-shield", "attack-roll-advantage-passive"],
    "stats",
    ["veteran-spell-sunder", "ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll", "veteran-low-roll-insight"]
  ]
};

/** The ability each ability-rank actually GRANTS (after the no-op dedupe). */
const EXPECTED_GRANTS: Record<string, readonly string[]> = {
  "azur_lane.laffey": ["veteran-retaliation-fury", "veteran-guarded-stance", "commander-max-damage"],
  "azur_lane.javelin": ["wog-no-negative-attack-roll", "veteran-rebirth"],
  "azur_lane.honolulu": [
    "veteran-attack-when-attacking",
    "attack-roll-advantage-passive",
    "veteran-defense-pierce",
    "veteran-low-roll-insight"
  ],
  "azur_lane.unicorn": ["veteran-attack-when-attacking", "commander-charge", "commander-max-damage"],
  "azur_lane.yukikaze": ["wog-no-negative-attack-roll", "veteran-rebirth"],
  "azur_lane.prinz_eugen": ["veteran-guarded-stance", "commander-charge", "veteran-defense-pierce"],
  "azur_lane.i19": ["veteran-guarded-stance", "commander-max-damage"],
  // Ayanami PRINTS commander-charge, so the R2 rung skips its first choice and
  // pays Sure Shot instead — the no-wasted-rank invariant in action.
  "azur_lane.ayanami": ["veteran-guarded-stance", "wog-no-negative-attack-roll", "veteran-defense-pierce"],
  "azur_lane.akagi": ["ranged-extra-shot-on-low-roll", "veteran-spell-sunder"]
};

/** Every distinct ability id the nine schedules can offer. */
function allExpectedChoiceIds(): string[] {
  const ids = new Set<string>();
  for (const ranks of Object.values(EXPECTED_SCHEDULES)) {
    for (const pin of ranks) if (pin !== "stats") for (const id of pin) ids.add(id);
  }
  return [...ids];
}

/** The resolved schedule as the same [RankPin × 4] shape. */
function rankPinsOf(schedule: RankSchedule): RankPin[] {
  return [1, 2, 3, 4].map((rank) => {
    const step = schedule[rank as 1 | 2 | 3 | 4];
    return step.kind === "stats" ? "stats" : [...step.choices];
  });
}

describe("Azur Lane Naval Base — Fleet veterancy: resolved rank schedules", () => {
  it("all nine are GENERATOR-served: no explicit override, and every rank pays something", () => {
    for (const unitId of coreFactionDefinitions[FACTION].units) {
      // The redesign gives an override only to the handful of signature units;
      // an Azur Lane one would have to be added deliberately.
      expect(hasUniqueRankSchedule(unitId), unitId).toBe(false);
      const schedule = rankScheduleFor(unitId);
      for (const rank of [1, 2, 3, 4] as const) {
        const step = schedule[rank];
        if (step.kind !== "stats") expect(step.choices.length, `${unitId} R${rank}`).toBeGreaterThan(0);
      }
    }
  });

  it("SIGNATURE pins: the exact resolved ladder per ship (fails if any schedule moves)", () => {
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      expect(rankPinsOf(rankScheduleFor(unitId)), unitId).toEqual(
        expected.map((pin) => (pin === "stats" ? "stats" : [...pin]))
      );
      // …and what the ship actually WALKS AWAY WITH at max rank.
      expect(unitRankAbilityIds(unitId, 4), unitId).toEqual([...EXPECTED_GRANTS[unitId]!]);
    }
    // Spot the headline picks explicitly so the intent is legible.
    expect(unitRankAbilityIds("azur_lane.honolulu", 2)).toContain("attack-roll-advantage-passive");
    expect(unitRankAbilityIds("azur_lane.prinz_eugen", 1)).toContain("veteran-guarded-stance");
  });

  it("HYGIENE (azur_lane-scoped): every choice implemented, non-Stacked; a GRANT is never already printed", () => {
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      const unit = coreUnitDefinitions[unitId];
      const printed = new Set<string>([...unit.few!.abilities, ...unit.pack!.abilities]);
      for (const pin of expected) {
        if (pin === "stats") continue;
        for (const choiceId of pin) {
          const ability = unitAbilities[choiceId];
          expect(ability, `${unitId} → ${choiceId}`).toBeTruthy();
          expect(ability.implementationStatus, `${unitId} → ${choiceId}`).toBe("implemented");
          expect(ability.requiresStacked, `${unitId} → ${choiceId}`).not.toBe(true);
        }
      }
      // No-wasted-rank invariant: the resolver skips a choice the unit already
      // prints, so no GRANTED id may be printed on either side…
      for (const grantedId of EXPECTED_GRANTS[unitId]!) {
        expect(printed.has(grantedId), `${unitId} prints ${grantedId} (would waste the rank)`).toBe(false);
      }
      // …and every ability RANK pays exactly one ability (never a dup collapse).
      const abilityRanks = expected.filter((pin) => pin !== "stats").length;
      expect(unitRankAbilityIds(unitId, 4), unitId).toHaveLength(abilityRanks);
    }
  });

  it("ART: every choice id has an EXPLICIT icon entry resolving to a published file", () => {
    for (const choiceId of allExpectedChoiceIds()) {
      // Prefer an explicit mapping for all (the fallback exists too, but an
      // explicit entry is the pinned contract).
      expect(UNIT_RANK_ABILITY_ICONS[choiceId], `${choiceId} needs an explicit icon`).toBeTruthy();
      const icon = unitRankAbilityIcon(choiceId);
      expect(icon.startsWith("/assets/"), choiceId).toBe(true);
      expect(
        hasMediaFile(icon),
        `${choiceId} → ${icon} is not published — run npm run media:publish`
      ).toBe(true);
    }
  });

  it("ART: the XP board uses a ship-specific HD icon for every Azur Lane unit", () => {
    for (const unitId of Object.keys(EXPECTED_SCHEDULES)) {
      const icon = AZUR_LANE_RANK_ABILITY_ICONS[unitId];
      expect(icon, `${unitId} needs a ship-specific XP icon`).toBeTruthy();
      expect(unitRankAbilityIcon("commander-max-damage", unitId)).toBe(icon);
      expect(
        hasMediaFile(icon),
        `${unitId} XP icon ${icon} is not published — run npm run media:publish`
      ).toBe(true);
    }
    // The optional unit id keeps the generic renderer unchanged for non-Azur
    // units and for normal card ability presentations.
    expect(unitRankAbilityIcon("commander-max-damage")).toBe(UNIT_RANK_ABILITY_ICONS["commander-max-damage"]);
  });

  it("ART: every Azur Lane XP choice resolves to a published ship emblem", () => {
    // The by-choice map is the fine-grained override; anything it does not name
    // still falls back to the SHIP's own emblem, never to the generic card art.
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      const shipIcon = AZUR_LANE_RANK_ABILITY_ICONS[unitId]!;
      for (const pin of expected) {
        if (pin === "stats") continue;
        for (const choiceId of pin) {
          const key = `${unitId}:${choiceId}`;
          const icon = AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE[key] ?? shipIcon;
          expect(unitRankAbilityIcon(choiceId, unitId), key).toBe(icon);
          expect(
            hasMediaFile(icon),
            `${key} → ${icon} is not published — run npm run media:publish`
          ).toBe(true);
        }
      }
    }
    // The explicit by-choice entries that DO exist must still win over the ship
    // default — otherwise the fine-grained map is dead weight.
    for (const [key, icon] of Object.entries(AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE)) {
      const [unitId, choiceId] = key.split(":") as [string, string];
      expect(unitRankAbilityIcon(choiceId, unitId), key).toBe(icon);
    }

    // Shared engine abilities still resolve to different ship art on the XP
    // board; the optional unit id is what prevents a generic card icon leak.
    expect(
      unitRankAbilityIcon("commander-max-damage", "azur_lane.javelin")
    ).not.toBe(unitRankAbilityIcon("commander-max-damage", "azur_lane.i19"));
  });

  // BEHAVIOURAL (effect-level): Yukikaze's schedule actually FOLDS in combat —
  // a stats rank moves a real stat and an ability rank grants the resolved id.
  // Fails if withRankAbilities / the schedule wiring is removed, OR if the
  // schedule moves (r2 would carry a different id).
  it("Yukikaze folds in combat: R1 stats (+1 HP), R2 grants Sure Shot — below-threshold CONTROL grants neither the ability nor the stat", () => {
    const build = (experience?: number): CombatUnitState =>
      makeCombatUnitFromArmy(
        { id: "yk_army", unitDefId: "azur_lane.yukikaze", side: "few", ...(experience ? { experience } : {}) },
        "p1",
        "unit_p1_yk",
        0,
        "legacy"
      )!;

    // silver thresholds 6/10/15/20 → R1 at 6 XP (stats), R2 at 10 XP (ability slot1).
    const plain = build();
    const r1 = build(6);
    const r2 = build(10);

    expect(r1.unitRank).toBe(1);
    expect(r2.unitRank).toBe(2);

    // Stats-rank fold: Yukikaze's per-unit ladder opens with +1 Health — an
    // OBSERVABLE stat delta (the flat silver tier table is no longer read).
    expect(plain.maxHealth).toBe(coreUnitDefinitions["azur_lane.yukikaze"].few!.health);
    expect(r1.maxHealth).toBe(plain.maxHealth + 1);
    expect(r2.maxHealth).toBe(plain.maxHealth + 1); // R2 is an ability rank → no further stat step
    expect(r1.defense).toBe(plain.defense);

    // Ability-rank grant: R2 carries the resolved first choice (Sure Shot).
    expect(r2.abilities).toContain("wog-no-negative-attack-roll");

    // CONTROLs: below the R2 ability threshold there is NO grant; the plain card
    // (no XP) carries neither the grant nor the stat bump (base stats).
    expect(r1.abilities).not.toContain("wog-no-negative-attack-roll");
    expect(plain.abilities).not.toContain("wog-no-negative-attack-roll");
    expect(plain.unitRank ?? 0).toBe(0);
  });
});
