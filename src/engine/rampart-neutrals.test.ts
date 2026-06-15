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

  it("lets an enemy-of-Pegasi cast a Spell, paying one Power card as the toll", () => {
    // After the Magic Arrow leaves hand, stat.power is the spare Power card paid.
    const state = combatWithEnemy(["pegasi-power-tax"], ["spell.magic_arrow", "stat.power", "stat.attack"]);
    const cast = findArrowCast(state);
    expect(cast, "the cast is legal because a Power card can be paid").toBeTruthy();
    const next = passAllReactions(applyOk(state, cast!.action));
    expect(next.players.p1.hand).toEqual(["stat.attack"]);
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toContain("stat.power");
    expect(abilityEventIds(next)).toContain("pegasi-power-tax");
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

    // Control: without the Pegasi, the very same hand can cast freely.
    const free = combatWithEnemy([], ["spell.magic_arrow", "stat.attack"]);
    expect(findArrowCast(free), "no Pegasi → the cast is legal").toBeTruthy();
  });

  it("a second Spell counts as the payable Power card (Spells boost Power)", () => {
    const state = combatWithEnemy(["pegasi-power-tax"], ["spell.magic_arrow", "spell.fireball"]);
    const cast = findArrowCast(state);
    expect(cast, "the other Spell can pay the toll").toBeTruthy();
    const next = passAllReactions(applyOk(state, cast!.action));
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toContain("spell.fireball"); // paid as the toll
    expect(abilityEventIds(next)).toContain("pegasi-power-tax");
  });

  it("no Pegasi → casts freely, only the spell itself leaves the hand", () => {
    const state = combatWithEnemy([], ["spell.magic_arrow", "stat.power"]);
    const cast = findArrowCast(state);
    expect(cast).toBeTruthy();
    const next = passAllReactions(applyOk(state, cast!.action));
    expect(next.players.p1.hand).toEqual(["stat.power"]);
    expect(abilityEventIds(next)).not.toContain("pegasi-power-tax");
  });

  it("also gates a Scroll cast (the spell comes from the scroll, the toll from hand)", () => {
    const scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    const ok = combatWithEnemy(["pegasi-power-tax"], ["stat.power", "stat.attack"], scrolls);
    const cast = findArrowCast(ok, "scroll_1");
    expect(cast, "a Power card in hand pays the scroll cast's toll").toBeTruthy();
    const next = passAllReactions(applyOk(ok, cast!.action));
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
