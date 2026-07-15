# Polish house rules — Spell Book, Bank Sizes, Unit Stacks (implementation plan)

**STATUS: PLAN ONLY. Nothing in this document is implemented.** No engine code,
no data, no options exist yet for any of the three variants below. Per
CLAUDE.md #1, none of this may be reported as done until the engine executes it
AND a test fails when the logic is removed. This document is the design +
wiring map to get there.

Source of truth for the rules: the 2-page **"H3 BG Rules v1.2" Polish
tournament reference sheet** (provided by the user; decoded below — the sheet
resolves numbers the prose description left out) plus the user's description of
playtest intent. Where the sheet is ambiguous, §9 lists the open questions and
each affected section names its recommended reading.

---

## 1. Product contract

Three independent, individually-toggleable community variants from the Polish
tournament scene, grouped under one new **"Polish house rules"** category:

| Toggle (HouseRuleId) | One-line contract |
| --- | --- |
| `polish-spell-book` | Spells never enter your hand/deck. They live in a per-player **Spell Book** with a used/refreshed state, refreshed each round, and are cast by playing generic **"Cast a Spell"** cards from the M&M deck. The Mage Guild is buffed (Search (3), buy Cast-a-Spell, Rolling Spells, level V/VII grants). One merged Spell deck. |
| `polish-bank-sizes` | On a bank-eligible tile reveal you get **two** Creature Bank candidates, each with a dice-rolled **size Ⅰ–Ⅳ**; you pick one, then rotate the tile. Size replaces scenario difficulty for that bank's Stack tokens (and thus its reward scale). A player's first tile rolls 1 die (max size Ⅲ). |
| `polish-unit-stacks` | A **Group** (Pack) army card can buy **Stacks** — extra unit groups (coin tokens ×1/×2/×3). While at least one Stack remains the card fights at **+1 Attack**; each Stack is a full extra health bar; lethal damage removes one Stack and the remainder carries over. Caps: bronze 3 / silver 2 / gold 1. |

Non-negotiable framing rules (repo conventions):

- **Default OFF** everywhere (BINH and Legacy modes). Legacy snapshots and
  tables that never touch the toggles behave byte-identically — every gate is
  a `houseRuleEnabled(state, "polish-…")` read that no-ops when off, and every
  feature ships with mode-off CONTROL tests.
- `polish-spell-book` is **multiplayer-only until Phase 6** (the
  `events`-style seat-count gate, `adventure-setup.ts:1178`): the computer
  card policy does not know Cast-a-Spell yet. `polish-bank-sizes` and
  `polish-unit-stacks` are AI-safe from day one (§8) and ship without the gate.
- These are score-neutral house rules: no MMR/ranked implications beyond what
  any option already has.

## 2. The source rules, decoded from the sheet

Verbatim mechanics from the reference sheet (icons transcribed):

**SPELL BOOK (variant)** — a new card in the M&M deck: **Cast [a Spell]**, *in
place of* Magic Arrow. All Spells are collected in a new per-player deck, the
*Spell book*. Once cast, a spell is **used** — place its card face up. Only
refreshed spells can be cast; at the **beginning of the Round the entire Spell
Book refreshes**. With a **built Mage Guild**: (a) building the Guild /
purchasing spells → **Search (3)**; (b) instead of a Spell you can gain / buy a
**Cast** card; (c) **Rolling Spells**, once per round: cost **3 gold** — remove
a Spell, Search (2) the Spell deck; (d) a hero reaching Exp level **V** and
**VII** gains a **Cast** card. Per the user: Warrior decks carry **1** Cast
card, Mage decks **2** (they replace the starting Magic Arrows — matching the
current might=1 / magic=2 arrow counts, `adventure-setup.ts:639-643`);
Knowledge no longer refreshes spells, it only returns the Cast card to hand;
the tournament build uses **one merged Spell deck** (option 2), not the
basic/expert split.

**BANKS** (sheet p.1, "Description of the map") — on Tiles Ⅱ–Ⅲ and Ⅳ–Ⅴ:
"Random size of **2 Banks** and player **selects** 2→1". Bank size roll: **2×
Attack dice** (first tile Ⅱ–Ⅲ: **1× die**), summed:

| 1–2 dice sum | Bank size | Sheet marker |
| --- | --- | --- |
| −1 | Ⅰ | no token |
| 0 | Ⅱ | bronze coin (1) |
| +1 | Ⅲ | silver coin (2) |
| −2 or +2 | Ⅳ | gold coin (3) |

The Attack die is `[-1,-1,0,0,+1,+1]` (`src/engine/battlefield.ts:12`), so
2-dice sizes distribute Ⅰ 2/9, Ⅱ 3/9, Ⅲ 2/9, Ⅳ 2/9; 1 die can only reach Ⅲ —
exactly the user's "first tile max 3" smoothing.

