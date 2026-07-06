import { test, expect } from "@playwright/test";

test("dashboard renders primary insight surfaces in browser fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Insight Board" })).toBeVisible();
  await expect(page.getByText("Paired trials first")).toBeVisible();
  await expect(page.getByText("Evidence guardrails")).toBeVisible();
  await expect(page.getByText("Ask with deterministic evidence")).toBeVisible();
  await expect(page.locator(".native-chart-bar").first()).toBeVisible();
});
