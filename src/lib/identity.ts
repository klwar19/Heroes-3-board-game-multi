"use client";

/**
 * Stable per-browser identity for room membership. The `clientId` is generated
 * once and kept in localStorage so a reconnect (refresh, tab switch) keeps the
 * same seat and host role. The display name is the label other members see.
 */

const CLIENT_ID_KEY = "homm3bg.clientId";
const NAME_KEY = "homm3bg.displayName";

function randomId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  if (typeof window === "undefined") {
    return "server";
  }
  try {
    let id = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(CLIENT_ID_KEY, id);
    }
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
