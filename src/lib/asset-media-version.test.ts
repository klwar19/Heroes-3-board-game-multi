import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { computeMediaVersion } from "./asset-media-version";

const tempRoots: string[] = [];

function makeMediaRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "media-version-"));
  tempRoots.push(root);
  mkdirSync(join(root, "public/assets/ui"), { recursive: true });
  mkdirSync(join(root, "public/sounds"), { recursive: true });
  writeFileSync(join(root, "public/assets/ui/a.webp"), "aaaa");
  writeFileSync(join(root, "public/sounds/click.mp3"), "bb");
  return root;
}

afterEach(() => {
  while (tempRoots.length) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("computeMediaVersion", () => {
  it("is deterministic for the same tree and changes when a file's size changes", () => {
    const root = makeMediaRoot();
    const v1 = computeMediaVersion(root);
    expect(v1).toMatch(/^[0-9a-f]{10}$/);
    expect(computeMediaVersion(root)).toBe(v1);

    // Replace a file with different-size content — the version MUST move
    // (this is what busts the CDN edge cache on the next deploy).
    writeFileSync(join(root, "public/assets/ui/a.webp"), "aaaaaa");
    const v2 = computeMediaVersion(root);
    expect(v2).not.toBe(v1);

    // Adding a new file moves it too.
    writeFileSync(join(root, "public/assets/ui/b.webp"), "c");
    expect(computeMediaVersion(root)).not.toBe(v2);
  });

  it("returns '' for a tree with no media (CI without assets stays unversioned)", () => {
    const empty = mkdtempSync(join(tmpdir(), "media-version-"));
    tempRoots.push(empty);
    expect(computeMediaVersion(empty)).toBe("");
  });

  it("computes a version for the REAL repo media tree (the production build path)", () => {
    // The real public/ tree exists in this repo; the build must always get a
    // non-empty version so CDN URLs are versioned.
    expect(computeMediaVersion()).toMatch(/^[0-9a-f]{10}$/);
  });
});
