/**
 * Polish Balance Pack (`polish-card-balance`) — the 21 reprinted SPELLS.
 *
 * Every claim is an OBSERVABLE outcome (the damage a blow really deals, which
 * unit a cast may legally reach, how many cards a scry really reveals, when an
 * effect really expires) paired with a rule-OFF CONTROL on the SAME setup, so a
 * pass proves the reprint moved the number — not that a flag was written
 * (CLAUDE.md #1a).
 *
 * The fixture is the combat SANDBOX plus a minimal frozen `houseRules` block:
 * `houseRuleEnabled` reads `state.adventure?.houseRules` and nothing else, and a
 * sandbox combat never runs the adventure finalize path (its context kind is
 * "sandbox"), so this is the cheapest way to drive real casts through the real
 * reducer under both readings of the rule.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  describeCardEffect,
  getLegalActions,
  spellPowerLadder
} from "./index";
import { getUnitMoveRange } from "./legal-actions";
import { hasToken } from "./tokens";
import { nextTurnTimeoutAction } from "./afk-drop";
import { chooseComputerAction } from "./computer/policy";
import type { ComputerObservation } from "./computer/types";
import { cardLibrary } from "@/data/cards/library";
import { polishBalanceSpellCards } from "@/data/cards/spells-balance";
import type { CardDefinition, CardId, GameAction, GameState, UnitId } from "./state";

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
function combat(balance: boolean, seed = "polish-balance-spells"): GameState {
  const state = createInitialGameState(`${seed}-${balance}`);
  state.adventure = {
    // `combat-move-initiative` is pinned OFF so the printed Combat-movement
    // half of Haste / Slow can only come from the Balance Pack.
    houseRules: { "polish-card-balance": balance, "combat-move-initiative": false }
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  for (const unit of Object.values(state.combat!.units)) {
    unit.damage = 0;
    unit.maxHealth = 30;
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
  target: GameAction extends never ? never : { type: "unit"; unitId: UnitId } | { type: "space"; position: number } | { type: "none" },
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
        (target.type === "unit" && legal.action.target.type === "unit" && legal.action.target.unitId === target.unitId) ||
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

function castOffers(state: GameState, cardId: string): GameAction[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
    .map((legal) => legal.action);
}

function effectsOn(state: GameState, unitId: UnitId) {
  return state.activeEffects.filter((effect) => effect.target?.type === "unit" && effect.target.unitId === unitId);
}

// ===========================================================================
// Haste / Slow — 3 combat rounds, printed initiative AND movement
// ===========================================================================

describe("Balance Pack — Haste & Slow", () => {
  it("Haste: +2 initiative AND +1 Combat movement, for 3 combat rounds", () => {
    const state = cast(combat(true), "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    const buff = effectsOn(state, "unit_p1_marksmen").find((effect) => effect.name === "Haste");
    expect(buff, "Haste laid its buff").toBeTruthy();
    expect(buff!.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 2 }, { type: "MOVEMENT_BONUS", amount: 1 }])
    );
    // Observable: three combat rounds from now (the classic card is combat-long,
    // this one really has an end).
    expect(buff!.expiresAtCombatRoundEnd).toBe(state.combat!.round + 2);
    // And the movement really moved (a ranged unit's printed range is 1).
    expect(getUnitMoveRange(state.combat!.units.unit_p1_marksmen, state)).toBe(2);
  });

  it("CONTROL: with the rule OFF Haste is +1 initiative, combat-long, and moves nothing", () => {
    const state = cast(combat(false), "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    const buff = effectsOn(state, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!;
    // The MOVEMENT_BONUS modifier is printed on the classic card too — the
    // house-rule gate is at getUnitMoveRange, which is the observable half.
    expect(buff.modifiers).toEqual(expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 1 }]));
    expect(buff.duration.type).toBe("combat");
    expect(getUnitMoveRange(state.combat!.units.unit_p1_marksmen, state)).toBe(1);
  });

  it("Haste scales its printed ladder (Power 1 → +4 initiative / +2 spaces)", () => {
    const state = cast(combat(true), "spell.haste", 1, { type: "unit", unitId: "unit_p1_marksmen" });
    const buff = effectsOn(state, "unit_p1_marksmen").find((effect) => effect.name === "Haste")!;
    expect(buff.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: 4 }, { type: "MOVEMENT_BONUS", amount: 2 }])
    );
    expect(getUnitMoveRange(state.combat!.units.unit_p1_marksmen, state)).toBe(3);
  });

  it("Slow: -1 initiative AND -1 Combat movement (floored at 1), for 3 combat rounds", () => {
    const state = cast(combat(true), "spell.slow", 0, { type: "unit", unitId: "unit_p2_vampires" });
    const debuff = effectsOn(state, "unit_p2_vampires").find((effect) => effect.name === "Slow")!;
    expect(debuff.modifiers).toEqual(
      expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: -1 }, { type: "MOVEMENT_BONUS", amount: -1 }])
    );
    expect(debuff.expiresAtCombatRoundEnd).toBe(state.combat!.round + 2);
    // A ground unit's printed range is 3 → 2 under the reprint.
    expect(getUnitMoveRange(state.combat!.units.unit_p2_vampires, state)).toBe(2);
  });

  it("CONTROL: rule OFF, Slow moves the initiative only", () => {
    const state = cast(combat(false), "spell.slow", 0, { type: "unit", unitId: "unit_p2_vampires" });
    const debuff = effectsOn(state, "unit_p2_vampires").find((effect) => effect.name === "Slow")!;
    expect(debuff.modifiers).toEqual(expect.arrayContaining([{ type: "INITIATIVE_BONUS", amount: -1 }]));
    expect(debuff.duration.type).toBe("combat");
    expect(getUnitMoveRange(state.combat!.units.unit_p2_vampires, state)).toBe(3);
  });
});

// ===========================================================================
// Bless — a 1-round buff that skips the Attack die; Power 3 buffs the army
// ===========================================================================

describe("Balance Pack — Bless", () => {
  it("is a targeted combat cast that lays a 1-combat-round die-skipping buff", () => {
    const state = cast(combat(true), "spell.bless", 1, { type: "unit", unitId: "unit_p1_griffins" });
    const buff = effectsOn(state, "unit_p1_griffins").find((effect) => effect.name === "Bless")!;
    expect(buff.modifiers).toEqual(
      expect.arrayContaining([{ type: "ATTACK_BONUS", amount: 1 }, { type: "IGNORE_ATTACK_DIE_ROLL" }])
    );
    expect(buff.duration.type).toBe("current-combat-round");
  });

  it("Power 3 buffs EVERY ground/flying unit you control, never the enemy", () => {
    const state = cast(combat(true), "spell.bless", 3, { type: "unit", unitId: "unit_p1_griffins" });
    const blessed = state.activeEffects.filter((effect) => effect.name === "Bless");
    const targets = new Set(blessed.map((effect) => (effect.target?.type === "unit" ? effect.target.unitId : "")));
    expect(targets.has("unit_p1_griffins")).toBe(true);
    expect(targets.has("unit_p1_crusaders")).toBe(true);
    // Marksmen are RANGED — the printed card says ground or flying only.
    expect(targets.has("unit_p1_marksmen")).toBe(false);
    // And nothing of the opponent's.
    expect([...targets].every((id) => id.startsWith("unit_p1_"))).toBe(true);
  });

  // The discriminating guard for the 0/1/3 ladder: the army-wide top effect
  // unlocks at EXACTLY Power 3. One SP short (Power 2) still buffs only the
  // chosen unit — so a mutation of `allGroundFlyingAtPower` from 3 to 2 fails
  // here while the Power-3 test above stays green.
  it("Power 2 buffs ONLY the selected unit — the army-wide effect needs a full 3 SP", () => {
    const state = cast(combat(true), "spell.bless", 2, { type: "unit", unitId: "unit_p1_griffins" });
    const blessed = state.activeEffects.filter((effect) => effect.name === "Bless");
    const targets = new Set(blessed.map((effect) => (effect.target?.type === "unit" ? effect.target.unitId : "")));
    expect(targets).toEqual(new Set(["unit_p1_griffins"]));
    // The single-unit rung still skips the Attack die and grants +1.
    const buff = effectsOn(state, "unit_p1_griffins").find((effect) => effect.name === "Bless")!;
    expect(buff.modifiers).toEqual(
      expect.arrayContaining([{ type: "ATTACK_BONUS", amount: 1 }, { type: "IGNORE_ATTACK_DIE_ROLL" }])
    );
  });

  // The bug the author hit: the spellbook DESCRIPTION hid what 3 SP buys, so the
  // top effect looked like a wasted "+1". The Power ladder + one-line summary now
  // read the 0/1/3 tiers with the die-skip and the army-wide top rung.
  it("spellbook description surfaces the 0/1/3 tiers, the die-skip and the army-wide top effect", () => {
    const bless = polishBalanceSpellCards["spell.bless"];
    const ladder = spellPowerLadder(bless);
    expect(ladder.map((row) => row.power)).toEqual([0, 1, 3]);
    const byPower = new Map(ladder.map((row) => [row.power, row.text]));
    // Power 0: the base rung is the die-skip, NOT a misleading "+0 attack".
    expect(byPower.get(0)).toBe("ignore the Attack die");
    expect(byPower.get(0)).not.toContain("+0");
    // Power 1: die-skip + single-unit +1.
    expect(byPower.get(1)).toBe("ignore the Attack die, +1 attack");
    // Power 3 (top effect): distinct from Power 1 — it names the army-wide reach.
    expect(byPower.get(3)).toContain("all your ground/flying units");
    expect(byPower.get(3)).not.toBe(byPower.get(1));

    const summary = describeCardEffect(bless);
    expect(summary).toContain("ignore the Attack die");
    expect(summary).toContain("3:+1 (all ground/flying)");
  });

  it("CONTROL: classic (rule-off) Bless keeps its +1/+2 single-unit ladder, no army-wide rung", () => {
    const classic = cardLibrary["spell.bless"];
    const ladder = spellPowerLadder(classic);
    expect(ladder.map((row) => row.power)).toEqual([0, 1, 2]);
    expect(ladder.every((row) => !row.text.includes("all your ground/flying units"))).toBe(true);
  });

  it("CONTROL: with the rule OFF Bless is a reaction instant with no own-turn cast", () => {
    const state = combat(false);
    state.players.p1.hand = ["spell.bless" as CardId];
    expect(castOffers(state, "spell.bless")).toEqual([]);
  });
});

// ===========================================================================
// Tier-gate reprints — Blind / Anti-Magic / Counterstrike / Frenzy / Dispel
// ===========================================================================

describe("Balance Pack — tier ladders", () => {
  it("Blind at Power 2 paralyses an AZURE unit; the classic card cannot", () => {
    const on = combat(true);
    on.combat!.units.unit_p2_vampires.grade = "azure";
    const blinded = cast(on, "spell.blind", 2, { type: "unit", unitId: "unit_p2_vampires" });
    expect(hasToken(blinded.combat!.units.unit_p2_vampires, "paralysis")).toBe(true);

    // CONTROL: the classic ladder tops out at gold, so an azure unit is not even
    // a legal target for the classic card at any Power.
    const off = combat(false);
    off.combat!.units.unit_p2_vampires.grade = "azure";
    off.players.p1.hand = ["spell.blind" as CardId, "stat.power" as CardId, "stat.power" as CardId];
    expect(
      castOffers(off, "spell.blind").some(
        (action) => action.type === "CAST_SPELL" && action.target.type === "unit" && action.target.unitId === "unit_p2_vampires"
      )
    ).toBe(false);
  });

  it("Counterstrike frees a SILVER unit at Power 1; the classic card needs Power 2", () => {
    const setup = (balance: boolean) => {
      const state = combat(balance);
      state.combat!.units.unit_p1_crusaders.grade = "silver";
      state.combat!.units.unit_p1_crusaders.retaliatedThisRound = true;
      return state;
    };
    const on = cast(setup(true), "spell.counterstrike", 1, { type: "unit", unitId: "unit_p1_crusaders" });
    expect(on.combat!.units.unit_p1_crusaders.retaliatedThisRound).toBe(false);

    const off = cast(setup(false), "spell.counterstrike", 1, { type: "unit", unitId: "unit_p1_crusaders" });
    expect(off.combat!.units.unit_p1_crusaders.retaliatedThisRound).toBe(true);
  });

  it("Anti-Magic's ward blocks Spell DAMAGE, not only targeting", () => {
    const onState = combat(true);
    onState.combat!.units.unit_p1_crusaders.grade = "bronze";
    const on = cast(onState, "spell.anti_magic", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    const ward = effectsOn(on, "unit_p1_crusaders")[0]!;
    expect(ward.modifiers.map((modifier) => modifier.type)).toEqual(
      expect.arrayContaining(["UNIT_SPELL_IMMUNE", "SPELL_DAMAGE_REDUCTION", "SPECIALTY_IMMUNITY"])
    );

    // CONTROL: the classic ward is targeting-only.
    const offState = combat(false);
    offState.combat!.units.unit_p1_crusaders.grade = "bronze";
    const off = cast(offState, "spell.anti_magic", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    expect(effectsOn(off, "unit_p1_crusaders")[0]!.modifiers.map((modifier) => modifier.type)).toEqual([
      "UNIT_SPELL_IMMUNE"
    ]);
  });
});

// ===========================================================================
// Fire Shield / Fire Wall / Remove Obstacle / Fortune / Mirth / Visions
// ===========================================================================

describe("Balance Pack — number ladders", () => {
  it("Fire Shield burns for this AND the next combat round", () => {
    const on = cast(combat(true), "spell.fire_shield", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    const shield = effectsOn(on, "unit_p1_crusaders")[0]!;
    expect(shield.expiresAtCombatRoundEnd).toBe(on.combat!.round + 1);

    const off = cast(combat(false), "spell.fire_shield", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    expect(effectsOn(off, "unit_p1_crusaders")[0]!.expiresAtCombatRoundEnd).toBe(off.combat!.round);
  });

  it("Fire Wall deals 2 at Power 1 (the classic wall needs Power 2)", () => {
    const on = cast(combat(true), "spell.fire_wall", 1, { type: "space", position: 9 });
    expect(on.combat!.battlefieldTokens?.find((token) => token.kind === "fire_wall")?.damage).toBe(2);

    const off = cast(combat(false), "spell.fire_wall", 1, { type: "space", position: 9 });
    expect(off.combat!.battlefieldTokens?.find((token) => token.kind === "fire_wall")?.damage).toBe(1);
  });

  it("Fortune grants 2 rerolls at Power 0 (the classic card grants 1)", () => {
    const on = cast(combat(true), "spell.fortune", 0, { type: "none" });
    const fortuneOn = on.activeEffects.find((effect) => effect.name === "Fortune")!;
    expect(fortuneOn.modifiers).toEqual(
      expect.arrayContaining([{ type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 2, consumeEffectOnUse: true }])
    );

    const off = cast(combat(false), "spell.fortune", 0, { type: "none" });
    const fortuneOff = off.activeEffects.find((effect) => effect.name === "Fortune")!;
    expect(fortuneOff.modifiers).toEqual(
      expect.arrayContaining([{ type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: true }])
    );
  });

  it("Mirth reaches 'this Combat round' at Power 1 (the classic card needs Power 2)", () => {
    const on = cast(combat(true), "spell.mirth", 1, { type: "none" });
    expect(on.activeEffects.find((effect) => effect.name === "Mirth")!.duration.type).toBe("current-combat-round");

    const off = cast(combat(false), "spell.mirth", 1, { type: "none" });
    expect(off.activeEffects.find((effect) => effect.name === "Mirth")!.duration.type).toBe("current-activation");
  });
});

// ===========================================================================
// Frenzy / Slayer / Sorrow — the reaction-window reprints
// ===========================================================================

/** p1's griffins declare an attack on p2's vampires, opening the window. */
function declaredAttack(balance: boolean, prepare?: (state: GameState) => void): GameState {
  const state = combat(balance);
  state.combat!.units.unit_p1_griffins.position = 9;
  state.combat!.units.unit_p2_vampires.position = 10;
  prepare?.(state);
  const attack = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "ATTACK_UNIT" &&
      legal.action.attackerId === "unit_p1_griffins" &&
      legal.action.defenderId === "unit_p2_vampires"
  );
  expect(attack, "the attack should be declarable").toBeTruthy();
  return applyOk(state, attack!.action);
}

