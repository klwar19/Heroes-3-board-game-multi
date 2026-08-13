# Polish Balance Pack — `polish-card-balance` house rule (spec)

Source of truth: the mod author's OneDrive "05 Balance Pack" share —
`Cards - Balance changes.xlsx` (sheets `Ability`/`NEW Ability`, `Art`/`NEW Art`,
`Spells`/`NEW Spells`, `Heroes`) plus the four graphics folders (Ability 12,
Artifacts 27, Specialities 11, Spells 21 = **71 changed cards**). The graphics
folders define the SCOPE (exactly which cards change); the `NEW *` sheets define
the DETAIL. This file is the committed transcription of both; the raw PNGs are
NOT committed (re-fetch via the badger-token recipe in the session memory
`onedrive-share-download-recipe`); the converted webp faces ARE committed under
`public/assets/polish-balance/`.

## The house rule (ONE tick)

- id `polish-card-balance`, category `"polish"`, label
  "Balanced cards (Balance Pack)", **default OFF in BOTH binh and legacy**.
  The Polish "Enable all" button picks it up automatically (category-derived).
- With the rule ON, each card below plays its NEW text and renders its
  balance-pack FACE; with it OFF (or on a legacy snapshot) every card is
  byte-identical to before — every change must have a rule-OFF CONTROL test.
