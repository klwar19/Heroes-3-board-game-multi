import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { makeInitialCommanderState } from "../commanders";
import type { GameState, MapFieldState } from "../state";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  deployedArmyStrength,
  commanderStrength,
  activeEnemySideCount,
  armyCoversPremiumEconomyGuard,
  armyEngagementTier,
  armyTierCoversGuardField,
  BANK_ENGAGE_RATIO,
  canBeatCreatureBank,
  creatureBankStrength,
  ENEMY_ENGAGE_RATIO,
  PVP_FORECAST_EDGE_WIN,
  PVP_FORECAST_ENGAGE_WIN,
  PVP_FORECAST_LEVEL_MARGIN,
  PVP_FORECAST_SIDE_MARGIN,
  pvpThreatens,
  pvpEngagementForecast,
  enemyEngagementRatio,
  enemyMainHeroLevelDeficit,
  enemyMainHeroLevelLead,
  isPremiumEconomyField,
  playerArmyStrength,
  premiumEconomyEngageCap,
  shouldAssaultEnemyHolding,
  shouldEngageEnemy,
} from "./army-strength";
import type { GameDifficulty } from "../state";

/**
 * The army-strength read behind the computer's "should I attack this hero /
 * bank / garrison?" decision. It never resolves a battle (the dice do that) —
 * it only decides whether the AI is willing to start one.
 */
function game(): GameState {
  return createAdventureGameState({
    seed: "strength-map",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
  });
}

describe("playerArmyStrength", () => {
  it("values a non-empty army above an empty one", () => {
    const state = game();
    expect(playerArmyStrength(state, "p2")).toBeGreaterThan(0);
    state.players.p2.army = [];
    expect(playerArmyStrength(state, "p2")).toBe(0);
  });

  it("values Polish Stack layers as full Pack health bars plus one flat Attack", () => {
    const state = game();
    const unit = state.players.p2.army[0];
    unit.side = "pack";
    unit.stacks = 0;
    const base = playerArmyStrength(state, "p2");
    unit.stacks = 2;
    const stacked = playerArmyStrength(state, "p2");
    const side = state.players.p2.army[0];
    // Sanity/control: layers materially raise engagement strength, but do not
    // duplicate the entire unit's attack/defense/initiative package.
    expect(stacked).toBeGreaterThan(base);
    unit.stacks = 1;
    const one = playerArmyStrength(state, "p2");
    expect(stacked - one).toBeLessThan(one - base);
    expect(side.side).toBe("pack");
  });
});

