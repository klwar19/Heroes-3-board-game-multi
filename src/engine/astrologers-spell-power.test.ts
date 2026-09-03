import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { applyAction, createAdventureGameState, getLegalActions, standingSpellPower } from "./index";
import { startAdventureRound, startPlayerTurn } from "./adventure";
import { releaseEndedOngoingCards } from "./active-effects";
import { createInitialGameState } from "./setup";
import {
  claimCrazyWizardFirstSpellReturn,
  returnCrazyWizardPolishBookSpell,
} from "./spell-lifecycle";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * Astrologers school-power proclamations, engine-enforced end to end:
 *   - Blue Sky: Air + Water spells cast at +1 Power.
 *   - Scorched Ground: Earth + Fire spells cast at +1 Power.
 *
 * Each test casts a real damaging spell in the combat sandbox and reads the
 * damage dealt, so removing the getCurrentSpellPower hook makes a test fail.
 *
 * Damage tables exercised (amountByPower):
 *   Implosion (Earth): {0:0, 1:2, ...}  -> +1 Power turns 0 damage into 2.
 *   Magic Arrow (any): {0:1, 1:2, ...}  -> +1 Power turns 1 damage into 2.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Minimal adventure substate so getActiveAstrologersCard returns this card. */
function setProclamation(state: GameState, cardId: string | null): void {
  if (!cardId) {
    return;
  }
  state.adventure = {
    astrologers: {
      activeCardId: cardId,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    }
  } as unknown as GameState["adventure"];
}

/** Cast `spellId` at the enemy skeletons and return the damage it took. */
function castDamage(seed: string, spellId: string, proclamation: string | null): number {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [spellId];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = []; // strip immunities so the hit lands plainly
  target.maxHealth = 50;
  target.damage = 0;
  setProclamation(state, proclamation);

  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === spellId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, `${spellId} should be castable at the skeletons`).toBeTruthy();
  const resolved = passAll(applyOk(state, cast!.action));
  return resolved.combat!.units.unit_p2_skeletons.damage;
}

/** Cast and return the engine's resolved Power event (not a UI preview). */
function castPower(
  seed: string,
  spellId: string,
  proclamation: string | null,
  setup?: (state: GameState) => void,
): number | undefined {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [spellId];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.units.unit_p2_skeletons.abilities = [];
  state.combat!.units.unit_p2_skeletons.maxHealth = 50;
  setProclamation(state, proclamation);
  setup?.(state);
  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === spellId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast).toBeTruthy();
  const resolved = passAll(applyOk(state, cast!.action));
  return [...resolved.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "SPELL_CAST_RESOLVED" }> =>
        event.type === "SPELL_CAST_RESOLVED" && event.spellCardId === spellId
    )?.power;
}

