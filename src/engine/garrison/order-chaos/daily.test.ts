import { describe, expect, it } from "vitest";
import { DEFENDERS, ENEMIES } from "../content";
import {
  OC_HEROES, OC_WORLDS, buildOcConfig, unlockedArtifacts, unlockedHeroes, unlockedSpells, unlockedUnits
} from "./campaign";
import { OC_DAILY_ID, buildDailyConfig, ocDaily } from "./daily";
import { ocShiftDay } from "./scores";

const DAYS = Array.from({ length: 30 }, (_, i) => ocShiftDay("2026-10-01", i));

/** What a player holds on reaching world `id`'s last battle (the loaned company's source). */
function stage(id: number): string[] {
  const out: string[] = [];
  for (const world of OC_WORLDS) {
    if (world.id === id) return [...out, ...world.levels.slice(0, -1).map((level) => level.id)];
    out.push(...world.levels.map((level) => level.id));
  }
  return out;
}

const hitsFlyers = (kind: string) => {
  const def = DEFENDERS[kind];
  // (A Gunslinger's quickdraw reaches flyers too.)
  return !!def && !!(def.shot?.air || def.melee?.air || def.gust || def.snipe || def.airstrike || def.quickdraw);
};

describe("Daily Siege generator", () => {
  it("rolls the same siege for everyone on the same day, and different sieges on different days", () => {
    expect(ocDaily("2026-10-01")).toEqual(ocDaily("2026-10-01"));
    const setups = new Set(DAYS.map((day) => ocDaily(day).setup));
    const worlds = new Set(DAYS.map((day) => ocDaily(day).world));
    expect(setups.size).toBe(DAYS.length);
    expect(worlds.size).toBeGreaterThan(2);
  });

  it("loans only what the campaign hands a player by the theme world's last battle", () => {
    for (const day of DAYS) {
      const d = ocDaily(day);
      const cleared = stage(d.world);
      const world = OC_WORLDS.find((entry) => entry.id === d.world)!;
      expect(d.level.id).toBe(OC_DAILY_ID);
      expect(d.cards.length).toBeGreaterThan(1);
      expect(d.cards.length).toBeLessThanOrEqual(8);
      expect(new Set(d.cards).size).toBe(d.cards.length);
      expect(DEFENDERS[d.cards[0]!]?.produce?.value ?? 0).toBeGreaterThan(0);
      const units = unlockedUnits(cleared);
      for (const kind of d.cards) expect(units).toContain(kind);
      expect(unlockedHeroes(cleared)).toContain(d.hero);
      for (const id of d.spells) expect(unlockedSpells(cleared, 0)).toContain(id);
      for (const id of d.artifacts) expect(unlockedArtifacts(cleared, 0)).toContain(id);
      // The horde is the theme world's own, drafted foes only.
      const worldFoes = new Set(world.levels.flatMap((level) => level.enemies));
      expect(d.level.enemies.length).toBeGreaterThan(0);
      for (const kind of d.level.enemies) {
        expect(worldFoes.has(kind)).toBe(true);
        expect(ENEMIES[kind]!.cost).toBeGreaterThan(0);
        expect(ENEMIES[kind]!.boss).toBeFalsy();
      }
      if (d.level.enemies.some((kind) => ENEMIES[kind]!.flying) && units.some(hitsFlyers)) expect(d.cards.some(hitsFlyers)).toBe(true);
    }
  });

  it("applies each twist to the real siege settings", () => {
    const seen = new Set<string>();
    for (const day of Array.from({ length: 120 }, (_, i) => ocShiftDay("2026-10-01", i))) {
      const d = ocDaily(day);
      seen.add(d.twist);
      if (d.twist === "narrow") expect(d.level.lanes).toEqual([1, 2, 3]);
      else expect(d.level.lanes).toEqual([0, 1, 2, 3, 4]);
      if (d.twist === "orbs") expect([d.level.surgeChance, d.level.startSurges]).toEqual([0.22, 2]);
      if (d.twist === "graves") {
        expect(d.level.graves).toHaveLength(5);
        for (const lane of [0, 1, 2, 3, 4]) expect(d.level.graves!.filter((g) => g.lane === lane).length).toBeLessThanOrEqual(2);
        for (const g of d.level.graves!) expect(g.col).toBeGreaterThanOrEqual(4);
      } else expect(d.level.graves).toBeUndefined();
      if (d.twist === "herald") expect(d.level.enemies).toContain(d.level.herald);
      else expect(d.level.herald).toBeUndefined();
      if (d.twist === "featured") expect(d.level.enemies).toContain(d.level.featured);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("builds the siege with the campaign's builder, the day's horde and the day's seed", () => {
    const d = ocDaily("2026-10-01");
    const config = buildDailyConfig(d);
    expect(config.mode).toBe("endless");
    expect(config.endless).toBe(true);
    expect(config.seed).toBe(d.seed);
    expect(config.levelId).toBe(OC_DAILY_ID);
    expect(config.terrain).toBe(d.level.terrain);
    expect(config.lanes).toEqual(d.level.lanes);
    expect(config.startGold).toBe(d.level.startGold);
    // Loaned troops come untrained (Barracks level 1: plain kinds).
    expect(config.cards).toEqual(d.cards);
    expect(config.spells[0]).toBe(OC_HEROES[d.hero].spell);
    expect(config.oc?.blessings).toEqual([OC_HEROES[d.hero].passive, ...d.artifacts]);
    expect(config.enemies).toEqual(d.level.enemies);
    // CONTROL: the Endless builder alone would draft from the foes the (empty) player met.
    const plain = buildOcConfig(d.level, { seed: d.seed, cards: d.cards, hero: d.hero, artifacts: d.artifacts, levels: {}, cleared: [], spells: d.spells, ultimates: d.ultimates, crowns: 1, surges: 2 });
    expect(plain.enemies).not.toEqual(config.enemies);
  });

  it("always loans something that reaches far down the lane, without losing the gold-maker or the only anti-air troop", () => {
    const reachesFar = (kind: string) => {
      const def = DEFENDERS[kind];
      return !!def && ((def.shot?.range ?? 0) >= 6 || !!def.snipe || !!def.airstrike);
    };
    let checked = 0;
    for (let i = 0; i < 60; i += 1) {
      const d = ocDaily(ocShiftDay("2026-10-01", i));
      const units = unlockedUnits(stage(d.world));
      if (!units.some(reachesFar)) continue;
      checked += 1;
      expect(d.cards.some(reachesFar)).toBe(true);
      expect(DEFENDERS[d.cards[0]!]?.produce?.value ?? 0).toBeGreaterThan(0);
      if (d.level.enemies.some((kind) => ENEMIES[kind]!.flying) && units.some(hitsFlyers)) expect(d.cards.some(hitsFlyers)).toBe(true);
    }
    expect(checked).toBeGreaterThan(30);
  });
});
