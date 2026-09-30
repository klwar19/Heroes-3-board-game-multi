/**
 * Order & Chaos: the story told between battles. Crag Hack, the Krewlod
 * barbarian who retired next door to the keep and now runs the Mercenary Camp,
 * advises the Keeper (the player). Sandro, the lich who raised the Chaos horde,
 * writes letters and gloats. Queen Catherine commissioned the Keeper; Vidomina
 * is Sandro's ambitious apprentice; Mortimer is the skeleton who pins Sandro's
 * letters to the gate. Pure data: the UI shows each scene once (remembered in
 * the player's progress) and can replay it.
 */

export type OcSpeaker = "crag" | "sandro" | "catherine" | "vidomina" | "mortimer";
export type OcMood = "talk" | "grin" | "shout" | "sly" | "sneer" | "rage" | "regal" | "stern" | "cold" | "smirk" | "nervous" | "cheer";
export type OcLine = { who: OcSpeaker; mood: OcMood; text: string };
/** A line that is only said once the player has cleared the level `after` (always, without it). */
export type OcGatedLine = OcLine & { after?: string };

/** Per level: Sandro's letter (read before the talk), the talk before the battle, and the words after a first victory. */
export type OcLevelStory = { letter?: string; before?: OcLine[]; after?: OcLine[] };

type OcSpeakerInfo = { name: string; title: string; moods: readonly OcMood[]; side: "left" | "right"; portrait: (mood: OcMood) => string };

/** A speaker whose portraits are /assets/order-chaos/story/<id>-<mood>.webp (an unknown mood shows the first one). */
function speaker(id: OcSpeaker, name: string, title: string, moods: readonly OcMood[], side: "left" | "right"): OcSpeakerInfo {
  return { name, title, moods, side, portrait: (mood) => `/assets/order-chaos/story/${id}-${moods.includes(mood) ? mood : moods[0]}.webp` };
}

export const OC_SPEAKERS: Record<OcSpeaker, OcSpeakerInfo> = {
  crag: speaker("crag", "Crag Hack", "Barbarian, retired (mostly)", ["talk", "grin", "shout", "sly"], "left"),
  sandro: speaker("sandro", "Sandro", "Lich, Lord of the Horde", ["sneer", "rage"], "right"),
  catherine: speaker("catherine", "Queen Catherine", "Queen of Erathia", ["regal", "stern"], "left"),
  vidomina: speaker("vidomina", "Vidomina", "Necromancer, Sandro's apprentice", ["cold", "smirk"], "right"),
  mortimer: speaker("mortimer", "Mortimer", "Courier (deceased)", ["nervous", "cheer"], "left")
};

/** Moments in a battle when Crag Hack (or someone else) pipes up (each at most once per battle, except the huge waves). */
export type OcQuipEvent = "start" | "orb" | "huge-wave" | "final-wave" | "crown" | "charger" | "boss" | "victory" | "defeat";

/** The lines of `pool` the player has unlocked (cleared holds the cleared level ids). */
export function unlockedLines<T extends OcGatedLine>(pool: readonly T[] | undefined, cleared: readonly string[]): T[] {
  return (pool ?? []).filter((line) => !line.after || cleared.includes(line.after));
}

// ---------------------------------------------------------------------------
// The script. Crag's lines teach: every mechanic he names is the simulation's.

const crag = (mood: "talk" | "grin" | "shout" | "sly", text: string): OcLine => ({ who: "crag", mood, text });
const sandro = (mood: "sneer" | "rage", text: string): OcLine => ({ who: "sandro", mood, text });
const catherine = (mood: "regal" | "stern", text: string): OcLine => ({ who: "catherine", mood, text });
const vidomina = (mood: "cold" | "smirk", text: string): OcLine => ({ who: "vidomina", mood, text });
const mortimer = (mood: "nervous" | "cheer", text: string): OcLine => ({ who: "mortimer", mood, text });
const gated = (after: string, line: OcLine): OcGatedLine => ({ ...line, after });

/** The first time the player opens the mode. */
export const OC_PROLOGUE: OcLine[] = [
  catherine("stern", "Keeper. The dead are crossing our border. This keep sits on the road they want, so it's yours now. Hold it."),
  catherine("regal", "I can't spare an army. I can spare a good neighbour. Try not to let him feed you."),
  crag("grin", "Oi! That's me! CRAG HACK. Barbarian. Retired. Mostly. My wagon's parked by your well."),
  crag("talk", "Here's the trouble. Sandro, the lich of Deyja, has gathered every lawless thing: dead, demons, beasts, sellswords."),
  crag("sly", "He wants the old crypt under your keep. It sits on a ley line. Raise an army there and it never stays dead."),
  crag("talk", "So they'll come down the roads to your gate, lane by lane, wave after wave. You raise troops. I teach you tricks."),
  crag("grin", "Why do I fight for Order? Easy. Chaos never pays on time."),
  sandro("sneer", "Enjoy your little keep while it lasts, Keeper. I've already measured it for curtains.")
];

/** Shown when a world is first entered. */
export const OC_WORLD_STORY: Record<number, OcLine[]> = {
  1: [
    crag("talk", "Erathian Meadows. Farms, fences, and Deyja's dead shuffling over the border."),
    crag("talk", "This is where you learn the trade: catch the gold that falls, plant troops from your seed packets, use your Surges."),
    sandro("sneer", "Such pretty fields. They'll make lovely graveyards."),
    crag("grin", "He talks like that all the time. Ignore him and shoot.")
  ],
  2: [
    crag("shout", "Brr! Frozen Vori. The horde crossed the glaciers, and some of it FLIES."),
    crag("talk", "You'll want gales and good aim. There's a caravan level too: it pays you in troops, not gold."),
    crag("sly", "You beat the Meadows, so the Endless Siege and your first Chaos Raid are open. Both pay Seals."),
    crag("grin", "Clear Vori and I'll open my Mercenary Camp. And there's an old Altar up here somewhere. I'd swear to it.")
  ],
  3: [
    crag("talk", "The Tatalian Mire. Down here the dead don't stay buried. Lots of graves."),
    crag("sly", "My Mercenary Camp is open! Minotaurs and Beholders from Nighon, sworn to Order. Seals only, no haggling."),
    crag("talk", "Some fights here ask you to PROTECT troops already on the field. If one of them falls, the battle's lost."),
    sandro("sneer", "Swamps are marvellous, Keeper. Everything sinks, and everything comes back up.")
  ],
  4: [
    crag("talk", "Bracada Heights. Wizards and cloud towers. The horde brought its own sorcery: gazes, hexes and snatching claws."),
    crag("talk", "Lots of these foes stop and strike from range. A wall won't save you, so kill them where they stand."),
    crag("grin", "Good news: wizards pay for help. Bad news: they pay in advice.")
  ],
  5: [
    crag("shout", "Underground! Gold falls from the sky half as often down here, so every coin counts."),
    crag("talk", "You start with a bit more gold to make up for it. Build your gold-makers first, then the rest."),
    crag("talk", "Things tunnel, things fly, and the Spider Princess keeps the dark."),
    crag("grin", "Not everyone in Nighon's a monster, mind. My Minotaurs send their love. Or a grunt. Same thing."),
    sandro("sneer", "In the dark, Keeper, no one hears your peasants praying for coins.")
  ],
  6: [
    crag("talk", "Deyja. Sandro's own backyard. Barrows, bones, and a vampire queen holding court."),
    vidomina("cold", "Sandro is away playing general, so Deyja answers to me now. Wipe your feet. Or don't. You won't be staying."),
    crag("talk", "The moon's up, so gold falls slowly again. And remember: Zealot Clerics hit the undead double."),
    mortimer("nervous", "Mind the barrows, please. I think my cousin's under lane three. He's a light sleeper.")
  ],
  7: [
    crag("shout", "The Hellgate. This is where the horde pours out of Eeofol. We shut it, or nobody sleeps again."),
    crag("talk", "Imps by the dozen, flying hell-balls, hydras and giants. And at the very top, Sandro himself."),
    sandro("rage", "You have come too far, Keeper! The gate is MINE, and so is what waits behind it!"),
    crag("grin", "He's shouting. That means we're winning.")
  ],
  8: [
    crag("grin", "Krewlod! My homeland! Smell that dust. Ahh. Smells like unpaid debts."),
    crag("talk", "The Hellgate's shut, but Sandro jumped off his Dracolich before it hit the ground. Now he's buying swords."),
    crag("sly", "Thing is, I know half these mercenaries. Some owe me money. Some I owe money. Let's not ask which."),
    crag("talk", "Hired blades drop their pay when they fall, and some run off when they're hurt. Finish them before they desert!"),
    sandro("sneer", "Every sword has a price, Keeper. I simply paid it first.")
  ],
  9: [
    crag("shout", "What in the... the sky's got a HOLE in it!"),
    vidomina("cold", "Sandro's planar hirelings tore the Void Rift open. What comes through serves no one. Not him. Not me."),
    sandro("sneer", "This was... not entirely planned. But I shall take the credit."),
    crag("talk", "Mana-drinkers, devils that pop up behind you, flyers that spells can't touch. Stay sharp.")
  ],
  10: [
    crag("talk", "Past the Rift, under a big fat moon: the Carnival of Masks. Sandro's last party."),
    crag("talk", "Phantoms, dancers and beasts that never walk a straight line. Gold falls slowly under this moon, too."),
    sandro("sneer", "Every mask here is a guest who hates you, Keeper. Come. Dance. Stay forever."),
    crag("grin", "I don't dance. I stomp. Works the same on a skeleton."),
    mortimer("nervous", "Please don't stomp the skeletons. Some of us are nice.")
  ]
};

