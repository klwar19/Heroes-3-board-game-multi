/**
 * Order & Chaos: the story told between battles. Brookhold, a small keep on the
 * Erathian border, sits over a crypt on the Nexus, a knot of ley lines that
 * Sandro, the lich of Deyja, wants for an army that never stays dead. The
 * Keeper (the player) holds it, taught by Crag Hack, the retired barbarian with
 * the wagon by the well, and follows each part of Sandro's plan from world to
 * world. Queen Catherine commissions the Keeper; Vidomina is Sandro's ambitious
 * apprentice; Mortimer is the skeleton courier who pins his letters to the gate.
 * Scenes mix speakers with storybook narration. Pure data: the UI shows each
 * scene once (remembered in the player's progress) and can replay it.
 */

export type OcSpeaker = "crag" | "sandro" | "catherine" | "vidomina" | "mortimer";
export type OcMood = "talk" | "grin" | "shout" | "sly" | "sneer" | "rage" | "regal" | "stern" | "cold" | "smirk" | "nervous" | "cheer";
export type OcLine = { who: OcSpeaker; mood: OcMood; text: string };
/** A line that is only said once the player has cleared the level `after` (always, without it). */
export type OcGatedLine = OcLine & { after?: string };
/** Storybook narration inside a scene: no speaker, no portrait (never in bubbles or battle quips). */
export type OcNarration = { who: "narrator"; text: string };
/** A line of a story scene: someone speaking, or the narrator. */
export type OcSceneLine = OcLine | OcNarration;

export function isNarration(line: OcSceneLine): line is OcNarration {
  return line.who === "narrator";
}

/** Per level: Sandro's letter (read before the talk), the scene before the battle, and the words after a first victory. */
export type OcLevelStory = { letter?: string; before?: OcSceneLine[]; after?: OcLine[] };

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
// Narration sets the scene and never states a rule.

const crag = (mood: "talk" | "grin" | "shout" | "sly", text: string): OcLine => ({ who: "crag", mood, text });
const sandro = (mood: "sneer" | "rage", text: string): OcLine => ({ who: "sandro", mood, text });
const catherine = (mood: "regal" | "stern", text: string): OcLine => ({ who: "catherine", mood, text });
const vidomina = (mood: "cold" | "smirk", text: string): OcLine => ({ who: "vidomina", mood, text });
const mortimer = (mood: "nervous" | "cheer", text: string): OcLine => ({ who: "mortimer", mood, text });
const narrator = (text: string): OcNarration => ({ who: "narrator", text });
const gated = (after: string, line: OcLine): OcGatedLine => ({ ...line, after });

/** The id the prologue is remembered under (bumped when the story was rewritten, so returning players see the new opening once). */
export const OC_PROLOGUE_ID = "prologue:v3";

/** The first time the player opens the mode. */
export const OC_PROLOGUE: OcSceneLine[] = [
  narrator("Brookhold is just an old stone keep on the border road. For a hundred years, nothing ever happened here."),
  narrator("Tonight the garrison marched east to the war. You're the steward's assistant, left behind with a ring of heavy keys and a very large gate."),
  narrator("At midnight, a mud-spattered rider knocks and leaves a letter bearing Queen Catherine's royal seal."),
  catherine("stern", "To whoever is holding Brookhold. The dead are marching across our border, and your keep sits squarely in their path."),
  catherine("regal", "I can't spare an army for you. As of tonight, you're the Keeper of Brookhold. Hold the gate. Help will come from next door."),
  narrator("Next door is a painted wagon parked by the well. Something boiling in an iron pot smells like onions and trouble."),
  crag("grin", "So you're the new Keeper. Crag Hack. Barbarian. Retired, mostly. The Queen pays me to keep an eye on you. Well, eventually."),
  crag("talk", "Here's our problem. Sandro, that dried-up lich from Deyja, has gathered every lawless thing he could find: the dead, demons, beasts, sellswords."),
  crag("sly", "Right under your cellar floor is an old crypt on the Nexus, a knot of deep magic. Raise an army there, and it won't ever stay dead."),
  crag("talk", "Sandro wants that crypt. His horde will roll down these roads toward your gate, lane by lane, wave after wave."),
  crag("grin", "You put your soldiers in the lanes. I'll show you how to fight. And we've got hot stew."),
  crag("sly", "Why does an old barbarian fight for Order? Simple. Chaos never pays on time."),
  narrator("Thunk. A bone pins a black envelope right to the oak gate. Below it, a small skeleton wrings his bony hands."),
  mortimer("nervous", "Oh dear. Sorry about the wood. A letter for the Keeper, from Master Sandro. I'll just slip away now. Terribly sorry."),
  narrator("The letter is written in neat, elegant ink."),
  sandro("sneer", "Enjoy your little keep while it stands, Keeper. I've already measured your crypt for curtains.")
];

/** Shown when a world is first entered. */
export const OC_WORLD_STORY: Record<number, OcSceneLine[]> = {
  1: [
    narrator("Morning light hits the gate tower. Down the Meadows road, a long grey line of shuffling shapes comes into view."),
    crag("talk", "Here they come. Sandro's shamblers, fresh out of the Deyja dirt. Slow, dumb as fence posts, and way too many of them."),
    crag("talk", "Time to learn the trade. Grab the gold when it drops, plant troops from your seed packets, and save your Surges for trouble."),
    crag("grin", "Don't sweat it. Everybody's useless in their first siege. I was hopeless in mine, and I was the one trying to break in.")
  ],
  2: [
    narrator("Three days north by wagon, the road climbs into Vori: sheer ice, howling wind, and glaciers as blue as bottle glass."),
    crag("talk", "The Ascension Altar is right at the top. We've got to clear these passes one by one so Sandro doesn't reach it first."),
    crag("shout", "Keep your eyes on the clouds. The horde beat us to the glaciers, and some of them can FLY now."),
    crag("talk", "You'll need Sylph gales and steady aim. There's a supply caravan ahead too, and it pays in fresh troops instead of gold."),
    crag("sly", "Oh, and a few of Sandro's shamblers turned up at the wagon last night. He stopped paying them, so now they work for stew."),
    crag("talk", "I call them the Turncoats. The Queen has a job for them: the Chaos Raids. And the Endless Siege is open at Brookhold. Both pay Seals.")
  ],
  3: [
    narrator("The Tatalian Mire. Thick warm mud, freezing fog, and neat rows of fresh graves where no village ever buried a soul."),
    crag("talk", "Somebody's farming corpses out here. Straight tidy rows, like cabbages. That's not Sandro's style. He's far too sloppy to be tidy."),
    crag("talk", "Some fights here need you to PROTECT troops already out on the field. If even one drops, the whole battle's lost."),
    crag("sly", "Good news, though. My Mercenary Camp is open for business. Minotaurs and Beholders from Nighon, sworn to Order. Seals only, no haggling."),
    crag("grin", "Watch where you step. Anything in this swamp that isn't mud is probably hungry.")
  ],
  4: [
    narrator("Bracada Heights. Tall white towers rise above the mountaintops, tied together by bridges of cloud. The wind smells of old ink and thunder."),
    crag("talk", "The wizards lock their precious star-charts up here. Sandro's raiders are already scrambling up the walls to grab them."),
    crag("talk", "He brought plenty of nasty sorcery along this time: stone gazes, dirty hexes, and claws dropping from the sky."),
    crag("talk", "A lot of these creeps stop and hit you from range. A wall won't keep you safe, so put them in the dirt where they stand."),
    crag("grin", "The wizards promised to pay us for the rescue. Good news, it's plenty. Bad news, it's mostly advice.")
  ],
  5: [
    narrator("The wagon rumbles down a collapsed mine ramp into Nighon. No sky down here: just damp black rock, glowing fungus, and pickaxes clattering ahead."),
    crag("talk", "Underground at last. Mind your pockets, gold drops half as often down in the dark, so every coin matters."),
    crag("talk", "You get a little extra starting purse to help you get moving. Get your gold-makers planted first, then build your wall."),
    crag("talk", "Beasts tunnel, horrors fly, and somewhere up at the shaft head the Spider Princess is spinning webs in the dark."),
    crag("grin", "Not everybody down here is a monster, mind you. My Minotaurs send their regards. Well, a grunt. Same difference.")
  ],
  6: [
    narrator("Deyja. Barren grey hills, leafless black oaks, and burial mounds stretching in every direction. Even the crows sound dead."),
    vidomina("cold", "Sandro is off in Eeofol, making deals. Deyja answers to me now. Wipe your muddy boots. Or don't, you won't stay long."),
    crag("talk", "Charming hospitality. Keep sharp, the moon's out, so gold falls slow again. And Zealot Clerics hit undead for double damage."),
    mortimer("nervous", "Watch where you step around the barrows, please. My cousin's resting under lane three, and he's a terribly light sleeper."),
    crag("sly", "Making deals in Eeofol with demons. I don't like the sound of that at all.")
  ],
  7: [
    narrator("Eeofol. Jagged volcanic crags, rivers of spitting lava, and high on the peak the Hellgate stands wide open, vomiting demons."),
    crag("talk", "So that's what Sandro bought with his promises. He traded something away, and they opened the pit for him. We close it, or nobody sleeps again."),
    crag("talk", "Swarming imps, floating fireballs, hydras, and massive giants. And right at the summit, Sandro himself."),
    sandro("rage", "You've gone entirely too far, Keeper! The gate belongs to ME, and so does everything waiting inside!"),
    crag("grin", "Listen to him screech. That means we're winning.")
  ],
  8: [
    narrator("Krewlod. Swirling red dust, baking winds, and canyon gulches as deep as an old grudge. Crag goes quiet as the wagon clatters in."),
    crag("grin", "Krewlod! Home sweet home. Smell that hot red sand. Ahh. Smells like unpaid tavern tabs."),
    crag("talk", "Sandro ran out of skeletons, so he's buying breathing blades: sellswords, wolf riders, nomads, rogues. All paid in demon gold."),
    crag("talk", "Hired blades drop their pay when they fall, and the wounded ones try to desert. Put them down before they run."),
    crag("sly", "Trouble is, I used to ride with half these cutthroats. Some owe me gold, some say I owe them. Let's not compare notes.")
  ],
  9: [
    narrator("Where the jagged rift in the clouds strikes the earth, the grass has crystallized into glass. Strange horrors crawl out of the tear."),
    vidomina("cold", "Sandro wasted the last of his demon gold hiring planar mages. They tore reality apart. What crawls out answers to nobody."),
    crag("talk", "Mana-draining wraiths, devils jumping right behind your line, and winged terrors that laugh at spells. Keep your guard up."),
    crag("talk", "Worst part is, nobody's commanding them. At least Sandro's boneheads marched down the road in proper lanes.")
  ],
  10: [
    narrator("Beyond the Rift, under an unnaturally bloated moon, eerie waltz music drifts through the trees. Paper lanterns. Masked revelers."),
    crag("talk", "The Carnival of Masks. Sandro's grand finale. Every dancer twirling on that lawn is bound to his dark ritual."),
    crag("talk", "Phantoms, acrobats, and beasts that won't walk a straight line for anything. Gold drops slow under this cursed moon, too."),
    crag("grin", "I don't do ballroom dancing. I stomp. Breaks a rib just as well either way."),
    mortimer("nervous", "Please don't stomp all the skeletons, Mr. Hack. Some of us are quite polite.")
  ]
};

