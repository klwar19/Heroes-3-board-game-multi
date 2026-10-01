/**
 * Order & Chaos world bosses (../sim.ts warbossAct, WarbossDef in ../content): telegraphed moves
 * that land on the marked tiles only, phases, the Champion's blow, the fall that breaks the horde.
 * Each rule is checked against a CONTROL where it does not apply.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ENEMIES, sec, type EnemyDef, type WarbossMove } from "../content";
import {
  CHAMPION_BOSS_SHARE, createGarrison, stepGarrison,
  type Defender, type Enemy, type GarrisonConfig, type GarrisonEvent, type GarrisonState
} from "../sim";
import { OC_ENEMIES } from "./roster";

const TEST_BOSS = "test-warboss";
const WARN = sec(1.5);

function defineBoss(moves: WarbossMove[], phases: number[] = [], extra: Partial<EnemyDef> = {}): void {
  ENEMIES[TEST_BOSS] = {
    kind: TEST_BOSS, name: "Test Boss", faction: "chaos", sprite: "gw-abomination", hp: 10_000, speed: 0.001, bite: 50, biteEvery: sec(1), cost: 0,
    might: 0, recharge: 0, boss: true, blurb: "",
    warboss: { phases, every: [sec(3), sec(3), sec(3)], pace: [1, 1, 1], warn: WARN, moves },
    ...extra
  };
}

afterEach(() => {
  delete ENEMIES[TEST_BOSS];
});

function config(over: Partial<GarrisonConfig> = {}, boss = TEST_BOSS, waves = 1): GarrisonConfig {
  return {
    mode: "adventure", levelId: "test", title: "test", seed: 3, lanes: [0, 1, 2, 3, 4], terrain: "grass",
    cards: ["oc-peasant"], spells: [], atkCards: [], atkSpells: [], enemies: ["oc-shambler"],
    waves, difficulty: 0.01, startGold: 0, startMight: 0, startMana: 0, firstWaveAt: 1,
    chargers: true, chargerSprite: "champion", bannerColor: "#000", defCols: [0, 8], ai: { def: false, atk: false },
    oc: { surgeChance: 0, startSurges: 0, blessings: [], blessingPool: [], warboss: { kind: boss, wave: waves } },
    ...over
  };
}

/** Plays until the boss is on the field, clears the rest of its wave, and parks it at x. */
function withBoss(cfg: GarrisonConfig, x: number, lane = 2): { s: GarrisonState; boss: Enemy } {
  const s = createGarrison(cfg);
  for (let i = 0; i < 400 && !s.warbossId; i += 1) stepGarrison(s, []);
  const boss = s.enemies.find((e) => e.id === s.warbossId)!;
  expect(boss).toBeDefined();
  s.enemies = s.enemies.filter((e) => e === boss || ENEMIES[e.kind]!.structure);
  boss.x = boss.px = x;
  boss.lane = lane;
  boss.cd2 = 0;
  return { s, boss };
}

const troopAt = (s: GarrisonState, lane: number, col: number): Defender => s.defenders.find((d) => d.lane === lane && d.col === col)!;
const steps = (s: GarrisonState, n: number) => {
  const events: GarrisonEvent[] = [];
  for (let i = 0; i < n && !s.outcome; i += 1) {
    stepGarrison(s, []);
    events.push(...(s.events as GarrisonEvent[]));
  }
  return events;
};

