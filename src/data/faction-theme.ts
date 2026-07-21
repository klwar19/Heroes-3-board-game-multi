import type { FactionId } from "@/data/factions/types";

/** Visual register shared by the hero, commander, army and town interfaces. */
export type FactionVisualRegister = "classic" | "anime" | "wuxia";

export type FactionUiLexicon = {
  register: FactionVisualRegister;
  grade: string;
  equipment: string;
  commanderEquipment: string;
  army: string;
  train: string;
  /** Title of the Unit Experience pop-up window (veterancy board). */
  experienceBoard: string;
};

const CLASSIC: FactionUiLexicon = {
  register: "classic",
  grade: "Hero Grade",
  equipment: "Hero Equipment",
  commanderEquipment: "Commander Artifacts",
  army: "Unit deck",
  train: "Drill",
  experienceBoard: "Unit Experience Board"
};

const ANIME: FactionUiLexicon = {
  register: "anime",
  grade: "Spirit Rank",
  equipment: "Mystic Loadout",
  commanderEquipment: "Command Relics",
  army: "Servant roster",
  train: "Field training",
  experienceBoard: "Servant Ascension Board"
};

const WUXIA: FactionUiLexicon = {
  register: "wuxia",
  grade: "Martial Path",
  equipment: "Spirit Arsenal",
  commanderEquipment: "Sacred Treasures",
  army: "Sect retinue",
  train: "Cultivate",
  experienceBoard: "Retinue Cultivation Board"
};

/**
 * Azur Lane Naval Base — a bespoke NAVAL lexicon over the shared "anime" VISUAL
 * register (so its CSS theme stays `theme-anime`, keeping `factionVisualRegister`
 * unchanged). Only the WORDS are naval-flavored; nothing here changes mechanics.
 * Special-cased in `factionUiLexicon` ahead of the register switch because it
 * shares the "anime" register with Fuyuki / Hidden Leaf, exactly like the §3.13
 * equipment lines and the bespoke "kansen" hero-grade register.
 */
const AZUR_LANE: FactionUiLexicon = {
  register: "anime",
  grade: "Fleet Rating",
  equipment: "Rigging & Gear",
  commanderEquipment: "Flagship Regalia",
  army: "Fleet roster",
  train: "Tactical drill",
  experienceBoard: "Fleet Training Board"
};

export function factionVisualRegister(factionId: string | undefined): FactionVisualRegister {
  if (factionId === "fuyuki" || factionId === "hidden_leaf" || factionId === "azur_lane") {
    return "anime";
  }
  if (factionId === "azure_breeze") {
    return "wuxia";
  }
  return "classic";
}

export function factionUiLexicon(factionId: FactionId | string | undefined): FactionUiLexicon {
  // Bespoke faction lexicon FIRST: Azur Lane keeps the "anime" visual register
  // but wears naval words (mirrors the bespoke "kansen" grade register). A
  // faction not special-cased here falls through to its register's lexicon.
  if (factionId === "azur_lane") {
    return AZUR_LANE;
  }
  const register = factionVisualRegister(factionId);
  return register === "anime" ? ANIME : register === "wuxia" ? WUXIA : CLASSIC;
}
