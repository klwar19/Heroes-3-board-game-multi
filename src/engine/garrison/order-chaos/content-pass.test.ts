/**
 * Order & Chaos content pass (./roster.ts, ../sim.ts): the new troops, foes, hybrids,
 * spells and artifacts. Each test compares the rule's outcome with a CONTROL where the
 * rule does not apply (another unit, no artifact, no cast), so removing the rule fails it.
 */
import { describe, expect, it } from "vitest";
import { ENEMIES, fusionFor } from "../content";
import {
  checkPlace, createGarrison, stepGarrison,
  type Defender, type Enemy, type GarrisonConfig, type GarrisonState, type OcRules, type SidedCommand
} from "../sim";

const NEVER = 10_000_000;
/** A sturdy foe that does not regenerate (a Troll heals 40 a second and would hide small hits). */
const DUMMY = "oc-berserker";

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
  // (A last wave is heralded first, so wait for the foe to come on.)
  for (let i = 0; i < 400 && !s.enemies.some((e) => e.kind === kind); i += 1) steps(s, 1);
  const foe = s.enemies.find((e) => e.kind === kind)!;
  expect(foe).toBeDefined();
  foe.x = x;
  foe.px = x;
  if (foe.state === "appear") foe.state = "walk";
  return { s, foe };
}

/**
 * A raid-mode lawn (the defence is preset, foes are mustered anywhere right of x 0.5):
 * the way to put several foes and troops exactly where a test wants them.
 */
function lawn(preset: { kind: string; lane: number; col: number }[], foes: string[], oc: Partial<OcRules> = {}, lanes = [2]): GarrisonState {
  const s = create(config(oc, { mode: "raid", lanes, preset, atkCards: foes, startMight: 1_000_000, atkMinX: 0.5, enemies: [] }));
  for (const c of s.atk.cards) c.readyAt = 0;
  return s;
}

function muster(s: GarrisonState, kind: string, x: number, lane = 2): Enemy {
  stepGarrison(s, [{ t: "muster", kind, lane, x, by: "atk" }]);
  for (const c of s.atk.cards) c.readyAt = 0;
  const e = s.enemies.filter((foe) => foe.kind === kind && foe.lane === lane).at(-1)!;
  expect(e).toBeDefined();
  return e;
}

const hold = (e: Enemy) => {
  e.freezeUntil = NEVER;
};

const place = (card: string, lane: number, col: number, beltId?: number): SidedCommand => ({ t: "place", card, lane, col, beltId, by: "def" });
const cast = (spell: string, lane: number, x: number): SidedCommand => ({ t: "cast", side: "def", spell: spell as never, lane, x, by: "def" });
const troop = (s: GarrisonState, kind: string, lane = 2): Defender | undefined => s.defenders.find((d) => d.kind === kind && d.lane === lane && !d.dead);

/** Projectiles a troop has loosed over `n` steps (new ids seen). */
function arrowsOver(s: GarrisonState, n: number): number {
  const before = new Set(s.projectiles.map((p) => p.id));
  const seen = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    stepGarrison(s, []);
    for (const p of s.projectiles) if (p.side === "def" && !before.has(p.id)) seen.add(p.id);
  }
  return seen.size;
}