/** Shown once when a world's last level is first cleared (worlds 1 to 9; world 10 ends with the epilogue). */
export const OC_WORLD_OUTRO: Record<number, OcSceneLine[]> = {
  1: [
    narrator("The Meadows road goes quiet for the first time all week. Just crows, the wind, and Crag's iron pot bubbling by the well."),
    crag("grin", "Not a single shambler left between here and the ridge. You're a natural, Keeper. A bit slow on your feet, but a natural."),
    narrator("A polite knock rattles the oak gate. Mortimer stands outside, twisting his hat in his bony hands."),
    mortimer("nervous", "Hello again. No letter today, sorry. Master Sandro was in a dreadful rush. He's packed his finest cloak and gone north to Vori."),
    crag("talk", "Vori? What's a dried-up bag of bones doing in the snow?"),
    mortimer("nervous", "Something about an altar. Oh dear. I wasn't supposed to mention that, was I? Please pretend you didn't hear it."),
    crag("talk", "The Ascension Altar. Ancient magic. It turns ordinary soldiers into walking legends, even if it's only for a short while."),
    crag("shout", "If Sandro crowns his champions at that altar, no gate we have will stop them. Bar the doors and pack the wagon. We're heading north."),
    mortimer("nervous", "Could you please not tell him I talked? Thank you ever so much. And sorry about the gate.")
  ],
  2: [
    narrator("Royal banners flutter up the snowy pass. Riding at their head, with fresh frost on her heavy cloak, is Queen Catherine herself."),
    catherine("regal", "So you're my new Keeper. Brookhold didn't fall, and now you've secured the Altar. Erathia owes you a great debt."),
    catherine("stern", "I had to see it myself. Far too many of my frontier captains write lovely reports full of complete nonsense."),
    crag("grin", "Your Majesty. Always a pleasure. Now, seeing as you're here... what about my back pay?"),
    catherine("regal", "It's paid, barbarian. Three weeks late, in proper royal fashion. Put it into your Mercenary Camp and keep my Keeper equipped."),
    catherine("stern", "One more matter. My scouts watched the horde swing south into the Tatalian Mire. Something foul is growing down there. Go see what it is."),
    crag("sly", "Three weeks late still beats Chaos. Grab an extra pair of boots, Keeper. The swamp mud eats the first pair for breakfast.")
  ],
  3: [
    narrator("The swamp fog slowly clears. Vidomina stands right at the water's edge, spotless and dry, watching her freshly dug graves collapse."),
    vidomina("cold", "A tidy little victory. Enjoy it. I've seen everything I needed to know about how you fight."),
    vidomina("smirk", "While you were splashing around in the mud, Sandro slipped off to Bracada. You're watching the wrong tower, Keeper."),
    narrator("She takes a quiet step backward into the grey mist and simply vanishes."),
    crag("talk", "Bracada. The wizards up on the peaks keep star-charts of every ley line in the world, including every path straight to the Nexus."),
    crag("shout", "Whatever Sandro thinks he's stealing from those charts, he isn't getting it. Get to the wagon. We're moving.")
  ],
  4: [
    narrator("The war drums fall silent. The towers are still standing. Wizards peek out onto their high cloud bridges and applaud with polite fingertips."),
    crag("grin", "Look at that. They sent over an entire sack of thank-you letters. Not a single coin inside, naturally."),
    narrator("Then the Grand Magus comes sprinting down the marble steps, hoisting his silk robes with one hand and waving an empty leather case with the other."),
    crag("talk", "Hold on. He says the vault lock was picked weeks ago. Somebody copied those charts long before we ever set foot up here."),
    crag("talk", "Those charts show a secret way into your crypt from underneath. Straight up from Nighon, through the abandoned deep tunnels."),
    crag("shout", "This entire siege was just to keep us looking up. Sandro's digging under your cellar right now. Light the torches, we're going underground.")
  ],
  5: [
    narrator("Crag sparks the fuse himself. The mine tunnel caves in with a deafening roar, burying the shaft to Brookhold under tons of rock."),
    crag("grin", "That slams the back door shut for good. Good to see daylight again, my ears were starting to feel like bat ears."),
    narrator("Standing near the dusty cave entrance, blinking in the bright sun, Mortimer waits politely."),
    mortimer("cheer", "Welcome back to the top! Master Sandro asked me to deliver a message. It was mostly dreadful swearing, so I left that out."),
    mortimer("nervous", "He went back home to Deyja. Said he's done being clever and he'll just raise everything at once. He sounded awfully tired."),
    crag("talk", "No more fancy diversions, then. Just every barrow in Deyja spilling open at once. Unless we get there to stop him.")
  ],
  6: [
    narrator("The barrows fall quiet as the dark harvest ends. Mortimer stands alone beside an unmarked, mossy headstone."),
    mortimer("nervous", "Before Master Sandro brought me back, I farmed out in the Meadows. Good barley. A bright red painted door."),
    mortimer("nervous", "I can't remember who lived inside with me. I used to know their names. I'm quite sure I used to know."),
    crag("talk", "Then we make sure the Meadows stay safe for whoever is living there now. That's a promise, bones."),
    narrator("Far to the south, above the jagged ridges of Eeofol, the clouds flare the angry red of an open wound."),
    crag("shout", "The Hellgate's tearing wide open. So THAT'S what Sandro traded for in the dark. Move your boots.")
  ],
  7: [
    narrator("The Hellgate slams shut like thunder. Then quiet settles over the scorched ash. For the first time in weeks, a bird sings."),
    narrator("Erathia's grand army finally marches in: too late for the battle, but perfectly on time for speeches. Catherine rides in front."),
    catherine("regal", "The gate is sealed. Erathia owes you everything, Keeper. And you as well, barbarian."),
    catherine("stern", "Three border villages burned before we closed it. I will read every one of their names at the service."),
    crag("talk", "Sandro didn't burn with his dragon, Majesty. He leaped clear and took off west into Krewlod with heavy sacks of demon gold."),
    crag("talk", "He's got no army left, but gold buys steel in the badlands. That means he's hiring."),
    crag("sly", "And I know just who he'll try to buy first: my old warband. Time I went and had a word with the boys.")
  ],
  8: [
    narrator("The old warband's frayed banner lies in the red dust. Crag picks it up, dusts it off, and tucks it away inside the wagon."),
    crag("talk", "Most of the lads scattered for home. Good. They weren't wicked, just hungry, and poorly led once I walked away."),
    mortimer("cheer", "I've finished balancing Mr. Hack's ledger! He only owes twelve thousand gold now."),
    crag("sly", "Let's keep that number strictly between friends, bones."),
    narrator("A rip like splitting timber cracks through the cloudless sky. Above the peaks, the blue air tears apart like wet parchment."),
    crag("shout", "The sky is TEARING open. What in the world did Sandro fiddle with now?")
  ],
  9: [
    narrator("With a wet snap, the Rift seals shut. The brittle glass fields fracture into dust, and green grass shoots back through."),
    vidomina("cold", "The Rift is sealed. You saved your keep, and my Deyja alongside it. Don't mistake that for friendship."),
    vidomina("smirk", "Sandro scurried past the Rift to his carnival. Masks and waltzes while the sky fell apart. Entirely typical of him."),
    vidomina("cold", "It isn't a mere celebration. It's an ancient ritual dance over a ley line where nothing that drops stays dead."),
    crag("talk", "A dance of corpses on a raw ley line. That's his desperate grab at the Nexus, then."),
    vidomina("smirk", "Crash his little masquerade, Keeper. Then we'll see who sends the next letter.")
  ]
};

