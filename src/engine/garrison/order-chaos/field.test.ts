/**
 * Order & Chaos battlefield systems (./field.ts, ../sim.ts): each test compares
 * the rule's outcome with a CONTROL where the rule does not apply, so removing
 * the rule makes it fail.
 */
import { describe, expect, it } from "vitest";
import { sec } from "../clock";
import { checkPlace, createGarrison, icedAt, stepGarrison, tileCode, type Enemy, type GarrisonConfig, type GarrisonState, type OcRules, type SidedCommand } from "../sim";
import { TILE, pool, rooftop } from "./field";

const NEVER = 10_000_000;

/** A quiet Order & Chaos lawn: one lane (2), no waves unless asked, plenty of gold. */
function config(oc: Partial<OcRules> = {}, over: Partial<GarrisonConfig> = {}): GarrisonConfig {
  return {
    mode: "adventure", levelId: "test", title: "test", seed: 1, lanes: [2], terrain: "grass",
    cards: ["oc-longbow", "oc-peasant"], spells: [], atkCards: [], atkSpells: [], enemies: ["oc-shambler"],
    waves: 2, difficulty: 0.5, startGold: 5000, startMight: 0, startMana: 0, firstWaveAt: NEVER,
    chargers: false, chargerSprite: "champion", bannerColor: "#000", defCols: [0, 8], ai: { def: false, atk: false },
    oc: { surgeChance: 0, startSurges: 0, blessings: [], blessingPool: [], ...oc },
    ...over
  };
}

/** A battle with every packet ready (the long recharges start half-way in a real battle). */
function create(cfg: GarrisonConfig): GarrisonState {
  const s = createGarrison(cfg);
  for (const slot of s.def.cards) slot.readyAt = 0;
  return s;
}

function steps(s: GarrisonState, n: number, cmds: SidedCommand[] = []): void {
  stepGarrison(s, cmds);
  for (let i = 1; i < n; i += 1) stepGarrison(s, []);
}

/** A battle whose first wave (tick 1) brings exactly one `kind` into lane 2, then parks it at x. */
function withFoe(kind: string, x: number, oc: Partial<OcRules> = {}, over: Partial<GarrisonConfig> = {}): { s: GarrisonState; foe: Enemy } {
  const s = create(config(oc, { enemies: [kind], firstWaveAt: 1, ...over }));
  steps(s, 1);
  const foe = s.enemies.find((e) => e.kind === kind && e.guard === undefined)!;
  expect(foe).toBeDefined();
  foe.x = x;
  foe.px = x;
  if (foe.state === "appear") foe.state = "walk";
  return { s, foe };
}

/** Holds a foe where it stands (frozen: still a target). */
const hold = (e: Enemy) => {
  e.freezeUntil = NEVER;
};

const place = (card: string, lane: number, col: number): SidedCommand => ({ t: "place", card, lane, col, by: "def" });

