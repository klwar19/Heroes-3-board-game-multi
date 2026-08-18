/**
 * Polish Balance Pack (`polish-card-balance`) — the 27 reprinted ARTIFACTS.
 *
 * Every claim is an OBSERVABLE outcome (how far a unit may walk, the damage a
 * blow really deals, which die the window keeps, what a card really draws or
 * pays) paired with a rule-OFF CONTROL on the SAME setup, so a pass proves the
 * reprint moved the number — not that a flag was written (CLAUDE.md #1a).
 *
 * The fixture is the combat SANDBOX plus a minimal frozen `houseRules` block
 * (the `polish-card-balance-spells.test.ts` pattern), or a real adventure map
 * where the card is a map play.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { expireEffectsForActivationEnd, makeActiveEffect } from "./active-effects";
import { getUnitMoveRange } from "./legal-actions";
import { searchCountOverrideFor } from "./ruleset";
import { nextTurnTimeoutAction } from "./afk-drop";
import { chooseComputerAction } from "./computer/policy";
import { openSharedDeckSearch } from "./adventure-reducer";
import type { ComputerObservation } from "./computer/types";
import { cardLibrary } from "@/data/cards/library";
import { polishBalanceArtifactCards } from "@/data/cards/artifacts-balance";
import type { CardId, GameAction, GameState, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** A sandbox combat whose frozen house rules carry the Balance Pack flag. */
function combat(balance: boolean, seed = "polish-balance-artifacts"): GameState {
  const state = createInitialGameState(`${seed}-${balance}`);
  state.adventure = {
    // `combat-move-initiative` is pinned OFF so the printed Combat-movement half
    // of the reprinted initiative artifacts can only come from the Balance Pack.
    houseRules: { "polish-card-balance": balance, "combat-move-initiative": false }
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  state.combat!.units.unit_p1_griffins.attackedThisActivation = false;
  for (const unit of Object.values(state.combat!.units)) {
    unit.damage = 0;
    unit.maxHealth = 40;
  }
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

/** Every PLAY_CARD offer p1 has for `cardId` right now. */
function plays(state: GameState, cardId: string): Extract<GameAction, { type: "PLAY_CARD" }>[] {
  return getLegalActions(state, "p1")
    .map((legal) => legal.action)
    .filter((action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
      action.type === "PLAY_CARD" && action.cardId === cardId
    );
}

/** Plays `cardId`'s `optionIndex` side at `target` on p1's own activation. */
function playOption(
  state: GameState,
  cardId: string,
  optionIndex: number,
  targetUnitId?: UnitId
): GameState {
  const next = state;
  next.players.p1.hand = [cardId as CardId];
  const offer = plays(next, cardId).find(
    (action) =>
      action.optionIndex === optionIndex &&
      (targetUnitId === undefined ||
        (action.target?.type === "unit" && action.target.unitId === targetUnitId))
  );
  expect(offer, `${cardId} option ${optionIndex} should be playable`).toBeTruthy();
  return passAllReactions(applyOk(next, offer!));
}

function choiceInfo(state: GameState): { context?: string; options?: unknown[]; discardPick?: { remaining: number } } {
  return (state.pendingChoice ?? {}) as { context?: string; options?: unknown[]; discardPick?: { remaining: number } };
}

function effectsOn(state: GameState, unitId: UnitId) {
  return state.activeEffects.filter((effect) => effect.target?.type === "unit" && effect.target.unitId === unitId);
}

/**
 * Declares a p1 attack with `scripted` dice and resolves it fully (passing every
 * reaction), returning the damage the defender took.
 */
function attackDamage(
  state: GameState,
  scripted: number[],
  attackerId: UnitId = "unit_p1_griffins",
  defenderId: UnitId = "unit_p2_skeletons"
): { state: GameState; damage: number } {
  const combatState = state.combat!;
  combatState.dice.scriptedRolls = scripted;
  combatState.dice.rollCount = 0;
  combatState.units[attackerId].position = 13;
  combatState.units[defenderId].position = 14;
  combatState.units[attackerId].activatedThisRound = false;
  combatState.units[attackerId].attackedThisActivation = false;
  combatState.activeUnitId = attackerId;
  state.activePlayerId = "p1";
  let next = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId,
    defenderId
  });
  next = passAllReactions(next);
  // A reroll window may open (the reroll artifacts) — keep the first roll.
  let safety = 6;
  while (next.pendingChoice?.type === "ATTACK_DIE_REROLL" && safety > 0) {
    safety -= 1;
    const keep = getLegalActions(next, next.pendingChoice.playerId).find(
      (legal) => legal.action.type === "CHOOSE_PENDING_ROLL"
    );
    if (!keep) {
      break;
    }
    next = passAllReactions(applyOk(next, keep.action));
  }
  return { state: next, damage: next.combat!.units[defenderId].damage };
}

// ===========================================================================
// Initiative + Combat-movement riders (5 cards)
// ===========================================================================

describe("Balance Pack artifacts — the '+N initiative AND move N more spaces' riders", () => {
  const MOVERS: { cardId: string; optionIndex: number; initiative: number; spaces: number }[] = [
    { cardId: "artifact.boots_of_speed", optionIndex: 1, initiative: 1, spaces: 1 },
    { cardId: "artifact.equestrians_gloves", optionIndex: 0, initiative: 1, spaces: 1 },
    { cardId: "artifact.ring_of_the_wayfarer", optionIndex: 0, initiative: 1, spaces: 1 },
    { cardId: "artifact.cape_of_velocity", optionIndex: 0, initiative: 2, spaces: 2 }
  ];

  for (const mover of MOVERS) {
    it(`${cardLibrary[mover.cardId]?.name}: the buff really widens the unit's Combat movement`, () => {
      const on = playOption(combat(true), mover.cardId, mover.optionIndex, "unit_p1_griffins");
      const buff = effectsOn(on, "unit_p1_griffins").find((effect) => effect.name === cardLibrary[mover.cardId]?.name);
      expect(buff, "the buff was laid").toBeTruthy();
      expect(buff!.modifiers).toEqual(
        expect.arrayContaining([
          { type: "INITIATIVE_BONUS", amount: mover.initiative },
          { type: "MOVEMENT_BONUS", amount: mover.spaces }
        ])
      );
      // A ground unit's printed range is 3.
      expect(getUnitMoveRange(on.combat!.units.unit_p1_griffins, on)).toBe(3 + mover.spaces);

      // CONTROL: with the rule OFF the classic card moves only the Initiative
      // (the classic ±1 rider is gated on `combat-move-initiative`, pinned off).
      const off = playOption(combat(false), mover.cardId, mover.optionIndex, "unit_p1_griffins");
      expect(getUnitMoveRange(off.combat!.units.unit_p1_griffins, off)).toBe(3);
    });
  }

  it("Necklace of Swiftness: +1 initiative AND +1 space for GROUND units only", () => {
    const on = playOption(combat(true), "artifact.necklace_of_swiftness", 0);
    expect(on.combat!.units.unit_p1_crusaders.type, "the fixture unit really is GROUND").toBe("ground");
    expect(getUnitMoveRange(on.combat!.units.unit_p1_crusaders, on)).toBe(4);
    // Marksmen are RANGED — the printed clause names ground units.
    expect(getUnitMoveRange(on.combat!.units.unit_p1_marksmen, on)).toBe(1);
    // …and never the opponent's ground units.
    expect(getUnitMoveRange(on.combat!.units.unit_p2_skeletons, on)).toBe(3);

    const off = playOption(combat(false), "artifact.necklace_of_swiftness", 0);
    expect(getUnitMoveRange(off.combat!.units.unit_p1_crusaders, off)).toBe(3);
  });
});

// ===========================================================================
// The flat "+1" base on the Discard-X relics (4 cards)
// ===========================================================================

describe("Balance Pack artifacts — the Discard-X relics gain a flat +1 base", () => {
  it("Celestial Necklace of Bliss: paying NO discards still adds +1 attack (observable damage)", () => {
    const build = (balance: boolean) => {
      const state = combat(balance);
      state.combat!.units.unit_p1_griffins.attack = 5;
      state.combat!.units.unit_p2_skeletons.defense = 0;
      state.players.p1.hand = ["artifact.celestial_necklace_of_bliss" as CardId];
      state.combat!.units.unit_p1_griffins.position = 13;
      state.combat!.units.unit_p2_skeletons.position = 14;
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      return state;
    };

    const declared = applyOk(build(true), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const offer = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.celestial_necklace_of_bliss" &&
        (legal.action.optionIndex ?? 0) === 0
    );
    expect(offer, "the Discard-X side is offered in the attack window").toBeTruthy();
    const withCard = passAllReactions(applyOk(declared, offer!.action));
    const boosted = withCard.combat!.units.unit_p2_skeletons.damage;

    // CONTROL: the same attack with the card never played.
    const plain = passAllReactions(
      applyOk(build(true), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(boosted).toBe(plain.combat!.units.unit_p2_skeletons.damage + 1);
  });

  it("Celestial Necklace of Bliss: discarding 2 cards adds +3 attack (base 1 + 1 per discard)", () => {
    const build = () => {
      const state = combat(true);
      state.combat!.units.unit_p1_griffins.attack = 5;
      state.combat!.units.unit_p2_skeletons.defense = 0;
      state.players.p1.hand = [
        "artifact.celestial_necklace_of_bliss" as CardId,
        "stat.power" as CardId,
        "stat.power" as CardId
      ];
      state.combat!.units.unit_p1_griffins.position = 13;
      state.combat!.units.unit_p2_skeletons.position = 14;
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      return state;
    };

    const declared = applyOk(build(), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const offer = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.celestial_necklace_of_bliss" &&
        (legal.action.optionIndex ?? 0) === 0
    );
    expect(offer, "the Discard-X side is offered").toBeTruthy();
    // Pay TWO discards: the observable blow must move by base(1) + 1×2 = 3, not
    // by 2 (which is all a base-less reprint would grant).
    const paid = passAllReactions(
      applyOk(declared, {
        ...(offer!.action as Extract<GameAction, { type: "PLAY_REACTION" }>),
        costCardIds: ["stat.power", "stat.power"] as CardId[]
      })
    );
    const plain = passAllReactions(
      applyOk(build(), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(paid.combat!.units.unit_p2_skeletons.damage).toBe(
      plain.combat!.units.unit_p2_skeletons.damage + 3
    );
  });

  it("every Discard-X side reads +1 base (the reprint) instead of +0 (the printed card)", () => {
    const sides: { cardId: string; optionIndex: number }[] = [
      { cardId: "artifact.celestial_necklace_of_bliss", optionIndex: 0 },
      { cardId: "artifact.sword_of_judgement", optionIndex: 0 },
      { cardId: "artifact.sword_of_judgement", optionIndex: 1 },
      { cardId: "artifact.lions_shield_of_courage", optionIndex: 0 },
      { cardId: "artifact.sandals_of_the_saint", optionIndex: 0 }
    ];
    for (const side of sides) {
      const reprint = polishBalanceArtifactCards[side.cardId];
      const printed = cardLibrary[side.cardId];
      expect(reprint?.effect.type).toBe("CHOOSE_ONE");
      const balanced = reprint!.effect.type === "CHOOSE_ONE" ? reprint!.effect.options[side.optionIndex].effect : null;
      const classic = printed!.effect.type === "CHOOSE_ONE" ? printed!.effect.options[side.optionIndex].effect : null;
      expect(
        balanced && "amount" in balanced ? balanced.amount : undefined,
        `${side.cardId}[${side.optionIndex}] reprint base`
      ).toBe(1);
      expect(
        classic && "amount" in classic ? classic.amount : undefined,
        `${side.cardId}[${side.optionIndex}] printed base (CONTROL)`
      ).toBe(0);
      expect(balanced && "perCostCard" in balanced ? balanced.perCostCard : undefined).toBe(1);
    }
  });
});

// ===========================================================================
// Cards of Prophecy — the rewritten dice artifact
// ===========================================================================

describe("Balance Pack artifacts — Cards of Prophecy", () => {
  it("option A lays a lasting roll-2-KEEP-THE-HIGHER buff (and really keeps the higher die)", () => {
    const on = playOption(combat(true), "artifact.cards_of_prophecy", 0, "unit_p1_griffins");
    const buff = effectsOn(on, "unit_p1_griffins").find((effect) => effect.name === "Cards of Prophecy");
    expect(buff, "the advantage buff was laid").toBeTruthy();
    expect(buff!.modifiers).toEqual([{ type: "ATTACK_ROLL_ADVANTAGE" }]);
    expect(buff!.duration.type).toBe("next-activation");

    // OBSERVABLE: the attack throws two dice and resolves the "+1", not the "-1".
    on.combat!.units.unit_p1_griffins.attack = 5;
    on.combat!.units.unit_p2_skeletons.defense = 0;
    const advantaged = attackDamage(on, [-1, 1]);
    expect(advantaged.damage).toBe(6);

    // CONTROL: the same scripted dice with no buff resolve the single first die.
    const plain = combat(true);
    plain.combat!.units.unit_p1_griffins.attack = 5;
    plain.combat!.units.unit_p2_skeletons.defense = 0;
    expect(attackDamage(plain, [-1, 1]).damage).toBe(4);
  });

  it("CONTROL: with the rule OFF Cards of Prophecy has no combat unit-buff side", () => {
    const off = combat(false);
    off.players.p1.hand = ["artifact.cards_of_prophecy" as CardId];
    const combatPlays = plays(off, "artifact.cards_of_prophecy").filter(
      (action) => action.target?.type === "unit"
    );
    expect(combatPlays).toHaveLength(0);
  });

  it("option B throws the die 3 times and lets the owner resolve ANY of the three", () => {
    const state = combat(true);
    state.combat!.units.unit_p1_griffins.attack = 5;
    state.combat!.units.unit_p2_skeletons.defense = 0;
    state.players.p1.hand = ["artifact.cards_of_prophecy" as CardId];
    state.combat!.dice.scriptedRolls = [-1, 0, 1];
    state.combat!.dice.rollCount = 0;
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.position = 14;

    let next = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(next.pendingChoice?.type, "the held artifact opened the die window").toBe("ATTACK_DIE_REROLL");

    const reroll = getLegalActions(next, "p1").find((legal) => legal.action.type === "REROLL_PENDING_CHOICE");
    expect(reroll, "the artifact offers its die use").toBeTruthy();
    next = applyOk(next, reroll!.action);

    const choice = next.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") {
      throw new Error("unreachable");
    }
    // Three throws in total (the original plus the two the reprint adds) and a
    // FREE pick among them — the printed "resolve 1 chosen result".
    expect(choice.candidates).toHaveLength(3);
    expect(choice.freeCandidateChoice).toBe(true);
    expect(choice.candidates.map((candidate) => candidate.roll)).toEqual([-1, 0, 1]);

    const keepOffers = getLegalActions(next, "p1").filter(
      (legal) => legal.action.type === "CHOOSE_PENDING_ROLL"
    );
    expect(keepOffers).toHaveLength(3);

    // Keeping the FIRST throw (an ordinary reroll forbids this) really resolves it.
    const keepFirst = keepOffers.find(
      (legal) => legal.action.type === "CHOOSE_PENDING_ROLL" && legal.action.candidateIndex === 0
    );
    expect(keepFirst).toBeTruthy();
    next = passAllReactions(applyOk(next, keepFirst!.action));
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(4); // 5 attack - 1 die
  });

  it("CONTROL: with the rule OFF the artifact rerolls ONCE and only the latest roll is keepable", () => {
    const state = combat(false);
    state.combat!.units.unit_p1_griffins.attack = 5;
    state.combat!.units.unit_p2_skeletons.defense = 0;
    state.players.p1.hand = ["artifact.cards_of_prophecy" as CardId];
    state.combat!.dice.scriptedRolls = [-1, 0, 1];
    state.combat!.dice.rollCount = 0;
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.position = 14;

    let next = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    const reroll = getLegalActions(next, "p1").find((legal) => legal.action.type === "REROLL_PENDING_CHOICE");
    next = applyOk(next, reroll!.action);
    const choice = next.pendingChoice;
    if (choice?.type !== "ATTACK_DIE_REROLL") {
      throw new Error("expected a reroll window");
    }
    expect(choice.candidates).toHaveLength(2);
    expect(choice.freeCandidateChoice).toBeUndefined();
    expect(
      getLegalActions(next, "p1").filter((legal) => legal.action.type === "CHOOSE_PENDING_ROLL")
    ).toHaveLength(1);
    const forged = applyAction(next, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: choice.id,
      candidateIndex: 0
    });
    expect(forged.errors.length, "an earlier throw stays unreachable").toBeGreaterThan(0);
  });

  it("option A lasts until the unit's NEXT activation — it SURVIVES the caster's own activation-end", () => {
    // Cast on the CURRENTLY ACTIVE unit (the realistic play: buff your own unit as
    // it acts). "Until its activation in the next round" must cover EVERY attack in
    // between, so the buff cannot be consumed by the activation already in progress.
    // The fix gives such a buff one extra activation to live through.
    const on = playOption(combat(true), "artifact.cards_of_prophecy", 0, "unit_p1_griffins");
    const buff = effectsOn(on, "unit_p1_griffins").find((effect) => effect.name === "Cards of Prophecy")!;
    // The fix: laid on the active unit, it must survive one extra activation-end.
    expect(buff.activationsRemaining).toBe(2);

    on.combat!.units.unit_p1_griffins.attack = 5;
    on.combat!.units.unit_p2_skeletons.defense = 0;

    // Its own blow this activation is advantaged: two dice, keeps the "+1" → 6.
    on.combat!.units.unit_p2_skeletons.damage = 0;
    expect(attackDamage(on, [-1, 1]).damage).toBe(6);

    // The caster's activation ENDS (the exact call the reducer makes at every
    // activation-end). The buff must survive it — otherwise no retaliation before
    // the unit acts again would be covered.
    expireEffectsForActivationEnd(on, "unit_p1_griffins");
    expect(
      effectsOn(on, "unit_p1_griffins").some((effect) => effect.name === "Cards of Prophecy"),
      "the buff survives the caster's own activation-end"
    ).toBe(true);
    // OBSERVABLE: an attack after that activation-end is still advantaged → 6.
    on.combat!.units.unit_p2_skeletons.damage = 0;
    expect(attackDamage(on, [-1, 1]).damage).toBe(6);

    // The unit ACTS AGAIN (next round) → the second activation-end expires it.
    expireEffectsForActivationEnd(on, "unit_p1_griffins");
    expect(effectsOn(on, "unit_p1_griffins").some((effect) => effect.name === "Cards of Prophecy")).toBe(false);
    // OBSERVABLE: now the single first die (−1) resolves → 4.
    on.combat!.units.unit_p2_skeletons.damage = 0;
    expect(attackDamage(on, [-1, 1]).damage).toBe(4);
  });

  it("option A gives a RETALIATION after the caster's activation-end roll-advantage; a plain unit's does not", () => {
    const buffedRetaliation = (buff: boolean): number => {
      const on = buff
        ? playOption(combat(true), "artifact.cards_of_prophecy", 0, "unit_p1_griffins")
        : combat(true);
      on.combat!.units.unit_p1_griffins.attack = 5;
      on.combat!.units.unit_p1_griffins.defense = 0;
      on.combat!.units.unit_p2_skeletons.defense = 0;
      on.combat!.units.unit_p2_skeletons.attack = 1;

      // The griffins' OWN activation has ENDED (it acted, then it is p2's turn) —
      // the exact moment a naive "next-activation" buff would already be gone. The
      // retaliation below must still be covered.
      expireEffectsForActivationEnd(on, "unit_p1_griffins");
      if (buff) {
        expect(
          effectsOn(on, "unit_p1_griffins").some((effect) => effect.name === "Cards of Prophecy"),
          "the buff survives the caster's own activation-end"
        ).toBe(true);
      }

      // p2's skeletons now attack the griffins → the griffins RETALIATE.
      on.combat!.units.unit_p2_skeletons.damage = 0;
      on.combat!.units.unit_p1_griffins.damage = 0;
      on.combat!.units.unit_p1_griffins.retaliatedThisRound = false;
      on.combat!.units.unit_p1_griffins.position = 13;
      on.combat!.units.unit_p2_skeletons.position = 14;
      on.combat!.units.unit_p2_skeletons.activatedThisRound = false;
      on.combat!.units.unit_p2_skeletons.attackedThisActivation = false;
      on.combat!.activeUnitId = "unit_p2_skeletons";
      on.activePlayerId = "p2";
      // scripted: [skeletons' attack die, griffins' retaliation dice...].
      on.combat!.dice.scriptedRolls = [0, -1, 1];
      on.combat!.dice.rollCount = 0;

      let next = passAllReactions(
        applyOk(on, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "unit_p2_skeletons",
          defenderId: "unit_p1_griffins"
        })
      );
      let safety = 6;
      while (next.pendingChoice?.type === "ATTACK_DIE_REROLL" && safety > 0) {
        safety -= 1;
        const keep = getLegalActions(next, next.pendingChoice.playerId).find(
          (legal) => legal.action.type === "CHOOSE_PENDING_ROLL"
        );
        if (!keep) break;
        next = passAllReactions(applyOk(next, keep.action));
      }
      return next.combat!.units.unit_p2_skeletons.damage;
    };

    // Buffed: the retaliation rolls two dice [-1, 1] and keeps the "+1" → 6 damage.
    expect(buffedRetaliation(true)).toBe(6);
    // CONTROL: with no buff the retaliation rolls the single first die (−1) → 4.
    expect(buffedRetaliation(false)).toBe(4);
  });

  it("CONTROL: the survive-one-more-activation rule is POSITIVE-only — a negative debuff on the active unit is not extended", () => {
    // The "next-activation on the active unit survives one extra activation-end"
    // rule is scoped to POSITIVE buffs (Cards of Prophecy A / Prayer, laid on your
    // own unit meaning "until your next-round activation"). A NEGATIVE debuff —
    // classic Shaman's Puppet shape — is naturally laid on the enemy WHILE it is
    // the active unit (a mid-attack reaction) and reads "until the end of its
    // activation", so it must NOT gain the extra activation.
    const state = combat(false);
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const positive = makeActiveEffect(
      state,
      {
        name: "Positive next-activation buff",
        scope: "unit",
        duration: { type: "next-activation" },
        polarity: "positive",
        removable: true,
        modifiers: [{ type: "ATTACK_ROLL_ADVANTAGE" }]
      },
      { type: "card", cardId: "artifact.cards_of_prophecy" as CardId, controllerId: "p2" },
      "p2",
      { type: "unit", unitId: "unit_p2_skeletons" }
    );
    // Shaman's-Puppet-shaped negative debuff on the SAME (active) unit.
    const negative = makeActiveEffect(
      state,
      {
        name: "Shaman's Puppet",
        scope: "unit",
        duration: { type: "next-activation" },
        polarity: "negative",
        removable: true,
        modifiers: [{ type: "ATTACK_ROLL_DISADVANTAGE" }]
      },
      { type: "card", cardId: "artifact.shamans_puppet" as CardId, controllerId: "p1" },
      "p1",
      { type: "unit", unitId: "unit_p2_skeletons" }
    );

    // The positive buff gains the extra activation; the negative debuff does not.
    expect(positive.activationsRemaining).toBe(2);
    expect(negative.activationsRemaining).toBeUndefined();

    state.activeEffects.push(positive, negative);
    // End that unit's CURRENT activation once. The debuff expires here (its
    // classic "until the end of its activation"); the positive buff survives.
    expireEffectsForActivationEnd(state, "unit_p2_skeletons");
    expect(state.activeEffects.some((effect) => effect.name === "Shaman's Puppet")).toBe(false);
    expect(state.activeEffects.some((effect) => effect.name === "Positive next-activation buff")).toBe(true);
  });
});

// ===========================================================================
// Shaman's Puppet — the curse lasts until the end of the NEXT combat round
// ===========================================================================

describe("Balance Pack artifacts — Shaman's Puppet", () => {
  it("curses until the end of the NEXT combat round, and really rolls the lower die", () => {
    const on = playOption(combat(true), "artifact.shamans_puppet", 0, "unit_p2_skeletons");
    const curse = effectsOn(on, "unit_p2_skeletons").find((effect) => effect.name === "Shaman's Puppet");
    expect(curse, "the curse was laid").toBeTruthy();
    expect(curse!.modifiers).toEqual([{ type: "ATTACK_ROLL_DISADVANTAGE" }]);
    // "combat-rounds: 2" = this round AND the next (the Fire Shield reading).
    expect(curse!.duration).toEqual({ type: "combat-rounds", rounds: 2 });
    expect(curse!.expiresAtCombatRoundEnd).toBe(on.combat!.round + 1);

    // OBSERVABLE: the cursed unit's attack throws two dice and keeps the "-1".
    on.combat!.units.unit_p2_skeletons.attack = 5;
    on.combat!.units.unit_p1_griffins.defense = 0;
    on.combat!.dice.scriptedRolls = [1, -1];
    on.combat!.dice.rollCount = 0;
    on.combat!.units.unit_p2_skeletons.position = 14;
    on.combat!.units.unit_p1_griffins.position = 13;
    on.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    on.combat!.units.unit_p2_skeletons.attackedThisActivation = false;
    on.combat!.activeUnitId = "unit_p2_skeletons";
    on.activePlayerId = "p2";
    const struck = passAllReactions(
      applyOk(on, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_griffins"
      })
    );
    expect(struck.combat!.units.unit_p1_griffins.damage).toBe(4); // 5 - 1

    // CONTROL: the printed card ends at the end of that unit's next activation.
    const off = playOption(combat(false), "artifact.shamans_puppet", 0, "unit_p2_skeletons");
    const printed = effectsOn(off, "unit_p2_skeletons").find((effect) => effect.name === "Shaman's Puppet")!;
    expect(printed.duration.type).toBe("next-activation");
    expect(printed.expiresAtCombatRoundEnd).toBeUndefined();
  });
});

// ===========================================================================
// Hourglass of the Evil Hour — rerolls the ENEMY's "+1" dice for a round
// ===========================================================================

describe("Balance Pack artifacts — Hourglass of the Evil Hour", () => {
  const strike = (state: GameState) => {
    state.combat!.units.unit_p2_skeletons.attack = 5;
    state.combat!.units.unit_p1_griffins.defense = 0;
    state.combat!.dice.scriptedRolls = [1, -1];
    state.combat!.dice.rollCount = 0;
    state.combat!.units.unit_p2_skeletons.position = 14;
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.attackedThisActivation = false;
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";
    let next = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_griffins"
      })
    );
    let safety = 6;
    while (next.pendingChoice?.type === "ATTACK_DIE_REROLL" && safety > 0) {
      safety -= 1;
      const keep = getLegalActions(next, next.pendingChoice.playerId).find(
        (legal) => legal.action.type === "CHOOSE_PENDING_ROLL"
      );
      if (!keep) {
        break;
      }
      next = passAllReactions(applyOk(next, keep.action));
    }
    return next.combat!.units.unit_p1_griffins.damage;
  };

  it("offers and labels the reprinted second OR arm, never the old morale roll", () => {
    const on = combat(true);
    on.players.p1.hand = ["artifact.hourglass_of_the_evil_hour" as CardId];
    const labels = getLegalActions(on, "p1")
      .filter(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "artifact.hourglass_of_the_evil_hour"
      )
      .map((legal) => legal.label);
    expect(labels.some((label) => label.includes('reroll each "+1"'))).toBe(true);
    expect(labels.some((label) => /roll the attack die|gain morale on a 0/i.test(label))).toBe(false);
  });

  it("each enemy '+1' is rerolled once for this combat round (observable damage)", () => {
    const on = playOption(combat(true), "artifact.hourglass_of_the_evil_hour", 1);
    const curse = on.activeEffects.find((effect) => effect.name === "Hourglass of the Evil Hour");
    expect(curse, "the curse is in play").toBeTruthy();
    expect(curse!.modifiers).toEqual([{ type: "REROLL_ENEMY_PLUS_ONE" }]);
    expect(curse!.duration.type).toBe("current-combat-round");
    // The enemy's "+1" is thrown away and the next scripted face (-1) stands.
    expect(strike(on)).toBe(4);
  });

  it("CONTROL: with the rule OFF the second side is the morale gamble and the '+1' stands", () => {
    const off = combat(false);
    off.players.p1.hand = ["artifact.hourglass_of_the_evil_hour" as CardId];
    const optionB = plays(off, "artifact.hourglass_of_the_evil_hour").find((action) => action.optionIndex === 1);
    expect(optionB, "the printed roll-for-morale side is still there").toBeTruthy();
    const played = passAllReactions(applyOk(off, optionB!));
    expect(played.activeEffects.some((effect) => effect.name === "Hourglass of the Evil Hour")).toBe(false);
    expect(strike(played)).toBe(6); // 5 attack + the "+1" that was never rerolled
  });
});

