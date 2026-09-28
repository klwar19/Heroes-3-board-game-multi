import type { BuildingId, Condition, ItemId, NpcId, Season, ZoneId } from "../engine/types";

export type NpcSpot = { zone: ZoneId; spot: string } | { building: BuildingId } | { away: true };

export type ScheduleEntry = {
  from: number;
  to: number;
  /** Weekdays (0 = Monday .. 6 = Sunday). */
  days?: number[];
  weather?: "rain" | "dry";
  when?: Condition;
  at: NpcSpot;
};

export type NpcDef = {
  id: NpcId;
  name: string;
  title: string;
  romance: boolean;
  birthday: { season: Season; day: number };
  loves: ItemId[];
  likes: ItemId[];
  dislikes: ItemId[];
  hates: ItemId[];
  /** Liked/loved item tags (every item with the tag counts). */
  likeTags?: string[];
  dislikeTags?: string[];
  /** The NPC is only around once this holds. */
  available?: Condition;
  schedule: ScheduleEntry[];
  lines: { when?: Condition; text: string }[];
};

const H = 60;
const WEEKDAYS = [0, 1, 2, 3, 4];
const hearts = (npc: NpcId, min: number): Condition => ({ kind: "hearts", npc, min });

export const NPCS: Record<NpcId, NpcDef> = {
  hikari: {
    id: "hikari",
    name: "Hikari",
    title: "Goddess of Dawn",
    romance: true,
    birthday: { season: "summer", day: 1 },
    loves: ["dawnLily", "strawberryCake", "moonberryTart", "lightCrystal", "honey"],
    likes: ["strawberry", "melon", "bread", "herbTea", "manaBlossom", "feather"],
    dislikes: ["slimeJelly", "oldBone", "darkCrystal"],
    hates: ["demonHorn"],
    likeTags: ["flower"],
    schedule: [
      { from: 6 * H, to: 18 * H, when: { kind: "building", id: "shrine", level: 1 }, at: { building: "shrine" } },
      { from: 18 * H, to: 21 * H, weather: "dry", at: { zone: "village", spot: "well" } },
      { from: 6 * H, to: 21 * H, when: { kind: "building", id: "shrine", level: 1 }, at: { building: "shrine" } },
      { from: 7 * H, to: 20 * H, at: { zone: "village", spot: "shrineFront" } },
      { from: 0, to: 30 * H, at: { building: "guild" } }
    ],
    lines: [
      { text: "Good morning, my faithful follower! ...You ARE my follower, right? Please say yes. My investiture is at zero." },
      { text: "A goddess doesn't beg. A goddess... strategically accepts offerings. Do you have any strawberries?" },
      { text: "The dawn here is so pretty. I made it, you know. Well. I designed the colour scheme." },
      { when: { kind: "weather", weather: ["rain", "storm"] }, text: "Rain is just the sky doing its laundry. Don't forget, your crops are watered for free today!" },
      { when: { kind: "building", id: "shrine", level: 1 }, text: "Thanks to you, the shrine is standing again. I can feel the villagers' prayers... they taste like warm bread." },
      { when: hearts("hikari", 4), text: "When I summoned you, I only checked 'likes board games' and 'kind to animals'. I got very lucky, didn't I?" },
      { when: hearts("hikari", 6), text: "I've started saving my offerings for you instead of for the heavenly rent. Don't tell the other gods." },
      { when: { kind: "status", npc: "hikari", status: "dating" }, text: "Heaven can wait. Honestly? I'd rather be down here with you." },
      { when: { kind: "status", npc: "hikari", status: "married" }, text: "Good morning, dear. I blessed the fields before you woke up. Don't tell anyone, it's technically overtime." }
    ]
  },
  guildGirl: {
    id: "guildGirl",
    name: "Elise",
    title: "Guild Receptionist",
    romance: true,
    birthday: { season: "autumn", day: 12 },
    loves: ["herbTea", "strawberryCake", "honey", "dawnLily"],
    likes: ["bread", "salad", "feather", "magicPaper", "omelet"],
    dislikes: ["goblinCloth", "slimeJelly", "oldBone"],
    hates: ["venomSac"],
    likeTags: ["flower", "fruit"],
    schedule: [
      { from: 8 * H, to: 18 * H, days: WEEKDAYS, at: { building: "guild" } },
      { from: 10 * H, to: 16 * H, days: [5, 6], weather: "dry", at: { zone: "village", spot: "plazaEast" } },
      { from: 18 * H, to: 22 * H, when: { kind: "building", id: "inn", level: 1 }, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { building: "guild" } }
    ],
    lines: [
      { text: "Welcome to the Adventurers' Guild! Today's requests are on the board. Please don't die, the paperwork is awful." },
      { text: "Goblins again? Please take the goblin requests seriously. Everyone who laughs at goblins ends up in my 'missing' drawer." },
      { text: "A rank isn't just a letter. It's a promise that people can trust you with their lives." },
      { when: { kind: "rank", rank: "E" }, text: "Rank E already! I stamped your card extra neatly." },
      { when: hearts("guildGirl", 4), text: "I keep a little notebook of every adventurer who comes back safe. Your page is getting long. I like that." },
      { when: hearts("guildGirl", 6), text: "Between you and me... I used to dream of adventuring too. Now I just dream of you coming back through that door." },
      { when: { kind: "status", npc: "guildGirl", status: "dating" }, text: "Official guild policy says I can't play favourites. Unofficially, you're my favourite." },
      { when: { kind: "status", npc: "guildGirl", status: "married" }, text: "I packed you a lunch and a return scroll. Come home before dark, adventurer." }
    ]
  },
  mina: {
    id: "mina",
    name: "Mina",
    title: "Half-Elf Alchemist",
    romance: true,
    birthday: { season: "spring", day: 18 },
    loves: ["glowcap", "manaBlossom", "moonberry", "manaCrystal", "honey"],
    likes: ["wildHerb", "medicinalHerb", "mushroom", "magicPaper", "strawberry", "herbTea"],
    dislikes: ["rustyBlade", "oldBone"],
    hates: ["darkCrystal"],
    likeTags: ["herb", "mushroom", "crystal"],
    available: { kind: "flag", key: "metMina" },
    schedule: [
      { from: 10 * H, to: 19 * H, when: { kind: "building", id: "atelier", level: 1 }, at: { building: "atelier" } },
      { from: 6 * H, to: 10 * H, weather: "dry", at: { zone: "forest", spot: "clearing" } },
      { from: 19 * H, to: 21 * H, days: [5], at: { zone: "village", spot: "plazaWest" } },
      { from: 0, to: 30 * H, when: { kind: "building", id: "atelier", level: 1 }, at: { building: "atelier" } },
      { from: 0, to: 30 * H, at: { building: "guild" } }
    ],
    lines: [
      { text: "Oh! Um. Good day. I was just, um, labelling jars. Alphabetically. And then by colour." },
      { text: "Did you know glowcaps only glow when they're happy? I talk to mine every morning." },
      { text: "Alchemy is just cooking where the soup might explode. That's what my teacher said, anyway." },
      { when: { kind: "season", season: "spring" }, text: "Spring herbs are the best. Everything is so eager to grow." },
      { when: hearts("mina", 4), text: "My glasses? I only wear them for reading. And for looking at you when you're far away. W-wait, forget that." },
      { when: hearts("mina", 6), text: "I've been writing a recipe book. The last chapter is blank. I think I'm waiting to find out how it ends... with you." },
      { when: { kind: "status", npc: "mina", status: "dating" }, text: "I brewed something to make my heart stop racing when you visit. It didn't work. I'm glad." },
      { when: { kind: "status", npc: "mina", status: "married" }, text: "Our kitchen smells like herbs and fresh bread now. It smells like home." }
    ]
  },
  tove: {
    id: "tove",
    name: "Tove",
    title: "Dwarven Blacksmith",
    romance: true,
    birthday: { season: "summer", day: 20 },
    loves: ["ironIngot", "goldIngot", "mythrilOre", "stew", "friedPotatoes"],
    likes: ["potato", "corn", "bread", "silverOre", "ironOre", "wolfFang"],
    dislikes: ["dawnLily", "strawberryCake"],
    hates: ["slimeJelly"],
    likeTags: ["ore", "ingot"],
    available: { kind: "flag", key: "metTove" },
    schedule: [
      { from: 8 * H, to: 18 * H, when: { kind: "building", id: "smithy", level: 1 }, days: [0, 1, 2, 3, 4, 5], at: { building: "smithy" } },
      { from: 18 * H, to: 22 * H, when: { kind: "building", id: "inn", level: 1 }, at: { building: "inn" } },
      { from: 8 * H, to: 20 * H, at: { zone: "village", spot: "smithyFront" } },
      { from: 0, to: 30 * H, when: { kind: "building", id: "smithy", level: 1 }, at: { building: "smithy" } },
      { from: 0, to: 30 * H, at: { building: "guild" } }
    ],
    lines: [
      { text: "Oi, farmer-hero! Your sword's crying. I can hear it from here. Bring it in sometime." },
      { text: "Dwarven rule number one: never trust a blade you didn't hear being born." },
      { text: "Flowers? What am I supposed to do with flowers, hammer them flat? ...They're pretty, I guess." },
      { when: { kind: "weather", weather: ["rain", "storm"] }, text: "Rain's good for the forge. Keeps the sparks from starting anything I don't want started." },
      { when: hearts("tove", 4), text: "You're the first human who's asked me to teach them instead of just forge for them. Feels nice." },
      { when: hearts("tove", 6), text: "I made a little something in secret. No! Not telling. It's not done yet. Some things take heat and time." },
      { when: { kind: "status", npc: "tove", status: "dating" }, text: "My clan would faint if they knew I was sweet on a human. Let 'em faint!" },
      { when: { kind: "status", npc: "tove", status: "married" }, text: "Breakfast's on, love. Potatoes, extra crispy. Eat up, you're swinging a hammer today too." }
    ]
  },
  seren: {
    id: "seren",
    name: "Seren",
    title: "Knight of Erathia",
    romance: true,
    birthday: { season: "winter", day: 7 },
    loves: ["lightCrystal", "pumpkinPie", "silverIngot", "feast"],
    likes: ["stew", "bread", "cornSoup", "feather", "guardRing"],
    dislikes: ["goblinCloth", "pickles"],
    hates: ["darkCrystal", "demonHorn"],
    available: { kind: "flag", key: "metSeren" },
    schedule: [
      { from: 7 * H, to: 10 * H, weather: "dry", at: { zone: "village", spot: "plazaNorth" } },
      { from: 12 * H, to: 15 * H, days: WEEKDAYS, at: { building: "guild" } },
      { from: 0, to: 30 * H, when: { kind: "building", id: "inn", level: 1 }, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { building: "guild" } }
    ],
    lines: [
      { text: "Good morning. I have completed three hundred spear thrusts. And you?" },
      { text: "Erathia taught me that a knight's duty is to the people, not the crown. I have not forgotten." },
      { text: "Do not look at me like that. Knights may enjoy pie. It is written nowhere that they may not." },
      { when: { kind: "season", season: "winter" }, text: "Winter reminds me of the northern garrison. We used to warm our hands on the griffins." },
      { when: hearts("seren", 4), text: "I was dismissed from the order for refusing an unjust command. I have never regretted it. Least of all now." },
      { when: hearts("seren", 6), text: "You fight like someone who has read every manual and trusts none of them. It is... admirable." },
      { when: { kind: "status", npc: "seren", status: "dating" }, text: "I have sworn many oaths. The one I made to you is the one I keep closest." },
      { when: { kind: "status", npc: "seren", status: "married" }, text: "I patrolled the fields at dawn. All secure, my love. Now, breakfast. That is an order." }
    ]
  },
  nell: {
    id: "nell",
    name: "Nell",
    title: "Foxkin Ranger",
    romance: true,
    birthday: { season: "autumn", day: 25 },
    loves: ["truffle", "moonberry", "honey", "omelet"],
    likes: ["wildBerries", "egg", "mushroom", "feather", "wolfFang", "moonberryTart"],
    dislikes: ["turnip", "herbTea"],
    hates: ["pickles"],
    available: { kind: "flag", key: "metNell" },
    schedule: [
      { from: 6 * H, to: 16 * H, weather: "dry", at: { zone: "forest", spot: "fallenLog" } },
      { from: 16 * H, to: 23 * H, when: { kind: "building", id: "inn", level: 1 }, at: { building: "inn" } },
      { from: 6 * H, to: 20 * H, at: { zone: "forest", spot: "stream" } },
      { from: 0, to: 30 * H, when: { kind: "building", id: "inn", level: 1 }, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Heya, farm boy! Caught anything today, or are you still losing fights to turnips?" },
      { text: "My tail isn't a pillow. ...Fine. Five seconds. Starting now." },
      { text: "The forest talks if you listen. Right now it's saying you smell like fertilizer." },
      { when: { kind: "weather", weather: ["rain", "storm"] }, text: "Ugh, wet fur. Don't look at me, I look like a drowned mop." },
      { when: hearts("nell", 4), text: "Most people either want to pet my ears or chase me off. You just... talk to me. Weirdo. I like it." },
      { when: hearts("nell", 6), text: "Foxkin don't settle down, they say. Well. 'They' never met your cooking." },
      { when: { kind: "status", npc: "nell", status: "dating" }, text: "You're mine now, got it? I marked you. ...Metaphorically! Probably." },
      { when: { kind: "status", npc: "nell", status: "married" }, text: "Morning, hubby! I chased three crows off the field. You owe me a truffle omelet." }
    ]
  },
  pip: {
    id: "pip",
    name: "Pip",
    title: "Halfling Merchant",
    romance: false,
    birthday: { season: "summer", day: 9 },
    loves: ["goldIngot", "truffle", "melon"],
    likes: ["pumpkin", "strawberryCake", "honey", "bread"],
    dislikes: ["oldBone"],
    hates: [],
    likeTags: ["veg", "fruit"],
    schedule: [
      { from: 9 * H, to: 17 * H, days: [0, 1, 2, 3, 4, 5], at: { building: "store" } },
      { from: 17 * H, to: 19 * H, weather: "dry", at: { zone: "village", spot: "storeFront" } },
      { from: 0, to: 30 * H, at: { building: "store" } }
    ],
    lines: [
      { text: "Pip's the name, fair prices the game! Mostly fair. Fair-adjacent." },
      { text: "Seeds are the best investment in the world, lad. They pay interest in vegetables!" },
      { text: "A village with a farmer, a smith and an alchemist? That's a trade route in the making!" },
      { when: { kind: "season", season: "autumn" }, text: "Autumn! Pumpkin season! My favourite time to raise prices- er, to celebrate." },
      { when: hearts("pip", 5), text: "You've put more coin through my till than the last three years combined. I'm naming a shelf after you." }
    ]
  },
  kaito: {
    id: "kaito",
    name: "Kaito",
    title: "A-Rank Adventurer",
    romance: false,
    birthday: { season: "winter", day: 20 },
    loves: ["dragonScale", "feast"],
    likes: ["powerRing", "stew", "goldIngot"],
    dislikes: ["turnip", "pickles"],
    hates: ["slimeJelly"],
    available: { kind: "flag", key: "metKaito" },
    schedule: [
      { from: 10 * H, to: 16 * H, days: [1, 3], at: { building: "guild" } },
      { from: 16 * H, to: 22 * H, days: [1, 3], when: { kind: "building", id: "inn", level: 1 }, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Oh, it's the farmer. Still playing house out here while the real adventurers work?" },
      { text: "An A-rank doesn't need a party. ...A party is nice though. For morale. Not that I'd know." },
      { when: { kind: "rank", rank: "D" }, text: "Rank D, huh? Don't let it go to your head. It took me a whole week." },
      { when: hearts("kaito", 4), text: "Hey. That fight in the catacombs... you had my back. I won't forget it. Don't make it weird." }
    ]
  }
};

export const NPC_IDS = Object.keys(NPCS) as NpcId[];