describe("Order & Chaos content pass: troops", () => {
  it("a Wood Elf Band grows with its own packet: a dearer regroup, more health and an extra arrow per volley", () => {
    const run = (members: number) => {
      const { s, foe } = withFoe("oc-shambler", 7, {}, { cards: ["oc-elf-band"] });
      hold(foe);
      foe.hp = foe.maxHp = 100000;
      steps(s, 1, [place("oc-elf-band", 2, 1)]);
      const band = troop(s, "oc-elf-band")!;
      for (let m = 1; m < members; m += 1) {
        s.def.cards[0]!.readyAt = 0;
        const check = checkPlace(s, "oc-elf-band", 2, 1);
        expect(check.ok && check.action).toBe("band");
        expect(check.ok && check.cost).toBe(100 + 25 * m);
        steps(s, 1, [place("oc-elf-band", 2, 1)]);
      }
      return { band, arrows: arrowsOver(s, 32) };
    };
    const one = run(1);
    const pack = run(2);
    expect(pack.band.members).toBe(2);
    expect(pack.band.maxHp).toBe(2 * one.band.maxHp);
    expect(pack.arrows).toBe(2 * one.arrows);
    expect(one.arrows).toBeGreaterThan(0);
  });

  it("a Stone Gargoyle drops on a foe that comes near (and shatters); out of reach it waits", () => {
    const near = withFoe("oc-trog-helm", 2.6, {}, { cards: ["oc-gargoyle"] });
    steps(near.s, 3, [place("oc-gargoyle", 2, 1)]);
    expect(near.foe.dead).toBe(true);
    expect(troop(near.s, "oc-gargoyle")).toBeUndefined();
    const far = withFoe("oc-trog-helm", 6, {}, { cards: ["oc-gargoyle"] });
    steps(far.s, 3, [place("oc-gargoyle", 2, 1)]);
    expect(far.foe.dead).toBe(false);
    expect(troop(far.s, "oc-gargoyle")).toBeDefined();
  });

  it("a Meteor Gargoyle's drop burns the whole 3x3; a Stone Gargoyle's only the spot it lands on", () => {
    const run = (kind: string) => {
      // Hydras on both lanes: tough enough to live through the drop (a Hydra in lane 3 is out of the gargoyle's own reach).
      const s = lawn([{ kind, lane: 2, col: 1 }], ["oc-hydra"], {}, [1, 2, 3]);
      const b = muster(s, "oc-hydra", 2.6, 3);
      hold(b);
      const a = muster(s, "oc-hydra", 2.6, 2);
      hold(a);
      steps(s, 3);
      expect(a.hp).toBeLessThan(a.maxHp);
      return b.maxHp - b.hp;
    };
    expect(run("oc-meteor-gargoyle")).toBeGreaterThan(1000);
    expect(run("oc-gargoyle")).toBe(0);
  });

  it("a Nix Warrior bashes its biter two tiles back before it lands a bite; a Dwarf just gets bitten", () => {
    const run = (wall: string) => {
      const { s, foe } = withFoe("oc-shambler", 2.1, {}, { cards: [wall] });
      steps(s, 1, [place(wall, 2, 1)]);
      steps(s, 30);
      return { foe, wall: troop(s, wall)! };
    };
    const nix = run("oc-nix");
    const dwarf = run("oc-dwarf");
    expect(nix.foe.x).toBeGreaterThan(3.5);
    expect(nix.wall.hp).toBe(nix.wall.maxHp);
    expect(nix.wall.stacks).toBe(1);
    expect(dwarf.foe.x).toBeLessThan(2.3);
    expect(dwarf.wall.hp).toBeLessThan(dwarf.wall.maxHp);
  });

  it("an Iron Maiden shuts her first biter inside for good; a Dwarf does not", () => {
    const maiden = withFoe("oc-trog-helm", 2.1, {}, { cards: ["oc-maiden"] });
    steps(maiden.s, 1, [place("oc-maiden", 2, 1)]);
    steps(maiden.s, 20);
    expect(maiden.foe.dead).toBe(true);
    expect(troop(maiden.s, "oc-maiden")!.busyUntil).toBeGreaterThan(maiden.s.tick);
    const dwarf = withFoe("oc-trog-helm", 2.1, {}, { cards: ["oc-dwarf"] });
    steps(dwarf.s, 1, [place("oc-dwarf", 2, 1)]);
    steps(dwarf.s, 20);
    expect(dwarf.foe.dead).toBe(false);
  });

  it("a Gunslinger hits a flyer a Longbowman cannot", () => {
    const run = (card: string) => {
      const { s, foe } = withFoe("oc-wyvern", 5, {}, { cards: [card] });
      hold(foe);
      steps(s, 1, [place(card, 2, 1)]);
      steps(s, 60);
      return foe.maxHp - foe.hp;
    };
    expect(run("oc-gunslinger")).toBeGreaterThan(0);
    expect(run("oc-longbow")).toBe(0);
  });

  it("a Great Shaman's frost lob chills the foes it splashes (a Cyclops' boulder does not)", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 0 }], [DUMMY], {}, [1, 2, 3]);
      const a = muster(s, DUMMY, 4, 2);
      const b = muster(s, DUMMY, 4.3, 3);
      hold(a);
      hold(b);
      steps(s, 80);
      return { hurt: b.maxHp - b.hp, chilled: b.chillUntil > s.tick };
    };
    const shaman = run("oc-shaman");
    const cyclops = run("oc-cyclops");
    expect(shaman.hurt).toBeGreaterThan(0);
    expect(shaman.chilled).toBe(true);
    expect(cyclops.chilled).toBe(false);
  });

  it("a Rafflesia's stench reaches behind her and into the lanes beside; a Longbowman's arrows do not", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 3 }], [DUMMY], {}, [1, 2, 3]);
      const foe = muster(s, DUMMY, 3.0, 3);
      hold(foe);
      steps(s, 45);
      return foe.maxHp - foe.hp;
    };
    expect(run("oc-rafflesia")).toBeGreaterThan(0);
    expect(run("oc-longbow")).toBe(0);
  });

  it("Ayanami's iai dash cuts a foe 2.4 tiles ahead", () => {
    const run = (card: string) => {
      const { s, foe } = withFoe(DUMMY, 3.9, {}, { cards: [card] });
      hold(foe);
      steps(s, 1, [place(card, 2, 1)]);
      steps(s, 25);
      return foe.maxHp - foe.hp;
    };
    expect(run("oc-ayanami")).toBeGreaterThanOrEqual(260);
    expect(run("oc-longbow")).toBeLessThan(100);
  });

  it("a War Mammoth's stamp hurts and stuns the foes around it, the lanes beside included", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 2 }], [DUMMY], {}, [1, 2, 3]);
      const foe = muster(s, DUMMY, 3.1, 1);
      hold(foe);
      steps(s, 25);
      return { hurt: foe.maxHp - foe.hp, stunned: foe.stunUntil > s.tick };
    };
    const mammoth = run("oc-war-mammoth");
    expect(mammoth.hurt).toBeGreaterThan(0);
    expect(mammoth.stunned).toBe(true);
    expect(run("oc-dwarf").hurt).toBe(0);
  });

  it("Rin sets a cat loose that brawls the foe in her lane; the cat is no foe to wait for", () => {
    const run = (card: string, n: number) => {
      const { s, foe } = withFoe("oc-shambler", 3.4, {}, { cards: [card], waves: 1 });
      steps(s, 1, [place(card, 2, 1)]);
      let catSeen = false;
      for (let i = 0; i < n && !s.outcome; i += 1) {
        foe.x = Math.max(foe.x, 3.4);
        steps(s, 1);
        if (s.enemies.some((e) => ENEMIES[e.kind]!.ally && e.charmed > 0)) catSeen = true;
      }
      return { s, foe, catSeen };
    };
    const rin = run("oc-rin", 900);
    expect(rin.catSeen).toBe(true);
    expect(rin.foe.dead).toBe(true);
    // The battle is won with a cat still out on the lawn (Order's allies are no foes to wait for).
    expect(rin.s.outcome?.winner).toBe("def");
    expect(rin.s.enemies.some((e) => ENEMIES[e.kind]!.ally)).toBe(true);
    const peasant = run("oc-peasant", 200);
    expect(peasant.catSeen).toBe(false);
  });

  it("a Rolling Armadillo glances into the next lane after each foe; the Giant rolls straight on", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 0 }], [DUMMY], {}, [1, 2, 3]);
      const a = muster(s, DUMMY, 3, 2);
      const b = muster(s, DUMMY, 5, 1);
      hold(a);
      hold(b);
      steps(s, 60);
      return { a: a.maxHp - a.hp, b: b.maxHp - b.hp };
    };
    const small = run("oc-armadillo");
    expect(small.a).toBeGreaterThan(0);
    expect(small.b).toBeGreaterThan(0);
    const giant = run("oc-big-armadillo");
    expect(giant.a).toBeGreaterThan(0);
    expect(giant.b).toBe(0);
  });

  it("a Runemaster Yeti's hammer stuns what it smashes; a Longbowman's arrow does not", () => {
    const run = (card: string) => {
      const { s, foe } = withFoe(DUMMY, 4, {}, { cards: [card] });
      hold(foe);
      steps(s, 1, [place(card, 2, 1)]);
      for (let i = 0; i < 70 && foe.hp === foe.maxHp; i += 1) steps(s, 1);
      return foe.stunUntil > s.tick;
    };
    expect(run("oc-runemaster")).toBe(true);
    expect(run("oc-longbow")).toBe(false);
  });

  it("a Softball bounces on through a second foe; an arrow stops at the first", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 0 }], [DUMMY]);
      const a = muster(s, DUMMY, 4, 2);
      const b = muster(s, DUMMY, 5, 2);
      hold(a);
      hold(b);
      steps(s, 40);
      return b.maxHp - b.hp;
    };
    expect(run("oc-softball")).toBeGreaterThan(0);
    expect(run("oc-longbow")).toBe(0);
  });

  it("a Zephyr Archer's arrows knock the foe back", () => {
    // (A hybrid has no card: it stands on a preset lawn.)
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 1 }], [DUMMY]);
      const foe = muster(s, DUMMY, 5);
      hold(foe);
      const x = foe.x;
      steps(s, 60);
      expect(foe.hp).toBeLessThan(foe.maxHp);
      return foe.x - x;
    };
    expect(run("oc-zephyr")).toBeGreaterThan(0.1);
    expect(run("oc-longbow")).toBe(0);
  });

  it("the Siren charms three biters before she is spent; Cupi only one", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 1 }], ["oc-shambler"]);
      const foe = muster(s, "oc-shambler", 2.1);
      steps(s, 20);
      return { charmed: foe.charmed > 0, standing: troop(s, kind) !== undefined };
    };
    const siren = run("oc-siren");
    const cupi = run("oc-cupi");
    expect(siren.charmed).toBe(true);
    expect(cupi.charmed).toBe(true);
    expect(siren.standing).toBe(true);
    expect(cupi.standing).toBe(false);
  });

  it("a Glacial Charge freezes the 3x3 it blows up; a Sapper's charge stays in its lane", () => {
    const run = (kind: string) => {
      // A Hydra sets the charge off (and lives through it); another stands beside it in lane 3.
      const s = lawn([{ kind, lane: 2, col: 3 }], ["oc-hydra"], {}, [1, 2, 3]);
      const b = muster(s, "oc-hydra", 3.5, 3);
      const a = muster(s, "oc-hydra", 3.7, 2);
      steps(s, 20);
      return { hurt: b.maxHp - b.hp, frozen: b.freezeUntil > s.tick && b.freezeUntil < NEVER, triggered: a.hp < a.maxHp || a.dead };
    };
    const glacial = run("oc-glacial-charge");
    const sapper = run("oc-sapper");
    expect(glacial.triggered && sapper.triggered).toBe(true);
    expect(glacial.hurt).toBeGreaterThan(0);
    expect(glacial.frozen).toBe(true);
    expect(sapper.hurt).toBe(0);
    expect(sapper.frozen).toBe(false);
  });

  it("a Royal Griffin claws whatever bites a troop beside it (unlimited retaliation)", () => {
    const run = (guard: string) => {
      const s = lawn([{ kind: "oc-dwarf", lane: 2, col: 1 }, { kind: guard, lane: 3, col: 1 }], [DUMMY], {}, [1, 2, 3]);
      const foe = muster(s, DUMMY, 2.1);
      steps(s, 30);
      return foe.maxHp - foe.hp;
    };
    expect(run("oc-griffin")).toBeGreaterThanOrEqual(80);
    expect(run("oc-peasant")).toBe(0);
  });

  it("the new hybrids fuse from their halves (either order)", () => {
    expect(fusionFor("oc-peasant", "oc-longbow")).toBe("oc-tithe-slinger");
    expect(fusionFor("oc-longbow", "oc-peasant")).toBe("oc-tithe-slinger");
    expect(fusionFor("oc-dwarf", "oc-snow-elf")).toBe("oc-yeti-warden");
    expect(fusionFor("oc-snow-elf", "oc-immolate")).toBe("oc-frostfire");
    expect(fusionFor("oc-sylph", "oc-longbow")).toBe("oc-zephyr");
    expect(fusionFor("oc-automaton", "oc-lightning")).toBe("oc-tesla");
    // Late-campaign pairings.
    expect(fusionFor("oc-crusader", "oc-unicorn")).toBe("oc-paladin");
    expect(fusionFor("oc-unicorn", "oc-crusader")).toBe("oc-paladin");
    expect(fusionFor("oc-softball", "oc-rin")).toBe("oc-kyousuke");
    expect(fusionFor("oc-laffey", "oc-azusa")).toBe("oc-i19");
    expect(fusionFor("oc-ammo", "oc-mechanic")).toBe("oc-engineer");
    expect(fusionFor("oc-belfast", "oc-akagi")).toBe("oc-unicorn-carrier");
    expect(fusionFor("oc-dwarf", "oc-longbow")).toBeNull();
  });
});

