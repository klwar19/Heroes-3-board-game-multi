/**
 * Order & Chaos stall-breaker (../sim.ts, STANDOFF_NERVE): a foe that stops short to shoot
 * runs out of ammunition and charges once the battle is waiting on the field (the last wave
 * is out, or a blessing waits for a clear lawn). CONTROL: while more waves are still to come,
 * the same foe keeps its distance — so removing the rule fails the first test.
 */
import { describe, expect, it } from "vitest";
import {
  GUST_LIMIT, STANDOFF_NERVE, createGarrison, stepGarrison,
  type Defender, type Enemy, type GarrisonConfig, type GarrisonEvent, type GarrisonState
} from "../sim";

const NEVER = 10_000_000;

function config(over: Partial<GarrisonConfig> = {}): GarrisonConfig {
  return {
    mode: "adventure", levelId: "test", title: "test", seed: 1, lanes: [2], terrain: "grass",
    cards: ["oc-peasant"], spells: [], atkCards: [], atkSpells: [], enemies: ["oc-kunoichi"],
    waves: 1, difficulty: 0.5, startGold: 0, startMight: 0, startMana: 0, firstWaveAt: 1,
    chargers: false, chargerSprite: "champion", bannerColor: "#000", defCols: [0, 8], ai: { def: false, atk: false },
    // A Pikeman that can't be worn down (as if healed without end): nothing of the player's reaches a foe standing off.
    preset: [{ kind: "oc-pikeman", lane: 2, col: 2 }],
    oc: { surgeChance: 0, startSurges: 0, blessings: [], blessingPool: [] },
    ...over
  };
}

type Run = { s: GarrisonState; foe: Enemy | undefined; unnervedAt: number; castFrom: number; shotsAfter: number };

/** Plays until the battle ends or `limit` ticks pass; `hold` keeps the director from sending more waves. */
function play(cfg: GarrisonConfig, limit: number, setup: (s: GarrisonState) => void = () => {}): Run {
  const s = createGarrison(cfg);
  const wall = s.defenders.find((d: Defender) => d.kind === "oc-pikeman")!;
  wall.hp = wall.maxHp = 1_000_000;
  let foe: Enemy | undefined;
  let unnervedAt = -1;
  let castFrom = -1;
  let shotsAfter = 0;
  let prepared = false;
  while (!s.outcome && s.tick < limit) {
    stepGarrison(s, []);
    wall.hp = wall.maxHp;
    foe ??= s.enemies.find((e) => e.kind === "oc-kunoichi");
    if (foe && !prepared) {
      prepared = true;
      setup(s);
    }
    if (foe && castFrom < 0 && foe.state === "cast") castFrom = s.tick;
    for (const ev of s.events as GarrisonEvent[]) {
      if (ev.e === "unnerved" && foe && ev.id === foe.id) unnervedAt = s.tick;
    }
    if (unnervedAt >= 0 && s.projectiles.some((p) => p.side === "atk" && p.kind === "kunai")) shotsAfter += 1;
  }
  return { s, foe, unnervedAt, castFrom, shotsAfter };
}

