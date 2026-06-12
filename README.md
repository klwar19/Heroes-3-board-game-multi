# Heroes-3-board-game-multi
multiplayer

A non-profit fan multiplayer tabletop app for Heroes of Might and Magic III: The Board Game. New rooms now open a full **adventure game**: a hex map built from the real 7-field tiles, heroes with faction-colored flags moving field by field, location visits straight out of the rulebook (mines, settlements, treasure and resource dice, shrines, witch huts…), town boards with building costs and unit recruiting, neutral guard fights that follow the rulebook's AI and time-limit rules, hero experience with the printed level track, and player-vs-player combat — all synced live to every seat plus an observer. Combat still plays at the virtual table: instant windows for attack/defense/power cards, the attack die rolling last with a 3D cinematic.

## Game modes

Every lobby picks one of two rule sets (the toggle sits at the top of the game options; **House rules BINH** is the default):

- **Legacy (rulebook)** — the community rulebook as printed: one shared Spell deck, one Artifact deck, printed card values and unit stats.
- **House rules BINH** — the split-deck optional rule plus the BINH house rules:
  - **Basic + Expert Spell decks.** Drawing from the Expert deck needs hero level ≥ 4 **and** an open Ⅳ–Ⅴ/Ⅵ–Ⅶ tile — or owning a key card (Eagle Eye, Wisdom, or a Basic elemental Magic).
  - **Minor / Major / Relic Artifact decks.** Minor anywhere; Major on a Ⅳ–Ⅴ+ tile or at level 4 with an artifact building (Castle Blacksmith); Relic on a Ⅵ–Ⅶ tile or at level 6 with one. Whenever you'd gain an artifact or spell you pick among the decks you've unlocked.
  - **Wisdom** expert reduces the Mage Guild purchase by 3 gold (basic −2; Search 3/4 as printed). **Estates** pays 2/4 gold instead of 3/6. **Few Griffins 3 attack, Pack Griffins 1 defense, Pack Marksmen 3 HP.** **Pack Cerberi attack every adjacent enemy** — each a full separate attack at attack 3 that can be answered with instants and defense.

Both modes share the rulebook fixes: the second negative morale token resets you to neutral and discards your hand at turn end; activation spells (Magic Arrow, Fireball…) cast during your own unit's activation; instant spells (Bloodlust, Stone Skin, Curse, Weakness, Bless…) are played **into attacks**, scale with Power played alongside them and count toward the one-spell-per-round limit; any Spell card can instead be discarded for its printed "+1 Power".

## Adventure mode