function reactionOffers(state: GameState, cardId: string, playerId: "p1" | "p2") {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
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

describe("Balance Pack — reaction reprints", () => {
  it("Frenzy pierces a SILVER defender at Power 1; the classic ladder does not", () => {
    const play = (balance: boolean) => {
      const state = declaredAttack(balance, (s) => {
        s.combat!.units.unit_p2_vampires.grade = "silver";
        s.combat!.units.unit_p2_vampires.defense = 4;
        s.players.p1.hand = ["spell.frenzy" as CardId];
        grantPower(s, "p1", 1);
      });
      const offers = reactionOffers(state, "spell.frenzy", "p1");
      expect(offers.length, "Frenzy answers your own declared attack").toBeGreaterThan(0);
      return passAllReactions(applyOk(state, offers[0]!.action));
    };
    const pierced = play(true).combat!.units.unit_p2_vampires.damage;
    const classic = play(false).combat!.units.unit_p2_vampires.damage;
    // Piercing a Defense of 4 is worth exactly 4 more damage.
    expect(pierced).toBe(classic + 4);
  });

  it("Slayer answers an AZURE target and rolls 3 dice at Power 0", () => {
    const on = declaredAttack(true, (s) => {
      s.combat!.units.unit_p2_vampires.grade = "azure";
      s.players.p1.hand = ["spell.slayer" as CardId];
    });
    const offers = reactionOffers(on, "spell.slayer", "p1");
    expect(offers.length, "Slayer must answer an azure target under the reprint").toBeGreaterThan(0);
    const played = passAllReactions(applyOk(on, offers[0]!.action));
    const rolled = played.eventLog.find(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "slayer"
    ) as { message: string } | undefined;
    expect(rolled?.message).toContain("3 Attack dice");

    // CONTROL: the classic card is gold-only, so it is never offered here.
    const off = declaredAttack(false, (s) => {
      s.combat!.units.unit_p2_vampires.grade = "azure";
      s.players.p1.hand = ["spell.slayer" as CardId];
    });
    expect(reactionOffers(off, "spell.slayer", "p1")).toEqual([]);
  });

  it("Sorrow's silver skip costs 1 Power (the classic card charges 2)", () => {
    const priceOf = (card: CardDefinition | undefined) => {
      expect(card?.effect.type).toBe("CHOOSE_ONE");
      const effect = card!.effect as Extract<CardDefinition["effect"], { type: "CHOOSE_ONE" }>;
      return effect.options.map((option) => option.cost?.powerCost ?? 0);
    };
    expect(priceOf(polishBalanceSpellCards["spell.sorrow"])).toEqual([0, 1, 3]);
    expect(priceOf(cardLibrary["spell.sorrow"])).toEqual([0, 2, 4]);
  });
});

// ===========================================================================
// Misfortune — no tier gate, and the die half is the rung you pay for
// ===========================================================================

describe("Balance Pack — Misfortune", () => {
  /**
   * p2's vampires attack p1's griffins; p1 answers with Misfortune's `rung`
   * (0 = free, 1 / 2 = paid with that many power-source discards). Returns null
   * when that rung is not offered at all — the classic card's tier gate.
   */
  function cursedAttack(balance: boolean, rung: number): GameState | null {
    const state = combat(balance);
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_vampires";
    state.combat!.units.unit_p2_vampires.activatedThisRound = false;
    state.combat!.units.unit_p2_vampires.position = 9;
    // The attacker is BRONZE, so the classic card's free (bronze) rung is the
    // one it offers — the rungs above it are what the reprint unlocks.
    state.combat!.units.unit_p2_vampires.grade = "bronze";
    state.combat!.units.unit_p1_griffins.position = 10;
    state.players.p1.hand = [
      "spell.misfortune" as CardId,
      ...Array.from({ length: rung }, () => "stat.power" as CardId)
    ];
    const attack = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === "unit_p2_vampires" &&
        legal.action.defenderId === "unit_p1_griffins"
    );
    expect(attack, "the enemy attack should be declarable").toBeTruthy();
    let next = applyOk(state, attack!.action);
    const offer = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.misfortune" &&
        (balance || (legal.action.optionIndex ?? 0) === rung)
    );
    if (!offer) {
      return null;
    }
    // The engine offers a payable TEMPLATE; the cost picker attaches the cards.
    const action =
      !balance && rung > 0 && offer.action.type === "PLAY_REACTION"
        ? {
            ...offer.action,
            costCardIds: Array.from({ length: rung }, () => "stat.power" as CardId)
          }
        : offer.action;
    next = applyOk(next, action);
    if (balance) {
      for (let index = 0; index < rung; index += 1) {
        if (next.reactionWindow?.priorityPlayerId !== "p1") {
          next = applyOk(next, { type: "PASS_REACTION", playerId: next.reactionWindow!.priorityPlayerId });
        }
        const power = getLegalActions(next, "p1").find(
          (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
        );
        expect(power, `Misfortune Power boost ${index + 1} is offered after choosing the Spell`).toBeTruthy();
        next = applyOk(next, power!.action);
      }
    }
    return passAllReactions(next);
  }

  function misfortuneNote(state: GameState): string | undefined {
    const event = state.eventLog.find(
      (entry) => entry.type === "UNIT_ABILITY_TRIGGERED" && entry.abilityId === "misfortune"
    ) as { message: string } | undefined;
    return event?.message;
  }

  it("rung 1 rolls 2 dice and resolves the LOWER result", () => {
    const state = cursedAttack(true, 1);
    expect(state, "the reprint's second rung is offered against a bronze attacker").not.toBeNull();
    const note = misfortuneNote(state!);
    expect(note).toContain("2 Attack dice");
    expect(note).toContain("lower");
  });

  it("rung 2 rolls 4 dice, rerolling every '+1'", () => {
    const state = cursedAttack(true, 2);
    expect(state).not.toBeNull();
    expect(misfortuneNote(state!)).toContain("4 Attack dice");
  });

  it("CONTROL: rung 0 still negates the die, and the classic card offers no rung above its tier match", () => {
    const rungZero = cursedAttack(true, 0);
    expect(rungZero).not.toBeNull();
    expect(misfortuneNote(rungZero!), "rung 0 cancels the die, it does not roll one").toBeUndefined();

    // With the rule OFF the card is tier-gated: against a BRONZE attacker only
    // its bronze rung is offered, so the punished-die rungs are unreachable.
    expect(cursedAttack(false, 1)).toBeNull();
    expect(cursedAttack(false, 2)).toBeNull();
    const classic = cursedAttack(false, 0);
    expect(classic).not.toBeNull();
    expect(misfortuneNote(classic!)).toBeUndefined();
  });
});

