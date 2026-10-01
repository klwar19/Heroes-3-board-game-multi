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
export const OC_PROLOGUE_ID = "prologue:v5";

/** The first time the player opens the mode. */
export const OC_PROLOGUE: OcSceneLine[] = [
  narrator("Midnight. Someone is pounding on the gate of Brookhold, a small stone keep on Erathia's border road."),
  narrator("You open it. The soldiers marched east to the war this morning. You're the steward's helper, and the only one left."),
  narrator("A tired rider hands you a letter with the Queen's seal, then rides away into the dark."),
  catherine("stern", "To whoever holds Brookhold: an army of the dead is crossing our border. Your keep is right in its path."),
  catherine("regal", "I have no soldiers to send you. So from tonight, you are the Keeper of Brookhold. Hold the gate. Your neighbour will help."),
  narrator("Your neighbour lives in a painted wagon by the well. A big iron pot of stew bubbles over his fire."),
  crag("grin", "So you're the new Keeper. I'm Crag Hack. Barbarian. Retired, mostly. The Queen pays me to help you. She pays late, but she pays."),
  crag("talk", "Here's the trouble. A lich called Sandro, from Deyja, wants your keep. Well, not the keep. What's under it."),
  crag("sly", "Under your cellar is an old crypt. It sits on the Nexus, where lines of old magic cross. An army raised there never stays dead."),
  crag("talk", "So Sandro is sending his horde: the dead, demons, beasts, and anyone else he can pay. They call themselves Chaos."),
  crag("grin", "We're Order: you, me and the Queen. Your job is simple. Put troops in the lanes in front of the gate, and stop the horde. I'll teach you."),
  crag("sly", "Why does an old barbarian fight for Order? Easy. Chaos never pays on time."),
  narrator("Thunk. A bone pins a black envelope to the gate. A small skeleton stands beside it, looking very sorry."),
  mortimer("nervous", "Oh dear, sorry about the hole. A letter for the Keeper, from Master Sandro. I'll go now. Sorry again."),
  narrator("The letter is written in neat, beautiful handwriting."),
  sandro("sneer", "Dear Keeper. Enjoy your little keep while it stands. I've already picked the curtains for my new crypt.")
];

/** Shown when a world is first entered. */
export const OC_WORLD_STORY: Record<number, OcSceneLine[]> = {
  1: [
    narrator("Morning. From the gate tower, you see a long grey line coming down the Meadows road."),
    crag("talk", "Here they come. Sandro's shamblers. They're slow and stupid, but there are a lot of them."),
    crag("talk", "Time to learn the job. Your troops come in seed packets. Don't ask me why. The Queen's clerks named them, and nobody argues with clerks."),
    crag("grin", "Don't worry if your first fight is a mess. My first siege was a mess too, and I was the one breaking in.")
  ],
  2: [
    narrator("Three days north by wagon, the road climbs into Vori. Ice, wind, and glaciers as blue as glass."),
    crag("talk", "The Ascension Altar is at the very top. We have to clear these passes, one by one, before Sandro gets there."),
    crag("shout", "And watch the sky. Some of the horde can fly now."),
    crag("talk", "Sylphs and good shooters will deal with those. There's a supply caravan ahead too. It pays in troops, not gold."),
    crag("sly", "Oh, and some of Sandro's shamblers came to my wagon last night. He stopped paying them, so now they work for my stew."),
    crag("talk", "I call them the Turncoats. The Queen has a job for them: the Chaos Raids. The Endless Siege at Brookhold is open too. Both pay Seals.")
  ],
  3: [
    narrator("The Tatalian Mire. Warm mud, cold fog, and neat rows of fresh graves where no village ever buried anyone."),
    crag("talk", "Somebody is growing corpses out here, in straight rows, like cabbages. That's not Sandro. He's far too messy."),
    crag("talk", "In some fights here, you must protect troops that are already on the field. If even one of them falls, the battle is lost."),
    crag("sly", "Good news, though. My Mercenary Camp is open. Minotaurs and Beholders from Nighon, sworn to Order. They take Seals, not gold."),
    crag("grin", "And watch where you step. In this swamp, anything that isn't mud is probably hungry.")
  ],
  4: [
    narrator("Bracada Heights. White towers stand on the mountain tops, joined by bridges of cloud. The wind smells of ink and thunder."),
    crag("talk", "The wizards keep their star-charts up here. Sandro's raiders are already climbing the walls to steal them."),
    crag("talk", "And he brought nasty magic this time: stares that turn you to stone, curses, and claws that drop from the sky."),
    crag("talk", "Many of these creeps stop and attack from a distance. A wall won't save you from that. Shoot them where they stand."),
    crag("grin", "The wizards promised to pay us well. The bad news? They pay mostly in advice.")
  ],
  5: [
    narrator("The wagon rolls down an old mine ramp into Nighon. No sky here, just wet black rock, glowing mushrooms, and the sound of digging."),
    crag("talk", "We're underground now. No sky means no gold falling from it. Every coin comes from your gold-makers."),
    crag("talk", "You start with a bit more gold to help. Plant your gold-makers first, then build your wall."),
    crag("talk", "Beasts dig, horrors fly, and at the end of the tunnel, something is spinning webs in the dark."),
    crag("grin", "Not everyone down here is a monster, mind you. My Minotaurs say hello. Well, they grunt. It means hello.")
  ],
  6: [
    narrator("Deyja. Grey hills, black leafless trees, and burial mounds as far as you can see. Even the crows sound dead."),
    vidomina("cold", "Sandro is in Eeofol, making deals. Deyja answers to me now. Wipe your boots. Or don't. You won't stay long."),
    crag("talk", "Lovely welcome. It's night here too, so no gold falls. And the fog is as thick as soup."),
    crag("talk", "One good thing: Zealot Clerics hit the undead for double damage. And this place is full of undead."),
    mortimer("nervous", "Please be careful near the graves. My cousin is buried under lane three, and he sleeps very badly."),
    crag("sly", "Sandro, making deals with demons. I don't like the sound of that at all.")
  ],
  7: [
    narrator("Eeofol. Black rock, rivers of lava, and on the highest peak, the Hellgate stands open. Demons pour out of it."),
    crag("talk", "So that's what Sandro bought with his deals. Somebody opened the gate for him. We close it, or nobody sleeps again."),
    crag("talk", "Imps by the hundred, flying fireballs, hydras and giants. And at the top, Sandro himself."),
    sandro("rage", "You've gone too far, Keeper. The gate is MINE, and so is everything behind it!"),
    crag("grin", "Hear him shout? That means we're winning.")
  ],
  8: [
    narrator("Krewlod. Red dust, hot wind, and deep canyons. Crag goes quiet as the wagon rolls in."),
    crag("grin", "Krewlod! Home. Smell that hot red sand. It smells like old bar bills I never paid."),
    crag("talk", "Sandro has run out of skeletons, so he's buying living soldiers: sellswords, wolf riders, nomads, rogues. He pays in demon gold."),
    crag("talk", "Hired soldiers drop their pay when they fall. And when they're badly hurt, they run away. Finish them before they run."),
    crag("sly", "The trouble is, I used to ride with half of these thugs. Some owe me money. Some say I owe them. Let's not ask.")
  ],
  9: [
    narrator("Where the tear in the sky touches the ground, the grass has turned to glass. Strange things crawl out of the tear."),
    vidomina("cold", "Sandro spent the last of his demon gold on mages from other worlds. They tore the sky open. What comes out obeys no one."),
    crag("talk", "Wraiths that drink your mana, devils that appear behind your lines, and winged monsters that ignore spells. Be careful."),
    crag("talk", "The worst part? Nobody's in charge of them. At least Sandro's bone-heads walked down the road in neat lanes.")
  ],
  10: [
    narrator("Past the Rift, under a huge swollen moon, waltz music drifts through the trees. Paper lanterns. Dancers in masks."),
    crag("talk", "The Carnival of Masks. Sandro's big finale. Every dancer on that lawn is part of his dark ritual."),
    crag("talk", "Phantoms, acrobats, and beasts that never walk in a straight line. And it's night, so no gold falls from the sky."),
    crag("grin", "I don't dance. I stomp. It breaks ribs just the same."),
    mortimer("nervous", "Please don't stomp all the skeletons, Mr. Hack. Some of us are very polite.")
  ]
};