- Several NEW texts are written in Polish-Spell-Book vocabulary ("Cast a Spell
  card", "Spellbook", "Refresh 1 Spell"). Those clauses apply their book-specific
  halves ONLY when `polish-spell-book` is also on; without the Book the closest
  non-book reading applies (usually: the current behaviour of that clause). Each
  such card's spec entry says which parts are book-gated.
- Graphics: `public/assets/polish-balance/<file>.webp`, 743×1040 (the repo's
  card-face size). When the rule is ON every surface that paints the card's face
  shows the balance face (including the Empowered display state — reuse the
  existing empowered badge/glow overlay rather than the classic `-empowered`
  scan, whose printed text would be the OLD card). When OFF, classic faces.

## Category → step mapping (sequential implementation)

1. ABILITIES (12) — creates the house rule + the face-swap seam.
2. SPELLS (21).
3. ARTIFACTS (27).
4. SPECIALTIES (11).

---

## 1. ABILITIES (12 cards; folder `Ability/`)

File → card id (faces: `polish-balance/ability-<slug>.webp`):
Artillery.png→ability.artillery · Ballitics.png→ability.ballistics ·
Diplomacy.png→ability.diplomacy · Eagle Eye.png→ability.eagle_eye ·
First Aid.png→ability.first_aid · Intelligence.png→ability.intelligence ·
Learning.png→ability.learning · Mysticism.png→ability.mysticism ·
Pathfinding.png→ability.pathfinding · Scouting.png→ability.scouting ·
Tactics.png→ability.tactics · Wisdom.png→ability.wisdom

Per-card NEW text (verbatim from `NEW Ability`; ⏎ = printed line break removed):

- **Intelligence** — Basic: "At the start of a Combat, before any unit
  activates, you can Cast a Spell. (you don't need to play Cast a Spell card)."
  Expert: same + "This spell does not count toward your spell limit per Combat
  round." OLD: Basic "During Combat, before any unit activates, play a Spell
  card. You can still only play a Spell card during a Combat round." / Expert
  same + no-limit rider. CHANGES: the play is scoped to the START of combat
  (before any unit activates), and under the Polish Book the cast needs NO
  "Cast a Spell" enabler (extends the existing `consumePolishSpellBookCast`
  Intelligence exception — already partially implemented; verify + align).
  Non-book game: the cast consumes no extra enabler anyway (spells are cards);
  the timing scope change applies in both.
- **Wisdom** — Basic: "The cost of buying spells in Town is reduced by 2 gold.
  When buying Spells from your Mage Guild or you built the Mage Guild, do
  Search(X+2) instead of Search(X), once." Expert: "+1 SP. During this combat
  round, your spell limit increases by 1." OLD: Basic −2 gold + Search(3)
  instead of Search(2); Expert −2 gold + Search(4). CHANGES: basic becomes a
  relative X+2 widen usable once (on a Mage Guild purchase OR when building the
  Mage Guild); expert becomes a COMBAT card: +1 spell Power and +1 spell limit
  this combat round (the Knowledge-statistic expert rider arm).
- **Mysticism** — Basic: "Play this card immediately after casting a spell.
  Instead of discarding the Cast a Spell card, take it back into your hand.
  Casted spell is refreshed, once per round." Expert: same but "the Cast a
  Spell card and all other cards played together with it". BOOK-GATED: the
  "Cast a Spell"/refresh wording — under `polish-spell-book` this matches the
  already-shipped behaviour (verify no change needed beyond the face); in a
  NON-book game keep the current printed reading (returns the Spell card /
  + support cards). Likely face+CONTROL only; verify against engine.
- **Eagle Eye** — Basic: "Choose one: Basic or Expert Spell. Draw cards from
  the Spell deck until you find such a spell. Put it into your Spellbook.
  Reshuffle the rest of the cards back to the Spell deck." Expert: "When your
  opponent casts a spell that deal DM to your unit, after resolving its effect
  copy this spell effect (with 0 SP) and choose a new target for it. You can
  add SP to this spell. This spell does not count toward your spell limit per
  Combat round." OLD: basic digs a Basic spell (take or discard), expert digs
  an Expert spell. CHANGES: basic = ONE play then a Basic-or-Expert choice
  (like the Tome two-button pick), the find is TAKEN (into hand; Book table →
  Spellbook) — no discard arm; expert = a NEW spell-copy reaction (reuse the
  Magic-Mirror/deferred-cast machinery: after an enemy damaging spell resolves
  against your unit, copy the spell at Power 0, pick a new target, may add
  Power through the normal boost window, free of the round limit).
- **Tactics** — Basic: "At the start of Combat, you can switch the position of
  any 2 of your units. OR Move one of your units 1 space." Expert: "During
  Combat, you can switch the position of any 2 of your units. OR Move one of
  your units 1 space." CHANGES: both sides gain the OR arm "move one of your
  units 1 space" (reuse `MOVE_UNIT_ADJACENT` — the Necklace of Swiftness arm).
- **Pathfinding** — Basic: "Extend your Combat against a Neutral Army for 1
  round (without spending any MP)." Expert: "Your Hero can move through:
  1. Yellow borders and blocked fields, but cannot end movement on them.
  2. Neutral Units and Enemy Heroes, but if they end their movement in one of
  these fields, Combat begins. When your hero enters a Sea field from a land
  field he can continue his movement." CHANGES: a complete restructure — basic
  = a free neutral-combat round extension (reuse the free-extension arm the
  `free-neutral-combat-extend` rule uses, but as a card play in the
  continue-or-retreat window); expert = the movement package (reuse the
  existing `pathfinding-expert` rule-ON readings: borders+blocked crossing,
  pass-through neutrals/heroes, sea-entry no-halt). Interaction with the
  existing `pathfinding-expert` house rule must be defined: with
  `polish-card-balance` ON the card plays THESE sides regardless of
  `pathfinding-expert` (document it in both rules' descriptions).
- **Scouting** — Basic: "Play this card before taking a Search action, then do
  Search (X+2) instead." Expert: "Play this card before taking a Search
  action. Until the end of this turn, when you do Search action Search (X+2)
  instead." OLD: fixed Search(3) basic / Search(5) expert. CHANGES: the
  override becomes RELATIVE (+2 over the search's own base), and expert lasts
  for every Search until end of turn (a standing +2 widen; reuse
  `SEARCH_COUNT_OVERRIDE` with a new delta mode + a turn-scoped variant).
- **Learning** — Basic: "Play when the Hero gains experience. Advance their
  Experience Level by an additional 0,5 level, then/or draw 1 card." Expert
  unchanged (+1 level, remove). CHANGES: basic timing widens from "about to
  level up" to "when the Hero gains experience", and adds "then/or draw 1
  card" (read: the play also draws 1 card; if the +0.5 cannot apply, the draw
  still happens).
- **Diplomacy** — Basic: adds "Decide for each unpurchased unit: place its
  card on the top or bottom of its appropriate deck." (OLD: unpurchased units
  return without a placement choice.) Expert unchanged.
- **Artillery** — Basic: "Deal 1 DM to an enemy unit with the lowest
  initiative. ∂: If you have a Balista card played, until the end of this
  combat you can choose its targets." Expert: "When using the Ballista card,
  resolve its effect against the same target 3 times. ∂: Until the end of this
  combat you can choose the targes of your Balista." CHANGES: both sides gain
  an ongoing rider — while you have a Ballista in play, YOU choose the
  Ballista's targets for the rest of the combat (reuse the Gerwulf VI /
  `BALLISTA_CHOOSE_TARGET` machinery).
- **Ballistics** — Basic: "At the beginning of each Combat round, you may pay
  1 building material to choose 2 adjacent targets (any combination of units,
  Walls and the Gate) and deal 1 DM to each of them. OR During the siege:
  destroy 1 Wall or Gate." Expert: "When using the Catapult use it effect
  twice on the same targets without paying its cost. OR During the siege:
  destroy 3 Walls and Gate." OLD (printed): basic destroy 1 Wall/Gate; expert
  destroy the Arrow Tower. NOTE: the existing `ballistics-buff` house rule
  already ships a variant (basic Arrow-Tower level + expert bombard). Under
  `polish-card-balance` the card plays THESE sides (the recurring round-start
  bombard is an ongoing effect; expert doubles a Catapult volley free, or
  demolishes 3 walls + gate). Define precedence over `ballistics-buff`
  explicitly (balance rule wins when on; document in both descriptions).
- **First Aid** — Basic: "Remove 1 DM from one of your units. OR When using
  the First Aid Tent card, resolve its effect against the same target 3
  times." Expert: "If you have First Aid Tent card played, For this combat one
  of your units gets +2 HP, until its HP is reduced to 0." CHANGES: the tent
  triple-volley moves from expert to a basic OR-arm; expert becomes a
  tent-gated +2 HP combat buff on one unit (reuse the Vial-of-Lifeblood
  `+1 HP for this combat` arm at magnitude 2, gated on a First Aid Tent in
  play).

NOT in scope (unchanged even though the xlsx shows edits): Interference,
Logistics, Necromancy, Leadership, Luck, the four School/Basic-School Magics,
Offense/Archery/Armorer/Sorcery/Resistance/Scholar/Estates, and the four
STATISTICS (Attack/Defense/Power/Knowledge) — no graphic was provided, so the
author did not finalise them. Do NOT change them.

---

## 2. SPELLS (21 cards; folder `Spells/`)

File → card id (faces: `polish-balance/spell-<slug>.webp`). WARNING: the
xlsx under-specifies the ladders — verified against the faces, most spells
print a FULL Power ladder (three rungs, e.g. 0/1/2) where the sheet only
carried two values. THE FACE IS AUTHORITATIVE: read each face visually before
implementing; the notes below summarize what CHANGED vs the current card.
(Verified examples: Haste prints "For 3 combat rounds, +X initiative / can
move +X spaces: 0→+2/+1 space, 1→+4/+2, 2→+6/+3"; Misfortune prints
0→negate the die roll, 1→roll 2 resolve lower, 2→roll 4 reroll every "+1"
resolve all.) The bottom "or +1 pow" side is the standard printed
power-source alternative — unchanged on every spell.

- **Anti-Magic** — expert tier targets "ANY except azure" (was silver); text:
  "Until the end of the Combat, the selected unit cannot be targeted by Spells
  and take DM from Spells and Specialities" — i.e. the ward now ALSO blocks
  damage from Spells and Specialty blasts (reuse `immune-specialty-damage` +
  spell-damage immunity arms).
- **Bless** — becomes ∂ (lasting): "For 1 combat round, the selected ground or
  flying unit / units ignores the Attack die roll and gains: +1 AT" — basic
  breakpoint 1 unchanged; EXPERT (breakpoint moves 2→3): "all Ground/Flying
  units +1 AT" (all your ground/flying units, for 1 combat round). OLD: a
  one-attack instant on one unit (+1/+2 AT). CHANGES: duration = 1 combat
  round (all that unit's attacks that round), expert = army-wide +1 instead of
  single +2.
- **Blind** — expert tier "ANY" (was silver): at Power 2 the paralysis token
  can be placed on any unit (azure included). Basic (bronze at 1) unchanged.
- **Counterstrike** — breakpoints 2/4 → **1/3**.
- **Dispel** — expert (Power 2): "ANY unit or ALL effects" — remove all ∂
  effects from a space or ANY unit (was silver-gated), OR remove ALL ∂ effects
  in the combat (new expert arm).
- **Disrupting Ray** — expert tier "ANY" (was silver); text adds "…cannot use
  their special ability OR suffers -1 Defense" — the caster picks: suppress the
  ability (existing) OR a lasting −1 Defense (min 0) for the combat.
- **Fire Shield** — text: "…attacked by an adjacent unit during this AND NEXT
  Combat round…" — the shield lasts 2 combat rounds (both tiers; damage 2/3
  unchanged; breakpoints 2/4 unchanged).
- **Fire Wall** — breakpoints 2/4 → **1/2** (damage 2/3 unchanged).
- **Forgetfulness** — breakpoints 1/2 → **1/3**; text: "Select a ranged unit.
  For X activations it suffers: can't range AT" — basic 1 activation, expert 2
  activations (the unit cannot make ranged attacks for its next X activations;
  melee still allowed — this replaces the old "cannot Attack at all for its
  next activation"). Tier gate on the target is dropped (any ranged unit).
- **Fortune** — reroll counts 2/3 → **3/4** ("Reroll 1 Treasure, Resource, or
  Attack die X times").
- **Frenzy** — breakpoints 2/4 → **1/3**; expert tier "ANY except azure"
  (was silver).
- **Haste** — "For 3 combat rounds, the selected unit gains +4 ini / +2 MV
  (basic) or +6 ini / +3 MV (expert)". OLD: until end of combat +2/+3 ini.
  CHANGES: duration 3 combat rounds; magnitudes 4/6 initiative; adds +2/+3
  combat MOVEMENT (unconditional — not gated on the `combat-move-initiative`
  house rule; define precedence: under the balance rule the printed MV applies
  and the `combat-move-initiative` ±1 rider does NOT stack on top).
- **Mirth** — breakpoints 2/4 → **1/3**.
- **Misfortune** — the FACE (authoritative) prints a THREE-tier Power ladder:
  head "Play immediately when the selected enemy unit is attacking. Negate an
  additional AT from any card and:" then Power 0: "Negate the die roll";
  Power 1: "Roll 2 dice and resolve lower result"; Power 2: "Roll 4 dice,
  reroll every '+1'. Resolve all." (all dice apply after the forced rerolls —
  a strong curse). The card-negate rider applies at every tier. The bottom
  "or +1 pow" power-source side is the standard printed alternative
  (unchanged). Read the face for the target-tier gate.
- **Prayer** — becomes ∂: "Until its activation in the next combat round, the
  selected unit gains +2/+3 AT, Def, initiative" (a lasting buff instead of
  the instant; same +2/+3, breakpoints 2/4 unchanged).
- **Remove Obstacle** — counts 2/3 → **3/4** obstacles.
- **Shield** — expert side becomes "takes up to 3 DM": at Power 2 the
  defending unit's damage from a ground/flying attacker is CAPPED at 3 for
  that attack (reuse the damage-cap arm), basic +2 Def unchanged.
- **Slayer** — breakpoints 2/4 → **2/3**; dice 4/6 → **5/7**; target "when
  attacking a GOLD or AZURE unit" (was gold only).
- **Slow** — "For 3 combat rounds, the selected unit suffers −2 ini/−2 MV
  (basic) or −3 ini/−3 MV (expert) (movement to a minimum of 1)". Same notes
  as Haste (duration 3 rounds; explicit MV halves; precedence over
  `combat-move-initiative`).
- **Sorrow** — breakpoints 2/4 → **1/3**; expert tier "ANY except azure"
  (was silver).
- **Visions** — draw counts 2/3 → **4/6** ("Draw X cards from any Neutral
  Unit deck…").

---

## 3. ARTIFACTS (27 cards; folder `Artifacts/`)

File → card id (faces: `polish-balance/artifact-<slug>.webp`). Option A = the
first printed side, Option B = the second.

- **Ambassador's Sash** — B: "For every Dwelling you have, draw 1
  corresponding Neutral Unit card. You can Recruit 1 of these units **with a
  discount of 3 gold**. Decide for each unpurchased unit: place its card on
  the top or bottom of its appropriate deck." (adds the 3-gold discount + the
  top/bottom placement choice).
- **Diplomat's Ring** — B: same two additions as Ambassador's Sash (A "reroll
  any die or any roll" unchanged).
- **Blackshard of the Dead Knight** — B: "+2 AT, and discard 1 card. If the
  discarded card was a **Cast a spell**, draw 1 card." BOOK-GATED wording: with
  the Polish Book the rider checks for a "Cast a Spell" enabler; without the
  Book keep the printed "was a spell" check (current behaviour).
- **Boots of Speed** — B: "For this Combat, your selected unit gains +1
  initiative **and can move 1 more space**." (adds the move rider,
  unconditional under the balance rule).
- **Equestrian's Gloves** — B: same "+1 initiative and can move 1 more space"
  rider (A "+1 MP" unchanged).
- **Ring of the Wayfarer** — A: same "+1 initiative and can move 1 more
  space" rider (B paralysis-token side unchanged).
- **Necklace of Swiftness** — A: "For this Combat, the initiative of all your
  ground units is increased by 1 **and they can move 1 more space**."
- **Cape of Velocity** — A: "Until the end of the Combat, your selected unit
  gains +2 initiative **and can move 2 more spaces**."
- **Cards of Prophecy** — REWRITTEN: A: "Choose one of your units. Until its
  activation in the next round, for its every attack, the unit rolls 2 dice
  and resolves the HIGHER result." (the Shaman's-Puppet advantage mirror —
  reuse `ATTACK_ROLL_ADVANTAGE`). B: "When you are about to roll any die roll
  it 3 times and resolve 1 chosen result." (replaces "reroll any die" /
  "set a die" — a 3-roll pick; extend the reroll-window machinery: the spend
  rolls the die twice more and the owner picks one of the three results).
