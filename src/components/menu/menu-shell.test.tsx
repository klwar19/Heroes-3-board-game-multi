// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuShell } from "./menu-shell";
import { UI_ART_SLOTS } from "@/data/ui-art";
import { useBackgroundMusic } from "@/lib/music";
import { playLibrarySound } from "@/lib/sound";

vi.mock("@/lib/music", () => ({
  useBackgroundMusic: vi.fn()
}));

vi.mock("@/lib/sound", () => ({
  playLibrarySound: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.mocked(useBackgroundMusic).mockClear();
  vi.mocked(playLibrarySound).mockClear();
});

describe("MenuShell", () => {
  it("renders the backdrop from the art-slot registry, the title and children", () => {
    const { container } = render(
      <MenuShell backdrop="lobby-backdrop" title="Main Menu">
        <p>panel body</p>
      </MenuShell>
    );

    const backdrop = container.querySelector<HTMLImageElement>(".menuShellBackdrop");
    expect(backdrop).toBeTruthy();
    // The slot registry, not a hardcoded path, decides the artwork.
    expect(backdrop?.getAttribute("src")).toBe(UI_ART_SLOTS["lobby-backdrop"].src);
    expect(screen.getByRole("heading", { name: "Main Menu" })).toBeTruthy();
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("requests the menu music scene", () => {
    render(
      <MenuShell>
        <p>content</p>
      </MenuShell>
    );
    expect(useBackgroundMusic).toHaveBeenCalledWith("menu");
  });

  it("panel={false} renders children bare and as='div' avoids a nested main landmark", () => {
    const { container } = render(
      <MenuShell as="div" panel={false}>
        <main className="lobbyRoot">embedded page</main>
      </MenuShell>
    );

    expect(container.querySelector(".menuShellPanel")).toBeNull();
    // Exactly one <main> — the embedded page's own landmark.
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByText("embedded page")).toBeTruthy();
  });

  it("renders the footer line when provided", () => {
    render(
      <MenuShell footer={<span>Playing as Binh</span>}>
        <p>content</p>
      </MenuShell>
    );
    expect(screen.getByText("Playing as Binh")).toBeTruthy();
  });

  it("plays the button click sound when a menu nav button is clicked (and not otherwise)", () => {
    render(
      <MenuShell>
        <button className="menuNavButton" type="button">
          <span className="menuNavLabel">Multiplayer</span>
        </button>
        <button className="somethingElse" type="button">
          Plain
        </button>
      </MenuShell>
    );

    // Clicking a nested label inside the nav button still resolves via closest().
    fireEvent.click(screen.getByText("Multiplayer"));
    expect(playLibrarySound).toHaveBeenCalledWith("ui/button", expect.any(Number));

    // CONTROL: a click that is not on a menu nav button plays nothing.
    vi.mocked(playLibrarySound).mockClear();
    fireEvent.click(screen.getByText("Plain"));
    expect(playLibrarySound).not.toHaveBeenCalled();
  });
});
