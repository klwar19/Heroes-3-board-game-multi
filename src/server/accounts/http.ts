/**
 * Shared HTTP glue for the auth/admin API routes: session-cookie read/write and
 * a uniform AccountError → JSON mapping. Kept tiny and framework-thin so the
 * store stays the single source of truth.
 */
import { NextResponse } from "next/server";
import { getAccountStore, persistAccounts } from "./account-store-instance";
import { AccountError, type AccountErrorCode, type SelfProfile } from "./types";

export const SESSION_COOKIE = "homm3bg_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches the store default

/** HTTP status for each AccountError code. */
const STATUS_BY_CODE: Record<AccountErrorCode, number> = {
  NICKNAME_INVALID: 400,
  EMAIL_INVALID: 400,
  PASSWORD_WEAK: 400,
  CONTACT_INVALID: 400,
  NICKNAME_TAKEN: 409,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_CONFIRMED: 403,
  ACCOUNT_BANNED: 403,
  TOKEN_INVALID: 400,
  TOKEN_EXPIRED: 410,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  RATE_LIMITED: 429
};

/** Turn any thrown error into a JSON error response the client can branch on. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AccountError) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    const headers = error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined;
    return NextResponse.json({ error: error.code, message: error.message }, { status, headers });
  }
  return NextResponse.json({ error: "INTERNAL", message: "Something went wrong." }, { status: 500 });
}

/** Parse the session token out of the request's Cookie header (no deps). */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

/** Resolve the signed-in profile for a request, or null. */
export function sessionProfile(request: Request): SelfProfile | null {
  return getAccountStore().getSessionProfile(readSessionToken(request));
}

/** Resolve the signed-in profile or throw FORBIDDEN. */
export function requireSession(request: Request): SelfProfile {
  const profile = sessionProfile(request);
  if (!profile) {
    throw new AccountError("FORBIDDEN", "You must be signed in.");
  }
  return profile;
}

/** Resolve an admin profile or throw FORBIDDEN (used by every /api/admin route). */
export function requireAdmin(request: Request): SelfProfile {
  const profile = requireSession(request);
  if (profile.role !== "admin") {
    throw new AccountError("FORBIDDEN", "Admins only.");
  }
  return profile;
}

/** Persist after a mutation. Re-exported so routes import one module. */
export function save(): void {
  persistAccounts(getAccountStore());
}

// ---------------------------------------------------------------------------
// Best-effort per-IP rate limiting for unauthenticated probes (availability,
// reset requests). The store already rate-limits login per identifier; this
// bounds the account-enumeration surface the owner explicitly accepted (§D1).
// ---------------------------------------------------------------------------

declare global {
  var __homm3bgIpRate: Map<string, { count: number; resetAt: number }> | undefined;
}

/**
 * Resolved through globalThis on every call (not captured at import) so a test
 * or hot-reload that resets `__homm3bgIpRate` actually gets a fresh map.
 */
function ipRateMap(): Map<string, { count: number; resetAt: number }> {
  const map = globalThis.__homm3bgIpRate ?? new Map<string, { count: number; resetAt: number }>();
  globalThis.__homm3bgIpRate = map;
  return map;
}

/** Sweep threshold: past this many tracked IPs, expired windows are evicted. */
const IP_RATE_SWEEP_SIZE = 1000;

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    return fwd.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "local";
}

/** Throws AccountError(RATE_LIMITED) when a caller IP exceeds `limit` per window. */
export function enforceIpRate(request: Request, bucket: string, limit: number, windowMs: number): void {
  const ipRate = ipRateMap();
  const key = `${bucket}:${clientIp(request)}`;
  const now = Date.now();
  // Keep the map bounded: once it grows past the sweep size, drop every window
  // that has already expired (each IP that probed once would otherwise leave a
  // row behind forever).
  if (ipRate.size > IP_RATE_SWEEP_SIZE) {
    for (const [staleKey, staleWindow] of ipRate) {
      if (staleWindow.resetAt <= now) {
        ipRate.delete(staleKey);
      }
    }
  }
  const window = ipRate.get(key);
  if (!window || window.resetAt <= now) {
    ipRate.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (window.count >= limit) {
    throw new AccountError("RATE_LIMITED", "Too many requests — please slow down.", Math.ceil((window.resetAt - now) / 1000));
  }
  window.count += 1;
}
