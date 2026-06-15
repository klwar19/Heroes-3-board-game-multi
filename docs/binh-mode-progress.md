# Game modes & content build — status

Mirror of the build request. ✅ = implemented **and wired** (engine + UI + tests where it matters). Authoritative detail lives in `content-tracker.md`.

## Modes
- [x] `ruleset` option (`legacy` | `binh`) chosen in the lobby (BINH default), threaded through state/engine/PartyKit, shown in the HUD; old snapshots load as Legacy
- [x] Legacy = community rulebook behavior; BINH = house rules below

## House rules (BINH only)
- [x] Wisdom: basic −2 gold + Search (3); expert −3 gold + Search (4) (legacy expert keeps the printed −2)
- [x] Estates: 2 gold basic / 4 expert (legacy printed 3/6)
- [x] Griffins Few 3 attack · Griffins Pack 1 defense · Marksmen Pack 3 HP (army panel shows live values)
- [x] Sandro's Cloak of the Undead King: Horde of Skeletons (lv I) and Legion of Skeletons (lv VI) fight with 3 HP (legacy printed 2); Horde of Zombies (lv IV) keeps 3 HP both modes
- [x] Cerberi Pack/Neutral: full separate attack (attack 3) vs every other adjacent enemy, instants/defense apply, no retaliation, engine-tested
- [x] Split spell decks with the level-4 + open-Ⅳ–Ⅴ gate and the Eagle Eye / Wisdom / Basic elemental Magic bypass (tested)
- [x] Split artifact decks Minor/Major/Relic with position or level+Blacksmith unlocks; deck pick offered on every artifact/spell gain (tested)
- [x] BINH deck extras: Fortune, Eagle Eye, Scouting, Basic Air/Earth/Fire/Water Magic, extra artifacts

## Rules-correctness fixes (both modes)
- [x] Rerolls take the latter result: earlier rolls can no longer be kept once rerolled (rulebook); the reroll modal shows the history crossed out
- [x] Castle Crusaders pack: reroll offered only while the Attack die shows "0", and every new 0 may be rerolled again (printed card)
- [x] Neutral Crusaders: "roll 2 Attack dice and resolve the higher outcome" implemented as an automatic advantage roll
- [x] Ongoing cards stay physically in play (next to the permanents) until every effect they created ends; only then they reach the discard pile — or the hand when Knowledge/Mysticism recalled them, so recalled Summon/Clone-style spells cannot be recast while active (tested)
- [x] Second negative morale token → neutral + hand discard at turn end (tested)
- [x] Mage Guild verified: build → Search (2) twice; token locked the build round; 6g Castle / 5g others per purchase
- [x] Activation spells cast during your own unit's activation (the "Magic Arrow can't be cast" report)
- [x] Buff/debuff spells (Bloodlust, Stone Skin, Curse, Weakness, Bless, Precision) played INTO attacks, Power-scaled, spell-limit-counted (tested end to end)
- [x] Every spell discardable for the printed "+1 Power"; Empower stacks (rulebook)
- [x] Ongoing cards last until the owner's next turn starts
- [x] Offense/Armorer printed draw; Scholar basic = take a discard card; Magic Arrow base power 0

## Necromancer content (this round)
- [x] Necromancy ability: played in the after-win window on the map (never after Quick Combat), Necropolis heroes only; reinforces a bronze/silver unit — any unit on expert — for half the gold cost rounded down, needing no Citadel/Dwelling/Population token. The window opens on a fought neutral or PvP win and closes at turn end.
- [x] Quick Combat interaction: the win still pays the Freelancer's Guild bounty, but grants no XP and never opens the Necromancy window (rulebook p.40 + the card text)
- [x] Sandro's Cloak of the Undead King (lv I/IV/VI): the specialty card is placed on a matching unit card (map or combat) and its statistics replace the unit's until the card is defeated, when it is discarded and the card under it is revealed with the excess damage. The card rides across combats on the army card. Lv VI Legion may sit on a Few, Pack or even a Horde of Skeletons, stays on top, and the unit beneath it can still be reinforced/upgraded. The Pack of Zombies' printed abilities are inactive while a Horde covers it.

