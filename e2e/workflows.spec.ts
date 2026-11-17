import { test, expect } from "@playwright/test";
test("demo grocery CRUD persists and supports shopping purchases", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hey Alex/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Add groceries", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ingredient", { exact: true }).fill("Tomato");
  await dialog.getByLabel("Quantity", { exact: true }).fill("777");
  const box = await dialog.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole("button", { name: "Save grocery" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  if (
    await page
      .getByRole("button", { name: "My Kitchen", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "My Kitchen", exact: true }).click();
  else await page.getByRole("button", { name: "Kitchen", exact: true }).click();
  await expect(page.getByText("777", { exact: false })).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Shopping List", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Shopping List", exact: true })
      .click();
  else
    await page.getByRole("button", { name: "Shopping", exact: true }).click();
  await page.getByRole("button", { name: "Suggest essentials" }).click();
  await expect(page.getByText("Oats (dry)", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Mark Oats (dry) purchased" })
    .check();
  await page.getByRole("button", { name: "To kitchen" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Mark Oats (dry) purchased" }),
  ).toHaveCount(0);
});
test("plan, confirm cooking once, log eaten separately, and retain the plan", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Generate my meals", exact: true })
    .click();
  await expect(
    page.getByText("3 planned · 0 prepared · 0 eaten"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cooked it" }).first().click();
  await page
    .getByRole("button", { name: "Confirm cooking & update stock" })
    .click();
  await expect(
    page.getByText("3 planned · 1 prepared · 0 eaten"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log as eaten", exact: true }).click();
  await expect(
    page.getByText("3 planned · 1 prepared · 1 eaten"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Eaten", { exact: true }).first()).toBeVisible();
});
test("onboarding saves an empty, personalized kitchen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Clear demo and start" }).click();
  await page.getByLabel("Your first name").fill("Sam");
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Let’s stock your kitchen" }).click();
  await expect(page.getByRole("heading", { name: /Hey Sam/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Hey Sam/ })).toBeVisible();
});
test("does not overflow narrow screens and renders a usable dashboard", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hey Alex/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
});
