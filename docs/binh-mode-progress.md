# Game modes & content build — working checklist

Working notes for the Legacy/BINH mode build. Mirrors the user request; checked items are implemented **and** wired (not decoration). Final state belongs in `content-tracker.md`.

## Modes
- [ ] `ruleset` option (`legacy` | `binh`) chosen in the lobby, threaded through state/engine/PartyKit, BINH default, shown in HUD
- [ ] Legacy = community rulebook behavior; BINH = house rules below

## House rules (BINH only)
- [ ] Wisdom: basic −2 gold on Mage Guild spell buys + Search(3); expert −3 gold + Search(4) (legacy printed: −2 gold both, Search(3)/(4))
- [ ] Estates: basic gain 2 gold, expert 4 (legacy printed: 3/6)
- [ ] Griffins Few: 3 attack (legacy 2)
- [ ] Griffins Pack: 1 defense (legacy 0)
- [ ] Marksmen Pack: 3 HP (legacy 2)
- [ ] Cerberi Pack/Neutral: attacks ALL other adjacent enemies — each a full separate attack at attack 3 (buffable/defendable, no retaliation) (legacy printed: 1 flat damage to one other adjacent enemy)
- [ ] Split spell deck: Basic + Expert decks; expert draws gated by (hero level ≥4 AND a IV–V/VI–VII tile revealed) OR holding Eagle Eye / Wisdom / Basic elemental Magic
- [ ] Split artifact decks: Minor / Major / Relic; Minor always; Major on IV–V+ tile OR (level ≥4 + artifact building e.g. Blacksmith); Relic on VI–VII tile OR (level ≥6 + artifact building); player picks among unlocked decks
- [ ] BINH ability deck adds Eagle Eye, Scouting, Basic Air/Earth/Fire/Water Magic (+ Fortune spell)

## Rules-correctness fixes (both modes)
- [ ] Second negative morale token → morale resets to neutral + discard hand at turn end (wiki morale table)
- [ ] Mage Guild: build → Search(2) twice; Spell Book token unusable same round; 5g (6g Castle) per later search — verify + wisdom hook
- [ ] Spells castable during combat: activation-timed spells (Magic Arrow…) during your own unit's activation; instant spells (Bloodlust, Stone Skin, Curse, Weakness, Bless…) playable INTO attacks with Power empowerment, counting toward the 1-spell/round limit  ← user bug report
- [ ] Ongoing cards last until the owner's NEXT turn starts (not end of current turn)
- [ ] Offense/Armorer printed "then draw 1 card"
- [ ] Scholar basic: take 1 card from your discard pile
- [ ] Every spell playable as the printed alternative "+1 Power"

## Map-usable abilities (correct effects)
- [ ] Wisdom (town, spell purchase) · [ ] Estates (instant gold) · [ ] Luck (verified) · [ ] Logistics (end-turn step / expert +1 MP) · [ ] Scouting (next Search upgrade) · [ ] Mysticism (recall cast spell) · [ ] Eagle Eye (dig spell deck) · [ ] Basic X Magic (school fetch) · [ ] Scholar/Leadership/Sorcery/Armorer

## Content import
- [ ] Full spell set (Core+Rampart+Inferno implementable subset) with printed effects
- [ ] Full artifact set (3 tiers) with printed effects incl. discard/remove costs
- [ ] Ability cards: estates, logistics, scouting, mysticism, eagle eye, armorer, basic elemental magics
- [ ] Blacksmith building implemented (artifact source)
- [ ] Dice rewards verified vs wiki (resource/treasure die — already correct)

## Images
- [ ] Hero portraits → heroes.thelazy.net
- [ ] Town buildings (all 5 factions) → heroes.thelazy.net
- [ ] Resource icons (gold / ore=building materials / crystal=valuables)
- [ ] Morale token icons (positive/negative birds)
- [ ] XP/statistics art reference (heroes3wog army management)

## Infra
- [ ] PartyKit/DO rooms keep working with ruleset option (old snapshots default to legacy)
- [ ] Tests for: mode overrides, cerberi multi-attack, morale fix, deck gating, wisdom purchase, spell-into-attack
- [ ] content-tracker.md + README updated
- [ ] typecheck · lint · test · build green → push branch + main
