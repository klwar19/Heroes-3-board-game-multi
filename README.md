# Heroes-3-board-game-multi
multiplayer

A non-profit fan multiplayer tabletop app for Heroes of Might and Magic III: The Board Game. New rooms now open a full **adventure game**: a hex map built from the real 7-field tiles, heroes with faction-colored flags moving field by field, location visits straight out of the rulebook (mines, settlements, treasure and resource dice, shrines, witch huts…), town boards with building costs and unit recruiting, neutral guard fights that follow the rulebook's AI and time-limit rules, hero experience with the printed level track, and player-vs-player combat — all synced live to every seat plus an observer. Combat still plays at the virtual table: instant windows for attack/defense/power cards, the attack die rolling last with a 3D cinematic.

## Game modes

Every lobby picks one of two rule sets (the toggle sits at the top of the game options; **House rules BINH** is the default):

- **Legacy (rulebook)** — the community rulebook as printed: one shared Spell deck, one Artifact deck, printed card values and unit stats.
- **House rules BINH** — the split-deck optional rule plus the BINH house rules:
  - **Basic + Expert Spell decks.** Drawing from the Expert deck needs hero level ≥ 4 **and** an open Ⅳ–Ⅴ/Ⅵ–Ⅶ tile — or owning a key card (Eagle Eye, Wisdom, or a Basic elemental Magic).
  - **Minor / Major / Relic Artifact decks.** Minor anywhere; Major on a Ⅳ–Ⅴ+ tile or at level 4 with an artifact building (Castle Blacksmith); Relic on a Ⅵ–Ⅶ tile or at level 6 with one. Whenever you'd gain an artifact or spell you pick among the decks you've unlocked.
  - **Wisdom** expert reduces the Mage Guild purchase by 3 gold (basic −2; Search 3/4 as printed). **Estates** pays 2/4 gold instead of 3/6. **Few Griffins 3 attack, Pack Griffins 1 defense, Pack Marksmen 3 HP.** (Cerberi follow the printed card — 1 damage to one adjacent enemy — in both modes.)

