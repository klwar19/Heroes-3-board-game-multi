"use client";

import { RoomBrowser } from "@/components/room-browser";

/**
 * Battle Test front door: a shared lobby for combat-sandbox "arenas" — a place
 * to set up a battle and test it with (or against) other players. Reuses the
 * shared RoomBrowser filtered to combat-sandbox, so every arena is browsable,
 * joinable and shared exactly like a multiplayer table, and creating one opens a
 * combat sandbox instead of an adventure.
 */
export default function BattlePage() {
  return (
    <RoomBrowser
      mode="combat-sandbox"
      labels={{
        badgeNote: "Battle Test — set up and try a fight",
        title: "Battle Test Arenas",
        createLabel: "Create arena",
        emptyHint: "No arenas yet — create one to set up and test a battle.",
        backdrop: "menu-backdrop"
      }}
    />
  );
}