/** Shown once when a world's last level is first cleared (worlds 1 to 9; world 10 ends with the epilogue). */
export const OC_WORLD_OUTRO: Record<number, OcSceneLine[]> = {
  1: [
    narrator("For the first time all week, the Meadows road is quiet. Just crows, the wind, and Crag's stew bubbling by the well."),
    crag("grin", "Not one shambler left between here and the hills. You're a natural, Keeper. A slow natural, but a natural."),
    narrator("Someone knocks politely on the gate. It's Mortimer, holding his hat in his bony hands."),
    mortimer("nervous", "Hello again. No letter today, sorry. Master Sandro left in a hurry. He packed his best cloak and went north, to Vori."),
    crag("talk", "Vori? That's all snow and ice. What does a bag of old bones want up there?"),
    mortimer("nervous", "Something about an altar. Oh dear. I wasn't supposed to say that, was I? Please forget I said it."),
    crag("talk", "The Ascension Altar. Old magic. It can turn an ordinary soldier into a legend, just for a short time."),
    crag("shout", "If Sandro crowns his champions there, no gate will stop them. Lock up the keep and pack the wagon. We're going north."),
    mortimer("nervous", "Please don't tell him I told you. Thank you so much. And sorry about the gate. Again.")
  ],
  2: [
    narrator("Royal banners come up the snowy pass. Riding in front, with frost on her heavy cloak, is Queen Catherine herself."),
    catherine("regal", "So you are my Keeper. Brookhold still stands, and now the Altar is ours too. Erathia owes you a great deal."),
    catherine("stern", "I had to see it with my own eyes. Too many of my captains write lovely reports that aren't true."),
    crag("grin", "Your Majesty. Always a pleasure. And while you're here... about my pay?"),
    catherine("regal", "It's paid, barbarian. Three weeks late, as usual. Spend it on your Mercenary Camp, and keep my Keeper well supplied."),
    catherine("stern", "One more thing. My scouts saw the horde turn south, into the Tatalian Mire. Something bad is growing there. Go and find out what."),
    crag("sly", "Three weeks late is still better than Chaos. Pack a second pair of boots, Keeper. The swamp eats the first pair.")
  ],
  3: [
    narrator("The swamp fog clears. Vidomina stands at the water's edge, clean and dry, watching her graves fall in."),
    vidomina("cold", "A tidy little win. Enjoy it. I've learned all I needed to know about how you fight."),
    vidomina("smirk", "While you splashed about in the mud, Sandro went to Bracada. You're guarding the wrong tower, Keeper."),
    narrator("She steps back into the grey mist and is gone."),
    crag("talk", "Bracada. The wizards there have star-charts of every line of old magic in the world. Including the ones that lead to the Nexus."),
    crag("shout", "Whatever Sandro wants from those charts, he isn't getting it. Into the wagon. We're leaving.")
  ],
  4: [
    narrator("The war drums stop. The towers still stand. Wizards come out onto their cloud bridges and clap politely."),
    crag("grin", "Look at that. They sent us a whole sack of thank-you letters. Not one coin inside, of course."),
    narrator("Then the Grand Magus runs down the marble steps, holding up his robes with one hand. In the other, he waves an empty leather case."),
    crag("talk", "Wait. He says someone opened the vault weeks ago. The charts were copied long before we got here."),
    crag("talk", "And those charts show a secret way into your crypt from below. Up from Nighon, through the old deep tunnels."),
    crag("shout", "This whole siege was to keep us looking up. Sandro is digging under your cellar right now. Light the torches. We're going underground.")
  ],
  5: [
    narrator("Crag lights the fuse himself. With a huge roar, the tunnel to Brookhold falls in, buried under tons of rock."),
    crag("grin", "That's the back door shut for good. And it's nice to see the sun again. I was starting to feel like a bat."),
    narrator("By the cave mouth, blinking in the bright light, Mortimer is waiting politely."),
    mortimer("cheer", "Welcome back up! Master Sandro asked me to give you a message. It was mostly swearing, so I left that part out."),
    mortimer("nervous", "He's gone home to Deyja. He says he's done being clever. He'll just raise everything at once. He sounded very tired."),
    crag("talk", "No more tricks, then. Every grave in Deyja opening at once. Unless we get there first.")
  ],
  6: [
    narrator("The graves are quiet at last. Mortimer stands alone by an old, mossy headstone with no name on it."),
    mortimer("nervous", "Before Master Sandro brought me back, I was a farmer in the Meadows. Good barley. A bright red door."),
    mortimer("nervous", "I can't remember who lived there with me. I used to know their names. I'm sure I used to know."),
    crag("talk", "Then we'll keep the Meadows safe for whoever lives there now. That's a promise, bones."),
    narrator("Far to the south, over the mountains of Eeofol, the clouds glow an angry red."),
    crag("shout", "The Hellgate is opening. So that's what Sandro was buying. Move your boots.")
  ],
  7: [
    narrator("The Hellgate slams shut with a sound like thunder. Then everything is quiet. For the first time in weeks, a bird sings."),
    narrator("Erathia's great army finally marches in. Too late for the battle, but just in time for the speeches. Catherine rides in front."),
    catherine("regal", "The gate is closed. Erathia owes you everything, Keeper. And you too, barbarian."),
    catherine("stern", "Three border villages burned before it closed. I will read the name of every one at the service."),
    crag("talk", "Sandro didn't die with his dragon, Majesty. He jumped clear and ran west, to Krewlod, with big sacks of demon gold."),
    crag("talk", "He has no army left. But in the badlands, gold buys soldiers. So he's hiring."),
    crag("sly", "And I know who he'll try to buy first: my old warband. Time I had a word with the lads.")
  ],
  8: [
    narrator("The old warband's torn banner lies in the red dust. Crag picks it up, shakes it clean, and puts it away in the wagon."),
    crag("talk", "Most of the lads went home. Good. They weren't evil, just hungry, and badly led after I left."),
    mortimer("cheer", "I've finished Mr. Hack's accounts! He only owes twelve thousand gold now."),
    crag("sly", "Let's keep that number between friends, bones."),
    narrator("A sound like breaking wood cracks across the clear sky. Above the peaks, the blue air rips open like wet paper."),
    crag("shout", "The sky is tearing open! What has Sandro broken now?")
  ],
  9: [
    narrator("With a wet snap, the Rift closes. The glass fields crack into dust, and green grass grows back through."),
    vidomina("cold", "The Rift is closed. You saved your keep, and my Deyja with it. Don't call that friendship."),
    vidomina("smirk", "Sandro ran past the Rift to his carnival. Masks and waltzes while the sky fell apart. Just like him."),
    vidomina("cold", "It isn't a party. It's an old ritual dance on a line of magic, where nothing that falls stays dead."),
    crag("talk", "A dance of corpses on a line of old magic. So that's his last try for the Nexus."),
    vidomina("smirk", "Go and ruin his party, Keeper. Then we'll see who writes the next letter.")
  ]
};

