"use client";

import { useSyncExternalStore } from "react";
import { SpellBookModal } from "@/components/adventure/screen";

// Dev preview: the Spell Book grimoire with a spread of real stored Spells, so
// the painted book chrome (assets/ui/ornate/grimoire.webp) can be checked
// without walking a game to a Spell Book. Open /spell-book-preview with
// `npm run dev`. Casting is disabled here (no game behind it) — this page is
// visual QA only, exactly like /commander-preview and /specialty-preview.

const PREVIEW_SPELLS = [
  "spell.magic_arrow",
  "spell.fireball",
  "spell.lightning_bolt",
  "spell.haste",
  "spell.bless",
  "spell.stone_skin",
  "spell.counterstrike",
  "spell.town_portal"
];

const subscribeToBrowserMount = () => () => {};

export default function SpellBookPreviewPage() {
  // The Book portals to document.body, so it can only render after mount —
  // rendering it during hydration would mismatch the server's empty markup.
  const mounted = useSyncExternalStore(subscribeToBrowserMount, () => true, () => false);
  return (
    <main style={{ minHeight: "100vh", background: "#181410" }}>
      {mounted ? (
        <SpellBookModal cardIds={PREVIEW_SPELLS} castsByCard={new Map()} onCast={() => {}} onClose={() => {}} />
      ) : null}
    </main>
  );
}
