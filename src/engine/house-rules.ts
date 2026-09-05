import { animeModuleEnabled } from "./anime";
import type { TownBuildingDefinition } from "@/data/factions/types";
import type {
  GameRuleset,
  GameState,
  GameSetupOptions,
  HouseRuleId,
  ResourceCost,
} from "./state";

/**
 * Individual house-rule toggles (BINH). Historically the BINH tweaks were an
 * all-or-nothing bundle switched by `ruleset: "binh" | "legacy"`. This registry
 * lifts each tweak into its OWN on/off flag so a table can mix-and-match:
 * keep the split decks but drop the Estates nerf, for example.
 *
 * Legacy is a SOFT preset: clicking it turns every house rule off (and clears
 * overrides), but does NOT lock the toggles — a player may re-enable any rule
 * afterwards. Explicit per-rule flags always win over the mode default, in
 * both BINH and Legacy.
 *
 * The resolved booleans are frozen onto `adventure.houseRules` at setup so the
 * engine reads plain booleans during play; `houseRuleEnabled` falls back to the
 * mode default for snapshots / the combat sandbox (no adventure state).
 *
 * IMPORTANT (CLAUDE.md #1): every id in this registry gates REAL engine
 * behaviour with a covering test that fails if the gate is removed. A toggle
 * that changes nothing is a decorative stub and must not live here — declare it
 * only once its wiring exists.
 */
export type { HouseRuleId };

export type HouseRuleCategory =
  | "decks"
  | "units"
  | "abilities"
  | "combat"
  | "global"
  | "polish"
  | "community";

export type HouseRuleDef = {
  id: HouseRuleId;
  label: string;
  description: string;
  category: HouseRuleCategory;
  /** Default when the rule has no explicit flag and the mode is "binh". */
  default: boolean;
  /** Default when the mode is "legacy" (all house rules off unless set). */
  legacyDefault?: boolean;
  /**
   * Optional external reference for a rule whose full detail is too large to
   * inline in `description` (the balance packs' card-by-card spreadsheets). The
   * lobby renders it as a "Full card list ↗" link beside the toggle so the
   * concise description stays scannable.
   */
  infoUrl?: string;
};