describe("shouldEngageEnemy", () => {
  it("engages an army the fight forecast favours it against, and one with nothing to fear", () => {
    const state = game();
    // The same bronze bodies as Packs: the forecast (both public armies fought
    // forward over sampled dice) favours the attack.
    state.players.p2.army = state.players.p2.army.map(unit => ({ ...unit, side: "pack" as const }));
    expect(pvpEngagementForecast(state, "p2", "p1", false)!.winChance).toBeGreaterThanOrEqual(PVP_FORECAST_ENGAGE_WIN);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
    // Enemy with nothing to fear is always engaged.
    state.players.p1.army = [];
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
  });

  it("engages an even-strength army at the coin-flip bar (USER RULING 2026-09-28: equal armies fight)", () => {
    // SUPERSEDES the 2026-09-27 expectation "holds off an even-strength army":
    // that duel sat under the old 0.55 edge bar, so two equal armies never met.
    const state = game();
    const even = pvpEngagementForecast(state, "p2", "p1", false)!.winChance;
    // The matchup really is a coin flip: at or above the new bar, below the old one.
    expect(even).toBeGreaterThanOrEqual(PVP_FORECAST_ENGAGE_WIN);
    expect(even).toBeLessThan(PVP_FORECAST_EDGE_WIN);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
    // …and the evade read agrees: an even duel is not a threat to run from.
    expect(pvpThreatens(state, "p2", "p1")).toBe(false);
    // CONTROL: the same armies against a main hero one level ahead stay on the
    // edge bar plus its level margin (ranked-replay lesson) — no attack.
    const enemy = Object.values(state.heroes).find(hero => hero.controllerId === "p1" && hero.kind === "main")!;
    const own = Object.values(state.heroes).find(hero => hero.controllerId === "p2" && hero.kind === "main")!;
    enemy.level = own.level + 1;
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);
  });

  it("CONTROL: holds off when clearly outmatched", () => {
    const state = game();
    // Gut the AI's army so it sits well under the engage ratio; the enemy keeps
    // its full starting army.
    const enemyStrength = playerArmyStrength(state, "p1");
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    // Sanity: the fixture really is below the engage threshold.
    expect(playerArmyStrength(state, "p2")).toBeLessThan(
      enemyStrength * ENEMY_ENGAGE_RATIO,
    );
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);
  });

  it("keeps a survivor's margin while a third hostile side remains", () => {
    const state = game();
    // The default armies forecast an even duel (coin-flip test above); the third
    // side is a copy of p1. (A mirrored p1 army is NOT even: p2's own hand gives
    // it a clear forecast edge since the forecast-first PvP gate, 2026-09-27.)
    state.players.p3 = structuredClone(state.players.p1);
    state.players.p3.id = "p3";
    state.players.p3.name = "Third side";
    state.players.p3.army = state.players.p3.army.map((unit, index) => ({
      ...unit,
      id: `p3-unit-${index}`,
    }));
    state.turnOrder.push("p3");

    expect(activeEnemySideCount(state, "p2")).toBe(2);
    // Stat-ratio fallback: ENEMY_ENGAGE_RATIO is 1 since 2ae9a06d (was 0.85),
    // + 0.2 per extra side, capped at MAX_ENEMY_ENGAGE_RATIO 1.15.
    expect(enemyEngagementRatio(state, "p2")).toBe(1.15);
    // An even duel is a good fight, but an unnecessary trade in a three-way
    // game because the untouched third side can clean up the winner: the
    // forecast clears the duel bar, not the duel bar plus one side's margin.
    const even = pvpEngagementForecast(state, "p2", "p1", false)!.winChance;
    expect(even).toBeGreaterThanOrEqual(PVP_FORECAST_ENGAGE_WIN);
    expect(even).toBeLessThan(PVP_FORECAST_ENGAGE_WIN + PVP_FORECAST_SIDE_MARGIN);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);

    // Once that third side is gone, the exact same matchup becomes the normal
    // aggressive duel again.
    state.players.p3.eliminated = true;
    expect(activeEnemySideCount(state, "p2")).toBe(1);
    expect(enemyEngagementRatio(state, "p2")).toBe(ENEMY_ENGAGE_RATIO);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
  });

  it("demands a clearly superior army against a main hero two levels ahead (ranked-replay lesson)", () => {
    const state = game();
    const mainHero = (playerId: string) => {
      const hero = Object.values(state.heroes).find(
        (candidate) => candidate.controllerId === playerId && candidate.kind === "main",
      );
      if (!hero) throw new Error(`expected a ${playerId} main hero`);
      return hero;
    };
    const own = mainHero("p2");
    const enemy = mainHero("p1");
    // Equal unit stats (p1 fields a copy of p2's army). Forecast-first PvP gate
    // (2026-09-27): with p2's own hand the forecast reads a moderate edge —
    // clear of one enemy level's margin, short of two.
    state.players.p1.army = structuredClone(state.players.p2.army).map(
      (unit, index) => ({ ...unit, id: `p1-unit-${index}` }),
    );
    expect(playerArmyStrength(state, "p2")).toBe(playerArmyStrength(state, "p1"));
    const edge = pvpEngagementForecast(state, "p2", "p1", false)!.winChance;
    expect(edge).toBeGreaterThanOrEqual(PVP_FORECAST_EDGE_WIN + PVP_FORECAST_LEVEL_MARGIN);
    expect(edge).toBeLessThan(PVP_FORECAST_EDGE_WIN + 2 * PVP_FORECAST_LEVEL_MARGIN);
    // CONTROL: equal levels take the edge.
    own.level = 4;
    enemy.level = 4;
    expect(enemyMainHeroLevelLead(state, "p2", "p1")).toBe(0);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
    // One level behind still allows it (edge bar + one level margin).
    enemy.level = 5;
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
    // Two levels behind — the L4-vs-L6 replays — the same army no longer attacks…
    enemy.level = 6;
    expect(enemyMainHeroLevelLead(state, "p2", "p1")).toBe(2);
    expect(enemyMainHeroLevelDeficit(state, "p2")).toBe(2);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);
    // …while a genuinely superior army (doubled) still does.
    state.players.p2.army = [
      ...state.players.p2.army,
      ...structuredClone(state.players.p2.army).map((unit, index) => ({
        ...unit,
        id: `p2-extra-${index}`,
      })),
    ];
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
    // Being AHEAD in level never loosens the ratio: an outmatched army holds off.
    own.level = 7;
    enemy.level = 1;
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    expect(enemyMainHeroLevelLead(state, "p2", "p1")).toBe(0);
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);
  });

  it("a heroless garrison assault ignores the owner's hero level (no hero fights there)", () => {
    const state = game();
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    );
    if (!enemy) throw new Error("expected a p1 main hero");
    enemy.level = 7;
    const field = {
      spaceId: "t:1",
      location: "castle_town",
      flagOwnerId: "p1",
    } as MapFieldState;
    // The hero fight is refused by the level lead, the garrison assault is not.
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);
    expect(shouldAssaultEnemyHolding(state, "p2", field)).toBe(true);
  });

  it("counts an allied enemy team as one hostile side", () => {
    const state = game();
    state.players.p3 = structuredClone(state.players.p1);
    state.players.p3.id = "p3";
    state.players.p3.name = "Enemy ally";
    state.playerTeams = { p1: "enemy-team", p3: "enemy-team" };
    expect(activeEnemySideCount(state, "p2")).toBe(1);
    expect(enemyEngagementRatio(state, "p2")).toBe(ENEMY_ENGAGE_RATIO);
  });
});

