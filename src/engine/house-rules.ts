import type { GameRuleset, GameState, GameSetupOptions, HouseRuleId } from "./state";

/**
 * Individual house-rule toggles (BINH). Historically the BINH tweaks were an
 * all-or-nothing bundle switched by `ruleset: "binh" | "legacy"`. This registry
 * lifts each tweak into its OWN on/off flag so a BINH table can mix-and-match:
 * keep the split decks but drop the Estates nerf, for example. Legacy remains
 * the strict all-house-rules-off rulebook mode.
 *
 * In BINH, an explicit per-rule flag overrides that rule's default. Legacy is a
 * hard rulebook mode: every house rule is OFF, regardless of stale or crafted
 * overrides. This also keeps old persisted rooms honest after the invariant was
 * introduced.
 *
 * The resolved booleans are frozen onto `adventure.houseRules` at setup so the
 * engine reads plain booleans during play; `houseRuleEnabled` falls back to the
 * mode default for legacy snapshots / the combat sandbox (no adventure state).
 *
 * IMPORTANT (CLAUDE.md #1): every id in this registry gates REAL engine
 * behaviour with a covering test that fails if the gate is removed. A toggle
 * that changes nothing is a decorative stub and must not live here — declare it
 * only once its wiring exists.
 */
export type { HouseRuleId };

export type HouseRuleCategory = "decks" | "units" | "abilities" | "combat";

export type HouseRuleDef = {
  id: HouseRuleId;
  label: string;
  description: string;
  category: HouseRuleCategory;
  /** Default when the rule has no explicit flag and the mode is "binh". */
  default: boolean;
  /** Default when the mode is "legacy" (all house rules off unless set). */
  legacyDefault?: boolean;
};

export const HOUSE_RULES: HouseRuleDef[] = [
  {
    id: "split-decks",
    label: "Split Spell/Artifact decks by tier",
    description:
      "On: Basic/Expert Spell decks and Minor/Major/Relic Artifact decks with level and map gating. Off: one combined Spell deck and one combined Artifact deck; Spells and Artifacts always remain separate families.",
    category: "decks",
    default: true
  },
  {
    id: "griffin-buff",
    label: "Griffin buff",
    description: "Few Griffins fight at 3 Attack (printed 2) and Pack Griffins at 1 Defense (printed 0).",
    category: "units",
    default: true
  },
  {
    id: "marksman-buff",
    label: "Marksman buff",
    description: "Pack Marksmen fight with 3 Health (printed 2).",
    category: "units",
    default: true
  },
  {
    id: "sandro-skeleton-hp",
    label: "Sandro skeleton Health",
    description: "Sandro's Horde and Legion of Skeletons fight with 3 Health instead of the printed 2.",
    category: "units",
    default: true
  },
  {
    id: "wisdom-expert-discount",
    label: "Wisdom expert discount",
    description: "Expert Wisdom reduces a Mage Guild spell purchase by 3 gold (printed 2). Basic stays −2.",
    category: "abilities",
    default: true
  },
  {
    id: "estates-nerf",
    label: "Estates nerf",
    description: "Estates gains 2 gold (basic) / 4 gold (expert) instead of the printed 3 / 6.",
    category: "abilities",
    default: true
  },
  {
    id: "gelu-sharpshooter-buff",
    label: "Gelu IV Sharpshooter buff",
    description: "A Sharpshooters recruited via Gelu's level-IV specialty permanently carries +1 Attack in every combat.",
    category: "abilities",
    default: true
  },
  {
    id: "dracon-few-magi-trade",
    label: "Dracon IV Few-of-Magi trade",
    description:
      "Dracon's Enchanters IV may also upgrade a Few of Magi into the Enchanters for 6 extra gold. Off: only the rulebook options remain — trade a Pack of Magi (free), or draw a card.",
    category: "abilities",
    default: true
  },
  {
    id: "combat-move-initiative",
    label: "Initiative buffs grant combat move",
    description:
      "Haste, Slow and the initiative-only hero specialties also shift a unit's Combat movement by ±1 (the Battlefield-Expansion rule). Off: they change only Initiative, not movement (the standard/wiki rule).",
    category: "combat",
    default: true
  },
  {
    id: "ballistics-buff",
    label: "Ballistics buff",
    description:
      "Ballistics can level the Arrow Tower on its basic side and adds an Expert bombard (pay 1 building material: 1 damage to a unit and an adjacent enemy). Off: levelling the Arrow Tower is the Expert side and there is no bombard (wiki).",
    category: "combat",
    default: true
  },
  {
    id: "pathfinding-expert",
    label: "Pathfinding expert crossing",
    description:
      "Expert Pathfinding also crosses the coastline (land↔sea) with no halt and steps between the Surface and Subterranean without a Gate. Off: Pathfinding grants only its basic map movement (no expert side).",
    category: "combat",
    default: true
  },
  {
    id: "vision-battle-swap",
    label: "Visions pre-battle guard swap",
    description:
      "Holding Visions lets the attacker cast it before a Neutral fight to swap out the drawn guards. Off: Visions is only the map-turn deck scry (wiki).",
    category: "combat",
    default: true
  },
  {
    id: "bank-empower-ability",
    label: "Creature-bank Empower reward",
    description:
      "Winning the Dragon Fly Hive or Griffin Conservatory also lets you Empower one owned Ability (its Expert side then costs no crown). Off: those banks grant only the unit (wiki).",
    category: "combat",
    default: true
  },
  {
    id: "bank-move-points",
    label: "Creature banks cost move points",
    description:
      "A Creature-Bank fight obeys the one-Round time limit and the spend-1-move-point-to-extend rule, like a normal neutral fight. Off: a bank has no Round limit and rolls straight on (rulebook).",
    category: "combat",
    default: true
  },
  {
    id: "defeat-gold-debt",
    label: "Defeat can push gold into debt",
    description:
      "The 5-gold penalty for losing a hero combat is paid in full even if it drops the loser below zero (into debt). Off: the loss is capped so gold never goes negative (the normal rule).",
    category: "combat",
    default: true
  },
  {
    id: "dragon-utopia-four-dragons",
    label: "Dragon Utopia: four dragons",
    description:
      "The Dragon Utopia (the Dragon Hunt / Dragon Conqueror objective) is guarded by four dragons — Azure, Rust, Crystal and Faerie. Off: the rulebook three — Azure, Crystal and Black.",
    category: "combat",
    default: true
  },
  {
    id: "dragon-utopia-by-difficulty",
    label: "Dragon Utopia: scale guards by difficulty",
    description:
      "The Dragon Utopia's guard COUNT follows the game difficulty — as many dragons as its Field Difficulty would draw as Neutral units (Easy 1 / Normal 2 / Hard 3 / Impossible 4). The always-present azure slot (Azure, Rust or Crystal, random each game) is always among them. Off: the full fixed party (the 3 or 4 dragons above).",
    category: "combat",
    default: true
  }
];