/** Per level: Sandro's letter, the scene before the battle and Crag's words after the first victory. */
export const OC_LEVEL_STORY: Record<string, OcLevelStory> = {
  "w1-1": {
    before: [
      narrator("The first shamblers reach the fence. Three dirt roads lead to your gate, and the dead are coming down all three."),
      crag("talk", "Lesson one: gold. Out here it falls from the sky. Click the coins to pick them up."),
      crag("talk", "Spend it on Peasant Tithes first. Each one pays you 25 gold every 24 seconds. More gold means more soldiers."),
      crag("talk", "Then Longbowmen. They shoot down their lane every 1.4 seconds, and every fourth arrow is a critical hit."),
      crag("talk", "After you place a troop, its packet needs a moment to recharge. You can't place the same troop again straight away."),
      crag("grin", "And watch the shamblers. Knock one down, and it gets back up and crawls on. Give it one more arrow."),
      crag("sly", "Last thing: you've got a Surge orb. Press G, or click the orb button, then click a troop. That troop uses its special power."),
      crag("talk", "Some foes glow. They carry more orbs. Knock them down and pick the orbs up.")
    ],
    after: [
      crag("grin", "First win for Order! Here, take the Dwarf Shieldwall: 4000 health for 50 gold. Enemy spells only do half damage to it."),
      crag("talk", "Wins earn Seals. Spend them in the Barracks: each level gives a troop 15% more health and power. Meet a level's goals for stars and more Seals.")
    ]
  },
  "w1-2": {
    letter: "Dear Keeper,\nI see you've met my shamblers. Please stop shooting them. They're very old.\nI need the crypt under your keep. It's nothing personal. It's simply the best cellar in Erathia.\nBe a dear and leave the gate open. I'll bring my own furniture.\n\nYour future landlord,\nSandro\n\nP.S. Sorry about the hole in your gate. - M.",
    before: [
      crag("sly", "Landlord? He hasn't even seen your cellar. It's damp and full of old turnips."),
      narrator("Down by the river, troglodytes dig through an old battlefield. Each one climbs out wearing a soldier's iron helmet."),
      crag("talk", "Those helmets take the first 450 damage. When a helmet comes off, the troglodyte stands there dazed. Hit it then."),
      crag("talk", "Put a Dwarf in front and your archers behind. The Dwarf takes the hits, and the arrows do the work."),
      crag("shout", "One more thing. Each lane has a Champion at the gate, and he rides out only ONCE. After that, anything that gets through reaches the keep.")
    ],
    after: [
      crag("grin", "Here's a Gremlin Sapper, just 25 gold. He buries a charge that's ready after 14 seconds. The first foe to step on it takes 1800."),
      crag("talk", "And your first spell: Magic Arrow. It hits one foe for 150 and costs 5 mana. Your mana fills back up by itself.")
    ]
  },
  "w1-3": {
    before: [
      narrator("Past the ridge, the road splits into five. Today the dead are coming down all five roads to Brookhold."),
      crag("talk", "Five roads today, not three. So spend your gold carefully."),
      crag("talk", "See the big shields? Skeleton Shieldbearers. A shield stops 1000 damage from arrows and other straight shots from the front."),
      crag("talk", "And every fourth time one strikes, it hits with the shield instead. That stuns your troop."),
      crag("talk", "But a lob flies over the shield, and spikes and blades get round it."),
      crag("sly", "And a Sapper's charge goes off right under their feet. A shield can't help with that.")
    ],
    after: [
      crag("grin", "Meet the Snow Elf. Her frost spears make a foe walk and bite at half speed for 10 seconds."),
      crag("sly", "A trick: drop a Snow Elf packet on a Longbowman. You get an Arctic Sharpshooter, with frost arrows that go through foes."),
      crag("talk", "You also get one more seed packet slot. More slots, more tricks."),
      crag("grin", "And a Stone Gargoyle, 50 gold. It waits until a foe comes close, then drops on it for 1800. One use only, but what a use.")
    ]
  },
  "w1-4": {
    before: [
      narrator("The horde has surrounded the old river mill. The millers are trapped inside, and no supply cart can get through."),
      crag("talk", "This is a Last Stand. No gold falls from the sky today. You start with 1500 gold, and that's nearly all you get."),
      crag("talk", "So plan everything first. Your packets don't recharge while you set up. When you're ready, blow the horn."),
      crag("talk", "Sandro sent Imp Runners this time. They're fast, and they jump right past the first troop they meet."),
      crag("sly", "So keep a second line behind the first. The millers are counting on us. So is my breakfast bread."),
      crag("talk", "And the mill wheel is still turning. It's the only other gold you'll see today.")
    ],
    after: [
      crag("grin", "A Fire Elemental! Place it, and a moment later it bursts: 1800 damage to every foe in the 3x3 around it."),
      crag("sly", "And the Endless Sack of Gold: 25 gold every 15 seconds. You've got an artifact slot now. Put it on before a fight.")
    ]
  },
  "w1-5": {
    letter: "Keeper,\nA small gift from my friends in Eeofol: hounds.\nThey're fully house-trained. That means they eat houses.\nDo feel free to pet them. Quickly.\n\nWarmly (not really),\nSandro\n\nP.S. The big one holding the leashes is the Kennel Abomination. It's made of a dozen dead things. I'm so sorry. - M.",
    before: [
      narrator("At dusk, the wheat fields smell of smoke. Something howls in the dark, and a haystack bursts into flames."),
      crag("talk", "Hell Hounds. Demons don't lend their dogs to just anyone. So Sandro has friends in Eeofol now. I don't like that."),
      crag("talk", "They run fast and jump right over the first troop in their way. And their bite keeps burning after it lands."),
      crag("talk", "So give them something cheap to jump over, with something tough right behind it. A Dwarf is perfect there."),
      crag("sly", "Every few waves the horde makes a great assault, all at once. A big leader Hound runs with each one. Save a Surge orb for him."),
      crag("shout", "And last comes their master, the Kennel Abomination. Red marks on the ground show where its next blow lands. Bring it down, and we win."),
      crag("talk", "It stops 3.5 tiles from the gate and fights from there. If a lane's Champion rides out, he hits it hard and throws it back.")
    ],
    after: [
      crag("grin", "Look who's here: Gelu, Ranger of AvLee. With him, arrows, spears and frost shots hit 30% harder. His Rain of Arrows hits flyers too."),
      crag("talk", "From now on, you pick a hero before each fight. Each one helps your whole army, and brings a special spell."),
      crag("talk", "And here's a Sylph. Every 10 seconds her wind pushes foes in her lane 1.5 tiles back, and blows flyers right off the field.")
    ]
  },
  "w2-1": {
    before: [
      narrator("The first mountain pass. A high, angry buzzing comes over the blue ice, like a hundred boiling kettles."),
      crag("talk", "Dragon Flies. They fly right over your troops and head straight for the gate."),
      crag("talk", "Normal arrows can't reach them up there. But a Sylph's wind blows flyers right off the field."),
      crag("talk", "Every two tiles, they hop sideways into the next lane. So put a Sylph in every lane."),
      crag("grin", "Gelu's Rain of Arrows hits them too. One good spell, and buzz, buzz, splat.")
    ],
    after: [
      crag("sly", "Here's Yuuka, the Treasurer, for 75 gold. She pays you 15 gold every 18 seconds, and 5 more each time, up to 45."),
      crag("grin", "She calls it compound interest. I don't understand the maths, but I love free money."),
      crag("talk", "And a Wood Elf Band joined us. Drop a second Band packet on the first, and you get a Pack of two elves. A third makes a Horde."),
      crag("grin", "Every elf adds an arrow to each volley. And a bit to the price.")
    ]
  },
  "w2-2": {
    before: [
      narrator("The second icy pass. Small figures in dirty fur hats run across the glacier. Their pockets jingle with stolen coins."),
      crag("talk", "Kobolds. Little thieves. Every time one hits your troops, it steals 20 of your gold."),
      crag("talk", "When a Kobold has 60 gold in its bag, it turns and runs home. Kill it before it gets away, and you get every coin back."),
      crag("sly", "They're fast. But a Snow Elf's frost slows their little legs right down."),
      crag("talk", "And see those three chests on the lawn? Shoot them open before the Kobolds get to them."),
      crag("grin", "Sandro pays them with whatever they steal from you. The cheapest boss alive. Well, not alive. You know what I mean.")
    ],
    after: [
      crag("grin", "Meet the Cyclops Hurler. He throws boulders over shields and smashes them. Every third boulder stuns for 2 seconds."),
      crag("talk", "And the Pendant of Courage: you start every battle with a Surge orb, and you can carry one more orb than before.")
    ]
  },
  "w2-3": {
    before: [
      narrator("At the third pass, an Erathian supply caravan is stuck in deep snow. The sledges are full of soldiers, but there's no money."),
      crag("talk", "A caravan run. No gold today. The belt hands you troops for free, but the first wave comes much sooner."),
      crag("talk", "Don't let the belt fill up. Keep placing troops as they arrive."),
      crag("talk", "You can't choose your troops, so use what comes: Sylphs for flyers, Dwarves in front, Sappers where the big shields walk."),
      crag("shout", "And watch for Jotunn Frostcallers. Every 9 seconds, one of them locks a troop in ice."),
      crag("sly", "Here's a trick: drop a Fire Elemental packet on a Dwarf. You get a Brimstone Dwarf, and the troops next to him stay warm.")
    ],
    after: [
      crag("grin", "Now that's a wall: an Iron Golem! 8000 health of magic iron, too tall to jump over, and enemy spells only do half damage."),
      crag("talk", "You've also got a new spell, Frost Ring. It freezes every foe in a 3x3 area for 5 seconds."),
      crag("grin", "And I found an Automaton in the caravan: a clockwork wall. When it finally breaks, its boiler bursts for 1200 all around.")
    ]
  },
  "w2-4": {
    before: [
      narrator("Near the top, wild music floats over the snow: hooves, pipes, and Satyrs dancing up the glacier."),
      crag("talk", "Satyrs. Don't let the dancing fool you. They jump right over every troop in their way: walls, archers, everything."),
      crag("talk", "Only a tall troop stops them dead. That's what your Iron Golems are for."),
      crag("grin", "And their pipes make every friend near them move and attack faster. Party animals. I hate parties I'm not invited to."),
      crag("talk", "Frost Mammoths are coming too. They roll right over your troops, and only something tall stops them as well.")
    ],
    after: [
      crag("talk", "Here's a Pikeman. He stabs every foe within a tile, in front or behind, and does double damage to cavalry."),
      crag("sly", "And the Golden Bow: your straight shots go through one more foe."),
      crag("grin", "Plus a Lizard Warrior from the swamp! When his health drops below 30%, he charges down the whole lane, then goes home.")
    ]
  },
  "w2-5": {
    letter: "Dear Keeper,\nThe cold suits the dead. It keeps us lovely and fresh.\nMy Death Riders were noble knights once. They still insist on charging on horseback. I haven't the heart to tell them it's out of fashion.\nThe Altar will crown them. You're invited to watch.\n\nFrostily,\nSandro, Lord of the Horde\n\nP.S. Sorry for the shaky writing. My fingers froze. Well, more than usual. - M.",
    before: [
      narrator("The icy summit. The Ascension Altar glows softly in the snow. Across the glacier, a line of skeleton knights lowers their lances."),
      crag("talk", "There it is. Whoever holds the Altar at sundown keeps it. And that's going to be us."),
      crag("talk", "Death Riders, coming in fast. They have 900 armour, and their first lance strike does double damage."),
      crag("talk", "But Pikemen do double damage to riders. Put your spears right where those lances are pointing."),
      crag("sly", "Their strongest Rider leads each great assault. Keep a Surge orb in your pocket for him."),
      crag("shout", "And at the very end comes the Frost Wyrm, a dead dragon of the ice. Its breath freezes troops solid. Keep a fire troop next to them.")
    ],
    after: [
      crag("grin", "Solmyr the Djinn joins us! With him, mana comes back twice as fast, and he brings Chain Lightning."),
      crag("grin", "And a Storm Elemental: 1800 damage down its whole lane, flyers too. Plus one more seed packet slot."),
      crag("shout", "And the Ascension Altar is ours! Kill foes to fill the Valor crown, then press U and pick a troop: 15 seconds with 30% more health and power."),
      crag("sly", "Only troops trained to level 3 in the Barracks can Ascend. And my Mercenary Camp is open now. Bring your Seals.")
    ]
  },
  "w3-1": {
    before: [
      narrator("Sparks crackle in the wet reeds. Giggling goblins roll black powder kegs through the mud toward your line."),
      crag("talk", "Goblin Sappers. They roll a keg up to your troops, light the fuse, and 2.5 seconds later the whole 3x3 area blows up."),
      crag("talk", "Frost and stuns hold the fuse. Use Snow Elves, Cyclops boulders, or a Frost Ring."),
      crag("sly", "And if fire hits a keg before it's lit, it blows up among their own friends. A Fire Elemental dropped in the middle of them is a lovely surprise."),
      crag("talk", "Oh, and the middle road is flooded. Look.")
    ],
    after: [
      crag("grin", "Here's the Sharpshooter. Every 5 seconds it shoots the toughest foe in its lane for 150, right through armour. Flyers too."),
      crag("grin", "And a Couatl hatched in the reeds. It makes you a Surge orb every 40 seconds. It lives on rainbows, apparently.")
    ]
  },
  "w3-2": {
    before: [
      narrator("Deep in the swamp, a ring of brambles surrounds a grove of silver willows. Two Enchanters work inside, guarding the last clean spring in the Mire."),
      crag("talk", "We must protect them. If either Enchanter falls, we lose. Box them in: a Dwarf right in front, and your shooters behind."),
      crag("grin", "While those two are alive, they send mana to your hero. So cast spells whenever you like."),
      crag("talk", "Watch out for the Goblin kegs. That 3x3 blast kills an Enchanter just as easily as a wall."),
      crag("shout", "And here come Ladder Hobgoblins. If one leans a ladder on your front wall, every walking foe climbs right over it. Even over tall golems."),
      crag("talk", "So shoot the ladder carrier before he sets it up. Once it's up, it stays until that wall falls, or you dig the troop up.")
    ],
    after: [
      crag("grin", "Meet the Gnome. He puts stone spikes in his tile. Foes walk right over him and take 40 damage a second, and he never blocks the lane."),
      crag("talk", "And the Armor of Wonder: all your troops get 30% more health.")
    ]
  },
  "w3-3": {
    before: [
      narrator("Drums sound through the swamp fog. Painted orcs come splashing through the black water, shouting war cries."),
      crag("grin", "Orc Berserkers. Distant family of mine. We don't talk at family parties."),
      crag("talk", "Hurt one below half health, and he goes wild: he moves and attacks twice as fast. So don't just tickle them."),
      crag("talk", "Hit them hard, all at once: Sapper charges, or a well-timed Surge."),
      crag("sly", "There's a Dwarven treasury on the middle road, with a Dwarf locked inside. Break it open, and he'll fight for us."),
      crag("talk", "Two roads are flooded this time, so lay your Rafts first.")
    ],
    after: [
      crag("talk", "Here's an Undine. Every 12 seconds she wraps a troop next to her in a 600 HP water shell."),
      crag("grin", "And a new spell, Haste: all your troops move and attack 50% faster for 10 seconds.")
    ]
  },
  "w3-4": {
    letter: "Keeper,\nMy apprentice has planted graves all over your lawn. You may find them in the way. That is rather the point.\nThe residents will be up soon. She is very proud of her work. I am... supportive.\n\nYour thoughtful neighbour,\nSandro\n\nP.S. Please don't be too hard on the residents. They didn't ask to be dug up. - M.",
    before: [
      narrator("Overnight, neat little graves have appeared all over the grass. The wet earth on top is already moving."),
      crag("talk", "An apprentice, eh? That explains why the graves are in such neat rows."),
      crag("talk", "And the roads are flooded again. Something is swimming under that water: the drowned dead. Nothing can aim at them while they're under."),
      crag("shout", "Smash the graves in your busiest lanes first. Or better, I know someone who can help with that.")
    ],
    after: [
      crag("grin", "Here's a Halfling Grenadier. He throws bombs across three lanes: 60 to the target, and 35 to the foes around it."),
      crag("sly", "And the Shield of the Yawning Dead: one in every five foes you kill drops 15 extra gold."),
      crag("talk", "Javelin has joined us too. Her spear thrust hits every foe up to two and a half tiles ahead, before they can reach her.")
    ]
  },
  "w3-5": {
    letter: "Keeper,\nI'm sending my apprentices, led by my star pupil. They raise graves with every step. That's more than your peasants can do.\nAlso, that barbarian next door is a terrible influence. He shouts all the time.\n\nDisapprovingly,\nSandro",
    before: [
      crag("shout", "I DO NOT SHOUT."),
      narrator("Out in the swamp, a pale woman in black robes walks across the dark water as if it were stone. Robed figures follow her."),
      vidomina("cold", "You do shout. I'm Vidomina. The graves were my idea. Sandro only signs the letters."),
      vidomina("cold", "Every 12 seconds, each of my Necromancers raises a new grave beside them. Do try to keep up."),
      crag("talk", "Sharpshooters can shoot the robed ones, and Halfling bombs fly right over the gravestones."),
      crag("talk", "Kill the Necromancers, and no new graves appear. Simple."),
      vidomina("smirk", "Simple. Yes. That's the word I'd use for you too. And my Mire Lich will finish what they start."),
      crag("talk", "The Lich comes last. It throws death bolts at your most expensive troops and raises graves on open ground. So spread your gold out.")
    ],
    after: [
      crag("grin", "Look who's here: Adelaide, the Frost Cleric! With her, your troops heal 5 health a second. Her Prayer heals everyone and makes them faster."),
      crag("talk", "And the Ice Elemental: it shatters in a burst of frost and freezes every foe in the 3x3 solid for 10 seconds."),
      crag("sly", "You've got a second artifact slot too. Two magic toys at once. Look at you.")
    ]
  },
  "w4-1": {
    before: [
      narrator("The lowest wizard tower. In the courtyard, some librarians stand frozen in grey stone, in the middle of a sentence."),
      crag("talk", "Medusa Queens did that. They stop 3.5 tiles from your front line and stare. Every 6 seconds, one of your troops turns to stone for 4 seconds."),
      crag("talk", "They won't walk into your wall, so don't wait for them. Shoot them where they stand."),
      crag("sly", "And don't worry about the librarians. The wizards say it wears off. They just didn't say when.")
    ],
    after: [
      crag("grin", "Enchanters! They send 3 mana to your hero every 12 seconds. More mana, more spells."),
      crag("talk", "And the Great Shaman throws frost magic over walls and shields. Every foe it hits walks at half speed."),
      crag("sly", "Wear this Pendant of Second Sight, too. Your troops shake off stuns, stone, webs and ice twice as fast.")
    ]
  },
  "w4-2": {
    before: [
      narrator("Sharp screams come from the clouds. Harpies circle the second tower, looking for something shiny to grab."),
      crag("talk", "Harpy Snatchers. One lands right on your most expensive troop, and 4 seconds later she flies off with it."),
      crag("talk", "So shoot her down before then, or blow her away with a Sylph. She always picks your most expensive troop, so you know where she'll land."),
      crag("grin", "She reminds me of my Aunt Helga at a wedding. Straight for the silver plates."),
      crag("shout", "And watch for Stormbirds. They carry a troglodyte over your wall and drop it behind your front line. Shoot them down early.")
    ],
    after: [
      crag("grin", "Here's the Arch Mage. His bolts hit for 30, then jump to two more foes nearby."),
      crag("talk", "And the Cards of Prophecy: all your seed packets recharge 30% faster."),
      crag("sly", "Plus the Aegis Bearer. His dome covers the 3x3 around him. Lobbed shots bounce off it, and nothing can hit it from the sky.")
    ]
  },
  "w4-3": {
    before: [
      narrator("The Grand Tower, where the star-charts are kept. The cloud bridge is broken, and the horde is climbing onto the roof."),
      crag("talk", "Another Last Stand. You get 3500 gold to build your line. Nothing falls from the clouds, and there's no more after that."),
      crag("talk", "Satyrs, Death Riders and Medusas, all at once. Iron Golems stop the jumpers, and Pikemen stop the riders."),
      crag("sly", "You start with a Surge orb ready. Keep it for when the line starts to bend."),
      crag("shout", "And watch that Goblin Siege Catapult. It stops far back and throws boulders at your REARMOST troop. That means your gold-makers."),
      crag("talk", "An Aegis dome turns those boulders away. When the machine runs out of rocks, it rolls forward and crushes things. So keep shooting it.")
    ],
    after: [
      crag("grin", "Look at the Master Genie. Every 6 seconds he casts Slow on the three nearest foes, across three lanes."),
      crag("talk", "And a new spell, Meteor Shower: 500 damage to every foe in a 3x3 area.")
    ]
  },
  "w4-4": {
    before: [
      narrator("The high observatory. Glowing eyes float in through the tall windows, and a brain in a glass jar drifts behind them."),
      crag("talk", "Evil Eyes look right past your walls, the troops with no attack of their own, and burn whatever stands behind them."),
      crag("talk", "And those Psychic Watchers put a dome over everything within a tile of them. Lobbed shots bounce off: boulders, grenades, frost magic."),
      crag("grin", "But arrows, blades and lightning go straight through. No eyeball likes an arrow. Or my axe."),
      crag("talk", "We're on the roof again. Crates first, and the ridge is in the sixth column this time.")
    ],
    after: [
      crag("grin", "Here's the Zealot Cleric. His holy bolts do double damage to the undead. Every 5 seconds he heals the most hurt troop near him for 150."),
      crag("talk", "And the Shackles of War: the whole horde walks 15% slower."),
      crag("grin", "A Gunslinger rode in from the Factory: four quick shots at the nearest foe in his lane or the two beside it. Flyers too.")
    ]
  },
  "w4-5": {
    letter: "Keeper,\nYou've beaten stares, curses and harpies. How very boring of you.\nMy ogres brought war drums. I asked for a quiet, polite siege. They don't know the word.\nTheir chief, Grogg, will say hello for me. Loudly.\n\nWith a terrible headache,\nSandro\n\nP.S. The drums shook two of my ribs loose. I found one of them. - M.",
    before: [
      narrator("Heavy drums shake the mountain. An ogre war band marches up the path to the observatory, all in step."),
      crag("talk", "Ogre Shamans. Their war drums make every friend near them march and hit 35% faster."),
      crag("talk", "So kill the drummers first. A Sharpshooter always aims at the toughest foe in its lane, and these Shamans are tough."),
      crag("shout", "And at the end comes their chief, Grogg the Warchief. He stops 3.5 tiles from the gate and fights from there."),
      crag("talk", "His drums speed up the whole horde, and he throws boulders at your three most expensive troops. Red marks show where. An Aegis dome blocks them."),
      crag("sly", "Funny, though. Sandro never makes this much noise unless he wants us looking the wrong way.")
    ],
    after: [
      crag("grin", "Tazar, Warlord of Tatalia, joins us! With him, the horde does 25% less damage, and his Earthen Bulwark raises stone walls out of the ground."),
      crag("grin", "And a Pixie came along. She's free, and zaps anything within 3.5 tiles. By day she sleeps, until you give her my Wake-Up Brew."),
      crag("sly", "And a Moon Sprite, for 25 gold. She collects moon-silver: 15 gold every 24 seconds, a bit more each time, up to 30. Another night owl."),
      crag("talk", "Plus one more seed packet slot. You have an answer for nearly anything now.")
    ]
  },
  "w5-1": {
    before: [
      narrator("Fresh tunnels branch off in every direction. The loose earth is still warm. Whatever dug them is still digging."),
      crag("shout", "Sandworms. They dig under everything and come up behind your front line, facing your troops."),
      crag("talk", "So keep a guard at the back. A Pikeman stabs behind him just as hard as in front."),
      crag("talk", "And watch the Mantis Reapers. Every third swing, they spin and cut every troop around them. Shoot them before they get close.")
    ],
    after: [
      crag("grin", "Look at this Ballista. Its heavy bolts go through every foe in the lane. Flyers too."),
      crag("grin", "And a Faerie Dragon! Every 4 seconds it throws a random spell at the nearest foe in its lane: frost, fire or lightning."),
      crag("sly", "One more for your spellbook: Dispel. It tears the shields, helmets and armour off every foe in a 3x3 area.")
    ]
  },
  "w5-2": {
    before: [
      narrator("A cave as big as a cathedral. High up on the stone ceiling, huge leathery wings rustle. Something just woke up."),
      crag("talk", "Wyvern Monarchs. Flying beasts with 1100 health and thick scales. Every 7 seconds, one dives on the troop below it."),
      crag("talk", "Normal arrows can't reach them up there. But Ballistae, Sharpshooters, lightning and Sylphs can."),
      crag("sly", "And there's a Dwarven treasury in the middle of the cave, with its guards asleep. Break it open, and the Dwarf inside joins us.")
    ],
    after: [
      crag("grin", "Here's Aris, the Hyper Cannon! While a foe is in her lane, she charges for 8 seconds, then fires a 450 beam through everything ahead."),
      crag("talk", "And a Magic Elemental. Its pulses hit every foe within 4 tiles ahead, shields and all. It's a night creature, so by day it needs the Brew."),
      crag("talk", "Wear the Dragon Wing Tabard, and flyers take 50% more damage from everything that reaches them.")
    ]
  },
  "w5-3": {
    before: [
      narrator("An old mine shaft. A rusty ore cart still rolls along the tracks, piled high with war machines."),
      crag("talk", "Another belt run. The mine cart brings heavy weapons: Ballistae, Golems, Storm Elementals and Arch Mages. And the night folk, too."),
      crag("grin", "Don't ask where I found the Iron Golems. They were just standing around. Mostly."),
      crag("talk", "You'll face Sandworms and Wyverns here, so cover the sky and watch your back row."),
      crag("shout", "And Nightmares. Every 10 seconds, one of them neighs and puts a troop to sleep. A sleeping troop does nothing."),
      crag("talk", "Oh, and an underground river runs right across the cave.")
    ],
    after: [
      crag("sly", "A Leprechaun! When a foe dies in his lane or the two next to it, there's a 40% chance he drops 25 gold."),
      crag("grin", "And the Ogre's Club of Havoc: your close-up blows, stares and lightning hit 50% harder. Now that's a club."),
      crag("grin", "The mine cart also coughed up a Steel Elf. She throws javelins down three lanes at once.")
    ]
  },
  "w5-4": {
    before: [
      narrator("The tunnel runs past a lake of bubbling lava. Fire spirits, the Efreet Sultans, rise out of the hot rock, looking bored."),
      crag("talk", "Efreet Sultans don't care about burning shots. So leave your fire at home today."),
      crag("talk", "And if you hit one up close, it burns your fighter for a third of the blow. Use arrows, frost and boulders instead."),
      crag("talk", "There are graves on the cave floor too. Send Gertrude to eat the ones in your busiest lanes.")
    ],
    after: [
      crag("grin", "Here's a Crusader. His blade hits for 50, and every foe he kills makes him strike 15% faster, up to five times."),
      crag("shout", "And the Magma Elemental! Plant it, and a moment later it erupts: 3000 damage to everything near it, across five lanes."),
      crag("talk", "It leaves a crater behind. And it only wakes up at night, or with a Brew."),
      crag("talk", "Here, an Eversmoking Ring of Sulfur. Fire does half damage to your troops, and no Fire Messenger can burn one to ashes.")
    ]
  },
  "w5-5": {
    letter: "Keeper,\nGold is so hard to find underground. However will you manage?\nThe Web Queen, Arachne, wants to meet you. She's very keen to keep you. Forever.\n\nFrom the depths,\nSandro\n\nP.S. I brought a broom to clear the webs. She kept the broom. - M.",
    before: [
      narrator("The end of the tunnel. Behind a maze of thick webs, a shaft climbs straight up toward the cellar of Brookhold."),
      crag("talk", "This is the place. Break through here, and we can bring the roof down on the whole tunnel."),
      crag("shout", "Cave Trolls first. They heal 40 health a second! Don't nibble at them. Hit hard, all at once: Sapper charges, Fire Elementals, Meteor Showers."),
      crag("talk", "There's a crypt door on the middle road too. Smash it, or send the pig."),
      crag("shout", "And last comes Arachne, the Web Queen. She stops 3.5 tiles from the gate, webs your four most expensive troops, and sends her daughters in."),
      crag("talk", "Red marks show where she'll strike next. When she's hurt, she spits venom. When she's badly hurt, she runs from lane to lane."),
      crag("sly", "So don't put all your gold in one lane. Spiders love a full table.")
    ],
    after: [
      crag("grin", "Meet Sensei from Schale! With Sensei, gold coins collect themselves, and Supply Drop calls in a fresh Surge orb."),
      crag("talk", "And the Ammo Cart: every shooter in its 3x3 fires one extra shot with each volley."),
      crag("sly", "You've got a third artifact slot, too. Three magic toys at once. You're rich."),
      crag("talk", "Last thing: a Lamplighter, for 25 gold. His lantern lights his lane and the two beside it. Where we're going next, you'll want him.")
    ]
  },
  "w6-1": {
    letter: "Keeper,\nWelcome to Deyja, my humble home. Do be careful with Queen Carmilla. She's a dear friend and a terrible dinner guest.\nShe never leaves after the first goodbye.\n\nKindly,\nSandro\n\nP.S. She keeps looking at my ribs like a soup bone. Please hurry. - M.",
    before: [
      narrator("Carmilla's court: a crumbling hall lit by black candles, full of pale guests in velvet. The vampire queen smiles at you."),
      crag("talk", "Carmilla heals herself with every bite. And when you knock her down, she gets back up. Once."),
      crag("talk", "So knock her down twice, and hit her hard. Zealot Clerics do double damage to the undead."),
      crag("talk", "The middle road is flooded, too, so Rafts first. And then there's the fog.")
    ],
    after: [
      crag("grin", "Look at Hina, the Prefect! Her machine gun fires six rounds of 11 every 2 seconds."),
      crag("talk", "And the Sandals of the Saint. When you Surge a troop, it's also fully healed, and cured of poison, curses, stuns, hexes and ice.")
    ]
  },
  "w6-2": {
    before: [
      narrator("The great grave fields, where Sandro plans to raise his army. There are more headstones here than weeds."),
      crag("talk", "Graves everywhere, Necromancers making more, and two crypts. Find the open tiles where you can plant before the first wave arrives."),
      crag("shout", "And those Tentacle Eaters. Every 8 seconds, one grabs a troop and drags it a tile closer. Tall troops won't move."),
      crag("talk", "Sea Witches stop short and throw curses. A cursed troop moves and attacks at half speed for 8 seconds."),
      crag("sly", "At every great assault, the dead climb out of those graves. So send Gertrude to the ones in your busiest lanes. She's hungry.")
    ],
    after: [
      crag("grin", "A Salamander! Any shot that flies through her catches fire: double damage, and half that again to the foes beside the target."),
      crag("sly", "And I found a Rafflesia among the stones. She stinks. Every foe within a tile of her takes 20 a second, in front, behind, and in the lanes beside.")
    ]
  },
  "w6-3": {
    before: [
      narrator("In the grey wastes of Deyja stands an old chapel of Order. Three Zealot Clerics have prayed here for forty years. Now the horde is coming."),
      crag("talk", "This time we guard them. Not one of those three Clerics can fall."),
      crag("talk", "Harpies can't carry the Clerics off. But they'll grab your most expensive other troop, so watch the sky."),
      crag("shout", "Medusas can turn your Clerics to stone from far away. Kill those snake-heads fast."),
      crag("talk", "And Hexing Sorceresses turn troops into sheep. A sheep still blocks the lane, but it can't heal or shoot."),
      crag("talk", "The fog comes later, so light your lanes. And the chapel has a little garden.")
    ],
    after: [
      crag("grin", "A Phoenix! It burns every foe right in front of it, 40 a second. And when it dies, it rises from the ashes once."),
      crag("talk", "And the Orb of Tempestuous Fire: all your fire damage goes up by 50%.")
    ]
  },
  "w6-4": {
    before: [
      narrator("Armoured horses come over the dark hill. Dread Knights, the deadliest riders Sandro has, ride down to take back the grave field."),
      crag("shout", "Dread Knights. They have 1100 armour, and every third strike is a Death Blow that does triple damage."),
      crag("talk", "They're riders, so Pikemen do double damage to them. Put pikes in your front row, and keep healers close behind."),
      crag("talk", "A moat crosses the field, with one bridge in the middle. The riders are slower in the water.")
    ],
    after: [
      crag("grin", "Here's a First Aid Tent. Every 2 seconds, it heals every troop in its lane for 40."),
      crag("sly", "The Iron Maiden is yours too. The first thing that bites her gets locked inside, for good."),
      crag("talk", "And the Blackshard of the Dead Knight: every blow does 50% more damage to shields and armour.")
    ]
  },
  "w6-5": {
    letter: "Keeper,\nMy Pit Lords are out harvesting. Every servant of mine who falls gets up again. And again.\nVery efficient. You should try it. Oh, wait. You can't.\nThe Barrow King will greet you himself. He hasn't had a visitor in centuries. He's very excited.\n\nWinning, as usual,\nSandro\n\nP.S. They said I'm too bony to harvest. Best day of my life. - M.",
    before: [
      narrator("The heart of the grave fields. Red-skinned Pit Lords, borrowed from Eeofol, swing their scythes and call the dead back to their feet."),
      crag("shout", "Those Pit Lords bring back the last fallen Chaos monster every 10 seconds. Again and again."),
      vidomina("smirk", "Sandro calls it a harvest. It's the only part of his grand plan that actually works."),
      vidomina("cold", "Demons stamping through my family's graves, however. That was never part of our deal."),
      crag("talk", "Kill the Pit Lord, and the harvest stops. Save your Surges and your biggest spells for him."),
      crag("shout", "And at the end, the Barrow King himself. He stops 3.5 tiles from the gate. His blood drain hits the five tiles in front of him, and heals him."),
      crag("talk", "Clear that strip when the red marks appear. When he's hurt, he turns to mist and moves to another lane. Hit him hard and fast.")
    ],
    after: [
      crag("grin", "Akagi, the Carrier! Every 6 seconds her planes bomb a random foe anywhere on the field. Flyers too."),
      crag("shout", "And Armageddon: 800 fire damage to every foe. But it also hits your OWN troops for 150. Read the small print before you cast it.")
    ]
  },
  "w7-1": {
    before: [
      narrator("The first path up the volcano. Lucifina, a demon lady in red silk, laughs and snaps her clawed fingers."),
      crag("talk", "Every 10 seconds, Lucifina calls Imp Runners into her lane and the two lanes beside it."),
      crag("talk", "Those imps jump right past your first troop, unless it's a tall one. So put Iron Golems in front, and kill her fast."),
      crag("talk", "Her imps will drop some of the horde over your wall, too. And there are old ruins on the road.")
    ],
    after: [
      crag("grin", "Here's a War Unicorn. Every troop in its 3x3, the unicorn too, takes 30% less damage."),
      crag("grin", "And Ayanami followed the demons through the gate. Every 5 seconds she dashes down her lane, cuts everything she passes, and comes straight back.")
    ]
  },
  "w7-2": {
    before: [
      narrator("Big red balls float over the lava pools. Each one has a single eye, and a mouth full of blue lightning."),
      crag("shout", "Cacodemons. Flying hell-balls with 1600 health. They spit lightning at whatever is under them."),
      crag("talk", "Bring shooters that hit flyers, Sylph winds, and direct spells. Ballistae and Sylphs earn their pay today."),
      crag("talk", "And the storm up here never stops. But there's a windmill, if you can keep it standing.")
    ],
    after: [
      crag("grin", "Look at this Ancient Behemoth. Every 7 seconds he leaps on the nearest foe and mauls it for 900."),
      crag("talk", "And a new spell: Slayer. 600 damage to one foe, or 2500 if it's a giant.")
    ]
  },
  "w7-3": {
    before: [
      narrator("Halfway up the mountain, the road runs through a gap in an old fortress wall. If the horde gets through here, the Meadows are wide open."),
      crag("talk", "A Last Stand at the gap. You get 4500 gold to build your line. Then blow the horn."),
      crag("talk", "Chaos Hydras bite their own lane and both lanes beside it, and they heal as they go. Hit them hard."),
      crag("sly", "You start with two Surge orbs ready. Don't take them to your grave."),
      crag("talk", "There's a shrine on the road, and a Cyclops stockpile in the middle. Break it open, and the Cyclops inside fights for us.")
    ],
    after: [
      crag("grin", "A Cannon! Its shells hit for 80 and burst, doing 60 to every foe within a tile, across three lanes."),
      crag("talk", "The Runemaster Yeti throws a hammer that comes back, stunning what it hits."),
      crag("talk", "And the Shield of the Dwarven Lords: your walls get 50% more health.")
    ]
  },
  "w7-4": {
    before: [
      narrator("Giants. Jotunn Warlords, taller than castle walls, march up the burning road. Imps sit on their shoulders, chattering."),
      crag("shout", "Jotunn Warlords crush any troop in ONE swing. And when you hurt them, they throw Imps deep behind your lines."),
      crag("talk", "Don't let them reach your wall. Freeze them with Ice Elementals, bury Sapper charges, and keep a Pikeman at the back for the thrown Imps."),
      crag("talk", "Brambles block four of the roads, and more foes will climb out of tunnels and drop from the sky. Busy day.")
    ],
    after: [
      crag("grin", "A Lightning Generator! Every 3.5 seconds it zaps the nearest foe in its lane, flyers too, and the lightning jumps to three more."),
      crag("grin", "And the Thunder Helmet: lightning hits 50% harder, and chain lightning jumps to one more foe.")
    ]
  },
  "w7-5": {
    before: [
      narrator("Near the top of the volcano, heavy machines clank. Half demon, half war engine, with a rocket launcher for an arm."),
      crag("talk", "I've fought almost everything with two legs or four. I've never fought one of THOSE."),
      crag("shout", "The Cyberdemon. He fires rockets from five tiles away, and they hurt every troop around the one he hits."),
      crag("talk", "Spells only do half damage to him. But a Sharpshooter always aims at the toughest foe in its lane, and that's him."),
      crag("talk", "Later, the smoke turns to fog. The Pillar of Fire lights three lanes. Light the rest yourself.")
    ],
    after: [
      crag("grin", "A Mighty Gorgon! Every 12 seconds, her death stare turns the nearest foe within 1.2 tiles to stone. Bosses just take 800 damage."),
      crag("sly", "And Forgetfulness, for your spellbook. For 10 seconds, every foe with a bow, a gun or a spell forgets how to use it. So it walks in to bite."),
      crag("talk", "The Hellgate is right up ahead. Sandro is waiting at the top.")
    ]
  },
  "w7-6": {
    letter: "KEEPER,\nEnough of this nonsense. I am coming myself, riding the finest thing I have ever raised: a Dracolich.\nYour keep, your crypt, your Nexus. Mine by sunset.\nDo wave. I'll wave back with a claw the size of a barn.\n\nYour doom, in person,\nSandro\n\nP.S. He practised the wave. For a whole hour. - M.",
    before: [
      narrator("The top of the volcano. The Hellgate burns behind a huge flying horror: a skeleton dragon, with Sandro sitting between its horns."),
      crag("shout", "The Dracolich, with Sandro riding it. It hangs at the far end of one lane, then glides across to another."),
      crag("talk", "Only your hero's spells, and attacks that can reach it, will hurt it. It moves, so put long-range shooters in every lane."),
      crag("talk", "Its breath burns 200 down the lane, and it calls up the dead and Cacodemons. You get three Surge orbs, and no more."),
      crag("talk", "Whatever happens up here... it's been an honour to hold the line with you, Keeper. Now let's knock him off that lizard.")
    ],
    after: [
      crag("shout", "CRAG! HACK! That dragon is DUST, and the Hellgate is shut!"),
      vidomina("smirk", "A claw the size of a barn, he promised. I might frame a few of the pieces. To remember his face."),
      crag("grin", "Look who got through before the gate closed: a Titan! He throws lightning for 200 at the nearest foe in his lane, however far."),
      crag("talk", "And an Archangel. Troops next to her act 25% faster, and every 40 seconds she brings back the last troop that fell nearby.")
    ]
  },
  "w8-1": {
    letter: "Keeper,\nYou broke my Dracolich and slammed my Hellgate shut. How very rude.\nNo matter. Gold still buys soldiers. I've bought half of Krewlod, and paid in advance. Unlike certain barbarians I could name.\n\nRichly,\nSandro\n\nP.S. He threw the inkpot at me after signing this. I'm all right. Mostly. - M.",
    before: [
      narrator("The first dusty canyon. A neat column of Erathian mercenaries marches toward you: shiny armour, good boots, terrible boss."),
      crag("grin", "Sellswords. Erathian soldiers, sold to Chaos. Shameful. Their armour takes the first 400 damage, and below 30% health they run away."),
      crag("sly", "Kill them before they run, and their pay drops on the grass: 25 gold each. Sea Dogs drop 15."),
      crag("talk", "Sea Dogs dodge every third straight shot. But lobs and spikes in the ground don't care about dodging."),
      crag("talk", "Two windmills, some clover and two chests out there, too. Get the chests before the Kobolds do.")
    ],
    after: [
      crag("grin", "A Santa Gremlin! He throws gifts at close range, and hands out 15 gold every 20 seconds."),
      crag("talk", "And a new spell, Lightning Bolt: 350 damage to one foe. Flyers too.")
    ]
  },
  "w8-2": {
    before: [
      narrator("Howls echo along the canyon. Goblins on red wolves pour down the hill under a banner Crag knows: a wolf's head on a broken axe."),
      crag("talk", "That's my old company's flag. They kept it. Of course they did. It's a good-looking flag."),
      crag("shout", "Wolf Raiders. Their wolves bite twice as often, and every bite slows your troop to half speed for 3 seconds."),
      crag("talk", "They're riders, so Pikemen do double damage to them. Put your pikes right in their way."),
      crag("talk", "And there's a Royal Griffin locked in a cage in the middle. Break it open, and it fights for us."),
      crag("grin", "Their pack leader still owes me a pony. Tell him Crag says hello. With a spear.")
    ],
    after: [
      crag("grin", "Here's a Royal Griffin: 2400 health of feathers and claws. Anything that bites it, or bites a troop right next to it, gets clawed for 40. Every time."),
      crag("grin", "And Rin, with more cats than sense. Every 12 seconds, one of her cats runs down her lane to fight whatever is coming.")
    ]
  },
  "w8-3": {
    before: [
      narrator("That night by the campfire, Crag finally talks about his past."),
      crag("talk", "I led that warband for twelve years. We fought for whoever was in the right. Mostly. Then one bad winter, the lads voted to fight for whoever paid."),
      crag("talk", "So I packed up and left. I found an old keep with a good well, and parked my wagon. Nice and quiet. Until you came along."),
      narrator("By morning, an Erathian supply wagon rattles up the road, and Crag is back to business."),
      crag("talk", "A caravan run. The belt brings Pikemen, Griffins, Crusaders and more."),
      crag("talk", "Nomad Outriders ride round your first troop into a free lane next to it. So cover the side lanes too."),
      crag("grin", "I rode with Nomads when I was young. They never take the straight road home either.")
    ],
    after: [
      crag("grin", "A Centaur Captain! His lances go through two foes at once. And if a foe gets close, he gallops back a tile."),
      crag("sly", "And the Endless Purse of Gold: coins fall from the sky 40% more often. Now that's real magic.")
    ]
  },
  "w8-4": {
    before: [
      narrator("A blinding dust storm blows down the canyon. Rogues creep through the dust, and Bounty Hunters load their rifles."),
      crag("talk", "Rogues stay hidden until they're 5 tiles from your gate, or until they strike, or get caught in a blast. Every hit steals 15 of your gold."),
      crag("shout", "And Bounty Hunters stop 4 tiles away and shoot your most expensive troop in range."),
      crag("sly", "I know how sneaky thieves think. A good Meteor Shower finds them, hidden or not."),
      crag("talk", "The sandstorm blows all battle long. And watch the chests. Rogues grab them on the way past.")
    ],
    after: [
      crag("grin", "Here's a Mage. Magic bolts, and every hit sends a quarter of a mana point to your hero."),
      crag("talk", "And a new spell, Ice Bolt: 250 damage, and the target freezes solid for 4 seconds."),
      crag("grin", "The Softball Ace hits a ball down her lane. It bounces from foe to foe, four in a row.")
    ]
  },
  "w8-5": {
    letter: "Keeper,\nThe hounds of the deep pit have three heads. That lets them be rude three times as fast.\nDo tell that barbarian that his old warband says hello. They were very cheap.\n\nWith receipts,\nSandro",
    before: [
      narrator("Before sunrise, someone taps three times on Crag's wagon. It's Mortimer, holding a tiny bag of belongings."),
      mortimer("nervous", "Good morning. I've delivered Master Sandro's letter. But... I quit. He never says thank you. You do. May I sit by your fire?"),
      crag("grin", "Pull up a stool, bones. You can keep my accounts now. Nobody else is brave enough to open the book."),
      narrator("Three-headed hounds pour out of the canyon. Behind them ride the last of Crag's old mercenaries."),
      crag("shout", "Cerberi! Every bite hits your front troop and the troop right behind it."),
      crag("talk", "So make your second row tough, and keep a First Aid Tent in the lane. Pikes still work on the riders."),
      crag("talk", "There's a Naga Queen locked in a cage out there, too. Free her, and she fights for us."),
      crag("shout", "And last comes Old Gnawbone, the oldest behemoth in the Badlands. It stops 3.5 tiles out, then jumps over your wall onto the troop farthest back."),
      crag("sly", "Cheap, were they? I'll show my old warband what a barbarian refund looks like.")
    ],
    after: [
      crag("grin", "Dace, Minotaur Warlord of Nighon, joins Order! With him, Valor crowns fill 50% faster. His Labyrinth Frenzy makes close-up fighters hit twice as hard."),
      crag("sly", "And the Ambassador's Sash: all your seed packets cost 15% less gold. That's real diplomacy.")
    ]
  },
  "w9-1": {
    letter: "Keeper,\nA small problem. While hiring some mages from other worlds, I seem to have made a hole in the sky.\nThe horrors coming through aren't mine. Please destroy them for me.\n\nNot worried at all,\nSandro\n\nP.S. Mortimer, if you're reading this: come home. The new courier is a bat. It bites. - S.",
    before: [
      mortimer("nervous", "...I am NOT going back."),
      narrator("Ghostly shapes float out of the glowing Rift: Wraiths and Mummies from strange worlds. They obey no one."),
      crag("talk", "Wraiths heal themselves, and every hit drains 2 of your hero's mana."),
      crag("talk", "Mummies curse whatever they touch: it moves and attacks at half speed for 8 seconds."),
      crag("grin", "Good news: they're both undead. So Zealot Clerics hit them for double."),
      crag("talk", "It's night and foggy again, and there are two crypts on the road. Light your lanes, and send the pig.")
    ],
    after: [
      crag("grin", "Meet the Dendroid Soldier: a rooted wall with 4000 health. Foes right in front of him move and strike at half speed."),
      crag("talk", "And a new spell, Blind. One foe, not a boss, stands helpless for 8 seconds."),
      crag("talk", "The Temple Guardian throws a spirit blade that cuts every foe in her lane, out and back again.")
    ]
  },
  "w9-2": {
    before: [
      narrator("The Rift flashes purple. Red-skinned Arch Devils step out of thin air, vanish, and step out again somewhere worse."),
      crag("shout", "Arch Devils disappear at the edge of the lawn and appear right behind your troops."),
      crag("talk", "So keep something tough at the back. A Pikeman stabs behind him just as hard as in front."),
      crag("talk", "And Magogs throw fireballs over your walls. Take them out fast."),
      crag("talk", "More foes will come up through tunnels and drop from the sky. And there are ruins on the road again.")
    ],
    after: [
      crag("grin", "Here's Azusa, the Trapper. Every 30 seconds she buries an 1800-damage Land Mine up to 3 tiles ahead. Two at a time."),
      crag("talk", "And the Spirit of Oppression: it shuts down all Chaos auras, even the Ogre Shamans' drums.")
    ]
  },
  "w9-3": {
    before: [
      narrator("The Rift hangs right over a broken watchtower. Above it, the sky is torn into empty darkness. No gold will fall here."),
      crag("talk", "Another Last Stand. You get 4000 gold to dig in. Pain Elementals float over your line, and when they die, they burst into three Lost Souls."),
      crag("talk", "Those Lost Souls jump right over your first troop. So keep a second line ready to catch them."),
      crag("talk", "Power Liches throw death clouds over a 3x3 area. Dwarves only take half damage from them."),
      crag("sly", "You start with two Surge orbs ready. And the outer roads are flooded, so bring Rafts.")
    ],
    after: [
      crag("grin", "Luna, the Fire Elementalist! With her, your spells recharge 40% faster, and her Inferno sweeps three lanes with walls of fire."),
      crag("talk", "And a Silver Pegasus. It strikes foes on the ground in front of it, and flyers passing overhead too.")
    ]
  },
  "w9-4": {
    before: [
      narrator("Strangers pour out of the Rift: a sniper in a fox mask, fat demons with flame cannons, and spinning crystals."),
      crag("talk", "Wakamo stays hidden until she fires. She shoots the nearest troop for 150. Once she's fired, you can see her. Hit back."),
      crag("shout", "Mancubi burn anything within 3 tiles. Kill them before they waddle in close."),
      crag("talk", "Prism Elementals spin now and then. A straight shot that hits a spinning crystal bounces back at your line. Lob, zap, or wait."),
      crag("talk", "We're on a broken roof again. Crates first, and the ridge is in the fifth column.")
    ],
    after: [
      crag("grin", "Laffey, the Destroyer! Her torpedoes run under shields and through the first three foes in her lane."),
      crag("talk", "And a new spell, Implosion: 1500 damage to one foe, right through armour. Save it for the big ones.")
    ]
  },
  "w9-5": {
    letter: "Keeper,\nA Black Dragon flew out of the Rift. It ignores spells. It ignores me completely. I'm trying not to be hurt.\nIt's coming your way. If you dealt with it, I would be... don't repeat this... grateful.\n\nYours, for now,\nSandro",
    before: [
      narrator("The Rift opens as wide as it can. A huge shape with black scales pushes its leathery wings through the gap."),
      vidomina("cold", "Listen, Keeper. If that beast reaches your crypt, it will drain the Nexus dry. And every dead thing in Deyja will die with it."),
      vidomina("cold", "So today, I want you to win. Don't thank me. I'm protecting my own land."),
      crag("talk", "Noted. Mind the step on your way out."),
      crag("shout", "The Black Dragon! It flies, ignores all spells, and it's far too heavy for any Sylph wind to move."),
      crag("talk", "Ballistae, Sharpshooters, Titans, Aris, Akagi's bombers, Pegasi and Lightning Generators can hit it. Bring them all."),
      crag("talk", "It comes with the great assaults, so keep your Surge orbs until it flies in."),
      crag("shout", "And at the very end, the Spider Mastermind. A brain on a chaingun. It stops 3.5 tiles out and sweeps the six tiles in front of it."),
      crag("talk", "It rains plasma on your five most expensive troops too, and spells only do 60% to it. Move off the red marks, and trust your bows.")
    ],
    after: [
      crag("grin", "Meet Belfast, the Royal Maid. She fires deck guns, and every 4 seconds she serves the most hurt troop near her a 120 HP tea break."),
      crag("talk", "And a new spell, Cure: every troop is cured of poison, curses, webs and stuns, and heals 150.")
    ]
  },
  "w10-1": {
    letter: "Dear Keeper,\nYou are invited to my grand masked ball.\nDress: masks. Music: lovely screaming. Guests: everyone who hates you.\nNo need to reply. We're coming to you.\n\nYour host,\nSandro",
    before: [
      narrator("The carnival gates swing open. Masked figures glide forward and pass through the fence as if it were mist."),
      crag("talk", "Phantoms. They float right through your troops. While they're doing it, only blasts and your hero's spells can hurt them."),
      crag("talk", "After that, they need 8 seconds before they can do it again. So keep a second line behind the first to cut them down."),
      crag("talk", "There's clover and a windmill to help with the gold. And watch for Kamuro. She stops far out and throws knives at your first troop.")
    ],
    after: [
      crag("grin", "The Grand Elf Rearguard shoots down his lane, and turns round to shoot anything that slipped past behind him."),
      crag("talk", "And Counterstrike, for your spellbook: for 12 seconds, every troop hits back at whatever bites it.")
    ]
  },
  "w10-2": {
    before: [
      narrator("Cold mist rolls over the dance lawn. A wild howl cuts through the violins, and the mist starts to move sideways."),
      crag("talk", "Werewolf Stalkers. Every couple of tiles, they jump into the next lane. They never stay in one place."),
      crag("talk", "So cover the side lanes early. Troops that hit three lanes are great here: Halflings, Cannons and Master Genies."),
      crag("talk", "Fog again, and brambles in the mist. The Pillar of Fire lights the middle three lanes. And keep a Brew ready for the Nightmares.")
    ],
    after: [
      crag("grin", "A Nymph of the Mists! Anything that bites her gets confused, wanders off into the next lane, and walks slower for a while."),
      crag("sly", "She only costs 50 gold. Cheap and confusing. My kind of soldier.")
    ]
  },
  "w10-3": {
    before: [
      narrator("In the middle of the garden, the Revel Queen spins. Wherever she stops, masked dancers form a ring around her."),
      crag("talk", "The Revel Queen stops and calls four Revellers around her: above, below, in front and behind."),
      crag("talk", "Every 15 seconds, she calls back any dancer you killed. So break the ring with splash damage, then hit the Queen."),
      crag("sly", "She has good footwork, I'll give her that. I'm still going to hit her with an axe."),
      crag("talk", "Their confetti cannons will shoot some of the horde over your wall. And there are two chests on the lawn: the carnival's prizes.")
    ],
    after: [
      crag("grin", "The Mechanic's Lodestone! Every 10 seconds, it rips the helmet, armour or shield off the nearest armoured foe within 4.5 tiles.")
    ]
  },
  "w10-4": {
    before: [
      narrator("The music stops. The dancers step aside, and huge iron Battering Rams and heavy Juggernauts roll out of the shadows."),
      crag("talk", "Another Last Stand, with 4500 gold. Battering Rams knock your front troop a tile back and stun it."),
      crag("shout", "Juggernauts roll over everything for 800 damage each. A tall troop stops them dead, Gnome spikes pop them, and mines blow them apart."),
      crag("talk", "Frost Mammoths and a Cyberbrute are coming too. And a moat crosses the lawn, with two bridges."),
      crag("sly", "You've got two Surge orbs ready. The Rams are rude. The Juggernauts are just terrible.")
    ],
    after: [
      crag("grin", "A Dwarven Axe-Thrower! His axes cut three foes on the way out, then spin back and hit again. The return hits shields from behind.")
    ]
  },
  "w10-5": {
    letter: "Keeper,\nMy last masked ball. My arch-viles raise the fallen where they fall, so our dance never has to end.\nWhen the music stops, your keep is mine. The crypt and the Nexus too.\nSave the last dance for me.\n\nForever (literally),\nSandro",
    before: [
      narrator("Midnight. On a stage of white bone in the middle of the carnival, Sandro raises his staff. The arch-viles begin to chant."),
      crag("shout", "This is Sandro's big finale. Those arch-viles bring the fallen back to life, right where they drop."),
      crag("talk", "Stun them, freeze them, blow them back, or kill them first. Any of those breaks their spell."),
      crag("shout", "And at the end comes the Masked Sphinx, queen of the carnival. She jumps from lane to lane, and her riddle stuns every troop within 3 tiles."),
      mortimer("cheer", "I polished your wagon wheels, Mr. Hack. It's the only useful thing I know how to do before a fight."),
      crag("talk", "Use everything you've learned since day one. You can do this, Keeper. And there's a fresh pot of stew waiting.")
    ],
    after: [
      crag("shout", "CRAG! HACK! The masks are smashed, and this carnival is OVER!"),
      crag("grin", "Look who joined Order: a Sea Serpent that swallows foes whole, and Cupi. Whoever bites Cupi falls in love and fights for us.")
    ]
  },
  r1: {
    before: [
      narrator("A dozen shamblers wander up to Crag's wagon with empty pockets. Sandro forgot to pay them, so they've come for the stew."),
      crag("grin", "Meet the Turncoats. Chaos won't pay them, so my stew pot will. And the Queen has a special job for them."),
      crag("talk", "Captain Ronald at the Meadow outpost says nobody can break his fence. The Queen wants it tested before Sandro tries."),
      crag("talk", "So this time, YOU send the horde. Spend Might to send Chaos troops down the lanes. To win, break through at the end of every lane."),
      crag("talk", "Each Peasant you knock down gives you 75 Might. You also get Earthquake, War Cry and Resurrection, a few casts of each."),
      crag("sly", "Don't hold back. They're using padded practice gear. Better we find the holes than Sandro does.")
    ],
    after: [
      crag("grin", "Ronald's fence had a big gap behind the chicken coop. Better we found it than Sandro."),
      crag("talk", "The Captain is writing a repair order right now. And the Turncoats want second helpings.")
    ]
  },
  r2: {
    before: [
      narrator("High in Vori, Commander Varik stands on his walls and shouts that nobody has ever taken his frozen fort."),
      crag("grin", "Varik says ice never cracks. The Queen wants us to knock on his door. Just to check."),
      crag("talk", "His soldiers brought Sylphs to blow your flyers away, and Iron Golems to stop your Satyrs."),
      crag("sly", "So pick your lanes carefully. Send the right monster at the right wall, and you're through.")
    ],
    after: [
      crag("grin", "Varik's face when we found the lane he forgot! It was worth the whole trip up the mountain."),
      crag("talk", "His wall had a weak spot under the ice. He's chipping frost and grumbling, but the fort is getting fixed.")
    ]
  },
  r3: {
    before: [
      narrator("Deep in Tatalia, Warden Krell wades out to boast that nobody has ever taken a single plank of Mire Watch."),
      crag("sly", "Krell says nobody can attack a fort built in deep mud. Let's show him what swamp zombies can do."),
      crag("talk", "He has Gnome spikes in the ground, Undines that wrap his troops in water, and a Sharpshooter waiting in the fog."),
      crag("talk", "But your Necromancers raise graves, and graves catch his shots. Build your own cover, then push.")
    ],
    after: [
      crag("grin", "Told you graves make good cover, even in mud. Krell is pulling spikes out of his own boots."),
      crag("talk", "We proved his swamp gate was rotting from below. The Queen will be pleased, even if Krell isn't.")
    ]
  },
  r4: {
    before: [
      narrator("At the Arcane Walls of Bracada, Arch-Mage Phelan tells everyone that a clever mind beats any siege."),
      crag("talk", "Phelan sent the Queen a three-page essay proving his towers can't fall. Time for a practical test."),
      crag("talk", "His Genies slow you down, his Arch Mages throw chain lightning, and his Clerics heal the line."),
      crag("sly", "Look for the weak lane. Wizards love their books, so they always forget something down on the ground.")
    ],
    after: [
      crag("grin", "Down go the wizards! A book full of magic theory doesn't stop a charging line of Turncoats."),
      crag("talk", "Phelan is rewriting his essay. Now it explains why losing was a very important lesson.")
    ]
  },
  r5: {
    before: [
      narrator("Down in the Nighon tunnels, Overseer Bax swears that nothing can get past his row of big guns."),
      crag("talk", "Bax says no army can cross his killing ground. The Queen told us to prove him wrong."),
      crag("talk", "His Ballistae shoot through whole lanes, and Aris charges her beam cannon. Don't just walk into their fire."),
      crag("grin", "Go under them instead. Sandworms come up behind their whole line, where nobody is looking.")
    ],
    after: [
      crag("grin", "Huge guns, and nobody guarding the back. A classic mistake."),
      crag("talk", "Bax is already writing a bill for three broken gun mounts. But that tunnel won't surprise the Queen again.")
    ]
  },
  r6: {
    before: [
      narrator("General Sterling stands in front of the Last Citadel and calls it the finest fort in all of Erathia."),
      crag("talk", "Sterling told the Queen his citadel could survive the end of the world. Let's test that today."),
      crag("shout", "Phoenixes, Unicorns guarding the troops around them, and a First Aid Tent in every lane."),
      crag("sly", "But today you get the whole Chaos army: Pit Lords, Hydras, even the Cyberdemon. Go on. Be truly awful.")
    ],
    after: [
      crag("grin", "The great citadel is cracked wide open! Even Sandro would call that beautiful."),
      crag("talk", "Sterling is standing there with his helmet on crooked, mumbling about a new plan.")
    ]
  },
  r7: {
    before: [
      narrator("At Fort Ironfang, Paymaster Vane boasts that trained, well-paid soldiers always beat a messy crowd."),
      crag("grin", "Payday! We paid our Turncoats their stew on time, and they're ready to prove him wrong."),
      crag("talk", "His Griffins strike back at whatever bites them, and his Centaurs' lances go through two at a time."),
      crag("talk", "But your Nomads ride round the first wall they meet, and your Rogues sneak in unseen."),
      crag("sly", "Show them what hired soldiers can do when they fight for someone they like.")
    ],
    after: [
      crag("sly", "Paid on time, with good hot stew, and they fought like devils. Funny how that works."),
      crag("talk", "Vane can't believe it. He's checking his payroll again, and our lads are asking for dessert.")
    ]
  },
  r8: {
    before: [
      narrator("Outside the closed Rift, High Commander Alistair says his border fort can stop any nightmare."),
      crag("talk", "Alistair says nobody can break his wall. Time to throw the strangest monsters we have right at it."),
      crag("talk", "He has Azure Dragons, Gold Golems, and mines buried in the lanes. A real fortress."),
      crag("sly", "But your Arch Devils appear right behind his line, and your Black Dragon laughs at Sylph winds. Use that.")
    ],
    after: [
      crag("grin", "Every lane broken! You held Brookhold against Chaos, and now you've cracked every fort in the realm."),
      crag("talk", "Alistair is signing orders to make his fort stronger. You know both sides of the wall now.")
    ]
  },
  "oc-endless": {
    before: [
      narrator("Late at night, boots shuffle down the road. Some stragglers never heard that the war moved on, and they keep coming to the gate."),
      crag("grin", "The night shift is here! Every kind of monster you've ever beaten still stumbles up to our walls, wave after wave."),
      crag("talk", "After every great assault, pick one of three artifacts. They add up through the night. But so does the horde."),
      crag("sly", "New survival records earn you Seals. How long can you hold the gate before morning?")
    ]
  },
  "oc-daily": {
    before: [
      narrator("Every morning a royal courier rides up the border road. He leaves a sealed packet at each keep and rides off before anyone can ask questions."),
      crag("talk", "Today's orders from the Queen's armoury. Every keep on the border gets the same packet: same road, same lent troops, same trouble."),
      crag("grin", "You don't pick the troops. The armoury does. So nobody can blame their gear. I love it."),
      crag("talk", "Your Barracks training stays at home. The lent troops are new recruits, the same as everyone else's."),
      crag("talk", "After that, it runs like the night shift. The waves don't stop, and after every great assault you pick one of three artifacts."),
      crag("sly", "New orders come every day. Your best run goes on my tally board, next to every other Keeper's. They check it. Often.")
    ]
  }
};

