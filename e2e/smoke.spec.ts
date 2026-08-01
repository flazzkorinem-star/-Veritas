import { expect, test } from "@playwright/test";

test("桌面与移动端均能打开 Veritas 基础页面", async ({ page }) => {
  const response = await page.goto("/");

  await expect(page.getByRole("heading", { name: "Veritas" })).toBeVisible();
  await expect(page).toHaveTitle("Veritas");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});
