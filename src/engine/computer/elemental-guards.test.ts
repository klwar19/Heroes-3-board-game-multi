import { describe, expect, it } from "vitest";
import { dealsElementalStrike, estimatedStrikeDamage } from "./strike-value";
import { expectedAttackDamage } from "./score";
import { cardHandValue, scoreCardAction } from "./card-policy";
import { createAdventureGameState } from "../adventure-setup";
import type { CombatState, CombatUnitState, GameAction, GameState, PlayerVisibleState } from "../state";

function unit(over: Partial<CombatUnitState> & { id: string; unitDefId: string; controllerId: string }): CombatUnitState {
  return {
    name: over.id, grade: "silver", type: "ground", attack: 3, defense: 2, maxHealth: 4, damage: 0,
    initiative: 4, position: 5, abilities: [], activatedThisRound: false, movedThisActivation: false,
    attackedThisActivation: false, tokens: [], variant: "neutral", ...over,
  } as unknown as CombatUnitState;
}

const magma = () => unit({ id: "MAG", unitDefId: "neutral.magma_elementals", controllerId: "neutrals",
  abilities: ["elemental-damage", "earth-elemental-immunity"], position: 9 });
const energy = () => unit({ id: "ENE", unitDefId: "neutral.energy_elementals", controllerId: "neutrals",
  abilities: ["elemental-damage", "fire-elemental-immunity"], position: 10, defense: 1 });
const ogre = () => unit({ id: "OGR", unitDefId: "neutral.ogres", controllerId: "neutrals",
  abilities: ["ogres-attack-token-pack"], position: 11 });
const halberdier = () => unit({ id: "HAL", unitDefId: "castle.halberdiers", controllerId: "p2", grade: "bronze",
  attack: 3, defense: 2, maxHealth: 5, position: 13, variant: "pack" });

describe("elemental strikes ignore Defense in the AI's estimates", () => {
  it("expects the full Attack from an Elemental and attack-minus-defense from an Ogre (CONTROL)", () => {
    expect(dealsElementalStrike(magma())).toBe(true);
    expect(dealsElementalStrike(ogre())).toBe(false);
    expect(expectedAttackDamage(magma(), halberdier())).toBe(3);
    expect(estimatedStrikeDamage(magma(), halberdier())).toBe(3);
    // CONTROL: same printed stats without the elemental ability.
    expect(expectedAttackDamage(ogre(), halberdier())).toBe(1);
    expect(estimatedStrikeDamage(ogre(), halberdier())).toBe(1);
  });
});

function fightState(attacker: CombatUnitState, defender: CombatUnitState, hand: string[]) {
  const state = createAdventureGameState({ seed: "elemental-guards", playerCount: 2, events: false, rollFirstPlayer: false });
  const units: Record<string, CombatUnitState> = {};
  for (const u of [attacker, defender, ogre()]) units[u.id] = u;
  state.combat = {
    id: "c-elemental", attackerPlayerId: "p2", defenderPlayerId: "neutrals", round: 1, units, obstacles: [],
    context: { kind: "neutral", heroId: "hero_p2", fieldId: "h:0:0", difficulty: 3 },
  } as unknown as CombatState;
  state.players.p2.hand = hand;
  state.stack = [{
    action: { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId: attacker.id, defenderId: defender.id },
    modifiers: { attackBonus: 0, defenseBonus: 0 },
  }] as unknown as GameState["stack"];
  return state;
}

describe("Defense cards against an elemental hit", () => {
  const reaction = (cardId: string): GameAction =>
    ({ type: "PLAY_REACTION", playerId: "p2", cardId, mode: "basic" }) as GameAction;
  it("holds the Defense card when the attacker is an Elemental, plays it against an Ogre (CONTROL)", () => {
    const vsElemental = fightState(magma(), halberdier(), ["stat.defense"]);
    const elemental = scoreCardAction({ playerId: "p2", state: vsElemental as unknown as PlayerVisibleState, legalActions: [] }, reaction("stat.defense"));
    const vsOgre = fightState(ogre(), halberdier(), ["stat.defense"]);
    const ogreHit = scoreCardAction({ playerId: "p2", state: vsOgre as unknown as PlayerVisibleState, legalActions: [] }, reaction("stat.defense"));
    // PASS_REACTION scores 1050: below it the card is kept, above it it is played.
    expect(elemental!.score).toBeLessThan(1_050);
    expect(ogreHit!.score).toBeGreaterThan(1_050);
  });
});