describe("Order & Chaos battlefield", () => {
  it("water needs a Raft (swimmers excepted); a Raft makes it plantable", () => {
    const s = create(config({ tiles: [{ lane: 2, col: 1, kind: "water" }] }, { cards: ["oc-longbow", "oc-raft", "oc-undine"] }));
    expect(checkPlace(s, "oc-longbow", 2, 1).ok).toBe(false);
    expect(checkPlace(s, "oc-longbow", 2, 2).ok).toBe(true);
    expect(checkPlace(s, "oc-undine", 2, 1).ok).toBe(true);
    steps(s, 1, [place("oc-raft", 2, 1)]);
    expect(checkPlace(s, "oc-longbow", 2, 1).ok).toBe(true);
  });

  it("foes wade through open water slower than over dry ground", () => {
    const wet = withFoe("oc-shambler", 6.5, { tiles: pool([2]) });
    const dry = withFoe("oc-shambler", 6.5);
    steps(wet.s, 60);
    steps(dry.s, 60);
    const wetMoved = 6.5 - wet.foe.x;
    const dryMoved = 6.5 - dry.foe.x;
    expect(dryMoved).toBeGreaterThan(0.3);
    expect(wetMoved).toBeCloseTo(dryMoved * 0.75, 2);
  });

  it("ruins stop a straight shooter's arrows (lobs are unaffected)", () => {
    const run = (tiles: OcRules["tiles"]) => {
      const { s, foe } = withFoe("oc-shambler", 6.5, { tiles }, { cards: ["oc-longbow"] });
      hold(foe);
      steps(s, 200, [place("oc-longbow", 2, 1)]);
      return foe.hp;
    };
    expect(run([{ lane: 2, col: 4, kind: "ruins" }])).toBe(240);
    expect(run(undefined)).toBeLessThan(240);
  });

  it("fog hides foes past the fog line unless a light shines on the lane", () => {
    const run = (landmarks: OcRules["landmarks"], x: number) => {
      const { s, foe } = withFoe("oc-shambler", x, { weather: [{ kind: "fog" }], landmarks }, { cards: ["oc-longbow"] });
      hold(foe);
      steps(s, 200, [place("oc-longbow", 2, 1)]);
      return foe.hp;
    };
    expect(run(undefined, 7)).toBe(240);
    expect(run([{ kind: "oc-pillar", lane: 2, col: 0 }], 7)).toBeLessThan(240);
    expect(run(undefined, 4.5)).toBeLessThan(240);
  });

  it("a Rooting Boar eats the grave it stands on, leaves gold and is not a lost troop", () => {
    const s = create(config({ graves: [{ lane: 2, col: 5 }] }, { cards: ["oc-boar"] }));
    expect(checkPlace(s, "oc-boar", 2, 4).ok).toBe(false);
    steps(s, sec(3), [place("oc-boar", 2, 5)]);
    expect(s.enemies.some((e) => e.kind === "oc-grave")).toBe(true);
    steps(s, sec(1.5));
    expect(s.enemies.some((e) => e.kind === "oc-grave")).toBe(false);
    expect(s.defenders.some((d) => d.kind === "oc-boar")).toBe(false);
    expect(s.pickups.some((p) => p.value === 25)).toBe(true);
    expect(s.stats.lost).toBe(0);
  });

  it("a crypt lets one of the dead out every 20 s once the waves have begun", () => {
    const s = create(config({ structures: [{ kind: "oc-crypt", lane: 2, col: 7 }] }, { firstWaveAt: 1 }));
    steps(s, sec(19));
    expect(s.enemies.filter((e) => e.origin === "crypt").length).toBe(0);
    steps(s, sec(1.5));
    expect(s.enemies.filter((e) => e.origin === "crypt").length).toBe(1);
  });

  it("no gold falls from the sky at night", () => {
    const day = create(config());
    const night = create(config({ night: true }));
    steps(day, sec(8));
    steps(night, sec(8));
    expect(day.pickups.length).toBeGreaterThan(0);
    expect(night.pickups.length).toBe(0);
  });

  it("a nocturnal troop sleeps in a day battle until a Wake-Up Brew; at night it fights at once", () => {
    const run = (night: boolean, brew: boolean) => {
      const { s, foe } = withFoe("oc-shambler", 3.8, { night }, { cards: ["oc-pixie", "oc-brew"] });
      hold(foe);
      steps(s, 1, [place("oc-pixie", 2, 1)]);
      const pixie = s.defenders.find((d) => d.kind === "oc-pixie")!;
      if (brew) steps(s, 1, [place("oc-brew", 2, 1)]);
      steps(s, 120);
      return { hp: foe.hp, asleep: pixie.asleep ?? 0 };
    };
    expect(run(false, false)).toEqual({ hp: 240, asleep: 1 });
    expect(run(false, true).hp).toBeLessThan(240);
    expect(run(true, false).hp).toBeLessThan(240);
  });

  it("a Frost Mammoth leaves ice nothing is planted on until it melts; fire melts it", () => {
    const { s, foe } = withFoe("oc-mammoth", 5.3);
    steps(s, 30);
    hold(foe);
    const col = Math.floor(foe.x) + 1;
    expect(icedAt(s, 2, col)).toBe(true);
    expect(checkPlace(s, "oc-longbow", 2, col).ok).toBe(false);
    expect(checkPlace(s, "oc-longbow", 2, 1).ok).toBe(true);
    const melted = create(config({}, { enemies: ["oc-mammoth"], firstWaveAt: 1, cards: ["oc-longbow", "fireball"] }));
    steps(melted, 1);
    const m = melted.enemies.find((e) => e.kind === "oc-mammoth")!;
    m.x = 5.3;
    steps(melted, 30);
    hold(m);
    const iced = Math.floor(m.x) + 1;
    expect(icedAt(melted, 2, iced)).toBe(true);
    steps(melted, 20, [place("fireball", 2, iced)]);
    expect(icedAt(melted, 2, iced)).toBe(false);
    steps(s, sec(26));
    expect(icedAt(s, 2, col)).toBe(false);
  });

  it("a Magma Elemental erupts at night and leaves a crater; by day it sleeps", () => {
    const run = (night: boolean) => {
      const s = create(config({ night }, { cards: ["oc-magma", "oc-longbow"], lanes: [0, 1, 2, 3, 4] }));
      steps(s, sec(2), [place("oc-magma", 2, 3)]);
      return s;
    };
    const night = run(true);
    expect(night.defenders.some((d) => d.kind === "oc-magma")).toBe(false);
    expect(checkPlace(night, "oc-longbow", 2, 3).ok).toBe(false);
    expect(checkPlace(night, "oc-longbow", 2, 4).ok).toBe(true);
    steps(night, sec(40));
    expect(checkPlace(night, "oc-longbow", 2, 3).ok).toBe(true);
    expect(run(false).defenders.some((d) => d.kind === "oc-magma" && d.asleep === 1)).toBe(true);
  });

  it("rain halves fire damage", () => {
    const run = (rain: boolean) => {
      const { s, foe } = withFoe("oc-jotunn", 3.5, rain ? { weather: [{ kind: "rain" }] } : {}, { cards: ["oc-immolate"] });
      hold(foe);
      const before = foe.hp;
      steps(s, sec(2), [place("oc-immolate", 2, 3)]);
      return before - foe.hp;
    };
    const dry = run(false);
    expect(dry).toBeGreaterThan(0);
    expect(run(true)).toBeCloseTo(dry / 2, 0);
  });

  it("a creature bank's guards sleep until the bank is struck; breaking it frees the troop", () => {
    const s = create(config({ banks: [{ kind: "oc-bank-griffin", lane: 2, col: 6, guards: ["oc-shambler"] }] }, { cards: ["oc-longbow"] }));
    const guard = s.enemies.find((e) => e.guard)!;
    const x0 = guard.x;
    steps(s, 100);
    expect(guard.x).toBe(x0);
    expect(guard.state).toBe("idle");
    steps(s, 120, [place("oc-longbow", 2, 1)]);
    expect(guard.guard).toBe(0);
    expect(guard.state).not.toBe("idle");
    const bank = s.enemies.find((e) => e.kind === "oc-bank-griffin")!;
    bank.hp = 1;
    guard.dead = true;
    steps(s, 80);
    expect(s.enemies.some((e) => e.kind === "oc-bank-griffin")).toBe(false);
    expect(s.defenders.some((d) => d.kind === "oc-griffin" && d.lane === 2 && d.col === 6)).toBe(true);
  });

  it("a thief walking past a treasure chest pockets its gold", () => {
    const { s, foe } = withFoe("oc-kobold", 4.9, { structures: [{ kind: "oc-chest", lane: 2, col: 4 }] });
    steps(s, 40);
    expect(s.enemies.some((e) => e.kind === "oc-chest")).toBe(false);
    expect(foe.loot).toBe(100);
    const control = withFoe("oc-kobold", 4.9);
    steps(control.s, 40);
    expect(control.foe.loot).toBe(0);
  });

  it("on the roof a troop needs a Crate, and the ridge stops shots from behind it", () => {
    const run = (col: number) => {
      const { s, foe } = withFoe("oc-shambler", 7.5, { tiles: rooftop([2], 4) }, { cards: ["oc-longbow", "oc-crate"] });
      hold(foe);
      expect(checkPlace(s, "oc-longbow", 2, col).ok).toBe(false);
      steps(s, 1, [place("oc-crate", 2, col)]);
      steps(s, 200, [place("oc-longbow", 2, col)]);
      return foe.hp;
    };
    expect(run(1)).toBe(240);
    expect(run(5)).toBeLessThan(240);
    expect(tileCode(create(config({ tiles: rooftop([2], 4) })), 2, 4)).toBe(TILE.ridge);
  });

  it("foes dropped from the sky land mid-lawn", () => {
    const s = create(config({ origins: [{ kind: "sky", share: 1, from: 1 }] }, { firstWaveAt: 1 }));
    steps(s, 1);
    const foe = s.enemies.find((e) => e.kind === "oc-shambler")!;
    expect(foe.origin).toBe("sky");
    expect(foe.x).toBeGreaterThan(3.5);
    expect(foe.x).toBeLessThan(7.5);
    const road = create(config({}, { firstWaveAt: 1 }));
    steps(road, 1);
    expect(road.enemies.find((e) => e.kind === "oc-shambler")!.x).toBeGreaterThan(9);
  });

  it("a Nightmare puts the troop ahead to sleep; a Wake-Up Brew wakes it", () => {
    const { s } = withFoe("oc-nightmare", 6, {}, { cards: ["oc-dwarf", "oc-brew"] });
    steps(s, sec(3), [place("oc-dwarf", 2, 3)]);
    // The Dwarf is steadfast: never lulled.
    expect(s.defenders.find((d) => d.kind === "oc-dwarf")!.asleep ?? 0).toBe(0);
    const t = withFoe("oc-nightmare", 6, {}, { cards: ["oc-longbow", "oc-brew"] });
    steps(t.s, sec(3), [place("oc-longbow", 2, 4)]);
    const bow = t.s.defenders.find((d) => d.kind === "oc-longbow")!;
    expect(bow.asleep).toBe(2);
    steps(t.s, 1, [place("oc-brew", 2, 4)]);
    expect(bow.asleep).toBe(0);
  });
});
