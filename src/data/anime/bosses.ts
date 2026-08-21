/**
 * Raid Bosses & Dungeon floor bosses (anime-mod plan §6.5.2 / §6.7.3) — shared
 * by BOTH mod surfaces (`wog.raidBosses`/`anime.raidBosses`, `wog.dungeon`/
 * `anime.dungeon`).
 *
 * A boss is a bespoke-stat LAYERED monster, never a Neutral deck card: its
 * statline is per-LAYER and `layers` is the health-bar count. The engine mint
 * (`makeRaidBossCombatUnit`, src/engine/raid-bosses.ts) rides the army-stack
 * layer machinery (`armyStacks` = layers − 1; `markUnitRemovedIfNeeded` sheds
 * one full bar per lethal hit, carrying excess) and stamps `bankUnit`, so a
 * boss is GRADELESS in play: tier-gated spells/stares can't touch it, the
 * neutral AI ranks it by distance, and `applyUnitCurrentSide` keeps its minted
 * stats (the bank branch no-ops on the synthetic `boss.<id>` def id).
 *
 * CLAUDE.md §2: each `abilities` array is the complete, literal list of
 * engine-wired effects; `abilityText` restates exactly that and nothing more.
 * `src/engine/raid-bosses.test.ts` enforces every id resolves implemented.
 */

import { unitAbilities } from "@/data/units/abilities";
import type { UnitType } from "@/engine/state";

export type RaidBossDefinition = {
  id: string;
  name: string;
  /** Flavor subtitle shown under the name on the generated card face. */
  title: string;
  /** Per-layer statline (each layer is one full health bar of `health`). */
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  type: UnitType;
  /** Printed layer cap — total health bars at full strength (escalation cap). */
  layers: number;
  /** Complete, literal list of engine-wired ability ids (implemented only). */
  abilities: string[];
  /** Exactly what the wired abilities do — never more (CLAUDE.md §2). */
  abilityText: string;
  /** Escort minions accompanying the boss: N draws at a NEUTRAL_ARMY_TABLE row. */
  minionCount: number;
  minionLevel: number;
  /**
   * Themed escort (variant expansion §D1): the `minionCount` escort bodies are
   * built by cycling THESE unit def ids (seeded start index) instead of the
   * `drawPveThemedArmy` level draw. Absent = today's level draw, unchanged. An
   * id that does not resolve to a unit definition falls the WHOLE escort back
   * to the level draw (never an empty escort).
   */
  escortPool?: readonly string[];
  cardImage: string;
  summary: string;
};

const art = (slug: string) => `/assets/bosses/${slug}.webp`;

/**
 * The printed ability text of a boss/warden, built from the WIRED abilities'
 * own `unitAbilities` texts (the `customBossToDefinition` precedent). Derived,
 * so a card can never advertise something the engine does not run
 * (CLAUDE.md §2) — used by every definition added by the variant expansion.
 */
const abilityTextFor = (ids: readonly string[]): string =>
  ids
    .map((id) => unitAbilities[id]?.text)
    .filter(Boolean)
    .join(" ");