/** After the final level is cleared. */
export const OC_EPILOGUE: OcSceneLine[] = [
  narrator("Three days later, the wagon rolls home to Brookhold. Morning light on the Meadows. The carnival is gone, and the keep's old gate is still shut."),
  crag("talk", "Listen to that. No drums, no moaning, no masks. Just quiet."),
  narrator("By the ditch, Sandro sits in the dust, holding a cracked carnival mask."),
  sandro("rage", "Impossible. A Dracolich, a Hellgate, a whole ritual... all ruined by a new Keeper and a barbarian with a soup pot!"),
  catherine("regal", "Ruined by people who would not give up. Erathia is safe again, Keeper. Thank you, with all my heart."),
  catherine("regal", "And Crag Hack: your royal contract, signed and sealed. Paid in full. On time."),
  crag("grin", "On time. Did you hear that, Sandro? THAT is why I fight for Order."),
  sandro("sneer", "Enjoy your little coins. I'll go home to Deyja, raise a new horde, and..."),
  vidomina("smirk", "You're not going home to Deyja, old master. I changed the locks on the graves this morning."),
  vidomina("cold", "Deyja is mine now. Sleep lightly, Keeper. When I come for your crypt, I won't send letters first."),
  sandro("rage", "Traitor! Mortimer, bring my carriage this minute."),
  mortimer("cheer", "I work for Mr. Hack now, sir! I keep the accounts. And the soup spoons."),
  narrator("That evening, Mortimer walks down the Meadows road alone. He stops outside a cottage with golden barley and a red door."),
  mortimer("nervous", "I still can't remember who lived here with me. But there's a family inside, and they're safe. I think they'd be happy about that."),
  crag("talk", "The crypt stays shut, the Nexus is quiet, and the roads are yours again, Keeper."),
  crag("grin", "Supper's ready. Turncoats, mercenaries and couriers eat free tonight. And if peace gets boring, the night shift at the Endless Siege never stops."),
  crag("shout", "CRAG! HACK! Sorry. Old habit.")
];

