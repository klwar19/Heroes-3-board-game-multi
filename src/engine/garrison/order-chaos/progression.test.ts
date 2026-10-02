/**
 * Order & Chaos progression and treasury rules, each against a CONTROL where the rule doesn't apply:
 * hero ranks, boss phase set pieces, Endless bosses, the Psychic Elemental's hypnosis, the Phoenix
 * Feather, packed boosts, the Magic Garden, the Forge mini-game, the Portal's pity and the campaign board.
 */
import { describe, expect, it } from "vitest";
import { ENEMIES, MANA_MAX } from "../content";
import { checkItem, createGarrison, itemsLeft, stepGarrison, type GarrisonConfig, type GarrisonEvent, type GarrisonState, type OcRules, type SidedCommand } from "../sim";
import { OC_LEVELS, OC_RAIDS, buildOcConfig, heroRankCap, type OcBuildOptions } from "./campaign";
import { FORGE, forgeAct, forgeQuality, forgeScore, forgeStep, newForgeGame } from "./forge-game";
import { OC_SEEDS, advancePlant, harvestGems, sow, water } from "./garden";
import { heroPassivePower, heroSpellPower } from "./hero-ranks";
import { ocCampaignSummary, ocScore, ocSummaryProblem } from "./scores";
import { OC_ITEMS, OC_UR_PITY, itemPerMatch, portalPools, rollRarity, summon } from "./treasury";

const NEVER = 10_000_000;

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

function run(s: GarrisonState, ticks: number, commands: SidedCommand[] = []): GarrisonEvent[] {
  const events: GarrisonEvent[] = [];
  for (let i = 0; i < ticks && !s.outcome; i += 1) {
    stepGarrison(s, i === 0 ? commands : []);
    events.push(...s.events);
  }
  return events;
}

const options = (over: Partial<OcBuildOptions> = {}): OcBuildOptions => ({
  seed: 1, cards: ["oc-peasant", "oc-longbow"], hero: "catherine", artifacts: [], levels: {}, cleared: [],
  spells: [], ultimates: [], crowns: 1, surges: 2, ...over
});

describe("hero ranks", () => {
  it("scale the hero's own passive (Sorcery's extra max mana) and leave an unranked battle at full strength", () => {
    const cfg = (rank?: number) => battle({ blessings: ["orb-of-mana"], ...(rank ? { hero: { passive: "orb-of-mana", spell: "chain-lightning", rank } } : {}) }, []);
    const full = createGarrison(cfg());
    const rank1 = createGarrison(cfg(1));
    const rank5 = createGarrison(cfg(5));
    expect(full.def.manaMax).toBe(MANA_MAX + 10);
    expect(rank5.def.manaMax).toBe(MANA_MAX + 10);
    expect(rank1.def.manaMax).toBe(MANA_MAX + Math.round(10 * heroPassivePower(1)));
    expect(rank1.def.manaMax).toBeLessThan(full.def.manaMax);
  });

  it("scale the signature spell (Royal Charge) — and only the hero's own spell", () => {
    const charge = (rank?: number) => {
      const s = createGarrison(battle(rank ? { hero: { passive: "necklace-of-swiftness", spell: "royal-charge", rank } } : {}, [], { spells: ["royal-charge"], startMana: 30 }));
      run(s, 1, [{ t: "cast", side: "def", spell: "royal-charge", lane: 2, x: 4, by: "def" }]);
      return s.chargers.find((c) => c.dmg !== undefined)?.dmg;
    };
    expect(charge()).toBe(1200);
    expect(charge(1)).toBe(Math.round(1200 * heroSpellPower(1)));
    expect(charge(5)).toBe(1200);
  });

  it("open at the Forge one rank per world through world 4", () => {
    const upTo = (world: number) => OC_LEVELS.filter((l) => l.world <= world).map((l) => l.id);
    expect(heroRankCap([])).toBe(1);
    expect(heroRankCap(upTo(1))).toBe(2);
    expect(heroRankCap(upTo(4))).toBe(5);
  });
});

