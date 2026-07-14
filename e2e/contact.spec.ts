import { test, expect } from "@playwright/test";

const CONTACT_URL = "/contact?vehicle=2022%20Honda%20Civic";

test("lead form validates and submits", async ({ page }) => {
  await page.goto(CONTACT_URL);
  await expect(page.getByRole("heading", { name: /contact the dealer/i })).toBeVisible();

  // The message field is pre-filled with the vehicle context.
  await expect(page.getByLabel(/message/i)).toHaveValue(/2022 Honda Civic/);

  await page.getByLabel("Name").fill("Alex Shopper");
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByRole("button", { name: /contact dealer/i }).click();

  await expect(page.getByRole("status")).toContainText(/message sent/i);
  await expect(page.getByRole("status")).toContainText(/alex@example.com/);
  // Honest demo note: no dealer backend exists.
  await expect(page.getByRole("status")).toContainText(/no dealer was contacted/i);
});

test("server-side validation echoes values back on error", async ({ page }) => {
  await page.goto(CONTACT_URL);
  await page.getByLabel("Name").fill("Alex Shopper");
  // Invalid email, forced past client validation via novalidate submit:
  // fill a value the browser accepts but the server rejects.
  await page.getByLabel("Email").fill("alex@nodot");
  await page.getByRole("button", { name: /contact dealer/i }).click();

  await expect(page.getByText(/that email doesn't look right/i)).toBeVisible();
  // A failed submit never eats input.
  await expect(page.getByLabel("Name")).toHaveValue("Alex Shopper");
});

test("the same form submits without JavaScript @no-js", async ({ page }) => {
  await page.goto(CONTACT_URL);
  await page.getByLabel("Name").fill("Alex Shopper");
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByRole("button", { name: /contact dealer/i }).click();
  await expect(page.getByRole("status")).toContainText(/message sent/i, {
    timeout: 15_000,
  });
});

test("the dashboard links into the contact page with vehicle context", async ({
  page,
}) => {
  await page.goto("/deal/honda/2022/civic?quote=24500");
  await page.getByRole("link", { name: /contact the dealer/i }).click();
  await expect(page).toHaveURL(/\/contact\?vehicle=2022(%20|\+)Honda(%20|\+)Civic/);
  await expect(page.getByText(/about the 2022 honda civic/i)).toBeVisible();
});
