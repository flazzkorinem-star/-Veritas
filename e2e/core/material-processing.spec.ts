import { expect, test, type Route } from "@playwright/test";

const delayedExtraction = {
  modules: [{ id: "module-1", title: "模块", sourceRange: "第 1 段" }],
  knowledgeItems: [
    {
      id: "item-1",
      moduleId: "module-1",
      title: "条目",
      summary: "摘要",
      kind: "CORE",
      diagnosticRationale: "值得诊断",
      sourceReferences: [{ label: "第 1 段", excerpt: "材料摘录" }],
      commonMisconceptions: [],
    },
  ],
};

async function delayAgent(route: Route) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  try {
    await route.fulfill({ json: { result: delayedExtraction }, status: 200 });
  } catch {
    // 浏览器取消请求后，测试路由无需再返回响应。
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/agents", delayAgent);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "从一份材料开始" })).toBeVisible();
});

test("模型请求进行中取消后立即进入可重试状态", async ({ page }, testInfo) => {
  await page.locator("#workspace-upload").setInputFiles({
    name: "cancel.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 取消测试\n\n这是一段学习材料。"),
  });
  await expect(page.getByText(/正在整理内容/)).toBeVisible();

  const startedAt = Date.now();
  await page.getByRole("button", { name: "取消处理" }).click();

  await expect(page.getByText("已取消处理这份材料。")).toBeVisible({
    timeout: 1_500,
  });
  expect(Date.now() - startedAt).toBeLessThan(1_500);
  await expect(page.getByRole("button", { name: "重新处理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消处理" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("processing-cancelled.png") });
});

test("处理中刷新后恢复为明确的中断状态", async ({ page }, testInfo) => {
  await page.locator("#workspace-upload").setInputFiles({
    name: "refresh.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 刷新测试\n\n这是一段学习材料。"),
  });
  await expect(page.getByText(/正在整理内容/)).toBeVisible();

  await page.reload();

  await expect(page.getByText("上次处理被中断，请重新处理。")).toBeVisible();
  if (testInfo.project.name === "mobile-edge") {
    await page.getByRole("button", { name: "打开主题" }).click();
    await expect(page.getByText("重新处理后显示主题")).toBeVisible();
  } else {
    await expect(page.getByText("重新处理后显示主题")).toBeHidden();
  }
  await expect(page.getByRole("button", { name: "取消处理" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("processing-interrupted.png") });
});
