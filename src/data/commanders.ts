/**
 * Wake of Gods Commanders — content/reference data for the card renderer.
 *
 * DESIGN/ART DATA ONLY. No engine gameplay exists yet (see docs/wog-commanders-
 * plan.md and docs/wog-mod.md). This module feeds the CommanderCard renderer:
 *   - the roster (name, faction, HD art path, signature abilities),
 *   - the fixed BEGINNING stat line (Attack 2 / Defense 1 / Health 4 / Speed 5)
 *     used to seed the card's DYNAMIC, upgradeable stat numbers (the numbers are
 *     NOT baked into the art — CommanderCard overlays them so they can change as
 *     the commander levels up), and
 *   - the WoG primary/secondary skill tables (comm3) for the growth panel.
 *
 * Reference (fan pages, HTTP-only):
 *   http://www.heroesofmightandmagic.com/wakeofgods/comm2.shtml  (sorts)
 *   http://www.heroesofmightandmagic.com/wakeofgods/comm3.shtml  (skills)
 */

export const COMMANDER_SLUGS = [
  "paladin", "hierophant", "temple_guardian", "succubus", "brute",
  "soul_eater", "ogre_leader", "shaman", "astral_spirit",
  "corsair", "factory", "bulwark"
] as const;

export type CommanderSlug = (typeof COMMANDER_SLUGS)[number];

export interface CommanderDefinition {
  slug: CommanderSlug;
  name: string;
  faction: string;
  /** true for the three non-WoG originals (Cove/Factory/Bulwark) — abilities provisional. */
  original?: boolean;
  /** Two signature abilities (printed on the card face). */
  abilities: string[];
  /** Built card asset (frame + art only; name, abilities, and stats are overlaid). */
  cardImage: string;
}

/** Fixed beginning stats for EVERY commander (user-specified). Editable at runtime. */
export const COMMANDER_BASE_STATS = { attack: 2, defense: 1, health: 4, speed: 5 } as const;
export type CommanderStats = { attack: number; defense: number; health: number; speed: number };

export const commanderDefinitions: Record<CommanderSlug, CommanderDefinition> = {
  paladin: {
    slug: "paladin", name: "Paladin", faction: "Castle",
    abilities: ["Wise: gains 150% of the Hero's experience.", "Cure: may cast Cure."],
    cardImage: "/assets/units-commander-paladin.webp"
  },
  hierophant: {
    slug: "hierophant", name: "Hierophant", faction: "Rampart",
    abilities: ["First Aid Master: First Aid Tents = level.", "Shield: may cast Shield (duration = Power)."],
    cardImage: "/assets/units-commander-hierophant.webp"
  },
  temple_guardian: {
    slug: "temple_guardian", name: "Temple Guardian", faction: "Tower",
    abilities: ["Mana Magician: restores lost mana (20% + 5%/level).", "Precision: may cast Precision (duration = Power)."],
    cardImage: "/assets/units-commander-temple_guardian.webp"
  },
  succubus: {
    slug: "succubus", name: "Succubus", faction: "Inferno",
    abilities: ["Charming: steals 5% + (level-1)/2 of neutral stacks.", "Fire Shield: may cast Fire Shield (duration = Power)."],
    cardImage: "/assets/units-commander-succubus.webp"
  },
  brute: {
    slug: "brute", name: "Brute", faction: "Dungeon",
    abilities: ["Soul Reformer: converts 50% of battle XP to gold.", "Bloodlust: may cast Bloodlust (duration = Power)."],
    cardImage: "/assets/units-commander-brute.webp"
  },
  soul_eater: {
    slug: "soul_eater", name: "Soul Eater", faction: "Necropolis",
    abilities: ["Undead: counts as an undead creature.", "Animate Dead: revives Level 1-5 creatures."],
    cardImage: "/assets/units-commander-soul_eater.webp"
  },
  ogre_leader: {
    slug: "ogre_leader", name: "Ogre Leader", faction: "Stronghold",
    abilities: ["Ballista Master: adds ballistas (level/4 + 1).", "Stone Skin: may cast Stone Skin (duration = Power)."],
    cardImage: "/assets/units-commander-ogre_leader.webp"
  },
  shaman: {
    slug: "shaman", name: "Shaman", faction: "Fortress",
    abilities: ["Superior Combat: 150% of the Hero's Attack & Defense.", "Haste: may cast Haste (Speed +5)."],
    cardImage: "/assets/units-commander-shaman.webp"
  },
  astral_spirit: {
    slug: "astral_spirit", name: "Astral Spirit", faction: "Conflux",
    abilities: ["Pacifist: 5% + (level-1)/2 enemies flee (max 20%).", "Counterstrike: may cast Counterstrike (duration = Power)."],
    cardImage: "/assets/units-commander-astral_spirit.webp"
  },
  corsair: {
    slug: "corsair", name: "Corsair", faction: "Cove", original: true,
    abilities: ["Plunder: bonus gold after a won combat.  [provisional]", "Fortune: may cast Fortune."],
    cardImage: "/assets/units-commander-corsair.webp"
  },
  factory: {
    slug: "factory", name: "Engineer", faction: "Factory", original: true,
    abilities: ["Mechanist: provides an additional War Machine.  [provisional]", "Precision: may cast Precision."],
    cardImage: "/assets/units-commander-factory.webp"
  },
  bulwark: {
    slug: "bulwark", name: "Frost Warlord", faction: "Bulwark", original: true,
    abilities: ["Frostborn: chills enemies, lowering Speed.  [provisional]", "Stone Skin: may cast Stone Skin."],
    cardImage: "/assets/units-commander-bulwark.webp"
  }
};