- **Map setup phase**: new rooms open in a lobby — every seat picks a faction and main hero, and the table sets the **game options**: starting map, neutral difficulty (the Field Difficulty Level Table column — **Impossible by default**), starting resources, the base resource gain (10 gold / 0 materials / 0 valuables by default), starting unit tiers and pre-built buildings. Then the scenario sheet builds the map (starting tiles fixed by faction and seat, never rotated) and drafts two Far (Ⅱ–Ⅲ) tiles per player (redrawing until one carries a Settlement, per the Mission Book).
- **Map**: odd-r hex grid; every tile is the printed 7-field flower (field lists from the fan wiki, geometry cross-checked against the community scenario editor). Pan by dragging, zoom with the wheel/buttons, and toggle the tile-art layer (scenario-editor scans today, a drop-in slot for real art). The printed yellow border lines render exactly as scanned — full three-edge arcs plus complete rings around blocked fields, verified against all 41 tile scans — and the engine refuses to cross them; with the art layer on, the built-in location icons get out of the way (live game state — flags, cubes, settlement choices — stays).
- **Movement**: click any reachable field — a dashed arrow previews the walk and its MP cost, confirm to go; the hero walks field by field (1 MP each) and stops where the rules stop it (guards, locations, enemy heroes). Allied heroes can be crossed mid-path. Every seat sees an animated arrow when anyone walks.
- **Tiles**: face-down Near (Ⅳ–Ⅴ) and Center (Ⅵ–Ⅶ) tiles are discovered for 1 MP; your two Far (Ⅱ–Ⅲ) tiles place at the border for 1 MP (must touch two tiles and sit next to your hero). Every reveal or placement asks you to rotate the tile — rotations whose border lines would seal it off the map are rejected.
- **Turns**: the hand auto-draws to the level-based hand limit at the start of your turn; before acting you may mulligan (discard any number, draw that many). Then 3 MP of movement actions; Build/Population/Spell Book tokens once per round (population buys any number of units in one go); resource-round income and City Hall choices on odd rounds from round 3.
- **Astrologers rounds**: every even round draws one of the 19 core Astrologers Proclaim cards and the engine enforces it — movement and hand-limit modifiers, next-resource-round income shifts, morale handouts, plagues, first-spell bonuses, die rerolls, neutral-draw swaps. The active card sits in the HUD; the deck's past draws are browsable.
- **Morale**: the positive token spends for any printed option — draw 1 card, discard any number and draw that many, or reroll any die you just threw (attack die and Treasure/Resource dice alike). A second negative token discards your hand at turn end. Necropolis ignores it all.
- **Locations**: visitable fields take a black cube, flaggable mines/settlements feed production (first flag pays instantly, enemies can steal), revisitable fields cost 1 MP again. Treasure/Resource dice use the printed faces.
- **Neutral fights**: deploy up to five units first — drag them around your two rows freely — then lock in and the guard army is drawn from the four tier decks by the back-cover Field Difficulty Level Table and revealed, placed by the rulebook sorting (ranged to the backline, ground/flying to the frontline, left to right in descending initiative, higher tier first). The AI attacks same-tier first, ranged hunt ranged, closest target; a true tie is yours to break, as printed. One combat round per MP — continue or retreat. Quick combat skips fights your level outclasses. XP: +1 at your level, +2 above it, azure → level VII.
- **Multi-target attacks by the card**: pack Liches' Death Cloud is a full second attack — choose a unit adjacent to the original target (friend, foe, or the Liches themselves), instants may respond, the die rolls at attack 2, and the original target's retaliation waits until it resolves. Pack Magogs deal 1 flat damage to one chosen unit adjacent to a non-adjacent target; pack Cerberi bite a second enemy adjacent to themselves. Neutral Liches/Magogs/Cerberi make the same choices by the AI priority.
- **Event feed**: every visit spells out what happened (income, dice, experience, morale, flags), fights announce themselves and their reveals, level-ups and victories pop — each cue carries a named sound hook for when audio lands.
- **Heroes**: each seat gets a recreation of the printed hero board — classic PC portrait (hosted locally), faction-colored name banner, the four statistic tiles, starting ability and specialty art, and the real Ⅰ–Ⅶ level track (hand limit 4→5→6→7, expert crowns at II/IV/VI, ability searches at II/III/V/VII, specialties at I/IV/VI) with the XP cube on the current level. The printed scan opens from the name banner.
- **Multiplayer**: every action streams to all seats live; switch seats, or pick **Observer** to watch any fight with all hands hidden. During a combat anyone can flip between the battlefield and the adventure map. Discard piles (yours, the shared decks, the Astrologers deck, the neutral tiers) open from the deck rail; draw decks show face-down backs with live counts.
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

## Multiplayer backends

Rooms are server-authoritative behind a single transport interface (`src/lib/realtime.ts`):

- **Built-in (default)**: Next.js API routes with an in-memory store and an SSE stream — zero setup, perfect for local play.
- **Cloudflare Durable Objects via PartyKit** (`party/index.ts`): one Durable Object per room, WebSockets at the edge, room snapshots persisted in Durable Object storage. Deploy and point the client at it:

```bash
npx partykit deploy            # prints e.g. heroes3bg-rooms.<user>.partykit.dev
NEXT_PUBLIC_PARTYKIT_HOST=heroes3bg-rooms.<user>.partykit.dev npm run build
```

Local PartyKit dev server: `npx partykit dev` + `NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:1999 npm run dev`.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
