# Field Override object redesign (2026-08-19) — design contract

Full effect redesign of all 24 Field Override objects (13 anime + 7 WoG + the 2
equipment outfitters + 2 flagship wager sites) so each has a distinct identity,
plus a small set of NEW REUSABLE mechanics. This document is the design
authority for the batch; every effect below must be engine-enforced AND
effect-tested (CLAUDE.md §1/§1a) before its summary may claim it.

Engine seams (recon 2026-08-19):
- Visit menus: `buildWogFieldVisitStep` / `buildAnimeFieldVisitStep`
  (src/engine/adventure.ts ~6673/~6860); custom leaf steps resolve in
  `processPendingVisit` (~7440–7600 — SMASH_WOG_SKULL / MARK_ANIME_BOUNTY_CLAIMED
  pattern). `VisitStep` union: src/engine/state.ts ~10262.
- ATTACK_DIE_TABLE resolves at adventure.ts ~8473; its branches are plain
  VisitStep[], so DYNAMIC tables (pot payouts, stake multiples) are built at
  menu time — visits are exclusive, so a value read at menu build cannot race.
- Guard-mid-visit fights: the hex-event ambush seam (`applyCustomGuardToField`
  + `hexEventEncounterHook`, adventure.ts ~5330–5350) opens a REAL fight from a
  visit step; a fought win re-visits, mirroring `handleEscalatingFightVisit`
  (~6552: field.difficulty still standing at re-visit means "just beaten").
- Field props live on MapFieldState (state.ts ~9860, wogCaveWins family).
- Protocol: `ENGINE_PROTOCOL_VERSION` src/engine/version.ts:423 (40 → 41 at the
  END of the batch, one bump).
- Units carry NO persistent damage between combats (ArmyUnitState has none) —
  no map-side "heal" effect exists or is designed here.
- Unit XP primitive: `ArmyUnitState.experience` (+ the DRILL_UNIT handler is the
  reference for awarding XP to ONE card outside combat, UE-gated).
- Morale: `changeMorale` (adventure.ts:2999), player-level ± tokens.
- Resource-round debt seam: the Little Busters school-contribution block
  (adventure.ts ~16443) — Urahara's debt collects in the same place.

## New reusable mechanics

1. **Wager Guard** — the object carves UNGUARDED; the first visit opens a
   mandatory depth pick (OPTION range per object). The pick resolves a
   `WAGER_GUARD_FIGHT { level }` step: `applyCustomGuardToField` + the
   hex-event encounter hook opens the real fight. The post-win re-visit sees
   `field.difficulty` standing on a wager location ⇒ pays the ladder reward for
   that difficulty, `clearCustomGuard`, sets `field.wagerCleared` (the object is
   spent; menu absent afterwards). A retreat/loss leaves the stamped guard —
   the next arrival fights the SAME depth via the normal guarded-field path (no
   re-pick). Quick Combat / auto-win rules apply as on any guard field.
2. **Generic per-player field claim latch** — `field.fieldClaimedBy: PlayerId[]`
   (+ `MARK_FIELD_CLAIMED` step), the generalized `animeBountyClaimedBy`.
   Backs every "once per player, ever" arm. A per-ROUND variant rides
   `field.fieldRoundClaims: { round: number; playerIds: PlayerId[] }` (+
   `MARK_FIELD_ROUND_CLAIMED`): reading it ignores entries from another round.
3. **Field gold pot** — `field.denGoldPot: number`; `ADD_FIELD_GOLD_POT` /
   `CLEAR_FIELD_GOLD_POT` steps. Lost stakes accumulate ON the hex; a later
   winner takes the pot. Public state (field props are not redacted) — the pot
   is meant to be a visible lure.
4. **Planted reward** — `field.plantedBy` / `field.plantedRound` (+
   `MARK_FIELD_PLANTED` / `CLEAR_FIELD_PLANTED`): invest now, harvest ≥3 rounds
   later; an ENEMY visitor may raid a planted field for a small cut, trampling
   the crop. Single-hex map contention.

