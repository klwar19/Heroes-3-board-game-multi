/**
 * Player-facing spell-cast restriction WARNINGS (`spellCastRestrictionNotices`).
 *
 * Each case pins the NON-DRIFT contract, not just the string: wherever a
 * restriction really suppresses the CAST_SPELL offers, the same test asserts
 * BOTH that the offers are gone AND that the notice is present — and the CONTROL
 * (same state, restriction lifted) asserts the offers return AND the notice
 * disappears. So a notice can never survive its gate, nor a gate its notice.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { spellCastRestrictionNotices } from "./spell-cast-restrictions";
import { makeActiveEffect } from "./active-effects";
import type { ActiveEffectModifier, GameState } from "./state";

const ARROW = "spell.magic_arrow";

/** A sandbox combat with p1 holding a castable Magic Arrow and an active unit. */
function scene(seed = "spell-restriction"): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [ARROW];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

/** Kill a unit the way the engine reads death (`isUnitAlive`: damage ≥ maxHealth). */
function killUnit(state: GameState, unitId: string): void {
  const unit = state.combat!.units[unitId]!;
  unit.damage = unit.maxHealth;
}

/** Add a combat-long effect exactly the way the engine builds one. */
function pushEffect(state: GameState, controllerId: string, modifiers: ActiveEffectModifier[]): void {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      { name: "Test effect", scope: "global", duration: { type: "combat" }, modifiers },
      { type: "card", cardId: "ability.intelligence", controllerId },
      controllerId
    )
  );
}

function castOffered(state: GameState): boolean {
  return getLegalActions(state, "p1").some(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === ARROW
  );
}

function noticeIds(state: GameState, playerId = "p1"): string[] {
  return spellCastRestrictionNotices(state, playerId).map((notice) => notice.id);
}

describe("spellCastRestrictionNotices — nothing in the way", () => {
  it("returns NOTHING while the player can freely cast (the baseline CONTROL)", () => {
    const state = scene();
    expect(castOffered(state)).toBe(true);
    expect(spellCastRestrictionNotices(state, "p1")).toEqual([]);
  });

  it("returns nothing outside a combat, or for a seat that is not in this fight", () => {
    const state = scene();
    const noCombat = { ...state, combat: null } as GameState;
    expect(spellCastRestrictionNotices(noCombat, "p1")).toEqual([]);
    // p3 is not a player of this table at all: no participation, no notices.
    expect(spellCastRestrictionNotices(state, "p3")).toEqual([]);
  });
});

describe("spellCastRestrictionNotices — Faerie Dragons spell lock", () => {
  function lockScene(stacked: boolean): GameState {
    const state = scene("faerie-notice");
    const faerie = state.combat!.units.unit_p2_skeletons;
    faerie.abilities = ["bank-faerie-dragon-spell-lock"];
    faerie.cardName = "Faerie Dragons";
    faerie.stackToken = stacked ? "attack" : null;
    return state;
  }

  it("names the Stacked lock while it suppresses every cast, and is silent once un-Stacked", () => {
    const locked = lockScene(true);
    expect(castOffered(locked)).toBe(false); // the real gate
    const notice = spellCastRestrictionNotices(locked, "p1").find((n) => n.id === "enemy-spell-lock");
    expect(notice?.text).toContain("Faerie Dragons");
    expect(notice?.blocking).toBe(true);

    // CONTROL: absorb the Stack Token → the gate lifts, so must the notice.
    const open = lockScene(false);
    expect(castOffered(open)).toBe(true);
    expect(noticeIds(open)).not.toContain("enemy-spell-lock");
  });

  it("is silent for the Faerie Dragons' OWN controller (the lock binds enemies only)", () => {
    const locked = lockScene(true);
    expect(noticeIds(locked, "p2")).not.toContain("enemy-spell-lock");
  });
});

