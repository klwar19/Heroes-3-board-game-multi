# CLAUDE.md — rules for AI/automated contributors

These apply to every automated contributor (Claude Code, including claude.ai/code
in the browser). They exist because past work shipped non-functional "decorative"
abilities and then summarized them as complete. Treat these as hard requirements,
not suggestions.

## 1. "Done" means engine-enforced AND tested

A gameplay rule, unit ability, card effect, hero specialty, or building effect is
**done only if both** are true:
1. the engine actually executes it, and
2. a test fails if that logic is removed.

If you cannot do both, it is **NOT done**. Say so explicitly in your reply, leave
it clearly marked not-implemented, and stop — do **not** paste the printed rules
text into a display field and move on. Pasted-but-inert text is a stub, never a
feature.

### 1a. Test the EFFECT, not the artifact (how the "done" bar is actually met)

A passing data check is not coverage. These five habits catch the bugs an
"is it wired? is there a test?" audit greenlights anyway:

1. **Assert the observable game outcome, not an intermediate value.** "Token
   placed, amount X" is a data check; "defense went 3→1" / "damage rose by 2" is
   the real one. A test must fail if the logic is *wrong*, not just *absent*.
2. **A surprising test value is a lead, not noise.** If an assertion fails on a
   number you were sure of, explain the discrepancy before changing the
   expectation to match reality — that reconciliation is often where a bug hides.
3. **Cross-check siblings that share a mechanic** (e.g. every Corrosion/Attack
   token source). Divergence in how they encode the same thing (sign, magnitude,
   code path) is a smell.
4. **Audit the consumer, not just the producer.** Several producers can each look
   fine while the single shared reader they feed is broken and untested.