Deliberately NOT shipped (considered, rejected for seam risk): recruit-the-guard
(needs guard-identity capture in finalizeAdventureCombat), equipment rental
(temp-ownership lifecycle), a teleport-travel toll (invasive in
resolveTokenTeleport), mid-visit instant ambush combat with reward-after (the
Skull uses a leave-behind guard instead), map-side unit healing (no persistent
damage exists).

## Per-object effects (the machine truth is the code + tests; this is the intent)

### Xianxia (anime-xianxia)
- **bi_canh** — WAGER Ⅲ–Ⅶ. Ladder: Ⅲ Search(1) Artifact; Ⅳ Search(1) Artifact
  +3 valuables; Ⅴ Search(1)×2 Artifact; Ⅵ Search(1)×2 + one Grade-II equipment
  purchase-free grant (equipment module on; absent otherwise); Ⅶ Search(1)×2 +
  Search(3) Artifact. One clear, then spent (`wagerCleared`). No carve guard.
- **kiem_trung** — carve guard Ⅱ. Post-win visit: Search(1) Artifact; with Unit
  Experience active, ALSO a CHOOSE_ONE: one of your army unit cards gains
  +2 unit XP (arm absent with UE off). The −1 morale is gone.
- **linh_tuyen** — cleanse: remove ALL the visitor's negative morale tokens
  (nothing to cleanse ⇒ +1 morale instead) + 1 movement. Visitable (cube).
- **ngo_dao_thach** — first visit per player (claim latch): Search(2) the
  Ability deck AND gain one Ability Empower token (the Creature-Bank grant
  reused). Later visits: Search(1) Ability. WAVE-2 AMENDMENT: the hex STAYS
  `visitable` (Black Cube) — flipping to revisitable would open Hero-Grade
  Merit farming (`HERO_GRADE_MERIT_HEX_LOCATION_IDS` pays +1 Merit on every
  fresh visit, no per-player latch). So in practice ONE player gets the
  first-visit reward; the "later visit" branch is reachable only after a
  designer `clear_tile_cubes` event. Conscious trade-off, documented in the
  summary.
- **tran_phap_truyen_tong** — Monolith travel unchanged; NEW: once per player
  (claim latch) an "Attune" arm grants +1 movement.
- **thuong_hoi_tram** — Trading Post unchanged; NEW appended "contract" arm:
  each game round the post wants ONE seeded resource kind (seed: game seed +
  round); once per player per round (round latch), sell 1 of that resource for
  DOUBLE the market gold rate. WAVE-2 AMENDMENT: the wanted kind is building
  materials or valuables only (gold has no sell rate), payout 2 or 6 gold.
- **song_bac_quan** — choose a stake of 1 / 3 / 5 gold (affordable arms only).
  Attack die: +1 → win 2×stake + the POT (pot then clears); 0 → stake back;
  −1 → the stake joins `denGoldPot`. Pot is public and persists on the hex.
- **dai_luyen_khi** — Meditate (+1 morale) OR "Temper the body": pay 1 hero
  movement → your units all gain +1 Attack during ROUND 1 of your next combat
  (player flag `pendingCombatAttackBoost`, consumed at `finalizeCombatStart`,
  round-1-scoped active effect; not offered while one is already banked).
- **thi_luyen_thap** — escalating Ⅰ→Ⅱ→Ⅲ (unchanged machinery). New ladder:
  win 1 +2 gold; win 2 — with UE active, a chosen army unit card gains +3 unit
  XP (UE off ⇒ Search(1) Spell as before); win 3 +2 hero XP, keeping the
  cultivation tribulation-relief and commander-artifact riders.
- **linh_dien** — PLANTED REWARD: pay 2 gold to plant (your marker + round).
  Your visit at ≥ planted+3 rounds: harvest +3 valuables +1 building materials
  (clears). Another player's visit while planted: raid +1 valuables, crop
  trampled (clears). Not mature ⇒ informational note only. Revisitable, no cube.
- **ren_binh_cac** — shop unchanged; NEW "reforge" arm shared with the
  outfitter: pay 2 gold → swap ONE owned equipment item for a different
  same-grade item (ownership/context filters as any shop; replaced item is
  removed, not inventoried — a trade, not a purchase). WAVE-2 AMENDMENT:
  same-GRADE, any slot; an item displaced from the destination slot goes to
  the bag via the normal equip path (only the traded-away item leaves the game).

