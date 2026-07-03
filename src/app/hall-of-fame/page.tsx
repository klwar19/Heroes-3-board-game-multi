"use client";

import Link from "next/link";
import { MenuShell } from "@/components/menu/menu-shell";

/**
 * Hall of Fame placeholder (expansion plan Phase 0). The real ranking table
 * needs accounts + server-reported match results (Phases 1/2/6); shipping a
 * fake table would violate the "no decorative features" rule, so this page
 * says exactly what will live here and what exists today: nothing recorded.
 */
export default function HallOfFamePage() {
  return (
    <MenuShell title="Hall of Fame">
      <p className="loadingStatus">
        Nothing is recorded yet — today&apos;s tables are casual guest games with no accounts behind them.
      </p>
      <p className="loadingStatus">
        When player accounts land (expansion plan, Phases 1–6), every registered nickname&apos;s wins, losses, matches
        and rating will be ranked here, fed by server-reported match results.
      </p>
      <Link className="menuNavButton" href="/menu">
        Back to the menu
      </Link>
    </MenuShell>
  );
}