**UNIT STACKS (variant)** — "A **Group** of units can be [stacked] — creates a
Stack; coin token (1)/(2)/(3). Cost of each Stack = **sum [cost of the] Group +
Tier number**. A Stack has the **same features** as the Group. **Attack of
Stacks is higher by 1** than the Group's. When a Stack's health reaches 0, one
coin token is **removed/downgraded and further damage is assigned**
[carryover]. Maximum Stacks: **Tier Ⅰ (bronze) 3 / Tier Ⅱ (silver) 2 / Tier Ⅲ
(gold) 1**." Per the user: only the *presence* of stacks gives the +1 (it does
not accumulate per stack); extra stacks are extra HP; losing stacks is a real
gold loss (that is the balancing lever).

## 3. Option plumbing (shared by all three)

The three toggles join the existing **house-rule registry** — not a new
options object — because the registry already gives us per-rule validation,
setup-time freezing, legacy-snapshot defaults and a lobby UI for free:

- `HouseRuleId` union (`src/engine/state.ts:48-92`): add `"polish-spell-book"
  | "polish-bank-sizes" | "polish-unit-stacks"`.
- `HOUSE_RULES` registry (`src/engine/house-rules.ts:38`): three `HouseRuleDef`
  entries with a **new `category: "polish"`** (extend `HouseRuleCategory`,
  `house-rules.ts:25`), `default: false`, `legacyDefault: false`. Registry rule
  #18-21 applies: the entries land in the SAME commit as their first real
  engine gate, never earlier.
- Flow (all existing): lobby `SET_GAME_OPTIONS` → per-key validation + shallow
  merge (`adventure-setup.ts:2202-2214`) → `resolveHouseRules` freezes booleans
  onto `adventure.houseRules` at setup (`house-rules.ts:184`,
  `adventure-setup.ts:1158`) → engine reads `houseRuleEnabled(state, id)`
  (`house-rules.ts:200`).
- Lobby UI: `HouseRulesSection` (`src/components/adventure/screen.tsx:5052-5098`)
  is registry-driven; add a rendered category header so the three rules appear
  as a visually distinct **"Polish house rules (tournament variants)"** block
  on the *rules* tab. No per-feature bespoke lobby UI.
- Seat-count gate for `polish-spell-book` only (until Phase 6):
  `resolvePolishSpellBook = houseRule && playerConfigs.length >= 2`, mirroring
  `events` (`adventure-setup.ts:1178`), with the UI labelling it
  "(multiplayer only for now)".
- `polish-bank-sizes` additionally requires `creatureBanks` ON (it is a
  modifier of the bank offer flow); with banks off it is inert and the UI greys
  it out.
- Snapshots: no new required fields anywhere — every new state field below is
  optional, so legacy snapshots load with all three rules off and zero
  migration.

## 4. Feature: Polish Spell Book (`polish-spell-book`)

### 4.1 Relationship to the EXISTING Spell Book rule (critical, do not conflate)

The repo already ships a default-ON house rule named "Spell Book"
(`adventure.spellBook`, `spellBookRuleEnabled` `ruleset.ts:661`): a private
stash zone `PlayerState.spellBook: CardId[]` (`state.ts:5900`) players may
voluntarily move hand Spells into (`MOVE_SPELL_TO_SPELL_BOOK`,
`reducer.ts:869`), cast/play from (`fromSpellBook` on
`CAST_SPELL`/`PLAY_CARD`/`PLAY_REACTION`, `state.ts:2657/2698/2845`), or burn
for +1 Power once per turn (`ruleset.ts:684`). A used Book spell goes **Book →
discard** and recycles through the deck.

The Polish variant is a **different lifecycle over the same zone**. We REUSE:
the `spellBook` zone + player-view masking (`player-view.ts:243-244`), the
whole `fromSpellBook` cast/play/reaction plumbing (casts at normal Power,
counts the per-round limit, pre-hit heal windows and spell-hate all fire
because Book casts run through `castSpell`/`performSpellCast`), the deck-search
`destinations: ("hand"|"spellBook")[]` machinery (`state.ts:9410-9414`), and
`ongoingCards.returnTo: "spellBook"` (`state.ts:6128`). We CHANGE, gated on the
Polish rule: routing (all gained spells → Book, forced), casting (requires a
Cast-a-Spell card), destination (used spells stay in the Book, exhausted, never
→ discard), refresh (round start), and the stash/power-burn affordances
(disabled — see 4.5). When `polish-spell-book` is ON it **supersedes** the
stash-style behaviour for that table; when OFF nothing changes.

### 4.2 State & data

- `PlayerState.spellBookUsed?: CardId[]` — the exhausted half. Keeping
  `spellBook: CardId[]` as "refreshed" and adding a second array avoids
  migrating the existing zone shape (all current readers keep working).
  Visibility per the sheet ("used spells lie face up"): `spellBookUsed` is
  **public** in `getPlayerView`; refreshed contents stay owner-only with
  `spellBookCount` (already the existing masking — extend it with
  `spellBookUsed` passthrough).