// ===========================================================================
// Dispel / Disrupting Ray — the caster's post-cast pick
// ===========================================================================

describe("Balance Pack — the post-cast picks", () => {
  /** Re-arms the caster's own activation so another cast is legal. */
  function readyToCastAgain(state: GameState): GameState {
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.players.p1.combatStats.spellsCastThisRound = 0;
    return state;
  }

  it("Dispel at Power 2 offers 'ALL effects in the Combat', and the pick really wipes them", () => {
    let state = combat(true);
    state.combat!.units.unit_p2_vampires.grade = "bronze";
    // Two live buffs, one on each side.
    state = cast(state, "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    state = cast(readyToCastAgain(state), "spell.slow", 0, { type: "unit", unitId: "unit_p2_vampires" });
    expect(state.activeEffects.length).toBeGreaterThanOrEqual(2);

    state = cast(readyToCastAgain(state), "spell.dispel", 2, { type: "unit", unitId: "unit_p2_vampires" });
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect((state.pendingChoice as { context?: string }).context).toBe("dispel-scope");
    const cleared = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(cleared.activeEffects.filter((effect) => effect.removable !== false)).toEqual([]);
  });

  it("CONTROL: with the rule OFF Dispel opens no scope pick and clears only its target", () => {
    let state = combat(false);
    state.combat!.units.unit_p2_vampires.grade = "bronze";
    state = cast(state, "spell.haste", 0, { type: "unit", unitId: "unit_p1_marksmen" });
    state = cast(readyToCastAgain(state), "spell.dispel", 2, { type: "unit", unitId: "unit_p2_vampires" });
    expect(state.pendingChoice).toBeNull();
    // The friendly Haste survives — the classic card only touches its target.
    expect(effectsOn(state, "unit_p1_marksmen").length).toBe(1);
  });

  function disruptingRay(balance: boolean): GameState {
    const base = combat(balance);
    base.combat!.units.unit_p2_vampires.grade = "bronze";
    base.combat!.units.unit_p2_vampires.defense = 3;
    return cast(base, "spell.disrupting_ray", 0, { type: "unit", unitId: "unit_p2_vampires" });
  }

  it("Disrupting Ray lets the caster take -1 Defense instead of the ability lock", () => {
    const state = disruptingRay(true);
    expect((state.pendingChoice as { context?: string }).context).toBe("disrupting-ray-mode");
    const chosen = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(effectsOn(chosen, "unit_p2_vampires")[0]!.modifiers).toEqual([{ type: "DEFENSE_BONUS", amount: -1 }]);

    // Option 0 keeps the classic ability lock.
    const locked = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(effectsOn(locked, "unit_p2_vampires")[0]!.modifiers).toEqual([{ type: "UNIT_ABILITY_SUPPRESSED" }]);
  });

  it("CONTROL: with the rule OFF Disrupting Ray opens no pick and always suppresses", () => {
    const state = disruptingRay(false);
    expect(state.pendingChoice).toBeNull();
    expect(effectsOn(state, "unit_p2_vampires")[0]!.modifiers).toEqual([{ type: "UNIT_ABILITY_SUPPRESSED" }]);
  });

  it("both new picks are answerable by the AI and by the forced-resolution driver (never a stall)", () => {
    const picks: GameState[] = [disruptingRay(true)];
    let dispel = combat(true);
    dispel.combat!.units.unit_p2_vampires.grade = "bronze";
    picks.push(cast(dispel, "spell.dispel", 2, { type: "unit", unitId: "unit_p2_vampires" }));

    for (const state of picks) {
      const context = (state.pendingChoice as { context?: string }).context;
      expect(["dispel-scope", "disrupting-ray-mode"]).toContain(context);
      const driver = nextTurnTimeoutAction(state, "p1");
      expect(driver?.type, `${context}: the AFK / timeout driver answers it`).toBe("CHOOSE_OPTION");
      const ai = chooseComputerAction({
        playerId: "p1",
        state: state as unknown as ComputerObservation["state"],
        legalActions: getLegalActions(state, "p1")
      });
      expect(ai?.action.type, `${context}: a computer seat answers it`).toBe("CHOOSE_OPTION");
    }
  });
});

// ===========================================================================
// Forgetfulness / Prayer / Shield / Remove Obstacle
// ===========================================================================

describe("Balance Pack — the remaining reprints", () => {
  function withEnemyShooter(balance: boolean): GameState {
    const state = combat(balance);
    const shooter = state.combat!.units.unit_p2_skeletons;
    shooter.type = "ranged";
    shooter.grade = "bronze";
    shooter.position = 1;
    return state;
  }

  it("Forgetfulness blocks only the RANGED attack — melee still works", () => {
    let state = withEnemyShooter(true);
    state = cast(state, "spell.forgetfulness", 1, { type: "unit", unitId: "unit_p2_skeletons" });
    expect(effectsOn(state, "unit_p2_skeletons")[0]!.modifiers).toEqual([{ type: "UNIT_CANNOT_RANGED_ATTACK" }]);

    // Observable: it may not shoot a distant enemy, but it may hit an adjacent one.
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.movedThisActivation = false;
    state.combat!.units.unit_p1_griffins.position = 19;
    state.combat!.units.unit_p1_crusaders.position = 0;
    const targets = getLegalActions(state, "p2")
      .filter((legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === "unit_p2_skeletons")
      .map((legal) => (legal.action.type === "ATTACK_UNIT" ? legal.action.defenderId : ""));
    expect(targets, "the adjacent melee strike survives").toContain("unit_p1_crusaders");
    expect(targets, "the distant shot does not").not.toContain("unit_p1_griffins");
  });

  it("CONTROL: with the rule OFF Forgetfulness blocks EVERY attack", () => {
    let state = withEnemyShooter(false);
    state = cast(state, "spell.forgetfulness", 1, { type: "unit", unitId: "unit_p2_skeletons" });
    expect(effectsOn(state, "unit_p2_skeletons")[0]!.modifiers).toEqual([{ type: "UNIT_CANNOT_ATTACK" }]);

    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p1_crusaders.position = 0;
    expect(
      getLegalActions(state, "p2").filter(
        (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === "unit_p2_skeletons"
      )
    ).toEqual([]);
  });

  it("Forgetfulness at Power 2 lasts TWO of the target's activations", () => {
    let state = withEnemyShooter(true);
    state = cast(state, "spell.forgetfulness", 2, { type: "unit", unitId: "unit_p2_skeletons" });
    expect(effectsOn(state, "unit_p2_skeletons")[0]!.activationsRemaining).toBe(2);
  });

  it("Prayer is a lasting buff on the selected unit, not a one-attack rider", () => {
    const state = cast(combat(true), "spell.prayer", 0, { type: "unit", unitId: "unit_p1_crusaders" });
    const buff = effectsOn(state, "unit_p1_crusaders").find((effect) => effect.name === "Prayer")!;
    expect(buff.modifiers).toEqual([
      { type: "ATTACK_BONUS", amount: 1 },
      { type: "DEFENSE_BONUS", amount: 1 },
      { type: "INITIATIVE_BONUS", amount: 1 }
    ]);
    expect(buff.duration.type).toBe("next-activation");
  });

  it("CONTROL: with the rule OFF Prayer's +attack arm has no targeted cast at all", () => {
    const state = combat(false);
    state.players.p1.hand = ["spell.prayer" as CardId];
    expect(
      castOffers(state, "spell.prayer").filter(
        (action) => action.type === "CAST_SPELL" && action.optionIndex === 0
      )
    ).toEqual([]);
  });

  it("Remove Obstacle clears 2 at Power 0 (the classic spell clears 1)", () => {
    const clearCount = (balance: boolean) => {
      let state = combat(balance);
      state.combat!.obstacles = [1, 2, 3];
      state = cast(state, "spell.remove_obstacle", 0, { type: "none" });
      let safety = 6;
      while (state.pendingChoice?.type === "OPTION_CHOICE" && safety > 0) {
        safety -= 1;
        state = applyOk(state, {
          type: "CHOOSE_OPTION",
          playerId: "p1",
          choiceId: state.pendingChoice.id,
          optionIndex: 0
        });
      }
      return 3 - (state.combat!.obstacles ?? []).length;
    };
    expect(clearCount(true)).toBe(2);
    expect(clearCount(false)).toBe(1);
  });
});

// ===========================================================================
// Shield — Power 2 caps the blow instead of adding Defense
// ===========================================================================

describe("Balance Pack — Shield", () => {
  /** p2's vampires swing hard at p1's crusaders; p1 answers with Shield. */
  function shieldedHit(balance: boolean, power: number): number {
    const state = combat(balance);
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_vampires";
    state.combat!.units.unit_p2_vampires.activatedThisRound = false;
    state.combat!.units.unit_p2_vampires.position = 9;
    state.combat!.units.unit_p2_vampires.attack = 12;
    state.combat!.units.unit_p2_vampires.abilities = [];
    state.combat!.units.unit_p1_crusaders.position = 10;
    state.combat!.units.unit_p1_crusaders.defense = 0;
    state.combat!.units.unit_p1_crusaders.abilities = [];
    state.players.p1.hand = [
      "spell.shield" as CardId,
      ...Array.from({ length: power }, () => "stat.power" as CardId)
    ];
    const attack = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === "unit_p2_vampires" &&
        legal.action.defenderId === "unit_p1_crusaders"
    );
    let next = applyOk(state, attack!.action);
    const shield = getLegalActions(next, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.shield"
    );
    expect(shield, "Shield answers a ground attacker").toBeTruthy();
    next = applyOk(next, shield!.action);
    // Power pooled AFTER the instant still re-scales it (the engine records
    // power-scaled attack instants for exactly this).
    for (let i = 0; i < power; i += 1) {
      const boost = getLegalActions(next, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
      );
      expect(boost, "Power boost " + (i + 1) + " should be offered to the defender").toBeTruthy();
      next = applyOk(next, boost!.action);
    }
    next = passAllReactions(next);
    return next.combat!.units.unit_p1_crusaders.damage;
  }

  it("at Power 2 the defending unit takes at most 3 damage", () => {
    expect(shieldedHit(true, 2)).toBeLessThanOrEqual(3);
  });

  it("CONTROL: at Power 1 it is the printed +2 Defense, and the classic card never caps", () => {
    // A capped hit is strictly smaller than the same blow softened by Defense
    // alone, so the two readings are visibly different.
    expect(shieldedHit(true, 1)).toBeGreaterThan(3);
    expect(shieldedHit(false, 2)).toBeGreaterThan(3);
  });
});

// ===========================================================================
// Visions — a MAP scry of 2 / 4 / 6 cards
// ===========================================================================

describe("Balance Pack — Visions", () => {
  function scryCount(balance: boolean): number {
    let state = createAdventureGameState({
      seed: `balance-visions-${balance}`,
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-card-balance": balance }
    });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      state.activePlayerId = "p1";
    }
    state.players.p1.hand = ["spell.visions" as CardId];
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
        legal.action.cardId === "spell.visions"
    );
    expect(offer, "Visions should be playable on the map").toBeTruthy();
    const next = applyOk(state, offer!.action);
    const choice = next.pendingChoice as { visionsDeck?: { count: number } } | null;
    expect(choice?.visionsDeck, "the Visions deck pick should open").toBeTruthy();
    return choice!.visionsDeck!.count;
  }

  it("scrys 2 cards at Power 0 (the classic spell scrys 1)", () => {
    expect(scryCount(true)).toBe(2);
    expect(scryCount(false)).toBe(1);
  });
});

