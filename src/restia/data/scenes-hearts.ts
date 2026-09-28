import type { NpcId, SceneDef } from "../engine/types";

/**
 * Heart events (played when talking to someone whose hearts reached the
 * threshold), confessions (Star Charm) and proposals (Eternal Ring).
 * Family (Garr, Bowy, Mitia) get friendship events instead of romance.
 */
export type HeartEvent = { npc: NpcId; hearts: number; scene: string; needsDating?: boolean };

const ROMANCE: NpcId[] = ["lysa", "hilda", "senna", "mara", "frida"];
const FAMILY: NpcId[] = ["garr", "bowy", "mitia"];

export const HEART_EVENTS: HeartEvent[] = [
  ...ROMANCE.flatMap((npc) => [
    { npc, hearts: 2, scene: `heart-${npc}-2` },
    { npc, hearts: 4, scene: `heart-${npc}-4` },
    { npc, hearts: 6, scene: `heart-${npc}-6` },
    { npc, hearts: 8, scene: `heart-${npc}-8` },
    { npc, hearts: 10, scene: `heart-${npc}-10`, needsDating: true }
  ]),
  ...FAMILY.flatMap((npc) => [
    { npc, hearts: 4, scene: `heart-${npc}-4` },
    { npc, hearts: 7, scene: `heart-${npc}-7` }
  ])
];

const up = (npc: NpcId, n: number) => [{ kind: "points" as const, npc, n }];

