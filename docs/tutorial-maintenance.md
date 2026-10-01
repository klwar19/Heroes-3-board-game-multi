# Tutorial & Rule Book — how to update them

## What runs where

- **Rule Book** (`/rulebook`, menu icon): page images + outline + search built from
  the community PDF by `scripts/rulebook/build-rulebook.mjs`.
- **Tutorial** (`/tutorial`, menu icon, login card): a real game on the real table
  UI, but the "server" is local to the browser (`src/lib/tutorial/tutorial-room.ts`).
  It replays a recorded, deterministic game (`src/data/tutorial/tutorial-script.json`):
  the player must make the next recorded move; the Castle computer's recorded moves
  are played back. Sandro's coach (`src/components/tutorial/`) explains each moment,
  points at the exact control and offers a "Watch how" clip.

## Edit what Sandro says

- Lessons: `src/data/tutorial/tutorial-lessons.ts` — each lesson has a `when` test
  (what is happening), a chapter, a pose, a rule-book page and text in English,
  Vietnamese and Polish. Lessons are keyed by situation, not step number, so they
  survive re-recording.
- Coach / prompt / login-card wording: `src/data/tutorial/tutorial-i18n.ts`.
- The per-move "Your move" instructions and where the pointer goes:
  `src/components/tutorial/tutorial-targets.ts` (one case per action type).

## After changing game rules or the table UI

1. Check the recording still matches the engine:
   `node scripts/tutorial/record-tutorial.mjs verify`
   - OK → nothing to do for the script.
   - DIVERGED / REJECTED → re-record (step 2). Until then the live tutorial notices
     the drift itself and falls back to free play against the computer (it says so).
2. Re-record (only if verify failed):
   `node scripts/tutorial/record-tutorial.mjs search --seeds 1-12 --assault-round 7`
   then pick a seed where `winner` is `p1` around round 11–13 with a few PvP wins, and
   `node scripts/tutorial/record-tutorial.mjs record --seed tutorial-N --assault-round 7`.
3. Walk the whole tutorial through the real UI (needs the app running, e.g. `npm run dev`):
   `node scripts/tutorial/record-clips.mjs --layout computer` and `--layout phone`.
   It clicks only what Sandro points at and stops with a screenshot at the first move
   it cannot make (then fix `tutorial-targets.ts` or the UI).
4. Re-film the "Watch how" clips: add `--video` to the two commands above (each takes
   ~40 min on a quiet machine; if a run dies, rerun with `--video --resume` to film only
   the missing moves; clips are cut to the move itself, max 8 s, and loop), then
   `npm run media:publish` and commit `media-manifest.json`,
   `src/lib/media-keys.generated.json` and `src/data/tutorial/tutorial-clips.json`.

## Art

Codex prompts: `scripts/tutorial/codex-jobs.json` → `node scripts/tutorial/codex-gen-tutorial.mjs`
→ `node scripts/tutorial/build-tutorial-art.mjs` → `npm run media:publish`.

## Rule Book update

`node scripts/rulebook/build-rulebook.mjs` (downloads the current PDF), then
`npm run media:publish` and commit `src/data/rulebook/*.json`.
