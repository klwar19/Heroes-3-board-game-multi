// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuShell } from "./menu-shell";
import { UI_ART_SLOTS } from "@/data/ui-art";
import { useBackgroundMusic } from "@/lib/music";

vi.mock("@/lib/music", () => ({
  useBackgroundMusic: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.mocked(useBackgroundMusic).mockClear();
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
});
