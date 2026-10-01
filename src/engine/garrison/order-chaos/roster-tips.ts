/**
 * Order & Chaos: Crag Hack's first-time words about the roster — the first
 * time the player meets a Chaos creature in battle, fuses a hybrid, or plants
 * a troop whose trick isn't obvious. Each line is shown once per browser (the
 * battle UI remembers what was said). Pure data: every rule a line names is
 * the simulation's (see ./roster.ts for the numbers).
 */

import type { DefKind, EnemyKind } from "../content";
import type { OcLine } from "./story";

const crag = (mood: OcLine["mood"], text: string): OcLine => ({ who: "crag", mood, text });

/** The first time a foe that stood off to shoot runs out of ammunition and charges (the stall-breaker in ../sim.ts). */
export const OC_STANDOFF_TIP: OcLine = crag("shout", "Hear that horn? The horde's last wave is out. Anything still hanging back to shoot has ten seconds, then it runs out of ammo and charges. No shooters in your hand? Keep a blade up front and let them come.");

/** The first sight of a Chaos creature (keyed by kind). */
export const OC_FOE_TIPS: Readonly<Record<EnemyKind, OcLine>> = {
  "oc-hexmaster": crag("shout", "See the one with the red orb on a stick? That's a Hexmaster. Every few seconds he heals the most hurt foe near him and shakes off your frost. Kill the healer first."),
  "oc-eater": crag("talk", "That's an Eater. Every eight seconds her tentacles grab a troop one to three tiles away and drag it a step closer. Tall troops and Dwarves won't move, so put those in front."),
  "oc-fire-messenger": crag("shout", "Fire Messenger! Whatever it bites burns to ashes. Frost puts its fire out for good: a Snow Elf's spear, ice, rain or water. Then it's just a hothead."),
  "oc-warlord": crag("talk", "Frederika. Armoured, undead and bossy. Every eight seconds she gives the nearest foe with no armour five hundred worth of it. Knock the helmets off. Or better, knock her over."),
  "oc-watcher": crag("sly", "A brain in a jar, with opinions. Its dome bounces lobbed shots off anything within a tile of it: boulders, grenades, frost hexes. Arrows, blades and lightning go straight through."),
  "oc-stormbird": crag("shout", "A Stormbird, carrying a passenger! It flies over your wall and drops a helmed troglodyte behind your front line. Shoot it down early, and the passenger lands out in the field."),
  "oc-frostcaller": crag("talk", "Jotunn Frostcaller. Every nine seconds it locks one of your troops in ice. Put a fire troop, like a Salamander or a Phoenix, next to your best ones and they stay warm. Cure or a Surge thaws them too."),
  "oc-treasure": crag("grin", "Ha! A Treasure Kobold. It never fights. It runs in, panics, and runs off with a hundred and fifty gold and a Surge orb. Get it before it escapes!"),
  "oc-hydra-spawn": crag("talk", "Hydra Spawn. Cut it down and two baby hydras wriggle out of the stump. Finish them before they reach the wall."),
  "oc-cyberbrute": crag("shout", "Cyberbrute! An iron-plated giant. It flattens a troop in one blow, the shockwave shakes the troops around it, and when it's hurt it throws a Cyber Zombie over your wall. Kill it before it gets here."),
  "oc-cyber-zombie": crag("sly", "Cyber Zombie. A corpse held together with rivets. Its bolted-on plate takes the first three hundred damage of any kind."),
  "oc-reaver": crag("talk", "Brute Reaver. Big axe, bigger swing. Every blow hits the troop in front of him AND the troops beside it in the next lanes."),
  "oc-mantis": crag("talk", "Mantis Reaper. Every third stroke, she spins and cuts every troop on the tiles around her. Keep her off your wall with shooters."),
  "oc-kitsune": crag("shout", "Kitsune Assassin! Every six seconds she jumps past your front line, stabs your rearmost troop within three and a half tiles, and is back before you blink. Walls don't stop her. Toughen your back rows, or kill her fast."),
  "oc-kunoichi": crag("talk", "Kamuro, the Shadow Fox. She stops a long way out and throws knives at your first troop. Nothing fancy, just annoying. Shoot at her, or lob something.")
};

