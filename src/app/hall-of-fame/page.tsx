"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { authEnabled } from "@/lib/auth-mode";

type HallRow = { nickname: string; mmr: number; wins: number; losses: number; matches: number };

/**
 * Hall of Fame. In guest mode (accounts off) it honestly states nothing is
 * recorded. With accounts on it renders the live leaderboard from
 * /api/hall-of-fame (registered nicknames ranked WINS-first, then rating —
 * the server's order is rendered verbatim; see server/accounts/
 * leaderboard-order.ts). Note: automatic
 * match-result reporting from finished games is Phase 6 — until then rows exist
 * but only move when a result is recorded, so a fresh deployment shows the
 * roster at the 1200 starting rating rather than a fabricated ladder.
 */
export default function HallOfFamePage() {
  const [rows, setRows] = useState<HallRow[] | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !authEnabled()) {
      return;
    }
    started.current = true;
    void fetch("/api/hall-of-fame")
      .then((res) => res.json())
      .then((data: { players: HallRow[] }) => setRows(data.players ?? []))
      .catch(() => setRows([]));
  }, []);

  if (!authEnabled()) {
    return (
      <MenuShell title="Hall of Fame">
        <p className="loadingStatus">
          Nothing is recorded yet — today&apos;s tables are casual guest games with no accounts behind them.
        </p>
        <p className="loadingStatus">
          When player accounts are enabled, every registered nickname&apos;s wins, losses, matches and rating are ranked
          here, fed by server-reported match results.
        </p>
        <Link className="menuNavButton" href="/menu">
          Back to the menu
        </Link>
      </MenuShell>
    );
  }

  return (
    <MenuShell wide title="Hall of Fame" footer={<Link href="/menu">Back to menu</Link>}>
      {rows === null ? (
        <p className="loadingStatus">Loading rankings…</p>
      ) : rows.length === 0 ? (
        <p className="loadingStatus">No ranked players yet — be the first to register and win a locked table.</p>
      ) : (
        <table className="adminTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Nickname</th>
              <th>MMR</th>
              <th>W</th>
              <th>L</th>
              <th>Matches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.nickname}>
                <td>{index + 1}</td>
                <td>
                  {/* Every nickname opens the public player profile. */}
                  <Link className="hallOfFameName" href={`/players/${encodeURIComponent(row.nickname)}`}>
                    {row.nickname}
                  </Link>
                </td>
                <td>{row.mmr}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.matches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </MenuShell>
  );
}
