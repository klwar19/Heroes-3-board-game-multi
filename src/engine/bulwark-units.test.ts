import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import { effectiveInitiative, makeActiveEffect } from "./active-effects";
import { getSelfAttackerTypeDefenseBonus } from "./unit-abilities";
import { hasToken, placeCombatToken } from "./tokens";
import { gainResources, getArmyMapAbilities } from "./adventure";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass reactions / decline rerolls until an attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
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
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

/**
 * A clean ranged duel for unit-ability tests: p1 Marksmen (ranged, die 0) shoot
 * a beefy p2 Skeletons that cannot die or retaliate. NOT a Bulwark faction
 * (so Runes never interfere) — the Bulwark ABILITY tags are placed directly.
 */
function rangedDuel(): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen; // type "ranged"
  attacker.abilities = [];
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13; // non-adjacent → ranged shot, no retaliation
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

const ATTACK: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

describe("Bulwark units — Air Shield (Shamans)", () => {
  it("takes 1 less damage from a ranged attacker", () => {
    // Control: no Air Shield → the full 3 damage (attack 3 − defense 0).
    let control = rangedDuel();
    control = settle(applyOk(control, ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3);

    // With Air Shield → +1 Defense against the ranged Marksmen → 2 damage.
    let shielded = rangedDuel();
    shielded.combat!.units.unit_p2_skeletons.abilities = ["bulwark-air-shield"];
    shielded = settle(applyOk(shielded, ATTACK));
    expect(shielded.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("applies only against ranged attackers, never melee (type gate)", () => {
    const state = rangedDuel();
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = ["bulwark-air-shield"];
    const rangedAttacker = state.combat!.units.unit_p1_marksmen; // ranged
    const groundAttacker = state.combat!.units.unit_p1_crusaders; // ground
    expect(getSelfAttackerTypeDefenseBonus(defender, rangedAttacker)).toBe(1);
    expect(getSelfAttackerTypeDefenseBonus(defender, groundAttacker)).toBe(0);
  });
});

describe("Bulwark units — Thick Hide (War Mammoths)", () => {
  function defendThenAttack(defenderAbilities: string[], doDefend: boolean): GameState {
    const state = rangedDuel();
    state.combat!.units.unit_p1_marksmen.attack = 5;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = defenderAbilities;
    if (!doDefend) {
      return settle(applyOk(state, ATTACK));
    }
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const defended = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: "unit_p2_skeletons" });
    defended.activePlayerId = "p1";
    defended.combat!.activeUnitId = "unit_p1_marksmen";
    defended.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    defended.combat!.dice.rollCount = 0;
    return settle(applyOk(defended, ATTACK));
  }

  it("+1 Defense while the unit is defending — but only while defending", () => {
    // Defended, no Thick Hide: defense 0 + Defend die 0 → full 5 damage.
    expect(defendThenAttack([], true).combat!.units.unit_p2_skeletons.damage).toBe(5);
    // Defended WITH Thick Hide: +1 Defense on top of the die → 4 damage.
    expect(defendThenAttack(["bulwark-thick-hide"], true).combat!.units.unit_p2_skeletons.damage).toBe(4);
    // Thick Hide but NOT defending (no Defense token) → no bonus → 5 damage.
    expect(defendThenAttack(["bulwark-thick-hide"], false).combat!.units.unit_p2_skeletons.damage).toBe(5);
  });
});

describe("Bulwark units — Freezing Shot (Great Shamans)", () => {
  it("the attack drops the target's Initiative by 2", () => {
    const base = rangedDuel().combat!.units.unit_p2_skeletons.initiative;

    // Control: a plain attack leaves the target's Initiative untouched.
    let control = rangedDuel();
    control = settle(applyOk(control, ATTACK));
    expect(effectiveInitiative(control.combat!.units.unit_p2_skeletons, control.activeEffects)).toBe(base);

    // Freezing Shot: an INITIATIVE_BONUS −2 lands on the target.
    let state = rangedDuel();
    state.combat!.units.unit_p1_marksmen.abilities = ["bulwark-freezing-shot"];
    state = settle(applyOk(state, ATTACK));
    const target = state.combat!.units.unit_p2_skeletons;
    expect(effectiveInitiative(target, state.activeEffects)).toBe(base - 2);
    expect(
      state.activeEffects.some(
        (effect) =>
          effect.target?.type === "unit" &&
          effect.target.unitId === target.id &&
          effect.modifiers.some((modifier) => modifier.type === "INITIATIVE_BONUS" && modifier.amount === -2)
      )
    ).toBe(true);
  });
});

describe("Bulwark units — Recovery (Yetis)", () => {
  /**
   * Puts a Weakness token and a Slow effect on the Marksmen (our stand-in Yeti),
   * then advances activation onto it (every other unit is done; the active
   * Griffins defends to advance). When the Yeti activates, Recovery should fire.
   */
  function activateYeti(abilities: string[]): GameState {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const yeti = state.combat!.units.unit_p1_marksmen;
    yeti.abilities = abilities;
    yeti.initiative = 20;
    placeCombatToken(state, yeti, "weakness", -1, "Test");
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Slow",
          scope: "unit",
          modifiers: [{ type: "INITIATIVE_BONUS", amount: -2 }],
          duration: { type: "combat" },
          polarity: "negative",
          removable: true
        },
        { type: "system" },
        "p2",
        { type: "unit", unitId: yeti.id }
      )
    );
    // Everyone has acted except the Yeti and the currently-active Griffins; the
    // Griffins defends to advance activation straight onto the Yeti.
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = true;
    }
    yeti.activatedThisRound = false;
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
  }

  it("shakes off negative effects and tokens the moment it activates", () => {
    const after = activateYeti(["bulwark-yeti-recover"]);
    const yeti = after.combat!.units.unit_p1_marksmen;
    expect(after.combat!.activeUnitId).toBe("unit_p1_marksmen"); // it really did activate
    expect(hasToken(yeti, "weakness")).toBe(false);
    expect(
      after.activeEffects.some(
        (effect) => effect.name === "Slow" && effect.target?.type === "unit" && effect.target.unitId === yeti.id
      )
    ).toBe(false);
    expect(effectiveInitiative(yeti, after.activeEffects)).toBe(yeti.initiative);
  });

  it("control: a unit WITHOUT Recovery keeps its debuffs after activating", () => {
    const after = activateYeti([]);
    const unit = after.combat!.units.unit_p1_marksmen;
    expect(after.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(hasToken(unit, "weakness")).toBe(true);
    expect(
      after.activeEffects.some(
        (effect) => effect.name === "Slow" && effect.target?.type === "unit" && effect.target.unitId === unit.id
      )
    ).toBe(true);
  });
});

