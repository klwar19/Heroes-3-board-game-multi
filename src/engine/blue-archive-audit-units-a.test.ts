import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { applyCombatStartUnitAbilities } from "./adventure-reducer";
import { getOrthogonalNeighbors, getReachableDestinations } from "./battlefield";
import { maybeOpenKivotosCombatStartChoice } from "./reducer";
import type { GameAction, GameState } from "./state";

/**
 * Blue Archive audit, batch 1 (Mika, Seia, Nagisa, Aris, Kei, Hoshino, Shiroko,
 * Hina, Yuuka) — OUTCOME tests for the abilities the existing suite left
 * uncovered or covered only by intermediate data (event counts / flags).
 *
 * Every spec asserts an observable game outcome (damage, hand size, a board
 * position, an offer present / absent) against a CONTROL where the printed
 * condition is unmet. Specs marked "AUTHORED TEXT" assert the user-authored
 * `abilityText` in `src/data/anime/blue-archive-content.ts` where it diverges
 * from the engine — those are EXPECTED to fail until the engine (or the text)
 * moves, and are reported as suspected bugs.
 *
 * Sandbox board (4 columns x 5 rows), positions 0-19:
 *    0  1  2  3 / 4  5  6  7 / 8  9 10 11 / 12 13 14 15 / 16 17 18 19
 * Units: p1 marksmen@1 (ranged), griffins@5 (flying), crusaders@6 (ground);
 *        p2 skeletons@13 (ground), vampires@14 (flying), dread_knights@18 (ground).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 60; safety > 0 && current.reactionWindow; safety -= 1) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** A clean two-unit duel: every other unit's abilities are stripped so nothing else fires. */
