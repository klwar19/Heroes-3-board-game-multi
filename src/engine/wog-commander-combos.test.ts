import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMANDER_COMBOS,
  COMMANDER_SLUGS,
  COMMANDER_STAT_ICON,
  COMMANDER_STAT_KEYS,
  commanderComboSiteIcon,
  commanderComboUnlocked,
  commanderDefinitions,
  type CommanderGrades,
  type CommanderSlug,
  type CommanderStatKey
} from "@/data/commanders";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState, makeCommanderCombatUnit, commanderUnitId } from "./index";
import type { GameAction, GameState } from "./state";

// ===========================================================================
// The 15 WoG combination skills (board adaptation): one skill per stat pair,
// unlocked once ONE stat of the pair is grade 3 and the OTHER at least 2.
// Death Stare and Charge keep their pre-existing wiring (pinned in
// wog-commanders.test.ts) — this file covers the unlock rule, the data
// integrity, and the observable combat behaviour of the other thirteen.
// ===========================================================================

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyError(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be rejected").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

/** Pass reactions / keep rolls until an attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = apply(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function grades(overrides: Partial<Record<CommanderStatKey, number>>): CommanderGrades {
  return { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0, ...overrides } as CommanderGrades;
}

/**
 * Combat sandbox: p1's commander stands at cell 9 with the given grades; the
 * p2 skeletons wait adjacent at 10, stripped, fattened to 20 Health and out
 * of retaliations; every die is scripted to 0.
 */
function comboDuel(overrides: Partial<Record<CommanderStatKey, number>>, slug: CommanderSlug = "paladin"): GameState {
  const state = createInitialGameState();
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false };
  state.players.p1.commander = { slug, grades: grades(overrides) };
  const unit = makeCommanderCombatUnit(state.players.p1, 9);
  if (!unit) {
    throw new Error("expected a commander combat unit");
  }
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.abilities = [];
  skeletons.position = 10;
  skeletons.defense = 0;
  skeletons.maxHealth = 20;
  skeletons.damage = 0;
  skeletons.retaliatedThisRound = true;
  state.combat!.activeUnitId = unit.id;
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

const COMMANDER_ATTACK: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: commanderUnitId("p1"),
  defenderId: "unit_p2_skeletons"
};

/** An enemy unit attacks the commander (activation handed to p2). */
function enemyStrikesCommander(state: GameState, attackerId: string, from: number, attack: number): GameState {
  const attacker = state.combat!.units[attackerId];
  attacker.abilities = [];
  attacker.position = from;
  attacker.attack = attack;
  state.combat!.activeUnitId = attackerId;
  state.activePlayerId = "p2";
  return settle(
    apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId, defenderId: commanderUnitId("p1") })
  );
}

// ===========================================================================
// Data integrity + the unlock rule.
// ===========================================================================