/** The five §6.5 world bosses, keyed by id. */
export const RAID_BOSSES: Record<string, RaidBossDefinition> = {
  goblin_king: {
    id: "goblin_king",
    name: "Goblin King",
    title: "Tyrant of the Warrens",
    attack: 4,
    defense: 1,
    health: 3,
    initiative: 6,
    type: "ground",
    layers: 3,
    abilities: ["ignores-retaliation", "boss-enrage"],
    abilityText:
      "[unit_attack] Ignore the Retaliation Attack. While this boss is on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 3,
    minionLevel: 2,
    cardImage: art("goblin_king"),
    summary: "3 layers; strikes without retaliation and enrages on its last bar."
  },
  colossal_titan: {
    id: "colossal_titan",
    name: "Colossal Titan",
    title: "The Walking Calamity",
    attack: 6,
    defense: 2,
    health: 3,
    initiative: 3,
    type: "ground",
    layers: 5,
    abilities: ["boss-devour", "zombie-resilience"],
    abilityText:
      'After its own attack against a BRONZE unit, roll 1 Attack die; on a "+1" the target side is removed outright (Devour). When attacked, roll an Attack die; on a "+1" the damage is reduced by 1 (Resilience).',
    minionCount: 2,
    minionLevel: 2,
    cardImage: art("colossal_titan"),
    summary: "5 layers, slow; devours bronze units whole and shrugs off chip damage."
  },
  abyss_kraken: {
    id: "abyss_kraken",
    name: "Abyss Kraken",
    title: "Terror of the Deep",
    attack: 5,
    defense: 1,
    health: 3,
    initiative: 7,
    type: "ground",
    layers: 4,
    abilities: ["magic-elemental-attack-all-enemies", "unlimited-retaliation"],
    abilityText:
      "[unit_attack] After the attack, a full separate attack at this unit's Attack strikes EVERY other adjacent enemy unit. May retaliate more than once in a combat round.",
    minionCount: 3,
    minionLevel: 3,
    cardImage: art("abyss_kraken"),
    summary: "4 layers; its tentacles lash every adjacent enemy and never stop retaliating."
  },
  calamity_dragon: {
    id: "calamity_dragon",
    name: "Calamity Dragon",
    title: "Herald of the Rift",
    attack: 6,
    defense: 2,
    health: 3,
    initiative: 9,
    type: "flying",
    layers: 6,
    abilities: ["dragon-line-attack-3", "ignores-retaliation"],
    abilityText:
      "[unit_attack] Attack 2 spaces in a line: after the attack, a full separate attack at attack 3 strikes the unit directly behind the target. Ignore the Retaliation Attack.",
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("calamity_dragon"),
    summary: "6 layers, flying; line breath and untouchable strikes."
  },
  avatar_of_erebos: {
    id: "avatar_of_erebos",
    name: "Avatar of Erebos",
    title: "The God That Walks",
    // BALANCE (2026-08-21, the PvE ENEMY FORCE hand): Attack 7 -> 6. It is the
    // roster apex AND the roster's fastest monster (Initiative 8), so with a card
    // hand it acts first every round AND gets the most card plays of any
    // encounter (7 layers = the longest fight). It fell from 5/5 to 0/5 against
    // its matched force in pve-boss-balance.test.ts — the only monster the hand
    // pushed out of band. Attack was the lever because `layers: 7` is its printed
    // identity ("The God That Walks") and Enrage already adds +2 on the last bar.
    attack: 6,
    defense: 2,
    health: 3,
    initiative: 8,
    type: "ground",
    layers: 7,
    abilities: ["boss-fear", "boss-enrage"],
    abilityText:
      "While this unit lives, the enemy cannot USE morale (token or Positive Morale cards — reroll, set-die, redraw, combat bonus, token removal; gains and draws still happen). While on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("avatar_of_erebos"),
    summary: "7 layers; its Fear locks your morale away, and it enrages at the end."
  },
  cyberdemon_prime: {
    id: "cyberdemon_prime",
    name: "Cyberdemon Prime",
    title: "Siege Lord of Hell",
    attack: 7,
    defense: 2,
    health: 4,
    initiative: 6,
    type: "ground",
    layers: 6,
    abilities: ["dragon-line-attack-3", "boss-enrage"],
    abilityText:
      "[unit_attack] Rocket barrage strikes the target and the unit directly behind it at Attack 3. While this boss is on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("cyberdemon_prime"),
    summary: "6 layers; a rocket barrage tears through lines before its final enrage."
  },
  spider_overmind: {
    id: "spider_overmind",
    name: "Spider Overmind",
    title: "Architect of the Invasion",
    attack: 6,
    // BALANCE (2026-08-21, `pve-boss-balance.test.ts`): Defense 3 → 2. This was
    // the roster's ONE out-of-band monster — 0/5 against the gold reference army
    // while its equally-weighted peers (calamity_dragon, archvile_ascendant) were
    // 5/5 — because Defense 3 stacked on top of a 5-layer body, `zombie-
    // resilience` (another +1 Defense on most dice) AND splash that punishes the
    // crowding its own gradeless targeting invites. Defense 2 is what every other
    // Doom raid boss prints; nothing about the kit changed.
    defense: 2,
    health: 3,
    initiative: 7,
    type: "ranged",
    layers: 5,
    abilities: ["magic-elemental-attack-all-enemies", "zombie-resilience"],
    abilityText:
      '[unit_attack] After its attack, this unit makes a full separate attack against every other adjacent enemy; those follow-ups do not retaliate or chain. If the attacker resolves a "0" or "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("spider_overmind"),
    summary: "5 layers; suppressing fire lashes the whole formation while armor absorbs hits."
  },

  // ——— Variant expansion §B: six more world bosses ————————————————————————
  // Every ability below is an EXISTING implemented arm; `abilityText` is derived
  // from those arms' own printed texts, so nothing decorative can ship here.
  //
  // 2026-08-21: the four `boss-spell-*` round-start caster ROTATIONS these
  // bosses were built around are DELETED (user rejection — see version.ts v50).
  // The ex-casters (lich_archon, wailing_banshee, archvile_ascendant, plus the
  // wardens warden_stone_choir / doom_archvile_warden) carry ordinary wired arms
  // instead, one UNIQUE combination per monster in the whole roster (pinned by
  // the roster-uniqueness test in raid-bosses.test.ts). Each also recovers the
  // "−1 Attack for a rotation" tax §B charged them, where the balance harness
  // (src/engine/pve-boss-balance.test.ts) showed the swap left them under-tier.
  lich_archon: {
    id: "lich_archon",
    name: "Lich Archon",
    title: "Tongue of the Cold Grave",
    // BALANCE (2026-08-21): 4 → 5 Attack. §B taxed a caster −1 Attack for its
    // rotation; with the rotation gone the tax is refunded, and the harness had
    // it as the softest 5-layer boss in the classic pool at Attack 4.
    attack: 5,
    defense: 2,
    health: 3,
    initiative: 6,
    type: "ground",
    layers: 5,
    // Attrition undeath instead of a spell list: it strips a card off your hand
    // every time it comes up, and knits its current bar back together.
    // (`wraith-heal-2` heals DAMAGE only — a shed health BAR never returns.)
    abilities: ["wraith-enemy-discard", "wraith-heal-2"],
    abilityText: abilityTextFor(["wraith-enemy-discard", "wraith-heal-2"]),
    minionCount: 3,
    minionLevel: 3,
    escortPool: [
      "neutral.skeletons",
      "neutral.zombies",
      "neutral.wraiths",
      "neutral.mummies",
      "neutral.liches"
    ],
    cardImage: art("lich_archon"),
    summary:
      "5 layers of attrition: every time it activates it tears a card out of your hand and heals 2 damage off its current bar. Its escort is always undead."
  },
  hydra_matriarch: {
    id: "hydra_matriarch",
    name: "Hydra Matriarch",
    title: "Nine Jaws of the Fen",
    attack: 5,
    defense: 2,
    health: 4,
    initiative: 3,
    type: "ground",
    layers: 4,
    abilities: ["hydra-multi-attack", "boss-enrage"],
    abilityText: abilityTextFor(["hydra-multi-attack", "boss-enrage"]),
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("hydra_matriarch"),
    summary:
      "4 layers, very slow (Initiative 3); each attack also mauls a second adjacent unit, and its last bar enrages."
  },
  basilisk_queen: {
    id: "basilisk_queen",
    name: "Basilisk Queen",
    title: "Gaze of the Stone Garden",
    attack: 5,
    defense: 3,
    health: 3,
    initiative: 5,
    type: "ground",
    layers: 4,
    abilities: ["azure-dragon-paralysis", "manticore-ignore-defense"],
    abilityText: abilityTextFor(["azure-dragon-paralysis", "manticore-ignore-defense"]),
    minionCount: 3,
    minionLevel: 3,
    escortPool: ["neutral.lizardmen", "neutral.basilisks", "neutral.medusas", "neutral.gorgons"],
    cardImage: art("basilisk_queen"),
    summary:
      "4 layers; its strikes ignore printed Defense entirely and a \"-1\" petrifies the target. Its escort is always reptilian."
  },
  wailing_banshee: {
    id: "wailing_banshee",
    name: "Wailing Banshee",
    title: "Chorus of the Unmourned",
    // BALANCE (2026-08-21): 4 → 5 Attack, the refunded caster tax (see the
    // block comment above); its Defense stays 1, so it is still the glass
    // cannon of the classic pool.
    attack: 5,
    defense: 1,
    health: 3,
    initiative: 9,
    type: "flying",
    layers: 4,
    // The wail is TERROR now, not a round-start cast: its activation eats your
    // positive morale token, and anything that swings at it strikes afraid.
    // (Deliberately NOT `bank-wraith-attack-discard`, the obvious "the wail
    // takes a card" arm: that one parks combat on a COMBAT_HAND_DISCARD choice
    // the attacked player owns — a window on the boss's own turn. The two arms
    // below open nothing.)
    abilities: ["ghost-dragon-morale-drain", "wog-nightmare-fear"],
    abilityText: abilityTextFor(["ghost-dragon-morale-drain", "wog-nightmare-fear"]),
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("wailing_banshee"),
    summary:
      "4 fragile layers, fastest thing in the lair: its activation burns your positive morale token, and every unit that attacks it rolls 2 Attack dice and takes the LOWER — kill it quickly."
  },
  archvile_ascendant: {
    id: "archvile_ascendant",
    name: "Archvile Ascendant",
    title: "Choir of the Furnace",
    attack: 5,
    defense: 2,
    health: 4,
    initiative: 7,
    type: "ground",
    layers: 5,
    // Fire that spreads by CONTACT instead of by chant: its blow washes over
    // every other enemy touching it and leaves a Fire Wall burning the space it
    // struck. (Attack stays 5 — the harness had the pair carrying its tier
    // already, so the caster tax is NOT refunded here.)
    abilities: ["magic-elemental-attack-all-enemies", "wog-hell-steed-fire-wall"],
    abilityText: abilityTextFor(["magic-elemental-attack-all-enemies", "wog-hell-steed-fire-wall"]),
    minionCount: 3,
    minionLevel: 4,
    escortPool: ["doom.demon", "doom.cacodemon", "doom.hell_knight", "doom.baron_of_hell"],
    cardImage: art("archvile_ascendant"),
    summary:
      "5 layers of spreading fire: its attack washes over every other enemy adjacent to it and leaves a Fire Wall on the space it struck. Its escort is always Hell's own."
  },
  mother_demon: {
    id: "mother_demon",
    name: "Mother Demon",
    title: "She Who Spawns",
    attack: 6,
    defense: 2,
    health: 3,
    initiative: 5,
    type: "ground",
    // BALANCE GUARD (§B6): the plan's 6 layers were conditional on the summon
    // arm capping the summoned population. `SUMMON_UNIT_ON_ATTACK`
    // (reducer.ts summonUnitOnAttack) has NO population cap — it is bounded
    // only by empty battlefield spaces — so this ships at the plan's stated
    // fallback of 5 layers.
    layers: 5,
    abilities: ["doom-pain-elemental-summon-lost-soul", "boss-devour"],
    abilityText: abilityTextFor(["doom-pain-elemental-summon-lost-soul", "boss-devour"]),
    minionCount: 2,
    minionLevel: 3,
    escortPool: ["doom.imp", "doom.lost_soul", "doom.former_human"],
    cardImage: art("mother_demon"),
    summary:
      "5 layers of attrition: every attack spawns another Lost Soul and may devour a bronze unit whole. Its printed escort starts small because it grows."
  }
};

