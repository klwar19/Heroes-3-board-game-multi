/**
 * Verified-actor resolution for the realtime transports (Phase 2 —
 * verified-identity seats).
 *
 * The BUILT-IN Next.js backend verifies a signed-in player directly from the
 * httpOnly session cookie in its API routes (same origin, `sessionProfile`).
 * The PARTYKIT edge runs on a different origin as a Cloudflare Durable Object,
 * so it cannot read that cookie — instead the client attaches its raw session
 * token to the socket, and the party resolves it to a verified `{userId,
 * nickname}` by calling back to the app's `/api/auth/verify-token` endpoint
 * (which checks the token against the account store).
 *
 * This module is the isomorphic, network-injectable seam so the resolution
 * logic is unit-tested offline (no Workers runtime, no live app): the party
 * shell just wires a real `fetch` into `httpTokenVerifier`.
 */

/**
 * The minimal, non-secret identity a verified session resolves to. `isAdmin`
 * lets the cross-origin edge honour a PLATFORM ADMIN for destructive room ops
 * (close/reset ANY room), the same power the built-in backend reads straight
 * from the session cookie. Exposing this derived boolean leaks nothing an
 * attacker could exploit: knowing a token already grants full impersonation of
 * that account, so "the account you hold a token for is an admin" reveals
 * nothing new — and the token never becomes JS-readable (a short-lived ticket).
 */
export type VerifiedIdentity = { userId: string; nickname: string; isAdmin: boolean };

/** Resolve a raw session token to a verified identity, or null when invalid. */
export type TokenVerifier = (token: string | undefined | null) => Promise<VerifiedIdentity | null>;

type FetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** A seat lookup must never hold a room action/mutation queue indefinitely. */
export const VERIFY_TOKEN_TIMEOUT_MS = 5_000;
export const TOKEN_VERIFY_TIMEOUT_MS = VERIFY_TOKEN_TIMEOUT_MS;

/**
 * A verifier that POSTs the token to the app's `/api/auth/verify-token` route
 * and reads back the verified identity. `appUrl` is the app's public origin
 * (env on the party, e.g. HOMM3BG_APP_URL); `fetchImpl` is injectable so tests
 * can drive it without a network. Any failure (network, non-2xx, malformed
 * body, no token, or a round-trip slower than VERIFY_TOKEN_TIMEOUT_MS)
 * resolves to null — a verification failure must degrade to "guest", never
 * throw, never grant a seat, and never stall the action pipeline.
 */
export function httpTokenVerifier(
  appUrl: string,
  fetchImpl: FetchLike,
  timeoutMs = TOKEN_VERIFY_TIMEOUT_MS
): TokenVerifier {
  const base = appUrl.replace(/\/+$/, "");
  return async (token) => {
    if (!token) {
      return null;
    }
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        fetchImpl(`${base}/api/auth/verify-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: controller.signal
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("Token verification timed out."));
          }, Math.max(1, timeoutMs));
        })
      ]);
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as
        | { userId?: unknown; nickname?: unknown; isAdmin?: unknown }
        | null;
      if (data && typeof data.userId === "string" && typeof data.nickname === "string") {
        // `isAdmin` is optional on the wire (older app deploys omit it): absent
        // ⇒ not an admin, so the destructive-op bypass simply never triggers.
        return { userId: data.userId, nickname: data.nickname, isAdmin: data.isAdmin === true };
      }
      return null;
    } catch {
      return null;
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  };
}

/**
 * Wrap a verifier so a successfully-resolved token is remembered — the party
 * would otherwise pay a callback round-trip on every single action. Only
 * POSITIVE results are cached (a token that is not yet valid must still be
 * re-checked later; nothing is gained by remembering "guest"). The cache is
 * bounded so a room churning through many tokens can't grow it without limit.
 */
export function memoizeVerifier(verify: TokenVerifier, maxEntries = 256): TokenVerifier {
  const cache = new Map<string, VerifiedIdentity>();
  return async (token) => {
    if (!token) {
      return null;
    }
    const cached = cache.get(token);
    if (cached) {
      return cached;
    }
    const result = await verify(token);
    if (result) {
      if (cache.size >= maxEntries) {
        // Evict the oldest entry (Map keeps insertion order) to stay bounded.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
      cache.set(token, result);
    }
    return result;
  };
}
