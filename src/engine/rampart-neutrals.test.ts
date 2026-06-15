import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * The six core Rampart creatures' neutral guard cards, plus the two new
 * spell-cast abilities they introduce:
 *   • Pegasi (neutral) — "Mystic Toll": each enemy Spell cast costs a Power card.
 *   • Unicorns (neutral) — Retaliation paralysis (reuses PARALYZE_ON_RETALIATION).
 * Centaurs/Dwarves/Elves/Dendroids reuse the faction creatures' implemented
 * ability tags; Peasants gain 3 gold per Resource round (resource-round
 * behaviour is covered in unit-ability-interactions.test.ts).
 *
 * Stats and abilities below are transcribed from each card face on the fan wiki.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

// ---------------------------------------------------------------------------
// Data integrity — the six Rampart neutral guards ship with the right stats,
// tier, type, ability ids and card art (transcribed from the card faces).
// ---------------------------------------------------------------------------

describe("Rampart neutral guard roster", () => {
  const expected: Record<
    string,
    { tier: string; type: string; stats: [number, number, number, number]; gold: number; abilities: string[] }
  > = {
    "neutral.centaurs": { tier: "bronze", type: "ground", stats: [2, 0, 5, 7], gold: 3, abilities: [] },
    "neutral.dwarves": { tier: "bronze", type: "ground", stats: [2, 1, 4, 3], gold: 4, abilities: ["dwarf-magic-resistance"] },
    "neutral.elves": { tier: "bronze", type: "ranged", stats: [2, 1, 3, 6], gold: 7, abilities: ["double-attack-low-roll"] },
    "neutral.pegasi": { tier: "silver", type: "flying", stats: [3, 0, 5, 8], gold: 14, abilities: ["pegasi-power-tax"] },
    "neutral.dendroids": { tier: "silver", type: "ground", stats: [3, 2, 6, 3], gold: 12, abilities: ["dendroid-bind"] },
    "neutral.unicorns": { tier: "gold", type: "ground", stats: [5, 1, 7, 7], gold: 18, abilities: ["unicorn-paralyze-retaliation"] }
  };

  for (const [unitId, spec] of Object.entries(expected)) {
    it(`${unitId} matches its card face and joins the ${spec.tier} guard deck`, () => {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeTruthy();
      expect(def.faction).toBe("neutral");
      expect(def.tier).toBe(spec.tier);
      expect(def.type).toBe(spec.type);

      const side = def.neutral;
      expect(side, `${unitId} has a neutral side`).toBeTruthy();
      const [attack, defense, health, initiative] = spec.stats;
      expect([side!.attack, side!.defense, side!.health, side!.initiative]).toEqual([attack, defense, health, initiative]);
      expect(side!.cost.gold).toBe(spec.gold);
      expect(side!.abilities).toEqual(spec.abilities);
      expect(side!.cardImage, `${unitId} card art`).toBeTruthy();

      expect(neutralUnitIdsByTier[spec.tier as "bronze" | "silver" | "gold" | "azure"]).toContain(unitId);

      // Every wired ability id resolves to an implemented engine ability.
      for (const abilityId of spec.abilities) {
        expect(unitAbilities[abilityId]?.implementationStatus, abilityId).toBe("implemented");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// New ability wiring — the two abilities that did NOT already exist.
// ---------------------------------------------------------------------------

describe("new neutral abilities are wired to implemented effects", () => {
  it("pegasi-power-tax → SPELL_CAST_POWER_TAX (implemented)", () => {
    const ability = unitAbilities["pegasi-power-tax"];
    expect(ability?.implementationStatus).toBe("implemented");
    expect(ability?.effect?.type).toBe("SPELL_CAST_POWER_TAX");
  });

  it("unicorn-paralyze-retaliation → PARALYZE_ON_RETALIATION (implemented, no die)", () => {
    const ability = unitAbilities["unicorn-paralyze-retaliation"];
    expect(ability?.implementationStatus).toBe("implemented");
    expect(ability?.effect?.type).toBe("PARALYZE_ON_RETALIATION");
    if (ability?.effect?.type === "PARALYZE_ON_RETALIATION") {
      expect(ability.effect.onRoll).toBeUndefined(); // automatic, like the Medusa Pack gaze
    }
  });

  it("peasant-gold-income → MAP_RESOURCE_ROUND_GAIN gold 3 (implemented)", () => {
    const ability = unitAbilities["peasant-gold-income"];
    expect(ability?.implementationStatus).toBe("implemented");
    expect(ability?.mapEffect).toEqual({ type: "MAP_RESOURCE_ROUND_GAIN", resource: "gold", amount: 3 });
  });
});

// ---------------------------------------------------------------------------
// Pegasi "Mystic Toll" — each enemy Spell cast costs a Power card from hand.
// ---------------------------------------------------------------------------

describe("Neutral Pegasi 'Mystic Toll' (pay a Power card to cast — or you can't)", () => {
  function combatWithEnemy(
    enemyAbilities: string[],
    p1Hand: string[],
    scrolls?: { id: string; spellCardIds: string[] }[]
  ): GameState {
    const state = createInitialGameState();
    state.players.p1.hand = [...p1Hand];
    if (scrolls) {
      state.players.p1.scrolls = scrolls;
    }
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.abilities = enemyAbilities;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  function findArrowCast(state: GameState, fromScroll?: string) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        (fromScroll ? legal.action.fromScroll === fromScroll : !legal.action.fromScroll)
    );
  }

  /** Reads the open toll prompt (a COMBAT_HAND_DISCARD of kind "pegasi-toll"). */
  function tollChoice(state: GameState) {
    const choice = state.pendingChoice;
    expect(choice?.type, "a Pegasi toll prompt should be open").toBe("COMBAT_HAND_DISCARD");
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      throw new Error("expected a COMBAT_HAND_DISCARD prompt");
    }
    expect(choice.kind).toBe("pegasi-toll");
    return choice;
  }

  it("prompts the caster to choose which Power card to pay, THEN casts the Spell", () => {
    const state = combatWithEnemy(["pegasi-power-tax"], ["spell.magic_arrow", "stat.power", "stat.attack"]);
    const cast = findArrowCast(state);
    expect(cast, "the cast is legal because a Power card can be paid").toBeTruthy();

    // Casting opens the toll prompt; the Spell is NOT cast yet (still in hand).
    const parked = applyOk(state, cast!.action);
    const choice = tollChoice(parked);
    expect(choice.playerId).toBe("p1");
    expect(new Set(choice.powerCardIds)).toEqual(new Set(["stat.power"])); // not stat.attack, not the cast spell
    expect(parked.players.p1.hand).toContain("spell.magic_arrow");

    // Only the Power card is offered to pay — there is NO "random" option.
    const tollActions = getLegalActions(parked, "p1").filter(
      (legal) => legal.action.type === "RESOLVE_COMBAT_DISCARD"
    );
    expect(
      tollActions.map((legal) => (legal.action.type === "RESOLVE_COMBAT_DISCARD" ? legal.action.cardId : ""))
    ).toEqual(["stat.power"]);

    // Pay the toll → the Spell is cast.
    const next = passAllReactions(
      applyOk(parked, { type: "RESOLVE_COMBAT_DISCARD", playerId: "p1", choiceId: choice.id, cardId: "stat.power" })
    );
    expect(next.pendingChoice).toBeNull();
    expect(next.players.p1.hand).toEqual(["stat.attack"]);
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toContain("stat.power");
    expect(abilityEventIds(next)).toContain("pegasi-power-tax");
  });

  it("lets the caster pick WHICH Power card to pay", () => {
    const state = combatWithEnemy(["pegasi-power-tax"], ["spell.magic_arrow", "stat.power", "spell.fireball"]);
    const parked = applyOk(state, findArrowCast(state)!.action);
    const choice = tollChoice(parked);
    expect(new Set(choice.powerCardIds)).toEqual(new Set(["stat.power", "spell.fireball"]));

    // Choose to pay the Fireball — stat.power is kept.
    const next = passAllReactions(
      applyOk(parked, { type: "RESOLVE_COMBAT_DISCARD", playerId: "p1", choiceId: choice.id, cardId: "spell.fireball" })
    );
    expect(next.players.p1.hand).toEqual(["stat.power"]);
    expect(next.players.p1.discard).toContain("spell.fireball"); // the chosen toll
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
  });

  it("rejects paying a card that is not an offered Power card", () => {
    const state = combatWithEnemy(["pegasi-power-tax"], ["spell.magic_arrow", "stat.power", "stat.attack"]);
    const parked = applyOk(state, findArrowCast(state)!.action);
    const choice = tollChoice(parked);
    const bad = applyAction(parked, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p1",
      choiceId: choice.id,
      cardId: "stat.attack" // not a Power card
    });
    expect(bad.errors.length).toBeGreaterThan(0);
    const badRandom = applyAction(parked, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p1",
      choiceId: choice.id,
      cardId: "random" // the toll has no random option
    });
    expect(badRandom.errors.length).toBeGreaterThan(0);
  });

  it("makes the cast ILLEGAL when there is no spare Power card to pay", () => {
    // Hand = the spell + a non-Power card: the spell itself cannot pay its own toll.
    const taxed = combatWithEnemy(["pegasi-power-tax"], ["spell.magic_arrow", "stat.attack"]);
    expect(findArrowCast(taxed), "no spare Power card → cannot cast").toBeFalsy();
    // Applying it directly is rejected, too (defence in depth).
    const rejected = applyAction(taxed, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(rejected.errors.length).toBeGreaterThan(0);

    // Control: without the Pegasi, the very same hand casts with no prompt.
    const free = combatWithEnemy([], ["spell.magic_arrow", "stat.attack"]);
    const freeCast = findArrowCast(free);
    expect(freeCast, "no Pegasi → the cast is legal").toBeTruthy();
    expect(applyOk(free, freeCast!.action).pendingChoice).toBeNull();
  });

  it("no Pegasi → casts freely, only the spell itself leaves the hand", () => {
    const state = combatWithEnemy([], ["spell.magic_arrow", "stat.power"]);
    const next = passAllReactions(applyOk(state, findArrowCast(state)!.action));
    expect(next.pendingChoice).toBeNull();
    expect(next.players.p1.hand).toEqual(["stat.power"]);
    expect(abilityEventIds(next)).not.toContain("pegasi-power-tax");
  });

  it("also gates a Scroll cast (the spell comes from the scroll, the toll from hand)", () => {
    const scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    const ok = combatWithEnemy(["pegasi-power-tax"], ["stat.power", "stat.attack"], scrolls);
    const cast = findArrowCast(ok, "scroll_1");
    expect(cast, "a Power card in hand pays the scroll cast's toll").toBeTruthy();
    const parked = applyOk(ok, cast!.action);
    const choice = tollChoice(parked);
    expect(new Set(choice.powerCardIds)).toEqual(new Set(["stat.power"]));
    const next = passAllReactions(
      applyOk(parked, { type: "RESOLVE_COMBAT_DISCARD", playerId: "p1", choiceId: choice.id, cardId: "stat.power" })
    );
    expect(next.players.p1.hand).toEqual(["stat.attack"]); // stat.power paid
    expect(next.players.p1.discard).toContain("stat.power");
    expect(abilityEventIds(next)).toContain("pegasi-power-tax");

    // With no Power card in hand, even a Scroll spell cannot be cast.
    const blocked = combatWithEnemy(["pegasi-power-tax"], ["stat.attack"], [
      { id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }
    ]);
    expect(findArrowCast(blocked, "scroll_1"), "no Power card → scroll cast blocked").toBeFalsy();
  });
});