/** Shown once when a world's last level is first cleared (worlds 1 to 9; world 10 ends with the epilogue). */
export const OC_WORLD_OUTRO: Record<number, OcLine[]> = {
  1: [
    crag("grin", "The Meadows are clear! Not a shambler left between here and the ridge."),
    mortimer("nervous", "Um. Hello. I'm Mortimer. I pin the letters to your gate. I'm very sorry about the holes."),
    mortimer("nervous", "Master Sandro says the next letter comes from Vori. It's cold there. My knees click."),
    crag("sly", "He's a polite one, for a skeleton. Pack your warm boots, Keeper. We follow the horde north.")
  ],
  2: [
    catherine("regal", "Well held, Keeper. Vori's passes are open again, and the caravans are moving."),
    crag("grin", "Told you they had backbone, Majesty! And the stew didn't even freeze."),
    catherine("stern", "Don't celebrate yet. The horde slipped south into the Tatalian Mire. Follow it."),
    catherine("regal", "And Crag: your camp is open. Keep the Keeper supplied. The crown will remember it.")
  ],
  3: [
    crag("grin", "Phew. Glad to wash that mire off my boots. Mud, leeches and walking corpses."),
    vidomina("cold", "Enjoy your puddle, Keeper. My master writes letters. I keep lists. You are on one now."),
    crag("sly", "She's sour because we smashed her graves. Up the mountains we go!")
  ],
  4: [
    crag("talk", "The wizards are safe in their towers. They sent a whole sack of thank-you notes. No gold, of course."),
    crag("shout", "And the tracks lead DOWN. Into Nighon's tunnels. Light your torches!")
  ],
  5: [
    crag("grin", "Out of the dark at last! My ears were starting to feel like bat ears."),
    mortimer("cheer", "Welcome back to the surface! Master Sandro asked me to say... well, it was mostly swearing."),
    crag("talk", "Smell that? Cold stone and old candles. That's Deyja. Sandro's front yard.")
  ],
  6: [
    crag("talk", "The barrows are quiet. Sandro slipped out the back door, into Eeofol."),
    mortimer("nervous", "Before Master Sandro raised me, I had a farm in the Meadows. Barley. A red door."),
    mortimer("nervous", "I can't remember who lived behind it. I used to know. I'm sure I used to know."),
    crag("talk", "...Then we hold the Meadows for them, whoever they were. That's a promise, bones."),
    crag("shout", "Now look: the sky over the mountains just went red. That's the Hellgate opening. Move!")
  ],
  7: [
    catherine("regal", "The Hellgate is shut. Erathia owes you, Keeper. And you, barbarian."),
    catherine("stern", "Three villages burned before it closed. I will read their names at the memorial. All of them."),
    crag("talk", "Sandro didn't go down with his dragon. He ran west into Krewlod, with bags of Chaos gold."),
    crag("sly", "He's hiring my old warband. Right. Time I paid them a visit.")
  ],
  8: [
    crag("grin", "Krewlod's clean! I even got five gold back off an old friend. Well, he dropped it. Same thing."),
    mortimer("cheer", "I've finished balancing Mr. Hack's ledger! He only owes twelve thousand gold now."),
    crag("sly", "...Let's keep that between us, bones."),
    crag("shout", "Wait. Look at the clouds. Is the sky TEARING? What did Sandro touch now?!")
  ],
  9: [
    vidomina("cold", "The Rift is closing. You saved your keep, and my Deyja with it. Don't mistake that for friendship."),
    vidomina("cold", "Sandro fled to his carnival. Masks and music, while the world nearly ended. Typical."),
    vidomina("smirk", "End his little party, Keeper. Then we will see who writes the next letter.")
  ]
};

