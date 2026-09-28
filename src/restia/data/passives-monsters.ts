import type { PassiveDef } from "../engine/types";

/**
 * Monster battle passives (MonsterDef.passives). Every id starts with "mon" so
 * it can never collide with a job, character or equipment passive.
 * Percentages are whole numbers; fractions are 0-1.
 */
export const MONSTER_PASSIVES: PassiveDef[] = [
  // --- Packs and swarms ---
  { id: "monPackHunter", name: "Pack Hunter", desc: "+15% damage for each other ally adjacent to its target.", pack: 15 },
  { id: "monSwarm", name: "Swarm", desc: "+10% damage for each other ally adjacent to its target; SPD +10%.", pack: 10, stats: { spd: 10 } },
  { id: "monPackLeader", name: "Pack Leader", desc: "Allies within 2 hexes gain +15% ATK and +10% SPD.", aura: { atk: 15, spd: 10 } },
  { id: "monFrostAura", name: "Frost Aura", desc: "Allies within 2 hexes gain +15% RES and +10% DEF. Can't be frozen or slowed.", aura: { res: 15, def: 10 }, immune: ["freeze", "slow"] },

  // --- Hides and shells ---
  { id: "monThickHide", name: "Thick Hide", desc: "DEF +20%. Can't bleed.", stats: { def: 20 }, immune: ["bleed"] },
  { id: "monStoneSkin", name: "Stone Skin", desc: "DEF +30% and RES +15%. Can't be poisoned or bleed.", stats: { def: 30, res: 15 }, immune: ["poison", "bleed"] },
  { id: "monSpikedHide", name: "Spiked Hide", desc: "Returns 25% of melee damage taken to the attacker.", thorns: 0.25 },
  { id: "monShielded", name: "Scale Guard", desc: "Starts every battle with a shield worth 20% of max HP.", shieldStart: 0.2 },
  { id: "monGiant", name: "Giant", desc: "Max HP +15%. Can't be stunned.", stats: { maxHp: 15 }, immune: ["stun"] },
  { id: "monRegenerate", name: "Regenerate", desc: "Heals 8% of max HP at the start of each turn.", regen: 0.08 },

  // --- Elemental bodies ---
  { id: "monVenomous", name: "Venomous", desc: "Basic attacks and physical skills may poison (35%, 3 turns).", onHit: { status: "poison", chance: 0.35, turns: 3 } },
  { id: "monBurningBody", name: "Burning Body", desc: "Basic attacks and physical skills may burn (35%, 3 turns). Can't be burned or frozen.", onHit: { status: "burn", chance: 0.35, turns: 3 }, immune: ["burn", "freeze"] },
  { id: "monFireShield", name: "Fire Shield", desc: "Returns 30% of melee damage taken to the attacker. Can't be burned.", thorns: 0.3, immune: ["burn"] },
  { id: "monFlashpoint", name: "Flashpoint", desc: "Explodes on death: fire 1.2x power on every unit within 1 hex; may burn.", deathBurst: { power: 1.2, element: "fire", radius: 1, status: "burn" } },
  { id: "monRootGrip", name: "Root Grip", desc: "Basic attacks and physical skills may root the target (35%, 1 turn).", onHit: { status: "root", chance: 0.35, turns: 1 } },

  // --- Undead ---
  { id: "monUndead", name: "Undead", desc: "Can't be poisoned, bleed or fall asleep.", immune: ["poison", "bleed", "sleep"] },
  { id: "monRiseAgain", name: "Rise Again", desc: "Survives the first lethal blow of the battle at 1 HP.", undying: true },
  { id: "monVampiric", name: "Vampiric", desc: "Heals 25% of damage dealt. Foes can't retaliate against its melee attacks.", lifesteal: 0.25, noRetaliation: true },

  // --- Movement and footwork ---
  { id: "monSwift", name: "Swift", desc: "+1 move and SPD +15%.", move: 1, stats: { spd: 15 } },
  { id: "monEvasiveFlyer", name: "Evasive Flyer", desc: "+20% chance to dodge physical attacks.", evasion: 0.2 },
  { id: "monHitAndRun", name: "Hit and Run", desc: "Foes can't retaliate against its melee attacks; +1 move.", noRetaliation: true, move: 1 },
  { id: "monSureFooted", name: "Sure-Footed", desc: "Ignores terrain move costs and hazard tiles; +10% dodge against physical attacks.", sureFooted: true, evasion: 0.1 },

  // --- Killers ---
  { id: "monAmbusher", name: "Ambusher", desc: "+50% damage when striking a foe from behind.", backstab: 50 },
  { id: "monBlindsight", name: "Blindsight", desc: "Never needed eyes: can't be blinded; +10% dodge against physical attacks.", immune: ["blind"], evasion: 0.1 },
  { id: "monBerserk", name: "Berserk", desc: "Below 40% HP: ATK +40% and SPD +20%.", lowHp: { below: 0.4, stats: { atk: 40, spd: 20 } } },
  { id: "monFirstStrike", name: "First Strike", desc: "Retaliates before the attacker's melee blow lands, at 0.7x power.", firstStrike: true, counter: 0.7 },
  { id: "monDeathBlow", name: "Death Blow", desc: "+15% crit chance; crits deal +0.5x more.", crit: 0.15, critDamage: 0.5 },
  { id: "monLucky", name: "Pot of Luck", desc: "+20% crit chance and +15% chance to dodge physical attacks.", crit: 0.2, evasion: 0.15 },
  { id: "monSteadyAim", name: "Steady Aim", desc: "+1 range for ranged basic attacks; +25% damage while standing higher than the target.", range: 1, highGround: 25 },

  // --- Casters and bosses ---
  { id: "monArcaneFlow", name: "Arcane Flow", desc: "Recovers 10% of max MP at the start of each turn; skills cost 25% less MP.", mpRegen: 0.1, mpSave: 25 },
  { id: "monBossResolve", name: "Boss Resolve", desc: "Survives the first lethal blow of the battle at 1 HP. Can't be stunned, put to sleep, frozen, rooted or taunted (slow, silence and other ailments still land).", undying: true, immune: ["stun", "sleep", "freeze", "root", "taunt"] }
];

export const MONSTER_PASSIVE_MAP: Record<string, PassiveDef> = Object.fromEntries(MONSTER_PASSIVES.map((passive) => [passive.id, passive]));
