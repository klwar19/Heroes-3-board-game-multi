# Heroes-3-board-game-multi
multiplayer

A non-profit fan multiplayer tabletop app for Heroes of Might and Magic III: The Board Game. New rooms now open a full **adventure game**: a hex map built from the real 7-field tiles, heroes with faction-colored flags moving field by field, location visits straight out of the rulebook (mines, settlements, treasure and resource dice, shrines, witch huts…), town boards with building costs and unit recruiting, neutral guard fights that follow the rulebook's AI and time-limit rules, hero experience with the printed level track, and player-vs-player combat — all synced live to every seat plus an observer. Combat still plays at the virtual table: instant windows for attack/defense/power cards, the attack die rolling last with a 3D cinematic.

## Adventure mode

- **Map**: odd-r hex grid; every tile is the printed 7-field flower (field lists from the fan wiki, geometry cross-checked against the community scenario editor). Face-down Near/Center tiles are discovered for 1 MP; each player holds two Far tiles to place (rotatable, must touch two tiles and sit next to the hero).
- **Turns**: discard/draw to the level-based hand limit, then 3 MP of movement actions; Build/Population/Spell Book tokens once per round; resource-round income and City Hall choices on odd rounds.
- **Locations**: visitable fields take a black cube, flaggable mines/settlements feed production (first flag pays instantly, enemies can steal), revisitable fields cost 1 MP again. Treasure/Resource dice use the printed faces.
- **Neutral fights**: guard armies drawn from the four tier decks by the back-cover difficulty table, placed and played by the rulebook AI (same-tier first, ranged hunt ranged, closest target). One combat round per MP — continue or retreat. Quick combat skips fights your level outclasses. XP: +1 at your level, +2 above it, azure → level VII.
- **Heroes**: wiki portraits and the real level track — hand limit 4→5→6→7, expert effects at II/IV/VI, ability searches at II/III/V/VII, specialties at I/IV/VI.
- **Multiplayer**: every action streams to all seats over SSE; switch seats, or pick **Observer** to watch any fight with all hands hidden. Discard piles (yours, the shared decks, the neutral tiers) open from the deck rail; draw decks show face-down backs with live counts.
- The combat sandbox is now a **level 5 battle simulator** (reset menu → crossed swords): Catherine (Castle) vs Sandro (Necropolis), each with their hero board (portrait, class, statistics, specialties), a 6-card hand holding a specialty + statistics + artifact + spell + ability, two expert crowns, and armies built from the real unit roster fighting over obstacle tokens.

## Planning

- [Content tracker](./docs/content-tracker.md): **what is imported and what still needs editing** (tiles, locations, towns, heroes, units, cards, rules).
- [Build blueprint](./BUILD_BLUEPRINT.md): full from-scratch plan for the Next.js, TypeScript, boardgame.io, Supabase, UI, art, multiplayer, rules-engine, and reaction-window foundation.
- [Rules understanding](./docs/rules-understanding.md): sourced notes from the official rulebook, fan wiki/database, and playthrough transcript for future development.
- [Game flow and map plan](./docs/game-flow-and-map-plan.md): the full round/turn/combat timing script and the adventure-map movement design.
- [Multiplayer platform plan](./docs/multiplayer-platform-plan.md): the boardgame.io migration path (sockets, lobby, persistence, spectators).

## How the table works

- **Seats**: the top bar is your opponent (hand shown as card backs, deck/discard counts); the bottom row is you (fanned hand, draw deck, discard pile, gold/crowns).
- **Board**: the 4x5 battlefield sits in the middle and flips so your units are always nearest your hand; enemy cards face away, like at a real table. Hover any unit to read its card in the inspector — click it (or the magnifier on any card) for a **full-size readable view**.
- **Movement by the book**: ground units walk up to 3 spaces around units and obstacle tokens, flyers cross over them, ranged units shoot first and may step 1 space after (or step 1 instead of shooting — never both ways). Packs that run out of HP flip to their Few side on the board with the leftover damage.
- **Per-round limits on the table**: the command dock shows your spell (1 per combat round, Knowledge raises it) and remaining crowns; hand cards explain their timing when they cannot be played yet.
- **Card draws are visible**: whenever anyone draws, the cards travel from the deck — your own draws show their faces, opponents' show backs.
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
