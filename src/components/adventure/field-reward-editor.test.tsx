// @vitest-environment jsdom
/**
 * FieldRewardEditor pure helpers + special-reward surface.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

afterEach(cleanup);
import {
  FieldRewardEditor,
  nextFieldReward,
  nextFieldRewardFlag,
  nextFieldRewardMorale
} from "./field-reward-editor";

describe("nextFieldReward helpers", () => {
  it("folds amounts and drops empties", () => {
    expect(nextFieldReward(undefined, "gold", 3)).toEqual({ gold: 3 });
    expect(nextFieldReward({ gold: 3 }, "gold", 0)).toBeUndefined();
    expect(nextFieldReward({ gold: 3 }, "experience", 2)).toEqual({ gold: 3, experience: 2 });
  });

  it("toggles Ability Empower token and Statistic empower flags", () => {
    expect(nextFieldRewardFlag(undefined, "abilityEmpowerToken", true)).toEqual({
      abilityEmpowerToken: true
    });
    expect(nextFieldRewardFlag({ abilityEmpowerToken: true }, "abilityEmpowerToken", false)).toBeUndefined();
    expect(nextFieldRewardFlag({ gold: 1 }, "empowerStatistic", true)).toEqual({
      gold: 1,
      empowerStatistic: true
    });
  });

  it("sets morale ±1 or clears it", () => {
    expect(nextFieldRewardMorale(undefined, 1)).toEqual({ morale: 1 });
    expect(nextFieldRewardMorale({ morale: 1 }, -1)).toEqual({ morale: -1 });
    expect(nextFieldRewardMorale({ morale: -1 }, 0)).toBeUndefined();
  });
});

describe("FieldRewardEditor special rewards UI", () => {
  it("renders special controls and dispatches flag/morale changes", () => {
    const onChange = vi.fn();
    render(
      <FieldRewardEditor
        ariaLabel="Test reward"
        onChange={onChange}
        reward={undefined}
        showVp={false}
      />
    );

    expect(screen.getByText("Special rewards")).toBeTruthy();
    expect(screen.getByLabelText("Test reward Ability Empower token")).toBeTruthy();
    expect(screen.getByLabelText("Test reward Empower a Statistic")).toBeTruthy();
    expect(screen.getByLabelText("Test reward morale")).toBeTruthy();
    expect(screen.getByLabelText("Test reward experience")).toBeTruthy();
    expect(screen.getByLabelText("Test reward movement")).toBeTruthy();
    expect(screen.getByLabelText("Test reward Resource dice")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Test reward Ability Empower token"));
    expect(onChange).toHaveBeenCalledWith({ abilityEmpowerToken: true });

    onChange.mockClear();
    fireEvent.change(screen.getByLabelText("Test reward morale"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith({ morale: 1 });
  });

  it("summarises a mixed special package", () => {
    render(
      <FieldRewardEditor
        ariaLabel="Summary"
        onChange={() => {}}
        reward={{
          gold: 2,
          morale: 1,
          abilityEmpowerToken: true,
          empowerStatistic: true,
          experience: 1
        }}
        showVp={false}
      />
    );
    const summary = screen.getByText(/2 gold/);
    expect(summary.textContent).toContain("+1 morale");
    expect(summary.textContent).toContain("Ability Empower token");
    expect(summary.textContent).toContain("Empower a Statistic");
    expect(summary.textContent).toContain("+1 experience");
  });
});