/** Per level: Sandro's letter, the scene before the battle and Crag's words after the first victory. */
export const OC_LEVEL_STORY: Record<string, OcLevelStory> = {
  "w1-1": {
    before: [
      narrator("The first shamblers shuffle up to the fence line. Three dirt roads lead to your gate, and the dead are wandering down all three."),
      crag("talk", "Right, first lesson: gold. Out here in the open, it drops right out of the sky. Click the coins to pick them up."),
      crag("talk", "Get Peasant Tithes down early. Each one pays you 25 gold every 24 seconds. If you run out of gold, you run out of soldiers."),
      crag("talk", "Behind them, put Longbowmen. They fire down the lane every 1.4 seconds, and every fourth arrow hits as a critical strike."),
      crag("talk", "Once you plant a unit, its seed packet takes a moment to recharge. You can't just spam the same troops back-to-back."),
      crag("grin", "Watch out for the shamblers getting back up. They take one killing blow, drop, then crawl on. Put another arrow in them."),
      crag("sly", "One last trick: you've got a Surge orb. Press G, or click the orb button, then click a troop to send it wild. Glowing enemies drop fresh orbs.")
    ],
    after: [
      crag("grin", "That's how we do it! First blood to Order. Here, take the Dwarf Shieldwall: 4000 HP of stubborn stone for 50 gold, and enemy spells only do half damage to it."),
      crag("talk", "Wins earn Seals. Spend them in the Barracks: each level adds +15% health and power. Hit a level's goals for extra stars and more Seals.")
    ]
  },
  "w1-2": {
    letter: "Dear Keeper,\nI see you've met my shamblers. Do stop shooting them, they're terribly old.\nI need the crypt beneath your keep. Nothing personal, but the ley lines are simply to die for.\nBe a dear and leave the gate unlatched. I'll bring my own furniture.\n\nYour future landlord,\nSandro\n\nP.S. Terribly sorry about the dent in your gate. - M.",
    before: [
      crag("sly", "Landlord, my axe. He hasn't even seen your cellar. It's full of damp mildew and old turnips."),
      narrator("Down by the river, Troglodytes rummage through an old battlefield. Each one clambers up wearing an Erathian soldier's iron helm."),
      crag("talk", "Those iron helms soak up the first 450 damage. Knock the helm off and the poor beast just stands there dazed. Drop him while he's confused."),
      crag("talk", "Set a Dwarf in front with archers behind. The wall takes the beating while the arrows do the killing."),
      crag("shout", "Don't forget: each lane's gate Champion only rides out ONCE. If a lane breaks after that, they're straight through to the keep.")
    ],
    after: [
      crag("grin", "Here's a Gremlin Sapper for 25 gold. He plants a hidden charge that arms after 14 seconds: deals 1800 damage to the first enemy stepping on it."),
      crag("talk", "Plus, you've got Magic Arrow in your spellbook now: 150 damage to a target for 5 mana. Your mana trickles back on its own over time.")
    ]
  },
  "w1-3": {
    before: [
      narrator("Past the rocky ridge, the road branches five different ways before reaching Brookhold. Today, the dead are shambling down all five."),
      crag("talk", "All FIVE lanes this time. You'll have to make every copper count."),
      crag("talk", "See those heavy shields? Skeleton Shieldbearers. Those tower shields soak up 1000 damage from straight-on frontal shots."),
      crag("talk", "To make it worse, every fourth swing they throw is a shield bash that stuns. Real rude."),
      crag("sly", "Straight arrows hit the wood, but lobs, spikes, and melee swing right past it. And a Sapper's mine blows them from underneath. Plant one and watch.")
    ],
    after: [
      crag("grin", "Meet the Snow Elf. Her frost spears slow an enemy's walk and attack to half speed for 10 seconds."),
      crag("sly", "Here's a neat trick: drop a Snow Elf packet onto a Longbowman and you get an Arctic Sharpshooter with piercing frost arrows."),
      crag("talk", "You've also unlocked another seed packet slot. More slots mean more tricks in your pocket.")
    ]
  },
  "w1-4": {
    before: [
      narrator("The horde surrounds the old river mill with the millers trapped inside. No supply cart can get through the encirclement."),
      crag("talk", "It's a LAST STAND. No coins falling from the sky today. You've got 1500 gold in hand, and that's every copper you get."),
      crag("talk", "Plan your whole layout first. Packets won't recharge while you set up, so spend wisely. Blow the horn when you're ready to fight."),
      crag("talk", "Sandro sent Imp Runners this time. They sprint in fast and blink right past the first defender they hit."),
      crag("sly", "Keep a second line behind your wall to tackle them. Those millers are counting on us. And so is my breakfast bread.")
    ],
    after: [
      crag("grin", "Look at this Fire Elemental! You drop it down, and a heartbeat later it bursts for 1800 damage to every enemy in a 3x3 area."),
      crag("sly", "And check out the Endless Sack of Gold: +25 gold every 15 seconds. You've unlocked an artifact slot now, so equip it before the fight.")
    ]
  },
  "w1-5": {
    letter: "Keeper,\nA small courtesy from my associates in Eeofol: hounds. They're house-trained, in that they'll train their teeth on your house.\nDo feel free to pet them. Briefly.\n\nWarmly (not really),\nSandro\n\nP.S. They really don't like scratches behind the ears. I found out the hard way. - M.",
    before: [
      narrator("At dusk, the stench of brimstone drifts across the wheat fields. A beast howls in the dark, and a haystack suddenly catches fire."),
      crag("talk", "Hell Hounds. Demonic lords don't just lend their pets to anyone. Sandro's got friends in deep places."),
      crag("talk", "They sprint in and leap clean over the first defender in their way, and their bite leaves a nasty burning wound."),
      crag("talk", "Give them something cheap to vault over, with a solid defender right behind it. A Dwarf makes a great second line."),
      crag("sly", "A massive alpha Hound leads each big assault wave. Save a Surge orb to knock its teeth out.")
    ],
    after: [
      crag("grin", "Look who stopped by: Gelu, Ranger of AvLee! He boosts arrows, spears, and frost shots by +30%, and his Rain of Arrows swats flyers out of the air."),
      crag("talk", "You can pick your hero before every fight now. Each one gives your army a passive perk and a unique signature spell."),
      crag("talk", "You also get a Sylph: every 10 seconds her gust pushes enemies in her lane back 1.5 tiles, and sweeps flyers clean off the map.")
    ]
  },
  "w2-1": {
    before: [
      narrator("The first high mountain pass. A shrill, angry drone echoes over the blue ice, like hundreds of boiling tea kettles."),
      crag("talk", "Dragon Flies. They fly right OVER your ground defenders, bee-lining straight for the gate."),
      crag("talk", "Regular arrows won't reach them up high, but a Sylph's gale blows flying pests clean off the field."),
      crag("talk", "Every two tiles they hop sideways into the next lane, so you'll want a Sylph covering every path."),
      crag("grin", "Gelu's Rain of Arrows swats them out of the sky too. One good spell and buzz buzz, splat.")
    ],
    after: [
      crag("sly", "Here's Yuuka, the Treasurer, for 75 gold. She gives you 15 gold every 18 seconds, climbing by 5 each payout until she hits 45."),
      crag("grin", "It's called compound interest. I've got no clue how the math works, but I love free money.")
    ]
  },
  "w2-2": {
    before: [
      narrator("The second icy pass. Shifty little figures in ragged fur caps scurry across the glacier, jingling with stolen metal."),
      crag("talk", "Kobolds. Pesky little thieves. Every time one hits your troops, he pockets 20 of your hard-earned gold."),
      crag("talk", "Once a Kobold bags 60 gold, he turns tail and sprints for home. Cut him down before he leaves and you get every coin back."),
      crag("sly", "They run fast, but Snow Elves chill their little legs down to a crawl."),
      crag("grin", "Sandro pays them whatever they can pinch from your pockets. Cheapest warlord alive. Or unalive, anyway.")
    ],
    after: [
      crag("grin", "Check out the Cyclops Hurler. He lobs boulders clean over shields to smash them, and every third boulder stuns for 2 seconds."),
      crag("talk", "Plus the Pendant of Courage: you start every battle with a free Surge orb, and you can carry one more orb than before.")
    ]
  },
  "w2-3": {
    before: [
      narrator("At the third pass, an Erathian relief caravan is bogged down in deep drifts: heavily laden sledges, but not a single coin of pay."),
      crag("talk", "It's a caravan run. No gold today. The conveyor belt hands you ready troops for free, but that first wave hits a lot faster."),
      crag("talk", "Don't let the belt jam up. Keep your hands moving and place them as they arrive."),
      crag("talk", "You can't pick your units, so play what comes: Sylphs for flyers, Dwarves up front, Sappers tucked under heavy shields.")
    ],
    after: [
      crag("grin", "Now that's a wall: an Iron Golem! 8000 HP of enchanted iron, too tall for beasts to jump or bound over, and enemy spells deal half damage."),
      crag("talk", "You've also unlocked Frost Ring for your spellbook: freezes every enemy caught in a 3x3 circle for 5 full seconds.")
    ]
  },
  "w2-4": {
    before: [
      narrator("Near the summit, wild music drifts over the drifts: clattering hooves and frantic pipes as Satyrs dance up the glacier."),
      crag("talk", "Satyrs. Don't let the dancing fool you. They bound right over EVERY defender in front of them: walls, archers, everything."),
      crag("talk", "Only a tall defender brings them to a dead halt. That's what your Iron Golems are for."),
      crag("grin", "Those wooden pipes make all their nearby buddies move and attack faster. Party animals. I can't stand party animals unless I'm invited.")
    ],
    after: [
      crag("talk", "Here's a Pikeman: he stabs any enemy within a tile, front or back, and deals double damage against cavalry."),
      crag("sly", "And the Golden Bow artifact: your straight projectile shots pierce through one extra enemy."),
      crag("grin", "Plus a Lizard Warrior from the swamp! When his health drops below 30%, he CHARGES the entire lane and then heads home.")
    ]
  },
  "w2-5": {
    letter: "Dear Keeper,\nThe cold agrees with the dead. Keeps us delightfully fresh.\nMy Death Riders were once noble knights. They still insist on charging on horseback. I haven't the heart to tell them it's quite out of style.\nThe Altar will crown them. You are invited to watch.\n\nFrostily,\nSandro, Lord of the Horde\n\nP.S. Forgive the shaky penmanship. My fingers froze. Well, more than usual. - M.",
    before: [
      narrator("The icy summit. The Ascension Altar glows with soft, pale light amid the snow. Across the glacier, a line of skeletal knights lowers their lances."),
      crag("talk", "There she stands. Whoever holds that Altar when the sun goes down keeps it. And that's going to be us."),
      crag("talk", "Death Riders coming in at a gallop. They've got 900 armour, and their opening lance strike hits for double damage."),
      crag("talk", "Pikemen hit cavalry for double damage. Put your spears right where those lances are aiming."),
      crag("sly", "A champion Rider leads each big assault wave. Keep a Surge orb in your pocket for him.")
    ],
    after: [
      crag("grin", "Solmyr the Djinn joins us: mana twice as fast, and Chain Lightning. Plus the Storm Elemental: 1800 down its whole lane, flyers too."),
      crag("shout", "The ASCENSION ALTAR is ours! Kill foes to charge the Valor crown, press U, pick a unit: 15 seconds of +30% health and power."),
      crag("sly", "Only troops trained to level 3 in the Barracks can Ascend. And my Mercenary Camp is open for trade. Bring your Seals.")
    ]
  },
  "w3-1": {
    before: [
      narrator("Sparks sputter among the damp reeds. Goblins are rolling heavy black powder kegs through the muck toward your line, snickering."),
      crag("talk", "Goblin Sappers. They roll up to your wall, light the fuse, and 2.5 seconds later the whole 3x3 area blows up."),
      crag("talk", "Chilling and stunning them delays that fuse: use Snow Elves, Cyclops boulders, or a Frost Ring."),
      crag("sly", "If you hit an unlit keg with fire, it blows up right in their own ranks. A Fire Elemental dropped in their midst is a lovely surprise.")
    ],
    after: [
      crag("grin", "Here's the Sharpshooter: every 5 seconds it snipes the toughest enemy in its lane for 150 damage, right through armour. Hits flyers too.")
    ]
  },
  "w3-2": {
    before: [
      narrator("Deep in the swamp stands a grove of silver willows. Two Enchanters work inside, shielding the last pure spring in the Mire."),
      crag("talk", "We've got to PROTECT them. If either Enchanter goes down, we lose. Box them in: put a Dwarf right in front and your shooters behind."),
      crag("grin", "As long as those wizards are breathing, they channel mana to your hero, so cast whenever you want."),
      crag("talk", "Watch out for those Goblin powder kegs. That 3x3 blast will take out your Enchanters just as fast as a wall."),
      crag("shout", "Here come LADDER Hobgoblins. If one props a ladder against your front wall, every walking enemy climbs straight over it, even tall golems."),
      crag("talk", "Pick off the carrier before he sets it up. Once that ladder's leaned, it stays until the wall breaks or you dig it up.")
    ],
    after: [
      crag("grin", "Meet the Gnome: he lays stone spikes in his tile. Enemies walk right over him and take 40 damage a second, and he never blocks the lane."),
      crag("talk", "And here's the Armor of Wonder artifact: gives all your defenders +30% more HP.")
    ]
  },
  "w3-3": {
    before: [
      narrator("Rough drums echo through the swamp fog. Heavily painted Orcs come splashing through the black water, howling battle cries."),
      crag("grin", "Orc Berserkers. Distant kin of mine. We don't really chat at family reunions."),
      crag("talk", "If you wound one below half health, he charges and attacks twice as fast. Don't just tickle them."),
      crag("talk", "You've got to burst them down all at once: Sapper mines, Fire Elementals, or a well-timed Surge.")
    ],
    after: [
      crag("talk", "Take an Undine: every 12 seconds she wraps an adjacent ally in a protective 600 HP water shell."),
      crag("grin", "And Haste for your spellbook: makes all your defenders move and attack 50% faster for 10 seconds.")
    ]
  },
  "w3-4": {
    letter: "Keeper,\nMy apprentice has taken the liberty of planting graves across your lawn. You might find them in the way. That is rather the point.\nThe residents will be up shortly. She is quite proud of her work. I am... supportive.\n\nYour thoughtful neighbour,\nSandro\n\nP.S. Don't be too hard on the residents. They really didn't ask to be dug up. - M.",
    before: [
      narrator("Overnight, tidy little mounds of graves have sprouted across the grass. The damp soil on top is already shifting."),
      crag("talk", "An apprentice, huh? That explains why the graves are lined up so neat."),
      crag("talk", "You can't plant any troops on a grave tile, and graves soak up your shots."),
      crag("shout", "When a big assault wave hits, the dead climb OUT of those graves. Smash the ones in your busiest lanes as fast as you can.")
    ],
    after: [
      crag("grin", "Here's a Halfling Grenadier: he lobs bombs across three lanes, hitting the target for 60 and dealing 35 splash to enemies around it."),
      crag("sly", "Plus the Shield of the Yawning Dead: one out of every five dead foes drops an extra 15 gold.")
    ]
  },
  "w3-5": {
    letter: "Keeper,\nI send my apprentices, led by my star pupil. They raise graves with every step, which is more than your peasants can manage.\nAlso, that barbarian next door is a dreadful influence. He shouts constantly.\n\nDisapprovingly,\nSandro",
    before: [
      crag("shout", "I DO NOT SHOUT."),
      narrator("In the deep swamp, a pale woman in black robes walks across the black water as if it were solid stone. Behind her, robed acolytes follow."),
      vidomina("cold", "You do shout. I am Vidomina. The graves were my design. Sandro merely puts his seal on the letters."),
      vidomina("cold", "Every 12 seconds, each of my Necromancers raises a fresh grave right beside them. Do try to keep up."),
      crag("talk", "Sharpshooters will snipe the robed ones, and Halfling grenades lob right over those tombstones."),
      crag("talk", "Take down the Necromancers and the new graves stop appearing. Simple as that."),
      vidomina("smirk", "Simple. Yes. That's certainly the word I'd pick for you.")
    ],
    after: [
      crag("grin", "Look who's arrived: Adelaide, the Frost Cleric! Your army regenerates 5 HP a second, and her Prayer heals everyone while speeding them up."),
      crag("talk", "Plus the Ice Elemental: shatters into a frost nova, freezing every enemy in a 3x3 solid for 10 seconds."),
      crag("sly", "And you've unlocked a second artifact slot. Two magical trinkets at once. Look at you, getting fancy.")
    ]
  },
  "w4-1": {
    before: [
      narrator("The lowest wizard tower. In the courtyard, several scholarly librarians stand frozen in grey stone, mid-sentence."),
      crag("talk", "Medusa Queens did that. They halt 3.5 tiles away from your front line and stare. Every 6 seconds, one of your troops turns to stone for 4 seconds."),
      crag("talk", "Your ranged shooters can hit them right where they stand. Don't bother waiting for them to walk into a wall, because they won't."),
      crag("sly", "Don't worry too much about the librarians. The wizards swear it wears off eventually. They just didn't mention when.")
    ],
    after: [
      crag("grin", "Enchanters! They channel 3 mana to your hero every 12 seconds. More mana means more spells to fling around.")
    ]
  },
  "w4-2": {
    before: [
      narrator("Piercing shrieks echo from the clouds. Harpies circle the second tower, scouting the balconies for anything valuable to grab."),
      crag("talk", "Harpy Snatchers. They drop straight onto your COSTLIEST unit and fly off with it after 4 seconds."),
      crag("talk", "Shoot her down before the timer's up, or use a Sylph to blow her away. Since she always picks your most expensive troop, you know where she'll land."),
      crag("grin", "Reminds me of my Aunt Helga at a wedding feast. Headed straight for the silver platters.")
    ],
    after: [
      crag("grin", "Here's the Arch Mage: fires lightning bolts of 30 that chain across to two more nearby enemies."),
      crag("talk", "And the Cards of Prophecy artifact: makes all your seed packets recharge 30% faster."),
      crag("sly", "Plus the Aegis Bearer: his shield protects the 3x3 area around him from anything lobbed or dropped from the sky. Keep him handy.")
    ]
  },
  "w4-3": {
    before: [
      narrator("The Grand Tower where the star-charts are stored. The cloud bridge is severed, so no supplies can cross. The wizards bolt the vault door and stare at you."),
      crag("talk", "Another LAST STAND. You've got 3000 gold to build your line, nothing dropping from the clouds, and no refills."),
      crag("talk", "They're throwing Satyrs, Riders, and Medusas at us all together. Iron Golems halt the hoppers, and Pikemen skewer the Riders."),
      crag("sly", "You start with a ready Surge orb. Save it for when the line starts bending."),
      crag("shout", "Watch out for that Goblin Siege CATAPULT! It sets up in back and lobs rocks at your REARMOST unit. That means your gold-makers."),
      crag("talk", "An Aegis Bearer's shield catches those boulders. Once the machine runs out of rocks, it rumbles forward to crush things, so keep firing.")
    ],
    after: [
      crag("grin", "Look at the Master Genie: every 6 seconds he casts Slow on the three closest enemies across three separate lanes."),
      crag("talk", "And Meteor Shower for your spellbook: drops 500 damage on every enemy caught in a 3x3 area.")
    ]
  },
  "w4-4": {
    before: [
      narrator("The high observatory. Glowing floating eyes drift in through the tall arched windows, followed by cackling witches."),
      crag("talk", "Evil Eyes shoot right past walls (troops that don't have an attack of their own) and burn whatever's hiding behind them."),
      crag("talk", "Sea Witches lob cursed hexes. Any unit they hit has its attack and movement cut to half speed for 8 seconds."),
      crag("sly", "Even worse, Hexing Sorceresses turn your soldiers into SHEEP for 8 seconds. Steadfast troops just shrug the curse off."),
      crag("grin", "None of these witches enjoy taking a boulder to the face. Or an arrow. Or my axe.")
    ],
    after: [
      crag("grin", "Here's the Zealot Cleric: throws holy bolts that deal double damage to undead, and heals the most hurt nearby ally for 150 every 5 seconds."),
      crag("talk", "And the Shackles of War artifact: drags down the entire horde so they march 15% slower.")
    ]
  },
  "w4-5": {
    letter: "Keeper,\nYou've beaten gazes, hexes, and harpies. How dreadfully tedious of you.\nMy ogres brought war drums. I specifically asked for a quiet, civilized siege. They don't know the word.\n\nWith a splitting headache,\nSandro\n\nP.S. The drumming shook two of my ribs loose. I found one of them. - M.",
    before: [
      narrator("Heavy drums rattle the mountain stone. An ogre warband lumbers up the winding path toward the observatory in lockstep."),
      crag("talk", "Ogre Shamans. Those war drums fire up every nearby ally to march and hit 35% faster."),
      crag("talk", "Take out the drummers first. A Sharpshooter always targets the toughest enemy in its lane, and these Shamans are plenty tough."),
      crag("sly", "Something smells fishy, though. Sandro never makes this much racket unless he wants you looking the wrong way.")
    ],
    after: [
      crag("grin", "Tazar, Warlord of Tatalia, joins our side! The horde deals 25% less damage, and his Earthen Bulwark raises stone walls right out of the dirt."),
      crag("talk", "Plus the Faerie Dragon: every 4 seconds it hurls a random spell at the closest enemy in its lane: frost, fire, or lightning."),
      crag("sly", "And another seed packet slot. You've got an answer for just about anything now.")
    ]
  },
  "w5-1": {
    before: [
      narrator("Fresh tunnel shafts branch everywhere, the loosened soil still warm. Whatever clawed through here is still digging."),
      crag("talk", "Coins fall half as often down in the dark. Get your Peasant Tithes planted right away."),
      crag("shout", "Sandworms burrow right under EVERYTHING and erupt behind your front line, facing your troops."),
      crag("talk", "Keep a guard posted in back. A Pikeman stabs behind his shoulder just as hard as in front.")
    ],
    after: [
      crag("grin", "Check out this Ballista: heavy iron bolts that pierce through every enemy in its lane, flyers included.")
    ]
  },
  "w5-2": {
    before: [
      narrator("A cavern as big as a cathedral. Massive leathery wings rustle high on the stone ceiling. Something just woke up."),
      crag("talk", "Wyvern Monarchs. Winged beasts with 1100 HP of tough scales. Every 7 seconds they dive down on whatever's underneath."),
      crag("talk", "Regular arrows can't reach them up in the rafters, but Ballistae, Sharpshooters, lightning spells, and Sylphs will.")
    ],
    after: [
      crag("grin", "Here's Aris, the Hyper Cannon! She charges up for 8 seconds while an enemy is in her lane, then blasts a 450 beam through everything ahead.")
    ]
  },
  "w5-3": {
    before: [
      narrator("An abandoned mine shaft. The old iron ore cart still rolls on rusted tracks, piled high with heavy siege equipment."),
      crag("talk", "Another conveyor belt run. The mine cart delivers heavy artillery: Ballistae, Golems, Storm Elementals, and Arch Mages."),
      crag("talk", "You'll face Sandworms and Wyverns here, so make sure you cover the skies and watch your rear rows."),
      crag("grin", "Don't ask where I rounded up the Iron Golems. They were just standing around. Mostly.")
    ],
    after: [
      crag("sly", "A Leprechaun: whenever an enemy dies in his lane or the two next to it, there's a 40% chance he drops 25 gold."),
      crag("grin", "And the Ogre's Club of Havoc artifact: makes your melee strikes, gazes, and lightning hit 50% harder. Now that's a weapon.")
    ]
  },
  "w5-4": {
    before: [
      narrator("The tunnel skirts a subterranean lake of bubbling lava. Fiery Efreet Sultans rise from the molten rock, looking bored."),
      crag("talk", "Efreet Sultans shrug off burning shots, so leave the fire at home today."),
      crag("talk", "Hit one up close and it scorches your fighter for a third of the blow. Stick to arrows, frost, and boulders.")
    ],
    after: [
      crag("grin", "Here's a Crusader. His blade hits for 50, and every kill makes him strike 15% faster, stacking up to five times.")
    ]
  },
  "w5-5": {
    letter: "Keeper,\nGold is so terribly scarce underground. How ever will you manage?\nThe Spider Princess asked to meet you. She's exceedingly eager to keep you. Forever.\n\nFrom the depths,\nSandro\n\nP.S. I brought a broom to clear webs. She kept the broom. - M.",
    before: [
      narrator("The tunnel terminus. Beyond a maze of thick webbing, a vertical shaft climbs straight up toward the Brookhold cellar."),
      crag("talk", "This is the spot. Break through this line and we can collapse the ceiling on the whole passage."),
      crag("shout", "The Spider Princess shoots webs over a 3x3 block of your troops from 3 tiles away. And Cave Trolls heal 40 HP a SECOND."),
      crag("talk", "You need heavy burst damage here: Sapper mines, Fire Elementals, and Meteor Showers. Don't just nibble at a troll.")
    ],
    after: [
      crag("grin", "Meet Sensei from Schale: gold coins collect themselves, and Supply Drop calls in a fresh Surge orb."),
      crag("talk", "Plus the Ammo Cart: every ranged shooter inside its 3x3 fires an extra projectile with each volley."),
      crag("sly", "And you've unlocked a third artifact slot. Three magical toys at once. You're loaded.")
    ]
  },
  "w6-1": {
    letter: "Keeper,\nWelcome to Deyja, my humble home. Do mind Queen Carmilla. She's a dear friend and an appalling dinner guest.\nShe never leaves on the first goodbye.\n\nHospitably,\nSandro\n\nP.S. She keeps eyeing my ribcage like a soup bone. Please hurry. - M.",
    before: [
      narrator("Carmilla's court: a crumbling hall lit by black candles, draped in velvet and filled with pallid guests. The vampire queen grins."),
      crag("talk", "Carmilla drinks health from everything she bites, and she gets right back up once after you drop her."),
      crag("talk", "Put her down twice, and hit her hard. Zealot Clerics deal double damage against undead.")
    ],
    after: [
      crag("grin", "Look at Hina, the Prefect: opens up with machine-gun bursts, spraying six rounds of 11 damage every 2 seconds.")
    ]
  },
  "w6-2": {
    before: [
      narrator("The great barrow fields where Sandro plans to assemble his army. The rolling ground holds more crumbling headstones than weeds."),
      crag("talk", "Graves everywhere, and Necromancers digging up more. Scout out the open tiles where you CAN plant before the first wave hits."),
      crag("shout", "When a big assault wave sounds, those graves burst open with fresh corpses. Smash the headstones in your busiest lanes.")
    ],
    after: [
      crag("grin", "A Salamander! Any shot flying through her catches fire for double damage, plus splash for half that to foes beside the target.")
    ]
  },
  "w6-3": {
    before: [
      narrator("Amid Deyja's grey wastes stands a weathered chapel of Order. Three Zealot Clerics have held vigil here for forty years. The horde marches in."),
      crag("talk", "It's a PROTECT mission: not a single one of those three Clerics can be allowed to fall."),
      crag("talk", "Harpies can't carry off the Clerics, but they'll snatch your costliest other troop, so watch the sky."),
      crag("shout", "Medusas will turn your Clerics to stone from range. Take those snake-haired fiends out fast."),
      crag("talk", "Sorceresses are back turning troops into sheep. A sheep still blocks the lane, but it can't heal or fire back.")
    ],
    after: [
      crag("grin", "A PHOENIX! Scorches every enemy right in front for 40 damage a second, and rises from the ashes once when killed."),
      crag("talk", "Plus the Orb of Tempestuous Fire artifact: cranks all your fire damage up by +50%.")
    ]
  },
  "w6-4": {
    before: [
      narrator("Armoured steeds crest the dark hill. Dread Knights, the deadliest riders in Sandro's service, trot down to reclaim the barrow field."),
      crag("shout", "Dread Knights. They carry 1100 armour, and every third strike lands as a Death Blow for triple damage."),
      crag("talk", "They're cavalry, so Pikemen hit them for double damage. Line your front rank with pikes and keep healers close behind.")
    ],
    after: [
      crag("grin", "Here's a First Aid Tent: patches up every defender in its lane for 40 health every 2 seconds.")
    ]
  },
  "w6-5": {
    letter: "Keeper,\nMy Pit Lords are out harvesting. Every servant of mine who drops rises again, and again.\nExceedingly efficient. You should try it. Oh wait, you can't.\n\nTriumphantly,\nSandro\n\nP.S. They told me I'm too bony to harvest. Never been so happy in my life. - M.",
    before: [
      narrator("The heart of the barrows. Red-skinned Pit Lords on loan from Eeofol sweep cruel scythes, calling the dead back to their feet."),
      crag("shout", "Those Pit Lords resurrect the last fallen Chaos monster every 10 seconds, over and over."),
      vidomina("smirk", "Sandro calls it a harvest. I call it the single piece of his grand strategy that actually functions."),
      vidomina("cold", "Demons trampling through my ancestral barrows, however. That part was never in our contract."),
      crag("talk", "Cut down the Pit Lord and his harvest stops cold. Save your Surges and heaviest spells to drop him.")
    ],
    after: [
      crag("grin", "Akagi, the Carrier! Every 6 seconds her planes bomb a random enemy anywhere on the battlefield, flyers included."),
      crag("shout", "And ARMAGEDDON: blasts 800 fire into every foe, but also hits your OWN troops for 150. Read the fine print before you cast it.")
    ]
  },
  "w7-1": {
    before: [
      narrator("The first trail climbing the volcano. Lucifina, a demon mistress cloaked in scarlet silk, laughs and snaps her clawed fingers."),
      crag("talk", "Lucifina summons Imp Runners into her own lane and both adjacent lanes every 10 seconds."),
      crag("talk", "Those imps will blink right past your first defender unless it's a tall unit. Plant Iron Golems up front and drop her fast.")
    ],
    after: [
      crag("grin", "Here's a War Unicorn: every unit in its 3x3, including the unicorn herself, takes 30% less damage.")
    ]
  },
  "w7-2": {
    before: [
      narrator("Bulbous crimson spheres float out over the lava pools: each a single baleful eye above a maw crackling with blue lightning."),
      crag("shout", "Cacodemons. Flying 1600 HP hell-balls spitting lightning at whatever's underneath them."),
      crag("talk", "Bring anti-air fire, gales, and direct damage spells. Ballistae and Sylphs earn their wages today.")
    ],
    after: [
      crag("grin", "Look at this Ancient Behemoth: every 7 seconds he leaps forward onto the nearest enemy and mauls it for 900.")
    ]
  },
  "w7-3": {
    before: [
      narrator("Halfway up the mountain, the road funnels through a breach in an ancient fortress wall. If they break through, the Meadows are wide open."),
      crag("talk", "A LAST STAND at the breach. You've got 4500 gold to plant your line, then sound the horn."),
      crag("talk", "Chaos Hydras lash out at their own lane and both lanes beside them, and they regenerate. Burst them down hard."),
      crag("sly", "You start with two ready Surge orbs. Don't go taking them to the grave.")
    ],
    after: [
      crag("grin", "A Cannon! Fires shells of 80 damage that explode on impact, dealing 60 damage to every enemy within a tile across three lanes.")
    ]
  },
  "w7-4": {
    before: [
      narrator("Towering giants. Jotunn Warlords taller than stone ramparts march up the fiery road with chattering Imps perched on their shoulders."),
      crag("shout", "Jotunn Warlords crush any defender in ONE swing. And when you wound them, they hurl Imps deep behind your lines."),
      crag("talk", "Don't let them walk up to your wall. Freeze them with Ice Elementals, bury Sapper mines, and keep a Pikeman back for the thrown Imps.")
    ],
    after: [
      crag("grin", "A Lightning Generator! Every 3.5 seconds it zaps the nearest enemy in its lane, hits flyers too, and arcs across to three more.")
    ]
  },
  "w7-5": {
    before: [
      narrator("Near the volcano's peak, heavy machinery clanks. Half demon flesh, half steel war engine, packing a rocket launcher for an arm."),
      crag("talk", "I've fought just about everything on two legs or four. I've never had to fight one of THOSE."),
      crag("shout", "The Cyberdemon. He fires rockets from five tiles out that blow up every unit clustered around his target."),
      crag("talk", "Spells only deal half damage to his metal plating. Sharpshooters pierce his armour, and a Surge or two won't hurt.")
    ],
    after: [
      crag("grin", "A Mighty Gorgon: every 12 seconds her death stare turns the closest enemy within 1.2 tiles to stone. Bosses just take 800 damage."),
      crag("talk", "The Hellgate's right up ahead. Sandro's waiting at the summit.")
    ]
  },
  "w7-6": {
    letter: "KEEPER,\nEnough of this nonsense. I come myself, astride the greatest triumph I've ever raised: a Dracolich.\nYour keep, your crypt, your Nexus. Mine by dusk.\nDo wave. I'll wave back with a claw the size of a barn.\n\nYour doom, personally,\nSandro\n\nP.S. He practised the wave. For an entire hour. - M.",
    before: [
      narrator("The volcanic summit. The Hellgate blazes behind a colossal flying horror: a skeletal dragon with Sandro riding between its horned brow."),
      crag("shout", "The Dracolich, with Sandro in the saddle. It hovers at the far edge of a lane, then glides across to another."),
      crag("talk", "Only your hero's spells, and attacks that can reach it, will hurt it. Put long shooters in EVERY lane, since it moves."),
      crag("talk", "Its breath scorches for 200 down the lane, and it summons dead minions and Cacodemons. You get three Surge orbs, and that's it."),
      crag("talk", "Whatever happens up on this peak... it's been an honour holding the line with you, Keeper. Now let's swat him off that lizard.")
    ],
    after: [
      crag("shout", "CRAG! HACK! That dragon is DUST and the Hellgate is sealed tight!"),
      vidomina("smirk", "A claw the size of a barn, he promised. I might frame a few of the fragments. Just to remember his face."),
      crag("grin", "Look who slipped through before the iron doors shut: a Titan, hurling 200-damage lightning at the nearest foe in its lane, however far."),
      crag("talk", "And an Archangel: makes adjacent allies act 25% faster, and every 40 seconds she resurrects the last fallen unit nearby.")
    ]
  },
  "w8-1": {
    letter: "Keeper,\nYou smashed my Dracolich and slammed my Hellgate shut. How excessively rude.\nNo matter. Gold still hires steel. I bought half of Krewlod, paid in advance. Unlike certain barbarians I could mention.\n\nSolvently,\nSandro\n\nP.S. He hurled the inkpot at me after signing this. I'm all right. Mostly. - M.",
    before: [
      narrator("The first dusty gorge. A disciplined column of Erathian mercenaries marches forward: polished armour, sturdy boots, dreadful employer."),
      crag("grin", "Sellswords. Erathian steel sold off to Chaos. Disgraceful. Their breastplates absorb the first 400 damage, and under 30% HP they try to run."),
      crag("sly", "Drop them before they flee and their bounty hits the dirt: 25 gold each. Sea Dogs drop 15."),
      crag("talk", "Sea Dogs dodge every third straight shot, but lobs and ground spikes don't give a hoot about dodging.")
    ],
    after: [
      crag("grin", "A Santa Gremlin! He hurls gifts at close quarters and hands out 15 gold every 20 seconds."),
      crag("talk", "And Lightning Bolt for your spellbook: zaps 350 into a single target, flyers included.")
    ]
  },
  "w8-2": {
    before: [
      narrator("Howling echoes along the canyon ridge. Goblins riding savage red wolves pour downhill under a familiar banner: a wolf's head on a broken axe."),
      crag("talk", "That's my old company's flag. They kept it flying. Of course they did, it's a handsome banner."),
      crag("shout", "Wolf Raiders. Their beasts bite twice as often, and every chomp hamstrings your fighter."),
      crag("talk", "They're cavalry, so Pikemen hit them for double damage. Set your pikes right in their path."),
      crag("grin", "Their pack chief still owes me a sturdy pony. Tell him Crag says hello, with a spear point.")
    ],
    after: [
      crag("grin", "Here's a Royal Griffin: 2400 HP of feathers and talons, tearing 40 damage right back into anything that bites it.")
    ]
  },
  "w8-3": {
    before: [
      narrator("That night beside the campfire, Crag finally talks about the past he's avoided mentioning all week."),
      crag("talk", "I led that warband twelve years. We stood up for whoever was in the right, mostly. Then one bad winter, the boys voted to fight for whoever paid."),
      crag("talk", "So I packed up and walked. Found an old keep with a sweet-water well and parked my wagon. Nice and quiet, right until you arrived."),
      narrator("By morning, an Erathian supply wagon clatters up the road, and Crag is back to business."),
      crag("talk", "Caravan delivery. The belt sends down Pikemen, Griffins, Crusaders, and plenty more."),
      crag("talk", "Nomad Outriders swerve around your first defender into an open lane next door. Make sure you cover the side lanes too."),
      crag("grin", "I rode with Nomads in my younger days. They never take the straight road home either.")
    ],
    after: [
      crag("grin", "A Centaur Captain: his lance strikes pierce two enemies at once, and if someone gets close he gallops back a tile."),
      crag("sly", "And the Endless Purse of Gold: coins drop from the sky 40% more often. Now that is what I call proper magic.")
    ]
  },
  "w8-4": {
    before: [
      narrator("A blinding dust storm sweeps down the canyon floor. Rogues sneak through the haze, and Bounty Hunters cock their rifles."),
      crag("talk", "Rogues stay hidden until they reach 5 tiles from your gate, attack, or eat blast damage. Each strike steals 15 of your gold."),
      crag("shout", "And Bounty Hunters pull up 4 tiles out to snipe your COSTLIEST unit in range."),
      crag("sly", "I know how sneaky cutthroats think. A good Meteor Shower finds them whether they're hidden or not.")
    ],
    after: [
      crag("grin", "Here's a Mage: magic bolts, and every strike funnels a quarter of a mana point to your hero."),
      crag("talk", "Plus Ice Bolt for your spellbook: hits for 250 and freezes the target solid for 4 seconds.")
    ]
  },
  "w8-5": {
    letter: "Keeper,\nThe hounds of the deep pit have three heads, allowing them to be rude thrice as quickly.\nDo tell that barbarian his old warband sends its regards. They were remarkably cheap.\n\nWith receipts,\nSandro",
    before: [
      narrator("Before daybreak, three polite taps rattle Crag's wagon. It's Mortimer, carrying a tiny bundle of belongings."),
      mortimer("nervous", "Good morning. I've delivered Master Sandro's letter, but... I resign. He only ever calls me bones. You don't. May I sit by your fire?"),
      crag("grin", "Pull up a stool, bones. You're in charge of my war ledger now. Nobody else is brave enough to open it."),
      narrator("Savage three-headed hounds surge out of the canyon, followed by the mounted remnants of Crag's old mercenaries."),
      crag("shout", "Cerberi! Every bite tears through your front defender and savages the troop right behind him."),
      crag("talk", "Make sure your second rank is built tough, and keep a First Aid Tent in the lane. Pikes still impale the horsemen behind them."),
      crag("sly", "Cheap, were they? I'll show that old warband what a barbarian refund looks like.")
    ],
    after: [
      crag("grin", "Dace, Minotaur Warlord of Nighon, joins Order! Valor crowns charge 50% faster, and his Labyrinth Frenzy doubles melee damage."),
      crag("sly", "Plus the Ambassador's Sash artifact: cuts the gold cost of all seed packets by 15%. That's proper diplomacy.")
    ]
  },
  "w9-1": {
    letter: "Keeper,\nA minor complication. In hiring certain planar consultants, I appear to have punctured the sky.\nThe horrors crawling through aren't mine. Do destroy them on my behalf.\n\nUnbothered,\nSandro\n\nP.S. Mortimer, if you're reading this: come home. The new courier is a bat. It bites. - S.",
    before: [
      mortimer("nervous", "...I am certainly not going back."),
      narrator("Ghostly shapes drift through the glowing Rift: Wraiths and Mummies from unfamiliar planes, answering to no master."),
      crag("talk", "Wraiths heal themselves, and every strike drains 2 of your hero's mana."),
      crag("talk", "Mummies curse whoever they touch to half movement and attack speed for 8 seconds. Both are undead, so Zealot Clerics hit double.")
    ],
    after: [
      crag("grin", "Meet the Dendroid Soldier: a rooted 4000 HP wall, and enemies right in front of him move and strike at half speed."),
      crag("talk", "And Blind for your spellbook: leaves a single non-boss enemy standing completely helpless for 8 seconds.")
    ]
  },
  "w9-2": {
    before: [
      narrator("The Rift flares violet. Red-skinned Arch Devils step out of thin air, vanish, and step out again somewhere worse."),
      crag("shout", "Arch Devils vanish at the edge of the lawn and step out right BEHIND your defences."),
      crag("talk", "Keep a sturdy defender in back. A Pikeman strikes behind him just as hard as forward."),
      crag("talk", "And Magogs lob fiery artillery over your barricades, so take them out fast.")
    ],
    after: [
      crag("grin", "Here's Azusa the Trapper: every 30 seconds she plants an 1800 damage Land Mine up to 3 tiles ahead. Two at a time."),
      crag("talk", "And the Spirit of Oppression artifact: shuts down all Chaos auras completely, including Ogre Shaman drums.")
    ]
  },
  "w9-3": {
    before: [
      narrator("The Rift hangs directly over a crumbled watchtower. No gold drops here: the sky above has frayed into empty void."),
      crag("talk", "Another LAST STAND. 4000 gold to dig in. Pain Elementals float over your line and burst into three Lost Souls when killed."),
      crag("talk", "Those Lost Souls leap right over your first defender, so make sure your second line is ready to catch them."),
      crag("talk", "Power Liches cast death clouds over a 3x3 block. Dwarves only take half damage. You start with two ready Surge orbs.")
    ],
    after: [
      crag("grin", "Luna, Fire Elementalist! Your spells recharge 40% faster, and her Inferno sweeps three lanes with sheets of flame."),
      crag("talk", "Plus a Silver Pegasus: strikes grounded enemies in front, and slashes flying foes passing overhead too.")
    ]
  },
  "w9-4": {
    before: [
      narrator("Strangers spill from the Rift: a cloaked sniper with a fox mask, bloated demons with flame cannons, and spinning crystals."),
      crag("talk", "Wakamo stalks unseen until she takes aim, sniping the closest troop for 150. Once she pulls the trigger, she's fair game."),
      crag("shout", "Mancubi scorch anything within 3 tiles with flamethrowers. Put them down before they waddle in close."),
      crag("talk", "Prism Elementals SPIN now and then. Any straight shot hitting a spinning crystal reflects back at your line. Lob, zap, or wait.")
    ],
    after: [
      crag("grin", "Laffey the Destroyer! Her torpedoes run right beneath shields and rip through the first three enemies in her lane."),
      crag("talk", "And Implosion for your spellbook: smashes 1500 damage into a single target straight through armour. Save it for big monsters.")
    ]
  },
  "w9-5": {
    letter: "Keeper,\nA Black Dragon flew out of the Rift. It ignores spells. It completely ignores me. I'm trying not to be offended.\nIt's headed your way. If you dealt with it, I would be... do not repeat this... grateful.\n\nTemporarily yours,\nSandro",
    before: [
      narrator("The Rift yawns to its tearing limit. An immense silhouette of onyx scales wedges leathery wings through the opening."),
      vidomina("cold", "Listen closely, Keeper. If that beast reaches your crypt, it drains the Nexus dry, and every dead thing in Deyja dies with it."),
      vidomina("cold", "So for today, I want you to win. Don't flatter yourself with thanks. I'm protecting my own realm."),
      crag("talk", "Noted. Mind the doormat on your way out."),
      crag("shout", "The Black Dragon! It flies, shrugs off all spells, and it's far too heavy for any Sylph gale to budge."),
      crag("talk", "Ballistae, Sharpshooters, Titans, Aris, Akagi's bombers, Pegasi, and Lightning Generators can hit it. Pack them all in."),
      crag("talk", "It leads the massive assault waves, so hold your Surge orbs until it swoops down.")
    ],
    after: [
      crag("grin", "Meet Belfast, the Royal Maid: fires heavy naval guns, and serves a 120 HP tea break to the most wounded ally every 4 seconds."),
      crag("talk", "Plus Cure for your spellbook: cleanses all poison, curses, webs, and stuns from every unit while healing them for 150.")
    ]
  },
  "w10-1": {
    letter: "Dear Keeper,\nYou are cordially invited to my grand masquerade.\nAttire: masks. Music: exquisite screaming. Guests: everyone who loathes you.\nNo need to RSVP. We're coming to you.\n\nYour host,\nSandro",
    before: [
      narrator("The ornate gates of the Carnival swing wide. Masked figures glide forward, passing through the boundary fence as if it were fog."),
      crag("talk", "Phantoms. They phase right through your solid troops. While they're phasing, only explosive blasts and direct hero spells can hurt them."),
      crag("talk", "After phasing, they need 8 seconds before they can slip through again. Keep a second line behind the first to cut them down.")
    ],
    after: [
      crag("grin", "The Grand Elf Rearguard fires straight down his lane, and turns around to shoot behind at anything that slipped past.")
    ]
  },
  "w10-2": {
    before: [
      narrator("Cold mist rolls over the ballroom lawn. A feral howl cuts through the violin music, and the mist begins shifting sideways."),
      crag("talk", "Werewolf Stalkers. Every couple of tiles they bound sideways into an adjacent lane. They never stay in one spot."),
      crag("talk", "Cover the side lanes early. Troops that sweep three lanes shine here: Halflings, Cannons, and Master Genies.")
    ],
    after: [
      crag("grin", "A Nymph of the Mists: anything that bites her gets dazed, and wanders off into a neighbouring lane, slowed."),
      crag("sly", "Only costs 50 gold. Cheap and bewildering. My kind of soldier.")
    ]
  },
  "w10-3": {
    before: [
      narrator("In the centre of the garden, the Revel Queen twirls. Wherever her feet pause, an escort of masked dancers circles up around her."),
      crag("talk", "The Revel Queen stops and summons four Revellers around herself: above, below, in front, and behind."),
      crag("talk", "Every 15 seconds she summons back any dancer you killed. Break the ring with splash damage, then strike the Queen."),
      crag("sly", "She's got good footwork, I'll give her that. Still going to hit her with an axe.")
    ],
    after: [
      crag("grin", "The Mechanic's Lodestone artifact: every 10 seconds it strips the helm, armour, or shield right off the nearest armoured foe.")
    ]
  },
  "w10-4": {
    before: [
      narrator("The music cuts out. Dancers part, and massive iron Battering Rams and heavy Juggernauts rumble forward out of the shadows."),
      crag("talk", "Another LAST STAND with 4500 gold. Battering Rams slam your front defender a tile back and stun them."),
      crag("shout", "Juggernauts roll over everything for 800 damage each. A tall unit halts them cold, Gnome spikes crack them, and mines blast them apart."),
      crag("sly", "You've got two Surge orbs ready. Those Rams are rude, but the Juggernauts are downright obnoxious.")
    ],
    after: [
      crag("grin", "A Dwarven Axe-Thrower! His axes slice three foes on the way out, then spin back to hit again, striking shields from behind.")
    ]
  },
  "w10-5": {
    letter: "Keeper,\nMy final masquerade. My arch-viles raise the fallen where they drop, so our dance need never end.\nWhen the music dies, your keep is mine, along with the crypt and the Nexus beneath.\nSave the last dance for me.\n\nForever (literally),\nSandro",
    before: [
      narrator("Midnight. Atop a dais of polished bone at the centre of the carnival, Sandro raises his staff, and arch-viles begin their chant."),
      crag("shout", "Sandro's grand finale. Those arch-viles resurrect the fallen right where they drop on the field."),
      crag("talk", "Stun them, freeze them, blow them backward, or cut them down first. Any of that interrupts their chant."),
      mortimer("cheer", "I polished your wagon wheels for you, Mr. Hack. It's the only helpful thing I know how to do before a fight."),
      crag("talk", "Use everything you've learned from day one. You've got this, Keeper. And I've got a fresh pot of stew waiting.")
    ],
    after: [
      crag("shout", "CRAG! HACK! The masks are smashed and this carnival is OVER!"),
      crag("grin", "Look who joined Order: a Sea Serpent that swallows enemies whole, and Cupi. Whoever bites Cupi falls in love and fights on our side.")
    ]
  },
  r1: {
    before: [
      narrator("A dozen shamblers wander up to the wagon with empty pockets. Sandro forgot to pay them, so they signed on with Crag for hot stew."),
      crag("grin", "Meet the Turncoats. If Chaos won't pay them, my soup kettle will. And the Queen's sent us a very special job."),
      crag("talk", "Captain Ronald down at the Meadow outpost claims his palisade is impenetrable. The Queen wants us to test that claim before Sandro does."),
      crag("talk", "Spend Might to send your Chaos troops down the lanes. You've got to break through at the end of EVERY lane to win."),
      crag("talk", "Slay their Peasants for 75 Might each. You also have Earthquake, War Cry, and Resurrection, a few casts of each."),
      crag("sly", "Don't hold back. They're using padded practice gear, but we need to find the holes before the real enemy does.")
    ],
    after: [
      crag("grin", "Ronald's palisade had a three-foot gap behind the chicken coop. Better we broke it than Sandro."),
      crag("talk", "The Captain's writing a repair request right now, and the Turncoats are already queuing up for second helpings.")
    ]
  },
  r2: {
    before: [
      narrator("High in Vori, Commander Varik stands on his ramparts, shouting down that nobody has ever taken his frozen bastion."),
      crag("grin", "Varik says glaciers don't crack. The Queen wants us to knock on his door, just to check."),
      crag("talk", "His garrison brought Sylphs to blow your flyers away and Iron Golems to stop your Satyrs dead in their tracks."),
      crag("sly", "Pick your lanes carefully. Send the right monster at the right wall and you're through.")
    ],
    after: [
      crag("grin", "Varik's face when we found the lane he forgot was worth the whole wagon ride up the mountain."),
      crag("talk", "His wall had a soft spot under the ice pack. He's chipping frost and grumbling, but the fort's getting fixed.")
    ]
  },
  r3: {
    before: [
      narrator("Deep in Tatalia, Warden Krell wades out to boast that Mire Watch has never lost a plank of wood to anyone."),
      crag("sly", "Krell claims nobody can assault a fort built in hip-deep muck. Let's show him what swamp zombies do."),
      crag("talk", "He's deployed ground spikes, water shells, and a Sharpshooter waiting to snipe your troops through the fog."),
      crag("talk", "Your Necromancers raise graves, and graves soak their shots. Build your own cover, then push.")
    ],
    after: [
      crag("grin", "Told you graves make good cover, even in the mud. Krell's out there pulling wooden spikes out of his own boots."),
      crag("talk", "We proved his marsh gate was rotting from underneath. The Queen will be pleased, even if Krell isn't.")
    ]
  },
  r4: {
    before: [
      narrator("At the Arcane Walls of Bracada, Arch-Mage Phelan assures everyone that sheer intellect is superior to any siege."),
      crag("talk", "Phelan wrote the Queen a three-page essay proving his towers can't fall. Time for a practical demonstration."),
      crag("talk", "Arcane Walls: his Genies slow you, Arch Mages chain lightning bolts, and Clerics heal their line."),
      crag("sly", "Look for the lane they skimped on. Wizards love theory, so they always cut corners somewhere on the ground.")
    ],
    after: [
      crag("grin", "Down go the wizards! Turns out a binder full of magical theory doesn't stop a charging line of Turncoats."),
      crag("talk", "Phelan's busy rewriting his essay to explain why losing was actually a profound teaching moment.")
    ]
  },
  r5: {
    before: [
      narrator("Down in the Nighon tunnels, Overseer Bax swears nothing can get past his underground gun line."),
      crag("talk", "Bax says no army can cross his kill zone. The Queen told us to make him eat his words."),
      crag("talk", "Ballistae pierce whole lanes and Aris charges her beam cannon, so don't just march into their line of fire."),
      crag("grin", "Tunnel right under them. Sandworms pop up behind their whole line, right where nobody's looking.")
    ],
    after: [
      crag("grin", "Massive cannons, and not a single soul guarding the rear. Classic engineering oversight."),
      crag("talk", "Bax is already drafting an invoice for three broken gun mounts, but that tunnel won't surprise the Queen again.")
    ]
  },
  r6: {
    before: [
      narrator("General Sterling stands before the grand Last Citadel, proclaiming it the crowning jewel of Erathian fortification."),
      crag("talk", "Sterling told Queen Catherine his citadel could hold off an apocalypse. Let's test that theory right now."),
      crag("shout", "The Last Citadel: Phoenixes, Unicorn wards, and a First Aid Tent set up in every single lane."),
      crag("sly", "You've got the full arsenal of Chaos today: Pit Lords, Hydras, and the Cyberdemon. Go on, be completely dreadful.")
    ],
    after: [
      crag("grin", "The grand citadel is cracked wide open! Even Sandro would have to admit that was magnificent."),
      crag("talk", "Sterling's standing there with his helmet crooked, muttering about a tactical reorganisation.")
    ]
  },
  r7: {
    before: [
      narrator("At Fort Ironfang, Paymaster Vane boasts that professional discipline beats any motley rabble."),
      crag("grin", "Mercenary payday! We paid our Turncoats their stew rations on time, and they're ready to prove him wrong."),
      crag("talk", "His Griffins bite back and Centaurs lance two at a time. Your Nomads swerve round the first wall, and Rogues slip in unseen."),
      crag("sly", "Show them what happens when hired blades actually fight for somebody they like.")
    ],
    after: [
      crag("sly", "Paid on time with good hot stew, and they fought like devils. Funny how that works, isn't it?"),
      crag("talk", "Vane is double-checking his payroll sheets in utter disbelief while our lads ask for dessert.")
    ]
  },
  r8: {
    before: [
      narrator("Outside the closed Rift, High Commander Alistair insists his elite border redoubt can repel any nightmare imaginable."),
      crag("talk", "Alistair says his barrier is unbreachable. Time to throw the weirdest planar monstrosities we've got right at his wall."),
      crag("talk", "Through the Rift: he's backed by Azure Dragons, Gold Golems, and mined lanes. A proper fortress."),
      crag("sly", "Your Arch Devils teleport right behind their line, and your Black Dragon laughs at gales. Make the most of it.")
    ],
    after: [
      crag("grin", "Every single lane broken! You've held Brookhold against Chaos, and now you've cracked every fort in the realm."),
      crag("talk", "Alistair's signing off on fort reinforcements right now. You know both sides of the wall inside and out.")
    ]
  },
  "oc-endless": {
    before: [
      narrator("Late at night, shuffling boots echo down the road. Some stragglers never got the news that the war moved on, and keep wandering toward the gate."),
      crag("grin", "The night shift is here! Every stray monster you've ever beaten still stumbles up to our walls, wave after wave."),
      crag("talk", "After every great assault, pick one of three artifacts. They stack up over the night, but so does the horde."),
      crag("sly", "Setting new survival records earns you Seals. How long can you hold the gate before daybreak?")
    ]
  }
};

