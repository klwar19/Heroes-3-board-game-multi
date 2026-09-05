import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MEDIA_EXTENSIONS,
  MEDIA_KEY_HASH_LENGTH,
  MEDIA_MANIFEST_FILE,
  MEDIA_RASTER_EXTENSIONS,
  MEDIA_ROOTS,
  MEDIA_RUNTIME_MAP_FILE,
  cdnObjectPath,
  compareLocalTreeToManifest,
  contentAddressedKey,
  SOURCE_EXTENSIONS,
  SOURCE_ROOTS,
  SOURCES_MANIFEST_FILE,
  hasSourceFile,
  isSourcePath,
  localSourcePath,
  readSourcesManifest,
  sourceFileInfo,
  cssMediaRefs,
  hasLocalMediaTree,
  hasMediaFile,
  listMediaDir,
  listMediaFiles,
  localMediaPath,
  mediaExtensionOf,
  mediaFileInfo,
  mediaKeyFromUrl,
  mediaManifestVersion,
  readMediaManifest,
  resetMediaManifestCache,
  runtimeMediaMap
} from "./media-manifest";
import { contentAddressedPath } from "./asset-url";
import runtimeMap from "./media-keys.generated.json";

const REPO_ROOT = process.cwd();
const tempRoots: string[] = [];

const FIXTURE = {
  version: 1,
  cdn: "https://cdn.example",
  roots: ["assets", "sounds"],
  count: 3,
  files: {
    "assets/ui/a.webp": { md5: "0123456789abcdef0123456789abcdef", bytes: 10, width: 4, height: 2 },
    "assets/ui/deep/b.png": { md5: "fedcba9876543210fedcba9876543210", bytes: 20, width: 1, height: 1 },
    "sounds/click.mp3": { md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bytes: 30 }
  }
};

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "media-manifest-"));
  tempRoots.push(root);
  writeFileSync(join(root, MEDIA_MANIFEST_FILE), JSON.stringify(FIXTURE));
  resetMediaManifestCache();
  return root;
}