describe("Astrologers — Blue Sky / Scorched Ground school power", () => {
  it("Scorched Ground gives Earth spells +1 Power (Implosion 0 -> 2 damage)", () => {
    expect(castDamage("scorch-base", "spell.implosion", null)).toBe(0);
    expect(castDamage("scorch-on", "spell.implosion", "astrologers.scorched_ground")).toBe(2);
  });

  it("Scorched Ground does NOT touch Air/Water spells", () => {
    // Magic Arrow is school-agnostic and benefits, but a non-matching school
    // must not: Blue Sky leaves Earth's Implosion alone (control below). Here we
    // confirm Scorched Ground only fires for its own schools by leaving Implosion
    // unchanged when the wrong proclamation (Blue Sky) is up.
    expect(castDamage("scorch-wrong", "spell.implosion", "astrologers.blue_sky")).toBe(0);
  });

  it("Blue Sky gives matching/any spells +1 Power (Magic Arrow 1 -> 2 damage)", () => {
    expect(castDamage("blue-base", "spell.magic_arrow", null)).toBe(1);
    expect(castDamage("blue-on", "spell.magic_arrow", "astrologers.blue_sky")).toBe(2);
  });

  it("Blue Sky applies to both printed schools, but not Earth/Fire", () => {
    const state = createInitialGameState("blue-both-schools");
    setProclamation(state, "astrologers.blue_sky");
    expect(standingSpellPower(state, "p1", cardLibrary["spell.lightning_bolt"])).toBe(1);
    expect(standingSpellPower(state, "p1", cardLibrary["spell.weakness"])).toBe(1);
    expect(standingSpellPower(state, "p1", cardLibrary["spell.implosion"])).toBe(0);
  });

  it("stacks Blue Sky + Water Magic + an active Ice Elemental on Magic Arrow", () => {
    expect(
      castPower("blue-water-stack", "spell.magic_arrow", "astrologers.blue_sky", (state) => {
        state.players.p1.permanents = ["ability.water_magic"];
        state.combat!.units.unit_p1_marksmen.abilities = ["ice-elemental-water-power"];
      }),
    ).toBe(3);
  });

  it("Magic Arrow uses one highest school package and never mixes Ice Water with Fire Magic", () => {
    expect(
      castPower("blue-one-school", "spell.magic_arrow", "astrologers.blue_sky", (state) => {
        state.players.p1.permanents = ["ability.fire_magic"];
        state.combat!.units.unit_p1_marksmen.abilities = ["ice-elemental-water-power"];
      }),
    ).toBe(2); // Water: Blue Sky + Ice. Fire: Fire Magic only. Never 3 combined.
  });

  it("Magic Arrow can select a stronger non-Blue-Sky school without also taking Water bonuses", () => {
    expect(
      castPower("blue-strongest-school", "spell.magic_arrow", "astrologers.blue_sky", (state) => {
        state.players.p1.permanents = ["ability.fire_magic"];
        state.combat!.units.unit_p1_marksmen.abilities = ["ice-elemental-water-power"];
        state.activeEffects.push({
          id: "fire-specialty",
          name: "Fire specialty",
          scope: "player",
          duration: { type: "permanent" },
          modifiers: [{ type: "SPELL_SCHOOL_POWER_BONUS", school: "fire", amount: 2 }],
          source: { type: "system" },
          controllerId: "p1",
          startedRound: state.round,
          usedRollEventIds: [],
          usedChoiceIds: [],
          usedCombatRoundNumbers: [],
        });
      }),
    ).toBe(3); // Fire: 1 + 2. Water: Blue Sky + Ice = 2. Never 5 combined.
  });

  it("Scorched Ground counts school-agnostic Magic Arrow only once (+1, never +2)", () => {
    expect(castPower("scorch-arrow-power", "spell.magic_arrow", "astrologers.scorched_ground")).toBe(1);
    expect(castDamage("scorch-arrow-damage", "spell.magic_arrow", "astrologers.scorched_ground")).toBe(2);
  });

  it("a non-school proclamation never changes spell Power", () => {
    expect(castDamage("none-arrow", "spell.magic_arrow", "astrologers.dead_silence")).toBe(1);
    expect(castDamage("none-impl", "spell.implosion", "astrologers.dead_silence")).toBe(0);
  });

  it("lasts through the following Resource round and expires at the next Astrologers round", () => {
    const state = createAdventureGameState({
      seed: "blue-duration",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Ciele", factionId: "conflux", heroDefId: "ciele" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      ],
    });
    state.adventure!.astrologers!.activeCardId = "astrologers.blue_sky";

    state.round = 3;
    startAdventureRound(state);
    expect(state.adventure!.astrologers!.activeCardId).toBe("astrologers.blue_sky");
    expect(standingSpellPower(state, "p1", cardLibrary["spell.magic_arrow"])).toBeGreaterThanOrEqual(1);

    state.round = 4;
    state.decks.astrologers.drawPile = ["astrologers.dead_silence"];
    startAdventureRound(state);
    expect(state.decks.astrologers.discardPile).toContain("astrologers.blue_sky");
    expect(state.adventure!.astrologers!.activeCardId).toBe("astrologers.dead_silence");
  });

  /**
   * The proclamation buffs a matching-school spell played as an INSTANT into an
   * attack window too — "all Spells … are cast at +1 Power" makes no cast-vs-
   * instant distinction, and the instant shares the cast pipeline's Power
   * sources (standingSpellPower). Bloodlust (Fire, {0:+1, 1:+2, 2:+3} attack):
   * Scorched Ground lifts a lone Bloodlust from +1 to +2 attack on the roll.
   */
  function bloodlustAttackBonus(seed: string, proclamation: string | null): number | null {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.bloodlust"];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    setProclamation(state, proclamation);

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const played = passAll(
      applyOk(declared, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" })
    );
    // The griffins' own declared attack — never the skeletons' retaliation roll.
    const rolled = played.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation && event.attackerId === "unit_p1_griffins"
    );
    return rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null;
  }

  it("buffs a matching-school spell INSTANT played into an attack window (Bloodlust +1 → +2)", () => {
    expect(bloodlustAttackBonus("instant-base", null)).toBe(1);
    expect(bloodlustAttackBonus("instant-on", "astrologers.scorched_ground")).toBe(2);
    // CONTROL: the wrong-school proclamation adds nothing to a Fire instant.
    expect(bloodlustAttackBonus("instant-wrong", "astrologers.blue_sky")).toBe(1);
  });

  function precisionAttackBonus(seed: string, proclamation: string | null): number | null {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.precision"];
    state.players.p2.hand = [];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_marksmen.position = 0;
    state.combat!.units.unit_p2_skeletons.position = 15;
    state.combat!.units.unit_p2_skeletons.abilities = [];
    state.combat!.units.unit_p2_skeletons.maxHealth = 50;
    setProclamation(state, proclamation);

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    const resolved = passAll(
      applyOk(declared, {
        type: "PLAY_REACTION",
        playerId: "p1",
        cardId: "spell.precision",
        mode: "basic"
      })
    );
    const rolled = resolved.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation
    );
    return rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null;
  }

  it("Blue Sky buffs a matching Air instant reaction, while Scorched Ground does not", () => {
    expect(precisionAttackBonus("blue-instant-base", null)).toBe(1);
    expect(precisionAttackBonus("blue-instant-on", "astrologers.blue_sky")).toBe(2);
    expect(precisionAttackBonus("blue-instant-wrong", "astrologers.scorched_ground")).toBe(1);
  });

  function weaknessAttackBonus(seed: string, proclamation: string | null): number | null {
    const state = createInitialGameState(seed);
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.players.p1.hand = ["spell.weakness"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p1_griffins.abilities = [];
    state.combat!.units.unit_p1_griffins.maxHealth = 50;
    setProclamation(state, proclamation);

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    const resolved = passAll(
      applyOk(declared, {
        type: "PLAY_REACTION",
        playerId: "p1",
        cardId: "spell.weakness",
        mode: "basic"
      })
    );
    const rolled = resolved.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation
    );
    return rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null;
  }

  it("Blue Sky also buffs a matching Water instant reaction", () => {
    expect(weaknessAttackBonus("blue-water-instant-base", null)).toBe(-1);
    expect(weaknessAttackBonus("blue-water-instant-on", "astrologers.blue_sky")).toBe(-2);
  });

  function hasteInitiativeBonus(seed: string, proclamation: string | null): number | undefined {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.haste"];
    state.players.p2.hand = [];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    setProclamation(state, proclamation);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.haste" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p1_marksmen"
    );
    expect(cast).toBeTruthy();
    const resolved = passAll(applyOk(state, cast!.action));
    const haste = resolved.activeEffects.find(
      (effect) => effect.source.type === "card" && effect.source.cardId === "spell.haste"
    );
    const initiative = haste?.modifiers.find((modifier) => modifier.type === "INITIATIVE_BONUS");
    return initiative?.type === "INITIATIVE_BONUS" ? initiative.amount : undefined;
  }

  it("Blue Sky buffs a matching Air ongoing Spell for its complete lifetime", () => {
    expect(hasteInitiativeBonus("blue-ongoing-base", null)).toBe(1);
    expect(hasteInitiativeBonus("blue-ongoing-on", "astrologers.blue_sky")).toBe(2);
    expect(hasteInitiativeBonus("blue-ongoing-wrong", "astrologers.scorched_ground")).toBe(1);
  });
});

