import { describe, expect, it } from "vitest";

import { MONSTER_SPELLS } from "@/data/anime/monster-spells";
import { RAID_BOSS_ABILITY_CHOICES } from "@/data/anime/bosses";
import { unitAbilities } from "@/data/units/abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  NEUTRAL_PLAYER_ID,
  standardComputerController
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import { effectiveInitiative } from "./active-effects";
import {
  monsterSpellCasters,
  monsterSpellForRound,
  monsterSpellRoundStartHookRegistered,
  monsterSpellTarget
} from "./monster-spells";
import { resolveMonsterSpellRoundStart } from "./reducer";
import { driveComputerPlayers } from "../server/computer-runner";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * PvE monster CASTERS (dungeon/raid-boss variant expansion §A) — the
 * `BOSS_SPELL_ROTATION` arm. Every claim asserts the OBSERVABLE outcome (a
 * damage/attack/hand/health delta, the combat outcome), never "an effect
 * exists", and every claim carries a CONTROL that discriminates the rule.
 *
 * Harness: the combat SANDBOX (empty hands, scripted 0 dice ⇒ damage =
 * attack − defense) for the per-spell effects, plus a real adventure guard
 * fight for the no-stall / byte-silence seams.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function sandbox(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array(80).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

type Shape = {
  controller: PlayerId;
  position: number;
  attack?: number;
  defense?: number;
  maxHealth?: number;
  damage?: number;
  initiative?: number;
  abilities?: string[];
  armyStacks?: number;
};

/**
 * Replace the sandbox's units with exactly the shapes given (keyed by a short
 * handle), so target selection is unambiguous.
 */
function onlyUnits(state: GameState, shapes: Record<string, Shape>): Record<string, CombatUnitState> {
  const units: Record<string, CombatUnitState> = {};
  const made: Record<string, CombatUnitState> = {};
  for (const [handle, shape] of Object.entries(shapes)) {
    const id = `u_${handle}`;
    const unit: CombatUnitState = {
      id,
      controllerId: shape.controller,
      name: handle,
      cardName: handle,
      variant: "few",
      grade: "bronze",
      type: "ground",
      attack: shape.attack ?? 0,
      defense: shape.defense ?? 0,
      maxHealth: shape.maxHealth ?? 30,
      damage: shape.damage ?? 0,
      initiative: shape.initiative ?? 5,
      position: shape.position,
      activatedThisRound: false,
      movedThisActivation: false,
      retaliatedThisRound: false,
      defenseToken: false,
      abilities: shape.abilities ?? [],
      ...(shape.armyStacks !== undefined ? { armyStacks: shape.armyStacks } : {})
    };
    units[id] = unit;
    made[handle] = unit;
  }
  state.combat!.units = units;
  state.combat!.obstacles = [];
  return made;
}

function spellEvents(state: GameState): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
      event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId.startsWith("boss-spell-")
  );
}

/** END_COMBAT_ROUND with the active unit cleared, so the round may end here. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  for (const unit of Object.values(state.combat!.units)) {
    unit.activatedThisRound = true;
  }
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

/** A difficulty-1 neutral guard fight for `fighter`, fully started. */
function guardFight(seed: string, fighter: PlayerId = "p1"): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = fighter;
  state.players[fighter].hand = [];
  const hero = state.heroes[`hero_${fighter}`];
  hero.movementPoints = 8;
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  field!.difficulty = 1;
  startNeutralEncounter(state, hero, field!);
  expect(state.combat?.context.kind).toBe("neutral");
  const army = state.players[fighter].army;
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: fighter, armyUnitId: army[0].id, position: 13 });
  if (army[1]) {
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: fighter, armyUnitId: army[1].id, position: 14 });
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: fighter });
  if (state.combat?.pendingNeutralPlacement) {
    state = applyOk(state, {
      type: "FINISH_NEUTRAL_PLACEMENT",
      playerId: state.combat.pendingNeutralPlacement
    });
  }
  state.combat!.dice.scriptedRolls = Array(80).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

// ---------------------------------------------------------------------------
// Data + wiring hygiene
// ---------------------------------------------------------------------------