describe("Bulwark units — Teleport (Jotunn Warlord)", () => {
  /**
   * Gives a chosen unit the Jotunn Teleport ability and advances activation onto
   * it: every other unit has acted, and the active Griffins defends to hand the
   * slot to our stand-in Jotunn Warlord (the Marksmen). Returns the state the
   * instant the Jotunn's activation opens — so its start-of-activation teleport
   * choice, if any, is already on the table.
   */
  function activateJotunn(abilities: string[]): GameState {
    const state = createInitialGameState("jotunn-teleport");
    state.combat!.obstacles = [];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const units = state.combat!.units;
    units.unit_p1_marksmen.position = 0; // the stand-in Jotunn Warlord
    units.unit_p1_marksmen.abilities = abilities;
    units.unit_p1_marksmen.initiative = 20;
    units.unit_p1_griffins.position = 1; // the ally that defends to advance the slot
    units.unit_p1_crusaders.position = 2; // a friendly teleport candidate
    units.unit_p2_skeletons.position = 16; // an enemy teleport candidate
    for (const unit of Object.values(units)) {
      unit.activatedThisRound = true;
    }
    units.unit_p1_marksmen.activatedThisRound = false;
    units.unit_p1_griffins.activatedThisRound = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
  }

  it("offers an OPTIONAL start-of-activation choice to teleport one of YOUR OWN units (a friendly unit or itself, never an enemy)", () => {
    const opened = activateJotunn(["bulwark-jotunn-teleport"]);
    expect(opened.combat!.activeUnitId).toBe("unit_p1_marksmen"); // the Jotunn really activated
    const choice = opened.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.kind).toBe("jotunn-teleport");
    expect(choice.optional).toBe(true); // "can choose to do or not"
    // OWN units only: the Jotunn itself and a friendly unit are candidates...
    expect(choice.candidateUnitIds).toContain("unit_p1_marksmen");
    expect(choice.candidateUnitIds).toContain("unit_p1_crusaders");
    // ...but an ENEMY unit is NEVER a candidate (the whole point of this fix).
    expect(choice.candidateUnitIds).not.toContain("unit_p2_skeletons");
  });

  it("teleports the chosen FRIENDLY unit to the chosen empty space — and the Jotunn can still act", () => {
    let state = activateJotunn(["bulwark-jotunn-teleport"]);
    const pick = state.pendingChoice!;
    const allyFrom = state.combat!.units.unit_p1_crusaders.position;
    const allyDamageBefore = state.combat!.units.unit_p1_crusaders.damage;
    // Step A — click a friendly unit (own-side relocation).
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: pick.id,
      targetUnitId: "unit_p1_crusaders"
    });
    // Step B — the very same empty-space picker the Teleport Spell opens.
    const dest = state.pendingChoice;
    if (dest?.type !== "OPTION_CHOICE" || dest.context !== "combat-teleport" || !dest.teleport) {
      throw new Error("the empty-space picker did not open");
    }
    expect(dest.teleport.unitId).toBe("unit_p1_crusaders");
    const destinationCell = dest.teleport.positions[0];
    expect(destinationCell).not.toBe(allyFrom); // an empty cell, never the occupied origin
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: dest.id, optionIndex: 0 });
    // OBSERVABLE OUTCOME: the friendly unit actually moved to the chosen empty
    // cell, with no damage — a pure relocation, exactly like the Teleport Spell.
    const ally = state.combat!.units.unit_p1_crusaders;
    expect(ally.position).toBe(destinationCell);
    expect(ally.position).not.toBe(allyFrom);
    expect(ally.damage).toBe(allyDamageBefore);
    // The card-glide animation (UNIT_MOVED) and the teleport SFX cue
    // (UNIT_ABILITY_TRIGGERED carrying the Teleport sound) both fired.
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_MOVED" && event.unitId === "unit_p1_crusaders" && event.to === destinationCell
      )
    ).toBe(true);
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "bulwark-jotunn-teleport"
      )
    ).toBe(true);
    // "can still act after that": the Jotunn is still the active unit, has neither
    // moved nor attacked, and its activation ability is spent (won't re-prompt).
    const jotunn = state.combat!.units.unit_p1_marksmen;
    expect(state.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(jotunn.movedThisActivation).toBe(false);
    expect(jotunn.attackedThisActivation).toBe(false);
    expect(jotunn.activatedThisRound).toBe(false);
    expect(jotunn.activationAbilityDone).toBe(true);
    expect(state.pendingChoice).toBeNull();
    // Prove it can STILL act: it defends successfully — an activation it could
    // only take while still active and un-acted.
    const acted = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_marksmen" });
    expect(acted.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(true);
  });

  it("the SKIP option teleports no one and the Jotunn proceeds normally", () => {
    let state = activateJotunn(["bulwark-jotunn-teleport"]);
    const pick = state.pendingChoice!;
    const before = Object.fromEntries(Object.values(state.combat!.units).map((unit) => [unit.id, unit.position]));
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: pick.id, targetUnitId: "skip" });
    // No destination picker opens, nobody moved, and no teleport cue fired.
    expect(state.pendingChoice).toBeNull();
    for (const unit of Object.values(state.combat!.units)) {
      expect(unit.position).toBe(before[unit.id]);
    }
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "bulwark-jotunn-teleport"
      )
    ).toBe(false);
    const jotunn = state.combat!.units.unit_p1_marksmen;
    expect(jotunn.activationAbilityDone).toBe(true);
    expect(jotunn.movedThisActivation).toBe(false);
  });

  it("NEVER teleports an enemy: a forged action naming an enemy unit is rejected and moves nobody", () => {
    const state = activateJotunn(["bulwark-jotunn-teleport"]);
    const pick = state.pendingChoice!;
    const enemyFrom = state.combat!.units.unit_p2_skeletons.position;
    // Forge a target the offer never listed — an enemy unit. The engine refuses
    // it at target validation (it is not among the candidate own-units), so the
    // action errors and nothing changes: the enemy stays put and no Teleport
    // cue fires. This is the core of the fix.
    const result = applyAction(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: pick.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map((error) => error.message).join(" ")).toMatch(/not a legal target/i);
    expect(result.state.combat!.units.unit_p2_skeletons.position).toBe(enemyFrom); // never moved
    expect(
      result.state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "bulwark-jotunn-teleport"
      )
    ).toBe(false);
  });

  it("CONTROL: a unit WITHOUT the ability gets no start-of-activation teleport choice", () => {
    const after = activateJotunn([]);
    expect(after.combat!.activeUnitId).toBe("unit_p1_marksmen"); // it still activated
    const choice = after.pendingChoice;
    expect(choice?.type === "ABILITY_TARGET_CHOICE" && choice.kind === "jotunn-teleport").toBe(false);
  });
});

