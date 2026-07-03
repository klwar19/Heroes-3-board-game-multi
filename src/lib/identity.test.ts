// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccountIdentity,
  getAccountIdentity,
  getIdentity,
  setAccountIdentity,
  setDisplayName,
  getClientId
} from "./identity";

describe("room client identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.name = "";
    vi.restoreAllMocks();
  });

  it("survives refreshes in the same tab through sessionStorage", () => {
    const first = getClientId();
    expect(first).toMatch(/^c_/);
    expect(getClientId()).toBe(first);
    expect(window.sessionStorage.getItem("homm3bg.clientId")).toBe(first);
  });

  it("rejects sessionStorage copied from an opener tab", () => {
    const openerId = getClientId();
    const openerTab = window.sessionStorage.getItem("homm3bg.clientTab");
    expect(openerTab).toBeTruthy();

    // A new `_blank` browsing context starts with a fresh window.name but may
    // inherit a byte-for-byte copy of the opener's sessionStorage.
    window.name = "";
    const copiedTabId = getClientId();

    expect(copiedTabId).not.toBe(openerId);
    expect(window.sessionStorage.getItem("homm3bg.clientTab")).not.toBe(openerTab);
  });

  it("lets exactly one tab migrate the old browser-wide identity", () => {
    window.localStorage.setItem("homm3bg.clientId", "shared-by-every-tab");

    const firstTabId = getClientId();
    expect(firstTabId).toBe("shared-by-every-tab");

    // A second tab cannot migrate the same identity after the first tab has
    // claimed it, even if its tab-local storage was copied or starts empty.
    window.sessionStorage.clear();
    window.name = "";
    const secondTabId = getClientId();
    expect(secondTabId).not.toBe("shared-by-every-tab");
  });

  it("migrates a legacy session id that has no tab ownership marker", () => {
    window.sessionStorage.setItem("homm3bg.clientId", "legacy-session-id");

    const id = getClientId();

    expect(id).not.toBe("legacy-session-id");
    expect(window.sessionStorage.getItem("homm3bg.clientTab")).toBeTruthy();
  });
});

describe("account identity cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.name = "";
  });

  it("is null in guest mode and getIdentity() falls back to the display name", () => {
    setDisplayName("GuestTraveller");
    expect(getAccountIdentity()).toBeNull();
    const identity = getIdentity();
    expect(identity.userId).toBeUndefined();
    expect(identity.displayName).toBe("GuestTraveller");
    expect(identity.clientId).toMatch(/^[ct]_/);
  });

  it("stores the signed-in account and makes the nickname the display name", () => {
    setAccountIdentity({ userId: "u_1", nickname: "Solmyr", role: "player" });
    expect(getAccountIdentity()).toEqual({ userId: "u_1", nickname: "Solmyr", role: "player" });

    const identity = getIdentity();
    expect(identity.userId).toBe("u_1");
    expect(identity.role).toBe("player");
    // The account nickname becomes the name the rooms read.
    expect(identity.displayName).toBe("Solmyr");
    expect(window.localStorage.getItem("homm3bg.displayName")).toBe("Solmyr");
  });

  it("clears the account on logout (getIdentity() drops back to guest)", () => {
    setAccountIdentity({ userId: "u_2", nickname: "Boss", role: "admin" });
    expect(getIdentity().role).toBe("admin");
    clearAccountIdentity();
    expect(getAccountIdentity()).toBeNull();
    expect(getIdentity().userId).toBeUndefined();
  });

  it("ignores a corrupt account blob rather than throwing", () => {
    window.localStorage.setItem("homm3bg.account", "{not json");
    expect(getAccountIdentity()).toBeNull();
    expect(getIdentity().userId).toBeUndefined();
  });
});