- New card **`spell.cast_a_spell`** (in `src/data/cards/spells.ts`):
  `kind: "spell"`, `spellSchools: []`, `power: 0`, playable in combat AND on
  the map, effect `{ type: "CAST_FROM_SPELL_BOOK" }` (new effect type).
  Recommended as kind "spell" so Knowledge's recall adaptation (4.5) falls out
  of the existing `RECALL_SPELL` path — but this REQUIRES an explicit
  `isCastASpellCard` predicate consulted by every effect that filters on
  "Spell" so the enabler is excluded where it must be; the audit list is:
  Cursed Swamp's remove-Spells loop, the Pyramid `REMOVE_THEN_SEARCH_REPEAT`,
  Helm/Crown `TAKE_FROM_DISCARD spell`, Tarnum flags, `STARTING_ONLY`/
  acquisition gates, and the Spell-count VP/audit tests. (Alternative — a new
  card `kind` — is cleaner semantically but touches every kind switch; decision
  flagged in §9.)
- Starting decks (`makeStartingDeck`, `adventure-setup.ts:619-651`): with the
  rule on, might heroes get **1** `cast_a_spell` and magic heroes **2** in the
  M&M deck *instead of* their Magic Arrows (`:639-643`), and the same number of
  `spell.magic_arrow` copies are seeded into `player.spellBook` (refreshed).
- **One merged Spell deck** (tournament option 2): with the rule on,
  `makeSharedDecks` (`adventure-setup.ts:543-590`) builds the SPELL family as
  one combined doubled deck (the existing legacy single-`"spells"` branch,
  `spellDeckLegacy` pattern `spells.ts:2103`) while the Artifact family keeps
  whatever `split-decks` says. Consequences to wire deliberately: the expert
  hero-level gate `canDrawExpertSpells` (`ruleset.ts:424-439`) and
  `strictExpertGate` key off split decks and become no-ops (intended: "easier
  to get expert spells" is the variant's stated goal); `canAcquireSharedDeckCard`
  duplicate/uniqueness gates stay.

### 4.3 Casting flow

1. Player plays `cast_a_spell` from hand (combat: own activation / the windows
   a hand spell could be cast in; map: a normal map play). The play opens a
   pick of **castable refreshed Book spells for that context** (combat-timing
   spells in combat, map-timing on the map — existing timing metadata).
2. The pick resolves through the EXISTING Book-cast paths (`CAST_SPELL
   fromSpellBook` / `PLAY_CARD fromSpellBook` / reaction equivalent), so
   Power sources, the per-combat-round spell limit (`spellLimitFor`,
   `ruleset.ts:611-644` — Book casts already count), Magic Mirror, resistance,
   pre-hit heals, and FX all behave exactly like today's Book casts. Combat
   Cast-a-Spell plays are offered under the same conditions a hand spell cast
   would be (limit not reached, no Faerie-Dragon lock, …) so an unplayable
   enabler never eats itself.
3. NEW destination: `finalizeSpellCardDestination` (`reducer.ts:8808-8887`)
   under the Polish rule moves the spell **refreshed → `spellBookUsed`**
   (never to discard); the `cast_a_spell` card itself goes to the player's
   discard like any spent hand card and recycles through their deck.
4. A spell in `spellBookUsed` is not offered by ANY cast path until refreshed —
   enforced at offer time (legal-actions) and revalidated at resolution
   (reducer guard), like every other gate in this codebase.
5. **Refresh**: at the start of each adventure round (`startAdventureRound`),
   every player's `spellBookUsed` empties back into `spellBook` (+ feed line;
   silent no-op when empty). No mid-combat refresh: within one combat each
   owned spell is castable at most once (given enablers + the per-round limit)
   — this is the printed repeatability model.
6. If the caster has zero refreshed spells castable in the current context the
   Cast-a-Spell play is simply not offered (never a dead play that eats the
   card).

### 4.4 Acquisition routing + Mage Guild buffs

**Routing table — with the rule ON, every path that would put a Spell card
into a player's hand/deck routes it into `spellBook` (refreshed) instead.**
This table is the audit surface; each row gets a test:

| Acquisition path | Today (lands in) | Polish mode |
| --- | --- | --- |
| Shared-deck Search keep (`reducer.ts:17424-17437`) | hand | Book |
| Shared-deck discard-top take (`adventure-reducer.ts:8777-8783`) | hand | Book |
| Mage Guild purchase (`spellBookAction`, `adventure-reducer.ts:7619-7712`) | Search(2)→hand | Search(**3**)→Book |
| Mage Guild build grant (`adventure-reducer.ts:7386-7387`) | 2× Search(2)→hand | 2× Search(**3**)→Book |
| Shrines (`locations.ts:190-213`) | Search(2)→hand | Search(2)→Book (Search (3) deliberately NOT changed — still "in discussion" per the user; see §9) |
| Event spell markets/pools (`events.ts:251/260/269` etc.) | hand | Book |
| Basic-X-Magic school fetch (`performSchoolFetch`) | hand | Book |
| Scholar spell arm (`adventure.ts:3128/3238`) | hand | Book |
| Level-up ability Search — spells taken via any generic search | hand | Book |
| Genie Wish (`DECK_DISCARD_TAKE_SPELL`) / Eagle Eye dig | own deck→hand | **needs adaptation** (own deck holds no Spells in this mode) — see 4.5 |
| Spell Scrolls | scroll zone | unchanged (never hand cards) |
| Tarnum VI over-limit search | hand (temp, returns to shared deck) | unchanged — deliberately bypasses the Book (cards never become "owned") |

Wisdom's search-count bonus (`wisdomSearchCount`,
`adventure-reducer.ts:7671`), Scouting widening and morale repeat-search stack
ON TOP of the Search (3) numbers unchanged.

**Mage Guild buffs** (each gated on the rule AND, where marked, on the guild):

- (a) Search sizes 2→3 at guild build + guild purchase only (rows above).
- (b) "Instead of a Spell — a Cast card": the guild **purchase** action offers
  a choice: Search (3) the Spell deck OR take a `cast_a_spell` into hand, same
  `spellBookCost` gold, same once-per-round `townTokens.spellBook` token —
  that token IS the printed "1 such card per turn" cap. Each of the two
  guild-BUILD searches likewise offers "take a Cast card instead" (a gain, no
  extra cost). Astrologers' free-purchase proclamation (`freeSpellBookActive`,
  `adventure.ts:255`) composes: free Search (3) or free Cast card.
- (c) Level V and VII grants: in the `gainExperience` level loop
  (`adventure.ts:1612-1671`, next to `SPECIALTY_LEVELS`), on crossing level 5
  or 7 **with the player's own Mage Guild built** (`mageGuildBuiltRound` /
  `townHasBuildingEffect(state, pid, "MAGE_GUILD")`), push a `cast_a_spell` to
  hand. The guild condition is the recommended reading — the sheet nests the
  bullet under "Built Mage Guild" and the user's stated intent is "to
  encourage earlier building of the Mage Guild"; flagged in §9.
- (d) **Rolling Spells** (HotA-style reroll): a new town action, requires own
  built Mage Guild, once per round per player (a `player.rolledSpellsRound?:
  number` stamp checked against `state.round` — no `TownTokenState` migration
  needed), cost 3 gold: pick ANY Book spell (used or refreshed), return it to
  the shared Spell deck's discard pile (the engine convention for returned
  shared cards — "removed from game" is the flagged alternative), then
  Search (2) the Spell deck → Book.
- Cast-a-Spell supply is unlimited (digital mint, like the specialty cards
  pushed at `SPECIALTY_LEVELS`); the physical print run may cap it — §9.

### 4.5 Card adaptation table (rule-ON only; every row = wiring + test)

These cards' printed effects reference spells-in-hand/discard, which stop
existing under this mode. Leading with the two the user named:

| Card | Today | Polish mode |
| --- | --- | --- |
| **Knowledge** / Empowered Knowledge (`sample.ts:93-118/212-238`) | `RECALL_SPELL`: cast spell back to hand (+expert: +1 limit) | Returns the **`cast_a_spell` card** to hand; the cast spell **stays used**. Expert +1-limit rider unchanged. Map-cast Knowledge recall (`KNOWLEDGE_RECALL_MAP_SPELL`) likewise returns the enabler. |
| **Mysticism** (`abilities-extra.ts:161-183`) | recall the cast spell (+expert: also the support cards) | Becomes a **refresher**: basic = the just-cast spell flips used→refreshed (castable again this combat via another enabler); expert rider (recall support/pow cards incl. the Sorrow sweep, `rampart-inferno-spells.test.ts`) unchanged. |
| **Helm of the Alabaster Unicorn** (`artifacts.ts:882-910`) | (A) take a Spell from own discard (B) cast shared-discard-top free | (A) **refresh 1 used Book spell** (B) unchanged (shared-deck discard still holds spells via Rolling Spells/seeding). |
| **Crown of Dragontooth** (`artifacts.ts:2398-2426`) | (A) take 2 Spells from own discard (B) remove 1 hand Spell → Search (2) | (A) **refresh up to 2 used Book spells** (B) remove 1 **Book** spell → Search (2) → Book. |
| Crown of the Five Seas / Thunder Helmet (`artifacts.ts:1628/2836`) | own-discard spell recycles | refresh variants, same pattern as the Helm. |
| **Ciele I/IV** (own-discard Magic Arrow recall/cast) | reads own discard | I: refresh your used Magic Arrow; IV: cast a Magic Arrow **from the Book** free + over-limit without an enabler (the existing `fromOwnDiscard` pipeline retargeted at the Book; arrow → used). |
| **Genie Wish** (`DECK_DISCARD_TAKE_SPELL`, `units/abilities.ts:2341/2348`) | dig own deck, discarded Spell → hand | dead as printed (own deck holds no Spells) → adapt: discard from deck as printed, then **refresh 1 used Book spell** (recommended; alternative: take shared-discard Spell → Book). §9. |
| **Eagle Eye dig** (`abilities-extra.ts:185`) | dig own deck for a Spell | same problem → same recommended shape (refresh 1). §9. |
| Hand-spell stash `MOVE_SPELL_TO_SPELL_BOOK` + Book **+1-Power burn** (`ruleset.ts:675/684`) | stash / burn a Book spell for +1 Power | **disabled** — no Spells in hand to stash; the sheet has no power-burn (a burn would permanently eat a Book spell). Power boosts come from hand power-source cards as normal. |
| Tarnum VI / Spell Scrolls / shared-deck seeding (`shared-deck-discard-seed.test.ts`) | — | unchanged by design (none of them puts an owned Spell in hand). |