describe("WOG commander combination skills — data", () => {
  it("covers every pair of the six stats exactly once (15 skills)", () => {
    expect(COMMANDER_COMBOS).toHaveLength(15);
    const seen = new Set(
      COMMANDER_COMBOS.map((combo) =>
        [...combo.requires]
          .sort((a, b) => COMMANDER_STAT_KEYS.indexOf(a) - COMMANDER_STAT_KEYS.indexOf(b))
          .join("+")
      )
    );
    expect(seen.size).toBe(15);
    for (let first = 0; first < COMMANDER_STAT_KEYS.length; first += 1) {
      for (let second = first + 1; second < COMMANDER_STAT_KEYS.length; second += 1) {
        const pair = `${COMMANDER_STAT_KEYS[first]}+${COMMANDER_STAT_KEYS[second]}`;
        expect(seen.has(pair), pair).toBe(true);
      }
    }
  });

  it("every combo ability id resolves to an implemented registry entry (Sharpshooter alone is the type flip)", () => {
    for (const combo of COMMANDER_COMBOS) {
      if (combo.id === "can-shoot") {
        expect(combo.abilityId).toBeNull();
        continue;
      }
      expect(combo.abilityId, combo.id).toBeTruthy();
      const registered = unitAbilities[combo.abilityId!];
      expect(registered, `${combo.id} -> ${combo.abilityId}`).toBeTruthy();
      expect(registered.implementationStatus, combo.abilityId!).toBe("implemented");
    }
  });

  it("every combo icon and every commander cast icon exists on disk", () => {
    const missing: string[] = [];
    for (const combo of COMMANDER_COMBOS) {
      if (!existsSync(join(process.cwd(), "public", combo.icon))) {
        missing.push(`${combo.id} -> ${combo.icon}`);
      }
    }
    for (const slug of COMMANDER_SLUGS) {
      const icon = commanderDefinitions[slug].cast.icon;
      if (!existsSync(join(process.cwd(), "public", icon))) {
        missing.push(`${slug} cast -> ${icon}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("ships the authentic WoG comm3 symbols the stats UI uses (6 stat + 15 combo)", () => {
    const missing: string[] = [];
    for (const key of COMMANDER_STAT_KEYS) {
      const icon = COMMANDER_STAT_ICON[key];
      if (!existsSync(join(process.cwd(), "public", icon))) {
        missing.push(`stat ${key} -> ${icon}`);
      }
    }
    for (const combo of COMMANDER_COMBOS) {
      const icon = commanderComboSiteIcon(combo.tag);
      if (!existsSync(join(process.cwd(), "public", icon))) {
        missing.push(`combo [${combo.tag}] ${combo.id} -> ${icon}`);
      }
    }
    expect(missing).toEqual([]);
    // Every combo tag is distinct, so each maps to its own site symbol.
    expect(new Set(COMMANDER_COMBOS.map((combo) => combo.tag)).size).toBe(COMMANDER_COMBOS.length);
  });

  it("unlocks with grade 3 + grade 2 in EITHER orientation, never below", () => {
    const deathStare = COMMANDER_COMBOS.find((combo) => combo.id === "death-stare")!;
    expect(commanderComboUnlocked(grades({ damage: 3, magic: 2 }), deathStare)).toBe(true);
    expect(commanderComboUnlocked(grades({ damage: 2, magic: 3 }), deathStare)).toBe(true);
    expect(commanderComboUnlocked(grades({ damage: 3, magic: 3 }), deathStare)).toBe(true);
    // Below the bar: 3+1, 2+2 and 3+0 all stay locked.
    expect(commanderComboUnlocked(grades({ damage: 3, magic: 1 }), deathStare)).toBe(false);
    expect(commanderComboUnlocked(grades({ damage: 2, magic: 2 }), deathStare)).toBe(false);
    expect(commanderComboUnlocked(grades({ damage: 3 }), deathStare)).toBe(false);
  });
});

// ===========================================================================
// Combat behaviour of the thirteen newly-wired skills (with a locked CONTROL
// one grade below the threshold for each).
// ===========================================================================

describe("WOG commander combination skills — combat behaviour", () => {
  it("Sharpshooter (ATK+SPD): the commander becomes ranged and strikes a distant enemy", () => {
    const state = comboDuel({ attack: 3, speed: 2 });
    // Nobody adjacent (an engaged shooter must fire at its neighbour): the
    // skeletons step away, the dread knights wait across the board.
    state.combat!.units.unit_p2_skeletons.position = 19;
    const distant = state.combat!.units.unit_p2_dread_knights;
    distant.abilities = [];
    distant.position = 18; // far from cell 9
    distant.defense = 0;
    distant.maxHealth = 20;
    distant.damage = 0;
    distant.retaliatedThisRound = true;
    expect(state.combat!.units[commanderUnitId("p1")].type).toBe("ranged");
    const next = settle(
      apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: commanderUnitId("p1"), defenderId: "unit_p2_dread_knights" })
    );
    expect(next.combat!.units.unit_p2_dread_knights.damage).toBe(5); // attack 5, die 0

    // CONTROL: speed grade 1 → still a ground unit; the distant strike is illegal.
    const control = comboDuel({ attack: 3, speed: 1 });
    const far = control.combat!.units.unit_p2_dread_knights;
    far.abilities = [];
    far.position = 18;
    expect(control.combat!.units[commanderUnitId("p1")].type).toBe("ground");
    applyError(control, { type: "ATTACK_UNIT", playerId: "p1", attackerId: commanderUnitId("p1"), defenderId: "unit_p2_dread_knights" });
  });

  it('Mighty Blow (ATK+DMG): the commander\'s own Attack die always counts as "+1"', () => {
    // Main die "-1" is floored to +1; the two Damage-grade Might dice ('+1'
    // each) then add 2: (attack 5 + 1) + Might 2 = 8 damage.
    let state = comboDuel({ attack: 3, damage: 2 });
    state.combat!.dice.scriptedRolls = [-1, 1, 1];
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(8);

    // CONTROL: damage grade 1 → Mighty Blow is NOT unlocked, so the main "-1"
    // stands and the single Might die ('+1') adds 1: (5 - 1) + 1 = 5.
    let control = comboDuel({ attack: 3, damage: 1 });
    control.combat!.dice.scriptedRolls = [-1, 1];
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(5);
  });

  it("Crushing Strike (ATK+DEF): the target's Defense counts 2 lower against the commander", () => {
    let state = comboDuel({ attack: 3, defense: 2 });
    state.combat!.units.unit_p2_skeletons.defense = 2;
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(5); // 5 + 0 - (2-2)

    // CONTROL: defense grade 1 → the printed Defense 2 holds: 5 - 2 = 3.
    let control = comboDuel({ attack: 3, defense: 1 });
    control.combat!.units.unit_p2_skeletons.defense = 2;
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it('Fearsome (ATK+HP): a "-1" on the commander\'s Attack die freezes the target with Paralysis', () => {
    let state = comboDuel({ attack: 3, health: 2 });
    state.combat!.dice.scriptedRolls = [-1];
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.tokens?.some((token) => token.kind === "paralysis")).toBe(true);

    // CONTROL: health grade 1 → the same "-1" terrifies nobody.
    let control = comboDuel({ attack: 3, health: 1 });
    control.combat!.dice.scriptedRolls = [-1];
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.tokens?.some((token) => token.kind === "paralysis") ?? false).toBe(false);
  });

  it("No Enemy Retaliation (ATK+MAG): the commander's attacks never provoke retaliation", () => {
    let state = comboDuel({ attack: 3, magic: 2 });
    state.combat!.units.unit_p2_skeletons.retaliatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.attack = 2; // would deal 1 through Defense 1
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units[commanderUnitId("p1")].damage).toBe(0);

    // CONTROL: magic grade 1 → the skeletons strike back for 1.
    let control = comboDuel({ attack: 3, magic: 1 });
    control.combat!.units.unit_p2_skeletons.retaliatedThisRound = false;
    control.combat!.units.unit_p2_skeletons.attack = 2;
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units[commanderUnitId("p1")].damage).toBe(1);
  });

  it("Endless Retaliation (DEF+HP): the commander retaliates against every attack in a round", () => {
    function doubleAssault(overrides: Partial<Record<CommanderStatKey, number>>): GameState {
      let state = comboDuel(overrides);
      state.combat!.units.unit_p2_skeletons.retaliatedThisRound = true; // irrelevant here
      // First attacker: the skeletons from 10 — the commander retaliates (2 damage).
      state = enemyStrikesCommander(state, "unit_p2_skeletons", 10, 5);
      // Second attacker: the vampires from 13, in the same round.
      const vampires = state.combat!.units.unit_p2_vampires;
      vampires.defense = 0;
      vampires.maxHealth = 20;
      vampires.damage = 0;
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      return enemyStrikesCommander(state, "unit_p2_vampires", 13, 5);
    }

    // Defense grade 3 (Defense 4) + Health grade 2 (6 HP): both attackers eat
    // a 2-damage retaliation.
    const endless = doubleAssault({ defense: 3, health: 2 });
    expect(endless.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(endless.combat!.units.unit_p2_vampires.damage).toBe(2);

    // CONTROL: health grade 1 → the single retaliation is spent on the first
    // attacker; the vampires walk in unpunished.
    const single = doubleAssault({ defense: 3, health: 1 });
    expect(single.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(single.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("Whirlwind Strike (DEF+DMG): after its attack the commander strikes every other adjacent enemy", () => {
    function withFlanker(overrides: Partial<Record<CommanderStatKey, number>>): GameState {
      const state = comboDuel(overrides);
      const vampires = state.combat!.units.unit_p2_vampires;
      vampires.abilities = [];
      vampires.position = 13; // adjacent to the commander at 9
      vampires.defense = 0;
      vampires.maxHealth = 20;
      vampires.damage = 0;
      vampires.retaliatedThisRound = true;
      // Each strike (the target, then the Whirlwind follow-up) rolls main die 0
      // and its Damage-grade Might dice — scripted '+1' so Might adds its full
      // grade (2) to every strike.
      state.combat!.dice.scriptedRolls = [0, 1, 1, 0, 1, 1];
      return settle(apply(state, COMMANDER_ATTACK));
    }

    // Attack 2 + Might 2 = 4 on the target AND on the adjacent vampires.
    const whirlwind = withFlanker({ defense: 3, damage: 2 });
    expect(whirlwind.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(whirlwind.combat!.units.unit_p2_vampires.damage).toBe(4);

    // CONTROL: damage grade 1 → only the declared target is hit (2 + 1 = 3).
    const control = withFlanker({ defense: 3, damage: 1 });
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(control.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("Fire Shield (DEF+MAG): an adjacent attacker burns for 1 after striking the commander", () => {
    function strikeInto(overrides: Partial<Record<CommanderStatKey, number>>): GameState {
      const state = comboDuel(overrides);
      state.combat!.units[commanderUnitId("p1")].retaliatedThisRound = true; // isolate the burn
      return enemyStrikesCommander(state, "unit_p2_skeletons", 10, 4);
    }

    // Defense grade 3 = 3 → attack 4 lands 1; the Fire Shield burns the
    // attacker for 1.
    const shielded = strikeInto({ defense: 3, magic: 2 });
    expect(shielded.combat!.units[commanderUnitId("p1")].damage).toBe(1);
    expect(shielded.combat!.units.unit_p2_skeletons.damage).toBe(1);

    // CONTROL: magic grade 1 → no burn.
    const control = strikeInto({ defense: 3, magic: 1 });
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it('Block (DEF+SPD): on a "-1" defensive die the incoming attack is fully blocked', () => {
    function assault(overrides: Partial<Record<CommanderStatKey, number>>): GameState {
      const state = comboDuel(overrides);
      state.combat!.units[commanderUnitId("p1")].retaliatedThisRound = true;
      // Attack die 0 first, then the Block die comes up "-1".
      state.combat!.dice.scriptedRolls = [0, -1];
      return enemyStrikesCommander(state, "unit_p2_skeletons", 10, 9);
    }

    // Attack 9 vs Defense 4 would deal 5 — lethal to the 4-HP commander — but
    // the Block die swallows it whole.
    const blocked = assault({ defense: 3, speed: 2 });
    expect(blocked.combat!.units[commanderUnitId("p1")].damage).toBe(0);

    // CONTROL: speed grade 1 → no Block roll; the commander is struck down.
    const control = assault({ defense: 3, speed: 1 });
    expect(control.combat!.units[commanderUnitId("p1")].damage).toBeGreaterThanOrEqual(
      control.combat!.units[commanderUnitId("p1")].maxHealth
    );
  });

  it("Double Strike (HP+DMG): the commander strikes the target a second time", () => {
    // Two strikes, each main die 0 + two Might dice ('+1'): (2 + Might 2) × 2 = 8.
    let state = comboDuel({ health: 3, damage: 2 });
    state.combat!.dice.scriptedRolls = [0, 1, 1, 0, 1, 1];
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(8);

    // CONTROL: damage grade 1 → Double Strike is NOT unlocked, so a single
    // strike (2 + Might 1 = 3).
    let control = comboDuel({ health: 3, damage: 1 });
    control.combat!.dice.scriptedRolls = [0, 1];
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it('Paralyzing Touch (HP+MAG): a follow-up die on "0" Paralyzes the target', () => {
    let state = comboDuel({ health: 3, magic: 2 });
    state.combat!.dice.scriptedRolls = [0, 0]; // attack die, then the touch die
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.tokens?.some((token) => token.kind === "paralysis")).toBe(true);

    // CONTROL: magic grade 1 → no follow-up roll, no Paralysis.
    let control = comboDuel({ health: 3, magic: 1 });
    control.combat!.dice.scriptedRolls = [0, 0];
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.tokens?.some((token) => token.kind === "paralysis") ?? false).toBe(false);
  });

  it("Regeneration (HP+SPD): the commander heals 1 damage when it activates", () => {
    function activateCommander(overrides: Partial<Record<CommanderStatKey, number>>): GameState {
      const state = comboDuel(overrides);
      const commander = state.combat!.units[commanderUnitId("p1")];
      commander.damage = 2;
      // Leave only the griffins (active) and the commander un-activated: ending
      // the griffins' activation advances straight to the commander and fires
      // its activation-start abilities.
      for (const unit of Object.values(state.combat!.units)) {
        unit.activatedThisRound = unit.id !== commander.id && unit.id !== "unit_p1_griffins";
      }
      state.combat!.activeUnitId = "unit_p1_griffins";
      state.activePlayerId = "p1";
      return apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    }

    const healed = activateCommander({ health: 3, speed: 2 });
    expect(healed.combat!.units[commanderUnitId("p1")].damage).toBe(1);

    // CONTROL: speed grade 1 → the damage stays.
    const control = activateCommander({ health: 3, speed: 1 });
    expect(control.combat!.units[commanderUnitId("p1")].damage).toBe(2);
  });

  it("Battle Teleport (MAG+SPD): a regular move may land on ANY empty space", () => {
    // Cell 3 sits 4 orthogonal steps from 9 — outside the normal 3-space move.
    let state = comboDuel({ magic: 3, speed: 2 });
    state = apply(state, { type: "MOVE_UNIT", playerId: "p1", unitId: commanderUnitId("p1"), destination: 3 });
    expect(state.combat!.units[commanderUnitId("p1")].position).toBe(3);

    // CONTROL: speed grade 1 → the same far move is rejected.
    const control = comboDuel({ magic: 3, speed: 1 });
    applyError(control, { type: "MOVE_UNIT", playerId: "p1", unitId: commanderUnitId("p1"), destination: 3 });
  });
});
