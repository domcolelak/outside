import { expect, test } from "@playwright/test";

/**
 * The FAQ and its assistant, in a real browser.
 *
 * The unit tests prove the assistant cannot invent an answer and cannot be
 * argued out of its language. None of that is visible to someone who cannot
 * open the panel, cannot get out of it with a keyboard, or finds it spilling
 * off a phone screen — so those are what this covers, in Slovak, because a
 * dialog that opens in the wrong language is its own failure.
 */
test.describe("the support assistant", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.request.post("/api/locale", { data: { locale: "sk" } });
    await page.goto("/");
  });

  test("opens from the page, in the reader's language", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Opýtať sa OUTSIDE" });
    await expect(trigger).toBeVisible();

    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("OUTSIDE asistent");

    // The question field takes focus, so someone can start typing immediately
    // rather than hunting for it.
    await expect(page.getByPlaceholder("Opýtajte sa na OUTSIDE…")).toBeFocused();
  });

  test("keeps the keyboard inside the dialog and gives it back on Escape", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Opýtať sa OUTSIDE" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Tab through more controls than the dialog holds. If focus escaped, one of
    // these lands on the page behind and the assertion below fails.
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press("Tab");
      const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus left the dialog after ${press + 1} tabs`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // Focus returns to what opened it, not to the top of the document.
    await expect(trigger).toBeFocused();
  });

  test("answers from reviewed content, in the reader's language", async ({ page }) => {
    await page.getByRole("button", { name: "Opýtať sa OUTSIDE" }).click();
    await page.getByPlaceholder("Opýtajte sa na OUTSIDE…").fill("Ako funguje overenie domény?");
    await page.getByRole("button", { name: "Odoslať" }).click();

    // The reply is read from the reviewed catalogue, so it is assertable text
    // rather than whatever a model felt like saying.
    const log = page.getByRole("log");
    await expect(log).toContainText("Overenie", { timeout: 20_000 });
    const answer = await log.innerText();
    expect(answer, "the assistant answered in English").not.toContain("Verification proves");
  });

  test("fits a phone screen without spilling sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Opýtať sa OUTSIDE" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the open assistant scrolls the page sideways").toBeLessThanOrEqual(1);

    // The dialog itself must be reachable, not clipped off the viewport edge.
    const box = await page.getByRole("dialog").boundingBox();
    expect(box, "the dialog has no layout box").toBeTruthy();
    expect(box!.x, "the dialog starts off-screen").toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, "the dialog runs past the right edge").toBeLessThanOrEqual(391);
  });

  test("shows the FAQ itself, and every entry opens", async ({ page }) => {
    await page.goto("/#faq");
    const entries = page.locator("#faq details");
    const count = await entries.count();
    expect(count, "the FAQ rendered no entries").toBeGreaterThan(2);

    for (let index = 0; index < count; index += 1) {
      const entry = entries.nth(index);
      // The first entry ships open, so clicking blindly would close it and the
      // assertion below would be testing the opposite of what it says.
      const alreadyOpen = await entry.evaluate((el) => (el as HTMLDetailsElement).open);
      if (!alreadyOpen) await entry.locator("summary").click();
      await expect(entry).toHaveAttribute("open", "");
      // An entry that opens to nothing is worse than one that does not open.
      expect((await entry.innerText()).trim().length).toBeGreaterThan(40);
    }
  });
});
