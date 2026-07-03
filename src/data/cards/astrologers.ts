/**
 * Astrologers Proclaim cards. One card is drawn and resolved at the start of
 * every even-numbered round; it stays face up ("active") until the next
 * Astrologers round replaces it.
 *
 * Text transcribed from the fan wiki (https://en.homm3bg.wiki/astrologers_proclaim/),
 * rules cross-checked against the community rulebook rewrite
 * (https://github.com/qwrtln/Homm3BG-build-artifacts, main_en.pdf).
 *
 * Scope: the Core Game proclamations plus every expansion card whose effect
 * maps onto an existing engine system and is wired + tested here — including the
 * Stretch/Conflux/Cove/Stronghold cards Destruction, Sanctuary, Spells, Pirates,
 * Rulebook, Judge Dread, Wind and Mages (Sanctuary's PvP-attack ban is enforced
 * at the combat chokepoint and, by construction, keeps the optional
 * parallel-turns mode running because no PvP ever triggers). Only the cards that
 * would each need a whole new subsystem remain out — see
 * ASTROLOGERS_NOT_IMPLEMENTED, whose entries each name the missing subsystem.
 * The `effect` field is the single source of truth for what the engine runs;
 * `text` is the printed card wording. Most cards carry a real card scan in
 * `image`; a few render through the app's text card-face while their scan is
 * unavailable upstream (ART_LESS_PROCLAMATIONS) or not yet fetched
 * (ART_PENDING_PROCLAMATIONS). Expansion proclamations that would still need a
 * new subsystem (defense->attack conversion, in-place tile rotation, ...) remain
 * intentionally NOT included rather than shipped as inert text — see
 * ASTROLOGERS_NOT_IMPLEMENTED below for the honest list.
 */

import type { SpellSchool } from "@/engine/state";

