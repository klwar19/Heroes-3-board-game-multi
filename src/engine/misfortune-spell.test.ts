import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import { soundDurationMs, spellFxPlans, spellPresentationMs, spriteDurationMs } from "@/data/fx";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Engine tests for Misfortune (Basic Fire, Instant; Fortress Expansion). Every
 * rule is engine-enforced; each test fails if the wiring is removed.
 *
 *  - "Played immediately when the enemy unit is attacking, BEFORE other cards":
 *    it has its own pre-buff window (only the defender's Misfortune is offered),
 *    opened ahead of the normal attack-declared buff window — so the attacker
 *    cannot buff before it.
 *  - Playing it NEGATES the attack: the attacker can no longer increase their
 *    attack from any source for this attack (Bloodlust/Precision/Bless/Slayer,
 *    Hall of Valhalla / Cage boosts) AND the Attack die is cancelled.
 *  - Grade-gated on the ATTACKING unit by the Power paid (0/1/2 → bronze/silver/
 *    gold); only the matching, affordable option is offered, never to the
 *    attacker, and it counts as the defender's Spell for the round.
 *
 * Sandbox grades/types (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Passes / resolves every open window or attack-die reroll until combat is idle. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
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

/** Whether Misfortune's option `optionIndex` is offered to `playerId` in the window. */
function misfortuneOffered(state: GameState, playerId: PlayerId, optionIndex: number): boolean {
  return (state.reactionWindow?.legalReactions[playerId] ?? []).some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "spell.misfortune" &&
      legal.action.optionIndex === optionIndex
  );
}

/** Whether `cardId` is offered to `playerId` in the window (priority-independent). */
function windowOffers(state: GameState, playerId: PlayerId, cardId: string): boolean {
  return (state.reactionWindow?.legalReactions[playerId] ?? []).some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId && !legal.action.asPowerBoost
  );
}

function isMisfortunePreWindow(state: GameState): boolean {
  const top = state.stack.at(-1);
  return Boolean(state.reactionWindow && top && top.modifiers.misfortunePhase);
}

type AttackOpts = {
  /** The p2 unit that attacks p1's crusaders. Its grade gates Misfortune. */
  attacker: UnitId;
  attackerAttack?: number;
  defenderDefense?: number;
  p1Hand?: string[];
  p2Hand?: string[];
  rolls?: number[];
};

/**
 * p2's `attacker` melees p1's crusaders (the defender, adjacent). Returns the
 * state right after the attack is declared — the Misfortune pre-buff window when
 * the defender holds a playable Misfortune, the normal window otherwise, or the
 * resolved attack when nobody can react.
 */
function declareEnemyAttack(seed: string, opts: AttackOpts): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units[opts.attacker];
  const defender = state.combat!.units.unit_p1_crusaders;
  attacker.abilities = [];
  defender.abilities = [];
  attacker.type = "ground";
  attacker.position = 9;
  defender.position = 13; // adjacent to 9
  attacker.attack = opts.attackerAttack ?? 6;
  defender.defense = opts.defenderDefense ?? 1;
  attacker.maxHealth = 40;
  defender.maxHealth = 40;
  attacker.damage = 0;
  defender.damage = 0;
  attacker.activatedThisRound = false;
  attacker.retaliatedThisRound = false;
  state.players.p1.hand = opts.p1Hand ?? [];
  state.players.p2.hand = opts.p2Hand ?? [];
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = opts.attacker;
  state.combat!.dice.scriptedRolls = opts.rolls ?? [1, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: opts.attacker,
    defenderId: "unit_p1_crusaders"
  });
}

function crusadersDamage(state: GameState): number {
  return state.combat!.units.unit_p1_crusaders.damage;
}

function playMisfortune(state: GameState, optionIndex: number, costCardIds?: string[]): GameState {
  return applyOk(state, {
    type: "PLAY_REACTION",
    playerId: "p1",
    cardId: "spell.misfortune",
    mode: "basic",
    optionIndex,
    ...(costCardIds ? { costCardIds } : {})
  });
}

// ===========================================================================
// Card definition & presentation
// ===========================================================================

