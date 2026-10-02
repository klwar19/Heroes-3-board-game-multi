/**
 * Order & Chaos review fixes, each against a CONTROL where the rule does not apply.
 */
import { describe, expect, it } from "vitest";
import { ENEMIES } from "../content";
import {
  aegisOver, createGarrison, isStructure, stepGarrison,
  type Defender, type Enemy, type GarrisonConfig, type GarrisonEvent, type GarrisonState, type OcRules
} from "../sim";
import { OC_ENDLESS, OC_LEVELS, buildOcConfig, type OcBuildOptions } from "./campaign";

const NEVER = 10_000_000;

/** One lane (2), a single Shambler from the first wave, plenty of gold. */
function battle(oc: Partial<OcRules>, cards: string[], over: Partial<GarrisonConfig> = {}): GarrisonConfig {
  return {
    mode: "adventure", levelId: "test", title: "test", seed: 1, lanes: [2], terrain: "grass",
    cards, spells: [], atkCards: [], atkSpells: [], enemies: ["oc-shambler"],
    waves: 2, difficulty: 0.5, startGold: 5000, startMight: 0, startMana: 0, firstWaveAt: 1,
    chargers: false, chargerSprite: "champion", bannerColor: "#000", defCols: [0, 8], ai: { def: false, atk: false },
    oc: { surgeChance: 0, startSurges: 0, blessings: [], blessingPool: [], ...oc },
    ...over
  };
}

/** A battle with every packet ready and `card` planted at (lane 2, col) on the first tick (the first wave's foe is out). */
function planted(card: string, col: number, oc: Partial<OcRules> = {}, over: Partial<GarrisonConfig> = {}): { s: GarrisonState; d: Defender } {
  const s = createGarrison(battle(oc, [card], over));
  for (const slot of s.def.cards) slot.readyAt = 0;
  stepGarrison(s, [{ t: "place", card, lane: 2, col, by: "def" }]);
  const d = s.defenders.find((unit) => unit.kind === card)!;
  expect(d).toBeDefined();
  return { s, d };
}

/** Runs `ticks` ticks, collecting the events. */
function run(s: GarrisonState, ticks: number, each?: () => void): GarrisonEvent[] {
  const events: GarrisonEvent[] = [];
  for (let i = 0; i < ticks && !s.outcome; i += 1) {
    each?.();
    stepGarrison(s, []);
    events.push(...s.events);
  }
  return events;
}

/** Another foe on the lawn, made from one already there (tests only). */
function foeLike(s: GarrisonState, template: Enemy, kind: string, x: number, extra: Partial<Enemy> = {}): Enemy {
  const def = ENEMIES[kind]!;
  const e: Enemy = {
    ...template, id: s.nextId++, kind, hp: def.hp, maxHp: def.hp, shield: 0, maxShield: 0, armor: 0, maxArmor: 0, x, px: x,
    state: "walk", stateUntil: 0, rolled: [], cue: undefined, bossPhase: undefined, lastMove: undefined, reborn: false, carrier: false,
    charmed: 0, dir: -1, freezeUntil: 0, poisonUntil: 0, cd: 0, cd2: 0, ...extra
  };
  s.enemies.push(e);
  return e;
}

const options = (cleared: string[]): OcBuildOptions => ({
  seed: 1, cards: ["oc-peasant", "oc-longbow"], hero: "catherine", artifacts: [], levels: {}, cleared,
  spells: [], ultimates: [], crowns: 1, surges: 2
});