/** After the final level is cleared. */
export const OC_EPILOGUE: OcSceneLine[] = [
  narrator("Three days later, the wagon rolls back to Brookhold. Morning light over the Meadows. The carnival has vanished. The keep's scarred gate is still bolted shut."),
  crag("talk", "Listen to that. No war drums, no moaning corpses, no masks. Just peaceful quiet."),
  narrator("Beside the ditch, Sandro sits slumped in the dust, clutching a cracked carnival mask in his lap."),
  sandro("rage", "Preposterous! A Dracolich, a Hellgate, an entire planar ritual... dismantled by a novice Keeper and a barbarian with a soup kettle!"),
  catherine("regal", "Dismantled by people who refused to break. Erathia stands secure again, Keeper. You have my deepest gratitude."),
  catherine("regal", "And Crag Hack: your royal contract, signed and sealed by the crown. Paid in full. Right on time."),
  crag("grin", "On time. Did you catch that, Sandro? THAT is why I fight for Order."),
  sandro("sneer", "Enjoy your paltry coppers. I'll return to Deyja, raise a fresh horde, and..."),
  vidomina("smirk", "You won't be returning to Deyja, former Master. I replaced the locks on the barrows at sunrise."),
  vidomina("cold", "Deyja belongs to me now. Sleep lightly, Keeper. When I come for your crypt, I won't bother sending letters first."),
  sandro("rage", "Insolence! Treason! Mortimer, summon my carriage this instant!"),
  mortimer("cheer", "I work for Mr. Hack now, sir! I manage the accounts. And the soup spoons."),
  narrator("That evening, Mortimer walks down the Meadows road alone, stopping outside a cottage with ripening barley and a painted red door."),
  mortimer("nervous", "I still don't recall who lived in here with me. But there's a family inside, and they're safe. I think they'd be pleased."),
  crag("talk", "The crypt stays sealed, the Nexus is quiet, and the roads belong to you again, Keeper."),
  crag("grin", "Supper's ready. Turncoats, mercenaries, and couriers eat free tonight. And if peace gets dull, the night shift at the Endless Siege never stops."),
  crag("shout", "CRAG! HACK! Sorry. Force of habit.")
];

