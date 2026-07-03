"use client";

/**
 * Browser-side wrappers over the /api/auth + /api/admin routes. Each returns
 * parsed data or throws an `AuthClientError` carrying the server's error code
 * so the UI can branch to the specific, owner-required messages ("nickname
 * taken" vs "email already registered"). On login/session the non-secret
 * profile is mirrored into the identity cache (identity.ts) for instant UI; the
 * real session stays in the httpOnly cookie the fetch calls carry automatically.
 */
import { clearAccountIdentity, setAccountIdentity } from "@/lib/identity";
import type { AccountContact, AccountProfile, SelfProfile } from "@/server/accounts/types";

export type { AccountContact, AccountProfile, SelfProfile };

export class AuthClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthClientError";
    this.code = code;
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  return handle<T>(res);
}

async function handle<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string };
    throw new AuthClientError(err.error ?? "INTERNAL", err.message ?? "Request failed.");
  }
  return data as T;
}

function cacheProfile(profile: SelfProfile | AccountProfile): void {
  setAccountIdentity({ userId: profile.id, nickname: profile.nickname, role: profile.role });
}

export async function register(input: {
  nickname: string;
  email: string;
  password: string;
  contact?: AccountContact;
}): Promise<{ profile: SelfProfile; needsConfirmation: boolean; devConfirmLink?: string }> {
  return post("/api/auth/register", input);
}

export async function login(input: { identifier: string; password: string }): Promise<SelfProfile> {
  const { profile } = await post<{ profile: SelfProfile }>("/api/auth/login", input);
  cacheProfile(profile);
  return profile;
}

export async function logout(): Promise<void> {
  try {
    await post("/api/auth/logout", {});
  } finally {
    clearAccountIdentity();
  }
}

export async function fetchSession(): Promise<SelfProfile | null> {
  const { profile } = await handle<{ profile: SelfProfile | null }>(await fetch("/api/auth/session"));
  if (profile) {
    cacheProfile(profile);
  } else {
    clearAccountIdentity();
  }
  return profile;
}

export async function checkAvailability(input: {
  nickname?: string;
  email?: string;
}): Promise<{ nickname?: { available: boolean; reason?: string }; email?: { available: boolean } }> {
  return post("/api/auth/availability", input);
}

export async function requestReset(email: string): Promise<void> {
  await post("/api/auth/request-reset", { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await post("/api/auth/reset", { token, password });
}

export async function resendConfirmation(email: string): Promise<void> {
  await post("/api/auth/resend-confirmation", { email });
}

export async function updateContact(contact: AccountContact): Promise<SelfProfile> {
  const { profile } = await handle<{ profile: SelfProfile }>(
    await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact })
    })
  );
  cacheProfile(profile);
  return profile;
}

// --- Admin ---------------------------------------------------------------

export async function adminListPlayers(): Promise<SelfProfile[]> {
  const { players } = await handle<{ players: SelfProfile[] }>(await fetch("/api/admin/players"));
  return players;
}

export async function adminAction(
  action: "ban" | "unban" | "delete" | "setRole",
  accountId: string,
  extra?: { reason?: string; role?: "player" | "admin" }
): Promise<void> {
  await post("/api/admin/players", { action, accountId, ...extra });
}