export const HOUSE_RULE_BY_ID: Record<HouseRuleId, HouseRuleDef> = HOUSE_RULES.reduce(
  (map, def) => {
    map[def.id] = def;
    return map;
  },
  {} as Record<HouseRuleId, HouseRuleDef>
);

export type HouseRuleFlags = Partial<Record<HouseRuleId, boolean>>;

/** The default value of `id` for a bare mode with no explicit flag set. */
export function houseRuleDefaultFor(ruleset: GameRuleset, id: HouseRuleId): boolean {
  const def = HOUSE_RULE_BY_ID[id];
  return ruleset === "binh" ? def.default : def.legacyDefault ?? false;
}

/**
 * Resolve every house rule to a concrete boolean for the chosen mode + explicit
 * toggles. Called once at setup; the result is frozen onto adventure state.
 */
export function resolveHouseRules(options: Pick<GameSetupOptions, "ruleset" | "houseRules">): Record<HouseRuleId, boolean> {
  const explicit = options.houseRules ?? {};
  const resolved = {} as Record<HouseRuleId, boolean>;
  for (const def of HOUSE_RULES) {
    resolved[def.id] =
      options.ruleset === "legacy" ? false : explicit[def.id] ?? houseRuleDefaultFor(options.ruleset, def.id);
  }
  return resolved;
}

/**
 * Whether house rule `id` is ON for this game. Reads the frozen
 * `adventure.houseRules` map when present (the authoritative in-play value),
 * else derives the mode default (combat sandbox / pre-adventure / legacy
 * snapshots that predate the field). Deliberately does NOT import from
 * `ruleset.ts` to keep the dependency one-way (ruleset.ts → house-rules.ts).
 */
export function houseRuleEnabled(state: Pick<GameState, "ruleset" | "adventure">, id: HouseRuleId): boolean {
  // Legacy is the strict rulebook preset. Ignore a stale frozen `true` from an
  // older room and never let a malformed client opt individual rules back in.
  if ((state.ruleset ?? "legacy") === "legacy") {
    return false;
  }
  const frozen = state.adventure?.houseRules;
  if (frozen && frozen[id] !== undefined) {
    return frozen[id]!;
  }
  return houseRuleDefaultFor(state.ruleset ?? "legacy", id);
}