describe("Order & Chaos review fixes", () => {
  it("the Endless Siege hands out Wake-Up Brews once a Nightmare (a foe that lulls troops) is in its horde", () => {
    const first = OC_LEVELS.findIndex((level) => level.enemies.some((kind) => ENEMIES[kind]?.lull));
    expect(first).toBeGreaterThan(0);
    const met = OC_LEVELS.slice(0, first + 1).map((level) => level.id);
    const before = OC_LEVELS.slice(0, first).map((level) => level.id);
    const withLuller = buildOcConfig(OC_ENDLESS, options(met));
    const control = buildOcConfig(OC_ENDLESS, options(before));
    expect(withLuller.enemies.some((kind) => ENEMIES[kind]?.lull)).toBe(true);
    expect(withLuller.cards).toContain("oc-brew");
    // CONTROL: no luller met and no night folk in the hand: no Brew.
    expect(control.enemies.some((kind) => ENEMIES[kind]?.lull)).toBe(false);
    expect(control.cards).not.toContain("oc-brew");
  });

  it("in a sandstorm a Gunslinger's gunfire carries only FIELD.sandRange (clear skies: it reaches the far foe)", () => {
    const run = (weather: OcRules["weather"]) => {
      const s = createGarrison(battle({ weather }, ["oc-gunslinger"]));
      for (const slot of s.def.cards) slot.readyAt = 0;
      stepGarrison(s, [{ t: "place", card: "oc-gunslinger", lane: 2, col: 1, by: "def" }]);
      const foe = s.enemies.find((e) => e.kind === "oc-shambler")!;
      expect(foe).toBeDefined();
      // Held 5.5 tiles in front of the gunslinger (beyond the sandstorm's 4.5).
      foe.x = foe.px = 7;
      foe.state = "walk";
      foe.freezeUntil = NEVER;
      for (let i = 0; i < 100; i += 1) stepGarrison(s, []);
      return foe.maxHp - foe.hp;
    };
    expect(run(undefined)).toBeGreaterThan(0);
    expect(run([{ kind: "sandstorm" }])).toBe(0);
  });

  it("a Royal Griffin put to sleep by a Nightmare claws no biter (awake: every bite is clawed back)", () => {
    const run = (asleep: boolean) => {
      const s = createGarrison(battle({}, ["oc-griffin"]));
      for (const slot of s.def.cards) slot.readyAt = 0;
      stepGarrison(s, [{ t: "place", card: "oc-griffin", lane: 2, col: 3, by: "def" }]);
      const griffin = s.defenders.find((d) => d.kind === "oc-griffin")!;
      const foe = s.enemies.find((e) => e.kind === "oc-shambler")!;
      expect(griffin && foe).toBeTruthy();
      if (asleep) griffin.asleep = 2;
      // Right in front of the griffin: it bites it.
      foe.x = foe.px = 4.1;
      foe.state = "walk";
      let bites = 0;
      for (let i = 0; i < 100; i += 1) {
        stepGarrison(s, []);
        bites += s.events.filter((ev) => ev.e === "enemyBite" && ev.id === foe.id).length;
      }
      expect(bites).toBeGreaterThan(0);
      return foe.maxHp - foe.hp;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });

  it("a world boss's fall routs the horde at once: no rebirth, split or burst, and the battle is won that tick", () => {
    const setup = () => {
      const s = createGarrison(battle({ warboss: { kind: "oc-boss-abomination", wave: 1 } }, [], { waves: 1 }));
      for (let i = 0; i < 400 && s.warbossId === undefined; i += 1) stepGarrison(s, []);
      const boss = s.enemies.find((e) => e.id === s.warbossId)!;
      expect(boss).toBeDefined();
      boss.freezeUntil = NEVER;
      // Its phase set pieces have already played (dropping it to 1 HP would otherwise start one): this test is about its fall.
      boss.bossPhase = ENEMIES[boss.kind]!.warboss!.phases.length;
      // The rest of the horde: a Carmilla (rises once), a Hydra Spawn (splits), a Pain Elemental (bursts into Lost Souls).
      const others = [foeLike(s, boss, "oc-carmilla", 6), foeLike(s, boss, "oc-hydra-spawn", 6.5), foeLike(s, boss, "oc-pain", 7)];
      for (const o of others) o.freezeUntil = NEVER;
      return { s, boss, others };
    };
    const slay = (e: Enemy) => {
      e.hp = 1;
      e.poisonUntil = NEVER;
      e.poisonDps = 100;
    };
    // CONTROL: slain on their own, Carmilla rises, the Hydra Spawn splits and the Pain Elemental bursts.
    const c = setup();
    for (const o of c.others) slay(o);
    const controlEvents = run(c.s, 25);
    expect(controlEvents.some((ev) => ev.e === "enemyRise" && ev.id === c.others[0]!.id)).toBe(true);
    expect(c.s.enemies.some((e) => !e.dead && e.kind === "oc-hydra-whelp")).toBe(true);
    expect(c.s.enemies.some((e) => !e.dead && e.kind === "oc-lost-soul")).toBe(true);
    expect(c.s.outcome ?? null).toBeNull();
    // The boss falls: the same three die for good with it, and the battle ends at once.
    const b = setup();
    slay(b.boss);
    const events: GarrisonEvent[] = [];
    let fell = false;
    for (let i = 0; i < 25 && !fell; i += 1) {
      stepGarrison(b.s, []);
      events.push(...b.s.events);
      fell = b.s.events.some((ev) => ev.e === "bossFall");
    }
    expect(fell).toBe(true);
    // ...won on the very tick it fell.
    expect(b.s.outcome?.winner).toBe("def");
    expect(events.some((ev) => ev.e === "enemyRise" || (ev.e === "spawn" && (ev.kind === "oc-hydra-whelp" || ev.kind === "oc-lost-soul")))).toBe(false);
    expect(b.s.enemies.some((e) => !e.dead && !isStructure(e))).toBe(false);
  });

  describe("a hexed, sleeping, iced or stunned troop does not react to a bite", () => {
    const STATES: Record<string, ((d: Defender) => void) | null> = {
      awake: null,
      asleep: (d) => { d.asleep = 2; },
      iced: (d) => { d.iceUntil = NEVER; },
      hexed: (d) => { d.sheepUntil = NEVER; },
      stunned: (d) => { d.stunnedUntil = NEVER; }
    };
    /** Plants `card` at col 3, puts it in `state`, and lets the first Shambler bite it for a while. */
    const bitten = (card: string, state: string) => {
      const { s, d } = planted(card, 3);
      STATES[state]?.(d);
      const foe = s.enemies.find((e) => e.kind === "oc-shambler")!;
      foe.x = foe.px = 4.1;
      foe.state = "walk";
      const events = run(s, 80);
      expect(events.some((ev) => ev.e === "enemyBite" && ev.id === foe.id)).toBe(true);
      return { events, foe };
    };
    const reactions: [string, string, (r: ReturnType<typeof bitten>) => boolean][] = [
      ["Peasant's pitchfork (thorns)", "oc-peasant", (r) => r.foe.hp < r.foe.maxHp],
      ["Nix Warrior's shield-bash", "oc-nix", (r) => r.events.some((ev) => ev.e === "bash")],
      ["Iron Maiden's jaws", "oc-maiden", (r) => r.events.some((ev) => ev.e === "maw")],
      ["Cupi's charm", "oc-cupi", (r) => r.events.some((ev) => ev.e === "charm")]
    ];
    for (const [name, card, reacted] of reactions) {
      it(name, () => {
        // CONTROL: awake, it reacts.
        expect(reacted(bitten(card, "awake"))).toBe(true);
        for (const state of ["asleep", "iced", "hexed", "stunned"]) expect([state, reacted(bitten(card, state))]).toEqual([state, false]);
      });
    }
  });

  it("an Aegis dome (the bearer's own aura) is down while it sleeps, but a stun leaves it up", () => {
    const { s, d } = planted("oc-aegis", 3);
    expect(aegisOver(s, 2, 3)).toBe(d);
    d.stunnedUntil = s.tick + 100;
    expect(aegisOver(s, 2, 3)).toBe(d);
    d.stunnedUntil = 0;
    d.asleep = 2;
    expect(aegisOver(s, 2, 3)).toBeUndefined();
  });

  it("a Treasure Kobold climbing out of a crypt carries its Surge orb (a crypt's Shambler: none)", () => {
    const fromCrypt = (kind: string) => {
      const s = createGarrison(battle({ structures: [{ kind: "oc-crypt", lane: 2, col: 7 }] }, [], { enemies: [kind], waves: 1 }));
      let risen: Enemy[] = [];
      for (let i = 0; i < 300 && !risen.length; i += 1) {
        stepGarrison(s, []);
        risen = s.enemies.filter((e) => e.origin === "crypt");
      }
      expect(risen.length).toBeGreaterThan(0);
      return risen;
    };
    expect(fromCrypt("oc-treasure").every((e) => e.kind === "oc-treasure" && e.carrier)).toBe(true);
    expect(fromCrypt("oc-shambler").some((e) => e.carrier)).toBe(false);
  });

  it("a Hexmaster mends the horde, never a charmed foe or one of Rin's cats", () => {
    const heals = (kind: string, charmed: boolean) => {
      const s = createGarrison(battle({}, [], { enemies: ["oc-hexmaster"] }));
      stepGarrison(s, []);
      const hex = s.enemies.find((e) => e.kind === "oc-hexmaster")!;
      expect(hex).toBeDefined();
      hex.x = hex.px = 6;
      hex.cd2 = 0;
      const patient = foeLike(s, hex, kind, 6.3, charmed ? { charmed: 1, dir: 1 } : {});
      patient.hp = Math.round(patient.maxHp / 3);
      const events = run(s, 20, () => {
        patient.x = patient.px = hex.x + 0.3;
      });
      return events.filter((ev) => ev.e === "enemyHeal" && ev.target === patient.id).length;
    };
    // CONTROL: a wounded foe of the horde is mended.
    expect(heals("oc-shambler", false)).toBeGreaterThan(0);
    expect(heals("oc-shambler", true)).toBe(0);
    expect(heals("oc-cat", true)).toBe(0);
  });

  it("a shove leaves a creature bank's sleeper lying low (an awake guard is thrown back)", () => {
    const shoved = (asleep: boolean) => {
      const { s, d } = planted("oc-nix", 5, { startSurges: 1, banks: [{ kind: "oc-bank-cyclops", lane: 2, col: 6, guards: ["oc-shambler"] }] });
      const guard = s.enemies.find((e) => (e.guard ?? 0) > 0)!;
      expect(guard).toBeDefined();
      if (!asleep) {
        guard.guard = 0;
        guard.state = "walk";
      }
      const x0 = guard.x;
      stepGarrison(s, [{ t: "surge", id: d.id, by: "def" }]);
      expect(s.events.some((ev) => ev.e === "shockwave")).toBe(true);
      return { moved: guard.x - x0, sleeping: (guard.guard ?? 0) > 0 };
    };
    expect(shoved(false).moved).toBeGreaterThan(0.5);
    expect(shoved(true)).toEqual({ moved: 0, sleeping: true });
  });

  it("rain douses only the flames of a burning arrow (an arrow set alight by a Salamander), not its point", () => {
    const firstArrow = (rain: boolean, salamander: boolean) => {
      const s = createGarrison(battle(rain ? { weather: [{ kind: "rain" }] } : {}, ["oc-longbow", "oc-salamander"]));
      for (const slot of s.def.cards) slot.readyAt = 0;
      // (The Salamander first: every arrow then passes through her.)
      stepGarrison(s, salamander ? [{ t: "place", card: "oc-salamander", lane: 2, col: 2, by: "def" }] : []);
      stepGarrison(s, [{ t: "place", card: "oc-longbow", lane: 2, col: 1, by: "def" }]);
      const foe = s.enemies.find((e) => e.kind === "oc-shambler")!;
      foe.x = foe.px = 6;
      foe.freezeUntil = NEVER;
      const hurt = run(s, 120).find((ev) => ev.e === "enemyHurt" && ev.id === foe.id);
      expect(hurt).toBeDefined();
      return hurt!.e === "enemyHurt" ? hurt!.amount : 0;
    };
    // CONTROL: an unlit arrow is untouched by rain.
    expect(firstArrow(true, false)).toBe(firstArrow(false, false));
    const dry = firstArrow(false, true);
    const wet = firstArrow(true, true);
    // A burning arrow is its point plus as much again in flames: rain halves only the flames.
    expect(dry).toBe(2 * firstArrow(false, false));
    expect(wet).toBe(Math.round(dry * 0.75));
  });
});
