# Heroes-3-board-game-multi
multiplayer

A non-profit fan multiplayer tabletop app for Heroes of Might and Magic III: The Board Game. The current build plays a full combat at a virtual table: a board in the middle, your hand fanned in a row in front of you, draw/discard piles and the shared Spell/Ability/Artifact decks beside the board, instant windows where one or several attack/defense/power cards can be committed at once, and the attack die that only rolls — with a 3D dice cinematic — after every buff is locked in.

## Planning

- [Build blueprint](./BUILD_BLUEPRINT.md): full from-scratch plan for the Next.js, TypeScript, boardgame.io, Supabase, UI, art, multiplayer, rules-engine, and reaction-window foundation.
- [Rules understanding](./docs/rules-understanding.md): sourced notes from the official rulebook, fan wiki/database, and playthrough transcript for future development.
- [Game flow and map plan](./docs/game-flow-and-map-plan.md): the full round/turn/combat timing script and the adventure-map movement design.
- [Multiplayer platform plan](./docs/multiplayer-platform-plan.md): the boardgame.io migration path (sockets, lobby, persistence, spectators).

## How the table works

- **Seats**: the top bar is your opponent (hand shown as card backs, deck/discard counts); the bottom row is you (fanned hand, draw deck, discard pile, gold/crowns).
- **Board**: the 4x5 battlefield sits in the middle and flips so your units are always nearest your hand; enemy cards face away, like at a real table. Hover any unit to read its card in the inspector.
- **Instant windows**: declaring an attack or casting a spell opens the instant tray. Select one or many attack/defense/power instants (with per-card expert toggles), confirm them as a single declaration, or pass. Resistance-style cards play alone and always end the spell when they apply.
- **Dice last**: the attack die only rolls after both sides pass, then a 3D die tumbles on screen and settles with the full attack-vs-defense math.
- **Decks**: player decks reshuffle their discard when empty; "Search 2" on the shared decks reveals two, keeps one, discards the rest (or take the discard top instead).

## Development

```bash
npm install
npm run dev
```

Local app: http://127.0.0.1:3000

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
