"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { resetPassword } from "@/lib/auth-client";

/**
 * Target of the password-reset email link (`/reset-password?token=…`). Reads the
 * token from the URL, takes a new password, and on success sends the user to
 * sign in. Works regardless of the auth flag (the link is only ever produced
 * when accounts are enabled).
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MenuShell backdrop="login-backdrop" title="Choose a new password">
      {done ? (
        <div className="authForm">
          <p className="authInfo">Your password has been reset.</p>
          <button className="menuNavButton" onClick={() => router.push("/login")} type="button">
            Go to sign in
          </button>
        </div>
      ) : !token ? (
        <p className="authError">This reset link is missing its token. Request a new link from the sign-in screen.</p>
      ) : (
        <form className="authForm" onSubmit={submit}>
          <label className="authField">
            <span>New password</span>
            <input autoComplete="new-password" minLength={8} onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
          </label>
          {error ? <p className="authError">{error}</p> : null}
          <button className="menuNavButton" disabled={busy} type="submit">
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </MenuShell>
  );
}
