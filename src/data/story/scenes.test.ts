import { hasMediaFile } from "@/lib/media-manifest";
import { describe, expect, it } from "vitest";
import {
  getStoryScene,
  isStoryScene,
  listStoryScenes,
  referencedStoryAssets,
  STORY_ART_PLACEHOLDERS,
  STORY_SCENE_IDS,
  storySceneRegistry,
  storyAssetIsPlaceholder,
  storySpeakerName,
  type StoryScene
} from "./scenes";

// Published in media-manifest.json (binary media is not on disk in git — docs/media-manifest.md).
const onDisk = (assetPath: string) => hasMediaFile(assetPath);

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

describe("story scene registry", () => {
  it("has unique ids that resolve, mirrored by STORY_SCENE_IDS", () => {
    const ids = listStoryScenes().map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...STORY_SCENE_IDS].sort()).toEqual([...Object.keys(storySceneRegistry)].sort());
    for (const id of STORY_SCENE_IDS) {
      expect(getStoryScene(id)?.id, id).toBe(id);
      expect(isStoryScene(id)).toBe(true);
    }
    expect(isStoryScene("story.does.not.exist")).toBe(false);
  });

  it("ships both themed demo scenes and at least one choice that chains via nextSceneId", () => {
    const themes = new Set(listStoryScenes().map((scene) => scene.theme));
    expect(themes.has("xianxia")).toBe(true);
    expect(themes.has("isekai")).toBe(true);

    const chaining = listStoryScenes().flatMap((scene) => scene.choices ?? []).filter((c) => c.nextSceneId);
    expect(chaining.length, "a demo choice must continue into a follow-up scene").toBeGreaterThan(0);
  });

  it("every choice's nextSceneId resolves in the registry", () => {
    for (const scene of listStoryScenes()) {
      for (const choice of scene.choices ?? []) {
        if (choice.nextSceneId !== undefined) {
          expect(isStoryScene(choice.nextSceneId), `${scene.id} → ${choice.nextSceneId}`).toBe(true);
        }
      }
    }
  });

  it("is bilingual by construction — non-empty EN AND VI on every line, speaker and choice", () => {
    for (const scene of listStoryScenes()) {
      expect(scene.lines.length, `${scene.id} has lines`).toBeGreaterThan(0);
      for (const line of scene.lines) {
        expect(nonEmpty(line.text.en), `${scene.id} line.en`).toBe(true);
        expect(nonEmpty(line.text.vi), `${scene.id} line.vi`).toBe(true);
        if (line.speaker !== "narrator") {
          expect(nonEmpty(line.speaker.en), `${scene.id} speaker.en`).toBe(true);
          expect(nonEmpty(line.speaker.vi), `${scene.id} speaker.vi`).toBe(true);
        }
      }
      for (const choice of scene.choices ?? []) {
        expect(nonEmpty(choice.text.en), `${scene.id} choice.en`).toBe(true);
        expect(nonEmpty(choice.text.vi), `${scene.id} choice.vi`).toBe(true);
      }
    }
  });

  it("storySpeakerName resolves per language and treats narrator as unnamed", () => {
    const named = listStoryScenes()
      .flatMap((scene) => scene.lines)
      .map((line) => line.speaker)
      .find((speaker) => speaker !== "narrator")!;
    expect(storySpeakerName(named, "en")).toBe((named as { en: string }).en);
    expect(storySpeakerName(named, "vi")).toBe((named as { vi: string }).vi);
    expect(storySpeakerName("narrator", "en")).toBeNull();
  });

  it("every referenced sprite/background is on disk OR a declared placeholder (never a silent missing asset)", () => {
    const referenced = referencedStoryAssets();
    expect(referenced.length, "the demo scenes reference art").toBeGreaterThan(0);
    for (const asset of referenced) {
      const declared = STORY_ART_PLACEHOLDERS.has(asset);
      if (onDisk(asset)) {
        // Art shipped → it must NOT still be declared a placeholder.
        expect(declared, `${asset} is on disk but still declared a placeholder`).toBe(false);
      } else {
        // No file yet → it MUST be declared (so the overlay uses a fallback).
        expect(declared, `${asset} is not published (npm run media:publish) and is not a declared placeholder`).toBe(true);
      }
      // The runtime helper and the disk truth must agree.
      expect(storyAssetIsPlaceholder(asset)).toBe(!onDisk(asset) || declared);
    }
  });

  it("the placeholder registry names only real, referenced, on-disk-LESS assets", () => {
    // 2026-07: all referenced story art ships on disk, so the registry is
    // legitimately EMPTY — the loop still guards any future declaration.
    const referenced = new Set(referencedStoryAssets());
    for (const asset of STORY_ART_PLACEHOLDERS) {
      expect(referenced.has(asset), `placeholder "${asset}" is referenced by no scene`).toBe(true);
      expect(onDisk(asset), `placeholder "${asset}" actually has a file — remove it from the registry`).toBe(false);
    }
  });
});

// Type-only exercise so a shape regression is a compile error too.
const _typecheck: StoryScene = {
  id: "x",
  lines: [{ speaker: "narrator", text: { en: "a", vi: "b" } }]
};
void _typecheck;
