import { expect, type Page, test } from "@playwright/test";

/**
 * Real-browser round trip for the lobby "Custom win condition" section — on the
 * MATCH tab, directly beside the "Win condition" (victory mode) selector. The
 * jsdom test (game-options-tabs.test.tsx) pins only the DISPATCH; this proves
 * the observable effect end to end: clicking Add travels React →
 * SET_GAME_OPTIONS → the server store reducer (setGameOptions) → broadcast →
 * re-render, the editable row (kind select + value + remove) actually appears,
 * an edit persists across a full page reload (server state, not local React
 * state), and Remove clears it again.
 */

const roomId = `e2e-cwc-${Date.now().toString(36)}`;

async function openMatchOptions(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 30000 });
  await page.getByRole("tab", { name: "Game options" }).click();
  await page.getByRole("tab", { name: "Match" }).click();
}

test("lobby Custom win condition: add, edit, survive a reload, and remove — all through the server", async ({
  page
}) => {
  await page.goto(`/?room=${roomId}`);
  await openMatchOptions(page);

  // The section renders on the Match tab, beside the Win condition selector.
  await expect(page.getByText("Win condition", { exact: true })).toBeVisible();
  const group = page.getByRole("group", { name: "Custom win conditions" });
  await expect(group).toBeVisible();

  // Add → the server stores the default condition and the row renders back
  // EDITABLE (the observable effect, not just the dispatch).
  await group.getByRole("button", { name: "Add win condition" }).click();
  const kind = page.getByLabel("Custom win condition 1 kind");
  await expect(kind).toBeVisible({ timeout: 15000 });
  await expect(kind).toHaveValue("control-towns");

  // Retype to a gold threshold and raise the amount — both are round-tripped
  // (the inputs are controlled by the server-broadcast lobby options).
  await kind.selectOption("gold");
  const value = page.getByLabel("Custom win condition 1 value");
  await expect(value).toBeVisible({ timeout: 15000 });
  await value.fill("120");
  await expect(value).toHaveValue("120", { timeout: 15000 });

  // A full reload rebuilds the page from the ROOM's state alone: the condition
  // must still be there (it lives in lobby.options on the server, not in
  // local component state).
  await page.reload();
  await openMatchOptions(page);
  await expect(page.getByLabel("Custom win condition 1 kind")).toHaveValue("gold", { timeout: 15000 });
  await expect(page.getByLabel("Custom win condition 1 value")).toHaveValue("120");

  // Remove → the row disappears again (shrunk list round-tripped).
  await page.getByRole("button", { name: "Remove custom win condition 1" }).click();
  await expect(page.getByLabel("Custom win condition 1 kind")).toHaveCount(0, { timeout: 15000 });
});
