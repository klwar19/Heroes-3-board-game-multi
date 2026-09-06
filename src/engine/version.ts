import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";

/**
 * Room-server / client compatibility fingerprint.
 *
 * The app ships as two independently-deployed halves:
 *   - the Vercel frontend (this bundle), and
 *   - the PartyKit room server (party/index.ts), which is the authoritative
 *     rules engine and validates every action.
 *
 * They drift apart when one is redeployed without the other — e.g. the UI
 * ships new heroes (Moandor/Zydar) or a new action (Hire a Secondary Hero)
 * but the room server still runs the old engine and silently rejects them.
 * That looked like "the hero can't be selected / hiring does nothing".
 *
 * Both halves compile ENGINE_SIGNATURE from their own copy of the engine, and
 * the server stamps it onto every snapshot it sends. The client compares the
 * server's signature against its own; a mismatch surfaces a visible "room
 * server is out of date — redeploy PartyKit" banner instead of a silent
 * failure. See README "Deploying" and .github/workflows/deploy-partykit.yml.
 */

/**
 * Bump when the action set or the persisted GameState schema changes in a way
 * the room server must understand (a new `GameAction` type, changed reducer
 * semantics, a new required state field). Pure content additions — heroes,
 * factions, units — are detected automatically by the fingerprint below and
 * do NOT need a bump.
 */
// v14: authoritative combat semantics changed so Rebirth resolves BEFORE a
// Creature Bank Stack Token or Pack→Few layer is lost. The earlier v13 worker
// consumed the Stack Token first, so a 5-damage hit left a Crypt Skeleton
// un-Stacked at 1 HP even when the frontend contained the fix. This is a pure
// reducer change (the catalogs below do not detect it), therefore the explicit
// protocol bump is required to make every stale room/server show the version-
// skew warning and to invalidate cached v13 room snapshots.
// v15: verified-identity seats (Phase 2). A new action (SET_ROOM_REQUIRE_AUTH),
// two new state fields (RoomMember.userId, RoomMembershipState.requireAuth) and a
// changed reducer contract — the seat-ownership guard now binds a signed-in actor
// to their verified account id (a spoofed actorClientId no longer grants a seat)
// and joinRoom stamps that id onto the member. A stale room server would ignore
// the new action and the verified-identity guard, so the explicit bump surfaces
// the version-skew banner instead of silently reverting to clientId-only seats.
// v16: changed reducer/legal-actions semantics — computerDecisionOwner mirrors
// getLegalActions' window precedence (the round-6 single-player table freeze: a
// computer-owned window behind the round-start barrier was owned by nobody),
// the runner's stall recovery, the edge adopting the duplicate-army-id repair
// on rejected actions, and mandatory ability-target choices becoming skippable
// once every candidate died. A stale worker legality-checks differently from
// the new client, which surfaces as "That action is not legal in the current
// game state" on clicks the table itself offered — the catalogs cannot detect
// any of this, so the explicit bump makes the skew banner fire.
// v17: new persisted GameState schema + reducer semantics that a stale room
// server cannot understand — the `polish-grail-utopia` house rule (random
// Grail/Utopia placement, guard packages, dig/build rules), a new
// `subterranean-tile-pick` OPTION_CHOICE opened on first gate entry (resolved
// through CHOOSE_OPTION), the single-player map-authored deployment + per-seat
// `computerStartingBonus`, the `garrisonBorderPassage` field, and the
// `subterraneanTilePool` / `tileIdentityLocked` / `gateTileChoiceEligible`
// state. None of these touch the hero/faction/unit catalogs the fingerprint
// hashes, so the explicit bump is required to make a skewed edge/client show
// the version banner instead of silently ignoring the new rules or rejecting a
// `subterranean-tile-pick` click the new client offers.
// v18: another batch of persisted schema + reducer semantics a stale room
// server cannot replicate — the `market_trade` designer timed event (a
// trade-only Market after Resource-round income, raising the round-start
// barrier), the hidden Grail/Utopia editor package (`objectives.hiddenGrailUtopia`,
// `grailFieldCleared`) and the now-COUNTED `defeat-dragon-utopia` win condition
// (`utopiaDefeatedFieldIds`), a new `dimension-door-hero` OPTION_CHOICE with
// multi-hero Dimension Door / Town Portal (a v17 server offers only the main
// hero, so a secondary-hero cast or its CHOOSE_OPTION indices mismatch), the
// `garrisonBorderPassage` default flipped OFF→ON (changed `canCrossEdge`
// movement legality) and the lethal-save reaction window now opening for a
// Polish Unit-Stack layer hit (`stackLayerOnly`), plus 6-player skirmish seats
// (`unusedStartsAsNearFrom`). None touch the hero/faction/unit catalogs the
// fingerprint hashes, so the explicit bump makes a skewed edge/client show the
// version banner instead of silently dropping these rules or rejecting a
// `dimension-door-hero` click the new client offers.
// v19: the 2026-08-06 gameplay-fixes batch — a new
// `ACKNOWLEDGE_FIRST_PLAYER_ROLL` action + the `openingFirstPlayerRollPending`
// opening gate (a stale edge would reject the dismiss click and strand the
// table), the `GRAIL_TILE_SCRY` visit step (private Obelisk Grail clues),
// `USE_UNIT_DIE_IGNORE` gaining a REQUIRED `discardCardId` (the Halberdier
// Parry selectable discard — old/new payloads are mutually unintelligible),
// the PLAY_CARD/PLAY_REACTION `drawOnly`/`utilityOnly` flags, per-owner
// in-flight card tracking (`playedCardIdsByPlayer`) with recovery
// `excludeCardIds`, and two new house rules (`initiative-specialty-draw`,
// `eversmoking-ring-of-sulfur-major`). None touch the hero/faction/unit
// catalogs the fingerprint hashes, so the explicit bump makes a skewed
// edge/client show the version banner instead of silently dropping the new
// rules or rejecting the new actions.
// v20: Grail → Utopia conversion re-timed and de-rewarded (USER RULE
// 2026-08-07). New persisted state a stale room server neither writes nor
// understands: `adventure.grailTakenFieldId` / `grailTakenConversion` (the
// conversion now fires at the DIG, not when a Grail's guards fall, and the dug
// field is excluded by id) and `MapFieldState.grailConverted` (a converted extra
// Grail pays NO Utopia reward and is not a Dragon-Hunt / VP Utopia). A v19 edge
// would convert on the guard clear and pay the full 20 gold + Search 3/5/5 +
// token pick on a converted site — a silent rules divergence between the two
// halves, which is exactly what the version banner exists to surface. It also
// drops the `grailAsUtopia: "always"` pre-dig Utopia-dragon guard swap (a v19
// server deals a different guard army for the same field).
// v21: Polish Set Artifacts (`polish-set-artifacts`, default OFF). New ACTIONS a
// stale room server would reject outright (`SELECT_ARTIFACT_SET_UNIT`,
// `USE_ARTIFACT_SET_POWER`), a new OPTION_CHOICE context (`artifact-set-scry`)
// with its own player-view masking, new persisted state
// (`PlayerState.artifactSetRoundUses` / `artifactSetTiers`,
// `combatStats.artifactSetUsesThisCombat` / `artifactSetSelections`), a new
// active-effect modifier (`ATTACK_ROLL_ADVANTAGE`) and three new feed events.
// With the rule OFF nothing is written or read, but a table that turns it ON
// against a v20 edge would silently lose every set effect — the banner exists to
// surface exactly that.
// v22: Ⅱ–Ⅲ tile TYPE CHOICE (`GameSetupOptions.farTileTypeChoice`, default
// OFF). New persisted state a stale room server neither writes nor understands:
// `adventure.farTileTypeChoice` / `farTileTypeChoices`, a new
// `pendingFarTileFlip.offerMode` value ("type-choice") with its index→kind
// `typeOptions` map, and the `CustomMapPreset.farTileTypeChoice` /
// `farTileTypeChoices` designer fields (which also seed the lobby). With the
// rule OFF nothing is written or read, but a v21 edge handed a "type-choice"
// flip would fall through its keep/reroll switch and misread the chosen index —
// the banner exists to surface exactly that.
// v23: corrected Grail-to-Utopia reward semantics. A converted extra Grail now
// pays the same fixed Search 3 / 5 / 5 Artifact ladder (and normal field bundle)
// as a Dragon Utopia instead of returning reward-free. A v22 room server would
// silently award zero Artifacts for the same clear, so reducer compatibility
// requires an explicit bump.
// v24: multi-target combat legality + border-free movement (the
// fix-ai-map-combat-rules batch). Chain Lightning (spell + Solmyr I/VI) is now
// illegal below 3 living placed units and its final two differing bolts open an
// ABILITY_TARGET_CHOICE a v23 server never opens; Deemer's Meteor Shower needs
// its exact printed adjacent picks at the chosen centre; and designer yellow
// edges touching a Creature Bank / PvE Gate carve / Field Override hex no
// longer seal MOVEMENT (`fieldNeverWearsBorders` in
// `isDesignedEdgeSealedBetween`) — a v23 edge still seals them, so a new client
// would offer steps a stale server rejects ("not legal" on every click, the
// frozen-table symptom class the banner exists to surface).
// v25: ongoing cards are held in play whenever their effect is live. A shared
// action-tail pass (`holdLiveOngoingCardsFromDiscard`) now pulls ANY card out of
// its owner's discard pile while a lasting effect it created is still running —
// closing the paths whose effect is only created LATER than the play action
// (Fortune's map Power prompt, a Shackles of War played in the PvP prep window).
// No new action and no new state field (the `ongoingCards` tray already exists),
// but the same card sits in a DIFFERENT zone on a v24 edge, so discard-reading
// offers a new client derives (a Scholar / recovery TAKE_FROM_DISCARD naming
// that card) would be rejected by a stale server — the "not legal" symptom class
// the banner exists to surface.
// v26: the Polish Set Artifacts "rolls 2 dice and resolves the higher result"
// tiers (Angelic Alliance 3, Power of the Dragon Father 2) stopped being
// pre-emptive dock powers and became INSTANTS offered inside the attacking
// unit's own `UNIT_ATTACK_DECLARED` reaction window, lifting exactly that one
// roll (a new OPTIONAL `artifactSetAttackAdvantage` stack-item modifier instead
// of a combat-duration ATTACK_ROLL_ADVANTAGE effect — absent on every legacy
// snapshot, so old states read exactly as before). No new action type, but the
// LEGALITY moved: a v25 edge does not offer the tier in
// a window (so the new client's pop-up button is rejected as "not legal") and
// still offers it pre-emptively (so a stale client's dock button would grant a
// combat-long advantage the new engine refuses) — the exact skew class the
// banner exists to surface.
// v27: the Arrow Tower is never RELOCATED onto the battlefield. The two card
// effects whose whole job is to move a unit onto a cell (`TELEPORT_UNIT` — the
// Teleport Spell — and `MOVE_UNIT_ADJACENT` — the Necklace of Swiftness's "move
// one space" arm) no longer offer the Tower as a target, and their resolution
// refuses it as a backstop. A v26 edge happily drags the Tower from its
// off-board position -1 onto a real cell (verified: Teleport landed it on A1,
// the Necklace stepped it to cell 3), where it occupies a space, becomes a melee
// target and takes the positioning penalties its printed card exempts it from —
// a silent rules divergence between the two halves. No new action and no new
// state field; the LEGALITY narrowed, so a stale client's cast at the Tower is
// rejected by a new server ("not legal"), the exact skew class the banner
// exists to surface.
// v28: the four Tome relics' School dig stopped enumerating a second, crown-
// paying PLAY_CARD "(expert)" offer and now opens a new `spell-deck-pick`
// OPTION_CHOICE — one description on the card, then two buttons (Basic Spells
// deck / Expert Spells deck), the crown spent at the PICK instead of at the
// play (2026-08-11 user ruling). Both halves of the skew break: a v27 edge still
// offers the expert play (so a new client that no longer renders it can still be
// handed one, and the v27 edge never opens the pick a new client's CHOOSE_OPTION
// would answer), and a v27 CLIENT's "(expert)" click is rejected by a v28 server
// as "not legal". The new `pendingChoice.spellDeckPick` payload is optional and
// absent from every legacy snapshot, so old states read exactly as before. On a
// SINGLE-deck table this also removes a pure trap button: the v27 "(expert)"
// play spent a crown to dig the very same deck for the very same card.
// v29: the Little Busters / Monster Girl Quest towns batch (this branch forked
// at v23; main has meanwhile taken v24–v28, so 29 is the first free slot — a
// merge conflict on this constant must resolve to 29, never back to a lower
// number). NEW ACTIONS a stale room server rejects outright: ASSIGN_UNIT_JOB,
// SET_MGQ_SPIRIT, RESOLVE_COMPANION_RECRUITMENT, COMMANDER_SET_BOND, plus
// PLACE_COMMANDER gaining an optional `unitId` (integrated commander/hero/troop
// deployment sorting — a v28 server ignores the field and moves the COMMANDER
// to the clicked cell instead of the named ally) and USE_UNIT_ABILITY gaining
// `mode` (Sofia's White Magic heal-vs-attack pick — dropped silently by an old
// server, resolving the WRONG half). New persisted state an old server neither
// writes nor understands: `combat.integratedCommanderDeploymentPlayerIds`
// (formation moves offered DURING ordinary troop deployment instead of the
// separate pendingCommanderPlacement window — the two halves would disagree
// about WHEN PLACE_COMMANDER is legal), `unit.heroUnit` (Little Busters
// battlefield heroes — tierless at every grade gate, so a v28 server offers
// tier-gated casts at them that a new client refuses, and vice versa),
// `adventure.pendingCompanionRecruitment` + the prep-window pendingVisit gate
// (an attacked player may play Legion mid-prep and resolve its troop pick —
// a v28 server hides those RESOLVE_VISIT_STEP offers behind the combat
// dispatcher and rejects the new client's clicks), MGQ jobs / spirits / gold
// contracts, and Sonya's `commander.bondedArmyUnitId`. The catalogs detect the
// new factions' content, but none of the action/legality changes above — the
// explicit bump makes a skewed edge/client show the version banner instead of
// the "not legal on every click" frozen-table symptom class.