/** Per level: Sandro's letter, Crag's briefing and his words after the first victory. */
export const OC_LEVEL_STORY: Record<string, OcLevelStory> = {
  // --- World 1: Erathian Meadows ---------------------------------------------
  "w1-1": {
    before: [
      crag("talk", "Right. Gold falls from the sky out here. Click the coins to collect them."),
      crag("talk", "Plant Peasant Tithes first. Each one pays 25 gold every 24 seconds."),
      crag("talk", "Then Longbowmen: an arrow down the lane every 1.4 seconds, and every fourth one is a critical hit."),
      crag("talk", "Your seed packets recharge after each planting, so you can't spam one troop."),
      crag("grin", "Shamblers get up once after a killing blow and crawl on. Shoot them again. They're dead, not clever."),
      crag("sly", "You start with a Surge orb. Press G or the orb button, click a troop, and watch it go wild. Glowing foes drop more.")
    ],
    after: [
      crag("grin", "HA! First blood to Order! Take the Dwarf Shieldwall: a 4000 HP wall for 50 gold, and spells only do half to it."),
      crag("talk", "Wins earn Seals. Spend them in the Barracks: each level is +15% health and power. Meet a level's goals for stars and more Seals.")
    ]
  },
  "w1-2": {
    letter: "Dear Keeper,\nI see you have met my shamblers. Please stop shooting them; they are very old.\nI require the crypt beneath your keep. Nothing personal. The ley lines are simply to die for.\nKindly leave the gate open.\n\nYour future landlord,\nSandro\n\nP.S. Sorry about the hole in your gate. - M.",
    before: [
      crag("talk", "Troglodytes found a pile of old helms. Each helm soaks the first 450 damage."),
      crag("talk", "Knock the helm off and the little fellow just stands there, dazed. Shoot him while he's thinking about it."),
      crag("talk", "Dwarf in front, archers behind. The wall holds them, the arrows do the work."),
      crag("shout", "And each lane's gate Champion rides out only ONCE. After that, nothing stands between the horde and your gate.")
    ],
    after: [
      crag("grin", "The Gremlin Sapper! 25 gold. He digs in a charge that's armed after 14 seconds: 1800 to the first foe that steps on it."),
      crag("talk", "And Magic Arrow for your hero's spellbook: 150 to one foe for 5 mana. Mana trickles back on its own.")
    ]
  },
  "w1-3": {
    before: [
      crag("shout", "All FIVE roads today. Stretch that gold."),
      crag("talk", "Skeleton Shieldbearers carry tower shields that soak 1000 from straight shots in front."),
      crag("talk", "And every fourth swing is a shield bash that stuns. Rude."),
      crag("sly", "Lobs, spikes and melee go around a shield, and a Sapper's charge goes under it. Bury one in their path. Boom.")
    ],
    after: [
      crag("grin", "The Snow Elf! Its frost spears make a foe walk and bite at half speed for 10 seconds."),
      crag("sly", "Try this: drop a Snow Elf packet on a Longbowman and you get an Arctic Sharpshooter. Piercing frost arrows!"),
      crag("talk", "And you've earned another seed packet slot. More packets, more options.")
    ]
  },
  "w1-4": {
    before: [
      crag("shout", "LAST STAND! No gold from the sky today. You get 1500 and not a copper more."),
      crag("talk", "Place everything first. Packets don't recharge while you plan, so choose well. Sound the horn when you're ready."),
      crag("talk", "Imp Runners sprint in and blink past the first defender they meet. Keep something behind your front line to catch them.")
    ],
    after: [
      crag("grin", "A Fire Elemental! It lands, and a moment later bursts: 1800 to every foe in the 3x3."),
      crag("sly", "And this beauty: the Endless Sack of Gold. +25 gold every 15 seconds. You've an artifact slot now, so equip it before battle!")
    ]
  },
  "w1-5": {
    letter: "Keeper,\nA small gift from my friends in Eeofol: hounds. They are house-trained, in the sense that they will train on your house.\nDo pat them. Briefly.\n\nWarmly (not really),\nSandro\n\nP.S. They don't like ear scratches. I found out. - M.",
    before: [
      crag("shout", "Hell Hounds! They race in, leap over the first defender they meet, and their bite keeps burning."),
      crag("talk", "So give them something cheap to jump, and something worth biting right behind it. A Dwarf makes a fine second wall."),
      crag("talk", "A big Hound leads every great assault. Save a Surge for it.")
    ],
    after: [
      crag("grin", "Look who rode in: Gelu, Ranger of AvLee! With him, arrows, spears and frost shots deal 30% more, and Rain of Arrows hits flyers too."),
      crag("talk", "Pick your hero before each battle. Each one brings a passive bonus and a signature spell."),
      crag("talk", "And a Sylph: every 10 seconds her gale blows the foes in her lane back 1.5 tiles, and flyers clean off the field.")
    ]
  },

  // --- World 2: Frozen Vori --------------------------------------------------
  "w2-1": {
    before: [
      crag("shout", "Dragon Flies! They fly OVER every defender, straight for your gate."),
      crag("talk", "Arrows can't touch them. A Sylph's gale blows flyers off the field."),
      crag("talk", "They hop lanes every two tiles, so put a Sylph in every lane."),
      crag("grin", "Gelu's Rain of Arrows swats them too. Buzz buzz, splat.")
    ],
    after: [
      crag("sly", "Yuuka, the Treasurer! 75 gold. She pays 15 every 18 seconds, 5 more each time, up to 45."),
      crag("grin", "It's called compound interest. I don't understand it, but I LOVE it.")
    ]
  },
  "w2-2": {
    before: [
      crag("shout", "Kobolds! Thieves! Every strike pockets 20 of YOUR gold."),
      crag("talk", "Once a Kobold has 60 in its sack, it turns and runs. Kill it before it escapes and you get the lot back."),
      crag("sly", "They're quick, too. Snow Elves slow them to a waddle.")
    ],
    after: [
      crag("grin", "A Cyclops Hurler! It lobs boulders over shields and smashes them, and every third boulder stuns for 2 seconds."),
      crag("talk", "And the Pendant of Courage: start each battle with a Surge orb, and carry four instead of three.")
    ]
  },
  "w2-3": {
    before: [
      crag("talk", "Caravan day. No gold at all: a belt hands you troops for free. And the first wave comes sooner."),
      crag("shout", "Place them before the belt fills up! Hands moving!"),
      crag("talk", "You don't get to choose, so read the belt: Sylphs for the flies, Dwarves for the front, Sappers under the shields.")
    ],
    after: [
      crag("grin", "An Iron Golem! 8000 HP, too tall to be leapt or bounded over, and spells only do half to it."),
      crag("talk", "And Frost Ring for your spellbook: it freezes the foes in a 3x3 for 5 seconds.")
    ]
  },
  "w2-4": {
    before: [
      crag("talk", "Satyrs. They bound over EVERY defender in their way. Walls, archers, the lot."),
      crag("talk", "Only something tall stops them for good. That's your Iron Golem."),
      crag("grin", "Their pipes also speed up the friends around them. Party animals.")
    ],
    after: [
      crag("talk", "A Pikeman: stabs every foe within a tile, in front or behind, and deals double to cavalry."),
      crag("sly", "And the Golden Bow: your straight shots pass through one more foe."),
      crag("grin", "Plus a Lizard Warrior from the Tatalian bogs! Once it drops under 30% health it CHARGES down its whole lane, then heads home.")
    ]
  },
  "w2-5": {
    letter: "Dear Keeper,\nThe cold suits the dead. It keeps us fresh.\nMy Death Riders were knights once. They still insist on charging. I have not the heart to tell them it is unfashionable.\n\nFrostily,\nSandro, Lord of the Horde\n\nP.S. Sorry about the handwriting. My fingers froze. Well. More than usual. - M.",
    before: [
      crag("shout", "Death Riders at the gallop! 900 armour, and their first strike is a lance charge for double damage."),
      crag("talk", "Pikemen deal double to cavalry. Put them where the Riders hit first."),
      crag("talk", "A great Rider leads every great assault. Keep a Surge ready.")
    ],
    after: [
      crag("grin", "Solmyr the Djinn joins you: mana twice as fast, and Chain Lightning. Plus the Storm Elemental: 1800 down its whole lane, flyers too."),
      crag("shout", "And the ASCENSION ALTAR! Slay foes to fill the Valor crown, press U, pick a troop: 15 seconds of +30% health and power."),
      crag("sly", "Only troops trained to level 3 in the Barracks can Ascend. And my Mercenary Camp is open. Bring Seals!")
    ]
  },

  // --- World 3: Tatalian Mire ------------------------------------------------
  "w3-1": {
    before: [
      crag("shout", "Goblin Sappers! They light a powder keg at your line, and 2.5 seconds later the whole 3x3 goes BOOM."),
      crag("talk", "Frost and stuns hold the fuse: Snow Elves, Cyclops boulders, Frost Ring."),
      crag("sly", "And fire on an unlit keg sets it off right where it stands, in their own ranks. A Fire Elemental makes a lovely surprise.")
    ],
    after: [
      crag("grin", "The Sharpshooter: every 5 seconds it shoots the toughest foe in its lane for 150, straight through armour. Flyers too.")
    ]
  },
  "w3-2": {
    before: [
      crag("talk", "PROTECT! Two Enchanters stand in the grove. If either one falls, we lose."),
      crag("talk", "Wall them in: a Dwarf in front of each, shooters behind. Mind the Goblin kegs, they blow up the whole 3x3."),
      crag("grin", "While they live they channel mana to your hero, so cast freely."),
      crag("shout", "And LADDER Hobgoblins! One props a ladder on your first big wall and every walker climbs over it. Even over a tall one!"),
      crag("talk", "Shoot the ladder-carrier before he plants it. Once it's up, it stays until that wall falls or you dig the wall up.")
    ],
    after: [
      crag("grin", "A Gnome: stone spikes in its tile. Foes walk right over it and take 40 a second. It never blocks."),
      crag("talk", "And Armor of Wonder: your defenders have 30% more HP.")
    ]
  },
  "w3-3": {
    before: [
      crag("grin", "Orc Berserkers. Distant cousins of mine. Wound one below half and it marches and strikes twice as fast."),
      crag("talk", "So don't tickle them. Burst them down in one go: Sapper charges, Fire Elementals, a Surge.")
    ],
    after: [
      crag("talk", "An Undine: every 12 seconds she wraps a neighbour in a 600 HP water shell."),
      crag("grin", "And Haste: all your defenders act 50% faster for 10 seconds.")
    ]
  },
  "w3-4": {
    letter: "Keeper,\nI have taken the liberty of planting some graves on your lawn. You may find them in the way. That is rather the point.\nThe residents will be up shortly.\n\nYour thoughtful neighbour,\nSandro\n\nP.S. Please don't blame the residents. They didn't ask to come. - M.",
    before: [
      crag("talk", "Graves on the lawn. You can't plant on them, and they soak up your shots."),
      crag("shout", "At every great assault the dead climb OUT of them! Break the graves in your busiest lanes early.")
    ],
    after: [
      crag("grin", "The Halfling Grenadier: lobs grenades across three lanes, 60 to the target and 35 to the foes around it."),
      crag("sly", "And the Shield of the Yawning Dead: one slain foe in five drops 15 gold.")
    ]
  },
  "w3-5": {
    letter: "Keeper,\nI send my apprentices, led by my most promising pupil. They raise graves as they walk, which is more than your peasants can say.\nAlso, the barbarian next door is a bad influence. He shouts.\n\nDisapprovingly,\nSandro",
    before: [
      crag("shout", "I DO NOT SHOUT."),
      vidomina("cold", "You do. I am Vidomina. Every 12 seconds, each of my Necromancers raises a fresh grave near it. Try to keep up."),
      crag("talk", "Sharpshooters pick off the tough ones, and Halflings lob over the graves."),
      crag("talk", "Kill the Necromancers and the graves stop coming. Simple.")
    ],
    after: [
      crag("grin", "Adelaide, the Frost Cleric! Your troops regenerate 5 HP a second, and Prayer heals everyone and speeds them up."),
      crag("talk", "An Ice Elemental: shatters into a frost nova, and every foe in the 3x3 is frozen solid for 10 seconds."),
      crag("sly", "And a second artifact slot. Two trinkets. Fancy.")
    ]
  },

  // --- World 4: Bracada Heights ----------------------------------------------
  "w4-1": {
    before: [
      crag("talk", "Medusa Queens stop 3.5 tiles from your line and stare. Every 6 seconds, one of your troops turns to stone for 4."),
      crag("talk", "Your shooters reach them where they stand. Don't wait for them to walk into a wall. They won't.")
    ],
    after: [
      crag("grin", "Enchanters! 3 mana to your hero every 12 seconds. More spells, more fun.")
    ]
  },
  "w4-2": {
    before: [
      crag("shout", "Harpy Snatchers! They drop onto your COSTLIEST troop and carry it off after 4 seconds."),
      crag("talk", "Kill her in time, or have a Sylph blow her away. She always goes for your priciest troop, so you know where she'll land.")
    ],
    after: [
      crag("grin", "The Arch Mage: bolts of 30 that leap on to two more nearby foes."),
      crag("talk", "And the Cards of Prophecy: your seed packets recharge 30% faster."),
      crag("sly", "And an Aegis Bearer. Its shield covers the 3x3 around it from anything lobbed or dropped from the sky. You'll want that soon.")
    ]
  },
  "w4-3": {
    before: [
      crag("shout", "Another LAST STAND! 3000 gold, no sky, no second helping."),
      crag("talk", "Satyrs, Riders and Medusas at once. Iron Golems stop the hoppers, Pikemen skewer the Riders."),
      crag("sly", "You start with a Surge orb. Keep it for when things go sideways."),
      crag("shout", "And a Goblin Siege CATAPULT! It parks on the lawn and lobs boulders at your REARMOST troop. Your gold-makers!"),
      crag("talk", "An Aegis Bearer's shield stops the boulders. When the catapult runs dry, it rolls forward and flattens things, so keep shooting.")
    ],
    after: [
      crag("grin", "A Master Genie: every 6 seconds it casts Slow on the three nearest foes, across three lanes."),
      crag("talk", "And Meteor Shower: 500 damage to the foes in a 3x3.")
    ]
  },
  "w4-4": {
    before: [
      crag("talk", "Evil Eyes stare straight past your walls, the troops with no attack of their own, and burn whatever stands behind."),
      crag("talk", "Sea Witches lob hexes. The troop they hit acts at half speed for 8 seconds."),
      crag("sly", "And Hexing Sorceresses turn a troop into a SHEEP for 8 seconds. Baa. Steadfast troops just shrug it off."),
      crag("grin", "None of them likes a boulder. Or an arrow. Or me.")
    ],
    after: [
      crag("grin", "The Zealot Cleric: holy orbs that hit the undead double, and every 5 seconds it heals the most wounded troop around it for 150."),
      crag("talk", "And the Shackles of War: the horde marches 15% slower.")
    ]
  },
  "w4-5": {
    letter: "Keeper,\nYou have beaten gazes, hexes and harpies. How tedious of you.\nMy ogres have brought drums. I asked for a quiet siege. They do not know the word.\n\nWith a headache,\nSandro\n\nP.S. The drums shook two of my ribs loose. I found one. - M.",
    before: [
      crag("shout", "Ogre Shamans! Their drums make every friend near them march and strike 35% faster."),
      crag("talk", "Kill the drummers first. A Sharpshooter goes for the toughest foe in its lane, and a Shaman is tough.")
    ],
    after: [
      crag("grin", "Tazar, Warlord of Tatalia! The horde deals 25% less damage, and Earthen Bulwark raises stone walls from the ground."),
      crag("talk", "The Faerie Dragon: every 4 seconds it throws a random spell at the nearest foe in its lane. Frost, fire or lightning."),
      crag("sly", "And one more seed packet slot. You're getting rich in options.")
    ]
  },

  // --- World 5: Nighon Depths ------------------------------------------------
  "w5-1": {
    before: [
      crag("talk", "Down here gold falls half as often. Plant your Peasants early."),
      crag("shout", "Sandworms tunnel under EVERYTHING and burst out behind your lines, facing your troops!"),
      crag("talk", "Keep something at the back to meet them. A Pikeman stabs behind as well as in front.")
    ],
    after: [
      crag("grin", "A Ballista! Heavy bolts that pierce every foe in the lane. Flyers too.")
    ]
  },
  "w5-2": {
    before: [
      crag("shout", "Wyvern Monarchs! Flying, 1100 HP of scales, and every 7 seconds they dive on whoever's beneath them."),
      crag("talk", "Arrows won't reach them. Ballistae, Sharpshooters, lightning and Sylph gales will.")
    ],
    after: [
      crag("grin", "Aris, the Hyper Cannon! She charges for 8 seconds while a foe is in her lane, then fires a 450 beam through every foe ahead of her.")
    ]
  },
  "w5-3": {
    before: [
      crag("talk", "Another belt. The mine cart brings war machines and heavy hitters: Ballistae, Golems, Storms, Arch Mages."),
      crag("talk", "There are Sandworms and Wyverns in this lot. Guard the back rows and the sky.")
    ],
    after: [
      crag("sly", "A Leprechaun: any foe slain in its lane or the two beside it has a 40% chance to drop 25 gold."),
      crag("grin", "And the Ogre's Club of Havoc: melee, gazes and lightning hit 50% harder. I want one.")
    ]
  },
  "w5-4": {
    before: [
      crag("talk", "Efreet Sultans shrug off burning shots. Leave the fire at home today."),
      crag("talk", "And hitting one up close scorches your fighter for a third of the blow. Use arrows, frost and boulders.")
    ],
    after: [
      crag("grin", "A Crusader! Blade of 50, and every foe it slays makes it strike 15% faster, up to five times.")
    ]
  },
  "w5-5": {
    letter: "Keeper,\nGold is so rare underground. How ever will you manage?\nThe Spider Princess has asked to meet you. She is very keen to keep you. Forever.\n\nFrom the deep,\nSandro\n\nP.S. I brought a broom for the webs. She kept the broom. - M.",
    before: [
      crag("shout", "The Spider Princess webs a 3x3 of your troops from 3 tiles away. And Cave Trolls heal 40 HP a SECOND."),
      crag("talk", "Burst damage wins here: Sapper charges, Fire Elementals, Meteor Shower. Don't nibble at a troll.")
    ],
    after: [
      crag("grin", "Sensei from Schale! Gold coins collect themselves, and Supply Drop calls in a Surge orb."),
      crag("talk", "The Ammo Cart: shooters in its 3x3 fire one extra shot with every volley."),
      crag("sly", "And a third artifact slot. Very fancy.")
    ]
  },

  // --- World 6: Deyja Barrows ------------------------------------------------
  "w6-1": {
    letter: "Keeper,\nWelcome to Deyja, my home. Do mind the queen. Carmilla is a dear friend and a terrible dinner guest.\nShe never leaves on the first goodbye.\n\nHospitably,\nSandro\n\nP.S. She keeps looking at me like a soup bone. Please hurry. - M.",
    before: [
      crag("talk", "Carmilla, the vampire queen. She heals from everything she bites, and she gets up once after you kill her."),
      crag("talk", "So kill her twice, and hard. Zealot Clerics deal double to the undead.")
    ],
    after: [
      crag("grin", "Hina, the Prefect! Machine-gun bursts: six rounds of 11 every 2 seconds.")
    ]
  },
  "w6-2": {
    before: [
      crag("talk", "Graves everywhere, and Necromancers making more. Look where you CAN plant before the first wave."),
      crag("shout", "Every great assault the graves spill their dead. Knock down the ones in your busiest lanes!")
    ],
    after: [
      crag("grin", "A Salamander: shots that pass through her catch fire. Double damage, and half again to the foes beside the target.")
    ]
  },
  "w6-3": {
    before: [
      crag("talk", "PROTECT again: three Zealot Clerics hold the chapel. None of them may fall."),
      crag("talk", "Harpies can't carry off the Clerics you're guarding, but they'll snatch your costliest other troop. Watch the sky."),
      crag("shout", "And Medusas turn them to stone from range. Kill the Medusas fast!"),
      crag("talk", "The Sorceresses are back too, hexing your troops into sheep. A sheep still blocks, but it won't heal or shoot.")
    ],
    after: [
      crag("grin", "A PHOENIX! It burns every foe close in front, 40 a second, and rises again once when slain."),
      crag("talk", "And the Orb of Tempestuous Fire: all your fire damage +50%.")
    ]
  },
  "w6-4": {
    before: [
      crag("shout", "Dread Knights! 1100 armour, and every third strike is a Death Blow for triple damage."),
      crag("talk", "They're cavalry, so Pikemen deal double. Line the front with pikes and keep the healers close.")
    ],
    after: [
      crag("grin", "A First Aid Tent: every defender in its lane heals 40 every 2 seconds.")
    ]
  },
  "w6-5": {
    letter: "Keeper,\nMy Pit Lords are harvesting. Every servant of mine that falls rises again, and again.\nIt is very efficient. You should try it. Oh wait. You can't.\n\nTriumphantly,\nSandro\n\nP.S. They said I'm too bony to harvest. I've never been so relieved. - M.",
    before: [
      crag("shout", "Pit Lords raise the last Chaos creature to fall, every 10 seconds. Over and over!"),
      vidomina("smirk", "Sandro calls it a harvest. I call it the only part of his plan that works."),
      crag("talk", "Kill the Pit Lord and the harvest ends. Save your Surges and your big spells for them.")
    ],
    after: [
      crag("grin", "Akagi, the Carrier! Every 6 seconds her planes bomb a random foe anywhere on the field, flyers too."),
      crag("shout", "And ARMAGEDDON: 800 fire to every foe. And 150 to every one of YOUR troops. Read the label!")
    ]
  },

  // --- World 7: Eeofol Hellgate ----------------------------------------------
  "w7-1": {
    before: [
      crag("talk", "Lucifina calls Imp Runners into her lane and both lanes beside it, every 10 seconds."),
      crag("talk", "Imps blink past the first defender they meet, unless it's tall. Iron Golems up front, and kill her quick.")
    ],
    after: [
      crag("grin", "A War Unicorn: troops in its 3x3, itself included, take 30% less damage.")
    ]
  },
  "w7-2": {
    before: [
      crag("shout", "Cacodemons! 1600 HP flying hell-balls, spitting lightning at whatever's beneath them."),
      crag("talk", "Anti-air shots, gales, lightning and spells. Ballistae and Sylphs earn their pay today.")
    ],
    after: [
      crag("grin", "An Ancient Behemoth! Every 7 seconds it leaps on the nearest foe just ahead and mauls it for 900.")
    ]
  },
  "w7-3": {
    before: [
      crag("shout", "LAST STAND at the breach! 4500 gold, then the horn."),
      crag("talk", "Chaos Hydras bite their lane AND both beside it, and they regenerate. Burst them down."),
      crag("sly", "You start with two Surge orbs. Don't take them to the grave.")
    ],
    after: [
      crag("grin", "A Cannon! Shells of 80 that burst on the first foe they hit: 60 to every foe within a tile, across three lanes.")
    ]
  },
  "w7-4": {
    before: [
      crag("shout", "Jotunn Warlords flatten any troop in ONE blow. And when they're wounded, they hurl Imps deep behind your lines."),
      crag("talk", "Don't let them reach you. Freeze them with Ice Elementals, bury Sapper charges, and keep a Pikeman at the back for the Imps.")
    ],
    after: [
      crag("grin", "A Lightning Generator: every 3.5 seconds it strikes the nearest foe in its lane, flyers too, and leaps to three more.")
    ]
  },
  "w7-5": {
    before: [
      crag("shout", "The Cyberdemon! Rockets from five tiles away that blast every troop around the target."),
      crag("talk", "Spells only do half to it. Sharpshooters shoot through its armour, and a Surge or two won't hurt.")
    ],
    after: [
      crag("grin", "A Mighty Gorgon: every 12 seconds its stare turns the nearest foe within 1.2 tiles to stone. Bosses just take 800."),
      crag("talk", "The Hellgate's next. Sandro's waiting at the top.")
    ]
  },
  "w7-6": {
    letter: "KEEPER,\nEnough. I shall come myself, riding the greatest thing I have ever raised: a Dracolich.\nYour keep, your crypt, your nexus. Mine by sundown.\nDo wave. I shall wave back, with a claw the size of a barn.\n\nYour doom, personally,\nSandro\n\nP.S. He practised the wave. For an hour. - M.",
    before: [
      crag("shout", "That's the Dracolich, and Sandro's riding it! It hovers at the far end of one lane, then glides to another."),
      crag("talk", "Only attacks that reach it, and your hero's spells, can hurt it. Long shooters in EVERY lane, since it moves."),
      crag("talk", "Its breath burns 200 down its lane, and it calls up the dead and Cacodemons. You get three Surge orbs, and no more."),
      crag("talk", "Whatever happens up there... it's been an honour. Now let's knock him off that thing.")
    ],
    after: [
      crag("shout", "CRAG! HACK! The Dracolich is DUST, and the Hellgate slams shut!"),
      vidomina("smirk", "A claw the size of a barn, he said. I'll have it framed. The pieces, anyway."),
      crag("grin", "Look who came through before it closed: a Titan, hurling 200-damage lightning at the nearest foe in its lane, however far."),
      crag("talk", "And an Archangel: its neighbours act 25% faster, and every 40 seconds it raises the last troop that fell nearby.")
    ]
  },

  // --- World 8: Krewlod Badlands ---------------------------------------------
  "w8-1": {
    letter: "Keeper,\nYou broke my Dracolich and shut my Hellgate. Rude.\nNo matter. Gold still buys swords. I have hired half of Krewlod, paid in advance. Unlike certain barbarians I could name.\n\nSolvently,\nSandro\n\nP.S. He threw the inkpot at me after writing this. I'm fine. Mostly. - M.",
    before: [
      crag("grin", "Sellswords! Erathian blades sold to Chaos. Their plate takes the first 400, and below 30% health they desert and run."),
      crag("sly", "Kill them before they run and their pay drops on the lawn: 25 gold each. Sea Dogs drop 15."),
      crag("talk", "Sea Dogs dodge every third straight shot. Lobs and spikes don't care.")
    ],
    after: [
      crag("grin", "A Santa Gremlin! It tosses gifts at close range and pays 15 gold every 20 seconds."),
      crag("talk", "And Lightning Bolt: 350 to one foe, flyers too.")
    ]
  },
  "w8-2": {
    before: [
      crag("shout", "Wolf Raiders! I KNOW these lads. They bite twice as often, and every bite hamstrings your troop."),
      crag("talk", "They're cavalry, so Pikemen deal double. Line the front with pikes."),
      crag("grin", "Their chief still owes me a pony. Tell him Crag says hello. With a pike.")
    ],
    after: [
      crag("grin", "A Royal Griffin: 2400 HP, and it tears 40 back out of everything that bites it.")
    ]
  },
  "w8-3": {
    before: [
      crag("talk", "Caravan road! The belt hands you Pikemen, Griffins, Crusaders and more."),
      crag("talk", "Nomad Outriders swerve round the first defender they meet, into a free lane next door. Guard the lanes beside, too."),
      crag("grin", "I rode with Nomads once. They never take the straight road home either.")
    ],
    after: [
      crag("grin", "A Centaur Captain: lances that pierce two foes, and when a foe gets close it gallops a tile back."),
      crag("sly", "And the Endless Purse of Gold: gold falls from the sky 40% more often. Now THAT is an artifact.")
    ]
  },
  "w8-4": {
    before: [
      crag("talk", "Rogues stay unseen until they're within 5 tiles of your gate, strike, or get caught in a blast. Each strike pockets 15 gold."),
      crag("shout", "And Bounty Hunters stop 4 tiles out and gun down your COSTLIEST troop in range!"),
      crag("sly", "I know Rogues. A Meteor Shower finds them, seen or not. Ruins their whole day.")
    ],
    after: [
      crag("grin", "A Mage: magic bolts, and every hit channels a quarter of a mana point to your hero."),
      crag("talk", "And Ice Bolt: 250 to one foe, and it freezes solid for 4 seconds.")
    ]
  },
  "w8-5": {
    letter: "Keeper,\nThe hounds of the pit have three heads, so they can be rude three times at once.\nTell the barbarian his old warband sends its regards. They were very cheap.\n\nWith receipts,\nSandro",
    before: [
      mortimer("nervous", "Hello. It's me. I, um... I quit. I left the letter first. It seemed rude not to."),
      mortimer("nervous", "He says I'm just bones. You never say that. Could I stay by your fire?"),
      crag("grin", "Pull up a stool, bones. You can keep my ledger. Nobody else will touch it."),
      crag("shout", "Now. Cerberi! Every bite also savages the troop standing behind the first one."),
      crag("talk", "Make your second troop sturdy too, and keep a First Aid Tent in the lane. Pikes still gut the cavalry behind them."),
      crag("sly", "Cheap? CHEAP? I'll show that warband cheap.")
    ],
    after: [
      crag("grin", "Dace, a Minotaur Warlord of Nighon, sworn to Order! Valor crowns build 50% faster, and Labyrinth Frenzy doubles melee damage."),
      crag("sly", "And the Ambassador's Sash: seed packets cost 15% less gold. Diplomacy!")
    ]
  },

  // --- World 9: The Void Rift ------------------------------------------------
  "w9-1": {
    letter: "Keeper,\nA small matter. In hiring certain... planar consultants, I may have torn a hole in the sky.\nThe things coming through are not entirely mine. Please kill them anyway. On my behalf.\n\nNot at all worried,\nSandro\n\nP.S. Mortimer, if you are reading this over the Keeper's shoulder: come home. The new courier is a bat. It bites.",
    before: [
      mortimer("nervous", "...I'm not going back."),
      crag("talk", "Wraiths regenerate, and every strike drains 2 of your hero's mana. Keep them off your troops."),
      crag("talk", "Mummies curse whoever they touch to half speed for 8 seconds. Both are undead, so Zealot Clerics deal double.")
    ],
    after: [
      crag("grin", "A Dendroid Soldier: a rooted 4000 HP wall, and foes just in front of it march and strike at half speed."),
      crag("talk", "And Blind: one foe, not a boss, stands helpless for 8 seconds.")
    ]
  },
  "w9-2": {
    before: [
      crag("shout", "Arch Devils vanish at the edge of the lawn and reappear BEHIND your lines!"),
      crag("talk", "Keep something tough at the back. A Pikeman stabs behind it too."),
      crag("talk", "And Magogs lob fire over your walls, so kill them quick.")
    ],
    after: [
      crag("grin", "Azusa the Trapper: every 30 seconds she buries an 1800 Land Mine up to 3 tiles ahead. Two at a time."),
      crag("talk", "And the Spirit of Oppression: Chaos auras, like Ogre Shaman drums, stop working.")
    ]
  },
  "w9-3": {
    before: [
      crag("shout", "LAST STAND! 4000 gold. Pain Elementals drift over your lines and burst into three Lost Souls when slain."),
      crag("talk", "Lost Souls dart over the first troop they meet. Have a second line ready for them."),
      crag("talk", "Power Liches drop death clouds on a 3x3. Dwarves take only half. You start with two Surge orbs.")
    ],
    after: [
      crag("grin", "Luna, the Fire Elementalist! Spells recover 40% faster, and Inferno sweeps three lanes with walls of fire."),
      crag("talk", "And a Silver Pegasus: it strikes the foes in front of it, and flyers passing overhead too.")
    ]
  },
  "w9-4": {
    before: [
      crag("talk", "Wakamo stalks unseen until she fires, then snipes the nearest troop for 150. Once she shoots, she's fair game."),
      crag("shout", "Mancubi scorch whatever stands within 3 tiles. Kill them before they get close!"),
      crag("talk", "Prism Elementals SPIN now and then. A straight shot that hits one mid-spin flies back at your line. Lob, zap or wait it out.")
    ],
    after: [
      crag("grin", "Laffey the Destroyer: torpedoes that run beneath shields and through the first three foes in her lane."),
      crag("talk", "And Implosion: 1500 to one foe, through armour. Point it at something big.")
    ]
  },
  "w9-5": {
    letter: "Keeper,\nThe Black Dragon came through the Rift. It ignores spells. It ignores me. I am trying not to take it personally.\nIt is coming your way. If you could deal with it, I would be... do not tell anyone... grateful.\n\nTemporarily yours,\nSandro",
    before: [
      vidomina("cold", "Listen to me, Keeper. Once. If that dragon reaches your crypt, it drinks the ley line dry. My dead die with it."),
      vidomina("cold", "So for today, I want you to win. Don't thank me. I'm not doing it for you."),
      crag("shout", "The Black Dragon! Flying, immune to spells, and too heavy for any gale."),
      crag("talk", "Ballistae, Sharpshooters, Titans, Aris, Akagi's planes, Pegasi, Lightning Generators: those reach it. Pack them in."),
      crag("talk", "It leads the great assaults. Keep your Surges for when it shows.")
    ],
    after: [
      crag("grin", "Belfast, the Royal Maid: deck guns, and every 4 seconds a 120 HP tea break for the most wounded troop around her."),
      crag("talk", "And Cure: every troop is cured of poison, curses, webs and stuns, and healed 150.")
    ]
  },

  // --- World 10: The Carnival of Masks ---------------------------------------
  "w10-1": {
    letter: "Dear Keeper,\nYou are cordially invited to my masquerade.\nDress: masks. Music: screaming. Guests: everyone who hates you.\nNo need to reply. We will come to you.\n\nYour host,\nSandro",
    before: [
      crag("talk", "Phantoms drift straight through your troops. While they phase, only blasts and hero spells touch them."),
      crag("talk", "Then they need 8 seconds before they can phase again. Keep a second line behind the first to finish them.")
    ],
    after: [
      crag("grin", "The Grand Elf Rearguard shoots down its lane, and behind it too, at anything that slipped past.")
    ]
  },
  "w10-2": {
    before: [
      crag("talk", "Werewolf Stalkers bound into a neighbouring lane every couple of tiles. They never stay put."),
      crag("talk", "Cover the lanes beside where they start. Troops that hit three lanes shine here: Halflings, Cannons, Genies.")
    ],
    after: [
      crag("grin", "A Nymph of the Mists: whatever bites her gets bewildered and wanders off into a neighbouring lane, slowed."),
      crag("sly", "Only 50 gold. Cheap AND confusing. My kind of troop.")
    ]
  },
  "w10-3": {
    before: [
      crag("grin", "The Revel Queen stops to dance and calls four Revellers around her: above, below, ahead and behind."),
      crag("talk", "Every 15 seconds she calls the missing ones back. Break the ring with splash, then take the Queen.")
    ],
    after: [
      crag("grin", "The Mechanic's Lodestone: every 10 seconds it tears the helm, armour or shield off the nearest armoured foe.")
    ]
  },
  "w10-4": {
    before: [
      crag("shout", "LAST STAND! 4500 gold. Battering Rams butt your front troop a tile back and stun it."),
      crag("talk", "Juggernauts roll right over your troops, 800 to each. A tall troop stops them cold. Gnome spikes pop them, and mines blow them apart."),
      crag("sly", "Two Surge orbs to start. The Rams are rude. The Juggernauts are ruder.")
    ],
    after: [
      crag("grin", "A Dwarven Axe-Thrower! Axes cut three foes going out, then spin home and cut again. The return swing hits shields from behind.")
    ]
  },
  "w10-5": {
    letter: "Keeper,\nMy last masquerade. My arch-viles raise the fallen where they lie, so this dance need never end.\nWhen the music stops, your keep is mine, and the crypt, and the nexus beneath.\nSave the last dance for me.\n\nForever (literally),\nSandro",
    before: [
      crag("shout", "This is it. Sandro's last masquerade. Arch-viles raise the fallen right where they fell."),
      crag("talk", "Stun them, freeze them, blow them back, or kill them first. Any of that breaks the spell."),
      mortimer("cheer", "I polished the gate for you. It's the only thing I know how to do for a battle."),
      crag("grin", "Everything you've learned, all at once. You've got this. And I've got stew on.")
    ],
    after: [
      crag("shout", "CRAG! HACK! The masks are off and the Carnival is OVER!"),
      crag("grin", "And look who stayed behind: a Sea Serpent that swallows foes whole, and Cupi. Whoever bites her falls in love and fights for Order.")
    ]
  },

  // --- Chaos Raids: the Keeper commands the horde ----------------------------
  r1: {
    before: [
      crag("sly", "Training exercise! Today YOU command the horde. Know your enemy, I always say."),
      crag("talk", "Spend Might to send Chaos down the lanes. Break through at the end of EVERY lane to win."),
      crag("talk", "Slay their Peasants for 75 Might each. Earthquake, War Cry and Resurrection are yours too, a few casts each.")
    ],
    after: [
      crag("grin", "Ha! Turns out shamblers march just fine when somebody sensible gives the orders."),
      sandro("sneer", "Don't flatter yourself. Anyone can push a skeleton down a road.")
    ]
  },
  r2: {
    before: [
      crag("grin", "Horde duty again! This farm has Sylphs to blow your flyers away and Iron Golems to stop your Satyrs."),
      crag("talk", "So pick your lanes. Send the right creature at the right wall.")
    ],
    after: [
      crag("sly", "Golems dodged, gales wasted. You're learning to think like Chaos. Don't let it go to your head.")
    ]
  },
  r3: {
    before: [
      crag("sly", "Now you know how it feels to be a Shambler. Spikes, water shells and a Sharpshooter wait in the mire."),
      crag("talk", "Your Necromancers raise graves, and graves soak their shots. Build cover, then push.")
    ],
    after: [
      crag("grin", "Told you graves make good cover. Straight through the mud!")
    ]
  },
  r4: {
    before: [
      crag("talk", "Arcane Walls: Genies slow you, Arch Mages chain their bolts, and Clerics heal the line."),
      crag("sly", "Find the lane they skimped on. Wizards always skimp somewhere.")
    ],
    after: [
      crag("grin", "Down go the wizards! Turns out advice doesn't stop a horde either.")
    ]
  },
  r5: {
    before: [
      crag("talk", "Ballistae pierce your lanes and Aris charges her cannon. So don't walk into them."),
      crag("grin", "Tunnel under them! Sandworms pop up behind the whole line.")
    ],
    after: [
      crag("grin", "Big cannons, and nobody watching behind them. Classic.")
    ]
  },
  r6: {
    before: [
      crag("shout", "The Last Citadel: Phoenixes, Unicorn wards, a First Aid Tent in every lane."),
      crag("sly", "But everything Chaos has is yours today. Pit Lords, Hydras, the Cyberdemon. Go on. Be dreadful.")
    ],
    after: [
      crag("grin", "The Citadel's flat! Even Sandro has to admit that was impressive."),
      sandro("sneer", "I admit nothing. My records will call it a tactical reorganisation.")
    ]
  },
  r7: {
    before: [
      crag("grin", "Mercenary payday! You're the one hiring sellswords today. Feels good, doesn't it?"),
      crag("talk", "Griffins bite back and Centaurs lance two at a time. Your Nomads swerve round the first wall, and your Rogues slip in unseen.")
    ],
    after: [
      crag("sly", "Paid on time, fought like devils. Funny how that works.")
    ]
  },
  r8: {
    before: [
      crag("talk", "Through the Rift: Azure Dragons, Gold Golems and mined lanes. A proper fortress."),
      crag("sly", "Your Arch Devils teleport behind their lines, and your Black Dragon laughs at gales. Make the most of it.")
    ],
    after: [
      crag("grin", "Every lane broken! You've held a keep against Chaos AND led Chaos against a keep. Now you know both sides.")
    ]
  },

  // --- Endless Siege ---------------------------------------------------------
  "oc-endless": {
    before: [
      crag("grin", "The Endless Siege! Every Chaos creature you've met, wave after wave, forever."),
      crag("talk", "After every great assault, pick one of three artifacts. They stack up. So does the horde."),
      crag("sly", "New records earn Seals. How long can you hold?")
    ]
  }
};

