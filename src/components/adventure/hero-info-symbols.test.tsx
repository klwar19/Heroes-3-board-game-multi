// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { createAdventureLobbyState } from "@/engine";
import { abilitySymbolIcon } from "@/data/assets/homm-assets";
afterEach(cleanup);
function openHeroInfo(heroName: RegExp) {
  const state = createAdventureLobbyState({ seed: "ui-hero-info" });
  render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
  fireEvent.click(screen.getByTitle(new RegExp(`${heroName.source}: specialty`)));
  return screen.getByRole("dialog", { name: "Hero details" });
}
function imgSrcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
}
describe("Hero info board", () => {
  it("keeps the old statistics and the labelled icon rows", () => {
    const dialog = openHeroInfo(/Tamika/);
    expect(within(dialog).getByText("Ability")).toBeTruthy();
    expect(within(dialog).getByText("Speciality")).toBeTruthy();
    expect(within(dialog).getByText("Dread Knights")).toBeTruthy();
    const video = dialog.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/ui/hero-info/tavern.mp4");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    const stats = within(dialog).getByLabelText("Starting statistics");
    for (const stat of ["Attack", "Defense", "Power", "Knowledge"]) {
      expect(within(stats).getByRole("button", { name: new RegExp("^" + stat + " [0-9]+$") })).toBeTruthy();
    }
  });
  it("shows the actual starting ability emblem", () => {
    const dialog = openHeroInfo(/Tamika/);
    expect(imgSrcs(dialog)).toContain(abilitySymbolIcon("ability.offense"));
  });
  it("shows all three specialty icons", () => {
    const dialog = openHeroInfo(/Tamika/);
    for (const level of [1, 4, 6]) expect(imgSrcs(dialog)).toContain(`/assets/hero_specialties-tamika-${level}.webp`);
  });
  it("shows native specialty art for heroes without scans", () => {
    expect(imgSrcs(openHeroInfo(/Moandor/))).toContain("/assets/units-lich-portrait.webp");
  });
});
