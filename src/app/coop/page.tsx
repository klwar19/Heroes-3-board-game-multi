"use client";

import { RoomBrowser } from "@/components/room-browser";
import { UiModePrompt } from "@/components/table/ui-mode-prompt";

/** Dedicated, unranked humans-vs-computers front door. */
export default function CoopPage() {
  return (
    <>
      <UiModePrompt />
      <RoomBrowser
        mode="adventure"
        tableMode="coop"
        labels={{
          badgeNote: "Co-op operations — allied heroes vs computer armies",
          title: "Co-op War Room",
          createLabel: "Open expedition",
          emptyHint: "No Co-op expeditions yet — rally your alliance above.",
          backdrop: "coop-backdrop"
        }}
      />
    </>
  );
}
