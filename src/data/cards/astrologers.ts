/**
 * Astrologers Proclaim cards (Core Game). One card is drawn and resolved at
 * the start of every even-numbered round; it stays face up ("active") until
 * the next Astrologers round replaces it.
 *
 * Text transcribed from the fan wiki (https://en.homm3bg.wiki/astrologers_proclaim/),
 * rules cross-checked against the community rulebook rewrite
 * (https://github.com/qwrtln/Homm3BG-build-artifacts, main_en.pdf).
 */

export type AstrologersEffect =
  | { type: "NONE" }
  | { type: "GAIN_MORALE_ALL"; amount: number }
  | { type: "ROLL_DICE_ALL"; dice: "treasure" | "resource"; count: number }
  | { type: "REMOVE_BLACK_CUBES" }
  | { type: "NEXT_RESOURCE_ROUND"; gold?: number; valuables?: number }
  | { type: "MOVEMENT_MODIFIER"; amount: number }
  | { type: "HAND_LIMIT_MODIFIER"; amount: number }
  | { type: "RESHUFFLE_ARTIFACTS_SPELLS" }
  | { type: "PLAGUE_FLIP_ALL" }
  | { type: "REINFORCE_HALF_COST_ALL" }
  | { type: "DIE_REROLL_PER_TURN" }
  | { type: "FIRST_SPELL_POWER_BONUS"; amount: number }
  | { type: "FIRST_SPELL_RETURNS" }
  | { type: "NEUTRAL_DRAW_SWAP" };

export type AstrologersCardDefinition = {
  id: string;
  name: string;
  text: string;
  /** Effects that keep working until the next Astrologers round. */
  ongoing: boolean;
  effect: AstrologersEffect;
  source: { product: string; credit: string; url: string };
};

function source(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Core Game)",
    credit: "Card text from the fan wiki; resolution per the community rulebook rewrite.",
    url: `https://en.homm3bg.wiki/astrologers_proclaim/${slug}/`
  };
}