describe("Monster spells — data & wiring", () => {
  it("the four carrying abilities are implemented, rotate real spells, and are designer-pickable", () => {
    for (const id of [
      "boss-spell-necrotic",
      "boss-spell-frost",
      "boss-spell-infernal",
      "boss-spell-mindflay"
    ]) {
      const ability = unitAbilities[id];
      expect(ability, id).toBeDefined();
      expect(ability.implementationStatus, id).toBe("implemented");
      expect(ability.effect?.type, id).toBe("BOSS_SPELL_ROTATION");
      if (ability.effect?.type !== "BOSS_SPELL_ROTATION") {
        throw new Error("unreachable");
      }
      expect(ability.effect.spells.length, id).toBeGreaterThan(0);
      for (const spellId of ability.effect.spells) {
        expect(MONSTER_SPELLS[spellId], `${id} → ${spellId}`).toBeDefined();
        // CLAUDE.md §2: the printed text quotes exactly the spells that run.
        expect(ability.text).toContain(MONSTER_SPELLS[spellId].name);
        expect(ability.text).toContain(MONSTER_SPELLS[spellId].text);
      }
      expect(RAID_BOSS_ABILITY_CHOICES, id).toContain(id);
    }
  });

  it("reducer.ts registers the round-start resolver for adventure-reducer's combat-start call site", () => {
    // The two call sites live in different modules and the reducer→adventure-reducer
    // import edge is one-way, so the hook is what carries the combat-start pass.
    expect(monsterSpellRoundStartHookRegistered()).toBe(true);
  });

  it("the rotation index is (round − 1) % spells.length — pure, no RNG", () => {
    const caster = onlyUnits(sandbox("rotation-pure"), {
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-necrotic"] }
    }).boss;
    const expected = ["shadow_bolt", "siphon_thought", "mend_flesh"];
    for (let round = 1; round <= 7; round += 1) {
      expect(monsterSpellForRound(caster, round)?.id, `round ${round}`).toBe(
        expected[(round - 1) % expected.length]
      );
    }
    // CONTROL: a unit with no rotation ability never casts.
    caster.abilities = [];
    expect(monsterSpellForRound(caster, 1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 1–2. shadow_bolt: targeting and the spell-damage gate order
// ---------------------------------------------------------------------------

describe("Monster spells — shadow_bolt", () => {
  it("hits the TOUGHEST living enemy for exactly 2, and no other unit", () => {
    const state = sandbox("bolt-toughest");
    const units = onlyUnits(state, {
      // Toughest by REMAINING health (10 − 4 = 6) — not by printed maxHealth,
      // which the frail one wins (12 − 9 = 3).
      tough: { controller: "p1", position: 5, maxHealth: 10, damage: 4 },
      frail: { controller: "p1", position: 6, maxHealth: 12, damage: 9 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-infernal"] }
    });
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);

    expect(units.tough.damage, "the toughest unit took the bolt").toBe(6);
    expect(units.frail.damage, "…and nobody else did").toBe(9);
    // The pure planner agrees with what the reducer did (one shared reading).
    expect(monsterSpellTarget(state.combat!, units.boss, MONSTER_SPELLS.shadow_bolt)?.id).toBe(
      units.tough.id
    );
  });

  it("is reduced, capped by all-school immunity, and NOT stopped by a single-school immunity", () => {
    const run = (abilities: string[]): { damage: number; log: string } => {
      const state = sandbox(`bolt-gate-${abilities.join("-") || "plain"}`);
      const units = onlyUnits(state, {
        target: { controller: "p1", position: 5, maxHealth: 20, abilities },
        boss: { controller: "p2", position: 1, abilities: ["boss-spell-infernal"] }
      });
      state.combat!.round = 1;
      resolveMonsterSpellRoundStart(state);
      return {
        damage: units.target.damage,
        log: spellEvents(state)
          .map((event) => event.message)
          .join(" | ")
      };
    };

    // CONTROL: a plain unit takes the printed 2.
    expect(run([]).damage).toBe(2);
    // "Reduce any damage from spells by 2" cancels it outright.
    expect(run(["reduce-spell-damage-2"]).damage).toBe(0);
    // Immunity to ALL spells blocks it and says so.
    const immune = run(["immune-all-spells"]);
    expect(immune.damage).toBe(0);
    expect(immune.log).toContain("immune to Spells");
    // A SINGLE-school immunity does not — the bolt is school-less ("any").
    expect(run(["phoenix-fire-immunity"]).damage).toBe(2);
  });

  it("a lethal bolt ends the combat before any activation opens", () => {
    const state = sandbox("bolt-lethal");
    const units = onlyUnits(state, {
      lastone: { controller: "p1", position: 5, maxHealth: 2 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-infernal"] }
    });
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);

    expect(units.lastone.damage).toBe(2);
    expect(state.combat!.outcome?.winnerPlayerId, "the fight is already over").toBe("p2");
    // CONTROL: with one more health the bolt is survivable and nothing ends.
    const survives = sandbox("bolt-lethal-control");
    const alive = onlyUnits(survives, {
      lastone: { controller: "p1", position: 5, maxHealth: 3 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-infernal"] }
    });
    survives.combat!.round = 1;
    resolveMonsterSpellRoundStart(survives);
    expect(alive.lastone.damage).toBe(2);
    expect(survives.combat!.outcome).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. The rotation across REAL combat rounds
// ---------------------------------------------------------------------------

describe("Monster spells — rotation across real combat rounds", () => {
  it("rounds 1/2/3/4 resolve bolt → drain → heal → bolt again (real END_COMBAT_ROUND actions)", () => {
    let state = sandbox("rotation-live");
    const units = onlyUnits(state, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: { controller: "p2", position: 1, maxHealth: 20, damage: 5, abilities: ["boss-spell-necrotic"] }
    });
    state.players.p1.hand = ["ability.tactics", "ability.scouting"];

    // Round 1 — Shadow Bolt (the combat-start slot the adventure pass fires).
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);
    expect(state.combat!.units[units.target.id].damage, "round 1 bolt").toBe(2);
    expect(state.players.p1.hand.length, "round 1 drains nothing").toBe(2);

    // Round 2 — Siphon Thought.
    state = endRound(state, "p1");
    expect(state.combat!.round).toBe(2);
    expect(state.combat!.units[units.target.id].damage, "round 2 deals no damage").toBe(2);
    expect(state.players.p1.hand.length, "round 2 drained a card").toBe(1);

    // Round 3 — Mend Flesh.
    state = endRound(state, "p1");
    expect(state.combat!.round).toBe(3);
    expect(state.combat!.units[units.boss.id].damage, "round 3 healed the caster 2").toBe(3);
    expect(state.players.p1.hand.length, "round 3 drains nothing").toBe(1);

    // Round 4 — the rotation WRAPS back to Shadow Bolt.
    state = endRound(state, "p1");
    expect(state.combat!.round).toBe(4);
    expect(state.combat!.units[units.target.id].damage, "round 4 bolt (wrapped)").toBe(4);

    // CONTROL: an identical fight with NO rotation ability never moves anything.
    let control = sandbox("rotation-live-control");
    const plain = onlyUnits(control, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: { controller: "p2", position: 1, maxHealth: 20, damage: 5 }
    });
    control.players.p1.hand = ["ability.tactics", "ability.scouting"];
    control.combat!.round = 1;
    resolveMonsterSpellRoundStart(control);
    control = endRound(control, "p1");
    control = endRound(control, "p1");
    control = endRound(control, "p1");
    expect(control.combat!.units[plain.target.id].damage).toBe(0);
    expect(control.combat!.units[plain.boss.id].damage).toBe(5);
    expect(control.players.p1.hand.length).toBe(2);
    expect(control.combat!.monsterSpells, "no bookkeeping is even created").toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. withering_curse — the OBSERVABLE attack-damage drop
// ---------------------------------------------------------------------------

describe("Monster spells — withering_curse", () => {
  it("a cursed unit deals exactly 1 less attack damage than the same attack uncursed", () => {
    const damageDealt = (cursed: boolean): number => {
      const state = sandbox(`curse-${cursed}`);
      const units = onlyUnits(state, {
        hitter: { controller: "p1", position: 5, attack: 5, initiative: 9 },
        dummy: { controller: "p2", position: 9, maxHealth: 40, defense: 0 },
        // The Rime Chant's round-2 slot IS Withering Curse.
        boss: {
          controller: "p2",
          position: 1,
          maxHealth: 40,
          abilities: cursed ? ["boss-spell-frost"] : []
        }
      });
      state.combat!.round = 2;
      resolveMonsterSpellRoundStart(state);
      state.combat!.activeUnitId = units.hitter.id;
      state.activePlayerId = "p1";
      const after = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: units.hitter.id,
        defenderId: units.dummy.id
      });
      return after.combat!.units[units.dummy.id].damage;
    };

    // CONTROL first: the uncursed baseline.
    const baseline = damageDealt(false);
    expect(baseline).toBe(5);
    expect(damageDealt(true), "the curse really lowers resolved damage").toBe(baseline - 1);
  });

  it("ward_of_ash raises the CASTER side's Defense, so the same blow lands for 1 less", () => {
    const damageDealt = (warded: boolean): number => {
      const state = sandbox(`ward-${warded}`);
      const units = onlyUnits(state, {
        hitter: { controller: "p1", position: 5, attack: 5, initiative: 9 },
        dummy: { controller: "p2", position: 9, maxHealth: 40, defense: 0 },
        // Round 3 of the Rime Chant is Ward of Ash (+1 Defense to its own side).
        boss: {
          controller: "p2",
          position: 1,
          maxHealth: 40,
          abilities: warded ? ["boss-spell-frost"] : []
        }
      });
      state.combat!.round = 3;
      resolveMonsterSpellRoundStart(state);
      state.combat!.activeUnitId = units.hitter.id;
      state.activePlayerId = "p1";
      const after = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: units.hitter.id,
        defenderId: units.dummy.id
      });
      return after.combat!.units[units.dummy.id].damage;
    };
    expect(damageDealt(false)).toBe(5);
    expect(damageDealt(true)).toBe(4);
  });

  it("chill_of_the_deep debuffs the FASTEST living enemy only", () => {
    const state = sandbox("chill");
    const units = onlyUnits(state, {
      swift: { controller: "p1", position: 6, initiative: 8 },
      slow: { controller: "p1", position: 5, initiative: 3 },
      // Round 1 of the Rime Chant is Chill of the Deep.
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-frost"] }
    });
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);

    // The OBSERVABLE outcome: the fastest unit's effective Initiative really
    // drops by 2, and the slow one is untouched.
    expect(effectiveInitiative(units.swift, state.activeEffects, state.combat!)).toBe(6);
    expect(effectiveInitiative(units.slow, state.activeEffects, state.combat!)).toBe(3);
    expect(monsterSpellTarget(state.combat!, units.boss, MONSTER_SPELLS.chill_of_the_deep)?.id).toBe(
      units.swift.id
    );

    // CONTROL: with no rotation ability nothing moves.
    const control = sandbox("chill-control");
    const plain = onlyUnits(control, {
      swift: { controller: "p1", position: 6, initiative: 8 },
      slow: { controller: "p1", position: 5, initiative: 3 },
      boss: { controller: "p2", position: 1 }
    });
    control.combat!.round = 1;
    resolveMonsterSpellRoundStart(control);
    expect(effectiveInitiative(plain.swift, control.activeEffects, control.combat!)).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 5–6. mend_flesh and siphon_thought
// ---------------------------------------------------------------------------

describe("Monster spells — mend_flesh / siphon_thought", () => {
  it("mend_flesh heals the caster's damage and NEVER restores a lost health bar", () => {
    const state = sandbox("mend");
    const units = onlyUnits(state, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      // A wounded boss standing on its last-but-one bar.
      boss: {
        controller: "p2",
        position: 1,
        maxHealth: 4,
        damage: 2,
        armyStacks: 1,
        abilities: ["boss-spell-necrotic"]
      }
    });
    state.combat!.round = 3; // Mend Flesh's slot
    resolveMonsterSpellRoundStart(state);
    expect(units.boss.damage, "healed to full on the current bar").toBe(0);
    expect(units.boss.armyStacks, "the shed-bar count is untouched").toBe(1);

    // CONTROL: an UNWOUNDED caster heals nothing and gains no bar.
    const control = sandbox("mend-control");
    const fresh = onlyUnits(control, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: {
        controller: "p2",
        position: 1,
        maxHealth: 4,
        damage: 0,
        armyStacks: 1,
        abilities: ["boss-spell-necrotic"]
      }
    });
    control.combat!.round = 3;
    resolveMonsterSpellRoundStart(control);
    expect(fresh.boss.damage).toBe(0);
    expect(fresh.boss.armyStacks).toBe(1);
  });

  it("siphon_thought moves exactly 1 card from the fighter's hand to their discard; an empty hand is a clean no-op", () => {
    const state = sandbox("siphon");
    onlyUnits(state, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-necrotic"] }
    });
    state.players.p1.hand = ["ability.tactics", "ability.scouting"];
    const discardBefore = state.players.p1.discard.length;
    state.combat!.round = 2; // Siphon Thought's slot
    resolveMonsterSpellRoundStart(state);
    expect(state.players.p1.hand.length).toBe(1);
    expect(state.players.p1.discard.length).toBe(discardBefore + 1);
    // The CASTER's own side never loses a card.
    expect(state.players.p2.hand.length).toBe(0);

    // Empty hand: no crash, exactly ONE feed line, nothing moved.
    const empty = sandbox("siphon-empty");
    onlyUnits(empty, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-necrotic"] }
    });
    empty.players.p1.hand = [];
    const before = empty.players.p1.discard.length;
    empty.combat!.round = 2;
    resolveMonsterSpellRoundStart(empty);
    expect(empty.players.p1.discard.length).toBe(before);
    expect(spellEvents(empty).length, "no event spam").toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Idempotence (finalizeCombatStart is re-entrant)
// ---------------------------------------------------------------------------

describe("Monster spells — idempotence", () => {
  it("a second pass in the same round changes nothing", () => {
    const state = sandbox("idempotent");
    const units = onlyUnits(state, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-infernal"] }
    });
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);
    const damageAfterFirst = units.target.damage;
    const eventsAfterFirst = spellEvents(state).length;
    expect(damageAfterFirst).toBe(2);
    expect(eventsAfterFirst).toBe(1);
    expect(state.combat!.monsterSpells?.fired).toEqual([`${units.boss.id}#1`]);

    resolveMonsterSpellRoundStart(state);
    resolveMonsterSpellRoundStart(state);
    expect(units.target.damage, "no second bolt").toBe(damageAfterFirst);
    expect(spellEvents(state).length, "no second feed line").toBe(eventsAfterFirst);

    // CONTROL: the NEXT round is a different key, so it does fire again.
    state.combat!.round = 2;
    resolveMonsterSpellRoundStart(state);
    expect(spellEvents(state).length).toBe(eventsAfterFirst + 1);
  });
});

// ---------------------------------------------------------------------------
// 8 + 11. No stall, no window — and byte-silence on a plain fight
// ---------------------------------------------------------------------------

describe("Monster spells — no stall, and silence off the PvE path", () => {
  it("the pass opens no window, no pendingChoice and no reaction window", () => {
    const state = sandbox("no-window");
    onlyUnits(state, {
      target: { controller: "p1", position: 5, maxHealth: 40 },
      boss: { controller: "p2", position: 1, abilities: ["boss-spell-necrotic"] }
    });
    state.players.p1.hand = ["ability.tactics"];
    for (const round of [1, 2, 3, 4]) {
      state.combat!.round = round;
      resolveMonsterSpellRoundStart(state);
      expect(state.pendingChoice, `round ${round}`).toBeNull();
      expect(state.reactionWindow, `round ${round}`).toBeNull();
      expect(state.stack.length, `round ${round}`).toBe(0);
    }
  });

  it("a COMPUTER seat fights a caster guard to a finish without stalling", () => {
    const state = guardFight("caster-drive", "p2");
    state.controllers = { p2: standardComputerController() };
    const guards = Object.values(state.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    const fighters = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p2");
    expect(guards.length).toBeGreaterThan(0);
    expect(fighters.length).toBeGreaterThan(0);
    // One caster guard, one overwhelming attacker: the fight must still finish.
    const guard = guards[0];
    guard.abilities = ["boss-spell-necrotic"];
    guard.position = 5;
    guard.initiative = 1;
    guard.attack = 1;
    guard.maxHealth = 3;
    guard.damage = 0;
    const attacker = fighters[0];
    attacker.position = 9;
    attacker.initiative = 99;
    attacker.attack = 30;
    attacker.maxHealth = 40;
    attacker.damage = 0;
    attacker.abilities = [];
    const units: Record<string, CombatUnitState> = { [guard.id]: guard, [attacker.id]: attacker };
    state.combat!.units = units;
    state.combat!.activeUnitId = attacker.id;
    state.activePlayerId = "p2";
    state.combat!.dice.scriptedRolls = Array(80).fill(0);
    state.combat!.dice.rollCount = 0;

    const run = driveComputerPlayers(state);
    expect(run.stalled, run.reason).toBe(false);
    expect(
      run.state.eventLog.some((event) => event.type === "COMBAT_ENDED"),
      "the fight reached an outcome"
    ).toBe(true);
  });

  it("CONTROL: a plain neutral guard fight appends no monster-spell event and creates no bookkeeping", () => {
    const state = guardFight("plain-guard");
    expect(monsterSpellCasters(state.combat!)).toEqual([]);
    expect(spellEvents(state)).toEqual([]);
    expect(state.combat!.monsterSpells).toBeUndefined();
    // …and an explicit pass is a no-op that appends nothing.
    const before = state.eventLog.length;
    resolveMonsterSpellRoundStart(state);
    expect(state.eventLog.length).toBe(before);
    expect(state.combat!.monsterSpells).toBeUndefined();
  });
});
