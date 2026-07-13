// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The component reads the env-derived base captured at module load, so each
// case re-imports a fresh copy under a stubbed env (same pattern as
// asset-url.test.ts).
async function loadComponent(base: string | undefined) {
  vi.resetModules();
  if (base === undefined) {
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", "");
    delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  } else {
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", base);
  }
  return import("./asset-preconnect");
}

describe("AssetPreconnect", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits preconnect + dns-prefetch links for the configured CDN origin", async () => {
    const { AssetPreconnect } = await loadComponent("https://cdn.example.com");
    const { unmount } = render(<AssetPreconnect />);
    // React 19 hoists <link> resource hints into <head>, so query the document.
    const preconnect = document.querySelector('link[rel="preconnect"]');
    const prefetch = document.querySelector('link[rel="dns-prefetch"]');
    expect(preconnect?.getAttribute("href")).toBe("https://cdn.example.com");
    expect(prefetch?.getAttribute("href")).toBe("https://cdn.example.com");
    // Unmount through React first (it owns the hoisted nodes), then sweep any
    // leftovers so the no-env case below starts from a clean document.
    unmount();
    document.querySelectorAll("link").forEach((el) => el.remove());
  });

  it("renders nothing in the default same-origin setup (no env var)", async () => {
    const { AssetPreconnect } = await loadComponent(undefined);
    render(<AssetPreconnect />);
    expect(document.querySelector("link")).toBeNull();
  });
});