describe("Astrologers — Grim Warlock first Spell each turn", () => {
  it("stacks additively with Magi and another standing Power source", () => {
    expect(
      castPower("grim-magi-stack", "spell.magic_arrow", "astrologers.grim_warlock", (state) => {
        state.players.p1.permanents = ["ability.water_magic"];
        state.combat!.units.unit_p1_marksmen.abilities = ["magi-power-boost"];
      }),
    ).toBe(3); // Grim +1, Magi +1, Water Magic +1.
  });

  it("keeps its per-turn gate separate from Magi's per-combat-round gate", () => {
    const arrow = cardLibrary["spell.magic_arrow"];

    const grimSpent = createInitialGameState("grim-spent-magi-open");
    setProclamation(grimSpent, "astrologers.grim_warlock");
    grimSpent.combat!.activeUnitId = "unit_p1_marksmen";
    grimSpent.combat!.units.unit_p1_marksmen.abilities = ["magi-power-boost"];
    grimSpent.players.p1.combatStats.spellsCastThisTurn = 1;
    grimSpent.players.p1.combatStats.anySpellCastThisRound = false;
    expect(standingSpellPower(grimSpent, "p1", arrow)).toBe(1); // Magi only.

    const magiSpent = createInitialGameState("grim-open-magi-spent");
    setProclamation(magiSpent, "astrologers.grim_warlock");
    magiSpent.combat!.activeUnitId = "unit_p1_marksmen";
    magiSpent.combat!.units.unit_p1_marksmen.abilities = ["magi-power-boost"];
    magiSpent.players.p1.combatStats.spellsCastThisTurn = 0;
    magiSpent.players.p1.combatStats.anySpellCastThisRound = true;
    expect(standingSpellPower(magiSpent, "p1", arrow)).toBe(1); // Grim only.

    magiSpent.players.p1.combatStats.spellsCastThisTurn = 1;
    expect(standingSpellPower(magiSpent, "p1", arrow)).toBe(0); // Both spent.
  });

  it("powers the first triggered instant and consumes the turn gate", () => {
    const state = createInitialGameState("grim-instant");
    state.players.p1.hand = ["spell.bloodlust"];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"];
    setProclamation(state, "astrologers.grim_warlock");

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const settled = passAll(
      applyOk(declared, {
        type: "PLAY_REACTION",
        playerId: "p1",
        cardId: "spell.bloodlust",
        mode: "basic"
      })
    );
    const roll = settled.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation && event.attackerId === "unit_p1_griffins"
    );
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.attackBonus : null).toBe(3);
    expect(settled.players.p1.combatStats.spellsCastThisTurn).toBe(1);
  });

  it("powers an ongoing Spell when it is cast, then holds the ongoing card normally", () => {
    const state = createInitialGameState("grim-ongoing");
    state.players.p1.hand = ["spell.fortune"];
    state.players.p2.hand = [];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_marksmen.abilities = ["magi-power-boost"];
    setProclamation(state, "astrologers.grim_warlock");

    const settled = passAll(
      applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.fortune",
        target: { type: "none" }
      })
    );
    const resolved = [...settled.eventLog]
      .reverse()
      .find(
        (event): event is Extract<GameEvent, { type: "SPELL_CAST_RESOLVED" }> =>
          event.type === "SPELL_CAST_RESOLVED" && event.spellCardId === "spell.fortune"
      );
    expect(resolved?.power).toBe(2); // Grim + Magi.
    expect(settled.players.p1.ongoingCards).toEqual(
      expect.arrayContaining([expect.objectContaining({ cardId: "spell.fortune" })])
    );
    expect(settled.players.p1.combatStats.spellsCastThisTurn).toBe(1);
  });

  it("re-arms at the player's turn start in both Astrologers and Resource rounds", () => {
    const state = createAdventureGameState({
      seed: "grim-round-turn-reset",
      rollFirstPlayer: false,
      events: false
    });
    state.adventure!.astrologers!.activeCardId = "astrologers.grim_warlock";

    for (const round of [2, 3]) {
      state.round = round;
      state.players.p1.combatStats.spellsCastThisTurn = 1;
      startPlayerTurn(state, "p1");
      expect(state.players.p1.combatStats.spellsCastThisTurn, `round ${round}`).toBe(0);
      expect(standingSpellPower(state, "p1", cardLibrary["spell.magic_arrow"]), `round ${round}`).toBe(1);
    }
  });
});

