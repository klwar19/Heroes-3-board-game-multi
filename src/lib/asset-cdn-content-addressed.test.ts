import { describe, expect, it } from "vitest";

import { PRODUCTION_CDN_URL, assetRedirects, cssAssetRedirects, resolveAssetBaseUrl } from "./asset-cdn";

describe("resolveAssetBaseUrl — media-less checkouts", () => {
  it("defaults to the canonical CDN when the env var is unset and the media tree is absent", () => {
    expect(resolveAssetBaseUrl({}, { localMediaPresent: false })).toBe(PRODUCTION_CDN_URL);
    expect(resolveAssetBaseUrl({ VERCEL_ENV: "production" }, { localMediaPresent: false })).toBe(PRODUCTION_CDN_URL);
  });

  it("CONTROL: with the media present (or the flag omitted) the classic same-origin default holds", () => {
    expect(resolveAssetBaseUrl({}, { localMediaPresent: true })).toBe("");
    expect(resolveAssetBaseUrl({})).toBe("");
    expect(resolveAssetBaseUrl({ VERCEL_ENV: "production" }, {})).toBe("");
  });

  it("an explicit env var (including the same-origin sentinel) still wins over the media-less default", () => {
    expect(resolveAssetBaseUrl({ NEXT_PUBLIC_ASSET_BASE_URL: "https://cdn.example/" }, { localMediaPresent: false })).toBe(
      "https://cdn.example"
    );
    expect(resolveAssetBaseUrl({ NEXT_PUBLIC_ASSET_BASE_URL: "same-origin" }, { localMediaPresent: false })).toBe("");
  });
});

describe("cssAssetRedirects — exact content-addressed redirects for stylesheet url() refs", () => {
  const objectPathFor = (path: string) =>
    path === "/assets/ui/x.webp" ? "/assets/ui/x.01234567.webp" : path === "/sounds/z.mp3" ? "/sounds/z.89abcdef.mp3" : undefined;

  it("emits one temporary exact redirect per mappable ref, skipping unpublished ones", () => {
    expect(cssAssetRedirects("https://cdn.example/", ["/assets/ui/x.webp", "/assets/ui/unpublished.webp", "/sounds/z.mp3"], objectPathFor)).toEqual([
      { source: "/assets/ui/x.webp", destination: "https://cdn.example/assets/ui/x.01234567.webp", permanent: false },
      { source: "/sounds/z.mp3", destination: "https://cdn.example/sounds/z.89abcdef.mp3", permanent: false }
    ]);
  });

  it("is empty for same-origin serving (dev with media / CI unchanged)", () => {
    expect(cssAssetRedirects("", ["/assets/ui/x.webp"], objectPathFor)).toEqual([]);
  });

  it("lists before the wildcard so Next matches the exact object first (next.config order)", () => {
    const table = [
      ...cssAssetRedirects("https://cdn.example", ["/assets/ui/x.webp"], objectPathFor),
      ...assetRedirects("https://cdn.example", false, "v123")
    ];
    expect(table.map((r) => r.source)).toEqual(["/assets/ui/x.webp", "/assets/:path*", "/sounds/:path*"]);
    expect(table[1].destination).toBe("https://cdn.example/assets/:path*?v=v123");
  });
});
