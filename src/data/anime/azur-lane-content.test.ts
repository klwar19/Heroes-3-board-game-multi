import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  UNIT_RANK_ABILITY_ICONS,
  UNIT_RANK_SCHEDULES,
  hasUniqueRankSchedule,
  rankScheduleFor,
  scheduleTemplateId,
  unitRankAbilityIcon
} from "@/data/units/experience";
import type { RankSchedule } from "@/data/units/experience";
import { applyAction, createInitialGameState, makeCombatUnitFromArmy } from "@/engine";
import { unitRankAbilityIds } from "@/engine/unit-experience";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "@/engine/state";

/**
 * Azur Lane Naval Base (`azur_lane`) — the FOURTH playable Anime Realms town,
 * gated on the SAME `anime.enabled && anime.isekaiTowns` flag as Fuyuki /
 * Hidden Leaf. Its seven units are NAMED shipgirls (Laffey, Javelin, Honolulu,
 * Unicorn, Yukikaze, Prinz Eugen, I-19).
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
  "azur_lane.javelin": { few: [], pack: ["commander-charge"] },
  "azur_lane.honolulu": {
    few: ["ignore-combat-penalties"],
    pack: ["ignore-combat-penalties", "wog-attack-when-attacking-1"]
  },
  "azur_lane.unicorn": {
    few: ["enchanter-heal-or-buff"],
    pack: ["enchanter-heal-or-buff", "unicorn-spell-ward-aura"]
  },
  "azur_lane.yukikaze": {
    few: ["commander-defense-token"],
    pack: ["commander-defense-token", "ignores-retaliation"]
  },
  "azur_lane.prinz_eugen": { few: ["nix-damage-cap"], pack: ["nix-damage-cap", "unlimited-retaliation"] },
  "azur_lane.i19": {
    few: ["ignores-retaliation", "teleport-move"],
    pack: ["ignores-retaliation", "teleport-move", "sandworm-strike-again"]
  }
};

/** Stat/cost envelopes for this roster (both sides must sit inside). */
const ENVELOPES: Record<
  "bronze" | "silver" | "gold",
  { attack: [number, number]; defense: [number, number]; health: [number, number]; initiative: [number, number]; gold: [number, number]; valuables: [number, number] }
> = {
  bronze: { attack: [1, 3], defense: [1, 2], health: [2, 3], initiative: [6, 9], gold: [2, 6], valuables: [0, 0] },
  silver: { attack: [3, 4], defense: [2, 3], health: [3, 5], initiative: [5, 8], gold: [7, 13], valuables: [0, 0] },
  gold: { attack: [5, 7], defense: [2, 3], health: [5, 8], initiative: [4, 7], gold: [14, 23], valuables: [1, 2] }
};

