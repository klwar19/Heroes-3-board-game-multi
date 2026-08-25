/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * 26 reprinted SPELLS.
 *
 * Every claim is an OBSERVABLE outcome (the damage a blow really deals, the
 * Initiative order that really changes, how far a unit really moves, which cast
 * is really offered, what a scry really lists) paired with a rule-OFF CONTROL on
 * the SAME setup, so a pass proves the reprint moved the game — not that a flag
 * was written (CLAUDE.md #1a). Where ONLY the ladder breakpoints moved, the
 * assertion is taken at the Power value where the two readings DIVERGE.
 *
 * The fixture is the combat SANDBOX plus a minimal frozen `houseRules` block:
 * `houseRuleEnabled` reads `state.adventure?.houseRules` and nothing else, and a
 * sandbox combat never runs the adventure finalize path, so this is the cheapest
 * way to drive real casts through the real reducer under both readings. Attack
 * dice are pinned to a single face where a damage number is being measured, so
 * a delta is the reprint and never the die.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { balanceCard } from "./community-balance-cards";
import { expireEffectsForActivationEnd, expireEffectsForActivationStart } from "./active-effects";
import { spellPowerLadder } from "./effects";
import { getActivationOrder, getUnitMoveRange } from "./legal-actions";
import { hasToken } from "./tokens";
import { cardLibrary } from "@/data/cards/library";
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

/**
 * A sandbox combat whose frozen house rules carry the Community pack flag. The
 * SEED is identical on and off so the attack-die stream is identical too, and
 * `combat-move-initiative` is pinned OFF so any Combat-movement change can only
 * come from the reprint's own printed movement half.
 */
function combat(community: boolean, opts: { polish?: boolean; die?: number } = {}): GameState {
  const state = createInitialGameState("community-balance-spells");
  state.adventure = {
    houseRules: {
      "community-card-balance": community,
      "polish-card-balance": opts.polish ?? false,
      "combat-move-initiative": false
    }
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  for (const unit of Object.values(state.combat!.units)) {
    unit.damage = 0;
    unit.maxHealth = 40;
  }
  if (opts.die !== undefined) {
    state.combat!.dice.faces = [opts.die, opts.die, opts.die, opts.die, opts.die, opts.die];
  }
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

/** Casts `cardId` at `power` (paid with stat.power discards) on `target`. */
function cast(
  state: GameState,
  cardId: string,
  power: number,
  target: { type: "unit"; unitId: UnitId } | { type: "space"; position: number } | { type: "none" },
  optionIndex?: number
): GameState {
  let next = state;
  next.players.p1.hand = [cardId as CardId, ...Array.from({ length: power }, () => "stat.power" as CardId)];
  const offer = getLegalActions(next, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (target.type === "none" ||
        (target.type === "unit" &&
          legal.action.target.type === "unit" &&
          legal.action.target.unitId === target.unitId) ||
        (target.type === "space" &&
          legal.action.target.type === "space" &&
          legal.action.target.position === target.position))
  );
  expect(offer, `${cardId} should be castable at ${JSON.stringify(target)}`).toBeTruthy();
  next = applyOk(next, offer!.action);
  for (let i = 0; i < power; i += 1) {
    const boost = getLegalActions(next, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(boost, `power boost ${i + 1} should be offered`).toBeTruthy();
    next = applyOk(next, boost!.action);
  }
  return passAllReactions(next);
}

/** Answers an open OPTION_CHOICE (the Misfortune die-face pick). */
function answerOption(state: GameState, optionIndex: number): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type, "an OPTION_CHOICE should be open").toBe("OPTION_CHOICE");
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: choice!.playerId,
    choiceId: choice!.id,
    optionIndex
  });
}

function castOffers(state: GameState, cardId: string) {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
    .map((legal) => legal.action);
}

function effectsOn(state: GameState, unitId: UnitId) {
  return state.activeEffects.filter((effect) => effect.target?.type === "unit" && effect.target.unitId === unitId);
}

/** Standing spell Power for `playerId` — the Power an instant scales off. */
function grantPower(state: GameState, playerId: "p1" | "p2", amount: number): void {
  state.activeEffects.push({
    id: `effect_power_${playerId}_${amount}`,
    name: "Test Power",
    scope: "player",
    controllerId: playerId,
    duration: { type: "combat" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_POWER_BONUS", amount }],
    source: { type: "system" },
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  } as unknown as GameState["activeEffects"][number]);
}

// ===========================================================================
// A shared damage rig for the stat-reaction ladders
// ===========================================================================

/**
 * One attacker swings at one defender with the Attack die pinned to "0", and
 * `playerId` answers the declared attack with `cardId`. Returns the damage the
 * DEFENDER took, so a ladder bump shows up as an exact delta and never as die
 * noise. `power` standing Spell Power is granted to the reacting player.
 */
function reactionDamage(
  community: boolean,
  cardId: string,
  opts: {
    attackerId: UnitId;
    defenderId: UnitId;
    attackingPlayer: "p1" | "p2";
    reactingPlayer: "p1" | "p2";
    power?: number;
    attackerPosition?: number;
    defenderPosition?: number;
    prepare?: (state: GameState) => void;
  }
): number {
  const state = combat(community, { die: 0 });
  const attacker = state.combat!.units[opts.attackerId]!;
  const defender = state.combat!.units[opts.defenderId]!;
  state.activePlayerId = opts.attackingPlayer;
  state.combat!.activeUnitId = opts.attackerId;
  attacker.activatedThisRound = false;
  attacker.position = opts.attackerPosition ?? 9;
  defender.position = opts.defenderPosition ?? 10;
  // Strip printed abilities so no unit trick moves the number we are measuring.
  attacker.abilities = [];
  defender.abilities = [];
  attacker.attack = 10;
  defender.defense = 2;
  opts.prepare?.(state);
  state.players[opts.reactingPlayer].hand = [cardId as CardId];
  if (opts.power) {
    grantPower(state, opts.reactingPlayer, opts.power);
  }
  const attack = getLegalActions(state, opts.attackingPlayer).find(
    (legal) =>
      (legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_AND_ATTACK_UNIT") &&
      legal.action.attackerId === opts.attackerId &&
      legal.action.defenderId === opts.defenderId
  );
  expect(attack, "the attack should be declarable").toBeTruthy();
  let next = applyOk(state, attack!.action);
  const offer = getLegalActions(next, opts.reactingPlayer).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
  expect(offer, `${cardId} should be offered in the attack window`).toBeTruthy();
  next = passAllReactions(applyOk(next, offer!.action));
  return next.combat!.units[opts.defenderId]!.damage;
}

/** Whether `cardId` is offered at all in the same window (the tier/target gate). */
function reactionOffered(
  community: boolean,
  cardId: string,
  opts: Parameters<typeof reactionDamage>[2]
): boolean {
  const state = combat(community, { die: 0 });
  const attacker = state.combat!.units[opts.attackerId]!;
  const defender = state.combat!.units[opts.defenderId]!;
  state.activePlayerId = opts.attackingPlayer;
  state.combat!.activeUnitId = opts.attackerId;
  attacker.activatedThisRound = false;
  attacker.position = opts.attackerPosition ?? 9;
  defender.position = opts.defenderPosition ?? 10;
  attacker.abilities = [];
  defender.abilities = [];
  opts.prepare?.(state);
  state.players[opts.reactingPlayer].hand = [cardId as CardId];
  if (opts.power) {
    grantPower(state, opts.reactingPlayer, opts.power);
  }
  const attack = getLegalActions(state, opts.attackingPlayer).find(
    (legal) =>
      (legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_AND_ATTACK_UNIT") &&
      legal.action.attackerId === opts.attackerId &&
      legal.action.defenderId === opts.defenderId
  );
  expect(attack).toBeTruthy();
  const next = applyOk(state, attack!.action);
  return getLegalActions(next, opts.reactingPlayer).some(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
}

const MELEE = {
  attackerId: "unit_p1_griffins" as UnitId,
  defenderId: "unit_p2_vampires" as UnitId,
  attackingPlayer: "p1" as const,
  reactingPlayer: "p1" as const
};
/** The mirror: p2 swings, p1 answers on its own defending unit. */
const INCOMING = {
  attackerId: "unit_p2_vampires" as UnitId,
  defenderId: "unit_p1_crusaders" as UnitId,
  attackingPlayer: "p2" as const,
  reactingPlayer: "p1" as const
};

// ===========================================================================
// AIR
// ===========================================================================

describe("Community pack — Haste", () => {
  it("grants +3 Initiative and +1 Combat space, and the activation ORDER really moves", () => {
    const on = cast(combat(true), "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    const buff = effectsOn(on, "unit_p1_marksmen").find((effect) => effect.name === "Haste");
    expect(buff, "Haste laid its buff").toBeTruthy();
    expect(buff!.modifiers).toEqual(
      expect.arrayContaining([
        { type: "INITIATIVE_BONUS", amount: 3 },
        { type: "MOVEMENT_BONUS", amount: 1 }
      ])
    );
    // Observable, not a field read: the Marksmen (printed Initiative 1, the
    // slowest unit on the board) are pushed up the activation order by +3.
    const orderIndex = (state: GameState) =>
      getActivationOrder(state.combat!, state.activeEffects).findIndex((unit) => unit.id === "unit_p1_marksmen");
    // At Power 2 the reprint pays +9 where the printed card pays +3 — enough to
    // lift the slowest unit on the board past the pack, which the printed card
    // does not manage on the SAME setup.
    const fast = cast(combat(true), "spell.haste", 2, { type: "unit", unitId: "unit_p1_marksmen" });
    const printed = cast(combat(false), "spell.haste", 2, { type: "unit", unitId: "unit_p1_marksmen" });
    expect(orderIndex(fast)).toBeLessThan(orderIndex(printed));
    // And the printed movement half really moves a ranged unit's 1-space range.
    expect(getUnitMoveRange(on.combat!.units.unit_p1_marksmen, on)).toBe(2);
  });

  it("CONTROL: rule OFF it is the printed +1 Initiative and moves nothing", () => {
    const off = cast(combat(false), "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    const buff = effectsOn(off, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!;
    expect(buff.modifiers).toEqual(expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 1 }]));
    expect(getUnitMoveRange(off.combat!.units.unit_p1_marksmen, off)).toBe(1);
  });

  it("scales to +6 at Power 1 (the classic ladder pays +2 there)", () => {
    const on = cast(combat(true), "spell.haste", 1, { type: "unit", unitId: "unit_p1_marksmen" });
    expect(effectsOn(on, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 6 }])
    );
    const off = cast(combat(false), "spell.haste", 1, { type: "unit", unitId: "unit_p1_marksmen" });
    expect(effectsOn(off, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 2 }])
    );
  });
});