### 4.6 UI

- Extend the existing `spell-book-modal.tsx`: two sections (refreshed /
  used-face-up), used cards greyed with a "refreshes next round" chip; a
  Cast-a-Spell play opens the same modal in pick mode filtered to the current
  context. Opponents' PUBLIC used spells render in the opponent info panel.
- Card art: the user supplied a "Cast a Spell" card image (Discord link) —
  download into `public/assets` (R2 auto-sync per CLAUDE.md; reference only
  via `assetUrl()`), with a drawn placeholder until then.
- Feed/events: `SPELL_BOOK_REFRESHED`, `SPELL_MOVED_TO_BOOK`, and the existing
  cast events carry a `fromSpellBook` marker already; reuse spell FX/sounds.

### 4.7 Tests (all with rule-OFF controls; effect-level per CLAUDE.md #1a)

`polish-spell-book.test.ts` (+ split files as it grows): starting swap
(might 1 / magic 2, arrows in Book, no arrows in deck — control: rule off
keeps arrows in deck); cast-via-enabler end-to-end (damage lands, spell →
used, enabler → discard, limit consumed); **invariant: a used spell is never
offered nor resolvable by ANY cast path** (hand/Book/reaction/map — mutation
control: removing the used-gate fails); round-start refresh; every routing-
table row (search keep → Book with rule on / hand with rule off); merged deck
(one `"spells"` deck, expert spells drawable pre-level-4 — control: split
gates hold with rule off); guild buffs a–d (Search 3 counts; buy-Cast spends
the token+gold; level V/VII grant with built-guild control AND
no-guild-no-grant control; Rolling Spells pays 3, once per round, returns the
spell to the shared discard, search lands in Book); every adaptation-table
row (e.g. Knowledge returns the enabler NOT the spell — with the rule-off
control proving the old recall still works); Mysticism refresh with a
basic/expert split control.

## 5. Feature: Bank Sizes (`polish-bank-sizes`)

### 5.1 Spec

On a bank-eligible reveal (existing gates unchanged: tile group →
`creatureBankTierForGroup` `adventure.ts:7346-7348`, blocked field present,
pile non-empty, `creatureBanks` on): peek the **top TWO** tokens of the
matching pile, roll a size for each with **seeded Attack dice** (sum → size
per the §2 table), present the player a three-way choice — *Place bank A
(size X)* / *Place bank B (size Y)* / *Leave it blocked* — then the normal
rotation. **1 die instead of 2** when this reveal is the revealing player's
FIRST Ⅱ–Ⅲ opening (reuse `farTilesOpenedByPlayer` /
`pendingFarTileFlip.openingIndex === 1` convention, `state.ts:8288`,
`adventure-reducer.ts:2284` — recommended reading of "first tile", §9;
subterranean/near reveals always roll 2). With only one token left in the
pile, offer that single candidate (sized) as today.

Size **replaces scenario difficulty for that bank only**: size Ⅰ–Ⅳ → 1–4
stack-token ROLLS through the existing 77 %-landing pipeline
(`STACK_TOKEN_PLACEMENT_PERCENT`, `adventure.ts:7401`) — i.e. size N behaves
exactly like easy/normal/hard/impossible does today. This keeps the repo's
existing house-ruled variance and the reward scaling untouched (rewards
already key off LANDED stacks, `grantCreatureBankReward` `adventure.ts:7489`).
The deterministic alternative (size Ⅰ=0 … Ⅳ=3 fixed stacks, one sheet
reading) is flagged in §9.

### 5.2 Wiring