describe("Order & Chaos content pass: the horde", () => {
  it("a Tentacle Eater drags a troop a tile toward it; a tall Iron Golem won't budge", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind, lane: 2, col: 2 }], ["oc-eater"]);
      const eater = muster(s, "oc-eater", 5);
      eater.hp = eater.maxHp = 100000;
      steps(s, 50);
      return troop(s, kind)!.col;
    };
    expect(run("oc-longbow")).toBe(3);
    expect(run("oc-iron-golem")).toBe(2);
  });

  it("a Warlord knights the nearest unarmoured foe", () => {
    const withLord = lawn([], ["oc-warlord", "oc-shambler"]);
    muster(withLord, "oc-warlord", 6);
    const a = muster(withLord, "oc-shambler", 5.4);
    steps(withLord, 50);
    expect(a.armor).toBe(500);
    const alone = lawn([], ["oc-shambler"]);
    const b = muster(alone, "oc-shambler", 5.4);
    steps(alone, 50);
    expect(b.armor).toBe(0);
  });

  it("a Psychic Watcher's dome turns a lobbed boulder aside", () => {
    const run = (withWatcher: boolean) => {
      const s = lawn([{ kind: "oc-cyclops", lane: 2, col: 0 }], ["oc-watcher", DUMMY]);
      const target = muster(s, DUMMY, 5);
      hold(target);
      if (withWatcher) hold(muster(s, "oc-watcher", 5.6));
      steps(s, 90);
      return target.maxHp - target.hp;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });

  it("a Stormbird drops its passenger behind the front line; blown away early, the passenger falls out in the field", () => {
    const flown = lawn([], ["oc-stormbird"]);
    const bird = muster(flown, "oc-stormbird", 6);
    for (let i = 0; i < 400 && bird.carrying; i += 1) steps(flown, 1);
    const dropped = flown.enemies.find((e) => e.kind === "oc-trog-helm");
    expect(dropped).toBeDefined();
    expect(dropped!.x).toBeLessThanOrEqual(2.7);
    expect(bird.dir).toBe(1);
    const gusted = lawn([{ kind: "oc-sylph", lane: 2, col: 0 }], ["oc-stormbird"]);
    muster(gusted, "oc-stormbird", 6);
    steps(gusted, 90);
    const fell = gusted.enemies.find((e) => e.kind === "oc-trog-helm");
    expect(fell).toBeDefined();
    expect(fell!.x).toBeGreaterThan(4);
  });

  it("a Frostcaller seals a troop in ice (it stops shooting) — unless a fire troop keeps it warm", () => {
    const run = (warm: boolean) => {
      const preset = [{ kind: "oc-longbow", lane: 2, col: 2 }, ...(warm ? [{ kind: "oc-salamander", lane: 2, col: 1 }] : [])];
      const s = lawn(preset, ["oc-frostcaller"]);
      const caller = muster(s, "oc-frostcaller", 5.5);
      caller.hp = caller.maxHp = 100000;
      steps(s, 50);
      return troop(s, "oc-longbow")!.iceUntil ?? 0;
    };
    const cold = lawn([{ kind: "oc-longbow", lane: 2, col: 2 }], ["oc-frostcaller"]);
    const caller = muster(cold, "oc-frostcaller", 5.5);
    caller.hp = caller.maxHp = 100000;
    steps(cold, 50);
    const iced = troop(cold, "oc-longbow")!;
    expect(iced.iceUntil ?? 0).toBeGreaterThan(cold.tick);
    expect(arrowsOver(cold, 60)).toBe(0);
    expect(run(true)).toBe(0);
  });

  it("a Fire Messenger burns the troop it bites to ashes — unless frost has put its fire out", () => {
    const run = (doused: boolean) => {
      const s = lawn([{ kind: "oc-longbow", lane: 2, col: 1 }], ["oc-fire-messenger"]);
      const foe = muster(s, "oc-fire-messenger", 2.1);
      if (doused) foe.chillUntil = NEVER;
      steps(s, 12);
      return troop(s, "oc-longbow");
    };
    expect(run(false)).toBeUndefined();
    expect(run(true)).toBeDefined();
  });

  it("a Kitsune Assassin strikes the rearmost troop past the wall; a Shambler can't", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind: "oc-dwarf", lane: 2, col: 3 }, { kind: "oc-longbow", lane: 2, col: 1 }], [kind]);
      const foe = muster(s, kind, 4.2);
      foe.hp = foe.maxHp = 100000;
      steps(s, 60);
      const bow = troop(s, "oc-longbow");
      return bow ? bow.maxHp - bow.hp : Number.POSITIVE_INFINITY;
    };
    expect(run("oc-kitsune")).toBeGreaterThanOrEqual(300);
    expect(run("oc-shambler")).toBe(0);
  });

  it("a Mantis Reaper's third stroke whirls through the troops beside her target", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind: "oc-dwarf", lane: 2, col: 2 }, { kind: "oc-longbow", lane: 3, col: 2 }], [kind], {}, [1, 2, 3]);
      const foe = muster(s, kind, 3.1);
      foe.hp = foe.maxHp = 100000;
      steps(s, 45);
      const side = troop(s, "oc-longbow", 3)!;
      return side.maxHp - side.hp;
    };
    expect(run("oc-mantis")).toBeGreaterThan(0);
    expect(run("oc-shambler")).toBe(0);
  });

  it("a Cyberbrute's crushing blow shakes the troops around it; a Jotunn's does not", () => {
    const run = (kind: string) => {
      const s = lawn([{ kind: "oc-dwarf", lane: 2, col: 2 }, { kind: "oc-pikeman", lane: 3, col: 2 }], [kind], {}, [1, 2, 3]);
      const foe = muster(s, kind, 3.1);
      foe.hp = foe.maxHp = 100000;
      steps(s, 40);
      const side = troop(s, "oc-pikeman", 3)!;
      return side.maxHp - side.hp;
    };
    expect(run("oc-cyberbrute")).toBeGreaterThan(0);
    expect(run("oc-jotunn")).toBe(0);
  });

  it("a Treasure Kobold turns and runs halfway, carrying its loot and a Surge orb", () => {
    const { s, foe } = withFoe("oc-treasure", 5.2, { surgeChance: 0.0001 });
    expect(foe.loot).toBe(150);
    expect(foe.carrier).toBe(true);
    steps(s, 60);
    expect(foe.fleeing).toBe(true);
    expect(foe.dir).toBe(1);
  });

  it("a Hydra Spawn splits into two whelps when cut down", () => {
    const { s, foe } = withFoe("oc-hydra-spawn", 6, {}, { spells: ["implosion"], startMana: 30 });
    hold(foe);
    steps(s, 1, [cast("implosion", 2, 6)]);
    expect(foe.dead).toBe(true);
    expect(s.enemies.filter((e) => e.kind === "oc-hydra-whelp").length).toBe(2);
  });
});

