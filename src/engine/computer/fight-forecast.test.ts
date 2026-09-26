import { describe, expect, it } from "vitest";
import type { CombatState, CombatUnitState, GameState } from "../state";
import { createAdventureGameState } from "../adventure-setup";
import { forecastGuardField, forecastNeutralFight } from "./fight-forecast";
import { openingGuardCommitment } from "./necropolis-combat";
import type { MapFieldState } from "../state";

/** Minimal placed combat unit. Ranged bodies skip the round-1 reach probe. */
function unit(overrides: Partial<CombatUnitState> & { id: string }): CombatUnitState {
  return {
    controllerId: "neutrals",
    name: overrides.id,
    cardName: overrides.id,
    variant: "neutral",
    grade: "bronze",
    type: "ranged",
    attack: 3,
    defense: 2,
    maxHealth: 5,
    damage: 0,
    initiative: 5,
    position: 20,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    ...overrides,
  };
}

function board(units: CombatUnitState[], options: { hand?: string[]; movement?: number; round?: number; id?: string } = {}) {
  const combat = {
    id: options.id ?? "forecast-c1",
    round: options.round ?? 1,
    units: Object.fromEntries(units.map(u => [u.id, u])),
    obstacles: [],
    attackerPlayerId: "p2",
    defenderPlayerId: "neutrals",
    context: { kind: "neutral", heroId: "main", fieldId: "h:1:1", difficulty: 3 },
  } as unknown as CombatState;
  const state = {
    seed: "fight-forecast-test",
    round: 3,
    combat,
    activeEffects: [],
    players: { p2: { id: "p2", hand: options.hand ?? [], army: [], resources: { gold: 0, buildingMaterials: 0, valuables: 0 } } },
    heroes: { main: { id: "main", kind: "main", controllerId: "p2", movementPoints: options.movement ?? 2, level: 2 } },
    houseRules: {},
  } as unknown as GameState;
  return { state, combat };
}

const own = (id: string, overrides: Partial<CombatUnitState> = {}) =>
  unit({ id, controllerId: "p2", position: 0, initiative: 9, ...overrides });

