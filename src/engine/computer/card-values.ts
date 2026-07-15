import { cardLibrary } from "@/data/cards/library";

/**
 * Community tier-list value model for the computer player (score layer only —
 * no engine rule reads this). Source: the four BGG strategy-forum tier lists
 * for HOMM3: The Board Game, one thread per card family, mirrored to the
 * session scratchpad as `bgg-tier-lists.txt`:
 *   - Artifact Tier List — thread 3303851
 *   - Spell Tier List    — thread 3285411
 *   - Ability Tier List  — thread 3286664
 *   - Hero Tier List     — thread 3307739
 *
 * Mapping coverage (hygiene-tested in card-values.test.ts): every entry of all
 * four lists maps to a real id — 63/63 artifacts, 41/41 spells, 26/26 abilities
 * (plus the untiered Necropolis-Necromancy note, handled contextually below)
 * and 28/28 heroes. ZERO tier-list names are unmapped. The reverse is not true:
 * cards the lists predate (expansion spells such as Fireball/Water Walk/Clone,
 * Cove/Factory/Conflux artifacts, statistics, specialties) carry no tier and
 * fall back to the kind/tier keep heuristic in card-policy.ts unchanged.
 *
 * IMPORTANT (the list author's own framing + the user's caveat): the tiers
 * assume the LEGACY base rules with no optional modules. `cardTierValue`
 * therefore adjusts for the live game context instead of copying blindly:
 * PvP-only cards deflate with no live enemy seat, morale-token-economy cards
 * deflate under the Morale-Cards optional rule, Necromancy is priced by the
 * Necropolis matchup, and Wisdom by Mage-Guild access.
 */

export type CardValueTier = "S" | "A" | "B" | "C" | "D";

/**
 * Modest spread: tier refines the kind/family keep score, it must never swamp
 * situational scoring (saves +20, permanents +12, relic-vs-minor 45 …).
 */
export const TIER_SCORE: Record<CardValueTier, number> = {
  S: 30,
  A: 18,
  B: 8,
  C: 0,
  D: -12,
};

export function tierScore(tier: CardValueTier): number {
  return TIER_SCORE[tier];
}

/**
 * Printed community tier per card id — the raw list, before any context
 * adjustment. Keys are verified against `cardLibrary` by the hygiene test.
 */