/** After the final level is cleared. */
export const OC_EPILOGUE: OcLine[] = [
  crag("talk", "Listen. No drums. No moaning. No masks. It's quiet."),
  sandro("rage", "Impossible! A Dracolich, a Hellgate, a whole carnival... undone by a Keeper and a barbarian with a stew pot!"),
  catherine("regal", "Undone by people who stood their ground. Erathia is whole again, Keeper. Thank you."),
  catherine("regal", "And Crag Hack: your contract, sealed by the crown. Paid in full. On time."),
  crag("grin", "On time! Hear that, Sandro? THAT'S why I fight for Order."),
  sandro("sneer", "Enjoy your coins. I shall return to Deyja, rebuild, and..."),
  vidomina("smirk", "You won't return to Deyja, Master. I changed the locks on the barrows this morning."),
  vidomina("cold", "Deyja is mine now. Rest well, Keeper. When I come for your crypt, I won't send letters first."),
  sandro("rage", "Treachery! Mortimer! Fetch my carriage!"),
  mortimer("cheer", "I work for Mr. Hack now, sir! I'm in charge of the ledger. And the spoons."),
  mortimer("nervous", "...The Meadows are safe now. I think whoever lived behind the red door would be glad."),
  crag("talk", "The crypt stays shut, the ley line sleeps, and the roads are yours again."),
  crag("grin", "Stew's on. Mercenaries and couriers eat free tonight. And if peace gets boring, the Endless Siege is always open."),
  crag("shout", "CRAG! HACK! ...Sorry. Habit.")
];

