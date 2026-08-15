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
export const ENGINE_PROTOCOL_VERSION = 33;


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