describe("Bulwark units — roster & ability wiring", () => {
  const ids = [
    "bulwark.kobolds",
    "bulwark.mountain_rams",
    "bulwark.snow_elves",
    "bulwark.yetis",
    "bulwark.shamans",
    "bulwark.mammoths",
    "bulwark.jotunns"
  ];

  it("ships exactly seven Bulwark units across the bronze/silver/gold tiers", () => {
    const units = Object.values(coreUnitDefinitions).filter((unit) => unit.faction === "bulwark");
    expect(units.map((unit) => unit.id).sort()).toEqual([...ids].sort());
    const tiers = units.reduce<Record<string, number>>((acc, unit) => {
      acc[unit.tier] = (acc[unit.tier] ?? 0) + 1;
      return acc;
    }, {});
    expect(tiers).toEqual({ bronze: 3, silver: 2, gold: 2 });
  });

  it("every ability tag on a Bulwark unit is a real, implemented engine ability", () => {
    for (const id of ids) {
      const unit = coreUnitDefinitions[id];
      for (const side of [unit.few, unit.pack]) {
        for (const abilityId of side?.abilities ?? []) {
          const ability = unitAbilities[abilityId];
          expect(ability, `${id}: ability ${abilityId} must exist`).toBeTruthy();
          expect(ability.implementationStatus, `${abilityId} must be implemented`).toBe("implemented");
        }
      }
    }
  });

  it("wires each signature ability to the side the wiki gives it", () => {
    // Gold income is the Kobold Foreman (Pack) only; the Kobold (Few) is a no-op.
    expect(coreUnitDefinitions["bulwark.kobolds"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["bulwark.kobolds"].pack?.abilities).toContain("bulwark-kobold-gold");
    // Magic resistance and Thick Hide are upgrade-only (Argali / War Mammoth).
    expect(coreUnitDefinitions["bulwark.mountain_rams"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["bulwark.mountain_rams"].pack?.abilities).toContain("reduce-spell-damage-1");
    expect(coreUnitDefinitions["bulwark.mammoths"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["bulwark.mammoths"].pack?.abilities).toContain("bulwark-thick-hide");
    // Freezing Shot is the Great Shaman (Pack) only; Air Shield is on both.
    expect(coreUnitDefinitions["bulwark.shamans"].few?.abilities).toEqual(["bulwark-air-shield"]);
    expect(coreUnitDefinitions["bulwark.shamans"].pack?.abilities).toEqual(["bulwark-air-shield", "bulwark-freezing-shot"]);
    // The Steel Elf (Pack) ignores enemy Retaliation; both sides keep no-melee-penalty.
    expect(coreUnitDefinitions["bulwark.snow_elves"].few?.abilities).toEqual(["ignore-combat-penalties"]);
    expect(coreUnitDefinitions["bulwark.snow_elves"].pack?.abilities).toEqual(["ignore-combat-penalties", "ignores-retaliation"]);
    // Recovery is the Yeti Runemaster (Pack) only; the Yeti (Few) is a no-op now.
    expect(coreUnitDefinitions["bulwark.yetis"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["bulwark.yetis"].pack?.abilities).toEqual(["bulwark-yeti-recover"]);
    // Teleport is the Jotunn Warlord (Pack) only; the Jotunn (Few) is a no-op now.
    expect(coreUnitDefinitions["bulwark.jotunns"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["bulwark.jotunns"].pack?.abilities).toEqual(["bulwark-jotunn-teleport"]);
  });

  it("carries the revised printed stats across every affected unit", () => {
    const rams = coreUnitDefinitions["bulwark.mountain_rams"];
    expect(rams.few?.defense).toBe(1);
    expect(rams.pack?.defense).toBe(1);
    expect(rams.pack?.attack).toBe(2); // Argali attack lowered to 2
    const elves = coreUnitDefinitions["bulwark.snow_elves"];
    expect(elves.few?.health).toBe(3);
    expect(elves.pack?.health).toBe(3);
    expect(elves.pack?.attack).toBe(3); // Steel Elf attack lowered to 3
    const yetis = coreUnitDefinitions["bulwark.yetis"];
    expect({ attack: yetis.few?.attack, health: yetis.few?.health }).toEqual({ attack: 3, health: 4 });
    expect({ attack: yetis.pack?.attack, defense: yetis.pack?.defense, health: yetis.pack?.health }).toEqual({
      attack: 3, // Yeti Runemaster attack lowered to 3
      defense: 2,
      health: 5
    });
    const shamans = coreUnitDefinitions["bulwark.shamans"];
    expect(shamans.few?.defense).toBe(0); // Shaman defense lowered to 0
    // Great Shaman (Pack): attack lowered to 3, health raised to 6.
    expect({ attack: shamans.pack?.attack, health: shamans.pack?.health }).toEqual({ attack: 3, health: 6 });
    const mammoths = coreUnitDefinitions["bulwark.mammoths"];
    expect(mammoths.few?.defense).toBe(2);
    expect(mammoths.pack?.defense).toBe(2);
    expect(mammoths.few?.health).toBe(7);
    // War Mammoth (Pack): attack lowered to 5, health raised to 8.
    expect({ attack: mammoths.pack?.attack, health: mammoths.pack?.health }).toEqual({ attack: 5, health: 8 });
    const jotunns = coreUnitDefinitions["bulwark.jotunns"];
    // Jotunn (Few): attack lowered to 5, no ability. Jotunn Warlord (Pack): 6 atk / 9 hp.
    expect({ attack: jotunns.few?.attack, health: jotunns.few?.health }).toEqual({ attack: 5, health: 8 });
    expect({ attack: jotunns.pack?.attack, defense: jotunns.pack?.defense, health: jotunns.pack?.health }).toEqual({
      attack: 6,
      defense: 3,
      health: 9
    });
  });

  it("Kobold gold income is a Resource-round map gain of 1 gold", () => {
    expect(unitAbilities["bulwark-kobold-gold"].mapEffect).toEqual({
      type: "MAP_RESOURCE_ROUND_GAIN",
      resource: "gold",
      amount: 1
    });
  });
});

describe("Bulwark units — Steel Elf ignores enemy Retaliation (Snow Elves Pack)", () => {
  /** p1 melee-attacks an adjacent p2 defender that would otherwise retaliate for 3. */
  function retaliationDamageTaken(attackerAbilities: string[]): number {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = attackerAbilities;
    attacker.attack = 1;
    attacker.defense = 0;
    attacker.position = 1;
    attacker.maxHealth = 20;
    attacker.damage = 0;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.attack = 3; // retaliation strength
    defender.defense = 0;
    defender.position = 2; // adjacent → melee → retaliation possible
    defender.maxHealth = 20;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    const after = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id })
    );
    return after.combat!.units.unit_p1_marksmen.damage;
  }

  it("the attacker provokes no Retaliation when it ignores it (control: it takes 3)", () => {
    expect(retaliationDamageTaken([])).toBe(3); // control: the full retaliation lands
    expect(retaliationDamageTaken(["ignores-retaliation"])).toBe(0); // Steel Elf: none provoked
  });

  it("wires no-retaliation onto the Steel Elf (Pack) while keeping the Few's no-melee-penalty", () => {
    expect(coreUnitDefinitions["bulwark.snow_elves"].pack?.abilities).toEqual([
      "ignore-combat-penalties",
      "ignores-retaliation"
    ]);
    expect(coreUnitDefinitions["bulwark.snow_elves"].few?.abilities).toEqual(["ignore-combat-penalties"]);
  });
});

describe("Bulwark units — Kobold gold income (Pack / Kobold Foreman only)", () => {
  /**
   * Mirrors the Resource-round income loop (engine/adventure.ts startAdventureRound):
   * each army map ability of type MAP_RESOURCE_ROUND_GAIN grants its resource. Tests
   * the OUTCOME (gold actually gained), via the real getArmyMapAbilities consumer,
   * for a player whose only army card is a Kobold of the given side.
   */
  function resourceRoundGold(side: "few" | "pack"): number {
    const state = createInitialGameState();
    state.players.p1.factionId = "bulwark";
    state.players.p1.army = [{ id: "kob", unitDefId: "bulwark.kobolds", side }];
    const before = state.players.p1.resources.gold;
    for (const ability of getArmyMapAbilities(state, "p1")) {
      if (ability.effect.type === "MAP_RESOURCE_ROUND_GAIN") {
        gainResources(state, "p1", { [ability.effect.resource]: ability.effect.amount }, ability.abilityName);
      }
    }
    return state.players.p1.resources.gold - before;
  }

  it("a Kobold Pack earns 1 gold per Resource round; a Kobold Few earns nothing", () => {
    expect(resourceRoundGold("pack")).toBe(1); // Kobold Foreman generates gold
    expect(resourceRoundGold("few")).toBe(0); // Kobold (Few) is a no-op now
  });
});

describe("Bulwark units — Kobold gold PvP / multiplayer scoping", () => {
  it("scopes Kobold gold to its owner: p1 (Pack) earns, p2 (Few) earns nothing", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "bulwark";
    state.players.p2.factionId = "bulwark";
    state.players.p1.army = [{ id: "kob1", unitDefId: "bulwark.kobolds", side: "pack" }];
    state.players.p2.army = [{ id: "kob2", unitDefId: "bulwark.kobolds", side: "few" }];
    const p1Before = state.players.p1.resources.gold;
    const p2Before = state.players.p2.resources.gold;
    for (const pid of ["p1", "p2"] as const) {
      for (const ability of getArmyMapAbilities(state, pid)) {
        if (ability.effect.type === "MAP_RESOURCE_ROUND_GAIN") {
          gainResources(state, pid, { [ability.effect.resource]: ability.effect.amount }, ability.abilityName);
        }
      }
    }
    expect(state.players.p1.resources.gold - p1Before).toBe(1); // Pack owner earns
    expect(state.players.p2.resources.gold - p2Before).toBe(0); // Few owner earns nothing
  });
});
