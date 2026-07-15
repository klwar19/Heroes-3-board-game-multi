// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneTabBar, type PhoneTab } from "./phone-tab-bar";

afterEach(cleanup);

const TABS: PhoneTab[] = [
  { id: "map", label: "Map" },
  { id: "hand", label: "Hand", badge: 4, attention: true, attentionLabel: "Draw!" },
  { id: "menu", label: "Menu" }
];

describe("PhoneTabBar", () => {
  it("renders every tab, marks the active one, and reports clicks", () => {
    const onSelect = vi.fn();
    render(<PhoneTabBar active="map" onSelect={onSelect} tabs={TABS} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Map", "Hand4Draw!", "Menu"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(screen.getByRole("tab", { name: /hand/i }));
    expect(onSelect).toHaveBeenCalledWith("hand");
  });

  it("shows badge and attention chip only where provided", () => {
    render(<PhoneTabBar active="map" onSelect={vi.fn()} tabs={TABS} />);
    const hand = screen.getByRole("tab", { name: /hand/i });
    expect(hand.querySelector(".phoneTabBadge")?.textContent).toBe("4");
    expect(hand.querySelector(".phoneTabAttention")?.textContent).toBe("Draw!");
    expect(hand.className).toContain("attention");

    const map = screen.getByRole("tab", { name: /map/i });
    expect(map.querySelector(".phoneTabBadge")).toBeNull();
    expect(map.querySelector(".phoneTabAttention")).toBeNull();
    expect(map.className).not.toContain("attention");
  });

  it("a zero badge still renders (an empty hand is information, not nothing)", () => {
    render(
      <PhoneTabBar active="hand" onSelect={vi.fn()} tabs={[{ id: "hand", label: "Hand", badge: 0 }]} />
    );
    expect(screen.getByRole("tab", { name: /hand/i }).querySelector(".phoneTabBadge")?.textContent).toBe("0");
  });
});
