import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { describeCardEffect } from "./effects";

/**
 * Audit of the "then draw a card" abilities and artifacts: the rules engine
 * already performs the draw (covered by the combat reducer tests), so these
 * cases pin the *tooltip* — the popover/zoom text must mention the draw so the
 * card reads exactly as printed.
 */
describe("draw-effect tooltips read as printed", () => {
  // Offense / Armorer add a combat stat AND draw a card in both basic and
  // expert; the auto-description must keep the draw.
  it("Offense: +attack then draw", () => {
    const text = describeCardEffect(cardLibrary["ability.offense"]);
    expect(text).toContain("+1 attack");
    expect(text).toContain("expert +2");
    expect(text).toContain("then draw 1");
  });

  it("Armorer: +defense then draw", () => {
    const text = describeCardEffect(cardLibrary["ability.armorer"]);
    expect(text).toContain("+1 defense");
    expect(text).toContain("expert +2");
    expect(text).toContain("then draw 1");
  });

  // Sorcery adds Power AND draws a card in both modes.
  it("Sorcery: +power then draw", () => {
    const text = describeCardEffect(cardLibrary["ability.sorcery"]);
    expect(text).toContain("+1 power");
    expect(text).toContain("expert +2");
    expect(text).toContain("then draw 1");
  });

  // Leadership only draws on the expert side — already described correctly.
  it("Leadership: morale, expert also draws", () => {
    const text = describeCardEffect(cardLibrary["ability.leadership"]);
    expect(text).toContain("gain 1 morale");
    expect(text).toContain("expert also draws 2");
  });

  // CHOOSE_ONE artifacts surface the draw through their option labels.
  it("Armor of Wonder: both options name the draw", () => {
    const text = describeCardEffect(cardLibrary["artifact.armor_of_wonder"]);
    expect(text).toContain("Draw 1 card and +1 attack");
    expect(text).toContain("Draw 1 card and +1 defense");
  });

  it("Tunic of the Cyclops King: draw + power option", () => {
    const text = describeCardEffect(cardLibrary["artifact.tunic_of_the_cyclops_king"]);
    expect(text).toContain("Draw 1 card and +1 Power");
  });
});