describe("Magic Arrow against Arrow-immune guards", () => {
  it("is dead weight when every living enemy is immune, and worth keeping otherwise (CONTROL)", () => {
    const allImmune = fightState(magma(), halberdier(), ["spell.magic_arrow"]);
    delete allImmune.combat!.units.OGR;
    allImmune.combat!.units.ENE = energy();
    const immuneValue = cardHandValue("spell.magic_arrow", { playerId: "p2", state: allImmune as unknown as PlayerVisibleState, legalActions: [] });
    const mixed = fightState(magma(), halberdier(), ["spell.magic_arrow"]);
    const mixedValue = cardHandValue("spell.magic_arrow", { playerId: "p2", state: mixed as unknown as PlayerVisibleState, legalActions: [] });
    expect(immuneValue).toBeLessThan(20);
    expect(mixedValue).toBeGreaterThanOrEqual(75);
  });
});

describe("Power poured into a damage spell against armoured neutral guards", () => {
  const ogrePack = () => unit({ id: "OGR", unitDefId: "neutral.ogres", controllerId: "neutrals", abilities: ["ogres-attack-token-pack"], position: 11, maxHealth: 8 });
  const goblin = () => unit({ id: "GOB", unitDefId: "neutral.goblins", controllerId: "neutrals", grade: "bronze", attack: 2, defense: 0, maxHealth: 8, position: 12 });
  function castState(target: CombatUnitState, hand: string[]) {
    const state = createAdventureGameState({ seed: "power-armoured", playerCount: 2, events: false, rollFirstPlayer: false });
    const units: Record<string, CombatUnitState> = {};
    for (const u of [target, halberdier()]) units[u.id] = u;
    state.combat = {
      id: "c-power", attackerPlayerId: "p2", defenderPlayerId: "neutrals", round: 1, units, obstacles: [],
      context: { kind: "neutral", heroId: "hero_p2", fieldId: "h:0:0", difficulty: 3 },
    } as unknown as CombatState;
    state.players.p2.hand = hand;
    state.stack = [{
      action: { type: "CAST_SPELL", playerId: "p2", cardId: "spell.magic_arrow", target: { type: "unit", unitId: target.id } },
      modifiers: { attackBonus: 0, defenseBonus: 0, spellPowerBonus: 0 },
    }] as unknown as GameState["stack"];
    return state;
  }
  const fuel = (cardId: string): GameAction =>
    ({ type: "PLAY_REACTION", playerId: "p2", cardId, mode: "basic", asPowerBoost: true }) as GameAction;
  it("burns a mid-value card for +1 Power against an Ogre, holds it against a goblin (CONTROL)", () => {
    const vsOgre = scoreCardAction({ playerId: "p2", state: castState(ogrePack(), ["ability.leadership", "spell.magic_arrow"]) as unknown as PlayerVisibleState, legalActions: [] }, fuel("ability.leadership"));
    const vsGoblin = scoreCardAction({ playerId: "p2", state: castState(goblin(), ["ability.leadership", "spell.magic_arrow"]) as unknown as PlayerVisibleState, legalActions: [] }, fuel("ability.leadership"));
    expect(vsOgre!.score).toBeGreaterThan(1_050);
    expect(vsGoblin!.score).toBeLessThan(1_050);
  });
  it("never burns a second damage spell as fuel", () => {
    const arrow = scoreCardAction({ playerId: "p2", state: castState(ogrePack(), ["spell.magic_arrow", "spell.magic_arrow"]) as unknown as PlayerVisibleState, legalActions: [] }, fuel("spell.magic_arrow"));
    expect(arrow!.score).toBeLessThan(1_050);
  });
});
