import type { RankSchedule, RankStep, UnitRankStatBonus } from "./experience-rank-abilities";

const bonus = (stats: Partial<UnitRankStatBonus>): UnitRankStatBonus => ({ attack: 0, defense: 0, health: 0, initiative: 0, ...stats });
const S = (stats: Partial<UnitRankStatBonus>): RankStep => ({ kind: "stats", stats: bonus(stats) });
const H = (stats: Partial<UnitRankStatBonus>, id: string): RankStep => ({ kind: "hybrid", stats: bonus(stats), choices: [id] });
const ranks = (r1: string | RankStep, r2: string | RankStep, r3: string | RankStep, r4: string | RankStep): RankSchedule => {
  const step = (r: string | RankStep): RankStep => typeof r === "string" ? { kind: "ability", choices: [r] } : r;
  return { 1: step(r1), 2: step(r2), 3: step(r3), 4: step(r4) };
};

/** Individual power curves, considering both printed sides and the cumulative kit.
 * Modest ranks can precede a larger stat package or a hybrid payoff; abilities
 * are not interchangeable budget points. No random pools or tier multipliers.
 * Shared rules retain their actual names, icons and engine behavior.
 * MGQ jobs retain their R3 signature; R2 uses the authored species reward.
 */
export const CUSTOM_VETERANCY_OVERRIDES: Record<string, RankSchedule> = {
  // Forge experience is authored per unit; keep its combat hooks isolated.
  "forge.cyberbrutes": ranks("forge-vet-cyberbrute-mend", S({ defense: 1 }), S({ health: 1 }), H({ initiative: 3 }, "forge-vet-open-wound")),
  "forge.tanks": ranks(H({ initiative: 2 }, "forge-vet-tank-reposition"), S({ health: 1 }), S({ defense: 1 }), "forge-vet-tank-death-burst"),
  "forge.jump_troopers": ranks("forge-vet-jump-guard", S({ attack: 1 }), "veteran-mobility-1", S({ health: 1 })),
  "forge.bruisers": ranks(S({ health: 1 }), "forge-vet-bruiser-guard", S({ attack: 1 }), "forge-vet-bruiser-break"),
  "forge.cyber_zombies": ranks(H({ health: 1 }, "forge-vet-zombie-repair"), S({ defense: 1 }), "veteran-zombie-intercept", "veteran-defense-pierce"),
  "forge.grunts": ranks("forge-vet-grunt-tempo", S({ attack: 1 }), H({ defense: 1 }, "forge-vet-grunt-cover"), "forge-vet-grunt-mark"),
  // Fuyuki: duelists gain utility; existing multi-hit kits get restrained payoffs.
  "fuyuki.assassins": ranks("ntv-first-volley", "ntv-strike-and-return", S({ attack: 1, health: 1 }), "ctv-returning-edge"),
  "fuyuki.riders": ranks(S({ health: 1, initiative: 1 }), "ntv-predators-mark", "ntv-bone-wall", "veteran-troll-snare"),
  "fuyuki.lancers": ranks("ntv-set-the-spear", S({ initiative: 2 }), "veteran-energy-delay", H({ health: 1 }, "ctv-returning-edge")),
  "fuyuki.archers": ranks("town-elf-guard", "ctv-covering-extraction", "ntv-arcane-plating", "ntv-bewitching-bolt"),
  // Medea deals fixed damage without a die: no Attack, pierce or die rewards.
  "fuyuki.casters": ranks(H({ health: 1 }, "town-sorceress-artifact-tax"), "ctv-rule-unravel", S({ initiative: 3 }), "veteran-sprite-obstacle"),
  "fuyuki.sabers": ranks("town-crusader-undead", "ctv-rescue-step", "town-ram-spell-draw", H({ initiative: 1 }, "ntv-guardian-angel")),
  "fuyuki.berserkers": ranks("ntv-blind-instinct", "ntv-marsh-scavenger", "veteran-energy-delay", "town-devil-draw"),

  // Azure Breeze: terrain, card economy and exchanges, not another stack of wards.
  "azure_breeze.outer_disciples": ranks(H({ health: 1 }, "ntv-bone-wall"), "ctv-meridian-exchange", S({ attack: 1, initiative: 1 }), "ntv-winged-riposte"),
  "azure_breeze.inner_swordsmen": ranks("ntv-set-the-spear", "ntv-flowing-assault", "veteran-magic-dispel", H({ initiative: 2 }, "ntv-measured-blades")),
  "azure_breeze.spirit_crane": ranks("town-elf-guard", "veteran-sprite-obstacle", "ntv-disorienting-landing", H({ attack: 1 }, "ntv-mana-turbulence")),
  "azure_breeze.sect_protectors": ranks("ctv-returning-edge", S({ health: 2 }), "town-ram-spell-draw", H({ health: 1 }, "ntv-blind-instinct")),
  "azure_breeze.true_inheritors": ranks("ntv-pack-rush", "veteran-layer-draw", H({ health: 1 }, "ntv-flowing-assault"), "commander-max-damage"),
  "azure_breeze.core_master": ranks("town-gremlin-recover", "ctv-clear-mind", "ntv-core-suppression", "veteran-magic-copy"),
  "azure_breeze.mountain_guardian": ranks("ntv-deep-roots", "ntv-armoured-prey", "ntv-mountain-stillness", "ctv-mountain-break"),

  // Leaf: support learns disruption; sturdy summons gain reach and counterplay.
  "hidden_leaf.genin_squad": ranks("ntv-pack-rush", "ntv-strike-and-return", S({ health: 2, initiative: 1 }), "ntv-infernal-command"),
  "hidden_leaf.medical_nin": ranks(S({ attack: 2 }), "veteran-blind-dust", H({ health: 1 }, "ntv-flowing-assault"), "veteran-magic-dispel"),
  "hidden_leaf.anbu": ranks("town-seaman-survival-gold", "ntv-venom-arrow", "veteran-low-roll-insight", "ctv-covering-extraction"),
  "hidden_leaf.jonin": ranks("ntv-boarding-formation", "veteran-storm-link", H({ health: 1 }, "ntv-measured-blades"), "town-lizard-spell-draw"),
  "hidden_leaf.giant_toad": ranks(S({ initiative: 2 }), "veteran-troll-snare", "veteran-magma-hunter", "ntv-toxic-counter"),
  "hidden_leaf.jinchuriki": ranks("veteran-energy-delay", "ntv-searing-passage", "ntv-mana-turbulence", "veteran-rebirth"),
  "hidden_leaf.susanoo": ranks("ntv-armoured-prey", S({ attack: 1, health: 1 }), "town-ram-spell-draw", "ntv-bodyguard"),
  "hidden_leaf.hokage_vanguard": ranks("town-ram-spell-draw", "ctv-clear-mind", "ntv-infernal-command", "veteran-magic-dispel"),

  // Fleet: Unicorn gets independent mobility and disruption, not more healing.
  "azur_lane.laffey": ranks("bulwark-air-shield", "ntv-searing-passage", "ntv-first-volley", "ntv-flowing-assault"),
  "azur_lane.javelin": ranks("town-seaman-survival-gold", H({ health: 1 }, "ntv-boarding-formation"), "ntv-winged-riposte", S({ attack: 1, health: 1 })),
  "azur_lane.honolulu": ranks("ntv-suppressing-shot", "veteran-storm-link", "ctv-covering-extraction", "ntv-consecrated-shot"),
  "azur_lane.unicorn": ranks("veteran-unicorn-enfeeble", S({ attack: 1, initiative: 2 }), "veteran-flying-movement", "veteran-magic-dispel"),
  "azur_lane.yukikaze": ranks("ntv-pack-rush", "veteran-energy-delay", "ntv-ethereal-escape", H({ attack: 1 }, "ctv-clear-mind")),
  "azur_lane.ayanami": ranks("veteran-speed-hunter", "ctv-blood-price", "ntv-ageing-breath", "ntv-ethereal-escape"),
  "azur_lane.prinz_eugen": ranks(H({ health: 1 }, "town-seaman-survival-gold"), "ntv-scaled-intercept", "ntv-armoured-prey", "ctv-returning-edge"),
  "azur_lane.i19": ranks("ntv-disrupting-gaze", "ntv-stone-landing", "town-lizard-spell-draw", S({ initiative: 2 })),
  "azur_lane.akagi": ranks("ntv-boarding-formation", "ntv-marked-volley", S({ health: 2 }), "ntv-bewitching-bolt"),

  // Demon sect: sacrifices, terrain denial and retaliation have distinct owners.
  "heavenly_demon.blood_disciples": ranks("ntv-bone-wall", "ntv-potent-venom", "ctv-blood-price", "town-zealot-loss"),
  "heavenly_demon.gu_witches": ranks(S({ health: 2, initiative: 1 }), "veteran-storm-link", "town-sorceress-artifact-tax", "ntv-bewitching-bolt"),
  "heavenly_demon.shadow_wraiths": ranks("town-seaman-survival-gold", "veteran-ranged-fire-shield", "ntv-stolen-spark", H({ attack: 1 }, "ntv-searing-passage")),
  "heavenly_demon.corpse_puppets": ranks("veteran-magma-hunter", "ntv-putrid-grasp", "ntv-deep-roots", S({ health: 3 })),
  "heavenly_demon.bone_reavers": ranks("ntv-marsh-scavenger", "wog-nightmare-fear", "veteran-magic-dispel", "ntv-infernal-command"),
  "heavenly_demon.ghost_king": ranks("town-sorceress-artifact-tax", "ntv-return-fire", "ntv-death-cloud", "ctv-rule-unravel"),
  "heavenly_demon.demon_avatar": ranks("veteran-fear-aura", "ntv-infernal-command", "town-devil-draw", S({ initiative: 2 })),

  // Little Busters: low-roll kits retain their low rolls; Masato needs no chase.
  "little_busters.haruka": ranks("ntv-pack-rush", "ntv-measured-blades", "ctv-clear-mind", "ntv-flowing-assault"),
  "little_busters.rins_cats": ranks("town-seaman-survival-gold", "veteran-sprite-obstacle", "ntv-marsh-scavenger", H({ attack: 1 }, "ntv-pack-rush")),
  "little_busters.disciplinary_committee": ranks("ntv-marked-volley", "ntv-suppressing-shot", "town-sorceress-artifact-tax", S({ health: 2, initiative: 1 })),
  "little_busters.masato": ranks("veteran-magma-hunter", H({ health: 1 }, "ntv-armoured-prey"), "ctv-muscle-reversal", S({ health: 3 })),
  "little_busters.softball_club": ranks("ntv-boarding-formation", "ntv-first-volley", "ctv-covering-extraction", H({ health: 1 }, "ntv-lucky-ricochet")),
  "little_busters.saya": ranks("ntv-measured-blades", "veteran-spell-sunder", "ntv-stolen-spark", "town-devil-draw"),
  "little_busters.mio": ranks(S({ initiative: 2 }), "veteran-water-damper", "town-gremlin-recover", "veteran-magic-copy"),

  // Kivotos: add a second job, not another copy of each student's signature.
  "blue_archive.mika": ranks("ntv-arcane-plating", "town-crusader-undead", "town-ram-spell-draw", "ntv-victory-command"),
  "blue_archive.seia": ranks(H({ health: 1 }, "ntv-blind-instinct"), "veteran-sprite-obstacle", "ctv-rescue-step", "veteran-water-damper"),
  "blue_archive.nagisa": ranks("ntv-consecrated-shot", S({ attack: 1, health: 1 }), "ntv-bewitching-bolt", "ntv-boarding-formation"),
  "blue_archive.aris": ranks(S({ initiative: 2 }), "ntv-armoured-prey", H({ health: 1 }, "ctv-clear-mind"), "ntv-boulder-crash"),
  "blue_archive.kei": ranks("ntv-disorienting-landing", "ntv-labyrinth-cleave", "ntv-water-air-damper", "ntv-ally-blind-instinct"),
  "blue_archive.hoshino": ranks("town-seaman-survival-gold", H({ health: 1 }, "ctv-break-cover"), "veteran-magma-hunter", "ctv-muscle-reversal"),
  "blue_archive.shiroko": ranks("veteran-steady-aim", "ntv-venom-arrow", "veteran-low-roll-insight", "ntv-return-fire"),
  "blue_archive.hina": ranks("town-lizard-spell-draw", "ntv-stone-landing", "ntv-stolen-spark", "ntv-infernal-command"),
  "blue_archive.yuuka": ranks("ntv-measured-blades", "ntv-disrupting-gaze", "ctv-field-repair", "veteran-layer-draw"),
  "blue_archive.aru": ranks("ntv-cowards-luck", "ntv-ethereal-escape", "ntv-suppressing-shot", "ntv-marked-volley"),
  "blue_archive.neru": ranks("ntv-pack-rush", "ntv-arcane-plating", "ctv-rescue-step", "ntv-disrupting-gaze"),
  "blue_archive.toki": ranks("ntv-stone-landing", "ntv-disorienting-landing", "ntv-mana-turbulence", "wog-fire-shield-1"),
  "blue_archive.azusa": ranks("town-elf-guard", "ntv-venom-arrow", "ctv-clear-mind", "ntv-skirmisher-step"),
  "blue_archive.wakamo": ranks("ntv-stolen-spark", "town-dragon-hunter", "ntv-bewitching-bolt", H({ health: 1 }, "attack-roll-advantage-passive")),
  "blue_archive.saori": ranks("bulwark-air-shield", "ctv-blood-price", "ntv-toxic-counter", S({ attack: 1, health: 1 })),
  "blue_archive.iori": ranks("town-seaman-survival-gold", "veteran-defense-pierce", "ntv-return-fire", "ntv-ethereal-escape"),
  "blue_archive.mutsuki": ranks(H({ initiative: 1 }, "ntv-measured-blades"), "town-orc-discard", "veteran-mobility-1", "veteran-sprite-obstacle"),
  "blue_archive.miyo": ranks("veteran-energy-delay", "veteran-blind-dust", "ntv-guardian-angel", "town-ram-spell-draw"),
  "blue_archive.hasumi": ranks("ntv-winged-riposte", "veteran-spell-sunder", "ntv-raking-dive", "veteran-layer-draw"),

  // MGQ species paths also stand alone; a selected job replaces only R3.
  "mgq.pochi": ranks("town-seaman-survival-gold", "ntv-pack-rush", S({ attack: 1, health: 1 }), "ntv-strike-and-return"),
  "mgq.shesta": ranks("ctv-clear-mind", "ntv-putrid-grasp", "ntv-potent-venom", H({ attack: 1 }, "ntv-blind-instinct")),
  "mgq.gigi": ranks("veteran-thunder-retaliation", "ctv-break-cover", "ntv-mana-turbulence", "ntv-chain-lightning"),
  "mgq.kamuro_kitsu": ranks("ntv-first-volley", "ntv-strike-and-return", S({ health: 1, initiative: 1 }), "veteran-magic-copy"),
  "mgq.fleesia": ranks("ntv-deep-roots", "veteran-magma-solidify", "ntv-toxic-counter", H({ attack: 1 }, "ntv-threefold-threat")),
  "mgq.sofia": ranks(S({ attack: 2 }), "veteran-ice-bolt", "veteran-storm-guard", "veteran-sprite-obstacle"),
  "mgq.miyabi": ranks("town-elf-guard", "ntv-disorienting-landing", "ctv-rescue-step", "ntv-winged-riposte"),
  "mgq.eater": ranks("veteran-magma-hunter", S({ initiative: 2 }), "veteran-troll-snare", H({ health: 1 }, "ntv-blind-instinct")),
  "mgq.hild": ranks("town-elf-guard", "wog-war-zealot-mirror", "veteran-storm-link", "town-lizard-spell-draw"),
  "mgq.chrome_frederica": ranks("ntv-armoured-prey", "ntv-scaled-intercept", "commander-defense-token", "veteran-adjacent-enfeeble"),
  "mgq.shizuku": ranks("ntv-armoured-prey", "ctv-field-repair", "ntv-labyrinth-cleave", "ntv-flowing-assault"),
  "mgq.regina": ranks("ntv-set-the-spear", "town-griffin-counter", "ctv-returning-edge", "veteran-layer-draw"),
  "mgq.maiden": ranks("ntv-pack-rush", "ntv-ethereal-escape", "ntv-moonlit-aid", "ctv-rule-unravel"),
  "mgq.seraphy": ranks("ntv-stolen-spark", "veteran-flying-movement", "ntv-disrupting-gaze", "ntv-blind-instinct"),
  "mgq.lisa": ranks("ntv-disorienting-landing", "ntv-first-volley", "town-ram-spell-draw", "ntv-winged-riposte"),
  "mgq.tama": ranks("town-seaman-survival-gold", "ntv-flowing-assault", "ntv-bone-wall", "ctv-blood-price"),
  "mgq.maya": ranks("veteran-low-roll-insight", "ntv-return-fire", "ntv-first-volley", "ctv-covering-extraction"),
  "mgq.matis": ranks("ntv-arcane-plating", "wog-fire-shield-1", "ntv-infernal-command", "ntv-stone-landing"),
  "mgq.ooma": ranks("ntv-hellish-endurance", "ntv-putrid-grasp", "veteran-sprite-obstacle", "veteran-energy-drain"),
  "mgq.jessie": ranks("ntv-set-the-spear", "ntv-blood-tribute", "ntv-bodyguard", "ctv-returning-edge"),
  "mgq.aria": ranks("town-sorceress-artifact-tax", "veteran-adjacent-enfeeble", "veteran-magic-dispel", "town-ram-spell-draw"),
  "mgq.carmilla": ranks("ntv-disrupting-gaze", "veteran-flying-movement", "town-devil-draw", "veteran-magic-copy"),
  "mgq.giga": ranks("ntv-scaled-intercept", "ntv-ageing-breath", "veteran-magma-solidify", S({ health: 2 })),
  "mgq.lucretia": ranks("town-ram-spell-draw", "ctv-clear-mind", "ctv-field-repair", "veteran-sprite-spell-block"),
  "mgq.cupi": ranks("ntv-lucky-ricochet", "ntv-bewitching-bolt", "ntv-return-fire", "town-sorceress-artifact-tax"),
  "mgq.sphinx": ranks("veteran-blind-dust", "veteran-crystal-burst", "veteran-water-damper", "wog-nightmare-fear"),
  "mgq.lucifina_chan": ranks("town-crusader-undead", "ntv-disorienting-landing", "ntv-moonlit-aid", "veteran-magic-dispel"),
  "mgq.spider_princess": ranks("town-seaman-survival-gold", "ntv-deep-roots", "veteran-energy-delay", "veteran-spell-sunder"),
  "mgq.emily": ranks("veteran-energy-delay", "ctv-rule-unravel", "ntv-mana-turbulence", "veteran-water-damper"),

  // Imperium: combat medics, obstacle clearing and suppression complement printed roles.
  "imperium.astra_militarum": ranks("ntv-boarding-formation", "ntv-suppressing-shot", H({ health: 1 }, "ntv-return-fire"), S({ attack: 1, initiative: 1 })),
  "imperium.apothecary": ranks(S({ attack: 1, initiative: 1 }), "ntv-armoured-prey", "ntv-putrid-grasp", "ctv-rescue-step"),
  "imperium.space_marines": ranks("town-elf-guard", "ntv-raking-dive", S({ health: 1, initiative: 1 }), "imperium-winged-riposte-3"),
  "imperium.rhino": ranks(S({ health: 1 }), "veteran-sprite-obstacle", "ctv-field-repair", H({ initiative: 1 }, "ntv-set-the-spear")),
  "imperium.terminators": ranks("veteran-energy-delay", "ctv-break-cover", "ctv-returning-edge", "town-yeti-specialty-aura"),
  "imperium.dreadnought": ranks("ctv-clear-mind", "imperium-marked-volley-all-attacks", "town-lizard-spell-draw", "ntv-return-fire"),
  "imperium.titan": ranks("town-ram-spell-draw", "ntv-arcane-plating", "imperium-titan-damage-fury", H({ health: 1 }, "ntv-deep-roots")),
};