export const HEART_SCENES: SceneDef[] = [
  // ----- Lysa (Guild receptionist) -----
  { id: "heart-lysa-2", bg: "guild", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "Don't look! I'm eating lunch behind the counter again. Corvin says crumbs on the forms are 'unprofessional'. Corvin has never been hungry in his life." },
    { choice: [
      { text: "\"Take a real break. I'll guard the stamps.\"", effects: up("lysa", 40) },
      { text: "\"Is that a sandwich or a stack of forms?\"", effects: up("lysa", 20) }
    ] },
    { who: "lysa", show: ["lysa"], text: "Careful, Bin. Be that sweet twice and I'll have to flirt with you on purpose instead of by accident." }
  ] },
  { id: "heart-lysa-4", bg: "guild", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "Want to know a secret? I remember every adventurer's name. Every single one who ever walked through that door." },
    { who: "lysa", show: ["lysa"], text: "It's so that when one of them doesn't come back... somebody still says their name out loud. Somebody loud. That's me." },
    { choice: [
      { text: "\"Then say mine a lot. I plan on coming back.\"", effects: up("lysa", 45) },
      { text: "\"That's a heavy thing to carry behind a smile.\"", effects: up("lysa", 35) }
    ] }
  ] },
  { id: "heart-lysa-6", bg: "village", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "My day off, and my feet walked me to the square without asking. I think they were hoping to run into someone." },
    { who: "lysa", show: ["lysa"], text: "When you were 'dead', I kept your card in the top drawer. Not the dead drawer. I told Corvin it was misfiled. For two months." },
    { choice: [
      { text: "\"Walk with me. The Frostwood is pretty when nothing's biting.\"", effects: up("lysa", 50) },
      { text: "\"Thank you for not giving up on me.\"", effects: up("lysa", 45) }
    ] }
  ] },
  { id: "heart-lysa-8", bg: "guild", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "Official announcement from the front desk: the receptionist flirts with everyone equally. That is guild policy." },
    { who: "lysa", show: ["lysa"], text: "Unofficial announcement: she's been breaking guild policy for one specific adventurer. If he ever gave her a Star Charm, she would NOT file a complaint." },
    { effects: up("lysa", 20) }
  ] },
  { id: "heart-lysa-10", bg: "guild", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "I made you a new guild card. 'Bin. Status: alive. Also: mine.' It's not an official field. I added it." },
    { who: "lysa", show: ["lysa"], text: "If you ever wanted to make it official-official... I hear northern silver rings are very durable." },
    { effects: up("lysa", 30) }
  ] },
  { id: "confess-lysa", bg: "guild", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "A Star Charm? For me? Not for the guild? For LYSA?" },
    { who: "lysa", show: ["lysa"], text: "Yes! Yes yes yes. Give me one moment, I'm going to hide behind the request board and scream a little." }
  ] },
  { id: "propose-lysa", bg: "guild", once: true, lines: [
    { who: "lysa", show: ["lysa"], text: "An Eternal Ring. Bin, I have never filled in a form this happily in my whole life." },
    { who: "lysa", show: ["lysa"], text: "Yes. I'll marry you. I'm keeping the front desk, obviously. But now I get to go home with the adventurer who always comes back." }
  ] },

  // ----- Hilda (Ironhand Forge) -----
  { id: "heart-hilda-2", bg: "smithy", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "Hold this. No. With both hands. That's a billet, not a baby. ...Fine, hold it like a baby. It's the right grip anyway." },
    { choice: [
      { text: "\"Teach me how you hear a blade being born.\"", effects: up("hilda", 40) },
      { text: "\"Do you ever take a day off?\"", effects: up("hilda", 20) }
    ] },
    { who: "hilda", show: ["hilda"], text: "Hm. Your hands aren't hopeless. Don't let it go to your head." }
  ] },
  { id: "heart-hilda-4", bg: "smithy", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "You keep looking at the hand. Go on. Ask." },
    { who: "hilda", show: ["hilda"], text: "Frostbite, twelve winters ago, digging a caravan out of a drift. I forged the replacement myself. Took a year. It's a better hand. It doesn't shake." },
    { choice: [
      { text: "\"It's beautiful work. So is the rest of you.\"", effects: up("hilda", 45) },
      { text: "\"Does it still hurt in the cold?\"", effects: up("hilda", 40) }
    ] }
  ] },
  { id: "heart-hilda-6", bg: "village", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "I've been making something after hours. No. You can't see it. It isn't done." },
    { who: "hilda", show: ["hilda"], text: "People think a smith is patient because the iron is slow. It's the other way round. The iron makes you patient. Some things need heat and time." },
    { choice: [
      { text: "\"I can wait. I'm good at waiting for things worth it.\"", effects: up("hilda", 50) },
      { text: "\"Is it a sword? It's a sword. It's definitely a sword.\"", effects: up("hilda", 30) }
    ] }
  ] },
  { id: "heart-hilda-8", bg: "smithy", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "Your boots. I can tell them apart from anyone's in town now. I listen for them. That's a problem." },
    { who: "hilda", show: ["hilda"], text: "If you wanted to make it less of a problem, a Star Charm would do it. Just so you know. Don't make a speech." },
    { effects: up("hilda", 20) }
  ] },
  { id: "heart-hilda-10", bg: "smithy", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "It's done. The thing I was making. Two rings, cold-forged, star-stone set. I made them in case. I don't do things in case." },
    { who: "hilda", show: ["hilda"], text: "I'm not going to ask. The forge doesn't ask. But I'll answer, if you do." },
    { effects: up("hilda", 30) }
  ] },
  { id: "confess-hilda", bg: "smithy", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "...A Star Charm. Cheap tin, badly soldered." },
    { who: "hilda", show: ["hilda"], text: "I'll wear it every day. Yes. Now get out before I burn something, my hands are — my hand is shaking. The real one." }
  ] },
  { id: "propose-hilda", bg: "smithy", once: true, lines: [
    { who: "hilda", show: ["hilda"], text: "You asked. Good. Then my answer is yes, and it was always going to be yes, and I'm going to hit this anvil very hard now so nobody hears me cry." }
  ] },

  // ----- Senna (the Warring Princess) -----
  { id: "heart-senna-2", bg: "village", once: true, lines: [
    { who: "senna", show: ["senna"], text: "Three hundred drills done. Spar with me. You won't win. That is not the point." },
    { choice: [
      { text: "\"Then what's the point?\"", effects: up("senna", 30) },
      { text: "\"Only if you teach me the spear spin after.\"", effects: up("senna", 40) }
    ] },
    { who: "senna", show: ["senna"], text: "The point is that I have not had anyone worth sparring with in a year. You flinch well. It is almost charming." }
  ] },
  { id: "heart-senna-4", bg: "inn", once: true, lines: [
    { who: "senna", show: ["senna"], text: "I have never lost a duel. I have never had a reason to win one, either. I fight because it is the only time my head goes quiet." },
    { choice: [
      { text: "\"I tell jokes for the same reason.\"", effects: up("senna", 50) },
      { text: "\"What happens when it gets loud?\"", effects: up("senna", 40) }
    ] },
    { who: "senna", show: ["senna"], text: "...Then I look for another war. Or, lately, for you at breakfast. That is new. I have not decided if I like it." }
  ] },
  { id: "heart-senna-6", bg: "forest", once: true, lines: [
    { who: "senna", show: ["senna"], text: "You fight like someone who has read every manual and trusts none of them. It is admirable. And very annoying." },
    { who: "senna", show: ["senna"], text: "My father's court wanted me to be a princess who sits. You are the first person who asked what I wanted instead." },
    { choice: [
      { text: "\"So what do you want?\"", effects: up("senna", 50) },
      { text: "\"You'd be a terrible sitting princess.\"", effects: up("senna", 45) }
    ] }
  ] },
  { id: "heart-senna-8", bg: "inn", once: true, lines: [
    { who: "senna", show: ["senna"], text: "I have fought under many banners. I would carry only one into every war left in me." },
    { who: "senna", show: ["senna"], text: "In the south, one gives a token before an oath. I am told that here, it is a Star Charm." },
    { effects: up("senna", 20) }
  ] },
  { id: "heart-senna-10", bg: "havenGate", once: true, lines: [
    { who: "senna", show: ["senna"], text: "I wrote to my father. I told him I have found a battlefield I intend to hold for the rest of my life. He will not understand. He never did." },
    { who: "senna", show: ["senna"], text: "An Eternal Ring, if you would. I have never wanted to lose a duel before." },
    { effects: up("senna", 30) }
  ] },
  { id: "confess-senna", bg: "inn", once: true, lines: [
    { who: "senna", show: ["senna"], text: "A Star Charm. Then this is my oath: my spear, my back, my breakfasts. Yours." }
  ] },
  { id: "propose-senna", bg: "havenGate", once: true, lines: [
    { who: "senna", show: ["senna"], text: "Yes. I accept your terms. Let every war that comes for this town come through both of us." }
  ] },

  // ----- Mara (D-rank diviner) -----
  { id: "heart-mara-2", bg: "guild", once: true, lines: [
    { who: "mara", show: ["mara"], text: "Pick a card. Any card. No, not that one. That one's bent. Pick a card that isn't bent." },
    { choice: [
      { text: "Pick the bent one anyway", effects: up("mara", 40) },
      { text: "Pick the one she's clearly hoping for", effects: up("mara", 25) }
    ] },
    { who: "mara", show: ["mara"], text: "The Fool. Upside down. Laughing. ...I keep drawing it when you're around. It's either a sign or my shuffling is terrible." }
  ] },
  { id: "heart-mara-4", bg: "forest", once: true, lines: [
    { who: "mara", show: ["mara"], text: "I've never had a reading come true on purpose. Only by accident. The guild thinks I'm a diviner. I'm a very lucky guesser." },
    { choice: [
      { text: "\"Lucky guessing is a skill. I've built a life on it.\"", effects: up("mara", 50) },
      { text: "\"Maybe the cards just need you to believe them.\"", effects: up("mara", 40) }
    ] },
    { who: "mara", show: ["mara"], text: "Don't be nice to me, I don't know what to do with my face when people are nice to me." }
  ] },
  { id: "heart-mara-6", bg: "inn", once: true, lines: [
    { who: "mara", show: ["mara"], text: "I did a reading about you last night. A real one. It said 'Haven is not the first world he has walked away from'. Then my candle went out." },
    { who: "mara", show: ["mara"], text: "I'm not asking what it means. I'm asking if you're okay. That's all." },
    { choice: [
      { text: "\"I'm okay. Better, when you're around.\"", effects: up("mara", 50) },
      { text: "\"...Ask me again when I have an answer.\"", effects: up("mara", 45) }
    ] }
  ] },
  { id: "heart-mara-8", bg: "guild", once: true, lines: [
    { who: "mara", show: ["mara"], text: "Today's reading: 'a star, given freely, changes the outcome'. I didn't make that up. Okay, I made the wording prettier." },
    { who: "mara", show: ["mara"], text: "What I'm saying is: Tilde sells Star Charms. For no reason. I'm just reading the cards." },
    { effects: up("mara", 20) }
  ] },
  { id: "heart-mara-10", bg: "forest", once: true, lines: [
    { who: "mara", show: ["mara"], text: "For the first time ever, I'm not going to read the cards. I don't want to know how this ends. I want to find out." },
    { effects: up("mara", 30) }
  ] },
  { id: "confess-mara", bg: "guild", once: true, lines: [
    { who: "mara", show: ["mara"], text: "For the record: I did NOT predict this. Which is how I know it's real. ...Yes. Obviously yes." }
  ] },
  { id: "propose-mara", bg: "forest", once: true, lines: [
    { who: "mara", show: ["mara"], text: "A ring. I drew the Fool again this morning. Right side up this time. Yes, Bin. Every reading from now on says yes." }
  ] },

  // ----- Frida (keeper of the Weaver's shrine) -----
  { id: "heart-frida-2", bg: "village", once: true, lines: [
    { who: "frida", show: ["frida"], text: "Would you sweep with me? It doesn't take long. The snow always wins, but it's nice to lose together." },
    { choice: [
      { text: "Take the other broom", effects: up("frida", 40) },
      { text: "\"The snow is cheating. I've seen it.\"", effects: up("frida", 30) }
    ] },
    { who: "frida", show: ["frida"], text: "You made me laugh at the shrine steps. The Weaver likes that more than any prayer." }
  ] },
  { id: "heart-frida-4", bg: "shrine", once: true, lines: [
    { who: "frida", show: ["frida"], text: "When I was small, I heard a girl laughing inside the empty shrine. No one was there. I've waited to hear it again ever since." },
    { who: "peri", show: ["frida", "peri"], text: "(...Oh. That was me. That was a very long time ago. Don't tell her. Actually — don't NOT tell her. Later.)" },
    { choice: [
      { text: "\"Maybe she's still listening.\"", effects: up("frida", 45) },
      { text: "\"I think she'd like you.\"", effects: up("frida", 40) }
    ] }
  ] },
  { id: "heart-frida-6", bg: "shrine", once: true, lines: [
    { who: "frida", show: ["frida"], text: "You make people laugh even when you're hurting. I watch you do it at the Mug. I don't think anyone else notices." },
    { choice: [
      { text: "\"You noticed.\"", effects: up("frida", 50) },
      { text: "\"Occupational hazard.\"", effects: up("frida", 40) }
    ] },
    { who: "frida", show: ["frida"], text: "You don't have to be funny at the shrine. The Weaver can do the jokes. You can just be here." }
  ] },
  { id: "heart-frida-8", bg: "village", once: true, lines: [
    { who: "frida", show: ["frida"], text: "I tied a little silver bell to my broom. So I'd hear it when I'm happy. It's been ringing a lot, lately. Mostly when you visit." },
    { who: "frida", show: ["frida"], text: "They say a Star Charm left on the shrine steps is a question. I'd answer it." },
    { effects: up("frida", 20) }
  ] },
  { id: "heart-frida-10", bg: "shrine", once: true, lines: [
    { who: "frida", show: ["frida"], text: "In the old Norheim weddings, the couple asks the Weaver to bless a ring. Then she plays one small trick on them, for luck." },
    { who: "peri", show: ["frida", "peri"], text: "(I have SO many tricks prepared.)" },
    { effects: up("frida", 30) }
  ] },
  { id: "confess-frida", bg: "shrine", once: true, lines: [
    { who: "frida", show: ["frida"], text: "A Star Charm... on the shrine steps. The bells are ringing on their own again. I think that's a yes from both of us." }
  ] },
  { id: "propose-frida", bg: "shrine", once: true, lines: [
    { who: "frida", show: ["frida"], text: "Yes. Every morning I'll sweep the steps, and every evening I'll come home to you. The snow can keep winning. I already won." }
  ] },

  // ----- Family -----
  { id: "heart-garr-4", bg: "home", once: true, lines: [
    { who: "garr", show: ["garr"], text: "Sit. Hold this. Your old bow. I oiled it every week for two months. Told myself it was for the wood." },
    { who: "bin", show: ["bin", "garr"], face: "sad", text: "...It was for the wood, right?" },
    { who: "garr", text: "It was for the wood." },
    { effects: up("garr", 20) }
  ] },
  { id: "heart-garr-7", bg: "home", once: true, lines: [
    { who: "garr", show: ["garr"], text: "There are things I haven't told you. About where you went. About someone I met, a long time ago, who wears a black dress and laughs at the wrong moments." },
    { who: "garr", text: "Not yet. When I tell you, it'll be all of it. You have my word." },
    { who: "peri", show: ["garr", "peri"], text: "(...He remembers me. Huh. Good man. Keep your word, old wolf. Not too early.)" },
    { effects: up("garr", 20) }
  ] },
  { id: "heart-bowy-4", bg: "forest", once: true, lines: [
    { who: "bowy", show: ["bowy"], text: "When you were gone, I kept setting up two targets at the range. Habit." },
    { who: "bin", show: ["bin", "bowy"], face: "happy", text: "You missed me." },
    { who: "bowy", text: "I missed the second target. Every time. It was embarrassing. Shut up." },
    { effects: up("bowy", 20) }
  ] },
  { id: "heart-bowy-7", bg: "home", once: true, lines: [
    { who: "bowy", show: ["bowy"], text: "Whatever took you. If it comes back, it goes through me first. That's the whole plan." },
    { who: "bin", show: ["bin", "bowy"], text: "That's not much of a plan." },
    { who: "bowy", text: "It's a good plan. It has Thunder in it." },
    { effects: up("bowy", 20) }
  ] },
  { id: "heart-mitia-4", bg: "atelier", once: true, lines: [
    { who: "mitia", show: ["mitia"], text: "I dream about a palace made of ice sometimes. Towers like icicles. People bowing. I've never seen anything like it. Isn't that strange?" },
    { who: "bin", show: ["bin", "mitia"], text: "I used to draw places I'd never seen too. Turned out they were real." },
    { who: "mitia", text: "...That's not as comforting as you think it is." },
    { effects: up("mitia", 20) }
  ] },
  { id: "heart-mitia-7", bg: "home", once: true, lines: [
    { who: "mitia", show: ["mitia"], text: "You always make jokes when you're scared. It's fine. I can hear the other part too." },
    { who: "mitia", text: "Whatever happens with your two homes, this one keeps a plate for you. Garr's rule. And mine." },
    { effects: up("mitia", 20) }
  ] }
];
