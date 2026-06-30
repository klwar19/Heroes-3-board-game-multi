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