## Unit ability interactions (this round)
- [x] Retaliation triggers: Medusas paralyse the unit they retaliate against (Pack/Neutral automatically, Few only on a "0" from the post-retaliation Attack die); neutral Dread Knights gain +1 Defense while targeted by a Retaliation Attack; Dragon Flies sap 1 Attack from retaliations against them; Necropolis Dread Knights (Few) force the enemy's retaliation to roll 2 dice and resolve the lower (disadvantage)
- [x] Activation ("when their turn comes up") triggers: Ghost Dragons discard the enemy's positive morale token (Pack also adds +1 to its Attack die result); Wraiths/Trolls regenerate damage; the Wraith Pack also discards 1 random card from the enemy's hand.
- [x] **Enchanters' heal-or-buff** (`enchanter-heal-or-buff`): on activation the controller heals up to 2 damage on a chosen *other* friendly unit OR gains +1 Attack for the round, then acts normally. Neutral Enchanters always take the +1 Attack (even with a wounded ally); a player picks (a wounded friendly highlights, or "Gain +1 Attack instead"); with no friendly to heal it auto-buys the +1 Attack with no prompt.
- [x] **Faerie Dragons' damage-spell** (`faerie-dragon-spell`): on activation 2 flat spell damage (ignores defense, no spell-limit cost) to a chosen unit, then the dragon acts normally. Neutral picks the target by its normal attack priority; a player chooses. Plays the **Ice Bolt** projectile + sound onto the target before the damage number lands.
- [x] Combat-start trigger: the Few Archangel draws 1 card when combat begins (player and neutral fights); the Pack Archangel intentionally does not — it has the cancel-a-lethal-attack ability instead (still on the card text)
- [x] Global ("[map_effect]") army abilities: Crystal Dragons gain 2 valuables at each Resource round; Nomads offer an end-of-turn step to an adjacent empty field (once per turn); Rogues scout the top card of any table deck once per turn and keep it on top or move it to the bottom (deck rail "🔎 Scout" button; the peek stays private to the scouting player).
- [x] **Harpies' "Strike and Return"** (`harpy-return`, Dungeon few/pack + neutral): after the attack (and the enemy's Retaliation Attack, if any) the harpy may fly back to the space it moved from. A neutral always returns; a player is asked "fly back or stay" and decides. The return only fires when the harpy actually moved to attack and its origin space is still clear.

## Stability
- [x] Recoverable error boundary around the table/adventure UI plus a route-level `error.tsx`: a render crash no longer dumps the whole app back to a blank menu and loses progress — the server holds the state, so the board reloads from the latest synced snapshot (auto-clears on the next frame, or a "Reload the table" button)
- [x] **Tab-switch recovery**: the in-progress game is mirrored to `localStorage`; if the ephemeral server recycles while the tab is backgrounded and comes back as an empty setup lobby (new `bootId`), the client pushes its cached game back (`restoreRoom`) instead of dropping the player to the menu. The server only re-seeds over a fresh lobby, so it never clobbers a live game; a deliberate "New adventure" reset clears the cache.
- [x] **Implemented-effect tooltips**: every unit card hover/zoom now lists the engine's actual wired abilities (name + rules text) alongside the printed card text, so what the implementation does is always readable. Verified the Few Medusas carry only "Paralyzing Gaze" (no "No Range Penalty" — that is Pack-only).
- [x] Instant tray now spells out why a confirm is blocked when more Expert plays than crowns are selected (matches the existing Power-needs-a-Spell warning)

## Map-usable abilities
- [x] Wisdom (purchase) · Estates · Luck · Logistics (end-turn step + expert +1 MP) · Scouting (next Search 3/5) · Mysticism (recall; expert recalls support cards) · Eagle Eye (dig Basic/Expert spell) · Basic X Magic (school fetch in searches; expert +3 school Power) · Scholar · Leadership · Sorcery · Armorer/Offense map draw
- [x] Adventure hand play menu (cards with legal plays glow; cost picker for discard prices)

