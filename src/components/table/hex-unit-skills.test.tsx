// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState, type GameAction, type GameState, type LegalAction } from "@/engine";
import { HexCommandBar } from "./hex-battlefield";
import { hexUnitSkills, type HexUnitSkill } from "./hex-unit-skills";

afterEach(cleanup);

/** hexUnitSkills only reads `state.combat` (an aimed shot's ability name). */
const hexState = { combat: { id: "combat_1", geometry: "hex", units: {} } } as unknown as GameState;

const legal = (action: GameAction, label: string = action.type): LegalAction => ({ label, action });

const bolt = (playerId: string, targetUnitId: string): GameAction => ({
  type: "USE_UNIT_ABILITY",
  playerId,
  unitId: "fd",
  abilityId: "faerie-dragon-spell",
  target: { type: "unit", unitId: targetUnitId }
});

describe("hexUnitSkills (the hex command bar's Unit Skills menu)", () => {
  it("groups one skill's per-target offers into ONE entry aimed on the board, ignoring other players' offers", () => {
    const skills = hexUnitSkills(
      hexState,
      [legal(bolt("p1", "e1"), "Faerie Bolt: Skeletons"), legal(bolt("p1", "e2")), legal(bolt("p2", "e3"))],
      "p1"
    );
    expect(skills).toHaveLength(1);
    const [skill] = skills;
    expect(skill.name).toBe("Faerie Bolt");
    expect(skill.category).toBe("strike");
    expect(skill.immediate).toBeUndefined();
    expect([...skill.unitTargets.keys()]).toEqual(["e1", "e2"]);
    // The dispatched action is the engine's own offer for that target.
    expect(skill.unitTargets.get("e2")).toEqual(bolt("p1", "e2"));
  });

  it("fires a lone untargeted offer at once; several ambiguous ones are left to the command dock", () => {
    const heal = (unitId: string): GameAction => ({
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId,
      abilityId: "mgq-undine-heal-1",
      target: { type: "none" }
    });
    const lone = hexUnitSkills(hexState, [legal(heal("u1"))], "p1");
    expect(lone).toHaveLength(1);
    expect(lone[0].immediate).toEqual(heal("u1"));
    expect(lone[0].category).toBe("heal");
    // Two untargeted offers of the same skill cannot be told apart: no entry.
    expect(hexUnitSkills(hexState, [legal(heal("u1")), legal(heal("u1"))], "p1")).toEqual([]);
  });

  it("aims a Magog / Lich shot (ATTACK_HEX) and a Pit Lord summon at hexes", () => {
    const skills = hexUnitSkills(
      hexState,
      [
        legal({ type: "ATTACK_HEX", playerId: "p1", attackerId: "magog", position: 40 }),
        legal({ type: "ATTACK_HEX", playerId: "p1", attackerId: "magog", position: 41 }),
        legal({ type: "SUMMON_DEMONS", playerId: "p1", unitId: "pit", mode: "summon", position: 12 }),
        legal({ type: "SUMMON_DEMONS", playerId: "p1", unitId: "pit", mode: "reinforce", targetUnitId: "demons" })
      ],
      "p1"
    );
    const area = skills.find((skill) => skill.key === "area|magog");
    expect(area?.category).toBe("area");
    expect([...(area?.cellTargets.keys() ?? [])]).toEqual([40, 41]);
    expect(skills.find((skill) => skill.key === "summon|pit|summon")?.cellTargets.get(12)).toMatchObject({ position: 12 });
    expect(skills.find((skill) => skill.key === "summon|pit|reinforce")?.unitTargets.has("demons")).toBe(true);
  });
});

describe("HexCommandBar Unit Skills menu", () => {
  const skill = (action: GameAction, immediate = false): HexUnitSkill => ({
    key: "ability|fd|faerie-dragon-spell|",
    unitId: "fd",
    name: "Faerie Bolt",
    detail: "Faerie Bolt: Skeletons",
    category: "strike",
    ...(immediate ? { immediate: action } : {}),
    unitTargets: immediate ? new Map() : new Map([["e1", action]]),
    cellTargets: new Map()
  });

  function withActive(state: GameState, activeUnitId: string): GameState {
    return { ...state, combat: { ...state.combat!, activeUnitId } };
  }

  function renderBar(state: GameState, skills: HexUnitSkill[], onAction = vi.fn(), onArmSkill = vi.fn()) {
    return (
      <HexCommandBar
        legalActions={[]}
        onAction={onAction}
        onArmSkill={onArmSkill}
        skills={skills}
        state={state}
        viewerPlayerId="p1"
      />
    );
  }

  it("arms a targeted skill from the menu, and fires an untargeted one straight away", () => {
    const state = withActive(createInitialGameState("hex-skill-menu-arm"), "unit_p1_crusaders");
    const onAction = vi.fn();
    const onArmSkill = vi.fn();
    const { container, rerender } = render(renderBar(state, [skill(bolt("p1", "e1"))], onAction, onArmSkill));
    fireEvent.click(container.querySelector(".hexBarButton.skills")!);
    fireEvent.click(container.querySelector(".hexSkillMenu button")!);
    expect(onArmSkill).toHaveBeenLastCalledWith("ability|fd|faerie-dragon-spell|");
    expect(onAction).not.toHaveBeenCalled();

    rerender(renderBar(state, [skill(bolt("p1", "e1"), true)], onAction, onArmSkill));
    fireEvent.click(container.querySelector(".hexBarButton.skills")!);
    fireEvent.click(container.querySelector(".hexSkillMenu button")!);
    expect(onAction).toHaveBeenCalledWith(bolt("p1", "e1"));
    expect(onArmSkill).toHaveBeenLastCalledWith(null);
  });

  it("names each menu item by its skill; the engine's one-offer label is only its description", () => {
    const state = withActive(createInitialGameState("hex-skill-menu-a11y"), "unit_p1_crusaders");
    const { container, getByRole } = render(renderBar(state, [skill(bolt("p1", "e1"))]));
    fireEvent.click(container.querySelector(".hexBarButton.skills")!);
    const item = getByRole("menuitem", { name: "Faerie Bolt" });
    expect(item.getAttribute("title")).toBe("Faerie Bolt: Skeletons");
  });

  it("an open menu never pops open by itself for a later activation that has skills again", () => {
    const base = createInitialGameState("hex-skill-menu-stale");
    const skills = [skill(bolt("p1", "e1"))];
    const { container, rerender } = render(renderBar(withActive(base, "unit_p1_crusaders"), skills));
    fireEvent.click(container.querySelector(".hexBarButton.skills")!);
    expect(container.querySelector(".hexSkillMenu"), "CONTROL: the click opens the menu").not.toBeNull();

    // The enemy acts (no skill of yours), then another of your creatures does.
    rerender(renderBar(withActive(base, "unit_p2_skeletons"), []));
    expect(container.querySelector(".hexSkillMenu")).toBeNull();
    rerender(renderBar(withActive(base, "unit_p1_marksmen"), skills));
    expect(container.querySelector(".hexSkillMenu")).toBeNull();
    expect(container.querySelector(".hexBarButton.skills")?.getAttribute("aria-expanded")).toBe("false");

    // It opens again on request.
    fireEvent.click(container.querySelector(".hexBarButton.skills")!);
    expect(container.querySelector(".hexSkillMenu")).not.toBeNull();
  });
});
