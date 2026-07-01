/**
 * ============================================================================
 *  CLAUDE.md rule #3 enforcement: no undeclared decorative ability text.
 * ============================================================================
 *
 * Every unit side (few / pack / neutral, every faction, the WoG neutrals, the
 * expansion rosters) must satisfy, for ALL of coreUnitDefinitions:
 *
 *  1. Every id in `abilities` resolves to a unitAbilities definition that is
 *     implementationStatus: "implemented". A typo'd id, or a tag pasted before
 *     its engine effect exists, fails here.
 *  2. A side whose `abilityText` describes an effect while `abilities` is
 *     empty must be consciously declared — either in DISPLAY_ONLY_ABILITIES
 *     (a stub: the engine does NOT run it) or in ENGINE_RULE_WIRED_ABILITY_TEXT
 *     (implemented as a dedicated engine rule keyed off the unit, with the
 *     wiring + covering test named in the value).
 *  3. Registry hygiene: every registry key points at a real side; a
 *     display-only entry for a side with no text is meaningless; an
 *     ENGINE_RULE_WIRED entry for a side that now carries wired tags (or lost
 *     its text) is stale; no side may appear in both registries.
 *
 * This is the enforcement test CLAUDE.md section 3 called for. It makes new
 * decorative text fail CI until it is a conscious, reviewable declaration.
 * NOTE the deliberate limit (rule #1a still applies): this test proves text is
 * DECLARED, wired-or-stub — it cannot prove a wired ability BEHAVES correctly.
 * Behaviour stays pinned by the per-mechanic tests.
 *
 * The Creature Bank side-space (CREATURE_BANK_UNIT_SIDES) has the same
 * invariant enforced in src/data/map/creature-banks.test.ts.
 */
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  DISPLAY_ONLY_ABILITIES,
  ENGINE_RULE_WIRED_ABILITY_TEXT,
  unitAbilities
} from "@/data/units/abilities";

const SIDES = ["few", "pack", "neutral"] as const;

type SideKey = `${string}#${(typeof SIDES)[number]}`;

/** Every existing "<unitDefId>#<side>" with its side definition. */
function allSides(): Map<SideKey, { abilities: string[]; abilityText?: string }> {
  const sides = new Map<SideKey, { abilities: string[]; abilityText?: string }>();
  for (const def of Object.values(coreUnitDefinitions)) {
    for (const side of SIDES) {
      const sideDef = def[side];
      if (sideDef) {
        sides.set(`${def.id}#${side}`, sideDef);
      }
    }
  }
  return sides;
}

describe("ability-text enforcement (CLAUDE.md rule #3)", () => {
  it("resolves every abilities tag on every side to an implemented engine ability", () => {
    for (const [key, side] of allSides()) {
      for (const tag of side.abilities) {
        const ability = unitAbilities[tag];
        expect(ability, `${key}: ability tag "${tag}" must exist in unitAbilities`).toBeTruthy();
        expect(
          ability?.implementationStatus,
          `${key}: ability tag "${tag}" must be implemented — a not-implemented tag on a card is a stub`
        ).toBe("implemented");
      }
    }
  });

  it("never leaves effect-describing abilityText undeclared when nothing is wired", () => {
    for (const [key, side] of allSides()) {
      const hasText = Boolean(side.abilityText?.trim());
      const hasWired = side.abilities.length > 0;
      if (hasText && !hasWired) {
        const declared = key in DISPLAY_ONLY_ABILITIES || key in ENGINE_RULE_WIRED_ABILITY_TEXT;
        expect(
          declared,
          `${key}: abilityText with no wired ability must be declared in DISPLAY_ONLY_ABILITIES ` +
            `(a conscious stub) or ENGINE_RULE_WIRED_ABILITY_TEXT (wired as a dedicated rule): ` +
            `"${side.abilityText}"`
        ).toBe(true);
      }
    }
  });

  it("keeps both registries honest: real sides, no stale or contradictory entries", () => {
    const sides = allSides();
    for (const key of Object.keys(DISPLAY_ONLY_ABILITIES)) {
      const side = sides.get(key as SideKey);
      expect(side, `DISPLAY_ONLY_ABILITIES["${key}"] must reference an existing unit side`).toBeTruthy();
      expect(
        Boolean(side?.abilityText?.trim()),
        `DISPLAY_ONLY_ABILITIES["${key}"]: a side with no printed text cannot be display-only`
      ).toBe(true);
      expect(
        key in ENGINE_RULE_WIRED_ABILITY_TEXT,
        `"${key}" cannot be both display-only and engine-rule-wired`
      ).toBe(false);
    }
    for (const key of Object.keys(ENGINE_RULE_WIRED_ABILITY_TEXT)) {
      const side = sides.get(key as SideKey);
      expect(side, `ENGINE_RULE_WIRED_ABILITY_TEXT["${key}"] must reference an existing unit side`).toBeTruthy();
      expect(
        Boolean(side?.abilityText?.trim()),
        `ENGINE_RULE_WIRED_ABILITY_TEXT["${key}"]: the side no longer prints any text — stale entry`
      ).toBe(true);
      expect(
        side?.abilities,
        `ENGINE_RULE_WIRED_ABILITY_TEXT["${key}"]: the side now carries wired ability tags — stale entry`
      ).toEqual([]);
      // The whole point of this registry: the entry must say where the rule
      // runs AND which test pins it, so "wired elsewhere" is verifiable.
      expect(
        ENGINE_RULE_WIRED_ABILITY_TEXT[key],
        `ENGINE_RULE_WIRED_ABILITY_TEXT["${key}"] must name the covering test`
      ).toMatch(/\.test\.ts/);
    }
  });

  it("keeps the one current engine-rule-wired declaration exact (mutation control)", () => {
    // Exactly the Skeleton guard today. If this list grows or shrinks, the
    // change must be a conscious edit here alongside the registry.
    expect(Object.keys(ENGINE_RULE_WIRED_ABILITY_TEXT).sort()).toEqual(["neutral.skeletons#neutral"]);
    expect(Object.keys(DISPLAY_ONLY_ABILITIES)).toHaveLength(0);
  });
});