/** Battle quips: the UI picks one unlocked line per event. */
export const OC_BATTLE_QUIPS: Record<OcQuipEvent, OcGatedLine[]> = {
  start: [
    crag("shout", "Here they come! Plant fast!"),
    crag("talk", "First wave's on the road. Gold-makers first, then something with a sharp end."),
    crag("grin", "Ah, the smell of battle. And stew. Mostly stew."),
    crag("sly", "Every coin on the lawn is a coin in the war chest. Click, click, click!"),
    gated("w8-5", mortimer("nervous", "They're coming! I'll be behind the wall. Well, under it."))
  ],
  orb: [
    crag("shout", "A Surge orb! Grab it, press G, and click a troop!"),
    crag("talk", "That glowing foe dropped a Surge orb. Grab it before it fades, then press G."),
    crag("sly", "Orb on the lawn! Every troop has its own Surge. Try a new one!")
  ],
  "huge-wave": [
    crag("shout", "Big flag, big trouble! A HUGE wave is coming!"),
    crag("shout", "Great assault! Everything they've got, all at once!"),
    crag("talk", "Here comes the great assault. Now's the time for Surges and big spells."),
    sandro("sneer", "March, my darlings. Trample the lawn.")
  ],
  "final-wave": [
    crag("shout", "FINAL WAVE! Hold this one and we're done!"),
    crag("talk", "Last wave. Spend everything. Gold's no use in a grave."),
    crag("grin", "Final wave! Hold on and supper's on me.")
  ],
  crown: [
    crag("shout", "Valor crown's ready! Press U and pick a trained troop to Ascend!"),
    crag("talk", "Crown's full. Press U, pick a troop: 15 seconds, 30% tougher and stronger, fully healed."),
    crag("grin", "Crown up! Make someone a legend for fifteen seconds. Press U!")
  ],
  charger: [
    crag("shout", "The gate Champion rode out! That lane has no second chance now!"),
    crag("shout", "Champion's spent in that lane! Plug the hole before they come again!"),
    crag("talk", "That was the last guard in that lane. Anything else gets through, we lose. Wall it up.")
  ],
  boss: [
    crag("shout", "Big one incoming! Save your Surges for this!"),
    crag("talk", "That's the leader. Focus it: spells, Surges, everything."),
    crag("grin", "Ooh, that's a big one. The bigger they are, the more gold they don't pay you."),
    sandro("sneer", "Do meet my champion, Keeper. It's dying to meet you."),
    gated("w3-5", vidomina("cold", "Sandro's pet. Loud, slow and expensive. Like him."))
  ],
  victory: [
    crag("shout", "We held! We HELD!"),
    crag("grin", "Ha! Not one of them got past. Well, not enough of them."),
    crag("sly", "Victory! Now, about my fee... kidding. Mostly."),
    crag("grin", "Lovely work. Stew's on me."),
    gated("w8-5", mortimer("cheer", "We won! And nobody lost a rib! Well. I didn't."))
  ],
  defeat: [
    crag("talk", "Knocked flat? Get up. Next time, more gold-makers early. Gold is everything."),
    crag("talk", "They broke through. Check the Almanac for what beat you, and bring the answer."),
    crag("grin", "Every barbarian loses sometimes. Train your troops in the Barracks and try again."),
    crag("talk", "Try another hero, or swap a seed packet. Every foe has an answer."),
    crag("talk", "Don't sit on your Surges. Spend one when the great assault hits."),
    gated("w8-5", mortimer("nervous", "Don't feel bad. Sandro loses all the time. He just writes a letter about it."))
  ]
};

