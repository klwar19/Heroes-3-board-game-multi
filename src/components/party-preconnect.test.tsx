// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Re-import a fresh copy under a stubbed env per case (same pattern as
// asset-preconnect.test.tsx / asset-url.test.ts).
async function loadComponent(host: string | undefined) {
  vi.resetModules();
  if (host === undefined) {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "");
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  } else {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", host);
  }
  return import("./party-preconnect");
}

// Unmount through React first (it owns the hoisted <head> nodes), then sweep
// any leftovers so the next case starts from a clean document — same order as
// asset-preconnect.test.tsx (sweeping before unmount crashes React's commit).
function cleanupHoistedLinks(unmount: () => void) {
  unmount();
  document.querySelectorAll("link").forEach((el) => el.remove());
}

describe("PartyPreconnect", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits both preconnect pools + dns-prefetch for the configured party host", async () => {
    const { PartyPreconnect } = await loadComponent("rooms.example.partykit.dev");
    const { unmount } = render(<PartyPreconnect />);
    // React 19 hoists <link> resource hints into <head>, so query the document.
    const preconnects = [...document.querySelectorAll('link[rel="preconnect"]')];
    expect(preconnects).toHaveLength(2);
    for (const link of preconnects) {
      expect(link.getAttribute("href")).toBe("https://rooms.example.partykit.dev");
    }
    // One credentialed (WSS upgrade pool), one anonymous CORS (snapshot fetch
    // pool) — the split is the point, so pin exactly one of each.
    expect(preconnects.filter((link) => link.getAttribute("crossorigin") !== null)).toHaveLength(1);
    expect(preconnects.filter((link) => link.getAttribute("crossorigin") === null)).toHaveLength(1);
    const prefetch = document.querySelector('link[rel="dns-prefetch"]');
    expect(prefetch?.getAttribute("href")).toBe("https://rooms.example.partykit.dev");
    cleanupHoistedLinks(unmount);
  });

  it("uses plain http for a local dev party host", async () => {
    const { PartyPreconnect } = await loadComponent("localhost:1999");
    const { unmount } = render(<PartyPreconnect />);
    const preconnect = document.querySelector('link[rel="preconnect"]');
    expect(preconnect?.getAttribute("href")).toBe("http://localhost:1999");
    cleanupHoistedLinks(unmount);
  });

  it("renders nothing on the built-in same-origin backend (no env var)", async () => {
    const { PartyPreconnect } = await loadComponent(undefined);
    render(<PartyPreconnect />);
    expect(document.querySelector("link")).toBeNull();
  });
});