// ---------------------------------------------------------------------------
// Growth layer (comm3): 6 primary skills, 5 tiers each; a commander takes 4 of 6.
// These are the WoG PC-game reference values (shown in the growth panel). The
// board-game adaptation of these numbers is a future tuning decision — the card's
// live Attack/Defense/Health/Speed are edited directly for now.
// ---------------------------------------------------------------------------

export const SKILL_TIERS = ["none", "Basic", "Advanced", "Expert", "Master", "Grandmaster"] as const;
export type SkillTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface PrimarySkill {
  key: "attack" | "defense" | "health" | "damage" | "power" | "speed";
  label: string;
  /** WoG reference value at each tier (index 0 = no skill). */
  tiers: string[];
}

export const PRIMARY_SKILLS: PrimarySkill[] = [
  { key: "attack", label: "Attack", tiers: ["5", "7", "10", "14", "20", "30"] },
  { key: "defense", label: "Defense", tiers: ["5", "9", "15", "23", "35", "55"] },
  { key: "health", label: "Hit Points", tiers: ["base", "+10%", "+25%", "+45%", "+70%", "+100%"] },
  { key: "damage", label: "Damage", tiers: ["base", "+10%", "+25%", "+45%", "+70%", "+100%"] },
  { key: "power", label: "Magic Power", tiers: ["1", "2", "4", "7", "15", "30"] },
  { key: "speed", label: "Speed", tiers: ["4", "5", "6", "7", "8", "10"] }
];

/** Secondary skills unlock when BOTH named primaries reach Master (tier 4). */
export interface SecondarySkill {
  tag: string;
  name: string;
  requires: [PrimarySkill["key"], PrimarySkill["key"]];
}

export const SECONDARY_SKILLS: SecondarySkill[] = [
  { tag: "N", name: "No Enemy Retaliation", requires: ["attack", "power"] },
  { tag: "S", name: "Can Shoot", requires: ["attack", "speed"] },
  { tag: "M", name: "Maximum damage always", requires: ["attack", "damage"] },
  { tag: "E", name: "Endless Retaliation", requires: ["defense", "health"] },
  { tag: "D", name: "Reduce Enemy Defense by 50%", requires: ["attack", "defense"] },
  { tag: "O", name: "Fearsome", requires: ["attack", "health"] },
  { tag: "A", name: "Strikes all enemies around", requires: ["defense", "damage"] },
  { tag: "I", name: "Permanent Fire Shield", requires: ["defense", "power"] },
  { tag: "B", name: "30% chance to Block Physical Damage", requires: ["defense", "speed"] },
  { tag: "2", name: "Attack twice", requires: ["health", "damage"] },
  { tag: "P", name: "Melee 50% chance to Paralyze (3 rounds)", requires: ["health", "power"] },
  { tag: "R", name: "Regeneration 50 HP every turn", requires: ["health", "speed"] },
  { tag: "G", name: "DeathStare", requires: ["damage", "power"] },
  { tag: "F", name: "Ignore Obstacles (fly)", requires: ["power", "speed"] },
  { tag: "C", name: "Champion Distance Bonus", requires: ["damage", "speed"] }
];
