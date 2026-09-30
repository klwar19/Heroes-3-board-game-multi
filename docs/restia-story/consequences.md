# Consequences, game over and fates (writer + engine guide)

Engine: `src/restia/engine/story.ts`, data: `src/restia/data/endings.ts`.
Everything here is **story-driven**: deaths, departures and bad ends come from bad
choices or bad situations the player walked into, never from random combat rolls.

## Tools a scene can use
| Want | Write |
|---|---|
| Nudge morality | `{ kind: "karma", n: -3 }` (hidden, -100..100) |
| Track a story stat | `{ kind: "trait", key: "courage", n: 1 }` (any key: snark, charm, sanity, suspicion, trust:peri...) |
| Remember a decision | choice line `key: "..."` + option `id`, or `{ kind: "record", key, option }` |
| Branch on the past | `{ if: { kind: "chose", key: "p3TrashCan.jakeLily", option: "collar" }, goto: "..." }`, also `karma`, `trait`, `battle`, `fate`, `ending`, `not`, `any`, `all` |
| Option only for some players | option `when:` (hidden) or `requires:` + `hint:` (shown locked) |
| Lose a story battle into a scene | give the encounter a `loseScene` (even non-soft); that scene can lead anywhere, including a bad end |
| Game over | `{ kind: "ending", id: "badSomething" }` with a `kind: "bad"` ending in endings.ts (title, epitaph, Peri's `hint`) |
| Lose a side character for good | `{ kind: "fate", who: "tilde", fate: "dead" | "left" | "missing" }` |
| True / good ending | an ending with another kind: the story ends with the ending card |

## Game over = Peri's Green Room (Monster Girl Quest style)
- Triggers: a bad ending, or a `fate` on a **main party member** (Bin, Garr, Bowy, Mitia,
  Hilda, Senna: anyone in `CHARACTERS`). Main party deaths always go through a game over.
- Peri reviews the flop (quip + the ending's hint), the bad end is added to the collection,
  and the player **rewinds** to the last checkpoint or quits to the title.
- Checkpoints: every morning, whenever a scene starts (it replays from its first line),
  and before a story battle started outside a scene. Scenes that contain an `ending` or
  `fate` effect never become checkpoints (no rewind loops).
- Price: **Bad Ratings** for 3 days: party ATK/DEF/MAG/RES -10%, Jester Points halved.
- Writing rule: a bad end should feel earned and be foreshadowed (Peri or someone warns
  first), and the hint should point at the real fix. Bad ends can be grim: gory deaths,
  giving up, terrible things happening. Keep it in the story's voice.

## Side characters can really go (Sengoku Rance style, but story-driven)
When a side character's fate is sealed:
- they vanish from town (no schedule, no talking, no gifts, no heart events);
- they stop posting guild requests;
- a building they own closes for 7 days ("Closed for mourning"), then reopens with a stand-in;
- they become a **scar**: listed in the journal, and every 7 days the morning summary brings them up.

## How future chapters should handle it
1. **Warn, then bite.** Every lethal branch gets a warning beat earlier (a bad feeling, Peri
   hinting, a character begging you not to). Deaths without warning feel random; avoid them.
2. **Scenes check fates.** Any later scene that would feature a lost character needs an
   `if fate` branch: someone else takes the line, or the absence is the point
   ("Lysa's desk is still empty. Corvin does the stamps now. Badly.").
3. **Stand-ins per building** (to write when it first matters): guild -> Corvin, store ->
   Tilde's niece, shrine -> candles left by villagers.
4. **Consequences ripple, gently.** A loss can lower related characters' hearts, unlock a grief
   scene, change a request pool or a price, or give Bin a trait (e.g. `grief`, `resolve`)
   that later choices read. Don't cut major content off with no replacement.
5. **Protected until their arc resolves.** Like Sengoku Rance's undismissable characters,
   anyone whose chapter isn't finished shouldn't be killable yet.
6. **Main party**: only through game over. If a later chapter wants a permanent party death,
   make it a scripted, unavoidable story beat with its own scenes, not a fail state.
7. **Prologue**: choices only nudge karma/traits/records. No deaths, no bad ends.