/** The first time a hybrid is fused (keyed by the hybrid's kind). */
export const OC_FUSION_TIPS: Readonly<Record<DefKind, OcLine>> = {
  "oc-frost-archer": crag("grin", "An Arctic Sharpshooter! Frost arrows that go through two foes and chill them. Every fourth one is a critical hit."),
  "oc-lava-archer": crag("grin", "A Lava Sharpshooter: burning bolts that burst on the first thing they hit."),
  "oc-cyclops-king": crag("grin", "Cyclops King! Bigger boulders that burst where they land, and every other one stuns."),
  "oc-diamond-golem": crag("grin", "Diamond Golem. Nine thousand health of crystal, too tall to jump over, and it cuts every biter."),
  "oc-war-zealot": crag("grin", "A War Zealot! Holy orbs from a distance, and a halberd for anything that gets close."),
  "oc-thunderbird": crag("grin", "A Thunderbird! Lightning every three seconds that jumps through four more foes."),
  "oc-tithe-slinger": crag("grin", "A Peasant with a sling! Well, a Halfling. He shoots down the lane AND still pays his taxes. The best of both."),
  "oc-brimstone": crag("sly", "A Dwarf full of fire. Biters get burned, and when he finally falls, boom: the whole 3x3 goes up. Stand back. Further."),
  "oc-yeti-warden": crag("grin", "A Yeti Warden! Anything that bites it freezes solid for a moment. Brr."),
  "oc-frostfire": crag("grin", "Frostfire! Its bolts burn for double AND chill. That's the one trick a Salamander can't do."),
  "oc-meteor-gargoyle": crag("grin", "A Meteor Gargoyle: the same drop, but it lands in flames over the whole 3x3."),
  "oc-glacial-charge": crag("sly", "Glacial Charge. When it goes off, everything in the 3x3 freezes solid for twelve seconds. Line them up."),
  "oc-frost-giant": crag("grin", "A Frost Giant! Ice boulders over the shields, and everything they splash walks at half speed."),
  "oc-zephyr": crag("grin", "Zephyr Archer: every arrow knocks its foe back a step. Two of these and the horde walks backwards."),
  "oc-siren": crag("sly", "A Siren. Three foes will fall in love with her before she's spent. That's two more than Cupi manages."),
  "oc-blazing-prefect": crag("grin", "Iori! Fire bullets: every one burns for double and scorches the foes beside the one it hits."),
  "oc-tesla": crag("grin", "A Tesla Automaton: a wall that zaps! Lightning every three seconds, and it still bursts when it breaks.")
};

/** The first time a troop with a not-so-obvious trick is planted (keyed by its base kind). */
export const OC_PLACE_TIPS: Readonly<Record<DefKind, OcLine>> = {
  "oc-elf-band": crag("talk", "Tip: drop another Wood Elf Band packet on this one. Two elves make a Pack, three a Horde. Each elf adds an arrow to every volley, and costs a bit more."),
  "oc-couatl": crag("talk", "The Couatl makes you a Surge orb every forty seconds. Pick it up like any other orb."),
  "oc-gargoyle": crag("sly", "The Gargoyle just sits there looking ugly until something comes close. Then it drops on it like a ton of bricks. Because it IS a ton of bricks."),
  "oc-maiden": crag("sly", "The Iron Maiden is a wall with a secret. The first thing that bites her goes inside and never comes out. Then she needs twenty seconds before she opens again."),
  "oc-rin": crag("grin", "Rin sends a cat down her lane every twelve seconds, while there's something to chase. They're braver than they look."),
  "oc-nix": crag("talk", "The Nix Warrior shield-bashes the first three biters two tiles back down the lane. Each bash comes back ten seconds after it's used."),
  "oc-armadillo": crag("grin", "A Rolling Armadillo! It curls up and rolls down the lane, bouncing from foe to foe. Aim it at a crowd."),
  "oc-big-armadillo": crag("grin", "The Giant Armadillo rolls straight through everything in the lane. Everything.")
};