describe("Misfortune — card definition & FX", () => {
  it("is an implemented Basic Fire instant whose three grade options NEGATE the attack", async () => {
    const { cardLibrary } = await import("@/data/cards/library");
    const card = cardLibrary["spell.misfortune"];
    expect(card).toBeTruthy();
    expect(card.implementationStatus).toBe("implemented");
    expect(card.spellLevel).toBe("basic");
    expect(card.spellSchools).toEqual(["fire"]);
    expect(card.effect.type).toBe("CHOOSE_ONE");

    const options = card.effect.type === "CHOOSE_ONE" ? card.effect.options : [];
    expect(options.map((option) => (option.effect.type === "NEGATE_ATTACK" ? option.effect.grade : null))).toEqual([
      "bronze",
      "silver",
      "gold"
    ]);
    // bronze free, silver pays 1, gold pays 2 power-source cards.
    expect(options.map((option) => option.cost?.discardCards ?? 0)).toEqual([0, 1, 2]);
    for (const option of options) {
      expect(option.trigger).toMatchObject({ event: "UNIT_ATTACK_DECLARED", controller: "opponent" });
    }
  });

  it("carries the misfortune sprite + cast sound", () => {
    const plan = spellFxPlans["spell.misfortune"];
    expect(plan, "Misfortune needs an FX plan").toBeTruthy();
    expect(plan.sound).toBe("spells/misfortune");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(plan.affect?.[0]?.key).toBe("misfortune");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("sits in the Basic spell decks (drawable in play)", async () => {
    const { spellDeckLegacy, spellDeckBinhBasic } = await import("@/data/cards/spells");
    expect(spellDeckLegacy).toContain("spell.misfortune");
    expect(spellDeckBinhBasic).toContain("spell.misfortune");
  });
});

// ===========================================================================
// Pre-buff window: played before the attacker can buff, gated by attacker grade
// ===========================================================================

describe("Misfortune — its own window, before the attacker buffs", () => {
  it("opens a defender-only pre-buff window the instant the attack is declared", () => {
    // p2 (the attacker) holds Bloodlust; p1 (the defender) holds Misfortune.
    const declared = declareEnemyAttack("misfortune-prewindow", {
      attacker: "unit_p2_skeletons",
      p1Hand: ["spell.misfortune"],
      p2Hand: ["spell.bloodlust"]
    });
    // The window opened is Misfortune's pre-buff phase, with the defender on priority.
    expect(isMisfortunePreWindow(declared)).toBe(true);
    expect(declared.reactionWindow?.priorityPlayerId).toBe("p1");
    // The defender is offered Misfortune (bronze attacker → free option)...
    expect(misfortuneOffered(declared, "p1", 0)).toBe(true);
    // ...and the attacker is offered NOTHING yet — it cannot buff before Misfortune.
    expect(windowOffers(declared, "p2", "spell.bloodlust")).toBe(false);
  });

  it("offers only the grade option matching the attacker, and only when payable", () => {
    // Bronze attacker → free bronze option only.
    const bronze = declareEnemyAttack("misfortune-bronze", {
      attacker: "unit_p2_skeletons",
      p1Hand: ["spell.misfortune"]
    });
    expect(misfortuneOffered(bronze, "p1", 0)).toBe(true);
    expect(misfortuneOffered(bronze, "p1", 1)).toBe(false);
    expect(misfortuneOffered(bronze, "p1", 2)).toBe(false);

    // Silver attacker with no Power → unaffordable → not offered at all.
    const silverBroke = declareEnemyAttack("misfortune-silver-broke", {
      attacker: "unit_p2_vampires",
      p1Hand: ["spell.misfortune"]
    });
    expect(misfortuneOffered(silverBroke, "p1", 1)).toBe(false);
    // The pre-window never even opened (no playable Misfortune) — the attack
    // resolved straight through.
    expect(isMisfortunePreWindow(silverBroke)).toBe(false);

    // Silver attacker with 1 Power → the silver option (pay 1) is offered.
    const silver = declareEnemyAttack("misfortune-silver", {
      attacker: "unit_p2_vampires",
      p1Hand: ["spell.misfortune", "stat.power"]
    });
    expect(misfortuneOffered(silver, "p1", 1)).toBe(true);
    expect(misfortuneOffered(silver, "p1", 0)).toBe(false);
    expect(misfortuneOffered(silver, "p1", 2)).toBe(false);

    // Gold attacker needs 2 Power; one short → nothing offered.
    const goldShort = declareEnemyAttack("misfortune-gold-short", {
      attacker: "unit_p2_dread_knights",
      p1Hand: ["spell.misfortune", "stat.power"]
    });
    expect(misfortuneOffered(goldShort, "p1", 2)).toBe(false);
    const gold = declareEnemyAttack("misfortune-gold", {
      attacker: "unit_p2_dread_knights",
      p1Hand: ["spell.misfortune", "stat.power", "stat.power"]
    });
    expect(misfortuneOffered(gold, "p1", 2)).toBe(true);
  });

  it("is never offered to the attacker (only the attacked unit's controller)", () => {
    // p2 (the attacker) holds Misfortune; it must never be offered to them.
    const declared = declareEnemyAttack("misfortune-attacker", {
      attacker: "unit_p2_skeletons",
      p1Hand: ["spell.misfortune"],
      p2Hand: ["spell.misfortune"]
    });
    expect(misfortuneOffered(declared, "p2", 0)).toBe(false);
    expect(misfortuneOffered(declared, "p2", 1)).toBe(false);
    expect(misfortuneOffered(declared, "p2", 2)).toBe(false);
  });
});

// ===========================================================================
// Negating the attack: the attacker cannot buff, and the die is cancelled
// ===========================================================================

describe("Misfortune — negates the attack from any source", () => {
  it("locks the attacker out of buffing from any source once played, but the defender may still act", () => {
    // p2 attacks with Bloodlust (ADD_COMBAT_STAT) and Bless (IGNORE_ATTACK_DIE) —
    // two different attack-buff sources. p1 holds Misfortune + a Defense statistic
    // (a non-Spell, so it keeps the window open after Misfortune has used p1's one
    // Spell for the round).
    const declared = declareEnemyAttack("misfortune-lockout", {
      attacker: "unit_p2_skeletons",
      p1Hand: ["spell.misfortune", "stat.defense"],
      p2Hand: ["spell.bloodlust", "spell.bless"]
    });
    const after = playMisfortune(declared, 0);

    // The normal buff window is open; every attack-increasing source is refused
    // to the locked attacker...
    expect(after.reactionWindow).toBeTruthy();
    expect(windowOffers(after, "p2", "spell.bloodlust")).toBe(false);
    expect(windowOffers(after, "p2", "spell.bless")).toBe(false);
    // ...while the defender may still act on their own unit.
    expect(windowOffers(after, "p1", "stat.defense")).toBe(true);
  });

  it("if the defender DECLINES Misfortune, the attacker may buff normally", () => {
    // Same hands, but p1 passes the pre-window instead of playing Misfortune.
    const declared = declareEnemyAttack("misfortune-declined", {
      attacker: "unit_p2_skeletons",
      p1Hand: ["spell.misfortune"],
      p2Hand: ["spell.bloodlust"]
    });
    expect(isMisfortunePreWindow(declared)).toBe(true);
    const passed = applyOk(declared, { type: "PASS_REACTION", playerId: "p1" });
    // The normal attack-declared window took over (attacker-first), and Bloodlust
    // is now offered to the attacker — Misfortune only locks when it is played.
    expect(isMisfortunePreWindow(passed)).toBe(false);
    expect(passed.reactionWindow?.priorityPlayerId).toBe("p2");
    expect(windowOffers(passed, "p2", "spell.bloodlust")).toBe(true);
  });

  it("drops the attacker's '+1' die from the resolved hit, and counts as the defender's Spell", () => {
    // Control: skeletons (bronze) attack 6 with a +1 die, crusaders defense 1 → 6.
    const control = settle(
      declareEnemyAttack("misfortune-control", {
        attacker: "unit_p2_skeletons",
        attackerAttack: 6,
        defenderDefense: 1,
        rolls: [1, 0, 0, 0, 0, 0]
      })
    );
    expect(crusadersDamage(control)).toBe(6);

    // p1 plays Misfortune (free, bronze) → die negated → 6 + 0 − 1 = 5.
    const after = settle(
      playMisfortune(
        declareEnemyAttack("misfortune-negate", {
          attacker: "unit_p2_skeletons",
          attackerAttack: 6,
          defenderDefense: 1,
          rolls: [1, 0, 0, 0, 0, 0],
          p1Hand: ["spell.misfortune"]
        }),
        0
      )
    );
    expect(crusadersDamage(after)).toBe(5);
    expect(after.players.p1.discard).toContain("spell.misfortune");
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("negates a silver attacker's attack when 1 Power is paid (the Power card is spent)", () => {
    const declared = declareEnemyAttack("misfortune-silver-negate", {
      attacker: "unit_p2_vampires",
      attackerAttack: 6,
      defenderDefense: 1,
      rolls: [1, 0, 0, 0, 0, 0],
      p1Hand: ["spell.misfortune", "stat.power"]
    });
    expect(misfortuneOffered(declared, "p1", 1)).toBe(true);
    const after = settle(playMisfortune(declared, 1, ["stat.power"]));
    expect(crusadersDamage(after)).toBe(5); // +1 die negated
    expect(after.players.p1.discard).toContain("spell.misfortune");
    expect(after.players.p1.discard).toContain("stat.power");
  });
});
