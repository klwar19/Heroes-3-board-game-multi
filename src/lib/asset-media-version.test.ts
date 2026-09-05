import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { computeMediaVersion } from "./asset-media-version";
import { resetMediaManifestCache } from "./media-manifest";
import runtimeMap from "./media-keys.generated.json";

const tempRoots: string[] = [];

function writeManifest(root: string, files: Record<string, { md5: string; bytes: number }>): void {
  writeFileSync(
    join(root, "media-manifest.json"),
    JSON.stringify({ version: 1, cdn: "https://cdn.example", roots: ["assets", "sounds"], count: Object.keys(files).length, files })
  );
  resetMediaManifestCache();
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "media-version-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  resetMediaManifestCache();
  while (tempRoots.length) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("computeMediaVersion", () => {
  it("is deterministic for the same manifest and changes when a file's bytes change", () => {
    const root = makeRoot();
    writeManifest(root, {
      "assets/ui/a.webp": { md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bytes: 4 },
      "sounds/click.mp3": { md5: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", bytes: 2 }
    });
    const v1 = computeMediaVersion(root);
    expect(v1).toMatch(/^[0-9a-f]{10}$/);
    resetMediaManifestCache();
    expect(computeMediaVersion(root)).toBe(v1);

    // A replaced file has a new md5 — the version MUST move (this is what
    // busts the legacy fallback URLs on the next deploy).
    writeManifest(root, {
      "assets/ui/a.webp": { md5: "cccccccccccccccccccccccccccccccc", bytes: 4 },
      "sounds/click.mp3": { md5: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", bytes: 2 }
    });
    const v2 = computeMediaVersion(root);
    expect(v2).not.toBe(v1);

    // Adding a new file moves it too.
    writeManifest(root, {
      "assets/ui/a.webp": { md5: "cccccccccccccccccccccccccccccccc", bytes: 4 },
      "assets/ui/b.webp": { md5: "dddddddddddddddddddddddddddddddd", bytes: 1 },
      "sounds/click.mp3": { md5: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", bytes: 2 }
    });
    expect(computeMediaVersion(root)).not.toBe(v2);
  });

  it("returns '' with no manifest or an empty one (unit fixtures stay unversioned)", () => {
    const empty = makeRoot();
    expect(computeMediaVersion(empty)).toBe("");
    const blank = makeRoot();
    writeManifest(blank, {});
    expect(computeMediaVersion(blank)).toBe("");
  });

  it("computes the REAL repo's version and it matches the committed runtime map (lockstep)", () => {
    // The production build path: a non-empty version, identical to the one the
    // generated client map carries — both come from the same manifest, so a
    // stale media-keys.generated.json fails here.
    const version = computeMediaVersion();
    expect(version).toMatch(/^[0-9a-f]{10}$/);
    expect(runtimeMap.version).toBe(version);
  });
});
