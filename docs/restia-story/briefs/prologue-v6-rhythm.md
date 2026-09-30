# Brief: Prologue pass v6 (rhythm and adult humour)

Read first, fully: `docs/restia-story/style-guide.md` (UPDATED today: the "Rhythm is varied" rule
and the widened adult-content rule), `docs/restia-story/clannad-technique-notes.md`, and
`docs/restia-story/canon-notes.md`.

Input: `docs/restia-story/drafts/prologue-v5/` (14 files: the current, edited game script).
Output: `docs/restia-story/drafts/prologue-v6/<same file names>`, same line format.

## The goal
The author says the narration feels too uniform. Make the rhythm natural and varied, the way a
good light novel or visual novel breathes, by combining three styles:
- **Light novel** (Mobuseka): chatty, snarky first-person asides, grounded in physical detail.
- **Clannad**: fast back-and-forth, hesitation, one quiet line after the loudest joke.
- **Tsukihime-style introspection**: at quiet, eerie or heavy moments, one long flowing narrator
  line (50-70 words) that circles a feeling, repeats a phrase with a change, or follows a
  sensation until it tips into dread or longing. Then a fragment.
Long when the moment is slow or deep. Short when it is fast or funny. Never the same length ten
lines in a row. Every scene should have at least one long reflective line and several one-to-
three-word punches.

Good places for the long introspective lines (examples, not a checklist): the bookstore in winter
(p0Bookstore), the empty stool (p0Saturdays), the three days in the dark flat (p0Bracelet), the
ward at night / the billing envelope (p2Ward), the walk home in garbage (p3TrashCan), Peri's eyes
(p4Goddess), the too-perfect meadow and the frozen villagers (p5Eos, EOS_AFTER), "It sounds like
snow" (p7NextDay), the portal and the voice (p8Contract).

## Adult humour (adults only)
The author allows adult jokes and adult content between adults. Add some where it is natural and
funny, not everywhere: Chad's chat, the gym girl, Nurse Chen and Nurse Fang teasing Bin, Meilin
and Leo roasting Bin about Luna, Bin's brain crashing near Luna, Peri being crude about Bin's love
life and search history, Jess being dry about it. HARD LINE: never anything suggestive involving
Lily (10), the ward kids, or the teen flashbacks (p0Bookstore, p0Saturdays, p0Bracelet: Bin and
Ling Ling are 14-17). Peri is an adult but is never the object of it; she makes the jokes.

## Hard rules
1. **Mechanics**: copy every non-text entry exactly (effects, labels, gotos, ifs, choice lines with
   their options). `p5Eos.ts` must still end with the battle line.
2. **Dialogue lines** (any `who` other than narrator) that already exist stay WORD FOR WORD, in the
   same order. You MAY add new dialogue lines between them (new jokes, reactions, hesitations).
3. **Narrator lines** you may rewrite, merge, split, lengthen or shorten, but keep every fact and
   beat. These callback lines must stay word for word (they pay off elsewhere):
   - "The velvet box lies upside down on the kerb." / "I pick it up. I'm careful not to squeeze the corners."
   - "Then her face shuts." / every "Tink." line
   - "The vending machine by the pharmacy hums. Hot milk tea, three yuan." / "My hand pulls my sleeve over my thumb before I remember I'm not buying one."
   - "Across the plaza, a dozen phones are still up. Leo's isn't. Nobody told him to lower it."
   - "Then, for a second, snow." / "Pine smoke. A door with an axe in the frame. Someone on the other side, waiting up."
   - "She lowers the starlight phone into her lap. First time she has let go of it."
   - every line containing "galaxies in her eyes stop turning"
   - "It smells like pine smoke and iron. Exactly like the dreams." / "She says it too lightly."
   - "Someone is scrolling through a phone in my flat. Again."
   - "I have never heard that voice in my twenty years on Earth." / "I am completely certain of it." / "...Almost certain."
4. **Plain words.** No thesaurus inflation ("possess", "utilize", "commence", "extraordinarily").
   Long lines are long because they follow a thought, not because the words are big.
5. Lines: narrator hard cap 380 characters; dialogue usually one breath (a rant or nervous ramble
   can run longer, cap 260 characters). Straight quotes only; em dash only for cut-off speech.
6. Speakers, backgrounds, faces and `show` rules as in the style guide. No new speakers.
7. Overall length: about the same to 25% longer. This is a rhythm pass, not a padding pass.

## Output
Write the files for the batch you are asked for, then `NOTES-<batch>.md` (per scene: where you put
long lines and adult jokes) and then `DONE-<batch>.txt`, all in
`docs/restia-story/drafts/prologue-v6/`. Create files ONLY there. Edit nothing else. Run no commands.