// v29 (continued — the "Polish combat towns spirits and MGQ balance" commit
// landed on the same undeployed protocol, so it needs no second bump but IS
// covered by this note): a NEW OPTION_CHOICE context
// `bounty-hunter-mark-start` with its own `pendingChoice.bountyHunterMarkStart`
// payload and the `combat.bountyHunterMarkStartResolved` latch (the Factory
// Bounty Hunters' combat-start Mark became a player pick instead of the old
// deterministic strongest-enemy auto-placement — a v28 edge never opens that
// choice and rejects the CHOOSE_OPTION a new client sends); SET_MGQ_SPIRIT
// legality widened to the neutral DEPLOYMENT window (a v28 server rejects it
// there while a new client withholds "Ready for battle" until a Spirit is
// picked — a hard stall on a skewed pair); and two REWARD readings a stale edge
// pays differently for the same clear — the Ⅶ Dragon-Utopia FIELD now pays
// 20 gold + two Artifact Search (3) in every mode (was 10 or 20 gold + Search
// 3/5/5). The Creature-Bank Dragon Utopia TOKEN briefly took a fixed
// 40 gold + Search (3)/(5)/(5) on this same undeployed protocol; that was
// VETOED (2026-08-13, the second veto) and REVERTED — the token pays its
// printed card again (40 gold + Search (3), then one "Search (5) the Artifact
// or Spell Deck" per Stacked defender), with its Artifact searches newly capped
// at MAJOR (a Ⅳ–Ⅴ placement never reaches the Relic deck). A v28 edge would
// therefore offer the Relic deck on that reward; still no new action or state
// shape, so the cap needs no bump of its own.

// v30: the Polish Balance Pack, step 1 (`polish-card-balance`, default OFF).
// NO new action type — but two skew hazards a stale room server cannot see.
// (1) The house-rule ID itself: `resolveHouseRules` iterates the server's OWN
// registry, so a v29 edge freezes `adventure.houseRules` WITHOUT this key,
// `houseRuleEnabled` falls back to the mode default (false), and every reprint
// silently stops running while the new client keeps showing the reprinted card
// FACES — the client reads one card and the server plays another. (2) The
// Scouting offer SHAPE: the reprint is Search (X+2), so `scoutingPromptFor`
// offers a basic tier where the classic flat 3 was withheld (any Search of 3+).
// A v29 server therefore builds a DIFFERENT option list for the same pop-up, so
// the new client's CHOOSE_OPTION index selects the wrong tier or is rejected.
// The new persisted state is additive and optional — `SEARCH_COUNT_OVERRIDE`
// gains `balanceDelta` / `balancePersist`, which an old server simply ignores
// (falling back to the flat `count`), so every legacy snapshot reads as before.
// v30 (extended, still v30 — this number has never been deployed): the pack's
// remaining NINE Abilities. This DOES add an action type — `TACTICS_MOVE_UNIT`
// (the reprinted Tactics' "move one of your units 1 space" arm, the twin of
// SWAP_COMBAT_UNITS) — which a stale edge rejects outright, and three more offer
// SHAPES a stale server builds differently for the same pop-up: the Catapult's
// round-start offer gains a third option (the Ballistics expert double, appended
// after fire/skip), the Scouting pop-up gains a trailing Wisdom widen, and the
// Eagle Eye play opens a `spell-deck-pick` whose buttons carry a spell LEVEL
// (`spellDeckPick.wantedLevels`, with `school` now optional). Also new and
// additive: the `deck-card-placement` pendingChoice context (the reprinted
// Diplomacy's top/bottom placement) — a v29 server has no resolver for it.
// One more legality skew: the reprinted Ballistics' basic side ENTERS PLAY even
// though the card carries no card-wide `permanent` flag (flagging it would move
// the rule-OFF card's reaction-window behaviour), so a stale server rejects that
// play with "That card is not a permanent." while the new client offers it.

// v30 (extended again, still v30 — never deployed): the pack's 21 SPELLS. NO new
// action type, but a stale edge is a real skew: it resolves every one of them
// from the PRINTED ladder while the new client shows the reprinted face and
// offers the reprinted targets (Slayer against an AZURE unit, Blind / Dispel /
// Disrupting Ray at ANY tier, Forgetfulness with no tier gate at all), so an
// offer the client builds can be rejected. Two additive pendingChoice CONTEXTS
// come with them — `disrupting-ray-mode` and `dispel-scope`, plain OPTION_CHOICEs
// carrying `balanceSpellChoice` — for which a v29 server has no resolver; the
// persisted additions are optional throughout (`ActiveEffectState`.
// `activationsRemaining`, the stack modifiers `attackDamageCap` /
// `misfortuneDie`), so an old server just ignores them.

// v30 (extended again, still v30 — never deployed): the pack's 27 ARTIFACTS. NO
// new action type either, but the skew is again real: a stale edge prices the
// Discard-X relics without their flat +1, triples a Centaur's Axe "-1", refuses
// the Speculum / Pendant of Second Sight extra option indexes the new client
// offers, and rejects a `CHOOSE_PENDING_ROLL` on anything but the LATEST
// candidate — which the reprinted Cards of Prophecy ("roll it 3 times and
// resolve 1 chosen result") depends on. Every persisted addition is optional:
// `AttackRerollSource.rollExtraCandidates`, the ATTACK_DIE_REROLL choice's
// `freeCandidateChoice`, the stack modifiers `attackDieMultiplierSkipsNegative` /
// `inscribeCastToSpellBook`, the `discard-pick` reward's `polishRecoveryLimit`,
// and the two new ActiveEffectModifier variants `GROUND_MOVEMENT_BONUS` /
// `RANGED_ATTACK_REROLL` / `REROLL_ENEMY_PLUS_ONE`, which an old server ignores.

// v30 (extended again, still v30 — never deployed): the pack's 11 SPECIALTIES,
// which COMPLETE it (71 cards). NO new action type: every reprint rides an
// existing one. The skew is again real when the rule is on — a stale edge takes
// a Cast a Spell enabler for a raw Spell in Jeddite's dig and Adelaide's take
// (its `matchesFilter` has no `cast-enabler-or-specialty` case and falls through
// to "anything matches"), never opens Adelaide's second Book-refresh pick,
// refunds no gold for a traded-in Unit Stack, gives the Cloak/Necromancy cover
// no +1 on a Stack, refuses Ciele I/IV's Book refresh-and-cast (its enabler
// lookup takes the FIRST cast option, not the house-rule-gated one) and still
// offers Tarnum (Conflux) I's Remove pick. Every persisted addition is optional
// and an old server simply ignores it: `UnitTransformState.stackAttackBonus`,
// the `discard-pick` reward's + pendingChoice's `polishRefreshAfter`, and the
// two new `filter` values `cast-enabler-or-specialty` / `polish-refresh-only`.

