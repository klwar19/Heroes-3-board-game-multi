import { expect, test } from "@playwright/test";

/**
 * The active "Astrologers Proclaim" card pops into the player's face at the
 * start of the round-2 (first Astrologers) turn, carries its real card art, and
 * is dismissible. Drives a live room through the lobby and the first round.
 */
test("the active Astrologers proclamation pops up on the round-2 turn", async ({ page }) => {
  const roomId = `e2e-astro-${Date.now().toString(36)}`;
  await page.goto(`/?room=${roomId}`);

  // --- Lobby: seat two players and start ----------------------------------
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: /Catherine/ }).click();
  await expect(page.getByText("Castle — Catherine", { exact: false })).toBeVisible();

  await page.getByTitle("Sit as Player 2").click();
  await page.getByRole("button", { name: /Sandro/ }).click();
  await expect(page.getByText("Necropolis — Sandro", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "New Game" }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 20000 });

  // Dismiss the one-time "who goes first" ceremony (it auto-plays, then offers
  // "Begin the adventure" and blocks the board until acknowledged).
  const begin = page.getByRole("button", { name: /Begin the adventure/ });
  await expect(begin).toBeVisible({ timeout: 15000 });
  await begin.click();
  await expect(begin).toHaveCount(0);

  const proclamation = page.locator(".astrologersProclaimBackdrop");
  const seats = [/Sit as Catherine/, /Sit as Sandro/];

  // The starting player is decided by a die roll, so end whichever seat is
  // active each time. Two ended turns complete round 1; round 2 is the first
  // Astrologers round and raises the proclamation after the sunrise.
  let popped = false;
  for (let guard = 0; guard < 6 && !popped; guard += 1) {
    for (const seat of seats) {
      if (await proclamation.isVisible().catch(() => false)) {
        popped = true;
        break;
      }
      // Best-effort turn driving: the round-2 state (and the proclamation that
      // intercepts clicks) syncs in asynchronously, so swallow interception
      // errors here and let the assertion below be the real check.
      await page.getByTitle(seat).click({ timeout: 4000 }).catch(() => {});

      // Turn 1 opens with the forced free home-tile rotation (BINH rule) —
      // nothing else is legal for this seat until it is confirmed.
      const rotate = page.locator(".rotateFloat");
      if (await rotate.isVisible().catch(() => false)) {
        const confirm = rotate.getByRole("button", { name: /Confirm/ });
        for (let turn = 0; turn < 6 && !(await confirm.isEnabled().catch(() => false)); turn += 1) {
          await rotate.getByTitle("Rotate clockwise").click({ timeout: 4000 }).catch(() => {});
        }
        await confirm.click({ timeout: 4000 }).catch(() => {});
        await rotate.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
      }

      // Resolve the start-of-turn hand refresh if this seat is the active one.
      const draw = page.getByRole("button", { name: /Draw new/ });
      if (await draw.isVisible().catch(() => false)) {
        await draw.click({ timeout: 4000 }).catch(() => {});
      }

      const end = page.getByRole("button", { name: /^End turn$/ });
      if (await end.isVisible().catch(() => false)) {
        await end.click({ timeout: 4000 }).catch(() => {});
        break;
      }
    }
  }

  // The proclamation is in the player's face, shows the card scan, and closes.
  await expect(proclamation).toBeVisible({ timeout: 15000 });
  await expect(proclamation.locator(".astrologersProclaimArt")).toBeVisible();
  await proclamation.getByRole("button", { name: /Understood/ }).click();
  await expect(proclamation).toHaveCount(0);
});
