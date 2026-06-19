# Heroes 3 Board Game Rules Understanding

This note captures the working model for future development. Treat the official rulebook as primary, the homm3bg wiki as a searchable fan database/clarification layer, and the playthrough transcript as practical examples of how turns feel at the table.

## Sources Read

- Official Archon rulebook PDF: https://archon-studio.com/files/manuals/homm/homm-rulebook_EN.pdf
- Fan card/database wiki: https://en.homm3bg.wiki/
- Wiki content index: https://en.homm3bg.wiki/content/
- Wiki scenarios list: https://en.homm3bg.wiki/scenarios/
- Wiki units reference: https://en.homm3bg.wiki/units/
- Wiki combat keyword page: https://en.homm3bg.wiki/keywords/combat/
- Wiki dice keyword page (attack die faces): https://en.homm3bg.wiki/keywords/dice/
- Wiki morale keyword page: https://en.homm3bg.wiki/keywords/morale/
- Wiki Griffins unit page (stat verification): https://en.homm3bg.wiki/units/griffins/
- Resistance card page: https://en.homm3bg.wiki/abilities/resistance/
- Magic Arrow card page: https://en.homm3bg.wiki/spells/magic_arrow/
- Bloodlust spell page: https://en.homm3bg.wiki/spells/bloodlust/
- Cure spell page: https://en.homm3bg.wiki/spells/cure/
- Fortune spell page: https://homm3bg.wiki/spells/fortune/
- Luck ability page: https://homm3bg.wiki/abilities/luck/
- First Aid ability page: https://homm3bg.wiki/abilities/first_aid/
- First Aid Tent war machine page: https://homm3bg.wiki/war_machines/first_aid_tent/
- Ogres unit page: https://en.homm3bg.wiki/units/ogres/
- Breastplate of Petrified Wood ("OR" artifact) page: https://en.homm3bg.wiki/artifacts/breastplate_of_petrified_wood/
- Attack statistic card page: https://en.homm3bg.wiki/statistics/attack/
- Wiki keywords index (Search, Remove, Empower, etc.): https://en.homm3bg.wiki/keywords/
- Might and Magic Fandom overview: https://mightandmagic.fandom.com/wiki/Heroes_of_Might_and_Magic_III%3A_The_Board_Game
- Local playthrough transcript: `C:\Users\klwar\Desktop\tai lieu nhap hoc sp\youtube script\Heroes of Might and Magic 3 The Board Game - Playthrough.txt` (Homecoming solo playthrough)

## Source Confidence

- Rulebook-derived mechanics are the source of truth for turn order, player turns, movement, town actions, deck flow, and combat timing.
- The homm3bg wiki is a fan project and says its card data was entered by hand, so imported card text should be validated against owned/official components before being treated as final.
- The playthrough is useful for UX and edge-case flow examples, especially simultaneous-feeling town actions, neutral combat pacing, scenario timers, and siege finale flow.

## Core Game Model

- The app should model the board game as a scenario-driven, turn-based adventure game with map exploration, town economy, deckbuilding, and tactical combat.
- Core-box player count is 1-3, while expansions and future app features may support more. The app architecture should not hardcode a two-player-only model.
- The map is scenario-shaped from tiles. Each map tile has multiple fields/spaces, many start hidden, and heroes reveal or place tiles through movement actions.
- Players own a faction, main hero, town board, unit cards, resources, income markers, and a deck of Might & Magic cards.
- Main heroes use the player deck, gain experience, level up, and normally have 3 movement points per turn. Secondary heroes are lighter map pieces and do not use the deck.
- Town actions are once per round per player and can happen during another player's turn, but not during combat. The core town action buckets are Build, Population, and Spell Book. Exception: the **Population** bucket is not consumed by a single purchase — a player may recruit/reinforce repeatedly in a round and the window only closes once they have bought *and then* move a hero (moving before any purchase leaves it open). See `commitPopulationOnMove`.

## Round And Turn Flow

- Rounds alternate between resource rounds and Astrologers' rounds.
- Resource rounds grant income from town buildings, settlements, and mines.
- Astrologers' rounds draw and resolve a global event card.
- At the start of a player turn, that player becomes active, may discard any number of hand cards, then draws up to hand limit.
- Player turn actions include spending movement points to move, reveal nearby tiles, place scenario tiles, and continue neutral combat for another round if needed.
- Scenario timers and victory/loss conditions can trigger from round numbers or game events, so scenarios need their own rule hooks rather than UI-only checks.

