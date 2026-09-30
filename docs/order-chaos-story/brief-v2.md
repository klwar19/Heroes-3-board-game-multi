# Order & Chaos story: rewrite brief (v2)

You are rewriting the dialogue of the "Order & Chaos" mode: a Plants-vs-Zombies-2-style lane
defence game set in Heroes of Might and Magic III. The player is **the Keeper**, who holds a keep
against the Chaos horde. The current script is `src/engine/garrison/order-chaos/story.ts`.
READ IT FULLY FIRST. Do NOT edit it. Write your version to
`docs/order-chaos-story/drafts/story-draft.ts`, then create the empty file
`docs/order-chaos-story/drafts/DONE-v2.txt`. Touch no other file.

## What the user wants
"Change dialogue to be natural and understandable, still funny atmosphere, can be serious at
times. Add some new characters, and dialogue and storyline in more places."

## Voice rules
- Natural spoken English. Short sentences. Read every line aloud: if it sounds like a manual or
  like a list, rewrite it. Contractions are good.
- Understandable first: every briefing must make it obvious WHAT the new threat does and WHAT the
  player should do about it. One idea per line.
- Funny, the way Crazy Dave is funny in PvZ: odd asides, bad logic, running gags (the stew, unpaid
  debts, Crag's old warband). Not every line is a joke. Jokes come from character, not puns.
- Serious sometimes: a few quiet beats that land (people who lost homes to the horde, Crag's own
  past, the courier remembering he was once alive). Short, no speeches, then move on.
- Less shouting. CAPS only for one word now and then. "CRAG! HACK!" is Crag's victory yell: use it
  at most 3 times in the whole script (the big wins).
- Don't overuse "Keeper" as a vocative; at most once in a line and not in every line.
- Each speaker must sound different (swap the names and the line should stop working).
- 2 to 6 lines per scene. Each line at most ~150 characters.

## HARD constraints (these are real game mechanics)
- Every mechanic, number, key, unit name, spell, artifact and hero in the current script is TRUE
  in the game. Keep every one of them, and keep them exactly (e.g. "25 gold every 24 seconds",
  "press G", "press U", "every fourth arrow is a critical hit"). You may reword, reorder and split
  them into clearer lines, but never change a number, never drop a rule the player needs, and
  NEVER invent a mechanic, unit, reward, number or control that is not already in the current
  script. Flavour (feelings, jokes, story) is free; rules are not.
- Keep every existing key: OC_PROLOGUE, OC_WORLD_STORY[1..10], every OC_LEVEL_STORY id (w1-1 ..
  w10-5, r1..r8, oc-endless) with its letter/before/after, OC_EPILOGUE, OC_BATTLE_QUIPS events.
- "after" lines of a level announce the reward the player just got: keep what each one names.
- Letters are from Sandro (the UI header reads "A letter, pinned to the gate with a bone…"). Keep
  them letters, signed by Sandro. You may add a short P.S. by the courier (see Mortimer below).
- Battle quips (OC_BATTLE_QUIPS) show for ~5 seconds in battle: max ~90 characters each, 3-6 per
  event. Other speakers may appear in quips too (e.g. Sandro in "boss", Mortimer in "defeat").

## Cast (existing)
- **Crag Hack** (`crag`, moods talk/grin/shout/sly): Krewlod barbarian, "retired, mostly", parked
  his wagon by the keep, runs the Mercenary Camp, always has stew on, owes and is owed money by
  half of Krewlod. The Crazy Dave: warm, loud, a bit daft, secretly sharp. Teaches every mechanic.
- **Sandro** (`sandro`, moods sneer/rage): the lich of Deyja who raised the horde to take the
  crypt / ley-line nexus under the keep. Polite, vain, passive-aggressive letter writer (the
  Zomboss). Comic, but a real threat.

## Cast (NEW — add these speakers)
- **Queen Catherine Ironfist** (`catherine`, moods `regal`/`stern`): Queen of Erathia. She
  appointed the Keeper. She is also the player's first hero in the game (her Leadership and Royal
  Charge are real). Dry, brave, few words, cares about her people. Appears rarely: prologue
  (the royal commission), end of world 2, end of world 7 (the Hellgate shut: gratitude, and what
  it cost), the epilogue (she pays Crag on time: callback to "Chaos never pays on time").
