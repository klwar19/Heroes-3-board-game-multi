import type { NpcId, SceneDef } from "../engine/types";

/**
 * Heart events (played when talking to someone whose hearts reached the
 * threshold), confessions (Dawn Charm) and proposals (Eternal Ring).
 */
export type HeartEvent = { npc: NpcId; hearts: number; scene: string; needsDating?: boolean };

export const HEART_EVENTS: HeartEvent[] = [
  ...(["hikari", "guildGirl", "mina", "tove", "seren", "nell"] as NpcId[]).flatMap((npc) => [
    { npc, hearts: 2, scene: `heart-${npc}-2` },
    { npc, hearts: 4, scene: `heart-${npc}-4` },
    { npc, hearts: 6, scene: `heart-${npc}-6` },
    { npc, hearts: 8, scene: `heart-${npc}-8` },
    { npc, hearts: 10, scene: `heart-${npc}-10`, needsDating: true }
  ])
];

const up = (npc: NpcId, n: number) => [{ kind: "points" as const, npc, n }];

export const HEART_SCENES: SceneDef[] = [
  // ----- Hikari -----
  { id: "heart-hikari-2", bg: "shrine", once: true, lines: [
    { who: "hikari", show: ["hikari"], text: "Bin! Quick question! Hypothetically, if a goddess ate the offering bread herself, would that count as fraud?" },
    { who: "bin", show: ["hikari"], text: "How much bread are we talking about?" },
    { who: "hikari", show: ["hikari"], text: "...All of it. It was so warm! Nobody's left me warm bread in two hundred years!" },
    { choice: [
      { text: "\"I'll bake you some. No offering required.\"", effects: up("hikari", 40) },
      { text: "\"Divine embezzlement. Scandalous.\"", effects: up("hikari", 15) }
    ] },
    { who: "hikari", show: ["hikari"], text: "You're a strange hero, you know that? A good strange." }
  ] },
  { id: "heart-hikari-4", bg: "dawnGate", once: true, lines: [
    { who: "narrator", text: "Hikari is sitting on the Dawn Gate's broken step before sunrise, knees pulled to her chest." },
    { who: "hikari", show: ["hikari"], text: "Every morning I paint the dawn. Nobody used to watch. I kept doing it anyway. Isn't that silly?" },
    { choice: [
      { text: "\"I'll watch it with you.\"", effects: up("hikari", 40) },
      { text: "\"It's not silly. It's your job.\"", effects: up("hikari", 20) }
    ] },
    { who: "narrator", text: "The sky turns gold. For once, the goddess is not alone to see it." }
  ] },
  { id: "heart-hikari-6", bg: "shrine", once: true, lines: [
    { who: "hikari", show: ["hikari"], text: "The other gods sent a letter. They said I can come back to heaven once my investiture is restored. They said it like a reward." },
    { who: "hikari", show: ["hikari"], text: "But up there nobody laughs when the bread's too warm. Nobody tracks mud onto my altar. Nobody... is you." },
    { choice: [
      { text: "\"Then stay.\"", effects: up("hikari", 50) },
      { text: "\"Heaven sounds nice, though.\"", effects: up("hikari", -10) }
    ] }
  ] },
  { id: "heart-hikari-8", bg: "dawnGate", once: true, lines: [
    { who: "hikari", show: ["hikari"], text: "Bin, humans give each other something when they want to be more than friends, right? A charm, a promise?" },
    { who: "hikari", show: ["hikari"], text: "I'm not asking! I'm just a goddess doing research! Very academic! ...Pip sells Dawn Charms, by the way. No reason." },
    { effects: up("hikari", 20) }
  ] },
  { id: "heart-hikari-10", bg: "dawnGate", once: true, lines: [
    { who: "hikari", show: ["hikari"], text: "I made today's dawn just for you. See the pink at the edges? That's my heart. Very unprofessional of me." },
    { who: "bin", show: ["hikari"], text: "It's the best one yet." },
    { who: "hikari", show: ["hikari"], text: "If you ever find a ring made of sunstone... I would say yes before you finished asking." },
    { effects: up("hikari", 30) }
  ] },
  { id: "confess-hikari", bg: "shrine", once: true, lines: [
    { who: "hikari", show: ["hikari"], text: "A Dawn Charm... for me? Bin, you know what this means here, right? You're not just being nice?" },
    { who: "bin", show: ["hikari"], text: "I'm not just being nice." },
    { who: "hikari", show: ["hikari"], text: "Then... yes! Yes yes yes! The Goddess of Dawn is officially taken! I'm going to make the sunrise heart-shaped tomorrow!" }
  ] },
  { id: "propose-hikari", bg: "dawnGate", once: true, lines: [
    { who: "hikari", show: ["hikari"], text: "An Eternal Ring. You really mean forever. A goddess's forever is very long, you know." },
    { who: "bin", show: ["hikari"], text: "Then I'd better start now." },
    { who: "hikari", show: ["hikari"], text: "I'll marry you, Bin. I'll move into the farmhouse and bless every sprout. Heaven can keep its rent." }
  ] },

  // ----- Elise (Guild Girl) -----
  { id: "heart-guildGirl-2", bg: "guild", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "Ah! Don't look! I'm eating lunch at the counter again. Paperwork waits for no one." },
    { choice: [
      { text: "\"Take a real break. I'll watch the desk.\"", effects: up("guildGirl", 40) },
      { text: "\"Is that a sandwich or a stack of forms?\"", effects: up("guildGirl", 20) }
    ] },
    { who: "guildGirl", show: ["guildGirl"], text: "You're sweet. The guild manual doesn't have a section for adventurers being sweet." }
  ] },
  { id: "heart-guildGirl-4", bg: "guild", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "May I show you something? It's my 'Came Home Safe' notebook. Every adventurer who returned, with the date." },
    { who: "guildGirl", show: ["guildGirl"], text: "There's also a second notebook. For the ones who didn't. I read it sometimes, so I never get careless with a request." },
    { choice: [
      { text: "\"I'll only ever be in the first one.\"", effects: up("guildGirl", 45) },
      { text: "\"That's a heavy thing to carry alone.\"", effects: up("guildGirl", 35) }
    ] }
  ] },
  { id: "heart-guildGirl-6", bg: "village", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "My day off, and I walked to the plaza without deciding to. I think my feet were hoping to run into you." },
    { who: "guildGirl", show: ["guildGirl"], text: "When I was small I wanted to be an adventurer. I'm too clumsy. So I became the person who makes sure adventurers come back." },
    { choice: [
      { text: "\"Want to come on a safe little adventure with me? The forest is lovely today.\"", effects: up("guildGirl", 50) },
      { text: "\"You're the reason I come back.\"", effects: up("guildGirl", 45) }
    ] }
  ] },
  { id: "heart-guildGirl-8", bg: "guild", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "Official announcement from the Dawnhollow branch: the receptionist is... very fond of a certain Rank adventurer." },
    { who: "guildGirl", show: ["guildGirl"], text: "Unofficial announcement: if he ever gave her a Dawn Charm, she would not file a complaint." },
    { effects: up("guildGirl", 20) }
  ] },
  { id: "heart-guildGirl-10", bg: "guild", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "I stamped a new card today. 'Bin. Status: my person.' It isn't an official field. I added it." },
    { who: "guildGirl", show: ["guildGirl"], text: "If you ever wanted to make it official-official... I hear sunstone rings are very durable." },
    { effects: up("guildGirl", 30) }
  ] },
  { id: "confess-guildGirl", bg: "guild", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "A Dawn Charm? For... me? Not for the guild? For Elise?" },
    { who: "guildGirl", show: ["guildGirl"], text: "Yes. Yes! Please give me a moment, I need to hide behind the request board and scream a little." }
  ] },
  { id: "propose-guildGirl", bg: "guild", once: true, lines: [
    { who: "guildGirl", show: ["guildGirl"], text: "This is... an Eternal Ring. Bin, I have never filled in a form this happily in my life." },
    { who: "guildGirl", show: ["guildGirl"], text: "Yes. I'll marry you. I'll still work at the guild, of course. But now I get to come home to you." }
  ] },

  // ----- Mina -----
  { id: "heart-mina-2", bg: "atelier", once: true, lines: [
    { who: "mina", show: ["mina"], text: "Could you hold this flask? Don't shake it. Or breathe on it. Or think loud thoughts near it." },
    { who: "narrator", text: "The flask glows, sparkles, and produces a small, perfect flower." },
    { who: "mina", show: ["mina"], text: "It worked! It never works when someone's watching! You must be good luck." },
    { choice: [
      { text: "\"Or you're just good at this.\"", effects: up("mina", 40) },
      { text: "\"I'll be your lucky charm anytime.\"", effects: up("mina", 35) }
    ] }
  ] },
  { id: "heart-mina-4", bg: "forest", once: true, lines: [
    { who: "mina", show: ["mina"], text: "My teacher called me 'the girl who explodes things'. I left before she could say it again." },
    { who: "mina", show: ["mina"], text: "Here nobody calls me that. Well, Tove does, but she means it as a compliment." },
    { choice: [
      { text: "\"Every great alchemist blew up a few ateliers.\"", effects: up("mina", 40) },
      { text: "\"You're the girl who makes flowers out of glass.\"", effects: up("mina", 50) }
    ] }
  ] },
  { id: "heart-mina-6", bg: "atelier", once: true, lines: [
    { who: "mina", show: ["mina"], text: "I tried to brew a potion of courage. For me. So I could say something to someone." },
    { who: "mina", show: ["mina"], text: "It turned purple and smelled like socks. So I'll just... say it. I really like spending time with you, Bin." },
    { choice: [
      { text: "\"I really like it too.\"", effects: up("mina", 50) },
      { text: "\"Purple sock potion. Very brave.\"", effects: up("mina", 15) }
    ] }
  ] },
  { id: "heart-mina-8", bg: "atelier", once: true, lines: [
    { who: "mina", show: ["mina"], text: "In elven tradition, if someone gives you a sun charm, you're... promised. Not married! Promised. Courting." },
    { who: "mina", show: ["mina"], text: "I'm just mentioning it. For cultural education. Pip has some, I think. Not that I checked. Twice." },
    { effects: up("mina", 20) }
  ] },
  { id: "heart-mina-10", bg: "atelier", once: true, lines: [
    { who: "mina", show: ["mina"], text: "I finally wrote the last chapter of my recipe book. It's not a recipe. It's a list of every day I spent with you." },
    { who: "mina", show: ["mina"], text: "I'd like there to be a second volume. And a third. Maybe with a ring on the cover." },
    { effects: up("mina", 30) }
  ] },
  { id: "confess-mina", bg: "atelier", once: true, lines: [
    { who: "mina", show: ["mina"], text: "For me? A Dawn Charm? Oh no, I'm going to cry into the cauldron again." },
    { who: "mina", show: ["mina"], text: "Yes. Yes, Bin. I'd love to court you. Properly. With picnics. And no explosions. Mostly." }
  ] },
  { id: "propose-mina", bg: "atelier", once: true, lines: [
    { who: "mina", show: ["mina"], text: "An Eternal Ring... the sunstone is perfect. No bubbles, no cracks. Like it was meant to be." },
    { who: "mina", show: ["mina"], text: "Yes. I'll marry you. Our house is going to smell like herbs forever, I hope that's okay." }
  ] },

  // ----- Tove -----
  { id: "heart-tove-2", bg: "smithy", once: true, lines: [
    { who: "tove", show: ["tove"], text: "Grab the tongs. No, the OTHER tongs. Now hold that steady while I hit it. Trust me!" },
    { who: "narrator", text: "Sparks fly. The blade rings true. Tove grins so wide her freckles rearrange." },
    { choice: [
      { text: "\"That was amazing.\"", effects: up("tove", 40) },
      { text: "\"I think my eyebrows are gone.\"", effects: up("tove", 30) }
    ] }
  ] },
  { id: "heart-tove-4", bg: "smithy", once: true, lines: [
    { who: "tove", show: ["tove"], text: "My clan said a dwarf girl should forge jewellery, not war-hammers. So I forged a war-hammer out of jewellery." },
    { who: "tove", show: ["tove"], text: "Then I left. Best decision I ever made. Worst trip. There were so many hills." },
    { choice: [
      { text: "\"Your hammer suits you.\"", effects: up("tove", 45) },
      { text: "\"Could you forge me some jewellery? Sometime?\"", effects: up("tove", 35) }
    ] }
  ] },
  { id: "heart-tove-6", bg: "village", once: true, lines: [
    { who: "tove", show: ["tove"], text: "Oi. Hold still. I made you something. It's a whetstone shaped like a turnip. Because you're a farmer. And I'm funny." },
    { choice: [
      { text: "\"I'll treasure it.\"", effects: up("tove", 50) },
      { text: "\"It's... very turnip-shaped.\"", effects: up("tove", 25) }
    ] },
    { who: "tove", show: ["tove"], text: "Good. Because I'm not good at saying stuff. So I make stuff. Figure out what it means yourself." }
  ] },
  { id: "heart-tove-8", bg: "smithy", once: true, lines: [
    { who: "tove", show: ["tove"], text: "Humans give sun charms when they're sweet on someone, yeah? Dwarves give anvils. Charms are lighter, I'll give you that." },
    { who: "tove", show: ["tove"], text: "I'm just saying if YOU were to give ME one, I wouldn't hit you. Much. Lovingly." },
    { effects: up("tove", 20) }
  ] },
  { id: "heart-tove-10", bg: "smithy", once: true, lines: [
    { who: "tove", show: ["tove"], text: "Remember that secret thing I was making? It's a ring mould. Sunstone setting. Took me forever." },
    { who: "tove", show: ["tove"], text: "It's for you to fill. With a ring. For me. Stop grinning, I'm going to hit you. Lovingly!" },
    { effects: up("tove", 30) }
  ] },
  { id: "confess-tove", bg: "smithy", once: true, lines: [
    { who: "tove", show: ["tove"], text: "You're giving ME a Dawn Charm. In my own smithy. In front of my anvil." },
    { who: "tove", show: ["tove"], text: "...YES. Obviously yes! Come here, you absolute lump of a human!" }
  ] },
  { id: "propose-tove", bg: "smithy", once: true, lines: [
    { who: "tove", show: ["tove"], text: "It fits the mould perfectly. You made it fit. You clever farmer." },
    { who: "tove", show: ["tove"], text: "Yes. I'll marry you. My clan can come to the wedding and cry about it. Loudly. Happily." }
  ] },

  // ----- Seren -----
  { id: "heart-seren-2", bg: "village", once: true, lines: [
    { who: "seren", show: ["seren"], text: "You watch my morning drills. You may join, if you wish. Your stance is... creative." },
    { choice: [
      { text: "\"Teach me.\"", effects: up("seren", 40) },
      { text: "\"Creative is good, right?\"", effects: up("seren", 20) }
    ] },
    { who: "seren", show: ["seren"], text: "Feet apart. Shoulders loose. Breathe. ...Good. You learn quickly." }
  ] },
  { id: "heart-seren-4", bg: "inn", once: true, lines: [
    { who: "seren", show: ["seren"], text: "I was ordered to burn a village that could not pay its tithe. I refused. I was stripped of my rank the same night." },
    { who: "seren", show: ["seren"], text: "I still carry the spear. The oath was never to the order. It was to people like the ones in Dawnhollow." },
    { choice: [
      { text: "\"You did the right thing.\"", effects: up("seren", 45) },
      { text: "\"Dawnhollow is lucky to have you.\"", effects: up("seren", 45) }
    ] }
  ] },
  { id: "heart-seren-6", bg: "inn", once: true, lines: [
    { who: "seren", show: ["seren"], text: "The innkeeper brought me pie. I ate it. Then I ate a second pie. I am telling you so that you know I am capable of weakness." },
    { choice: [
      { text: "\"Next pie's on me.\"", effects: up("seren", 50) },
      { text: "\"Your secret is safe.\"", effects: up("seren", 35) }
    ] },
    { who: "seren", show: ["seren"], text: "...Thank you. I find I can be less of a knight around you. It is a strange relief." }
  ] },
  { id: "heart-seren-8", bg: "village", once: true, lines: [
    { who: "seren", show: ["seren"], text: "In Erathia a knight may accept a token from one she holds dear. A charm, in the colours of dawn, is customary." },
    { who: "seren", show: ["seren"], text: "I tell you this as a matter of cultural record. Only that. Please stop smiling." },
    { effects: up("seren", 20) }
  ] },
  { id: "heart-seren-10", bg: "dawnGate", once: true, lines: [
    { who: "seren", show: ["seren"], text: "I have knelt before kings. I have never wished to kneel before anyone for my own sake. Until now." },
    { who: "seren", show: ["seren"], text: "If you offered me an oath of forever, sealed with sunstone, I would take it without hesitation." },
    { effects: up("seren", 30) }
  ] },
  { id: "confess-seren", bg: "inn", once: true, lines: [
    { who: "seren", show: ["seren"], text: "A Dawn Charm. You understand what accepting this means for a knight of Erathia." },
    { who: "seren", show: ["seren"], text: "I accept. With all my heart. And I would like you to know my face is red because of the fireplace." }
  ] },
  { id: "propose-seren", bg: "dawnGate", once: true, lines: [
    { who: "seren", show: ["seren"], text: "An Eternal Ring. Then I swear my last oath. To stand beside you, in the fields and in the Rift, until the final dawn." },
    { who: "seren", show: ["seren"], text: "Yes, Bin. I will be your wife. ...May we have pie at the wedding?" }
  ] },

  // ----- Nell -----
  { id: "heart-nell-2", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "Shh! There's a leprechaun in that bush. If we're quiet we can- and it's gone. Because you stepped on a stick." },
    { choice: [
      { text: "\"Teach me to walk like a fox, then.\"", effects: up("nell", 40) },
      { text: "\"The stick started it.\"", effects: up("nell", 30) }
    ] },
    { who: "nell", show: ["nell"], text: "Heh. You're hopeless. Come back tomorrow. Same time." }
  ] },
  { id: "heart-nell-4", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "Foxkin kids get chased out of villages a lot. Crops go missing, people blame the fox. Easy." },
    { who: "nell", show: ["nell"], text: "So I stay in the woods. Nobody blames a tree for anything." },
    { choice: [
      { text: "\"Nobody will blame you in Dawnhollow. I'll make sure.\"", effects: up("nell", 50) },
      { text: "\"You can steal from MY farm. I'll allow it.\"", effects: up("nell", 40) }
    ] }
  ] },
  { id: "heart-nell-6", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "Okay. Fine. Five minutes of tail petting. Because you've earned it. Don't make it weird." },
    { who: "narrator", text: "It is extremely fluffy. Nell's ears go pink at the tips." },
    { choice: [
      { text: "\"Best five minutes of my life.\"", effects: up("nell", 45) },
      { text: "\"Can we make it ten?\"", effects: up("nell", 35) }
    ] }
  ] },
  { id: "heart-nell-8", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "So humans do the charm thing, right? When they like someone? Foxes just bring the other fox a dead rabbit." },
    { who: "nell", show: ["nell"], text: "I'd prefer the charm. For the record. If you were wondering. Which you weren't. Shut up." },
    { effects: up("nell", 20) }
  ] },
  { id: "heart-nell-10", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "I've stopped counting the days until I leave. I started counting the days I get to stay." },
    { who: "nell", show: ["nell"], text: "So if you've got a shiny ring in your pocket, now'd be a great time. Just saying!" },
    { effects: up("nell", 30) }
  ] },
  { id: "confess-nell", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "Is that... for me? Seriously? You're not messing with me?" },
    { who: "nell", show: ["nell"], text: "Yes! Obviously! You're mine now. No take-backs. I have a bow." }
  ] },
  { id: "propose-nell", bg: "forest", once: true, lines: [
    { who: "nell", show: ["nell"], text: "A ring. An actual ring. For a fox." },
    { who: "nell", show: ["nell"], text: "Yes, you big idiot. Yes. I'm moving in. My tail gets its own pillow." }
  ] }
];