## Cards, Timing, And Reactions

- The player deck starts from hero statistics, starting spell(s), starting ability, and specialty cards. Artifacts/spells/abilities are later added through rewards and town actions.
- Hero level controls hand limit, specialty additions, ability searches, and the number of expert effects usable per round.
- Combat normally limits a player to one spell card per combat round, while specialty cards do not count against that spell limit. Instant cards (statistics, instant artifacts/abilities) are NOT limited to one per window: a player may commit one or several instants on the same attack/spell declaration, paying a crown for each expert play. The engine supports this both as repeated single plays and as one batched declaration (`PLAY_REACTIONS`).
- Card timing (rulebook p.22 + p.43): **Instant** effects resolve immediately and may be played at any time except between rolling the attack die and resolving damage — including during the opponent's activation. **Ongoing** and **activation** effects can only be played while activating one of your own units, *before it attacks*; ongoing effects last until used up or until your next turn starts. **Map** effects can never be used during combat; they are played on the adventure map during your turn. **Spells** may be cast at any moment of a combat involving your main hero (one per combat round), and Knowledge raises that round's limit.
- Luck (ongoing): basic play lets you reroll a Treasure die and a Resource die once during your turn (the adventure dice prompts offer the reroll); the expert play is one reroll of any die — including the attack die — and is consumed when used.
- Resistance card text (wiki): basic — "Play this card immediately after the enemy casts a spell. If the spell was cast with 1 power or less, ignore the Spell card's effect."; expert — "...Ignore the Spell card's effect." Whenever Resistance applies (basic under its power cap, expert always), the spell ends immediately: the pending spell is cancelled and the instant window closes. Power cards already committed are counted when checking the basic cap.
- "OR" cards (mostly artifacts, e.g. Breastplate of Petrified Wood: "Draw 1 card. — OR — +1 Power") give the player a choice of exactly one printed option when played. Options can carry their own timing (the +1 Power side only matters during your own spell cast; the draw side is an anytime instant).
- Some cards draw more cards (`DRAW_CARDS`). Draws come from the owner's personal draw deck; when it empties mid-draw, the discard pile is shuffled (seeded) into a new draw pile and drawing continues.
- Deck layout on the table: each player has a draw deck + discard pile (+ removed-from-game pile), and the table has three shared decks — Spells, Abilities, Artifacts — each with its own discard pile. "Search X" (wiki keyword + playthrough): reveal the top X cards of the named deck, keep one in hand, discard the rest to that deck's discard pile — or take the top card of that discard pile instead.
- Instant cards create the most important engine requirement. The engine must pause resolution, expose legal reactions, accept pass/reaction actions, and then resume the original action. The attack die is rolled only after every instant window closes — buffs first, dice last, then damage.
- Reroll effects need a pending-choice step. Fortune is played before the die roll and lets the player reroll an Attack die according to its power, while Luck's expert effect can apply to Attack dice during the turn.
- Do not implement instant cards as UI shortcuts. They should be data definitions with triggers, conditions, targets, and effects handled by the engine.

## Combat Model

