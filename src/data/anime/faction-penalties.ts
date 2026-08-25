import type { FactionId } from "@/engine/state";

export type AnimeFactionPenaltyDefinition = {
  factionId: FactionId;
  /** Visual register the briefing accents itself with (gold vs jade). */
  register: "anime" | "wuxia";
  /**
   * Themed name of this town's recurring penalty. This string is ALSO the prefix
   * of the engine `EVENT_NOTE` it emits (see `src/engine/anime-faction-penalties.ts`),
   * so the per-trigger notice popup can match the event to this faction. ONE source
   * of truth — never hard-code the prefix anywhere else.
   */
  title: string;
  short: string;
  detail: string;
  timing: "resource-round" | "combat-start";
  /** The signature POSITIVE mechanic that defines how this town plays. */
  mechanicTitle: string;
  mechanicDetail: string;
  /** Themed art — the briefing hero image AND the penalty-notice background. */
  artImage: string;
};

/**
 * One presentation source-of-truth table for the seven custom anime/xianxia
 * towns. Each entry is EXPLAINED PER TOWN — its own signature mechanic and its
 * own themed penalty — never grouped: the game-start briefing renders only the
 * viewer's own town, and the engine emits `${title} — …` for that town's penalty.
 *
 * Every `mechanicDetail` describes a REAL, engine-wired rule (Command Seals,
 * Hidden Leaf mission ranks + shinobi-only formation, MGQ Four Spirits, the
 * Little Busters battlefield hero, etc.) — it is reference text, not flavour.
 */
export const ANIME_FACTION_PENALTIES: readonly AnimeFactionPenaltyDefinition[] = [
  {
    factionId: "fuyuki",
    register: "anime",
    title: "Grail War Upkeep",
    short: "−4 gold each Resource round",
    detail: "After all Resource-round income, lose up to 4 gold sustaining your magecraft. This never creates debt.",
    timing: "resource-round",
    mechanicTitle: "Command Seals",
    mechanicDetail:
      "Begin with 3 Command Seals. Once per combat, spend one — Compel to give a unit +1 Attack, or Recall to heal a unit 3.",
    artImage: "/assets/anime/notices/fuyuki-grail-upkeep.webp"
  },
  {
    factionId: "azure_breeze",
    register: "wuxia",
    title: "Spirit Stone Tithe",
    short: "−4 gold each Resource round",
    detail: "After all Resource-round income, the sect tithes up to 4 gold in spirit stones. This never creates debt.",
    timing: "resource-round",
    mechanicTitle: "Sword Formation",
    mechanicDetail:
      "A wuxia sword sect: the Sword Array grants adjacent allies +1 Attack, and flowing footwork ignores adjacency combat penalties.",
    artImage: "/assets/anime/notices/azure-breeze-spirit-tithe.webp"
  },
  {
    factionId: "heavenly_demon",
    register: "wuxia",
    title: "Demonic Cult Tribute",
    short: "−4 gold each Resource round",
    detail: "After all Resource-round income, the cult levies up to 4 gold in tribute. This never creates debt.",
    timing: "resource-round",
    mechanicTitle: "Demonic Arts",
    mechanicDetail:
      "Blood Siphon heals your units after an attack that deals damage, and Reap grants a stacking Attack bonus whenever an adjacent unit is removed.",
    artImage: "/assets/anime/notices/heavenly-demon-blood-tribute.webp"
  },
  {
    factionId: "hidden_leaf",
    register: "anime",
    title: "Chakra Strain",
    short: "−1 hand limit each Resource round",
    detail: "Every Resource round your effective hand limit permanently falls by 1 (minimum 1) as your shinobi overextend.",
    timing: "resource-round",
    mechanicTitle: "Shinobi Missions",
    mechanicDetail:
      "Field only your own shinobi — no Neutral units, and at most 2 Gold units per battle. Winning neutral battles earns Mission points and ranks (D→S) for bounty gold and promotion valuables.",
    artImage: "/assets/anime/notices/hidden-leaf-chakra-strain.webp"
  },
  {
    factionId: "mgq",
    register: "anime",
    title: "Paradox Strain",
    short: "−1 hand limit each Resource round",
    detail: "Every Resource round the paradox strains your mind: your effective hand limit permanently falls by 1 (minimum 1).",
    timing: "resource-round",
    mechanicTitle: "Four Spirits",
    mechanicDetail:
      "Your main hero contracts one elemental spirit — Sylph, Gnome, Undine or Salamander — and summons it into every battle. In return, discard 1 card before you deploy.",
    artImage: "/assets/anime/notices/mgq-paradox-strain.webp"
  },
  {
    factionId: "little_busters",
    register: "anime",
    title: "School Contribution Fund",
    short: "−5 gold and −1 material each Resource round",
    detail: "After all Resource-round income, contribute up to 5 gold and 1 building material to the school festival. No debt is created.",
    timing: "resource-round",
    mechanicTitle: "Campus Hero",
    mechanicDetail:
      "Your main hero fights on the battlefield as a unit, growing stronger with its Seishun grade (+Health, +Initiative, +Attack).",
    artImage: "/assets/anime/notices/little-busters-contribution-v2.webp"
  },
  {
    factionId: "azur_lane",
    register: "anime",
    title: "Fleet Maintenance",
    short: "1 unit takes 1 damage each combat",
    detail: "At combat start, one random deployed Azur Lane army unit suffers 1 damage. Commanders and summons are exempt.",
    timing: "combat-start",
    mechanicTitle: "Fleet Tactics",
    mechanicDetail:
      "Your Kansen fight as a fleet — Fleet Formation gives adjacent allies +1 Attack, Full Barrage splashes enemies around your target, and Enterprise's Lucky E rerolls her dice.",
    artImage: "/assets/anime/notices/azur-lane-maintenance.webp"
  }
] as const;

export function animeFactionPenalty(factionId: string | null | undefined): AnimeFactionPenaltyDefinition | undefined {
  return ANIME_FACTION_PENALTIES.find((entry) => entry.factionId === factionId);
}

/** The themed prefix of the engine `EVENT_NOTE` this faction's penalty emits. */
export function animeFactionPenaltyTitle(factionId: string | null | undefined): string | undefined {
  return animeFactionPenalty(factionId)?.title;
}
