import type { BuildingId, CastId, Condition, ItemId, NpcId, Season, ZoneId } from "../engine/types";

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
const built = (id: BuildingId, level = 1): Condition => ({ kind: "building", id, level });

export const NPCS: Record<NpcId, NpcDef> = {
  // --- Family (Garr's hut) ---
  garr: {
    id: "garr",
    name: "Garr",
    title: "Veteran Hunter",
    romance: false,
    birthday: { season: "winter", day: 14 },
    loves: ["stew", "beastPelt", "wolfFang", "truffle"],
    likes: ["bread", "potato", "friedPotatoes", "leather", "rope", "herbTea"],
    dislikes: ["strawberryCake", "moonberryTart", "slimeJelly"],
    hates: ["darkCrystal"],
    schedule: [
      { from: 6 * H, to: 9 * H, at: { zone: "farm", spot: "houseFront" } },
      { from: 9 * H, to: 17 * H, days: WEEKDAYS, at: { zone: "village", spot: "plazaNorth" } },
      { from: 9 * H, to: 17 * H, weather: "dry", at: { zone: "forest", spot: "stream" } },
      { from: 17 * H, to: 20 * H, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { building: "farmhouse" } }
    ],
    lines: [
      { text: "Boots by the door. Snow goes outside. That rule is older than you are." },
      { text: "The field won't clear itself. I asked it. Twice." },
      { text: "Wolves have been bold this thaw. Carry something sharper than your jokes." },
      { when: { kind: "weather", weather: ["snow", "storm"] }, text: "Weather like this, you check the traps, you check the roof, you check on your people. In that order, usually." },
      { when: { kind: "counter", key: "candleCoins", n: 4 }, text: "Those candle coins. Keep counting. A man who leaves money around on purpose is buying something." },
      { when: hearts("garr", 4), text: "I kept your bow oiled the whole two months. Told myself it was for the wood." },
      { when: hearts("garr", 7), text: "There are things I haven't told you. Not yet. When I do, it'll be all of it. You have my word on that." }
    ]
  },
  bowy: {
    id: "bowy",
    name: "Bowy",
    title: "Half-Orc Marksman",
    romance: false,
    birthday: { season: "autumn", day: 3 },
    loves: ["friedPotatoes", "stew", "truffle", "ironIngot"],
    likes: ["potato", "corn", "bread", "wolfFang", "beastPelt", "rope"],
    dislikes: ["salad", "herbTea"],
    hates: ["pickles"],
    schedule: [
      { from: 6 * H, to: 12 * H, weather: "dry", at: { zone: "forest", spot: "fallenLog" } },
      { from: 12 * H, to: 17 * H, at: { zone: "farm", spot: "fieldEdge" } },
      { from: 17 * H, to: 22 * H, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { building: "farmhouse" } }
    ],
    lines: [
      { text: "Thunder's string is new. Old one snapped the day you vanished. Don't read into it." },
      { text: "You're thinner. Eat. That's not advice." },
      { text: "Dain talks a lot for a man who shoots worse than a scarecrow." },
      { when: { kind: "weather", weather: ["rain", "storm"] }, text: "Wet fur. Wet string. Wet mood. Stay inside if you're smart. You won't." },
      { when: hearts("bowy", 4), text: "When you were gone I kept setting two targets at the range. Habit. ...Shut up." },
      { when: hearts("bowy", 7), text: "Whatever took you, if it comes back, it goes through me first. That's the whole plan. It's a good plan." }
    ]
  },
  mitia: {
    id: "mitia",
    name: "Mitia",
    title: "Apothecary of Frostbitten",
    romance: false,
    birthday: { season: "winter", day: 25 },
    loves: ["glowcap", "honey", "iceCrystal", "herbTea", "moonberryTart"],
    likes: ["wildHerb", "medicinalHerb", "mushroom", "snowRadish", "strawberry", "bread"],
    dislikes: ["oldBone", "rustyBlade"],
    hates: ["demonHorn"],
    likeTags: ["herb", "flower"],
    schedule: [
      { from: 9 * H, to: 19 * H, when: built("atelier"), at: { building: "atelier" } },
      { from: 7 * H, to: 10 * H, weather: "dry", at: { zone: "forest", spot: "clearing" } },
      { from: 10 * H, to: 17 * H, at: { zone: "farm", spot: "houseFront" } },
      { from: 0, to: 30 * H, at: { building: "farmhouse" } }
    ],
    lines: [
      { text: "You're back. You're really back. I'm not crying, the kitchen is just... steamy." },
      { text: "Frostcap for the cough drops, mint for the throat rub, patience for everything else." },
      { text: "Animals have been following me around again. The goat from the Mug sat on my foot for an hour." },
      { when: { kind: "season", season: "winter" }, text: "Winter never feels cold to me. Garr says that's a thing we'll talk about 'later'. Later is a very long word in this house." },
      { when: { kind: "flag", key: "chapter1Done" }, text: "Someone out there is buying cough medicine in secret. Whoever is sick, I hope they get better. I just wish they'd ask." },
      { when: hearts("mitia", 4), text: "I dream about a palace made of ice sometimes. I've never seen one. Isn't that strange?" },
      { when: hearts("mitia", 7), text: "You always make jokes when you're scared. It's fine. I can hear the other part too." }
    ]
  },

  // --- Guild ---
  lysa: {
    id: "lysa",
    name: "Lysa",
    title: "Guild Receptionist",
    romance: true,
    birthday: { season: "spring", day: 9 },
    loves: ["strawberryCake", "honey", "dawnLily", "moonberryTart"],
    likes: ["strawberry", "bread", "feather", "magicPaper", "omelet", "herbTea"],
    dislikes: ["goblinCloth", "slimeJelly", "oldBone"],
    hates: ["venomSac"],
    likeTags: ["flower", "fruit"],
    schedule: [
      { from: 8 * H, to: 18 * H, days: WEEKDAYS, at: { building: "guild" } },
      { from: 10 * H, to: 16 * H, days: [5, 6], weather: "dry", at: { zone: "village", spot: "plazaEast" } },
      { from: 18 * H, to: 22 * H, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Bin! Still alive? Still alive! I love that for you. I love that for my paperwork." },
      { text: "Everyone's favourite adventurer is the one who comes back. Everyone's SECOND favourite brings snacks." },
      { text: "Corvin says I flirt with everyone. Rude. I flirt with everyone EQUALLY. It's a policy." },
      { when: { kind: "rank", rank: "E" }, text: "Rank E! I stamped it so hard the desk has a dent. Worth it." },
      { when: hearts("lysa", 4), text: "I remember every adventurer's name. It's so when they don't come back, somebody still does." },
      { when: hearts("lysa", 6), text: "When you were 'dead', I kept your card in the top drawer. Not the dead drawer. The top one. Just saying." },
      { when: { kind: "status", npc: "lysa", status: "dating" }, text: "Guild policy says no favourites. So I'm breaking guild policy. Loudly." },
      { when: { kind: "status", npc: "lysa", status: "married" }, text: "Lunch is packed, return scroll is packed, kiss is... there. Now go un-die responsibly." }
    ]
  },
  dain: {
    id: "dain",
    name: "Dain",
    title: "C-Rank Fighter",
    romance: false,
    birthday: { season: "summer", day: 20 },
    loves: ["dragonScale", "feast"],
    likes: ["stew", "goldIngot", "wolfFang", "friedPotatoes"],
    dislikes: ["turnip", "pickles"],
    hates: ["slimeJelly"],
    available: { kind: "flag", key: "metDain" },
    schedule: [
      { from: 10 * H, to: 16 * H, days: [1, 3, 5], at: { building: "guild" } },
      { from: 16 * H, to: 22 * H, at: { building: "inn" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Well well, the ghost. Still haunting the job board, I see." },
      { text: "A C-rank doesn't need a party. ...A party is nice, though. For the stories." },
      { text: "Mara says my scar makes me look 'distinguished'. She said it like an insult. I'm choosing to hear it as a compliment." },
      { when: { kind: "rank", rank: "D" }, text: "Rank D, huh? Took me a whole month. Don't make it weird." },
      { when: hearts("dain", 4), text: "That thing in the ruins. You had my back. I won't forget it. Also I will deny this conversation." }
    ]
  },
  mara: {
    id: "mara",
    name: "Mara",
    title: "D-Rank Diviner",
    romance: true,
    birthday: { season: "autumn", day: 18 },
    loves: ["manaCrystal", "moonberry", "magicPaper", "herbTea"],
    likes: ["manaBlossom", "glowcap", "feather", "honey", "omelet"],
    dislikes: ["rustyBlade", "goblinCloth"],
    hates: ["pickles"],
    likeTags: ["crystal"],
    available: { kind: "flag", key: "metMara" },
    schedule: [
      { from: 6 * H, to: 10 * H, weather: "dry", at: { zone: "forest", spot: "clearing" } },
      { from: 12 * H, to: 16 * H, days: WEEKDAYS, at: { building: "guild" } },
      { from: 19 * H, to: 22 * H, days: [4, 5], at: { building: "inn" } },
      { from: 10 * H, to: 19 * H, at: { zone: "village", spot: "well" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Ignore Dain. Everyone does. It's the main thing keeping this guild efficient." },
      { text: "My cards said today would be 'eventful'. They say that every day. They're either brilliant or lazy." },
      { text: "Don't look at the pom-poms. They help me focus. ...They don't. I just like them." },
      { when: { kind: "weather", weather: ["snow"] }, text: "Snow scrambles divination. Everything reads as 'cold'. Very helpful. Thank you, sky." },
      { when: hearts("mara", 4), text: "I've never had a reading come true on purpose. Only by accident. Don't tell the guild." },
      { when: hearts("mara", 6), text: "I drew your card again. The Fool, upside down, laughing. I don't know what it means. I keep drawing it anyway." },
      { when: { kind: "status", npc: "mara", status: "dating" }, text: "For the record, I did NOT predict this. Which is how I know it's real." },
      { when: { kind: "status", npc: "mara", status: "married" }, text: "Today's reading: you come home. I'm making that one come true myself." }
    ]
  },

  // --- Town ---
  tilde: {
    id: "tilde",
    name: "Tilde",
    title: "Trading Post & Tea Room",
    romance: false,
    birthday: { season: "summer", day: 9 },
    loves: ["goldIngot", "truffle", "venomSac", "herbTea"],
    likes: ["pumpkin", "strawberryCake", "honey", "bread", "mushroom"],
    dislikes: ["oldBone"],
    hates: [],
    likeTags: ["veg", "fruit"],
    schedule: [
      { from: 9 * H, to: 17 * H, days: [0, 1, 2, 3, 4, 5], at: { building: "store" } },
      { from: 17 * H, to: 19 * H, weather: "dry", at: { zone: "village", spot: "storeFront" } },
      { from: 0, to: 30 * H, at: { building: "store" } }
    ],
    lines: [
      { text: "Welcome back, dear! Seeds, rope, furs, tea. The little bottles on the top shelf are not for sale. Yet." },
      { text: "I buy anything you can carry in. Anything. I have a very open mind and a very locked cellar." },
      { text: "Tea party on Sunday. You're invited. Bring an appetite and an antidote. Kidding! Mostly." },
      { when: { kind: "season", season: "autumn" }, text: "Autumn! Pumpkins, mushrooms, and the pretty berries you must never, ever eat. My favourite season." },
      { when: hearts("tilde", 5), text: "You've put more coin through my till than the whole guild. I've decided you're not allowed to die. That's final." }
    ]
  },
  hilda: {
    id: "hilda",
    name: "Hilda",
    title: "Master of the Ironhand Forge",
    romance: true,
    birthday: { season: "summer", day: 27 },
    loves: ["ironIngot", "goldIngot", "mythrilOre", "stew", "friedPotatoes"],
    likes: ["potato", "corn", "bread", "silverOre", "ironOre", "wolfFang"],
    dislikes: ["dawnLily", "strawberryCake"],
    hates: ["slimeJelly"],
    likeTags: ["ore", "ingot"],
    available: { kind: "flag", key: "metHilda" },
    schedule: [
      { from: 8 * H, to: 18 * H, when: built("smithy"), days: [0, 1, 2, 3, 4, 5], at: { building: "smithy" } },
      { from: 18 * H, to: 22 * H, at: { building: "inn" } },
      { from: 8 * H, to: 20 * H, at: { zone: "village", spot: "smithyFront" } },
      { from: 0, to: 30 * H, when: built("smithy"), at: { building: "smithy" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Your boots are loud. Your left one drags. Your sword is sulking. Bring all three in." },
      { text: "Ironhand rule one: never trust a blade you didn't hear being born." },
      { text: "Flowers. What would I do with flowers. Quench them?" },
      { when: { kind: "weather", weather: ["snow", "storm"] }, text: "Snowstorm. Good. Nobody interrupts a smith in a snowstorm except fools and customers. You're both." },
      { when: hearts("hilda", 4), text: "The hand? Frostbite, twelve winters ago. I forged the replacement myself. It's a better hand. It doesn't shake." },
      { when: hearts("hilda", 6), text: "I've been making something after hours. No, you can't see it. Some things need heat and time." },
      { when: { kind: "status", npc: "hilda", status: "dating" }, text: "People keep asking why I'm humming at the anvil. I tell them the steel is good. It is. So is the company." },
      { when: { kind: "status", npc: "hilda", status: "married" }, text: "Breakfast is on. Potatoes, crispy. Eat. You're swinging a hammer today too." }
    ]
  },
  frida: {
    id: "frida",
    name: "Frida",
    title: "Keeper of the Weaver's Shrine",
    romance: true,
    birthday: { season: "winter", day: 3 },
    loves: ["dawnLily", "honey", "lightCrystal", "strawberryCake"],
    likes: ["herbTea", "bread", "iceCrystal", "feather", "manaBlossom", "snowRadish"],
    dislikes: ["demonHorn", "goblinCloth"],
    hates: ["darkCrystal"],
    likeTags: ["flower"],
    available: { kind: "flag", key: "metFrida" },
    schedule: [
      { from: 6 * H, to: 18 * H, when: built("shrine"), at: { building: "shrine" } },
      { from: 7 * H, to: 17 * H, at: { zone: "village", spot: "shrineFront" } },
      { from: 18 * H, to: 21 * H, weather: "dry", at: { zone: "village", spot: "well" } },
      { from: 0, to: 30 * H, when: built("shrine"), at: { building: "shrine" } },
      { from: 0, to: 30 * H, at: { away: true } }
    ],
    lines: [
      { text: "Good morning. The Weaver of Fools likes laughter more than prayers, so... please laugh at something. Anything." },
      { text: "The old stories say the Weaver once wove a jester out of a falling star. I think that's a nice thing to believe." },
      { text: "I sweep the snow off the shrine steps every morning. It comes back. So do I." },
      { when: { kind: "weather", weather: ["snow"] }, text: "Fresh snow. The whole world looks like an unwritten page." },
      { when: hearts("frida", 4), text: "When I was small, I heard a girl laughing in the empty shrine. I've been waiting to hear it again ever since." },
      { when: hearts("frida", 6), text: "You make people laugh even when you're hurting. The Weaver would like you. I... do too." },
      { when: { kind: "status", npc: "frida", status: "dating" }, text: "I tied a bell to your coat. So I can hear you coming home." },
      { when: { kind: "status", npc: "frida", status: "married" }, text: "I left an offering at the shrine for you this morning. The Weaver can share. She'll pretend to complain." }
    ]
  },
  senna: {
    id: "senna",
    name: "Senna",
    title: "The Warring Princess",
    romance: true,
    birthday: { season: "autumn", day: 30 },
    loves: ["lightCrystal", "pumpkinPie", "silverIngot", "feast"],
    likes: ["stew", "bread", "cornSoup", "wolfFang", "minotaurHorn"],
    dislikes: ["goblinCloth", "pickles"],
    hates: ["slimeJelly"],
    available: { kind: "flag", key: "metSenna" },
    schedule: [
      { from: 7 * H, to: 10 * H, weather: "dry", at: { zone: "village", spot: "plazaNorth" } },
      { from: 12 * H, to: 15 * H, days: WEEKDAYS, at: { building: "guild" } },
      { from: 0, to: 30 * H, at: { building: "inn" } }
    ],
    lines: [
      { text: "Good morning. I have completed three hundred spear drills. Shall we find something that fights back?" },
      { text: "My father offered me a throne. I asked if it came with enemies. He said no. So here I am." },
      { text: "Do not look at me like that. A warrior may enjoy pie. It is written nowhere that she may not." },
      { when: { kind: "season", season: "winter" }, text: "Winter makes the wolves desperate. Desperate wolves fight well. I love winter." },
      { when: hearts("senna", 4), text: "I have never lost a duel. I have never had a reason to win one, either. You are... changing that." },
      { when: hearts("senna", 6), text: "You fight like someone who has read every manual and trusts none of them. It is admirable. And annoying." },
      { when: { kind: "status", npc: "senna", status: "dating" }, text: "I have sworn to many banners. Yours is the one I would carry into any war." },
      { when: { kind: "status", npc: "senna", status: "married" }, text: "I patrolled the fields at dawn. All secure, my love. Now, breakfast. That is an order." }
    ]
  }
};

export const NPC_IDS = Object.keys(NPCS) as NpcId[];

/** Display names of scene-only speakers (Earth, the goddess, townsfolk without schedules). */
export const CAST_NAMES: Record<CastId, string> = {
  peri: "Peri",
  lily: "Lily",
  luna: "Luna Park",
  leo: "Leo",
  meilin: "Meilin",
  jake: "Jake Hwang",
  chad: "ChadThunderLive",
  lingling: "Ling Ling",
  nurse: "Nurse Chen Wei",
  tessa: "Tessa",
  corvin: "Corvin",
  kael: "Kael",
  twins: "The Brinna Twins",
  guard: "Gate Guard",
  host: "Mug Host",
  tuli: "Tuli",
  rolf: "Hermit Rolf",
  stranger: "Stranger",
  frostSprite: "Frost Sprite"
};
