/**
 * Order & Chaos: the Daily Siege. Every UTC day rolls ONE siege from the date,
 * the same for every player: a theme world (its terrain and its horde), a
 * loaned company (seed packets, hero, spellbook, artifacts), the starting purse
 * and one twist. It is an Endless Siege underneath (waves forever, an artifact
 * pick after every great assault), built with the campaign's own
 * `buildOcConfig`, and the simulation's RNG is seeded from the day too.
 *
 * Fairness: nothing comes from the player's own progress. The loaned company is
 * drawn from what the campaign hands a player by the theme world's last battle
 * (troops, heroes, spells and artifacts won up to there), all at Barracks
 * level 1, so the day's horde is one the campaign was designed to be beaten
 * with. The same seed gives the same setup and the same opening; waves then
 * differ between players as their play feeds the same random stream
 * differently.
 */

import { CARDS, DEFENDERS, ENEMIES, TERRAINS, type BlessingId, type DefKind, type EnemyKind, type SpellId, type Terrain } from "../content";
import type { GarrisonConfig } from "../sim";
import {
  OC_ENDLESS, OC_HEROES, OC_SPELLBOOK_SIZE, OC_SURGE_SLOTS, OC_WORLDS,
  altarOpen, artifactSlots, buildOcConfig, unlockedArtifacts, unlockedHeroes, unlockedSpells, unlockedUnits,
  type OcHeroId, type OcLevel, type OcWorld
} from "./campaign";
import { OC_ULTIMATES } from "./roster";
import { ocDayKey, ocHash32, ocHex8 } from "./scores";

export const OC_DAILY_ID = "oc-daily";

/** The Daily Siege as a level card (its roster, terrain and twist are filled in per day by `ocDaily`). */
export const OC_DAILY_LEVEL: OcLevel = {
  ...OC_ENDLESS,
  id: OC_DAILY_ID,
  name: "Daily Siege",
  brief: "Today's orders, the same for everyone: a loaned company, one road and one horde. Waves never end; after every great assault, choose one of three artifacts."
};

export type OcDailyTwist = "herald" | "featured" | "graves" | "orbs" | "narrow" | "purse";

/** Each twist is a real setting of the siege (and says exactly what it changes). */
export const OC_DAILY_TWISTS: Record<OcDailyTwist, { name: string; text: (d: { herald?: string; featured?: string }) => string }> = {
  herald: { name: "Standard-bearer", text: (d) => `${d.herald ?? "A champion"} marches at the head of every great assault.` },
  featured: { name: "Guest of honour", text: (d) => `${d.featured ?? "A signature foe"} is sent with wave 2 and every great assault, whenever the wave is big enough to bring it.` },
  graves: { name: "Old graves", text: () => "Five graves stand on the lawn: they block planting, soak shots, and the dead climb out of them at every great assault." },
  orbs: { name: "Orb rain", text: () => "More foes carry Surge orbs (22% instead of 12%), and you start with 2 orbs." },
  narrow: { name: "Narrow road", text: () => "Only the three middle lanes are open." },
  purse: { name: "War chest", text: () => "You start with 250 extra gold." }
};

/** Loaned seed packets (the gold-maker included). */
const DAILY_DECK = 8;
const DAILY_SPELLS = 3;
const DAILY_ARTIFACTS = 2;

export type OcDaily = {
  day: string;
  /** The theme world. */
  world: number;
  worldName: string;
  /** The simulation seed (from the day). */
  seed: number;
  /** The siege as a level: Endless rules with the day's terrain, lanes, horde and twist. */
  level: OcLevel;
  cards: DefKind[];
  hero: OcHeroId;
  spells: SpellId[];
  artifacts: BlessingId[];
  /** Loaned troops that may Ascend (the theme world is past the Ascension Altar). */
  ultimates: DefKind[];
  twist: OcDailyTwist;
  twistText: string;
  /** Fingerprint of the whole setup: boards only compare runs of the same orders. */
  setup: string;
};

