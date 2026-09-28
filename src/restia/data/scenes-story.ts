import type { SceneDef } from "../engine/types";

/**
 * Main-story scenes. Speakers on stage are listed in `show` (tachie art);
 * "system" lines render as the System's holographic window.
 */
export const STORY_SCENES: SceneDef[] = [
  {
    id: "intro",
    bg: "dawnGate",
    once: true,
    lines: [
      { who: "narrator", text: "The last thing Bin remembers is a three-hour board game session, a cold cup of coffee, and a notification that said 'You have been selected.'" },
      { who: "narrator", text: "The next thing he knows, he is lying in wet grass beneath an enormous stone gate, and the sky is the colour of a sunrise someone designed very carefully." },
      { who: "hikari", show: ["hikari"], text: "He's awake! He's AWAKE! Oh thank goodness, the summoning worked! Hello! Welcome to Restia! I'm Hikari, Goddess of Dawn!" },
      { who: "bin", show: ["hikari"], text: "...Am I dead? Is this the part where you give me a cheat skill and a tragic backstory?" },
      { who: "hikari", show: ["hikari"], text: "Not dead! Summoned! And about the cheat skill... I may have spent my entire investiture on the Dawn Gate. So I'm, um. Broke. Divinely broke." },
      { who: "system", text: "[SYSTEM] Administrator access granted. Welcome, User: Bin. Status: Otherworlder, Level 1." },
      { who: "bin", show: ["hikari"], text: "Okay, I have a floating status window. That's actually kind of amazing." },
      { who: "hikari", show: ["hikari"], text: "The world down here is being eaten by Calamity Waves. The old capital's catacombs spit monsters every season. Villages empty out. Nobody prays at my shrines anymore..." },
      { who: "hikari", show: ["hikari"], text: "So I need a hero! A hero who can bring a village back to life, make people smile, and maybe, just maybe, get some prayers flowing so I can afford rent in heaven again." },
      {
        choice: [
          { text: "\"Sure. I've always wanted to play the farming route.\"", effects: [{ kind: "points", npc: "hikari", n: 30 }] },
          { text: "\"Do I get paid?\"", effects: [{ kind: "points", npc: "hikari", n: 10 }] },
          { text: "\"Can you send me home?\"", goto: "home" }
        ],
        who: "hikari",
        show: ["hikari"],
        text: "Will you help me?"
      },
      { goto: "deed" },
      { label: "home" },
      { who: "hikari", show: ["hikari"], text: "I... can't. Not until I get my investiture back. I'm sorry. I promise I'll make it up to you. Every single dawn." },
      { label: "deed" },
      { who: "hikari", show: ["hikari"], text: "Here! The deed to an abandoned farm in Dawnhollow village, just down the hill. It came with the summoning package. Also ten turnip seeds. Also my eternal gratitude." },
      { effects: [{ kind: "meet", npc: "hikari" }, { kind: "item", id: "seed-turnip", n: 10 }, { kind: "quest", id: "q1Farm" }, { kind: "quest", id: "q2Guild" }] },
      { who: "system", text: "[SYSTEM] Quest added: 'A Farm of One's Own'. Quest added: 'The Adventurers' Guild'. Tip: open the menu (Esc / ☰) for Quests, Bag and Party." },
      { who: "bin", show: ["hikari"], text: "A farm, a guild and a broke goddess. Alright, Restia. Let's play." }
    ]
  },
  {
    id: "farmArrive",
    bg: "farm",
    once: true,
    lines: [
      { who: "system", text: "[SYSTEM] Location: Dawnhollow Farm. Condition: neglected. Weeds: many. Rocks: also many." },
      { who: "bin", text: "Right. Step one of every farming game: clear the junk, till the soil, plant the cheapest seeds." },
      { who: "system", text: "[SYSTEM] Tutorial: pick a tool on the hotbar (1-6), then click a field tile next to you. Sickle clears weeds, Hammer breaks stones, Axe chops branches and stumps, Hoe tills, Watering Can waters. Refill the can at the pond." },
      { who: "system", text: "[SYSTEM] Crops grow one stage each night they were watered. Put harvests in the shipping bin: they sell overnight. Sleep in the farmhouse to end the day and save." }
    ]
  },
  {
    id: "guildRegister",
    bg: "guild",
    once: true,
    lines: [
      { who: "guildGirl", show: ["guildGirl"], text: "Welcome to the Adventurers' Guild, Dawnhollow branch! Population: me. Um. And now you, if you're registering?" },
      { who: "bin", show: ["guildGirl"], text: "I'm registering. Bin. Otherworlder. Farmer. Apparently a hero." },
      { who: "guildGirl", show: ["guildGirl"], text: "Otherworlder! We haven't had one of those in two hundred years! I'm Elise. Let me just... stamp... there! Rank F, like everyone starts." },
      { who: "guildGirl", show: ["guildGirl"], text: "Requests go up on the board every morning. Finish them for coin and Guild Points. Earn enough points and you can take the rank exam." },
      { who: "guildGirl", show: ["guildGirl"], text: "And please. Whatever the older adventurers say. Do not laugh at goblins." },
      { effects: [{ kind: "meet", npc: "guildGirl" }, { kind: "flag", key: "registered", value: true }, { kind: "points", npc: "guildGirl", n: 20 }] },
      { who: "system", text: "[SYSTEM] Guild rank F acquired. Requests unlocked. Daily System Missions unlocked: complete them for Admin Points (AP) and spend AP in the Admin Console." }
    ]
  },
  {
    id: "meetPip",
    bg: "store",
    once: true,
    lines: [
      { who: "pip", show: ["pip"], text: "A customer! An actual paying customer! Welcome to Pip's General Store, the only store in Dawnhollow and therefore the best!" },
      { who: "pip", show: ["pip"], text: "Seeds for the season, tools, a little of everything. And I buy anything you can carry in. Anything. Try me." },
      { effects: [{ kind: "meet", npc: "pip" }] }
    ]
  },
  {
    id: "meetNell",
    bg: "forest",
    once: true,
    lines: [
      { who: "narrator", text: "An arrow whistles past Bin's ear and pins a goblin's cap to a tree. The goblin shrieks and flees." },
      { who: "nell", show: ["nell"], text: "Ha! You're welcome. You were about to get stabbed by a goblin wearing a teapot. Embarrassing." },
      { who: "bin", show: ["nell"], text: "I had it under control." },
      { who: "nell", show: ["nell"], text: "Sure you did, farm boy. Name's Nell. These woods are my hunting grounds, so try not to trample the mushrooms." },
      {
        choice: [
          { text: "\"Thanks for the save. Really.\"", effects: [{ kind: "points", npc: "nell", n: 30 }] },
          { text: "\"Are those ears real?\"", effects: [{ kind: "points", npc: "nell", n: -10 }] }
        ]
      },
      { who: "nell", show: ["nell"], text: "Hmph. Monsters get friendlier if you beat them fair and square and offer a treat, you know. If you ever build a barn, some of them might follow you home." },
      { effects: [{ kind: "meet", npc: "nell" }, { kind: "flag", key: "metNell", value: true }] }
    ]
  },
  {
    id: "meetMina",
    bg: "forest",
    once: true,
    lines: [
      { who: "narrator", text: "Deeper in the glade, someone is crouched over a patch of glowing mushrooms, muttering to them." },
      { who: "mina", show: ["mina"], text: "-and if you glow a little brighter I'll give you the good compost- oh! A person! I, um, I wasn't talking to mushrooms." },
      { who: "bin", show: ["mina"], text: "They seemed to be enjoying the conversation." },
      { who: "mina", show: ["mina"], text: "R-really? I'm Mina. I'm an alchemist. Travelling alchemist. Homeless alchemist, technically. My last atelier exploded. Only a little!" },
      { who: "mina", show: ["mina"], text: "If Dawnhollow had a workshop, I could brew potions for the village. Healing potions, fertilizer, even bombs. Useful bombs!" },
      { effects: [{ kind: "meet", npc: "mina" }, { kind: "flag", key: "metMina", value: true }, { kind: "quest", id: "q6Atelier" }] },
      { who: "system", text: "[SYSTEM] Quest added: 'The Alchemist in the Woods'. Build an Atelier on the village Restoration Board." }
    ]
  },
  {
    id: "meetTove",
    bg: "village",
    once: true,
    lines: [
      { who: "narrator", text: "A wagon rattles into the plaza, pulled by a very tired pony and pushed by a very un-tired dwarf." },
      { who: "tove", show: ["tove"], text: "OI! Is this Dawnhollow? The one with the monster-infested catacombs and no blacksmith? Perfect! I'm Tove! I forge things!" },
      { who: "bin", show: ["tove"], text: "You sound excited about the monster part." },
      { who: "tove", show: ["tove"], text: "Monsters mean adventurers, adventurers mean broken swords, broken swords mean business! Give me a smithy and I'll give you steel that sings." },
      { effects: [{ kind: "meet", npc: "tove" }, { kind: "flag", key: "metTove", value: true }, { kind: "quest", id: "q7Smithy" }] },
      { who: "system", text: "[SYSTEM] Quest added: 'Sparks and Steel'. Build a Smithy on the Restoration Board." }
    ]
  },
  {
    id: "shrineRestored",
    bg: "shrine",
    once: true,
    lines: [
      { who: "hikari", show: ["hikari"], text: "Oh... oh! Bin, look! The sun emblem is shining again! I can feel it, a little trickle of faith... it's like drinking warm honey!" },
      { who: "hikari", show: ["hikari"], text: "I've decided. A goddess shouldn't just sit in a shrine waiting for offerings. I'm coming with you! Into danger! With my Holy Light! Which I can afford now!" },
      { effects: [{ kind: "recruit", id: "hikari" }, { kind: "points", npc: "hikari", n: 60 }, { kind: "faith", n: 20 }] },
      { who: "system", text: "[SYSTEM] Hikari joined the party! Pray at the shrine once a day to spend Faith on blessings." }
    ]
  },
  {
    id: "atelierBuilt",
    bg: "atelier",
    once: true,
    lines: [
      { who: "mina", show: ["mina"], text: "A real atelier. With a chimney that points UP. I might cry. I'm going to cry. Give me a moment." },
      { who: "mina", show: ["mina"], text: "Thank you, Bin. I'll brew for the whole village. And... if you're going into the catacombs, let me come too. Somebody has to throw the bombs." },
      { effects: [{ kind: "recruit", id: "mina" }, { kind: "points", npc: "mina", n: 60 }] },
      { who: "system", text: "[SYSTEM] Mina joined the party! Alchemy is available at the Atelier." }
    ]
  },
  {
    id: "smithyBuilt",
    bg: "smithy",
    once: true,
    lines: [
      { who: "tove", show: ["tove"], text: "Listen to that. That's the sound of a forge that's going to make you rich and me famous. Or the other way round." },
      { who: "tove", show: ["tove"], text: "And I'm coming along when you hit the catacombs. I need to see how my blades hold up. Science!" },
      { effects: [{ kind: "recruit", id: "tove" }, { kind: "points", npc: "tove", n: 60 }] },
      { who: "system", text: "[SYSTEM] Tove joined the party! Smelting, gear crafting and tool upgrades are available at the Smithy." }
    ]
  },
  {
    id: "examF",
    bg: "guild",
    once: false,
    lines: [
      { who: "guildGirl", show: ["guildGirl"], text: "You have enough Guild Points for the Rank E exam! It's a real fight, though. A goblin chief has been raiding the forest road." },
      { who: "guildGirl", show: ["guildGirl"], text: "Defeat him and his escort, and you're Rank E. Please be careful. He has a crown made of spoons and he's very sensitive about it." },
      {
        choice: [
          { text: "Take the exam now", effects: [{ kind: "battle", encounter: "examF" }] },
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
      { who: "guildGirl", show: ["guildGirl"], text: "You did it! And you brought back the spoon crown! I'm framing it. Congratulations, Rank E adventurer!" },
      { effects: [{ kind: "rankUp" }, { kind: "flag", key: "catacombsOpen", value: true }, { kind: "quest", id: "q9Catacombs" }] },
      { who: "guildGirl", show: ["guildGirl"], text: "Rank E means you're allowed into the catacombs beneath the old capital. The entrance is the cave at the far end of the Whispering Forest." },
      { who: "system", text: "[SYSTEM] Dungeon unlocked: Catacombs of the Old Capital. Floors 1-5. Warning: Floor 5 guardian detected." }
    ]
  },
  {
    id: "examE",
    bg: "guild",
    once: false,
    lines: [
      { who: "kaito", show: ["kaito", "guildGirl"], text: "So the farmer wants Rank D? Then the exam is me. A friendly spar. Try not to cry when you lose." },
      { who: "guildGirl", show: ["kaito", "guildGirl"], text: "It's a standard exam match. Nobody gets seriously hurt. Kaito, that means you." },
      {
        choice: [
          { text: "Spar with Kaito now", effects: [{ kind: "battle", encounter: "examE" }] },
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
      { who: "kaito", show: ["kaito"], text: "...Tch. Lucky swing. Fine! You passed. Don't get used to it." },
      { who: "guildGirl", show: ["kaito", "guildGirl"], text: "Rank D! Congratulations! Kaito, say congratulations." },
      { who: "kaito", show: ["kaito"], text: "...Congratulations. Next time I'm not holding back." },
      { effects: [{ kind: "rankUp" }, { kind: "points", npc: "kaito", n: 60 }] }
    ]
  },
  {
    id: "examELose",
    bg: "guild",
    once: false,
    lines: [
      { who: "kaito", show: ["kaito"], text: "Ha! Told you. Come back when you've grown a few levels, farmer." },
      { who: "guildGirl", show: ["guildGirl"], text: "You can retake the exam whenever you're ready. Train a little, eat something warm." }
    ]
  },
  {
    id: "meetKaito",
    bg: "guild",
    once: true,
    lines: [
      { who: "kaito", show: ["kaito"], text: "So YOU'RE the otherworlder who took down the Labyrinth Lord? You? The guy with dirt on his boots?" },
      { who: "kaito", show: ["kaito"], text: "Kaito. A-rank. Remember it. This village might think you're a hero, but the real work is on the deep floors." },
      { effects: [{ kind: "meet", npc: "kaito" }, { kind: "flag", key: "metKaito", value: true }] }
    ]
  },
  {
    id: "catacombsFirst",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "system", text: "[SYSTEM] Entering: Catacombs of the Old Capital. Monsters are visible: bump into them to start a battle with the advantage. Touching you first gives them the advantage." },
      { who: "system", text: "[SYSTEM] Stairs down lead deeper. Chests and ore veins appear on each floor. Every 5 floors a guardian waits; after beating it you can start from the next floor." }
    ]
  },
  {
    id: "floor5Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "The corridor opens onto a vast hall of broken pillars. Something enormous breathes in the dark." },
      { who: "system", text: "[SYSTEM] Guardian detected: LABYRINTH LORD. Threat level: high. Recommended: exploit its weakness. Analyze it." },
      { who: "bin", text: "Big boss energy. Okay, team. Let's do this properly." }
    ]
  },
  {
    id: "floor5Win",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "narrator", text: "The Labyrinth Lord falls, and for the first time in years, the catacombs are quiet." },
      { who: "system", text: "[SYSTEM] Chapter 1 complete: 'Summoned at Dawn'. The Flooded Halls (floors 6-10) are now open." },
      { effects: [{ kind: "gp", n: 60 }, { kind: "faith", n: 50 }, { kind: "flag", key: "chapter2", value: true }, { kind: "quest", id: "q11Knight" }, { kind: "quest", id: "q13Rival" }] }
    ]
  },
  {
    id: "serenArrives",
    bg: "inn",
    once: true,
    lines: [
      { who: "seren", show: ["seren"], text: "Pardon me. Are you the adventurer who felled the Labyrinth Lord? I am Seren, formerly of the Erathian Griffin Guard." },
      { who: "seren", show: ["seren"], text: "I have come west to hunt the source of the Calamity. I would ask to fight at your side, but a knight must first see her companion's worth." },
      { who: "seren", show: ["seren"], text: "Reach Rank D at the Guild. Then I will know your oath is as strong as your sword arm." },
      { effects: [{ kind: "meet", npc: "seren" }, { kind: "flag", key: "metSeren", value: true }] }
    ]
  },
  {
    id: "serenJoins",
    bg: "inn",
    once: true,
    lines: [
      { who: "seren", show: ["seren"], text: "Rank D. You have kept faith with your people. Then I, Seren, pledge my spear to you. Until the Calamity ends." },
      { who: "bin", show: ["seren"], text: "Glad to have you. Fair warning, the job also involves a lot of turnips." },
      { who: "seren", show: ["seren"], text: "...I will learn to love turnips." },
      { effects: [{ kind: "recruit", id: "seren" }, { kind: "points", npc: "seren", n: 60 }] },
      { who: "system", text: "[SYSTEM] Seren joined the party!" }
    ]
  },
  {
    id: "nellJoins",
    bg: "forest",
    once: true,
    lines: [
      { who: "nell", show: ["nell"], text: "So, uh. The inn has beds. Real ones. And the innkeeper said foxes are allowed if they pay rent." },
      { who: "nell", show: ["nell"], text: "What I'm saying is, I'm moving to the village, and you obviously need someone who can shoot straight. So I'm joining your party. You're welcome." },
      { effects: [{ kind: "recruit", id: "nell" }, { kind: "points", npc: "nell", n: 60 }] },
      { who: "system", text: "[SYSTEM] Nell joined the party!" }
    ]
  },
  {
    id: "floor10Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "A throne of stolen treasure sits in the flooded hall. On it lounges a goblin the size of a house, wearing a crown of real gold." },
      { who: "system", text: "[SYSTEM] Guardian detected: GOBLIN KING GRUKK. Commanding a horde. Recommended: end the king quickly." },
      { who: "bin", text: "The continent's oldest joke. Let's make it stop being funny." }
    ]
  },
  {
    id: "floor10Win",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "narrator", text: "The Goblin King's crown rolls across the wet stone and comes to rest at Bin's feet." },
      { who: "system", text: "[SYSTEM] Chapter 2 complete: 'Rank and File'. The Ember Depths (floors 11-15) are now open. A voice in the deep is chanting." },
      { effects: [{ kind: "gp", n: 150 }, { kind: "faith", n: 100 }, { kind: "flag", key: "chapter3", value: true }, { kind: "flag", key: "examD", value: true }] }
    ]
  },
  {
    id: "floor15Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "Candles burn with black flames. A robed figure turns from an altar, his face a skull wrapped in silk." },
      { who: "system", text: "[SYSTEM] Guardian detected: VESPER, HIGH PRIEST OF THE SILENT END. Light-element attacks recommended." },
      { who: "hikari", show: ["hikari"], text: "Vesper... he serves Erebos. He's the one who's been starving my shrines. Bin, please. Let's end this." }
    ]
  },
  {
    id: "floor15Win",
    bg: "dungeon",
    once: true,
    lines: [
      { who: "narrator", text: "Vesper's chant breaks into silence. The black candles gutter out one by one." },
      { who: "system", text: "[SYSTEM] Chapter 3 complete: 'Into the Deep'. The Abyssal Rift (floors 16-20) is now open. Something vast is waking." },
      { effects: [{ kind: "gp", n: 300 }, { kind: "faith", n: 200 }, { kind: "flag", key: "chapter4", value: true }, { kind: "flag", key: "examC", value: true }] }
    ]
  },
  {
    id: "floor20Boss",
    bg: "dungeon",
    once: false,
    lines: [
      { who: "narrator", text: "At the bottom of the Rift, the dark takes a shape: horns, wings, and a smile that has eaten a thousand dawns." },
      { who: "system", text: "[SYSTEM] WARNING. Entity: AVATAR OF EREBOS. Administrator privileges... insufficient. Recommendation: do it anyway." },
      { who: "hikari", show: ["hikari"], text: "Bin. Whatever happens, I'm glad it was you I summoned." }
    ]
  },
  {
    id: "ending",
    bg: "dawnGate",
    once: true,
    lines: [
      { who: "narrator", text: "The Avatar of Erebos breaks apart like night before the sun. Across Restia, the Calamity Waves fall still." },
      { who: "hikari", show: ["hikari"], text: "Bin... my investiture is full. Overflowing, even. I could open the Dawn Gate. I could send you home." },
      {
        choice: [
          { text: "\"This is home now.\"", effects: [{ kind: "points", npc: "hikari", n: 100 }, { kind: "flag", key: "stayed", value: true }] },
          { text: "\"Maybe someday. Not yet.\"", effects: [{ kind: "flag", key: "stayed", value: true }] }
        ]
      },
      { who: "hikari", show: ["hikari"], text: "Then... good morning, Bin. Every morning, from now on." },
      { effects: [{ kind: "gp", n: 1000 }, { kind: "flag", key: "endingSeen", value: true }] },
      { who: "system", text: "[SYSTEM] Main story complete: 'Godfall'. Thank you for playing. The farm, the village and the Rift remain open: keep living in Restia." }
    ]
  }
];
