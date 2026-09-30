# Restia story rewrite: Prologue + Chapter 1 layout (draft for review)

Sources: `Desktop/new story example.docx` (canon + prose), `Desktop/CSJ story ideas.docx` (gym bro),
current script `src/restia/data/scenes-story.ts`.

## The problem
The prose in the source doc plays scenes out. The game script summarizes them:
narrator lines like "The next three days blur" replace whole events. The Eos trial is one battle
plus one line. Most scenes are 5-18 lines.

## Rules for the rewrite
- Tone (from the doc): human, snarky, a bit absurd, pathetic but hopeful. Not dry, not know-it-all.
- Show, don't summarize: a beat the doc describes becomes dialogue the player clicks through.
- Lines stay short (one breath, ~25 words max) because they're shown on a dialogue box. Length comes from MORE lines, not longer ones.
- Every scene ends on a hook or a warm beat, never on an info dump.
- Keep the existing flags, battles and quest effects so the game still works.
- Name-only speakers are fine (no portrait): Old Zhou, Zhao Kang, Gym Bro, Villager, Miller.
- English, SFW.

Target: Prologue ~350 lines (now ~120), Chapter 1 ~450 lines (now ~250).

---

## PROLOGUE: Earth

| # | Scene | Now | New beats | Target | Writer |
|---|---|---|---|---|---|
| P0a | **Bookstore, age 14** | 6 lines | Old Zhou's shop. Bin meets Ling Ling over wuxia. The notebook: frozen forest, guild, half-orc with crossbow. She doesn't laugh. She stares at the armoured girl on the ice cliff. | 15 | Claude (from doc) |
| P0b | **The Saturdays thin, 15-16** | 2 lines | Zhao Kang at the door. Old Zhou: "She used to laugh. Now she performs." Meilin's warning: "She looks at you like she's deciding whether to keep the book or put it back." Leo arrives: hungry, loyal. | 12 | Claude |
| P0c | **The bracelet, 17** | 8 lines | Star-charm bracelet, the short speech, the almost-yes, Kang's phone, the cruelty. Charm under the car. Three days away: Leo's duck, Meilin's key. Locker "BIGEST" and the Ling Ling Rule. **New hook:** that night Ling Ling crawls under the car and pockets the broken charm. | 20 | Claude |
| P1 | **NEW: A day in the life** | none | 6:30 noodles. Documentary narration ("the elevator that smells like regret"). Jake's flat scooter tyre. **Gym Bro delivery** (story ideas doc; player choice of roast). First near-crash into Luna, word-vomit, flee. Night: Lily clocks the crush ("your ears are red"). | 40 | Gemini draft, Claude edit |
| P2 | **KFC livestream** | 15 | Keep the 3-line choice. Add the "another Luna disaster" setup. Chad's chat scrolling. After: 3 days of fame (cafeteria pickup-line request). Full library-courtyard Luna scene from the doc. | 35 | Claude |
| P3 | **Lily's fan club** | 13 | Full doc version: Lily's impression, Nurse Chen Wei, the girlfriend question, the chemo kid's pickup line. Billing envelope folded small. | 25 | Claude |
| P4 | **Jake + trash can + sky rant** | 23 | Doc version: goons hold Jake back, "You're dead. You just don't know it yet." Chase, can, Luna, rescue, Leo filming. The rant in full. Walk home: bank balance, texts to Lily, sitcom laugh track. | 45 | Claude |
| P5 | **The goddess in his bedroom** | 23 | Doc version: three conscious thoughts, search history (incl. "Luna Park sociology schedule"), the copy phone, "cosmic director of 'and then it got worse'". **Add:** Peri finds his Ling Ling photos ("she's going to be a problem"). Peri hints Luna's in over her head. Shopping cart. The Lily moment. Free trial, twelve candidates, kick. SEASON ONE file. | 60 | Claude |
| P6 | **Eos trial, 3 days** | 1 battle + 5 lines | **Day 1:** arrival, Jess boots up, tutorial goblins (existing battle). **Day 2:** villagers who loop the same 3 lines (Bin tries to break the loop). Fetch quests done out of spite. The "very polite" cave boss. **Day 3:** Peri visits the sandbox. The reward crystal, with a **choice**: cash it for JP, or send it to Lily. Only "Lily" moves on. Selling = Peri laughs, Jess refuses the sale, back to the choice. | 50 | Gemini draft, Claude edit |
| P7 | **The morning after** | 9 | Leo's jianbing, Meilin's "brain leaves your body", Luna watching. **Add:** Luna passes him and says one cryptic line ("Stop being interesting. It's not safe."). Lily's good numbers, the crystal glowing on the sill. | 25 | Claude + Gemini for the Luna line |
| P8 | **The contract** | 27 | Keep the JP bonus branches. **Add before it:** Bin tells Lily he got a "night job", and she makes him promise to come back with stories. Then Peri, terms, thumbprint, portal, "going back vs forward", kick. | 35 | Claude |