/** A greeting at the top of a menu screen: one unlocked line, picked at random. */
export const OC_SCREEN_LINES: Record<"home" | "camp" | "barracks" | "almanac", OcGatedLine[]> = {
  home: [
    crag("grin", "Keep's still standing, stew's still warm. Another round?"),
    crag("talk", "Chaos never takes a day off. Neither do our archers. Well, they nap."),
    catherine("regal", "Erathia sleeps easier with you on that gate, Keeper."),
    sandro("sneer", "I have drafted seventeen new invasion plans. Do take your time."),
    gated("w3-5", vidomina("cold", "Still here? Good. I like to know where my problems live.")),
    gated("w8-5", mortimer("cheer", "All quiet on the road today! I've counted. Twice."))
  ],
  camp: [
    crag("grin", "Welcome to the camp! Minotaurs and Beholders from Nighon, sworn to Order."),
    crag("sly", "Seals only. Gold's for the battlefield. Seals are for contracts."),
    crag("talk", "Hire one once and it joins your seed packets for good. Like family, only louder."),
    crag("grin", "Grab a bowl, look around. Nobody bites. Except the Minotaurs. Sometimes."),
    gated("w8-5", mortimer("cheer", "I keep the camp's books now! Mr. Hack's handwriting is... brave.")),
    gated("w8-5", mortimer("nervous", "The Minotaurs are lovely once they understand I'm not food."))
  ],
  barracks: [
    crag("talk", "Spend your Seals here. Every training level gives a troop +15% health and power."),
    crag("grin", "Tougher troops hold lanes longer. Simple barbarian maths."),
    crag("shout", "Put those Seals to work! Seals in a drawer never stopped a shambler."),
    gated("w2-5", crag("sly", "Train a troop to level 3 and the Altar lets it Ascend in battle. Press U when the crown's full."))
  ],
  almanac: [
    crag("talk", "The Almanac! Every friend and foe we've met, all in one book."),
    crag("sly", "Stuck on a level? Read up on what beat you. Every foe has an answer."),
    crag("grin", "Know what they do before they're on your lawn. Saves a lot of wall."),
    sandro("sneer", "A catalogue of my magnificent army. Do admire the illustrations."),
    gated("w1-5", mortimer("nervous", "Is my cousin in there? He'd love to be in a book.")),
    gated("w3-5", vidomina("cold", "Study, Keeper. It's the only weapon that never runs out."))
  ]
};

/** Said after an Endless Siege run: `best` for a new record, `short` otherwise. */
export const OC_ENDLESS_LINES: { best: OcGatedLine[]; short: OcGatedLine[] } = {
  best: [
    crag("grin", "New record! The horde broke on your walls like waves on rock."),
    crag("shout", "Look at that! Sandro will need a new ledger just to count his losses."),
    crag("sly", "A personal best! Bragging rights across all Krewlod."),
    gated("w8-5", mortimer("cheer", "I lost count after a while, but it was a lot! That's a record, I think!"))
  ],
  short: [
    crag("talk", "No record this time. Try other artifacts and have another go."),
    crag("grin", "Good stand anyway. They got a bloody nose before the gate gave."),
    crag("sly", "Endless means endless. They'll be right there when you're ready."),
    gated("w8-5", mortimer("nervous", "That was very scary. But the gate's still on its hinges!"))
  ]
};
