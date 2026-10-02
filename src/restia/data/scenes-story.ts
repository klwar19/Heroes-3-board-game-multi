import type { SceneDef, SceneLine } from "../engine/types";

/**
 * Main-story scenes (the Cosmic Jester story, Haven arc 1).
 * Speakers on stage are listed in `show` (tachie art); `face` sets Bin's
 * expression until the next Bin line; "system" lines are Jess, the Cosmic
 * Jester System's interface. A new game plays the prologue chain queued in
 * engine/state.ts; later scenes start from quests, triggers and battles.
 */

/** Garr joins and chapter 1 closes (every way the dinner can end). */
const DINNER_END: SceneLine[] = [
  { who: "narrator", text: "The note inside is short, in a clean hand: 'For the apothecary. The cough drops you asked about will arrive next market day, paid for in full. — The Buyer.'" },
  { who: "mitia", show: ["mitia", "garr", "bowy"], text: "I... never asked anyone for cough drops." },
  { who: "bin", face: "sad", text: "Somebody's sick. Somebody who can't ask for help out loud. And they want us to know they know where we live." },
  { who: "garr", show: ["garr", "bowy", "mitia"], text: "Then here's how it goes. I'm done pulling two shifts at the gate. From tomorrow I pull one: yours. Wherever you walk, I walk." },
  { who: "bowy", text: "I was already coming. For the record." },
  { effects: [{ kind: "recruit", id: "garr" }, { kind: "points", npc: "garr", n: 60 }, { kind: "flag", key: "dinnerDone", value: true }, { kind: "flag", key: "chapter1Done", value: true }] },
  { who: "narrator", text: "The third plate has been on this table for two months. Tonight someone finally eats from it." },
  { who: "peri", show: ["peri"], text: "Filed. Tagged. Suspicious in a low-grade and entirely promising way. The Buyer is now a known unknown. Great episode, Jester. Great ratings." },
  { who: "system", show: ["system"], text: "[CJS] Chapter 1 complete: 'Snow on the Road Home'. Garr joined the party. Next: Tessa's Rank E field test, and whatever is waiting in the Old Temple Ruins." }
];

