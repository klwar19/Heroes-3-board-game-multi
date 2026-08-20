/**
 * Community Balance Change (`community-card-balance`) — the sheet's UNITS tab
 * and its WAR MACHINES tab.
 *
 * Every claim is an OBSERVABLE outcome — the damage a blow really deals, the
 * gold a shop really takes, the reaction the engine really offers — paired with
 * a rule-OFF CONTROL on the SAME setup, so a pass proves the reprint moved the
 * number rather than that a flag was written (CLAUDE.md #1a).
 *
 * COMPOSITION is pinned in both directions against the two older per-unit
 * toggles (`griffin-buff`, `marksman-buff`), because the community sheet's four
 * changed sides overlap them and the community value must hold whatever those
 * say.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  applyUnitSideRules,
  unitSideRuleOverrides,
  getMainHero,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type MapFieldState,
  type PlayerId
} from "./index";
import { beginFieldVisit } from "./adventure";
import { isHandLockedInCombat } from "./legal-actions";
import { warMachinesForSale } from "./permanents";
import { coreUnitDefinitions } from "@/data/factions/units";
import { communityBalanceWarMachineCards } from "@/data/cards/community-war-machines-balance";
import { cardLibrary } from "@/data/cards/library";
import { applyUnitCurrentSide } from "./unit-transforms";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

type UnitToggles = {
  community?: boolean;
  griffinBuff?: boolean;
  marksmanBuff?: boolean;
};

/** A clean sandbox combat whose frozen house rules carry the three unit toggles. */
function freshCombat(seed: string, toggles: UnitToggles): GameState {
  const state = createInitialGameState(seed);
  state.adventure = {
    houseRules: {
      "community-card-balance": toggles.community ?? false,
      "griffin-buff": toggles.griffinBuff ?? false,
      "marksman-buff": toggles.marksmanBuff ?? false
    }
  } as unknown as GameState["adventure"];
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], attack: 0, defense: 0, maxHealth: 60, damage: 0, position: 0 });
  }
  return state;
}

/**
 * Re-mints a sandbox body as the given printed unit side and folds the live
 * house rules onto it through the ENGINE's own recompute
 * (`applyUnitCurrentSide` → `applyUnitSideRules`), which is exactly what a real
 * combat unit goes through at mint and on every side change.
 */