Both modes share the rulebook fixes: the second negative morale token resets you to neutral and discards your hand at turn end; activation spells (Magic Arrow, Fireball…) cast during your own unit's activation; instant spells (Bloodlust, Stone Skin, Curse, Weakness, Bless…) are played **into attacks**, scale with Power played alongside them and count toward the one-spell-per-round limit; any Spell card can instead be discarded for its printed "+1 Power". Power is never playable into an attack on its own — the engine and the instant tray both demand the spell it feeds in the same declaration. **Permanent cards** follow the printed rule: one in play per player with its effect always on, playing another discards the first, and the owner may voluntarily discard one at any time — only the Pandora's Box card "up to 3 permanent cards" raises the limit (drawable at a Pandora's Box field; the box may also raise your hand size by 1).

## Win conditions

A second lobby selector picks how the game is won:

- **Conquest** (default) — **eliminate every rival faction.** Flagging an enemy Town is *not* an instant win (rulebook p.76: the owner even keeps their Town Board). It earns the conqueror one **resource-gain level** — their choice of **+5 gold, +2 materials, or +1 valuables** income — and, if it was the owner's last base, starts their **elimination clock**: a player who controls **no Town and no Settlement** lasts **2 more of their own turns**, then is removed (a held **Settlement** keeps them fighting — settlements prevent elimination, rulebook p.77). The last faction standing wins.
- **Grail Hunt** — win either way: **capture the Grail** (defeat its level-VII guard, spend 1 more movement point to *dig* it, then carry it home to your own town), or **beat every enemy hero** in combat at least once (only 2 of the 3 in a 4-player game). A Grail is seeded on a Center tile; the Dragon Utopia is **not** an objective here.
- **Dragon Hunt** — win either way: **defeat the Dragon Utopia** — no need to hold it afterwards — or **beat every enemy hero** in combat at least once (only 2 of the 3 in a 4-player game). A Dragon Utopia is seeded on a Center tile. Its guard is two house-rule knobs set beside the Win condition: the pool — **four dragons** (azure + rust + crystal + faerie, the default) or the **rulebook three** (azure + crystal + black) — and the count — **by difficulty** (as many dragons as the Field Difficulty draws: Easy 1 / Normal 2 / Hard 3 / Impossible 4, the default) or the **fixed party**. Whatever the count, one guard is always an **azure slot** — Azure, Rust or Crystal, random each game.
- **Dragon Conqueror** — defeating the Dragon Utopia **captures** it instead of winning outright. The holder garrisons it and rivals must **besiege** it (Walls, Gate, Arrow Tower) to take it; controlling it at the start of your turn wins.

A Grail or Dragon Utopia that isn't the active objective is just a normal level-VII fight, rewarding 10 gold and a Relic artifact (Search 2, choose 1).

In every mode a player can be eliminated — by spending the grace period (2 turns) with no Town or Settlement, or by choosing **Give up** on their own turn (you cannot concede mid-combat — "you cannot surrender when defending your Faction Town"). An eliminated player leaves the turn order and becomes an **observer**; the game continues with one fewer player, and eliminating every rival wins the scenario outright. Defending a Town/Settlement while your hero is away still works as printed: **pay 8 gold to garrison with units only (no Deck cards)**, with siege Walls/Gate/Arrow Tower only when *your own* Town has a **Citadel** (never when defending a Town you previously conquered).

A third selector, **PvP combat**, chooses what a player-vs-player fight costs: **Lose troops** (the rulebook — destroyed unit cards leave the army and damaged Packs flip to Few) or **Keep troops** (a friendly-fight option — the winner is still decided and the loser still pays gold, loses morale and retreats, but neither army loses any units). Fights against Neutral guards always cost casualties.

When an enemy hero attacks, the defender first gets a **pre-combat preparation window** if they still hold an unused town action this round (build / population / spell-book token) and own a town: they may **build, recruit or buy spells** — anything they recruit now joins the army in time to be deployed — then press **Accept the combat** to deploy. (A defender who has already spent their turn's town actions, or has no town, skips straight to deployment.)

Leaving a player-vs-player fight has two house-rule exits, both **start-of-combat decisions** — available in that preparation window and at the deployment-complete opening, but gone the instant any unit begins fighting. **Retreat** (or simply losing the battle): the loser pays **5 gold to the winner — and may drop into debt (gold can go negative)** — takes a negative morale token, loses troops per the mode above, hands the opponent a win (experience, Necromancy and a step toward the "defeat every enemy hero" victory), then falls back to a friendly Town or Settlement. **Surrender** (needs the full **10 gold** in hand): pay 10 gold to the opponent, **keep your whole army in either mode**, take no morale hit, return home — and it is **not** counted as a victory for the opponent. **Shackles of War** locks an enemy out of Surrender, but they can still Retreat. Once a fight is under way there is a third, off-to-the-side exit available at any point — **Give up** (a concede): it counts as a loss with the same consequences as a Retreat — in losing-troop mode you forfeit only the **casualties you've taken up to that point** (the dead stay dead, survivors fall back home — not a whole-army wipe); in keep-troops mode you keep every unit but **discard your entire hand**. (`give-up-combat.test.ts`)

## Adventure mode

- **Map setup phase**: new rooms open in a lobby — every seat picks a faction and main hero, and the table sets the **game options**: starting map, neutral difficulty (the Field Difficulty Level Table column — **Impossible by default**), starting resources, the base resource gain (10 gold / 0 materials / 0 valuables by default), starting units and pre-built buildings. Starting units come either from the tier checkboxes or from a **custom army picker** — few or pack of ANY unit, in any combination, identical for every seat. A **map designer** (`/designer`) can replace the scenario layout: click slots next to the fixed starting tiles to add tiles anywhere they touch the board, choose how many players the map opens for (**2, 3 or 4**, within the scenario's range), and flip each tile **face up** (pick the exact tile and rotation) or **face down** (a random tile of its Far/Near/Center pool is drawn at start). Designed maps are saved to a **shared server library** (the built-in `/api/maps` store, or a PartyKit `maps` Durable Object on the edge) — so **anyone who opens the app can browse, open, edit, play, or delete them**, not just the browser that drew them. Picking a saved map in the lobby opens the seat count it was designed for and syncs its tiles to every seat through the normal action stream. Then the map builds (starting tiles fixed by faction and seat, never rotated) and two Far (Ⅱ–Ⅲ) tiles are drafted per player (redrawing until one carries a Settlement, per the Mission Book).
- **Map**: odd-r hex grid; every tile is the printed 7-field flower (field lists from the fan wiki, geometry cross-checked against the community scenario editor). Pan by dragging, zoom with the wheel/buttons, and toggle the tile-art layer (scenario-editor scans today, a drop-in slot for real art). The printed yellow border lines render exactly as scanned — full three-edge arcs plus complete rings around blocked fields, verified against all 41 tile scans — and the engine refuses to cross them; with the art layer on, the built-in location icons get out of the way (live game state — flags, cubes, settlement choices — stays).
- **Movement**: click any reachable field — a dashed arrow previews the walk and its MP cost, confirm to go; the hero walks field by field (1 MP each) and stops where the rules stop it (guards, locations, enemy heroes). Allied heroes can be crossed mid-path. Every seat sees an animated arrow when anyone walks.
- **Tiles**: face-down Near (Ⅳ–Ⅴ) and Center (Ⅵ–Ⅶ) tiles are discovered for 1 MP; your two Far (Ⅱ–Ⅲ) tiles place at the border for 1 MP (must touch two tiles and sit next to your hero). Every reveal or placement asks you to rotate the tile — rotations whose border lines would seal it off the map are rejected.
- **Turns**: the hand auto-draws to the level-based hand limit at the start of your turn; before acting you may mulligan (discard any number, draw that many). Then 3 MP of movement actions; Build/Population/Spell Book tokens once per round (population buys any number of units in one go); resource-round income and City Hall choices on odd rounds from round 3.
- **Astrologers rounds**: every even round draws one of the 31 Astrologers Proclaim cards (19 core + 12 expansion) and the engine enforces it — movement and hand-limit modifiers, next-resource-round income shifts, morale handouts, plagues, first-spell bonuses, die rerolls, neutral-draw swaps, Statistic→Empowered swaps (Dancing Imp / Hero / Explorers), hand/discard card removal (Plane Between Planes), the Rampart war-machine pair (Ammo Cart buffs every Ballista / First Aid Tent / ranged reroll; McGiver hands out a free War Machine next round), and Dwelling-gated recruits (Charlie and his Circus draws and recruits a paid Neutral over two rounds; Unexpected Reinforcements searches the Neutral Units deck and free-recruits one neutral unit associated with your faction — the neutral counterpart of a roster unit, on the Neutral side so it can never be reinforced to a Pack — for a Dwelling you've built; faction-agnostic, ready for Conflux/Cove). The active card sits in the HUD; the deck's past draws are browsable.
- **Morale**: the positive token spends for any printed option — draw 1 card, discard any number and draw that many, or reroll any die you just threw (attack die and Treasure/Resource dice alike). A second negative token discards your hand at turn end. Necropolis ignores it all.
- **Locations**: visitable fields take a black cube, flaggable mines/settlements feed production (first flag pays instantly, enemies can steal), revisitable fields cost 1 MP again. Treasure/Resource dice use the printed faces.
- **Neutral fights**: deploy up to five units first — drag them around your two rows freely — then lock in and the guard army is drawn from the four tier decks by the back-cover Field Difficulty Level Table and revealed, placed by the rulebook sorting (ranged to the backline, ground/flying to the frontline, left to right in descending initiative, higher tier first). The AI attacks same-tier first, ranged hunt ranged, closest target; a true tie is yours to break, as printed. The guard turn goes one step at a time: before each guard acts the fight **pauses for you to react** whenever you can do something off-turn — cast a non-instant Spell through **Intelligence** (Magic Arrow, Fireball, Lightning Bolt…), cast a trigger-free instant Spell, or play an instant ability — with a pop-up that previews who the guard is about to hit; pass it with "Let the unit act" (a guard's walk still pauses so the table sees it). One combat round per MP — continue or retreat. Quick combat skips fights your level outclasses. XP: +1 at your level, +2 above it, azure → level VII.
- **Multi-target attacks by the card**: pack Liches' Death Cloud is a full second attack — choose a unit adjacent to the original target (friend, foe, or the Liches themselves), instants may respond, the die rolls at attack 2, and the original target's retaliation waits until it resolves. Pack Magogs deal 1 flat damage to one chosen unit adjacent to a non-adjacent target; pack Cerberi bite a second enemy adjacent to themselves. Gold Dragons (and neutral Black Dragons) breathe in a line — a separate attack on the unit directly behind the target; neutral Hydras hit a second adjacent enemy; neutral Azure Dragons/Basilisks paralyse on the Attack die; and the neutral Magi force the defender to discard a Power card (their pick) or a random one. Neutral units make the same choices by the AI priority.
- **Event feed**: every visit spells out what happened (income, dice, experience, morale, flags), fights announce themselves and their reveals, level-ups and victories pop — each cue carries a named sound hook for when audio lands.
- **Heroes**: each seat gets a recreation of the printed hero board — classic PC portrait (hosted locally), faction-colored name banner, the four statistic tiles, starting ability and specialty art, and the real Ⅰ–Ⅶ level track (hand limit 4→5→6→7, expert crowns at II/IV/VI, ability searches at II/III/V/VII, specialties at I/IV/VI) with the XP cube on the current level. The printed scan opens from the name banner.
- **Combat end**: the battlefield never vanishes mid-thought — a pop-up notice announces the victory, defeat or retreat and the board stays up for inspection until a participant clicks "Return to the adventure map" (experience, unit flips and the contested field resolve at that moment). A **View hand** button by the hand fan and inside the instant tray opens every card in your hand at readable size, even while a timing window is open.
- **Multiplayer**: every action streams to all seats live; switch seats, or pick **Observer** to watch any fight with all hands hidden. During a combat anyone can flip between the battlefield and the adventure map. Discard piles (yours, the shared decks, the Astrologers deck, the neutral tiers) open from the deck rail; draw decks show face-down backs with live counts.
- The combat sandbox is now a **level 5 battle simulator** (reset menu → crossed swords): Catherine (Castle) vs Sandro (Necropolis), each with their hero board (portrait, class, statistics, specialties), a 6-card hand holding a specialty + statistics + artifact + spell + ability, two expert crowns, and armies built from the real unit roster fighting over obstacle tokens. It runs the **BINH house rules** (split Basic/Expert spell and Minor/Major/Relic artifact decks, BINH unit stats), and as a combat **test mode** its shared wells are stocked with the *complete* implemented catalog — Search any well to pull any Spell, Ability or Artifact into hand and exercise its mechanic.

## Planning

- [Content tracker](./docs/content-tracker.md): **what is imported and what still needs editing** (tiles, locations, towns, heroes, units, cards, rules).
- [Build blueprint](./BUILD_BLUEPRINT.md): full from-scratch plan for the Next.js, TypeScript, boardgame.io, Supabase, UI, art, multiplayer, rules-engine, and reaction-window foundation.
- [Rules understanding](./docs/rules-understanding.md): sourced notes from the official rulebook, fan wiki/database, and playthrough transcript for future development.
- [Game flow and map plan](./docs/game-flow-and-map-plan.md): the full round/turn/combat timing script and the adventure-map movement design.
- [Multiplayer platform plan](./docs/multiplayer-platform-plan.md): the boardgame.io migration path (sockets, lobby, persistence, spectators).
- [Cloudflare R2 setup](./docs/cloudflare-r2-setup.md): safe asset-CDN rollout for the `heroes3` bucket; R2/PartyKit responsibility split.

## How the table works

- **Seats**: the top bar is your opponent (hand shown as card backs, deck/discard counts); the bottom row is you (fanned hand, draw deck, discard pile, gold/crowns).
- **Board**: the 4x5 battlefield sits in the middle and flips so your units are always nearest your hand; enemy cards face away, like at a real table. Hover any unit to read its card in the inspector — click it (or the magnifier on any card) for a **full-size readable view**.
- **Movement by the book**: ground units walk up to 3 spaces around units and obstacle tokens, flyers cross over them, ranged units shoot first and may step 1 space after (or step 1 instead of shooting — never both ways). Packs that run out of HP flip to their Few side on the board with the leftover damage.
- **Per-round limits on the table**: the command dock shows your spell (1 per combat round, Knowledge raises it) and remaining crowns; hand cards explain their timing when they cannot be played yet.
- **Card draws are visible**: whenever anyone draws, the cards travel from the deck — your own draws show their faces, opponents' show backs.
- **Instant windows**: declaring an attack or casting a spell opens the instant tray. Select one or many attack/defense/power instants (with per-card expert toggles), confirm them as a single declaration, or pass. Resistance-style cards play alone and always end the spell when they apply.
- **Intelligence off-turn windows**: while you hold **Intelligence** (the anytime-cast freedom), the fight pauses for you before each enemy unit acts — in neutral guard fights and in player-vs-player alike — so you can spend that freedom on a non-instant Spell (Magic Arrow, Fireball…) before the enemy moves or strikes, then let it act.
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

## Deploying (keep both halves in sync)

Production is **two independently-deployed pieces**, and they must run the same engine version:

1. **Vercel frontend** — auto-deploys on push.
2. **PartyKit room server** (`party/index.ts`) — the authoritative rules engine; deployed separately with `npm run deploy:partykit`.

If only the frontend is updated, the UI offers new content (e.g. new heroes, **Hire a Secondary Hero**) that the stale room server then **silently rejects** — heroes that "can't be selected", hiring that "does nothing". Two guards prevent this:

- **Automatic redeploy** — `.github/workflows/deploy-partykit.yml` runs `npm run deploy:partykit` on every push to the production branch, so both halves move together. One-time setup: add the `PARTYKIT_TOKEN` (from `npx partykit token generate`) and `PARTYKIT_LOGIN` repository secrets, and make sure the workflow's trigger branch matches your Vercel production branch.
- **Version-skew banner** — the room server stamps its `ENGINE_SIGNATURE` (`src/engine/version.ts`) onto every snapshot; if it disagrees with the frontend's, the app shows a visible "room server is out of date — run `npx partykit deploy`" warning instead of failing silently. Bump `ENGINE_PROTOCOL_VERSION` when you add a `GameAction`, change the state schema, or change authoritative reducer/rules semantics; new heroes/factions/units are picked up automatically.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