export const HOUSE_RULES: HouseRuleDef[] = [
  {
    id: "settlement-foreign-recruitment",
    label: "Settlements: recruit from another town",
    description: "Each captured Settlement rolls a fixed random town other than its first owner's faction. While you control it, recruit every unit tier from that town at normal cost, without extra dwellings. Reinforcing still needs a Citadel. Disabled Anime/Wuxia towns are excluded.",
    category: "units",
    default: false,
    legacyDefault: false,
  },
  {
    id: "settlement-neutral-recruitment",
    label: "Settlements: faction Neutral Units",
    description:
      "Each Settlement belongs to the faction printed on its map field. While you control it, you may buy only that faction's corresponding single-sided Neutral Unit cards at their printed Neutral cost; you do not gain access to the faction's normal Few/Pack roster. These recruits cannot be reinforced. Takes precedence over \"Settlements: recruit from another town\" when both are on.",
    category: "units",
    default: false,
    legacyDefault: false,
  },
  {
    id: "duplicate-unit-recruitment",
    label: "Allow buying the same unit",
    description: "Buy additional Few copies of a unit you already own. Each copy has its own army slot, upgrades, experience and battle casualties, at normal costs. The recruit button remains available after a copy dies. Normal battle capacity and faction restrictions still apply.",
    category: "units",
    default: false,
    legacyDefault: false,
  },
  {
    id: "side-buildings-materials-only",
    label: "Side buildings: materials only",
    description:
      "Optional BINH rule: each town's side buildings cost only building materials. Ignore their printed gold cost and convert each printed valuable into 1 additional building material. City Hall, Citadel, Dwellings and Mage Guild are unchanged.",
    category: "combat",
    // Explicit opt-in so existing BINH and Legacy games retain printed costs.
    default: false,
    legacyDefault: false,
  },
  {
    id: "split-decks",
    label: "Split Spell/Artifact decks by tier",
    description:
      "On: Basic/Expert Spell decks and Minor/Major/Relic Artifact decks with level and map gating. Off: one combined Spell deck and one combined Artifact deck; Spells and Artifacts always remain separate families.",
    category: "decks",
    default: true,
  },
  {
    id: "mystical-garden-gold",
    label: "Mystical Garden: 3 gold",
    description:
      "BINH house rule: the Mystical Garden's gold option grants 3 gold. Off: it grants the printed 2 gold (the 1-valuables option is unchanged).",
    // A BINH default (ON in binh, OFF in legacy), so it lives in the BINH
    // "Combat & map rules" panel rather than the opt-in Global map rules panel.
    category: "combat",
    default: true,
    legacyDefault: false,
  },
  {
    id: "torso-of-legion-major",
    label: "Torso of Legion plays as Major",
    description:
      "BINH house rule: Torso of Legion (printed Minor) is sorted and priced as a Major artifact. Untick to sort it as its printed Minor tier — Minor deck, Minor prices, takeable at any level.",
    category: "decks",
    // ON in BOTH modes: the re-tier predates this toggle, so every existing binh
    // AND legacy game already treats Torso as Major. Defaulting it OFF in Legacy
    // would silently change those games (Minor prices), so it stays ON there too.
    default: true,
    legacyDefault: true,
  },
  {
    id: "eversmoking-ring-of-sulfur-major",
    label: "Eversmoking Ring of Sulfur plays as Major",
    description:
      "BINH house rule: Eversmoking Ring of Sulfur (printed Minor) is sorted and priced as a Major artifact. Untick to use its printed Minor tier.",
    category: "decks",
    default: true,
    legacyDefault: false,
  },
  {
    id: "griffin-buff",
    label: "Griffin buff",
    description:
      "Few Griffins fight at 3 Attack (printed 2) and Pack Griffins at 1 Defense (printed 0).",
    category: "units",
    default: true,
  },
  {
    id: "marksman-buff",
    label: "Marksman buff",
    description: "Pack Marksmen fight with 3 Health (printed 2).",
    category: "units",
    default: true,
  },
  {
    id: "arch-devil-pack-damage-6",
    label: "Arch Devils Pack: 6 damage",
    description:
      "BINH house rule: the Pack of Arch Devils fights with 6 Attack instead of the printed 7. The Few and Neutral Arch Devils are unchanged.",
    category: "units",
    default: true,
    legacyDefault: false,
  },
  {
    id: "sandro-skeleton-hp",
    label: "Sandro skeleton Health",
    description:
      "Sandro's Horde and Legion of Skeletons fight with 3 Health instead of the printed 2.",
    category: "units",
    default: true,
  },
  {
    id: "wisdom-expert-discount",
    label: "Wisdom expert discount",
    description:
      "Expert Wisdom reduces a Mage Guild spell purchase by 3 gold (printed 2). Basic stays −2.",
    category: "abilities",
    default: true,
  },
  {
    id: "estates-nerf",
    label: "Estates nerf",
    description:
      "Estates gains 2 gold (basic) / 4 gold (expert) instead of the printed 3 / 6.",
    category: "abilities",
    default: true,
  },
  {
    id: "immediate-reinforcement-prompts",
    label: "Old Legion / reinforcement behavior",
    description:
      "On: the old readings — only the LARGEST Legion piece counts on a unit, a half-cost reinforcement COMPETES with the flat discounts (bigger wins) instead of applying first, Necromancy opens its blocking pick-and-pay prompt at once (and is kept unless it really upgrades a unit), and unused Legion vouchers expire at the start of your next turn rather than when a hero moves. Off (new default): distinct Legion pieces stack, the initiating discount applies first, Necromancy banks an adjustable offer you redeem from the army panel, and those banks expire only when one of your heroes moves a step. THREE things do NOT revert with this toggle: the HILL FORT always opens its own pick-and-pay window (choose which bronze/silver Few card to reinforce at −3 gold, or skip — it never banks), it prices through the shared discount path (so a Legion voucher reserved for that unit applies there too), and a half-ALL source still halves the non-gold resources even when a flat discount wins the gold. The map Spell-Power bank is not covered by this toggle at all — it always clears on movement only.",
    category: "abilities",
    default: false,
    legacyDefault: false,
  },
  {
    id: "gelu-sharpshooter-buff",
    label: "Gelu IV Sharpshooter buff",
    description:
      "A Sharpshooters recruited via Gelu's level-IV specialty permanently carries +1 Attack in every combat.",
    category: "abilities",
    default: true,
  },
  {
    id: "initiative-specialty-draw",
    // The card text labels the draw side "House rule: …" so a Legacy /
    // Tournament table (rule OFF) is not promised an option it cannot use.
    label: "Initiative specialties: draw alternative",
    description:
      "Initiative-only specialty cards, including Gelu VI, may be discarded to draw 1 card instead of granting their combat Initiative bonus. Off: only the printed Initiative buff — the cards have no draw alternative.",
    category: "abilities",
    default: true,
    legacyDefault: false,
  },
  {
    id: "dracon-few-magi-trade",
    label: "Dracon IV Few-of-Magi trade",
    description:
      "Dracon's Enchanters IV may also upgrade a Few of Magi into the Enchanters for 6 extra gold. Off: only the rulebook options remain — trade a Pack of Magi (free), or draw a card.",
    category: "abilities",
    default: true,
  },
  {
    id: "combat-move-initiative",
    label: "Initiative buffs grant combat move",
    description:
      "Haste, Slow and the initiative-only hero specialties also shift a unit's Combat movement by ±1 (the Battlefield-Expansion rule). Off: they change only Initiative, not movement (the standard/wiki rule).",
    category: "combat",
    default: true,
  },
  {
    id: "far-tile-rerolls",
    label: "Ⅱ–Ⅲ tile Ore / Settlement rerolls",
    description:
      "On (BINH house rule): an Ore-Mine Ⅱ–Ⅲ tile may be rerolled once, and your second Ⅱ–Ⅲ opening may reroll toward your first Settlement. Off (official): the tile you reveal is final even when it has Ore or no Settlement; its identity cannot be changed.",
    category: "combat",
    default: true,
    legacyDefault: false,
  },
  {
    id: "ballistics-buff",
    label: "Ballistics buff",
    description:
      "Ballistics can level the Arrow Tower on its basic side and adds an Expert bombard (pay 1 building material: 1 damage to a unit and an adjacent enemy). Off: levelling the Arrow Tower is the Expert side and there is no bombard (wiki). IGNORED while the Balance Pack rule is on — the reprinted Ballistics plays its own two sides instead, and neither the Arrow-Tower demolition nor this bombard is offered.",
    category: "combat",
    default: true,
  },
  {
    id: "pathfinding-expert",
    label: "Pathfinding expert crossing",
    description:
      "On: the BASIC Pathfinding side already crosses yellow borders & blocked fields, and its Expert side additionally crosses the coastline (land↔sea) with no halt and steps between the Surface and Subterranean without a Gate. Off (printed card): Basic only moves through Neutral & enemy Hero fields, and the Expert side (spend a crown) adds crossing yellow borders & blocked fields — no coastline or Subterranean crossing either way. IGNORED while the Balance Pack rule is on: the reprinted Pathfinding has ONE movement side (its Expert: borders + blocked fields, pass-through, and no sea halt — but never the Surface↔Subterranean step) and its basic side is a free extra round of a neutral combat instead.",
    category: "combat",
    default: true,
  },
  {
    id: "vision-battle-swap",
    label: "Visions pre-battle guard swap",
    description:
      "Holding Visions lets the attacker cast it before a Neutral fight to swap out the drawn guards. Off: Visions is only the map-turn deck scry (wiki).",
    category: "combat",
    default: true,
  },
  {
    id: "bank-empower-ability",
    label: "Creature-bank Ability Empower token",
    description:
      "Winning the Dragon Fly Hive or Griffin Conservatory also grants a stackable Ability Empower token; spend one anytime to Empower one Ability in hand — Expert then costs no crown. Off: those banks grant only the unit (wiki).",
    category: "combat",
    default: true,
  },
  {
    id: "bank-move-points",
    label: "Creature banks cost move points",
    description:
      "A Creature-Bank fight obeys the one-Round time limit and the spend-1-move-point-to-extend rule, like a normal neutral fight. Off: a bank has no Round limit and rolls straight on (rulebook).",
    category: "combat",
    default: true,
  },
  {
    id: "bank-stack-chance-80",
    label: "Creature-bank Stack chance: 80%",
    description:
      "On (BINH house rule): each Stack Token allowed by difficulty has an 80% chance to be placed. Off (official, default): every Stack Token is placed, so Creature Banks always have exactly Easy 1 / Normal 2 / Hard 3 / Impossible 4 Stacked defenders.",
    category: "combat",
    default: false,
    legacyDefault: false,
  },
  {
    id: "defeat-gold-debt",
    label: "Defeat can push gold into debt",
    description:
      "The 5-gold penalty for losing a hero combat is paid in full even if it drops the loser below zero (into debt). Off: the loss is capped so gold never goes negative (the normal rule).",
    category: "combat",
    default: true,
  },
  {
    id: "obelisk-rewards",
    label: "Obelisk die rewards",
    description:
      "House rule: the first visitor to an Obelisk locks an Attack-die face (−1: +1 morale, 0: Search (2) Artifact, +1: Treasure + Resource dice); later visitors get the same reward without re-rolling. Off: Obelisks stay multi-flaggable but grant no die reward. Holy Grail still counts visits toward dig unlock either way.",
    category: "combat",
    default: true,
  },
  {
    id: "polish-spell-book",
    label: "Polish Spell Book",
    description:
      "Polish house rule: Spells live in a refreshed/used Spell Book and are cast with generic Cast-a-Spell cards. Each physical Spell may be refreshed only once per round, across every refresh card or ability. Uses one merged Spell deck and the strengthened Mage Guild. Mutually exclusive with the standard stash-style Spell Book.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-creature-banks",
    label: "Polish Creature Bank cards",
    description:
      "Polish content rule: replace the official bank roster/cards with the 20-bank Polish set, exact guardians, abilities and printed rewards. Independent from the I–IV reveal-and-size procedure. Black Tower automatically enables split Artifact piles for its fixed Minor/Major reward.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-bank-sizes",
    label: "Creature Bank sizes (I–IV)",
    description:
      "Polish procedure rule: reveal up to two Banks, roll size I–IV, then choose one. The rolled size fixes the number of Stack Tokens and supplies the size value used by the active bank card set. Independent from the Polish Creature Bank cards toggle; requires Creature Banks.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-unit-stacks",
    label: "Purchasable Unit Stacks",
    description:
      "Polish house rule: at a Citadel, Pack Groups and recruited Neutrals may buy Stack layers (bronze max 3 / silver 2 / gold 1). Cost = that side’s gold + tier, plus the side's printed valuables (the Few→Pack fee). Stacked units gain +1 Attack; each layer absorbs one full health bar.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-reduced-starting-bonus",
    label: "Reduced starting bonus",
    description:
      "Polish house rule: instead of the difficulty-scaled starting bonus, choose draw 2 Minor Artifacts and keep 1 (no discard-top) OR roll for resources — a random Resource die, rerolling any high value (never 6 gold / 4 building materials / 2 valuables). Impossible still has no bonus.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-rule-111",
    label: "Rule 111 (home bronze swap)",
    description:
      "Polish house rule: once per game, when you fight a difficulty-I combat on your own starting tile, you may replace one bronze guard with the next random bronze unit from the Neutral deck.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-reduced-surrender",
    label: "Reduced surrender cost",
    description:
      "Polish house rule: surrender costs 10 gold, −3 after each combat round (min 1). Available during the fight, not only in prep. Attacker still earns 1 VP for a surrender.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-random-artifacts",
    label: "Random Artifacts",
    description:
      'Polish house rule (requires split Artifact decks): when gaining an Artifact, roll an Attack die. +1 can unlock one tier higher than usual; on a central tile / hero VI–VII a −1 blocks Relics (0/+1 can allow them). Field uses the tile band; merchants and card effects use hero level. Also raises Polish Pandora Search by +1 card on a "+1" face.',
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-pandora-search",
    label: "Polish Pandora Search",
    description:
      'Polish house rule: Pandora\'s Box must use Search (2) choose 1 on IV–V tiles or Search (3) choose 1 on VI–VII instead of its dice rewards. With Random Artifacts, a "+1" Attack-die face raises the Search by 1 (3 / 4).',
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-wait",
    label: "Wait (combat)",
    description:
      "Polish house rule: at the start of its activation a unit may Wait once per combat round, taking the lowest free Wait token. After all other units act, Waited units activate from highest token number to lowest. Neutrals that Waited must attack if they can.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-quick-combat",
    label: "Strength-based Quick Combat",
    description:
      "Polish house rule: Quick Combat availability compares your 5 strongest units (bronze 1 / silver 2 / gold 3 / azure 4; Pack ×2; +0.5 per Stack layer) against 2× the Field Difficulty + game difficulty (easy 1 / normal 2 / hard 3 / impossible 4; +1 when playing with Unit Stacks) — VI–VII fields included. A covered fight that would give no Experience resolves as a mandatory Quick Combat; one that could give Experience offers fight-or-quick, including when Hero level exactly matches the field. Hero level alone no longer auto-wins.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "freelancers-guild-bounty",
    label: "Freelancer's Guild: 2-gold bounty",
    description:
      "BINH house rule: Freelancer's Guild pays 2 gold each time you win against Neutral Units. Off: it pays the 1 gold printed on the Stronghold board.",
    category: "combat",
    default: true,
    legacyDefault: false,
  },
  {
    id: "polish-bank-auto-combat",
    label: "Banks auto combat",
    description:
      "Polish house rule: after deployment and during a Creature Bank fight, offer Auto Combat only when no remaining guard can damage any of your deployed units, and your army can damage the guards. Choosing it wins the bank immediately; declining lets you continue normally.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-grail-utopia",
    label: "Grail & Dragon Utopia",
    description:
      "Legacy compatibility rule for old saves: randomly place Grail/Utopia objectives and convert extra Grail sites after the dig. New games configure Grails and Utopia fields in the Map Editor. A Utopia field grants 20 gold, two Artifact Search (3) rewards, and a Morale or Ability-Empower token.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-alliance-mode",
    label: "Alliance mode",
    description:
      "Polish variant: allied players combine their Victory Points at game end. During a turn, allies may transfer Artifacts while any of their main or secondary Heroes are adjacent, and resources while their Heroes are adjacent or the initiating Hero is at a Town, Settlement, or Trading Post. The receiving ally must accept.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-set-artifacts",
    label: "Set Artifacts",
    description:
      "Polish house rule: eleven Artifact SETS (Angelic Alliance, Power of the Dragon Father, Titan's Thunder, Ironfist of the Ogre, Armor of the Damned, Pendant of Reflection, Wizard's Well, Diplomat's Cloak, Cornucopia, Statue of Legion, Golden Goose). Your piece count for a set is how many DISTINCT member cards you still own anywhere — deck, hand, discard, and in-play permanents / ongoing cards (a member you PLAY still counts; only a card removed from the game stops counting). At 2 pieces the set's first listed effect switches on, at 3 the first two, and so on: extra initiative, once-per-combat unit buffs and zaps, spell wards, income, and a once-per-round recruit discount. Every player can see every player's set progress. Off: sets do nothing and no set state exists.",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-bank-unit-spells",
    label: "Polish spells vs bank units",
    description:
      'Polish house rule: Anti-Magic, Blind, Sorrow and Disrupting Ray may affect a tierless Creature-Bank guard or won bank-reward unit at its underlying grade (capped at gold). Counterstrike, Magic Mirror, Frenzy, Sacrifice, Resurrection and Clone may also affect bank units, but ONLY at each spell\'s highest Power rung. Blind likewise needs its top "+2 Power" rung. Off (default): tier-gated spells still treat bank units as gradeless and cannot reach them. This never extends the exception to commanders, heroes, Berserk, Teleport or tier-gated damage spells.',
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "polish-card-balance",
    label: "Balanced cards (Balance Pack)",
    description:
      'Polish house rule (default OFF in both modes): the community "Balance Pack" reprints. Covered Abilities, Spells, Artifacts and hero Specialties play their NEW printed text and show their balance-pack card face; every card NOT covered is byte-identical to a normal game, face included. If the Community Balance rule is also on, the COMMUNITY reprint wins for any card both packs cover. Full card-by-card list: open the linked spreadsheet (machine-readable scope: POLISH_BALANCE_CARD_IDS in src/data/cards/polish-balance-art.ts).',
    // Full transcription lives in docs/polish-card-balance-spec.md; the link is
    // the mod author's source workbook so the concise text can stay scannable.
    infoUrl:
      "https://onedrive.live.com/personal/b984a49b0d963ed6/_layouts/15/Doc.aspx?sourcedoc=%7B6CBF12FC-32C0-4BEE-9210-121ADAA22E8C%7D&file=Cards%20-%20Balance%20changes.xlsx&action=default&mobileredirect=true",
    category: "polish",
    default: false,
    legacyDefault: false,
  },
  {
    id: "community-card-balance",
    label: "Heroes 3 Board Game Community Balance Change",
    description:
      'Community house rule (default OFF in both modes): the "Heroes 3 Board Game Community Balance Change" spreadsheet reprints. Covered Abilities, Spells, Artifacts, four Castle unit sides and three re-priced war machines play their NEW printed text and show their community card face; every card NOT covered is byte-identical to a normal game, face included. If the Polish "Balance Pack" rule is also on, the COMMUNITY reprint wins for any card both packs cover. Full card-by-card list: open the linked spreadsheet (machine-readable scope: COMMUNITY_BALANCE_CARD_IDS / COMMUNITY_BALANCE_UNIT_FACES in src/data/cards/community-balance-art.ts).',
    infoUrl:
      "https://docs.google.com/spreadsheets/d/1wmMbzxYy5DUhglINi9XDUQPVblluQR7E1u7Mlkbtbl0/edit?gid=373015883#gid=373015883",
    category: "community",
    default: false,
    legacyDefault: false,
  },
  {
    id: "multi-demon-summon",
    label: "Pit Lords: multiple Demons",
    description:
      "On (house rule): Pit Lords may summon a new Few of Demons even when Demons are already on the field (multiple Demon units, still once per Pit Lords per combat). Off (official): only ONE Demons unit may stand on the field — either a Few or a Pack. With Demons already present you may only Reinforce a Few up to a Pack, never summon a second stack.",
    category: "combat",
    default: true,
  },
  {
    id: "phoenix-pack-rebirth",
    label: "Phoenix Pack Rebirth",
    description:
      "On (BINH house rule): the Pack of Phoenixes also has Rebirth (once per Combat, lethal damage leaves it at 1 Health on its Pack side). Off (printed/wiki, and the BASE GAME default): only the Few (and Neutral) Phoenixes have Rebirth — the Pack has the line attack and Fire immunity only.",
    category: "units",
    // BINH-only: ON by default under BINH, OFF in Legacy (no `legacyDefault`), so
    // the base game plays the printed Pack. Either mode may flip it explicitly.
    default: true,
  },
  {
    id: "resource-die-single-valuables",
    label: "Resource die: valuables capped at 1",
    description:
      'On (BINH house rule): the Resource die\'s "2 valuables" face is reduced to 1, so no Resource-die roll ever grants more than 1 valuable (the die reads 2/4 materials, 1/1 valuables, 3/6 gold). Off (printed die, and the BASE GAME default): the die keeps its printed "2 valuables" face (2/4 materials, 1/2 valuables, 3/6 gold), so a roll — or a Cards-of-Prophecy "set the die" pick — can grant 2 valuables.',
    // A BINH default (ON in binh, OFF in legacy), so it lives in the BINH
    // "Combat & map rules" panel rather than the opt-in Global map rules panel.
    category: "combat",
    // BINH-only: ON by default under BINH (preserving the behaviour this engine
    // has always had), OFF in Legacy (no `legacyDefault`), so the base game
    // rolls the PRINTED die. Either mode may flip it explicitly.
    default: true,
  },
  {
    id: "mine-guard-reinforcement",
    label: "Mine guards: +1 bronze",
    description:
      "Global map rule: every fought-out neutral guard fight on a Mine (all resource types — gold / valuables / materials) fields one EXTRA random neutral bronze creature on top of the normal guard army. It only makes the fought army bigger — the fight's difficulty, experience and reward are unchanged, and Quick Combat / level auto-wins (won before the army deploys) are unaffected. Creature Banks are not mines.",
    category: "global",
    // Opt-in difficulty tweak, OFF in both modes (not an existing core default).
    default: false,
    legacyDefault: false,
  },
  {
    id: "elemental-damage-no-die",
    label: "Elemental damage cannot take +Attack buffs",
    description:
      "On (BINH house rule): elemental attacks still roll the Attack die normally and ignore Defense, but positive Attack buffs played in the instant window cannot raise them; debuffs still lower them. Attack tokens still work normally. Off (official): elemental attacks roll normally, ignore Defense, and can be raised or lowered like any other attack.",
    category: "combat",
    // OFF in both modes: the official reading is the default. Turning it ON
    // restores the engine's previous behaviour for tables that prefer it.
    default: false,
    legacyDefault: false,
  },
  {
    id: "discovery-border-gate",
    label: "Yellow borders block Tile discovery",
    description:
      "Discovering a face-down Map Tile — or opening a new Ⅱ–Ⅲ one — needs an OPEN border between your Hero's field and the tile; a printed yellow arc or designer border seals it off (a Redwood Observatory / Speculum still reveals across). This is an independent toggle: Rule 111 and other Polish rules never change or lock it. Movement still obeys borders in every mode, and discovery never crosses the Surface/Subterranean divide.",
    category: "combat",
    default: true,
    legacyDefault: false,
  },
  {
    id: "deck-access-hero-level",
    label: "Hero level unlocks Spell/Artifact tiers",
    description:
      "On (old BINH reading): which Spell/Artifact decks a Search may reach also unlocks from hero level and map progress — Expert Spells at level 4+, or once a Ⅳ–Ⅴ tile is revealed anywhere, or while holding Eagle Eye / Wisdom / a Basic X Magic; Major artifacts at level 4+ and Relics at level 6+ with an artifact source. Off (official rules, default): the TILE your main Hero stands on decides and nothing else — starting & far tiles (Ⅰ–Ⅲ) = basic Spells / Minor artifacts, near tiles (Ⅳ–Ⅴ) = expert Spells / Major artifacts, centre tiles (Ⅵ–Ⅶ) = expert Spells / Relic artifacts. Weaker tiers are always allowed, so a centre tile can still Search Minors.",
    category: "decks",
    default: false,
    legacyDefault: false,
  },
  {
    id: "mine-army-defense",
    label: "Mines: defend with your army & cards",
    description:
      "Global map rule: an enemy Hero walking onto YOUR already-flagged Mine no longer re-flags it for free — you (the owner) get the settlement-style defense: pay 3 gold and defend with your UNITS and your CARDS (only your Hero is missing, so no Tactics, no Retreat/Surrender and no hero-borne effects — commander, equipment, hero grades), or let it fall (the flag hands over exactly like today's walk-in). Winning the defense keeps the Mine and repels the attacker; declining or losing flags it for the attacker. A Mine with a LIVE neutral guard still fights that guard first; a View Earth remote capture is NOT intercepted. Off (default): byte-identical — the walk-in re-flags the Mine for free.",
    category: "global",
    // Opt-in house rule, OFF in both modes (adds a defense chokepoint that did
    // not exist before — must not change any legacy/binh game unless picked).
    default: false,
    legacyDefault: false,
  },
  {
    id: "no-secondary-heroes",
    label: "No Secondary Heroes",
    description:
      "Global map rule: Secondary Heroes cannot be hired or gained. A Prison grants its printed 3-gold fallback instead, so the location still resolves. Off: Secondary Heroes work normally.",
    category: "global",
    default: false,
    legacyDefault: false,
  },
  {
    id: "free-neutral-combat-extend",
    label: "Neutral battles extend for free",
    description:
      "Global map rule: continuing a fought Neutral combat into another round costs no Hero movement point. Off: each extra combat round costs 1 movement point.",
    category: "global",
    default: false,
    legacyDefault: false,
  },
  {
    id: "level-v-signature-neutral",
    label: "Level V signature Neutral",
    description:
      "Global map rule: every ordinary Field-Difficulty V Neutral army contains at least one Archangels, Ghost Dragons, or Black Dragons card. It replaces one existing golden draw, so army size, difficulty, rewards, and XP stay unchanged. If all three cards are already outside their deck, a temporary guard copy is used for that fight.",
    category: "global",
    default: false,
    legacyDefault: false,
  },
];

