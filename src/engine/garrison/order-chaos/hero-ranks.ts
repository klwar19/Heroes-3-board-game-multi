/**
 * Order & Chaos hero ranks. A hero joins weak and grows: each rank, forged at
 * the Forge with Ore and Gems, strengthens the hero's own passive and
 * signature spell. Rank OC_HERO_MAX_RANK is the hero at full strength (the
 * numbers the Daily Siege uses and the plain hero blurbs quote).
 *
 * The simulation reads the powers (sim.ts blessingPower / heroSpell); the
 * texts below quote exactly the numbers it uses. Kept free of imports so the
 * simulation can read it cheaply.
 */

export const OC_HERO_MAX_RANK = 5;

/** The hero a battle is fought with and the rank it has reached (`OcRules.hero`). */
export type OcHeroRank = { passive: string; spell: string; rank: number };

export function clampHeroRank(rank: number): number {
  return Math.max(1, Math.min(OC_HERO_MAX_RANK, Math.floor(Number.isFinite(rank) ? rank : 1)));
}

/** How much of the hero's passive is in play: 70% at rank 1, full at rank 5. */
export function heroPassivePower(rank: number): number {
  return 0.7 + 0.075 * (clampHeroRank(rank) - 1);
}

/** How strong the hero's signature spell is: 70% at rank 1, full at rank 5. */
export function heroSpellPower(rank: number): number {
  return 0.7 + 0.075 * (clampHeroRank(rank) - 1);
}

/** Ore and Gems to forge a hero up to `rank` (2..5). */
export const OC_RANK_COST: Readonly<Record<number, { ore: number; gems: number }>> = {
  2: { ore: 6, gems: 4 },
  3: { ore: 12, gems: 10 },
  4: { ore: 20, gems: 20 },
  5: { ore: 30, gems: 35 }
};

/** "12.5", "3", "23.3": at most one decimal, no trailing zero. */
const num = (n: number) => String(Math.round(n * 10) / 10);

/** The hero's passive at a rank, in words, with the numbers the simulation uses. */
export function heroPassiveText(passive: string, rank: number): string {
  const p = heroPassivePower(rank);
  switch (passive) {
    case "necklace-of-swiftness": return `Leadership: your troops act ${num(20 * p)}% faster.`;
    case "elven-bow": return `Archery: arrows, spears and frost shots deal ${num(30 * p)}% more.`;
    case "orb-of-mana": return `Sorcery: mana regenerates ${num(100 * p)}% faster, +${Math.round(10 * p)} max mana.`;
    case "vial-of-lifeblood": return `First Aid: your troops regenerate ${num(5 * p)} HP a second.`;
    case "dragon-scale-shield": return `Armorer: the horde deals ${num(25 * p)}% less damage.`;
    case "estates": return `Logistics: gold coins collect themselves ${num(1 + 4 * (1 - p))} s after landing.`;
    case "crown-of-dragontooth": return `Valor: Ascension crowns build ${num(50 * p)}% faster.`;
    case "charm-of-mana": return `Fire Magic: spells recover ${num(40 * p)}% faster.`;
    // The Summoning Portal hero (gacha-content.ts); 20% = content.ts LUCK_CHANCE.
    case "luck": return `Luck: every attack your troops make (a shot, a melee strike, a lightning bolt, a beam, a bomb, a dash or a slam) has a ${num(20 * p)}% chance to be lucky (double damage).`;
    default: return "";
  }
}

/** The hero's signature spell at a rank, in words ("" for a spell that isn't a hero's). */
export function heroSpellText(spell: string, rank: number): string {
  const s = heroSpellPower(rank);
  const n = (value: number) => Math.round(value * s);
  switch (spell) {
    case "royal-charge": return `A Champion thunders down the chosen lane: ${n(1200)} to every foe in it.`;
    case "rain-of-arrows": return `Five volleys of ${n(90)} over 2.5 s on a 3×3 area — flyers too.`;
    case "chain-lightning": return `${n(600)} to one foe, then leaps to four more nearby, halving each time.`;
    case "prayer": return `Heals every defender for ${n(300)} and hastens them by 30% for 10 s.`;
    case "earthen-bulwark": return `Raises stone walls (2500 HP, ${num(30 * s)} s) on the empty tiles of the chosen column in three lanes.`;
    case "supply-drop": return `A crate falls from the sky: one Surge orb. Recovers in ${Math.round(40 / s)} s.`;
    case "frenzy": return `Every melee troop strikes twice as hard for ${num(10 * s)} s.`;
    case "inferno": return `Walls of fire sweep the chosen lane and both beside it: ${n(700)} to every foe in them.`;
    // The Summoning Portal hero (gacha-content.ts); 10 gold = content.ts FORTUNE_GOLD.
    case "fortune": return `For ${num(8 * s)} s every attack your troops make (a shot, a melee strike, a lightning bolt, a beam, a bomb, a dash or a slam) is lucky (double damage), and every foe slain drops 10 gold.`;
    default: return "";
  }
}