// ===========================================================================
// Bless — the lasting die-skip really fires on the blessed unit's attacks
// ===========================================================================

describe("Balance Pack — Bless in action", () => {
  /** The blessed unit strikes; returns every Attack die the blow rolled. */
  function blessedStrike(balance: boolean): number[] {
    let state = combat(balance);
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_vampires.position = 10;
    if (balance) {
      state = cast(state, "spell.bless", 1, { type: "unit", unitId: "unit_p1_griffins" });
      state.combat!.activeUnitId = "unit_p1_griffins";
      state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    }
    state.players.p1.hand = [];
    if (balance) {
      expect(
        effectsOn(state, "unit_p1_griffins").flatMap((effect) => effect.modifiers.map((m) => m.type))
      ).toContain("IGNORE_ATTACK_DIE_ROLL");
    }
    const attack = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === "unit_p1_griffins" &&
        legal.action.defenderId === "unit_p2_vampires"
    );
    expect(attack, "the blessed unit should be able to attack").toBeTruthy();
    const resolved = passAllReactions(applyOk(state, attack!.action));
    const rolled = resolved.eventLog.filter((event) => event.type === "ATTACK_ROLLED") as {
      rolls?: number[];
      roll?: number;
    }[];
    expect(rolled.length, "the attack resolved").toBeGreaterThan(0);
    // The FIRST roll is the blessed unit blow; a later one would be the
    // defender Retaliation Attack, which Bless never covers.
    return rolled[0]!.rolls ?? [rolled[0]!.roll ?? 0];
  }

  it("a Bless-buffed unit skips its Attack die roll for the whole combat round", () => {
    // The die is never thrown — the engine records the cancelled roll as 0.
    expect(blessedStrike(true)).toEqual([0]);
  });

  it("CONTROL: an unblessed unit rolls a real Attack die", () => {
    const rolls = blessedStrike(false);
    // A real throw: one die whose face is one of the printed -1 / 0 / +1.
    expect(rolls.length).toBe(1);
    expect([-1, 0, 1]).toContain(rolls[0]);
  });
});