export const astrologersCardDefinitions: Record<string, AstrologersCardDefinition> = {
  "astrologers.annoying_lizard": {
    id: "astrologers.annoying_lizard",
    name: "Annoying Lizard",
    text: "Each player must shuffle all Artifact and Spell cards from their hand back into their deck and draw the same number of cards.",
    ongoing: false,
    effect: { type: "RESHUFFLE_ARTIFACTS_SPELLS" },
    source: source("annoying_lizard")
  },
  "astrologers.battalions_stallion": {
    id: "astrologers.battalions_stallion",
    name: "Battalion's Stallion",
    text: "Until the next Astrologers' round: each Hero gains +1 Movement.",
    ongoing: true,
    effect: { type: "MOVEMENT_MODIFIER", amount: 1 },
    source: source("battalions_stallion")
  },
  "astrologers.crazy_wizard": {
    id: "astrologers.crazy_wizard",
    name: "Crazy Wizard",
    text: "Until the next Astrologers' round: the first Spell card played by each player is returned to the player's hand instead of being discarded.",
    ongoing: true,
    effect: { type: "FIRST_SPELL_RETURNS" },
    source: source("crazy_wizard")
  },
  "astrologers.dead_silence": {
    id: "astrologers.dead_silence",
    name: "Dead Silence",
    text: "Nothing changes.",
    ongoing: false,
    effect: { type: "NONE" },
    source: source("dead_silence")
  },
  "astrologers.fancy_pixie": {
    id: "astrologers.fancy_pixie",
    name: "Fancy Pixie",
    text: "Each player immediately gains 1 positive morale.",
    ongoing: false,
    effect: { type: "GAIN_MORALE_ALL", amount: 1 },
    source: source("fancy_pixie")
  },
  "astrologers.fluffy_rabbit": {
    id: "astrologers.fluffy_rabbit",
    name: "Fluffy Rabbit",
    text: "Each player immediately rolls 1 Treasure die and gains the rolled bonus.",
    ongoing: false,
    effect: { type: "ROLL_DICE_ALL", dice: "treasure", count: 1 },
    source: source("fluffy_rabbit")
  },
  "astrologers.friendly_beaver": {
    id: "astrologers.friendly_beaver",
    name: "Friendly Beaver",
    text: "Immediately remove all Black Cubes from all locations on the map. (Drawn on the first Astrologers' round: discard it and draw another card.)",
    ongoing: false,
    effect: { type: "REMOVE_BLACK_CUBES" },
    source: source("friendly_beaver")
  },
  "astrologers.gold_dragon": {
    id: "astrologers.gold_dragon",
    name: "Gold Dragon",
    text: "At the beginning of the next Resource round, all players gain 5 gold.",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", gold: 5 },
    source: source("gold_dragon")
  },
  "astrologers.greedy_dragon": {
    id: "astrologers.greedy_dragon",
    name: "Greedy Dragon",
    text: "At the beginning of the next Resource round, all players gain 1 less valuables (minimum 0).",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", valuables: -1 },
    source: source("greedy_dragon")
  },
  "astrologers.grim_warlock": {
    id: "astrologers.grim_warlock",
    name: "Grim Warlock",
    text: "Until the next Astrologers' round: the first Spell card played in each player's turn gets +1 Power.",
    ongoing: true,
    effect: { type: "FIRST_SPELL_POWER_BONUS", amount: 1 },
    source: source("grim_warlock")
  },
  "astrologers.groovy_satyr": {
    id: "astrologers.groovy_satyr",
    name: "Groovy Satyr",
    text: "Until the next Astrologers' round: whenever you trigger Combat with Neutral Units, you may discard one drawn Neutral Unit card and draw another of the same tier instead.",
    ongoing: true,
    effect: { type: "NEUTRAL_DRAW_SWAP" },
    source: source("groovy_satyr")
  },
  "astrologers.isras_friends": {
    id: "astrologers.isras_friends",
    name: "Isra's Friends",
    text: "Each player can immediately reinforce a unit on the \"Few\" side at half the cost.",
    ongoing: false,
    effect: { type: "REINFORCE_HALF_COST_ALL" },
    source: source("isras_friends")
  },
  "astrologers.magic_tortoise": {
    id: "astrologers.magic_tortoise",
    name: "Magic Tortoise",
    text: "Until the next Astrologers' round: each Hero suffers -1 Movement.",
    ongoing: true,
    effect: { type: "MOVEMENT_MODIFIER", amount: -1 },
    source: source("magic_tortoise")
  },
  "astrologers.merry_leprechaun": {
    id: "astrologers.merry_leprechaun",
    name: "Merry Leprechaun",
    text: "At the beginning of the next Resource round, all players gain 1 valuables.",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", valuables: 1 },
    source: source("merry_leprechaun")
  },
  "astrologers.profuse_growth": {
    id: "astrologers.profuse_growth",
    name: "Profuse Growth",
    text: "Until the next Astrologers' round: your hand limit is increased by 1.",
    ongoing: true,
    effect: { type: "HAND_LIMIT_MODIFIER", amount: 1 },
    source: source("profuse_growth")
  },
  "astrologers.swift_weasel": {
    id: "astrologers.swift_weasel",
    name: "Swift Weasel",
    text: "Until the next Astrologers' round: once per turn, each player can reroll a Treasure die or a Resource die.",
    ongoing: true,
    effect: { type: "DIE_REROLL_PER_TURN" },
    source: source("swift_weasel")
  },
  "astrologers.terrible_plague": {
    id: "astrologers.terrible_plague",
    name: "Terrible Plague",
    text: "All players flip one of their units from the \"Pack\" to the \"Few\" side, if possible.",
    ongoing: false,
    effect: { type: "PLAGUE_FLIP_ALL" },
    source: source("terrible_plague")
  },
  "astrologers.white_raven": {
    id: "astrologers.white_raven",
    name: "White Raven",
    text: "Each player immediately rolls 1 Resource die and gains the rolled resources.",
    ongoing: false,
    effect: { type: "ROLL_DICE_ALL", dice: "resource", count: 1 },
    source: source("white_raven")
  },
  "astrologers.wild_debauchery": {
    id: "astrologers.wild_debauchery",
    name: "Wild Debauchery",
    text: "At the beginning of the next Resource round, all players gain 5 less gold (minimum 0).",
    ongoing: true,
    effect: { type: "NEXT_RESOURCE_ROUND", gold: -5 },
    source: source("wild_debauchery")
  }
};

export const astrologersDeckCardIds: string[] = Object.keys(astrologersCardDefinitions);
