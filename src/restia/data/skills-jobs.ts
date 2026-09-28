import type { SkillDef } from "../engine/types";

/** Skills taught by jobs at job levels 2 and 4 (data/jobs.ts). Kept once learned. */
export const JOB_SKILLS: SkillDef[] = [
  // --- Fighter ---
  { id: "jPowerStrike", name: "Power Strike", desc: "A full-weight blow. 1.8x physical.", mp: 3, ap: 2, target: "enemy", range: 1, kind: "physical", power: 1.8, anim: "attack", fx: "slash", sfx: "units/swordsman-attack" },
  { id: "jWhirlwind", name: "Whirlwind", desc: "Spin through every adjacent foe. 1.3x physical.", mp: 6, ap: 3, target: "area", range: 0, radius: 1, kind: "physical", power: 1.3, anim: "attack", fx: "slash", sfx: "units/crusader-attack" },
  // --- Guardian ---
  { id: "jProvoke", name: "Provoke", desc: "Foes within 2 hexes must attack you for 2 turns; DEF +20% for 2 turns.", mp: 3, ap: 2, target: "self", range: 0, kind: "buff", taunt: 2, mods: [{ stat: "def", pct: 20, turns: 2 }], anim: "cast", fx: "roar", sfx: "effects/horn-1" },
  { id: "jBulwark", name: "Bulwark", desc: "Shield an ally within 2 hexes: absorbs 1.5x (MAG + 2x level) damage.", mp: 6, ap: 2, target: "ally", range: 2, kind: "buff", shield: 1.5, anim: "cast", fx: "shield", sfx: "spells/shield" },
  // --- Ranger ---
  { id: "jPinningShot", name: "Pinning Shot", desc: "1.2x physical, 4 hexes; roots the target for 2 turns.", mp: 3, ap: 2, target: "enemy", range: 4, kind: "physical", power: 1.2, status: { id: "root", chance: 0.8, turns: 2 }, anim: "attack", projectile: "arrow", fx: "pierce", sfx: "units/wood-elf-shoot" },
  { id: "jVolley", name: "Volley", desc: "Arrows rain around a hex up to 5 away. 1.1x physical.", mp: 8, ap: 3, target: "area", range: 5, radius: 1, kind: "physical", power: 1.1, anim: "attack", fx: "pierce", sfx: "units/archer-shoot" },
  // --- Mage ---
  { id: "jFireBolt", name: "Fire Bolt", desc: "Fire magic 1.6x, 4 hexes.", mp: 4, ap: 2, target: "enemy", range: 4, kind: "magic", element: "fire", power: 1.6, anim: "cast", projectile: "fireball", fx: "fire", sfx: "spells/fireball" },
  { id: "jBlizzard", name: "Blizzard", desc: "Ice magic 1.4x around a hex up to 4 away; may slow; leaves ice.", mp: 9, ap: 3, target: "area", range: 4, radius: 1, kind: "magic", element: "ice", power: 1.4, status: { id: "slow", chance: 0.5, turns: 2 }, terrain: "ice", anim: "cast", fx: "ice", sfx: "spells/frost-ring" },
  // --- Cleric ---
  { id: "jMend", name: "Mend", desc: "Restore an ally's HP (1.6x).", mp: 4, ap: 2, target: "ally", range: 3, kind: "heal", power: 1.6, field: true, anim: "cast", fx: "heal", sfx: "spells/cure" },
  { id: "jPurify", name: "Purify", desc: "Every ally: ailments cleared, regeneration for 3 turns.", mp: 8, ap: 3, target: "allAllies", range: 0, kind: "heal", power: 0.3, cure: true, status: { id: "regen", chance: 1, turns: 3 }, anim: "cast", fx: "heal", sfx: "spells/prayer" },
  // --- Rogue ---
  { id: "jCheapShot", name: "Cheap Shot", desc: "1.3x physical; blinds for 2 turns (70%).", mp: 3, ap: 2, target: "enemy", range: 1, kind: "physical", power: 1.3, status: { id: "blind", chance: 0.7, turns: 2 }, anim: "attack", fx: "claw", sfx: "units/rogue-attack" },
  { id: "jPoisonBlade", name: "Poison Blade", desc: "1.4x physical; poisons for 3 turns (80%).", mp: 5, ap: 2, target: "enemy", range: 1, kind: "physical", power: 1.4, status: { id: "poison", chance: 0.8, turns: 3 }, anim: "attack", fx: "poison", sfx: "spells/poison" },
  // --- Knight ---
  { id: "jShieldBash", name: "Shield Bash", desc: "1.5x physical; knocks the foe back 1 hex; may stun (30%).", mp: 5, ap: 2, target: "enemy", range: 1, kind: "physical", power: 1.5, knockback: 1, status: { id: "stun", chance: 0.3, turns: 1 }, anim: "attack", fx: "smash", sfx: "units/champion-attack" },
  { id: "jHolyCharge", name: "Holy Charge", desc: "Light-element 2.4x physical, 2 hexes.", mp: 10, ap: 3, target: "enemy", range: 2, kind: "physical", element: "light", power: 2.4, anim: "attack", fx: "light", sfx: "spells/prayer" },
  // --- Berserker ---
  { id: "jRecklessSwing", name: "Reckless Swing", desc: "2.4x physical, but DEF -30% for 2 turns.", mp: 4, ap: 2, target: "enemy", range: 1, kind: "physical", power: 2.4, selfMods: [{ stat: "def", pct: -30, turns: 2 }], anim: "attack", fx: "smash", sfx: "units/ogre-attack" },
  { id: "jEarthsplitter", name: "Earthsplitter", desc: "Earth 2.0x physical along a straight line 3 hexes long.", mp: 10, ap: 3, target: "enemy", range: 3, line: true, kind: "physical", element: "earth", power: 2.0, anim: "attack", fx: "earth", sfx: "spells/earthquake" },
  // --- Sniper ---
  { id: "jHeadshot", name: "Headshot", desc: "2.6x physical, 6 hexes, +20% crit. Needs a charged turn (4 AP).", mp: 8, ap: 4, target: "enemy", range: 6, kind: "physical", power: 2.6, crit: 0.2, anim: "attack", projectile: "arrow", fx: "pierce", sfx: "units/sharpshooter-shoot" },
  { id: "jPiercingArrow", name: "Piercing Arrow", desc: "1.8x physical through every unit on a line 6 hexes long.", mp: 8, ap: 3, target: "enemy", range: 6, line: true, kind: "physical", power: 1.8, anim: "attack", fx: "pierce", sfx: "units/grand-elf-shoot" },
  // --- Elementalist ---
  { id: "jThunderstorm", name: "Thunderstorm", desc: "Wind magic 1.7x around a hex up to 5 away.", mp: 10, ap: 3, target: "area", range: 5, radius: 1, kind: "magic", element: "wind", power: 1.7, anim: "cast", fx: "wind", sfx: "spells/lightning-bolt" },
  { id: "jMeteor", name: "Meteor", desc: "Fire magic 2.4x around a hex up to 5 away; leaves fire. Needs 5 AP.", mp: 18, ap: 5, target: "area", range: 5, radius: 1, kind: "magic", element: "fire", power: 2.4, terrain: "fire", anim: "cast", fx: "explosion", sfx: "spells/meteor-shower" },
  // --- Sage ---
  { id: "jSanctuary", name: "Sanctuary", desc: "Heal every ally (1.2x) and shield them (0.6x). Needs 4 AP.", mp: 14, ap: 4, target: "allAllies", range: 0, kind: "heal", power: 1.2, shield: 0.6, field: true, anim: "cast", fx: "shield", sfx: "spells/prayer" },
  { id: "jRaise", name: "Raise", desc: "Revive a fallen ally within 3 hexes at 60% HP.", mp: 14, ap: 3, target: "ally", range: 3, kind: "revive", power: 0.6, field: true, anim: "cast", fx: "light", sfx: "spells/resurrection" },
  // --- Assassin ---
  { id: "jShadowStrike", name: "Shadow Strike", desc: "Dark 2.2x physical; marks the foe (+25% damage taken) for 2 turns.", mp: 6, ap: 2, target: "enemy", range: 1, kind: "physical", element: "dark", power: 2.2, status: { id: "mark", chance: 1, turns: 2 }, anim: "attack", fx: "dark", sfx: "spells/death-ripple" },
  { id: "jExecution", name: "Execution", desc: "3.2x physical, +15% crit. Needs a charged turn (4 AP).", mp: 12, ap: 4, target: "enemy", range: 1, kind: "physical", power: 3.2, crit: 0.15, anim: "attack", fx: "slash", sfx: "effects/death-blow" },
  // --- Jester ---
  { id: "jCardTrick", name: "Card Trick", desc: "Light 1.3x physical, 4 hexes; may blind (40%).", mp: 3, ap: 2, target: "enemy", range: 4, kind: "physical", element: "light", power: 1.3, status: { id: "blind", chance: 0.4, turns: 2 }, anim: "attack", projectile: "card", fx: "jester", sfx: "spells/magic-arrow" },
  { id: "jGambit", name: "Jester's Gambit", desc: "2.5x physical with +25% crit. The audience loves a gamble.", mp: 8, ap: 3, target: "enemy", range: 1, kind: "physical", power: 2.5, crit: 0.25, anim: "attack", fx: "jester", sfx: "effects/good-luck" }
];