/** Battle quips: the UI picks one unlocked line per event. */
export const OC_BATTLE_QUIPS: Record<OcQuipEvent, OcGatedLine[]> = {
  start: [
    crag("shout", "Here they come! Gold-makers first."),
    crag("talk", "The first wave is on the road. Place your gold-makers, then your fighters."),
    crag("grin", "Ah, the smell of battle. And stew. Mostly stew."),
    crag("sly", "See the coins on the grass? Click them. Free gold is the best gold."),
    gated("w8-5", mortimer("nervous", "They're coming! I'll be behind the wall. Well, under it."))
  ],
  orb: [
    crag("shout", "A Surge orb! Grab it, press G, then click a troop."),
    crag("talk", "That glowing foe dropped a Surge orb. Pick it up, then press G."),
    crag("sly", "A Surge orb on the grass! Every troop has its own Surge. Try one.")
  ],
  "huge-wave": [
    crag("shout", "Big flag means big trouble. A HUGE wave is coming!"),
    crag("shout", "Great assault. Everything they've got, all at once!"),
    crag("talk", "Here comes the big push. Now's the time for Surges and big spells."),
    sandro("sneer", "March, my darlings. Trample their precious lawn.")
  ],
  "final-wave": [
    crag("shout", "FINAL WAVE! Hold this line and we're done."),
    crag("talk", "Last wave. Spend every coin. Gold is no use to you in a grave."),
    crag("grin", "Final wave! Hold them off, and the stew is on me.")
  ],
  crown: [
    crag("shout", "The Valor crown is full! Press U and pick a trained troop to Ascend."),
    crag("talk", "Crown's ready. Press U: 15 seconds, healed, and 30% tougher and stronger."),
    crag("grin", "The crown is glowing! Make someone a legend for 15 seconds. Press U.")
  ],
  charger: [
    crag("shout", "The gate Champion rode out! That lane has no second chance now."),
    crag("shout", "That lane's Champion is spent! Block the gap before they push through."),
    crag("talk", "That was our last guard in that lane. If anything gets past, we lose.")
  ],
  boss: [
    crag("shout", "Big boss coming! Save your Surges for this one."),
    crag("talk", "That's their leader. Hit it with everything you have: spells and Surges."),
    crag("grin", "Now that's a big ugly brute. The bigger they are, the harder they fall."),
    sandro("sneer", "Do say hello to my champion, Keeper. It's simply dying to meet you."),
    gated("w3-5", vidomina("cold", "Sandro's favourite pet. Loud, slow and expensive. Just like him."))
  ],
  victory: [
    crag("shout", "We held the line. We HELD!"),
    crag("grin", "Not one of them got through. Well, not enough to matter."),
    crag("sly", "We won! Now, about my barbarian fee... I'm joking. Mostly."),
    crag("grin", "Great work. The first bowl of stew is yours."),
    gated("w8-5", mortimer("cheer", "We won! And nobody lost a single rib. Well, I didn't."))
  ],
  defeat: [
    crag("talk", "Knocked down? Get back up. Next time, plant more gold-makers early."),
    crag("talk", "They broke through. Check the Almanac to see what beat you, and bring the answer."),
    crag("grin", "Every soldier loses sometimes. Train in the Barracks and try again."),
    crag("talk", "Try a different hero, or swap a seed packet. Every enemy has a weakness."),
    crag("talk", "Don't keep your Surges forever. Use one when the great assault hits."),
    gated("w8-5", mortimer("nervous", "Don't feel bad. Sandro loses all the time. He just writes rude letters about it."))
  ]
};