// ===========================================================================
// Centaur's Axe — the tripling is IGNORED on a "-1"
// ===========================================================================

describe("Balance Pack artifacts — Centaur's Axe", () => {
  const tripledDamage = (balance: boolean, die: number) => {
    const state = combat(balance);
    state.combat!.units.unit_p1_griffins.attack = 5;
    state.combat!.units.unit_p2_skeletons.defense = 0;
    state.players.p1.hand = ["artifact.centaurs_axe" as CardId];
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.position = 14;
    state.combat!.dice.scriptedRolls = [die, die, die];
    state.combat!.dice.rollCount = 0;
    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const offer = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.centaurs_axe" &&
        (legal.action.optionIndex ?? 0) === 0
    );
    expect(offer, "the tripling side is offered").toBeTruthy();
    next = applyOk(next, offer!.action);
    next = passAllReactions(next);
    return next.combat!.units.unit_p2_skeletons.damage;
  };

  it("a rolled '-1' counts ONCE (not thrice) while a '+1' is still tripled", () => {
    expect(tripledDamage(true, -1)).toBe(4); // 5 - 1
    expect(tripledDamage(true, 1)).toBe(8); // 5 + 3
  });

  it("CONTROL: the printed card triples the '-1' too", () => {
    expect(tripledDamage(false, -1)).toBe(2); // 5 - 3
    expect(tripledDamage(false, 1)).toBe(8);
  });
});