export const HOUSE_RULE_BY_ID: Record<HouseRuleId, HouseRuleDef> =
  HOUSE_RULES.reduce(
    (map, def) => {
      map[def.id] = def;
      return map;
    },
    {} as Record<HouseRuleId, HouseRuleDef>,
  );

export type HouseRuleFlags = Partial<Record<HouseRuleId, boolean>>;

/**
 * House-rule ids that once shipped and have been RETIRED. A stored lobby, a
 * frozen `adventure.houseRules` map or an out-of-date client may still carry
 * one; it is INERT (nothing reads it) but must never be an error, so
 * `setGameOptions`' unknown-id guard skips these instead of throwing.
 *
 * - `bank-interior-entry-only` (retired 2026-09-05): the BINH "enter a Creature
 *   Bank only from its host tile" rule sealed EVERY outer edge of a carved bank
 *   whether or not the tile printed one. USER RULE 2026-09-05 — "if there is no
 *   border outside, don't add a border" — replaced it with the printed-outer-arc
 *   reading now enforced unconditionally at {@link isOuterEdgeSealed}.
 */
export const RETIRED_HOUSE_RULE_IDS: ReadonlySet<string> = new Set([
  "bank-interior-entry-only",
]);

/** The default value of `id` for a bare mode with no explicit flag set. */
export function houseRuleDefaultFor(
  ruleset: GameRuleset,
  id: HouseRuleId,
): boolean {
  const def = HOUSE_RULE_BY_ID[id];
  return ruleset === "binh" ? def.default : (def.legacyDefault ?? false);
}

