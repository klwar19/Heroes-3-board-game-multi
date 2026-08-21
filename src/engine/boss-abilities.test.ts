import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DUNGEON_FLOOR_BOSSES,
  listAllBossDefinitions,
  RAID_BOSS_ABILITY_CHOICES,
  RAID_BOSSES
} from "@/data/anime/bosses";
import { PVE_LAIR_SCRIPT_IDS } from "@/data/anime/pve-combat-scripts";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import {
  customBossToDefinition,
  DOOM_RAID_BOSS_IDS,
  makeRaidBossCombatUnit,
  scheduledBossPool
} from "./raid-bosses";
import { sanitizeCustomMapPreset } from "./map-preset";
import { deathStareFollowUpAppliesTo, getUnitAbilityDefinitions, moraleLockedForPlayer } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState } from "./state";

/**
 * The Raid-Boss arms (§6.5.2/§6.8) — each pinned with an observable combat
 * outcome AND a mutation CONTROL:
 *
 *  (1) Enrage (`boss-enrage`, FLAT_ATTACK_BONUS + requiresLayersAtMost 1):
 *      +2 Attack ONLY while the unit is on its LAST health layer.
 *  (2) Devour (`boss-devour`, DEATH_STARE_ON_DICE diceCount 1 / onRoll +1 /
 *      targetGradeAtMost bronze): after its own attack vs a BRONZE side, one
 *      "+1" Attack die removes the side outright; silver+ and gradeless
 *      targets are never threatened (no die is even thrown).
 *  (3) Fear (`boss-fear`, MORALE_LOCK): while a living enemy Fear unit stands,
 *      every morale USE is locked (offers withheld + forged spends rejected);
 *      it unlocks the moment the Fear unit dies.
 *  (4) The boss LAYER machinery: `makeRaidBossCombatUnit` mints armyStacks =
 *      layers − 1 and `markUnitRemovedIfNeeded` sheds bars unconditionally
 *      (bossUnit — no Unit-Stacks rule needed), carrying excess damage.
 *
 * Harness modelled on heavenly-demon-abilities.test.ts: the combat sandbox
 * with empty hands and scripted dice (damage = attack − defense, clamped ≥0).
 * Position 9 neighbours 5, 8, 10, 13 (4-column board).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
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

function freshCombat(seed: string, scriptedRolls: number[] = []): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = [...scriptedRolls, ...Array.from({ length: 40 }, () => 0)];
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: Partial<CombatUnitState>): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, overrides);
  return unit;
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

function parkBystanders(state: GameState, ids: string[]): void {
  const corners = [0, 3, 16, 19, 12, 15];
  ids.forEach((id, index) => {
    place(state, id, {
      position: corners[index] ?? 0,
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
  });
}

const SANDBOX_UNITS = [
  "unit_p1_marksmen",
  "unit_p1_griffins",
  "unit_p1_crusaders",
  "unit_p2_skeletons",
  "unit_p2_vampires",
  "unit_p2_dread_knights"
];

function parkAllBut(state: GameState, keep: string[]): void {
  parkBystanders(state, SANDBOX_UNITS.filter((id) => !keep.includes(id)));
}

// ---------------------------------------------------------------------------
// Registration hygiene: every boss ability id + designer whitelist id resolves
// to an IMPLEMENTED unitAbilities entry (no decorative boss clause can ship).
// ---------------------------------------------------------------------------

describe("Boss data — ability hygiene", () => {
  it("every catalog boss / floor boss ability id is an implemented unitAbilities entry", () => {
    for (const def of listAllBossDefinitions()) {
      expect(def.layers, `${def.id} layers`).toBeGreaterThanOrEqual(2);
      for (const abilityId of def.abilities) {
        const ability = unitAbilities[abilityId];
        expect(ability, `${def.id} → ${abilityId}`).toBeDefined();
        expect(ability.implementationStatus, `${def.id} → ${abilityId}`).toBe("implemented");
      }
    }
  });

  it("every boss card face + every themed module map object ships on disk", () => {
    for (const def of listAllBossDefinitions()) {
      expect(existsSync(join(process.cwd(), "public", def.cardImage)), def.cardImage).toBe(true);
    }
    for (const asset of [
      "/assets/bosses/custom_boss.webp",
      "/assets/bosses/rift_lair_field.webp",
      "/assets/bosses/dungeon_gate_field.webp",
      "/assets/bosses/calamity_gate_classic.webp",
      "/assets/bosses/calamity_gate_doom.webp",
      "/assets/bosses/rift_lair_classic.webp",
      "/assets/bosses/rift_lair_doom.webp",
      "/assets/bosses/dungeon_gate_classic.webp",
      "/assets/bosses/dungeon_gate_doom.webp"
    ]) {
      expect(existsSync(join(process.cwd(), "public", asset)), asset).toBe(true);
    }
  });

  it("each boss card face is its OWN id's file (the art bakes in that boss's name, title and health pips)", () => {
    // scripts/build-raid-dungeon-art.mjs renders `<id>.webp` from `<id>.png` and
    // stamps THAT boss's NAME, TITLE and one pip per layer into the frame. So a
    // cardImage pointing at another boss's file shows the wrong name and the
    // wrong number of health bars on the card — the four Doom bosses shipped
    // cross-wired exactly that way. Pinned per-boss so a transposition fails.
    for (const def of listAllBossDefinitions()) {
      expect(def.cardImage, def.id).toBe(`/assets/bosses/${def.id}.webp`);
    }
  });

  it("every designer whitelist id (RAID_BOSS_ABILITY_CHOICES) is implemented", () => {
    for (const abilityId of RAID_BOSS_ABILITY_CHOICES) {
      const ability = unitAbilities[abilityId];
      expect(ability, abilityId).toBeDefined();
      expect(ability.implementationStatus, abilityId).toBe("implemented");
    }
  });

  it("a designer custom boss resolves clamped stats and whitelist-filtered abilities", () => {
    const def = customBossToDefinition({
      id: "homebrew",
      name: "Homebrew Horror",
      attack: 99,
      defense: -5,
      health: 0,
      initiative: 40,
      layers: 99,
      abilities: ["boss-enrage", "genie-spell-draw-few", "no-such-ability"]
    });
    expect(def.attack).toBe(15);
    expect(def.defense).toBe(0);
    expect(def.health).toBe(1);
    expect(def.initiative).toBe(12);
    expect(def.layers).toBe(8);
    // Only the curated, implemented whitelist id survives — a deck-digging or
    // unknown id can never reach a minted boss.
    expect(def.abilities).toEqual(["boss-enrage"]);
    expect(def.abilityText).toBe(unitAbilities["boss-enrage"].text);
  });
});

// ---------------------------------------------------------------------------
// (4) Layer machinery — mint + unconditional shed with carried excess
// ---------------------------------------------------------------------------

describe("Boss layers — armyStacks shed WITHOUT any Unit-Stacks rule", () => {
  it("a lethal hit sheds one full bar and carries the excess (ARMY_STACK_LOST), stats untouched", () => {
    const state = freshCombat("boss-layer-shed");
    parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
    place(state, "unit_p1_marksmen", {
      position: 9,
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    // The boss stands in as p2's unit: 3 layers of 3 health, defense 0.
    const boss = makeRaidBossCombatUnit(RAID_BOSSES.goblin_king, 3, "unit_p2_skeletons", 10);
    boss.controllerId = "p2";
    state.combat!.units.unit_p2_skeletons = boss;

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    const wounded = after.combat!.units.unit_p2_skeletons;
    // Attack 5 − boss defense 1 = 4 damage vs a 3-health bar: the bar sheds
    // and the 1 excess point carries into the next bar.
    expect(wounded.armyStacks).toBe(1);
    expect(wounded.damage).toBe(1);
    expect(wounded.maxHealth).toBe(3);
    // Minted stats survive the shed (applyUnitCurrentSide no-ops on boss.<id>).
    expect(wounded.attack).toBe(RAID_BOSSES.goblin_king.attack);
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "ARMY_STACK_LOST" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
    // CONTROL: no Unit-Stacks rule is on in the sandbox — the shed came from
    // the bossUnit gate alone.
    expect(after.adventure).toBeFalsy();
  });

  it("CONTROL: a plain (non-boss) neutral with armyStacks does NOT shed without the rule", () => {
    const state = freshCombat("boss-layer-shed-control");
    parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
    place(state, "unit_p1_marksmen", {
      position: 9,
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 3,
      damage: 0,
      variant: "neutral",
      armyStacks: 2,
      type: "ground"
    });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    // Without armyUnitStacksActive (and without bossUnit) the layers are inert:
    // the unit is simply removed.
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "ARMY_STACK_LOST" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (1) Enrage — +2 Attack ONLY on the last health layer
// ---------------------------------------------------------------------------

describe("Enrage — requiresLayersAtMost gates the FLAT_ATTACK_BONUS live", () => {
  function bossAttackDamage(layersLeft: number, seed: string): number {
    const state = freshCombat(seed);
    parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
    const boss = makeRaidBossCombatUnit(RAID_BOSSES.goblin_king, layersLeft, "unit_p2_skeletons", 10);
    boss.controllerId = "p2";
    // Isolate Enrage: drop the retaliation-ignore rider for a clean read.
    boss.abilities = ["boss-enrage"];
    state.combat!.units.unit_p2_skeletons = boss;
    place(state, "unit_p1_marksmen", {
      position: 9,
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    const after = attack(state, "unit_p2_skeletons", "unit_p1_marksmen");
    return after.combat!.units.unit_p1_marksmen.damage;
  }

  it("on the LAST layer the attack lands +2 over the printed value", () => {
    // Goblin King prints attack 4; enraged (1 layer) => 6 damage vs defense 0.
    expect(bossAttackDamage(1, "boss-enrage-on")).toBe(RAID_BOSSES.goblin_king.attack + 2);
  });

  it("CONTROL: with 2+ layers remaining the bonus is hidden (printed attack only)", () => {
    expect(bossAttackDamage(3, "boss-enrage-off")).toBe(RAID_BOSSES.goblin_king.attack);
  });

  it("the gate reads LIVE layers: getUnitAbilityDefinitions hides/reveals as bars shed", () => {
    const boss = makeRaidBossCombatUnit(RAID_BOSSES.goblin_king, 2, "boss_probe", 10);
    boss.abilities = ["boss-enrage"];
    expect(getUnitAbilityDefinitions(boss).map((ability) => ability.id)).toEqual([]);
    boss.armyStacks = 0;
    expect(getUnitAbilityDefinitions(boss).map((ability) => ability.id)).toEqual(["boss-enrage"]);
  });
});

// ---------------------------------------------------------------------------
// (2) Devour — one "+1" die removes a BRONZE side outright
// ---------------------------------------------------------------------------

describe("Devour — die-gated bronze removal", () => {
  function devourAttack(options: {
    seed: string;
    defenderGrade: CombatUnitState["grade"];
    devourDie: number;
    defenderBankUnit?: boolean;
  }): GameState {
    // Script: attack die 0 first, then the Devour die.
    const state = freshCombat(options.seed, [0, options.devourDie]);
    parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
    place(state, "unit_p1_marksmen", {
      position: 9,
      abilities: ["boss-devour"],
      attack: 1,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 10,
      damage: 0,
      grade: options.defenderGrade,
      variant: "neutral",
      ...(options.defenderBankUnit ? { bankUnit: true } : {}),
      type: "ground"
    });
    return attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
  }

  it('a "+1" Devour die removes a surviving BRONZE side outright', () => {
    const after = devourAttack({ seed: "devour-hit", defenderGrade: "bronze", devourDie: 1 });
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
  });

  it('CONTROL: a "0" Devour die leaves the bronze target standing (1 attack damage only)', () => {
    const after = devourAttack({ seed: "devour-miss", defenderGrade: "bronze", devourDie: 0 });
    const defender = after.combat!.units.unit_p2_skeletons;
    expect(defender.damage).toBe(1);
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
  });

  it("CONTROL: a SILVER target is never threatened — no Devour die is thrown at all", () => {
    const after = devourAttack({ seed: "devour-silver", defenderGrade: "silver", devourDie: 1 });
    const defender = after.combat!.units.unit_p2_skeletons;
    expect(defender.damage).toBe(1);
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
    // The scripted "+1" was never consumed by a stare roll: no ability-roll
    // event names Devour.
    expect(
      after.eventLog.some(
        (event: GameEvent) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId?.startsWith("boss-devour")
      )
    ).toBe(false);
  });

  it("CONTROL: a gradeless target (bankUnit — banks, commanders, bosses) is exempt", () => {
    const after = devourAttack({
      seed: "devour-bank",
      defenderGrade: "bronze",
      devourDie: 1,
      defenderBankUnit: true
    });
    expect(
      after.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
  });

  it("the applies-to predicate itself exempts bosses (a boss can never devour a boss)", () => {
    const boss = makeRaidBossCombatUnit(RAID_BOSSES.colossal_titan, 5, "boss_probe", 10);
    expect(
      deathStareFollowUpAppliesTo(
        { abilityId: "boss-devour", abilityName: "Devour", diceCount: 1, onRoll: 1, targetGradeAtMost: "bronze" },
        boss
      )
    ).toBe(false);
  });

  it("the classic Gorgon stare (no gate) still threatens ANY tier", () => {
    const gold: CombatUnitState = makeRaidBossCombatUnit(RAID_BOSSES.goblin_king, 1, "probe", 10);
    delete gold.bankUnit;
    delete gold.bossUnit;
    expect(
      deathStareFollowUpAppliesTo(
        { abilityId: "gorgon-death-stare", abilityName: "Death Stare", diceCount: 2, onRoll: -1 },
        gold
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (3) Fear — MORALE_LOCK
// ---------------------------------------------------------------------------

describe("Fear — the enemy cannot USE morale while the Fear unit lives", () => {
  function fearState(seed: string): GameState {
    const state = freshCombat(seed);
    parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
    place(state, "unit_p1_marksmen", {
      position: 9,
      abilities: ["boss-fear"],
      attack: 0,
      defense: 0,
      maxHealth: 5,
      damage: 0,
      // A neutral-variant body: a lethal hit removes it outright (no Pack→Few
      // flip re-deriving printed abilities under the test's feet).
      variant: "neutral",
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 13,
      abilities: [],
      attack: 6,
      defense: 0,
      maxHealth: 10,
      damage: 0,
      variant: "neutral",
      type: "ground"
    });
    state.players.p2.morale = 1;
    return state;
  }

  it("locks the +1 token: no SPEND_MORALE offer, and a forged spend is rejected", () => {
    const state = fearState("fear-lock");
    expect(moraleLockedForPlayer(state.combat, "p2")).toBe(true);
    // CONTROL within: the Fear side itself is NOT locked (it is p1's own unit).
    expect(moraleLockedForPlayer(state.combat, "p1")).toBe(false);

    const offers = getLegalActions(state, "p2");
    expect(offers.some((legal) => legal.action.type === "SPEND_MORALE")).toBe(false);

    const forged = applyAction(state, { type: "SPEND_MORALE", playerId: "p2", benefit: "draw" });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.errors[0].message).toMatch(/Fear/i);
    // The morale token itself is untouched — the GAIN was never taken away.
    expect(forged.state.players.p2.morale).toBe(1);
  });

  it("CONTROL: killing the Fear unit unlocks morale immediately", () => {
    const state = fearState("fear-unlock");
    const after = attack(state, "unit_p2_skeletons", "unit_p1_marksmen");
    expect(after.combat!.units.unit_p1_marksmen.damage).toBeGreaterThanOrEqual(5);
    expect(moraleLockedForPlayer(after.combat, "p2")).toBe(false);
    const spend = applyAction(after, { type: "SPEND_MORALE", playerId: "p2", benefit: "draw" });
    expect(spend.errors).toEqual([]);
    expect(spend.state.players.p2.morale).toBe(0);
  });

  it("withholds the morale reroll source from the attack-die window while locked", () => {
    // p2 (morale 1) attacks INTO the Fear unit: without the lock the positive
    // morale token would open an ATTACK_DIE_REROLL window on p2's own roll.
    function passReactions(state: GameState): GameState {
      let current = state;
      let safety = 20;
      while (safety > 0 && current.reactionWindow) {
        safety -= 1;
        current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      }
      return current;
    }
    function declareAttack(state: GameState): GameState {
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_skeletons";
      return passReactions(
        applyOk(state, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "unit_p2_skeletons",
          defenderId: "unit_p1_marksmen"
        })
      );
    }

    const lockedMid = declareAttack(fearState("fear-reroll-locked"));
    // No source survives the lock, so no reroll window even opens.
    expect(lockedMid.pendingChoice?.type === "ATTACK_DIE_REROLL").toBe(false);

    // CONTROL: identical fight with the Fear rider removed → the positive
    // morale token IS a reroll source and the window opens on it.
    const control = fearState("fear-reroll-control");
    control.combat!.units.unit_p1_marksmen.abilities = [];
    const controlMid = declareAttack(control);
    expect(controlMid.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(
      controlMid.pendingChoice?.type === "ATTACK_DIE_REROLL" &&
        controlMid.pendingChoice.rerollSources.some((source) => source.morale)
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Variant expansion §B/§C — the new bosses and wardens are real, wired content
// ---------------------------------------------------------------------------

describe("Variant expansion bosses & wardens (§B/§C)", () => {
  const NEW_RAID_BOSSES = [
    "lich_archon",
    "hydra_matriarch",
    "basilisk_queen",
    "wailing_banshee",
    "archvile_ascendant",
    "mother_demon"
  ];
  const NEW_WARDENS = [
    "warden_gorgon_matron",
    "warden_stone_choir",
    "warden_bone_colossus",
    "doom_hell_knight_warden",
    "doom_archvile_warden"
  ];

  it("every new definition ships in the right catalog with at least one WIRED ability", () => {
    for (const id of NEW_RAID_BOSSES) {
      const def = RAID_BOSSES[id];
      expect(def, id).toBeTruthy();
      expect(def.abilities.length, id).toBeGreaterThan(0);
    }
    for (const id of NEW_WARDENS) {
      const def = DUNGEON_FLOOR_BOSSES[id];
      expect(def, id).toBeTruthy();
      expect(def.abilities.length, id).toBeGreaterThan(0);
    }
  });

  it("each new definition's abilityText is EXACTLY its wired abilities' printed texts (nothing decorative)", () => {
    for (const id of [...NEW_RAID_BOSSES, ...NEW_WARDENS]) {
      const def = RAID_BOSSES[id] ?? DUNGEON_FLOOR_BOSSES[id];
      expect(def.abilityText, id).toBe(
        def.abilities.map((abilityId) => unitAbilities[abilityId].text).join(" ")
      );
    }
  });

  const classicPool = scheduledBossPool({} as unknown as GameState);

  it("every new boss lands in exactly ONE theme pool", () => {
    for (const id of ["lich_archon", "hydra_matriarch", "basilisk_queen", "wailing_banshee"]) {
      expect(classicPool, id).toContain(id);
      expect(DOOM_RAID_BOSS_IDS as readonly string[], id).not.toContain(id);
    }
    for (const id of ["archvile_ascendant", "mother_demon"]) {
      expect(DOOM_RAID_BOSS_IDS as readonly string[], id).toContain(id);
      expect(classicPool, id).not.toContain(id);
    }
  });

  it("the removed BOSS_SPELL_ROTATION arms are gone from the catalog, the registry and the designer whitelist", () => {
    // 2026-08-21 user rejection: no monster casts at a round start any more.
    // This is the machine proof the mechanic cannot come back through data.
    const carried = new Set(listAllBossDefinitions().flatMap((def) => def.abilities));
    for (const rotation of [
      "boss-spell-necrotic",
      "boss-spell-frost",
      "boss-spell-infernal",
      "boss-spell-mindflay"
    ]) {
      expect(unitAbilities[rotation], rotation).toBeUndefined();
      expect(carried.has(rotation), rotation).toBe(false);
      expect(RAID_BOSS_ABILITY_CHOICES, rotation).not.toContain(rotation);
    }
    // No surviving ability ANYWHERE in the registry carries the deleted effect
    // type (a stale entry would be an unresolvable union member).
    for (const [id, ability] of Object.entries(unitAbilities)) {
      expect(ability.effect?.type, id).not.toBe("BOSS_SPELL_ROTATION");
    }
  });

  it("a saved designer preset naming a REMOVED caster rotation is sanitized away, not crashed on", () => {
    // A map authored while `boss-spell-frost` existed must still load: the
    // sanitizer filters against RAID_BOSS_ABILITY_CHOICES, which no longer
    // lists it. CONTROL: a still-valid id on the same boss survives.
    const preset = sanitizeCustomMapPreset({
      raidBosses: {
        bosses: [
          {
            id: "legacy-caster",
            name: "Legacy Caster",
            attack: 5,
            defense: 2,
            health: 3,
            initiative: 6,
            layers: 3,
            abilities: ["boss-spell-frost", "boss-enrage", "boss-spell-mindflay"]
          }
        ]
      }
    } as never);
    const saved = preset?.raidBosses?.bosses?.[0];
    expect(saved, "the boss itself must survive the sanitize").toBeTruthy();
    expect(saved!.abilities).toEqual(["boss-enrage"]);
    // …and resolving it into a live definition keeps only the survivor, with the
    // card text derived from it.
    const def = customBossToDefinition(saved!);
    expect(def.abilities).toEqual(["boss-enrage"]);
    expect(def.abilityText).toBe(unitAbilities["boss-enrage"].text);
  });

  it("the two Rift-Lair scripts written for Phase-2 bosses now name REAL bosses", () => {
    for (const bossId of Object.keys(PVE_LAIR_SCRIPT_IDS)) {
      expect(RAID_BOSSES[bossId], bossId).toBeTruthy();
    }
    expect(PVE_LAIR_SCRIPT_IDS.lich_archon).toBeTruthy();
    expect(PVE_LAIR_SCRIPT_IDS.mother_demon).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The BOSS_SPELL_ROTATION replacement kits (2026-08-21) — every arm the five
// ex-caster monsters (and the two de-duplicated ones) now carry, pinned by the
// OBSERVABLE combat outcome plus a CONTROL fight with the arm stripped.
//
// The arms are all pre-existing implemented ones, so what these tests really
// prove is that the arm EXECUTES for a minted, NEUTRAL-owned, layered boss —
// which is the thing that could silently be decorative (e.g. a `requiresStacked`
// arm never fires on a boss, since a boss carries no stackToken).
// ---------------------------------------------------------------------------

describe("Boss replacement kits — each arm really runs on a minted boss", () => {
  /** Put `def` on the board as p2's unit with `layersLeft` bars. */
  function mountBoss(
    state: GameState,
    def: (typeof RAID_BOSSES)[string],
    layersLeft: number,
    unitId = "unit_p2_skeletons",
    position = 10,
    abilities?: string[]
  ): CombatUnitState {
    const boss = makeRaidBossCombatUnit(def, layersLeft, unitId, position);
    boss.controllerId = "p2";
    if (abilities) {
      boss.abilities = [...abilities];
    }
    state.combat!.units[unitId] = boss;
    return boss;
  }

  /**
   * Advance the activation to `bossUnitId` through the REAL activation pipeline
   * (so `applyActivationStartAbilities` fires), by Defending with a filler unit
   * on the same side and letting the engine advance.
   */
  function activateThrough(state: GameState, bossUnitId: string, fillerId: string): GameState {
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== bossUnitId && unit.id !== fillerId;
    }
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = fillerId;
    return settle(applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: fillerId }));
  }

  // --- lich_archon: wraith-enemy-discard + wraith-heal-2 --------------------

  it("Lich Archon's activation tears a RANDOM card out of the fighter's hand (and a stripped kit does not)", () => {
    const run = (abilities: string[]): number => {
      const state = freshCombat(`lich-drain-${abilities.join("-") || "none"}`);
      state.players.p1.hand = ["spell.magic_arrow", "stat.power", "stat.attack"];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons", "unit_p2_vampires"]);
      mountBoss(state, RAID_BOSSES.lich_archon, 5, "unit_p2_skeletons", 10, abilities);
      const after = activateThrough(state, "unit_p2_skeletons", "unit_p2_vampires");
      expect(after.combat!.activeUnitId).toBe("unit_p2_skeletons");
      return after.players.p1.hand.length;
    };
    // The shipped kit drains exactly 1 of the 3 cards...
    expect(run(RAID_BOSSES.lich_archon.abilities)).toBe(2);
    // ...and it is the hand-drain arm doing it, not the activation itself.
    expect(run(["wraith-heal-2"])).toBe(3);
  });

  it("Lich Archon heals 2 damage off its CURRENT bar on activation, and never restores a shed bar (CONTROL: kit stripped)", () => {
    const run = (abilities: string[]): { damage: number; bars: number } => {
      const state = freshCombat(`lich-heal-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons", "unit_p2_vampires"]);
      const boss = mountBoss(state, RAID_BOSSES.lich_archon, 4, "unit_p2_skeletons", 10, abilities);
      // Wounded to 2 of 3 on the current bar, one bar already shed (4 of 5 left).
      boss.damage = 2;
      const after = activateThrough(state, "unit_p2_skeletons", "unit_p2_vampires");
      const healed = after.combat!.units.unit_p2_skeletons;
      return { damage: healed.damage, bars: (healed.armyStacks ?? 0) + 1 };
    };
    // Regeneration removes both points of damage, and the shed 5th bar is NOT
    // given back (the printed cap is 5).
    expect(run(RAID_BOSSES.lich_archon.abilities)).toEqual({ damage: 0, bars: 4 });
    // CONTROL: with the heal arm gone the wound stays.
    expect(run(["wraith-enemy-discard"])).toEqual({ damage: 2, bars: 4 });
  });

  // --- wailing_banshee: ghost-dragon-morale-drain + wog-nightmare-fear ------

  it("Wailing Banshee's activation burns the fighter's positive morale (CONTROL: kit stripped keeps it)", () => {
    const run = (abilities: string[]): number => {
      const state = freshCombat(`banshee-morale-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      state.players.p1.morale = 1;
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons", "unit_p2_vampires"]);
      mountBoss(state, RAID_BOSSES.wailing_banshee, 4, "unit_p2_skeletons", 10, abilities);
      return activateThrough(state, "unit_p2_skeletons", "unit_p2_vampires").players.p1.morale;
    };
    expect(run(RAID_BOSSES.wailing_banshee.abilities)).toBe(0);
    expect(run(["wog-nightmare-fear"])).toBe(1);
  });

  it("Wailing Banshee's Fear makes its attacker resolve the LOWER of two dice — real damage delta (CONTROL: kit stripped)", () => {
    const run = (abilities: string[]): number => {
      // Scripted dice: +1 first, -1 second. With Fear the attacker resolves the
      // -1 (attack 6 - 1 = 5); without it, only the +1 is read (6 + 1 = 7).
      const state = freshCombat(`banshee-fear-${abilities.join("-") || "none"}`, [1, -1]);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
      place(state, "unit_p1_marksmen", {
        position: 9,
        abilities: [],
        attack: 6,
        defense: 0,
        maxHealth: 30,
        damage: 0,
        type: "ground"
      });
      const boss = mountBoss(state, RAID_BOSSES.wailing_banshee, 4, "unit_p2_skeletons", 10, abilities);
      boss.defense = 0;
      const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      const hit = after.combat!.units.unit_p2_skeletons;
      // Damage taken across the layer shed: bars lost x maxHealth + damage.
      const barsLost = 3 - (hit.armyStacks ?? 0);
      return barsLost * hit.maxHealth + hit.damage;
    };
    const feared = run(RAID_BOSSES.wailing_banshee.abilities);
    const control = run(["ghost-dragon-morale-drain"]);
    expect(control).toBe(7);
    expect(feared).toBe(5);
    expect(feared).toBeLessThan(control);
  });

  // --- archvile_ascendant: magic-elemental-attack-all-enemies + fire wall ---

  it("Archvile Ascendant's blow washes over EVERY other adjacent enemy and leaves a Fire Wall (CONTROL: neither happens)", () => {
    const run = (abilities: string[]) => {
      const state = freshCombat(`archvile-splash-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p1_griffins", "unit_p2_skeletons"]);
      // Position 9 neighbours 5, 8, 10, 13. Boss at 9, two victims adjacent.
      for (const id of ["unit_p1_marksmen", "unit_p1_griffins"]) {
        place(state, id, {
          position: id === "unit_p1_marksmen" ? 8 : 10,
          abilities: [],
          attack: 0,
          defense: 0,
          maxHealth: 30,
          damage: 0,
          type: "ground"
        });
      }
      mountBoss(state, RAID_BOSSES.archvile_ascendant, 5, "unit_p2_skeletons", 9, abilities);
      const after = attack(state, "unit_p2_skeletons", "unit_p1_marksmen");
      return {
        primary: after.combat!.units.unit_p1_marksmen.damage,
        splashed: after.combat!.units.unit_p1_griffins.damage,
        fireWalls: (after.combat!.battlefieldTokens ?? []).filter(
          (token) => token.kind === "fire_wall"
        ).length
      };
    };
    const kit = run(RAID_BOSSES.archvile_ascendant.abilities);
    const printed = RAID_BOSSES.archvile_ascendant.attack;
    // Attack 5 vs defense 0 on the primary, and a FULL separate attack on the
    // other adjacent enemy — the whole point of the arm.
    expect(kit.primary).toBe(printed);
    // RECONCILED (do not "fix" this to `printed`): the splash victim takes the
    // separate attack's 5 AND 1 more, because the Fire Wall arm drops a wall on
    // the space of EVERY unit it attacks and that wall burns the occupant. So
    // the two arms genuinely compound — 5 + 1 — which is the flavour ("fire that
    // spreads by contact") landing as real damage.
    expect(kit.splashed).toBe(printed + 1);
    // One wall per attacked space (primary + splash).
    expect(kit.fireWalls).toBe(2);
    // CONTROL: with the kit stripped only the declared target is touched and no
    // Fire Wall is placed.
    const control = run([]);
    expect(control.primary).toBe(printed);
    expect(control.splashed).toBe(0);
    expect(control.fireWalls).toBe(0);
  });

  // --- doom_archvile_warden: fire wall + fire shield ------------------------

  it("Archvile Warden burns back at whatever melees it (CONTROL: kit stripped takes no revenge)", () => {
    const run = (abilities: string[]): number => {
      const state = freshCombat(`warden-fireshield-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
      place(state, "unit_p1_marksmen", {
        position: 9,
        abilities: [],
        attack: 1,
        defense: 0,
        maxHealth: 30,
        damage: 0,
        type: "ground"
      });
      const boss = makeRaidBossCombatUnit(
        DUNGEON_FLOOR_BOSSES.doom_archvile_warden,
        3,
        "unit_p2_skeletons",
        10
      );
      boss.controllerId = "p2";
      boss.abilities = [...abilities];
      state.combat!.units.unit_p2_skeletons = boss;
      const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return after.combat!.units.unit_p1_marksmen.damage;
    };
    // RECONCILED: the CONTROL is NOT 0 — the warden retaliates for its printed
    // Attack 5 either way. Fire Shield is the extra 1 on top of that, so the
    // arm's whole contribution is the +1 delta.
    const printed = DUNGEON_FLOOR_BOSSES.doom_archvile_warden.attack;
    expect(run([])).toBe(printed);
    expect(run(DUNGEON_FLOOR_BOSSES.doom_archvile_warden.abilities)).toBe(printed + 1);
  });

  // --- warden_stone_choir: azure-dragon-paralysis + damage cap --------------

  it("The Stone Choir petrifies its target on a '-1' Attack die and caps any single hit at 4 (CONTROLs for both)", () => {
    const paralysisRun = (abilities: string[], roll: number): boolean => {
      const state = freshCombat(`choir-petrify-${abilities.join("-") || "none"}-${roll}`, [roll]);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
      place(state, "unit_p1_marksmen", {
        position: 9,
        abilities: [],
        attack: 0,
        defense: 0,
        maxHealth: 30,
        damage: 0,
        type: "ground"
      });
      const boss = makeRaidBossCombatUnit(
        DUNGEON_FLOOR_BOSSES.warden_stone_choir,
        2,
        "unit_p2_skeletons",
        10
      );
      boss.controllerId = "p2";
      boss.abilities = [...abilities];
      state.combat!.units.unit_p2_skeletons = boss;
      const after = attack(state, "unit_p2_skeletons", "unit_p1_marksmen");
      return (after.combat!.units.unit_p1_marksmen.tokens ?? []).some(
        (token) => token.kind === "paralysis"
      );
    };
    const kit = DUNGEON_FLOOR_BOSSES.warden_stone_choir.abilities;
    expect(paralysisRun(kit, -1)).toBe(true);
    // CONTROL A: the same fight on a "+1" die petrifies nobody (the gate is the roll).
    expect(paralysisRun(kit, 1)).toBe(false);
    // CONTROL B: the same "-1" with the arm stripped petrifies nobody.
    expect(paralysisRun(["doom-baron-damage-cap"], -1)).toBe(false);

    const capRun = (abilities: string[]): number => {
      const state = freshCombat(`choir-cap-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
      place(state, "unit_p1_marksmen", {
        position: 9,
        abilities: [],
        attack: 9,
        defense: 0,
        maxHealth: 30,
        damage: 0,
        type: "ground"
      });
      const boss = makeRaidBossCombatUnit(
        DUNGEON_FLOOR_BOSSES.warden_stone_choir,
        2,
        "unit_p2_skeletons",
        10
      );
      boss.controllerId = "p2";
      boss.abilities = [...abilities];
      boss.defense = 0;
      state.combat!.units.unit_p2_skeletons = boss;
      const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      const hit = after.combat!.units.unit_p2_skeletons;
      const barsLost = 1 - (hit.armyStacks ?? 0);
      return barsLost * hit.maxHealth + hit.damage;
    };
    // Attack 9 vs a 4-health bar: capped at 4, so exactly one bar sheds and 0
    // carries. Uncapped the same blow would land 9.
    expect(capRun(kit)).toBe(4);
    expect(capRun(["azure-dragon-paralysis"])).toBe(9);
  });

  // --- the two de-duplicated wardens ----------------------------------------

  it("Minotaur of the Depths ignores the Defense printed on the target card (CONTROL: it does not)", () => {
    const run = (abilities: string[]): number => {
      const state = freshCombat(`minotaur-pierce-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
      place(state, "unit_p1_marksmen", {
        position: 9,
        abilities: [],
        attack: 0,
        defense: 3,
        maxHealth: 30,
        damage: 0,
        type: "ground"
      });
      const boss = makeRaidBossCombatUnit(
        DUNGEON_FLOOR_BOSSES.minotaur_of_the_depths,
        2,
        "unit_p2_skeletons",
        10
      );
      boss.controllerId = "p2";
      boss.abilities = [...abilities];
      state.combat!.units.unit_p2_skeletons = boss;
      return attack(state, "unit_p2_skeletons", "unit_p1_marksmen").combat!.units.unit_p1_marksmen
        .damage;
    };
    const printed = DUNGEON_FLOOR_BOSSES.minotaur_of_the_depths.attack;
    expect(run(DUNGEON_FLOOR_BOSSES.minotaur_of_the_depths.abilities)).toBe(printed);
    expect(run(["ignores-retaliation"])).toBe(printed - 3);
  });

  it("Cyberdemon Tyrant's chassis caps a single attack at 4 (CONTROL: uncapped)", () => {
    const run = (abilities: string[]): number => {
      const state = freshCombat(`tyrant-cap-${abilities.join("-") || "none"}`);
      state.players.p1.hand = [];
      parkAllBut(state, ["unit_p1_marksmen", "unit_p2_skeletons"]);
      place(state, "unit_p1_marksmen", {
        position: 9,
        abilities: [],
        attack: 10,
        defense: 0,
        maxHealth: 30,
        damage: 0,
        type: "ground"
      });
      const boss = makeRaidBossCombatUnit(
        DUNGEON_FLOOR_BOSSES.doom_cyberdemon_tyrant,
        3,
        "unit_p2_skeletons",
        10
      );
      boss.controllerId = "p2";
      boss.abilities = [...abilities];
      boss.defense = 0;
      state.combat!.units.unit_p2_skeletons = boss;
      const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      const hit = after.combat!.units.unit_p2_skeletons;
      const barsLost = 2 - (hit.armyStacks ?? 0);
      return barsLost * hit.maxHealth + hit.damage;
    };
    expect(run(DUNGEON_FLOOR_BOSSES.doom_cyberdemon_tyrant.abilities)).toBe(4);
    expect(run(["dragon-line-attack-3"])).toBe(10);
  });
});