// ===========================================================================
// Golden Bow — the ongoing side also grants a ranged Attack-die reroll
// ===========================================================================

describe("Balance Pack artifacts — Golden Bow", () => {
  const rangedAttackSources = (state: GameState) => {
    const combatState = state.combat!;
    combatState.units.unit_p1_marksmen.position = 13;
    combatState.units.unit_p2_skeletons.position = 14;
    combatState.units.unit_p1_marksmen.activatedThisRound = false;
    combatState.units.unit_p1_marksmen.attackedThisActivation = false;
    combatState.activeUnitId = "unit_p1_marksmen";
    combatState.dice.scriptedRolls = [0, 0];
    combatState.dice.rollCount = 0;
    state.activePlayerId = "p1";
    const next = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    return next.pendingChoice?.type === "ATTACK_DIE_REROLL"
      ? next.pendingChoice.rerollSources.map((source) => source.name)
      : [];
  };

  it("while it is in play a RANGED unit may reroll its Attack die", () => {
    const on = playOption(combat(true), "artifact.golden_bow", 0);
    expect(on.activeEffects.some((effect) => effect.name === "Golden Bow")).toBe(true);
    expect(rangedAttackSources(on)).toContain("Golden Bow");
  });

  it("CONTROL: the printed Golden Bow grants no reroll, and a GROUND unit never gets one", () => {
    const off = playOption(combat(false), "artifact.golden_bow", 0);
    expect(rangedAttackSources(off)).not.toContain("Golden Bow");

    // Same reprint, but the attacker is a ground unit: the printed clause names
    // "your ranged units".
    const on = playOption(combat(true), "artifact.golden_bow", 0);
    on.combat!.units.unit_p1_griffins.position = 13;
    on.combat!.units.unit_p2_skeletons.position = 14;
    on.combat!.units.unit_p1_griffins.activatedThisRound = false;
    on.combat!.units.unit_p1_griffins.attackedThisActivation = false;
    on.combat!.activeUnitId = "unit_p1_griffins";
    on.combat!.dice.scriptedRolls = [0];
    on.combat!.dice.rollCount = 0;
    const ground = passAllReactions(
      applyOk(on, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(ground.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
  });
});

// ===========================================================================
// The two extra OPTIONS: Pendant of Second Sight & Speculum
// ===========================================================================

describe("Balance Pack artifacts — the added OR arms", () => {
  it("Pendant of Second Sight gains a Search (3) of your own Might & Magic deck", () => {
    const on = combat(true);
    on.players.p1.hand = ["artifact.pendant_of_second_sight" as CardId];
    on.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "ability.luck" as CardId];
    const dig = plays(on, "artifact.pendant_of_second_sight").find((action) => action.optionIndex === 2);
    expect(dig, "the third option is offered").toBeTruthy();
    const played = applyOk(on, dig!);
    // The dig reveals 3 and opens the keep-one pick.
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(choiceInfo(played).options?.length ?? 0).toBeGreaterThanOrEqual(3);

    // CONTROL: the printed card has exactly two sides.
    const off = combat(false);
    off.players.p1.hand = ["artifact.pendant_of_second_sight" as CardId];
    expect(plays(off, "artifact.pendant_of_second_sight").some((action) => action.optionIndex === 2)).toBe(false);
  });

  it("Speculum is offered when a Search starts, then gives a turn-long Search (X+1) widen", () => {
    let on = createAdventureGameState({ seed: "speculum-on", difficulty: "normal", rollFirstPlayer: false });
    on.adventure!.houseRules = { ...(on.adventure!.houseRules ?? {}), "polish-card-balance": true };
    if (on.players.p1.needsHandRefresh || on.players.p1.canMulligan) {
      on = applyOk(on, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    on.players.p1.hand = ["artifact.speculum" as CardId];
    expect(plays(on, "artifact.speculum").map((action) => action.optionIndex)).toEqual([0, 2]);
    expect(
      plays(on, "artifact.speculum").some((action) => action.optionIndex === 1),
      "the Search-start Instant cannot be armed as a free-turn map play"
    ).toBe(false);
    openSharedDeckSearch(on, "p1", "abilities", 2);
    expect(on.pendingChoice?.type === "OPTION_CHOICE" ? on.pendingChoice.context : null).toBe("scouting-prompt");
    const speculumIndex =
      on.pendingChoice?.type === "OPTION_CHOICE"
        ? on.pendingChoice.options.findIndex((option) => option.label.startsWith("Play Speculum"))
        : -1;
    expect(speculumIndex).toBeGreaterThan(0);
    const played = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: on.pendingChoice!.id,
      optionIndex: speculumIndex
    });
    expect(played.players.p1.hand).not.toContain("artifact.speculum");
    expect(
      played.players.p1.ongoingCards?.some((entry) => entry.cardId === "artifact.speculum"),
      "the lasting Instant is held in the ongoing tray until its effect expires"
    ).toBe(true);
    const override = searchCountOverrideFor(played, "p1", 2);
    expect(override, "a Search (2) now reveals 3").toBeTruthy();
    expect(override!.count).toBe(3);
    expect(override!.persist, "it widens EVERY Search until the end of the turn").toBe(true);

    // CONTROL: the printed Speculum has only two sides and no widen.
    let off = createAdventureGameState({ seed: "speculum-off", difficulty: "normal", rollFirstPlayer: false });
    if (off.players.p1.needsHandRefresh || off.players.p1.canMulligan) {
      off = applyOk(off, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    off.players.p1.hand = ["artifact.speculum" as CardId];
    const offPlays = plays(off, "artifact.speculum");
    expect(offPlays.some((action) => action.optionIndex === 2)).toBe(false);
    openSharedDeckSearch(off, "p1", "abilities", 2);
    expect(off.pendingChoice?.type === "OPTION_CHOICE" ? off.pendingChoice.context : null).not.toBe("scouting-prompt");
    expect(searchCountOverrideFor(off, "p1", 2)).toBeNull();
  });
});

// ===========================================================================
// "+1 Power, draw 1 card then discard 1 card"
// ===========================================================================

describe("Balance Pack artifacts — the +1 Power cycle riders", () => {
  for (const cardId of ["artifact.dragon_wing_tabard", "artifact.spirit_of_oppression"]) {
    it(`${cardLibrary[cardId]?.name}: the Power side draws a card and then opens the discard`, () => {
      const state = combat(true);
      state.players.p1.hand = [cardId as CardId, "spell.magic_arrow" as CardId];
      state.players.p1.deck = ["ability.luck" as CardId, "ability.leadership" as CardId];
      state.combat!.units.unit_p2_skeletons.position = 14;

      let next = applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: "unit_p2_skeletons" }
      });
      const boost = getLegalActions(next, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === cardId &&
          !legal.action.asPowerBoost
      );
      expect(boost, "the +1 Power side is offered on the cast").toBeTruthy();
      const deckBefore = next.players.p1.deck.length;
      next = applyOk(next, boost!.action);
      expect(next.players.p1.deck.length, "it drew a card").toBe(deckBefore - 1);
      expect(next.pendingChoice?.type, "…and then opened its printed discard").toBe("OPTION_CHOICE");
      expect(choiceInfo(next).context).toBe("hand-discard");
    });
  }

  it("CONTROL: the printed cards draw nothing and open no discard", () => {
    const state = combat(false);
    state.players.p1.hand = ["artifact.dragon_wing_tabard" as CardId, "spell.magic_arrow" as CardId];
    state.players.p1.deck = ["ability.luck" as CardId];
    state.combat!.units.unit_p2_skeletons.position = 14;
    let next = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    const boost = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.dragon_wing_tabard" &&
        !legal.action.asPowerBoost
    );
    const deckBefore = next.players.p1.deck.length;
    next = applyOk(next, boost!.action);
    expect(next.players.p1.deck.length).toBe(deckBefore);
    expect(choiceInfo(next).context).not.toBe("hand-discard");
  });
});