/** The two §6.7.3 Dungeon floor bosses (floors 5 and 10) — 2-layer minibosses. */
export const DUNGEON_FLOOR_BOSSES: Record<string, RaidBossDefinition> = {
  minotaur_of_the_depths: {
    id: "minotaur_of_the_depths",
    name: "Minotaur of the Depths",
    title: "Warden of Floor 5",
    attack: 5,
    defense: 1,
    health: 3,
    initiative: 7,
    type: "ground",
    layers: 2,
    // UNIQUENESS (2026-08-21): this used to be the exact pair the Goblin King
    // carries (`ignores-retaliation` + `boss-enrage`) — two monsters with an
    // identical kit. The warden keeps the riposte-proof axe and trades Enrage
    // for the great axe's armour-piercing, so no two monsters in the roster
    // share a kit (pinned by the roster-uniqueness test).
    abilities: ["ignores-retaliation", "manticore-ignore-defense"],
    abilityText: abilityTextFor(["ignores-retaliation", "manticore-ignore-defense"]),
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("minotaur_of_the_depths"),
    summary:
      "The floor-5 warden: 2 layers, riposte-proof, and its great axe ignores the Defense printed on your card."
  },
  floor_wyrm: {
    id: "floor_wyrm",
    name: "The Floor Wyrm",
    title: "Warden of Floor 10",
    attack: 5,
    defense: 2,
    health: 4,
    initiative: 5,
    type: "ground",
    layers: 2,
    abilities: ["boss-devour", "unlimited-retaliation"],
    abilityText:
      'After its own attack against a BRONZE unit, roll 1 Attack die; on a "+1" the target side is removed outright (Devour). May retaliate more than once in a combat round.',
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("floor_wyrm"),
    summary: "The floor-10 warden: 2 thick layers, devours bronze units, always retaliates."
  },
  doom_baron_warden: {
    id: "doom_baron_warden",
    name: "Baron Warden",
    title: "Keeper of Infernal Floor 5",
    attack: 5,
    defense: 2,
    health: 3,
    initiative: 6,
    type: "ground",
    layers: 2,
    abilities: ["nix-damage-cap", "boss-enrage"],
    abilityText:
      "This unit cannot take more than 4 damage from a single attack (Spell and ability damage are not capped). While on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("doom_baron_warden"),
    summary: "The Doom floor-5 warden: two armored layers and a vicious final phase."
  },
  doom_cyberdemon_tyrant: {
    id: "doom_cyberdemon_tyrant",
    name: "Cyberdemon Tyrant",
    title: "Keeper of Infernal Floor 10",
    attack: 6,
    defense: 2,
    health: 4,
    initiative: 7,
    type: "ground",
    layers: 3,
    // UNIQUENESS (2026-08-21): this used to be the exact pair the Calamity
    // Dragon carries. The tyrant now takes retaliation like anything else and
    // pays for it with an armoured chassis instead.
    abilities: ["dragon-line-attack-3", "nix-damage-cap"],
    abilityText: abilityTextFor(["dragon-line-attack-3", "nix-damage-cap"]),
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("doom_cyberdemon_tyrant"),
    summary:
      "The Doom floor-10 tyrant: three layers, line-breaking rockets, and no single attack takes more than 4 off its armoured chassis."
  },

  // ——— Variant expansion §C2: warden variety for the seeded floor pools ————
  // HARD CAP (see §0 of the design and WAVE_MINIBOSS_POOLS): every warden keeps
  // `layers <= 3` and `minionCount <= 3`, because the Calamity-Wave mini-boss
  // pool draws from THIS catalog — a fatter warden silently inflates wave 4+.
  warden_gorgon_matron: {
    id: "warden_gorgon_matron",
    name: "Gorgon Matron",
    title: "Warden of Floor 5",
    attack: 5,
    defense: 2,
    health: 3,
    initiative: 5,
    type: "ground",
    layers: 2,
    abilities: ["gorgon-death-stare", "veteran-guarded-stance"],
    abilityText: abilityTextFor(["gorgon-death-stare", "veteran-guarded-stance"]),
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("warden_gorgon_matron"),
    summary:
      "A floor-5 warden: 2 layers, +1 Defense against every incoming attack, and a double \"-1\" after its attack kills outright."
  },
  warden_stone_choir: {
    id: "warden_stone_choir",
    name: "The Stone Choir",
    title: "Warden of Floor 5",
    attack: 4,
    defense: 3,
    health: 4,
    initiative: 4,
    type: "ground",
    layers: 2,
    // Petrifaction, not a chant: a "-1" on its own Attack die turns the target
    // to stone (it skips its next activation), and its own stone body caps any
    // single attack at 4. Attack stays 4 — the harness put the pair inside the
    // floor-5 warden band without a refund.
    abilities: ["azure-dragon-paralysis", "doom-baron-damage-cap"],
    abilityText: abilityTextFor(["azure-dragon-paralysis", "doom-baron-damage-cap"]),
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("warden_stone_choir"),
    summary:
      "2 stone layers, low Attack: a \"-1\" on its Attack die petrifies the target (it skips its next activation), and no single attack takes more than 4 off it."
  },
  warden_bone_colossus: {
    id: "warden_bone_colossus",
    name: "Bone Colossus",
    title: "Warden of Floor 10",
    attack: 6,
    defense: 2,
    health: 4,
    initiative: 4,
    type: "ground",
    layers: 3,
    abilities: ["behemoth-defense-crush-few", "automaton-detonate"],
    abilityText: abilityTextFor(["behemoth-defense-crush-few", "automaton-detonate"]),
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("warden_bone_colossus"),
    summary:
      "A floor-10 warden: 3 layers, its blows shave 1 Defense off the target, and its final death blasts 2 damage into everything adjacent — do not crowd it."
  },
  doom_hell_knight_warden: {
    id: "doom_hell_knight_warden",
    name: "Hell Knight Warden",
    title: "Keeper of Infernal Floor 5",
    attack: 6,
    defense: 1,
    health: 3,
    initiative: 7,
    type: "ground",
    layers: 2,
    abilities: ["ignores-retaliation", "commander-charge"],
    abilityText: abilityTextFor(["ignores-retaliation", "commander-charge"]),
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("doom_hell_knight_warden"),
    summary:
      "A Doom floor-5 warden: 2 thin layers, fast, never retaliated against, and +1 Attack whenever it charges in after moving."
  },
  doom_archvile_warden: {
    id: "doom_archvile_warden",
    name: "Archvile Warden",
    title: "Keeper of Infernal Floor 10",
    attack: 5,
    defense: 2,
    health: 4,
    initiative: 6,
    type: "ground",
    layers: 3,
    // Fire both ways: it leaves a Fire Wall on every space it strikes and burns
    // anything that melees it. Same two fire arms as its raid-tier cousin
    // archvile_ascendant carries one of, but a DIFFERENT pair (roster
    // uniqueness) — the warden burns back, the raid boss splashes sideways.
    abilities: ["wog-hell-steed-fire-wall", "wog-fire-shield-1"],
    abilityText: abilityTextFor(["wog-hell-steed-fire-wall", "wog-fire-shield-1"]),
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("doom_archvile_warden"),
    summary:
      "3 layers wreathed in flame: every space it strikes catches a Fire Wall, and every adjacent attacker takes 1 damage back."
  }
};

