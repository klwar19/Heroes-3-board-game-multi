import type { PassiveDef } from "../engine/types";
import { MONSTER_PASSIVES } from "./passives-monsters";

/**
 * Battle passives. Jobs teach them at levels 1/3/5 (data/jobs.ts), characters
 * have one innate passive, gear can carry one, monsters list theirs
 * (data/passives-monsters.ts). The battle engine reads the fields directly.
 */
const LIST: PassiveDef[] = [
  // --- Character innates ---
  { id: "comicTiming", name: "Comic Timing", desc: "Below 30% HP: ATK and MAG +20%. The funniest part is always the comeback.", lowHp: { below: 0.3, stats: { atk: 20, mag: 20 } } },
  { id: "faeBlood", name: "Fae Blood", desc: "Can't be frozen. RES +10%.", immune: ["freeze"], stats: { res: 10 } },
  { id: "thunderCrossbow", name: "Thunder", desc: "Bowy's handmade crossbow: basic attacks reach 1 hex further.", range: 1 },
  { id: "oldWolf", name: "Old Wolf", desc: "+30% damage when striking a foe from behind.", backstab: 30 },
  { id: "ironhand", name: "Ironhand", desc: "DEF +10%; her counters hit at full strength.", stats: { def: 10 }, counter: 1 },
  { id: "warringPrincess", name: "Warring Princess", desc: "Her spear strikes back before a melee attacker's blow lands.", firstStrike: true },

  // --- Fighter ---
  { id: "weaponTraining", name: "Weapon Training", desc: "ATK +8%.", stats: { atk: 8 } },
  { id: "battleRhythm", name: "Battle Rhythm", desc: "Below 40% HP: ATK +25%.", lowHp: { below: 0.4, stats: { atk: 25 } } },
  { id: "veteran", name: "Veteran", desc: "Max HP +10%, crit chance +8%.", stats: { maxHp: 10 }, crit: 0.08 },
  // --- Guardian ---
  { id: "stalwart", name: "Stalwart", desc: "DEF +10%.", stats: { def: 10 } },
  { id: "counterguard", name: "Counterguard", desc: "Counterattacks hit at full strength.", counter: 1 },
  { id: "ironWill", name: "Iron Will", desc: "Once per battle, survives a lethal blow with 1 HP.", undying: true },
  // --- Ranger ---
  { id: "keenEye", name: "Keen Eye", desc: "LUK +15%, crit chance +5%.", stats: { luk: 15 }, crit: 0.05 },
  { id: "sureFooted", name: "Sure-Footed", desc: "Ignores terrain move costs and ground hazards.", sureFooted: true },
  { id: "eagleEye", name: "Eagle Eye", desc: "Ranged basic attacks reach 1 hex further; +15% damage from high ground.", range: 1, highGround: 15 },
  // --- Mage ---
  { id: "arcaneMind", name: "Arcane Mind", desc: "MAG +10%.", stats: { mag: 10 } },
  { id: "manaFlow", name: "Mana Flow", desc: "Restores 5% max MP at the start of each turn.", mpRegen: 0.05 },
  { id: "spellEcho", name: "Spell Economy", desc: "Skills cost 20% less MP.", mpSave: 20 },
  // --- Cleric ---
  { id: "devotion", name: "Devotion", desc: "Healing +15%.", healBoost: 15 },
  { id: "sanctuaryAura", name: "Sanctuary Aura", desc: "Allies within 2 hexes: RES +10%.", aura: { res: 10 } },
  { id: "mercy", name: "Mercy", desc: "Healing +15%; starts each battle with a shield of 10% max HP.", healBoost: 15, shieldStart: 0.1 },
  // --- Rogue ---
  { id: "nimble", name: "Nimble", desc: "SPD +10%; 8% chance to dodge physical attacks.", stats: { spd: 10 }, evasion: 0.08 },
  { id: "assassinsEdge", name: "Assassin's Edge", desc: "+40% damage when striking a foe from behind.", backstab: 40 },
  { id: "shadowstep", name: "Shadowstep", desc: "Move +1; foes can't retaliate against its melee attacks.", move: 1, noRetaliation: true },
  // --- Knight ---
  { id: "knightsOath", name: "Knight's Oath", desc: "Allies within 2 hexes: DEF +10%.", aura: { def: 10 } },
  { id: "lastBastion", name: "Last Bastion", desc: "Below 35% HP: DEF and RES +40%.", lowHp: { below: 0.35, stats: { def: 40, res: 40 } } },
  { id: "paladin", name: "Paladin", desc: "Heals 5% max HP at the start of each turn.", regen: 0.05 },
  // --- Berserker ---
  { id: "bloodlust", name: "Bloodlust", desc: "Heals 10% of the damage it deals.", lifesteal: 0.1 },
  { id: "frenzy", name: "Frenzy", desc: "Below 50% HP: ATK +40%, SPD +20%.", lowHp: { below: 0.5, stats: { atk: 40, spd: 20 } } },
  { id: "unstoppable", name: "Unstoppable", desc: "Immune to stun, sleep, freeze and root.", immune: ["stun", "sleep", "freeze", "root"] },
  // --- Sniper ---
  { id: "steadyAim", name: "Steady Aim", desc: "Crit chance +10%.", crit: 0.1 },
  { id: "deadeye", name: "Deadeye", desc: "Critical hits deal +50% more.", critDamage: 0.5 },
  { id: "overwatch", name: "Overwatch", desc: "Ranged basic attacks reach 1 hex further; +25% damage from high ground.", range: 1, highGround: 25 },
  // --- Elementalist ---
  { id: "elementalMastery", name: "Elemental Mastery", desc: "MAG +10%, RES +5%.", stats: { mag: 10, res: 5 } },
  { id: "burningSoul", name: "Burning Soul", desc: "Damaging hits may burn (20%).", onHit: { status: "burn", chance: 0.2, turns: 3 } },
  { id: "manaSurge", name: "Mana Surge", desc: "+1 AP every turn.", ap: 1 },
  // --- Sage ---
  { id: "wisdom", name: "Wisdom", desc: "MAG and RES +8%.", stats: { mag: 8, res: 8 } },
  { id: "serenity", name: "Serenity", desc: "Restores 6% max MP at the start of each turn.", mpRegen: 0.06 },
  { id: "periBlessing", name: "Peri's Favour", desc: "Allies within 2 hexes: SPD and RES +10%.", aura: { spd: 10, res: 10 } },
  // --- Assassin ---
  { id: "silentKiller", name: "Silent Killer", desc: "Crit chance +10%.", crit: 0.1 },
  { id: "venomous", name: "Venomous", desc: "Damaging hits may poison (35%).", onHit: { status: "poison", chance: 0.35, turns: 3 } },
  { id: "phantom", name: "Phantom", desc: "Move +1; 12% chance to dodge physical attacks.", move: 1, evasion: 0.12 },
  // --- Jester (Bin only) ---
  { id: "jestersLuck", name: "Jester's Luck", desc: "LUK +15%, crit chance +6%.", stats: { luk: 15 }, crit: 0.06 },
  { id: "improv", name: "Improv", desc: "Skills cost 15% less MP; SPD +10%.", mpSave: 15, stats: { spd: 10 } },
  { id: "plotArmor", name: "Plot Armor", desc: "Once per battle, survives a lethal blow with 1 HP. The audience would riot otherwise.", undying: true },

  // --- Gear ---
  { id: "keenEdge", name: "Keen Edge", desc: "Crit chance +5%.", crit: 0.05 },
  { id: "longReach", name: "Long Reach", desc: "Strikes back before a melee attacker's blow lands.", firstStrike: true },
  { id: "crushing", name: "Crushing", desc: "Damaging hits may stun (10%).", onHit: { status: "stun", chance: 0.1, turns: 1 } },
  { id: "longshot", name: "Longshot", desc: "Ranged basic attacks reach 1 hex further.", range: 1 },
  { id: "focus", name: "Focus", desc: "Skills cost 10% less MP.", mpSave: 10 },
  { id: "lightFoot", name: "Light Foot", desc: "5% chance to dodge physical attacks.", evasion: 0.05 },
  { id: "bulwark", name: "Bulwark", desc: "Starts each battle with a shield of 8% max HP.", shieldStart: 0.08 },
  { id: "manaWeave", name: "Mana Weave", desc: "Restores 3% max MP at the start of each turn.", mpRegen: 0.03 },
  { id: "vampireFang", name: "Vampire Fang", desc: "Heals 12% of the damage dealt.", lifesteal: 0.12 },
  { id: "thornGuard", name: "Thorn Guard", desc: "Returns 20% of melee damage taken.", thorns: 0.2 },
  { id: "swiftBoots", name: "Swift Boots", desc: "Move +1; ignores terrain move costs.", move: 1, sureFooted: true },
  { id: "emberHeart", name: "Ember Heart", desc: "Fire damage +15%; damaging hits may burn (15%).", elementBoost: { element: "fire", pct: 15 }, onHit: { status: "burn", chance: 0.15, turns: 3 } },
  { id: "frostHeart", name: "Frost Heart", desc: "Ice damage +15%; can't be frozen.", elementBoost: { element: "ice", pct: 15 }, immune: ["freeze"] },
  { id: "guardianSeal", name: "Guardian Seal", desc: "Starts each battle with a shield of 15% max HP.", shieldStart: 0.15 },
  { id: "phoenixFeather", name: "Phoenix Feather", desc: "Once per battle, survives a lethal blow with 1 HP.", undying: true },
  { id: "jestersBell", name: "Jester's Bell", desc: "+1 AP every turn.", ap: 1 }
];

export const PASSIVES: Record<string, PassiveDef> = Object.fromEntries([...LIST, ...MONSTER_PASSIVES].map((passive) => [passive.id, passive]));

export function passiveDef(id: string): PassiveDef {
  const def = PASSIVES[id];
  if (!def) throw new Error(`Unknown Restia passive ${id}`);
  return def;
}