describe("neutral fight forecast", () => {
  it("credits the Magic Arrow on armored guards the bodies cannot dent", () => {
    // Attack 2 against Defense 4 never wounds (best face 3 - 4 < 1); only the
    // Arrow (Power 2 → 3 damage, one cast per round) removes the 3-health guards.
    const guards = [unit({ id: "g1", defense: 4, maxHealth: 3, attack: 0 }), unit({ id: "g2", defense: 4, maxHealth: 3, attack: 0 })];
    const bodies = [own("a", { attack: 2 }), own("b", { attack: 2 })];
    const withArrows = board([...bodies, ...guards], {
      hand: ["spell.magic_arrow", "spell.magic_arrow", "stat.power", "stat.power", "stat.power", "stat.power"],
      movement: 1,
    });
    expect(forecastNeutralFight(withArrows.state, "p2", withArrows.combat)?.winChance).toBe(1);
    // CONTROL: the same board without the spells cannot win.
    const bare = board([...bodies, ...guards], { movement: 1, id: "forecast-bare" });
    expect(forecastNeutralFight(bare.state, "p2", bare.combat)?.winChance).toBe(0);
  });

  it("gives up rounds the hero cannot pay for", () => {
    // One Arrow per round: two guards need two rounds. No movement = one round.
    const guards = [unit({ id: "g1", defense: 4, maxHealth: 3, attack: 0 }), unit({ id: "g2", defense: 4, maxHealth: 3, attack: 0 })];
    const hand = ["spell.magic_arrow", "spell.magic_arrow", "stat.power", "stat.power", "stat.power", "stat.power"];
    const paid = board([own("a", { attack: 2 }), ...guards], { hand, movement: 1, id: "forecast-paid" });
    const broke = board([own("a", { attack: 2 }), ...guards], { hand, movement: 0, id: "forecast-broke" });
    expect(forecastNeutralFight(paid.state, "p2", paid.combat)?.winChance).toBe(1);
    expect(forecastNeutralFight(broke.state, "p2", broke.combat)?.winChance).toBe(0);
  });

  it("counts our own damage spell still waiting on the stack", () => {
    // One Arrow already cast at g1 (on the stack, not yet resolved) and one in
    // hand: with the held Power both deal 3 and remove both guards in 2 rounds.
    const guards = [unit({ id: "g1", defense: 4, maxHealth: 3, attack: 0 }), unit({ id: "g2", defense: 4, maxHealth: 3, attack: 0 })];
    const hand = ["spell.magic_arrow", "stat.power", "stat.power", "stat.power", "stat.power"];
    const real = (id: string, stacked: boolean) => {
      const { state, combat } = board([own("a", { attack: 2 }), ...guards], { hand, movement: 1, id });
      const game = createAdventureGameState({ seed: "forecast-stack", difficulty: "normal", events: false, rollFirstPlayer: false });
      const hero = Object.values(game.heroes).find(h => h.controllerId === "p2" && h.kind === "main")!;
      hero.movementPoints = 1;
      (combat.context as { heroId: string }).heroId = hero.id;
      game.players.p2.hand = [...hand];
      game.combat = combat;
      (game as { stack?: unknown[] }).stack = stacked ? [{ id: "s1", action: { type: "CAST_SPELL", playerId: "p2",
        cardId: "spell.magic_arrow", target: { type: "unit", unitId: "g1" } },
        modifiers: { spellPowerBonus: 0 } }] : [];
      void state;
      return { state: game, combat };
    };
    const cast = real("forecast-stack", true);
    expect(forecastNeutralFight(cast.state, "p2", cast.combat)?.winChance).toBe(1);
    // CONTROL: the same hand with nothing on the stack has one Arrow for two guards.
    const idle = real("forecast-nostack", false);
    expect(forecastNeutralFight(idle.state, "p2", idle.combat)?.winChance).toBe(0);
  });

  it("counts the paid round in progress mid-fight, not only the movement left", () => {
    // Round 2 is being fought (its point already paid) and one point remains:
    // two rounds are left — the two Arrows still remove both guards.
    const guards = [unit({ id: "g1", defense: 4, maxHealth: 3, attack: 0 }), unit({ id: "g2", defense: 4, maxHealth: 3, attack: 0 })];
    const hand = ["spell.magic_arrow", "spell.magic_arrow", "stat.power", "stat.power", "stat.power", "stat.power"];
    const midFight = board([own("a", { attack: 2 }), ...guards], { hand, movement: 1, round: 2, id: "forecast-mid" });
    expect(forecastNeutralFight(midFight.state, "p2", midFight.combat)?.rounds).toBe(2);
    expect(forecastNeutralFight(midFight.state, "p2", midFight.combat)?.winChance).toBe(1);
    // CONTROL: at the continue window after round 2 only the paid rounds remain.
    const window = board([own("a", { attack: 2 }), ...guards], { hand, movement: 1, round: 2, id: "forecast-window" });
    (window.combat as { awaitingContinue?: boolean }).awaitingContinue = true;
    expect(forecastNeutralFight(window.state, "p2", window.combat)?.rounds).toBe(1);
  });
});