afterEach(() => {
  resetMediaManifestCache();
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("media manifest reader (fixture)", () => {
  it("answers existence, info, listings and object paths from the manifest alone", () => {
    const root = fixtureRoot();
    expect(hasMediaFile("/assets/ui/a.webp", root)).toBe(true);
    expect(hasMediaFile("/assets/ui/a.webp?v=1", root)).toBe(true);
    expect(hasMediaFile("assets/ui/a.webp", root)).toBe(true);
    expect(hasMediaFile("/assets/ui/missing.webp", root)).toBe(false);
    expect(mediaFileInfo("/sounds/click.mp3", root)).toEqual({ md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bytes: 30 });
    expect(listMediaFiles("/assets/ui", root)).toEqual(["/assets/ui/a.webp", "/assets/ui/deep/b.png"]);
    expect(listMediaFiles("/assets/ui/", root)).toEqual(["/assets/ui/a.webp", "/assets/ui/deep/b.png"]);
    expect(listMediaDir("/assets/ui", root)).toEqual(["a.webp"]);
    expect(listMediaDir("/sounds", root)).toEqual(["click.mp3"]);
    expect(cdnObjectPath("/assets/ui/a.webp", root)).toBe("/assets/ui/a.01234567.webp");
    expect(cdnObjectPath("/assets/ui/missing.webp", root)).toBeUndefined();
    // No bytes on disk in the fixture root: byte-inspecting tests must skip.
    expect(localMediaPath("/assets/ui/a.webp", root)).toBeNull();
    expect(hasLocalMediaTree(root)).toBe(false);
  });

  it("derives the version and the runtime map deterministically, and the version tracks the md5s", () => {
    const root = fixtureRoot();
    const manifest = readMediaManifest(root)!;
    const v1 = mediaManifestVersion(manifest);
    expect(v1).toMatch(/^[0-9a-f]{10}$/);
    expect(runtimeMediaMap(manifest)).toEqual({
      version: v1,
      hashLength: MEDIA_KEY_HASH_LENGTH,
      dirs: {
        "assets/ui": { "a.webp": "01234567" },
        "assets/ui/deep": { "b.png": "fedcba98" },
        sounds: { "click.mp3": "aaaaaaaa" }
      }
    });
    const changed = { ...manifest, files: { ...manifest.files, "assets/ui/a.webp": { ...manifest.files["assets/ui/a.webp"], md5: "ffffffffffffffffffffffffffffffff" } } };
    expect(mediaManifestVersion(changed)).not.toBe(v1);
    expect(mediaManifestVersion(null)).toBe("");
    expect(mediaManifestVersion({ ...manifest, files: {} })).toBe("");
  });

  it("reports the local tree against the manifest (unpublished / mismatched / missing)", () => {
    const root = fixtureRoot();
    const publicDir = join(root, "public");
    // a.webp present with the right size, b.png present with the WRONG size,
    // click.mp3 absent, and an extra never-published file.
    mkdirSync(join(publicDir, "assets/ui/deep"), { recursive: true });
    writeFileSync(join(publicDir, "assets/ui/a.webp"), "0123456789");
    writeFileSync(join(publicDir, "assets/ui/deep/b.png"), "short");
    writeFileSync(join(publicDir, "assets/ui/deep/new.webp"), "x");
    writeFileSync(join(publicDir, "assets/ui/deep/notes.md"), "not media");
    const report = compareLocalTreeToManifest(root);
    expect(report.localCount).toBe(3);
    expect(report.unpublished).toEqual(["assets/ui/deep/new.webp"]);
    expect(report.sizeMismatch).toEqual(["assets/ui/deep/b.png"]);
    expect(report.missingLocally).toEqual(["sounds/click.mp3"]);
    expect(localMediaPath("/assets/ui/a.webp", root)).toBe(join(publicDir, "assets/ui/a.webp"));
    expect(hasLocalMediaTree(root)).toBe(true);
  });

  it("classifies keys and urls", () => {
    expect(mediaKeyFromUrl("/assets/x.webp?v=1#frag")).toBe("assets/x.webp");
    expect(mediaKeyFromUrl("//assets/x.webp")).toBe("assets/x.webp");
    expect(mediaExtensionOf("a/b.C.WEBP")).toBe("webp");
    expect(contentAddressedKey("assets/ui/x.webp", "f47398ae1322d34b22b6a213fe7f8549")).toBe("assets/ui/x.f47398ae.webp");
    expect(contentAddressedKey("sounds/a.b/c.mp3", "0123456789abcdef0123456789abcdef")).toBe("sounds/a.b/c.01234567.mp3");
    expect(contentAddressedKey("assets/noext", "0123456789abcdef0123456789abcdef")).toBe("assets/noext.01234567");
    expect(cssMediaRefs(`
      .a { background: url("/assets/ui/x.webp"); }
      .b { background: url( '/assets/ui/y.webp?v=2' ) , url(/sounds/z.mp3); }
      .c { background: url(/assets/ui/x.webp); }
      @font-face { src: url("/fonts/Liberation.ttf"); }
      .d { background: url(https://elsewhere/pic.png); }
    `)).toEqual(["/assets/ui/x.webp", "/assets/ui/y.webp", "/sounds/z.mp3"]);
  });
});

describe("the committed media manifest", () => {
  const manifest = readMediaManifest(REPO_ROOT);

  it("exists, is well-formed, sorted, and every entry is a media file under a media root", () => {
    expect(manifest, `${MEDIA_MANIFEST_FILE} is missing`).toBeTruthy();
    const keys = Object.keys(manifest!.files);
    expect(keys.length).toBeGreaterThan(1000);
    expect(manifest!.count).toBe(keys.length);
    expect(manifest!.roots).toEqual([...MEDIA_ROOTS]);
    expect(manifest!.cdn).toBe("https://cdn.hamthefirt.xyz");
    expect(keys).toEqual([...keys].sort());
    const bad = keys.filter(
      (key) =>
        !MEDIA_ROOTS.some((root) => key.startsWith(`${root}/`)) ||
        !(MEDIA_EXTENSIONS as readonly string[]).includes(mediaExtensionOf(key)) ||
        key.startsWith("/") ||
        key.includes("\\") ||
        key.includes("//")
    );
    expect(bad).toEqual([]);
    const badEntries = keys.filter((key) => {
      const entry = manifest!.files[key];
      const raster = (MEDIA_RASTER_EXTENSIONS as readonly string[]).includes(mediaExtensionOf(key));
      return (
        !/^[0-9a-f]{32}$/u.test(entry.md5) ||
        !(Number.isInteger(entry.bytes) && entry.bytes > 0) ||
        (raster && !(Number.isInteger(entry.width) && Number.isInteger(entry.height) && entry.width! > 0 && entry.height! > 0))
      );
    });
    expect(badEntries).toEqual([]);
  });

  it("is in lockstep with the generated runtime map the client bundle ships (src/lib/media-keys.generated.json)", () => {
    // Both files are written together by `npm run media:publish`; a hand-edit
    // or a half-committed publish shows up here.
    expect(runtimeMap).toEqual(runtimeMediaMap(manifest!));
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, MEDIA_RUNTIME_MAP_FILE), "utf8"));
    expect(raw).toEqual(runtimeMap);
  });

  it("assetUrl's runtime lookup agrees with the node-side object path for every file", () => {
    const manifestFiles = Object.keys(manifest!.files);
    const disagreements = manifestFiles.filter((key) => contentAddressedPath(`/${key}`) !== cdnObjectPath(`/${key}`, REPO_ROOT));
    expect(disagreements).toEqual([]);
    expect(contentAddressedPath("/assets/not-a-published-file.webp")).toBeUndefined();
  });

  it("agrees with the scripts/lib twin (contentAddressedKey, version, runtime map)", async () => {
    const twinPath = join(REPO_ROOT, "scripts/lib/media-manifest.mjs");
    const twin = (await import(/* @vite-ignore */ `file:///${twinPath.replaceAll("\\", "/")}`)) as {
      contentAddressedKey: (key: string, md5: string) => string;
      manifestVersion: (manifest: unknown) => string;
      runtimeMediaMap: (manifest: unknown) => unknown;
      MEDIA_EXTENSIONS: string[];
      MEDIA_ROOTS: string[];
      MEDIA_KEY_HASH_LENGTH: number;
    };
    expect(twin.MEDIA_EXTENSIONS).toEqual([...MEDIA_EXTENSIONS]);
    expect(twin.MEDIA_ROOTS).toEqual([...MEDIA_ROOTS]);
    expect(twin.MEDIA_KEY_HASH_LENGTH).toBe(MEDIA_KEY_HASH_LENGTH);
    expect(twin.manifestVersion(manifest)).toBe(mediaManifestVersion(manifest));
    expect(twin.runtimeMediaMap(manifest)).toEqual(runtimeMediaMap(manifest!));
    for (const key of Object.keys(manifest!.files).filter((_, i) => i % 97 === 0)) {
      expect(twin.contentAddressedKey(key, manifest!.files[key].md5)).toBe(contentAddressedKey(key, manifest!.files[key].md5));
    }
  });

  it("covers every url() media reference in globals.css (each gets an exact CDN redirect)", () => {
    const css = readFileSync(join(REPO_ROOT, "src/app/globals.css"), "utf8");
    const refs = cssMediaRefs(css);
    expect(refs.length).toBeGreaterThan(10);
    const unpublished = refs.filter((ref) => !hasMediaFile(ref, REPO_ROOT));
    expect(unpublished, "globals.css references media that is not in media-manifest.json — run `npm run media:publish`").toEqual([]);
  });

  it("matches the local media tree when one is present (nothing unpublished, nothing stale)", () => {
    // A developer (or AI session) who built new art but did not run
    // `npm run media:publish` sees exactly which files the CDN will 404 on;
    // a checkout that pulled an older tree sees what `npm run media:pull`
    // would refresh. A checkout WITHOUT media (CI) has nothing to compare.
    if (!hasLocalMediaTree(REPO_ROOT)) return;
    const report = compareLocalTreeToManifest(REPO_ROOT);
    expect(report.unpublished, "local media files missing from media-manifest.json — run `npm run media:publish`").toEqual([]);
    expect(report.sizeMismatch, "local media files differ from media-manifest.json — run `npm run media:publish` (to ship them) or `npm run media:pull` (to restore)").toEqual([]);
    expect(report.missingLocally, "manifest files missing on this disk — run `npm run media:pull`").toEqual([]);
  });
});

