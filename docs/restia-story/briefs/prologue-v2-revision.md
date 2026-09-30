# Brief: Prologue revision pass v2 (deeper, longer, richer)

Read first: `docs/restia-story/style-guide.md` (tone, voices, line format, speakers, backgrounds).
Source material: `src/restia/data/scenes-prologue.ts` (the current prologue, 13 scenes + EOS_AFTER).
Canon: `docs/restia-story/canon-notes.md` if present, otherwise the style guide cast notes.

## Goal
The user liked the current prologue and wants it **richer**: more lines, more depth, more
background, more life in the side characters, more small things happening. Nice prose narration
(still Bin's first-person inner voice, one breath per line) and natural dialogue. Target roughly
**1.6x to 2x** the current length of every scene (about 1,300-1,500 lines total).

Ideas for what to add (use your judgement, don't do all of it everywhere):
- Sensory detail and place: what the bookstore, the hospital at night, the campus, Eos smell and
  sound like. One or two lines, not paragraphs.
- Side characters with their own small wants: Old Zhou, Nurse Chen Wei, the repairman Old Qian,
  the stall lady, ChadThunderLive's chat, the ward kids, Leo's mum (off-screen), the cabbage
  villager.
- Small events between the big ones: a bus ride, a delivery gone wrong, a text thread, a
  memory triggered by an object.
- More back-and-forth banter that escalates (Clannad running gags), and more quiet beats with
  Lily and Meilin.
- Plant small seeds for later (without explaining them): the notebook drawings (frozen forest,
  half-orc with a crossbow, ice-cliff girl) keep echoing; Luna seems to know things before they
  happen; Peri knows more about Bin's past than she says; the Zhao family is powerful and cold.
- Keep the humour-as-armour theme as spice only (see style guide). No speeches about it.

## Hard rules (the game breaks otherwise)
- Keep every scene id and write one file per scene:
  `docs/restia-story/drafts/prologue-v2/<sceneId>.ts`, plus `EOS_AFTER.ts` for the shared Eos
  days 2-3 block. Each file contains ONLY the line objects, one per line (no imports, no
  `id:`/`bg:` wrapper, no commentary).
- Scene ids: p0Bookstore, p0Saturdays, p0Bracelet, p1Daily, p1Kfc, p2Ward, p3TrashCan,
  p4Goddess, p5Eos, p6EosWin, p6EosLose, p7NextDay, p8Contract, and EOS_AFTER.
- Keep EVERY `effects`, `choice`, `label`, `goto` and `if` line's behaviour exactly:
  - p1Kfc: the 3 pickup-line choices must still set `kfcLine` 1 / 2 / 3.
  - p5Eos must END with `{ effects: [{ kind: "battle", encounter: "eosTrial" }] },`.
  - EOS_AFTER must still contain the crystal choice (sell is refused and loops back; Lily goes on)
    and exactly one `{ effects: [{ kind: "flag", key: "eosCrystal", value: true }] },`.
  - p8Contract must keep the contract flag + ap 3 effect and the kfcLine if/goto bonus branches
    with their ap effects.
  You may add new choices that only branch dialogue (label + goto), but no new effects.
- Every `goto` must point to a `label` in the same file. Labels must be unique within a file.
- Only use speakers and backgrounds listed in the style guide.
- Keep the story facts consistent with the current prologue (names, ages, what happened).

## Deliverables
1. The 14 files above in `docs/restia-story/drafts/prologue-v2/`.
2. `docs/restia-story/drafts/prologue-v2/NOTES.md`: a short list of what you added per scene,
   any new speakers you needed, and any extra backgrounds/portraits you wish existed.
3. When everything is written, create `docs/restia-story/drafts/prologue-v2/DONE.txt`.
Only create files in `docs/restia-story/drafts/prologue-v2/`. Do not edit anything else and do
not run commands.
