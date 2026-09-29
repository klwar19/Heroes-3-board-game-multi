import type { SceneDef, SceneLine } from "../engine/types";

/**
 * Main-story scenes (the Cosmic Jester story, Haven arc 1).
 * Speakers on stage are listed in `show` (tachie art); `face` sets Bin's
 * expression until the next Bin line; "system" lines are Jess, the Cosmic
 * Jester System's interface. A new game plays the prologue chain queued in
 * engine/state.ts; later scenes start from quests, triggers and battles.
 */

/** The end of the Eos trial, shared by the win and the (soft) loss. */
const EOS_AFTER: SceneLine[] = [
  { who: "narrator", text: "The next three days blur. Fetch quests. A cave with a very polite boss. A village where every villager says the same three lines, in the same order, forever." },
  { who: "narrator", text: "Bin finishes every trial quest out of pure spite. Peri watches all of it with popcorn." },
  { who: "system", show: ["system"], text: "[CJS] Trial reward unlocked: Eos Healing Crystal x1. Destination: ...Earth? Fine. The goddess signed off on it. Don't get sentimental, it's bad for my cooling." },
  { effects: [{ kind: "flag", key: "eosCrystal", value: true }] },
  { who: "narrator", text: "When the trial ends, Bin wakes up on his fold-out couch holding a warm crystal the size of a walnut. He goes to the hospital before his first class." }
];

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
  // Prologue: Earth
  // =========================================================================
  {
    id: "p0Bracelet",
    outfit: "earth",
    bg: "earthBookstore",
    music: "cove-town",
    once: true,
    lines: [
      { who: "narrator", text: "Zhonghai. Six years ago. Old Zhou's second-hand bookstore smells of dust, instant coffee and other people's childhoods." },
      { who: "narrator", text: "Fourteen-year-old Bin Chen spends every Saturday here. So does Zhao Lingwei — Ling Ling — who reads wuxia novels like they owe her money." },
      { who: "lingling", text: "You drew all this? Frozen forests. A guild hall. A half-orc with a crossbow..." },
      { who: "bin", text: "It's a world I keep dreaming about. Don't laugh." },
      { who: "lingling", text: "I'm not laughing." },
      { who: "narrator", text: "She looks for a long time at one drawing: an armoured girl standing on a cliff of ice. She doesn't say why." },
      { who: "narrator", text: "Fifteen: the Saturdays thin out. A cousin named Zhao Kang starts waiting at the door. Old Zhou says, 'She used to laugh. Now she performs.'" },
      { who: "narrator", text: "Seventeen: Bin saves up for three weeks and buys a cheap bracelet with a little star charm on it." },
      { who: "bin", text: "Ling Ling. I like you. That's... that's the whole speech. I practised a longer one. It was worse." },
      { who: "narrator", text: "For one second, she almost says yes. Then she sees Zhao Kang across the street, watching, phone raised." },
      { who: "lingling", text: "You? Seriously? Everyone, look — Bracelet Boy thinks he's in a drama." },
      { who: "narrator", text: "The star charm snaps, bounces twice and rolls under a parked car. 'Bracelet Boy' trends for a week." },
      { who: "narrator", text: "He doesn't go to school for three days. On day two, Leo shows up with an entire roast duck. Meilin shows up with a spare key and no questions." },
      { who: "narrator", text: "On day four, someone has written BRACELET BOY — BIGEST LOSER across his locker." },
      { who: "bin", face: "happy", text: "You misspelled 'biggest'. Two G's. If you're going to bully me, at least respect the dictionary." },
      { who: "narrator", text: "The hallway laughs. With him, this time. That is the day Bin learns the Ling Ling Rule: if you're already the joke, own the punchline." }
    ]
  },
  {
    id: "p1Kfc",
    outfit: "earth",
    bg: "earthKfc",
    music: "cove-town",
    once: true,
    lines: [
      { who: "narrator", text: "The present. Bin Chen, 20: delivery rider, part-time student, full-time big brother. Tonight: a discount bucket of fried chicken and the ashes of another failed attempt to say hi to Luna Park." },
      { who: "bin", show: ["bin"], text: "Here we see the delivery boy in his natural habitat, eating his feelings under fluorescent light. Nature is beautiful. Nature is also broke." },
      { who: "chad", text: "Yo chat! Check out this specimen! Eating alone, looking sad, probably never touched a girl. Bro — give us your best pickup line. Let's see how pathetic you are!" },
      { who: "narrator", text: "Twenty viewers. A phone shoved in his face. He could leave. Instead he swallows, wipes his mouth, and looks into the camera with the calm of a man who has seen the void, and the void laughed first." },
      {
        choice: [
          { text: "Chemistry: \"Are you made of copper and tellurium? Because you're Cu-Te.\"", effects: [{ kind: "flag", key: "kfcLine", value: 1 }] },
          { text: "Honesty: \"My personality is an acquired taste. Like durian. Or self-loathing.\"", effects: [{ kind: "flag", key: "kfcLine", value: 2 }] },
          { text: "Sincerity: \"Ask her how her day was. Then actually listen to the answer.\"", effects: [{ kind: "flag", key: "kfcLine", value: 3 }] }
        ],
        who: "bin",
        text: "Best pickup line? Okay. Here it goes."
      },
      { who: "chad", text: "...Bro. BRO. Chat is just typing question marks." },
      { who: "bin", face: "happy", text: "And if she's still there after that, you've found either a keeper or a serial killer. Either way, it's an adventure." },
      { who: "narrator", text: "The clip goes viral overnight. By Monday, half the campus calls him 'The Durian Prince'." },
      { who: "luna", bg: "earthCampus", show: ["luna"], text: "The livestream. You took his platform and made him the straight man in your comedy routine." },
      { who: "luna", text: "It was... strategically brilliant. If you applied that thinking to anything productive, you might actually be dangerous." },
      { who: "narrator", text: "She doesn't smile. She doesn't invite him to sit. She also doesn't tell him to leave. Bin retreats before he can ruin it." }
    ]
  },
  {
    id: "p2Ward",
    outfit: "earth",
    bg: "earthHospital",
    music: "cove-town",
    once: true,
    lines: [
      { who: "narrator", text: "Zhonghai People's Hospital, pediatric ward. Bin's little sister Lily has been here longer than some of the nurses." },
      { who: "lily", show: ["lily"], text: "—and THEN he says, 'my personality is an acquired taste, like durian!' Wait, do the face again, I'll pause it—" },
      { who: "bin", show: ["bin", "lily"], text: "Lily. What are you doing." },
      { who: "lily", text: "Bin-Bin! I'm showing everyone your video! You're famous!" },
      { who: "nurse", text: "She's played it for two days straight. The other kids keep requesting it. You're the ward's unofficial comedian now." },
      { who: "bin", face: "sad", text: "You're exploiting my trauma for social credit." },
      { who: "lily", text: "You're welcome. Also, everyone wants to know if you have a girlfriend. I said no, because you're too scared to talk to Luna." },
      { who: "bin", face: "sad", text: "We talked about this. No sharing my romantic failures with the entire pediatric ward." },
      { who: "lily", text: "Bin-Bin, if I can't share, what's the point of having an embarrassing older brother?" },
      { who: "narrator", text: "On his way out, a seven-year-old boy with a bald head tugs his sleeve and asks for a pickup line, 'for when I get out of here'." },
      { who: "bin", text: "Here's the secret. The best pickup line is asking someone how their day was. And actually listening to the answer." },
      { who: "narrator", text: "'That's not funny,' the boy says." },
      { who: "bin", face: "happy", text: "No. But it works." },
      { who: "narrator", text: "At the front desk, billing slides him another envelope. Bin folds it very small, as if that makes the number smaller." }
    ]
  },
  {
    id: "p3TrashCan",
    outfit: "earth",
    bg: "earthCampus",
    music: "cove-town",
    once: true,
    lines: [
      { who: "jake", show: ["jake"], text: "The internet sensation. Tell me, how does it feel to be famous for being pathetic?" },
      { who: "bin", show: ["bin", "jake"], text: "Jake, if you're going to insult me, bring new material. 'Pathetic' is getting stale. The audience wants growth." },
      { who: "jake", text: "You're still the same broke loser whose sister is rotting in a hospital because you can't afford real treatment." },
      { who: "narrator", text: "Something cold settles in Bin's chest. He doesn't let it reach his face." },
      { who: "bin", face: "angry", text: "That's cute. Did you have to google 'emotional vulnerability' for that one? Your search history must be tragic." },
      { who: "narrator", text: "Jake stalks off, fists clenched. Too many witnesses. Leo and Meilin arrive in time for the aftermath." },
      { who: "bin", show: ["bin", "leo", "meilin"], text: "Classic Jake. Threatens murder, won't risk detention. Honestly, I respect his commitment to the 'ineffective villain' archetype." },
      { who: "narrator", text: "The wind changes direction. Twenty metres away, Jake hears every word." },
      { who: "jake", show: ["jake"], text: "BIN!" },
      { who: "bin", text: "Ah. Run." },
      { who: "narrator", text: "The chase would be embarrassing in a cartoon. A raised paver. A stumble. A janitor's wheeled trash can in exactly the wrong place." },
      { who: "narrator", text: "Bin goes over the rim at an angle that would make a physics professor weep. The can wobbles. Stays up for one hopeful moment. Tips. Rolls twice. His legs stick out of the top, twitching." },
      { who: "narrator", text: "Phones come out. And because the universe has a sick sense of humour, Luna Park walks out of the science building." },
      { who: "luna", show: ["luna"], text: "Is this another dating strategy? Because if so, I have to admit — it's certainly memorable." },
      { who: "bin", face: "sad", text: "I can explain." },
      { who: "luna", text: "I'm sure you can. I'm also sure I don't want to hear it. ...The durian line was funnier." },
      { who: "leo", show: ["leo", "meilin"], text: "Oh my god. Oh my god, this is going everywhere. Any words for your fans, Durian Prince?" },
      { who: "meilin", text: "Leo. Put the phone down and grab the other side of the can." },
      { who: "bin", show: ["bin"], face: "angry", text: "You know what? I've taken it. The bullying, the bills, the TRASH CAN — literally, the trash can! If there's any god out there with a SPARK of humour or decency — SHOW YOURSELF!" },
      { who: "narrator", text: "Silence." },
      { who: "bin", face: "sad", text: "I'm not asking for money. I'm not asking for Luna to notice me. Just... Lily. Let her get better. That's it. That's the whole thing." },
      { who: "narrator", text: "The sky does nothing. No thunder. No light. Just pigeons, and the sound of somebody's phone still recording." },
      { who: "narrator", text: "Bin showers for forty-five minutes and is face-down on his fold-out couch by 9:47 PM. Through the wall, a sitcom laugh track plays. At least his life doesn't have one of those." }
    ]
  },
  {
    id: "p4Goddess",
    outfit: "earth",
    bg: "earthApartment",
    music: "main-menu",
    once: true,
    lines: [
      { who: "narrator", text: "Bin wakes up because someone is scrolling through his phone. He doesn't own a phone that glows like that. And there is a girl sitting cross-legged on his floor." },
      { who: "peri", show: ["peri"], text: "Wow. Just... wow. 'How to get someone out of your system when you can't afford therapy.' 'Cheapest protein that isn't eggs.' This is a level of tragic that should be studied." },
      { who: "bin", show: ["bin", "peri"], text: "I'm dreaming." },
      { who: "peri", text: "Cliché." },
      { who: "bin", text: "I'm hallucinating from the trash can." },
      { who: "peri", text: "Possible, but no." },
      { who: "narrator", text: "Her twin tails float in a breeze that doesn't exist. Her eyes hold galaxies. Actual galaxies, turning slowly." },
      { who: "peri", text: "I'm Peri. Goddess of Narrative Convenience, Cosmic Observer and Professional Troll. Also your new boss. Your passcode is 1234, by the way. Even for a mortal, that's embarrassing." },
      { who: "peri", text: "I've watched you since the shopping cart incident. Out of nowhere, back of the knees, down like a sack of potatoes. You sat there thirty seconds and said: 'Well.' That's when I knew." },
      { who: "bin", text: "...That shopping cart came out of nowhere." },
      { who: "peri", text: "Mhm." },
      { who: "bin", face: "angry", text: "Was that you?" },
      { who: "peri", text: "Maybe. It was REALLY funny. Top five in three thousand years. We're not counting. I'm not apologising." },
      { who: "peri", text: "So, the deal. Not a champion — too noble, too many speeches. A Jester. You travel between worlds, finish quests, get stronger, and generate content. Your suffering is my entertainment." },
      { who: "peri", text: "In exchange: power. Skills, items, worlds you can't imagine. And eventually? Enough to fix your sister." },
      { who: "bin", face: "angry", text: "Don't. Don't dangle Lily like a carrot. That's the one thing you don't get to joke about." },
      { who: "narrator", text: "For one frame, the goddess goes still. The floating twin tails settle, like a breeze dying." },
      { who: "peri", text: "I'm not joking. Most mortals want power for power. You want your sister to stop hurting. That's the most serious thing I've heard in a very long time." },
      { who: "peri", text: "...But your face just now? Highlight reel." },
      { who: "peri", text: "Smart jesters read the fine print, so: a free trial. Three days, one world, no contract. If you come back, you decide. You're already smarter than the last twelve candidates." },
      { who: "bin", face: "sad", text: "The last TWELVE—" },
      { who: "narrator", text: "She kicks him square in the chest with a platform boot, and the world explodes into light." },
      { who: "narrator", text: "Behind him, Peri sits back down on his floor and opens a new file on her starlight phone: THE CHRONICLES OF BIN CHEN — SEASON ONE. Then a bag of cosmic popcorn." }
    ]
  },
  {
    id: "p5Eos",
    outfit: "earth",
    bg: "eosMeadow",
    music: "grass",
    once: true,
    lines: [
      { who: "narrator", text: "Eos. Rolling green hills, a tidy village of identical red roofs, a round forest, a cave that is exactly cave-shaped. The clouds are symmetrical. Everything is slightly too perfect." },
      { who: "bin", show: ["bin"], text: "It's a tutorial zone. I've played this. The first NPC is going to be very excited about slimes." },
      { who: "system", show: ["bin", "system"], text: "[CJS] Cosmic Jester System v0.9 (trial) booting... User: Bin Chen. Class: Jester. Level 1. Ugh. You're the new one?" },
      { who: "bin", text: "The status window has an attitude." },
      { who: "system", text: "The status window has a NAME. I'm Jess, the System's interface. Stats, quests, the shop, your Jester Points. I do the reading so the goddess doesn't have to. Don't make it weird." },
      { who: "system", text: "[CJS] Basics: Jester Points (JP) come from quests, creativity and comedic timing. JP buys skills and items in the Jester Shop. Skills carry between worlds at reduced strength. Dying is paperwork. Avoid it." },
      { who: "system", text: "[CJS] Tutorial quest: defeat 2 Tutorial Goblins. Tip: use Analyze first. It's free, like my advice, which is also priceless." },
      { who: "narrator", text: "Two goblins stroll out of the perfect forest, bow politely, and raise their clubs." },
      { effects: [{ kind: "battle", encounter: "eosTrial" }] }
    ]
  },
  {
    id: "p6EosWin",
    outfit: "earth",
    bg: "eosMeadow",
    music: "grass",
    once: true,
    lines: [
      { who: "system", show: ["system"], text: "[CJS] Tutorial complete. Rating: 'fine'. The goddess says the part where the goblin bowed back at you was the highlight." },
      ...EOS_AFTER
    ]
  },
  {
    id: "p6EosLose",
    outfit: "earth",
    bg: "eosMeadow",
    music: "grass",
    once: true,
    lines: [
      { who: "system", show: ["system"], text: "[CJS] You lost to a tutorial goblin. The goblin is embarrassed for you. The goddess has rewatched it nine times." },
      { who: "system", text: "[CJS] Tutorial auto-cleared out of pity. Moving on. Nobody will ever mention this again. (I will mention this again.)" },
      ...EOS_AFTER
    ]
  },
  {
    id: "p7NextDay",
    outfit: "earth",
    bg: "earthCampus",
    music: "cove-town",
    once: true,
    lines: [
      { who: "leo", show: ["leo", "meilin"], text: "Bro. You okay? You've been staring at that wall for five minutes." },
      { who: "meilin", text: "You're doing the thing where your brain leaves your body. What happened?" },
      { who: "bin", show: ["bin", "leo", "meilin"], text: "Didn't sleep well. Had a weird... work trial." },
      { who: "meilin", text: "Also, weird question. Did something happen with Luna? I saw her watching you across the quad. Really watching. Not her usual ice-queen glare. Something different." },
      { who: "narrator", text: "Bin's heart skips. He doesn't know that the people who use Luna's gift have noticed him. That she is trying to warn him without getting close." },
      { who: "lily", bg: "earthHospital", show: ["lily"], text: "Bin-Bin. The doctors say my numbers are weird today. Good weird. And I slept the whole night. The WHOLE night." },
      { who: "bin", show: ["bin", "lily"], face: "happy", text: "Must be the durian energy." },
      { who: "lily", text: "Must be." },
      { who: "narrator", text: "The crystal sits on her windowsill between two drawings, glowing faintly. Nobody else seems to notice that it glows." }
    ]
  },
  {
    id: "p8Contract",
    outfit: "earth",
    bg: "earthApartment",
    music: "main-menu",
    once: true,
    lines: [
      { who: "peri", show: ["peri"], text: "So? Trial's over. Numbers went up, sister slept, you only cried once. Contract time." },
      { who: "system", show: ["peri", "system"], text: "[CJS] Terms. One: travel between worlds and complete narratively significant quests. Two: generate entertaining content. Your suffering is a feature, not a bug." },
      { who: "system", text: "[CJS] Three: earn JP for quests, creativity and comedic timing. Four: spend JP in the Jester Shop. Five: skills carry between worlds at reduced effect. Six: no permanent death. Not without dramatic impact." },
      { who: "peri", text: "In exchange: power. And healing crystals for a certain ten-year-old, delivered by an extremely punctual goddess." },
      { who: "bin", show: ["bin", "peri"], text: "...Where do I sign?" },
      { who: "peri", text: "Thumbprint. Blood is so last millennium." },
      { effects: [{ kind: "flag", key: "contract", value: true }, { kind: "ap", n: 3 }] },
      { who: "system", show: ["system"], text: "[CJS] Contract signed. Starting JP: 3. Reviewing past footage for a retroactive content bonus..." },
      { if: { kind: "flag", key: "kfcLine", value: 1 }, goto: "cute" },
      { if: { kind: "flag", key: "kfcLine", value: 2 }, goto: "durian" },
      { who: "system", text: "[CJS] 'Ask her how her day was.' Sincerity bonus: +2 JP. The goddess cried. She denies it. She is denying it right now, loudly." },
      { effects: [{ kind: "ap", n: 2 }] },
      { goto: "portal" },
      { label: "cute" },
      { who: "system", text: "[CJS] 'Cu-Te.' A chemistry pun on a live stream. Bonus: +1 JP. Puns are cheap. So are you." },
      { effects: [{ kind: "ap", n: 1 }] },
      { goto: "portal" },
      { label: "durian" },
      { who: "system", text: "[CJS] 'Like durian. Or self-loathing.' Self-deprecation: our core demographic. Bonus: +2 JP." },
      { effects: [{ kind: "ap", n: 2 }] },
      { label: "portal" },
      { who: "peri", show: ["peri"], text: "Your first real world is called Haven. Cold place. Good people. Terrible wolves. Try to make an entrance." },
      { who: "narrator", text: "The portal opens. Cold air. Pine and snow and woodsmoke. Somewhere, a crossbow string, a fire, and someone saying his name." },
      { who: "bin", show: ["bin", "peri"], text: "This feels like going back." },
      { who: "peri", text: "Interesting choice of words. Most people say 'going forward'." },
      { who: "narrator", text: "She kicks him through." }
    ]
  },

  // =========================================================================
  // Haven, Chapter 1: Snow on the Road Home
  // =========================================================================
  {
    id: "h1Road",
    bg: "havenRoad",
    music: "snow",
    once: true,
    lines: [
      { who: "narrator", text: "The portal spits him into knee-deep snow and closes with the dignified silence of someone pretending the queue wasn't long." },
      { who: "narrator", text: "The Frostwood. Snow-heavy pines. A burned mile-marker. And the very strange feeling that he knows exactly which way town is." },
      { who: "bin", show: ["bin"], text: "I know this road. How do I know this road? Frozen forest, a guild, a half-orc with a crossbow... I DREW this. In my notebook. When I was a kid." },
      { who: "system", show: ["bin", "system"], text: "[CJS] World: Haven. Region: the Frostwood, outside the settlement of Frostbitten. Local records: User reported missing two months ago. ...Missing? From HERE?" },
      { who: "peri", show: ["bin", "peri"], text: "Welcome home, kid. Your composure has been refunded in unmarked snow. And the rest is above your pay grade. For now." },
      { who: "bin", face: "angry", text: "'Welcome HOME'?" },
      { who: "peri", text: "Spooky, right? Anyway! Mind the wolf." },
      { who: "narrator", text: "Something winks under the snow by his boot: a coin. Heavier than copper, paler than silver, stamped with a hand holding a candle. The candle is somehow rude about it." },
      { who: "system", show: ["system"], text: "[CJS] Logged: 'Rude-Candle Coin'. Classification: unknown, possibly cursed, probably just awkward. I'll keep count. You'll lose them otherwise." },
      { effects: [{ kind: "count", key: "candleCoins", n: 1 }] },
      { who: "narrator", text: "A branch cracks uphill. Then another, closer. Yellow eyes. Frost-crusted fur. The kind of wolf that has been waiting all winter for a slow person to fall out of the sky." },
      { who: "peri", show: ["peri"], text: "Frost wolf. Skinny, so hungry and not careful. Show me something good, Jester." },
      { effects: [{ kind: "battle", encounter: "havenWolf" }] }
    ]
  },
  {
    id: "h1WolfWin",
    bg: "havenRoad",
    music: "snow",
    once: true,
    lines: [
      { who: "narrator", text: "The wolf limps off into the pines to rethink its life choices." },
      { who: "bin", show: ["bin"], face: "happy", text: "My sword arm remembers more than I do. I'll take it. Tell the wolf to forward its complaints to management." },
      { who: "peri", show: ["bin", "peri"], text: "Management is me. Complaint denied. Walk, Jester. Your welcome party is the expensive part." }
    ]
  },
  {
    id: "h1WolfLose",
    bg: "havenRoad",
    music: "snow",
    once: true,
    lines: [
      { who: "narrator", text: "Bin eats snow. The wolf eats his left sleeve. Both retreat, embarrassed." },
      { who: "system", show: ["system"], text: "[CJS] The goddess has clipped that for the highlight reel. You're welcome. Please walk towards the lights before something else gets hungry." }
    ]
  },
  {
    id: "h1Gate",
    bg: "havenGate",
    music: "snow",
    once: true,
    lines: [
      { who: "narrator", text: "Frostbitten: a log palisade, braziers and woodsmoke at the edge of the Frostwood. A small town holding on with both hands." },
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
      { who: "guard", text: "Garr's boy?! Sorry — sir — we thought you were dead. That came out faster than I meant it to." },
      { who: "guard", text: "Your father's been pulling double shifts on this gate for two months because he doesn't know how to sit down. Go home. Please. Before somebody starts crying on duty." },
      { who: "system", show: ["system"], text: "[CJS] Also: a second rude-candle coin in the gate's lost-and-found tin. Unclaimed. Logged." },
      { effects: [{ kind: "count", key: "candleCoins", n: 1 }] },
      { goto: "end" },
      { label: "mug" },
      { who: "narrator", text: "Light leaks under the Mug's back door, along with a spirited theory that Bin died face-first in a foreign sea. Another voice: face-first into a portal, more dramatic." },
      { who: "host", text: "Two months, no body, and his old sword still hangs over my fireplace. Either he's alive or someone's running a very strange long con. ...Oh. It's you. Soup. On the house. Sit before you fall." },
      { who: "host", text: "And this was on the floor of my back corridor. Nobody's claimed it. Tastes wrong. Don't ask how I know." },
      { effects: [{ kind: "count", key: "candleCoins", n: 1 }] },
      { label: "end" },
      { who: "narrator", text: "Whichever way he came in, the news runs ahead of him on faster legs. Frostbitten gossips faster than it shovels." }
    ]
  },
  {
    id: "h1Home",
    bg: "home",
    music: "rampart",
    once: true,
    lines: [
      { who: "narrator", text: "Garr's hut sits at the edge of Frostbitten, where the town gives up and the pines begin. The door opens before he can knock." },
      { who: "narrator", text: "Bowy punches him in the shoulder (affectionate). Then hugs him (aggressive). Then holds him at arm's length." },
      { who: "bowy", show: ["bowy"], text: "WHERE. HAVE. YOU. BEEN." },
      { who: "bin", show: ["bin", "bowy"], text: "Would you believe... a very long delivery shift?" },
      { who: "bowy", text: "No." },
      { who: "mitia", show: ["bin", "mitia", "bowy"], text: "B-Bin? You're... you're really..." },
      { who: "narrator", text: "Mitia bursts into tears, tries to pretend she didn't, gives up, and hugs him with both arms." },
      { who: "narrator", text: "Garr stands by the hearth. One eye milky white, the other sharp as a blade. There is relief in it, and suspicion, and something like a man who has been expecting this for years." },
      { who: "garr", show: ["garr", "bin"], text: "You're late for dinner. Two months late." },
      { who: "bin", text: "Traffic." },
      { who: "narrator", text: "He remembers this room. Not all of it. Woodsmoke and dried meat, a third bunk under the window, a crossbow named Thunder on the wall. It's like reading his own notebook in someone else's handwriting." },
      { who: "garr", text: "We'll talk. Not tonight. Tonight you sleep in your own bunk." },
      { who: "garr", text: "Tomorrow, two things. One: there's a door at the back of this hut that wasn't there this morning. It opens onto a meadow where it's spring. I don't like it. You figure it out." },
      { who: "garr", text: "Two: the Guild filed you as dead. Corvin will want forms. In triplicate." },
      { who: "bowy", show: ["bowy", "bin"], text: "And when you leave this hut, I'm coming with you. Not asking." },
      { effects: [{ kind: "meet", npc: "garr" }, { kind: "meet", npc: "bowy" }, { kind: "meet", npc: "mitia" }, { kind: "recruit", id: "bowy" }, { kind: "item", id: "seed-turnip", n: 10 }, { kind: "quest", id: "q1Farm" }, { kind: "quest", id: "q2Guild" }] },
      { who: "peri", show: ["peri"], text: "Filed under 'family, emotionally expensive'. Sleep, Jester. Tomorrow's episode has paperwork." },
      { who: "narrator", text: "He sleeps like a dropped log. Morning comes too early, the way it does in the north." }
    ]
  },
  {
    id: "farmArrive",
    bg: "farm",
    music: "grass",
    once: true,
    lines: [
      { who: "system", show: ["system"], text: "[CJS] Location: POCKET HAVEN. A pocket dimension folded behind Garr's back door. Always growing weather. Condition: freshly generated, therefore full of weeds. And rocks. Don't ask me why a new dimension has rocks." },
      { who: "peri", show: ["peri"], text: "Housewarming gift! Frostbitten only thaws for a few weeks a year, and a Jester needs a stage. Grow things, ship things, make me proud. It follows the seasons, for realism." },
      { who: "bin", show: ["bin", "system"], text: "Right. Step one of every farming game: clear the junk, till the soil, plant the cheapest seeds." },
      { who: "system", text: "[CJS] Tutorial: pick a tool on the hotbar (1-5), then click a field tile next to you. Sickle clears weeds, Hammer breaks stones, Axe chops branches and stumps, Hoe tills, Watering Can waters. Refill the can at the pond." },
      { who: "system", text: "[CJS] Crops grow one stage each night they were watered. Put harvests in the shipping crate: they sell overnight. Sleep in the hut to end the day and save. Menu: Esc / ☰ (Quests, Bag, Party, Jester)." }
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