describe("creature bank strength", () => {
  it("values a known bank and engages only when the army can take it", () => {
    const state = game();
    // Imp Cache is the weakest far bank (4× familiars). A full starting army
    // should clear it; a gutted army must refuse.
    const impStr = creatureBankStrength("imp_cache", "normal");
    expect(impStr).toBeGreaterThan(0);
    expect(Number.isFinite(impStr)).toBe(true);

    const field = {
      spaceId: "bank:1",
      location: "creature_bank",
      bankId: "imp_cache",
    } as MapFieldState;

    expect(canBeatCreatureBank(state, "p2", field)).toBe(true);

    // CONTROL: gut the army well below the bank engage ratio.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    expect(playerArmyStrength(state, "p2")).toBeLessThan(
      impStr * BANK_ENGAGE_RATIO,
    );
    expect(canBeatCreatureBank(state, "p2", field)).toBe(false);

    // CONTROL: unknown bank id → never engage (no blind gamble).
    expect(
      canBeatCreatureBank(state, "p2", {
        ...field,
        bankId: undefined,
      } as MapFieldState),
    ).toBe(false);

    // CONTROL: Dragon Utopia is far stronger than Imp Cache.
    expect(creatureBankStrength("dragon_utopia", "normal")).toBeGreaterThan(
      impStr,
    );
  });
});

describe("shouldAssaultEnemyHolding", () => {
  it("assaults when armies are even; refuses when outmatched", () => {
    const state = game();
    const field = {
      spaceId: "t:1",
      location: "castle_town",
      flagOwnerId: "p1",
    } as MapFieldState;
    // Equal armies → assault.
    expect(shouldAssaultEnemyHolding(state, "p2", field)).toBe(true);
    // CONTROL: outmatched → refuse.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    expect(shouldAssaultEnemyHolding(state, "p2", field)).toBe(false);
  });
});