/**
 * The curated ability whitelist a DESIGNER custom boss may draw from (map
 * preset `raidBosses.bosses[].abilities`): self-contained, implemented combat
 * abilities only — nothing that reads a deck, faction cubes or player state.
 * `sanitizeCustomMapPreset` filters against this list; a data test asserts
 * every id resolves to an implemented `unitAbilities` entry.
 */
export const RAID_BOSS_ABILITY_CHOICES: readonly string[] = [
  "boss-enrage",
  "boss-devour",
  "boss-fear",
  "ignores-retaliation",
  "unlimited-retaliation",
  "zombie-resilience",
  "dragon-line-attack-3",
  "magic-elemental-attack-all-enemies",
  "teleport-move",
  "nix-damage-cap",
  "commander-defense-token",
  "attack-roll-advantage-passive",
  // 2026-08-21: the four `boss-spell-*` rotations were REMOVED from this list
  // with the mechanic. A saved designer preset still naming one is sanitized
  // away by `sanitizeCustomMapPreset` (it filters against THIS list) — pinned in
  // boss-abilities.test.ts. In their place, the arms the ex-caster monsters now
  // use: each is self-contained (reads only the combat's units, and for the two
  // hand-drain the fighter's hand at RANDOM), opens no window and no reaction.
  //
  // NOT listed on purpose — each of these IS carried by a shipped monster but
  // opens a pendingChoice, which a designer's boss must never do:
  // `bank-wraith-attack-discard` (COMBAT_HAND_DISCARD owned by the attacked
  // player) and `hydra-multi-attack` (a `second-attack` ABILITY_TARGET_CHOICE
  // that `isNeutralSplashVictimChoice` re-stamps onto the human fighter).
  "wraith-enemy-discard",
  "wraith-heal-2",
  "ghost-dragon-morale-drain",
  "wog-nightmare-fear",
  "azure-dragon-paralysis",
  "manticore-ignore-defense",
  "wog-fire-shield-1",
  "wog-hell-steed-fire-wall",
  "doom-baron-damage-cap",
  "veteran-guarded-stance"
];

/** Every shipped boss (raid + dungeon floors), for data tests and art builds. */
export function listAllBossDefinitions(): RaidBossDefinition[] {
  return [...Object.values(RAID_BOSSES), ...Object.values(DUNGEON_FLOOR_BOSSES)];
}
