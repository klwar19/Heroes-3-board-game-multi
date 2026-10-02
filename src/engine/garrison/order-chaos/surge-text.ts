/**
 * Order & Chaos: plain-language Surge descriptions, built from the same
 * numbers the simulation uses (so the almanac and tooltips cannot drift).
 */

import { GW_TPS } from "../clock";
import type { DefDef } from "../content";

const secs = (ticks: number): number => Math.round((ticks / GW_TPS) * 10) / 10;

export function surgeText(def: DefDef): string {
  const s = def.surge;
  if (!s) return "";
  const p = def.power ?? 1;
  const n = (value: number) => Math.round(value * p);
  switch (s.kind) {
    case "gold": return `Drops ${s.coins} coins of ${n(s.value)} gold.`;
    case "audit": return `Doubles every coin lying on the field and drops ${n(s.bonus)} gold.`;
    case "rainbow": return `${s.coins} coins of ${n(s.value)} gold rain across the field.`;
    case "mana": return "Fills your hero's mana and readies every spell.";
    case "storm": return `Fires ${s.shots} shots of ${n(s.dmg)} in quick succession${s.lanes === 3 ? " down its lane and both beside it" : ""}${s.back ? ", as many behind it" : ""}.`;
    case "freeze-lane": return `Every foe in its lane takes ${n(s.dmg)} and is frozen solid for ${secs(s.dur)} s.`;
    case "chain": return `A bolt of ${n(s.dmg)} leaps through up to ${s.hops + 1} foes anywhere on the field.`;
    case "rockfall": return `Hurls ${s.count} shield-smashing boulders of ${n(s.dmg)} at the toughest foes on the field.`;
    case "headshot": return `Shoots the ${s.count} toughest foes on the field for ${n(s.dmg)} each, through armour.`;
    case "cluster": return `Lobs ${s.count} grenades of ${n(s.dmg)} at random foes (half to those around them).`;
    case "smite": return `Lightning strikes every foe on the field for ${n(s.dmg)}.`;
    case "bolts": return `${s.count} piercing bolts of ${n(s.dmg)} down its lane and both beside it — flyers too.`;
    case "broadside": return `A bursting shell of ${n(s.dmg)} down every lane.`;
    case "beam": return `Fires her beam at double strength (${def.beam ? def.beam.dmg * 2 : 0}) down three lanes at once.`;
    case "plate": return `Gains ${n(s.amount)} HP of armour plating.`;
    case "stomp": return `Stuns every foe in the 3×3 for ${secs(s.dur)} s (${n(s.dmg)}).`;
    case "phalanx": return `Calls copies of itself into the empty tiles in front and behind for ${secs(s.life)} s.`;
    case "charge": return `Charges down its lane: ${n(s.dmg)} to every foe ahead.`;
    case "rampage": return `Rampages through its whole lane: ${n(s.dmg)} and a 2 s stun to every foe in it.`;
    case "sanctuary": return `Troops in its 3×3 cannot be harmed or carried off for ${secs(s.dur)} s.`;
    case "mass-heal": return `Heals every troop on the field for ${n(s.amount)}.`;
    case "mass-slow": return `Slows every foe on the field for ${secs(s.dur)} s.`;
    case "resurrect-all": return "Raises every troop that fell in its 3×3, at full health.";
    case "stare": return `Turns every foe in its lane to stone (bosses take ${n(s.bossDmg)}).`;
    case "meteors": return `Meteors fall on the ${s.count} toughest foes: ${n(s.dmg)} in a 3×3 each.`;
    case "supernova": return `Explodes for ${n(s.dmg)} in the 3×3, heals fully and can rise again.`;
    case "tempest": return `A tempest blows every foe ${s.push} tiles back and every flyer off the field.`;
    case "quake": return `Spikes burst along its lane: ${n(s.dmg)} to every foe, through armour.`;
    case "tide": return `Wraps every troop in a ${n(s.amount)} HP water shell.`;
    case "fire-lane": return `A wall of fire sweeps its lane: ${n(s.dmg)} to every foe in it.`;
    case "rearm": return "Arms at once and buries a second armed charge in the next free tile ahead.";
    case "hospital": return "Fully heals and cures every troop in its lane.";
    case "reload": return "Every shooter on the field fires a free volley.";
    case "overload": return `Lightning hits every foe in its lane and both beside it for ${n(s.dmg)}.`;
    case "air-raid": return `Bombs the front foe of every lane for ${n(s.dmg)} (half to the foes beside it).`;
    case "whirl": return `A whirlwind of blades: ${n(s.dmg)} to every foe within 1.5 tiles in three lanes, stunned for ${secs(s.dur)} s.`;
    case "skyfall": return `Dives on every flyer on the field for ${n(s.dmg)}.`;
    case "roots": return `Roots bind every foe within ${s.reach} tiles in front, in three lanes, for ${secs(s.dur)} s.`;
    case "blizzard": return `A blizzard over three lanes: ${n(s.dmg)} to every foe, frozen solid for ${secs(s.dur)} s.`;
    case "minefield": return "Buries up to four armed Land Mines on the free tiles ahead of her.";
    case "scatter": return `Every foe in her lane wanders off into the lanes beside it, slowed for ${secs(s.dur)} s.`;
    case "magnetize": return "Tears every helm, suit of armour and shield on the field off its wearer.";
    case "feast": return `Gulps down up to ${s.count} foes within ${s.reach} tiles ahead in its lane (up to ${def.devour?.cap ?? 0} toughness each) and is hungry again at once.`;
    case "charm": return `Charms the ${s.count} nearest foes ahead (its lane and both beside it): they turn and fight for Order.`;
    case "dome": return `For ${secs(s.dur)} s its dome spreads a tile further each way and turns aside straight shots too.`;
    case "herd": return `Rings its bell: every foe on the lawn in the lanes beside it is drawn into its lane, and it curls up in a ${n(s.shell)} HP shell.`;
    case "war-party": return `Calls a war party: lizard warriors charge down its lane and both beside it, ${n(s.dmg)} to every foe they trample.`;
    case "shockwave": return `A shield-charge: every foe within ${s.reach} tiles ahead, in its lane and both beside it, is hurled ${s.push} tiles back and stunned for ${secs(s.dur)} s.`;
    case "fan": return `Trick shots: ${s.shots} shots of ${n(s.dmg)} at random foes anywhere on the field — flyers too.`;
    case "hail": return `Hail: ${s.count} frost bombs on the toughest foes (${n(s.dmg)}, half to those around), each target frozen solid for ${secs(s.freeze)} s and everyone caught chilled.`;
    case "radiance": return `A rainbow burst: ${n(s.dmg)} to every foe on the field, and every troop heals ${n(s.heal)}.`;
    case "miasma": return `A cloud of rot: every foe within ${s.reach} tiles of her (five lanes) is poisoned — ${n(s.dps)} a second for ${secs(s.dur)} s.`;
    case "embrace": return `Snaps shut on up to ${s.count} foes within ${s.reach} tiles (her lane and both beside it; up to ${def.maw?.cap ?? 0} toughness each) — and she's open again at once.`;
    case "overclock": return `Vents its boiler: ${n(s.dmg)} to every foe in the 3×3, and its plating is repaired in full.`;
    case "stampede": return `A stampede: ${s.count} ${s.count === 1 ? "ally" : "allies"} charge out across its lane and both beside it.`;
    case "iai": return `A triple draw: every foe within ${s.reach} tiles ahead in her lane and both beside it takes ${n(s.dmg)}.`;
  }
}
