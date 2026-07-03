"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AuthClientError,
  checkAvailability,
  fetchSession,
  login,
  register,
  requestReset,
  resendConfirmation
} from "@/lib/auth-client";

/**
 * The signed-in-accounts entry screen (expansion plan Phase 1), rendered by
 * /login when the accounts feature flag is on. Guest mode keeps its own form —
 * this component is never mounted with the flag off, so the existing guest
 * tests are untouched.
 *
 * Three modes: Sign in / Register / Forgot password. Every server error is
 * shown with its specific message (the store distinguishes "nickname taken"
 * from "email already registered", the owner's requirement).
 */
type Mode = "signin" | "register" | "forgot";

export function AccountAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [banner, setBanner] = useState<string | null>(null);
  const checkedSession = useRef(false);

  // Surface the confirmation redirect + short-circuit if already signed in.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (checkedSession.current) {
      return;
    }
    checkedSession.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirmed") === "1") {
      setBanner("Email confirmed — you can sign in now.");
    } else if (params.get("confirm_error")) {
      setBanner("That confirmation link is invalid or expired. Sign in to request a new one.");
    }
    void fetchSession().then((profile) => {
      if (profile) {
        router.replace("/menu");
      }
    });
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="authCard">
      <div className="authTabs" role="tablist">
        <button
          aria-selected={mode === "signin"}
          className={`authTab${mode === "signin" ? " active" : ""}`}
          onClick={() => setMode("signin")}
          role="tab"
          type="button"
        >
          Sign in
        </button>
        <button
          aria-selected={mode === "register"}
          className={`authTab${mode === "register" ? " active" : ""}`}
          onClick={() => setMode("register")}
          role="tab"
          type="button"
        >
          Register
        </button>
      </div>

      {banner ? <p className="authInfo">{banner}</p> : null}

      {mode === "signin" ? (
        <SignInForm onForgot={() => setMode("forgot")} onDone={() => router.push("/menu")} />
      ) : mode === "register" ? (
        <RegisterForm onRegistered={() => setMode("signin")} onSignedIn={() => router.push("/menu")} />
      ) : (
        <ForgotForm onBack={() => setMode("signin")} />
      )}
    </div>
  );
}

function SignInForm({ onForgot, onDone }: { onForgot: () => void; onDone: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNeedsConfirm(null);
    setBusy(true);
    try {
      await login({ identifier: identifier.trim(), password });
      onDone();
    } catch (err) {
      if (err instanceof AuthClientError && err.code === "EMAIL_NOT_CONFIRMED") {
        setNeedsConfirm(identifier.includes("@") ? identifier.trim() : "");
      }
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="authForm" onSubmit={submit}>
      <label className="authField">
        <span>Nickname or email</span>
        <input autoComplete="username" onChange={(e) => setIdentifier(e.target.value)} required value={identifier} />
      </label>
      <label className="authField">
        <span>Password</span>
        <input
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="authError">{error}</p> : null}
      {needsConfirm !== null ? (
        <ResendConfirm defaultEmail={needsConfirm} />
      ) : null}
      <button className="menuNavButton" disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="authLinkRow">
        <button className="authLink" onClick={onForgot} type="button">
          Forgot password?
        </button>
      </div>
    </form>
  );
}

function ResendConfirm({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  return (
    <div className="authHint">
      <p>Your email is not confirmed yet.</p>
      <div className="authInlineRow">
        <input
          aria-label="Email for confirmation resend"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
        <button
          className="authLink"
          onClick={async () => {
            await resendConfirmation(email.trim());
            setSent(true);
          }}
          type="button"
        >
          Resend link
        </button>
      </div>
      {sent ? <p className="authInfo">If that email is registered and unconfirmed, a new link is on its way.</p> : null}
    </div>
  );
}

function RegisterForm({ onRegistered, onSignedIn }: { onRegistered: () => void; onSignedIn: () => void }) {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [discord, setDiscord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{ nickname?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ devLink?: string; ready?: boolean } | null>(null);

  const probe = async (field: "nickname" | "email", value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    try {
      const result = await checkAvailability({ [field]: trimmed });
      const info = result[field];
      if (info && !info.available) {
        setAvailability((prev) => ({ ...prev, [field]: field === "nickname" ? "That nickname is taken." : "That email is already registered." }));
      } else {
        setAvailability((prev) => ({ ...prev, [field]: undefined }));
      }
    } catch {
      /* availability is best-effort feedback; the submit is the authority */
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await register({
        nickname: nickname.trim(),
        email: email.trim(),
        password,
        contact: discord.trim() ? { discord: discord.trim() } : undefined
      });
      if (!result.needsConfirmation) {
        // This server auto-confirms new accounts (no mail transport configured)
        // — sign the player straight in rather than pointing at an inbox that
        // will never receive anything.
        try {
          await login({ identifier: nickname.trim(), password });
          onSignedIn();
        } catch {
          // The account exists but the immediate sign-in hiccuped — hand the
          // player to the sign-in form instead of a dead "check your inbox".
          setDone({ ready: true });
        }
        return;
      }
      setDone({ devLink: result.devConfirmLink });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="authForm">
        {done.ready ? (
          <p className="authInfo">Your account is ready — sign in with your new nickname and password.</p>
        ) : (
          <>
            <p className="authInfo">Check your inbox — we sent a confirmation link to {email.trim()}.</p>
            <p className="authHint">Open the link to activate your account, then sign in.</p>
            {done.devLink ? (
              <p className="authHint">
                Dev mode: <a href={done.devLink}>confirm now</a>
              </p>
            ) : null}
          </>
        )}
        <button className="menuNavButton" onClick={onRegistered} type="button">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="authForm" onSubmit={submit}>
      <label className="authField">
        <span>Nickname</span>
        <input
          autoComplete="nickname"
          maxLength={20}
          onBlur={(e) => probe("nickname", e.target.value)}
          onChange={(e) => setNickname(e.target.value)}
          required
          value={nickname}
        />
        {availability.nickname ? <em className="authFieldError">{availability.nickname}</em> : null}
      </label>
      <label className="authField">
        <span>Email</span>
        <input
          autoComplete="email"
          onBlur={(e) => probe("email", e.target.value)}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          value={email}
        />
        {availability.email ? <em className="authFieldError">{availability.email}</em> : null}
      </label>
      <label className="authField">
        <span>Password</span>
        <input autoComplete="new-password" minLength={8} onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
      </label>
      <label className="authField">
        <span>Discord (optional — so other players can reach you)</span>
        <input autoComplete="off" onChange={(e) => setDiscord(e.target.value)} placeholder="name#0000" value={discord} />
      </label>
      {error ? <p className="authError">{error}</p> : null}
      <button className="menuNavButton" disabled={busy} type="submit">
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await requestReset(email.trim());
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="authForm" onSubmit={submit}>
      <p className="authHint">Enter your account email and we&apos;ll send a reset link.</p>
      <label className="authField">
        <span>Email</span>
        <input autoComplete="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
      </label>
      {sent ? <p className="authInfo">If that email is registered, a reset link is on its way.</p> : null}
      <button className="menuNavButton" disabled={busy} type="submit">
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <div className="authLinkRow">
        <button className="authLink" onClick={onBack} type="button">
          Back to sign in
        </button>
      </div>
    </form>
  );
}