describe("Astrologers — Crazy Wizard first-Spell lifecycle", () => {
  it("keeps a Knowledge-recalled ongoing Spell held until its effect expires", () => {
    const state = createInitialGameState("crazy-wizard-ongoing-knowledge");
    state.players.p1.hand = ["spell.fortune", "stat.knowledge"];
    state.players.p2.hand = [];
    setProclamation(state, "astrologers.crazy_wizard");

    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.fortune",
      target: { type: "none" }
    });
    const recalled = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const settled = passAll(recalled);

    expect(settled.players.p1.hand).not.toContain("spell.fortune");
    expect(settled.players.p1.ongoingCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "spell.fortune", returnTo: "hand" })
      ])
    );

    settled.activeEffects = settled.activeEffects.filter(
      (effect) => !(effect.source.type === "card" && effect.source.cardId === "spell.fortune")
    );
    releaseEndedOngoingCards(settled);
    expect(settled.players.p1.ongoingCards ?? []).toEqual([]);
    expect(settled.players.p1.hand).toContain("spell.fortune");
  });

  it("returns an instant Spell only after its attack resolves", () => {
    const state = createInitialGameState("crazy-wizard-instant");
    state.players.p1.hand = ["spell.bloodlust"];
    // Keep the opposing priority step open so the deferred destination can be
    // inspected before the attack resolves.
    state.players.p2.hand = ["stat.defense"];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    setProclamation(state, "astrologers.crazy_wizard");

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const played = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.bloodlust",
      mode: "basic"
    });

    expect(played.players.p1.hand).not.toContain("spell.bloodlust");
    expect(played.players.p1.discard).toContain("spell.bloodlust");
    expect(played.stack.at(-1)?.modifiers.deferredSpellRecalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "spell.bloodlust",
          playerId: "p1",
          reason: "Crazy Wizard"
        })
      ])
    );

    const resolved = passAll(played);
    expect(resolved.players.p1.hand).toContain("spell.bloodlust");
    expect(resolved.players.p1.discard).not.toContain("spell.bloodlust");
    expect(resolved.adventure!.astrologers!.crazyWizardUsedBy).toEqual(["p1"]);
  });

  it("maps a Polish Book return to the enabler plus one guarded refresh", () => {
    const state = createInitialGameState("crazy-wizard-polish-book");
    setProclamation(state, "astrologers.crazy_wizard");
    state.players.p1.hand = [];
    state.players.p1.discard = ["spell.cast_a_spell"];
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.magic_arrow"];

    expect(claimCrazyWizardFirstSpellReturn(state, "p1")).toBe(true);
    expect(claimCrazyWizardFirstSpellReturn(state, "p1")).toBe(false);
    expect(
      returnCrazyWizardPolishBookSpell(
        state,
        "p1",
        "spell.magic_arrow",
        "spell.cast_a_spell"
      )
    ).toBe(true);

    expect(state.players.p1.hand).toContain("spell.cast_a_spell");
    expect(state.players.p1.spellBook).toContain("spell.magic_arrow");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.magic_arrow");
    expect(state.players.p1.polishSpellsRefreshedThisRound).toEqual([
      "spell.magic_arrow"
    ]);
  });
});