describe("the committed SOURCES manifest (art masters — docs/media-manifest.md)", () => {
  const sources = readSourcesManifest(REPO_ROOT);

  it("exists, is well-formed and every key is a binary master under a SOURCE root", () => {
    expect(sources, `${SOURCES_MANIFEST_FILE} is missing`).toBeTruthy();
    const keys = Object.keys(sources!.files);
    expect(keys.length).toBeGreaterThan(500);
    expect(sources!.count).toBe(keys.length);
    expect(sources!.roots).toEqual([...SOURCE_ROOTS]);
    expect(keys).toEqual([...keys].sort());
    expect(keys.filter((key) => !isSourcePath(key))).toEqual([]);
    const badEntries = keys.filter((key) => {
      const entry = sources!.files[key];
      return !/^[0-9a-f]{32}$/u.test(entry.md5) || !(Number.isInteger(entry.bytes) && entry.bytes > 0);
    });
    expect(badEntries).toEqual([]);
    // Every raster master carries dimensions (the art-gate tests read them).
    const rasterWithoutDims = keys.filter(
      (key) =>
        ["png", "jpg", "jpeg", "webp", "gif"].includes(mediaExtensionOf(key)) &&
        !(sources!.files[key].width! > 0 && sources!.files[key].height! > 0)
    );
    expect(rasterWithoutDims).toEqual([]);
  });

  it("answers existence / info / local presence; SVG and JSON beside the masters are NOT sources (they stay tracked)", () => {
    const [first] = Object.keys(sources!.files);
    expect(hasSourceFile(first, REPO_ROOT)).toBe(true);
    expect(hasSourceFile(`/${first}`, REPO_ROOT)).toBe(true);
    expect(sourceFileInfo(first, REPO_ROOT)).toEqual(sources!.files[first]);
    expect(hasSourceFile("scripts/anime-art/not-a-published-master.png", REPO_ROOT)).toBe(false);
    expect(isSourcePath("scripts/anime-art/editable/x.svg")).toBe(false);
    expect(isSourcePath("scripts/anime-art/contract.json")).toBe(false);
    expect(isSourcePath("public/assets/x.png")).toBe(false);
    expect(isSourcePath("generated-session-art/x.png")).toBe(true);
    expect((SOURCE_EXTENSIONS as readonly string[]).includes("svg")).toBe(false);
    // Bytes are optional: null on a checkout that never pulled the masters.
    const local = localSourcePath(first, REPO_ROOT);
    expect(local === null || local.endsWith(first.split("/").at(-1)!)).toBe(true);
  });

  it("agrees with the scripts/lib twin (roots, extensions, object prefix)", async () => {
    const twinPath = join(REPO_ROOT, "scripts/lib/media-manifest.mjs");
    const twin = (await import(/* @vite-ignore */ `file:///${twinPath.replaceAll("\\", "/")}`)) as {
      SOURCE_ROOTS: string[];
      SOURCE_EXTENSIONS: string[];
      FAMILIES: { sources: { objectPrefix: string; manifestFile: string; roots: string[] } };
      objectKeyFor: (family: unknown, key: string, md5: string) => string;
    };
    expect(twin.SOURCE_ROOTS).toEqual([...SOURCE_ROOTS]);
    expect(twin.SOURCE_EXTENSIONS).toEqual([...SOURCE_EXTENSIONS]);
    expect(twin.FAMILIES.sources.manifestFile).toBe(SOURCES_MANIFEST_FILE);
    const [first] = Object.keys(sources!.files);
    expect(twin.objectKeyFor(twin.FAMILIES.sources, first, sources!.files[first].md5)).toBe(
      `sources/${contentAddressedKey(first, sources!.files[first].md5)}`
    );
  });
});