function becomeUnit(
  state: GameState,
  unitId: string,
  unitDefId: string,
  variant: "few" | "pack" | "neutral",
  overrides: Partial<CombatUnitState> = {}
): CombatUnitState {
  const unit = state.combat!.units[unitId];
  Object.assign(unit, { unitDefId, variant, damage: 0, ...overrides });
  applyUnitCurrentSide(unit, state.ruleset ?? "legacy", unitSideRuleOverrides(state));
  return unit;
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId as PlayerId;
  state.combat!.activeUnitId = attackerId;
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

const ATTACKER = "unit_p1_marksmen";
const DEFENDER = "unit_p2_skeletons";

/**
 * A plain Attack-4 blow (scripted "0" die) into the given Castle unit side, run
 * through the REAL attack pipeline. The returned damage is
 * `4 − effective defense`, so a defense change is a damage change.
 */
function damageTaken(seed: string, toggles: UnitToggles, unitDefId: string, variant: "few" | "pack"): number {
  const state = freshCombat(seed, toggles);
  Object.assign(state.combat!.units[ATTACKER], {
    position: 9,
    controllerId: "p1",
    abilities: [],
    attack: 4,
    defense: 0,
    type: "ground"
  });
  becomeUnit(state, DEFENDER, unitDefId, variant, {
    position: 10,
    controllerId: "p2",
    maxHealth: 60,
    type: "ground"
  });
  // Keep the body alive for the whole blow so the damage is readable (a real
  // Pack would flip; the point here is the number the defense produced).
  state.combat!.units[DEFENDER].maxHealth = 60;
  return attack(state, ATTACKER, DEFENDER).combat!.units[DEFENDER].damage;
}

// ===========================================================================
// Griffins: 0 → 1 Defense on BOTH sides
// ===========================================================================
describe("Community Balance Change — Griffins gain 1 Defense on Few AND Pack", () => {
  it("cuts an Attack-4 blow from 4 to 3 on the FEW side [MUTATION-CHECK]", () => {
    // CONTROL: every unit toggle off — the printed Few has 0 Defense.
    expect(damageTaken("griff-few-off", {}, "castle.griffins", "few")).toBe(4);
    // CONTROL: the OLDER griffin-buff alone gives the FEW +1 ATTACK, never
    // defense, so a blow INTO it is unchanged.
    expect(damageTaken("griff-few-old", { griffinBuff: true }, "castle.griffins", "few")).toBe(4);
    // The community reprint: 1 Defense, so the same blow lands for 3.
    expect(damageTaken("griff-few-on", { community: true }, "castle.griffins", "few")).toBe(3);
    // COMPOSITION: with the older toggle ALSO on, the defense still holds.
    expect(
      damageTaken("griff-few-both", { community: true, griffinBuff: true }, "castle.griffins", "few")
    ).toBe(3);
  });

  it("cuts an Attack-4 blow from 4 to 3 on the PACK side, with or without griffin-buff", () => {
    expect(damageTaken("griff-pack-off", {}, "castle.griffins", "pack")).toBe(4);
    // The older toggle already gave the PACK 1 defense — the community rule must
    // deliver the same value on its own (that is the composition claim).
    expect(damageTaken("griff-pack-old", { griffinBuff: true }, "castle.griffins", "pack")).toBe(3);
    expect(damageTaken("griff-pack-on", { community: true }, "castle.griffins", "pack")).toBe(3);
    expect(
      damageTaken("griff-pack-both", { community: true, griffinBuff: true }, "castle.griffins", "pack")
    ).toBe(3);
  });

  it("leaves the Few's ATTACK to griffin-buff alone — the two rules compose, neither overwrites", () => {
    const printedFew = coreUnitDefinitions["castle.griffins"]!.few!;
    expect([printedFew.attack, printedFew.defense]).toEqual([2, 0]);
    const read = (toggles: UnitToggles) => {
      const state = freshCombat(`compose-${JSON.stringify(toggles)}`, toggles);
      const side = applyUnitSideRules(
        state.ruleset ?? "legacy",
        "castle.griffins",
        "few",
        printedFew,
        unitSideRuleOverrides(state)
      );
      return [side.attack, side.defense];
    };
    expect(read({})).toEqual([2, 0]);
    expect(read({ griffinBuff: true })).toEqual([3, 0]);
    expect(read({ community: true })).toEqual([2, 1]);
    // Both on: BOTH bonuses, in either reading order (idempotent composition).
    expect(read({ community: true, griffinBuff: true })).toEqual([3, 1]);
  });

  it("stamps the reprinted FACE onto the overridden side, so every unit surface paints it", () => {
    // ONE seam: the face rides `applyUnitSideRules`, so the combat unit's own
    // `assets.cardImage` (board / zoom / inspector / initiative strip / drag
    // ghost) and every stat-folded panel get it without a per-surface change.
    const state = freshCombat("face-on", { community: true });
    const griffins = becomeUnit(state, DEFENDER, "castle.griffins", "few", { controllerId: "p2" });
    expect(griffins.assets?.cardImage).toBe("/assets/community-balance/unit-castle-griffins-few.webp");
    const halberdiers = becomeUnit(state, DEFENDER, "castle.halberdiers", "pack", { controllerId: "p2" });
    expect(halberdiers.assets?.cardImage).toBe("/assets/community-balance/unit-castle-halberdiers-pack.webp");
    // CONTROL: an UNCHANGED side of a covered unit keeps its printed scan.
    const halberdierFew = becomeUnit(state, DEFENDER, "castle.halberdiers", "few", { controllerId: "p2" });
    expect(halberdierFew.assets?.cardImage).toBe(coreUnitDefinitions["castle.halberdiers"]!.few!.cardImage);
    // CONTROL: rule OFF paints the printed scan for the reprinted side too.
    const off = freshCombat("face-off", {});
    const printedGriffins = becomeUnit(off, DEFENDER, "castle.griffins", "few", { controllerId: "p2" });
    expect(printedGriffins.assets?.cardImage).toBe(coreUnitDefinitions["castle.griffins"]!.few!.cardImage);
  });

  it("CONTROL: no OTHER Castle unit's defense moves", () => {
    expect(damageTaken("crusaders-on", { community: true }, "castle.crusaders", "few")).toBe(
      damageTaken("crusaders-off", {}, "castle.crusaders", "few")
    );
  });
});

// ===========================================================================
// Marksmen Pack: 2 → 3 Health
// ===========================================================================
describe("Community Balance Change — the Pack of Marksmen has 3 Health", () => {
  it("survives a 2-damage blow that removes the printed 2-Health Pack [MUTATION-CHECK]", () => {
    const run = (seed: string, toggles: UnitToggles) => {
      const state = freshCombat(seed, toggles);
      Object.assign(state.combat!.units[ATTACKER], {
        position: 9,
        controllerId: "p1",
        abilities: [],
        attack: 2,
        defense: 0,
        type: "ground"
      });
      const defender = becomeUnit(state, DEFENDER, "castle.marksmen", "pack", {
        position: 10,
        controllerId: "p2",
        type: "ground"
      });
      const maxHealth = defender.maxHealth;
      const after = attack(state, ATTACKER, DEFENDER).combat!.units[DEFENDER];
      return { maxHealth, damage: after.damage, variant: after.variant };
    };
    // CONTROL: both toggles off — printed 2 Health, so the 2-damage blow is
    // LETHAL to the Pack and the card flips down to its Few side (damage reset).
    const off = run("mark-off", {});
    expect([off.maxHealth, off.variant, off.damage]).toEqual([2, "few", 0]);
    // The community reprint: 3 Health, so the same blow leaves the PACK standing
    // at 2 damage — it never flips.
    const on = run("mark-on", { community: true });
    expect([on.maxHealth, on.variant, on.damage]).toEqual([3, "pack", 2]);
    // COMPOSITION: the older marksman-buff gives the same 3, alone or together.
    expect(run("mark-old", { marksmanBuff: true }).maxHealth).toBe(3);
    expect(run("mark-both", { community: true, marksmanBuff: true }).maxHealth).toBe(3);
  });

  it("CONTROL: the Marksmen FEW side is untouched", () => {
    const state = freshCombat("mark-few", { community: true });
    const few = becomeUnit(state, DEFENDER, "castle.marksmen", "few", { controllerId: "p2" });
    expect(few.maxHealth).toBe(coreUnitDefinitions["castle.marksmen"]!.few!.health);
  });
});

// ===========================================================================
// Halberdiers Pack: Parry loses its discard cost
// ===========================================================================
describe("Community Balance Change — the Pack of Halberdiers ignores the Attack die for FREE", () => {
  /**
   * A "+1" Attack-die blow into a Pack of Halberdiers, leaving the post-roll
   * die-cancel window OPEN so the Parry offers can be read.
   */
  function openDieWindow(
    seed: string,
    toggles: UnitToggles,
    hand: string[],
    prepare?: (state: GameState) => void
  ): GameState {
    const state = freshCombat(seed, toggles);
    state.players.p2.hand = [...hand];
    // Applied BEFORE the blow: the window snapshots its offers when it opens.
    prepare?.(state);
    state.combat!.dice.scriptedRolls = [1, 1, 1, 1, 1, 1];
    state.combat!.dice.rollCount = 0;
    Object.assign(state.combat!.units[ATTACKER], {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 4,
      defense: 0,
      type: "ground"
    });
    becomeUnit(state, DEFENDER, "castle.halberdiers", "pack", {
      position: 10,
      controllerId: "p2",
      maxHealth: 60,
      type: "ground"
    });
    state.combat!.units[DEFENDER].maxHealth = 60;
    const attacker = state.combat!.units[ATTACKER];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = ATTACKER;
    attacker.activatedThisRound = false;
    attacker.attackedThisActivation = false;
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: ATTACKER,
      defenderId: DEFENDER
    });
  }

  const parryOffers = (state: GameState) =>
    getLegalActions(state, "p2")
      .map((legal) => legal.action)
      .filter(
        (action): action is Extract<GameAction, { type: "USE_UNIT_DIE_IGNORE" }> =>
          action.type === "USE_UNIT_DIE_IGNORE"
      );

  it("swaps the printed discard-cost Parry for the FREE one on the Pack side only", () => {
    const state = freshCombat("halb-abilities", { community: true });
    const pack = becomeUnit(state, DEFENDER, "castle.halberdiers", "pack", { controllerId: "p2" });
    expect(pack.abilities).toContain("halberdier-die-ignore-free");
    // A REPLACEMENT, never an addition: both would offer the defender two Parries.
    expect(pack.abilities).not.toContain("halberdier-die-ignore");
    // CONTROL: rule off keeps the printed discard-cost ability.
    const off = freshCombat("halb-abilities-off", {});
    const printedPack = becomeUnit(off, DEFENDER, "castle.halberdiers", "pack", { controllerId: "p2" });
    expect(printedPack.abilities).toContain("halberdier-die-ignore");
    expect(printedPack.abilities).not.toContain("halberdier-die-ignore-free");
    // CONTROL: the FEW side has no Parry at all, either way.
    const few = becomeUnit(state, DEFENDER, "castle.halberdiers", "few", { controllerId: "p2" });
    expect(few.abilities).not.toContain("halberdier-die-ignore-free");
  });

  it("is offered with an EMPTY hand and really zeroes the die's +1 [MUTATION-CHECK]", () => {
    // CONTROL: rule OFF, empty hand — the printed Parry needs a card to discard,
    // so nothing is offered and the "+1" lands in full.
    const offEmpty = openDieWindow("halb-off-empty", {}, []);
    expect(parryOffers(offEmpty)).toHaveLength(0);
    const offDamage = settle(offEmpty).combat!.units[DEFENDER].damage;

    // Rule ON, still an empty hand: exactly ONE offer, and it carries no card id.
    const onEmpty = openDieWindow("halb-on-empty", { community: true }, []);
    const offers = parryOffers(onEmpty);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.discardCardId).toBeUndefined();

    const parried = settle(applyOk(onEmpty, offers[0]!)).combat!.units[DEFENDER].damage;
    // The blow is Attack 4 + a "+1" die into Defense 1 ⇒ 4 without the die's +1.
    expect(offDamage).toBe(parried + 1);
    // Nothing was discarded — the hand was empty and stays empty.
    expect(settle(applyOk(onEmpty, offers[0]!)).players.p2.hand).toEqual([]);
    // Remove the `communityBalance` Halberdier arm in applyUnitSideRules and the
    // offer count above is 0 again.
  });

  it("never spends a card, even with a full hand — and refuses a frame that names one", () => {
    const state = openDieWindow("halb-on-hand", { community: true }, ["spell.haste", "spell.bless"]);
    const offers = parryOffers(state);
    // ONE offer (the printed version would list one per discardable card).
    expect(offers).toHaveLength(1);
    const after = settle(applyOk(state, offers[0]!));
    expect(after.players.p2.hand.sort()).toEqual(["spell.bless", "spell.haste"]);
    // A hand-forged frame that tries to pay a cost the reprint removed is refused.
    const forged = applyAction(state, { ...offers[0]!, discardCardId: "spell.haste" });
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("survives a LOCKED hand (a heroless garrison defense) — it is a unit ability, not a card play", () => {
    // The printed Parry pays a hand card, so the hand lock rightly withholds it;
    // the reprint costs nothing, which is why its offer sits ABOVE that gate.
    const lock = (state: GameState) => {
      const combat = state.combat!;
      combat.attackerPlayerId = "p1";
      combat.defenderPlayerId = "p2";
      // Heroless (garrison) defender ⇒ units-only ⇒ p2's hand is locked.
      combat.context = { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: null } as typeof combat.context;
    };
    const on = openDieWindow("halb-lock-on", { community: true }, ["spell.haste"], lock);
    expect(isHandLockedInCombat(on, "p2")).toBe(true);
    expect(parryOffers(on)).toHaveLength(1);
    expect(parryOffers(on)[0]!.discardCardId).toBeUndefined();
    // CONTROL: the printed discard Parry IS withheld by the same lock.
    const off = openDieWindow("halb-lock-off", {}, ["spell.haste"], lock);
    expect(isHandLockedInCombat(off, "p2")).toBe(true);
    expect(parryOffers(off)).toHaveLength(0);
  });

  it("CONTROL: the printed discard Parry still works (and still costs a card) with the rule off", () => {
    const state = openDieWindow("halb-off-hand", {}, ["spell.haste"]);
    const offers = parryOffers(state);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.discardCardId).toBe("spell.haste");
    const after = settle(applyOk(state, offers[0]!));
    expect(after.players.p2.hand).toEqual([]);
  });
});