- `reserveCreatureBankForTile` (`adventure-reducer.ts:1549-1570`): with the
  rule on, peek two (`pile[len-1]`, `pile[len-2]`), roll sizes via
  `adventureRandom(state, "bank-size-<tileInstanceId>")` (seeded, replayable),
  store `tile.reservedBankOptions?: { bankId, size }[]` alongside the existing
  `reservedBankId` (kept pointing at option 0 so the rotation-preview keeps
  rendering). Emit `ADVENTURE_DICE_ROLLED` (dice:"attack") per candidate +
  a feed line, so the rolls are visible/auditable.
- `offerCreatureBankPlacement` (`adventure-reducer.ts:1852-1902`): same
  `pendingChoice` context `"place-creature-bank"`, now with the three options.
  Resolution (`adventure-reducer.ts:8526-8556`): on accept, remove the CHOSEN
  token from the pile **by id** (it may be top-1 or top-2), leave the other in
  place (peek semantics — nothing was consumed; §9 flags the shuffle-back
  alternative); persist **`field.bankSize`** on `placeCreatureBank`. Decline
  leaves both. Elimination mid-choice: reservations are peeks, so the existing
  cleanup (clear reservation, drop the choice) already cannot strand tokens.
- Threading size: `buildCreatureBankCombatUnits` (`adventure.ts:7374-7412`)
  `tokenRolls = field.bankSize ?? STACK_TOKENS_BY_DIFFICULTY[difficulty]`.
- AFK: options ordered [A, B, leave] — `pickResolvingAction`
  (`afk-drop.ts:77-83`) picks A, consistent with today's auto-place behaviour.
- AI: `choice-policy.ts` `scorePositionOption` place-creature-bank branch
  (`choice-policy.ts:496-500`) learns the 3-option shape: score each candidate
  with `creatureBankStrength`/`canBeatCreatureBank`
  (`army-strength.ts:99-135`) fed the rolled size instead of global
  difficulty; prefer the beatable one with the larger size (bigger reward),
  "leave" when neither is beatable-now (parked objective). `map-navigation`'s
  known-bank gate reads `field.bankSize` the same way.

### 5.3 UI + tests

