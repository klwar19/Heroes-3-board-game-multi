"use client";

/**
 * Stable per-tab identity for room membership. A seat belongs to one live table
 * client, not to every tab in the same browser profile: localStorage made two
 * players testing in separate tabs silently share one `clientId`, so both tabs
 * were locked to the same seat and either tab could answer that seat's choices.
 *
 * sessionStorage survives refresh/reconnect in this tab. Browsers may initially
 * COPY it into a tab opened from this one, so a per-browsing-context marker in
 * window.name detects that copy and mints a different client id. The display
 * name remains browser-wide because sharing a preferred name is harmless;
 * sharing authority is not.
 */

const CLIENT_ID_KEY = "homm3bg.clientId";
const CLIENT_TAB_KEY = "homm3bg.clientTab";
const LEGACY_CLAIM_KEY = "homm3bg.clientMigrationTab";
const NAME_KEY = "homm3bg.displayName";
const ACCOUNT_KEY = "homm3bg.account";
const GUEST_KEY = "homm3bg.guest";
const WINDOW_TAB_PREFIX = "homm3bg-tab:";

function randomId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * window.name belongs to the top-level browsing context and survives reloads,
 * unlike a module variable. A newly opened `_blank` tab gets its own name even
 * when the browser copied the opener's sessionStorage into it.
 */
function getTabId(): string {
  const existing = window.name.startsWith(WINDOW_TAB_PREFIX)
    ? window.name.slice(WINDOW_TAB_PREFIX.length)
    : "";
  if (existing) {
    return existing;
  }
  const id = randomId().replace(/^c_/, "t_");
  window.name = `${WINDOW_TAB_PREFIX}${id}`;
  return id;
}

export function getClientId(): string {
  if (typeof window === "undefined") {
    return "server";
  }
  try {
    const tabId = getTabId();
    let id = window.sessionStorage.getItem(CLIENT_ID_KEY);
    const owningTab = window.sessionStorage.getItem(CLIENT_TAB_KEY);
    // Missing ownership is an old stored identity; a mismatch means this tab
    // inherited a copy from its opener. Neither may inherit seat authority.
    if (!id || owningTab !== tabId) {
      // One-time migration from the old browser-wide identity: exactly one tab
      // may retain it, preserving that tab's existing hosted seat/host role.
      // Every other tab sees the claim belongs elsewhere and gets a fresh id.
      const legacyId = window.localStorage.getItem(CLIENT_ID_KEY);
      const claimedBy = window.localStorage.getItem(LEGACY_CLAIM_KEY);
      if (legacyId && (!claimedBy || claimedBy === tabId)) {
        id = legacyId;
        window.localStorage.setItem(LEGACY_CLAIM_KEY, tabId);
      } else {
        id = randomId();
      }
      window.sessionStorage.setItem(CLIENT_ID_KEY, id);
    }
    window.sessionStorage.setItem(CLIENT_TAB_KEY, tabId);
    return id;
  } catch {
    return randomId();
  }
}

export function getDisplayName(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDisplayName(name: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage may be unavailable (private mode) — names are best-effort. */
  }
}

/**
 * The public part of the signed-in account, cached client-side for instant UI
 * ("logged in as …", admin-link gating) and for `getIdentity()`. This is NOT
 * the auth credential — the session lives in an httpOnly cookie the browser
 * cannot read; this cache only mirrors the non-secret profile the server would
 * return from /api/auth/session. Wiring the session TOKEN onto the realtime
 * transport (so seats bind to a verified userId) is Phase 2.
 */
export type AccountIdentity = { userId: string; nickname: string; role: "player" | "admin" };

export function getAccountIdentity(): AccountIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AccountIdentity>;
    if (typeof parsed.userId === "string" && typeof parsed.nickname === "string") {
      return { userId: parsed.userId, nickname: parsed.nickname, role: parsed.role === "admin" ? "admin" : "player" };
    }
    return null;
  } catch {
    return null;
  }
}

export function setAccountIdentity(account: AccountIdentity): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    // A logged-in player is seen under their account nickname everywhere the
    // rooms already read the display name.
    window.localStorage.setItem(NAME_KEY, account.nickname);
    // Signing in exits guest mode (they now have a real account).
    window.localStorage.removeItem(GUEST_KEY);
  } catch {
    /* best-effort */
  }
}

export function clearAccountIdentity(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Guest mode marker. When accounts are ENABLED, the app still lets a player
 * choose "Continue as guest" — this flag records that deliberate choice so the
 * pages that otherwise send a signed-out visitor to /login (the menu) let a
 * chosen guest through. Set when the player picks guest; cleared on sign-in.
 * (With accounts OFF there is no login wall, so the flag is simply inert.)
 */
export function setGuestMode(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(GUEST_KEY, "1");
  } catch {
    /* best-effort */
  }
}

export function isGuestMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearGuestMode(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(GUEST_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * The unified identity a table client acts under: always a per-tab clientId and
 * a display name; plus the verified userId/role when signed in. Guest mode
 * returns just clientId + displayName (userId undefined), exactly as before.
 */
export type Identity = { clientId: string; displayName: string; userId?: string; role?: "player" | "admin" };

export function getIdentity(): Identity {
  const account = getAccountIdentity();
  return {
    clientId: getClientId(),
    displayName: account?.nickname ?? getDisplayName(),
    ...(account ? { userId: account.userId, role: account.role } : {})
  };
}