describe("Community pack — Fortune", () => {
  it("its die use SETS a die instead of rerolling it — the window offers the set button", () => {
    const on = cast(combat(true), "spell.fortune", 0, { type: "none" });
    const fortune = on.activeEffects.find((effect) => effect.name === "Fortune")!;
    expect(fortune.modifiers).toEqual(
      expect.arrayContaining([
        { type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: true, chooseResult: undefined, setDieFace: 1 }
      ])
    );

    // The observable half: with the effect standing and a "-1" on the table, the
    // die window offers "Set a die to +1" — and taking it really moves the roll.
    const attacked = declareWithEffect(on, -1);
    const setOffer = getLegalActions(attacked, "p1").find(
      (legal) => legal.action.type === "REROLL_PENDING_CHOICE" && legal.action.useSetDie === true
    );
    expect(setOffer, "the set-die button must be offered").toBeTruthy();
    const settled = applyOk(attacked, setOffer!.action);
    const choice = settled.pendingChoice as { candidates: { roll: number }[] } | null;
    expect(choice?.candidates.at(-1)?.roll).toBe(1);
  });

  it("CONTROL: rule OFF Fortune only REROLLS — no set-die button exists", () => {
    const off = cast(combat(false), "spell.fortune", 0, { type: "none" });
    const fortune = off.activeEffects.find((effect) => effect.name === "Fortune")!;
    expect(fortune.modifiers).toEqual(
      expect.arrayContaining([
        {
          type: "ATTACK_DIE_REROLL",
          maxUsesPerRoll: 1,
          consumeEffectOnUse: true,
          chooseResult: true,
          setDieFace: undefined
        }
      ])
    );
    const attacked = declareWithEffect(off, -1);
    expect(
      getLegalActions(attacked, "p1").some(
        (legal) => legal.action.type === "REROLL_PENDING_CHOICE" && legal.action.useSetDie === true
      )
    ).toBe(false);
    expect(
      getLegalActions(attacked, "p1").some(
        (legal) => legal.action.type === "REROLL_PENDING_CHOICE" && legal.action.useSetDie !== true
      )
    ).toBe(true);
  });

  it("grants 2 uses at Power 1 and 3 at Power 2", () => {
    for (const [power, uses] of [
      [1, 2],
      [2, 3]
    ] as const) {
      const on = cast(combat(true), "spell.fortune", power, { type: "none" });
      const fortune = on.activeEffects.find((effect) => effect.name === "Fortune")!;
      expect(
        fortune.modifiers.find((modifier) => modifier.type === "ATTACK_DIE_REROLL")
      ).toMatchObject({ maxUsesPerRoll: uses, setDieFace: 1 });
    }
  });
});

/**
 * p1's griffins declare an attack with the die pinned to `face`, so the reroll
 * window opens on a known roll. The Fortune effect cast beforehand survives.
 */
function declareWithEffect(state: GameState, face: number): GameState {
  const next = state;
  next.combat!.dice.faces = [face, face, face, face, face, face];
  next.combat!.units.unit_p1_griffins.position = 9;
  next.combat!.units.unit_p2_vampires.position = 10;
  next.combat!.units.unit_p1_griffins.abilities = [];
  next.combat!.units.unit_p2_vampires.abilities = [];
  next.players.p1.hand = [];
  const attack = getLegalActions(next, "p1").find(
    (legal) =>
      legal.action.type === "ATTACK_UNIT" &&
      legal.action.attackerId === "unit_p1_griffins" &&
      legal.action.defenderId === "unit_p2_vampires"
  );
  expect(attack, "the attack should be declarable").toBeTruthy();
  return passAllReactions(applyOk(next, attack!.action));
}

describe("Community pack — Precision", () => {
  it("adds +2 attack at Power 0 (the printed card adds +1)", () => {
    const shoot = (community: boolean) =>
      reactionDamage(community, "spell.precision", {
        ...MELEE,
        attackerId: "unit_p1_marksmen" as UnitId,
        attackerPosition: 2,
        defenderPosition: 15
      });
    expect(shoot(true)).toBe(shoot(false) + 1);
  });
});

describe("Community pack — View Air", () => {
  it("the Power-0 rung DISCOVERS an adjacent Map tile instead of paying 3 gold", () => {
    const play = (community: boolean) => {
      const state = mapState(community);
      const goldBefore = state.players.p1.resources.gold;
      state.players.p1.hand = ["spell.view_air" as CardId];
      const offer = getLegalActions(state, "p1").find(
        (legal) =>
          (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
          legal.action.cardId === "spell.view_air" &&
          (legal.action.optionIndex ?? 0) === 0
      );
      expect(offer, "View Air's first option should be playable on the map").toBeTruthy();
      const next = applyOk(state, offer!.action);
      return { gold: next.players.p1.resources.gold - goldBefore, state: next };
    };
    // Observable: the community rung pays NO gold at all …
    const on = play(true);
    expect(on.gold).toBe(0);
    // … and what the engine resolves instead is the Speculum discovery arm,
    // read through the same library seam the resolution takes.
    const resolved = balanceCard(on.state, "spell.view_air");
    const chooseOne = resolved!.effect as Extract<NonNullable<typeof resolved>["effect"], { type: "CHOOSE_ONE" }>;
    expect(chooseOne.options[0]!.effect).toEqual({ type: "DISCOVER_TILE_CARD" });

    // CONTROL: the printed rung pays 3 gold.
    const off = play(false);
    expect(off.gold).toBe(3);
    const printed = cardLibrary["spell.view_air"]!.effect as Extract<
      (typeof cardLibrary)[string]["effect"],
      { type: "CHOOSE_ONE" }
    >;
    expect(printed.options[0]!.effect).toEqual({ type: "GAIN_RESOURCES", gain: { gold: 3 } });
  });

  // LIMIT (stated, not hidden): the default adventure fixture starts the Hero on
  // its home tile with no face-down ADJACENT tile, so the discovery arm resolves
  // to "nothing to discover" there. The arm itself is the Speculum's
  // DISCOVER_TILE_CARD, already covered by the artifact's own tests — what this
  // reprint changes, and what is pinned above, is WHICH arm the Power-0 rung is.
});

/** A minimal adventure table with p1 on turn and its hand step settled. */
function mapState(community: boolean, polish = false): GameState {
  let state = createAdventureGameState({
    seed: "community-balance-map",
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "community-card-balance": community, "polish-card-balance": polish }
  });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state.activePlayerId = "p1";
  }
  return state;
}

