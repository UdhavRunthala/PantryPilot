import { test, expect, type Page } from "@playwright/test";
import { catalog, recipes } from "../src/lib/catalog";
import { defaults, today } from "../src/lib/domain";
const origin = "http://127.0.0.1:3000";
const password = "My-test-kitchen-password-27!";
async function api(page: Page, data: unknown) {
  const r = await page.request.post("/api/state", {
    headers: { origin },
    data,
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r;
}
async function account(page: Page) {
  const email = `kitchen-${crypto.randomUUID()}@example.test`;
  const res = await page.request.post("/api/auth", {
    headers: { origin },
    data: { action: "signup", email, password, name: "Sam" },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await api(page, {
    action: "preferences",
    value: { ...defaults, name: "Sam", onboarded: true },
  });
  return email;
}
test("signup, onboarding, grocery editing, sign-out and login preserve real data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  const email = `student-${crypto.randomUUID()}@example.test`;
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  for (let n = 0; n < 5; n++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText(`Step ${n + 2} of 6 · About two minutes`),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Let’s stock your kitchen" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/kitchen");
  await expect(page.getByText("A fresh start for your kitchen")).toBeVisible();
  await expect(page.getByText(/local demo/i)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add groceries", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ingredient", { exact: true }).fill("Tomato");
  await dialog.getByLabel("Quantity", { exact: true }).fill("777");
  await dialog.getByRole("button", { name: "Save grocery" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText("777", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Quantity", { exact: true })
    .fill("650");
  await page.getByRole("button", { name: "Save grocery" }).click();
  await expect(page.getByText("650", { exact: false })).toBeVisible();
  await page.goto("/profile");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/kitchen");
  await expect(page.getByText("650", { exact: false })).toBeVisible();
});
test("real planner reserves groceries, confirms cooking once, and logs eaten separately", async ({
  page,
}) => {
  await account(page);
  for (const i of catalog)
    await api(page, {
      action: "inventory",
      value: {
        id: crypto.randomUUID(),
        ingredient_id: i.id,
        quantity: i.unit === "pieces" ? 6 : 500,
        unit: i.unit,
        purchase_date: today(),
        expiry_date: null,
        date_type: "estimated",
        storage: "Pantry",
        minimum: 10,
        spoiled: false,
      },
    });
  await page.goto("/meal-planner");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page
    .getByRole("button", { name: "Generate my meals", exact: true })
    .first()
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
  await expect(
    page.getByText("3 planned · 1 prepared · 1 eaten"),
  ).toBeVisible();
});
test("shopping suggestions transfer purchased stock and plans persist per date", async ({
  page,
}) => {
  await account(page);
  await api(page, {
    action: "inventory",
    value: {
      id: crypto.randomUUID(),
      ingredient_id: "oats",
      quantity: 20,
      unit: "g",
      purchase_date: today(),
      expiry_date: null,
      date_type: "estimated",
      storage: "Pantry",
      minimum: 50,
      spoiled: false,
    },
  });
  await page.goto("/shopping-list");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.getByRole("button", { name: "Suggest essentials" }).click();
  await page
    .getByRole("checkbox", { name: "Mark Oats (dry) purchased" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Mark Oats (dry) purchased" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "To kitchen" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Mark Oats (dry) purchased" }),
  ).toHaveCount(0);
  const state = await (await page.request.get("/api/state")).json();
  expect(
    state.inventory
      .filter((i: { ingredient_id: string }) => i.ingredient_id === "oats")
      .reduce((n: number, i: { quantity: number }) => n + i.quantity, 0),
  ).toBe(100);
  await api(page, {
    action: "plan",
    date: "2027-01-10",
    entries: [
      {
        id: crypto.randomUUID(),
        slot: "Lunch",
        servings: 1,
        recipe: recipes[0],
        prepared: false,
        eaten: false,
      },
    ],
  });
  await page.goto("/meal-planner");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.getByLabel("Planning for").fill("2027-01-10");
  await expect(
    page.getByText("1 planned · 0 prepared · 0 eaten"),
  ).toBeVisible();
  await page.getByLabel("Planning for").fill("2027-01-11");
  await expect(
    page.getByText("0 planned · 0 prepared · 0 eaten"),
  ).toBeVisible();
  await page.getByLabel("Planning for").fill("2027-01-10");
  await expect(
    page.getByText("1 planned · 0 prepared · 0 eaten"),
  ).toBeVisible();
});
test("protects all pages and rejects forged requests; login layout fits the device", async ({
  page,
}, info) => {
  for (const path of [
    "/dashboard",
    "/kitchen",
    "/meal-planner",
    "/shopping-list",
    "/profile",
    "/onboarding",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  expect((await page.request.get("/api/state")).status()).toBe(401);
  expect(
    (await page.request.post("/api/recipes", { headers: { origin } })).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post("/api/state", {
        headers: { origin: "https://untrusted.example" },
        data: { action: "signout" },
      })
    ).status(),
  ).toBe(403);
  await page.getByLabel("Email address").fill("unknown@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".auth-error")).toContainText("incorrect");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: `test-results/login-${info.project.name}.png`,
    fullPage: true,
  });
});
test("deleting an account removes its data and ends the session", async ({
  page,
}) => {
  const email = await account(page);
  await page.goto("/profile");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/state")).status()).toBe(401);
  const r = await page.request.post("/api/auth", {
    headers: { origin },
    data: { action: "login", email, password },
  });
  expect(r.status()).toBe(401);
});
