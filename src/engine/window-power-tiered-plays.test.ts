import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  attackWindowPooledPower,
  createInitialGameState,
  effectScalesWithAttackPool,
  getCardPlayVariants,
  getLegalActions,
  playConsumesWindowPower
} from "./index";
import type { CardId, GameAction, GameState } from "./state";

/**
 * "Terrible bug: now still cannot add SP to other effects" (USER REPORT
 * 2026-08-26, with a screenshot of an INSTANT WINDOW holding a "+2 Power" chip
 * and the warning "Power only counts with a Spell played into this attack").
 *
 * THE MECHANISM. Power poured into an open attack window ("Discard <Spell>: +1
 * Power", a played `stat.power`) lands in ONE per-caster pool,
 * `stackItem.modifiers.attackPowerByPlayer[playerId]`. Every `*ByPower` LADDER
 * re-derives itself from that pool (Bloodlust/Curse/Stone Skin's amount,
 * Slayer's rolls, Frenzy's pierced grade, Fortune's rerolls, the reprint
 * Misfortune's die mode). But a printed `powerCost` TIER — Resurrection / Magic
 * Mirror / Misfortune / Sorrow rungs, and the Alamar & Jeddite lethal-save
 * SPECIALTIES, which are not Spells at all — was priced by
 * `standingSpellPower + map bank + School bank + discarded cost cards` and never
 * looked at the pool. So Power the player had already paid was invisible to
 * every tiered play: exactly "cannot add SP to other effects".
 *
 * The fix is ONE shared read, `attackWindowPooledPower`, folded into BOTH
 * `canAffordCardCost` (the offer) and `payOptionCardCost` (the payment), which
 * also CONSUMES the part it spends — the same treatment the map bank and the
 * committed School-expert bank already get.
 *
 * These specs assert the OUTCOME (does the doomed unit live or die), not a
 * cost-accounting field, and every one of them is scripted so the pool is the
 * ONLY Power that can reach the rung: the `stat.power` cards are already spent
 * into the pool, so p1's hand holds nothing that could pay the cost.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass every non-p1 priority until p1 holds the open window (or it closes). */
function passUntilP1(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== "p1" && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/**
 * p2's Skeletons land a guaranteed-lethal melee blow on p1's Griffins (already
 * one hit from death, Defense 0, die scripted to 0). p1 holds `p1Hand`, so the
 * UNIT_ATTACK_DECLARED window opens first and p1 may pour Power into it.
 */
function declareLethalAttack(seed: string, p1Hand: string[], grade: "silver" | "gold"): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = p1Hand as CardId[];
  state.players.p2.hand = [];
  const defender = state.combat!.units.unit_p1_griffins;
  defender.grade = grade;
  defender.position = 9;
  defender.defense = 0;
  defender.damage = defender.maxHealth - 1;
  const attacker = state.combat!.units.unit_p2_skeletons;
  attacker.abilities = [];
  // 5 attack against Defense 0 stays lethal even at Stone Skin's top rung (+3).
  attacker.attack = 5;
  attacker.position = 13;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  const declared = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: "unit_p2_skeletons",
    defenderId: "unit_p1_griffins"
  });
  expect(declared.reactionWindow?.triggerEvent.type, "the attack-declared window must open for p1").toBe(
    "UNIT_ATTACK_DECLARED"
  );
  return declared;
}

/** p1 casts Stone Skin — a pool-scaling Spell, which is what legalises pouring Power. */
function playStoneSkin(state: GameState): GameState {
  const at = passUntilP1(state);
  const offer = getLegalActions(at, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "spell.stone_skin" &&
      !legal.action.asPowerBoost
  );
  expect(offer, "Stone Skin should answer the enemy attack").toBeTruthy();
  return applyOk(at, offer!.action);
}

/** Pour one basic `stat.power` into the open attack window as p1. */
function pourOnePower(state: GameState): GameState {
  const at = passUntilP1(state);
  const offer = getLegalActions(at, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "stat.power" &&
      legal.action.mode !== "expert" &&
      !legal.action.asPowerBoost
  );
  expect(offer, "a Power source must be offered once a pool-scaling Spell is on the attack").toBeTruthy();
  return applyOk(at, offer!.action);
}

