"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AccountAuth } from "@/components/menu/account-auth";
import { MenuShell } from "@/components/menu/menu-shell";
import { authEnabled, GUEST_LOGIN_DISABLED } from "@/lib/auth-mode";
import { clearAccountIdentity, getDisplayName, setDisplayName, setGuestMode } from "@/lib/identity";

/**
 * Entry screen.
 *
 * With the accounts flag ON it shows real sign-in / registration (AccountAuth,
 * Phase 1) as the primary path. A clearly-secondary "Continue as guest" choice
 * normally sits beside it — but while `GUEST_LOGIN_DISABLED` is set guest login
 * is TEMPORARILY off, so that block is replaced by a short notice asking the
 * player to register or sign in. Account login is untouched either way.
 *
 * With the flag OFF — CI / e2e and any guest-only deployment — it is the guest
 * name screen, byte-for-byte as before accounts existed (guest is the only way
 * in there, so it is never disabled).
 */
export default function LoginPage() {
  if (authEnabled()) {
    return (
      <MenuShell backdrop="login-backdrop" title="Welcome to Erathia">
        <AccountAuth />
        {GUEST_LOGIN_DISABLED ? <GuestDisabledNotice /> : <GuestChoice />}
      </MenuShell>
    );
  }
  return <GuestLogin />;
}

/**
 * Shown in place of the guest bridge while guest login is temporarily disabled.
 * No entry point — the player must register or sign in above (account login is
 * unaffected). Kept beside <GuestChoice/> so restoring guests is a one-line flip
 * of GUEST_LOGIN_DISABLED.
 */
function GuestDisabledNotice() {
  return (
    <div className="guestChoice">
      <div className="guestChoiceDivider" role="separator" aria-label="or">
        <span>or</span>
      </div>
      <p className="guestChoiceHint">
        Guest login is temporarily disabled. Please register or sign in above to play.
      </p>
    </div>
  );
}

/** Read + prefill the stored display name (shared by both guest entry points). */
function useStoredName(): [string, (value: string) => void] {
  const [name, setName] = useState("");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = getDisplayName();
    if (stored) {
      setName(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return [name, setName];
}

function GuestLogin() {
  const router = useRouter();
  const [name, setName] = useStoredName();

  const continueAsGuest = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      setDisplayName(trimmed);
    }
    setGuestMode();
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

/**
 * The secondary guest option shown beneath the account card when accounts are
 * on. Continuing as guest clears any cached signed-in identity so the player is
 * a true guest (clientId + display name only), then forwards to the menu.
 */
function GuestChoice() {
  const router = useRouter();
  const [name, setName] = useStoredName();

  const continueAsGuest = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      setDisplayName(trimmed);
    }
    // A deliberate guest entry is not a signed-in session — drop any cached
    // account so the menu/rooms see a guest, not a stale nickname/role — and
    // record the guest choice so the login wall (menu) lets them through.
    clearAccountIdentity();
    setGuestMode();
    router.push("/menu");
  };

  return (
    <div className="guestChoice">
      <div className="guestChoiceDivider" role="separator" aria-label="or">
        <span>or</span>
      </div>
      <form className="guestChoiceForm" onSubmit={continueAsGuest}>
        <p className="guestChoiceHint">
          Just want to jump in? Play as a guest for now — you can create an account any time.
        </p>
        <input
          aria-label="Guest name other players will see"
          autoComplete="nickname"
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          placeholder="Guest name (e.g. Catherine)"
          suppressHydrationWarning
          value={name}
        />
        <button className="guestChoiceButton" type="submit">
          Continue as guest
        </button>
      </form>
    </div>
  );
}