- The battlefield is a 4-wide by 5-tall grid (20 spaces). Adjacency and movement are orthogonal: a diagonal space is not adjacent, so reaching it costs two spaces. The engine measures distance with Manhattan distance, not Chebyshev.
- Units have attack, defense, health points, and initiative. Higher initiative activates first. Same-speed ties (house rule, `getActivationStep` + `advanceActiveUnit`): when several of ONE side's units tie for the slot, a human is prompted to choose which goes first (`combat-activation-order` choice). A real player picks among their own tied units; the Neutral army cannot answer a prompt, so the player running the fight (the attacker — the player is always the attacker against guards) breaks the Neutral tie on its behalf, exactly as the attacker already breaks a Neutral unit's target ties. When BOTH sides have units tied at that initiative, activation alternates between them, ATTACKER-first: on an even split the attacker side leads, then they go back and forth (in a Neutral fight the player leads, then the Neutral army; in PvP the attacker leads the defender). Units still act one at a time (a faster resolution can still remove a tied enemy before it acts).
- A combat round is a full cycle in which eligible units normally activate once.
- On activation, a unit may move and attack according to its type, or defend (or hold position once it has begun acting).
- Movement points: melee (ground) and flying units have 3; ranged units have 1.
- Unit types (rulebook p.38): **Ground** units may move up to 3 spaces and then attack an adjacent enemy. **Flying** units may move up to 3 spaces *ignoring Combat Obstacles* and then attack an adjacent enemy. **Ranged** units may attack any enemy anywhere and then move up to 1 space, OR move up to 1 space *without attacking* — a ranged unit can never move first and shoot afterwards. The engine ends a ranged unit's activation automatically when it moves before attacking.
- Combat Obstacles (rulebook p.42): every card on the combat board — unit cards and obstacle tokens — blocks the movement of all non-flying units. Ground and ranged units must path around them (the engine BFS-paths through empty orthogonal spaces); flying units pass over but may not land on them. Nobody may end a move on an occupied or obstacle space.
- Defense tokens (rulebook p.42): defending replaces attacking and ends the activation. The token is discarded at the start of the unit's **next activation** — it survives the end of the combat round.
- Retaliation: a surviving adjacent defender retaliates once per round unless the attacker ignores retaliation (Vampires, Cerberi, Arch Devils, pack Harpies) or the defender has unlimited retaliation (Griffins).
- Double attack (Marksmen "attack this target again", Elves "on a −1/0 result, attack again"): the follow-up only fires off the first attack of the activation and never chains — exactly two attacks maximum. Per the rulebook, unit_attack abilities resolve for the first attack only.
- "Pack and Few" (rulebook p.39 example): damage is **not** capped at the pack's health. When a pack's HP is gone it turns to its Few side and the leftover damage is placed on it.
- The attack die has six faces — two `-1`, two `0`, and two `+1` (source: https://en.homm3bg.wiki/keywords/dice/). A normal attack rolls one die; advantage/disadvantage rolls two dice and takes the higher/lower face. Each roll modifies the attacker's attack value before defense is subtracted. The app rolls this die from a per-combat seed so results are deterministic for every client (server-authoritative) yet not previewable by players.
- Morale (not yet modeled) lets a player reroll any die they have thrown, among other off-combat uses (source: https://en.homm3bg.wiki/keywords/morale/). Reroll mechanics currently come only from card effects such as Fortune and Luck.
- Damage is tracked directly on health. Defense reduces non-magical attack values, but direct damage from spell/effect sources should not be reduced unless the effect says so.
- Healing and effect removal should operate on represented damage/effect state. Cure removes damage by power and removes represented negative/removable effects from the selected friendly unit.
- First Aid Tent is a permanent war machine effect that can remove 1 damage from a selected friendly unit once during each combat round.
- Combat timing has important windows: activation cards before attack, instant attack/defense cards before the attack roll, then attack roll and resolution as a protected segment.
- Unit "other" actions, such as Ogres placing an attack token, are activation actions instead of moving and attacking. They should create the represented buff effect and end that unit's activation.
- Neutral combat uses difficulty-based neutral decks. Player combat uses recruited units. Siege and expansion battlefields add special participants such as walls, gates, arrow towers, war machines, and obstacles.

## Data Import Implications

- Data should be imported incrementally: factions, heroes, units, spells, abilities, artifacts, fields, scenarios, events, and expansion content.
- Every imported record needs source/credit metadata. Official art/card images must not enter the repo without clear permission and attribution.
- Current development UI uses remote wiki image URLs for visual reference only; images are not copied into the repository. Keep this source metadata with every card/unit record.
- Cards that cannot be represented by existing handlers should be marked not implemented with notes about missing timing/effect support.
- Wiki pages are useful for IDs, grouping, and community notes, but official components/rulebooks should win when there is a conflict.

## Engine Priorities

- Keep state serializable and server-authoritative.
- The UI must ask for legal actions and submit actions; it must not decide rules.
- Hidden information needs a player-visible state projection before serious multiplayer work.
- Event logs should be first-class because they power replay, debugging, reaction triggers, AI explanations, and "why was this legal" UX.
- AI should consume the same legal action list as humans. No special AI-only rule path unless a scenario explicitly defines one.