/** A greeting at the top of a menu screen: one unlocked line, picked at random. */
export const OC_SCREEN_LINES: Record<"home" | "camp" | "barracks" | "almanac" | "tally" | "daily", OcGatedLine[]> = {
  home: [
    crag("grin", "Brookhold still stands, and the stew's hot. Ready for another round?"),
    crag("talk", "Chaos never takes a day off. Neither do our archers. Well, they take short naps."),
    catherine("regal", "Erathia sleeps better knowing you hold that gate, Keeper."),
    sandro("sneer", "I've drawn up seventeen new plans to invade. Do take your time."),
    gated("w3-5", vidomina("cold", "Still alive? Good. I like to know exactly where my problems are.")),
    gated("w8-5", mortimer("cheer", "All quiet on the road today! I checked twice, just to be sure."))
  ],
  camp: [
    crag("grin", "Welcome to the camp! Minotaurs and Beholders from Nighon, sworn to Order."),
    crag("sly", "Only Seals here. Gold is for the battlefield. Seals are for contracts."),
    crag("talk", "Hire a mercenary once, and they join your seed packets for good. Like family, only louder."),
    crag("grin", "Grab a bowl and look around. Nobody bites. Well, except the Minotaurs. Sometimes."),
    gated("w8-5", mortimer("cheer", "I keep the camp's books now! Mr. Hack's handwriting is... very brave.")),
    gated("w8-5", mortimer("nervous", "The Minotaurs are lovely, once they see I'm not a soup bone.")),
    gated("w3-1", crag("sly", "New faces at the Camp: a Nix shield-basher from the Cove, and a dwarf thane with a spinning axe. And a war mammoth, if you have the Seals."))
  ],
  barracks: [
    crag("talk", "Spend your Seals here. Every training level gives a troop 15% more health and power."),
    crag("grin", "Tougher soldiers hold lanes longer. Simple barbarian logic."),
    crag("shout", "Put those Seals to work! Seals in a drawer never stopped a shambler."),
    gated("w2-5", crag("sly", "Train a troop to level 3, and the Altar lets it Ascend in battle. Press U when the crown is full."))
  ],
  almanac: [
    crag("talk", "The Almanac! Every friend and foe we've met, all written down in one book."),
    crag("sly", "Stuck on a hard wave? Look up what beat you. Every foe has a weakness."),
    crag("grin", "Learn what they do before they reach your lawn. It saves a lot of broken walls."),
    sandro("sneer", "A complete record of my glorious horde. Do admire the pictures."),
    gated("w1-5", mortimer("nervous", "Is my cousin in here? He'd be so happy to be in a book.")),
    gated("w3-5", vidomina("cold", "Study, Keeper. Knowledge is the one weapon that never runs out."))
  ],
  // The tally board nailed to Crag's wagon: the online boards.
  tally: [
    crag("talk", "The tally board. The furthest wave goes on top. If two Keepers reach the same wave, the one who killed more foes goes higher."),
    crag("grin", "I nailed it to the side of the wagon. Keepers from all along the border come to look at it."),
    crag("sly", "Only your best run stays on each board. Bad nights get wiped off with my sleeve."),
    crag("talk", "Raids are timed. Break every lane faster than the other Keepers, and your Turncoats go to the top."),
    sandro("sneer", "A chalk board on a wagon. I keep my records in leather books, but do carry on."),
    gated("w3-5", vidomina("cold", "Ranks, scores, little chalk marks. You people will compete over anything.")),
    gated("w8-5", mortimer("nervous", "I keep the chalk tidy now. Nobody rubs out anyone else's name. I check twice. Sometimes three times."))
  ],
  // The Daily Siege orders.
  daily: [
    crag("talk", "The orders are in. Look closely at the troops you're lent before you ride out. You can't swap them."),
    crag("grin", "Same road for everybody today. Let's see whose name ends up on top of the board."),
    crag("sly", "Play today's orders as often as you like. Only your best run of the day counts."),
    gated("w8-5", mortimer("cheer", "The courier left the packet with me. I only had a little look. Well, a big look. Sorry."))
  ]
};