// ===========================================================================
// War machines: the two shop prices
// ===========================================================================
const WAR_MACHINE_PRICES: { cardId: string; printed: [number, number]; community: [number, number] }[] = [
  { cardId: "war_machine.ammo_cart", printed: [5, 8], community: [3, 5] },
  { cardId: "war_machine.ballista", printed: [7, 10], community: [4, 6] },
  // The Tent is the sheet's one price RISE.
  { cardId: "war_machine.first_aid_tent", printed: [3, 6], community: [5, 7] }
];

function shopState(seed: string, community: boolean): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.houseRules = {
    ...(state.adventure!.houseRules ?? {}),
    "community-card-balance": community
  };
  state.activePlayerId = "p1";
  state.players.p1.resources = { gold: 40, buildingMaterials: 0, valuables: 0 };
  state.players.p1.hand = [];
  return state;
}

function priceAt(state: GameState, pricing: "factory" | "trading-post", cardId: string): number | undefined {
  return warMachinesForSale(state, pricing, "p1").find((offer) => offer.cardId === cardId)?.cost.gold;
}

/** Puts the hero on a fresh field carrying `location` and opens its visit. */
function visitLocation(state: GameState, location: string): GameState {
  const field: MapFieldState = {
    spaceId: "community-wm-field",
    tileInstanceId: "community-wm-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  beginFieldVisit(state, hero.id, field.spaceId, false);
  return state;
}

describe("Community Balance Change — the three re-priced War Machines", () => {
  it("prices every machine at BOTH shops, and leaves the Catapult and Cannon alone [MUTATION-CHECK]", () => {
    const off = shopState("wm-off", false);
    const on = shopState("wm-on", true);
    for (const { cardId, printed, community } of WAR_MACHINE_PRICES) {
      expect([cardId, priceAt(off, "factory", cardId), priceAt(off, "trading-post", cardId)]).toEqual([
        cardId,
        ...printed
      ]);
      expect([cardId, priceAt(on, "factory", cardId), priceAt(on, "trading-post", cardId)]).toEqual([
        cardId,
        ...community
      ]);
      // Non-vacuity: the reprint really is a different number at both shops.
      expect(community).not.toEqual(printed);
    }
    // CONTROL: the two machines the sheet does not touch keep their prices.
    for (const cardId of ["war_machine.catapult", "war_machine.cannon"]) {
      expect([cardId, priceAt(on, "factory", cardId), priceAt(on, "trading-post", cardId)]).toEqual([
        cardId,
        priceAt(off, "factory", cardId),
        priceAt(off, "trading-post", cardId)
      ]);
    }
  });

  it("CHARGES the new price at the War Machine Factory, not the printed one", () => {
    const buyAt = (community: boolean, location: string, cardId: string): number => {
      const state = visitLocation(shopState(`wm-buy-${community}-${location}`, community), location);
      const before = state.players.p1.resources.gold;
      const buy = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "BUY_WAR_MACHINE" && legal.action.cardId === cardId
      );
      expect(buy, `${cardId} is on sale at ${location}`).toBeTruthy();
      const after = applyOk(state, buy!.action);
      expect(after.players.p1.hand).toContain(cardId);
      return before - after.players.p1.resources.gold;
    };
    // Factory (the sheet's "Blacksmith") — the Ballista falls 7 → 4.
    expect(buyAt(false, "war_machine_factory", "war_machine.ballista")).toBe(7);
    expect(buyAt(true, "war_machine_factory", "war_machine.ballista")).toBe(4);
    // The First Aid Tent RISES 3 → 5 at the same shop.
    expect(buyAt(false, "war_machine_factory", "war_machine.first_aid_tent")).toBe(3);
    expect(buyAt(true, "war_machine_factory", "war_machine.first_aid_tent")).toBe(5);
    // Trading Post — the Ammo Cart falls 8 → 5.
    expect(buyAt(false, "trading_post", "war_machine.ammo_cart")).toBe(8);
    expect(buyAt(true, "trading_post", "war_machine.ammo_cart")).toBe(5);
    // CONTROL: the untouched Catapult charges the same either way.
    expect(buyAt(true, "war_machine_factory", "war_machine.catapult")).toBe(
      buyAt(false, "war_machine_factory", "war_machine.catapult")
    );
  });

  it("changes NOTHING but the prices on the reprinted machine definitions", () => {
    for (const [cardId, reprint] of Object.entries(communityBalanceWarMachineCards)) {
      const printed = cardLibrary[cardId]!;
      expect(reprint.permanentEffect).toEqual(printed.permanentEffect);
      expect(reprint.effect).toEqual(printed.effect);
      expect(reprint.assets).toEqual(printed.assets);
      expect(reprint.warMachineCosts).not.toEqual(printed.warMachineCosts);
    }
  });
});