- **Celestial Necklace of Bliss** — A: "+1 AT, Discard X cards from hand to
  gain +X AT." (adds a flat +1 base before the X). B unchanged.
- **Sword of Judgement** — A: "+1 AT, Discard X…+X AT"; B: "+1 Def, Discard
  X…+X Def." (both sides gain the flat +1 base).
- **Lion's Shield of Courage** — A: "+1 Def, Discard X…+X Def." (flat +1
  base). B unchanged.
- **Sandals of the Saint** — A: "+1 SP, Discard X…+X SP." (flat +1 base).
  B unchanged.
- **Centaur's Axe** (file "Centaur Axe.png") — B: "Triple the Attack die's
  outcome. **Ignore on '-1' result.**" (a rolled −1 is NOT tripled — it counts
  as plain −1… read: the tripling is ignored on a −1).
- **Crown of Dragontooth** — A: "Take **up to 2** Cast a Spell cards from your
  discard pile and put them back in your hand. Refresh **up to 2** Spells,
  once per round." B: "Remove 1 spell from **Spellbook**, then Search(2)
  Spells." BOOK-GATED: under the Polish Book A returns up to 2 enablers +
  refreshes up to 2 Book Spells (supersedes the current one-spell reading —
  37a6b452 — WHEN the balance rule is on); B removes an owned Book Spell
  (uninscribe) instead of a hand spell. Non-book game: A returns up to 2 Spell
  cards from discard (the old printed reading), B removes 1 spell from hand.