export const CARD_TIER: Record<string, CardValueTier> = {
  // ---- Artifacts (thread 3303851; 63 entries, all mapped) ------------------
  "artifact.helm_of_heavenly_enlightenment": "S",
  "artifact.angel_wings": "S",
  "artifact.boots_of_speed": "S",
  "artifact.equestrians_gloves": "S",
  "artifact.dragon_scale_shield": "S",
  "artifact.dragon_scale_armor": "S",
  "artifact.sword_of_hellfire": "S",
  "artifact.mystic_orb_of_mana": "S",
  "artifact.shackles_of_war": "S",
  "artifact.tunic_of_the_cyclops_king": "S",
  "artifact.helm_of_the_alabaster_unicorn": "S",
  "artifact.rib_cage": "S",
  "artifact.armor_of_wonder": "S",
  "artifact.charm_of_mana": "S",
  "artifact.scales_of_the_greater_basilisk": "S",
  "artifact.endless_sack_of_gold": "S",
  "artifact.endless_bag_of_gold": "S",
  "artifact.endless_purse_of_gold": "S",
  "artifact.everpouring_vial_of_mercury": "S",
  "artifact.inexhaustible_cart_of_lumber": "S",
  "artifact.inexhaustible_cart_of_ore": "S",
  "artifact.head_of_legion": "A",
  "artifact.arms_of_legion": "A",
  "artifact.torso_of_legion": "A",
  "artifact.loins_of_legion": "A",
  "artifact.legs_of_legion": "A",
  "artifact.titans_gladius": "A",
  "artifact.titans_cuirass": "A",
  "artifact.vial_of_lifeblood": "A",
  "artifact.sentinels_shield": "A",
  "artifact.breastplate_of_brimstone": "A",
  "artifact.crown_of_dragontooth": "A",
  "artifact.orb_of_vulnerability": "A",
  "artifact.glyph_of_gallantry": "A",
  "artifact.everflowing_crystal_cloak": "A",
  "artifact.crest_of_valor": "A",
  "artifact.ambassadors_sash": "A",
  "artifact.blackshard_of_the_dead_knight": "A",
  "artifact.ogres_club_of_havoc": "A",
  "artifact.red_dragon_flame_tongue": "A",
  "artifact.breastplate_of_petrified_wood": "A",
  "artifact.shield_of_the_yawning_dead": "A",
  "artifact.cape_of_velocity": "A",
  "artifact.orb_of_inhibition": "B",
  "artifact.hourglass_of_the_evil_hour": "B",
  "artifact.greater_gnolls_flail": "B",
  "artifact.buckler_of_the_gnoll_king": "B",
  "artifact.shield_of_the_dwarven_lords": "B",
  "artifact.targ_of_the_rampaging_ogre": "B",
  "artifact.shield_of_the_damned": "B",
  "artifact.recanters_cloak": "B",
  "artifact.spellbinders_hat": "B",
  "artifact.surcoat_of_counterpoise": "B",
  "artifact.cards_of_prophecy": "B",
  "artifact.golden_bow": "B",
  "artifact.centaurs_axe": "B",
  "artifact.dragon_wing_tabard": "B",
  "artifact.spirit_of_oppression": "B",
  "artifact.boots_of_polarity": "C",
  "artifact.ring_of_the_wayfarer": "C",
  "artifact.speculum": "C",
  "artifact.pendant_of_second_sight": "C",
  "artifact.sword_of_judgement": "D",

  // ---- Spells (thread 3285411; 41 entries, all mapped) ---------------------
  "spell.berserk": "S",
  "spell.dimension_door": "S",
  "spell.fly": "S",
  "spell.frenzy": "S",
  "spell.lightning_bolt": "S",
  "spell.magic_arrow": "S",
  "spell.resurrection": "S",
  "spell.town_portal": "S",
  "spell.teleport": "S",
  "spell.view_air": "S",
  "spell.view_earth": "S",
  "spell.bless": "A",
  "spell.blind": "A",
  "spell.bloodlust": "A",
  "spell.curse": "A",
  "spell.fire_wall": "A",
  "spell.fortune": "A",
  "spell.slow": "A",
  "spell.prayer": "A",
  "spell.shield": "A",
  "spell.stone_skin": "A",
  "spell.sorrow": "A",
  "spell.frost_ring": "A",
  "spell.weakness": "A",
  "spell.anti_magic": "B",
  "spell.cure": "B",
  "spell.dispel": "B",
  "spell.haste": "B",
  "spell.implosion": "B",
  "spell.mirth": "B",
  "spell.disrupting_ray": "B",
  "spell.chain_lightning": "C",
  "spell.counterstrike": "C",
  "spell.forgetfulness": "C",
  "spell.misfortune": "C",
  "spell.precision": "C",
  "spell.slayer": "C",
  "spell.visions": "C",
  "spell.earthquake": "D",
  "spell.inferno": "D",
  "spell.remove_obstacle": "D",

  // ---- Abilities (thread 3286664; 26 tiered entries, all mapped) -----------
  // ability.necromancy is deliberately ABSENT: the list gives it no letter tier
  // ("NECROMANCY: NECROPOLIS" + the deny advice) — cardTierValue prices it by
  // the Necropolis matchup instead.
  "ability.luck": "S",
  "ability.logistics": "S",
  "ability.leadership": "S",
  "ability.scholar": "S",
  "ability.offense": "S",
  "ability.sorcery": "S",
  "ability.armorer": "S",
  "ability.estates": "S",
  "ability.scouting": "S",
  "ability.air_magic": "S",
  "ability.earth_magic": "S",
  "ability.fire_magic": "S",
  "ability.water_magic": "S",
  "ability.pathfinding": "S",
  "ability.diplomacy": "A",
  "ability.mysticism": "A",
  "ability.intelligence": "A",
  "ability.wisdom": "A",
  "ability.learning": "B",
  "ability.archery": "B",
  "ability.resistance": "B",
  "ability.tactics": "C",
  "ability.artillery": "C",
  "ability.first_aid": "D",
  "ability.eagle_eye": "D",
  "ability.ballistics": "D",
};