/**
 * Resolve every house rule to a concrete boolean for the chosen mode + explicit
 * toggles. Called once at setup; the result is frozen onto adventure state.
 * Every flag is independent: an explicit value always wins, while the chosen
 * mode supplies only the default for flags the host has not touched.
 */
export function resolveHouseRules(
  options: Pick<GameSetupOptions, "ruleset" | "houseRules">,
): Record<HouseRuleId, boolean> {
  const explicit = options.houseRules ?? {};
  const resolved = {} as Record<HouseRuleId, boolean>;
  for (const def of HOUSE_RULES) {
    resolved[def.id] =
      explicit[def.id] ?? houseRuleDefaultFor(options.ruleset, def.id);
  }
  return resolved;
}

/**
 * Whether house rule `id` is ON for this game. Reads the frozen
 * `adventure.houseRules` map when present (the authoritative in-play value),
 * else derives the mode default (combat sandbox / pre-adventure / snapshots
 * that predate the field). Deliberately does NOT import from `ruleset.ts` to
 * keep the dependency one-way (ruleset.ts → house-rules.ts).
 */
export function houseRuleEnabled(
  state: Pick<GameState, "ruleset" | "adventure">,
  id: HouseRuleId,
): boolean {
  const frozen = state.adventure?.houseRules;
  if (frozen && frozen[id] !== undefined) {
    return frozen[id]!;
  }
  return houseRuleDefaultFor(state.ruleset ?? "legacy", id);
}