- **Crown of the Five Seas** — A: "Take 1 Cast a Spell card from your discard
  pile and put it back into your hand. Refresh 1 Spell, once per round."
  BOOK-GATED as above; non-book keeps the printed "Select 1 Spell card from
  your discard pile → hand". B unchanged.
- **Thunder Helmet** — A: same book-gated "Cast a Spell + Refresh 1" reading;
  non-book keeps printed. B unchanged.
- **Helm of the Alabaster Unicorn** — A: book-gated "Cast a Spell + Refresh
  1"; B: "Cast a Spell from the top of the Spell deck discard pile and Remove
  this card. **Add casted Spell to your Spellbook.**" (book-gated rider: after
  the cast the spell is inscribed into the caster's Book instead of returning
  to the shared discard; non-book: unchanged).
- **Rib Cage** — A: book-gated "Take 1 Cast a Spell card… Refresh 1 Spell,
  once per round. Then, shuffle your discard pile back into your deck of
  Might and Magic." (the reshuffle tail stays); B "+1 SP" unchanged.
- **Dragon Wing Tabard** — A: "+1 SP, **draw 1 card then discard 1 card**."
  (adds the cycle rider). B unchanged.
- **Spirit of Oppression** — A: "+1 SP, **draw 1 card then discard 1 card**."
  B unchanged.
