"use client";

import { RoomBrowser } from "@/components/room-browser";
import { UiModePrompt } from "@/components/table/ui-mode-prompt";

/**
 * Multiplayer front door: the room browser for ADVENTURE tables under the
 * Erathia server badge. Thin wrapper around the shared RoomBrowser (the sibling
 * Battle Test lobby at /battle reuses the same component for combat-sandbox
 * arenas). Joining navigates to /?room=… — the exact shared-link path every
 * room already supports, so the in-room machinery is untouched.
 */
export default function PlayPage() {
  return (
    <>
      {/* Ask the per-browser Computer/Phone layout question at the very start of
          the app flow (renders only while the preference is unset). */}
      <UiModePrompt />
      <RoomBrowser
        mode="adventure"
        tableMode="clash"
        labels={{
          badgeNote: "Adventure tables — browse or open your own",
          title: "Multiplayer Lobby",
          createLabel: "Create room",
          emptyHint: "No tables yet — create one above to get started.",
          backdrop: "lobby-backdrop"
        }}
      />
    </>
  );
}