describe("world boss set pieces", () => {
  const bossBattle = () => {
    const s = createGarrison(battle({ warboss: { kind: "oc-boss-abomination", wave: 1 } }, [], { waves: 1 }));
    for (let i = 0; i < 400 && s.warbossId === undefined; i += 1) stepGarrison(s, []);
    const boss = s.enemies.find((e) => e.id === s.warbossId)!;
    boss.freezeUntil = NEVER;
    boss.x = 6;
    return { s, boss };
  };

  it("on entering a phase it halts and can't be harmed until the set piece lands; before that, harm lands", () => {
    // CONTROL: above the first phase line, poison hurts it.
    const c = bossBattle();
    c.boss.poisonUntil = NEVER;
    c.boss.poisonDps = 200;
    const before = c.boss.hp;
    run(c.s, 20);
    expect(c.boss.hp).toBeLessThan(before);
    expect(c.boss.interlude ?? false).toBe(false);
    // Crossing 60%: the interlude starts, and harm doesn't land while it winds up.
    const b = bossBattle();
    b.boss.hp = Math.floor(b.boss.maxHp * 0.59);
    b.boss.freezeUntil = 0;
    run(b.s, 2);
    expect(b.boss.interlude).toBe(true);
    const hp = b.boss.hp;
    b.boss.poisonUntil = NEVER;
    b.boss.poisonDps = 200;
    run(b.s, 20);
    expect(b.boss.hp).toBe(hp);
    const def = ENEMIES[b.boss.kind]!.warboss!;
    run(b.s, (def.pause ?? 80) + 10);
    expect(b.boss.interlude).toBe(false);
    expect(b.boss.hp).toBeLessThan(hp);
  });

  it("a lane Champion bounces off a boss winding up its set piece (no push-back, the piece still lands); otherwise it throws the boss back", () => {
    const charge = (s: GarrisonState, x: number) => s.chargers.push({ lane: 2, state: "charging", x, px: x });
    // CONTROL: outside a set piece the Champion throws it back.
    const c = bossBattle();
    c.boss.freezeUntil = 0;
    const x0 = c.boss.x;
    charge(c.s, x0 - 0.5);
    run(c.s, 3);
    expect(c.boss.x).toBeGreaterThan(x0 + 1);
    // During the set piece: it stays put, keeps winding up, and the piece ends on time.
    const b = bossBattle();
    b.boss.hp = Math.floor(b.boss.maxHp * 0.59);
    b.boss.freezeUntil = 0;
    run(b.s, 2);
    expect(b.boss.interlude).toBe(true);
    const x1 = b.boss.x;
    charge(b.s, x1 - 0.5);
    run(b.s, 3);
    expect(b.boss.x).toBeCloseTo(x1, 5);
    expect(b.boss.interlude).toBe(true);
    expect(b.boss.cue).toBeDefined();
    run(b.s, (ENEMIES[b.boss.kind]!.warboss!.pause ?? 80) + 10);
    expect(b.boss.interlude).toBe(false);
  });
});

