# Fuyuki City and Hidden Leaf overhaul

## Faction mechanics

### Fuyuki — Command Seals

- A Fuyuki player starts with three seals for the game (`undefined` in a legacy save is read as three).
- At most one seal may be spent per combat, during the active friendly unit's main-hero activation.
- **Compel:** before that unit attacks, it gains +1 Attack for the current activation.
- **Recall:** heal up to 3 damage from that unit. It cannot revive a defeated unit.
- The action is reducer-validated, appears in legal actions and the command dock, and is scored by the combat AI.

### Hidden Leaf — Mission Rank

- Won neutral encounters award mission points: ordinary difficulty I–II = 1, III–V = 2, VI–VII/Azure = 3; banks = 2; dungeon/raid missions = 3.
- Forced waves, teleport-arrival guards, and difficulty-0 outposts grant no mission points.
- Rank thresholds are D 0, C 3, B 7, A 12, S 18.
- C/B missions pay 1 bonus gold; A/S missions pay 2. Each crossed promotion grants 1 valuable.
- The recurring bounty is capped at 2 gold and the complete promotion track at 4 valuables.

Both mechanic states are public, optional fields for save compatibility. Their current values are shown above the matching town board and every use/completion writes a structured faction-mechanic event.

## Canonical rosters

Fuyuki's stable unit IDs and existing audio/art routing remain intact, while display identities are Sasaki Kojirō, Medusa, Cú Chulainn, EMIYA, Medea, Artoria Pendragon, and Heracles. Its selectable heroes are Shirou Emiya, Rin Tohsaka, Illyasviel von Einzbern, Kiritsugu Emiya, Kirei Kotomine, and Sakura Matou.

Hidden Leaf's stable unit IDs remain intact, while display identities are Academy Genin, Sakura's Medical Corps, ANBU Black Ops, Leaf Jōnin, Gamabunta, Nine-Tails Chakra Avatar, Perfect Susanoo, and the multi-character Hokage Vanguard. Kakashi Hatake, Shikamaru Nara, and Jiraiya join Naruto, Sasuke, and Tsunade. Hidden Leaf may deploy at most two Gold units and no Neutral-side units in any battle.

Every selectable hero has an implemented I/IV/VI specialty set. Unit-specialist strings exactly match recruitable unit names; Sakura and Tsunade use wired, faction-agnostic healing sets.

## Art provenance

Nine new 1086×1448 WebP hero portraits were created with the built-in OpenAI ImageGen tool and saved under `public/assets/anime/heroes/`. Prompts requested a single recognizable, age-appropriate character; vertical strategy-card composition; painterly anime realism; setting-appropriate magic/chakra; UI breathing room; and no text, border, watermark, gore, or extra characters.

The generated subjects were Shirou, Rin, Illya, Kiritsugu, Kirei, Sakura, Kakashi, Shikamaru, and Jiraiya. Fuyuki and Hidden Leaf unit cards were rebuilt from their existing approved illustrations so their printed names, stats, and rules match engine data without changing the towns' visual register.

The Hokage Vanguard master was generated separately with built-in OpenAI ImageGen as a coordinated four-character formation: Hashirama, Tobirama, Hiruzen, and Minato, with exactly four visible characters and no text, border, logo, watermark, or background soldiers. Its Few and Pack cards share that approved master.

## Verification gate

- Pure and reducer tests cover Command Seal limits/modes and Mission Rank thresholds/rewards.
- Real neutral-combat finalization covers Hidden Leaf promotion and resource events.
- Twelve deterministic AI-vs-AI, seat-swapped mixed-tier battles produced a 5–7 Fuyuki/Hidden Leaf split after tuning (the first pass was 11–1 and was rejected).
- Both towns complete mixed-tier fights against Castle and Necropolis from either seat.
- Two seat-swapped adventure games reach round 5 with no stalls or invariant violations; the existing three-seed Hidden Leaf live soak also remains green.
- Hidden Leaf deployment tests prove a third Gold and every Neutral-side card are absent from legal actions and rejected when submitted as forged actions.