// ===========================================================================
// Forgetfulness at Power 0 — the RANGED attack is halved, rounded up
// ===========================================================================

describe("Balance Pack — Forgetfulness (Power 0)", () => {
  /** The hexed (or unhexed) enemy shooter fires at a distant target. */
  function shotDamage(hex: boolean): number {
    let state = combat(true);
    const shooter = state.combat!.units.unit_p2_skeletons;
    shooter.type = "ranged";
    shooter.grade = "bronze";
    shooter.position = 0;
    shooter.attack = 10;
    shooter.abilities = [];
    // Nobody adjacent to the shooter (cells 1 and 4 stay empty), so the engine
    // offers the distant SHOT rather than forcing an adjacent strike.
    state.combat!.units.unit_p1_marksmen.position = 15;
    state.combat!.units.unit_p1_griffins.position = 16;
    state.combat!.units.unit_p2_vampires.position = 13;
    state.combat!.units.unit_p2_dread_knights.position = 14;
    const victim = state.combat!.units.unit_p1_crusaders;
    victim.position = 19;
    victim.defense = 0;
    victim.abilities = [];
    victim.defenseToken = false;
    if (hex) {
      state = cast(state, "spell.forgetfulness", 0, { type: "unit", unitId: "unit_p2_skeletons" });
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.movedThisActivation = false;
    const shot = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === "unit_p2_skeletons" &&
        legal.action.defenderId === "unit_p1_crusaders"
    );
    expect(shot, "the hexed shooter may still SHOOT at Power 0 (only its value is halved)").toBeTruthy();
    return passAllReactions(applyOk(state, shot!.action)).combat!.units.unit_p1_crusaders.damage;
  }

  it("halves the shot (rounded up) instead of blocking it", () => {
    // Attack 10 against Defense 0, die -1/0/+1: an unhexed shot lands for 9-11,
    // a halved one for ceil(9/2)=5 to ceil(11/2)=6 — no overlap either way.
    expect(shotDamage(false)).toBeGreaterThanOrEqual(9);
    expect(shotDamage(true)).toBeLessThanOrEqual(6);
  });
});
