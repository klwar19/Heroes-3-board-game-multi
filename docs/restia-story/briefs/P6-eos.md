# Brief P6: "The Eos Trial, 3 days" (Prologue)

Read first: `docs/restia-story/style-guide.md`. Also read scene p4Goddess, p5Eos, p6EosWin,
p6EosLose and the EOS_AFTER block in `src/restia/data/scenes-story.ts`.

Write THREE parts to `docs/restia-story/drafts/P6-eos.ts`, each introduced by a comment line:
`// === p5Eos ===`, `// === p6EosWin ===`, `// === p6EosAfter ===`. Only line objects, no prose.

## Setting
Eos: a sandbox world Peri keeps for testing Jester candidates. A textbook JRPG starting zone:
rolling hills, a village of identical red roofs, a round forest, a cave that is exactly
cave-shaped, symmetrical clouds. Everything slightly too perfect. Bin is in his Earth clothes.
Background `eosMeadow` throughout. Jess (speaker `system`) boots up here for the first time.

## p5Eos (~40 lines): Day 1, ends in the tutorial battle
- Bin lands. Documentary narration of a tutorial zone. He's played games; he predicts the first NPC
  will be excited about slimes.
- Jess boots: "[CJS] Cosmic Jester System v0.9 (trial)..." She is sarcastic, has a name, dislikes
  being called "the status window". Explains JP, Analyze, the Jester Shop briefly and funnily,
  in several short lines, NOT an info dump.
- Two Tutorial Goblins walk out of the perfect forest, BOW politely, and raise their clubs.
- The LAST line must be exactly: `{ effects: [{ kind: "battle", encounter: "eosTrial" }] },`

## p6EosWin (~6 lines): right after winning
Jess rates it "fine". Peri (off-screen voice via Jess) liked the part where the goblin bowed back.

## p6EosAfter (~70 lines): Days 2 and 3 (played by both win and lose)
- **Day 2:** the village. Villagers (speaker `villager`) repeat the same three lines forever, in
  order. Bin tries to break the loop (asks weird questions, compliments, tax advice); it escalates
  like a Clannad running gag; one villager glitches slightly and it's funny, not creepy.
  Fetch quests done out of pure spite. A cave boss who is extremely polite (apologises before
  every attack; Bin ends up apologising back).
- **Day 3:** Peri appears in the meadow eating cosmic popcorn, reviews his "episode" like a
  streamer reading chat. Jess awards the trial reward: an Eos Healing Crystal.
  Player **choice**: "Sell it for JP" / "Send it to Lily".
  - Sell: Peri laughs, Jess refuses the transaction ("[CJS] Denied. I have standards. Low ones.
    But standards."), goto back to the choice.
  - Lily: Peri goes quiet for a moment, then covers it with a joke. Jess: "[CJS] Destination:
    ...Earth? Fine."
  - After the choice this line MUST appear once: `{ effects: [{ kind: "flag", key: "eosCrystal", value: true }] },`
- Ending: Bin wakes on his fold-out couch holding a warm crystal the size of a walnut, and goes to
  the hospital before his first class.