describe("Endless bosses", () => {
  it("a met world boss leads the tenth Endless wave and its fall doesn't end the run; with no boss met, none comes", () => {
    const tenth = (bosses: string[]) => {
      const s = createGarrison(battle({ endlessBosses: bosses }, [], { endless: true, mode: "endless", waves: 0, firstWaveAt: NEVER }));
      Object.assign(s.director, { wave: 9, nextAt: s.tick, lastWaveAt: s.tick });
      for (let i = 0; i < 400 && s.director.wave < 10; i += 1) stepGarrison(s, []);
      expect(s.director.wave).toBe(10);
      return s;
    };
    expect(tenth([]).warbossId).toBeUndefined();
    const s = tenth(["oc-boss-abomination"]);
    const boss = s.enemies.find((e) => e.id === s.warbossId)!;
    expect(boss?.kind).toBe("oc-boss-abomination");
    boss.bossPhase = ENEMIES[boss.kind]!.warboss!.phases.length;
    boss.hp = 1;
    boss.poisonUntil = NEVER;
    boss.poisonDps = 100;
    run(s, 30);
    expect(boss.dead).toBe(true);
    expect(s.warbossId).toBeUndefined();
    expect(s.director.done).toBe(false);
    expect(s.outcome ?? null).toBeNull();
  });

  it("the Endless config lists the world bosses met so far", () => {
    const make = (cleared: string[]) => {
      const level = { ...OC_LEVELS[0]!, id: "oc-endless", kind: "endless" as const, waves: 0 };
      const cfg = buildOcConfig(level, options({ cleared }));
      return cfg;
    };
    const withBoss = make(OC_LEVELS.filter((l) => l.world === 1).map((l) => l.id));
    expect(withBoss.oc?.endlessBosses).toContain("oc-boss-abomination");
    expect(make([]).oc?.endlessBosses ?? []).toHaveLength(0);
  });
});

describe("Psychic Elemental", () => {
  it("hypnotizes a cheap foe ahead in its lane, but not one costing more than its limit", () => {
    const s = createGarrison(battle({}, ["oc-psychic"], { firstWaveAt: 1 }));
    for (const slot of s.def.cards) slot.readyAt = 0;
    stepGarrison(s, [{ t: "place", card: "oc-psychic", lane: 2, col: 1, by: "def" }]);
    const events = run(s, 20 * 30);
    // CONTROL kind (a Shambler, cost 1) gets hypnotized.
    expect(events.some((ev) => ev.e === "charm")).toBe(true);
    // A battle with only a foe above the cost limit (Mammoth) sees no hypnosis.
    const big = Object.values(ENEMIES).find((d) => d.kind.startsWith("oc-") && d.cost > 6 && !d.boss && !d.smash && !d.flying && !d.structure && !d.warboss && d.hp > 0)!;
    const t = createGarrison(battle({}, ["oc-psychic"], { firstWaveAt: 1, enemies: [big.kind] }));
    for (const slot of t.def.cards) slot.readyAt = 0;
    stepGarrison(t, [{ t: "place", card: "oc-psychic", lane: 2, col: 1, by: "def" }]);
    expect(run(t, 20 * 30).some((ev) => ev.e === "charm")).toBe(false);
  });
});