describe("spellCastRestrictionNotices — Pegasi Mystic Toll", () => {
  function tollScene(extraHand: string[]): GameState {
    const state = scene("pegasi-notice");
    state.players.p1.hand = [ARROW, ...extraHand];
    const pegasi = state.combat!.units.unit_p2_skeletons;
    pegasi.abilities = ["pegasi-power-tax"];
    pegasi.cardName = "Pegasi";
    return state;
  }

  it("warns of the toll while casting still works (a Power card is in hand)", () => {
    const payable = tollScene(["stat.power"]);
    expect(castOffered(payable)).toBe(true);
    const notice = spellCastRestrictionNotices(payable, "p1").find((n) => n.id === "enemy-power-tax");
    expect(notice?.text).toContain("Mystic Toll");
    expect(notice?.blocking).toBe(false);
    expect(noticeIds(payable)).not.toContain("enemy-power-tax-unpayable");
  });

  it("escalates to a hard block when no Power card can pay — and the cast really is gone", () => {
    const broke = tollScene([]);
    expect(castOffered(broke)).toBe(false); // the real gate
    const notice = spellCastRestrictionNotices(broke, "p1").find((n) => n.id === "enemy-power-tax-unpayable");
    expect(notice?.blocking).toBe(true);
    expect(notice?.text).toContain("cannot cast at all");

    // The resolution backstop agrees with the warning.
    const forced = applyAction(broke, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: ARROW,
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    expect(forced.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: with the Pegasi dead there is no toll notice at all", () => {
    const dead = tollScene(["stat.power"]);
    killUnit(dead, "unit_p2_skeletons");
    expect(noticeIds(dead)).not.toContain("enemy-power-tax");
    expect(noticeIds(dead)).not.toContain("enemy-power-tax-unpayable");
  });
});

describe("spellCastRestrictionNotices — Familiars Mana Leech", () => {
  it("warns of the extra hand discard while a live enemy Familiars stands", () => {
    const state = scene("familiar-notice");
    const familiar = state.combat!.units.unit_p2_skeletons;
    familiar.abilities = ["familiar-spell-tax"];
    familiar.cardName = "Familiars";
    // Never a hard block: the cast is still offered, it just costs a discard.
    expect(castOffered(state)).toBe(true);
    const notice = spellCastRestrictionNotices(state, "p1").find((n) => n.id === "enemy-hand-tax");
    expect(notice?.text).toContain("Mana Leech");
    expect(notice?.blocking).toBe(false);

    // CONTROL: kill the Familiars → the reducer stops tolling, so must the notice.
    const dead = scene("familiar-notice");
    const deadFamiliar = dead.combat!.units.unit_p2_skeletons;
    deadFamiliar.abilities = ["familiar-spell-tax"];
    killUnit(dead, "unit_p2_skeletons");
    expect(noticeIds(dead)).not.toContain("enemy-hand-tax");
  });

  it("the toll the reducer really opens matches the notice (shared read)", () => {
    const state = scene("familiar-toll");
    state.players.p1.hand = [ARROW, "stat.power"];
    const familiar = state.combat!.units.unit_p2_skeletons;
    familiar.abilities = ["familiar-spell-tax"];
    expect(noticeIds(state)).toContain("enemy-hand-tax");
    const cast = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: ARROW,
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    expect(cast.errors).toEqual([]);
    expect(cast.state.pendingChoice?.type).toBe("COMBAT_HAND_DISCARD");
    expect(JSON.stringify(cast.state.pendingChoice)).toContain("familiar-choose-discard");
  });
});

describe("spellCastRestrictionNotices — the per-combat-round Spell limit", () => {
  it("reports the spent limit while it blocks the cast, and clears once a cast is free again", () => {
    const spent = scene("limit-notice");
    spent.players.p1.combatStats.spellsCastThisRound = 1;
    expect(castOffered(spent)).toBe(false); // the real gate
    const notice = spellCastRestrictionNotices(spent, "p1").find((n) => n.id === "spell-limit");
    expect(notice?.text).toContain("1/1");
    expect(notice?.blocking).toBe(true);

    // CONTROL: the same state one cast below the limit offers the cast, no notice.
    const fresh = scene("limit-notice");
    expect(castOffered(fresh)).toBe(true);
    expect(noticeIds(fresh)).not.toContain("spell-limit");
  });

  it("reads the REAL limit, so a raised cap silences the notice at the same count", () => {
    const raised = scene("limit-bonus");
    raised.players.p1.combatStats.spellsCastThisRound = 1;
    raised.players.p1.combatStats.spellLimitBonusThisRound = 1; // spellLimitFor → 2
    expect(noticeIds(raised)).not.toContain("spell-limit");
    expect(castOffered(raised)).toBe(true);
  });
});

describe("spellCastRestrictionNotices — activation timing", () => {
  it("explains the missing activation window when no unit of the player is active", () => {
    const state = scene("timing-notice");
    state.combat!.activeUnitId = "unit_p2_skeletons"; // the enemy is up
    expect(castOffered(state)).toBe(false); // the real gate (Magic Arrow is activation-timed)
    const notice = spellCastRestrictionNotices(state, "p1").find((n) => n.id === "no-activation-window");
    expect(notice?.text).toContain("Intelligence");
    expect(notice?.blocking).toBe(false);
  });

  it("CONTROL: Intelligence's timing freedom lifts the gate AND the notice", () => {
    const state = scene("timing-intelligence");
    state.combat!.activeUnitId = "unit_p2_skeletons";
    pushEffect(state, "p1", [{ type: "SPELL_CAST_ANYTIME" }]);
    expect(castOffered(state)).toBe(true);
    expect(noticeIds(state)).not.toContain("no-activation-window");
  });

  it("stays silent while a reaction window is open (nothing is offered there for other reasons)", () => {
    const state = scene("timing-window");
    state.combat!.activeUnitId = "unit_p2_skeletons";
    expect(noticeIds(state)).toContain("no-activation-window");
    state.pendingChoice = {
      id: "choice_x",
      type: "OPTION_CHOICE",
      playerId: "p1",
      context: "test",
      prompt: "…",
      options: []
    } as unknown as NonNullable<GameState["pendingChoice"]>;
    expect(noticeIds(state)).not.toContain("no-activation-window");
  });
});

describe("spellCastRestrictionNotices — Recanter's Cloak", () => {
  it("reports the total lock while it strips every cast offer", () => {
    const state = scene("recanter-lock");
    pushEffect(state, "p2", [{ type: "SPELL_CAST_RESTRICTION", lockAll: true }]);
    expect(castOffered(state)).toBe(false);
    expect(noticeIds(state)).toContain("recanter-lock");
    // CONTROL: without the effect the cast is offered and nothing is reported.
    expect(noticeIds(scene("recanter-lock"))).not.toContain("recanter-lock");
  });

  it("reports the Power floor as a non-blocking warning (the cast is still offered)", () => {
    const state = scene("recanter-floor");
    pushEffect(state, "p2", [{ type: "SPELL_CAST_RESTRICTION", minPower: 1 }]);
    expect(castOffered(state)).toBe(true);
    const notice = spellCastRestrictionNotices(state, "p1").find((n) => n.id === "recanter-min-power");
    expect(notice?.blocking).toBe(false);
    expect(notice?.text).toContain("Power 1");
  });
});

describe("spellCastRestrictionNotices — Polish Spell Book needs a Cast a Spell", () => {
  function bookScene(hand: string[]): GameState {
    const state = scene("polish-book-notice");
    // Freeze the house rule the way a real game does (adventure.houseRules).
    (state as { adventure: unknown }).adventure = { houseRules: { "polish-spell-book": true } };
    state.players.p1.hand = hand;
    state.players.p1.spellBook = [ARROW];
    return state;
  }

  it("says the Book cannot be cast without the enabler, and the offers really are gone", () => {
    const noEnabler = bookScene([]);
    expect(castOffered(noEnabler)).toBe(false); // the real Polish gate
    const notice = spellCastRestrictionNotices(noEnabler, "p1").find(
      (n) => n.id === "polish-no-cast-enabler"
    );
    expect(notice?.blocking).toBe(true);
    expect(notice?.text).toContain("Cast a Spell");

    // CONTROL: hold the enabler → the Book cast is offered and the notice is gone.
    const withEnabler = bookScene(["spell.cast_a_spell"]);
    expect(castOffered(withEnabler)).toBe(true);
    expect(noticeIds(withEnabler)).not.toContain("polish-no-cast-enabler");
  });

  it("CONTROL: Intelligence stands in for the enabler, so no notice is raised", () => {
    const state = bookScene([]);
    pushEffect(state, "p1", [{ type: "SPELL_CAST_ANYTIME" }]);
    expect(noticeIds(state)).not.toContain("polish-no-cast-enabler");
  });
});

describe("spellCastRestrictionNotices — no Hero in the fight (hand locked)", () => {
  function neutralScene(secondary: boolean): GameState {
    const state = scene("hand-lock");
    state.combat!.context = { kind: "neutral", heroId: "hero_p1", difficulty: 1 } as GameState["combat"] extends null
      ? never
      : NonNullable<GameState["combat"]>["context"];
    state.heroes.hero_p1.kind = secondary ? "secondary" : "main";
    return state;
  }

  it("says the whole Deck is locked, and suppresses every other card notice", () => {
    const locked = neutralScene(true);
    expect(castOffered(locked)).toBe(false); // the real gate
    const notices = spellCastRestrictionNotices(locked, "p1");
    expect(notices.map((n) => n.id)).toEqual(["hand-locked"]);
    expect(notices[0]!.blocking).toBe(true);

    // CONTROL: a MAIN hero leads → the deck is usable, so no notice at all.
    const open = neutralScene(false);
    expect(castOffered(open)).toBe(true);
    expect(noticeIds(open)).not.toContain("hand-locked");
  });
});
