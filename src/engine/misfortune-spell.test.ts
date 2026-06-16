import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { soundDurationMs, spellFxPlans, spellPresentationMs, spriteDurationMs } from "@/data/fx";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for Misfortune (Basic Fire, Instant; Fortress Expansion). Every
 * rule is engine-enforced; each test fails if the wiring is removed.
 *
 *  - The DEFENDER plays it when an enemy unit declares an attack on one of their
 *    units, negating that attacker's Attack die result — the die counts as 0 and
 *    the effects that face would have triggered do not fire (the same engine path
 *    as Shield of the Dwarven Lords' die-cancel), but in the PRE-roll
 *    attack-declared window rather than Shield's post-roll one.
 *  - Grade-gated on the ATTACKING unit by the Power paid (0 → bronze, 1 → silver,
 *    2 → gold): only the option whose grade matches the attacker is offered, and
 *    only when the Power cost is affordable.
 *  - Never offered to the attacker; counts as the defender's Spell for the round.
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

/** Passes priority until `playerId` holds it (or the window closes). */
function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Whether Misfortune's option `optionIndex` is a legal reaction for `playerId` now. */
function misfortuneOffered(state: GameState, playerId: "p1" | "p2", optionIndex: number): boolean {
  return getLegalActions(state, playerId).some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "spell.misfortune" &&
      legal.action.optionIndex === optionIndex &&
      !legal.action.asPowerBoost
  );
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
 * state right after the attack is declared — with the UNIT_ATTACK_DECLARED window
 * open when either side holds a reaction, or already resolved when neither does.
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

// ===========================================================================
// Card definition & presentation
// ===========================================================================

describe("Misfortune — card definition & FX", () => {
  it("is an implemented Basic Fire instant whose three grade options negate an Attack die", async () => {
    const { cardLibrary } = await import("@/data/cards/library");
    const card = cardLibrary["spell.misfortune"];
    expect(card).toBeTruthy();
    expect(card.implementationStatus).toBe("implemented");
    expect(card.spellLevel).toBe("basic");
    expect(card.spellSchools).toEqual(["fire"]);
    expect(card.effect.type).toBe("CHOOSE_ONE");

    const options = card.effect.type === "CHOOSE_ONE" ? card.effect.options : [];
    // One IGNORE_ATTACK_DIE_RESULT option per grade, in ascending Power order.
    expect(
      options.map((option) => (option.effect.type === "IGNORE_ATTACK_DIE_RESULT" ? option.effect.grade : null))
    ).toEqual(["bronze", "silver", "gold"]);
    // The silver/gold options cost 1 / 2 power-source cards; bronze is free.
    expect(options.map((option) => option.cost?.discardCards ?? 0)).toEqual([0, 1, 2]);
    // Each fires on an ENEMY unit's declared attack.
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
// Offered to the defender, gated by the attacker's grade and the Power paid
// ===========================================================================

describe("Misfortune — offered to the defender, gated by the attacker's grade", () => {
  it("offers the free (bronze) option against a bronze attacker, and no higher tier", () => {
    const atP1 = passUntil(
      declareEnemyAttack("misfortune-bronze", { attacker: "unit_p2_skeletons", p1Hand: ["spell.misfortune"] }),
      "p1"
    );
    expect(atP1.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");
    expect(misfortuneOffered(atP1, "p1", 0)).toBe(true); // bronze, free
    expect(misfortuneOffered(atP1, "p1", 1)).toBe(false); // silver option never matches a bronze attacker
    expect(misfortuneOffered(atP1, "p1", 2)).toBe(false); // gold option never matches a bronze attacker
  });

  it("against a silver attacker, offers only the silver option, and only when 1 Power can be paid", () => {
    // No power-source card → the silver option is unaffordable → not offered.
    const broke = passUntil(
      declareEnemyAttack("misfortune-silver-broke", { attacker: "unit_p2_vampires", p1Hand: ["spell.misfortune"] }),
      "p1"
    );
    expect(misfortuneOffered(broke, "p1", 1)).toBe(false);
    expect(misfortuneOffered(broke, "p1", 0)).toBe(false);

    // With a Power-source card to discard, the silver option (pay 1) is offered.
    const funded = passUntil(
      declareEnemyAttack("misfortune-silver", {
        attacker: "unit_p2_vampires",
        p1Hand: ["spell.misfortune", "stat.power"]
      }),
      "p1"
    );
    expect(misfortuneOffered(funded, "p1", 1)).toBe(true);
    expect(misfortuneOffered(funded, "p1", 0)).toBe(false); // bronze option never matches a silver attacker
    expect(misfortuneOffered(funded, "p1", 2)).toBe(false); // gold option never matches a silver attacker
  });

  it("against a gold attacker, offers only the gold option when 2 Power can be paid (one short → none)", () => {
    const funded = passUntil(
      declareEnemyAttack("misfortune-gold", {
        attacker: "unit_p2_dread_knights",
        p1Hand: ["spell.misfortune", "stat.power", "stat.power"]
      }),
      "p1"
    );
    expect(misfortuneOffered(funded, "p1", 2)).toBe(true);
    expect(misfortuneOffered(funded, "p1", 1)).toBe(false);
    expect(misfortuneOffered(funded, "p1", 0)).toBe(false);

    // One Power short → the gold option is unaffordable, so nothing is offered.
    const short = passUntil(
      declareEnemyAttack("misfortune-gold-short", {
        attacker: "unit_p2_dread_knights",
        p1Hand: ["spell.misfortune", "stat.power"]
      }),
      "p1"
    );
    expect(misfortuneOffered(short, "p1", 2)).toBe(false);
  });

  it("is never offered to the attacker — only the attacked unit's controller negates the die", () => {
    // p2 (the attacker) holds Misfortune AND Bloodlust; the window opens with p2
    // on priority for Bloodlust (an attacker's buff). Misfortune must NOT be
    // offered to p2 — it is the DEFENDER's reaction, gated to the attack's
    // opponent — even though p2 is on priority with reactions computed.
    const declared = declareEnemyAttack("misfortune-attacker", {
      attacker: "unit_p2_skeletons",
      p1Hand: [],
      p2Hand: ["spell.misfortune", "spell.bloodlust"]
    });
    expect(declared.reactionWindow?.priorityPlayerId).toBe("p2");
    const bloodlustOffered = getLegalActions(declared, "p2").some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.bloodlust"
    );
    expect(bloodlustOffered, "Bloodlust should be offered to the attacker").toBe(true);
    expect(misfortuneOffered(declared, "p2", 0)).toBe(false);
    expect(misfortuneOffered(declared, "p2", 1)).toBe(false);
    expect(misfortuneOffered(declared, "p2", 2)).toBe(false);
  });
});

// ===========================================================================
// Negating the die — the resolved hit loses the attacker's die bonus
// ===========================================================================

describe("Misfortune — negates the attacker's Attack die", () => {
  it("drops a '+1' die from a bronze attacker's hit (free), and counts as the defender's Spell", () => {
    // Control: skeletons (bronze) attack for 6 with a +1 die, crusaders defense 1
    // → 6 + 1 − 1 = 6 damage.
    const control = settle(
      declareEnemyAttack("misfortune-control", {
        attacker: "unit_p2_skeletons",
        attackerAttack: 6,
        defenderDefense: 1,
        rolls: [1, 0, 0, 0, 0, 0]
      })
    );
    expect(crusadersDamage(control)).toBe(6);

    // p1 plays Misfortune (free, bronze attacker) → die negated → 6 + 0 − 1 = 5.
    const atP1 = passUntil(
      declareEnemyAttack("misfortune-negate", {
        attacker: "unit_p2_skeletons",
        attackerAttack: 6,
        defenderDefense: 1,
        rolls: [1, 0, 0, 0, 0, 0],
        p1Hand: ["spell.misfortune"]
      }),
      "p1"
    );
    expect(misfortuneOffered(atP1, "p1", 0)).toBe(true);
    const after = settle(
      applyOk(atP1, {
        type: "PLAY_REACTION",
        playerId: "p1",
        cardId: "spell.misfortune",
        mode: "basic",
        optionIndex: 0
      })
    );
    expect(crusadersDamage(after)).toBe(5);
    // The Spell is spent and counts as p1's one Spell this combat round.
    expect(after.players.p1.discard).toContain("spell.misfortune");
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("negates a silver attacker's die when 1 Power is paid (the Power card is spent)", () => {
    const atP1 = passUntil(
      declareEnemyAttack("misfortune-silver-negate", {
        attacker: "unit_p2_vampires",
        attackerAttack: 6,
        defenderDefense: 1,
        rolls: [1, 0, 0, 0, 0, 0],
        p1Hand: ["spell.misfortune", "stat.power"]
      }),
      "p1"
    );
    expect(misfortuneOffered(atP1, "p1", 1)).toBe(true);
    const after = settle(
      applyOk(atP1, {
        type: "PLAY_REACTION",
        playerId: "p1",
        cardId: "spell.misfortune",
        mode: "basic",
        optionIndex: 1,
        costCardIds: ["stat.power"]
      })
    );
    expect(crusadersDamage(after)).toBe(5); // die negated
    expect(after.players.p1.discard).toContain("spell.misfortune");
    expect(after.players.p1.discard).toContain("stat.power"); // the Power paid for silver
  });

  it("is a PRE-roll reaction: it never opens a post-roll die-settled window", () => {
    // p1 holds Misfortune but declines in the attack-declared window. No
    // ATTACK_DIE_SETTLED window may open to re-offer it (graded die-negations are
    // pre-roll only — that post-roll window is Shield of the Dwarven Lords' alone).
    let state = declareEnemyAttack("misfortune-no-postroll", {
      attacker: "unit_p2_skeletons",
      attackerAttack: 6,
      defenderDefense: 1,
      rolls: [1, 0, 0, 0, 0, 0],
      p1Hand: ["spell.misfortune"]
    });
    expect(state.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");

    let sawDieSettled = false;
    let safety = 30;
    while (state.reactionWindow && safety-- > 0) {
      if (state.reactionWindow.triggerEvent.type === "ATTACK_DIE_SETTLED") {
        sawDieSettled = true;
      }
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }
    expect(sawDieSettled).toBe(false);
    // Misfortune was never played and the +1 die landed in full: 6 + 1 − 1 = 6.
    expect(state.players.p1.hand).toContain("spell.misfortune");
    expect(crusadersDamage(state)).toBe(6);
  });
});