## Content
- [x] Full implemented spell set incl. Fireball (second adjacent target, skippable), Fire Shield, Counterstrike, Prayer, Town Portal, Haste/Slow (live initiative order)
- [x] **Spell Scroll** field (Stronghold): take a scroll + draw 2 Spells into it (pick Basic/Expert deck per draw), shown as a 📜 badge near the hero (not in hand, contents hidden from opponents). Cast either spell in combat at the lowest power level — cannot be buffed by any Power source, never the expert side, removed from the game on use, counts toward the spell limit. Sellable at the market for 2 gold each; an emptied scroll is discarded. Tested.
- [x] Full implemented artifact set across three tiers with printed discard/remove costs (tray chips + hand cost picker)
- [x] Blacksmith building implemented (artifact source)
- [x] Dice rewards verified vs wiki (resource 2/4 BM · 1/2 V · 3/6 G; treasure 2×XP · 2×artifact search · 1/2 resource dice)

## Images (all hosted locally now)
- [x] Hero portraits → the board-game art itself, cropped from the printed hero-board scans (/assets/hero_boardart-*.webp)
- [x] Hero board statistics use the printed icons (crossed swords / shield / spell book / tomes) cropped from the board scans
- [x] Town buildings (all 5 factions incl. bronze/silver/gold dwelling mapping) → heroes.thelazy.net town renders, downloaded to /assets/town (no more hot-linking)
- [x] Resource icons: gold pile / ore = building materials / crystal = valuables (HUD), downloaded to /assets/icons
- [x] Morale birds (positive/negative) in the HUD, downloaded to /assets/icons
- [x] WoG army-management stats art, zoomable from the hero board

## Table presentation (this round)
- [x] Top-panel resources: smaller icons in chips, the per-resource income spelled out (+N each resource round)
- [x] Unit deck panel shows a small icon of every unit card
- [x] Initiative rail shows the actual unit cards sorted by activation order, already during deployment
- [x] Location visits pop a center-screen notice (location, who, outcomes); Resource/Treasure/Attack dice rolled on the map tumble like the combat attack die (ivory / yellow / red cubes, printed faces)
- [x] Custom starting army picks tier slots (bronze lv 1–3 / silver lv 4–5 / gold lv 6–7, few or pack) instead of exact units; every player gets their own faction's units
- [x] Map clicks can no longer get stuck after a cancelled drag (pointercancel handling) and the map says why movement is locked
- [x] Event log capped at 500 entries with monotonic ids — long games no longer grow snapshots until clicks crawl

## Infra
- [x] PartyKit/Durable Objects unchanged-compatible (mode flows through the lobby actions; legacy fallback for old snapshots)
- [x] Tests: 115 passing (ruleset suite covers modes, gates, Cerberi, morale, Wisdom purchase, spell-into-attack)
- [x] content-tracker.md + README updated

## Known gaps (tracked in content-tracker.md)
- Some library cards now have working engine effects but are still kept out of the decks (effect tested in `library-cards.test.ts`, deck inclusion is a separate balance decision): Chain Lightning, Blind, Greater Gnoll's Flail, Mystic Orb of Mana, Charm of Mana, Shackles of War.
- PvP **Surrender/Retreat** are distinct house rules (round 1; enforced engine-side, `surrender-retreat.test.ts`):
  - **Surrender** needs the full **10 gold** in hand, pays it to the opponent, keeps your whole army in *both* troop-loss modes, applies no morale hit, sends the hero home, and gives the opponent **nothing** toward winning (no XP, no Necromancy, no hero-defeat victory credit). Blocked by Shackles of War.
  - **Retreat** (or a fought-out loss) pays **5 gold to the winner and may push the loser into debt** (gold can go negative), takes −1 morale, loses troops per the mode, and counts as a win for the opponent (XP + Necromancy + hero-defeat credit). Shackles of War does **not** block it.
- Still inert / out of the decks (no engine effect yet): Teleport, Mirth, Sorrow, Slayer, Dimension Door, Forgetfulness, Inferno; Tactics, Diplomacy, Pathfinding; Shield of the Dwarven Lords, Orb of Vulnerability (Necromancy, Magic Mirror, Intelligence, Artillery, **Visions** and **Learning** are now implemented and in the decks — Visions scrys a chosen Neutral deck with power paid by discarding Spells, Learning advances Experience an extra half/full level when a Hero is about to level up)
- Map-spell Empowerment (Town Portal +MP at power 2/4) resolves at base power for now
- Siege combat, secondary heroes, war machines beyond the Tent, scenario-specific Obelisk/Grail effects — unchanged from before