export type AstrologersEffect =
  | { type: "NONE" }
  | { type: "GAIN_MORALE_ALL"; amount: number }
  | { type: "ROLL_DICE_ALL"; dice: "treasure" | "resource"; count: number }
  | { type: "REMOVE_BLACK_CUBES" }
  | { type: "NEXT_RESOURCE_ROUND"; gold?: number; valuables?: number }
  | { type: "MOVEMENT_MODIFIER"; amount: number }
  | { type: "HAND_LIMIT_MODIFIER"; amount: number }
  | { type: "RESHUFFLE_ARTIFACTS_SPELLS" }
  | { type: "DISCARD_REDRAW_ALL" }
  | { type: "PLAGUE_FLIP_ALL" }
  | { type: "REINFORCE_HALF_COST_ALL" }
  | { type: "DIE_REROLL_PER_TURN" }
  | { type: "FIRST_SPELL_POWER_BONUS"; amount: number }
  | { type: "SCHOOL_SPELL_POWER_BONUS"; schools: SpellSchool[]; amount: number }
  | { type: "FIRST_SPELL_RETURNS" }
  | { type: "NEUTRAL_DRAW_SWAP" }
  // Dancing Imp: each player may Remove one Statistic card (hand or discard) to
  // gain the same-type Empowered Statistic, for free. Resolved at draw.
  | { type: "EMPOWER_STATISTIC_CHOICE" }
  // Plane Between Planes: each player may immediately Remove up to `count` cards
  // from their hand or discard pile. Resolved at draw.
  | { type: "REMOVE_CARDS_CHOICE"; count: number }
  // Hero: ongoing — at the start of each of a player's turns they may pay
  // `costGold` to Remove a hand Statistic and replace it with the same-type
  // Empowered Statistic, up to `maxPerTurn` times that turn.
  | { type: "PAID_EMPOWER_PER_TURN"; costGold: number; maxPerTurn: number }
  // McGiver: at the start of the next round each player may take one War Machine
  // of their choice from the shared supply for free. Resolved at that next
  // Resource round (startAdventureRound), not when the card is drawn.
  | { type: "GRANT_WAR_MACHINE_CHOICE" }
  // Ammo Cart: while face up, every Ballista deals +`ballistaDamageBonus`, every
  // First Aid Tent heals +`firstAidHealBonus`, and (when `rangedAttackReroll`)
  // an Ammo Cart owner's ranged units may reroll 1 Attack die. Read in the
  // war-machine round (permanents.ts) and the attack-reroll builder (reducer.ts).
  | { type: "WAR_MACHINE_BUFF"; ballistaDamageBonus: number; firstAidHealBonus: number; rangedAttackReroll: boolean }
  // Explorers: ongoing — for every `per` cards a player discards during their
  // start-of-turn hand refresh, they may empower one Statistic (hand or discard)
  // into its same-type Empowered version, for free. Resolved in refreshHand.
  | { type: "EMPOWER_PER_DISCARD"; per: number }
  // Charlie and his Circus: each player may recruit one Neutral Unit they can
  // afford, drawn one per Dwelling tier they control (capped at `maxDraws`); the
  // rest shuffle back. Offered when drawn AND again at the next Resource round
  // ("this round and the next one"). engine: "the corresponding Dwelling" is the
  // Dwelling-tier gate already used by Cyra's Diplomacy (unlockedRecruitTiers).
  | { type: "RECRUIT_NEUTRAL_DRAW"; maxDraws: number }
  // Unexpected Reinforcements: immediate — each player may search the Neutral
  // Units deck and recruit, for free, one neutral unit ASSOCIATED with their
  // faction (the neutral-deck counterpart of a unit on their roster) whose
  // Dwelling tier they have built. The card is taken from the deck and added to
  // the army's single-sided NEUTRAL side — so, like any neutral unit, it can
  // never be reinforced to a Pack (this is the whole point: it is a neutral
  // unit, not the upgradeable faction one). Reads the player's faction roster +
  // Dwelling tiers, so it works for any faction (incl. Conflux/Cove once
  // defined). A faction's signature top-tier creature (Gold Dragons, Titans,
  // Hydras) is never offered: its only neutral card is the azure-tier version,
  // not a gold-tier counterpart, and no Dwelling unlocks azure. engine: "Azure
  // units cannot be recruited" holds by construction — no Dwelling unlocks the
  // Azure tier, so an Azure unit's tier is never among the player's.
  | { type: "RECRUIT_FACTION_FREE" }
  // Wandering Merchant: at the round it is drawn each player may, once, buy one
  // War Machine from the shared supply "as if they visited a Trading Post" but
  // `discountGold` cheaper. Resolved at draw — one paid, discounted offer per
  // player through the war-machine purchase path (see queueWarMachineDiscountOffer).
  | { type: "WAR_MACHINE_DISCOUNT_OFFER"; discountGold: number }
  // Destruction: each player who has a permanent card in play must Remove it
  // (out of the game — the removed pile, per the rulebook "Remove", NOT the
  // discard) and take `gold`. Immediate + mandatory, resolved at draw for every
  // player with a permanent (players with none get nothing). The oldest
  // permanent leaves when a player holds several (the singular "it").
  | { type: "REMOVE_PERMANENT_FOR_GOLD"; gold: number }
  // Sanctuary: during the drawn (even) Astrologers round, Heroes cannot attack
  // one another — a hard PvP-attack ban enforced at the combat chokepoint
  // (startPlayerCombat throws before parallel turns are stopped, so under this
  // card a PvP attack is simply illegal AND parallel mode keeps running). The
  // ban gates on the round being even, so it lifts on the following Resource
  // round even though the card stays face up ("during this round").
  | { type: "PVP_ATTACK_BAN" }
  // Spells: whenever a player is about to Search the Spell deck they may
  // Search(`count`) instead of the base size — a strictly larger look at the
  // top (they still keep one). Passive: read in openSharedDeckSearch when the
  // searched deck is a Spell deck (either BINH split deck) and this card is up.
  | { type: "SPELL_SEARCH_WIDEN"; count: number }
  // Pirates: each time a player WINS a Combat other than Quick Combat, they gain
  // one Resource die roll. Read at combat finalization (finalizeAdventureCombat)
  // — Quick Combat never reaches finalize, so it is excluded by construction.
  | { type: "COMBAT_WIN_RESOURCE_DIE" }
  // Rulebook: neutral-unit encounters draw their guard army as if the GAME
  // difficulty were `levels` lower (min Easy) — a weaker guard. Read in
  // drawNeutralArmy. "Ignore if Easy" holds by construction (Easy cannot drop).
  | { type: "NEUTRAL_DIFFICULTY_LOWER"; levels: number }
  // Judge Dread: at the start of Combat with Neutral Units the attacker may
  // discard the whole drawn guard army and draw a fresh one. An offer opened at
  // guard reveal (like the Groovy Satyr's single swap, but all-or-nothing).
  | { type: "NEUTRAL_REDRAW_ALL" }
  // Wind: a Hero is no longer halted on the step that ENTERS the sea from a land
  // field (embarking) — it keeps moving. Disembarking (sea→land) still halts.
  // Read in seaStepHalts; "ignore with no sea tiles" holds (no sea → never fires).
  | { type: "SEA_CONTINUE_AFTER_EMBARK" }
  // Mages: using the Spell Book token is FREE this round and allowed even without
  // a Mage Guild built. Read at the Spell Book gate (legal-actions + spellBookAction).
  | { type: "FREE_SPELL_BOOK" };

