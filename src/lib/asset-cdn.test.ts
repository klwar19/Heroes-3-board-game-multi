import { describe, expect, it } from "vitest";

import {
  assetRedirects,
  CDN_SERVES_FONTS,
  PRODUCTION_CDN_URL,
  resolveAssetBaseUrl,
  SAME_ORIGIN_SENTINEL
} from "./asset-cdn";

describe("resolveAssetBaseUrl", () => {
  it("returns same-origin ('') when nothing is configured (local dev, CI, plain builds)", () => {
    expect(resolveAssetBaseUrl({})).toBe("");
    expect(resolveAssetBaseUrl({ VERCEL_ENV: "development" })).toBe("");
  });

  it("uses the explicit env var verbatim (trailing slashes stripped) — Production stays dashboard-driven", () => {
    expect(
      resolveAssetBaseUrl({
        NEXT_PUBLIC_ASSET_BASE_URL: "https://cdn.example.com/",
        VERCEL_ENV: "production"
      })
    ).toBe("https://cdn.example.com");
  });

  it("production with NO env var stays same-origin (documented rollback: delete the var, redeploy)", () => {
    expect(resolveAssetBaseUrl({ VERCEL_ENV: "production" })).toBe("");
  });

  it("preview builds default to the canonical CDN when the env var is unset", () => {
    expect(resolveAssetBaseUrl({ VERCEL_ENV: "preview" })).toBe(PRODUCTION_CDN_URL);
  });

  it("an explicit env var beats the preview default", () => {
    expect(
      resolveAssetBaseUrl({
        NEXT_PUBLIC_ASSET_BASE_URL: "https://other.example",
        VERCEL_ENV: "preview"
      })
    ).toBe("https://other.example");
  });

  it(`the "${SAME_ORIGIN_SENTINEL}" sentinel forces same-origin anywhere, including previews`, () => {
    expect(
      resolveAssetBaseUrl({
        NEXT_PUBLIC_ASSET_BASE_URL: SAME_ORIGIN_SENTINEL,
        VERCEL_ENV: "preview"
      })
    ).toBe("");
    expect(
      resolveAssetBaseUrl({
        NEXT_PUBLIC_ASSET_BASE_URL: SAME_ORIGIN_SENTINEL,
        VERCEL_ENV: "production"
      })
    ).toBe("");
  });

  it("treats a blank/whitespace env var as unset", () => {
    expect(resolveAssetBaseUrl({ NEXT_PUBLIC_ASSET_BASE_URL: "  ", VERCEL_ENV: "preview" })).toBe(
      PRODUCTION_CDN_URL
    );
  });
});

describe("assetRedirects", () => {
  it("is empty when assets are same-origin — zero behaviour change for dev/CI", () => {
    expect(assetRedirects("")).toEqual([]);
  });

  it("redirects /assets and /sounds to the CDN as temporary (307) redirects", () => {
    const redirects = assetRedirects("https://cdn.example.com", false);
    expect(redirects).toEqual([
      {
        source: "/assets/:path*",
        destination: "https://cdn.example.com/assets/:path*",
        permanent: false
      },
      {
        source: "/sounds/:path*",
        destination: "https://cdn.example.com/sounds/:path*",
        permanent: false
      }
    ]);
  });

  it("includes /fonts only when the bucket is verified to serve fonts with CORS", () => {
    const withFonts = assetRedirects("https://cdn.example.com", true);
    expect(withFonts.map((r) => r.source)).toEqual([
      "/assets/:path*",
      "/sounds/:path*",
      "/fonts/:path*"
    ]);
    expect(withFonts.every((r) => r.permanent === false)).toBe(true);

    const withoutFonts = assetRedirects("https://cdn.example.com", false);
    expect(withoutFonts.map((r) => r.source)).toEqual(["/assets/:path*", "/sounds/:path*"]);
  });

  it("defaults the fonts choice to the committed CDN_SERVES_FONTS constant", () => {
    const defaulted = assetRedirects("https://cdn.example.com");
    expect(defaulted.some((r) => r.source === "/fonts/:path*")).toBe(CDN_SERVES_FONTS);
  });

  it("never double-slashes when the base carries a trailing slash", () => {
    const [first] = assetRedirects("https://cdn.example.com/");
    expect(first.destination).toBe("https://cdn.example.com/assets/:path*");
  });
});