### Isekai (anime-isekai)
- **capsule_lab** — War Machine shop unchanged; NEW once per player per game
  (claim latch): "Prototype gadget" — pay 3 gold → roll 2 Treasure dice.
- **urahara_shop** — paid arms unchanged (3g artifact search / 1g treasure
  die); NEW "free curio, on credit": Search(1) Artifact now + `uraharaDebt`
  latch on the player; at the player's next Resource-round income the debt
  collects — pay 3 gold, or (if short) a seeded-random hand card is discarded.
  Arm absent while a debt is outstanding.
- **onsen_ryokan** — "Full course" (once per player per game round, round
  latch): +1 morale AND +1 movement. Always available: "Quick dip" +1 movement.
- **dungeon_gate** — WAGER Ⅰ–Ⅳ. Ladder: Ⅰ +2 gold; Ⅱ 1 Treasure die; Ⅲ
  Search(1) Artifact; Ⅳ one Grade-II equipment grant (equipment module on;
  otherwise Search(1) Artifact + 2 gold). One clear, then spent.
- **guild_bounty** — small job unchanged (+2 gold once per player, ever;
  legacy `animeBountyClaimedBy` latch kept). Paid search unchanged. NEW "guild
  quest" arm, offered only while the visitor holds a POSITIVE morale token:
  spend 1 morale → +4 gold and Search(1) Ability.
- **adventurer_outfitter** — shop unchanged + the shared reforge arm (see
  ren_binh_cac).

### WoG (wog.newObjects)
- **emerald_tower** — guard Ⅲ unchanged. Arms: commander point (unchanged),
  2g hero XP (unchanged), NEW with UE active: pay 4 gold → a chosen army unit
  card gains +2 unit XP.
- **mirror_home_way** — price by destination band: 1 gold to a Town/Settlement
  on a starting/far tile, 3 gold to near/center. Same teleport machinery.
- **junk_merchant** — sells + 4g search unchanged; NEW "trade-in": swap a hand
  Artifact for the TOP card of the Artifact discard + 1 gold (arm absent with
  no hand Artifact or an empty discard); NEW once per player per game (claim
  latch) "mystery crate": pay 5 gold → Attack die: +1 → Search(1) Artifact +
  2 gold back; 0 → Search(1) Artifact; −1 → 2 gold back only.
- **fishing_well** — escalating catch: pay 1 gold to fish (once per visit);
  your catch grows with YOUR consecutive-round streak (`wogFishingStreaks`:
  per-player {round, streak}; a skipped round resets to 1): streak 1 → +1
  valuables; 2 → +2 valuables; 3 → 1 Treasure die AND the well runs dry for
  EVERYONE (`wogWellDry` global latch). Static die table replaced by a dynamic
  menu.
- **living_skull** — Listen unchanged. Smash: +2 gold, the skull falls silent
  (latch kept) AND an angry spirit re-guards the hex at Ⅱ; whoever beats it
  gets Search(1) Ability and the hex is then inert for good.
- **adventure_cave** — ladder: win 1 +3 gold; win 2 a FIXED Stack Token
  (player picks the stat: +1 Attack/Defense/Health or +2 Initiative) onto a
  chosen army unit card without one; win 3 Search(1) Artifact + the
  commander-artifact rider (unchanged).
- **altar_of_gods** — offering menu unchanged, plus a GREATER SACRIFICE arm
  (needs ≥2 army unit cards — never strands an army): permanently remove one
  chosen army unit card → choose: (+1 commander stat point AND +1 morale)
  [commander arm filtered as today] or +4 hero XP.

## Rollout waves
1. New props/steps + flagships: wager (bi_canh, dungeon_gate), pot den, planted
   field. 2. Rest of xianxia. 3. Isekai. 4. WoG. 5. Full suite, review,
   CLAUDE.md update, protocol 41, deploy, push.

Every wave: effect tests with CONTROLs (mode off / wrong player / not mature /
already claimed), observable-outcome assertions (resource deltas, XP deltas,
guard difficulty transitions), and updated `summary` strings that state exactly
what runs.