function fileExists(assetPath: string, minBytes = 1000): boolean {
  const file = join(process.cwd(), "public", assetPath.replace(/^\//, ""));
  return existsSync(file) && statSync(file).size > minBytes;
}

describe("Azur Lane Naval Base — registration & roster shape", () => {
  it("registers a complete faction: 7 named shipgirls (3/2/2), 8 buildings, 5 heroes, P-S1 tile + commander", () => {
    const faction = coreFactionDefinitions[FACTION];
    expect(faction).toBeDefined();
    expect(faction.name).toBe("Azur Lane Naval Base");
    expect(faction.startingTileId).toBe("P-S1");
    expect(faction.units).toHaveLength(7);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.heroes).toEqual(["enterprise", "bismarck", "nagato", "akashi", "sirius"]);

    const byTier = { bronze: 0, silver: 0, gold: 0, azure: 0 };
    for (const id of faction.units) byTier[coreUnitDefinitions[id].tier] += 1;
    expect(byTier).toEqual({ bronze: 3, silver: 2, gold: 2, azure: 0 });

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

  it("I-19 Pack ADDS the extra-strike arm (sandworm-strike-again) ON TOP of the Few's kit", () => {
    const few = coreUnitDefinitions["azur_lane.i19"].few!.abilities;
    const pack = coreUnitDefinitions["azur_lane.i19"].pack!.abilities;
    expect(few).toEqual(["ignores-retaliation", "teleport-move"]);
    expect(pack).toContain("sandworm-strike-again");
    expect(pack).toContain("ignores-retaliation");
    expect(pack).toContain("teleport-move");
    expect(few).not.toContain("sandworm-strike-again");
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
  it("maps azur_lane → belfast with an implemented cast + First Aid specialty + a resolving voice", () => {
    const commander = commanderDefinitions.belfast;
    expect(commander).toBeDefined();
    expect(commander.faction).toBe("Azur Lane Naval Base");
    expect(commander.original).toBe(true);
    expect(commander.cast.name).toBe("Fire Support");
    expect(commander.cast.abilityId).toBe("commander-cast-temple_guardian");
    expect(unitAbilities[commander.cast.abilityId]?.implementationStatus).toBe("implemented");
    expect(commander.cast.tierText).toHaveLength(3);
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

  it("might specialists (Enterprise/Bismarck/Nagato) double on shipgirls the faction actually FIELDS", () => {
    const factionUnitNames = coreFactionDefinitions[FACTION].units.map((id) => coreUnitDefinitions[id]?.name);
    for (const [heroId, unitName] of [
      ["enterprise", "Laffey"],
      ["bismarck", "Prinz Eugen"],
      ["nagato", "Yukikaze"]
    ] as const) {
      const effect = cardLibrary[`specialty.${heroId}.1`]?.effect;
      expect(effect?.type).toBe("CHOOSE_ONE");
      const doubled =
        effect?.type === "CHOOSE_ONE" &&
        effect.options[0]?.effect?.type === "ADD_COMBAT_STAT" &&
        effect.options[0].effect.doubleForUnitName;
      expect(doubled, heroId).toBe(unitName);
      // Mutation control: the doubled shipgirl is one the faction can recruit.
      expect(factionUnitNames, `${heroId} doubles a fielded unit`).toContain(doubled);
    }
  });

  it("Akashi (Emergency Repairs) & Sirius (Flawless Service) are faction-agnostic medic clones, no unit doubling", () => {
    for (const [heroId, name] of [
      ["akashi", "Emergency Repairs"],
      ["sirius", "Flawless Service"]
    ] as const) {
      for (const level of [1, 4, 6] as const) {
        const card = cardLibrary[`specialty.${heroId}.${level}`];
        expect(card?.name).toMatch(new RegExp(`^${name} `));
        expect(card?.implementationStatus).toBe("implemented");
      }
    }
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

// ---------------------------------------------------------------------------
// Themed UI lexicon: Azur Lane wears bespoke NAVAL words over the shared "anime"
// VISUAL register (so its CSS theme class stays theme-anime). Names only — this
// pins the words + a fuyuki CONTROL proving the generic anime lexicon is the
// fall-through (removing the azur_lane special-case makes these assertions read
// Fuyuki's "Spirit Rank"/"Servant roster" and fail).
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
    expect(fuyuki.grade).toBe("Spirit Rank");
    expect(fuyuki.army).toBe("Servant roster");
    expect(fuyuki.equipment).toBe("Mystic Loadout");
    // Proves the two anime-register factions genuinely diverge in words.
    expect(fuyuki.grade).not.toBe(factionUiLexicon(FACTION).grade);
  });
});

// ---------------------------------------------------------------------------
// Fleet veterancy — bespoke rank schedules (Unit Experience system).
// Each shipgirl's rank-ability CHOICES are keyed to her lore (signature FIRST,
// safer alternative second). Two picks diverge from the raw design intent and
// the divergence is DELIBERATE + documented at the schedule: DOUBLE_ATTACK
// (double-attack / double-attack-low-roll) only fires on a RANGED attack
// (engine reducer gates it on attackKind === "ranged"), so it is INERT on the
// melee `ground` shipgirls — javelin takes commander-max-damage (a functional
// salvo) and i19 takes wog-no-negative-attack-roll instead of that dead arm.
// ---------------------------------------------------------------------------

/**
 * The EXACT ability-rank choice arrays per shipgirl (signature id FIRST). This
 * table is the mutation control: revert any schedule to a generic filler and the
 * deep-equal below fails. `template` is the pinned shape (bronze=standard 1
 * ability, silver/gold=strong 2).
 */
const EXPECTED_SCHEDULES: Record<
  string,
  { template: "standard" | "strong"; slots: readonly (readonly string[])[] }
> = {
  "azur_lane.laffey": { template: "standard", slots: [["sandworm-strike-again", "wog-no-negative-attack-roll"]] },
  "azur_lane.javelin": { template: "standard", slots: [["commander-max-damage", "bulwark-air-shield"]] },
  "azur_lane.honolulu": { template: "standard", slots: [["ranged-extra-shot-on-low-roll", "bulwark-air-shield"]] },
  "azur_lane.unicorn": {
    template: "strong",
    slots: [["wraith-heal-1", "commander-defense-token"], ["reduce-spell-damage-1", "bulwark-air-shield"]]
  },
  "azur_lane.yukikaze": {
    template: "strong",
    slots: [["attack-roll-advantage-passive", "wog-no-negative-attack-roll"], ["commander-charge", "commander-max-damage"]]
  },
  "azur_lane.prinz_eugen": {
    template: "strong",
    slots: [["zombie-resilience", "reduce-spell-damage-1"], ["wog-fire-shield-1", "ignore-paralysis"]]
  },
  "azur_lane.i19": {
    template: "strong",
    slots: [["commander-max-damage", "commander-charge"], ["wog-nightmare-fear", "wog-no-negative-attack-roll"]]
  }
};

/** Pull the ability steps' choice arrays out of a schedule, in rank order. */
function abilityChoicesOf(schedule: RankSchedule): string[][] {
  const slots: string[][] = [];
  for (const rank of [1, 2, 3, 4] as const) {
    const step = schedule[rank];
    if (step.kind === "ability") slots.push([...step.choices]);
  }
  return slots;
}

describe("Azur Lane Naval Base — Fleet veterancy: bespoke rank schedules", () => {
  it("all seven ship a UNIQUE schedule; bronzes are 'standard', silver/gold 'strong'", () => {
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      expect(hasUniqueRankSchedule(unitId), unitId).toBe(true);
      expect(scheduleTemplateId(UNIT_RANK_SCHEDULES[unitId]!), unitId).toBe(expected.template);
    }
    // Tier ↔ template: the three bronze bodies are 'standard', the two silver +
    // two gold are 'strong' (matches the faction-peer / "gold ≤ bronze count" ethos).
    for (const unitId of coreFactionDefinitions[FACTION].units) {
      const tier = coreUnitDefinitions[unitId].tier;
      expect(scheduleTemplateId(rankScheduleFor(unitId)), `${unitId} (${tier})`).toBe(
        tier === "bronze" ? "standard" : "strong"
      );
    }
  });

  it("SIGNATURE pins: the exact lore-keyed choice arrays (fails if a schedule reverts to fillers)", () => {
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      expect(abilityChoicesOf(rankScheduleFor(unitId)), unitId).toEqual(
        expected.slots.map((slot) => [...slot])
      );
    }
    // Spot the two headline signatures explicitly so the intent is legible.
    expect(abilityChoicesOf(rankScheduleFor("azur_lane.yukikaze"))[0]).toContain(
      "attack-roll-advantage-passive"
    );
    expect(abilityChoicesOf(rankScheduleFor("azur_lane.laffey"))[0]).toContain("sandworm-strike-again");
    expect(abilityChoicesOf(rankScheduleFor("azur_lane.unicorn"))[0]).toContain("wraith-heal-1");
  });

  it("HYGIENE (azur_lane-scoped): every choice implemented, non-Stacked, NOT printed on either side; no wasted rank", () => {
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      const unit = coreUnitDefinitions[unitId];
      const printed = new Set<string>([...unit.few!.abilities, ...unit.pack!.abilities]);
      for (const slot of expected.slots) {
        for (const choiceId of slot) {
          const ability = unitAbilities[choiceId];
          expect(ability, `${unitId} → ${choiceId}`).toBeTruthy();
          expect(ability.implementationStatus, `${unitId} → ${choiceId}`).toBe("implemented");
          expect(ability.requiresStacked, `${unitId} → ${choiceId}`).not.toBe(true);
          // No-wasted-rank invariant: a choice printed on the unit would be
          // deduped away by withRankAbilities, making the rank inert.
          expect(printed.has(choiceId), `${unitId} prints ${choiceId} (would waste the rank)`).toBe(false);
        }
      }
      // The real resolver grants EXACTLY one ability per ability-rank (never a
      // dup collapse): a 'standard' unit ends at 1 rank ability, 'strong' at 2.
      expect(unitRankAbilityIds(unitId, 4), unitId).toHaveLength(expected.slots.length);
    }
  });

  it("ART: every choice id has an EXPLICIT icon entry resolving to a file on disk", () => {
    for (const [unitId, expected] of Object.entries(EXPECTED_SCHEDULES)) {
      for (const slot of expected.slots) {
        for (const choiceId of slot) {
          // Prefer an explicit mapping for all (the fallback exists too, but an
          // explicit entry is the pinned contract).
          expect(UNIT_RANK_ABILITY_ICONS[choiceId], `${unitId} → ${choiceId} needs an explicit icon`).toBeTruthy();
          const icon = unitRankAbilityIcon(choiceId);
          expect(icon.startsWith("/assets/"), choiceId).toBe(true);
          expect(
            existsSync(join(process.cwd(), "public", icon.replace(/^\//, ""))),
            `${choiceId} → ${icon} missing on disk`
          ).toBe(true);
        }
      }
    }
  });

  // BEHAVIOURAL (effect-level): Yukikaze's schedule actually FOLDS in combat —
  // a stats rank moves a real stat and an ability rank grants the signature id.
  // Fails if withRankAbilities / the schedule wiring is removed, OR if the
  // schedule reverts to a generic filler (r2 would carry a different id).
  it("Yukikaze folds in combat: R1 stats (+1 Def), R2 grants Twin Attack Dice — below-threshold CONTROL grants neither the ability nor the stat", () => {
    const build = (experience?: number): CombatUnitState =>
      makeCombatUnitFromArmy(
        { id: "yk_army", unitDefId: "azur_lane.yukikaze", side: "few", ...(experience ? { experience } : {}) },
        "p1",
        "unit_p1_yk",
        0,
        "legacy"
      )!;

    // silver thresholds 4/8/13/18 → R1 at 4 XP (stats), R2 at 8 XP (ability slot1).
    const plain = build();
    const r1 = build(4);
    const r2 = build(8);

    expect(r1.unitRank).toBe(1);
    expect(r2.unitRank).toBe(2);

    // Stats-rank fold: silver step 0 is +1 Defense — an OBSERVABLE stat delta.
    expect(plain.defense).toBe(coreUnitDefinitions["azur_lane.yukikaze"].few!.defense);
    expect(r1.defense).toBe(plain.defense + 1);
    expect(r2.defense).toBe(plain.defense + 1); // R2 is an ability rank → no further stat step

    // Ability-rank grant: R2 carries the lore signature (Twin Attack Dice).
    expect(r2.abilities).toContain("attack-roll-advantage-passive");

    // CONTROLs: below the R2 ability threshold there is NO grant; the plain card
    // (no XP) carries neither the grant nor the stat bump (base stats).
    expect(r1.abilities).not.toContain("attack-roll-advantage-passive");
    expect(plain.abilities).not.toContain("attack-roll-advantage-passive");
    expect(plain.unitRank ?? 0).toBe(0);
  });
});
