# Brief: Prologue prose pass v5 (longer, told like a light novel)

Read first: `docs/restia-story/style-guide.md` (cast voices, Spice rules, adults-only line, line
format) and `docs/restia-story/canon-notes.md` (the author's world bible).

Input: the current game script, one file per scene, in `docs/restia-story/drafts/final/`.
Output: `docs/restia-story/drafts/prologue-v5/<same file name>`. Only line objects, same format.

## The goal
The author wants the prologue LONGER and told with more storytelling: real prose, more beats,
more atmosphere, same spirit. Read it like a light novel crossed with a visual novel:
- **Light novel narration** (think Mobuseka / "Otome game world is tough for mobs"): a first-person
  narrator who is always snarking at his own life, grounded in mundane physical detail (a tie
  that's too tight, sauce on a sleeve, blisters from a shovel), comedy that escalates through
  misunderstanding and running gags that come back and get funnier, serious warnings dropped
  casually mid-conversation, body language instead of explanation.
- **Clannad rhythm** (visual novel): people talk in circles, "Um...", ".........", someone
  points at you, a small action on its own line, a silly exchange that suddenly lands one quiet
  line that hurts. Inner thoughts that argue with themselves ("That's right. That's the only
  reason.").

## What changes from the old rules
- **Narrator lines may now be prose**: 1 to 3 sentences, up to about 45 words (hard cap 260
  characters). Mix sensory detail (smell, cold, sound, light) with Bin's snark in the same line.
  Then follow with a short punch line for rhythm. Long, short, long, short.
  Example (rewriting two old lines):
  ```ts
  { who: "narrator", text: "The corridor smells of alcohol wipes, floor wax and the four o'clock rice porridge, which tastes like a hug from someone who doesn't like you very much." },
  { who: "narrator", text: "As I pass room two, a monitor gives three sharp beeps." },
  { who: "narrator", text: "My heart climbs into my throat. Every time. Then a nurse strolls in, presses a button without looking, strolls out again, and I remember how breathing works." },
  { who: "narrator", text: "On this ward, the beeping isn't the scary part." },
  { who: "narrator", text: "The scary part is when a room goes quiet." },
  ```
- **Dialogue lines stay one breath** (at most ~30 words). Length in conversations comes from more
  back-and-forth, interruptions and reactions, not speeches.
- **Target length**: each scene about 1.6x to 2x its current line count, and clearly more words.
  Earn it: new small beats, played-out moments, callbacks, atmosphere. No filler, no repeating
  the same joke without escalation, no summaries ("the days blur" is banned; play the day).

## Keep (hard rules)
1. Keep every existing beat, every good joke and every plot fact. Rewrite and expand lines, but
   never cut a beat or change what happens. Canon facts (ages, names, who knows what) stay.
2. Copy every non-text entry EXACTLY (same fields, same values, same relative order):
   `{ effects: [...] }`, `{ label: ... }`, `{ goto: ... }`, `{ if: ..., goto: ... }` and every
   `choice` line (option ids, option text, effects, gotos unchanged; you may reword only the
   prompt `text` of the choice line). New lines go around them, never between a choice and the
   label it jumps to in a way that changes which lines a branch plays.
3. `p5Eos.ts`: the battle line `{ effects: [{ kind: "battle", encounter: "eosTrial" }] }` must
   stay the LAST line.
4. Every label that is jumped to must still exist; every branch must still reach the shared
   ending label it reaches now.
5. Speakers, backgrounds and faces: only the ones listed in the style guide. Faces:
   happy | angry | sad | surprised | blush. `show` = who is on stage (max 3, portraits only).
   Keep `bg` switches where the scene changes place; add a new `bg` only from the list.
6. Tense: present tense in present-day scenes. The flashbacks (p0Bookstore, p0Saturdays,
   p0Bracelet) may keep their current mix (present for the moment, past for looking back).
7. Spice exactly as the style guide says. ADULTS ONLY for anything suggestive: never Lily, the
   ward kids, or the teen flashbacks (Bin and Ling Ling at 14-17). Peri is an adult (petite,
   gothic lolita) and may be crude ABOUT Bin's love life, but is never the object of it.
8. Humour first, not pretentious, nobody knows it all. The "humour as a mask" theme stays spice:
   never have anyone name it or analyse it.
9. Punctuation like the current script: straight quotes only (`"` around text, `'` inside, no
   curly quotes); the em dash `—` only for cut-off or interrupted speech ("Wait, what do you—").

## Ideas for new beats (use what fits, invent your own in the same spirit)
- p0Bookstore: the smell and sound of Old Zhou's shop in winter; the hot milk tea ritual; the
  two of them inventing a wuxia sect with terrible move names (hers are cool, his are not) that
  later scenes could call back; Old Zhou pretending not to listen.
- p0Saturdays: the empty stool on a Saturday she doesn't come; Old Zhou's "She used to laugh.
  Now she performs." played as a moment, not a quote; Meilin's warning in a real setting; Leo's
  first day (food is involved).
- p0Bracelet: saving delivery tips for the bracelet; rehearsing the speech at night; the walk to
  the spot; the silence after; three days in a dark room with a buzzing phone; Leo's duck;
  Meilin's key; the locker joke; keep Ling Ling's hook at the end.
- p1Daily: the morning routine as a nature documentary; the elevator that smells like regret; a
  customer who tips in tangerines or a complaint; Jake's flat tyre; lunch banter with Leo and
  Meilin; the gym delivery (keep the choice); the Luna near-crash; the night with Lily.
- p1Kfc: the heat, grease and ring light of the livestream; Chad's chat scrolling (crude and
  thirsty); the choice; the aftermath of going viral.
- p2Ward: the ward's daily rhythm; the kids; Nurse Chen Wei's deadpan; the billing envelope.
- p3TrashCan: the build-up with Jake's goons; the chase as slapstick; the can; Luna looking down;
  the sky rant that stops being funny; the walk home in garbage.
- p4Goddess: the bedroom described in shameful detail; Peri's entrance; the roast; the mask slip
  when Lily is mentioned; the kick.
- p5Eos / EOS_AFTER / p6: the too-perfect sandbox; Jess booting up; the loop villagers getting
  creepy then funny; the polite bear; Peri visiting; the crystal choice (unchanged).
- p7NextDay: the morning after with the crystal; Leo, Meilin, Luna's warning line.
- p8Contract: the night job lie to Lily and her promise; Peri, the terms, the thumbprint, the
  portal smell of pine and snow, "going back vs forward", the kick.

## Output
Write the files for the batch you are asked for, then `NOTES-<batch>.md` (one short paragraph
per scene: what you added) and then the marker `DONE-<batch>.txt`, all in
`docs/restia-story/drafts/prologue-v5/`. Create files ONLY in that folder. Do not edit anything
else. Do not run commands.
