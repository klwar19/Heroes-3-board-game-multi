import { expect, test } from "@playwright/test";

/**
 * Table reactions (emotes) end-to-end across TWO real clients sharing one room:
 * the reaction bar appears only once a second player is present, and a reaction
 * one client sends shows up as a floating bubble on the OTHER client — the full
 * synced round-trip through the room server, not just a local render.
 */
test("a reaction from one client shows as a bubble on the other", async ({ browser }) => {
  test.setTimeout(60000);
  const roomId = `e2e-react-${Date.now().toString(36)}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto(`/?room=${roomId}`);
    await expect(pageA.locator(".setupHubBox--mode")).toBeVisible({ timeout: 20000 });

    // Second client joins the same room — now the table is multiplayer.
    await pageB.goto(`/?room=${roomId}`);
    await expect(pageB.locator(".setupHubBox--mode")).toBeVisible({ timeout: 20000 });

    // The reaction bar surfaces on both clients once two members are present.
    const toggleA = pageA.getByRole("button", { name: /send a table reaction/i });
    const toggleB = pageB.getByRole("button", { name: /send a table reaction/i });
    await expect(toggleA).toBeVisible({ timeout: 20000 });
    await expect(toggleB).toBeVisible({ timeout: 20000 });

    // Client A opens the palette and sends "Amazed" (By the gods!).
    await toggleA.click();
    await pageA.getByRole("menuitem", { name: /amazed/i }).click();

    // Client B receives it as a floating bubble over the table.
    await expect(pageB.locator(".reactionBubble")).toContainText("By the gods!", { timeout: 15000 });

    // And the sender sees their own reaction too.
    await expect(pageA.locator(".reactionBubble")).toContainText("By the gods!", { timeout: 15000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
