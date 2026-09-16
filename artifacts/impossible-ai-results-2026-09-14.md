# Impossible opening follow-up

The live AI now requires three Bronze Packs for Castle and Stronghold's opening core. Necropolis can earn Wraiths through Necromancy against either automatic or player-controlled guards; paid Zombies remain available when the held Necromancy is needed for Wraiths, or no Necromancy is held. A second held copy can supply Zombies after Wraiths are complete.

For a Bronze army against revealed ordinary neutrals, two living enemies with Defense 2 or higher trigger retreat before card spending. A three-Pack army commits against up to three other guards instead of taking the old estimated-loss retreat. Banks and armies with premium troops retain their separate behavior. This is intentionally willing to accept casualties, and does not guarantee victory.

Orc Packs can deploy in the first row. Zombies use the first row and Griffins the second. Marksmen and Wolf Raiders avoid a 2-Defense target when a softer target is legally attackable from that position. Arrow targets removable armored enemies ahead of an elemental; expert Knowledge can recall Arrow to finish the same surviving armored target. Arrow's actual maximum is 3 damage: a 4-health Gorgon needs another hit, not more Power above its ladder.

## Actual engine checks

`node scripts/check-ai-impossible.mjs` passes:

- Castle leaves two Gorgons without playing any card.
- Three Packs beat Gorgon plus Fire Elemental for Castle, Necropolis, and Stronghold.
- Castle removes the Gorgon with recalled Arrow before the first physical strike.
- Deployed Zombies and Orc Packs occupy the front row; Griffins occupy the back row.
- A real level-I victory followed by Necromancy upgrades Wraiths from Few to Pack.

`node scripts/check-ai-impossible-mutations.mjs` disables retreat/card preservation, Orc formation, post-victory Necromancy, and useful Knowledge independently in child module loaders. Each mutation fails the corresponding engine outcome assertions. Knowledge and negative-die checks from the previous iteration also pass.

Final `npm run typecheck` passed. `git diff --check` reported no whitespace errors. No deployment or commit was performed.

## Impossible game openings

Six distinct seeds, two seats each, five rounds per trial. All use multiplayer engine rules without the single-player guaranteed-win shortcut. Two games each use automatic, forced-attack player-controlled, and free player-controlled neutrals. The human-control seats are driven by AI policies, not human testers.

Baseline: `artifacts/self-play/impossible-core-before-0914/games.json`.
Reviewed policy: `artifacts/self-play/impossible-core-reviewed-0914/games.json`.

| Faction | Seats | Premium Far by R5, before → after | Neutral losses, before → after |
| --- | --- | --- | --- |
| Castle | 3 | 1 → 2 | 5 → 2 |
| Necropolis | 5 | 2 → 1 | 7 → 6 |
| Stronghold | 4 | 1 → 1 | 5 → 2 |
| Total | 12 | 4 → 4 | 17 → 10 |

Castle's new captures are round 4 on seed 1 and round 5 on seed 5, but its previous seed-6 capture is lost. Necropolis retains only seed 1's round-5 capture; its seed-3 capture regresses. Stronghold retains seed 4's round-5 capture. All six games end at the round cap without stalls. These results show fewer defeats, not an improved aggregate capture deadline or match win rate.

Experiments that forced earlier Zombie purchases, extended the full-hand Necromancy hunt, or blocked Vampire purchases worsened full-opening outcomes and were removed. Repeated seeds compare changed decisions; they are not additional independent strength samples. There is no new trained-model installation or claim of optimal play.
