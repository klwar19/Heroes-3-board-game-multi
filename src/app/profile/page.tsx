"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { fetchSession, updateContact, type SelfProfile } from "@/lib/auth-client";
import { authEnabled } from "@/lib/auth-mode";

/**
 * Account profile editor (Phase 1): nickname + email are read-only; the contact
 * fields (Discord / Facebook / note — "so other players can reach you") are
 * editable. Requires a session; redirects to /login when signed out.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) {
      return;
    }
    loadedOnce.current = true;
    if (!authEnabled()) {
      router.replace("/menu");
      return;
    }
    void fetchSession().then((p) => {
      if (!p) {
        router.replace("/login");
        return;
      }
      setProfile(p);
      setLoaded(true);
    });
  }, [router]);

  if (!loaded || !profile) {
    return (
      <MenuShell title="Your profile">
        <p className="loadingStatus">Loading…</p>
      </MenuShell>
    );
  }

  return (
    <MenuShell title="Your profile" footer={<Link href="/menu">Back to menu</Link>}>
      <ProfileForm profile={profile} onSaved={setProfile} />
    </MenuShell>
  );
}

function ProfileForm({ profile, onSaved }: { profile: SelfProfile; onSaved: (p: SelfProfile) => void }) {
  const [discord, setDiscord] = useState(profile.contact.discord ?? "");
  const [facebook, setFacebook] = useState(profile.contact.facebook ?? "");
  const [note, setNote] = useState(profile.contact.note ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateContact({
        discord: discord.trim() || undefined,
        facebook: facebook.trim() || undefined,
        note: note.trim() || undefined
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="authForm" onSubmit={submit}>
      <div className="authReadonly">
        <span>Nickname</span>
        <strong>
          {profile.nickname}
          {profile.role === "admin" ? <em className="authRoleTag"> admin</em> : null}
        </strong>
      </div>
      <div className="authReadonly">
        <span>Email</span>
        <strong>{profile.email}</strong>
      </div>
      <div className="authReadonly">
        <span>Rating</span>
        <strong>
          {profile.mmr} MMR · {profile.wins}W / {profile.losses}L
        </strong>
      </div>
      <label className="authField">
        <span>Discord</span>
        <input onChange={(e) => setDiscord(e.target.value)} placeholder="name#0000" value={discord} />
      </label>
      <label className="authField">
        <span>Facebook</span>
        <input onChange={(e) => setFacebook(e.target.value)} value={facebook} />
      </label>
      <label className="authField">
        <span>Note</span>
        <input onChange={(e) => setNote(e.target.value)} placeholder="Anything else players should know" value={note} />
      </label>
      {error ? <p className="authError">{error}</p> : null}
      {saved ? <p className="authInfo">Saved.</p> : null}
      <button className="menuNavButton" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save contact details"}
      </button>
    </form>
  );
}