// ===========================================================================
// Eversmoking Ring of Sulfur — the remove side pays 1 valuables
// ===========================================================================

describe("Balance Pack artifacts — Eversmoking Ring of Sulfur", () => {
  const removeGain = (balance: boolean) => {
    let state = createAdventureGameState({ seed: `sulfur-${balance}`, difficulty: "normal", rollFirstPlayer: false });
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "polish-card-balance": balance };
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = ["artifact.eversmoking_ring_of_sulfur" as CardId];
    const before = state.players.p1.resources.valuables;
    const remove = plays(state, "artifact.eversmoking_ring_of_sulfur").find((action) => action.optionIndex === 1);
    expect(remove, "the remove side is offered").toBeTruthy();
    const played = applyOk(state, remove!);
    return played.players.p1.resources.valuables - before;
  };

  it("pays 1 valuables (was 2)", () => {
    expect(removeGain(true)).toBe(1);
  });

  it("CONTROL: the printed card pays 2", () => {
    expect(removeGain(false)).toBe(2);
  });
});

// ===========================================================================
// Diplomat's Ring / Ambassador's Sash — the 3-gold recruit discount
// ===========================================================================

describe("Balance Pack artifacts — the Diplomacy recruit discount", () => {
  const diplomacyLabels = (balance: boolean, cardId: string): string[] => {
    let state = createAdventureGameState({
      seed: `diplomacy-${cardId}`,
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "polish-card-balance": balance };
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.resources.gold = 200;
    state.players.p1.hand = [cardId as CardId];
    const play = plays(state, cardId)[0];
    expect(play, `${cardId} has a map play`).toBeTruthy();
    const next = applyOk(state, play);
    return next.pendingChoice?.type === "OPTION_CHOICE"
      ? next.pendingChoice.options.map((option: { label: string }) => option.label)
      : [];
  };

  for (const cardId of ["artifact.diplomats_ring", "artifact.ambassadors_sash"]) {
    it(`${cardLibrary[cardId]?.name}: every drawn recruit is 3 gold cheaper`, () => {
      const on = diplomacyLabels(true, cardId);
      const off = diplomacyLabels(false, cardId);
      expect(on.length, "the Diplomacy draw happened").toBeGreaterThan(1);
      expect(on.length).toBe(off.length);
      const goldOf = (label: string) => Number(/(\d+) gold/.exec(label)?.[1] ?? Number.NaN);
      const onCosts = on.map(goldOf).filter((value) => Number.isFinite(value));
      const offCosts = off.map(goldOf).filter((value) => Number.isFinite(value));
      expect(onCosts.length, "at least one priced recruit was offered").toBeGreaterThan(0);
      expect(onCosts).toEqual(offCosts.map((cost) => Math.max(0, cost - 3)));
    });
  }

  it("the reprints really carry the 3-gold reduction (and the printed cards none)", () => {
    for (const cardId of ["artifact.diplomats_ring", "artifact.ambassadors_sash"]) {
      const reprint = polishBalanceArtifactCards[cardId];
      const recruit =
        reprint?.effect.type === "CHOOSE_ONE"
          ? reprint.effect.options.find((option) => option.effect.type === "DIPLOMACY_RECRUIT")?.effect
          : undefined;
      expect(recruit?.type).toBe("DIPLOMACY_RECRUIT");
      expect(recruit && "goldReduction" in recruit ? recruit.goldReduction : undefined).toBe(3);
      const printed = cardLibrary[cardId];
      const classic =
        printed?.effect.type === "CHOOSE_ONE"
          ? printed.effect.options.find((option) => option.effect.type === "DIPLOMACY_RECRUIT")?.effect
          : undefined;
      expect(classic && "goldReduction" in classic ? classic.goldReduction : undefined).toBeUndefined();
    }
  });
});

// ===========================================================================
// The Polish-Spell-Book recovery family
// ===========================================================================

function bookMap(balance: boolean, seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.adventure!.houseRules = {
    ...(state.adventure!.houseRules ?? {}),
    "polish-card-balance": balance,
    "polish-spell-book": true
  };
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

describe("Balance Pack artifacts — Crown of Dragontooth under the Polish Spell Book", () => {
  const recover = (balance: boolean) => {
    const state = bookMap(balance, `dragontooth-${balance}`);
    const player = state.players.p1;
    player.hand = ["artifact.crown_of_dragontooth" as CardId];
    player.discard = ["spell.cast_a_spell" as CardId, "spell.cast_a_spell" as CardId];
    player.spellBook = [];
    player.spellBookUsed = ["spell.bless" as CardId, "spell.haste" as CardId];
    player.polishSpellsRefreshedThisRound = [];
    const play = plays(state, "artifact.crown_of_dragontooth").find((action) => action.optionIndex === 0);
    expect(play, "the recovery side is offered").toBeTruthy();
    return applyOk(state, play!);
  };

  it("returns UP TO 2 Cast a Spell cards and offers UP TO 2 Book refreshes", () => {
    const next = recover(true);
    expect(next.players.p1.hand.filter((cardId) => cardId === "spell.cast_a_spell")).toHaveLength(2);
    expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(choiceInfo(next).context).toBe("discard-pick");
    expect(choiceInfo(next).discardPick?.remaining).toBe(2);
  });

  it("CONTROL: the printed Crown returns ONE enabler and refreshes ONE Book Spell", () => {
    const next = recover(false);
    expect(next.players.p1.hand.filter((cardId) => cardId === "spell.cast_a_spell")).toHaveLength(1);
    expect(choiceInfo(next).discardPick?.remaining).toBe(1);
  });
});

describe("Balance Pack artifacts — Helm of the Alabaster Unicorn inscribes its cast", () => {
  const castFromDiscard = (balance: boolean) => {
    const state = combat(balance, `helm-${balance}`);
    state.adventure = {
      houseRules: {
        "polish-card-balance": balance,
        "polish-spell-book": true,
        "combat-move-initiative": false
      }
    } as unknown as GameState["adventure"];
    state.decks.spells = {
      id: "spells",
      drawPile: [],
      discardPile: ["spell.lightning_bolt" as CardId]
    } as GameState["decks"][string];
    state.players.p1.hand = ["artifact.helm_of_the_alabaster_unicorn" as CardId];
    state.players.p1.spellBook = [];
    state.combat!.units.unit_p2_skeletons.position = 14;
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck
    );
    expect(cast, "the Helm's Spell-deck cast is offered").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  };

  it("moves the cast Spell into the caster's Spellbook", () => {
    const next = castFromDiscard(true);
    expect(next.players.p1.spellBook).toContain("spell.lightning_bolt");
    expect(next.decks.spells?.discardPile).not.toContain("spell.lightning_bolt");
  });

  it("CONTROL: the printed Helm leaves the Spell in the shared discard pile", () => {
    const next = castFromDiscard(false);
    expect(next.players.p1.spellBook).not.toContain("spell.lightning_bolt");
    expect(next.decks.spells?.discardPile).toContain("spell.lightning_bolt");
  });
});

describe("Balance Pack artifacts — Blackshard of the Dead Knight", () => {
  const attackDiscarding = (balance: boolean, pitched: CardId) => {
    const state = combat(balance, `blackshard-${balance}`);
    state.adventure = {
      houseRules: {
        "polish-card-balance": balance,
        "polish-spell-book": true,
        "combat-move-initiative": false
      }
    } as unknown as GameState["adventure"];
    state.players.p1.hand = ["artifact.blackshard_of_the_dead_knight" as CardId, pitched];
    state.players.p1.deck = ["ability.luck" as CardId, "ability.leadership" as CardId];
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.position = 14;
    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const offer = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.blackshard_of_the_dead_knight" &&
        (legal.action.optionIndex ?? 0) === 0
    );
    expect(offer, "the +2 attack side is offered").toBeTruthy();
    const before = next.players.p1.deck.length;
    next = applyOk(next, {
      ...(offer!.action as Extract<GameAction, { type: "PLAY_REACTION" }>),
      costCardIds: [pitched]
    });
    return next.players.p1.deck.length < before;
  };

  it("draws when the discarded card was a 'Cast a Spell' (Polish Spell Book)", () => {
    expect(attackDiscarding(true, "spell.cast_a_spell" as CardId)).toBe(true);
  });

  it("CONTROL: with the Book on, pitching a plain card draws nothing", () => {
    expect(attackDiscarding(true, "ability.luck" as CardId)).toBe(false);
  });
});

