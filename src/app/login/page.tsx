"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { authEnabled } from "@/lib/auth-mode";
import { getDisplayName, setDisplayName } from "@/lib/identity";

/**
 * Entry screen (expansion plan Phase 0). In guest mode (no Supabase env —
 * every deployment today) this is the name screen: it writes the same
 * localStorage display name the rooms already use and forwards to the menu.
 * Real account sign-in/registration replaces the guest form in Phase 1,
 * keyed off authEnabled(); until then the flag-on branch says so honestly
 * instead of rendering a dead login form.
 */
export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  // Prefill from storage after mount (SSR-safe hydration, same pattern as
  // src/app/page.tsx).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = getDisplayName();
    if (stored) {
      setName(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const continueAsGuest = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      setDisplayName(trimmed);
    }
    router.push("/menu");
  };

  return (
    <MenuShell backdrop="login-backdrop" title="Welcome, traveller">
      {authEnabled() ? (
        <p className="loadingStatus">
          Account sign-in is not built yet (it arrives with the accounts phase of the expansion plan) — continue as a
          guest below.
        </p>
      ) : null}
      <form className="menuNav" onSubmit={continueAsGuest}>
        <label className="loadingStatus" htmlFor="guestName">
          Choose the name other players will see
        </label>
        <input
          autoComplete="nickname"
          id="guestName"
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Catherine"
          suppressHydrationWarning
          value={name}
        />
        <button className="menuNavButton" type="submit">
          Continue as guest
        </button>
      </form>
    </MenuShell>
  );
}