/** Said after an Endless Siege run: `best` for a new record, `short` otherwise. */
export const OC_ENDLESS_LINES: { best: OcGatedLine[]; short: OcGatedLine[] } = {
  best: [
    crag("grin", "New record! The night shift broke on our walls like waves on a rock."),
    crag("shout", "What a fight! Sandro will need a new book just to count his losses."),
    crag("sly", "A new personal best! You can brag about that all across Krewlod."),
    gated("w8-5", mortimer("cheer", "I lost count after a while, but it was huge. That's a record, for sure!"))
  ],
  short: [
    crag("talk", "No record tonight. Swap your artifacts around and try the night shift again."),
    crag("grin", "Good fight anyway. Those stragglers got a bloody nose before the gate gave way."),
    crag("sly", "The night shift never sleeps. There'll be more stragglers when you're ready."),
    gated("w8-5", mortimer("nervous", "That was very loud. But look, the gate is still on its hinges!"))
  ]
};

/**
 * Tally-board moments: `best` a new personal best on a board, `short` a Daily
 * Siege run that didn't beat it, `top10` / `first` the run's place on the
 * online board (today's or all-time).
 */
export const OC_SCORE_LINES: { best: OcGatedLine[]; short: OcGatedLine[]; top10: OcGatedLine[]; first: OcGatedLine[] } = {
  best: [
    crag("grin", "That's a new best for you. I'll get some fresh chalk."),
    crag("talk", "Better than last time. Rub out the old mark and put this one up."),
    gated("w8-5", mortimer("cheer", "A new best! I'll write it extra neatly."))
  ],
  short: [
    crag("talk", "Not your best today. But the orders don't change until tomorrow. Have another go."),
    crag("grin", "Good fight. Same road, same troops, and now you know what went wrong."),
    crag("sly", "The other Keepers got the same orders as you. Somebody's using them better. Let's fix that.")
  ],
  top10: [
    crag("shout", "Top ten on the tally board! The other keeps will hear about this."),
    crag("grin", "Top ten. Half the border will be reading your name tonight."),
    gated("w3-5", vidomina("smirk", "Top ten. Don't let it go to your head, Keeper. Heads are where I aim."))
  ],
  first: [
    crag("shout", "Top of the whole board! Every other Keeper is looking up at your name now."),
    sandro("rage", "First place? On a chalk board? I refuse to be impressed. Fine. A little impressed."),
    gated("w8-5", mortimer("cheer", "Number one! I'll write it extra big. And then check it twice."))
  ]
};