/** mulberry32 on a closure (the day's roll never touches the simulation's RNG). */
function roller(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const pick = <T,>(items: readonly T[], rand: () => number): T | undefined => (items.length ? items[Math.floor(rand() * items.length)] : undefined);

/** A troop that hits foes far down its lane (stand-off shooters stop 3-5 tiles out): a long shot, a snipe or an air strike. */
function reachesFar(kind: DefKind): boolean {
  const def = DEFENDERS[kind];
  return !!def && ((def.shot?.range ?? 0) >= 6 || !!def.snipe || !!def.airstrike);
}

/** A troop that can reach flying foes (anti-air shots or strikes, gales, snipers, air strikes). */
function hitsFlyers(kind: DefKind): boolean {
  const def = DEFENDERS[kind];
  return !!def && !!(def.shot?.air || def.melee?.air || def.gust || def.snipe || def.airstrike || def.quickdraw);
}

/** The levels a player has won on reaching the theme world's last battle. */
function stageCleared(world: OcWorld): string[] {
  const cleared: string[] = [];
  for (const w of OC_WORLDS) {
    if (w.id === world.id) {
      cleared.push(...w.levels.slice(0, -1).map((level) => level.id));
      break;
    }
    cleared.push(...w.levels.map((level) => level.id));
  }
  return cleared;
}

/** Worlds that can theme a siege: a real horde (not only a boss) and some troops to hold it with. */
function themeWorlds(): OcWorld[] {
  return OC_WORLDS.filter((world) => world.levels.some((level) => level.enemies.some((kind) => (ENEMIES[kind]?.cost ?? 0) > 0)));
}

/** Today's (or `day`'s) Daily Siege. Deterministic: the same day always rolls the same siege. */
export function ocDaily(day: string = ocDayKey()): OcDaily {
  const rand = roller(ocHash32(`oc-daily-setup:${day}`));
  const worlds = themeWorlds();
  const world = pick(worlds, rand) ?? OC_WORLDS[0]!;
  const cleared = stageCleared(world);

  // The horde: every foe the theme world's battles send (bosses and structures excluded).
  const enemies: EnemyKind[] = [];
  for (const level of world.levels) {
    for (const kind of level.enemies) {
      const def = ENEMIES[kind];
      if (def && def.cost > 0 && !def.boss && !def.structure && !enemies.includes(kind)) enemies.push(kind);
    }
  }
  const heralds = [...new Set(world.levels.map((level) => level.herald).filter((kind): kind is EnemyKind => !!kind && enemies.includes(kind)))];
  const featured = [...new Set(world.levels.map((level) => level.featured).filter((kind): kind is EnemyKind => !!kind && enemies.includes(kind)))];

  // The loaned company.
  const pool = unlockedUnits(cleared).filter((kind) => CARDS[kind]);
  const econ = pool.find((kind) => (DEFENDERS[kind]?.produce?.value ?? 0) > 0);
  const size = Math.min(DAILY_DECK, pool.length);
  const others = shuffled(pool.filter((kind) => kind !== econ), rand);
  let chosen = [...(econ ? [econ] : []), ...others.slice(0, size - (econ ? 1 : 0))];
  // Flyers in the horde: make sure something in the company can reach them.
  if (enemies.some((kind) => ENEMIES[kind]!.flying) && !chosen.some(hitsFlyers)) {
    const flak = others.find((kind) => !chosen.includes(kind) && hitsFlyers(kind));
    if (flak) chosen = [...chosen.slice(0, Math.max(econ ? 1 : 0, chosen.length - 1)), flak];
  }
  // Always something that reaches far down the lane (a company of walls and brawlers can't answer foes that stop short),
  // swapped in for the last card that is neither the gold-maker nor the only anti-air troop.
  if (!chosen.some(reachesFar)) {
    const far = others.find((kind) => !chosen.includes(kind) && reachesFar(kind));
    const onlyFlak = chosen.filter(hitsFlyers).length === 1 ? chosen.find(hitsFlyers) : undefined;
    const swap = [...chosen].reverse().find((kind) => kind !== econ && kind !== onlyFlak);
    if (far && swap) chosen = chosen.map((kind) => (kind === swap ? far : kind));
  }
  // The gold-maker first, then the company in campaign order.
  const cards = [...(econ && chosen.includes(econ) ? [econ] : []), ...pool.filter((kind) => kind !== econ && chosen.includes(kind))];

  const hero = pick(unlockedHeroes(cleared), rand) ?? "catherine";
  const passive = OC_HEROES[hero].passive;
  const spells = shuffled(unlockedSpells(cleared, 0).filter((id) => id !== OC_HEROES[hero].spell), rand).slice(0, Math.min(DAILY_SPELLS, OC_SPELLBOOK_SIZE));
  const artifacts = shuffled(unlockedArtifacts(cleared, 0).filter((id) => id !== passive), rand).slice(0, Math.min(DAILY_ARTIFACTS, artifactSlots(cleared, 0)));
  const ultimates = altarOpen(cleared) ? cards.filter((kind) => OC_ULTIMATES[kind]) : [];

  // The purse: what the theme world's ordinary battles start with.
  const purses = world.levels.filter((level) => level.kind !== "last-stand" && level.kind !== "conveyor" && !level.boss).map((level) => level.startGold);
  const baseGold = purses.length ? Math.min(...purses) : OC_DAILY_LEVEL.startGold;

  // One twist.
  const twists: OcDailyTwist[] = ["graves", "orbs", "narrow", "purse"];
  if (heralds.length) twists.push("herald");
  if (featured.length) twists.push("featured");
  const twist = pick(twists, rand) ?? "purse";
  const terrain: Terrain = TERRAINS[world.terrain] ? world.terrain : "grass";
  const level: OcLevel = {
    ...OC_DAILY_LEVEL,
    terrain,
    enemies,
    startGold: baseGold + (twist === "purse" ? 250 : 0),
    lanes: twist === "narrow" ? [1, 2, 3] : [...OC_DAILY_LEVEL.lanes],
    surgeChance: twist === "orbs" ? 0.22 : OC_DAILY_LEVEL.surgeChance,
    startSurges: twist === "orbs" ? 2 : OC_DAILY_LEVEL.startSurges
  };
  if (twist === "herald") level.herald = pick(heralds, rand);
  if (twist === "featured") level.featured = pick(featured, rand);
  if (twist === "graves") {
    const spots = shuffled(level.lanes.flatMap((lane) => [4, 5, 6, 7].map((col) => ({ lane, col }))), rand);
    const graves: { lane: number; col: number }[] = [];
    for (const spot of spots) {
      if (graves.length >= 5) break;
      // At most two graves a lane, so no lane is walled shut.
      if (graves.filter((g) => g.lane === spot.lane).length < 2) graves.push(spot);
    }
    level.graves = graves;
  }
  const seed = ocHash32(`oc-daily-run:${day}`) & 0x7fffffff;
  const names = { herald: level.herald ? ENEMIES[level.herald]?.name : undefined, featured: level.featured ? ENEMIES[level.featured]?.name : undefined };
  const setup = ocHex8(ocHash32(JSON.stringify({
    v: 1, day, world: world.id, seed, cards, hero, spells, artifacts, ultimates, terrain, lanes: level.lanes, enemies,
    herald: level.herald ?? null, featured: level.featured ?? null, gold: level.startGold, surge: [level.surgeChance, level.startSurges ?? 0], graves: level.graves ?? []
  })));
  return {
    day, world: world.id, worldName: world.name, seed, level, cards, hero, spells, artifacts, ultimates,
    twist, twistText: OC_DAILY_TWISTS[twist].text(names), setup
  };
}

/** The simulation config of a Daily Siege: the campaign's own builder, with the day's horde. */
export function buildDailyConfig(daily: OcDaily): GarrisonConfig {
  const config = buildOcConfig(daily.level, {
    seed: daily.seed,
    cards: daily.cards,
    hero: daily.hero,
    artifacts: daily.artifacts,
    levels: {},
    cleared: [],
    spells: daily.spells,
    ultimates: daily.ultimates,
    crowns: 1,
    surges: OC_SURGE_SLOTS
  });
  // Endless draws its horde from the foes the player has met; the Daily Siege brings the day's.
  return { ...config, enemies: daily.level.enemies.length ? [...daily.level.enemies] : config.enemies };
}
