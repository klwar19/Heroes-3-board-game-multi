"use client";

import { RoomBrowser } from "@/components/room-browser";

/**
 * Battle Test front door: a shared lobby for combat-sandbox "arenas" — free
 * setup of factions, units, cards, battlefield, morale and WOG commanders,
 * then Begin to fight. Reuses the shared RoomBrowser filtered to combat-sandbox
 * so every arena is browsable and joinable like a multiplayer table.
 */
export default function BattlePage() {
  return (
    <RoomBrowser
      mode="combat-sandbox"
      labels={{
        badgeNote: "Battle Test — free army setup, then fight",
        title: "Battle Test Arenas",
        createLabel: "Create arena",
        emptyHint: "No arenas yet — create one to pick factions, units and cards, then begin.",
        backdrop: "menu-backdrop"
      }}
    />
  );
}