function duel(seed: string): GameState {
  const state = createInitialGameState(seed);
  for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

function attack(state: GameState, playerId: "p1" | "p2", attackerId: string, defenderId: string): GameState {
  return applyOk(state, { type: "ATTACK_UNIT", playerId, attackerId, defenderId });
}

describe("Blue Archive audit (batch 1) — outcome tests", () => {
  // ─── Mika ──────────────────────────────────────────────────────────────────
  it("Piercing Judgment rerolls a -1 only when Mika MOVED before attacking, and the reroll changes the damage", () => {
    const run = (moved: boolean, abilityId: string | null) => {
      let state = duel(`piercing-${moved}-${abilityId}`);
      const mika = state.combat!.units.unit_p1_crusaders;
      const target = state.combat!.units.unit_p2_skeletons;
      mika.abilities = abilityId ? [abilityId] : [];
      mika.attack = 3;
      mika.position = 9;
      mika.movedThisActivation = moved;
      target.position = 13; // adjacent to 9
      target.defense = 1;
      target.defenseToken = false;
      target.damage = 0;
      target.maxHealth = 30;
      target.attack = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = mika.id;
      state.combat!.dice.scriptedRolls = [-1, 1, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = attack(state, "p1", mika.id, target.id);
      const offered = state.pendingChoice?.type === "ATTACK_DIE_REROLL";
      if (offered) {
        const choice = state.pendingChoice!;
        state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: choice.id });
        const reroll = state.pendingChoice;
        if (!reroll || reroll.type !== "ATTACK_DIE_REROLL") throw new Error("Expected the reroll window to stay open.");
        state = applyOk(state, {
          type: "CHOOSE_PENDING_ROLL",
          playerId: "p1",
          choiceId: reroll.id,
          candidateIndex: reroll.candidates.length - 1
        });
      }
      state = settle(state);
      return { offered, damage: state.combat!.units[target.id].damage };
    };

    // Moved + ability: the -1 is rerolled into a +1 → 3 + 1 − 1 = 3 damage.
    expect(run(true, "kivotos-piercing-judgment")).toEqual({ offered: true, damage: 3 });
    // CONTROL — did NOT move: no reroll, the -1 stands → 3 − 1 − 1 = 1 damage.
    expect(run(false, "kivotos-piercing-judgment")).toEqual({ offered: false, damage: 1 });
    // CONTROL — no ability at all, moved: nothing to reroll with.
    expect(run(true, null)).toEqual({ offered: false, damage: 1 });
  });

  it("Piercing Judgment is never offered on Mika's Retaliation Attack (a [unit_attack] icon)", () => {
    let state = duel("piercing-retaliation");
    const mika = state.combat!.units.unit_p2_skeletons;
    const enemy = state.combat!.units.unit_p1_crusaders;
    mika.abilities = ["kivotos-piercing-judgment"];
    mika.movedThisActivation = true;
    mika.attack = 3;
    mika.position = 13;
    mika.maxHealth = 30;
    enemy.position = 9;
    enemy.attack = 0;
    enemy.defense = 0;
    enemy.maxHealth = 30;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = enemy.id;
    state.combat!.dice.scriptedRolls = [0, -1, 0, 0];
    state.combat!.dice.rollCount = 0;
    state = settle(attack(state, "p1", enemy.id, mika.id));
    expect(state.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    // The retaliation's -1 stood: 3 − 1 − 0 = 2 damage on the enemy.
    expect(state.combat!.units[enemy.id].damage).toBe(2);
  });

  it("AUTHORED TEXT: Kyrie Eleison splashes a second ENEMY — an allied unit next to the target is never a candidate", () => {
    let state = duel("kyrie-enemy-only");
    const mika = state.combat!.units.unit_p1_marksmen;
    const ally = state.combat!.units.unit_p1_griffins;
    const target = state.combat!.units.unit_p2_skeletons;
    mika.abilities = ["kivotos-kyrie-eleison"];
    mika.position = 1;
    target.position = 13;
    target.maxHealth = 40;
    target.damage = 0;
    // The ONLY unit adjacent to the target is Mika's own ally.
    ally.position = 9;
    ally.damage = 0;
    ally.maxHealth = 40;
    state.combat!.units.unit_p2_vampires.position = 3;
    state.combat!.units.unit_p2_dread_knights.position = 19;
    state.combat!.units.unit_p1_crusaders.position = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = mika.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state = settle(attack(state, "p1", mika.id, target.id));

    const candidates =
      state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? state.pendingChoice.candidateUnitIds : [];
    expect(candidates, "an own ally must never be a Kyrie Eleison splash candidate").not.toContain(ally.id);
    expect(state.combat!.units[ally.id].damage).toBe(0);
    // With no legal ENEMY the once-per-combat charge must not be spent either.
    expect(state.combat!.units[mika.id].kivotosKyrieUsedThisCombat).not.toBe(true);
  });

  // ─── Seia ──────────────────────────────────────────────────────────────────
  it("Future Sight is optional (declining keeps it) and spends only ONCE per combat", () => {
    let state = duel("future-sight-once");
    const attacker = state.combat!.units.unit_p1_marksmen;
    const defender = state.combat!.units.unit_p2_skeletons;
    const seia = state.combat!.units.unit_p2_vampires;
    seia.abilities = ["kivotos-future-sight"];
    seia.position = 18;
    attacker.position = 1;
    attacker.attack = 3;
    defender.position = 13;
    defender.defense = 2;
    defender.defenseToken = false;
    defender.maxHealth = 30;
    defender.damage = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    // Dice: attack-1 primary +1 (declined), attack-2 primary +1 then the forced
    // reroll -1, attack-3 primary +1 (no window left).
    state.combat!.dice.scriptedRolls = [1, 1, -1, 1];
    state.combat!.dice.rollCount = 0;

    // Attack 1: Seia's owner DECLINES (keeps the rolled +1 without rerolling).
    state = attack(state, "p1", attacker.id, defender.id);
    expect(state.pendingChoice).toMatchObject({ type: "ATTACK_DIE_REROLL", playerId: "p2" });
    state = settle(applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      candidateIndex: 0
    }));
    expect(state.combat!.units[seia.id].futureSightUsedThisCombat).not.toBe(true);
    expect(state.combat!.units[defender.id].damage).toBe(2); // 3 + 1 − 2

    // Attack 2 (same round, fresh activation): the charge is still there and is USED.
    const a2 = state.combat!.units[attacker.id];
    a2.activatedThisRound = false;
    a2.attackedThisActivation = false;
    a2.attacksThisActivation = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = a2.id;
    state = attack(state, "p1", a2.id, defender.id);
    expect(state.pendingChoice).toMatchObject({ type: "ATTACK_DIE_REROLL", playerId: "p2" });
    state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p2", choiceId: state.pendingChoice!.id });
    const reroll = state.pendingChoice;
    if (!reroll || reroll.type !== "ATTACK_DIE_REROLL") throw new Error("Expected reroll choice.");
    state = settle(applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p2",
      choiceId: reroll.id,
      candidateIndex: reroll.candidates.length - 1
    }));
    expect(state.combat!.units[seia.id].futureSightUsedThisCombat).toBe(true);
    expect(state.combat!.units[defender.id].damage).toBe(2); // rerolled to -1 → 0 more

    // Attack 3: SPENT — no window at all, the +1 lands.
    const a3 = state.combat!.units[attacker.id];
    a3.activatedThisRound = false;
    a3.attackedThisActivation = false;
    a3.attacksThisActivation = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = a3.id;
    state = settle(attack(state, "p1", a3.id, defender.id));
    expect(state.pendingChoice).toBeNull();
    expect(state.combat!.units[defender.id].damage).toBe(4);
  });

  // ─── Nagisa ────────────────────────────────────────────────────────────────
  it("Royal Artillery's follow-up strikes at exactly 3 Attack (not Nagisa's own), and never after an adjacent attack", () => {
    const run = (adjacent: boolean) => {
      let state = duel(`royal-artillery-${adjacent}`);
      const nagisa = state.combat!.units.unit_p1_marksmen;
      const target = state.combat!.units.unit_p2_skeletons;
      const secondary = state.combat!.units.unit_p2_vampires;
      nagisa.abilities = ["kivotos-royal-artillery"];
      nagisa.attack = 6; // printed Pack Attack — the follow-up must NOT use it
      nagisa.position = adjacent ? 9 : 1;
      target.position = 13;
      target.maxHealth = 40;
      target.attack = 0;
      secondary.position = 17;
      secondary.defense = 0;
      secondary.defenseToken = false;
      secondary.damage = 0;
      secondary.maxHealth = 40;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = nagisa.id;
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = settle(attack(state, "p1", nagisa.id, target.id));
      if (state.pendingChoice?.type === "ABILITY_TARGET_CHOICE") {
        state = settle(applyOk(state, {
          type: "CHOOSE_ABILITY_TARGET",
          playerId: "p1",
          choiceId: state.pendingChoice.id,
          targetUnitId: secondary.id
        }));
      }
      return state.combat!.units[secondary.id].damage;
    };
    expect(run(false)).toBe(3); // 3 Attack + 0 die − 0 Defense
    expect(run(true)).toBe(0); // CONTROL: adjacent target → no artillery
  });

  // ─── Aris ──────────────────────────────────────────────────────────────────
  it("Hero Mode removes BOTH ranged penalties on Aris' own attack (adjacent melee shot and long-range shot)", () => {
    const rolled = (state: GameState) =>
      state.eventLog.find((event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation);
    const run = (abilityId: string | null, defenderPosition: number) => {
      let state = duel(`hero-mode-${abilityId}-${defenderPosition}`);
      const aris = state.combat!.units.unit_p1_marksmen;
      const target = state.combat!.units.unit_p2_skeletons;
      aris.abilities = abilityId ? [abilityId] : [];
      aris.type = "ranged";
      aris.position = 1;
      target.position = defenderPosition;
      target.attack = 0;
      target.maxHealth = 30;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = aris.id;
      state.combat!.dice.scriptedRolls = [1, -1, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = settle(attack(state, "p1", aris.id, target.id));
      const event = rolled(state);
      return event?.type === "ATTACK_ROLLED" ? event.rolls.length : -1;
    };
    // Adjacent (position 5 touches 1): the melee penalty rolls two dice — waived by Hero Mode.
    expect(run("kivotos-hero-mode", 5)).toBe(1);
    expect(run(null, 5)).toBe(2);
    // Back row to opposite back row (1 → 17): the long-range penalty — waived too.
    expect(run("kivotos-hero-mode", 17)).toBe(1);
    expect(run(null, 17)).toBe(2);
  });

  it("AUTHORED TEXT: Hero Mode is [unit_passive], so Aris' RETALIATION also ignores the adjacent ranged penalty", () => {
    const run = (abilityId: string | null) => {
      let state = duel(`hero-mode-retaliation-${abilityId}`);
      const aris = state.combat!.units.unit_p2_skeletons;
      const enemy = state.combat!.units.unit_p1_crusaders;
      aris.abilities = abilityId ? [abilityId] : [];
      aris.type = "ranged";
      aris.position = 13;
      aris.maxHealth = 30;
      enemy.position = 9;
      enemy.attack = 0;
      enemy.maxHealth = 30;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = enemy.id;
      state.combat!.dice.scriptedRolls = [0, 1, -1, 0];
      state.combat!.dice.rollCount = 0;
      state = settle(attack(state, "p1", enemy.id, aris.id));
      const event = state.eventLog.find((entry) => entry.type === "ATTACK_ROLLED" && entry.isRetaliation);
      return event?.type === "ATTACK_ROLLED" ? event.rolls.length : -1;
    };
    expect(run(null), "CONTROL: a plain ranged unit retaliating in melee rolls two dice").toBe(2);
    expect(run("kivotos-hero-mode"), "a passive waiver must also cover the retaliation").toBe(1);
  });

  // ─── Kei ───────────────────────────────────────────────────────────────────
  it("System Intrusion ignores a Spell aimed at Kei only on a +1 resistance die", () => {
    const run = (abilityId: string | null, resistanceRoll: number) => {
      let state = duel(`system-intrusion-${abilityId}-${resistanceRoll}`);
      const kei = state.combat!.units.unit_p2_vampires;
      kei.abilities = abilityId ? [abilityId] : [];
      kei.damage = 0;
      kei.maxHealth = 30;
      state.players.p1.hand = ["spell.magic_arrow"];
      state.players.p1.permanents = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_crusaders";
      state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
      state.combat!.dice.scriptedRolls = [resistanceRoll, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = settle(applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: kei.id }
      }));
      return state.combat!.units[kei.id].damage;
    };
    const baseline = run(null, 1);
    expect(baseline, "Magic Arrow must hurt an unprotected unit").toBeGreaterThan(0);
    expect(run("kivotos-system-intrusion", 1)).toBe(0);
    // CONTROL: a 0 / -1 resistance face lets the Spell take hold in full.
    expect(run("kivotos-system-intrusion", 0)).toBe(baseline);
    expect(run("kivotos-system-intrusion", -1)).toBe(baseline);
  });

  // ─── Shiroko ───────────────────────────────────────────────────────────────
  it("Cycle Scout offers every reachable space within 2 (and none farther), moves Shiroko there, and may be declined", () => {
    const setup = (abilityId: string | null) => {
      const state = duel(`cycle-scout-${abilityId}`);
      const shiroko = state.combat!.units.unit_p1_marksmen;
      shiroko.abilities = abilityId ? [abilityId] : [];
      shiroko.position = 1;
      applyCombatStartUnitAbilities(state);
      maybeOpenKivotosCombatStartChoice(state);
      return { state, shiroko };
    };

    // CONTROL: no ability → no combat-start prompt at all.
    expect(setup(null).state.pendingChoice).toBeNull();

    const { state, shiroko } = setup("kivotos-cycle-scout");
    const choice = state.pendingChoice;
    expect(choice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-step", playerId: "p1" });
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.step) throw new Error("Expected the Cycle Scout step choice.");
    const expected = getReachableDestinations(1, 2, new Set(Object.values(state.combat!.units).filter((u) => u.id !== shiroko.id).map((u) => u.position)), false);
    expect([...choice.step.positions].sort()).toEqual([...expected].sort());
    expect(choice.step.positions.every((position) => expected.includes(position))).toBe(true);
    // Distance-3 cells (13 and 7 from 1) must never be offered; 3 IS two steps (1→2→3).
    expect(choice.step.positions).not.toContain(13);
    expect(choice.step.positions).not.toContain(7);
    expect(choice.step.positions).toContain(3);
    // Exactly one "Stay here" option trails the moves (optional).
    expect(choice.options).toHaveLength(choice.step.positions.length + 1);

    // Take a distance-2 move: position really changes.
    const twoAway = choice.step.positions.find((position) => !getOrthogonalNeighbors(1).includes(position));
    expect(twoAway).toBeDefined();
    const moved = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.step.positions.indexOf(twoAway!)
    });
    expect(moved.combat!.units[shiroko.id].position).toBe(twoAway);
    expect(moved.pendingChoice).toBeNull();

    // Decline path: "Stay here" keeps the deployment position.
    const again = setup("kivotos-cycle-scout");
    const stayChoice = again.state.pendingChoice;
    if (!stayChoice || stayChoice.type !== "OPTION_CHOICE") throw new Error("Expected choice.");
    const stayed = applyOk(again.state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: stayChoice.id,
      optionIndex: stayChoice.options.length - 1
    });
    expect(stayed.combat!.units[again.shiroko.id].position).toBe(1);
  });

  // ─── Hina ──────────────────────────────────────────────────────────────────
  it("Prefect Barrage's second strike deals damage at exactly 3 Attack, not Hina's own Attack", () => {
    const run = (abilityId: string | null) => {
      let state = duel(`prefect-barrage-${abilityId}`);
      const hina = state.combat!.units.unit_p1_marksmen;
      const target = state.combat!.units.unit_p2_skeletons;
      hina.abilities = abilityId ? [abilityId] : [];
      hina.attack = 5;
      hina.position = 1;
      target.position = 13;
      target.defense = 2;
      target.defenseToken = false;
      target.damage = 0;
      target.maxHealth = 40;
      target.attack = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = hina.id;
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = settle(attack(state, "p1", hina.id, target.id));
      return state.combat!.units[target.id].damage;
    };
    expect(run(null)).toBe(3); // CONTROL: 5 − 2
    expect(run("kivotos-prefect-barrage")).toBe(4); // (5 − 2) + (3 − 2)
  });

  // ─── Yuuka ─────────────────────────────────────────────────────────────────
  it("Perfect Balance: discarding a card zeroes the attacker's +1 die; no ability or no card → no offer", () => {
    const run = (abilityId: string | null, hand: string[]) => {
      let state = duel(`perfect-balance-${abilityId}-${hand.length}`);
      const enemy = state.combat!.units.unit_p1_crusaders;
      const yuuka = state.combat!.units.unit_p2_skeletons;
      yuuka.abilities = abilityId ? [abilityId] : [];
      yuuka.defense = 1;
      yuuka.defenseToken = false;
      yuuka.damage = 0;
      yuuka.maxHealth = 30;
      yuuka.attack = 0;
      yuuka.position = 13;
      enemy.position = 9;
      enemy.attack = 3;
      enemy.maxHealth = 30;
      state.players.p2.hand = [...hand];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = enemy.id;
      state.combat!.dice.scriptedRolls = [1, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = attack(state, "p1", enemy.id, yuuka.id);
      // p2's hand cards are playable instants in the pre-roll UNIT_ATTACK_DECLARED
      // window; pass through it until the post-roll die-settled offer appears.
      let offers: Extract<GameAction, { type: "USE_UNIT_DIE_IGNORE" }>[] = [];
      for (let safety = 20; safety > 0 && state.reactionWindow; safety -= 1) {
        offers = getLegalActions(state, "p2")
          .map((legal) => legal.action)
          .filter((action): action is Extract<GameAction, { type: "USE_UNIT_DIE_IGNORE" }> => action.type === "USE_UNIT_DIE_IGNORE");
        if (offers.length > 0) break;
        state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      }
      if (offers.length > 0) {
        state = applyOk(state, offers[0]);
      }
      state = settle(state);
      return { offered: offers.length > 0, damage: state.combat!.units[yuuka.id].damage, hand: state.players.p2.hand.length };
    };
    // 3 + 1 − 1 = 3 without the parry; the die ignored → 3 + 0 − 1 = 2, one card gone.
    expect(run("kivotos-perfect-balance", ["stat.attack", "stat.defense"])).toEqual({ offered: true, damage: 2, hand: 1 });
    expect(run(null, ["stat.attack", "stat.defense"])).toEqual({ offered: false, damage: 3, hand: 2 });
    expect(run("kivotos-perfect-balance", [])).toEqual({ offered: false, damage: 3, hand: 0 });
  });

  it("Perfect Balance is also offered when Yuuka is the target of a RETALIATION Attack", () => {
    let state = duel("perfect-balance-retaliation");
    const yuuka = state.combat!.units.unit_p1_crusaders;
    const enemy = state.combat!.units.unit_p2_skeletons;
    yuuka.abilities = ["kivotos-perfect-balance"];
    yuuka.attack = 0;
    yuuka.defense = 1;
    yuuka.defenseToken = false;
    yuuka.damage = 0;
    yuuka.maxHealth = 30;
    yuuka.position = 9;
    enemy.position = 13;
    enemy.attack = 3;
    enemy.maxHealth = 30;
    state.players.p1.hand = ["stat.attack"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = yuuka.id;
    state.combat!.dice.scriptedRolls = [0, 1, 0, 0];
    state.combat!.dice.rollCount = 0;
    state = attack(state, "p1", yuuka.id, enemy.id);
    // Pass through the primary-attack window(s) until the retaliation die is settled.
    let offers: GameAction[] = [];
    for (let safety = 20; safety > 0 && state.reactionWindow; safety -= 1) {
      offers = getLegalActions(state, "p1").map((legal) => legal.action).filter((action) => action.type === "USE_UNIT_DIE_IGNORE");
      if (offers.length > 0) break;
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }
    expect(offers.length, "Yuuka is 'attacked' by the retaliation too").toBeGreaterThan(0);
    state = settle(applyOk(state, offers[0]));
    expect(state.combat!.units[yuuka.id].damage).toBe(2); // 3 + 0 − 1, not 3
    expect(state.players.p1.hand).toHaveLength(0);
  });
});
