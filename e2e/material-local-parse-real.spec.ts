import { expect, test } from "@playwright/test";
import path from "node:path";

test("真实 AI Agent 笔记 DOCX 在本地快速进入模型提取", async ({ page }, testInfo) => {
  test.skip(
    process.env.RUN_LOCAL_PARSE_DIAGNOSIS !== "1" ||
      testInfo.project.name !== "desktop-edge",
    "仅在定位用户真实 DOCX 解析性能时运行。",
  );
  test.setTimeout(240_000);

  let firstRequestAt = 0;
  await page.route("**/api/agents", async (route) => {
    firstRequestAt ||= Date.now();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "解析计时到此结束。",
          errorId: "00000000-0000-4000-8000-000000000001",
        },
      }),
    });
  });

  await page.goto("/");
  const startedAt = Date.now();
  await page
    .locator("#workspace-upload")
    .setInputFiles(path.join(process.cwd(), "测试文件", "AI Agent笔记.docx"));
  await expect.poll(() => firstRequestAt, { timeout: 180_000 }).toBeGreaterThan(0);
  const elapsedMs = firstRequestAt - startedAt;
  console.log(`LOCAL_PARSE_RESULT ${JSON.stringify({ elapsedMs })}`);
  expect(elapsedMs).toBeLessThan(10_000);
});