describe("armored guard commitment (user ruling 2026-09-26: try when winnable)", () => {
  it("fights two Defense-2 guards the army can beat instead of retreating on sight", () => {
    const guards = [unit({ id: "g1", defense: 2, maxHealth: 2, attack: 1 }), unit({ id: "g2", defense: 2, maxHealth: 2, attack: 1 })];
    const strong = board([own("a", { attack: 6 }), own("b", { attack: 6 }), own("c", { attack: 6 }), ...guards], { id: "armored-win" });
    expect(openingGuardCommitment(strong.state, "p2", strong.combat)).toBe("fight");
    // CONTROL: the same two armored guards against bodies that cannot hurt
    // them (and no spell) are still a scouting retreat.
    const weak = board([own("a", { attack: 1 }), own("b", { attack: 1 }), ...guards.map(g => ({ ...g, defense: 5 }))], { id: "armored-lose" });
    expect(openingGuardCommitment(weak.state, "p2", weak.combat)).toBe("retreat");
  });

  it("holds two armored guards to the higher ARMORED bar before the fight starts", () => {
    // Two armored 1-health guards, one shooter that removes one per hit on a
    // 0/+1 face (2 of 3), two affordable rounds: about 4/9 — enough to try an
    // ordinary party, not two armored guards on a pristine board.
    const guards = [unit({ id: "g1", defense: 2, maxHealth: 1, attack: 0 }), unit({ id: "g2", defense: 2, maxHealth: 1, attack: 0 })];
    const shooter = own("a", { attack: 3 });
    const pristine = board([shooter, ...guards], { movement: 1, id: "armored-bar" });
    const chance = forecastNeutralFight(pristine.state, "p2", pristine.combat)!.winChance;
    expect(chance).toBeGreaterThanOrEqual(0.4);
    expect(chance).toBeLessThan(0.6);
    expect(openingGuardCommitment(pristine.state, "p2", pristine.combat)).toBe("retreat");
    // CONTROL: with the second guard unarmored it is an ordinary party and is tried.
    const single = board([shooter, guards[0], { ...guards[1], defense: 1 }], { movement: 1, id: "armored-bar" });
    expect(openingGuardCommitment(single.state, "p2", single.combat)).toBe("fight");
  });

  it("needs the TRY bar on a pristine board but keeps an under-way fight above the KEEP bar", () => {
    // Attack 3 vs Defense 2, 2 health: only the +1 face kills → ~1/3 win in the
    // single affordable round; the harmless guard never hurts us.
    const target = unit({ id: "g1", defense: 2, maxHealth: 2, attack: 0, damage: 0 });
    const shooter = own("a", { attack: 3 });
    const pristine = board([shooter, target], { movement: 0, id: "keep-bar" });
    const chance = forecastNeutralFight(pristine.state, "p2", pristine.combat)!.winChance;
    expect(chance).toBeGreaterThan(0.2);
    expect(chance).toBeLessThan(0.4);
    expect(openingGuardCommitment(pristine.state, "p2", pristine.combat)).toBe("retreat");
    // Same odds once the fight is under way (a unit already acted this round).
    const underWay = board([{ ...shooter, activatedThisRound: true }, target], { movement: 0, id: "keep-bar" });
    expect(openingGuardCommitment(underWay.state, "p2", underWay.combat)).toBe("fight");
  });
});

describe("forecast memo and public guard reads", () => {
  it("never serves a memoized forecast to another board that reuses the combat and unit ids", () => {
    // The memo is module-wide and the server hosts many tables whose combat ids
    // (`combat_<event#>`) and unit ids repeat. Same ids, stats and hand — only
    // the guards' Health differs — must not share one cached answer.
    const hand = ["spell.magic_arrow", "spell.magic_arrow", "stat.power", "stat.power", "stat.power", "stat.power"];
    const guards = (health: number) => [
      unit({ id: "g1", defense: 4, maxHealth: health, attack: 0 }),
      unit({ id: "g2", defense: 4, maxHealth: health, attack: 0 }),
    ];
    const bodies = [own("a", { attack: 2 }), own("b", { attack: 2 })];
    const soft = board([...bodies, ...guards(3)], { hand, movement: 1, id: "shared-combat-id" });
    expect(forecastNeutralFight(soft.state, "p2", soft.combat)?.winChance).toBe(1);
    const tough = board([...bodies, ...guards(30)], { hand, movement: 1, id: "shared-combat-id" });
    expect(forecastNeutralFight(tough.state, "p2", tough.combat)?.winChance).toBe(0);
  });

  it("resolves a designer's random / pack guard slots instead of dropping them", () => {
    const state = createAdventureGameState({ seed: "forecast-custom-guard", difficulty: "normal", events: false, rollFirstPlayer: false });
    const hero = Object.values(state.heroes).find(h => h.controllerId === "p2" && h.kind === "main")!;
    const template = Object.values(state.adventure!.fields)[0];
    const field = (spaceId: string, units: string[]) => ({ ...template, spaceId, location: "treasure_symbol",
      difficulty: 2, flagOwnerId: null, customGuardUnits: units }) as MapFieldState;
    // CONTROL: the Peasants alone are a sure win for the starting army.
    expect(forecastGuardField(state, hero, field("h:30:30", ["neutral.peasants"]), 1)!.winChance).toBeGreaterThanOrEqual(0.9);
    // Two public "random Gold" slots beside them: the old read skipped every
    // slot that was not a plain Neutral id and forecast the Peasants alone.
    const mixed = forecastGuardField(state, hero, field("h:30:31", ["neutral.peasants", "random:gold", "random:gold"]), 1);
    expect(mixed).not.toBeNull();
    expect(mixed!.winChance).toBeLessThan(0.5);
    // A named Pack slot is a real body too (was: no guard at all → no forecast).
    const packs = forecastGuardField(state, hero, field("h:30:32", ["pack:castle.archangels", "pack:castle.archangels"]), 1);
    expect(packs).not.toBeNull();
    expect(packs!.winChance).toBeLessThan(0.5);
  });
});
