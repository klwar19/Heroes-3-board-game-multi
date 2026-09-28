import type { SkillDef } from "../engine/types";

/**
 * Battle skills. `power` multiplies the attacker's ATK (physical) or MAG
 * (magic / heal). Ranges are in hexes from the caster; area skills hit every
 * unit within `radius` of the chosen hex (friend or foe for damage: only foes).
 */
const LIST: SkillDef[] = [
  // --- Bin (Otherworlder) ---
  { id: "analyze", name: "Analyze", desc: "The System scans a foe: reveals its level, stats and weaknesses for good.", mp: 0, target: "enemy", range: 6, kind: "analyze", anim: "cast" },
  { id: "powerSlash", name: "Power Slash", desc: "A committed sword stroke. 1.6x physical.", mp: 3, target: "enemy", range: 1, kind: "physical", power: 1.6, anim: "attack" },
  { id: "quickPatch", name: "Quick Patch", desc: "Admin-heal an ally within 2 hexes.", mp: 5, target: "ally", range: 2, kind: "heal", power: 1.6, field: true, anim: "cast" },
  { id: "crossSlash", name: "Cross Slash", desc: "Two cuts in one. 2.2x physical.", mp: 7, target: "enemy", range: 1, kind: "physical", power: 2.2, anim: "attack" },
  { id: "overclock", name: "Overclock", desc: "An ally gains +25% ATK and +20% SPD for 3 turns.", mp: 8, target: "ally", range: 3, kind: "buff", mods: [{ stat: "atk", pct: 25, turns: 3 }, { stat: "spd", pct: 20, turns: 3 }], anim: "cast" },
  { id: "adminStrike", name: "Admin Strike", desc: "Light-element 2.8x physical strike.", mp: 12, target: "enemy", range: 1, kind: "physical", element: "light", power: 2.8, anim: "attack" },
  { id: "sudo", name: "Admin Override", desc: "Heals every ally and clears their ailments.", mp: 20, target: "allAllies", range: 0, kind: "heal", power: 1.4, cure: true, field: true, anim: "cast" },

  // --- Hikari (Goddess of Dawn) ---
  { id: "heal", name: "Heal", desc: "Restore an ally's HP.", mp: 4, target: "ally", range: 3, kind: "heal", power: 1.8, field: true, anim: "cast" },
  { id: "holyLight", name: "Holy Light", desc: "Light magic, 1.4x.", mp: 4, target: "enemy", range: 4, kind: "magic", element: "light", power: 1.4, anim: "cast" },
  { id: "blessing", name: "Blessing", desc: "An ally gains +25% DEF and RES for 3 turns.", mp: 5, target: "ally", range: 3, kind: "buff", mods: [{ stat: "def", pct: 25, turns: 3 }, { stat: "res", pct: 25, turns: 3 }], anim: "cast" },
  { id: "healAll", name: "Dawn Chorus", desc: "Heal every ally.", mp: 10, target: "allAllies", range: 0, kind: "heal", power: 1.1, field: true, anim: "cast" },
  { id: "radiance", name: "Radiance", desc: "Light magic 1.6x around the target hex.", mp: 10, target: "area", range: 4, radius: 1, kind: "magic", element: "light", power: 1.6, anim: "cast" },
  { id: "resurrection", name: "Resurrection", desc: "Revive a fallen ally with 50% HP.", mp: 16, target: "ally", range: 2, kind: "revive", power: 0.5, field: true, anim: "cast" },
  { id: "dawnPrayer", name: "Dawn Prayer", desc: "Clear ailments from every ally.", mp: 6, target: "allAllies", range: 0, kind: "heal", power: 0.4, cure: true, field: true, anim: "cast" },
  { id: "sunburst", name: "Sunburst", desc: "Light magic 1.3x on every foe.", mp: 18, target: "allEnemies", range: 0, kind: "magic", element: "light", power: 1.3, anim: "cast" },
  { id: "divineGrace", name: "Divine Grace", desc: "Heal every ally 2.0x and raise DEF 30% for 3 turns.", mp: 24, target: "allAllies", range: 0, kind: "heal", power: 2.0, mods: [{ stat: "def", pct: 30, turns: 3 }], field: true, anim: "cast" },

  // --- Mina (Alchemist) ---
  { id: "acidFlask", name: "Acid Flask", desc: "Earth magic 1.2x; lowers DEF 25% for 2 turns.", mp: 4, target: "enemy", range: 4, kind: "magic", element: "earth", power: 1.2, mods: [{ stat: "def", pct: -25, turns: 2 }], anim: "attack" },
  { id: "firstAid", name: "First Aid", desc: "Patch up an ally within 2 hexes.", mp: 3, target: "ally", range: 2, kind: "heal", power: 1.3, field: true, anim: "cast" },
  { id: "flameFlask", name: "Flame Flask", desc: "Fire magic 1.2x around the target; may burn.", mp: 6, target: "area", range: 4, radius: 1, kind: "magic", element: "fire", power: 1.2, status: { id: "burn", chance: 0.3, turns: 3 }, anim: "attack" },
  { id: "frostFlask", name: "Frost Flask", desc: "Ice magic 1.3x around the target; may freeze.", mp: 8, target: "area", range: 4, radius: 1, kind: "magic", element: "ice", power: 1.3, status: { id: "freeze", chance: 0.25, turns: 1 }, anim: "attack" },
  { id: "catalyst", name: "Catalyst", desc: "An ally gains +40% MAG for 3 turns.", mp: 6, target: "ally", range: 3, kind: "buff", mods: [{ stat: "mag", pct: 40, turns: 3 }], anim: "cast" },
  { id: "philosophersMist", name: "Philosopher's Mist", desc: "Heal every ally 1.2x and clear ailments.", mp: 16, target: "allAllies", range: 0, kind: "heal", power: 1.2, cure: true, field: true, anim: "cast" },
  { id: "sleepGas", name: "Sleep Gas", desc: "May put foes around the target to sleep.", mp: 6, target: "area", range: 4, radius: 1, kind: "debuff", status: { id: "sleep", chance: 0.6, turns: 2 }, anim: "attack" },
  { id: "thunderFlask", name: "Thunder Flask", desc: "Wind magic 1.6x around the target; may stun.", mp: 12, target: "area", range: 4, radius: 1, kind: "magic", element: "wind", power: 1.6, status: { id: "stun", chance: 0.3, turns: 1 }, anim: "attack" },
  { id: "grandTransmute", name: "Grand Transmutation", desc: "Earth magic 1.8x on every foe.", mp: 22, target: "allEnemies", range: 0, kind: "magic", element: "earth", power: 1.8, anim: "cast" },

  // --- Tove (Blacksmith) ---
  { id: "hammerBlow", name: "Hammer Blow", desc: "Earth-element 1.6x physical.", mp: 4, target: "enemy", range: 1, kind: "physical", element: "earth", power: 1.6, anim: "attack" },
  { id: "armorBreak", name: "Armor Break", desc: "1.2x physical; lowers DEF 30% for 3 turns.", mp: 5, target: "enemy", range: 1, kind: "physical", power: 1.2, mods: [{ stat: "def", pct: -30, turns: 3 }], anim: "attack" },
  { id: "groundSlam", name: "Ground Slam", desc: "Earth 1.3x physical on every foe next to Tove.", mp: 8, target: "area", range: 0, radius: 1, kind: "physical", element: "earth", power: 1.3, anim: "cast" },
  { id: "forgeFire", name: "Forge Fire", desc: "Fire-element 2.0x physical.", mp: 9, target: "enemy", range: 1, kind: "physical", element: "fire", power: 2.0, anim: "attack" },
  { id: "titanSmash", name: "Titan Smash", desc: "Earth 2.8x physical; may stun.", mp: 14, target: "enemy", range: 1, kind: "physical", element: "earth", power: 2.8, status: { id: "stun", chance: 0.3, turns: 1 }, anim: "attack" },
  { id: "sharpen", name: "Whetstone", desc: "An ally gains +30% ATK for 3 turns.", mp: 4, target: "ally", range: 2, kind: "buff", mods: [{ stat: "atk", pct: 30, turns: 3 }], anim: "cast" },
  { id: "anvilGuard", name: "Anvil Guard", desc: "Tove gains +60% DEF for 2 turns.", mp: 5, target: "self", range: 0, kind: "buff", mods: [{ stat: "def", pct: 60, turns: 2 }], anim: "cast" },
  { id: "meteorHammer", name: "Meteor Hammer", desc: "Earth 3.0x physical around the target.", mp: 20, target: "area", range: 1, radius: 1, kind: "physical", element: "earth", power: 3.0, anim: "attack" },

  // --- Seren (Knight) ---
  { id: "lanceThrust", name: "Lance Thrust", desc: "1.5x physical from 2 hexes away.", mp: 3, target: "enemy", range: 2, kind: "physical", power: 1.5, anim: "attack" },
  { id: "guardUp", name: "Guard Up", desc: "Seren gains +50% DEF for 3 turns.", mp: 3, target: "self", range: 0, kind: "buff", mods: [{ stat: "def", pct: 50, turns: 3 }], anim: "cast" },
  { id: "holyLance", name: "Holy Lance", desc: "Light-element 1.9x physical, 2 hexes.", mp: 7, target: "enemy", range: 2, kind: "physical", element: "light", power: 1.9, anim: "attack" },
  { id: "shieldWall", name: "Shield Wall", desc: "Every ally gains +30% DEF for 3 turns.", mp: 10, target: "allAllies", range: 0, kind: "buff", mods: [{ stat: "def", pct: 30, turns: 3 }], anim: "cast" },
  { id: "valiantCharge", name: "Valiant Charge", desc: "2.6x physical, 2 hexes; may stun.", mp: 12, target: "enemy", range: 2, kind: "physical", power: 2.6, status: { id: "stun", chance: 0.25, turns: 1 }, anim: "attack" },
  { id: "rally", name: "Rally", desc: "Every ally gains +20% ATK for 3 turns.", mp: 8, target: "allAllies", range: 0, kind: "buff", mods: [{ stat: "atk", pct: 20, turns: 3 }], anim: "cast" },
  { id: "griffinDive", name: "Griffin Dive", desc: "Wind-element 2.4x physical, 3 hexes.", mp: 12, target: "enemy", range: 3, kind: "physical", element: "wind", power: 2.4, anim: "attack" },
  { id: "erathianOath", name: "Erathian Oath", desc: "Heal every ally and raise DEF/RES 40% for 3 turns.", mp: 20, target: "allAllies", range: 0, kind: "heal", power: 1.0, mods: [{ stat: "def", pct: 40, turns: 3 }, { stat: "res", pct: 40, turns: 3 }], anim: "cast" },

  // --- Nell (Ranger) ---
  { id: "aimedShot", name: "Aimed Shot", desc: "1.6x physical, 5 hexes.", mp: 3, target: "enemy", range: 5, kind: "physical", power: 1.6, anim: "attack" },
  { id: "poisonArrow", name: "Poison Arrow", desc: "1.1x physical; likely poisons.", mp: 4, target: "enemy", range: 4, kind: "physical", power: 1.1, status: { id: "poison", chance: 0.7, turns: 3 }, anim: "attack" },
  { id: "galeArrow", name: "Gale Arrow", desc: "Wind-element 1.8x physical, 5 hexes.", mp: 6, target: "enemy", range: 5, kind: "physical", element: "wind", power: 1.8, anim: "attack" },
  { id: "arrowRain", name: "Arrow Rain", desc: "1.2x physical around the target hex.", mp: 10, target: "area", range: 5, radius: 1, kind: "physical", power: 1.2, anim: "attack" },
  { id: "foxfire", name: "Foxfire", desc: "Fire magic 2.0x; may burn.", mp: 10, target: "enemy", range: 4, kind: "magic", element: "fire", power: 2.0, status: { id: "burn", chance: 0.5, turns: 3 }, anim: "cast" },
  { id: "hunterMark", name: "Hunter's Mark", desc: "A foe's DEF and RES drop 25% for 3 turns.", mp: 4, target: "enemy", range: 5, kind: "debuff", mods: [{ stat: "def", pct: -25, turns: 3 }, { stat: "res", pct: -25, turns: 3 }], anim: "attack" },
  { id: "tailwind", name: "Tailwind", desc: "Every ally gains +30% SPD for 3 turns.", mp: 8, target: "allAllies", range: 0, kind: "buff", mods: [{ stat: "spd", pct: 30, turns: 3 }], anim: "cast" },
  { id: "ninefoldVolley", name: "Ninefold Volley", desc: "Wind 1.6x physical on every foe.", mp: 20, target: "allEnemies", range: 0, kind: "physical", element: "wind", power: 1.6, anim: "attack" },

  // --- Kaito (rival) ---
  { id: "braveSlash", name: "Brave Slash", desc: "1.8x physical.", mp: 4, target: "enemy", range: 1, kind: "physical", power: 1.8, anim: "attack" },
  { id: "thunderEdge", name: "Thunder Edge", desc: "Wind 2.0x physical, 2 hexes.", mp: 8, target: "enemy", range: 2, kind: "physical", element: "wind", power: 2.0, anim: "cast" },

  // --- Monsters ---
  { id: "bite", name: "Bite", desc: "1.3x physical.", mp: 0, target: "enemy", range: 1, kind: "physical", power: 1.3, anim: "attack" },
  { id: "poisonBite", name: "Venom Bite", desc: "1.1x physical; may poison.", mp: 2, target: "enemy", range: 1, kind: "physical", power: 1.1, status: { id: "poison", chance: 0.45, turns: 3 }, anim: "attack" },
  { id: "howl", name: "Howl", desc: "Raises own ATK 30% for 3 turns.", mp: 2, target: "self", range: 0, kind: "buff", mods: [{ stat: "atk", pct: 30, turns: 3 }], anim: "cast" },
  { id: "windCutter", name: "Wind Cutter", desc: "Wind magic 1.3x.", mp: 3, target: "enemy", range: 4, kind: "magic", element: "wind", power: 1.3, anim: "cast" },
  { id: "fireball", name: "Fireball", desc: "Fire magic 1.4x.", mp: 4, target: "enemy", range: 4, kind: "magic", element: "fire", power: 1.4, anim: "cast" },
  { id: "fireBreath", name: "Fire Breath", desc: "Fire magic 1.2x around the target.", mp: 5, target: "area", range: 2, radius: 1, kind: "magic", element: "fire", power: 1.2, status: { id: "burn", chance: 0.25, turns: 3 }, anim: "attack" },
  { id: "iceShard", name: "Ice Shard", desc: "Ice magic 1.4x; may freeze.", mp: 4, target: "enemy", range: 4, kind: "magic", element: "ice", power: 1.4, status: { id: "freeze", chance: 0.2, turns: 1 }, anim: "cast" },
  { id: "stoneGaze", name: "Stone Gaze", desc: "Earth magic 1.1x; may freeze solid.", mp: 5, target: "enemy", range: 3, kind: "magic", element: "earth", power: 1.1, status: { id: "freeze", chance: 0.35, turns: 1 }, anim: "cast" },
  { id: "lifeDrain", name: "Life Drain", desc: "Dark magic 1.3x; heals half the damage.", mp: 4, target: "enemy", range: 2, kind: "magic", element: "dark", power: 1.3, drain: 0.5, anim: "cast" },
  { id: "curse", name: "Curse", desc: "Lowers a foe's ATK 25% for 3 turns.", mp: 3, target: "enemy", range: 4, kind: "debuff", mods: [{ stat: "atk", pct: -25, turns: 3 }], anim: "cast" },
  { id: "mend", name: "Mend", desc: "Heals an ally monster.", mp: 4, target: "ally", range: 3, kind: "heal", power: 1.5, anim: "cast" },
  { id: "cleave", name: "Cleave", desc: "1.3x physical on every foe next to the user.", mp: 4, target: "area", range: 0, radius: 1, kind: "physical", power: 1.3, anim: "attack" },
  { id: "warcry", name: "War Cry", desc: "Every ally monster gains +25% ATK for 3 turns.", mp: 6, target: "allAllies", range: 0, kind: "buff", mods: [{ stat: "atk", pct: 25, turns: 3 }], anim: "cast" },
  { id: "darkNova", name: "Dark Nova", desc: "Dark magic 1.3x on every foe.", mp: 12, target: "allEnemies", range: 0, kind: "magic", element: "dark", power: 1.3, anim: "cast" },
  { id: "shadowBolt", name: "Shadow Bolt", desc: "Dark magic 1.5x.", mp: 4, target: "enemy", range: 5, kind: "magic", element: "dark", power: 1.5, anim: "cast" },
  { id: "tidalWave", name: "Tidal Wave", desc: "Ice magic 1.2x around the target.", mp: 6, target: "area", range: 3, radius: 1, kind: "magic", element: "ice", power: 1.2, anim: "cast" },
  { id: "stomp", name: "Stomp", desc: "Earth 1.5x physical; may stun.", mp: 3, target: "enemy", range: 1, kind: "physical", element: "earth", power: 1.5, status: { id: "stun", chance: 0.2, turns: 1 }, anim: "attack" }
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(LIST.map((skill) => [skill.id, skill]));

export function skillDef(id: string): SkillDef {
  const def = SKILLS[id];
  if (!def) throw new Error(`Unknown Restia skill ${id}`);
  return def;
}
