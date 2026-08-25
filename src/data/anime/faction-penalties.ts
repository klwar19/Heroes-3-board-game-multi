import type { FactionId } from "@/engine/state";

export type AnimeFactionPenaltyDefinition = {
  factionId: FactionId;
  title: string;
  short: string;
  detail: string;
  timing: "resource-round" | "combat-start";
  artImage?: string;
};

/**
 * One presentation/source-of-truth table for the seven custom anime/xianxia
 * towns. The engine functions use the same faction ids and numerical rules;
 * the game-start popup renders these exact explanations.
 */
export const ANIME_FACTION_PENALTIES: readonly AnimeFactionPenaltyDefinition[] = [
  {
    factionId: "fuyuki",
    title: "Otherworld Upkeep",
    short: "−4 gold each Resource round",
    detail: "After all Resource-round income is collected, lose up to 4 gold. This never creates debt.",
    timing: "resource-round"
  },
  {
    factionId: "azure_breeze",
    title: "World-Traversing Tribute",
    short: "−4 gold each Resource round",
    detail: "After all Resource-round income is collected, lose up to 4 gold. This never creates debt.",
    timing: "resource-round"
  },
  {
    factionId: "heavenly_demon",
    title: "Otherworld Blood Tribute",
    short: "−4 gold each Resource round",
    detail: "After all Resource-round income is collected, lose up to 4 gold. This never creates debt.",
    timing: "resource-round"
  },
  {
    factionId: "hidden_leaf",
    title: "Distant-World Supply Lines",
    short: "−1 hand limit each Resource round",
    detail: "Your effective hand limit permanently falls by 1 at every Resource round, to a minimum of 1.",
    timing: "resource-round"
  },
  {
    factionId: "mgq",
    title: "Dimensional Instability",
    short: "−1 hand limit each Resource round",
    detail: "Your effective hand limit permanently falls by 1 at every Resource round, to a minimum of 1.",
    timing: "resource-round"
  },
  {
    factionId: "little_busters",
    title: "School Contribution Fund",
    short: "−5 gold and −1 material each Resource round",
    detail: "After all Resource-round income, contribute up to 5 gold and 1 building material. No debt is created.",
    timing: "resource-round",
    artImage: "/assets/anime/notices/little-busters-contribution-v2.webp"
  },
  {
    factionId: "azur_lane",
    title: "Fleet Maintenance",
    short: "A random unit suffers 1 damage each combat",
    detail: "At combat start, one random deployed Azur Lane army unit suffers 1 damage. Commanders and summons are excluded.",
    timing: "combat-start",
    artImage: "/assets/anime/notices/azur-lane-maintenance.webp"
  }
] as const;

export function animeFactionPenalty(factionId: string | null | undefined): AnimeFactionPenaltyDefinition | undefined {
  return ANIME_FACTION_PENALTIES.find((entry) => entry.factionId === factionId);
}