- **Eversmoking Ring of Sulfur** — B: "Remove this card, then gain **1**
  valuables." (was 2). A income side unchanged.
- **Golden Bow** — B: "During this Combat, your ranged units ignore the combat
  penalty **and can reroll 1 Attack die once per turn**." (adds a
  once-per-combat-round ranged reroll source while the effect lives).
- **Hourglass of the Evil Hour** — B: "∂: For this combat round, reroll once
  each '+1' results on your enemy attack die." (replaces the roll-for-morale
  side; the `reroll_plus_one` morale-curse machinery scoped to one combat
  round, on the ENEMY's attack dice).
- **Pendant of Second Sight** — A: "Remove 1 paralysis token. OR Search (3)
  your M&M deck." (adds an own-deck Search(3) arm — reveal 3 from own deck,
  keep 1 to hand, rest to discard — the Solmyr-IV dig family). B unchanged.
- **Shaman's Puppet** — A: "Choose a unit. **Until the end of the next
  round**, for its every attack, the unit rolls 2 dice and resolves the lower
  result." (duration extends from "end of its activation" to "end of the next
  round").
- **Speculum** — A: "Discover any Map tile adjacent to the Map tile your Hero
  is currently on. OR Until the end of this turn, when you do Search action
  Search (X+1) instead." (adds the OR arm: a turn-long +1 Search widen).