/** Battle quips: the UI picks one unlocked line per event. */
export const OC_BATTLE_QUIPS: Record<OcQuipEvent, OcGatedLine[]> = {
  start: [
    crag("shout", "Here they come! Gold-makers first!"),
    crag("talk", "First wave is on the road. Get your coins down, then ready your blades."),
    crag("grin", "Ah, the smell of battle. And stew. Mostly stew."),
    crag("sly", "Every coin on the grass is gold in your war chest. Click them up!"),
    gated("w8-5", mortimer("nervous", "They're coming! I'll be behind the wall. Well, under it."))
  ],
  orb: [
    crag("shout", "A Surge orb! Grab it, press G, and click a troop!"),
    crag("talk", "That glowing enemy dropped a Surge orb. Grab it quick, then press G."),
    crag("sly", "Surge orb on the grass! Every troop has its own power. Try one out!")
  ],
  "huge-wave": [
    crag("shout", "Big flag, big trouble! A HUGE wave is incoming!"),
    crag("shout", "Great assault! Everything they've got, all at once!"),
    crag("talk", "Here comes the big push. Now's the time for Surges and heavy spells."),
    sandro("sneer", "March, my darlings. Trample their precious lawn.")
  ],
  "final-wave": [
    crag("shout", "FINAL WAVE! Hold this line and we're done!"),
    crag("talk", "Last wave of the fight. Spend every coin, gold is no good in a grave."),
    crag("grin", "Final wave! Hold them off and hot stew is on me.")
  ],
  crown: [
    crag("shout", "Valor crown is full! Press U and pick a trained troop to Ascend!"),
    crag("talk", "Crown's ready. Press U, pick a troop: 15 seconds, 30% tougher and stronger, healed."),
    crag("grin", "Crown's glowing! Make someone a legend for 15 seconds. Press U!")
  ],
  charger: [
    crag("shout", "The gate Champion rode out! That lane has no second chance now!"),
    crag("shout", "Champion's spent in that lane! Plug the hole before they push through!"),
    crag("talk", "That was our last guard in that lane. If anything slips by, we lose.")
  ],
  boss: [
    crag("shout", "Big boss incoming! Save your Surges for this monster!"),
    crag("talk", "That's their leader. Focus fire: spells, Surges, hit it with everything."),
    crag("grin", "Now that's a big ugly brute. The bigger they are, the harder they fall."),
    sandro("sneer", "Do greet my champion, Keeper. It's simply dying to meet you."),
    gated("w3-5", vidomina("cold", "Sandro's prized pet. Loud, slow, and expensive. Just like him."))
  ],
  victory: [
    crag("shout", "We held the line! We HELD!"),
    crag("grin", "Not a single one got through. Well, not enough to matter!"),
    crag("sly", "Victory! Now then, about my barbarian fee... just joking. Mostly."),
    crag("grin", "Grand work. First bowl of stew is on me."),
    gated("w8-5", mortimer("cheer", "We won! And nobody lost a single rib! Well, I didn't."))
  ],
  defeat: [
    crag("talk", "Knocked flat? Shake it off. Next time, plant more gold-makers early."),
    crag("talk", "They broke through. Check the Almanac to see what beat you, and bring the counter."),
    crag("grin", "Every soldier takes a beating sometimes. Train up in the Barracks and try again."),
    crag("talk", "Try a different hero, or swap a seed packet. Every enemy has an answer."),
    crag("talk", "Don't hold onto your Surges forever. Pop one when the great assault hits."),
    gated("w8-5", mortimer("nervous", "Don't feel bad. Sandro loses constantly. He just writes nasty letters about it."))
  ]
};