export const STORY_SCENES: SceneDef[] = [
  // =========================================================================
  // Haven, Chapter 1: Snow on the Road Home
  // =========================================================================
  {
    id: "h1Road",
    bg: "havenRoad",
    music: "snow",
    once: true,
    outfit: "earth",
    lines: [
      { who: "narrator", bg: "havenRoad", text: "The portal spits me face-first into knee-deep snow." },
      { who: "narrator", text: "The rift snaps shut behind me with the dignified silence of a landlord pretending the deposit never existed." },
      { who: "narrator", text: "Slush pours straight through the mesh of my sneakers." },
      { who: "narrator", text: "My delivery windbreaker has the warmth rating of a sandwich bag." },
      { who: "bin", show: ["bin"], face: "sad", text: "Ptuh! Cold. Cold cold cold." },
      { who: "narrator", text: "I spit a mouthful of grey powder out of my teeth." },
      { who: "narrator", text: "It isn't just cold. It's the kind of deep, biting mountain frost that gets straight inside your jaw and aches in your molars." },
      { who: "bin", text: "I am wearing a cotton hoodie under a windbreaker. I am going to freeze into a convenience-store popsicle in four minutes." },
      { who: "narrator", text: "I push myself upright, shivering so hard my knees click." },
      { who: "narrator", text: "Massive, ancient pines tower overhead, their black branches bent double under thick blankets of snow." },
      { who: "narrator", text: "Ten paces ahead, half-buried in a drift, stands a scorched oak post." },
      { who: "narrator", text: "A charred triangle carved into the grain, pointing southwest." },
      { who: "narrator", text: "The burned mile-marker." },
      { who: "bin", face: "surprised", text: "........." },
      { who: "bin", text: "I know this post." },
      { who: "narrator", text: "I don't just recognize it. I know that if you walk forty paces past it, the ditch drops into an old culvert." },
      { who: "narrator", text: "I know the south trail bypasses the rocky ridge where the meltwater freezes into black ice." },
      { who: "bin", text: "How do I know this road?" },
      { who: "bin", text: "Frozen woods. A palisade gate. A half-orc with a crossbow... I DREW this." },
      { who: "bin", text: "In my sketchbook at Old Zhou's shop. When I was fourteen." },
      { who: "system", show: ["bin", "system"], text: "[CJS] World registration: Haven." },
      { who: "system", text: "[CJS] Region: the Frostwood, exterior perimeter of Frostbitten settlement." },
      { who: "system", text: "[CJS] Querying municipal registry... Local records indicate User was reported missing two months ago." },
      { who: "system", text: "...Missing? From HERE?" },
      { who: "bin", face: "angry", text: "Missing two months?! I was standing in my flat in Zhonghai five minutes ago!" },
      { who: "peri", show: ["bin", "peri"], text: "Welcome home, kid." },
      { who: "peri", text: "Your composure has been refunded in unmarked snow. And the rest is above your pay grade. For now." },
      { who: "bin", text: "'Welcome HOME'?" },
      { who: "peri", text: "Spooky, right? The cosmic writers love a good mystery box. High retention rates." },
      { who: "bin", text: "Peri, what did you do to my life?" },
      { who: "peri", text: "Me? I just gave you a bus ticket. You bought the route years before we met." },
      { who: "bin", face: "sad", text: "That is entirely unhelpful." },
      { who: "peri", text: "Anyway! Mind the wolf." },
      { who: "bin", text: "...The what?" },
      { who: "narrator", text: "Something glints in the churned powder near the toe of my sneaker." },
      { who: "narrator", text: "A heavy metallic disc, half-frozen in the crust." },
      { who: "narrator", text: "I bend down, brushing away the ice crystals with numb fingers." },
      { who: "narrator", text: "It's heavier than copper, paler than silver, stamped with a raised relief of an open hand holding a stubby tallow candle." },
      { who: "narrator", text: "The wick of the candle is bent at an aggressive, mocking angle. The flame seems to be sneering directly into my face." },
      { who: "bin", show: ["bin"], text: "(This coin is judging me. I am being actively belittled by currency.)" },
      { who: "system", show: ["bin", "system"], text: "[CJS] Logged: 'Rude-Candle Coin'." },
      { who: "system", text: "[CJS] Classification: unknown, possibly cursed, probably just awkward." },
      { who: "system", text: "I'll keep count. You'll lose them otherwise." },
      { effects: [{ kind: "count", key: "candleCoins", n: 1 }] },
      { who: "narrator", text: "I shove the frosty coin into my jacket pocket." },
      { who: "narrator", text: "The wind drops." },
      { who: "narrator", text: "The whole forest goes completely dead and quiet." },
      { who: "narrator", text: "I stand alone between the towering black pines while the mountain wind dies to nothing, and the silence settles over the white drifts so heavy and hollow that the only sound left in the world is the cold ringing in my ears and the ache of the frost in my jaw, waiting for a breath." },
      { who: "narrator", text: "Waiting." },
      { who: "narrator", text: "Then, from somewhere far off over the northern ridge—" },
      { who: "narrator", text: "Thunk." },
      { who: "narrator", text: "The heavy, mechanical snap of a massive crossbow string releasing under enormous tension." },
      { who: "narrator", text: "A single bolt cutting the frozen air. Then nothing." },
      { who: "narrator", text: "Total, suffocating silence." },
      { who: "bin", show: ["bin"], text: "(...Bowy?)" },
      { who: "narrator", text: "The name arrives before I know where it came from." },
      { who: "narrator", text: "Crack." },
      { who: "narrator", text: "A dry pine branch snaps uphill to the right." },
      { who: "narrator", text: "Then another. Heavy, padded paws crunching over crusted snow." },
      { who: "narrator", text: "Two pale yellow eyes ignite in the blue shadows beneath the spruce canopy." },
      { who: "narrator", text: "A frost wolf steps out onto the ridge. Flakes of ice cling to its matted grey ruff, its ribs visible beneath scarred hide." },
      { who: "narrator", text: "The kind of predator that hasn't eaten in a week and has been waiting all winter for a slow, shivering delivery boy to fall out of the sky." },
      { who: "peri", show: ["peri"], text: "Frost wolf. Skinny means hungry. Hungry means careless. Show me something good, Jester." },
      { who: "bin", show: ["bin"], face: "angry", text: "I don't have a weapon, Peri! I have an order slip and a frozen mandarin peel!" },
      { who: "system", show: ["bin", "system"], text: "[CJS] Emergency loadout: one basic shortsword. Hold the pointy end away from you." },
      { who: "bin", text: "Okay. Wolf. Let's see your footwork." },
      { effects: [{ kind: "battle", encounter: "havenWolf" }] }
    ]
  },
  {
    id: "h1WolfWin",
    bg: "havenRoad",
    music: "snow",
    once: true,
    outfit: "earth",
    lines: [
      { who: "narrator", bg: "havenRoad", text: "The iron blade bites into the snow with a dull thud." },
      { who: "narrator", text: "The wolf skids sideways, yelps, and scrambles up the embankment with its tail tucked tight between its shivering hind legs." },
      { who: "narrator", text: "It vanishes into the dark pines to rethink its life choices." },
      { who: "narrator", text: "Steam rises from my knuckles. My hand isn't shaking." },
      { who: "narrator", text: "That's the terrifying part." },
      { who: "narrator", text: "When the wolf lunged, my left foot stepped back into the drift automatically. My wrist twisted to catch the teeth on the flat of the steel before my brain caught up with the fur." },
      { who: "bin", show: ["bin"], face: "surprised", text: "........." },
      { who: "bin", text: "My sword arm moved on its own." },
      { who: "bin", text: "I have worked a cash register and ridden a 48V electric scooter. I have never held a sword." },
      { who: "bin", text: "So why did my fingers know where the balance point was?" },
      { who: "system", show: ["bin", "system"], text: "[CJS] Combat resolved: Victory. Encounter rating: Rank F." },
      { who: "bin", face: "happy", text: "Two out of five stars for the wolf. Aggressive opening, zero lateral awareness. Tell it to forward its complaints to management." },
      { who: "peri", show: ["bin", "peri"], text: "Management is me. Complaint denied." },
      { who: "peri", text: "Not bad for someone whose primary cardio is sprinting away from angry bubble tea customers." },
      { who: "bin", text: "My sword arm remembers more than I do. I'll take it." },
      { who: "peri", text: "Walk, Jester. Look past the tree line." },
      { who: "narrator", text: "Through the snow-laden spruce boughs, yellow pinpricks of firelight flicker against the twilight." },
      { who: "narrator", text: "The smell of burning pine logs and roasted fat drifts on the wind." },
      { who: "peri", text: "Your welcome party is the expensive part." },
      { who: "narrator", text: "I tuck the sword under my arm and head towards the lights." }
    ]
  },
  {
    id: "h1WolfLose",
    bg: "havenRoad",
    music: "snow",
    once: true,
    outfit: "earth",
    lines: [
      { who: "narrator", bg: "havenRoad", text: "I take a heroic step forward, lose all traction on a patch of black ice, and execute a flawless horizontal faceplant into a snowbank." },
      { who: "narrator", text: "CRUNCH." },
      { who: "narrator", text: "The wolf clamps down on my left delivery jacket sleeve with tremendous enthusiasm." },
      { who: "narrator", text: "Rrrrip." },
      { who: "narrator", text: "A cloud of cheap polyester stuffing explodes into the freezing air like festive dandelion fluff." },
      { who: "narrator", text: "The wolf gags on the fluff, spits violently three times, gives me a look of profound disgust, and trots away into the trees." },
      { who: "bin", show: ["bin"], face: "sad", text: "........." },
      { who: "bin", text: "...Well." },
      { who: "bin", text: "One star out of five. Service was hasty. Left before dessert." },
      { who: "bin", text: "Also, that was my favorite windbreaker. It had thirty percent rain resistance." },
      { who: "system", show: ["bin", "system"], text: "[CJS] Combat terminated via mutual embarrassment." },
      { who: "system", text: "[CJS] The goddess has clipped that for the highlight reel. She has looped the polyester explosion seven times." },
      { who: "bin", face: "angry", text: "My bare forearm is currently turning a vibrant shade of indigo, Jess." },
      { who: "system", text: "[CJS] You're welcome. Please walk towards the lights before something else gets hungry." },
      { who: "narrator", text: "I drag myself out of the drift, clutching my ripped jacket to my shivering chest." },
      { who: "narrator", text: "Through the dark branches ahead, warm orange lanterns glow against the falling snow." },
      { who: "narrator", text: "Frostbitten." },
      { who: "narrator", text: "I grit my chattering teeth and hurry towards the town." }
    ]
  },
  {
    id: "h1Gate",
    bg: "havenGate",
    music: "snow",
    once: true,
    outfit: "earth",
    lines: [
      { who: "narrator", bg: "havenGate", text: "Frostbitten: a jagged pine palisade, crackling iron braziers, and woodsmoke clinging to the snow at the edge of the Frostwood." },
      { who: "narrator", text: "A small frontier settlement holding onto the frozen dirt with both hands." },
      { who: "narrator", text: "Ahead, the heavy timber gate stands flanked by two guards in thick sheepskin cloaks." },
      { who: "narrator", text: "To the right, a narrow alleyway sneaks around behind the palisade toward the warm kitchen chimney of the Frosted Mug tavern." },
      {
        choice: [
          { text: "Walk through the front gate like a person", effects: [{ kind: "flag", key: "route", value: 1 }], goto: "gate" },
          { text: "Sneak around to the back door of the Frosted Mug", effects: [{ kind: "flag", key: "route", value: 2 }], goto: "mug" }
        ],
        who: "bin",
        show: ["bin"],
        text: "Front gate, where everyone sees me? Or the tavern's back door, where there's soup?"
      },
      { label: "gate" },
      { who: "narrator", text: "I crunch through the slush toward the main archway, raising one hand." },
      { who: "narrator", text: "The guard leaning against the frozen oak gatepost blinks, rubs his red eyes, and drops his iron spear straight into the snow." },
      { who: "guard", text: "Garr's boy?!" },
      { who: "guard", text: "Sorry, sir. We thought you were dead. That came out faster than I meant it to." },
      { who: "bin", show: ["bin"], text: "Good evening. Reports of my demise were slightly exaggerated by regional logistics." },
      { who: "guard", text: "You're alive. You're actually standing here in a... what kind of tunic is that? Did you get robbed by a tailor?" },
      { who: "bin", face: "sad", text: "It's a delivery jacket. It represents honest labor in a temperate climate." },
      { who: "narrator", text: "The guard bends down to retrieve his spear, his stiff, woolen mittens fumbling against the icy shaft." },
      { who: "guard", text: "Look at my hands, kid. Blue as river slate. I've been on this gate for twelve hours straight." },
      { who: "guard", text: "And you know who was supposed to relieve me? Garr." },
      { who: "guard", text: "Your father's been pulling double shifts on this gate for two months because he doesn't know how to sit down." },
      { who: "guard", text: "Every night the blizzard came down from the pass, he stood right there on the watch-plank. Refused the charcoal brazier. Just staring down the south road till dawn." },
      { who: "narrator", text: "A small knot tightens in my throat, cold and sharp." },
      { who: "bin", face: "sad", text: "Garr was out here every night?" },
      { who: "guard", text: "Every single one. He wouldn't let anyone say the word 'memorial'." },
      { who: "guard", text: "Go home, Bin. Please. Before somebody starts crying on duty." },
      { who: "narrator", text: "As I step past the gatehouse, my foot clips a dented tin box resting on the sentry bench." },
      { who: "narrator", text: "Inside the lost-and-found tin, amidst rusted nails and frozen tallow scraps, a pale metallic coin winks at me." },
      { who: "narrator", text: "The candle on its face seems even more offended than the first one." },
      { who: "system", show: ["bin", "system"], text: "[CJS] A second rude-candle coin in the gate's lost-and-found tin. Unclaimed. Logged." },
      { who: "bin", text: "Why do these keep showing up near municipal infrastructure?" },
      { who: "system", text: "Perhaps rude candles are drawn to broke individuals. It is a natural gravitational pull." },
      { effects: [{ kind: "count", key: "candleCoins", n: 1 }] },
      { goto: "end" },
      { label: "mug" },
      { who: "narrator", bg: "inn", text: "I slip down the snowy alley and duck under the low eaves behind the Frosted Mug." },
      { who: "narrator", text: "Yellow candlelight leaks through the timber planks of the kitchen door, along with the rich, savory steam of boiled mutton and turnips." },
      { who: "narrator", text: "And loud, drunken voices carrying straight through the wood." },
      { who: "mugRegular", text: "I tell you, the boy was eaten by a frost wolf pack! Found his boot near the ridge, clean bitten off!" },
      { who: "host", text: "Nonsense! If a wolf ate Bin, the wolf would have died of indigestion from his complaining." },
      { who: "mugRegular", text: "Then he sailed south and married a sea witch! Old Rolf swore he saw him in a pirate hat!" },
      { who: "host", text: "Rolf talks to his firewood. He couldn't tell a sea witch from a wet goat." },
      { who: "narrator", text: "I push the squeaking kitchen door open and step inside." },
      { who: "narrator", text: "The tavern is packed. Roaring hearth fire, wet wool, spilled ale, and the sharp clang of pewter tankards." },
      { who: "narrator", text: "Above the massive stone mantle hangs a chipped iron shortsword in a worn leather scabbard." },
      { who: "narrator", text: "I stare at the hilt while the tavern noise washes over me, and the smell of roasting fat fills the warm room, knowing the balance of that grip and the exact notch a thumb's width above the crossguard before my hand even lifts, like an old glove waiting on a shelf." },
      { who: "bin", text: "(...Why do I know that grip?)" },
      { who: "host", text: "Two months, no body, and his old sword still hangs over my fireplace. Either he's alive or someone's running a very strange long con." },
      { who: "narrator", text: "The Host turns from the stew pot with a dripping iron ladle, freezes, and stares straight at me." },
      { who: "host", text: "...Oh. It's you." },
      { who: "bin", show: ["bin"], text: "Good evening, uncle. Still serving the mutton?" },
      { who: "host", text: "Soup. On the house. Sit before you fall." },
      { who: "narrator", text: "He shoves a steaming wooden bowl of thick broth and a torn hunk of dark bread into my hands." },
      { who: "host", text: "And this was on the floor of my back corridor. Nobody's claimed it. Tastes wrong. Don't ask how I know." },
      { who: "narrator", text: "He slaps a pale coin onto the table beside my bowl. The candle engraved on the metal flickers with unmistakable contempt." },
      { who: "bin", text: "Why did you bite it?" },
      { who: "host", text: "Standard tavern bullion verification. Go eat your soup." },
      { who: "host", text: "Then go home. Garr's been pulling double shifts on that gate so he doesn't have to sit in that hut." },
      { effects: [{ kind: "count", key: "candleCoins", n: 1 }] },
      { label: "end" },
      { who: "narrator", text: "Whichever way I come in, the news runs ahead of me on faster legs." },
      { who: "narrator", text: "Frostbitten gossips faster than it shovels." }
    ]
  },
  {
    id: "h1Home",
    bg: "home",
    music: "rampart",
    once: true,
    outfit: "earth",
    lines: [
      { who: "narrator", bg: "home", text: "Garr's hut sits at the far eastern edge of Frostbitten, where the town palisade gives up and the black pines begin." },
      { who: "narrator", text: "A crooked stone chimney puffs grey woodsmoke into the freezing night." },
      { who: "narrator", text: "Before my knuckles can even touch the rough timber door, the iron latch clicks." },
      { who: "narrator", text: "The heavy pine door swings inward." },
      { who: "narrator", text: "It smells like pine smoke and iron. Exactly like the dreams." },
      { who: "narrator", text: "A mountain of coarse dark fur, heavy leather, and iron studs blocks the entire doorway." },
      { who: "narrator", text: "Thud." },
      { who: "narrator", text: "A heavy, calloused fist punches me straight in the right shoulder." },
      { who: "bin", show: ["bin"], face: "sad", text: "Oof!" },
      { who: "narrator", text: "Before I can recover, two massive tree-trunk arms wrap around my ribs and squeeze until my spine makes four distinct popping noises." },
      { who: "bowy", show: ["bowy", "bin"], text: "WHERE. HAVE. YOU. BEEN." },
      { who: "bin", text: "Can't... breathe... lungs... compressed..." },
      { who: "narrator", text: "He sets me down hard on the floorboards, holding me at arm's length by both shoulders." },
      { who: "narrator", text: "Two pale ivory tusks curve upward from his heavy lower jaw, framing a broad, scarred snout." },
      { who: "bin", face: "surprised", text: "........." },
      { who: "bin", text: "I drew them wrong." },
      { who: "bowy", text: "Everyone does." },
      { who: "bin", text: "The angle. In my notebook. I curved them too far forward." },
      { who: "bowy", text: "You're an idiot. Look at you. What is that shiny rag you're wearing?" },
      { who: "bin", text: "It's an eight-yuan polyester windbreaker with reflective trim." },
      { who: "bowy", text: "It looks like a dead trout." },
      { who: "mitia", show: ["bin", "mitia", "bowy"], text: "B-Bin...?" },
      { who: "narrator", text: "A girl steps out from behind the heavy spruce partition near the pantry." },
      { who: "narrator", text: "Dark hair tied loosely behind her shoulders, an oversized woollen apron dusted with flour, and eyes wide as river pools." },
      { who: "mitia", text: "You're... you're really back?" },
      { who: "narrator", text: "Tears spill over her eyelashes before she can finish the syllable." },
      { who: "narrator", text: "She scrubs furiously at her cheeks with the corner of her apron, trying to pretend she didn't." },
      { who: "mitia", face: "sad", text: "It's just the stove smoke. The chimney draft is terrible tonight." },
      { who: "bin", face: "happy", text: "Hi, Mitia." },
      { who: "narrator", text: "Her name is out of my mouth before I know I have it." },
      { who: "narrator", text: "She gives up the pretense, rushes forward, and throws both arms around my neck." },
      { who: "narrator", text: "Her apron smells of roasted oats and dried thyme, like the whole kitchen." },
      { who: "mitia", text: "You were gone for sixty-two days. We checked the south road every morning." },
      { who: "narrator", text: "Over her shoulder, I look past the hearth to the far corner of the room." },
      { who: "narrator", text: "Under the frosted glass window: three bunks." },
      { who: "narrator", text: "The third bunk has a woollen grey blanket folded with crisp, square corners. The straw mattress is freshly beaten. The pillow is fluffed." },
      { who: "bin", face: "sad", text: "You kept the bunk made." },
      { who: "mitia", text: "Every morning. Bowy told me to pack the blanket away. I didn't." },
      { who: "bowy", text: "I said it was collecting dust. That was a tactical observation." },
      { who: "mitia", text: "Here. Drink this before you freeze." },
      { who: "narrator", text: "She pulls away and presses a hot earthenware mug into my palms, filled with steaming ginger tea and melted clover honey." },
      { who: "narrator", text: "My left hand pulls the cuff of my sleeve down over my thumb before my fingers even touch the ceramic." },
      { who: "narrator", text: "I hold the steaming cup against my chest, standing in the middle of the warm hut while the pine wood pops in the iron grate, listening to the wind rattle the frosted windowpanes, until twenty winters on Earth feel like a strange dream I had while walking in the snow." },
      { who: "narrator", text: "A strange dream." },
      { who: "narrator", text: "Above the tool bench hangs an enormous heavy crossbow carved from black ironwood, its twin steel limbs bound with oiled sinew." },
      { who: "narrator", text: "Thunder." },
      { who: "narrator", text: "I know the nick on the stock where a mountain cat clawed it. I know exactly how hard the trigger pulls." },
      { who: "narrator", text: "It's like reading my own notebook in someone else's handwriting." },
      { who: "narrator", text: "By the hearth, an older man stands with his back to the flames." },
      { who: "narrator", text: "Late fifties. Broad shoulders under weathered elk hide. His left eye is clouded milky white with an old scar, his right eye dark and sharp as a hunting knife." },
      { who: "garr", show: ["garr", "bin"], text: "You're late for dinner." },
      { who: "garr", text: "Two months late." },
      { who: "bin", text: "Traffic." },
      { who: "garr", text: "Traffic on the Frostwood trail." },
      { who: "bin", text: "You wouldn't believe the congestion at the dimensional interchange." },
      { who: "garr", text: "........." },
      { who: "narrator", text: "Garr looks me up and down. Relief in that one good eye, so heavy it looks like anger. Suspicion too. And something else: a man who has been expecting this for years." },
      {
        choice: [
          { id: "truth", text: "A goddess kicked me through a glowing hole in my flat.", effects: [{ kind: "record", key: "h1.whereWere", option: "truth" }], goto: "whereTruth" },
          { id: "joke", text: "Would you believe... a very long delivery shift?", effects: [{ kind: "record", key: "h1.whereWere", option: "joke" }], goto: "whereJoke" },
          { id: "silence", text: "(Say nothing.)", effects: [{ kind: "record", key: "h1.whereWere", option: "silence" }], goto: "whereSilence" }
        ],
        key: "h1.whereWere",
        who: "garr",
        show: ["garr", "bin"],
        text: "Where were you, boy?"
      },
      { label: "whereTruth" },
      { who: "bin", text: "A goddess in a black lolita dress appeared in my room on Earth, gave me a cosmic contract, and booted me through a rift." },
      { who: "garr", text: "We don't talk about goddesses under this roof." },
      { who: "narrator", text: "Garr's answer comes out half a second too fast." },
      { who: "narrator", text: "He catches himself immediately, shifting his weight against the hearthstone." },
      { who: "garr", text: "Crazy talk. Frostbite playing tricks on your skull. Drink your tea." },
      { who: "bowy", show: ["bowy", "bin"], text: "A goddess with a boot? Sounds like someone kicked your brain loose." },
      { who: "bowy", text: "He's babbling. Somebody check him for fever." },
      { who: "mitia", show: ["mitia", "bin"], text: "Was she polite at least?" },
      { who: "bin", text: "She ate starlight popcorn and monetised my concussion." },
      { who: "mitia", face: "surprised", text: "That sounds terrible. You need two bowls of stew." },
      { goto: "whereAfter" },
      { label: "whereJoke" },
      { who: "bin", text: "Would you believe... a very long delivery shift? Customer on the fifth floor without an elevator." },
      { who: "bowy", show: ["bowy", "bin"], text: "No." },
      { who: "bin", text: "The stairwell was poorly lit and someone left a bicycle on the landing." },
      { who: "bowy", text: "Still no." },
      { who: "bin", text: "I had to carry three boxes of sweet-and-sour chicken through a thunderstorm." },
      { who: "mitia", show: ["mitia", "bin"], text: "Did they tip you for being on time?" },
      { who: "bin", face: "sad", text: "They gave me a one-star review and a bruised rib." },
      { who: "garr", show: ["garr", "bin"], text: "Same mouth. Still runs after the rest of you gives out." },
      { who: "bowy", text: "If you were delivering chicken for two months, where is my drumstick?" },
      { who: "bin", text: "Eaten by a frost wolf. Tactical casualty." },
      { goto: "whereAfter" },
      { label: "whereSilence" },
      { who: "bin", text: "........." },
      { who: "narrator", text: "I open my mouth, but the words stall against my teeth." },
      { who: "narrator", text: "How do you explain hospital bills, neon streets and cheap noodles to the people who raised you in the snow?" },
      { who: "narrator", text: "How do you tell them I didn't know their names an hour ago, and I still knew which bunk was mine?" },
      { who: "narrator", text: "Garr watches my face for three quiet seconds." },
      { who: "narrator", text: "His harsh expression softens by a fraction of an inch." },
      { who: "garr", text: "Eat first. The rest can wait." },
      { who: "bin", face: "sad", text: "Thanks, Garr." },
      { who: "mitia", show: ["mitia", "bin"], text: "Here. Sit by the fire. The stew is hot." },
      { goto: "whereAfter" },
      { label: "whereAfter" },
      { who: "narrator", text: "Garr takes an iron poker and nudges a birch log into the center of the coals." },
      { who: "garr", show: ["garr", "bin"], text: "We'll talk. Not tonight. Tonight you sleep in your own bunk." },
      { who: "garr", text: "Tomorrow, two things." },
      { who: "garr", text: "One: there's a door at the back of this hut that wasn't there this morning. It opens onto a meadow where it's spring. I don't like it. You figure it out." },
      { who: "bin", face: "surprised", text: "A spring meadow behind the pantry?" },
      { who: "garr", text: "Two: the Guild filed you as dead. Corvin will want forms. In triplicate." },
      { who: "bin", text: "Even across dimensions, the administrative backlog is eternal." },
      { who: "bowy", show: ["bowy", "bin"], text: "And when you leave this hut, I'm coming with you. Not asking." },
      { who: "bin", text: "I wouldn't dream of going without my favorite marksman." },
      { who: "bowy", text: "Thunder is clean and oiled. We hunt tomorrow." },
      { effects: [{ kind: "meet", npc: "garr" }, { kind: "meet", npc: "bowy" }, { kind: "meet", npc: "mitia" }, { kind: "recruit", id: "bowy" }, { kind: "item", id: "seed-turnip", n: 10 }, { kind: "quest", id: "q1Farm" }, { kind: "quest", id: "q2Guild" }] },
      { who: "peri", show: ["peri"], text: "Filed under 'family, emotionally expensive'. Sleep, Jester. Tomorrow's episode has paperwork." },
      { who: "narrator", text: "Midnight settles over Garr's hut in heavy, frozen silence." },
      { who: "narrator", text: "Bowy's rhythmic, rumbling snores rattle the spruce partition like a distant watermill." },
      { who: "narrator", text: "I lie on the straw mattress staring at the dark rafters, listening to the wind howl across the eaves." },
      { who: "narrator", text: "I can't sleep." },
      { who: "narrator", text: "My shoulder aches where Bowy punched it, and my toes are still thawing from the road." },
      { who: "narrator", text: "A faint orange ember glows from the hearth." },
      { who: "narrator", text: "Garr is still sitting alone on his three-legged stool by the dying fire." },
      { who: "narrator", text: "Between his scarred, calloused fingers, he slowly turns a small piece of dark polished wood." },
      { who: "narrator", text: "A small carved charm. A spider, its eight legs wrapped around a tiny loom." },
      { who: "narrator", text: "The wood is worn smooth by decades of handling." },
      { who: "narrator", text: "Garr turns his head slightly toward my bunk, his sharp eye catching the ember-light." },
      { who: "narrator", text: "His lips part. He almost speaks." },
      { who: "narrator", text: "Then he looks back down into the grey ash and says nothing at all." },
      { who: "narrator", text: "In the dark corner beside the tool rack, a soft violet shimmer ripples through the air." },
      { who: "peri", show: ["peri"], text: "........." },
      { who: "narrator", text: "The galaxies in her eyes stop turning. One second." },
      { who: "narrator", text: "She stares at the wooden charm in Garr's hand, her smirk completely gone." },
      { who: "narrator", text: "Then she blinks, and the shadows swallow her whole." },
      { who: "narrator", text: "At the foot of my bunk, neatly folded in a clean stack, rests my old Haven gear." },
      { who: "narrator", text: "Thick fur-lined tunic, boiled leather bracers, and oiled winter boots. Mitia set them out while I was by the fire." },
      { who: "narrator", text: "I pull the rough woollen blanket up to my chin." },
      { who: "narrator", text: "The smell of cedar shavings and woodsmoke fills my chest." },
      { who: "narrator", text: "For the first time in a long time, my brain stops running." },
      { who: "narrator", text: "I fall asleep into the quiet dark." },
      { who: "narrator", text: "Morning comes too early, the way it always does in the north." },
      { who: "narrator", text: "I wake up in Haven clothes." }
    ]
  },
  {
    id: "farmArrive",
    bg: "farm",
    music: "grass",
    once: true,
    lines: [
      { who: "narrator", bg: "home", text: "Morning. The back pantry of Garr's hut." },
      { who: "narrator", text: "Garr stands with his arms crossed over his chest, glaring at a solid oak door set directly into the rear log wall." },
      { who: "garr", show: ["garr", "bin"], text: "Lived in this hut for twenty-four years. Until recently, this was a shelf for salted cod." },
      { who: "garr", text: "Today it has iron hinges and brass handles. I don't like magic in the larder." },
      { who: "bin", text: "Let's inspect the real estate anomaly." },
      { who: "narrator", bg: "farm", text: "I push the heavy oak door open and step through." },
      { who: "narrator", text: "Warm, fragrant spring air washes over my face, carrying the sweet scent of clover and damp loam." },
      { who: "narrator", text: "Sunlight spills across a vast rolling meadow ringed by gentle green hills and a crystal-clear mountain pond." },
      { who: "narrator", text: "Behind us, through the doorframe, Garr's dim pantry and the frost on its one window look like a painting hung on a wall." },
      { who: "mitia", show: ["mitia", "bin"], face: "surprised", text: "It's... it's warm. Like the southern valleys in spring." },
      { who: "narrator", text: "Mitia steps out into the tall grass, extending one hand toward the sunlit breeze." },
      { who: "narrator", text: "A small yellow-breasted meadow bunting flutters down from a birch branch, lands softly on her open fingers, and stays there, preening its wing in total calm." },
      { who: "bowy", show: ["bowy", "bin"], text: "Good dirt." },
      { who: "narrator", text: "Bowy kneels in the turf, crushes a clump of dark soil in his massive fist, and sniffs it with a grunt of approval." },
      { who: "bowy", text: "Lots of worms. Lots of thistle, though. And boulders." },
      { who: "peri", show: ["bin", "peri"], text: "Welcome to your pocket, Jester!" },
      { who: "peri", text: "Housewarming gift! Frostbitten only thaws for three weeks a year, and my star performer needs a proper stage." },
      { who: "bin", text: "Why does a freshly generated pocket dimension come pre-installed with sixty rocks and waist-high thistle?" },
      { who: "peri", text: "Default engine physics! If I gave you a manicured golf course, chat would complain about pay-to-win mechanics." },
      { who: "peri", text: "Grow things, ship things, make me proud. It follows the seasons, for realism." },
      { who: "system", show: ["bin", "system"], text: "[CJS] Location: POCKET HAVEN. A pocket dimension folded behind Garr's back door. Mild weather. Real seasons." },
      { who: "system", text: "[CJS] Condition: freshly generated, therefore full of weeds. And rocks. Don't ask me why a new dimension has rocks." },
      { who: "system", text: "[CJS] Tutorial: pick a tool on the hotbar (keys 1 to 5), then click a field tile next to you." },
      { who: "system", text: "[CJS] 1: Hoe, tills the soil. 2: Watering Can, waters it. 3: Axe, chops branches. Stumps need an upgraded Axe." },
      { who: "bin", text: "Right. Step one of every farming game: clear the junk, till the soil, plant the cheapest seeds." },
      { who: "bowy", show: ["bowy", "bin"], text: "I can chop the timber. You handle the digging." },
      { who: "bin", text: "Deal. Bowy takes heavy forestry, I handle delicate horticulture." },
      { who: "system", show: ["bin", "system"], text: "[CJS] 4: Hammer, breaks stones. Boulders need an upgraded Hammer. 5: Sickle, clears weeds." },
      { who: "system", text: "[CJS] The can runs dry. Refill it at the pond." },
      { who: "mitia", show: ["mitia", "bin"], text: "The pond water is so clear! You can see round white pebbles all the way to the bottom." },
      { who: "bin", text: "Ten turnip seeds in my pouch. The grand cornerstone of my agrarian empire." },
      { who: "system", show: ["bin", "system"], text: "[CJS] Turnips: cheap, forgiving, zero plot twists. A good match for the User." },
      { who: "bin", face: "sad", text: "Your sarcasm module is in great shape today, Jess." },
      { who: "system", text: "[CJS] Crops grow one stage each night they were watered." },
      { who: "system", text: "[CJS] Skip the water and they don't die. They just sit there, judging you." },
      { who: "bin", text: "And how do turnips turn into money?" },
      { who: "system", text: "[CJS] Put harvests in the shipping crate. It sells them overnight." },
      { who: "system", text: "[CJS] Sleep in the hut to end the day and save." },
      { who: "system", text: "[CJS] Menu: Esc / ☰ (Quests, Bag, Party, Jester)." },
      { who: "bin", show: ["bin"], face: "happy", text: "Tool hotbar ready. Soil ready. Time to get to work." }
    ]
  },
  {
    id: "guildRegister",
    bg: "guild",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "The Adventurers' Guild is loud, warm, and smells of wet fur. Every head in the hall turns at once." },
      { who: "lysa", show: ["lysa"], text: "Bin! You're back! Wait — you're BACK back? Like, not-dead back? Oh, thank the gods, Garr's been moping for two months!" },
      { who: "corvin", text: "Another resurrection. Wonderful. Please fill out these forms in triplicate. Yes, all of them. No, I don't make the rules. The dead don't usually come back to argue about them." },
      { who: "dain", show: ["dain", "mara"], text: "Well, well. The ghost returns. Figured you'd frozen to death in a ditch somewhere." },
      { who: "mara", text: "Ignore him. He's jealous you got a dramatic disappearance and he's never once been interesting." },
      { who: "kael", text: "You're the one who came back? Everyone talks about you. Well. Not everyone. Some people. I heard stories." },
      {
        choice: [
          { text: "Pay the Brinna twins their three silver (30 G)", effects: [{ kind: "gold", n: -30 }, { kind: "flag", key: "paidTwins", value: true }], goto: "paid" },
          { text: "\"Death clears all debts. It's in the forms.\"", goto: "dodged" }
        ],
        who: "twins",
        text: "You owe us three silver from before you vanished. We did NOT forget."
      },
      { label: "paid" },
      { who: "twins", text: "...He paid. Nessa, he actually paid. Is he sick? Check if he's sick." },
      { goto: "tessa" },
      { label: "dodged" },
      { who: "twins", text: "Nice try. Interest is compounding. We'll be back. We are ALWAYS back." },
      { label: "tessa" },
      { who: "tessa", show: ["tessa", "lysa"], text: "You disappeared for two months. That's usually fatal. You look okay. Mostly. Take something easy first." },
      { who: "tessa", text: "Mitia's apothecary is three weeks short of frostcap, and the gate keeps logging the shipments as 'redirected'. Gather some in the Frostwood. Count what's there, count what's missing." },
      { who: "lysa", show: ["lysa"], text: "Aaand... stamp! Rank F, again. Welcome back to being alive, legally! Requests go up on the board every morning — finish them for coin and Guild Points." },
      { effects: [{ kind: "meet", npc: "lysa" }, { kind: "meet", npc: "dain" }, { kind: "meet", npc: "mara" }, { kind: "flag", key: "registered", value: true }, { kind: "flag", key: "metDain", value: true }, { kind: "flag", key: "metMara", value: true }, { kind: "points", npc: "lysa", n: 20 }] },
      { who: "system", show: ["system"], text: "[CJS] Guild rank F restored. Requests unlocked. Jester Bits unlocked: three daily missions for JP. Spend JP in the Jester Shop (menu → Jester)." }
    ]
  },
  {
    id: "meetTilde",
    bg: "store",
    music: "rampart",
    once: true,
    lines: [
      { who: "tilde", show: ["tilde"], text: "A customer! And a dead one! Welcome back, dear. Tilde's Trading Post: seeds, rope, furs, tea, and a little of everything else." },
      { who: "tilde", text: "I buy anything you can carry in. Anything at all. And the little bottles on the top shelf? Those aren't for sale. Yet." },
      { who: "bin", show: ["bin", "tilde"], text: "That 'yet' is doing a lot of work." },
      { who: "tilde", text: "Isn't it? Tea party on Sunday. Do come. Bring an appetite. And an antidote. I'm joking! Mostly." },
      { effects: [{ kind: "meet", npc: "tilde" }] }
    ]
  },
  {
    id: "frostwoodFirst",
    bg: "forest",
    music: "snow",
    once: true,
    lines: [
      { who: "bowy", show: ["bowy"], text: "Frostwood. Wolves, goblins, pixies with attitude. Frostcaps grow under the heavy pines. Pale blue. Pick those, not the brown ones." },
      { who: "bowy", text: "Monsters get friendlier if you beat them fair and offer a treat. Build a barn at home and some of them follow you back." },
      { who: "bin", show: ["bin", "bowy"], text: "You're doing a tutorial voice." },
      { who: "bowy", text: "You're doing a 'you forgot everything' face. Walk." },
      { effects: [{ kind: "flag", key: "frostwoodSeen", value: true }] }
    ]
  },
  {
    id: "frostcapDone",
    bg: "home",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "Back in Garr's kitchen, Mitia counts the frostcaps twice and holds the last one up to the light like a jewel." },
      { who: "mitia", show: ["mitia"], text: "Five! That's cough drops for the whole week. Thank you, Bin." },
      { who: "narrator", text: "Out in the grove there had been crates stacked in the old shed — marked for the apothecary, stuffed with straw. And on Mitia's windowsill, between the cough-drop tins: a coin. Pale. Heavy. Rude candle." },
      { who: "mitia", text: "A traveller in good boots left it as a tip. He bought liniment for a horse nobody could see. Then he asked who in town has a cough." },
      { who: "bin", show: ["bin", "mitia"], text: "That's the third coin since I got back. Someone isn't dropping these by accident. They want to be noticed." },
      { who: "mitia", text: "I can't run a proper shop out of Garr's kitchen. If the old apothecary had a roof again, I could keep real stock... and keep an eye on whoever keeps 'tipping' me." },
      { who: "system", show: ["system"], text: "[CJS] Quest added: 'Mitia's Apothecary' — rebuild it on the Outpost Board in the square. Also: 'The Screaming Log' at the Frosted Mug. Don't ask. I didn't." }
    ]
  },
  {
    id: "meetHilda",
    bg: "village",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "A patched tent stands beside the caved-in forge. From inside: hammering, and somebody judging your footsteps." },
      { who: "hilda", show: ["hilda"], text: "Your boots are loud and your left one drags. You're Garr's boy. The dead one." },
      { who: "bin", show: ["bin", "hilda"], text: "Mostly alive now. The paperwork's pending." },
      { who: "hilda", text: "Hilda Ironhand. The snow took my roof at midwinter. I've been forging in a tent since. It's like working inside a sneeze." },
      { who: "hilda", text: "Rebuild the Ironhand Forge on the Outpost Board and I'll give you steel that sings. And I'll come see what keeps denting your sword. For research." },
      { effects: [{ kind: "meet", npc: "hilda" }, { kind: "flag", key: "metHilda", value: true }, { kind: "quest", id: "q7Smithy" }] }
    ]
  },
  {
    id: "meetFrida",
    bg: "village",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "In the snowed-in ruin south of the square, a girl in white shrine robes is sweeping snow off the steps of a collapsed shrine. The snow keeps winning. She keeps sweeping." },
      { who: "frida", show: ["frida"], text: "Oh! Good morning. This is — was — the shrine of the Weaver of Fools. A trickster goddess from the old Norheim stories. She likes laughter more than prayers." },
      { who: "peri", show: ["frida", "peri"], text: "I have a SHRINE? Bin. Bin. I have FANS." },
      { who: "bin", show: ["bin", "frida"], text: "(Please don't make this weird.)" },
      { who: "frida", text: "I'm Frida. I keep it, even like this. The stories say the Weaver used to grant favours. Small ones. Convenient ones. If it were standing again, maybe people would come back." },
      { who: "peri", show: ["peri"], text: "Restore my shrine and I'll do favours. Weather, stamina, a little plot armor. Paid in Audience — people watching you be ridiculous. Everybody wins, mostly me." },
      { effects: [{ kind: "meet", npc: "frida" }, { kind: "flag", key: "metFrida", value: true }, { kind: "quest", id: "q5Shrine" }] },
      { who: "system", show: ["system"], text: "[CJS] Quest added: 'The Weaver's Shrine'. Needs a Starbloom: white star-shaped flowers in the Frostwood." }
    ]
  },
  {
    id: "shrineRestored",
    bg: "shrine",
    music: "main-menu",
    once: true,
    lines: [
      { who: "frida", show: ["frida"], text: "The bells... they're ringing on their own. Bin, listen. It sounds like someone laughing." },
      { who: "peri", show: ["frida", "peri"], text: "Because someone IS laughing. Look at that statue. Cloak, mask, star. They got my good side." },
      { who: "frida", text: "I'll keep it swept. Every morning. The Weaver deserves a clean doorstep." },
      { effects: [{ kind: "points", npc: "frida", n: 60 }, { kind: "faith", n: 20 }] },
      { who: "system", show: ["system"], text: "[CJS] The Weaver's Shrine is restored. Audience now builds every night. Ask Peri for one favour a day inside the shrine." }
    ]
  },
  {
    id: "atelierBuilt",
    bg: "atelier",
    music: "rampart",
    once: true,
    lines: [
      { who: "mitia", show: ["mitia"], text: "A real counter. Two bells over the door. A chimney that points UP. I might cry. I'm going to cry. Give me a moment." },
      { who: "narrator", text: "On the back counter, the frost sprite sulks in a jar labelled 'small frost sprite — do not shake, do not insult, do not feed after lukewarm'." },
      { who: "mitia", text: "Bin... when you go back into the Frostwood, let me come. Garr says I'm 'not ready'. The animals listen to me. The frost listens to me. I think I'm more ready than he wants me to be." },
      { effects: [{ kind: "recruit", id: "mitia" }, { kind: "points", npc: "mitia", n: 60 }] },
      { who: "system", show: ["system"], text: "[CJS] Mitia joined the party! Alchemy is available at the Apothecary." }
    ]
  },
  {
    id: "smithyBuilt",
    bg: "smithy",
    music: "rampart",
    once: true,
    lines: [
      { who: "hilda", show: ["hilda"], text: "Listen. That's a forge that doesn't leak snow. Best sound in the north." },
      { who: "hilda", text: "And I'm coming along when you go into the ruins. I want to see how my blades hold up against things with three heads. Research." },
      { effects: [{ kind: "recruit", id: "hilda" }, { kind: "points", npc: "hilda", n: 60 }] },
      { who: "system", show: ["system"], text: "[CJS] Hilda joined the party! Smelting, gear crafting and tool upgrades are available at the Ironhand Forge." }
    ]
  },
  {
    id: "mugLog",
    bg: "inn",
    music: "rampart",
    once: false,
    lines: [
      { if: { kind: "flag", key: "logTried" }, goto: "retry" },
      { who: "host", text: "You! Garr's boy. Good. The goat is fine. The goat is offended. And the log in my woodshed is screaming. In RHYME." },
      { who: "narrator", text: "The woodshed door creaks on a hinge that has been a creak since autumn and is now a personality. The log near the back wall is making a noise like a kettle with a grudge." },
      { who: "frostSprite", text: "Two months you've been gone, two months of avoidable seasoning, and now I'm stuck in a log that's half a degree too dry! I am a FROST SPRITE. I require a colder log or a sympathetic ear." },
      { who: "bin", show: ["bin"], text: "I have an ear. I also know an apothecary with labelled jars and correct temperatures." },
      { who: "frostSprite", text: "Counter-offer: a labelled jar, a daily fifteen-minute complaint window, and NOBODY calls me 'the log'." },
      { who: "narrator", text: "The screaming has woken the frost rats nesting under the woodshed floor. They have a poor opinion of magic and a very good opinion of breakfast." },
      { effects: [{ kind: "flag", key: "logTried", value: true }] },
      { goto: "fight" },
      { label: "retry" },
      { who: "frostSprite", text: "You're BACK. The rats are back too. Everybody's back. Do it properly this time." },
      { label: "fight" },
      { effects: [{ kind: "battle", encounter: "woodshedRats" }] }
    ]
  },
  {
    id: "logWin",
    bg: "inn",
    music: "rampart",
    once: true,
    lines: [
      { who: "frostSprite", text: "Adequate. Tolerable left hand. Deeply mediocre right knee. To the apothecary. Before the goat hears any more of this." },
      { who: "narrator", text: "Bin carries the sprite across town in a borrowed jam jar. Three people stop him to ask if he's the dead one. Two of them give him bread for the trouble." },
      { who: "mitia", show: ["mitia"], text: "A rude jar. You brought me a rude jar. ...I love it. I'll write the label now." },
      { who: "host", bg: "inn", text: "One more thing, wolf man. Mittens — the tavern cat — hasn't come home in four days. Little Tuli's been asking everyone. Come by the Mug and ask about it." },
      { effects: [{ kind: "flag", key: "spriteJarred", value: true }, { kind: "item", id: "iceCrystal", n: 1 }] }
    ]
  },
  {
    id: "logLose",
    bg: "inn",
    music: "rampart",
    once: false,
    lines: [
      { who: "narrator", text: "The rats win round one. Bin retreats with his dignity mostly intact and a personal grudge he intends to settle." },
      { who: "frostSprite", text: "We retreat! With dignity! Come back tomorrow when you're less mediocre. I'll be here. In the log. Screaming." },
      { effects: [{ kind: "flagDay", key: "logLostDay" }] }
    ]
  },
  {
    id: "tuliCat",
    bg: "inn",
    music: "rampart",
    once: true,
    lines: [
      { who: "tuli", text: "Are you the man who got bit by a wolf? Mama says you're the wolf man. I have a job for you, mister wolf man. The job is Mittens." },
      { who: "tuli", text: "Mittens has been gone four days. I'm paying in biscuits. Unsalted. And I have a sword, so don't try anything." },
      { who: "bin", show: ["bin"], face: "happy", text: "A wooden sword. Terrifying. I accept the job. The biscuits are payment in full." },
      { who: "host", text: "The fishmonger swears the cat went down the south alley. The bread woman says the orchard. The old soldier says uphill, to Hermit Rolf's hut in the Frostwood. Everyone's sure. Nobody agrees." },
      { effects: [{ kind: "flag", key: "catJob", value: true }] },
      { who: "system", show: ["system"], text: "[CJS] Quest updated: follow the trail into the Frostwood. Cats: the lowest-stakes job in town. This will definitely not turn out to be anything else. (Wink.)" }
    ]
  },
  {
    id: "rolfHut",
    bg: "forest",
    music: "snow",
    once: true,
    lines: [
      { who: "narrator", text: "Snow, pines, and three leads that all sound certain." },
      { label: "leads" },
      {
        choice: [
          { text: "Check the mill by the south alley", effects: [{ kind: "time", minutes: 60 }], goto: "mill" },
          { text: "Check the orchard wall", effects: [{ kind: "time", minutes: 60 }], goto: "orchard" },
          { text: "Follow the paw prints uphill to Hermit Rolf's hut", goto: "uphill" }
        ],
        who: "bin",
        show: ["bin"],
        text: "Where would a cat with opinions go?"
      },
      { label: "mill" },
      { who: "narrator", text: "The mill is loud with grain and quiet on cats. An hour gone. The miller offers you flour. Not helpful. Very kind." },
      { goto: "leads" },
      { label: "orchard" },
      { who: "narrator", text: "At the orchard wall: a paw-shaped dent in the snow, pointing uphill. Not at the orchard. An hour gone, one clue gained." },
      { goto: "leads" },
      { label: "uphill" },
      { who: "rolf", text: "The cat is asleep on my kettle. Take her if you can lift her without losing fingers. She's been here three weeks. I feed her one fish a day and complain the entire time." },
      { who: "rolf", text: "While you're here. Tin by the door. Six coins. Found four on the path, two behind the hut. Same candle. Same insult. A traveller asked me three weeks ago who up in the hills has a cough." },
      { effects: [{ kind: "count", key: "candleCoins", n: 6 }, { kind: "flag", key: "catFound", value: true }] },
      { who: "bin", show: ["bin"], text: "Nine coins now. And everyone they ask about is somebody who's sick. That's not a treasure trail. That's a search." },
      { who: "narrator", text: "Halfway down the hill, two wolves step out of the treeline the way wolves do in winter: no fanfare, a lot of teeth. In the basket, Mittens makes a noise that is not a meow. It is a complaint." },
      { effects: [{ kind: "battle", encounter: "catWolves" }] }
    ]
  },
  {
    id: "catWin",
    bg: "inn",
    music: "rampart",
    once: true,
    lines: [
      { who: "tuli", text: "You brought my cat. I'm giving you a biscuit. I'm giving Mittens a biscuit. Mittens won't eat it. She'll sit on it. It'll be a chair. Thank you, wolf man." },
      { who: "host", text: "Mittens is on the bar. Mittens has decided the bar is a kettle. The town owes you soup. I owe you two." },
      { effects: [{ kind: "flag", key: "catDone", value: true }] },
      { who: "peri", show: ["peri"], text: "Filed. Tagged. Cleared. A small thing done well. Also nine suspicious coins and a pattern about coughs. Garr's been cooking all day, by the way. Go home for dinner." }
    ]
  },
  {
    id: "catLose",
    bg: "inn",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "The wolves win the first exchange. Bin retreats, regroups, and bluffs them off the rest of the path with a torch and one very angry cat." },
      { who: "tuli", text: "You brought my cat! You look terrible. I'm giving you TWO biscuits." },
      { effects: [{ kind: "flag", key: "catDone", value: true }] },
      { who: "peri", show: ["peri"], text: "A win is a win. A limp is a limp. Garr's been cooking all day. Go home for dinner." }
    ]
  },
  {
    id: "dinner",
    bg: "home",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "Garr's kitchen smells like a kitchen that has been cooking on principle for two months. On the table: three plates. The third one has been there the whole time." },
      { who: "garr", show: ["garr"], text: "Sit. Coat off. Boots off. Hands off the bread until the bread is on the table. I'll say one sentence about being glad you're home, and then I'll be angry with you for one more." },
      {
        choice: [
          { text: "Set the table the way Mitia likes it", effects: [{ kind: "points", npc: "mitia", n: 20 }], goto: "table" },
          { text: "Put the butter on the wrong side of the bread", effects: [{ kind: "points", npc: "bowy", n: 20 }], goto: "butter" }
        ],
        who: "bin",
        show: ["bin", "garr"],
        text: "A tactical dinner formation. I remember those."
      },
      { label: "table" },
      { who: "mitia", show: ["mitia", "garr", "bowy"], text: "Rolls left, butter in the middle, pickles where Garr can't pretend not to see them. ...Perfect." },
      { goto: "journal" },
      { label: "butter" },
      { who: "bowy", show: ["bowy", "garr", "mitia"], text: "Butter's on the wrong side. Two months gone and you still do it. Good. You're really you." },
      { label: "journal" },
      { who: "garr", show: ["garr", "bowy", "mitia"], text: "While you were gone I kept a journal. Needed to count things with my hands. A woman selling cough drops at a price Mitia wouldn't touch. Travellers asking who's sick. Those coins." },
      { who: "bin", show: ["bin", "garr"], text: "So the question isn't 'how's the cough'. It's 'who's sick'. Someone outside town is trying to get medicine without anyone learning who they are." },
      { who: "mitia", show: ["mitia", "garr", "bowy"], text: "Then I hope they get it. I just wish they'd ask." },
      { who: "narrator", text: "Bin holds it together for exactly one more spoonful. Then he cries on the turnip. Bowy, who has been waiting two months for this, doesn't say a word. He just puts another turnip on Bin's plate." },
      { who: "narrator", text: "Three knocks at the door. Even. Patient. The kind of knock that doesn't belong to anyone you owe money to." },
      { who: "stranger", text: "Envelope. For the apothecary, not for you. And my employer would like the wolf man to know she knows he's home." },
      {
        choice: [
          { text: "Take the envelope and let them walk away", goto: "take" },
          { text: "Ask one question: who is your employer?", goto: "ask" },
          { text: "Block the door. Nobody threatens this table.", goto: "block" }
        ],
        who: "bin",
        show: ["bin", "garr"],
        text: "Garr puts down his spoon. Bowy puts down his knife."
      },
      { label: "take" },
      { who: "bin", face: "happy", text: "Envelope received. Tell whoever pays you that the wolf man eats his stew warm and reads his mail cold." },
      { goto: "end" },
      { label: "ask" },
      { who: "stranger", text: "One name? She prefers 'the Buyer'. She uses no other. Goodnight. Your stew is going cold, and I won't be blamed for it." },
      { goto: "end" },
      { label: "block" },
      { who: "narrator", text: "The stranger stops being polite. Two friends step out of the dark behind them." },
      { effects: [{ kind: "battle", encounter: "doorway" }] },
      { goto: "done" },
      { label: "end" },
      ...DINNER_END,
      { label: "done" }
    ]
  },
  {
    id: "dinnerDoorWin",
    bg: "home",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "The Buyer's people back off into the snow. The door is still on its hinges. The envelope is in Bin's hand. The stew is mostly warm." },
      ...DINNER_END
    ]
  },
  {
    id: "dinnerDoorLose",
    bg: "home",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "The scuffle spills into the snow. The Buyer's people vanish with most of the envelope. Bin is left holding a torn corner, a headache, and cold stew." },
      ...DINNER_END
    ]
  },

  // =========================================================================
  // Guild exams
  // =========================================================================
  {
    id: "examF",
    bg: "guild",
    once: false,
    lines: [
      { who: "tessa", show: ["tessa", "lysa"], text: "Enough points for Rank E. My field test is simple: a goblin chief has been raiding the Frostwood road. Beat him and his escort." },
      { who: "lysa", text: "He wears a crown made of spoons and he's VERY sensitive about it. Please don't laugh. Everybody who laughs ends up in my 'missing' drawer." },
      {
        choice: [
          { text: "Take the field test now", effects: [{ kind: "battle", encounter: "examF" }] },
          { text: "Not yet" }
        ]
      }
    ]
  },
  {
    id: "examFWin",
    bg: "guild",
    once: true,
    lines: [
      { who: "lysa", show: ["lysa", "tessa"], text: "You did it! And you brought back the spoon crown! I'm framing it. Rank E, Bin!" },
      { effects: [{ kind: "rankUp" }, { kind: "flag", key: "catacombsOpen", value: true }, { kind: "quest", id: "q9Catacombs" }] },
      { who: "tessa", text: "Rank E means the Guild lets you into the Old Temple Ruins. The old stone doorway at the far end of the Frostwood. Things come up out of there every thaw. Go find out why." },
      { who: "system", show: ["system"], text: "[CJS] Dungeon unlocked: the Old Temple Ruins. Floors 1-5: the Frozen Nave. Warning: guardian signature on floor 5. Three of them. Sort of." }
    ]
  },
  {
    id: "examE",
    bg: "guild",
    once: false,
    lines: [
      { who: "dain", show: ["dain", "lysa"], text: "So the ghost wants Rank D? Then the exam is me. A friendly spar. Try not to cry when you lose." },
      { who: "lysa", text: "It's a standard exam match. Nobody gets seriously hurt. Dain, that means you." },
      {
        choice: [
          { text: "Spar with Dain now", effects: [{ kind: "battle", encounter: "examE" }] },
          { text: "Not yet" }
        ]
      }
    ]
  },
  {
    id: "examEWin",
    bg: "guild",
    once: true,
    lines: [
      { who: "dain", show: ["dain"], text: "...Tch. Lucky swing. Fine! You passed. Don't get used to it." },
      { who: "mara", show: ["dain", "mara"], text: "He practised a 'congratulations' speech in case you won. I heard him. It had hand gestures." },
      { who: "dain", text: "...Congratulations. Next time I'm not holding back." },
      { effects: [{ kind: "rankUp" }, { kind: "points", npc: "dain", n: 60 }] }
    ]
  },
  {
    id: "examELose",
    bg: "guild",
    once: false,
    lines: [
      { who: "dain", show: ["dain"], text: "Ha! Told you. Come back when you've grown a few levels, ghost." },
      { who: "lysa", show: ["lysa"], text: "You can retake it whenever you're ready. Train a little. Eat something warm. Come back alive, that's the main rule." }
    ]
  },

  // =========================================================================
  // Old Temple Ruins
  // =========================================================================
  {
    id: "catacombsFirst",
    bg: "dungeon",
    music: "snow",
    once: true,
    lines: [
      { who: "system", show: ["system"], text: "[CJS] Entering: the Old Temple Ruins. Monsters are visible: bump into them to start a battle with the advantage. If they touch you first, they get it." },
      { who: "system", text: "[CJS] Stairs down lead deeper. Chests and ore veins appear on each floor. Every 5 floors a guardian waits; beat it and you can start from the next floor." }
    ]
  },
  {
    id: "floor5Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "The nave opens onto a frozen hall of broken pillars. Something with three heads breathes frost, fire and bad manners in the dark." },
      { who: "system", show: ["system"], text: "[CJS] Guardian: TEMPLE CHIMERA. Threat level: high. Recommended: Analyze it and hit the weakness. Not recommended: small talk." },
      { who: "bin", show: ["bin"], text: "Three heads. So three times the opinions. Okay, team. Let's do this properly." }
    ]
  },
  {
    id: "floor5Win",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "narrator", text: "The Temple Chimera falls. Behind it, a sealed door is carved with a cloaked girl holding a mask and a star. The seal has cracked." },
      { who: "peri", show: ["peri"], text: "...Huh. Nobody's opened that in a long time. Keep going, Jester. Carefully." },
      { who: "system", show: ["system"], text: "[CJS] Chapter complete: 'The First Seal'. The Drowned Cloister (floors 6-10) is open." },
      { effects: [{ kind: "gp", n: 60 }, { kind: "faith", n: 50 }, { kind: "flag", key: "chapter2", value: true }, { kind: "quest", id: "q11Knight" }, { kind: "quest", id: "q13Rival" }] }
    ]
  },
  {
    id: "sennaArrives",
    bg: "inn",
    music: "rampart",
    once: true,
    lines: [
      { who: "senna", show: ["senna"], text: "You. You are the one who felled the Temple Chimera. I am Senna. Some call me the Warring Princess. I prefer 'Senna'." },
      { who: "senna", text: "My father offered me a throne in the south. I asked if it came with enemies. He said no. So I came north, where the ruins bite back." },
      { who: "senna", text: "I would fight at your side. But I only follow someone the Guild trusts. Reach Rank D, and I will know your word is worth my spear." },
      { effects: [{ kind: "meet", npc: "senna" }, { kind: "flag", key: "metSenna", value: true }] }
    ]
  },
  {
    id: "sennaJoins",
    bg: "inn",
    music: "rampart",
    once: true,
    lines: [
      { who: "senna", show: ["senna"], text: "Rank D. Then I, Senna, lend you my spear. Until the ruins are quiet, or something better to fight appears." },
      { who: "bin", show: ["bin", "senna"], text: "Glad to have you. Fair warning: the job also involves a lot of turnips." },
      { who: "senna", text: "...Then I will learn to fight turnips." },
      { effects: [{ kind: "recruit", id: "senna" }, { kind: "points", npc: "senna", n: 60 }] },
      { who: "system", show: ["system"], text: "[CJS] Senna joined the party!" }
    ]
  },
  {
    id: "floor10Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "A throne of stolen caravan crates sits in the drowned cloister. On it lounges a goblin the size of a house, in a crown of real gold." },
      { who: "system", show: ["system"], text: "[CJS] Guardian: GOBLIN KING GRUKK. Commanding a horde. Recommended: end the king quickly." },
      { who: "bin", show: ["bin"], text: "The Frostwood's oldest joke. Let's make it stop being funny." }
    ]
  },
  {
    id: "floor10Win",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "narrator", text: "The Goblin King's crown rolls across the wet stone and stops at Bin's feet. Among the stolen crates: a dozen rude-candle coins, and a crate of cough medicine addressed to nobody." },
      { who: "system", show: ["system"], text: "[CJS] Chapter complete: 'Rank and File'. The Ember Vaults (floors 11-15) are open. Something down there is chanting." },
      { effects: [{ kind: "gp", n: 150 }, { kind: "faith", n: 100 }, { kind: "count", key: "candleCoins", n: 12 }, { kind: "flag", key: "chapter3", value: true }, { kind: "flag", key: "examD", value: true }] }
    ]
  },
  {
    id: "floor15Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "Candles burn with black flames. A robed figure turns from an altar, his face a skull wrapped in silk." },
      { who: "system", show: ["system"], text: "[CJS] Guardian: VESPER, VOICE OF THE JUDGE. Light-element attacks recommended." },
      { who: "peri", show: ["peri"], text: "He serves the Ethereal Judge. The one who thinks mortals should stay ordinary. Bin... be extraordinary. Just this once. It's for ratings." }
    ]
  },
  {
    id: "floor15Win",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "narrator", text: "Vesper's chant breaks into silence. The black candles gutter out one by one." },
      { who: "system", show: ["system"], text: "[CJS] Chapter complete: 'Into the Deep'. The Rift (floors 16-20) is open. Something vast is paying attention." },
      { effects: [{ kind: "gp", n: 300 }, { kind: "faith", n: 200 }, { kind: "flag", key: "chapter4", value: true }, { kind: "flag", key: "examC", value: true }] }
    ]
  },
  {
    id: "floor20Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "At the bottom of the Rift, the dark stands up. Robes like a courtroom. A face like a verdict." },
      { who: "system", show: ["system"], text: "[CJS] WARNING. Entity: HERALD OF THE ETHEREAL JUDGE. Jester privileges... insufficient. Recommendation: do it anyway." },
      { who: "peri", show: ["peri"], text: "Bin. Whatever happens — I'm glad it was you I picked. ...That's going in the highlight reel. Don't look at me." }
    ]
  },
  {
    id: "ending",
    bg: "havenGate",
    music: "main-menu",
    once: true,
    lines: [
      { who: "narrator", text: "The Herald breaks apart like a gavel hitting nothing. Beneath the Old Temple, the seals go quiet. For now." },
      { who: "peri", show: ["peri"], text: "Season finale, Jester. I could open a door and send you back to Earth for good. Lily, Leo, Meilin, Luna, the trash can. Your choice." },
      {
        choice: [
          { text: "\"Haven's home too. I'm not choosing. I'm commuting.\"", effects: [{ kind: "flag", key: "stayed", value: true }] },
          { text: "\"Not yet. There's a Buyer I still owe a conversation.\"", effects: [{ kind: "flag", key: "stayed", value: true }] }
        ]
      },
      { who: "peri", text: "Good answer. Terrible for my schedule. Great for ratings." },
      { effects: [{ kind: "gp", n: 1000 }, { kind: "flag", key: "endingSeen", value: true }] },
      { who: "system", show: ["system"], text: "[CJS] Season complete. Thank you for watching. The farm, Frostbitten and the ruins stay open: keep living in Haven. More episodes are being written." }
    ]
  },

  // =========================================================================
  // Jester Shop story purchases: calls with Lily on Earth
  // =========================================================================
  {
    id: "lilyCall1",
    bg: "earthHospital",
    music: "cove-town",
    once: true,
    lines: [
      { who: "peri", show: ["peri"], text: "Delivery for a Miss Lily Chen. One healing crystal, gift-wrapped in starlight. I even knocked. I never knock." },
      { who: "lily", show: ["lily"], text: "Bin-Bin? Why is your face on a floating phone made of stars? Are you in a CULT?" },
      { who: "bin", show: ["bin", "lily"], face: "happy", text: "It's a... work phone. Long story. How are you feeling?" },
      { who: "lily", text: "Good! The new crystal is warm. The nurse thinks it's a nightlight. I didn't correct her. Is it snowing where you are? You have snow in your hair." },
      { who: "bin", text: "A little snow. Eat your vegetables. Don't show the ward any more videos." },
      { who: "lily", text: "I'm showing them this one." }
    ]
  },
  {
    id: "lilyCall2",
    bg: "earthHospital",
    music: "cove-town",
    once: true,
    lines: [
      { who: "lily", show: ["lily"], text: "Bin-Bin! I walked to the end of the hallway and back! Twice! The nurse made a chart about it." },
      { who: "bin", show: ["bin", "lily"], face: "happy", text: "Twice? Show-off." },
      { who: "lily", text: "Meilin visited. She said you're doing 'the thing where you go quiet and funny at the same time'. What thing?" },
      { who: "bin", text: "No idea. Meilin says a lot of wise things. It's very annoying." },
      { who: "lily", text: "Also Luna came by. She didn't say much. She left a book about stars. Is she your girlfriend now?" },
      { who: "bin", face: "sad", text: "...Please don't tell the ward." }
    ]
  },
  {
    id: "lilyCall3",
    bg: "earthHospital",
    music: "cove-town",
    once: true,
    lines: [
      { who: "lily", show: ["lily"], text: "The doctors said a new word today. 'Stable.' They said it like it was a present." },
      { who: "bin", show: ["bin", "lily"], face: "sad", text: "Stable's a good word. Stable's my favourite word now." },
      { who: "lily", text: "You look tired, Bin-Bin. Are the people there nice to you?" },
      { who: "bin", face: "happy", text: "They're... family. There's a grumpy dad, a boar brother, and a sister who cries at soup. You'd like them." },
      { who: "lily", text: "Then tell them thank you for looking after you. And come home sometimes. Both homes. Deal?" },
      { who: "bin", text: "Deal." },
      { who: "peri", show: ["peri"], text: "...I'm not crying. The starlight is just very bright. Moving on." }
    ]
  }
];