5. **Prefer an invariant over N one-offs** where one exists (e.g. "a Corrosion
   token always *lowers* effective defense, never raises it") — it guards every
   producer at once.

**Auditing content?** Use the `/audit-content` command (`.claude/commands/`),
which operationalises these five habits across *every* category (units, spells,
specialties, artifacts, abilities, buildings, banks, map tiles) — not just the one
you came in for. It exists because a prior audit reported green while Deemer's
Meteor Shower / Resurrection were broken: they were wired and had tests, but the
tests asserted the printed tier numbers instead of whether the damage/cost moved
with spell power, and no test compared the specialty to its scaling twin (the
Frost Ring spell). An "is it wired? is there a test?" pass is **not** an audit;
audit the behaviour and mutation-check every "verified" claim.

## 2. Every card/unit definition must state exactly what the engine implements

A human must be able to read a definition and know precisely what runs.

- **Units** (`src/data/factions/units.ts`): the `abilities: [...]` array is the
  *complete, literal* list of engine-wired effects for that side — no more, no
  less. `abilityText` is printed-card flavor/reference only and is **never**
  proof that something works.
  - If `abilityText` describes anything the engine does NOT do, add a comment on
    that side stating exactly what runs, e.g.
    `// engine: ignore-combat-penalties only; the +1 Power activation is display-only`.
  - A side with `abilities: []` does **nothing** mechanically, whatever its
    `abilityText` says. It is a stub.
- **Cards** (`src/data/cards/*`): `effect` + `implementationStatus` are the truth.
  Use `implementationStatus: "not-implemented"` (with a no-op effect) for anything
  not wired. Never set `"implemented"` unless the effect actually executes.
- Known display-only abilities must be **declared in one explicit registry**
  (e.g. `DISPLAY_ONLY_ABILITIES`) so a stub is a conscious, reviewable entry — not
  something a reader has to reverse-engineer.

## 3. Required enforcement (now in the repo)

`src/data/factions/ability-text-enforcement.test.ts` asserts, for EVERY unit
side in `coreUnitDefinitions` (few/pack/neutral, all factions + neutral decks):
- every `abilities` tag resolves to a `unitAbilities` entry with
  `implementationStatus: "implemented"`;
- a side with effect-describing `abilityText` and empty `abilities` must be
  declared in `DISPLAY_ONLY_ABILITIES` (a conscious stub, engine does NOT run
  it) or in `ENGINE_RULE_WIRED_ABILITY_TEXT` (implemented as a dedicated engine
  rule keyed off the unit — e.g. the neutral Skeletons' Necropolis reinforce —
  with the wiring and covering test named in the value);
- registry hygiene: no entries for nonexistent sides, no display-only entry for
  a side without text, no engine-rule entry whose side gained wired tags, no
  side in both registries.

New decorative unit text now fails CI until consciously declared. The Creature
Bank side-space has the same invariant in `src/data/map/creature-banks.test.ts`.
**Limit (rule #1a still applies):** this proves text is declared and tagged,
not that a wired ability BEHAVES correctly — behaviour stays pinned by the
per-mechanic tests, and an audit still means mutation-checking those.

## 4. How to report work (no dressing up)

- Lead with what does **NOT** work / what is display-only. Caveats go first, never
  in a footnote.
- Do not use ✓/✅ or words like "complete", "fully implemented", or "no decorative
  features" for anything you cannot back with a named, passing test.
- If you took a shortcut or shipped a stub, say that in the first sentence.

## Where this file lives / why it works on the web

This is the repository-root `CLAUDE.md`. Claude Code auto-loads it as context at
the start of every session, including claude.ai/code in the browser. The web
environment clones the repo fresh each session, so **only what is committed to the
default branch (`main`) takes effect there.** Keep this file committed on `main`.
Nested `CLAUDE.md` files in subdirectories are also loaded when working in those
folders; per-user `~/.claude/CLAUDE.md` does **not** persist on the web.

## Static media & CDN (how art/sound/font files ship)

`public/` in git is the source of truth; production serves media from the
Cloudflare R2 CDN at `https://cdn.hamthefirt.xyz` (runbook + live status:
`docs/cloudflare-custom-domain-cdn-plan.md`). What an AI contributor must know:

- **Adding/replacing a file under `public/assets|sounds|fonts` is enough** —
  `.github/workflows/sync-media-r2.yml` auto-uploads on every push (branches:
  new keys only, so previews work; `main`: full sync + cache purge). Never
  hand-edit the bucket; manual fallback is `npm run sync:assets`.
- Code referencing media MUST go through `assetUrl()` (`src/lib/asset-url.ts`)
  — a raw `/assets/…` literal in a consumption position fails
  `src/lib/asset-url-coverage.test.ts`. `globals.css` url() refs are covered
  by the `next.config.ts` CDN redirects instead (`src/lib/asset-cdn.ts`).
- `partykit.json`'s `HOMM3BG_APP_URL` (canonical: `https://hamthefirt.xyz`)
  must stay in lockstep with the `HOMM3BG_APP_URL` GitHub Actions secret —
  the secret OVERRIDES the json at deploy time.

## Phone UI mode (per-device layout choice) — what runs vs. limits

At the very start of the app flow (the main menu `/menu` and the multiplayer
lobby `/play`) — and, for a direct-link / mid-game joiner who skips the menu,
once per browser on every table branch too — the game asks **"How are you
playing?" — Computer mode or Phone mode** (`UiModePrompt`, device detection
only pre-highlights the recommendation; it renders only while the preference is
unset so it never double-asks). The choice lives in
`localStorage["binh-ui-mode"]` (`src/lib/ui-mode-preference.ts`, helper-coach
pattern; never in GameState, never sent to the server) and is switchable any
time via the 📱/💻 toggle in the table menu. Phone mode = `.phoneMode` class +
`data-phone-tab` on the branch `<main>` (page.tsx) + a bottom `PhoneTabBar`;
ALL phone rules live in one delimited block at the end of `globals.css`, every
selector prefixed `.phoneMode` — with the preference unset or "computer" not
one rule can match, which is the engine of the "desktop unchanged" guarantee
(pinned by CONTROL tests). Tabs show ONE full-screen panel at a time over the
SAME DOM the desktop lays out side by side: adventure = Map · (Battle) · Hand
(count badge + a pulsing "Draw!/Discard!" chip while the mandatory hand step
is pending) · Army · Decks · Menu; combat = Board · (Map) · Hand · Menu.
Fixed overlays (prompts, reaction tray, dice, chat, feed) stay reachable from
every tab and are re-anchored above the tab bar. The hex map gained real
two-finger pinch zoom/pan (`map-pinch.ts` pure math + `HexMapBoard` pointer
wiring; mouse/single-finger paths byte-identical). The chat dock starts
collapsed in phone mode (and collapses once when the mode flips to phone);
`layout.tsx` exports the default viewport plus `viewportFit: "cover"` for
safe-area insets; the site header/footer collapse under `.phoneMode` via
`:has` (graceful no-op on old browsers).

Leading with what does NOT run / deliberate limits:
- **jsdom cannot compute CSS**, so the wiring (class/attribute/tab bar, prompt
  precedence, pinch camera) is pinned in `src/app/page-phone-mode.test.tsx`,
  `src/lib/ui-mode-preference.test.ts`, `ui-mode-prompt.test.tsx`,
  `phone-tab-bar.test.tsx`, `map-pinch.test.ts`, `map-pinch-gesture.test.tsx` —
  and the VISIBLE effect (panels actually swapping, desktop control) is pinned
  in the real browser by `tests/e2e/phone-ui-mode.spec.ts`. Both halves are
  the feature's test bar; keep both.
- Card-flight FX that land in a hidden panel (e.g. a draw while the Hand tab
  is closed) play to an off-screen anchor — cosmetic only, state is right.
- No phone-specific Town window / map designer / menu-page layouts yet
  (generic modal + column CSS only), no PWA/fullscreen/orientation lock, no
  landscape-specific rearrangement (the battlefield/map simply fit both
  orientations via dvh caps), no hand peek strip on the Map tab.
- The e2e config seeds `binh-ui-mode`/`binh-helper-coach` as ANSWERED for all
  other specs (playwright.config.ts storageState) — the first-visit prompts
  otherwise block every lobby click (the coach prompt already did before this
  feature); `phone-ui-mode.spec.ts` opts back into a clean slate because the
  prompt itself is under test. The Next dev-tools badge is pinned top-right
  (`devIndicators` in next.config.ts) so its portal cannot swallow tab taps.

## Current known stubs (display-only, NOT implemented)

Most items this list previously named (the Tower hold-outs) have since been
wired and are covered by a test that fails if the logic is removed:
- `tower.genies` few & pack — "discard from deck, take a Spell" → `genie-spell-draw-few`
  / `genie-spell-draw-pack` (`DECK_DISCARD_TAKE_SPELL`); see
  `src/engine/expansion-creature-abilities.test.ts` ("Genie Wish").
- `tower.magi` pack — "+1 Power to the first spell you cast this round" →
  `magi-power-boost`; see `src/engine/decorative-faction-abilities.test.ts`.
- `tower.gargoyles` / `tower.titans` — the ongoing-effect immunity →
  `gargoyle-spell-ward` / `titan-ignore-ongoing`; see
  `src/engine/expansion-creature-abilities.test.ts` ("Gargoyle / Titan
  ongoing-effect immunity").
- `tower.iron_golems` — spell-damage reduction → `reduce-spell-damage-1` /
  `reduce-spell-damage-2`; see `src/engine/decorative-faction-abilities.test.ts`.
- Solmyr I/IV/VI, Cyra IV/VI, Torosar I/IV/VI — now implemented;
  `src/engine/hero-specialty-levels.test.ts` asserts "has no remaining
  not-implemented hero specialty" and `src/engine/tower-hero-specialties.test.ts`
  exercises each. (`PENDING_TOWER_SPECIALTIES` no longer exists.)

Conflux — now fully engine-wired (no display-only unit clauses left):
- `conflux.{storm,ice,energy,magma}_elementals` (Few & Pack) — the FACTION
  (recruitable) elementals do NOT carry the Magic-Arrow/school immunity or the
  "deals elemental damage" trait: per the verbatim 3-column wiki card those
  belong to the separate NEUTRAL guard (`neutral.*_elementals`) column ALONE.
  The faction Few has no abilities; the faction Pack has ONLY its "[activation]
  +1 Power to the first <School> spell" rider. The earlier wiring (which copied
  the neutral guard's `elemental-damage` + `<school>-elemental-immunity` onto the
  faction Few/Pack) was a transcription fabrication and has been removed —
  enforced in `conflux-content.test.ts` (faction Few = [], Pack = activation only;
  the neutral guard keeps the passives as the control).
- `conflux.magic_elementals` (Few & Pack) — "Attack all adjacent [enemy] units"
  is now wired via the generic `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` multi-attack
  queue: a full separate follow-up attack at the unit's OWN (buffable) Attack
  against every other adjacent unit — the Few hits friend AND foe
  (`magic-elemental-attack-all`, `includeAllies`), the Pack enemies only
  (`magic-elemental-attack-all-enemies`). The Pack's "Ignore any Spell effects"
  is the shared full spell immunity (`immune-all-spells`, which also covers Magic
  Arrows) and "damage from Specialty" is `immune-specialty-damage` (the Azure
  Dragon combo). Per the verbatim wiki card the faction Magic Elementals carry NO
  "deals elemental damage" line on EITHER side and no separate Magic-Arrow line —
  the earlier `elemental-damage` + Magic-Arrow-only wiring was a fabrication and
  has been removed. Engine-enforced in `conflux-content.test.ts` ("Conflux Magic
  Elementals abilities", with the Few/Pack divergence as the mutation control).
- Erdamon is the **Magma Elementals** specialist (wiki: "The effect doubles for
  the Magma Elementals unit"), NOT an all-Elementals generalist — the earlier
  all-Elementals doubling on I/IV was a deviation and has been corrected to match
  the card (`conflux-content.test.ts`, with the other Elementals as the control).
- Conflux heroes now shipped: the three unit-specialist Planeswalkers (Erdamon,
  Monere, Pasis) AND **Luna** the Fire Wall Elementalist — I/VI place the shared
  `fire_wall` battlefield token at a FIXED 1/3 damage (`PLACE_FIRE_WALL_FIXED`),
  IV is the spell-economy choice (map discard recall OR a +2-Power spell-cast
  reaction). All I/IV/VI implemented + tested (`conflux-content.test.ts`). Conflux
  PC portraits (incl. Luna and Tarnum) are now downloaded to `/public/assets`.
- **Ciele** (Magic Arrow Elementalist) is now shipped — Magic Arrow is a
  STARTING_ONLY spell, so a cast copy lands in the player's OWN discard pile, NOT
  the shared Spell deck; both I and IV read that own discard (the earlier
  shared-Spell-deck wiring meant neither could ever find the arrow in real play).
  I is an `<instant>` recall of a Magic Arrow from your discard to hand, playable
  on the map AND in combat (`TAKE_FROM_DISCARD` filtered to Magic Arrow,
  `allowInCombat`). IV casts a Magic Arrow from your OWN discard for FREE over the
  limit (the `CAST_FROM_SPELL_DISCARD` pipeline with `ownDiscard`, `spellId`-
  filtered — the arrow stays in your discard, the specialty cycles to discard).
  VI deals 2 damage; each with a +Power reaction alternative. The tests seed the
  PLAYER's own discard and keep a CONTROL proving a Magic Arrow in the shared
  Spell-deck discard is NOT castable. See `conflux-ciele-specialty.test.ts`.
- **Tarnum (Conflux)** (Enchanters Elementalist) is now shipped — all I/IV/VI
  engine-wired and covered by `conflux-tarnum-specialty.test.ts` (each level fails
  if its wiring is removed):
  - I — `Search(1) Spell` with the new `CARD_DECK_SEARCH.allowRemove` flag: the
    revealed Spell can be KEPT into hand OR REMOVED from the game (the deck-search
    pipeline now carries `allowRemove` through `openSharedDeckSearch` /
    `revealSharedDeckSearch` / the DECK_SEARCH choice and offers a "Remove …"
    pick). The control proves a normal Search offers no Remove.
  - IV — `CONVERT_ARMY_UNIT` extended with a `goldCost` and an optional from-unit:
    "Pay 10 gold → the unique neutral Enchanters card" (or draw). Gated on gold
    and the `unique` one-Enchanters limit.
  - VI — the over-limit multi-cast subsystem (`TARNUM_OVERLIMIT_SEARCH`): an
    **Instant** playable on your turn, off-turn in the instant window, OR as a
    reaction inside an open attack window. It opens a per-search deck choice
    (`TARNUM_SEARCH` pendingChoice): twice, the caster picks ONE Spell deck —
    basic or expert — to Search 1 card from. Each taken card is flagged
    (`combatStats.tarnumOverlimitCards`) for a FREE cast over the per-round limit
    (never bumps `spellsCastThisRound`; forgery-validated in `castSpell` AND
    `applyReactionPlayCore`), returning to the shared Spell deck top OR discard —
    the caster's choice via `CAST_SPELL.tarnumReturn` / `PLAY_REACTION.tarnumReturn`
    — instead of the caster's own discard. A flagged spell casts only when "their
    type allows it" in the open window: a combat spell (Fireball) during your own
    activation, a trigger-free instant anytime (both via `addSpellActions`), and an
    attack/defense-changing reaction instant (Bless, Curse, Bloodlust…) in the
    reaction/instant window via a dedicated free over-limit pass in
    `getLegalReactionsForTrigger`. Used AS a reaction in an attack window, playing
    VI runs the Search inside the still-open window and then re-derives its offers
    (`refreshReactionWindowLegalReactions`) so a just-Searched applicable instant
    can be cast into the SAME window; a Searched spell that does not fit just stays
    in hand. The flag clears at combat start and each combat round. All covered in
    `conflux-tarnum-specialty.test.ts` (per-search choice, both/same deck, the
    on-turn vs off-turn split, the reaction-window cast with a graded CONTROL that
    the flag is what lifts the limit, AND the in-window search-and-cast flow).

Factory (expansion) — unit Few/Pack card art is now the REAL board-game scans
(was fake PC-portrait placeholders); the abilities are being wired off those scans
(read the card, not a wiki). WIRED + engine-enforced (a test in
`factory-unit-abilities.test.ts` / `factory-combat.test.ts` fails if removed;
`factory-content.test.ts` pins which sides carry which id):
- Halflings — Few/Pack `attack-roll-advantage`; Pack also `halfling-precise-shot`
  (a "+1" roll drops a Corrosion token, -1 Defense). The "resolve the higher"
  advantage OVERRIDES the ranged Combat penalty (adjacent / backline-to-backline):
  the Factory Halfling has no "Ignore combat penalties" waiver (unlike the neutral
  core Halfling), so under a penalty it still rolls two dice and keeps the HIGHER,
  not the penalty's lower — the `ATTACK_ROLL_ADVANTAGE` branch resolves before the
  penalty in `getAttackRollMode`. Enforced (with plain-ranged-unit CONTROLs) in
  `factory-unit-abilities.test.ts` ("advantage overrides the ranged Combat
  penalty"). The Shaman's Puppet forced-disadvantage still beats advantage.
- Mechanics — all sides `mechanics-line-attack-1/2` ("Attack 2 spaces in a line",
  SECOND_ATTACK_BEHIND_TARGET); Few/Pack also `mechanics-repair-1/2` (repair an
  adjacent mechanical unit — Automatons/Dreadnoughts — the Pack falling back to
  +1 Attack). The Neutral guard has only the reach.
- Armadillos — Pack `armadillo-initiative-amplify` (AMPLIFY_INITIATIVE_INCREASE:
  any positive Initiative increase gets +1 more). Few/Neutral have no printed
  ability (genuinely `[]`, not a stub).
- Automatons — Pack `ignores-retaliation`; Neutral `automaton-detonate-1`.
- Sandworms — Neutral `sandworm-strike-again` (attack an adjacent target again).
- Bounty Hunters — Few/Pack `bounty-hunter-mark-1/2` (Mark the strongest enemy at
  combat start; +1/+2 Attack vs Marked units). Mark target selection is
  auto-resolved (deterministic), not a player prompt.

The former "STILL display-only" Factory hold-outs have since ALL been wired
(pinned in `factory-content.test.ts` "every former Factory display-only stub is
now an implemented, engine-wired ability", behaviour + CONTROLs in
`factory-gold-abilities.test.ts`):
- Automaton Few — cube-scaled Detonate → `automaton-place-cube` +
  `automaton-detonate-cubes` (faction-cube subsystem).
- Sandworm Pack — cube-fuelled extra attack → `sandworm-cube-gain` +
  `sandworm-cube-attack`.
- Bounty Hunter Neutral — pre-emptive + ranged retaliation →
  `bounty-hunter-preemptive` (`PREEMPTIVE_RETALIATION`).
- Couatl Few/Pack — activated invulnerability until next activation →
  `couatl-invulnerability-few` (ends the turn) / `-pack` (free); Couatl Neutral
  genuinely has no printed ability.
- Dreadnought Few/Pack/Neutral — splash allocation instead of attacking →
  `dreadnought-splash-1` (1/1, up to 2 units) / `dreadnought-splash-2` (2/1/1,
  up to 3).
No Factory unit side is display-only anymore.
Factory buildings use the real thelazy.net PC building art and are wired to their
shared archetype effects (`factory-content.test.ts` "ships the 7 board-game
buildings…"); the PC-only special buildings (Mana Generator spell-points, Grail
Lightning Rod, Pen horde) are NOT modeled as distinct effects.

This section is maintained by hand, but the rule #3 enforcement test now
exists (`src/data/factions/ability-text-enforcement.test.ts`): the machine
truth is `DISPLAY_ONLY_ABILITIES` (currently EMPTY — no unit side is
display-only) plus `ENGINE_RULE_WIRED_ABILITY_TEXT` (currently exactly
`neutral.skeletons#neutral`, whose Necropolis-reinforce text runs as a
dedicated rule, not an ability tag). Re-verify any prose claim here against
those registries and `src/data/factions/units.ts` before trusting it. The
Creature Bank system tracks its own display-only items in the section below.

## Morale Cards (Battlefield expansion, OPTIONAL rule) — what runs vs. printed nuances

Lobby option `GameSetupOptions.moraleCards` (default OFF). With it on, every
morale gain/loss draws from two shuffled decks instead of using the ±1 token
(regular-game rules from the expansion rulebook: DRAW 1, not the expansion
modes' Search (2)). Data in `src/data/cards/morale.ts` (crops from the provided
contact sheet); engine in `src/engine/morale-cards.ts` plus wiring in
`reducer.ts` / `adventure-reducer.ts` / `adventure.ts` / `legal-actions.ts`.
Behaviour is pinned in `src/engine/morale-card-effects.test.ts` (observable
outcomes with CONTROLs) and `morale-cards.test.ts` (gain flow).

Leading with what does NOT run:
- **`morale.positive.replace_adventure_card` and `morale.negative.put_token`
  are never in play.** Both print the expansion's Battlefield Symbol, and the
  rulebook removes/ignores such cards in regular games ("Adventure cards" and
  the unit-borne morale marker exist only in its Adventure/Skirmish modes).
  They are excluded from the shuffled decks via
  `BATTLEFIELD_ONLY_MORALE_CARD_IDS` (definitions stay, `not-implemented`, with
  the exclusion pinned in `morale-card-effects.test.ts`). The regular decks are
  therefore 9 positive / 8 negative.
- **"Combat Power" clauses are inert in regular games** (the roll exists only
  in the expansion's Adventure mode): `combat_bonus` offers only its +1 Attack /
  +1 Defense picks, and `next_roll_minus_one` can only come first on an Attack
  or Defense (Defend-die) roll. Both documented at the definitions.
- **`morale.positive.remove_token` is a documented engine reading**: the
  printed marker is Battlefield-mode-only, so in regular games it removes one
  NEGATIVE combat token (Weakness/Corrosion/Paralysis) from an own unit.
- Deck exhaustion with every card face-up is a silent no-op gain (rare:
  positive is capped at 2/player; the rulebook's fall-back-to-tokens is NOT
  modeled). Map-side attack-die rolls (Scholar) deliberately don't trigger
  `reroll_plus_one`; the Leprechaun event pool roll deliberately doesn't
  trigger `roll_one_less` (the event, not the player, rolls it).

Rulebook flow (all engine-enforced): positive gain cancels a held Negative
card first, else draws; **negative gain is absorbed by discarding a held
Positive card first** (oldest, deterministic), else draws face-up; a resolved/
cancelled/absorbed card always returns to the BOTTOM of its deck (no morale
discard zone — the legacy discardPile only reshuffles in for old snapshots);
held cards are public (face-up beside the hero) so player views never mask
them; positive cards cap at 2 (discard-down choice). Negative cards resolve
automatically the first time their printed situation occurs; only
`skip_activation` keeps re-rolling (one Attack die before each of the holder's
activations, -1 skips) until it actually skips, exactly as printed.

Wiring map (positive): `combat_draw` at combat start; `reroll_die` a reroll
source; `set_attack_die_plus` a SET source in the same window (never spent by
a plain reroll — `AttackRerollSource.setDieFace`, `REROLL_PENDING_CHOICE
.useSetDie`). `reroll_die` is ALSO offered on the holder's own MAP dice —
the Resource/Treasure result windows plus the Scholar and Sea Chest/Jetsam
Attack-die branch rolls (`moraleRerollCardOption` in adventure.ts, resolved
via the `CONSUME_MORALE_CARD` visit step) — standing in for the ±1 token's
"Reroll any Die you have thrown" while the rule is on; the Obelisk die (its
face locks once for every visitor) and the specific-face gambles (Satyr,
Leprechaun pool) stay out, and BOTH set-die cards stay combat/ability-roll
scoped ("best/worst face" is undefined for a map branch table). Pinned in
`morale-card-effects.test.ts` ("Reroll a Die (map dice)", with straight-
through CONTROLs). Both — plus the generic "Reroll a die" artifacts (Cards of
Prophecy, Diplomat's Ring, Ambassador's Sash) and the positive morale token —
are ALSO offered on an ABILITY's own roll (Death Stare, the Thunderbird/
Wyvern extra die, extra-die Paralysis, the Ghost Dragon knock-back) via the
ability-roll reroll window: the same `ATTACK_DIE_REROLL` pending choice with
an `abilityRoll` context. A reroll re-throws ALL that ability's dice
(whole-roll, like Bron's), the set-die flips the die that most helps the
ability's SUCCESS WINDOW (a Death Stare wants "-1"s, not high faces), and the
kept roll resumes the post-attack follow-up tail exactly where it paused
(`runPostAttackFollowUps` step table — its order is serialized in the choice,
keep it stable). Attack-roll-specific pools (unit reroll abilities, the Ammo
Cart, Luck/Fortune/Mirth effects) deliberately stay OFF ability rolls; rolls
that fire mid-resolution (the Dwarven resistance die, the defensive soak, the
Medusa retaliation gaze, the skip-activation check) cannot pause so they get
no window. All pinned in `ability-dice-events.test.ts`.
`redraw_hand` via `SPEND_MORALE redraw`; `combat_bonus` /
`remove_token` via `SPEND_MORALE combat-bonus / remove-token` during the
holder's own combat (offers in `addMoraleActions`, buttons in the hand panel).
`combat_bonus` (the +1 Attack / +1 Defense combat-long buff) is ALSO offered as
an instant-window reaction inside an open attack window (`getLegalReactionsForTrigger`
on `UNIT_ATTACK_DECLARED`; the +Attack pick is withheld only on the player's own
Misfortune-locked attack), so a defender can add +1 Defense in response to an
incoming hit; the window refreshes after the spend (`refreshReactionWindowLegalReactions`
in the `SPEND_MORALE` dispatch) so the used card drops out — pinned in
`morale-card-effects.test.ts` ("is playable as an INSTANT-WINDOW REACTION");
`repeat_search` opens a post-Search offer (`morale-repeat-search` choice —
discard the gained card, re-run the same Search (X); the gained card is masked
from other viewers in `player-view.ts`). (Negative): `search_one` forces the
next 2+-card shared-deck Search to 1 (`revealSharedDeckSearch`);
`set_attack_die_minus` flips the holder-worst die of the next attack roll —
and of the holder's own post-attack ABILITY rolls (Death Stare & co., where
"worst" is judged against the ability's success window, so it may be a no-op
flip on a stare that already shows "-1"s);
`next_roll_minus_one` latches -1 onto the next attack roll (stack modifier,
survives window rerolls) or Defend-die roll, whichever first — deliberately
NOT onto ability rolls (the card names Attack/Defense/Combat-Power ROLLS);
`roll_one_less` drops one die from the next 2+-dice Treasure roll (incl. the
Crypt gamble), 2+-dice Attack roll (advantage/disadvantage collapse to one
straight die — mandatory even where that helps, e.g. under disadvantage or the
Crypt's experience-face gamble) or the 2-dice Death Stare (one lone die then
petrifies — mandatory-even-when-it-helps again); `reroll_plus_one` forcibly
rerolls the holder's next "+1" Attack die (attack rolls incl. window rerolls
and the just-set +1 of `set_attack_die_plus`, the Defend die, the
skip-activation check die, and EVERY ability die the holder rolls — the
post-attack rolls above plus the Dwarven resistance die, the defensive soak
and the Medusa gaze); `random_combat_discard` at combat start.
Ability-die curse behaviour is pinned in `ability-dice-events.test.ts`.

Presentation layer (pure UI over the wiring above, no engine change): every
`MORALE_CARD_DRAWN`/`_USED`/`_DISCARDED` event pops the `MoraleCardOverlay`
(card art + holder + a plain-words "what happened" line, gold vs red-shake
styling) on the map AND combat screens, with the converted H3
`effects/good-morale`/`bad-morale` sting — good/bad picked by whether the
moment favors the holder (a cancelled Negative card sounds GOOD, an absorbed
Positive sounds BAD), the positive-limit tidy-up stays a quiet feed line, and
the generic feed sound is suppressed for these events so nothing double-plays.
Cue builder + per-card hint/outcome texts in
`src/components/table/morale-card-cue.ts` (`morale-card-cue.test.ts`,
`morale-card-overlay.test.tsx`). In combat the `CombatMoralePanel`
(`combat-morale-panel.tsx`, extracted from page.tsx) lists the viewer's held
cards with live use buttons driven by the engine's `SPEND_MORALE` offers
(combat-bonus / remove-token / redraw; hint text for cards whose use is
offered elsewhere, e.g. the reroll window) plus the opposing fighter's public
held cards (`combat-morale-panel.test.tsx`); the map `MoraleCardsDock` also
shows other seats' held cards.

## Parallel turns (OPTIONAL house rule, multiplayer only) — what runs vs. limits

Engine in `src/engine/parallel-turns.ts` (predicates, the stop/collapse, the
transactional bystander guard) wired through `adventure-reducer.ts` (END_TURN /
movement / rotation chaining), `legal-actions.ts` (open-turn gating + the
bystander quiet-action set), `reducer.ts` (the applyAction fingerprint backstop)
and `adventure.ts` (`flagField` steal hook, quiet-filtered reachable paths).
Lobby option `GameSetupOptions.parallelTurns` (0 = off, 1–12 rounds; Game
options UI). Behaviour is pinned in `src/engine/parallel-turns.test.ts` — every
claim below has a test that fails if the wiring is removed, each with an
ordered-mode or unowned-target CONTROL.

- While `turn.mode === "parallel"` every live player's turn is open at once:
  move, build, refresh, end turn independently; the round wraps when everyone
  has ended (`turn.completedPlayerIds`, reused from the sandbox machinery).
- The exclusive interaction machinery stays a strict SINGLETON (one combat, one
  pendingChoice/visit/tile rotation/Necromancy window at a time). While one is
  open for player A, everyone else gets ONLY the quiet set: steps onto "open"
  (trigger-free) fields, the start-of-turn hand steps, and — outside combats —
  town/morale actions (which queue/park, never interrupt). Everything else
  (visits, discoveries, battles, card plays, searches, END_TURN) waits with a
  "wait until …" rejection. Safety is transactional, not enumerative: a
  bystander action that touches the interaction fingerprint
  (`parallelSlotSignature`) is rejected WHOLE in `applyAction`, so a
  mis-classified action can only fail cleanly, never corrupt an open battle.
- Shared-deck draws are therefore strictly first-come-first-served (arrival
  order through the single reducer + the reward-queue FIFO) — no card can be
  handed out twice; round-start effects (income, Events, Astrologers,
  start-of-turn hand dividers) resolve clockwise from seat 1 exactly like
  ordered play. `pumpAdventureQueues`' start-turn-hand divider requeue ignores
  other dividers (N players queue N dividers — they must not chase each other
  forever). Round 1's forced home-tile rotations chain one at a time in seat
  order (`beginNextPendingStartTileRotation`). A round that draws an **Event or
  Astrologers proclamation** raises the round-start EVENT BARRIER
  (`adventure.eventResolution`): the whole table pauses to resolve the event
  FIRST — even the quiet set is off, no seat may move/draw/build until every
  player has resolved it — then normal play resumes (see the Event-deck section).
- The mode STOPS — `PARALLEL_TURNS_STOPPED` warning to the whole table, then
  classic one-at-a-time turns forever — when (a) a PvP battle starts
  (`startPlayerCombat` / the garrison prompt), (b) a serious PvP interaction
  resolves: taking a flag FROM a live player (`flagField` chokepoint — covers
  walking onto an enemy mine/settlement/town AND the View Earth capture; hand
  discards are deliberately NOT serious), or (c) the chosen period ends. On a
  PvP stop the aggressor becomes the active player and the battle resolves
  normally; players who had already ended stay ended (the rotation skips them,
  wrapping only when nobody live still owes a turn) and nobody's start-of-turn
  re-runs mid-round (no second mandatory draw).
- Deliberate LIMITS (documented, not bugs): only ONE battle can run at a time
  (the physical game has one battle board) — a second fight, and any visit or
  card play, waits for the open interaction; town actions stay blocked during
  combats exactly like ordered play. Ordered games (`parallelTurns` 0/absent),
  solo tables and legacy snapshots are untouched — every parallel predicate
  no-ops when the mode is off.

## Undo moves (OPTIONAL debug/testing mode, default OFF) — what runs vs. limits

Lobby option `GameSetupOptions.undoMoves` (Game options → Mode & Rules, default
OFF). Purpose: manual testing / bug-hunting — with it ON a player may roll the
whole game back to the state before a recent action. NOT a normal-play feature.
Engine flag frozen onto `adventure.undoMoves` at setup; the history + restore
live entirely SERVER-SIDE in `src/server/undo-history.ts`, wired into BOTH
backends (`submitRoomAction` in `game-room-store.ts`; the PartyKit edge's
WS `onMessage` + HTTP POST action paths in `party/index.ts`). Behaviour pinned in
`src/server/undo-history.test.ts` (module + built-in store, with CONTROLs),
`src/server/undo-history-edge.test.ts` (the PartyKit `onMessage` path, real
harness), `src/components/adventure/undo-button.test.tsx` (map HUD button renders
ONLY under the option) and `src/components/adventure/game-options-tabs.test.tsx`
(the lobby toggle). Each guardrail has a failing-if-removed CONTROL.

Leading with what does NOT run / deliberate limits:
- **Default OFF = ZERO behaviour change.** With the option off/absent (every
  legacy snapshot) no snapshot is ever recorded and an `UNDO_MOVE` action is
  rejected ("Undo mode is off for this game."). Pinned with CONTROLs on both
  backends.
- **The undo history NEVER enters GameState** — it is a bounded per-room stack of
  full pre-action serialized snapshots kept in the `undo-history` module's
  in-memory Map alone. It is never broadcast, never serialized into a room
  snapshot, and never reaches a player view (no hidden-info leak, no snapshot
  bloat). Only the public `MOVES_UNDONE` feed line (player + count, no secrets)
  rides in `eventLog`, so every rewind is visibly announced (feed + warning cue),
  never silent.
- **Bounded to the last `UNDO_HISTORY_LIMIT` (10) actions**, oldest dropped.
- **WHO may undo**: any current member of the room (open/legacy table → anyone;
  hosted table → a member matched by verified `userId` first, else per-tab
  `clientId`). Justification: the whole table opted into the debug toggle and the
  feed line keeps it visible; a non-member is rejected ("Only a member of this
  room can undo.").
- **WHAT is one undo step**: one human action applied through the server action
  transaction. Restore is a WHOLE-state swap, so undoing across an open combat /
  pending choice / reward queue rolls them all back atomically (no replay). In
  single-player, AI pump steps that ran between two human actions roll back
  together with the preceding human action (they are not their own undo points);
  after a restore the paced pump is re-derived (`cancelComputerPump` +
  `ensureComputerPump`) so it re-arms iff the restored state still owes a move —
  an undo around a computer turn cannot leave the pump frozen.
- **Seeded RNG**: a redone action reproduces the same server entropy per action,
  so a redo re-rolls the same dice — expected, not a bug.
- The history is cleared on room close / reset / ranked force-close (both
  backends). On the PartyKit edge it also does not survive Durable Object
  hibernation/eviction (it is in-memory) — a documented limit acceptable for a
  debug aid.

## Single player vs computer opponents (EXPERIMENTAL) — what runs vs. limits

Menu → Single player → `/single-player` mints a PRIVATE room (128-bit `sp-` id,
never in any lobby directory, never MMR/match-reported, no AFK votes or turn
clocks; only the first owner may join — engine-enforced in `joinRoom`). One
human (`p1`) plus 1–3 computer seats (`state.controllers`, persisted;
`sessionMode: "single-player"`). Engine in `src/engine/computer/*`, server pump
in `src/server/computer-runner.ts`, wired into BOTH backends' action
transactions (store `submitRoomAction`; PartyKit WS+HTTP paths) after the AFK
settle. Plan/contract: `docs/single-player-computer-opponents-plan.md`; tests:
`computer-runner.test.ts`, `single-player-live.test.ts`,
`single-player-combat-resolve.test.ts`, `single-player-privacy.test.ts`,
`window.test.ts`, `control.test.ts`, `computer-move-replay.test.ts`,
`hero-position-override.test.tsx`, `map-navigation.test.ts`,
`army-strength.test.ts`, `computer-battle-report.test.ts`,
`opponent-turn-overlay.test.tsx`, `single-player-pump.test.ts`.

- **The paced pump is alarm-safe and self-healing (production freeze FIXED).**
  On the deployed PartyKit edge the pump runs on Durable Object alarms, and
  PartyKit THROWS on any `Party.id` read inside `onAlarm` — the old handler
  read `this.room.id` when stamping the new snapshot, so the FIRST alarm tick
  crashed, the alarm was never re-armed, and every deployed AI froze after its
  first visible step ("keeps saying it's taking a turn", "sits on a tile
  rotation forever"). `onAlarm` now uses the snapshot's own `roomId` (and
  `metric()` goes through `roomIdSafe()`), and BOTH backends self-heal a lost
  pump: the edge re-arms in `onConnect`, on EVERY inbound socket message (the
  client health-pings after ~35s of silence, so a frozen table revives without
  a reload) and on the HTTP GET poll — all via `ensureComputerPump` (only when
  no alarm is pending — never postponing a due tick); a THROWN alarm tick
  (storage/broadcast hiccup) logs and re-arms at a 5s retry pace instead of
  letting Cloudflare's few retries exhaust the chain; the built-in store
  re-arms on `subscribeToRoom` / `restoreRoom` / the GET snapshot route (its
  setTimeout dies with the process). Pinned in `single-player-pump.test.ts`
  with a PartyKit-faithful harness whose `room.id` getter throws while
  `inAlarm`: the whole-AI-turn alarm-loop test fails if the `this.room.id`
  read comes back, and each self-heal / failed-tick re-arm test fails if its
  wiring is removed (mutation-checked). `single-player-edge-start.test.ts`
  additionally plays the WHOLE game start (room creation marker → faction pick
  → START_ADVENTURE → round 1 → round 2) through real alarm ticks with COLD
  wakes (a freshly-evicted object on every third tick) and both alarm-banned
  properties (`Party.id`, `Party.context.parties`) throwing.
  DEPLOY NOTE: `party/index.ts` reaches production ONLY via
  `npm run deploy:partykit` — a Vercel deploy alone leaves the old edge (and
  its frozen-AI bug) running.
- **The pump no longer stalls on a "no measurable progress" action (the REAL
  game-start freeze).** Distinct from the alarm-crash above: `driveComputerPlayers`
  compares a `progressFingerprint` before/after each applied action and, if it
  is unchanged, used to STALL the whole pump immediately — so the AI turn froze
  ("says it's taking its turn and does nothing") whenever the policy's top pick
  was a fingerprint no-op. Two fixes, each mutation-checked in
  `computer-runner.test.ts`: (1) `progressFingerprint` now captures the
  combat-pause identity (`combat.pendingNeutralStep` kind/unit/reactor,
  `combat.pendingNeutralPlacement`, and per-unit `reactionPauseAcked`) — a
  `CONTINUE_NEUTRAL_STEP` that resumes a "pre-activation" reaction pause only
  clears that pause and acks the unit (activeUnitId/positions unchanged), so
  without this the real step read as no-progress; this was hit in
  computer-vs-computer PvP and neutral fights right at game start. (2) On a
  no-progress-but-no-error apply the runner now DISCARDS that candidate (it is
  already in `attempted`) and tries the next legal action instead of stalling,
  reaching the explicit "no safe legal action" stall only when every candidate
  is exhausted (bounded: `attempted` grows, the legal set shrinks, `maxSteps`
  backstops). Reproduced pre-fix at ~2-3% of game starts with 1–3 opponents;
  360+ real-game starts clean post-fix.

Leading with what does NOT run (deliberate limits):
- **Objective-seeking, fighting map play — with limits.** The policy now plays a
  real map turn: it builds/recruits (already scored in `map-policy.ts`), and its
  hero MARCHES toward the nearest worthwhile objective instead of wandering, via
  an unbounded multi-source BFS distance field from the objectives
  (`src/engine/computer/map-navigation.ts`, `objectiveDistanceField`) — a step is
  scored by how much it shrinks that distance, so the potential strictly
  decreases and the hero never oscillates (the old "back and forth" bug; pinned
  in `map-navigation.test.ts` "stops wandering"). Objectives are unowned
  towns/flaggable/visitable fields, **beatable neutral guards** and **beatable
  enemy heroes**. Guard engagement is grounded in the engine's own Quick-Combat
  rule — `canBeatGuardedField` engages when `neutralBattleLevel >= difficulty`
  (a strict `>` is a guaranteed Quick-Combat win, `==` an even fight it takes);
  a guard above the hero's level is avoided (no drawn-guard strength read yet).
  Enemy-hero (PvP) engagement is gated by an army-strength comparison
  (`src/engine/computer/army-strength.ts`, `shouldEngageEnemy`, ratio 0.85 — "not
  afraid" of a roughly even trade); the real combat is still dice-resolved, so
  luck decides the actual outcome. Exploration toward face-down tiles, known
  Creature-Bank strength reads (`canBeatCreatureBank`), free re-flag of enemy
  mines, and garrison assault of enemy towns when army-comparable are all
  wired. When no objective is reachable the hero ends its turn (no wandering).
  Event / Astrologers visit menus and post-combat gates (Necromancy skip,
  Commander First Aid, settlement income, auctions with modest bids, place-
  creature-bank, garrison defend-when-funded) are scored so the runner never
  freezes on a computer-owned exclusive window — pinned in
  `visit-event-policy.test.ts` and `computer-runner.test.ts` ("Events /
  exclusive visits"). A critical latent bug is fixed: a finished combat parks
  the game in the `"game-over"` phase until it is acknowledged, and
  `computerDecisionOwner` used to short-circuit on that phase — so the FIRST map
  combat the AI won froze the whole game. It now falls through to drive the
  fighter's `ACKNOWLEDGE_COMBAT_END` while a non-sandbox combat notice is still
  open (pinned in `computer-runner.test.ts` "marches into a neutral fight … and
  recovers", which stalls if the fix is reverted). Multi-round economy memory
  (`GameState.computerMemory`, sticky objectives + army/income/magic focus),
  advanced formation tactics (screen/backline placement, improving tactics
  swaps, focus-fire), and a fixed-seed multi-round soak + reconnect suite
  (`single-player-soak.test.ts`) are wired. STILL deferred: hide multiplayer-
  only invite/share affordances on the SP table page; optional nightly long soak.
- **Expansion tempo, dwelling-first economy, crown & Power discipline,
  high-value combat trades** — all score-layer heuristics over already-legal
  actions (the engine rules are untouched, so nothing here can produce an
  illegal move). Map: the hero collects payoffs within this turn's walking
  reach first, but when every known payoff is out of reach it flips the
  face-down tile / places a held Ⅱ–Ⅲ supply tile instead of trekking
  (`explorationActionScore`); an adjacent doorway also out-values a distant
  leftover as the MARCH target, harder still when no beatable fight exists
  anywhere (post-loss recovery — the boost keeps a beaten army expanding
  instead of parking), and the sticky march objective is cleared on every
  `ACKNOWLEDGE_COMBAT_END` so a LOST fight forces a fresh plan (pinned in
  `map-navigation.test.ts` "expansion push …" + `memory.test.ts`). Economy:
  while saving for the Silver/Gold dwelling, side buildings that would eat the
  dwelling fund wait (mirror of the recruit treasury guard), and Spell-Book /
  Magic-University purchases wait for the army core plus Wisdom-in-hand or
  surplus gold (`development.test.ts`). Cards: the round's LAST crown is never
  spent on a map convenience (basic twin wins; combat saves/stats/damage still
  spend it — `expertCrownNudge`); a +1-Power discard on a pending damage cast
  is paid only when it moves the printed ladder, stops once the hit is lethal,
  and pays up eagerly when one more Power converts the cast into a removal
  (`pendingSpellBoostImpact`); damage spells aim by the PRINTED ladder — spell
  damage is not reduced by Defense — so casts hunt the high-value unit and
  still finish a dying one (`card-policy.test.ts`, each with CONTROLs).
  Combat: a high-value unit in lethal reach Defends instead of a suicidal
  0-damage poke that invites a lethal retaliation (real strikes still always
  win; chaff keeps trading — `combat-policy.test.ts`). Every claim above is
  mutation-checked: removing the wiring fails the named test.
- **Home-tile drain + premium-economy rush** (map heuristics, engine untouched;
  each claim mutation-checked). Home tile: while the main hero still stands on
  its OWN tile Ⅰ and any sweepable payoff remains there, `primaryMapObjective`
  RESTRICTS the pool to those remaining home payoffs, so all three opening items
  (free symbol + guarded treasure + guarded income mine) are drained EVERY game
  before conquest / Far / sticky commits can pull the hero off — the old
  round-3 sweep cap is gone and home difficulty-1/2 guards stay engageable
  through the drain (`map-navigation.test.ts`). Premium economy — settlement /
  gold mine / valuables mine — waives the neutral-only opening refusals (it is
  the Far economy the expansion is FOR): the AI hits difficulty-3 of them ASAP,
  not afraid of unit losses, calibrated off the real `NEUTRAL_ARMY_TABLE`
  field-3 parties — three bronze **Packs** alone take lv3 on easy/normal/hard,
  Impossible (pure 3-silver wall) needs Packs + one silver body
  (`armyCoversPremiumEconomyGuard` / `premiumEconomyEngageCap`); a coverable
  premium fight outranks side neutrals and drives a multi-turn march before
  round 6, with resource need steering gold vs. valuables. A soft engagement
  unlock lets three bronze Packs + even one silver body reach the silver guard
  cap (the classic path still needs two silver bodies). Economy: true-surplus
  valuables (target + 2, e.g. a valuables mine) now sell for gold before the
  Gold dwelling instead of rotting, the last dwelling-needed valuable still
  protected (`map-policy.ts` `tradeUtility`, `market-policy.test.ts`). Pinned
  across `map-navigation.test.ts`, `army-strength.test.ts`,
  `market-policy.test.ts`, `visit-event-policy.test.ts` (the last also covering
  the already-shipped Polish sized-bank A/B chooser — the AI takes the best
  beatable rolled size, else leaves the field blocked).
- **Guaranteed first-battle wins (smoothing house rule)**: a computer seat's
  first TWO eligible neutral-guard battles are guaranteed flawless one-round
  wins — at the combat-start chokepoint (`finalizeCombatStart` →
  `applyComputerGuaranteedWin`, `src/engine/computer/guaranteed-wins.ts`) every
  guard falls before any unit acts, the AI army takes zero damage/losses, and
  the outcome resolves through the NORMAL victory path (XP by difficulty,
  Freelancer's Guild gold, guard-card recycling, field visit — all real; the
  human's battle recap shows a normal won fight plus the explicit
  `COMPUTER_GUARANTEED_WIN` event/feed line). Leading with what it does NOT do
  (the abuse guards — the map policy never reads the feature, so the AI cannot
  seek fights to exploit it): guard FIELDS only at difficulty I/II that the
  hero's own `neutralBattleLevel` already covers (the AI keeps its natural
  level-I-then-level-II ladder — level-II guards come from the II–III tiles it
  explores/places); Creature Banks, PvP fights, human seats, multiplayer
  sessions and PvP-Neutral-Control fights never qualify; Quick Combat
  (level > difficulty) resolves before combat opens and never consumes a slot;
  from the third eligible battle on the seat fights every battle normally. The
  per-seat counter persists on `GameState.computerGuaranteedWins`. Each claim
  (both wins, the limit, and every scope CONTROL) is mutation-checked in
  `src/engine/computer/guaranteed-wins.test.ts`.
- **Temp Empowered Attack/Defense cards (smoothing house rule #2)**: at the
  start of every NON-PvP combat a computer seat fights (guard fields AND
  Creature Banks), it draws 1 temporary Attack + 1 temporary Defense statistic
  card into hand, both Empowered for that fight (crown-free Expert — the ids
  temporarily join `player.empoweredAbilities`), and BOTH are removed from the
  game at combat end wherever they landed (hand/discard/deck) — never kept.
  The AI plays them through the normal reaction pipeline (the e2e test proves
  an Expert play with ZERO crowns). Never in PvP battles, sandbox fights,
  human seats, multiplayer sessions or PvP-Neutral-Control fights; a
  guaranteed-win fight injects nothing; a genuinely owned twin card and a
  pre-existing Empower mark survive the cleanup. Hook `finalizeCombatStart` →
  `applyComputerCombatBoost` (`src/engine/computer/combat-boost.ts`), cleanup
  at the top of `finalizeAdventureCombat`; tracked on
  `combat.computerBoost`. HONEST LIMIT: a seat eliminated mid-combat skips
  the cleanup (the dead seat's cards no longer matter). Mutation-checked with
  scope CONTROLs in `src/engine/computer/combat-boost.test.ts`.
- **Smarter map/card play (2026-07 pass)** — each claim mutation-checked:
  the start-of-turn refresh now VOLUNTARILY cycles junk (≤3 cards, only with
  real replacement supply; a Necropolis seat without a playable Necromancy /
  Vidomina specialty in hand digs harder — `mulligan-necromancy.test.ts`);
  playing Necromancy in the after-combat window now OUTRANKS
  `SKIP_NECROMANCY` (the old ~600-vs-1120 scores made the AI skip its faction
  engine after EVERY win — a real bug, same test file); tile rotations chase
  the NEEDED resource payoff (premium fields weighted by
  `premiumEconomyResourceBonus`, materials mines when the next dwelling needs
  materials — `map-navigation.test.ts` "chases the NEEDED resource payoff");
  a main hero with NOTHING beatable on the map STAGES adjacent to the nearest
  future fight instead of standing still turn after turn (`collectStagingObjectives`,
  entry still blocked while unbeatable — `map-navigation.test.ts` "fallback
  staging"); Legion vouchers are played for the discount in EVERY phase (held
  only while one voucher is outstanding) and Learning is priced as an A-tier
  climb engine below hero level 6 with the expert full-level pick preferred
  when a crown is spare (`legion-learning.test.ts`); a REVISIT_FIELD is noted
  in per-turn memory so a Stables (its +1 MP refunds the revisit cost) can no
  longer loop the runner to its 256-step cap (`memory.test.ts`). Gold-dwelling
  tempo is pinned in `single-player-premium-rush.test.ts`: on Normal, three of
  the eight fixed seeds build the Gold dwelling BEFORE round 9 (R7/R7/R8) and
  7/8 by R11 — floors 2 and 5; the map's premium-economy placement decides the
  per-seed ceiling, so an every-seed-before-R9 floor would be dishonest.
- **Free seizures & anti-parking (2026-07 sp-ai pass)** — each claim
  mutation-checked in `map-navigation.test.ts` (behavioural floors in
  `single-player-premium-rush.test.ts`): a level-covered difficulty-1 neutral
  is ALWAYS engageable (the establish-core / bronze-rush refusals now gate
  difficulty ≥ 2 only — no multi-turn park before an easy fight); unguarded
  mines / symbols / free towns within this turn's MP outrank a fair fight as
  primary (`freeSeizuresWithinReach`; premium-economy commits and strictly
  closer Quick-Combat freebies still divert — `fightOutranksFreeSeize`);
  the multi-source march scoops free pickups ONLY along the committed path
  (a pickup no farther from the primary than the hero — a nearer pickup in
  the OPPOSITE direction must never reverse the march); the keep-clear move
  penalty applies to LIVE guards only (`isFieldGuarded` — a black-cubed /
  own-flagged difficulty field is an ordinary corridor cell, not a wall);
  and an idle SECONDARY hero parked one cell ahead of the main inside a
  one-lane corridor sidesteps out (`ALLY_UNBLOCK_SCORE` — single-step moves
  can never end on an allied hero, so the blockade would otherwise deadlock
  the march for the rest of the game).
- **Computer battles resolve IMMEDIATELY and off-screen; movement is REPLAYED
  behind an accept-gate, with a battle recap.**
  The whole computer turn (movement AND its neutral/bank combats) settles inside
  the human's action transaction, so the human never watches an AI fight or waits
  on one — the settled response already carries the result. The ONE exception is
  a PvP fight (a computer attacking the human): the runner leaves that combat
  OPEN for the human to play (emergent from `computerDecisionOwner` returning
  null on a human-owned combat slot; pinned in
  `single-player-combat-resolve.test.ts`, AI-only-resolves vs PvP-stops-open).
  Because the turn settles at once, when it arrives the human is shown ONE
  prompt — the `OpponentTurnOverlay` (`src/components/table/opponent-turn-overlay.tsx`)
  — that first RECAPS each AI battle (win/loss + the reward claimed, built purely
  from the settled event log by `buildComputerBattleReport` in
  `src/components/table/computer-battle-report.ts`) and then, when the opponents
  also moved, gates the map replay behind an explicit "Watch their moves →"
  click. Only on accept does the client REPLAY each computer hero's walk SLOWLY
  (`REPLAY_STEP_MS` = 900ms, deliberately slow), one cell at a time, one hero at
  a time: `computer-move-replay.ts` (`buildComputerMoveReplay` filters to
  computer heroes and orders the frames; `useComputerMoveReplay` paces them),
  rendered via a `heroPositionOverrides` prop on `HexMapBoard` (the pawn draws at
  the replay cell) plus a "Computer N is moving…" badge. Nothing on the map
  animates until the human accepts, so no opponent moves behind their back. It is
  PURE PRESENTATION over the already-authoritative state — it never gates rules
  progression — and is cancelled the instant the human acts or a combat opens
  (including a PvP fight the AI opens, which clears the overlay and drops the
  human straight into the defense). A human's own move keeps its instant path
  arrow. Pinned in `computer-move-replay.test.ts`,
  `hero-position-override.test.tsx`, `computer-battle-report.test.ts` and
  `opponent-turn-overlay.test.tsx`. Deeper presentation (a per-decision think
  delay / server-paced intermediate broadcasts) is still deferred.
- Computer actions use trusted in-process authority
  (`ReducerOptions.computerActorPlayerId`, never client-deserializable); a
  client cannot forge a computer-seat action, and `ASSIGN_SEAT` refuses
  computer seats (one-human invariant, reasserted on EVERY lobby seat resize in
  `resizeLobbySeats`).
- Anti-freeze: `computerDecisionOwner` returns a seat only for a REAL owed
  window (wait-vs-drive: human-owned interactions and open combats make bots
  wait, never a false stall); the runner has per-fingerprint retry dedup, a
  no-progress guard and a 256-step cap — a stall logs and persists progress.
- Rematch ("New adventure", no vote needed) preserves the single-player session
  + seat count on both backends; an ESTABLISHED room can never be reset-flipped
  into single-player (fresh memberless lobbies only — the PartyKit implicit
  creation flow via the first connection's `?singlePlayer=` marker).

## PvP Neutral Control (OPTIONAL mode, multiplayer only) — what runs vs. limits

Lobby option `GameSetupOptions.pvpNeutralControl` (default OFF, Game options
"play" tab; multiplayer only — a solo table never gets it), with the
`pvpNeutralControlMustAttack` sub-toggle (default ON). With the mode on, every
NEUTRAL combat (guard fields AND Creature Banks) plays like a PvP battle: the
NEXT live player clockwise from the fighter — `neutralCombatControllerId` in
`src/engine/neutral-control.ts`, derived from the live-only `turnOrder` so
eliminations hand the guards to the next seat (or back to the AI) automatically;
NOT related to the WOG Commanders module — PLAYS the Neutral units. The engine
pump stops on each guard's activation exactly like on a PvP unit's, and that
player drives it with the normal unit actions (offered by
`addControlledNeutralUnitActions` in `legal-actions.ts`, executed AS the neutral
seat via `asNeutralSeatCommand` in `reducer.ts` so attack attribution,
retaliation and friendly checks match the AI pipeline verbatim). They also break
the guards' activation-order ties (`advanceActiveUnit`) and answer every
Neutral-owned decision the fight opens — ability follow-ups (Lich/Magog splash
targets, Magic Mirror redirect), attack-die reroll windows, and the guards'
"[activation]" ability choices (Enchanter heal pick, Faerie Bolt target, via
`maybeOpenPlayerActivationChoice`) — the pump re-stamps any NEUTRAL-owned
pendingChoice to the controller instead of auto-resolving. The controller is
notified (`NEUTRAL_CONTROL_ASSIGNED` event → feed line + a controller-only
overlay). Behaviour pinned in `src/engine/pvp-neutral-control.test.ts` (each
claim with a mode-off / wrong-seat CONTROL).

Leading with what does NOT run / deliberate limits:
- **The War Zealot Magic Mirror still auto-USES** (the printed reflect is read
  as always-on; declining is never right) — but its redirect TARGET pick goes
  to the controller like every other follow-up.
- **Token "other actions" (Ogre Bloodlust / Sorceress Weakness,
  `PLACE_TOKEN_ACTION`) ARE offered on the controller's FREE-mode menu** (user
  rule "mode free: do whatever" / "use token"; `addControlledNeutralTokenActions`):
  the offer is issued for the controlling seat and re-stamped to the neutral seat
  (`asNeutralSeatCommand` now also wraps `USE_UNIT_ABILITY`), and the target-pick
  choice it opens is a NEUTRAL-owned choice the pump hands back to the controller
  — exactly like the guards' [activation] follow-ups. They are NOT offered in
  MUST-ATTACK mode ("cant … use token"). The deck-digging (Genie Wish) and Summon
  Demons other-actions stay OFF a controlled guard on every menu — they read the
  CONTROLLER's own deck / removed units, not the neutral side, so handing them
  over would be a bug/exploit, and the AI never used them. Passive/triggered
  abilities still fire normally.
- **The IN-COMBAT menu is IDENTICAL for a normal guard FIELD and a Creature
  BANK** — both obey the `pvpNeutralControlMustAttack` toggle (must-attack: a
  bank guard must attack too; free: "keeps its corner as start but can do
  whatever it wants", token included). Banks differ ONLY in the pre-battle SORT
  below.
- **Pre-battle formation SORT** (`combat.pendingNeutralPlacement`, user rule
  "sorting or moving neutral formation before battle, just like defender"): on a
  normal guard FIELD, once the neutral army is revealed and auto-placed, the
  controller gets a setup window (`PLACE_NEUTRAL_GUARD` to move a guard to an
  empty defender cell or swap two guards within the defender zone;
  `FINISH_NEUTRAL_PLACEMENT` to start the battle — then Tactics, then round 1) —
  offered whenever ≥2 living guards stand (mirrors the Tactics threshold). A
  **Creature Bank CANNOT sort** — its guards keep their fixed corner deployment
  (`placeCreatureBankGuards`), so no sort window opens.
- **Berserk and the Astrologers Werewolf frenzy override both toggle modes**
  (the spell/frenzy menu binds a controlled guard exactly like a player unit).
- The continue-or-retreat window, the pre-activation reaction pause (which no
  longer previews an intent under this mode — a human hasn't decided yet; the
  pause can coexist with the controller's open choice, each resolving
  independently) and every reward stay the FIGHTER's, exactly as before.
- The mode never changes `unit.controllerId` — guards stay the NEUTRAL seat's
  for rewards, win/loss and every rules read; only the acting SEAT differs.

The `pvpNeutralControlMustAttack` sub-toggle (applies to normal guard FIELDS AND
Creature Banks alike — the bank differs only in the no-sort setup, above):
- **ON (default, rulebook spirit)**: a guard that can strike now gets ONLY its
  attacks (no Defend, no token, no move, no hold); one that can reach a strike by
  moving gets only those landing cells; otherwise only steps that strictly CLOSE
  the walked distance to some enemy — no wandering to run down the neutral round
  limit; hold only when boxed in.
- **OFF**: the controller plays the guards with NO constraint — the full PvP
  menu (move anywhere legal, attack, defend, hold after acting) PLUS the token
  "other actions" (Bloodlust / Weakness) — "do whatever".

Cross-mode seams (each pinned):
- **Parallel turns**: the controller IS a participant of the open fight
  (`parallelInteractionBlocker` returns null for them), so their unit commands
  and answers pass the bystander fingerprint backstop; every other seat stays a
  plain bystander.
- **Turn clock**: the fighter's 10-minute clock pauses while the guards' slot
  (or a controller-owned choice) is open (`turnClockPausedFor`); the controller
  has no clock of their own — a staller is removed by the AFK vote / idle-kick
  path, whose driver can now play a dropped controller's guard slot out with
  default unit commands and default-answer `CHOOSE_ABILITY_TARGET` /
  `CHOOSE_PENDING_ROLL` (both added to `RESOLVING_ACTION_TYPES`, `afk-drop.ts`).
- **Elimination**: `eliminatePlayer` hands a dead controller's open
  neutral-side choice BACK to the NEUTRAL seat (`isNeutralSideCombatChoice`)
  instead of dropping it mid-attack; the next action's pump re-stamps it to the
  new next-clockwise seat, or the AI resolves it when nobody live remains.

Mode off / solo / legacy snapshots: the rulebook Neutral AI plays the guards
unchanged (`executeNeutralActivation`), with the fighter breaking its ties and
picking its landing cells exactly as before.

## Multiplayer ladder & turn discipline (MMR, quit penalty, 10-min turns) — what runs vs. limits

Leading with what does NOT run: a game that never reaches a winner (every seat
walks away before anything triggers the last-standing win) reports nothing; OPEN
tables are never recorded (their members hold no seats, so results cannot be
attributed); a turn-clock pause forgives the seat's WHOLE 10-minute budget
(fresh stamp), not just the paused interval; and the timeout/auto-kick triggers
are CLIENT-fired (server-validated) — with zero connected clients nothing fires,
which is fine because nobody is waiting.

- **Every finished win/loss is RECORDED; only a RANKED game moves MMR.** All
  victory modes funnel through `declareAdventureWinner` (conquest, grail,
  dragon-hunt, dragon-conqueror, last-faction-standing after eliminations/
  give-ups/AFK kicks), so `detectFinishedMatch` (`src/server/match-report.ts`)
  reports them all on a hosted table with ≥2 verified accounts, a winner AND a
  loser — **including a NORMAL/casual table** (`room.ranked === false`), so a
  give-up or quit shows up as a win/loss on the profile even in a casual game.
  The match carries a `ranked` flag: `recordMatchResult` bumps wins/losses/
  matches for every reported game but recomputes Elo ONLY when `ranked` (a
  NORMAL game leaves every rating untouched — pinned with W/L-moves-MMR-doesn't
  tests on both account backends AND the `/api/matches/report` route). Elo is
  winner-takes-field (`accounts/elo.ts`); "abandon" scores as a loss on BOTH
  account backends. An absent `ranked` flag (legacy rooms) stays ranked.
- **Losing or quitting loses points.** `buildAdventureFromLobby` freezes
  `room.matchSeats` (seat → account) at map build; at game end the reporter
  unions that snapshot with the live members, so LEAVE_ROOM, stepping down to
  observer or a host kick mid-game is reported as **abandon** instead of
  vanishing. A replacement account seated mid-game gets the seat's real result;
  the deserter still gets the abandon. Pinned in `match-report.test.ts`
  (leaver / stepped-down / replacement / winner-seat cases, with a no-snapshot
  legacy CONTROL proving the snapshot is what closes the quit-to-dodge hole).
- **All time controls are CLOSED-table only** (`timeControlsActive(state)` =
  `Boolean(state.room?.hosted)`, `afk.ts`). The AFK vote-kick, the 30-minute
  certain auto-kick AND the 10-minute per-turn timer run ONLY on a CLOSED
  (hosted) table — the ranked/serious mode. An OPEN table is the casual /
  single-browser mode and carries NO time pressure at all: nobody is voted out,
  auto-kicked or force-shifted for taking their time (user rule "remove all time
  constraint in open game, keep it in closed game"). Gated at the source —
  `startAfkVote` / `forceAfkKick` throw on an open table, `turnClockRunningSeats`
  returns `[]` — and in the UI (the `AfkVotePanel` renders nothing on an open
  table). A table later hosted picks the clocks up on its next action. Pinned
  with open-table CONTROLs in `afk-vote.test.ts`, `turn-timeout.test.ts`,
  `overlays.test.tsx`.
- **10-minute turn budget** (`TURN_TIME_LIMIT_MS`; engine in `afk.ts`,
  `afk-drop.ts`, `resolveTurnTimeout` in `adventure-reducer.ts`): even an
  actively-clicking seat gets 10 minutes per OPEN turn (`afk.turnOpenSince`,
  maintained by `applyTurnClockBookkeeping` on every server-stamped action;
  ordered AND parallel modes). The clock PAUSES (re-stamps, checked on BOTH
  sides of each action), and thereby RESETS on exit, while the seat is blocked:
  **ANY open battle it is in** (the fighter's OWN neutral combat, a PvP battle,
  or a PvP-Neutral-Control guard slot — user rule "the 10-minute limit resets
  when in battle", so combat time never eats the map-turn budget), another
  seat's exclusive interaction, or the round-start event barrier. On expiry any
  live client fires `FORCE_TURN_TIMEOUT` (the server re-checks its own clock
  and the pause state); the shared forced-resolution driver then
  default-resolves the seat's pending inputs, retreats any still-open fight (a
  safety net — a battle pauses the clock, so a timeout cannot normally arm
  mid-fight), and ends the turn through the normal `endTurnAdventure` —
  Pandora/Logistics end-turn prompts and the no-base elimination clock run
  exactly as if End Turn was pressed by hand. The player is NOT eliminated (the
  AFK vote / 30-minute kick remain the removal path), driver-issued auto-answers
  do NOT refresh the target's AFK idle clock, and force-ending the LAST open
  parallel turn wraps the round WITHOUT consuming the seat's fresh next turn.
  Pinned in `turn-timeout.test.ts` (a NEUTRAL fight pauses-then-times-out-off-map
  CONTROL, plus too-early / paused / wrong-seat / open-table CONTROLs); the
  countdown chip + client auto-fire live in `overlays.tsx`
  (`overlays.test.tsx`).
- **Who is here / who joined.** A genuinely NEW `JOIN_ROOM` announces itself —
  a forced system chat line plus a feed toast — with verified accounts named
  by nickname and guests honestly labeled "guest — name"; reconnects/rebinds
  re-emit the event with `newMember: false` and stay silent so refreshes never
  spam (`room-membership.test.ts`, `chat.test.ts`). The lobby directory carries
  a bounded per-room roster (host first, guests dashed + labeled,
  `MAX_DIRECTORY_MEMBERS`) so players can see who is in which room — and who
  hosts it — before joining (`lobby-registry.test.ts`).
- **Public profiles.** `GET /api/players/[nickname]` (rate-limited; banned →
  404) serves the PUBLIC profile — rating, W/L record, member-since, the
  owner-editable contact fields, never the email — and `/players/[nickname]`
  renders it, linked from Hall of Fame rows and verified room-member names
  (`account-store.test.ts` "looks up a PUBLIC profile by nickname").
- **Match reporting survives a missing edge key (dual-claim).** Finished games
  normally report from the PartyKit edge via `HOMM3BG_MATCH_REPORT_KEY` (now
  falling back to `HOMM3BG_ADMIN_KEY` on both the party and `/api/matches/report`
  so a deployment that only set the admin key still records). When neither the
  edge nor its key is available, a BROWSER dual-claim is the backup: each
  signed-in participant POSTs `/api/matches/claim` once on the game-over
  transition (`maybeClaimFinishedMatch`, `src/lib/match-claim-client.ts`); the
  server PARKS the first claim and records W/L only when a SECOND distinct
  participant confirms the identical fingerprint (`src/server/match-claim.ts`,
  both account backends). Ranked rooms are forced CLOSED at creation (open
  tables store no seats, so the ladder cannot attribute a result), and
  `healVerifiedMembership` backfills a guest-stamped `matchSeats.userId` so a
  leaver is still attributed. Pinned in `match-claim.test.ts` +
  `match-report-giveup.test.ts` (a closed ranked give-up → a recordable
  FinishedMatch), each with a single-claimer / non-participant CONTROL.
- **Room join passwords (casual join-gate).** A room may carry a join password
  (`SET_ROOM_PASSWORD`, host-only on a hosted table, any member on an open one;
  `room.ts`). The engine stores ONLY a salted, dependency-free HASH
  (`hashRoomPassword`, cyrb53), never the plaintext, and `getPlayerView` redacts
  even the hash to `PASSWORD_REDACTED` in every view. A NEW joiner must supply
  the matching password in `JOIN_ROOM` (the host and reconnecting members are
  exempt); and — for a locked room — `roomActionGuard` lets ONLY members (who
  supplied it) take game actions, even on an OPEN table where seats are
  otherwise free. HONESTY: this is a casual Warcraft-III-style gate, NOT
  cryptographic secrecy — the full room state is broadcast, so a weak password
  is brute-forceable by anyone inspecting the transport; its real job is keeping
  uninvited people out of the lobby's Join flow. UI: a host set/clear control in
  the room panel, a per-room join-password prompt (`page.tsx`), and a lobby
  lock badge (`RoomDirectoryEntry.locked`, a boolean only). Pinned in
  `room-password.test.ts` (set/clear, the join gate with wrong/absent CONTROLs,
  the members-only action gate with a no-password CONTROL, and the view
  redaction) and `lobby-registry.test.ts` (the `locked` flag).

## WOG Commanders (optional module, BINH-only) — what runs vs. adaptations

Lobby: WOG crest + "Commanders" module (`WogModOptions.commanders`, default
OFF). Content in `src/data/commanders.ts`, engine in `src/engine/commanders.ts`
wired through setup/adventure/reducer/legal-actions/permanents/runes; behaviour
pinned in `src/engine/wog-commanders.test.ts` + `wog-commander-casts.test.ts`
+ `wog-commander-combos.test.ts` (observable outcomes with CONTROLs; each
fails if its wiring is removed).

### Commander Artifacts (`wog.artifacts` + `wog.commanders`) — 10 slot items

Ten commander artifacts (8 authentic WoG + 2 grade-fill weapons — every slot now
spans minor/major/relic) worn by the COMMANDER, not the hero, acquired from the
shared Artifact decks and bound PERMANENTLY into three slots — weapon / armor /
trinket. Binding ALSO grants one REGULAR (non-commander, non-equipment) Artifact
of the same grade (minor/major/relic) into hand — a FIXED-grade compensation for
the removed card via `grantRegularArtifactOfSameGrade` (adventure.ts): it honours
artifact uniqueness (skips one any seat already holds) but DELIBERATELY sits
outside the BINH tier-progression gate AND the Polish Random Artifacts roll (it is
a forced grant, not a player Search); a null grant leaves a feed note. Data + the
SINGLE-SOURCE registry are in
`src/data/wog/commander-artifacts.ts` (`COMMANDER_ARTIFACT_SPECS`, keyed by card
id — carries the slot AND the wired effect; the card definitions are generated
from it); state on `CommanderPlayerState.artifacts` (public, no player-view
masking); engine folds live in `src/engine/commanders.ts` (`makeCommanderCombatUnit`
/ `commanderCastPower` / `finalizeCommandersAfterCombat`), the bind effect
(`BIND_COMMANDER_ARTIFACT`) in `reducer.ts` + `legal-actions.ts`. Behaviour pinned
in `src/engine/wog-commander-artifacts.test.ts` (every claim an OBSERVABLE combat/
economy outcome with a CONTROL, mutation-checked) + the chip render in
`src/components/commander-card.test.tsx`.

LEAD with the adaptations / deliberate limits:
- **WoG's per-victory INCREMENTAL bonuses are NOT modeled** — each artifact grants
  a FIXED printed bonus.
- **Bow of Seeking and Slava's Ring of Power are NOT shipped** (no clean engine
  arm for their WoG behaviours yet).
- **Binding is PERMANENT by design** — no unbind, no swap; it survives the
  commander's death and revive (the revive cost formula is unchanged), and one
  artifact per slot (an occupied slot is not offered and a forged play is
  rejected).
- **Commander-scope is unchanged** — the artifacts affect only the MAIN hero's
  commander in the fights the commander already joins.

The 10 artifacts (each `tags` states EXACTLY the wired effect, CLAUDE.md §2):
- weapon `iron_cudgel` (minor) — +1 Attack (flat fold; grade-fill).
- weapon `axe_of_smashing` (major) — +2 Attack (flat fold).
- weapon `doomsday_blade` (relic) — +3 Attack (flat fold; grade-fill).
- weapon `sword_of_sharpness` (major) — +1 Might attack die (appends
  `commander-might-1`, riding the Damage-grade Might-dice machinery — so both the
  real roll AND the lethal-save preview read it).
- armor `hardened_shield` (minor) — +1 Defense.
- armor `mithril_mail` (major) — +2 Health.
- armor `helm_of_immortality` (relic) — a commander that dies in combat revives
  FREE at combat end (death never persists, no gold), via the free-revive branch
  in `finalizeCommandersAfterCombat`.
- trinket `boots_of_haste` (minor) — +1 Initiative.
- trinket `pendant_of_sorcery` (major) — command cast Power +1 (folded in
  `commanderCastPower` beside the Magic-grade ladder — lifts the cast tier without
  touching the Magic-grade ability package).
- trinket `dragon_eye_ring` (relic) — the commander's attacks also strike the
  space directly behind the target (appends the Gold-Dragon line-attack arm
  `dragon-line-attack-3`).

Bind flow: the card's only play is a map-only, own-turn `BIND_COMMANDER_ARTIFACT`
option (`cost.removeSelf`) legal only with the Commanders module on, a commander
present (a DEAD commander binds for later) and the slot EMPTY; resolving removes
the card FROM THE GAME (never the discard), sets the slot, and emits
`COMMANDER_ARTIFACT_BOUND`, then grants the same-grade regular Artifact (above).
THREE-WAY DECK GATE: the ten cards join the shared
Artifact deck(s) ONLY when `wog.enabled && wog.artifacts && wog.commanders` are
all on (dead cards without a commander) — id lists `wogCommanderArtifact*Ids`
joined in `makeSharedDecks` beside the Task-1 hero-artifact join (split tiers +
legacy single deck), registered in `src/data/cards/library.ts`, and excluded from
the `moduleGated` sets in `deck-coverage.test.ts` / `combat-sandbox-cards.test.ts`.
They coexist with the anime Pháp Bảo artifacts in the same decks; the anime
Equipment Iron-Blood Sword's per-player first-attack +1 STACKS with a bound Axe on
the commander's first attack (the sword keys off the attacker's controller, and
the commander is that player's unit — pinned as +3 total).

Leading with what does NOT run / deliberate readings:
- **The WoG PC reference layer did NOT ship**: the 5-tier primary skills and
  the PC numbers in `docs/wog-commanders-plan.md` §4–5 are design history. The
  shipped system is grades 0–3 per stat plus the 15 combination skills below.
- **Stat points from level-ups** (`commanderGradePointsForLevelUp`,
  `awardCommanderGradePoints`): every hero level-up awards the commander stat
  POINTS to spend (one point raises one stat by one grade). A normal level-up
  gives 1 point; the two MILESTONE levels give 2 — levels 3 & 6 for everyone
  EXCEPT the Castle Paladin, whose Wise specialty pulls the milestones EARLIER
  to levels 2 & 5 (`commanderDoublePointLevels`). A full run to level 7 is 8
  points either way. Points live in `commander.gradePoints`; `COMMANDER_GRADE_UP`
  spends ONE to raise a single stat (max grade 3). Pinned in
  `wog-commanders.test.ts` ("stat points from the hero's level": the point
  schedule, the spend, the Paladin milestone shift, the legal-action offers).
- **Stats are grades 0–3** (`COMMANDER_GRADE_VALUES`): every stat STARTS at
  grade 0 (the base line A2/D1/H4/dmg0/Pow0/Spd5). A grade's bonus over the
  base is the value shown, never summed with earlier grades: +1/+2 at grade
  I/II; grade III is adjusted per the user spec — Attack +3 (5), Health +4 (8),
  Speed +5 (Initiative 10). Two stats work differently:
  - **Defense = 1/2/2/3** (NOT +3 at III). Grade II is the "+1 def when
    attacked" tier: Defense 2 PLUS a permanent Defense token
    (`commander-defense-token`, `SELF_DEFENSE_TOKEN` — the commander rolls the
    Defend die when attacked, +1 on a "+1" face). Grade III is a reliable flat
    Defense 3 with NO die (the token is on grade II ONLY —
    `COMMANDER_DEFENSE_TOKEN_GRADE`). Pinned in `wog-commanders.test.ts`
    ("Defense grade II Defense token", with grade-I no-token / grade-III no-die
    CONTROLs).
  - **Damage = extra ATTACK DICE, not a flat bonus.** At Damage grade N the
    commander rolls N ADDITIONAL attack dice (0/1/2/3) alongside its normal
    attack die on every attack; each extra "+1" face raises the attack value,
    and AT MOST ONE "−1" counts (`getMightDiceCount` / `mightDiceAttackBonus`,
    rolled once per attack in `finishResolvedAttack` and reused by the
    lethal-save preview). Because they are attack dice they ride the attack
    value BEFORE Defense (they can push through Defense; a fully-blocked hit is
    still 0). Pinned in `wog-commanders.test.ts` (the "Might" case, with the
    "at most one −1" and the push-through-Defense CONTROLs).
  The Magic ladder (user spec — grade 0 buys NOTHING but the cast itself):
  Power **0/0/1/2** (`COMMANDER_GRADE_VALUES.magic`; cast tiers cap at "Power
  2+"), Spell ward **0/1/1/3** (`COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION` — no
  `reduce-spell-damage-*` id at all at grade 0, `-1/-1/-3` from grade 1),
  ongoing-effect immunity from **grade 1** (`titan-ignore-ongoing`, gate
  `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE` = 1 — a grade-0-Magic commander is NOT
  immune and takes full Spell damage). So grade 0 = the once-per-round cast
  only; grade 1 = -1 ward + ongoing immunity; grade 2 = +Power 1; grade 3 =
  Power 2 + -3 ward. Pinned in `wog-commanders.test.ts` ("the Magic grade
  package", with grade-0 full-damage / not-immune CONTROLs) and the injection
  test.
- **15 combination skills** (`COMMANDER_COMBOS`, one per stat pair): a combo
  unlocks once ONE stat of its pair is grade 3 and the OTHER at least grade 2
  (either orientation; 2+2 and 3+1 stay locked). Death Stare (DMG+MAG,
  `gorgon-death-stare`) and Charge (DMG+SPD, `commander-charge`) kept their
  original wiring; the other 13 (plan §5, board-adapted): No Enemy Retaliation
  (ATK+MAG, `ignores-retaliation`), Sharpshooter/Can Shoot (ATK+SPD — the
  unit's TYPE flips to ranged in `makeCommanderCombatUnit`, no ability tag),
  Mighty Blow/max damage (ATK+DMG, `MINIMUM_ATTACK_DIE` 1 — the own die always
  counts +1), Endless Retaliation (DEF+HP, `unlimited-retaliation`), Crushing
  Strike/-50% Defense (ATK+DEF, `DEFENSE_REDUCTION_ON_ATTACK` 2), Fearsome
  (ATK+HP, Paralysis on an own "-1" die), Whirlwind Strike (DEF+DMG,
  `SECOND_ATTACK_ALL_ADJACENT_TO_SELF`), Fire Shield (DEF+MAG, passive
  `FIRE_SHIELD_DAMAGE` 1), Block (DEF+SPD, a "-1" defensive die fully blocks
  the hit), Double Strike (HP+DMG, `SECOND_ATTACK_SAME_TARGET_AFTER_
  RETALIATION`), Paralyzing Touch (HP+MAG, extra die "0" Paralyzes),
  Regeneration (HP+SPD, heal 1 on activation), Battle Teleport (MAG+SPD,
  `teleport-move` MOVE_ANYWHERE — the user-spec "can move anywhere in battle",
  replacing WoG's Fly). Each behaviour + a locked CONTROL one grade below is
  pinned in `wog-commander-combos.test.ts`. With ~8 points over a full run one
  combo is comfortably reachable (grade a stat to 3 = 3 points, its partner to
  2 = 2 points) and a second is possible if the builds overlap — a deliberate
  build choice.
- **Deployment cap**: with the module on, `combatUnitLimit` = 4 army units
  (both neutral and PvP setups) — the commander IS the 5th body. Module off =
  the classic 5 (pinned with a CONTROL in `wog-commanders.test.ts`).
- **UI**: the CARD face (`CommanderCardFace`) keeps the classic HoMM3 spell
  icons (`public/assets/spell-icons/`) for the cast/combo chips and overlays the
  REAL stat numbers on the frame wells plus the Might-dice / Power badges. The
  read-only STATS view (`CommanderStatsPanel`, used by the map card AND the
  combat inspect/zoom — `board.tsx` / `zoom.tsx`) instead uses the AUTHENTIC WoG
  comm3 symbols (`public/assets/commander-icons/stat-*.jpg` for the six stats,
  `combo-<tag>.jpg` for the fifteen skills, downloaded from
  heroesofmightandmagic.com/wakeofgods/pics/comds; existence pinned in
  `wog-commander-combos.test.ts`). It spells out each grade bonus (base + grade
  delta), the Defense-token "+1 def when attacked" tier, the Damage DICE, a
  Magic Power ladder with the current tier + spell ward highlighted (grade 0
  reads "cast only — no ward, not immune"), and every combination skill with its
  symbol + full text (render smoke-tested in `commander-card.test.tsx`). Combat
  inspect also shows the Might dice + Power inline. On level-up the map card's
  point picker lists each stat with a plain-words "what you gain" line
  (`gradeUpBenefit`); one click spends one point on a stat and the count ticks
  down. Unspent points pulse/blink the dock tile.
- **Presentation (sfx + animation, all engine-event-driven, tested where pure):**
  the card FACE now carries an animated **rainbow frame spark** (a rotating
  rainbow ring + travelling white spark tracing the border; hidden for a fallen
  commander; `.commanderRainbowFrame` in globals.css). Every command ability
  animates + sounds in combat: `COMMANDER_CAST_USED` (the activation cast AND the
  Shield / Stone Skin reaction) reuses the matching H3 spell's sprite + sound
  over the target via `commanderCastFxPlan` (`src/data/commander-fx.ts`, Animate
  Dead falls back to a heal shimmer), and `COMMANDER_SPECIALTY_TRIGGERED` plays a
  themed sting (`commanderSpecialtySound`) — both wired in `page.tsx`'s combat FX
  loop; the mapping is pinned in `commander-fx.test.ts`. A hero level-up that
  awards commander points fires `COMMANDER_POINTS_AWARDED` and pops a celebratory
  **level-up popup** (`CommanderLevelUpOverlay`, slam-in + fanfare) carrying the
  clearer `CommanderLevelUpPicker`: one clearly-separated, per-stat-accent-
  coloured option showing the grade jump, the numeric value change and the
  benefit (render + click tested in `commander-card.test.tsx`).
- **Battlefield voices**: a commander has no unit definition, so its combat
  voice is keyed by slug in `commanderVoices` (`unit-sounds.ts`,
  `commanderSoundKey`); the table passes `commander:<slug>` as the voice id
  (`commanderVoiceId`) and `unitSoundKey` routes it. Per the user spec:
  Castle=Swordsman, Rampart=Monk, Tower=Sorceress(Sea Witch), Inferno=move
  Gargoyle/hurt-death-defend Pixie/attack Magi, Dungeon=Minotaur,
  Necropolis=move Zombie/hurt-defend-death Lich/attack Lich-melee,
  Stronghold=Ogre, Fortress=Gnoll, Conflux=hurt-death-defend Pixie/move-attack
  Efreet, Factory=Cove Seamen, Cove=Sea Dogs, Bulwark=Jotunns. Pinned in
  `unit-sounds.test.ts`.
- **Specialty adaptations** (each engine-enforced, but a conscious rewrite of
  the WoG printed passive): Paladin Wise = the two MILESTONE (2-point) level-ups
  come early, at hero level 2 & 5 instead of 3 & 6 (not 150% XP); Temple Guardian
  Mana Magician = twice per COMBAT a Spell may
  exceed the per-round limit (this game has no mana pool; a burned charge
  converts into `spellLimitBonusThisRound` so the limit never dips below the
  count); Brute Soul Reformer = flat +2 gold after each WON combat (no XP→gold
  pools); Soul Eater Undead = Paralysis-token immunity; Shaman Superior Combat
  AND Sea Marshal Battle Stance = the owner picks the commander's combat stance
  (+1 Attack OR +1 Defense) on the commander card OUTSIDE combat, baked into the
  unit at each combat's setup (default +1 Attack; `commander.stance`); Astral
  Spirit **Elemental Scourge** = at the start of a combat vs neutral units,
  EVERY enemy neutral unit takes 1 damage (`applyElementalScourge`, effect
  damage through the normal removal path, every neutral combat incl. banks —
  this REPLACED the old "Pacifist" flee specialty; pinned in
  `wog-commanders.test.ts` with a module-off and a non-Conflux CONTROL); Rune
  Keeper Rune Ritual = +1 Rune EVERY time the commander is attacked AND +1 EVERY
  time it MOVES (`applyCommanderRuneRitual` on the attack, `applyCommanderRuneOnMove`
  in `moveUnit`; NO once-per-combat cap any more — user spec "when he move or get
  attacked, also gain rune +1"; retaliations don't count as being attacked;
  pinned in `wog-commanders.test.ts` with a Paladin CONTROL for both halves);
  Hierophant First Aid = post-combat window restoring ONE bronze/silver
  casualty (died card returns — a Neutral-side card is pulled back OUT of its
  tier discard so it is never duplicated; a Pack that fell to Few flips back);
  Ogre Leader Ballista Master = the player aims the Ballista's round-start
  shot (the Gerwulf `BALLISTA_CHOOSE_TARGET` freedom, granted passively);
  Artificer Tinkerer = war machines cost 5 less gold (min 0) at both shops.
- **Roster renames** (user spec): Cove Corsair → Sea Marshal, Factory Engineer
  → Artificer, Bulwark Frost Warlord → Rune Keeper (slugs/assets unchanged).
- **Commander scope**: it fights ONLY the main hero's combats (garrison
  defenses and secondary-hero fights get none), is AUTO-placed at combat start
  (own backline first, then frontline; bank fights use the six central cells)
  rather than hand-placed, enters every combat at full health, and only DEATH
  persists (revive anywhere on your map turn for 2 + 2x hero level gold).
- **Tierless both ways** (bank-guard convention): tier-gated spells (Blind…)
  never target a commander, and the neutral AI hits it LAST.
- **Ongoing-effect immunity is a Magic grade-1+ perk** (titan-style, gate
  `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE` = 1): from grade 1 even FRIENDLY ongoing
  buffs skip the commander, so the buff-type command casts exclude an
  ongoing-IMMUNE commander from their target lists up front
  (`commanderUnitImmuneToOngoing`). A grade-0-Magic commander is NOT immune — an
  ongoing cast (e.g. an enemy Slow) CAN land on it, and it takes full Spell
  damage; the cast-candidate exclusion and the effect application both key off
  the actual immunity, pinned with grade-0 CONTROLs in `wog-commanders.test.ts`
  and `wog-commander-casts.test.ts`. Tokens are NOT ongoing effects — a commander
  can still be Paralyzed (unless Soul Eater).
- **Cast readings**: the cast is once per combat round, FREE during the
  commander's own activation. Per the user spec a cast ENDS the commander's
  MOVEMENT for that activation (it may still attack, but no longer move —
  `movementLockedThisActivation`, gated in `getLegalMoveDestinations` so
  MOVE_UNIT / MOVE_AND_ATTACK / the Battle-Teleport MOVE_ANYWHERE are all
  blocked; pinned in `wog-commander-casts.test.ts`). The lone EXCEPTION is the
  two **instant-reaction** defend buffs below, which are played off-turn and
  never touch movement.
  Cure's cleanse removes ALL negative tokens+effects (not one); Animate Dead
  heals a flat 2 (the bronze/silver/gold ladder IS the Power scaling);
  Counterstrike = unlimited retaliation for the round (tier-laddered);
  Haste/Slow riders compare effective Initiative at attack time (+1 vs slower
  / -1 vs faster, on the buffed/slowed unit's own attacks); Fire Shield
  durations are 1 round / whole combat / 2 rounds by Power; Rune Mend spends
  the per-combat Rune pool (1/2/2 → heal 1/2/3) and never revokes an
  already-latched Rune Level (that pool is add-only by design); Field Repair's
  "mechanical" = the engine's `isMechanicalUnit` (Factory Automatons /
  Dreadnoughts); Shield shares the Shield SPELL's `DEFENSE_VS_ATTACKER_TYPE`
  semantics (a ranged-TYPE unit attacking adjacent is still not "melee").
- **Hierophant Shield & Ogre Leader Stone Skin are INSTANT REACTIONS**, NOT
  activation casts (user spec "the defend buff of 2 commanders is instant
  reaction"). Keyed off `commanderCastIsInstantReaction` (`effect.kind ===
  "defense-buff"`): removed from the activation offer (`commanderCastAvailable`
  returns false for them) and instead offered to the ATTACKED unit's controller
  in the open attack window (`commanderDefenseReactionUnit` →
  `USE_COMMANDER_CAST_REACTION`, resolved via `applyCommanderCastReaction` +
  `advanceReactionWindowAfterPlay`). They buff the attacked unit's Defense
  BEFORE the hit resolves (a `current-combat-round` effect folds into the
  triggering attack, like Interference), stay once-per-combat-round, cost no
  activation and never lock movement. Shield (vs melee) is NOT offered against a
  ranged-TYPE attacker (its `DEFENSE_VS_ATTACKER_TYPE` would do nothing); Stone
  Skin (vs all) is offered against any attacker. Pinned in
  `wog-commander-casts.test.ts` with a pass-the-reaction CONTROL, the melee-only
  gate, and a once-per-round CONTROL.
- **Dungeon Brute Bloodlust (melee) & Tower Temple Guardian Precision (ranged)**
  now scale Pow 0 = +1 (target must be ADJACENT to the commander), Pow 1 = +1
  (anywhere), Pow 2 = +2 (anywhere), always THIS round only
  (`adjacentBelowPower: 1`, `amountByPower: [1, 1, 2]`; user spec). Precision
  keeps its "ignore ranged penalties" rider. Pinned in
  `wog-commander-casts.test.ts` (targeting-adjacency + amount, each with a
  no-cast CONTROL).
- **Might (Damage grade)** rolls N EXTRA attack dice (N = Damage grade 0/1/2/3)
  on the commander's attacks AND retaliations, folded into the attack value
  beside the normal die (each "+1" raises the attack; at most one "−1" counts).
  Because they are attack dice they interact with Defense and stay under
  per-attack damage caps (Cove Nix). Charge fires on its own attacks after
  moving, never on retaliations. Death Stare reuses `gorgon-death-stare`
  verbatim (2 dice, double "-1" destroys the side). The ATTACK_ROLLED event
  carries the extra dice as `mightRolls` so the combat UI can show them.
- The commander COUNTS for win/loss (`livingControllerIds`): an army can fight
  on through its commander, and killing a side needs the commander dead too.
- `COMMANDER_GRADE_UP` / `REVIVE_COMMANDER` / `COMMANDER_FIRST_AID` are
  handler-validated actions (self-validating; usable outside combat without a
  legal-actions membership match). While `pendingCommanderFirstAid` is open,
  the owner's map actions are gated to answering it (Necromancy-style);
  `eliminatePlayer` clears an eliminated seat's window.

### WOG Artifacts (optional module, BINH-only) — what runs vs. adaptations

Lobby `WogModOptions.artifacts` (default OFF; gated exactly like `commanders` —
active only when `wog.enabled && wog.artifacts`). Five ORIGINAL, board-adapted
"Wake of Gods" hero Artifact cards in `src/data/wog/artifacts.ts`; deck-join in
`makeSharedDecks` (a `withWog(...)` beside the anime `withAnime(...)`, gated on
`wog.enabled && wog.artifacts`), library registration in
`src/data/cards/library.ts` (ALWAYS registered so lookups resolve; deck-join
only when on). Behaviour pinned in `src/engine/wog-artifacts.test.ts`
(observable outcomes + CONTROLs, each fails if its wiring is removed) and data/
art hygiene in `src/data/wog/wog-artifacts.test.ts`.

Leading with what does NOT run / adaptations: WoG's printed artifacts carry
per-victory INCREMENTAL bonuses and special behaviours (transform one artifact
into another, lock a Town, summon a dragon, …) — NONE of that is modeled. Each
card is a clean REUSE of an already-wired arm (no new engine rule), with the WoG
flavour as its name/art only. Art is the committed manual-derived faces at
`public/assets/wog/artifacts/<slug>.webp` (no rules text on the face, no
placeholder registry — all five ship with real art). Commander-specific
artifacts arrive in a LATER task and are NOT part of this module.

What runs (each mutation-checked; default OFF ⇒ byte-identical Artifact decks):
- **Magic Wand** (minor, mapOnly instant) — remove the card (leaves the game) to
  Search (1) the Artifact deck (`CARD_DECK_SEARCH`, Surcoat-of-Counterpoise arm).
- **Gate Key** (minor, instant) — +1 movement, OR remove for +2 movement
  (`GAIN_HERO_MOVEMENT`, Boots family — so also offered as a neutral-combat
  continue-window movement top-up).
- **Crimson Shield** (major, defender reaction) — +2 defense, OR remove for +3
  (`ADD_COMBAT_STAT` on `UNIT_ATTACK_DECLARED`/opponent).
- **Warlord's Banner** (major, attacker reaction) — +2 attack, OR remove for +3
  (`ADD_COMBAT_STAT` on `UNIT_ATTACK_DECLARED`/self).
- **Dragonheart** (relic, attacker reaction) — +3 attack, OR remove for +5
  (same arm, relic-tier numbers). The remove side leaves the game (→ `removed`,
  never the discard) — pinned by an explicit zone assertion.
The three reactions ride the SAME per-tier split/legacy Artifact decks and
tier/uniqueness gates as core artifacts; the relic shares the core relic deck's
level/source access gate. Cross-mod (§3.8): the WOG and anime Pháp Bảo artifact
sets join those same shared decks side by side (the deck-join composes
`withWog(withAnime(...))`), neither displacing the other nor the core cards —
pinned by the both-mods-on deck-join tests in `wog-artifacts.test.ts` and by the
all-on coexistence soak (`anime-coexistence-soak.test.ts`, `artifacts: true` in
the every-WOG-module config).

### WOG New Objects (`wog.newObjects`, BINH-only) — what runs vs. adaptations

SEVEN authentic-WoG adventure-map objects shipped as single-hex **Field
Overrides** (the GLOBAL override mechanism — `src/data/wog/field-overrides.ts`
registers the 7 kinds as package `"wog"`, `src/data/wog/locations.ts` merges
their locations into `locationDefinitions`; the dynamic/context-filtered visit
menus are built in `beginFieldVisit`'s `buildWogFieldVisitStep`, mirroring the
anime package). Default OFF ⇒ byte-identical (the wog package returns false from
`fieldOverridePackageAllowed` unless `wog.enabled && wog.newObjects`, so no pool
membership, no palette surprise). Behaviour pinned in
`src/engine/wog-objects.test.ts` (each claim mutation-checked, with CONTROLs).

Leading with what does NOT run / deliberate adaptations:
- **Only 7 of WoG's many scripted objects ship.** God's Altars beyond the one
  below, the Colosseum, Fishing Wells' variable catch, etc. are NOT modeled;
  each shipped object is a board-adapted READING (the printed `summary` states
  exactly the wired effect).
- **Emerald Tower's creature-enchanting is REPLACED by commander/hero training.**
  WoG's tower enchants a creature stack; here it is guarded (difficulty Ⅲ,
  stamped via the registry's `guard`) and, after the win, opens a City-Hall-style
  CHOOSE_ONE: "Pay 3 gold: +1 commander stat point" — offered ONLY when
  `wog.commanders` is on AND the visitor has a commander (context-filtered arm
  absent otherwise) — via the SAME `commander.gradePoints` bump +
  `COMMANDER_POINTS_AWARDED` event the level-up uses (the point is then spendable
  through `COMMANDER_GRADE_UP`); "Pay 2 gold: +1 hero experience" through the
  normal `gainExperience` pipeline (level-ups, bumps ride it); or Leave. Both
  paid arms are PAY_TO (gold-gated at offer AND resolution). As a REVISITABLE hex
  the beaten guard is cleared on the win (the FO branch of the beginFieldVisit
  guard-clear) so re-entry is a peaceful menu, not a re-fight.
- **Mirror of the Home-Way is a flat pay-2-gold Town teleport** (WoG's full
  Town-Portal price/movement table is NOT modeled). Visit: "Pay 2 gold: teleport
  to one of your Towns/Settlements" (the visitor picks when several are reachable,
  reusing the Town-Portal `TELEPORT_HERO` machinery) or Leave; with no reachable
  Town (zero owned, or every destination occupied by another hero) the pay arm is
  absent. No free teleport without paying; arrival never re-triggers.
- **Junk Merchant is tier-priced sells + a paid search** (WoG's 32-artifact fixed
  trade table is NOT modeled). Visit CHOOSE_ONE: one "Sell <artifact> (<tier>):
  gain N gold" arm per hand Artifact — minor 2 / major 3 / relic 4, the card
  leaving the game (Trading-Post sell semantics: hand → removed pile), the whole
  sell set absent with no Artifact in hand — plus "Pay 4 gold: Search (1) the
  Artifact deck" (the shared-deck search pipeline, so the normal BINH tier gates
  apply) and Leave.
- **Fishing Well is a fixed Attack-die gamble** (WoG's variable catch is NOT
  modeled). A STATIC `PAY_TO(1 gold)` → `ATTACK_DIE_TABLE` (no dynamic menu —
  the interaction lives on the location def, like the anime Gambling Den): +1 →
  +1 valuables, 0 → 2 gold back (net even), −1 → nothing. Revisitable, once per
  visit; a broke hero / decline pays nothing.
- **Living Skull is a Listen/Smash CHOOSE_ONE with a permanent destruction
  latch** (WoG's scripted lore is NOT modeled). "Listen" = Search (1) the Ability
  deck (repeatable). "Smash" = +2 gold, then the new `SMASH_WOG_SKULL` leaf sets
  `field.wogSkullSmashed` — the hex is INERT for EVERYONE thereafter (no menu on
  any later visit, any player). The latch mirrors `centerHexClaimed`.
- **Adventure Cave is an escalating repeatable fight** (WoG's dungeon crawl is
  NOT modeled). Guarded Ⅰ on first entry; each WIN pays a scaling reward (win 1:
  +3 gold, win 2: a Treasure die, win 3: Search (1) the Artifact deck) and
  RE-GUARDS one difficulty higher (Ⅰ→Ⅱ→Ⅲ, `applyCustomGuardToField`) — after the
  3rd win it is cleared for good (`clearCustomGuard`). `field.wogCaveWins` counts
  the wins; the whole reward/re-guard flow is `handleWogAdventureCaveVisit` in
  `beginFieldVisit`, BEFORE the generic FO guard-clear (which would just clear it).
  All reward leaves are auto-resolving so a computer win never parks on a window.
- **Altar of the Gods is a pay-3-valuables blessing** (WoG's full sacrifice table
  is NOT modeled). `PAY_TO(3 valuables)` → CHOOSE_ONE: +1 morale, +2 hero XP
  (`gainExperience`), or — only with `wog.commanders` on AND a commander — +1
  commander stat point (`GAIN_COMMANDER_POINTS`). Plain revisitable (1 MP); NO
  per-round latch (deliberate — the 3-valuables cost gates each visit).
- **Commander-artifact BONUS on reward locations** (user spec "some location that
  gives rewards also adds a bonus commander artifact along with it"): with
  `wog.enabled && wog.commanders` on and a commander present, the **Emerald
  Tower** guard win AND the **Adventure Cave** 3rd win ALSO drop ONE random
  NOT-in-play commander-artifact card into the winner's hand (the normal bindable
  card — unchanged bind flow). `freeCommanderArtifactCardIds` scans every player's
  hand/discard/deck/removed, every commander's bound slots, AND every shared deck
  draw/discard pile (so a `wog.artifacts` deck-join copy is never duplicated); if
  all 8 are in play the grant is a no-op with a feed note. `grantCommanderArtifactReward`
  in `beginFieldVisit`.
- **Art: only Emerald Tower's hex sprite is an authentic WoG scan**; the other
  six (Mirror, Junk Merchant, Fishing Well, Living Skull, Adventure Cave, Altar of
  the Gods) are codex-generated late-90s-HoMM3-style hexes. All seven ship WITH
  512×512 webp art on disk (`public/assets/wog/field-overrides/<slug>.webp`), so
  NO glyph placeholder is registered (art wins).

What runs (each with a failing-if-removed test in `wog-objects.test.ts`): the
7 kinds register under package `"wog"` with art on disk and locations in
`locationDefinitions`; pool/palette listing includes wog kinds ONLY with
`wog.enabled + newObjects` (CONTROLs: each flag off; anime-on-but-wog-off does
NOT leak wog kinds; both-on lists BOTH packages — coexistence); a carved wog hex
is Location-Token-protected; every visit effect above with its CONTROLs (the
gamble branch table keyed off the rolled face, the skull latch inert-for-a-second-
visitor, the cave Ⅰ→Ⅱ→Ⅲ ladder + stays-cleared, the altar's commander-gated arm,
the commander-artifact grant with a commanders-off / all-in-play / held-copy
CONTROL); a wog designer pin survives the map-registry sanitize round-trip and
auto-enables `wog.enabled + newObjects` at setup (`customMapHasWogFieldOverridePins`,
mirroring the anime pins twin at the three `adventure-setup.ts` sites). The
all-on coexistence soak (`anime-coexistence-soak.test.ts`) runs `newObjects:
true`; AI seats meet the wog objects and the generic visit-menu scoring resolves
every arm (the leaves `GAIN_COMMANDER_POINTS` / `SELL_HAND_ARTIFACT` /
`SMASH_WOG_SKULL` are auto-resolving — kept OUT of `stepNeedsInput`; the cave's
reward leaves too).

## Unit Experience / veterancy (OPTIONAL rule; lobby toggle + WOG module + anime module) — what runs vs. limits

Board adaptation of the WoG Unit Experience System (UES; ues.shtml + the
CREXPBON table). THREE equivalent surfaces activate ONE shared engine flag,
frozen onto `adventure.unitExperience` at setup: the lobby
`GameSetupOptions.unitExperience` (Game options → Optional systems, default
OFF), `wog.enabled && wog.unitExperience` (WOG Mod options row), and
`anime.enabled && anime.unitExperience` (types + resolution only — like the
other anime flags there is no anime lobby UI yet). Data in
`src/data/units/experience.ts`, engine read layer in
`src/engine/unit-experience.ts`, wired through `makeCombatUnitFromArmy` +
`applyUnitCurrentSide` (stat/ability folds), `finalizeAdventureCombat` (the XP
award), the reducer/legal-actions (`DRILL_UNIT`) and every Few→Pack / Stack
upgrade site (dilution). Behaviour pinned in `src/engine/unit-experience.test.ts`
(off/rank/lost-fight CONTROLs; the award call, the attack fold and the
rank-ability grant are mutation-checked), UI in `unit-rank-badge.test.tsx`,
`board.test.tsx` ("veteran-rank badge") and `game-options-tabs.test.tsx`.

Leading with what does NOT run / deliberate limits:
- **Quick Combat trains nobody** — the army never deploys, so an auto-win pays
  no unit XP. Fighting a battle out by hand is the deliberate way to drill
  troops (a real strategic trade-off, documented, not a bug).
- **Clone tokens and Sandro's-Cloak covers ignore ranks**: a Clone is built as
  a fresh XP-less copy (the existing `permanentAttackBonus` precedent), and a
  specialty cover replaces stats wholesale, suppressing the rank folds while it
  is on top (same read as the permanent bonuses).
- **Every unit has its own rank SCHEDULE** (`rankScheduleFor`): a unique one
  where authored (`UNIT_RANK_SCHEDULES`), else a flavour-template fill
  (`FLAVOUR_ABILITIES`). A schedule is 4 steps, each EITHER stats OR one
  ability (never both), matching one of three templates — standard (1 ability),
  strong (2), rare (3). Ability ranks draw from `ELITE_UNIT_RANK_ABILITIES` /
  `LEGEND_UNIT_RANK_ABILITIES` plus the track pools; every granted id REUSES an
  already-implemented ability (no new engine effects; registry hygiene — real
  unit, implemented, not already printed on the side — is pinned by test).
- **The Hierophant First Aid flip-up never dilutes** — it restores THIS
  battle's own casualties, not fresh recruits (the one reinforce-shaped
  exception, pinned with the reinforce halving as its control).
- **The AI has no bespoke veterancy strategy**: it drills only as an idle-time
  luxury from surplus gold (`map-policy.ts` DRILL_UNIT, score 325 when gold ≥
  10) and otherwise just benefits from the folds like a human.
- **Badge art now ships as real webp icons**: per-rank badges
  (`/assets/ui/unit-rank-{seasoned,veteran,elite,legend}.webp`,
  `unitRankBadgeImage`) and per-ability icons (`/assets/ui/rank-ability/*.webp`,
  `unitRankAbilityIcon`) — Codex-generated, drawn on the badge / board window
  (the old CSS carets are the text fallback).

What runs (each with a failing-if-removed test):
- **XP awards (WoG "survivors of a hero-led won battle train")**: after a WON
  combat the winner's surviving DEPLOYED army cards each gain XP — neutral
  guard fights pay the Field Difficulty, Creature Banks pay max(2, Stacked
  count), PvP wins pay a flat 2 (`unitExperienceForWonCombat`). Dead cards,
  undeployed cards, summons/temporaries/commanders and the loser get nothing;
  each card is awarded once (clone-safe Set). XP rides the CARD
  (`ArmyUnitState.experience`) and survives Pack→Few casualty flips.
- **Four named ranks 1–4 (Seasoned / Veteran / Elite / Legend) with tier-scaled
  thresholds** (`UNIT_RANK_NAMES`, `MAX_UNIT_RANK` = 4, `UNIT_RANK_THRESHOLDS`):
  bronze 3/6/10/14, silver 4/8/13/18, gold/azure 5/10/16/22 — higher tiers rank
  slower. Stats accumulate ONLY on a schedule's stats ranks, drawing the tier's
  ordered `UNIT_STAT_STEPS` (bronze +Def / +Atk / +Health&Init; silver +Def /
  +Atk / +Health; gold/azure +Atk / +Def / +Health), so a rank spent on an
  ability adds no stats. Folded at combat-unit build AND on every mid-combat
  printed-side recompute, so a Pack→Few flip keeps its rank.
- **Abilities at the schedule's ability ranks** (not fixed at one rank): each
  ability rank grants ONE not-already-printed id from that unit's schedule step
  (e.g. Champions `ignores-retaliation`, Behemoths `wog-nightmare-fear`,
  Phoenixes `wog-fire-shield-1`, Nagas/Cerberi/Hydras `unlimited-retaliation`,
  Jotunns `reduce-spell-damage-1`, Dreadnoughts `ignore-paralysis`), appended to
  the unit's runtime `abilities` (deduped) by `withRankAbilities` — never edits
  printed card data, so the ability-text enforcement invariant is untouched.
- **Dilution (WoG Crexpmod "upgrades cost experience")**: reinforcing Few→Pack
  HALVES the card's XP at every reinforce site (settlement, Hill Fort, town
  Population batch, the shared `reinforceArmyUnit` helper, and the mid-combat
  Summon-Demons reinforce, which re-syncs the fighting unit's folds); each
  purchased Polish Unit Stack layer costs 1 XP. Every dilution emits
  `UNIT_XP_DILUTED` so the loss is never silent.
- **Drill (new board mechanic)**: `DRILL_UNIT` — with the main hero in an OWN
  Town, pay 2 gold for +1 XP on one army card, once per own turn; maxed cards
  are not offered. Handler-validated like HERO_TRAIN; `UNIT_DRILLED` event.
- **Presentation**: `UNIT_RANK_UP` / `UNIT_DRILLED` / `UNIT_XP_DILUTED` feed
  lines (`formatEvent`); rank badges on army rows (`ArmyPanel`, with the
  rank-FOLDED stats and an XP-progress tooltip), on combat cards
  (`board.tsx`, mirrored `unitRank`/`unitExperience`) and in the zoom/inspect
  lines (`zoom.tsx`).
- **Default OFF ⇒ byte-identical**: with the rule off no card ever carries
  `experience`, so every fold is an exact no-op and no award/dilution/Drill
  runs (off-CONTROLs pinned; legacy snapshots unaffected).

## Neutral Rank-Up (OPTIONAL, WOG/anime flag) — what runs vs. limits

An OPTIONAL module where NEUTRAL guard units gain the EXISTING Unit-Experience
veteran ranks as the game ages, and Creature-Bank Stacked defenders fight one
rank up. ONE boolean, two module surfaces resolving to ONE frozen adventure
field (mirroring the `unitExperience` precedent):
`WogModOptions.neutralRankUp` (active when `wog.enabled && wog.neutralRankUp`)
and `AnimeModOptions.neutralRankUp` (active when `anime.enabled &&
anime.neutralRankUp`; types + resolution only, no anime lobby UI), frozen onto
`adventure.neutralRankUp` at setup (`neutralRankUpOn` in `adventure-setup.ts`;
absent/undefined = OFF for legacy snapshots). Lobby: ONE row in the WOG Mod
options window (`screen.tsx`). It REUSES the veterancy machinery verbatim (no
parallel rank table): `unitRankFold` / `combatUnitRankFold` / `withRankAbilities`
+ the tier-scaled `UNIT_RANK_THRESHOLDS` + `UNIT_STAT_STEPS` + per-unit
schedules. Read layer + constants in ONE place: `src/engine/unit-experience.ts`
(`NEUTRAL_ROUNDS_RANK_CAP` = 2, `NEUTRAL_STACK_RANK` = 1, `neutralRankUpActive`,
`neutralRoundsRank`, `neutralRoundsMirrorXp`, `applyNeutralRoundsRank`,
`neutralStackRankFold`). Behaviour pinned in `src/engine/neutral-rank-up.test.ts`
(every claim mutation-checked; both folds independently mutation-verified) +
the badge in `src/components/table/board.test.tsx` + the lobby row in
`src/components/adventure/game-options-tabs.test.tsx`.

Leading with what does NOT run / deliberate limits:
- **Quick Combat and the polish-quick-combat strength read DELIBERATELY ignore
  ranks** — a level auto-win / a strength-covered Quick Combat still resolves
  before any guard acts, exactly like the existing "veteran ranks ignored" line.
  The module makes a FOUGHT-OUT fight harder, never a skipped one.
- **The AI engagement heuristics ignore ranks** — the map policy still reasons
  by field difficulty / level, so a computer hero may walk into a now-harder
  fight; it just fights it (no bespoke rank-aware avoidance).
- **XP/reward for beating a ranked guard is UNCHANGED** — rewards are
  difficulty-based; the fold raises guard STATS only and never touches
  `combat.context.difficulty` (pinned: "reward driver is UNTOUCHED").
- **Banks are EXCLUDED from the ROUNDS half** — a Creature-Bank defender never
  round-ranks (their own-stats balance is separate); `applyNeutralRoundsRank`
  no-ops on any `bankUnit` (pinned at round 12). Banks carry only the STACKS
  half, and the two never stack.
- **Rounds 1-3 are COMPLETELY unchanged even with the module ON** — virtual XP
  = `round - 1` is below every tier's first threshold, so `applyNeutralRoundsRank`
  is a no-op (round-1 CONTROL identical to off).
- **No map-side preview beyond the combat badge** — the ranked guard's veteran
  badge renders on its COMBAT card (the same `unit.unitRank` badge player armies
  use, in `board.tsx`) so the player sees it at placement; there is no new
  map-hex rank marker. The lobby row's description is the discovery surface.
- **Sandbox / PvP / summons untouched**; the computer guaranteed-win smoothing
  still auto-wins its two eligible fights (the win wipes the ranked guards at
  combat-start regardless — pinned). Under PvP-Neutral-Control the controlled
  guards DO fight ranked (emergent — the controller simply drives stronger
  guards).

What runs (each with a failing-if-removed test):
- **ROUNDS half** (mid-game ramp): at the ONE non-bank mint seam
  (`revealNeutralArmy` in `adventure-reducer.ts` — plain neutral cards,
  Random-Town faction packs AND designer level/exact armies all funnel through
  it) every guard is folded to `min(NEUTRAL_ROUNDS_RANK_CAP, rankForXp(tier,
  round-1))` via `applyNeutralRoundsRank`. Tier-scaled: bronze Seasoned r4 /
  Veteran r7, silver r5/r9, gold+azure r6/r11. The stat/ability delta is the
  SAME player veterancy grants (observable: a round-7 bronze guard's Defense
  rises by the Veteran fold and the rank ability is appended). It CAPS at
  Veteran (round-30 bronze is still rank 2, Attack unchanged — no Elite/Legend
  leak) by mirroring a CAPPED virtual XP onto `unit.unitExperience`
  (`neutralRoundsMirrorXp` clamps below the rank-3 threshold), so a mid-combat
  Random-Town Pack→Few recompute (`applyUnitCurrentSide` → `combatUnitRankFold`)
  reproduces the exact capped rank.
- **STACKS half**: a Creature-Bank defender CARRYING a Stack Token fights at
  `NEUTRAL_STACK_RANK` (Seasoned), folded in the bank-recompute branch of
  `applyUnitCurrentSide` (`unit-transforms.ts`) keyed off the UNDERLYING unit
  def's tier/schedule (`neutralStackRankFold` — bank draws mint `tier:
  "bronze"`, so the card's own grade is ignored). The `neutralRankUp` flag is
  threaded there via `unitSideRuleOverrides` (`ruleset.ts`); the fold is gated
  on the LIVE token, so absorbing it (`markUnitRemovedIfNeeded`, stackToken →
  null) reverts the defender to a plain bank card. The Stack-Token +1 stat and
  the lethal-blow absorb are UNCHANGED (the rank is on top). Threads through the
  real `buildCreatureBankCombatUnits` (pinned with Polish size 4 = all-Stacked).
- **Default OFF ⇒ byte-identical**: neither half is reached (the freeze leaves
  `adventure.neutralRankUp` absent, `neutralRankUpActive` false, the bank
  override false), so no fold runs — an exact-equality CONTROL.

## Event deck (Fortress expansion, OPTIONAL rule) — what runs vs. printed nuances

A separate system from the Astrologers Proclaim deck (do not confuse the two).
Data in `src/data/cards/events.ts` (all 20 published Fortress Events, real card
scans fetched by `scripts/fetch-events-art.py`); engine in `src/engine/adventure.ts`
(`drawEventCard` / `resolveEventCard` / `applyEventVisitStep`); toggle
`GameSetupOptions.events` (Game options UI, **default OFF** — an opt-in optional
rule — and "multiplayer only": even switched On, a solo table never gets the
deck; the deck's absence in `state.decks` IS the off switch). A drawn Event pops
the `EventDrawnOverlay` on every client (drawer named, resolves clockwise from
them) plus a feed line. Timing per the rulebook p.15-16: drawn at the start of each Resource
Round AFTER income; the drawer rotates clockwise per draw; effects resolve in
clockwise order starting with the drawer (the FIFO reward queue is the order).
Tests: `event-deck.test.ts` (flow/toggle/rotation/secrecy), `event-cards.test.ts`
and `event-market-cards.test.ts` (every card's observable effect, each failing if
its wiring is removed). `EVENTS_NOT_IMPLEMENTED` is empty — no display-only
Events ship; that registry is the only legal home for a future unwireable one.

**Round-start EVENT BARRIER (both event types, ordered AND parallel play).** When
a round draws an Event (this deck) or an Astrologers proclamation, the WHOLE table
pauses to resolve it FIRST — the Fortress Event is drawn at the FRONT of the
round-start reward queue (before City Hall / resource-die / war-machine offers,
`startAdventureRound`), and while `adventure.eventResolution` is set the ONLY
player who may act is the one whose event choice is currently open. Every other
player is frozen — no quiet move, no start-of-turn draw, no town/morale action, no
ending the turn — until every player has resolved it (enforced in `applyAction`
and offered as `[]` in `legal-actions`; the read helper is
`isRoundStartEventBarrierActive`/`roundStartEventResolver` in `parallel-turns.ts`).
A trailing `round-start-events-resolved` sentinel reward (always LAST, since event
follow-ups `unshift` ahead of it) clears the barrier in `pumpAdventureQueues`,
after which the normal flow (City Halls, turn-start effects, first-turn hand,
turns) proceeds. Automatic Resource income is still applied inline BEFORE the
Event (rulebook p.15), so a player has fresh Resources to spend in the event's own
markets/auctions; only the player-facing steps wait behind the barrier. Instant
proclamations (Dead Silence, movement/morale buffs) queue nothing and raise no
barrier. Pinned in `round-start-event-barrier.test.ts` (Event side: freeze,
event-before-City-Hall ordering, ordered mode, a real Resource-round wrap, and a
no-barrier CONTROL) and `astrologers-parallel-turns.test.ts` (Astrologers side),
each with a CONTROL where the same action succeeds once the barrier lifts.

**Barrier RECOVERY (the barrier may freeze the table, but never strand it).**
Three guards keep a mid-resolution table recoverable, each pinned in
`astrologers-barrier-recovery.test.ts` (fails if the guard is removed):
(1) `eliminatePlayer` drops EVERY interaction the eliminated seat owns — its
queued rewards and open `pendingVisit` (as before) AND an open `pendingChoice`
(returning cards a DECK_SEARCH / Visions scry / Pandora scry had lifted out of
a shared deck — the Pandora scry's undecided AND kept cards go back on TOP of
the draw pile, pinned in `pandora-cards.test.ts` "eliminating the scrying
player mid-scry destroys NO shared-deck cards" — restoring `phase`), plus an
owned `pendingNecromancy`/`pendingFarTileFlip` — so
a seat eliminated mid-resolution (AFK kick, concede) hands the slot to the next
seat in order and the barrier still lifts after the last LIVE seat. (2) A
round-start City-Hall choice whose every option was context-filtered away
(e.g. Cove's remove-an-Artifact arm with no Artifact in hand) is SKIPPED in
`pumpAdventureQueues`, never opened as a zero-option prompt nobody (not even
the AFK-drop driver) could answer. (3) A client that (re)connects mid-barrier
still gets the proclamation/Event overlay: the first-snapshot priming marks the
draw event "seen", so `reconnectRoundStartCues` (components/table/utils.ts,
pinned in `reconnect-round-start-cue.test.ts`) rebuilds the cue from live state
for exactly the barrier-up window — reconnects after resolution stay replay-free.
(4) A mid-Event elimination (AFK kick / concede while a Fortress Event is
resolving) must not leak the shared display: the drawer-owned TABLE bookkeeping
rewards (`EVENT_POOL_CLEANUP`, `EVENT_AUCTION_OPEN`/`_RESOLVE` — playerId-
agnostic steps) are handed to the next live seat instead of being dropped with
the seat's own rewards (`isSharedEventBookkeepingReward`, applied in
`eliminatePlayer` AND in `pumpAdventureQueues`' eliminated-owner skip for
pre-fix snapshots); the dead seat's secret auction bid is scrubbed so it can
never win a lot into a dead hand, and an un-answered 1-for-1 Marketplace deal
they proposed is voided (queued ANSWER steps fall through cleanly — an
already-open Accept button becomes a no-op). Pinned in `event-deck.test.ts`
("Event resolution survives a mid-Event elimination"), each fix
mutation-checked.

Engine readings / deviations a reviewer should know (all deliberate, commented at
the wiring site):
- **Early-game Relic lock (HOUSE RULE)**: Events that GIVE Artifact cards — the
  Shady Auction's lots, the Artifact Merchant's pool AND its discard-top offer,
  Messenger with Supplies' draws, a Magical Forest "draw and view" contribution
  (whose menu option is also hidden when the lock leaves nothing drawable) —
  offer minor/major Artifacts only before round 5; Relics join the offers from
  round `EVENT_RELIC_MIN_ROUND` (= 5, `src/engine/adventure.ts`) on. With split
  decks the Relic deck drops out of the weighted pick; a legacy single Artifact
  deck redraws past Relic cards (tucked under, never consumed). Event-granted
  SEARCHES of the Artifact deck keep the normal BINH progression gates instead,
  and a Relic contributed from a player's own hand stays legal in the Forest
  pool. Pinned in `event-market-cards.test.ts` ("Event — early-game Relic
  lock") with round-5 CONTROLs; mutation-checked.
- **Den of Thieves** resolves for the DRAWER only — its printed "you" with no
  pass-around clause, read like Artifact Merchant's "you" (which the rulebook's
  own example pins to the drawer).
- **A Shady Auction** bids are sequential-but-hidden rather than physically
  simultaneous: each seat picks a gold bid in turn; the amount is stored in
  `adventure.events.auction.bids`, masked in other players' views
  (`player-view.ts`) and logged without the amount, then revealed all at once at
  the lot's resolution. Single highest pays and takes; a tie or all-zero round
  discards the lot.
- **Search timing**: Searches earned by Cursed Swamp's remove-Spells option, the
  Market of Time / School / Garden remove loops and the Withered Hermit pay
  option resolve INSIDE the earning player's slot (front-of-queue rewards —
  `EVENT_SEARCH_FRONT`). A Search granted by a rolled Treasure-die FACE (Crypt's
  gamble, Cursed Swamp's roll, a taken Leprechaun die) queues at the END of the
  round-start queue instead — the engine-wide treasure-face convention the
  Astrologers dice share.
- **Crypt's 2-die gamble** ("any experience face — gain nothing") is its own
  roll: Luck rerolls / Cards-of-Prophecy die-sets do not hook it (they do hook
  Cursed Swamp's standard 2-Treasure-dice roll).
- **Magical Forest** contributions are face-down: pool entries are masked for
  everyone in player views (after the shuffle even the contributor cannot tell
  which entry is theirs); a drawn-and-viewed contribution is shown privately to
  the contributor only. Taking from the pool is a seeded-random pick.
- **Mercenary Camp** "up to 2 from one of the chosen decks" = draw 2 / draw 1 /
  none, all from ONE Neutral deck (Azure included — no printed exclusion;
  Prison's "except for Azure" IS enforced). Recruits pay the printed Neutral
  cost; leftovers recycle to their tier discard piles (engine convention for
  returned Neutral draws).
- **Garden of Revelation** "draw 4 from your discard pile" takes the TOP 4; the
  closing "discard all cards from hand and draw up to your hand limit" runs
  AFTER the earned Searches, in printed order.
- **Cursed Swamp** "cheapest unit" = lowest gold-equivalent printed cost of the
  card's CURRENT side (materials/valuables valued at Trading Post rates); ties
  break by army order. A discarded Neutral-side card recycles to its tier
  discard pile like a combat casualty.
- **Spell/Artifact market draws** ("draw the top Spell/Artifact card") draw
  across BINH's split decks weighted by remaining size — the odds of one
  combined physical deck. A low-level hero may therefore buy an Expert spell at
  the Library/Laboratory/Shrine (an event special-offer; the usual search gates
  are not applied to buying, only the duplicate/uniqueness gate is).
- **Marketplace** "Trade resources using Trading Post rules" is the resource
  exchange ONLY (`TRADING_POST.tradesOnly` hides the sell-a-card / war-machine /
  scroll options at the menu AND at the action guards). The 1-for-1 deal is one
  proposal per player's own resolution; the other players answer immediately
  (the answers cut the reward queue), first accept wins.
- Leftover revealed cards shuffle back into their decks (rulebook default);
  Shrine of the Magic Thought's leftovers go to the Spell discard pile and
  Messenger's declined pair to the Artifact discard pile, as printed.

## Creature Banks (Naval Battles optional rule) — what runs vs. what is deferred

Added in `src/data/map/creature-banks.ts` (data, tested in
`creature-banks.test.ts`) and wired through the combat engine (tested in
`src/engine/creature-bank-combat.test.ts`) with map/combat UI in
`screen.tsx` / `board.tsx` (badge tested in `board.test.tsx`). Leading with what
is NOT done:

**Implemented and engine-enforced (a test fails if removed):**
- **Polish house-rules rollout — current limit:** `polish-bank-sizes`,
  `polish-unit-stacks`, `polish-spell-book`, plus the newer variants
  `polish-reduced-starting-bonus`, `polish-rule-111`, `polish-reduced-surrender`,
  `polish-random-artifacts`, `polish-pandora-search`, `polish-wait`, and
  `polish-quick-combat` are
  implemented and default OFF in both BINH and Legacy. The existing stash-style
  Spell Book and Polish Spell Book are mutually exclusive; enabling Polish
  forces the old toggle off. The multi-round all-rules computer soak and Polish
  economy policy cover the first three; the newer ones are pinned in
  `polish-house-rules-extra.test.ts` (pure helpers + setup/surrender/wait/
  Pandora CONTROLs). Rolled bank sizes specifically are inert when the base
  `creatureBanks` option is off; the lobby greys that toggle out in that case.
  `polish-random-artifacts` requires split Artifact decks and is greyed out when
  `split-decks` is off; it also upgrades Polish Pandora Search by +1 card on a
  "+1" die. Random Artifacts rolls at every Artifact acquisition chokepoint
  (shared-deck Search, dig, black market, event merchant/messenger draws) via
  `polish-random-artifacts.ts`. Audit pass (2026-07, each fix mutation-checked
  in `polish-house-rules-extra.test.ts`): the access LATCH from the roll can
  never outlive its acquisition — taking the discard top, a zero-candidate /
  empty-reveal Search, and eliminating the owner mid-Search/mid-visit all clear
  it (a stale latch silently reused the old roll for the NEXT acquisition);
  Rule 111 is pinned end-to-end (offer only on the OWN home tile at difficulty
  I, swap consumes the once-per-game token, skip does not; rule-off /
  foreign-tile / already-used CONTROLs) and now CHAINS after the Groovy Satyr /
  Judge Dread / Visions pre-battle swap windows instead of being silently
  skipped by them (`revealNeutralArmyAfterSwapWindows`); `polish-wait`'s Waited
  re-activation runs a REDUCED start-of-activation package (no second
  regeneration / poison cube / Fire Wall burn / negative-morale skip check /
  "[activation]" ability reset — only the Paralysis skip still applies) and the
  adventure pump enters the Waited phase even when the active unit dies without
  acting (the corpse-drop path used to end the round over pending Wait tokens);
  a mid-Pandora-Search elimination returns every lifted Pandora card to the
  deck; the Wait and mid-fight Surrender buttons render in the combat command
  dock (`board.tsx` COMMAND_ACTION_TYPES — engine offers existed with no UI
  surface). KNOWN LIMIT: the sandbox-only "Start next combat round" button can
  still skip pending waiters (test mode, deliberate); the reduced starting
  bonus's Minor-Artifact draw returns skipped non-minors under the pile without
  a reshuffle.
- **Polish strength-based Quick Combat (`polish-quick-combat`, default OFF;
  tournament community sheet).** With it ON, Quick Combat at an ordinary guard
  FIELD (VI–VII now eligible) keys off the ARMY, not hero level: the 5
  strongest cards (bronze 1 / silver 2 / gold 3 / azure 4; faction Pack ×2;
  +0.5 per `polish-unit-stacks` layer; a recruited NEUTRAL card counts 1× its
  tier — a single group, and azure exists only as Neutrals, matching the
  sheet's flat "azure 4") must reach `2×FieldDifficulty + X` (easy 1 / normal
  2 / hard 3 / impossible 4; +1 whenever the Unit-Stacks machinery
  `armyUnitStacksActive` is on), equal-or-higher qualifying. Covered + no
  Experience possible (level above the field; a level-7 hero at Ⅶ; Secondary
  Heroes never gain XP) → MANDATORY auto-resolved Quick Combat (same
  QUICK_COMBAT_WON path — Freelancer's Guild bounty, field visit, no XP, no
  Necromancy). Covered + Experience possible → a `polish-quick-combat`
  pendingChoice (fight or quick; "Fight" still offers Cyra's Diplomacy at a
  matching level). NOT covered → the fight is mandatory even for a hero whose
  level beats the field (the classic level auto-win is replaced). Deliberate
  limits: Banks, bank-style outpost/teleport guards and designer EXACT armies
  keep their own no-Quick-Combat rules; the threshold reads the PLAIN scenario
  difficulty (no Astrologers easing); the strength read uses printed tiers
  (Sandro-cloak covers / veteran ranks ignored) and the CURRENT army (an
  emptied army reads 0 even though placement would restore the starting army);
  the AI answers the optional choice by preferring the certain Quick Combat
  (pinned in `choice-policy.test.ts`), and its map-policy engagement heuristics still reason
  by level (it may walk into a real fight it expected to skip — it just fights
  it). Engine in `src/engine/polish-quick-combat.ts`, wiring in
  `startNeutralEncounter`; every claim mutation-checked with rule-off /
  below-threshold CONTROLs in `polish-quick-combat.test.ts` (the sheet's
  worked examples 2×3+2+1=9 and 2×5+3=13 included).
- **Tournament Morale "Search again" (Tournament Book p.54)**: on a table with
  ANY tournament flag frozen onto adventure state (master mode or a granular
  rule) and Morale CARDS off, a player looking at their own revealed Search
  cards may spend the positive Morale token (overflow first) to discard ALL
  revealed cards and perform the same Search (X) again — re-run off
  `DECK_SEARCH.baseCount`, preserving the Tarnum `allowRemove` privilege; the
  Random-Artifacts latch clears so the re-run rolls fresh. Offered in
  legal-actions inside the open DECK_SEARCH and rendered as a button in
  `SearchModal` (its only surface — the modal covers the table). With Morale
  Cards ON the printed repeat_search CARD flow is the only repeat (SPEND_MORALE
  repeat-search throws). Pinned in `tournament-morale-search-again.test.ts`
  (offer/spend/re-run + non-tournament and no-token CONTROLs) and the button in
  `deck-search-mode-modal.test.tsx`.
- With `polish-unit-stacks` ON, a faction Pack card — or a recruited NEUTRAL
  card — at its own Citadel may buy persistent Stack layers with the Population
  flow. One Stack costs that side's printed gold cost plus its tier number
  (bronze +1 / silver +2 / gold +3; azure counted as gold); the side's other
  resource icons, normal recruit/reinforce discounts, and the Freelancer's
  Guild substitution do not apply. Caps are bronze 3 / silver 2 / gold 1
  (azure as gold → 1) — always the ARMY table, even for a unit whose bank-guard
  twin punches higher. Every layer keeps that side's stats and ability. While
  at least one layer remains the card has exactly +1 Attack; lethal damage
  removes one full health layer and carries every excess point through
  additional layers (a Neutral has no Pack→Few flip: once its layers and body
  are spent the card is removed as usual, and a survivor syncs its remaining
  layers back to the army card). Rebirth
  fires first, Creature Bank `stackToken` abilities remain isolated, Pack→Few
  drops the layers, survivors sync back after combat, and keep-troops PvP keeps
  the pre-combat investment. The town row, army panel, and combat card share the
  generated `public/assets/ui/polish-unit-stacks-coin.webp` count badge, coloured
  by the stack COUNT (1 brown / 2 silver / 3 gold — `armyStackBadge.count-N`).
  Covered by `polish-unit-stacks.test.ts`, `town-recruit-shortcut.test.tsx`, and
  `board.test.tsx`. Computer policy buys Stack layers only from surplus after
  completing its core army; the purchase is optional and opens no mandatory AI
  window.
- Stack COST extensions (`polish-stack-features.test.ts`, each with a rule-off
  CONTROL). Leading with the limits: the special offers below price their Stack
  at offer time and do NOT fold Legion vouchers (only the town Population
  purchase does); the neutral-Skeletons free-bronze reward deliberately does NOT
  gain a Stack arm (its printed text grants only the flip); the AI scores the
  new options generically (no bespoke policy). What runs: Necropolis City
  Hall's "reinforce 1 bronze free" pick also offers a FREE Stack on a bronze
  Pack/Neutral card (and stays offered when only a Stack target exists);
  Necromancy's after-combat play also sells ONE Stack at half gold rounded down
  (basic bronze/silver, expert any tier; the card is spent only when the Stack
  lands); Rampart Saplings and the Cove Pub extend their Astrologers'-round
  deals to ONE Stack (half gold rounded up / −3 gold, same tier lists); Conflux
  Garden of Life's freebie can be a FREE Stack on the owned Sprites Pack; ALL
  Stack purchases now pay through the recruit path, so the Freelancer's Guild
  substitutes materials/valuables for missing gold; a Legion piece can be
  reserved for (and is consumed by) one card's Stack purchase (`{kind:"stack"}`
  voucher target — a reinforce voucher never bleeds onto a Stack); and the
  Astrologers' Terrible Plague is WEAKENED by Stacks — a Stacked pack sheds one
  layer (`ARMY_STACK_LOST` with a reason) instead of flipping to Few. ONLY the
  Plague is weakened: Pandora's Silver-Muster reverse shares the
  `FLIP_PACK_TO_FEW` step but keeps the plain whole flip (`step.source`
  disambiguates; pinned with a CONTROL in the same test file).
- With `polish-spell-book` ON, starting Magic Arrows leave the M&M deck and
  become refreshed Book Spells; Might heroes receive one Cast a Spell card and
  Magic heroes two. Every owned Spell acquisition goes to the Book, while
  temporary Tarnum casts and Scrolls retain their normal zones. Casting consumes
  one Cast a Spell from hand and moves only the chosen Spell refreshed→used;
  the whole used side refreshes at the beginning of each game round. Knowledge
  returns the Cast card but not the Spell, Mysticism refreshes the cast Spell,
  and discard-recovery artifacts refresh used Book Spells. Ciele I/IV, Genie
  Wish and both Crown of Dragontooth options have Book-specific paths. The Mage
  Guild searches 3, may grant/buy Cast cards, grants Cast at levels V/VII when
  built, and offers once-per-round 3-gold Rolling Spells (return one owned Spell,
  Search 2). The Spell deck remains merged even when Artifact decks split. The
  existing painted Book UI/art is reused and shows refreshed/used counts; Book
  Spells cannot be burned for Power, while Cast a Spell keeps its printed +1
  Power alternative. Covered by `polish-spell-book.test.ts` and Book modal/hand
  UI tests.
- With `polish-bank-sizes` ON, a bank-eligible reveal peeks the top TWO tokens
  (or one when the pile has one), rolls each candidate's size with seeded Attack
  dice (the sheet table: −1→Ⅰ, 0→Ⅱ, +1→Ⅲ, −2 OR +2→Ⅳ), and opens a MANDATORY
  pre-rotation choice — A / B / **Leave it blocked** (a single candidate offers
  Place / Leave it blocked) — and only then offers tile rotation. Declining sets
  `tile.reservedBankDeclined`, so the post-rotation placement step is skipped
  and the pile stays intact (it was only peeked). The full bank-before-rotate
  chain also runs when the reveal comes through a Subterranean Gate entry OR a
  Monolith/Teleport-Gate token travel into a face-down tile (both routed through
  the same `onMapTileRevealHook` → `beginTileRotation`; pinned in
  `subterranean-gate-choice.test.ts` and `map-tokens.test.ts` "reserves its
  Creature Bank BEFORE rotation").
  The seat's FIRST Ⅱ–Ⅲ (Far) opening rolls ONE die per candidate (a single die
  only reaches Ⅰ–Ⅲ); every later Far opening and every Near bank rolls two.
  Only the chosen token is removed by id after rotation; the unchosen peek
  stays exactly where it was. The house rule ONLY sets the number of Stacked
  defenders — otherwise the bank is a NORMAL Creature Bank. The **size is the
  GUARANTEED count of Stacked defenders**: size N places a standard random-stat
  Stack Token (+1 Attack/Defense/Health or +2 Initiative, absorbing one lethal
  blow — rulebook p.67) on exactly N of the bank's four guards, where the normal
  rule instead rolls the count off Scenario Difficulty and lands each candidate
  only ~77% of the time. There is NO size clamp (every bank can roll Ⅳ = all
  four Stacked) and NO bespoke coin-layer system. **Win rewards are the NORMAL
  bank reward** (`bank.buildReward(X)` with X = the Stacked count = size): the
  same per-bank payout the rulebook scales by X — size Ⅳ simply means all four
  defenders were Stacked. The two unit banks (Dragon Fly Hive / Griffin
  Conservatory) grant the FEW card either way — plain, or (X ≥ 2) carrying a real
  rulebook Stack Token (`ArmyUnitState.stackToken`, the actual game "Stacked"
  unit) — plus the Empower pick, exactly like an ordinary bank win. NEVER the
  Pack side, and NEVER an army-stack layer, so `armyUnitStacksActive` is
  `polish-unit-stacks` ONLY (Polish Bank Sizes no longer activates the army-stack
  machinery) and the reward token stays independent of Polish layers even with
  both rules on. The size marker's coin is coloured
  by size (Ⅰ black / Ⅱ brown / Ⅲ silver / Ⅳ gold, the v1.2 sheet colours) and
  shows the size number; each Stacked defender shows the normal stat Stack Token
  badge. Covered by `polish-bank-sizes.test.ts` (guaranteed-count with a rule-off
  ~77% CONTROL, no-clamp, normal-token absorb, and normal-reward routing, each
  mutation-checked), the bank combat/ability controls, and the bank DOM cases in
  `creature-bank-board.test.tsx` / `board.test.tsx`.
- The 12 banks' defenders, bank-card stats (their OWN stats, no tier — distinct
  from Few/Pack/Neutral), and resource/morale/search rewards scaled by the
  number of Stacked defenders (X). The two sea banks (Shipwreck, Derelict Ship)
  grant NEGATIVE morale (−1; a haunted-wreck house reading), and the Medusa Stores
  per-Stack bonus is a CHOICE of +3 gold OR +1 valuables (not both); both are
  pinned in `creature-banks.test.ts`.
- Gradeless targeting: a bank card carries NO tier ("grade 0"), so the neutral
  AI's same-tier priority can't apply — a bank guard (the `bankUnit` flag) ranks
  its candidate targets purely by distance and attacks the NEAREST. It KEEPS the
  universal ranged rules (a ranged guard still hunts ranged targets first; an
  engaged one must hit an adjacent enemy) — only the tier ordering is dropped.
  Conversely, a bank guard card AS A TARGET is no-tier too, so a graded neutral
  attacker hits it LAST (behind every graded enemy, exactly like a summoned
  unit) — `isNoTierTarget` in `neutral-ai.ts`. Wired in `neutral-ai.ts`
  (`isGradelessNeutralAttacker` / `isNoTierTarget`), tested in
  `creature-bank-combat.test.ts` ("are gradeless and target the nearest enemy"
  and "a gradeless bank-guard card is targeted LAST"), each with a graded
  CONTROL that diverges.
- Tier-specific spells/specialties cannot target a bank defender: with no tier it
  fails every grade gate (Blind, Berserk, Frenzy, Disrupting Ray, Forgetfulness,
  Sorrow/Skip-Activation, Slayer, …). Enforced both at targeting (a tier-gated
  card never offers a bank guard — `effectIsTierGated` in `legal-actions.ts`) and
  at resolution (`gradeRankOfUnit` ranks a bank unit above every grade in both
  `legal-actions.ts` and `reducer.ts`, so a forced cast fizzles). Tested in
  `creature-bank-combat.test.ts` ("exempt from tier-specific spells") with a
  graded CONTROL.
- "Gain a unit" rewards: the Dragon Fly Hive (Dragon Flies) and Griffin
  Conservatory (Griffins) add the recruitable card to the army for free — ALWAYS
  the FEW card, but carrying a REAL rulebook Stack Token (the actual game
  "Stacked" unit — `ArmyUnitState.stackToken`) when X ≥ 2. NEVER the Pack side,
  and NEVER a Polish Unit-Stack layer even with `polish-unit-stacks` on (a
  DIFFERENT mechanism). The `GAIN_UNIT` interaction carries `side:"few"` +
  `stacked:x>=2` → the `RECRUIT_FREE` step's `stacked` flag → the token stat is
  rolled from the SAME `rollStackTokenStat` helper the bank defenders use and set
  on the added army card. In combat the token folds one stat (+1 Attack/Defense/
  Health or +2 Initiative) into the card (`makeCombatUnitFromArmy` /
  `applyUnitCurrentSide`, mirrored onto `CombatUnitState.stackToken`); the SHARED
  absorb path (`markUnitRemovedIfNeeded`, keyed on `stackToken` alone, no longer
  gated on `bankUnit`) discards it FOREVER to soak one lethal blow, then it syncs
  back to the army card at combat end. Tested in `creature-banks.test.ts`,
  `polish-bank-sizes.test.ts` (the don't-confuse-Polish CONTROL) and end-to-end in
  `creature-bank-combat.test.ts` ("adds the gained Dragon Flies card to the army"
  + "the Few card carries a real Stack Token": fold, absorb, and the survivor
  sync-back with an un-absorbed CONTROL).
  HOUSE-RULE bonus: each of these two banks ALSO grants an **Ability Empower
  token** (the `GAIN_ABILITY_EMPOWER_TOKEN` interaction, additive in the reward
  `SEQUENCE`; `player.abilityEmpowerToken`, max storage 1 — a surplus gain while
  already holding 1 forces an auto-use pick on a hand Ability, or is wasted with
  no eligible hand Ability). The token is spent ANYTIME (map, combat participant,
  parallel bystander) via the handler-validated `USE_ABILITY_EMPOWER_TOKEN` on
  one non-Empowered Ability currently IN HAND (hand-only — a discard-pile
  ability is not a target; the old instant `EMPOWER_ABILITY` hand+discard pick
  is a legacy path kept for residual steps). Spending adds the card id to
  `player.empoweredAbilities`, which lets its Expert side be played WITHOUT
  spending a crown for the rest of the game — `abilityExpertIsCrownFree` /
  `canPlayExpertMode` (`ruleset.ts`) are honoured at every Expert-use gate
  (legal-actions offers + reducer guards/spends for reactions, map plays,
  Tactics, Wisdom and Learning). Map HUD chip + combat panel buttons ride the
  engine's legal-action offers only. Designer field rewards can also grant the
  token (`CustomFieldReward.abilityEmpowerToken`, `force: true` — works even
  with the bank house rule off). Tested in `ability-empower-token.test.ts`
  (spend → crown-free Expert, hand-only CONTROL, forged-spend CONTROL, both
  surplus flows), `empowered-ability.test.ts` (the crown-free Expert play, with
  a graded CONTROL), `creature-bank-combat.test.ts` ("a win gains the unit AND
  an Ability Empower token") and `designer-field-rewards.test.ts` (the designer
  grant with a bank-rule-OFF CONTROL).
- Stack Tokens: the Scenario Difficulty (Easy 1 / Normal 2 / Hard 3 /
  Impossible 4) sets the number of token ROLLS, NOT a guaranteed count. Each roll
  targets a distinct candidate card and lands only `STACK_TOKEN_PLACEMENT_PERCENT`
  (77)% of the time, so the Stacked count varies run-to-run — even Impossible can
  come up anywhere from 0 to 4 Stacked defenders (HOUSE RULE; the rulebook places
  a fixed count). A landed token gives +1 attack/defense/health or +2 initiative;
  a Stacked defender absorbs one lethal blow by discarding its token and carrying
  the leftover damage (`markUnitRemovedIfNeeded`). The board shows a gold badge
  naming each token's stat. Tested in `creature-bank-combat.test.ts` ("never
  Stacks more than the difficulty allows" and "rolls each token at ~77%").
- Bank combat: no Quick Combat, no experience; win marks a Black Cube and grants
  the reward. HOUSE RULE (overrides the rulebook): a bank DOES obey the one-Round
  time limit and the spend-1-MP-to-extend rule, exactly like a normal neutral
  fight.
- Battlefield formation (HOUSE RULE): a Creature Bank fight uses a special
  layout — the four guardians are pinned to the four board CORNERS
  (`CREATURE_BANK_GUARD_CORNERS` = 0/3/16/19) and the attacker deploys in the
  central SIX squares (`CREATURE_BANK_ATTACKER_CELLS` = 5/6/9/10/13/14), not the
  usual front/back rows. The shared `placementCellsFor` (engine, legal-actions,
  and `board.tsx` all consume it) and `placeCreatureBankGuards` enforce it;
  tested in `creature-bank-combat.test.ts` ("battlefield formation").
- Placement: with the rule on (`creatureBanks`, default ON), discovering a
  Far (II-III) or Near (IV-V) Map Tile with a Blocked Field offers the
  discovering player a Creature Bank token from the matching shuffled pile
  (`creatureBankTokensFar`/`Near`); accepting carves the Blocked Field into a
  bank (`placeCreatureBank`). The offer is gated on the tile GROUP
  (`creatureBankTierForGroup`): Far→Far pile, Near→Near pile, and — BINH house
  rule — a **Subterranean cavern also offers a bank, drawing from the NEAR pile**.
  Sea/center/starting tiles never trigger it — including sea tiles that DO carry a
  Blocked Field / impassable terrain (e.g. the Cove tile W1). A cavern's bank
  lands on its Blocked Field. The tile-reveal chain is now **bank-then-gate**
  (`continueRevealAfterBank`): the discovering player answers the Creature Bank
  prompt FIRST, then the Subterranean Gate exit is fixed (cycle/confirm when ≥2
  candidate hexes, else auto-carve on the nearest free hex — a bank already
  placed is skipped). Verified in `subterranean-gate-choice.test.ts` (a cavern
  gets a Near bank; `revealPastBank` passes the bank prompt to reach the gate
  exit step). Gate-isolation tests (`subterranean-gates.test.ts`,
  `designed-gate-links.test.ts`) turn banks off to pin the carve directly. A bank is
  reachable only from within its own Tile — you can walk in to fight, but it is
  never a route across a Tile edge to the outside (enforced in `canCrossEdge`,
  even for Pathfinding).
- Bank-card abilities that map to a wired engine effect: Skeletons (rebirth),
  Zombies (resilience), Vampires (life drain), Medusas + Nagas (ignore
  retaliation), Dragon Flies (-2 retaliation attack), Water Elementals (Magic
  Arrow immunity), Gold/Diamond Golems (spell-damage reduction), Griffins
  (unlimited retaliation), Gold Dragons (line breath). Cyclops Stockpile prints
  no ability.
- The former display-only hold-outs are now ALL engine-wired and covered by a
  test that fails if the logic is removed
  (`src/engine/creature-bank-abilities.test.ts`):
  - Imp Cache Familiars — while Stacked, every enemy spell loses 1 Power
    (`bank-familiar-power-drain`).
  - Crypt/Shipwreck Wraiths — on their own attack, the enemy discards 1 card
    (`bank-wraith-attack-discard`; not gated on Stacked).
  - Dwarven Treasury Dwarves / Dragon Utopia Crystal Dragons — while Stacked,
    roll the Defend die like a Defense token (`bank-stacked-defense-token`).
  - Dragon Utopia Black Dragons — while Stacked, +3 Attack
    (`bank-black-dragon-stacked-attack`).
  - Dragon Utopia Faerie Dragons — while Stacked, the enemy cannot cast Spells
    (`bank-faerie-dragon-spell-lock`; blocked at legal-actions AND backstopped at
    resolution).
  - Medusa Stores Medusas — while Stacked, the attack also Paralyzes
    (`bank-medusa-paralyze-stacked`; the ignore-retaliation half always runs).
  The "while Stacked" gate lives in ONE place — `getUnitAbilityDefinitions`
  hides any ability flagged `requiresStacked` until the unit carries a Stack
  Token — so the effect switches off the instant the token is discarded.

**Display-only bank-card abilities:** none. `DISPLAY_ONLY_BANK_ABILITIES`
(`src/data/units/abilities.ts`) is now empty; it remains the explicit, reviewable
home any FUTURE decorative bank clause must be declared in.

All twelve bank rewards are now engine-resolved (`rewardStatus: "implemented"`).
The Pyramid's per-Stack extra — "up to X times, remove 1 Spell/Ability/Artifact
card from hand or discard pile, then Search (5) the matching deck" — runs via the
`REMOVE_THEN_SEARCH_REPEAT` interaction/visit-step (an optional, Done-exitable
loop built in `processPendingVisit`, mirroring `REMOVE_UP_TO`). It is covered by
a test that fails if the logic is removed (`creature-banks.test.ts` for the data
and `creature-bank-combat.test.ts` "Pyramid: a Stacked win …" end-to-end).

**NOT implemented at all (deferred):**
- Bank units still carry the underlying unit's `grade` field for placement and
  display, but it never grants them a tier in play: the gradeless TARGETING/AI
  rules above treat a bank card as no-tier ("grade 0") on BOTH axes — its guard
  targets the nearest, and as a target it is hit LAST — and tier gates exempt it
  via `gradeRankOfUnit`. (The "gain a Stacked unit" reward is NO LONGER a deferred
  house reading: army cards now carry a real rulebook Stack Token via
  `ArmyUnitState.stackToken` — the Few card is granted Stacked, never a Pack. See
  the "Gain a unit" rewards bullet above.)

## Monolith & Whirlpool Tokens (Conflux/Cove, map-designer content) — what runs vs. readings

Location Tokens per rulebook p.35/83, placeable ONLY through the map designer
(`CustomMapTilePlan.token`; no standard scenario ships them). Data in
`src/data/map/locations.ts` (`monolith`, `whirlpool`, category "revisitable"),
engine in `src/engine/adventure.ts` (`resolveTokenTeleport`, `resolveGateTeleport`
and the map-token section) + `adventure-reducer.ts` (`offerPendingTokenPlacement`,
`place-map-token`), setup in `adventure-setup.ts` (`applyCustomMapTokens`).
Behaviour pinned in `src/engine/map-tokens.test.ts` + `map-objects.test.ts`
(observable outcomes — hero position, army size, field state — each
mutation-checked with CONTROLs), the designer UI in `map-designer.test.tsx`, the
board art in `gate-object-board.test.tsx`, save round-trip in
`map-registry.test.ts`.

**CANONICAL forms (one per location — kills the "2 hex 2 effects" class of bug):**
an ON-tile teleporter is a TILE TOKEN (`CustomMapTilePlan.token`, kind
`"monolith" | "whirlpool" | "gate"`); an OFF-tile one is a STANDALONE
`CustomMapObject`. The designer never WRITES a tile-slot object any more — an
armed/dragged teleporter dropped ON a tile writes/moves a `plan.token`, dropped
OFF every tile writes/keeps a standalone object, and dragging one from tile↔off-
tile CONVERTS between the two canonical forms in one batched
`onChange`+`onObjectsChange` (guard dropped with a hint when object→token; pair
always preserved). Legacy saved presets carrying a tile-slot object STILL carve
exactly as before (`applyCustomMapObjects`).

**Teleport Gates (colored Gates) are Monoliths WITH a color** — one per-color
teleport NETWORK each (1 red, 2 blue, 3 green, 4 violet), NEVER connecting across colors or to
Monoliths (and Monoliths/Obelisks never join a gate pair). A gate TILE TOKEN
REQUIRES its `pair`; monolith/whirlpool tokens must NOT carry one (sanitisers
drop/strip violations — `sanitizeTileToken` in `map-registry.ts`). Gate tokens
use the Monolith LAND legality everywhere (`tokenMayCoverFieldDef` / the
`faceDownTokenKinds` land groups now include `"gate"`), carve via
`carveColoredGateField` (its own gate field), and travel like the Monolith
network partitioned by `gatePair` — FULL parity, face-down tiles included:
`resolveGateTeleport` offers every OTHER same-color gate — carved FIELDS (minus
hero-occupied ones) AND same-color gate tokens still riding FACE-DOWN tiles
(`coloredGateDestinations` / `countColoredGates`, the Monolith
`mapTokenDestinations` / `countMapTokens` mirror). 1 free → automatic, 2+ free →
the traveller PICKS via the same CHOOSE_ONE visit-step the Monolith picker uses,
<2 same-color gates → inert note, all occupied → fizzle; arrival never
re-triggers. A guarded gate fights first and only a WIN resolves the network
travel. On the board a gate FIELD (tile-carved or standalone) and a designer gate
TOKEN/palette draw the gate's OWN per-color portal art (`teleportGateImage` —
1 red / 2 blue / 3 green / 4 violet, renamed from yellow) with the colored ring
+ pair badge (`gateHexMark` / `designerTokenImage`); gates are labeled
"Teleport Gate" in the UI. LIMIT (updated 2026-07): a tile may host multiple
tokens on DISTINCT slots; gate TOKENS (like every single-hex placement) may now
carry a designer guard (see the "Designer guards, outposts & one-way monoliths"
section below); the per-color cap is `MAX_GATES_PER_PAIR` (8), counted across
BOTH sources (plan gate tokens + gate objects) for the lone-gate / over-cap
warnings (`validateCustomMapObjects`).

Leading with what does NOT run / deliberate readings:
- **The plain (colorless) Monolith is RETIRED from the designer palette**
  (2026-07): every NEW two-way teleporter is a colored Teleport Gate; one-way
  monoliths are their own objects (section below). LEGACY saved maps with
  Monolith tokens/objects still carve, travel and render exactly as before
  (the Monolith network, the "monolith" Obelisk role and the anime
  `tran_phap_truyen_tong` override are untouched); the whirlpool-only ADD
  picker and the retired palette button are pinned in `map-designer.test.tsx`.
  With 3+ monoliths the TRAVELLER PICKS the destination; with exactly 2 the
  travel is automatic.
- **"Lose 1 unit from your unit Deck" is the traveller's pick** of one army
  card (the card names no unit); a Neutral-side card recycles to its tier
  discard pile like a combat casualty. An empty army loses nothing (noted).
- **Occupied destinations are skipped** (the p.83 "skip the movement if you
  would be stepping onto an allied Hero" note, read for ANY hero): a token a
  hero stands on is not offered, the 3-whirlpool die rerolls its number, and
  with no free destination the travel fizzles with a note.
- **Guarded fields refuse a token placement** (engine safety reading — the
  printed rule bans only Location Tokens/Blocked Fields/victory Locations, but
  overwriting a guard would erase it for free). Towns, Settlements, Mines,
  Obelisks, the Grail and the Dragon Utopia are excluded as the conservative
  "victory conditions" reading. Terrain is enforced: monolith = land hex,
  whirlpool = sea hex.
- **Cross-layer monoliths are allowed** (a designer may knowingly link the
  Surface and the Underground — a Town-Portal-like exception to the
  gate-only-crossing rule; the teleport never consults `canCrossEdge`).
- The designer caps whirlpools at 3 (the physical numbered tokens; the engine
  falls back to traveller's-pick if a hand-edited save exceeds it) and allows
  at most ONE token per tile.

What runs (each with a failing-if-removed test):
- Designer: token per tile — face-up tiles pin a legal slot (picker filtered by
  `legalTokenSlotsForTileDef`), face-down tiles carry a pending token placed on
  discovery. Lone-token maps show the "needs at least 2 to work" warning; a
  lone token in play is inert with the same note. Tokens survive save/load
  (`sanitizeTile`) and are validated again at setup (illegal slots dropped).
  A placed token (monolith OR whirlpool) is DRAGGABLE from ANY tile to ANY
  compatible tile in all four orientation combinations — face-up↔face-up,
  face-up→face-down, face-down→face-up, face-down→face-down — with a plain click
  still opening the token panel. EVERY tile target lands `{ kind, (pair,) slot }`
  on an exact hex: a face-up target's hovered legal printed slot, or one of a
  face-down tile's seven PHYSICAL flower hexes (gated by `faceDownTokenKinds` —
  sea⇒whirlpool, other land groups⇒monolith, starting seats accept none). A
  face-down `slot` pins the physical board hex: setup resolves it to an absolute
  `pendingToken.preferredSpaceId` (`applyCustomMapTokens`), rotating the hidden
  tile in the designer counter-rotates the slot so the pinned hex never moves,
  and the board back renders the token on that exact hex. While dragging, a
  bright PLACE reticle marks the one hex the release will take, with a
  gold/blue legend. A cross-tile move is ONE atomic `onChange` and never changes
  the token COUNT, so the whirlpool supply cap is unaffected; a tile already
  carrying a token stays off-limits. A monolith/gate token dragged OFF every
  tile CONVERTS to a standalone object; a standalone/legacy object dragged ONTO
  a tile converts to a `plan.token`. Wired in `commitTokenMove` /
  `commitTokenDrop` / `commitObjectDrop` / `computeTileTokenTargets` (the shared
  tile-target computation), pinned in `map-designer.test.tsx` ("tile-carried
  token direct manipulation" + "canonical teleporter conversions") and in a real
  browser by `tests/e2e/map-designer-token-drag.spec.ts` (the pointer-grab hex
  under the token art is invisible to jsdom).
- Discovery: revealing a pending-token tile places the token on the designer's
  reserved hex AUTOMATICALLY when it is legal after the reveal rotation
  (`preferredSpaceId` in `offerPendingTokenPlacement`); when random printed
  content makes that hex illegal — or for a LEGACY pending token with no
  reservation — the DISCOVERING player places it on "a Field of your choosing"
  (`place-map-token` choice, glowing candidates; single candidate auto-places,
  zero drops the token). It waits behind the Subterranean-Gate and Creature-Bank
  prompts on the same reveal; gates and tokens never cover each other.
- Travel: entering (or Revisiting, 1 MP) a token teleports to another token of
  the kind. Arrival does NOT re-trigger (no ping-pong). Whirlpool numbers are
  the die faces +1/0/-1 (assigned in plan order); with exactly 3 whirlpools the
  Attack die decides, rerolling the origin's number, per the printed rule.
  Each whirlpool travel then costs the unit toll.
- Travel into a face-down tile (Monoliths, Whirlpools AND colored Gates alike):
  the tile flips for FREE, the traveller rotates it (a Ⅱ–Ⅲ tile runs the standard
  keep/reroll flip), places the destination token (automatic on a legal reserved
  hex, otherwise their pick), and arrives on it
  (`pendingTokenTeleport`; whirlpool toll after arrival — a Gate takes NONE). A
  colored-Gate `TOKEN_TELEPORT_REVEAL` carries its `pair`, so the placement
  carves the SAME-color partner gate (per-color isolation holds through the
  reveal — a red network never reveals a blue/monolith pending tile, and the
  Monolith network never reveals a pending gate). Elimination mid-flow
  auto-places the token (gate carved with its pair) and cancels only the dead
  seat's travel. The gate face-down flow is pinned in `map-objects.test.ts`
  ("Colored Gate travel into a face-down (pending) gate tile" — the both-listed
  pick, the size-2 lone-carved+pending network, per-color/monolith isolation
  CONTROLs, and the mid-flow elimination auto-place).

## Designer guards, outposts & one-way monoliths (map-designer content, 2026-07) — what runs vs. limits

Six features on `CustomMapPreset` / `CustomMapTilePlan` / `CustomMapObject`.
Types in `state.ts` (`CustomGuardSpec`, `CustomCenterHexPlan`,
`OnewayExitMode`), sanitizers in `map-preset.ts` + `src/server/map-registry.ts`,
engine in `adventure.ts` / `adventure-reducer.ts` / `adventure-setup.ts`,
designer UI in `map-designer.tsx` (shared `GuardSpecEditor`). Pinned in
`vii-field-designation.test.ts`, `map-objects.test.ts`,
`outpost-objects.test.ts`, `designed-gate-links.test.ts`,
`map-registry.test.ts`, `map-designer.test.tsx`, `gate-object-board.test.tsx`
(each behaviour mutation-checked, CONTROLs included).

Leading with what does NOT run / deliberate limits:
- **The map AI treats every new object hex as an ordinary (guarded) field** —
  it never plans a path through a one-way link, never seeks a Tent flag to open
  a Barrier, and scores an outpost fight like any guard fight.
- **Outposts (Garrison / Keymaster's Tent / Barrier) are STANDALONE-only**
  (`OUTPOST_OBJECT_KINDS`): a tile-slot/token form is rejected by the
  sanitizer + `validateCustomMapObjects` — they live out of every tile by
  design. One-way monoliths exist in BOTH forms (standalone object AND tile
  token); standalone whirlpools stay refused as before.
- **A Barrier never fights** — it is a wall, not a guard post: the sanitizer
  strips any `guard` off a barrier (and off a one-way EXIT); entry is blocked at
  `classifyHeroStep` unless the hero's owner holds a same-color Tent flag, and
  with the flag the step is an ordinary walk (no visit, no reward).
- **A garrison defense is ARMY-only** (settlement-style): the defender picks
  units only — no hand cards, no hero — and pays 3 gold (towns keep 8;
  `garrisonDefenseCost`). Declining hands the flag over without a fight.
- **No XP from outpost / one-way / teleport-object fights**
  (`isBankStyleGuardLocation`): garrison, Keymaster's Tent, one-way ENTRANCE
  guards AND every single-hex teleport object (Monolith / Teleport Gate /
  Whirlpool) fight BANK-style — no Quick Combat, no experience (combat
  difficulty 0), and NO round limit (`CombatContext.unlimitedRounds` — the
  reducer's round-limit check skips it, no MP-to-extend). A guard assigned to a
  teleport gateway must be truly fought to pass — a high-level hero cannot
  Quick-Combat past it. The guard army still draws at its designed level / exact
  list (`customGuardLevel` / `customGuardUnits`); only Quick Combat, XP and the
  round limit are dropped.
- **An exact-army guard is never Quick-Combat or Diplomacy skipped** — the
  designed army always deploys and fights (minted at fight time from
  `field.customGuardUnits` in `drawGuardArmy`); its difficulty (for XP where
  XP applies) derives from the army's tiers
  (`customGuardArmyDifficulty`: any azure body = Ⅶ, else bronze 1 / silver 2 /
  gold 3 points mapped onto the `NEUTRAL_ARMY_TABLE` rows, capped Ⅵ).
- **The center-hex bonus pays ONCE, to the first clearer** — `centerHexClaimed`
  latches; a later re-capture (Town changing hands) never re-pays. VP is
  recorded unconditionally but SCORES only in VP mode.

What runs (each pinned by a test that fails if the wiring is removed):
- **1. Ⅵ–Ⅶ center-hex editor** (`CustomMapTilePlan.centerHex` =
  `{ guard?, reward?, vp? }`): clicking a Ⅵ–Ⅶ center tile always shows the
  center-hex box — it works on PRINTED objectives (Cyclops Stockpile, Temple of
  the Sea, settlement…) exactly like on the three Ⅶ designations
  (Town/Grail/Utopia). GUARD = level Ⅰ–Ⅶ or an exact army (up to
  `MAX_CUSTOM_GUARD_UNITS` = 6 neutral-deck unit cards, shared
  `GuardSpecEditor`); REWARD = gold/materials/valuables (≤50 each), Treasure
  dice (≤3), Spell/Ability/Artifact deck Searches (≤5 each, with an optional
  Times×Search multiplier), plus the SPECIAL arms (all `CustomFieldReward`
  surfaces — center hexes, objects, tokens, settlements, hex events): ±1
  morale, an Ability Empower token (`force` — granted even with the bank house
  rule off), a free one-shot Statistic-empower menu (hand+discard), main-hero
  XP (≤5), movement (≤3) and Resource dice (≤3) — every special arm a REUSE of
  an existing auto-resolving/menu VisitStep, so AI seats and AFK defaults
  resolve them (`designer-field-rewards.test.ts`, each arm with a CONTROL);
  VP ≤10.
  `materializeTileFields` stamps it on the difficulty-7 field;
  `grantCenterHexBonus` (ONE seam, top of `beginFieldVisit` — reached only
  after the guards are dealt with) pays resources inline and queues dice/
  Searches as a `visit-steps` reward. Legacy `viiFieldReward`/`viiBonus`
  snapshots fold in (`foldLegacyViiBonus`, shared claim latch).
  `vii-field-designation.test.ts`.
- **2. Guards on EVERY single-hex placement** (`CustomGuardSpec`
  `{ level?: 1-7 } | { units: [...] }`): tile TOKENS (monolith / whirlpool /
  Teleport Gate / one-way), standalone OBJECTS, BOTH subterranean gate-link
  halves (`CustomMapGateLink.gateGuard`/`entranceGuard`, per-half ⚔ editor in
  the link rows) and the center hex — one shared stamp
  (`applyCustomGuardToField`). A hero must FIGHT to enter; a WIN clears the
  guard for good (`clearCustomGuard`), a loss/retreat leaves it.
- **3. Teleport ARRIVAL auto-wins the exit's guard** (user rule "auto win when
  get out"): every teleport arrival — Monolith, Teleport Gate, whirlpool,
  one-way, AND stepping OUT through a linked subterranean gate — sweeps a
  still-standing guard on the destination for free
  (`TELEPORT_HERO.sweepGuard` → `autoWinArrivalGuard`: guard cleared, feed
  note, no fight, no XP, no reward). Walking onto the same hex normally still
  fights it.
- **4. Yellow border edges on standalone object hexes**
  (`CustomMapObject.borderEdges`, absolute dirs 0-5 →
  `MapFieldState.borderEdges`): the 🖌 border tool paints object-hex edges
  exactly like tile edges; each sealed edge blocks movement/discovery both
  ways (`isDesignedEdgeSealedBetween` inside `canCrossEdge` +
  `heroCanDiscoverTileAcrossBorders`), rendered with the same gold casing.
- **5. Outposts** (standalone, always revealed, optional bank-style guard,
  winner FLAGS it): **Garrison** — connects tiles as a walkable junction; the
  winner flags it (single owner + light-blue ring); a flagged garrison offers
  its owner a 3-gold ARMY-only defense when an enemy walks in
  (`garrisonDefenderFor` → the settlement defense flow, `pending.goldCost`).
  **Keymaster's Tent** — colored (pair 1-4); EVERY visitor who clears it flags
  it (multi-flag `extraFlagOwnerIds` — flagging never steals the previous
  owner's key); holding a tent flag opens same-color **Barriers**
  (`playerHoldsTentFlag`). `outpost-objects.test.ts`.
- **6. One-way monoliths** (4 colors, `oneway_entrance` / `oneway_exit`,
  standalone or tile token): only the ENTRANCE may carry a guard (bank-style,
  above); winning teleports to a same-color EXIT per the entrance's
  `exitMode` — **random** (seeded die among free exits), **certain** (traveller
  picks, default), **mix** (exits flagged `alwaysPickable` are offered up
  front + one "Roll the die" option over the rest; degenerates gracefully —
  all-always = certain, none-always = random, resolved at CHOICE time via
  `ONEWAY_RANDOM_EXIT` so the pick leaks nothing). Occupied exits are skipped;
  no exit on the map / all occupied = inert note. Arrival never re-triggers
  and (rule 3) sweeps any hand-edited exit guard. Exits are one-way: standing
  ON an exit offers no travel. `map-objects.test.ts` ("one-way monolith"
  suites).
- **7. Teleport Gate reskin** (was "Colored Gate"): per-color PORTAL art on
  the board, the palette and tokens (`teleportGateImage`, 1 red / 2 blue /
  3 green / 4 violet — pair 4 renamed from yellow, `gatePairColor`); the
  location is labeled "Teleport Gate"; the plain (colorless) Monolith is
  RETIRED from the designer palette (legacy maps unaffected — see the
  Monolith section above). One-way monoliths use their own per-color art
  (`onewayMonolithImage`); outposts theirs (`outpostObjectImage`).
  `map-designer.test.tsx`, `gate-object-board.test.tsx`.

## Map objects Global|Specific, hex events & guard visibility (2026-07) — what runs vs. limits

Three designer systems on top of the exact-army/Times×Search branch (whose audit
fixed the pack-survivor persistence, the `viiFields` face-down leak and the
lethal HP-strip — see `map-design-features.test.ts` / `fortress-faction.test.ts`).
Engine in `map-preset.ts` (sanitizers), `adventure.ts` (materialize folds, the
`beginFieldVisit` designer seam), `adventure-setup.ts` (plan carry + hex-event
carve); UI in `map-preset-editor.tsx` (Map objects group), `map-designer.tsx`
(pick flow, popover sections, badges/markers), `screen.tsx` (inspect float).
Pinned in `map-object-plans.test.ts` (engine, mutation-checked with CONTROLs),
`map-designer.test.tsx`, `map-preset-editor.test.tsx`, `map-floats-board.test.tsx`.

Leading with what does NOT run / deliberate limits:
- **Obelisk ROLE stays map-wide** (face-down tiles hide which is which); a
  SPECIFIC obelisk plan overrides guard/reward/VP/break/win only. Mines are one
  kind ("mines all types" share the config — no per-resource split).
- **SPECIFIC eligibility is conservative**: face-up tiles must PRINT the
  location; a face-down tile qualifies only when a Secret landmark guarantees a
  mine (obelisk secrets qualify for obelisks). A plan on a random face-down
  tile would be inert, so the pick never offers one.
- **Grail / Dragon Utopia / Random Town SPECIFIC = the center-hex editor**
  (pick a Ⅵ–Ⅶ center tile; its `centerHex` guard/reward/VP/win covers the
  designated OR printed objective). Their map-wide knobs stay under Victory &
  scoring (contextual to the Win condition — unchanged).
- **Hex-event ambush degradations**: the guard is beaten ONCE globally
  (each-player mode re-pays only the message/reward/VP); an event stamped on an
  already-cleared field springs fight-less; the ambush overwrites a designer
  guard already on that field (designer foot-gun, sanitizer cannot see it).
- **`replaceVisit` suppresses only the TRIGGERING entry** — later entries visit
  normally (not a permanent field replacement).
- **Hex events are invisible but not cryptographic**: player VIEWS redact both
  `adventure.hexEvents` and `mapPreset.hexEvents` (pinned), but the engine
  state carries them — same class as other designer secrets.
- **The win-condition tick is an instant-win foot-gun** by design (same as
  custom win conditions): a `winCondition` on a home-tile object ends the game
  on the first visit. The removed win-condition kinds (control-towns /
  flag-mines / obelisks / defeat-dragon-utopia) are EDITOR-only removals — the
  engine + sanitizer still honour them on legacy maps, and a legacy row still
  renders/edits (its kind joins the row's select).

What runs (each behaviour has a failing-if-removed test):
- **Global|Specific per object kind** (Obelisks · Mines · Settlements · Random
  Town/center): `CustomMapTilePlan.objectPlans.{obelisk,mine}`
  (`CustomObjectFieldPlan` = guard/reward/vp/break flags/winCondition,
  `sanitizeObjectPlans`), per-tile settlement plan + centerHex gained
  `winCondition`. Materialize folds SPECIFIC over global FIELD-BY-FIELD (an
  unset field falls back — the settlement-plan semantic;
  `mergeObjectBreakFlags`), stamps rewards via the shared
  `stampDesignerFieldReward`/designer-reward latch and `designerWinCondition`.
- **Designer "first clear wins"**: `fireDesignerWinCondition` at the
  `beginFieldVisit` seam (after the reward grant) declares the visitor winner
  `viaVictoryCondition` — VP mode routes to scoring, eliminated seats are
  skipped, `declareAdventureWinner` idempotence holds.
- **Hex events** (`CustomMapPreset.hexEvents`, cap `MAX_HEX_EVENTS` 24, one per
  hex): carved to `adventure.hexEvents` keyed by space id (only hexes on a
  placed tile footprint / carved standalone hex — the designer warns, setup
  drops the rest). Trigger runs FIRST in `beginFieldVisit`: an armed guard
  stamps as a designed guard + opens a REAL fight via the registered
  `setHexEventEncounterHook` (straight to combat placement — never
  Quick-Combat/Diplomacy skipped on the surprise; a LATER attempt on the
  now-public guard runs the normal guarded-field flow, where Quick Combat may
  apply); reaching a visit with the guard stamped marks it beaten and sweeps
  the remnants (one seam covers fought/Quick-Combat/Diplomacy wins). Then
  message (feed note) + reward/VP via the shared `payDesignerFieldReward`
  (factored out of `grantCenterHexBonus`), `mode` "first" (record deleted on
  fire) or "each-player" (per-player latch).
- **Designer UX**: the preset editor's "Map objects" group (renamed from "Map
  locations") — 🌍 Global | 📍 Specific tabs per kind (specific lists per-tile
  plans with summaries + "Pick a tile on the map"; a no-eligible-tile state
  shows a ⚠ warning instead of a dead button). The object-plan pick arms
  `MapDesigner.pickRequest`: eligible tiles pulse green, others dim,
  Esc/banner-cancel disarms, an eligible click opens the tile popover (which
  gained "Special obelisk/mine (this tile)" sections — shown ONLY on eligible
  tiles — plus 🏁 win ticks on settlement/center sections). Tiles with specific
  settings wear a ⚔ (🏁⚔ with a win) badge. HEX EVENTS have ONE surface, the
  BOARD (2026-07 — the preset editor's old per-event card section AND its
  "Place an event on the map" pick flow are REMOVED; the editor keeps only a
  one-line count note, `pickRequest` is object-plan-only again): a "Hidden
  event" button in the board's Objects palette (glyph
  `DESIGNER_UI_ICONS.hexEvent`) arms placement — every placed-tile hex AND
  every standalone object hex glows (the event is invisible in game, so it
  SHARES its hex with whatever is printed there; only another event blocks a
  cell, one per hex) — a click places, disarms, and opens the event's own
  docked editor (message / ambush GuardSpecEditor / FieldRewardEditor + VP /
  first-vs-each-player + replaceVisit chips / remove). A placed marker is a
  subtle violet image hex with a full hover tooltip: click opens the editor,
  drag moves it to any other legal hex (object-drag lifecycle: 6px promote,
  hover preview + PLACE reticle, Escape aborts, trailing click suppressed).
  Pinned in `map-designer.test.tsx` ("specific object plans & hex events":
  marker + tooltip, palette arm/place incl. a standalone object hex, editor
  edit/remove, drag move) and `map-preset-editor.test.tsx` (the editor carries
  only the count note — no cards, no pick button).
- **Guard visibility in game**: clicking a designer-altered object that is NOT
  a move target opens the `designedGuardInspectFloat` — exact army (grouped
  labels), level, unclaimed first-clear reward/VP — the move-confirm warning's
  touch-friendly twin (which still covers in-reach hexes).

## Underground designation (per-tile layer override, map designer) — what runs vs. limits

The designer may mark ANY far/near/center/sea tile plan `underground?: true` on
BOTH `CustomMapTilePlan` and `MapTileState` (copied plan→tile at setup by
`applyDesignedUnderground`, face-down included). The tile is then topologically a
cavern — reachable ONLY through a Subterranean Gate, sealed from the Surface at
every other edge — while KEEPING its band identity (group, back art/numeral,
guard tiers, Creature-Bank pile, token legality). "A cavern topologically, but
with printed band content."

- **The ONE seam is `tileLayer` / `planIsUnderground`** (`adventure.ts`).
  `planIsUnderground(plan)` = `group === "subterranean" || (underground === true &&
  group !== "starting")`; `tileLayer(tile)` delegates to it. Everything downstream
  follows AUTOMATICALLY off that one bit: `mapFieldLayer` → `canCrossEdge`'s layer
  check (movement, the AI's `objectiveDistanceField`, Dimension Door reach),
  `recomputeSubterraneanGates` + `planGateChoiceForReveal` (auto-pairing,
  one-gate-per-tile, pick-on-reveal), the discovery gate (`DISCOVER_TILE` /
  `canHeroDiscoverAdjacentTile`), and the preview twin `isCavernPlacement` →
  `planSubterraneanGates` / `unreachableUndergroundCenters`. Never inline a
  `group === "subterranean"` LAYER check — use the predicate.
- **BAND-vs-LAYER audit rule (for future contributors):** every
  `"subterranean"` comparison is either BAND semantics (back art `tileBandLabel`,
  `planBackLabel`/`planGroupLabel`, the `subBand` palette filter,
  `creatureBankTierForGroup`'s NEAR-pile house rule, `VALID_TILE_GROUPS`) — keep
  the GROUP check — or LAYER semantics (gate carve/pair, cross-layer seal,
  standalone-hex layer inference, designer gate-link eligibility, the unreachable
  ring) — use `tileLayer`/`planIsUnderground`. A flagged Far tile still draws the
  FAR bank pile and the "Ⅱ–Ⅲ" back; only its topology flips.

Leading with the DELIBERATE v1 limits:
- **`underground` is stripped from `starting` (seat/home tiles stay Surface — the
  opening ceremony, seat balance and first-discovery flow assume it) and from
  printed `subterranean` plans (redundant).** Only far/near/center/sea keep it,
  as a literal `true` — enforced in BOTH the persistence sanitiser
  (`sanitizeTile`, `src/server/map-registry.ts`) and the setup validator
  (`validateCustomMapPlan`, `adventure-setup.ts`) against `UNDERGROUND_LAYER_GROUPS`.
  Legacy maps / snapshots (field absent) behave byte-for-byte as before.
- **Band content stays band (topology only).** Back art keeps the band back (no
  fake cavern art), the Creature-Bank pile stays keyed by GROUP (a flagged Far
  tile draws the FAR pile; the printed-cavern NEAR-pile house rule stays
  cavern-only), guards/tokens stay band-legal. Whirlpool/Monolith/Teleport-Gate
  token networks remain layer-agnostic (cross-layer links already legal),
  untouched.
- **Designed gate links now belong to any UNDERGROUND-layer plan** (a flagged
  Far tile links to a touching Surface tile exactly like a cavern);
  `validateCustomMapPlan` + `sanitizeTile` KEEP them for a flagged plan and drop
  them from a plain (Surface) plan.

Designer UX: the far/near/center/sea popover gains an "Underground layer" toggle
(writes `plan.underground`; NOT offered on starting/subterranean); a flagged
tile's outline strokes the Underground purple + carries `data-underground` while
keeping its `data-band-group` band label, participates in the cavern gate-link
rows / "+ Gate" button, and gets the red unreachable ring when isolated. In game
(`screen.tsx`) a flagged tile's hexes carry `data-underground` (an always-on CSS
cue, the layer is not secret) and the face-down discovery hint / gate
ascend-descend labels/art fire via the predicate switch.

Behaviour is pinned in `src/engine/underground-designation.test.ts` (layer seam,
setup plan→tile copy, cross-layer movement seal, auto-paired + designed-link gate
carve, discovery, each with a plain-Far CONTROL), the preview==engine parity +
unreachable cases in `subterranean-gate-planning.test.ts`, the sanitiser
(`map-registry.test.ts`), the validator (`custom-setup.test.ts`), the designer UI
(`map-designer.test.tsx`), the in-game cue (`subterranean-gate-board.test.tsx`),
and the AI distance-field seal (`computer/map-navigation.test.ts`) — every claim
mutation-checked.

## Field Overrides & multi-pin tiles (global system; Anime mod content) — what runs vs. limits

`GameSetupOptions.fieldOverrides` (default OFF; auto-ON when a designed map
carries `plan.fieldOverride(s)` pins). Mechanism is CORE (`src/data/map/
field-overrides.ts` registry + `src/engine/field-overrides.ts` +
`tile-hex-placements.ts`); the Anime mod AND the Wake of Gods mod only register
content kinds (WOG: `src/data/wog/field-overrides.ts` — 3 objects, package
`"wog"`, gated on `wog.enabled && wog.newObjects`; see the "WOG New Objects"
bullet). Anime content
(`src/data/anime/field-overrides.ts` — 13 Ninefold objects across two packages,
9 `anime-xianxia` + 4 `anime-isekai`: 11 are pool/palette-gated by the Anime mod
alone (8 xianxia + 3 isekai), and 2 are the Equipment outfitters (Rèn Binh Các +
Adventurer Outfitter) gated on `anime.equipment` via `requiresModule` (§3.13).
Their locations are always in `locationDefinitions` and visits ride the normal
interaction pipeline; every wave-2 kind is a PURE REUSE of the existing
`LocationInteraction` vocabulary — `thuong_hoi_tram`/`capsule_lab` a
Trading-Post/War-Machine shop, `song_bac_quan` a `PAY_TO`+`ATTACK_DIE_TABLE`
gamble, `dai_luyen_khi`/`urahara_shop`/`onsen_ryokan` `CHOOSE_ONE` menus —
effect-tested in `src/engine/anime-locations.test.ts`; `tran_phap_truyen_tong`
joins the real Monolith network. **Art status (2026-07): ALL 13 kinds ship real
512×512 hex art** (`image` set; wave-2 kinds keep their `glyph` as a text
fallback the UI never draws while art exists). The 5 wave-1 hexes were
REGENERATED on-register — the earlier files were mismatched stock-like scenes
(a reading nook, a lighthouse…), not the described locations.
`FIELD_OVERRIDE_ART_PLACEHOLDERS` is now legitimately EMPTY; the
art-or-placeholder + "art wins over glyph" invariant stays pinned in
`field-overrides.test.ts`, `anime-field-override-board.test.tsx` and
`map-designer.test.tsx` via a test-only registered art-less kind. A FUTURE
art-less kind must be declared in the placeholder set; pipeline:
`scripts/place-anime-assets.mjs` + `scripts/anime-art/ART-TODO.md`.) On
tile reveal the
override places FIRST (before Subterranean Gates → Creature Banks → teleport
tokens), pool draws obey `fieldOverridePlacement` (random / manual /
manual-or-refuse; designer pins never refuse), and every Far/Near/Center
face-down tile gets ≥1 pool draw while content is available. A tile may carry
MULTIPLE overrides + tokens (`plan.tokens` / `plan.fieldOverrides`, canonical
arrays; legacy singulars fold in) on DISTINCT slots — the engine drains the
whole `pendingTokens` / `pendingFieldOverrides` queues on reveal. A carved
override hex is Location-Token-protected (no token/gate/second override may
overwrite it — `isFieldOverrideLocation` at every legality gate), and
elimination mid-placement-choice drops the queue and auto-places waiting
tokens (never strands the reveal chain). Pinned in
`src/engine/field-overrides.test.ts`, `tile-hex-placements.test.ts`,
`map-tokens.test.ts` ("multi-token tiles"), `map-registry.test.ts`,
`map-designer.test.tsx` (each behaviour mutation-checked).

Leading with what does NOT run / deliberate limits:
- **Pool override kinds stamped on face-down tiles are readable in raw
  snapshots** (like designer tokens; no player-view masking in V1).
- **Several anime gameplay modules beyond Field Overrides have now shipped** —
  enumerated in the "Also shipped" bullets below (`anime.xianxiaArtifacts`,
  `anime.cultivation`, `anime.heroGrades`, `anime.equipment`, Forced Battle Events,
  and the story/campaign spine); the REMAINING `AnimeModOptions` flags stay
  types/lobby-only (closing note at the end of this bullet). FIRST shipped:
  `anime.xianxiaArtifacts` (Pháp Bảo — 5 ORIGINAL
  Artifact cards, `src/data/anime/artifacts.ts`). Default OFF ⇒ byte-identical
  Artifact decks; ON ⇒ they join the shared Artifact deck(s) (split minor/major/
  relic AND legacy single), riding the same tier/uniqueness gates as core
  artifacts, and always resolve in the card library. What runs (each printed as
  exactly its wired behaviour — no display-only clauses; each mutation-checked in
  `src/engine/anime-artifacts.test.ts`): Túi Càn Khôn = +1 building-materials
  income permanent (remove for +1 materials/+1 valuables); Tụ Linh Bàn = +2 gold
  income CONDITIONAL on the main hero standing in a Town of yours (the NEW
  `resourceRoundGain.requiresHeroInTown` flag, gated at the one income chokepoint
  in `startAdventureRound` via `mainHeroInOwnTown`; unconditional cards
  unaffected — CONTROL-pinned); Phong Hỏa Luân = +2/+3 `GAIN_HERO_MOVEMENT` map
  card (also auto-offered as a neutral-combat continue-window movement top-up);
  Tru Tiên Kiếm = attacker +2/+3 attack reaction; Bát Quái Kính = defender +1/+2
  defense reaction. NOT shipped: Đông Hoàng Chung (army-wide Armored) and Truyền
  Âm Ngọc Giản (remote allied-hero trade) are designed-not-shipped (await new
  arms), and the fancier halves (cleave-exhaust, spell-cancel, bronze-init aura)
  are deferred — see `docs/anime-mod-plan.md` §5.10 V1 STATUS. Art (2026-07):
  all 5 ship REAL 743×1040 card faces built by
  `scripts/build-anime-artifact-cards.mjs` (editable SVG sources under
  `scripts/anime-art/editable/artifacts/`, ornate keyed frame + ink-wash
  masters under `raw/artifacts/`; keep face text in lockstep with the effects).
  `ANIME_ARTIFACT_ART_PLACEHOLDERS` is now EMPTY (a future face-less card must
  be declared there to route to the deck back).
  No lobby UI toggles the anime modules yet — they are set via the setup
  `anime` options payload. Every OTHER `AnimeModOptions` flag (towns, neutrals,
  destiny, …) is still types + lobby state only; `docs/anime-mod-plan.md` is
  the design contract.
- **Also shipped: `anime.cultivation`** (per-hero Cultivation Realm track +
  Heavenly Tribulation, §5.6; read-layer `src/engine/anime-cultivation.ts`,
  behaviour pinned in `src/engine/anime-cultivation.test.ts` + the realm chip in
  `src/components/hero-board.test.tsx`, every grant mutation-checked). Default
  OFF ⇒ nothing stamped, no offers, no events (byte-identical). Realm lives on
  the MAIN hero (`hero.cultivationRealm?`, lazily stamped, absent === realm 0;
  `hero.tribulationWon?` / `hero.tribulationAttemptedRound?` optional). Realms 1
  (Foundation, level ≥ 3) and 2 (Core Formation, level ≥ 5 AND a bank win)
  advance AUTOMATICALLY on level-up / bank-win, one `CULTIVATION_REALM_ADVANCED`
  feed event each. Grants: **+1 hand limit** (folded at the single
  `effectiveHandLimit` site; `permanentHandLimitBonus` stays permanent-only,
  documented); **1 free Attack-die reroll/combat** (standing `AttackRerollSource`
  with `cultivation` flag + `combatStats.cultivationRerollUsed` cleared in
  `makeCombatShell`, honouring every existing reroll-window rule); **+1 spell
  Power** (realm 3, folded beside the Pandora bonus at
  `standingSpellPower` / `resolvedSpellPowerForStackItem`). Realm 3 is reached
  ONLY via the `HEAVEN_TRIBULATION` map action (never forced, ≤ once per own
  turn; the human surface is the map `HeroActionsDock` button, offered only when
  the engine does — `hero-actions-dock.test.tsx`): a seeded 3-Attack-die
  `pendingVisit` gauntlet — each "−1" pays a
  cheapest-first army-card toll (Pack→Few via `FLIP_PACK_TO_FEW` source
  `"tribulation"`, else lost with recycle), survive with ≥1 card → realm 3 +
  Search(1) Artifact, emptied army → retry next turn. As a standard `pendingVisit`
  it inherits parallel-turn gating, the fingerprint backstop, AFK/timeout
  default-resolution and `eliminatePlayer` cleanup (each verified). ADAPTATIONS
  (documented at each wiring site): no Foundation-Pill path (Elixir Pills unshipped
  ⇒ level-3 only); Core Formation gate is "≥1 CREATURE BANK won" (Secret Realms
  unshipped) via a new mod-agnostic `player.bankWins?` counter incremented on
  EVERY bank-win finalize (never module-gated — a default table gains the optional
  field after a bank win, nothing else reads it yet); toll = card loss/flip (map
  cards have no HP). Cross-mod seams tested: Polish Unit Stacks (a Stacked-Pack
  toll sheds a layer, `ARMY_STACK_LOST`, not a flip), the ORIGINAL stash-style AND
  Polish Spell Books (the +1 Power lands on a Book cast via the shared chokepoint),
  WOG Commanders (the reroll behaves as a normal attack-window source, Might dice
  untouched), and mixed anime packages (an isekai module on changes nothing).
  Grant magnitudes are pegged to existing precedents (Pandora hand/Power bonuses,
  the morale reroll source) so xianxia content shares ONE power scale with core /
  WOG / isekai.
- **Also shipped: `anime.heroGrades`** (Hero Grades — a per-hero Merit→grade 0-3
  track + a 3-tier × 3-node passive/skill tree; SHARED by every hero, independent
  of Cultivation). Default OFF ⇒ byte-identical. Read-layer
  `src/engine/anime-hero-grades.ts`, data `src/data/anime/hero-grades.ts`,
  behaviour pinned in `src/engine/anime-hero-grades.test.ts` (each claim
  mutation-checked) + the hero-board chip/picker (`hero-board.test.tsx`) + the
  combat reaction tile (`overlays.test.tsx`). Leading with what does NOT run /
  limits: **HERO_TRAIN + Forced March now HAVE a human map button** — the compact
  `HeroActionsDock` under the hero board (with the Cultivation Tribulation), each
  shown only while `getLegalActions` offers it and dispatching the exact payload
  (`hero-actions-dock.test.tsx`); the grade PICKER + combat command dock remain
  the surfaces for grade-ups and combat/reaction skills; **the AI does not shop
  for the Training Manual** (it declines the optional 2-gold PAY_TO by default —
  buying it is a human play); **per-package fancy grade-label art/fonts are deferred** (the
  register text is bilingual plain text); **combat skills are the MAIN hero's
  fights only** (garrison/secondary offer none — commander-scope). What runs: five
  Merit sources funnel through ONE arm (`gainGradeProgress`) — +1/level-up, the
  two enlightenment-hex riders (+1 on top of the printed reward, runtime-gated so
  module-OFF is byte-identical), HERO_TRAIN (2 MP→+1, once/turn), the Training
  Manual item (bought 2 gold at the two guild shops, played for +2 then removed;
  NEVER decked — `animeNeverDeckedCardIds`), and the generic `GAIN_GRADE_PROGRESS`
  card payload. Crossing a threshold ([3,7,12], a DATA array) auto-grades-up (+1
  point, one event/grade). The tree (pick 1 per tier): passives (Bounty Hunter's
  Eye +1 gold/win, Provisioner +1 materials, Deep Pockets +1 hand — stacks with
  Cultivation Foundation, Arcane Insight +1 Power, Tactician +2 gold) and
  non-card SKILLS with cooldowns (Battle Focus/Iron Will reactions, War Cry
  active — combat once/combat; Forced March map active once/round) reusing the
  commander cast buff machinery. Grade NAMES wear per-family REGISTERS
  (core/xianxia/isekai) resolved by the §2 rule (exactly-one-package → that
  register table-wide, else per-faction family), but mechanics/state never change
  with the label. EXTENSIBILITY: no literal tier count in engine logic (all
  derives from the threshold array length); pure helpers `gradeForMerit` /
  `pickableNodesFrom` are tested with a 4-tier fixture; "add a tier" = append a
  threshold + nodes + one entry per register (§3.11 recipe). Magnitudes pegged to
  existing precedents (Brute gold, Cart/artifact income, Pandora hand/Power,
  commander reaction buffs, Boots movement).
- **Also shipped: `anime.equipment`** (Equipment — always-on hero ITEMS in four
  slots weapon/armor/accessory/mount, one per slot, buying into an occupied slot
  REPLACES with no refund; §3.13). 18 items across three GRADES I/II/III
  (minor/major/relic), cost 4/6/8 gold DERIVED from grade
  (`EQUIPMENT_GRADE_COST`). Each item is BOTH an always-on slot item AND an
  Artifact-deck CARD (`src/data/anime/equipment-cards.ts`, generated from the
  catalog): the cards join the shared Artifact deck(s) — split per-tier AND legacy
  single — ONLY when `anime.enabled && anime.equipment` (`makeSharedDecks`); playing
  one is a mapOnly `EQUIP_HERO_EQUIPMENT` (`cost.removeSelf`) that equips
  permanently, REMOVES the card from the game, and grants one REGULAR (non-equipment,
  non-commander) Artifact of the SAME grade into hand via the shared
  `grantRegularArtifactOfSameGrade` (uniqueness-respecting, null→feed note; sits
  OUTSIDE the BINH tier-progression gate and the Polish Random Artifacts roll on
  purpose — a fixed-grade compensation, not a Search). Default OFF ⇒ byte-identical
  (no shop in the pool, no cards in the deck). Read-layer
  `src/engine/anime-equipment.ts`, data `src/data/anime/equipment.ts`, behaviour
  pinned in `src/engine/anime-equipment.test.ts` + the deck-join/play + grant
  semantics in `src/engine/anime-equipment-cards.test.ts` (each claim
  mutation-checked) + the catalog in `src/data/anime/equipment.test.ts` + the
  hero-board chips (`hero-board.test.tsx`). Leading with what does NOT run / limits:
  **the 6 CLASSIC-line items (2026-07) ship PROCEDURAL PLACEHOLDER art, not
  hand-drawn illustrations** — grade-tinted monogram inventory icons (synthesised
  by `scripts/build-equipment-cards.mjs` when a hand-drawn master is missing) under
  the ornate Artifact-card frame with the full rules text; the 18 anime items keep
  their Codex art. `ANIME_EQUIPMENT_ART_PLACEHOLDERS` stays EMPTY (the placeholders
  are real files on disk, not glyph fallbacks). **The AI never buys equipment** (it
  declines the optional outfitter shop by policy — a documented limit, unchanged;
  register-aware shops added no AI heuristic). **same-slot twins do NOT stack** —
  Cosmos Pendant + Spirit Focus (both accessory,
  +1 spell Power) and Twin-Tail Ribbon + Eternal Sash (both accessory, +1 hand
  limit) share the ONE accessory slot, so only one is ever worn (the earlier
  summaries wrongly claimed the cross-stack; corrected + pinned). The equipment
  spell-power fold therefore tops out at +1 and the hand-limit fold at +2
  (Guild-Issue Mail is armor). **NO
  map-action button for EQUIPMENT in this slice** — buying is only through the two
  outfitter Field Overrides; the hero board is a read-only chip display for items.
  (The other hero map actives — HERO_TRAIN / Forced March (§3.11) and the Heavenly
  Tribulation (§5.6) — DO now have a human button via the map `HeroActionsDock`;
  only equipment purchase does not.) **Art (2026-07): all 24 items ship 512×512
  inventory icons** (`public/assets/anime/equipment/`, drawn on the hero-board chip
  — `.hbEquipIcon`, art wins over the slot glyph; the 18 anime items are Codex art,
  the 6 classic items PROCEDURAL placeholders — above; `ANIME_EQUIPMENT_ART_PLACEHOLDERS`
  is EMPTY, a future art-less item must be declared there for the glyph fallback)
  **plus a framed Artifact-CARD face each** (`public/assets/anime/equipment/cards/<slug>.webp`);
  **no designer pin for the outfitters** (pool-placed only); **combat items are the
  MAIN hero's fights only** (commander-scope; a garrison fight gets neither —
  CONTROL). **UI POLISH (§3.13, 2026-07):** a shared grade chip family
  (`.equipGradeChip.gradeI/II/III`, tinted with the app's EXISTING bronze/silver/gold
  `.tierDot` hues — no new colours; component `src/components/equip-grade-chip.tsx`)
  renders on the hero paper-doll slots + bag rows, the outfitter shop rows (the buy
  label now names the grade), and the WOG commander-artifact window / stats panel
  (grade = the artifact's tier, minor→I/major→II/relic→III). The paper-doll bag is
  GROUPED by slot with a package flavour tag (classic/xianxia/isekai/shared) per
  item and an "upgrade waiting" hint when a higher-grade bag item exists for a
  filled slot (pure presentation; no new engine action). The hero + commander
  windows already carry the faction `theme-<register>` class (verified). What runs
  (24 items, each a proven-seam reuse pegged to a core
  magnitude): Iron-Blood Sword = your units' FIRST declared attack each combat +1
  Attack (a per-combat one-shot folded UNCLAMPED in `getAttackStackDetails` beside
  the combat-script delta, consumed at `finishResolvedAttack` when the attack
  lands; NOT on retaliations); Black Tortoise Mail = the FIRST incoming declared
  attack each combat resolves at −1 Attack (same site, off the attacker); Cosmos
  Pendant = +1 spell Power (`standingSpellPower`, stacks with Cultivation Nascent
  + Arcane Insight → +3); Adventurer's Blade = +1 gold after a won combat (the
  Bounty-Hunter's-Eye hook, stacks to +2 with the grade node); Guild-Issue Mail =
  +1 hand limit (`effectiveHandLimit`, stacks with Foundation + Deep Pockets →
  +3); Supply Satchel = +1 building materials each Resources round (the
  `resourceRoundGain` income loop). The other 12 reuse the same seams — wave-2:
  Marshal's War Horn (commander pre-combat SORT, `wog.commanders`-gated),
  Veteran's Standard (+1 EXTRA Unit-XP/win, `unitExperience`-gated), Windrider
  Saddle (+1 MP each turn refresh), Spirit Crane Mount (free commander revive,
  `wog.commanders`-gated), Blade of the Trial (+1 Attack in combat round 1),
  Alchemist's Satchel (+1 gold/round AND +1 win gold); Miku: Neon Microphone (+1
  first-Spell Power), Stage Costume (first-hit Defense token), Twin-Tail Ribbon
  (+1 hand limit); grade-fill: Lucky Coin (+1 win gold), Spirit Focus (+1 spell
  Power), Eternal Sash (+1 hand limit). CLASSIC LINE (2026-07, package `classic`,
  6 items, 2 per grade, all four slots — each a PURE seam reuse; relics COMBINE two
  seams like Alchemist's Satchel): Crusader's Poleaxe (weapon I, first-attack +1 —
  Iron-Blood Sword seam), Coinward Talisman (accessory I, +1 win gold), Ironbark
  Cuirass (armor II, first-hit Defense token — Stage Costume seam), Courser's
  Barding (mount II, +1 MP refresh — Windrider seam), Horn of Plenty (accessory III,
  +1 win gold AND +1 materials/round), Warden's Aegis (armor III, first-incoming −1
  AND a Defense token). No new engine effect kinds — each fold's item-id list in
  `src/engine/anime-equipment.ts` gained the new id; behaviour pinned per item in
  `anime-equipment.test.ts` (each fails if its fold id is removed). WIN-GOLD still
  caps at +3 (weapon Adventurer's Blade + armor Alchemist's Satchel + ONE accessory
  — Lucky Coin / Coinward Talisman / Horn of Plenty share the accessory slot); the
  spell-Power and hand-limit accessory twins do NOT stack (same slot, above).
  MARKETS: two single-hex Field Overrides — Rèn Binh Các (Blacksmith, xianxia, ⚒) +
  Adventurer Outfitter (isekai, 🎒), both selling the shared Satchel; the shop menu
  is a dynamic `CHOOSE_ONE` of `BUY_EQUIPMENT` options built in `beginFieldVisit`
  (owned item ⇒ absent; affordability gold-gated like PAY_TO in legal-actions + a
  reducer backstop; the leaf deducts gold + equips). REGISTER-AWARE SHOPS (2026-07):
  on top of a shop's own exclusives + shared gear, EITHER outfitter ALSO offers the
  VISITING hero's register line (`equipmentRegisterLineFor` off `factionVisualRegister`,
  deduped) — a classic faction sees the classic line at both shops, azure_breeze
  (wuxia) the xianxia line, fuyuki (anime) the isekai line. So a wuxia visitor sees
  isekai-exclusive gear ONLY at the shop that sells it (never as a register line),
  and classic items appear ONLY for classic visitors. Matrix + grade-in-label pinned
  in `anime-equipment.test.ts` ("register-aware shops (§3.13 matrix)"). FUTURE-TOWN
  RECIPE: a new town only needs a `factionVisualRegister` entry to light up an
  existing register line at every outfitter (no shop edit); for bespoke gear, add
  items in a new package + return it from `equipmentPackagesForFaction`. GATING:
  `FieldOverrideDefinition.requiresModule`
  (new) + a `moduleEnabled` predicate on `listFieldOverrideDefinitions` — with
  `anime.equipment` off the two outfitters appear in NO pool/listing
  (CONTROL-pinned); the 11 existing kinds carry no `requiresModule` and are
  unaffected. DOCUMENTED SWAP: the original "Courier's Charm +1 MP/turn" idea
  became the Supply Satchel because no clean per-turn movement-income chokepoint
  existed (the Boots family grants movement as a one-shot CARD, not a standing
  drip) — a per-turn movement item awaits that arm. AI buys into an EMPTY slot
  from surplus (`gold ≥ cost + 6`) else leaves (no stall, no auto-replace).
- **Also shipped: the cross-mod COEXISTENCE GATES (§3.8)** — the blanket
  guarantees that base game + WOG + xianxia + isekai + Polish all thread into ONE
  coherent game (different displays/power systems, one engine). Four gates, each
  mutation-checked where meaningful:
  - **(a) master byte-identical-when-off CONTROL** (`src/engine/anime-coexistence.test.ts`):
    a scripted 2-human game driven to round 6 serializes IDENTICALLY (setup AND
    final state, event log included) whether `anime` is absent, `undefined`, or
    `DEFAULT_ANIME_OPTIONS` (all-false) — proving the default-off spine adds zero
    behavioural surface. A `enabled:true` build is the sensitivity control (its
    serialized state diverges).
  - **(b) the ALL-ON soak** (`src/server/anime-coexistence-soak.test.ts`,
    reusing `single-player-soak-helpers.ts`): a fixed-seed single-player game with
    EVERY shipped anime module (`enabled, xianxiaArtifacts, cultivation,
    heroGrades, equipment` + global `fieldOverrides`), EVERY WOG module, Creature
    Banks, Polish Unit-Stacks + Bank-Sizes, Morale Cards and the stash Spell Book
    reaches round 6 with ZERO stalls / negative resources (a shorter round-4
    variant swaps in the mutually-exclusive Polish Spell Book; a 3-opponent run
    for breadth). Soft-asserts anime systems are LIVE (overrides carved, Merit/
    grade/realm progression fires). HONEST LIMIT: the AI never buys Equipment (it
    declines the optional outfitter shop by policy), so `EQUIPMENT_EQUIPPED` stays
    0 in the soak — a documented AI-policy limit, not a coexistence failure.
  - **(c) mixed-package no-cross-talk CONTROL** (`src/engine/anime-coexistence.test.ts`):
    carving an ISEKAI field-override kind (content present) leaves the xianxia
    Cultivation/Grade event sequence byte-identical to a xianxia-only run, and the
    grade-name register keys off MODULE FLAGS not carved CONTENT (turning an
    isekai module flag on is the mutation control that flips the register to the
    both-packages "core" fallback).
  - **(d) display coexistence** (`src/components/anime-coexistence-display.test.tsx`):
    a hero board renders realm + grade + all-three equipment chips simultaneously
    with no collision; the map-designer Field Override palette lists a xianxia AND
    an isekai kind together; the hero-actions dock renders under the all-on config.
  - **KNOWN LIMIT surfaced by gate (d):** the two Equipment MARKETS
    (`ren_binh_cac` / `adventurer_outfitter`, `requiresModule:"equipment"`) are
    deliberately gated OUT of the ungated map-designer palette (a conscious §3.13
    decision, pinned in `src/engine/anime-equipment.test.ts` "the DESIGNER-palette
    style listing … also hides the outfitters"). So a designer cannot pin an
    equipment outfitter today — a designer-pinned outfitter is not modeled, and
    the coexistence slice did NOT flip that behaviour (it would contradict the
    prior CONTROL). The outfitters still reach a game via the pool draw when
    `anime.equipment` is on.
- **Also shipped: Forced Battle Events (scripted combats, §3.12)** — a fight on a
  particular MAP FIELD runs SCRIPTED EVENTS (an environment stat modifier, an
  obstacle formation, a timed damage pulse, a flavor announce) at combat-start
  and/or a chosen round-start. Mechanism CORE (`src/data/map/combat-scripts.ts`
  registry + `src/engine/combat-scripts.ts` hook), content a package
  (`src/data/anime/combat-scripts.ts`). Default OFF / non-scripted field ⇒
  byte-identical. Leading with what does NOT run / limits: **V1 is FULLY
  AUTOMATIC — no script effect opens a player window or choice** (the deliberate
  anti-AI-freeze design: nothing new to score, `parallelSlotSignature` untouched);
  **NEUTRAL fights only** (guard fields AND Creature Banks — `context.kind
  "neutral"`; PvP and the combat sandbox fire nothing, CONTROL-pinned); **no
  obstacle auto-pick** (`place-obstacles` takes explicit empty cells); **no
  designer/campaign attachment surface yet** (scripts attach only by a package
  registering off a location id — the growth path is data: a designer `scriptId`
  and campaign set-pieces); **Creature-Bank support is by mechanism, not
  content** (no bank-script ships). What runs (each mutation-checked in
  `src/engine/combat-scripts.test.ts`): the four effect kinds — `environment-stat`
  (combat-long stat modifier read LIVE at attack/defense resolution, the Crag Hack
  `proclamationGroundAttackBonus` seam; added unclamped), `damage-pulse` (effect
  damage through the removal path, the `applyElementalScourge` seam),
  `place-obstacles` (empty cells → `combat.obstacles`, movement already
  obstacle-aware), `announce` (a `COMBAT_SCRIPT_TRIGGERED` feed line —
  `formatEvent` case + `combat-start` cue — so every event announces itself).
  Trigger: combat-start in `finalizeCombatStart` (after `applyCommanderCombatStart`,
  idempotent via `combat.combatScripts.startApplied`); round-start in
  `advanceCombatRound` after the round increments (idempotent via `roundsFired[]`).
  V1 content = the two **Bí Cảnh** scripts on `anime.bi_canh` (Spirit Mist: all
  RANGED units both sides −1 Attack combat-long; Earthvein Surge: round-2 pulse 1
  to the attacker side), gated on `"enabled"` since the anime location only exists
  under the mod. Effects are per-combat; nothing persists to the next fight.
- **No standalone (off-tile) override objects** — on-tile pins only.
- **`linh_tuyen` is +1 movement only** (cleanse not wired, documented at the
  definition); no override kind may claim `starting` tiles (setup skips
  starting plans — enforced by a registry test).
- The lobby "Field Overrides" row lives under Game options; enabling an
  anime-package pin map auto-flips BINH + the Anime crest at map pick/setup.
- **Also shipped (FOUNDATION only): the visual-novel STORY system** (§11 /
  §3.2). Leading with what does NOT run: **no campaign hooks** (`on_start`/
  `on_victory`/… are the next step, §12), **no karma/fate/flag deltas on
  choices** (the destiny substrate is unshipped — those fields are kept OUT of
  the `StoryChoice` type on purpose), **no music** (the overlay reuses the
  existing `adventure/new-week` open sting only, no new sound files), **no e2e**
  (jsdom only), and — 2026-07 — **all referenced story art now SHIPS on disk**
  (backgrounds 16:9 + transparent sprite cutouts under `public/assets/story/…`;
  `STORY_ART_PLACEHOLDERS` is now EMPTY — a future referenced-but-unshipped
  asset path must be declared there so the overlay keeps its theme-tinted
  gradient / initial-letter avatar fallback instead of a broken `<img>`; the
  fallback path stays pinned in `story-overlay.test.tsx` via a forced-placeholder
  mock). What RUNS (each mutation-checked): the bilingual EN/VI scene data +
  registry (`src/data/story/scenes.ts`, `scenes.test.ts` — 2 themed demo scenes,
  registry integrity + art-or-declared-placeholder invariant); the language
  preference (`src/lib/story-language.ts`, default "en", SSR-safe,
  `story-language.test.ts`); the `StoryOverlay` component
  (`src/components/table/story-overlay.tsx`, `story-overlay.test.tsx` — typewriter
  complete-then-advance on click/Space, Skip, history log, EN/VI toggle,
  `nextSceneId` choice chaining in-session, `onDone` at the true end, the
  package theme class `.xianxiaTheme`/`.isekaiTheme`/`.classicTheme` stamped on the component
  ROOT per §3.6 — never the table root); and ONE trigger path — the map-designer
  timed event `{ kind: "story", sceneId }` (`CustomMapPreset.timedEvents` union
  in `state.ts`; sanitized in `map-preset.ts` — unknown `sceneId` dropped;
  round-trip in `map-registry.test.ts`; `applyCustomMapTimedEvents` fires a
  table-wide `STORY_SCENE_TRIGGERED` — engine + wrong-round CONTROL in
  `custom-setup.test.ts`; editor dropdown + scene select in
  `map-preset-editor.tsx`/`.test.tsx`). The client (`page.tsx`) pops the overlay
  ONCE per event id and never on reconnect (the exact MapEventOverlay seen-set /
  prime semantics); story events are table-wide, so eliminated-seat skipping is a
  verified no-op for them.
- **Also shipped: the STORY-MODE campaign hub + Chapter 1 of FOUR campaigns**
  (§12 / §3.3 — the campaign shell around the story system above): the Jianghu
  Chronicle (xianxia), Bin's Otherworld Chronicle (isekai), **Restoration of
  Erathia** (the CLASSIC board-game campaign — `theme: "classic"`, painted
  late-90s chrome, NO anime modules; protagonist Queen Catherine, stand-in
  Castle) and **The Grand Convergence** (the EVERYTHING-TOGETHER crossover: its
  ch-1 injects ALL shipped anime modules + Field Overrides + **WOG
  `{enabled, commanders}`** + **`houseRules: {"polish-unit-stacks": true}`** on
  one map — `CampaignChapterSetup` gained optional `wog` (resolved against
  `DEFAULT_WOG_OPTIONS` to the full record `GameSetupOptions.wog` wants) +
  `houseRules` passthroughs, folded into the `SET_GAME_OPTIONS` injection).
  Client presentation + localStorage around the existing `sp-` room flow, PLUS
  the setup injection below (one small engine change: `buildAdventureFromLobby`
  now carries the lobby's `anime` + `fieldOverrides` into the built game).
  Leading with what does NOT run: **only Chapter 1 of each campaign is
  PLAYABLE** (chapters 2–7 are DATA — `playable:false`, no `setup`, empty
  `scenes` — rendering "in development" once the unlock chain reaches them);
  **protagonists are PRESENTATION** (the playable seat uses a CORE faction
  stand-in: **Jianghu ch-1 = Rampart, Bin ch-1 = Tower, Erathia ch-1 = Castle,
  Convergence ch-1 = Rampart**, anime towns are unshipped); **`mapPresetId` is
  unused** (standard map generation in V1); and **no routes/karma/cheat
  picks/quest-log** (§13 deferred, campaign-only). Only shipped anime flags may
  be set true on a playable chapter (allowlist `{enabled, cultivation,
  xianxiaArtifacts, heroGrades, equipment}` + the global `fieldOverrides`
  toggle) — a dead flag fails `campaigns.test.ts`. Every campaign carries
  codex-generated banner `cover` art (`public/assets/story/covers/<id>.webp`,
  drawn on the /story card, on-disk-pinned in `campaigns.test.ts`). What RUNS
  (each mutation-checked): the campaign registry (`src/data/story/campaigns.ts`
  — four campaigns, 7 bilingual chapters each, `chapterRoomOptions`;
  `campaigns.test.ts`), the ch-1 intro/victory/defeat scenes in `scenes.ts`
  (`scenes.test.ts`; Erathia scenes use the `classic` theme + the
  catherine/kendal sprites + erathia-shore background, Convergence reuses the
  xianxia assets), the progress store (`src/lib/campaign-progress.ts` —
  per-campaign completion + unlock chain, per-room binding +
  intro/outcome/**setupApplied** markers, SSR-safe;
  `campaign-progress.test.ts`), the PURE triggers in
  `src/lib/campaign-triggers.ts` — `campaignSceneToFire` (state+binding+markers →
  scene, UNBOUND-room CONTROL) AND `campaignSetupActions` (chapter →
  `SET_GAME_OPTIONS` + `CHOOSE_FACTION`, LOCKED-chapter CONTROL;
  `campaign-triggers.test.ts`), the `/story` route (theme-scoped campaign cards +
  EN/VI toggle + Begin flow; `src/app/story/page.test.tsx`), the **Story-mode
  entry on `/single-player`** (moved OFF the main menu 2026-07 per user request;
  a Homm3BG spell icon — `/assets/spell-icons/teleport.png` — marks it;
  `single-player/page.test.tsx` + the menu ABSENCE pinned in
  `menu/page.test.tsx`), and the thin table wiring in `page.tsx` (a bound room
  pops intro/outro through the EXISTING `storyCue`/`StoryOverlay` pipeline once per
  room; a game-over win calls `markChapterCompleted`).
- **SETUP INJECTION — a chapter's config is now APPLIED (was carried-only).**
  The Begin flow mints a standard `sp-` room (opponent count only); once the human
  is seated in the setup lobby the table page pushes `campaignSetupActions(chapter,
  seat)` — `SET_GAME_OPTIONS` (the chapter's `anime` + global `fieldOverrides` +
  `difficulty`) then `CHOOSE_FACTION` (protagonist's core faction + its first hero,
  PRESELECTED) — through the NORMAL action pipeline (no new server surface), once
  per room (persisted `setupApplied` marker + a ref). The player still sees the
  normal setup screen and may change any pick before starting. The engine change
  it needed: `buildAdventureFromLobby` had been DROPPING `anime` + `fieldOverrides`
  when building the game from a lobby (only the direct `createAdventureGameState`
  path carried them), so a lobby-set toggle never reached the started game — now
  carried through (defaults OFF ⇒ a plain lobby is byte-identical). Pinned
  end-to-end in `src/server/campaign-setup-injection.test.ts`: a room built with
  the Jianghu ch-1 options STARTS with `anime.enabled + cultivation +
  xianxiaArtifacts + fieldOverrides` ON and the Rampart seat, with a plain
  `/single-player` room (injects nothing) as the all-default CONTROL.

## Anime Towns (`anime.isekaiTowns` / `anime.xianxiaTowns`) & themed mod UI — what runs vs. limits

Two COMPLETE playable factions behind their own anime module flags (default OFF ⇒
byte-identical; `isPlayableFaction(id, animeOptions)` gates every pick surface —
lobby grids, draft rolls, computer seats, Random-Town defenders): **Fuyuki City**
(`fuyuki`, isekai) and **Azure Breeze Sect** (`azure_breeze`, wuxia). Each ships a
7-unit roster (every ability tag a REUSE of an already-implemented engine
ability — pinned per-side in `src/data/anime/towns.test.ts`; the ONE dedicated
new ability is the Fuyuki Casters' `casters-damage-cap`, a ≤1-damage-per-single
attack OR Spell hard cap via `CAP_DAMAGE_PER_ATTACK.includeSpells` — both
Casters sides also carry `elemental-damage`, so they join the die-proof
inventory in `elemental-fixed-damage.test.ts`; behaviour + Nix
spells-stay-uncapped CONTROLs in `fuyuki-casters.test.ts`), 8 buildings on the
SHARED building-effect archetypes (City-Hall choice, dwellings, Mage Guild,
Portal Summon, Artifact Smith, Hall of Valhalla, resource die — nothing bespoke),
2 heroes each with REAL portraits, a starting tile (`A-S1` / `W-S1`), a designed
town board whose bars are seven real contiguous panorama slices (empty↔full
pairs, `townBoardSpecs.barTileImages`), a capitol icon on the same
`town-icon-<faction>.webp` convention as every classic faction
(`scripts/build-anime-town-icons.mjs`), and a WOG commander (Astral Regent /
Sword Saint) reusing the Brute / Temple-Guardian cast arms and the
`vanguard-marshal` / `superior-combat` specialty machinery verbatim.

Leading with what does NOT run / deliberate limits:
- **The combat sandbox never offers the anime factions** (its
  `isPlayableFaction` call passes no anime options — conservative).
- **Unit voices are thematic reuses of complete H3 voice sets** (documented in
  `unit-sounds.ts`); no dedicated voiced package.
- **Hero specialties**: each anime hero owns its OWN specialty set —
  Bin = Sabers specialist, Qingyun = True Inheritors specialist (the three
  generic unit-specialist generators, doubling LIVE on their own faction's gold
  unit); Aoko / Lingxi = themed clones (`rethemedSpecialty`) of the fully
  generic Rion medic / Gem First-Aid sets. They previously borrowed
  Catherine's / Gelu's sets whose doubling (and Gelu IV's "discard a Pack of
  Elves" trade) could never fire in these factions — dead clauses, fixed and
  pinned in `towns.test.ts` ("might specialists double on a unit of their OWN
  faction"). All face-less (native specialty renderer, hero's own portrait).

**Themed mod UI (visual registers).** `src/data/faction-theme.ts` maps a faction
to a register — `classic` / `anime` (fuyuki) / `wuxia` (azure_breeze) — with a
per-register lexicon (Hero Grade/Spirit Rank/Martial Path, Unit deck/Servant
roster/Sect retinue, Drill/Field training/Cultivate, …). The register stamps
`theme-<register>` + `--mod-*` CSS vars on the hero board, town window/board,
army panel and every mod-system window, so the three registers genuinely look
different (leather ridge / astral glass / jade double borders + register art).
The hero-systems row on the hero board opens POP-UP WINDOWS (portal, shared
`heroSystemModal` shell): the Hero-Grade skill tree, the Hero-Equipment
paper-doll (drag-drop + accessible Equip/Unequip buttons over the REAL
`EQUIP_HERO_ITEM`/`UNEQUIP_HERO_ITEM` reducer actions — replaced gear moves to
the hero's `equipmentInventory` bag, never vanishes; forged unowned/wrong-slot
actions rejected, pinned in `anime-equipment.test.ts`), the commander-artifact
window (bind via the engine's PLAY_CARD offers only), **and the Unit Experience
Board (below)**.

**Unit Experience Board window.** The veterancy board is a BUTTON that opens a
pop-up window like the other systems — from the hero board's systems row
(`HeroBoard`, needs `legalActions` for live controls) AND from the army panel
(`ArmyPanel`). Per army card it shows: XP on the tier's REAL thresholds
(milestoned progress track), the rank-by-rank stat DELTAS (not just the
cumulative total), the live folded stats (`base → folded` per stat, Polish-Stack
and permanent bonuses included), the signature ELITE ability with its FULL rules
text (active at rank 3 / locked below), and the engine-offered Drill / Reinforce
/ Stack actions (never invented — the exact `legalActions` entries). Read-only
without `onAction` (opponent info). Pinned in
`src/components/adventure/unit-rank-badge.test.tsx` (window content from real
tier data + Drill dispatch + rule-off CONTROL) and `hero-board.test.tsx`
(systems-row button + CONTROL). Component:
`src/components/adventure/unit-experience-window.tsx`.

## First-round rules, Cove City Hall & bank/opponent UI (BINH house rules) — what runs

Six additions; each engine rule fails a named test if its wiring is removed.

- **First-round hand discards return to your OWN deck, not the discard pile.**
  During round 1 (`state.round === 1`) a card discarded in the opening hand
  refresh (`refreshHand`, `adventure-reducer.ts`) is placed at the BOTTOM of the
  player's `deck` (index 0; the top is the last element) instead of on
  `player.discard` — so an early mulligan does not strand cards in the discard
  for the whole first deck cycle, and (bottom placement) the immediate
  draw-up-to-limit never just hands the same cards back. From round 2 on, discards
  go to the discard pile as normal. Pinned in `first-round-hand-discard.test.ts`
  (round-1 → deck / later-round → discard CONTROL) and `adventure.test.ts`.
- **Each shared deck starts with one card face-up on its discard pile.** At game
  setup (`makeSharedDecks`, `adventure-setup.ts`) every shared deck (Abilities,
  Spells, Artifacts — and their BINH split variants spells-expert /
  artifacts-minor/major/relic) flips its top card onto its discard pile, so each
  discard pile shows one card from round 1. No card is lost — it stays in the
  deck's discard/draw cycle. CONSEQUENCE (a real effect, not decoration): because
  the discard-top is now non-empty, the FIRST search of a deck offers the normal
  "Search the deck, or take its top discard?" option (`openSharedDeckSearch`) —
  the seeded card is a genuine, takeable discard card (subject to
  `canAcquireSharedDeckCard`; a low-level hero only ever searches its allowed-tier
  deck, so it never reaches a high-tier seed's take-option). Pinned in
  `shared-deck-discard-seed.test.ts` (one card of the right kind on every shared
  discard, deck total conserved) and `adventure.test.ts`.
- **Cove City Hall fires on the RESOURCE round, not the Astrologers' round.**
  `cove.city_hall` (`core.ts`) is now a `RESOURCE_ROUND_CHOICE` (the 4-gold /
  remove-an-Artifact-for-1-XP choice) like every other faction's City Hall,
  overriding its printed "each Astrologers' round". The now-unused
  `ASTROLOGERS_ROUND_CHOICE` effect type + its handlers were removed. Pinned in
  `cove-content.test.ts` (queues on round 3 / a round-2 Astrologers CONTROL that
  stays silent) and `describe.test.ts`.
- **A tile's Creature Bank is drawn (known) BEFORE the tile is rotated.** On
  reveal, `beginTileRotation` (`adventure-reducer.ts`) calls
  `reserveCreatureBankForTile`, which normally PEEKS the top token of the
  matching tier pile and stashes it on `tile.reservedBankId`; Polish Bank Sizes
  instead stores both rolled peeks in `tile.reservedBankOptions`, opens the
  mandatory A/B choice immediately, and keeps only the chosen candidate before
  rotation becomes legal. This is still a peek, never a pop: the chosen token is
  consumed by id only after rotation places it, so a Blocked Field lost to a
  Subterranean Gate cannot strand a token. The rotation preview then shows the
  chosen bank's art/name/coin on its Blocked Field. Pinned in
  `creature-bank-combat.test.ts` ("reserved (known) before the tile is rotated":
  reservedBankId set before rotation with the pile intact; the placed bank EQUALS
  the reserved one on accept; decline leaves the pile intact; both clear the
  reservation).
- **A Creature Bank field draws NO borders by default (toggleable).**
  `getTileBorderSegments` (`borders.ts`) takes `showBankBorders` (default false):
  a bank slot draws none of its edges — neither the blocked-field ring NOR the
  tile's outer-impassable arc — so the field reads as fully open. A toolbar toggle
  (`screen.tsx`, shown only when a bank is on the map) restores the classic
  outline (outer arc only, inner open). Pure rendering — movement is unchanged
  (`canCrossEdge`). Pinned in `multi-target.test.ts` ("draws NO borders … by
  default" + a "borders toggled on … outer arc only" case).
  - **The bank being border-free OPENS its outer edge for Tile discovery.** A
    bank replaces a Blocked Field whose slot usually keeps a sealed `outerImpassable`
    arc, which used to block a hero standing on the bank from flipping the
    adjacent face-down Tile. Since a bank now reads as fully open, the discovery
    gate takes a bank exception: `heroFieldSealedForDiscovery` (`adventure.ts`) =
    `isOuterEdgeSealed` UNLESS the hero's field is a `creature_bank`, used by
    `revealTileForHero` (the `DISCOVER_TILE` handler) and `canHeroDiscoverAdjacentTile`
    (the legal-actions offer). `isOuterEdgeSealed` itself is untouched (its
    slot-primitive invariant holds). Discovery only reveals the Tile; MOVING out
    of a bank across a Tile edge stays blocked by the bank's own `canCrossEdge`
    rule ("reachable only from within its own Tile"). Pinned in `adventure.test.ts`
    ("lets a hero standing on a (border-free) Creature Bank discover across that
    edge", with the plain-sealed-field refusal as the in-test CONTROL).
- **Opponent info panel (map AND combat).** `OpponentInfoDock` / `OpponentInfoModal`
  (`components/adventure/opponent-info.tsx`) render a per-opponent button that
  opens a read-only panel of that opponent's PUBLIC state — resources (+income),
  hero (level + `HeroBoard`), current unit deck (`ArmyPanel`) and buildings — all
  already public (player-view masks only hands/decks/spell-books), so this is a
  pure presentation layer with no engine change. Rendered in the map left rail and
  the combat card strip (`page.tsx`). Render-tested in `opponent-info.test.tsx`.

## Pre-hit heals vs Spells/specialties & map-designer timed events — what runs

Two additions; each engine claim fails a named test if its wiring is removed.

- **Pre-hit heals (First Aid Tent, First Aid ability, Cure) fire against
  damaging Spells AND specialty blasts, not only declared attacks.** A
  `SPELL_CAST_STARTED` window whose pending cast would damage a player's units
  (primary target, predicted blast, or Chain Lightning primary —
  `playerThreatenedByPendingDamage`) offers that player the shared heal package
  (`preHitHealReactions`); a non-damaging cast (Haste) never opens a forced heal
  window. Frost Ring / Meteor Shower specialties (`AREA_DAMAGE_PICK_ADJACENT` /
  `AREA_DAMAGE_ALL_ADJACENT` card plays) are DEFERRED onto the resolution stack
  (`tryDeferSpecialtyDamageForHeals`) with a synthetic `SPELL_CAST_STARTED`
  window ONLY when a threatened player can actually heal — otherwise damage
  lands immediately as before. Cure as a reaction scales off standing spell
  Power and runs its cleanse; it counts against the per-round Spell limit.
  LIMITS: the synthetic specialty window is NOT a Spell cast — Resistance,
  Knowledge/Mysticism recall, Power boosts and the Brimstone cube are all gated
  to a real `CAST_SPELL` stack item (their reducer branches would no-op, eating
  the card). War-machine discard damage keeps its immediate path. Pinned in
  `pre-hit-heal-reactions.test.ts` (heal-before-damage event order, the
  no-heal/no-pause CONTROL, and the spell-hate gate with a real-Spell CONTROL).
- **Map-designer timed events are freeform** (`CustomMapPreset.timedEvents`, cap
  `MAX_TIMED_EVENTS` = 32): any round 1–30 × any effect — resources (positive =
  every player GAINS; NEGATIVE = every player LOSES that much, the treasury
  floored at 0 so a player never goes negative; clamp −50..50, ≥1 nonzero),
  hero **experience** (clamp 1–5, every live player's MAIN hero gains it through
  the NORMAL `gainExperience` pipeline — level-ups, hand-limit / expert-use
  bumps, Ability searches, specialty cards, commander points, Learning all
  ride it, never a hand-incremented level), deck Search, clear-cubes (Windmill
  also re-opens Factory Prospector, Water Wheel also Derrick), ±1 morale,
  +movement (stacks on the round's refreshed MPs), Treasure/Resource dice
  (queued per live player), or a feed note. Any entry may also carry an optional
  **`repeatEveryRounds`** (int 2–10): it fires at `round`, then every N rounds
  after (`round`, `round+N`, `round+2N`, …) for the rest of the game (HoMM3
  weekly events) — absent = a one-shot, byte-identical to a legacy preset; each
  firing appends a DISTINCT `MAP_PRESET_TRIGGERED` id so the overlay never
  swallows a repeat (`isTimedEventDue`). Eliminated
  seats and their heroes are skipped. Fired by `applyCustomMapTimedEvents` at
  round start; sanitization clamps amounts, keeps `repeatEveryRounds` only as an
  int ≥2 (99→10, 1 / non-int DROPPED → one-shot), keeps a legacy positive-only
  resources entry byte-identical, and drops unknown kinds
  (`custom-setup.test.ts`, `map-preset.ts`). A second cube-clear kind,
  **`clear_tile_cubes`**, re-opens EVERY black cube on Tiles of chosen groups
  (player-facing bands Ⅰ / Ⅱ–Ⅲ / Ⅳ–Ⅴ / Ⅵ–Ⅶ / Sea / Underground, filtered by
  `MapTileState.group`) with an optional "skip tiles containing a Settlement"
  flag — but NEVER a Creature Bank (it keeps its defeat cube — hard rule) nor
  the Grail / Dragon Utopia victory fields (conservative safety, mirroring the
  token-placement exclusions); standalone designer hexes (no backing tile) are
  skipped naturally. INTENDED consequence: a re-opened field with a printed
  `difficulty` flips `isFieldGuarded` back to true, so it re-fights fresh guards
  and re-earns its reward — the designer's re-open tool. Sanitizer dedupes /
  drops invalid groups (empty → effect dropped) and keeps the flag only as a
  real `=== true`; band labels live in `TILE_GROUP_BAND_LABELS` (adventure.ts,
  Sea/Underground disambiguated from the shared Ⅳ–Ⅴ back numeral). Pinned in
  `custom-setup.test.ts` (group filter, bank/victory exclusions, settlement flag
  with its control, re-guard, no-preset twin, sanitizer) and
  `map-preset-editor.test.tsx` (group chips + skip-settlement checkbox). Each
  firing pops the ornate
  `MapEventOverlay` on every client (one card per batch, once per event id,
  never replayed on reconnect — `map-event-overlay.test.tsx`); the editor's
  per-event cards (round rail, kind dropdown, a "Repeat" every-N-rounds select,
  params incl. negative resource losses + the experience amount, a live preview
  that spells the schedule "round 4, then every 3 rounds" and "lose N gold",
  warnings) are pinned in `map-preset-editor.test.tsx`. The designer's face-down tiles
  draw band-correct printed BACKS (sea/underground Ⅵ–Ⅶ never wear Ⅳ–Ⅴ art;
  `planBackArt`, `map-designer.test.tsx`).

## Neutral-combat & Sorrow refinements (BINH house rules) — what runs

Three engine-enforced additions; each fails a named test if its wiring is removed.

- **Mysticism EXPERT recalls the "pow" cards paid for a Sorrow.** A silver/gold
  Sorrow is paid with power-source ("pow") cards. When the caster then plays
  Mysticism into the kept-open activation-skip window, Mysticism's expert side
  ("also take back all other cards played together with it") now sweeps those pow
  cards back to hand along with the Sorrow — not just the Sorrow. The paid cards
  are captured on `combat.pendingActivationSkipRecall.powerCardIds` when the
  window is held open and returned from the discard in the RECALL_SPELL take-back
  handler (reducer.ts). Knowledge and BASIC Mysticism leave the pow cards spent
  (the control). Pinned in `rampart-inferno-spells.test.ts` ("expert Mysticism
  recalls every pow card paid for the Sorrow", with a basic-Mysticism control).

- **A +Movement card can extend a neutral combat.** Boots of Speed, the Logistics
  ability's expert side, Dessa's Logistics IV/VI, Shield of Naval Glory's sea
  side, AND Equestrian's Gloves' "+1 movement" side — normally map-only — may be
  played in a neutral combat's
  continue-or-retreat window (`awaitingContinue`) to top up `hero.movementPoints`,
  so a hero OUT of movement can buy another round (spend 1 on
  `CONTINUE_NEUTRAL_COMBAT`) instead of being forced to retreat. Optional: the
  player chooses to use it or not at the end of each round. `heroMovementGrantOption`
  (effects.ts) detects the movement side by EFFECT KIND (`GAIN_HERO_MOVEMENT`),
  wherever it sits in a `CHOOSE_ONE` — so the Gloves' movement side at option
  index 1 is caught exactly like Boots' at index 0; the offer lives in the
  awaitingContinue gate (legal-actions.ts, gated on the same expert-use / sea-tile
  conditions the reducer checks); playCard waives `mapOnly` ONLY for that exact
  window (`continueMovementTopUp`) and keeps the window open afterwards. Pinned in
  `neutral-combat-movement-extend.test.ts` (Boots, Equestrian's Gloves, and the
  expert-only Logistics sibling, with a normal-combat control that mapOnly still
  holds) and the UI in `combat-round-over-prompt.test.tsx`.

- **The player picks a neutral's move destination.** When a neutral must MOVE to
  reach the target it will attack and several legal cells reach it, the attacking
  player picks which — a `choose-destination` intent (`neutral-ai.ts`) →
  `neutral-destination` OPTION_CHOICE (reducer.ts) → resume the activation with
  the picked cell forced. It still attacks the rules-fixed target (target
  selection is unchanged); only the landing cell is the player's choice. A single
  legal cell needs no prompt (move-and-attack directly), and an already-adjacent
  guard just attacks. The offered cells are the obstacle-aware reachable set
  (`getLegalMoveDestinations` → `getReachableDestinations`): a GROUND guard's
  offer drops cells blocked or severed by Combat Obstacles, a FLYING guard's
  offer includes cells reachable only by crossing over obstacles (but never a
  cell it cannot land on), and a RANGED guard shoots from where it stands and is
  never prompted. Composes with the existing "player breaks a target tie" choice:
  pick the target, THEN the cell. Board cells are clickable (board.tsx, reusing
  the teleport cell-picker). Pinned in `neutral-move-destination.test.ts`
  (unit-level intents, the obstacle/flying/ranged cases each with a control, and
  an end-to-end test proving the guard lands on the CELL the player picked), the
  composition in `adventure.test.ts`, and the board wiring in `board.test.tsx`.

## Manual guard relocation, first-round Mulligan, Wait/Defend queue, altered-guard warning — what runs

Four additions; each engine rule fails a named test if its wiring is removed.

- **Manual guard control now RELOCATES the guards pre-battle**
  (`GameSetupOptions.manualGuardControl`, default OFF). On top of the existing
  mid-combat command, the FIGHTER now first gets the pre-battle formation-SORT
  window (the same `pendingNeutralPlacement` machinery PvP Neutral Control uses):
  `openNeutralPlacementWindow` opens for `neutralCombatControllerId` (pvp ??
  manual), so the fighter may move/swap the revealed guards within the defender's
  two rows, or "Let the AI place them" (`AUTO_NEUTRAL_PLACEMENT` — resets to the
  rulebook `placeNeutralUnits` auto-placement, window stays open). ONE new rule:
  a SHOOTER (ranged unit) is restricted to `DEFENDER_BACKLINE` — `placeNeutralGuard`
  and `addNeutralPlacementActions` gate the move AND the swap partner through
  `neutralFormationCellsForGuard` (manual-only via `neutralPlacementIsManual`, i.e.
  the controller IS the fighter — a PvP opponent keeps ANY defender-row cell and
  gets no auto-reset). The board drag narrows the drop highlights to a dragged
  shooter's back-row cells (`onDragStart`/`onDragEnd` added to `beginUnitPointerDrag`).
  Computer fighters never open the window (`manualGuardControllerId` returns null).
  Pinned in `manual-guard-control.test.ts` (open/shooter/swap/auto-reset, each with
  a CONTROL) and `pvp-neutral-control.test.ts` (the PvP-side CONTROLs: no shooter
  restriction, no AI-reset offer).
- **First-round hand Mulligan** (`GameSetupOptions.startingHandMulligan`,
  **default ON**; frozen onto `adventure.startingHandMulligan`, absent/undefined
  treated as ON for legacy snapshots). It now gates ONLY the round-1
  start-of-turn hand step: **ON** = the "Discard and draw new" option is offered
  in round 1 (normal play — discards return to the BOTTOM of your own deck per
  the first-round-discard rule above); **OFF** = round-1 `REFRESH_HAND` rejects a
  non-empty discard (draw-only opening hand), enforced in `refreshHand` (a forced
  over-limit `needsHandRefresh` discard still runs so a hand effect cannot trap
  the seat). The old per-card `MULLIGAN_CARD` "replace up to
  `FIRST_ROUND_MULLIGAN_LIMIT` cards after the draw" flow is **retired**:
  `finalizeStartOfTurnHand` seeds `firstRoundMulligansLeft = 0`, so
  `canMulliganStartingHand` is always false and the action is never offered (the
  handler stays for legacy snapshots). Pinned in `starting-hand-mulligan.test.ts`
  (default-on R1 discard allowed, mode-off rejects, round-2 / forced-refresh
  CONTROLs).
- **Wait/Defend combat-queue markers (Polish Wait presentation).** The initiative
  rail (`getActivationOrder`) now RE-QUEUES a Waited unit at the TAIL of the round
  (highest wait token first) instead of stranding it in the greyed "done" bucket —
  so the queue shows waited units re-activating last, like the PC game. DISPLAY
  ONLY (the engine order via `getActivationStep` is unchanged; byte-identical when
  nothing waited). The rail marks a Waited card with an hourglass (+ wait token, un-
  greyed with an amber ring) and a Defending card with a shield; the board unit
  card gains an hourglass "Wait" badge. Pinned in `combat-activation-order.test.ts`
  (the tail re-queue, highest-token-first, with an unwaited CONTROL),
  `initiative-rail.test.tsx` and `board.test.tsx`.
- **Designer altered-guard: shown on the map + a pre-attack warning.** A field
  whose neutral guard was set by the MAP DESIGNER (a custom army, a custom level,
  or a map-wide settlement/obelisk guard) now carries `field.designedGuard` (set by
  `applyCustomGuardToField` + the center-hex stamp, cleared with the guard; a
  printed guard is NEVER flagged). `designedGuardPreview(field)` returns the exact
  army (custom units) or just the Field-Difficulty level (a level/settlement army
  is drawn at fight time). The map hex gets an amber outline + a gear marker and a
  tooltip listing the army; the move-confirm float warns with the army and its
  button becomes "Attack" (Cancel backs out with no move) for an altered fight
  only. LIMIT: the warning rides the deliberate map-move confirm — a teleport
  (Dimension Door) onto an altered field is not gated. Pinned in
  `designed-guard-preview.test.ts` (marker + preview, printed-guard CONTROL),
  `obelisk-roles.test.ts` (settlement integration) and `map-floats-board.test.tsx`
  (the map marker + the warn/Attack float, with a printed-guard CONTROL).

## Combat draw-only abilities, Knowledge recall & value-based Power costs (BINH house rules) — what runs

Five additions; each engine rule fails a named test if its wiring is removed.

- **Combat draw-only Sorcery / Offense / Armorer.** On your own combat
  activation (the active unit is yours and has not attacked), Sorcery
  (`ADD_SPELL_POWER`) / Offense / Armorer (`ADD_COMBAT_STAT`) — each a
  "+stat/+Power, then draw a card" ability — may be played JUST for the draw,
  with no attack/spell window open. The stat/Power fizzles (no stack, no target),
  only the "then draw" rider resolves. Offered as `combatDrawOnly` in
  `legal-actions.ts` (basic only — a fizzled stat wastes no crown); the draw
  fires in `playCard` when `!state.reactionWindow && state.stack.length === 0`.
  Pinned in `sorcery-draw-rider.test.ts` ("Combat draw-only …", with an
  off-turn CONTROL and the stat-fizzles assertion).
- **Sorcery banks +Power for the next spell if the unit has not moved.** A
  draw-only Sorcery played before the active unit has moved
  (`!movedThisActivation`) banks its Power on
  `combatStats.pendingDrawRiderSpellPower`; the NEXT spell cast consumes it in
  `performSpellCast` (folded into `stackItem.modifiers.spellPowerBonus`). Cleared
  on consume and each combat round. Pinned in `sorcery-draw-rider.test.ts` (bank
  + cast lands the +Power, with an already-moved CONTROL that banks nothing).
- **Knowledge (basic OR expert) recalls ANY spell — combat AND map.** In combat
  the recall is the pre-existing `RECALL_SPELL` reaction to `SPELL_CAST_STARTED`
  (any spell you cast) and the attack-window instant recall; both basic and
  expert are offered whenever the caster holds Knowledge (crown for expert).
  Pinned in `knowledge-recall-instants.test.ts` (cast-window basic + expert,
  attack-window instants). On the map — where there is no per-turn spell limit —
  every resolved map Spell (View Air, Dimension Door, Fly, Town Portal, Water
  Walk, …) offers a Knowledge recall: BASIC takes the Spell back for FREE (no
  crown), EXPERT (when a crown remains) also raises the combat-round spell limit,
  Empowered Knowledge always recalls with the limit bonus crown-free. Wired in
  `playCard` (the map recall offer) + `processPendingVisit`
  (`KNOWLEDGE_RECALL_MAP_SPELL` with a `mode`). Pinned in
  `map-movement-spells.test.ts` (basic no-crown / expert crown+limit / zero-crown
  basic) and `view-spells.test.ts` (Knowledge retakes View Air).
- **Map Power-tier spells cast then add Power (like combat / Visions).** View
  Air, View Earth, Dimension Door, Fly, Water Walk and Town Portal are a single
  **Cast** action — no up-front tier pick / cost picker. The spell is spent,
  then a `map-spell-boost` window offers the same Power sources combat uses:
  hand/Book power-source discards (printed value; Expert Power + crown),
  **School of Magic expert** (discard the permanent for +2 over the free basic
  +1, needs crown), and **Basic X Magic expert** (+3, permanent stays, once per
  cast, needs crown) — or "Resolve now". Highest printed tier with
  `minPower ≤ final Power` resolves (Orb doubling applied at resolve). Starting
  Power = standingSpellPower (school basic, Astrologers, Pandora, cultivation /
  grade / equipment) + specialty school auras + map Sorcery/Scales bank.
  Printed CHOOSE_ONE tiers stay as the effect table only. Pinned in
  `map-spell-cast.test.ts` (School expert, Basic Magic expert, wrong-school
  CONTROL) + `view-spells.test.ts` + `map-movement-spells.test.ts`.
  **Both Spell Books:** old stash Book may burn one Book Spell for +1 Power
  (once/turn) and Knowledge can return a Book-cast map Spell to the Book;
  Polish Book needs Cast a Spell to cast, never burns Book Spells for Power
  (spare Cast a Spell may still +1), Knowledge returns only Cast a Spell (spell
  stays used), lasting Fly stays used not ongoing — pinned in
  `map-spell-book-parity.test.ts` (each system + CONTROLs).
- **Expert Power payment (crown) works for combat reactions too.** The same
  value-based `powerCost` costs paid in combat — Sorrow's silver/gold skip,
  Alamar's / Jeddite's lethal-save Resurrection, any future one — accept
  `costCardModes` through the reaction path (`PLAY_REACTION` / `PLAY_REACTIONS`
  → `applyReactionPlayCore` → `payOptionCardCost`), so one Expert Power card +
  a crown reaches a Power-2 cost. Affordability (`canAffordCardCost`) greedily
  assigns available crowns to the sources that gain most, on the map AND in
  combat. The reaction cost pickers (`overlays.tsx` batch tray +
  `SpellBookSaveTile`) show a per-source Crown toggle and count each expert cost
  card against the crown budget. Pinned in `lethal-save-sources.test.ts` (silver
  save paid with one Expert Power + crown; a no-crown CONTROL rejects it) and
  `overlays.test.tsx` (the Crown toggle emits `costCardModes` and the engine
  accepts it, with a no-crown CONTROL that hides the toggle).

## Map spell-power bank, map notice icons, teleport-guard bank fights & Rule 111 UI — what runs

Five additions; each engine claim fails a named test if its wiring is removed.

- **Map spell-power bank (Sorcery / Scales on the MAP).** The combat "+Power,
  then draw" bank (`combatStats.pendingDrawRiderSpellPower`) has a MAP twin:
  playing an `ADD_SPELL_POWER` draw-rider on the map banks its +Power onto
  `player.mapSpellPowerBank` and draws a card. That bank is the **starting
  Power** of the next map Power-tier cast (cast-then-boost window above) — a
  banked +1 alone auto-resolves View Air at the materials tier with no power
  cards in hand. Zero in combat (`mapSpellPowerBankAvailable`); consumed when the
  cast opens; cleared on hero **move** and the owner's next turn. CHOOSE_ONE
  draw-rider artifacts (Scales / Tunic / Armor of Wonder) stay map-playable
  draw-only. Pinned in `map-spell-power-bank.test.ts` (bank + cast, clear-on-move,
  Scales, no-bank CONTROL).
- **Polish "Cast a Spell" is NEVER a Power source (crash fix).** The enabler is
  excluded from `cardCanBoostPower` / `spellPowerValueOfCard`, so it never appears
  as a map-spell-boost discard (or a combat Power cost). Its combat `asPowerBoost`
  discard stays. Pinned in `map-spell-power-bank.test.ts`.
- **A teleport-gateway guard fights BANK-style (no Quick Combat, no XP).** A
  designer guard on a single-hex Monolith / Teleport Gate / Whirlpool
  (`isTeleportObjectGuardLocation`) must be truly fought to pass — a high-level
  hero can no longer Quick-Combat past it — and the fight grants no experience
  (combat difficulty 0), like a Creature-Bank guard. Unlike a designer OUTPOST it
  keeps the normal Round limit and the continue-or-retreat window (only Quick
  Combat and XP are dropped). The dedicated branch in `startNeutralEncounter`
  pins `customGuardLevel` so the difficulty-0 fight still draws the real designed
  guards. Pinned in `map-objects.test.ts` (a guarded Gate / Monolith opens a
  difficulty-0 bank-style fight, exact-army AND level, with the no-QUICK_COMBAT
  assertion as the mutation control).
- **Map-visit notice = reward chips, not a "mass of text".** A treasure-chest /
  mine / resource visit's outcome is shown as a compact row of icon chips
  (resource token / experience / morale glyph + a short "+N" or "+N/turn" income
  label) built from the visit's follow-on events by `noticeRewardsFromEvents`
  (`utils.ts`, pure), instead of the old `formatEvent` bullet list — the dice
  cube overlay still animates the roll, and the chips are its RESULT. A mine
  (no dedicated notice art) now wears its RESOURCE token instead of the pickaxe
  emoji (`cue.iconImage`). Chips REPLACE the text lines; an outcome with no
  material chip (e.g. an Artifact Search) falls back to text. Pinned in
  `notice-rewards.test.ts` (the chip derivation with CONTROLs) and
  `overlays.test.tsx` ("renders reward chips … and a mine's resource token").
- **Rule 111 tray (Polish house rule) = a two-column either/or.** The
  `PromptTray` (`screen.tsx`) renders the Rule-111 choice as a purpose-built
  layout — a "Use Rule 111: replace the Guard" swap on the LEFT, the drawn
  guard's card face with an "Accept the guard" button on the RIGHT — instead of
  a flat row of look-alike buttons. Pure presentation over the existing
  `CHOOSE_OPTION` accept (optionIndex 0) / replace (1..N) actions. Pinned in
  `rule-111-choice-art.test.tsx`.

## Map UX & rules batch (2026-07) + audit fixes — what runs vs. limits

Nine changes shipped together; a follow-up audit fixed the holes marked (AUDIT
FIX). Each engine claim fails a named test if its wiring is removed.

- **Free tile rotation (seal gate OFF).** `TILE_ROTATION_SEAL_GATE_ENABLED =
  false` (`adventure-reducer.ts`): every rotation of a revealed/placed tile is
  offered AND Confirmable — the "border lines seal the tile off" hard reject and
  the placing-hero doorway gate are both disabled. Yellow arcs still seal
  MOVEMENT after materialize (untouched), the pure geometry helpers
  (`isTileRotationConnected` / `canHeroReachPlacedTile`) stay live for AI
  scoring, and flipping the flag back to `true` restores both gates. Pinned in
  `adventure.test.ts` ("offers every far-tile rotation …") and the e2e rotate
  flow.
- **Spell searches take only the face-up TOP discard, like every other deck**
  (REVERTED per the explicit 2026-07-21 user demand — the ef3b0ac "take ANY
  acquirable discarded spell + pick the face-up top" invention was never
  requested and is gone). `openSharedDeckSearch` offers at most ONE discard take,
  the `discardTopId` path (still `canAcquireSharedDeckCard`-filtered), for Spell
  decks exactly as for Abilities/Artifacts — no `discardPickCardIds`, no per-card
  menu. `resolveDeckSearch` pushes ALL unkept revealed cards straight back to the
  discard (no `spell-discard-top` face-up pick is ever opened). LEGACY-RESOLUTION
  SAFETY (a live room could still hold an in-flight `spell-discard-top` choice
  when the server updates): the `chooseOption` handler, the `eliminatePlayer`
  parked-card return, and the `spellDiscardTopPick` type are KEPT so such a
  choice still resolves — but it is never CREATED again. The morale
  repeat-search / Pendant-of-Courage post-Search offers (`maybeOpenPostSearchOffers`)
  predate ef3b0ac and are unchanged. Pinned in `spell-discard-pick.test.ts`
  (single top-only take, a buried acquirable spell NOT offered = the user's
  CONTROL, the take, the school-fetch-still-after-it, and the legacy in-flight
  resolution) and `deck-search-mode-modal.test.tsx` (top-discard face + grouping).
- **The deck-search menu's "Search (N)" tile is HONEST about a standing
  Scouting override.** A `SEARCH_COUNT_OVERRIDE` (a pre-played Scouting) is
  consumed only at REVEAL (`applySearchCountEffects`), never when the up-front
  discard/fetch menu is built — so a lingering override left the tile reading
  "Search (2)" while the Search then peeked 3 (the reported Derelict Ship bug).
  `openSharedDeckSearch` now labels the Search tile with the EFFECTIVE reveal
  count and names its source — "Search (3) — Scouting override (base 2)" —
  via `searchCountOverrideLabel` (mirrors `applySearchCountEffects` exactly so
  label == reveal); the override is still NOT consumed by the label read, so an
  up-front discard/fetch keeps it intact for a later search. The Astrologers
  `SPELL_SEARCH_WIDEN` path bumps `baseCount` itself, so it stays the plain
  "Search (4)" phrasing (label == reveal, no "override" note). The bank Search
  COUNT itself is honest end-to-end (X = Stacked defenders = size). Pinned in
  `deck-search-label-honesty.test.ts` (bank X→reveal, override label + reveal,
  Astrologers control, school-fetch controller scoping). Presentation: the
  `DeckSearchModeModal` now GROUPS the look-alike tiles under headings (Search
  the deck / take the top discard / draw from your School of Magic) — visual
  only, option indices unchanged — pinned in `deck-search-mode-modal.test.tsx`.
- **Manual guard control is FREE play.** `neutralControlMustAttack` returns
  false without PvP Neutral Control — the manual fighter may move, attack,
  Defend, Wait (polish-wait), hold or use tokens; only a REAL PvP Neutral
  Control opponent is bound by `pvpNeutralControlMustAttack`. (AUDIT FIX): the
  read is per-combat — with the PvP option ON but nobody left to take the
  guards (`pvpNeutralControllerId` null), the manual fighter still gets free
  play, never the sub-toggle. Polish-wait re-activation and Astrologers frenzy
  keep their own force-attack paths. Pinned in `manual-guard-control.test.ts`
  (free-control cases + the PvP-corner case with a live-opponent CONTROL).
- **Two-way exit modes on Gates AND Monoliths** (shared one-way vocabulary:
  certain / random / mix + always-pickable destinations, default certain =
  classic traveller-picks): stored on the origin field
  (`onewayExitMode`/`onewayAlwaysPickable`), read in `resolveGateTeleport` /
  `resolveTokenTeleport`. The 3-whirlpool die and the 2-monolith auto-travel
  are unchanged; mix rolls its random pick ONCE per visit open. (AUDIT FIX ×3):
  a face-down designed token KEEPS its mode when the reveal places it
  (`placeMapToken` now carries the extras for gate + monolith, like one-way); a
  "mix" always-pickable destination that is still a PENDING token on a
  face-down tile is offered up front (`tokenDestinationAlwaysPickable` — the
  shipped code read a non-existent field and pending tiles always fell into the
  roll pool); and STANDALONE gate/monolith objects share the whole vocabulary
  (sanitizer + `applyCustomMapObjects` + designer object panel + token↔object
  conversion carry). Pinned in `two-way-exit-modes.test.ts` (reveal parity,
  pending-tile mix, standalone carve + sanitizer, each with CONTROLs).
- **Far (Ⅱ–Ⅲ) pool never carries an Obelisk tile** (house rule; Obelisks live
  on Ⅳ–Ⅴ Near): the far pool filter strips obelisk-bearing tiles (Factory &F1)
  at setup, and the Grail obelisk shortfall pulls from the NEAR pool only (12
  near obelisk tiles exist — supply is safe). Designer exact pins bypass the
  pool. Pinned in `far-pool-no-obelisk.test.ts` +
  `expansion-content.test.ts` (catalog minus the obelisk far tiles).
- **Power-boost windows are MASKED for other viewers** (AUDIT FIX): the
  `map-spell-boost`, `visions-boost` and `fortune-boost` option labels name the
  caster's PRIVATE hand cards ("Discard <card> …"), so `player-view` scrubs
  labels + payload card ids for non-owners (visions/fortune had leaked since
  they shipped — the new window copied it; all three are masked at the one
  chokepoint). Pinned in `map-spell-cast.test.ts` ("hidden-info safety").
- **VP surrender note + scoring menu (pure UI over engine-real rules):** the
  pre-battle escape button and the VP dock note that surrender awards the
  opponent 1 VP — the ENGINE side (`recordVpSurrender`, 1 VP vs the full 3 VP
  main-hero defeat) predates this batch and stays pinned in
  `victory-points.test.ts`; the scoring overlay gains Close + "Go to main menu".
- **Presentation only:** treasure/resource/attack die GET chips on visit
  notices (`noticeRewardsFromEvents`, `notice-rewards.test.ts`), Polish
  Unit-Stack badges on the combat placement panel
  (`placement-panel.test.tsx`), and face-down tiles render EVERY pending token
  (multi-token tiles, whirlpools included — public designer info) instead of
  only the legacy first entry (`screen.tsx`).
- **LIMIT (AI):** computer seats answer the new `map-spell-boost` choice
  through the GENERIC option scorer (bounded — each boost pick shrinks the offer
  list — but greedy: no bespoke tier-value policy), and the AI never sets
  designer exit modes.

## Map settings defaults (designer → lobby, seed-at-pick) — what runs vs. limits

Three OPTIONAL defaults a designed map may carry on `CustomMapPreset` to SEED the
lobby when that map is picked — `difficulty?: GameDifficulty`,
`farTileOpening?: boolean`, `farTilesPerPlayer?: number` (0–6) — each hoisting
1:1 onto the same-named `GameSetupOptions` field. They ride the EXISTING
preset→lobby machinery in `map-preset.ts` (extended, not rebuilt): the three keys
were added to `PresetForcedOptionKey` / `presetForcedOptionKeys` /
`applyCustomMapPresetToOptions` (seed) / `revertCustomMapPresetOptions` (restore
scenario default when the map is dropped/swapped) / `customMapPresetIsActive` /
`sanitizeCustomMapPreset`, plus the build-time apply-once `explicit` skip set in
`adventure-setup.ts` `createAdventureGameState`. Editor UI: two new sections in
`map-preset-editor.tsx` — a Difficulty chip row (`MAP_PRESET_DIFFICULTY_OPTIONS`,
Easy…Impossible, re-click clears) and an "Additional Ⅱ–Ⅲ tiles" row
(Default/On/Off + a Default/0–6 per-player count that hides when opening is Off).
Pinned in `custom-setup.test.ts` (seed-on-pick + host-edit-wins, direct-build
seeding with a legacy CONTROL, build apply-once, revert, sanitizer clamps/drops,
banner lines), `map-preset-editor.test.tsx` (the two controls write onChange, a
sibling field survives, Off hides the count), and the persistence round-trip in
`map-registry.test.ts` (registry sanitizes the preset through
`sanitizeCustomMapPreset`).

Semantics / deliberate limits:
- **SOFT defaults, apply-once**: the preset seeds these three onto the lobby at
  PICK (`setGameOptions` customMap block, no skip). A host's later
  `SET_GAME_OPTIONS` edit of difficulty/far-tiles then WINS — the lobby path
  passes every option to the build, so they land in the build-time `explicit`
  skip set and the preset never re-forces them. A DIRECT build that omits a field
  lets the preset fill it (the seeding path). Difficulty is a soft default like
  victory mode — the host may change all three after pick; VP + round limit stay
  MAP-AUTHORITATIVE (below), unchanged.
- **Victory mode / VP / round-limit were ALREADY on the preset + editor** (this
  task only ADDED difficulty + far-tiles). `preset.roundLimit` ends the game ONLY
  when Victory Points is enabled (`adventure.ts` round-wrap: `if (vpConfig &&
  roundLimit && …)`); with VP off it stays a mere "suggested length". The editor
  already surfaces that coupling (the round-limit section relabels "Round limit
  (hard end)" ↔ "Suggested length (rounds)" off `vpOn`, with a matching hint), and
  the round-limit+VP end + the banner wording are already pinned in
  `victory-points.test.ts` (VP-on-ends / VP-off-suggestion-only / no-limit-no-end,
  and the `describeCustomMapPresetEntries` round-limit lines) — no new coupling
  test or editor coupling change was needed.
- **Additional-tile TYPES are NOT configurable** — only on/off + per-player count.
  The Ⅱ–Ⅲ supply pool composition stays the engine default (a truly-random tile is
  rolled from `farTilePool` when a player opens one).
- **No custom "hold a town for X rounds" win conditions** — the victory default
  picks among the four existing modes (conquest / grail / dragon-hunt /
  dragon-conqueror = the capture-and-hold mode); the VP `objectives`
  (control-towns / flag-mines / hero-level / defeat-utopia) already live under
  `victoryPoints` config and stay there.
- **Sanitizer**: garbage difficulty dropped (kept only if one of the 4 literals);
  `farTilesPerPlayer` clamps 99→6, −1→0, a non-number DROPPED (never a silent 0);
  `farTileOpening` kept only as a real boolean. Legacy presets (fields absent)
  are byte-identical after sanitize and behave exactly as before.

## Map designer upgrade (designed gates/borders/locks/obelisks/objects/Ⅶ/VP) — what runs vs. limits

Seven map-only features on `CustomMapPreset` / `CustomMapTilePlan` (applied when
the map is picked). Preset-editor + tile-popover UI in `map-designer.tsx` /
`map-preset-editor.tsx`; the new rows/warnings carry Heegu-sama/Homm3BG board
glyphs via `REWARD_GLYPH_ICONS` (`homm-assets.ts`) through `assetUrl()`.

Leading with what does NOT run / deliberate limits:
- **Standalone (off-tile) Whirlpool teleporters are REFUSED** — a Whirlpool must
  sit on a tile (its token); Monoliths (legacy), Teleport Gates, one-way
  monolith halves and the three outposts (Garrison / Keymaster's Tent /
  Barrier — standalone-ONLY, see the "Designer guards, outposts & one-way
  monoliths" section) may be standalone objects. A standalone hex touching BOTH
  layers is also rejected (`map-objects.test.ts`).
- **CANONICAL forms (see the "Monolith & Whirlpool Tokens" section):** an ON-tile
  teleporter is a `CustomMapTilePlan.token` (kind monolith/whirlpool/gate); an
  OFF-tile one is a standalone `CustomMapObject`. The designer never writes NEW
  tile-slot objects — dropping a teleporter on a tile writes/moves a token,
  dropping it off every tile writes a standalone object, and dragging one across
  that boundary converts between the two forms. A LEGACY tile-slot object in a
  saved preset still carves exactly as before (`applyCustomMapObjects`), and a
  face-down / forbidden-slot tile-slot object is dropped with a problem
  (`map-objects.test.ts`).
- **The map AI never routes THROUGH a teleport** (Monolith / Gate / monolith-role
  Obelisk): it treats a teleport/guarded object hex as an ordinary field — it can
  walk onto and fight a guarded Gate, but never plans a path across the link
  (`map-objects.test.ts` "computer AI treats object hexes as ordinary guarded
  fields" runs a whole SP turn with a guarded Gate + Monolith, no stall/crash).
- **Obelisk role is MAP-WIDE, never per-Obelisk** (face-down tiles hide which is
  which); every role still credits the Holy-Grail dig identically
  (`obelisk-roles.test.ts` "dig progress is role-independent").
- **A monolith-role Obelisk / Monolith does NOT re-trigger on ARRIVAL** — the dig
  credit + reward fire only on deliberate ENTRY, before the teleport; landing on
  one via a teleport is inert (no ping-pong, no re-credit).
- **A Ⅶ-field override drops the printed field's trappings** — forcing a centre
  slot's difficulty-7 field to Town/Grail/Utopia keeps the difficulty-7 guard and
  the terrain but discards the printed objective's resource/faction/amount
  (`materializeTileFields`, `vii-field-designation.test.ts`).
- **The Grail-capacity conflict check is CONSERVATIVE about Near/Far overflow** —
  it counts face-down Near/Far slots optimistically as Grail hosts (setup
  soft-fills a tight layout from the pool rather than hard-failing), so it only
  BLOCKS a design that truly cannot host 2 dig sites (`vii-field-designation.test.ts`
  "Near/Far overflow rescues it").
- **VP with a conquest-style victory + NO round limit ends only by
  last-faction-standing** — which, with VP on, ends the game SCORED immediately
  (the survivor completes the condition and earns the completion VP; only live
  seats are scored, so the survivor wins with a full breakdown — no playing out
  the remaining rounds with no opponent left). With VP off it stays the classic
  instant unscored win (`victory-points.test.ts` "with no round limit … does NOT
  end" + "Last-faction-standing under VP mode").
- **No "dig the Grail" VP objective** — deliberately omitted from the four kinds
  (control N towns / flag N mines-settlements / reach hero level N / defeat a
  Dragon Utopia): the base table's "Completed the victory condition" row already
  credits a Grail win, so a dig objective would double-count.
- **The fixed-orientation feed line is presentation-only** — the real lock is the
  engine placing the home tile at its designed `rotation` and refusing every
  opening rotation for that seat; `START_TILE_ORIENTATION_FIXED` is just the
  notice (`start-tile-rotation.test.ts` cases 1/3/5).

What runs (each pinned by a test that fails if the wiring is removed):
- **1. Designed gate links** (`CustomMapTilePlan.gateLinks`): pin cavern↔Surface
  gates at chosen hexes with NO practical limit — one cavern may link ANY number
  of touching Surface tiles, AND the SAME Surface tile several times at distinct
  boundary pairs (several gates along one shared edge); the only bound is the
  sanitiser cap `MAX_DESIGNED_GATE_LINKS` = 24 (effectively unlimited). The engine
  carves BOTH halves at the DESIGNED hexes (not the auto-nearest — a designer plan
  bypasses one-gate-per-tile via a per-plan half lookup keyed off its pinned hex,
  so same-pair siblings each get their own gate); a pinned link opens NO
  pick-on-reveal choice (for every one of the multiple gates). Validation
  (`validateCustomMapPlan`, mirrored in the pure `planSubterraneanGates` preview):
  a link to a non-touching/absent Surface is dropped with a problem; a PINNED pair
  colliding with an already-accepted link's hex (this cavern's OR another's — two
  gate halves can never share a board hex) is dropped with a problem naming it; an
  UNPINNED duplicate to a surface already linked unpinned is merged away.
  Designer UX: per-LINK popover rows (each with ↻ Move + Unlink) plus a "+ Gate"
  button that pins a second gate to an already-linked surface at the first free
  pair (disabled when the edge is full); a gate-token drag offers EVERY touching
  surface (incl. already-linked ones), minus pairs colliding with sibling pins,
  and moves only the grabbed entry. `designed-gate-links.test.ts`,
  `subterranean-gate-planning.test.ts` (preview == engine, incl. the five-surface
  and double-gate cases and `unreachableUndergroundCenters`),
  `map-designer.test.tsx`, `map-registry.test.ts`.
- **2. Yellow borders — PER EDGE (ON by default).** `DESIGNER_BORDER_SEALING_ENABLED
  = true` in `adventure.ts`: setup copies plan borders onto live tiles so they
  RENDER in game AND seal movement / discovery / placement. Legal on ANY group
  including starting Ⅰ Town tiles (`applyDesignedBorders` on the home-tile path).
  Flip the flag to `false` to keep designer data but stop live sealing/draw
  (gated suites in `designed-borders.test.ts` / `map-objects.test.ts` /
  `computer/map-navigation.test.ts` switch with it). Printed tile borders
  (`outerImpassable`, internal lines) are unaffected either way.
  (`CustomMapTilePlan.borderEdges`, canonical
  edge codes `footprintIndex*6 + absoluteDirection` in the rotation-0 board
  frame; 30 distinct edges per 7-hex flower, inner edges included): drawn freely
  edge-by-edge on the board (armed 🖌 tool — click an edge to seal, click again
  to remove, drag to paint/erase a stroke; the panel shows a count + Clear).
  Each single edge seals movement / discovery / new-tile placement / AI —
  everything but Expert Pathfinding — via the `canCrossEdge` +
  `heroCanDiscoverTileAcrossBorders` + placement-reach chokepoints; stored
  ABSOLUTE so it survives rotation + a face-down random draw, and a LINKED gate
  crossing beats it. Rendered bold everywhere (dark casing under a gold core,
  `.tileBorderCasing`/`.tileBorderLine`). The legacy whole-arc `extraBorders`
  (absolute dirs 0-5, 3-edge outer arcs) stays fully engine-enforced for old
  saves; the designer now writes ONLY `borderEdges`, folding legacy arcs in on a
  plan's first border edit. Standalone OBJECT hexes take border edges too
  (2026-07, `CustomMapObject.borderEdges` → `MapFieldState.borderEdges` —
  same tool, same seal, same rendering; see the "Designer guards, outposts &
  one-way monoliths" section). `designed-borders.test.ts` (arc + edge
  suites), `map-navigation.test.ts` (AI), `map-registry.test.ts` (round-trip),
  `map-designer.test.tsx` (draw/erase/stroke/conversion UI),
  `map-objects.test.ts` (object-hex edges).
- **3. Fixed starting-tile orientation** (`lockRotation` + `rotation`): a locked
  seat's home tile is placed at the designed rotation and owes NO opening
  rotation; the opening chain skips it in seat order (no stall), the reducer
  rejects a rotation targeting it, and the lock holds with the ceremony off.
  `start-tile-rotation.test.ts`.
- **4. Obelisk roles** (`CustomMapPreset.obelisks`, absent = classic locked die):
  `monolith` (all Obelisks + Monolith tokens = one teleport network, always STOPS
  the hero, Revisit 1 MP, lone = inert), `bonus` (a fixed reward —
  morale/search/resources/movement/dice, never farmable on re-entry), or
  `victory-only` (no reward, still a dig marker). `obelisk-roles.test.ts`.
- **5. One-hex objects** (`CustomMapPreset.objects`, the CANONICAL OFF-tile form):
  standalone off-tile hexes (layer inferred from the touched tile) — Monoliths
  (legacy) and 4 colored Teleport-Gate NETWORKS (each color its own teleport
  network, separate from Monoliths; up to `MAX_GATES_PER_PAIR` = 8 of a color
  across plan tokens + objects), plus — 2026-07 — one-way monolith halves and
  the three outposts (Garrison / Keymaster's Tent / Barrier), and — with the
  empower-token batch — a **pinned Creature Bank** (`kind: "creature_bank"`,
  STANDALONE-only like the outposts): a REQUIRED `bankId` (one of the 12
  published banks) carves a real bank fight at that hex (normal bank combat +
  reward; optional `bankSize` pins the Polish Stacked count when that rule is
  on). A bank pin never carries a designer guard / first-clear reward / yellow
  borders — a bank is ALWAYS border-free, so it never seals movement or tile
  discovery (stale smuggled edges are stripped at carve;
  `creature-bank-objects.test.ts`, with a garrison-keeps-borders CONTROL).
  Optional guards
  (level 1-7 OR an exact army) run the real neutral-battle flow on teleporters
  (a level>difficulty Quick-Combat win teleports + clears; a loss/retreat
  leaves the guard) and BANK-style (no XP, unlimited rounds) on outposts /
  one-way entrances — see the "Designer guards, outposts & one-way monoliths"
  section. An ON-tile teleporter is instead a `CustomMapTilePlan.token` (see
  the "Monolith & Whirlpool Tokens" section) — the designer no longer writes
  new tile-slot objects, but a LEGACY tile-slot object in a saved preset still
  carves. `map-objects.test.ts`, `outpost-objects.test.ts`.
- **6. Ⅶ-field designation** (a centre plan's `viiField` town/dragon_utopia/grail):
  forces the difficulty-7 objective field whatever tile lands there (face-up at
  setup, face-down on reveal, masked in other views until then); a victory-vs-
  design conflict BLOCKS the start (lobby intact) with live warnings; the knobs
  `grailObelisksRequired` / `utopiaGuards` / `utopiaBonusSearch` tune the dig /
  Utopia. The centre hex additionally takes a designer guard / reward / VP
  bonus (`CustomMapTilePlan.centerHex`) with or without a designation — see
  the "Designer guards, outposts & one-way monoliths" section.
  `vii-field-designation.test.ts`.
- **7. Victory Points** (`CustomMapPreset.victoryPoints`): a round-limit OR
  victory-completion end trigger scores the full rulebook VP table via an
  event-sourced ledger (heroes defeated, buildings, hero levels, flagged mines/
  settlements, artifacts, + up to 4 designer objectives + completion VP),
  tie-broken by completer then turn order; a live "if scored now" standings dock
  + a game-over scoring overlay (`victory-points-panel.tsx`) read the same pure
  `computeVictoryPoints`. `victory-points.test.ts`. VP can ALSO be enabled from
  the lobby Game options (Mode & Rules tab, directly below Game mode, default
  OFF) via `GameSetupOptions.victoryPoints` + an optional
  `victoryPointsRoundLimit` round-limit select — `applyLobbyVictoryPoints`
  (`adventure-setup.ts`) injects an `{ enabled: true }` block (and the clamped
  round limit) into the EFFECTIVE preset at build time, so the same downstream
  system lights up on ANY map. A designed preset that already enables VP stays
  authoritative (its config/round-limit win; an explicit lobby
  `victoryPoints: false`/absent never disables it). Lobby wiring is pinned in
  `victory-points.test.ts` (lobby build path + setGameOptions) and the UI row in
  `game-options-tabs.test.tsx`.

Glyph polish (Task 7): the Obelisk fixed-bonus kind, the VP objective rows, the
live VP breakdown rows (experience/gold/artifact/attack-defense by label) and the
designer warnings' red-cross conflict / green-tick all-clear are tagged with
Homm3BG glyphs. Monochrome symbol glyphs are lightened in CSS to read on the dark
panels; the tick/cross keep their own colour. Icon presence is pinned in
`map-preset-editor.test.tsx`, `victory-points-panel.test.tsx`,
`map-designer.test.tsx`.

Tier-band outline colours (designer only): each tile's flower outline
(`GROUP_COLORS`, `.designerFlowerOutline`) is stroked by its band's MAX unit tier
— Ⅰ bronze `#b46f33` / Ⅱ–Ⅲ silver `#c7ccd6` / Ⅳ–Ⅴ gold `#e7b73c` / Ⅵ–Ⅶ azure
`#3f7fd6` (reusing the app's `.tierDot`/`.neutralDeck` grade hues), Sea light-blue
`#8fd8ff`, Underground kept purple `#7a5a9e`; the palette-button borders share
them. A compact `.designerBandLegend` (six swatches + `TILE_GROUP_BAND_LABELS`
numerals, now re-exported from `@/engine`) sits under the tile palette. Because
Near-gold ≈ the selection gold `#ffd766` and Sea ≈ the secret-pin blue `#9ad0ff`,
the `.selected`/`.secret` modifiers gained a stronger halo so an override always
reads over its band. The IN-GAME yellow movement borders
(`getTileBorderSegments`/`.tileBorderLine`) are untouched. Pinned in
`map-designer.test.tsx` ("tier-band outline colours + legend": per-band stroke,
the six-swatch legend, and a selected-overrides-band CONTROL).

### Custom win conditions (map-designer + lobby, additional early-end trigger)

A designed map (and, per-game, the lobby host) may author CUSTOM WIN CONDITIONS
(`CustomMapPreset.customWinConditions` / `GameSetupOptions.customWinConditions`,
`CustomWinCondition` in `state.ts`). ENGINE RULE: the FIRST live player — iterated
in `turnOrder` — to satisfy ANY active condition WINS IMMEDIATELY, an ADDITIONAL
early-end trigger layered on top of the normal victory mode (it does NOT replace
it). Engine: `checkCustomWinConditions` (`adventure.ts`, next to
`declareAdventureWinner`), called from the reducer's post-action tail
(`reducer.ts`, right after `runAdventureAutomations` and before
`ensureCombatActivation` — the ONE seam every action on every backend funnels
through). Behaviour pinned in `src/engine/custom-win-conditions.test.ts` (each
claim mutation-checked, with no-condition / below-threshold / VP-off CONTROLs).

Nine kinds (params clamped by `sanitizeCustomWinConditions`, map-preset.ts):
`control-towns` (count 2–8 — the home town counts, so a min of 2 avoids an
instant win), `flag-mines` (2–12, mines+settlements combined), `hero-level`
(main hero, 2–7), `gold` (treasury, 20–500), `artifacts` (own N, 1–10),
`buildings` (Buildings in controlled Towns, 8–15 — the reader is VP scoring's
own `controlledBuildingCount`; min 8 because the default opening is 3 Buildings
and a preset can force at most 7, so an 8 floor can't instant-win at setup),
`obelisks` (visit N Obelisks, 1–4 matching the grail dig knob — reuses the
per-player `grail.obelisksVisited` tally, so HONEST LIMIT: it only accrues in
GRAIL victory mode, a silent no-op on any other mode), `defeat-heroes` (1–6,
main+secondary combined), `defeat-dragon-utopia` (no param).

What runs (each with a failing-if-removed test):
- **Any-of, first-to-satisfy**: conditions are evaluated in LIST ORDER for the
  reason string; players in `turnOrder` (deterministic tie-break, documented).
  The `GAME_WON` reason is `completed a custom win condition: <describe>` where
  `<describe>` = `describeCustomWinCondition` (the SINGLE source for the editor
  preview, the 🏁 map-pick banner line, the lobby list, and this reason — it
  lives in `victory-points.ts`, NOT map-preset.ts, so `adventure.ts` can import
  it without the map-preset→adventure cycle).
- **The metrics ARE the Victory-Points readers** (reuse invariant): `mainHeroOf`,
  `townsControlledBy`, `flaggedMineSettlementCount`, `artifactCountOf` are
  exported from `victory-points.ts` and shared verbatim; gold is `resources.gold`;
  `defeat-heroes` = `vpLedger.mainHeroDefeats.length + secondaryHeroDefeats`
  (main once per opponent, VP-consistent; tolerates an absent ledger on legacy
  snapshots); `defeat-dragon-utopia` = `vpLedger.utopiaDefeated`. Never duplicate
  a metric — same numbers as VP scoring is the invariant.
- **Combat-deferred**: the check SKIPS while a combat is open (`state.combat`), so
  a threshold crossed mid-battle resolves on the next map-side action
  (`ACKNOWLEDGE_COMBAT_END` and co. flow through the same tail) — the game is
  never ended mid-fight. Pinned with an open-combat guard test + an
  acknowledge-lands-the-win test.
- **VP interplay**: the winner is declared through `declareAdventureWinner(…,
  { viaVictoryCondition: true })`, so with VP mode OFF it is an INSTANT win (HUD +
  GAME_WON, reason verbatim) exactly like the Grail, and with VP mode ON it
  auto-routes to `endGameByVictoryPoints` (the completer earns the completion VP,
  the most-VP seat wins, the VP_SCORING overlay fires). Both behaviours are free.
- **Lobby is ADD-only, UNION at build**: `applyLobbyCustomWinConditions`
  (adventure-setup.ts, chained after `applyLobbyVictoryPoints`) merges the map's
  own list FIRST + the lobby-added list, exact-duplicate deduped, capped at
  `MAX_CUSTOM_WIN_CONDITIONS` (4) via the shared pure `mergeCustomWinConditions`.
  A map-authored condition is NEVER removed by the lobby. `setGameOptions` stores
  the sanitised host list on `lobby.options.customWinConditions` and emits
  `GAME_OPTIONS_CHANGED`.
- **Public by design**: conditions ride `adventure.mapPreset`, which `player-view.ts`
  does not mask — every seat can read them (unchanged; stated, not altered).
- **Idempotent / live-only**: the win-declared guard makes a re-check a no-op (no
  second GAME_WON); an ELIMINATED player satisfying a condition never wins
  (the liveness skip mirrors last-faction-standing).

UI: the map editor's "🏁 Custom win conditions" section (`map-preset-editor.tsx`,
`CUSTOM_WIN_CONDITION_OPTIONS` / `defaultCustomWinCondition`, add/retype/param/
remove up to 4) and the lobby "Custom win condition" section (`screen.tsx`
**Match tab**, directly below the "Win condition" victory-mode selector — beside
the game's other winning conditions, NOT on Mode & Rules: map-set conditions
read-only + "map"-tagged, host add/remove dispatching
`SET_GAME_OPTIONS { customWinConditions }`, Add disabled at the effective cap).
Pinned in `map-preset-editor.test.tsx` and `game-options-tabs.test.tsx` (incl. a
placement test: on Match after the Win condition row, absent from Mode & Rules).

Deliberate LIMITS (documented, not bugs):
- **No "defeat N Dragon Utopias"**: the VP ledger flag is a BOOLEAN
  (`utopiaDefeated`), so `defeat-dragon-utopia` carries NO count even though a
  designed map can host several Utopias — it fires on the FIRST one defeated.
- **Instant-win foot-gun**: a condition already met at setup ends the game on the
  first action — the designer's responsibility. The min-clamps REDUCE but cannot
  eliminate it (e.g. a preset `startingResources` gold can exceed the gold
  condition's 20 minimum; control-towns' min of 2 keeps the lone home town from
  being an instant win, but a designed second town could still trip it).
- **Never ends mid-battle** (the combat-deferred reading above) — a crossing
  during combat waits for the next map-side action, by design.

## Map designer 2026-07b: landmark bans, Pack guards, Random Settlement Ⅶ, hold-with-Grail (+ audit) — what runs vs. limits

Three merged branches (exclude-and-level-packs; Random-Settlement-Ⅶ / control-VP
/ hold-with-Grail; yellow-border re-enable — see the borders bullet in the "Map
designer upgrade" section, now ON by default incl. starting Ⅰ tiles, with the
pinned-center "Always visible" face-up/face-down flip in `map-designer.tsx`),
audited together. Behaviour pinned in `tile-exclude-and-level-packs.test.ts`,
`random-settlement-hold-grail.test.ts` and `map-designer.test.tsx` (each claim
mutation-checked; audit fixes noted inline).

Leading with what does NOT run / deliberate limits:
- **Landmark bans are best-effort at setup**, exactly like the include-Secret:
  an exhausted filtered pool falls back to an unfiltered draw with the
  `MAP_SECRET_FEATURE_FALLBACK` table note (never an empty board hole). Exact
  pins and one-of lists ignore bans (the designer already named the tile), and
  a ban lives only on a face-down non-starting slot — the validator REJECTS a
  face-up plan carrying one, so the designer UI clears bans on every face-up
  transition (exact face-up pin, mode switch, the center "Always visible" flip
  — audit fix: the flip used to leave a stale ban that hard-blocked the lobby).
- **No azure Pack exists in the unit data** (azure is Neutral-only): the guard
  editor offers "+ Pack I–III" only (data-driven — the chip returns by itself
  if an azure Pack ever ships), and ANY Pack slot that cannot mint a Pack — an
  azure slot in a hand-edited save, a locked faction lacking the tier, a
  table row's azure bodies under a "packs" level guard — mints a same-tier
  NEUTRAL instead (audit fix; pre-fix a normal-difficulty level-Ⅶ "packs"
  guard fielded ZERO bodies, and a `random-pack:azure` slot pushed the derived
  difficulty to Ⅶ while minting nothing).
- **A faction-locked NAMED pack of the wrong faction converts** at fight time
  to a random Pack of the SAME tier in the locked faction (audit fix — it was
  silently dropped, shrinking the fought army below the difficulty/XP its
  entries derived; the concrete-lock sanitiser still strips contradicting
  names at save time, so this arm mostly serves `packFaction: "random"`).
- **`customGuardLevel` is now stamped for EVERY designer level guard** (not
  just bank-style objects), so `drawGuardArmy` draws the DESIGNED level even
  where the fight difficulty is forced (bank-style 0). CONSEQUENCE (designer
  guard wins, deliberate): a designed LEVEL guard on a Random Town draws a
  level army instead of the classic rolled-faction party, and on a
  grail-as-utopia "always" dig site instead of the Utopia dragons.
- **A "packs" level guard reads the SAME eased table row as its Neutral twin**
  (`neutralArmyDifficulty` — audit fix: it read the raw scenario difficulty,
  ignoring the Astrologers "Rulebook" easing every other neutral draw honours).
- **Random Settlement Ⅶ is printed-style machinery, not a new flow**: the
  designation forces `{ location: "settlement", difficulty: 7 }` — guarded
  settlements are already printed content (F1 prints a difficulty-3 one), so
  the fight→`SETTLEMENT_CHOICE` (resource pick)→flag→income path is the
  existing one; `field.randomSettlement` only tags it so the hold-with-grail
  `random-settlement` target can tell it from printed settlements.
- **hold-with-grail control reads are flag-based** (`playerControlsField`:
  flag, or the unflagged field of an own TownState); "starting-town" means a
  Town whose `TownState.controllerId` is the player AND whose field they still
  control — a captured home town stops counting via the flag.
- **Grail possession is ONE shared read** — `playerPossessesGrail` in
  `victory-points.ts` (audit de-dup; adventure.ts re-exports it): carried by
  an own hero, or built on a field the player controls. Digging alone,
  conquering a dig site, and "delivered" never count (delivery is the grail
  win path; completion VP covers the completer). Feeds BOTH the
  `grailPossessionVp` scoring row and every hold-with-grail tick — never
  re-implement this read.
- **Abstract hold-with-grail progress** (`adventure.holdWithGrailProgress`,
  keyed per condition) ticks at round start inside `tickSettlementHoldControl`;
  at most ONE seat holds a counter (possessing the Grail is exclusive), a
  round where nobody qualifies DELETES the entry (no stale progress), and the
  win is declared by the reducer-tail `checkCustomWinConditions` (so it obeys
  the never-mid-battle deferral). Field-stamped holds (`holdRoundsToWin` +
  `holdRequiresGrail` on settlements / Random Towns / center objectives) keep
  their own per-field counter and reset it any round possession lapses.
- **Control VP rows**: per-field `settlementBonusVp` (tile settlement plan OR
  `centerHex.controlVp` on a Ⅶ Settlement / Random Town) scores while flagged;
  map-wide `randomTowns.vp` stacks ON TOP per controlled Random Town. Both are
  VP-mode-only presentation of already-public state.
- **Landmark bans survive onto the placed tile** (`MapTileState.excludeFeatures`)
  so the Gold/valuables resource-pick tile reassignment also refuses a banned
  landmark when swapping the tile def.