/**
 * NEUTRAL-SIDE veteran tracks. A stack follows one of these instead of its
 * faction track when it fights on its printed Neutral side or is owned by the
 * Neutral guard player (resolved by `rankScheduleFor(id, "neutral")`). The
 * faction track of the same unit is untouched.
 *
 * Why a separate track: guards have no Runes, faction cubes, hand, Spell
 * casting or resources, so faction ranks built on those (Rune Bolt, Runes from
 * Pain, Rune-Tipped Strike, Runic Inspiration, card draws) did nothing for
 * them. Every reward below resolves automatically for the Neutral AI: passive
 * modifiers, automatic triggers, or a queued choice whose first pick the engine
 * takes for an unoperated guard (first adjacent enemy / first damaged ally /
 * return to origin). No Runes, cubes, cards, Spells or resources.
 *
 * Guards rank up to Elite (R3). R4 is only reachable by a player-owned
 * Neutral-side card (recruited Neutral, sandbox seat), so it still has to work.
 * Calibrated against the classic neutral.* tracks: a small R1, a themed R2 and a
 * signature R3; stat steps name their exact amounts (no fallback ladder).
 */
export const NEUTRAL_SIDE_VETERANCY_OVERRIDES: Record<string, RankSchedule> = {
  // Bulwark — frost-land wildlings.
  "bulwark.kobolds": ranks(S({ health: 1 }), "ntv-bone-wall", "town-kobold-armored-prey", "ntv-marsh-scavenger"),
  "bulwark.mountain_rams": ranks("ntv-stone-landing", S({ attack: 1, health: 1 }), "ntv-full-gallop", "town-champion-safe"),
  "bulwark.snow_elves": ranks(S({ initiative: 1 }), "ntv-first-volley", "veteran-arctic-slow-shot", "ignore-all-combat-penalties"),
  "bulwark.yetis": ranks(S({ attack: 1 }), "ntv-barbed-revenge", "wog-nightmare-fear", S({ health: 2 })),
  "bulwark.shamans": ranks("ntv-arcane-plating", "ntv-consecrated-shot", "ntv-mana-turbulence", "veteran-water-damper"),
  "bulwark.mammoths": ranks(S({ health: 1 }), "town-ram-trample", "ntv-crushing-claws", "town-mammoth-last-stand"),
  "bulwark.jotunns": ranks("veteran-flying-guard", "ntv-ageing-breath", "veteran-ice-bolt", S({ attack: 1, health: 1 })),

  // Factory — wild machines, desert beasts and outlaws.
  "factory.mechanics": ranks(S({ health: 1 }), "town-naga-pierce", "ntv-blood-tribute", "ntv-labyrinth-cleave"),
  "factory.armadillos": ranks("veteran-guarded-stance", S({ health: 1, initiative: 1 }), "ntv-hellish-endurance", "veteran-boar-brace"),
  "factory.automatons": ranks(S({ health: 1 }), "wog-fire-shield-1", "forge-vet-tank-death-burst", "commander-defense-token"),
  "factory.sandworms": ranks(S({ health: 1, initiative: 1 }), "veteran-magma-hunter", "ntv-putrid-grasp", "ntv-searing-passage"),
  "factory.gunslingers": ranks("ntv-predators-mark", "ntv-venom-arrow", "veteran-double-attack-low-roll", "veteran-sharpshooter-mastery"),
  "factory.couatls": ranks("ntv-raking-dive", "veteran-sprite-spell-block", "ntv-guardian-angel", "veteran-azure-mending-scales"),
  "factory.dreadnoughts": ranks("town-golem-cap", "ntv-set-the-spear", "veteran-magic-splash", "unlimited-retaliation"),

  // Forge — scavenged war-tech without a commander behind it.
  "forge.grunts": ranks(S({ health: 1 }), "ntv-suppressing-shot", "town-marksman-mark", "ignore-all-combat-penalties"),
  "forge.cyber_zombies": ranks(S({ health: 1 }), "zombie-resilience-weak", "ntv-potent-venom", "veteran-rebirth"),
  "forge.watchers": ranks(S({ initiative: 1 }), "ntv-disrupting-gaze", "ntv-petrifying-aim", "ntv-bewitching-bolt"),
  "forge.bruisers": ranks(S({ health: 1, initiative: 1 }), "ntv-marked-volley", "ntv-boulder-crash", "veteran-defense-pierce"),
  "forge.jump_troopers": ranks("ntv-disorienting-landing", S({ attack: 1, health: 1 }), "ntv-strike-and-return", "veteran-sprite-landing"),
  "forge.tanks": ranks("veteran-storm-guard", "veteran-distant-storm", "veteran-earth-defense-token", "veteran-fire-damage-cap"),
};