/** Boxed sets / expansions a proclamation can ship in (provenance, shown in the UI). */
export const ASTROLOGERS_EXPANSIONS = [
  "Core Game",
  "Tower Expansion",
  "Fortress Expansion",
  "Inferno Expansion",
  "Rampart Expansion",
  "Conflux Expansion",
  "Cove Expansion",
  "Stronghold Expansion",
  "Stretch Goals"
] as const;

export type AstrologersExpansion = (typeof ASTROLOGERS_EXPANSIONS)[number];

export type AstrologersCardDefinition = {
  id: string;
  name: string;
  text: string;
  /** Effects that keep working until the next Astrologers round. */
  ongoing: boolean;
  effect: AstrologersEffect;
  /** Boxed set / expansion this card belongs to. */
  expansion: AstrologersExpansion;
  /**
   * Local card scan. Empty string ONLY for a card the fan wiki publishes with no
   * front scan (back side only) — those must be declared in
   * `ART_LESS_PROCLAMATIONS` and render through the app's honest text card-face
   * fallback, never a faked/placeholder scan (CLAUDE.md). Every other card
   * carries a real, locally-shipped scan.
   */
  image: string;
  source: { product: string; credit: string; url: string };
};

/**
 * Proclamations the fan wiki ships with NO front scan (only a card back), so they
 * are rendered through the app's styled text card-face fallback instead of a real
 * image. Declared here as a conscious, reviewable exception to the "every card has
 * a real scan" invariant — adding a card with `image: ""` that is NOT in this set
 * fails `astrologers-data.test.ts`. The effect is still fully engine-wired + tested;
 * only the artwork is unavailable upstream.
 */
export const ART_LESS_PROCLAMATIONS: ReadonlySet<string> = new Set<string>(["astrologers.wandering_merchant"]);

/**
 * Proclamations whose card art EXISTS upstream but has not been fetched into
 * `/public/assets` yet — a conscious "wire the effect now, add the scan later"
 * decision (the effect is fully engine-wired + tested; only the local image is
 * pending). Distinct from ART_LESS_PROCLAMATIONS (where the fan wiki genuinely
 * publishes no front scan). Both render through the app's honest text card-face
 * fallback until a real scan lands; both are accepted by the `image: ""` data
 * check. Move a slug OUT of this set once `scripts/fetch-astrologers-art.py`
 * has downloaded its scan and `image(slug)` points at a real file.
 */
export const ART_PENDING_PROCLAMATIONS: ReadonlySet<string> = new Set<string>([
  "astrologers.destruction",
  "astrologers.sanctuary",
  "astrologers.spells",
  "astrologers.pirates",
  "astrologers.rulebook",
  "astrologers.judge_dread",
  "astrologers.wind",
  "astrologers.mages"
]);

function source(slug: string, expansion: AstrologersExpansion) {
  const product =
    expansion === "Core Game"
      ? "Heroes of Might and Magic III: The Board Game (Core Game)"
      : `Heroes of Might and Magic III: The Board Game (${expansion})`;
  return {
    product,
    credit: "Card text from the fan wiki; resolution per the community rulebook rewrite.",
    url: `https://en.homm3bg.wiki/astrologers_proclaim/${slug}/`
  };
}

/** Local scan path for a proclamation slug (fetched by scripts/fetch-astrologers-art.py). */
function image(slug: string): string {
  return `/assets/astrologers_proclaim-${slug}.webp`;
}

