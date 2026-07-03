import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomic-file";

describe("writeFileAtomic", () => {
  const dirs: string[] = [];
  const freshDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "homm3bg-atomic-"));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  it("writes new files (creating parent directories) and overwrites in place", () => {
    const dir = freshDir();
    const target = join(dir, "nested", "store.json");

    writeFileAtomic(target, JSON.stringify({ version: 1 }));
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ version: 1 });

    writeFileAtomic(target, JSON.stringify({ version: 2 }));
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ version: 2 });
  });

  it("leaves no temp files behind, and none that a *.json directory scan would pick up", () => {
    const dir = freshDir();
    writeFileAtomic(join(dir, "room-a.json"), "{}");
    writeFileAtomic(join(dir, "room-b.json"), "{}");

    const files = readdirSync(dir).sort();
    expect(files).toEqual(["room-a.json", "room-b.json"]);
  });

  it("throws (rather than truncating the target) when the destination rename cannot succeed", () => {
    const dir = freshDir();
    const target = join(dir, "store.json");
    writeFileAtomic(target, "original");

    // A rename onto a path whose parent is a FILE (not a directory) must fail…
    const bogus = join(target, "impossible.json");
    expect(() => writeFileAtomic(bogus, "junk")).toThrow();
    // …while the existing file is untouched and no temp orphan remains.
    expect(readFileSync(target, "utf8")).toBe("original");
    expect(readdirSync(dir)).toEqual(["store.json"]);
    expect(existsSync(bogus)).toBe(false);
  });
});
