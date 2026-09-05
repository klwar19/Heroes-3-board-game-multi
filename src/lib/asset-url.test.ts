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

  it("prefixes root-relative asset and sound paths with the configured origin (unpublished paths keep their logical key)", async () => {
    const { assetUrl, assetBaseUrl } = await loadAssetUrl("https://cdn.example.com");
    expect(assetUrl("/assets/ui/not-a-published-file.jpg")).toBe(
      "https://cdn.example.com/assets/ui/not-a-published-file.jpg"
    );
    expect(assetUrl("/sounds/not-a-published-click.mp3")).toBe("https://cdn.example.com/sounds/not-a-published-click.mp3");
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

describe("assetUrl content-addressed objects (docs/media-manifest.md)", () => {
  // A real published file (media-manifest.json: "assets/abilities-air_magic.webp",
  // md5 7f73e9cf…) — the runtime map turns it into its immutable object key.
  const PUBLISHED = "/assets/abilities-air_magic.webp";
  const PUBLISHED_OBJECT = "/assets/abilities-air_magic.7f73e9cf.webp";
  const UNPUBLISHED = "/assets/not-a-published-file.webp";

  async function loadVersioned(base: string | undefined, version: string) {
    vi.resetModules();
    if (base === undefined) {
      vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", "");
      delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
    } else {
      vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", base);
    }
    vi.stubEnv("NEXT_PUBLIC_ASSET_VERSION", version);
    return import("./asset-url");
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves a published file from its content-addressed object with NO version query (immutable URL)", async () => {
    const { assetUrl, contentAddressedPath } = await loadVersioned("https://cdn.example.com", "abc123def0");
    expect(contentAddressedPath(PUBLISHED)).toBe(PUBLISHED_OBJECT);
    expect(assetUrl(PUBLISHED)).toBe(`https://cdn.example.com${PUBLISHED_OBJECT}`);
    // The map covers sounds too: derive the expectation from the map itself.
    const map = (await import("./media-keys.generated.json")).default;
    const dirs = map.dirs as Record<string, Record<string, string>>;
    const soundDir = Object.keys(dirs).find((dir) => dir.startsWith("sounds/"))!;
    const [soundFile, soundHash] = Object.entries(dirs[soundDir])[0];
    const dot = soundFile.lastIndexOf(".");
    expect(assetUrl(`/${soundDir}/${soundFile}`)).toBe(
      `https://cdn.example.com/${soundDir}/${soundFile.slice(0, dot)}.${soundHash}${soundFile.slice(dot)}`
    );
  });

  it("keeps a caller's query/fragment on the object path", async () => {
    const { assetUrl } = await loadVersioned("https://cdn.example.com", "abc123def0");
    expect(assetUrl(`${PUBLISHED}?frame=2#t=1`)).toBe(`https://cdn.example.com${PUBLISHED_OBJECT}?frame=2#t=1`);
  });

  it("falls back to the legacy logical key + ?v=<version> for a path the map does not know", async () => {
    const { assetUrl, contentAddressedPath } = await loadVersioned("https://cdn.example.com", "abc123def0");
    expect(contentAddressedPath(UNPUBLISHED)).toBeUndefined();
    expect(assetUrl(UNPUBLISHED)).toBe(`https://cdn.example.com${UNPUBLISHED}?v=abc123def0`);
    expect(assetUrl("/assets/x.webp?frame=2")).toBe("https://cdn.example.com/assets/x.webp?frame=2&v=abc123def0");
  });

  it("CONTROL: no version configured keeps the legacy fallback unversioned", async () => {
    const { assetUrl } = await loadVersioned("https://cdn.example.com", "");
    expect(assetUrl(UNPUBLISHED)).toBe(`https://cdn.example.com${UNPUBLISHED}`);
  });

  it("CONTROL: same-origin serving returns the logical path untouched — mapped or not (local dev with the media pulled)", async () => {
    const { assetUrl } = await loadVersioned(undefined, "abc123def0");
    expect(assetUrl(PUBLISHED)).toBe(PUBLISHED);
    expect(assetUrl(UNPUBLISHED)).toBe(UNPUBLISHED);
  });

  it("wrapping twice stays a no-op (already-absolute values pass through untouched)", async () => {
    const { assetUrl } = await loadVersioned("https://cdn.example.com", "abc123def0");
    expect(assetUrl(assetUrl(PUBLISHED))).toBe(`https://cdn.example.com${PUBLISHED_OBJECT}`);
    expect(assetUrl(assetUrl(UNPUBLISHED))).toBe(`https://cdn.example.com${UNPUBLISHED}?v=abc123def0`);
  });
});
