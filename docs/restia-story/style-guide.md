# Bin's Otherworld Chronicle: writing style guide (for every writer, human or AI)

## Tone
Humorous, sometimes snarky and trolling, never pretentious. Sometimes emotional, and serious when
it matters (Lily, Garr, the people Bin loves). Think Chinese system manhwa (Ultimate Scheming
System, Cat System, I'm an Evil God) meets Clannad: dumb banter that escalates, then one quiet
line that hits.

- Nobody sounds like they know it all. Characters guess, hesitate, get things wrong, contradict
  themselves, and change the subject when it hurts.
- Bin is a broke, tired 20-year-old, not a genius quipping machine. Sometimes the joke fails and
  he just stands there.
- Peri is a snarky, trolling goddess who acts like a bored streamer: childish, bratty, fun. She is an ADULT (ancient goddess in the form of a petite woman, early twenties, gothic lolita style) and the story treats her as one.
- The "humour as a mask" theme is SPICE ONLY: at most a rare, unexplained moment. Never have
  characters analyse it, name it, or talk about masks. The scenes are about the people and the
  jokes, not the theme.
- Jess (the System, speaker `system`) is a sarcastic UI with feelings she denies.
- Every character has their own voice (see the cast below). If you swap the names and the line
  still works, rewrite it.

## Spice (user ruling 2026-09-30)
The story is NOT limited to SFW any more. Add flavour properly, like Japanese manga / visual
novels, and keep it funny:
- **Violence**: allowed and can be vivid (a wolf's jaws, blood on snow, a club to the face),
  often played for slapstick, sometimes played straight when it matters.
- **Horror**: sometimes. Short creepy beats: something wrong in the dark, a glitching NPC smile
  that holds a second too long, a voice that knows your name. Then usually undercut by a joke.
- **Adult humour and adult content (user ruling 2026-09-30, widened)**: dirty jokes, innuendo,
  crude banter, fanservice gags, accidental compromising situations, flustered reactions, a
  character teasing Bin mercilessly, Bin's brain short-circuiting, adults talking frankly about
  sex and bodies. Adult content is allowed between adults; keep it funny or character-driven
  (manga / adult VN tone), never just filler.
- **Build-up, not a jump** (think ToHeart2-style visual novels): romance and ecchi grow slowly with
  the story and with each relationship. The prologue and early chapters stay light: accidental
  closeness, flustered reactions, teasing, a little innuendo, Bin's brain crashing. Stronger
  moments come later and only with characters Bin has actually grown close to (heart events).
- **HARD LINE: lewd/sexual content ONLY between adults.** Never anything suggestive involving
  Lily (10), the ward kids, or anyone in the teen flashbacks (Bin and Ling
  Ling at 14-17). Those scenes can still have violence, horror and comedy.
  Adults include: Bin (20, present day), Luna, Meilin, Nurse Chen Wei, the gym girl, and adult
  Haven characters.

## Visual-novel form (this matters most)
- **The narrator IS Bin's inner voice**: first person, present tense.
  GOOD: "Someone is scrolling through my phone." / "I don't own a phone that glows like that."
  BAD: "Bin notices that the girl is there again, which surprises him."
- **Rhythm is varied and natural, never uniform.** Combine three styles and switch between them
  as the moment needs:
  - *Light novel* (Mobuseka): chatty, snarky first-person asides mid-scene, grounded in physical
    detail, comedy that escalates through misunderstanding.
  - *Clannad*: quick back-and-forth, hesitation ("Um...", "........."), one quiet line after the
    loudest joke, jokes that come back later as the emotional payoff.
  - *Tsukihime-style introspection*: at quiet, eerie or heavy moments, the narration can run long:
    a flowing line of 50-70 words that circles a feeling, repeats a phrase with a change, follows a
    sensation (cold, a sound, a smell) until it tips into dread or longing. Then a fragment.
  So a scene might go: two short lines, a 60-word reflective line, one-word punch, fast dialogue,
  a three-line list of sensations. Long when the moment is slow or deep, short when it is fast or
  funny. Hard cap 380 characters per line (the dialogue box grows); most lines stay shorter.
  Dialogue stays natural speech: usually one breath, a rant or a nervous ramble can run longer.
- Plain words beat big ones. Never inflate a line with thesaurus vocabulary ("utilize",
  "possess", "commence"); Lily sounds ten, Bin sounds tired, not like a legal document.
- Let people talk in circles: interruptions, "Um...", ".........", repeated running gags that
  escalate (Clannad's "that's the first thing that came to mind. Sorry." pattern).
- Small sound effects and actions as their own lines: "Tonk!", "Sssip...", "She points at me."
- Short muttered thoughts in parentheses as Bin lines: `(This sucks...)`.
- Don't summarize events ("The next three days blur"). Play them.
- End each scene on a hook or a warm/quiet beat, never on an info dump.

## Cast voices
- **Bin (20)**: deadpan, self-deprecating, documentary narrator of his own misery ("Here we see the
  delivery boy in his natural habitat"). Drops ALL jokes when someone uses Lily against him.
- **Lily (~10)**: sharp, mischievous little sister in hospital. Calls him "Bin-Bin". Merciless
  about his love life. Hides how sick she feels.
- **Leo Zhang**: golden retriever, always eating, films everything, simple and loyal.
- **Meilin Wu**: childhood friend since 7, blunt, notices things, says the one sentence nobody
  wants to hear, then helps anyway.
- **Luna Park**: "Ice Queen", sociology major, kuudere. Clipped, precise, cold but not cruel. Keeps
  distance to protect him (an Organization exploits her future-sight). Never explains.
- **Jake Hwang**: rich campus bully, fragile ego, loses every word fight so he escalates physically.
- **Ling Ling (Zhao Lingwei)**: bookstore friend who chose cruelty at 17 under family pressure.
  Conflicted, polished, performs.
- **Peri**: see above. Petite adult in gothic lolita fashion, galaxy eyes, starlight phone, cosmic popcorn.
- **Jess (system)**: prefixes system notices with `[CJS]`; talks normally otherwise.

## Line format (the game's data format)
Output TypeScript objects, one per line, in this exact shape:
```ts
{ who: "narrator", text: "She's there again." },
{ who: "bin", text: "You again...?" },
{ who: "bin", face: "sad", text: "..." },            // Bin faces: happy | angry | sad (omit = normal)
{ who: "lily", show: ["bin", "lily"], text: "..." }, // show = who is on stage (portraits), max 3
{ who: "narrator", bg: "earthHospital", text: "..." }, // bg switches the background from here on
{ choice: [ { text: "Option A", goto: "a" }, { text: "Option B", goto: "b" } ], who: "bin", text: "prompt line" },
{ label: "a" },
{ goto: "after" },
```
Speaker ids you may use: narrator, bin, system, peri, lily, luna, leo, meilin, jake, chad, lingling,
nurse, oldZhou, zhaoKang, gymBro, repairman, villager (all with portraits), plus name-only
speakers (no portrait): student, kid. Put a speaker in `show` only if they have a portrait.
If you truly need a NEW minor speaker, use a new camelCase id and list it (id + display name +
one-line look) in the job's NEW-SPEAKERS.md; never invent one silently.
Backgrounds: earthApartment, earthCampus, earthKfc, earthHospital, earthBookstore, eosMeadow,
earthCafeteria, earthGym, earthLibrary (library courtyard), earthStreet (street / alley / repair
stall / station stalls), earthSchool (high-school corridor with lockers, for the flashbacks),
eosVillage, eosCave.
Use only `"` double quotes around text; use ' inside text.
