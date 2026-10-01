/**
 * Order & Chaos: Crag Hack's first words when a world boss comes onto the lawn (shown
 * once per browser, like the roster tips). Every rule a line names is the boss's own
 * (WarbossDef in ./roster.ts; the moves in ../sim.ts warbossAct).
 */

import type { EnemyKind } from "../content";
import type { OcLine } from "./story";

const crag = (mood: OcLine["mood"], text: string): OcLine => ({ who: "crag", mood, text });

export const OC_BOSS_TIPS: Readonly<Record<EnemyKind, OcLine>> = {
  "oc-boss-abomination": crag("shout", "There's the big ugly one! Watch the ground: red tiles show where its next blow lands. Move your troops off them, or make sure they're tough. Bring it down, and the whole pack runs."),
  "oc-boss-wyrm": crag("shout", "The Frost Wyrm! Its breath freezes everything on the marked tiles. A fire troop right next to them keeps them warm. And don't let those Sledge Wolves through."),
  "oc-boss-lich": crag("talk", "The Mire Lich throws death bolts at your three most expensive troops, the marked ones. Spread your gold around. And clear the graves he raises: the dead climb out at every great assault."),
  "oc-boss-warchief": crag("shout", "Grogg! When his drums start, the whole horde speeds up for four seconds. His boulders go for your most expensive troops, so an Aegis dome is worth a lot here."),
  "oc-boss-arachne": crag("talk", "Arachne webs your four most expensive troops for four seconds. Don't put all your gold in one lane, and kill her daughters fast."),
  "oc-boss-barrow-king": crag("sly", "The Barrow King drains whatever stands on the five tiles in front of him, and heals for half of it. Clear that strip when he gets ready, and hit him hard and fast."),
  "oc-boss-gnawbone": crag("shout", "Old Gnawbone jumps right over your wall onto whatever is behind it, up to three and a half tiles back. Keep that back row empty, or tough enough to take it."),
  "oc-boss-mastermind": crag("talk", "That chaingun tears up six tiles of its lane. Clear the marked strip, or put something big in it. Spells only do 60% to it, so trust your blades and bows."),
  "oc-boss-sphinx": crag("sly", "The Masked Sphinx jumps between lanes, so cover all of them. When she asks her riddle, every troop within three tiles of her freezes. The last show of the carnival, Keeper.")
};
