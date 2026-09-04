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
    case "ASTROLOGERS_FLAT_GOLD_REINFORCE":
      return `During each Astrologers' round, while Reinforcing units you may reduce one ${effect.tiers.join(" or ")} unit's reinforce cost by ${effect.discount} gold (minimum 0). Usable at any point of your turn that round; Reinforcing needs a Citadel.`;
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      return `At the beginning of each Resource round, you may Search (${effect.count}) your own discard pile and take 1 card to your hand.`;
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
      if (effect.trainingWinXp) {
        return `After each won combat, surviving deployed units gain +${effect.trainingWinXp} unit experience. If Unit Experience is off, gain ${effect.trainingWinGoldWhenXpOff ?? 0} gold instead.`;
      }
      return `Once per round during a combat, one of your units gains +${effect.amount} attack on a single attack (chosen while the attack is waiting to resolve).`;
    case "FREELANCERS_GUILD":
      return `Always on: each time you win against Neutral Units, gain ${effect.winGold} gold (2 with the BINH Freelancer's Guild bounty option). When recruiting or reinforcing, if you do not have enough gold, you may use building materials or valuables as gold at 1:1.`;
    case "ARTIFACT_SMITH":
      return `Once during your turn, choose one: pay ${effect.searchCost} gold to Search (2) the Artifact deck, OR remove an Artifact card from your hand to gain ${effect.sellGold} gold. Counts as an artifact source (hero level 4+ may search Major, 6+ Relic artifacts in BINH mode).`;
    case "ROUND_START_FREE_SPRITE":
      return "At the beginning of each round, you may recruit a Few of Sprites for free, or reinforce a Few of your Sprites to a Pack for free.";
    case "MAGIC_UNIVERSITY":
      return "Once per round during your turn (instead of buying spells normally), choose a School of Magic, then discard cards from the top of your deck until you reveal a Spell of that school and take it to your hand.";
    case "THIEVES_GUILD":
      return "Once during your turn, choose any one deck in the game (a shared deck, or any player's Might & Magic deck — your own or an opponent's), look at its top 2 cards, then put one of them on that deck's discard pile and the other back on top.";
    case "RUNE_ALTAR":
      return `Bulwark Runes: raises your maximum Rune Level to ${effect.levelCap}${
        effect.startingRunes > 0
          ? ` and starts each combat with ${effect.startingRunes} Rune${effect.startingRunes === 1 ? "" : "s"}`
          : ""
      }. Level 1 = +1 Attack, Level 2 = +3 Initiative, Level 3 = +1 Defense to all your units. Current house rule for earning Runes in battle: Attack +1, Retaliate +1, Defend +2.`;
    case "MGQ_SPIRIT_SHRINE":
      return "Outside combat, select one Spirit whose Contract building is built. That choice is snapshotted at combat setup and lasts for that combat.";
    case "MGQ_SPIRIT_CONTRACT": {
      const rules = {
        sylph: "+1 Initiative to your units in round 1",
        gnome: "Defense token to the main hero's units in round 1",
        undine: "-1 to the first incoming enemy attack",
        salamander: "+1 to your first declared attack"
      } as const;
      return `Unlocks ${effect.spirit[0].toUpperCase()}${effect.spirit.slice(1)} at the Spirit Shrine: ${rules[effect.spirit]}.`;
    }
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
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      return "start of Resource rounds";
    case "ASTROLOGERS_HALF_GOLD_REINFORCE":
    case "ASTROLOGERS_TAKE_STATISTIC":
      return "start of Astrologers' rounds";
    case "ASTROLOGERS_FLAT_GOLD_REINFORCE":
      // Not a round-start prompt: a whole-round entitlement spent whenever the
      // owner reinforces during their turn.
      return "any time during Astrologers' rounds";
    case "TURN_START_NECROMANCY":
    case "TURN_START_PORTAL_SUMMON":
    case "TURN_START_MANA_VORTEX":
      return "start of your turn";
    case "MAGIC_UNIVERSITY":
      return "during your turn";
    case "ROUND_START_FREE_SPRITE":
      return "start of each round";
    case "COVER_OF_DARKNESS":
    case "CASTLE_GATE":
    case "ARTIFACT_SMITH":
    case "THIEVES_GUILD":
      return "during your turn";
    case "COMBAT_CUBES":
      return "during combat";
    case "HALL_OF_VALHALLA":
      return building.effect.trainingWinXp ? "after won combat" : "during combat";
    case "RUNE_ALTAR":
      return "combat (Runes)";
    case "FREELANCERS_GUILD":
      return "always on";
    case "MAGE_GUILD":
      return "town action";
    case "MGQ_SPIRIT_SHRINE":
    case "MGQ_SPIRIT_CONTRACT":
      return "outside combat";
    default:
      return null;
  }
}