---

## CHAPTER 1: Snow on the Road Home (Haven)

| # | Scene | Now | New beats | Target | Writer |
|---|---|---|---|---|---|
| H1 | **The road** | 13 + battle | Cold shock (Earth clothes, knee-deep snow). The burned mile-marker he knows. The notebook realization. Jess: "missing two months, from HERE?" First rude-candle coin. Wolf fight. | 25 | Gemini draft |
| H2 | **The gate** (2 routes) | 12 | Gate route: the guard's panic, Garr's double shifts. Mug route: the death-theory argument, soup, his old sword over the fireplace. Both routes: gossip outruns him. | 15 per route | Gemini |
| H3 | **Home** (the emotional centre) | 18 | Bowy: punch, hug, demand. Mitia: tears, then the bunk she kept made. Garr's one good eye. **Choice:** "Where were you?": truth ("a goddess kicked me") or a joke. Garr reacts to "goddess" a beat too fast. **New:** late night, Garr alone at the hearth with a small Weaver charm. He almost says something, then doesn't. | 45 | Gemini draft, Claude edit |
| H4 | **Pocket Haven** | 5 | Garr grumbles at the door that wasn't there. Mitia steps through, and a meadow bird lands on her hand (her bloodline hint). Then the tutorial. | 20 | Gemini |
| H5 | **The Guild** | 25 | Doc version: the whole family walks in together. Lysa, Corvin's triplicate, Dain/Mara, Kael, twins (keep the pay/dodge choice), Tessa's warm-up job. | 40 | Claude |
| H6 | **Town intros** (Tilde, Frostwood, Hilda, Frida) | 5-8 each | Each gets one real exchange that shows who they are, not just what they sell. | 15 each | Gemini |
| H7 | **Frostcaps** | 7 | Crates of frostcap in the old shed, stuffed with straw. Mitia's traveller in good boots. The coin count. Mitia wants her shop back. | 25 | Gemini |
| H8 | **The Screaming Log** | fine | Small punch-up only. | +5 | Gemini |
| H9 | **The Cat Job** | ~25 | Tuli's contract negotiation. Hermit Rolf gets a real conversation (he met the traveller). Six coins, "who has a cough", then the wolves. | 35 | Gemini |
| H10 | **Dinner** (finale) | ~35 | Garr's one sentence of being glad, one of being angry. The journal. Bin cries on the turnip. The knock, the Buyer (keep the 3 choices and battle). **New closer:** on the porch after, Garr: "The Weaver told me something about you once. Not tonight." Peri's episode sign-off. | 60 | Gemini draft, Claude edit |
| H11 | **Build scenes** (Apothecary, Forge, Shrine) | 3-5 each | Each recruit gets a proper "I'm coming with you" scene. | 12 each | Gemini |

---

## Workflow
1. You adjust this layout (cut, add, reorder, change tone).
2. **Claude** rewrites the scenes that have source prose in your doc, trimmed to dialogue-box length.
3. **Antigravity (Gemini)** drafts the scenes without source prose, from a brief per scene: this layout, the character sheet, 2 of the current scenes as style examples, the exact line format.
4. **Claude** edits the drafts for voice, checks every speaker/background/flag, wires them into `scenes-story.ts`, and type-checks.