describe("Satchel items", () => {
  const use = (id: string): SidedCommand => ({ t: "item", id, by: "def" });

  it("packed items ride into the battle as its Satchel (uses capped at perMatch, none in a raid); none packed, none there", () => {
    const level = OC_LEVELS[1]!;
    const plain = buildOcConfig(level, options());
    expect(plain.oc!.satchel).toBeUndefined();
    const packed = buildOcConfig(level, options({ satchel: [{ id: "war-chest", uses: 9 }, { id: "phoenix-feather", uses: 1 }, { id: "ore-cart", uses: 3 }] }));
    // (The Cart of Ore is no battle item: it is dropped.)
    expect(packed.oc!.satchel).toEqual([{ id: "war-chest", uses: itemPerMatch("war-chest") }, { id: "phoenix-feather", uses: 1 }]);
    // Nothing is applied at the start any more: the items wait to be used.
    expect(packed.startGold).toBe(plain.startGold);
    expect(packed.oc!.phoenix).toBeUndefined();
    expect(buildOcConfig(OC_RAIDS[0]!, options({ satchel: [{ id: "war-chest", uses: 2 }] })).oc!.satchel).toBeUndefined();
  });

  it("each item can be used only its perMatch times in a battle; a new battle starts afresh", () => {
    const limit = itemPerMatch("war-chest");
    expect(limit).toBeGreaterThan(0);
    // The config even claims more uses than the item allows: the simulation still holds it to perMatch.
    const cfg = battle({ satchel: [{ id: "war-chest", uses: limit + 3 }] }, [], { firstWaveAt: NEVER, startGold: 0 });
    const s = createGarrison(cfg);
    const gold = OC_ITEMS["war-chest"].effect.kind === "boost" ? OC_ITEMS["war-chest"].effect.gold! : 0;
    const events: GarrisonEvent[] = [];
    for (let i = 0; i < limit + 3; i += 1) events.push(...run(s, 1, [use("war-chest")]));
    expect(s.def.gold).toBe(gold * limit);
    expect(events.filter((ev) => ev.e === "item")).toHaveLength(limit);
    expect(itemsLeft(s, "war-chest")).toBe(0);
    expect(checkItem(s, "war-chest")).toEqual({ ok: false, reason: "No uses left in this battle." });
    // CONTROL: an item that wasn't packed can't be used at all.
    run(s, 1, [use("royal-treasury")]);
    expect(s.def.gold).toBe(gold * limit);
    // A new battle (a restart) has its uses back.
    const again = createGarrison(cfg);
    run(again, 1, [use("war-chest")]);
    expect(again.def.gold).toBe(gold);
    expect(itemsLeft(again, "war-chest")).toBe(limit - 1);
  });

  it("an item that would do nothing is refused and keeps its use (full mana); the Phoenix Feather works from its use on", () => {
    const s = createGarrison(battle({ satchel: [{ id: "mana-draught", uses: 1 }] }, [], { firstWaveAt: NEVER, startMana: MANA_MAX, spells: ["magic-arrow"] }));
    run(s, 1, [use("mana-draught")]);
    expect(itemsLeft(s, "mana-draught")).toBe(1);
    s.def.mana = 0;
    run(s, 1, [use("mana-draught")]);
    expect(s.def.mana).toBeGreaterThan(0);
    expect(itemsLeft(s, "mana-draught")).toBe(0);
    const rides = (feather: boolean) => {
      const t = createGarrison(battle({ satchel: [{ id: "phoenix-feather", uses: 1 }] }, [], { chargers: true, firstWaveAt: NEVER }));
      if (feather) run(t, 1, [use("phoenix-feather")]);
      const c = t.chargers.find((x) => x.lane === 2 && x.dmg === undefined)!;
      Object.assign(c, { state: "charging", x: 10.4, px: 10.4 });
      run(t, 5);
      return c.state;
    };
    expect(rides(false)).toBe("gone");
    expect(rides(true)).toBe("ready");
  });

  it("the Phoenix Feather sends a spent lane Champion back to the gate once", () => {
    const champion = (phoenix: boolean) => {
      const s = createGarrison(battle({ phoenix: phoenix || undefined }, [], { chargers: true }));
      const c = s.chargers.find((x) => x.lane === 2 && x.dmg === undefined)!;
      expect(c).toBeDefined();
      Object.assign(c, { state: "charging", x: 10.4, px: 10.4 });
      run(s, 5);
      return c;
    };
    expect(champion(false).state).toBe("gone");
    const back = champion(true);
    expect(back.state).toBe("ready");
    expect(back.reborn).toBe(true);
  });
});

describe("Magic Garden", () => {
  it("watering doubles a stage's growth; watering every stage ripens lush", () => {
    const seed = OC_SEEDS.clover;
    const stage = seed.growMs / 3;
    const dry = advancePlant(sow("clover", 0), stage / 2);
    const wet = advancePlant(water(sow("clover", 0), 0), stage / 2);
    expect(wet.grown).toBeCloseTo(dry.grown * 2);
    // A plant watered at each stage as it begins.
    let p = water(sow("clover", 0), 0);
    let t = 0;
    for (let i = 0; i < 3; i += 1) {
      t += stage / 2;
      p = water(advancePlant(p, t), t);
    }
    expect(harvestGems(p, t + 1)).toBe(seed.lush);
    const neglected = sow("clover", 0);
    expect(harvestGems(neglected, seed.growMs - 1)).toBe(0);
    expect(harvestGems(neglected, seed.growMs)).toBe(seed.gems);
  });
});

