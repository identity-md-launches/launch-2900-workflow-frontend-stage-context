import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupMock, A } from "./mock-chain";
test("automated accessibility scan covers every primary view and the wallet sheet", async ({
  page,
}) => {
  await setupMock(page);
  await page.goto("");
  await expect(
    page.getByText("Identity checks passed", { exact: true }),
  ).toBeVisible();
  for (const id of ["singles", "planner", "board", "trade", "merge"]) {
    await page.goto(`#${id}`);
    await expect(page.locator("h1")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations,
      `${id}: ${result.violations.map((v) => v.id).join(", ")}`,
    ).toEqual([]);
  }
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  const modal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(modal.violations).toEqual([]);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeFocused();
});
test("text enlargement, long addresses, keyboard focus and reduced motion reflow", async ({
  page,
}) => {
  await setupMock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("");
  await expect(
    page.getByText("Identity checks passed", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Wallet address", exact: true })
    .fill(A);
  await page
    .getByRole("button", { name: "Find my singles", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Holdings by level" }),
  ).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const animations = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  );
  expect(animations).toBe(0);
});
