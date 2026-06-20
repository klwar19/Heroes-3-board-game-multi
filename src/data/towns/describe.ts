import type { TownBuildingDefinition } from "@/data/factions/types";

const TIER_LABELS: Record<string, string> = {
  bronze: "bronze (level 1–3)",
  silver: "silver (level 4–5)",
  gold: "golden (level 6–7)",
  azure: "azure"
};

/**
 * Human rules text for a town building, generated from its effect data so the
 * tooltip always matches what the engine actually does.
 */
export function describeBuildingEffect(building: TownBuildingDefinition): string {
  const effect = building.effect;
  if (!effect) {
    return "No special effect.";
  }

  switch (effect.type) {
    case "UNLOCK_RECRUIT_TIER":
      return `Unlocks recruiting your ${TIER_LABELS[effect.tier] ?? effect.tier} units with the Population token.`;
    case "UNLOCK_REINFORCE":
      return "Unlocks reinforcing units (flip Few cards to their Pack side). When your faction town is besieged, adds 3 Walls, 1 Gate and the Arrow Tower to the combat board.";
    case "MAGE_GUILD":
      return `When built: Search (2) the Spell deck twice. Afterwards, once per round (Spell Book token): pay ${building.spellBookCost ?? 5} gold to Search (2) the Spell deck.`;
    case "RESOURCE_ROUND_CHOICE":
      return `At the beginning of each Resource round, choose: ${effect.options.map((option) => option.label).join(" — OR — ")}.`;
    case "RESOURCE_ROUND_MORALE":
      return "At the beginning of each Resource round, gain a positive Morale token.";
    case "RESOURCE_ROUND_RESOURCE_DIE":
      return "At the beginning of each Resource round, roll 1 Resource die and gain the rolled resources.";
    case "ASTROLOGERS_HALF_GOLD_REINFORCE":
      return `At the beginning of each Astrologers' round, you may instantly reinforce one of your ${effect.tiers.join(" or ")} units for half of the gold cost.`;
    case "ASTROLOGERS_TAKE_STATISTIC":
      return "At the beginning of each Astrologers' round, you may take 1 Knowledge or 1 Power Statistic card from your discard pile to your hand.";
    case "TURN_START_NECROMANCY":
      return "At the beginning of your turn, choose one: search the Ability deck for a Necromancy card and put it in your hand, OR take 1 Specialty card from your discard pile to your hand.";
    case "TURN_START_PORTAL_SUMMON":
      return "At the beginning of your turn, you may draw 1 Neutral Unit card from a deck matching one of your built Dwellings and pay its printed cost to recruit it into your army.";
    case "TURN_START_MANA_VORTEX":
      return "At the beginning of your turn, you may discard 1 card from your hand to shuffle your discard pile back into your deck, then Search (3) from it.";
    case "COVER_OF_DARKNESS":
      return "Once per round, choose one: during your turn, discard up to 2 cards to draw that many cards, OR at the beginning of a combat with an enemy hero, discard 1 random card from the enemy's hand.";
    case "CASTLE_GATE":
      return `During your turn, choose one: pay ${effect.discardCost} gold to discard 1 random card from an opponent's hand, OR if your hero is in a town or settlement you control, move them to another town or settlement under your control.`;
    case "COMBAT_CUBES":
      return effect.spend === "spell-power"
        ? `When built and at the beginning of each ${effect.gainOn === "astrologers" ? "Astrologers'" : "Resource"} round, place a faction cube here (max ${effect.max}). During any combat, remove a cube while casting a spell to gain +1 Power (max 1 cube per spell).`
        : `When built and at the beginning of each ${effect.gainOn === "astrologers" ? "Astrologers'" : "Resource"} round, place a faction cube here (max ${effect.max}). During any combat, remove cubes for +1 attack or +1 defense per cube.`;
    case "HALL_OF_VALHALLA":
      return `Once per round during a combat, one of your units gains +${effect.amount} attack on a single attack (chosen while the attack is waiting to resolve).`;
    case "FREELANCERS_GUILD":
      return `Always on: each time you win against Neutral Units, gain ${effect.winGold} gold. When recruiting or reinforcing you may also pay the gold cost with building materials and valuables.`;
    case "ARTIFACT_SMITH":
      return `Once during your turn, choose one: pay ${effect.searchCost} gold to Search (2) the Artifact deck, OR remove an Artifact card from your hand to gain ${effect.sellGold} gold. Counts as an artifact source (hero level 4+ may search Major, 6+ Relic artifacts in BINH mode).`;
    case "ROUND_START_FREE_SPRITE":
      return "At the beginning of each round, you may recruit a Few of Sprites for free, or reinforce a Few of your Sprites to a Pack for free.";
    case "MAGIC_UNIVERSITY":
      return "At the beginning of your turn, choose a School of Magic, then discard cards from the top of your deck until you reveal a Spell of that school and take it to your hand.";
    case "NOT_IMPLEMENTED":
      return effect.note;
    default:
      return "No special effect.";
  }
}

/** Short timing tag shown on the tooltip ("Round start", "Your turn", …). */
export function buildingTimingLabel(building: TownBuildingDefinition): string | null {
  switch (building.effect?.type) {
    case "RESOURCE_ROUND_CHOICE":
    case "RESOURCE_ROUND_MORALE":
    case "RESOURCE_ROUND_RESOURCE_DIE":
      return "start of Resource rounds";
    case "ASTROLOGERS_HALF_GOLD_REINFORCE":
    case "ASTROLOGERS_TAKE_STATISTIC":
      return "start of Astrologers' rounds";
    case "TURN_START_NECROMANCY":
    case "TURN_START_PORTAL_SUMMON":
    case "TURN_START_MANA_VORTEX":
    case "MAGIC_UNIVERSITY":
      return "start of your turn";
    case "ROUND_START_FREE_SPRITE":
      return "start of each round";
    case "COVER_OF_DARKNESS":
    case "CASTLE_GATE":
    case "ARTIFACT_SMITH":
      return "during your turn";
    case "COMBAT_CUBES":
    case "HALL_OF_VALHALLA":
      return "during combat";
    case "FREELANCERS_GUILD":
      return "always on";
    case "MAGE_GUILD":
      return "town action";
    default:
      return null;
  }
}
