"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AccountAuth } from "@/components/menu/account-auth";
import { MenuShell } from "@/components/menu/menu-shell";
import { authEnabled } from "@/lib/auth-mode";
import { getDisplayName, setDisplayName } from "@/lib/identity";

/**
 * Entry screen. With the accounts flag ON it shows real sign-in / registration
 * (AccountAuth, Phase 1). With the flag OFF — every deployment today, and all
 * CI / e2e — it is the guest name screen: it writes the same localStorage
 * display name the rooms use and forwards to the menu, byte-for-byte as before
 * accounts existed.
 */
export default function LoginPage() {
  if (authEnabled()) {
    return (
      <MenuShell backdrop="login-backdrop" title="Welcome to Erathia">
        <AccountAuth />
      </MenuShell>
    );
  }
  return <GuestLogin />;
}

function GuestLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
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