/**
 * Hero tiers (thread 3307739; 28 entries, all mapped to heroDefIds). "Lord
 * Haart" appears twice on the list — the Castle Estates specialist is
 * `lord_haart`, the Necropolis Death Knight is `lord_haart_necropolis`.
 * Heroes the list predates (Stronghold/Cove/Factory/Conflux waves, the
 * Tarnums, Moandor, Cyra, Torosar …) are unmapped and keep the neutral
 * hash-only pick behavior.
 */
export const HERO_TIER: Record<string, CardValueTier> = {
  vidomina: "S",
  jeddite: "S",
  deemer: "S",
  fiona: "S",
  rashka: "S",
  josephine: "S",
  lord_haart_necropolis: "S",
  lord_haart: "S",
  sandro: "A",
  alamar: "A",
  solmyr: "A",
  adrienne: "A",
  gem: "A",
  rion: "A",
  catherine: "A",
  mephala: "A",
  tamika: "A",
  zydar: "B",
  iona: "B",
  dracon: "B",
  adelaide: "B",
  tazar: "B",
  gelu: "B",
  clancy: "B",
  xyron: "C",
  bron: "C",
  mutare: "C",
  wystan: "D",
};

/**
 * CHOOSE_FACTION bias: the hero tier compressed into a band small enough that
 * every biased pick stays strictly between ROLL_*_OPTIONS (990) and
 * CHOOSE_TOWN (1010) around the 1_000 foundation score. Equal-tier heroes stay
 * exact ties, so the seeded hash tie-break keeps repeated games varied.
 */
const HERO_PICK_BIAS: Record<CardValueTier, number> = {
  S: 8,
  A: 5,
  B: 2,
  C: 0,
  D: -3,
};

export function heroPickBias(heroDefId: string | undefined): number {
  if (!heroDefId) return 0;
  const tier = HERO_TIER[heroDefId];
  return tier ? HERO_PICK_BIAS[tier] : 0;
}

/**
 * Cards whose printed value exists ONLY against an enemy hero (the tier lists
 * price them for the legacy 1v1 game): Shackles of War ("prevents the opponent
 * from Surrendering"), Anti-Magic / Recanter's Cloak ("completely useless
 * outside Hero vs. Hero combat"), Dragon Wing Tabard (hand disruption),
 * Resistance ("only useful during Hero vs Hero fights"). While no live enemy
 * seat exists they keep only a sliver of the tier bonus.
 */
const PVP_ONLY_TIER_CARDS = new Set<string>([
  "artifact.shackles_of_war",
  "artifact.recanters_cloak",
  "artifact.dragon_wing_tabard",
  "spell.anti_magic",
  "ability.resistance",
]);

/**
 * Cards priced around the LEGACY ±1 morale-token economy. Under the optional
 * Morale-Cards rule the token disappears (morale draws cards instead), so the
 * token-denial reading loses its teeth: Spirit of Oppression's "no Morale
 * token" half and Hourglass of the Evil Hour's forced token use are both
 * devalued. Morale-GAIN cards (Glyph of Gallantry, Crest of Valor) are NOT
 * here — gaining morale stays strong (a card draw) with the rule on.
 */
const MORALE_TOKEN_ECONOMY_CARDS = new Set<string>([
  "artifact.spirit_of_oppression",
  "artifact.hourglass_of_the_evil_hour",
]);

const MORALE_CARDS_RULE_PENALTY = 10;

const NECROMANCY_CARD_ID = "ability.necromancy";
const WISDOM_CARD_ID = "ability.wisdom";
const NECROPOLIS_FACTION_ID = "necropolis";
const NEUTRAL_SEAT_ID = "neutrals";

/** Observable context the tier adjusters read. Built by `cardValueContext`. */
export type CardValueContext = {
  /** Another live (non-eliminated, non-neutral) seat exists on the table. */
  enemyHeroThreat: boolean;
  /** The Battlefield Morale-Cards optional rule is on for this game. */
  moraleCardsOn: boolean;
  /** This seat plays Necropolis itself. */
  ownNecropolis: boolean;
  /** Some live enemy seat plays Necropolis. */
  enemyNecropolis: boolean;
  /** This seat owns a town with a built Mage Guild. */
  mageGuildBuilt: boolean;
};