describe("Order & Chaos stall-breaker: foes that stand off to shoot", () => {
  it("once the last wave is out, a Kamuro who can't be answered runs out of kunai, charges and falls to the Pikeman", () => {
    const run = play(config(), 20 * 150);
    expect(run.foe).toBeDefined();
    expect(run.unnervedAt).toBeGreaterThan(0);
    // She held her ground for the full grace (the director is done a little after her wave, so not before) — then charged.
    expect(run.unnervedAt - run.castFrom).toBeGreaterThanOrEqual(STANDOFF_NERVE);
    expect(run.foe!.unnerved).toBe(true);
    expect(run.s.outcome?.winner).toBe("def");
  });

  it("CONTROL: while more waves are still to come, she keeps her distance and throws on", () => {
    const run = play(config({ waves: 3 }), 20 * 150, (s) => {
      s.director.nextAt = NEVER;
    });
    expect(run.s.director.done).toBe(false);
    expect(run.unnervedAt).toBe(-1);
    expect(run.foe!.dead).toBe(false);
    expect(run.foe!.state).toBe("cast");
    expect(run.s.outcome).toBeNull();
  });

  it("a battle waiting on a clear lawn for a blessing breaks the stand-off too", () => {
    const run = play(config({ waves: 3 }), 20 * 150, (s) => {
      s.director.nextAt = NEVER;
      s.director.blessPending = true;
    });
    expect(run.unnervedAt).toBeGreaterThan(0);
    expect(run.foe!.dead).toBe(true);
  });

  it("out of ammunition she throws nothing more: she fights hand to hand at her throwing pace", () => {
    const s = createGarrison(config({ preset: [{ kind: "oc-dwarf", lane: 2, col: 2 }] }));
    const wall = s.defenders[0]!;
    wall.hp = wall.maxHp = 1_000_000;
    let foe: Enemy | undefined;
    let charged = -1;
    let bites = 0;
    for (let i = 0; i < 20 * 120 && !s.outcome; i += 1) {
      stepGarrison(s, []);
      foe ??= s.enemies.find((e) => e.kind === "oc-kunoichi");
      if (foe?.unnerved && charged < 0) charged = s.tick;
      if (charged >= 0) {
        expect(s.projectiles.some((p) => p.side === "atk")).toBe(false);
        for (const ev of s.events as GarrisonEvent[]) if (ev.e === "enemyBite" && ev.id === foe!.id) bites += 1;
      }
    }
    expect(charged).toBeGreaterThan(0);
    // A Dwarf has no weapon: she reaches it and strikes it, about once per 1.6 s (her throwing pace), not every second.
    const span = (s.tick - charged) / 20;
    expect(bites).toBeGreaterThan(3);
    expect(bites).toBeLessThanOrEqual(Math.ceil(span / 1.6) + 1);
  });

  it("a raid is left to its own rule (the defence is the level's)", () => {
    const s = createGarrison(config({ mode: "raid", enemies: [], atkCards: ["oc-kunoichi"], startMight: 1000, atkMinX: 6 }));
    for (const c of s.atk.cards) c.readyAt = 0;
    const wall = s.defenders[0]!;
    wall.hp = wall.maxHp = 1_000_000;
    stepGarrison(s, [{ t: "muster", kind: "oc-kunoichi", lane: 2, x: 7, by: "atk" }]);
    const foe = s.enemies.find((e) => e.kind === "oc-kunoichi")!;
    for (let i = 0; i < 20 * 30 && !s.outcome; i += 1) {
      stepGarrison(s, []);
      wall.hp = wall.maxHp;
    }
    expect(foe.unnerved).toBeUndefined();
  });
});

describe("Order & Chaos: gales can push a walker back, but never hold a lane shut", () => {
  const galeConfig = (): GarrisonConfig => config({ enemies: ["oc-berserker"], waves: 3, preset: [{ kind: "oc-sylph", lane: 2, col: 2 }] });
  const withWalker = (x: number) => {
    const s = createGarrison(galeConfig());
    let foe: Enemy | undefined;
    for (let i = 0; i < 400 && !foe; i += 1) {
      stepGarrison(s, []);
      foe = s.enemies.find((e) => e.kind === "oc-berserker");
    }
    s.director.nextAt = NEVER;
    foe!.x = foe!.px = x;
    if (foe!.state !== "walk") foe!.state = "walk";
    // The Sylph's gale is ready at once.
    for (const d of s.defenders) d.cd = 0;
    return { s, foe: foe! };
  };

  it("a gale blows a walker back, but no further than the edge of sight", () => {
    const { s, foe } = withWalker(8.3);
    for (let i = 0; i < 20 * 12 && !(foe.gusts ?? 0); i += 1) stepGarrison(s, []);
    expect(foe.gusts).toBe(1);
    // It was pushed back (CONTROL: before the gale it walked toward the gate), yet stays where shots can reach it.
    expect(foe.x).toBeGreaterThan(8.3);
    expect(foe.x).toBeLessThanOrEqual(9.1);
  });

  it(`after ${GUST_LIMIT} gales a walker braces and comes on: one Sylph cannot pin it at the edge for good`, () => {
    const { s, foe } = withWalker(8.5);
    for (let i = 0; i < 20 * 120 && foe.x > 2.5 && !foe.dead; i += 1) stepGarrison(s, []);
    expect(foe.gusts).toBe(GUST_LIMIT);
    expect(foe.x).toBeLessThanOrEqual(2.5);
  });
});