describe("Community pack — Counterstrike", () => {
  it("frees a SILVER unit at Power 1; the printed ladder needs Power 2", () => {
    const setup = (community: boolean) => {
      const state = combat(community);
      state.combat!.units.unit_p1_crusaders.grade = "silver";
      state.combat!.units.unit_p1_crusaders.retaliatedThisRound = true;
      return state;
    };
    expect(
      cast(setup(true), "spell.counterstrike", 1, { type: "unit", unitId: "unit_p1_crusaders" }).combat!.units
        .unit_p1_crusaders.retaliatedThisRound
    ).toBe(false);
    expect(
      cast(setup(false), "spell.counterstrike", 1, { type: "unit", unitId: "unit_p1_crusaders" }).combat!.units
        .unit_p1_crusaders.retaliatedThisRound
    ).toBe(true);
  });
});

describe("Community pack — Chain Lightning", () => {
  it("at Power 0 the THIRD unit in the chain takes no damage", () => {
    const bolt = (community: boolean) => {
      const state = combat(community, { die: 0 });
      // Three enemies in a row so the chain has three distinct targets.
      state.combat!.units.unit_p2_skeletons.position = 9;
      state.combat!.units.unit_p2_vampires.position = 10;
      state.combat!.units.unit_p2_dread_knights.position = 12;
      for (const unit of Object.values(state.combat!.units)) {
        unit.abilities = [];
      }
      let next = cast(state, "spell.chain_lightning", 0, { type: "unit", unitId: "unit_p2_skeletons" });
      // The chain may open a pick for each further link; take the first offer.
      let safety = 6;
      while (next.pendingChoice && safety > 0) {
        safety -= 1;
        const pick = getLegalActions(next, "p1").find(
          (legal) => legal.action.type === "CHOOSE_OPTION" || legal.action.type === "CHOOSE_ABILITY_TARGET"
        );
        if (!pick) {
          break;
        }
        next = passAllReactions(applyOk(next, pick.action));
      }
      return Object.values(next.combat!.units).map((unit) => unit.damage);
    };
    const on = bolt(true);
    const off = bolt(false);
    // The reprint's Power-0 rung is 1/1/0 — one less unit in the chain takes a
    // point, so exactly one less point of damage lands on the board.
    expect(off.filter((value) => value > 0)).toHaveLength(3);
    expect(on.filter((value) => value > 0)).toHaveLength(2);
    expect(on.reduce((sum, value) => sum + value, 0)).toBe(off.reduce((sum, value) => sum + value, 0) - 1);
  });
});

// ===========================================================================
// EARTH
// ===========================================================================

describe("Community pack — Slow", () => {
  it("takes 2 Combat spaces at Power 1 (printed movement half), initiative unchanged", () => {
    const on = cast(combat(true), "spell.slow", 1, { type: "unit", unitId: "unit_p2_vampires" });
    const debuff = effectsOn(on, "unit_p2_vampires").find((effect) => effect.name === "Slow")!;
    expect(debuff.modifiers).toEqual(
      expect.arrayContaining([
        { type: "INITIATIVE_BONUS", amount: -2 },
        { type: "MOVEMENT_BONUS", amount: -2 }
      ])
    );
    const base = getUnitMoveRange(combat(true).combat!.units.unit_p2_vampires, combat(true));
    expect(getUnitMoveRange(on.combat!.units.unit_p2_vampires, on)).toBe(Math.max(1, base - 2));

    // CONTROL: the printed card moves the initiative only.
    const off = cast(combat(false), "spell.slow", 1, { type: "unit", unitId: "unit_p2_vampires" });
    expect(getUnitMoveRange(off.combat!.units.unit_p2_vampires, off)).toBe(base);
  });
});

describe("Community pack — Shield & Stone Skin", () => {
  it("Shield softens the blow by 2 at Power 0 (the printed card by 1)", () => {
    const on = reactionDamage(true, "spell.shield", INCOMING);
    const off = reactionDamage(false, "spell.shield", INCOMING);
    expect(on).toBe(off - 1);
  });

  it("Stone Skin softens the blow by 2 at Power 0 (the printed card by 1)", () => {
    const on = reactionDamage(true, "spell.stone_skin", INCOMING);
    const off = reactionDamage(false, "spell.stone_skin", INCOMING);
    expect(on).toBe(off - 1);
  });
});

describe("Community pack — Anti-Magic", () => {
  it("wards a SILVER unit at Power 1; the printed ladder reaches only bronze there", () => {
    const ward = (community: boolean) => {
      const state = combat(community);
      state.combat!.units.unit_p1_crusaders.grade = "silver";
      const next = cast(state, "spell.anti_magic", 1, { type: "unit", unitId: "unit_p1_crusaders" });
      return effectsOn(next, "unit_p1_crusaders").some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "UNIT_SPELL_IMMUNE")
      );
    };
    expect(ward(true)).toBe(true);
    expect(ward(false)).toBe(false);
  });
});

describe("Community pack — Town Portal", () => {
  it("its +1 / +2 movement riders cost 1 / 2 Power (printed: 2 / 4)", () => {
    const costs = (community: boolean) => {
      const state = mapState(community);
      // Read the definition the ENGINE resolves right now, through the same
      // library seam every offer and every resolution takes.
      const resolved = balanceCard(state, "spell.town_portal");
      expect(resolved?.effect.type).toBe("CHOOSE_ONE");
      const effect = resolved!.effect as Extract<NonNullable<typeof resolved>["effect"], { type: "CHOOSE_ONE" }>;
      return effect.options.map((option) => option.cost?.powerCost ?? 0);
    };
    expect(costs(true)).toEqual([0, 1, 2]);
    expect(costs(false)).toEqual([0, 2, 4]);
  });

  // LIMIT (stated, not hidden): Town Portal needs a controlled Town or
  // Settlement OTHER than the one the Hero already stands on, which the default
  // adventure fixture does not provide, so no end-to-end teleport is driven
  // here. The engine reads the ladder above through `balanceCard` at every map
  // seam (`openMapSpellBoost` / `applyMapSpellAtPower` / `finalizeMapSpellEffect`
  // / `resolveMapSpellBoostChoice`, all fixed in this change to stop reading the
  // raw printed library), so the offer, the boost menu and the resolution all
  // take the numbers asserted above.
});

// ===========================================================================
// FIRE
// ===========================================================================