export const astrologersCardDefinitions: Record<string, AstrologersCardDefinition> = {
  "astrologers.ammo_cart": {
    id: "astrologers.ammo_cart",
    name: "Ammo Cart",
    text: "Until the next Astrologers' round: each Ballista deals +1 damage, each First Aid Tent heals +1 health, and each Ammo Cart lets your ranged units reroll 1 Attack die.",
    ongoing: true,
    effect: { type: "WAR_MACHINE_BUFF", ballistaDamageBonus: 1, firstAidHealBonus: 1, rangedAttackReroll: true },
    expansion: "Rampart Expansion",
    image: image("ammo_cart"),
    source: source("ammo_cart", "Rampart Expansion")
  },
  "astrologers.annoying_lizard": {
    id: "astrologers.annoying_lizard",
    name: "Annoying Lizard",
    text: "Each player must shuffle all Artifact and Spell cards from their hand back into their deck and draw the same number of cards.",
    ongoing: false,
    effect: { type: "RESHUFFLE_ARTIFACTS_SPELLS" },
    expansion: "Core Game",
    image: image("annoying_lizard"),
    source: source("annoying_lizard", "Core Game")
  },
  "astrologers.battalions_stallion": {
    id: "astrologers.battalions_stallion",
    name: "Battalion's Stallion",
    text: "Until the next Astrologers' round: each Hero gains +1 Movement.",
    ongoing: true,
    effect: { type: "MOVEMENT_MODIFIER", amount: 1 },
    expansion: "Core Game",
    image: image("battalions_stallion"),
    source: source("battalions_stallion", "Core Game")
  },
  "astrologers.big_cleanup": {
    id: "astrologers.big_cleanup",
    name: "Big Cleanup",
    text: "Each player must immediately discard all cards from their hand and draw the same number of cards.",
    ongoing: false,
    effect: { type: "DISCARD_REDRAW_ALL" },
    expansion: "Fortress Expansion",
    image: image("big_cleanup"),
    source: source("big_cleanup", "Fortress Expansion")
  },
  "astrologers.blue_sky": {
    id: "astrologers.blue_sky",
    name: "Blue Sky",
    text: "Until the next Astrologers' round, all Spells from the Air Magic and Water Magic Schools are cast at +1 Power.",
    ongoing: true,
    effect: { type: "SCHOOL_SPELL_POWER_BONUS", schools: ["air", "water"], amount: 1 },
    expansion: "Tower Expansion",
    image: image("blue_sky"),
    source: source("blue_sky", "Tower Expansion")
  },
  "astrologers.charlie_and_his_circus": {
    id: "astrologers.charlie_and_his_circus",
    name: "Charlie and his Circus",
    text: "At the beginning of this round and the next one, each player can draw up to 3 cards from the Neutral Units decks they have a Dwelling for and recruit one of them, paying its cost. The rest are shuffled back.",
    ongoing: true,
    effect: { type: "RECRUIT_NEUTRAL_DRAW", maxDraws: 3 },
    expansion: "Rampart Expansion",
    image: image("charlie_and_his_circus"),
    source: source("charlie_and_his_circus", "Rampart Expansion")
  },
  "astrologers.crazy_wizard": {
    id: "astrologers.crazy_wizard",
    name: "Crazy Wizard",
    text: "Until the next Astrologers' round: the first Spell card played by each player is returned to the player's hand instead of being discarded.",
    ongoing: true,
    effect: { type: "FIRST_SPELL_RETURNS" },
    expansion: "Core Game",
    image: image("crazy_wizard"),
    source: source("crazy_wizard", "Core Game")
  },
  "astrologers.dancing_imp": {
    id: "astrologers.dancing_imp",
    name: "Dancing Imp",
    text: "Each player can Remove a Statistic card from their discard pile or hand to gain 1 Empowered Statistic card of the same type.",
    ongoing: false,
    effect: { type: "EMPOWER_STATISTIC_CHOICE" },
    expansion: "Inferno Expansion",
    image: image("dancing_imp"),
    source: source("dancing_imp", "Inferno Expansion")
  },
  "astrologers.dead_silence": {
    id: "astrologers.dead_silence",
    name: "Dead Silence",
    text: "Nothing changes.",
    ongoing: false,
    effect: { type: "NONE" },
    expansion: "Core Game",
    image: image("dead_silence"),
    source: source("dead_silence", "Core Game")
  },
  "astrologers.destruction": {
    id: "astrologers.destruction",
    name: "Destruction",
    text: "Each player who has a permanent card in play must Remove it and take 5 gold.",
    // Immediate + mandatory (resolved at draw). "Remove" sends the permanent out
    // of the GAME (the removed pile), not the discard pile — matching the
    // rulebook keyword. A player with no permanent in play is untouched and
    // gains nothing ("who HAS a permanent card in play").
    ongoing: false,
    effect: { type: "REMOVE_PERMANENT_FOR_GOLD", gold: 5 },
    expansion: "Stretch Goals",
    // Art pending (see ART_PENDING_PROCLAMATIONS) — renders via the text face.
    image: "",
    source: source("destruction", "Stretch Goals")
  },
  "astrologers.explorers": {
    id: "astrologers.explorers",
    name: "Explorers",
    // engine: "do not draw at start of turn; instead draw up to your hand limit,
    // then discard any number" is already the standard start-of-turn hand refresh
    // (the engine never auto-draws). The wired effect is the per-3-discarded
    // empower, resolved in refreshHand.
    text: "During this round, players do not draw cards at the start of their turn; instead each player draws up to their hand limit, then may discard any number of cards. For every 3 cards discarded this way, they may Remove a Statistic card and replace it with an Empowered Statistic card of the same type.",
    ongoing: true,
    effect: { type: "EMPOWER_PER_DISCARD", per: 3 },
    expansion: "Inferno Expansion",
    image: image("explorers"),
    source: source("explorers", "Inferno Expansion")
  },
  "astrologers.fancy_pixie": {
    id: "astrologers.fancy_pixie",
    name: "Fancy Pixie",
    text: "Each player immediately gains 1 positive morale.",
    ongoing: false,
    effect: { type: "GAIN_MORALE_ALL", amount: 1 },
    expansion: "Core Game",
    image: image("fancy_pixie"),
    source: source("fancy_pixie", "Core Game")
  },
  "astrologers.fluffy_rabbit": {
    id: "astrologers.fluffy_rabbit",
    name: "Fluffy Rabbit",
    text: "Each player immediately rolls 1 Treasure die and gains the rolled bonus.",
    ongoing: false,
    effect: { type: "ROLL_DICE_ALL", dice: "treasure", count: 1 },
    expansion: "Core Game",
    image: image("fluffy_rabbit"),
    source: source("fluffy_rabbit", "Core Game")
  },
  "astrologers.friendly_beaver": {
    id: "astrologers.friendly_beaver",
    name: "Friendly Beaver",
    text: "Immediately remove all Black Cubes from all locations on the map. (Drawn on the first Astrologers' round: discard it and draw another card.)",
    ongoing: false,
    effect: { type: "REMOVE_BLACK_CUBES" },
    expansion: "Core Game",
    image: image("friendly_beaver"),
    source: source("friendly_beaver", "Core Game")
  },
  "astrologers.gold_dragon": {
    id: "astrologers.gold_dragon",
    name: "Gold Dragon",
    text: "At the beginning of the next Resource round, all players gain 5 gold.",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", gold: 5 },
    expansion: "Core Game",
    image: image("gold_dragon"),
    source: source("gold_dragon", "Core Game")
  },
  "astrologers.greedy_dragon": {
    id: "astrologers.greedy_dragon",
    name: "Greedy Dragon",
    text: "At the beginning of the next Resource round, all players gain 1 less valuables (minimum 0).",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", valuables: -1 },
    expansion: "Core Game",
    image: image("greedy_dragon"),
    source: source("greedy_dragon", "Core Game")
  },
  "astrologers.grim_warlock": {
    id: "astrologers.grim_warlock",
    name: "Grim Warlock",
    text: "Until the next Astrologers' round: the first Spell card played in each player's turn gets +1 Power.",
    ongoing: true,
    effect: { type: "FIRST_SPELL_POWER_BONUS", amount: 1 },
    expansion: "Core Game",
    image: image("grim_warlock"),
    source: source("grim_warlock", "Core Game")
  },
  "astrologers.groovy_satyr": {
    id: "astrologers.groovy_satyr",
    name: "Groovy Satyr",
    text: "Until the next Astrologers' round: whenever you trigger Combat with Neutral Units, you may discard one drawn Neutral Unit card and draw another of the same tier instead.",
    ongoing: true,
    effect: { type: "NEUTRAL_DRAW_SWAP" },
    expansion: "Core Game",
    image: image("groovy_satyr"),
    source: source("groovy_satyr", "Core Game")
  },
  "astrologers.hero": {
    id: "astrologers.hero",
    name: "Hero",
    text: "Each player can pay 4 gold to Remove a Statistic card from their hand and replace it with an Empowered Statistic card of the same type. Each player may do so twice, but both exchanges must be made on the same turn.",
    ongoing: true,
    effect: { type: "PAID_EMPOWER_PER_TURN", costGold: 4, maxPerTurn: 2 },
    expansion: "Inferno Expansion",
    image: image("hero"),
    source: source("hero", "Inferno Expansion")
  },
  "astrologers.isras_friends": {
    id: "astrologers.isras_friends",
    name: "Isra's Friends",
    text: "Each player can immediately reinforce a unit on the \"Few\" side at half the cost.",
    ongoing: false,
    effect: { type: "REINFORCE_HALF_COST_ALL" },
    expansion: "Core Game",
    image: image("isras_friends"),
    source: source("isras_friends", "Core Game")
  },
  "astrologers.judge_dread": {
    id: "astrologers.judge_dread",
    name: "Judge Dread",
    text: "Until the next Astrologers' round: at the start of Combat with Neutral Units, the attacker can discard all of them and draw new Neutral Units.",
    // Passive while face up: read at guard reveal (finalizeCombatSetup). The
    // attacker gets a keep / redraw-the-whole-army offer.
    ongoing: true,
    effect: { type: "NEUTRAL_REDRAW_ALL" },
    expansion: "Stronghold Expansion",
    image: "",
    source: source("judge_dread", "Stronghold Expansion")
  },
  "astrologers.mages": {
    id: "astrologers.mages",
    name: "Mages",
    text: "During this round, using the Spell Book token is free. You can use it even if you do not have a Mage Guild built.",
    // Passive while face up (read at the Spell Book gate): the token costs 0 gold
    // and the Mage-Guild requirement is waived. Scoped to the drawn (even) round.
    ongoing: true,
    effect: { type: "FREE_SPELL_BOOK" },
    expansion: "Conflux Expansion",
    image: "",
    source: source("mages", "Conflux Expansion")
  },
  "astrologers.magic_tortoise": {
    id: "astrologers.magic_tortoise",
    name: "Magic Tortoise",
    text: "Until the next Astrologers' round: each Hero suffers -1 Movement.",
    ongoing: true,
    effect: { type: "MOVEMENT_MODIFIER", amount: -1 },
    expansion: "Core Game",
    image: image("magic_tortoise"),
    source: source("magic_tortoise", "Core Game")
  },
  "astrologers.mcgiver": {
    id: "astrologers.mcgiver",
    name: "McGiver",
    text: "At the beginning of the next round, each player can take 1 War Machine of their choice from the supply at no cost.",
    ongoing: true,
    effect: { type: "GRANT_WAR_MACHINE_CHOICE" },
    expansion: "Rampart Expansion",
    image: image("mcgiver"),
    source: source("mcgiver", "Rampart Expansion")
  },
  "astrologers.merry_leprechaun": {
    id: "astrologers.merry_leprechaun",
    name: "Merry Leprechaun",
    text: "At the beginning of the next Resource round, all players gain 1 valuables.",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", valuables: 1 },
    expansion: "Core Game",
    image: image("merry_leprechaun"),
    source: source("merry_leprechaun", "Core Game")
  },
  "astrologers.pirates": {
    id: "astrologers.pirates",
    name: "Pirates",
    text: "Until the next Astrologers' round: every time you win Combat other than Quick Combat, gain 1 Resource die.",
    // Passive while face up (read at combat finalization): the winning player
    // rolls one Resource die. Quick Combat never reaches finalization, so it is
    // excluded automatically.
    ongoing: true,
    effect: { type: "COMBAT_WIN_RESOURCE_DIE" },
    expansion: "Cove Expansion",
    image: "",
    source: source("pirates", "Cove Expansion")
  },
  "astrologers.plane_between_planes": {
    id: "astrologers.plane_between_planes",
    name: "Plane Between Planes",
    text: "Each player can immediately Remove up to 2 cards from their hand or from their discard pile.",
    ongoing: false,
    effect: { type: "REMOVE_CARDS_CHOICE", count: 2 },
    expansion: "Fortress Expansion",
    image: image("plane_between_planes"),
    source: source("plane_between_planes", "Fortress Expansion")
  },
  "astrologers.profuse_growth": {
    id: "astrologers.profuse_growth",
    name: "Profuse Growth",
    text: "Until the next Astrologers' round: your hand limit is increased by 1.",
    ongoing: true,
    effect: { type: "HAND_LIMIT_MODIFIER", amount: 1 },
    expansion: "Core Game",
    image: image("profuse_growth"),
    source: source("profuse_growth", "Core Game")
  },
  "astrologers.rulebook": {
    id: "astrologers.rulebook",
    name: "Rulebook",
    text: "When you trigger Combat with Neutral Units, the enemy's strength corresponds to the game difficulty setting one level lower. (Ignore this card if the difficulty is Easy.)",
    // Passive while face up (read when drawing a neutral guard army): the army is
    // drawn as if the GAME difficulty were one level lower. Easy cannot drop, so
    // "ignore on Easy" holds by construction.
    ongoing: true,
    effect: { type: "NEUTRAL_DIFFICULTY_LOWER", levels: 1 },
    expansion: "Stretch Goals",
    image: "",
    source: source("rulebook", "Stretch Goals")
  },
  "astrologers.sanctuary": {
    id: "astrologers.sanctuary",
    name: "Sanctuary",
    text: "During this round, Heroes cannot attack one another. (Ignore this card when playing a campaign scenario.)",
    // Passive while face up, read at the PvP-combat chokepoint (startPlayerCombat).
    // Gated on the round being the even Astrologers round it was drawn, so the
    // ban lifts on the following Resource round ("during this round"). There is no
    // campaign-scenario mode in this build, so the parenthetical never applies.
    ongoing: true,
    effect: { type: "PVP_ATTACK_BAN" },
    expansion: "Stretch Goals",
    // Art pending (see ART_PENDING_PROCLAMATIONS) — renders via the text face.
    image: "",
    source: source("sanctuary", "Stretch Goals")
  },
  "astrologers.scorched_ground": {
    id: "astrologers.scorched_ground",
    name: "Scorched Ground",
    text: "Until the next Astrologers' round, all Spells from the Earth Magic and Fire Magic Schools are cast at +1 Power.",
    ongoing: true,
    effect: { type: "SCHOOL_SPELL_POWER_BONUS", schools: ["earth", "fire"], amount: 1 },
    expansion: "Tower Expansion",
    image: image("scorched_ground"),
    source: source("scorched_ground", "Tower Expansion")
  },
  "astrologers.society": {
    id: "astrologers.society",
    name: "Society",
    text: "Each player immediately gains 1 negative morale.",
    ongoing: false,
    effect: { type: "GAIN_MORALE_ALL", amount: -1 },
    expansion: "Tower Expansion",
    image: image("society"),
    source: source("society", "Tower Expansion")
  },
  "astrologers.spells": {
    id: "astrologers.spells",
    name: "Spells",
    text: "When you are about to Search the Spell deck, you can perform Search(4) the Spell deck instead.",
    // Passive while face up: openSharedDeckSearch widens any Spell-deck Search to
    // at least 4 (a strictly bigger look — the searcher still keeps one card).
    ongoing: true,
    effect: { type: "SPELL_SEARCH_WIDEN", count: 4 },
    expansion: "Conflux Expansion",
    // Art pending (see ART_PENDING_PROCLAMATIONS) — renders via the text face.
    image: "",
    source: source("spells", "Conflux Expansion")
  },
  "astrologers.swift_weasel": {
    id: "astrologers.swift_weasel",
    name: "Swift Weasel",
    text: "Until the next Astrologers' round: once per turn, each player can reroll a Treasure die or a Resource die.",
    ongoing: true,
    effect: { type: "DIE_REROLL_PER_TURN" },
    expansion: "Core Game",
    image: image("swift_weasel"),
    source: source("swift_weasel", "Core Game")
  },
  "astrologers.terrible_plague": {
    id: "astrologers.terrible_plague",
    name: "Terrible Plague",
    text: "All players flip one of their units from the \"Pack\" to the \"Few\" side, if possible.",
    ongoing: false,
    effect: { type: "PLAGUE_FLIP_ALL" },
    expansion: "Core Game",
    image: image("terrible_plague"),
    source: source("terrible_plague", "Core Game")
  },
  "astrologers.unexpected_reinforcements": {
    id: "astrologers.unexpected_reinforcements",
    name: "Unexpected Reinforcements",
    text: "Each player can immediately search the Neutral Units deck and Recruit 1 chosen unit associated with their faction for free. Each player still needs to have the corresponding Dwelling built in their town. Azure units cannot be recruited this way.",
    ongoing: false,
    effect: { type: "RECRUIT_FACTION_FREE" },
    expansion: "Tower Expansion",
    image: image("unexpected_reinforcements"),
    source: source("unexpected_reinforcements", "Tower Expansion")
  },
  "astrologers.wandering_merchant": {
    id: "astrologers.wandering_merchant",
    name: "Wandering Merchant",
    text: "Once during this round, each player can buy a War Machine as if they visited a Trading Post, but with a discount of 3 gold.",
    // One-time: the discounted buy is offered only the round the card is drawn —
    // it does not persist to the following Resource round (unlike McGiver).
    ongoing: false,
    effect: { type: "WAR_MACHINE_DISCOUNT_OFFER", discountGold: 3 },
    expansion: "Stretch Goals",
    // The fan wiki has no front scan for this Stretch-Goals card — see
    // ART_LESS_PROCLAMATIONS; it renders through the styled text card-face.
    image: "",
    source: source("wandering_merchant", "Stretch Goals")
  },
  "astrologers.wind": {
    id: "astrologers.wind",
    name: "Wind",
    text: "Until the next Astrologers' round: all Heroes can continue their movement after entering a sea field from a land field. (Ignore this card if there are no sea tiles.)",
    // Passive while face up (read in seaStepHalts): the embark step (land→sea)
    // no longer halts the hero. Disembarking (sea→land) still halts. With no sea
    // tiles the step never occurs, so "ignore" holds by construction.
    ongoing: true,
    effect: { type: "SEA_CONTINUE_AFTER_EMBARK" },
    expansion: "Cove Expansion",
    image: "",
    source: source("wind", "Cove Expansion")
  },
  "astrologers.white_raven": {
    id: "astrologers.white_raven",
    name: "White Raven",
    text: "Each player immediately rolls 1 Resource die and gains the rolled resources.",
    ongoing: false,
    effect: { type: "ROLL_DICE_ALL", dice: "resource", count: 1 },
    expansion: "Core Game",
    image: image("white_raven"),
    source: source("white_raven", "Core Game")
  },
  "astrologers.wild_debauchery": {
    id: "astrologers.wild_debauchery",
    name: "Wild Debauchery",
    text: "At the beginning of the next Resource round, all players gain 5 less gold (minimum 0).",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", gold: -5 },
    expansion: "Core Game",
    image: image("wild_debauchery"),
    source: source("wild_debauchery", "Core Game")
  }
};

