import { test, expect } from "@playwright/test";

test("dashboard renders primary insight surfaces in browser fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Insight Board" })).toBeVisible();
  await expect(page.getByText("Paired trials first")).toBeVisible();
  await expect(page.getByText("Evidence guardrails")).toBeVisible();
  await expect(page.getByText("Ask with deterministic evidence")).toBeVisible();
  await expect(page.locator(".native-chart-bar").first()).toBeVisible();
});

test("sidebar navigation renders distinct workspaces and settings state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Portland State University" })).toBeVisible();

  await page.getByRole("button", { name: "Species Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Species insights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deterministic species summary" })).toBeVisible();

  await page.getByRole("button", { name: "Treatment Comparator" }).click();
  await expect(page.getByRole("heading", { name: "Treatment success" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paired trials first" })).toBeVisible();

  await page.getByRole("button", { name: "Trial Queue" }).click();
  await expect(page.getByRole("heading", { name: "Trial Queue", exact: true })).toBeVisible();
  await expect(page.getByText("ND rows and follow-ups")).toBeVisible();

  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByRole("heading", { name: "Ask", exact: true })).toBeVisible();
  await expect(page.getByLabel("Question")).not.toHaveAttribute("readonly");
  await expect(page.getByRole("button", { name: "Ask OpenAI" })).toBeDisabled();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("OpenAI API key")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});