describe("premium economy + soft silver unlock", () => {
  function tierId(tier: "bronze" | "silver"): string {
    const id = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === tier,
    );
    if (!id) throw new Error(`no ${tier} unit`);
    return id;
  }

  it("labels settlement / gold / valuables as premium economy", () => {
    expect(
      isPremiumEconomyField({ location: "settlement" } as MapFieldState),
    ).toBe(true);
    expect(
      isPremiumEconomyField({
        location: "mine",
        resource: "gold",
      } as MapFieldState),
    ).toBe(true);
    expect(
      isPremiumEconomyField({
        location: "mine",
        resource: "valuables",
      } as MapFieldState),
    ).toBe(true);
    // CONTROL: materials mine is not premium.
    expect(
      isPremiumEconomyField({
        location: "mine",
        resource: "buildingMaterials",
      } as MapFieldState),
    ).toBe(false);
  });

  it("3 bronze Packs + 1 silver unlocks the silver guard cap (lv3)", () => {
    const state = game();
    state.adventure!.difficulty = "impossible";
    state.players.p2.army = [
      { id: "bp-0", unitDefId: tierId("bronze"), side: "pack" },
      { id: "bp-1", unitDefId: tierId("bronze"), side: "pack" },
      { id: "bp-2", unitDefId: tierId("bronze"), side: "pack" },
      { id: "sv-0", unitDefId: tierId("silver"), side: "few" },
    ];
    expect(armyEngagementTier(state, "p2")).toBe("silver");
    expect(armyTierCoversGuardField(state, "p2", 3)).toBe(true);
    // CONTROL: lv4 still past the silver Impossible cap.
    expect(armyTierCoversGuardField(state, "p2", 4)).toBe(false);
  });

  it("premium economy cap is difficulty-aware: 3 Packs alone on hard, need silver on Impossible", () => {
    const state = game();
    state.players.p2.army = [
      { id: "bp-0", unitDefId: tierId("bronze"), side: "pack" },
      { id: "bp-1", unitDefId: tierId("bronze"), side: "pack" },
      { id: "bp-2", unitDefId: tierId("bronze"), side: "pack" },
    ];

    for (const difficulty of ["easy", "normal", "hard"] as GameDifficulty[]) {
      state.adventure!.difficulty = difficulty;
      expect(
        premiumEconomyEngageCap(state, "p2"),
        `${difficulty}: 3 Packs → lv3 premium`,
      ).toBeGreaterThanOrEqual(3);
      expect(armyCoversPremiumEconomyGuard(state, "p2", 3)).toBe(true);
      // Strict tier extension still refuses pure-bronze on hard (silver in party).
      expect(armyTierCoversGuardField(state, "p2", 3)).toBe(false);
    }

    // Impossible field-3 is 3 silver — Pack core alone is not enough for lv3,
    // but it opens lv2 (two bronzes + one silver) without waiting for Silver.
    state.adventure!.difficulty = "impossible";
    expect(premiumEconomyEngageCap(state, "p2")).toBe(2);
    expect(armyCoversPremiumEconomyGuard(state, "p2", 3)).toBe(false);

    state.players.p2.army.push({
      id: "sv-0",
      unitDefId: tierId("silver"),
      side: "few",
    });
    expect(premiumEconomyEngageCap(state, "p2")).toBeGreaterThanOrEqual(3);
    expect(armyCoversPremiumEconomyGuard(state, "p2", 3)).toBe(true);
  });

  it("values a Polish bank size by deterministic layers (larger = stronger)", () => {
    const size1 = creatureBankStrength("imp_cache", 1);
    const size3 = creatureBankStrength("imp_cache", 3);
    const size4 = creatureBankStrength("imp_cache", 4);
    expect(size3).toBeGreaterThan(size1);
    expect(size4).toBeGreaterThan(size3);
    // Scenario-difficulty expected-stacks path still differs from size layers.
    expect(creatureBankStrength("imp_cache", "normal")).toBeGreaterThan(0);
  });

  it("engages a sized bank only when the army covers its layer bulk", () => {
    const state = game();
    // Judged by the simulated fight, which reads bankSize (one Stack Token per
    // size step on the defenders). Real engine, 30 forced fights each with this
    // starting army (lab 2026-09-27): Imp Cache size Ⅰ 30/30 and size Ⅳ 30/30
    // won — Familiars stay weak under their layers — while a size Ⅳ Dwarven
    // Treasury was won 0/30. The old stat-sum read refused the size Ⅳ Imp Cache.
    const impI = { spaceId: "bank:1", location: "creature_bank", bankId: "imp_cache", bankSize: 1 } as MapFieldState;
    const impIV = { ...impI, bankSize: 4 } as MapFieldState;
    const treasuryIV = { ...impI, spaceId: "bank:2", bankId: "dwarven_treasury", bankSize: 4 } as MapFieldState;
    expect(canBeatCreatureBank(state, "p2", impI)).toBe(true);
    expect(canBeatCreatureBank(state, "p2", impIV)).toBe(true);
    expect(canBeatCreatureBank(state, "p2", treasuryIV)).toBe(false);
    // CONTROL: gut the army below even size Ⅰ.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    expect(canBeatCreatureBank(state, "p2", impI)).toBe(false);
  });
});

describe("commander in the PvP engagement estimate", () => {
  it("prices the living commander as the extra body only while the module is on", () => {
    const state = game();
    const off = deployedArmyStrength(state, "p2");
    expect(commanderStrength(state, "p2")).toBe(0);
    state.players.p2.commander = makeInitialCommanderState(state.players.p2.factionId) ?? undefined;
    expect(state.players.p2.commander, "fixture faction has a commander").toBeTruthy();
    // CONTROL: a commander state without the module counts nothing.
    expect(commanderStrength(state, "p2")).toBe(0);
    expect(deployedArmyStrength(state, "p2")).toBe(off);
    state.wog = { ...state.wog, enabled: true, commanders: true } as GameState["wog"];
    const priced = commanderStrength(state, "p2");
    expect(priced).toBeGreaterThan(0);
    expect(deployedArmyStrength(state, "p2")).toBe(off + priced);
    // A dead commander is not a body.
    state.players.p2.commander!.dead = true;
    expect(commanderStrength(state, "p2")).toBe(0);
  });
});
