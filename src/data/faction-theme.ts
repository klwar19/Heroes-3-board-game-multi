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

export function factionVisualRegister(factionId: string | undefined): FactionVisualRegister {
  if (factionId === "fuyuki") {
    return "anime";
  }
  if (factionId === "azure_breeze") {
    return "wuxia";
  }
  return "classic";
}

export function factionUiLexicon(factionId: FactionId | string | undefined): FactionUiLexicon {
  const register = factionVisualRegister(factionId);
  return register === "anime" ? ANIME : register === "wuxia" ? WUXIA : CLASSIC;
}
