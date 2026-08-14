import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import { cardLibrary } from "@/data/cards/library";
import { healFxPlans } from "@/data/fx";
import type { GameAction, GameEvent, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

// First Aid mirrors Artillery: the basic side heals 1 from hand; the expert side
// ("when using the First Aid Tent, resolve its effect against the same target 3
// times") is NOT a property of the Tent — it is this card's expert side, gated
// on holding the card with a free expert use. The Tent on its own heals once.

// ===========================================================================
// Card definition — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("First Aid card definition", () => {
  it("is an implemented CHOOSE_ONE: basic heal-1 + expert First Aid Tent volley (3×)", () => {
    const card = cardLibrary["ability.first_aid"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      return;
    }
    // The two classic sides plus the Polish Balance Pack's +2-Health expert,
    // APPENDED (index 2) so the classic indices below keep their meaning.
    expect(card.effect.options).toHaveLength(3);

    const basic = card.effect.options[0];
    expect(basic.effect.type).toBe("HEAL_DAMAGE");
    if (basic.effect.type === "HEAL_DAMAGE") {
      expect(basic.effect.amount).toBe(1);
    }

    const expert = card.effect.options[1];
    // The volley is the printed Expert side EXCEPT under the Balance Pack, where
    // the reprint moves it onto the basic side (`expertUnlessHouseRule`).
    expect(expert.expertOnly).toBeFalsy();
    expect(expert.expertUnlessHouseRule).toBe("polish-card-balance");
    expect(expert.effect.type).toBe("FIRST_AID_TENT_VOLLEY");
    if (expert.effect.type === "FIRST_AID_TENT_VOLLEY") {
      expect(expert.effect.heals).toBe(3);
    }

    const balance = card.effect.options[2];
    expect(balance.requiresHouseRule).toBe("polish-card-balance");
    expect(balance.requiresWarMachine).toBe("war_machine.first_aid_tent");
    expect(balance.expertOnly).toBe(true);
    expect(balance.effect.type).toBe("ADD_UNIT_MAX_HEALTH");
  });

  it("is reachable in real games — included in the ability decks", () => {
    expect(abilityDeckLegacy).toContain("ability.first_aid");
    expect(abilityDeckBinh).toContain("ability.first_aid");
  });

  it("the expert side cannot be played directly from hand", () => {
    const state = createInitialGameState("first-aid-from-hand");
    state.players.p1.hand = ["ability.first_aid"];
    state.players.p1.limits.expertUses = 2;
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.first_aid",
      optionIndex: 1,
      mode: "expert",
      target: { type: "none" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Basic side — heal 1 from hand, and the FX hook the user's "proper sound" needs
// ===========================================================================

describe("First Aid (basic) — heal from hand", () => {
  it("heals 1 from the card, so the FX layer can play the cure shimmer + chime", () => {
    // The table plays a non-spell heal off healFxPlans[source.cardId] on the
    // DAMAGE_HEALED it logs. So the heal is only SEEN/HEARD when (a) it names the
    // card as its source, and (b) a plan is keyed there. Assert both — without
    // the plan the played card floats a bare "+1" in silence.
    const state = createInitialGameState("first-aid-basic-seed");
    state.players.p1.hand = ["ability.first_aid"];
    state.players.p2.hand = [];
    const wounded = state.combat!.units.unit_p1_crusaders;
    wounded.maxHealth = 6;
    wounded.damage = 3;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.first_aid" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(play, "First Aid basic should be playable on a wounded friendly").toBeTruthy();

    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p1_crusaders.damage).toBe(2); // 1 damage removed

    const heal = after.eventLog.find(
      (event): event is Extract<GameEvent, { type: "DAMAGE_HEALED" }> =>
        event.type === "DAMAGE_HEALED" &&
        event.source.type === "card" &&
        event.source.cardId === "ability.first_aid"
    );
    expect(heal, "First Aid heal must name the card as its source").toBeTruthy();
    const plan = heal!.source.type === "card" ? healFxPlans[heal!.source.cardId] : undefined;
    expect(plan, "healFxPlans must answer the First Aid heal").toBeTruthy();
    expect(plan!.sound).toBe("spells/cure");
    expect(plan!.affect?.[0]?.key).toBe("cure");
  });
});

// ===========================================================================
// Expert volley — only with the First Aid Tent in play AND the card in hand
// ===========================================================================

describe("First Aid expert — Tent heal 3× against the same target", () => {
  function tentAndCard(crowns = 2): GameState {
    const state = createInitialGameState("first-aid-volley-seed");
    state.players.p1.hand = ["war_machine.first_aid_tent", "ability.first_aid"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = crowns;
    // A tanky wounded friendly so it stays wounded across several heals.
    state.combat!.units.unit_p1_crusaders.maxHealth = 6;
    state.combat!.units.unit_p1_crusaders.damage = 4;
    return applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
  }

  function healEffectId(state: GameState): string {
    const effect = state.activeEffects.find((candidate) => candidate.name === "First Aid Tent");
    expect(effect, "the Tent's heal effect should be in play").toBeTruthy();
    return effect!.id;
  }

  it("heals 3× for one expert use, consumes the First Aid card, then offers no more heals", () => {
    let state = tentAndCard();
    const effectId = healEffectId(state);
    expect(state.players.p1.hand).toContain("ability.first_aid");

    const heal = (mode?: "expert") =>
      applyOk(state, {
        type: "USE_ACTIVE_EFFECT",
        playerId: "p1",
        effectId,
        target: { type: "unit", unitId: "unit_p1_crusaders" },
        ...(mode ? { mode } : {})
      });

    state = heal("expert"); // activate expert: spend 1 crown, discard the card, heal 1
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(3);
    // The expert side consumed the First Aid ability card (one volley per card).
    expect(state.players.p1.hand).not.toContain("ability.first_aid");
    expect(state.players.p1.discard).toContain("ability.first_aid");

    state = heal(); // 2nd heal — no extra crown, no card needed
    state = heal(); // 3rd heal
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(1);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    // Three heals are spent for the round; nothing more on offer.
    const moreHeals = getLegalActions(state, "p1").filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(moreHeals).toHaveLength(0);
  });

  it("blocks the expert once the basic heal was used this round (and keeps the card)", () => {
    let state = tentAndCard();
    const effectId = healEffectId(state);

    state = applyOk(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId,
      target: { type: "unit", unitId: "unit_p1_crusaders" }
    });
    const offers = getLegalActions(state, "p1").filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(offers).toHaveLength(0); // basic used up the round; no expert either

    const expertResult = applyAction(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId,
      target: { type: "unit", unitId: "unit_p1_crusaders" },
      mode: "expert"
    });
    expect(expertResult.errors.length).toBeGreaterThan(0);
    // The basic heal never consumed the First Aid card.
    expect(state.players.p1.hand).toContain("ability.first_aid");
  });

  it("does not offer the expert with no expert uses left, even holding the card", () => {
    const state = tentAndCard(0);
    healEffectId(state);
    const offered = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.mode === "expert"
    );
    expect(offered).toHaveLength(0);
  });
});
