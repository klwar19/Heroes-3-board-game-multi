"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { adminAction, adminListPlayers, fetchSession, type SelfProfile } from "@/lib/auth-client";
import { authEnabled } from "@/lib/auth-mode";

/**
 * Admin moderation panel (Phase 1). Gated twice: the client redirects a
 * non-admin away, and the /api/admin routes reject any non-admin request (the
 * server is the authority — the redirect is only UX). Ban / unban / delete /
 * promote each hit the API and refresh the roster.
 */
export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<SelfProfile | null>(null);
  const [players, setPlayers] = useState<SelfProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setPlayers(await adminListPlayers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players.");
    }
  }, []);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (!authEnabled()) {
      router.replace("/menu");
      return;
    }
    void fetchSession().then((profile) => {
      if (!profile) {
        router.replace("/login");
      } else if (profile.role !== "admin") {
        router.replace("/menu");
      } else {
        setMe(profile);
        void refresh();
      }
    });
  }, [refresh, router]);

  const act = async (action: "ban" | "unban" | "delete" | "setRole", target: SelfProfile) => {
    setError(null);
    try {
      if (action === "ban") {
        const reason = window.prompt(`Ban ${target.nickname} — reason (optional):`) ?? undefined;
        await adminAction("ban", target.id, { reason });
      } else if (action === "delete") {
        if (!window.confirm(`Delete ${target.nickname}? This cannot be undone.`)) {
          return;
        }
        await adminAction("delete", target.id);
      } else if (action === "setRole") {
        await adminAction("setRole", target.id, { role: target.role === "admin" ? "player" : "admin" });
      } else {
        await adminAction("unban", target.id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  };

  if (!me) {
    return (
      <MenuShell title="Admin">
        <p className="loadingStatus">Checking access…</p>
      </MenuShell>
    );
  }

  return (
    <MenuShell wide title="Admin — players" footer={<Link href="/menu">Back to menu</Link>}>
      {error ? <p className="authError">{error}</p> : null}
      <table className="adminTable">
        <thead>
          <tr>
            <th>Nickname</th>
            <th>Email</th>
            <th>Role</th>
            <th>MMR</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(players ?? []).map((p) => (
            <tr key={p.id} className={p.bannedAt ? "adminBanned" : undefined}>
              <td>{p.nickname}</td>
              <td>{p.email}</td>
              <td>{p.role}</td>
              <td>{p.mmr}</td>
              <td>{p.bannedAt ? `banned${p.banReason ? ` (${p.banReason})` : ""}` : "active"}</td>
              <td className="adminActions">
                {p.id === me.id ? (
                  <span className="authHint">you</span>
                ) : (
                  <>
                    {p.bannedAt ? (
                      <button className="authLink" onClick={() => act("unban", p)} type="button">
                        Unban
                      </button>
                    ) : (
                      <button className="authLink" onClick={() => act("ban", p)} type="button">
                        Ban
                      </button>
                    )}
                    <button className="authLink" onClick={() => act("setRole", p)} type="button">
                      {p.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button className="authLink danger" onClick={() => act("delete", p)} type="button">
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {players && players.length === 0 ? <p className="authHint">No accounts yet.</p> : null}
    </MenuShell>
  );
}
