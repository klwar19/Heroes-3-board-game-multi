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
    short: "−4 gold; round-2 army attrition",
    detail: "After Resource-round income, lose up to 4 gold without debt. In PvP, every living Fuyuki combat unit loses 1 HP at the start of combat round 2.",
    timing: "resource-round",
    mechanicTitle: "Command Seals",
    mechanicDetail:
      "Begin the campaign with 3 Command Seals, but spend at most one per combat: Compel gives the active unit +1 Attack for its activation, or Recall heals it up to 3. Medea deals fixed 2/3 damage and her 1-damage barrier works once per combat round. Saber Pack has base Defense 2 and gains +1 Defense against the first attack of each combat round only.",
    artImage: "/assets/anime/notices/fuyuki-grail-upkeep.webp"
  },
  {
    factionId: "azure_breeze",
    register: "wuxia",
    title: "Formation Exposure",
    short: "Enemy draws in rounds 1 and 3; no economy penalty",
    detail: "Azure Breeze has no Resource-round gold penalty. In PvP, the enemy draws exactly 1 card at the start of combat rounds 1 and 3 only.",
    timing: "combat-start",
    mechanicTitle: "Sect Qi (Sword Formation)",
    mechanicDetail:
      "Begin combat with 0 Sect Qi (Foundation cultivation may raise this to 1). Capacity 2; gain Qi at most once per round. Adjacent attacks or defenses spend 1 Qi for +1, with no Sword Array/Qi stacking. Jianxu's Seven-Star Array is +1 Attack and Mountain Guardian heals 1.",
    artImage: "/assets/anime/notices/azure-breeze-spirit-tithe.webp"
  },
  {
    factionId: "heavenly_demon",
    register: "wuxia",
    title: "Demonic Backlash",
    short: "One random unit loses 1 HP; no economy penalty",
    detail: "Heavenly Demon has no Resource-round gold penalty. At PvP combat start, one random living Heavenly Demon unit loses 1 HP. The enemy draws no penalty cards.",
    timing: "combat-start",
    mechanicTitle: "Blood Essence & Blood Frenzy",
    mechanicDetail:
      "Gain Blood Essence at most once per round; Shiyan generates exactly 1. Blood Frenzy spends Essence only in rounds 1–3, at most once per round and three times per combat (+1 Attack, or +2 at Demon Soul). Ghost King Few does not heal; Pack heals 1 on activation.",
    artImage: "/assets/anime/notices/heavenly-demon-blood-tribute.webp"
  },
  {
    factionId: "hidden_leaf",
    register: "anime",
    title: "Chakra Strain",
    short: "−1 hand limit on each Resource round",
    detail: "On each Resource round your effective hand limit drops by 1 (minimum 1) as your shinobi overextend, then returns to normal.",
    timing: "resource-round",
    mechanicTitle: "Shinobi Missions",
    mechanicDetail:
      "Field only your own shinobi — no Neutral units, and at most 2 Gold units per battle. Winning neutral battles earns Mission points and ranks (D→S) for bounty gold and promotion valuables.",
    artImage: "/assets/anime/notices/hidden-leaf-chakra-strain.webp"
  },
  {
    factionId: "mgq",
    register: "anime",
    title: "No Faction Penalty",
    short: "No recurring penalty",
    detail: "Monster Girl Quest currently has no faction penalty.",
    timing: "combat-start",
    mechanicTitle: "Four Spirits",
    mechanicDetail:
      "Your main hero contracts one elemental spirit — Sylph, Gnome, Undine or Salamander — and summons it into every battle without an additional faction cost.",
    artImage: "/assets/anime/notices/mgq-paradox-strain.webp"
  },
  {
    factionId: "little_busters",
    register: "anime",
    title: "School Contribution Fund",
    short: "−5 gold/−1 material; three paid enemy counters",
    detail: "−5 gold and −1 material each Resource round, paid after income without debt. In PvP, the enemy may pay 1 gold for each one-use counter: random discard, draw 1 card, or reduce the campus hero to half HP (remaining HP rounded up).",
    timing: "resource-round",
    mechanicTitle: "Campus Hero",
    mechanicDetail:
      "Your main hero fights on the battlefield as a unit and may retaliate normally. Hero level stats and grade bonuses remain separate, with no level-5 stat penalty. Masato can protect any adjacent ally, including Gold units and the hero, once per round. Mio Pack has Defense 2 and +1 Defense against only the first attack each round.",
    artImage: "/assets/anime/notices/little-busters-contribution-v2.webp"
  },
  {
    factionId: "azur_lane",
    register: "anime",
    title: "Fleet Maintenance",
    short: "1 unit takes 1 damage; enemy draws 1",
    detail: "At combat start, one random deployed Azur Lane army unit suffers 1 damage and the opposing player draws 1 card. Commanders and summons are exempt from the damage.",
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