// ===========================================================================
// Non-stall: the new windows are answerable by the AI and the AFK driver
// ===========================================================================

describe("Balance Pack artifacts — the new windows never stall a table", () => {
  const observation = (state: GameState): ComputerObservation => ({
    state: state as unknown as ComputerObservation["state"],
    playerId: "p1",
    legalActions: getLegalActions(state, "p1")
  });

  it("the 3-throw pick and the cycle discard are both answerable", () => {
    // (a) the Cards of Prophecy free pick
    const state = combat(true);
    state.players.p1.hand = ["artifact.cards_of_prophecy" as CardId];
    state.combat!.dice.scriptedRolls = [-1, 0, 1];
    state.combat!.dice.rollCount = 0;
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.position = 14;
    let next = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    const reroll = getLegalActions(next, "p1").find((legal) => legal.action.type === "REROLL_PENDING_CHOICE");
    next = applyOk(next, reroll!.action);
    expect(next.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");

    const aiPick = chooseComputerAction(observation(next));
    expect(aiPick, "the AI answers the free pick").toBeTruthy();
    expect(applyAction(next, aiPick!.action).errors).toEqual([]);

    const driven = nextTurnTimeoutAction(next, "p1");
    expect(driven, "the AFK/turn-timeout driver answers it too").toBeTruthy();
    expect(applyAction(next, driven!).errors).toEqual([]);
  });
});