describe("Order & Chaos content pass: spells and artifacts", () => {
  it("Dispel tears the helm off a foe", () => {
    const run = (spells: string[]) => {
      const { s, foe } = withFoe("oc-trog-helm", 5, {}, { spells: spells as never, startMana: 30 });
      hold(foe);
      steps(s, 1, spells.length ? [cast("dispel", 2, 5)] : []);
      return foe.armor;
    };
    expect(run(["dispel"])).toBe(0);
    expect(run([])).toBe(450);
  });

  it("Slayer deals 2500 to a giant and 600 to anything else", () => {
    const run = (kind: string) => {
      const { s, foe } = withFoe(kind, 6, {}, { spells: ["slayer"], startMana: 30 });
      hold(foe);
      steps(s, 1, [cast("slayer", 2, 6)]);
      return foe.maxHp - foe.hp + (foe.maxArmor - foe.armor);
    };
    expect(run("oc-jotunn")).toBe(2500);
    expect(run(DUMMY)).toBe(600);
  });

  it("Forgetfulness makes a shooter walk in instead of shooting", () => {
    const run = (forget: boolean) => {
      const { s, foe } = withFoe("oc-medusa", 5, {}, { cards: ["oc-dwarf"], spells: ["forgetfulness"], startMana: 30 });
      steps(s, 1, [place("oc-dwarf", 2, 1), ...(forget ? [cast("forgetfulness", 2, 0)] : [])]);
      steps(s, 60);
      return foe.x;
    };
    expect(run(true)).toBeLessThan(4.6);
    expect(run(false)).toBeGreaterThan(4.9);
  });

  it("Counterstrike makes every troop hit back at its biters", () => {
    const run = (counter: boolean) => {
      const { s, foe } = withFoe("oc-berserker", 2.1, {}, { cards: ["oc-dwarf"], spells: ["counterstrike"], startMana: 30 });
      steps(s, 1, [place("oc-dwarf", 2, 1), ...(counter ? [cast("counterstrike", 2, 0)] : [])]);
      steps(s, 30);
      return foe.maxHp - foe.hp;
    };
    expect(run(true)).toBeGreaterThanOrEqual(60);
    expect(run(false)).toBe(0);
  });

  it("the Eversmoking Ring of Sulfur halves a keg's blast on the troops", () => {
    const run = (blessings: string[]) => {
      const s = lawn([{ kind: "oc-iron-golem", lane: 2, col: 2 }], ["oc-goblin"], { blessings: blessings as never });
      muster(s, "oc-goblin", 3.1);
      steps(s, 90);
      const golem = troop(s, "oc-iron-golem")!;
      return golem.maxHp - golem.hp;
    };
    const plain = run([]);
    expect(plain).toBeGreaterThanOrEqual(1800);
    expect(run(["ring-of-sulfur"])).toBeLessThan(plain - 800);
  });

  it("the Blackshard bites half again as deep into a helm", () => {
    const run = (blessings: string[]) => {
      const { s, foe } = withFoe("oc-trog-helm", 6, { blessings: blessings as never }, { spells: ["magic-arrow"], startMana: 30 });
      hold(foe);
      steps(s, 1, [cast("magic-arrow", 2, 6)]);
      return foe.maxArmor - foe.armor;
    };
    expect(run([])).toBe(150);
    expect(run(["blackshard"])).toBe(225);
  });

  it("the Dragon Wing Tabard makes flyers take half again as much", () => {
    const run = (blessings: string[]) => {
      const { s, foe } = withFoe("oc-wyvern", 6, { blessings: blessings as never }, { spells: ["magic-arrow"], startMana: 30 });
      hold(foe);
      steps(s, 1, [cast("magic-arrow", 2, 6)]);
      return foe.maxHp - foe.hp;
    };
    expect(run([])).toBe(150);
    expect(run(["dragon-wing-tabard"])).toBe(225);
  });

  it("the Pendant of Second Sight halves how long a stun holds a troop", () => {
    const run = (blessings: string[]) => {
      const s = lawn([{ kind: "oc-pikeman", lane: 2, col: 1 }], ["oc-scorpicore"], { blessings: blessings as never });
      const foe = muster(s, "oc-scorpicore", 2.1);
      foe.hp = foe.maxHp = 100000;
      let held = 0;
      for (let i = 0; i < 60 && held === 0; i += 1) {
        steps(s, 1);
        const pike = troop(s, "oc-pikeman")!;
        if (pike.stunnedUntil > s.tick) held = pike.stunnedUntil - s.tick;
      }
      return held;
    };
    const plain = run([]);
    expect(plain).toBeGreaterThan(40);
    expect(run(["pendant-second-sight"])).toBeLessThanOrEqual(Math.ceil(plain / 2));
  });

  it("the Shield of the Dwarven Lords gives walls (only) half again as much health", () => {
    const run = (blessings: string[], card: string) => {
      const s = create(config({ blessings: blessings as never }, { cards: [card] }));
      steps(s, 1, [place(card, 2, 1)]);
      return troop(s, card)!.maxHp;
    };
    expect(run(["dwarven-shield"], "oc-automaton")).toBe(Math.round(run([], "oc-automaton") * 1.5));
    expect(run(["dwarven-shield"], "oc-longbow")).toBe(run([], "oc-longbow"));
  });

  it("Sandals of the Saint heal a troop in full when it Surges", () => {
    const run = (blessings: string[]) => {
      const s = create(config({ blessings: blessings as never, startSurges: 1 }, { cards: ["oc-dwarf"] }));
      steps(s, 1, [place("oc-dwarf", 2, 1)]);
      const dwarf = troop(s, "oc-dwarf")!;
      dwarf.hp = 100;
      steps(s, 1, [{ t: "surge", id: dwarf.id, by: "def" }]);
      return dwarf.hp;
    };
    expect(run(["sandals-of-the-saint"])).toBe(4000);
    expect(run([])).toBe(100);
  });

  it("the Thunder Helmet makes lightning strike half again as hard", () => {
    const run = (blessings: string[]) => {
      const { s, foe } = withFoe(DUMMY, 6, { blessings: blessings as never }, { spells: ["lightning-bolt"], startMana: 30 });
      hold(foe);
      steps(s, 1, [cast("lightning-bolt", 2, 6)]);
      return foe.maxHp - foe.hp;
    };
    expect(run([])).toBe(350);
    expect(run(["thunder-helmet"])).toBe(525);
  });
});
