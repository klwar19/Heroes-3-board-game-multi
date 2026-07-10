"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { authEnabled } from "@/lib/auth-mode";

type PublicPlayer = {
  nickname: string;
  mmr: number;
  wins: number;
  losses: number;
  matches: number;
  createdAt: string;
  contact: { discord?: string; facebook?: string; note?: string };
};

/**
 * Public player profile — any player (or guest) can look up a registered
 * nickname: rating, record, member-since and the owner's optional contact
 * fields. Linked from the Hall of Fame rows and from room member names.
 */
export default function PublicPlayerPage() {
  const params = useParams<{ nickname: string }>();
  const nickname = typeof params?.nickname === "string" ? decodeURIComponent(params.nickname) : "";
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !authEnabled() || !nickname) {
      return;
    }
    started.current = true;
    void fetch(`/api/players/${encodeURIComponent(nickname)}`)
      .then(async (res) => {
        if (!res.ok) {
          setStatus("missing");
          return;
        }
        const data = (await res.json()) as { player?: PublicPlayer };
        if (data.player) {
          setPlayer(data.player);
          setStatus("ready");
        } else {
          setStatus("missing");
        }
      })
      .catch(() => setStatus("missing"));
  }, [nickname]);

  if (!authEnabled()) {
    return (
      <MenuShell title="Player profile">
        <p className="loadingStatus">Player profiles need accounts, and this deployment runs in guest mode.</p>
        <Link className="menuNavButton" href="/menu">
          Back to the menu
        </Link>
      </MenuShell>
    );
  }

  return (
    <MenuShell title={nickname || "Player profile"} footer={<Link href="/hall-of-fame">Hall of Fame</Link>}>
      {status === "loading" ? (
        <p className="loadingStatus">Loading profile…</p>
      ) : status === "missing" || !player ? (
        <p className="loadingStatus">No registered player is called “{nickname}”.</p>
      ) : (
        <div className="authForm">
          <div className="authReadonly">
            <span>Rating</span>
            <strong>{player.mmr} MMR</strong>
          </div>
          <div className="authReadonly">
            <span>Record</span>
            <strong>
              {player.wins}W / {player.losses}L · {player.matches} match{player.matches === 1 ? "" : "es"}
              {player.matches > 0 ? ` · ${Math.round((player.wins / player.matches) * 100)}% wins` : ""}
            </strong>
          </div>
          <div className="authReadonly">
            <span>Member since</span>
            <strong>{new Date(player.createdAt).toLocaleDateString()}</strong>
          </div>
          {player.contact.discord ? (
            <div className="authReadonly">
              <span>Discord</span>
              <strong>{player.contact.discord}</strong>
            </div>
          ) : null}
          {player.contact.facebook ? (
            <div className="authReadonly">
              <span>Facebook</span>
              <strong>{player.contact.facebook}</strong>
            </div>
          ) : null}
          {player.contact.note ? (
            <div className="authReadonly">
              <span>Note</span>
              <strong>{player.contact.note}</strong>
            </div>
          ) : null}
        </div>
      )}
    </MenuShell>
  );
}