/** A greeting at the top of a menu screen: one unlocked line, picked at random. */
export const OC_SCREEN_LINES: Record<"home" | "camp" | "barracks" | "almanac", OcGatedLine[]> = {
  home: [
    crag("grin", "Brookhold's still standing, and the stew's bubbling hot. Ready for another round?"),
    crag("talk", "Chaos doesn't take days off, and neither do our archers. Well, they take little naps."),
    catherine("regal", "Erathia rests easier knowing you're holding that gate, Keeper."),
    sandro("sneer", "I've drafted seventeen brand-new invasion maps. Do take your time."),
    gated("w3-5", vidomina("cold", "Still alive? Good. I prefer knowing exactly where my problems reside.")),
    gated("w8-5", mortimer("cheer", "All quiet on the road today! I've checked twice just to be sure."))
  ],
  camp: [
    crag("grin", "Welcome to the camp! Minotaurs and Beholders up from Nighon, sworn to Order."),
    crag("sly", "Seals only here. Gold is for the battlefield, but Seals are for contracts."),
    crag("talk", "Hire a merc once and they join your seed packets for good. Like family, only louder."),
    crag("grin", "Grab a bowl and look around. Nobody bites. Well, except the Minotaurs. Sometimes."),
    gated("w8-5", mortimer("cheer", "I keep the camp's books now! Mr. Hack's handwriting is... remarkably brave.")),
    gated("w8-5", mortimer("nervous", "The Minotaurs are quite lovely once they realise I'm not a soup bone."))
  ],
  barracks: [
    crag("talk", "Spend your Seals here. Every training rank gives a troop +15% health and power."),
    crag("grin", "Tougher soldiers hold lanes longer. Simple barbarian logic."),
    crag("shout", "Put those Seals to work! Hoarding Seals in a drawer never stopped a shambler."),
    gated("w2-5", crag("sly", "Train a troop to level 3 and the Altar lets them Ascend in battle. Press U when the crown fills."))
  ],
  almanac: [
    crag("talk", "The Almanac! Every friend and enemy we've run into, written down in one book."),
    crag("sly", "Stuck on a tricky wave? Look up what beat you. Every foe has a hard counter."),
    crag("grin", "Learn what they do before they're on your lawn. Saves a whole lot of masonry."),
    sandro("sneer", "A complete catalogue of my glorious horde. Do admire the illustrations."),
    gated("w1-5", mortimer("nervous", "Is my cousin in here? He'd be so thrilled to be printed in a book.")),
    gated("w3-5", vidomina("cold", "Study, Keeper. Knowledge is the one weapon that never runs dry."))
  ]
};

/** Said after an Endless Siege run: `best` for a new record, `short` otherwise. */
export const OC_ENDLESS_LINES: { best: OcGatedLine[]; short: OcGatedLine[] } = {
  best: [
    crag("grin", "New record! The night shift broke against our walls like water on granite."),
    crag("shout", "What a hold! Sandro will need an entirely new ledger to tally those losses."),
    crag("sly", "A brand-new personal best! That earns you bragging rights all across Krewlod."),
    gated("w8-5", mortimer("cheer", "I lost count after a while, but it was enormous! That's a record for sure!"))
  ],
  short: [
    crag("talk", "No record tonight. Swap your artifacts around and give the night shift another go."),
    crag("grin", "Solid stand anyway. Those stragglers caught a bloody nose before the gate bent."),
    crag("sly", "The night shift never sleeps. There'll be plenty more stragglers when you're ready."),
    gated("w8-5", mortimer("nervous", "That was terribly loud. But look, the gate is still hanging on its hinges!"))
  ]
};