/** The two faction-specific building slots, excluding the four core roles. */
export function isSideTownBuilding(
  building: Pick<TownBuildingDefinition, "id">,
): boolean {
  const role = building.id.split(".").at(-1) ?? building.id;
  return !(
    role === "city_hall" ||
    role === "citadel" ||
    role === "mage_guild" ||
    role.startsWith("dwelling_")
  );
}

/** Cost actually charged and displayed for a building in this game. */
export function effectiveTownBuildingCost(
  state: Pick<GameState, "ruleset" | "adventure">,
  building: Pick<TownBuildingDefinition, "id" | "cost">,
): ResourceCost {
  if (
    !houseRuleEnabled(state, "side-buildings-materials-only") ||
    !isSideTownBuilding(building)
  ) {
    return building.cost;
  }
  return {
    buildingMaterials:
      (building.cost.buildingMaterials ?? 0) + (building.cost.valuables ?? 0),
  };
}

/**
 * Whether ARMY Unit Stack layers (`ArmyUnitState.stacks` / `armyStacks` on a
 * combat unit) FUNCTION in this game: +1 Attack while any layer remains, and
 * each layer absorbing one full health bar before the card dies.
 *
 * These are the `polish-unit-stacks` layers, bought at the Citadel. Polish Bank
 * Sizes uses the standard Creature Bank Stack Tokens (not army layers), so it
 * does not activate this machinery.
 *
 * TWO roads into ONE machinery (same purchase flow, same `polishArmyUnitStackCost`
 * pricing, same caps): the Polish house rule `polish-unit-stacks`, OR the anime
 * module `anime.unitStacks`. Either being on activates every downstream consumer
 * (the Citadel purchase offer, the +1 Attack fold, the lethal-blow layer absorb,
 * the badges). They coexist with no divergence — the OR is the whole seam.
 */
export function armyUnitStacksActive(
  state: Pick<GameState, "ruleset" | "adventure" | "anime">,
): boolean {
  return (
    houseRuleEnabled(state, "polish-unit-stacks") ||
    animeModuleEnabled(state, "unitStacks")
  );
}