- **Vidomina** (`vidomina`, moods `cold`/`smirk`): Sandro's ambitious apprentice necromancer.
  Cold, clever, finds Sandro sloppy and theatrical. Arc: first appears with the Necromancers in
  w3-5; runs Deyja while Sandro rides (world 6); mocks Sandro when the Dracolich falls (w7-6
  after); in world 9 a SERIOUS turn: the Rift threatens the dead too, she warns the Keeper for her
  own reasons (not a friend); epilogue: she takes Sandro's seat in Deyja and promises, calmly,
  that she will be back (sequel hook). She is not a playable hero and gives no rewards.
- **Mortimer** (`mortimer`, moods `nervous`/`cheer`): Sandro's skeleton courier, the one who pins
  the letters to the gate. Timid, polite, keeps apologising, likes the smell of Crag's stew though
  he can't eat. Running gag: he keeps delivering letters and lingering. Serious beat in world 6
  (Deyja): he was an Erathian farmer once, raised by Sandro; he half-remembers the meadows. In
  world 8 he quits Sandro and stays at the camp, keeping Crag's ledger. After that he appears on
  the Keeper's side (defeat comfort, camp lines). He never fights and gives no rewards.

## New places for story (write these as new exports in the same file)
1. `OC_WORLD_OUTRO: Record<number, OcLine[]>` for worlds 1 to 9: a short scene (2-5 lines) shown
   once when the world's last level is first cleared (w1-5, w2-5, ... w9-5). It closes that
   world's chapter and points at the next one. World 10's ending is OC_EPILOGUE (keep it; expand
   it with the new cast, 7-12 lines).
2. Raid "after" lines: add `after` (1-2 lines) to r1..r8 in OC_LEVEL_STORY, said when the player
   wins that raid (the player commands the horde in raids). Crag, maybe Sandro sulking.
3. `OC_SCREEN_LINES: Record<"camp" | "barracks" | "almanac" | "home", OcScreenLine[]>` where
   `type OcScreenLine = OcLine & { after?: string }`: a greeting shown at the top of that menu
   screen (one picked at random among those whose `after` level id is cleared; no `after` = always).
   5-8 per screen. Camp = Crag's Mercenary Camp (hires Nighon Minotaurs/Beholders for Seals; opens
   after w2-5). Barracks = spend Seals to train troops (+15% health and power per level; level 3
   unlocks Ascension once the Altar is found, w2-5). Almanac = the book of every unit and foe.
   Home = the title screen. Mortimer's camp lines need `after: "w8-5"`. Catherine may appear on
   home. Don't state mechanics beyond what is listed here.
4. `OC_ENDLESS_LINES: { best: OcLine[]; short: OcLine[] }`: said after an Endless Siege run
   (`best` = new record, `short` = no record). 3-4 each.
5. Mix new speakers into existing scenes where it fits the arc (e.g. Mortimer after a letter,
   Vidomina in w3-5/w6-x/w9-x). Keep Crag the main voice; he still teaches all the rules.

## File format (must be valid TypeScript, same helpers)
```ts
const crag = (mood: "talk" | "grin" | "shout" | "sly", text: string): OcLine => ({ who: "crag", mood, text });
const sandro = (mood: "sneer" | "rage", text: string): OcLine => ({ who: "sandro", mood, text });
const catherine = (mood: "regal" | "stern", text: string): OcLine => ({ who: "catherine", mood, text });
const vidomina = (mood: "cold" | "smirk", text: string): OcLine => ({ who: "vidomina", mood, text });
const mortimer = (mood: "nervous" | "cheer", text: string): OcLine => ({ who: "mortimer", mood, text });
```
Copy the header types from the current file; you may leave OC_SPEAKERS for the new speakers as a
TODO comment (Claude wires portraits). Use `\n` in letters like the current file. Plain ASCII
quotes/apostrophes. No em dashes: use commas, colons or full stops.

When done, create `docs/order-chaos-story/drafts/DONE-v2.txt`.