describe("the Forge", () => {
  it("a clean heat, perfect strikes and a perfect quench make a Masterwork; scorching and missing make it rough", () => {
    let g = newForgeGame(2, 7);
    // Pump into the band and hold it there until soaked.
    for (let i = 0; i < 400 && g.phase === "heat"; i += 1) g = forgeStep(g, 0.05, g.heat < 0.72);
    expect(g.phase).toBe("hammer");
    // Strike only when the marker is on the spot.
    for (let i = 0; i < 4000 && g.phase === "hammer"; i += 1) {
      g = forgeStep(g, 0.01, false);
      if (Math.abs(g.marker - g.spot) <= FORGE.perfectBand / 2 && g.recoil === 0) g = forgeAct(g);
    }
    expect(g.phase).toBe("quench");
    for (let i = 0; i < 400 && g.phase === "quench"; i += 1) {
      g = forgeStep(g, 0.01, false);
      if (Math.abs(g.temp - FORGE.quenchMid) <= 0.01) g = forgeAct(g);
    }
    expect(forgeQuality(forgeScore(g))).toBe("masterwork");
    // CONTROL: scorched (held past white-hot), then every strike a miss.
    let r = newForgeGame(2, 7);
    for (let i = 0; i < 400 && r.phase === "heat"; i += 1) r = forgeStep(r, 0.05, r.heat < 0.99 || r.scorch < 2);
    for (let i = 0; i < 400 && r.phase === "heat"; i += 1) r = forgeStep(r, 0.05, r.heat < 0.72);
    for (let i = 0; i < 4000 && r.phase === "hammer"; i += 1) {
      r = forgeStep(r, 0.01, false);
      if (r.recoil === 0 && Math.abs(r.marker - r.spot) > FORGE.goodBand * 1.5) r = forgeAct(r);
      if (r.strikes.length > 30) break;
    }
    expect(forgeQuality(forgeScore(r))).toBe("rough");
  });
});

describe("the Summoning Portal", () => {
  const pools = portalPools({ units: [{ kind: "oc-x", rarity: "UR" }, { kind: "oc-y", rarity: "SSR" }], chaos: [], artifacts: [], hero: { id: "h" } });

  it("pity makes the hundredth summon without a UR a UR", () => {
    expect(rollRarity({ pulls: 0, sinceSsr: 0, sinceUr: 0 }, 0.99)).toBe("R");
    expect(rollRarity({ pulls: 99, sinceSsr: 0, sinceUr: OC_UR_PITY - 1 }, 0.99)).toBe("UR");
  });

  it("a ten-summon always holds an SR or better, even when every roll would be an R", () => {
    const allR = summon(pools, { pulls: 0, sinceSsr: 0, sinceUr: 0 }, 9, () => 0.99);
    expect(allR.pulls.every((p) => p.rarity === "R")).toBe(true);
    const ten = summon(pools, { pulls: 0, sinceSsr: 0, sinceUr: 0 }, 10, () => 0.99);
    expect(ten.pulls.some((p) => p.rarity !== "R")).toBe(true);
    expect(ten.pity.pulls).toBe(10);
  });
});

describe("the campaign tally board", () => {
  it("ranks levels cleared first, then stars, and refuses impossible star counts", () => {
    expect(ocScore(ocCampaignSummary(10, 12))).toBeGreaterThan(ocScore(ocCampaignSummary(9, 27)));
    expect(ocSummaryProblem(ocCampaignSummary(10, 30), "2026-10-02")).toBeNull();
    expect(ocSummaryProblem(ocCampaignSummary(10, 31), "2026-10-02")).not.toBeNull();
    expect(ocSummaryProblem(ocCampaignSummary(0, 0), "2026-10-02")).not.toBeNull();
  });
});