// The face-swap seam and every reprint listed in the `polish-card-balance`
// house-rule description are otherwise pure engine reads, so a table that leaves
// the rule OFF is unaffected by the skew either way.
// v31: WHO GOES FIRST is a lobby option (`playerOrderMode`, default "random" —
// absent reads as random, so every legacy lobby/snapshot is byte-identical).
// NO new action type, but a stale room server is a REAL skew because the game
// is BUILT on the server: a v30 edge's `setGameOptions` has no branch for
// `playerOrderMode` / `manualPlayerOrder`, so it silently drops the host's
// deliberate order, `buildAdventureFromLobby` never carries it, and the table
// rolls the die anyway — the new client meanwhile shows the chosen order in the
// lobby, so what the host sets is not what the game plays. Every persisted
// addition is OPTIONAL (both option fields plus the `opening-first-player-roll`
// reward's `skipRoll` flag), so an old server never crashes on a new snapshot —
// it just ignores `skipRoll`, rolls anyway, rotates the order away from the
// host's choice and can arm an opening ceremony the new client never expects.
// `npm run deploy:partykit` is therefore owed alongside the Vercel deploy.
// v31 (extended, 2026-08-14 — the number is NOT bumped because v31 has never
// reached the edge, so every stale room already shows the skew banner): WOG
// Commanders — raising the commander's SPEED grade once
// (`commanderSortUnlocked`) now unlocks the pre-combat sort for every fight, and
// a sort-ABILITY commander (Vanguard Marshal / Marshal's War Horn) that starts a
// fight on its own front line gains a combat-long +2 Initiative. NO new action,
// NO new persisted field (the buff is an ordinary `activeEffects` entry any
// engine understands), but the SORT LEGALITY moved server-side: a v30 edge would
// neither inject a Speed-graded commander into troop deployment nor accept the
// `PLACE_COMMANDER` the new client offers for it ("that action is not legal"),
// and it lays no front-line buff. Deploy both halves.
// v32 (2026-08-15): the Unit Experience / veterancy redesign changed COMBAT
// SEMANTICS a stale worker cannot reproduce, while `ENGINE_SIGNATURE` hashes
// only the unit/hero/faction KEY lists (no unit was added) — so without this
// bump no skew banner would fire and the table would just reject actions.
// What moved: `maybeDeclareDoubleAttack` now fires for MELEE via the new
// `anyRange` flag (a v31 edge rejects the offered second attack);
// `ON_ATTACK_DIE_DRAW` became a min/max window; `unit.type` is now MUTABLE to
// "flying" (`veteran-flying-movement`) on the persisted `CombatUnitState`, so
// the client offers cross-unit moves the old server refuses; the Fear Aura roll
// CONSUMES a combat die from the shared cursor, desynchronising every later
// seeded roll between the two halves; plus the whole rank-schedule resolver
// (the per-rank stat ladder, the effect-aware no-op dedupe) and Guarded Stance's
// new `FLAT_DEFENSE_WHEN_ATTACKED` arm, which changes the damage maths for any
// ranked unit. `npm run deploy:partykit` owed.
// v33 (2026-08-15): the rank-schedule resolver is the REDESIGN's
// "explicit per-unit override > flavour generator" again. v32 wrongly consulted
// the old hand-authored `UNIT_RANK_SCHEDULES` table between the two, handing 127
// units different rank rewards than `docs/unit-experience-balance-sheet.md` (the
// design authority) prescribes; that table is now DELETED. A v32 edge therefore
// grants a DIFFERENT ability/stat at the same rank for those units — same action
// ids, silently different game state — so it must show the skew banner rather
// than serve the wrong rewards. `npm run deploy:partykit` owed.
// v34 (2026-08-15): the unit-experience / neutral-progression batch. What
// moved server-side: DRILL_UNIT is tier-priced (1/2/3 gold) with 1/2/3 uses
// per round at hero levels I/IV/VII (a v33 edge validates the old 2-gold
// once-per-turn rule and rejects/mis-prices the new offers); Neutral Rank-Up
// uses new tier round tables capped at ELITE (v33 capped at Veteran on
// different rounds — same actions, silently different guard stats) plus
// Far/Near Creature-Bank round schedules replacing the Stack-Token Seasoned
// rule; won combats vs Veteran/Elite neutral guards award +1/+2 bonus unit XP;
// and a won Creature Bank reward card (side "bank") now trains on the veteran
// track (XP folds, drillable at 1 gold) — USER RULE 2026-08-15.
// `npm run deploy:partykit` owed.
// v35 (2026-08-16): the instant-specialties + Drill-anywhere batch (b1b91c8b).
// What moved server-side, all same-action-id validation changes a v34 edge
// answers DIFFERENTLY (so without this bump the symptom is "that action is not
// legal" instead of the skew banner): DRILL_UNIT no longer requires the main
// hero in an OWN Town — it is free at any Town/Settlement/Random Town and
// spends 1 hero movement anywhere else (a v34 edge rejects every off-Town
// drill and never deducts the movement a new client shows); Melodia I /
// Yuiko I gained a second CHOOSE_ONE option ("Draw 1 card", combat instant) a
// v34 edge has no branch for; Torosar VI and Tarnum-Castle IV re-shaped from a
// bare effect to a single-option CHOOSE_ONE, so the new client's
// `optionIndex: 0` plays mis-resolve on an old edge; and ~20 printed instant
// faces (Ballista activations, Fortune/Scholar takes, Cannon shots, Kud's
// Rocket Launcher rethemes) gained `combatAnytime`, offering window joins a
// v34 edge refuses. `npm run deploy:partykit` owed.
// v37 (2026-08-17): faction limits add server-authoritative state changes at
// existing boundaries. Little Busters now pay up to 4 gold each Resource round;
// an MGQ main hero must discard one chosen hand card before confirming combat
// deployment, recorded per combat so it cannot be charged twice. A v36 worker
// would silently omit both costs and reject the resulting choice action.
// v38 (2026-08-18): three server-authoritative resolution changes a v37 edge
// answers DIFFERENTLY. (1) A won Creature-Bank reward's Stack Token is now rolled
// at RANDOM at combat start (rollRandomBankRewardStackTokens) and no longer picked
// — a v37 edge fields the card with NO token / opens the retired CHOOSE_ONE pick,
// diverging on the unit's live stats. (2) A Meteor Shower / Frost Ring blast fired
// inside an attack window pauses that window under its area-pick and resumes it
// after every pick — a v37 edge strands the 2nd/3rd target and resolves the attack
// early. (3) Sorrow/Anti-Magic/Blind/Frenzy/Disrupting Ray may now target a tierless
// Creature-Bank unit at its underlying grade — a v37 edge rejects the same cast as
// illegal. `npm run deploy:partykit` owed.
// v39 (2026-08-18): merges the Polish Balance Pack fix batch — both this batch and
// the v38 above independently bumped 37->38 in parallel, so the merged engine gets
// a distinct v39 to avoid an undetected client/edge skew between the two v38s. New
// server-authoritative behavior in the balance batch a v38 edge answers differently:
// Cards of Prophecy map dice roll-3-keep-1 (prophecyThreePick visit-step flag) and
// its positive next-activation duration fix; the Polish Balance First Aid EXPERT
// (+2 Health) gaining `combatAnytime` (playable as a pre-hit attack-window reaction);
// Learning's standalone drawOnly hand play; and map Mysticism refreshing the just-cast
// Book Spell under polish-spell-book. All gated on the relevant house rules, so
// rule-off tables are byte-identical. `npm run deploy:partykit` owed.
// v40 (2026-08-18): a user-reported balance/UX batch with server-authoritative
// rule changes a v39 edge answers DIFFERENTLY (same action ids, silently
// different game state — the exact skew the banner exists to surface):
// (1) the BASE Fire Wall spell no longer burns a unit that merely BEGINS its
// activation on it — a `burnsAtActivation` flag now gates the activation burn to
// Luna's specialty and the WoG Hell Steed only; a v39 edge still burns everyone
// at activation. (2) Dispel's Power-2 "clear ALL ongoing effects" pick now also
// clears every battlefield obstacle/trap token (Fire Wall, Force Field,
// Quicksand, Land Mine); a v39 edge leaves them standing. (3) The
// bank-unit control-spell targeting (Sorrow/Anti-Magic/Blind/Frenzy/Disrupting
// Ray reaching a tierless Creature-Bank unit at its underlying grade) is now
// gated behind the NEW `polish-bank-unit-spells` house rule — a v39 edge's
// `resolveHouseRules` doesn't know the key and its old code ran the targeting
// ALWAYS-ON, so it offers the cast a new (rule-off) client refuses, and vice
// versa. (4) Fortune's combat reroll now unlocks a free candidate pick
// (`chooseResult` on the ATTACK_DIE_REROLL modifier → `freeCandidateChoice`); a
// v39 edge forces the latest roll and rejects a `CHOOSE_PENDING_ROLL` on any
// non-latest candidate. (5) The Polish Balance Diplomacy artifacts (Diplomat's
// Ring / Ambassador's Sash) never open the Azure Neutral deck
// (`DIPLOMACY_RECRUIT.excludeAzure`); a v39 edge still draws an Azure card from a
// Gold Dwelling. Every persisted addition is optional/additive
// (`BattlefieldTokenState.burnsAtActivation`, the reroll `chooseResult`,
// `DIPLOMACY_RECRUIT.excludeAzure`, the new house-rule key), so legacy snapshots
// read exactly as before. `npm run deploy:partykit` owed.
//
// v40 -> v41 (2026-08-19): the Field Override object EFFECT REDESIGN
// (docs/field-override-redesign-plan.md, 4 waves) — every anime + WoG override
// object changed behaviour, so a v40 edge answers the SAME visit actions with
// the OLD menus/rewards (Bí Cảnh's fixed Ⅴ guard vs the wager depth pick, the
// Gambling Den's flat 2-gold gamble vs stakes+pot, the old Mirror flat-2 price,
// the old cave/tower ladders, …) and rejects the NEW visit-step kinds
// (WAGER_GUARD_FIGHT, ADD/CLEAR_FIELD_GOLD_POT, MARK/CLEAR_FIELD_PLANTED,
// MARK_FIELD_CLAIMED, MARK_FIELD_ROUND_CLAIMED, GAIN_UNIT_XP,
// CLEANSE_NEGATIVE_MORALE, BANK_COMBAT_ATTACK_BOOST, REFORGE_EQUIPMENT,
// SET_URAHARA_DEBT, SPEND_MORALE_TOKEN, TRADE_IN_HAND_ARTIFACT,
// ADVANCE_FISHING_STREAK, GRANT_STACK_TOKEN, SACRIFICE_ARMY_UNIT). Every
// persisted addition is optional/additive (field: wagerCleared, denGoldPot,
// plantedBy/plantedRound, fieldClaimedBy, fieldRoundClaims, wogFishingStreaks,
// wogWellDry; player: uraharaDebt, pendingCombatAttackBoost), so legacy
// snapshots read as before. `npm run deploy:partykit` owed.
//
// v41 -> v42 (2026-08-19): two faction-specific PvP rules add server-side
// behaviour a v41 edge lacks — a fighter facing a Little Busters seat gets the
// three pay-1-gold combat counters (the NEW `LITTLE_BUSTERS_COUNTER` action a
// v41 edge would REJECT), and the opponent of a Monster Girl Quest seat draws 1
// card at battle start (a combat-start effect a v41 edge never runs). Also the
// Crest of Valor map side now ignores a Field's WHOLE negative-morale effect
// (Warrior's Tomb -2 -> 0, not -1). Persisted additions are optional/additive
// (combat: littleBustersCountersUsed, mgqOpponentBattleStartDrawDone), so legacy
// snapshots read as before. `npm run deploy:partykit` owed.
// v42 -> v43 (2026-08-19): Calamity Waves redesign adds server-side wave
// composition a v42 edge lacks — the battle-event rotation swapped (wave 2/5/8
// now +2 Initiative, wave 3/6/9 now +1 Defense), a classic wave may arrive as a
// themed faction WARBAND (Few/Pack town units), invaders carry Stack Tokens from
// wave 3 and Veteran ranks from wave 4, a mini-boss (a layered warden) leads
// from wave 4, and a repelled assault drills survivors +1 unit XP. No new
// serialized-state SHAPE (reuses combat-unit stackToken/unitExperience/unitRank/
// armyStacks + bossUnit, all already persisted), so legacy snapshots read as
// before — but a v42 edge would mint the OLD (weaker, no-boss) wave army, so the
// bump forces the room server current. `npm run deploy:partykit` owed.
// v43 -> v44 (2026-08-20): five USER-RULE engine-behaviour fixes a v43 edge
// computes differently (no new state SHAPE — all reads/derivations — so legacy
// snapshots read as before, but the bump forces a skewed room server current).
// (1) A sort-ability commander (Vanguard Marshal specialty OR Marshal's War Horn)
// on its own FRONT LINE gains +1 Attack during combat ROUND 1 only — was an
// all-rounds Vanguard-Marshal-only read that never covered the War Horn. (2) The
// Faerie Bolt (ON_ACTIVATION_DAMAGE_SPELL) is now turned aside by all-spell
// immunity (Azure/Black Dragons "immune-all-spells", or artifact-granted), still
// reduced by reduce-spell-damage — a v43 edge would still damage an immune unit.
// (3) View Earth measures its reach from EITHER of the player's Heroes (main OR
// secondary), so a Mine near the secondary Hero becomes capturable. (4) A
// Subterranean Gate's two linked halves are ONE field for the END of a move: a
// hero may not STOP on a half whose twin holds another hero (guarded halves are
// still fought; the mover's own free hop is unaffected). (5) The Cove
// Sorceresses' Weakness DEBUFF token may target the Arrow Tower (friendly BUFF
// tokens still skip it). `npm run deploy:partykit` owed.
// v44 -> v45 (2026-08-20): Polish-Balance-Pack / spell-book fixes. Two ADDITIVE
// combat fields (both optional, absent on legacy snapshots): a new combat action
// `USE_EAGLE_EYE_UNIT_COPY` (a v44 edge REJECTS it) and `combatStats.
// eagleEyeCopyUnitBolt` — the reprinted Eagle Eye Expert now also copies a
// spell-casting UNIT's bolt (Faerie Dragons), and `activeEffects.
// expiresAtActivationStartUnitId` expires a Prayer / Cards-of-Prophecy-A buff at
// the buffed unit's NEXT activation START (never twice buffed). Behaviour-only
// (a v44 edge computes them differently, so the bump forces a skewed room server
// current): Slayer's top rung is Power 3; Helm of the Alabaster Unicorn inscribes
// its cast Spell onto the Book's USED side; Interference's SP-cut is measured
// against the spell's effective damage tier (over-power no longer shields it);
// the balance Eagle Eye basic shows its find in a naming window; a Polish Random
// Artifacts difficulty-I acquisition is a guaranteed Minor with no roll; and the
// skeleton necro-reinforce offers a free Stack layer under polish-unit-stacks.
// `npm run deploy:partykit` owed.
// v45 -> v46 (2026-08-20): the Community Balance Change's ABILITY reprints
// (`community-card-balance`, default OFF ⇒ a table without it is byte-identical).
// The reprinted definitions live server-side and change what the reducer and the
// legal-action layer compute, so a v45 edge would offer and resolve the CLASSIC
// cards while the client shows the community faces — the classic skew symptom.
// Behaviour a stale worker computes differently: Estates 2/4 gold (the reprint
// now OVERRIDES the `estates-nerf` seam), Leadership's expert side granting no
// Morale token (new optional `GAIN_MORALE.expertAmount`), Scouting's flat
// Search (4)/(5) with the Expert side REMOVED from the game, Artillery's basic
// side hitting any enemy (and its instant reaction withheld) while its expert
// volley grants the Ballista aim, Ballistics' paid two-adjacent-target bombard
// becoming playable mid-combat plus the Catapult double, First Aid drawing a card
// on both sides (new optional `FIRST_AID_TENT_VOLLEY.drawCards`) with the volley
// back on a crown, Wisdom becoming a combat +Power instant, Luck lasting the TURN
// with a per-die reroll budget (new optional `ADVENTURE_DIE_REROLL.perDie` and
// `luck:<dice>:<n>` keys in `usedChoiceIds`), Mysticism's basic recall taking one
// alongside card (new optional `RECALL_SPELL.basicRecallPlayedCards` and
// `recallSpell.recallPlayedCardLimit`), and Tactics losing its start-of-combat
// window while its two sides re-derive from the active unit.
// `npm run deploy:partykit` owed.
//
// v47 (2026-08-20): the Community Balance Change SPELLS family (all 26 of the
// sheet's spells) lands behind the same default-OFF `community-card-balance`
// rule. New SERIALIZED shapes a stale worker cannot read: the
// `SET_ENEMY_ATTACK_DIE` active-effect modifier and its `dieSetsRemaining`
// budget on `ActiveEffectState` (Misfortune), the optional `setDieFace` on the
// `ATTACK_DIE_REROLL` modifier and on the `CREATE_ATTACK_DIE_REROLL` /
// `CREATE_ENEMY_DIE_SET` card effects (Fortune / Misfortune), the
// `community-dispel-pick` pendingChoice context with its
// `balanceSpellChoice.remaining` / `effectIds` / `paralysisUnitIds` payload
// (Dispel), plus the optional `PLACE_FIRE_WALL.burnsAtActivation`,
// `INFERNO.preDamageOnSpace`, `VISIONS_SCRY.placement`,
// `DISPEL_EFFECTS.discardCountByPower` and
// `ADD_COMBAT_STAT.requiresDefenderHigherTier` card-effect fields. Behaviour a
// stale worker computes differently on top of that: every reprinted spell's
// ladder / breakpoint (see the `community-card-balance` house-rule entry), the
// Haste / Slow printed Combat-movement exemption, and the map-spell seams
// (`openMapSpellBoost` / `applyMapSpellAtPower` / `finalizeMapSpellEffect` /
// `resolveMapSpellBoostChoice`) now reading the BALANCED definition instead of
// the raw printed library — which also fixes the Polish pack's map reprints.
// `npm run deploy:partykit` owed.
//
// v48 (2026-08-20): the Community Balance Change UNITS and WAR MACHINES tabs
// complete the pack. SERIALIZED shape a stale worker cannot read:
// `USE_UNIT_DIE_IGNORE.discardCardId` becomes OPTIONAL — the reprinted
// Halberdier Pack Parry (`halberdier-die-ignore-free`) has no discard cost, so
// its frame carries no card id and a v47 worker rejects it as illegal
// (`player.hand.includes(undefined)`). Behaviour a stale worker computes
// differently on top of that: `applyUnitSideRules` gains its `communityBalance`
// arm (Griffins Few+Pack 1 defense, Marksmen Pack 3 health, the Halberdier Pack
// ability swap) and the two war-machine shop-price seams
// (`warMachinesForSale`, the Wandering Merchant's discount offer) read the
// BALANCED definition, so Ammo Cart 3/5, Ballista 4/6 and First Aid Tent 5/7
// are charged instead of the printed prices. `npm run deploy:partykit` owed.
//
// v49 (2026-08-20): the Dungeon & Raid Boss VARIANT expansion (design authority
// docs/dungeon-raid-boss-variants-plan.md). New SERIALIZED shapes a stale
// worker cannot read: `CombatState.monsterSpells` (the BOSS_SPELL_ROTATION
// idempotence ledger — SUPERSEDED by v50, which deletes both the field and the
// mechanic) and `PlayerState.raidBossTrophyClaimed` (the one
// first-kill trophy latch). Server-computed behaviour on top: the round-start
// monster-spell pass (reducer.ts `resolveMonsterSpellRoundStart` +
// the `resumeCombatStartAfterCommanderPlacement` call site — both GONE in v50), the PvE
// encounter-scoped combat scripts (`pveEncounterScriptsForCombat`, the
// `side-heal` / `random-obstacle` script kinds), the seeded dungeon warden
// pools (`dungeonWardenIdFor` — a stale worker fields the OLD fixed warden),
// themed escorts + escort Stack Tokens at layersLeft>=4, the seeded dungeon
// treasure themes (`dungeonTreasureThemeOf` swaps non-artifact rungs), the
// first-kill trophy CHOOSE_ONE, and 6 new dungeon rooms behind the seeded
// door pick (a stale worker deals doors from the OLD 5-room pool).
// All content sits behind the existing PvE module flags (default OFF ⇒
// byte-identical). `npm run deploy:partykit` owed. NOTE: reconciled from a
// concurrent v48 collision (the Community Balance units/war-machines batch
// pushed first) — the two different engines take DISTINCT numbers, the
// 19749a33/v39 precedent, so a client/edge skew is always detected.
//
// v50 (2026-08-21): BOSS_SPELL_ROTATION is REMOVED (user rejection: "not all
// bosses need to cast a spell at the start of a round — immersion breaking").
// SERIALIZED shape change a stale worker computes differently: `CombatState.
// monsterSpells` and `UNIT_ABILITY_TRIGGERED.monsterSpellId` are DELETED (a v49
// worker would still write both, and — the real hazard — would still resolve a
// round-start cast that no longer exists in this engine, so the two sides would
// disagree about every boss fight's damage). The four `boss-spell-*` unit
// abilities are gone from `unitAbilities`, so a v49 worker minting a boss from
// its own catalog would stamp ability ids this engine cannot resolve. On top of
// that, the FIVE ex-caster bosses/wardens (lich_archon, wailing_banshee,
// archvile_ascendant, warden_stone_choir, doom_archvile_warden) carry different
// wired abilities now, and `warden_stone_choir` re-joins `WAVE_MINIBOSS_POOLS`,
// so a stale worker fields a different wave mini-boss pool.
// `npm run deploy:partykit` owed.
//
// v51 (2026-08-21): the PvE ENEMY FORCE hand replaces the removed
// BOSS_SPELL_ROTATION (user rule: "i want enemy FORCE that behave like single
// player, have cards random 5 ones and can use them like spell or artifact or
// statistic"). SERIALIZED shape a stale worker cannot produce or read:
// `CombatState.enemyForce` (the seeded synthetic hand + its played/fired
// ledgers) and the new `ENEMY_FORCE_CARD_PLAYED` game event. Server-computed
// behaviour on top: the seeded hand DRAW at combat start
// (`drawEnemyForceHand`, called from
// `resumeCombatStartAfterCommanderPlacement`) and the at-most-one-card-per-round
// PLAY at the boss unit's activation start (`resolveEnemyForceCardPlay` in
// reducer.ts's `setActiveUnit` tail) — a v50 worker resolves NEITHER, so the two
// halves would disagree about every raid-boss and Dungeon-floor fight's damage
// and about the boss hand's contents. The player-view masking of unplayed
// enemy-force ids is likewise new. All of it sits behind the existing
// raidBosses / dungeon module flags (default OFF ⇒ byte-identical) and wave
// assaults are deliberately excluded. `npm run deploy:partykit` owed.
//
// v52 (2026-08-22): the Conflux Pack Elementals' "+1 Power to the first <School>
// Magic spell you cast DURING THIS ACTIVATION" is gated per ACTIVATION again
// instead of sharing the Tower Magi's per-ROUND gate (reported: Lightning Bolt
// boosted on the Storm Elementals' activation, then Magic Arrow unboosted on the
// Ice Elementals'). SERIALIZED shape a stale worker neither writes nor clears:
// `CombatUnitState.activationSpellPowerUsed` (spent in performSpellCast, re-armed
// at `setActiveUnit`). Server-computed behaviour: a v51 worker resolves the SAME
// cast at one less Power, so the two halves disagree about that spell's damage.
// `npm run deploy:partykit` owed.
//
// v52 also covers (same undeployed batch, 2026-08-22): the Polish Balance Pack
// Cards of Prophecy option B moving from an AFTER-the-roll die-window reroll to a
// PRE-roll declaration (USER RULING "you play it before the roll and then roll 3
// dice and choose one of them"). NEW action type `USE_PROPHECY_PRE_ROLL` (a v51
// worker rejects the frame outright) and a new stack-item modifier
// `prophecyThreeRoll`; `AttackRerollSource.rollExtraCandidates` is GONE. All of it
// behind `polish-card-balance` (default OFF ⇒ byte-identical).
//
// v53 (2026-08-22/23, the nine-fix user batch d0bcfd55..3598bc1d — ONE number for
// the whole batch): (1) a FIXED yellow border (designer borderEdges or a starting
// tile's printed arc) seals movement/discovery again at a border-free bank/gate/
// override hex — movement LEGALITY moved, a stale edge lets the step through;
// (2) `MapFieldState.faction` is stamped PUBLIC the moment a Random Town's tile is
// revealed (reveal-time write an old worker never makes); (3) a map Power-tier cast
// offers "cast at Power N" RUNGS below the standing bonus — new
// `mapSpellBoost.reducedPowers` / `.powerAddedByPlayer` and the map-spell-effect
// reward's `effectivePowerOverride`; an old worker misreads the rung option
// indices as a full-power resolve; (4) the Cove Pub banks a whole-round,
// Citadel-gated reinforce entitlement (`ReinforcementDiscountBank.source:"pub"`,
// `requiresReinforceUnlock`, `expiresAfterRound`) instead of a round-start prompt;
// (5) Learning's instant offer fires from the ONE `gainExperience` chokepoint
// (every XP source, map objects included); (6) an income permanent's crack-open
// gain reads the BALANCED card; (7) a reaction-window Morale/town-cube/Valhalla/
// card-to-attack/Basic-X-Magic play clears the opponent's STANDING PASS
// (consecutive-passes closing rule). Display-only siblings in the same batch
// (Griffin card stats, enemy-info 2nd-hero movement) need no protocol.
// `npm run deploy:partykit` owed.
//
// v54 (2026-08-23, the Community Balance playtest-feedback batch 84ec17f1..
// 1bb7f36c — ONE number for the batch; everything behind `community-card-balance`,
// default OFF ⇒ byte-identical): (1) SPELLS — Misfortune casts target-LESS and
// opens a `misfortune-face` OPTION_CHOICE (new context + `dieFaces` on the
// balanceSpellChoice payload; a stale edge rejects the face answer); Prayer's buff
// carries the new `ActiveEffectDuration` `{ type: "next-round-activation" }`
// (persisted on ActiveEffectState — an old worker cannot expire it); the community
// Inferno parks its dice in an ATTACK_DIE_REROLL window via the new
// `PendingAbilityRollContext.kind: "spell-dice"` + `spellResume` (an old worker
// cannot resume the blast). (2) ABILITIES — community Luck is spent at the
// holder's TURN END (`expireCommunityLuckAtTurnEnd`, keyed off the reprint-only
// `perDie` modifier), so the two halves disagree about a between-turns reroll
// offer; Tactics expert surfaces in the pendingNeutralStep pre-activation pause
// (extra offers in an existing window); Mysticism's basic MAP recall lists one
// option per alongside candidate. (3) ARTIFACTS — the three turn-end incomes
// (Bag of Gold / Vial of Mercury / Cart of Lumber) are one-turn ongoings spent by
// `payTurnEndOngoingIncome` after paying once; the Resource/Treasure die windows
// gain the Cards-of-Prophecy from-hand SET options and a narrower auto-resolve
// early-out. `npm run deploy:partykit` owed.
//
// v55 (2026-08-24, two USER RULINGS on the Community Balance pack, one commit):
// (1) Celestial Necklace of Bliss side A — the discarded-X now scales ATTACK on
// the blow (`ADD_COMBAT_STAT.perCostCard`, the Sword of Judgement mechanism);
// `ADD_COMBAT_STAT.perCostCardSelfDefense` is REMOVED (a stale edge would lay the
// old own-unit Defense buff and under-count the attack). (2) Community basic
// Mysticism in COMBAT — with 2+ alongside candidates the recall opens the new
// `recall-alongside-pick` OPTION_CHOICE (`pendingChoice.recallAlongsidePick`),
// so the caster PICKS which card returns; a stale edge rejects the answer.
// Behind `community-card-balance` (default OFF ⇒ byte-identical).
// `npm run deploy:partykit` owed.
// v56 (2026-08-24, CO-OP MODE step 1 — the engine foundation, one commit):
// (1) `GameSetupOptions.gameMode` ("clash" | "coop", ABSENT = clash) is a new
// lobby option, sanitized in `setGameOptions` and carried by
// `buildAdventureFromLobby`; a v55 worker rejects the SET_GAME_OPTIONS frame
// that carries it, so a stale edge simply keeps the table on clash rather than
// silently half-applying it. (2) The built game freezes the new root field
// `GameState.gameMode: "coop"` and stamps `playerTeams` with the two alliance
// ids ("coop-humans" / "coop-ai") — a stale edge computing the same build would
// produce a FREE-FOR-ALL game from the same lobby, so the two halves would
// disagree about who may attack whom. (3) COMPUTER SEATS IN MULTIPLAYER:
// `SET_COMPUTER_OPPONENTS` / `SET_COMPUTER_SEAT_FACTION` are no longer
// single-player-only, so an ordinary lobby may now persist
// `state.controllers` entries (computer seats only, always the TRAILING seats);
// a v55 worker refuses both actions outright and would treat such a seat as an
// ordinary empty human seat. `ASSIGN_SEAT` now refuses ANY computer seat in
// every session mode (the old check was single-player-only). (4) ALLY FLAG
// GATE: a Mine / Settlement / Town / Random Town / Garrison / captured Dragon
// Utopia flagged by a LIVE ALLY is classified as an OWN field
// (`classifyHeroStep`), is skipped by every `beginFieldVisit` flag branch, is
// dropped from the View Earth capture list and is refused inside `flagField`
// itself — a stale edge would still steal it, so the two halves disagree about
// the resulting map ownership. Default (no `gameMode`, no computer seat in a
// multiplayer lobby) is byte-identical to v55.
// `npm run deploy:partykit` owed.
// v57 (2026-08-24, CO-OP MODE step 2 — the AI seats PLAY on a multiplayer
// table). No new serialized field, but four LEGALITY changes a stale worker
// would answer differently, which is why the bump exists:
// (1) ADVANCE_COMPUTER (the lost-tick watchdog) is gated on "this game HAS a
// computer seat" instead of "this is a single-player room" — a v56 worker
// refuses the frame a v57 client is offered on a multiplayer co-op table, and
// the human's only manual recovery from a lost pump tick would fail.
// (2) TIME CONTROLS never touch a computer seat: the shared `liveSeats` read in
// afk.ts filters computer-controlled seats out, so an AI seat is never an AFK
// vote / 30-minute auto-kick / FORCE_TURN_TIMEOUT target, is never counted
// among the voters whose unanimity a kick vote needs, never carries a running
// 10-minute turn clock, and its own (pump-driven) actions stamp no idle clock.
// A v56 worker still counts it — so a legitimate vote against an ABSENT HUMAN
// can never resolve there, and it would happily time out / auto-kick the AI.
// (3) CO-OP disables BOTH manual-neutral-control modes: with
// `GameState.gameMode === "coop"`, `pvpNeutralControllerId` and
// `manualGuardControllerId` always return null (the Neutral AI plays every
// guard). A v56 worker would open the pre-battle formation SORT window and hand
// the guards to a seat the v57 client never offers them to.
// (4) The PARALLEL-TURNS × computer-seats combination is REFUSED at the lobby
// in BOTH directions (`SET_GAME_OPTIONS.parallelTurns` while computer seats
// exist; `SET_COMPUTER_OPPONENTS` > 0 while parallel turns are on) — a v56
// worker accepts the combination and builds an untested stall surface.
// A table with NO computer seat and no `gameMode` is byte-identical to v56.
// `npm run deploy:partykit` owed.
// v58 (2026-08-24, CO-OP MODE step 3 — VICTORY & OBJECTIVES). The serialized
// OPTIONS surface grew and the win check changed semantics, so a stale worker
// and a new client disagree about when a game is OVER:
// (1) TWO NEW `CustomWinCondition` kinds ride `GameSetupOptions.customWinConditions`
// / `CustomMapPreset.customWinConditions` — `{ kind: "defeat-computers" }`
// (parameterless) and `{ kind: "slay-raid-boss", count: 1-3 }`. A v57 worker's
// sanitiser DROPS both as unknown kinds, so a host who added one starts a game
// whose objective silently does not exist on the authority — the exact
// "condition never fires" class the bump exists to surface.
// (2) `checkCustomWinConditions` SKIPS computer-controlled seats in a
// `gameMode === "coop"` game (the invaders win only by eliminating every
// human). A v57 worker would end a co-op table the moment an AI seat crossed a
// gold / hero-level line. CLASH is unchanged in both.
// (3) A `slay-raid-boss` condition is DROPPED AT BUILD with a public
// MAP_SECRET_FEATURE_FALLBACK note when neither `wog.raidBosses` nor
// `anime.raidBosses` is on — a v57 worker builds a different effective preset
// from the same lobby options.
// (4) The GAME_WON reason of a co-op winner who still has a living ally gains
// ", with their alliance" (presentation only, but it rides the persisted feed).
// A game with no `customWinConditions` and no `gameMode` is byte-identical to v57.
// `npm run deploy:partykit` owed.
// v59 (2026-08-24, CO-OP MODE step 5 — MAP SUPPORT). Two new SERIALIZED map
// fields and a new start-check legality, so a stale worker builds a different
// game from the same lobby bytes:
// (1) `CustomMapPreset.supportedModes` ({ clash?: boolean; coop?: boolean },
// absent = BOTH) rides `GameSetupOptions.customMapPreset`. A v58 worker's
// sanitiser DROPS it, so a co-op-only map neither seeds `gameMode: "coop"` at
// pick nor refuses a clash start there — the exact silent-divergence class the
// bump exists to surface.
// (2) `CustomMapTilePlan.coopSeat` ({ role: "human" | "computer" }, absent =
// either) rides every designed tile plan. A v58 worker drops it and seats a
// co-op table in plain seat order, so a human can land on a position the map
// reserves for the invaders.
// (3) `startAdventureFromLobby` REFUSES a start whose effective table mode the
// map does not support, and a co-op start whose human/computer seat counts the
// authored roles cannot seat. A v58 worker starts both.
// A map with neither field (every existing map and every built-in scenario) is
// byte-identical to v58. `npm run deploy:partykit` owed.
// v60 (2026-08-25, Calamity Waves audit): authoritative wave resolution now
// unwinds a pillaged Mine / Settlement's mirrored production income instead of
// clearing only its map flag, and CombatUnitState carries optional
// `waveEventBonuses` so a Stack-Token loss or Pack→Few recompute cannot erase
// the wave's combat-long Attack / Defense / Initiative event. A v59 worker
// would pay ghost income after an overrun and field different mid-combat stats,
// so the client/server rules fingerprint must change.
// v61 (2026-08-25, instant/reaction audit): reaction windows gained the
// `USE_SCHOOL_PERMANENT_EXPERT` action and a per-window expert-Power bank —
// SCHOOL-TAGGED ({school, power}) and single-use, credited to the attack pool
// or a powerCost only when a MATCHING-school Spell is actually played (the
// audit fix for a Fire commit scaling an Earth instant); attack stacks persist
// Power-scaled Fortune rerolls; and Misfortune, Magic Mirror, and Resurrection
// now use printed Power costs instead of fixed discard counts. A v60 worker
// would reject the new action and resolve these instants at different tiers,
// so client/server compatibility must fail visibly.
// v62 (2026-08-25, AI navigation fixes): `ComputerPolicyMemoryState` gains the
// optional `recentStateHashes` list — the computer runner's cross-tick cycle
// guard (the Subterranean-Gate A↔B shuffle fix). AI-private and self-healing
// (a stale worker drops the field and only loses the guard), but the runner's
// behaviour on the same snapshot differs, so the fingerprint moves with it.
// v63 (2026-08-25): Fuyuki Command Seals and Hidden Leaf Mission Rank add
// authoritative action/state/reward semantics. A v62 worker rejects the new
// Command Seal action and never advances the persistent mission ladder.
// v64 (2026-08-25): Hidden Leaf's combat formation is now shinobi-only and may
// contain at most two Gold unit cards. Placement offers and reducer validation
// both enforce it; a v63 worker would still accept a forged third-Gold or
// Neutral placement, so client/server compatibility must fail visibly.
// v65 (2026-08-25): the seven anime/xianxia town penalties add persistent
// `PlayerState.otherworldHandLimitLoss`, a per-combat Azur Lane damage latch,
// and authoritative Resource-round deductions. A v64 worker would accept the
// same faction pick but silently omit every penalty, so compatibility must fail.
// v66 (2026-08-25, USER RULING): the Polish Balance Pack Misfortune's top rung
// ("Roll 4 dice, reroll every '+1'. Resolve all.") now rerolls each "+1"
// REPEATEDLY until only "-1" and "0" faces remain, instead of once per die. No
// new action type and no new serialized field, but the authoritative dice
// resolution changes — a v65 worker leaves surviving "+1" faces on the cursed
// attack and consumes a different number of seeded rolls (`dice.rollCount`), so
// the same snapshot resolves to different damage on the two halves.
// `npm run deploy:partykit` owed.
// v67 (2026-08-25, USER RULING): every discard-recovery / spell-refresh card now
// asks ONE shared "does this have work?" read (`discardRecoveryHasWork`) that
// knows the Balance Pack Adelaide IV filter `cast-enabler-or-specialty` and its
// STANDALONE follow-up refresh, so the printed "Refresh 1 Spell" makes the card
// playable with nothing to take — and the once-per-round limit gates the refresh
// only, never the card. No new action type and no new serialized field, but PLAY
// legality moves in both directions (a card offered where a v66 worker refuses
// it, and withheld where a v66 worker would consume it for an empty prompt), so
// client/server compatibility must fail visibly instead of rejecting a legal
// play. `npm run deploy:partykit` owed.
// v68 (2026-08-25, USER RULING "Diplomacy expert … should [work] for fields VI
// and VII also, for both polish rule and normal games"): the Expert Diplomacy
// guard-skip level bar is now `diplomacySkipLevelQualifies` — hero level AT
// LEAST the Field Difficulty, instead of exactly equal. Quick Combat is barred
// on Ⅵ/Ⅶ, so the old exact bar left a level-7 hero (the normal state by the time
// the centre band is reachable) with no way past a Ⅵ guard while a WEAKER
// level-6 hero could skip it. No new action type and no new serialized field,
// but the AUTHORITATIVE arrival resolution moves: a v67 worker opens the guard
// combat where a v68 worker opens the `diplomacy-skip` OPTION_CHOICE, so the
// pop-up the new client shows does not exist on the stale edge (and the
// CHOOSE_OPTION answering it is rejected) — the silent-divergence class the
// banner exists to surface. `npm run deploy:partykit` owed.
// v69 (2026-08-26, USER BUG "polish spell book: Rolling spells — still there is
// a bug that 1st proposition is the same spell you roll — not the first from
// discard"): a card handed BACK to a shared deck by an effect that then Searches
// that same deck now lands UNDER the pile's face-up top
// (`returnCardUnderSharedDeckDiscardTop`) instead of on top of it — Polish
// Rolling Spells and the Tournament Morale "Search again" return. No new action
// type and no new serialized FIELD, but the AUTHORITATIVE resolution moves: the
// server builds the Search's take-the-top-discard proposition (and the modal's
// card face) from the pile it just wrote, so a v68 worker still offers the
// rolled Spell straight back while a v68 client applying the same action locally
// writes a different pile order. The fix only reaches a hosted table once the
// edge carries it. `npm run deploy:partykit` owed.
// v70 (2026-08-26, USER BUG "terrible bug: now still cannot add SP to other
// effects" — a screenshot of an instant window holding a "+2 Power" chip and the
// warning "Power only counts with a Spell played into this attack"): the Power a
// player has already poured into an open window's pending attack
// (`modifiers.attackPowerByPlayer` — the "+1 Power" Spell discards and every
// played Power statistic) now counts toward a printed `powerCost` TIER as well as
// toward the `*ByPower` ladders it always fed. ONE shared read
// (`attackWindowPooledPower`) folded into BOTH `canAffordCardCost` (the offer)
// and `payOptionCardCost` (the payment), so the rung the engine accepts is the
// rung the window offered. No new action type and no new serialized FIELD, but
// the AUTHORITATIVE cost resolution moves in both directions: a v69 worker prices
// the same rung WITHOUT the pool, so it never offers the lethal save / Magic
// Mirror / Resurrection / Sorrow tier the new client shows (the Alamar and
// Jeddite lethal-save SPECIALTIES are the reachable case — non-Spell cards whose
// only Power is that pool) and rejects the play with "needs at least N Power;
// this pays only 0". Two same-batch seam widenings ride the same number: the
// "Power needs a Spell" gate (the offer filter, the batch validator and the
// reaction tray) now accepts any Power SINK via the shared
// `playConsumesWindowPower` — a `*ByPower` ladder or a `powerCost` tier, card
// KIND irrelevant, with the `meteor-shower` FUEL-only family explicitly
// excluded — and the resolver's ADD_COMBAT_STAT Power scaling plus its
// re-scaling record dropped their `card.kind === "spell"` gate. Every shipped
// pool ladder is still on a Spell (pinned as an invariant), so that last part is
// a seam alignment with no shipped consumer. `npm run deploy:partykit` owed.
// v71 (2026-08-26): the Polish Balance Pack Cards of Prophecy option B works on an
// ABILITY roll again (reported: "Card of Prophecy, lower part effect — still not
// working"). The 2026-08-22 pre-roll rewrite (v52) was right for the ATTACK die,
// which has a real pre-roll window, but it also deleted
// `AttackRerollSource.rollExtraCandidates` and filtered the card out of the
// ability-roll window (Death Stare & co.) with nothing offered in its place — so
// with the rule ON the card was unspendable there AND that window stopped opening
// at all (no sources ⇒ no window), i.e. strictly worse than the rule OFF. The
// field is BACK, set only on Cards of Prophecy in the ability window: its one use
// throws the chosen die twice more and unlocks the free pick, so the holder
// resolves 1 of 3 faces. SERIALIZED shape a v70 worker neither writes nor reads
// (`AttackRerollSource.rollExtraCandidates`, inside `pendingChoice.rerollSources`),
// and server-computed behaviour it answers DIFFERENTLY: a v70 edge opens no
// ability-roll window for the holder at all, and would resolve the same press as a
// single re-throw with no free pick — a different die stands. Behind
// `polish-card-balance` (default OFF ⇒ byte-identical) and scoped to the ability
// window, so the ATTACK pre-roll declaration and the map `prophecyThreePick` offer
// are untouched. `npm run deploy:partykit` owed.
// v72 (2026-08-26): the Helm of the Alabaster Unicorn's SECOND part reaches every
// castable Spell on a Spell-deck discard top (reported AGAIN: "Helm of unicorn —
// second part still not working, even if in the top of the discard is a spell that
// can be casted, for both polish balance and normal game"). Both printed faces mark
// that half a ⚡ INSTANT, but the only surface that ever enumerated it was the
// on-turn cast path — which skips every Spell carrying a printed trigger, i.e. a
// THIRD of the Spell deck (Bless, Curse, Precision, Weakness, Shield, Bloodlust,
// Stone Skin, Slayer, Frenzy: playable ONLY inside the window their trigger names),
// and read `decks.spells` alone, leaving the BINH expert Spell pile's face-up top
// permanently unreachable. NEW SERIALIZED SHAPE a v71 worker neither writes nor
// reads: `PLAY_REACTION.fromSpellDeck` (a v71 edge REJECTS the frame outright), and
// server-computed offers it answers differently: no Spell-deck cast is offered in
// any reaction window, and none is offered for the expert pile's top on-turn
// either. Ciele's Magic Arrow I/IV ride the same shared arm/source read
// (`castFromSpellDiscardArm` / `castFromSpellDiscardSourceSpellIds`, now the ONE
// read behind the on-turn offer, the window offer and both reducer consume seams).
// A "Cast a Spell" enabler on a Spell-deck top is no longer offered at all (the
// reducer always refused to cast it — a dead button). `npm run deploy:partykit` owed.
// v73: Visions is drawn "from any Neutral Unit deckS" and its Power ladder is
// read like every other map Spell. USER REPORT: "Visions (with +2 SP should take
// 6 cards from any decks). For now it takes only 4 cards and only from 1 deck
// (you should be able to pick multiple decks)." THREE authoritative changes a v72
// worker computes differently: (a) the deck pick re-opens until every owed card
// is lifted, so ONE cast may split its draw across several Neutral decks and each
// card returns to ITS OWN deck (NEW SERIALIZED SHAPE: `visionsDeck.drawn` /
// `.drawnTiers`, `visionsScry.remainingTiers` / `.toReturnTiers`, with the old
// single `visionsScry.tier` now legacy-only — a v72 edge locks the whole draw to
// one deck and reads no per-card tier); (b) a discarded power source pays its
// PRINTED Power (a Spell +1, a statistic/artifact its printed amount, a
// School-of-Magic ability its expert +3 for a crown) instead of a flat +1, carried
// by the new index-aligned `visionsBoost.spellCardValues` / `.spellCardModes`; and
// (c) the cast STARTS at the player's standing Power (the same
// standingSpellPower + getSchoolPowerBonus + map Sorcery/Scales bank recipe every
// map Power-tier cast uses, consuming the bank) instead of Power 0. The rung
// lookup also clamps DOWN to the highest printed breakpoint reached, where the old
// exact-key read fell back to the LOWEST rung. `npm run deploy:partykit` owed.
// v74: USER RULING "POLISH BALANCE: Blind with 0 SP should not work for bank
// units — only Blind with +2 SP work for any unit." Blind's printed ladder is
// `0: bronze / 1: bronze or silver / 2: ANY` (Polish reprint; the base scan's
// top rung lists bronze+silver+gold), and it is that TOP "+2 SP" rung which
// reaches a TIERLESS Creature-Bank unit — the named-tier rungs name grades a
// bank unit does not have. `bankAwareTierGateRank` therefore ranks a bank unit
// at GOLD for PLACE_PARALYSIS instead of at its underlying grade, so only the
// top rung lands in EITHER pack. A v73 worker still resolves the bronze/silver
// rungs onto a bank unit, so the same cast would paralyse on the stale edge and
// fizzle on a fresh client — an authoritative resolution difference with no
// state-shape change, hence the explicit bump. The other four allowlisted
// effects (Anti-Magic, Frenzy, Sorrow, Disrupting Ray) keep the 2026-08-18
// underlying-grade read. `npm run deploy:partykit` owed.
// v75: USER RULE "When I enter the tile that has 2 gates (and both can be
// positioned) I should ALSO be able to place the exit of MY Gate (choose 1 of the
// red marked tiles) — then I choose the other gate." A cavern designer-linked to
// two Surface tiles that BOTH already carry their gate half owes TWO COMPLETING
// "path up" exits; the recompute that carved the first pick auto-carved the
// sibling at the NEAREST hex, so only one of the two crossings was ever the
// player's — and the one offered was ordered by partner tile centre, not by the
// gate the hero had walked through. Two seams:
// `recomputeSubterraneanGates({ deferUnchosenDesignedOnTileId })` holds an
// unchosen designed half on the tile whose reveal chain is still draining, and
// `planGateChoiceForReveal({ firstPartnerTileId })` drains the arriving gate
// first. A v74 worker opens only ONE of the two picks and carves the other at the
// nearest hex — an authoritative placement difference (a client would offer a
// CHOOSE_OPTION the stale edge never created) with no state-shape change, hence
// the explicit bump. `npm run deploy:partykit` owed.
// v76: USER PROPOSAL "add a parameter if the garrison (or other standalone object)
// is underground or not — Garrison/keymaster/barrier/monolith: choose 1. normal
// field 2. water field 3. underground field." A STANDALONE designer object hex used
// to INFER its layer from the tiles it touches, so a hex touching a Surface AND an
// Underground tile was ambiguous and refused outright ("implicit layer bridge") —
// the reported designer block. New optional `CustomMapObject.layer`
// ("surface" | "sea" | "subterranean", read only through `declaredStandaloneLayer`
// / `declaredStandaloneMapLayer`): a declared board wins over the inference at the
// carve, so the hex belongs to that board alone and `validateCustomMapObjects`
// accepts a both-touching hex; "sea" additionally stamps `MapFieldState.terrain`
// "water" (a Surface water field — the ordinary coastline halt). ABSENT keeps the
// old inference AND the old rejection, so every legacy map is byte-identical. Both
// a serialized preset field and an authoritative movement-legality difference (a
// v75 worker infers a different `standaloneLayer` for a declared hex and would
// refuse the map's start), hence the bump. `npm run deploy:partykit` owed.
// v77: configurable setup alliances. Optional
// `GameSetupOptions.teamAssignments` is a complete Team 1..N record keyed by
// lobby seat / starting-position id. At build it overrides only the team stamp,
// becoming ordinary `GameState.playerTeams`; absent keeps the v76 co-op
// humans-vs-computers and solo map-diplomacy defaults byte-identical. The lobby
// SET_GAME_OPTIONS seam validates every live seat and clears the record on a
// resize / Clash switch. A v76 worker would ignore the serialized choice and
// enforce different PvP/victory legality, so this is protocol-significant.
// `npm run deploy:partykit` owed.
// v78: map-authored Break gates (`CustomMapPreset.breaks`), center-hex Break
// flags, and opt-in flaggable Dragon Utopias. The latter stamps the field owner
// and a per-player Astrologers-round Azure recruit-use marker; older workers
// would ignore both movement legality and the serialized reward entitlement.
// Absent fields preserve v77 behaviour. `npm run deploy:partykit` owed.
// v79: designed maps may serialize `CustomMapPreset.fixedTeams`, an authoritative
// S1..SN alliance layout that overrides editable lobby teams at game build.
// Older workers would ignore it and permit attacks between intended allies.
// `npm run deploy:partykit` owed.
// v80: Polish Alliance mode adds team-total VP scoring to serialized scoring
// events. A v79 worker would select a different winner for the same snapshot.
// `npm run deploy:partykit` owed.
// v81: Polish Alliance mode adds the OFFER_ALLY_TRANSFER action and private
// pending-visit acceptance step. Older workers cannot validate or apply it.
// `npm run deploy:partykit` owed.
// v82: two granular Tournament switches (Morale Search-again and removed
// Artifact VP credit) plus the map-authored Break team scope are frozen into
// setup/adventure state. Older workers would apply different Search, scoring,
// and allied movement legality. `npm run deploy:partykit` owed.
// v83: Speculum/View Air's queued discovery step may measure from either Hero,
// and spell-placed battlefield tokens retain their source Spell id. The latter
// makes Fire Wall burns obey Spell immunity/reduction and keeps a Polish Book
// Spell locked "in play" while its token remains; specialty/unit walls omit the
// source and remain effect damage. A v82 worker would ignore both optional
// fields and resolve different legal targets/damage. `npm run deploy:partykit`
// owed.
// v84: Commander Forge Grade III unlocks separately in round 9 with seeded
// random/base-cost and specific/+2-cost actions; Vanguard Marshal latches its
// round-1 front-line Attack; Saber uses first-attack-per-round Defense;
// battlefield hazards and Fire Shield use source-sensitive full immunity and
// numeric Spell reduction; Little Busters' paid counters are retired in favor
// of one automatic enemy draw; Diplomacy is no longer permanently Empowered.
// New optional commander/unit/token fields and changed legal actions mean a v83
// worker would resolve a materially different game. `npm run deploy:partykit`
// owed.
// v85: Little Busters keeps all three pay-1-gold PvP counters; only the draw
// counter is reduced from 2 cards to 1, and the v84 automatic combat-start draw
// is removed. Computer routing treats an owned town as an ordinary safe corridor
// toward its objective, and Defense-card policy conserves the card when its
// expected +Defense still cannot save the attacked unit. A v84 worker would
// offer/resolve different combat actions, so the protocol must force the room
// server current. `npm run deploy:partykit` owed.
// v86: unchanged printed sea fields derive their land/water classification from
// the authoritative tile slot when a recovered room is missing that field's
// materialized terrain cache. A v85 worker can invent a coastline between two
// visibly blue sea hexes and force the hero to end the turn after sea -> sea,
// while v86 permits the move, so movement legality is protocol-significant.
// `npm run deploy:partykit` owed.
// v87: eliminated adventure players retain their Give-Up order so the trusted
// match report can select the sole MMR loser in 3+ player games. A v86 worker
// would omit that order and score the wrong ladder result.
// `npm run deploy:partykit` owed.
// v88: Polish Creature Bank card content is now a serialized, independent
// house-rule toggle from the I-IV reveal/size procedure, and the BINH elemental
// rule keeps the normal Attack-die roll while suppressing positive instant
// Attack buffs. A v87 worker would merge the bank switches and skip the die.
// `npm run deploy:partykit` owed.
// v89: Imperium Rhino movement opens a serialized `combat-transport` choice and
// the opt-in `side-buildings-materials-only` rule changes authoritative build
// legality/resource spending. A v88 room server cannot resolve the transport
// choice and would charge the printed cost, so client/server parity requires a
// protocol bump and PartyKit redeploy.
// v90: Creature Banks are always land regardless of the hex they replace; Ability
// Empower tokens stack instead of forcing a max-one surplus spend; Sacrifice
// serializes a second exact-HP OPTION_CHOICE; and Imperium faction selection is
// gated by Anime Mod. A v89 worker would disagree on movement, legal choices,
// token totals and faction setup, so PartyKit must be redeployed.
// v91: Polish Balance Eagle Eye serializes its original target while copying a
// damaging enemy Spell, Polish bank units use the top-SP gates for Clone,
// Sacrifice, Resurrection, Counter Strike and Magic Mirror, and Polish Black
// Tower size now deterministically selects one unstacked dragon. Rust Dragon
// Acid Breath is attack-local, and computer policy now makes materially
// different development, navigation, formation and targeting decisions. A v90
// worker can offer different targets/choices and resolve different combat or
// map actions.
// `npm run deploy:partykit` owed.
// v92: Polish Artillery adds its serialized Basic two-shot Ballista choice,
// Banks Auto Combat adds a serialized post-Stack-roll decision, zero-damage
// attacks clear Paralysis, and Sanctuary/friendly economy sites are safe map
// corridors for both human and computer routing. A v91 worker would offer and
// resolve different combat/map actions, so PartyKit must be redeployed.
// `npm run deploy:partykit` owed.
// v93: map-authored STARTING-TILE SEAT ROLES (`CustomMapTilePlan.coopSeat`) now
// decide seating in EVERY session/table mode, not co-op only — a v92 worker
// would build the same designed map with different home positions (and would
// not refuse an unseatable table), so authoritative placement diverges.
// `npm run deploy:partykit` owed.
// v94: the 2026-09-04 playtest batch (serialized `combat.bankAutoCombatAsked`,
// teleport tokens on any Ⅰ–Ⅵ field, computer seats never neutral controllers,
// controlled-guard Wait offers) plus the same-day session batch: the Astrologers
// OFFENSE proclamation joins the deck and re-reads every Defense face as Attack;
// Bowstring option B is a per-die `PLAY_REACTION.dieIndex` with
// `ATTACK_DIE_SETTLED.rolls`; `POPULATION_ACTION.freelancerPayment` + the
// `freelancers-guild-bounty` house rule and the printed 1:1 substitution;
// Kivotos Kyrie Eleison / Hero Mode / Outlaw Shot / Winged Pursuit resolve
// differently. A v93 worker offers and resolves different actions.
// `npm run deploy:partykit` owed.
//
// v95 (2026-09-04c): the "arena-duel" custom win condition (round-start 1v1 duels
// behind the Event barrier: `AdventureState.arenaDuels`, `CombatContext.arenaDuel`,
// the `arena-duel` reward-queue entry, `ARENA_DUEL_RESOLVED`); designer
// `CustomMapTilePlan.revealAtSetup` + `CustomMapSettlementFieldPlan.ownerStart`
// (`MapFieldState.settlementFoundingOwedBy`, `AdventureState.startingTileSeats`);
// the lobby `GameSetupOptions.startingTileAssignments` seat → starting-tile record.
// Authoritative round start and seat placement changed. `npm run deploy:partykit` owed.
//
// v95 (2026-09-04, parallel-turns audit): a bystander quiet move never lands on
// an armed designer hex event, a quiet walk stops on a reward-queuing step, the
// round-start barrier names the wave fighter / tile / Necromancy owner as its
// resolver, the Hierophant First Aid window blocks bystanders, the Commander
// Forge and the PvP-Neutral-Control controller read the open PARALLEL turn, a
// bystander fight keeps the nominal activePlayerId. A v94 worker offers and
// resolves different actions. `npm run deploy:partykit` owed.
// v97: Wandering Merchant is a persistent during-turn action and records
// completed purchases per player instead of queuing a blocking round-start visit
// (new AstrologersState.wanderingMerchantBoughtBy). Same batch: the Whirlpool
// proclamation joins the deck (the toll + die are skipped, the traveller picks),
// Rulebook redraws on Easy and no longer eases authored / VII-objective guards,
// Sanctuary blocks the enemy-hero hex in classifyHeroStep.
// v98: BINH Wind now waives the sea->land halt as well as land->sea.
// v99: optional settlement recruitment factions and independently purchasable
// copies change authoritative recruitment rules and legal upgrade targets
// (MapFieldState.settlementRecruitFactionId, PlayerState.nextArmyUnitOrdinal;
// the army-unit id cursor never reuses a dead ordinal on ANY table).
// v100: independent parallel neutral combat contexts and per-seat battle routing
// (state.parallelCombats / parallelCombatOwnerId, GameEvent.combatContextId).
// v101 (2026-09-05 audit of that batch): the School-of-Magic / Basic X Magic
// expert (+3) is committed INSIDE the cast's own reaction window
// (USE_SCHOOL_PERMANENT_EXPERT / USE_SCHOOL_FETCH_EXPERT) - the up-front
// CAST_SPELL.useSchoolExpert / useSchoolFetchExpert variants are gone and
// REJECTED; new stack-item modifier schoolPermanentExpertUsedBy (once per cast);
// Spell Book Power discard is ONE PER CAST; Magic University is a Spell-Search
// replacement (PendingChoice.magicUniversitySchools, MAGIC_UNIVERSITY_ACTION is
// never offered); Polish Ballista firing windows (combat.warMachineRound
// re-entry) and the Polish bank auto-win "EVERY unit safe" predicate. A v96 edge
// offers and resolves different actions. `npm run deploy:partykit` owed.
// v102 (2026-09-05, parallel mode + human-controlled neutrals): a human on a
// parallel table can switch between their own battle and the neutral armies
// assigned to them — new action SELECT_PARALLEL_CONTEXT, GameAction.parallelContextId
// (commands tagged for a finished battle are REJECTED), new serialized
// GameSetupOptions.parallelHumanNeutralControl and GameState.parallelContextSelections /
// parallelContextOptions, PvP-Neutral-Control assignment walks to the next HUMAN
// clockwise. A v101 edge neither offers nor accepts the selection action.
// `npm run deploy:partykit` owed with this bump.
// v103 (2026-09-05, audited codex batch): new BINH house rule
// `settlement-neutral-recruitment` (a controlled Settlement sells its PRINTED
// faction's single-sided Neutral cards through POPULATION_ACTION recruits, which
// now add a `neutral`-side army card and pull the copy out of the Neutral deck;
// it takes precedence over `settlement-foreign-recruitment`), Elemental Conflux
// reveals one card PER DWELLING (multiplicity) and keeps unaffordable picks
// visible, Mutsuki's Trick Mine emits a real DAMAGE_ASSIGNED, and the
// BATTLEFIELD_TOKEN_PLACED / _TRIGGERED events carry `sourceAbilityId`. A v102
// edge offers a different recruit set and resolves the Conflux differently.
// `npm run deploy:partykit` owed with this bump.
// v104: a Blocked-Field carve (Creature Bank / Calamity Gate / Dungeon Gate) and
// a Field Override KEEP the slot's printed outer arc — only the ring's INSIDE
// half opens (USER RULE 2026-09-05). Movement + discovery legality therefore
// changed at every carved hex, and the BINH house rule `bank-interior-entry-only`
// is RETIRED (see RETIRED_HOUSE_RULE_IDS). A v103 edge lets a hero cross a carve's
// sealed tile edge. `npm run deploy:partykit` owed with this bump.
// v105 (2026-09-05, parallel-turns WATCH fix): every viewer may follow every
// running parallel battle read-only. `ParallelContextOption.role` gains
// "watch"; `SELECT_PARALLEL_CONTEXT` now accepts ANY live battle (a watcher's
// `getLegalActions` returns nothing but the switch back, so the read-only
// guarantee is the offer set, not the refusal); selecting your OWN window
// CLEARS `parallelContextSelections[you]` instead of pinning it; and a viewer
// with no seat (unseated spectator / eliminated) gets a stable one-battle
// projection from `parallelStateForPlayer` instead of the raw global pointer.
// A v103 edge REJECTS the watch selection and keeps dragging a spectator from
// battle to battle. `npm run deploy:partykit` owed with this bump.
// v106 (2026-09-05): `dwarven-treasury-reward-nerf` makes the BINH 7 + 2X
// Dwarven Treasury reward an independent serialized option. Off/Legacy keeps
// the printed 7 + 3X reward. A v103 worker can award a different gold total.
// `npm run deploy:partykit` owed with this bump.
// v107 (2026-09-06): Azur Lane / Little Busters hero redesign + Kyousuke AP commander.
// New serialized fields: `CombatUnitState.commanderActionPoints` (the Ibuki AP
// counter generalised to every AP commander; legacy `ibukiActionPoints` is read as
// a fallback), the Little Busters DAMAGE_SHIELD / Bond / Blade Dance / Home Run and
// the Azur Lane Concentrated Fire / Big Seven / Royal Maid stack + unit flags, two
// summon-only cat units, two new Azur Lane shipgirls (9-unit roster), new unit
// ability ids and the Kyousuke cast `commander-cast-kyousuke-assemble`. A v106
// edge rejects every new offer and resolves the redesigned specialties as the old
// cards. `npm run deploy:partykit` owed with this bump.
// v109 (2026-09-06): Random Towns now mint a defending Neutral Arrow Tower, and
// two serialized BINH house rules add the five-body veteran/coordinated-AI
// garrison and replace the level-VII fill-to-seven reward with one exact level.
// A v108 worker would build a different siege, controller and XP result.
// `npm run deploy:partykit` owed with this bump.
// PvP mutual-consent activation retakes, dragon objective/guard precedence,
// larger-table Conquest thresholds and veteran ability corrections.
// Elimination/forfeit removes rivals from Conquest instead of awarding PvP credit.
export const ENGINE_PROTOCOL_VERSION = 111;


/** FNV-1a (32-bit) — small, dependency-free, and identical under every V8
 * runtime the two halves run on (Vercel Node and Cloudflare Workers). */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A short, stable fingerprint of the rules engine's content + protocol. It
 * changes whenever the catalog of heroes / factions / units changes, or the
 * protocol version is bumped — exactly the cases where a stale room server
 * would reject actions the new UI offers. Keys are sorted so the value is
 * deterministic regardless of declaration order.
 */
export const ENGINE_SIGNATURE: string = (() => {
  const heroes = Object.keys(coreHeroDefinitions).sort().join(",");
  const factions = Object.keys(coreFactionDefinitions).sort().join(",");
  const units = Object.keys(coreUnitDefinitions).sort().join(",");
  return `v${ENGINE_PROTOCOL_VERSION}-${fnv1a(`${heroes}|${factions}|${units}`)}`;
})();
