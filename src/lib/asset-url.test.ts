import { beforeEach, describe, expect, it, vi } from "vitest";

// asset-url.ts captures NEXT_PUBLIC_ASSET_BASE_URL at module load (matching
// Next.js's build-time inlining), so each case re-imports a fresh module copy
// under a stubbed env instead of mutating process.env after import.
async function loadAssetUrl(base: string | undefined) {
  vi.resetModules();
  if (base === undefined) {
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", "");
    delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  } else {
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", base);
  }
  return import("./asset-url");
}

describe("assetUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns paths unchanged when no base URL is configured", async () => {
    const { assetUrl, assetBaseUrl } = await loadAssetUrl(undefined);
    expect(assetUrl("/assets/ui/map-backdrop.jpg")).toBe("/assets/ui/map-backdrop.jpg");
    expect(assetUrl("/sounds/click.mp3")).toBe("/sounds/click.mp3");
    expect(assetBaseUrl()).toBe("");
  });

  it("prefixes root-relative asset and sound paths with the configured origin", async () => {
    const { assetUrl, assetBaseUrl } = await loadAssetUrl("https://cdn.example.com");
    expect(assetUrl("/assets/ui/map-backdrop.jpg")).toBe(
      "https://cdn.example.com/assets/ui/map-backdrop.jpg"
    );
    expect(assetUrl("/sounds/click.mp3")).toBe("https://cdn.example.com/sounds/click.mp3");
    expect(assetBaseUrl()).toBe("https://cdn.example.com");
  });

  it("strips trailing slashes from the configured base so URLs never double-slash", async () => {
    const { assetUrl } = await loadAssetUrl("https://cdn.example.com///");
    expect(assetUrl("/assets/x.webp")).toBe("https://cdn.example.com/assets/x.webp");
  });

  it("leaves absolute URLs, protocol-relative URLs and data:/blob: URIs untouched", async () => {
    const { assetUrl } = await loadAssetUrl("https://cdn.example.com");
    expect(assetUrl("https://elsewhere.example/pic.png")).toBe("https://elsewhere.example/pic.png");
    expect(assetUrl("//elsewhere.example/pic.png")).toBe("//elsewhere.example/pic.png");
    expect(assetUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(assetUrl("blob:https://app.example/uuid")).toBe("blob:https://app.example/uuid");
  });

  it("is a no-op when wrapping twice (already-prefixed values pass through)", async () => {
    const { assetUrl } = await loadAssetUrl("https://cdn.example.com");
    expect(assetUrl(assetUrl("/assets/x.webp"))).toBe("https://cdn.example.com/assets/x.webp");
  });

  it("passes undefined through for optional image fields", async () => {
    const { assetUrl } = await loadAssetUrl("https://cdn.example.com");
    expect(assetUrl(undefined)).toBeUndefined();
  });

  it('treats the "same-origin" sentinel as unset so it can never leak into a URL prefix', async () => {
    const { assetUrl, assetBaseUrl } = await loadAssetUrl("same-origin");
    expect(assetUrl("/assets/ui/map-backdrop.jpg")).toBe("/assets/ui/map-backdrop.jpg");
    expect(assetBaseUrl()).toBe("");
  });
});