Rotation-preview (`screen.tsx:855-902`) shows BOTH candidates (art + name +
size Ⅰ–Ⅳ badge) and the choice buttons; placed banks render a permanent size
badge (the sheet's coin marker, bronze/silver/gold for Ⅱ/Ⅲ/Ⅳ) on the field
and in the combat header. `polish-bank-sizes.test.ts`: dice→size mapping
table (all sums, both dice counts — mutation control on the map); first-Far-
opening rolls 1 die (second opening rolls 2 as control); two candidates
offered, chosen id consumed by-id, unchosen stays (pile conservation
invariant, decline control); `field.bankSize` drives token rolls (size Ⅳ vs Ⅰ
behavioural divergence with the global-difficulty control); reward scale
follows landed stacks; rule-off control = single-peek flow byte-identical;
AI picks the beatable candidate (control: unbeatable pair → leave).

## 6. Feature: Unit Stacks (`polish-unit-stacks`)

### 6.1 Spec (engine reading)

- Eligible: an army card on its **pack** side ("Group"), tiers bronze/silver/
  gold with caps **3/2/1** (from the unit def's grade). Few-side and
  neutral-side cards cannot stack in v1 (neutral-side eligibility — §9).
- Cost per Stack: the Group's assembly cost — **`few.cost + pack.cost` summed
  (printed resources) + Tier number in gold** (bronze +1 / silver +2 /
  gold +3). "sum Group + Tier number" is ambiguous; the cheaper alternative
  (pack cost + tier) is §9. Recruit gold discounts do NOT apply (it is not a
  recruit).
- Purchase: at the player's own Town, **requires the Citadel built** (the
  building already gating the Pack economy — `castle.citadel` etc., effect
  `UNLOCK_REINFORCE`, `core.ts:181-189`; matches the user's "go citadel and
  stack"), via the population flow: a new `POPULATION_ACTION` purchase kind
  `"stack"` with `armyUnitId` (`populationAction`,
  `adventure-reducer.ts:7460-7574`), multi-buy in one action like recruits,
  offers in `addTownActions` (`legal-actions.ts:7541-7600`).
- Combat: while `stacks ≥ 1` the unit fights at **+1 Attack** (not per-stack).
  Each stack is a full extra health bar of the pack side. On lethal damage:
  remove one stack, reset the layer to full pack health, **carry the leftover
  damage into the fresh layer** (may chain through several stacks in one hit).
  When the last layer dies the card dies as today (all invested stack gold is
  lost — the intended risk).
- Stacks persist between combats; layers always start combat full (matching
  the game's no-persistent-wounds model). Nothing restores a lost stack except
  buying a new one in town.

### 6.2 Wiring

- State: `ArmyUnitState.stacks?: number` (`state.ts:5781-5803`, next to the
  `permanentAttackBonus` precedent) mirrored to `CombatUnitState.armyStacks?:
  number` in `makeCombatUnitFromArmy` (`adventure.ts:7617-7683`). This is
  **deliberately a separate field from `stackToken`** (the bank-guard token):
  bank abilities key off `Boolean(unit.stackToken)`
  (`unit-abilities.ts:44`) and must not light up on army stacks, and the two
  never coexist on one unit.
- +1 Attack: in `applyUnitCurrentSide` (`unit-transforms.ts:100`) — a new
  army-stacks branch beside the printed-side branch (`:137-148`) adds +1 while
  `armyStacks ≥ 1`; recomputed on every stack loss so the bonus drops with the
  last stack mid-combat.
- Lethal absorb: in `markUnitRemovedIfNeeded` (`combat-units.ts:19`) — the
  ordering is load-bearing; insert the army-stack layer **after** Rebirth
  (`:84`) and **before** the Pack→Few flip (`:124`), sibling to (never inside)
  the `bankUnit && stackToken` branch (`:104-122`): decrement `armyStacks`,
  reset damage, apply carryover, emit a new `ARMY_STACK_LOST` event (feed +
  board flash). Lethal-save reactions (Resurrection & co.) still resolve
  before removal and therefore before a stack is spent.
- Post-combat sync: the casualty loop (`adventure-reducer.ts:6616-6667`)
  writes the surviving `armyStacks` back to `armyUnit.stacks`; a dead card
  drops entirely via `discardDefeatedArmyUnit` (`:7031-7038`) unchanged.
  `keepTroops` PvP-no-loss restores stacks too (no loss means no loss).
- Interactions (documented readings, each tested): heals/First-Aid affect the
  current layer's damage only and never re-grant tokens; Hierophant First Aid
  flip-up restores the side, not stacks; `CONVERT_ARMY_UNIT` and side flips
  (Pack→Few on a casualty) DROP remaining stacks (a Few is not a Group);
  combat unit limit (5/4) unaffected — stacks are not extra bodies;
  `livingControllerIds` unaffected (the card is alive until its last layer
  falls); Quick Combat (`neutralBattleLevel`) deliberately ignores stacks in
  v1 (the sheet's +0.5-strength belongs to its separate army-strength
  Quick-Combat variant, which this plan does not implement — noted for the AI
  heuristic only).
- AI: v1 competence = the runner never freezes (the purchase is optional, so
  no new mandatory windows exist); Phase 6 adds a `map-policy` economy score
  (buy stacks with surplus gold after the dwelling ladder, mirroring the
  recruit treasury guard) and counts stacks in `army-strength.ts` at +0.5.

### 6.3 UI + tests

Army panel + combat board: a coin badge ×N (bronze/silver/gold by count,
reusing the `stackTokenBadge` pattern, `board.tsx:1297-1304`); town window: a
"Stack" buy row under each eligible pack unit with cost and cap; opponent
info shows stacks (army state is already public, `player-view.ts` masks
nothing here). `polish-unit-stacks.test.ts`: purchase (gold flow, Citadel
gate control, cap-by-tier table, pack-side-only control, once-cap rejection);
+1 Attack while stacked → observable damage delta, and the bonus DROPS when
the last stack falls mid-combat (mutation control); absorb math incl. a
multi-layer chain hit (e.g. 7 damage through two 3-HP layers kills one stack,
then the next, leaves 1 carried damage); bank-ability isolation control (an
army stack never sets `stackToken` nor unlocks `requiresStacked` bank
abilities); post-combat persistence + dead-card-loses-everything; rule-off
control (no offers, no absorb).

## 7. Cross-cutting seams

- **Parallel turns**: all new prompts (bank pick, Cast-a-Spell pick) are
  ordinary `pendingChoice`/interaction-singleton citizens — the bystander
  fingerprint guard already covers them. The round-start Book refresh runs in
  `startAdventureRound` before the event barrier content, uniformly for all
  seats.
- **AFK/timeout driver**: `CHOOSE_OPTION` is already in
  `RESOLVING_ACTION_TYPES` (`afk-drop.ts:48-63`) — both new choices
  auto-resolve; the Cast-a-Spell pick must expose a "cancel/skip" option so a
  driven resolution can no-op safely.
- **Elimination**: Book cards and stacks die with the seat (no shared-deck
  cards are held hostage — Book spells left the shared deck permanently, same
  as today's hand spells; the two-bank reservation is a peek).
- **PvP Neutral Control / morale cards / commanders**: no rule couplings
  beyond what falls out automatically (a controlled bank guard with a
  size-driven stack token behaves like today's difficulty-driven one;
  commander casts are NOT Book spells and ignore this system entirely).
- **Phone UI**: the Book modal, town rows and choice prompts are existing
  overlay/modal surfaces — no new tab work; verify reachability in the
  existing phone specs only if a regression appears.
- **Assets**: Cast-a-Spell art + a size-badge glyph set under
  `public/assets/…` (R2 auto-sync; `assetUrl()` everywhere, enforced by
  `asset-url-coverage.test.ts`).
- **Docs**: on shipping each phase, update CLAUDE.md's feature sections in the
  established "what runs vs. limits, caveats first" format.

## 8. Single-player AI

- Phase-gated: `polish-bank-sizes` needs only the §5.2 choice-scoring branch
  (mandatory window — MUST land with the feature); `polish-unit-stacks` needs
  nothing to be safe (optional purchase) and gets economy scoring in Phase 6;
  `polish-spell-book` is seat-count-gated OFF single-player until Phase 6
  teaches `card-policy` to (1) play Cast-a-Spell and pick a spell by the
  existing damage-ladder logic, (2) value guild purchase/Rolling Spells, and
  (3) answer the new choice contexts. Un-gate only when
  `computer-runner.test.ts` proves a full AI game with all three rules ON
  reaches round N without a stall.

## 9. Open questions for the rule authors (defaults chosen so work can proceed)

1. **Stack cost**: `few.cost + pack.cost + tier` (chosen) vs `pack.cost +
   tier`? Is the tier surcharge gold-only (chosen) and are printed
   material/valuable components paid as printed (chosen)?
2. **Stack purchase gate**: own Town + Citadel (chosen, per "go citadel and
   stack") — or any own town / dwelling required? May neutral-side cards
   stack (chosen: no, v1)?
3. **Level V/VII Cast grant**: requires own built Mage Guild (chosen, sheet
   nesting + stated intent) — or unconditional?
4. **Rolling Spells**: removed spell → shared Spell-deck discard (chosen) or
   removed from game? Any Book spell (chosen) or refreshed only?
5. **Bank stacks**: size = token ROLLS through the existing 77 % house roll
   (chosen — size behaves exactly like difficulty does today) or the sheet's
   literal fixed counts (Ⅰ=0/Ⅱ=1/Ⅲ=2/Ⅳ=3, deterministic)?
6. **Unchosen bank token**: stays where it lies (chosen — pure peek) or is
   shuffled/bottomed back?
7. **"First tile" 1-die rule**: the player's first Ⅱ–Ⅲ opening (chosen,
   matches the sheet's "first tile: Ⅱ–Ⅲ" annotation and the existing
   `openingIndex` counter) or literally their first reveal of any group?
8. **Book visibility**: refreshed spells private / used public (chosen, from
   "place it face up") — or fully public?
9. **Guild-build searches**: may EACH of the two be converted to a Cast card
   (chosen) or only the paid purchase path?
10. **Cast-a-Spell supply**: unlimited (chosen) or a finite pool?
11. **Card kind for Cast-a-Spell**: `kind:"spell"` + exclusion predicate
    (chosen) vs a new card kind.
12. **Genie Wish / Eagle Eye adaptation**: refresh-1 (chosen) vs
    shared-discard-take.
13. **Shrine Search (3)**: deliberately NOT included ("yet in discussion") —
    if adopted later it is a one-line count change behind the same rule.

## 10. Implementation phases and gates

Each phase lands green (typecheck, lint, full test suite) and independently
shippable; a phase's toggle stays out of the registry until its first real
gate exists (registry honesty rule).

- **Phase 1 — plumbing**: `HouseRuleId`s + registry entries + `"polish"`
  category UI block, landing together with the first Phase-2 gate.
  Gate: `house-rules.test.ts` round-trip + lobby render.
- **Phase 2 — Bank Sizes** (smallest engine delta, validates the category):
  §5 complete incl. AI choice branch. Gate: `polish-bank-sizes.test.ts` suite
  + an AI single-player smoke with the rule on.
- **Phase 3 — Unit Stacks**: §6 complete (purchase, combat, sync, UI).
  Gate: `polish-unit-stacks.test.ts` suite incl. the isolation controls.
- **Phase 4 — Spell Book core**: zone lifecycle (used/refreshed + round
  refresh), Cast-a-Spell card + casting paths, starting-deck swap, merged
  deck, full routing table. Multiplayer-only gate active.
  Gate: core suite + the used-spell invariant + routing rows.
- **Phase 5 — Spell Book periphery**: Mage Guild buffs a–d, level grants,
  the whole card-adaptation table, UI polish + art.
  Gate: adaptation rows each mutation-checked.
- **Phase 6 — AI + un-gating**: card-policy Cast-a-Spell competence, stack
  economy scoring, army-strength +0.5, then lift the spell-book seat gate.
  Gate: full-AI-table soak with all three rules ON; update CLAUDE.md.

## 11. Definition of done

Every §1 contract line is engine-executed with a named test that fails when
its wiring is removed; every §4.4/§4.5 table row has its row-test; the three
rule-OFF control suites prove untouched tables byte-identical; no
`implementationStatus:"implemented"` claim without executing effect; CLAUDE.md
updated caveats-first; single-player un-gating only after the Phase-6 soak.
Anything not reached ships explicitly listed as not-implemented in CLAUDE.md —
never as silent decoration.