NOT in scope: every artifact not in the 27-file list (incl. Charm of Mana,
Skull Helmet, Crest of Valor, Glyph of Gallantry, Legion pieces, Tomes, Orbs…)
— their sheet rows only mark set membership (already shipped) or are unchanged.

---

## 4. SPECIALTIES (11 cards; folder `Specialities/`; sheet `Heroes`)

File → card id (faces: `polish-balance/specialty-<hero>-<level>.webp`):

- **Adelaide IV** (`specialty.adelaide.4`) — "Take Cast a Spell or Specialty
  card from your discard pile and put it back in your hand. Refresh 1 Spell,
  once per round." BOOK-GATED (Cast a Spell + refresh); non-book keeps the
  printed "Select 1 Spell or Specialty card from your discard pile → hand".
- **Jeddite I** (`specialty.jeddite.1`) — "Draw up to 3 cards from your deck,
  take any **Cast a Spell** and Specialty cards to your hand. Discard the
  remaining cards." BOOK-GATED: under the Book the takeable kinds are Cast a
  Spell enablers + Specialties (owned Spells live in the Book, so raw Spell
  cards no longer appear in the deck); non-book keeps "Spell and Specialty".
- **Jeddite VI** (`specialty.jeddite.6`) — same, "up to 4 cards".
- **Sandro I** (`specialty.sandro.1`) — "Put this card on the **Stack or**
  Pack of Skeletons Unit card; it replaces the card's statistic. When the card
  is played on a Stack it gives **additional +1 AT**. When the Cloak of the
  Undead King card's HP drops to 0, discard this card." CHANGES: the cover may
  also be placed on a STACKED Skeletons card (`polish-unit-stacks` layers), and
  on a Stacked target it grants +1 AT on top. Stack clauses are gated on
  `polish-unit-stacks`/`armyUnitStacksActive`; without stacks the card plays as
  before.