/**
 * Pass out of the attack window so the blow resolves. Stops as soon as the
 * lethal-save window opens (or the attack has fully resolved).
 */
function resolveToLethalWindow(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (
    safety-- > 0 &&
    current.reactionWindow &&
    current.reactionWindow.triggerEvent.type !== "UNIT_LETHAL_HIT"
  ) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function saveOffer(state: GameState, cardId: string) {
  return (state.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
}

/**
 * Whether the killing blow was CANCELLED. The Griffins are a Pack, so an
 * unsaved lethal hit FLIPS the card to its Few side (fresh health) rather than
 * removing it — "damage < maxHealth" would read a flipped card as unharmed. The
 * discriminating outcome is therefore the side it is still on, plus the damage
 * the save left untouched. (Same read as lethal-save-sources.test.ts.)
 */
function griffinsSaved(state: GameState): boolean {
  const unit = state.combat!.units.unit_p1_griffins;
  return Boolean(unit) && unit.variant === "pack" && unit.damage === unit.maxHealth - 1;
}

/**
 * Drive the whole reported flow: declare the lethal attack, cast Stone Skin,
 * pour `pours` Power, then walk to the lethal-save window. Returns that state.
 */
function pourThenReachSave(seed: string, pours: number, saveCardId: string, grade: "silver" | "gold"): GameState {
  const hand = ["spell.stone_skin", ...Array.from({ length: pours }, () => "stat.power"), saveCardId];
  let state = declareLethalAttack(seed, hand, grade);
  state = playStoneSkin(state);
  for (let index = 0; index < pours; index += 1) {
    state = pourOnePower(state);
  }
  // Every Power source is now SPENT into the pool — p1's hand can no longer pay
  // a single point of the rung's cost, so only the pool can.
  expect(state.players.p1.hand.filter((id) => id === "stat.power")).toEqual([]);
  return resolveToLethalWindow(state);
}

describe("pooled attack-window Power pays a printed powerCost tier (not only *ByPower spells)", () => {
  it("4 poured Power buys Alamar's GOLD save (cost 4) with an empty hand — the doomed unit lives", () => {
    const state = pourThenReachSave("pool-pays-gold", 4, "specialty.alamar.1", "gold");
    expect(state.reactionWindow?.triggerEvent.type, "the lethal-save window opens").toBe("UNIT_LETHAL_HIT");
    // The pool really holds the 4 Power p1 poured, and it is p1's alone.
    expect(attackWindowPooledPower(state, "p1")).toBe(4);
    expect(attackWindowPooledPower(state, "p2"), "the pool is per-caster, never shared").toBe(0);

    const save = saveOffer(state, "specialty.alamar.1");
    expect(save, "the gold rung must be affordable out of the pooled Power").toBeTruthy();
    const saved = applyOk(state, save!.action);
    expect(griffinsSaved(saved), "the killing blow is cancelled — the Pack never flips").toBe(true);
  });

  it("CONTROL: 3 poured Power is NOT enough for the gold rung (cost 4) — the unit dies", () => {
    // Same flow, one fewer Power. The accounting is exact, not a blanket waiver:
    // with nothing left in hand the rung stays unaffordable, so no save window
    // opens at all and the blow lands.
    // (No rung was affordable, so no lethal-save window ever opened and the blow
    // has already landed — which is why the pool ledger is gone with the stack
    // item. The discriminating outcome is the flipped Pack.)
    const state = pourThenReachSave("pool-short-gold", 3, "specialty.alamar.1", "gold");
    expect(state.reactionWindow?.triggerEvent.type).not.toBe("UNIT_LETHAL_HIT");
    expect(saveOffer(state, "specialty.alamar.1"), "a 3-Power pool cannot buy a 4-Power rung").toBeFalsy();
    expect(griffinsSaved(state), "unsaved, the Pack flips to its Few side").toBe(false);
    expect(state.combat!.units.unit_p1_griffins.variant).toBe("few");
  });

  it("CONTROL: pouring NO Power leaves the gold rung unaffordable even though the Spell was cast", () => {
    // Stone Skin alone (no Power poured, no Power source in hand) — proves the
    // save is bought by the POOL, not merely by having cast a Spell.
    let state = declareLethalAttack("pool-none-gold", ["spell.stone_skin", "specialty.alamar.1"], "gold");
    state = playStoneSkin(state);
    state = resolveToLethalWindow(state);
    expect(saveOffer(state, "specialty.alamar.1")).toBeFalsy();
    expect(griffinsSaved(state)).toBe(false);
    expect(state.combat!.units.unit_p1_griffins.variant).toBe("few");
  });

  it("a pool larger than the rung is fine — 4 poured Power buys Alamar VI's 2-Power gold rung", () => {
    // Over-provisioning the pool is not an over-payment error: the "drop a card"
    // rule polices DISCARDED cost cards, and the pool is not one. (The pool is a
    // reading, not a bank — nothing is consumed; see payOptionCardCost.)
    const state = pourThenReachSave("pool-partial-spend", 4, "specialty.alamar.6", "gold");
    expect(attackWindowPooledPower(state, "p1")).toBe(4);
    const save = saveOffer(state, "specialty.alamar.6");
    expect(save, "the cheap gold rung is affordable from the pool").toBeTruthy();
    expect(griffinsSaved(applyOk(state, save!.action))).toBe(true);
  });

  it("the accounting is shared, not Alamar-specific — Jeddite's silver rung takes ONE poured Power", () => {
    // A second, differently-priced powerCost holder on a different grade, so the
    // fix is provably the one shared read and not a per-card patch: Jeddite IV's
    // silver rung costs 1, bought by a single poured Power against a SILVER
    // defender (Alamar above was gold).
    const state = pourThenReachSave("pool-jeddite-silver", 1, "specialty.jeddite.4", "silver");
    expect(attackWindowPooledPower(state, "p1")).toBe(1);
    const save = saveOffer(state, "specialty.jeddite.4");
    expect(save, "the silver rung (1 Power) is bought by one poured Power").toBeTruthy();
    expect(griffinsSaved(applyOk(state, save!.action))).toBe(true);
  });

  it("CONTROL: a MAP powerCost never sees an attack pool (no combat, no pool)", () => {
    // attackWindowPooledPower is combat-scoped, so a map Spell's Power tier is
    // untouched by this change — the map bank remains its only banked source.
    const state = createInitialGameState("pool-map-scope");
    const noCombat = { ...state, combat: undefined } as unknown as GameState;
    expect(attackWindowPooledPower(noCombat, "p1")).toBe(0);
  });
});

describe("the Power-SINK predicate: what pooled window Power may feed", () => {
  const variantOf = (cardId: string, optionIndex = 0) => {
    const card = cardLibrary[cardId as CardId];
    expect(card, `${cardId} must exist`).toBeTruthy();
    return { card, variant: getCardPlayVariants(card!)[optionIndex] };
  };

  it("a NON-Spell printed powerCost tier is a sink (the lethal-save specialties)", () => {
    // specialty.alamar.1: bronze 1 / silver 2 / gold 4 — every costed rung.
    for (const optionIndex of [0, 1, 2]) {
      const { card, variant } = variantOf("specialty.alamar.1", optionIndex);
      const isCosted = variant?.cost?.powerCost !== undefined;
      expect(playConsumesWindowPower(card, variant?.effect, variant?.cost)).toBe(isCosted);
    }
    expect(cardLibrary["specialty.alamar.1" as CardId]?.kind, "and it is not a Spell").toBe("hero-specialty");
  });

  it("a *ByPower ladder is a sink whatever the card's kind", () => {
    const { card, variant } = variantOf("spell.stone_skin");
    expect(playConsumesWindowPower(card, variant?.effect, variant?.cost)).toBe(true);
  });

  it("INVARIANT: every card in the library printing an attack-pool ladder is recognised as a sink", () => {
    // One sweep instead of N one-offs (CLAUDE.md #1a rule 5). It guards the
    // whole family at once: the resolver drops its Power-scaling amount and its
    // re-scaling record on `effect.amountByPower` alone (no card-kind gate since
    // 2026-08-26), so anything printing one MUST also read as a sink here — or
    // the window would refuse the Power the resolver then silently wants.
    let ladders = 0;
    let nonSpellLadders = 0;
    for (const card of Object.values(cardLibrary)) {
      for (const variant of getCardPlayVariants(card)) {
        if (!effectScalesWithAttackPool(variant.effect)) {
          continue;
        }
        ladders += 1;
        if (card.kind !== "spell") {
          nonSpellLadders += 1;
        }
        expect(
          playConsumesWindowPower(card, variant.effect, variant.cost),
          `${card.id} prints a pool ladder but is not a Power sink`
        ).toBe(true);
      }
    }
    expect(ladders, "the sweep must actually find the shipped ladders").toBeGreaterThan(10);
    // HONEST LIMIT, recorded here so a future reader is not misled: today EVERY
    // shipped pool ladder is on a `kind: "spell"` card, so the resolver's
    // kind-gate removal is a seam alignment with no shipped consumer. The
    // reachable half of this fix is the `powerCost` accounting above (the
    // non-Spell Alamar/Jeddite saves). If this number ever moves off 0, a
    // behaviour test for that card belongs beside it.
    expect(nonSpellLadders, "no shipped NON-Spell card prints a pool ladder yet").toBe(0);
  });

  it("CONTROL: a plain flat statistic is NOT a sink — lone Power beside it still dissipates", () => {
    for (const cardId of ["stat.attack", "stat.defense"]) {
      const { card, variant } = variantOf(cardId);
      expect(playConsumesWindowPower(card, variant?.effect, variant?.cost), `${cardId}`).toBe(false);
    }
  });

  it("CONTROL: the Meteor Shower / Rocket Launcher family stays FUEL-only and is never a sink", () => {
    // playCardSpellPower short-circuits the `meteor-shower` tag to the chosen
    // fuel cards alone (no standing Power, no pool), so pooled Power must not
    // count it as something to feed — otherwise the window would offer Power the
    // specialty provably ignores.
    for (const cardId of ["specialty.deemer.1", "specialty.deemer.6"]) {
      const card = cardLibrary[cardId as CardId];
      expect(card?.tags?.includes("meteor-shower"), `${cardId} carries the fuel-only tag`).toBe(true);
      for (const variant of getCardPlayVariants(card!)) {
        expect(playConsumesWindowPower(card, variant.effect, variant.cost), `${cardId}`).toBe(false);
      }
    }
  });

  it("the fuel-only guard is the TAG, not the effect shape — a meteor face with a ladder is still no sink", () => {
    // The two shipped Meteor faces are excluded by their effect kind alone
    // (AREA_DAMAGE_PICK_ADJACENT is not a pool ladder and `discardCardsUpTo` is
    // not a `powerCost`), which would leave the tag guard untested. Feed the
    // pure predicate a fabricated face that WOULD otherwise qualify: identical
    // input twice, once with the fuel-only tag and once without, so only the tag
    // can explain the difference.
    const ladder = { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, amountByPower: { 0: 1, 2: 2 } } as never;
    const meteorFace = { id: "test.meteor", tags: ["meteor-shower"] } as never;
    const plainFace = { id: "test.plain", tags: [] } as never;
    expect(playConsumesWindowPower(meteorFace, ladder), "fuel-only: pooled Power must not be offered").toBe(false);
    expect(playConsumesWindowPower(plainFace, ladder), "the very same ladder without the tag IS a sink").toBe(true);
    // …and the same for a `powerCost` tier riding a fuel-only face.
    expect(playConsumesWindowPower(meteorFace, ladder, { powerCost: 2 })).toBe(false);
    expect(playConsumesWindowPower(plainFace, undefined, { powerCost: 2 })).toBe(true);
  });
});

describe("the attack window still refuses Power with nothing to feed", () => {
  it("CONTROL: a lone '+1 Power' batch beside a non-sink artifact is still rejected", () => {
    // The widening must not turn the pairing rule off: with only a flat defense
    // artifact to play, pooled Power genuinely dissipates and stays refused.
    const state = declareLethalAttack(
      "pool-gate-control",
      ["stat.power", "artifact.sentinels_shield"],
      "gold"
    );
    const at = passUntilP1(state);
    const powerOffered = getLegalActions(at, "p1").some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(powerOffered, "no sink in hand ⇒ no Power play is offered").toBe(false);
    const forced = applyAction(at, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "stat.power" as CardId, mode: "basic" }]
    });
    expect(forced.errors.length, "and a forged lone-Power batch is refused").toBeGreaterThan(0);
  });
});