/**
 * Proclamations that are fully wired but TEMPORARILY held out of the live deck
 * by request ("disable it for now"). They keep their definition, art and engine
 * effect, so re-enabling one is just deleting it from this set — unlike
 * ASTROLOGERS_NOT_IMPLEMENTED, whose entries have no working effect at all.
 *
 * - Friendly Beaver — "remove all Black Cubes from the map" wipes every player's
 *   explored-field progress at once; pulled from the deck for now.
 */
export const DISABLED_ASTROLOGERS_CARDS = new Set<string>(["astrologers.friendly_beaver"]);

export const astrologersDeckCardIds: string[] = Object.keys(astrologersCardDefinitions).filter(
  (id) => !DISABLED_ASTROLOGERS_CARDS.has(id)
);

/**
 * Expansion proclamations that exist on the wiki but are deliberately NOT in the
 * deck: each would need an engine subsystem this game does not have yet, so
 * shipping them would mean inert text (forbidden by CLAUDE.md). Tracked here so
 * the omission is a conscious, reviewable decision rather than a silent gap.
 */
export const ASTROLOGERS_NOT_IMPLEMENTED: { name: string; expansion: string; needs: string }[] = [
  // Crag Hack ties a first-combat ground-unit attack buff to the specific hero
  // Crag Hack's faction (Stronghold), which is not a playable faction in this
  // build — so its "reinforce Goblins for free" half has no home. Left out until
  // Stronghold ships.
  { name: "Crag Hack", expansion: "Stronghold", needs: "the Stronghold faction (Crag Hack's) + its free-Goblin reinforce" },
  // Forty Thieves inserts the drawer's "pick 1 of 2 Events" choice into the
  // Event draw, which happens at the START of a Resource round BEFORE turns
  // begin. The round-advance queues each player's turn-start rewards immediately
  // after drawEventCard with no pause for a pending choice, so a choice opened
  // mid-draw would resolve the Event AFTER turn-start rewards — breaking the
  // "Events resolve before turns" ordering. Needs a round-start restructure that
  // fully resolves the Event pick before startPlayerTurn. Deferred (CLAUDE.md #1).
  { name: "Forty Thieves", expansion: "Fortress", needs: "a round-start hook that resolves the drawer's Event pick before turns begin" },
  // Disruption rotates an ALREADY-EXPLORED map tile in place. The existing
  // rotation machinery (materializeTileFields) rebuilds a tile's fields from its
  // definition — resetting flags, Black Cubes and everFlagged — so reusing it
  // mid-game would WIPE the tile's accumulated state. A correct implementation
  // needs a rotate-in-place that permutes each ring hex's full MapFieldState
  // (flag/cube/settlement/bank) around the centre. Deferred rather than ship
  // state corruption (CLAUDE.md #1: no bug).
  { name: "Disruption", expansion: "Stretch Goals", needs: "a rotate-in-place tile subsystem that preserves each hex's accumulated state" },
  // Elementals seeds a face-up Elemental on TOP of each Neutral deck and makes it
  // "return when defeated" — a per-deck face-up-guard subsystem the neutral decks
  // do not model. Deferred rather than faked.
  { name: "Elementals", expansion: "Conflux", needs: "a face-up Elemental guard seeded on each Neutral deck that returns on defeat" },
  // Multilingual Bron rerolls the die of a unit's special ABILITY (Halfling shot,
  // Satyr morale, ...). Those ability rolls resolve inline without a reroll hook;
  // adding one uniformly across every ability roll is a combat-wide subsystem.
  { name: "Multilingual Bron", expansion: "Stretch Goals", needs: "a uniform reroll hook on every unit special-ability roll" },
  // Offense swaps Defense→Attack on every card that grants Defense — a
  // fundamental combat-value reinterpretation across Statistics, abilities and
  // tokens. Too invasive to wire correctly without a value-source rework.
  { name: "Offense", expansion: "Stronghold", needs: "a global Defense→Attack reinterpretation of every value source" },
  // Plastic Tray changes the Defend action itself (roll no Attack dice, get +1
  // Defense) — a rework of the defend/defense-token combat mechanic.
  { name: "Plastic Tray", expansion: "Stronghold", needs: "a reworked Defend action (no attack dice, +1 Defense)" },
  // Restart reduces the hand LIMIT by 2 to a minimum of 4. This build's base hand
  // limit is already 4 (adventure-setup.ts), so the card would be inert unless a
  // permanent first raised the limit above 4 — i.e. effectively decorative here.
  // Left out rather than shipped as a near-no-op (CLAUDE.md #1).
  { name: "Restart", expansion: "Stretch Goals", needs: "a base hand limit above 4 for the -2 (min 4) reduction to ever bite" },
  // Whirlpool needs the whirlpool map-location travel subsystem (enter one, pick
  // an exit whirlpool) which does not exist yet.
  { name: "Whirlpool", expansion: "Cove", needs: "the whirlpool travel subsystem (enter/exit whirlpool locations)" }
];