describe("Order & Chaos world bosses", () => {
  it("a slam lands only on the 3x3 it marked, and only once the warning runs out", () => {
    defineBoss([{ kind: "slam", dmg: 300, stun: sec(1), reach: 1.6 }]);
    const preset = [{ kind: "oc-dwarf", lane: 2, col: 3 }, { kind: "oc-longbow", lane: 1, col: 2 }, { kind: "oc-longbow", lane: 2, col: 0 }, { kind: "oc-longbow", lane: 4, col: 3 }];
    const { s } = withBoss(config({ preset }), 4.5);
    const front = troopAt(s, 2, 3);
    const beside = troopAt(s, 1, 2);
    const far = troopAt(s, 2, 0);
    const other = troopAt(s, 4, 3);
    const cue = steps(s, 1).find((ev) => ev.e === "bossCue");
    expect(cue && cue.e === "bossCue" && cue.marks.length).toBe(9);
    const hp = front.hp;
    steps(s, WARN - 2);
    expect(front.hp).toBe(hp);
    steps(s, 4);
    expect(front.hp).toBeLessThan(hp);
    expect(beside.hp).toBeLessThan(beside.maxHp);
    // CONTROL: troops outside the marked 3x3 are untouched.
    expect(far.hp).toBe(far.maxHp);
    expect(other.hp).toBe(other.maxHp);
  });

  it("a troop that leaves a marked tile before the blow is spared (it strikes the tiles, not the troop)", () => {
    defineBoss([{ kind: "volley", dmg: 250, count: 1 }]);
    const { s } = withBoss(config({ preset: [{ kind: "oc-cyclops", lane: 0, col: 1 }, { kind: "oc-longbow", lane: 3, col: 1 }] }), 7);
    const ev = steps(s, 1).find((e) => e.e === "bossCue");
    expect(ev && ev.e === "bossCue" && ev.marks[0]).toEqual({ lane: 0, col: 1 });
    const cyclops = troopAt(s, 0, 1);
    cyclops.col = 2;
    steps(s, WARN + 2);
    expect(cyclops.hp).toBe(cyclops.maxHp);
    // CONTROL: one that stays is hit.
    const again = withBoss(config({ preset: [{ kind: "oc-cyclops", lane: 0, col: 1 }, { kind: "oc-longbow", lane: 3, col: 1 }] }), 7);
    steps(again.s, WARN + 3);
    const stayed = troopAt(again.s, 0, 1);
    expect(stayed.hp).toBeLessThan(stayed.maxHp);
  });

  it("an Aegis dome turns a boss's bolts and boulders aside", () => {
    defineBoss([{ kind: "volley", dmg: 250, count: 1 }]);
    const run = (dome: boolean) => {
      const preset = [{ kind: "oc-cyclops", lane: 0, col: 1 }, ...(dome ? [{ kind: "oc-aegis", lane: 1, col: 1 }] : [])];
      const { s } = withBoss(config({ preset }), 7);
      steps(s, WARN + 3);
      const cyclops = troopAt(s, 0, 1);
      return cyclops.hp === cyclops.maxHp;
    };
    expect(run(true)).toBe(true);
    // CONTROL: no dome, the boulder lands.
    expect(run(false)).toBe(false);
  });

  it("a later phase brings its moves only once the boss falls below the threshold", () => {
    defineBoss([{ kind: "drums", dur: sec(1) }, { kind: "roar", stun: sec(1), reach: 9, from: 1 }], [0.5]);
    const { s, boss } = withBoss(config({ preset: [{ kind: "oc-dwarf", lane: 2, col: 1 }] }), 6);
    const early = steps(s, sec(12));
    // CONTROL: above half health it never roars.
    expect(early.some((ev) => ev.e === "bossCue" && ev.move === "roar")).toBe(false);
    expect(early.some((ev) => ev.e === "bossCue" && ev.move === "drums")).toBe(true);
    boss.hp = boss.maxHp * 0.4;
    const later = steps(s, sec(12));
    expect(later.some((ev) => ev.e === "bossPhase" && ev.phase === 1)).toBe(true);
    expect(later.some((ev) => ev.e === "bossCue" && ev.move === "roar")).toBe(true);
  });

  it("the war drums quicken the whole horde for a while", () => {
    defineBoss([{ kind: "drums", dur: sec(6) }]);
    const { s } = withBoss(config({ preset: [{ kind: "oc-dwarf", lane: 0, col: 0 }] }), 6);
    steps(s, WARN + 3);
    expect(s.atk.hasteUntil).toBeGreaterThan(s.tick + sec(4));
  });

  it("a pounce clears the wall and lands on the troop farthest back within reach", () => {
    defineBoss([{ kind: "pounce", dmg: 5000, reach: 3.5 }]);
    const { s, boss } = withBoss(config({ preset: [{ kind: "oc-iron-golem", lane: 2, col: 3 }, { kind: "oc-longbow", lane: 2, col: 1 }, { kind: "oc-longbow", lane: 2, col: 0 }] }), 4.4);
    const [wall, victim, beyond] = [troopAt(s, 2, 3), troopAt(s, 2, 1), troopAt(s, 2, 0)];
    steps(s, WARN + 3);
    expect(victim.dead).toBe(true);
    // CONTROL: the wall it leapt and the troop beyond its reach stand.
    expect(wall.hp).toBe(wall.maxHp);
    expect(beyond.dead).toBe(false);
    expect(boss.x).toBeLessThan(2.2);
  });

  it("a lane's Champion strikes a world boss hard and throws it back; an ordinary foe it simply slays", () => {
    defineBoss([{ kind: "drums", dur: sec(1) }]);
    const { s, boss } = withBoss(config(), 0.02, 2);
    boss.cd2 = 1_000_000;
    steps(s, 30);
    expect(boss.dead).toBe(false);
    expect(boss.hp).toBe(Math.round(boss.maxHp * (1 - CHAMPION_BOSS_SHARE)));
    expect(boss.x).toBeGreaterThan(2);
    expect(s.outcome).toBeNull();
    // Through the gate again, with the Champion spent: the gate falls.
    boss.x = boss.px = -0.6;
    steps(s, 2);
    expect(s.outcome?.winner).toBe("atk");
  });

  it("the boss's fall breaks the horde and wins the battle; an ordinary foe's does not", () => {
    defineBoss([{ kind: "summon", foe: "oc-shambler", count: 3 }]);
    const { s, boss } = withBoss(config(), 7.5);
    steps(s, WARN + 3);
    boss.cd2 = 1_000_000;
    const called = s.enemies.filter((e) => e.kind === "oc-shambler" && !e.dead);
    expect(called.length).toBe(3);
    // CONTROL: a shambler slain at the gate by lane 0's Champion leaves the rest marching.
    called[0]!.lane = 0;
    called[0]!.x = called[0]!.px = 0.02;
    steps(s, 30);
    expect(called[0]!.dead).toBe(true);
    expect(called.slice(1).every((e) => !e.dead)).toBe(true);
    expect(s.outcome).toBeNull();
    // The boss, worn to its last breath, falls to lane 2's Champion: the horde breaks with it.
    boss.hp = 1;
    boss.x = boss.px = 0.02;
    const fall = steps(s, 40);
    expect(fall.some((ev) => ev.e === "bossFall")).toBe(true);
    expect(called.every((e) => e.dead)).toBe(true);
    expect(s.outcome?.winner).toBe("def");
  });

  it("a boss with a hold line stops there and stands its ground; one without marches on", () => {
    const run = (hold: number | undefined) => {
      defineBoss([{ kind: "drums", dur: sec(1) }]);
      ENEMIES[TEST_BOSS]!.warboss!.hold = hold;
      ENEMIES[TEST_BOSS]!.speed = 0.05;
      const { s, boss } = withBoss(config(), 6);
      boss.cd2 = 1_000_000;
      steps(s, sec(5));
      return boss.x;
    };
    expect(run(3.5)).toBeGreaterThan(3.3);
    // CONTROL: without a hold line it walks on toward the gate.
    expect(run(undefined)).toBeLessThan(3);
  });

  it("the boss arrives with its own wave, not before", () => {
    defineBoss([{ kind: "drums", dur: sec(1) }]);
    const s = createGarrison(config({}, TEST_BOSS, 2));
    let firstWave = -1;
    for (let i = 0; i < sec(120) && !s.warbossId; i += 1) {
      stepGarrison(s, []);
      if (s.director.wave === 1 && firstWave < 0) firstWave = s.tick;
      // CONTROL: through wave 1 there is no boss.
      if (s.director.wave < 2) expect(s.warbossId).toBeUndefined();
    }
    expect(firstWave).toBeGreaterThan(0);
    expect(s.director.wave).toBe(2);
    expect(s.enemies.some((e) => e.id === s.warbossId)).toBe(true);
  });

  it("every world boss in the roster can fight a whole battle without stalling", () => {
    const bosses = OC_ENEMIES.filter((def) => def.warboss);
    expect(bosses.length).toBeGreaterThanOrEqual(9);
    for (const def of bosses) {
      // Walls only (nothing wounds it but the test), spaced so every move finds a mark.
      const preset = [0, 1, 2, 3, 4].flatMap((lane) => [{ kind: "oc-dwarf", lane, col: 0 }, { kind: "oc-dwarf", lane, col: 2 }, { kind: "oc-dwarf", lane, col: 4 }]);
      const { s, boss } = withBoss(config({ preset }, def.kind), 8);
      const seen = new Set<string>();
      for (let i = 0; i < sec(240) && !s.outcome; i += 1) {
        stepGarrison(s, []);
        for (const ev of s.events as GarrisonEvent[]) if (ev.e === "bossMove") seen.add(ev.move);
        // (What it calls is cleared away: only the boss is under test.)
        s.enemies = s.enemies.filter((e) => e === boss || ENEMIES[e.kind]!.structure);
        // Wear it down so every phase comes.
        if (i % sec(10) === 0 && !boss.dead) boss.hp = Math.max(1, boss.hp - boss.maxHp * 0.06);
      }
      expect(seen.size, def.kind).toBeGreaterThanOrEqual(2);
      expect(boss.bossPhase ?? 0, def.kind).toBe(def.warboss!.phases.length);
    }
  });
});