- **Sandro IV** (`specialty.sandro.4`) — "Put this card on the **Pack or
  Stack** of Zombies Unit card…" (Stack placement allowed; no +1 AT rider
  printed on this one).
- **Vidomina IV** (`specialty.vidomina.4`) — "Put this card on the **Stack
  or** Pack of Skeletons Unit card; …When the card is played on a Stack it
  gives additional +1 AT. **Keep this card, until HP drops to 0.** When it
  does, discard this card." (Stack placement + the +1 AT rider; the keep
  clause references the cover's own HP, as today).
- **Dracon IV** (`specialty.dracon.4`) — "If you have a **Stack or** Pack of
  Magi Unit card, discard it. Then, search the Neutral Unit deck for the
  Enchanters card and add it to your Unit deck. **Gain 13 gold for each stack
  of Magi you had.** You can control only 1 Enchanters unit at a time. OR draw
  1 card." (a Stacked Magi qualifies; each Stack layer refunds 13 gold — the
  Magi Stack price. Stack clauses gated on unit-stacks being active.) The
  existing `dracon-few-magi-trade` house rule's Few arm is unrelated — keep it.
- **Gelu IV** (`specialty.gelu.4`) — same shape with Elves→Sharpshooters and
  "Gain **9 gold** for each stack of Elves you had."
- **Ciele I** (`specialty.ciele.1`) — "If you have a Cast a Spell card on your
  discard pile, Refresh up to 1 Magic Arrow spell and cast it. OR +1 SP.
  (Don't need to use Cast a spell card)". BOOK-GATED rework: under the Book,
  level I now CASTS the refreshed Magic Arrow (free of an enabler) when an
  enabler sits in the discard; non-book keeps the current recall-to-hand.
- **Ciele IV** (`specialty.ciele.4`) — "If you have a Cast a Spell card on
  your discard pile, Refresh up to 1 Magic Arrow spell and cast it. This spell
  does not count toward your Spell limit per Combat round. OR +1 SP. (Don't
  need to use Cast a spell card)". Book-gated as above; non-book keeps the
  current own-discard free cast.
- **Tarnum I** (Conflux, `specialty.tarnum_conflux.1` — verify the exact id)
  — "Search(1) Spell and add it to your Spellbook." CHANGES: the Remove option
  is DROPPED (the find is always kept; Book table → Spellbook, non-book →
  hand).

---

## Implementation contract (every step)

- Follow the `estates-nerf` pattern: branch at the ENGINE seam on
  `houseRuleEnabled(state, "polish-card-balance")`; never fork card ids.
- Card `tags` must state the balance side with a "Balance pack: …" prefix (the
  `initiative-specialty-draw` precedent) wherever the OFF text would otherwise
  promise the wrong thing — the face swap carries the full new text.
- Every changed behaviour needs an EFFECT test (observable outcome) + a
  rule-OFF CONTROL, mutation-checked (CLAUDE.md #1a).
- AI safety: every new window/choice must be answerable by the generic
  scorers + the AFK/turn-timeout driver (never a stall); new offers must be
  executable (no orphan offers).
- Faces: commit webp under `public/assets/polish-balance/`; resolve through
  ONE seam (`polishBalanceCardImage(cardId)` + a provider/context read like
  `ArtifactSetIconsProvider`) so every card-face surface follows; pin files on
  disk + the swap wiring with a rule-OFF CONTROL. Register the family in
  `scripts/compress-media.mjs` protections if needed (text-bearing faces).