/**
 * Structural subset of GameState/PlayerVisibleState the context builder needs
 * — both satisfy it, so observation states plug in without casts.
 */
export type CardValueStateView = {
  players?: Record<
    string,
    { factionId?: string; eliminated?: boolean } | undefined
  > | null;
  towns?: Record<
    string,
    { controllerId?: string; buildings?: readonly string[] } | undefined
  > | null;
  adventure?: { moraleCards?: unknown } | null;
  sandboxRules?: { moraleCards?: boolean } | null;
};

export function cardValueContext(
  state: CardValueStateView,
  playerId: string,
): CardValueContext {
  const players = state.players ?? {};
  const self = players[playerId];
  let enemyHeroThreat = false;
  let enemyNecropolis = false;
  for (const [id, player] of Object.entries(players)) {
    if (!player || id === playerId || id === NEUTRAL_SEAT_ID) continue;
    if (player.eliminated) continue;
    enemyHeroThreat = true;
    if (player.factionId === NECROPOLIS_FACTION_ID) enemyNecropolis = true;
  }
  let mageGuildBuilt = false;
  for (const town of Object.values(state.towns ?? {})) {
    if (!town || town.controllerId !== playerId) continue;
    if (town.buildings?.some((id) => id.endsWith(".mage_guild"))) {
      mageGuildBuilt = true;
      break;
    }
  }
  return {
    enemyHeroThreat,
    moraleCardsOn: Boolean(
      state.adventure?.moraleCards ?? state.sandboxRules?.moraleCards,
    ),
    ownNecropolis: self?.factionId === NECROPOLIS_FACTION_ID,
    enemyNecropolis,
    mageGuildBuilt,
  };
}

/**
 * Tier contribution for one card: the printed tier score, bent by the live
 * context (the lists assume legacy rules — see the module comment). Unmapped
 * cards contribute 0, i.e. the caller's kind/family heuristic stands alone.
 * Without a context (map-less sandboxes, bare lookups) the printed tier is
 * used as-is.
 */
export function cardTierValue(
  cardId: string,
  context?: CardValueContext | null,
): number {
  // Necromancy has no printed letter tier — the list prices it by matchup:
  // integral to Necropolis itself; for everyone ELSE worth holding exactly
  // when a Necropolis enemy exists ("do not risk leaving it in the discard
  // pile; take it into your hand and Remove it") — the deny-pick.
  if (cardId === NECROMANCY_CARD_ID) {
    if (!context) return 0;
    if (context.ownNecropolis) return TIER_SCORE.S;
    if (context.enemyNecropolis) return TIER_SCORE.A;
    return TIER_SCORE.D;
  }
  const tier = CARD_TIER[cardId];
  if (!tier) return 0;
  let value = TIER_SCORE[tier];
  if (context) {
    if (PVP_ONLY_TIER_CARDS.has(cardId) && !context.enemyHeroThreat) {
      // No live enemy seat: the PvP payload is dead weight — keep a sliver.
      value = Math.round(value * 0.25);
    }
    if (context.moraleCardsOn && MORALE_TOKEN_ECONOMY_CARDS.has(cardId)) {
      value -= MORALE_CARDS_RULE_PENALTY;
    }
    if (cardId === WISDOM_CARD_ID && !context.mageGuildBuilt) {
      // The list's Alamar/Adelaide caveat: Wisdom is a dead card until a Mage
      // Guild exists — drop the A-tier bonus to C until one is built.
      value = TIER_SCORE.C;
    }
  }
  return value;
}

/** Printed tier lookup (no context), for coarse keep/sell splits. */
export function cardTier(cardId: string): CardValueTier | undefined {
  return CARD_TIER[cardId];
}

/**
 * Hygiene helper for the test: ids in the tier tables that do NOT resolve.
 * Exported so the test failure names the offending key directly.
 */
export function unknownCardTierIds(): string[] {
  return Object.keys(CARD_TIER).filter((cardId) => !cardLibrary[cardId]);
}