describe("Community pack — Visions", () => {
  it("scrys 2 cards at Power 0 and never DISCARDS one — the second option is 'put on the bottom'", () => {
    const scry = (community: boolean) => {
      const state = mapState(community);
      state.players.p1.hand = ["spell.visions" as CardId];
      const offer = getLegalActions(state, "p1").find(
        (legal) =>
          (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
          legal.action.cardId === "spell.visions"
      );
      expect(offer, "Visions should be playable on the map").toBeTruthy();
      let next = applyOk(state, offer!.action);
      const deckChoice = next.pendingChoice as { visionsDeck?: { count: number } } | null;
      expect(deckChoice?.visionsDeck).toBeTruthy();
      const count = deckChoice!.visionsDeck!.count;
      // Pick the bronze deck and read the per-card step's options.
      const pick = getLegalActions(next, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION");
      next = applyOk(next, pick!.action);
      const step = next.pendingChoice as { options: { label: string }[] } | null;
      return { count, labels: step?.options.map((option) => option.label) ?? [], state: next };
    };

    const on = scry(true);
    expect(on.count).toBe(2);
    expect(on.labels.some((label) => label.startsWith("Discard "))).toBe(false);
    expect(on.labels.some((label) => label.includes("on the bottom"))).toBe(true);

    const off = scry(false);
    expect(off.count).toBe(1);
    expect(off.labels.some((label) => label.startsWith("Discard "))).toBe(true);
  });

  it("the 'bottom' pick really returns the card to the deck instead of the discard pile", () => {
    const state = mapState(true);
    state.players.p1.hand = ["spell.visions" as CardId];
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
        legal.action.cardId === "spell.visions"
    )!;
    let next = applyOk(state, offer.action);
    next = applyOk(next, getLegalActions(next, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION")!.action);
    // The first deck option takes the WHOLE remainder off one deck, so every
    // lifted card records that same tier (2026-08-26: the tier rides each card,
    // because one cast may now lift from several Neutral decks).
    const tier = (next.pendingChoice as { visionsScry?: { remainingTiers?: string[] } }).visionsScry!
      .remainingTiers![0]!;
    const deckId = Object.keys(next.decks).find((id) => id.includes(tier))!;
    const discardBefore = next.decks[deckId]!.discardPile.length;
    const drawBefore = next.decks[deckId]!.drawPile.length;
    // Answer every step with the SECOND half of the option list (the bottom).
    let safety = 8;
    while (next.pendingChoice && (next.pendingChoice as { context?: string }).context === "visions-scry" && safety > 0) {
      safety -= 1;
      const remaining = (next.pendingChoice as { visionsScry: { remaining: string[] } }).visionsScry.remaining.length;
      next = applyOk(next, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: next.pendingChoice!.id,
        optionIndex: remaining // the first "put on the bottom" option
      });
    }
    // Nothing was discarded, and the two lifted cards are back in the deck.
    expect(next.decks[deckId]!.discardPile.length).toBe(discardBefore);
    expect(next.decks[deckId]!.drawPile.length).toBe(drawBefore + 2);
  });
});

describe("Community pack — Fire Wall", () => {
  it("deals 2 at Power 1 (the printed wall needs Power 2) and burns at ACTIVATION", () => {
    const on = cast(combat(true), "spell.fire_wall", 1, { type: "space", position: 9 });
    const onToken = on.combat!.battlefieldTokens?.find((token) => token.kind === "fire_wall");
    expect(onToken?.damage).toBe(2);
    expect(onToken?.burnsAtActivation).toBe(true);

    const off = cast(combat(false), "spell.fire_wall", 1, { type: "space", position: 9 });
    const offToken = off.combat!.battlefieldTokens?.find((token) => token.kind === "fire_wall");
    expect(offToken?.damage).toBe(1);
    expect(offToken?.burnsAtActivation).toBeUndefined();
  });

  it("a unit that STARTS its activation on the wall really takes the damage", () => {
    const burn = (community: boolean) => {
      const state = combat(community, { die: 0 });
      const walled = cast(state, "spell.fire_wall", 1, { type: "space", position: 3 });
      const victim = walled.combat!.units.unit_p2_vampires;
      victim.position = 3;
      victim.damage = 0;
      victim.activatedThisRound = false;
      // Everyone else has acted, so ending the caster's activation hands the
      // turn to the unit standing on the wall.
      for (const unit of Object.values(walled.combat!.units)) {
        unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_vampires";
      }
      walled.combat!.activeUnitId = "unit_p1_griffins";
      walled.activePlayerId = "p1";
      const next = applyOk(walled, {
        type: "END_ACTIVATION",
        playerId: "p1",
        unitId: "unit_p1_griffins"
      });
      return next.combat!.units.unit_p2_vampires.damage;
    };
    expect(burn(true)).toBeGreaterThan(0);
    expect(burn(false)).toBe(0);
  });
});

describe("Community pack — Misfortune", () => {
  // The sheet's playtest report: "Doesn't do anything but it's treated as an
  // Ongoing effect. You are however forced to pick a target which is wrong."
  // The forced pick was real — CREATE_ENEMY_DIE_SET was missing from
  // getTargetsForCard's self-targeted list, so it fell through to the
  // "enemy-unit" default and demanded a unit the card never mentions (which is
  // also why the ongoing looked inert: nothing happened to the picked unit).

  it("picks NO unit: the only cast is target-less, and it opens a die-FACE pick instead", () => {
    const state = combat(true);
    state.players.p1.hand = ["spell.misfortune" as CardId];
    const targets = castOffers(state, "spell.misfortune").map((action) =>
      action.type === "CAST_SPELL" ? action.target.type : "?"
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((type) => type === "none"), `offered targets: ${targets.join(", ")}`).toBe(true);

    // The cast then asks the caster which Attack-die result to dictate.
    const cast1 = cast(combat(true), "spell.misfortune", 0, { type: "none" });
    expect(cast1.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(cast1.pendingChoice?.type === "OPTION_CHOICE" && cast1.pendingChoice.context).toBe("misfortune-face");
    // Answerable by anyone — the pick is an ordinary OPTION_CHOICE owned by the
    // caster, so the AI / AFK driver can close it (no new stall surface).
    expect(
      getLegalActions(cast1, "p1").some(
        (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === cast1.pendingChoice!.id
      )
    ).toBe(true);
  });

  it("the CHOSEN face is what the enemy's die is set to — '-1' softens the blow, '+1' hardens it", () => {
    // Every die is pinned to "0", so the ONLY thing that can move the damage is
    // the face Misfortune dictates. Mutation check: a hard-coded face makes both
    // numbers identical and this test fails.
    const hit = (facePick: number | null) => {
      const state = combat(true, { die: 0 });
      state.combat!.units.unit_p1_griffins.position = 9;
      state.combat!.units.unit_p2_vampires.position = 10;
      for (const unit of Object.values(state.combat!.units)) {
        unit.abilities = [];
      }
      state.combat!.units.unit_p2_vampires.attack = 10;
      state.combat!.units.unit_p1_griffins.defense = 2;
      let next =
        facePick === null
          ? state
          : answerOption(cast(state, "spell.misfortune", 0, { type: "none" }), facePick);
      next.activePlayerId = "p2";
      next.combat!.activeUnitId = "unit_p2_vampires";
      next.combat!.units.unit_p2_vampires.activatedThisRound = false;
      next.players.p1.hand = [];
      const attack = getLegalActions(next, "p2").find(
        (legal) =>
          legal.action.type === "ATTACK_UNIT" &&
          legal.action.attackerId === "unit_p2_vampires" &&
          legal.action.defenderId === "unit_p1_griffins"
      )!;
      next = passAllReactions(applyOk(next, attack.action));
      return next.combat!.units.unit_p1_griffins.damage;
    };
    const bare = hit(null);
    // Option 0 is "-1", option 2 is "+1" (worst first, so an AFK default helps
    // the caster). A "0" die forced to "-1" costs the enemy 1, to "+1" pays 1.
    expect(hit(0)).toBe(bare - 1);
    expect(hit(2)).toBe(bare + 1);
  });

  it("sets one die of the ENEMY's next attack roll to -1 — the blow really lands softer", () => {
    const hit = (community: boolean) => {
      // The die is pinned to "+1", so any softening can ONLY be Misfortune.
      const state = combat(community, { die: 1 });
      state.combat!.units.unit_p1_griffins.position = 9;
      state.combat!.units.unit_p2_vampires.position = 10;
      for (const unit of Object.values(state.combat!.units)) {
        unit.abilities = [];
      }
      state.combat!.units.unit_p2_vampires.attack = 10;
      state.combat!.units.unit_p1_griffins.defense = 2;
      // p1 casts Misfortune on its own activation.
      let next = community
        ? answerOption(cast(state, "spell.misfortune", 0, { type: "none" }), 0)
        : (() => {
            // The printed card is a REACTION; there is no own-turn cast, so the
            // control simply skips it and takes the same swing bare.
            state.players.p1.hand = [];
            return state;
          })();
      // Now p2 swings.
      next.activePlayerId = "p2";
      next.combat!.activeUnitId = "unit_p2_vampires";
      next.combat!.units.unit_p2_vampires.activatedThisRound = false;
      next.players.p1.hand = [];
      const attack = getLegalActions(next, "p2").find(
        (legal) =>
          legal.action.type === "ATTACK_UNIT" &&
          legal.action.attackerId === "unit_p2_vampires" &&
          legal.action.defenderId === "unit_p1_griffins"
      );
      expect(attack, "p2 should be able to swing").toBeTruthy();
      next = passAllReactions(applyOk(next, attack!.action));
      return next.combat!.units.unit_p1_griffins.damage;
    };
    // "+1" die → "-1" die is a 2-point swing on the blow.
    expect(hit(true)).toBe(hit(false) - 2);
  });

  it("its budget is 1 roll at Power 0 and 2 at Power 1 — the SECOND enemy roll is spared at Power 0", () => {
    const state = cast(combat(true, { die: 1 }), "spell.misfortune", 0, { type: "none" });
    const effect = state.activeEffects.find((candidate) => candidate.name === "Misfortune")!;
    expect(effect.dieSetsRemaining).toBe(1);
    const two = cast(combat(true, { die: 1 }), "spell.misfortune", 1, { type: "none" });
    expect(two.activeEffects.find((candidate) => candidate.name === "Misfortune")!.dieSetsRemaining).toBe(2);
  });

  it("CONTROL: rule OFF Misfortune has no own-turn cast at all (it is a printed reaction)", () => {
    const off = combat(false);
    off.players.p1.hand = ["spell.misfortune" as CardId];
    expect(castOffers(off, "spell.misfortune")).toEqual([]);
  });
});

describe("Community pack — Bloodlust, Curse & Weakness", () => {
  it("Bloodlust adds +2 attack at Power 0 (the printed card adds +1)", () => {
    expect(reactionDamage(true, "spell.bloodlust", MELEE)).toBe(reactionDamage(false, "spell.bloodlust", MELEE) + 1);
  });

  it("Curse strips 2 defense at Power 0 (the printed card strips 1)", () => {
    expect(reactionDamage(true, "spell.curse", MELEE)).toBe(reactionDamage(false, "spell.curse", MELEE) + 1);
  });

  it("Weakness strips 2 attack at Power 0 (the printed card strips 1)", () => {
    expect(reactionDamage(true, "spell.weakness", INCOMING)).toBe(
      reactionDamage(false, "spell.weakness", INCOMING) - 1
    );
  });
});

describe("Community pack — Inferno", () => {
  it("deals a flat 1 to the unit on the chosen space BEFORE the dice — even when every die whiffs", () => {
    const blast = (community: boolean) => {
      // Every die shows "0", so the printed spell deals nothing at all.
      const state = combat(community, { die: 0 });
      state.combat!.units.unit_p2_vampires.position = 3;
      for (const unit of Object.values(state.combat!.units)) {
        unit.abilities = [];
      }
      const next = cast(state, "spell.inferno", 0, { type: "space", position: 3 });
      return next.combat!.units.unit_p2_vampires.damage;
    };
    expect(blast(true)).toBe(1);
    expect(blast(false)).toBe(0);
  });

  it("its top rung rolls 3 dice, not 4 — one less point of area damage", () => {
    const blast = (community: boolean) => {
      // Every die shows "+1", so the area damage IS the roll count.
      const state = combat(community, { die: 1 });
      state.combat!.units.unit_p2_vampires.position = 3;
      state.combat!.units.unit_p2_skeletons.position = 0;
      state.combat!.units.unit_p2_dread_knights.position = 1;
      for (const unit of Object.values(state.combat!.units)) {
        unit.abilities = [];
        unit.maxHealth = 99;
      }
      const next = cast(state, "spell.inferno", 2, { type: "space", position: 3 });
      return next.combat!.units.unit_p2_vampires.damage;
    };
    // Community: 1 pre-damage + 3 rolled "+1"s = 4. Printed: 4 rolled = 4 …
    // so measure the ROLL count itself, which is the discriminating half.
    const rolls = (community: boolean) => {
      const state = combat(community, { die: 1 });
      state.combat!.units.unit_p2_vampires.position = 3;
      for (const unit of Object.values(state.combat!.units)) {
        unit.abilities = [];
        unit.maxHealth = 99;
      }
      const next = cast(state, "spell.inferno", 2, { type: "space", position: 3 });
      const rolled = next.eventLog.find((event) => event.type === "SPELL_DICE_ROLLED") as
        | { rolls: number[] }
        | undefined;
      return rolled?.rolls.length ?? 0;
    };
    expect(rolls(true)).toBe(3);
    expect(rolls(false)).toBe(4);
    expect(blast(true)).toBeGreaterThan(0);
  });

  // The sheet's playtest report: "Expert Luck doesn't allow reroll" — the
  // reprint's Attack dice were rolled inline with no window at all.

  /**
   * A one-die Inferno on the vampires' space. `luck` grants the caster a real
   * standing Attack-die reroll entitlement (the Luck/Fortune/Mirth shape); the
   * scripted dice are consumed in order, so [0, 1] means "whiff, then a '+1' on
   * the reroll".
   */
  function infernoRig(community: boolean, opts: { luck?: boolean; scripted?: number[] } = {}): GameState {
    const state = combat(community);
    state.combat!.units.unit_p2_vampires.position = 3;
    for (const unit of Object.values(state.combat!.units)) {
      unit.abilities = [];
      unit.maxHealth = 99;
    }
    state.combat!.dice.scriptedRolls = opts.scripted ?? [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    if (opts.luck) {
      state.activeEffects.push({
        id: "effect_test_luck",
        name: "Luck",
        scope: "player",
        controllerId: "p1",
        duration: { type: "combat" },
        polarity: "positive",
        removable: true,
        modifiers: [{ type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1 }],
        source: { type: "system" },
        startedRound: state.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      } as unknown as GameState["activeEffects"][number]);
    }
    return state;
  }

  it("opens the standing Attack-die reroll window on its dice — and the reroll really changes the blast", () => {
    // Scripted: the first die whiffs ("0"), the reroll shows "+1".
    const state = infernoRig(true, { luck: true, scripted: [0, 1, 0, 0] });
    const parked = cast(state, "spell.inferno", 0, { type: "space", position: 3 });

    // The blast is PARKED: only the flat pre-damage has landed so far.
    expect(parked.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(parked.pendingChoice?.type === "ATTACK_DIE_REROLL" && parked.pendingChoice.abilityRoll?.kind).toBe(
      "spell-dice"
    );
    expect(parked.combat!.units.unit_p2_vampires.damage).toBe(1);

    // Expert Luck is the offered source, so the caster may reroll the whiff.
    const reroll = getLegalActions(parked, "p1").find(
      (legal) => legal.action.type === "REROLL_PENDING_CHOICE" && legal.label.includes("Luck")
    );
    expect(reroll, "the Luck reroll must be offered on Inferno's die").toBeTruthy();
    let next = applyOk(parked, reroll!.action);
    const keep = getLegalActions(next, "p1").find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL")!;
    next = applyOk(next, keep.action);

    expect(next.pendingChoice).toBeNull();
    // 1 pre-damage + 1 from the rerolled "+1" — the whiffed original pays none.
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("DECLINING the window resolves the original dice and never freezes the table", () => {
    const state = infernoRig(true, { luck: true, scripted: [0, 1, 0, 0] });
    const parked = cast(state, "spell.inferno", 0, { type: "space", position: 3 });
    const keep = getLegalActions(parked, "p1").find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL")!;
    const next = applyOk(parked, keep.action);
    expect(next.pendingChoice).toBeNull();
    // Kept the whiff: only the pre-damage stands, and the "+1" the reroll would
    // have found is never spent.
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
    // The table moves again: p1 has ordinary offers with no choice pending.
    expect(getLegalActions(next, "p1").length).toBeGreaterThan(0);
  });

  it("CONTROL: rule OFF the printed Inferno rolls inline — no window, whatever the caster holds", () => {
    const state = infernoRig(false, { luck: true, scripted: [0, 1, 0, 0] });
    const next = cast(state, "spell.inferno", 0, { type: "space", position: 3 });
    expect(next.pendingChoice).toBeNull();
    // The printed spell has no pre-damage and its die whiffed → nothing at all.
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("CONTROL: with NO reroll entitlement the reprint resolves inline too", () => {
    const state = infernoRig(true, { scripted: [0, 1, 0, 0] });
    state.players.p1.morale = 0;
    const next = cast(state, "spell.inferno", 0, { type: "space", position: 3 });
    expect(next.pendingChoice).toBeNull();
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});

describe("Community pack — Slayer", () => {
  it("adds +2 attack against a HIGHER-tier unit, and is not offered against an equal tier", () => {
    const higher = {
      ...MELEE,
      prepare: (state: GameState) => {
        state.combat!.units.unit_p1_griffins.grade = "bronze";
        state.combat!.units.unit_p2_vampires.grade = "gold";
      }
    };
    const equal = {
      ...MELEE,
      prepare: (state: GameState) => {
        state.combat!.units.unit_p1_griffins.grade = "gold";
        state.combat!.units.unit_p2_vampires.grade = "gold";
      }
    };
    // Against a higher tier the reprint pays +2 attack — observable as damage.
    const bare = reactionDamage(true, "spell.bloodlust", higher);
    const slain = reactionDamage(true, "spell.slayer", higher);
    // Bloodlust pays +2 at Power 0 under the same pack, so Slayer must match it.
    expect(slain).toBe(bare);
    // Against an EQUAL tier the reprint is not offered at all.
    expect(reactionOffered(true, "spell.slayer", equal)).toBe(false);
    // CONTROL: the printed card is a gold-target DICE roll, so it IS offered
    // against the equal-tier gold defender the reprint refuses.
    expect(reactionOffered(false, "spell.slayer", equal)).toBe(true);
  });

  it("scales to +4 at Power 2 (the breakpoint the sheet prints)", () => {
    const higher = {
      ...MELEE,
      prepare: (state: GameState) => {
        state.combat!.units.unit_p1_griffins.grade = "bronze";
        state.combat!.units.unit_p2_vampires.grade = "gold";
      }
    };
    const low = reactionDamage(true, "spell.slayer", higher);
    const high = reactionDamage(true, "spell.slayer", { ...higher, power: 2 });
    expect(high).toBe(low + 2);
  });
});

describe("Community pack — Frenzy", () => {
  it("pierces a SILVER defender at Power 1; the printed ladder does not", () => {
    const silver = {
      ...MELEE,
      power: 1,
      prepare: (state: GameState) => {
        state.combat!.units.unit_p2_vampires.grade = "silver";
        state.combat!.units.unit_p2_vampires.defense = 4;
      }
    };
    const pierced = reactionDamage(true, "spell.frenzy", silver);
    const classic = reactionDamage(false, "spell.frenzy", silver);
    // Piercing a Defense of 4 is worth exactly 4 more damage.
    expect(pierced).toBe(classic + 4);
  });
});

// ===========================================================================
// WATER
// ===========================================================================

describe("Community pack — Forgetfulness", () => {
  /** The printed spell targets an ENEMY ranged unit — make one. */
  function withEnemyShooter(community: boolean, grade: "bronze" | "gold" = "bronze"): GameState {
    const state = combat(community);
    state.combat!.units.unit_p2_skeletons.type = "ranged";
    state.combat!.units.unit_p2_skeletons.grade = grade;
    return state;
  }

  it("blocks only the RANGED attack (melee still works) and lasts 2 activations at Power 2", () => {
    const on = cast(withEnemyShooter(true), "spell.forgetfulness", 2, {
      type: "unit",
      unitId: "unit_p2_skeletons"
    });
    const debuff = effectsOn(on, "unit_p2_skeletons").find((effect) => effect.name === "Forgetfulness")!;
    expect(debuff.modifiers).toEqual([{ type: "UNIT_CANNOT_RANGED_ATTACK" }]);
    expect(debuff.activationsRemaining).toBe(2);

    // CONTROL: the printed card blocks EVERY attack for exactly one activation,
    // and its Power-2 rung is the top of a tier ladder, not an activation count.
    const off = cast(withEnemyShooter(false), "spell.forgetfulness", 2, {
      type: "unit",
      unitId: "unit_p2_skeletons"
    });
    const printed = effectsOn(off, "unit_p2_skeletons").find((effect) => effect.name === "Forgetfulness")!;
    expect(printed.modifiers).toEqual([{ type: "UNIT_CANNOT_ATTACK" }]);
    expect(printed.activationsRemaining).toBeUndefined();
  });

  // The sheet's playtest report on the Power-2 rung: "Cost is assumed to be 1
  // SP". The printed reprint face (public/assets/community-balance/
  // spell-forgetfulness.webp) prints 0 → next Activation, 2 → next 2, 4 → next
  // 3, and the ENGINE's threshold table already matches it — pinned here so a
  // "fix" toward 1 SP fails. What DID mislead the reader was the ladder the game
  // renders: it read the reprint's tier table (`gradeByPower`, a single no-op
  // {0: azure} rung), advertising ONE rung at Power 0 and hiding the 2 / 4 rows.
  it("the 2-activation rung really costs 2 Power — Power 1 still buys only 1 activation", () => {
    const activations = (power: number) => {
      const next = cast(withEnemyShooter(true), "spell.forgetfulness", power, {
        type: "unit",
        unitId: "unit_p2_skeletons"
      });
      return effectsOn(next, "unit_p2_skeletons").find((effect) => effect.name === "Forgetfulness")!
        .activationsRemaining;
    };
    expect(activations(0)).toBe(1);
    expect(activations(1)).toBe(1);
    expect(activations(2)).toBe(2);
    expect(activations(4)).toBe(3);
  });

  it("its Power ladder is DISPLAYED as the printed activation rungs, not the no-op tier table", () => {
    const rows = spellPowerLadder(balanceCard(combat(true), "spell.forgetfulness"));
    expect(rows.map((row) => row.power)).toEqual([0, 2, 4]);
    expect(rows.map((row) => row.text)).toEqual([
      "its next 1 activation",
      "its next 2 activations",
      "its next 3 activations"
    ]);
    // CONTROL: the printed card has no activation ladder, so it still shows its
    // real tier rungs.
    const printed = spellPowerLadder(balanceCard(combat(false), "spell.forgetfulness"));
    expect(printed.map((row) => row.power)).toEqual([0, 1, 2]);
    expect(printed[0]!.text).toBe("up to bronze");
  });

  it("has NO tier gate: it lands on a GOLD ranged unit at Power 0 (the printed card cannot)", () => {
    const landed = (community: boolean) => {
      const next = cast(withEnemyShooter(community, "gold"), "spell.forgetfulness", 0, {
        type: "unit",
        unitId: "unit_p2_skeletons"
      });
      return effectsOn(next, "unit_p2_skeletons").some((effect) => effect.name === "Forgetfulness");
    };
    expect(landed(true)).toBe(true);
    expect(landed(false)).toBe(false);
  });
});

describe("Community pack — Bless", () => {
  it("lasts the whole COMBAT, needs Power 2 for its +1 attack, and reaches a RANGED unit", () => {
    const on = cast(combat(true), "spell.bless", 2, { type: "unit", unitId: "unit_p1_marksmen" });
    const buff = effectsOn(on, "unit_p1_marksmen").find((effect) => effect.name === "Bless")!;
    expect(buff.duration.type).toBe("combat");
    expect(buff.modifiers).toEqual(
      expect.arrayContaining([{ type: "ATTACK_BONUS", amount: 1 }, { type: "IGNORE_ATTACK_DIE_ROLL" }])
    );

    // The 0/2/4 breakpoint is the discriminating half: at Power 1 the reprint
    // still pays NOTHING extra (the printed ladder already pays +1 there).
    const low = cast(combat(true), "spell.bless", 1, { type: "unit", unitId: "unit_p1_marksmen" });
    const lowBuff = effectsOn(low, "unit_p1_marksmen").find((effect) => effect.name === "Bless")!;
    expect(lowBuff.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount > 0)).toBe(false);
  });

  it("CONTROL: rule OFF Bless is a one-attack reaction with no ongoing buff and no ranged target", () => {
    const off = combat(false);
    off.players.p1.hand = ["spell.bless" as CardId];
    // The printed card is a reaction to a declared attack, so there is no
    // own-turn targeted cast on a friendly unit at all.
    expect(
      castOffers(off, "spell.bless").some(
        (action) =>
          action.type === "CAST_SPELL" &&
          action.target.type === "unit" &&
          action.target.unitId === "unit_p1_marksmen"
      )
    ).toBe(false);
  });
});

describe("Community pack — Dispel", () => {
  /** Re-arms the caster's own activation so another cast is legal. */
  function readyToCastAgain(state: GameState): GameState {
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.players.p1.combatStats.spellsCastThisRound = 0;
    return state;
  }

  it("discards N chosen ongoing effects / Paralysis tokens from ANY owner", () => {
    const state = combat(true);
    state.combat!.units.unit_p2_vampires.grade = "bronze";
    state.combat!.units.unit_p2_skeletons.grade = "bronze";
    // Two standing buffs, one on each side, plus a Paralysis token.
    let next = cast(state, "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    next = cast(readyToCastAgain(next), "spell.slow", 0, { type: "unit", unitId: "unit_p2_vampires" });
    next = cast(readyToCastAgain(next), "spell.blind", 0, { type: "unit", unitId: "unit_p2_skeletons" });
    readyToCastAgain(next);
    expect(next.activeEffects.filter((effect) => effect.removable !== false).length).toBeGreaterThanOrEqual(2);
    expect(hasToken(next.combat!.units.unit_p2_skeletons, "paralysis")).toBe(true);

    const effectsBefore = next.activeEffects.filter((effect) => effect.removable !== false).length;
    next = cast(next, "spell.dispel", 1, { type: "none" });
    const choice = next.pendingChoice as { context?: string; options: { label: string }[] } | null;
    expect(choice?.context).toBe("community-dispel-pick");
    // Both sides' effects AND the Paralysis token are on the menu.
    expect(choice!.options.some((option) => option.label.includes("Haste"))).toBe(true);
    expect(choice!.options.some((option) => option.label.includes("Slow"))).toBe(true);
    expect(choice!.options.some((option) => option.label.includes("Paralysis"))).toBe(true);

    // Take the enemy buff, then the Paralysis token (Power 1 → 2 discards).
    const slowIndex = choice!.options.findIndex((option) => option.label.includes("Slow"));
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: slowIndex
    });
    const second = next.pendingChoice as { options: { label: string }[] } | null;
    expect(second, "the second discard must re-open the pick").toBeTruthy();
    const paralysisIndex = second!.options.findIndex((option) => option.label.includes("Paralysis"));
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: paralysisIndex
    });

    // Observable: the enemy Slow is gone, the token is gone, and the caster's
    // own Haste survived (it was never picked).
    expect(next.activeEffects.some((effect) => effect.name === "Slow")).toBe(false);
    expect(next.activeEffects.some((effect) => effect.name === "Haste")).toBe(true);
    expect(hasToken(next.combat!.units.unit_p2_skeletons, "paralysis")).toBe(false);
    expect(next.activeEffects.filter((effect) => effect.removable !== false).length).toBe(effectsBefore - 1);
    expect(next.pendingChoice).toBeNull();
  });

  it("CONTROL: rule OFF Dispel is the printed unit/space cleanse — no pick window opens", () => {
    let off = combat(false);
    off.combat!.units.unit_p2_vampires.grade = "bronze";
    off = cast(off, "spell.slow", 0, { type: "unit", unitId: "unit_p2_vampires" });
    off = cast(readyToCastAgain(off), "spell.dispel", 1, { type: "unit", unitId: "unit_p2_vampires" });
    expect(off.pendingChoice).toBeNull();
    expect(off.activeEffects.some((effect) => effect.name === "Slow")).toBe(false);
  });
});

describe("Community pack — Cure", () => {
  it("is BEHAVIOUR-IDENTICAL to the printed card (only the word 'friendly' was added)", () => {
    const heal = (community: boolean) => {
      const state = combat(community);
      state.combat!.units.unit_p1_crusaders.damage = 3;
      const next = cast(state, "spell.cure", 1, { type: "unit", unitId: "unit_p1_crusaders" });
      return next.combat!.units.unit_p1_crusaders.damage;
    };
    expect(heal(true)).toBe(1);
    expect(heal(true)).toBe(heal(false));

    // And the friendly-only restriction the reprint writes down was ALREADY
    // enforced: an enemy unit is not a legal target under either reading.
    for (const community of [true, false]) {
      const state = combat(community);
      state.combat!.units.unit_p2_vampires.damage = 3;
      state.players.p1.hand = ["spell.cure" as CardId];
      expect(
        castOffers(state, "spell.cure").some(
          (action) =>
            action.type === "CAST_SPELL" &&
            action.target.type === "unit" &&
            action.target.unitId === "unit_p2_vampires"
        )
      ).toBe(false);
    }
  });
});

describe("Community pack — Mirth", () => {
  it("reaches 'this Combat round' at Power 1 (the printed card needs Power 2)", () => {
    const on = cast(combat(true), "spell.mirth", 1, { type: "none" });
    expect(on.activeEffects.find((effect) => effect.name === "Mirth")!.duration.type).toBe("current-combat-round");
    const off = cast(combat(false), "spell.mirth", 1, { type: "none" });
    expect(off.activeEffects.find((effect) => effect.name === "Mirth")!.duration.type).toBe("current-activation");
  });
});

describe("Community pack — Prayer", () => {
  it("lays ONE lasting buff granting attack AND defense AND initiative together", () => {
    const on = cast(combat(true), "spell.prayer", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    const buff = effectsOn(on, "unit_p1_crusaders").find((effect) => effect.name === "Prayer")!;
    expect(buff.modifiers.map((modifier) => modifier.type).sort()).toEqual(
      ["ATTACK_BONUS", "DEFENSE_BONUS", "INITIATIVE_BONUS"].sort()
    );
    expect(buff.duration.type).toBe("next-round-activation");
    // Observable: the Crusaders really climb the activation order.
    const indexOf = (state: GameState) =>
      getActivationOrder(state.combat!, state.activeEffects).findIndex((unit) => unit.id === "unit_p1_crusaders");
    const bare = createInitialGameState("community-balance-spells");
    expect(indexOf(on)).toBeLessThanOrEqual(indexOf(bare));
  });

  it("CONTROL: rule OFF Prayer is a one-stat CHOOSE_ONE — never all three at once", () => {
    const off = cast(combat(false), "spell.prayer", 0, { type: "unit", unitId: "unit_p1_crusaders" }, 2);
    const buff = effectsOn(off, "unit_p1_crusaders").find((effect) => effect.name === "Prayer")!;
    expect(buff.modifiers.map((modifier) => modifier.type)).toEqual(["INITIATIVE_BONUS"]);
  });

  // The sheet's playtest report: "Right now it's discarded right after the unit
  // has concluded its turn. It should however be discarded at it's activation
  // the next combat round." The old `next-activation` duration died at the
  // target's very next activation END — which, cast on a unit that had not yet
  // acted, is exactly "right after it concluded its turn".
  //
  // p2's skeletons poke the (Prayer-buffed) p1 CRUSADERS — a unit that is NOT
  // the active one when Prayer is cast, the shape the old reading broke on. The
  // crusaders retaliate for attack + Prayer's +1, so the retaliation damage IS
  // the observable: 6 while the buff stands, 5 once it is gone.
  function crusaderRetaliationDamage(step: "cast" | "after-own-activation" | "next-round-activation"): number {
    const on = cast(combat(true), "spell.prayer", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    const crusaders = on.combat!.units.unit_p1_crusaders;
    const skeletons = on.combat!.units.unit_p2_skeletons;
    crusaders.attack = 5;
    crusaders.defense = 0;
    crusaders.abilities = [];
    crusaders.damage = 0;
    crusaders.retaliatedThisRound = false;
    crusaders.position = 13;
    skeletons.attack = 1;
    skeletons.defense = 0;
    skeletons.abilities = [];
    skeletons.damage = 0;
    skeletons.position = 14;
    skeletons.activatedThisRound = false;
    skeletons.attackedThisActivation = false;
    on.combat!.activeUnitId = "unit_p2_skeletons";
    on.activePlayerId = "p2";
    on.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    on.combat!.dice.rollCount = 0;

    if (step !== "cast") {
      // The crusaders take their own activation THIS round and finish it.
      expireEffectsForActivationStart(on, "unit_p1_crusaders");
      expireEffectsForActivationEnd(on, "unit_p1_crusaders");
    }
    if (step === "next-round-activation") {
      // …and then activate again in a LATER combat round.
      on.combat!.round = 2;
      expireEffectsForActivationStart(on, "unit_p1_crusaders");
    }

    const resolved = passAllReactions(
      applyOk(on, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_crusaders"
      })
    );
    return resolved.combat!.units.unit_p2_skeletons.damage;
  }

  it("survives the buffed unit's OWN activation this round (the reported early discard)", () => {
    // Both numbers must be the buffed 6. Revert the duration to `next-activation`
    // and the second one drops to 5 — the exact bug the sheet reported.
    expect(crusaderRetaliationDamage("cast")).toBe(6);
    expect(crusaderRetaliationDamage("after-own-activation")).toBe(6);
  });

  it("ends at the buffed unit's activation NEXT combat round — and only then", () => {
    expect(crusaderRetaliationDamage("next-round-activation")).toBe(5);
  });

  it("CONTROL: the POLISH Prayer reprint keeps its `next-activation` reading", () => {
    // The new duration is scoped to the COMMUNITY card alone; the Polish twin
    // (community OFF, polish ON) is untouched, so a single activation-end still
    // clears it.
    const polish = cast(combat(false, { polish: true }), "spell.prayer", 0, {
      type: "unit",
      unitId: "unit_p1_crusaders"
    });
    const buff = effectsOn(polish, "unit_p1_crusaders").find((effect) => effect.name === "Prayer")!;
    expect(buff.duration.type).toBe("next-activation");
    expireEffectsForActivationEnd(polish, "unit_p1_crusaders");
    expect(effectsOn(polish, "unit_p1_crusaders").some((effect) => effect.name === "Prayer")).toBe(false);
  });
});

// ===========================================================================
// Precedence — with BOTH packs on, the COMMUNITY reprint wins
// ===========================================================================

describe("Community pack — precedence over the Polish Balance Pack", () => {
  it("Haste: both on → +3 initiative (community), not the Polish +2", () => {
    const both = combat(true, { polish: true });
    const on = cast(both, "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    expect(effectsOn(on, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 3 }])
    );
    // CONTROL: polish alone is +2 (so the assertion above really discriminates).
    const polishOnly = combat(false, { polish: true });
    const off = cast(polishOnly, "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    expect(effectsOn(off, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 2 }])
    );
  });

  it("Shield: both on → +4 Defense (community), not the Polish damage CAP of 3", () => {
    const hit = (community: boolean, polish: boolean) => {
      const state = combat(community, { die: 0, polish });
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_vampires";
      state.combat!.units.unit_p2_vampires.activatedThisRound = false;
      state.combat!.units.unit_p2_vampires.position = 9;
      state.combat!.units.unit_p2_vampires.attack = 14;
      state.combat!.units.unit_p2_vampires.abilities = [];
      state.combat!.units.unit_p1_crusaders.position = 10;
      state.combat!.units.unit_p1_crusaders.defense = 0;
      state.combat!.units.unit_p1_crusaders.abilities = [];
      state.players.p1.hand = ["spell.shield" as CardId, "stat.power" as CardId, "stat.power" as CardId];
      const attack = getLegalActions(state, "p2").find(
        (legal) =>
          legal.action.type === "ATTACK_UNIT" &&
          legal.action.attackerId === "unit_p2_vampires" &&
          legal.action.defenderId === "unit_p1_crusaders"
      )!;
      let next = applyOk(state, attack.action);
      const shield = getLegalActions(next, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.shield"
      )!;
      next = applyOk(next, shield.action);
      for (let i = 0; i < 2; i += 1) {
        const boost = getLegalActions(next, "p1").find(
          (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
        );
        if (!boost) {
          break;
        }
        next = applyOk(next, boost.action);
      }
      return passAllReactions(next).combat!.units.unit_p1_crusaders.damage;
    };
    // Polish alone caps the blow at 3; community alone (and both) does not.
    expect(hit(false, true)).toBeLessThanOrEqual(3);
    expect(hit(true, true)).toBeGreaterThan(3);
    expect(hit(true, true)).toBe(hit(true, false));
  });

  it("Slayer: both on → the community +attack instant, not the Polish dice roll", () => {
    const equalTierGold = {
      ...MELEE,
      prepare: (state: GameState) => {
        state.combat!.units.unit_p1_griffins.grade = "gold";
        state.combat!.units.unit_p2_vampires.grade = "gold";
      }
    };
    // The Polish reprint answers a gold target; the community one refuses an
    // EQUAL tier — so "both on" must refuse.
    const state = combat(true, { polish: true, die: 0 });
    void state;
    expect(reactionOfferedWithPolish(true, true, "spell.slayer", equalTierGold)).toBe(false);
    expect(reactionOfferedWithPolish(false, true, "spell.slayer", equalTierGold)).toBe(true);
  });

  it("Visions: both on → the community 'put on the bottom' scry, not the Polish discard scry", () => {
    const labels = (community: boolean, polish: boolean) => {
      const state = mapState(community, polish);
      state.players.p1.hand = ["spell.visions" as CardId];
      const offer = getLegalActions(state, "p1").find(
        (legal) =>
          (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
          legal.action.cardId === "spell.visions"
      )!;
      let next = applyOk(state, offer.action);
      next = applyOk(next, getLegalActions(next, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION")!.action);
      return ((next.pendingChoice as { options: { label: string }[] }).options ?? []).map((option) => option.label);
    };
    expect(labels(true, true).some((label) => label.includes("on the bottom"))).toBe(true);
    expect(labels(true, true).some((label) => label.startsWith("Discard "))).toBe(false);
    // CONTROL: polish alone still discards (so the assertion discriminates).
    expect(labels(false, true).some((label) => label.startsWith("Discard "))).toBe(true);
  });
});

/** `reactionOffered` with the Polish pack flag also under the caller's control. */
function reactionOfferedWithPolish(
  community: boolean,
  polish: boolean,
  cardId: string,
  opts: Parameters<typeof reactionDamage>[2]
): boolean {
  const state = combat(community, { die: 0, polish });
  const attacker = state.combat!.units[opts.attackerId]!;
  const defender = state.combat!.units[opts.defenderId]!;
  state.activePlayerId = opts.attackingPlayer;
  state.combat!.activeUnitId = opts.attackerId;
  attacker.activatedThisRound = false;
  attacker.position = opts.attackerPosition ?? 9;
  defender.position = opts.defenderPosition ?? 10;
  attacker.abilities = [];
  defender.abilities = [];
  opts.prepare?.(state);
  state.players[opts.reactingPlayer].hand = [cardId as CardId];
  const attack = getLegalActions(state, opts.attackingPlayer).find(
    (legal) =>
      (legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_AND_ATTACK_UNIT") &&
      legal.action.attackerId === opts.attackerId &&
      legal.action.defenderId === opts.defenderId
  )!;
  const next = applyOk(state, attack.action);
  return getLegalActions(next, opts.reactingPlayer).some(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
}
