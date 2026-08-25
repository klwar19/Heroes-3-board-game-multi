// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CoopPage from "./page";

vi.mock("@/components/table/ui-mode-prompt", () => ({ UiModePrompt: () => null }));
vi.mock("@/components/room-browser", () => ({
  RoomBrowser: (props: { tableMode?: string; labels: { title: string; backdrop: string } }) => (
    <div
      data-backdrop={props.labels.backdrop}
      data-table-mode={props.tableMode}
    >
      {props.labels.title}
    </div>
  )
}));

describe("/coop", () => {
  it("opens a distinct Co-op browser with its own generated backdrop", () => {
    render(<CoopPage />);
    const browser = screen.getByText("Co-op War Room");
    expect(browser.getAttribute("data-table-mode")).toBe("coop");
    expect(browser.getAttribute("data-backdrop")).toBe("coop-backdrop");
  });
});
