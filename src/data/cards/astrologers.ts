/**
 * Astrologers Proclaim cards. One card is drawn and resolved at the start of
 * every even-numbered round; it stays face up ("active") until the next
 * Astrologers round replaces it.
 *
 * Text transcribed from the fan wiki (https://en.homm3bg.wiki/astrologers_proclaim/),
 * rules cross-checked against the community rulebook rewrite
 * (https://github.com/qwrtln/Homm3BG-build-artifacts, main_en.pdf).
 *
 * Scope: the 19 Core Game proclamations plus the expansion cards whose effects
 * map cleanly onto existing engine systems and are wired + tested here
 * (Society, Big Cleanup, Blue Sky, Scorched Ground). The `effect` field is the
 * single source of truth for what the engine runs; `text` is the printed card
 * wording. Every card has a real card scan in `image`. Expansion proclamations
 * that would need new subsystems (PvP-attack bans, a generic Event deck,
 * defense->attack conversion, statistic-empowering, ...) are intentionally NOT
 * included rather than shipped as inert text — see ASTROLOGERS_NOT_IMPLEMENTED
 * below for the honest list.
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
  | { type: "NEUTRAL_DRAW_SWAP" };

/** Boxed set / expansion a proclamation ships in (provenance, shown in the UI). */
export type AstrologersExpansion =
  | "Core Game"
  | "Tower Expansion"
  | "Fortress Expansion";

export type AstrologersCardDefinition = {
  id: string;
  name: string;
  text: string;
  /** Effects that keep working until the next Astrologers round. */
  ongoing: boolean;
  effect: AstrologersEffect;
  /** Boxed set / expansion this card belongs to. */
  expansion: AstrologersExpansion;
  /** Local card scan (always present). */
  image: string;
  source: { product: string; credit: string; url: string };
};

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

export const astrologersDeckCardIds: string[] = Object.keys(astrologersCardDefinitions);

/**
 * Expansion proclamations that exist on the wiki but are deliberately NOT in the
 * deck: each would need an engine subsystem this game does not have yet, so
 * shipping them would mean inert text (forbidden by CLAUDE.md). Tracked here so
 * the omission is a conscious, reviewable decision rather than a silent gap.
 */
export const ASTROLOGERS_NOT_IMPLEMENTED: { name: string; expansion: string; needs: string }[] = [
  { name: "Ammo Cart", expansion: "Rampart", needs: "war-machine combat buffs (Ballista/First Aid Tent/Ammo Cart)" },
  { name: "Charlie and his Circus", expansion: "Rampart", needs: "multi-round neutral-unit recruitment offers" },
  { name: "Crag Hack", expansion: "Stronghold", needs: "first-combat ground-unit attack buff + free Goblin reinforce" },
  { name: "Dancing Imp", expansion: "Inferno", needs: "statistic -> empowered-statistic swap" },
  { name: "Destruction", expansion: "Stretch Goals", needs: "remove a permanent card in play for gold" },
  { name: "Disruption", expansion: "Stretch Goals", needs: "per-player free single-tile rotation flow" },
  { name: "Elementals", expansion: "Conflux", needs: "face-up Elemental units seeded onto neutral decks" },
  { name: "Explorers", expansion: "Inferno", needs: "skip-draw + discard-for-empowered-statistic economy" },
  { name: "Forty Thieves", expansion: "Fortress", needs: "a generic Event-card deck (does not exist)" },
  { name: "Hero", expansion: "Inferno", needs: "pay-to-empower a statistic card" },
  { name: "Judge Dread", expansion: "Stronghold", needs: "attacker redraws the whole neutral guard" },
  { name: "Mages", expansion: "Conflux", needs: "free Spell Book token use" },
  { name: "McGiver", expansion: "Rampart", needs: "free war-machine acquisition next round" },
  { name: "Multilingual Bron", expansion: "Stretch Goals", needs: "reroll of unit special-ability rolls" },
  { name: "Offense", expansion: "Stronghold", needs: "Defense cards acting as Attack" },
  { name: "Pirates", expansion: "Cove", needs: "post-combat-win Resource die reward" },
  { name: "Plane Between Planes", expansion: "Fortress", needs: "optional remove-from-hand/discard choice" },
  { name: "Plastic Tray", expansion: "Stronghold", needs: "defense-roll units skipping attack dice" },
  { name: "Restart", expansion: "Stretch Goals", needs: "forced hand reduction with player discard choice" },
  { name: "Rulebook", expansion: "Stretch Goals", needs: "neutral-combat difficulty reduction" },
  { name: "Sanctuary", expansion: "Stretch Goals", needs: "a PvP-attack ban for the round (does not exist)" },
  { name: "Spells", expansion: "Conflux", needs: "widened spell-deck search" },
  { name: "Unexpected Reinforcements", expansion: "Tower", needs: "free faction-unit recruit via neutral-deck search" },
  { name: "Wandering Merchant", expansion: "Stretch Goals", needs: "discounted war-machine purchase" },
  { name: "Whirlpool", expansion: "Cove", needs: "free whirlpool travel with exit choice" },
  { name: "Wind", expansion: "Cove", needs: "continued movement after entering a sea field" }
];
