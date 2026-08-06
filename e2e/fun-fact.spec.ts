import { test, expect } from "@playwright/test";

/**
 * FunFact was demoted off the deal dashboard (portfolio story is evidence,
 * not AI toys). Route still exists for optional use; assert it stays mockable.
 */
test("fun-fact API still answers under MOCK_AI without being on the deal page", async ({
  page,
  request,
}) => {
  await page.goto("/deal/honda/2022/civic?quote=24500");
  await expect(page.getByTestId("fun-fact-reveal")).toHaveCount(0);

  const res = await request.post("/api/fun-fact", {
    data: { make: "Honda", year: 2022, model: "Civic" },
  });
  expect(res.status()).toBe(200);
});
