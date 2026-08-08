// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
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

  it("floats the gold wordmark from the registry above the panel when logo is set", () => {
    const { container } = render(
      <MenuShell logo title="Main Menu">
        <p>content</p>
      </MenuShell>
    );
    const logo = container.querySelector<HTMLImageElement>(".menuGameLogo");
    expect(logo).toBeTruthy();
    // The wordmark comes from the art-slot registry, not a hardcoded path.
    expect(logo?.getAttribute("src")).toBe(UI_ART_SLOTS["game-logo"].src);
  });

  it("omits the wordmark by default (CONTROL)", () => {
    const { container } = render(
      <MenuShell title="Main Menu">
        <p>content</p>
      </MenuShell>
    );
    expect(container.querySelector(".menuGameLogo")).toBeNull();
  });

  it("drops the panel box (bare) when frameless is set, and keeps it otherwise (CONTROL)", () => {
    const { container: bare } = render(
      <MenuShell frameless title="Main Menu">
        <p>content</p>
      </MenuShell>
    );
    expect(bare.querySelector(".menuShellPanel")?.classList.contains("bare")).toBe(true);

    const { container: framed } = render(
      <MenuShell title="Main Menu">
        <p>content</p>
      </MenuShell>
    );
    expect(framed.querySelector(".menuShellPanel")?.classList.contains("bare")).toBe(false);
  });

  it("mounts the ambient dragon-breath layer only when dragonBreath is set (CONTROL)", () => {
    const { container: withBreath } = render(
      <MenuShell dragonBreath logo frameless>
        <p>content</p>
      </MenuShell>
    );
    const layer = withBreath.querySelector(".menuDragonBreath");
    expect(layer).toBeTruthy();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.querySelector(".menuDragonBreathPlume")).toBeTruthy();
    expect(layer?.querySelectorAll(".menuDragonBreathRage").length).toBe(3);
    expect(layer?.querySelector(".menuDragonBreathRage1")).toBeTruthy();
    expect(layer?.querySelector(".menuDragonBreathShimmer")).toBeTruthy();
    expect(layer?.querySelector(".menuDragonBreathImpact")).toBeTruthy();
    expect(layer?.querySelector(".menuDragonGroundBurn")).toBeTruthy();
    expect(layer?.querySelector(".menuDragonBreathEmbers")).toBeTruthy();
    expect(layer?.querySelectorAll(".menuDragonSpark").length).toBe(20);
    expect(layer?.querySelectorAll(".menuDragonGroundEmber").length).toBe(12);
    // No border/frame chrome from the old approach.
    expect(withBreath.querySelector(".menuFlameFrame")).toBeNull();

    const { container: plain } = render(
      <MenuShell logo frameless>
        <p>content</p>
      </MenuShell>
    );
    expect(plain.querySelector(".menuDragonBreath")).toBeNull();
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

/**
 * A narrow viewport must never DOWNLOAD a multi-MB `videoBackdrop`. Hiding the
 * element with CSS is not enough — a `display: none` <video> with
 * `preload="auto"` still fetches the whole file — so the ELEMENT must not be
 * mounted, exactly like the setup-scene playlist's phone gate. The still
 * `.menuShellBackdrop` img stays, so the screen is never a blank hole.
 */
describe("MenuShell — a narrow viewport never loads the backdrop video", () => {
  const LOOP = "/assets/ui/menu/loop.mp4";
  const STILL = "/assets/ui/menu/still.webp";

  /** matchMedia stub whose `change` listeners this test can fire by hand. */
  function stubWidth(narrow: boolean) {
    const listeners = new Set<() => void>();
    const state = { narrow };
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        get matches() {
          return query.includes("max-width: 820px") ? state.narrow : !state.narrow;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
      }))
    );
    return {
      /** Cross the breakpoint the way a resize/rotation does. */
      resizeTo(nextNarrow: boolean) {
        state.narrow = nextNarrow;
        act(() => {
          for (const fn of listeners) fn();
        });
      },
      get listenerCount() {
        return listeners.size;
      }
    };
  }

  const shell = () => (
    <MenuShell videoBackdrop={LOOP} videoFallback={STILL}>
      <p>menu</p>
    </MenuShell>
  );

  afterEach(() => vi.unstubAllGlobals());

  it("mounts NO video at all on a narrow viewport, and keeps the still art", () => {
    stubWidth(true);
    const { container } = render(shell());

    expect(container.querySelector("video")).toBeNull();
    // Not merely hidden or src-less: nothing in the DOM references the loop, so
    // no request for it can be made.
    expect(container.innerHTML).not.toContain("loop.mp4");

    // The backdrop still paints — the fallback still is the visible layer.
    const still = container.querySelector("img.menuShellBackdrop");
    expect(still).not.toBeNull();
    expect(still?.getAttribute("src")).toContain("still.webp");
  });

  it("CONTROL: a wide viewport mounts the loop exactly as before", () => {
    stubWidth(false);
    const { container } = render(shell());

    const video = container.querySelector("video.menuShellBackdropVideo");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toContain("loop.mp4");
    expect(video?.getAttribute("poster")).toContain("still.webp");
  });

  it("the SERVER frame carries no video, so a phone cannot start the download before hydration", () => {
    // The preload scanner acts on the HTML, ahead of React. A server frame
    // cannot know the viewport, so it must not emit the <video> at all.
    const html = renderToStaticMarkup(shell());
    expect(html).not.toContain("<video");
    expect(html).not.toContain("loop.mp4");
    // The still is in that very first frame, so the backdrop is never blank.
    expect(html).toContain("still.webp");
  });

  it("crossing the breakpoint mid-session mounts and unmounts the loop", () => {
    const media = stubWidth(true);
    const { container } = render(shell());
    expect(container.querySelector("video")).toBeNull();

    media.resizeTo(false);
    expect(container.querySelector("video")).not.toBeNull();

    media.resizeTo(true);
    expect(container.querySelector("video")).toBeNull();
  });

  it("unsubscribes the media listener on unmount", () => {
    const media = stubWidth(false);
    const { unmount } = render(shell());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });

  it("keeps the loop where matchMedia is unavailable (assume a wide viewport)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { container } = render(shell());
    expect(container.querySelector("video.menuShellBackdropVideo")).not.toBeNull();
  });

  it("CONTROL: a shell with no videoBackdrop is untouched on either viewport", () => {
    // Every other menu screen uses the still-art slot path; the gate must not
    // add or remove anything there.
    stubWidth(true);
    const narrow = render(
      <MenuShell>
        <p>menu</p>
      </MenuShell>
    );
    expect(narrow.container.querySelector("video")).toBeNull();
    expect(narrow.container.querySelector("img.menuShellBackdrop")).not.toBeNull();
    cleanup();

    stubWidth(false);
    const wide = render(
      <MenuShell>
        <p>menu</p>
      </MenuShell>
    );
    expect(wide.container.querySelector("video")).toBeNull();
    expect(wide.container.querySelector("img.menuShellBackdrop")).not.toBeNull();
  });
});
